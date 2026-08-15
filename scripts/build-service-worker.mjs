#!/usr/bin/env node
/**
 * Packaging step for BUNDLE-01: turns the plain `vite build` output into an
 * artifact that can cold-start without a network.
 *
 * Runs right after `vite build` (see package.json `build`) and does two things,
 * in this order:
 *
 *   1. hashes every built file and writes `dist/app-integrity.json` — the
 *      policy read at runtime by src/offline/integrityGate.ts (which data
 *      assets carry a hash manifest) and the source of `build_id`;
 *   2. compiles src/offline/sw.ts into `dist/sw.js` as a classic IIFE script,
 *      with `build_id` and the precache list injected as constants.
 *
 * Injecting the id into the worker's own bytes is what makes an update
 * actually take: a service worker whose file never changes is one the browser
 * never replaces, and its cache — the stale shell — would keep being served
 * after a new deploy.
 *
 * Fail-closed: any missing input, empty output or build error exits non-zero,
 * so `npm run build` (and therefore `npm run verify` and CI) fails instead of
 * shipping an app that silently has no offline shell.
 *
 * Deterministic: no clock, no git sha, no environment input. The same dist/
 * produces the same policy and the same worker bytes.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

import {
  buildIntegrityPolicy,
  distPathToUrl,
  isGeneratedArtifact,
  SERVICE_WORKER_FILENAME,
  serializePolicy,
} from "./service-worker-build-core.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(REPO_ROOT, "dist");
const SW_ENTRY = join(REPO_ROOT, "src", "offline", "sw.ts");

function fail(message) {
  console.error(`[build-service-worker] ${message}`);
  process.exit(1);
}

/** Every file under dist/, as paths relative to dist/, POSIX-separated and sorted. */
function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(absolute, relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
  fail(`dist/ not found at ${DIST_DIR} — run \`vite build\` first (npm run build does).`);
}
if (!existsSync(SW_ENTRY)) fail(`service worker entry not found at ${SW_ENTRY}`);

const relativePaths = listFiles(DIST_DIR).filter((path) => !isGeneratedArtifact(path));
if (relativePaths.length === 0) fail("dist/ contains no built files");

const files = relativePaths.map((relativePath) => {
  const bytes = readFileSync(join(DIST_DIR, relativePath));
  return {
    url: distPathToUrl(relativePath),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
});

const existingManifestUrls = files.map((file) => file.url).filter((url) => url.endsWith(".manifest.json"));

const policy = buildIntegrityPolicy(files, existingManifestUrls, (text) =>
  createHash("sha256").update(text, "utf8").digest("hex"),
);

writeFileSync(join(DIST_DIR, "app-integrity.json"), serializePolicy(policy), "utf8");

// The nested build is a vite lib build on purpose: one entry, IIFE output, no
// code splitting and no ES import syntax, which is what a CLASSIC service
// worker script must be. `configFile: false` keeps it independent of any future
// root vite config; `emptyOutDir: false` keeps the app build that just ran.
await build({
  configFile: false,
  root: REPO_ROOT,
  logLevel: "warn",
  define: {
    __FAC_BUILD_ID__: JSON.stringify(policy.build_id),
    __FAC_PRECACHE__: JSON.stringify(policy.precache),
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    // Unminified: this file is a guardrail, and a guardrail nobody can read in
    // the deployed artifact is one nobody can audit either.
    minify: false,
    lib: {
      entry: SW_ENTRY,
      formats: ["iife"],
      name: "FacServiceWorker",
      fileName: () => SERVICE_WORKER_FILENAME,
    },
    rollupOptions: { output: { entryFileNames: SERVICE_WORKER_FILENAME } },
  },
});

const swPath = join(DIST_DIR, SERVICE_WORKER_FILENAME);
if (!existsSync(swPath)) fail(`${SERVICE_WORKER_FILENAME} was not emitted`);
const swSource = readFileSync(swPath, "utf8");
// Two assertions rather than trust: the id must really be in the bytes (or the
// worker never updates), and the precache list must really be there (or the
// cold start finds an empty cache). Both are cheap and both have failed
// silently in this class of tooling before.
if (!swSource.includes(policy.build_id)) fail("the build id was not injected into the service worker");
if (!swSource.includes(policy.precache[0])) fail("the precache list was not injected into the service worker");

console.log(
  `[build-service-worker] build_id=${policy.build_id.slice(0, 12)} ` +
    `files=${policy.files.length} data=${policy.data.length} precache=${policy.precache.length} ` +
    `sw=${swSource.length}B`,
);
