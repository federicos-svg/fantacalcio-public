import { describe, it, expect } from "vitest";
import {
  anchorBook,
  callScreen,
  livePlan,
  maxSafe,
  measuredInflation,
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
import {
  freeLadder,
  type RelativeIndexInput,
} from "../packages/engine/src/relativeIndex.js";
import type { ListoneAppealIndex } from "./ui/listone.js";
import {
  DECLARED_INPUTS_WITHOUT_SOURCE,
  SLOT_4_SUPERSEDED,
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

// ── GLI INGRESSI DELL'INDICE RELATIVO ───────────────────────────────────────
// Lo slot 2 è una POSIZIONE fra i liberi del ruolo, misurata sullo stesso
// ordine che costruisce le fasce (`TIER_BOOK`). Le righe di listone che entrano
// nella scala sono gli stessi sei `a_*` dell'ordine più un centrocampista, così
// il conteggio per ruolo non è degenere.

const RELATIVE_POOL = [
  { playerId: "a_uno", role: "A" },
  { playerId: "a_due", role: "A" },
  { playerId: "a_tre", role: "A" },
  { playerId: "a_non_valutato", role: "A" },
  { playerId: "a_zero", role: "A" },
  { playerId: "a_muto", role: "A" },
  { playerId: "c_uno", role: "C" },
] as const;

/** La scala dei liberi su un tavolo fresco: nessuno è ancora stato preso. */
function relativeOn(log = buildLog([])): Omit<RelativeIndexInput, "called"> {
  const state: AuctionState = stateOf(log);
  return {
    ladder: freeLadder({
      pool: [...RELATIVE_POOL],
      book: TIER_BOOK,
      purchasedPlayerIds: state.purchasedPlayerIds,
    }),
    state,
    selfId: SELF,
  };
}

const RELATIVE = relativeOn();

function readingWithEngine(playerId: string, appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId, role: "A" },
    appealIndex,
    call: engineCall(playerId),
    missingDeclaredInputs: [],
    relative: RELATIVE,
    absolute: ABSOLUTE,
  });
}

/** La lettura come l'app la produce OGGI: nessuna dichiarazione di Pico dentro. */
function readingAsShipped(appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId: "a_uno", role: "A" },
    appealIndex,
    call: null,
    missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
    relative: RELATIVE,
    absolute: ABSOLUTE_UNDECLARED,
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

  it("il valore relativo è fairToMeMaxEffective, non un suo parente arrotondato", () => {
    const call = engineCall("a_uno");
    expect(call.numbers).not.toBeNull();
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
      relative: RELATIVE,
      absolute: ABSOLUTE,
    });

    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: call.numbers!.fairToMeMaxEffective,
      unit: "crediti",
    });
    // La provenienza è quella imposta dal motore, non una frase scritta nella
    // vista — e qualifica il SOLO numero costruito sui valori dichiarati.
    expect(reading.creditsProvenance).toBe("derivato dai tuoi valori");
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
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

  it("il debito dello slot 4 è dichiarato in chiaro, con la data della decisione che lo ha sostituito", () => {
    // Documentato senza essere approvato, come le scelte non ratificate del
    // motore: la riparazione è un'altra PR, ma il difetto non resta implicito.
    expect(SLOT_4_SUPERSEDED).toContain("fairToMeMaxEffective");
    expect(SLOT_4_SUPERSEDED).toContain("2026-08-24");
    expect(SLOT_4_SUPERSEDED).toContain("secondo offerente");
  });

  it("l'indice assoluto è il punteggio servito, con qualità e ricetta portate dal dato", () => {
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["indice-assoluto"]).toEqual({ kind: "numero", value: 72, unit: "indice" });
    expect(reading.indexQuality).toBe(QUALITY);
    expect(reading.indexRecipe).toBe(RECIPE);
  });

  it("l'indice relativo è la POSIZIONE fra i liberi del ruolo, col suo denominatore", () => {
    // `a_uno` è il primo dell'ordine e nessuno è stato preso: primo fra i sei
    // attaccanti ancora liberi. L'unità NON è `indice`: un rango e un punteggio
    // si leggono in due modi diversi, e il tipo li tiene distinti.
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 1,
      unit: "posizione",
    });
    expect(valueSlotText(reading.slots["indice-relativo"])).toBe("1º");
    expect(reading.relativePopulation).toMatchObject({
      role: "A",
      freeInRole: 6,
      poolInRole: 6,
      freeRankedInRole: 6,
    });
    // Il denominatore arriva a schermo: «3º» senza «su quanti» è un punteggio
    // travestito. E il denominatore conta gli ORDINATI, cioè la stessa
    // popolazione in cui la posizione è misurata.
    expect(valueBoxHtml(reading)).toContain("su 6 liberi ordinati");
  });

  it("l'indice relativo SALE quando comprano qualcuno sopra di lui", () => {
    // `a_tre` è terzo nell'ordine. Comprato `a_uno` (che gli sta sopra), fra i
    // liberi diventa secondo: è esattamente l'esempio con cui Pico ha definito
    // il numero, e non c'è nessuna formula in mezzo — solo uno in meno da contare.
    const before = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: relativeOn(),
      absolute: ABSOLUTE,
    });
    const after = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: relativeOn(buildLog([buy("a_uno", "A", TEAMS[1]!, 30)])),
      absolute: ABSOLUTE,
    });

    expect(before.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 3,
      unit: "posizione",
    });
    expect(after.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 2,
      unit: "posizione",
    });
    // E il VALORE ASSOLUTO non si è mosso di un credito: è la differenza fra i
    // due slot, e se sparisse uno dei due numeri starebbe mentendo.
    expect(after.slots["valore-assoluto"]).toEqual(before.slots["valore-assoluto"]);
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "motore-senza-numeri",
    });
    expect(reading.engineReason).toBe("anchor-missing");
    expect(valueBoxHtml(reading)).toContain("nessuna quotazione per lui");
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
    });

    // Lo slot 4 — l'unico che passa ancora dai valori dichiarati — tace, e dice
    // esattamente quale dichiarazione manca.
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "motore-senza-numeri",
    });
    expect(reading.engineReason).toBe("declared-value-missing");

    // A schermo: `n/d`, col perché del motore e non con una frase generica.
    expect(valueSlotText(reading.slots["valore-relativo"])).toBe(VALUE_UNKNOWN);
    const html = valueBoxHtml(reading);
    expect(html).toContain("non hai dichiarato un valore per lui");
    // La provenienza non compare: qualificherebbe un numero che non c'è.
    expect(reading.creditsProvenance).toBeNull();

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
      relative: RELATIVE,
      absolute: ABSOLUTE,
    });

    // IL CONFRONTO, che è il punto: le due scene restano DUE, e il riquadro le
    // racconta con due motivi diversi. Un `!declaredValue` al posto di
    // `=== null` le farebbe collassare in una sola, e questa riga lo impedisce.
    const nonDichiarato = valueBoxReading({
      called: { playerId: "a_non_valutato", role: "A" },
      appealIndex: index(64),
      call: engineCallWith("a_non_valutato", BOOK_CON_NON_VALUTATO, VALUES),
      missingDeclaredInputs: [],
      relative: RELATIVE,
      absolute: ABSOLUTE,
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
      relative: RELATIVE,
      absolute: ABSOLUTE_UNDECLARED,
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
      relative: RELATIVE,
      absolute: { ...ABSOLUTE, roleTargets: { ...ABSOLUTE_TARGETS, A: 0 } },
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

  it("l'app di oggi non ha le dichiarazioni di Pico: lo dice, e dice quali mancano", () => {
    const reading = readingAsShipped(index(72));
    // Lo slot 3 tace per il SUO motivo — il target di ruolo — e non più per
    // quello dello slot 4: i due `n/d` non sono più lo stesso `n/d`.
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ruolo-senza-target",
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
        relative: RELATIVE,
        absolute: ABSOLUTE,
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
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

  it("valori precisi, mai intervalli: ogni numero è uno scalare, mai una coppia di estremi", () => {
    const reading = readingWithEngine("a_uno", index(72));
    for (const id of VALUE_SLOT_ORDER) {
      const slot = reading.slots[id];
      if (slot.kind !== "numero") continue;
      expect(Number.isFinite(slot.value)).toBe(true);
      // Uno scalare secco, con la virgola italiana quando la quota di uno slot
      // non è intera (210/7 lo è, 200/9 no). Mai «fra 55 e 70». L'ordinale
      // dell'indice relativo è ammesso come SUFFISSO — `3º` è un numero solo,
      // non una coppia — e resta l'unico segno di forma consentito accanto a
      // `cr`: la sonda continua a bocciare qualunque cosa contenga due numeri.
      expect(valueSlotText(slot)).toMatch(/^-?\d+(,\d)?( cr|º)?$/);
    }
  });
});
