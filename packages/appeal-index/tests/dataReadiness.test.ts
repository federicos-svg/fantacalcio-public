import { describe, expect, it } from "vitest";
import {
  BURNED_HOLDOUT,
  EXPECTED_SEASONS,
  validateAndBuildDataReadiness,
  type DataReadinessInput,
  type ReadinessFile,
} from "../src/dataReadiness.js";

const files = (): ReadinessFile[] => EXPECTED_SEASONS.flatMap((season) =>
  Array.from({ length: 38 }, (_, i) => ({
    season, matchday: i + 1, kind: "xlsx" as const, size: 100,
    sha256: "a".repeat(64), manifestHashState: "match" as const,
    pipelineStatus: "valid" as const, issueCodes: [],
  })));

const base = (): DataReadinessInput => ({
  accessAvailable: true,
  files: files(),
  unexpectedFiles: [],
  sourceRule: EXPECTED_SEASONS.map((season) => ({
    season, sourceId: null, sheetsPresent: ["Italia"], editorialSheet: "Italia",
    voteSource: "fantacalcio", leagueVoteSource: null, sourceAlignment: "unverified" as const,
    transformVersion: "xlsx-adapter-v1", evidence: "observed" as const, confidence: "low" as const,
    leagueRuleVersion: null, bonusMalusTariff: null, gsSemantics: null, rfSemantics: null,
    defenseModifier: null, midfieldModifier: null, attackModifier: null,
  })),
  identity: {
    stableMatchRate: .9988, driftRate: 0, collisionRate: .00112,
    acceptedResearchJoins: 3500, excludedAmbiguous: 4, excludedExternalIdReuse: 1,
    canonicalIdsAssigned: 0, reuseCanMisjoin: false, reasonCodes: ["external_id_reuse"],
  },
  cohort: {
    playerSeasons: 6299, transitions: 3573, possibleTemporalFolds: 7,
    coldStarts: null, zeroAppearances: 0, exits: null, unobservableTargets: 0,
    historicalListsAvailable: false, currentListAvailable: true, currentListUsedAsHistorical: false,
    excludedByReason: { identity_ambiguous: 5 },
  },
  burnedHoldoutAccesses: [{
    purpose: "validation", usedForTrain: false, usedForTuning: false, usedForSelection: false,
    usedForFold: false, usedForOof: false,
  }],
});

describe("VAL data readiness", () => {
  it("accepts the exact eleven-season/418-file inventory with limits", () => {
    const r = validateAndBuildDataReadiness(base());
    expect(r.corpusIntegrity.exact).toBe(true);
    expect(r.provenance).toEqual({ observed: 418, inferred: 0, missing: 0 });
    expect(r.rd_readiness).toBe("R&D_READY_WITH_LIMITS");
    expect(r.promotional_readiness).toBe("PROMOTIONAL_NOT_READY");
  });
  it("distinguishes missing season", () => {
    const x = base(); const r = validateAndBuildDataReadiness({ ...x, files: x.files.filter((f) => f.season !== "2015_16") });
    expect(r.blockers).toContain("MISSING_SEASON"); expect(r.rd_readiness).toBe("NOT_READY");
  });
  it("distinguishes duplicated season metadata", () => {
    const x = base(); const r = validateAndBuildDataReadiness({ ...x, sourceRule: [...x.sourceRule, x.sourceRule[0]!] });
    expect(r.blockers).toContain("DUPLICATE_SOURCE_RULE_SEASON");
  });
  it("rejects a missing matchday", () => {
    const x = base(); const r = validateAndBuildDataReadiness({ ...x, files: x.files.filter((f) => !(f.season === "2015_16" && f.matchday === 38)) });
    expect(r.blockers).toContain("INCOMPLETE_SEASON");
  });
  it("rejects a duplicate matchday", () => {
    const x = base(); const r = validateAndBuildDataReadiness({ ...x, files: [...x.files, x.files[0]!] });
    expect(r.blockers).toContain("DUPLICATE_MATCHDAY");
  });
  it("rejects unexpected files", () => {
    const x = base(); expect(validateAndBuildDataReadiness({ ...x, unexpectedFiles: ["unexpected.bin"] }).blockers).toContain("UNEXPECTED_FILE");
  });
  it("distinguishes hash mismatch", () => {
    const x = base(); const changed = { ...x.files[0]!, manifestHashState: "mismatch" as const };
    expect(validateAndBuildDataReadiness({ ...x, files: [changed, ...x.files.slice(1)] }).blockers).toContain("HASH_MISMATCH");
  });
  it("distinguishes a missing manifest hash from mismatch", () => {
    const x = base(); const changed = { ...x.files[0]!, manifestHashState: "missing" as const };
    const r = validateAndBuildDataReadiness({ ...x, files: [changed, ...x.files.slice(1)] });
    expect(r.blockers).toContain("MANIFEST_HASH_MISSING"); expect(r.blockers).not.toContain("HASH_MISMATCH");
  });
  it("does not alias source names into verified alignment", () => {
    const r = validateAndBuildDataReadiness(base());
    expect(r.sourceAlignment).toBe("limited");
  });
  it("unverified source/rules prevent promotional readiness", () => expect(validateAndBuildDataReadiness(base()).promotional_readiness).toBe("PROMOTIONAL_NOT_READY"));
  it("missing historical lists creates reconstructed_votes_only", () => expect(validateAndBuildDataReadiness(base()).cohortReadiness.cohortType).toBe("reconstructed_votes_only"));
  it("never treats the current list as historical", () => expect(validateAndBuildDataReadiness(base()).cohortReadiness.currentListUsedAsHistorical).toBe(false));
  it("external id reuse remains excluded", () => expect(validateAndBuildDataReadiness(base()).identityReadiness.excludedExternalIdReuse).toBe(1));
  it("accounts for identity ambiguity", () => expect(validateAndBuildDataReadiness(base()).identityReadiness.excludedAmbiguous).toBe(4));
  it("assigns no canonical id", () => expect(validateAndBuildDataReadiness(base()).identityReadiness.canonicalIdsAssigned).toBe(0));
  it("keeps cold start and exits explicitly unobservable", () => {
    const c = validateAndBuildDataReadiness(base()).cohortReadiness; expect(c.coldStarts).toBeNull(); expect(c.exits).toBeNull();
  });
  it("inventories the burned holdout without eligibility", () => {
    expect(BURNED_HOLDOUT).toBe("2025_26");
    const a = validateAndBuildDataReadiness(base()).burnedHoldoutAccess[0]!;
    expect(a.usedForTrain || a.usedForTuning || a.usedForSelection || a.usedForFold || a.usedForOof).toBe(false);
  });
  it("fails closed if reuse could misjoin", () => {
    const x = base(); const r = validateAndBuildDataReadiness({ ...x, identity: { ...x.identity, reuseCanMisjoin: true } });
    expect(r.rd_readiness).toBe("NOT_READY");
  });
  it("fails closed when access is unavailable", () => {
    const x = base(); expect(validateAndBuildDataReadiness({ ...x, accessAvailable: false }).rd_readiness).toBe("BLOCKED_ACCESS");
  });
  it("is deterministic", () => expect(validateAndBuildDataReadiness(base())).toEqual(validateAndBuildDataReadiness(base())));
  it("contains no player-level identity fields", () => {
    const s = JSON.stringify(validateAndBuildDataReadiness(base()));
    expect(s).not.toMatch(/canonical_player_id|playerName|externalId/);
  });
});
