import { describe, it, expect } from "vitest";
import {
  GEN_FORECAST_INSIGHT_ID,
  genForecastAuthorityLabel,
  genForecastInsightHtml,
  genForecastReadingText,
  genForecastReadingsText,
  genForecastRunTitle,
} from "./genForecastInsight.js";
import {
  GEN_FORECAST_CAP_LABEL,
  GEN_FORECAST_CAP_MARKER,
  parseListonePool,
  type ListoneGenForecast,
  type ListoneGenForecastTarget,
} from "./listone.js";

// Fixture SINTETICHE, come nel resto della suite: nessun giocatore reale,
// nessun run reale. Il payload passa dal validatore vero (`parseListonePool`)
// invece di essere costruito a mano, così questa spec non può provare una forma
// che il contratto rifiuterebbe.

const RECIPE = "GEN-RECIPE@1.0.0";
const PROTOCOL = "2.1.3";
const RUN = "refit-0000synthetic";

function forecastOf(targets: Record<string, unknown>): ListoneGenForecast {
  const pool = parseListonePool([
    {
      name: "Sintetico Uno",
      role: "C",
      club: "Club Gamma",
      quotation: 20,
      genForecast: {
        recipeVersion: RECIPE,
        protocolVersion: PROTOCOL,
        runId: RUN,
        authority: "advisory",
        targets,
      },
    },
  ]);
  return pool![0]!.genForecast!;
}

const PLAIN = forecastOf({
  T2: { value: 6.42, interval: null, status: "winner" },
  TN: { value: 24.1, interval: null, status: "winner", capApplied: false },
  T1: { value: 154.8, interval: null, status: "winner" },
});

describe("genForecastInsight — la riga di lettura", () => {
  it("legge i tre bersagli con gli stessi arrotondamenti della tabella", () => {
    const text = genForecastReadingsText(PLAIN);
    expect(text).toBe("Fantamedia prev. 6,4 · Presenze prev. 24 · Totale prev. 155");
  });

  it("porta l'autorità DAL DATO, non dal renderer", () => {
    expect(genForecastAuthorityLabel(PLAIN)).toBe(`previsioni di ricerca, advisory — ${RECIPE}`);
    expect(genForecastRunTitle(PLAIN)).toBe(`protocollo ${PROTOCOL} · run ${RUN}`);
    const html = genForecastInsightHtml(PLAIN);
    expect(html).toContain(`id="${GEN_FORECAST_INSIGHT_ID}"`);
    expect(html).toContain("previsioni di ricerca, advisory");
    expect(html).toContain(RECIPE);
    expect(html).toContain(PROTOCOL);
    expect(html).toContain(RUN);
  });

  it("dice il tetto degli esperti a parole, e solo quando il dato lo dichiara", () => {
    const capped = forecastOf({
      T2: { value: 6.42, interval: null, status: "winner" },
      TN: { value: 24.1, interval: null, status: "winner", capApplied: true },
      T1: { value: 154.8, interval: null, status: "winner" },
    });
    const text = genForecastReadingsText(capped);
    expect(text).toContain(`${GEN_FORECAST_CAP_MARKER} ${GEN_FORECAST_CAP_LABEL}`);
    expect(genForecastReadingsText(PLAIN)).not.toContain(GEN_FORECAST_CAP_LABEL);
    // Il tetto sta sulle presenze e su nient'altro.
    expect(text.split("·")[0]).not.toContain(GEN_FORECAST_CAP_LABEL);
  });

  it("nomina lo stato solo quando NON è «winner»", () => {
    const fallback = forecastOf({
      T2: { value: 6.42, interval: null, status: "B0" },
      TN: { value: 24.1, interval: null, status: "winner" },
      T1: { value: 154.8, interval: null, status: "winner" },
    });
    expect(genForecastReadingsText(fallback)).toContain("(B0)");
    expect(genForecastReadingsText(PLAIN)).not.toContain("(B0)");
    expect(genForecastReadingsText(PLAIN)).not.toContain("winner");
  });

  it("mostra l'intervallo quando c'è, così il punto non sembra più preciso del dato", () => {
    const withInterval = forecastOf({
      T2: { value: 6.42, interval: { lo: 6.1, hi: 6.83 }, status: "winner" },
      TN: { value: 24.1, interval: null, status: "winner" },
      T1: { value: 154.8, interval: null, status: "winner" },
    });
    expect(genForecastReadingsText(withInterval)).toContain("(intervallo 6,1–6,8)");
    // Oggi i raggi non esistono: senza intervallo non compare nessuna parentesi
    // che ne prometta uno.
    expect(genForecastReadingsText(PLAIN)).not.toContain("intervallo");
  });

  it("senza previsione non c'è riga — non una riga che dice «n/d»", () => {
    expect(genForecastInsightHtml(null)).toBe("");
    expect(genForecastInsightHtml(undefined)).toBe("");
  });

  it("non introduce nessun output direttivo", () => {
    const html = genForecastInsightHtml(PLAIN).toLowerCase();
    for (const word of ["prezzo", "consigl", "fair", "target_band", "massimo", "offri"]) {
      expect(html).not.toContain(word);
    }
  });

  it("passa ogni parola del dato dall'escape dell'HTML", () => {
    const target: ListoneGenForecastTarget = { value: 1, interval: null, status: "winner" };
    const hostile: ListoneGenForecast = {
      recipeVersion: '"><img src=x onerror="alert(1)">',
      protocolVersion: "<b>2</b>",
      runId: "run & co",
      authority: "advisory",
      targets: { T2: target, TN: target, T1: target },
    };
    const html = genForecastInsightHtml(hostile);
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&amp;");
  });
});
