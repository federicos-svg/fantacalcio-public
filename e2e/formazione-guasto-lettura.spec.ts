import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";
import {
  depositFaultSentence,
  DEPOSIT_FAULT_BODY_MAX_CHARS,
  DEPOSIT_FAULT_CODES,
} from "../packages/league-channel-contract/src/depositFault.js";

// QUANDO LA LETTURA DELLA LEGA FALLISCE, LA PAGINA DICE QUALE GUASTO È.
//
// IL DIFETTO, misurato in produzione: la pagina scriveva «LA LEGA NON HA
// RISPOSTO — la lettura della lega non è disponibile (502)», e quel `502`
// copriva guasti diversi con rimedi opposti. Chi lo leggeva non poteva farci
// niente: è servita mezz'ora di diagnosi con strumenti che il committente non
// ha per scoprire che il deposito veniva scritto in una cartella dove la pagina
// non guardava — cioè `deposit_not_found`, che il layer privato dichiarava già
// nel corpo della risposta e che il browser buttava via senza leggerlo.
//
// PERCHÉ QUESTE PROVE HANNO BISOGNO DEL BROWSER. La scelta della frase è pura e
// già provata senza browser (`src/formazioneCanaleRemoto.test.ts`,
// `packages/league-channel-contract/tests/depositFault.test.ts`). Qui si misura
// l'unica cosa che quelle prove non possono vedere: che cosa una persona ha
// davvero davanti agli occhi, e — per il corpo ostile — che quel testo non
// compare da NESSUNA parte nella pagina, né come testo, né dentro un attributo,
// né dentro un identificativo.

const AVVISO = "#formazione-stato-ignoto";
const SOLO_STATO = "la lettura della lega non è disponibile (502)";

/** Il guasto va a schermo restando dov'era: nessuna griglia, nessun campo. */
async function avvisoAlPostoDellaSquadra(page: Page): Promise<void> {
  await expect(page.locator(AVVISO)).toBeVisible();
  await expect(page.locator(AVVISO)).toContainText("La lega non ha risposto");
  await expect(page.locator("#formazione-screen")).toBeVisible();
  // Le regole di testa a src/ui/formazione.ts: mai una griglia vuota accanto a
  // un avviso, mai un campo verde vuoto, mai un comando di salvataggio.
  await expect(page.locator(".formazione-campo")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-salva-']")).toHaveCount(0);
  await expect(page.locator("#formazione-lettura-in-corso")).toHaveCount(0);
}

async function apriConGuasto(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  status: number,
  body: string,
): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "guasto",
    status,
    body,
  });
  await page.goto("/");
  await avvisoAlPostoDellaSquadra(page);
  return externalRequests;
}

/**
 * IL CONTROLLO POSITIVO, e perché ogni prova negativa qui sotto ne porta uno.
 *
 * «Un corpo ostile non compare in pagina» era vero anche col codice di prima,
 * che il corpo non lo leggeva affatto: da sola, quella prova sarebbe verde in
 * entrambi i mondi, cioè non proverebbe niente. Diventa una prova quando le sta
 * accanto il caso gemello — stessa pagina, stesso guard, un codice dell'insieme
 * — che col codice di prima FALLISCE. Le due insieme dicono la cosa giusta: il
 * corpo si legge, e si legge solo ciò che l'insieme dichiara.
 *
 * L'ultima rotta registrata ha la precedenza, quindi reinstallare il guard e
 * riaprire la pagina basta a cambiare la risposta sotto gli stessi occhi.
 */
async function controlloPositivo(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  codice: (typeof DEPOSIT_FAULT_CODES)[number],
): Promise<void> {
  await apriConGuasto(page, context, 502, JSON.stringify({ error: codice }));
  await expect(page.locator(AVVISO)).toContainText(depositFaultSentence(codice));
}

// UNA PROVA PER CODICE, e non un ciclo dentro una prova sola: ogni caso ha il
// suo contesto pulito, e quando uno fallisce si sa quale senza leggere il log.
// Il caso reale che è costato la mezz'ora di diagnosi è uno di questi:
// `deposit_not_found`, cioè «è scritto in un'altra cartella».
for (const codice of DEPOSIT_FAULT_CODES) {
  test(`il guasto «${codice}» arriva a schermo come la sua frase, non come un numero`, async ({
    page,
    context,
  }) => {
    const externalRequests = await apriConGuasto(
      page,
      context,
      502,
      JSON.stringify({ error: codice }),
    );
    const avviso = page.locator(AVVISO);
    // LA FRASE: è questa la cosa che si legge, e col codice di prima non c'era.
    await expect(avviso).toContainText(depositFaultSentence(codice));
    // Il codice tecnico le sta accanto, per chi apre il runbook.
    await expect(avviso).toContainText(codice);
    // E il numero nudo, da solo, non è più tutto ciò che si ha.
    await expect(avviso).not.toContainText(SOLO_STATO);
    expect(externalRequests).toEqual([]);
  });
}

test("un codice che non si riconosce ricade sullo stato HTTP, e non compare mai", async ({
  page,
  context,
}) => {
  const externalRequests = await apriConGuasto(
    page,
    context,
    502,
    '{"error":"quota_esaurita_su_marte"}',
  );
  await expect(page.locator(AVVISO)).toContainText(SOLO_STATO);
  // Il codice sconosciuto non è una diagnosi: non entra in pagina in nessuna
  // forma, nemmeno dentro un attributo o un id.
  expect(await page.content()).not.toContain("quota_esaurita_su_marte");
  expect(await page.content()).not.toContain("marte");
  expect(externalRequests).toEqual([]);
  await controlloPositivo(page, context, "deposit_not_found");
});

test("un corpo che non è JSON non produce niente, e non peggiora niente", async ({
  page,
  context,
}) => {
  const externalRequests = await apriConGuasto(
    page,
    context,
    502,
    "<html><body>Bad Gateway</body></html>",
  );
  await expect(page.locator(AVVISO)).toContainText(SOLO_STATO);
  expect(await page.locator(AVVISO).innerHTML()).not.toContain("Bad Gateway");
  expect(externalRequests).toEqual([]);
  await controlloPositivo(page, context, "deposit_download_failed");
});

test("un corpo vuoto lascia il messaggio di ieri", async ({ page, context }) => {
  const externalRequests = await apriConGuasto(page, context, 502, "");
  await expect(page.locator(AVVISO)).toContainText(SOLO_STATO);
  expect(externalRequests).toEqual([]);
  await controlloPositivo(page, context, "deposit_unavailable");
});

test("un corpo enorme non finisce in pagina, nemmeno il codice che porta", async ({
  page,
  context,
}) => {
  const zavorra = "z".repeat(DEPOSIT_FAULT_BODY_MAX_CHARS * 2);
  const externalRequests = await apriConGuasto(
    page,
    context,
    502,
    JSON.stringify({ error: "deposit_not_found", zavorra }),
  );
  await expect(page.locator(AVVISO)).toContainText(SOLO_STATO);
  expect(await page.content()).not.toContain("zzzzzzzzzzzzzzzzzzzz");
  expect(externalRequests).toEqual([]);
  // LO STESSO CODICE, senza la zavorra, si legge: è il tetto a fermare il corpo
  // enorme, non l'incapacità di leggere il corpo.
  await controlloPositivo(page, context, "deposit_not_found");
});

test("un corpo ostile non compare in pagina: né come testo, né come marcatura, né come attributo", async ({
  page,
  context,
}) => {
  const veleno = '<img src=x onerror="document.title=\'preso\'">';
  const externalRequests = await apriConGuasto(
    page,
    context,
    502,
    JSON.stringify({ error: `deposit_not_found" onmouseover="alert(1)${veleno}` }),
  );

  // 1. Non è a schermo: l'avviso è quello di ieri, e basta.
  await expect(page.locator(AVVISO)).toContainText(SOLO_STATO);

  // 2. NON È DA NESSUNA PARTE nel documento — testo, attributi, id compresi.
  const html = await page.content();
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("onmouseover");
  expect(html).not.toContain("document.title");

  // 3. E non è stato eseguito: nessun elemento iniettato, titolo intatto.
  await expect(page.locator("img[src='x']")).toHaveCount(0);
  expect(await page.title()).not.toBe("preso");

  expect(externalRequests).toEqual([]);

  // 4. E il corpo onesto della stessa forma passa: la differenza è
  //    l'appartenenza all'insieme, non il fatto di non guardare mai.
  await controlloPositivo(page, context, "deposit_too_large");
});

test("un guasto di configurazione dice che tocca al sito, non alla lega", async ({
  page,
  context,
}) => {
  // 503 e non 502: per il browser cambia poco, per chi deve rimediare cambia
  // tutto — e adesso la pagina lo dice invece di nasconderlo dietro un numero.
  const externalRequests = await apriConGuasto(
    page,
    context,
    503,
    '{"error":"configuration_missing"}',
  );
  const avviso = page.locator(AVVISO);
  await expect(avviso).toContainText(depositFaultSentence("configuration_missing"));
  await expect(avviso).toContainText("503");
  expect(externalRequests).toEqual([]);
});
