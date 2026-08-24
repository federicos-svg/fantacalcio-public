import { describe, it, expect } from "vitest";
import {
  ABSOLUTE_VALUE_DELTAS,
  CONCORRENZA_VOCABULARY,
  NO_LEG_INPUTS,
  absoluteValueReading,
  type AbsoluteValueReading,
} from "../packages/engine/src/absoluteValue.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { ROSTER_REQUIREMENTS, type AuctionEvent, type Role } from "../packages/engine/src/types.js";
import { TITOLARITA_VALUES } from "./expertScheda.js";
import { PAGELLA_ASSI, PAGELLA_TOTALE_MAX, PAGELLA_VOTO_MAX } from "./pagellaEsperti.js";
import { buildTierBook } from "./tierOrdering.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";

// LA CATENA CHE QUESTO FILE MONTA NON È PIÙ MONTATA DALL'APP, e va detto prima
// di leggere il resto: il 2026-08-24 Pico ha tolto dal riquadro i due numeri in
// crediti («Leva il valore assoluto e il valore relativo»), quindi `src/` non
// costruisce più `absoluteValueReading()` da nessuna parte. Le misure qui sotto
// NON sono state tolte — provano che il numero non si muove con la serata, ed è
// ancora vero —, ma provano adesso una catena che il prodotto non percorre.
// Senza questa riga il commento qui sotto continuerebbe a dire «nell'app il
// libro delle fasce si costruisce così» di un percorso che l'app non ha più.
//
// IL VALORE ASSOLUTO NON SI MUOVE DURANTE LA SERATA — la prova per ESECUZIONE,
// col giro vero dell'app e non con la firma di un tipo.
//
// PERCHÉ SERVE ANCHE QUESTA, quando packages/engine/tests/absoluteValue.test.ts
// prova già che `AbsoluteValueInput` non ha un campo in cui uno stato d'asta
// possa entrare. Perché la prova strutturale copre il MOTORE, non la CATENA:
// il libro delle fasce, nell'app, si costruisce da `buildTierBook(pool, source,
// state)` — cioè con uno `AuctionState` in mano. Che quel passaggio non
// contamini il numero è vero (`computeTierBook` deriva solo `teamsCount`), ma è
// un fatto della catena montata, e i fatti della catena montata si misurano
// montandola.
//
// LA TRAPPOLA CHE QUESTO FILE ESISTE PER CHIUDERE, nominata dal brief e facile
// da riaprire: contare «quelli ancora liberi» invece di «tutti». Un ordine
// costruito sui soli giocatori non ancora venduti si accorcia a ogni acquisto,
// le fasce si ricompongono, e il «valore assoluto» comincia a salire durante la
// serata — cioè diventa un valore relativo con l'etichetta sbagliata. La
// sequenza qui sotto compra proprio i giocatori davanti al chiamato, che è il
// modo più diretto di far scattare quel difetto.
//
// Tutto sintetico: nomi `Attaccante NN`, club inventati, punteggi scelti a mano
// per rendere l'ordine leggibile. Nessun dato reale.

const RECIPE = "APPEAL-INDEX-RECIPE@0.0.0-sintetica";
const QUALITY = "sperimentale — fixture sintetica, non validato";
const TEAMS = ["Io", "Sq2", "Sq3", "Sq4", "Sq5", "Sq6", "Sq7", "Sq8"];
const TS = "2026-08-01T12:00:00Z";

/** I target dichiarati da Pico per questo scenario: A = 140 su 7 slot = 20 cr. */
const TARGETS = { P: 20, D: 180, C: 160, A: 140 } as const;

function row(name: string, role: Role, score: number): ListonePlayer {
  return {
    name,
    role,
    club: "ClubUno",
    quotation: 10,
    appealIndex: { score, quality: QUALITY, recipe: RECIPE, components: { appetibilitaBase: score } },
  };
}

/** Trenta attaccanti in ordine decrescente: `Attaccante 01` è il migliore. */
const POOL: readonly ListonePlayer[] = Array.from({ length: 30 }, (_, i) =>
  row(`Attaccante ${String(i + 1).padStart(2, "0")}`, "A", 100 - i),
);

const CALLED = POOL[20]!; // terza fascia con otto squadre al tavolo

function purchase(seq: number, player: ListonePlayer, team: string, price: number): AuctionEvent {
  return {
    type: "PURCHASE",
    seq,
    ts: TS,
    playerId: listonePlayerKey(player),
    role: player.role,
    fantaTeamId: team,
    price,
  };
}

/** La lettura come l'app la monta: listone → libro → valore assoluto. */
function readingAfter(log: readonly AuctionEvent[]): AbsoluteValueReading {
  const state = reduce(log, TEAMS);
  const outcome = buildTierBook(POOL, "remote", state);
  expect(outcome.kind).toBe("book");
  return absoluteValueReading({
    called: { playerId: listonePlayerKey(CALLED), role: CALLED.role },
    roleTargets: TARGETS,
    book: outcome.kind === "book" ? outcome.book : null,
    legs: NO_LEG_INPUTS,
  });
}

describe("il valore assoluto è ASSOLUTO: non si muove durante la serata", () => {
  it("la stessa lettura prima e dopo una sequenza di acquisti costruita col motore vero", () => {
    const before = readingAfter([]);
    expect(before.kind).toBe("valore");

    // Una sequenza che tocca proprio ciò che potrebbe muovere una fascia: i
    // giocatori DAVANTI al chiamato, comprati da squadre diverse, più uno
    // dietro di lui. Diciotto acquisti su trenta righe.
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 0; i < 18; i += 1) {
      const player = POOL[i]!;
      seq += 1;
      log.push(purchase(seq, player, TEAMS[i % TEAMS.length]!, 5 + (i % 7)));
    }

    // Passo per passo, non solo agli estremi: un numero che si muove e poi
    // torna indietro passerebbe un confronto fra il primo e l'ultimo stato.
    for (let cut = 1; cut <= log.length; cut += 1) {
      const during = readingAfter(log.slice(0, cut));
      expect(during, `dopo ${cut} acquisti`).toEqual(before);
    }

    // E anche dopo un VOID, che è l'altra direzione in cui il log si muove.
    const withVoid: AuctionEvent[] = [...log, { type: "VOID", seq: seq + 1, ts: TS, targetSeq: 3 }];
    expect(readingAfter(withVoid)).toEqual(before);
  });

  it("il numero è la quota di uno slot del ruolo, e resta quella per tutta la sera", () => {
    const reading = readingAfter([]);
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    expect(reading.credits).toBe(TARGETS.A / ROSTER_REQUIREMENTS.A);
    expect(reading.chain.tier).toBe(3);
  });

  it("nemmeno il MIO budget lo muove: comprando io tutto il reparto il numero è lo stesso", () => {
    const before = readingAfter([]);
    const log: AuctionEvent[] = POOL.slice(0, 6).map((p, i) =>
      purchase(i + 1, p, "Io", 40 + i),
    );
    expect(readingAfter(log)).toEqual(before);
  });
});

describe("le copie di vocabolario non possono divergere in silenzio", () => {
  it("il vocabolario della concorrenza del motore è quello delle schede, parola per parola", () => {
    // Il motore non può importare da `src/`, quindi la lista vive in due posti.
    // Due liste che divergono senza accorgersene sono il difetto che una copia
    // introduce: questo confronto è il modo di non averlo.
    expect([...CONCORRENZA_VOCABULARY]).toEqual([...TITOLARITA_VALUES]);
  });

  it("il fondo scala della pagella resta CALCOLATO, e arriva al motore iniettato", () => {
    expect(PAGELLA_TOTALE_MAX).toBe(PAGELLA_ASSI * PAGELLA_VOTO_MAX);
    // Iniettato e non cablato: la stessa costante entra come `totaleMax`, e il
    // numero che ne esce cambia se il fondo scala cambia — che è esattamente
    // ciò che un `50` scritto a mano nel motore impedirebbe.
    const reading = absoluteValueReading({
      called: { playerId: listonePlayerKey(CALLED), role: "A" },
      roleTargets: TARGETS,
      book: (() => {
        const outcome = buildTierBook(POOL, "remote", reduce([], TEAMS));
        return outcome.kind === "book" ? outcome.book : null;
      })(),
      legs: { ...NO_LEG_INPUTS, pagella: { totale: 25, totaleMax: PAGELLA_TOTALE_MAX } },
      deltas: { ...ABSOLUTE_VALUE_DELTAS, pagella: 10 },
    });
    expect(reading.kind === "valore" && reading.credits).toBe(
      TARGETS.A / ROSTER_REQUIREMENTS.A + 10 * (25 / PAGELLA_TOTALE_MAX),
    );
  });
});
