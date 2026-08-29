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
import {
  plan,
  value,
  valueBookOf,
} from "../packages/engine/tests/layer3Fixtures.js";
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
  relativeIndexReading,
  type RelativeIndexInput,
} from "../packages/engine/src/relativeIndex.js";
import type { ListoneAppealIndex } from "./ui/listone.js";
import {
  DECLARED_INPUTS_WITHOUT_SOURCE,
  SLOT_4_SOURCE_MOVED,
  VALUE_SLOT_ORDER,
  VISIBLE_VALUE_SLOT_IDS,
  valueBoxReading,
  type ValueBoxReading,
  type ValueSlotId,
} from "./valueBox.js";
import {
  DECLARED_INPUT_TEXT,
  VALUE_MISSING_TEXT,
  VALUE_SLOT_LABELS,
  VALUE_UNKNOWN,
  absoluteChainText,
  valueBoxHtml,
  missingDeclaredInputsText,
  valueBoxNoteText,
  valueBoxSpoken,
  valueNumberText,
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
//
// ── DUE SLOT NON ARRIVANO PIÙ A SCHERMO (Pico, 2026-08-29) ──────────────────
//
// L'ISTRUZIONE, VERBATIM: «Nascondi valore assoluto e valore relativo senza
// cancellare niente.»
//
// COSA CAMBIA IN QUESTO FILE, ed è una riga sola di differenza ripetuta in
// dodici punti: le asserzioni sulla RESA dei due slot in crediti — l'HTML di
// `valueBoxHtml()` e la lettura vocale di `valueBoxSpoken()` — sono INVERTITE,
// con la data accanto a ognuna. Non sono state cancellate, ed è una scelta e
// non un vezzo: un'asserzione tolta lascia il file senza memoria del fatto che
// quel testo, un tempo, doveva esserci; invertita, il file dice quando è
// cambiato e diventa rossa il giorno in cui la resa torna com'era senza che
// nessuno l'abbia deciso. Riaccendendo i due id in `VISIBLE_VALUE_SLOT_IDS`
// questi dodici tornano rossi in blocco, ed è esattamente il promemoria che
// serve a chi li riaccende.
//
// COSA NON CAMBIA, E DEVE RESTARE VERDE: tutte le asserzioni sulle LETTURE.
// `reading.slots["valore-assoluto"]`, `reading.slots["valore-relativo"]`,
// `reading.absoluteChain`, `reading.absoluteBelowCostFloor`,
// `reading.relativePriceBound` e i loro motivi di assenza sono rimasti
// identici, riga per riga, ed è la metà vincolante dell'istruzione: i due
// numeri si continuano a calcolare e si continuano a provare. Lo stesso vale
// per le funzioni di testo prese da sole — `valueSlotText()` e
// `valueSlotWhyText()` sanno ancora rendere tutti e quattro gli slot, e i test
// che le interrogano direttamente sui due nascosti sono rimasti dov'erano.
// Quello che è cambiato è UNA cosa: quali celle la griglia costruisce.

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
  return {
    score,
    quality: QUALITY,
    recipe: RECIPE,
    components: { appetibilitaBase: score },
  };
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
const DRAINED_LOG = buildLog([
  ...fillRole(SELF, "D", 9, 25),
  ...fillRole(SELF, "C", 9, 25),
]);

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
        playerIds: [
          "a_uno",
          "a_due",
          "a_tre",
          "a_non_valutato",
          "a_zero",
          "a_muto",
        ],
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

// ── GLI INGRESSI DELL'INDICE RELATIVO ───────────────────────────────────────
// Lo slot 2 è un PUNTEGGIO DA 0 A 100 (decisione di Pico, 2026-08-24) misurato
// sullo stesso ordine che costruisce le fasce (`TIER_BOOK`): la quota degli
// altri liberi ordinati del ruolo che il chiamato precede. Le righe di listone
// che entrano nella scala sono gli stessi sei `a_*` dell'ordine più un
// centrocampista, così il conteggio per ruolo non è degenere — e con sei
// ordinati liberi la scala si legge a occhio: 100, 80, 60, 40, 20, 0.

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

function readingWithEngine(
  playerId: string,
  appealIndex?: ListoneAppealIndex,
): ValueBoxReading {
  return valueBoxReading({
    called: { playerId, role: "A" },
    appealIndex,
    call: engineCall(playerId),
    missingDeclaredInputs: [],
    relative: RELATIVE,
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
    relative: RELATIVE,
    absolute: ABSOLUTE_UNDECLARED,
    table: tableOf(),
  });
}

/**
 * GLI SLOT CHE OGGI NON SI VEDONO, DERIVATI e non scritti a mano: è la
 * differenza fra l'ordine completo del record e la lista dei visibili. Scritti
 * a mano sarebbero una terza lista da tenere allineata alle altre due, e il
 * giorno in cui uno dei due torna a schermo resterebbe qui a pretendere che sia
 * nascosto — cioè il test direbbe il contrario del prodotto restando verde.
 */
const HIDDEN_VALUE_SLOT_IDS: readonly ValueSlotId[] = VALUE_SLOT_ORDER.filter(
  (id) => !VISIBLE_VALUE_SLOT_IDS.includes(id),
);

describe("riquadro del valore — i quattro numeri", () => {
  it("porta quattro slot, sempre, nell'ordine deciso", () => {
    expect(VALUE_SLOT_ORDER).toEqual([
      "indice-assoluto",
      "indice-relativo",
      "valore-assoluto",
      "valore-relativo",
    ]);
    const reading = readingWithEngine("a_uno", index(72));
    expect(Object.keys(reading.slots).sort()).toEqual(
      [...VALUE_SLOT_ORDER].sort(),
    );
  });

  // ── LA RESA È UN SOTTOINSIEME, E LE LETTURE RESTANO QUATTRO ────────────────
  // «Nascondi valore assoluto e valore relativo senza cancellare niente.»
  // — Pico, 2026-08-29. I tre test qui sotto sono le tre metà di quella frase:
  // che cosa si vede, che cosa NON si vede più, e che cosa si continua a
  // calcolare comunque.

  it("gli slot visibili sono un SOTTOINSIEME dell'ordine dichiarato, e ne rispettano l'ordine", () => {
    // Il record decide QUALI slot esistono e in che ordine si leggono; la lista
    // dei visibili decide soltanto quali arrivano a schermo. Se si scollasse —
    // un id che il record non dichiara, o due celle rese in un ordine che il
    // record non prevede — il riquadro renderebbe qualcosa che nessuno ha
    // deciso, e questa riga è il posto in cui non può succedere in silenzio.
    for (const id of VISIBLE_VALUE_SLOT_IDS) {
      expect(VALUE_SLOT_ORDER, id).toContain(id);
    }
    expect(VISIBLE_VALUE_SLOT_IDS.length).toBeLessThanOrEqual(
      VALUE_SLOT_ORDER.length,
    );
    expect([...VISIBLE_VALUE_SLOT_IDS]).toEqual(
      VALUE_SLOT_ORDER.filter((id) => VISIBLE_VALUE_SLOT_IDS.includes(id)),
    );
    // E oggi sono esattamente questi due: la lista è un fatto di prodotto, non
    // un dettaglio, quindi si scrive invece di dedurla. Chi riaccende i due
    // slot in crediti trova questa riga rossa, che è il promemoria giusto.
    expect([...VISIBLE_VALUE_SLOT_IDS]).toEqual([
      "indice-assoluto",
      "indice-relativo",
    ]);
    expect([...HIDDEN_VALUE_SLOT_IDS]).toEqual([
      "valore-assoluto",
      "valore-relativo",
    ]);
  });

  it("la resa porta ANCORA i due indici, con la loro cella intera", () => {
    // Il rovescio dell'istruzione, e la ragione per cui va provato: nascondere
    // due celle non può portarsi via anche le altre. Le due che restano
    // conservano la forma piena — id della cella, numero, riga del perché.
    const reading = readingWithEngine("a_uno", index(72));
    const html = valueBoxHtml(reading);
    for (const id of ["indice-assoluto", "indice-relativo"] as const) {
      expect(html, id).toContain(`id="value-box-cell-${id}"`);
      expect(html, id).toContain(`id="value-box-number-${id}"`);
      expect(html, id).toContain(`id="value-box-why-${id}"`);
      expect(html, id).toContain(VALUE_SLOT_LABELS[id]);
    }
    // I numeri veri dei due indici sono lì: 72 dal listone, 100 dalla scala.
    expect(html).toContain(">72<");
    expect(html).toContain(">100<");
    // E le celle rese sono due, non quattro: il conteggio si legge dagli id.
    expect(html.match(/class="value-box__cell/g)?.length).toBe(
      VISIBLE_VALUE_SLOT_IDS.length,
    );
  });

  it("i due slot in crediti sono CALCOLATI come prima, e soltanto non resi", () => {
    // LA METÀ VINCOLANTE DELL'ISTRUZIONE, in un test solo: «senza cancellare
    // niente». La lettura porta i quattro slot con i loro valori veri, la
    // catena del valore assoluto e il vincolo del prezzo relativo; la resa ne
    // mostra due. Se qualcuno spegnesse i motori invece della sola resa —
    // scorciatoia comoda e sbagliata — questo test diventerebbe rosso mentre
    // lo schermo resterebbe identico, che è esattamente il difetto da cui
    // guardarsi.
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: BASE_A,
      unit: "crediti",
    });
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: FRESH_TABLE_PRICE,
      unit: "crediti",
    });
    expect(reading.absoluteChain).not.toBeNull();
    expect(reading.relativePriceBound).toBe("tetto-del-piu-ricco");
    // Le funzioni di testo sanno ancora renderli tutti e quattro: non è la
    // resa dello slot a essere sparita, è la cella a non essere costruita.
    for (const id of HIDDEN_VALUE_SLOT_IDS) {
      expect(valueSlotText(reading.slots[id]), id).not.toBe("");
      expect(valueSlotWhyText(id, reading.slots[id], reading), id).not.toBe("");
    }
    // ...e a schermo nessuna delle due compare, in nessuna delle sue parti.
    const html = valueBoxHtml(reading);
    for (const id of HIDDEN_VALUE_SLOT_IDS) {
      expect(html, id).not.toContain(`value-box-cell-${id}`);
      expect(html, id).not.toContain(VALUE_SLOT_LABELS[id]);
    }
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
      relative: RELATIVE,
      absolute: ABSOLUTE,
      table,
    });

    // È esattamente ciò che `relativePriceReading()` risponde su QUESTO tavolo,
    // non un suo parente arrotondato e non un numero riscritto qui.
    const price = relativePriceReading({
      state: table.state,
      role: "A",
      selfId: SELF,
    });
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
      relative: RELATIVE,
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
    // INVERTITA il 2026-08-29 (Pico: «Nascondi valore assoluto e valore
    // relativo senza cancellare niente»): la catena resta CALCOLATA e provata
    // dalle quattro righe qui sopra, che sono la sostanza di questo test; a
    // schermo non arriva più, perché la sua cella non c'è.
    expect(valueBoxHtml(reading)).not.toContain("210 cr sul ruolo / 7 slot");
    // E la catena è ancora quella giusta anche RESA: la funzione che scrive
    // quella riga non è stata toccata, le manca solo la cella dove finire.
    expect(absoluteChainText(reading)).toBe("210 cr sul ruolo / 7 slot · fascia 1");
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
    expect(reading.slots["indice-assoluto"]).toEqual({
      kind: "numero",
      value: 72,
      unit: "indice",
    });
    expect(reading.indexQuality).toBe(QUALITY);
    expect(reading.indexRecipe).toBe(RECIPE);
  });

  it("l'indice relativo è un PUNTEGGIO 0–100, nella stessa unità dello slot 1", () => {
    // `a_uno` è il primo dell'ordine e nessuno è stato preso: precede tutti e
    // cinque gli altri liberi ordinati, quindi 100. L'unità è `indice`, come lo
    // slot 1: il record del 2026-08-21 dichiara DUE unità e questo riquadro non
    // ne inventa una terza (fino al 2026-08-24 ne aveva una, `posizione`, ed è
    // uscita insieme alla forma che la chiedeva).
    const reading = readingWithEngine("a_uno", index(72));
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 100,
      unit: "indice",
    });
    expect(valueSlotText(reading.slots["indice-relativo"])).toBe("100");
    expect(reading.relativePopulation).toMatchObject({
      role: "A",
      freeInRole: 6,
      poolInRole: 6,
      freeRankedInRole: 6,
    });
    // La popolazione arriva a schermo: «100» senza «su quanti» non dice se vale
    // su due giocatori o su quaranta. Ed è «ALTRI», perché il confronto esclude
    // lui: il denominatore del rapporto è 5, non 6.
    expect(valueBoxHtml(reading)).toContain("su 5 altri liberi ordinati");
  });

  it("i sei ordinati liberi occupano la scala intera, capi compresi", () => {
    // «Un punteggio da 0 a 100» non è una promessa se nessuno arriva ai capi.
    const atteso: Readonly<Record<string, number>> = {
      a_uno: 100,
      a_due: 80,
      a_tre: 60,
      a_non_valutato: 40,
      a_zero: 20,
      a_muto: 0,
    };
    for (const [playerId, value] of Object.entries(atteso)) {
      const reading = valueBoxReading({
        called: { playerId, role: "A" },
        appealIndex: index(50),
        call: null,
        missingDeclaredInputs: [],
        relative: RELATIVE,
        absolute: ABSOLUTE,
        table: tableOf(),
      });
      expect(reading.slots["indice-relativo"], playerId).toEqual({
        kind: "numero",
        value,
        unit: "indice",
      });
    }
  });

  it("l'indice relativo SALE quando comprano qualcuno sopra di lui", () => {
    // `a_tre` precede tre dei cinque altri liberi ordinati: 60. Comprato
    // `a_uno`, che gli sta sopra, ne precede ancora tre ma gli altri sono
    // quattro: 75. Nessuna formula in mezzo — uno in meno al denominatore.
    const before = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: relativeOn(),
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    const after = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: relativeOn(buildLog([buy("a_uno", "A", TEAMS[1]!, 30)])),
      absolute: ABSOLUTE,
      table: tableOf(),
    });

    expect(before.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 60,
      unit: "indice",
    });
    expect(after.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 75,
      unit: "indice",
    });
    // La riga sotto il numero segue la popolazione: cinque altri, poi quattro.
    expect(valueBoxHtml(before)).toContain("su 5 altri liberi ordinati");
    expect(valueBoxHtml(after)).toContain("su 4 altri liberi ordinati");
    // E il VALORE ASSOLUTO non si è mosso di un credito: è la differenza fra i
    // due slot, e se sparisse uno dei due numeri starebbe mentendo.
    expect(after.slots["valore-assoluto"]).toEqual(
      before.slots["valore-assoluto"],
    );
  });

  it("UNICO LIBERO ORDINATO: `n/d` col motivo, mai 0 e mai 100", () => {
    // IL CASO LIMITE, dal lato di chi guarda. Presi cinque dei sei ordinati,
    // l'ultimo è primo E ultimo: la stessa regola gli imporrebbe 100 e 0. La
    // cella dice `n/d` e dice perché, invece di scegliere uno dei due.
    const log = buildLog([
      buy("a_uno", "A", TEAMS[1]!, 30),
      buy("a_due", "A", TEAMS[2]!, 20),
      buy("a_tre", "A", TEAMS[3]!, 15),
      buy("a_non_valutato", "A", TEAMS[4]!, 10),
      buy("a_zero", "A", TEAMS[5]!, 5),
    ]);
    const reading = valueBoxReading({
      called: { playerId: "a_muto", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: relativeOn(log),
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "assente",
      reason: "indice-relativo-unico-libero",
    });
    expect(valueSlotText(reading.slots["indice-relativo"])).toBe(VALUE_UNKNOWN);
    expect(valueBoxHtml(reading)).toContain("unico libero ordinato");
    // ...e la metà misurabile resta: uno solo, ed è la ragione del `n/d`.
    expect(reading.relativePopulation).toMatchObject({ freeRankedInRole: 1 });
  });

  it("senza ordine la cella nomina L'ORDINE, non una causa che non conosce", () => {
    // IL MOTIVO A MONTE NON ARRIVA FIN QUI, e la cella non finge di averlo. Il
    // libro delle fasce può mancare per CINQUE ragioni (src/tierOrdering.ts,
    // `TierBandUnavailable`); di là dal confine il motore riceve `book: null` e
    // può dire una cosa sola. Prima questa cella diceva «il listone non porta
    // l'indice», che è vero in due casi su cinque: con l'ordine rifiutato, con
    // due ricette o senza squadre al tavolo il listone l'indice ce l'ha, e sulla
    // stessa scheda il pannello FASCIA avrebbe detto il contrario. Questo test è
    // il posto in cui quella frase non può tornare in silenzio.
    const state: AuctionState = stateOf(buildLog([]));
    const reading = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: {
        ladder: freeLadder({
          pool: [...RELATIVE_POOL],
          book: null,
          purchasedPlayerIds: state.purchasedPlayerIds,
        }),
        state,
        selfId: SELF,
      },
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "assente",
      reason: "indice-relativo-senza-ordine",
    });
    const html = valueBoxHtml(reading);
    expect(html).toContain("nessun ordine dichiarato");
    // La cella dello slot 2 non afferma nulla sul listone. La prima cella sì —
    // e lì è un fatto suo, perché l'indice della riga chiamata lo vede.
    expect(
      valueSlotWhyText(
        "indice-relativo",
        reading.slots["indice-relativo"],
        reading,
      ),
    ).not.toContain("non porta l'indice");
    // ...e la popolazione resta misurata: contare righe non ha bisogno di ordine.
    expect(reading.relativePopulation).toMatchObject({
      poolInRole: 6,
      freeInRole: 6,
    });
  });

  it("il denominatore conta i liberi ORDINATI, non i liberi: sostituirlo cambia il numero", () => {
    // LA SCELTA DEL DENOMINATORE, PINNATA. Nel listone del ruolo entrano due
    // righe che l'ordine NON contiene (nessun verdetto): i liberi diventano
    // otto, gli ordinati restano sei. Se il numero usasse `freeInRole` il
    // punteggio di `a_tre` sarebbe 100 x 5/7 = 71,43; con `freeRankedInRole` è
    // 60. I due numeri sono diversi, quindi questo test muore se qualcuno
    // sostituisce la popolazione — che è precisamente ciò che prima nessun test
    // faceva.
    const conMuti = [
      ...RELATIVE_POOL,
      { playerId: "a_senza_verdetto_1", role: "A" as Role },
      { playerId: "a_senza_verdetto_2", role: "A" as Role },
    ];
    const state: AuctionState = stateOf(buildLog([]));
    const reading = valueBoxReading({
      called: { playerId: "a_tre", role: "A" },
      appealIndex: index(50),
      call: null,
      missingDeclaredInputs: [],
      relative: {
        ladder: freeLadder({
          pool: conMuti,
          book: TIER_BOOK,
          purchasedPlayerIds: state.purchasedPlayerIds,
        }),
        state,
        selfId: SELF,
      },
      absolute: ABSOLUTE,
      table: tableOf(),
    });
    expect(reading.relativePopulation).toMatchObject({
      freeInRole: 8,
      freeRankedInRole: 6,
    });
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "numero",
      value: 60,
      unit: "indice",
    });
    expect(reading.slots["indice-relativo"]).not.toEqual({
      kind: "numero",
      value: (100 * 5) / 7,
      unit: "indice",
    });
    // ...e la riga a schermo conta la stessa popolazione del numero: se dicesse
    // «su 7 altri liberi» la frazione mostrata non sarebbe quella calcolata.
    expect(valueBoxHtml(reading)).toContain("su 5 altri liberi ordinati");
  });

  it("il valore relativo si muove con la serata, il valore assoluto no", () => {
    // Stesso giocatore, stesso valore dichiarato: cambia solo ciò che il tavolo
    // ha fatto. Comprare le alternative del ruolo toglie il piano B e con esso
    // il costo opportunità, quindi il tetto derivato si muove.
    const fresh = engineCall("a_uno", buildLog([]), "prudente");
    const afterMarket = engineCall(
      "a_uno",
      buildLog([
        buy("a_due", "A", TEAMS[1]!, 20),
        buy("a_tre", "A", TEAMS[2]!, 8),
      ]),
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
    expect(tight.numbers!.fairToMeMaxEffective).toBeLessThan(
      tight.declaredValue!,
    );
    expect(tight.numbers!.fairToMeMaxEffective).toBe(tight.numbers!.maxSafe);
  });

  it("IL TETTO DEL TAVOLO è rispettato per costruzione: il valore relativo non supera il massimo dei max bid veri", () => {
    const scenarios: readonly (readonly [
      string,
      ReturnType<typeof buildLog>,
    ])[] = [
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
      expect(call.numbers!.fairToMeMaxEffective, label).toBeLessThanOrEqual(
        tableCapacity,
      );
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
      table: tableOf(),
    });
    for (const id of VALUE_SLOT_ORDER) {
      expect(reading.slots[id]).toEqual({
        kind: "assente",
        reason: "nessun-chiamato",
      });
      expect(valueSlotText(reading.slots[id])).toBe(VALUE_UNKNOWN);
    }
    // Nessun vincolo del prezzo relativo senza il suo numero: un vincolo che
    // non lega niente sarebbe una frase su un numero che non c'è.
    expect(reading.relativePriceBound).toBeNull();
  });

  it("listone senza indice: n/d col motivo, mai uno zero e mai un punto medio", () => {
    const reading = readingWithEngine("a_uno", undefined);
    expect(reading.slots["indice-assoluto"]).toEqual({
      kind: "assente",
      reason: "indice-assente",
    });
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
  const BOOK_CON_NON_VALUTATO = anchorBook([
    ...ANCHORS,
    anchor("a_non_valutato", "A", 18),
  ]);

  /** Valutato ZERO: una dichiarazione a tutti gli effetti, non un buco. */
  const BOOK_CON_ZERO = anchorBook([...ANCHORS, anchor("a_zero", "A", 18)]);
  const VALUES_CON_ZERO = valueBookOf([...VALUES.all, value("a_zero", 0)]);

  it("NON DICHIARATO: quotato ma mai valutato — n/d, e il motivo è «non hai dichiarato un valore»", () => {
    const call = engineCallWith(
      "a_non_valutato",
      BOOK_CON_NON_VALUTATO,
      VALUES,
    );
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
      relative: RELATIVE,
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
      relative: RELATIVE,
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
      relative: RELATIVE,
      absolute: ABSOLUTE_UNDECLARED,
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "assente",
      reason: "ruolo-senza-target",
    });
    expect(reading.absoluteChain).toBeNull();
    const html = valueBoxHtml(reading);
    // INVERTITA il 2026-08-29 (istruzione di Pico in testa al file): il motivo
    // resta quello giusto NELLA LETTURA — l'asserzione qui sopra non è stata
    // toccata — e la frase esiste ancora per quel motivo; è la cella a non
    // essere più a schermo.
    expect(html).not.toContain("manca il tuo target di ruolo");
    expect(
      valueSlotWhyText(
        "valore-assoluto",
        reading.slots["valore-assoluto"],
        reading,
      ),
    ).toBe("manca il tuo target di ruolo");
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
      table: tableOf(),
    });
    expect(reading.slots["valore-assoluto"]).toEqual({
      kind: "numero",
      value: 0,
      unit: "crediti",
    });
    expect(valueSlotText(reading.slots["valore-assoluto"])).toBe("0 cr");
    // INVERTITA il 2026-08-29 (istruzione di Pico in testa al file). Il punto
    // del test resta intero e sta nella riga qui sopra: `0` è un numero, non un
    // `n/d`, e la resa lo scrive «0 cr». Quello che è cambiato è che quella
    // cella non è più nella griglia.
    expect(valueBoxHtml(reading)).not.toContain(">0 cr<");
    // SOTTO IL CREDITO MINIMO, e lo DICE invece di aggiustarlo: nessun clamp
    // al pavimento, che sarebbe una scelta silenziosa. La LETTURA lo dichiara
    // come prima; a schermo la riga non arriva più (invertita il 2026-08-29).
    expect(reading.absoluteBelowCostFloor).toBe(true);
    expect(absoluteChainText(reading)).toContain("sotto il credito minimo");
    expect(valueBoxHtml(reading)).not.toContain("sotto il credito minimo");
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
    // INVERTITA il 2026-08-29 (istruzione di Pico in testa al file): i due
    // esiti restano DUE nella lettura — le due asserzioni qui sopra, intatte —
    // ma nessuno dei due arriva più in una cella.
    expect(html).not.toContain("manca il tuo target di ruolo");
    expect(html).not.toContain(`${FRESH_TABLE_PRICE} cr`);
    // L'indice assoluto, che una sorgente ce l'ha, resta un numero vero — e
    // resta A SCHERMO: è uno dei due slot che l'istruzione lascia visibili.
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
    expect(valueBoxNoteText(shipped)).not.toContain(
      "i tuoi valori per giocatore",
    );
    expect(valueBoxNoteText(shipped)).not.toContain(
      "il tuo profilo di rischio",
    );
  });
});

describe("riquadro del valore — lo SLOT 4 è il prezzo del tavolo, e le sue assenze sono sue", () => {
  // Le cinque scene in cui «quanto costa vincere» non esiste, ognuna col
  // proprio motivo e nessuna con un numero di ripiego. Sono le stesse cinque
  // che `relativeValue.ts` dichiara: qui si prova che il riquadro le TRADUCE
  // una a una invece di accorparle in un `n/d` muto.
  //
  // DAL 2026-08-29 LA TRADUZIONE SI MISURA SULLA FUNZIONE DI TESTO invece che
  // sull'HTML (istruzione di Pico in testa al file): la cella dello slot 4 non
  // è più nella griglia, ma le cinque frasi restano cinque, restano distinte e
  // restano quelle giuste. Le asserzioni sull'HTML sono invertite accanto,
  // così il file dice anche che a schermo non ci sono più — e torna rosso se
  // ricomparissero senza che nessuno l'abbia deciso.

  /** La riga che lo slot 4 direbbe, presa dalla funzione che la scrive. */
  function why4(reading: ValueBoxReading): string {
    return valueSlotWhyText(
      "valore-relativo",
      reading.slots["valore-relativo"],
      reading,
    );
  }

  function slot4(
    log: ReturnType<typeof buildLog>,
    selfId = SELF,
  ): ValueBoxReading {
    return valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: { state: stateOf(log), selfId },
      relative: RELATIVE,
    });
  }

  it("IL RUOLO PIENO PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi", () => {
    const reading = slot4(buildLog(fillRole(SELF, "A", 7, 1)));
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "ruolo-pieno-per-me",
    });
    expect(reading.relativePriceBound).toBeNull();
    expect(why4(reading)).toContain("il tuo ruolo è pieno");
    // Invertita il 2026-08-29: la frase c'è, la cella no.
    expect(valueBoxHtml(reading)).not.toContain("il tuo ruolo è pieno");
  });

  it("IL MIO BUDGET BLOCCATO dalla riserva dura: nessuna offerta valida, nessun prezzo", () => {
    const log = buildLog(fillRole(SELF, "D", 9, 54));
    expect(maxSafe(stateOf(log).teams[SELF]!, "A").biddable).toBe(false);
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "non-posso-offrire",
    });
    expect(why4(reading)).toContain("bloccato dalla riserva");
    // Invertita il 2026-08-29: la frase c'è, la cella no.
    expect(valueBoxHtml(reading)).not.toContain("bloccato dalla riserva");
  });

  it("UN SOLO rivale capiente: il secondo non esiste, e non si sostituisce col primo", () => {
    const log = buildLog(
      TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 7, 1)),
    );
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "un-solo-rivale-eleggibile",
    });
    expect(why4(reading)).toContain("non c'è un secondo");
    // Invertita il 2026-08-29: la frase c'è, la cella no.
    expect(valueBoxHtml(reading)).not.toContain("non c'è un secondo");
  });

  it("NESSUN rivale capiente: non c'è nessuna asta da vincere", () => {
    const log = buildLog(
      TEAMS.slice(1).flatMap((team) => fillRole(team, "A", 7, 1)),
    );
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "nessun-rivale-eleggibile",
    });
    expect(why4(reading)).toContain("nessun rivale può ancora comprarlo");
    // Invertita il 2026-08-29: la frase c'è, la cella no.
    expect(valueBoxHtml(reading)).not.toContain(
      "nessun rivale può ancora comprarlo",
    );
  });

  it("LA MIA SQUADRA NON È A QUESTO TAVOLO: non si sceglie una squadra a caso", () => {
    const reading = slot4(buildLog([]), "squadra_che_non_esiste");
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "assente",
      reason: "tavolo-senza-la-mia-squadra",
    });
    expect(why4(reading)).toContain("non è a questo tavolo");
    // Invertita il 2026-08-29: la frase c'è, la cella no.
    expect(valueBoxHtml(reading)).not.toContain("non è a questo tavolo");
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
    expect(
      valueSlotWhyText(
        "valore-relativo",
        reading.slots["valore-relativo"],
        reading,
      ),
    ).toBe("il tetto del tavolo: nessuno arriva più in alto");

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
        relative: RELATIVE,
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
    const log = buildLog(
      TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 1, 200)),
    );
    const reading = slot4(log);
    expect(reading.slots["valore-relativo"]).toEqual({
      kind: "numero",
      value: 275,
      unit: "crediti",
    });
    expect(reading.relativePriceBound).toBe("scala-dei-rivali");
    expect(
      valueSlotWhyText(
        "valore-relativo",
        reading.slots["valore-relativo"],
        reading,
      ),
    ).toBe("il secondo max bid al tavolo, +1");
  });

  it("TETTO MAX_SAFE: la riga dice che il tetto è il MIO, non quello del tavolo", () => {
    // Il terzo caso non è un doppione del secondo: accorparli direbbe a chi
    // legge che nessuno può salire, mentre è lui a non poter salire.
    const reading = slot4(DRAINED_LOG);
    expect(reading.relativePriceBound).toBe("tetto-max-safe");
    expect(
      valueSlotWhyText(
        "valore-relativo",
        reading.slots["valore-relativo"],
        reading,
      ),
    ).toBe("il tuo max bid: il tavolo chiede di più");
    // Le tre frasi sono tre, e nessuna coppia collassa.
    expect(new Set(Object.values(RELATIVE_PRICE_BOUND_TEXT)).size).toBe(3);
  });

  it("il numero si muove quando deve: stesso giocatore, tavolo diverso, prezzo diverso", () => {
    const fresh = slot4(buildLog([]));
    const later = slot4(
      buildLog(
        TEAMS.slice(1, 7).flatMap((team) => fillRole(team, "A", 1, 200)),
      ),
    );
    expect(fresh.slots["valore-assoluto"]).toEqual(
      later.slots["valore-assoluto"],
    );
    expect(later.slots["valore-relativo"]).not.toEqual(
      fresh.slots["valore-relativo"],
    );
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
      relative: RELATIVE,
      table,
    };
    const senzaCall = valueBoxReading({ ...common, call: null });
    const conCall = valueBoxReading({ ...common, call: engineCall("a_uno") });
    expect(conCall.slots["valore-relativo"]).toEqual(
      senzaCall.slots["valore-relativo"],
    );
    expect(conCall.slots["valore-assoluto"]).toEqual(
      senzaCall.slots["valore-assoluto"],
    );
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
        table: tableOf(),
      }),
    ];
    for (const reading of readings) {
      // «Nessun consiglio» è la resa a schermo del divieto, non la sua
      // violazione: si toglie prima di misurare, come fa e2e/tier-band.spec.ts.
      const text =
        `${valueBoxHtml(reading)} ${valueBoxNoteText(reading)} ${valueBoxSpoken(reading)}`
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
    const numbers = VALUE_SLOT_ORDER.map((id) => reading.slots[id]).flatMap(
      (slot) => (slot.kind === "numero" ? [slot.value] : []),
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
      // Uno scalare secco, con la virgola italiana quando il numero non è
      // intero (210/7 lo è, 200/9 no; il punteggio relativo quasi mai). Mai
      // «fra 55 e 70», e nessun segno di forma oltre `cr`: dal 2026-08-24 lo
      // slot 2 è un punteggio e non porta più l'ordinale che portava il rango.
      expect(valueSlotText(slot)).toMatch(/^-?\d+(,\d)?( cr)?$/);
    }
  });
});

describe("riquadro del valore — la riga che manca, quando manca davvero", () => {
  // IL RAMO NON VUOTO DI `missingDeclaredInputsText()` NON ERA PROVATO DA
  // NESSUNO. Il commento accanto alla funzione dichiara «la funzione resta, e
  // resta provata»: era vero per il ramo vuoto — che l'app percorre sempre — e
  // falso per l'altro, l'unico che scrive una frase. Una review avversariale
  // ha sostituito quella frase con «manca un dato.» e la suite è rimasta verde.
  // Fra correggere il commento e provare la funzione si è scelto di provarla:
  // la frase è la riga che tornerà a schermo il giorno in cui una cella
  // dipenderà di nuovo da una dichiarazione di Pico, e un commento che promette
  // una copertura è un'asserzione — si aggiorna o si inverte, non si annacqua.
  //
  // La lettura passa dalla funzione VERA e non da un oggetto scritto a mano:
  // `called` c'è, `call` è `null`, e in quel ramo `valueBoxReading()` porta la
  // lista fino a `ValueBoxReading.missingDeclaredInputs` (src/valueBox.ts).

  function readingWithMissing(
    missing: readonly ("valori-dichiarati" | "profilo-di-rischio")[],
  ) {
    return valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: missing,
      absolute: ABSOLUTE,
      table: tableOf(),
      relative: RELATIVE,
    });
  }

  it("DUE dichiarazioni mancanti: le nomina tutte e due, e le lega con «e»", () => {
    const reading = readingWithMissing(
      DECLARED_INPUTS_WITHOUT_SOURCE as readonly (
        | "valori-dichiarati"
        | "profilo-di-rischio"
      )[],
    );
    expect(reading.missingDeclaredInputs).toEqual([
      "valori-dichiarati",
      "profilo-di-rischio",
    ]);
    expect(missingDeclaredInputsText(reading)).toBe(
      "i tuoi valori per giocatore e il tuo profilo di rischio: ancora fuori dall'app.",
    );
    // NOMINA LA COSA CHE MANCA, una per una: «manca un dato» sarebbe la cella
    // vuota travestita da frase, ed è la mutazione che restava verde.
    expect(missingDeclaredInputsText(reading)).toContain(
      DECLARED_INPUT_TEXT["valori-dichiarati"],
    );
    expect(missingDeclaredInputsText(reading)).toContain(
      DECLARED_INPUT_TEXT["profilo-di-rischio"],
    );
    // E arriva in testata, che è dove la riga si legge.
    expect(valueBoxNoteText(reading)).toContain(
      missingDeclaredInputsText(reading),
    );
  });

  it("UNA sola dichiarazione mancante: la nomina, e non aggiunge una «e» senza secondo", () => {
    const reading = readingWithMissing(["profilo-di-rischio"]);
    expect(missingDeclaredInputsText(reading)).toBe(
      "il tuo profilo di rischio: ancora fuori dall'app.",
    );
    expect(missingDeclaredInputsText(reading)).not.toContain(" e ");
  });

  it("nessuna dichiarazione mancante: stringa vuota, e la testata non la nomina", () => {
    // Il ramo che l'app percorre oggi. Resta pinnato accanto agli altri due,
    // così i due esiti della funzione si leggono insieme.
    const reading = readingWithMissing([]);
    expect(missingDeclaredInputsText(reading)).toBe("");
    expect(valueBoxNoteText(reading)).not.toContain("ancora fuori dall'app");
  });
});

describe("riquadro del valore — chi ascolta sente quello che chi guarda legge", () => {
  // LA RIGA DEL VINCOLO NON PUÒ FERMARSI ALLO SCHERMO. Prima di quella corsia
  // lo slot 4 recitava `n/d` e la lettura vocale non perdeva niente; poi ha
  // recitato un numero, e a tavolo fresco è lo STESSO numero su ogni scheda di
  // ogni ruolo. Senza la riga del vincolo chi usa lo screen reader sentirebbe
  // per minuti la stessa cifra senza mai sapere che misura il tavolo.
  //
  // DAL 2026-08-29 QUEL NUMERO NON SI SENTE PIÙ, e non è una regressione di
  // questa regola: è la stessa regola applicata all'istruzione di Pico in
  // testa al file. I due slot in crediti non sono più a schermo, quindi una
  // lettura vocale che continuasse a recitarli descriverebbe un riquadro che
  // chi guarda non vede — «riparato per l'udito e non per gli occhi» è lo
  // stesso difetto letto allo specchio. Il titolo di questo describe resta
  // vero alla lettera: chi ascolta sente quello che chi guarda legge, e adesso
  // sono due celle invece di quattro.
  //
  // Le tre asserzioni invertite qui sotto non tolgono la garanzia: la
  // COPPIA numero + vincolo resta provata sulla lettura e sulle funzioni di
  // testo (describe «lo SLOT 4 è il prezzo del tavolo»), pronta a tornare
  // udibile insieme alla cella.

  function spokenOf(log = buildLog([])): string {
    return valueBoxSpoken(
      valueBoxReading({
        called: { playerId: "a_uno", role: "A" },
        appealIndex: index(72),
        call: null,
        missingDeclaredInputs: [],
        absolute: ABSOLUTE,
        table: tableOf(log),
        relative: RELATIVE,
      }),
    );
  }

  it("TETTO DEL TAVOLO: il numero e il suo vincolo non si sentono più — la cella non c'è", () => {
    // INVERTITA il 2026-08-29 (istruzione di Pico in testa al file). Il numero
    // e il vincolo restano nella LETTURA — provati dal describe dello slot 4 —
    // e non arrivano più né agli occhi né all'udito: le due superfici dicono la
    // stessa cosa, che è la garanzia che questo describe protegge.
    const spoken = spokenOf();
    expect(spoken).not.toContain(`${FRESH_TABLE_PRICE} cr`);
    expect(spoken).not.toContain(
      RELATIVE_PRICE_BOUND_TEXT["tetto-del-piu-ricco"],
    );
  });

  it("SCALA DEI RIVALI: cambia il tavolo, e la lettura vocale resta muta su quel numero", () => {
    // Invertita il 2026-08-29, stessa ragione. La riga `tetto-del-piu-ricco`
    // era già negativa e resta negativa: il senso originale — le tre frasi non
    // collassano — vive intero nel describe dello slot 4.
    const spoken = spokenOf(
      buildLog(TEAMS.slice(1, 7).flatMap((t) => fillRole(t, "A", 1, 200))),
    );
    expect(spoken).not.toContain("275 cr");
    expect(spoken).not.toContain(RELATIVE_PRICE_BOUND_TEXT["scala-dei-rivali"]);
    expect(spoken).not.toContain(
      RELATIVE_PRICE_BOUND_TEXT["tetto-del-piu-ricco"],
    );
  });

  it("ogni cella parlata dice nome, numero e riga: nessuna resta muta", () => {
    // La stessa regola delle celle a schermo, e vale per tutte quelle che si
    // vedono: un `n/d` senza il suo motivo è un silenzio, non un'informazione.
    // Il ciclo gira su `VISIBLE_VALUE_SLOT_IDS` dal 2026-08-29 — le celle
    // parlate sono le stesse rese, mai una di più né una di meno.
    const reading = valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE_UNDECLARED,
      table: tableOf(),
      relative: RELATIVE,
    });
    const spoken = valueBoxSpoken(reading);
    for (const id of VISIBLE_VALUE_SLOT_IDS) {
      const slot = reading.slots[id];
      expect(spoken, id).toContain(VALUE_SLOT_LABELS[id]);
      expect(spoken, id).toContain(valueSlotText(slot));
      expect(spoken, id).toContain(valueSlotWhyText(id, slot, reading));
    }
    // ...e le due nascoste non si sentono NEPPURE COL LORO NOME: mezza cella
    // parlata — l'etichetta senza il numero — sarebbe peggio di nessuna.
    // Invertita il 2026-08-29 insieme alla riga del motivo qui sotto.
    for (const id of HIDDEN_VALUE_SLOT_IDS) {
      expect(spoken, id).not.toContain(VALUE_SLOT_LABELS[id]);
    }
    // Il valore assoluto è `n/d` in questa scena, il motivo resta quello — la
    // riga è provata sulla funzione che la scrive — e non si sente più.
    expect(
      valueSlotWhyText(
        "valore-assoluto",
        reading.slots["valore-assoluto"],
        reading,
      ),
    ).toBe(VALUE_MISSING_TEXT["ruolo-senza-target"]);
    expect(spoken).not.toContain(VALUE_MISSING_TEXT["ruolo-senza-target"]);
  });

  it("la lettura vocale non mette in relazione due numeri fra loro", () => {
    // Ogni voce parla della PROPRIA cella, come a schermo. Nessun rapporto,
    // nessuna differenza, nessuna somma: il raccordo fra i due numeri in
    // crediti è una domanda di prodotto che nessun record ha deciso, e questa
    // superficie non la anticipa.
    const spoken = spokenOf();
    expect(spoken).not.toMatch(/volte|rapporto|differenza|contro|rispetto a/i);
  });
});

describe("riquadro del valore — lo slot 4 non ha una riga generica, e non ne ha bisogno", () => {
  // IL RAMO GENERICO NON ESISTE PIÙ. `VALUE_SLOT_SOURCE` aveva una quarta voce
  // di ripiego per il valore relativo che nessuna esecuzione poteva
  // raggiungere: una review avversariale l'ha sostituita con una frase
  // direttiva e nessun test è caduto. Queste misure tengono chiuso il
  // vocabolario della riga dello slot 4 al posto di quella voce.

  const SLOT_4_VOCABULARY = new Set<string>([
    ...Object.values(RELATIVE_PRICE_BOUND_TEXT),
    ...Object.values(VALUE_MISSING_TEXT),
  ]);

  function readingOf(
    log: ReturnType<typeof buildLog>,
    selfId = SELF,
  ): ValueBoxReading {
    return valueBoxReading({
      called: { playerId: "a_uno", role: "A" },
      appealIndex: index(72),
      call: null,
      missingDeclaredInputs: [],
      absolute: ABSOLUTE,
      table: { state: stateOf(log), selfId },
      relative: RELATIVE,
    });
  }

  it("la riga dello slot 4 esce SEMPRE dal vocabolario chiuso, in ogni suo stato", () => {
    const scenes: readonly (readonly [string, ValueBoxReading])[] = [
      ["tavolo fresco", readingOf(buildLog([]))],
      [
        "mercato differenziato",
        readingOf(
          buildLog(TEAMS.slice(1, 7).flatMap((t) => fillRole(t, "A", 1, 200))),
        ),
      ],
      ["il mio tetto morde", readingOf(DRAINED_LOG)],
      ["ruolo pieno per me", readingOf(buildLog(fillRole(SELF, "A", 7, 1)))],
      [
        "nessun rivale",
        readingOf(
          buildLog(TEAMS.slice(1).flatMap((t) => fillRole(t, "A", 7, 1))),
        ),
      ],
      [
        "un solo rivale",
        readingOf(
          buildLog(TEAMS.slice(1, 7).flatMap((t) => fillRole(t, "A", 7, 1))),
        ),
      ],
      ["non sono al tavolo", readingOf(buildLog([]), "squadra_che_non_esiste")],
    ];
    for (const [label, reading] of scenes) {
      const why = valueSlotWhyText(
        "valore-relativo",
        reading.slots["valore-relativo"],
        reading,
      );
      expect(
        SLOT_4_VOCABULARY.has(why),
        `${label}: «${why}» fuori dal vocabolario`,
      ).toBe(true);
    }
  });

  it("una coppia incoerente non produce una frase inventata: dice `n/d`", () => {
    // È l'unico ingresso che resta fuori dai sette stati qui sopra, e non lo
    // produce `valueBoxReading()`: un numero passato con una lettura che non
    // porta il vincolo. La risposta è il token di assenza — «non lo so» —, non
    // una descrizione a parole di un numero di cui non si conosce la
    // provenienza. È il ramo che prima ospitava la voce irraggiungibile.
    const reading = readingOf(buildLog([]));
    const senzaVincolo: ValueBoxReading = {
      ...reading,
      relativePriceBound: null,
    };
    expect(
      valueSlotWhyText(
        "valore-relativo",
        reading.slots["valore-relativo"],
        senzaVincolo,
      ),
    ).toBe(VALUE_UNKNOWN);
  });
});

// ── L'ARROTONDAMENTO DELLA RESA, E I PAREGGI CHE PUÒ CREARE ─────────────────
//
// IL CASO LIMITE CHE NESSUNO AVEVA CHIUSO. Il punteggio relativo è una quota
// fra conteggi, quindi non è intero quasi mai; la resa ne stampa UN decimale
// (`valueNumberText`, regola già in casa per i crediti). Un arrotondamento può
// far mostrare lo STESSO numero a due giocatori distinti — un pareggio che
// l'ordine sotto non aveva — e la domanda «da quando?» ha una risposta
// misurabile: due punteggi adiacenti distano `100/(ordinati liberi − 1)`,
// quindi collidono a un decimale solo oltre 1001.
//
// I due test qui sotto sono la coppia che tiene onesta quella riga: il primo
// prova che al massimo che questo progetto può produrre (532 righe di listone,
// tutte nello stesso ruolo) NESSUNA coppia collide; il secondo ESIBISCE la
// collisione appena sopra la soglia. Il secondo non approva niente: documenta
// il confine, come fanno le letture aperte
// (`RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING`).

/** I punteggi relativi di `n` attaccanti ordinati su un tavolo fresco, resi
 *  come li vedrebbe Pico. Nessuna scorciatoia: si costruiscono l'ordine vero,
 *  la scala vera e la lettura vera, e si rende con la funzione dell'app. */
function renderedScores(n: number): readonly string[] {
  const playerIds = Array.from(
    { length: n },
    (_, i) => `a_${String(i).padStart(5, "0")}`,
  );
  const book = tierBook(
    {
      provenance: {
        source: "listone sintetico di test",
        recipe: RECIPE,
        tieBreak: APPEAL_ORDER_TIE_BREAK,
      },
      roles: [{ role: "A", playerIds }],
    },
    { teamsCount: 8 },
  );
  const ladder = freeLadder({
    pool: playerIds.map((playerId) => ({ playerId, role: "A" as Role })),
    book,
    purchasedPlayerIds: [],
  });
  const state: AuctionState = stateOf(buildLog([]));
  return playerIds.map((playerId) => {
    const reading = relativeIndexReading({
      called: { playerId, role: "A" },
      ladder,
      state,
      selfId: SELF,
    });
    if (reading.kind !== "punteggio")
      throw new Error(`punteggio atteso per ${playerId}`);
    return valueNumberText(reading.score);
  });
}

describe("riquadro del valore — l'arrotondamento della resa e i pareggi", () => {
  it("su 532 ordinati liberi — il massimo che il listone può portare — nessuna coppia collide", () => {
    // 532 è l'intero listone in un ruolo solo, cioè il caso peggiore possibile
    // e non uno realistico: nella stagione vera gli attaccanti sono una frazione
    // di quel numero. Se qui non ci sono pareggi, non ce ne sono da nessuna
    // parte nell'app.
    const resi = renderedScores(532);
    expect(resi.length).toBe(532);
    expect(new Set(resi).size).toBe(532);
    // I due capi si vedono, e si vedono INTERI: la regola di resa stampa i
    // decimali solo dove ci sono.
    expect(resi[0]).toBe("100");
    expect(resi[531]).toBe("0");
    // ...e in mezzo la virgola italiana, non il punto.
    expect(resi[1]).toBe("99,8");
  });

  it("a 1002 la collisione esiste, ed è esibita invece che taciuta", () => {
    // IL CONFINE, MISURATO. Con 1002 ordinati liberi il passo fra due punteggi
    // adiacenti scende sotto 0,1 e due giocatori DISTINTI mostrano lo stesso
    // numero. Il progetto non ci arriva — 532 righe in tutto, quattro ruoli —
    // ma il fatto è del numero, non della stagione, e va scritto.
    const resi = renderedScores(1002);
    expect(new Set(resi).size).toBeLessThan(resi.length);
    // La prima collisione è al centro esatto della scala: due giocatori diversi,
    // lo stesso «50,0» a schermo.
    expect(resi[500]).toBe("50,0");
    expect(resi[501]).toBe("50,0");
    // ...mentre a 1001, un solo giocatore in meno, ancora nessuna.
    const alConfine = renderedScores(1001);
    expect(new Set(alConfine).size).toBe(1001);
  });
});
