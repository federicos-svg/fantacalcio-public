// LE PAROLE DELLA RIGA — coperte da test come i numeri.
//
// Nessun DOM qui: questo repository non usa jsdom sotto Vitest (vedi
// src/postPurchaseProjection.ts), quindi tutta la COPIA vive in funzioni pure e
// il gesto vero — clic, tastiera, tocco — è provato da e2e/bait-row.spec.ts.
//
// LA RIGA È DIVENTATA TRE COSE — nome, ruolo, squadra — per decisione di Pico
// del 2026-08-31: «Non devo usarle per leggere ma come consiglio». Le
// asserzioni sul conteggio degli avversari, sulla proiezione «se resta a te»,
// sulle righe di evidenza e sul marcatore di prima fascia non sono state
// cancellate per far passare il codice nuovo: le funzioni che producevano
// quelle stringhe NON ESISTONO PIÙ, perché nessuna superficie le disegna. Al
// loro posto c'è la pretesa opposta, e più forte — che nessuno di quei fatti
// torni sulla riga senza che questo test diventi rosso. Il motore che li
// calcola è intatto e coperto da src/baitCandidates.test.ts.
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
  baitNoteApplies,
  baitTitleFor,
  baitEmptyText,
  baitHeadText,
  baitNoteText,
  baitSectionText,
  baitShownCandidates,
} from "./baitRow.js";
import { BAIT_PARAMETERS, type BaitCandidate, type BaitEmptyReason, type BaitReading } from "../baitCandidates.js";
import type { ListonePlayer } from "./listone.js";

const SEASONS = ["2021/22", "2022/23", "2023/24"];

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
      expect(baitSectionText(emptyReading(reason)), reason).not.toMatch(DRIFT);
    }
  });

  it("il testo INTERO del sottoblocco con le righe non contiene una parola vietata", () => {
    const full = baitSectionText(
      reading({ candidates: [candidate({ alsoTopTier: true })], withoutAppealIndex: 1 }),
    );
    expect(full).not.toMatch(DRIFT);
    // E la guardia morde davvero: la frase vietata più naturale è a un passo.
    expect("nessuno abbocca").toMatch(DRIFT);
    expect("lo vuole").toMatch(DRIFT);
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

describe("la riga è UN giocatore: nome, ruolo, squadra — e nient'altro", () => {
  it("la testa dice chi è, in una riga sola", () => {
    expect(baitHeadText(candidate())).toBe("Sintetico Alfa (A · ClubAlfa)");
  });

  it("il tetto ratificato è UNO: la vista mostra un giocatore soltanto", () => {
    expect(BAIT_PARAMETERS.rowsMax).toBe(1);
    const many = [1, 2, 3, 4, 5].map((i) => candidate({ playerId: `id-${i}` }));
    expect(baitShownCandidates(reading({ candidates: many })).map((c) => c.playerId)).toEqual([
      "id-1",
    ]);
  });

  it("SULLA RIGA NON C'È NESSUN FATTO DA LEGGERE, e questo è il punto", () => {
    // La lista è scritta per esteso perché sia falsificabile una voce alla
    // volta: se una di queste cose tornasse sulla riga, questa asserzione lo
    // direbbe col suo nome invece di lasciarla passare. I fatti non sono
    // spariti dal prodotto — i precedenti stanno nel loro pannello, il costo
    // sulla schermata che il clic arma — sono spariti da QUI.
    const riga = baitSectionText(reading({ candidates: [candidate({ alsoTopTier: true })] }))
      .split("\n")
      .find((l) => l.startsWith("Sintetico Alfa"));
    expect(riga).toBe("Sintetico Alfa (A · ClubAlfa)");
    expect(riga).not.toContain("avversari"); // il censimento degli esposti
    expect(riga).not.toContain("avversario");
    expect(riga).not.toContain("se resta a te"); // la proiezione del piano B
    expect(riga).not.toContain("slot");
    expect(riga).not.toContain("restano");
    expect(riga).not.toContain("ricomprato"); // le righe di evidenza
    expect(riga).not.toContain("ha speso su");
    expect(riga).not.toContain("⚠"); // il marcatore di prima fascia
    expect(riga).not.toContain("ripiego");
  });

  it("i fatti del motore restano NEL DATO, e nessuno di essi è stato tolto", () => {
    // La riga non li disegna più; il candidato li porta ancora tutti. È la
    // differenza fra «la vista mostra meno» e «il motore calcola meno».
    const c = candidate({ alsoTopTier: true });
    expect(c.exposedCount).toBe(2);
    expect(c.exposed).toHaveLength(2);
    expect(c.exposed[0]!.facts).toHaveLength(1);
    expect(c.projection.kind).toBe("after");
    expect(c.openingPrice).toBe(1);
    expect(c.roleSlotsBefore).toBe(7);
    expect(c.appealIndex).toBe(12);
    expect(c.alsoTopTier).toBe(true);
  });

  it("la parola della selezione è un secondo canale oltre al colore", () => {
    expect(BAIT_SELECTED_MARK).toBe("✓ selezionato");
  });
});

// ─── I parametri, ispezionabili accanto ai numeri ────────────────────────────

describe("la nota resta la targa della provenienza e i tre parametri, e basta", () => {
  it("dichiara lo storico d'asta, l'apertura, la soglia di campione e il tetto righe", () => {
    const note = baitNoteText(BAIT_PARAMETERS, SEASONS);
    expect(note).toContain("provenienza: storico d'asta misurato");
    expect(note).toContain("3 stagioni (2021/22 → 2023/24)");
    expect(note).toContain("apertura a 1 cr");
    expect(note).toContain("almeno 1 stagione misurata per fatto");
    expect(note).toContain("al massimo 1 riga (ratificato da Pico il 2026-08-31)");
    // Il singolare non è un vezzo: «1 righe» sarebbe la spia che il tetto è
    // cambiato e la frase no.
    expect(note).not.toContain("1 righe");
  });

  it("il tetto delle righe DICHIARA la propria ratifica, e non è più provvisorio", () => {
    // Era «provvisorio — in attesa di conferma di Pico»; ratificato da Pico il
    // 2026-08-31, prima a 3 e poi — nella stessa giornata, decisione che
    // supera la precedente — a 1.
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS)).toContain("ratificato da Pico");
    expect(baitNoteText(BAIT_PARAMETERS, SEASONS)).not.toContain("provvisorio");
  });

  it("LA LETTURA È USCITA DALLA NOTA: niente contatore delle righe senza indice", () => {
    // Era lettura, e questo pannello ha smesso di essere una lettura. Il fatto
    // resta ispezionabile nel dato — `BaitReading.withoutAppealIndex` — e i
    // test di src/baitCandidates.test.ts lo pinnano lì.
    const note = baitNoteText(BAIT_PARAMETERS, SEASONS);
    expect(note).not.toContain("senza indice");
    expect(note).not.toContain("senza numero fabbricato");
    expect(reading({ withoutAppealIndex: 2 })).toMatchObject({ withoutAppealIndex: 2 });
  });
});

describe("il tetto di righe è quello dichiarato nell'esito", () => {
  it("con più candidati del tetto, si mostra solo il primo dell'ordine", () => {
    const many = [1, 2, 3, 4, 5].map((i) => candidate({ playerId: `id-${i}` }));
    const shown = baitShownCandidates(reading({ candidates: many }));
    expect(shown.map((c) => c.playerId)).toEqual(["id-1"]);
  });

  it("un esito vuoto non mostra righe", () => {
    expect(baitShownCandidates(emptyReading("no-exposed"))).toEqual([]);
  });
});

describe("il blocco vuoto non recita parametri che non hanno governato niente", () => {
  it("senza popolazione (no-pool, no-history) la nota non compare", () => {
    for (const reason of ["no-pool", "no-history"] as const) {
      expect(baitNoteApplies(emptyReading(reason)), reason).toBe(false);
      expect(baitSectionText(emptyReading(reason))).not.toContain("apertura a");
    }
  });

  it("negli altri quattro silenzi la nota resta per intero", () => {
    for (const reason of ["no-open-role", "no-affordable-opening", "no-exposed", "below-sample"] as const) {
      expect(baitNoteApplies(emptyReading(reason)), reason).toBe(true);
      expect(baitSectionText(emptyReading(reason)), reason).toContain("apertura a 1 cr");
      expect(baitSectionText(emptyReading(reason)), reason).toContain(
        "ratificato da Pico il 2026-08-31",
      );
    }
  });

  it("con le righe la nota c'è sempre", () => {
    expect(baitNoteApplies(reading())).toBe(true);
    expect(baitSectionText(reading())).toContain("al massimo 1 riga");
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
