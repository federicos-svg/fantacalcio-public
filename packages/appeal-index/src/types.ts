// Shared types for the offline appeal-index ML pipeline — PURE, no I/O.
//
// This package is deliberately separate from packages/engine: it is offline
// ML R&D toward the future Batch 4 "Value + Modifier Model" (docs/ROADMAP.md),
// not the live auction engine. It sets no gate (`data_promoted`,
// `canonical_player_id`, `decision_promoted`, `fair_to_me_promoted` are never
// touched) and is never imported by src/ (the live app). See
// docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md for the full contract.

import type { Role } from "../../engine/src/types.js";
import type { VoteRecordCandidate } from "../../engine/src/parser.js";
import type { GoalkeeperFeatureVector } from "./goalkeeperFeatures.js";

export type { Role, VoteRecordCandidate };

/**
 * One player's aggregated performance for a single season, derived from
 * matchday-level VoteRecordCandidate[] (already parsed by the existing
 * engine parser / xlsx-adapter pipeline — this package never reads XLSX).
 * Keyed by `externalId` ("Cod.") which is safe WITHIN one season/file per
 * the closed FANTACALCIO_XLSX_CONTRACT.md contract, but NOT assumed stable
 * ACROSS seasons — see identityStability.ts.
 */
export interface PlayerSeasonAggregate {
  readonly season: string; // "YYYY_YY"
  readonly externalId: number; // per-file "Cod."
  readonly name: string;
  readonly role: Role;
  readonly team: string;
  readonly matchdaysObserved: number; // rows seen for this player in this season
  readonly presenze: number; // rows with a real vote (voto_base != null)
  readonly mediaVoto: number | null; // mean voto_base over presenze rows
  readonly fantamedia: number | null; // mean per-presence fantavoto (fantavoto.ts)
  readonly volatilitaVoto: number | null; // stdDev of voto_base over presenze rows (null if presenze < 2)
  readonly golFatti: number;
  readonly assist: number;
  readonly ammonizioni: number;
  readonly espulsioni: number;
  /**
   * Goalkeeper-relevant season totals. They are summed for every role because
   * they are plain sums of already-parsed `Gs`/`Rp` columns, but only the
   * goalkeeper feature vector (goalkeeperFeatures.ts) ever reads them: for an
   * outfield player `golSubiti` is the goals his team conceded while he was on
   * the sheet, which is not a player-level quantity.
   */
  readonly golSubiti: number;
  /** Presences (same rows `presenze` counts) closed with `Gs` at zero. */
  readonly porteInviolate: number;
  readonly rigoriParati: number;
}

/**
 * A PlayerSeasonAggregate joined into the cross-season panel via the
 * resolved (non-canonical) `playerKey` — see playerKey.ts. NOT
 * `canonical_player_id`: this key is local to this package, unpromoted,
 * and never feeds `data_promoted`/`canonical_promoted`.
 */
export interface PlayerSeasonPanelRow extends PlayerSeasonAggregate {
  readonly playerKey: string;
}

/** Ordered, fixed feature vector name list — the single source of truth for
 *  feature order used by every model (ridge/tree/kNN) and by matrix helpers.
 *
 *  `ageAtSeasonStart` joined the vector in `VAL-PROTOCOL-A-PHASE4@2.2.0` (T4).
 *  Every other entry is derived from vote records this repository already
 *  parses; that one is the first feature sourced from outside them, so it is
 *  the only one that can be legitimately absent for a player whose anagrafica
 *  was never resolved. It is then `NaN` and listed in `missingFeatures`,
 *  exactly like an unobservable fantamedia — never zero, and never an age
 *  guessed from the current date. */
export const FEATURE_NAMES = [
  "fantamediaLag1",
  "fantamediaRollingMean3",
  "presenzeLag1",
  "presenzeRollingMean3",
  "volatilitaVotoLag1",
  "nSeasonsObserved",
  "golFattiRollingMean3",
  "assistRollingMean3",
  "roleP",
  "roleD",
  "roleC",
  "roleA",
  "teamChangedFlag",
  "ageAtSeasonStart",
] as const;

/**
 * Ages already resolved by the governed Wikidata pipeline
 * (`packages/wikidata-identity-contract`), keyed season -> playerKey -> age at
 * THAT season's start.
 *
 * This package never computes an age and never touches a date: it consumes a
 * number a caller derived with `calculateAgeAt(dateOfBirth, referenceDate)`
 * against an explicit historical reference date. Keeping the derivation
 * outside is what makes the contract's temporal rule enforceable in one place
 * instead of two — and it keeps `appeal-index` dependency-free.
 *
 * A season with no map, or a player with no entry, is a genuine absence: the
 * feature becomes `NaN`. There is no default and no fallback season.
 */
export type AnagraficaAgeIndex = ReadonlyMap<string, ReadonlyMap<string, number>>;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Readonly<Record<FeatureName, number>>;

export const TARGET_NAMES = ["fantamediaNext", "presenzeNext"] as const;
export type TargetName = (typeof TARGET_NAMES)[number];
export type TargetVector = Readonly<Record<TargetName, number>>;

/**
 * One supervised-learning row: features built ONLY from seasons <=
 * `featureSeason`, target(s) taken from `targetSeason` (the season
 * immediately following `featureSeason` in the global season sequence).
 * `featureSeason` is always strictly earlier than `targetSeason` by
 * construction (dataset.ts asserts this at build time — see
 * assertNoLeakage()).
 */
export interface FeatureRow {
  readonly playerKey: string;
  readonly name: string; // kept ONLY for synthetic-fixture debugging; never real data outside this repo's tests
  readonly role: Role;
  readonly featureSeason: string;
  readonly targetSeason: string;
  readonly features: FeatureVector;
  /**
   * The goalkeeper-specific vector (goalkeeperFeatures.ts), present ONLY on
   * `role === "P"` rows. It is built from the same history slice as `features`,
   * so it inherits that row's proven anti-leakage guarantee. Absent for every
   * other role, which is what makes a goalkeeper family structurally unable to
   * be fitted on outfield rows.
   */
  readonly goalkeeperFeatures?: GoalkeeperFeatureVector;
  readonly targets: TargetVector;
  /** Semantic missingness audit. Missing numeric values use NaN in this
   * legacy vector for compatibility, never zero. Passive code must
   * preprocess them according to an explicit pipeline. */
  readonly missingFeatures?: readonly FeatureName[];
  readonly targetAvailability?: Readonly<Record<TargetName, "observed" | "not_observable">>;
  /** Every season whose PlayerSeasonAggregate contributed to `features` —
   *  audit trail only (never fed to a model), consumed by
   *  dataset.ts's `assertNoLeakage()` to prove, not just assert, that no
   *  season >= targetSeason contributed to the feature vector. */
  readonly sourceSeasons: readonly string[];
}

/** A fitted or non-parametric predictor over the fixed FEATURE_NAMES vector. */
export interface Predictor {
  readonly name: string;
  predict(features: FeatureVector): number;
}

/** Something that can fit a Predictor from labeled training rows for one target. */
export interface Trainer {
  readonly name: string;
  fit(trainRows: readonly FeatureRow[], target: TargetName): Predictor;
}
