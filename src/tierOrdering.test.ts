import { describe, it, expect } from "vitest";
import {
  APPEAL_ORDER_SOURCE_LABELS,
  buildTierBook,
  tierBandReading,
} from "./tierOrdering.js";
import type { ListonePlayer } from "./ui/listone.js";
import { listonePlayerKey } from "./ui/listone.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { APPEAL_ORDER_TIE_BREAK } from "../packages/engine/src/tiers.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";

// Solo fixture sintetiche: nessun nome, club o punteggio reale — stesso
// vincolo di src/ui/listone.test.ts e di e2e/fixtures/. I punteggi qui sotto
// sono numeri scelti a mano per rendere l'ordine leggibile a occhio, non una
// misura di appetibilità di nessuno.

const RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";
const QUALITY = "sperimentale — fixture, non validato";
const TEAMS = ["Io", "Sq2", "Sq3", "Sq4", "Sq5", "Sq6", "Sq7", "Sq8"];
const TS = "2026-08-01T12:00:00Z";

function row(name: string, role: Role, score: number | null, indexed = true): ListonePlayer {
  return {
    name,
    role,
    club: "ClubUno",
    quotation: 10,
    ...(indexed
      ? {
          appealIndex: {
            score,
            quality: QUALITY,
            recipe: RECIPE,
            components: { appetibilitaBase: score },
          },
        }
      : {}),
  };
}

/** `n` centrocampisti con punteggio decrescente: C-01 è il migliore. */
function midfielders(n: number): ListonePlayer[] {
  const out: ListonePlayer[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push(row(`Centro ${String(i).padStart(2, "0")}`, "C", 100 - i));
  }
  return out;
}

function key(player: ListonePlayer): string {
  return listonePlayerKey(player);
}

function purchase(
  seq: number,
  player: ListonePlayer,
  fantaTeamId: string,
  price: number,
): AuctionEvent {
  return { type: "PURCHASE", seq, ts: TS, playerId: key(player), role: player.role, fantaTeamId, price };
}

function readingOf(
  pool: readonly ListonePlayer[],
  called: ListonePlayer | null,
  log: readonly AuctionEvent[] = [],
) {
  return tierBandReading({
    pool,
    source: "remote",
    state: reduce(log, TEAMS),
    log,
    called: called === null ? null : { playerId: key(called), role: called.role },
    selfId: "Io",
  });
}

// ─── La fascia esiste solo se esiste l'ordine, e l'ordine viene dal dato ─────

describe("il libro delle fasce a partire dal listone caricato", () => {
  it("le prime otto righe di un ruolo sono prima fascia, le otto dopo seconda", () => {
    const pool = midfielders(20);
    const outcome = buildTierBook(pool, "remote", reduce([], TEAMS));
    expect(outcome.kind).toBe("book");
    if (outcome.kind !== "book") return;
    const index = outcome.book.byRole.get("C")!;
    expect(outcome.book.tierSize).toBe(8);
    expect(index.tiers[0]).toEqual(pool.slice(0, 8).map(key));
    expect(index.tiers[1]).toEqual(pool.slice(8, 16).map(key));
    expect(index.tierOf.get(key(pool[8]!))).toBe(2);
  });

  it("la provenienza è COPIATA dal dato: ricetta dalle righe, pareggi dal motore", () => {
    const outcome = buildTierBook(midfielders(3), "remote", reduce([], TEAMS));
    if (outcome.kind !== "book") throw new Error("atteso un libro");
    expect(outcome.book.provenance).toEqual({
      source: APPEAL_ORDER_SOURCE_LABELS.remote,
      recipe: RECIPE,
      tieBreak: APPEAL_ORDER_TIE_BREAK,
    });
    // La ricetta non è scritta qui dentro: cambiandola nelle righe cambia
    // nella provenienza, che è l'unica cosa che rende la fascia tracciabile.
    const other = midfielders(3).map((p) => ({
      ...p,
      appealIndex: { ...p.appealIndex!, recipe: "APPEAL-INDEX-RECIPE@9.9.9" },
    }));
    const outcome2 = buildTierBook(other, "remote", reduce([], TEAMS));
    if (outcome2.kind !== "book") throw new Error("atteso un libro");
    expect(outcome2.book.provenance.recipe).toBe("APPEAL-INDEX-RECIPE@9.9.9");
  });

  it("ogni sorgente del listone ha una provenienza in parole, mai vuota", () => {
    for (const label of Object.values(APPEAL_ORDER_SOURCE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("la larghezza della fascia è il numero di squadre AL TAVOLO, non una costante", () => {
    const teams = [...TEAMS, "Sq9", "Sq10"];
    const outcome = buildTierBook(midfielders(20), "remote", reduce([], teams));
    if (outcome.kind !== "book") throw new Error("atteso un libro");
    expect(outcome.book.tierSize).toBe(10);
    expect(outcome.book.byRole.get("C")!.tiers[0]).toHaveLength(10);
  });

  it("gli id sono quelli dell'event log: stessa chiave, non una seconda ricetta", () => {
    const pool = midfielders(3);
    const outcome = buildTierBook(pool, "remote", reduce([], TEAMS));
    if (outcome.kind !== "book") throw new Error("atteso un libro");
    expect(outcome.book.byRole.get("C")!.order).toEqual(pool.map(listonePlayerKey));
  });
});

// ─── I modi di non sapere, uno per uno ──────────────────────────────────────

describe("quando la fascia non c'è, il motivo è dichiarato e distinto", () => {
  it("nessuna riga caricata ⇒ no-pool", () => {
    const reading = readingOf([], null);
    expect(reading.kind).toBe("no-call");
    const withCall = tierBandReading({
      pool: [],
      source: "none",
      state: reduce([], TEAMS),
      log: [],
      called: { playerId: "x", role: "C" },
      selfId: "Io",
    });
    expect(withCall).toMatchObject({ kind: "unavailable", reason: "no-pool" });
  });

  it("listone SENZA indice di appetibilità ⇒ no-index, e non una fascia dedotta", () => {
    const pool = [row("Centro 01", "C", null, false), row("Centro 02", "C", null, false)];
    const reading = readingOf(pool, pool[0]!);
    expect(reading).toMatchObject({ kind: "unavailable", reason: "no-index" });
    if (reading.kind !== "unavailable") return;
    expect(reading.coverage).toEqual({ poolRows: 2, withVerdict: 0 });
  });

  it("nessun giocatore chiamato ⇒ no-call, prima ancora di guardare il listone", () => {
    expect(readingOf(midfielders(3), null).kind).toBe("no-call");
  });

  it("nessuna squadra al tavolo ⇒ no-table, non una fascia larga zero", () => {
    const pool = midfielders(3);
    const reading = tierBandReading({
      pool,
      source: "remote",
      state: reduce([], []),
      log: [],
      called: { playerId: key(pool[0]!), role: "C" },
      selfId: "Io",
    });
    expect(reading).toMatchObject({ kind: "unavailable", reason: "no-table" });
  });

  it("due ricette nello stesso listone ⇒ mixed-recipe: la provenienza sarebbe indecidibile", () => {
    const pool = midfielders(2);
    const mixed = [
      pool[0]!,
      { ...pool[1]!, appealIndex: { ...pool[1]!.appealIndex!, recipe: "ALTRA-RICETTA@2.0.0" } },
    ];
    const reading = readingOf(mixed, mixed[0]!);
    expect(reading).toMatchObject({ kind: "unavailable", reason: "mixed-recipe" });
    if (reading.kind !== "unavailable") return;
    expect(reading.detail).toContain("ALTRA-RICETTA@2.0.0");
    expect(reading.detail).toContain(RECIPE);
  });

  it("un ordinamento che il motore rifiuta NON esce come eccezione: esce come frase", () => {
    // Due righe con lo stesso nome e lo stesso club producono la stessa
    // `listonePlayerKey`: `tierBook()` lancia su `duplicate-player`. In mezzo
    // a un'asta un lancio non gestito fa sparire la schermata.
    const dup = [row("Centro 01", "C", 90), row("Centro 01", "C", 80)];
    const reading = readingOf(dup, dup[0]!);
    expect(reading).toMatchObject({ kind: "unavailable", reason: "ordering-refused" });
    if (reading.kind !== "unavailable") return;
    expect(reading.detail).toContain("duplicate-player");
  });

  it("riga senza verdetto ⇒ unranked (fuori dall'ordine), non ultima", () => {
    const pool = [row("Centro 01", "C", 90), row("Centro 02", "C", null), row("Centro 03", "C", 70)];
    const reading = readingOf(pool, pool[1]!);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.placement).toEqual({ kind: "unranked", tier: null, position: null });
    expect(reading.coverage).toEqual({ poolRows: 3, withVerdict: 2 });
    // …e l'ordine contiene solo le due righe con verdetto.
    const other = readingOf(pool, pool[2]!);
    if (other.kind !== "facts") throw new Error("attesi dei fatti");
    expect(other.facts.placement).toEqual({ kind: "tier", tier: 1, position: 2 });
  });

  it("ruolo senza righe ⇒ role-not-ordered, che è un'altra cosa da unranked", () => {
    const pool = [...midfielders(3), row("Punta 01", "A", 95)];
    // Il ruolo A ha una riga sola, quindi è ordinato: per ottenere
    // `role-not-ordered` serve un ruolo che nel listone non compare affatto.
    const reading = tierBandReading({
      pool: midfielders(3),
      source: "remote",
      state: reduce([], TEAMS),
      log: [],
      called: { playerId: key(pool[3]!), role: "A" },
      selfId: "Io",
    });
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.placement.kind).toBe("role-not-ordered");
    // La provenienza resta quella del libro: l'ordine esiste, non copre A.
    expect(reading.facts.provenance).not.toBeNull();
  });

  it("oltre l'ultima fascia c'è «fondo», e non una fascia in più", () => {
    // P ha 3 fasce da 8 = 24 posti: il 25° portiere è fondo.
    const pool: ListonePlayer[] = [];
    for (let i = 1; i <= 25; i += 1) pool.push(row(`Porta ${String(i).padStart(2, "0")}`, "P", 100 - i));
    const reading = readingOf(pool, pool[24]!);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.placement).toEqual({ kind: "fondo", tier: null, position: 25 });
    expect(reading.facts.occupancy).toBeNull();
    expect(reading.facts.pricesPaidInTier).toBeNull();
  });
});

// ─── I fatti misurati: quanti ne restano, cosa è stato pagato ────────────────

describe("i fatti della fascia del chiamato", () => {
  const pool = midfielders(20);

  it("porta fascia, posizione, occupazione e provenienza del chiamato", () => {
    const reading = readingOf(pool, pool[8]!);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.placement).toEqual({ kind: "tier", tier: 2, position: 9 });
    expect(reading.facts.tierCount).toBe(9);
    expect(reading.facts.tierSize).toBe(8);
    expect(reading.facts.occupancy).toEqual({
      tier: 2,
      originalSize: 8,
      freeCount: 8,
      takenCount: 0,
    });
    expect(reading.facts.provenance?.recipe).toBe(RECIPE);
  });

  it("i prezzi sono quelli DAVVERO pagati in quella fascia, crescenti", () => {
    const log: AuctionEvent[] = [
      purchase(0, pool[0]!, "Sq2", 90), // prima fascia
      purchase(1, pool[1]!, "Sq3", 61), // prima fascia
      purchase(2, pool[8]!, "Sq4", 30), // seconda fascia: fuori da questo conto
    ];
    const reading = readingOf(pool, pool[2]!, log);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.pricesPaidInTier).toEqual([61, 90]);
    expect(reading.facts.occupancy).toEqual({
      tier: 1,
      originalSize: 8,
      freeCount: 6,
      takenCount: 2,
    });
  });

  it("un acquisto annullato non è mai stato pagato", () => {
    const log: AuctionEvent[] = [
      purchase(0, pool[0]!, "Sq2", 90),
      { type: "VOID", seq: 1, ts: TS, targetSeq: 0 },
    ];
    const reading = readingOf(pool, pool[2]!, log);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.pricesPaidInTier).toEqual([]);
    expect(reading.facts.occupancy!.freeCount).toBe(8);
  });

  it("in fascia e nessuno ha pagato: lista VUOTA, che non è «non lo so»", () => {
    const reading = readingOf(pool, pool[0]!);
    if (reading.kind !== "facts") throw new Error("attesi dei fatti");
    expect(reading.facts.pricesPaidInTier).toEqual([]);
    const fuori = readingOf(pool, pool[0]!);
    expect(fuori.kind).toBe("facts");
  });

  it("è deterministico: stessi ingressi, stessa uscita", () => {
    const log: AuctionEvent[] = [purchase(0, pool[0]!, "Sq2", 90)];
    const a = JSON.stringify(readingOf(pool, pool[2]!, log));
    const b = JSON.stringify(readingOf(pool, pool[2]!, log));
    expect(a).toBe(b);
  });
});

// ─── La guardia: nessun output direttivo esce da questo layer ────────────────

describe("anti-scope-creep — il ponte non aggiunge niente di direttivo", () => {
  it("nessuna chiave direttiva, a nessuna profondità della lettura", () => {
    const pool = midfielders(20);
    const log: AuctionEvent[] = [purchase(0, pool[0]!, "Sq2", 90)];
    const reading = readingOf(pool, pool[2]!, log);
    const banned =
      /value|fair|target|stretch|expect|predict|forecast|probab|recommend|suggest|advice|consig|scor|rank|intensit|priorit|attes|stima|previs/i;
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v !== null && typeof v === "object") {
        for (const k of Object.keys(v as Record<string, unknown>)) {
          keys.push(k);
          walk((v as Record<string, unknown>)[k]);
        }
      }
    };
    walk(reading);
    expect(keys.filter((k) => banned.test(k))).toEqual([]);
  });

  it("il punteggio dell'indice non entra nella lettura: ordina e basta", () => {
    // Il valore dell'indice è dato privato e model-derived: serve a METTERE IN
    // FILA, e la fila è ciò che esce. Se il punteggio arrivasse fino alla
    // lettura, finirebbe a schermo — un numero di modello sulla superficie
    // d'asta, che è esattamente ciò che il gate chiuso vieta.
    const pool = [
      row("Centro 01", "C", 77.25),
      row("Centro 02", "C", 13.5),
      row("Centro 03", "C", 64.125),
    ];
    const serialized = JSON.stringify(readingOf(pool, pool[0]!));
    for (const score of ["77.25", "13.5", "64.125"]) {
      expect({ score, present: serialized.includes(score) }).toEqual({ score, present: false });
    }
  });

  it("aggiunge alla lettura solo la NUMEROSITÀ dell'ordine, che è un conteggio di righe", () => {
    const reading = readingOf(midfielders(3), null);
    expect(reading.kind).toBe("no-call");
    const withFacts = readingOf(midfielders(3), midfielders(3)[0]!);
    if (withFacts.kind !== "facts") throw new Error("attesi dei fatti");
    expect(Object.keys(withFacts).sort()).toEqual(["coverage", "facts", "kind"]);
    expect(Object.keys(withFacts.coverage).sort()).toEqual(["poolRows", "withVerdict"]);
  });
});
