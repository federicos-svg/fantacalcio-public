import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// LA GUARDIA DELLA PUREZZA. Le proprietà che il file principale dichiara in
// prosa — nessun orologio, nessun caso, nessuna rete, nessuna dipendenza
// esterna — qui diventano eseguibili. Una promessa scritta in un commento non
// fallisce mai; questa sì.
//
// Perché conta proprio qui: una misura di affidabilità che leggesse l'ora del
// sistema o un valore casuale darebbe risultati diversi sugli stessi dati, e
// due esiti diversi sugli stessi dati non sono una misura.

const SRC = new URL("../src/", import.meta.url).pathname;

function sourceFiles(): readonly string[] {
  return readdirSync(SRC)
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(SRC, entry));
}

describe("il pacchetto è puro, e lo si verifica invece di dichiararlo", () => {
  it("ha dei sorgenti da sorvegliare", () => {
    expect(sourceFiles().length).toBeGreaterThanOrEqual(2);
  });

  it("non legge l'orologio e non tira dadi", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      for (const forbidden of ["new Date", "Date.now(", "Math.random", "performance.now", "process.hrtime"]) {
        if (src.includes(forbidden)) offenders.push(file + ": " + forbidden);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("non parla con nessuno: nessuna rete, nessun filesystem, nessun processo", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      for (const forbidden of ["fetch(", "XMLHttpRequest", "node:fs", "node:http", "node:child_process", "process.env"]) {
        if (src.includes(forbidden)) offenders.push(file + ": " + forbidden);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("non importa nulla da fuori di sé: nessun pacchetto npm, nessun altro pacchetto del repository", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        // Solo veri specificatori di modulo: `… from "x"` oppure `import "x"`.
        // Un tipo letterale come `"pre_kickoff"` non è un import, e una guardia
        // che lo scambiasse per tale sarebbe rossa per la ragione sbagliata.
        const match =
          /^\s*(?:import|export)\b[^"']*\bfrom\s*["']([^"']+)["']/.exec(line) ??
          /^\s*import\s+["']([^"']+)["']/.exec(line);
        const specifier = match?.[1];
        if (specifier === undefined) continue;
        if (!specifier.startsWith("./")) offenders.push(file + ": " + specifier);
      }
    }
    expect(offenders).toEqual([]);
  });
});
