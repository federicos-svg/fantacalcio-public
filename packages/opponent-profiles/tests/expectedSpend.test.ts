import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  PRECEDENT_FACT_IDS,
  calledPlayerIsExpensive,
  medianPrice,
  medianRatio,
  personHistories,
  pointInTimeKey,
  spendRatioBook,
  spendRowKey,
  spendUpliftRatio,
  spendUpliftReading,
  type CalledPlayer,
  type PastAuctionPurchase,
  type PointInTimeEntry,
  type SpendRatioBook,
  type SpendUpliftFactContribution,
  type SpendUpliftMeasured,
  type SpendUpliftReading,
} from "../src/index.js";

// IL SOVRAPPREZZO MISURATO, E CIÒ CHE NON PUÒ DIVENTARE.
//
// Fixture SINTETICHE soltanto: club inventati, giocatori `sint-*`, persone
// legate a nessuno. Nessun prezzo, nessuna stagione e nessuna spesa di una
// lega reale è riprodotta qui.
//
// Il file prova quattro cose, e le ultime due valgono quanto le prime:
//  1. che i tre fatti producano i loro rapporti e le loro `n`;
//  2. che la composizione sia l'UNIONE delle righe e non una mediana di
//     mediane — col controfattuale calcolato accanto, non solo dichiarato;
//  3. che la soglia di stagioni sia un INTERRUTTORE e non un peso ridotto;
//  4. che il tifo non abbia un canale per entrare in questo modulo.

// ─── Il laboratorio ──────────────────────────────────────────────────────────
//
// TRE STAGIONI, DODICI ACQUISTI D'ASTA CIASCUNA, con lo STESSO multinsieme di
// prezzi: `{120, 90×2, 60×5, 30×4}`. La costanza è voluta e non è pigrizia — è
// ciò che rende la curva leave-one-out la STESSA per ogni stagione e quindi i
// denominatori controllabili a mano:
//
//   fascia 1–3   (rank di prezzo)  →  [90,90,90,90,120,120]  mediana  90
//   fascia 4–8                     →  [60 ×10]               mediana  60
//   fascia 9–15                    →  [30 × 8]               mediana  30
//
// I RANGHI POINT-IN-TIME sono un INGRESSO (il deposito del generatore non vive
// in questo repository) e qui li dichiara la tabella `PIT_RANK`: sono distinti
// per giocatore e stabili fra le stagioni, così ogni riga sa quale fascia
// legge. Non coincidono col rango di PREZZO — che la curva ricalcola da sé — e
// devono non coincidere: ordinare per prezzo e poi leggere il prezzo sarebbe
// prevedere il passato.

const SEASONS = ["2021/22", "2022/23", "2023/24"] as const;

const PEOPLE = {
  torres: "person:00000000-0000-4000-8000-0000000000a1",
  bianchi: "person:00000000-0000-4000-8000-0000000000b2",
  verdi: "person:00000000-0000-4000-8000-0000000000c3",
} as const;

const CLUBS = {
  alfa: "Club Sintetico Alfa",
  beta: "Club Sintetico Beta",
  gamma: "Club Sintetico Gamma",
  delta: "Club Sintetico Delta",
} as const;

const TARGET = "sint-target";

/** Il rango point-in-time di ogni giocatore, uguale in tutte e tre le stagioni. */
const PIT_RANK: Readonly<Record<string, number>> = {
  "sint-b01": 1,
  "sint-b02": 2,
  "sint-b03": 3,
  [TARGET]: 4,
  "sint-b05": 5,
  "sint-b06": 6,
  "sint-b07": 7,
  "sint-b08": 8,
  "sint-b09": 9,
  "sint-b10": 10,
  "sint-b11": 11,
  "sint-b12": 12,
};

/** Il club reale di ogni giocatore. `sint-b09` è dell'Alfa come il chiamato. */
const CLUB_BY_PLAYER: Readonly<Record<string, string>> = {
  "sint-b01": CLUBS.gamma,
  "sint-b02": CLUBS.gamma,
  "sint-b03": CLUBS.gamma,
  [TARGET]: CLUBS.alfa,
  "sint-b05": CLUBS.beta,
  "sint-b06": CLUBS.beta,
  "sint-b07": CLUBS.beta,
  "sint-b08": CLUBS.beta,
  "sint-b09": CLUBS.alfa,
  "sint-b10": CLUBS.delta,
  "sint-b11": CLUBS.delta,
  "sint-b12": CLUBS.delta,
};

/** `[giocatore, persona, prezzo]` — una riga d'asta. */
type Row = readonly [string, string, number];

const SEASON_ROWS: Readonly<Record<string, readonly Row[]>> = {
  "2021/22": [
    [TARGET, PEOPLE.torres, 120],
    ["sint-b09", PEOPLE.torres, 60],
    ["sint-b05", PEOPLE.torres, 30],
    ["sint-b06", PEOPLE.torres, 30],
    ["sint-b01", PEOPLE.bianchi, 90],
    ["sint-b02", PEOPLE.bianchi, 90],
    ["sint-b03", PEOPLE.bianchi, 60],
    ["sint-b07", PEOPLE.bianchi, 60],
    ["sint-b08", PEOPLE.verdi, 60],
    ["sint-b10", PEOPLE.verdi, 60],
    ["sint-b11", PEOPLE.verdi, 30],
    ["sint-b12", PEOPLE.verdi, 30],
  ],
  "2022/23": [
    [TARGET, PEOPLE.torres, 90],
    ["sint-b09", PEOPLE.torres, 60],
    ["sint-b05", PEOPLE.torres, 30],
    ["sint-b06", PEOPLE.torres, 30],
    ["sint-b01", PEOPLE.bianchi, 120],
    ["sint-b02", PEOPLE.bianchi, 90],
    ["sint-b03", PEOPLE.bianchi, 60],
    ["sint-b07", PEOPLE.bianchi, 60],
    ["sint-b08", PEOPLE.verdi, 60],
    ["sint-b10", PEOPLE.verdi, 60],
    ["sint-b11", PEOPLE.verdi, 30],
    ["sint-b12", PEOPLE.verdi, 30],
  ],
  "2023/24": [
    ["sint-b09", PEOPLE.torres, 60],
    ["sint-b05", PEOPLE.torres, 30],
    ["sint-b06", PEOPLE.torres, 30],
    ["sint-b07", PEOPLE.torres, 30],
    ["sint-b01", PEOPLE.bianchi, 120],
    ["sint-b02", PEOPLE.bianchi, 90],
    ["sint-b03", PEOPLE.bianchi, 90],
    [TARGET, PEOPLE.verdi, 60],
    ["sint-b08", PEOPLE.verdi, 60],
    ["sint-b10", PEOPLE.verdi, 60],
    ["sint-b11", PEOPLE.verdi, 60],
    ["sint-b12", PEOPLE.verdi, 30],
  ],
};

/**
 * Un RINNOVO per stagione: prezzo amministrato, fuori dalla curva e fuori dai
 * fatti. Sta nella fixture proprio per provare che non entra da nessuna parte —
 * e non porta un rango point-in-time, come un rinnovo reale.
 */
const RENEWAL_PLAYER = "sint-riconfermato";

function syntheticHistory(): readonly PastAuctionPurchase[] {
  const out: PastAuctionPurchase[] = [];
  for (const season of SEASONS) {
    for (const [playerId, personId, price] of SEASON_ROWS[season] ?? []) {
      out.push({
        season,
        personId,
        playerId,
        club: CLUB_BY_PLAYER[playerId] as string,
        price,
        acquisition: "asta",
      });
    }
    out.push({
      season,
      personId: PEOPLE.bianchi,
      playerId: RENEWAL_PLAYER,
      club: CLUBS.delta,
      price: 50,
      acquisition: "riconferma",
    });
  }
  return out;
}

function pointInTime(): ReadonlyMap<string, PointInTimeEntry> {
  const out = new Map<string, PointInTimeEntry>();
  for (const season of SEASONS) {
    for (const [playerId, rank] of Object.entries(PIT_RANK)) {
      out.set(pointInTimeKey(season, playerId), { role: "A", rank });
    }
  }
  return out;
}

const HISTORY = syntheticHistory();
const PIT = pointInTime();
const CALLED: CalledPlayer = { playerId: TARGET, club: CLUBS.alfa };
const HISTORIES = personHistories(HISTORY);
const TORRES = HISTORIES.get(PEOPLE.torres)!;

const RATIOS: SpendRatioBook = spendRatioBook({ history: HISTORY, pointInTime: PIT });
const EXPENSIVE = calledPlayerIsExpensive(
  HISTORY,
  CALLED,
  DEFAULT_PRECEDENT_THRESHOLDS.expensiveFrom,
);

function upliftOf(overrides: Partial<Parameters<typeof spendUpliftReading>[0]> = {}) {
  return spendUpliftReading({
    person: TORRES,
    called: CALLED,
    ratios: RATIOS,
    expensive: EXPENSIVE,
    ...overrides,
  });
}

function measured(reading: SpendUpliftReading): SpendUpliftMeasured {
  if (reading.kind !== "uplift") throw new Error(`atteso un uplift, ricevuto ${reading.reason}`);
  return reading;
}

function factOf(
  contributions: readonly SpendUpliftFactContribution[],
  id: string,
): SpendUpliftFactContribution {
  const found = contributions.find((c) => c.id === id);
  if (found === undefined) throw new Error(`fatto assente: ${id}`);
  return found;
}

function ratioAt(season: string, personId: string, playerId: string): number {
  const row = RATIOS.byRow.get(spendRowKey(season, personId, playerId));
  if (row === undefined) throw new Error(`rapporto assente: ${season} ${playerId}`);
  return row.ratio;
}

// ─── L'aritmetica dichiarata ─────────────────────────────────────────────────

describe("medianRatio — mediana, mai media, e mai arrotondata a credito", () => {
  it("con n dispari è il centrale, con n pari la media dei due centrali", () => {
    expect(medianRatio([2, 0.5, 1])).toBe(1);
    expect(medianRatio([1, 2])).toBe(1.5);
    expect(medianRatio([])).toBeNull();
  });

  it("NON è `medianPrice`: quella arrotonda a crediti, e un rapporto non è un credito", () => {
    // La distinzione è load-bearing: `medianPrice([1, 2])` vale 2 perché mezzo
    // credito al tavolo non esiste. Applicata ai rapporti, la stessa regola
    // spingerebbe in alto ogni sovrapprezzo fra 1 e 2.
    expect(medianPrice([1, 2])).toBe(2);
    expect(medianRatio([1, 2])).toBe(1.5);
  });

  it("la mediana regge la coda che la media non regge", () => {
    // Sette righe a 1 credito e una da 100: la media direbbe «paga 13 volte la
    // curva», la mediana dice «paga la curva».
    const codaLunga = [1, 1, 1, 1, 1, 1, 1, 100];
    const media = codaLunga.reduce((a, b) => a + b, 0) / codaLunga.length;
    expect(medianRatio(codaLunga)).toBe(1);
    expect(media).toBeGreaterThan(13);
  });
});

// ─── I rapporti, e le loro assenze ───────────────────────────────────────────

describe("spendRatioBook — prezzo pagato diviso curva delle ALTRE aste", () => {
  it("legge ogni riga d'asta e nessun rinnovo", () => {
    // 12 acquisti × 3 stagioni. I tre rinnovi non sono righe d'asta e non
    // entrano nel conteggio: un prezzo amministrato non è formato in gara.
    expect(RATIOS.auctionRows).toBe(36);
    expect(RATIOS.measured).toBe(36);
    expect(RATIOS.skipped).toEqual({
      "rango-point-in-time-assente": 0,
      "rango-non-valido": 0,
      "curva-assente": 0,
      "fascia-senza-osservazioni": 0,
      "fascia-sotto-campione": 0,
      "mediana-non-positiva": 0,
    });
    // Il rinnovo non ha rango point-in-time e resta comunque nella popolazione
    // della curva (la sua spesa è pool): non è una riga «senza ruolo» scartata.
    expect(RATIOS.curveRowsWithoutRole).toBe(0);
    expect(RATIOS.seasons).toEqual([...SEASONS]);
  });

  it("il denominatore è la mediana della fascia, misurata SENZA la stagione della riga", () => {
    const row = RATIOS.byRow.get(spendRowKey("2021/22", PEOPLE.torres, TARGET))!;
    expect(row.rank).toBe(4);
    expect(row.band.rankFirst).toBe(4);
    // Fascia 4–8 sulle due ALTRE stagioni: dieci prezzi da 60 → mediana 60.
    expect(row.curveMedian).toBe(60);
    expect(row.bandSample).toBe(10);
    expect(row.price).toBe(120);
    expect(row.ratio).toBe(2);
  });

  it("le tre fasce hanno i tre denominatori che la fixture dichiara", () => {
    // fascia 1–3 → 90, fascia 4–8 → 60, fascia 9–15 → 30.
    expect(RATIOS.byRow.get(spendRowKey("2021/22", PEOPLE.bianchi, "sint-b01"))!.curveMedian).toBe(
      90,
    );
    expect(RATIOS.byRow.get(spendRowKey("2021/22", PEOPLE.torres, "sint-b05"))!.curveMedian).toBe(
      60,
    );
    expect(RATIOS.byRow.get(spendRowKey("2021/22", PEOPLE.torres, "sint-b09"))!.curveMedian).toBe(
      30,
    );
  });

  it("il leave-one-out è reale: la curva di una stagione NON contiene quella stagione", () => {
    const book = RATIOS.leaveOneOut.get("2021/22")!;
    expect(book.seasons).toEqual(["2022/23", "2023/24"]);
    expect(book.reason).toBeNull();
  });

  it("con UNA sola stagione il leave-one-out non lascia niente, e lo dichiara", () => {
    // Non è un caso patologico da nascondere: è la prima asta che si misura.
    // La risposta giusta è «non lo so», non un denominatore preso da sé stessa.
    const oneSeason = HISTORY.filter((r) => r.season === "2021/22");
    const book = spendRatioBook({ history: oneSeason, pointInTime: PIT });
    expect(book.measured).toBe(0);
    expect(book.skipped["curva-assente"]).toBe(12);
  });

  it("senza rango point-in-time NON c'è rapporto: contato, mai riempito", () => {
    const senza = new Map(PIT);
    senza.delete(pointInTimeKey("2021/22", TARGET));
    const book = spendRatioBook({ history: HISTORY, pointInTime: senza });
    expect(book.byRow.has(spendRowKey("2021/22", PEOPLE.torres, TARGET))).toBe(false);
    expect(book.skipped["rango-point-in-time-assente"]).toBe(1);
    expect(book.measured).toBe(35);
  });

  it("un rango che non è un rango è un motivo, non un ripiego", () => {
    const rotto = new Map(PIT);
    rotto.set(pointInTimeKey("2021/22", TARGET), { role: "A", rank: 0 });
    const book = spendRatioBook({ history: HISTORY, pointInTime: rotto });
    expect(book.skipped["rango-non-valido"]).toBe(1);
  });

  it("una fascia sotto campione non presta la mediana di nessun'altra", () => {
    // Minimo di fascia iniettato a 20: nessuna fascia della fixture lo regge.
    // Nessuna interpolazione, nessuna media di ruolo, nessuno zero.
    const book = spendRatioBook({
      history: HISTORY,
      pointInTime: PIT,
      curveOptions: { minBandSample: 20 },
    });
    expect(book.measured).toBe(0);
    expect(book.skipped["fascia-sotto-campione"]).toBe(36);
  });

  it("una fascia senza osservazioni è un'assenza distinta dal cold start", () => {
    const alto = new Map(PIT);
    // Rango 20: fascia 16–30, che in questa fixture non ha mai un'osservazione.
    alto.set(pointInTimeKey("2021/22", TARGET), { role: "A", rank: 20 });
    const book = spendRatioBook({ history: HISTORY, pointInTime: alto });
    expect(book.skipped["fascia-senza-osservazioni"]).toBe(1);
    expect(book.skipped["fascia-sotto-campione"]).toBe(0);
  });
});

// ─── I tre fatti, coi loro rapporti e le loro `n` ────────────────────────────

describe("i tre fatti dei precedenti, letti in forma di rapporto", () => {
  it("`ricomprato`: un rapporto per stagione in cui l'ha ripreso, e `n` in STAGIONI", () => {
    const fact = factOf(measured(upliftOf()).byFact, "ricomprato");
    // 120/60 = 2 nella prima stagione, 90/60 = 1,5 nella seconda.
    expect([ratioAt("2021/22", PEOPLE.torres, TARGET), ratioAt("2022/23", PEOPLE.torres, TARGET)])
      .toEqual([2, 1.5]);
    expect(fact.median).toBe(1.75);
    expect(fact.n).toBe(2);
    expect(fact.nBasis).toBe("stagioni");
    expect(fact.seasons).toEqual(["2021/22", "2022/23"]);
  });

  it("`club`: le sue righe su QUEL club nelle stagioni sopra soglia, e `n` in RIGHE", () => {
    const fact = factOf(measured(upliftOf()).byFact, "club");
    // Alfa = il chiamato più `sint-b09`. Tre stagioni sopra `clubShare`, cinque
    // righe in tutto: 2 · 2 · 1,5 · 2 · 2 → mediana 2.
    expect(fact.median).toBe(2);
    expect(fact.n).toBe(5);
    expect(fact.nBasis).toBe("righe");
    expect(fact.rows).toBe(5);
  });

  it("`piu-cari`: i tre più cari PER STAGIONE QUALIFICATA, e `n` in RIGHE", () => {
    const fact = factOf(measured(upliftOf()).byFact, "piu-cari");
    // Tre stagioni qualificate × tre acquisti = nove righe.
    expect(fact.n).toBe(9);
    expect(fact.nBasis).toBe("righe");
    expect(fact.median).toBe(1.5);
  });

  it("«stagione qualificata» è il cancello di `topSpendFact`, non una locuzione libera", () => {
    // Con `topShare` a 0,95 nessuna stagione qualifica più — la quota dei tre
    // più cari di Torres sta fra 0,8 e 0,88 — e il fatto `piu-cari` sparisce
    // per intero, invece di continuare a pescare righe da stagioni che il
    // cancello non ammette.
    const stretto = upliftOf({
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, topShare: 0.95 },
    });
    const ids = measured(stretto).byFact.map((c) => c.id);
    expect(ids).not.toContain("piu-cari");
    expect(ids).toEqual(["ricomprato", "club"]);
  });

  it("il chiamato deve essere «caro» perché `piu-cari` sia pertinente", () => {
    // Pertinenza misurata sullo storico: mediana 90 ≥ 50.
    expect(EXPENSIVE).toBe(true);
    const nonCaro = upliftOf({ expensive: false });
    expect(measured(nonCaro).byFact.map((c) => c.id)).toEqual(["ricomprato", "club"]);
  });

  it("i fatti escono nell'ordine dichiarato dei tipi, che non è una classifica", () => {
    expect(measured(upliftOf()).byFact.map((c) => c.id)).toEqual([...PRECEDENT_FACT_IDS]);
  });
});

// ─── L'unione, contro la mediana di mediane ─────────────────────────────────

describe("la composizione è l'UNIONE delle righe, e il controfattuale lo mostra", () => {
  const READING = measured(upliftOf());

  it("`uplift` è la mediana dei rapporti di TUTTE le righe unite", () => {
    // Nove righe distinte: 0,5 · 0,5 · 0,5 · 0,5 · 1,5 · 2 · 2 · 2 · 2 → 1,5.
    expect(READING.ratio).toBe(1.5);
    expect(READING.n).toBe(9);
    expect(READING.rows).toHaveLength(9);
    expect(medianRatio(READING.rows.map((r) => r.ratio))).toBe(READING.ratio);
  });

  it("NON è la mediana delle mediane — e i due numeri sono diversi, qui", () => {
    // Il controfattuale si CALCOLA, non si dichiara: le tre mediane per fatto
    // sono 1,75 · 2 · 1,5, la loro mediana è 1,75, e l'uplift vale 1,5. Il
    // giorno in cui qualcuno mediasse le mediane, questo test lo direbbe.
    const medianeDiFatto = READING.byFact.map((c) => c.median as number);
    expect(medianeDiFatto).toEqual([1.75, 2, 1.5]);
    const medianaDiMediane = medianRatio(medianeDiFatto);
    expect(medianaDiMediane).toBe(1.75);
    expect(medianaDiMediane).not.toBe(READING.ratio);
  });

  it("PERCHÉ è diverso: la mediana di mediane pesa i fatti in modo nascosto", () => {
    // `ricomprato` porta due righe, `piu-cari` nove: mediandone le mediane, le
    // due righe peserebbero quanto le nove. Il conto dei contributi lo mostra.
    expect(READING.byFact.map((c) => c.rows)).toEqual([2, 5, 9]);
  });

  it("UNIONE vuol dire INSIEME: una riga pertinente a due fatti entra una volta", () => {
    // 2 + 5 + 9 = 16 righe pescate, 9 distinte. La concatenazione — cioè la
    // duplicazione — darebbe 2, che non è né 1,5 né 1,75: una terza risposta,
    // prodotta da un peso scritto come una ripetizione.
    const pescate = READING.byFact.reduce((sum, c) => sum + c.rows, 0);
    expect(pescate).toBe(16);
    expect(READING.rows).toHaveLength(9);

    const concatenate = [
      ...[2, 1.5],
      ...[2, 2, 1.5, 2, 2],
      ...[2, 2, 0.5, 1.5, 2, 0.5, 2, 0.5, 0.5],
    ];
    expect(concatenate).toHaveLength(16);
    expect(medianRatio(concatenate)).toBe(2);
    expect(medianRatio(concatenate)).not.toBe(READING.ratio);
  });

  it("le righe unite sono ordinate e deterministiche", () => {
    const keys = READING.rows.map((r) => `${r.season}/${r.playerId}`);
    expect(keys).toEqual([...keys].sort());
    expect(spendUpliftRatio(upliftOf())).toBe(1.5);
  });

  it("il rapporto è adimensionale e non è mai arrotondato a credito", () => {
    // 1,5 è un rapporto: se qualcuno lo arrotondasse «perché i crediti sono
    // interi», 0,5 e 1,5 diventerebbero 1 e 2 e ogni sovrapprezzo sotto il 50%
    // sparirebbe. L'arrotondamento sta nel motore, su `E_o`, e solo lì.
    expect(Number.isInteger(READING.ratio)).toBe(false);
  });
});

// ─── L'interruttore della soglia ─────────────────────────────────────────────

describe("la soglia di stagioni è un INTERRUTTORE, mai un peso ridotto", () => {
  it("sopra soglia i fatti non entrano AFFATTO, e non entrano con meno peso", () => {
    // Torres ha tre stagioni misurate: con la soglia a 4 nessuno dei tre fatti
    // esiste, e la risposta è un'assenza col suo motivo — non un uplift
    // «attenuato», che sarebbe un peso travestito da prudenza.
    const sopra = upliftOf({
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, minSeasonsMeasured: 4 },
    });
    expect(sopra.kind).toBe("assente");
    if (sopra.kind !== "assente") throw new Error("atteso assente");
    expect(sopra.reason).toBe("nessun-fatto-attivo");
    expect(sopra.facts).toEqual([]);
    expect(spendUpliftRatio(sopra)).toBeNull();
  });

  it("alla soglia dichiarata (1) non morde: l'uplift resta quello di sempre", () => {
    expect(DEFAULT_PRECEDENT_THRESHOLDS.minSeasonsMeasured).toBe(1);
    const uno = upliftOf({
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, minSeasonsMeasured: 1 },
    });
    expect(measured(uno).ratio).toBe(1.5);
  });

  it("nessun fatto attivo ⇒ nessun uplift: una persona senza precedenti non ne ha", () => {
    // Bianchi non ha mai comprato il chiamato, non ha speso sull'Alfa, e il
    // fatto `piu-cari` resta il solo possibile: togliendogli la pertinenza,
    // non resta niente.
    const bianchi = HISTORIES.get(PEOPLE.bianchi)!;
    const reading = upliftOf({ person: bianchi, expensive: false });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") throw new Error("atteso assente");
    expect(reading.reason).toBe("nessun-fatto-attivo");
  });

  it("fatti attivi ma nessun rapporto misurabile: «non lo so», mai 1", () => {
    // Un uplift assente NON è un uplift uguale a 1: un moltiplicatore neutro e
    // un moltiplicatore assente producono lo stesso numero e sono due
    // affermazioni diverse.
    const senzaRapporti = spendRatioBook({ history: HISTORY, pointInTime: new Map() });
    const reading = upliftOf({ ratios: senzaRapporti });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") throw new Error("atteso assente");
    expect(reading.reason).toBe("nessun-rapporto-misurabile");
    // I fatti restano leggibili: mancano i rapporti, non i precedenti.
    expect(reading.facts).toHaveLength(3);
    expect(spendUpliftRatio(reading)).toBeNull();
  });

  it("una riga senza rapporto è contata, non riempita", () => {
    const senza = new Map(PIT);
    senza.delete(pointInTimeKey("2021/22", TARGET));
    const reading = measured(upliftOf({ ratios: spendRatioBook({ history: HISTORY, pointInTime: senza }) }));
    expect(reading.rowsWithoutRatio).toBe(1);
    expect(reading.n).toBe(8);
  });
});

// ─── Il tifo non ha un canale ────────────────────────────────────────────────

describe("il tifo non entra qui, e la garanzia è strutturale", () => {
  const SOURCE = readFileSync(new URL("../src/expectedSpend.ts", import.meta.url), "utf8");

  it("`supportedClub` non è un tipo di fatto, quindi non può comporre nessun uplift", () => {
    expect([...PRECEDENT_FACT_IDS]).toEqual(["ricomprato", "club", "piu-cari"]);
    const ids = measured(upliftOf()).facts.map((f) => f.id);
    for (const id of ids) expect(PRECEDENT_FACT_IDS).toContain(id);
  });

  it("il modulo non legge i profili d'intervista: non ne importa la porta", () => {
    // `confirmedPrior()` (profileView.ts) è l'unico modo supportato di leggere
    // un prior confermato, e `affinityClubs` è il campo del tifo. Nessuno dei
    // due compare qui — non «non viene usato»: non è raggiungibile.
    expect(SOURCE).not.toContain("confirmedPrior");
    expect(SOURCE).not.toContain("affinityClubs");
    expect(SOURCE).not.toContain("profileView.js");
    expect(SOURCE).not.toContain("profileSchema.js");
  });

  it("le tre guardie di tipo esistono, e una loro rimozione si vede", () => {
    // Mordono a `tsc --noEmit`; questo test impedisce che spariscano in
    // silenzio insieme al campo che aprirebbero.
    expect(SOURCE).toContain("type AssertNoProfilesChannel");
    expect(SOURCE).toContain("type AssertNoSupportedClubChannel");
    expect(SOURCE).toContain("type AssertSupportedClubIsNotAFact");
  });

  it("l'ingresso dichiarato non ha un campo per i profili né per il tifo", () => {
    const declaration = SOURCE.slice(
      SOURCE.indexOf("export interface SpendUpliftInput"),
      SOURCE.indexOf("const FACT_ORDER"),
    );
    expect(declaration).toContain("readonly person: PersonHistory");
    expect(declaration).not.toMatch(/readonly\s+profiles\s*[?]?\s*:/);
    expect(declaration).not.toMatch(/readonly\s+supportedClub\s*[?]?\s*:/);
  });
});
