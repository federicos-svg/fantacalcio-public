#!/usr/bin/env -S tsx
/**
 * Single-purpose worker, always invoked as a SEPARATE OS process by
 * scripts/build-listone-candidate.ts (via `execFileSync`, never imported),
 * to produce real cross-process determinism evidence — see
 * docs/data/LISTONE_XLSX_PARSER_CONTRACT.md "Determinism — in-process vs
 * cross-process". Two independent invocations of this file, each its own
 * Node process with its own module cache and V8 heap, are what makes
 * `cross_process_determinism` a real claim rather than an in-process
 * double-call dressed up as one.
 *
 * Reads a raw XLSX file, runs the exact same parse/serialize pipeline the
 * main CLI uses, and writes ONLY the resulting candidate JSON to `--out`.
 * Prints nothing about row content — on error, only a redacted error
 * name/message goes to stderr, matching the main CLI's discipline of never
 * putting real player data in logs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseListoneXlsxBytes, serializeListoneCandidate } from "../../packages/xlsx-adapter/src/index.js";
import { repoRootFromScriptUrl, assertOutsideRepo } from "./repoPaths.js";

const REPO_ROOT = repoRootFromScriptUrl(import.meta.url, 2); // scripts/lib/ -> repo root

interface Args {
  file: string;
  out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const file = get("file");
  const out = get("out");
  if (!file || !out) {
    throw new Error("Usage: listone-candidate-worker --file <raw xlsx path> --out <output json path>");
  }
  return { file, out };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  // Defense-in-depth: the orchestrating CLI already validates its own
  // paths, but this file can in principle be invoked directly too.
  assertOutsideRepo(REPO_ROOT, "--out", args.out);

  const bytes = readFileSync(args.file);
  const result = await parseListoneXlsxBytes(new Uint8Array(bytes));
  const serialized = serializeListoneCandidate(result.candidateRows);
  writeFileSync(args.out, serialized, "utf8");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[listone-candidate-worker] ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    process.exit(1);
  });
