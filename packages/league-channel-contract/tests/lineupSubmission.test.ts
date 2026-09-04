import { describe, expect, it } from "vitest";

import type { Lineup } from "../../league-gameweek/src/gameweekSimulator.js";
import {
  diffLineups,
  fromLineup,
  notAttemptedOutcome,
  outcomeFromReadBack,
  rejectedOutcome,
  toSubmission,
} from "../src/lineupSubmission.js";
import { FORMAZIONE } from "./fixtures.js";

const LINEUP: Lineup = {
  module: "442",
  goalkeeperId: "p1",
  starterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
  benchIds: ["p12", "p13", "p14", "p15", "p16"],
};

describe("dalla formazione calcolata a quella osservata", () => {
  it("fromLineup porta modulo, undici e panchina, e aggiunge competizione e flag", () => {
    const osservata = fromLineup(LINEUP, "c1", { hidden: true, allCompetitions: false });
    expect(osservata.competitionId).toBe("c1");
    expect(osservata.module).toBe("442");
    expect(osservata.starterIds).toEqual(LINEUP.starterIds);
    expect(osservata.benchIds).toEqual(LINEUP.benchIds);
    expect(osservata.flags).toEqual({ hidden: true, allCompetitions: false });
  });

  it("competizione e «vale per tutte le competizioni» sono due cose diverse", () => {
    // Una formazione calcolata per il campionato e inviata anche alla coppa
    // resta calcolata contro l'avversario del campionato: il flag dice che cosa
    // ne farà la piattaforma, non per chi è stata pensata.
    const osservata = fromLineup(LINEUP, "c1", { hidden: false, allCompetitions: true });
    expect(osservata.competitionId).toBe("c1");
    expect(osservata.flags.allCompetitions).toBe(true);
  });

  it("un invio con una competizione diversa da quella della formazione si ferma", () => {
    const osservata = fromLineup(LINEUP, "c1", { hidden: false, allCompetitions: false });
    expect(() => toSubmission(5, "c2", osservata)).toThrow(/calcolata per c1/);
    expect(() => toSubmission(0, "c1", osservata)).toThrow(/giornata non valida/);
    expect(toSubmission(5, "c1", osservata)).toEqual({
      matchday: 5,
      competitionId: "c1",
      lineup: osservata,
      leagueRuleVersion: "2026_27_v1",
    });
  });
});

describe("diffLineups confronta indice per indice", () => {
  it("due formazioni identiche non hanno differenze", () => {
    expect(diffLineups(FORMAZIONE, { ...FORMAZIONE })).toEqual([]);
  });

  it("uno scambio di due posizioni in panchina è una differenza, non un pareggio", () => {
    // §10 dà cinque sostituzioni: quando i senza voto sono più dei cambi
    // disponibili, chi entra lo decide l'ordine della panchina. Due panchine
    // con gli stessi nomi in ordine diverso sono due formazioni diverse, e una
    // diff insiemistica nasconderebbe proprio il caso in cui la piattaforma ha
    // riordinato quel che avevamo scelto.
    const riletta = {
      ...FORMAZIONE,
      benchIds: ["p12", "p14", "p13", "p15", "p16"],
    };

    expect(diffLineups(FORMAZIONE, riletta)).toEqual([
      { field: "benchIds", index: 1, a: "p13", b: "p14" },
      { field: "benchIds", index: 2, a: "p14", b: "p13" },
    ]);
  });

  it("una panchina più corta è una differenza in ogni posizione mancante", () => {
    const troncata = { ...FORMAZIONE, benchIds: ["p12", "p13", "p14"] };
    expect(diffLineups(FORMAZIONE, troncata)).toEqual([
      { field: "benchIds", index: 3, a: "p15", b: null },
      { field: "benchIds", index: 4, a: "p16", b: null },
    ]);
  });

  it("competizione, modulo, portiere e flag entrano nel confronto", () => {
    const altra = {
      ...FORMAZIONE,
      competitionId: "c2",
      module: "352" as const,
      goalkeeperId: "p12",
      flags: { hidden: true, allCompetitions: true },
    };
    expect(diffLineups(FORMAZIONE, altra)).toEqual([
      { field: "competitionId", index: null, a: "c1", b: "c2" },
      { field: "module", index: null, a: "442", b: "352" },
      { field: "goalkeeperId", index: null, a: "p1", b: "p12" },
      { field: "flags.hidden", index: null, a: false, b: true },
      { field: "flags.allCompetitions", index: null, a: false, b: true },
    ]);
  });
});

describe("esito dell'invio", () => {
  it("una rilettura identica è confermata", () => {
    const esito = outcomeFromReadBack(FORMAZIONE, { ...FORMAZIONE });
    expect(esito.status).toBe("confermato");
    expect(esito.differences).toEqual([]);
    expect(esito.leagueRuleVersion).toBe("2026_27_v1");
  });

  it("una rilettura diversa è divergente e porta le posizioni, non un riassunto", () => {
    const riletta = { ...FORMAZIONE, benchIds: ["p12", "p14", "p13", "p15", "p16"] };
    const esito = outcomeFromReadBack(FORMAZIONE, riletta);
    expect(esito.status).toBe("divergente");
    expect(esito.differences).toHaveLength(2);
    expect(esito.reason).toContain("2 posizioni");
  });

  it("«rifiutato» e «non tentato» restano due esiti distinti", () => {
    // Hanno cause e rimedi opposti: «ci hanno detto di no» e «non abbiamo
    // provato» non si riassumono in un fallimento solo.
    expect(rejectedOutcome("la piattaforma ha respinto l'invio").status).toBe("rifiutato");
    expect(notAttemptedOutcome("safeToPlay false").status).toBe("non_tentato");
    expect(notAttemptedOutcome("safeToPlay false").differences).toEqual([]);
  });
});
