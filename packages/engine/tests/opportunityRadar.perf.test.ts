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
//  2. NON REGRESSIONE, CONTATA. Nessun cronometro: il ritorno al comportamento
//     quadratico si vede contando le RIGHE DI LISTONE che il radar legge —
//     `listone` righe se la scala del cliff si prepara una volta, `candidati ×
//     listone` se si ricostruisce a ogni candidato. Un intero riproducibile,
//     non una mediana di campioni presa su una macchina che fa anche altro.
//     Il perché del cambio, con la data, è nel blocco in testa alla sezione 2.

import { describe, it, expect } from "vitest";
import {
  ROLES,
  anchorBook,
  cliffFacts,
  cliffFactsOn,
  cliffLadder,
  competitorSet,
  declaredValueBook,
  opportunityRadar,
  reduce,
  type AuctionEvent,
  type OpportunityCandidate,
  type OpportunityRadarInput,
  type PlayerAnchor,
} from "../src/index.js";
import {
  referenceCliffFacts,
  referenceOpportunityRadar,
} from "./opportunityRadarReference.js";
import {
  PERF_GRID_ASSETS,
  PERF_GRID_DECLARED,
  countedInput,
  perfScenario,
  type PerfPhase,
  type RadarWorkCounters,
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
// 2. Non regressione — SI CONTA, NON SI CRONOMETRA (2026-08-24)
// ---------------------------------------------------------------------------

/* ────────────────────────────────────────────────────────────────────────────
   PERCHÉ QUESTA SEZIONE È CAMBIATA — 2026-08-24
   ────────────────────────────────────────────────────────────────────────────
   Qui vivevano due asserzioni a orologio di parete:

     - `expect(median).toBeLessThan(20)` sul caso realistico più pesante;
     - `expect(timeOf(large)).toBeLessThan(timeOf(small) * 2.5 + 1)`, cioè un
       RAPPORTO fra due tempi di parete misurati sulla stessa macchina.

   Nessuna delle due è stata tolta e nessuna è stata ammorbidita: entrambe
   dicono adesso la stessa cosa nella valuta in cui è esatta, e la seconda è
   INVERTITA — da «il tempo del caso grande non superi 2,5 volte quello del
   piccolo» (un tetto che si può centrare per fortuna) a «il listone si
   attraversa esattamente una volta, comunque cresca» più il controllo negativo
   che pretende il contrario dalla versione precedente.

   IL MOTIVO. La frase da provare — «il costo cresce con i candidati, non con
   candidati × listone» — è un'affermazione sulla QUANTITÀ DI LAVORO SVOLTO.
   Il cronometro la misurava per procura, e la procura salta appena la macchina
   fa altro: un worker ha visto quel rapporto fallire UNA volta su nove giri
   completi, su una macchina che nel frattempo compilava e serviva test e2e di
   altri worktree, e ha avuto ragione a NON classificarlo — nove giri non
   distinguono 1/9 da 0/9. Il difetto però non è la frequenza: è che la
   grandezza misurata non era quella affermata. Un test così prima o poi viene
   chiamato «flake» e riavviato finché non passa, ed è il meccanismo con cui un
   difetto vero si nasconde.

   La regola di casa esisteva già ed è scritta in due posti: `builds`/`hits` in
   `src/tierOrdering.cache.test.ts`, e il blocco «SI CONTA, NON SI CRONOMETRA»
   di `src/ui/listone.test.ts`, che ha sostituito lo stesso identico stampo di
   asserzione con un contatore di invocazioni.

   LA GRANDEZZA. `candidati × listone` non è una metafora: è letteralmente il
   numero di RIGHE DEL LISTONE che il radar legge. La scala del cliff costa una
   passata sul listone; costruirla una volta sola vuol dire `listone` righe
   lette, costruirla per ogni candidato vuol dire `candidati × listone`. Il
   contatore sta negli INGRESSI (`countedInput` in `perfScenario.ts`), non nel
   motore: nessuna riga di `packages/engine/src/` è stata toccata.

   IL CAMBIO È ANCHE UN GUADAGNO DI COPERTURA, misurato rompendo il motore in
   due modi separati (2026-08-24, su questa macchina):

     - ROTTURA A, scala del cliff ricostruita per candidato: contatori rossi
       (161.400 righe lette invece di 600); il vecchio rapporto a orologio la
       prendeva anche lui (37,6 ms contro un limite di 15,2);
     - ROTTURA B, memoizzazione di `competitorSet` rimossa: contatori rossi
       (269 valutazioni invece di 86); il vecchio file a orologio era VERDE,
       37 test su 37. Un fattore costante non si vede in un rapporto fra due
       tempi, e infatti non si vedeva.

   COSA NON PROVANO PIÙ QUESTI TEST, e va detto: nessuna soglia assoluta di
   tempo. Un rallentamento a parità di lavoro — dieci volte più lento dentro
   `currentAnchor`, per dire — non diventa rosso qui. Non lo diventava nemmeno
   prima in modo affidabile: il vecchio commento ammetteva che a 20 ms «anche
   la versione precedente passa su una macchina scarica (misurato: 12,3 ms)»,
   mentre la ROTTURA A qui sopra quel tetto l'ha superato. Cioè il verdetto
   dipendeva dalla macchina, che è esattamente il difetto in esame. Il posto
   dove quel numero assoluto si guarda davvero è il benchmark a mano,
   `packages/engine/bench/opportunityRadar.bench.ts`.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Il caso realistico più pesante: listone di Serie A per il classico (600
 * righe), asta appena scaldata, valore dichiarato su ogni riga. Sono ~270
 * candidati, cioè il numero massimo che una lega vera possa produrre.
 */
const WORST_REALISTIC = { assets: 600, declared: 600, phase: "early" as PerfPhase };

/** Quante volte il radar ha attraversato il listone per intero. */
function listonePasses(counters: RadarWorkCounters, listoneRows: number): number {
  return counters.listoneRows / listoneRows;
}

/** Quante volte è stato valutato l'insieme eleggibile: `state.teams` lo leggono
 *  solo il radar (una volta) e `competitorSet` (una volta per chiamata). */
function competitorEvaluations(counters: RadarWorkCounters): number {
  return counters.teamsReads - 1;
}

/** Le chiavi `(ruolo, soglia)` distinte fra i candidati prodotti: è il numero
 *  di valutazioni dell'insieme eleggibile che la memoizzazione deve produrre —
 *  ricavato dall'OUTPUT, non riscritto a mano accanto al motore. */
function distinctCompetitorKeys(out: readonly OpportunityCandidate[]): number {
  return new Set(out.map((c) => `${c.role}|${c.anchor.correctedAnchor}`)).size;
}

describe("opportunityRadar — non regressione, contando il lavoro svolto", () => {
  it("il caso di misura ha sostanza: candidati veri, non un ciclo vuoto", () => {
    // Se un domani le condizioni d'ingresso cambiassero e il radar tornasse
    // vuoto, ogni conteggio qui sotto sarebbe vero misurando il nulla.
    const { input } = perfScenario(
      WORST_REALISTIC.assets,
      WORST_REALISTIC.declared,
      WORST_REALISTIC.phase,
    );
    expect(input.book.all).toHaveLength(600);
    expect(opportunityRadar(input).length).toBeGreaterThan(150);
  });

  it("sul caso realistico più pesante il listone si attraversa UNA volta sola", () => {
    const { input } = perfScenario(
      WORST_REALISTIC.assets,
      WORST_REALISTIC.declared,
      WORST_REALISTIC.phase,
    );
    const counted = countedInput(input);
    const out = opportunityRadar(counted.input);
    const counters = counted.counters();

    // 269 candidati su 600 righe. La versione precedente leggeva 161.400
    // righe di listone (269 passate); questa ne legge 600, una passata.
    expect(out.length).toBeGreaterThan(150);
    expect(counters.listoneRows).toBe(input.book.all.length);
    expect(listonePasses(counters, input.book.all.length)).toBe(1);

    // ...e il ciclo esterno gira una volta per riga dichiarata, non di più:
    // è la metà «cresce con i candidati» della frase, contata.
    expect(counters.declaredRows).toBe(input.values.all.length);
  });

  it("il listone quadruplica, le passate restano UNA: il costo non è candidati × listone", () => {
    // QUESTO è il rilevatore del quadratico, e adesso guarda il lavoro, non
    // l'orologio: a parità di valori dichiarati si quadruplica il LISTONE e si
    // conta quante volte lo si attraversa. Il numero di candidati resta
    // confrontabile (76 vs 91), quindi a cambiare è quasi solo la lunghezza
    // del listino.
    const small = perfScenario(500, 200, "early");
    const large = perfScenario(2000, 200, "early");
    expect(small.input.values.all.length).toBe(large.input.values.all.length);

    const passesOf = (scenario: typeof small): number => {
      const counted = countedInput(scenario.input);
      opportunityRadar(counted.input);
      return listonePasses(counted.counters(), scenario.input.book.all.length);
    };

    // Una passata su 500 righe, una passata su 2000 righe. Un intero, non una
    // mediana: nessun carico di macchina lo sposta.
    expect(passesOf(small)).toBe(1);
    expect(passesOf(large)).toBe(1);
  });

  it("i candidati più che raddoppiano, le passate restano UNA", () => {
    // L'altra direzione, che l'asserzione a orologio non provava affatto: a
    // listone fermo si moltiplicano i CANDIDATI (76 -> 178) e le passate sul
    // listone non si muovono. È esattamente «il costo non cresce con
    // candidati × listone», visto dal lato dei candidati.
    const few = perfScenario(500, 200, "early");
    const many = perfScenario(500, 500, "early");

    const countedFew = countedInput(few.input);
    const outFew = opportunityRadar(countedFew.input);
    const countedMany = countedInput(many.input);
    const outMany = opportunityRadar(countedMany.input);

    expect(outMany.length).toBeGreaterThan(outFew.length * 2);
    expect(countedFew.counters().listoneRows).toBe(500);
    expect(countedMany.counters().listoneRows).toBe(500);
  });

  it("l'insieme eleggibile si valuta una volta per chiave distinta, non per candidato", () => {
    const { input } = perfScenario(
      WORST_REALISTIC.assets,
      WORST_REALISTIC.declared,
      WORST_REALISTIC.phase,
    );
    const counted = countedInput(input);
    const out = opportunityRadar(counted.input);

    const keys = distinctCompetitorKeys(out);
    // Le chiavi distinte devono essere DAVVERO meno dei candidati, altrimenti
    // l'uguaglianza qui sotto sarebbe vera anche senza memoizzazione.
    expect(keys).toBeLessThan(out.length / 2);
    expect(competitorEvaluations(counted.counters())).toBe(keys);
  });

  it("senza candidati la scala non si costruisce affatto: la pigrizia è contata", () => {
    // 200 giri del ciclo esterno su id che il listone non conosce (il foglio
    // valori più vecchio del listone), zero righe di listone lette. È la
    // pigrizia dichiarata in opportunities.ts: «un radar che non produce
    // candidati non la paga».
    const { input } = perfScenario(500, 0);
    const staleOnly: OpportunityRadarInput = {
      ...input,
      values: declaredValueBook(
        Array.from({ length: 200 }, (_, i) => ({ playerId: `stale${i}`, declaredValue: 10 })),
      ),
    };
    const counted = countedInput(staleOnly);

    expect(opportunityRadar(counted.input)).toHaveLength(0);
    expect(counted.counters()).toEqual({ listoneRows: 0, declaredRows: 200, teamsReads: 1 });
  });
});

/**
 * IL CONTROLLO NEGATIVO — la prova che il contatore MORDE.
 *
 * Un test di prestazione che non diventa rosso quando l'ottimizzazione sparisce
 * non prova niente, ed è il difetto peggiore di tutti perché sembra una difesa.
 * Qui la sparizione non va simulata: la versione PRE-ottimizzazione esiste già,
 * congelata in `opportunityRadarReference.ts`, ed è la stessa che il blocco 1
 * usa per provare l'identità dell'output. Lo stesso contatore, sullo stesso
 * ingresso, la becca — e le asserzioni qui sotto sono l'esatto opposto di
 * quelle del blocco sopra: se un domani qualcuno «ottimizzasse» il file di
 * riferimento, o rendesse il contatore cieco, questo test diventerebbe rosso e
 * l'altro perderebbe il suo strumento in silenzio.
 */
describe("il contatore morde: la versione precedente è quadratica e si vede", () => {
  it("la copia congelata attraversa il listone una volta PER CANDIDATO", () => {
    const { input } = perfScenario(
      WORST_REALISTIC.assets,
      WORST_REALISTIC.declared,
      WORST_REALISTIC.phase,
    );
    const counted = countedInput(input);
    const out = referenceOpportunityRadar(counted.input);
    const counters = counted.counters();

    // 269 candidati x 600 righe = 161.400 righe lette, contro le 600 della
    // versione viva. Il rapporto è il quadratico, in numeri interi.
    expect(listonePasses(counters, input.book.all.length)).toBe(out.length);
    expect(counters.listoneRows).toBe(out.length * input.book.all.length);
    expect(counters.listoneRows).toBeGreaterThan(100_000);

    // ...e l'insieme eleggibile lo rivaluta per ogni candidato, non per chiave.
    expect(competitorEvaluations(counters)).toBe(out.length);
    expect(distinctCompetitorKeys(out)).toBeLessThan(out.length / 2);
  });

  it("e il quadratico cresce col listone, mentre la versione viva no", () => {
    // La stessa coppia di scenari del rilevatore: quadruplicando il listone a
    // candidati confrontabili, la versione precedente moltiplica le righe lette
    // per ~4,8, quella viva resta a una passata. È il confronto che il rapporto
    // fra due cronometri voleva fare, in interi riproducibili.
    const small = perfScenario(500, 200, "early");
    const large = perfScenario(2000, 200, "early");

    const rowsRead = (
      input: OpportunityRadarInput,
      radar: (i: OpportunityRadarInput) => readonly OpportunityCandidate[],
    ): number => {
      const counted = countedInput(input);
      radar(counted.input);
      return counted.counters().listoneRows;
    };

    const refSmall = rowsRead(small.input, referenceOpportunityRadar);
    const refLarge = rowsRead(large.input, referenceOpportunityRadar);
    expect(refSmall).toBe(38_000); // 76 candidati x 500 righe
    expect(refLarge).toBe(182_000); // 91 candidati x 2000 righe
    expect(refLarge).toBeGreaterThan(refSmall * 4);

    const liveSmall = rowsRead(small.input, opportunityRadar);
    const liveLarge = rowsRead(large.input, opportunityRadar);
    expect(liveSmall).toBe(500);
    expect(liveLarge).toBe(2_000);
    // Il termine `candidati ×` è sparito: quello che resta è il listone e basta.
    expect(liveLarge).toBe(large.input.book.all.length);
  });
});
