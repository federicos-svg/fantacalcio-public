// FORMAZIONE OSSERVATA, INVIO E READ-BACK — la parte del contratto che serve
// per accorgersi che è andata storta.
//
// IL PROBLEMA CHE RISOLVE. Fra «il Coach ha scelto questa formazione» e «la
// lega gioca questa formazione» ci sono un invio e una piattaforma, e nessuno
// dei due è affidabile per fede: la formazione può essere accettata a metà,
// riordinata, troncata, o accettata per una competizione sola. L'unico modo
// onesto di sapere com'è andata è **rileggerla** e confrontarla con quella che
// si voleva. `diffLineups` è quel confronto, e `SubmitOutcome` è la sua
// risposta dichiarata.
//
// DUE COMPETIZIONI, DUE COSE DIVERSE. La lega ha campionato (§22) e Coppa di
// Lega (§23), e nelle giornate di coppa si schierano due formazioni per due
// partite. Per questo una formazione porta **sia** la competizione a cui è
// destinata (`competitionId`) **sia** il flag «vale per tutte le competizioni».
// Non sono la stessa informazione e nessuna si deduce dall'altra: la prima dice
// per quale partita è stata calcolata, il secondo dice che cosa la piattaforma
// ne farà. Una formazione con `allCompetitions: true` resta calcolata contro un
// avversario preciso — quello della sua competizione — e usarla anche per
// l'altra partita è una scelta di chi invia, dichiarata da quel flag, non una
// proprietà del calcolo. `diffLineups` confronta entrambi.
//
// L'ORDINE DELLA PANCHINA È DATO, NON PRESENTAZIONE. §10 dà cinque
// sostituzioni e vieta il cambio modulo: quando i senza voto sono più delle
// sostituzioni disponibili, chi entra e chi resta fuori lo decide **l'ordine
// della panchina**, l'unica preferenza che il regolamento ci concede. Per
// questo il confronto è **indice per indice** e non insiemistico: due panchine
// con gli stessi nomi in ordine diverso sono due formazioni diverse, e una
// diff che le dicesse uguali nasconderebbe esattamente il caso in cui la
// piattaforma ha riordinato ciò che avevamo scelto.
//
// NIENTE RETE, QUI DENTRO. Non c'è invio: c'è la forma di ciò che si invia e la
// classificazione di ciò che si rilegge. Chi parla con la piattaforma sta nel
// layer privato, e questo file non sa né dove né come.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import {
  LEAGUE_RULE_VERSION,
  type LeagueRuleVersion,
} from "../../league-gameweek/src/leagueGameweek.js";
import type { Lineup } from "../../league-gameweek/src/gameweekSimulator.js";

/**
 * Opzioni della formazione che la piattaforma espone e che non cambiano il
 * punteggio ma cambiano l'effetto dell'invio.
 */
export interface LineupFlags {
  /** «Formazione nascosta»: gli avversari non la vedono prima della deadline. */
  readonly hidden: boolean;
  /** «Vale per tutte le competizioni»: campionato e coppa insieme. */
  readonly allCompetitions: boolean;
}

/**
 * Una formazione come la piattaforma la mostra. Stessa forma di `Lineup`, più i
 * flag: è deliberatamente una struttura a sé e non un'estensione, perché
 * `Lineup` è ciò che il motore di punteggio consuma e non deve imparare cose
 * che riguardano solo l'invio.
 */
export interface ObservedLineup {
  /** Competizione a cui questa formazione è destinata. Id opaco. */
  readonly competitionId: string;
  readonly module: Module;
  readonly goalkeeperId: string;
  /** Titolari di movimento, nell'ordine dichiarato. */
  readonly starterIds: readonly string[];
  /** Panchina, nell'ordine dichiarato: il primo utile entra per primo. */
  readonly benchIds: readonly string[];
  readonly flags: LineupFlags;
}

/** Ciò che si intende inviare, per una giornata dichiarata. */
export interface LineupSubmission {
  readonly matchday: number;
  /**
   * La competizione dell'invio. È lo stesso valore che porta la formazione, ed
   * è ripetuto qui perché la coppia (competizione, giornata) è la chiave della
   * partita: `toSubmission` rifiuta di costruire un invio in cui i due non
   * coincidono, invece di sceglierne uno.
   */
  readonly competitionId: string;
  readonly lineup: ObservedLineup;
  /**
   * La versione del regolamento su cui la formazione è stata calcolata. Una
   * formazione senza la versione della regola che l'ha prodotta non è
   * verificabile a posteriori.
   */
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * La formazione scelta dal motore, più la competizione a cui è destinata e le
 * opzioni di invio. La competizione è un parametro a sé e non un flag: `Lineup`
 * non la conosce — il motore di punteggio calcola una partita, non sa quante ne
 * ha la lega — e dedurla qui sarebbe inventarla.
 */
export function fromLineup(
  lineup: Lineup,
  competitionId: string,
  flags: LineupFlags,
): ObservedLineup {
  if (competitionId.length === 0) {
    throw new Error("competizione non dichiarata: una formazione è sempre per una partita precisa");
  }
  return {
    competitionId,
    module: lineup.module,
    goalkeeperId: lineup.goalkeeperId,
    starterIds: [...lineup.starterIds],
    benchIds: [...lineup.benchIds],
    flags: { hidden: flags.hidden, allCompetitions: flags.allCompetitions },
  };
}

/**
 * Un invio dichiarato per una (competizione, giornata). Fail-closed sulla
 * giornata e sulla coerenza fra la competizione dell'invio e quella della
 * formazione: due valori diversi significano che la formazione è stata
 * calcolata per l'altra partita, e in una giornata di coppa è l'errore che
 * costa entrambe.
 */
export function toSubmission(
  matchday: number,
  competitionId: string,
  lineup: ObservedLineup,
): LineupSubmission {
  if (!Number.isInteger(matchday) || matchday < 1) {
    throw new Error(`giornata non valida: ${matchday}`);
  }
  if (lineup.competitionId !== competitionId) {
    throw new Error(
      `invio per la competizione ${competitionId} con una formazione calcolata per ${lineup.competitionId}`,
    );
  }
  return { matchday, competitionId, lineup, leagueRuleVersion: LEAGUE_RULE_VERSION };
}

/** Che cosa si sta confrontando. Le liste portano anche l'indice. */
export type LineupField =
  | "competitionId"
  | "module"
  | "goalkeeperId"
  | "starterIds"
  | "benchIds"
  | "flags.hidden"
  | "flags.allCompetitions";

/**
 * Una posizione in cui le due formazioni non dicono la stessa cosa. `null` su
 * un valore significa «questa formazione non ha nulla a quell'indice»: una
 * panchina più corta di quella che si voleva è una differenza, non un pareggio.
 */
export interface LineupDifference {
  readonly field: LineupField;
  /** Indice nella lista; `null` sui campi scalari. */
  readonly index: number | null;
  readonly a: string | boolean | null;
  readonly b: string | boolean | null;
}

function diffOrderedIds(
  field: "starterIds" | "benchIds",
  a: readonly string[],
  b: readonly string[],
): readonly LineupDifference[] {
  const differences: LineupDifference[] = [];
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? null;
    const right = b[index] ?? null;
    if (left !== right) differences.push({ field, index, a: left, b: right });
  }
  return differences;
}

/**
 * Confronto **indice per indice** fra due formazioni.
 *
 * Restituisce le posizioni diverse, vuoto se sono la stessa formazione. È la
 * funzione che il read-back usa per dire se ciò che è stato salvato è ciò che
 * si voleva: `a` è l'intenzione, `b` la rilettura.
 */
export function diffLineups(a: ObservedLineup, b: ObservedLineup): readonly LineupDifference[] {
  const differences: LineupDifference[] = [];
  if (a.competitionId !== b.competitionId) {
    differences.push({
      field: "competitionId",
      index: null,
      a: a.competitionId,
      b: b.competitionId,
    });
  }
  if (a.module !== b.module) {
    differences.push({ field: "module", index: null, a: a.module, b: b.module });
  }
  if (a.goalkeeperId !== b.goalkeeperId) {
    differences.push({ field: "goalkeeperId", index: null, a: a.goalkeeperId, b: b.goalkeeperId });
  }
  differences.push(...diffOrderedIds("starterIds", a.starterIds, b.starterIds));
  differences.push(...diffOrderedIds("benchIds", a.benchIds, b.benchIds));
  if (a.flags.hidden !== b.flags.hidden) {
    differences.push({ field: "flags.hidden", index: null, a: a.flags.hidden, b: b.flags.hidden });
  }
  if (a.flags.allCompetitions !== b.flags.allCompetitions) {
    differences.push({
      field: "flags.allCompetitions",
      index: null,
      a: a.flags.allCompetitions,
      b: b.flags.allCompetitions,
    });
  }
  return differences;
}

/**
 * Esito dichiarato di un invio.
 *
 * - `confermato` — la rilettura coincide, posizione per posizione;
 * - `divergente` — l'invio è passato ma ciò che sta sulla piattaforma non è
 *   ciò che si voleva: le differenze sono elencate, e nessuna viene «accettata»
 *   in silenzio;
 * - `rifiutato` — la piattaforma non ha accettato l'invio;
 * - `non_tentato` — l'invio non è mai partito. È lo stato del fail-closed a
 *   monte (`safeToPlay: false`, previsione mancante, giornata non nota), e
 *   tenerlo distinto da `rifiutato` conta: «non abbiamo provato» e «ci hanno
 *   detto di no» hanno cause e rimedi opposti.
 */
export type SubmitStatus = "confermato" | "divergente" | "rifiutato" | "non_tentato";

export interface SubmitOutcome {
  readonly status: SubmitStatus;
  /** Vuoto salvo su `divergente`. */
  readonly differences: readonly LineupDifference[];
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/** Classifica una rilettura. Pura: non rilegge nulla, riceve la rilettura. */
export function outcomeFromReadBack(
  intended: ObservedLineup,
  readBack: ObservedLineup,
): SubmitOutcome {
  const differences = diffLineups(intended, readBack);
  if (differences.length === 0) {
    return {
      status: "confermato",
      differences: [],
      reason: "rilettura identica alla formazione voluta",
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  return {
    status: "divergente",
    differences,
    reason: `rilettura diversa in ${differences.length} posizioni`,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/** L'invio è partito e la piattaforma lo ha respinto. */
export function rejectedOutcome(reason: string): SubmitOutcome {
  return { status: "rifiutato", differences: [], reason, leagueRuleVersion: LEAGUE_RULE_VERSION };
}

/** L'invio non è mai partito, e il perché è dichiarato. */
export function notAttemptedOutcome(reason: string): SubmitOutcome {
  return { status: "non_tentato", differences: [], reason, leagueRuleVersion: LEAGUE_RULE_VERSION };
}
