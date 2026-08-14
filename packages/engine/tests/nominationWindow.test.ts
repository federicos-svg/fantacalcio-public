import { describe, it, expect } from "vitest";
import {
  anchorBook,
  measuredInflation,
  nominationWindow,
  targetsAtRisk,
  type PlayerAnchor,
} from "../src/index.js";
import { TEAMS, anchor, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";

const ORDER = [...TEAMS];

const LISTINO: PlayerAnchor[] = [
  anchor("a1", "A", 50),
  anchor("a2", "A", 40),
  anchor("d1", "D", 30),
  anchor("d2", "D", 20),
  anchor("p1", "P", 10),
];
const BOOK = anchorBook(LISTINO);
const EMPTY = stateOf([]);
const COLD = measuredInflation([], BOOK);

describe("nominationWindow — giro fisso (LEAGUE_RULES §3-bis)", () => {
  it("tocca a me adesso: zero chiamate di attesa, nessuno prima", () => {
    const window = nominationWindow(ORDER, "psg", "psg");
    expect(window.callsUntilNextTurn).toBe(0);
    expect(window.nominatorsBefore).toEqual([]);
  });

  it("conta le chiamate che mancano e dice di chi sono, in ordine di giro", () => {
    const window = nominationWindow(ORDER, ORDER[1]!, ORDER[4]!);
    expect(window.callsUntilNextTurn).toBe(3);
    expect(window.nominatorsBefore).toEqual([ORDER[1], ORDER[2], ORDER[3]]);
  });

  it("il giro si chiude ad anello", () => {
    const window = nominationWindow(ORDER, ORDER[6]!, ORDER[1]!);
    expect(window.callsUntilNextTurn).toBe(3);
    expect(window.nominatorsBefore).toEqual([ORDER[6], ORDER[7], ORDER[0]]);
  });

  it("un giro rotto non produce numeri: fail-closed", () => {
    expect(() => nominationWindow([], "psg", "psg")).toThrow(/empty nomination order/);
    expect(() => nominationWindow(["psg", "psg"], "psg", "psg")).toThrow(/duplicate/);
    expect(() => nominationWindow(ORDER, "ignoto", "psg")).toThrow(/nextNominatorId/);
    expect(() => nominationWindow(ORDER, "psg", "ignoto")).toThrow(/selfId/);
  });
});

describe("targetsAtRisk — chi può portarmeli via prima del mio turno", () => {
  it("tiene solo gli obiettivi con almeno un rivale eleggibile, col conteggio", () => {
    const risk = targetsAtRisk({
      targetPlayerIds: ["a1", "d1"],
      book: BOOK,
      state: EMPTY,
      inflation: COLD,
      selfId: "psg",
    });
    expect(risk).toEqual([
      { playerId: "a1", role: "A", correctedAnchor: 50, eligibleCompetitors: 7 },
      { playerId: "d1", role: "D", correctedAnchor: 30, eligibleCompetitors: 7 },
    ]);
  });

  it("un obiettivo che nessun altro può comprare esce dalla lista", () => {
    // Tutti gli attaccanti pieni per ogni squadra tranne la mia: nessun rivale
    // eleggibile su a1, mentre d1 resta contendibile.
    const log = buildLog(
      TEAMS.filter((team) => team !== "psg").flatMap((team) => fillRole(team, "A", 7, 1)),
    );
    const risk = targetsAtRisk({
      targetPlayerIds: ["a1", "d1"],
      book: BOOK,
      state: stateOf(log),
      inflation: COLD,
      selfId: "psg",
    });
    expect(risk.map((t) => t.playerId)).toEqual(["d1"]);
  });

  it("esclude obiettivi già assegnati, riconfermati o senza ancora", () => {
    const state = stateOf(buildLog([buy("a1", "A", "ataturk", 60)]), [
      { fantaTeamId: "new_milf", playerId: "d1", role: "D", price: 12 },
    ]);
    const risk = targetsAtRisk({
      targetPlayerIds: ["a1", "d1", "sconosciuto", "a2"],
      book: BOOK,
      state,
      inflation: COLD,
      selfId: "psg",
    });
    expect(risk.map((t) => t.playerId)).toEqual(["a2"]);
  });

  it("de-duplica gli obiettivi ripetuti", () => {
    const risk = targetsAtRisk({
      targetPlayerIds: ["a1", "a1", "a1"],
      book: BOOK,
      state: EMPTY,
      inflation: COLD,
    });
    expect(risk).toHaveLength(1);
    expect(risk[0]?.eligibleCompetitors).toBe(8); // senza selfId nessuno è escluso
  });

  it("ordina per rivali, poi ancora corrente, poi playerId — ordinamento totale", () => {
    // Le squadre restanti hanno il ruolo D aperto ma non A: su a1/a2 resta un
    // solo rivale eleggibile, su d1/d2 sette.
    const log = buildLog(
      TEAMS.filter((team) => team !== "psg" && team !== "ataturk").flatMap((team) =>
        fillRole(team, "A", 7, 1),
      ),
    );
    const risk = targetsAtRisk({
      targetPlayerIds: ["a2", "d2", "a1", "d1"],
      book: BOOK,
      state: stateOf(log),
      inflation: COLD,
      selfId: "psg",
    });
    expect(risk.map((t) => t.playerId)).toEqual(["d1", "d2", "a1", "a2"]);
    expect(risk.map((t) => t.eligibleCompetitors)).toEqual([7, 7, 1, 1]);
  });

  it("l'ancora corrente usata come soglia è quella corretta dall'inflazione misurata", () => {
    const log = buildLog([
      buy("x1", "D", "new_milf", 40),
      buy("x2", "D", "ataturk", 40),
      buy("x3", "D", "ac_vostra", 40),
      buy("x4", "D", "new_casatiello", 40),
      buy("x5", "D", "fc_sottitudo", 40),
    ]);
    const book = anchorBook([
      ...[1, 2, 3, 4, 5].map((i) => anchor(`x${i}`, "D", 20)),
      anchor("d9", "D", 20),
    ]);
    const inflation = measuredInflation(log, book);
    expect(inflation.perRole.D.inflation).toBeCloseTo(1, 10); // 200 pagati su 100 di quotazione
    const risk = targetsAtRisk({
      targetPlayerIds: ["d9"],
      book,
      state: stateOf(log),
      inflation,
      selfId: "psg",
    });
    expect(risk[0]?.correctedAnchor).toBe(40); // 20 × 2, non 20
  });

  it("è deterministica", () => {
    const input = {
      targetPlayerIds: ["a1", "d1", "p1"],
      book: BOOK,
      state: EMPTY,
      inflation: COLD,
    };
    expect(JSON.stringify(targetsAtRisk(input))).toBe(JSON.stringify(targetsAtRisk(input)));
  });
});
