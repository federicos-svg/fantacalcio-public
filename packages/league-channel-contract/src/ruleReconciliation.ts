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
  midfieldModifier,
  modulePointsToOpponent,
  strikerAttackModifier,
} from "../../league-gameweek/src/leagueGameweek.js";
import { LEAGUE_POINTS } from "../../league-gameweek/src/lineupOptimizer.js";
import {
  FANTAVOTO_TARIFF,
  GS_MALUS_PER_GOAL_CONCEDED,
  GS_MALUS_ROLE,
} from "../../appeal-index/src/fantavoto.js";
import type {
  ObservedAttackBonusRow,
  ObservedDefenceBand,
  ObservedLeagueSettings,
  ObservedMidfieldRow,
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

/**
 * La differenza dalla quale scatta il delta massimo. È l'unico numero di §20
 * che `league-gameweek` non esporta e che serve per sapere **dove fermarsi**
 * nella derivazione: **trascrizione** dalla riga «`>= 7.0` | -3.5 | +3.5» della
 * tabella di §20, non un import. Se fosse sbagliata la scala derivata sarebbe
 * più corta, non diversa, e il test la confronta con `MIDFIELD_MAX_DELTA`.
 */
const MIDFIELD_TABLE_CEILING = 7.0;

/**
 * TABELLA ATTESA DEL MODIFICATORE ATTACCO (§21) — **derivata, non ricopiata**.
 *
 * `ATTACK_TABLE` non è esportata da `league-gameweek`, quindi ridichiararla qui
 * avrebbe creato una seconda tabella che diverge il giorno in cui la prima
 * cambia. Invece si **interroga l'autorità**: si chiede a
 * `strikerAttackModifier` il bonus di ogni voto della griglia, dal voto
 * sufficiente al tetto. Se un giorno la tabella cambia, questa cambia con lei
 * nello stesso commit, senza che nessuno se ne ricordi.
 */
export const EXPECTED_ATTACK_TABLE: readonly ObservedAttackBonusRow[] = deriveAttackTable();

function deriveAttackTable(): readonly ObservedAttackBonusRow[] {
  const rows: ObservedAttackBonusRow[] = [];
  const steps = Math.round((ATTACK_MAX_FROM_VOTE - SUFFICIENT_VOTE) / 0.5);
  for (let step = 0; step <= steps; step += 1) {
    const vote = SUFFICIENT_VOTE + step * 0.5;
    const outcome = strikerAttackModifier({
      baseVote: vote,
      receivedAnyBonus: false,
      missedPenalty: false,
    });
    // Un voto non tabulato non entra: il regolamento vieta di interpolare, e
    // una riga inventata qui sarebbe un'interpolazione con un altro nome.
    if (outcome.eligible && outcome.tabulated) rows.push({ vote, bonus: outcome.bonus });
  }
  return rows;
}

/**
 * SCALA ATTESA DEL MODIFICATORE CENTROCAMPO (§20) — **derivata, non ricopiata**,
 * per la stessa ragione: si chiede a `midfieldModifier` il delta di ogni
 * differenza tabulata, dalla prima soglia al tetto. Il fondo (`< 2.0 -> 0`) non
 * è una riga della scala e non compare.
 */
export const EXPECTED_MIDFIELD_TABLE: readonly ObservedMidfieldRow[] = deriveMidfieldTable();

function deriveMidfieldTable(): readonly ObservedMidfieldRow[] {
  const rows: ObservedMidfieldRow[] = [];
  const first = 2.0;
  const steps = Math.round((MIDFIELD_TABLE_CEILING - first) / 0.5);
  for (let step = 0; step <= steps; step += 1) {
    const difference = first + step * 0.5;
    // Una sola coppia di voti la cui differenza è esattamente quella cercata:
    // aritmetica, non modello.
    const outcome = midfieldModifier({ ourBaseVotes: [difference], theirBaseVotes: [0] });
    if (outcome.tabulated) rows.push({ difference, delta: outcome.ourDelta });
  }
  return rows;
}


/**
 * §21 esclude QUALUNQUE bonus (correzione normativa del 2026-08-21) —
 * **derivato**, chiedendo a `strikerAttackModifier` se un attaccante da voto
 * pieno con un bonus resta eleggibile.
 */
export const EXPECTED_ATTACK_EXCLUDES_ANY_BONUS: boolean = !strikerAttackModifier({
  baseVote: ATTACK_MAX_FROM_VOTE,
  receivedAnyBonus: true,
  missedPenalty: false,
}).eligible;

/**
 * Minuti fra chiusura della formazione e calcio d'inizio (§16).
 *
 * **TRASCRIZIONE, non un import**: viene dalla riga di §16 «Deadline: **1
 * minuto prima dell'inizio delle partite**». Nel core pubblico non esiste una
 * costante da importare perché nessun calcolo la usa — la deadline decide
 * *quando* agire, e questo pacchetto non ha orologio. Se §16 cambiasse, questo
 * numero va cambiato a mano: è il prezzo dichiarato di non avere un'autorità da
 * interrogare.
 */
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
  | readonly ObservedDefenceBand[]
  | readonly ObservedAttackBonusRow[]
  | readonly ObservedMidfieldRow[];

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
   * `false` alla prima divergenza di impatto `punteggio`, e **non basta da
   * solo**.
   *
   * La prima versione lo dichiarava «l'unica cosa che il Coach deve guardare
   * prima di schierare», e non era vero: `reconcileWithLeagueRules({})` — una
   * lettura in cui la piattaforma non ha esposto NULLA — risponde
   * `safeToPlay: true`, perché senza campi osservati non c'è nessuna
   * divergenza. Il comportamento è quello giusto (un campo non osservato lascia
   * autorità al regolamento e non è una smentita), ma la promessa era
   * sovradichiarata: «nessuno ha smentito il regolamento» non è «la piattaforma
   * conferma il regolamento».
   *
   * Delle due strade — rendere `safeToPlay` falso su una lettura vuota, oppure
   * dire la verità e renderla visibile nel tipo — si è presa la seconda: la
   * prima avrebbe mescolato in un booleano solo due fatti diversi (una
   * contraddizione e una lacuna) che hanno rimedi opposti, e avrebbe richiesto
   * di decidere qui **quante** regole bastano, che è una soglia di prodotto e
   * non una proprietà del confronto.
   *
   * Quindi: `safeToPlay` si legge **insieme a** `essentialNotObserved`, che
   * conta le regole di punteggio rimaste non osservate. `safeToPlay: true` con
   * `essentialNotObserved: 0` è l'unica combinazione in cui la piattaforma ha
   * davvero confermato tutto ciò che decide un punteggio.
   */
  readonly safeToPlay: boolean;
  /**
   * Quante regole di impatto `punteggio` la piattaforma non ha esposto. Zero
   * significa che ogni regola che decide un punteggio è stata letta e
   * confrontata; un numero alto con `safeToPlay: true` significa che non c'è
   * nessuna contraddizione **perché non c'è quasi nessuna lettura**.
   */
  readonly essentialNotObserved: number;
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

/**
 * UGUAGLIANZA FRA INSIEMI, E PERCHÉ È FAIL-CLOSED SUL TIPO.
 *
 * L'ordine in cui una piattaforma elenca i moduli ammessi o le righe di una
 * tabella è una scelta di presentazione, non una regola: farne una divergenza
 * produrrebbe un fail-closed su una differenza che non cambia un solo
 * punteggio. Quindi si confrontano insiemi.
 *
 * **Ma la chiave non si costruisce per interpolazione.** La prima versione
 * faceva `${value.minAverage}:${value.bonus}`, e una banda arrivata con i
 * numeri scritti come testo — `"7"` invece di `7`, che è esattamente ciò che
 * produce un parser JSON permissivo — generava la stessa chiave del valore
 * numerico e quindi **accordo**: il buco stava proprio dove il pacchetto esiste
 * per non averne. `validateObservedLeagueSettings` lo avrebbe visto, ma è una
 * funzione separata che la riconciliazione non chiama e che un chiamante può
 * non usare: una guardia che dipende dalla buona educazione di chi chiama non
 * è una guardia. Adesso un elemento i cui campi non sono numeri finiti non
 * produce nessuna chiave, e l'insieme è dichiarato diverso — divergenza, mai
 * accordo.
 */
function stringSetEqual(expected: SettingValue, observed: SettingValue): boolean {
  if (!Array.isArray(expected) || !Array.isArray(observed)) return false;
  const keys = (items: readonly unknown[]): Set<string> | null => {
    const out = new Set<string>();
    for (const item of items) {
      if (typeof item !== "string") return null;
      out.add(item);
    }
    return out;
  };
  return sameKeys(keys(expected), keys(observed));
}

/**
 * Confronto insiemistico su righe di tabella, campo per campo dichiarato. Ogni
 * campo deve essere un numero finito: altrimenti niente chiave, niente accordo.
 */
function rowSetEqual(
  fields: readonly string[],
): (expected: SettingValue, observed: SettingValue) => boolean {
  const keys = (items: readonly unknown[]): Set<string> | null => {
    const out = new Set<string>();
    for (const item of items) {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const parts: string[] = [];
      for (const field of fields) {
        const raw = record[field];
        if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
        parts.push(`${field}=${raw}`);
      }
      out.add(parts.join("|"));
    }
    return out;
  };
  return (expected, observed) => {
    if (!Array.isArray(expected) || !Array.isArray(observed)) return false;
    return sameKeys(keys(expected), keys(observed));
  };
}

function sameKeys(left: Set<string> | null, right: Set<string> | null): boolean {
  if (left === null || right === null) return false;
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
}

/**
 * §12 — la tariffa dei bonus e dei malus, evento per evento.
 *
 * **Confrontata contro le costanti importate**, non ricopiate:
 * `FANTAVOTO_TARIFF` in `packages/appeal-index/src/fantavoto.ts` è l'unica
 * dichiarazione di §12 che il core pubblico possiede, e porta con sé la propria
 * versione di tariffa. Importarla costa una dipendenza in più
 * (`league-channel-contract` -> `appeal-index`, sole costanti di regolamento:
 * nessun modello, nessun prezzo, nessuna logica d'asta); ricopiarla sarebbe
 * costato una seconda tariffa che diverge in silenzio, che è più caro.
 *
 * È la leva di punteggio più grande del regolamento: una lega che dichiarasse
 * il gol a +4 o l'ammonizione a -1 cambierebbe ogni punteggio individuale, e
 * senza queste righe sarebbe passata come «tutto in accordo».
 */
function bonusMalusRules(): readonly FieldRule[] {
  return Object.entries(FANTAVOTO_TARIFF).map(([event, points]) => ({
    field: `bonusMalusTariff.${event}`,
    section: "§12",
    impact: "punteggio" as const,
    expected: points,
    read: (observed: ObservedScoringSettings): SettingValue | undefined =>
      observed.bonusMalusTariff?.[event as keyof typeof FANTAVOTO_TARIFF],
  }));
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
 *
 * **CHE COSA NON C'È, dichiarato invece che taciuto.**
 *
 * `bench: FREE` (§10) non è nel registro. La panchina libera è una regola di
 * *composizione* della rosa, non di punteggio: dice che in panchina può sedere
 * chiunque, e non cambia di un punto il conto di una giornata già schierata.
 * Le tre parti di §10 che la formazione la decidono davvero — tetto di cinque
 * cambi, solo stesso ruolo, nessun cambio modulo — sono confrontate. Se un
 * giorno la panchina smettesse di essere libera, il vincolo cadrebbe sul
 * *produttore* della formazione, non su questo confronto, e andrebbe aggiunto
 * lì per primo.
 */
function fieldRules(): readonly FieldRule[] {
  return [
    {
      field: "allowedModules",
      section: "§9",
      impact: "punteggio",
      expected: MODULES,
      read: (o) => o.allowedModules,
      equal: stringSetEqual,
    },
    ...moduleModifierRules(),
    {
      field: "moduleModifierTarget",
      section: "§9",
      // TRASCRIZIONE, non un import: `module_modifier_target: OPPONENT` in §9.
      // L'autorità più vicina che il core esporta è il *nome* della funzione,
      // `modulePointsToOpponent`, che dichiara il bersaglio ma non lo espone
      // come valore confrontabile.
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
      equal: rowSetEqual(["minAverage", "bonus"]),
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
      field: "midfieldTable",
      section: "§20",
      impact: "punteggio",
      expected: EXPECTED_MIDFIELD_TABLE,
      read: (o) => o.midfieldTable,
      equal: rowSetEqual(["difference", "delta"]),
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
      expected: EXPECTED_ATTACK_EXCLUDES_ANY_BONUS,
      read: (o) => o.attackExcludesAnyBonus,
    },
    {
      field: "attackTable",
      section: "§21",
      impact: "punteggio",
      expected: EXPECTED_ATTACK_TABLE,
      read: (o) => o.attackTable,
      equal: rowSetEqual(["vote", "bonus"]),
    },
    ...bonusMalusRules(),
    {
      field: "goalConcededMalusPerGoal",
      section: "§12-bis",
      impact: "punteggio",
      expected: GS_MALUS_PER_GOAL_CONCEDED,
      read: (o) => o.goalConcededMalusPerGoal,
    },
    {
      field: "goalConcededMalusRoles",
      section: "§12-bis",
      impact: "punteggio",
      // Platea chiusa da Pico il 2026-08-23: `GOALKEEPER_ONLY`. Una lega che
      // applicasse il -1 a tutta la difesa cambierebbe ogni punteggio di
      // giornata, ed è proprio la lettura che Pico ha scartato.
      expected: [GS_MALUS_ROLE],
      read: (o) => o.goalConcededMalusRoles,
      equal: stringSetEqual,
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
    essentialNotObserved: notObserved.filter((entry) => entry.impact === "punteggio").length,
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
