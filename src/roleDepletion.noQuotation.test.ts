import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { roleDepletionReading } from "./roleDepletion.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { anchorBook, measuredInflation, type PlayerAnchor } from "../packages/engine/src/anchors.js";
import { tension } from "../packages/engine/src/tension.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";

// LA GUARDIA DELLA DECISIONE DI PICO (16/08/2026).
//
// Domanda posta: quando l'app avverte che un ruolo si sta svuotando, può
// guardare solo i giocatori già comprati stasera, oppure anche quanto valgono
// secondo il listino quelli rimasti? Risposta: «solo il tavolo adesso; la
// versione che guarda anche il listino si valuta dopo l'asta».
//
// Una decisione di prodotto che vive solo in un commento non è difesa da
// niente: al primo refactoring utile qualcuno importa `currentAnchor` «solo per
// ordinare» e nessun test se ne accorge. Questo file è la difesa, e ha due metà
// che fanno due lavori diversi:
//
//  1. LA PROVA CHE LA RIGA ESISTE DAVVERO (`describe` «il motore della
//     tensione»). Si esegue `tension()` del motore su DUE listini che
//     differiscono solo nelle Qt.A, a parità di log e di stato, e si mostra che
//     la sua banda cambia. È la ragione per cui quel motore è fuori perimetro:
//     non un giudizio, una misura.
//
//  2. LA GUARDIA CHE MORDE (`describe` «il calcolo del pannello»). Legge il
//     sorgente di src/roleDepletion.ts e fallisce se ricompare un import fuori
//     dalla lista bianca o un identificatore del perimetro delle quotazioni.
//     È la metà che diventa rossa quando il calcolo INIZIA a guardare la
//     quotazione, che è esattamente l'evento da intercettare: un test sui soli
//     valori restituiti non potrebbe mai vederlo, perché la funzione oggi non
//     riceve nessun listino e un domani in cui lo ricevesse avrebbe già la
//     firma cambiata.

const CALC_SOURCE_PATH = fileURLToPath(new URL("./roleDepletion.ts", import.meta.url));
const VIEW_SOURCE_PATH = fileURLToPath(new URL("./ui/roleDepletion.ts", import.meta.url));

/**
 * Il sorgente senza commenti. Serve perché i commenti di questi due moduli
 * PARLANO delle quotazioni — devono, è lì che la decisione è scritta — mentre
 * il codice non deve nominarle. Uno scan sul file intero sarebbe rosso sempre,
 * cioè inutile; uno scan che non togliesse davvero i commenti sarebbe verde
 * sempre, cioè peggio che inutile. Per questo lo stripper ha un suo test.
 */
function codeWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Gli specificatori di modulo importati, nell'ordine in cui compaiono. */
function importedModules(code: string): readonly string[] {
  return [...code.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!);
}

/**
 * Il perimetro delle quotazioni, per come si presenterebbe nel codice: i tre
 * moduli del motore che poggiano sulla Qt.A, i nomi delle loro funzioni, e i
 * nomi con cui il listone entra nell'app.
 */
const QUOTATION_PERIMETER =
  /anchor|ancora|cliff|tension|quotation|quotazion|inflation|inflazion|fvm|qt\.?a\b|listino|listone|\bpool\b/i;

describe("il motore della tensione GUARDA la quotazione — misurato, non affermato", () => {
  // Fixture sintetiche: sei attaccanti senza nome reale, otto squadre.
  const TEAM_IDS = ["Io", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const IDS = ["a1", "a2", "a3", "a4", "a5", "a6"];

  function anchorsAt(calledQuotation: number): readonly PlayerAnchor[] {
    return IDS.map((playerId) => ({
      playerId,
      role: "A" as Role,
      quotation: playerId === "a1" ? calledQuotation : 10,
    }));
  }

  const LOG: readonly AuctionEvent[] = [
    { type: "PURCHASE", seq: 1, ts: "2026-08-16T20:00:00.000Z", playerId: "a5", role: "A", fantaTeamId: "S2", price: 12 },
    { type: "PURCHASE", seq: 2, ts: "2026-08-16T20:01:00.000Z", playerId: "a6", role: "A", fantaTeamId: "S3", price: 8 },
  ];
  const STATE = reduce(LOG, TEAM_IDS, []);

  function bandAt(calledQuotation: number): string | null {
    const book = anchorBook(anchorsAt(calledQuotation));
    const assessment = tension({
      playerId: "a1",
      book,
      state: STATE,
      inflation: measuredInflation(LOG, book),
      selfId: "Io",
    });
    if (assessment === null) throw new Error("tension: nessuna valutazione");
    return assessment.band;
  }

  it("cambia banda quando cambia SOLO la Qt.A, a parità di log e di stato", () => {
    // Stesso registro, stesso stato ridotto, stesso giocatore chiamato: cambia
    // una sola cifra di listino, e la risposta del motore cambia. È la prova
    // che quel motore non è alimentabile col solo tavolo, ed è per questo che
    // non è lui a stare a schermo in questa corsia.
    const staccato = bandAt(100); // dopo di lui la scala crolla: cliff
    const appaiato = bandAt(10); // un pari-ancora disponibile: nessun salto
    expect(staccato).toBe("alta");
    expect(appaiato).toBe("media");
    expect(staccato).not.toBe(appaiato);
  });

  it("senza Qt.A non produce proprio niente: non degrada, si ferma", () => {
    // `tension()` esce `null` su un giocatore senza ancora (tension.ts, righe
    // 119-120). Non esiste una modalità «tensione senza listino» da accendere:
    // per questo la parte del motore che poggia sull'ancora resta fuori invece
    // di essere importata a metà.
    const book = anchorBook(anchorsAt(50));
    expect(
      tension({ playerId: "sconosciuto", book, state: STATE, inflation: measuredInflation(LOG, book) }),
    ).toBeNull();
  });

  it("il pannello, sullo stesso scenario, non ha nessun ingresso da cui la Qt.A possa arrivare", () => {
    // La controprova: la lettura del pannello si costruisce da log e stato, e
    // basta. I due listini dell'asserzione qui sopra non hanno un posto in cui
    // essere passati — non è che vengano ignorati, non c'è il parametro.
    expect(roleDepletionReading({ log: LOG, state: STATE, role: "A" })).toStrictEqual(
      roleDepletionReading({ log: LOG, state: STATE, role: "A" }),
    );
    const reading = roleDepletionReading({ log: LOG, state: STATE, role: "A" });
    if (reading.kind !== "facts") throw new Error("attesi fatti");
    expect(reading.facts.takenTonight).toBe(2);
    expect(reading.facts.creditsTonight).toBe(20);
  });
});

describe("lo stripper di commenti — la guardia sa fare il suo mestiere", () => {
  // Se questo test è rosso, i due qui sotto non stanno più misurando niente.
  const source = readFileSync(CALC_SOURCE_PATH, "utf8");
  const code = codeWithoutComments(source);

  it("toglie i commenti, compresa la frase che nomina il listino", () => {
    expect(source).toContain("si valuta dopo l'asta");
    expect(code).not.toContain("si valuta dopo l'asta");
  });

  it("non toglie il codice", () => {
    expect(code).toContain("export function roleDepletionReading");
    expect(code).toContain("ROSTER_REQUIREMENTS");
  });
});

describe("il calcolo del pannello NON guarda la quotazione — guardia sul sorgente", () => {
  const code = codeWithoutComments(readFileSync(CALC_SOURCE_PATH, "utf8"));

  it("importa solo dalla lista bianca: i tipi del motore e gli acquisti in piedi", () => {
    // Nessuno dei due moduli porta una Qt.A: `types.js` non ha nessun campo di
    // quotazione, `nominationContext.js` legge il solo event log.
    expect(importedModules(code)).toEqual([
      "../packages/engine/src/types.js",
      "./nominationContext.js",
    ]);
  });

  it("non nomina nessun identificatore del perimetro delle quotazioni", () => {
    const offenders = code
      .split("\n")
      .map((line, index) => ({ line: line.trim(), n: index + 1 }))
      .filter((entry) => QUOTATION_PERIMETER.test(entry.line));
    expect(offenders).toEqual([]);
  });
});

describe("la resa del pannello NON può raggiungere il listino — guardia sul sorgente", () => {
  // Sulla resa la lista bianca è l'unica guardia possibile: la sua nota DEVE
  // poter dire «le quotazioni del listino non entrano in questo conto», quindi
  // un divieto di parole la renderebbe rossa proprio sulla frase che dichiara
  // la decisione. Il divieto di IMPORT invece regge intero.
  const code = codeWithoutComments(readFileSync(VIEW_SOURCE_PATH, "utf8"));

  it("importa solo tipi, la lettura già fatta, il tema e le etichette", () => {
    expect(importedModules(code)).toEqual([
      "../../packages/engine/src/types.js",
      "../roleDepletion.js",
      "./theme.js",
      "./labels.js",
    ]);
  });
});
