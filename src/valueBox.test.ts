import { describe, it, expect } from "vitest";
import {
  absoluteValueReading,
  anchorBook,
  callScreen,
  livePlan,
  maxSafe,
  measuredInflation,
  relativePriceReading,
  type AuctionState,
  type CallScreen,
  type PlayerAnchor,
  type ValueProfile,
} from "../packages/engine/src/index.js";
import {
  TEAMS,
  anchor,
  buildLog,
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
  CREDITI_FUORI_DAL_RIQUADRO,
  VALUE_SLOT_ORDER,
  valueBoxReading,
  type ValueBoxReading,
} from "./valueBox.js";
import {
  VALUE_MISSING_TEXT,
  VALUE_SLOT_LABELS,
  VALUE_UNKNOWN,
  valueBoxHtml,
  valueBoxNoteText,
  valueBoxSpoken,
  valueSlotText,
  valueSlotWhyText,
} from "./ui/valueBox.js";

// IL RIQUADRO DEL VALORE PORTA I DUE INDICI, E OGNUNO DEI DUE SA DIRE DA DOVE
// VIENE O PERCHÉ NON C'È.
//
// I DUE NUMERI IN CREDITI SONO USCITI — Pico, 2026-08-24, in modale, alla
// lettera: «Leva il valore assoluto e il valore relativo». Le misure che
// provavano quelle due celle NON SONO STATE CANCELLATE: sono state INVERTITE,
// con la ragione e la data scritte accanto, e stanno tutte nel describe «i due
// numeri in crediti non sono più celle di questo riquadro». È la regola di casa
// — un'asserzione si aggiorna o si inverte, mai si toglie — applicata al caso
// in cui a cambiare è il prodotto e non il codice.
//
// I DUE MOTORI RESTANO PROVATI A CASA LORO, interi e non toccati:
// packages/engine/tests/absoluteValue.test.ts e
// packages/engine/tests/relativeValue.test.ts. Qui non si prova più che quei
// numeri siano giusti — non è più questo il posto —, si prova che NON ARRIVANO
// A SCHERMO, e lo si prova col motore vero: si calcolano davvero e si verifica
// che nessuna cella li porti.
//
// COSA MISURA QUESTO FILE:
//
//  1. i due indici escono dal DATO servito — punteggio, etichetta di qualità e
//     versione della ricetta — e mai da una stringa scritta nella UI;
//  2. ogni assenza è dichiarata: nessuno slot senza ingredienti produce uno
//     zero, un punto medio o una cella vuota (§D9, e «ingrediente mancante =
//     `n/d`, mai un default»);
//  3. i due numeri in crediti non compaiono in nessuno stato del riquadro, né
//     come cifra né come unità né come frase che li accompagnava;
//  4. il riquadro non accende nessuna superficie direttiva: né le parole né i
//     numeri di `target_band`/`stretch_cap`/«prendilo fino a», né
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

// ── I DUE NUMERI CHE IL RIQUADRO NON MOSTRA PIÙ ─────────────────────────────
// Le fixture dei due motori restano qui, e non per abitudine: senza di esse
// l'inversione sarebbe la frase «non c'è» invece della misura «l'ho calcolato,
// e a schermo non c'è». Un test che non sa quale numero cercare non prova che
// quel numero è assente.

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

const ABSOLUTE: Omit<AbsoluteValueInput, "called"> = {
  roleTargets: { P: 20, D: 80, C: 140, A: 210 },
  book: TIER_BOOK,
  legs: NO_LEG_INPUTS,
};

/**
 * A TAVOLO FRESCO IL PREZZO RELATIVO VALE 473: otto squadre identiche a 500
 * crediti hanno tutte lo stesso max bid vero (500 − 27 slot obbligatori residui
 * = 473), quindi il secondo chiede 474 e il tetto del più ricco lo riporta a
 * 473. È il numero che il riquadro mostrava su OGNI scheda di OGNI ruolo nei
 * primi minuti, ed è metà della ragione per cui Pico lo ha tolto.
 */
const FRESH_TABLE_PRICE = 473;

/** Il valore assoluto di un attaccante in prima fascia: 210 cr / 7 slot = 30. */
const ABSOLUTE_VALUE_A = 30;

/**
 * La lettura del riquadro per un chiamato. `appealIndex` è SEMPRE esplicito,
 * senza default: `undefined` è uno degli stati che si misurano — «il listone
 * non porta l'indice» — e un valore di ripiego lo renderebbe irraggiungibile.
 */
function readingOf(appealIndex: ListoneAppealIndex | undefined): ValueBoxReading {
  return valueBoxReading({ called: { playerId: "a_uno", role: "A" }, appealIndex });
}

describe("riquadro del valore — i due indici", () => {
  it("porta DUE slot, sempre, nell'ordine deciso", () => {
    expect(VALUE_SLOT_ORDER).toEqual(["indice-assoluto", "indice-relativo"]);
    const reading = readingOf(index(72));
    expect(Object.keys(reading.slots).sort()).toEqual([...VALUE_SLOT_ORDER].sort());
  });

  it("l'indice assoluto è il punteggio servito, con qualità e ricetta portate dal dato", () => {
    const reading = readingOf(index(72));
    expect(reading.slots["indice-assoluto"]).toEqual({
      kind: "numero",
      value: 72,
      unit: "indice",
    });
    // Le due stringhe vengono DAL DATO e non sono scritte nella UI: la deroga
    // display-only del 2026-08-12 lo impone.
    expect(reading.indexQuality).toBe(QUALITY);
    expect(reading.indexRecipe).toBe(RECIPE);
    expect(valueBoxNoteText(reading)).toContain(QUALITY);
    expect(valueBoxNoteText(reading)).toContain(RECIPE);
  });

  it("l'indice relativo è n/d e dice che la formula non è decisa: nessuno lo calcola", () => {
    const reading = readingOf(index(72));
    expect(reading.slots["indice-relativo"]).toEqual({
      kind: "assente",
      reason: "indice-relativo-non-calcolato",
    });
    expect(valueSlotText(reading.slots["indice-relativo"])).toBe(VALUE_UNKNOWN);
    expect(valueBoxHtml(reading)).toContain("formula non decisa");
  });

  it("una sola cella porta un numero, ed è un fatto dichiarato e non un difetto", () => {
    // Con lo slot 2 sempre `n/d` per una formula non decisa e i due in crediti
    // usciti, il riquadro mostra un numero e un'assenza dichiarata. Si misura
    // perché sia un fatto visibile e non una scoperta: il giorno in cui
    // qualcuno accendesse un numero per riempire il riquadro, questa riga lo
    // direbbe.
    const reading = readingOf(index(72));
    const numeri = VALUE_SLOT_ORDER.filter((id) => reading.slots[id].kind === "numero");
    expect(numeri).toEqual(["indice-assoluto"]);
  });

  it("il riquadro non dipende più dalla serata: la firma non la riceve nemmeno", () => {
    // Prova STRUTTURALE, e vale più di un caso: la lettura ha quattro campi e
    // nessuno di essi è uno stato d'asta, una catena o un vincolo. Prima del
    // 2026-08-24 lo stesso giocatore su due tavoli diversi dava due riquadri
    // diversi; adesso non esiste un ingresso che possa distinguerli.
    const reading = readingOf(index(72));
    expect(Object.keys(reading).sort()).toEqual([
      "called",
      "indexQuality",
      "indexRecipe",
      "slots",
    ]);
    expect(readingOf(index(72))).toEqual(reading);
  });
});

describe("riquadro del valore — i due numeri in crediti non sono più celle di questo riquadro", () => {
  // L'INVERSIONE, IN UN POSTO SOLO. Ogni misura qui sotto era, fino al
  // 2026-08-24, l'asserzione opposta: «lo slot 3 porta la scala del
  // regolamento», «lo slot 4 porta il prezzo del tavolo», «la riga sotto il
  // numero dice quale vincolo l'ha fissato», «i cinque n/d del prezzo relativo
  // sono cinque». Non sono state cancellate — la regola di casa lo vieta — ma
  // girate, con la frase che le autorizza:
  //
  //     Pico, 2026-08-24, in modale: «Leva il valore assoluto e il valore
  //     relativo».
  //
  // I due numeri restano CORRETTI e restano provati nei loro moduli. Qui si
  // prova soltanto che non arrivano sotto gli occhi di chi è in asta, e lo si
  // prova calcolandoli davvero: un test che non sa quale cifra cercare non
  // prova un'assenza.

  const PICO_2026_08_24 = "Leva il valore assoluto e il valore relativo";

  it("la marcatura dichiara l'uscita, con la frase e i due moduli rimasti senza consumatori", () => {
    // Pinnata come le scelte non ratificate del motore: DOCUMENTA senza
    // approvare, e diventa rossa se qualcuno la cancella o rimette le celle.
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain("2026-08-24");
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain(PICO_2026_08_24);
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain("SENZA CONSUMATORI");
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain("absoluteValue.ts");
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain("relativeValue.ts");
    // Sostituisce `SLOT_4_SOURCE_MOVED` invece di affiancarla: due marcature
    // che si contraddicono sono peggio di nessuna marcatura.
    expect(CREDITI_FUORI_DAL_RIQUADRO).toContain("SLOT_4_SOURCE_MOVED");
  });

  it("i due id non esistono più fra gli slot, in nessuno stato del riquadro", () => {
    const scene: readonly ValueBoxReading[] = [
      readingOf(index(72)),
      readingOf(undefined),
      readingOf(index(null)),
      valueBoxReading({ called: null, appealIndex: undefined }),
    ];
    for (const reading of scene) {
      expect(Object.keys(reading.slots).sort()).toEqual(["indice-assoluto", "indice-relativo"]);
      expect(Object.keys(reading.slots)).not.toContain("valore-assoluto");
      expect(Object.keys(reading.slots)).not.toContain("valore-relativo");
      // Nemmeno le etichette: «Valore assoluto» e «Valore relativo» erano i
      // nomi delle due celle, e sono usciti con loro.
      const etichette = Object.values(VALUE_SLOT_LABELS);
      expect(etichette).not.toContain("Valore assoluto");
      expect(etichette).not.toContain("Valore relativo");
    }
  });

  it("IL VALORE ASSOLUTO ESISTE E NON SI VEDE: il motore lo calcola, il riquadro non lo porta", () => {
    // Il numero è quello che la cella mostrava: 210 cr sul ruolo / 7 slot = 30.
    const derived = absoluteValueReading({ ...ABSOLUTE, called: { playerId: "a_uno", role: "A" } });
    expect(derived.kind).toBe("valore");
    if (derived.kind !== "valore") return;
    expect(derived.credits).toBe(ABSOLUTE_VALUE_A);

    const reading = readingOf(index(72));
    const html = valueBoxHtml(reading);
    expect(html).not.toContain(`>${ABSOLUTE_VALUE_A} cr<`);
    expect(html).not.toContain("cr sul ruolo");
    expect(html).not.toContain("fascia");
    // E nessuna cella porta quel numero, comunque lo si scriva.
    const numeri = VALUE_SLOT_ORDER.map((id) => reading.slots[id]).flatMap((slot) =>
      slot.kind === "numero" ? [slot.value] : [],
    );
    expect(numeri).not.toContain(ABSOLUTE_VALUE_A);
  });

  it("IL PREZZO RELATIVO ESISTE E NON SI VEDE: 473 a tavolo fresco, e a schermo non c'è", () => {
    // È il caso che ha fatto decidere: a tavolo fresco il numero era 473 su
    // ogni scheda di ogni ruolo, affiancato a un «30 cr» senza niente che li
    // mettesse in relazione.
    const price = relativePriceReading({ state: stateOf(buildLog([])), role: "A", selfId: SELF });
    expect(price.kind).toBe("prezzo");
    if (price.kind !== "prezzo") return;
    expect(price.credits).toBe(FRESH_TABLE_PRICE);

    const html = valueBoxHtml(readingOf(index(72)));
    expect(html).not.toContain(String(FRESH_TABLE_PRICE));
    // E nemmeno le tre frasi che dicevano quale vincolo aveva fissato il
    // numero: erano la riga sotto la cella, e sono uscite con la cella.
    expect(html).not.toContain("il secondo max bid al tavolo");
    expect(html).not.toContain("il tetto del tavolo");
    expect(html).not.toContain("il tuo max bid");
  });

  it("l'unità «cr» non compare in nessuna cella: era dei due numeri usciti", () => {
    for (const appealIndex of [index(72), index(null), undefined]) {
      const reading = readingOf(appealIndex);
      for (const id of VALUE_SLOT_ORDER) {
        expect(valueSlotText(reading.slots[id]), id).not.toContain("cr");
      }
      expect(valueBoxHtml(reading)).not.toContain(" cr<");
    }
  });

  it("i motivi di n/d dei due motori sono usciti con le celle che spiegavano", () => {
    // Erano quattordici, e ognuno nominava un fatto del tavolo o una
    // dichiarazione mancante. Il vocabolario del riquadro adesso ne ha quattro,
    // e sono tutti e soli quelli dei due indici: un motivo che sopravvive alla
    // cella che spiegava è una frase che nessuno può più vedere.
    const usciti = [
      "ruolo-senza-target",
      "target-non-valido",
      "target-oltre-il-budget",
      "fascia-assente",
      "oltre-gli-slot-del-ruolo",
      "gamba-concorrenza-assente",
      "gamba-coppe-assente",
      "gamba-pagella-assente",
      "tavolo-senza-la-mia-squadra",
      "ruolo-pieno-per-me",
      "non-posso-offrire",
      "nessun-rivale-eleggibile",
      "un-solo-rivale-eleggibile",
      "ingredienti-dichiarati-assenti",
      "motore-senza-numeri",
    ];
    for (const reason of usciti) expect(Object.keys(VALUE_MISSING_TEXT)).not.toContain(reason);
    expect(Object.keys(VALUE_MISSING_TEXT).sort()).toEqual([
      "indice-assente",
      "indice-relativo-non-calcolato",
      "indice-senza-verdetto",
      "nessun-chiamato",
    ]);
  });

  it("la riga di testata non nomina più le dichiarazioni di Pico, e non ha più un soggetto", () => {
    // `missingDeclaredInputsText()` è uscita insieme alle uniche due celle che
    // potevano aspettare una dichiarazione. Non è stata ammorbidita in «manca
    // un dato»: è stata tolta col suo motivo, e la testata adesso porta due
    // cose sole — la qualificazione dell'indice (dal dato) e la garanzia.
    const nota = valueBoxNoteText(readingOf(index(72)));
    expect(nota).not.toContain("i tuoi valori per giocatore");
    expect(nota).not.toContain("il tuo profilo di rischio");
    expect(nota).not.toContain("ancora fuori dall'app");
    expect(nota).toBe(`Indice: ${QUALITY} · ricetta ${RECIPE}. ` +
      "Valori precisi, mai intervalli, nessun prezzo di mercato previsto. " +
      "Nessun consiglio: il giudizio è tuo.");
  });
});

describe("riquadro del valore — le assenze sono dichiarate, mai riempite", () => {
  it("senza chiamata i due slot dicono n/d, e dicono che manca il chiamato", () => {
    const reading = valueBoxReading({ called: null, appealIndex: undefined });
    for (const id of VALUE_SLOT_ORDER) {
      expect(reading.slots[id]).toEqual({ kind: "assente", reason: "nessun-chiamato" });
      expect(valueSlotText(reading.slots[id])).toBe(VALUE_UNKNOWN);
    }
    expect(reading.called).toBe(false);
  });

  it("listone senza indice: n/d col motivo, mai uno zero e mai un punto medio", () => {
    const reading = readingOf(undefined);
    expect(reading.slots["indice-assoluto"]).toEqual({ kind: "assente", reason: "indice-assente" });
    expect(reading.indexQuality).toBeNull();
    expect(reading.indexRecipe).toBeNull();
    expect(valueBoxNoteText(reading)).not.toContain("ricetta");
  });

  it("indice senza verdetto: l'n/d è quello portato dal dato, distinto da «non c'è l'indice»", () => {
    const reading = readingOf(index(null));
    expect(reading.slots["indice-assoluto"]).toEqual({
      kind: "assente",
      reason: "indice-senza-verdetto",
    });
    // I DUE `n/d` NON COLLASSANO: chi legge deve sapere se il listone non porta
    // l'indice o se lo porta senza verdetto.
    expect(valueSlotWhyText("indice-assoluto", reading.slots["indice-assoluto"])).not.toBe(
      VALUE_MISSING_TEXT["indice-assente"],
    );
    // La qualificazione arriva comunque: la riga di listone la porta.
    expect(valueBoxNoteText(reading)).toContain(RECIPE);
  });

  it("ogni cella ha la sua riga, e nessuna resta muta", () => {
    for (const appealIndex of [index(72), index(null), undefined]) {
      const reading = readingOf(appealIndex);
      for (const id of VALUE_SLOT_ORDER) {
        expect(valueSlotWhyText(id, reading.slots[id]), id).not.toBe("");
      }
    }
  });
});

describe("riquadro del valore — la resa non accende nient'altro", () => {
  const DIRECTIVE =
    /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigli[ao]|dovresti|ranking|projection|prezzo atteso|fino a \d/i;

  it("nessuna parola direttiva nel riquadro, in nessuno dei suoi stati", () => {
    const readings = [
      readingOf(index(72)),
      readingOf(index(null)),
      readingOf(undefined),
      valueBoxReading({ called: null, appealIndex: undefined }),
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

  it("NESSUN numero del motore arriva a schermo, nemmeno quelli che una cella mostrava", () => {
    // L'INVERSIONE RAFFORZATA di «fairToMeMaxRaw non arriva mai a schermo».
    // Prima il riquadro riceveva la catena e bisognava provare che dei suoi tre
    // numeri ne mostrasse solo quello renderizzabile; adesso non riceve più la
    // catena affatto, e la misura vale per TUTTI i suoi numeri.
    //
    // Tavolo col budget consumato e profilo prudente: è la sola configurazione
    // in cui i tre numeri della catena sono DISTINTI (dichiarato 60, grezzo 58,
    // effettivo 41). A tavolo fresco coincidono e il test non proverebbe nulla.
    const call = engineCall("a_uno", DRAINED_LOG, "prudente");
    const raw = call.numbers!.fairToMeMaxRaw;
    const effective = call.numbers!.fairToMeMaxEffective;
    expect(new Set([call.declaredValue, raw, effective]).size).toBe(3);
    expect(maxSafe(stateOf(DRAINED_LOG).teams[SELF]!, "A").maxSafe).toBe(41);
    expect(effective).toBe(41);

    const reading = readingOf(index(72));
    const html = valueBoxHtml(reading);
    for (const numero of [call.declaredValue, raw, effective]) {
      expect(html, String(numero)).not.toContain(`>${numero}<`);
      expect(html, String(numero)).not.toContain(`>${numero} cr<`);
    }
  });

  it("valori precisi, mai intervalli: ogni numero è uno scalare, mai una coppia di estremi", () => {
    const reading = readingOf(index(72));
    for (const id of VALUE_SLOT_ORDER) {
      const slot = reading.slots[id];
      if (slot.kind !== "numero") continue;
      expect(Number.isFinite(slot.value)).toBe(true);
      // Uno scalare secco, con la virgola italiana quando non è intero. Mai
      // «fra 55 e 70», e mai più un suffisso di unità.
      expect(valueSlotText(slot)).toMatch(/^-?\d+(,\d)?$/);
    }
  });
});

describe("riquadro del valore — chi ascolta sente quello che chi guarda legge", () => {
  // La riga del perché non è un ornamento visivo, quindi non può fermarsi allo
  // schermo: senza di essa chi usa lo screen reader sentirebbe «Indice
  // relativo: n/d» senza mai sapere che la formula non è decisa, cioè un
  // silenzio al posto di un'informazione.
  //
  // LA MISURA SUL VINCOLO DEL PREZZO RELATIVO È DECADUTA col numero che lo
  // portava: al suo posto, qui sotto, la stessa regola applicata alle celle
  // rimaste.

  it("ogni cella parlata dice nome, numero e riga: nessuna resta muta", () => {
    for (const appealIndex of [index(72), index(null), undefined]) {
      const reading = readingOf(appealIndex);
      const spoken = valueBoxSpoken(reading);
      for (const id of VALUE_SLOT_ORDER) {
        const slot = reading.slots[id];
        expect(spoken, id).toContain(VALUE_SLOT_LABELS[id]);
        expect(spoken, id).toContain(valueSlotText(slot));
        expect(spoken, id).toContain(valueSlotWhyText(id, slot));
      }
    }
    // Il motivo dello slot 2 si SENTE, e non solo si legge.
    expect(valueBoxSpoken(readingOf(index(72)))).toContain(
      VALUE_MISSING_TEXT["indice-relativo-non-calcolato"],
    );
  });

  it("la lettura vocale non porta nessun numero in crediti e nessun vincolo", () => {
    const spoken = valueBoxSpoken(readingOf(index(72)));
    expect(spoken).not.toContain("cr");
    expect(spoken).not.toContain(String(FRESH_TABLE_PRICE));
    expect(spoken).not.toContain("il tetto del tavolo");
  });

  it("la lettura vocale non mette in relazione due numeri fra loro", () => {
    // Ogni voce parla della PROPRIA cella, come a schermo. Nessun rapporto,
    // nessuna differenza, nessuna somma: era la domanda aperta sul riquadro coi
    // due numeri in crediti, e la risposta di Pico è stata toglierli.
    const spoken = valueBoxSpoken(readingOf(index(72)));
    expect(spoken).not.toMatch(/volte|rapporto|differenza|contro|rispetto a/i);
  });
});

describe("riquadro del valore — nessuna riga vive in un ramo che nessuno guarda", () => {
  // LA STESSA REGOLA CHE HA TOLTO LA VOCE DELLO SLOT 4, applicata a ciò che
  // resta. Una review avversariale aveva sostituito la riga di provenienza del
  // valore relativo — irraggiungibile, perché quel numero portava sempre il suo
  // vincolo — con una frase DIRETTIVA, e nessun test era caduto. Le due misure
  // qui sotto tengono chiuso il vocabolario delle righe del riquadro al posto
  // di quella voce.

  const VOCABOLARIO = new Set<string>([
    "dal listone, prima dell'asta",
    ...Object.values(VALUE_MISSING_TEXT),
  ]);

  it("ogni riga del riquadro esce dal vocabolario chiuso, in ogni suo stato", () => {
    const scene: readonly ValueBoxReading[] = [
      readingOf(index(72)),
      readingOf(index(null)),
      readingOf(undefined),
      valueBoxReading({ called: null, appealIndex: undefined }),
    ];
    for (const reading of scene) {
      for (const id of VALUE_SLOT_ORDER) {
        const why = valueSlotWhyText(id, reading.slots[id]);
        expect(VOCABOLARIO.has(why), `${id}: «${why}» fuori dal vocabolario`).toBe(true);
      }
    }
  });

  it("l'indice relativo con un numero è una coppia incoerente: dice `n/d`, non una frase", () => {
    // `valueBoxReading()` non produce mai questo slot come numero — la formula
    // non è decisa —, quindi è l'unico ingresso che le scene qui sopra non
    // possono costruire. La risposta è il token di assenza, non una descrizione
    // a parole della provenienza di un numero che non ha provenienza: è il ramo
    // in cui prima viveva la voce irraggiungibile.
    expect(valueSlotWhyText("indice-relativo", { kind: "numero", value: 50, unit: "indice" })).toBe(
      VALUE_UNKNOWN,
    );
  });

  it("un indice non intero si scrive con la virgola italiana, e con un decimale solo", () => {
    // Il ramo decimale di `valueNumberText` era coperto dalla quota di uno slot
    // (200/9 = 22,222…), che è uscita col valore assoluto. Qui lo copre
    // l'indice, che è l'unico numero rimasto: senza questa riga il ramo
    // resterebbe vivo e non provato.
    const reading = readingOf(index(72.46));
    expect(valueSlotText(reading.slots["indice-assoluto"])).toBe("72,5");
    expect(valueSlotText(readingOf(index(72)).slots["indice-assoluto"])).toBe("72");
  });
});
