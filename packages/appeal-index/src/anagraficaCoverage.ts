/**
 * Anagrafica coverage over an already-built feature set — PURE, no I/O.
 *
 * `age_at_season_start` entered the pooled vector in
 * `VAL-PROTOCOL-A-PHASE4@2.2.0`, and it is the only pooled feature that can be
 * legitimately absent for a player: every other one is derived from vote
 * records this repository already parses, while this one depends on an
 * identity join against an external source that is fail-closed by design
 * (`packages/wikidata-identity-contract`).
 *
 * That makes coverage a first-class run precondition rather than a diagnostic.
 * The pooled families are fitted on the complete-case subset, so an unresolved
 * age does not weaken a row, it removes it. At low coverage a Phase 4 run
 * would therefore emit NO_VERDICT for D/C/A while looking, from the outside,
 * exactly like a methodological finding about the models. This module produces
 * the numbers that tell those two apart, and the runner refuses to start when
 * the preregistered floor is not met.
 *
 * Role P is measured but excluded from the floor: it is gated by the
 * goalkeeper ladder, whose vector @2.2.0 deliberately left untouched, so its
 * verdicts do not depend on anagrafica coverage at all.
 */
import { PHASE4_CONFIG, PHASE4_ROLES, type Phase4Role } from "./phase4Protocol.js";
import type { FeatureRow } from "./types.js";

export const ANAGRAFICA_FEATURE: "ageAtSeasonStart" = "ageAtSeasonStart";

export interface AnagraficaRoleCoverage {
  readonly role: Phase4Role;
  readonly rows: number;
  readonly withAge: number;
  /** `withAge / rows`, or 0 when the role has no rows at all. */
  readonly coverage: number;
  /** Whether this role's verdict is gated by a pooled family, i.e. whether the floor applies to it. */
  readonly pooledGated: boolean;
}

export type AnagraficaCoverageReasonCode =
  | "ANAGRAFICA_COVERAGE_OK"
  | "ANAGRAFICA_COVERAGE_BELOW_FLOOR"
  | "ANAGRAFICA_ABSENT"
  | "NO_ROWS";

export interface AnagraficaCoverageReport {
  readonly featureName: string;
  readonly protocolFeatureName: string;
  readonly minimumResolvedCoverage: number;
  readonly rows: number;
  readonly withAge: number;
  readonly coverage: number;
  readonly byRole: readonly AnagraficaRoleCoverage[];
  /** The roles the floor is actually evaluated on — every role gated by a pooled family. */
  readonly pooledGatedRoles: readonly Phase4Role[];
  readonly pooledGatedRows: number;
  readonly pooledGatedWithAge: number;
  readonly pooledGatedCoverage: number;
  readonly meetsFloor: boolean;
  readonly reasonCode: AnagraficaCoverageReasonCode;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Whether this role's verdict is decided by a pooled family — i.e. whether the
 * anagrafica floor is evaluated on it at all.
 *
 * Exported because the governed pilot orders its subjects by the same
 * criterion: the roles the floor is measured on are the roles a slice of the
 * call budget should reach first. Two independent copies of "which roles are
 * pooled" is exactly how the acquisition order and the gate drift apart.
 */
export function isPooledGatedRole(role: Phase4Role): boolean {
  return PHASE4_CONFIG.gatingFamilyByRole[role] !== "goalkeeper_ladder";
}

/**
 * Counts rows carrying a finite `ageAtSeasonStart` — the same finiteness test
 * `validation.ts` and `phase4SampleGuardAudit.ts` apply to build the
 * complete-case subset, so this report measures exactly the rows the trainers
 * would keep, not an adjacent definition of "has anagrafica".
 */
export function evaluateAnagraficaCoverage(rows: readonly FeatureRow[]): AnagraficaCoverageReport {
  const byRole = PHASE4_ROLES.map((role): AnagraficaRoleCoverage => {
    const roleRows = rows.filter((row) => row.role === role);
    const withAge = roleRows.filter((row) => Number.isFinite(row.features[ANAGRAFICA_FEATURE])).length;
    return {
      role,
      rows: roleRows.length,
      withAge,
      coverage: ratio(withAge, roleRows.length),
      pooledGated: isPooledGatedRole(role),
    };
  });

  const withAge = rows.filter((row) => Number.isFinite(row.features[ANAGRAFICA_FEATURE])).length;
  const pooled = byRole.filter((entry) => entry.pooledGated);
  const pooledRows = pooled.reduce((sum, entry) => sum + entry.rows, 0);
  const pooledWithAge = pooled.reduce((sum, entry) => sum + entry.withAge, 0);
  const pooledCoverage = ratio(pooledWithAge, pooledRows);
  const floor = PHASE4_CONFIG.anagrafica.minimumResolvedCoverage;

  // An empty input is a caller/dataset problem, never a satisfied floor: a
  // vacuous 0-of-0 must not be allowed to read as "coverage fine".
  const meetsFloor = pooledRows > 0 && pooledCoverage >= floor;
  const reasonCode: AnagraficaCoverageReasonCode =
    rows.length === 0 || pooledRows === 0
      ? "NO_ROWS"
      : withAge === 0
        ? "ANAGRAFICA_ABSENT"
        : meetsFloor
          ? "ANAGRAFICA_COVERAGE_OK"
          : "ANAGRAFICA_COVERAGE_BELOW_FLOOR";

  return {
    featureName: ANAGRAFICA_FEATURE,
    protocolFeatureName: PHASE4_CONFIG.anagrafica.featureName,
    minimumResolvedCoverage: floor,
    rows: rows.length,
    withAge,
    coverage: ratio(withAge, rows.length),
    byRole,
    pooledGatedRoles: pooled.map((entry) => entry.role),
    pooledGatedRows: pooledRows,
    pooledGatedWithAge: pooledWithAge,
    pooledGatedCoverage: pooledCoverage,
    meetsFloor,
    reasonCode,
  };
}

/**
 * The roles this report actually refuses to let run — never more than the
 * pooled-gated ones, and empty when the floor is met.
 *
 * The floor is a statement about the pooled vector: below it the pooled
 * families are fitted on almost nothing. Role P is gated by the goalkeeper
 * ladder, whose vector @2.2.0 deliberately left untouched, so no value of this
 * coverage can make a goalkeeper verdict less supported than it already was.
 * Naming the blocked set here, once, is what keeps "which roles the floor
 * governs" from being re-derived — differently — at each call site.
 */
export function anagraficaBlockedRoles(report: AnagraficaCoverageReport): readonly Phase4Role[] {
  return report.meetsFloor ? [] : PHASE4_ROLES.filter(isPooledGatedRole);
}

/**
 * Fail-closed precondition for a Phase 4 run, evaluated before any fold is
 * built. Throws the reason code rather than letting the run spend an hour
 * producing a package whose every pooled verdict is NO_VERDICT for a data
 * reason the package itself cannot state.
 *
 * `roles` is the set of roles the caller is about to gate. The refusal is
 * raised only when that set actually contains a role the floor governs: a
 * caller running the goalkeeper ladder alone must not be stopped by a floor
 * that, by construction, says nothing about it. The floor value, the pooled
 * denominator and the message are unchanged — only the question "does this
 * refusal apply to what I am about to run" now has an answer other than
 * "always yes".
 *
 * The default is every role, so an existing caller keeps exactly the behaviour
 * it had: a full run still refuses below the floor.
 */
export function assertAnagraficaCoverage(
  report: AnagraficaCoverageReport,
  roles: readonly Phase4Role[] = PHASE4_ROLES,
): void {
  const blocked = anagraficaBlockedRoles(report);
  if (!roles.some((role) => blocked.includes(role))) return;
  throw new Error(
    `PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR:${report.reasonCode} ` +
      `pooled_gated_rows=${report.pooledGatedRows} pooled_gated_with_age=${report.pooledGatedWithAge} ` +
      `coverage=${report.pooledGatedCoverage.toFixed(4)} floor=${report.minimumResolvedCoverage}`,
  );
}

/** Aggregate, player-free lines safe to print in a job log. */
export function formatAnagraficaCoverage(report: AnagraficaCoverageReport): readonly string[] {
  return [
    `anagrafica_feature=${report.featureName} floor=${report.minimumResolvedCoverage} ` +
      `reason=${report.reasonCode} meets_floor=${report.meetsFloor}`,
    `anagrafica_rows=${report.rows} with_age=${report.withAge} coverage=${report.coverage.toFixed(4)}`,
    `anagrafica_pooled_gated_rows=${report.pooledGatedRows} with_age=${report.pooledGatedWithAge} ` +
      `coverage=${report.pooledGatedCoverage.toFixed(4)}`,
    ...report.byRole.map(
      (entry) =>
        `anagrafica_role=${entry.role} rows=${entry.rows} with_age=${entry.withAge} ` +
        `coverage=${entry.coverage.toFixed(4)} pooled_gated=${entry.pooledGated}`,
    ),
  ];
}
