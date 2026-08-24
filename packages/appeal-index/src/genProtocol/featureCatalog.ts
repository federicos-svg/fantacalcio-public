// GEN-PROTOCOL-A §D.5 — il catalogo delle feature, dichiarativo ed eseguibile. PURO.
//
// Perche' un CATALOGO e non un builder che calcola e basta: §D.5 non descrive
// un vettore, descrive un contratto. Ogni feature ha un blocco, una formula,
// un denominatore minimo, un dominio di ruolo, un tier e un'appartenenza ai
// set S1/S2/S3a/S3b — e ognuna di queste cose ha conseguenze verificabili
// (l'ammissibilita' per coverage di §B.3.2, il divieto xG-su-portiere di §D.3,
// la stratificazione d'era di S3b). Se quelle proprieta' vivessero solo dentro
// i rami di una funzione, nessuno potrebbe controllarle senza rieseguire il
// codice. Qui sono dati: si leggono, si contano, si asseriscono.
//
// LA RIPARAZIONE DELLA SITUAZIONE B, che e' il motivo per cui questo builder
// non poteva riusare `../dataset.ts`. Quello emette una riga solo quando il
// giocatore ha la stagione s E la stagione s+1 consecutive
// (`dataset.ts:184`, `currentFeatureSnapshot.ts:133`): chi salta un anno —
// infortunio lungo, un anno all'estero, un anno in B — sparisce dal dataset,
// e sparisce silenziosamente. Sono le righe «senza match storico» che il
// listone 2026/27 conta a centinaia. Qui la regola e' quella del protocollo:
// una riga per OGNI giocatore con almeno una stagione osservata ≤ s−1, anche
// col buco in s−1. Le feature Lag1 diventano `NaN` (che e' la verita': non
// esiste una stagione s−1 da cui leggerle) e le Rolling3 usano le stagioni
// osservate. Il legacy phase4 resta com'e': e' un altro protocollo, con altri
// artefatti gia' prodotti, e cambiarlo qui vorrebbe dire cambiare il
// significato di quelli.
//
// I DIVIETI DI §D.3, che qui sono codice e non buone intenzioni:
//   - `null → 0` non esiste: ogni trasformazione che tocca un ingresso non
//     osservato restituisce `NaN`, e una guardia interna verifica che un
//     ingresso `null` non possa MAI produrre un numero finito;
//   - nessuna media imputata a un campo mai osservato: non c'e' un solo ramo
//     di codice che legga una media di ruolo per riempire un buco;
//   - xG e xA non entrano nel dominio del portiere: e' una proprieta' del
//     catalogo, e `assertCatalogInvariants()` la verifica sul catalogo stesso.
//
// L'unica eccezione dichiarata al primo divieto e' l'encoding S3a
// (valore × indicatore), che il protocollo autorizza esplicitamente come
// «encoding interno al modello» e che vive in un percorso separato e con un
// nome che lo dice: `encodeTierBWithIndicator`.

import { seasonYear } from "../identityStability.js";
import { lastObservedVolatility } from "../seasonAggregate.js";
import { stdDev } from "../stats.js";
import { assertNoGenLeakage } from "./anteriorityAudit.js";
import {
  isValidPresence,
  matchdayFantavoto,
  type GenFeatureRow,
  type GenPanelRow,
  type GenRole,
  type GenSeason,
  type GenTargets,
  type MatchdayVote,
} from "./genTypes.js";
import {
  per90,
  ratio,
  readStatField,
  TIER_B_FIELDS,
  TIER_B_FIRST_TARGET_SEASON,
  type SeasonStatField,
  type TierBField,
} from "./seasonStats.js";

export class GenFeatureCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenFeatureCatalogError";
  }
}

/** I blocchi di §D.5: X dai voti; R, P, O, D, T, G, K dalle statistiche. */
export type GenFeatureBlock = "X" | "R" | "P" | "O" | "D" | "T" | "G" | "K";

/** Tier A = 90 campi su dieci stagioni; Tier B = i tre a copertura parziale (§D.3). */
export type GenFeatureTier = "A" | "B";

/** I set di §D.3. `S3a` = indicatori; `S3b` = stratificazione d'era. */
export type GenFeatureSet = "S1" | "S2" | "S3a" | "S3b";

export const GEN_FEATURE_SETS: readonly GenFeatureSet[] = ["S1", "S2", "S3a", "S3b"] as const;

const ALL_ROLES: readonly GenRole[] = ["P", "D", "C", "A"] as const;
const OUTFIELD: readonly GenRole[] = ["D", "C", "A"] as const;
const KEEPER: readonly GenRole[] = ["P"] as const;

/**
 * Come una feature statistica si ricava dai campi di stagione.
 *
 * E' un dato, non una funzione: cosi' il catalogo dice per iscritto quale
 * numeratore sta su quale denominatore, e P0.13 puo' verificare le coppie
 * senza leggere il codice che le calcola.
 */
export type GenStatTransform =
  /** Il campo cosi' com'e'. */
  | { readonly kind: "raw"; readonly field: SeasonStatField }
  /** Il campo cosi' com'e', ma solo sopra una soglia su un altro campo (il `rating` con `countRating ≥ 10`). */
  | {
      readonly kind: "gatedRaw";
      readonly field: SeasonStatField;
      readonly gateField: SeasonStatField;
      readonly gateMin: number;
    }
  /** Per-90 della somma dei campi (una somma sola = il caso normale). */
  | { readonly kind: "per90"; readonly fields: readonly SeasonStatField[] }
  /** Rapporto fra somme, col denominatore minimo dichiarato. */
  | {
      readonly kind: "ratio";
      readonly numerator: readonly SeasonStatField[];
      readonly denominator: readonly SeasonStatField[];
      readonly minDenominator: number;
    }
  /** Differenza fra due campi: l'over/under-performance (`goals − xG`). */
  | { readonly kind: "difference"; readonly minuend: SeasonStatField; readonly subtrahend: SeasonStatField };

/** Le feature del blocco X, che si ricavano dai voti e non dalle statistiche. */
export type GenVoteFeatureId =
  | "fantamediaLag1"
  | "mediaVotoBaseLag1"
  | "presenzeLag1"
  | "formaUltime10"
  | "bonusRate"
  | "malusRate"
  | "golLag1"
  | "assistLag1"
  | "rigoristaHist"
  | "cleanSheetRateLag1"
  | "golSubitiPerPresenzaLag1"
  | "rigoriParatiPerPresenzaLag1"
  | "volatilitaVotoLastObserved"
  | "stagioniOsservate"
  | "teamChangedFlag"
  | "etaSerieA";

/**
 * `season` = la feature ha un valore per ogni stagione osservata (e quindi una
 * Rolling3 possibile); `history` = la feature e' una proprieta' della storia
 * intera (quante stagioni, quanti anni dal debutto), e una sua media a tre
 * stagioni non vorrebbe dire niente.
 */
export type GenFeatureScope = "season" | "history";

export interface GenFeatureDefinition {
  readonly name: string;
  readonly block: GenFeatureBlock;
  readonly tier: GenFeatureTier;
  readonly sets: readonly GenFeatureSet[];
  readonly roleDomain: readonly GenRole[];
  /** La formula, scritta come la scrive §D.5. E' documentazione ESEGUIBILE: il test la confronta col trasformatore. */
  readonly formula: string;
  readonly scope: GenFeatureScope;
  /** `true` se la feature entra anche come media a 3 stagioni pesata recency (§D.5). */
  readonly rolling3: boolean;
  /** Nome della compagna Rolling3. Esplicito dove §D.5 lo nomina (`fantamediaRolling3`, non `fantamediaLag1Rolling3`). */
  readonly rolling3Name?: string;
  /** Presente se e solo se la feature viene dalle statistiche di stagione. */
  readonly transform?: GenStatTransform;
  /** Presente se e solo se la feature viene dai voti. */
  readonly voteFeature?: GenVoteFeatureId;
}

const S1_UP: readonly GenFeatureSet[] = ["S1", "S2", "S3a", "S3b"] as const;
const S2_UP: readonly GenFeatureSet[] = ["S2", "S3a", "S3b"] as const;
const S3_ONLY: readonly GenFeatureSet[] = ["S3a", "S3b"] as const;

function vote(
  name: string,
  voteFeature: GenVoteFeatureId,
  formula: string,
  roleDomain: readonly GenRole[],
  scope: GenFeatureScope,
  rolling3: boolean,
  rolling3Name?: string,
): GenFeatureDefinition {
  return { name, block: "X", tier: "A", sets: S1_UP, roleDomain, formula, scope, rolling3, rolling3Name, voteFeature };
}

function stat(
  name: string,
  block: GenFeatureBlock,
  roleDomain: readonly GenRole[],
  formula: string,
  transform: GenStatTransform,
  tier: GenFeatureTier = "A",
): GenFeatureDefinition {
  return {
    name,
    block,
    tier,
    sets: tier === "B" ? S3_ONLY : S2_UP,
    roleDomain,
    formula,
    scope: "season",
    rolling3: true,
    transform,
  };
}

function p90(name: string, block: GenFeatureBlock, roleDomain: readonly GenRole[], ...fields: SeasonStatField[]) {
  return stat(name, block, roleDomain, `(${fields.join(" + ")}) × 90 / minutesPlayed, min 270'`, {
    kind: "per90",
    fields,
  });
}

function rate(
  name: string,
  block: GenFeatureBlock,
  roleDomain: readonly GenRole[],
  numerator: readonly SeasonStatField[],
  denominator: readonly SeasonStatField[],
  minDenominator: number,
) {
  return stat(
    name,
    block,
    roleDomain,
    `(${numerator.join(" + ")}) / (${denominator.join(" + ")}), den ≥ ${String(minDenominator)}`,
    { kind: "ratio", numerator, denominator, minDenominator },
  );
}

/**
 * IL CATALOGO — §D.5 per intero, blocco per blocco, nell'ordine del protocollo.
 *
 * Ogni riga porta la sua formula scritta accanto. I conteggi fra parentesi nei
 * titoli di §D.5 («16 campi», «17») contano i CAMPI del blocco, non le feature
 * che se ne ricavano: un campo con rapporto e volume ne produce due.
 */
export const GEN_FEATURE_CATALOG: readonly GenFeatureDefinition[] = [
  // --- Blocco X — dai voti (S1, 10/10 stagioni) -----------------------------
  vote("fantamediaLag1", "fantamediaLag1", "fantamedia della stagione s−1", ALL_ROLES, "season", true, "fantamediaRolling3"),
  vote("mediaVotoBaseLag1", "mediaVotoBaseLag1", "media del voto base in s−1", ALL_ROLES, "season", true, "mediaVotoBaseRolling3"),
  vote("presenzeLag1", "presenzeLag1", "presenze valide in s−1", ALL_ROLES, "season", true, "presenzeRolling3"),
  vote(
    "formaUltime10",
    "formaUltime10",
    "fantavoto medio delle ultime 10 presenze valide di s−1",
    ALL_ROLES,
    "season",
    true,
    "formaUltime10Rolling3",
  ),
  vote("bonusRate", "bonusRate", "(3·(Gf + Rf) + Ass) / presenze in s−1", ALL_ROLES, "season", true),
  vote("malusRate", "malusRate", "(0,5·Amm + Esp + 2·Au) / presenze in s−1", ALL_ROLES, "season", true),
  vote("golLag1", "golLag1", "gol fatti (azione + rigore: Gf + Rf) in s−1", ALL_ROLES, "season", true, "golRolling3"),
  vote("assistLag1", "assistLag1", "assist in s−1", ALL_ROLES, "season", true, "assistRolling3"),
  vote(
    "rigoristaHist",
    "rigoristaHist",
    "flag: Rf + Rs ≥ 3 in s−1, integrabile con penaltiesTaken ≥ 3 (§D.10.1)",
    ALL_ROLES,
    "season",
    false,
  ),
  vote("cleanSheetRateLag1", "cleanSheetRateLag1", "presenze con Gs = 0 / presenze, in s−1", KEEPER, "season", true, "cleanSheetRateRolling3"),
  vote("golSubitiPerPresenzaLag1", "golSubitiPerPresenzaLag1", "Gs / presenze in s−1", KEEPER, "season", true, "golSubitiPerPresenzaRolling3"),
  vote("rigoriParatiPerPresenzaLag1", "rigoriParatiPerPresenzaLag1", "Rp / presenze in s−1", KEEPER, "season", true, "rigoriParatiPerPresenzaRolling3"),
  vote(
    "volatilitaVotoLastObserved",
    "volatilitaVotoLastObserved",
    "dispersione del voto base della stagione piu' recente con ≥ 2 presenze",
    ALL_ROLES,
    "history",
    false,
  ),
  vote("stagioniOsservate", "stagioniOsservate", "numero di stagioni osservate ≤ s−1", ALL_ROLES, "history", false),
  vote("teamChangedFlag", "teamChangedFlag", "1 se la squadra di s−1 differisce da quella di s−2", ALL_ROLES, "history", false),
  vote("etaSerieA", "etaSerieA", "stagioni dal debutto nel panel (surrogato dell'anzianita', non dell'eta')", ALL_ROLES, "history", false),

  // --- Blocco R — rendimento base (16 campi) --------------------------------
  stat("ratingGated", "R", ALL_ROLES, "rating, solo con countRating ≥ 10", {
    kind: "gatedRaw",
    field: "rating",
    gateField: "countRating",
    gateMin: 10,
  }),
  stat("countRating", "R", ALL_ROLES, "countRating (peso di affidabilita' del rating)", { kind: "raw", field: "countRating" }),
  stat("minutesPlayed", "R", ALL_ROLES, "minutesPlayed (volume e denominatore)", { kind: "raw", field: "minutesPlayed" }),
  stat("appearances", "R", ALL_ROLES, "appearances", { kind: "raw", field: "appearances" }),
  rate("titolaritaShare", "R", ALL_ROLES, ["matchesStarted"], ["appearances"], 5),
  p90("goalsPer90", "R", ALL_ROLES, "goals"),
  p90("assistsPer90", "R", ALL_ROLES, "assists"),
  p90("yellowCardsPer90", "R", ALL_ROLES, "yellowCards"),
  p90("espulsioniTotaliPer90", "R", ALL_ROLES, "redCards", "yellowRedCards", "directRedCards"),
  p90("redCardsPer90", "R", ALL_ROLES, "redCards"),
  p90("yellowRedCardsPer90", "R", ALL_ROLES, "yellowRedCards"),
  p90("directRedCardsPer90", "R", ALL_ROLES, "directRedCards"),
  rate("cleanSheetShare", "R", ALL_ROLES, ["cleanSheet"], ["appearances"], 10),
  p90("goalsConcededPer90", "R", ALL_ROLES, "goalsConceded"),
  p90("savesPer90", "R", KEEPER, "saves"),
  // Tier B del blocco R: xG/xA MAI sul portiere (§D.3, divieto assoluto).
  stat("expectedGoalsPer90", "R", OUTFIELD, "expectedGoals × 90 / minutesPlayed, min 270'", { kind: "per90", fields: ["expectedGoals"] }, "B"),
  stat("expectedAssistsPer90", "R", OUTFIELD, "expectedAssists × 90 / minutesPlayed, min 270'", { kind: "per90", fields: ["expectedAssists"] }, "B"),
  stat("goalsMinusExpectedGoals", "R", OUTFIELD, "goals − expectedGoals (overperformance)", { kind: "difference", minuend: "goals", subtrahend: "expectedGoals" }, "B"),
  stat("assistsMinusExpectedAssists", "R", OUTFIELD, "assists − expectedAssists (overperformance)", { kind: "difference", minuend: "assists", subtrahend: "expectedAssists" }, "B"),

  // --- Blocco P — passaggi e possesso (17 campi) ----------------------------
  rate("passAccuracy", "P", ALL_ROLES, ["accuratePasses"], ["accuratePasses", "inaccuratePasses"], 10),
  rate("crossAccuracy", "P", ALL_ROLES, ["accurateCrosses"], ["totalCross"], 10),
  rate("longBallAccuracy", "P", ALL_ROLES, ["accurateLongBalls"], ["totalLongBalls"], 10),
  rate("chippedPassAccuracy", "P", ALL_ROLES, ["accurateChippedPasses"], ["totalChippedPasses"], 10),
  rate("oppositionHalfPassAccuracy", "P", ALL_ROLES, ["accurateOppositionHalfPasses"], ["totalOppositionHalfPasses"], 10),
  rate("ownHalfPassAccuracy", "P", ALL_ROLES, ["accurateOwnHalfPasses"], ["totalOwnHalfPasses"], 10),
  p90("accurateFinalThirdPassesPer90", "P", ALL_ROLES, "accurateFinalThirdPasses"),
  p90("keyPassesPer90", "P", ALL_ROLES, "keyPasses"),
  p90("totalAttemptAssistPer90", "P", ALL_ROLES, "totalAttemptAssist"),
  p90("passToAssistPer90", "P", ALL_ROLES, "passToAssist"),
  p90("touchesPer90", "P", ALL_ROLES, "touches"),
  rate("assistConversion", "P", ALL_ROLES, ["assists"], ["totalAttemptAssist"], 10),
  // «Il rapporto dice la qualita', il volume dice il ruolo tattico» (§D.5).
  p90("totalPassesPer90", "P", ALL_ROLES, "accuratePasses", "inaccuratePasses"),
  p90("totalCrossPer90", "P", ALL_ROLES, "totalCross"),
  p90("totalLongBallsPer90", "P", ALL_ROLES, "totalLongBalls"),
  p90("totalChippedPassesPer90", "P", ALL_ROLES, "totalChippedPasses"),
  p90("totalOppositionHalfPassesPer90", "P", ALL_ROLES, "totalOppositionHalfPasses"),
  p90("totalOwnHalfPassesPer90", "P", ALL_ROLES, "totalOwnHalfPasses"),

  // --- Blocco O — occasioni (2 campi) ---------------------------------------
  p90("bigChancesCreatedPer90", "O", ALL_ROLES, "bigChancesCreated"),
  p90("bigChancesMissedPer90", "O", ALL_ROLES, "bigChancesMissed"),
  rate("finalizzazioneBigChances", "O", ALL_ROLES, ["goals"], ["goals", "bigChancesMissed"], 10),

  // --- Blocco D — duelli, difesa, errori (21 campi) -------------------------
  rate("tackleSuccess", "D", ALL_ROLES, ["tacklesWon"], ["tackles"], 10),
  rate("aerialDuelSuccess", "D", ALL_ROLES, ["aerialDuelsWon"], ["aerialDuelsWon", "aerialLost"], 10),
  rate("dribbleSuccess", "D", ALL_ROLES, ["successfulDribbles"], ["totalContest"], 10),
  p90("tacklesPer90", "D", ALL_ROLES, "tackles"),
  p90("interceptionsPer90", "D", ALL_ROLES, "interceptions"),
  p90("clearancesPer90", "D", ALL_ROLES, "clearances"),
  p90("blockedShotsPer90", "D", ALL_ROLES, "blockedShots"),
  p90("outfielderBlocksPer90", "D", OUTFIELD, "outfielderBlocks"),
  p90("ballRecoveryPer90", "D", ALL_ROLES, "ballRecovery"),
  p90("possessionWonAttThirdPer90", "D", ALL_ROLES, "possessionWonAttThird"),
  p90("groundDuelsWonPer90", "D", ALL_ROLES, "groundDuelsWon"),
  p90("duelLostPer90", "D", ALL_ROLES, "duelLost"),
  p90("dribbledPastPer90", "D", ALL_ROLES, "dribbledPast"),
  p90("possessionLostPer90", "D", ALL_ROLES, "possessionLost"),
  p90("dispossessedPer90", "D", ALL_ROLES, "dispossessed"),
  p90("wasFouledPer90", "D", ALL_ROLES, "wasFouled"),
  p90("foulsPer90", "D", ALL_ROLES, "fouls"),
  p90("erroriTotaliPer90", "D", ALL_ROLES, "errorLeadToGoal", "errorLeadToShot"),
  p90("errorLeadToGoalPer90", "D", ALL_ROLES, "errorLeadToGoal"),
  p90("errorLeadToShotPer90", "D", ALL_ROLES, "errorLeadToShot"),

  // --- Blocco T — tiri e gol (16 campi) -------------------------------------
  rate("shotAccuracy", "T", ALL_ROLES, ["shotsOnTarget"], ["totalShots"], 10),
  rate("shotConversion", "T", ALL_ROLES, ["goals"], ["totalShots"], 10),
  rate("insideBoxConversion", "T", ALL_ROLES, ["goalsFromInsideTheBox"], ["shotsFromInsideTheBox"], 10),
  rate("outsideBoxConversion", "T", ALL_ROLES, ["goalsFromOutsideTheBox"], ["shotsFromOutsideTheBox"], 10),
  p90("totalShotsPer90", "T", ALL_ROLES, "totalShots"),
  p90("shotsOnTargetPer90", "T", ALL_ROLES, "shotsOnTarget"),
  p90("shotsOffTargetPer90", "T", ALL_ROLES, "shotsOffTarget"),
  p90("shotsFromInsideTheBoxPer90", "T", ALL_ROLES, "shotsFromInsideTheBox"),
  p90("shotsFromOutsideTheBoxPer90", "T", ALL_ROLES, "shotsFromOutsideTheBox"),
  p90("hitWoodworkPer90", "T", ALL_ROLES, "hitWoodwork"),
  p90("shotFromSetPiecePer90", "T", ALL_ROLES, "shotFromSetPiece"),
  p90("freeKickGoalPer90", "T", ALL_ROLES, "freeKickGoal"),
  p90("offsidesPer90", "T", ALL_ROLES, "offsides"),
  p90("ownGoalsPer90", "T", ALL_ROLES, "ownGoals"),
  rate("headedGoalsShare", "T", ALL_ROLES, ["headedGoals"], ["goals"], 5),
  rate("leftFootGoalsShare", "T", ALL_ROLES, ["leftFootGoals"], ["goals"], 5),
  rate("rightFootGoalsShare", "T", ALL_ROLES, ["rightFootGoals"], ["goals"], 5),
  stat("setPieceConversion", "T", ALL_ROLES, "setPieceConversion cosi' com'e' (P0.13 ne misura il range)", {
    kind: "raw",
    field: "setPieceConversion",
  }),

  // --- Blocco G — rigori (9 campi) ------------------------------------------
  stat("penaltiesTaken", "G", ALL_ROLES, "penaltiesTaken (volume: il segnale rigorista)", { kind: "raw", field: "penaltiesTaken" }),
  rate("penaltyConversion", "G", ALL_ROLES, ["penaltyGoals"], ["penaltiesTaken"], 3),
  p90("penaltyMissPer90", "G", ALL_ROLES, "attemptPenaltyMiss", "attemptPenaltyPost"),
  stat("attemptPenaltyTarget", "G", ALL_ROLES, "attemptPenaltyTarget cosi' com'e'", { kind: "raw", field: "attemptPenaltyTarget" }),
  p90("penaltyWonPer90", "G", ALL_ROLES, "penaltyWon"),
  p90("penaltyConcededPer90", "G", ["D"], "penaltyConceded"),
  stat("penaltyFaced", "G", KEEPER, "penaltyFaced cosi' com'e'", { kind: "raw", field: "penaltyFaced" }),
  rate("penaltySaveShare", "G", KEEPER, ["penaltySave"], ["penaltyFaced"], 3),

  // --- Blocco K — portiere (12 campi), dominio P e solo P -------------------
  rate("saveShare", "K", KEEPER, ["saves"], ["saves", "goalsConceded"], 10),
  rate("saveCaughtShare", "K", KEEPER, ["savesCaught"], ["savesCaught", "savesParried"], 10),
  p90("goalsConcededInsideTheBoxPer90", "K", KEEPER, "goalsConcededInsideTheBox"),
  p90("goalsConcededOutsideTheBoxPer90", "K", KEEPER, "goalsConcededOutsideTheBox"),
  p90("savedShotsFromInsideTheBoxPer90", "K", KEEPER, "savedShotsFromInsideTheBox"),
  p90("savedShotsFromOutsideTheBoxPer90", "K", KEEPER, "savedShotsFromOutsideTheBox"),
  p90("highClaimsPer90", "K", KEEPER, "highClaims"),
  p90("punchesPer90", "K", KEEPER, "punches"),
  p90("runsOutPer90", "K", KEEPER, "runsOut"),
  p90("crossesNotClaimedPer90", "K", KEEPER, "crossesNotClaimed"),
  rate("highClaimShare", "K", KEEPER, ["highClaims"], ["highClaims", "crossesNotClaimed"], 5),
  p90("goalKicksPer90", "K", KEEPER, "goalKicks"),
  stat("goalsPreventedPer90", "K", KEEPER, "goalsPrevented × 90 / minutesPlayed, min 270'", { kind: "per90", fields: ["goalsPrevented"] }, "B"),
];

/** Suffisso dell'indicatore di disponibilita' Tier B in S3a (§D.3). */
export const TIER_B_INDICATOR_SUFFIX = "Osservato";

/**
 * Half-life di recency della media a 3 stagioni.
 *
 * §D.5 chiede una «rolling mean a 3 stagioni pesata recency» ma NON fissa
 * l'half-life: la griglia `{1,5; 3; ∞}` di §B.1 e' un iperparametro del
 * MODELLO, scelto dentro il training fold, non una costante del builder. 3 e'
 * il valore dichiarato qui (lo stesso che §D.9 fissa per T-D) ed e'
 * sovrascrivibile dal chiamante: il punto e' che sia scritto, non che sia
 * scolpito. Segnalato come punto non eseguibile alla lettera.
 */
export const ROLLING3_HALF_LIFE = 3;

/** Finestra della rolling: 3 stagioni osservate, «dove la storia esiste, mai riempita» (§D.5). */
export const ROLLING3_WINDOW = 3;

/** Presenze minime perche' `volatilitaVoto` di una stagione esista (§D.5, blocco X). */
export const MIN_PRESENCES_FOR_VOLATILITY = 2;

/** Presenze considerate da `formaUltime10` (§D.5, blocco X). */
export const FORMA_WINDOW = 10;

/** Soglia del flag rigorista storico (§D.5, §D.10.1). */
export const RIGORISTA_HIST_MIN_EVENTS = 3;

/** Soglia alternativa del flag rigorista, dal blocco statistiche (§D.10.1). */
export const RIGORISTA_HIST_MIN_PENALTIES_TAKEN = 3;

const CATALOG_BY_NAME: ReadonlyMap<string, GenFeatureDefinition> = new Map(
  GEN_FEATURE_CATALOG.map((definition) => [definition.name, definition]),
);

/** La definizione di una feature per nome; `undefined` se il nome non e' nel catalogo. */
export function featureDefinition(name: string): GenFeatureDefinition | undefined {
  return CATALOG_BY_NAME.get(name);
}

/**
 * Le invarianti del catalogo, verificate SUL CATALOGO.
 *
 * Non e' una tautologia: e' la trascrizione dei divieti di §D.3 in asserzioni
 * su un dato. Se qualcuno aggiungesse domani una feature xG con la `P` nel
 * dominio, questa funzione lo direbbe prima che un solo fit giri.
 */
export function assertCatalogInvariants(catalog: readonly GenFeatureDefinition[] = GEN_FEATURE_CATALOG): void {
  const seen = new Set<string>();
  for (const definition of catalog) {
    if (seen.has(definition.name)) {
      throw new GenFeatureCatalogError(`assertCatalogInvariants: nome di feature duplicato '${definition.name}'`);
    }
    seen.add(definition.name);
    const rollingName = rolling3NameOf(definition);
    if (rollingName !== null) {
      if (seen.has(rollingName)) {
        throw new GenFeatureCatalogError(`assertCatalogInvariants: nome Rolling3 duplicato '${rollingName}'`);
      }
      seen.add(rollingName);
    }

    const hasTransform = definition.transform !== undefined;
    const hasVote = definition.voteFeature !== undefined;
    if (hasTransform === hasVote) {
      throw new GenFeatureCatalogError(
        `assertCatalogInvariants: '${definition.name}' deve dichiarare o una trasformazione statistica o una feature di voto, mai entrambe e mai nessuna`,
      );
    }
    if (definition.roleDomain.length === 0) {
      throw new GenFeatureCatalogError(`assertCatalogInvariants: '${definition.name}' ha dominio di ruolo vuoto`);
    }
    if (definition.scope === "history" && definition.rolling3) {
      throw new GenFeatureCatalogError(
        `assertCatalogInvariants: '${definition.name}' e' una feature di storia e non puo' avere una Rolling3`,
      );
    }

    const fields = transformFields(definition.transform);
    const usesTierB = fields.some((field) => (TIER_B_FIELDS as readonly string[]).includes(field));
    if (usesTierB && definition.tier !== "B") {
      throw new GenFeatureCatalogError(
        `assertCatalogInvariants: '${definition.name}' legge un campo Tier B ma si dichiara Tier A`,
      );
    }
    if (definition.tier === "B" && !definition.sets.every((s) => s === "S3a" || s === "S3b")) {
      throw new GenFeatureCatalogError(
        `assertCatalogInvariants: '${definition.name}' e' Tier B e non puo' vivere in S1 o S2 (§D.3)`,
      );
    }
    // Il divieto assoluto di §D.3: xG/xA non entrano nel vettore del portiere.
    const usesExpected = fields.some((field) => field === "expectedGoals" || field === "expectedAssists");
    if (usesExpected && definition.roleDomain.includes("P")) {
      throw new GenFeatureCatalogError(
        `assertCatalogInvariants: '${definition.name}' porta xG/xA nel dominio del portiere — vietato da §D.3 ` +
          "(il buco e' strutturale: le righe con saves > 0 non portano xG)",
      );
    }
  }
}

function transformFields(transform: GenStatTransform | undefined): readonly SeasonStatField[] {
  if (transform === undefined) return [];
  switch (transform.kind) {
    case "raw":
      return [transform.field];
    case "gatedRaw":
      return [transform.field, transform.gateField];
    case "per90":
      return [...transform.fields, "minutesPlayed"];
    case "ratio":
      return [...transform.numerator, ...transform.denominator];
    case "difference":
      return [transform.minuend, transform.subtrahend];
  }
}

function rolling3NameOf(definition: GenFeatureDefinition): string | null {
  if (!definition.rolling3) return null;
  return definition.rolling3Name ?? `${definition.name}Rolling3`;
}

/** I confini d'era dei campi Tier B: default = quelli attesi da §D.3, sovrascrivibili da P0. */
export type TierBEraBoundaries = Readonly<Record<TierBField, GenSeason>>;

export interface GenFeatureBuildOptions {
  /** Half-life della Rolling3 (default `ROLLING3_HALF_LIFE`). */
  readonly rollingHalfLife?: number;
  /** Finestra della Rolling3 in stagioni osservate (default `ROLLING3_WINDOW`). */
  readonly rollingWindow?: number;
  /** Confini d'era Tier B per S3b (default `TIER_B_FIRST_TARGET_SEASON`). */
  readonly tierBEraBoundaries?: TierBEraBoundaries;
  /** Catalogo alternativo: serve ai test e alle sensibilita', mai al percorso di protocollo. */
  readonly catalog?: readonly GenFeatureDefinition[];
}

/**
 * I nomi delle feature attive per un set e un ruolo, nell'ordine del catalogo.
 *
 * E' la lista che si passa a `fitElasticNet`/`fitBoostedStumps` come set
 * attivo: l'ordine e' quello del catalogo, quindi due run producono la stessa
 * matrice nella stessa colonna, che e' meta' del determinismo di §B.3.1.
 */
export function activeFeatureNames(
  set: GenFeatureSet,
  role: GenRole,
  options: GenFeatureBuildOptions = {},
): readonly string[] {
  const catalog = options.catalog ?? GEN_FEATURE_CATALOG;
  const names: string[] = [];
  for (const definition of catalog) {
    if (!definition.sets.includes(set)) continue;
    if (!definition.roleDomain.includes(role)) continue;
    names.push(...emittedNamesOf(definition, set));
  }
  return names;
}

/**
 * I nomi che UNA definizione emette in un set, nell'ordine in cui il builder li
 * scrive: valore, eventuale indicatore S3a, compagna Rolling3, eventuale
 * indicatore della Rolling3.
 *
 * Una funzione sola invece di due elenchi paralleli: un elenco che si scosta
 * dal builder produrrebbe un set attivo con nomi che nessuna riga possiede, e
 * ogni riga diventerebbe non scorabile — un guasto di coverage che sembra un
 * guasto di modello.
 */
function emittedNamesOf(definition: GenFeatureDefinition, set: GenFeatureSet): readonly string[] {
  const indicators = set === "S3a" && definition.tier === "B";
  const names: string[] = [definition.name];
  if (indicators) names.push(`${definition.name}${TIER_B_INDICATOR_SUFFIX}`);
  const rolling = rolling3NameOf(definition);
  if (rolling !== null) {
    names.push(rolling);
    if (indicators) names.push(`${rolling}${TIER_B_INDICATOR_SUFFIX}`);
  }
  return names;
}

/**
 * I nomi attivi per una riga S3b: dipendono dall'era della sua stagione-target
 * (i termini Tier B esistono solo dalle stagioni in cui il campo esiste).
 */
export function activeFeatureNamesForEra(
  role: GenRole,
  targetSeason: GenSeason,
  options: GenFeatureBuildOptions = {},
): readonly string[] {
  const boundaries = options.tierBEraBoundaries ?? TIER_B_FIRST_TARGET_SEASON;
  const catalog = options.catalog ?? GEN_FEATURE_CATALOG;
  const available = new Set(availableTierBFields(targetSeason, boundaries));
  const names: string[] = [];
  for (const definition of catalog) {
    if (!definition.sets.includes("S3b")) continue;
    if (!definition.roleDomain.includes(role)) continue;
    if (definition.tier === "B" && !transformFields(definition.transform).some((f) => available.has(f as TierBField))) {
      continue;
    }
    names.push(definition.name);
    const rolling = rolling3NameOf(definition);
    if (rolling !== null) names.push(rolling);
  }
  return names;
}

function availableTierBFields(targetSeason: GenSeason, boundaries: TierBEraBoundaries): readonly TierBField[] {
  const targetYear = seasonYear(targetSeason);
  return TIER_B_FIELDS.filter((field) => targetYear >= seasonYear(boundaries[field]));
}

/**
 * Costruisce le righe di feature per UNA stagione-target.
 *
 * Emette una riga per ogni giocatore con almeno una stagione osservata ≤ s−1,
 * anche senza riga in s−1 (la riparazione della situazione B). I bersagli
 * arrivano dalla riga di panel della stagione-target, se esiste; se non
 * esiste, sono `NaN` — che e' la differenza fra «non ha giocato» (T-N = 0, un
 * valore) e «non e' nel panel di quella stagione» (nessun bersaglio
 * osservato). Chi fitta esclude le righe senza bersaglio e le conta.
 */
export function buildGenFeatureRows(
  panel: readonly GenPanelRow[],
  set: GenFeatureSet,
  targetSeason: GenSeason,
  options: GenFeatureBuildOptions = {},
): readonly GenFeatureRow[] {
  const catalog = options.catalog ?? GEN_FEATURE_CATALOG;
  const halfLife = options.rollingHalfLife ?? ROLLING3_HALF_LIFE;
  const window = options.rollingWindow ?? ROLLING3_WINDOW;
  const boundaries = options.tierBEraBoundaries ?? TIER_B_FIRST_TARGET_SEASON;
  if (!(halfLife > 0)) throw new GenFeatureCatalogError("buildGenFeatureRows: rollingHalfLife deve essere positivo");
  if (!Number.isInteger(window) || window < 1) {
    throw new GenFeatureCatalogError("buildGenFeatureRows: rollingWindow deve essere un intero positivo");
  }
  const targetYear = seasonYear(targetSeason);

  const byPlayer = new Map<string, GenPanelRow[]>();
  for (const row of panel) {
    const bucket = byPlayer.get(row.playerKey);
    if (bucket === undefined) byPlayer.set(row.playerKey, [row]);
    else bucket.push(row);
  }

  const availableTierB = new Set(availableTierBFields(targetSeason, boundaries));
  const out: GenFeatureRow[] = [];

  for (const [playerKey, playerRows] of byPlayer) {
    const sorted = [...playerRows].sort((a, b) => seasonYear(a.season) - seasonYear(b.season));
    const history = sorted.filter((row) => seasonYear(row.season) < targetYear);
    if (history.length === 0) continue; // nessuna stagione osservata ≤ s−1: non c'e' riga da emettere
    const lag1 = history.find((row) => seasonYear(row.season) === targetYear - 1);
    const targetRow = sorted.find((row) => row.season === targetSeason);
    const role = history[history.length - 1]!.role;

    const features: Record<string, number> = {};
    for (const definition of catalog) {
      if (!definition.sets.includes(set)) continue;
      if (!definition.roleDomain.includes(role)) continue;

      const isTierB = definition.tier === "B";
      const tierBAvailable =
        !isTierB || transformFields(definition.transform).some((field) => availableTierB.has(field as TierBField));
      if (set === "S3b" && isTierB && !tierBAvailable) continue; // era precedente: il modello e' identico a S2

      const value = definition.scope === "history"
        ? historyFeatureValue(definition, history, targetSeason)
        : lag1 === undefined
          ? NaN
          : seasonFeatureValue(definition, lag1, role);

      const indicators = set === "S3a" && isTierB;
      if (indicators) {
        const encoded = encodeTierBWithIndicator(value);
        features[definition.name] = encoded.value;
        features[`${definition.name}${TIER_B_INDICATOR_SUFFIX}`] = encoded.indicator;
      } else {
        features[definition.name] = value;
      }

      const rollingName = rolling3NameOf(definition);
      if (rollingName !== null) {
        const rolling = rollingMeanOfDefinition(definition, history, role, window, halfLife);
        if (indicators) {
          const encoded = encodeTierBWithIndicator(rolling);
          features[rollingName] = encoded.value;
          features[`${rollingName}${TIER_B_INDICATOR_SUFFIX}`] = encoded.indicator;
        } else {
          features[rollingName] = rolling;
        }
      }
    }

    const targets = targetsOf(targetRow);
    out.push({
      playerKey,
      role,
      targetSeason,
      features,
      sourceSeasons: history.map((row) => row.season),
      // Peso NEUTRO alla costruzione: il peso di recency dipende dal fold (la
      // sua ancora e' l'ultima stagione del training, §B.1) e lo applica
      // `foldRecencyWeights`. Scriverne uno qui significherebbe fissarlo prima
      // di sapere in quale fold la riga finira'.
      recencyWeight: 1,
      presenceWeight: Number.isFinite(targets.tN) ? targets.tN : 0,
      targets,
    });
  }

  out.sort((a, b) => (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0));
  assertNoGenLeakage(out);
  return out;
}

function targetsOf(targetRow: GenPanelRow | undefined): GenTargets {
  if (targetRow === undefined) {
    return { tN: NaN, t1: NaN, t2: NaN, t2Weight: 0, tDBinCounts: null };
  }
  return {
    tN: targetRow.presenze,
    t1: targetRow.totFantavoto,
    t2: targetRow.fantamedia ?? NaN,
    t2Weight: targetRow.presenze,
    tDBinCounts: null,
  };
}

/**
 * L'encoding S3a: valore × indicatore.
 *
 * L'unico punto di tutto il modulo in cui un valore non osservato diventa uno
 * zero, e ci diventa perche' §D.3 lo autorizza per nome: «le righe con `NaN`
 * su un campo Tier B restano nel modello con il termine Tier B azzerato
 * dall'indicatore, mai dal valore … la coppia valore×indicatore e'
 * matematicamente equivalente ad "assente"». Il coefficiente
 * dell'indicatore assorbe la differenza sistematica fra osservato e non
 * osservato; il coefficiente del valore vede solo le righe osservate. Nessun
 * numero inventato entra nel DATO (il dato e' `seasonStats`, che resta
 * `null`): questa e' la matrice di disegno, e lo dice il nome.
 */
export function encodeTierBWithIndicator(value: number): { readonly value: number; readonly indicator: number } {
  return Number.isFinite(value) ? { value, indicator: 1 } : { value: 0, indicator: 0 };
}

// --- valutazione delle feature ---------------------------------------------

function seasonFeatureValue(definition: GenFeatureDefinition, row: GenPanelRow, role: GenRole): number {
  if (definition.voteFeature !== undefined) return voteSeasonValue(definition.voteFeature, row, role);
  return evaluateStatTransform(definition, row.seasonStats);
}

/**
 * Applica la trasformazione dichiarata, con la GUARDIA del divieto `null → 0`.
 *
 * La guardia non e' decorativa: e' l'unico modo di dimostrare che nessuna
 * trasformazione, presente o futura, puo' trasformare un'assenza in un numero.
 * Un ingresso non osservato deve produrre `NaN`; se producesse un numero
 * finito, questo lancia invece di lasciar passare il fatto falso.
 */
export function evaluateStatTransform(
  definition: GenFeatureDefinition,
  stats: Readonly<Record<string, number | null>> | undefined,
): number {
  const transform = definition.transform;
  if (transform === undefined) {
    throw new GenFeatureCatalogError(`evaluateStatTransform: '${definition.name}' non e' una feature statistica`);
  }
  let sawNull = false;
  const read = (field: SeasonStatField): number | null => {
    const value = readStatField(stats, field);
    if (value === null) sawNull = true;
    return value;
  };
  const sum = (fields: readonly SeasonStatField[]): number | null => {
    let total = 0;
    for (const field of fields) {
      const value = read(field);
      if (value === null) return null;
      total += value;
    }
    return total;
  };

  let value: number;
  switch (transform.kind) {
    case "raw": {
      const raw = read(transform.field);
      value = raw === null ? NaN : raw;
      break;
    }
    case "gatedRaw": {
      const raw = read(transform.field);
      const gate = read(transform.gateField);
      value = raw === null || gate === null || gate < transform.gateMin ? NaN : raw;
      break;
    }
    case "per90": {
      value = per90(sum(transform.fields), read("minutesPlayed"));
      break;
    }
    case "ratio": {
      value = ratio(sum(transform.numerator), sum(transform.denominator), transform.minDenominator);
      break;
    }
    case "difference": {
      const a = read(transform.minuend);
      const b = read(transform.subtrahend);
      value = a === null || b === null ? NaN : a - b;
      break;
    }
  }

  if (sawNull && Number.isFinite(value)) {
    throw new GenFeatureCatalogError(
      `evaluateStatTransform: '${definition.name}' ha prodotto il numero finito ${String(value)} pur avendo letto ` +
        "un campo non osservato — sarebbe un `null → 0` mascherato, che §D.3 vieta senza eccezioni",
    );
  }
  return value;
}

interface MatchdayTotals {
  readonly Gf: number;
  readonly Gs: number;
  readonly Rp: number;
  readonly Rs: number;
  readonly Rf: number;
  readonly Au: number;
  readonly Amm: number;
  readonly Esp: number;
  readonly Ass: number;
  readonly presenze: number;
  readonly cleanSheets: number;
}

function totalsOf(rows: readonly MatchdayVote[]): MatchdayTotals {
  let Gf = 0;
  let Gs = 0;
  let Rp = 0;
  let Rs = 0;
  let Rf = 0;
  let Au = 0;
  let Amm = 0;
  let Esp = 0;
  let Ass = 0;
  let presenze = 0;
  let cleanSheets = 0;
  for (const row of rows) {
    if (!isValidPresence(row)) continue;
    presenze++;
    Gf += row.Gf;
    Gs += row.Gs;
    Rp += row.Rp;
    Rs += row.Rs;
    Rf += row.Rf;
    Au += row.Au;
    Amm += row.Amm;
    Esp += row.Esp;
    Ass += row.Ass;
    if (row.Gs === 0) cleanSheets++;
  }
  return { Gf, Gs, Rp, Rs, Rf, Au, Amm, Esp, Ass, presenze, cleanSheets };
}

function voteSeasonValue(id: GenVoteFeatureId, row: GenPanelRow, role: GenRole): number {
  const totals = totalsOf(row.matchdays);
  const n = totals.presenze;
  switch (id) {
    case "fantamediaLag1":
      return row.fantamedia ?? NaN;
    case "mediaVotoBaseLag1":
      return row.mediaVotoBase ?? NaN;
    case "presenzeLag1":
      return row.presenze;
    case "formaUltime10":
      return formaUltime10(row, role);
    // ALLINEATO il 2026-08-24, ratificato da Pico. §D.5 dichiarava
    // «(3·Gf + Ass) / presenze», e il `3` e' la tariffa del gol scritta a mano.
    // La formula fu preregistrata credendo che `Gf` contenesse anche i rigori
    // segnati; la misura di campo privata del 2026-08-24 lo ha smentito, e
    // finche' la somma restava `3·Gf` un rigorista puro aveva `bonusRate`
    // sistematicamente sottostimato — la feature diceva «non produce bonus» di
    // chi ne produceva. Ora il moltiplicatore 3 si applica ai GOL, tutti:
    // `3·(Gf + Rf) + Ass`, coerente con la tariffa di `fantavoto.ts`.
    case "bonusRate":
      return n > 0 ? (3 * (totals.Gf + totals.Rf) + totals.Ass) / n : NaN;
    case "malusRate":
      return n > 0 ? (0.5 * totals.Amm + totals.Esp + 2 * totals.Au) / n : NaN;
    // Gol e assist di una stagione senza presenze valgono 0, e 0 e' una misura:
    // il giocatore era nel panel e non ha segnato. E' la stessa lettura che
    // §A.3 fa di T1 con N = 0 («0 se `i` e' in popolazione di `s`»).
    //
    // «Gol fatti» = `Gf + Rf` dal 2026-08-24 (ratificato da Pico): i gol sono i
    // gol, e il modo in cui sono stati segnati non ne toglie nessuno. La
    // componente su azione non sparisce — resta leggibile separatamente in
    // `totals.Gf`, e l'aggregato di stagione la dichiara come campo a se'
    // (`golSuAzione` in `seasonAggregate.ts`).
    case "golLag1":
      return totals.Gf + totals.Rf;
    case "assistLag1":
      return totals.Ass;
    case "rigoristaHist":
      return rigoristaHistFlag(row, totals);
    case "cleanSheetRateLag1":
      return n > 0 ? totals.cleanSheets / n : NaN;
    case "golSubitiPerPresenzaLag1":
      return n > 0 ? totals.Gs / n : NaN;
    case "rigoriParatiPerPresenzaLag1":
      return n > 0 ? totals.Rp / n : NaN;
    // Le tre di sotto sono `history`: non hanno un valore «di stagione» e non
    // devono poter essere chieste come tale. Un ramo che restituisse un numero
    // qui sarebbe una feature diversa da quella dichiarata.
    case "volatilitaVotoLastObserved":
    case "stagioniOsservate":
    case "teamChangedFlag":
    case "etaSerieA":
      throw new GenFeatureCatalogError(`voteSeasonValue: '${id}' e' una feature di storia, non di stagione`);
  }
}

function formaUltime10(row: GenPanelRow, role: GenRole): number {
  const presences = row.matchdays.filter(isValidPresence);
  if (presences.length === 0) return NaN;
  const ordered = [...presences].sort((a, b) => a.matchday - b.matchday);
  const window = ordered.slice(Math.max(0, ordered.length - FORMA_WINDOW));
  let sum = 0;
  for (const md of window) sum += matchdayFantavoto(md, role, row.playerKey);
  return sum / window.length;
}

function rigoristaHistFlag(row: GenPanelRow, totals: MatchdayTotals): number {
  if (row.matchdays.length === 0 && row.seasonStats === undefined) return NaN;
  if (totals.Rf + totals.Rs >= RIGORISTA_HIST_MIN_EVENTS) return 1;
  const taken = readStatField(row.seasonStats, "penaltiesTaken");
  if (taken !== null && taken >= RIGORISTA_HIST_MIN_PENALTIES_TAKEN) return 1;
  return 0;
}

function seasonVolatility(row: GenPanelRow): number | null {
  const votes = row.matchdays.filter(isValidPresence).map((md) => md.votoBase as number);
  if (votes.length < MIN_PRESENCES_FOR_VOLATILITY) return null;
  return stdDev(votes);
}

function historyFeatureValue(
  definition: GenFeatureDefinition,
  history: readonly GenPanelRow[],
  targetSeason: GenSeason,
): number {
  switch (definition.voteFeature) {
    case "volatilitaVotoLastObserved":
      // Riuso diretto di `../seasonAggregate.ts`: e' gia' la funzione che
      // «prende l'ultima stagione con una dispersione osservata», e riscriverla
      // qui vorrebbe dire avere due definizioni della stessa parola.
      return lastObservedVolatilityOf(history);
    case "stagioniOsservate":
      return history.length;
    case "teamChangedFlag": {
      const last = history[history.length - 1];
      const previous = history[history.length - 2];
      if (last?.team === undefined || previous?.team === undefined) return NaN;
      return last.team === previous.team ? 0 : 1;
    }
    case "etaSerieA": {
      const debut = history[0];
      if (debut === undefined) return NaN;
      return seasonYear(targetSeason) - seasonYear(debut.season);
    }
    default:
      throw new GenFeatureCatalogError(
        `historyFeatureValue: '${definition.name}' non e' una feature di storia riconosciuta`,
      );
  }
}

function lastObservedVolatilityOf(history: readonly GenPanelRow[]): number {
  return lastObservedVolatility(history.map((row) => ({ volatilitaVoto: seasonVolatility(row) })));
}

/**
 * La Rolling3: media pesata recency delle ultime `window` stagioni OSSERVATE
 * con un valore finito.
 *
 * «Dove la storia esiste, mai riempita»: se nessuna delle stagioni osservate
 * porta un valore finito, il risultato e' `NaN`. Non si allarga la finestra
 * per trovare qualcosa, non si sostituisce una media di ruolo.
 */
function rollingMeanOfDefinition(
  definition: GenFeatureDefinition,
  history: readonly GenPanelRow[],
  role: GenRole,
  window: number,
  halfLife: number,
): number {
  const reference = history[history.length - 1];
  if (reference === undefined) return NaN;
  const referenceYear = seasonYear(reference.season);
  const observed: { season: GenSeason; value: number }[] = [];
  for (const row of history) {
    const value = seasonFeatureValue(definition, row, role);
    if (Number.isFinite(value)) observed.push({ season: row.season, value });
  }
  const used = observed.slice(Math.max(0, observed.length - window));
  if (used.length === 0) return NaN;
  let weightSum = 0;
  let weightedValue = 0;
  for (const entry of used) {
    const delta = referenceYear - seasonYear(entry.season);
    const weight = Number.isFinite(halfLife) ? Math.pow(0.5, delta / halfLife) : 1;
    weightSum += weight;
    weightedValue += weight * entry.value;
  }
  return weightSum > 0 ? weightedValue / weightSum : NaN;
}

// --- pooling FAM-2: interazioni di ruolo ------------------------------------

/** Le feature che entrano nelle interazioni ruolo×x del pooling FAM-2 (§D.2). */
export const ROLE_INTERACTION_FEATURES: readonly string[] = ["fantamediaLag1", "presenzeLag1", "titolaritaShare"];

/** I ruoli del pooled: D/C/A. Il portiere ha il suo ladder e non entra MAI (§D.2, §D.8). */
export const POOLED_ROLES: readonly GenRole[] = OUTFIELD;

/** Prefisso delle colonne one-hot di ruolo. */
export const ROLE_ONE_HOT_PREFIX = "ruolo";

/**
 * Aggiunge one-hot di ruolo e interazioni ruolo×{fantamedia, presenze,
 * titolarita'} alle righe del pooled (§D.2).
 *
 * Il termine d'interazione di un ruolo diverso da quello della riga vale 0 per
 * ALGEBRA dell'indicatore, non per imputazione — e per questo si scrive con un
 * ramo esplicito e non con una moltiplicazione: `0 × NaN` in IEEE-754 e' `NaN`,
 * e trasformerebbe ogni riga con una feature assente in una riga non scorabile
 * su tutte le colonne d'interazione.
 *
 * Una riga di portiere qui e' un errore fatale: §D.2 dice «il ruolo P non entra
 * mai nel pooled», e filtrarla in silenzio cambierebbe il denominatore della
 * coverage senza che nessuno lo veda.
 */
export function withRoleInteractions(
  rows: readonly GenFeatureRow[],
  bases: readonly string[] = ROLE_INTERACTION_FEATURES,
): readonly GenFeatureRow[] {
  // Le basi che il set attivo non possiede (S1 non ha `titolaritaShare`, che e'
  // una feature di statistiche) non producono colonna: una colonna d'interazione
  // su una base inesistente sarebbe `NaN` su OGNI riga e renderebbe l'intero
  // pooled non scorabile — un guasto di coverage travestito da modello inutile.
  const first = rows[0];
  const usable = first === undefined ? bases : bases.filter((base) => base in first.features);
  return rows.map((row) => {
    if (!POOLED_ROLES.includes(row.role)) {
      throw new GenFeatureCatalogError(
        `withRoleInteractions: riga di ruolo '${row.role}' nel pooled — §D.2 ammette solo D/C/A ` +
          "(il portiere ha il ladder di §D.8); il chiamante filtra, questa funzione non nasconde",
      );
    }
    const features: Record<string, number> = { ...row.features };
    for (const role of POOLED_ROLES) {
      const isRole = row.role === role ? 1 : 0;
      features[`${ROLE_ONE_HOT_PREFIX}${role}`] = isRole;
      for (const base of usable) {
        const value = row.features[base];
        features[`${ROLE_ONE_HOT_PREFIX}${role}_x_${base}`] = isRole === 0 ? 0 : value === undefined ? NaN : value;
      }
    }
    return { ...row, features };
  });
}

/** I nomi aggiunti da `withRoleInteractions`, nell'ordine in cui li aggiunge. */
export function roleInteractionNames(bases: readonly string[] = ROLE_INTERACTION_FEATURES): readonly string[] {
  const names: string[] = [];
  for (const role of POOLED_ROLES) {
    names.push(`${ROLE_ONE_HOT_PREFIX}${role}`);
    for (const base of bases) names.push(`${ROLE_ONE_HOT_PREFIX}${role}_x_${base}`);
  }
  return names;
}

// --- S3b: la stratificazione d'era ------------------------------------------

export interface GenEraPartition {
  /** Identificatore stabile dell'era: i campi Tier B disponibili, in ordine di catalogo. */
  readonly eraId: string;
  readonly tierBFields: readonly TierBField[];
  readonly rows: readonly GenFeatureRow[];
}

/**
 * La partizione per era di S3b: «due modelli per era, stessa famiglia,
 * coefficienti separati» (§D.3).
 *
 * Questo modulo NON fitta: espone la partizione, e il chiamante fitta un
 * modello per era. E' la stessa divisione del lavoro di tutto il resto — qui
 * si costruiscono i dati, di la' si sceglie fra candidati.
 */
export function partitionS3bByEra(
  rows: readonly GenFeatureRow[],
  boundaries: TierBEraBoundaries = TIER_B_FIRST_TARGET_SEASON,
): readonly GenEraPartition[] {
  const byEra = new Map<string, { fields: readonly TierBField[]; rows: GenFeatureRow[] }>();
  for (const row of rows) {
    const fields = availableTierBFields(row.targetSeason, boundaries);
    const eraId = fields.length === 0 ? "no_tier_b" : fields.join("+");
    const bucket = byEra.get(eraId);
    if (bucket === undefined) byEra.set(eraId, { fields, rows: [row] });
    else bucket.rows.push(row);
  }
  return [...byEra.entries()]
    .map(([eraId, bucket]) => ({ eraId, tierBFields: bucket.fields, rows: bucket.rows }))
    .sort((a, b) => a.tierBFields.length - b.tierBFields.length || (a.eraId < b.eraId ? -1 : 1));
}
