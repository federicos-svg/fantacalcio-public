// Integration test for the real cross-process determinism mechanism (see
// Finding 2 in docs/data/LISTONE_XLSX_PARSER_CONTRACT.md "Determinism —
// in-process vs cross-process"): actually spawns `listone-candidate-worker.ts`
// as a separate OS process (twice), the same mechanism
// scripts/build-listone-candidate.ts uses, over a synthetic (non-real) XLSX
// file written to a private out-of-repo temp directory. Proves the worker
// genuinely works end to end, not just that its source parses.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildXlsxBytes } from "../../packages/xlsx-adapter/fixtures/testWorkbookBuilder.js";
import {
  buildValidListoneWorkbookSheets,
  MINIMAL_VALID_ROLE_ROWS,
} from "../../packages/xlsx-adapter/fixtures/listoneTestWorkbookBuilder.js";
import { parseListoneXlsxBytes } from "../../packages/xlsx-adapter/src/parseListoneXlsx.js";
import { serializeListoneCandidate } from "../../packages/xlsx-adapter/src/listoneCandidate.js";
import { repoRootFromScriptUrl } from "./repoPaths.js";
// Same launcher scripts/build-listone-candidate.ts uses (Finding 8) — never
// node_modules/.bin/tsx, built in exactly one place.
import { buildTsxSubprocessCommand } from "./tsxSubprocess.js";

const REPO_ROOT = repoRootFromScriptUrl(import.meta.url, 2); // scripts/lib/ -> repo root
const WORKER_SCRIPT = join(REPO_ROOT, "scripts", "lib", "listone-candidate-worker.ts");

describe("listone-candidate-worker (real subprocess, synthetic fixture only)", () => {
  it("two separate OS-process invocations produce byte-identical output, matching the in-process result", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const bytes = await buildXlsxBytes(sheets);

    const tmpDir = mkdtempSync(join(tmpdir(), "listone-candidate-worker-test-"));
    try {
      const rawPath = join(tmpDir, "synthetic.xlsx");
      const outA = join(tmpDir, "a.json");
      const outB = join(tmpDir, "b.json");
      writeFileSync(rawPath, Buffer.from(bytes));

      const cmdA = buildTsxSubprocessCommand(REPO_ROOT, WORKER_SCRIPT, ["--file", rawPath, "--out", outA]);
      const cmdB = buildTsxSubprocessCommand(REPO_ROOT, WORKER_SCRIPT, ["--file", rawPath, "--out", outB]);
      execFileSync(cmdA.command, cmdA.args, { stdio: "pipe" });
      execFileSync(cmdB.command, cmdB.args, { stdio: "pipe" });

      const candidateA = readFileSync(outA, "utf8");
      const candidateB = readFileSync(outB, "utf8");
      expect(candidateA).toBe(candidateB);

      const inProcess = await parseListoneXlsxBytes(bytes);
      const inProcessJson = serializeListoneCandidate(inProcess.candidateRows);
      expect(candidateA).toBe(inProcessJson);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("refuses to write its output inside the repository", () => {
    const cmd = buildTsxSubprocessCommand(REPO_ROOT, WORKER_SCRIPT, [
      "--file",
      "/tmp/whatever.xlsx",
      "--out",
      join(REPO_ROOT, "candidate.json"),
    ]);
    expect(() => execFileSync(cmd.command, cmd.args, { stdio: "pipe" })).toThrow();
  });
});
