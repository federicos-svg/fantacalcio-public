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
  valueSlotWhyText,
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

/**
 * IL TAVOLO che l'app passa al riquadro: lo stato d'asta vero (dal reducer) e
 * la mia identità. Alimenta il solo SLOT 4, e non dipende da nessuna
 * dichiarazione di Pico — è la ragione per cui quello slot si accende oggi.
 */
function tableOf(log = buildLog([])): { state: AuctionState; selfId: string } {
  return { state: stateOf(log), selfId: SELF };
}

/**
 * A TAVOLO FRESCO IL PREZZO RELATIVO VALE 473, e il numero va scritto invece
 * che dedotto: otto squadre identiche a 500 crediti hanno tutte lo stesso max
 * bid vero (500 − 27 slot obbligatori residui = 473), quindi il secondo chiede
 * 474 e il tetto del più ricco lo riporta a 473. È la regola letta fino in
 * fondo — quando tutti possono tutto, vincere costa tutto — non un difetto.
 */
const FRESH_TABLE_PRICE = 473;

function readingWithEngine(playerId: string, appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId, role: "A" },
    appealIndex,
    call: engineCall(playerId),
    missingDeclaredInputs: [],
    table: tableOf(),
  });
}

/** La lettura come l'app la produce OGGI: nessuna dichiarazione di Pico dentro. */
function readingAsShipped(appealIndex?: ListoneAppealIndex): ValueBoxReading {
  return valueBoxReading({
    called: { playerId: "a_uno", role: "A" },
    appealIndex,
    call: null,
    missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
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

  it("i due numeri in crediti escono da DUE catene diverse: il valore dichiarato e il prezzo relativo", () => {
    const call = engineCall("a_uno");
    expect(call.numbers).not.toBeNull();
    const table = tableOf();
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call,
      missingDeclaredInputs: [],
      table,
    });

    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: call.declaredValue,
      unit: "crediti",
    });
    // LO SLOT 4 È IL PREZZO RELATIVO, e non un parente della catena §4.2: è
    // esattamente ciò che `relativePriceReading()` risponde su QUESTO tavolo.
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
    // non si somigliano — 60 la catena dei valori dichiarati, 473 il tavolo.
    // È la riga che diventa rossa se qualcuno riattacca lo slot alla catena
    // vecchia, che è esattamente il difetto che questa corsia ha chiuso.
    expect(call.numbers!.fairToMeMaxEffective).toBe(60);
    expect(reading.slots["valore-relativo"]).not.toEqual({
      kind: "numero",
      value: call.numbers!.fairToMeMaxEffective,
      unit: "crediti",
    });

    // La provenienza imposta dal motore qualifica il numero costruito sui
    // valori dichiarati — cioè il SOLO valore assoluto. Il prezzo relativo da
    // quei valori non passa, e portarla anche lì sarebbe una frase falsa.
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
    // ha fatto. Due acquisti veri passati dal reducer tolgono capienza a due
    // rivali, e il prezzo di vincere cambia — mentre la fotografia che Pico ha
    // dichiarato resta identica. È la coppia di proprietà che il record del
    // 2026-08-24 chiede allo slot 4: «relativo al momento dell'asta».
    // Sei rivali su sette comprano un attaccante da 200: la loro capienza
    // scende da 473 a 274, e con essa il SECONDO della scala. Il settimo resta
    // fresco, quindi il tetto del più ricco non si muove — proprio come
    // nell'esempio di Pico.
    const laterLog = buildLog(
      TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 1, 200)),
    );
    const fresh = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: engineCall("a_uno"),
      missingDeclaredInputs: [],
      table: tableOf(),
    });
    const later = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: engineCall("a_uno", laterLog),
      missingDeclaredInputs: [],
      table: tableOf(laterLog),
    });

    expect(later.slots["valore-assoluto"]).toEqual(fresh.slots["valore-assoluto"]);
    expect(fresh.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    expect(later.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: 275, // 274 del secondo, più uno
      unit: "crediti",
    });
  });

  // MISURA SCOMODA, REGISTRATA PERCHÉ NON RESTI IMPLICITA. Con l'α
  // preregistrato del profilo «media» (1,00, §4.2) il costo opportunità esce
  // dalla formula per intero: `fairToMeMaxRaw = declaredValue`, e il valore
  // relativo coincide col valore assoluto finché non è `max_safe` a mordere.
  // Non è un difetto di questo riquadro né una libertà che si prende: è la
  // catena del motore letta fino in fondo, e chi guarda due numeri uguali ha
  // diritto di sapere perché lo sono.
  // AGGIORNATA, NON TOLTA. Questa misura resta vera e resta registrata, ma da
  // questa corsia in poi descrive la CATENA FTM del motore e non più lo slot 4
  // del riquadro, che legge `relativePriceReading()`. Si tiene perché la
  // regola del progetto è che un'asserzione si aggiorna o si inverte, mai si
  // toglie: il giorno in cui qualcuno riattaccasse il riquadro a quella catena
  // ritroverebbe qui, scritto, che cosa comporta.
  it("catena FTM (non più a schermo): con α = 1,00 il tetto coincide col valore dichiarato finché non morde max_safe", () => {
    const call = engineCall("a_uno", buildLog([]), "media");
    expect(call.numbers!.alpha).toBe(1);
    expect(call.numbers!.fairToMeMaxRaw).toBe(call.declaredValue);
    expect(call.numbers!.fairToMeMaxEffective).toBe(call.declaredValue);

    const tight = engineCall("a_uno", DRAINED_LOG, "media");
    expect(tight.numbers!.fairToMeMaxEffective).toBeLessThan(tight.declaredValue!);
    expect(tight.numbers!.fairToMeMaxEffective).toBe(tight.numbers!.maxSafe);
  });

  it("IL TETTO DEL TAVOLO vale anche per lo slot 4, e adesso è scritto nella formula", () => {
    // Il record impone che il valore relativo non superi «quanto il tavolo può
    // pagarlo adesso», cioè il MASSIMO dei max bid veri — un giocatore lo compra
    // una squadra sola, quindi la somma non è la capacità. Con la sorgente
    // nuova quel tetto non è più una conseguenza della catena: è uno degli
    // argomenti del minimo, insieme al mio `max_safe`.
    const logs: readonly (readonly [string, ReturnType<typeof buildLog>])[] = [
      ["tavolo fresco", buildLog([])],
      ["mercato avviato", buildLog([buy("a_due", "A", TEAMS[1]!, 200)])],
      [
        "tavolo consumato",
        buildLog([
          buy("a_due", "A", TEAMS[1]!, 200),
          buy("a_tre", "A", TEAMS[2]!, 180),
          buy("c_uno", "C", TEAMS[3]!, 250),
        ]),
      ],
    ];
    for (const [label, log] of logs) {
      const state = stateOf(log);
      const slot = valueBoxReading({
        called: { playerId: "a_uno", role: "A" },
        appealIndex: index(72),
        call: null,
        missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
        table: { state, selfId: SELF },
      }).slots["valore-relativo"];
      if (slot.kind !== "numero") continue;
      const tableCapacity = Math.max(
        ...Object.values(state.teams).map((team) => {
          const safe = maxSafe(team, "A");
          return safe.biddable ? safe.maxSafe : 0;
        }),
      );
      expect(slot.value, label).toBeLessThanOrEqual(tableCapacity);
      // E non supera mai il MIO tetto hard-safe, interrogato e non riderivato.
      expect(slot.value, label).toBeLessThanOrEqual(maxSafe(state.teams[SELF]!, "A").maxSafe);
    }
  });

  // AGGIORNATA, NON TOLTA — vedi la nota sopra: la misura resta vera della
  // catena FTM, che però non alimenta più il riquadro.
  it("catena FTM (non più a schermo): fairToMeMaxEffective resta sotto il massimo dei max bid veri", () => {
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
      table: tableOf(),
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
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "motore-senza-numeri",
    });
    expect(reading.engineReason).toBe("anchor-missing");
    expect(valueBoxHtml(reading)).toContain("nessuna quotazione per lui");
    // E LO SLOT 4 RESTA ACCESO, perché il suo numero non dipende dal listino
    // delle ancore: quanto costa vincere è un fatto sul TAVOLO. Prima di questa
    // corsia si spegneva insieme all'altro, e si spegneva per un motivo che non
    // era il suo.
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
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
      table: tableOf(),
    });

    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "motore-senza-numeri",
    });
    // Il prezzo relativo, invece, c'è: non aspetta una dichiarazione di Pico.
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    expect(reading.engineReason).toBe("declared-value-missing");

    // A schermo: `n/d`, col perché del motore e non con una frase generica.
    expect(valueSlotText(reading.slots["valore-assoluto"])).toBe(VALUE_UNKNOWN);
    const html = valueBoxHtml(reading);
    expect(html).toContain("non hai dichiarato un valore per lui");
    // E NESSUNO ZERO: un'assenza non si arrotonda al numero più vicino a nulla.
    expect(html).not.toContain(">0 cr<");
    // La provenienza non compare: qualificherebbe un numero che non c'è.
    expect(reading.creditsProvenance).toBeNull();
  });

  it("DICHIARATO ZERO: 0 è una dichiarazione — a schermo è «0 cr», mai n/d", () => {
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
      table: tableOf(),
    });

    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: 0,
      unit: "crediti",
    });
    expect(valueSlotText(reading.slots["valore-assoluto"])).toBe("0 cr");
    expect(valueBoxHtml(reading)).toContain(">0 cr<");
    // Uno zero DICHIARATO porta la provenienza, perché è un numero costruito
    // sui valori di Pico come qualunque altro.
    expect(reading.creditsProvenance).toBe("derivato dai tuoi valori");

    // IL CONFRONTO, che è il punto: la stessa cella, le due scene, due esiti
    // che non si somigliano. Un `!declaredValue` al posto di `=== null` le
    // farebbe collassare in una sola, e questa riga è ciò che lo impedisce.
    const nonDichiarato = valueBoxReading({
      called: { playerId: "a_non_valutato", role: "A" },
      appealIndex: index(64),
      call: engineCallWith("a_non_valutato", BOOK_CON_NON_VALUTATO, VALUES),
      missingDeclaredInputs: [],
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).not.toEqual(
      nonDichiarato.slots["valore-assoluto"],
    );
  });

  it("l'app di oggi non ha le dichiarazioni di Pico: lo dice, e dice quali mancano — ma non spegne il prezzo relativo", () => {
    const reading = readingAsShipped(index(72));
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ingredienti-dichiarati-assenti",
    });
    // LO SLOT 4 SI ACCENDE OGGI. È la differenza che questa corsia introduce:
    // prima i due numeri in crediti tacevano insieme e per lo stesso motivo;
    // adesso il prezzo relativo si calcola sui soli vincoli duri del tavolo, e
    // nessuna dichiarazione mancante lo riguarda.
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    const note = valueBoxNoteText(reading);
    expect(note).toContain("i tuoi valori per giocatore");
    expect(note).toContain("il tuo profilo di rischio");
    // E la frase dice UNA cella, non due: prometterne due significherebbe dire
    // che il prezzo relativo è spento per una ragione che non è la sua.
    expect(note).toContain("Il valore assoluto resta n/d");
    expect(note).not.toContain("I due valori in crediti");
    const html = valueBoxHtml(reading);
    // L'indice assoluto, che una sorgente ce l'ha, resta un numero vero.
    expect(html).toContain(">72<");
    // La provenienza dei valori dichiarati non compare: non c'è, a schermo,
    // nessun numero costruito su quei valori da qualificare.
    expect(reading.creditsProvenance).toBeNull();
  });
});

describe("riquadro del valore — lo SLOT 4 è il prezzo relativo, e le sue assenze sono sue", () => {
  // Le cinque scene in cui «quanto costa vincere» non esiste, ognuna col
  // proprio motivo e nessuna con un numero di ripiego. Sono le stesse cinque
  // che `relativeValue.ts` dichiara: qui si prova che il riquadro le TRADUCE
  // una a una invece di accorparle in un `n/d` muto.

  function slot4(log: ReturnType<typeof buildLog>, selfId = SELF): ValueBoxReading {
    return valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
      table: { state: stateOf(log), selfId },
    });
  }

  it("IL RUOLO PIENO PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi", () => {
    const reading = slot4(buildLog(fillRole(SELF, "A", 7, 1)));
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "ruolo-pieno-per-me",
    });
    expect(valueBoxHtml(reading)).toContain("il tuo ruolo è pieno");
  });

  it("IL MIO BUDGET BLOCCATO dalla riserva dura: nessuna offerta valida, nessun prezzo", () => {
    const reading = slot4(buildLog(fillRole(SELF, "D", 9, 54)));
    expect(maxSafe(stateOf(buildLog(fillRole(SELF, "D", 9, 54))).teams[SELF]!, "A").biddable).toBe(
      false,
    );
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

  it("quando il numero c'è, la riga sotto nomina l'ingrediente e non lo qualifica", () => {
    const reading = readingAsShipped(index(72));
    expect(valueSlotWhyText("valore-relativo", reading.slots["valore-relativo"], reading)).toBe(
      "il secondo max bid al tavolo, +1",
    );
    // E NON porta più la provenienza dei valori dichiarati: quel numero da
    // quei valori non passa.
    expect(
      valueSlotWhyText("valore-relativo", reading.slots["valore-relativo"], reading),
    ).not.toContain("derivato dai tuoi valori");
  });

  it("lo slot 4 non dipende dalla schermata CHIAMATA: stesso tavolo, stesso numero", () => {
    // `call` alimenta il solo valore assoluto. Passarne uno vero o `null` non
    // può spostare il prezzo relativo di un credito — ed è la riga che diventa
    // rossa se qualcuno lo riattacca a quella catena.
    const table = tableOf();
    const senzaCall = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: DECLARED_INPUTS_WITHOUT_SOURCE,
      table,
    });
    const conCall = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: engineCall("a_uno"),
      missingDeclaredInputs: [],
      table,
    });
    expect(conCall.slots["valore-relativo"]).toEqual(senzaCall.slots["valore-relativo"]);
    expect(conCall.slots["valore-assoluto"]).not.toEqual(senzaCall.slots["valore-assoluto"]);
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
      // Lo stesso momento della catena qui sopra: il riquadro non mostra due
      // fotografie diverse dello stesso tavolo.
      table: tableOf(DRAINED_LOG),
    });
    // Su questo tavolo il prezzo relativo vale 41 — e vale 41 perché è il mio
    // `max_safe` a mordere, la stessa ragione per cui `fairToMeMaxEffective`
    // vale 41. Due strade diverse che finiscono sullo stesso tetto hard-safe:
    // la coincidenza è del tetto, non delle formule, e il test qui sopra («due
    // catene diverse») la separa dove i due numeri divergono davvero.
    expect(maxSafe(stateOf(DRAINED_LOG).teams[SELF]!, "A").maxSafe).toBe(41);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: 41,
      unit: "crediti",
    });
    expect(effective).toBe(41);
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
