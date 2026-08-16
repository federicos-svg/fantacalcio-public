import { expect, test } from "@playwright/test";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import {
  AUCTION_HISTORY_KEY,
  CALLED_NAME,
  LEAGUE_ROSTER_KEY,
  OPPONENT_PROFILES_KEY,
  PRECEDENT_POOL,
  syntheticPrecedentHistory,
  syntheticPrecedentProfiles,
  syntheticRoster,
} from "./fixtures/synthetic-precedents.js";

// LA PORTA DELL'ARCHIVIO AVVERSARI, ESERCITATA DAVVERO.
//
// IL DIFETTO CHE QUESTA SPEC MISURA. Il pannello AVVERSARI: I PRECEDENTI
// leggeva `fac_auction_history` e `fac_opponent_profiles`, e nessun punto
// dell'app li scriveva mai: in produzione avrebbe detto «Nessuno storico
// d'asta caricato» per sempre. e2e/live-facts.spec.ts prova che il pannello
// funziona SEMINANDO le due chiavi da `page.evaluate` — cioè entrando dalla
// finestra. Questa spec entra dalla porta: sceglie un file dal disco nella
// schermata IMPOSTAZIONI, come farà Pico.
//
// LA SCENA È LA STESSA DI live-facts.spec.ts (stesso listone sintetico, stesso
// storico, stesso giocatore chiamato) e il confronto è deliberato: là i fatti
// arrivano seminati, qui arrivano caricati, e il pannello deve dire la stessa
// identica cosa. Se le due divergono, è la porta a mentire.
//
// LE QUATTRO PROMESSE, una scena ciascuna:
//   1. si carica: il pannello passa da «non lo so» ai fatti misurati;
//   2. si vede che cosa è caricato, in numeri, PRIMA dell'asta;
//   3. sopravvive al reload, perché la rilettura di controllo passa dalla
//      stessa porta del boot;
//   4. un file non conforme dice PERCHÉ e non tocca l'archivio già presente —
//      e non racconta niente del file, che è dato di persone reali.
//
// Ogni riga è sintetica (fixtures/synthetic-precedents.ts) e il network guard
// aborta qualunque altra cosa.

/** I numeri dello storico sintetico, misurati sulla fixture e non stimati. */
const HISTORY_SUMMARY = [
  "3 stagioni (2023/24 → 2025/26)",
  "59 acquisti",
  "3 partecipanti",
  "58 all'asta, 1 per rinnovo",
  "3 occupano uno dei 7 posti rivali",
];

const HISTORY_JSON = JSON.stringify(syntheticPrecedentHistory());
const PROFILES_JSON = JSON.stringify({
  schemaVersion: 1,
  profiles: syntheticPrecedentProfiles(),
});

/**
 * Un file storto che è JSON valido e porta un NOME DI PERSONA come chiave non
 * prevista. È il caso peggiore per la privacy — zod riporta le chiavi non
 * riconosciute per nome — e insieme il caso peggiore per l'operatore, perché
 * arriva dopo che l'archivio buono è già caricato.
 */
const BROKEN_JSON = JSON.stringify({
  schemaVersion: 1,
  purchases: [
    {
      season: "24-25",
      personId: "person:00000000-0000-4000-8000-00000000000a",
      playerId: "sint-1",
      club: "ClubSintetico",
      price: 10,
      acquisition: "asta",
      "Nome Che Non Deve Comparire": "mai",
    },
  ],
});

function jsonFile(name: string, text: string) {
  return { name, mimeType: "application/json", buffer: Buffer.from(text, "utf8") };
}

/**
 * Torna alla schermata di chiamata passando da un RELOAD, non dal comando
 * «Indietro alla ricerca».
 *
 * Due ragioni, ed è la seconda a decidere: il reload riparte dallo stato
 * persistito, quindi ogni scena successiva misura ciò che sopravvive davvero
 * invece di ciò che è rimasto in memoria; e quel comando vive dentro
 * `renderMomentoAsta`, che un'altra corsia sta riscrivendo — appoggiarcisi
 * legherebbe questa spec a una superficie che sta cambiando sotto, per un
 * servizio che il reload rende comunque meglio.
 */
async function reloadToChiamata(page: import("@playwright/test").Page): Promise<void> {
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

test("l'archivio avversari entra da Impostazioni, si vede in numeri, sopravvive al reload e non si fa cancellare da un file storto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);

  await page.goto("/");
  // Solo il REGISTRO LEGA è seminato: senza persone ai posti nessun archivio
  // potrebbe produrre una riga, e i partecipanti si assegnano dalla loro
  // schermata, che non è quella sotto esame. Storico e profili NO: quelli
  // devono entrare dalla porta che questa spec misura.
  await page.evaluate(
    ([key, roster]) => {
      localStorage.clear();
      localStorage.setItem(key as string, JSON.stringify(roster));
    },
    [LEAGUE_ROSTER_KEY, syntheticRoster()] as const,
  );
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();

  // ── 1. Prima: il pannello non ha fatti, e lo DICE ─────────────────────────
  await page.getByText(CALLED_NAME, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "Nessuno storico d'asta caricato",
  );

  // ── 2. La porta ───────────────────────────────────────────────────────────
  await reloadToChiamata(page);
  await gotoScreen(page, "Impostazioni");
  await page.locator("#settings-tab-archivio").click();
  await expect(page.locator("#settings-tab-archivio")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#archive-history-summary")).toContainText(
    "Nessuno storico d'asta caricato",
  );
  // Il comando di rimozione non esiste finché non c'è niente da rimuovere.
  await expect(page.locator("#archive-history-forget")).toHaveCount(0);

  await page.locator("#archive-history-file").setInputFiles(jsonFile("storico.json", HISTORY_JSON));
  await expect(page.locator("#archive-history-message")).toContainText("sopravvive al reload");

  // ── 3. Che cosa è caricato, in numeri, prima dell'asta ────────────────────
  for (const fragment of HISTORY_SUMMARY) {
    await expect(page.locator("#archive-history-summary")).toContainText(fragment);
  }

  await page.locator("#archive-profiles-file").setInputFiles(jsonFile("profili.json", PROFILES_JSON));
  await expect(page.locator("#archive-profiles-summary")).toContainText("2 profili");
  await expect(page.locator("#archive-profiles-summary")).toContainText(
    "2 con un tifo confermato in intervista",
  );

  // ── 4. Sopravvive al reload ───────────────────────────────────────────────
  await reloadToChiamata(page);
  await gotoScreen(page, "Impostazioni");
  await page.locator("#settings-tab-archivio").click();
  await expect(page.locator("#archive-history-summary")).toContainText("59 acquisti");
  // Nessun messaggio al boot: lo stato dell'archivio è un fatto, non l'esito
  // di un gesto appena compiuto.
  await expect(page.locator("#archive-history-message")).toHaveCount(0);

  // ── 5. Il pannello adesso parla, e dice fatti misurati ────────────────────
  await gotoScreen(page, "Asta");
  await page.getByText(CALLED_NAME, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  const headline = page.locator("#opponent-precedents-headline");
  await expect(headline).not.toContainText("Nessuno storico d'asta caricato");
  await expect(headline).toContainText("un precedente d'asta su questo giocatore");
  await expect(headline).toContainText("2023/24");
  // Il riacquisto contato è 2 e non 3: il rinnovo in mezzo non conta.
  await expect(page.locator("#opponent-precedents-list")).toContainText("2 volte");

  // ── 6. Un file storto: dice perché, e non tocca niente ────────────────────
  await gotoScreen(page, "Impostazioni");
  await page.locator("#settings-tab-archivio").click();
  const beforeRaw = await page.evaluate((k) => localStorage.getItem(k), AUCTION_HISTORY_KEY);
  await page.locator("#archive-history-file").setInputFiles(jsonFile("storto.json", BROKEN_JSON));
  const message = page.locator("#archive-history-message");
  await expect(message).toContainText("File rifiutato");
  await expect(message).toContainText("l'archivio già presente non è stato toccato");
  // La forma sbagliata è NOMINATA — season, riga 1 — così il file si corregge.
  await expect(message).toContainText("season");
  await expect(message).toContainText("riga 1");
  // Il contenuto del file NO: né la chiave inventata (che qui è un nome di
  // persona), né i valori. È dato di persone reali.
  await expect(message).not.toContainText("Nome Che Non Deve Comparire");
  await expect(message).not.toContainText("ClubSintetico");
  await expect(message).not.toContainText("sint-1");
  await expect(message).toContainText("campo non previsto");

  // E l'archivio è ancora lì, identico byte per byte.
  await expect(page.locator("#archive-history-summary")).toContainText("59 acquisti");
  expect(await page.evaluate((k) => localStorage.getItem(k), AUCTION_HISTORY_KEY)).toBe(beforeRaw);

  // ── 7. Si può togliere, senza svuotare il browser a mano ──────────────────
  await page.locator("#archive-history-forget").click();
  await expect(page.locator("#archive-history-message")).toContainText("Archivio rimosso");
  await expect(page.locator("#archive-history-summary")).toContainText(
    "Nessuno storico d'asta caricato",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), AUCTION_HISTORY_KEY)).toBeNull();
  // Togliere lo storico non ha toccato i profili: due archivi, due gesti.
  expect(await page.evaluate((k) => localStorage.getItem(k), OPPONENT_PROFILES_KEY)).not.toBeNull();
  await expect(page.locator("#archive-profiles-summary")).toContainText("2 profili");

  // E il pannello torna a dire «non lo so», che non è «nessuno lo vuole».
  await reloadToChiamata(page);
  await page.getByText(CALLED_NAME, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "Nessuno storico d'asta caricato",
  );

  expect(externalRequests).toEqual([]);
});
