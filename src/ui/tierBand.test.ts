import { describe, it, expect } from "vitest";
import {
  TIER_BAND_NOTE,
  TIER_BAND_NO_CALL,
  TIER_BAND_NO_INDEX,
  TIER_BAND_NO_POOL,
  TIER_BAND_NO_TABLE,
  TIER_BAND_TITLE,
  TIER_BAND_UNKNOWN_WORD,
  tierBandHeadline,
  tierBandSpoken,
  tierBandWord,
  tierOccupancyHtml,
  tierPricesHtml,
  tierProvenanceText,
  tierWord,
} from "./tierBand.js";
import type { TierBandReading, TierOrderingCoverage } from "../tierOrdering.js";
import type { TierFacts, TierPlacement } from "../../packages/engine/src/tiers.js";

// Solo fixture sintetiche. I `TierFacts` qui sotto sono costruiti a mano nella
// forma esatta che il motore produce (packages/engine/src/tiers.ts): questo
// file verifica la RESA, non il calcolo — quello ha già 719 righe di test suoi
// e src/tierOrdering.test.ts prova il ponte.

const COVERAGE: TierOrderingCoverage = { poolRows: 20, withVerdict: 18 };

function facts(overrides: Partial<TierFacts> = {}): TierFacts {
  return {
    playerId: "centro-01__clubuno",
    role: "C",
    tierCount: 9,
    tierSize: 8,
    provenance: {
      source: "indice di appetibilità del listone servito dal deposito privato",
      recipe: "APPEAL-INDEX-RECIPE@1.0.0",
      tieBreak: "punteggio decrescente, pareggi rotti per playerId crescente (code unit UTF-16)",
    },
    placement: { kind: "tier", tier: 1, position: 3 },
    occupancy: { tier: 1, originalSize: 8, freeCount: 5, takenCount: 3 },
    pricesPaidInTier: [61, 74, 90],
    opponents: [],
    basis: "measured-facts",
    ...overrides,
  };
}

function reading(overrides: Partial<TierFacts> = {}): TierBandReading {
  return { kind: "facts", facts: facts(overrides), coverage: COVERAGE };
}

function placement(kind: TierPlacement["kind"], tier: number | null, position: number | null): TierPlacement {
  return { kind, tier, position };
}

// ─── 1. La fascia, con la parola per intero ─────────────────────────────────

describe("la parola della fascia", () => {
  it("è una parola, mai una sigla e mai un numero nudo", () => {
    expect(tierWord(1)).toBe("Prima fascia");
    expect(tierWord(2)).toBe("Seconda fascia");
    expect(tierWord(9)).toBe("Nona fascia");
    for (let tier = 1; tier <= 9; tier += 1) {
      expect(tierWord(tier)).toMatch(/^[A-Z][a-z]+ fascia$/);
      expect(tierWord(tier)).not.toMatch(/^F\d|^\d|^T\d/);
    }
  });

  it("un numero fuori elenco resta una parola più un numero, non una sigla", () => {
    expect(tierWord(12)).toBe("Fascia 12");
  });

  it("la parola grande del riquadro è la fascia del chiamato", () => {
    expect(tierBandWord(reading())).toBe("Prima fascia");
    expect(tierBandWord(reading({ placement: placement("tier", 4, 27) }))).toBe("Quarta fascia");
  });

  it("fuori dalle fasce la parola lo dice, e non diventa una fascia peggiore", () => {
    expect(tierBandWord(reading({ placement: placement("fondo", null, 25) }))).toBe(
      "Oltre l'ultima fascia",
    );
  });

  it("in tutti i modi di non sapere la parola è «non lo so», identica", () => {
    const unknowns: TierBandReading[] = [
      { kind: "no-call" },
      { kind: "unavailable", reason: "no-pool", detail: "", coverage: COVERAGE },
      { kind: "unavailable", reason: "no-index", detail: "", coverage: COVERAGE },
      { kind: "unavailable", reason: "no-table", detail: "", coverage: COVERAGE },
      { kind: "unavailable", reason: "mixed-recipe", detail: "a / b", coverage: COVERAGE },
      { kind: "unavailable", reason: "ordering-refused", detail: "x", coverage: COVERAGE },
      reading({ placement: placement("unranked", null, null) }),
      reading({ placement: placement("role-not-ordered", null, null) }),
      reading({ placement: placement("no-ordering", null, null) }),
    ];
    for (const r of unknowns) expect(tierBandWord(r)).toBe(TIER_BAND_UNKNOWN_WORD);
  });
});

// ─── 3. Quando il dato non c'è, il pannello lo DICE ─────────────────────────

describe("gli otto modi di non sapere sono otto frasi diverse", () => {
  const sentences = [
    tierBandHeadline({ kind: "no-call" }),
    tierBandHeadline({ kind: "unavailable", reason: "no-pool", detail: "", coverage: COVERAGE }),
    tierBandHeadline({ kind: "unavailable", reason: "no-index", detail: "", coverage: COVERAGE }),
    tierBandHeadline({ kind: "unavailable", reason: "no-table", detail: "", coverage: COVERAGE }),
    tierBandHeadline({ kind: "unavailable", reason: "mixed-recipe", detail: "r1 / r2", coverage: COVERAGE }),
    tierBandHeadline({ kind: "unavailable", reason: "ordering-refused", detail: "duplicate-player", coverage: COVERAGE }),
    tierBandHeadline(reading({ placement: placement("unranked", null, null) })),
    tierBandHeadline(reading({ placement: placement("role-not-ordered", null, null) })),
  ];

  it("nessuna frase è vuota e nessuna è uguale a un'altra", () => {
    for (const s of sentences) expect(s.length).toBeGreaterThan(30);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("il listone senza indice di appetibilità dice «non lo so», non «senza fascia»", () => {
    const s = tierBandHeadline({
      kind: "unavailable",
      reason: "no-index",
      detail: "",
      coverage: { poolRows: 532, withVerdict: 0 },
    });
    expect(s).toBe(TIER_BAND_NO_INDEX);
    expect(s).toContain("non porta l'indice di appetibilità");
    expect(s).toContain("significa «non lo so»");
    // La frase NEGA esplicitamente la lettura sbagliata, come fa
    // OPPONENT_PRECEDENTS_NO_HISTORY con «nessuno lo vuole».
    expect(s).toContain("non significa «giocatore senza fascia»");
  });

  it("nessun listone, nessun tavolo e nessuna chiamata restano tre frasi distinte", () => {
    expect(TIER_BAND_NO_POOL).not.toBe(TIER_BAND_NO_INDEX);
    expect(TIER_BAND_NO_TABLE).not.toBe(TIER_BAND_NO_POOL);
    expect(TIER_BAND_NO_CALL).toContain("Nessun giocatore chiamato");
  });

  it("un ordinamento rifiutato porta a schermo il motivo misurato, non un generico errore", () => {
    const s = tierBandHeadline({
      kind: "unavailable",
      reason: "ordering-refused",
      detail: "invalid appeal ordering: C/2/centro-01:duplicate-player",
      coverage: COVERAGE,
    });
    expect(s).toContain("duplicate-player");
    expect(s).toContain("non è coerente");
  });

  it("«ruolo non ordinato» e «giocatore senza verdetto» non si confondono", () => {
    const unranked = tierBandHeadline(reading({ placement: placement("unranked", null, null) }));
    const notOrdered = tierBandHeadline(reading({ placement: placement("role-not-ordered", null, null) }));
    expect(unranked).toContain("non ha un verdetto su questo giocatore");
    expect(notOrdered).toContain("non copre questo ruolo");
    expect(unranked).not.toBe(notOrdered);
  });

  it("«fondo» dice che è FUORI dalle fasce, non che è nell'ultima", () => {
    const s = tierBandHeadline(reading({ placement: placement("fondo", null, 25), occupancy: null }));
    expect(s).toContain("Oltre l'ultima fascia");
    expect(s).toContain("posizione 25");
    expect(s).toContain("Non è una fascia peggiore");
  });
});

describe("la fascia, in una frase", () => {
  it("dice fascia, quante ne ha il ruolo, quanto è larga e la posizione", () => {
    const s = tierBandHeadline(reading());
    expect(s).toContain("Prima fascia di 9");
    expect(s).toContain("larga 8");
    expect(s).toContain("Posizione 3");
    expect(s).toContain("centrocampisti");
  });
});

// ─── 2. Che cosa è stato DAVVERO pagato in quella fascia stasera ─────────────

describe("il registro dei prezzi pagati", () => {
  it("elenca i singoli prezzi e li conta, senza affiancare due estremi", () => {
    const html = tierPricesHtml(facts());
    expect(html).toContain(">61<");
    expect(html).toContain(">74<");
    expect(html).toContain(">90<");
    expect(html).toContain("3 acquisti");
    // Nessuna coppia di estremi: la forma vietata da §D9 perimetro 2 non
    // rientra dalla finestra della vista dopo essere stata chiusa nel tipo.
    expect(html).not.toMatch(/minimo|massimo|da 61 a 90|61\s*[–—-]\s*90|range|banda/i);
  });

  it("un solo acquisto si conta al singolare", () => {
    expect(tierPricesHtml(facts({ pricesPaidInTier: [42] }))).toContain("1 acquisto");
  });

  it("in fascia e nessuno ha pagato: una FRASE, non uno zero", () => {
    const html = tierPricesHtml(facts({ pricesPaidInTier: [] }));
    expect(html).toContain("non è stato ancora comprato nessuno");
    expect(html).not.toMatch(/>0</);
  });

  it("fuori fascia il registro non esiste e non viene disegnato vuoto", () => {
    expect(tierPricesHtml(facts({ pricesPaidInTier: null, occupancy: null }))).toBe("");
  });

  it("i prezzi restano nell'ordine crescente che il motore ha prodotto", () => {
    const html = tierPricesHtml(facts({ pricesPaidInTier: [5, 12, 12, 30] }));
    const order = [...html.matchAll(/class="tier-band__price">(\d+)/g)].map((m) => m[1]);
    expect(order).toEqual(["5", "12", "12", "30"]);
  });
});

describe("quanti ne restano della fascia", () => {
  it("porta i liberi, l'originale misurato e i già presi", () => {
    const html = tierOccupancyHtml(facts());
    expect(html).toContain(">5<");
    expect(html).toContain("di 8");
    expect(html).toContain(">3<");
  });

  it("l'ultima fascia di un ruolo corto ne ha meno di tierSize, e lo dice", () => {
    const html = tierOccupancyHtml(
      facts({ occupancy: { tier: 4, originalSize: 6, freeCount: 6, takenCount: 0 } }),
    );
    expect(html).toContain("di 6");
  });

  it("fuori fascia non si inventa una contabilità: niente riquadro", () => {
    expect(tierOccupancyHtml(facts({ occupancy: null }))).toBe("");
  });

  it("singolare e plurale non producono «1 liberi»", () => {
    const html = tierOccupancyHtml(
      facts({ occupancy: { tier: 1, originalSize: 8, freeCount: 1, takenCount: 1 } }),
    );
    expect(html).toContain("1 libero");
    expect(html).toContain("1 già preso");
  });
});

// ─── La provenienza viaggia con la fascia, sempre ───────────────────────────

describe("la provenienza dell'ordine", () => {
  it("sta accanto alla fascia con sorgente, ricetta, criterio dei pareggi e numerosità", () => {
    const text = tierProvenanceText(facts(), COVERAGE);
    expect(text).toContain("deposito privato");
    expect(text).toContain("APPEAL-INDEX-RECIPE@1.0.0");
    expect(text).toContain("pareggi:");
    expect(text).toContain("18 righe di 20");
  });

  it("senza provenienza è «n/d», mai un valore di ripiego", () => {
    expect(tierProvenanceText(facts({ provenance: null }), COVERAGE)).toBe(
      "Ordine di appetibilità: n/d.",
    );
    expect(tierProvenanceText(null, null)).toBe("Ordine di appetibilità: n/d.");
  });
});

// ─── La guardia: il riquadro descrive, non raccomanda ───────────────────────

describe("anti-scope-creep — nessun output direttivo sulla superficie", () => {
  // Stessa famiglia di parole della guardia e2e già in uso
  // (e2e/live-facts.spec.ts §DIRECTIVE), più «conviene» e «prezzo atteso».
  //
  // «Punteggio» NON è in elenco, ed è una scelta motivata: compare una volta
  // sola, dentro `APPEAL_ORDER_TIE_BREAK` («punteggio decrescente, pareggi
  // rotti per playerId crescente»), che è la costante del motore copiata
  // verbatim nella provenienza. Descrive COME l'ordine iniettato è stato
  // messo in fila, non attribuisce un punteggio a nessuno — e riscriverla per
  // farla passare da qui significherebbe falsificare una provenienza. Che il
  // punteggio in sé non arrivi mai a schermo è verificato dove nasce:
  // src/tierOrdering.test.ts §"il punteggio dell'indice non entra".
  const DIRECTIVE =
    /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|dovresti|spingi|convien|ranking|projection|prezzo atteso/i;

  it("nessuna stringa esportata contiene un consiglio o un prezzo atteso", () => {
    const surfaces = [
      TIER_BAND_TITLE,
      TIER_BAND_NOTE,
      TIER_BAND_NO_CALL,
      TIER_BAND_NO_POOL,
      TIER_BAND_NO_INDEX,
      TIER_BAND_NO_TABLE,
      tierBandHeadline(reading()),
      tierPricesHtml(facts()),
      tierOccupancyHtml(facts()),
      tierProvenanceText(facts(), COVERAGE),
    ];
    for (const surface of surfaces) {
      // «nessun prezzo atteso» e «nessun consiglio» nella nota sono NEGAZIONI
      // del divieto, cioè la sua resa a schermo: si verificano a parte.
      const stripped = surface
        .replace(/nessun prezzo atteso/gi, "")
        .replace(/nessun consiglio/gi, "");
      expect({ surface, hit: DIRECTIVE.test(stripped) }).toEqual({ surface, hit: false });
    }
  });

  it("la nota dichiara i tre vincoli che senza di lei si perderebbero", () => {
    expect(TIER_BAND_NOTE).toContain("DAVVERO pagati");
    expect(TIER_BAND_NOTE).toContain("nessuna banda");
    expect(TIER_BAND_NOTE).toContain("riconferme pre-asta");
    expect(TIER_BAND_NOTE).toContain("il giudizio è tuo");
  });

  it("la forma parlata dice di chi parla, non solo la parola grande", () => {
    const spoken = tierBandSpoken(reading(), "C");
    expect(spoken).toContain("Fascia del giocatore chiamato");
    expect(spoken).toContain("centrocampisti");
    expect(spoken).toContain("Prima fascia");
    expect(tierBandSpoken({ kind: "no-call" }, "")).toContain(TIER_BAND_UNKNOWN_WORD);
  });

  // LA CONDIZIONE VINCOLANTE 1 DEL RECORD 2026-08-16, DOVE VIVE DAL 2026-08-29.
  //
  // «La fascia non si mostra senza dire da dove viene.» Lo diceva la riga di
  // provenienza a schermo; Pico ha chiesto di nasconderla e, messo davanti al
  // conflitto col proprio record, ha deciso «Nascondile, ma restano a voce».
  // `display: none` toglie un nodo anche dall'albero di accessibilità, quindi
  // senza queste tre righe la garanzia sarebbe semplicemente sparita — e
  // sarebbe sparita in silenzio, perché nessun'altra prova la cercava qui.
  //
  // Lo stato SENZA INDICE è nell'elenco perché è quello che l'app mostra su
  // ogni giocatore col listone statico: è lì che un verdetto senza fonte
  // farebbe più danno, ed è lì che «Ordine di appetibilità: n/d.» deve
  // arrivare a chi ascolta.
  it("la forma parlata porta la provenienza e il «nessun consiglio», che non sono più a schermo", () => {
    const spoken = tierBandSpoken(reading(), "C");
    expect(spoken).toContain(tierProvenanceText(facts(), COVERAGE));
    expect(spoken).toContain("il giudizio è tuo");

    const senzaIndice = tierBandSpoken(
      { kind: "unavailable", reason: "no-index", detail: "", coverage: COVERAGE },
      "C",
    );
    expect(senzaIndice).toContain("Ordine di appetibilità: n/d.");
    expect(senzaIndice).toContain("il giudizio è tuo");
  });
});
