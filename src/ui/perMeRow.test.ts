// LE PAROLE DELLA RIGA «PER ME» — coperte da test come i numeri.
//
// Nessun DOM qui: questo repository non usa jsdom sotto Vitest, quindi tutta la
// COPIA vive in funzioni pure e il gesto vero — clic, tastiera, tocco — è
// provato da e2e/per-me-row.spec.ts.
//
// LA GUARDIA DI DERIVA. Modello: src/ui/baitRow.test.ts §E14 e
// src/ui/warBoard.test.ts §D9. Una regex su TUTTO il testo del sottoblocco, in
// ogni suo esito, che deve dare ZERO riscontri: nessuna parola che affermi un
// valore, una convenienza, un'occasione o una previsione. Qui la guardia serve
// più che altrove, perché la frase spontanea per questo blocco — «costa meno di
// quanto vale per te» — è esattamente quella che non si può più scrivere: il
// valore per me è stato smontato da Pico il 2026-08-24, e nessuna parola può
// far finta che ci sia ancora.
//
// Fixture sintetiche: nomi «Sintetico …», club «ClubAlfa».

import { describe, expect, it } from "vitest";
import {
  PER_ME_PARAMETERS,
  type PerMeCandidate,
  type PerMeEmptyReason,
  type PerMeReading,
} from "../perMeCandidates.js";
import { BAIT_SELECTED_MARK } from "./baitRow.js";
import {
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
  perMeSectionText,
  perMeTitleFor,
} from "./perMeRow.js";
import type { ListonePlayer } from "./listone.js";

const PLAYER: ListonePlayer = { name: "Sintetico Alfa", role: "A", club: "ClubAlfa", quotation: 20 };

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
    maxBid: 473,
    withinRolePlan: true,
    planAllocation: 210,
    planSlotsRemaining: 7,
    appealPosition: 1,
    appealOrderSize: 47,
    ...over,
  };
}

function withCandidates(candidates: readonly PerMeCandidate[]): PerMeReading {
  return {
    kind: "candidates",
    candidates,
    parameters: PER_ME_PARAMETERS,
    evaluated: candidates.length,
    freeInOpenRoles: candidates.length,
    withoutAppealPosition: candidates.filter((c) => c.appealPosition === null).length,
    planVersion: "pre-asta 1",
    basis: "current-anchors-and-declared-plan",
    ratification: {
      ratified: false,
      unratifiedChoices: ["PER_ME_ORDER_APPEAL_REPLACES_SURPLUS"],
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
    basis: "current-anchors-and-declared-plan",
    ratification: {
      ratified: false,
      unratifiedChoices: ["PER_ME_ORDER_APPEAL_REPLACES_SURPLUS"],
    },
  };
}

const ALL_REASONS: readonly PerMeEmptyReason[] = [
  "no-pool",
  "no-quotation",
  "anchors-refused",
  "plan-absent",
  "plan-incomplete",
  "plan-invalid",
  "no-open-role",
  "no-free-in-open-roles",
  "no-affordable",
];

describe("il nome del sottoblocco", () => {
  it("il nome corto è il nome INTERO di quello per esteso, non un suo prefisso qualsiasi", () => {
    // `startsWith(PER_ME_TITLE_SHORT)` da solo NON basta, ed è un buco vero:
    // «PER ME ADESSO — …» lo supera pur essendo un ALTRO nome. Il separatore
    // dentro l'asserzione è ciò che chiude il buco — provato rompendo il
    // codice: con quel nome inventato questa riga diventa rossa, con la
    // versione senza separatore restava verde.
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
    // Due sottoblocchi nello stesso riquadro non possono dire in due modi
    // diversi che una riga è selezionata: se qualcuno cambia una delle due
    // stringhe, questo test lo mostra invece di lasciarle divergere in silenzio.
    expect(PER_ME_SELECTED_MARK).toBe(BAIT_SELECTED_MARK);
  });
});

describe("i nove silenzi hanno nove frasi diverse", () => {
  it("nessuna frase è vuota e nessuna è uguale a un'altra", () => {
    const texts = ALL_REASONS.map(perMeEmptyText);
    for (const t of texts) expect(t.length).toBeGreaterThan(20);
    expect(new Set(texts).size).toBe(ALL_REASONS.length);
  });

  it("le tre frasi del piano nominano la dichiarazione che manca", () => {
    expect(perMeEmptyText("plan-absent")).toContain("piano");
    expect(perMeEmptyText("plan-incomplete")).toContain("target");
    expect(perMeEmptyText("plan-invalid")).toContain("motore");
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

  it("la posizione è una POSIZIONE, e porta la numerosità dell'ordine", () => {
    expect(perMeAppealText(candidate())).toBe("1ª di 47 per appetibilità");
    expect(perMeAppealText(candidate({ appealPosition: 12, appealOrderSize: 47 }))).toBe(
      "12ª di 47 per appetibilità",
    );
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
    expect(perMeAnchorText(candidate({
      anchor: { ...candidate().anchor, basis: "overall-inflation", n: 12 },
    }))).toContain("su 12 acquisti del tavolo");
  });

  it("in cold start non c'è un numero al posto della misura che manca", () => {
    const text = perMeAnchorText(candidate({
      anchor: {
        ...candidate().anchor,
        basis: "none",
        inflationApplied: null,
        n: 0,
        coldStart: true,
        correctedAnchor: 20,
      },
    }));
    expect(text).toBe("ancora 20 cr (Qt.A 20 · nessuna inflazione misurata)");
    expect(text).not.toContain("%");
  });

  it("il piano dice dentro/fuori, l'allocazione, gli slot e il max bid", () => {
    expect(perMePlanText(candidate())).toBe(
      "nel piano A (210 cr / 7 slot) · max bid 473 cr",
    );
    expect(perMePlanText(candidate({ withinRolePlan: false }))).toContain("fuori dal piano");
  });

  it("il nome del tetto è quello dichiarato una volta sola, non una formulazione propria", () => {
    // src/ui/budgetLabels.ts esiste perché due grandezze diverse non si
    // chiamino tutte e due «max». Qui si usa quel nome, e la sigla nuda no.
    expect(perMePlanText(candidate())).toContain("max bid");
    expect(perMePlanText(candidate())).not.toContain("max reparto");
  });
});

describe("la nota stampa l'ordine, i parametri e la scelta non ratificata", () => {
  const note = (): string => perMeNoteText(PER_ME_PARAMETERS, "pre-asta 1", 0);

  it("l'ordine è scritto per esteso, criterio per criterio", () => {
    expect(note()).toContain("ordine: piano → appetibilità del ruolo → ancora → chiave di listone");
  });

  it("la scelta non ratificata è dichiarata a schermo, non solo nel dato", () => {
    expect(note()).toContain("NON RATIFICATA");
  });

  it("i parametri sono ispezionabili accanto al numero che governano", () => {
    expect(note()).toContain("campione minimo 5");
    expect(note()).toContain("3 righe al massimo (provvisorio");
  });

  it("la versione del piano viaggia con la nota quando c'è", () => {
    expect(note()).toContain("piano «pre-asta 1»");
    expect(perMeNoteText(PER_ME_PARAMETERS, null, 0)).not.toContain("piano «");
  });

  it("le righe senza verdetto si contano invece di essere fabbricate", () => {
    expect(perMeNoteText(PER_ME_PARAMETERS, "v", 2)).toContain(
      "2 righe senza verdetto di appetibilità",
    );
    expect(perMeNoteText(PER_ME_PARAMETERS, "v", 1)).toContain(
      "1 riga senza verdetto di appetibilità",
    );
    expect(note()).not.toContain("senza verdetto di appetibilità");
  });
});

describe("guardia di deriva — il vocabolario che questo blocco non può usare", () => {
  const DRIFT = /valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima|consigl|dovresti/i;

  it("la regex trova davvero quello che cerca (contro-prova)", () => {
    // Una regex negata contro una stringa vuota è verde e non prova niente:
    // prima di negare, si prova che la guardia morde su una frase vietata.
    expect("costa meno di quanto vale per te").toMatch(DRIFT);
    expect("un affare da non perdere").toMatch(DRIFT);
  });

  it("nessun esito del sottoblocco contiene una parola vietata", () => {
    const readings: readonly PerMeReading[] = [
      withCandidates([
        candidate(),
        candidate({ withinRolePlan: false, appealPosition: null, appealOrderSize: null }),
        candidate({
          anchor: {
            ...candidate().anchor,
            basis: "none",
            inflationApplied: null,
            n: 0,
            coldStart: true,
          },
        }),
      ]),
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
    const text = perMeSectionText(withCandidates([candidate()]));
    expect(text).toContain(perMeHeadText(candidate()));
    expect(text).toContain(perMeAppealText(candidate()));
    expect(text).toContain(perMeAnchorText(candidate()));
    expect(text).toContain(perMePlanText(candidate()));
    expect(text).toContain("NON RATIFICATA");
  });

  it("un esito vuoto senza nota non stampa parametri che non hanno governato niente", () => {
    const text = perMeSectionText(emptyReading("no-pool"));
    expect(text).toContain(perMeEmptyText("no-pool"));
    expect(text).not.toContain("3 righe al massimo");
  });
});
