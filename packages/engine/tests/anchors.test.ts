import { describe, it, expect } from "vitest";
import {
  MIN_INFLATION_SAMPLE,
  anchorBook,
  currentAnchor,
  isPlayerAvailable,
  measuredInflation,
  paidAnchorSamples,
  residualPressure,
  settledPurchases,
  validateAnchors,
  type AuctionEvent,
  type PlayerAnchor,
} from "../src/index.js";
import { TEAMS, TS, anchor, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";

// Listino sintetico: ruolo A "caldo" (5 acquisti sopra quotazione), ruolo D
// con solo 2 acquisti (sotto soglia di campione), ruolo P mai toccato.
const LISTINO: PlayerAnchor[] = [
  anchor("a1", "A", 50, 61),
  anchor("a2", "A", 40),
  anchor("a3", "A", 30),
  anchor("a4", "A", 20),
  anchor("a5", "A", 10),
  anchor("a6", "A", 30),
  anchor("d1", "D", 10),
  anchor("d2", "D", 20),
  anchor("d3", "D", 20),
  anchor("p1", "P", 2),
];

const BOOK = anchorBook(LISTINO);

// Ruolo A: pagato 180 su ancore 150 -> inflazione +20%.
const A_SPECS = [
  buy("a1", "A", "new_milf", 60),
  buy("a2", "A", "ataturk", 50),
  buy("a3", "A", "psg", 35),
  buy("a4", "A", "ac_vostra", 25),
  buy("a5", "A", "new_casatiello", 10),
];
// Ruolo D: solo 2 acquisti, alla quotazione -> campione insufficiente.
const D_SPECS = [buy("d1", "D", "new_milf", 10), buy("d2", "D", "ataturk", 20)];

describe("validateAnchors — fail-closed sul listino di ancore", () => {
  it("accetta un listino ben formato", () => {
    expect(validateAnchors(LISTINO)).toEqual({ ok: true, issues: [] });
  });

  it("accetta una Qt.A pari a 0 (esiste nei listini) ma non una negativa", () => {
    expect(validateAnchors([anchor("x", "A", 0)]).ok).toBe(true);
    expect(validateAnchors([anchor("x", "A", -1)]).issues[0]?.violation).toBe("quotation-invalid");
  });

  it("rifiuta NaN e Infinity come Qt.A — la classe di bug che passa ogni soglia", () => {
    expect(validateAnchors([anchor("x", "A", Number.NaN)]).issues[0]?.violation).toBe(
      "quotation-invalid",
    );
    expect(validateAnchors([anchor("x", "A", Number.POSITIVE_INFINITY)]).issues[0]?.violation).toBe(
      "quotation-invalid",
    );
  });

  it("rifiuta un playerId vuoto", () => {
    expect(validateAnchors([anchor("", "A", 10)]).issues[0]?.violation).toBe("player-id-empty");
  });

  it("rifiuta un playerId duplicato, segnalando la SECONDA occorrenza", () => {
    const result = validateAnchors([anchor("a1", "A", 50), anchor("a1", "A", 40)]);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ index: 1, playerId: "a1", violation: "duplicate-player" }]);
  });

  it("rifiuta una FVM invalida solo quando è presente", () => {
    expect(validateAnchors([anchor("x", "A", 10)]).ok).toBe(true);
    expect(validateAnchors([anchor("x", "A", 10, Number.NaN)]).issues[0]?.violation).toBe(
      "fvm-invalid",
    );
    expect(validateAnchors([anchor("x", "A", 10, -2)]).issues[0]?.violation).toBe("fvm-invalid");
  });

  it("riporta OGNI violazione della stessa riga, non solo la prima", () => {
    const result = validateAnchors([anchor("", "A", Number.NaN, -1)]);
    expect(result.issues.map((i) => i.violation)).toEqual([
      "player-id-empty",
      "quotation-invalid",
      "fvm-invalid",
    ]);
    expect(result.issues.every((i) => i.index === 0)).toBe(true);
  });
});

describe("anchorBook — costruzione fail-closed", () => {
  it("indicizza per playerId", () => {
    expect(BOOK.byPlayerId.get("a1")?.quotation).toBe(50);
    expect(BOOK.byPlayerId.get("nessuno")).toBeUndefined();
    expect(BOOK.all).toHaveLength(LISTINO.length);
  });

  it("trasporta la FVM senza usarla in nessun calcolo", () => {
    expect(BOOK.byPlayerId.get("a1")?.fvm).toBe(61);
    // La FVM di a1 (61) è molto sopra la sua Qt.A (50): se entrasse nei calcoli
    // l'ancora corrente in cold start non coinciderebbe con la Qt.A.
    const cold = currentAnchor("a1", BOOK, measuredInflation([], BOOK));
    expect(cold?.baseAnchor).toBe(50);
    expect(cold?.correctedAnchor).toBe(50);
  });

  it("lancia su un listino invalido — impossibile derivare ancore da dati rotti", () => {
    expect(() => anchorBook([anchor("a1", "A", 50), anchor("a1", "A", 40)])).toThrow(
      /invalid anchors/,
    );
    expect(() => anchorBook([anchor("x", "A", Number.NaN)])).toThrow(/quotation-invalid/);
  });

  it("copia l'elenco: mutare l'array di partenza non muta il book", () => {
    const source: PlayerAnchor[] = [anchor("x", "A", 10)];
    const book = anchorBook(source);
    source.push(anchor("y", "A", 20));
    expect(book.all).toHaveLength(1);
  });
});

describe("settledPurchases — acquisti ancora in piedi", () => {
  it("esclude i PURCHASE compensati da un VOID e ordina per seq", () => {
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 2, ts: TS, playerId: "a2", role: "A", fantaTeamId: "psg", price: 40 },
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "a1", role: "A", fantaTeamId: "psg", price: 99 },
      { type: "VOID", seq: 1, ts: TS, targetSeq: 0 },
    ];
    expect(settledPurchases(log).map((p) => p.playerId)).toEqual(["a2"]);
  });

  it("un log senza acquisti in piedi è una lista vuota, non un errore", () => {
    expect(settledPurchases([])).toEqual([]);
  });
});

describe("paidAnchorSamples — la provenienza riga per riga dell'inflazione", () => {
  const samples = paidAnchorSamples(buildLog(A_SPECS), BOOK);

  it("appaia prezzo pagato e Qt.A, con delta e rapporto", () => {
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual({
      seq: 0,
      playerId: "a1",
      role: "A",
      fantaTeamId: "new_milf",
      price: 60,
      quotation: 50,
      delta: 10,
      ratio: 1.2,
    });
  });

  it("esclude gli acquisti senza ancora invece di dar loro una quotazione finta", () => {
    const log = buildLog([...A_SPECS, buy("sconosciuto", "A", "psg", 90)]);
    expect(paidAnchorSamples(log, BOOK).map((s) => s.playerId)).not.toContain("sconosciuto");
  });

  it("rapporto `null` (non 0, non Infinity) quando la Qt.A è 0", () => {
    const book = anchorBook([anchor("z", "A", 0)]);
    const sample = paidAnchorSamples(buildLog([buy("z", "A", "psg", 7)]), book)[0];
    expect(sample?.ratio).toBeNull();
    expect(sample?.delta).toBe(7);
  });
});

describe("measuredInflation — misura, con il proprio campione", () => {
  it("log vuoto: nessuna copertura, inflazione null, mai uno 0 travestito", () => {
    const inflation = measuredInflation([], BOOK);
    expect(inflation.overall).toEqual({
      n: 0,
      missingAnchor: 0,
      paidTotal: 0,
      anchorTotal: 0,
      inflation: null,
      sufficient: false,
      reason: "no-anchor-coverage",
    });
    expect(inflation.perRole.A.inflation).toBeNull();
    expect(inflation.minSample).toBe(MIN_INFLATION_SAMPLE);
  });

  it("cold start dichiarato: sotto MIN_INFLATION_SAMPLE il numero non esce", () => {
    const log = buildLog(A_SPECS.slice(0, MIN_INFLATION_SAMPLE - 1));
    const measure = measuredInflation(log, BOOK).perRole.A;
    expect(measure.n).toBe(MIN_INFLATION_SAMPLE - 1);
    expect(measure.reason).toBe("insufficient-sample");
    expect(measure.sufficient).toBe(false);
    expect(measure.inflation).toBeNull();
    // I totali restano visibili: il campione si può mostrare anche quando la
    // misura non si può.
    expect(measure.paidTotal).toBe(170);
    expect(measure.anchorTotal).toBe(140);
  });

  it("esattamente alla soglia la misura esce, un acquisto sotto no", () => {
    expect(measuredInflation(buildLog(A_SPECS), BOOK).perRole.A.sufficient).toBe(true);
    expect(
      measuredInflation(buildLog(A_SPECS.slice(0, 4)), BOOK).perRole.A.sufficient,
    ).toBe(false);
  });

  it("formula dichiarata: Σ pagato / Σ Qt.A − 1, pesata sui crediti", () => {
    const measure = measuredInflation(buildLog(A_SPECS), BOOK).perRole.A;
    expect(measure.paidTotal).toBe(180);
    expect(measure.anchorTotal).toBe(150);
    expect(measure.inflation).toBeCloseTo(0.2, 10);
    expect(measure.n).toBe(5);
  });

  it("le misure per ruolo sono indipendenti: A caldo non scalda D né P", () => {
    const inflation = measuredInflation(buildLog([...A_SPECS, ...D_SPECS]), BOOK);
    expect(inflation.perRole.A.sufficient).toBe(true);
    expect(inflation.perRole.D.n).toBe(2);
    expect(inflation.perRole.D.reason).toBe("insufficient-sample");
    expect(inflation.perRole.P.n).toBe(0);
    expect(inflation.perRole.P.reason).toBe("no-anchor-coverage");
    expect(inflation.overall.n).toBe(7);
    expect(inflation.overall.sufficient).toBe(true);
  });

  it("gli acquisti senza ancora si contano come copertura mancante, per ruolo e in totale", () => {
    const log = buildLog([
      ...A_SPECS,
      buy("ignoto1", "A", "psg", 12),
      buy("ignoto2", "D", "psg", 3),
    ]);
    const inflation = measuredInflation(log, BOOK);
    expect(inflation.perRole.A.missingAnchor).toBe(1);
    expect(inflation.perRole.D.missingAnchor).toBe(1);
    expect(inflation.overall.missingAnchor).toBe(2);
    expect(inflation.overall.n).toBe(5); // gli ignoti non entrano nella misura
  });

  it("un acquisto annullato esce dal campione", () => {
    const log: AuctionEvent[] = [
      ...buildLog(A_SPECS),
      { type: "VOID", seq: 5, ts: TS, targetSeq: 0 },
    ];
    const measure = measuredInflation(log, BOOK).perRole.A;
    expect(measure.n).toBe(4);
    expect(measure.paidTotal).toBe(120);
    expect(measure.reason).toBe("insufficient-sample");
  });

  it("ancore tutte a 0: nessun rapporto, motivo esplicito", () => {
    const book = anchorBook([1, 2, 3, 4, 5].map((i) => anchor(`z${i}`, "A", 0)));
    const log = buildLog([1, 2, 3, 4, 5].map((i) => buy(`z${i}`, "A", "psg", i)));
    const measure = measuredInflation(log, book).perRole.A;
    expect(measure.n).toBe(5);
    expect(measure.reason).toBe("zero-anchor-base");
    expect(measure.inflation).toBeNull();
  });

  it("le RICONFERME non entrano nell'inflazione di serata (prezzi dell'anno prima)", () => {
    // a6 (Qt.A 30) riconfermato a 3: se quel prezzo entrasse nella misura,
    // l'inflazione di ruolo crollerebbe da +20% a (183/180 − 1) ≈ +1,7%.
    const log = buildLog(A_SPECS);
    const state = stateOf(log, [
      { fantaTeamId: "fc_sottitudo", playerId: "a6", role: "A", price: 3 },
    ]);
    expect(state.purchasedPlayerIds).toContain("a6"); // lo stato la vede
    expect(state.teams.fc_sottitudo?.spent).toBe(3);

    const measure = measuredInflation(log, BOOK).perRole.A;
    expect(paidAnchorSamples(log, BOOK).map((s) => s.playerId)).not.toContain("a6");
    expect(measure.n).toBe(5);
    expect(measure.paidTotal).toBe(180);
    expect(measure.inflation).toBeCloseTo(0.2, 10);
  });

  it("soglia di campione parametrica, trasportata nel risultato", () => {
    const inflation = measuredInflation(buildLog(D_SPECS), BOOK, 2);
    expect(inflation.minSample).toBe(2);
    expect(inflation.perRole.D.sufficient).toBe(true);
  });

  it("è deterministica", () => {
    const log = buildLog([...A_SPECS, ...D_SPECS]);
    expect(JSON.stringify(measuredInflation(log, BOOK))).toBe(
      JSON.stringify(measuredInflation(log, BOOK)),
    );
  });
});

describe("residualPressure — crediti e slot residui del tavolo", () => {
  it("a tavolo fresco la pressione è esattamente zero: si parte all'equilibrio", () => {
    const pressure = residualPressure(stateOf([]));
    expect(pressure.creditsRemaining).toBe(8 * 500);
    expect(pressure.slotsRemaining).toBe(8 * 28);
    expect(pressure.teamsCounted).toBe(8);
    expect(pressure.baselineCreditsPerSlot).toBeCloseTo(500 / 28, 10);
    expect(pressure.pressure).toBeCloseTo(0, 10);
    expect(pressure.reason).toBeNull();
  });

  it("acquisti a un credito lasciano più soldi per slot: pressione in salita", () => {
    // 10 acquisti a 1: −10 crediti, −10 slot. 3990/(224−10) ≈ 18,64 per slot.
    const state = stateOf(buildLog(fillRole("psg", "D", 9, 1).concat(fillRole("psg", "P", 1, 1))));
    const pressure = residualPressure(state);
    expect(pressure.creditsRemaining).toBe(3990);
    expect(pressure.slotsRemaining).toBe(214);
    expect(pressure.pressure).toBeGreaterThan(0);
    expect(pressure.creditsPerSlot).toBeCloseTo(3990 / 214, 10);
  });

  it("acquisti sopra la dotazione per slot prosciugano il tavolo: pressione negativa", () => {
    const state = stateOf(buildLog([buy("a1", "A", "psg", 200), buy("a2", "A", "ataturk", 200)]));
    const pressure = residualPressure(state);
    expect(pressure.creditsRemaining).toBe(3600);
    expect(pressure.slotsRemaining).toBe(222);
    expect(pressure.pressure).toBeLessThan(0);
  });

  it("le riconferme entrano nel conto senza trattamenti speciali", () => {
    const withConfirmation = residualPressure(
      stateOf([], [{ fantaTeamId: "psg", playerId: "a6", role: "A", price: 30 }]),
    );
    expect(withConfirmation.creditsRemaining).toBe(8 * 500 - 30);
    expect(withConfirmation.slotsRemaining).toBe(8 * 28 - 1);
    expect(withConfirmation.pressure).toBeLessThan(0); // 30 crediti per uno slot solo
  });

  it("nessuno slot residuo: nessun rapporto, motivo esplicito", () => {
    const log = buildLog([
      ...TEAMS.flatMap((team) => fillRole(team, "P", 3, 1)),
      ...TEAMS.flatMap((team) => fillRole(team, "D", 9, 1)),
      ...TEAMS.flatMap((team) => fillRole(team, "C", 9, 1)),
      ...TEAMS.flatMap((team) => fillRole(team, "A", 7, 1)),
    ]);
    const pressure = residualPressure(stateOf(log));
    expect(pressure.slotsRemaining).toBe(0);
    expect(pressure.creditsPerSlot).toBeNull();
    expect(pressure.pressure).toBeNull();
    expect(pressure.reason).toBe("no-remaining-slots");
  });

  it("è deterministica", () => {
    const state = stateOf(buildLog([buy("a1", "A", "psg", 60)]));
    expect(JSON.stringify(residualPressure(state))).toBe(
      JSON.stringify(residualPressure(state)),
    );
  });
});

describe("currentAnchor — ancora corrente, uno scalare con la sua provenienza", () => {
  const inflation = measuredInflation(buildLog([...A_SPECS, ...D_SPECS]), BOOK);

  it("null (n/d esplicito) per un giocatore senza ancora", () => {
    expect(currentAnchor("sconosciuto", BOOK, inflation)).toBeNull();
  });

  it("cold start su entrambe le misure: ancora corrente = Qt.A, dichiarato", () => {
    const cold = currentAnchor("a3", BOOK, measuredInflation([], BOOK));
    expect(cold).toEqual({
      playerId: "a3",
      role: "A",
      baseAnchor: 30,
      basis: "none",
      inflationApplied: null,
      n: 0,
      correctedAnchor: 30,
      coldStart: true,
    });
  });

  it("usa l'inflazione DI RUOLO quando il ruolo ha campione sufficiente", () => {
    const current = currentAnchor("a6", BOOK, inflation);
    expect(current?.basis).toBe("role-inflation");
    expect(current?.n).toBe(5);
    expect(current?.baseAnchor).toBe(30);
    expect(current?.correctedAnchor).toBe(36); // round(30 × 1,20)
    expect(current?.coldStart).toBe(false);
  });

  it("ripiega sull'inflazione COMPLESSIVA quando il ruolo è ancora sotto soglia", () => {
    const current = currentAnchor("d3", BOOK, inflation);
    expect(current?.basis).toBe("overall-inflation");
    expect(current?.n).toBe(7); // 5 A + 2 D
    expect(current?.correctedAnchor).toBe(23); // round(20 × 210/180)
  });

  it("arrotonda all'intero: si compete a crediti interi", () => {
    // a2: 40 × 1,20 = 48 esatto; a5: 10 × 1,20 = 12.
    expect(currentAnchor("a2", BOOK, inflation)?.correctedAnchor).toBe(48);
    expect(currentAnchor("a5", BOOK, inflation)?.correctedAnchor).toBe(12);
  });

  it("in deflazione non scende mai sotto il floor di 1 credito", () => {
    const book = anchorBook([
      ...[1, 2, 3, 4, 5].map((i) => anchor(`p${i}`, "P", 10)),
      anchor("p9", "P", 2),
    ]);
    const deflated = measuredInflation(
      buildLog([1, 2, 3, 4, 5].map((i) => buy(`p${i}`, "P", "psg", 1))),
      book,
    );
    expect(deflated.perRole.P.inflation).toBeCloseTo(-0.9, 10);
    const current = currentAnchor("p9", book, deflated);
    expect(current?.correctedAnchor).toBe(1); // round(2 × 0,1) = 0 -> floor
    expect(current?.baseAnchor).toBe(2); // la Qt.A nuda resta visibile
  });

  it("non espone NESSUN campo di intervallo/banda di prezzo (divieto di forma §D9)", () => {
    const current = currentAnchor("a1", BOOK, inflation);
    expect(Object.keys(current ?? {}).sort()).toEqual([
      "baseAnchor",
      "basis",
      "coldStart",
      "correctedAnchor",
      "inflationApplied",
      "n",
      "playerId",
      "role",
    ]);
  });
});

describe("isPlayerAvailable", () => {
  it("copre sia i venduti sia i riconfermati", () => {
    const state = stateOf(buildLog([buy("a1", "A", "psg", 60)]), [
      { fantaTeamId: "ataturk", playerId: "a6", role: "A", price: 3 },
    ]);
    expect(isPlayerAvailable("a1", state)).toBe(false);
    expect(isPlayerAvailable("a6", state)).toBe(false);
    expect(isPlayerAvailable("a2", state)).toBe(true);
    expect(TEAMS).toHaveLength(8);
  });
});
