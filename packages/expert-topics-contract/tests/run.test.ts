import { describe, it, expect } from "vitest";
import { runParser, type DepositedPage } from "../src/run.js";
import { roleOptions, singleStaffPage, topicPage, SEP_4_1200_MS, syntheticCalendar } from "./fixtures.js";

// IL GIRO: raw prima, parsing poi — e il referto che non contraddice mai i
// conteggi che gli stanno accanto.

const FINGERPRINT = "a".repeat(64);

function page(overrides: Partial<DepositedPage> = {}): DepositedPage {
  return {
    raw: topicPage(),
    topicId: "999001",
    canonicalUrl: "viewtopic-canonico",
    pageOffset: 0,
    declaredPages: 1,
    fingerprint: FINGERPRINT,
    depositConfirmed: true,
    observedAtEpochMs: SEP_4_1200_MS,
    ...overrides,
  };
}

describe("raw prima, parsing poi", () => {
  it("una pagina senza deposito confermato non viene analizzata", () => {
    const result = runParser([page({ depositConfirmed: false })], {
      ...roleOptions,
      calendar: syntheticCalendar,
    });
    expect(result.report.outcome).toBe("RAW_NON_DEPOSITATO");
    expect(result.report.posts).toBe(0);
    expect(result.extract).toBeNull();
  });

  it("una pagina senza impronta valida non viene analizzata", () => {
    const result = runParser([page({ fingerprint: "non-esadecimale" })], roleOptions);
    expect(result.report.outcome).toBe("RAW_NON_DEPOSITATO");
    expect(result.extract).toBeNull();
  });

  it("accetta un'impronta breve, che è ciò che il nome del deposito porta", () => {
    const result = runParser([page({ fingerprint: "abcdef012345" })], {
      ...roleOptions,
      calendar: syntheticCalendar,
    });
    expect(result.report.outcome).toBe("OK");
    expect(result.report.shortFingerprints).toEqual(["abcdef012345"]);
  });

  it("senza pagine l'esito lo dice", () => {
    expect(runParser([], roleOptions).report.outcome).toBe("NESSUN_RAW");
  });
});

describe("esiti del giro", () => {
  it("con tutto a posto è OK e lega la partita", () => {
    const result = runParser([page()], { ...roleOptions, calendar: syntheticCalendar });
    expect(result.report.outcome).toBe("OK");
    expect(result.report.matchLink.RISOLTO).toBe(1);
    expect(result.extract?.topics[0]?.link.matchday).toBe(3);
  });

  it("senza calendario nessun legame è risolto, e l'esito lo dice", () => {
    const result = runParser([page()], roleOptions);
    expect(result.report.outcome).toBe("LEGAME_NON_RISOLTO");
    expect(result.report.matchLink.CALENDARIO_ASSENTE).toBe(1);
    expect(result.extract?.topics[0]?.link.matchday).toBeNull();
  });

  it("se il marcatore non compare mai, i ruoli sono dichiarati non verificati", () => {
    const result = runParser([page()], {
      staffRankMarker: "images/ranks/un-altro-marcatore.png",
      sourceHost: roleOptions.sourceHost,
      calendar: syntheticCalendar,
    });
    expect(result.report.outcome).toBe("RUOLI_NON_VERIFICATI");
    expect(result.report.staffMarkerObserved).toBe(false);
    // L'estratto esiste comunque: «non verificato» non è «non prodotto».
    expect(result.extract).not.toBeNull();
  });

  it("con meno pagine di quelle dichiarate il parsing è parziale", () => {
    const result = runParser([page({ declaredPages: 3 })], {
      ...roleOptions,
      calendar: syntheticCalendar,
    });
    expect(result.report.outcome).toBe("PARSING_PARZIALE");
    expect(result.report.pagination.incomplete).toBe(1);
  });

  it("con paginazione ignota non promette completezza", () => {
    const result = runParser([page({ declaredPages: null })], {
      ...roleOptions,
      calendar: syntheticCalendar,
    });
    expect(result.report.pagination.unknown).toBe(1);
    expect(result.extract?.topics[0]?.pagination.complete).toBeNull();
  });

  it("su una pagina senza post riconosciuti lo dichiara", () => {
    const result = runParser([page({ raw: "<html><body>niente</body></html>" })], roleOptions);
    expect(result.report.outcome).toBe("NESSUN_POST_RICONOSCIUTO");
  });
});

describe("più pagine dello stesso topic", () => {
  it("le unisce, non conta due volte lo stesso post e somma gli offset", () => {
    const result = runParser(
      [
        page({ raw: singleStaffPage("Alfa Calcio - Beta Sporting 20:45", "42"), topicId: "42", declaredPages: 2 }),
        page({
          raw: singleStaffPage("Alfa Calcio - Beta Sporting 20:45", "42"),
          topicId: "42",
          pageOffset: 15,
          declaredPages: 2,
          fingerprint: "b".repeat(64),
        }),
      ],
      { ...roleOptions, calendar: syntheticCalendar },
    );
    expect(result.report.topics).toBe(1);
    // Lo stesso identificativo di post su due pagine è lo stesso post.
    expect(result.report.posts).toBe(1);
    expect(result.extract?.topics[0]?.pagination.depositedOffsets).toEqual([0, 15]);
    expect(result.extract?.topics[0]?.pagination.complete).toBe(true);
  });
});

describe("che cosa esce dal referto", () => {
  it("porta solo forme e conteggi: nessun titolo, nessun nome, nessun testo", () => {
    const result = runParser([page()], { ...roleOptions, calendar: syntheticCalendar });
    const serialised = JSON.stringify(result.report);
    for (const forbidden of [
      "Alfa Calcio",
      "Beta Sporting",
      "autore-uno",
      "autore-due",
      "Testo sintetico",
      "Risposta sintetica",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(result.report.titleShapes).toEqual(["P-P ORA"]);
  });

  it("l'estratto è dichiarato privato e non ridistribuibile", () => {
    const result = runParser([page()], { ...roleOptions, season: "2026_27" });
    expect(result.extract?.privateOnly).toBe(true);
    expect(result.extract?.redistributionAllowed).toBe(false);
    expect(result.extract?.season).toBe("2026_27");
  });

  it("stampa versione del parser e del contratto accanto a ogni uscita", () => {
    const result = runParser([page()], roleOptions);
    expect(result.report.parserVersion).toBe("expert-topics-parser-v1.0.0");
    expect(result.report.contractVersion).toBe("expert-topics-contract-v1");
    expect(result.extract?.parserVersion).toBe(result.report.parserVersion);
  });
});
