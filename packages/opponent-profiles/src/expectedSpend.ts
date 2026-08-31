// `uplift_o(i)` — IL SOVRAPPREZZO MISURATO DI UNA PERSONA SU UN PROFILO
// (NOM-PROTOCOL-A §A.5, passo 4 del nucleo P0). Puro, deterministico, senza
// DOM, senza rete, senza dati reali.
//
// ─────────────────────────────────────────────────────────────────────────────
// PERCHÉ QUESTO FILE ESISTE, E PERCHÉ NON È `precedents.ts`
// ─────────────────────────────────────────────────────────────────────────────
//
// `precedents.ts` dichiara nella propria intestazione, come invariante, che in
// quel file non esista mai una funzione che restituisca «quanto lo vuole».
// Quell'invariante resta intera: `precedents.ts` EMETTE i fatti misurati —
// ciascuno con la sua prova e la sua `n` — e non li compone. Questo file legge
// quei fatti e ne fa rapporti e mediane, e il confine fra i due è il confine
// fra «i gesti compiuti» e «l'aritmetica dichiarata su quei gesti». Tenerlo a
// vista è ciò che rende controllabile la deroga che autorizza il numero.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE COSA IL RAPPORTO È, E CHE COSA NON È
// ─────────────────────────────────────────────────────────────────────────────
//
// Un RAPPORTO è `prezzo pagato / mediana della curva storica al rango
// point-in-time di quel giocatore in quell'anno`, con la curva costruita sulle
// ALTRE aste (leave-one-out): «ha pagato una volta e mezza quello che il
// mercato di allora pagava per un giocatore di quel rango». È un quoziente fra
// due fatti misurati — un prezzo davvero pagato e una mediana davvero
// osservata — e nient'altro. Non è un'intensità, non è uno score, non è una
// probabilità e non è una previsione di comportamento: chi lo legge non sa se
// quella persona VUOLE il giocatore chiamato, sa quanto ha già pagato per
// profili così.
//
// LA MEDIANA E MAI LA MEDIA. Lo storico d'asta ha una coda lunghissima a 1
// credito e una manciata di colpi da 100 e più: la media di quei rapporti è
// una bugia con l'aria di una misura. La mediana è l'unica statistica di
// centro che regge quella forma, ed è la stessa scelta già fatta in
// `medianPrice()` di ./precedents.ts.
//
// L'UNIONE DELLE RIGHE, MAI UNA MEDIANA DI MEDIANE. I tre fatti pescano righe
// dallo stesso storico; la composizione le UNISCE in un solo insieme e ne
// prende UNA mediana. Prendere invece la mediana delle tre mediane peserebbe i
// fatti in modo nascosto — un fatto da due righe conterebbe quanto uno da
// venti — cioè introdurrebbe di soppiatto il peso che §D9 vieta. Le mediane
// per fatto restano calcolate e restituite, ma come PROVENIENZA accanto al
// numero, mai come ingredienti della sua composizione.
//
// UNIONE VUOL DIRE INSIEME. Una riga pertinente a due fatti (il giocatore
// ricomprato che è anche uno dei tre acquisti più cari di quella stagione)
// entra UNA VOLTA SOLA: contarla due volte sarebbe di nuovo un peso, scritto
// come una duplicazione invece che come un coefficiente.
//
// LA SOGLIA DI STAGIONI È UN INTERRUTTORE, e non è riscritta qui: i fatti
// arrivano da `precedentFactsFor()`, che la applica. Un fatto sotto soglia non
// entra con meno peso, non entra affatto — e questo modulo non ha modo di
// rimetterlo dentro, perché non ha una seconda ricetta dei fatti.
//
// ─────────────────────────────────────────────────────────────────────────────
// IL TIFO NON HA UN CANALE PER ENTRARE
// ─────────────────────────────────────────────────────────────────────────────
//
// `supportedClub` non è un `PrecedentFactId` (./types.ts) e non è un
// `PrecedentFact`: non può quindi comparire nella lista che questo modulo
// riceve. In fondo al file tre asserzioni di tipo lo pinnano a `tsc --noEmit`,
// nella stessa famiglia di `AssertNoProfilesChannel` in src/baitCandidates.ts:
// l'ingresso non porta i profili d'intervista, non porta una nota di tifo, e
// una nota di tifo non è assegnabile a un fatto.
//
// ─────────────────────────────────────────────────────────────────────────────
// UN INGRESSO CHE QUESTO REPOSITORY NON PUÒ DERIVARE DA SÉ
// ─────────────────────────────────────────────────────────────────────────────
//
// Il rango POINT-IN-TIME — «che rango aveva quel giocatore in quell'anno» —
// viene dal deposito servito del generatore, che il core pubblico non contiene
// e non produce. Non si sostituisce col rango di prezzo osservato: ordinare
// per prezzo e poi leggere il prezzo sarebbe prevedere il passato, ed è la
// stessa distinzione già scritta in packages/engine/src/priceHistory.ts. È
// quindi un INGRESSO DICHIARATO (`PointInTimeRankBook`), risolto dal
// chiamante; una riga senza rango point-in-time non produce un rapporto e
// viene CONTATA col suo motivo, mai riempita con un ripiego.

import {
  priceCurveBandAt,
  priceCurveBook,
  type HistoricalPurchase,
  type PriceCurveBook,
  type PriceCurveOptions,
  type PriceRankBand,
} from "../../engine/src/priceHistory.js";
import type { Role } from "../../engine/src/types.js";
import {
  clubIdentityKey,
  precedentFactsFor,
  type PersonHistory,
  type PrecedentFactCache,
} from "./precedents.js";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  PRECEDENT_FACT_IDS,
  type CalledPlayer,
  type PastAuctionPurchase,
  type PrecedentFact,
  type PrecedentFactId,
  type PrecedentThresholds,
  type SupportedClubNote,
} from "./types.js";

// ─── L'aritmetica dichiarata, tutta qui ──────────────────────────────────────

/**
 * LA MEDIANA DI UNA LISTA DI RAPPORTI. Con `n` dispari il valore centrale, con
 * `n` pari la media dei due centrali — SENZA arrotondare.
 *
 * PERCHÉ NON RIUSA `medianPrice()` di ./precedents.ts, che pure è la mediana
 * di casa: quella arrotonda per eccesso a intero perché misura CREDITI, e
 * mezzo credito al tavolo non esiste. Un rapporto non è un credito: è un
 * quoziente, e arrotondarlo a intero lo distruggerebbe (ogni rapporto fra 1 e
 * 2 diventerebbe 2). Due mediane diverse per due grandezze diverse, ciascuna
 * col proprio motivo scritto — non due copie che divergeranno.
 *
 * `null` sulla lista vuota: nessun rapporto non è il rapporto zero.
 */
export function medianRatio(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

// ─── Il rango point-in-time: un ingresso, mai una derivazione ────────────────

/** Il ruolo e il rango che un giocatore aveva IN QUELLA STAGIONE. */
export interface PointInTimeEntry {
  readonly role: Role;
  /** Posizione 1-based nel proprio ruolo, dal deposito di quell'anno. */
  readonly rank: number;
}

/**
 * `(stagione, giocatore)` → rango e ruolo di allora. La chiave si costruisce
 * con `pointInTimeKey()` e non a mano: due formati di chiave sono due mappe che
 * non si parlano.
 */
export type PointInTimeRankBook = ReadonlyMap<string, PointInTimeEntry>;

/** La chiave di `PointInTimeRankBook`. Il separatore è un NUL: non è in nessuna etichetta. */
export function pointInTimeKey(season: string, playerId: string): string {
  return `${season}\u0000${playerId}`;
}

/** La chiave di una riga d'asta: persona, stagione e giocatore insieme. */
export function spendRowKey(season: string, personId: string, playerId: string): string {
  return `${season}\u0000${personId}\u0000${playerId}`;
}

// ─── I rapporti ──────────────────────────────────────────────────────────────

/** Perché una riga d'asta NON produce un rapporto. Vocabolario chiuso. */
export type SpendRatioMissingReason =
  /** Il deposito non dice che rango avesse quel giocatore in quell'anno. */
  | "rango-point-in-time-assente"
  /** Il rango dichiarato non è un rango (intero ≥ 1): non c'è una fascia da leggere. */
  | "rango-non-valido"
  /** Tolta la sua stagione, lo storico non forma nessuna curva: niente denominatore. */
  | "curva-assente"
  /** La fascia di quel rango non ha nessuna osservazione nelle altre aste. */
  | "fascia-senza-osservazioni"
  /** La fascia ha osservazioni ma sotto il minimo dichiarato: cold start. */
  | "fascia-sotto-campione"
  /** La mediana della fascia non è positiva: un rapporto non è divisibile per zero. */
  | "mediana-non-positiva";

/** Un rapporto misurato, con tutti e due i suoi fatti sotto gli occhi. */
export interface SpendRatio {
  readonly season: string;
  readonly personId: string;
  readonly playerId: string;
  /** I crediti davvero pagati: il numeratore. */
  readonly price: number;
  readonly role: Role;
  /** Il rango point-in-time, dichiarato dal chiamante. */
  readonly rank: number;
  readonly band: PriceRankBand;
  /** La mediana della curva leave-one-out a quella fascia: il denominatore. */
  readonly curveMedian: number;
  /** `price / curveMedian`. Uno scalare, mai una banda. */
  readonly ratio: number;
  /** Osservazioni della fascia leave-one-out. Viaggia SEMPRE col rapporto. */
  readonly bandSample: number;
}

export interface SpendRatioBookInput {
  /** Lo storico d'asta multi-stagione, nella forma che il pacchetto persiste. */
  readonly history: readonly PastAuctionPurchase[];
  /** Il rango point-in-time per `(stagione, giocatore)`: ingresso, mai derivato. */
  readonly pointInTime: PointInTimeRankBook;
  /** Passate alla curva. Il minimo di fascia resta ispezionabile e iniettabile. */
  readonly curveOptions?: PriceCurveOptions;
}

/**
 * IL LIBRO DEI RAPPORTI: una passata sullo storico, riusata da ogni persona e
 * da ogni giocatore chiamato.
 *
 * IL COSTO, dichiarato: una curva per stagione (leave-one-out) più una divisione
 * per riga d'asta. Con cinque stagioni sono cinque costruzioni di curva in
 * tutto — non cinque per candidato — ed è la stessa disciplina di
 * `ExposureBook` in src/baitCandidates.ts e di `PriceCurveBook` nel motore: si
 * costruisce UNA VOLTA per lettura e non si richiama per riga di listone.
 */
export interface SpendRatioBook {
  /** `spendRowKey(...)` → il rapporto, per le sole righe che ne producono uno. */
  readonly byRow: ReadonlyMap<string, SpendRatio>;
  /** Le stagioni presenti nello storico, crescenti. */
  readonly seasons: readonly string[];
  /** Stagione → la curva delle ALTRE aste, quella che ne fa il denominatore. */
  readonly leaveOneOut: ReadonlyMap<string, PriceCurveBook>;
  /** Righe d'asta lette (i rinnovi non entrano: non sono prezzi formati in gara). */
  readonly auctionRows: number;
  /** Righe d'asta con un rapporto misurato. */
  readonly measured: number;
  /** Righe escluse e perché: la copertura è dichiarata, mai silenziata. */
  readonly skipped: Readonly<Record<SpendRatioMissingReason, number>>;
  /**
   * Righe di storico che non hanno potuto entrare nella POPOLAZIONE delle curve
   * perché il loro ruolo non si risolve dal rango point-in-time. Un rinnovo
   * senza ruolo entra lo stesso, perché la sua spesa è pool e il pool non ha
   * ruoli — stessa regola di `historicalPurchases()` nel motore.
   */
  readonly curveRowsWithoutRole: number;
}

const NO_SKIPS: Readonly<Record<SpendRatioMissingReason, number>> = Object.freeze({
  "rango-point-in-time-assente": 0,
  "rango-non-valido": 0,
  "curva-assente": 0,
  "fascia-senza-osservazioni": 0,
  "fascia-sotto-campione": 0,
  "mediana-non-positiva": 0,
});

/**
 * LA POPOLAZIONE DELLE CURVE, derivata dallo storico del pacchetto.
 *
 * Il ruolo non è nello storico d'asta (una riga porta stagione, persona,
 * giocatore, club, prezzo e tipo di acquisizione): arriva dal rango
 * point-in-time, che lo porta per (stagione, giocatore) e non per giocatore —
 * un difensore diventato centrocampista non è lo stesso rango in due anni
 * diversi, e appiattirlo su un ruolo solo sposterebbe righe di fascia.
 */
function curvePopulation(
  history: readonly PastAuctionPurchase[],
  pointInTime: PointInTimeRankBook,
): { readonly rows: readonly HistoricalPurchase[]; readonly withoutRole: number } {
  const rows: HistoricalPurchase[] = [];
  let withoutRole = 0;
  for (const row of history) {
    const renewal = row.acquisition === "riconferma";
    const entry = pointInTime.get(pointInTimeKey(row.season, row.playerId));
    const role = entry === undefined ? null : entry.role;
    if (role === null && !renewal) {
      withoutRole += 1;
      continue;
    }
    rows.push({
      season: row.season,
      playerId: row.playerId,
      role,
      price: row.price,
      renewal,
    });
  }
  return { rows, withoutRole };
}

/**
 * I rapporti di TUTTE le righe d'asta dello storico, con la curva leave-one-out
 * della loro stagione come denominatore.
 *
 * LEAVE-ONE-AUCTION-OUT, e non è una raffinatezza statistica: la curva di
 * un'asta costruita anche su quell'asta contiene i prezzi di cui il rapporto è
 * il numeratore, e una persona che compra tre giocatori su otto sposterebbe da
 * sola la mediana con cui la si misura. Escludendo la stagione, il denominatore
 * è un fatto sulle ALTRE aste, indipendente dalla riga che si sta leggendo.
 *
 * Deterministica e totale: non lancia mai, e ogni riga produce o un rapporto o
 * un motivo contato.
 */
export function spendRatioBook(input: SpendRatioBookInput): SpendRatioBook {
  const seasons = [...new Set(input.history.map((r) => r.season))].sort();
  const population = curvePopulation(input.history, input.pointInTime);

  const leaveOneOut = new Map<string, PriceCurveBook>();
  for (const season of seasons) {
    leaveOneOut.set(
      season,
      priceCurveBook(
        population.rows.filter((r) => r.season !== season),
        input.curveOptions ?? {},
      ),
    );
  }

  const byRow = new Map<string, SpendRatio>();
  const skipped: Record<SpendRatioMissingReason, number> = { ...NO_SKIPS };
  let auctionRows = 0;

  for (const row of input.history) {
    if (row.acquisition !== "asta") continue;
    auctionRows += 1;

    const entry = input.pointInTime.get(pointInTimeKey(row.season, row.playerId));
    if (entry === undefined) {
      skipped["rango-point-in-time-assente"] += 1;
      continue;
    }
    const curves = leaveOneOut.get(row.season);
    if (curves === undefined || curves.reason !== null) {
      skipped["curva-assente"] += 1;
      continue;
    }
    const band = priceCurveBandAt(curves, entry.role, entry.rank);
    if (band === null) {
      skipped["rango-non-valido"] += 1;
      continue;
    }
    if (band.reason === "no-observations") {
      skipped["fascia-senza-osservazioni"] += 1;
      continue;
    }
    if (!band.sufficient) {
      skipped["fascia-sotto-campione"] += 1;
      continue;
    }
    const curveMedian = band.median as number;
    if (!(curveMedian > 0)) {
      skipped["mediana-non-positiva"] += 1;
      continue;
    }

    byRow.set(spendRowKey(row.season, row.personId, row.playerId), {
      season: row.season,
      personId: row.personId,
      playerId: row.playerId,
      price: row.price,
      role: entry.role,
      rank: entry.rank,
      band: band.band,
      curveMedian,
      ratio: row.price / curveMedian,
      bandSample: band.n,
    });
  }

  return {
    byRow,
    seasons,
    leaveOneOut,
    auctionRows,
    measured: byRow.size,
    skipped,
    curveRowsWithoutRole: population.withoutRole,
  };
}

// ─── Le righe che ogni fatto porta ───────────────────────────────────────────

/**
 * LE RIGHE DI UN FATTO — la traduzione, dichiarata una volta sola, da «fatto
 * misurato» a «insieme di acquisti d'asta di cui prendere il rapporto».
 *
 *  - `ricomprato` → i suoi acquisti all'asta di QUEL giocatore, tutte le
 *    stagioni in cui l'ha comprato. (`n` = stagioni.)
 *  - `club` → le sue righe SU QUEL CLUB nelle sole stagioni in cui ha superato
 *    la soglia `clubShare`. (`n` = righe.)
 *  - `piu-cari` → i suoi `topPurchases` acquisti più cari, PER STAGIONE
 *    QUALIFICATA. (`n` = righe.)
 *
 * «STAGIONE QUALIFICATA» NON È UNA LOCUZIONE LIBERA: è il cancello che governa
 * oggi l'esistenza del fatto `piu-cari` (`topSpendFact`, ./precedents.ts) —
 * una stagione in cui i `topPurchases` acquisti più cari pesano almeno
 * `topShare` della spesa d'asta di quella stagione. Le righe si pescano perciò
 * SOLTANTO da quelle stagioni: prenderle da tutte allenterebbe in silenzio un
 * cancello che resta dichiarato, e `topShare` è la soglia che lo tiene. Il
 * fatto porta con sé la propria `threshold` e il proprio `perSeason`, quindi la
 * qualificazione si RILEGGE dal fatto e non si ricalcola qui: una seconda
 * ricetta della stessa condizione è una ricetta che divergerà.
 */
function factRows(
  fact: PrecedentFact,
  person: PersonHistory,
  called: CalledPlayer,
): readonly PastAuctionPurchase[] {
  if (fact.id === "ricomprato") {
    return person.auctionsByPlayer.get(called.playerId) ?? [];
  }
  if (fact.id === "club") {
    const key = clubIdentityKey(fact.club);
    const qualified = fact.perSeason.filter((s) => s.share >= fact.threshold);
    return qualified.flatMap((s) =>
      (person.auctionsBySeason.get(s.season) ?? []).filter(
        (r) => clubIdentityKey(r.club) === key,
      ),
    );
  }
  const qualified = fact.perSeason.filter((s) => s.share >= fact.threshold);
  return qualified.flatMap((s) =>
    [...(person.auctionsBySeason.get(s.season) ?? [])]
      // Stesso ordinamento totale di `topShares()` in ./precedents.ts: prezzo
      // decrescente, `playerId` crescente a parità. Due esecuzioni sullo stesso
      // storico non possono scegliere due terzine diverse.
      .sort((a, b) => b.price - a.price || a.playerId.localeCompare(b.playerId))
      .slice(0, fact.topPurchases),
  );
}

// ─── La composizione ─────────────────────────────────────────────────────────

/** Su che cosa si conta la `n` di un fatto: sono due cose diverse, e si dice quale. */
export type SpendUpliftSampleBasis = "stagioni" | "righe";

/**
 * Il contributo di UN fatto, come PROVENIENZA del numero composto.
 *
 * `median` è la mediana dei rapporti DI QUESTO FATTO e non entra nella
 * composizione: serve a chi legge per vedere da dove viene il numero e per
 * accorgersi se un fatto tira in una direzione diversa dagli altri. Il giorno
 * in cui qualcuno mediasse queste tre mediane starebbe scrivendo un peso.
 */
export interface SpendUpliftFactContribution {
  readonly id: PrecedentFactId;
  /** Righe di quel fatto con un rapporto misurato. */
  readonly rows: number;
  /** Righe di quel fatto senza rapporto: contate, mai riempite. */
  readonly rowsWithoutRatio: number;
  /** Le stagioni da cui quelle righe vengono, crescenti. */
  readonly seasons: readonly string[];
  /** La mediana dei rapporti di questo fatto. `null` se non ha righe misurate. */
  readonly median: number | null;
  /** La numerosità del fatto, nella base che il DTI gli assegna. */
  readonly n: number;
  readonly nBasis: SpendUpliftSampleBasis;
}

/** Perché il sovrapprezzo NON è misurabile. Vocabolario chiuso. */
export type SpendUpliftMissingReason =
  /**
   * Nessun fatto attivo: la persona non ha precedenti misurati su questo
   * giocatore (o li ha sotto la soglia di stagioni). È lo stesso silenzio per
   * cui oggi l'avversario non è esposto.
   */
  | "nessun-fatto-attivo"
  /**
   * I fatti ci sono, ma nessuna delle loro righe produce un rapporto: manca il
   * rango point-in-time, o la fascia leave-one-out non è leggibile. Non è zero:
   * è «non lo so», e chi legge lo dichiara invece di applicare un 1 silenzioso.
   */
  | "nessun-rapporto-misurabile";

export interface SpendUpliftMeasured {
  readonly kind: "uplift";
  /**
   * `uplift_o(i)` — LA MEDIANA DEI RAPPORTI DI TUTTE LE RIGHE UNITE. Uno
   * scalare puro (adimensionale), mai crediti e mai una banda.
   */
  readonly ratio: number;
  /** Le righe unite che lo compongono. Viaggia SEMPRE col numero. */
  readonly n: number;
  /** Le righe stesse, deduplicate e ordinate: la prova, riga per riga. */
  readonly rows: readonly SpendRatio[];
  /** Righe pertinenti a un fatto che non hanno prodotto un rapporto, deduplicate. */
  readonly rowsWithoutRatio: number;
  /** Un contributo per fatto attivo, nell'ordine dichiarato dei tipi. */
  readonly byFact: readonly SpendUpliftFactContribution[];
  /** I fatti attivi, nell'ordine dichiarato: la lista che ha prodotto le righe. */
  readonly facts: readonly PrecedentFact[];
}

export interface SpendUpliftAbsent {
  readonly kind: "assente";
  readonly reason: SpendUpliftMissingReason;
  /** I fatti attivi anche quando nessuno di loro produce un rapporto. */
  readonly facts: readonly PrecedentFact[];
  readonly byFact: readonly SpendUpliftFactContribution[];
}

export type SpendUpliftReading = SpendUpliftMeasured | SpendUpliftAbsent;

/**
 * L'INGRESSO. Porta lo storico già raggruppato, il giocatore, i rapporti già
 * calcolati e le soglie dichiarate — e NIENTE ALTRO.
 *
 * In particolare NON porta i profili d'intervista e non porta una nota di tifo:
 * non è una dimenticanza, è la porta che non esiste. Vedi le tre asserzioni in
 * fondo al file.
 */
export interface SpendUpliftInput {
  readonly person: PersonHistory;
  /** Il giocatore sul tavolo: identità e club reale, come i fatti lo vedono. */
  readonly called: CalledPlayer;
  readonly ratios: SpendRatioBook;
  /**
   * `true` quando il giocatore chiamato è «caro» — la pertinenza del fatto
   * `piu-cari`, decisa dal chiamante con `calledPlayerIsExpensive()` perché è
   * una proprietà del GIOCATORE e non della persona.
   */
  readonly expensive: boolean;
  readonly thresholds?: PrecedentThresholds;
  /** La memoria di lavoro dei fatti, se il chiamante ne tiene una. */
  readonly cache?: PrecedentFactCache;
}

const FACT_ORDER: Readonly<Record<string, number>> = Object.fromEntries(
  PRECEDENT_FACT_IDS.map((id, index) => [id, index]),
);

/**
 * `uplift_o(i)` — il sovrapprezzo misurato della persona sul profilo del
 * giocatore chiamato.
 *
 * Deterministica e totale: non lancia mai, e ogni ingresso produce o un
 * rapporto con le sue righe o un'assenza col suo motivo. Nessun ramo
 * restituisce 1 al posto di un'assenza: un moltiplicatore neutro e un
 * moltiplicatore assente producono lo stesso numero e sono due affermazioni
 * diverse.
 */
export function spendUpliftReading(input: SpendUpliftInput): SpendUpliftReading {
  const thresholds = input.thresholds ?? DEFAULT_PRECEDENT_THRESHOLDS;
  // I FATTI ARRIVANO DALL'UNICA RICETTA CHE ESISTE, con la sua soglia a
  // interruttore già applicata. Questo modulo non ne ha una seconda.
  const facts = precedentFactsFor(
    input.person,
    input.called,
    thresholds,
    input.expensive,
    input.cache,
  );

  if (facts.length === 0) {
    return { kind: "assente", reason: "nessun-fatto-attivo", facts, byFact: [] };
  }

  const byFact: SpendUpliftFactContribution[] = [];
  // L'UNIONE, come insieme: chiave di riga → rapporto. Una riga pertinente a
  // due fatti entra una volta sola.
  const union = new Map<string, SpendRatio>();
  const withoutRatio = new Set<string>();

  for (const fact of facts) {
    const rows = factRows(fact, input.person, input.called);
    const measured: SpendRatio[] = [];
    const missing = new Set<string>();
    for (const row of rows) {
      const key = spendRowKey(row.season, row.personId, row.playerId);
      const ratio = input.ratios.byRow.get(key);
      if (ratio === undefined) {
        missing.add(key);
        continue;
      }
      measured.push(ratio);
      union.set(key, ratio);
    }
    for (const key of missing) withoutRatio.add(key);

    const seasons = [...new Set(measured.map((r) => r.season))].sort();
    byFact.push({
      id: fact.id,
      rows: measured.length,
      rowsWithoutRatio: missing.size,
      seasons,
      median: medianRatio(measured.map((r) => r.ratio)),
      // `ricomprato` si misura in STAGIONI (quante volte, in anni diversi, ha
      // ripreso proprio lui); gli altri due in RIGHE. Sono due basi diverse e
      // il campo dice quale, invece di lasciare che si confondano.
      n: fact.id === "ricomprato" ? seasons.length : measured.length,
      nBasis: fact.id === "ricomprato" ? "stagioni" : "righe",
    });
  }

  byFact.sort((a, b) => (FACT_ORDER[a.id] as number) - (FACT_ORDER[b.id] as number));

  // Una riga che UN fatto non ha potuto misurare ma un altro sì non è una riga
  // mancante: si toglie dal conteggio delle assenze.
  for (const key of union.keys()) withoutRatio.delete(key);

  const rows = [...union.values()].sort(
    (a, b) => a.season.localeCompare(b.season) || a.playerId.localeCompare(b.playerId),
  );
  const ratio = medianRatio(rows.map((r) => r.ratio));
  if (ratio === null) {
    return { kind: "assente", reason: "nessun-rapporto-misurabile", facts, byFact };
  }

  return {
    kind: "uplift",
    ratio,
    n: rows.length,
    rows,
    rowsWithoutRatio: withoutRatio.size,
    byFact,
    facts,
  };
}

/** Il rapporto di una lettura, o `null` quando non esiste. Mai un 1 al posto dell'assenza. */
export function spendUpliftRatio(reading: SpendUpliftReading): number | null {
  return reading.kind === "uplift" ? reading.ratio : null;
}

// ─── LE TRE GUARDIE DI TIPO ──────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, cioè al PRIMO comando di `npm run verify`, senza
// eseguire una riga di vitest; e vivono ACCANTO alla dichiarazione, quindi
// finiscono nello stesso hunk di diff di chi aprisse la porta. Stessa famiglia
// di `AssertNoProfilesChannel` in src/baitCandidates.ts, e con lo stesso limite
// dichiarato: chi aggiunge il campo può cancellare anche queste righe — ma
// allora lo sta facendo APPOSTA, sotto gli occhi di chi rilegge il diff.

/** L'ingresso non porta i profili d'intervista: il tifo non ha da dove entrare. */
type AssertNoProfilesChannel = "profiles" extends keyof SpendUpliftInput ? never : true;
const _noProfilesChannel: AssertNoProfilesChannel = true;
void _noProfilesChannel;

/** Né una nota di tifo per un'altra strada. */
type AssertNoSupportedClubChannel = "supportedClub" extends keyof SpendUpliftInput ? never : true;
const _noSupportedClubChannel: AssertNoSupportedClubChannel = true;
void _noSupportedClubChannel;

/**
 * E una nota di tifo NON È un fatto: non potrebbe entrare nemmeno travestita
 * dentro la lista dei fatti, perché `PrecedentFact` non la accetta.
 */
type AssertSupportedClubIsNotAFact = SupportedClubNote extends PrecedentFact ? never : true;
const _supportedClubIsNotAFact: AssertSupportedClubIsNotAFact = true;
void _supportedClubIsNotAFact;
