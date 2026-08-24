import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// L'IDENTIFICATIVO DI UN PARTECIPANTE, LEGGIBILE E COPIABILE DOVE SERVE.
//
// IL DIFETTO CHE QUESTA SPEC CHIUDE. Lo storico d'asta è chiavato su
// `personId`: quei valori li genera l'app quando un partecipante viene creato,
// e non esistevano da nessuna parte a schermo. Per scrivere il file
// dell'archivio (Impostazioni → Archivio avversari) l'unica strada era aprire
// gli strumenti da sviluppatore del browser e pescarli da `localStorage` —
// cioè fare a mano proprio la cosa che quella schermata esiste per evitare.
// Una porta che nessuno può attraversare non è una porta.
//
// COSA SI MISURA QUI, e perché ognuna delle tre:
//   1. l'identificativo si LEGGE accanto al nome, non in una terza schermata:
//      l'utilità è tutta nell'accostamento «nome → identificativo»;
//   2. si COPIA con un gesto, e negli appunti finisce ESATTAMENTE il valore
//      che il registro lega ha in memoria — non uno abbreviato per stare
//      nella colonna, non uno ricostruito;
//   3. il gesto ha una RISPOSTA visibile che nomina la persona: un gesto senza
//      risposta si ripete, e ripetuto su un pulsante che non ha copiato
//      produce un file scritto con una stringa vuota incollata dentro.
//
// I nomi usati sono inventati sul posto. Nessun partecipante reale della lega
// compare in questo repository, qui come altrove.

const NOMI = ["Alfa Sintetico", "Beta Sintetica"] as const;

test("l'identificativo di ogni partecipante si legge accanto al nome e si copia con un gesto", async ({
  page,
  context,
  baseURL,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  // Gli appunti veri, per poter verificare che dentro ci finisca il valore
  // giusto invece di fidarsi della frase di conferma.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL ?? "http://127.0.0.1:4173",
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await gotoScreen(page, "Impostazioni");

  // Due partecipanti creati dalla schermata vera: gli identificativi li
  // genera l'app, ed è esattamente il motivo per cui vanno mostrati.
  for (const nome of NOMI) {
    await page.locator("#new-person-name").fill(nome);
    await page.locator("#add-person").click();
  }

  // ── 1. Si legge accanto al nome ───────────────────────────────────────────
  const values = page.locator("#league-people-list .person-id-value");
  await expect(values).toHaveCount(NOMI.length);
  for (let i = 0; i < NOMI.length; i += 1) {
    // Stessa cella del campo del nome: l'accostamento è il punto.
    const cell = page.locator("#league-people-list .league-team-field").nth(i);
    await expect(cell.locator("input")).toHaveValue(NOMI[i]!);
    await expect(cell.locator(".person-id-value")).toHaveText(/^person:[0-9a-f-]{36}$/i);
  }

  // ── 2. Si copia, e negli appunti finisce il valore vero ───────────────────
  // Il confronto è contro il registro lega in memoria, non contro il testo a
  // schermo: se un giorno la colonna abbreviasse l'identificativo per starci
  // dentro, questa prova lo direbbe invece di restare verde.
  const storedIds = await page.evaluate(() => {
    const raw = localStorage.getItem("fac_league_teams");
    return raw === null
      ? []
      : (JSON.parse(raw) as { people: { id: string; name: string }[] }).people.map((p) => p.id);
  });
  expect(storedIds).toHaveLength(NOMI.length);

  await page.locator("#league-people-list .person-id-copy").nth(1).click();
  await expect(page.locator("#person-id-copy-status")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(storedIds[1]);

  // ── 3. La risposta al gesto nomina la persona ─────────────────────────────
  const status = page.locator("#person-id-copy-status");
  await expect(status).toContainText(NOMI[1]!);
  await expect(status).toContainText("copiato negli appunti");
  // La conferma non ripete l'identificativo: è già a schermo accanto al nome,
  // e un posto in meno da cui può finire in uno screenshot.
  await expect(status).not.toContainText("person:");

  // Il secondo gesto su una persona diversa sostituisce la conferma, invece di
  // lasciare quella vecchia a parlare di qualcun altro.
  await page.locator("#league-people-list .person-id-copy").nth(0).click();
  await expect(status).toContainText(NOMI[0]!);
  await expect(status).not.toContainText(NOMI[1]!);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(storedIds[0]);

  // ── 4. Copiare non rinomina e non riassegna niente ────────────────────────
  // Il pulsante vive dentro la <label> del partecipante: se attivarlo
  // trascinasse con sé il comportamento della label, il nome finirebbe a
  // fuoco e un tasto premuto subito dopo lo cambierebbe.
  await expect(page.locator("#league-people-list .league-team-field").nth(0).locator("input")).toHaveValue(
    NOMI[0]!,
  );
  const idsAfter = await page.evaluate(() => {
    const raw = localStorage.getItem("fac_league_teams");
    return raw === null
      ? []
      : (JSON.parse(raw) as { people: { id: string }[] }).people.map((p) => p.id);
  });
  expect(idsAfter).toEqual(storedIds);

  // ── 5. Sopravvive al reload, perché l'identità della persona lo fa ────────
  await page.reload();
  await gotoScreen(page, "Impostazioni");
  await expect(page.locator("#league-people-list .person-id-value").nth(0)).toHaveText(storedIds[0]!);
  // Nessuna conferma al boot: non è stato compiuto nessun gesto.
  await expect(page.locator("#person-id-copy-status")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});
