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

describe("senza voto — i cinque casi del regolamento ufficiale", () => {
  const sv = (over: Partial<PlayerLine> = {}) => ({
    baseVote: null,
    fantasyScore: null,
    ...over,
  });

  it("il senza voto puro si sostituisce, portiere compreso: non ha una regola propria", () => {
    const squad = standardSquad("n", { P1: sv({ cards: "none", otherBonusMalus: 0 }) });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([{ outId: "nP1", inId: "nP2", role: "P" }]);
    expect(out.uncoveredIds).toEqual([]);
  });

  it("il senza voto puro senza rimpiazzo conta come assente: officeReserve è prohibited", () => {
    const squad = standardSquad("n", {
      P1: sv({ cards: "none", otherBonusMalus: 0 }),
      P2: sv({ cards: "none", otherBonusMalus: 0 }),
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.uncoveredIds).toEqual(["nP1"]);
    // Nessun punteggio d'ufficio: la riga resta senza voto e varrà zero.
    expect(out.fielded.find((l) => l.id === "nP1")?.fantasyScore).toBeNull();
  });

  it("l'ammonito resta in campo col valore della lega, e la panchina non lo tocca", () => {
    const squad = standardSquad("n", { D2: sv({ cards: "yellow", otherBonusMalus: 0 }) });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    const line = out.fielded.find((l) => l.id === "nD2");
    // 5, non il 5,5 consigliato dalla piattaforma: è il valore settato dalla lega.
    expect(line?.fantasyScore).toBe(5);
    // E soprattutto: è un VOTO BASE, quindi i modificatori lo leggono.
    expect(line?.baseVote).toBe(5);
  });

  it("l'espulso a partita in corso prende 4, l'espulso dopo il fischio finale si sostituisce", () => {
    const squad = standardSquad("n", {
      D2: sv({ cards: "red", otherBonusMalus: 0 }),
      D3: sv({ cards: "red_after_match", otherBonusMalus: 0 }),
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.fielded.find((l) => l.id === "nD2")?.fantasyScore).toBe(4);
    // Due espulsioni, un solo cambio: quella dopo il fischio resta un SV.
    expect(out.substitutions).toEqual([{ outId: "nD3", inId: "nD5", role: "D" }]);
  });

  it("il senza voto con un qualunque bonus/malus resta in campo a 6 più quel valore", () => {
    const squad = standardSquad("n", {
      A1: sv({ cards: "none", otherBonusMalus: 3 }),
      D2: sv({ cards: "none", otherBonusMalus: -1 }),
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.fielded.find((l) => l.id === "nA1")?.fantasyScore).toBe(9);
    expect(out.fielded.find((l) => l.id === "nD2")?.fantasyScore).toBe(5);
    // Il voto base resta 6: i modificatori leggono i voti, non i bonus.
    expect(out.fielded.find((l) => l.id === "nA1")?.baseVote).toBe(6);
  });

  it("le combinazioni non dichiarate fermano il conto invece di sceglierne una", () => {
    const squad = standardSquad("n", {
      // Cartellini non dichiarati.
      A1: sv({ otherBonusMalus: 0 }),
      // Bonus/malus non dichiarati: non si distingue un SV puro da un SV a 6 più.
      A2: sv({ cards: "none" }),
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.undeclaredIds).toEqual(["nA1", "nA2"]);
  });

  it("l'ammonito che segna resta in campo a 8, e la panchina non lo tocca", () => {
    const squad = standardSquad("n", { A1: sv({ cards: "yellow", otherBonusMalus: 3 }) });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    // 5 di base più il gol: il malus dell'ammonizione è già dentro il 5.
    expect(out.fielded.find((l) => l.id === "nA1")?.fantasyScore).toBe(8);
  });

  it("un senza voto non dichiarato rende non ufficiale il punteggio della giornata", () => {
    const players = squadOf([...standardSquad("n", { A1: sv({ otherBonusMalus: 0 }) }), ...standardSquad("l")]);
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players,
      context: CONTEXT,
    });
    expect(out.resolved).toBe(false);
    expect(out.unresolvedReason).toContain("nA1");
  });

  it("i punteggi d'ufficio entrano nel totale di squadra come qualunque altro voto", () => {
    const players = squadOf([
      ...standardSquad("n", { A1: sv({ cards: "yellow", otherBonusMalus: 0 }) }),
      ...standardSquad("l"),
    ]);
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players,
      context: CONTEXT,
    });
    expect(out.resolved).toBe(true);
    // Dieci giocatori a 6 più il 5 dell'ammonito.
    expect(out.ours.playersTotal).toBe(65);
  });
});

describe("sostituzioni", () => {
  it("il primo di panchina utile entra per il primo titolare senza voto dello stesso ruolo", () => {
    const squad = standardSquad("n", { D2: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 } });
    const players = squadOf(squad);
    const out = applySubstitutions(lineup442("n"), players);
    expect(out.substitutions).toEqual([{ outId: "nD2", inId: "nD5", role: "D" }]);
    expect(out.uncoveredIds).toEqual([]);
    expect(out.fielded.map((l) => l.id)).toContain("nD5");
  });

  it("non sostituisce mai fuori ruolo", () => {
    // Un attaccante senza voto e in panchina solo un difensore: nessuno entra.
    const squad = standardSquad("n", {
      A1: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      C5: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      A3: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
    });
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutions).toEqual([]);
    expect(out.uncoveredIds).toEqual(["nA1"]);
  });

  it("non supera le cinque sostituzioni, e lo dichiara", () => {
    const many = standardSquad("n").map((l) =>
      l.id.startsWith("nD") || l.id.startsWith("nC")
        ? { ...l, baseVote: null, fantasyScore: null, cards: "none" as const, otherBonusMalus: 0 }
        : l,
    );
    // Titolari senza voto: 4 difensori e 4 centrocampisti = 8; in panchina solo
    // D5 e C5, e anche loro senza voto. Nessuna sostituzione possibile.
    const out = applySubstitutions(lineup442("n"), squadOf(many));
    expect(out.substitutionsUsed).toBe(0);
    expect(out.uncoveredIds.length).toBe(8);
  });

  it("usa al massimo cinque rimpiazzi quando la panchina lo consentirebbe", () => {
    const squad = standardSquad("n", {
      D1: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      D2: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      D3: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      D4: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
    });
    // In panchina un solo difensore: entra lui, gli altri tre restano scoperti.
    const out = applySubstitutions(lineup442("n"), squadOf(squad));
    expect(out.substitutionsUsed).toBe(1);
    expect(out.uncoveredIds).toEqual(["nD2", "nD3", "nD4"]);
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

  it("un titolare scoperto si gioca in dieci: il punteggio è valido, e la cosa si vede", () => {
    const scoperti = squadOf([
      ...standardSquad("n", {
        A1: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
        A3: { baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      }),
      ...standardSquad("l"),
    ]);
    const out = simulateGameweek({
      ourLineup: lineup442("n"),
      theirLineup: lineup442("l"),
      players: scoperti,
      context: CONTEXT,
    });
    // Prima del 2026-09-03 questo caso era `resolved: false`, perché non si
    // sapeva che valore desse il regolamento a un senza voto. Ora si sa:
    // nessuno. Il punteggio è calcolabile ed è quello di una squadra in dieci.
    expect(out.resolved).toBe(true);
    expect(out.ours.resolution.uncoveredIds).toEqual(["nA1"]);
    // Dieci giocatori a 6, e l'undicesimo che non c'è.
    expect(out.ours.playersTotal).toBe(60);
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
