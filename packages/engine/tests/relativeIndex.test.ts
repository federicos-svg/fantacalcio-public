// L'INDICE RELATIVO — che il numero sia DAVVERO «dove sta adesso fra quelli
// che si possono ancora prendere», e che non ci sia nessun peso dentro.
//
// COSA MISURA QUESTO FILE, e perché ogni famiglia serve da sola:
//
//  1. LA DEFINIZIONE DI PICO, letta come test: quando quelli sopra di lui
//     vengono presi il numero SALE, e quando viene preso qualcuno che non lo
//     tocca il numero NON si muove. Sono le due metà della stessa affermazione
//     e una sola delle due non prova niente — un numero che si muove sempre e
//     un numero che non si muove mai la superano entrambe a metà;
//  2. IL CONFRONTO CON UN CONTATORE INDIPENDENTE, rifatto a mano nel test su
//     una sequenza deterministica di acquisti: è la sonda che nessun
//     coefficiente può attraversare. Un `× 0,7` da qualsiasi parte fa rosso
//     qui, e fa rosso col numero sbagliato stampato accanto;
//  3. I QUATTRO «NON LO SO» che restano distinti, e la popolazione misurata
//     che viaggia anche quando la posizione non c'è;
//  4. LE LETTURE APERTE, pinnate: documentate, non approvate.
//
// Ogni riga è sintetica: identificatori `a_*`/`c_*`, ordini scritti a mano per
// essere leggibili a occhio. Nessun dato reale, nessun punteggio di nessuno.

import { describe, it, expect } from "vitest";
import {
  RELATIVE_INDEX_UNRATIFIED_CHOICES,
  UNRATIFIED_CHOICES,
  freeLadder,
  relativeIndexReading,
  tierBook,
  type AuctionEvent,
  type FreeLadder,
  type RelativeIndexPoolRow,
  type Role,
  type TierBook,
} from "../src/index.js";
import { APPEAL_ORDER_TIE_BREAK } from "../src/tiers.js";
import { TEAMS, buildLog, buy, stateOf } from "./layer2Fixtures.js";

const SELF = TEAMS[0]!;

/** Dieci attaccanti in ordine dichiarato, dal migliore al peggiore, più due
 *  centrocampisti: il secondo ruolo esiste per provare che un acquisto FUORI
 *  ruolo non tocca il numero. */
const ATTACKERS = ["a_01", "a_02", "a_03", "a_04", "a_05", "a_06", "a_07", "a_08", "a_09", "a_10"];
const MIDFIELDERS = ["c_01", "c_02"];

/** Una riga di listone in più che l'ordine NON contiene: senza verdetto
 *  dell'indice, quindi fuori dall'ordinamento ma dentro il listone. */
const UNRANKED = "a_muto";

const POOL: readonly RelativeIndexPoolRow[] = [
  ...ATTACKERS.map((playerId) => ({ playerId, role: "A" as Role })),
  { playerId: UNRANKED, role: "A" as Role },
  ...MIDFIELDERS.map((playerId) => ({ playerId, role: "C" as Role })),
];

const BOOK: TierBook = tierBook(
  {
    provenance: {
      source: "ordine sintetico di test",
      recipe: "APPEAL-INDEX-RECIPE@0.0.0-sintetica",
      tieBreak: APPEAL_ORDER_TIE_BREAK,
    },
    roles: [
      { role: "A", playerIds: [...ATTACKERS] },
      { role: "C", playerIds: [...MIDFIELDERS] },
    ],
  },
  { teamsCount: 8 },
);

function ladderOn(log: readonly AuctionEvent[], book: TierBook | null = BOOK): FreeLadder {
  return freeLadder({
    pool: POOL,
    book,
    purchasedPlayerIds: stateOf(log).purchasedPlayerIds,
  });
}

function positionOf(playerId: string, log: readonly AuctionEvent[] = [], role: Role = "A"): number | null {
  const reading = relativeIndexReading({
    called: { playerId, role },
    ladder: ladderOn(log),
    state: stateOf(log),
    selfId: SELF,
  });
  return reading.kind === "posizione" ? reading.position : null;
}

describe("indice relativo — la definizione di Pico, letta come test", () => {
  it("su un tavolo fresco la posizione è quella dell'ordine dichiarato", () => {
    // Nessuno preso: «fra i liberi» e «nell'ordine» coincidono. È la condizione
    // iniziale, e vale la pena fissarla: se qui il numero già divergesse
    // dall'ordine, tutto il resto misurerebbe un altro numero.
    ATTACKERS.forEach((playerId, i) => {
      expect(positionOf(playerId)).toBe(i + 1);
    });
  });

  it("l'esempio testuale: presi TUTTI quelli sopra di lui, diventa il primo", () => {
    // «l'indice assoluto è 75 ma tutti i giocatori in quel ruolo con indice
    // superiore a 75 sono stati presi, allora il suo valore relativo aumenta».
    const log = buildLog(
      ATTACKERS.slice(0, 4).map((playerId, i) => buy(playerId, "A", TEAMS[i + 1]!, 10)),
    );
    expect(positionOf("a_05")).toBe(5);
    expect(positionOf("a_05", log)).toBe(1);
    // E il suo indice ASSOLUTO non c'entra niente: questo modulo non lo legge
    // nemmeno — l'ordine è già dentro il libro.
  });

  it("un acquisto SOPRA di lui muove il numero", () => {
    const log = buildLog([buy("a_02", "A", TEAMS[1]!, 30)]);
    expect(positionOf("a_07")).toBe(7);
    expect(positionOf("a_07", log)).toBe(6);
  });

  it("un acquisto SOTTO di lui NON muove il numero", () => {
    // È la metà che una posizione che si muove sempre non supererebbe.
    const log = buildLog([buy("a_09", "A", TEAMS[1]!, 3)]);
    expect(positionOf("a_07", log)).toBe(positionOf("a_07"));
  });

  it("un acquisto in un ALTRO RUOLO non muove il numero", () => {
    const log = buildLog([buy("c_01", "C", TEAMS[1]!, 40)]);
    expect(positionOf("a_07", log)).toBe(positionOf("a_07"));
  });

  it("un acquisto di chi è fuori dall'ordine non muove il numero di chi è dentro", () => {
    // `a_muto` è nel listone e non nell'ordine: comprarlo cambia la popolazione
    // libera del ruolo, ma non può cambiare «quanti ORDINATI liberi stanno
    // sopra di lui» — e infatti non lo cambia.
    const log = buildLog([buy(UNRANKED, "A", TEAMS[1]!, 5)]);
    expect(positionOf("a_07", log)).toBe(positionOf("a_07"));
    // La popolazione, invece, si accorge: sono le due metà della risposta.
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: ladderOn(log),
      state: stateOf(log),
      selfId: SELF,
    });
    expect(reading.population!.freeInRole).toBe(10);
    expect(reading.population!.poolInRole).toBe(11);
  });

  it("annullare l'acquisto riporta il numero dov'era", () => {
    const bought = buildLog([buy("a_02", "A", TEAMS[1]!, 30)]);
    const undone: AuctionEvent[] = [...bought, { type: "VOID", seq: 1, ts: bought[0]!.ts, targetSeq: 0 }];
    expect(positionOf("a_07", bought)).toBe(6);
    expect(positionOf("a_07", undone)).toBe(7);
  });

  it("una RICONFERMA sopra di lui conta come un acquisto: non è più prendibile", () => {
    const state = stateOf(buildLog([]), [
      { fantaTeamId: TEAMS[1]!, playerId: "a_02", role: "A", price: 18 },
    ]);
    const ladder = freeLadder({ pool: POOL, book: BOOK, purchasedPlayerIds: state.purchasedPlayerIds });
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder,
      state,
      selfId: SELF,
    });
    expect(reading.kind).toBe("posizione");
    if (reading.kind !== "posizione") return;
    expect(reading.position).toBe(6);
  });
});

describe("indice relativo — nessun peso può entrare nel numero", () => {
  /**
   * IL CONTATORE INDIPENDENTE. Rifà a mano, senza toccare il modulo, la sola
   * domanda che il numero pone: quanti giocatori ORDINATI del ruolo, ancora
   * liberi, stanno prima di lui. Se qualcuno introducesse un coefficiente —
   * anche piccolo, anche «innocuo» — i due numeri divergerebbero.
   */
  function referencePosition(playerId: string, taken: ReadonlySet<string>): number {
    let ahead = 0;
    for (const id of ATTACKERS) {
      if (id === playerId) break;
      if (!taken.has(id)) ahead += 1;
    }
    return ahead + 1;
  }

  it("su una sequenza deterministica di acquisti, la posizione È il conteggio", () => {
    // Acquisti pescati con passo fisso: deterministici, e distribuiti sopra e
    // sotto ogni chiamato in esame.
    const order = [3, 0, 7, 1, 9, 5, 2];
    const log: AuctionEvent[] = [];
    const taken = new Set<string>();
    let checked = 0;

    for (let step = 0; step < order.length; step += 1) {
      const target = ATTACKERS[order[step]!]!;
      log.push({
        type: "PURCHASE",
        seq: step,
        ts: "2026-09-03T20:00:00Z",
        playerId: target,
        role: "A",
        fantaTeamId: TEAMS[(step % (TEAMS.length - 1)) + 1]!,
        price: 5 + step,
      });
      taken.add(target);

      const ladder = ladderOn(log);
      const state = stateOf(log);
      for (const playerId of ATTACKERS) {
        const reading = relativeIndexReading({
          called: { playerId, role: "A" },
          ladder,
          state,
          selfId: SELF,
        });
        if (taken.has(playerId)) {
          // Chi è stato preso non ha una posizione «fra quelli che si possono
          // ancora prendere»: è un'assenza, non uno zero e non un rango vecchio.
          expect(reading.kind, `${playerId} @ passo ${step}`).toBe("assente");
          continue;
        }
        expect(reading.kind).toBe("posizione");
        if (reading.kind !== "posizione") continue;
        expect(reading.position, `${playerId} @ passo ${step}`).toBe(
          referencePosition(playerId, taken),
        );
        // Un intero, sempre: un coefficiente frazionario si vedrebbe qui prima
        // ancora che nel confronto.
        expect(Number.isInteger(reading.position)).toBe(true);
        checked += 1;
      }
    }
    // La sequenza deve avere SOSTANZA: senza questa riga il ciclo potrebbe non
    // aver mai confrontato niente e il test sarebbe verde misurando il nulla.
    expect(checked).toBeGreaterThan(20);
  });

  it("«quanti ne ho presi io e quanti gli avversari» sono misurati e NON entrano nel numero", () => {
    // Stessa popolazione libera, due tavoli diversi: nel secondo io ho già
    // riempito quattro slot del ruolo e gli avversari altri due. La posizione è
    // la STESSA, e i due conteggi viaggiano accanto. Se un giorno qualcuno li
    // facesse entrare nel numero, questo test diventerebbe rosso — che è
    // esattamente il punto in cui la decisione deve tornare da Pico.
    const mine = buildLog([
      buy("fill:a:1", "A", SELF, 4),
      buy("fill:a:2", "A", SELF, 4),
      buy("fill:a:3", "A", SELF, 4),
      buy("fill:a:4", "A", SELF, 4),
      buy("fill:a:5", "A", TEAMS[1]!, 4),
      buy("fill:a:6", "A", TEAMS[2]!, 4),
    ]);
    const bare = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    const busy = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: ladderOn(mine),
      state: stateOf(mine),
      selfId: SELF,
    });

    expect(bare.kind).toBe("posizione");
    expect(busy.kind).toBe("posizione");
    if (bare.kind !== "posizione" || busy.kind !== "posizione") return;
    // I riempimenti non sono nel listone, quindi la popolazione libera degli
    // ordinati non cambia: cambia solo chi ha riempito quanti slot.
    expect(busy.position).toBe(bare.position);
    expect(bare.population.takenByMe).toBe(0);
    expect(busy.population.takenByMe).toBe(4);
    expect(busy.population.takenByOpponents).toBe(2);
  });

  it("senza `selfId` «quanti ne ho presi io» è `null`, non 0", () => {
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
    });
    expect(reading.population!.takenByMe).toBeNull();
    // ...e allora TUTTE le squadre sono avversarie: non se ne perde nessuna.
    expect(reading.population!.takenByOpponents).toBe(0);
  });
});

describe("indice relativo — i «non lo so» restano distinti", () => {
  it("nessun chiamato: nessuna posizione e nessuna popolazione", () => {
    const reading = relativeIndexReading({
      called: null,
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "assente", reason: "nessun-chiamato", population: null });
  });

  it("nessun ordine caricato: la popolazione resta misurata", () => {
    const ladder = ladderOn([], null);
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder,
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") return;
    expect(reading.reason).toBe("listone-senza-ordine");
    // LA META' CHE NON HA BISOGNO DELL'INDICE è comunque lì: undici attaccanti
    // nel listone, undici ancora liberi. Un `n/d` che tace anche questo direbbe
    // «non so niente» quando si sa metà.
    expect(reading.population).toMatchObject({ poolInRole: 11, freeInRole: 11 });
  });

  it("ruolo non coperto dall'ordine: motivo suo, non quello del listone", () => {
    const partial = tierBook(
      {
        provenance: {
          source: "ordine sintetico di test",
          recipe: "APPEAL-INDEX-RECIPE@0.0.0-sintetica",
          tieBreak: APPEAL_ORDER_TIE_BREAK,
        },
        roles: [{ role: "C", playerIds: [...MIDFIELDERS] }],
      },
      { teamsCount: 8 },
    );
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: freeLadder({ pool: POOL, book: partial, purchasedPlayerIds: [] }),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "assente", reason: "ruolo-non-ordinato" });
  });

  it("riga senza verdetto: non è ULTIMO, è fuori dall'ordine", () => {
    // Un ultimo posto assegnato a chi non ha punteggio sarebbe un valore
    // inventato — è la stessa regola che `buildRoleAppealOrder` applica di là.
    const reading = relativeIndexReading({
      called: { playerId: UNRANKED, role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "assente", reason: "non-ordinato" });
    expect(reading.population).toMatchObject({ freeInRole: 11 });
  });

  it("già preso: non è più fra quelli che si possono prendere", () => {
    const log = buildLog([buy("a_03", "A", TEAMS[1]!, 22)]);
    const reading = relativeIndexReading({
      called: { playerId: "a_03", role: "A" },
      ladder: ladderOn(log),
      state: stateOf(log),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "assente", reason: "gia-preso" });
    // ...e la popolazione dice comunque quanti ne restano.
    expect(reading.population).toMatchObject({ freeInRole: 10 });
  });

  it("il FONDO ha una posizione come tutti gli altri", () => {
    // Con otto squadre le fasce del ruolo A coprono 7 x 8 = 56 giocatori,
    // quindi nessuno dei dieci di questo laboratorio è fondo. Qui si costruisce
    // un ordine su un tavolo da UNO, dove le fasce sono sette e l'ottavo in poi
    // è fondo: il numero c'è lo stesso, perché Pico dice «tutti quelli con
    // indice superiore», non «tutti quelli di prima fascia».
    const narrow = tierBook(
      {
        provenance: {
          source: "ordine sintetico di test",
          recipe: "APPEAL-INDEX-RECIPE@0.0.0-sintetica",
          tieBreak: APPEAL_ORDER_TIE_BREAK,
        },
        roles: [{ role: "A", playerIds: [...ATTACKERS] }],
      },
      { teamsCount: 1 },
    );
    expect(narrow.byRole.get("A")!.fondo).toContain("a_09");
    const reading = relativeIndexReading({
      called: { playerId: "a_09", role: "A" },
      ladder: freeLadder({ pool: POOL, book: narrow, purchasedPlayerIds: [] }),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "posizione", position: 9 });
  });
});

describe("indice relativo — le letture aperte viaggiano col numero", () => {
  it("ogni posizione porta lo stato di ratifica, e nessuna scelta è firmata", () => {
    const reading = relativeIndexReading({
      called: { playerId: "a_01", role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading.ratification.ratified).toBe(false);
    expect(reading.ratification.unratifiedChoices).toEqual(RELATIVE_INDEX_UNRATIFIED_CHOICES);
    for (const id of RELATIVE_INDEX_UNRATIFIED_CHOICES) {
      expect(UNRATIFIED_CHOICES[id].length).toBeGreaterThan(0);
    }
  });

  it("anche l'assenza le porta: un `n/d` non è meno costruito di un numero", () => {
    const reading = relativeIndexReading({
      called: null,
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading.ratification.unratifiedChoices).toEqual(RELATIVE_INDEX_UNRATIFIED_CHOICES);
  });

  it("PINNA le cinque letture: documentate, non approvate", () => {
    // Questo test non le ratifica e non le difende: le rende impossibili da
    // cambiare in silenzio. Chi ne toglie una, o ne aggiunge una sesta, deve
    // toccare questa riga — e passare da una review.
    expect([...RELATIVE_INDEX_UNRATIFIED_CHOICES]).toEqual([
      "RELATIVE_NUMBER_IS_A_POSITION",
      "RELATIVE_TIES_BY_DECLARED_ORDER",
      "RELATIVE_TAKEN_INCLUDES_CONFIRMED",
      "RELATIVE_ORDER_INCLUDES_FONDO",
      "RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER",
    ]);
  });
});

describe("indice relativo — anti-scope-creep", () => {
  it("la lettura non guadagna campi direttivi né una seconda scala", () => {
    // Insieme di chiavi CHIUSO, come per `TierFacts`: il giorno in cui qui
    // comparisse un `score`, un `band` o un `suggested` sarebbe un altro
    // prodotto, e questo test è il posto in cui la conversazione deve avvenire.
    const reading = relativeIndexReading({
      called: { playerId: "a_01", role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(Object.keys(reading).sort()).toEqual(
      ["freeAhead", "kind", "population", "position", "ratification"].sort(),
    );
    expect(reading.kind).toBe("posizione");
    if (reading.kind !== "posizione") return;
    expect(Object.keys(reading.population).sort()).toEqual(
      [
        "freeInRole",
        "freeRankedInRole",
        "poolInRole",
        "role",
        "takenByMe",
        "takenByOpponents",
      ].sort(),
    );
  });

  it("la scala è totale sui ruoli del regolamento, anche su quelli senza righe", () => {
    // Una voce mancante costringerebbe chi legge a un `?? 0`, cioè al default
    // che tutto questo modulo esiste per non avere.
    const ladder = freeLadder({ pool: POOL, book: BOOK, purchasedPlayerIds: [] });
    expect([...ladder.byRole.keys()].sort()).toEqual(["A", "C", "D", "P"]);
    expect(ladder.byRole.get("P")).toMatchObject({ poolCount: 0, freeCount: 0, ordered: false });
  });
});
