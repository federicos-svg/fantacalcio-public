/**
 * Source-level guards on the ~30 lines of glue in `run-phase4-backtest.ts` that
 * cannot be executed from a test: the runner refuses a dirty worktree and
 * writes only outside the repository, both by design.
 *
 * Everything the glue calls is unit-tested elsewhere (goalkeeperLadder,
 * goalkeeperRidge, phase4RoleVerdicts). What is asserted here is that the glue
 * keeps calling those and does not grow a second, divergent implementation.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE4_ARTIFACT_NAMES } from "../src/phase4Protocol.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const runner = readFileSync(join(ROOT, "scripts", "run-phase4-backtest.ts"), "utf8");

describe("Phase 4 backtest runner — goalkeeper wiring", () => {
  it("delegates the ladder, the fit and the selection rule instead of reimplementing them", () => {
    expect(runner).toContain("evaluateGoalkeeperLadder(folds, target)");
    expect(runner).toContain("fitGoalkeeperRidge(train, family, evaluation.target, lambda)");
    expect(runner).toContain("selectPhase4RoleVerdicts({");
    // No second sample-guard threshold and no second selection rule may appear
    // in the runner: both live in the protocol and the shared modules.
    expect(runner).not.toMatch(/10\s*\*\s*pFamily/);
    expect(runner).not.toMatch(/SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED/);
  });

  it("supplies the gating family per target and role, so P is never gated by the pooled one", () => {
    expect(runner).toContain("gatingFamilyByRole");
    expect(runner).toContain('ladder ? ladder.selectedFamily ?? leanestGoalkeeperFamily : "pooled_regularized_role"');
    // Eligibility is keyed per target too: the ladder's support is the
    // complete-case subset for that target, and the two targets differ.
    expect(runner).toContain("eligible.add(`${target}|${role}`)");
  });

  it("fits the goalkeeper family only on rows that family can be fitted on", () => {
    expect(runner).toContain("goalkeeperCompleteCaseRows(fold.trainRows, family, evaluation.target)");
    expect(runner).toContain("goalkeeperCompleteCaseRows(fold.testRows, family, evaluation.target)");
    // A null selection means no family cleared its guard — nothing may be fitted.
    expect(runner).toContain("if (family === null) return []");
  });

  it("reuses the frozen lambda grid rather than a goalkeeper-specific one", () => {
    const goalkeeperBlock = runner.slice(runner.indexOf("const goalkeeperOof"), runner.indexOf("const totalOof"));
    expect(goalkeeperBlock).toContain("PHASE4_CONFIG.hyperparameters.ridgeLambda");
    expect(goalkeeperBlock).not.toMatch(/lambda\s*=\s*[0-9]/);
  });

  it("writes the goalkeeper analysis as a mandatory artifact, in both branches", () => {
    expect(PHASE4_ARTIFACT_NAMES).toContain("goalkeeper_family_report.json");
    expect(runner).toContain('"goalkeeper_family_report.json": pretty({');
    // The per-family detail is emitted unconditionally, so a failed ladder
    // still ships the numbers instead of a silent gap.
    expect(runner).toContain("families: evaluation.families");
    expect(runner).toContain("pooledFamilyThresholdForP");
  });

  it("records, per verdict, which family gated it", () => {
    expect(runner).toContain("gating family ${item.gatingFamily}");
  });

  it("keeps the goalkeeper families out of the outfield eligibility rows", () => {
    expect(runner).toContain(".filter((family) => !isGoalkeeperFamily(family))");
  });
});
