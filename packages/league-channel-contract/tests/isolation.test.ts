import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ISOLAMENTO DEL CONTRATTO DI OSSERVAZIONE — la guardia gemella di
// `packages/league-gameweek/tests/isolation.test.ts`.
//
// PERCHÉ UNA GEMELLA E NON UNA RIGA IN QUELLA ESISTENTE. Le due guardie
// sorvegliano due cose diverse. Quella di `league-gameweek` chiede: «chi
// importa il contratto di giornata?». Questa chiede: «chi importa il contratto
// di osservazione?». La risposta legittima è diversa nei due casi — questo
// pacchetto importa `league-gameweek`, ed è il suo mestiere — quindi anche
// l'insieme sorvegliato è diverso: metterle nello stesso test avrebbe prodotto
// un'unica guardia con due eccezioni incrociate, cioè la forma in cui una
// guardia smette di dire una cosa sola.
//
// LA CATENA RESTA CHIUSA, ed è la ragione per cui l'esenzione concessa a questo
// pacchetto nella guardia di `league-gameweek` non è un buco: là questo
// pacchetto è escluso dalle radici sorvegliate (altrimenti i suoi import
// legittimi lo farebbero rosso); qui si vieta a chiunque, motore d'asta e UI
// compresi, di importare QUESTO pacchetto. Il motore non può quindi raggiungere
// `league-gameweek` passando di qui: la porta di servizio è chiusa dalla
// guardia che sta a valle.
//
// Fail-closed sull'estensione, come la gemella: un `.js` messo in una di queste
// radici importerebbe il pacchetto esattamente come un `.ts`.

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * TUTTO IL RESTO DEL REPOSITORY, NON UN ELENCO SCELTO A MANO: la UI più ogni
 * cartella `src` sotto `packages/`, escluso questo pacchetto. `league-gameweek` è **dentro** la
 * sorveglianza, non fuori: la dipendenza è a senso unico, e il contratto di
 * giornata non deve imparare a conoscere la piattaforma da cui i dati arrivano.
 */
function isolatedRoots(): readonly string[] {
  const roots = ["src"];
  for (const entry of readdirSync(join(REPO_ROOT, "packages"))) {
    if (entry === "league-channel-contract") continue;
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

describe("il contratto di osservazione resta fuori dal prodotto d'asta", () => {
  it("nessun file fuori dal pacchetto importa league-channel-contract", () => {
    const offenders: string[] = [];
    for (const root of isolatedRoots()) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (/league-channel-contract|leagueChannelContract/.test(src)) {
          offenders.push(file.slice(REPO_ROOT.length));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate si calcolano da sole e includono league-gameweek", () => {
    const roots = isolatedRoots();
    expect(roots.length).toBeGreaterThanOrEqual(4);
    expect(roots).toContain("packages/engine/src");
    expect(roots).toContain("packages/league-gameweek/src");
    expect(roots).not.toContain("packages/league-channel-contract/src");
    for (const root of roots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });
});
