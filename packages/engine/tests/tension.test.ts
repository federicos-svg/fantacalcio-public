import { describe, it, expect } from "vitest";
import {
  MIN_TENSION_DRIVERS,
  TENSION_HIGH_TRIGGERS,
  anchorBook,
  measuredInflation,
  tension,
  type PlayerAnchor,
  type TensionDriverId,
} from "../src/index.js";
import { TEAMS, anchor, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";

const DRIVER_ORDER: readonly TensionDriverId[] = [
  "role-supply-tight",
  "many-eligible-competitors",
  "cliff-after",
  "role-inflation-hot",
];

// ---------------------------------------------------------------------------
// Scenario "ruolo largo": 29 centrocampisti ancorati, scala densa (30, 29, …,
// 3) più un top a 100; sei squadre hanno già il centrocampo pieno con acquisti
// SENZA ancora (quindi l'inflazione resta in cold start).
// ---------------------------------------------------------------------------
const C_LADDER: PlayerAnchor[] = Array.from({ length: 28 }, (_, i) =>
  anchor(`c${i + 1}`, "C", 30 - i),
);
const WIDE_BOOK = anchorBook([anchor("c_top", "C", 100), ...C_LADDER]);
const WIDE_LOG = buildLog(TEAMS.slice(0, 6).flatMap((team) => fillRole(team, "C", 9, 1)));
const WIDE_STATE = stateOf(WIDE_LOG);
const WIDE_INFLATION = measuredInflation(WIDE_LOG, WIDE_BOOK);

// ---------------------------------------------------------------------------
// Scenario "ruolo teso": cinque attaccanti già pagati sopra quotazione
// (inflazione di ruolo +20%), ne resta uno solo ancorato.
// ---------------------------------------------------------------------------
const TIGHT_BOOK = anchorBook([
  anchor("a1", "A", 50),
  anchor("a2", "A", 40),
  anchor("a3", "A", 30),
  anchor("a4", "A", 20),
  anchor("a5", "A", 10),
  anchor("a6", "A", 30),
]);
const TIGHT_SPECS = [
  buy("a1", "A", "new_milf", 60),
  buy("a2", "A", "ataturk", 50),
  buy("a3", "A", "psg", 35),
  buy("a4", "A", "ac_vostra", 25),
  buy("a5", "A", "new_casatiello", 10),
];
const TIGHT_LOG = buildLog(TIGHT_SPECS);
const TIGHT_STATE = stateOf(TIGHT_LOG);
const TIGHT_INFLATION = measuredInflation(TIGHT_LOG, TIGHT_BOOK);

describe("tension — forma dell'output", () => {
  it("null solo quando il giocatore non ha ancora", () => {
    expect(
      tension({
        playerId: "sconosciuto",
        book: WIDE_BOOK,
        state: WIDE_STATE,
        inflation: WIDE_INFLATION,
      }),
    ).toBeNull();
  });

  it("porta sempre i quattro driver, nello stesso ordine, con soglia e campione", () => {
    const result = tension({
      playerId: "c1",
      book: WIDE_BOOK,
      state: WIDE_STATE,
      inflation: WIDE_INFLATION,
    })!;
    expect(result.drivers.map((d) => d.id)).toEqual(DRIVER_ORDER);
    expect(result.drivers.every((d) => typeof d.threshold === "number")).toBe(true);
    expect(result.drivers.every((d) => d.available || d.unavailableReason !== null)).toBe(true);
    // L'ancora corrente e il cliff viaggiano con la banda: mai un numero secco.
    expect(result.anchor.baseAnchor).toBe(30);
    expect(result.cliff.role).toBe("C");
  });

  it("il conteggio dei triggerati ignora i driver non misurabili", () => {
    const result = tension({
      playerId: "c1",
      book: WIDE_BOOK,
      state: WIDE_STATE,
      inflation: WIDE_INFLATION,
    })!;
    expect(result.triggeredCount).toBe(
      result.drivers.filter((d) => d.available && d.triggered).length,
    );
    expect(result.evaluatedCount).toBe(result.drivers.filter((d) => d.available).length);
  });

  it("è deterministica", () => {
    const input = {
      playerId: "a6",
      book: TIGHT_BOOK,
      state: TIGHT_STATE,
      inflation: TIGHT_INFLATION,
    };
    expect(JSON.stringify(tension(input))).toBe(JSON.stringify(tension(input)));
  });
});

describe("tension — bande", () => {
  it("BASSA: ruolo largo, pochi rivali, nessun salto, inflazione in cold start", () => {
    const result = tension({
      playerId: "c1",
      book: WIDE_BOOK,
      state: WIDE_STATE,
      inflation: WIDE_INFLATION,
    })!;
    expect(result.band).toBe("bassa");
    expect(result.triggeredCount).toBe(0);
    expect(result.evaluatedCount).toBe(3);
    expect(result.drivers[0]?.value).toBeCloseTo(29 / 18, 10); // 29 disponibili / 18 slot residui
    expect(result.drivers[1]?.value).toBe(2); // solo 2 squadre col centrocampo aperto
    expect(result.drivers[2]?.triggered).toBe(false); // 30 -> 29: nessun cliff
    expect(result.drivers[3]).toMatchObject({
      available: false,
      triggered: false,
      value: null,
      n: 0,
      unavailableReason: "no-anchor-coverage",
    });
  });

  it("MEDIA: stesso tavolo, ma dopo il top c'è un salto vero", () => {
    const result = tension({
      playerId: "c_top",
      book: WIDE_BOOK,
      state: WIDE_STATE,
      inflation: WIDE_INFLATION,
    })!;
    expect(result.band).toBe("media");
    expect(result.triggeredCount).toBe(1);
    expect(result.drivers[2]).toMatchObject({ id: "cliff-after", triggered: true });
    expect(result.cliff.gap).toBe(70); // 100 -> 30
  });

  it("ALTA: ultimo del ruolo, tavolo affollato, ruolo caldo", () => {
    const result = tension({
      playerId: "a6",
      book: TIGHT_BOOK,
      state: TIGHT_STATE,
      inflation: TIGHT_INFLATION,
    })!;
    expect(result.band).toBe("alta");
    expect(result.triggeredCount).toBeGreaterThanOrEqual(TENSION_HIGH_TRIGGERS);
    expect(result.evaluatedCount).toBe(4);
    expect(result.cliff.shape).toBe("last-of-role");
    expect(result.drivers[3]).toMatchObject({ id: "role-inflation-hot", triggered: true, n: 5 });
    expect(result.drivers[3]?.value).toBeCloseTo(0.2, 10);
    // L'ancora corrente mostrata accanto alla banda è la Qt.A corretta
    // dall'inflazione misurata: 30 × 1,20 = 36.
    expect(result.anchor.correctedAnchor).toBe(36);
    expect(result.anchor.basis).toBe("role-inflation");
  });

  it("un rivale in meno (self escluso) può bastare a cambiare il conteggio", () => {
    const withoutSelf = tension({
      playerId: "a6",
      book: TIGHT_BOOK,
      state: TIGHT_STATE,
      inflation: TIGHT_INFLATION,
      selfId: "psg",
    })!;
    expect(withoutSelf.drivers[1]?.value).toBe(7);
    expect(
      tension({
        playerId: "a6",
        book: TIGHT_BOOK,
        state: TIGHT_STATE,
        inflation: TIGHT_INFLATION,
      })!.drivers[1]?.value,
    ).toBe(8);
  });

  it("giocatore già assegnato: nessuna banda, motivo esplicito", () => {
    const state = stateOf(buildLog([...TIGHT_SPECS, buy("a6", "A", "psg", 40)]));
    const result = tension({
      playerId: "a6",
      book: TIGHT_BOOK,
      state,
      inflation: TIGHT_INFLATION,
    })!;
    expect(result.band).toBeNull();
    expect(result.reason).toBe("player-not-available");
    // I driver restano visibili: la schermata può spiegare comunque il contesto.
    expect(result.drivers).toHaveLength(4);
  });

  it("anche un riconfermato non è più contendibile", () => {
    const state = stateOf(TIGHT_LOG, [
      { fantaTeamId: "psg", playerId: "a6", role: "A", price: 12 },
    ]);
    expect(
      tension({ playerId: "a6", book: TIGHT_BOOK, state, inflation: TIGHT_INFLATION })!.reason,
    ).toBe("player-not-available");
  });
});

describe("tension — cold start e copertura", () => {
  it("ruolo esaurito al tavolo: la scarsità non ha denominatore e si dichiara", () => {
    const log = buildLog(TEAMS.flatMap((team) => fillRole(team, "A", 7, 1)));
    const state = stateOf(log);
    const book = anchorBook([anchor("t1", "A", 50), anchor("t2", "A", 40)]);
    const result = tension({
      playerId: "t1",
      book,
      state,
      inflation: measuredInflation(log, book),
    })!;
    expect(result.drivers[0]).toMatchObject({
      available: false,
      triggered: false,
      unavailableReason: "no-remaining-demand",
    });
    expect(result.drivers[1]?.value).toBe(0); // nessuno ha più slot: nessun rivale
    expect(result.evaluatedCount).toBe(MIN_TENSION_DRIVERS);
    expect(result.band).toBe("bassa");
    expect(result.reason).toBeNull();
  });

  it("invariante: con i quattro driver di oggi la copertura non scende mai sotto il pavimento", () => {
    const scenarios = [
      { playerId: "c1", book: WIDE_BOOK, state: WIDE_STATE, inflation: WIDE_INFLATION },
      { playerId: "c_top", book: WIDE_BOOK, state: WIDE_STATE, inflation: WIDE_INFLATION },
      { playerId: "a6", book: TIGHT_BOOK, state: TIGHT_STATE, inflation: TIGHT_INFLATION },
      {
        playerId: "a6",
        book: TIGHT_BOOK,
        state: stateOf([]),
        inflation: measuredInflation([], TIGHT_BOOK),
      },
    ];
    for (const scenario of scenarios) {
      const result = tension(scenario)!;
      expect(result.evaluatedCount).toBeGreaterThanOrEqual(MIN_TENSION_DRIVERS);
      expect(result.band).not.toBeNull();
    }
  });

  it("un driver non misurabile non gonfia mai la banda", () => {
    // Stesso stato, stesso listino: alzando la soglia di campione l'inflazione
    // diventa non misurabile e la tensione può solo scendere, mai salire.
    const measured = tension({
      playerId: "a6",
      book: TIGHT_BOOK,
      state: TIGHT_STATE,
      inflation: TIGHT_INFLATION,
    })!;
    const withoutInflation = tension({
      playerId: "a6",
      book: TIGHT_BOOK,
      state: TIGHT_STATE,
      inflation: measuredInflation(TIGHT_LOG, TIGHT_BOOK, 99),
    })!;
    expect(withoutInflation.evaluatedCount).toBe(3);
    expect(withoutInflation.triggeredCount).toBeLessThan(measured.triggeredCount);
    expect(withoutInflation.drivers[3]?.unavailableReason).toBe("insufficient-sample");
  });
});
