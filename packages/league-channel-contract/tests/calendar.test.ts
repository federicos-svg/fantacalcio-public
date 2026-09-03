import { describe, expect, it } from "vitest";

import {
  COPPA_MATCHDAYS_2026_27,
  COPPA_STRUCTURE_2026_27,
  KNOCKOUT_IS_MINI_GROUP,
  competitionFixtures,
  cupScoringShape,
  expectedCupPhase,
  fixtureFor,
  fixturesOnMatchday,
  isCupMatchday,
  resolveKnockoutQualification,
  toGameweekContext,
} from "../src/calendar.js";
import {
  CALENDARIO,
  SFIDA_CAMPIONATO_G5,
  SFIDA_COPPA_G14_RITORNO,
  SFIDA_COPPA_G24_ANDATA,
  SFIDA_COPPA_G28_RITORNO,
  SFIDA_COPPA_G5,
} from "./fixtures.js";

describe("calendario a due competizioni", () => {
  it("una giornata di coppa porta due partite e produce due contesti distinti", () => {
    // La chiave è la coppia (competizione, giornata): nella 5ª si gioca in
    // campionato E in coppa, contro due avversari diversi e su due campi
    // diversi. Un tipo che assumesse una partita per giornata ne perderebbe una.
    const sfide = fixturesOnMatchday(CALENDARIO, 5);
    expect(sfide).toHaveLength(2);
    expect(sfide.map((riga) => riga.competition.competitionId)).toEqual(["c1", "c2"]);
    expect(sfide.map((riga) => riga.fixture.opponentTeamId)).toEqual(["t2", "t3"]);

    const campionato = toGameweekContext(SFIDA_CAMPIONATO_G5, 5, "c1");
    const coppa = toGameweekContext(SFIDA_COPPA_G5, 5, "c2");
    expect(campionato).toEqual({ matchday: 5, weAreHome: true });
    expect(coppa).toEqual({ matchday: 5, weAreHome: false });
    expect(campionato).not.toEqual(coppa);
  });

  it("andata e ritorno dello stesso girone hanno il campo invertito e due contesti distinti", () => {
    // §23: i gironi si giocano andata e ritorno. Il fattore campo di §14 è una
    // proprietà della singola partita, quindi le due gare non sono la stessa
    // gara vista due volte.
    const andata = toGameweekContext(SFIDA_COPPA_G5, 5, "c2");
    const ritorno = toGameweekContext(SFIDA_COPPA_G14_RITORNO, 14, "c2");

    expect(SFIDA_COPPA_G5.opponentTeamId).toBe(SFIDA_COPPA_G14_RITORNO.opponentTeamId);
    expect(SFIDA_COPPA_G5.leg).toBe("andata");
    expect(SFIDA_COPPA_G14_RITORNO.leg).toBe("ritorno");
    expect(andata).toEqual({ matchday: 5, weAreHome: false });
    expect(ritorno).toEqual({ matchday: 14, weAreHome: true });
  });

  it("si cerca per coppia, non per giornata", () => {
    expect(fixtureFor(CALENDARIO, "c1", 5)).toEqual(SFIDA_CAMPIONATO_G5);
    expect(fixtureFor(CALENDARIO, "c2", 5)).toEqual(SFIDA_COPPA_G5);
    expect(fixtureFor(CALENDARIO, "c1", 14)).toBeNull();
    expect(competitionFixtures(CALENDARIO, "c9")).toBeNull();
  });

  it("due sfide per la stessa coppia fermano la ricerca invece di far vincere la prima", () => {
    expect(() =>
      fixtureFor(
        {
          teamId: "t1",
          competitions: [
            {
              competition: { competitionId: "c1", kind: "campionato" },
              fixtures: [
                { competitionId: "c1", matchday: 5, venue: "casa" },
                { competitionId: "c1", matchday: 5, venue: "trasferta" },
              ],
            },
          ],
        },
        "c1",
        5,
      ),
    ).toThrow(/2 sfide per \(c1, giornata 5\)/);
  });
});

describe("toGameweekContext è fail-closed", () => {
  it("fallisce se la sfida non dice a quale competizione appartiene", () => {
    const senzaCompetizione = { matchday: 5, venue: "casa" } as const;
    expect(() => toGameweekContext(senzaCompetizione, 5, "c1")).toThrow(
      /competizione non osservata/,
    );
  });

  it("fallisce se la competizione osservata non è quella richiesta", () => {
    expect(() => toGameweekContext(SFIDA_COPPA_G5, 5, "c1")).toThrow(/lettura non allineata/);
  });

  it("fallisce se la giornata non è nota o non è quella attesa", () => {
    expect(() => toGameweekContext({ competitionId: "c1", venue: "casa" }, 5, "c1")).toThrow(
      /giornata non osservata/,
    );
    expect(() => toGameweekContext(SFIDA_CAMPIONATO_G5, 6, "c1")).toThrow(/lettura non allineata/);
    expect(() => toGameweekContext(SFIDA_CAMPIONATO_G5, 0, "c1")).toThrow(/giornata non valida/);
  });

  it("fallisce se il campo non è osservato: weAreHome non ha un valore neutro", () => {
    expect(() =>
      toGameweekContext({ competitionId: "c1", matchday: 5 }, 5, "c1"),
    ).toThrow(/campo non osservato/);
  });
});

describe("struttura di coppa del regolamento (§23)", () => {
  it("nove giornate: sei di girone, due di eliminazione, una di finale", () => {
    expect(COPPA_MATCHDAYS_2026_27).toEqual([5, 8, 11, 14, 17, 20, 24, 28, 32]);
    expect(COPPA_STRUCTURE_2026_27.groupStageMatchdays).toHaveLength(6);
    expect(COPPA_STRUCTURE_2026_27.knockoutMatchdays).toEqual([24, 28]);
    expect(COPPA_STRUCTURE_2026_27.finalMatchday).toBe(32);
    expect(isCupMatchday(5)).toBe(true);
    expect(isCupMatchday(6)).toBe(false);
  });

  it("girone ed eliminazione valgono 3/1/0, la finale è gara secca", () => {
    // Nei gironi i punti sono quelli del campionato; l'eliminazione diretta è
    // un mini girone di due squadre andata e ritorno, quindi il turno si legge
    // con gli stessi punti. La finale resta fuori dal mini girone.
    expect(cupScoringShape("girone")).toBe("punti_3_1_0");
    expect(cupScoringShape("eliminazione")).toBe("punti_3_1_0");
    expect(cupScoringShape("finale")).toBe("gara_secca");
    expect(KNOCKOUT_IS_MINI_GROUP).toBe(true);
  });

  it("andata e ritorno di un turno di eliminazione: due contesti, una forma di punteggio", () => {
    const andata = toGameweekContext(SFIDA_COPPA_G24_ANDATA, 24, "c2");
    const ritorno = toGameweekContext(SFIDA_COPPA_G28_RITORNO, 28, "c2");

    // Stesso avversario, campo invertito: due giornate distinte, ciascuna col
    // suo fattore campo di §14. La 28ª è l'ultima con il campo che conta.
    expect(SFIDA_COPPA_G24_ANDATA.opponentTeamId).toBe(SFIDA_COPPA_G28_RITORNO.opponentTeamId);
    expect(andata).toEqual({ matchday: 24, weAreHome: true });
    expect(ritorno).toEqual({ matchday: 28, weAreHome: false });
    expect(andata).not.toEqual(ritorno);

    expect(cupScoringShape("eliminazione")).toBe(cupScoringShape("girone"));
  });

  it("l'esito del turno NON lo calcola il contratto: a parità il regolamento tace", () => {
    // §23 non dichiara chi passa a parità nel mini girone da due e rinvia a una
    // fonte esterna per supplementari e rigori, che vieta di ricostruire.
    // Indovinare un criterio su un esito eliminatorio sarebbe il posto peggiore
    // dove indovinare: si fallisce in modo dichiarato.
    expect(() => resolveKnockoutQualification()).toThrow(
      /non è dichiarato dal regolamento/,
    );
    expect(() => resolveKnockoutQualification()).toThrow(/osserva la coppa, non la risolve/);
  });

  it("la fase attesa è un'attesa, non un'osservazione", () => {
    expect(expectedCupPhase(5)).toBe("girone");
    expect(expectedCupPhase(24)).toBe("eliminazione");
    expect(expectedCupPhase(32)).toBe("finale");
    expect(expectedCupPhase(6)).toBeNull();
    // Prevale l'osservato: una sfida di coppa in una giornata che il
    // regolamento non prevede resta nel calendario così com'è, e nessuna
    // funzione la corregge o la cancella.
    const fuoriCalendario = { competitionId: "c2", matchday: 6, venue: "casa" } as const;
    expect(expectedCupPhase(6)).toBeNull();
    expect(toGameweekContext(fuoriCalendario, 6, "c2")).toEqual({ matchday: 6, weAreHome: true });
  });
});
