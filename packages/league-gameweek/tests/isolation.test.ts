import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ISOLAMENTO DEL CONTRATTO DI GIORNATA — la guardia che tiene la Fase 2 fuori
// dal prodotto d'asta.
//
// Il contratto della giornata (Lineup Coach) non deve entrare nel motore
// d'asta né nella UI dell'asta: sono due fasi diverse dello stesso prodotto, e
// `docs/NO_GO.md` §Scope vieta al Lineup Coach di comparire nell'MVP d'asta.
// Il divieto è di perimetro, quindi la guardia è di import: se un giorno un
// file del motore importasse questo pacchetto, il perimetro sarebbe stato
// attraversato in silenzio.
//
// Stesso modello già in uso per `packages/appeal-index`. Fail-closed
// sull'estensione: un `.js` messo in una di queste radici importerebbe il
// pacchetto esattamente come un `.ts`.

const ISOLATED_ROOTS = ["src", "packages/engine/src", "packages/opponent-profiles/src"] as const;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

function sourceFiles(root: string): readonly string[] {
  const absolute = join(REPO_ROOT, root);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (WATCHED_EXTENSIONS.test(entry) && !entry.includes(".test.")) out.push(full);
    }
  };
  walk(absolute);
  return out;
}

describe("il contratto di giornata resta fuori dal prodotto d'asta", () => {
  it("nessun file del motore d'asta o della UI importa league-gameweek", () => {
    const offenders: string[] = [];
    for (const root of ISOLATED_ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (/league-gameweek|leagueGameweek/.test(src)) offenders.push(file.slice(REPO_ROOT.length));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate esistono davvero, così la guardia non passa a vuoto", () => {
    for (const root of ISOLATED_ROOTS) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });
});
