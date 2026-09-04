import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";

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
//
// LA SECONDA DIREZIONE, ORA ESEGUIBILE. Le guardie di sopra sorvegliano chi
// importa la Fase 2. La direzione opposta — che cosa la Fase 2 importa — era
// affidata a un commento, e un commento non fallisce mai: la terza guardia di
// questo file cammina su `src/` e **ammette solo tre cose**, gli import interni
// al pacchetto, `packages/league-gameweek/src/*` e l'unico
// `packages/appeal-index/src/fantavoto.js`. Qualunque altro import da fuori fa
// fallire il test dicendo file, import e ragione.
//
// IL DEBITO, perché chi legge sappia che non è una scelta definitiva. Le
// costanti di §12 (tariffa bonus/malus) e §12-bis (platea del gol subito) sono
// l'unica dichiarazione che il core pubblico ne possiede, e vivono in
// `appeal-index` per ragioni storiche: quel pacchetto le usa per calcolare il
// fantavoto offline, ma non ne è il proprietario naturale. La loro sede giusta
// è una casa condivisa delle costanti di regolamento, che oggi non esiste.
// Finché non ci si sposta, questa guardia è ciò che tiene la dipendenza a **una
// porta sola**: un file, non un pacchetto. Il giorno in cui la casa condivisa
// nasce, qui si cambia una riga dell'elenco e la porta si sposta con lei.

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

const PACKAGE_ROOT = "packages/league-channel-contract/";

/**
 * Gli unici import da fuori il pacchetto che questa guardia ammette. Elenco
 * chiuso: un percorso in più è una riga in diff, non un effetto collaterale.
 */
const ALLOWED_EXTERNAL_IMPORTS: readonly RegExp[] = [
  // Il contratto di giornata: è il pacchetto che questo consuma per mestiere.
  /^packages\/league-gameweek\/src\/[A-Za-z0-9_]+\.js$/,
  // UNA PORTA SOLA, e un file solo: le costanti di §12 e §12-bis. Vedi il
  // debito dichiarato in testa al file.
  /^packages\/appeal-index\/src\/fantavoto\.js$/,
];

/**
 * Ogni specificatore di modulo del sorgente: `import … from "x"`, `import "x"`,
 * `export … from "x"` e `import("x")`. Gli import di solo tipo passano di qui
 * come gli altri — `import type … from "x"` finisce comunque su `from "x"` — e
 * devono, perché un legame di tipo è comunque un legame di architettura.
 */
const MODULE_SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importViolations(relativeFile: string, source: string): readonly string[] {
  const directory = posix.dirname(relativeFile);
  const out: string[] = [];
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const reason = `${relativeFile}: import "${specifier}" — la Fase 2 non si lega ad altro del prodotto d'asta`;
    if (!specifier.startsWith(".")) {
      // Uno specificatore nudo è un pacchetto npm o un builtin: nessuno dei due
      // è ammesso qui, e lasciarlo passare vanificherebbe l'elenco.
      out.push(reason);
      continue;
    }
    const resolved = posix.normalize(posix.join(directory, specifier));
    if (resolved.startsWith(PACKAGE_ROOT)) continue;
    if (ALLOWED_EXTERNAL_IMPORTS.some((allowed) => allowed.test(resolved))) continue;
    out.push(reason);
  }
  return out;
}

describe("il contratto di osservazione non si lega ad altro del prodotto d'asta", () => {
  it("i sorgenti importano solo il pacchetto stesso, league-gameweek e le costanti di §12", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(`${PACKAGE_ROOT}src`)) {
      const relative = file.slice(REPO_ROOT.length);
      offenders.push(...importViolations(relative, readFileSync(file, "utf8")));
    }
    expect(offenders).toEqual([]);
  });

  it("la guardia fallisce davvero su casi costruiti, e non solo sui sorgenti di oggi", () => {
    // Un vincolo che non è mai stato visto fallire non è un vincolo provato.
    const file = `${PACKAGE_ROOT}src/finto.ts`;
    const ammessi = [
      'import type { Module } from "../../league-gameweek/src/leagueGameweek.js";',
      'import { FANTAVOTO_TARIFF } from "../../appeal-index/src/fantavoto.js";',
      'import { validate } from "./leagueSettings.js";',
      'export * from "./calendar.js";',
    ].join("\n");
    expect(importViolations(file, ammessi)).toEqual([]);

    // Motore d'asta, UI, un altro pacchetto, un file diverso dello stesso
    // pacchetto ammesso, un pacchetto npm: tutti respinti, e con la ragione.
    const respinti: readonly [string, string][] = [
      ["motore", 'import type { Role } from "../../engine/src/types.js";'],
      ["UI", 'import { x } from "../../../src/price.js";'],
      ["altro pacchetto", 'export * from "../../opponent-profiles/src/counters.js";'],
      ["altro file di appeal-index", 'import type { A } from "../../appeal-index/src/dataset.js";'],
      ["pacchetto npm", 'import { z } from "zod";'],
      ["import dinamico", 'const m = await import("../../engine/src/reduce.js");'],
    ];
    for (const [etichetta, sorgente] of respinti) {
      const violazioni = importViolations(file, sorgente);
      expect(violazioni, etichetta).toHaveLength(1);
      expect(violazioni[0]).toContain("non si lega ad altro del prodotto d'asta");
      expect(violazioni[0]).toContain(file);
    }
  });
});

/**
 * LA PAGINA FORMAZIONE — l'unica porta aperta in questa guardia, e il perché.
 *
 * Pico ha chiesto (2026-09-04) che il sito abbia una pagina Formazione, prima
 * di Asta nella barra, e che sia la pagina iniziale quando la formazione si può
 * davvero schierare. È una richiesta di prodotto, e sposta il confine che
 * questa guardia difendeva: il contratto di osservazione non è più solo un
 * pezzo di Fase 2 tenuto da parte, è ciò che quella schermata consuma.
 *
 * L'apertura è un ELENCO CHIUSO DI FILE, non una radice né un prefisso, per tre
 * ragioni che si vedono solo se le si scrive:
 *
 *  1. un elenco di file rende ogni nuova porta una riga in diff — chi la apre
 *     lo fa esplicitamente e chi rivede la vede, mentre un prefisso come
 *     `src/ui/` avrebbe ammesso in silenzio ogni file futuro;
 *  2. la catena a valle resta chiusa. La guardia gemella
 *     (`packages/league-gameweek/tests/isolation.test.ts`) vieta a `src/` di
 *     nominare il contratto di giornata, e nessuno dei file in elenco lo
 *     nomina: quello che serve alla pagina — i moduli di §9 — arriva
 *     ri-esportato da `lineupCoachSurface.ts`, che è dentro questo pacchetto e
 *     ha già il permesso di importarlo. La UI non impara una seconda strada;
 *  3. il resto del prodotto d'asta resta esattamente dove stava: il motore, gli
 *     altri pacchetti e ogni altro file della UI continuano a non poter
 *     toccare questo contratto, e il test qui sotto lo prova su casi costruiti.
 */
const FORMAZIONE_SURFACE: readonly string[] = [
  // La porta di lettura e quella di invio: due tipi, nessuna rete.
  "src/formazioneChannel.ts",
  // I vincoli salvati fra una sessione e l'altra.
  "src/formazioneConstraints.ts",
  // La squadra di esempio della modalità dimostrativa: fixture sintetica,
  // nessuna porta collegata. Entra in elenco perché nomina i tipi del
  // contratto — è una riga in diff, come ogni altra porta di questo elenco.
  "src/formazioneProva.ts",
  // La schermata.
  "src/ui/formazione.ts",
  // La shell: barra, schermata iniziale, salvataggio.
  "src/main.ts",
];

describe("il contratto di osservazione resta fuori dal prodotto d'asta", () => {
  it("nessun file fuori dal pacchetto importa league-channel-contract, salvo la pagina Formazione", () => {
    const offenders: string[] = [];
    for (const root of isolatedRoots()) {
      for (const file of sourceFiles(root)) {
        const relative = file.slice(REPO_ROOT.length);
        if (FORMAZIONE_SURFACE.includes(relative)) continue;
        const src = readFileSync(file, "utf8");
        if (/league-channel-contract|leagueChannelContract/.test(src)) {
          offenders.push(relative);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("l'elenco dei file ammessi è chiuso, vivo, e non copre nient'altro", () => {
    // Un file in elenco che non esiste più è un permesso appeso nel vuoto: si
    // toglie quando si toglie il file, non «prima o poi».
    for (const relative of FORMAZIONE_SURFACE) {
      expect(statSync(join(REPO_ROOT, relative)).isFile(), relative).toBe(true);
    }
    // Nessuna radice, nessun prefisso: cinque file e basta.
    expect(FORMAZIONE_SURFACE).toHaveLength(5);
    for (const relative of FORMAZIONE_SURFACE) {
      expect(relative.endsWith(".ts")).toBe(true);
    }
    // E il vicino di casa NON è ammesso: la guardia continua a fermare un file
    // della UI che non sia in elenco, che è il caso per cui esiste.
    expect(FORMAZIONE_SURFACE).not.toContain("src/ui/views.ts");
    expect(FORMAZIONE_SURFACE).not.toContain("src/ui/listone.ts");
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
