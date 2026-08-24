import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_VALUE_DELTAS,
  ABSOLUTE_VALUE_LEGS,
  ABSOLUTE_VALUE_UNRATIFIED_CHOICES,
  CONCORRENZA_VOCABULARY,
  NO_LEG_INPUTS,
  UNRATIFIED_CHOICES,
  absoluteValueReading,
  concorrenzaPosition,
  tierBook,
  type AbsoluteValueInput,
  type AbsoluteValueLegId,
  type Role,
  type TierBook,
  APPEAL_ORDER_TIE_BREAK,
  COST_FLOOR,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
} from "../src/index.js";

// IL VALORE ASSOLUTO È DERIVATO, E OGNI PASSO DELLA DERIVAZIONE SI PUÒ RIFARE
// A MANO — che è la sola prova che distingue un numero derivato da un numero
// inventato.
//
// COSA MISURA QUESTO FILE, e perché ogni famiglia serve da sola:
//
//  1. LA CATENA: budget del regolamento → target dichiarati da Pico → slot del
//     ruolo → fascia → base. Ogni passo è asserito col suo numero, e la base è
//     confrontata con l'aritmetica scritta nel test, non con una costante
//     copiata dal modulo;
//  2. IL DEFAULT NEUTRO: con tutti i delta a 0, una gamba assente NON produce
//     `n/d`, e il valore è ESATTAMENTE la base;
//  3. IL BLOCCO: con un delta ≠ 0 iniettato, la STESSA gamba assente produce
//     `n/d` col motivo che la nomina;
//  4. IL RUOLO SENZA TARGET: `n/d`, e nessuna ripartizione di ripiego;
//  5. LE FALSIFICAZIONI: cinque scenari che DEVONO restare rossi se qualcuno
//     reintroduce un difetto — sono scritte come «questo non deve succedere»,
//     non come «questo succede».
//
// Ogni riga è sintetica: id `a_*`/`d_*`, target inventati per il test, nessun
// dato reale, nessun listone.

const TIE_BREAK = APPEAL_ORDER_TIE_BREAK;

/**
 * Un libro delle fasce col motore vero. Otto squadre, quindi con `ROSTER_
 * REQUIREMENTS.A = 7` le fasce di un attaccante coprono 56 giocatori: chi sta
 * oltre finisce nel FONDO, che è uno dei rami misurati qui.
 */
function bookOf(role: Role, playerIds: readonly string[], teamsCount = 8): TierBook {
  return tierBook(
    {
      provenance: { source: "ordine sintetico di test", recipe: "TEST@0", tieBreak: TIE_BREAK },
      roles: [{ role, playerIds: [...playerIds] }],
    },
    { teamsCount },
  );
}

/** Otto attaccanti in prima fascia, uno in seconda, uno nel fondo (tierCount 7). */
const A_ORDER = [
  ...Array.from({ length: 8 }, (_, i) => `a_t1_${i}`),
  ...Array.from({ length: 8 }, (_, i) => `a_t2_${i}`),
  ...Array.from({ length: 40 }, (_, i) => `a_mid_${i}`),
  "a_fondo",
];
const A_BOOK = bookOf("A", A_ORDER);

const TARGETS = { P: 20, D: 180, C: 150, A: 140 } as const;

function input(overrides: Partial<AbsoluteValueInput> = {}): AbsoluteValueInput {
  return {
    called: { playerId: "a_t1_0", role: "A" },
    roleTargets: TARGETS,
    book: A_BOOK,
    legs: NO_LEG_INPUTS,
    ...overrides,
  };
}

/** Un delta iniettato su UNA gamba sola, le altre due a zero. */
function deltaOn(leg: AbsoluteValueLegId, value: number): Record<AbsoluteValueLegId, number> {
  return { ...ABSOLUTE_VALUE_DELTAS, [leg]: value };
}

describe("valore assoluto — la catena della derivazione", () => {
  it("la base è il target del ruolo diviso per gli slot di quel ruolo, e nient'altro", () => {
    const reading = absoluteValueReading(input());
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;

    // L'aritmetica rifatta qui, non copiata dal modulo: 140 crediti dichiarati
    // sul reparto attaccanti, 7 slot di regolamento, 20 crediti per slot.
    const expected = TARGETS.A / ROSTER_REQUIREMENTS.A;
    expect(expected).toBe(20);
    expect(reading.credits).toBe(expected);

    expect(reading.chain).toEqual({
      role: "A",
      budget: INITIAL_BUDGET,
      roleTarget: TARGETS.A,
      roleSlots: ROSTER_REQUIREMENTS.A,
      perSlot: expected,
      tier: 1,
      base: expected,
      legs: ABSOLUTE_VALUE_LEGS.map((leg) => ({
        leg,
        delta: 0,
        position: null,
        credits: 0,
      })),
      total: expected,
    });
  });

  it("il budget che entra nella catena è quello del regolamento, non un numero scritto qui", () => {
    const reading = absoluteValueReading(input());
    expect(reading.kind === "valore" && reading.chain.budget).toBe(INITIAL_BUDGET);
    expect(INITIAL_BUDGET).toBe(500);
  });

  it("gli slot sono quelli del regolamento, ruolo per ruolo — e P, D, C, A danno quattro basi diverse", () => {
    const bases = (["P", "D", "C", "A"] as const).map((role) => {
      const book = bookOf(role, [`${role}_uno`]);
      const reading = absoluteValueReading(
        input({ called: { playerId: `${role}_uno`, role }, book }),
      );
      expect(reading.kind).toBe("valore");
      return reading.kind === "valore" ? reading.credits : null;
    });
    expect(bases).toEqual([
      TARGETS.P / ROSTER_REQUIREMENTS.P,
      TARGETS.D / ROSTER_REQUIREMENTS.D,
      TARGETS.C / ROSTER_REQUIREMENTS.C,
      TARGETS.A / ROSTER_REQUIREMENTS.A,
    ]);
  });

  it("la fascia colloca il giocatore, e i giocatori dentro le fasce hanno la stessa quota di slot", () => {
    // La differenza fra fascia 1 e fascia 2 NON esiste nella base, ed è una
    // proprietà voluta e dichiarata (`ABSOLUTE_BASE_UNIFORM_PER_SLOT`): una
    // quota che decresce con la fascia richiederebbe una CURVA che nessuno ha
    // dichiarato. Il test la pinna così com'è, senza approvarla.
    const t1 = absoluteValueReading(input({ called: { playerId: "a_t1_0", role: "A" } }));
    const t2 = absoluteValueReading(input({ called: { playerId: "a_t2_0", role: "A" } }));
    expect(t1.kind === "valore" && t1.chain.tier).toBe(1);
    expect(t2.kind === "valore" && t2.chain.tier).toBe(2);
    expect(t1.kind === "valore" && t1.credits).toBe(t2.kind === "valore" ? t2.credits : null);
  });

  it("chi sta oltre l'ultima fascia non ha una base, e lo dice con un motivo suo", () => {
    const reading = absoluteValueReading(input({ called: { playerId: "a_fondo", role: "A" } }));
    expect(reading).toMatchObject({ kind: "assente", reason: "oltre-gli-slot-del-ruolo" });
  });

  it("«non ordinato» e «oltre l'ultima fascia» restano due silenzi distinti", () => {
    const fuori = absoluteValueReading(input({ called: { playerId: "a_ignoto", role: "A" } }));
    expect(fuori).toMatchObject({ kind: "assente", reason: "fascia-assente" });
    const fondo = absoluteValueReading(input({ called: { playerId: "a_fondo", role: "A" } }));
    expect(fondo).toMatchObject({ kind: "assente", reason: "oltre-gli-slot-del-ruolo" });
    expect(fuori).not.toEqual(fondo);
  });

  it("senza libro delle fasce non c'è collocazione, e non c'è numero", () => {
    expect(absoluteValueReading(input({ book: null }))).toMatchObject({
      kind: "assente",
      reason: "fascia-assente",
    });
    // Ruolo non coperto dall'ordinamento: un altro modo di non avere la fascia.
    expect(
      absoluteValueReading(input({ called: { playerId: "d_uno", role: "D" } })),
    ).toMatchObject({ kind: "assente", reason: "fascia-assente" });
  });
});

describe("valore assoluto — il ruolo senza target", () => {
  it("ruolo non dichiarato: n/d col motivo che nomina il target, mai una ripartizione di ripiego", () => {
    const reading = absoluteValueReading(input({ roleTargets: {} }));
    expect(reading).toMatchObject({ kind: "assente", reason: "ruolo-senza-target" });
    expect(reading.chain).toBeNull();
  });

  it("«ruolo non dichiarato» e «ruolo dichiarato zero» NON sono la stessa cosa", () => {
    // È la distinzione che src/rolePlan.ts tiene in piedi con un `Partial`:
    // «non ho ancora deciso» contro «ho deciso zero». Un `?? 0` qui le
    // fonderebbe, e a schermo un `n/d` diventerebbe uno «0 cr» che afferma una
    // decisione che Pico non ha preso.
    const undeclared = absoluteValueReading(input({ roleTargets: {} }));
    const zero = absoluteValueReading(input({ roleTargets: { ...TARGETS, A: 0 } }));
    expect(undeclared.kind).toBe("assente");
    expect(zero).toMatchObject({ kind: "valore", credits: 0 });
  });

  it("i ruoli NON dichiarati non contano come zero nella somma dei target", () => {
    // Un solo ruolo dichiarato, e vale l'intero budget: la somma è 500, non
    // 500 + tre zeri, e il tetto non scatta.
    const reading = absoluteValueReading(input({ roleTargets: { A: INITIAL_BUDGET } }));
    expect(reading).toMatchObject({ kind: "valore" });
  });

  it("una dichiarazione che sfonda il budget del regolamento non produce una scala «quasi giusta»", () => {
    const reading = absoluteValueReading(
      input({ roleTargets: { P: 200, D: 200, C: 200, A: 200 } }),
    );
    expect(reading).toMatchObject({ kind: "assente", reason: "target-oltre-il-budget" });
  });

  it("un target non utilizzabile è un'assenza dichiarata, non uno zero silenzioso", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(absoluteValueReading(input({ roleTargets: { A: bad } }))).toMatchObject({
        kind: "assente",
        reason: "target-non-valido",
      });
    }
  });
});

describe("valore assoluto — le tre gambe", () => {
  it("IL DEFAULT NEUTRO: con tutti i delta a 0 una gamba assente non toglie il numero", () => {
    expect(ABSOLUTE_VALUE_DELTAS).toEqual({ concorrenza: 0, coppe: 0, pagella: 0 });
    const reading = absoluteValueReading(input({ legs: NO_LEG_INPUTS }));
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    // ESATTAMENTE la base: nessuna gamba ha spostato niente.
    expect(reading.credits).toBe(reading.chain.base);
    expect(reading.chain.legs.every((l) => l.credits === 0)).toBe(true);
  });

  it("IL BLOCCO: con un delta ≠ 0 la stessa gamba assente toglie il numero, e dice quale gamba è", () => {
    const expected: Readonly<Record<AbsoluteValueLegId, string>> = {
      concorrenza: "gamba-concorrenza-assente",
      coppe: "gamba-coppe-assente",
      pagella: "gamba-pagella-assente",
    };
    for (const leg of ABSOLUTE_VALUE_LEGS) {
      const reading = absoluteValueReading(input({ deltas: deltaOn(leg, 3) }));
      expect(reading, leg).toMatchObject({ kind: "assente", reason: expected[leg] });
    }
  });

  it("CONCORRENZA: la posizione è l'ordinale del vocabolario, centrato sulla parola di mezzo", () => {
    expect([...CONCORRENZA_VOCABULARY]).toEqual(["titolare", "ballottaggio", "riserva"]);
    expect(concorrenzaPosition("titolare")).toBe(1);
    expect(concorrenzaPosition("ballottaggio")).toBe(0);
    expect(concorrenzaPosition("riserva")).toBe(-1);

    const reading = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, titolarita: "titolare" }, deltas: deltaOn("concorrenza", 5) }),
    );
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    expect(reading.credits).toBe(reading.chain.base + 5);
    // E il segno segue la parola, non il modulo: una riserva scende.
    const riserva = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, titolarita: "riserva" }, deltas: deltaOn("concorrenza", 5) }),
    );
    expect(riserva.kind === "valore" && riserva.credits).toBe(
      (riserva.kind === "valore" ? riserva.chain.base : 0) - 5,
    );
  });

  it("COPPE: presenza o assenza, non un opposto — «non gioca in Europa» è la linea di base", () => {
    const fuori = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, inEurope: false }, deltas: deltaOn("coppe", 7) }),
    );
    const dentro = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, inEurope: true }, deltas: deltaOn("coppe", 7) }),
    );
    expect(fuori.kind === "valore" && fuori.credits).toBe(
      fuori.kind === "valore" ? fuori.chain.base : null,
    );
    expect(dentro.kind === "valore" && dentro.credits).toBe(
      (dentro.kind === "valore" ? dentro.chain.base : 0) + 7,
    );
    // IL SEGNO È DI PICO, non di questo modulo: con un delta negativo la stessa
    // presenza abbassa il valore, e il modulo non ha nessuna opinione su quale
    // dei due sia giusto (giocare di più contro ruotare di più).
    const negativo = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, inEurope: true }, deltas: deltaOn("coppe", -7) }),
    );
    expect(negativo.kind === "valore" && negativo.credits).toBe(
      (negativo.kind === "valore" ? negativo.chain.base : 0) - 7,
    );
  });

  it("PAGELLA: la posizione è il totale sul fondo scala della fonte, iniettato e mai cablato", () => {
    const reading = absoluteValueReading(
      input({
        legs: { ...NO_LEG_INPUTS, pagella: { totale: 40, totaleMax: 50 } },
        deltas: deltaOn("pagella", 10),
      }),
    );
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    expect(reading.credits).toBe(reading.chain.base + 10 * (40 / 50));
    // Un fondo scala non utilizzabile non produce una posizione inventata: la
    // gamba risulta assente, che è la verità.
    for (const totaleMax of [0, -50, Number.NaN]) {
      expect(
        absoluteValueReading(
          input({
            legs: { ...NO_LEG_INPUTS, pagella: { totale: 40, totaleMax } },
            deltas: deltaOn("pagella", 10),
          }),
        ),
      ).toMatchObject({ kind: "assente", reason: "gamba-pagella-assente" });
    }
  });

  it("le tre gambe si sommano, e la catena mostra il contributo di ciascuna", () => {
    const reading = absoluteValueReading(
      input({
        legs: { titolarita: "titolare", inEurope: true, pagella: { totale: 25, totaleMax: 50 } },
        deltas: { concorrenza: 4, coppe: 6, pagella: 10 },
      }),
    );
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    expect(reading.chain.legs).toEqual([
      { leg: "concorrenza", delta: 4, position: 1, credits: 4 },
      { leg: "coppe", delta: 6, position: 1, credits: 6 },
      { leg: "pagella", delta: 10, position: 0.5, credits: 5 },
    ]);
    expect(reading.credits).toBe(reading.chain.base + 15);
  });

  it("un delta non utilizzabile non diventa zero in silenzio", () => {
    expect(
      absoluteValueReading(input({ deltas: deltaOn("coppe", Number.NaN) })),
    ).toMatchObject({ kind: "assente", reason: "gamba-coppe-assente" });
  });
});

describe("valore assoluto — nessun numero fabbricato", () => {
  it("NESSUN CLAMP AL PAVIMENTO: sotto il credito minimo il numero si dichiara, non si aggiusta", () => {
    const reading = absoluteValueReading(
      input({
        roleTargets: { ...TARGETS, A: 7 }, // 7 crediti su 7 slot = 1 per slot
        legs: { ...NO_LEG_INPUTS, titolarita: "riserva" },
        deltas: deltaOn("concorrenza", 5),
      }),
    );
    expect(reading.kind).toBe("valore");
    if (reading.kind !== "valore") return;
    expect(reading.credits).toBe(1 - 5);
    expect(reading.credits).toBeLessThan(COST_FLOOR);
    expect(reading.belowCostFloor).toBe(true);
    // Il numero è quello, negativo: nessun `Math.max(COST_FLOOR, …)`.
    expect(reading.credits).not.toBe(COST_FLOOR);
  });

  it("nessun arrotondamento: la quota di uno slot resta la divisione esatta", () => {
    // 200 su 9 difensori non è un intero, e non viene reso tale.
    const book = bookOf("D", ["d_uno"]);
    const reading = absoluteValueReading(
      input({ called: { playerId: "d_uno", role: "D" }, roleTargets: { D: 200 }, book }),
    );
    expect(reading.kind === "valore" && reading.credits).toBe(200 / 9);
    expect(Number.isInteger(200 / 9)).toBe(false);
  });

  it("la lettura è pura e totale: stessi ingressi → stessa uscita, e non lancia mai su nessun ramo", () => {
    const cases: readonly AbsoluteValueInput[] = [
      input(),
      input({ called: null }),
      input({ book: null }),
      input({ roleTargets: {} }),
      input({ called: { playerId: "a_fondo", role: "A" } }),
      input({ deltas: deltaOn("pagella", 2) }),
    ];
    for (const c of cases) {
      expect(() => absoluteValueReading(c)).not.toThrow();
      expect(absoluteValueReading(c)).toEqual(absoluteValueReading(c));
    }
  });

  it("senza chiamata non c'è soggetto, e non c'è numero", () => {
    expect(absoluteValueReading(input({ called: null }))).toMatchObject({
      kind: "assente",
      reason: "nessun-chiamato",
    });
  });
});

describe("valore assoluto — le scelte del motore, dichiarate e non approvate", () => {
  it("ogni lettura porta la propria ratifica aperta, col motivo scritto per esteso", () => {
    const reading = absoluteValueReading(input());
    expect(reading.ratification.ratified).toBe(false);
    expect(reading.ratification.unratifiedChoices).toEqual(ABSOLUTE_VALUE_UNRATIFIED_CHOICES);
    for (const id of ABSOLUTE_VALUE_UNRATIFIED_CHOICES) {
      expect(UNRATIFIED_CHOICES[id].length).toBeGreaterThan(0);
    }
  });

  it("anche un'assenza porta la ratifica: la derivazione poggia sulle stesse letture", () => {
    const reading = absoluteValueReading(input({ roleTargets: {} }));
    expect(reading.ratification.ratified).toBe(false);
    expect(reading.ratification.unratifiedChoices).toEqual(ABSOLUTE_VALUE_UNRATIFIED_CHOICES);
  });

  it("le sei scelte sono nominate una per una: nessun elenco accorpato", () => {
    expect([...ABSOLUTE_VALUE_UNRATIFIED_CHOICES]).toEqual([
      "ABSOLUTE_BASE_UNIFORM_PER_SLOT",
      "ABSOLUTE_BASE_EXCLUDES_FONDO",
      "CONCORRENZA_SCALE_SYMMETRIC",
      "CONCORRENZA_ONLY_TITOLARITA",
      "COPPE_BASELINE_IS_ABSENCE",
      "PAGELLA_POSITION_IS_TOTAL_OVER_MAX",
    ]);
  });
});

// ── LE CINQUE FALSIFICAZIONI ─────────────────────────────────────────────────
//
// Scritte come «questo NON deve poter succedere». Ognuna è la contro-prova di
// un difetto concreto: se qualcuno reintroduce il difetto, il test che gli
// corrisponde diventa rosso. Non provano che il codice è giusto — provano che
// cinque modi precisi di sbagliarlo sono chiusi.

describe("valore assoluto — falsificazioni", () => {
  it("F1 — la base NON si calcola senza il target dichiarato del ruolo", () => {
    for (const targets of [{}, { P: 20 }, { D: 100, C: 100 }]) {
      const reading = absoluteValueReading(input({ roleTargets: targets }));
      expect(reading.kind).toBe("assente");
      expect(reading.chain).toBeNull();
    }
  });

  it("F2 — il valore assoluto NON cambia dopo un acquisto: non ha ingressi che un acquisto muova", () => {
    // La prova strutturale: `AbsoluteValueInput` non ha un campo in cui uno
    // stato d'asta possa entrare. Le sue chiavi sono queste cinque e nessuna
    // di loro è `state`, `log`, `team` o `budget`.
    const keys = Object.keys(input({ deltas: ABSOLUTE_VALUE_DELTAS })).sort();
    expect(keys).toEqual(["book", "called", "deltas", "legs", "roleTargets"]);
    // La prova per esecuzione, sulla sequenza vera, sta in
    // src/absoluteValue.test.ts: lì il libro esce dal listone e lo stato dal
    // reducer, e la lettura è confrontata prima e dopo gli acquisti.
  });

  it("F3 — una gamba a peso ZERO non blocca il numero", () => {
    for (const leg of ABSOLUTE_VALUE_LEGS) {
      const reading = absoluteValueReading(input({ deltas: deltaOn(leg, 0), legs: NO_LEG_INPUTS }));
      expect(reading.kind, leg).toBe("valore");
    }
  });

  it("F4 — il totale della pagella NON entra senza essere completo", () => {
    // «Incompleta» arriva qui come `pagella: null` (è già la regola di
    // src/pagellaEsperti.ts: `totaleRicalcolato` è `null` finché i cinque assi
    // non ci sono tutti). Con un peso, il numero non si forma.
    const reading = absoluteValueReading(
      input({ legs: { ...NO_LEG_INPUTS, pagella: null }, deltas: deltaOn("pagella", 10) }),
    );
    expect(reading).toMatchObject({ kind: "assente", reason: "gamba-pagella-assente" });
  });

  it("F5 — il clamp al pavimento NON è reintrodotto: nessun risultato è schiacciato su COST_FLOOR", () => {
    const sotto = [
      absoluteValueReading(input({ roleTargets: { A: 0 } })),
      absoluteValueReading(
        input({
          roleTargets: { A: 7 },
          legs: { ...NO_LEG_INPUTS, titolarita: "riserva" },
          deltas: deltaOn("concorrenza", 9),
        }),
      ),
    ];
    for (const reading of sotto) {
      expect(reading.kind).toBe("valore");
      if (reading.kind !== "valore") continue;
      expect(reading.credits).toBeLessThan(COST_FLOOR);
      expect(reading.belowCostFloor).toBe(true);
    }
  });
});
