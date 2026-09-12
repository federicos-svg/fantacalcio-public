import { describe, it, expect } from "vitest";
import {
  DEFAULT_BOOTSTRAP_REPLICATES,
  DEFAULT_CONFIDENCE_LEVEL,
  MIN_BOOTSTRAP_REPLICATES,
  MIN_MATCHDAYS_FOR_INTERVAL,
  type HistoricalMatchdayObservation,
  type ReferencePolicyId,
  formatHistoricalComparison,
  historicalBootstrapSubSeed,
  historicalPolicyComparison,
  seasonBootstrapSubSeed,
} from "../src/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE SINTETICA. Nessun giocatore, nessuna quotazione, nessuna stagione
// reale: tre stagioni si chiamano SYN-01, SYN-02, SYN-03 e i loro punti nascono
// da un ciclo dichiarato qui sotto. La regola è scritta in chiaro perché ogni
// cella della tabella si possa ricalcolare a mano, e i test la ricalcolano per
// una strada diversa da quella del modulo.
// ─────────────────────────────────────────────────────────────────────────────

/** Il tetto ex-post vince ogni giornata della fixture: tre punti, sempre. */
const CEILING_POINTS = 3;

/**
 * Punti di lega per politica, come ciclo che si ripete sulle giornate. Lunghezze
 * diverse fra loro di proposito: se fossero tutte uguali, un errore di indice
 * resterebbe invisibile perché ogni politica sbaglierebbe nello stesso modo.
 */
const CYCLE: Record<string, readonly number[]> = {
  BEST_EX_POST: [3],
  TOP_ELEVEN_BY_SEASON_AVERAGE: [0, 1, 0, 3],
  RULE_OF_72: [1, 3, 0, 1, 3],
  BASE_ENGINE: [3, 1, 3, 0, 1, 3],
};

/** Ogni stagione parte da un punto diverso del ciclo. */
const SEASON_SHIFT: Record<string, number> = { "SYN-01": 0, "SYN-02": 2, "SYN-03": 1 };

const POLICIES: readonly ReferencePolicyId[] = [
  "BEST_EX_POST",
  "TOP_ELEVEN_BY_SEASON_AVERAGE",
  "RULE_OF_72",
  "BASE_ENGINE",
];

function pointsOf(season: string, policy: ReferencePolicyId, matchday: number): number {
  const cycle = CYCLE[policy] as readonly number[];
  const shift = SEASON_SHIFT[season] as number;
  return cycle[(matchday - 1 + shift) % cycle.length] as number;
}

function observationsFor(
  seasons: Readonly<Record<string, number>>,
  policies: readonly ReferencePolicyId[] = POLICIES,
): HistoricalMatchdayObservation[] {
  const out: HistoricalMatchdayObservation[] = [];
  for (const [season, matchdays] of Object.entries(seasons)) {
    for (const policy of policies) {
      for (let matchday = 1; matchday <= matchdays; matchday += 1) {
        const leaguePoints = pointsOf(season, policy, matchday);
        out.push({
          season,
          policy,
          matchday,
          leaguePoints,
          leaguePointsRegret: CEILING_POINTS - leaguePoints,
        });
      }
    }
  }
  return out;
}

/** Tre stagioni: due lunghe dodici giornate, una corta quattro. */
const GOLDEN_SEASONS = { "SYN-01": 12, "SYN-02": 12, "SYN-03": 4 } as const;
const GOLDEN_SEED = 20260911;

function goldenComparison(overrides: Partial<Parameters<typeof historicalPolicyComparison>[0]> = {}) {
  return historicalPolicyComparison({
    observations: observationsFor(GOLDEN_SEASONS),
    seed: GOLDEN_SEED,
    ...overrides,
  });
}

function cellOf(
  comparison: ReturnType<typeof historicalPolicyComparison>,
  policy: ReferencePolicyId,
  season: string,
) {
  const cell = comparison.cells.find((c) => c.policy === policy && c.season === season);
  if (cell === undefined) throw new Error(`cella mancante: ${policy} × ${season}`);
  return cell;
}

function pooledOf(comparison: ReturnType<typeof historicalPolicyComparison>, policy: ReferencePolicyId) {
  const cell = comparison.pooled.find((c) => c.policy === policy);
  if (cell === undefined) throw new Error(`colonna cumulata mancante: ${policy}`);
  return cell;
}

/** Permutazione deterministica che MESCOLA LE STAGIONE FRA LORO, non solo le righe. */
function shuffleDeterministically(
  observations: readonly HistoricalMatchdayObservation[],
): HistoricalMatchdayObservation[] {
  const indexed = observations.map((observation, index) => ({ observation, index }));
  indexed.sort((a, b) => {
    const ka = `${a.observation.matchday}|${a.observation.season}|${String(a.observation.policy)}`;
    const kb = `${b.observation.matchday}|${b.observation.season}|${String(b.observation.policy)}`;
    if (ka < kb) return 1;
    if (ka > kb) return -1;
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.observation);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN FIXTURE — la tabella, cifra per cifra.
// ─────────────────────────────────────────────────────────────────────────────

describe("confronto storico §11.3 — golden fixture", () => {
  it("produce la tabella politiche × stagioni con i numeri attesi", () => {
    const comparison = goldenComparison();

    expect(comparison.metric).toBe("LEAGUE_POINTS_REGRET");
    expect(comparison.seasons).toEqual(["SYN-01", "SYN-02", "SYN-03"]);
    // Ordine canonico = ordine del catalogo di §11.1, non ordine di arrivo.
    expect(comparison.policies).toEqual([
      "BEST_EX_POST",
      "TOP_ELEVEN_BY_SEASON_AVERAGE",
      "RULE_OF_72",
      "BASE_ENGINE",
    ]);
    expect(comparison.replicates).toBe(DEFAULT_BOOTSTRAP_REPLICATES);
    expect(comparison.confidenceLevel).toBe(DEFAULT_CONFIDENCE_LEVEL);
    expect(comparison.minMatchdaysForInterval).toBe(MIN_MATCHDAYS_FOR_INTERVAL);

    // Il tetto non ha rimpianto, in nessuna stagione: è la definizione, e se un
    // giorno questa riga non fosse zero il rimpianto non sarebbe un rimpianto.
    expect(cellOf(comparison, "BEST_EX_POST", "SYN-01").total).toBe(0);
    expect(cellOf(comparison, "BEST_EX_POST", "SYN-02").total).toBe(0);
    expect(pooledOf(comparison, "BEST_EX_POST").mean).toBe(0);

    // SYN-01, dodici giornate: tre cicli interi di [0,1,0,3] = 12 punti su 36.
    const floor01 = cellOf(comparison, "TOP_ELEVEN_BY_SEASON_AVERAGE", "SYN-01");
    expect(floor01.matchdaysCounted).toBe(12);
    expect(floor01.total).toBe(24);
    expect(floor01.mean).toBe(2);

    const rule01 = cellOf(comparison, "RULE_OF_72", "SYN-01");
    expect(rule01.total).toBe(16);
    expect(rule01.mean).toBeCloseTo(16 / 12, 12);

    const base01 = cellOf(comparison, "BASE_ENGINE", "SYN-01");
    expect(base01.total).toBe(14);
    expect(base01.mean).toBeCloseTo(14 / 12, 12);

    // Gli intervalli, bit per bit: sono l'oggetto di WP-10, e se cambiano senza
    // che nessuno lo abbia deciso questo test lo dice.
    expect(floor01.interval).toEqual({
      lower: 1.25,
      upper: 2.6666666666666665,
      level: 0.95,
      replicates: 2000,
      resampledUnits: 12,
    });
    expect(rule01.interval?.lower).toBe(0.6666666666666666);
    expect(rule01.interval?.upper).toBe(2);
    expect(base01.interval?.lower).toBe(0.5);
    expect(base01.interval?.upper).toBe(1.8333333333333333);

    // Il ciclo di RULE_OF_72 è lungo cinque e non divide dodici: SYN-01 e
    // SYN-02 hanno davvero giornate diverse, e i loro intervalli lo dicono.
    expect(cellOf(comparison, "RULE_OF_72", "SYN-02").total).toBe(19);
    expect(cellOf(comparison, "RULE_OF_72", "SYN-02").interval?.lower).toBe(0.9166666666666666);
    expect(cellOf(comparison, "RULE_OF_72", "SYN-02").interval?.upper).toBe(2.25);

    // Colonna cumulata: 12 + 12 + 4 = 28 giornate, sopra soglia anche se una
    // stagione da sola non lo è.
    const pooledFloor = pooledOf(comparison, "TOP_ELEVEN_BY_SEASON_AVERAGE");
    expect(pooledFloor.matchdaysCounted).toBe(28);
    expect(pooledFloor.total).toBe(56);
    expect(pooledFloor.mean).toBe(2);
    expect(pooledFloor.interval?.lower).toBe(1.5357142857142858);
    expect(pooledFloor.interval?.upper).toBe(2.4285714285714284);

    const pooledRule = pooledOf(comparison, "RULE_OF_72");
    expect(pooledRule.total).toBe(40);
    expect(pooledRule.mean).toBeCloseTo(40 / 28, 12);
    expect(pooledRule.interval?.lower).toBe(0.9642857142857143);
    expect(pooledRule.interval?.upper).toBe(1.8571428571428572);

    expect(comparison.reason).toContain("rimpianto in punti di lega per giornata");
    expect(comparison.reason).toContain("ORDINARE");
  });

  it("il campo reason conta esattamente le celle senza intervallo (M18)", () => {
    const comparison = goldenComparison();
    // Ricalcolo indipendente dal campo stesso: SYN-03 ha solo quattro
    // giornate, sotto soglia per ogni politica, quindi tutte le sue celle
    // sono senza intervallo e nessun'altra lo è.
    const withoutInterval = comparison.cells.filter((cell) => cell.interval === null).length;
    expect(withoutInterval).toBe(comparison.policies.length);
    expect(comparison.reason).toContain(`${withoutInterval} cella/e senza intervallo`);
  });

  it("la metrica alternativa cambia i numeri e lo dichiara", () => {
    const comparison = goldenComparison({ metric: "LEAGUE_POINTS" });
    expect(comparison.metric).toBe("LEAGUE_POINTS");
    // Rimpianto 24 su 36 possibili ⇒ punti realizzati 12.
    expect(cellOf(comparison, "TOP_ELEVEN_BY_SEASON_AVERAGE", "SYN-01").total).toBe(12);
    expect(cellOf(comparison, "BEST_EX_POST", "SYN-01").total).toBe(36);
    expect(comparison.reason).toContain("punti di lega realizzati per giornata");
  });

  it("il report è deterministico e porta con sé ciò che serve a rifarlo", () => {
    const report = formatHistoricalComparison(goldenComparison());
    expect(report).toBe(formatHistoricalComparison(goldenComparison()));
    expect(report).toContain(`seme ${GOLDEN_SEED}`);
    expect(report).toContain("2000 ripetizioni");
    expect(report).toContain("percentile al 95.0 %");
    expect(report).toContain("Migliori 11 per fantamedia");
    expect(report).toContain("2.000 [1.250; 2.667]");
    expect(report).toContain("1.333 [0.667; 2.000]");
    expect(report).toContain("non misurabile");
    expect(report).toContain("più basso è meglio");
    // Il lettore deve sapere che la colonna cumulata non è la media degli
    // intervalli per stagione: se sparisce questa frase, la tabella mente.
    expect(report).toContain("NON per l'intervallo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPRIETÀ 1 — DETERMINISMO. Stesso seme, stesso intervallo; stagioni
// permutate, stesso intervallo.
// ─────────────────────────────────────────────────────────────────────────────

describe("confronto storico §11.3 — determinismo del bootstrap", () => {
  it("stesso seme ⇒ stessa tabella bit per bit", () => {
    const first = goldenComparison();
    const second = goldenComparison();
    expect(second).toEqual(first);
    // `toEqual` accetterebbe 0 e -0 come uguali: gli estremi si confrontano
    // anche con `Object.is`, che è il vero «bit per bit».
    for (let i = 0; i < first.cells.length; i += 1) {
      const a = first.cells[i]?.interval ?? null;
      const b = second.cells[i]?.interval ?? null;
      expect(Object.is(a?.lower ?? null, b?.lower ?? null)).toBe(true);
      expect(Object.is(a?.upper ?? null, b?.upper ?? null)).toBe(true);
    }
  });

  it("stagioni permutate in ingresso ⇒ stessa tabella, stessi intervalli", () => {
    const ordered = goldenComparison();
    const shuffled = historicalPolicyComparison({
      observations: shuffleDeterministically(observationsFor(GOLDEN_SEASONS)),
      seed: GOLDEN_SEED,
    });
    expect(shuffled).toEqual(ordered);
    for (let i = 0; i < ordered.cells.length; i += 1) {
      expect(Object.is(ordered.cells[i]?.total, shuffled.cells[i]?.total)).toBe(true);
      expect(Object.is(ordered.cells[i]?.mean, shuffled.cells[i]?.mean)).toBe(true);
      expect(Object.is(ordered.cells[i]?.interval?.lower, shuffled.cells[i]?.interval?.lower)).toBe(true);
      expect(Object.is(ordered.cells[i]?.interval?.upper, shuffled.cells[i]?.interval?.upper)).toBe(true);
    }
    for (let i = 0; i < ordered.pooled.length; i += 1) {
      expect(Object.is(ordered.pooled[i]?.total, shuffled.pooled[i]?.total)).toBe(true);
      expect(Object.is(ordered.pooled[i]?.interval?.lower, shuffled.pooled[i]?.interval?.lower)).toBe(true);
      expect(Object.is(ordered.pooled[i]?.interval?.upper, shuffled.pooled[i]?.interval?.upper)).toBe(true);
    }
  });

  it("il flusso di una stagione dipende dal suo NOME, non dalla sua posizione", () => {
    // È la proprietà che rende vero il test qui sopra invece che fortunato.
    expect(seasonBootstrapSubSeed(GOLDEN_SEED, "SYN-01")).toBe(
      seasonBootstrapSubSeed(GOLDEN_SEED, "SYN-01"),
    );
    expect(seasonBootstrapSubSeed(GOLDEN_SEED, "SYN-01")).not.toBe(
      seasonBootstrapSubSeed(GOLDEN_SEED, "SYN-02"),
    );
    expect(seasonBootstrapSubSeed(GOLDEN_SEED, "SYN-01")).not.toBe(
      seasonBootstrapSubSeed(GOLDEN_SEED + 1, "SYN-01"),
    );
    // Il sotto-seme del confronto è derivato dal seme, non è il seme: due
    // discipline diverse per la stessa cosa sarebbero un difetto.
    expect(historicalBootstrapSubSeed(GOLDEN_SEED)).not.toBe(GOLDEN_SEED);
  });

  it("un seme diverso muove davvero l'intervallo", () => {
    // Senza questo, un intervallo costante passerebbe ogni test di determinismo.
    const a = goldenComparison();
    const b = goldenComparison({ seed: GOLDEN_SEED + 1 });
    const intervalsA = a.cells.map((cell) => `${String(cell.interval?.lower)}|${String(cell.interval?.upper)}`);
    const intervalsB = b.cells.map((cell) => `${String(cell.interval?.lower)}|${String(cell.interval?.upper)}`);
    expect(intervalsB).not.toEqual(intervalsA);
    // Ma i valori puntuali NON dipendono dal seme: il seme è del bootstrap.
    expect(a.cells.map((cell) => cell.total)).toEqual(b.cells.map((cell) => cell.total));
    expect(a.pooled.map((cell) => cell.mean)).toEqual(b.pooled.map((cell) => cell.mean));
  });

  it("il numero di politiche in tabella non sposta gli intervalli delle altre", () => {
    // Il bootstrap è appaiato: gli indici estratti sono della stagione, non
    // della politica. Togliere una colonna non deve muovere le altre.
    const all = goldenComparison();
    const fewer = historicalPolicyComparison({
      observations: observationsFor(GOLDEN_SEASONS, ["BEST_EX_POST", "RULE_OF_72"]),
      seed: GOLDEN_SEED,
    });
    expect(cellOf(fewer, "RULE_OF_72", "SYN-01").interval).toEqual(
      cellOf(all, "RULE_OF_72", "SYN-01").interval,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4 — L'ESTREMO ALTO NON DEVE CADERE SU UN PLATEAU.
//
// `percentileEndpoints` prende l'estremo alto in posizione
// `ceil((1 − alpha/2) · B) − 1`, cioè 1949 su 2000 repliche al 95 %: togliere
// quel `− 1` sposta la lettura a 1950. La fixture GOLDEN_SEASONS non lo vede,
// perché i suoi cicli sono piccoli interi che si ripetono (0, 1, 3 …): la coda
// della distribuzione ricampionata ha pochi valori distinti e le posizioni
// 1949 e 1950 ci cadono sopra lo stesso valore — un plateau. Un test che
// interroga `sorted[1949]` in quella fixture non distingue l'indice giusto da
// quello sbagliato di un'unità, perché in quel punto non c'è niente da
// rompere.
//
// Qui la fixture usa valori continui — un seno di un moltiplicatore non in
// relazione semplice con dodici giornate — invece di un ciclo che si ripete:
// non è un dato di dominio (non è un punteggio di lega vero), è costruito
// apposta per non avere due giornate con lo stesso valore, così la somma
// ricampionata non ha plateau nella coda. Verificato fuori da questo modulo,
// riproducendo lo stesso ricampionamento (`mulberry32` sul sotto-seme di
// `seasonBootstrapSubSeed`): sulle 2000 repliche i quaranta valori attorno
// alla coda alta sono tutti distinti, e in particolare
// `sorted[1949] = 2.5352381964979736` mentre
// `sorted[1950] = 2.53687904483904` — due numeri diversi, non lo stesso
// scritto due volte.
// ─────────────────────────────────────────────────────────────────────────────

const CONTINUOUS_SEASON = "SYN-CONTINUOUS";
const CONTINUOUS_UNITS = 12;

/**
 * Valore continuo per giornata, non un punteggio di lega: costruito apposta
 * perché ogni giornata dia un numero diverso dalle altre, così le repliche
 * bootstrap non ripetono mai la stessa somma e la coda non ha plateau.
 */
function continuousValue(matchday: number): number {
  return Math.abs(Math.sin(matchday * 12.9898)) * 3;
}

function continuousObservations(): HistoricalMatchdayObservation[] {
  const out: HistoricalMatchdayObservation[] = [];
  for (const policy of ["RULE_OF_72", "BASE_ENGINE"] as const) {
    for (let matchday = 1; matchday <= CONTINUOUS_UNITS; matchday += 1) {
      const value = continuousValue(matchday);
      out.push({
        season: CONTINUOUS_SEASON,
        policy,
        matchday,
        leaguePoints: value,
        leaguePointsRegret: value,
      });
    }
  }
  return out;
}

describe("confronto storico §11.3 — M4: l'estremo alto dell'intervallo", () => {
  it("sorted[1949] è l'estremo giusto, e non è lo stesso numero di sorted[1950]", () => {
    const comparison = historicalPolicyComparison({
      observations: continuousObservations(),
      seed: GOLDEN_SEED,
    });
    const cell = cellOf(comparison, "RULE_OF_72", CONTINUOUS_SEASON);
    expect(cell.matchdaysCounted).toBe(CONTINUOUS_UNITS);
    // Se l'indice perdesse il suo `− 1` (posizione 1950 invece di 1949),
    // questo valore diventerebbe 2.53687904483904: un numero diverso, non
    // una variazione nell'ultimo bit.
    expect(cell.interval?.upper).toBe(2.5352381964979736);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPRIETÀ 2 — LA SOGLIA. Sotto, nessun numero: «non misurabile».
// ─────────────────────────────────────────────────────────────────────────────

describe("confronto storico §11.3 — la soglia dell'intervallo", () => {
  it("quattro giornate non producono nessun intervallo, e lo dicono", () => {
    const comparison = goldenComparison();
    const short = cellOf(comparison, "RULE_OF_72", "SYN-03");
    expect(short.matchdaysCounted).toBe(4);
    expect(short.interval).toBeNull();
    expect(short.intervalReason).toContain("non misurabile con questa storia");
    expect(short.intervalReason).toContain("soglia 10");
    // Il valore puntuale resta: è la MISURA a mancare, non il dato.
    expect(short.total).not.toBeNull();
    expect(short.mean).not.toBeNull();
  });

  it("la cella immediatamente sopra soglia l'intervallo ce l'ha", () => {
    const atThreshold = historicalPolicyComparison({
      observations: observationsFor({ "SYN-01": MIN_MATCHDAYS_FOR_INTERVAL }),
      seed: GOLDEN_SEED,
    });
    expect(cellOf(atThreshold, "RULE_OF_72", "SYN-01").interval).not.toBeNull();

    const belowThreshold = historicalPolicyComparison({
      observations: observationsFor({ "SYN-01": MIN_MATCHDAYS_FOR_INTERVAL - 1 }),
      seed: GOLDEN_SEED,
    });
    expect(cellOf(belowThreshold, "RULE_OF_72", "SYN-01").interval).toBeNull();
    expect(pooledOf(belowThreshold, "RULE_OF_72").interval).toBeNull();
  });

  it("la soglia si applica anche alla colonna cumulata, sulle giornate totali", () => {
    // Due stagioni corte da sole non bastano; insieme sì. La soglia è sulle
    // unità ricampionate, non sul numero di stagioni.
    const comparison = historicalPolicyComparison({
      observations: observationsFor({ "SYN-01": 6, "SYN-02": 6 }),
      seed: GOLDEN_SEED,
    });
    expect(cellOf(comparison, "RULE_OF_72", "SYN-01").interval).toBeNull();
    expect(cellOf(comparison, "RULE_OF_72", "SYN-02").interval).toBeNull();
    const pooled = pooledOf(comparison, "RULE_OF_72");
    expect(pooled.matchdaysCounted).toBe(12);
    expect(pooled.interval).not.toBeNull();
    expect(pooled.intervalReason).toContain("stratificato per stagione");
  });

  it("una base comune vuota non produce nemmeno un valore puntuale", () => {
    const observations = observationsFor({ "SYN-01": 3 }).map((observation) =>
      observation.policy === "RULE_OF_72"
        ? { ...observation, leaguePoints: null, leaguePointsRegret: null }
        : observation,
    );
    const comparison = historicalPolicyComparison({ observations, seed: GOLDEN_SEED });
    const cell = cellOf(comparison, "BASE_ENGINE", "SYN-01");
    expect(cell.matchdaysCounted).toBe(0);
    expect(cell.total).toBeNull();
    expect(cell.mean).toBeNull();
    expect(cell.interval).toBeNull();
    expect(formatHistoricalComparison(comparison)).toContain("—");
  });

  it("una giornata non calcolabile per una politica esce dalla base di tutte", () => {
    const observations = observationsFor({ "SYN-01": 12 }).map((observation) =>
      observation.policy === "RULE_OF_72" && observation.matchday === 5
        ? { ...observation, leaguePoints: null, leaguePointsRegret: null }
        : observation,
    );
    const comparison = historicalPolicyComparison({ observations, seed: GOLDEN_SEED });
    const basis = comparison.seasonBasis[0];
    expect(basis?.sameBasis).toBe(false);
    expect(basis?.matchdaysExcluded).toEqual([5]);
    expect(basis?.matchdaysCommon).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    // Anche le politiche che quella giornata ce l'avevano contano 11 giornate:
    // un confronto appaiato non lascia a una colonna una giornata in più.
    for (const policy of POLICIES) {
      expect(cellOf(comparison, policy, "SYN-01").matchdaysCounted).toBe(11);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROPRIETÀ 3 — LA TABELLA SI RICOSTRUISCE DAL PROPRIO DETTAGLIO.
// ─────────────────────────────────────────────────────────────────────────────

describe("confronto storico §11.3 — ricostruzione dal dettaglio", () => {
  it("ogni cella si ricalcola dagli ingressi, sommandoli per una strada diversa", () => {
    const comparison = goldenComparison();
    for (const policy of POLICIES) {
      for (const [season, matchdays] of Object.entries(GOLDEN_SEASONS)) {
        // Ricalcolo indipendente: dalla regola della fixture, non dal modulo.
        let expected = 0;
        for (let matchday = 1; matchday <= matchdays; matchday += 1) {
          expected += CEILING_POINTS - pointsOf(season, policy, matchday);
        }
        const cell = cellOf(comparison, policy, season);
        expect(cell.total).toBe(expected);
        expect(cell.mean).toBe(expected / matchdays);
      }
    }
  });

  it("la riga «tutte le stagioni» è ricostruita dalle celle, non calcolata a parte", () => {
    const comparison = goldenComparison();
    for (const policy of POLICIES) {
      const rowCells = comparison.cells.filter((cell) => cell.policy === policy);
      const pooled = pooledOf(comparison, policy);

      // Totale: somma dei totali delle celle, negli stessi ordini canonici.
      let totalFromCells = 0;
      let unitsFromCells = 0;
      for (const cell of rowCells) {
        if (cell.total === null) continue;
        totalFromCells += cell.total;
        unitsFromCells += cell.matchdaysCounted;
      }
      expect(pooled.total).toBe(totalFromCells);
      expect(pooled.matchdaysCounted).toBe(unitsFromCells);

      // Media: media PESATA delle medie delle celle, con peso le giornate.
      let weighted = 0;
      for (const cell of rowCells) {
        if (cell.mean === null) continue;
        weighted += cell.mean * cell.matchdaysCounted;
      }
      expect(pooled.mean as number).toBeCloseTo(weighted / unitsFromCells, 12);
    }
  });

  it("la media pesata NON è la media semplice delle celle: i pesi contano", () => {
    // Guardia contro la ricostruzione sbagliata che passerebbe inosservata con
    // stagioni di uguale lunghezza: qui SYN-03 ne ha quattro e le altre dodici.
    const comparison = goldenComparison();
    // RULE_OF_72 ha medie diverse nelle tre stagioni (1,333 / 1,583 / 1,250):
    // con medie uguali questo test passerebbe anche su una ricostruzione rotta.
    const policy: ReferencePolicyId = "RULE_OF_72";
    const means = comparison.cells
      .filter((cell) => cell.policy === policy)
      .map((cell) => cell.mean as number);
    const naive = means.reduce((sum, mean) => sum + mean, 0) / means.length;
    expect(pooledOf(comparison, policy).mean).not.toBeCloseTo(naive, 6);
  });

  it("la somma delle celle di una colonna corrisponde alle osservazioni di quella stagione", () => {
    const comparison = goldenComparison();
    for (const [season, matchdays] of Object.entries(GOLDEN_SEASONS)) {
      const column = comparison.cells.filter((cell) => cell.season === season);
      const fromCells = column.reduce((sum, cell) => sum + (cell.total ?? 0), 0);
      let fromObservations = 0;
      for (const policy of POLICIES) {
        for (let matchday = 1; matchday <= matchdays; matchday += 1) {
          fromObservations += CEILING_POINTS - pointsOf(season, policy, matchday);
        }
      }
      expect(fromCells).toBe(fromObservations);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE GUARDIE — ciò che il modulo rifiuta, e perché.
// ─────────────────────────────────────────────────────────────────────────────

describe("confronto storico §11.3 — guardie", () => {
  it("una riga mancante non è un null e si rifiuta", () => {
    const observations = observationsFor({ "SYN-01": 12 }).filter(
      (observation) => !(observation.policy === "RULE_OF_72" && observation.matchday === 7),
    );
    expect(() => historicalPolicyComparison({ observations, seed: GOLDEN_SEED })).toThrow(
      /manca la riga di RULE_OF_72 alla giornata 7/,
    );
  });

  it("due righe per la stessa giornata si rifiutano", () => {
    const observations = observationsFor({ "SYN-01": 12 });
    const duplicate = observations[0] as HistoricalMatchdayObservation;
    expect(() =>
      historicalPolicyComparison({ observations: [...observations, duplicate], seed: GOLDEN_SEED }),
    ).toThrow(/due righe per/i);
  });

  it("un seme fuori da [0, 2^32) si rifiuta invece di essere troncato", () => {
    expect(() => goldenComparison({ seed: 2 ** 32 })).toThrow(/seed non valido/);
    expect(() => goldenComparison({ seed: 3.7 })).toThrow(/seed non valido/);
  });

  it("troppo poche ripetizioni si rifiutano", () => {
    expect(() => goldenComparison({ replicates: 50 })).toThrow(/ripetizioni non valide/);
  });

  it("un livello di confidenza fuori da (0,5, 1) si rifiuta", () => {
    expect(() => goldenComparison({ confidenceLevel: 0.4 })).toThrow(/livello di confidenza/);
    expect(() => goldenComparison({ confidenceLevel: 1 })).toThrow(/livello di confidenza/);
  });

  // ───────────────────────────────────────────────────────────────────────
  // QUATTRO CONFINI DI PARAMETRO, PROVATI ESATTAMENTE AL LIMITE — non «ben
  // dentro» né «ben fuori», ma il valore stesso che separa accettato da
  // rifiutato. Ciascuno prova il lato rifiutato del confine dichiarato in
  // `assertParameters` o nelle guardie di forma.
  // ───────────────────────────────────────────────────────────────────────

  it("minMatchdaysForInterval = 1 si rifiuta: il minimo valido è 2 (M2)", () => {
    expect(() => goldenComparison({ minMatchdaysForInterval: 1 })).toThrow(/soglia non valida/);
  });

  it("matchday = 0 si rifiuta: le giornate partono da 1 (M13)", () => {
    const observations = observationsFor({ "SYN-01": 1 }).map((observation) => ({
      ...observation,
      matchday: 0,
    }));
    expect(() => historicalPolicyComparison({ observations, seed: GOLDEN_SEED })).toThrow(
      /giornata non valida/,
    );
  });

  it("replicates = 199, cioè il minimo meno uno, si rifiuta (M14)", () => {
    expect(() => goldenComparison({ replicates: MIN_BOOTSTRAP_REPLICATES - 1 })).toThrow(
      /ripetizioni non valide/,
    );
  });

  it("confidenceLevel = 0,5 esatto si rifiuta: il limite basso è aperto (M15)", () => {
    expect(() => goldenComparison({ confidenceLevel: 0.5 })).toThrow(/livello di confidenza/);
  });

  it("un NaN non passa per «non calcolabile»", () => {
    const observations = observationsFor({ "SYN-01": 12 });
    const broken = [...observations];
    broken[3] = { ...(broken[3] as HistoricalMatchdayObservation), leaguePointsRegret: Number.NaN };
    expect(() => historicalPolicyComparison({ observations: broken, seed: GOLDEN_SEED })).toThrow(
      /non finito/,
    );
  });

  it("nessuna osservazione non è un confronto in parità", () => {
    expect(() => historicalPolicyComparison({ observations: [], seed: GOLDEN_SEED })).toThrow(
      /nessuna osservazione/,
    );
  });
});
