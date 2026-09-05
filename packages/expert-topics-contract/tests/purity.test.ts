import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_HOST } from "./fixtures.js";

// PUREZZA E AGNOSTICISMO DALLA FONTE — la guardia che rende vere, e non
// promesse, le due frasi scritte in cima al pacchetto.
//
// Perché è un test e non un commento: un commento non fallisce mai. Il giorno
// in cui qualcuno aggiunge qui una `fetch`, un orologio o il nome di una fonte
// reale, questo file diventa rosso e dice quale riga.

const SRC = join(__dirname, "..", "src");

function sourceFiles(): { path: string; content: string }[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ path: name, content: readFileSync(join(SRC, name), "utf8") }));
}

describe("il parser è puro", () => {
  it("non fa rete e non importa niente da fuori dal pacchetto", () => {
    for (const file of sourceFiles()) {
      expect(file.content, `${file.path}: rete`).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios/);
      const imports = [...file.content.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1] ?? "");
      for (const specifier of imports) {
        expect(specifier.startsWith("./"), `${file.path}: import esterno ${specifier}`).toBe(true);
      }
    }
  });

  it("non legge orologi e non genera numeri a caso", () => {
    for (const file of sourceFiles()) {
      expect(file.content, `${file.path}: orologio`).not.toMatch(/new Date\b|Date\.now|Date\.parse/);
      expect(file.content, `${file.path}: caso`).not.toMatch(/Math\.random/);
      expect(file.content, `${file.path}: ambiente`).not.toMatch(/process\.env/);
    }
  });

  it("non scrive e non legge file", () => {
    for (const file of sourceFiles()) {
      expect(file.content, `${file.path}: filesystem`).not.toMatch(
        /node:fs|readFileSync|writeFileSync/,
      );
    }
  });
});

describe("il pacchetto è agnostico dalla fonte", () => {
  // Host, marcatore di rango e marcatore di altro perimetro sono INIETTATI. Un
  // valore scritto qui dentro sarebbe, oltre che un accoppiamento, la
  // pubblicazione di quale fonte leggiamo e di come la riconosciamo.
  it("non contiene host, domini o indirizzi assoluti", () => {
    for (const file of sourceFiles()) {
      expect(file.content, `${file.path}: indirizzo assoluto`).not.toMatch(/https?:\/\/[a-z]/i);
      expect(file.content, `${file.path}: dominio`).not.toMatch(
        /[a-z0-9-]+\.(it|com|net|org|eu)\b/i,
      );
    }
  });

  it("non contiene sezioni, identificativi di area o percorsi di marcatore", () => {
    for (const file of sourceFiles()) {
      expect(file.content, `${file.path}: sezione`).not.toMatch(/viewforum|[?&]f=\d/);
      expect(file.content, `${file.path}: marcatore cablato`).not.toMatch(/rankstaff|ranks\//);
    }
  });
});

describe("le fixture sono sintetiche", () => {
  it("non contengono nomi di squadre reali né domini raggiungibili", () => {
    const fixtures = readFileSync(join(__dirname, "fixtures.ts"), "utf8");
    // I domini di prova stanno tutti sotto `.invalid`, che per definizione non
    // risolve: nessuna fixture può puntare a una fonte vera per distrazione.
    for (const match of fixtures.matchAll(/https?:\/\/([^/"'` ]+)/g)) {
      const host = match[1] ?? "";
      // L'unico host non letterale ammesso è il segnaposto della costante, che
      // la riga sotto verifica per valore.
      if (host === "${SOURCE_HOST}") continue;
      expect(host, "dominio di fixture").toMatch(/\.invalid$/);
    }
    expect(SOURCE_HOST, "host sintetico").toMatch(/\.invalid$/);
    expect(fixtures).toMatch(/Alfa|Beta/);
  });
});
