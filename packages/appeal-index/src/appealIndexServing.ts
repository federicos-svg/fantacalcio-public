// Serving-time appeal index — PURE, no I/O, no real data.
//
// Turns predictions already produced for the players of one listone into the
// terminal display object the Algorithm Factory deposits and the UI renders:
// the 0–100 index, the eight components, the quality label and the recipe
// version — every one of them carried by the data, never hardcoded downstream.
//
// It composes existing pieces and invents nothing:
// `composeAppealIndexComponents` builds the components,
// `normalizeComponentForDisplay` (Phase 5) turns a decimal component into its
// terminal 0–100 representation. In particular the index is NOT a blend of the
// eight components: `PHASE5_CONFIG.forbidden` lists
// `composite_score_across_components`, so the index IS the normalized
// `appetibilitaBase` and nothing else. The other seven travel beside it,
// separately normalized, never summed.
//
// Authority is unchanged by this file: `validated:false`, evidence cap
// `scouting`, all gates OFF. See docs/data/APPEAL_INDEX_SERVING_CONTRACT.md.

import { createHash } from "node:crypto";
import {
  composeAppealIndexComponents,
  type AppealIndexComponent,
  type AppealIndexComponents,
} from "./appealIndex.js";
import {
  COMPONENT_DISPOSITIONS,
  PHASE4_PROTOCOL,
  stableJson,
  type Phase4Verdict,
} from "./phase4Protocol.js";
import {
  PHASE5_CONFIG,
  PHASE5_PROTOCOL,
  evidenceTierFor,
  normalizeComponentForDisplay,
  type EvidenceTier,
} from "./phase5Protocol.js";
import type { FeatureVector, Role } from "./types.js";

export const APPEAL_INDEX_COMPONENT_NAMES = [
  "appetibilitaBase",
  "affidabilita",
  "rischio",
  "upside",
  "continuitaVoto",
  "bonusPotential",
  "modificatoreRelevance",
  "ruoloRarita",
] as const;

export type AppealIndexComponentName = (typeof APPEAL_INDEX_COMPONENT_NAMES)[number];

/** The single component the displayed index is the normalization of. */
export const APPEAL_INDEX_SCORE_COMPONENT: AppealIndexComponentName = "appetibilitaBase";

/**
 * The two components backed by a fitted Phase 4 target rather than by a
 * transparent historical heuristic. Their disposition is the caller's Phase 4
 * verdict for the role; the other six keep the disposition the protocol
 * preregisters for them.
 */
const MODEL_BACKED_COMPONENTS: readonly AppealIndexComponentName[] = ["appetibilitaBase", "affidabilita"];

/**
 * Identity of the composition recipe, frozen as a whole.
 *
 * `formulaFreezeDate` is the operational rule agreed for the 2026/27 auction:
 * the formula may change up to and including that date, and from then on only
 * the data moves. A change to any field here (or to the component formulas it
 * points at) must bump `recipeVersion` — `appealIndexRecipeHash()` is pinned by
 * a regression test precisely so a silent formula edit fails the suite.
 */
export const APPEAL_INDEX_RECIPE = {
  // 1.1.0: the composition formula is unchanged, but the recipe points at
  // VAL-PROTOCOL-A-PHASE4@2.1.0, under which role P can carry a real verdict
  // instead of always being withheld. A consumer must be able to tell the two
  // apart from the payload alone, so the version moves with the reference.
  //
  // 1.2.0: same reasoning, same unchanged formula. The reference is now
  // @2.2.0, whose pooled vector carries `age_at_season_start` — the verdicts
  // this recipe composes come from a differently-specified model, so a
  // consumer must be able to tell a 1.1.0 payload from a 1.2.0 one without
  // reading the package behind it.
  recipeVersion: "APPEAL-INDEX-RECIPE@1.2.0",
  formulaFreezeDate: "2026-08-30",
  phase4Protocol: PHASE4_PROTOCOL,
  phase5Protocol: PHASE5_PROTOCOL,
  scoreComponent: APPEAL_INDEX_SCORE_COMPONENT,
  components: APPEAL_INDEX_COMPONENT_NAMES,
  normalization: PHASE5_CONFIG.method,
  cohort: "serving_role_cohort",
  evidenceCap: "scouting",
  validated: false,
  compositeScore: false,
} as const;

export function appealIndexRecipeHash(): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(APPEAL_INDEX_RECIPE)).digest("hex")}`;
}

/**
 * Human-readable quality label per evidence tier — the "etichetta di qualità
 * portata dal dato". It is produced here, next to the number it qualifies, so
 * no renderer downstream can show the number while inventing (or dropping) the
 * caveat that belongs to it.
 */
export const APPEAL_INDEX_QUALITY_LABELS = {
  scouting_backed: "sperimentale — evidenza scouting, non validato",
  heuristic_only: "euristico — non validato",
  not_available: "non disponibile — nessun verdetto di modello",
} as const satisfies Record<EvidenceTier, string>;

export interface AppealIndexServedComponent {
  readonly value: number | null;
  readonly scale0to100: number | null;
  readonly disposition: Phase4Verdict;
  readonly evidenceTier: EvidenceTier;
  readonly availability: AppealIndexComponent["availability"];
  readonly method: string;
  readonly validated: false;
}

export interface ServedAppealIndex {
  /** Echoed back untouched so the caller can join without re-deriving identity. */
  readonly key: string;
  readonly role: Role;
  /** Full precision on purpose — Phase 5 rounds at the render boundary only. */
  readonly score0to100: number | null;
  readonly disposition: Phase4Verdict;
  readonly evidenceTier: EvidenceTier;
  readonly quality: string;
  readonly recipeVersion: string;
  readonly components: Readonly<Record<AppealIndexComponentName, AppealIndexServedComponent>>;
}

export interface AppealIndexServingPlayer {
  readonly key: string;
  readonly role: Role;
  readonly features: FeatureVector;
  readonly predictedFantamediaNext: number;
  readonly predictedPresenzeNext: number;
  /**
   * The Phase 4 verdict of the role whose fitted models produced the two
   * predictions above. Supplied by the caller and never inferred here: this
   * package must not decide what evidence backs a number it did not select.
   */
  readonly modelDisposition: Phase4Verdict;
}

function componentDisposition(name: AppealIndexComponentName, modelDisposition: Phase4Verdict): Phase4Verdict {
  return MODEL_BACKED_COMPONENTS.includes(name)
    ? modelDisposition
    : COMPONENT_DISPOSITIONS[name].defaultVerdict;
}

/**
 * The withheld result: a player the Factory could not predict at all (no
 * feature-base match, ambiguous identity, no fitted model for the role, …).
 *
 * It is a first-class output rather than an omission so the honest `n/d`
 * reaches the screen through the same field as every other verdict, carrying
 * the same recipe version. No number, no midpoint, no default.
 */
export function withheldAppealIndex(key: string, role: Role): ServedAppealIndex {
  const disposition: Phase4Verdict = "NO_VERDICT";
  const evidenceTier = evidenceTierFor(disposition);
  const empty: AppealIndexServedComponent = {
    value: null,
    scale0to100: null,
    disposition,
    evidenceTier,
    availability: "missing_input",
    method: "nessuna predizione disponibile per questo giocatore",
    validated: false,
  };
  return {
    key,
    role,
    score0to100: null,
    disposition,
    evidenceTier,
    quality: APPEAL_INDEX_QUALITY_LABELS[evidenceTier],
    recipeVersion: APPEAL_INDEX_RECIPE.recipeVersion,
    components: Object.fromEntries(
      APPEAL_INDEX_COMPONENT_NAMES.map((name) => [name, empty]),
    ) as Record<AppealIndexComponentName, AppealIndexServedComponent>,
  };
}

/**
 * Builds the served index for every predictable player of one listone.
 *
 * Two passes are structural, not an optimization: a percentile has no meaning
 * before the cohort it is measured against exists. Pass 1 composes the raw
 * components for everybody; pass 2 normalizes each component against the
 * same-role values of that same component.
 *
 * The cohort is the serving population itself — the players of this listone,
 * by role — and it is built from PREDICTIONS only. No observed target of any
 * season enters it, so the anti-leakage discipline of the training path is not
 * weakened: this is a post-hoc ranking of model outputs, not a fit. The
 * `cohort` field of `APPEAL_INDEX_RECIPE` records exactly that.
 */
export function buildServedAppealIndex(
  players: readonly AppealIndexServingPlayer[],
): ServedAppealIndex[] {
  const composed = players.map((player) => ({
    player,
    components: composeAppealIndexComponents({
      features: player.features,
      predictedFantamediaNext: player.predictedFantamediaNext,
      predictedPresenzeNext: player.predictedPresenzeNext,
      roleCohortFantamediaNext: players
        .filter((other) => other.role === player.role)
        .map((other) => other.predictedFantamediaNext),
    }),
  }));

  const cohortKey = (role: Role, name: AppealIndexComponentName): string => `${role}|${name}`;
  const cohorts = new Map<string, number[]>();
  for (const { player, components } of composed) {
    for (const name of APPEAL_INDEX_COMPONENT_NAMES) {
      const value = components[name].value;
      if (value === null || !Number.isFinite(value)) continue;
      const key = cohortKey(player.role, name);
      cohorts.set(key, [...(cohorts.get(key) ?? []), value]);
    }
  }

  return composed.map(({ player, components }) => {
    const served = Object.fromEntries(
      APPEAL_INDEX_COMPONENT_NAMES.map((name) => {
        const component: AppealIndexComponent = components[name as keyof AppealIndexComponents];
        const disposition = componentDisposition(name, player.modelDisposition);
        const normalized = normalizeComponentForDisplay({
          component,
          disposition,
          role: player.role,
          cohort: cohorts.get(cohortKey(player.role, name)) ?? [],
        });
        const entry: AppealIndexServedComponent = {
          value: component.value,
          scale0to100: normalized.scale0to100,
          disposition,
          evidenceTier: normalized.evidenceTier,
          availability: component.availability,
          method: component.method,
          validated: false,
        };
        return [name, entry];
      }),
    ) as Record<AppealIndexComponentName, AppealIndexServedComponent>;

    const score = served[APPEAL_INDEX_SCORE_COMPONENT];
    return {
      key: player.key,
      role: player.role,
      score0to100: score.scale0to100,
      disposition: score.disposition,
      evidenceTier: score.evidenceTier,
      quality: APPEAL_INDEX_QUALITY_LABELS[score.evidenceTier],
      recipeVersion: APPEAL_INDEX_RECIPE.recipeVersion,
      components: served,
    };
  });
}
