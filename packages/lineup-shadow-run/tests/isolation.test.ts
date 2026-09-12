import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ISOLAMENTO DEL GIRO IN OMBRA — la guardia gemella di
// `packages/league-gameweek/tests/isolation.test.ts`.
//
// PERCHÉ UNA GEMELLA E NON UNA RIGA IN QUELLA ESISTENTE. Le due guardie
// sorvegliano due cose diverse, per lo stesso motivo documentato là:
// `league-gameweek` chiede «chi importa il contratto di giornata?», e la
// risposta legittima per questo pacchetto è «sì» — è il suo mestiere.
// Questa guardia chiede la domanda simmetrica: «chi importa il giro in
// ombra?», e qui la risposta legittima è sempre «nessuno». Metterle nello
// stesso file avrebbe prodotto un'unica guardia con un'eccezione incrociata
// per sé stessa.
//
// LA CATENA RESTA CHIUSA, ed è la ragione per cui l'esenzione concessa a
// questo pacchetto nella guardia di `league-gameweek` non è un buco: là
// questo pacchetto è escluso dalle radici sorvegliate (altrimenti il suo
// import legittimo lo farebbe rosso per la ragione sbagliata); qui si vieta a
// chiunque — motore d'asta e UI compresi — di importare QUESTO pacchetto. Il
// motore non può quindi raggiungere il contratto di giornata passando di qui,
// perché non può raggiungere nemmeno il tramite. Le due guardie insieme
// chiudono la catena; una sola no.
//
// QUESTO PACCHETTO NON HA UN SORGENTE PUBBLICO OGGI. Il giro in ombra vero —
// l'esecuzione dei nodi dell'orchestrazione, l'attestazione, il registro —
// vive nel repository privato: tocca l'automazione e i dati della lega reale,
// non è core generico, e il core pubblico è read-only dall'altra parte del
// confine. Non sorvegliare un `src/` che non esiste qui non rende questa
// guardia vuota: il suo lavoro è impedire che il codice pubblico impari a
// nominare questo pacchetto, ed è un lavoro che fa comunque, walkando tutto
// il resto del repository come la sua gemella.
//
// Fail-closed sull'estensione, come la gemella: un `.js` messo in una di
// queste radici importerebbe il pacchetto esattamente come un `.ts`.

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PACKAGE_NAME = "lineup-shadow-run";

/**
 * TUTTO IL RESTO DEL REPOSITORY, NON UN ELENCO SCELTO A MANO: la UI più ogni
 * `packages/*\/src`, escluso questo pacchetto — esattamente lo stesso calcolo
 * della gemella, applicato al bersaglio opposto.
 */
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

describe("il giro in ombra resta fuori dal prodotto d'asta", () => {
  it("nessun file del motore d'asta o della UI importa lineup-shadow-run", () => {
    const offenders: string[] = [];
    for (const root of isolatedRoots()) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (/lineup-shadow-run|lineupShadowRun/.test(src)) offenders.push(file.slice(REPO_ROOT.length));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate si calcolano da sole e non sono un elenco scritto a mano", () => {
    const roots = isolatedRoots();
    // La UI e almeno il motore e league-gameweek: se questo numero cala,
    // qualcuno ha smesso di essere sorvegliato.
    expect(roots.length).toBeGreaterThanOrEqual(3);
    expect(roots).toContain("packages/engine/src");
    expect(roots).toContain("packages/league-gameweek/src");
    expect(roots).not.toContain("packages/lineup-shadow-run/src");
    for (const root of roots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });
});
