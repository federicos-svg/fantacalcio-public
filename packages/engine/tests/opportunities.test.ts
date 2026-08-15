import { describe, it, expect } from "vitest";
import {
  OPPORTUNITY_DOWNGRADE_WARNING,
  anchorBook,
  dataQualityIndex,
  livePlan,
  measuredInflation,
  nominationWindow,
  opportunityQualityGate,
  opportunityRadar,
  type AuctionEvent,
  type DeclaredDataQuality,
  type OpportunityCandidate,
  type PlayerAnchor,
} from "../src/index.js";
import {
  TEAMS,
  anchor,
  buildLog,
  buy,
  fillRole,
  stateOf,
  type PurchaseSpec,
} from "./layer2Fixtures.js";
import { plan, value, valueBookOf } from "./layer3Fixtures.js";

const SELF = TEAMS[0]!; // new_milf
const RIVAL = TEAMS[1]!;

// ---------------------------------------------------------------------------
// Listino sintetico: attaccanti e un centrocampista ancorati; i valori
// dichiarati sono inventati per il test (mai copiati da un foglio di Owner).
//
// `x1..x5` esistono per una ragione precisa: **scaldare il mercato**. Il gate
// anti-selezione-avversa non promuove un candidato la cui ancora non porta
// nessuna misura (cold start, campione 0), quindi senza cinque acquisti
// ancorati in serata NESSUNA occasione può esistere — ed è il comportamento
// voluto, verificato a parte nello scenario freddo.
// ---------------------------------------------------------------------------
const ANCHORS: PlayerAnchor[] = [
  anchor("a_occ", "A", 30), // 60 dichiarato ⇒ con +20% di inflazione: ancora 36, surplus 24
  anchor("a_pari", "A", 40), // 40 dichiarato ⇒ ancora 48, surplus negativo, fuori radar
  anchor("a_caro", "A", 50), // 20 dichiarato ⇒ ancora 60, surplus negativo, fuori radar
  anchor("a_low", "A", 12), // 20 dichiarato ⇒ ancora 14, surplus 6
  anchor("c_occ", "C", 25), // 45 dichiarato ⇒ ancora 30 (inflaz. complessiva), surplus 15
  anchor("a_muto", "A", 10), // nessun valore dichiarato ⇒ fuori radar
  ...Array.from({ length: 5 }, (_, i) => anchor(`x${i + 1}`, "A", 10)),
];
const BOOK = anchorBook(ANCHORS);

/**
 * Cinque acquisti ancorati a 12 su Qt.A 10 ⇒ inflazione di ruolo A **e**
 * complessiva pari a +20%, campione 5 = `MIN_INFLATION_SAMPLE`. Comprati da
 * rivali diversi, così nessuno riempie il proprio reparto e i miei slot
 * restano intatti.
 */
const WARM = Array.from({ length: 5 }, (_, i) =>
  buy(`x${i + 1}`, "A", TEAMS[i + 1]!, 12),
);
const VALUES = valueBookOf([
  value("a_occ", 60),
  value("a_pari", 40),
  value("a_caro", 20),
  value("a_low", 20),
  value("c_occ", 45),
  value("senza_ancora", 99),
]);
const QUALITY: DeclaredDataQuality[] = [
  { playerId: "a_occ", level: "alta" },
  { playerId: "a_low", level: "media" },
  { playerId: "c_occ", level: "alta", unclearedNews: true },
];
const DECLARED_PLAN = plan({ P: 20, D: 80, C: 140, A: 210 });
const WINDOW = nominationWindow(TEAMS, TEAMS[2]!, SELF);

/** Scenario di default: mercato scaldato dai cinque acquisti ancorati. */
function radarWarm(extra: readonly PurchaseSpec[] = [], quality = QUALITY) {
  return radarOn(buildLog([...WARM, ...extra]), quality);
}

function radarOn(log: readonly AuctionEvent[] = [], quality = QUALITY) {
  const state = stateOf(log);
  return opportunityRadar({
    book: BOOK,
    values: VALUES,
    state,
    inflation: measuredInflation(log, BOOK),
    selfId: SELF,
    plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
    window: WINDOW,
    quality,
  });
}

function ids(candidates: readonly OpportunityCandidate[]): readonly string[] {
  return candidates.map((c) => c.playerId);
}

describe("opportunityRadar — condizioni d'ingresso", () => {
  const radar = radarWarm();

  it("tiene solo i giocatori con surplus positivo, ancora e valore dichiarato", () => {
    // Tutti e tre dentro il piano ⇒ ordinati per surplus: 24, 15, 6.
    expect(ids(radar)).toEqual(["a_occ", "c_occ", "a_low"]);
  });

  it("esclude chi non ha valore dichiarato invece di trattarlo come zero", () => {
    expect(ids(radar)).not.toContain("a_muto");
  });

  it("esclude chi non ha ancora: senza Qt.A non c'è surplus da misurare", () => {
    expect(ids(radar)).not.toContain("senza_ancora");
  });

  it("esclude chi è già stato assegnato", () => {
    const after = radarWarm([buy("a_occ", "A", RIVAL, 31)]);
    expect(ids(after)).not.toContain("a_occ");
    expect(ids(after)).toContain("a_low");
  });

  it("esclude un ruolo che ho già completato: non è più un'occasione per me", () => {
    const full = radarWarm(fillRole(SELF, "C", 9, 1));
    expect(ids(full)).not.toContain("c_occ");
    expect(ids(full)).toContain("a_occ");
  });

  it("esclude ciò che il mio max bid vero non copre", () => {
    // 19 acquisti a 24 più uno a 23 = 479 spesi: restano 21 crediti e 8 slot,
    // quindi maxSafe = 21 − 7 = 14 — esattamente l'ancora corrente di `a_low`.
    const radarBroke = radarWarm([
      ...fillRole(SELF, "P", 3, 24),
      ...fillRole(SELF, "D", 9, 24),
      ...fillRole(SELF, "C", 7, 24),
      buy("fill:tail", "C", SELF, 23),
    ]);
    expect(ids(radarBroke)).not.toContain("a_occ"); // ancora corrente 36 > maxSafe 14
    expect(ids(radarBroke)).toContain("a_low"); // ancora corrente 14 = maxSafe: passa al limite
  });

  it("lancia su un selfId che non è al tavolo", () => {
    const state = stateOf([]);
    expect(() =>
      opportunityRadar({
        book: BOOK,
        values: VALUES,
        state,
        inflation: measuredInflation([], BOOK),
        selfId: "squadra_fantasma",
        plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
        window: WINDOW,
      }),
    ).toThrow(/unknown selfId/);
  });
});

describe("opportunityRadar — controllo anti-selezione-avversa", () => {
  const radar = radarWarm();
  const byId = new Map(radar.map((c) => [c.playerId, c]));

  it("promuove a OCCASIONE solo con etichetta alta E ancora davvero misurata", () => {
    const occ = byId.get("a_occ")!;
    expect(occ.kind).toBe("occasione");
    expect(occ.quality.level).toBe("alta");
    expect(occ.quality.anchorCorrected).toBe(true);
    expect(occ.quality.passes).toBe(true);
    expect(occ.quality.downgradeReasons).toEqual([]);
    expect(occ.warning).toBeNull();
    // La misura che qualifica l'ancora è nel dato, non solo nel gate.
    expect(occ.anchor.coldStart).toBe(false);
    expect(occ.anchor.n).toBeGreaterThan(0);
    expect(occ.anchor.inflationApplied).not.toBeNull();
  });

  it("degrada a segnalazione con etichetta sotto soglia, e porta l'avvertenza", () => {
    const low = byId.get("a_low")!;
    expect(low.kind).toBe("segnalazione");
    expect(low.warning).toBe(OPPORTUNITY_DOWNGRADE_WARNING);
    expect(low.quality.downgradeReasons).toEqual(["quality-below-high"]);
  });

  it("degrada anche con etichetta alta se Owner ha segnalato una notizia non verificata", () => {
    const news = byId.get("c_occ")!;
    expect(news.kind).toBe("segnalazione");
    expect(news.quality.level).toBe("alta");
    expect(news.quality.downgradeReasons).toContain("uncleared-news");
  });

  it("il campione di UN ALTRO ruolo non qualifica: c_occ è C, la misura è su A", () => {
    // `c_occ` è l'illustrazione naturale del punto: i cinque acquisti che
    // scaldano il mercato sono tutti attaccanti, quindi il ruolo C resta a
    // campione 0 e la sua ancora viene corretta dall'inflazione COMPLESSIVA.
    // Corretta sì, qualificata no.
    const news = byId.get("c_occ")!;
    expect(news.anchor.basis).toBe("overall-inflation");
    expect(news.anchor.coldStart).toBe(false);
    expect(news.quality.anchorCorrected).toBe(false);
    expect(news.quality.downgradeReasons).toContain("anchor-not-corrected");
  });

  it("senza etichetta non promuove: un dato non qualificato non diventa occasione", () => {
    const noLabels = radarWarm([], []);
    expect(noLabels.every((c) => c.kind === "segnalazione")).toBe(true);
    expect(noLabels.every((c) => c.quality.downgradeReasons.includes("quality-label-missing"))).toBe(
      true,
    );
  });

  it("nessuna occasione senza motivo, finestra ed etichetta nel dato (acceptance #233)", () => {
    for (const candidate of radar) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
      expect(candidate.reasons[0]!.id).toBe("surplus-vs-current-anchor");
      expect(candidate.window.callsUntilNextTurn).toBe(WINDOW.callsUntilNextTurn);
      expect(typeof candidate.window.eligibleCompetitors).toBe("number");
      if (candidate.kind === "occasione") {
        expect(candidate.quality.level).toBe("alta");
        expect(candidate.quality.passes).toBe(true);
        expect(candidate.quality.anchorCorrected).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Il caso di scarto massimo costruito da una review avversariale: un'ancora
// mai corretta da nessuna misura (Qt.A 3, campione 0, inflazione `null`), un
// valore dichiarato altissimo, un giocatore FUORI dal piano e in fondo alla
// scala del ruolo. Prima della correzione usciva `kind="occasione"` con
// `warning=null`: il badge si accendeva su un surplus di 117 costruito contro
// un numero che nessuna misura aveva mai toccato.
// ---------------------------------------------------------------------------
describe("opportunityRadar — fail-closed sui fatti misurati del candidato", () => {
  const TRAP_BOOK = anchorBook([anchor("trap", "A", 3), anchor("t_alt", "A", 60)]);
  const TRAP_VALUES = valueBookOf([value("trap", 120)]);
  const TRAP_PLAN = plan({ P: 20, D: 80, C: 140, A: 7 });

  function trapRadar(log: readonly AuctionEvent[] = []) {
    const state = stateOf(log);
    return opportunityRadar({
      book: TRAP_BOOK,
      values: TRAP_VALUES,
      state,
      inflation: measuredInflation(log, TRAP_BOOK),
      selfId: SELF,
      plan: livePlan({ team: state.teams[SELF]!, plan: TRAP_PLAN }),
      window: WINDOW,
      quality: [{ playerId: "trap", level: "alta" }],
    });
  }

  it("ancora cold-start con etichetta alta: NON è un'occasione, è una segnalazione", () => {
    const trap = trapRadar().find((c) => c.playerId === "trap")!;
    expect(trap.surplus).toBe(117);
    expect(trap.anchor.coldStart).toBe(true);
    expect(trap.anchor.n).toBe(0);
    expect(trap.anchor.inflationApplied).toBeNull();
    expect(trap.withinRolePlan).toBe(false);
    expect(trap.cliff.shape).toBe("bottom-of-ladder");
    // Il punto della correzione:
    expect(trap.kind).toBe("segnalazione");
    expect(trap.warning).toBe(OPPORTUNITY_DOWNGRADE_WARNING);
    expect(trap.quality.downgradeReasons).toEqual(["anchor-not-corrected"]);
  });

  it("il candidato non sparisce: degrada e porta il perché", () => {
    // Fail-closed non significa cieco. La riga resta visibile con il suo
    // surplus e la sua avvertenza: è Owner a decidere se guardarla.
    expect(trapRadar().map((c) => c.playerId)).toEqual(["trap"]);
  });

  it("cinque difensori pagati non qualificano un attaccante (cross-ruolo, end-to-end)", () => {
    // Lo scenario esatto della review, sul radar vero e non sul solo gate:
    // il tavolo scalda il ruolo D con 5 acquisti ancorati sopra quotazione, il
    // ruolo A resta a campione 0. L'ancora dell'attaccante viene comunque
    // corretta (misura complessiva) — ma il badge OCCASIONE non si accende.
    const book = anchorBook([
      anchor("att", "A", 20),
      ...Array.from({ length: 5 }, (_, i) => anchor(`d${i + 1}`, "D", 10)),
    ]);
    const log = buildLog(
      Array.from({ length: 5 }, (_, i) => buy(`d${i + 1}`, "D", TEAMS[i + 1]!, 15)),
    );
    const state = stateOf(log);
    const [candidate] = opportunityRadar({
      book,
      values: valueBookOf([value("att", 90)]),
      state,
      inflation: measuredInflation(log, book),
      selfId: SELF,
      plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
      window: WINDOW,
      quality: [{ playerId: "att", level: "alta" }],
    });

    // L'inflazione complessiva ESISTE ed è stata applicata: +50% su Qt.A 20.
    expect(candidate!.anchor.basis).toBe("overall-inflation");
    expect(candidate!.anchor.correctedAnchor).toBe(30);
    expect(candidate!.anchor.n).toBe(5);
    // …ma quei 5 campioni sono difensori, e l'attaccante non è misurato.
    expect(candidate!.kind).toBe("segnalazione");
    expect(candidate!.quality.anchorCorrected).toBe(false);
    expect(candidate!.quality.downgradeReasons).toEqual(["anchor-not-corrected"]);
  });

  it("l'intero radar è in segnalazione finché il mercato non ha pagato nulla", () => {
    const cold = radarOn(buildLog([]));
    expect(cold.length).toBeGreaterThan(0);
    expect(cold.every((c) => c.kind === "segnalazione")).toBe(true);
    expect(
      cold.every((c) => c.quality.downgradeReasons.includes("anchor-not-corrected")),
    ).toBe(true);
  });
});

describe("opportunityQualityGate — un solo gate, riusato dalla chiamata", () => {
  /** Un'ancora corretta da una misura reale: il lato «fatti» del gate passa. */
  const CORRECTED = {
    playerId: "x",
    role: "A",
    baseAnchor: 30,
    basis: "role-inflation",
    inflationApplied: 0.2,
    n: 6,
    correctedAnchor: 36,
    coldStart: false,
  } as const;

  it("cumula i motivi di declassamento invece di fermarsi al primo", () => {
    const gate = opportunityQualityGate(
      "x",
      dataQualityIndex([{ playerId: "x", level: "bassa", unclearedNews: true }]),
      CORRECTED,
    );
    expect(gate.passes).toBe(false);
    expect(gate.downgradeReasons).toEqual(["quality-below-high", "uncleared-news"]);
  });

  it("l'ultima dichiarazione per un giocatore vince", () => {
    const index = dataQualityIndex([
      { playerId: "x", level: "bassa" },
      { playerId: "x", level: "alta" },
    ]);
    expect(opportunityQualityGate("x", index, CORRECTED).passes).toBe(true);
  });

  it("porta lo stato di ratifica delle due scelte aperte del gate", () => {
    const gate = opportunityQualityGate("x", dataQualityIndex([]), CORRECTED);
    expect(gate.ratification.ratified).toBe(false);
    expect(gate.ratification.unratifiedChoices).toEqual([
      "OPPORTUNITY_MIN_QUALITY",
      "ANCHOR_QUALIFICATION_REQUIRES_ROLE_SAMPLE",
    ]);
  });

  it("l'inflazione COMPLESSIVA corregge ma non qualifica (cross-ruolo)", () => {
    // Il caso della review: cinque acquisti ancorati nel ruolo D scaldano la
    // misura complessiva; l'ancora di un attaccante viene corretta con quella
    // (`basis = "overall-inflation"`, cascata dichiarata di anchors.ts) mentre
    // il ruolo A resta a campione 0. Il tavolo ha pagato difensori: non
    // qualifica un attaccante.
    const crossRole = { ...CORRECTED, basis: "overall-inflation" as const };
    const gate = opportunityQualityGate(
      "x",
      dataQualityIndex([{ playerId: "x", level: "alta" }]),
      crossRole,
    );
    expect(gate.anchorCorrected).toBe(false);
    expect(gate.passes).toBe(false);
    expect(gate.downgradeReasons).toEqual(["anchor-not-corrected"]);
  });

  it("fail-closed senza ancora: nessuna misura, nessuna promozione", () => {
    const gate = opportunityQualityGate(
      "x",
      dataQualityIndex([{ playerId: "x", level: "alta" }]),
      null,
    );
    expect(gate.anchorCorrected).toBe(false);
    expect(gate.passes).toBe(false);
    expect(gate.downgradeReasons).toEqual(["anchor-not-corrected"]);
  });

  it.each([
    ["cold start", { ...CORRECTED, coldStart: true }],
    ["base di correzione assente", { ...CORRECTED, basis: "none" as const }],
    ["inflazione non applicata", { ...CORRECTED, inflationApplied: null }],
    ["campione vuoto", { ...CORRECTED, n: 0 }],
  ])("declassa con %s: l'ancora non porta nessuna misura di mercato", (_label, anchor) => {
    const gate = opportunityQualityGate(
      "x",
      dataQualityIndex([{ playerId: "x", level: "alta" }]),
      anchor,
    );
    expect(gate.anchorCorrected).toBe(false);
    expect(gate.passes).toBe(false);
    expect(gate.downgradeReasons).toContain("anchor-not-corrected");
  });
});

describe("opportunityRadar — motivo, finestra e surplus", () => {
  const radar = radarWarm();
  const occ = radar.find((c) => c.playerId === "a_occ")!;

  it("misura il surplus sull'ancora CORRENTE, non sulla Qt.A nuda", () => {
    // Qt.A 30, inflazione di ruolo misurata +20% ⇒ ancora corrente 36.
    expect(occ.anchor.baseAnchor).toBe(30);
    expect(occ.anchor.correctedAnchor).toBe(36);
    expect(occ.surplus).toBe(60 - 36);
  });

  it("dichiara nel motivo la base di correzione dell'ancora e il suo campione", () => {
    const reason = occ.reasons.find((r) => r.id === "anchor-corrected-by-inflation")!;
    expect(reason.value).toBeCloseTo(0.2, 10);
    expect(reason.n).toBe(5);
  });

  it("senza inflazione misurata l'ancora resta la Qt.A nuda, e si dichiara", () => {
    const cold = radarOn(buildLog([])).find((c) => c.playerId === "a_occ")!;
    expect(cold.anchor.coldStart).toBe(true);
    expect(cold.anchor.correctedAnchor).toBe(30);
    const reason = cold.reasons.find((r) => r.id === "anchor-corrected-by-inflation")!;
    expect(reason.value).toBeNull();
    expect(reason.n).toBeNull();
  });

  it("l'inflazione misurata sposta l'ancora e quindi il surplus", () => {
    const cold = radarOn(buildLog([])).find((c) => c.playerId === "a_occ")!;
    expect(occ.anchor.correctedAnchor).toBeGreaterThan(cold.anchor.correctedAnchor);
    expect(occ.surplus).toBeLessThan(cold.surplus);
  });

  it("la finestra porta due fatti: chiamate al mio turno e rivali eleggibili", () => {
    expect(occ.window.nominatorsBefore).toEqual(WINDOW.nominatorsBefore);
    expect(occ.window.atRisk).toBe(occ.window.eligibleCompetitors > 0);
  });

  it("segnala il cliff nel motivo quando dopo di lui la scala salta", () => {
    const withCliff = radarWarm().find((c) => c.playerId === "c_occ")!;
    // c_occ è l'unico centrocampista ancorato: dopo di lui non resta nessuno.
    expect(withCliff.cliff.shape).toBe("last-of-role");
    expect(withCliff.reasons.some((r) => r.id === "cliff-after")).toBe(true);
  });
});

describe("opportunityRadar — ordinamento dichiarato", () => {
  it("dentro il piano prima, poi surplus decrescente", () => {
    const radar = radarWarm();
    const inPlan = radar.filter((c) => c.withinRolePlan).map((c) => c.playerId);
    const outOfPlan = radar.filter((c) => !c.withinRolePlan).map((c) => c.playerId);
    expect(ids(radar)).toEqual([...inPlan, ...outOfPlan]);
    const surpluses = radar.filter((c) => c.withinRolePlan).map((c) => c.surplus);
    expect([...surpluses].sort((a, b) => b - a)).toEqual(surpluses);
  });

  it("è deterministico: stesso stato, stessa lista nello stesso ordine", () => {
    expect(radarWarm()).toEqual(radarWarm());
  });

  it("non tronca: la quantità di righe è una scelta della vista", () => {
    expect(radarWarm()).toHaveLength(3);
  });
});
