import { describe, it, expect } from "vitest";
import {
  AVVISO_LABELS,
  EXPERT_INSIGHT_EMPTY_TEXT,
  EXPERT_INSIGHT_PROVENANCE,
  EXPERT_INSIGHT_TITLE,
  FONTE_LABELS,
  FONTE_NON_DICHIARATA,
  TITOLARITA_LADDER,
  TITOLARITA_LADDER_COVERS_VOCABULARY,
  expertInsightBodyHtml,
  expertInsightChips,
  expertInsightChipsHtml,
  expertInsightFlags,
  expertInsightFlagsHtml,
  expertInsightProseHtml,
  expertInsightQualityHtml,
  expertInsightSpoken,
  formatSchedaDate,
  gerarchiaLabel,
  sharePercentHtml,
  titolaritaLadderHtml,
} from "./expertInsight.js";
import {
  AVVISO_VALUES,
  EXPERT_INSIGHT_AVAILABILITIES,
  EXPERT_INSIGHT_QUALITY_LABELS,
  indexSchede,
  resolveExpertInsight,
  unknownExpertInsight,
  type ExpertInsightAvailability,
  type ExpertInsightView,
  type ExpertScheda,
} from "../expertScheda.js";
import { listonePlayerKey } from "./listone.js";

// Solo fixture sintetiche — nessun giocatore, squadra, handle o URL reale.

const PLAYER = "Dario Placeholder";
const CLUB = "ClubQuattro";
const KEY = listonePlayerKey({ name: PLAYER, club: CLUB });

function viewOf(scheda: Omit<ExpertScheda, "player" | "club">): ExpertInsightView {
  return resolveExpertInsight(
    { ok: true, byPlayerKey: indexSchede([{ player: PLAYER, club: CLUB, ...scheda }]) },
    KEY,
  );
}

const UNKNOWN_STATES = EXPERT_INSIGHT_AVAILABILITIES.filter(
  (a) => a !== "available",
) as readonly Exclude<ExpertInsightAvailability, "available">[];

// Ogni famiglia direttiva che non deve mai comparire su questa superficie —
// stessa guardia di src/ui/liveFacts.test.ts, applicata a tutto l'HTML e a
// tutte le costanti di testo di questo modulo.
const DIRECTIVE_WORDS = [
  "fair to me",
  "fair_to_me",
  "target band",
  "target_band",
  "stretch cap",
  "max bid",
  "prezzo consigliato",
  "conviene",
  "consigliamo",
  "ti consiglio",
];

/**
 * «Punteggio» e «classifica» non possono essere vietati alla lettera: possono
 * comparire nelle stringhe di questo modulo solo per dire che NON ci sono. Il
 * divieto è quindi sulla forma AFFERMATIVA — ogni occorrenza va negata.
 */
const DENIED_ONLY_WORDS = ["punteggio", "classifica"];

describe("vocabolario e formattazione", () => {
  it("la scala copre esattamente il vocabolario della titolarità, dal basso in alto", () => {
    expect(TITOLARITA_LADDER_COVERS_VOCABULARY).toBe(true);
    expect(TITOLARITA_LADDER).toEqual(["riserva", "ballottaggio", "titolare"]);
  });

  it("la data si formatta affettando la stringa ISO, senza Date e senza Intl", () => {
    expect(formatSchedaDate("2026-08-30")).toBe("30/08/2026");
    expect(formatSchedaDate("2026-01-01")).toBe("01/01/2026");
    // Una stringa che non è una data ISO esce com'è invece di diventare `NaN/NaN`.
    expect(formatSchedaDate("presto")).toBe("presto");
  });

  it("la gerarchia si legge come una posizione nel ruolo, mai come un punteggio", () => {
    expect(gerarchiaLabel(1)).toBe("1ª scelta");
    expect(gerarchiaLabel(3)).toBe("3ª scelta");
  });
});

describe("i tre fatti di onestà sono a schermo, non solo nel JSON", () => {
  it.each([...EXPERT_INSIGHT_AVAILABILITIES])("in stato %s il riquadro si dichiara non validato", (availability) => {
    const view =
      availability === "available"
        ? viewOf({ nota: "Due righe." })
        : unknownExpertInsight(availability as Exclude<ExpertInsightAvailability, "available">);
    const html = expertInsightFlagsHtml(view);
    expect(html).toContain('id="player-insight-flag-validated"');
    expect(html).toContain("NON VALIDATO");
    expect(html).toContain('id="player-insight-flag-directive"');
    expect(html).toContain("NON È UN CONSIGLIO");
    expect(html).toContain('id="player-insight-flag-index"');
    expect(html).toContain("FUORI DAL CALCOLO");
    expect(html).toContain("PARERE DI TERZI");
  });

  it("le tre pastiglie nascono dai tre campi del payload, non da un letterale", () => {
    const view = viewOf({ nota: "x" });
    expect(expertInsightFlags(view).map((f) => f.id)).toEqual([
      "player-insight-flag-source",
      "player-insight-flag-validated",
      "player-insight-flag-directive",
      "player-insight-flag-index",
    ]);
    // Il titolo di ciascuna nomina il campo da cui viene: la pastiglia e il
    // dato non possono divergere in silenzio.
    const titles = expertInsightFlags(view).map((f) => f.title).join(" ");
    expect(titles).toContain("validated: false");
    expect(titles).toContain("directive: false");
    expect(titles).toContain("contributesToIndex: false");
  });

  it("l'etichetta di qualità è portata dal dato, mai ricostruita dal renderer", () => {
    for (const availability of EXPERT_INSIGHT_AVAILABILITIES) {
      const view =
        availability === "available"
          ? viewOf({ nota: "x" })
          : unknownExpertInsight(availability as Exclude<ExpertInsightAvailability, "available">);
      expect(expertInsightQualityHtml(view)).toContain(EXPERT_INSIGHT_QUALITY_LABELS[availability]);
    }
  });
});

describe("lo strato visivo", () => {
  it("la scala accende un solo gradino e tiene scritte tutte e tre le parole", () => {
    const html = titolaritaLadderHtml(viewOf({ titolarita: "ballottaggio" }));
    expect(html).toContain("riserva");
    expect(html).toContain("ballottaggio");
    expect(html).toContain("titolare");
    // Il colore non è mai l'unico canale: il gradino attivo è marcato nel DOM.
    expect(html.match(/expert-ladder__step--on/g)).toHaveLength(1);
    expect(html).toContain('id="player-insight-track-ballottaggio" aria-current="true"');
    expect(html).not.toContain('id="player-insight-track-titolare" aria-current');
  });

  it("senza titolarità dichiarata la scala non si disegna: tre gradini spenti si leggerebbero «riserva»", () => {
    const html = titolaritaLadderHtml(viewOf({ nota: "solo prosa" }));
    expect(html).toContain('id="player-insight-track-missing"');
    expect(html).toContain("non dichiarata dalla scheda");
    expect(html).not.toContain("expert-ladder__step");
  });

  it("la quota del ballottaggio porta la barra E la cifra, e la cifra resta leggibile", () => {
    const html = sharePercentHtml(viewOf({ titolarita: "ballottaggio", percentuale: 60 }));
    expect(html).toContain("width:60%");
    expect(html).toContain("60% secondo la scheda");
  });

  it("una percentuale fuori scala viene riportata dentro invece di sfondare la barra", () => {
    const wide = sharePercentHtml({ ...viewOf({ titolarita: "titolare" }), percentuale: 140 });
    expect(wide).toContain("width:100%");
    const negative = sharePercentHtml({ ...viewOf({ titolarita: "titolare" }), percentuale: -5 });
    expect(negative).toContain("width:0%");
  });

  it("senza percentuale non c'è barra: nessuna barra vuota da interpretare", () => {
    expect(sharePercentHtml(viewOf({ titolarita: "titolare" }))).toBe("");
  });

  it("le pastiglie portano famiglia e valore per esteso, nell'ordine dichiarato", () => {
    const view = viewOf({
      gerarchia: 2,
      rigori: "designato",
      piazzati: ["punizioni", "angoli"],
      avvisi: ["mercato", "rischio_fisico"],
    });
    expect(expertInsightChips(view).map((c) => `${c.label}:${c.value}`)).toEqual([
      "gerarchia:2ª scelta",
      "rigori:designato",
      "piazzati:punizioni",
      "piazzati:angoli",
      "avviso:mercato",
      "avviso:rischio fisico",
    ]);
    const html = expertInsightChipsHtml(view);
    // L'avviso non si distingue per la sola tinta: porta un marcatore testuale.
    expect(html.match(/expert-chip__mark/g)).toHaveLength(2);
    expect(html.match(/expert-chip--warn/g)).toHaveLength(2);
  });

  it.each([...AVVISO_VALUES])("l'avviso %s è scritto per esteso, non solo colorato", (avviso) => {
    const html = expertInsightChipsHtml(viewOf({ avvisi: [avviso] }));
    expect(html).toContain(AVVISO_LABELS[avviso]);
    expect(html).toContain(`id="player-insight-chip-${avviso}"`);
  });

  it("senza segnali non c'è contenitore di pastiglie vuoto", () => {
    expect(expertInsightChipsHtml(viewOf({ nota: "solo prosa" }))).toBe("");
  });
});

describe("lo strato di prosa", () => {
  it("la nota scritta arriva intera, con l'attribuzione e la data accanto", () => {
    const html = expertInsightProseHtml(
      viewOf({ nota: "Rinnovo non firmato: se parte a fine mercato la scheda cambia.", fonte: "scheda", aggiornata: "2026-08-30" }),
    );
    expect(html).toContain("Rinnovo non firmato: se parte a fine mercato la scheda cambia.");
    expect(html).toContain(FONTE_LABELS.scheda);
    expect(html).toContain("30/08/2026");
    // La provenienza sta accanto alla data, non in una nota a piè di pannello:
    // «scritta a mano prima dell'asta» è un fatto sulla freschezza del dato.
    expect(html).toContain(EXPERT_INSIGHT_PROVENANCE);
  });

  it("la prosa è escapata: una scheda scritta a mano non può iniettare markup", () => {
    const html = expertInsightProseHtml(viewOf({ nota: "<img src=x onerror=alert(1)>" }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("senza nota il posto della prosa lo dichiara invece di restare muto", () => {
    const html = expertInsightProseHtml(viewOf({ titolarita: "titolare" }));
    expect(html).toContain('id="player-insight-prose-empty"');
    expect(html).toContain("non porta note scritte");
  });

  it("senza fonte e senza data non si inventa né l'una né l'altra", () => {
    const html = expertInsightProseHtml(viewOf({ nota: "x" }));
    expect(html).toContain(FONTE_NON_DICHIARATA);
    expect(html).toContain("senza data");
  });
});

describe("i quattro stati «non lo so» si vedono che non sanno", () => {
  it.each(UNKNOWN_STATES)("lo stato %s rende una frase propria e nessun contenuto", (availability) => {
    const html = expertInsightBodyHtml(unknownExpertInsight(availability));
    expect(html).toContain('id="player-insight-empty"');
    expect(html).toContain(EXPERT_INSIGHT_EMPTY_TEXT[availability]);
    // Niente strato visivo e niente prosa: il riquadro non può sembrare pieno.
    expect(html).not.toContain("expert-ladder");
    expect(html).not.toContain("expert-chip");
    expect(html).not.toContain("expert-prose");
  });

  it("le quattro frasi sono quattro, e sono diverse fra loro", () => {
    const texts = UNKNOWN_STATES.map((a) => EXPERT_INSIGHT_EMPTY_TEXT[a]);
    expect(new Set(texts).size).toBe(4);
  });

  it("lo stato available rende invece entrambi gli strati", () => {
    const html = expertInsightBodyHtml(viewOf({ titolarita: "titolare", nota: "Contesto." }));
    expect(html).toContain("expert-insight__visual");
    expect(html).toContain("expert-prose");
    expect(html).not.toContain('id="player-insight-empty"');
  });
});

describe("forma parlata e perimetro", () => {
  it("l'aria-label dice lo stato, i segnali, la prosa e i tre caveat", () => {
    const spoken = expertInsightSpoken(
      viewOf({ titolarita: "ballottaggio", percentuale: 60, rigori: "designato", nota: "Contesto." }),
    );
    expect(spoken).toContain(EXPERT_INSIGHT_QUALITY_LABELS.available);
    expect(spoken).toContain("titolarità ballottaggio al 60 per cento");
    expect(spoken).toContain("rigori designato");
    expect(spoken).toContain("Contesto.");
    expect(spoken).toContain("non validato");
    expect(spoken).toContain("non è un consiglio");
  });

  it.each(UNKNOWN_STATES)("in stato %s l'aria-label dice perché non c'è niente", (availability) => {
    const spoken = expertInsightSpoken(unknownExpertInsight(availability));
    expect(spoken).toContain(EXPERT_INSIGHT_QUALITY_LABELS[availability]);
    expect(spoken).toContain(EXPERT_INSIGHT_EMPTY_TEXT[availability]);
  });

  it("nessuna parola direttiva in nessuna stringa di questo modulo", () => {
    const surfaces = [
      EXPERT_INSIGHT_TITLE,
      EXPERT_INSIGHT_PROVENANCE,
      ...Object.values(EXPERT_INSIGHT_EMPTY_TEXT),
      expertInsightBodyHtml(
        viewOf({
          titolarita: "titolare",
          percentuale: 80,
          gerarchia: 1,
          rigori: "designato",
          piazzati: ["punizioni"],
          avvisi: ["mercato"],
          nota: "Contesto.",
          fonte: "staff",
          aggiornata: "2026-08-30",
        }),
      ),
      ...UNKNOWN_STATES.map((a) => expertInsightBodyHtml(unknownExpertInsight(a))),
    ].join(" \n ");
    const lower = surfaces.toLowerCase();
    for (const word of DIRECTIVE_WORDS) {
      expect(lower, `parola direttiva «${word}» comparsa nel riquadro`).not.toContain(word);
    }
    for (const word of DENIED_ONLY_WORDS) {
      const affirmative = new RegExp(`(?<!nessun |nessuna )${word}`, "g");
      expect(
        affirmative.test(lower),
        `«${word}» compare in forma affermativa: qui può esistere solo come negazione`,
      ).toBe(false);
    }
  });
});
