import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { VALUE_SLOT_LABELS, VALUE_UNKNOWN } from "../src/ui/valueBox.js";
import { VALUE_SLOT_ORDER } from "../src/valueBox.js";
import { AA_NORMAL_TEXT, installSyntheticNetworkGuard, selectListoneRowByName } from "./helpers.js";

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
//  c. IL NUMERO CHE L'APP SA DAVVERO CALCOLARE è quello vero: l'indice
//     assoluto è il punteggio servito col listone, non un arrotondamento;
//  d. NIENTE DI DIRETTIVO si accende insieme: né le parole né i numeri di
//     `target_band`/`stretch_cap`/«prendilo fino a», e il testo si legge (AA).
//
// COSA QUESTA SPEC NON PUÒ PROVARE, e va detto invece che nascosto: i due
// numeri in crediti hanno bisogno di due dichiarazioni di Pico — i valori per
// giocatore e il profilo di rischio — che il core pubblico non ha ancora un
// posto dove raccogliere. Nel giro vero quelle due celle dicono quindi `n/d` e
// dicono quale dichiarazione manca; che portino i numeri giusti quando la
// dichiarazione c'è è misurato in src/valueBox.test.ts sulla catena vera del
// motore. Le due misure insieme coprono i quattro numeri; nessuna delle due,
// da sola, mente sull'altra.
//
// Tutte le righe sono sintetiche — nomi, club, punteggi e ricetta — e il
// network guard aborta qualunque altra richiesta.

const RECIPE = "APPEAL-INDEX-RECIPE@0.0.0-sintetica";
const QUALITY = "sperimentale — fixture sintetica, non validato";

const CALLED = "Attaccante Sintetico";
const CALLED_SCORE = 73;

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
  await expect(page.locator("#value-box-number-valore-relativo")).toHaveText(VALUE_UNKNOWN);
  await expect(page.locator("#value-box-note")).toContainText("i tuoi valori per giocatore");
  await expect(page.locator("#value-box-note")).toContainText("il tuo profilo di rischio");
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

  // Il testo del riquadro si legge: nessuna riga nuova sotto WCAG AA.
  const worst = await page.evaluate(() => {
    const srgb = (c: number): number => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const parse = (value: string): readonly [number, number, number, number] => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r!, g!, b!, a! / 255];
    };
    const luminance = (rgb: readonly [number, number, number]): number =>
      0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
    const backgroundOf = (el: Element): readonly [number, number, number] => {
      let node: Element | null = el;
      while (node !== null) {
        const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
        if (a > 0) return [r, g, b];
        node = node.parentElement;
      }
      return [0, 0, 0];
    };
    const ratio = (fg: readonly [number, number, number], bg: readonly [number, number, number]): number => {
      const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
      return (a + 0.05) / (b + 0.05);
    };
    const box = document.getElementById("value-box")!;
    let worstRatio = Number.POSITIVE_INFINITY;
    for (const el of [box, ...box.querySelectorAll("*")]) {
      const hasOwnText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      if (!hasOwnText) continue;
      const [r, g, b] = parse(getComputedStyle(el).color);
      worstRatio = Math.min(worstRatio, ratio([r, g, b], backgroundOf(el)));
    }
    return worstRatio;
  });
  expect(worst).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
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
