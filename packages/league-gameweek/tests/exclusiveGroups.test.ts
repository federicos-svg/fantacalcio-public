import { describe, it, expect } from "vitest";
import {
  type GameweekContext,
  type Lineup,
  type PlayerDistribution,
  type PlayerForecast,
  type Role,
  type Scenario,
  assertForecasts,
  mulberry32,
  prepareGameweek,
  proposeLineup,
  samplePlayerLine,
} from "../src/index.js";

// I GRUPPI ESCLUSIVI (`PlayerForecast.exclusiveGroup`) — l'unica eccezione
// dichiarata all'indipendenza fra le presenze dei giocatori.
//
// FIXTURE SINTETICHE: identificatori costruiti (`P1`, `Cuno`…), probabilità
// scelte a mano, nessun dato reale, nessuna rete.
//
// PERCHÉ QUESTO FILE ESISTE. Tre portieri dello stesso club con probabilità
// 0,70 / 0,05 / 0,01, estratti indipendenti, lasciano la porta senza nessun
// voto nel 28 % degli scenari: il difetto è nell'ipotesi di indipendenza, non
// nell'ottimizzatore, e si chiude dichiarando che quei tre sono UN gruppo. Le
// prove qui sotto fissano quattro cose: (1) dentro un gruppo gioca al più uno,
// nei due percorsi, con le frequenze giuste; (2) FUORI dai gruppi niente
// cambia, nemmeno all'ultimo bit; (3) una dichiarazione impossibile si rifiuta;
// (4) `samplePlayerLine` con la presenza già decisa non consuma la prima
// estrazione.

const CONTEXT: GameweekContext = { matchday: 10, weAreHome: true };
const ASOF = "2026-10-01T10:00:00Z";

/** Una distribuzione coerente con la riga modale (voto 6,0), per un ruolo. */
function distributionFor(role: Role, p: number): PlayerDistribution {
  return {
    pPlays: p,
    pStarter: p,
    pSub: 0,
    baseVote: [
      { vote: 5.5, probability: 0.25 },
      { vote: 6, probability: 0.5 },
      { vote: 6.5, probability: 0.25 },
    ],
    events: {
      pGoal: role === "A" ? 0.3 : 0.05,
      pAssist: 0.1,
      pYellow: 0.15,
      pRed: 0.01,
      pOwnGoal: 0.005,
      pPenMissed: 0.01,
      pPenSaved: role === "P" ? 0.02 : 0,
      ...(role === "P" ? { goalsConceded: [0.4, 0.35, 0.25] } : {}),
    },
    svKind: { clean: 1, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 },
    asOf: ASOF,
    sourceQuality: "SINTETICA (prova)",
  };
}

function player(
  id: string,
  role: Role,
  p: number,
  opts: { readonly group?: string; readonly dist?: boolean } = {},
): PlayerForecast {
  return {
    id,
    role,
    voteProbability: p,
    expected: { baseVote: 6, fantasyScore: 6, receivedAnyBonus: false, missedPenalty: false },
    ...(opts.dist === true ? { distribution: distributionFor(role, p) } : {}),
    ...(opts.group !== undefined ? { exclusiveGroup: opts.group } : {}),
  };
}

/** Avversario piatto: 4-4-2, undici voti 6,0 certi (come nelle altre prove). */
function opponentFlat(extra: readonly PlayerForecast[] = []): PlayerForecast[] {
  const out = [player("oP1", "P", 1)];
  for (let i = 1; i <= 4; i += 1) out.push(player(`oD${i}`, "D", 1));
  for (let i = 1; i <= 4; i += 1) out.push(player(`oC${i}`, "C", 1));
  for (let i = 1; i <= 2; i += 1) out.push(player(`oA${i}`, "A", 1));
  return [...out, ...extra];
}

const OPP_LINEUP: Lineup = {
  module: "442",
  goalkeeperId: "oP1",
  starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
  benchIds: [],
};

const KEEPERS = { A: 0.7, B: 0.29, C: 0.01 } as const;

/** I tre portieri dello stesso gruppo (somma 1): 0,70 / 0,29 / 0,01. */
function keepers(opts: { readonly group?: string; readonly dist?: boolean } = {}): PlayerForecast[] {
  return [
    player("Pa", "P", KEEPERS.A, opts),
    player("Pb", "P", KEEPERS.B, opts),
    player("Pc", "P", KEEPERS.C, opts),
  ];
}

/** Giocatori di movimento indipendenti, p = 0,5: portano il conto oltre il budget. */
function independents(n: number, opts: { readonly dist?: boolean } = {}): PlayerForecast[] {
  return Array.from({ length: n }, (_, i) => player(`X${String(i).padStart(2, "0")}`, "C", 0.5, opts));
}

function scenariosOf(squad: readonly PlayerForecast[], budget: number, opponent = opponentFlat()): readonly Scenario[] {
  return prepareGameweek({
    squad,
    opponent: { lineup: OPP_LINEUP, players: opponent },
    context: CONTEXT,
    scenarioBudget: budget,
  }).scenarios();
}

const KEEPER_IDS = ["Pa", "Pb", "Pc"] as const;
const votes = (s: Scenario, id: string): boolean => (s.players.get(id) as { baseVote: number | null }).baseVote !== null;
const keepersWithVote = (s: Scenario): number => KEEPER_IDS.filter((id) => votes(s, id)).length;

/** La massa degli scenari che soddisfano un predicato (i pesi, non il conteggio). */
function mass(scenarios: readonly Scenario[], predicate: (s: Scenario) => boolean): number {
  let total = 0;
  for (const s of scenarios) if (predicate(s)) total += s.weight;
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DENTRO UN GRUPPO GIOCA AL PIÙ UNO — percorso campionato
// ─────────────────────────────────────────────────────────────────────────────

describe("gruppo esclusivo: percorso campionato", () => {
  const N = 20000;

  it("senza il gruppo la porta resta scoperta nel ~21 % degli scenari: è il difetto che il gruppo chiude", () => {
    // IL CONTROLLO NEGATIVO. Senza di lui le prove qui sotto potrebbero passare
    // anche con un campionatore che non fa niente: con i tre portieri estratti
    // indipendenti nessuno prende voto in 0,30 × 0,71 × 0,99 ≈ 21,1 % degli
    // scenari, e in una quota non piccola ne giocano due o più.
    const scenarios = scenariosOf([...keepers({ dist: true }), ...independents(2, { dist: true })], N);
    expect(scenarios).toHaveLength(N);
    const nessuno = mass(scenarios, (s) => keepersWithVote(s) === 0);
    expect(nessuno).toBeGreaterThan(0.19);
    expect(nessuno).toBeLessThan(0.23);
    expect(mass(scenarios, (s) => keepersWithVote(s) >= 2)).toBeGreaterThan(0.1);
  });

  it("con il gruppo: mai senza portiere a voto, mai due, e le frequenze sono le probabilità", () => {
    const scenarios = scenariosOf(
      [...keepers({ group: "club", dist: true }), ...independents(2, { dist: true })],
      N,
    );
    expect(scenarios).toHaveLength(N);
    // La somma è 1: «nessuno» ha massa zero, e due o più sono impossibili.
    expect(mass(scenarios, (s) => keepersWithVote(s) === 0)).toBe(0);
    expect(mass(scenarios, (s) => keepersWithVote(s) >= 2)).toBe(0);
    // Le frequenze: la probabilità che giochi uno È la sua voteProbability.
    for (const [id, p] of [["Pa", KEEPERS.A], ["Pb", KEEPERS.B], ["Pc", KEEPERS.C]] as const) {
      expect(Math.abs(mass(scenarios, (s) => votes(s, id)) - p)).toBeLessThan(0.012);
    }
  });

  it("la stessa cosa senza distribuzioni: gioca la riga attesa, o è un senza voto puro", () => {
    // 3 portieri + 17 indipendenti = 20 incerti: 2^20 supera ogni budget, quindi
    // si campiona anche senza distribuzioni. È il ramo `f.distribution ===
    // undefined` dei membri di un gruppo.
    const prepared = prepareGameweek({
      squad: [...keepers({ group: "club" }), ...independents(17)],
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
      scenarioBudget: N,
    });
    expect(prepared.method).toBe("sampled");
    const scenarios = prepared.scenarios();
    expect(scenarios).toHaveLength(N);
    expect(mass(scenarios, (s) => keepersWithVote(s) === 0)).toBe(0);
    expect(mass(scenarios, (s) => keepersWithVote(s) >= 2)).toBe(0);
    for (const [id, p] of [["Pa", KEEPERS.A], ["Pb", KEEPERS.B], ["Pc", KEEPERS.C]] as const) {
      expect(Math.abs(mass(scenarios, (s) => votes(s, id)) - p)).toBeLessThan(0.012);
    }
  });

  it("somma sotto 1: in una quota 1 − Σ non gioca nessuno", () => {
    const squad = [
      player("Pa", "P", 0.5, { group: "club", dist: true }),
      player("Pb", "P", 0.2, { group: "club", dist: true }),
      ...independents(2, { dist: true }),
    ];
    const scenarios = scenariosOf(squad, N);
    expect(Math.abs(mass(scenarios, (s) => !votes(s, "Pa") && !votes(s, "Pb")) - 0.3)).toBeLessThan(0.012);
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "Pb"))).toBe(0);
    expect(Math.abs(mass(scenarios, (s) => votes(s, "Pa")) - 0.5)).toBeLessThan(0.012);
    expect(Math.abs(mass(scenarios, (s) => votes(s, "Pb")) - 0.2)).toBeLessThan(0.012);
  });

  it("fuori dal gruppo l'indipendenza resta: la presenza di un altro giocatore non dipende da chi gioca in porta", () => {
    const scenarios = scenariosOf(
      [...keepers({ group: "club", dist: true }), ...independents(2, { dist: true })],
      N,
    );
    // P(X00 gioca) = 0,5 e P(X00 gioca | Pa gioca) = 0,5, entro il rumore.
    const x = (s: Scenario): boolean => votes(s, "X00");
    const marginal = mass(scenarios, x);
    const conPa = mass(scenarios, (s) => x(s) && votes(s, "Pa")) / mass(scenarios, (s) => votes(s, "Pa"));
    expect(Math.abs(marginal - 0.5)).toBeLessThan(0.015);
    expect(Math.abs(conPa - 0.5)).toBeLessThan(0.02);
  });

  it("voto ed eventi di chi gioca restano estratti dalla sua distribuzione", () => {
    // Il portiere che gioca ha un voto base fra quelli della sua distribuzione e
    // porta l'effetto dei gol subiti (fantasyScore ≠ baseVote in generale).
    const scenarios = scenariosOf(
      [...keepers({ group: "club", dist: true }), ...independents(2, { dist: true })],
      2000,
    );
    const lines = scenarios
      .map((s) => s.players.get("Pa"))
      .filter((l): l is NonNullable<typeof l> => l !== undefined && l.baseVote !== null);
    expect(lines.length).toBeGreaterThan(1000);
    expect(new Set(lines.map((l) => l.baseVote))).toEqual(new Set([5.5, 6, 6.5]));
    expect(lines.some((l) => l.fantasyScore !== l.baseVote)).toBe(true);
  });

  it("un gruppo a cavallo delle due rose: non giocano mai insieme", () => {
    const squad = [
      player("Pa", "P", 0.6, { group: "partita", dist: true }),
      ...independents(2, { dist: true }),
    ];
    const opponent = opponentFlat([player("oPx", "P", 0.4, { group: "partita", dist: true })]);
    const scenarios = scenariosOf(squad, N, opponent);
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "oPx"))).toBe(0);
    expect(mass(scenarios, (s) => !votes(s, "Pa") && !votes(s, "oPx"))).toBe(0); // somma 1
    expect(Math.abs(mass(scenarios, (s) => votes(s, "Pa")) - 0.6)).toBeLessThan(0.012);
  });

  it("più gruppi nello stesso scenario sono indipendenti fra loro", () => {
    const squad = [
      player("Pa", "P", 0.6, { group: "uno", dist: true }),
      player("Pb", "P", 0.4, { group: "uno", dist: true }),
      player("Cx", "C", 0.7, { group: "due", dist: true }),
      player("Cy", "C", 0.3, { group: "due", dist: true }),
    ];
    const scenarios = scenariosOf(squad, N);
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "Pb"))).toBe(0);
    expect(mass(scenarios, (s) => votes(s, "Cx") && votes(s, "Cy"))).toBe(0);
    // P(Pa e Cx) = 0,6 × 0,7 = 0,42.
    expect(Math.abs(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "Cx")) - 0.42)).toBeLessThan(0.015);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PERCORSO ESATTO — l'enumerazione col peso congiunto del gruppo
// ─────────────────────────────────────────────────────────────────────────────

describe("gruppo esclusivo: percorso esatto", () => {
  /** Tre portieri in gruppo (somma 1) e tre indipendenti: 2^6 stati, enumerabili. */
  function exactSquad(): PlayerForecast[] {
    return [
      ...keepers({ group: "club" }),
      player("X0", "C", 0.9),
      player("X1", "C", 0.8),
      player("X2", "C", 0.5),
    ];
  }

  it("il peso senza portiere è zero, e lo scenario non si emette nemmeno", () => {
    const prepared = prepareGameweek({
      squad: exactSquad(),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    expect(prepared.method).toBe("exact");
    const scenarios = prepared.scenarios();
    // Dei 2^3 stati dei portieri sopravvivono i 3 con UN solo portiere a voto
    // (nessuno: massa 0, scartato; due o più: impossibili); per gli 8 stati degli
    // indipendenti: 3 × 8 = 24 scenari.
    expect(scenarios).toHaveLength(24);
    expect(scenarios.filter((s) => keepersWithVote(s) === 0)).toHaveLength(0);
    expect(mass(scenarios, (s) => keepersWithVote(s) === 0)).toBe(0);
    expect(mass(scenarios, (s) => keepersWithVote(s) >= 2)).toBe(0);
    // Nessun peso è nullo né negativo: uno scenario a peso zero potrebbe far
    // abbassare `allResolved` per un caso che non esiste.
    for (const s of scenarios) expect(s.weight).toBeGreaterThan(0);
    // Le masse sommano a uno.
    expect(mass(scenarios, () => true)).toBeCloseTo(1, 12);
  });

  it("le marginali sono le probabilità dichiarate, e gli indipendenti restano indipendenti", () => {
    const scenarios = prepareGameweek({
      squad: exactSquad(),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    }).scenarios();
    expect(mass(scenarios, (s) => votes(s, "Pa"))).toBeCloseTo(KEEPERS.A, 12);
    expect(mass(scenarios, (s) => votes(s, "Pb"))).toBeCloseTo(KEEPERS.B, 12);
    expect(mass(scenarios, (s) => votes(s, "Pc"))).toBeCloseTo(KEEPERS.C, 12);
    expect(mass(scenarios, (s) => votes(s, "X0"))).toBeCloseTo(0.9, 12);
    expect(mass(scenarios, (s) => votes(s, "X2"))).toBeCloseTo(0.5, 12);
    // Congiunta: P(Pa e X1) = 0,70 × 0,80.
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "X1"))).toBeCloseTo(0.7 * 0.8, 12);
  });

  it("somma sotto 1: lo scenario «nessuno» c'è, con peso 1 − Σ", () => {
    const squad = [
      player("Pa", "P", 0.5, { group: "club" }),
      player("Pb", "P", 0.2, { group: "club" }),
      player("X0", "C", 0.9),
    ];
    const scenarios = prepareGameweek({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    }).scenarios();
    expect(mass(scenarios, (s) => !votes(s, "Pa") && !votes(s, "Pb"))).toBeCloseTo(0.3, 12);
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "Pb"))).toBe(0);
    expect(mass(scenarios, () => true)).toBeCloseTo(1, 12);
  });

  it("la formazione avversaria resta indipendente: il prodotto cartesiano non cambia", () => {
    const otherLineup: Lineup = { ...OPP_LINEUP, module: "442", benchIds: [] };
    const prepared = prepareGameweek({
      squad: exactSquad(),
      opponent: {
        lineup: OPP_LINEUP,
        players: opponentFlat(),
        lineupDistribution: [
          { lineup: OPP_LINEUP, weight: 3 },
          { lineup: otherLineup, weight: 1 },
        ],
      },
      context: CONTEXT,
    });
    const scenarios = prepared.scenarios();
    expect(scenarios).toHaveLength(48);
    expect(mass(scenarios, (s) => s.opponentIndex === 0)).toBeCloseTo(0.75, 12);
    expect(mass(scenarios, () => true)).toBeCloseTo(1, 12);
  });

  it("un gruppo a cavallo delle due rose, nell'enumerazione", () => {
    const squad = [player("Pa", "P", 0.6, { group: "partita" }), player("X0", "C", 0.9)];
    const opponent = opponentFlat([player("oPx", "P", 0.4, { group: "partita" })]);
    const scenarios = prepareGameweek({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    }).scenarios();
    expect(mass(scenarios, (s) => votes(s, "Pa") && votes(s, "oPx"))).toBe(0);
    expect(mass(scenarios, (s) => votes(s, "Pa"))).toBeCloseTo(0.6, 12);
    expect(mass(scenarios, (s) => votes(s, "oPx"))).toBeCloseTo(0.4, 12);
    expect(mass(scenarios, () => true)).toBeCloseTo(1, 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SENZA GRUPPI, GLI SCENARI SONO QUELLI DI PRIMA — bit a bit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'IMPRONTA di un insieme di scenari: FNV-1a a 32 bit sul testo canonico di
 * ogni scenario (peso con tutte le cifre, formazione avversaria, e le righe dei
 * giocatori nell'ordine di inserimento della mappa). Cambia se cambia anche
 * solo un ultimo bit di un peso o un numero casuale consumato in più o in meno.
 */
function fingerprint(scenarios: readonly Scenario[]): string {
  let h = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const s of scenarios) {
    feed(`${s.weight}|${s.opponentIndex}|`);
    for (const [id, line] of s.players) feed(`${id}=${JSON.stringify(line)};`);
    feed("\n");
  }
  return `${scenarios.length}:${h.toString(16).padStart(8, "0")}`;
}

/** Una rosa con incerti nei due schieramenti, e due formazioni avversarie pesate. */
function goldenInput(dist: boolean, budget: number, group?: (id: string) => string | undefined) {
  const g = (id: string): { readonly group?: string } => {
    const name = group?.(id);
    return name === undefined ? {} : { group: name };
  };
  const squad = [
    player("P1", "P", 0.8, { dist, ...g("P1") }),
    player("P2", "P", 0.15, { dist, ...g("P2") }),
    player("D1", "D", 0.9, { dist, ...g("D1") }),
    player("D2", "D", 0.7, { dist, ...g("D2") }),
    player("C1", "C", 0.6, { dist, ...g("C1") }),
    player("C2", "C", 1, { dist, ...g("C2") }),
    player("A1", "A", 0.5, { dist, ...g("A1") }),
    player("A2", "A", 0, { dist, ...g("A2") }),
  ];
  const opponent = opponentFlat([
    player("oP2", "P", 0.3, { dist, ...g("oP2") }),
    player("oD5", "D", 0.4, { dist, ...g("oD5") }),
  ]);
  const second: Lineup = { ...OPP_LINEUP, starterIds: [...OPP_LINEUP.starterIds].reverse() };
  return {
    squad,
    opponent: {
      lineup: OPP_LINEUP,
      players: opponent,
      lineupDistribution: [
        { lineup: OPP_LINEUP, weight: 2 },
        { lineup: second, weight: 1 },
      ],
    },
    context: CONTEXT,
    scenarioBudget: budget,
  };
}

/** I tre percorsi che esistevano prima dei gruppi: esatto, campionato senza e con distribuzioni. */
const GOLDEN_CASES = [
  { nome: "esatto", dist: false, budget: 4096 },
  { nome: "campionato senza distribuzioni", dist: false, budget: 90 },
  { nome: "campionato con distribuzioni", dist: true, budget: 90 },
] as const;

/**
 * LE IMPRONTE DEL CODICE DI PRIMA DEI GRUPPI, misurate su `origin/main` prima
 * della modifica e scritte qui. Se un'altra versione le rompe, gli scenari di
 * chi NON dichiara gruppi sono cambiati: una proposta già registrata non si
 * rifà più identica, ed è esattamente quello che questo blocco esiste per
 * impedire. NON vanno «aggiornate» per far tornare il rosso: vanno spiegate.
 */
const GOLDEN: Record<string, string> = {
  "esatto": "512:3d5f15bd",
  "campionato senza distribuzioni": "90:547f1fe8",
  "campionato con distribuzioni": "90:5691eb3c",
};

describe("senza gruppi gli scenari sono identici a quelli di prima, bit a bit", () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.nome}: l'impronta è quella misurata sul codice precedente`, () => {
      const scenarios = prepareGameweek(goldenInput(c.dist, c.budget)).scenarios();
      expect(fingerprint(scenarios)).toBe(GOLDEN[c.nome]);
    });

    it(`${c.nome}: ogni giocatore in un gruppo TUTTO SUO dà gli stessi scenari`, () => {
      // Un gruppo con un solo membro non esclude nessuno: non deve estrarre un
      // numero in più né spostare un fattore del peso.
      const base = prepareGameweek(goldenInput(c.dist, c.budget)).scenarios();
      const soli = prepareGameweek(goldenInput(c.dist, c.budget, (id) => `solo-${id}`)).scenarios();
      expect(soli).toEqual(base);
      expect(fingerprint(soli)).toBe(GOLDEN[c.nome]);
    });
  }

  it("un gruppo i cui altri membri non variano non cambia gli scenari", () => {
    // Pb è certamente assente e senza distribuzione: sta nella base, non in
    // `stochastic`. Il gruppo ha un solo membro che VARIA: niente da escludere.
    const con = goldenInput(false, 4096);
    const squadCon = con.squad.map((f) => (f.id === "P1" || f.id === "A2" ? { ...f, exclusiveGroup: "g" } : f));
    // A2 ha p = 0 e P1 p = 0,8: somma 0,8 ≤ 1, e A2 non varia.
    const base = prepareGameweek(con).scenarios();
    const raggruppata = prepareGameweek({ ...con, squad: squadCon }).scenarios();
    expect(raggruppata).toEqual(base);
  });

  it("una proposta senza gruppi è identica a quella con gruppi di un solo membro", () => {
    // Percorso esatto, poi campionato con distribuzioni: i due ingressi sono la
    // stessa rosa, e la proposta (formazione, stima, ragione) non può differire.
    const squadOf = (dist: boolean, group?: (id: string) => string | undefined): PlayerForecast[] => {
      const g = (id: string): { readonly group?: string } => {
        const name = group?.(id);
        return name === undefined ? {} : { group: name };
      };
      return [
        player("P1", "P", 0.8, { dist, ...g("P1") }),
        player("P2", "P", 0.15, { dist, ...g("P2") }),
        ...["D1", "D2", "D3", "D4", "D5"].map((id, i) => player(id, "D", i < 2 ? 0.9 : 1, { dist, ...g(id) })),
        ...["C1", "C2", "C3", "C4", "C5"].map((id, i) => player(id, "C", i < 2 ? 0.6 : 1, { dist, ...g(id) })),
        ...["A1", "A2", "A3"].map((id, i) => player(id, "A", i === 0 ? 0.5 : 1, { dist, ...g(id) })),
      ];
    };
    for (const [dist, budget] of [[false, 4096], [true, 64]] as const) {
      const run = (group?: (id: string) => string | undefined) =>
        proposeLineup({
          squad: squadOf(dist, group),
          opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
          context: CONTEXT,
          scenarioBudget: budget,
        });
      const senza = run();
      const soli = run((id) => `solo-${id}`);
      expect(soli).toEqual(senza);
      expect(senza.feasible).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UNA DICHIARAZIONE IMPOSSIBILE SI RIFIUTA
// ─────────────────────────────────────────────────────────────────────────────

describe("validazione dei gruppi esclusivi", () => {
  const run = (squad: readonly PlayerForecast[], opponent = opponentFlat()) =>
    prepareGameweek({ squad, opponent: { lineup: OPP_LINEUP, players: opponent }, context: CONTEXT });

  it("rifiuta una somma oltre 1 dentro una rosa, e nomina gruppo, somma e membri", () => {
    const squad = [
      player("Pa", "P", 0.7, { group: "club" }),
      player("Pb", "P", 0.29, { group: "club" }),
      player("Pc", "P", 0.02, { group: "club" }),
    ];
    expect(() => run(squad)).toThrowError(/gruppo esclusivo «club».*1\.01.*Pa \(0\.7\).*Pb \(0\.29\).*Pc \(0\.02\)/s);
    // `proposeLineup` passa dalla stessa convalida.
    expect(() =>
      proposeLineup({ squad, opponent: { lineup: OPP_LINEUP, players: opponentFlat() }, context: CONTEXT }),
    ).toThrowError(/gruppo esclusivo «club»/);
  });

  it("rifiuta una somma oltre 1 che emerge solo sommando le DUE rose", () => {
    // 0,6 in casa e 0,5 fuori: ciascuna rosa, da sola, è a posto.
    const squad = [player("Pa", "P", 0.6, { group: "partita" })];
    const opponent = opponentFlat([player("oPx", "P", 0.5, { group: "partita" })]);
    expect(() => assertForecasts(squad, "rosa")).not.toThrow();
    expect(() => assertForecasts(opponent, "rosa avversaria")).not.toThrow();
    expect(() => run(squad, opponent)).toThrowError(/le due rose.*gruppo esclusivo «partita».*1\.1/s);
  });

  it("la stessa `assertForecasts` rifiuta il gruppo sulla rosa che vede", () => {
    expect(() =>
      assertForecasts(
        [player("Pa", "P", 0.8, { group: "g" }), player("Pb", "P", 0.8, { group: "g" })],
        "rosa avversaria (§8.4)",
      ),
    ).toThrowError(/rosa avversaria \(§8\.4\): il gruppo esclusivo «g»/);
  });

  it("accetta somma esattamente 1 e somma 1 entro la tolleranza di virgola mobile", () => {
    expect(() => run(keepers({ group: "club" }))).not.toThrow(); // 0,70 + 0,29 + 0,01
    const a = player("Pa", "P", 0.5, { group: "g" });
    const b = player("Pb", "P", 0.5 + 1e-12, { group: "g" });
    expect(() => run([a, b])).not.toThrow();
    // Oltre la tolleranza no.
    const c = player("Pc", "P", 0.5 + 1e-6, { group: "g" });
    expect(() => run([a, c])).toThrowError(/gruppo esclusivo «g»/);
  });

  it("rifiuta un gruppo che non è una stringa non vuota", () => {
    const vuoto = { ...player("Pa", "P", 0.5), exclusiveGroup: "" };
    const numero = { ...player("Pa", "P", 0.5), exclusiveGroup: 7 as unknown as string };
    const nullo = { ...player("Pa", "P", 0.5), exclusiveGroup: null as unknown as string };
    for (const bad of [vuoto, numero, nullo]) {
      expect(() => run([bad])).toThrowError(/exclusiveGroup non valido per Pa/);
      expect(() => assertForecasts([bad], "rosa")).toThrowError(/exclusiveGroup non valido per Pa/);
    }
  });

  it("gruppi diversi hanno somme separate: due gruppi da 0,6 + 0,3 non si sommano", () => {
    const squad = [
      player("Pa", "P", 0.6, { group: "uno" }),
      player("Pb", "P", 0.3, { group: "uno" }),
      player("Cx", "C", 0.6, { group: "due" }),
      player("Cy", "C", 0.3, { group: "due" }),
    ];
    expect(() => run(squad)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. `samplePlayerLine` CON LA PRESENZA GIÀ DECISA
// ─────────────────────────────────────────────────────────────────────────────

/** Un generatore a sequenza fissa che conta le estrazioni consumate. */
function scripted(values: readonly number[]): { random: () => number; used: () => number } {
  let i = 0;
  return {
    random: () => {
      const v = values[i];
      if (v === undefined) throw new Error("estrazioni esaurite: la sequenza era più corta del necessario");
      i += 1;
      return v;
    },
    used: () => i,
  };
}

describe("samplePlayerLine con `plays`", () => {
  const who = { id: "Pa", role: "P" as Role };
  const dist = distributionFor("P", 0.6);
  // Dopo la presenza: voto base, sette eventi, gol subiti (portiere).
  const tail = [0.4, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.5];

  it("`plays: true` non consuma la prima estrazione: equivale a una sequenza con una estrazione «gioca» davanti", () => {
    const decisa = scripted(tail);
    const lineDecisa = samplePlayerLine(who, dist, decisa.random, true);
    const estratta = scripted([0.1, ...tail]); // 0,1 < pPlays: gioca
    const lineEstratta = samplePlayerLine(who, dist, estratta.random);
    expect(lineDecisa).toEqual(lineEstratta);
    expect(lineDecisa.baseVote).not.toBeNull();
    // E consuma UN numero in meno: la prima estrazione non si fa.
    expect(estratta.used() - decisa.used()).toBe(1);
    expect(decisa.used()).toBe(tail.length);
  });

  it("`plays: false` equivale a una sequenza con una estrazione «non gioca» davanti", () => {
    const sv = [0.3]; // la fattispecie del senza voto: una estrazione
    const decisa = scripted(sv);
    const lineDecisa = samplePlayerLine(who, dist, decisa.random, false);
    const estratta = scripted([0.95, ...sv]); // 0,95 ≥ pPlays: non gioca
    const lineEstratta = samplePlayerLine(who, dist, estratta.random);
    expect(lineDecisa).toEqual(lineEstratta);
    expect(lineDecisa.baseVote).toBeNull();
    expect(estratta.used() - decisa.used()).toBe(1);
    expect(decisa.used()).toBe(1);
  });

  it("`plays` vale anche contro la probabilità: è una decisione già presa, non una proposta", () => {
    // Con pPlays = 0,6 la prima estrazione 0,99 direbbe «non gioca»; plays: true vince.
    const r = scripted(tail);
    expect(samplePlayerLine(who, dist, r.random, true).baseVote).not.toBeNull();
    const r2 = scripted([0.3]);
    expect(samplePlayerLine(who, dist, r2.random, false).baseVote).toBeNull();
  });

  it("senza il parametro la funzione è quella di sempre, estrazione per estrazione", () => {
    // Stesso seme, stesso giocatore: con `plays` omesso o `undefined` la
    // sequenza dei risultati è identica. Il confronto con il CODICE PRECEDENTE è
    // nelle impronte della sezione 3, che passano da questa funzione.
    const a = mulberry32(99);
    const b = mulberry32(99);
    for (let i = 0; i < 500; i += 1) {
      expect(samplePlayerLine(who, dist, a)).toEqual(samplePlayerLine(who, dist, b, undefined));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. L'EFFETTO SULLA PROPOSTA — il difetto misurato, in piccolo
// ─────────────────────────────────────────────────────────────────────────────

describe("l'effetto sulla stima", () => {
  /** 3 portieri, difesa/centrocampo/attacco certi; tutti con distribuzione. */
  function squadWithKeepers(group: string | undefined): PlayerForecast[] {
    return [
      ...keepers({ ...(group === undefined ? {} : { group }), dist: true }),
      ...["D1", "D2", "D3", "D4"].map((id) => player(id, "D", 1, { dist: true })),
      ...["C1", "C2", "C3", "C4"].map((id) => player(id, "C", 1, { dist: true })),
      ...["A1", "A2"].map((id) => player(id, "A", 1, { dist: true })),
    ];
  }

  it("la porta scoperta non toglie più punti: la stima sale e la formazione tiene il portiere più probabile", () => {
    const run = (group: string | undefined) =>
      proposeLineup({
        squad: squadWithKeepers(group),
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
        scenarioBudget: 400,
      });
    const indipendenti = run(undefined);
    const esclusivi = run("club");
    expect(indipendenti.feasible && esclusivi.feasible).toBe(true);
    // Nei ~21 % di scenari senza portiere la squadra perde il portiere e il
    // modificatore difesa: con il gruppo quella massa non c'è.
    expect(esclusivi.estimate.expectedOurTotal).toBeGreaterThan(indipendenti.estimate.expectedOurTotal + 1);
    expect(esclusivi.estimate.expectedLeaguePoints).toBeGreaterThan(indipendenti.estimate.expectedLeaguePoints);
    expect(esclusivi.lineup!.goalkeeperId).toBe("Pa");
  });

  it("è deterministico: stessa rosa e stesso seme, stessa proposta bit a bit", () => {
    const run = () =>
      proposeLineup({
        squad: squadWithKeepers("club"),
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
        scenarioBudget: 400,
      });
    expect(run()).toEqual(run());
  });
});
