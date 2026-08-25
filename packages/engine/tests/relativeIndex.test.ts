// L'INDICE RELATIVO — che il punteggio sia DAVVERO «la quota degli altri liberi
// ordinati che precede», e che non ci sia nessun peso nuovo dentro.
//
// COSA MISURA QUESTO FILE, e perché ogni famiglia serve da sola:
//
//  1. LA FORMA DECISA DA PICO, letta come test: 0 e 100 sono i due capi e li
//     tocca davvero qualcuno; il numero SALE quando quelli sopra vengono presi
//     e SCENDE quando ne viene preso uno sotto. Le due metà insieme, perché un
//     numero che si muove sempre e uno che non si muove mai le superano
//     entrambe a metà;
//  2. IL CONFRONTO CON UN CALCOLO INDIPENDENTE, rifatto a mano nel test su una
//     sequenza deterministica di acquisti: è la sonda che nessun coefficiente
//     può attraversare. Un `× 0,7` da qualsiasi parte fa rosso qui, e fa rosso
//     col numero sbagliato stampato accanto;
//  3. L'IDENTITÀ SU CUI POGGIA LA SCELTA DELLA FORMA: che «riscalare il rango
//     linearmente su 0–100» e «la quota degli altri che precede» siano la
//     stessa funzione non è una promessa dell'intestazione, è un test;
//  4. I SEI «NON LO SO» che restano distinti — il caso limite dell'unico libero
//     ordinato compreso — e la popolazione misurata che viaggia anche quando il
//     punteggio non c'è;
//  5. LE LETTURE APERTE, pinnate: documentate, non approvate.
//
// LE ASSERZIONI SULLA POSIZIONE NON SONO STATE TOLTE: sono INVERTITE, con la
// ragione e la data accanto. Fino al 2026-08-24 questo modulo produceva una
// POSIZIONE (`3º su 41`); quel giorno Pico ha deciso un punteggio da 0 a 100
// (`docs/DECISIONS.md` §"Lo slot 2 è un punteggio da 0 a 100"). Dove la forma
// nuova si comporta in modo diverso da quella vecchia — e in un punto lo fa —
// il test lo dice esplicitamente invece di sparire.
//
// Ogni riga è sintetica: identificatori `a_*`/`c_*`, ordini scritti a mano per
// essere leggibili a occhio. Nessun dato reale, nessun punteggio di nessuno.

import { describe, it, expect } from "vitest";
import {
  RELATIVE_INDEX_UNRATIFIED_CHOICES,
  RELATIVE_SCORE_MAX,
  RELATIVE_SCORE_MIN,
  UNRATIFIED_CHOICES,
  buildRoleAppealOrder,
  freeLadder,
  relativeIndexReading,
  tierBook,
  type AuctionEvent,
  type FreeLadder,
  type FreeLadderRole,
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

const PROVENANCE = {
  source: "ordine sintetico di test",
  recipe: "APPEAL-INDEX-RECIPE@0.0.0-sintetica",
  tieBreak: APPEAL_ORDER_TIE_BREAK,
};

const BOOK: TierBook = tierBook(
  {
    provenance: PROVENANCE,
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

function scoreOf(playerId: string, log: readonly AuctionEvent[] = [], role: Role = "A"): number | null {
  const reading = relativeIndexReading({
    called: { playerId, role },
    ladder: ladderOn(log),
    state: stateOf(log),
    selfId: SELF,
  });
  return reading.kind === "punteggio" ? reading.score : null;
}

/** Il punteggio atteso, scritto come lo scrive il record: 100 sul migliore, 0
 *  sull'ultimo, e in mezzo la quota degli ALTRI che precede. */
function expectedScore(rank: number, freeRanked: number): number {
  return (100 * (freeRanked - rank)) / (freeRanked - 1);
}

describe("indice relativo — la forma decisa da Pico: un punteggio da 0 a 100", () => {
  it("su un tavolo fresco i due capi della scala li tocca qualcuno davvero", () => {
    // «Un punteggio da 0 a 100» non è una promessa se nessuno arriva ai capi:
    // il migliore libero prende 100, l'ultimo libero 0, e in mezzo la scala si
    // apre tutta. Una forma che non tocca gli estremi userebbe un'altra scala.
    expect(scoreOf("a_01")).toBe(RELATIVE_SCORE_MAX);
    expect(scoreOf("a_10")).toBe(RELATIVE_SCORE_MIN);
    ATTACKERS.forEach((playerId, i) => {
      expect(scoreOf(playerId), playerId).toBeCloseTo(expectedScore(i + 1, 10), 12);
    });
  });

  it("presi TUTTI quelli sopra di lui, arriva a 100", () => {
    // È il fatto che il record del 2026-08-24 chiama «la posizione fra i
    // giocatori ancora liberi»: quando quelli sopra spariscono, il numero sale.
    const log = buildLog(
      ATTACKERS.slice(0, 4).map((playerId, i) => buy(playerId, "A", TEAMS[i + 1]!, 10)),
    );
    expect(scoreOf("a_05")).toBeCloseTo(expectedScore(5, 10), 12);
    expect(scoreOf("a_05", log)).toBe(RELATIVE_SCORE_MAX);
  });

  it("un acquisto SOPRA di lui fa salire il numero", () => {
    const log = buildLog([buy("a_02", "A", TEAMS[1]!, 30)]);
    // `a_07` ha tre liberi dietro. Prima erano tre su nove altri (33,3); tolto
    // `a_02`, che gli stava davanti, restano tre su otto altri (37,5): il
    // numeratore non si muove, il denominatore sì. Il conto lo fa
    // `expectedScore`, scritto una volta sola e non copiato a mano.
    expect(scoreOf("a_07")).toBeCloseTo(expectedScore(7, 10), 12);
    expect(scoreOf("a_07", log)).toBeCloseTo(expectedScore(6, 9), 12);
    expect(scoreOf("a_07", log)!).toBeGreaterThan(scoreOf("a_07")!);
  });

  it("un acquisto SOTTO di lui fa SCENDERE il numero — asserzione invertita il 2026-08-24", () => {
    // PRIMA DIRE QUAL È L'ASSERZIONE CHE QUESTA SOSTITUISCE. Finché il numero
    // era una POSIZIONE, questo test asseriva che comprare qualcuno sotto di lui
    // NON lo muoveva, ed era vero: il rango non cambia. Con un punteggio 0–100
    // non è più vero, e non è un difetto della scrittura: è che cosa significa
    // «quota». Di quelli che restano lui ne precede uno in meno, quindi la
    // frazione scende. L'asserzione è invertita, non tolta, perché il
    // comportamento è cambiato per una decisione e chi legge deve trovarla.
    const log = buildLog([buy("a_09", "A", TEAMS[1]!, 3)]);
    expect(scoreOf("a_07")).toBeCloseTo(expectedScore(7, 10), 12);
    expect(scoreOf("a_07", log)).toBeCloseTo(expectedScore(7, 9), 12);
    expect(scoreOf("a_07", log)!).toBeLessThan(scoreOf("a_07")!);
    // ...e il migliore resta a 100: i capi della scala non si muovono, si
    // muove chi sta in mezzo.
    expect(scoreOf("a_01", log)).toBe(RELATIVE_SCORE_MAX);
  });

  it("un acquisto in un ALTRO RUOLO non muove il numero", () => {
    const log = buildLog([buy("c_01", "C", TEAMS[1]!, 40)]);
    expect(scoreOf("a_07", log)).toBe(scoreOf("a_07"));
  });

  it("un acquisto di chi è fuori dall'ordine non muove il numero di chi è dentro", () => {
    // `a_muto` è nel listone e non nell'ordine: comprarlo cambia la popolazione
    // libera del ruolo, ma non può cambiare né quanti ORDINATI liberi stanno
    // sopra di lui né quanti sotto — e infatti non lo cambia. È la prova che il
    // denominatore è `freeRankedInRole` e non `freeInRole`: con quest'ultimo il
    // numero si muoverebbe qui.
    const log = buildLog([buy(UNRANKED, "A", TEAMS[1]!, 5)]);
    expect(scoreOf("a_07", log)).toBe(scoreOf("a_07"));
    // La popolazione, invece, se ne accorge: sono le due metà della risposta.
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: ladderOn(log),
      state: stateOf(log),
      selfId: SELF,
    });
    expect(reading.population!.freeInRole).toBe(10);
    expect(reading.population!.poolInRole).toBe(11);
    expect(reading.population!.freeRankedInRole).toBe(10);
  });

  it("annullare l'acquisto riporta il numero dov'era", () => {
    const bought = buildLog([buy("a_02", "A", TEAMS[1]!, 30)]);
    const undone: AuctionEvent[] = [...bought, { type: "VOID", seq: 1, ts: bought[0]!.ts, targetSeq: 0 }];
    expect(scoreOf("a_07", bought)).toBeCloseTo(expectedScore(6, 9), 12);
    expect(scoreOf("a_07", undone)).toBeCloseTo(expectedScore(7, 10), 12);
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
    expect(reading.kind).toBe("punteggio");
    if (reading.kind !== "punteggio") return;
    expect(reading.score).toBeCloseTo(expectedScore(6, 9), 12);
  });
});

describe("indice relativo — riscalare il rango È la quota: la stessa funzione", () => {
  it("le due scritture coincidono su ogni rango di ogni popolazione fino a 400", () => {
    // LA VERIFICA SU CUI POGGIA LA SCELTA DELLA FORMA, fatta come verifica e non
    // creduta. Pico ha deciso «un punteggio da 0 a 100» senza nominare la curva.
    // Se riscalare un RANGO linearmente su 0–100 è la stessa cosa che prendere
    // la quota degli altri che precede, allora non c'è nessuna curva da
    // scegliere e nessun parametro libero: sono due scritture della stessa
    // funzione. Questo test è quella dimostrazione, eseguita.
    const lineare = (r: number, n: number): number => 100 * (1 - (r - 1) / (n - 1));
    const quota = (r: number, n: number): number => (100 * (n - r)) / (r - 1 + (n - r));
    let confronti = 0;
    let scartoMassimo = 0;
    for (let n = 2; n <= 400; n += 1) {
      for (let r = 1; r <= n; r += 1) {
        scartoMassimo = Math.max(scartoMassimo, Math.abs(lineare(r, n) - quota(r, n)));
        confronti += 1;
      }
    }
    // Uguali a meno dell'errore di rappresentazione: non «vicine», identiche.
    expect(scartoMassimo).toBeLessThan(1e-9);
    // La sonda deve avere SOSTANZA: senza questa riga il ciclo potrebbe non
    // aver confrontato niente e il test sarebbe verde misurando il nulla.
    expect(confronti).toBeGreaterThan(80000);
  });

  it("le altre convenzioni di percentile NON coincidono, e per questo non sono qui", () => {
    // «Percentile» ha più di una convenzione. Quella che coincide col
    // riscalamento lineare del rango è il percent rank INCLUSIVO, `sotto/(n−1)`.
    // `sotto/n` e la convenzione col punto medio danno numeri diversi e in
    // particolare NON toccano il 100 di Pico: dirlo qui impedisce che un domani
    // qualcuno le scambi per equivalenti.
    const n = 41;
    const inclusivo = (r: number): number => (100 * (n - r)) / (n - 1);
    const sottoSuN = (r: number): number => (100 * (n - r)) / n;
    const puntoMedio = (r: number): number => (100 * (n - r + 0.5)) / n;
    expect(inclusivo(1)).toBe(100);
    expect(sottoSuN(1)).not.toBe(100);
    expect(puntoMedio(n)).not.toBe(0);
    expect(inclusivo(3)).toBe(95);
    expect(sottoSuN(3)).not.toBeCloseTo(95, 6);
  });
});

describe("indice relativo — nessun peso nuovo può entrare nel numero", () => {
  /**
   * IL CALCOLO INDIPENDENTE. Rifà a mano, senza toccare il modulo, la sola
   * domanda che il numero pone: quanti giocatori ORDINATI del ruolo, ancora
   * liberi, stanno prima di lui e quanti dopo. Se qualcuno introducesse un
   * coefficiente — anche piccolo, anche «innocuo» — i due numeri divergerebbero.
   */
  function referenceScore(playerId: string, taken: ReadonlySet<string>): number {
    let davanti = 0;
    let dietro = 0;
    let visto = false;
    for (const id of ATTACKERS) {
      if (id === playerId) {
        visto = true;
        continue;
      }
      if (taken.has(id)) continue;
      if (visto) dietro += 1;
      else davanti += 1;
    }
    return (100 * dietro) / (davanti + dietro);
  }

  it("su una sequenza deterministica di acquisti, il punteggio È il rapporto fra i due conteggi", () => {
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
          // Chi è stato preso non ha un punteggio «fra quelli che si possono
          // ancora prendere»: è un'assenza, non uno zero e non un numero vecchio.
          expect(reading.kind, `${playerId} @ passo ${step}`).toBe("assente");
          continue;
        }
        expect(reading.kind).toBe("punteggio");
        if (reading.kind !== "punteggio") continue;
        expect(reading.score, `${playerId} @ passo ${step}`).toBeCloseTo(
          referenceScore(playerId, taken),
          12,
        );
        // Dentro la scala che Pico ha nominato, sempre. Un coefficiente
        // moltiplicativo sfonderebbe questo controllo prima ancora del confronto.
        expect(reading.score).toBeGreaterThanOrEqual(RELATIVE_SCORE_MIN);
        expect(reading.score).toBeLessThanOrEqual(RELATIVE_SCORE_MAX);
        // I due conteggi nudi viaggiano col numero e lo ricostruiscono: se il
        // punteggio smettesse di essere il loro rapporto, sarebbe visibile qui.
        expect((100 * reading.freeBehind) / (reading.freeAhead + reading.freeBehind)).toBeCloseTo(
          reading.score,
          12,
        );
        checked += 1;
      }
    }
    // La sequenza deve avere SOSTANZA: senza questa riga il ciclo potrebbe non
    // aver mai confrontato niente e il test sarebbe verde misurando il nulla.
    expect(checked).toBeGreaterThan(20);
  });

  it("«quanti ne ho presi io e quanti gli avversari» sono misurati e NON entrano nel numero", () => {
    // Stessa popolazione libera, due tavoli diversi: nel secondo io ho già
    // riempito quattro slot del ruolo e gli avversari altri due. Il punteggio è
    // lo STESSO, e i due conteggi viaggiano accanto. Se un giorno qualcuno li
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

    expect(bare.kind).toBe("punteggio");
    expect(busy.kind).toBe("punteggio");
    if (bare.kind !== "punteggio" || busy.kind !== "punteggio") return;
    // I riempimenti non sono nel listone, quindi la popolazione libera degli
    // ordinati non cambia: cambia solo chi ha riempito quanti slot.
    expect(busy.score).toBe(bare.score);
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

  it("due giocatori a PARI PUNTEGGIO ricevono due numeri diversi: il tie-break li separa", () => {
    // LA LETTURA APERTA `RELATIVE_TIES_BY_DECLARED_ORDER`, provata invece che
    // solo dichiarata. «Sopra di lui» è letto sull'ordine di `TierBook`, che
    // rompe i pareggi con `APPEAL_ORDER_TIE_BREAK`; un confronto nudo sui
    // punteggi darebbe lo STESSO numero a due giocatori con lo stesso score.
    // Qui i tre in mezzo hanno esattamente lo stesso punteggio, e il numero che
    // esce è diverso per ognuno — che è la conseguenza di prodotto della
    // lettura: due schede identiche mostrano due numeri.
    const order = buildRoleAppealOrder("A", [
      { playerId: "a_alto", score: 90 },
      { playerId: "a_pari_c", score: 70 },
      { playerId: "a_pari_a", score: 70 },
      { playerId: "a_pari_b", score: 70 },
      { playerId: "a_basso", score: 10 },
    ]);
    // Il tie-break è l'identificatore, quindi i tre pari finiscono in ordine
    // alfabetico fra loro: se cambiasse, questa riga lo direbbe.
    expect(order.playerIds).toEqual(["a_alto", "a_pari_a", "a_pari_b", "a_pari_c", "a_basso"]);

    const pool: RelativeIndexPoolRow[] = order.playerIds.map((playerId) => ({
      playerId,
      role: "A" as Role,
    }));
    const book = tierBook({ provenance: PROVENANCE, roles: [order] }, { teamsCount: 8 });
    const ladder = freeLadder({ pool, book, purchasedPlayerIds: [] });
    const scoreFor = (playerId: string): number => {
      const reading = relativeIndexReading({
        called: { playerId, role: "A" },
        ladder,
        state: stateOf(buildLog([])),
        selfId: SELF,
      });
      if (reading.kind !== "punteggio") throw new Error(`punteggio atteso per ${playerId}`);
      return reading.score;
    };

    const pari = ["a_pari_a", "a_pari_b", "a_pari_c"].map(scoreFor);
    expect(new Set(pari).size).toBe(3);
    expect(pari).toEqual([75, 50, 25]);
    // ...e i capi restano ai capi: il pareggio non li tocca.
    expect(scoreFor("a_alto")).toBe(RELATIVE_SCORE_MAX);
    expect(scoreFor("a_basso")).toBe(RELATIVE_SCORE_MIN);
  });
});

describe("indice relativo — i «non lo so» restano distinti", () => {
  it("nessun chiamato: nessun punteggio e nessuna popolazione", () => {
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
      { provenance: PROVENANCE, roles: [{ role: "C", playerIds: [...MIDFIELDERS] }] },
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

  it("un ruolo che manca del tutto dalla scala non produce zeri, produce `null`", () => {
    // IL RAMO CHE NON SI RAGGIUNGE, e la ragione per cui l'affermazione «nessun
    // `?? 0` e nessun default» può stare nell'intestazione senza qualificazioni.
    // `freeLadder` scrive una voce per ogni ruolo, quindi questa scala si
    // costruisce a mano; se un giorno qualcuno ci rimettesse i `?? 0`, la
    // popolazione tornerebbe piena di zeri e questo test morirebbe.
    const zoppa: FreeLadder = {
      ordered: true,
      byRole: new Map<Role, FreeLadderRole>(),
      taken: new Set<string>(),
    };
    const reading = relativeIndexReading({
      called: { playerId: "a_07", role: "A" },
      ladder: zoppa,
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading).toEqual({
      kind: "assente",
      reason: "ruolo-non-ordinato",
      population: null,
      ratification: { ratified: false, unratifiedChoices: RELATIVE_INDEX_UNRATIFIED_CHOICES },
    });
  });

  it("riga senza verdetto: non è ULTIMO, è fuori dall'ordine", () => {
    // Un ultimo posto assegnato a chi non ha punteggio sarebbe un valore
    // inventato — è la stessa regola che `buildRoleAppealOrder` applica di là —
    // e con la forma nuova sarebbe peggio: uno 0, che è un numero vero.
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

  it("UNICO LIBERO ORDINATO: non è 100 e non è 0, è un'assenza col motivo", () => {
    // IL CASO LIMITE CHIUSO COL MOTIVO. Presi nove attaccanti su dieci, l'ultimo
    // libero ordinato è primo E ultimo: la stessa regola gli imporrebbe 100
    // (nessuno davanti) e 0 (nessuno dietro). Una regola che si contraddice non
    // produce un numero. Il denominatore è zero e il modulo lo dice invece di
    // scegliere uno dei due.
    const log = buildLog(
      ATTACKERS.slice(0, 9).map((playerId, i) => buy(playerId, "A", TEAMS[(i % 7) + 1]!, 5)),
    );
    const reading = relativeIndexReading({
      called: { playerId: "a_10", role: "A" },
      ladder: ladderOn(log),
      state: stateOf(log),
      selfId: SELF,
    });
    expect(reading).toMatchObject({ kind: "assente", reason: "unico-libero-ordinato" });
    // ...e la metà misurabile resta, col conteggio che spiega il motivo: uno.
    expect(reading.population).toMatchObject({ freeRankedInRole: 1, freeInRole: 2 });
    // La riga senza verdetto è ancora libera, e non basta a fare un confronto:
    // è la stessa ragione per cui il denominatore conta gli ORDINATI.
    expect(scoreOf("a_10", log)).toBeNull();
  });

  it("il FONDO ha un punteggio come tutti gli altri", () => {
    // Con otto squadre le fasce del ruolo A coprono 7 x 8 = 56 giocatori,
    // quindi nessuno dei dieci di questo laboratorio è fondo. Qui si costruisce
    // un ordine su un tavolo da UNO, dove le fasce sono sette e l'ottavo in poi
    // è fondo: il numero c'è lo stesso, perché nessun record lega questo numero
    // alle fasce.
    const narrow = tierBook(
      { provenance: PROVENANCE, roles: [{ role: "A", playerIds: [...ATTACKERS] }] },
      { teamsCount: 1 },
    );
    expect(narrow.byRole.get("A")!.fondo).toContain("a_09");
    const reading = relativeIndexReading({
      called: { playerId: "a_09", role: "A" },
      ladder: freeLadder({ pool: POOL, book: narrow, purchasedPlayerIds: [] }),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(reading.kind).toBe("punteggio");
    if (reading.kind !== "punteggio") return;
    expect(reading.score).toBeCloseTo(expectedScore(9, 10), 12);
  });
});

describe("indice relativo — le letture aperte viaggiano col numero", () => {
  it("ogni punteggio porta lo stato di ratifica, e nessuna scelta è firmata", () => {
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

  it("PINNA le otto letture: documentate, non approvate", () => {
    // Questo test non le ratifica e non le difende: le rende impossibili da
    // cambiare in silenzio. Chi ne toglie una, o ne aggiunge una nona, deve
    // toccare questa riga — e passare da una review.
    //
    // `RELATIVE_NUMBER_IS_A_POSITION` non c'è più, e l'assenza è voluta: la
    // scelta che dichiarava — «il numero è una posizione» — è stata SOSTITUITA
    // dalla decisione di Pico del 2026-08-24, non lasciata cadere. Al suo posto
    // ci sono le quattro letture che quella decisione NON nomina.
    expect([...RELATIVE_INDEX_UNRATIFIED_CHOICES]).toEqual([
      "RELATIVE_SCORE_IS_SHARE_OF_FREE_RANKED",
      "RELATIVE_DENOMINATOR_IS_FREE_RANKED",
      "RELATIVE_ONLY_FREE_HAS_NO_SCORE",
      "RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING",
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
    // comparisse un `band`, un `suggested` o una LISTA ordinata sarebbe un altro
    // prodotto — e una lista, in particolare, sfonderebbe il perimetro della
    // quarta deroga stretta. Questo test è il posto in cui la conversazione deve
    // avvenire.
    const reading = relativeIndexReading({
      called: { playerId: "a_01", role: "A" },
      ladder: ladderOn([]),
      state: stateOf([]),
      selfId: SELF,
    });
    expect(Object.keys(reading).sort()).toEqual(
      ["freeAhead", "freeBehind", "kind", "population", "ratification", "score"].sort(),
    );
    expect(reading.kind).toBe("punteggio");
    if (reading.kind !== "punteggio") return;
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
