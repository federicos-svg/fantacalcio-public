// `#234` — IL FLAG «CHI ERA IN GARA» AL SUBMIT, E IL POSTO CHE NON FA MAI
// ASPETTARE L'ASTA.
//
// Tutto sintetico e a rete zero: la guardia di rete di helpers.ts aborta e
// registra qualunque richiesta esterna, e ogni caso riasserisce che l'elenco è
// vuoto.
//
// L'ASSERZIONE CHE CONTA PIÙ DI TUTTE È LA TERZA: con la scrittura del flag
// che fallisce — e SOLO quella, il log d'asta scrive normalmente —
// l'acquisto si registra lo stesso. È il vincolo che governa tutti gli altri:
// il 3 settembre l'assegnazione deve riuscire sempre, e un dato di contorno
// non può mai essere la ragione per cui non riesce.
import { expect, test, type Page } from "@playwright/test";
import { listonePlayerKey } from "../src/ui/listone.js";
import { INTEREST_FLAGS_STORAGE_KEY } from "../src/interestFlags.js";
import {
  E2E_PURCHASE_PRICE,
  E2E_TARGET_PLAYER,
  SYNTHETIC_LISTONE_POOL,
} from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  readLocalStorageJson,
  selectListoneRowByName,
} from "./helpers.js";

const LOG_STORAGE_KEY = "fac_log";

interface QueuedFlag {
  readonly purchaseSeq: number;
  readonly playerId: string;
  readonly winnerFantaTeamId: string;
  readonly price: number;
  readonly contenders: readonly string[];
  readonly flaggedAt: string;
}

interface FlagEnvelope {
  readonly schemaVersion: number;
  readonly pending: readonly QueuedFlag[];
}

/** Riga di listone -> «Avvia» -> il momento d'asta, con il gesto a schermo. */
async function openAsta(page: Page, playerName: string): Promise<void> {
  await selectListoneRowByName(page, playerName);
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

async function registerPurchase(page: Page, price: number): Promise<void> {
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
}

test("il gesto: sette pastiglie, un clic ciascuna, e la marcatura finisce in coda con l'acquisto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await openAsta(page, E2E_TARGET_PLAYER.name);

  // SETTE pastiglie: gli avversari, mai il mio posto. La domanda è su di loro.
  const chips = page.locator("#interest-flag-row .interest-chip");
  await expect(chips).toHaveCount(7);
  await expect(page.locator("#interest-flag-Io")).toHaveCount(0);

  // Il gesto è UN clic per avversario: nessun modulo, nessuna conferma.
  await expect(page.locator("#interest-flag-Squadra3")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#interest-flag-Squadra3").click();
  await page.locator("#interest-flag-Squadra5").click();
  await expect(page.locator("#interest-flag-Squadra3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#interest-flag-Squadra5")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#interest-flag-summary")).toContainText("2 marcati");

  // Reversibile con lo stesso clic: una marcatura sbagliata si toglie.
  await page.locator("#interest-flag-Squadra5").click();
  await expect(page.locator("#interest-flag-Squadra5")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#interest-flag-Squadra5").click();

  // MARCARE NON HA TOCCATO IL GESTO PRINCIPALE: il prezzo battuto prima delle
  // pastiglie è ancora lì (le pastiglie non ridipingono la schermata) e il
  // bottone è pronto.
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.locator("#interest-flag-Squadra7").click();
  await expect(page.locator("#assign-price")).toHaveValue(String(E2E_PURCHASE_PRICE));

  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  // L'acquisto è nel log d'asta, come sempre.
  const log = await readLocalStorageJson<readonly { seq: number; type: string }[]>(page, LOG_STORAGE_KEY);
  expect(log).toHaveLength(1);
  expect(log![0]).toMatchObject({ type: "PURCHASE", seq: 0 });

  // Il flag è in una coda SEPARATA, con la propria chiave e il proprio
  // envelope: non è un evento, non entra nella contabilità.
  const queue = await readLocalStorageJson<FlagEnvelope>(page, INTEREST_FLAGS_STORAGE_KEY);
  expect(queue?.schemaVersion).toBe(1);
  expect(queue?.pending).toHaveLength(1);
  expect(queue!.pending[0]).toMatchObject({
    purchaseSeq: 0,
    playerId: listonePlayerKey(E2E_TARGET_PLAYER),
    winnerFantaTeamId: "Io",
    price: E2E_PURCHASE_PRICE,
  });
  expect([...queue!.pending[0]!.contenders].sort()).toEqual(["Squadra3", "Squadra5", "Squadra7"]);
  // Posti, mai persone: nella coda non compare nessuna etichetta umana.
  expect(JSON.stringify(queue)).not.toContain("displayName");

  // LA CODA SOPRAVVIVE: un reload non la perde e non la trasforma in altro.
  await page.reload();
  const afterReload = await readLocalStorageJson<FlagEnvelope>(page, INTEREST_FLAGS_STORAGE_KEY);
  expect(afterReload).toEqual(queue);

  expect(externalRequests).toEqual([]);
});

test("saltarlo non costa niente: nessuna marcatura, nessun avviso, e la coda lo dice a voce", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await openAsta(page, E2E_TARGET_PLAYER.name);
  await expect(page.locator("#interest-flag-summary")).toHaveText("Nessuno marcato");

  // Zero clic sulle pastiglie: si va dritti al bottone.
  await registerPurchase(page, E2E_PURCHASE_PRICE);

  // Nessun avviso, nessuna conferma, nessuna riga rossa: non marcare niente è
  // un esito normale.
  await expect(page.locator("#interest-flag-notice")).toHaveCount(0);
  await expect(page.locator("#pool-notice")).toHaveCount(0);
  await expect(page.getByText(/marcatura/i)).toHaveCount(0);

  // «Nessuno marcato» viene comunque registrato: non è la stessa cosa di «non
  // gli è stato chiesto».
  const queue = await readLocalStorageJson<FlagEnvelope>(page, INTEREST_FLAGS_STORAGE_KEY);
  expect(queue?.pending).toHaveLength(1);
  expect(queue!.pending[0]!.contenders).toEqual([]);

  expect(externalRequests).toEqual([]);
});

test("IL CASO CHE CONTA: se il salvataggio del flag fallisce, l'acquisto si registra LO STESSO", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  // La scrittura fallisce SOLO per la chiave della coda dei flag: il log
  // d'asta scrive normalmente. È il taglio che rende l'asserzione onesta —
  // uno storage rotto per tutti proverebbe soltanto che l'app si blocca.
  await page.addInitScript(({ flagsKey }) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string): void {
      if (key === flagsKey) throw new DOMException("quota synthetic", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, { flagsKey: INTEREST_FLAGS_STORAGE_KEY });

  await page.goto("/");
  await openAsta(page, E2E_TARGET_PLAYER.name);
  await page.locator("#interest-flag-Squadra4").click();
  await registerPurchase(page, E2E_PURCHASE_PRICE);

  // 1. L'ACQUISTO C'È. Nel log persistito, con il suo prezzo.
  const log = await readLocalStorageJson<readonly Record<string, unknown>[]>(page, LOG_STORAGE_KEY);
  expect(log).toHaveLength(1);
  expect(log![0]).toMatchObject({
    type: "PURCHASE",
    playerId: listonePlayerKey(E2E_TARGET_PLAYER),
    fantaTeamId: "Io",
    price: E2E_PURCHASE_PRICE,
  });

  // 2. La schermata è tornata alla chiamata come dopo ogni acquisto riuscito,
  //    e la CONTABILITÀ si è mossa: budget e speso sono quelli dell'acquisto.
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE} cr`);
  await expect(page.locator("#critical-spent")).toHaveText(`${E2E_PURCHASE_PRICE} cr`);

  // 3. NESSUN messaggio di persistenza fallita del LOG: la garanzia
  //    fail-closed dell'asta non è stata toccata, né indebolita.
  await expect(page.locator("#pool-notice")).toHaveCount(0);
  await expect(page.getByText(/NON è stata applicata/i)).toHaveCount(0);

  // 4. Il flag perso viene DICHIARATO, a voce bassa e dicendo per prima cosa
  //    che l'acquisto è registrato. Non è un alert.
  const notice = page.locator("#interest-flag-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Acquisto registrato");
  await expect(notice).toHaveAttribute("role", "status");

  // 5. La coda su disco non esiste (la scrittura è stata rifiutata) e l'app
  //    non ha fatto finta del contrario.
  expect(await readLocalStorageJson<FlagEnvelope>(page, INTEREST_FLAGS_STORAGE_KEY)).toBeNull();

  // 6. E l'asta continua: un secondo acquisto passa comunque.
  await page.getByRole("button", { name: "✕ Reset", exact: true }).click();
  await openAsta(page, "Carlo Esempio");
  await registerPurchase(page, 7);
  const log2 = await readLocalStorageJson<readonly unknown[]>(page, LOG_STORAGE_KEY);
  expect(log2).toHaveLength(2);

  expect(externalRequests).toEqual([]);
});

test("le marcature appartengono al loro giocatore: cambiare chiamata non le porta con sé", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await openAsta(page, E2E_TARGET_PLAYER.name);
  await page.locator("#interest-flag-Squadra2").click();
  await expect(page.locator("#interest-flag-summary")).toContainText("1 marcati");

  // Indietro, ricerca azzerata, e un altro giocatore: le pastiglie ripartono
  // spente. Il Reset è quello vero dell'app (svuota i tre campi di ricerca e
  // la selezione), non una scorciatoia del test.
  await page.getByText("← Indietro alla ricerca").click();
  await page.getByRole("button", { name: "✕ Reset", exact: true }).click();
  await openAsta(page, "Carlo Esempio");
  await expect(page.locator("#interest-flag-summary")).toHaveText("Nessuno marcato");
  await expect(page.locator("#interest-flag-Squadra2")).toHaveAttribute("aria-pressed", "false");

  // E l'acquisto del secondo giocatore non porta con sé la marcatura del primo.
  await registerPurchase(page, 9);
  const queue = await readLocalStorageJson<FlagEnvelope>(page, INTEREST_FLAGS_STORAGE_KEY);
  expect(queue?.pending).toHaveLength(1);
  expect(queue!.pending[0]!.contenders).toEqual([]);

  expect(externalRequests).toEqual([]);
});

test("il posto della risposta lenta dichiara i propri stati e non blocca mai lo schermo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await openAsta(page, E2E_TARGET_PLAYER.name);

  // IL POSTO C'È E NON SI VEDE PIÙ. «#late-answer-panel questo componente non
  // serve più» — Pico, 2026-08-29. Nascosto, non smontato: il riquadro
  // continua a essere costruito e a DICHIARARE il proprio stato, ed è quel
  // che questo test verifica riga per riga qui sotto. Se un giorno torna a
  // schermo, torna con gli stati già onesti invece che da riscrivere; se
  // qualcuno smette di costruirlo, `toHaveCount(1)` diventa rossa.
  const panel = page.locator("#late-answer-panel");
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeHidden();
  // Nessuna fonte collegata in questa versione: lo stato dichiarato è «non
  // richiesta», e il riquadro lo DICE invece di sembrare rotto o di far
  // sembrare che stia preparando qualcosa.
  await expect(panel).toHaveAttribute("data-state", "non-richiesta");
  await expect(page.locator("#late-answer-status")).toHaveText("Non richiesta.");
  await expect(page.locator("#late-answer-note")).toContainText("Nessuna fonte è collegata");

  // NIENTE CONTENUTO FINTO finché non è arrivata: il corpo non esiste proprio.
  await expect(page.locator("#late-answer-body")).toHaveCount(0);

  // NON BLOCCA: nessuno spinner, nessun overlay, e il gesto principale è
  // pienamente usabile mentre il posto è vuoto.
  await expect(page.locator("[role=progressbar]")).toHaveCount(0);
  await expect(page.locator(".modal-overlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toBeEnabled();
  await expect(page.locator("#assign-price")).toBeEditable();

  // E IL POSTO NON PUÒ SPINGERE «ASSEGNA A» DA NESSUNA PARTE. La misura era
  // «il riquadro sta più in basso del gesto»; da nascosto non ha geometria —
  // il suo rettangolo è di zeri — quindi quella riga proverebbe il falso in un
  // senso o nell'altro. La pretesa che portava resta, in forma più forte:
  // OCCUPA ZERO ALTEZZA, cioè non può spostare il gesto nemmeno di un pixel.
  // Il giorno in cui torna a schermo questa riga diventa rossa e va
  // ripristinato il confronto con `#assign-block`.
  const lateHeight = await page.evaluate(
    () => document.querySelector("#late-answer-panel")?.getBoundingClientRect().height ?? null,
  );
  expect(lateHeight, "il posto della risposta lenta non costa altezza al gesto").toBe(0);

  expect(externalRequests).toEqual([]);
});
