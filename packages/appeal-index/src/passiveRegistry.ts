import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { PassiveHarnessResult } from "./passiveHarness.js";

export interface PassiveRegistryEntry {
  readonly runId: string;
  readonly protocolVersion: "VAL-PROTOCOL-A@1.0.0";
  readonly inputManifestHash: `sha256:${string}`;
  readonly commitSha: string;
  readonly configHash: `sha256:${string}`;
  readonly leagueRuleVersion: string;
  readonly cohortType: "explicit_target_cohort";
  readonly pipelineIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly seed: number;
  readonly deterministic: true;
  readonly metrics: PassiveHarnessResult["metrics"];
  readonly coverage: PassiveHarnessResult["coverage"];
  readonly oofRef: { readonly path: string; readonly hash: `sha256:${string}` };
  readonly artifactRefs: readonly { readonly path: string; readonly hash: `sha256:${string}` }[];
  readonly holdoutAccesses: PassiveHarnessResult["holdoutAccesses"];
  readonly status: "no_verdict";
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function assertOutputOutsideRepository(repoRoot: string, outputPath: string): string {
  const root = realpathSync(resolve(repoRoot));
  const resolved = resolve(outputPath);
  if (isWithin(root, resolved)) {
    throw new Error(`Refusing output inside repository: ${outputPath}`);
  }
  return resolved;
}

export function sha256(content: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function writeOofOnce(
  repoRoot: string,
  outputPath: string,
  oof: PassiveHarnessResult["oof"],
): { path: string; hash: `sha256:${string}` } {
  const safePath = assertOutputOutsideRepository(repoRoot, outputPath);
  mkdirSync(dirname(safePath), { recursive: true });
  const content = `${JSON.stringify(oof)}\n`;
  writeFileSync(safePath, content, { encoding: "utf8", flag: "wx" });
  return { path: safePath, hash: sha256(content) };
}

export function appendRegistryEntry(
  repoRoot: string,
  registryPath: string,
  entry: PassiveRegistryEntry,
): void {
  const safePath = assertOutputOutsideRepository(repoRoot, registryPath);
  mkdirSync(dirname(safePath), { recursive: true });
  const existing = existsSync(safePath)
    ? readFileSync(safePath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as PassiveRegistryEntry)
    : [];
  if (existing.some((item) => item.runId === entry.runId || item.configHash === entry.configHash)) {
    throw new Error(`Registry duplicate/overwrite refused for run '${entry.runId}'`);
  }
  appendFileSync(safePath, `${JSON.stringify(entry)}\n`, "utf8");
}
