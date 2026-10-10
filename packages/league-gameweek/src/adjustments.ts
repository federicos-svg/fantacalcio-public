// LA PORTA UNICA DEI RITOCCHI.
//
// PERCHÉ ESISTE. Una previsione (`PlayerForecast`) esce dal produttore con una
// riga modale e, facoltativa, una distribuzione che la regge. Chi la ritocca a
// valle — perché sa qualcosa che il produttore non sa: l'avversario, una
// probabile formazione, un rigorista, un voto d'ufficio — oggi la riscrive a
// mano, ognuno a modo suo, e ognuno deve ricordarsi da solo le tre cose che il
// contratto pretende insieme: le probabilità sommano a uno, il voto sta sulla
// griglia, e la riga modale dice ancora la stessa cosa della distribuzione. Tre
// riscritture a mano sono tre occasioni di dimenticarne una, e il difetto non
// esplode dove nasce: esce da `proposeLineup` dodici passaggi più in là.
//
// QUI C'È UNA PORTA SOLA. `applyAdjustments` prende le previsioni e una lista di
// ritocchi dichiarati, e restituisce le previsioni ritoccate. Il CONTRATTO e le
// INVARIANTI stanno qui, accanto a `assertPlayerDistribution`; i COEFFICIENTI
// — di quanto inclinare, per quale ragione, su quale fonte — stanno in chi
// chiama. Questo modulo non conosce nessuna fonte di dati e non ha un numero
// che dica «quanto»: sa soltanto che cosa significa muovere una distribuzione
// senza romperla. Per la stessa ragione la forma del voto (griglia, reticolo,
// riga modale) ha UN solo proprietario, e non uno per ogni ritocco.
//
// I QUATTRO RITOCCHI. L'unione è chiusa: un quinto tipo è una modifica di
// questo file, non una stringa che un chiamante inventa.
//  - `tiltBaseVote` sposta la MEDIA del voto base di `deltaMean`. Il conto è
//    un'INCLINAZIONE ESPONENZIALE: ogni massa `p_i` diventa proporzionale a
//    `p_i · e^(θ·voto_i)`, con θ cercato in modo che la nuova media sia la
//    vecchia più `deltaMean` (bisezione a passi fissi, nessun caso, nessun
//    orologio). Tre conseguenze, tutte provate: (1) il SUPPORTO non cambia —
//    gli stessi voti, nello stesso ordine, e una massa nulla resta nulla; non
//    nasce un voto che la distribuzione non dichiarava, e nessuno esce dalla
//    griglia; (2) l'inclinazione è MONOTONA: spostare la media in su porta massa
//    verso i voti alti, mai il contrario; (3) due inclinazioni di fila si
//    sommano (la famiglia esponenziale è chiusa), quindi l'ordine fra tilt
//    dello stesso giocatore non cambia il risultato oltre la tolleranza. È
//    l'inclinazione classica a minima divergenza di Kullback–Leibler dalla
//    distribuzione data fra quelle con la media richiesta e lo stesso
//    supporto. Il TETTO `|deltaMean| ≤ 0,5` (un passo di reticolo) è una
//    scelta di progetto, non una misura: rifiuta gli errori di unità, non
//    giudica la plausibilità di un effetto — quella è un'altra guardia. Se la
//    media richiesta cade fuori dal supporto (una distribuzione concentrata, o
//    un voto certo) il ritocco è IMPOSSIBILE e si rifiuta.
//  - `scaleEvent` moltiplica una delle sette probabilità di evento di §12 per
//    `factor` e la TRONCA a 1: `p' = min(1, p·factor)`. Il tetto non è un
//    ripiego, è ciò che tiene il risultato una probabilità; factor 0 azzera.
//    L'ordine conta proprio per il tetto: `×10` poi `×0,5` non è `×0,5` poi
//    `×10`, ed è per questo che la lista si applica NELL'ORDINE in cui è scritta.
//  - `setPPlays` fissa P(prende voto). Aggiorna insieme `voteProbability` della
//    riga modale e `pPlays` della distribuzione — sono lo stesso numero detto
//    due volte, e il contratto pretende che coincidano — e porta con sé
//    `pStarter` e `pSub` scalandoli dello stesso rapporto, così la quota di
//    titolari su chi gioca resta quella del produttore. Se la probabilità di
//    partenza era zero non c'è una quota da conservare: i due restano come sono.
//    Una previsione senza distribuzione cambia solo `voteProbability`.
//  - `shiftGoalsConceded` sposta i gol subiti del portiere: la massa su `k` gol
//    diventa proporzionale a `m_k · factor^k`, poi si ri-normalizza. `factor > 1`
//    porta massa verso più gol subiti, `< 1` verso meno. Solo per il portiere.
//
// LA RIGA MODALE SI RICALCOLA, NON SI RITOCCA. Dopo ogni ritocco che cambia una
// distribuzione, `expected` si rifà da zero con la regola dei produttori
// (`baseForecast.ts`, `challengerForecast.ts`): voto base = il massimo della
// distribuzione (a parità, il voto più basso), un evento «accade» nella riga
// modale se e solo se la sua probabilità SUPERA 0,5, i gol subiti entrano al
// loro valore modale. Una riga ritoccata a mano fa derivare i due flag di §21
// dal ritocco invece che dalla distribuzione, e li fa contraddire. La regola è
// scritta qui una seconda volta — i due produttori la tengono ciascuno per
// conto suo — e `tests/adjustments.test.ts` la confronta con l'uscita di
// entrambi: la duplicazione è dichiarata e ha una prova che diventa rossa il
// giorno in cui una delle copie cambia da sola (lo stesso modello della tariffa
// di §12 in `playerScenario.ts`).
//
// LE INVARIANTI. Ogni previsione CAMBIATA esce da `assertPlayerDistribution`,
// ritocco per ritocco: somma a uno, griglia, ordine, coerenza fra riga modale
// e distribuzione. Se il contratto non regge, l'errore si chiama
// `invariant_broken`, perché la colpa è del ritocco; se non regge già l'INGRESSO
// di un giocatore nominato da un ritocco, si chiama `invalid_input`, perché la
// colpa è di chi ha prodotto la previsione. Un giocatore che nessun ritocco
// nomina passa com'è, senza controlli: la sua convalida resta di chi consuma
// (`assertForecasts`), come prima.
//
// L'IDENTITÀ. Lista vuota → l'uscita È l'ingresso (`===`, la stessa array); un
// giocatore non nominato esce come lo stesso oggetto; un ritocco che non cambia
// nessun numero (`scaleEvent` ×1, `tiltBaseVote` di zero, `setPPlays` al valore
// che c'è) lascia lo stesso oggetto. Quando i numeri cambiano non ci sono
// scorciatoie: `shiftGoalsConceded` con `factor` 1 rifà comunque la
// ri-normalizzazione, e può spostare una massa all'ultimo bit.
//
// PURA E ATOMICA. Nessuna mutazione dell'ingresso, nessun orologio, nessun
// caso, nessuna rete: stessi ingressi, stesse uscite, bit per bit sulla stessa
// piattaforma (`Math.exp` e `Math.pow` non sono definiti al bit fra motori
// JavaScript diversi, e nessuna prova qui pretende il contrario). Se un
// ritocco qualunque della lista è rifiutato, l'intera chiamata lancia e non
// esce niente: un'uscita a metà sarebbe un calcolo che nessuno ha chiesto.
//
// ERRORI NOMINATI. Ogni rifiuto è un `AdjustmentError` con un `code` leggibile
// da una macchina (`AdjustmentErrorCode`) e la posizione del ritocco nella
// lista. «Fuori dai limiti» è `out_of_bounds`; un ritocco che non si sa leggere
// è `malformed_adjustment`.
//
// LIMITI DICHIARATI, perché si leggano qui invece di scoprirli.
//  - `setPPlays` può portare la somma di un GRUPPO ESCLUSIVO
//    (`PlayerForecast.exclusiveGroup`) oltre 1. La porta vede UNA lista alla
//    volta e un gruppo può stare a cavallo delle due rose: il controllo
//    completo è di `assertForecasts` / `assertInput`, che vedono l'unione, e
//    la prova di questo file mostra che lo rifiutano.
//  - `asOf` e `sourceQuality` NON si toccano: la targa di una previsione
//    ritoccata la scrive chi ritocca, nel punto in cui chiama, perché solo lui
//    sa perché.
//  - `tiltBaseVote`, `scaleEvent` e `shiftGoalsConceded` su una previsione
//    SENZA distribuzione si rifiutano (`no_distribution`) invece di essere
//    ignorati in silenzio: non c'è niente da inclinare, e farlo finta di
//    niente lascerebbe credere al chiamante che il ritocco sia entrato.
//  - `scaleEvent` è lineare con tetto. Un ritocco che deve scalare un TASSO
//    d'evento (cioè `1 − (1 − p)^factor`) o fissare un valore assoluto non è
//    questo tipo: se serve, è un'estensione dell'unione in questo file.
//
// IMPORT. Un solo modulo a runtime, `playerScenario.ts` (la tariffa, la
// convalida); il resto sono tipi. Lo verifica `tests/adjustments.test.ts`.
// Nessuno nel core chiama ancora questa porta, ed è voluto: chi la usa è un
// altro cambiamento.

import {
  BASE_VOTE_STEP,
  BONUS_MALUS_TARIFF,
  GOAL_CONCEDED_MALUS,
  type BaseVoteMass,
  type PlayerDistribution,
  type PlayerEventRates,
  assertPlayerDistribution,
} from "./playerScenario.js";
import type { PlayerForecast } from "./lineupProposer.js";

/** Le sette probabilità di evento di §12 che `scaleEvent` può scalare. I gol subiti hanno il loro ritocco. */
export const SCALABLE_EVENTS = [
  "pGoal",
  "pAssist",
  "pYellow",
  "pRed",
  "pOwnGoal",
  "pPenMissed",
  "pPenSaved",
] as const;
export type ScalableEvent = (typeof SCALABLE_EVENTS)[number];

/**
 * Il tetto di `tiltBaseVote`: un passo di reticolo. SCELTA DI PROGETTO, non una
 * misura — rifiuta gli errori di unità (un 1,6 al posto di 0,16), non giudica
 * se un effetto sia plausibile.
 */
export const MAX_TILT_DELTA_MEAN = BASE_VOTE_STEP;

/** Sposta la media del voto base di `deltaMean`, restando sul supporto dichiarato. */
export interface TiltBaseVote {
  readonly kind: "tiltBaseVote";
  readonly playerId: string;
  /** In voti, con segno. `|deltaMean| ≤ MAX_TILT_DELTA_MEAN`. */
  readonly deltaMean: number;
}

/** Moltiplica una probabilità di evento per `factor` e la tronca a 1. */
export interface ScaleEvent {
  readonly kind: "scaleEvent";
  readonly playerId: string;
  readonly event: ScalableEvent;
  /** Finito e ≥ 0. */
  readonly factor: number;
}

/** Fissa P(prende voto). */
export interface SetPPlays {
  readonly kind: "setPPlays";
  readonly playerId: string;
  /** In [0, 1]. */
  readonly pPlays: number;
}

/** Sposta i gol subiti del portiere: la massa su `k` gol diventa `m_k · factor^k`, ri-normalizzata. */
export interface ShiftGoalsConceded {
  readonly kind: "shiftGoalsConceded";
  readonly playerId: string;
  /** Finito e > 0. */
  readonly factor: number;
}

/** L'unione chiusa dei ritocchi che la porta sa fare. */
export type Adjustment = TiltBaseVote | ScaleEvent | SetPPlays | ShiftGoalsConceded;

export type AdjustmentErrorCode =
  /** Il ritocco non si sa leggere: tipo ignoto, campo mancante o del tipo sbagliato. */
  | "malformed_adjustment"
  /** Un numero fuori dai limiti del suo ritocco. */
  | "out_of_bounds"
  /** Nessuna previsione con quell'id nella lista. */
  | "unknown_player"
  /** Due previsioni con lo stesso id: non si sa quale ritoccare. */
  | "duplicate_player"
  /** Il ritocco agisce su una distribuzione e la previsione non ne ha. */
  | "no_distribution"
  /** `shiftGoalsConceded` su chi non ha gol subiti da spostare. */
  | "not_a_goalkeeper"
  /** La media richiesta cade fuori dal supporto del voto: nessuna inclinazione la raggiunge. */
  | "unreachable_mean"
  /** Il conto non produce una distribuzione (non finita, a massa nulla, o la ricerca non converge). */
  | "degenerate_result"
  /** La previsione di un giocatore nominato non rispettava già il contratto. */
  | "invalid_input"
  /** L'uscita di un ritocco non rispetta il contratto. */
  | "invariant_broken";

/** Il rifiuto della porta. `index` è la posizione del ritocco nella lista, o `null` se non riguarda uno solo. */
export class AdjustmentError extends Error {
  constructor(
    readonly code: AdjustmentErrorCode,
    readonly index: number | null,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = "AdjustmentError";
  }
}

/** Tolleranza sulla media raggiunta dall'inclinazione, in voti. Stessa famiglia delle somme di `playerScenario.ts`. */
const TILT_MEAN_TOLERANCE = 1e-9;
/** Passi fissi: il conto non dipende dal caso né dall'orologio, e termina sempre. */
const TILT_MAX_DOUBLINGS = 64;
const TILT_MAX_BISECTIONS = 200;

// ─── LA RIGA MODALE ──────────────────────────────────────────────────────────

/**
 * LA RIGA MODALE DI UNA DISTRIBUZIONE — la regola dei produttori, scritta una
 * seconda volta e confrontata con loro da una prova. Voto base: il massimo
 * (parità: il voto più basso, perché la lista è in ordine crescente e si
 * sostituisce solo con un massimo STRETTAMENTE maggiore). Un evento accade nella
 * riga se la sua probabilità supera 0,5. I gol subiti entrano al valore modale,
 * a −1 l'uno. `+ 0` normalizza un eventuale −0.
 */
export function modalRowOfDistribution(distribution: PlayerDistribution): PlayerForecast["expected"] {
  const masses = distribution.baseVote;
  const first = masses[0];
  if (first === undefined) {
    throw new AdjustmentError(
      "invalid_input",
      null,
      "la distribuzione del voto base è vuota: senza voti non esiste una riga modale.",
    );
  }
  let modalVote = first.vote;
  let top = first.probability;
  for (const mass of masses) {
    if (mass.probability > top) {
      top = mass.probability;
      modalVote = mass.vote;
    }
  }
  const e = distribution.events;
  let delta = 0;
  if (e.pGoal > 0.5) delta += BONUS_MALUS_TARIFF.goal;
  if (e.pAssist > 0.5) delta += BONUS_MALUS_TARIFF.assist;
  if (e.pYellow > 0.5) delta += BONUS_MALUS_TARIFF.yellowCard;
  if (e.pRed > 0.5) delta += BONUS_MALUS_TARIFF.redCard;
  if (e.pOwnGoal > 0.5) delta += BONUS_MALUS_TARIFF.ownGoal;
  if (e.pPenMissed > 0.5) delta += BONUS_MALUS_TARIFF.penaltyMissed;
  if (e.pPenSaved > 0.5) delta += BONUS_MALUS_TARIFF.penaltySaved;
  if (e.goalsConceded !== undefined) {
    let modalGoals = 0;
    for (let goals = 1; goals < e.goalsConceded.length; goals += 1) {
      if ((e.goalsConceded[goals] as number) > (e.goalsConceded[modalGoals] as number)) modalGoals = goals;
    }
    delta += modalGoals * GOAL_CONCEDED_MALUS;
  }
  return {
    baseVote: modalVote,
    fantasyScore: modalVote + delta + 0,
    receivedAnyBonus: e.pGoal > 0.5 || e.pAssist > 0.5 || e.pPenSaved > 0.5,
    missedPenalty: e.pPenMissed > 0.5,
  };
}

// ─── LETTURA E LIMITI DEL RITOCCO ────────────────────────────────────────────

function show(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function malformed(index: number, what: string): AdjustmentError {
  return new AdjustmentError("malformed_adjustment", index, `ritocco n.${index}: ${what}`);
}

function outOfBounds(index: number, adjustment: Adjustment, what: string): AdjustmentError {
  return new AdjustmentError(
    "out_of_bounds",
    index,
    `ritocco n.${index} (${adjustment.kind}) su ${adjustment.playerId}: ${what}`,
  );
}

/**
 * Legge un ritocco che arriva dal di fuori del sistema di tipi (JSON, n8n): il
 * tipo protegge solo chi compila contro questo modulo. Un campo che non si sa
 * leggere si rifiuta; non si corregge.
 */
function checkAdjustment(raw: unknown, index: number): Adjustment {
  if (typeof raw !== "object" || raw === null) throw malformed(index, `non è un oggetto (${show(raw)})`);
  const adjustment = raw as Record<string, unknown>;
  const kind = adjustment["kind"];
  if (typeof adjustment["playerId"] !== "string" || adjustment["playerId"].length === 0) {
    throw malformed(index, `playerId mancante o non valido (${show(adjustment["playerId"])})`);
  }
  const requireNumber = (field: string): number => {
    const value = adjustment[field];
    if (typeof value !== "number") {
      throw malformed(index, `${show(kind)}: «${field}» deve essere un numero (${show(value)})`);
    }
    return value;
  };
  switch (kind) {
    case "tiltBaseVote": {
      const deltaMean = requireNumber("deltaMean");
      const typed = adjustment as unknown as TiltBaseVote;
      if (!Number.isFinite(deltaMean) || Math.abs(deltaMean) > MAX_TILT_DELTA_MEAN) {
        throw outOfBounds(index, typed, `deltaMean ${String(deltaMean)} fuori da [−${MAX_TILT_DELTA_MEAN}, ${MAX_TILT_DELTA_MEAN}]. Il tetto è un passo di reticolo: oltre, quasi sempre è un errore di unità.`);
      }
      return typed;
    }
    case "scaleEvent": {
      const factor = requireNumber("factor");
      const event = adjustment["event"];
      if (typeof event !== "string" || !(SCALABLE_EVENTS as readonly string[]).includes(event)) {
        throw malformed(index, `scaleEvent: event ${show(event)} non è fra ${SCALABLE_EVENTS.join(", ")}`);
      }
      const typed = adjustment as unknown as ScaleEvent;
      if (!Number.isFinite(factor) || factor < 0) {
        throw outOfBounds(index, typed, `factor ${String(factor)} non è un numero finito ≥ 0.`);
      }
      return typed;
    }
    case "setPPlays": {
      const pPlays = requireNumber("pPlays");
      const typed = adjustment as unknown as SetPPlays;
      if (!Number.isFinite(pPlays) || pPlays < 0 || pPlays > 1) {
        throw outOfBounds(index, typed, `pPlays ${String(pPlays)} fuori da [0, 1].`);
      }
      return typed;
    }
    case "shiftGoalsConceded": {
      const factor = requireNumber("factor");
      const typed = adjustment as unknown as ShiftGoalsConceded;
      if (!Number.isFinite(factor) || factor <= 0) {
        throw outOfBounds(index, typed, `factor ${String(factor)} non è un numero finito > 0.`);
      }
      return typed;
    }
    default:
      throw malformed(index, `tipo ${show(kind)} sconosciuto. L'unione è chiusa: tiltBaseVote, scaleEvent, setPPlays, shiftGoalsConceded.`);
  }
}

// ─── CONVALIDA ───────────────────────────────────────────────────────────────

function checkContract(
  forecast: PlayerForecast,
  code: "invalid_input" | "invariant_broken",
  index: number,
  where: string,
): void {
  const distribution = forecast.distribution;
  if (distribution === undefined) return;
  try {
    assertPlayerDistribution(
      {
        id: forecast.id,
        role: forecast.role,
        voteProbability: forecast.voteProbability,
        modalBaseVote: forecast.expected.baseVote,
      },
      distribution,
      where,
    );
  } catch (cause) {
    throw new AdjustmentError(code, index, cause instanceof Error ? cause.message : String(cause), { cause });
  }
}

function needDistribution(forecast: PlayerForecast, adjustment: Adjustment, index: number): PlayerDistribution {
  if (forecast.distribution === undefined) {
    throw new AdjustmentError(
      "no_distribution",
      index,
      `ritocco n.${index} (${adjustment.kind}) su ${forecast.id}: la previsione non ha una distribuzione. ` +
        "Non c'è niente da ritoccare, e ignorarlo in silenzio lascerebbe credere che il ritocco sia entrato.",
    );
  }
  return forecast.distribution;
}

function withDistribution(forecast: PlayerForecast, distribution: PlayerDistribution): PlayerForecast {
  return { ...forecast, expected: modalRowOfDistribution(distribution), distribution };
}

// ─── I QUATTRO CONTI ─────────────────────────────────────────────────────────

/** La media del voto base: la somma pesata, nello stesso ordine di `meanFantasyScoreIfPlays`. */
function meanVote(masses: readonly BaseVoteMass[]): number {
  let mean = 0;
  for (const mass of masses) mean += mass.vote * mass.probability;
  return mean;
}

/**
 * Le masse inclinate di `theta`. L'esponente è riferito all'estremo del supporto
 * verso cui `theta` spinge, quindi è sempre ≤ 0: nessun overflow, a qualunque
 * `theta`. Le masse nulle restano nulle e non entrano nell'esponente — un
 * `Infinity · 0` produrrebbe un NaN dove deve restare uno zero.
 */
function tiltedMasses(masses: readonly BaseVoteMass[], theta: number, low: number, high: number): number[] {
  const reference = theta >= 0 ? high : low;
  const weights = masses.map((mass) =>
    mass.probability > 0 ? mass.probability * Math.exp(theta * (mass.vote - reference)) : 0,
  );
  let total = 0;
  for (const weight of weights) total += weight;
  return weights.map((weight) => weight / total);
}

function tiltBaseVote(
  forecast: PlayerForecast,
  adjustment: TiltBaseVote,
  index: number,
): PlayerForecast {
  const distribution = needDistribution(forecast, adjustment, index);
  const { deltaMean } = adjustment;
  if (deltaMean === 0) return forecast;

  const masses = distribution.baseVote;
  const support = masses.filter((mass) => mass.probability > 0);
  const low = Math.min(...support.map((mass) => mass.vote));
  const high = Math.max(...support.map((mass) => mass.vote));
  const target = meanVote(masses) + deltaMean;
  if (!(target > low && target < high)) {
    throw new AdjustmentError(
      "unreachable_mean",
      index,
      `ritocco n.${index} (tiltBaseVote) su ${forecast.id}: la media richiesta ${target} cade fuori dall'interno ` +
        `del supporto del voto [${low}, ${high}]. Un'inclinazione tiene i voti dove sono e muove la massa fra ` +
        "loro: non raggiunge una media che nessuno di quei voti può dare.",
    );
  }

  const up = deltaMean > 0;
  const reached = (theta: number): boolean => {
    const mean = meanVote(
      tiltedMasses(masses, theta, low, high).map((probability, i) => ({
        vote: (masses[i] as BaseVoteMass).vote,
        probability,
      })),
    );
    return up ? mean >= target : mean <= target;
  };
  // Si allarga l'intervallo finché contiene la soluzione, poi si bisseca a passi fissi.
  let near = 0;
  let far = up ? 1 : -1;
  for (let step = 0; step < TILT_MAX_DOUBLINGS && !reached(far); step += 1) {
    near = far;
    far *= 2;
  }
  if (!reached(far)) {
    throw new AdjustmentError(
      "degenerate_result",
      index,
      `ritocco n.${index} (tiltBaseVote) su ${forecast.id}: la ricerca dell'inclinazione non ha trovato un intervallo che contenga la media ${target}.`,
    );
  }
  for (let step = 0; step < TILT_MAX_BISECTIONS; step += 1) {
    const middle = (near + far) / 2;
    if (middle === near || middle === far) break;
    if (reached(middle)) far = middle;
    else near = middle;
  }
  const probabilities = tiltedMasses(masses, (near + far) / 2, low, high);
  const tilted = masses.map((mass, i) => ({ vote: mass.vote, probability: probabilities[i] as number }));
  const achieved = meanVote(tilted);
  if (!Number.isFinite(achieved) || Math.abs(achieved - target) > TILT_MEAN_TOLERANCE) {
    throw new AdjustmentError(
      "degenerate_result",
      index,
      `ritocco n.${index} (tiltBaseVote) su ${forecast.id}: l'inclinazione ha raggiunto la media ${achieved} invece di ${target}.`,
    );
  }
  return withDistribution(forecast, { ...distribution, baseVote: tilted });
}

function scaleEvent(forecast: PlayerForecast, adjustment: ScaleEvent, index: number): PlayerForecast {
  const distribution = needDistribution(forecast, adjustment, index);
  const current = distribution.events[adjustment.event];
  const scaled = Math.min(1, current * adjustment.factor);
  if (scaled === current) return forecast;
  const events = { ...distribution.events, [adjustment.event]: scaled } as PlayerEventRates;
  return withDistribution(forecast, { ...distribution, events });
}

function setPPlays(forecast: PlayerForecast, adjustment: SetPPlays): PlayerForecast {
  const target = adjustment.pPlays;
  const distribution = forecast.distribution;
  if (distribution === undefined) {
    return target === forecast.voteProbability ? forecast : { ...forecast, voteProbability: target };
  }
  if (target === distribution.pPlays && target === forecast.voteProbability) return forecast;
  const before = distribution.pPlays;
  const ratio = before > 0 ? target / before : null;
  return {
    ...withDistribution(forecast, {
      ...distribution,
      pPlays: target,
      pStarter: ratio === null ? distribution.pStarter : distribution.pStarter * ratio,
      pSub: ratio === null ? distribution.pSub : distribution.pSub * ratio,
    }),
    voteProbability: target,
  };
}

function shiftGoalsConceded(
  forecast: PlayerForecast,
  adjustment: ShiftGoalsConceded,
  index: number,
): PlayerForecast {
  const distribution = needDistribution(forecast, adjustment, index);
  const conceded = distribution.events.goalsConceded;
  if (conceded === undefined) {
    throw new AdjustmentError(
      "not_a_goalkeeper",
      index,
      `ritocco n.${index} (shiftGoalsConceded) su ${forecast.id}: ruolo ${forecast.role}, nessun gol subito da spostare. ` +
        "I gol subiti sono del solo portiere (§12-bis).",
    );
  }
  const inclined = conceded.map((mass, goals) => mass * Math.pow(adjustment.factor, goals));
  let total = 0;
  for (const mass of inclined) total += mass;
  if (!Number.isFinite(total) || total <= 0 || inclined.some((mass) => !Number.isFinite(mass))) {
    throw new AdjustmentError(
      "degenerate_result",
      index,
      `ritocco n.${index} (shiftGoalsConceded) su ${forecast.id}: con factor ${adjustment.factor} le masse non danno ` +
        `una distribuzione (somma ${total}).`,
    );
  }
  const goalsConceded = inclined.map((mass) => mass / total);
  return withDistribution(forecast, { ...distribution, events: { ...distribution.events, goalsConceded } });
}

function applyOne(forecast: PlayerForecast, adjustment: Adjustment, index: number): PlayerForecast {
  switch (adjustment.kind) {
    case "tiltBaseVote":
      return tiltBaseVote(forecast, adjustment, index);
    case "scaleEvent":
      return scaleEvent(forecast, adjustment, index);
    case "setPPlays":
      return setPPlays(forecast, adjustment);
    case "shiftGoalsConceded":
      return shiftGoalsConceded(forecast, adjustment, index);
  }
}

// ─── LA PORTA ────────────────────────────────────────────────────────────────

/**
 * Applica i ritocchi, NELL'ORDINE della lista, e restituisce le previsioni
 * ritoccate nello stesso ordine in cui sono arrivate. Pura e atomica; vedi la
 * testa del file per identità, invarianti e limiti.
 */
export function applyAdjustments(
  forecasts: readonly PlayerForecast[],
  adjustments: readonly Adjustment[],
): readonly PlayerForecast[] {
  if (adjustments.length === 0) return forecasts;

  const positionById = new Map<string, number>();
  forecasts.forEach((forecast, position) => {
    if (positionById.has(forecast.id)) {
      throw new AdjustmentError(
        "duplicate_player",
        null,
        `id duplicato ${forecast.id} nelle previsioni: non si sa quale dei due ritoccare.`,
      );
    }
    positionById.set(forecast.id, position);
  });

  const changed = new Map<number, PlayerForecast>();
  const checkedInput = new Set<number>();
  adjustments.forEach((raw, index) => {
    const adjustment = checkAdjustment(raw, index);
    const position = positionById.get(adjustment.playerId);
    if (position === undefined) {
      throw new AdjustmentError(
        "unknown_player",
        index,
        `ritocco n.${index} (${adjustment.kind}): nessuna previsione con id ${adjustment.playerId}.`,
      );
    }
    const before = changed.get(position) ?? (forecasts[position] as PlayerForecast);
    if (!checkedInput.has(position)) {
      checkContract(before, "invalid_input", index, `ritocco n.${index}: previsione in ingresso di ${before.id}`);
      checkedInput.add(position);
    }
    const after = applyOne(before, adjustment, index);
    if (after === before) return;
    checkContract(after, "invariant_broken", index, `ritocco n.${index} (${adjustment.kind}): uscita di ${after.id}`);
    changed.set(position, after);
  });

  if (changed.size === 0) return forecasts;
  return forecasts.map((forecast, position) => changed.get(position) ?? forecast);
}
