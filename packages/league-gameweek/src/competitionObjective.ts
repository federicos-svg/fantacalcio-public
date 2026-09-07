// L'OBIETTIVO PER COMPETIZIONE — WP-1 della corsia «generatore della formazione».
//
// PERCHÉ ESISTE. Fino a qui il produttore aveva un obiettivo solo: i punti di
// lega di §22, 3 / 1 / 0. È l'obiettivo giusto in campionato e nei gironi di
// coppa, e NON è l'obiettivo giusto nelle eliminazioni dirette, dove non si
// raccolgono punti: si passa il turno o si va a casa. Massimizzare i punti di
// una gara di ritorno che si vince 3-2 quando all'andata si è perso 0-2
// significa massimizzare la cosa sbagliata.
//
// LA REGOLA DELLE REGOLE DI QUESTO FILE: dove il regolamento tace, il codice
// tace. Un esito che il regolamento non copre NON produce un numero
// plausibile: produce `decided: false` con la sua ragione, la sua massa di
// probabilità resta dichiarata e non viene attribuita a nessuno dei due. Vale
// per il secondo livello di parità del doppio confronto
// (`cup_tie_break_two_legged_second_level: UNSPECIFIED`, LEAGUE_RULES §23) e
// per lo stato di coppa ignoto, che non si deduce dal calendario ma si
// dichiara.
//
// QUEL CHE INVECE È DECISO, E QUINDI NON È UN BUCO: nella finale in gara secca
// la parità **vale zero**. Non è un'omissione mascherata da regola: §23 rinvia
// a una pagina esterna per supplementari e rigori e §27 punto 8 VIETA di
// ricostruirla, quindi il generatore non sa che cosa succede dopo il pareggio e
// non lo simula. Contare zero significa «un pareggio non è un passaggio del
// turno che io sappia calcolare», ed è dichiarato qui e nell'etichetta
// dell'obiettivo, non nascosto in una costante.

import type { GameweekOutcome } from "./gameweekSimulator.js";
import { LEAGUE_RULE_VERSION, type LeagueRuleVersion } from "./leagueGameweek.js";
import { type DeclaredLeaguePoints, assertDeclaredLeaguePoints, leaguePointsOf } from "./lineupOptimizer.js";

/**
 * Lo stato NOTO della gara d'andata di un doppio confronto. Non si stima e non
 * si simula: è una partita già giocata, e i suoi quattro numeri si leggono.
 *
 * `ourScore` e `theirScore` sono i **punteggi finali di squadra**, modificatori
 * inclusi — la lettura registrata in LEAGUE_RULES §23
 * (`cup_tie_break_two_legged_score_basis: FINAL_TEAM_SCORE_WITH_MODIFIERS`), che
 * è dichiarata lì come interpretazione dell'Executive e contestabile. Qui si
 * consuma quella lettura, non se ne inventa un'altra.
 */
export interface CupFirstLegState {
  readonly ourGoals: number;
  readonly theirGoals: number;
  readonly ourScore: number;
  readonly theirScore: number;
}

/**
 * Che cosa si sta giocando, e quindi che cosa si massimizza.
 *
 * `cup_unknown` NON è un ripiego pigro: le giornate di coppa **si osservano**
 * (LEAGUE_RULES §23, emendamento del 2026-09-04) e finché non sono osservate il
 * sistema non finge di saperle. Chi non sa in che competizione è lo dichiara
 * qui, riceve l'obiettivo del campionato e se lo vede scritto nell'etichetta.
 */
export type CompetitionObjective =
  /** Campionato: 3 · P(vittoria) + 1 · P(pareggio) — §22. */
  | { readonly kind: "league" }
  /** Girone di coppa: stessa forma del campionato, §23 `cup_group_points_*`. */
  | { readonly kind: "cup_group" }
  /** Gara di RITORNO di un doppio confronto: P(passaggio del turno), andata nota. */
  | { readonly kind: "cup_knockout_second_leg"; readonly firstLeg: CupFirstLegState }
  /** Finale in gara secca: P(vittoria); la parità vale zero, dichiarata. */
  | { readonly kind: "cup_single_match_final" }
  /** Stato della coppa ignoto: obiettivo del campionato, e lo si dichiara. */
  | { readonly kind: "cup_unknown" };

export type CompetitionObjectiveKind = CompetitionObjective["kind"];

/** L'obiettivo di default quando il chiamante non dichiara nulla: il campionato. */
export const LEAGUE_OBJECTIVE: CompetitionObjective = { kind: "league" };

/**
 * L'unità di misura dell'obiettivo. Serve a chi legge un numero: `1.2` è
 * «punti di lega attesi» in campionato e «probabilità» in eliminazione diretta,
 * e confondere le due cose vuol dire confrontare due stagioni diverse.
 */
export type ObjectiveUnit = "LEAGUE_POINTS" | "PROBABILITY";

export interface CompetitionObjectiveDescription {
  readonly kind: CompetitionObjectiveKind;
  readonly unit: ObjectiveUnit;
  readonly label: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

export function describeCompetitionObjective(
  competition: CompetitionObjective,
  points: DeclaredLeaguePoints,
): CompetitionObjectiveDescription {
  const leagueLabel =
    `punti di lega attesi (V ${points.win} / N ${points.draw} / P ${points.loss}), ` +
    "pareggi rotti da punteggio totale atteso e varianza minore (§3.2 del disegno; criteri di classifica §22)";
  switch (competition.kind) {
    case "league":
      return { kind: "league", unit: "LEAGUE_POINTS", label: leagueLabel, leagueRuleVersion: LEAGUE_RULE_VERSION };
    case "cup_group":
      return {
        kind: "cup_group",
        unit: "LEAGUE_POINTS",
        label: `girone di coppa: ${leagueLabel}. §23 dichiara 3 / 1 / 0 anche in coppa — per dichiarazione di Pico, non per analogia con §22`,
        leagueRuleVersion: LEAGUE_RULE_VERSION,
      };
    case "cup_knockout_second_leg":
      return {
        kind: "cup_knockout_second_leg",
        unit: "PROBABILITY",
        label:
          "gara di ritorno di un doppio confronto: si massimizza P(passaggio del turno) con l'andata " +
          `come stato noto (${competition.firstLeg.ourGoals}-${competition.firstLeg.theirGoals} in goal, ` +
          `${competition.firstLeg.ourScore} a ${competition.firstLeg.theirScore} in punteggio). ` +
          "Punti sulle due gare, poi somma dei punteggi fantacalcio (§23); la parità ANCHE nella somma " +
          "resta UNSPECIFIED e non viene attribuita: l'obiettivo è un minorante dichiarato",
        leagueRuleVersion: LEAGUE_RULE_VERSION,
      };
    case "cup_single_match_final":
      return {
        kind: "cup_single_match_final",
        unit: "PROBABILITY",
        label:
          "finale in gara secca: si massimizza P(vittoria). La PARITÀ VALE ZERO: §23 rinvia a una pagina " +
          "esterna per supplementari e rigori e §27 punto 8 vieta di ricostruirla, quindi il generatore " +
          "non sa calcolare che cosa segue un pareggio e non lo finge",
        leagueRuleVersion: LEAGUE_RULE_VERSION,
      };
    case "cup_unknown":
      return {
        kind: "cup_unknown",
        unit: "LEAGUE_POINTS",
        label:
          "STATO DELLA COPPA IGNOTO, DICHIARATO: le giornate di coppa si osservano (§23, emendamento del " +
          `2026-09-04) e qui non sono osservate. Si usa l'obiettivo del campionato — ${leagueLabel} — e lo si scrive`,
        leagueRuleVersion: LEAGUE_RULE_VERSION,
      };
  }
}

/**
 * Il contributo di UNO scenario all'obiettivo.
 *
 * `decided: false` non è zero e non è «pareggio»: è «il regolamento non copre
 * questo esito». La sua massa si accumula a parte e si dichiara; non la si
 * assegna né a noi né a loro.
 */
export interface ScenarioObjectiveValue {
  readonly value: number;
  readonly decided: boolean;
  readonly reason: string;
}

const DECIDED = (value: number, reason: string): ScenarioObjectiveValue => ({ value, decided: true, reason });

function pointsFor(ourGoals: number, theirGoals: number, points: DeclaredLeaguePoints): number {
  if (ourGoals > theirGoals) return points.win;
  if (ourGoals === theirGoals) return points.draw;
  return points.loss;
}

function assertFirstLeg(firstLeg: CupFirstLegState): void {
  const numbers: ReadonlyArray<readonly [string, number]> = [
    ["ourGoals", firstLeg.ourGoals],
    ["theirGoals", firstLeg.theirGoals],
    ["ourScore", firstLeg.ourScore],
    ["theirScore", firstLeg.theirScore],
  ];
  for (const [name, value] of numbers) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `andata: ${name} non è un numero finito (${String(value)}). Lo stato dell'andata è una partita ` +
          "già giocata e si legge: se non lo si ha, l'obiettivo del doppio confronto non è calcolabile e " +
          "si dichiara `cup_unknown` invece di riempirlo.",
      );
    }
  }
  for (const [name, value] of [
    ["ourGoals", firstLeg.ourGoals],
    ["theirGoals", firstLeg.theirGoals],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`andata: ${name} deve essere un intero non negativo (${String(value)}).`);
    }
  }
}

/**
 * IL CONTRIBUTO DI UNO SCENARIO, secondo la competizione dichiarata.
 *
 * Campionato, girone di coppa e coppa ignota condividono la stessa forma —
 * i punti di lega dell'esito — e differiscono solo nell'etichetta, perché
 * differiscono solo in quel che il lettore deve sapere di star leggendo.
 */
export function scenarioObjectiveValue(
  outcome: GameweekOutcome,
  competition: CompetitionObjective,
  points: DeclaredLeaguePoints,
): ScenarioObjectiveValue {
  assertDeclaredLeaguePoints(points);
  switch (competition.kind) {
    case "league":
    case "cup_group":
    case "cup_unknown":
      return DECIDED(leaguePointsOf(outcome, points).value, "punti di lega dell'esito");

    case "cup_single_match_final":
      // La parità vale zero, e la ragione sta in testa al file.
      return DECIDED(
        outcome.ourGoals > outcome.theirGoals ? 1 : 0,
        outcome.ourGoals > outcome.theirGoals
          ? "vittoria in gara secca"
          : outcome.ourGoals === outcome.theirGoals
            ? "parità in gara secca: vale zero, la regola su supplementari e rigori è esterna e non si ricostruisce (§27 punto 8)"
            : "sconfitta in gara secca",
      );

    case "cup_knockout_second_leg": {
      const { firstLeg } = competition;
      assertFirstLeg(firstLeg);
      const ourPoints = pointsFor(firstLeg.ourGoals, firstLeg.theirGoals, points) +
        pointsFor(outcome.ourGoals, outcome.theirGoals, points);
      const theirPoints = pointsFor(firstLeg.theirGoals, firstLeg.ourGoals, points) +
        pointsFor(outcome.theirGoals, outcome.ourGoals, points);
      if (ourPoints !== theirPoints) {
        return DECIDED(
          ourPoints > theirPoints ? 1 : 0,
          `punti sulle due gare ${ourPoints} a ${theirPoints}`,
        );
      }
      // §23: la parità si rompe con la SOMMA DEI PUNTEGGI FANTACALCIO delle due
      // gare — non i goal, non i punti 3/1/0.
      const ourSum = firstLeg.ourScore + outcome.ours.total;
      const theirSum = firstLeg.theirScore + outcome.theirs.total;
      if (ourSum !== theirSum) {
        return DECIDED(
          ourSum > theirSum ? 1 : 0,
          `punti pari (${ourPoints}); somma dei punteggi ${ourSum} a ${theirSum} (§23)`,
        );
      }
      // Secondo livello di parità: `cup_tie_break_two_legged_second_level:
      // UNSPECIFIED`. Non si deduce dal rinvio esterno, non si prende per
      // consuetudine, non si assegna a nessuno.
      return {
        value: 0,
        decided: false,
        reason:
          `punti pari (${ourPoints}) e somma dei punteggi pari (${ourSum}): §23 registra questo caso come ` +
          "`cup_tie_break_two_legged_second_level: UNSPECIFIED` e vieta di dedurlo. Lo scenario non è " +
          "attribuito a nessuna delle due squadre e la sua massa è dichiarata a parte.",
      };
    }
  }
}
