import { describe, it, expect } from "vitest";
import { linkTopicToMatch } from "../src/matchLink.js";
import { readMatchKey } from "../src/title.js";
import { NOV_5_2045_MS, SEP_4_1200_MS, SEP_5_2045_MS, syntheticCalendar } from "./fixtures.js";

// IL LEGAME: per coppia di squadre e orario, mai per giornata letta dal titolo.
// Ogni stato dichiarato ha la sua prova, e in nessuno stato diverso da
// `RISOLTO` la giornata è valorizzata.

const key = readMatchKey("Alfa Calcio - Beta Sporting 20:45");

describe("legame topic → partita", () => {
  it("risolve quando una sola partita ha quella coppia e quell'orario", () => {
    const link = linkTopicToMatch(key, {
      calendar: syntheticCalendar,
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("RISOLTO");
    expect(link.matchday).toBe(3);
    expect(link.matchId).toBe("m-3-1");
    expect(link.calendarSource).toBe("calendario-sintetico");
  });

  it("risolve anche se le squadre sono scritte nell'ordine opposto", () => {
    const reversed = readMatchKey("Beta Sporting - Alfa Calcio 20:45");
    expect(
      linkTopicToMatch(reversed, {
        calendar: syntheticCalendar,
        observedAtEpochMs: SEP_4_1200_MS,
      }).state,
    ).toBe("RISOLTO");
  });

  it("senza calendario la giornata resta ignota", () => {
    const link = linkTopicToMatch(key, { calendar: [], observedAtEpochMs: SEP_4_1200_MS });
    expect(link.state).toBe("CALENDARIO_ASSENTE");
    expect(link.matchday).toBeNull();
  });

  it("con squadre che il calendario non conosce lo dice, invece di accostare", () => {
    const other = readMatchKey("Gamma FC - Delta United 20:45");
    const link = linkTopicToMatch(other, {
      calendar: syntheticCalendar,
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("SQUADRE_NON_RICONCILIATE");
    expect(link.matchday).toBeNull();
  });

  it("con la tabella di alias quelle stesse squadre si riconciliano", () => {
    const aliases = { "gamma fc": "alfa calcio", "delta united": "beta sporting" };
    const other = readMatchKey("Gamma FC - Delta United 20:45", aliases);
    const link = linkTopicToMatch(other, {
      calendar: syntheticCalendar,
      aliases,
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("RISOLTO");
  });

  it("con la coppia giusta e l'orario sbagliato non lega", () => {
    const link = linkTopicToMatch(readMatchKey("Alfa Calcio - Beta Sporting 18:00"), {
      calendar: syntheticCalendar,
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("NESSUNA_CORRISPONDENZA");
  });

  it("con più di un candidato non sceglie", () => {
    const link = linkTopicToMatch(key, {
      calendar: [
        ...syntheticCalendar,
        {
          matchday: 24,
          homeTeam: "Beta Sporting",
          awayTeam: "Alfa Calcio",
          kickoffLocal: "20:45",
          kickoffEpochMs: SEP_5_2045_MS + 3600_000,
        },
      ],
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("CORRISPONDENZA_AMBIGUA");
    expect(link.candidates).toBe(2);
    expect(link.matchday).toBeNull();
  });

  it("senza coppia o senza orario dichiara la chiave incompleta", () => {
    const link = linkTopicToMatch(readMatchKey("Alfa Calcio - Beta Sporting"), {
      calendar: syntheticCalendar,
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("CHIAVE_INCOMPLETA");
  });
});

describe("la finestra dei giorni, ai bordi", () => {
  it("dentro la finestra di difetto lega", () => {
    expect(
      linkTopicToMatch(key, { calendar: syntheticCalendar, observedAtEpochMs: SEP_4_1200_MS })
        .state,
    ).toBe("RISOLTO");
  });

  it("fuori dalla finestra non lega, anche con coppia e orario giusti", () => {
    const link = linkTopicToMatch(key, {
      calendar: [
        {
          matchday: 12,
          homeTeam: "Alfa Calcio",
          awayTeam: "Beta Sporting",
          kickoffLocal: "20:45",
          kickoffEpochMs: NOV_5_2045_MS,
        },
      ],
      observedAtEpochMs: SEP_4_1200_MS,
    });
    expect(link.state).toBe("NESSUNA_CORRISPONDENZA");
  });

  it("una finestra più stretta esclude una partita che quella larga includeva", () => {
    // Fra osservazione e calcio d'inizio ci sono circa 32 ore: dentro 4 giorni,
    // fuori da 1. È il bordo, e la funzione lo taglia dove è dichiarato.
    expect(
      linkTopicToMatch(key, {
        calendar: syntheticCalendar,
        observedAtEpochMs: SEP_4_1200_MS,
        windowDays: 4,
      }).state,
    ).toBe("RISOLTO");
    expect(
      linkTopicToMatch(key, {
        calendar: syntheticCalendar,
        observedAtEpochMs: SEP_4_1200_MS,
        windowDays: 1,
      }).state,
    ).toBe("NESSUNA_CORRISPONDENZA");
  });

  it("col momento dell'osservazione ignoto la finestra non si applica", () => {
    const link = linkTopicToMatch(key, {
      calendar: syntheticCalendar,
      observedAtEpochMs: null,
      windowDays: 1,
    });
    expect(link.state).toBe("RISOLTO");
  });
});
