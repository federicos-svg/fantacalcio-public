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
// ASSOLUTO ha bisogno di due dichiarazioni di Pico — i valori per giocatore e
// il profilo di rischio — che il core pubblico non ha ancora un posto dove
// raccogliere. Nel giro vero quella cella dice quindi `n/d` e dice quale
// dichiarazione manca; che porti il numero giusto quando la dichiarazione c'è è
// misurato in src/valueBox.test.ts sulla catena vera del motore. Le due misure
// insieme coprono i quattro numeri; nessuna delle due, da sola, mente
// sull'altra.
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

async function boot(page: Page, pool: readonly ListonePlayer[] = POOL): Promise<void> {
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

  // Gli altri tre dicono `n/d` E dicono perché: l'indice relativo perché la
  // formula non è decisa, i due in crediti perché manca una dichiarazione.
  await expect(page.locator("#value-box-number-indice-relativo")).toHaveText(VALUE_UNKNOWN);
  await expect(page.locator("#value-box-why-indice-relativo")).toContainText(
    "formula non decisa",
  );
  await expect(page.locator("#value-box-number-valore-assoluto")).toHaveText(VALUE_UNKNOWN);
  await expect(page.locator("#value-box-note")).toContainText("i tuoi valori per giocatore");
  await expect(page.locator("#value-box-note")).toContainText("il tuo profilo di rischio");
  // E la nota promette UNA cella, non due: il valore relativo non aspetta
  // nessuna dichiarazione.
  await expect(page.locator("#value-box-note")).toContainText("Il valore assoluto resta n/d");

  // Il VALORE RELATIVO, invece, porta il numero del tavolo, con la riga che
  // dice da dove viene — e senza l'etichetta dei valori dichiarati, che
  // qualificherebbe un numero che da quei valori non passa.
  await expect(page.locator("#value-box-number-valore-relativo")).toHaveText(FRESH_TABLE_PRICE);
  await expect(page.locator("#value-box-why-valore-relativo")).toHaveText(
    "il secondo max bid al tavolo, +1",
  );
});

test("il riquadro non accende nessun altro output direttivo", async ({ page }) => {
  await boot(page);
  await callPlayer(page, CALLED);

  const text = await page.locator("#value-box").innerText();
  const stripped = text
    .replace(/nessun consiglio/gi, "")
    .replace(/nessun prezzo di mercato previsto/gi, "");
  expect(stripped).not.toMatch(DIRECTIVE);
  await expect(page.locator("#value-box-note")).toContainText("Nessun consiglio");
  await expect(page.locator("#value-box-note")).toContainText("il giudizio è tuo");

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
    swept.flatMap((m) => (m.kind === "unclassified" ? [`${m.reason} — ${m.label}`] : [])),
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

test("senza indice nel listone la prima cella tace anche lei, e lo dice", async ({ page }) => {
  await boot(page, POOL_WITHOUT_INDEX);
  await callPlayer(page, CALLED);

  await expect(page.locator("#value-box-number-indice-assoluto")).toHaveText(VALUE_UNKNOWN);
  await expect(page.locator("#value-box-why-indice-assoluto")).toContainText(
    "non porta l'indice",
  );
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

  await expect(page.locator("#value-box-number-indice-assoluto")).toHaveText(VALUE_UNKNOWN);
  await expect(page.locator("#value-box-why-indice-assoluto")).toContainText("non ha verdetto");
  // La qualificazione resta, perché il dato c'è: è il verdetto a mancare.
  await expect(page.locator("#value-box-note")).toContainText(RECIPE);
});
