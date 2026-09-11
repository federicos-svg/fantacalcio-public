import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

// ISOLAMENTO DEL CONTRATTO PRE-PARTITA — due guardie in una.
//
// **Verso l'esterno**: nessun file del **prodotto d'asta** — motore, UI, e ogni
// pacchetto che non sia dichiarato qui sotto come consumatore di Fase 2 — nomina
// questo contratto. Le fonti pre-partita alimentano il Lineup Coach e la sua
// valutazione, e `docs/NO_GO.md` §Scope tiene il Coach fuori dall'MVP d'asta; il
// record che autorizza queste pagine lo ripete per esteso: «nessun output di
// queste fonti entra nel prodotto d'asta». Il divieto è **di perimetro, non di
// argomento**: vieta al pre-partita di entrare nell'asta, non di essere letto da
// chi la Fase 2 la costruisce.
//
// **Verso l'interno**: questo pacchetto non importa niente. Né un pacchetto
// npm, né un altro pacchetto del repository, né la UI. È la forma tecnica di
// «agnostico dalla fonte»: un contratto che non conosce nessuno non può
// imparare un host, un selettore o una regola di lega per la porta di servizio.
//
// Le radici sorvegliate SI CALCOLANO — la UI più ogni `packages/*/src` tranne
// questo pacchetto e i consumatori di Fase 2 dichiarati — perché un pacchetto
// nato domani entri nella sorveglianza il giorno in cui nasce, senza che
// nessuno si ricordi di aggiungerlo a un elenco.

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PACKAGE_NAME = "prematch-contract";
const PACKAGE_ROOT = `packages/${PACKAGE_NAME}/`;

/**
 * I CONSUMATORI LEGITTIMI — la Fase 2, e nient'altro.
 *
 * PERCHÉ QUESTO ELENCO ESISTE. Finché nessuno consumava il contratto, la
 * guardia poteva vietare a *chiunque* di nominarlo e restare verde: una regola
 * che non costa niente finché non la si mette alla prova. Il primo consumatore
 * **legittimo** — il lettore privato che trasforma i grezzi pre-partita nella
 * forma di questo contratto, cioè esattamente il lavoro per cui il contratto è
 * stato scritto — la faceva diventare rossa. Rossa per la ragione sbagliata:
 * non c'era nessun pezzo del prodotto d'asta che avesse imparato il
 * pre-partita, c'era la Fase 2 che faceva la Fase 2.
 *
 * CHE COSA QUESTA GUARDIA PROTEGGE ADESSO, detto senza sconti: il **prodotto
 * d'asta** — motore, UI e ogni altro pacchetto — non nomina questo contratto.
 * CHE COSA NON PROTEGGE PIÙ: non impedisce più che *qualcuno* lo consumi; i
 * pacchetti nominati qui sotto possono farlo, ed è il motivo per cui l'elenco è
 * chiuso, scritto e rivisto una riga alla volta.
 *
 * LA CATENA RESTA CHIUSA, e senza dipendere da un file che vive in un altro
 * repository. Esentare un pacchetto dalla scansione aprirebbe una porta di
 * servizio — il motore importa l'esente, l'esente importa il contratto, e
 * nessuno dei due file nomina `prematch-contract` — quindi il nome di ogni
 * esente entra, insieme a quello del contratto, fra le stringhe **vietate**
 * nelle radici sorvegliate. Il prodotto d'asta non può nominare il contratto né
 * il suo lettore: la scorciatoia non esiste perché non esiste il tramite.
 *
 * NOTA DI CONFINE, perché non sembri una svista: `prematch-reader` è un
 * pacchetto **privato** e in questo repository non esiste. Qui la sua riga
 * esenta una cartella che non c'è — cioè non esenta niente — e vieta il suo
 * nome nel prodotto d'asta, che è invece verificabile qui e lo è nel test più
 * sotto. Nel repository privato, dove il pacchetto vive, la stessa riga fa
 * entrambe le cose.
 */
const PHASE_TWO_CONSUMERS: readonly string[] = ["prematch-reader"];

/** `prematch-reader` → `prematchReader`: un import si scrive in tutti e due i modi. */
function camelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Le stringhe che un file del prodotto d'asta non può contenere: il contratto e
 * ogni consumatore esentato, ciascuno nelle due grafie con cui lo si nomina.
 */
const FORBIDDEN_MENTIONS: readonly string[] = [PACKAGE_NAME, ...PHASE_TWO_CONSUMERS].flatMap(
  (name) => [name, camelCase(name)],
);

function isolatedRoots(): readonly string[] {
  const roots = ["src"];
  for (const entry of readdirSync(join(REPO_ROOT, "packages"))) {
    if (entry === PACKAGE_NAME) continue;
    if (PHASE_TWO_CONSUMERS.includes(entry)) continue;
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

/** Un file di una radice sorvegliata che nomina il pre-partita, o il suo lettore. */
function mentionViolations(relativeFile: string, source: string): readonly string[] {
  const found = FORBIDDEN_MENTIONS.filter((name) => source.includes(name));
  if (found.length === 0) return [];
  return [`${relativeFile}: nomina ${found.join(", ")} — il pre-partita resta fuori dal prodotto d'asta`];
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
      // Il contratto non conosce nemmeno i suoi consumatori: la dipendenza è a
      // senso unico, e questa direzione non è stata allargata da nessuno.
      ["il proprio lettore", 'import { r } from "../../prematch-reader/src/index.js";'],
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
        const relative = file.slice(REPO_ROOT.length);
        offenders.push(...mentionViolations(relative, readFileSync(file, "utf8")));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate si calcolano da sole e non sono un elenco scritto a mano", () => {
    const roots = isolatedRoots();
    expect(roots.length).toBeGreaterThanOrEqual(4);
    expect(roots).toContain("packages/engine/src");
    expect(roots).not.toContain(`${PACKAGE_ROOT}src`);
    for (const name of PHASE_TWO_CONSUMERS) {
      expect(roots).not.toContain(`packages/${name}/src`);
    }
    for (const root of roots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });

  it("l'esenzione di Fase 2 è un elenco chiuso, e ogni nome è un nome di pacchetto", () => {
    // Un nome in più qui è una riga in diff, che chi rivede vede. Il confronto
    // esatto è ciò che impedisce a un'esenzione di entrare per inerzia.
    expect(PHASE_TWO_CONSUMERS).toEqual(["prematch-reader"]);
    for (const name of PHASE_TWO_CONSUMERS) {
      // Niente metacaratteri: i nomi finiscono in un confronto letterale, e un
      // nome bizzarro qui sarebbe un modo di non vietare quello che si crede.
      expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(name).not.toBe(PACKAGE_NAME);
    }
  });

  it("separa il consumatore legittimo da quello vietato, e lo prova su casi costruiti", () => {
    // IL CONSUMATORE LEGITTIMO. Un file del lettore di Fase 2 che importa il
    // contratto non è nemmeno fra i file esaminati: la sua radice è fuori dalla
    // sorveglianza (assertito sopra), quindi il suo import non è una violazione.
    // È il caso che prima faceva rossa questa guardia.
    for (const name of PHASE_TWO_CONSUMERS) {
      expect(isolatedRoots()).not.toContain(`packages/${name}/src`);
    }

    // IL CONSUMATORE VIETATO, nelle due strade che ha per esistere.
    const respinti: readonly [string, string, string][] = [
      ["motore, via contratto", "packages/engine/src/finto.ts", 'import type { P } from "../../prematch-contract/src/index.js";'],
      ["UI, via contratto", "src/finto.ts", 'const m = await import("../packages/prematch-contract/src/index.js");'],
      ["motore, in cammello", "packages/engine/src/finto.ts", "const x = prematchContract.shape;"],
      // LA PORTA DI SERVIZIO, chiusa: il motore non può raggiungere il contratto
      // passando dal lettore esentato, perché non può nominare nemmeno quello.
      ["motore, via lettore", "packages/engine/src/finto.ts", 'import { r } from "../../prematch-reader/src/readDeposit.js";'],
      ["UI, via lettore in cammello", "src/finto.ts", "const y = prematchReader.deposits;"],
    ];
    for (const [etichetta, file, sorgente] of respinti) {
      const violazioni = mentionViolations(file, sorgente);
      expect(violazioni, etichetta).toHaveLength(1);
      expect(violazioni[0], etichetta).toContain(file);
      expect(violazioni[0], etichetta).toContain("resta fuori dal prodotto d'asta");
    }

    // E un file del prodotto d'asta che non nomina niente di tutto questo resta
    // libero: la guardia è di perimetro, non un divieto di esistere.
    expect(mentionViolations("packages/engine/src/finto.ts", 'import { r } from "../../appeal-index/src/dataset.js";')).toEqual([]);
  });
});
