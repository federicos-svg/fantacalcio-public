import { describe, it, expect } from "vitest";
import {
  AVVISO_LABELS,
  EXPERT_INSIGHT_EMPTY_TEXT,
  EXPERT_INSIGHT_PROVENANCE,
  EXPERT_INSIGHT_TITLE,
  FONTE_LABELS,
  FONTE_NON_DICHIARATA,
  EXPERT_INSIGHT_LABEL_TEXT,
  TITOLARITA_LABELS,
  TITOLARITA_LABELS_COVER_VOCABULARY,
  expertInsightBodyHtml,
  expertInsightChips,
  expertInsightChipsHtml,
  expertInsightLabel,
  expertInsightLabelHtml,
  expertInsightProseHtml,
  expertInsightQualityHtml,
  expertInsightSpoken,
  formatSchedaDate,
  gerarchiaLabel,
  sharePercentHtml,
  titolaritaHtml,
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
  it("le etichette coprono esattamente il vocabolario della titolarità", () => {
    expect(TITOLARITA_LABELS_COVER_VOCABULARY).toBe(true);
    expect(TITOLARITA_LABELS).toEqual({
      riserva: "riserva",
      ballottaggio: "ballottaggio",
      titolare: "titolare",
    });
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

describe("la label unica «Scheda Esperto»", () => {
  // ASSERZIONE RISCRITTA, NON CANCELLATA. Prima cercava a schermo le quattro
  // pastiglie di caveat; Pico le ha ridotte a una sola label, e la garanzia si
  // è spostata dallo schermo al `title` della label e al contratto. Il test
  // segue la garanzia dove è andata: la label deve esserci in TUTTI e cinque
  // gli stati, e il suo tooltip deve nominare i tre campi del payload.
  it.each([...EXPERT_INSIGHT_AVAILABILITIES])("in stato %s la label è una sola e dice cos'è", (availability) => {
    const view =
      availability === "available"
        ? viewOf({ nota: "Due righe." })
        : unknownExpertInsight(availability as Exclude<ExpertInsightAvailability, "available">);
    const html = expertInsightLabelHtml(view);
    expect(html).toContain('id="player-insight-label"');
    expect(html).toContain(EXPERT_INSIGHT_LABEL_TEXT);
    // Una sola: nessun residuo delle quattro scritte di prima.
    expect(html).not.toContain("PARERE DI TERZI");
    expect(html).not.toContain("NON VALIDATO");
    expect(html).not.toContain("FUORI DAL CALCOLO");
    expect(html.match(/player-insight-label/g)).toHaveLength(1);
  });

  it("il tooltip della label nasce dai tre campi del payload, non da un letterale", () => {
    const title = expertInsightLabel(viewOf({ nota: "x" })).title;
    expect(title).toContain("validated: false");
    expect(title).toContain("directive: false");
    expect(title).toContain("contributesToIndex: false");
    expect(title).toContain("trascritta a mano prima dell'asta");
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

  // Nello stato pieno l'etichetta di qualità NON si stampa più: diceva la
  // stessa cosa della label. Resta nel payload e nella forma parlata.
  it("nello stato pieno la qualità non è più una seconda riga a schermo", () => {
    const view = viewOf({ titolarita: "titolare", nota: "Contesto." });
    expect(expertInsightBodyHtml(view)).not.toContain("player-insight-quality");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.available);
    expect(expertInsightSpoken(view)).toContain(EXPERT_INSIGHT_QUALITY_LABELS.available);
  });

  it("nei quattro stati vuoti la qualità resta a schermo: lì è il nome dello stato", () => {
    for (const availability of UNKNOWN_STATES) {
      expect(expertInsightBodyHtml(unknownExpertInsight(availability))).toContain(
        EXPERT_INSIGHT_QUALITY_LABELS[availability],
      );
    }
  });
});

describe("lo strato visivo", () => {
  // ASSERZIONE RISCRITTA, NON CANCELLATA. Prima verificava che la scala
  // tenesse scritte tutte e tre le parole con una sola accesa; Pico ha deciso
  // che si mostra solo il valore dichiarato, quindi il test verifica ora
  // l'opposto — che gli altri due NON compaiano — che è la stessa proprietà
  // («si legge una risposta, non un quiz») letta dal verso giusto.
  it("la titolarità mostra solo il valore dichiarato, mai le altre opzioni", () => {
    const html = titolaritaHtml(viewOf({ titolarita: "ballottaggio" }));
    expect(html).toContain("ballottaggio");
    expect(html).not.toContain("riserva");
    expect(html).not.toContain("titolare");
    expect(html).toContain('id="player-insight-track-ballottaggio"');
    expect(html.match(/expert-titolarita__value/g)).toHaveLength(1);
  });

  it.each(["titolare", "ballottaggio", "riserva"] as const)(
    "il valore %s compare per intero: la parola non è mai abbreviata nel markup",
    (value) => {
      const html = titolaritaHtml(viewOf({ titolarita: value }));
      expect(html).toContain(`>${TITOLARITA_LABELS[value]}</span>`);
      expect(html).not.toContain("…");
      expect(html).not.toContain("...");
    },
  );

  it("senza titolarità dichiarata non si disegna nessuna pastiglia: una pastiglia spenta sarebbe un valore", () => {
    const html = titolaritaHtml(viewOf({ nota: "solo prosa" }));
    expect(html).toContain('id="player-insight-track-missing"');
    expect(html).toContain("non dichiarata dalla scheda");
    expect(html).not.toContain("expert-titolarita__value");
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
    expect(html).not.toContain("expert-titolarita");
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
    // La forma parlata porta l'etichetta di qualità per intero: chi naviga a
    // voce non ha la label in alto a destra.
    expect(spoken).toContain(EXPERT_INSIGHT_LABEL_TEXT);
    expect(spoken).toContain("non validato");
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
