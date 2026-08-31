// LE PAROLE DELLA RIGA «PER ME» — coperte da test come i numeri.
//
// Nessun DOM qui: questo repository non usa jsdom sotto Vitest, quindi tutta la
// COPIA vive in funzioni pure e il gesto vero — clic, tastiera, tocco — è
// provato da e2e/per-me-row.spec.ts.
//
// LA GUARDIA DI DERIVA. Modello: src/ui/baitRow.test.ts §E14 e
// src/ui/warBoard.test.ts §D9. Una regex su TUTTO il testo del sottoblocco, in
// ogni suo esito, che deve dare ZERO riscontri: nessuna parola che affermi una
// convenienza, un'occasione o una previsione.
//
// LA GUARDIA SI È STRETTA, E NON PER GUSTO. Fino a ieri lasciava passare la
// forma «valore dichiarato» — l'unico modo in cui il blocco poteva nominare un
// valore — attraverso una maschera. Quella maschera NON C'È PIÙ: `V` si scrive
// con la sua sigla e la sua targa («V 42 cr (generatore GEN-RECIPE@1.0.0)»),
// quindi la parola «valore» non compare in nessun esito e la regex può cercarla
// senza eccezioni. Una maschera in meno è un buco in meno.
//
// Fixture sintetiche: nomi «Sintetico …», club «ClubAlfa».

import { describe, expect, it } from "vitest";
import {
  PER_ME_PARAMETERS,
  type PerMeCandidate,
  type PerMeEmptyReason,
  type PerMePlanReading,
  type PerMeReading,
} from "../perMeCandidates.js";
import { BAIT_SELECTED_MARK } from "./baitRow.js";
import {
  PER_ME_NOW_MARK,
  PER_ME_SELECTED_MARK,
  PER_ME_TITLE,
  PER_ME_TITLE_SHORT,
  perMeAnchorText,
  perMeAppealText,
  perMeEmptyText,
  perMeHeadText,
  perMeNoteApplies,
  perMeNoteText,
  perMePlanText,
  perMePriceText,
  perMeScarcityText,
  perMeSectionText,
  perMeValueProvenance,
  perMeValueText,
  perMeWinNowText,
} from "./perMeRow.js";
import { perMeTitleFor } from "./perMeRow.js";
import type { ListonePlayer } from "./listone.js";

const PLAYER: ListonePlayer = { name: "Sintetico Alfa", role: "A", club: "ClubAlfa", quotation: 20 };
const RECIPE = "TEST-GEN-RECIPE@1.0.0";

function candidate(over: Partial<PerMeCandidate> = {}): PerMeCandidate {
  return {
    player: PLAYER,
    playerId: "sintetico-alfa__clubalfa",
    role: "A",
    anchor: {
      playerId: "sintetico-alfa__clubalfa",
      role: "A",
      baseAnchor: 20,
      basis: "role-inflation",
      inflationApplied: 0.2,
      n: 9,
      correctedAnchor: 24,
      coldStart: false,
    },
    value: 42,
    valueSource: "generatore",
    valueRecipe: RECIPE,
    expectedPrice: {
      kind: "prezzo",
      credits: 38,
      uncertainty: {
        errMinus: 4,
        errPlus: 9,
        signedBias: -3,
        biasDirection: "basso",
        n: 24,
      },
      chain: {
        role: "A",
        rank: 5,
        band: { index: 1, rankFirst: 4, rankLast: 8, openEnded: false },
        base: 40,
        poolRatio: 0.9,
        poolRatioReason: null,
        currentPool: 3600,
        meanTrainPool: 4000,
        roleInflation: 0.05,
        inflationBasis: "role-inflation",
        inflationSample: 9,
        appliedFactor: 0.945,
        marketPrice: 38,
        richestRivalMaxBid: 400,
        cappedByRichest: false,
      },
    },
    surplus: 4,
    relativePrice: {
      kind: "prezzo",
      credits: 62,
      chain: {
        role: "A",
        eligibleCount: 5,
        richestMaxBid: 96,
        secondMaxBid: 61,
        rivalScale: 62,
        myMaxSafe: 473,
        boundBy: "scala-dei-rivali",
      },
    },
    cliff: {
      playerId: "sintetico-alfa__clubalfa",
      role: "A",
      anchor: 20,
      playerAvailable: true,
      othersAvailableInRole: 12,
      betterAvailable: 9,
      alternativesAtOrBelow: 3,
      nextAlternativeAnchor: 12,
      gap: 8,
      gapRatio: 0.4,
      shape: "gap-below",
      isCliff: true,
    },
    rivalsWithSlot: 5,
    maxBid: 473,
    withinPlan: true,
    planAllocation: 210,
    planSlotsRemaining: 7,
    planSlotsPlanned: 4,
    flagNow: true,
    appealPosition: 1,
    appealOrderSize: 47,
    ...over,
  };
}

const DYNAMIC_PLAN: PerMePlanReading = {
  kind: "dynamic",
  planVersion: "NOM-DYN@12",
  label: "piano ricalcolato adesso",
  // Il piano intero non serve alle parole: la vista legge etichetta e versione.
  plan: {
    planVersion: "NOM-DYN@12",
    costFloor: 1,
    budget: 500,
    slotsTotal: 28,
    targets: [],
    targetIds: new Set<string>(),
    perRole: {
      P: { role: "P", slotsRemaining: 3, slotsPlanned: 0, slotsAtFloor: 3, plannedSpend: 0, floorSpend: 3, allocation: 3 },
      D: { role: "D", slotsRemaining: 9, slotsPlanned: 0, slotsAtFloor: 9, plannedSpend: 0, floorSpend: 9, allocation: 9 },
      C: { role: "C", slotsRemaining: 9, slotsPlanned: 0, slotsAtFloor: 9, plannedSpend: 0, floorSpend: 9, allocation: 9 },
      A: { role: "A", slotsRemaining: 7, slotsPlanned: 4, slotsAtFloor: 3, plannedSpend: 207, floorSpend: 3, allocation: 210 },
    },
    plannedSpend: 207,
    floorSpend: 24,
    allocated: 231,
    budgetLeft: 269,
    considered: 10,
    skippedByCeiling: 0,
    skippedByRoleFull: 6,
    excluded: 0,
  },
  declaredIssue: null,
  declaredIssueDetail: "",
};

function withCandidates(
  candidates: readonly PerMeCandidate[],
  plan: PerMePlanReading = DYNAMIC_PLAN,
): PerMeReading {
  return {
    kind: "candidates",
    candidates,
    parameters: PER_ME_PARAMETERS,
    evaluated: candidates.length,
    freeInOpenRoles: candidates.length,
    withoutValue: 0,
    withoutSurplus: candidates.filter((c) => c.surplus === null).length,
    withoutAppealPosition: candidates.filter((c) => c.appealPosition === null).length,
    plan,
    basis: "credit-value-expected-price-and-dynamic-plan",
    ratification: {
      ratified: false,
      unratifiedChoices: ["PER_ME_REQUIRES_ANCHOR_SCALE"],
    },
  };
}

function emptyReading(reason: PerMeEmptyReason): PerMeReading {
  return {
    kind: "empty",
    reason,
    detail: "",
    parameters: PER_ME_PARAMETERS,
    evaluated: 0,
    basis: "credit-value-expected-price-and-dynamic-plan",
    ratification: {
      ratified: false,
      unratifiedChoices: ["PER_ME_REQUIRES_ANCHOR_SCALE"],
    },
  };
}

const ALL_REASONS: readonly PerMeEmptyReason[] = [
  "no-pool",
  "no-quotation",
  "anchors-refused",
  "no-forecast",
  "no-open-role",
  "no-free-in-open-roles",
  "no-affordable",
];

describe("il nome del sottoblocco", () => {
  it("il nome corto è il nome INTERO di quello per esteso, non un suo prefisso qualsiasi", () => {
    // `startsWith(PER_ME_TITLE_SHORT)` da solo NON basta, ed è un buco vero:
    // «PER ME ADESSO — …» lo supera pur essendo un ALTRO nome. Il separatore
    // dentro l'asserzione è ciò che chiude il buco.
    expect(PER_ME_TITLE.startsWith(`${PER_ME_TITLE_SHORT} — `)).toBe(true);
    expect(PER_ME_TITLE.length).toBeGreaterThan(PER_ME_TITLE_SHORT.length);
  });

  it("l'occhiello per esteso compare SOLO quando ci sono righe da descrivere", () => {
    expect(perMeTitleFor(withCandidates([candidate()]))).toBe(PER_ME_TITLE);
    for (const reason of ALL_REASONS) {
      expect(perMeTitleFor(emptyReading(reason))).toBe(PER_ME_TITLE_SHORT);
    }
  });

  it("la parola della selezione è LA STESSA dell'altra metà del blocco", () => {
    expect(PER_ME_SELECTED_MARK).toBe(BAIT_SELECTED_MARK);
  });
});

describe("i sette silenzi hanno sette frasi diverse", () => {
  it("nessuna frase è vuota e nessuna è uguale a un'altra", () => {
    const texts = ALL_REASONS.map(perMeEmptyText);
    for (const t of texts) expect(t.length).toBeGreaterThan(20);
    expect(new Set(texts).size).toBe(ALL_REASONS.length);
  });

  it("le tre frasi del piano dichiarato NON esistono più fra i silenzi", () => {
    // Il piano dinamico esiste sempre dove esistono V e prezzo atteso: un
    // pannello vuoto «perché manca una dichiarazione» non è più raggiungibile.
    for (const t of ALL_REASONS.map(perMeEmptyText)) {
      expect(t).not.toContain("piano rosa");
    }
  });

  it("il deposito monco dice CHE COSA manca, e non «non c'è nessuno»", () => {
    const t = perMeEmptyText("no-forecast");
    expect(t).toContain("previsioni");
    expect(t).toContain("storico");
    expect(t).not.toMatch(/\bnessun giocatore\b/);
  });

  it("«non c'è quotazione» non diventa «vale zero»", () => {
    expect(perMeEmptyText("no-quotation")).toContain("Qt.A");
    expect(perMeEmptyText("no-quotation")).not.toMatch(/\b0\b/);
  });

  it("la nota compare solo dove un parametro ha governato qualcosa", () => {
    expect(perMeNoteApplies(withCandidates([candidate()]))).toBe(true);
    expect(perMeNoteApplies(emptyReading("no-affordable"))).toBe(true);
    expect(perMeNoteApplies(emptyReading("no-free-in-open-roles"))).toBe(true);
    for (const reason of ALL_REASONS) {
      if (reason === "no-affordable" || reason === "no-free-in-open-roles") continue;
      expect(perMeNoteApplies(emptyReading(reason))).toBe(false);
    }
  });
});

describe("le righe dicono i fatti con la loro provenienza", () => {
  it("la testa dice chi è", () => {
    expect(perMeHeadText(candidate())).toBe("Sintetico Alfa (A · ClubAlfa)");
  });

  it("V porta la TARGA della ricetta, letta dal dato e non cablata qui", () => {
    expect(perMeValueProvenance(candidate())).toBe(`generatore ${RECIPE}`);
    expect(perMeValueText(candidate())).toContain(`V 42 cr (generatore ${RECIPE})`);
  });

  it("l'override di Pico ha la sua targa, e non quella del generatore", () => {
    const c = candidate({ valueSource: "dichiarato", valueRecipe: null });
    expect(perMeValueProvenance(c)).toBe("dichiarato da te");
    expect(perMeValueText(c)).toContain("V 42 cr (dichiarato da te)");
  });

  it("una previsione senza targa lo DICE, invece di riceverne una inventata", () => {
    expect(perMeValueProvenance(candidate({ valueRecipe: null }))).toBe(
      "generatore, ricetta non dichiarata",
    );
  });

  it("il surplus è la sottrazione, coi due addendi accanto: si rifà a mano", () => {
    expect(perMeValueText(candidate())).toBe(
      `V 42 cr (generatore ${RECIPE}) · S +4 cr (42 − 38)`,
    );
  });

  it("un surplus NEGATIVO si mostra col suo segno, e la riga resta per dirlo", () => {
    const price = candidate().expectedPrice;
    if (price.kind !== "prezzo") throw new Error("la fixture porta un prezzo");
    const c = candidate({ surplus: -8, expectedPrice: { ...price, credits: 50 } });
    expect(perMeValueText(c)).toContain("S −8 cr (42 − 50)");
  });

  it("senza prezzo atteso non c'è surplus, e non c'è uno zero al posto suo", () => {
    const c = candidate({
      surplus: null,
      expectedPrice: { kind: "assente", reason: "fascia-senza-osservazioni" },
    });
    const t = perMeValueText(c);
    expect(t).toBe(`V 42 cr (generatore ${RECIPE})`);
    expect(t).not.toContain("S ");
  });

  it("il prezzo atteso è uno SCALARE coi suoi tre qualificatori, mai una banda", () => {
    expect(perMePriceText(candidate())).toBe(
      "atteso 38 cr · su 24 aste simili · tipicamente −4/+9 · tende a sbagliare basso",
    );
    // «da X a Y» è la forma vietata: non compare.
    expect(perMePriceText(candidate())).not.toMatch(/\bda \d+ a \d+/);
  });

  it("il bias si dice a parole chiuse, non si deduce dal segno", () => {
    const con = (d: "basso" | "alto" | "nessuno"): string => {
      const price = candidate().expectedPrice;
      if (price.kind !== "prezzo") throw new Error("la fixture porta un prezzo");
      return perMePriceText(
        candidate({
          expectedPrice: {
            ...price,
            uncertainty: { ...price.uncertainty, biasDirection: d },
          },
        }),
      );
    };
    expect(con("alto")).toContain("tende a sbagliare alto");
    expect(con("nessuno")).toContain("non tende a sbagliare da un lato");
  });

  it("quando il prezzo atteso non c'è, c'è il MOTIVO e non un numero", () => {
    for (const reason of [
      "curva-assente",
      "previsione-assente",
      "rango-ignoto",
      "fascia-senza-osservazioni",
      "fascia-sotto-campione",
    ] as const) {
      const t = perMePriceText(candidate({ expectedPrice: { kind: "assente", reason } }));
      expect(t).toContain("prezzo atteso non formabile");
      expect(t).not.toMatch(/\d+ cr/);
    }
    // Le cinque frasi sono cinque, non una sola ripetuta.
    const frasi = new Set(
      (
        [
          "curva-assente",
          "previsione-assente",
          "rango-ignoto",
          "fascia-senza-osservazioni",
          "fascia-sotto-campione",
        ] as const
      ).map((reason) => perMePriceText(candidate({ expectedPrice: { kind: "assente", reason } }))),
    );
    expect(frasi.size).toBe(5);
  });

  it("il costo per vincerlo adesso porta il vincolo che l'ha fissato", () => {
    expect(perMeWinNowText(candidate())).toBe("vincerlo adesso 62 cr (scala dei rivali)");
  });

  it("senza secondo max bid non c'è un numero di ripiego: non c'è niente", () => {
    expect(
      perMeWinNowText(
        candidate({ relativePrice: { kind: "assente", reason: "un-solo-rivale-eleggibile" } }),
      ),
    ).toBeNull();
  });

  it("i due fatti di scarsità sono due CONTEGGI, e concordano al singolare", () => {
    expect(perMeScarcityText(candidate())).toBe(
      "3 alternative a scendere nel ruolo · 5 rivali eleggibili con slot",
    );
    const solo = candidate({
      cliff: { ...candidate().cliff, alternativesAtOrBelow: 1 },
      rivalsWithSlot: 1,
    });
    expect(perMeScarcityText(solo)).toBe(
      "1 alternativa a scendere nel ruolo · 1 rivale eleggibile con slot",
    );
  });

  it("la posizione di appetibilità resta un fatto mostrato, con la sua numerosità", () => {
    expect(perMeAppealText(candidate())).toBe("1ª di 47 per appetibilità");
  });

  it("senza verdetto lo dice, e non inventa un numero", () => {
    const text = perMeAppealText(candidate({ appealPosition: null, appealOrderSize: null }));
    expect(text).toBe("senza verdetto di appetibilità");
    expect(text).not.toMatch(/\d/);
  });

  it("l'ancora porta la Qt.A nuda, l'inflazione applicata e il campione", () => {
    expect(perMeAnchorText(candidate())).toBe(
      "ancora 24 cr (Qt.A 20 · inflazione misurata +20% su 9 acquisti del ruolo)",
    );
  });

  it("distingue il campione DEL RUOLO da quello del tavolo", () => {
    expect(
      perMeAnchorText(
        candidate({ anchor: { ...candidate().anchor, basis: "overall-inflation", n: 12 } }),
      ),
    ).toContain("su 12 acquisti del tavolo");
  });

  it("in cold start non c'è un numero al posto della misura che manca", () => {
    const text = perMeAnchorText(
      candidate({
        anchor: {
          ...candidate().anchor,
          basis: "none",
          inflationApplied: null,
          n: 0,
          coldStart: true,
          correctedAnchor: 20,
        },
      }),
    );
    expect(text).toBe("ancora 20 cr (Qt.A 20 · nessuna inflazione misurata)");
    expect(text).not.toContain("%");
  });

  it("il piano dice dentro/fuori, l'allocazione, gli slot, CHI l'ha deciso e il max bid", () => {
    expect(perMePlanText(candidate(), "piano ricalcolato adesso")).toBe(
      "nel piano A (210 cr / 7 slot · piano ricalcolato adesso) · max bid 473 cr",
    );
    expect(perMePlanText(candidate({ withinPlan: false }), "piano dichiarato da te")).toContain(
      "fuori dal piano A",
    );
    expect(perMePlanText(candidate(), "piano dichiarato da te")).toContain(
      "piano dichiarato da te",
    );
  });

  it("il nome del tetto è quello dichiarato una volta sola, non una formulazione propria", () => {
    expect(perMePlanText(candidate(), "piano ricalcolato adesso")).toContain("max bid");
    expect(perMePlanText(candidate(), "piano ricalcolato adesso")).not.toContain("max reparto");
  });

  it("«⚑ adesso» compare solo dove i due fatti valgono insieme", () => {
    const text = perMeSectionText(withCandidates([candidate({ flagNow: true })]));
    expect(text).toContain(PER_ME_NOW_MARK);
    expect(perMeSectionText(withCandidates([candidate({ flagNow: false })]))).not.toContain(
      PER_ME_NOW_MARK,
    );
  });
});

describe("la nota stampa l'ordine, i parametri e le letture non ratificate", () => {
  const note = (): string => perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 0, 0, 0);

  it("l'ordine è scritto per esteso, criterio per criterio", () => {
    expect(note()).toContain(
      "ordine: piano → surplus → alternative a scendere → V → chiave di listone",
    );
  });

  it("la posizione di appetibilità non compare più nell'ordine stampato", () => {
    expect(note()).not.toContain("appetibilità del ruolo");
  });

  it("le due letture non ratificate sono dichiarate a schermo", () => {
    expect(note()).toContain("NON RATIFICATE");
    expect(note()).toContain("la scala delle Qt.A");
    expect(note()).toContain("il piano dichiarato provato sul prezzo atteso");
  });

  it("i parametri sono ispezionabili accanto al numero che governano", () => {
    expect(note()).toContain("campione minimo 5 (inflazione) e 5 (fascia di prezzo)");
    expect(note()).toContain("riserva 1 cr per ogni slot non ancora pianificato");
    expect(note()).toContain("3 righe al massimo (ratificato da Pico il 2026-08-31)");
    expect(note()).not.toContain("provvisorio");
  });

  it("l'etichetta e la versione del piano viaggiano con la nota", () => {
    expect(note()).toContain("piano ricalcolato adesso «NOM-DYN@12»");
    const dichiarato: PerMePlanReading = {
      kind: "declared",
      planVersion: "pre-asta 1",
      label: "piano dichiarato da te",
      live: {} as never,
    };
    expect(perMeNoteText(PER_ME_PARAMETERS, dichiarato, 0, 0, 0)).toContain(
      "piano dichiarato da te «pre-asta 1»",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, null, 0, 0, 0)).not.toContain("«");
  });

  it("una dichiarazione di piano rotta si dice, e si dice che comanda il dinamico", () => {
    const monco: PerMePlanReading = { ...DYNAMIC_PLAN, declaredIssue: "plan-incomplete" };
    const rifiutato: PerMePlanReading = { ...DYNAMIC_PLAN, declaredIssue: "plan-invalid" };
    expect(perMeNoteText(PER_ME_PARAMETERS, monco, 0, 0, 0)).toContain("è a metà");
    expect(perMeNoteText(PER_ME_PARAMETERS, rifiutato, 0, 0, 0)).toContain("rifiutata dal motore");
    for (const plan of [monco, rifiutato]) {
      expect(perMeNoteText(PER_ME_PARAMETERS, plan, 0, 0, 0)).toContain(
        "comanda il piano ricalcolato",
      );
    }
    expect(note()).not.toContain("comanda il piano ricalcolato");
  });

  it("i TRE contatori sono tre, e non uno solo che li appiattisce", () => {
    expect(perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 4, 0, 0)).toContain(
      "4 liberi senza V, fuori dalla popolazione",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 1, 0, 0)).toContain("1 libero senza V");
    expect(perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 0, 2, 0)).toContain(
      "2 righe senza prezzo atteso, in fondo senza surplus fabbricato",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 0, 1, 0)).toContain(
      "1 riga senza prezzo atteso",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN, 0, 0, 3)).toContain(
      "3 righe senza verdetto di appetibilità, in fondo senza posizione fabbricata",
    );
    // Ognuno compare SOLO quando ha qualcosa da contare.
    expect(note()).not.toContain("senza V");
    expect(note()).not.toContain("senza prezzo atteso");
    expect(note()).not.toContain("senza verdetto");
  });
});

describe("guardia di deriva — il vocabolario che questo blocco non può usare", () => {
  const DRIFT = /valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima|consigl|dovresti/i;

  it("la regex trova davvero quello che cerca (contro-prova)", () => {
    // Una regex negata contro una stringa vuota è verde e non prova niente:
    // prima di negare, si prova che la guardia morde su una frase vietata.
    expect("costa meno di quanto vale per te").toMatch(DRIFT);
    expect("un affare da non perdere").toMatch(DRIFT);
    expect("il suo valore è 40 cr").toMatch(DRIFT);
    expect("la stima dice altro").toMatch(DRIFT);
    expect("è un'occasione").toMatch(DRIFT);
    // …e non morde sulle parole che il blocco USA davvero: se lo facesse,
    // il test qui sotto sarebbe verde per la ragione sbagliata.
    expect("V 42 cr (generatore GEN-RECIPE@1.0.0)").not.toMatch(DRIFT);
    expect("atteso 38 cr · su 24 aste simili · tende a sbagliare basso").not.toMatch(DRIFT);
  });

  it("nessun esito del sottoblocco contiene una parola vietata", () => {
    const readings: readonly PerMeReading[] = [
      withCandidates([
        candidate(),
        candidate({ playerId: "b", surplus: -8, flagNow: false, withinPlan: false }),
        candidate({
          playerId: "c",
          surplus: null,
          expectedPrice: { kind: "assente", reason: "fascia-sotto-campione" },
          relativePrice: { kind: "assente", reason: "nessun-rivale-eleggibile" },
          appealPosition: null,
          appealOrderSize: null,
          valueSource: "dichiarato",
          valueRecipe: null,
          anchor: {
            ...candidate().anchor,
            basis: "none",
            inflationApplied: null,
            n: 0,
            coldStart: true,
          },
        }),
      ]),
      withCandidates([candidate()], { ...DYNAMIC_PLAN, declaredIssue: "plan-invalid" }),
      ...ALL_REASONS.map(emptyReading),
    ];
    for (const reading of readings) {
      const text = perMeSectionText(reading);
      // C'è qualcosa da negare: il nome del sottoblocco più del contenuto vero.
      expect(text).toContain(PER_ME_TITLE_SHORT);
      expect(text.replace(PER_ME_TITLE_SHORT, "").trim().length).toBeGreaterThan(40);
      expect(text, `esito «${reading.kind}»`).not.toMatch(DRIFT);
    }
  });

  it("il testo del sottoblocco copre DAVVERO tutte le sue parti", () => {
    const shown = candidate();
    const text = perMeSectionText(withCandidates([shown]));
    expect(text).toContain(perMeHeadText(shown));
    expect(text).toContain(perMeValueText(shown));
    expect(text).toContain(perMePriceText(shown));
    expect(text).toContain(perMeWinNowText(shown));
    expect(text).toContain(perMeScarcityText(shown));
    expect(text).toContain(perMeAppealText(shown));
    expect(text).toContain(perMeAnchorText(shown));
    expect(text).toContain(perMePlanText(shown, DYNAMIC_PLAN.label));
    expect(text).toContain(PER_ME_NOW_MARK);
    expect(text).toContain("NON RATIFICATE");
  });

  it("un esito vuoto senza nota non stampa parametri che non hanno governato niente", () => {
    const text = perMeSectionText(emptyReading("no-pool"));
    expect(text).toContain(perMeEmptyText("no-pool"));
    expect(text).not.toContain("3 righe al massimo");
  });
});
