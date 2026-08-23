// GEN-PROTOCOL-A — la riga di statistiche di stagione, provider-neutra. PURA.
//
// Perche' questo modulo esiste: l'ondata 1 ha lasciato le statistiche di
// stagione come `Record<string, number | null>` (`genTypes.ts`), cioe' una
// mappa senza catalogo. Un catalogo di feature costruito sopra una mappa
// libera non e' verificabile: nessuno puo' dire, guardando il codice, se un
// nome di campo esiste davvero o e' un refuso che diventera' `NaN` a valle
// (silenziosamente, perche' una chiave assente e' indistinguibile da un
// valore non osservato). Qui i nomi sono un tipo, e un refuso e' un errore di
// compilazione.
//
// Provenienza dei nomi: sono i nomi statistici generici del catalogo di
// stagione registrato privatamente (93 campi, ordine alfabetico). Il nome
// della fonte NON compare in questo repository, in nessun file e in nessun
// commento: qui vivono i FATTI misurati, non chi li ha misurati. La
// provenienza, la licenza e il perimetro d'uso stanno nel repository privato.
//
// Regola non negoziabile ereditata da §D.3: `null` significa NON OSSERVATO e
// non diventa mai `0`. Questo modulo non coerce, non imputa e non completa:
// se un valore manca, ogni derivata che lo usa vale `NaN`, che e' il modo in
// cui il resto della pipeline dice «questa riga non e' scorabile su questa
// colonna» (e la coverage lo conta, §B.3.2).

/**
 * I 93 campi statistici di stagione, in ordine alfabetico.
 *
 * L'ordine e' quello del catalogo registrato: alfabetico per costruzione,
 * perche' l'impronta del deposito dipende dalla stringa dei campi e un ordine
 * instabile produrrebbe impronte diverse per la stessa richiesta.
 */
export const SEASON_STAT_FIELDS = [
  "accurateChippedPasses",
  "accurateCrosses",
  "accurateFinalThirdPasses",
  "accurateLongBalls",
  "accurateOppositionHalfPasses",
  "accurateOwnHalfPasses",
  "accuratePasses",
  "aerialDuelsWon",
  "aerialLost",
  "appearances",
  "assists",
  "attemptPenaltyMiss",
  "attemptPenaltyPost",
  "attemptPenaltyTarget",
  "ballRecovery",
  "bigChancesCreated",
  "bigChancesMissed",
  "blockedShots",
  "cleanSheet",
  "clearances",
  "countRating",
  "crossesNotClaimed",
  "directRedCards",
  "dispossessed",
  "dribbledPast",
  "duelLost",
  "errorLeadToGoal",
  "errorLeadToShot",
  "expectedAssists",
  "expectedGoals",
  "fouls",
  "freeKickGoal",
  "goalKicks",
  "goals",
  "goalsConceded",
  "goalsConcededInsideTheBox",
  "goalsConcededOutsideTheBox",
  "goalsFromInsideTheBox",
  "goalsFromOutsideTheBox",
  "goalsPrevented",
  "groundDuelsWon",
  "headedGoals",
  "highClaims",
  "hitWoodwork",
  "inaccuratePasses",
  "interceptions",
  "keyPasses",
  "leftFootGoals",
  "matchesStarted",
  "minutesPlayed",
  "offsides",
  "outfielderBlocks",
  "ownGoals",
  "passToAssist",
  "penaltiesTaken",
  "penaltyConceded",
  "penaltyFaced",
  "penaltyGoals",
  "penaltySave",
  "penaltyWon",
  "possessionLost",
  "possessionWonAttThird",
  "punches",
  "rating",
  "redCards",
  "rightFootGoals",
  "runsOut",
  "savedShotsFromInsideTheBox",
  "savedShotsFromOutsideTheBox",
  "saves",
  "savesCaught",
  "savesParried",
  "setPieceConversion",
  "shotFromSetPiece",
  "shotsFromInsideTheBox",
  "shotsFromOutsideTheBox",
  "shotsOffTarget",
  "shotsOnTarget",
  "successfulDribbles",
  "tackles",
  "tacklesWon",
  "totalAttemptAssist",
  "totalChippedPasses",
  "totalContest",
  "totalCross",
  "totalLongBalls",
  "totalOppositionHalfPasses",
  "totalOwnHalfPasses",
  "totalShots",
  "touches",
  "wasFouled",
  "yellowCards",
  "yellowRedCards",
] as const;

/** Nome di un campo statistico di stagione. */
export type SeasonStatField = (typeof SEASON_STAT_FIELDS)[number];

/**
 * Una riga di statistiche di stagione: 93 campi, ciascuno `number | null`.
 *
 * Ogni campo e' opzionale nel tipo perche' una riga puo' arrivare da una
 * richiesta che non ha chiesto tutto: un campo NON CHIESTO e' assente, un
 * campo chiesto e non osservato e' `null`, e le due cose non sono la stessa —
 * una domanda non posta non e' una misura mancante. A valle valgono
 * comunque uguale (`NaN` sulle derivate), ma il report distingue.
 */
export type SeasonStatsRow = {
  readonly [K in SeasonStatField]?: number | null;
};

/**
 * I campi Tier B: presenti solo su una parte delle stagioni (§D.3).
 *
 * I domini d'era qui sotto sono quelli ATTESI dal protocollo (§D.3, P0.6): la
 * conferma e' un atto di P0 sui depositi privati, non di questo file. Se P0
 * misurasse gradini diversi, i tier si ridisegnano sui gradini misurati — e'
 * il chiamante a passare i confini a `featureCatalog.ts`, che qui trova solo
 * il valore di default.
 */
export const TIER_B_FIELDS = ["goalsPrevented", "expectedGoals", "expectedAssists"] as const;

export type TierBField = (typeof TIER_B_FIELDS)[number];

/**
 * Prima stagione-TARGET in cui il termine Tier B esiste (§D.3, S3b).
 *
 * Sono stagioni di TARGET, non di misura: e' la forma in cui il protocollo le
 * scrive («i termini Tier B esistono solo per le stagioni-target ≥ 2022/23
 * (xG/xA) e ≥ 2021/22 (`goalsPrevented`)»). Da confermare in P0 lato privato.
 */
export const TIER_B_FIRST_TARGET_SEASON: Readonly<Record<TierBField, string>> = {
  goalsPrevented: "2021_22",
  expectedGoals: "2022_23",
  expectedAssists: "2022_23",
} as const;

/** I 90 campi presenti su tutte e dieci le stagioni (§D.3, S2). */
export const TIER_A_FIELDS: readonly SeasonStatField[] = SEASON_STAT_FIELDS.filter(
  (field): field is Exclude<SeasonStatField, TierBField> => !(TIER_B_FIELDS as readonly string[]).includes(field),
);

const SEASON_STAT_FIELD_SET: ReadonlySet<string> = new Set(SEASON_STAT_FIELDS);

/** `true` se il nome e' uno dei 93 campi noti. */
export function isSeasonStatField(name: string): name is SeasonStatField {
  return SEASON_STAT_FIELD_SET.has(name);
}

/** `true` se il campo e' Tier B (§D.3). */
export function isTierBField(name: string): name is TierBField {
  return (TIER_B_FIELDS as readonly string[]).includes(name);
}

/**
 * Minuti minimi perche' un per-90 sia definito (§D.5): 270, cioe' tre partite
 * intere. Sotto: `NaN` — «tre partite di minuti non fanno un tasso».
 */
export const MIN_MINUTES_FOR_PER90 = 270;

/** Denominatore minimo di default per un rapporto (§D.5): 10 eventi. */
export const DEFAULT_MIN_RATIO_DENOMINATOR = 10;

/**
 * Per-90 di §D.5: `campo × 90 / minutesPlayed`, definito solo con
 * `minutesPlayed ≥ 270`.
 *
 * `null` in ingresso -> `NaN`, mai `0`: il divieto di §D.3 vive qui, nel punto
 * piu' basso della catena, perche' e' il punto che tutti attraversano.
 */
export function per90(value: number | null | undefined, minutes: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return NaN;
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return NaN;
  if (minutes < MIN_MINUTES_FOR_PER90) return NaN;
  return (value * 90) / minutes;
}

/**
 * Rapporto di §D.5: `num/den`, definito solo con `den ≥ minDenominator`
 * (default 10 eventi; le eccezioni 5 e 3 sono dichiarate nel catalogo, feature
 * per feature).
 *
 * Un denominatore nullo o sotto soglia da' `NaN`, non `0` e non `1`: un
 * rapporto su tre eventi non e' una misura di qualita', e scriverlo come se lo
 * fosse e' esattamente il modo in cui un modello impara il rumore di chi ha
 * giocato poco.
 */
export function ratio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  minDenominator: number = DEFAULT_MIN_RATIO_DENOMINATOR,
): number {
  if (numerator === null || numerator === undefined || !Number.isFinite(numerator)) return NaN;
  if (denominator === null || denominator === undefined || !Number.isFinite(denominator)) return NaN;
  if (denominator < minDenominator || denominator === 0) return NaN;
  return numerator / denominator;
}

export class SeasonStatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonStatsError";
  }
}

export interface SeasonStatsValidation {
  /** Campi presenti e con valore numerico. */
  readonly observedFields: readonly SeasonStatField[];
  /** Campi presenti ma esplicitamente non osservati (`null`). */
  readonly nullFields: readonly SeasonStatField[];
  /** Campi dei 93 non presenti nella riga: non chiesti, che non e' «mancante». */
  readonly absentFields: readonly SeasonStatField[];
  /** Chiavi che non sono fra i 93: la riga non e' quella che crediamo. */
  readonly unknownKeys: readonly string[];
}

/**
 * Validatore STRUTTURALE della riga: chiavi note, valori `number | null`.
 *
 * Non coerce e non ripara: guarda e riferisce. Una chiave sconosciuta o un
 * valore di tipo sbagliato sono un fatto sul dato, non un inconveniente da
 * assorbire — chi chiama decide se fermarsi (`assertValidSeasonStatsRow`) o
 * contarli nel report.
 */
export function validateSeasonStatsRow(row: Readonly<Record<string, unknown>>): SeasonStatsValidation {
  const observedFields: SeasonStatField[] = [];
  const nullFields: SeasonStatField[] = [];
  const absentFields: SeasonStatField[] = [];
  const unknownKeys: string[] = [];

  for (const key of Object.keys(row)) {
    if (!isSeasonStatField(key)) {
      unknownKeys.push(key);
      continue;
    }
    const value = row[key];
    if (value === null) {
      nullFields.push(key);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new SeasonStatsError(
        `validateSeasonStatsRow: il campo '${key}' vale '${String(value)}' — atteso number finito oppure null. ` +
          "Nessuna coercizione: un valore che non e' un numero non diventa un numero (§D.3).",
      );
    }
    observedFields.push(key);
  }
  for (const field of SEASON_STAT_FIELDS) {
    if (!(field in row)) absentFields.push(field);
  }
  return {
    observedFields,
    nullFields,
    absentFields,
    unknownKeys: [...unknownKeys].sort(),
  };
}

/** Come `validateSeasonStatsRow`, ma una chiave sconosciuta e' un errore fatale. */
export function assertValidSeasonStatsRow(row: Readonly<Record<string, unknown>>): SeasonStatsValidation {
  const validation = validateSeasonStatsRow(row);
  if (validation.unknownKeys.length > 0) {
    throw new SeasonStatsError(
      `assertValidSeasonStatsRow: chiavi sconosciute [${validation.unknownKeys.join(", ")}] — ` +
        "il catalogo di stagione ha 93 campi e questa riga ne porta altri.",
    );
  }
  return validation;
}

/**
 * Legge un campo dalla riga generica di `GenPanelRow.seasonStats`.
 *
 * Ritorna `null` sia per «assente» sia per «non osservato»: a valle le due
 * producono lo stesso `NaN`, e chi ha bisogno di distinguerle usa
 * `validateSeasonStatsRow`.
 */
export function readStatField(
  stats: Readonly<Record<string, number | null>> | undefined,
  field: SeasonStatField,
): number | null {
  if (stats === undefined) return null;
  const value = stats[field];
  if (value === undefined || value === null) return null;
  return Number.isFinite(value) ? value : null;
}
