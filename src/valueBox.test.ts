import { describe, it, expect } from "vitest";
import {
  anchorBook,
  callScreen,
  livePlan,
  maxSafe,
  measuredInflation,
  relativePriceReading,
  type AnchorBook,
  type AuctionState,
  type CallScreen,
  type DeclaredValueBook,
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
import {
  APPEAL_ORDER_TIE_BREAK,
  tierBook,
  type TierBook,
} from "../packages/engine/src/tiers.js";
import {
  NO_LEG_INPUTS,
  type AbsoluteValueInput,
} from "../packages/engine/src/absoluteValue.js";
import type { ListoneAppealIndex } from "./ui/listone.js";
import {
  DECLARED_INPUTS_WITHOUT_SOURCE,
  SLOT_4_SOURCE_MOVED,
  VALUE_SLOT_ORDER,
  valueBoxReading,
  type ValueBoxReading,
} from "./valueBox.js";
import {
  VALUE_UNKNOWN,
  valueBoxHtml,
  missingDeclaredInputsText,
  valueBoxNoteText,
  valueBoxSpoken,
  valueSlotText,
  valueSlotWhyText,
  RELATIVE_PRICE_BOUND_TEXT,
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
 * La STESSA catena, ma su listini su misura. Serve alle due scene che i listini
 * di modulo non possono produrre, e che sono l'una il contrario dell'altra: un
 * giocatore quotato che Pico non ha MAI valutato, e un giocatore che Pico ha
 * valutato ZERO. Il resto degli ingressi è identico a `engineCall`, così fra le
 * due scene cambia soltanto ciò che si vuole misurare.
 */
function engineCallWith(
  playerId: string,
  book: AnchorBook,
  values: DeclaredValueBook,
  profile: ValueProfile = "media",
): CallScreen {
  const log = buildLog([]);
  const state: AuctionState = stateOf(log);
  return callScreen({
    playerId,
    book,
    values,
    state,
    inflation: measuredInflation(log, book),
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

// ── GLI INGRESSI DEL VALORE ASSOLUTO ────────────────────────────────────────
// Dalla decisione di Pico del 2026-08-24 lo slot 3 non è più una dichiarazione
// giocatore per giocatore: è la scala del regolamento (budget → target di ruolo
// → slot del ruolo → fascia) più tre gambe a peso zero. Qui si costruiscono i
// suoi ingressi con le stesse fixture sintetiche del resto del file.

/** Il libro delle fasce del motore vero, su un ordine sintetico di soli `a_*`. */
const TIER_BOOK: TierBook = tierBook(
  {
    provenance: {
      source: "listone sintetico di test",
      recipe: RECIPE,
      tieBreak: APPEAL_ORDER_TIE_BREAK,
    },
    roles: [
      {
        role: "A",
        playerIds: ["a_uno", "a_due", "a_tre", "a_non_valutato", "a_zero", "a_muto"],
      },
    ],
  },
  { teamsCount: 8 },
);

/** Gli stessi target del piano dichiarato del file: A = 210 su 7 slot = 30 cr. */
const ABSOLUTE_TARGETS = { P: 20, D: 80, C: 140, A: 210 } as const;

/** Base attesa per un attaccante in fascia: `210 / ROSTER_REQUIREMENTS.A`. */
const BASE_A = 210 / 7;

const ABSOLUTE: Omit<AbsoluteValueInput, "called"> = {
  roleTargets: ABSOLUTE_TARGETS,
  book: TIER_BOOK,
  legs: NO_LEG_INPUTS,
};

/** Nessun target dichiarato: è lo stato dell'app finché Pico non compila il piano. */
const ABSOLUTE_UNDECLARED: Omit<AbsoluteValueInput, "called"> = {
  roleTargets: {},
  book: TIER_BOOK,
  legs: NO_LEG_INPUTS,
};

// ── GLI INGRESSI DEL PREZZO RELATIVO ────────────────────────────────────────
// Lo slot 4 non ha ingressi dichiarati: ha il TAVOLO. È il contrario esatto di
// `ABSOLUTE` qui sopra — quello non può contenere uno stato d'asta, questo non
// contiene altro — e le due costanti stanno vicine perché la differenza si
// veda leggendo.

/** Lo stato d'asta vero (dal reducer) e la mia identità: gli ingressi dello slot 4. */
function tableOf(log = buildLog([])): { state: AuctionState; selfId: string } {
  return { state: stateOf(log), selfId: SELF };
}

/**
 * A TAVOLO FRESCO IL PREZZO RELATIVO VALE 473, e il numero va scritto invece
 * che dedotto: otto squadre identiche a 500 crediti hanno tutte lo stesso max
 * bid vero (500 − 27 slot obbligatori residui = 473), quindi il secondo chiede
 * 474 e il tetto del più ricco lo riporta a 473. È la regola letta fino in
 * fondo — quando tutti possono tutto, vincere costa tutto — non un difetto, ed
 * è il caso in cui la riga sotto il numero dice «tetto del tavolo» invece di
 * «secondo max bid»: il numero non è ancora un prezzo di mercato.
 */
const FRESH_TABLE_PRICE = 473;

function readingWithEngine(playerId: string, appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId, role: "A" },
    appealIndex,
    call: engineCall(playerId),
    missingDeclaredInputs: [],
    absolute: ABSOLUTE,
    table: tableOf(),
  });
}

/** La lettura come l'app la produce OGGI: nessuna dichiarazione di Pico dentro. */
function readingAsShipped(appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId: "a_uno", role: "A" },
    appealIndex,
    call: null,
    // Vuota, come la passa `src/main.ts`: nessuna cella dipende più da una
    // dichiarazione di Pico. `DECLARED_INPUTS_WITHOUT_SOURCE` resta importata e
    // provata qui sotto, dove il fatto che descrive è ancora vero.
    missingDeclaredInputs: [],
    absolute: ABSOLUTE_UNDECLARED,
    table: tableOf(),
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

  it("il valore relativo è il prezzo del tavolo, NON più fairToMeMaxEffective", () => {
    const call = engineCall("a_uno");
    expect(call.numbers).not.toBeNull();
    const table = tableOf();
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table,
    });

    // È esattamente ciò che `relativePriceReading()` risponde su QUESTO tavolo,
    // non un suo parente arrotondato e non un numero riscritto qui.
    const price = relativePriceReading({ state: table.state, role: "A", selfId: SELF });
    expect(price.kind).toBe("prezzo");
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: price.kind === "prezzo" ? price.credits : null,
      unit: "crediti",
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });

    // E NON È `fairToMeMaxEffective`: qui i due numeri esistono tutti e due e
    // non si somigliano — 60 la catena dei valori dichiarati, 473 il tavolo. È
    // la riga che diventa rossa se qualcuno riattacca lo slot alla catena
    // vecchia, cioè il difetto che questa corsia ha chiuso.
    expect(call.numbers!.fairToMeMaxEffective).toBe(60);
    expect(reading.slots["valore-relativo"]).not.toEqual({
      kind: "numero",
      value: call.numbers!.fairToMeMaxEffective,
      unit: "crediti",
    });

    // IL VINCOLO CHE HA FISSATO IL NUMERO viaggia col numero: a tavolo fresco è
    // il tetto strutturale, non la scala dei rivali.
    expect(reading.relativePriceBound).toBe("tetto-del-piu-ricco");
  });

  it("il valore assoluto è la scala del regolamento, NON più il valore dichiarato di Pico", () => {
    const call = engineCall("a_uno");
    // Il valore che Pico ha dichiarato per `a_uno` è 60; la base derivata è
    // 210/7 = 30. Se il riquadro leggesse ancora `declaredValue` mostrerebbe
    // 60, ed è esattamente la differenza che questo test tiene ferma.
    expect(call.declaredValue).toBe(60);
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: BASE_A,
      unit: "crediti",
    });
    expect(reading.slots["valore-assoluto"]).not.toEqual({
      kind: "numero",
      value: call.declaredValue,
      unit: "crediti",
    });
    // La catena arriva fino a chi mostra: budget, target, slot, fascia.
    expect(reading.absoluteChain).not.toBeNull();
    expect(reading.absoluteChain).toMatchObject({
      role: "A",
      budget: 500,
      roleTarget: 210,
      roleSlots: 7,
      perSlot: BASE_A,
      tier: 1,
      base: BASE_A,
      total: BASE_A,
    });
    expect(valueBoxHtml(reading)).toContain("210 cr sul ruolo / 7 slot");
  });

  it("il debito dello slot 4 è SALDATO, e la costante che lo dichiarava è sostituita, non affiancata", () => {
    // `#46` aveva scritto `SLOT_4_SUPERSEDED` per dire «agganciato alla catena
    // vecchia, riparazione in una PR dedicata». Questa è quella PR: la costante
    // nuova dice che cosa ha sostituito che cosa, e che niente è stato rimosso.
    // Tenerle entrambe farebbe dire al file «non riparato» e «riparato» insieme.
    expect(SLOT_4_SOURCE_MOVED).toContain("relativePriceReading()");
    expect(SLOT_4_SOURCE_MOVED).toContain("fairToMeMaxEffective");
    expect(SLOT_4_SOURCE_MOVED).toContain("2026-08-24");
    expect(SLOT_4_SOURCE_MOVED).toContain("SLOT_4_SUPERSEDED");
    expect(SLOT_4_SOURCE_MOVED).toContain("marcato, non rimosso");
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
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    for (const id of VALUE_SLOT_ORDER) {
      expect(reading.slots[id]).toEqual({ kind: "assente", reason: "nessun-chiamato" });
      expect(valueSlotText(reading.slots[id])).toBe(VALUE_UNKNOWN);
    }
    // Nessun vincolo del prezzo relativo senza il suo numero: un vincolo che
    // non lega niente sarebbe una frase su un numero che non c'è.
    expect(reading.relativePriceBound).toBeNull();
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

  it("un giocatore fuori dal listone: il motivo è quello del motore, non uno inventato", () => {
    // Fuori dal listino delle ANCORE prima ancora che da quello dei valori:
    // il motore si ferma su `anchor-missing`, che è un caso DIVERSO dal
    // «quotato ma non dichiarato» misurato più sotto. Il titolo lo dice, perché
    // due test che si chiamano quasi uguale finiscono per coprirne uno solo.
    const call = engineCall("a_muto");
    expect(call.noTargetReason).toBe("anchor-missing");
    const reading = valueBoxReading({
      called: { playerId: "a_muto", role: "A" },
      appealIndex: index(50),
      call,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    // IL VERDETTO DEL MOTORE RESTA RIPORTATO — è un fatto sul chiamato — ma non
    // spegne più nessuna cella: lo slot 4 non dipende dal listino delle ancore,
    // perché quanto costa vincere è un fatto sul TAVOLO. Prima di questa corsia
    // si spegneva insieme all'altro, e si spegneva per un motivo che non era il
    // suo.
    expect(reading.engineReason).toBe("anchor-missing");
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    expect(valueBoxHtml(reading)).not.toContain("nessuna quotazione per lui");
  });

  // ── «NON DICHIARATO» E «DICHIARATO ZERO» ───────────────────────────────────
  // Le due scene che il resto di questo file distingueva PER COSTRUZIONE ma non
  // PER PROVA, ed è la distinzione che in asta costa un'offerta sbagliata: chi
  // legge `n/d` sa di non sapere e chiede in giro; chi legge «0 cr» sa che il
  // giocatore per lui non vale niente e sta zitto. Confonderle in un verso fa
  // rilanciare su un giocatore che si era deciso di lasciar andare; nell'altro
  // fa lasciar andare un giocatore su cui non si era ancora deciso niente.
  //
  // Il codice le teneva già separate in tre punti — `callScreen.ts` decide su
  // `declaredValue === null` e non sulla falsità, `declaredValues.ts` accetta
  // `0` come dichiarazione legittima (rifiuta solo i negativi e i non finiti),
  // `valueBox.ts` rende `0` come numero — ma nessuna delle tre righe aveva un
  // test che diventasse rosso cambiandola. Ora ce l'hanno.

  /** Quotato nel listone, mai valutato da Pico: l'ancora c'è, la dichiarazione no. */
  const BOOK_CON_NON_VALUTATO = anchorBook([...ANCHORS, anchor("a_non_valutato", "A", 18)]);

  /** Valutato ZERO: una dichiarazione a tutti gli effetti, non un buco. */
  const BOOK_CON_ZERO = anchorBook([...ANCHORS, anchor("a_zero", "A", 18)]);
  const VALUES_CON_ZERO = valueBookOf([...VALUES.all, value("a_zero", 0)]);

  it("NON DICHIARATO: quotato ma mai valutato — n/d, e il motivo è «non hai dichiarato un valore»", () => {
    const call = engineCallWith("a_non_valutato", BOOK_CON_NON_VALUTATO, VALUES);
    // La quotazione C'È: non stiamo rimisurando `anchor-missing` sotto un altro
    // nome. È esattamente il ramo che nessun test toccava.
    expect(call.anchor).not.toBeNull();
    expect(call.declaredValue).toBeNull();
    expect(call.noTargetReason).toBe("declared-value-missing");

    const reading = valueBoxReading({
      called: { playerId: "a_non_valutato", role: "A" },
      appealIndex: index(64),
      call,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: tableOf(),
    });

    // NESSUNO DEI DUE SLOT IN CREDITI NE RISENTE PIÙ, ed è la conseguenza
    // congiunta delle due corsie del 2026-08-24. Il verdetto del motore resta
    // riportato — è un fatto sul chiamato — ma non spegne più nessuna cella.
    expect(reading.engineReason).toBe("declared-value-missing");
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    const html = valueBoxHtml(reading);
    // E la frase del motore non arriva a schermo, perché nessuno slot esce più
    // con `motore-senza-numeri`: sarebbe la spiegazione di una cella spenta che
    // spenta non è.
    expect(html).not.toContain("non hai dichiarato un valore per lui");

    // E LO SLOT 3 NON NE RISENTE, che è il senso della decisione del
    // 2026-08-24: il valore assoluto non attraversa più il listino di Pico,
    // quindi un giocatore mai valutato ha lo stesso identico valore assoluto
    // di uno valutato.
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: BASE_A,
      unit: "crediti",
    });
  });

  it("DICHIARATO ZERO: 0 resta una dichiarazione, e non collassa su «non dichiarato»", () => {
    const call = engineCallWith("a_zero", BOOK_CON_ZERO, VALUES_CON_ZERO);
    // Il motore NON lo tratta come una mancanza: lo zero attraversa la guardia
    // su `declaredValue === null` e arriva fino in fondo alla catena.
    expect(call.declaredValue).toBe(0);
    expect(call.noTargetReason).not.toBe("declared-value-missing");

    const reading = valueBoxReading({
      called: { playerId: "a_zero", role: "A" },
      appealIndex: index(64),
      call,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: tableOf(),
    });

    // IL CONFRONTO, che è il punto: le due scene restano DUE, e il riquadro le
    // racconta con due motivi diversi. Un `!declaredValue` al posto di
    // `=== null` le farebbe collassare in una sola, e questa riga lo impedisce.
    const nonDichiarato = valueBoxReading({
      called: { playerId: "a_non_valutato", role: "A" },
      appealIndex: index(64),
      call: engineCallWith("a_non_valutato", BOOK_CON_NON_VALUTATO, VALUES),
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    expect(reading.engineReason).not.toBe(nonDichiarato.engineReason);
    expect(nonDichiarato.engineReason).toBe("declared-value-missing");
  });

  // ── «RUOLO NON DICHIARATO» E «RUOLO DICHIARATO ZERO» ───────────────────────
  // La stessa distinzione, trasferita dov'è finita la dichiarazione di Pico:
  // dai valori per giocatore ai TARGET DI RUOLO. `src/rolePlan.ts` tiene i due
  // silenzi separati apposta («sul portiere NON HO ANCORA DECISO» contro «sul
  // portiere HO DECISO ZERO»), e il riquadro non può fonderli.

  it("RUOLO SENZA TARGET: n/d col motivo che nomina il target, e NESSUNA ripartizione di ripiego", () => {
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: engineCall("a_uno"),
      missingDeclaredInputs: [],
      absolute: ABSOLUTE_UNDECLARED,
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ruolo-senza-target",
    });
    expect(reading.absoluteChain).toBeNull();
    const html = valueBoxHtml(reading);
    expect(html).toContain("manca il tuo target di ruolo");
    // Nessun numero al posto del buco: né una media dei ruoli dichiarati, né
    // 500/28, né uno zero. Una ripartizione inventata è il peso nascosto che
    // §D9 vieta, e sarebbe indistinguibile a schermo da una dichiarazione vera.
    expect(valueSlotText(reading.slots["valore-assoluto"])).toBe(VALUE_UNKNOWN);
    expect(html).not.toContain(">0 cr<");
  });

  it("RUOLO DICHIARATO ZERO: 0 è un piano, e a schermo è «0 cr» — mai n/d", () => {
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: engineCall("a_uno"),
      missingDeclaredInputs: [],
      absolute: { ...ABSOLUTE, roleTargets: { ...ABSOLUTE_TARGETS, A: 0 } },
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: 0,
      unit: "crediti",
    });
    expect(valueSlotText(reading.slots["valore-assoluto"])).toBe("0 cr");
    expect(valueBoxHtml(reading)).toContain(">0 cr<");
    // SOTTO IL CREDITO MINIMO, e lo DICE invece di aggiustarlo: nessun clamp
    // al pavimento, che sarebbe una scelta silenziosa.
    expect(reading.absoluteBelowCostFloor).toBe(true);
    expect(valueBoxHtml(reading)).toContain("sotto il credito minimo");
  });

  it("l'app di oggi: lo slot 3 tace per il SUO motivo, lo slot 4 porta un numero", () => {
    const reading = readingAsShipped(index(72));
    // Lo slot 3 tace per il target di ruolo che manca — non per una
    // dichiarazione generica —, e lo slot 4 non tace affatto: i due `n/d` di
    // prima non erano lo stesso `n/d`, e adesso uno dei due non c'è più.
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ruolo-senza-target",
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    const html = valueBoxHtml(reading);
    expect(html).toContain("manca il tuo target di ruolo");
    // L'indice assoluto, che una sorgente ce l'ha, resta un numero vero.
    expect(html).toContain(">72<");
    // NESSUNA ETICHETTA DI PROVENIENZA DEI VALORI DICHIARATI, in nessuno stato:
    // è uscita dal riquadro insieme all'ultimo numero che poteva qualificare.
    expect(html).not.toContain("derivato dai tuoi valori");
    expect(valueBoxNoteText(reading)).not.toContain("derivato dai tuoi valori");
  });

  it("la nota in testata non promette più una cella spenta da una dichiarazione", () => {
    // L'app passa una lista vuota (src/main.ts): nessuno dei quattro numeri
    // aspetta una dichiarazione di Pico, quindi la frase non ha più un
    // soggetto. La funzione che la costruisce resta, e resta provata qui sotto
    // per il giorno in cui una cella tornerà a dipenderne.
    const shipped = readingAsShipped(index(72));
    expect(shipped.missingDeclaredInputs).toEqual([]);
    expect(missingDeclaredInputsText(shipped)).toBe("");
    expect(valueBoxNoteText(shipped)).not.toContain("i tuoi valori per giocatore");
    expect(valueBoxNoteText(shipped)).not.toContain("il tuo profilo di rischio");
  });
});

describe("riquadro del valore — lo SLOT 4 è il prezzo del tavolo, e le sue assenze sono sue", () => {
  // Le cinque scene in cui «quanto costa vincere» non esiste, ognuna col
  // proprio motivo e nessuna con un numero di ripiego. Sono le stesse cinque
  // che `relativeValue.ts` dichiara: qui si prova che il riquadro le TRADUCE
  // una a una invece di accorparle in un `n/d` muto.

  function slot4(log: ReturnType<typeof buildLog>, selfId = SELF): ValueBoxReading {
    return valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: { state: stateOf(log), selfId },
    });
  }

  it("IL RUOLO PIENO PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi", () => {
    const reading = slot4(buildLog(fillRole(SELF, "A", 7, 1)));
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "ruolo-pieno-per-me",
    });
    expect(reading.relativePriceBound).toBeNull();
    expect(valueBoxHtml(reading)).toContain("il tuo ruolo è pieno");
  });

  it("IL MIO BUDGET BLOCCATO dalla riserva dura: nessuna offerta valida, nessun prezzo", () => {
    const log = buildLog(fillRole(SELF, "D", 9, 54));
    expect(maxSafe(stateOf(log).teams[SELF]!, "A").biddable).toBe(false);
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "non-posso-offrire",
    });
    expect(valueBoxHtml(reading)).toContain("bloccato dalla riserva");
  });

  it("UN SOLO rivale capiente: il secondo non esiste, e non si sostituisce col primo", () => {
    const log = buildLog(TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 7, 1)));
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "un-solo-rivale-eleggibile",
    });
    expect(valueBoxHtml(reading)).toContain("non c'è un secondo");
  });

  it("NESSUN rivale capiente: non c'è nessuna asta da vincere", () => {
    const log = buildLog(TEAMS.slice(1).flatMap((team) => fillRole(team, "A", 7, 1)));
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "nessun-rivale-eleggibile",
    });
    expect(valueBoxHtml(reading)).toContain("nessun rivale può ancora comprarlo");
  });

  it("LA MIA SQUADRA NON È A QUESTO TAVOLO: non si sceglie una squadra a caso", () => {
    const reading = slot4(buildLog([]), "squadra_che_non_esiste");
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "tavolo-senza-la-mia-squadra",
    });
    expect(valueBoxHtml(reading)).toContain("non è a questo tavolo");
  });

  // ── LE TRE RIGHE DEL PERCHÉ ────────────────────────────────────────────────
  // Il numero da solo confonde due cose che il motore tiene separate: un prezzo
  // che il mercato sta formando e un tetto strutturale. La distinzione esisteva
  // già in `RelativePriceChain.boundBy` e non arrivava a schermo; queste tre
  // misure sono ciò che la tiene lì. Nessuna formula nuova, nessun peso.

  it("TETTO DEL TAVOLO: a tavolo fresco la riga NON dice «il secondo max bid»", () => {
    // È la scena dei primi minuti, ed è la ragione per cui la distinzione
    // serve: con otto squadre identiche il numero è 473 per QUALUNQUE giocatore
    // di QUALUNQUE ruolo, quindi non misura il giocatore — misura il tavolo.
    const reading = slot4(buildLog([]));
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    expect(reading.relativePriceBound).toBe("tetto-del-piu-ricco");
    expect(valueSlotWhyText("valore-relativo", reading.slots["valore-relativo"], reading)).toBe(
      "il tetto del tavolo: nessuno arriva più in alto",
    );

    // LA PROVA CHE IL NUMERO NON DISTINGUE, e la riga sì: gli altri tre ruoli
    // danno lo stesso identico numero, e la stessa identica riga.
    for (const role of ["P", "D", "C"] as const) {
      const other = valueBoxReading({
        called: { playerId: "x_uno", role },
        appealIndex: index(72),
        call: null,
        missingDeclaredInputs: [],
        absolute: ABSOLUTE,
        table: tableOf(),
      });
      expect(other.slots["valore-relativo"], role).toEqual({
        kind: "numero",
        value: FRESH_TABLE_PRICE,
        unit: "crediti",
      });
      expect(other.relativePriceBound, role).toBe("tetto-del-piu-ricco");
    }
  });

  it("SCALA DEI RIVALI: quando il mercato differenzia, la riga lo dice", () => {
    // Sei rivali su sette hanno speso: il secondo è a 274 e «secondo + 1» sta
    // sotto il tetto del più ricco, quindi il numero è un prezzo vero.
    const log = buildLog(TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 1, 200)));
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: 275,
      unit: "crediti",
    });
    expect(reading.relativePriceBound).toBe("scala-dei-rivali");
    expect(valueSlotWhyText("valore-relativo", reading.slots["valore-relativo"], reading)).toBe(
      "il secondo max bid al tavolo, +1",
    );
  });

  it("TETTO MAX_SAFE: la riga dice che il tetto è il MIO, non quello del tavolo", () => {
    // Il terzo caso non è un doppione del secondo: accorparli direbbe a chi
    // legge che nessuno può salire, mentre è lui a non poter salire.
    const reading = slot4(DRAINED_LOG);
    expect(reading.relativePriceBound).toBe("tetto-max-safe");
    expect(valueSlotWhyText("valore-relativo", reading.slots["valore-relativo"], reading)).toBe(
      "il tuo max bid: il tavolo chiede di più",
    );
    // Le tre frasi sono tre, e nessuna coppia collassa.
    expect(new Set(Object.values(RELATIVE_PRICE_BOUND_TEXT)).size).toBe(3);
  });

  it("il numero si muove quando deve: stesso giocatore, tavolo diverso, prezzo diverso", () => {
    const fresh = slot4(buildLog([]));
    const later = slot4(
      buildLog(TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 1, 200))),
    );
    expect(fresh.slots["valore-assoluto"]).toEqual(later.slots["valore-assoluto"]);
    expect(later.slots["valore-relativo"]).not.toEqual(fresh.slots["valore-relativo"]);
  });

  it("lo slot 4 non dipende dalla schermata CHIAMATA: stesso tavolo, stesso numero", () => {
    // `call` non alimenta più nessuna cella. Passarne uno vero o `null` non può
    // spostare il prezzo relativo di un credito — ed è la riga che diventa
    // rossa se qualcuno lo riattacca a quella catena.
    const table = tableOf();
    const common = {
      called: { playerId: "a_uno", role: "A" as const },
      appealIndex: index(72),
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table,
    };
    const senzaCall = valueBoxReading({ ...common, call: null });
    const conCall = valueBoxReading({ ...common, call: engineCall("a_uno") });
    expect(conCall.slots["valore-relativo"]).toEqual(senzaCall.slots["valore-relativo"]);
    expect(conCall.slots["valore-assoluto"]).toEqual(senzaCall.slots["valore-assoluto"]);
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
        absolute: ABSOLUTE,
        table: tableOf(),
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
      absolute: ABSOLUTE,
      // Lo stesso momento della catena qui sopra: il riquadro non mostra due
      // fotografie diverse dello stesso tavolo.
      table: tableOf(DRAINED_LOG),
    });
    // Su questo tavolo il prezzo relativo vale 41 — e vale 41 perché è il MIO
    // `max_safe` a mordere, la stessa ragione per cui `fairToMeMaxEffective`
    // vale 41. Due strade diverse che finiscono sullo stesso tetto hard-safe:
    // la coincidenza è del tetto, non delle formule, e il test «il valore
    // relativo è il prezzo del tavolo» le separa dove divergono davvero.
    expect(maxSafe(stateOf(DRAINED_LOG).teams[SELF]!, "A").maxSafe).toBe(41);
    expect(effective).toBe(41);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: 41,
      unit: "crediti",
    });
    expect(reading.relativePriceBound).toBe("tetto-max-safe");
    const numbers = VALUE_SLOT_ORDER.map((id) => reading.slots[id]).flatMap((slot) =>
      slot.kind === "numero" ? [slot.value] : [],
    );
    expect(numbers).not.toContain(raw);
    expect(valueBoxHtml(reading)).not.toContain(`>${raw}<`);
  });

  it("valori precisi, mai intervalli: ogni numero è uno scalare, mai una coppia di estremi", () => {
    const reading = readingWithEngine("a_uno", index(72));
    for (const id of VALUE_SLOT_ORDER) {
      const slot = reading.slots[id];
      if (slot.kind !== "numero") continue;
      expect(Number.isFinite(slot.value)).toBe(true);
      // Uno scalare secco, con la virgola italiana quando la quota di uno slot
      // non è intera (210/7 lo è, 200/9 no). Mai «fra 55 e 70».
      expect(valueSlotText(slot)).toMatch(/^-?\d+(,\d)?( cr)?$/);
    }
  });
});
