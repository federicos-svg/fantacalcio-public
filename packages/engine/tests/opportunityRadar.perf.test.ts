// PERF-T008 — due domande, due blocchi.
//
//  1. IDENTITÀ DELL'OUTPUT. L'ottimizzazione del radar (scala del cliff
//     preparata una volta, insieme eleggibile riusato a parità di ruolo e
//     soglia) doveva costare ZERO in informazione: stessi candidati, stessi
//     campi, stesso ordine. Qui lo si dimostra confrontando la versione viva
//     con la COPIA CONGELATA della versione precedente
//     (`opportunityRadarReference.ts`) su tutta la griglia di dimensioni
//     operative, più i casi di bordo della scala che una griglia casuale non
//     produce da sola.
//
//  2. NON REGRESSIONE. Una soglia larga, non un cronometro: serve a far
//     diventare rosso un ritorno al comportamento quadratico, non a misurare
//     la macchina. Vedi il commento sulla costante per il margine scelto.

import { describe, it, expect } from "vitest";
import {
  ROLES,
  anchorBook,
  cliffFacts,
  cliffFactsOn,
  cliffLadder,
  competitorSet,
  opportunityRadar,
  reduce,
  type AuctionEvent,
  type PlayerAnchor,
} from "../src/index.js";
import {
  referenceCliffFacts,
  referenceOpportunityRadar,
} from "./opportunityRadarReference.js";
import {
  PERF_GRID_ASSETS,
  PERF_GRID_DECLARED,
  perfScenario,
  type PerfPhase,
} from "./perfScenario.js";
import { TEAMS, anchor, buildLog, buy } from "./layer2Fixtures.js";

// ---------------------------------------------------------------------------
// 1. Identità dell'output
// ---------------------------------------------------------------------------

describe("opportunityRadar — l'ottimizzazione non cambia una virgola dell'output", () => {
  for (const assets of PERF_GRID_ASSETS) {
    for (const declared of PERF_GRID_DECLARED) {
      it(`A=${assets} D=${declared}: stesso risultato della versione precedente`, () => {
        const { input } = perfScenario(assets, declared);
        const now = opportunityRadar(input);
        const before = referenceOpportunityRadar(input);

        // `toStrictEqual` prende anche una proprietà passata a `undefined` al
        // posto di una assente; il confronto su JSON prende in più l'ORDINE
        // delle chiavi, che è ciò che un consumatore serializza.
        expect(now).toStrictEqual(before);
        expect(JSON.stringify(now)).toBe(JSON.stringify(before));
      });
    }
  }

  for (const phase of ["early", "mid", "late"] as PerfPhase[]) {
    it(`fase "${phase}" sul listone intero valutato (A=600)`, () => {
      const { input } = perfScenario(600, 600, phase);
      const now = opportunityRadar(input);
      expect(now.length).toBeGreaterThan(50); // il confronto deve avere sostanza
      expect(now).toStrictEqual(referenceOpportunityRadar(input));
      expect(JSON.stringify(now)).toBe(JSON.stringify(referenceOpportunityRadar(input)));
    });
  }

  /**
   * L'insieme eleggibile viene riusato a parità di (ruolo, soglia). Questo test
   * esiste perché la parte «ruolo» della chiave è invisibile finché nessun
   * rivale ha un reparto chiuso: senza reparti pieni `maxSafe` non dipende dal
   * ruolo, l'insieme eleggibile è lo stesso ovunque, e togliere il ruolo dalla
   * chiave passerebbe inosservato (verificato: quella mutazione passava).
   */
  it("fase «late»: con reparti rivali chiusi l'insieme eleggibile dipende dal ruolo", () => {
    const { input } = perfScenario(600, 600, "late");

    const rivalsWithClosedRole = Object.values(input.state.teams).filter(
      (t) => t.fantaTeamId !== input.selfId && ROLES.some((r) => t.slotsRemaining[r] <= 0),
    );
    expect(rivalsWithClosedRole.length).toBeGreaterThan(0);

    // ...e il numero di rivali eleggibili DEVE differire fra i ruoli a parità
    // di soglia, altrimenti il caso non discrimina nulla.
    const countsAtSameThreshold = ROLES.map(
      (r) => competitorSet(input.state, r, 5, input.selfId).eligibleCount,
    );
    expect(new Set(countsAtSameThreshold).size).toBeGreaterThan(1);

    expect(opportunityRadar(input)).toStrictEqual(referenceOpportunityRadar(input));
  });

  it("radar vuoto: nessun candidato, nessuna divergenza", () => {
    const { input } = perfScenario(500, 0);
    expect(opportunityRadar(input)).toStrictEqual(referenceOpportunityRadar(input));
    expect(opportunityRadar(input)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Casi di bordo della scala: una griglia seminata li produce raramente, e sono
// esattamente i punti in cui una ricerca binaria sbaglia se sbaglia.
// ---------------------------------------------------------------------------

describe("cliffFacts — la scala preparata risponde come quella ricostruita", () => {
  const LADDER: PlayerAnchor[] = [
    anchor("t_alone", "P", 20), // unico del ruolo -> last-of-role
    anchor("t_top", "D", 50), // cima della scala
    anchor("t_tie_a", "D", 30), // pari ancora fra due disponibili -> gap 0
    anchor("t_tie_b", "D", 30),
    anchor("t_mid", "D", 18),
    anchor("t_bottom", "D", 1), // fondo scala -> bottom-of-ladder
    anchor("t_zero", "C", 0), // Qt.A 0: gapRatio non definito
    anchor("t_zero_b", "C", 0),
    anchor("t_c_hi", "C", 40),
    anchor("t_sold", "A", 25),
    anchor("t_a_left", "A", 24),
  ];
  const BOOK = anchorBook(LADDER);

  const scenarios: readonly (readonly [string, AuctionEvent[]])[] = [
    ["mercato intatto", buildLog([])],
    ["un venduto", buildLog([buy("t_sold", "A", TEAMS[1]!, 30)])],
    [
      "ruolo svuotato tranne uno",
      buildLog([
        buy("t_top", "D", TEAMS[1]!, 60),
        buy("t_tie_a", "D", TEAMS[2]!, 35),
        buy("t_tie_b", "D", TEAMS[3]!, 35),
        buy("t_mid", "D", TEAMS[4]!, 20),
      ]),
    ],
    [
      "ruolo interamente venduto",
      buildLog([
        buy("t_top", "D", TEAMS[1]!, 60),
        buy("t_tie_a", "D", TEAMS[2]!, 35),
        buy("t_tie_b", "D", TEAMS[3]!, 35),
        buy("t_mid", "D", TEAMS[4]!, 20),
        buy("t_bottom", "D", TEAMS[5]!, 2),
      ]),
    ],
  ];

  for (const [label, log] of scenarios) {
    it(`${label}: stessi fatti per ogni giocatore del listino`, () => {
      const state = reduce(log, TEAMS);
      const ladder = cliffLadder(BOOK, state);
      for (const a of LADDER) {
        const expected = referenceCliffFacts(a.playerId, BOOK, state);
        expect(cliffFacts(a.playerId, BOOK, state)).toStrictEqual(expected);
        expect(cliffFactsOn(ladder, a.playerId)).toStrictEqual(expected);
      }
      // Giocatore fuori listino: `null` esplicito, da entrambe le vie.
      expect(cliffFacts("ignoto", BOOK, state)).toBeNull();
      expect(cliffFactsOn(ladder, "ignoto")).toBeNull();
    });
  }
});

/**
 * IL SEGNO DELLO ZERO, che è il caso in cui la prima stesura di questa
 * ottimizzazione sbagliava davvero.
 *
 * `validateAnchors` accetta una Qt.A `-0` (`-0 < 0` è falso), e `Math.max`
 * distingue `-0` da `+0` mentre `===`, `<=` e l'ordinamento no. Leggere il
 * pari-ancora come «la propria quota» invece che come «il massimo fra gli
 * altri pari» faceva divergere `nextAlternativeAnchor` **e** `gap` dalla
 * versione precedente. Il confronto esaustivo l'ha trovato; questo test lo
 * tiene preso.
 *
 * `toStrictEqual` distingue `-0` da `+0` (verificato); `JSON.stringify` no
 * (`-0` diventa `0`), quindi qui il confronto JSON non basterebbe.
 */
describe("cliffFacts — il segno dello zero non si perde", () => {
  const ZERO: PlayerAnchor[] = [
    anchor("z_neg", "P", -0),
    anchor("z_neg2", "P", -0),
    anchor("z_pos", "P", 0),
    anchor("z_one", "P", 1),
  ];
  const ZBOOK = anchorBook(ZERO);

  const cases: readonly (readonly [string, ReturnType<typeof buildLog>])[] = [
    ["tutti disponibili", buildLog([])],
    ["venduto lo zero negativo", buildLog([buy("z_neg", "P", TEAMS[1]!, 1)])],
    ["venduto lo zero positivo", buildLog([buy("z_pos", "P", TEAMS[1]!, 1)])],
    [
      "venduti entrambi gli zeri negativi",
      buildLog([buy("z_neg", "P", TEAMS[1]!, 1), buy("z_neg2", "P", TEAMS[2]!, 1)]),
    ],
    [
      "resta solo uno zero negativo",
      buildLog([buy("z_pos", "P", TEAMS[1]!, 1), buy("z_neg2", "P", TEAMS[2]!, 1)]),
    ],
  ];

  for (const [label, log] of cases) {
    it(`${label}: stessi fatti, segno dello zero compreso`, () => {
      const state = reduce(log, TEAMS);
      const ladder = cliffLadder(ZBOOK, state);
      for (const a of ZERO) {
        const expected = referenceCliffFacts(a.playerId, ZBOOK, state);
        expect(cliffFacts(a.playerId, ZBOOK, state)).toStrictEqual(expected);
        expect(cliffFactsOn(ladder, a.playerId)).toStrictEqual(expected);
      }
    });
  }

  it("il caso che sfuggiva: pari-ancora fra -0 e +0", () => {
    const state = reduce(buildLog([]), TEAMS);
    const facts = cliffFacts("z_neg", ZBOOK, state)!;
    // `Math.max` fra gli altri pari (-0 e +0) è +0, non la propria quota -0.
    expect(Object.is(facts.nextAlternativeAnchor, 0)).toBe(true);
    expect(Object.is(facts.gap, -0)).toBe(true);
    expect(facts.gapRatio).toBeNull();
    expect(facts).toStrictEqual(referenceCliffFacts("z_neg", ZBOOK, state));
  });
});

// ---------------------------------------------------------------------------
// 2. Non regressione
// ---------------------------------------------------------------------------

/**
 * Il caso realistico più pesante: listone di Serie A per il classico (600
 * righe), asta appena scaldata, valore dichiarato su ogni riga. Sono ~270
 * candidati, cioè il numero massimo che una lega vera possa produrre.
 */
const WORST_REALISTIC = { assets: 600, declared: 600, phase: "early" as PerfPhase };

/**
 * SOGLIA LARGA, DI PROPOSITO, e onesta su cosa prende.
 *
 * Misurato su questo caso, a seconda del carico del processo: 1-4 ms di
 * mediana dopo PERF-T008, 6-12 ms prima. Il tetto è a 20 ms perché un runner di
 * CI condiviso è lento, rumoroso e senza garanzie di CPU: una soglia stretta
 * sarebbe un test che lampeggia, e un test che lampeggia viene disattivato.
 *
 * Questo tetto NON è il rilevatore del quadratico, ed è giusto dirlo: a 20 ms
 * anche la versione precedente passa su una macchina scarica (misurato: 12,3
 * ms). È un massimale grossolano — prende le regressioni grosse e prende il
 * quadratico appena il runner è lento o il listone cresce. Il rilevatore
 * preciso è il test successivo, che guarda la FORMA della crescita invece del
 * valore assoluto, ed è rosso sulla versione precedente (misurato: 9,41 ms
 * contro un limite di 4,67).
 */
const REGRESSION_BUDGET_MS = 20;

describe("opportunityRadar — non regressione di performance", () => {
  it(`resta sotto ${REGRESSION_BUDGET_MS} ms sul caso realistico più pesante`, () => {
    const { input } = perfScenario(
      WORST_REALISTIC.assets,
      WORST_REALISTIC.declared,
      WORST_REALISTIC.phase,
    );

    // Il caso deve avere sostanza: se un domani le condizioni d'ingresso
    // cambiassero e il radar tornasse vuoto, questo test passerebbe misurando
    // il nulla. L'asserzione sul numero di candidati lo impedisce.
    expect(opportunityRadar(input).length).toBeGreaterThan(150);

    for (let i = 0; i < 5; i++) opportunityRadar(input); // warmup JIT

    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      opportunityRadar(input);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;

    expect(median).toBeLessThan(REGRESSION_BUDGET_MS);
  });

  it("il costo cresce con i candidati, non con candidati x listone", () => {
    // QUESTO è il rilevatore del quadratico, e guarda la forma, non l'orologio:
    // a parità di valori dichiarati si quadruplica il LISTONE e si controlla che
    // il tempo non lo segua. Il numero di candidati resta confrontabile (76 vs
    // 91), quindi a cambiare è quasi solo la lunghezza del listino.
    //
    // Rapporti misurati fra A=500 e A=2000: **1,01x dopo** PERF-T008, **4,94x
    // prima**. Il tetto a 2,5x sta in mezzo con margine da entrambi i lati —
    // 2,5 volte il rumore di CI sopra il comportamento attuale, e ben sotto il
    // 4,94x di quello precedente, che è ciò che deve tornare rosso.
    const small = perfScenario(500, 200, "early");
    const large = perfScenario(2000, 200, "early");
    expect(small.input.values.all.length).toBe(large.input.values.all.length);

    const timeOf = (input: Parameters<typeof opportunityRadar>[0]): number => {
      for (let i = 0; i < 5; i++) opportunityRadar(input);
      const samples: number[] = [];
      for (let i = 0; i < 9; i++) {
        const t0 = performance.now();
        opportunityRadar(input);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]!;
    };

    // Il listone quadruplica; il tempo non deve seguirlo.
    expect(timeOf(large.input)).toBeLessThan(timeOf(small.input) * 2.5 + 1);
  });
});
