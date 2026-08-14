// TENSIONE — indice 1 di Owner, «appetibilità del momento» dal punto di vista
// del tavolo (docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §1, §4.1, riga 2 di §8).
// Puro, deterministico, engine-only.
//
// FORMA IMPOSTA DAL DESIGN (§4.1, §5): «banda qualitativa (bassa/media/alta) +
// ancora corrente misurata e inflazione misurata + i 2-3 driver in chiaro, mai
// un numero secco senza perché». Questo modulo produce esattamente quello.
//
// PERCHÉ NON C'È UN PUNTEGGIO. Un punteggio 0-100 di tensione richiederebbe
// pesi per combinare scarsità, rivali, cliff e inflazione: pesi che nessun
// dato di questo progetto ha mai calibrato e che il sistema sceglierebbe da sé
// — «qualunque score senza provenienza» è esattamente ciò che
// docs/DECISIONS.md §D9 vieta. Qui la banda esce da un CONTEGGIO di condizioni
// deterministiche, ognuna con la propria soglia dichiarata, il proprio valore
// misurato e il proprio campione: ogni driver è verificabile da solo, e la
// banda è solo «quanti di questi fatti sono veri adesso».
//
// COLD START, e cosa NON fa. Un driver che non si può misurare è `available:
// false` con il proprio motivo, NON un falso: non viene contato né fra i
// triggerati né fra i valutati. Conseguenza dichiarata e verificata nei test:
// una copertura bassa può solo SOTTOSTIMARE la tensione, mai gonfiarla. Sotto
// `MIN_TENSION_DRIVERS` driver valutabili la banda non esiste (`null` con
// motivo): meglio nessuna banda che una banda su un solo fatto.
//
// Nota onesta sulla soglia: con i QUATTRO driver di oggi due sono sempre
// misurabili (rivali eleggibili e cliff dipendono solo da stato e listino),
// quindi `MIN_TENSION_DRIVERS = 2` è un PAVIMENTO che oggi non taglia mai —
// non un filtro che scatta a sorpresa. L'invariante è verificata nei test
// (`evaluatedCount >= MIN_TENSION_DRIVERS` su tutti gli scenari, cold start
// incluso); la soglia resta scritta perché un domani con driver diversi la
// banda non debba poter uscire da un fatto solo.

import { type AuctionState, type Role } from "./types.js";
import {
  type AnchorBook,
  type CurrentAnchor,
  type InflationUnavailableReason,
  type MeasuredInflation,
  currentAnchor,
} from "./anchors.js";
import { type CliffFacts, CLIFF_GAP_RATIO, availableAnchoredInRole, cliffFacts } from "./cliff.js";
import { competitorSet } from "./competitors.js";

/** Offerta residua per slot residuo del ruolo: sotto questa quota il ruolo è teso. */
export const TENSION_SUPPLY_RATIO_TIGHT = 1.5;
/** Da quanti rivali eleggibili in su la contesa conta come affollata. */
export const TENSION_MANY_COMPETITORS = 3;
/** Da quale inflazione misurata di ruolo in su il ruolo conta come «caldo». */
export const TENSION_HOT_INFLATION = 0.1;
/** Driver triggerati da cui in su la banda è «alta». */
export const TENSION_HIGH_TRIGGERS = 3;
/** Sotto questo numero di driver valutabili non si emette nessuna banda. */
export const MIN_TENSION_DRIVERS = 2;

export type TensionDriverId =
  | "role-supply-tight" // giocatori ancorati rimasti nel ruolo per slot ancora da riempire al tavolo
  | "many-eligible-competitors" // quante squadre possono davvero arrivare all'ancora corrente
  | "cliff-after" // dopo di lui la scala delle ancore fa un salto
  | "role-inflation-hot"; // il ruolo sta pagando sopra le quotazioni, con campione sufficiente

export type TensionDriverUnavailableReason =
  | "no-remaining-demand" // nessuno slot residuo del ruolo al tavolo: la scarsità non ha denominatore
  | InflationUnavailableReason;

export interface TensionDriver {
  readonly id: TensionDriverId;
  /** Misurabile adesso? Un driver non misurabile non è un driver falso. */
  readonly available: boolean;
  readonly triggered: boolean;
  /** Il valore misurato che la soglia confronta (`null` se non misurabile). */
  readonly value: number | null;
  readonly threshold: number;
  /** Campione dietro il valore, dove il driver ne ha uno (`null` altrimenti). */
  readonly n: number | null;
  readonly unavailableReason: TensionDriverUnavailableReason | null;
}

export type TensionBand = "bassa" | "media" | "alta";

export type TensionUnavailableReason =
  | "insufficient-drivers" // meno di MIN_TENSION_DRIVERS driver valutabili
  | "player-not-available"; // già venduto o riconfermato: non c'è nessuna contesa in corso

export interface TensionAssessment {
  readonly playerId: string;
  readonly role: Role;
  /** `null` = n/d motivato, mai una banda di ripiego. */
  readonly band: TensionBand | null;
  readonly reason: TensionUnavailableReason | null;
  readonly triggeredCount: number;
  readonly evaluatedCount: number;
  /** Tutti i driver, sempre nello stesso ordine: quelli non misurabili inclusi, dichiarati. */
  readonly drivers: readonly TensionDriver[];
  /** L'ancora corrente mostrata accanto alla banda (§4.1), con la propria provenienza. */
  readonly anchor: CurrentAnchor;
  readonly cliff: CliffFacts;
}

export interface TensionInput {
  readonly playerId: string;
  readonly book: AnchorBook;
  readonly state: AuctionState;
  readonly inflation: MeasuredInflation;
  /** La propria squadra, esclusa dal conteggio dei rivali eleggibili. */
  readonly selfId?: string;
}

/**
 * La tensione su un giocatore, adesso. Restituisce `null` solo quando il
 * giocatore non ha un'ancora: senza Qt.A non esiste né ancora corrente né
 * scala su cui misurare il cliff, e inventarne una sarebbe una feature
 * imputata (§D9).
 *
 * Deterministica: stesso stato + stesso listino + stessa inflazione → stessa
 * banda e stessi driver, sempre.
 */
export function tension(input: TensionInput): TensionAssessment | null {
  const { playerId, book, state, inflation, selfId } = input;
  const anchor = currentAnchor(playerId, book, inflation);
  if (anchor === null) return null;
  const cliff = cliffFacts(playerId, book, state);
  if (cliff === null) return null; // irraggiungibile: stessa condizione di anchor

  const role: Role = anchor.role;

  // Driver 1 — scarsità: offerta ancorata residua per slot residuo del ruolo
  // al tavolo. La domanda include OGNI squadra, anche la propria: la scarsità
  // è del tavolo, non dei soli rivali. Senza slot residui il rapporto non ha
  // denominatore, e il driver si dichiara non misurabile invece di valere 0.
  let leagueSlotsRemaining = 0;
  for (const team of Object.values(state.teams)) {
    leagueSlotsRemaining += team.slotsRemaining[role];
  }
  const supplyRemaining = availableAnchoredInRole(role, book, state);
  const supplyRatio = leagueSlotsRemaining === 0 ? null : supplyRemaining / leagueSlotsRemaining;
  const supplyDriver: TensionDriver = {
    id: "role-supply-tight",
    available: supplyRatio !== null,
    triggered: supplyRatio !== null && supplyRatio <= TENSION_SUPPLY_RATIO_TIGHT,
    value: supplyRatio,
    threshold: TENSION_SUPPLY_RATIO_TIGHT,
    n: supplyRemaining,
    unavailableReason: supplyRatio === null ? "no-remaining-demand" : null,
  };

  // Driver 2 — quanti rivali possono davvero arrivare all'ancora corrente.
  // Vincolo duro puro: slot aperto + max bid vero. Sempre misurabile.
  const competitors = competitorSet(state, role, anchor.correctedAnchor, selfId);
  const competitorDriver: TensionDriver = {
    id: "many-eligible-competitors",
    available: true,
    triggered: competitors.eligibleCount >= TENSION_MANY_COMPETITORS,
    value: competitors.eligibleCount,
    threshold: TENSION_MANY_COMPETITORS,
    // Qui `n` non è un campione statistico ma la platea esaminata: quante
    // squadre sono state valutate per produrre quel conteggio. Il driver è
    // censuario, non campionario — e va detto, non lasciato intendere.
    n: competitors.eligibleCount + competitors.excluded.length,
    unavailableReason: null,
  };

  // Driver 3 — cliff: il salto verso la migliore alternativa disponibile.
  // `value` è `null` quando non resta nessun altro del ruolo (`last-of-role`),
  // caso in cui il driver è triggerato senza un rapporto da mostrare.
  const cliffDriver: TensionDriver = {
    id: "cliff-after",
    available: true,
    triggered: cliff.isCliff,
    value: cliff.gapRatio,
    threshold: CLIFF_GAP_RATIO,
    n: cliff.othersAvailableInRole,
    unavailableReason: null,
  };

  // Driver 4 — inflazione misurata del ruolo, col proprio cold start.
  const roleInflation = inflation.perRole[role];
  const inflationDriver: TensionDriver = {
    id: "role-inflation-hot",
    available: roleInflation.sufficient,
    triggered: roleInflation.inflation !== null && roleInflation.inflation >= TENSION_HOT_INFLATION,
    value: roleInflation.inflation,
    threshold: TENSION_HOT_INFLATION,
    n: roleInflation.n,
    unavailableReason: roleInflation.reason,
  };

  const drivers: readonly TensionDriver[] = [
    supplyDriver,
    competitorDriver,
    cliffDriver,
    inflationDriver,
  ];
  const evaluatedCount = drivers.filter((d) => d.available).length;
  const triggeredCount = drivers.filter((d) => d.available && d.triggered).length;

  const notAvailable = !cliff.playerAvailable;
  const insufficient = evaluatedCount < MIN_TENSION_DRIVERS;
  const reason: TensionUnavailableReason | null = notAvailable
    ? "player-not-available"
    : insufficient
      ? "insufficient-drivers"
      : null;

  const band: TensionBand | null =
    reason !== null
      ? null
      : triggeredCount >= TENSION_HIGH_TRIGGERS
        ? "alta"
        : triggeredCount >= 1
          ? "media"
          : "bassa";

  return {
    playerId,
    role,
    band,
    reason,
    triggeredCount,
    evaluatedCount,
    drivers,
    anchor,
    cliff,
  };
}
