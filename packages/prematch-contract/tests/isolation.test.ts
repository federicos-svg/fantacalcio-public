import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

// ISOLAMENTO DEL CONTRATTO PRE-PARTITA — due guardie in una.
//
// **Verso l'esterno**: nessun file del prodotto d'asta — motore, UI, altri
// pacchetti — importa questo contratto. Le fonti pre-partita alimentano il
// Lineup Coach e la sua valutazione, e `docs/NO_GO.md` §Scope tiene il Coach
// fuori dall'MVP d'asta; il record che autorizza queste pagine lo ripete per
// esteso: «nessun output di queste fonti entra nel prodotto d'asta».
//
// **Verso l'interno**: questo pacchetto non importa niente. Né un pacchetto
// npm, né un altro pacchetto del repository, né la UI. È la forma tecnica di
// «agnostico dalla fonte»: un contratto che non conosce nessuno non può
// imparare un host, un selettore o una regola di lega per la porta di servizio.
//
// Le radici sorvegliate SI CALCOLANO — la UI più ogni `packages/*/src` tranne
// questo — perché un pacchetto nato domani entri nella sorveglianza il giorno
// in cui nasce, senza che nessuno si ricordi di aggiungerlo a un elenco.

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PACKAGE_NAME = "prematch-contract";
const PACKAGE_ROOT = `packages/${PACKAGE_NAME}/`;

function isolatedRoots(): readonly string[] {
  const roots = ["src"];
  for (const entry of readdirSync(join(REPO_ROOT, "packages"))) {
    if (entry === PACKAGE_NAME) continue;
    const candidate = join(REPO_ROOT, "packages", entry, "src");
    try {
      if (statSync(candidate).isDirectory()) roots.push(`packages/${entry}/src`);
    } catch {
      // Un pacchetto senza `src/` non ha sorgenti da sorvegliare.
    }
  }
  return roots;
}

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

/** Ogni specificatore di modulo: `import … from`, `import "x"`, `export … from`, `import("x")`. */
const MODULE_SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importViolations(relativeFile: string, source: string): readonly string[] {
  const directory = posix.dirname(relativeFile);
  const out: string[] = [];
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const reason = `${relativeFile}: import "${specifier}" — il contratto pre-partita non si lega a nulla`;
    if (!specifier.startsWith(".")) {
      out.push(reason);
      continue;
    }
    const resolved = posix.normalize(posix.join(directory, specifier));
    if (resolved.startsWith(PACKAGE_ROOT)) continue;
    out.push(reason);
  }
  return out;
}

describe("il contratto pre-partita non conosce nessuno", () => {
  it("i suoi sorgenti importano solo sé stessi: nessun pacchetto npm, nessun vicino", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(`${PACKAGE_ROOT}src`)) {
      const relative = file.slice(REPO_ROOT.length);
      offenders.push(...importViolations(relative, readFileSync(file, "utf8")));
    }
    expect(offenders).toEqual([]);
  });

  it("la guardia fallisce davvero su casi costruiti, non solo sui sorgenti di oggi", () => {
    const file = `${PACKAGE_ROOT}src/finto.ts`;
    expect(importViolations(file, 'import { x } from "./field.js";')).toEqual([]);
    const respinti: readonly [string, string][] = [
      ["motore", 'import type { Role } from "../../engine/src/types.js";'],
      ["UI", 'import { x } from "../../../src/price.js";'],
      ["pacchetto npm", 'import { z } from "zod";'],
      ["builtin", 'import { readFileSync } from "node:fs";'],
      ["import dinamico", 'const m = await import("../../engine/src/reduce.js");'],
    ];
    for (const [etichetta, sorgente] of respinti) {
      expect(importViolations(file, sorgente), etichetta).toHaveLength(1);
    }
  });
});

describe("il contratto pre-partita resta fuori dal prodotto d'asta", () => {
  it("nessun file del motore, della UI o di un altro pacchetto lo nomina", () => {
    const offenders: string[] = [];
    for (const root of isolatedRoots()) {
      for (const file of sourceFiles(root)) {
        if (/prematch-contract|prematchContract/.test(readFileSync(file, "utf8"))) {
          offenders.push(file.slice(REPO_ROOT.length));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate si calcolano da sole e non sono un elenco scritto a mano", () => {
    const roots = isolatedRoots();
    expect(roots.length).toBeGreaterThanOrEqual(4);
    expect(roots).toContain("packages/engine/src");
    expect(roots).not.toContain(`${PACKAGE_ROOT}src`);
    for (const root of roots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });
});
