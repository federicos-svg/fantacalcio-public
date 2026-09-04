// FIXTURE INTEGRALMENTE SINTETICHE.
//
// Nessun nome di giocatore, nessuna squadra reale, nessun identificatore della
// piattaforma: `p1…p16`, `t1`, `c1`, `c2`. Sono id opachi inventati qui, ed è
// esattamente la forma che il contratto si aspetta anche in esercizio — dove a
// generarli è il layer privato.

import type {
  ObservedCalendar,
  ObservedCompetition,
  ObservedFixture,
} from "../src/calendar.js";
import type { ObservedLeagueSettings } from "../src/leagueSettings.js";
import type { ObservedLineup } from "../src/lineupSubmission.js";
import type { ObservedTeam } from "../src/roster.js";

/** Competizione sintetica: il campionato. */
export const CAMPIONATO: ObservedCompetition = {
  competitionId: "c1",
  name: "competizione sintetica 1",
  kind: "campionato",
};

/** Competizione sintetica: la coppa. */
export const COPPA: ObservedCompetition = {
  competitionId: "c2",
  name: "competizione sintetica 2",
  kind: "coppa",
};

/**
 * Impostazioni che concordano con il regolamento su OGNI campo del registro.
 * Le fasce e le tabelle sono quelle di §9, §10, §13, §14, §15, §16, §19, §20,
 * §21, §22 — scritte a mano qui e non importate dal codice che le confronta,
 * perché una fixture che si costruisse dalle stesse costanti non proverebbe
 * nulla.
 */
export const SETTINGS_IN_ACCORDO: ObservedLeagueSettings = {
  allowedModules: ["541", "451", "532", "442", "352", "433", "343"],
  moduleModifier: {
    "541": -1.5,
    "451": -1.0,
    "532": -0.5,
    "442": 0,
    "352": 0.5,
    "433": 1.0,
    "343": 1.5,
  },
  moduleModifierTarget: "avversario",
  bonusMalusTariff: { Gf: 3, Rf: 3, Ass: 1, Rp: 3, Rs: -3, Au: -2, Amm: -0.5, Esp: -1 },
  goalConcededMalusPerGoal: -1,
  goalConcededMalusRoles: ["P"],
  maxSubstitutions: 5,
  sameRoleOnly: true,
  moduleChangeViaSubstitution: false,
  officeReserveAllowed: false,
  noVoteBonusMalusBase: 6,
  noVoteBookedPreset: 5,
  noVoteSentOffDuringMatch: 4,
  homeFieldBonus: 2,
  neutralGroundFromMatchday: 29,
  firstGoalThreshold: 66,
  goalBandWidth: 6,
  sameBandExtraGoalMinGap: 4,
  bothBelowThresholdGoalMinGap: 10,
  lineupDeadlineMinutesBeforeKickoff: 1,
  missingLineupFallsBackToPrevious: true,
  defenceMinDefendersWithVote: 4,
  defenceBands: [
    { minAverage: 7.0, bonus: 6 },
    { minAverage: 6.5, bonus: 3 },
    { minAverage: 6.0, bonus: 1 },
  ],
  midfieldFictitiousVote: 5,
  midfieldMaxDelta: 3.5,
  midfieldTable: [
    { difference: 2.0, delta: 1 },
    { difference: 2.5, delta: 1 },
    { difference: 3.0, delta: 1.5 },
    { difference: 3.5, delta: 1.5 },
    { difference: 4.0, delta: 2 },
    { difference: 4.5, delta: 2 },
    { difference: 5.0, delta: 2.5 },
    { difference: 5.5, delta: 2.5 },
    { difference: 6.0, delta: 3 },
    { difference: 6.5, delta: 3 },
    { difference: 7.0, delta: 3.5 },
  ],
  attackSufficientVote: 6.0,
  attackMaxBonus: 2,
  attackMaxFromVote: 8.0,
  attackExcludesAnyBonus: true,
  attackTable: [
    { vote: 6.0, bonus: 0 },
    { vote: 6.5, bonus: 0.5 },
    { vote: 7.0, bonus: 1 },
    { vote: 7.5, bonus: 1.5 },
    { vote: 8.0, bonus: 2 },
  ],
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
};

/** Una rosa sintetica completa per un 4-4-2 con panchina. */
export const ROSA: ObservedTeam = {
  teamId: "t1",
  players: [
    { id: "p1", role: "P", realTeamId: "r1" },
    { id: "p2", role: "D", realTeamId: "r2", availability: "disponibile" },
    { id: "p3", role: "D", realTeamId: "r3" },
    { id: "p4", role: "D", realTeamId: "r4" },
    { id: "p5", role: "D", realTeamId: "r5", availability: "in_dubbio" },
    { id: "p6", role: "C", realTeamId: "r6" },
    { id: "p7", role: "C", realTeamId: "r7" },
    { id: "p8", role: "C", realTeamId: "r2" },
    { id: "p9", role: "C", realTeamId: "r3" },
    { id: "p10", role: "A", realTeamId: "r4" },
    { id: "p11", role: "A", realTeamId: "r5", availability: "indisponibile" },
    { id: "p12", role: "P", realTeamId: "r6" },
    { id: "p13", role: "D", realTeamId: "r7" },
    { id: "p14", role: "C", realTeamId: "r1" },
    { id: "p15", role: "A", realTeamId: "r2" },
    { id: "p16", role: "A", realTeamId: "r3" },
  ],
};

/** Una formazione osservata di riferimento, con panchina ordinata. */
export const FORMAZIONE: ObservedLineup = {
  competitionId: "c1",
  module: "442",
  goalkeeperId: "p1",
  starterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
  benchIds: ["p12", "p13", "p14", "p15", "p16"],
  flags: { hidden: false, allCompetitions: false },
};

/** Sfida di campionato, giornata 5, in casa. */
export const SFIDA_CAMPIONATO_G5: ObservedFixture = {
  competitionId: "c1",
  matchday: 5,
  opponentTeamId: "t2",
  venue: "casa",
  kickoffAt: "giornata-5-inizio",
  deadlineAt: "giornata-5-deadline",
};

/** Sfida di coppa nella stessa giornata 5, in trasferta, contro un altro. */
export const SFIDA_COPPA_G5: ObservedFixture = {
  competitionId: "c2",
  matchday: 5,
  opponentTeamId: "t3",
  venue: "trasferta",
  cupPhase: "girone",
  leg: "andata",
};

/** Il ritorno del girone di coppa: stesso avversario, campo invertito. */
export const SFIDA_COPPA_G14_RITORNO: ObservedFixture = {
  competitionId: "c2",
  matchday: 14,
  opponentTeamId: "t3",
  venue: "casa",
  cupPhase: "girone",
  leg: "ritorno",
};

/** Andata del turno di eliminazione (giornata 24), in casa. */
export const SFIDA_COPPA_G24_ANDATA: ObservedFixture = {
  competitionId: "c2",
  matchday: 24,
  opponentTeamId: "t4",
  venue: "casa",
  cupPhase: "eliminazione",
  leg: "andata",
};

/** Ritorno dello stesso turno (giornata 28), campo invertito. */
export const SFIDA_COPPA_G28_RITORNO: ObservedFixture = {
  competitionId: "c2",
  matchday: 28,
  opponentTeamId: "t4",
  venue: "trasferta",
  cupPhase: "eliminazione",
  leg: "ritorno",
};

/**
 * Calendario sintetico con DUE competizioni: la giornata 5 porta due partite,
 * una per competizione, con due avversari diversi.
 */
export const CALENDARIO: ObservedCalendar = {
  teamId: "t1",
  competitions: [
    { competition: CAMPIONATO, fixtures: [SFIDA_CAMPIONATO_G5] },
    {
      competition: COPPA,
      fixtures: [
        SFIDA_COPPA_G5,
        SFIDA_COPPA_G14_RITORNO,
        SFIDA_COPPA_G24_ANDATA,
        SFIDA_COPPA_G28_RITORNO,
      ],
    },
  ],
};
