// #237 T19 — LA SERA DELL'ASTA, QUANDO QUALCOSA VA STORTO.
//
// LA DOMANDA A CUI QUESTA SPEC RISPONDE non è «i test passano», ma: che cosa
// vede Pico a schermo quando una fonte cade, e l'app lo DICHIARA o finge che
// vada tutto bene? Un pannello vuoto che sembra «non c'è niente da dire»
// invece di «non ho letto la fonte» è il difetto peggiore possibile in questo
// progetto, e ne è già stato corretto uno identico.
//
// PERCORRE SOLO TERRENO NUOVO. I modi di guasto già coperti restano dove sono
// e non vengono riscritti qui: deposito irraggiungibile e deposito che risponde
// con l'index.html della SPA sono in e2e/listone-remote-deposit.spec.ts; la
// quota piena sulla chiave del listone al boot è in
// e2e/listone-pool-storage-faults.spec.ts; la quota piena durante un
// ANNULLAMENTO è in e2e/void-errors.spec.ts; il boot con storage che lancia in
// lettura è in e2e/recovery-storage-faults.spec.ts. Quello che nessuno
// percorreva, e che questa spec percorre:
//
//   D1  il deposito risponde OLTRE il timeout (4 s) — la schermata resta
//       inchiodata sul vuoto per tutto quel tempo, o il listone locale è già
//       lì? È l'unico caso in cui il ritardo si vede a occhio nudo, ed è
//       esattamente lo scenario di una connessione di sala satura;
//   D2  il deposito risponde 200 application/json con JSON TRONCATO — non una
//       forma sbagliata (già coperta), ma testo che JSON.parse non digerisce;
//   D3  il deposito risponde 500 con un corpo d'errore JSON;
//   D4  la quota del browser è piena AL MOMENTO DELL'ACQUISTO, con l'asta già
//       in corso — l'acquisto risulta registrato a schermo mentre non lo è?
//   D5  la quota è piena in modo TOTALE (nessuna scrittura passa) durante un
//       acquisto: qui nemmeno il rollback può essere verificato, e la
//       persistenza resta in stato indeterminato;
//   D6  la rete cade A METÀ ASTA, con acquisti già registrati: l'app resta
//       usabile per registrarne altri, e quello che ha scritto sopravvive a un
//       reload fatto da offline.
//
// ZERO RETE ESTERNA in ogni caso: `installSyntheticNetworkGuard` aborta e
// registra qualunque richiesta fuori dall'origine, e ogni test asserisce che
// la lista sia vuota.
// LE NOTE SOTTO LA TABELLA DEL LISTONE NON SONO PIÙ A SCHERMO — «nascondi i
// blocchi nello screenshot», Pico, 2026-08-29. Restano SCRITTE nel documento,
// quindi ogni pretesa sul loro CONTENUTO vale ancora parola per parola: dove
// c'era `toBeVisible()` ora c'è `toBeHidden()`, e le righe che provano la
// provenienza del dato non si toccano. La provenienza non si perde nemmeno
// per chi naviga a voce: la porta l'`aria-label` del pannello del listone
// (src/ui/views.ts), come Pico ha deciso per la provenienza della fascia.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  SYNTHETIC_LISTONE_POOL,
  SYNTHETIC_REMOTE_LISTONE_POOL,
  E2E_TARGET_PLAYER,
  E2E_PURCHASE_PRICE,
} from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  readLocalStorageRaw,
  readLocalStorageJson,
  selectStatusFilter,
  LISTONE_REMOTE_PATH,
} from "./helpers.js";

const LOG_KEY = "fac_log";
const LKG_KEY = "fac_log_lkg";

/** La nota che l'app scrive quando a schermo c'è il file spedito, non il deposito. */
const FALLBACK_NOTE = "Listone 2025/26 — fallback temporaneo caricato automaticamente";
/** La nota che l'app scrive SOLO quando il deposito privato ha davvero risposto. */
const REMOTE_NOTE = "Listone aggiornato automaticamente dal deposito privato";

/** Il timeout che `fetchRemoteListone` applica al deposito (src/main.ts). */
const DEPOSIT_TIMEOUT_MS = 4000;

/**
 * Risponde a `/api/listone` fuori dal guard. Registrata DOPO di lui:
 * Playwright valuta i route handler dal più recente, quindi questa vince senza
 * toccare il guard — la stessa tecnica di e2e/player-insight.spec.ts.
 */
async function routeDeposit(
  context: BrowserContext,
  answer:
    | { readonly kind: "slow"; readonly delayMs: number }
    | { readonly kind: "truncated-json" }
    | { readonly kind: "server-error" },
): Promise<void> {
  await context.route(`**${LISTONE_REMOTE_PATH}`, async (route) => {
    if (answer.kind === "slow") {
      await new Promise((r) => setTimeout(r, answer.delayMs));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SYNTHETIC_REMOTE_LISTONE_POOL),
      });
    }
    if (answer.kind === "truncated-json") {
      // Content-type ineccepibile, corpo tagliato a metà: è il modo in cui una
      // connessione che cade durante il download si presenta al parser.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SYNTHETIC_REMOTE_LISTONE_POOL).slice(0, 40),
      });
    }
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: `{"error":"deposit_unavailable"}`,
    });
  });
}

/** Il listone spedito è a schermo, e la nota dice che è il fallback. */
async function expectStaticPoolStatedHonestly(page: Page): Promise<void> {
  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(FALLBACK_NOTE)).toBeHidden();
  // E soprattutto: NON dichiara una freschezza che non ha.
  await expect(page.getByText(REMOTE_NOTE)).toHaveCount(0);
  await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
  // Nessuna riga del deposito è trapelata a schermo.
  for (const player of SYNTHETIC_REMOTE_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toHaveCount(0);
  }
}

/**
 * Apre l'asta su una riga del listone e si ferma lì: schermata del gesto
 * aperta, prezzo non ancora battuto, niente registrato. Metà di `purchase()`,
 * estratta e non duplicata, perché D4 ha bisogno di guardare la contabilità a
 * schermo NELL'ISTANTE fra l'apertura e la registrazione — l'unico in cui si
 * può fotografare la stessa superficie che si rileggerà dopo il rifiuto.
 */
async function openAstaOn(page: Page, playerName: string): Promise<void> {
  await page.getByText(playerName, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
}

/** L'altra metà: batte il prezzo sull'asta già aperta e preme il gesto. */
async function registerOpenAsta(page: Page, price: number): Promise<void> {
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
}

/** Registra un acquisto dal listone, dal click alla conferma. */
async function purchase(page: Page, playerName: string, price: number): Promise<void> {
  await openAstaOn(page, playerName);
  await registerOpenAsta(page, price);
}

/**
 * LA CONTABILITÀ DELLA SQUADRA DI PICO, LETTA DOVE IL MOMENTO IN CORSO LA
 * SCRIVE. La striscia critica (`#critical-budget`) risponde nel momento
 * CHIAMATA; nel momento ASTA la stessa riga di conti sta nel pannello «TAVOLO —
 * BUDGET E MAX BID», e la sua etichetta parlata porta per esteso i due numeri
 * della squadra propria: budget residuo e max bid.
 *
 * Non è un ripiego più debole della striscia: budget e max bid escono dalla
 * STESSA `deriveAuctionState()` che alimenta `#critical-budget`, e max bid
 * dipende anche dagli slot ancora da riempire — quindi un acquisto fantasma
 * applicato di nascosto muoverebbe questa stringa due volte, non una.
 */
function selfTableRow(page: Page) {
  return page.locator(".war-board-mini__item--self");
}

test.describe("#237 — il deposito privato che risponde male, e che cosa resta a schermo", () => {
  test("D1: un deposito più lento del timeout non lascia MAI la schermata vuota, e non finge freschezza", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    // Risponde bene, ma un secondo e mezzo DOPO che l'app ha smesso di
    // aspettare: la risposta arriva, e deve arrivare a vuoto.
    await routeDeposit(context, { kind: "slow", delayMs: DEPOSIT_TIMEOUT_MS + 1500 });

    const startedAt = Date.now();
    await page.goto("/");
    // LA MISURA CHE CONTA: le righe locali sono a schermo BEN PRIMA che il
    // timeout del deposito scada. Se il boot aspettasse il deposito, questa
    // attesa non potrebbe chiudersi entro il timeout.
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible({
      timeout: DEPOSIT_TIMEOUT_MS - 1000,
    });
    const paintedAfterMs = Date.now() - startedAt;
    expect(
      paintedAfterMs,
      `il listone locale è comparso dopo ${paintedAfterMs} ms: la schermata resta vuota mentre il deposito fa aspettare`,
    ).toBeLessThan(DEPOSIT_TIMEOUT_MS);

    // E quando la risposta tardiva arriva davvero, non ribalta lo schermo: la
    // richiesta è già stata abortita, quindi il fallback resta e resta detto.
    await page.waitForTimeout(DEPOSIT_TIMEOUT_MS + 2500);
    await expectStaticPoolStatedHonestly(page);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("D2: un deposito che risponde JSON troncato non svuota la schermata e non si dichiara fresco", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await routeDeposit(context, { kind: "truncated-json" });

    await page.goto("/");
    await expectStaticPoolStatedHonestly(page);
    // Il JSON troncato non è arrivato a `JSON.parse` senza rete di sicurezza:
    // nessun errore non gestito ha ucciso il render.
    expect(pageErrors).toEqual([]);

    // E non ha nemmeno sporcato la copia offline: quella che resta salvata è
    // il listone spedito, l'unica fonte che ha davvero prodotto righe.
    const persisted = await readLocalStorageJson<unknown[]>(page, "fac_pool");
    expect(persisted).toEqual(SYNTHETIC_LISTONE_POOL);
    expect(externalRequests).toEqual([]);
  });

  test("D3: un deposito che risponde 500 lascia il listone spedito a schermo, dichiarato per quello che è", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await routeDeposit(context, { kind: "server-error" });

    await page.goto("/");
    await expectStaticPoolStatedHonestly(page);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
});

test.describe("#237 — la memoria del browser che si riempie MENTRE l'asta è in corso", () => {
  test("D4: un acquisto che non si può salvare è dichiarato NON applicato, e non compare da nessuna parte", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");

    // PRIMO acquisto con storage sano: l'asta è già in corso quando il guasto
    // arriva, che è la sola forma in cui questo guasto conta davvero.
    await purchase(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE);
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      E2E_TARGET_PLAYER.name,
    );
    const budgetAfterFirst = await page.locator("#critical-budget").textContent();
    const logAfterFirst = await readLocalStorageRaw(page, LOG_KEY);
    expect(logAfterFirst).not.toBeNull();

    // Ora la chiave canonica dello storico non accetta più scritture: è la
    // quota piena, o un browser che nega la scrittura a metà serata.
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
        if (k === key) throw new DOMException("quota piena", "QuotaExceededError");
        return original.call(this, k, v);
      };
    }, LOG_KEY);

    // Il secondo acquisto, aperto e registrato in due passi invece che in uno:
    // con l'asta aperta e il prezzo non ancora battuto, la contabilità a
    // schermo è ancora quella del PRIMO acquisto, e si fotografa qui. È lo
    // stesso pannello, nello stesso momento, che verrà riletto dopo il
    // rifiuto: un confronto fra due letture della stessa superficie, non fra
    // due superfici diverse.
    await openAstaOn(page, "Carlo Esempio");
    // PRONTEZZA — e NON la presenza di un pannello. Che il momento asta sia
    // renderizzato lo dice il campo del prezzo, cioè il controllo su cui il
    // gesto è costruito e che le due righe successive useranno comunque; un
    // pannello informativo può cambiare casa fra due rami senza che nessuno
    // rompa niente, ed è esattamente così che una spec finisce ad aspettare in
    // silenzio una schermata che è già pronta.
    await expect(page.locator("#assign-price")).toBeVisible();
    // Il pannello TAVOLO è letto come VALORE, con la sua asserzione davanti:
    // se un giorno non porta più il budget, questa riga lo dice in cinque
    // secondi e con il suo nome, invece di scadere sul timeout del test.
    await expect(selfTableRow(page)).toHaveAttribute(
      "aria-label",
      /budget residuo \d+ crediti/,
    );
    const tableBeforeFault = await selfTableRow(page).getAttribute("aria-label");
    const budgetTextBeforeFault = await selfTableRow(page)
      .locator(".war-board-mini__budget")
      .textContent();
    await registerOpenAsta(page, 7);

    // 1. L'APP LO DICE, e lo dice senza ambiguità.
    const alert = page.getByRole("alert").filter({ hasText: /Impossibile salvare nel browser/ });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("NON è stata applicata");

    // 2. E NON MENTE A SCHERMO: il secondo giocatore non è nello storico, il
    //    budget non si è mosso, il conteggio della rosa nemmeno.
    //
    //    Il conto si rilegge dove il momento in corso lo scrive. Dopo un
    //    salvataggio rifiutato l'app RESTA nel momento asta — il gesto non è
    //    andato a buon fine, quindi la chiamata è ancora aperta — e in quel
    //    momento la striscia critica non è montata per decisione di prodotto
    //    (#331 punto 5: la stessa contabilità è risposta dalla nota «max bid
    //    sicuro» della scheda e dal pannello TAVOLO, e lo spazio verticale
    //    torna al gesto). Cercare `#critical-budget` qui non misurerebbe la
    //    lealtà della schermata: misurerebbe in quale momento si trova.
    //
    //    Il pannello TAVOLO invece è a schermo, ed è più severo di un numero
    //    solo: l'etichetta parlata porta budget residuo E max bid, e max bid
    //    dipende dagli slot ancora da riempire. Un acquisto fantasma applicato
    //    di nascosto muoverebbe entrambi — cioè anche il conteggio della rosa
    //    che questa riga promette di sorvegliare.
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).not.toContainText(
      "Carlo Esempio",
    );
    await expect(selfTableRow(page)).toHaveAttribute("aria-label", tableBeforeFault ?? "");
    await expect(selfTableRow(page).locator(".war-board-mini__budget")).toHaveText(
      budgetTextBeforeFault ?? "",
    );

    // 3. E LO STORAGE È ESATTAMENTE COM'ERA: nessuna scrittura parziale, il
    //    rollback della copia di sicurezza è tornato al valore precedente.
    expect(await readLocalStorageRaw(page, LOG_KEY)).toBe(logAfterFirst);
    const events = await readLocalStorageJson<Array<{ playerId?: string }>>(page, LOG_KEY);
    expect(events).toHaveLength(1);

    // 4. E il primo acquisto sopravvive comunque a un reload: quello che era
    //    salvato PRIMA del guasto non è stato trascinato via dal guasto.
    //    Qui `#critical-budget` torna a essere la lettura giusta senza che
    //    nessuno apra niente per farlo comparire: il reload riporta l'app nel
    //    momento chiamata, che è il momento in cui la striscia critica vive.
    await page.reload();
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      E2E_TARGET_PLAYER.name,
    );
    await expect(page.locator("#critical-budget")).toHaveText(budgetAfterFirst ?? "");
    expect(externalRequests).toEqual([]);
  });

  test("D5: quota piena TOTALE durante un acquisto — la persistenza si dichiara indeterminata e blocca, invece di proseguire", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");
    await purchase(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE);
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      E2E_TARGET_PLAYER.name,
    );

    // Il caso peggiore: nessuna scrittura passa più, nemmeno quella del
    // rollback. L'app non può nemmeno VERIFICARE di aver rimesso le cose a
    // posto, e questo è precisamente ciò che non deve tacere.
    await page.evaluate(
      ([logKey, lkgKey]) => {
        const originalSet = Storage.prototype.setItem;
        const originalRemove = Storage.prototype.removeItem;
        const guarded = (k: string): boolean => k === logKey || k === lkgKey;
        Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
          if (guarded(k)) throw new DOMException("quota piena", "QuotaExceededError");
          return originalSet.call(this, k, v);
        };
        Storage.prototype.removeItem = function patched(this: Storage, k: string): void {
          if (guarded(k)) throw new DOMException("quota piena", "QuotaExceededError");
          return originalRemove.call(this, k);
        };
      },
      [LOG_KEY, LKG_KEY] as const,
    );

    await purchase(page, "Carlo Esempio", 7);

    // La schermata di blocco LIVE-02, con la sua parola e il suo modo di
    // uscirne: non un avviso che si può ignorare continuando a comprare.
    await expect(page.getByText(/Persistenza in stato indeterminato/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();
    expect(externalRequests).toEqual([]);
  });
});

test.describe("#237 — la rete che cade a metà asta, con acquisti già registrati", () => {
  test("D6: offline dopo il primo acquisto, il secondo si registra lo stesso e sopravvive a un reload da offline", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");

    // Primo acquisto: rete su, tutto normale.
    await purchase(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE);
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      E2E_TARGET_PLAYER.name,
    );

    // LA RETE CADE. Nessun avvertimento, nessun momento buono: succede e basta.
    await context.setOffline(true);

    // SECONDO ACQUISTO DA OFFLINE. La contabilità dell'asta è tutta locale, e
    // deve continuare a funzionare: è la sola cosa che non può fermarsi.
    await purchase(page, "Carlo Esempio", 7);
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      "Carlo Esempio",
    );
    // Nessun falso allarme di persistenza: il salvataggio locale non passa
    // dalla rete, quindi non deve nemmeno lamentarsene.
    await expect(page.getByText(/Impossibile salvare nel browser/)).toHaveCount(0);
    await expect(page.getByText(/Persistenza in stato indeterminato/)).toHaveCount(0);

    // Entrambi gli acquisti sono DAVVERO scritti, non solo a schermo.
    const events = await readLocalStorageJson<Array<{ type: string; price?: number }>>(page, LOG_KEY);
    expect(events?.map((e) => e.type)).toEqual(["PURCHASE", "PURCHASE"]);

    // ANCHE UN ANNULLAMENTO funziona da offline: è la correzione che serve
    // proprio nel momento peggiore. `#undo-purchase-1` è l'ULTIMO acquisto
    // registrato (i due «Annulla» a schermo sono uno per riga di storico).
    await page.locator("#undo-purchase-1").click();
    await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
    const afterVoid = await readLocalStorageJson<Array<{ type: string }>>(page, LOG_KEY);
    expect(afterVoid?.map((e) => e.type)).toEqual(["PURCHASE", "PURCHASE", "VOID"]);

    // IL RELOAD DA OFFLINE — il gesto che fa più paura la sera dell'asta.
    // L'app riparte dalla copia locale e ritrova lo stato esatto, VOID incluso.
    await page.reload();
    await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(
      E2E_TARGET_PLAYER.name,
    );
    const afterReload = await readLocalStorageJson<Array<{ type: string }>>(page, LOG_KEY);
    expect(afterReload).toEqual(afterVoid);
    // E il listone non è sparito con la rete: la copia salvata lo tiene, e la
    // riconciliazione con il log regge — il giocatore ancora acquistato resta
    // fuori dai «Liberi» ed è ritrovabile fra gli «Assegnati».
    //
    // Il locator è ristretto alle RIGHE del listone di proposito: lo stesso
    // nome compare anche nella war board e nello storico, e un `getByText`
    // nudo resterebbe verde su una tabella vuota grazie a quelle occorrenze.
    const stillFree = SYNTHETIC_LISTONE_POOL.filter((p) => p.name !== E2E_TARGET_PLAYER.name);
    await expect(page.locator(".listone-row > div:first-child")).toHaveText(
      stillFree.map((p) => p.name),
    );
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    await selectStatusFilter(page, "assigned");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText(
      "Assegnato",
    );

    await context.setOffline(false);
    expect(externalRequests).toEqual([]);
  });
});
