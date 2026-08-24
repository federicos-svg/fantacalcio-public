import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { reduce } from "../../packages/engine/src/reduce.js";
import { hardReserve, maxSafe, warBoardRows } from "../../packages/engine/src/auction.js";
import { budgetPlan } from "../../packages/engine/src/budget.js";
import type { AuctionEvent, TeamState } from "../../packages/engine/src/types.js";
import { FANTA_TEAM_IDS } from "../../packages/engine/fixtures/synthetic.js";
import { roleBudgetPlanHtml } from "./roleBudgetPlan.js";
import { warBoardFullHtml, warBoardMiniHtml } from "./warBoard.js";
import {
  MAX_BID_LABEL,
  MAX_BID_LABEL_LONG,
  MAX_BID_LABEL_LONG_SENTENCE,
  ROLE_MAX_LABEL,
} from "./budgetLabels.js";
import { listonePoolIndex } from "./listone.js";

// I DUE MASSIMI DIVERGONO, E DALLE ETICHETTE SI VEDE QUALE È QUALE.
//
// Buco che questo file chiude: fino a qui nessun test fissava la RELAZIONE fra
// `maxSafe()` (tetto di UNA offerta) e `budgetPlan().perRole[r].maxAllocatable`
// (tetto dell'INTERO reparto r). Ognuna aveva i suoi test aritmetici, separati
// — packages/engine/tests/engine.test.ts, budget.test.ts, warboard.test.ts —
// e a schermo si chiamavano tutte e due «max». Finché il tavolo è fresco i
// numeri sono vicini (473 contro 475/481/481/479) e la confusione non produce
// danno visibile: è a metà asta che si separano, in silenzio.
//
// Qui la divergenza è misurata su uno stato costruito col motore vero (nessun
// TeamState scritto a mano), e subito dopo si verifica che le due cifre
// arrivino a schermo sotto due etichette che non si possono scambiare.
//
// Nessuna aritmetica nuova: questo file legge il motore, non lo ridefinisce.

const TS = "2026-08-01T09:00:00Z";
const TEAM_ID = "psg";

function purchase(seq: number, playerId: string, role: "P" | "D" | "C" | "A", price: number): AuctionEvent {
  return { type: "PURCHASE", seq, ts: TS, playerId, role, fantaTeamId: TEAM_ID, price };
}

/** TeamState reale dopo `log`, letto dal reducer del motore. */
function teamAfter(log: readonly AuctionEvent[]): TeamState {
  return reduce(log, FANTA_TEAM_IDS).teams[TEAM_ID]!;
}

/** L'etichetta che precede immediatamente un numero nel markup reso. */
function labelBefore(html: string, value: number): string | null {
  const match = new RegExp(`<em>([^<]+)</em>${value}(?![0-9])`).exec(html);
  return match?.[1] ?? null;
}

describe("i due massimi divergono appena un reparto ha più di uno slot libero", () => {
  // Un solo acquisto (un attaccante a 60): al reparto D restano tutti e 9 gli
  // slot, quindi è il caso ordinario di metà asta, non un caso limite.
  const team = teamAfter([purchase(0, "A1", "A", 60)]);

  it("lo stato di partenza ha davvero più di uno slot libero nel reparto misurato", () => {
    expect(team.slotsRemaining.D).toBeGreaterThanOrEqual(2);
    expect(team.budgetResidual).toBe(440);
    expect(team.totalSlotsRemaining).toBe(27);
  });

  it("il tetto del reparto è STRUTTURALMENTE maggiore del tetto di una offerta", () => {
    const bid = maxSafe(team, "D");
    const envelope = budgetPlan(team).perRole.D;

    // 440 − hardReserve(27 − 1) = 414 · una sola offerta, tutti gli altri
    // slot obbligatori riservati (compresi gli altri 8 slot di D).
    expect(bid.biddable).toBe(true);
    expect(bid.maxSafe).toBe(414);
    // 440 − hardReserve(27 − 9) = 422 · tutto il reparto D insieme, riservati
    // solo gli slot obbligatori DEGLI ALTRI ruoli.
    expect(envelope.maxAllocatable).toBe(422);

    expect(envelope.maxAllocatable).toBeGreaterThan(bid.maxSafe);
    // La distanza non è un caso: è la riserva degli slot dello stesso reparto
    // che `maxSafe()` tiene da parte e `maxAllocatable` no.
    expect(envelope.maxAllocatable - bid.maxSafe).toBe(hardReserve(team.slotsRemaining.D - 1));
  });

  it("la distanza cresce con gli slot liberi del reparto: 8 crediti oggi, 0 all'ultimo slot", () => {
    // Otto difensori al minimo: al reparto D resta UN solo slot.
    const log: AuctionEvent[] = [];
    for (let i = 1; i <= 8; i++) log.push(purchase(i - 1, `D${i}`, "D", 1));
    const lastSlot = teamAfter(log);

    expect(lastSlot.slotsRemaining.D).toBe(1);
    expect(budgetPlan(lastSlot).perRole.D.maxAllocatable).toBe(maxSafe(lastSlot, "D").maxSafe);
    // È QUESTO il caso che nascondeva il difetto: quando le due grandezze
    // coincidono numericamente sembrano la stessa cosa, e non lo sono.
  });
});

describe("a schermo le due cifre non si possono scambiare", () => {
  const team = teamAfter([purchase(0, "A1", "A", 60)]);
  const bid = maxSafe(team, "D");
  const envelope = budgetPlan(team).perRole.D;
  const rows = warBoardRows(reduce([purchase(0, "A1", "A", 60)], FANTA_TEAM_IDS), TEAM_ID);
  const boardRow = rows.find((r) => r.fantaTeamId === TEAM_ID)!;
  const labels = { [TEAM_ID]: "La mia squadra" };

  const planHtml = roleBudgetPlanHtml(envelope);
  const miniHtml = warBoardMiniHtml([boardRow], labels);
  const fullHtml = warBoardFullHtml([boardRow], labels, listonePoolIndex([]));

  it("nessun numero è sparito: entrambe le cifre sono ancora rese", () => {
    expect(planHtml).toContain(`${envelope.maxAllocatable}`);
    expect(miniHtml).toContain(`${bid.maxSafe}`);
    expect(fullHtml).toContain(`${bid.maxSafe}`);
  });

  it("ogni cifra porta l'etichetta della PROPRIA grandezza, non quella dell'altra", () => {
    expect(labelBefore(planHtml, envelope.maxAllocatable)).toBe(ROLE_MAX_LABEL);
    expect(labelBefore(miniHtml, bid.maxSafe)).toBe(MAX_BID_LABEL);
  });

  it("nessun componente stampa più la sigla nuda «max», che valeva per tutte e due", () => {
    for (const html of [planHtml, miniHtml, fullHtml]) {
      expect(html).not.toContain("<em>max</em>");
      expect(html).not.toContain("<span>max</span>");
    }
  });

  it("il tetto di reparto non compare mai sulla war board, né il max bid nel piano per ruolo", () => {
    expect(planHtml).not.toContain(MAX_BID_LABEL);
    expect(miniHtml).not.toContain(ROLE_MAX_LABEL);
    expect(fullHtml).not.toContain(ROLE_MAX_LABEL);
  });

  it("le due varianti della war board chiamano LO STESSO numero con LO STESSO nome", () => {
    // Prima la MINI diceva «max» e la COMPLETA «max bid», per una cifra sola
    // resa dallo stesso warBoardBidDisplay().
    expect(labelBefore(miniHtml, bid.maxSafe)).toBe(MAX_BID_LABEL);
    expect(fullHtml).toContain(`<span>${MAX_BID_LABEL}</span>`);
  });
});

describe("il vocabolario dei due tetti resta separato", () => {
  it("i due nomi sono diversi e nessuno è contenuto nell'altro", () => {
    expect(MAX_BID_LABEL).not.toBe(ROLE_MAX_LABEL);
    expect(ROLE_MAX_LABEL.includes(MAX_BID_LABEL)).toBe(false);
    expect(MAX_BID_LABEL.includes(ROLE_MAX_LABEL)).toBe(false);
  });

  it("nessuno dei due è la sigla nuda che valeva per entrambe", () => {
    expect(MAX_BID_LABEL).not.toBe("max");
    expect(ROLE_MAX_LABEL).not.toBe("max");
  });

  it("restano contabilità: nessuna parola direttiva nei nomi", () => {
    const DIRECTIVE = /valore|value|fair.?to.?me|target|stretch|consigl|suggeri|prezzo equo/i;
    expect(MAX_BID_LABEL).not.toMatch(DIRECTIVE);
    expect(ROLE_MAX_LABEL).not.toMatch(DIRECTIVE);
  });
});

describe("chi è di chi: due cifre di due squadre diverse restano attribuite", () => {
  // La seconda ambiguità della stessa famiglia: `maxSafe()` viene chiamata con
  // ricette diverse (squadra selezionata nel form / la mia squadra), e due
  // numeri simili uno sopra l'altro possono parlare di DUE SQUADRE DIVERSE.
  // Qui si fissa quel che questa corsia controlla davvero: sulla war board
  // ogni tetto è dentro la cella della sua squadra, col nome della squadra.
  it("ogni cella della striscia porta il nome della squadra e il suo tetto", () => {
    const log: AuctionEvent[] = [purchase(0, "A1", "A", 60)];
    const state = reduce(log, FANTA_TEAM_IDS);
    const rows = warBoardRows(state, TEAM_ID);
    const labels = Object.fromEntries(FANTA_TEAM_IDS.map((id) => [id, `Nome ${id}`]));
    const html = warBoardMiniHtml(rows, labels);

    for (const row of rows) {
      const cell = html.split(`id="war-board-mini-${row.fantaTeamId}"`)[1]?.split("</li>")[0] ?? "";
      expect(cell).toContain(`Nome ${row.fantaTeamId}`);
      expect(cell).toContain(`<em>${MAX_BID_LABEL}</em>${row.maxBid.maxSafe}`);
      expect(cell).toContain(`aria-label="Nome ${row.fantaTeamId}`);
    }

    // La squadra che ha comprato ha un tetto diverso dalle altre: se le celle
    // non fossero attribuite, questa differenza sarebbe illeggibile.
    const buyer = rows.find((r) => r.fantaTeamId === TEAM_ID)!;
    const other = rows.find((r) => r.fantaTeamId !== TEAM_ID)!;
    expect(buyer.maxBid.maxSafe).not.toBe(other.maxBid.maxSafe);
  });
});

// ── #333 §A — L'ELENCO DELLE ECCEZIONI È CHIUSO, E QUESTO LO TIENE CHIUSO ────
//
// src/ui/budgetLabels.ts dichiarava due superfici ancora fuori dal modulo, «da
// allineare quando quei file si toccano»: la metrica «Max bid sicuro» della
// fascia critica e la nota «max per completare la rosa di X» sotto «Prezzo da
// pagare». Erano due delle tre formulazioni che #333 §A conta per una cifra
// sola (`maxSafe()`), e la terza — la sigla nuda «max» — era già rientrata.
//
// Il riordino della schermata d'asta (#331 punti 2-3) ha toccato quei file e
// l'eccezione è rientrata. Un commento che dice «adesso è allineato» invecchia
// in silenzio: queste asserzioni leggono il SORGENTE di src/main.ts e diventano
// rosse se una delle due formulazioni scritte a mano ricompare, o se una nuova
// superficie ne inventa una terza invece di importare la costante.
//
// Perché sul sorgente e non sul DOM: le due superfici sono costruite con
// `document.createElement` dentro `render()`, che questo progetto non monta nei
// test unitari (nessun jsdom/happy-dom configurato). La spazzata e2e le vede
// rese; qui si sorveglia che il TESTO venga dalla costante, che è la proprietà
// che il modulo esiste per garantire.
describe("le eccezioni di budgetLabels.ts sono rientrate, e non possono tornare", () => {
  const MAIN_SRC = readFileSync(fileURLToPath(new URL("../main.ts", import.meta.url)), "utf8");

  it("la nota sotto «Prezzo da pagare» non porta più un nome tutto suo", () => {
    // Il testo reso, non il commento che ne racconta la storia: il commento la
    // cita apposta, quindi la ricerca è sul template che finisce a schermo.
    expect(MAIN_SRC).not.toContain("`max per completare la rosa di ${");
  });

  it("le due superfici della schermata d'asta leggono la costante", () => {
    expect(MAIN_SRC).toContain("${MAX_BID_LABEL_LONG} di ${displayTeamLabel(");
    expect(MAIN_SRC).toContain("<span>${MAX_BID_LABEL_LONG_SENTENCE}</span>");
  });

  it("nessuna delle due formulazioni resta scritta a mano nel markup", () => {
    // La fascia critica stampava «Max bid sicuro» come stringa letterale in due
    // rami (metrica e fallback «stato squadra non disponibile»).
    expect(MAIN_SRC).not.toContain("<span>Max bid sicuro</span>");
  });

  it("la forma con l'iniziale maiuscola è DERIVATA, non una seconda stringa", () => {
    expect(MAX_BID_LABEL_LONG_SENTENCE.toLowerCase()).toBe(MAX_BID_LABEL_LONG);
    expect(MAX_BID_LABEL_LONG_SENTENCE).not.toBe(MAX_BID_LABEL_LONG);
    // E resta lo stesso nome della forma breve, con un aggettivo in più: non
    // un terzo nome per la stessa grandezza.
    expect(MAX_BID_LABEL_LONG.startsWith(MAX_BID_LABEL)).toBe(true);
  });

  it("il tetto di reparto non è entrato nel vocabolario della fascia critica", () => {
    expect(MAX_BID_LABEL_LONG).not.toContain(ROLE_MAX_LABEL);
    expect(MAX_BID_LABEL_LONG_SENTENCE.toLowerCase()).not.toContain(ROLE_MAX_LABEL);
  });
});
