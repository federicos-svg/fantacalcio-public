// LE PAROLE DELLA RIGA — coperte da test come i numeri.
//
// Nessun DOM qui: questo repository non usa jsdom sotto Vitest (vedi
// src/postPurchaseProjection.ts), quindi tutta la COPIA vive in funzioni pure e
// il gesto vero — clic, tastiera, tocco — è provato da e2e/bait-row.spec.ts.
//
// E14 — LA GUARDIA DI DERIVA. Modello: src/ui/warBoard.test.ts §D9. Una regex
// su TUTTO il testo del sottoblocco, in ogni suo esito, che deve dare ZERO
// riscontri: nessuna parola che affermi un'intenzione, un carattere, una
// previsione o una stima. È la guardia che impedisce di riscrivere «non lo so»
// come «nessuno abbocca» quando la frase naturale sarebbe proprio quella.
//
// Fixture sintetiche: nomi «Sintetico …», club «ClubAlfa», posti «Squadra…».

import { describe, it, expect } from "vitest";
import {
  BAIT_SELECTED_MARK,
  BAIT_TITLE,
  BAIT_TITLE_SHORT,
  BAIT_TOP_TIER_MARKER,
  baitNoteApplies,
  baitTitleFor,
  baitCountText,
  baitEmptyText,
  baitEvidenceLines,
  baitHeadText,
  baitNoteText,
  baitProjectionText,
  baitSectionText,
  baitShownCandidates,
} from "./baitRow.js";
import { BAIT_PARAMETERS, type BaitCandidate, type BaitEmptyReason, type BaitReading } from "../baitCandidates.js";
import type { ListonePlayer } from "./listone.js";

const SEASONS = ["2021/22", "2022/23", "2023/24"];
const LABELS = { Squadra2: "Dinamo Sintetica", Squadra3: "Atletico Sintetico" };

const PLAYER: ListonePlayer = { name: "Sintetico Alfa", role: "A", club: "ClubAlfa", quotation: 20 };

function candidate(over: Partial<BaitCandidate> = {}): BaitCandidate {
  return {
    player: PLAYER,
    playerId: "sintetico-alfa__clubalfa",
    role: "A",
    exposed: [
      {
        fantaTeamId: "Squadra2",
        personId: "person:00000000-0000-4000-8000-0000000000e2",
        facts: [
          {
            id: "ricomprato",
            seasonsMeasured: 3,
            seasons: SEASONS,
            auctionPurchases: 2,
            purchaseSeasons: ["2021/22", "2022/23"],
            prices: [
              { season: "2021/22", price: 60 },
              { season: "2022/23", price: 71 },
            ],
            renewalsExcluded: 1,
          },
        ],
      },
      {
        fantaTeamId: "Squadra3",
        personId: "person:00000000-0000-4000-8000-0000000000e3",
        facts: [
          {
            id: "club",
            seasonsMeasured: 3,
            seasons: SEASONS,
            club: "ClubAlfa",
            perSeason: SEASONS.map((season) => ({ season, share: 0.22, amount: 22, total: 100 })),
            seasonsAtOrAbove: 3,
            latest: { season: "2023/24", share: 0.22, amount: 22, total: 100 },
            threshold: 0.15,
          },
        ],
      },
    ],
    exposedCount: 2,
    refused: [],
    appealIndex: 12,
    openingPrice: 1,
    roleSlotsBefore: 7,
    projection: {
      kind: "after",
      fantaTeamId: "Io",
      creditsAfter: 214,
      slotsAfter: 27,
      reserveAfter: 27,
      completable: true,
      missingCredits: 0,
    },
    alsoTopTier: false,
    ...over,
  };
}

function reading(over: Partial<Extract<BaitReading, { kind: "candidates" }>> = {}): BaitReading {
  return {
    kind: "candidates",
    candidates: [candidate()],
    parameters: BAIT_PARAMETERS,
    evaluated: 1,
    seasons: SEASONS,
    basis: "auction-history",
    withoutAppealIndex: 0,
    ...over,
  };
}

const EMPTY_REASONS: readonly BaitEmptyReason[] = [
  "no-pool",
  "no-history",
  "no-open-role",
  "no-affordable-opening",
  "no-exposed",
  "below-sample",
];

function emptyReading(reason: BaitEmptyReason): BaitReading {
  return {
    kind: "empty",
    reason,
    parameters: BAIT_PARAMETERS,
    evaluated: 0,
    seasons: SEASONS,
    basis: "auction-history",
  };
}

// ─── E14 — la guardia di deriva ──────────────────────────────────────────────

describe("E14 — nessuna parola che affermi un'intenzione o una previsione", () => {
  const DRIFT = /vuole|abbocc|aggressiv|tilt|preved|probabil|stima/i;

  it("il titolo non è «CHI ABBOCCA»: nomina ciò che il blocco contiene", () => {
    expect(BAIT_TITLE).not.toMatch(DRIFT);
    expect(BAIT_TITLE).toContain("liberi su cui più avversari hanno un precedente, lo slot e i crediti");
  });

  it("nessuno dei sei silenzi contiene una parola vietata", () => {
    for (const reason of EMPTY_REASONS) {
      expect(baitEmptyText(reason), reason).not.toMatch(DRIFT);
      expect(baitSectionText(emptyReading(reason), LABELS), reason).not.toMatch(DRIFT);
    }
  });

  it("il testo INTERO del sottoblocco con le righe non contiene una parola vietata", () => {
    const full = baitSectionText(
      reading({ candidates: [candidate({ alsoTopTier: true })], withoutAppealIndex: 1 }),
      LABELS,
    );
    expect(full).not.toMatch(DRIFT);
    // E la guardia morde davvero: la frase vietata più naturale è a un passo.
    expect("nessuno abbocca").toMatch(DRIFT);
    expect("lo vuole").toMatch(DRIFT);
  });

  it("il marcatore di prima fascia non promette e non predice", () => {
    expect(BAIT_TOP_TIER_MARKER).not.toMatch(DRIFT);
  });
});

// ─── I sei silenzi, e sono sei cose diverse ──────────────────────────────────

describe("quando non compare, dice QUALE silenzio è", () => {
  it("sei motivi, sei frasi distinte", () => {
    const texts = EMPTY_REASONS.map(baitEmptyText);
    expect(new Set(texts).size).toBe(EMPTY_REASONS.length);
    for (const t of texts) expect(t.length).toBeGreaterThan(20);
  });

  it("no-history dice «non lo so», che è l'opposto di una risposta", () => {
    const text = baitEmptyText("no-history");
    expect(text).toContain("non lo so");
    // La distinzione LOAD-BEARING, e resta esplicita nel testo: «non lo so»
    // non è «nessuno». È la frase che la guardia di deriva protegge.
    expect(text).toContain("«non lo so» non è «nessuno»");
  });

  it("no-exposed nomina le tre condizioni insieme, perché una sola non basta", () => {
    expect(baitEmptyText("no-exposed")).toBe(
      "Nessun libero su cui un avversario abbia insieme un precedente misurato, lo slot e i crediti.",
    );
  });

  it("in nessuno dei sei silenzi il testo supera le due frasi", () => {
    // Un blocco che NON HA NULLA DA DIRE non può prendersi un quarto di
    // schermata: `e2e/call-screen-order.spec.ts` tiene la paginazione del
    // listone entro due schermate dal campo di ricerca, e a 390px ogni frase in
    // più del silenzio sono ~20px di quel margine. Misurato: il sottoblocco
    // vuoto è passato da 218px a 71px.
    for (const reason of EMPTY_REASONS) {
      const sentences = baitEmptyText(reason).split(". ").length;
      expect(sentences, `${reason}: ${baitEmptyText(reason)}`).toBeLessThanOrEqual(2);
    }
  });

  it("below-sample non è assenza di precedenti, e lo dice", () => {
    expect(baitEmptyText("below-sample")).toContain("campione insufficiente");
  });
});

// ─── La riga ─────────────────────────────────────────────────────────────────

describe("la riga: due righe, e la seconda è contenuto obbligato", () => {
  it("la prima dice chi è e quanti avversari, con le tre condizioni", () => {
    expect(baitHeadText(candidate())).toBe("Sintetico Alfa (A · ClubAlfa)");
    expect(baitCountText(2)).toBe("2 avversari con un precedente, lo slot e i crediti");
    expect(baitCountText(1)).toBe("1 avversario con un precedente, lo slot e i crediti");
  });

  it("la seconda è il costo del piano B: slot del reparto e crediti residui", () => {
    expect(baitProjectionText(candidate())).toBe(
      "se resta a te a 1 cr: slot A 7→6 · restano 214 cr e 27 slot",
    );
  });

  it("e porta l'allarme quando la rosa non resterebbe completabile", () => {
    const text = baitProjectionText(
      candidate({
        projection: {
          kind: "after",
          fantaTeamId: "Io",
          creditsAfter: 20,
          slotsAfter: 27,
          reserveAfter: 27,
          completable: false,
          missingCredits: 7,
        },
      }),
    );
    expect(text).toContain("rosa non completabile: mancano 7 cr");
  });

  it("la prova viaggia col fatto, ed è quella del pannello dei precedenti", () => {
    const lines = baitEvidenceLines(candidate().exposed[0]!, "Dinamo Sintetica");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Dinamo Sintetica l'ha ricomprato all'asta");
    expect(lines[0]).toContain("2 volte — 60 cr nel 2021/22, 71 cr nel 2022/23");
    expect(lines[0]).toContain("1 rinnovo non contato");
  });

  it("la prova del fatto sul club porta la soglia e la numerosità", () => {
    const lines = baitEvidenceLines(candidate().exposed[1]!, "Atletico Sintetico");
    expect(lines[0]).toContain("Atletico Sintetico ha speso su ClubAlfa");
    expect(lines[0]).toContain("3 stagioni su 3 misurate dal 15% in su");
  });

  it("il marcatore di prima fascia compare accanto, senza spostare la riga", () => {
    const text = baitSectionText(reading({ candidates: [candidate({ alsoTopTier: true })] }), LABELS);
    expect(text).toContain(BAIT_TOP_TIER_MARKER);
    expect(BAIT_TOP_TIER_MARKER).toContain("non è un ripiego");
  });

  it("la parola della selezione è un secondo canale oltre al colore", () => {
    expect(BAIT_SELECTED_MARK).toBe("✓ selezionato");
  });
});

// ─── I parametri, ispezionabili accanto ai numeri ────────────────────────────

describe("la nota porta provenienza e i tre parametri in vigore", () => {
  it("dichiara lo storico d'asta, l'apertura, la soglia di campione e il tetto righe", () => {
    const note = baitNoteText(BAIT_PARAMETERS, SEASONS, 0);
    expect(note).toContain("provenienza: storico d'asta misurato");
    expect(note).toContain("3 stagioni (2021/22 → 2023/24)");
    expect(note).toContain("apertura a 1 cr");
    expect(note).toContain("almeno 1 stagione misurata per fatto");
    expect(note).toContain("al massimo 3 righe (provvisorio — in attesa di conferma di Pico)");
  });

  it("il parametro non confermato DICHIARA di esserlo", () => {
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS, 0)).toContain("provvisorio");
  });

  it("le righe senza indice sono dichiarate, non azzerate in silenzio", () => {
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS, 2)).toContain(
      "2 righe senza indice di appetibilità",
    );
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS, 2)).toContain("senza numero fabbricato");
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS, 0)).not.toContain("senza indice");
  });
});

describe("il tetto di righe è quello dichiarato nell'esito", () => {
  it("con più candidati del tetto, si mostrano solo i primi", () => {
    const many = [1, 2, 3, 4, 5].map((i) => candidate({ playerId: `id-${i}` }));
    const shown = baitShownCandidates(reading({ candidates: many }));
    expect(shown.map((c) => c.playerId)).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("un esito vuoto non mostra righe", () => {
    expect(baitShownCandidates(emptyReading("no-exposed"))).toEqual([]);
  });
});

describe("il blocco vuoto non recita parametri che non hanno governato niente", () => {
  it("senza popolazione (no-pool, no-history) la nota non compare", () => {
    for (const reason of ["no-pool", "no-history"] as const) {
      expect(baitNoteApplies(emptyReading(reason)), reason).toBe(false);
      expect(baitSectionText(emptyReading(reason), LABELS)).not.toContain("apertura a");
    }
  });

  it("negli altri quattro silenzi la nota resta per intero", () => {
    for (const reason of ["no-open-role", "no-affordable-opening", "no-exposed", "below-sample"] as const) {
      expect(baitNoteApplies(emptyReading(reason)), reason).toBe(true);
      expect(baitSectionText(emptyReading(reason), LABELS), reason).toContain("apertura a 1 cr");
      expect(baitSectionText(emptyReading(reason), LABELS), reason).toContain("provvisorio");
    }
  });

  it("con le righe la nota c'è sempre", () => {
    expect(baitNoteApplies(reading())).toBe(true);
    expect(baitSectionText(reading(), LABELS)).toContain("al massimo 3 righe");
  });

  it("i parametri restano nel DATO anche dove la vista non li stampa", () => {
    // La regola è «la soglia ispezionabile accanto al numero che lascia
    // passare»: senza numero la vista tace, ma `BaitReading.parameters` li
    // porta comunque — chi legge l'esito non perde niente.
    expect(emptyReading("no-history").parameters).toEqual(BAIT_PARAMETERS);
  });
});

describe("il NOME del blocco è uno solo, in tutti e due gli esiti", () => {
  it("la forma breve è un prefisso letterale di quella estesa", () => {
    // Costruzione, non disciplina: `BAIT_TITLE` è interpolato da
    // `BAIT_TITLE_SHORT`. Il test lo rende osservabile.
    expect(BAIT_TITLE.startsWith(BAIT_TITLE_SHORT)).toBe(true);
    expect(BAIT_TITLE_SHORT).toBe("PER FAR SPENDERE GLI ALTRI");
  });

  it("con le righe l'occhiello è esteso, senza righe è il solo nome", () => {
    expect(baitTitleFor(reading())).toBe(BAIT_TITLE);
    expect(baitTitleFor(emptyReading("no-history"))).toBe(BAIT_TITLE_SHORT);
    // La seconda metà descrive CHE COSA SONO LE RIGHE: senza righe non c'è
    // niente da descrivere, e la frase del silenzio lo dice già per intero.
    expect(baitTitleFor(emptyReading("no-history"))).not.toContain("liberi su cui");
  });
});
