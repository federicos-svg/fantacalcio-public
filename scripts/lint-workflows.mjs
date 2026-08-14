#!/usr/bin/env node
/**
 * Workflow linter — thin, honest wrapper around `actionlint`.
 *
 * Why this exists (issue #256 §3): #253 was a GitHub Actions workflow that
 * failed to parse. An unparsable workflow is not a failing check, it is an
 * ABSENT check — the workflow never starts, GitHub reports a startup failure
 * nobody is subscribed to, and the pull request stays green while the control
 * plane it was supposed to guard is unreachable. No gate in this repository
 * would have caught it: `typecheck`, `test`, `secret-scan`, `repo-guardrails`
 * and `check-links` all read the tracked tree as text or as TypeScript, and
 * none of them parses a workflow as a workflow.
 *
 * WHERE THE ENFORCEMENT LIVES: in CI, not here. `.github/workflows/ci.yml`
 * downloads a version- and checksum-pinned actionlint release binary and runs
 * it in the `check` job. That is the point of truth, and it is the reason this
 * script does no downloading of its own.
 *
 * WHY IT IS NOT IN `npm run verify`: `verify` is the deterministic offline
 * gate. Every one of its steps runs from the tracked tree with no network and
 * no unpinned tool, on any machine, at any time. Fetching a release binary
 * would break that property, and shelling out to whatever `actionlint` happens
 * to be on a developer's PATH would make the local gate's result depend on a
 * version nobody declared. So `verify` stays exactly as deterministic as it
 * was, and this script is the opt-in local convenience.
 *
 * WHAT IT REFUSES TO DO: pretend. With no `actionlint` on PATH it exits
 * NON-ZERO and says the verification is delegated to CI. A wrapper that exited
 * 0 on a missing binary would be worse than no wrapper at all: it would report
 * "workflows linted" to a reader who ran nothing.
 *
 * Never downloads, never installs, never touches the network.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Resolve `actionlint` on PATH without running it: `--version` on an arbitrary
 * PATH entry is already an execution. `command -v` answers the question the
 * wrapper actually has — "is there one" — and nothing more.
 */
function actionlintOnPath() {
  const probe = spawnSync("command", ["-v", "actionlint"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
  });
  const path = probe.status === 0 ? probe.stdout.trim().split("\n")[0]?.trim() : "";
  return path || null;
}

const binary = actionlintOnPath();

if (binary === null) {
  process.stderr.write(
    [
      "lint-workflows: binario actionlint non disponibile su PATH.",
      "",
      "Verifica NON eseguita — enforcement in CI: il job `check` di",
      ".github/workflows/ci.yml scarica actionlint con versione e checksum",
      "sha256 pinnati e lo esegue su ogni push e ogni pull request.",
      "",
      "Per eseguirlo anche in locale, installa actionlint (stessa versione",
      "pinnata in .github/workflows/ci.yml) e rilancia `npm run lint-workflows`.",
      "",
      "Questo comando esce NON-ZERO di proposito: non esiste un esito",
      "\"passato\" per un controllo che non e' stato eseguito.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stderr.write(`lint-workflows: uso ${binary}\n`);

// No file arguments: actionlint finds the nearest .github/workflows itself, so
// the set of linted files cannot drift from the set of real workflows.
const result = spawnSync(binary, ["-no-color"], { cwd: ROOT, stdio: "inherit" });

if (result.error) {
  process.stderr.write(`lint-workflows: esecuzione fallita — ${result.error.message}\n`);
  process.exit(1);
}
if (result.signal) {
  process.stderr.write(`lint-workflows: actionlint terminato dal segnale ${result.signal}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
