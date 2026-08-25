import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { VALUE_SLOT_LABELS, VALUE_UNKNOWN } from "../src/ui/valueBox.js";
import { VALUE_SLOT_ORDER } from "../src/valueBox.js";
import {
  AA_NORMAL_TEXT,
  installSyntheticNetworkGuard,
  measureAllText,
  selectListoneRowByName,
  textContrast,
} from "./helpers.js";

// IL RIQUADRO DEL VALORE ARRIVA SULLO SCHERMO, DENTRO LA SCHEDA DEL CHIAMATO.
//
// PERCHÉ QUESTA SPEC ESISTE, e perché un test di unità non basta.
// `packages/engine/src/callScreen.ts` calcola `fairToMeMaxEffective` da prima
// di questa corsia: è esportato, provato, e non aveva UN SOLO import in `src/`.
// Un numero che nessuna schermata monta è un numero che non esiste per chi
// compra. Questa spec percorre il giro vero — apri l'app, cerca un giocatore,
// avvia l'asta — e verifica che il riquadro sia lì, con le sue quattro celle,
// nel browser vero e non in una stringa HTML.
//
// LE QUATTRO COSE CHE ASSERISCE, ognuna rossa da sola:
//
//  a. IL RIQUADRO C'È e sta DENTRO la scheda del giocatore chiamato, sopra il
//     gesto «ASSEGNA A»: è il posto che `docs/DECISIONS.md` nomina («il
//     riquadro del valore della scheda del giocatore chiamato»);
//  b. LE CELLE SONO QUATTRO, con i nomi decisi, ognuna con un numero oppure
//     `n/d` PIÙ la riga che dice perché — mai una cella muta;
//  c. I DUE NUMERI CHE L'APP SA DAVVERO CALCOLARE sono quelli veri: l'indice
//     assoluto è il punteggio servito col listone, non un arrotondamento; e il
//     VALORE RELATIVO è il prezzo del tavolo — a tavolo fresco 473 cr —,
//     acceso nel giro vero e non solo in un test di unità;
//  d. NIENTE DI DIRETTIVO si accende insieme: né le parole né i numeri di
//     `target_band`/`stretch_cap`/«prendilo fino a», e il testo si legge (AA).
//
// LA CELLA DEL VALORE RELATIVO SI È ACCESA, ed è la novità del 2026-08-24:
// `docs/DECISIONS.md` §"Il prezzo relativo si assesta su quanto mette il
// secondo, non il più ricco" le ha dato una formula che non passa da nessuna
// dichiarazione di Pico — il secondo max bid fra i rivali eleggibili, più uno,
// con tetto al più ricco e a `max_safe`. I suoi ingredienti sono fatti duri
// dell'event log, che l'app ha già: la cella porta quindi un numero fin dal
// primo secondo dell'asta.
//
// COSA QUESTA SPEC NON PUÒ PROVARE, e va detto invece che nascosto: il VALORE
// ASSOLUTO ha bisogno dei TARGET DI RUOLO che Pico dichiara nel piano rosa, e
// in un giro appena avviato quel piano è vuoto. Nel giro vero quella cella dice
// quindi `n/d` e nomina il target che manca; che porti il numero giusto quando
// il target c'è è misurato in src/valueBox.test.ts sulla catena vera del
// motore. Le due misure insieme coprono i quattro numeri; nessuna delle due, da
// sola, mente sull'altra.
//
// Tutte le righe sono sintetiche — nomi, club, punteggi e ricetta — e il
// network guard aborta qualunque altra richiesta.

const RECIPE = "APPEAL-INDEX-RECIPE@0.0.0-sintetica";
const QUALITY = "sperimentale — fixture sintetica, non validato";

const CALLED = "Attaccante Sintetico";
const CALLED_SCORE = 73;

/**
 * IL PREZZO RELATIVO A TAVOLO FRESCO, scritto invece che dedotto. Le otto
 * squadre della lega partono identiche a 500 crediti, quindi hanno tutte lo
 * stesso max bid vero — 500 meno i 27 slot obbligatori che restano da riempire
 * = 473 —; il secondo chiederebbe 474 e il tetto del più ricco lo riporta a
 * 473. È la regola letta fino in fondo: quando tutti possono tutto, vincere
 * costa tutto.
 */
const FRESH_TABLE_PRICE = "473 cr";

const POOL: readonly ListonePlayer[] = [
  {
    name: CALLED,
    role: "A",
    club: "ClubUno",
    quotation: 28,
    appealIndex: {
      score: CALLED_SCORE,
      quality: QUALITY,
      recipe: RECIPE,
      components: { appetibilitaBase: CALLED_SCORE },
    },
  },
  {
    name: "Attaccante Senza Verdetto",
    role: "A",
    club: "ClubDue",
    quotation: 15,
    appealIndex: {
      score: null,
      quality: QUALITY,
      recipe: RECIPE,
      components: { appetibilitaBase: null },
    },
  },
  { name: "Portiere Sintetico", role: "P", club: "ClubTre", quotation: 5 },
];

/** Lo stesso listone senza NESSUN indice: la scena in cui anche la prima cella tace. */
const POOL_WITHOUT_INDEX: readonly ListonePlayer[] = POOL.map(
  ({ appealIndex: _drop, ...row }) => row,
);

// IL LISTONE DELLA SCENA CHE SI MUOVE: TRE attaccanti ORDINATI, uno sopra
// l'altro. Ne servono tre e non due, e la ragione è il caso limite: con due
// ordinati, comprarne uno lascia l'altro SOLO, e un solo libero ordinato non ha
// un punteggio (sarebbe 0/0). Con tre, dopo l'acquisto ne restano due e il
// numero si muove davvero invece di sparire — che è ciò che questa scena misura.
const SECOND_BEST = "Attaccante Secondo";
const THIRD_BEST = "Attaccante Terzo";

/** Un attaccante ordinato in più, con lo STESSO CLUB del chiamato. Non è un
 *  dettaglio: selezionare una riga imposta anche i filtri RUOLO e SQUADRA della
 *  ricerca, e restano impostati quando si torna indietro. Club diversi
 *  renderebbero gli altri invisibili al filtro del primo, e il test fallirebbe
 *  per un motivo che non è quello che sta misurando. */
function rankedStriker(
  name: string,
  score: number,
  quotation: number,
): ListonePlayer {
  return {
    name,
    role: "A",
    club: "ClubUno",
    quotation,
    appealIndex: {
      score,
      quality: QUALITY,
      recipe: RECIPE,
      components: { appetibilitaBase: score },
    },
  };
}

const POOL_THREE_RANKED: readonly ListonePlayer[] = [
  ...POOL,
  rankedStriker(SECOND_BEST, CALLED_SCORE - 10, 19),
  rankedStriker(THIRD_BEST, CALLED_SCORE - 20, 12),
];

// docs/NO_GO.md §Prodotto: nessuna di queste parole può comparire su questa
// superficie. Stessa famiglia della guardia già in uso in e2e/tier-band.spec.ts.
const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|dovresti|spingi|convien|consigli[ao]|ranking|projection|prezzo atteso/i;

/**
 * LE RIGHE DI TESTO DEL RIQUADRO, DERIVATE DALLA SUA STRUTTURA e non contate a
 * mano: la testata ne porta DUE (il titolo e la nota) e ogni cella ne porta
 * TRE — il nome dello slot (`<em>`), il numero o `n/d` (`<strong>`) e la riga
 * che dice perché (`<span>`): src/ui/valueBox.ts, `valueBoxHtml`.
 *
 * PERCHÉ NON UN `14` SCRITTO A MANO. Un letterale può soltanto essere
 * dimenticato: il giorno in cui una cella guadagna una quarta riga il numero
 * diventa lasco in silenzio, e nessuno se ne accorge finché il riquadro non si
 * svuota davvero. Scritto così è un VINCOLO STRUTTURALE ESATTO — cambiare la
 * forma della cella senza toccare questa riga fa fallire il conteggio invece
 * di scivolarci sopra, in tutte e due le direzioni: una riga persa e una riga
 * comparsa (un `::before { content: … }` compreso, che `measureAllText`
 * misura come testo dipinto) fanno rosso uguale.
 */
const VALUE_BOX_TEXT_ROWS = VALUE_SLOT_ORDER.length * 3 + 2;

async function boot(
  page: Page,
  pool: readonly ListonePlayer[] = POOL,
): Promise<void> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(page.context(), pool, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

async function callPlayer(page: Page, name: string): Promise<void> {
  await selectListoneRowByName(page, name);
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#value-box")).toBeVisible();
}

/** Registra un acquisto vero, dal form ASSEGNA A: è il gesto che muove lo
 *  stato d'asta, e quindi la sola cosa che può muovere l'indice relativo. */
async function assignToFirstOpponent(page: Page, price: number): Promise<void> {
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill(String(price));
  await page
    .getByRole("button", { name: "Registra acquisto", exact: true })
    .click();
  await expect(page.locator("#search-player")).toBeVisible();
}

test("il riquadro del valore rende quattro celle dentro la scheda del chiamato", async ({
  page,
}) => {
  await boot(page);
  await callPlayer(page, CALLED);

  // a. il riquadro sta DENTRO la scheda, e sopra il gesto.
  const inCard = await page.evaluate(() => {
    const card = document.getElementById("call-card");
    const box = document.getElementById("value-box");
    const heading = [...document.querySelectorAll(".panel-title")].find(
      (el) => (el.textContent ?? "").trim() === "ASSEGNA A",
    );
    if (card === null || box === null || heading === undefined) return null;
    return {
      inside: card.contains(box),
      aboveGesture:
        box.getBoundingClientRect().top < heading.getBoundingClientRect().top,
    };
  });
  expect(inCard).not.toBeNull();
  expect(inCard!.inside).toBe(true);
  expect(inCard!.aboveGesture).toBe(true);

  // b. quattro celle, quattro nomi, e nessuna muta.
  await expect(page.locator("#value-box .value-box__cell")).toHaveCount(4);
  for (const id of VALUE_SLOT_ORDER) {
    const cell = page.locator(`#value-box-cell-${id}`);
    await expect(cell).toBeVisible();
    await expect(cell).toContainText(VALUE_SLOT_LABELS[id]);
    // Il numero e la riga del perché esistono entrambi e nessuno dei due è vuoto.
    await expect(page.locator(`#value-box-number-${id}`)).not.toBeEmpty();
    await expect(page.locator(`#value-box-why-${id}`)).not.toBeEmpty();
  }

  // Le quattro celle stanno su UNA riga: è il vincolo di altezza che tiene il
  // gesto principale sopra la piega (src/styles/asta.css).
  const cellTops = await page.evaluate(() =>
    [...document.querySelectorAll("#value-box .value-box__cell")].map((el) =>
      Math.round(el.getBoundingClientRect().top),
    ),
  );
  expect(new Set(cellTops).size).toBe(1);

  // c. l'indice assoluto è il punteggio SERVITO, e la sua qualificazione viene
  //    dal dato: etichetta di qualità e versione della ricetta, non parole
  //    scritte nella UI.
  await expect(page.locator("#value-box-number-indice-assoluto")).toHaveText(
    String(CALLED_SCORE),
  );
  await expect(page.locator("#value-box-note")).toContainText(QUALITY);
  await expect(page.locator("#value-box-note")).toContainText(RECIPE);

  // c-bis. IL CASO LIMITE DELL'INDICE RELATIVO, NEL GIRO VERO. In questo
  //    listone l'unico attaccante con un verdetto è il chiamato: «Attaccante
  //    Senza Verdetto» non entra nell'ordine. È quindi primo E ultimo fra i
  //    liberi ordinati, e la quota che il punteggio misura sarebbe 0/0 — la
  //    stessa regola gli imporrebbe 100 e 0. La cella dice `n/d` e dice perché,
  //    invece di scegliere uno dei due: che il numero ci sia quando c'è qualcuno
  //    con cui misurarlo è provato dalla scena che si muove, in fondo al file.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "unico libero ordinato",
  );

  // I DUE SLOT IN CREDITI NON SI SOMIGLIANO PIÙ, ed è la differenza congiunta
  // delle due decisioni di Pico del 2026-08-24: il valore ASSOLUTO è derivato
  // dal regolamento e dai target di ruolo (che l'app raccoglie nel piano rosa, e
  // che in questo giro non sono dichiarati, quindi dice `n/d` e nomina il
  // target); il valore RELATIVO è il prezzo del tavolo, che non aspetta nessuna
  // dichiarazione e porta quindi un numero dal primo secondo.
  await expect(page.locator("#value-box-number-valore-assoluto")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-valore-assoluto")).toContainText(
    "target di ruolo",
  );
  await expect(page.locator("#value-box-number-valore-relativo")).toHaveText(
    FRESH_TABLE_PRICE,
  );

  // LA RIGA SOTTO IL NUMERO DICE QUALE VINCOLO L'HA FISSATO, e in questa scena
  // è il TETTO DEL TAVOLO: le otto squadre sono identiche, quindi nessuna
  // arriva a «secondo + 1» e il numero non è ancora un prezzo di mercato. Se
  // dicesse «il secondo max bid al tavolo, +1» starebbe chiamando prezzo un
  // tetto strutturale — la distinzione che `RelativePriceChain.boundBy` porta
  // fin qui.
  await expect(page.locator("#value-box-why-valore-relativo")).toHaveText(
    "il tetto del tavolo: nessuno arriva più in alto",
  );

  // E LA STESSA RIGA ARRIVA A CHI NON GUARDA. L'`aria-label` del riquadro è la
  // sola forma in cui uno screen reader legge queste quattro celle: finché lo
  // slot 4 diceva `n/d` non perdeva niente, adesso porta un numero che a tavolo
  // fresco è identico su ogni scheda di ogni ruolo. Senza il vincolo, chi
  // ascolta sentirebbe per minuti la stessa cifra senza sapere che misura il
  // tavolo (src/ui/valueBox.ts, `valueBoxSpoken`).
  const spoken = await page.locator("#value-box").getAttribute("aria-label");
  expect(spoken).toContain(FRESH_TABLE_PRICE);
  expect(spoken).toContain("il tetto del tavolo: nessuno arriva più in alto");

  // NESSUNA NOTA CHE PROMETTA UNA CELLA SPENTA: dopo le due corsie nessuno dei
  // quattro numeri aspetta una dichiarazione di Pico, quindi la testata non
  // nomina più né i valori per giocatore né il profilo di rischio. Il perché
  // sta nella cella, che è dove serve.
  await expect(page.locator("#value-box-note")).not.toContainText(
    "i tuoi valori per giocatore",
  );
  await expect(page.locator("#value-box-note")).not.toContainText(
    "il tuo profilo di rischio",
  );
  // E l'etichetta dei valori dichiarati è uscita dal riquadro: non c'è più un
  // numero costruito su quei valori da qualificare.
  await expect(page.locator("#value-box")).not.toContainText(
    "derivato dai tuoi valori",
  );

  // Le due righe del perché restano DIVERSE: se collassassero, il riquadro
  // direbbe la stessa cosa di due numeri che vengono da due motori.
  const whyAbsolute = await page
    .locator("#value-box-why-valore-assoluto")
    .innerText();
  const whyRelative = await page
    .locator("#value-box-why-valore-relativo")
    .innerText();
  expect(whyAbsolute).not.toBe(whyRelative);
});

test("il riquadro non accende nessun altro output direttivo", async ({
  page,
}) => {
  await boot(page);
  await callPlayer(page, CALLED);

  const text = await page.locator("#value-box").innerText();
  const stripped = text
    .replace(/nessun consiglio/gi, "")
    .replace(/nessun prezzo di mercato previsto/gi, "");
  expect(stripped).not.toMatch(DIRECTIVE);
  await expect(page.locator("#value-box-note")).toContainText(
    "Nessun consiglio",
  );
  await expect(page.locator("#value-box-note")).toContainText(
    "il giudizio è tuo",
  );

  // IL TESTO DEL RIQUADRO SI LEGGE — CON LA MISURA CONDIVISA, non con una
  // seconda scritta qui.
  //
  // Qui c'era una misura di contrasto tutta locale (canvas, sRGB, luminanza).
  // Non dava un falso verde quel giorno, ma erano DUE FONTI DI VERITÀ sullo
  // stesso fatto, e la copia era la meno rigorosa delle due: leggeva
  // `getComputedStyle(el).color` così com'è e si fermava al primo antenato con
  // uno sfondo opaco. Quindi non vedeva NIENTE di ciò che un antenato può fare
  // al colore composito — `opacity`, `filter`, `mix-blend-mode` — né il testo
  // dipinto da `::before` / `::after`. Il giorno in cui un antenato del
  // riquadro guadagna un `opacity: 0.6` la copia continuerebbe a leggere il
  // colore pieno e a dire «si legge» mentre a schermo non si legge più: è
  // esattamente la fuga che helpers.ts ha già chiuso una volta, e riaprirla in
  // un file diverso non la rende meno aperta.
  //
  // DUE GUARDIE, le stesse di e2e/text-contrast-aa.spec.ts e con lo stesso
  // codice di misura:
  //
  //  a. UN ELENCO ESPLICITO di punti d'uso — diagnosticabile, e impossibile da
  //     passare per vuoto: `textContrast` FALLISCE quando l'elemento non c'è o
  //     quando il colore reso non è ricostruibile, invece di restituire un
  //     numero comodo. Una cella che smettesse di essere renderizzata farebbe
  //     rosso qui, non verde per assenza — che è il modo esatto in cui la
  //     versione locale, partendo da `Number.POSITIVE_INFINITY`, sarebbe
  //     passata su un riquadro senza più una riga di testo;
  //  b. LA SPAZZATA sul riquadro intero — non aggirabile: una riga aggiunta
  //     domani dentro `#value-box` viene misurata senza che nessuno debba
  //     ricordarsi di aggiungerla all'elenco, e ciò che non è classificabile
  //     fa rosso col motivo stampato invece di uscire in silenzio.
  for (const sel of [
    "#value-box .panel-title",
    "#value-box-note",
    ...VALUE_SLOT_ORDER.flatMap((id) => [
      `#value-box-cell-${id} em`,
      `#value-box-number-${id}`,
      `#value-box-why-${id}`,
    ]),
  ]) {
    expect(
      await textContrast(page, sel),
      `riquadro del valore: ${sel}`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }

  const swept = await measureAllText(page, "#value-box, #value-box *");
  expect(
    swept.flatMap((m) =>
      m.kind === "unclassified" ? [`${m.reason} — ${m.label}`] : [],
    ),
    "testo del riquadro non classificabile: la spazzata non può dirlo leggibile, quindi lo boccia",
  ).toEqual([]);
  const measured = swept.flatMap((m) => (m.kind === "measured" ? [m] : []));
  // IL CONTO DELLE RIGHE, che è il pezzo che l'elenco esplicito qui sopra non
  // può dare. I due coprono modi di rompersi DIVERSI, non sono un doppione:
  // l'elenco cattura un elemento SPARITO (`textContrast` fallisce quando il
  // selettore non trova niente); questo cattura un elemento rimasto nel DOM ma
  // SVUOTATO DEL TESTO, che l'elenco non vedrebbe perché il colore di un nodo
  // senza testo si misura lo stesso. È un'uguaglianza e non un pavimento:
  // `VALUE_BOX_TEXT_ROWS` descrive la forma esatta del riquadro, quindi una
  // riga in meno e una riga in più devono essere entrambe rosse.
  expect(
    measured.length,
    "le righe di testo misurate nel riquadro non sono quelle che la sua forma prevede: " +
      "riquadro svuotato, spazzata inerte, o una riga nuova che nessuno ha dichiarato",
  ).toBe(VALUE_BOX_TEXT_ROWS);
  expect(
    measured
      .filter((m) => m.exempt === null && m.ratio < AA_NORMAL_TEXT)
      .map(
        (m) =>
          `${m.fg} su ${m.bg} @opacity ${m.opacity.toFixed(2)} = ${m.ratio.toFixed(2)}:1 ` +
          `(${m.fontSize}px) — ${m.label}`,
      ),
    `contrasto del riquadro sotto ${AA_NORMAL_TEXT}:1`,
  ).toEqual([]);
});

test("senza indice nel listone la prima cella tace anche lei, e lo dice", async ({
  page,
}) => {
  await boot(page, POOL_WITHOUT_INDEX);
  await callPlayer(page, CALLED);

  await expect(page.locator("#value-box-number-indice-assoluto")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-indice-assoluto")).toContainText(
    "non porta l'indice",
  );
  // E tace anche la SECONDA, con un motivo suo: senza nessun punteggio non c'è
  // un ordine, e senza ordine «quanti stanno sopra di lui» non è una domanda
  // con risposta. Non è lo stesso `n/d` della prima cella — quello dice che il
  // dato manca, questo dice che senza quel dato il punteggio non esiste. E la
  // frase NOMINA L'ORDINE, non la sua causa: l'ordine può mancare per cinque
  // ragioni diverse e questa cella ne conosce zero, quindi non ne afferma una.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "nessun ordine dichiarato",
  );
  // ...e in particolare NON afferma che il listone non porti l'indice: qui è
  // vero, ma la stessa frase comparirebbe con l'ordine rifiutato o con due
  // ricette, dove il listone l'indice ce l'ha. Quella riga vive nella prima
  // cella, che quel fatto lo conosce davvero.
  await expect(
    page.locator("#value-box-why-indice-relativo"),
  ).not.toContainText("non porta l'indice");
  // Nessuna qualificazione: senza indice non c'è niente da qualificare, e il
  // riquadro non inventa un'etichetta di qualità che il dato non ha portato.
  await expect(page.locator("#value-box-note")).not.toContainText("ricetta");
  // Quattro celle comunque: il riquadro non si accorcia quando non sa.
  await expect(page.locator("#value-box .value-box__cell")).toHaveCount(4);
});

test("l'indice senza verdetto è un n/d diverso da «il listone non porta l'indice»", async ({
  page,
}) => {
  await boot(page);
  await callPlayer(page, "Attaccante Senza Verdetto");

  await expect(page.locator("#value-box-number-indice-assoluto")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-indice-assoluto")).toContainText(
    "non ha verdetto",
  );
  // La qualificazione resta, perché il dato c'è: è il verdetto a mancare.
  await expect(page.locator("#value-box-note")).toContainText(RECIPE);
  // E l'indice RELATIVO tace per la sua ragione, che è ancora un'altra: senza
  // verdetto non entra nell'ordine, quindi non è ultimo — è fuori. Tre `n/d`
  // dell'indice, tre frasi diverse: se collassassero, il riquadro direbbe che
  // si sta aspettando la cosa sbagliata.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(
    VALUE_UNKNOWN,
  );
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "l'indice non lo ordina",
  );
});

// IL NUMERO CHE SI MUOVE, NEL BROWSER VERO — la sola prova che l'indice
// relativo è agganciato allo STATO DELL'ASTA e non a una fotografia del
// caricamento. I test di unità provano il calcolo; questo prova il giro:
// `render()` ricostruisce il DOM dopo un acquisto e la cella cambia.
test("l'indice relativo sale dopo che comprano qualcuno sopra di lui", async ({
  page,
}) => {
  await boot(page, POOL_THREE_RANKED);
  await callPlayer(page, SECOND_BEST);

  // Tre attaccanti ordinati, lui è quello di mezzo: ne precede uno dei due
  // ALTRI, cioè metà. Il quarto attaccante del listone è libero ma SENZA
  // VERDETTO: non entra nell'ordine, quindi non entra nella popolazione — con
  // lui dentro la frazione mostrata non sarebbe quella calcolata.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(
    "50",
  );
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "su 2 altri liberi ordinati",
  );

  // Il migliore passa a un avversario: si torna alla ricerca, lo si chiama, lo
  // si assegna, e poi si torna sul nostro.
  await page.getByText("← Indietro alla ricerca").click();
  await expect(page.locator("#search-player")).toBeVisible();
  await callPlayer(page, CALLED);
  await assignToFirstOpponent(page, 30);

  await callPlayer(page, SECOND_BEST);
  // NESSUNO PIÙ SOPRA DI LUI: precede l'unico altro libero ordinato, quindi
  // tocca il capo alto della scala che Pico ha nominato. Nessuna formula in
  // mezzo — uno in meno da contare al numeratore del rapporto.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(
    "100",
  );
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "su 1 altro libero ordinato",
  );
});
