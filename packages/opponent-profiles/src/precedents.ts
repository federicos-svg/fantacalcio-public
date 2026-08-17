// PRECEDENTI D'ASTA — cosa un avversario ha già fatto che riguardi il
// giocatore chiamato. Puro, deterministico, senza DOM e senza rete.
//
// COSA CALCOLA, ED È TUTTO. Per ogni avversario, l'elenco dei fatti MISURATI
// sullo storico d'asta che sono pertinenti al giocatore ora sul tavolo. Un
// fatto qui è un gesto già compiuto, contabile riga per riga, con accanto la
// propria prova numerica e la propria numerosità (su quante stagioni).
//
// COSA NON CALCOLA, E NON DEVE CALCOLARE MAI. Nessuna inferenza psicologica,
// nessuna stima di quanto un avversario voglia un giocatore, nessuno score,
// indice, punteggio, classifica di intensità o previsione di comportamento.
// Non esiste — e non deve esistere — una funzione in questo file che
// restituisca «quanto lo vuole»: sarebbe uno score psicologico fittato, che
// docs/DECISIONS.md §D9 perimetro 3 vieta esplicitamente, e sarebbe fittato su
// otto persone reali e cinque stagioni, cioè su niente.
//
// La frase ammessa è «ha speso il 60% sui suoi tre più cari per quattro
// stagioni, l'ultima il 32%». La frase vietata è «è un big spender».
// La differenza non è di tono: la prima si può controllare, la seconda no.
//
// L'ORDINE DELLE VOCI NON È UNA CLASSIFICA DI INTENSITÀ. È l'ordine DICHIARATO
// dei TIPI di fatto (`PRECEDENT_FACT_IDS`, types.ts): chi ha un precedente
// sullo stesso giocatore chiamato viene prima di chi ne ha uno sul suo club,
// perché il primo tipo di fatto riguarda esattamente questo giocatore e il
// secondo no. A parità di tipo l'ordine è quello del posto a tavola, qualunque
// numero i due portino: mettere prima «il 60%» del «40%» sarebbe una
// graduatoria di quanto lo vogliono, cioè la cosa che questo file non fa.
//
// IL TIFO NON PUÒ FAR COMPARIRE NESSUNO, e la garanzia è strutturale e non
// procedurale: `supportedClub` non è un `PrecedentFact`, quindi non entra
// nella lista che decide chi compare e nell'ordinamento non esiste. Un
// avversario che tifa la squadra del giocatore chiamato ma non ci ha mai speso
// non ha `facts`, e senza `facts` la voce non viene proprio creata. È il caso
// che rende la garanzia necessaria: tifare una squadra e averci comprato il
// 3,6% e poi lo 0% dei propri crediti sono due fatti, e il secondo smentisce
// la lettura ingenua del primo.
//
// SOLO ACQUISTI ALL'ASTA, in ogni misura di spesa di questo file. Un rinnovo è
// un prezzo fissato dal regolamento su un giocatore che non si è mai lasciato:
// non è una scelta compiuta contro i rivali, ed è la stessa ragione per cui
// non conta come «ricomprato». I rinnovi esclusi restano contati e mostrati
// accanto al fatto che li esclude, così il numero più basso ha la sua
// spiegazione invece di sembrare un errore.
//
// DETERMINISMO: nessun `Date`, nessun `Intl`, nessuna iterazione su strutture
// non ordinate. Ogni elenco esce ordinato (stagioni crescenti, posti
// crescenti) e lo stesso input rende lo stesso output, sempre.

import { validateAuctionHistoryStore } from "./historySchema.js";
import { confirmedPrior } from "./profileView.js";
import {
  AUCTION_HISTORY_SCHEMA_VERSION,
  DEFAULT_PRECEDENT_THRESHOLDS,
  PRECEDENT_FACT_IDS,
  type CalledPlayer,
  type ClubConcentrationFact,
  type OpponentPrecedents,
  type OpponentProfile,
  type PastAuctionPurchase,
  type PrecedentFact,
  type PrecedentThresholds,
  type PrecedentsEmptyReason,
  type PrecedentsReading,
  type RepeatPurchaseFact,
  type SeasonPrice,
  type SeasonShare,
  type SupportedClubNote,
  type TopSpendFact,
} from "./types.js";

export interface PrecedentsInput {
  /** Il giocatore sul tavolo. `null` quando non ne è stato chiamato nessuno. */
  readonly called: CalledPlayer | null;
  /** Lo storico d'asta multi-stagione. Vuoto è un caso legittimo, non un errore. */
  readonly history: readonly PastAuctionPurchase[];
  /** posto -> persona, o `null` quando il posto è libero (forma del registro lega). */
  readonly seats: Readonly<Record<string, string | null>>;
  /** I profili d'intervista. Solo i campi CONFERMATI vengono letti. */
  readonly profiles: readonly OpponentProfile[];
  /** Il posto di Pico, escluso dall'esito: la domanda è cosa hanno fatto gli ALTRI. */
  readonly selfSeatId?: string;
  /** Override delle soglie pre-dichiarate: un input dichiarato di Pico, non una scelta del sistema. */
  readonly thresholds?: PrecedentThresholds;
}

// ---------------------------------------------------------------------------
// Normalizzazione e piccoli aiuti dichiarati
// ---------------------------------------------------------------------------

/**
 * Confronto fra etichette di club: NFKC, senza spazi ai bordi, minuscolo
 * italiano. Stessa regola di `identityPart()` in `src/leagueTeams.ts`,
 * rispecchiata e non importata — un pacchetto non dipende dalla radice
 * dell'app, e qui serve solo l'accordo sulla REGOLA, non sulla dichiarazione.
 *
 * «Inter» e « inter » sono lo stesso club; se un giorno servisse una
 * riconciliazione vera (alias, denominazioni storiche) è il layer privato a
 * doverla fare a monte, perché è lui ad avere le fonti.
 */
function clubKey(label: string): string {
  return label.normalize("NFKC").trim().toLocaleLowerCase("it");
}

/** Quota, con lo 0/0 dichiarato come 0 invece che come NaN travestito. */
function share(amount: number, total: number): number {
  if (total <= 0) return 0;
  const value = amount / total;
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Mediana di una lista di interi. Con `n` pari è la media dei due centrali,
 * arrotondata a intero per eccesso: si compete a crediti interi, e mezzo
 * credito non esiste al tavolo.
 */
export function medianPrice(prices: readonly number[]): number | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return Math.ceil(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

// ---------------------------------------------------------------------------
// Proiezioni dello storico
// ---------------------------------------------------------------------------

interface PersonHistory {
  /** Solo acquisti all'asta, per stagione crescente. */
  readonly auctionsBySeason: ReadonlyMap<string, readonly PastAuctionPurchase[]>;
  /** Tutte le stagioni in cui la persona ha comprato all'asta, crescenti. */
  readonly seasons: readonly string[];
  readonly auctions: readonly PastAuctionPurchase[];
  readonly renewals: readonly PastAuctionPurchase[];
}

function personHistories(
  history: readonly PastAuctionPurchase[],
): ReadonlyMap<string, PersonHistory> {
  const byPerson = new Map<string, PastAuctionPurchase[]>();
  for (const row of history) {
    const bucket = byPerson.get(row.personId);
    if (bucket === undefined) byPerson.set(row.personId, [row]);
    else bucket.push(row);
  }

  const out = new Map<string, PersonHistory>();
  for (const [personId, rows] of byPerson) {
    const auctions = rows
      .filter((r) => r.acquisition === "asta")
      .sort((a, b) => a.season.localeCompare(b.season) || a.playerId.localeCompare(b.playerId));
    const renewals = rows
      .filter((r) => r.acquisition === "riconferma")
      .sort((a, b) => a.season.localeCompare(b.season) || a.playerId.localeCompare(b.playerId));
    const auctionsBySeason = new Map<string, PastAuctionPurchase[]>();
    for (const row of auctions) {
      const bucket = auctionsBySeason.get(row.season);
      if (bucket === undefined) auctionsBySeason.set(row.season, [row]);
      else bucket.push(row);
    }
    out.set(personId, {
      auctions,
      renewals,
      auctionsBySeason,
      seasons: [...auctionsBySeason.keys()].sort(),
    });
  }
  return out;
}

/** Quota di spesa su un club, stagione per stagione. Mai una media sola. */
function clubShares(person: PersonHistory, club: string): readonly SeasonShare[] {
  const key = clubKey(club);
  return person.seasons.map((season) => {
    const rows = person.auctionsBySeason.get(season) ?? [];
    const total = rows.reduce((sum, r) => sum + r.price, 0);
    const amount = rows.reduce((sum, r) => (clubKey(r.club) === key ? sum + r.price : sum), 0);
    return { season, amount, total, share: share(amount, total) };
  });
}

/**
 * Quota di spesa sui propri `topPurchases` acquisti più cari, stagione per
 * stagione. A parità di prezzo l'ordine è per `playerId` crescente, così la
 * selezione dei «più cari» è totale e stabile: due esecuzioni sullo stesso
 * storico non possono scegliere due terzine diverse.
 */
function topShares(person: PersonHistory, topPurchases: number): readonly SeasonShare[] {
  return person.seasons.map((season) => {
    const rows = person.auctionsBySeason.get(season) ?? [];
    const total = rows.reduce((sum, r) => sum + r.price, 0);
    const amount = [...rows]
      .sort((a, b) => b.price - a.price || a.playerId.localeCompare(b.playerId))
      .slice(0, topPurchases)
      .reduce((sum, r) => sum + r.price, 0);
    return { season, amount, total, share: share(amount, total) };
  });
}

// ---------------------------------------------------------------------------
// I fatti
// ---------------------------------------------------------------------------

function repeatPurchaseFact(
  person: PersonHistory,
  called: CalledPlayer,
): RepeatPurchaseFact | null {
  const bought = person.auctions.filter((r) => r.playerId === called.playerId);
  if (bought.length === 0) return null;
  const prices: readonly SeasonPrice[] = bought.map((r) => ({ season: r.season, price: r.price }));
  return {
    id: "ricomprato",
    seasonsMeasured: person.seasons.length,
    seasons: person.seasons,
    auctionPurchases: bought.length,
    purchaseSeasons: bought.map((r) => r.season),
    prices,
    renewalsExcluded: person.renewals.filter((r) => r.playerId === called.playerId).length,
  };
}

function clubConcentrationFact(
  person: PersonHistory,
  called: CalledPlayer,
  threshold: number,
): ClubConcentrationFact | null {
  if (called.club.trim() === "") return null;
  const perSeason = clubShares(person, called.club);
  const latest = perSeason[perSeason.length - 1];
  if (latest === undefined) return null;
  const seasonsAtOrAbove = perSeason.filter((s) => s.share >= threshold).length;
  if (seasonsAtOrAbove === 0) return null;
  return {
    id: "club",
    seasonsMeasured: perSeason.length,
    seasons: perSeason.map((s) => s.season),
    club: called.club,
    perSeason,
    seasonsAtOrAbove,
    latest,
    threshold,
  };
}

function topSpendFact(
  person: PersonHistory,
  thresholds: PrecedentThresholds,
): TopSpendFact | null {
  const perSeason = topShares(person, thresholds.topPurchases);
  const latest = perSeason[perSeason.length - 1];
  if (latest === undefined) return null;
  const seasonsAtOrAbove = perSeason.filter((s) => s.share >= thresholds.topShare).length;
  if (seasonsAtOrAbove === 0) return null;
  return {
    id: "piu-cari",
    seasonsMeasured: perSeason.length,
    seasons: perSeason.map((s) => s.season),
    topPurchases: thresholds.topPurchases,
    perSeason,
    seasonsAtOrAbove,
    latest,
    threshold: thresholds.topShare,
  };
}

/**
 * Il giocatore chiamato è «caro»?
 *
 * MISURATO SULLO STORICO, non dedotto dalla quotazione del listone: la mediana
 * dei prezzi a cui QUESTO giocatore è stato aggiudicato all'asta nelle
 * stagioni passate, confrontata con una soglia dichiarata. È un fatto
 * misurato (i prezzi pagati) più aritmetica dichiarata (la mediana e la
 * soglia) — D9 ingredienti 1 e 3 — e nient'altro.
 *
 * Serve solo come PERTINENZA del fatto `piu-cari`: quanto una persona
 * concentra la spesa sui propri più cari riguarda il giocatore chiamato
 * soltanto se lui è, a sua volta, di quella fascia. Quando lo storico non sa
 * nulla di lui la pertinenza non è stabilita e il fatto non viene emesso —
 * mai emesso «per sicurezza».
 */
export function calledPlayerIsExpensive(
  history: readonly PastAuctionPurchase[],
  called: CalledPlayer,
  expensiveFrom: number,
): boolean {
  const prices = history
    .filter((r) => r.acquisition === "asta" && r.playerId === called.playerId)
    .map((r) => r.price);
  const median = medianPrice(prices);
  return median !== null && median >= expensiveFrom;
}

function supportedClubNote(
  profile: OpponentProfile | undefined,
  person: PersonHistory,
  called: CalledPlayer,
): SupportedClubNote | null {
  if (profile === undefined || called.club.trim() === "") return null;
  // Solo i campi CONFERMATI: una proposta dell'agente non è una dichiarazione
  // di Pico, e `confirmedPrior()` è l'unico modo supportato di leggere un
  // prior proprio perché il chiamante non possa confonderle.
  const prior = confirmedPrior(profile);
  const clubs = prior.affinityClubs ?? [];
  const key = clubKey(called.club);
  const match = clubs.find((c) => clubKey(c) === key);
  if (match === undefined) return null;
  const perSeason = clubShares(person, called.club);
  return {
    club: match,
    provenance: "intervista_dichiarata",
    perSeason,
    seasonsMeasured: perSeason.length,
    latest: perSeason[perSeason.length - 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// L'esito
// ---------------------------------------------------------------------------

const FACT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  PRECEDENT_FACT_IDS.map((id, index) => [id, index]),
);

function strongestFactRank(entry: OpponentPrecedents): number {
  return Math.min(...entry.facts.map((f) => FACT_ORDER[f.id] as number));
}

/**
 * I precedenti d'asta di ogni avversario sul giocatore chiamato.
 *
 * FAIL-CLOSED sull'ingresso, come `computeOpponentCounters()`: uno storico
 * strutturalmente rotto viene rifiutato con un'eccezione invece di produrre
 * conteggi silenziosamente sbagliati. Un precedente contato male è peggio di
 * un precedente assente, perché ha l'aria di un fatto.
 *
 * Un avversario compare SOLO se ha almeno un fatto misurato. «Nessun fatto»
 * non viene mai reso come una riga vuota né come un'assenza muta:
 * `emptyReason` dice quale dei tre silenzi è, e sono tre cose diverse —
 * nessun giocatore chiamato, nessuno storico, nessun fatto pertinente.
 */
export function auctionPrecedents(input: PrecedentsInput): PrecedentsReading {
  const thresholds = input.thresholds ?? DEFAULT_PRECEDENT_THRESHOLDS;
  const validated = validateAuctionHistoryStore({
    schemaVersion: AUCTION_HISTORY_SCHEMA_VERSION,
    purchases: input.history,
  });
  if (!validated.ok) {
    throw new Error(
      `auctionPrecedents: invalid history (${validated.issues.map((i) => `${i.path}:${i.code}`).join(", ")})`,
    );
  }

  const seasons = [...new Set(input.history.map((r) => r.season))].sort();
  const seatIds = Object.keys(input.seats)
    .filter((seatId) => seatId !== input.selfSeatId)
    .sort((a, b) => a.localeCompare(b));
  const seatsWithoutPerson = seatIds.filter((seatId) => (input.seats[seatId] ?? null) === null)
    .length;

  const empty = (reason: PrecedentsEmptyReason): PrecedentsReading => ({
    opponents: [],
    basis: "auction-history",
    seasons,
    seatsConsidered: seatIds.length,
    seatsWithoutPerson,
    thresholds,
    emptyReason: reason,
  });

  if (input.called === null) return empty("no-called-player");
  if (input.history.length === 0) return empty("no-history");

  const called = input.called;
  const histories = personHistories(input.history);
  const profileByPerson = new Map<string, OpponentProfile>();
  for (const profile of input.profiles) profileByPerson.set(profile.personId, profile);
  const expensive = calledPlayerIsExpensive(input.history, called, thresholds.expensiveFrom);

  const opponents: OpponentPrecedents[] = [];
  for (const fantaTeamId of seatIds) {
    const personId = input.seats[fantaTeamId] ?? null;
    if (personId === null) continue;
    const person = histories.get(personId);
    if (person === undefined) continue;

    const facts: PrecedentFact[] = [];
    const repeat = repeatPurchaseFact(person, called);
    if (repeat !== null) facts.push(repeat);
    const club = clubConcentrationFact(person, called, thresholds.clubShare);
    if (club !== null) facts.push(club);
    if (expensive) {
      const top = topSpendFact(person, thresholds);
      if (top !== null) facts.push(top);
    }
    // LA RIGA NASCE DAL FATTO MISURATO, MAI DAL TIFO. Senza `facts` non c'è
    // voce, e il tifo — che qui sotto verrebbe comunque calcolato — non ha
    // modo di crearne una: è questa riga a rendere impossibile la frase «lo
    // vuole perché è della sua squadra».
    if (facts.length === 0) continue;

    facts.sort((a, b) => (FACT_ORDER[a.id] as number) - (FACT_ORDER[b.id] as number));
    opponents.push({
      fantaTeamId,
      personId,
      facts,
      supportedClub: supportedClubNote(profileByPerson.get(personId), person, called),
    });
  }

  opponents.sort(
    (a, b) =>
      strongestFactRank(a) - strongestFactRank(b) || a.fantaTeamId.localeCompare(b.fantaTeamId),
  );

  return {
    opponents,
    basis: "auction-history",
    seasons,
    seatsConsidered: seatIds.length,
    seatsWithoutPerson,
    thresholds,
    emptyReason: opponents.length === 0 ? "no-facts" : null,
  };
}
