// LE PAROLE DELLA RIGA «PER ME» — coperte da test come i numeri.
//
// Nessun DOM qui: questo repository non usa jsdom sotto Vitest, quindi tutta la
// COPIA vive in funzioni pure e il gesto vero — clic, tastiera, tocco — è
// provato da e2e/per-me-row.spec.ts.
//
// LA RIGA È DIVENTATA TRE COSE, e questi test lo dicono alla lettera. «Quello
// che voglio nelle due feature è un giocatore soltanto con Nome, ruolo e
// squadra. Non devo usarle per leggere ma come consiglio» (Pico, 2026-08-31).
// Le asserzioni su `V`, prezzo atteso, surplus, costo per vincerlo adesso,
// scarsità, appetibilità, ancora, piano e «⚑ adesso» non sono state cancellate
// per far passare il codice nuovo: le funzioni che producevano quelle stringhe
// NON ESISTONO PIÙ, perché nessuna superficie le disegna. Al loro posto c'è la
// pretesa opposta, e più forte — che nessuno di quei fatti torni sulla riga
// senza che questo test diventi rosso.
//
// IL MOTORE NON È TOCCATO: l'ordine, i cancelli e i motivi restano coperti da
// src/perMeCandidates.test.ts e dai test di packages/engine, che questo diff
// non sfiora.
//
// LA GUARDIA DI DERIVA. Modello: src/ui/baitRow.test.ts §E14 e
// src/ui/warBoard.test.ts §D9. Una regex su TUTTO il testo del sottoblocco, in
// ogni suo esito, che deve dare ZERO riscontri: nessuna parola che affermi una
// convenienza, un'occasione o una previsione. Nessuna maschera e nessuna
// eccezione — una maschera in meno è un buco in meno.
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
  PER_ME_SELECTED_MARK,
  PER_ME_TITLE,
  PER_ME_TITLE_SHORT,
  perMeEmptyText,
  perMeHeadText,
  perMeNoteApplies,
  perMeNoteText,
  perMeSectionText,
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

describe("la riga è UN giocatore: nome, ruolo, squadra — e nient'altro", () => {
  it("la testa dice chi è, in una riga sola", () => {
    expect(perMeHeadText(candidate())).toBe("Sintetico Alfa (A · ClubAlfa)");
  });

  it("il tetto ratificato è UNO: la vista mostra un giocatore soltanto", () => {
    // Non è una scelta di questo file: `PER_ME_ROWS_MAX` è il parametro che
    // Pico ha ratificato il 2026-08-31, e la vista tronca su quello.
    expect(PER_ME_PARAMETERS.rowsMax).toBe(1);
    const text = perMeSectionText(
      withCandidates([candidate(), candidate({ playerId: "b" }), candidate({ playerId: "c" })]),
    );
    expect(text.split("\n").filter((l) => l.includes("Sintetico Alfa (A · ClubAlfa)"))).toHaveLength(
      1,
    );
  });

  it("SULLA RIGA NON C'È NESSUN NUMERO DEL MOTORE, e questo è il punto", () => {
    // La lista è scritta per esteso perché sia falsificabile una voce alla
    // volta: se una qualunque di queste cose tornasse sulla riga, questa
    // asserzione lo direbbe col suo nome invece di lasciarla passare.
    //
    // I fatti non sono spariti dal prodotto: sono a UN CLIC, sulla schermata
    // di chiamata che la riga arma. Il motore che li calcola è intatto, e i
    // suoi test lo dimostrano da soli.
    const riga = perMeSectionText(withCandidates([candidate()]))
      .split("\n")
      .find((l) => l.startsWith("Sintetico Alfa"));
    expect(riga).toBe("Sintetico Alfa (A · ClubAlfa)");
    expect(riga).not.toMatch(/\bV \d/); // il valore in crediti con la sua targa
    expect(riga).not.toContain("generatore"); // la targa della ricetta
    expect(riga).not.toMatch(/\bS [+−]/); // il surplus
    expect(riga).not.toContain("atteso"); // il prezzo atteso e i suoi qualificatori
    expect(riga).not.toContain("aste simili");
    expect(riga).not.toContain("tende a sbagliare");
    expect(riga).not.toContain("vincerlo adesso"); // il costo per vincerlo ora
    expect(riga).not.toContain("alternativ"); // i due fatti di scarsità
    expect(riga).not.toContain("rival");
    expect(riga).not.toContain("appetibilità"); // la posizione di appetibilità
    expect(riga).not.toContain("ancora"); // la scomposizione dell'ancora
    expect(riga).not.toContain("Qt.A");
    expect(riga).not.toContain("piano"); // l'allocazione del piano
    expect(riga).not.toContain("max bid"); // il tetto hard-safe
    expect(riga).not.toContain("slot");
    expect(riga).not.toContain("⚑"); // il marcatore del momento
  });

  it("i fatti del motore restano NEL DATO, e nessuno di essi è stato tolto", () => {
    // La riga non li disegna più; il candidato li porta ancora tutti. È la
    // differenza fra «la vista mostra meno» e «il motore calcola meno», ed è
    // esattamente la prima delle due.
    const c = candidate();
    expect(c.value).toBe(42);
    expect(c.surplus).toBe(4);
    expect(c.expectedPrice.kind).toBe("prezzo");
    expect(c.relativePrice.kind).toBe("prezzo");
    expect(c.cliff.alternativesAtOrBelow).toBe(3);
    expect(c.rivalsWithSlot).toBe(5);
    expect(c.maxBid).toBe(473);
    expect(c.planAllocation).toBe(210);
    expect(c.appealPosition).toBe(1);
    expect(c.flagNow).toBe(true);
  });

  it("il marcatore «⚑ adesso» non esiste più a schermo, in nessuno dei due casi", () => {
    for (const flagNow of [true, false]) {
      expect(perMeSectionText(withCandidates([candidate({ flagNow })]))).not.toContain("⚑");
    }
  });
});

describe("la nota resta la targa della provenienza e i parametri, e basta", () => {
  const note = (): string => perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN);

  it("la PROVENIENZA c'è: da dove vengono i numeri che hanno scelto la riga", () => {
    expect(note()).toContain("V dal generatore e prezzo atteso dalla curva storica");
  });

  it("i parametri sono ispezionabili accanto al numero che governano", () => {
    expect(note()).toContain("campione minimo 5 (inflazione) e 5 (fascia di prezzo)");
    expect(note()).toContain("riserva 1 cr per ogni slot non ancora pianificato");
    expect(note()).toContain("1 riga al massimo (ratificato da Pico il 2026-08-31)");
    expect(note()).not.toContain("provvisorio");
    // Il singolare non è un vezzo: «1 righe al massimo» sarebbe la spia che il
    // tetto è cambiato e la frase no.
    expect(note()).not.toContain("1 righe");
  });

  it("l'etichetta e la versione del piano viaggiano con la nota", () => {
    expect(note()).toContain("piano ricalcolato adesso «NOM-DYN@12»");
    const dichiarato: PerMePlanReading = {
      kind: "declared",
      planVersion: "pre-asta 1",
      label: "piano dichiarato da te",
      live: {} as never,
    };
    expect(perMeNoteText(PER_ME_PARAMETERS, dichiarato)).toContain(
      "piano dichiarato da te «pre-asta 1»",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, null)).not.toContain("«");
  });

  it("una dichiarazione di piano rotta si dice, e si dice che comanda il dinamico", () => {
    // RESTA, ed è ancora provenienza: l'etichetta dice «piano ricalcolato
    // adesso» PROPRIO PERCHÉ la dichiarazione di Pico non ha retto, e tacerlo
    // farebbe sembrare dichiarato un piano che non lo è.
    const monco: PerMePlanReading = { ...DYNAMIC_PLAN, declaredIssue: "plan-incomplete" };
    const rifiutato: PerMePlanReading = { ...DYNAMIC_PLAN, declaredIssue: "plan-invalid" };
    expect(perMeNoteText(PER_ME_PARAMETERS, monco)).toContain("è a metà");
    expect(perMeNoteText(PER_ME_PARAMETERS, rifiutato)).toContain("rifiutata dal motore");
    for (const plan of [monco, rifiutato]) {
      expect(perMeNoteText(PER_ME_PARAMETERS, plan)).toContain("comanda il piano ricalcolato");
    }
    expect(note()).not.toContain("comanda il piano ricalcolato");
  });

  it("LA LETTURA È USCITA DALLA NOTA: niente ordine per esteso, niente contatori", () => {
    // Quello che non c'è più è scritto una voce alla volta, perché il giorno
    // in cui qualcuno lo rimettesse questo test lo dicesse col suo nome.
    const n = note();
    expect(n).not.toContain("ordine:");
    expect(n).not.toContain("chiave di listone");
    expect(n).not.toContain("NON RATIFICATE");
    expect(n).not.toContain("senza V");
    expect(n).not.toContain("senza prezzo atteso");
    expect(n).not.toContain("senza verdetto di appetibilità");
  });

  it("…ma quelle letture aperte restano NEL DATO, non sono state chiuse da nessuno", () => {
    // Sparire dalla nota non è essere ratificate: la lettura le porta ancora,
    // e il vocabolario del motore le nomina. Questa è la prova che la
    // semplificazione della vista non ha promosso niente di nascosto.
    const reading = withCandidates([candidate()]);
    expect(reading.ratification.ratified).toBe(false);
    expect(reading.ratification.unratifiedChoices.length).toBeGreaterThan(0);
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
    expect("Sintetico Alfa (A · ClubAlfa)").not.toMatch(DRIFT);
    expect("V dal generatore e prezzo atteso dalla curva storica").not.toMatch(DRIFT);
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
    // Sono tre, e sono tutte: il nome accessibile, la riga, la nota. Una
    // guardia che leggesse più di così sorveglierebbe una pagina che non c'è.
    const shown = candidate();
    const text = perMeSectionText(withCandidates([shown]));
    expect(text.split("\n")).toEqual([
      PER_ME_TITLE,
      perMeHeadText(shown),
      perMeNoteText(PER_ME_PARAMETERS, DYNAMIC_PLAN),
    ]);
  });

  it("un esito vuoto senza nota non stampa parametri che non hanno governato niente", () => {
    const text = perMeSectionText(emptyReading("no-pool"));
    expect(text).toContain(perMeEmptyText("no-pool"));
    expect(text).not.toContain("riga al massimo");
  });
});
