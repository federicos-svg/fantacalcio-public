import { describe, it, expect } from "vitest";
import {
  type GameweekContext,
  type Lineup,
  type PlayerLine,
  type Role,
  applySubstitutions,
  lineupViolations,
  simulateGameweek,
} from "../src/index.js";

// FIXTURE SINTETICHE. Nessun nome reale, nessun voto reale: identificatori
// costruiti (`D1`, `C3`…) e numeri scelti a mano per illuminare una regola alla
// volta.

const line = (
  id: string,
  role: Role,
  baseVote: number | null,
  fantasyScore: number | null = baseVote,
  extra: Partial<PlayerLine> = {},
): PlayerLine => ({ id, role, baseVote, fantasyScore, ...extra });

function squadOf(lines: readonly PlayerLine[]): Map<string, PlayerLine> {
  return new Map(lines.map((l) => [l.id, l]));
}

/** Una rosa 442 completa a voto 6, più panchina. `over` sovrascrive per id. */
function standardSquad(prefix: string, over: Record<string, Partial<PlayerLine>> = {}): PlayerLine[] {
  const build = (id: string, role: Role): PlayerLine => {
    const patch = over[id] ?? {};
    const base = line(`${prefix}${id}`, role, 6, 6);
    return { ...base, ...patch, id: `${prefix}${id}`, role };
  };
  return [
    build("P1", "P"),
    build("P2", "P"),
    build("D1", "D"),
    build("D2", "D"),
    build("D3", "D"),
    build("D4", "D"),
    build("D5", "D"),
    build("C1", "C"),
    build("C2", "C"),
    build("C3", "C"),
    build("C4", "C"),
    build("C5", "C"),
    build("A1", "A"),
    build("A2", "A"),
    build("A3", "A"),
  ];
}

const lineup442 = (prefix: string): Lineup => ({
  module: "442",
  goalkeeperId: `${prefix}P1`,
  starterIds: [
    `${prefix}D1`,
    `${prefix}D2`,
    `${prefix}D3`,
    `${prefix}D4`,
    `${prefix}C1`,
    `${prefix}C2`,
    `${prefix}C3`,
    `${prefix}C4`,
    `${prefix}A1`,
    `${prefix}A2`,
  ],
  benchIds: [`${prefix}P2`, `${prefix}D5`, `${prefix}C5`, `${prefix}A3`],
});

const CONTEXT: GameweekContext = { matchday: 10, weAreHome: true };

describe("senza voto — la tabella dichiarata il 2026-09-03", () => {
  it("il portiere senza voto viene sostituito come tutti gli altri", () => {
    // La risposta di Pico: «portiere con SV va sostituito anche lui». Il 6 del
    // regolamento non è la prima scelta, è quel che resta se la panchina tace.
    const squad = standardSquad("n", { P1: { baseVote: null, fantasyScore: null } });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([{ outId: "nP1", inId: "nP2", role: "P" }]);
    expect(out.noVote).toEqual([]);
    expect(out.noVoteTotal).toBe(0);
  });

  it("il portiere scoperto prende 6, e non gli servono i cartellini", () => {
    const squad = standardSquad("n", {
      P1: { baseVote: null, fantasyScore: null },
      P2: { baseVote: null, fantasyScore: null },
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.noVote).toEqual([{ id: "nP1", role: "P", cards: null, score: 6 }]);
    expect(out.undeclaredCardIds).toEqual([]);
    expect(out.noVoteTotal).toBe(6);
  });

  it("il movimento scoperto vale 5 col giallo, 4 col rosso, zero senza cartellini", () => {
    const squad = standardSquad("n", {
      A1: { baseVote: null, fantasyScore: null, cards: "yellow" },
      A2: { baseVote: null, fantasyScore: null, cards: "none" },
      A3: { baseVote: null, fantasyScore: null },
      C1: { baseVote: null, fantasyScore: null, cards: "red" },
      C5: { baseVote: null, fantasyScore: null },
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.noVote).toEqual([
      { id: "nC1", role: "C", cards: "red", score: 4 },
      { id: "nA1", role: "A", cards: "yellow", score: 5 },
      { id: "nA2", role: "A", cards: "none", score: null },
    ]);
    // 4 + 5, e A2 conta come assente: `officeReserve: "prohibited"`.
    expect(out.noVoteTotal).toBe(9);
  });

  it("un movimento scoperto senza stato cartellini ferma il conto invece di supporlo", () => {
    const squad = standardSquad("n", {
      A1: { baseVote: null, fantasyScore: null },
      A3: { baseVote: null, fantasyScore: null },
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.undeclaredCardIds).toEqual(["nA1"]);
    expect(out.noVoteTotal).toBe(0);
  });

  it("i punteggi d'ufficio entrano nel totale di squadra, i voti base no", () => {
    const players = squadOf([
      ...standardSquad("n", {
        A1: { baseVote: null, fantasyScore: null, cards: "yellow" },
        A3: { baseVote: null, fantasyScore: null },
      }),
      ...standardSquad("l"),
    ]);
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players,
      context: CONTEXT,
    });
    expect(out.resolved).toBe(true);
    expect(out.ours.noVoteTotal).toBe(5);
    // Dieci giocatori a 6 più il 5 d'ufficio: il senza voto non vale zero.
    expect(out.ours.playersTotal).toBe(65);
    // E non ha alimentato il modificatore attacco, che legge i voti base.
    expect(out.ours.attack).toBe(0);
  });
});

describe("sostituzioni", () => {
  it("il primo di panchina utile entra per il primo titolare senza voto dello stesso ruolo", () => {
    const squad = standardSquad("n", { D2: { baseVote: null, fantasyScore: null } });
    const players = squadOf(squad);
    const out = applySubstitutions(lineup442("n"), players);
    expect(out.substitutions).toEqual([{ outId: "nD2", inId: "nD5", role: "D" }]);
    expect(out.noVote).toEqual([]);
    expect(out.fielded.map((l) => l.id)).toContain("nD5");
  });

  it("non sostituisce mai fuori ruolo", () => {
    // Un attaccante senza voto e in panchina solo un difensore: nessuno entra.
    const squad = standardSquad("n", {
      A1: { baseVote: null, fantasyScore: null },
      C5: { baseVote: null, fantasyScore: null },
      A3: { baseVote: null, fantasyScore: null },
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.noVote.map((e) => e.id)).toEqual(["nA1"]);
  });

  it("non supera le cinque sostituzioni, e lo dichiara", () => {
    const many = standardSquad("n").map((l) =>
      l.id.startsWith("nD") || l.id.startsWith("nC") ? { ...l, baseVote: null, fantasyScore: null } : l,
    );
    // Titolari senza voto: 4 difensori e 4 centrocampisti = 8; in panchina solo
    // D5 e C5, e anche loro senza voto. Nessuna sostituzione possibile.
    const out = applySubstitutions(lineup442("n"), squadOf(many));
    expect(out.substitutionsUsed).toBe(0);
    expect(out.noVote.length).toBe(8);
  });

  it("usa al massimo cinque rimpiazzi quando la panchina lo consentirebbe", () => {
    const squad = standardSquad("n", {
      D1: { baseVote: null, fantasyScore: null },
      D2: { baseVote: null, fantasyScore: null },
      D3: { baseVote: null, fantasyScore: null },
      D4: { baseVote: null, fantasyScore: null },
    });
    // In panchina un solo difensore: entra lui, gli altri tre restano scoperti.
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutionsUsed).toBe(1);
    expect(out.noVote.map((e) => e.id)).toEqual(["nD2", "nD3", "nD4"]);
  });
});

describe("simulazione della giornata", () => {
  const players = squadOf([...standardSquad("n"), ...standardSquad("l")]);

  it("somma i punteggi individuali, applica i modificatori e converte in goal", () => {
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players,
      context: CONTEXT,
    });
    // Undici da 6 = 66. Difesa: portiere 6 + tre difensori 6 -> media 6 -> +1.
    // Centrocampo: pari, nessun delta. Attacco: due 6 -> 0. Modulo: 442 -> 0.
    // Fattore campo: +2 a noi (10ª giornata).
    expect(out.ours.playersTotal).toBe(66);
    expect(out.ours.defence).toBe(1);
    expect(out.ours.midfield).toBe(0);
    expect(out.ours.attack).toBe(0);
    expect(out.ours.moduleFromOpponent).toBe(0);
    expect(out.ours.homeField).toBe(2);
    expect(out.ours.total).toBe(69);
    expect(out.theirs.total).toBe(67);
    expect(out.resolved).toBe(true);
  });

  it("il modificatore modulo lo riceve chi subisce il modulo altrui", () => {
    const ourLineup = { ...lineup442("n"), module: "343" as const };
    // 343 chiede 3D-4C-3A: rifaccio i titolari di conseguenza.
    const our343: Lineup = {
      module: "343",
      goalkeeperId: "nP1",
      starterIds: ["nD1", "nD2", "nD3", "nC1", "nC2", "nC3", "nC4", "nA1", "nA2", "nA3"],
      benchIds: ["nP2", "nD4", "nD5", "nC5"],
    };
    void ourLineup;
    const out = simulateGameweek({ ourLineup: our343, theirLineup: lineup442("l"), players, context: CONTEXT });
    // Il nostro 3-4-3 REGALA +1.5 a loro; il loro 4-4-2 non regala niente a noi.
    expect(out.theirs.moduleFromOpponent).toBe(1.5);
    expect(out.ours.moduleFromOpponent).toBe(0);
  });

  it("con un titolare senza voto e senza rimpiazzo dichiara che il punteggio non è ufficiale", () => {
    const scoperti = squadOf([
      ...standardSquad("n", {
        A1: { baseVote: null, fantasyScore: null },
        A3: { baseVote: null, fantasyScore: null },
      }),
      ...standardSquad("l"),
    ]);
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players: scoperti,
      context: CONTEXT,
    });
    expect(out.resolved).toBe(false);
    expect(out.unresolvedReason).toMatch(/senza stato cartellini dichiarato/);
    expect(out.unresolvedReason).toContain("nA1");
  });

  it("il fattore campo sparisce dalla 29ª", () => {
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players,
      context: { matchday: 29, weAreHome: true },
    });
    expect(out.ours.homeField).toBe(0);
    expect(out.ours.total).toBe(67);
  });

  it("un centrocampo più corto riceve i voti fittizi da 5 e può perderci", () => {
    // Noi 4-3-3 (tre centrocampisti), loro 4-4-2: a noi si aggiunge un 5.
    const our433: Lineup = {
      module: "433",
      goalkeeperId: "nP1",
      starterIds: ["nD1", "nD2", "nD3", "nD4", "nC1", "nC2", "nC3", "nA1", "nA2", "nA3"],
      benchIds: ["nP2", "nD5", "nC4", "nC5"],
    };
    const out = simulateGameweek({ ourLineup: our433, theirLineup: lineup442("l"), players, context: CONTEXT });
    // Noi: 6+6+6 + fittizio 5 = 23. Loro: 6×4 = 24. Differenza 1 -> nessun delta.
    expect(out.ours.midfield).toBe(0);
    expect(out.theirs.midfield).toBe(0);
  });
});

describe("legalità della formazione", () => {
  const players = squadOf(standardSquad("n"));

  it("accetta una formazione conforme al modulo", () => {
    expect(lineupViolations(lineup442("n"), players)).toEqual([]);
  });

  it("rifiuta i numeri sbagliati per ruolo", () => {
    const storta: Lineup = {
      ...lineup442("n"),
      starterIds: ["nD1", "nD2", "nD3", "nC1", "nC2", "nC3", "nC4", "nC5", "nA1", "nA2"],
    };
    const violations = lineupViolations(storta, players);
    expect(violations.some((v) => v.includes("difensori: 3"))).toBe(true);
    expect(violations.some((v) => v.includes("centrocampisti: 5"))).toBe(true);
  });

  it("rifiuta un secondo portiere fra i titolari e il giocatore schierato due volte", () => {
    const doppio: Lineup = {
      ...lineup442("n"),
      starterIds: ["nP2", "nD1", "nD2", "nD3", "nC1", "nC2", "nC3", "nC4", "nA1", "nA1"],
    };
    const violations = lineupViolations(doppio, players);
    expect(violations.some((v) => v.includes("secondo portiere"))).toBe(true);
    expect(violations.some((v) => v.includes("due volte"))).toBe(true);
  });
});
