// RICONCILIAZIONE — le impostazioni osservate contro il regolamento canonico,
// campo per campo, e il fail-closed che ne discende.
//
// PERCHÉ NON BASTA GUARDARE. Il contratto osservato sulla piattaforma e il
// regolamento canonico sono **due dichiarazioni della stessa cosa**, e nessuna
// delle due è automaticamente vera. Il Coach calcola col regolamento: se la
// lega gioca con un'altra tabella, ogni numero che il Coach produce è una
// risposta giusta alla domanda sbagliata. Il confronto si fa a ogni lettura,
// non una volta sola.
//
// TRE ESITI, non due. Un campo può concordare (`agreements`), divergere
// (`divergences`) oppure **non essere stato osservato** (`notObserved`). Il
// terzo è quello che si perde per primo, e perderlo è caro: «la piattaforma
// non espone questo campo» e «la piattaforma conferma il regolamento» sono
// fatti diversi, e trattare il primo come il secondo significa dichiarare una
// conferma che nessuno ha dato. Un campo non osservato NON è una divergenza e
// NON blocca: resta autorità il regolamento, e il fatto si registra.
//
// IL FAIL-CLOSED, e il suo confine. Una divergenza su una regola che **cambia
// il punteggio** mette `safeToPlay: false`, e il Coach non schiera. Non si
// adotta il valore della piattaforma né si tiene d'ufficio il regolamento:
// quale delle due valga è una modifica del regolamento canonico, cioè
// `docs/data/LEAGUE_RULES.md` §28 change control — una decisione che questo
// codice non ha il diritto di prendere. Ogni divergenza chiusa diventa una
// NUOVA `league_rule_version`, mai una correzione silenziosa: per questo
// l'esito porta con sé la versione su cui è stato calcolato.
//
// Le regole che cambiano il punteggio sono §9, §10, §13, §14, §15, §19, §20,
// §21. I punti di classifica (§22) hanno un impatto diverso e dichiarato a
// parte: non cambiano un punteggio, cambiano **quale formazione conviene** —
// con 3/1/0 una vittoria vale tre pareggi, e da sfavorito conviene alzare la
// varianza. Una loro divergenza non rende illegale la formazione, la rende
// tarata male: si registra come `obiettivo`, si porta a Pico, non blocca.
// Deadline e formazione non comunicata (§16) non toccano né l'una né l'altra:
// `registrata`.
//
// DUE COMPETIZIONI, UN'ARITMETICA SOLA. La lega ha campionato (§22) e Coppa di
// Lega (§23), e **le regole di punteggio sono le stesse per entrambe**: cambia
// il tabellone — la classifica del campionato non esiste in coppa, che ha
// gironi, eliminazione diretta e finale — non il modo di contare i punti di una
// giornata. Se le impostazioni osservate dichiarano qualcosa di diverso **per
// competizione**, ogni differenza si confronta col regolamento per conto suo e
// finisce nell'esito col nome della competizione davanti al campo: `divergenze
// per competizione`, **mai una media** e mai un valore «prevalente». Due
// dichiarazioni diverse sulla stessa regola sono due fatti, non due misure
// dello stesso fatto.
//
// Sui blocchi per competizione NON si produce `notObserved`: lì l'assenza di un
// campo significa «questa competizione non dichiara una regola propria», non
// «non l'abbiamo letta». Confonderle riempirebbe l'esito di rumore
// indistinguibile da una lacuna vera.
//
// NESSUNA IMPUTAZIONE, NESSUN ARROTONDAMENTO. Il confronto numerico è esatto
// (`Object.is`). Due valori che differiscono di un millesimo divergono: se il
// millesimo fosse rumore di lettura, il posto per dirlo è il parser privato,
// che dichiara la sua tolleranza, non questo confronto — che altrimenti
// sarebbe una tolleranza nascosta dentro una guardia.

import {
  ATTACK_MAX_BONUS,
  ATTACK_MAX_FROM_VOTE,
  BOTH_BELOW_THRESHOLD_GOAL_MIN_GAP,
  DEFENCE_MIN_DEFENDERS_WITH_VOTE,
  FIRST_GOAL_THRESHOLD,
  GOAL_BAND_WIDTH,
  HOME_FIELD_BONUS,
  LEAGUE_RULE_VERSION,
  type LeagueRuleVersion,
  MIDFIELD_FICTITIOUS_VOTE,
  MIDFIELD_MAX_DELTA,
  MISSING_LINEUP_POLICY,
  MODULES,
  NEUTRAL_GROUND_FROM_MATCHDAY,
  NO_VOTE_RULES,
  SAME_BAND_EXTRA_GOAL_MIN_GAP,
  SUBSTITUTION_RULES,
  SUFFICIENT_VOTE,
  modulePointsToOpponent,
} from "../../league-gameweek/src/leagueGameweek.js";
import { LEAGUE_POINTS } from "../../league-gameweek/src/lineupOptimizer.js";
import type {
  ObservedDefenceBand,
  ObservedLeagueSettings,
  ObservedScoringSettings,
} from "./leagueSettings.js";

/**
 * Fasce attese del modificatore difesa (§19).
 *
 * **L'autorità resta `defenceModifier()`**, non questa tabella: qui non si
 * calcola nulla, si dichiara che cosa ci si aspetta di leggere sulla
 * piattaforma. `league-gameweek` tiene le sue fasce dentro la funzione, quindi
 * l'unico modo di confrontarle era ridichiararle — e una ridichiarazione che
 * nessuno controlla è una seconda aritmetica che diverge in silenzio. Per
 * questo `tests/ruleReconciliation.test.ts` **interroga `defenceModifier` ai
 * bordi** e prova che questa tabella dice la stessa cosa: se un giorno il
 * regolamento cambiasse la fascia, il test cade prima della riconciliazione.
 *
 * La soglia sotto 6.0 non è una fascia ma il fondo (bonus 0) e non compare.
 */
export const EXPECTED_DEFENCE_BANDS: readonly ObservedDefenceBand[] = [
  { minAverage: 7.0, bonus: 6 },
  { minAverage: 6.5, bonus: 3 },
  { minAverage: 6.0, bonus: 1 },
] as const;

/** Minuti fra chiusura della formazione e calcio d'inizio (§16). */
export const EXPECTED_LINEUP_DEADLINE_MINUTES = 1 as const;

/**
 * Quanto pesa una divergenza.
 *
 * - `punteggio` — cambia il numero che esce dalla giornata: **fail-closed**;
 * - `obiettivo` — non cambia il punteggio, cambia quale formazione conviene
 *   (§22): si registra e si porta a Pico, non blocca;
 * - `registrata` — né l'uno né l'altro (§16): si registra e basta.
 */
export type DivergenceImpact = "punteggio" | "obiettivo" | "registrata";

/** I valori che una impostazione osservata può assumere. Niente `any`. */
export type SettingValue =
  | number
  | boolean
  | string
  | readonly string[]
  | readonly ObservedDefenceBand[];

/** Un campo su cui piattaforma e regolamento dicono la stessa cosa. */
export interface FieldAgreement {
  readonly field: string;
  /** Sezione del regolamento canonico, per risalire alla fonte della regola. */
  readonly section: string;
  readonly value: SettingValue;
}

/** Un campo su cui le due dichiarazioni non coincidono. */
export interface FieldDivergence {
  readonly field: string;
  readonly section: string;
  readonly impact: DivergenceImpact;
  /** Il valore del regolamento canonico. */
  readonly expected: SettingValue;
  /** Il valore letto sulla piattaforma. */
  readonly observed: SettingValue;
}

/** Un campo che la piattaforma non espone: né conferma né smentita. */
export interface FieldNotObserved {
  readonly field: string;
  readonly section: string;
  readonly impact: DivergenceImpact;
  readonly expected: SettingValue;
}

export interface ReconciliationOutcome {
  readonly agreements: readonly FieldAgreement[];
  readonly divergences: readonly FieldDivergence[];
  readonly notObserved: readonly FieldNotObserved[];
  /**
   * `false` alla prima divergenza di impatto `punteggio`. È l'unica cosa che il
   * Coach deve guardare prima di schierare, e non ammette sfumature: non c'è un
   * «quasi sicuro».
   */
  readonly safeToPlay: boolean;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

interface FieldRule {
  readonly field: string;
  readonly section: string;
  readonly impact: DivergenceImpact;
  readonly expected: SettingValue;
  readonly read: (observed: ObservedScoringSettings) => SettingValue | undefined;
  /** Confronto non scalare (insiemi). Assente = `Object.is` esatto. */
  readonly equal?: (expected: SettingValue, observed: SettingValue) => boolean;
}

/** Chiave stabile di un elemento, per confronti insiemistici deterministici. */
function elementKey(value: string | ObservedDefenceBand): string {
  return typeof value === "string" ? value : `${value.minAverage}:${value.bonus}`;
}

/**
 * Uguaglianza fra insiemi: stessi elementi, ordine e ripetizioni irrilevanti.
 * L'ordine in cui una piattaforma elenca i moduli ammessi o le fasce di §19 è
 * una scelta di presentazione, non una regola: farne una divergenza produrrebbe
 * un fail-closed su una differenza che non cambia un solo punteggio.
 */
function sameSet(expected: SettingValue, observed: SettingValue): boolean {
  if (!Array.isArray(expected) || !Array.isArray(observed)) return false;
  const left = new Set((expected as readonly (string | ObservedDefenceBand)[]).map(elementKey));
  const right = new Set((observed as readonly (string | ObservedDefenceBand)[]).map(elementKey));
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
}

function moduleModifierRules(): readonly FieldRule[] {
  return MODULES.map((module) => ({
    field: `moduleModifier.${module}`,
    section: "§9",
    impact: "punteggio" as const,
    expected: modulePointsToOpponent(module),
    read: (observed: ObservedScoringSettings): SettingValue | undefined =>
      observed.moduleModifier?.[module],
  }));
}

/**
 * IL REGISTRO DEI CAMPI, unico posto in cui si dichiara che cosa si confronta.
 *
 * È esplicito e chiuso di proposito: un campo che non compare qui non viene
 * confrontato, e non comparire è una scelta visibile in diff, non un effetto
 * collaterale di una glob. `notObserved` si calcola da questo stesso registro,
 * quindi un campo dichiarato non può sparire dal conto restando indietro.
 */
function fieldRules(): readonly FieldRule[] {
  return [
    {
      field: "allowedModules",
      section: "§9",
      impact: "punteggio",
      expected: MODULES,
      read: (o) => o.allowedModules,
      equal: sameSet,
    },
    ...moduleModifierRules(),
    {
      field: "moduleModifierTarget",
      section: "§9",
      impact: "punteggio",
      expected: "avversario",
      read: (o) => o.moduleModifierTarget,
    },
    {
      field: "maxSubstitutions",
      section: "§10",
      impact: "punteggio",
      expected: SUBSTITUTION_RULES.maxSubstitutions,
      read: (o) => o.maxSubstitutions,
    },
    {
      field: "sameRoleOnly",
      section: "§10",
      impact: "punteggio",
      expected: SUBSTITUTION_RULES.sameRoleOnly,
      read: (o) => o.sameRoleOnly,
    },
    {
      field: "moduleChangeViaSubstitution",
      section: "§10",
      impact: "punteggio",
      expected: SUBSTITUTION_RULES.moduleChangeAllowed,
      read: (o) => o.moduleChangeViaSubstitution,
    },
    {
      field: "officeReserveAllowed",
      section: "§13",
      impact: "punteggio",
      // `officeReserve: "prohibited"` nel regolamento: nessun punteggio
      // d'ufficio per il titolare senza voto che la panchina non copre.
      expected: NO_VOTE_RULES.officeReserve !== "prohibited",
      read: (o) => o.officeReserveAllowed,
    },
    {
      field: "noVoteBonusMalusBase",
      section: "§13",
      impact: "punteggio",
      expected: NO_VOTE_RULES.bonusMalusBase,
      read: (o) => o.noVoteBonusMalusBase,
    },
    {
      field: "noVoteBookedPreset",
      section: "§13",
      impact: "punteggio",
      expected: NO_VOTE_RULES.bookedPreset,
      read: (o) => o.noVoteBookedPreset,
    },
    {
      field: "noVoteSentOffDuringMatch",
      section: "§13",
      impact: "punteggio",
      expected: NO_VOTE_RULES.sentOffDuringMatch,
      read: (o) => o.noVoteSentOffDuringMatch,
    },
    {
      field: "homeFieldBonus",
      section: "§14",
      impact: "punteggio",
      expected: HOME_FIELD_BONUS,
      read: (o) => o.homeFieldBonus,
    },
    {
      field: "neutralGroundFromMatchday",
      section: "§14",
      impact: "punteggio",
      expected: NEUTRAL_GROUND_FROM_MATCHDAY,
      read: (o) => o.neutralGroundFromMatchday,
    },
    {
      field: "firstGoalThreshold",
      section: "§15",
      impact: "punteggio",
      expected: FIRST_GOAL_THRESHOLD,
      read: (o) => o.firstGoalThreshold,
    },
    {
      field: "goalBandWidth",
      section: "§15",
      impact: "punteggio",
      expected: GOAL_BAND_WIDTH,
      read: (o) => o.goalBandWidth,
    },
    {
      field: "sameBandExtraGoalMinGap",
      section: "§15",
      impact: "punteggio",
      expected: SAME_BAND_EXTRA_GOAL_MIN_GAP,
      read: (o) => o.sameBandExtraGoalMinGap,
    },
    {
      field: "bothBelowThresholdGoalMinGap",
      section: "§15",
      impact: "punteggio",
      expected: BOTH_BELOW_THRESHOLD_GOAL_MIN_GAP,
      read: (o) => o.bothBelowThresholdGoalMinGap,
    },
    {
      field: "lineupDeadlineMinutesBeforeKickoff",
      section: "§16",
      impact: "registrata",
      expected: EXPECTED_LINEUP_DEADLINE_MINUTES,
      read: (o) => o.lineupDeadlineMinutesBeforeKickoff,
    },
    {
      field: "missingLineupFallsBackToPrevious",
      section: "§16",
      impact: "registrata",
      expected: MISSING_LINEUP_POLICY.fallbackToPreviousMatchday,
      read: (o) => o.missingLineupFallsBackToPrevious,
    },
    {
      field: "defenceMinDefendersWithVote",
      section: "§19",
      impact: "punteggio",
      expected: DEFENCE_MIN_DEFENDERS_WITH_VOTE,
      read: (o) => o.defenceMinDefendersWithVote,
    },
    {
      field: "defenceBands",
      section: "§19",
      impact: "punteggio",
      expected: EXPECTED_DEFENCE_BANDS,
      read: (o) => o.defenceBands,
      equal: sameSet,
    },
    {
      field: "midfieldFictitiousVote",
      section: "§20",
      impact: "punteggio",
      expected: MIDFIELD_FICTITIOUS_VOTE,
      read: (o) => o.midfieldFictitiousVote,
    },
    {
      field: "midfieldMaxDelta",
      section: "§20",
      impact: "punteggio",
      expected: MIDFIELD_MAX_DELTA,
      read: (o) => o.midfieldMaxDelta,
    },
    {
      field: "attackSufficientVote",
      section: "§21",
      impact: "punteggio",
      expected: SUFFICIENT_VOTE,
      read: (o) => o.attackSufficientVote,
    },
    {
      field: "attackMaxBonus",
      section: "§21",
      impact: "punteggio",
      expected: ATTACK_MAX_BONUS,
      read: (o) => o.attackMaxBonus,
    },
    {
      field: "attackMaxFromVote",
      section: "§21",
      impact: "punteggio",
      expected: ATTACK_MAX_FROM_VOTE,
      read: (o) => o.attackMaxFromVote,
    },
    {
      field: "attackExcludesAnyBonus",
      section: "§21",
      impact: "punteggio",
      // Correzione normativa 2026-08-21: esclude QUALUNQUE bonus, non il solo gol.
      expected: true,
      read: (o) => o.attackExcludesAnyBonus,
    },
    {
      field: "pointsWin",
      section: "§22",
      impact: "obiettivo",
      expected: LEAGUE_POINTS.win,
      read: (o) => o.pointsWin,
    },
    {
      field: "pointsDraw",
      section: "§22",
      impact: "obiettivo",
      expected: LEAGUE_POINTS.draw,
      read: (o) => o.pointsDraw,
    },
    {
      field: "pointsLoss",
      section: "§22",
      impact: "obiettivo",
      expected: LEAGUE_POINTS.loss,
      read: (o) => o.pointsLoss,
    },
  ];
}

/** I nomi dei campi confrontati, nell'ordine del registro. */
export function reconciledFieldNames(): readonly string[] {
  return fieldRules().map((rule) => rule.field);
}

/**
 * Confronta le impostazioni osservate col regolamento canonico.
 *
 * Funzione pura: stesso input, stesso output, sempre. Non legge nulla, non
 * scrive nulla, non conosce la fonte da cui `observed` è stato costruito.
 */
export function reconcileWithLeagueRules(
  observed: ObservedLeagueSettings,
): ReconciliationOutcome {
  const agreements: FieldAgreement[] = [];
  const divergences: FieldDivergence[] = [];
  const notObserved: FieldNotObserved[] = [];

  compareSettings(observed, "", true, agreements, divergences, notObserved);

  for (const block of observed.perCompetition ?? []) {
    compareSettings(
      block.settings,
      `competizione:${block.competitionId}.`,
      false,
      agreements,
      divergences,
      notObserved,
    );
  }

  return {
    agreements,
    divergences,
    notObserved,
    safeToPlay: !divergences.some((divergence) => divergence.impact === "punteggio"),
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * Un giro completo del registro su un blocco di impostazioni.
 *
 * `reportNotObserved` distingue i due casi che questo pacchetto non confonde
 * mai: sul blocco generale un campo assente è una **lacuna di lettura** e va
 * registrata; su un blocco per competizione è l'assenza di una **regola
 * propria**, cioè un fatto normale, e registrarla sarebbe rumore.
 */
function compareSettings(
  settings: ObservedScoringSettings,
  prefix: string,
  reportNotObserved: boolean,
  agreements: FieldAgreement[],
  divergences: FieldDivergence[],
  notObserved: FieldNotObserved[],
): void {
  for (const rule of fieldRules()) {
    const field = `${prefix}${rule.field}`;
    const value = rule.read(settings);
    if (value === undefined) {
      if (reportNotObserved) {
        notObserved.push({
          field,
          section: rule.section,
          impact: rule.impact,
          expected: rule.expected,
        });
      }
      continue;
    }
    const same = rule.equal ? rule.equal(rule.expected, value) : Object.is(rule.expected, value);
    if (same) {
      agreements.push({ field, section: rule.section, value });
      continue;
    }
    divergences.push({
      field,
      section: rule.section,
      impact: rule.impact,
      expected: rule.expected,
      observed: value,
    });
  }
}
