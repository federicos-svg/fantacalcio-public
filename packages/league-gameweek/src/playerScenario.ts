// LA PREVISIONE A DISTRIBUZIONI, E IL CAMPIONATORE DI SCENARI — WP-2.
//
// PERCHÉ ESISTE. Il contratto `PlayerForecast` portava una riga sola — un voto
// base atteso, un punteggio atteso, una probabilità di prendere voto — e con
// una riga sola gli scenari potevano variare una cosa soltanto: gioca o non
// gioca. Ma la formazione che vince quattro volte su dieci e perde sei non
// nasce dalle assenze: nasce dal fatto che un giocatore prende 5 o prende 8, e
// che segna o non segna. Senza distribuzioni l'obiettivo di §3 misura una
// varianza che non c'è.
//
// LA RIGA MODALE RESTA, E NON È UN DOPPIONE. `expected` continua a essere la
// riga più probabile e continua ad alimentare il livello 1 e la schermata; la
// distribuzione è un'aggiunta facoltativa che alimenta il livello 2. I due
// numeri che dicono la stessa cosa — `pPlays` e `voteProbability` — devono
// coincidere, e il voto base modale deve essere davvero un massimo della
// distribuzione: due dichiarazioni della stessa quantità che si contraddicono
// non sono ridondanza, sono un errore che qualcuno consumerà.
//
// LA TARIFFA DI §12 VIVE QUI, E LA DUPLICAZIONE È DICHIARATA. Il simulatore
// dice, correttamente, che la tariffa bonus/malus non deve avere due copie che
// un giorno divergeranno in silenzio, e rimanda a
// `packages/appeal-index/src/fantavoto.ts`. Quel modulo però appartiene alla
// FASE D'ASTA: prende un `VoteRecordCandidate`, parla nella semantica delle
// colonne dello storico (`Gf` / `Rf` / `Rs`, disgiunte per misura sul campo) e
// vive dentro un pacchetto che le guardie di isolamento tengono separato da
// questa fase. Qui serve l'altra direzione: da eventi PREVISTI a punteggio.
// Scelta dichiarata e contestabile: la tabella di §12 si riscrive in questo
// pacchetto, e un test la confronta riga per riga con quella dell'asta, così la
// divergenza silenziosa che il simulatore teme diventa un test rosso invece che
// una scoperta di dicembre.
//
// CHE COSA QUESTO CONTRATTO NON SA RAPPRESENTARE, dichiarato invece che
// scoperto dopo:
//  - una DOPPIETTA. `pGoal` è la probabilità di UN gol; due gol nella stessa
//    giornata non hanno posto qui. È la stessa semplificazione con cui §6.1
//    del disegno elenca gli eventi, e vale per tutte le fattispecie tranne i
//    gol subiti del portiere, che sono una distribuzione su conteggi esatti;
//  - la CORRELAZIONE fra giocatori ed eventi. Ogni estrazione è indipendente:
//    la base di §6.2 lo dichiara, e il motore ricco la toglierà campionando la
//    partita reale prima dei giocatori;
//  - il BONUS IMBATTIBILITÀ del portiere. §13 lo nomina per escluderlo da un
//    senza voto, ma §12 — l'unica tabella che prezza gli eventi — non lo
//    prezza. Non lo si inventa: non viene campionato, e chi lo volesse deve
//    prima farlo scrivere nel regolamento.
//
// I GOL SUBITI SONO CONTEGGI ESATTI, NON UN «5+». §6.1 del disegno scrive la
// distribuzione come «0..5+». Un secchio aperto non è prezzabile: §12 paga −1
// PER GOL, e per pagare un «5 o più» bisognerebbe scegliere quanti. Qui la
// distribuzione è un vettore di masse su conteggi esatti — indice 0 = nessun
// gol subito — lungo quanto il previsore decide. Lettura dichiarata: dove il
// regolamento paga per unità, il contratto chiede unità.

import type { PlayerLine, Role } from "./gameweekSimulator.js";

/** Il voto base sta fra 4 e 10, a passi di mezzo punto (§6.1 del disegno). */
export const BASE_VOTE_MIN = 4 as const;
export const BASE_VOTE_MAX = 10 as const;
export const BASE_VOTE_STEP = 0.5 as const;

/** La griglia esplicita, così che «sulla griglia» sia verificabile e non creduto. */
export const BASE_VOTE_GRID: readonly number[] = Array.from(
  { length: Math.round((BASE_VOTE_MAX - BASE_VOTE_MIN) / BASE_VOTE_STEP) + 1 },
  (_, i) => BASE_VOTE_MIN + i * BASE_VOTE_STEP,
);

/**
 * LA TARIFFA DI §12, per la Fase 2. I nomi sono quelli del regolamento, non
 * quelli delle colonne dello storico: qui gli eventi sono previsti, non letti.
 *
 * Il gol da rigore NON ha una riga sua, ed è deliberato: §12 prezza IL GOL e
 * non il modo in cui è stato segnato — il chiarimento è già registrato nella
 * Fase 1 e vale anche qui. `penaltyMissed` e `penaltySaved` invece sono eventi
 * a sé, e il regolamento li prezza a sé.
 */
export const BONUS_MALUS_TARIFF = {
  goal: 3,
  assist: 1,
  penaltySaved: 3,
  penaltyMissed: -3,
  ownGoal: -2,
  yellowCard: -0.5,
  redCard: -1,
} as const;

/** Gol subito: −1, e SOLO al portiere (§12-bis, platea chiusa il 2026-08-23). */
export const GOAL_CONCEDED_MALUS = -1 as const;
export const GOAL_CONCEDED_MALUS_ROLE: Role = "P";

/** Una massa della distribuzione del voto base, condizionata a giocare. */
export interface BaseVoteMass {
  readonly vote: number;
  readonly probability: number;
}

/**
 * Gli eventi pagati da §12, come probabilità CONDIZIONATE A GIOCARE. Chi non
 * prende voto non ha eventi: il suo caso lo descrive `svKind`.
 */
export interface PlayerEventRates {
  readonly pGoal: number;
  readonly pAssist: number;
  readonly pYellow: number;
  readonly pRed: number;
  readonly pOwnGoal: number;
  readonly pPenMissed: number;
  readonly pPenSaved: number;
  /**
   * Solo per il portiere: masse sui gol subiti a conteggio esatto, indice 0 =
   * nessuno. Obbligatoria per il ruolo `P` e vietata per gli altri, perché il
   * malus di §12-bis è del solo portiere e una riga che lo porti altrove
   * significherebbe che il dato non ha la semantica attesa.
   */
  readonly goalsConceded?: readonly number[];
}

/**
 * LE CINQUE FATTISPECIE DEL SENZA VOTO (§13), come distribuzione condizionata
 * al NON prendere voto. Sono le stesse cinque righe del regolamento, con gli
 * stessi nomi, e la loro somma è uno: un senza voto è sempre uno dei cinque.
 */
export interface NoVoteKindMasses {
  /** Senza voto puro, nessun bonus/malus: si sostituisce. */
  readonly clean: number;
  /** Ammonito: base 5, malus già incluso. */
  readonly booked: number;
  /** Espulso a partita in corso: 4, valore a sé. */
  readonly sentOffDuringMatch: number;
  /** Con un qualunque altro bonus/malus: 6 più il suo valore. */
  readonly withOtherBonusMalus: number;
  /** Espulso dopo il fischio finale: resta senza voto, si sostituisce. */
  readonly sentOffAfterMatch: number;
}

/**
 * L'uscita della previsione di §6.1. È FACOLTATIVA: chi non la produce lascia
 * il produttore esattamente com'era, con la sola riga modale.
 */
export interface PlayerDistribution {
  /** P(prende voto). Deve coincidere con `voteProbability` della riga modale. */
  readonly pPlays: number;
  /** Informativi per la panchina (§6.1): titolare e subentrante. */
  readonly pStarter: number;
  readonly pSub: number;
  /** Distribuzione del voto base condizionata a giocare, sulla griglia 4..10. */
  readonly baseVote: readonly BaseVoteMass[];
  readonly events: PlayerEventRates;
  readonly svKind: NoVoteKindMasses;
  /**
   * Il valore del bonus/malus del caso `withOtherBonusMalus`. Obbligatorio se
   * quel caso ha massa positiva: §13 dà «6 più QUEL valore», e senza il valore
   * la fattispecie non è calcolabile — è lo stesso buco di dato che
   * `resolveNoVote` chiude con `undeclared`.
   */
  readonly svOtherBonusMalus?: number;
  /** L'istante dell'osservazione da cui il numero deriva (regola as-of, §5). */
  readonly asOf: string;
  /** La qualità dichiarata della fonte. Il produttore non la interpreta. */
  readonly sourceQuality: string;
}

/**
 * Un istante è un istante solo se porta il fuso: `2026-09-07T18:00:00Z` sì,
 * `2026-09-07 18:00` no. Senza fuso due letture a un'ora di distanza possono
 * sembrare la stessa, e la regola as-of di §5 poggia sull'ordine fra istanti.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Tolleranza sulle somme di probabilità: virgola mobile, non permissività. */
const SUM_TOLERANCE = 1e-9;

function assertProbability(value: number, what: string, where: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${where}: ${what} fuori da [0,1] (${String(value)})`);
  }
}

function assertSumsToOne(masses: readonly number[], what: string, where: string): void {
  let sum = 0;
  for (const mass of masses) sum += mass;
  if (Math.abs(sum - 1) > SUM_TOLERANCE) {
    throw new Error(
      `${where}: ${what} somma ${sum} invece di 1. Una distribuzione che non somma a uno non è una ` +
        "distribuzione: la massa mancante finirebbe in silenzio nell'ultimo caso, e nessuno saprebbe dov'è.",
    );
  }
}

/**
 * Convalida una distribuzione contro la riga modale che l'accompagna. Ogni
 * controllo qui è fail-closed: un contratto rotto si dichiara, non si aggiusta.
 */
export function assertPlayerDistribution(
  player: { readonly id: string; readonly role: Role; readonly voteProbability: number; readonly modalBaseVote: number },
  distribution: PlayerDistribution,
  where: string,
): void {
  const at = `${where}: distribuzione di ${player.id}`;

  assertProbability(distribution.pPlays, "pPlays", at);
  if (Math.abs(distribution.pPlays - player.voteProbability) > SUM_TOLERANCE) {
    throw new Error(
      `${at}: pPlays ${distribution.pPlays} contraddice voteProbability ${player.voteProbability}. ` +
        "Sono lo stesso numero detto due volte: se divergono, chi legge il contratto e chi legge la " +
        "distribuzione stanno calcolando due giornate diverse.",
    );
  }
  assertProbability(distribution.pStarter, "pStarter", at);
  assertProbability(distribution.pSub, "pSub", at);
  if (distribution.pStarter + distribution.pSub > 1 + SUM_TOLERANCE) {
    throw new Error(
      `${at}: pStarter ${distribution.pStarter} più pSub ${distribution.pSub} superano 1. Titolare e ` +
        "subentrante sono esiti che si escludono: la loro somma è una probabilità.",
    );
  }

  // ── VOTO BASE. Griglia, ordine stretto, somma a uno, e coerenza con la modale.
  if (distribution.baseVote.length === 0) {
    throw new Error(`${at}: la distribuzione del voto base è vuota. Chi gioca un voto lo prende.`);
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const mass of distribution.baseVote) {
    if (!BASE_VOTE_GRID.includes(mass.vote)) {
      throw new Error(
        `${at}: voto ${String(mass.vote)} fuori dalla griglia ${BASE_VOTE_MIN}..${BASE_VOTE_MAX} a passi di ` +
          `${BASE_VOTE_STEP}. §21 tabula i modificatori su quella griglia e vieta di interpolare.`,
      );
    }
    if (mass.vote <= previous) {
      throw new Error(
        `${at}: i voti non sono in ordine strettamente crescente (${previous} poi ${mass.vote}). ` +
          "L'ordine è parte del contratto: è quello che rende l'estrazione riproducibile, e un voto " +
          "ripetuto sarebbe due masse per lo stesso esito.",
      );
    }
    previous = mass.vote;
    assertProbability(mass.probability, `probabilità del voto ${mass.vote}`, at);
  }
  assertSumsToOne(
    distribution.baseVote.map((mass) => mass.probability),
    "la distribuzione del voto base",
    at,
  );
  const topMass = Math.max(...distribution.baseVote.map((mass) => mass.probability));
  const modes = distribution.baseVote.filter((mass) => mass.probability === topMass).map((mass) => mass.vote);
  if (!modes.includes(player.modalBaseVote)) {
    throw new Error(
      `${at}: il voto base della riga modale è ${player.modalBaseVote}, ma il massimo della distribuzione ` +
        `è ${modes.join(" o ")}. La riga di \`expected\` è dichiarata MODALE, non media: se le due ` +
        "dichiarazioni non coincidono, il livello 1 si innesca su un giocatore diverso da quello che il " +
        "livello 2 valuta.",
    );
  }

  // ── EVENTI.
  const events = distribution.events;
  assertProbability(events.pGoal, "pGoal", at);
  assertProbability(events.pAssist, "pAssist", at);
  assertProbability(events.pYellow, "pYellow", at);
  assertProbability(events.pRed, "pRed", at);
  assertProbability(events.pOwnGoal, "pOwnGoal", at);
  assertProbability(events.pPenMissed, "pPenMissed", at);
  assertProbability(events.pPenSaved, "pPenSaved", at);
  if (player.role === GOAL_CONCEDED_MALUS_ROLE) {
    if (events.goalsConceded === undefined || events.goalsConceded.length === 0) {
      throw new Error(
        `${at}: manca la distribuzione dei gol subiti, obbligatoria per il portiere. §12-bis gli assegna ` +
          "−1 per gol, e non dichiararla vorrebbe dire dargliene zero senza averlo detto.",
      );
    }
    events.goalsConceded.forEach((mass, goals) => assertProbability(mass, `P(${goals} gol subiti)`, at));
    assertSumsToOne(events.goalsConceded, "la distribuzione dei gol subiti", at);
  } else if (events.goalsConceded !== undefined) {
    throw new Error(
      `${at}: gol subiti dichiarati su un giocatore di ruolo ${player.role}. Il malus di §12-bis è del ` +
        "SOLO portiere: una riga così significa che il dato non ha la semantica attesa, e proseguire " +
        "scriverebbe un numero costruito su una premessa falsa.",
    );
  }

  // ── SENZA VOTO: le cinque fattispecie di §13, e nient'altro.
  const sv = distribution.svKind;
  const svMasses = [sv.clean, sv.booked, sv.sentOffDuringMatch, sv.withOtherBonusMalus, sv.sentOffAfterMatch];
  const svNames = ["clean", "booked", "sentOffDuringMatch", "withOtherBonusMalus", "sentOffAfterMatch"];
  svMasses.forEach((mass, i) => assertProbability(mass, `svKind.${svNames[i] as string}`, at));
  assertSumsToOne(svMasses, "le cinque fattispecie del senza voto (§13)", at);
  if (sv.withOtherBonusMalus > 0) {
    if (distribution.svOtherBonusMalus === undefined || !Number.isFinite(distribution.svOtherBonusMalus)) {
      throw new Error(
        `${at}: svKind.withOtherBonusMalus ha massa ${sv.withOtherBonusMalus} ma svOtherBonusMalus non è ` +
          "dichiarato. §13 dà «6 più il valore di quel bonus/malus»: senza il valore la fattispecie non è " +
          "calcolabile, ed è lo stesso buco di dato che `resolveNoVote` chiude con `undeclared`.",
      );
    }
    if (distribution.svOtherBonusMalus === 0) {
      throw new Error(
        `${at}: svOtherBonusMalus è zero. Un senza voto con bonus/malus pari a zero È il senza voto puro, ` +
          "che si sostituisce: la fattispecie giusta è `clean`, e chiamarla in un altro modo produrrebbe " +
          "un giocatore che resta in campo a 6 quando il regolamento lo manda in panchina.",
      );
    }
  }

  // ── AS-OF E QUALITÀ.
  if (typeof distribution.asOf !== "string" || !ISO_INSTANT.test(distribution.asOf)) {
    throw new Error(
      `${at}: asOf «${String(distribution.asOf)}» non è un istante ISO 8601 con fuso. La regola as-of di ` +
        "§5 confronta istanti: uno senza fuso non è confrontabile, e sembrarlo è peggio che mancare.",
    );
  }
  if (typeof distribution.sourceQuality !== "string" || distribution.sourceQuality.length === 0) {
    throw new Error(`${at}: sourceQuality mancante. La qualità si dichiara; il produttore non la interpreta.`);
  }
}

/** Inversione della funzione di ripartizione su masse discrete. */
function pickIndex(masses: readonly number[], u: number): number {
  let cumulative = 0;
  for (let i = 0; i < masses.length; i += 1) {
    cumulative += masses[i] as number;
    if (u < cumulative) return i;
  }
  // Solo l'errore di arrotondamento può portare qui: l'ultimo caso è quello che
  // raccoglie la massa residua, e vale quanto sceglierlo per soglia.
  return masses.length - 1;
}

/**
 * UNO SCENARIO PER UN GIOCATORE, dalla sua distribuzione.
 *
 * L'ORDINE DELLE ESTRAZIONI È PARTE DEL CONTRATTO, perché è quel che rende una
 * proposta rifacibile bit a bit: prima gioca/non gioca; se gioca, il voto base
 * e poi gli eventi nell'ordine in cui sono dichiarati qui sotto, con i gol
 * subiti per ultimi; se non gioca, la fattispecie di §13 e basta.
 *
 * Il numero di estrazioni dipende dall'esito, ed è voluto: chi non gioca non ha
 * eventi da estrarre, e consumare numeri casuali per esiti che non esistono
 * costerebbe senza comprare nulla.
 */
export function samplePlayerLine(
  player: { readonly id: string; readonly role: Role },
  distribution: PlayerDistribution,
  random: () => number,
): PlayerLine {
  if (random() >= distribution.pPlays) {
    // ── NON PRENDE VOTO: una delle cinque fattispecie di §13. La riga porta
    // solo ciò che serve a `resolveNoVote` per decidere; il punteggio d'ufficio
    // lo calcola lui, perché §13 è codice in un posto solo.
    const sv = distribution.svKind;
    const kind = pickIndex(
      [sv.clean, sv.booked, sv.sentOffDuringMatch, sv.withOtherBonusMalus, sv.sentOffAfterMatch],
      random(),
    );
    const base = { id: player.id, role: player.role, baseVote: null, fantasyScore: null } as const;
    // I due flag di §21 non si mettono su un senza voto, e non è una svista: un
    // punteggio d'ufficio ha voto base 6, 5 o 4, che la tabella di §21 paga zero
    // (6,0) o esclude del tutto (sotto la sufficienza). Il flag non può spostare
    // un punto, e dedurlo da una SOMMA algebrica di bonus e malus sarebbe una
    // pretesa che quella somma non regge.
    switch (kind) {
      case 0:
        return { ...base, cards: "none", otherBonusMalus: 0 };
      case 1:
        return { ...base, cards: "yellow", otherBonusMalus: 0 };
      case 2:
        return { ...base, cards: "red", otherBonusMalus: 0 };
      case 3:
        return { ...base, cards: "none", otherBonusMalus: distribution.svOtherBonusMalus as number };
      default:
        return { ...base, cards: "red_after_match", otherBonusMalus: 0 };
    }
  }

  // ── PRENDE VOTO: voto base, poi eventi.
  const votes = distribution.baseVote;
  const baseVote = (votes[pickIndex(votes.map((mass) => mass.probability), random())] as BaseVoteMass).vote;
  const events = distribution.events;
  const goal = random() < events.pGoal;
  const assist = random() < events.pAssist;
  const yellow = random() < events.pYellow;
  const red = random() < events.pRed;
  const ownGoal = random() < events.pOwnGoal;
  const penMissed = random() < events.pPenMissed;
  const penSaved = random() < events.pPenSaved;
  let delta = 0;
  if (goal) delta += BONUS_MALUS_TARIFF.goal;
  if (assist) delta += BONUS_MALUS_TARIFF.assist;
  if (yellow) delta += BONUS_MALUS_TARIFF.yellowCard;
  if (red) delta += BONUS_MALUS_TARIFF.redCard;
  if (ownGoal) delta += BONUS_MALUS_TARIFF.ownGoal;
  if (penMissed) delta += BONUS_MALUS_TARIFF.penaltyMissed;
  if (penSaved) delta += BONUS_MALUS_TARIFF.penaltySaved;
  if (player.role === GOAL_CONCEDED_MALUS_ROLE) {
    const conceded = pickIndex(events.goalsConceded as readonly number[], random());
    delta += conceded * GOAL_CONCEDED_MALUS;
  }
  return {
    id: player.id,
    role: player.role,
    baseVote,
    // La virgola mobile su multipli di 0,5 e interi è esatta, ma la somma di
    // sette termini può comunque produrre un −0: si normalizza a zero perché
    // due proposte identiche non differiscano per il segno di uno zero.
    fantasyScore: baseVote + delta + 0,
    // §21 esclude dal modificatore attacco chi ha ricevuto UN QUALUNQUE bonus:
    // gol, assist e rigore parato lo sono. Il flag è obbligatorio nel contratto
    // della riga modale per la stessa ragione per cui qui è calcolato e non
    // omesso — senza, lo stesso gol verrebbe pagato due volte.
    receivedAnyBonus: goal || assist || penSaved,
    missedPenalty: penMissed,
  };
}
