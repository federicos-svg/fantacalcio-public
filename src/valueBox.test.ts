import { describe, it, expect } from "vitest";
import {
  anchorBook,
  callScreen,
  livePlan,
  maxSafe,
  measuredInflation,
  type AuctionState,
  type CallScreen,
  type PlayerAnchor,
  type Role,
  type ValueProfile,
} from "../packages/engine/src/index.js";
import {
  TEAMS,
  anchor,
  buildLog,
  buy,
  fillRole,
  stateOf,
} from "../packages/engine/tests/layer2Fixtures.js";
import { plan, value, valueBookOf } from "../packages/engine/tests/layer3Fixtures.js";
import type { ListoneAppealIndex } from "./ui/listone.js";
import {
  DECLARED_INPUTS_WITHOUT_SOURCE,
  VALUE_SLOT_ORDER,
  valueBoxReading,
  type ValueBoxReading,
} from "./valueBox.js";
import {
  VALUE_UNKNOWN,
  valueBoxHtml,
  valueBoxNoteText,
  valueBoxSpoken,
  valueSlotText,
} from "./ui/valueBox.js";

// IL RIQUADRO DEL VALORE PORTA DAVVERO QUATTRO NUMERI, E OGNUNO DEI QUATTRO SA
// DIRE DA DOVE VIENE O PERCHÉ NON C'È.
//
// COSA MISURA QUESTO FILE, e perché ognuna delle famiglie serve da sola:
//
//  1. i due numeri in crediti escono dalla CATENA VERA del motore
//     (`callScreen()` costruito qui su uno stato d'asta prodotto dal reducer,
//     non su un oggetto scritto a mano), e sono esattamente `declaredValue` e
//     `fairToMeMaxEffective` — non un loro parente arrotondato;
//  2. IL TETTO DEL TAVOLO di §"Il riquadro del valore porta quattro numeri" —
//     «un giocatore non vale adesso più di quanto il tavolo possa adesso
//     pagarlo» — è rispettato per costruzione dalla catena, e non serve un
//     secondo clamp per rispettarlo. Un giocatore lo compra UNA squadra,
//     quindi la capacità del tavolo è il MASSIMO dei max bid veri, non la loro
//     somma;
//  3. ogni assenza è dichiarata: nessuno slot senza ingredienti produce uno
//     zero, un punto medio o una cella vuota (§D9, e «ingrediente mancante =
//     `n/d`, mai un default»);
//  4. il riquadro non accende nessun'altra superficie direttiva: né le parole
//     né i numeri di `target_band`/`stretch_cap`/«prendilo fino a», né
//     `fairToMeMaxRaw`, che il motore dichiara NON RENDERIZZABILE.
//
// Ogni riga è sintetica: nomi giocatore `a_*`, quotazioni inventate per il
// test, punteggi e ricetta d'indice fabbricati qui. Nessun dato reale.

const SELF = TEAMS[0]!;
const DECLARED_PLAN = plan({ P: 20, D: 80, C: 140, A: 210 });

const ANCHORS: PlayerAnchor[] = [
  anchor("a_uno", "A", 30),
  anchor("a_due", "A", 40),
  anchor("a_tre", "A", 12),
  anchor("c_uno", "C", 25),
];
const BOOK = anchorBook(ANCHORS);

// Valori dichiarati: sintetici, scelti per il test e mai copiati da un listino.
const VALUES = valueBookOf([
  value("a_uno", 60),
  value("a_due", 40),
  value("a_tre", 20),
  value("c_uno", 45),
]);

const RECIPE = "APPEAL-INDEX-RECIPE@0.0.0-sintetica";
const QUALITY = "sperimentale — fixture sintetica, non validato";

function index(score: number | null): ListoneAppealIndex {
  return { score, quality: QUALITY, recipe: RECIPE, components: { appetibilitaBase: score } };
}

/** La schermata CHIAMATA vera del motore, su uno stato prodotto dal reducer. */
function engineCall(
  playerId: string,
  log = buildLog([]),
  profile: ValueProfile = "media",
): CallScreen {
  const state: AuctionState = stateOf(log);
  return callScreen({
    playerId,
    book: BOOK,
    values: VALUES,
    state,
    inflation: measuredInflation(log, BOOK),
    selfId: SELF,
    plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
    profile,
  });
}

/**
 * Un tavolo in cui il mio budget morde: 18 riempimenti fuori ruolo lasciano un
 * max bid vero molto sotto il tetto grezzo della catena. Serve a separare
 * `fairToMeMaxRaw` da `fairToMeMaxEffective`, che su un tavolo fresco
 * coincidono e non proverebbero niente.
 */
const DRAINED_LOG = buildLog([...fillRole(SELF, "D", 9, 25), ...fillRole(SELF, "C", 9, 25)]);

function readingWithEngine(playerId: string, appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId, role: "A" },
    appealIndex,
    call: engineCall(playerId),
    missingDeclaredInputs: [],
  });
}

/** La lettura come l'app la produce OGGI: nessuna dichiarazione di Pico dentro. */
function readingAsShipped(appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId: "a_uno", role: "A" },
    appealIndex,
    call: null,
    missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
  });
}

describe("riquadro del valore — i quattro numeri", () => {
  it("porta quattro slot, sempre, nell'ordine deciso", () => {
    expect(VALUE_SLOT_ORDER).toEqual([
      "indice-assoluto",
      "indice-relativo",
      "valore-assoluto",
      "valore-relativo",
    ]);
    const reading = readingWithEngine("a_uno", index(72));
    expect(Object.keys(reading.slots).sort()).toEqual([...VALUE_SLOT_ORDER].sort());
  });

  it("i due numeri in crediti sono il valore dichiarato e fairToMeMaxEffective, non un loro parente", () => {
    const call = engineCall("a_uno");
    expect(call.numbers).not.toBeNull();
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
    });

    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: call.declaredValue,
      unit: "crediti",
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: call.numbers!.fairToMeMaxEffective,
      unit: "crediti",
    });
    // La provenienza dei due numeri è quella imposta dal motore, non una frase
    // scritta nella vista.
    expect(reading.creditsProvenance).toBe("derivato dai tuoi valori");
  });

  it("l'indice assoluto è il punteggio servito, con qualità e ricetta portate dal dato", () => {
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["indice-assoluto"]).toEqual({ kind: "numero", value: 72, unit: "indice" });
    expect(reading.indexQuality).toBe(QUALITY);
    expect(reading.indexRecipe).toBe(RECIPE);
  });

  it("l'indice relativo è n/d e dice che la formula non è decisa: nessuno lo calcola", () => {
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "assente",
      reason: "indice-relativo-non-calcolato",
    });
    expect(valueBoxHtml(reading)).toContain("formula non decisa");
  });

  it("il valore relativo si muove con la serata, il valore assoluto no", () => {
    // Stesso giocatore, stesso valore dichiarato: cambia solo ciò che il tavolo
    // ha fatto. Comprare le alternative del ruolo toglie il piano B e con esso
    // il costo opportunità, quindi il tetto derivato si muove.
    const fresh = engineCall("a_uno", buildLog([]), "prudente");
    const afterMarket = engineCall(
      "a_uno",
      buildLog([buy("a_due", "A", TEAMS[1]!, 20), buy("a_tre", "A", TEAMS[2]!, 8)]),
      "prudente",
    );
    expect(fresh.declaredValue).toBe(afterMarket.declaredValue);
    expect(fresh.numbers!.fairToMeMaxEffective).not.toBe(
      afterMarket.numbers!.fairToMeMaxEffective,
    );
  });

  // MISURA SCOMODA, REGISTRATA PERCHÉ NON RESTI IMPLICITA. Con l'α
  // preregistrato del profilo «media» (1,00, §4.2) il costo opportunità esce
  // dalla formula per intero: `fairToMeMaxRaw = declaredValue`, e il valore
  // relativo coincide col valore assoluto finché non è `max_safe` a mordere.
  // Non è un difetto di questo riquadro né una libertà che si prende: è la
  // catena del motore letta fino in fondo, e chi guarda due numeri uguali ha
  // diritto di sapere perché lo sono.
  it("con α = 1,00 il relativo coincide con l'assoluto finché non morde max_safe", () => {
    const call = engineCall("a_uno", buildLog([]), "media");
    expect(call.numbers!.alpha).toBe(1);
    expect(call.numbers!.fairToMeMaxRaw).toBe(call.declaredValue);
    expect(call.numbers!.fairToMeMaxEffective).toBe(call.declaredValue);

    const tight = engineCall("a_uno", DRAINED_LOG, "media");
    expect(tight.numbers!.fairToMeMaxEffective).toBeLessThan(tight.declaredValue!);
    expect(tight.numbers!.fairToMeMaxEffective).toBe(tight.numbers!.maxSafe);
  });

  it("IL TETTO DEL TAVOLO è rispettato per costruzione: il valore relativo non supera il massimo dei max bid veri", () => {
    const scenarios: readonly (readonly [string, ReturnType<typeof buildLog>])[] = [
      ["tavolo fresco", buildLog([])],
      ["mercato avviato", buildLog([buy("a_due", "A", TEAMS[1]!, 20)])],
      [
        "tavolo consumato",
        buildLog([
          buy("a_due", "A", TEAMS[1]!, 20),
          buy("a_tre", "A", TEAMS[2]!, 8),
          buy("c_uno", "C", TEAMS[3]!, 25),
        ]),
      ],
    ];

    for (const [label, log] of scenarios) {
      const call = engineCall("a_uno", log);
      expect(call.numbers, label).not.toBeNull();
      const state = stateOf(log);
      const role: Role = "A";
      // «Quanto il tavolo può pagarlo adesso» = il massimo dei max bid veri:
      // un giocatore lo compra una squadra sola, quindi la somma non è la
      // capacità, è un'altra grandezza.
      const tableCapacity = Math.max(
        ...Object.values(state.teams).map((team) => {
          const safe = maxSafe(team, role);
          return safe.biddable ? safe.maxSafe : 0;
        }),
      );
      expect(call.numbers!.fairToMeMaxEffective, label).toBeLessThanOrEqual(tableCapacity);
      // E la catena del motore resta intera sotto max_safe, che è la ragione
      // per cui il tetto sopra vale senza un secondo clamp nella vista.
      expect(call.numbers!.chainOk, label).toBe(true);
    }
  });
});

describe("riquadro del valore — le assenze sono dichiarate, mai riempite", () => {
  it("senza chiamata i quattro slot dicono n/d, e dicono che manca il chiamato", () => {
    const reading = valueBoxReading({
      called: null,
      appealIndex: undefined,
      call: null,
      missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
    });
    for (const id of VALUE_SLOT_ORDER) {
      expect(reading.slots[id]).toEqual({ kind: "assente", reason: "nessun-chiamato" });
      expect(valueSlotText(reading.slots[id])).toBe(VALUE_UNKNOWN);
    }
    expect(reading.creditsProvenance).toBeNull();
  });

  it("listone senza indice: n/d col motivo, mai uno zero e mai un punto medio", () => {
    const reading = readingWithEngine("a_uno", undefined);
    expect(reading.slots["indice-assoluto"]).toEqual({ kind: "assente", reason: "indice-assente" });
    expect(reading.indexQuality).toBeNull();
    expect(reading.indexRecipe).toBeNull();
    expect(valueBoxNoteText(reading)).not.toContain("ricetta");
  });

  it("indice senza verdetto: l'n/d è quello portato dal dato, distinto da «non c'è l'indice»", () => {
    const reading = readingWithEngine("a_uno", index(null));
    expect(reading.slots["indice-assoluto"]).toEqual({
      kind: "assente",
      reason: "indice-senza-verdetto",
    });
    // La qualificazione resta, perché il dato c'è: è il verdetto a mancare.
    expect(reading.indexQuality).toBe(QUALITY);
  });

  it("un giocatore che Pico non ha valutato: il motivo è quello del motore, non uno inventato", () => {
    const call = engineCall("a_muto"); // fuori dal listino delle ancore e dei valori
    expect(call.noTargetReason).toBe("anchor-missing");
    const reading = valueBoxReading({
      called: { playerId: "a_muto", role: "A" },
      appealIndex: index(50),
      call,
      missingDeclaredInputs: [],
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "motore-senza-numeri",
    });
    expect(reading.engineReason).toBe("anchor-missing");
    expect(valueBoxHtml(reading)).toContain("nessuna quotazione per lui");
  });

  it("l'app di oggi non ha le dichiarazioni di Pico: lo dice, e dice quali mancano", () => {
    const reading = readingAsShipped(index(72));
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ingredienti-dichiarati-assenti",
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "ingredienti-dichiarati-assenti",
    });
    const note = valueBoxNoteText(reading);
    expect(note).toContain("i tuoi valori per giocatore");
    expect(note).toContain("il tuo profilo di rischio");
    const html = valueBoxHtml(reading);
    // L'indice assoluto, che una sorgente ce l'ha, resta un numero vero.
    expect(html).toContain(">72<");
  });
});

describe("riquadro del valore — la resa non accende nient'altro", () => {
  const DIRECTIVE =
    /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigli[ao]|dovresti|ranking|projection|prezzo atteso|fino a \d/i;

  it("nessuna parola direttiva nel riquadro, in nessuno dei suoi stati", () => {
    const readings = [
      readingWithEngine("a_uno", index(72)),
      readingWithEngine("a_uno", undefined),
      readingAsShipped(index(72)),
      valueBoxReading({
        called: null,
        appealIndex: undefined,
        call: null,
        missingDeclaredInputs: [],
      }),
    ];
    for (const reading of readings) {
      // «Nessun consiglio» è la resa a schermo del divieto, non la sua
      // violazione: si toglie prima di misurare, come fa e2e/tier-band.spec.ts.
      const text = `${valueBoxHtml(reading)} ${valueBoxNoteText(reading)} ${valueBoxSpoken(reading)}`
        .replace(/nessun consiglio/gi, "")
        .replace(/nessun prezzo di mercato previsto/gi, "");
      expect(text).not.toMatch(DIRECTIVE);
    }
  });

  it("fairToMeMaxRaw non arriva mai a schermo: il motore lo dichiara non renderizzabile", () => {
    // Tavolo col budget consumato e profilo prudente: è la sola configurazione
    // in cui i tre numeri della catena sono DISTINTI (dichiarato 60, grezzo 58,
    // effettivo 41). A tavolo fresco coincidono e il test non proverebbe nulla.
    const call = engineCall("a_uno", DRAINED_LOG, "prudente");
    const raw = call.numbers!.fairToMeMaxRaw;
    const effective = call.numbers!.fairToMeMaxEffective;
    expect(new Set([call.declaredValue, raw, effective]).size).toBe(3);

    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: effective,
      unit: "crediti",
    });
    const numbers = VALUE_SLOT_ORDER.map((id) => reading.slots[id]).flatMap((slot) =>
      slot.kind === "numero" ? [slot.value] : [],
    );
    expect(numbers).not.toContain(raw);
    expect(valueBoxHtml(reading)).not.toContain(`>${raw}<`);
  });

  it("valori precisi, mai intervalli: ogni numero è uno scalare intero di crediti o un indice", () => {
    const reading = readingWithEngine("a_uno", index(72));
    for (const id of VALUE_SLOT_ORDER) {
      const slot = reading.slots[id];
      if (slot.kind !== "numero") continue;
      expect(Number.isFinite(slot.value)).toBe(true);
      expect(valueSlotText(slot)).toMatch(/^-?\d+(\.\d+)?( cr)?$/);
    }
  });
});
