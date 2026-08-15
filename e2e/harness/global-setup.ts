// GLOBAL SETUP — il controllo di identità che rende impossibile un verde
// falso contro l'albero sbagliato.
//
// Gira una volta per run, prima del primo test. Fa esattamente una cosa:
// chiede all'URL della suite chi è, e confronta la risposta con il
// `dist/index.html` di QUESTO albero. Tre esiti, nessuno silenzioso:
//  - nessuno risponde  -> non c'è niente da verificare: Playwright avvierà il
//    server di questo albero e la run prosegue;
//  - risponde questo build -> riuso legittimo (è la strada che usa la CI, che
//    avvia il preview come step esplicito): la run prosegue e lo dice;
//  - risponde un ALTRO build -> `throw`, e la run si ferma prima di eseguire
//    un solo test.
//
// L'ordine con cui Playwright avvia `webServer` e `globalSetup` non cambia
// l'esito, ed è voluto: se il server di questo albero non è ancora partito
// non risponde nessuno (primo caso, si prosegue); se risponde qualcuno,
// chiunque sia, viene verificato. Non serve sapere quale dei due va prima.
//
// La logica di decisione è pura e testata in
// scripts/lib/e2ePreviewServer.test.ts; qui restano solo rete, disco e throw.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";
import {
  type PreviewServerCheck,
  E2E_PORT_ENV_VAR,
  previewServerVerdict,
} from "../../scripts/lib/e2ePreviewServer.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Quanto si aspetta una risposta prima di considerare la porta libera. Corto
 *  di proposito: è una probe locale, non una richiesta di rete vera. */
const PROBE_TIMEOUT_MS = 2_000;

/** Il corpo servito dall'URL, o `null` se non risponde nessuno. Un errore di
 *  connessione È l'informazione "porta libera", non un guasto. */
async function fetchServedHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function readLocalBuild(): Promise<string | null> {
  try {
    return await readFile(resolve(REPO_ROOT, "dist", "index.html"), "utf8");
  } catch {
    return null;
  }
}

/**
 * L'URL della suite, letto DA DOVE È CONFIGURATO — mai ricalcolato da una
 * seconda copia della porta. `webServer.url` e `use.baseURL` derivano
 * entrambi dall'unica costante di playwright.config.ts.
 */
function suiteUrl(config: FullConfig): string {
  const fromWebServer = config.webServer?.url;
  if (typeof fromWebServer === "string" && fromWebServer !== "") return fromWebServer;
  const fromProject = config.projects[0]?.use?.baseURL;
  if (typeof fromProject === "string" && fromProject !== "") return fromProject;
  throw new Error(
    "playwright.config.ts non espone né webServer.url né use.baseURL: impossibile verificare " +
      "quale server sta servendo la suite.",
  );
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const url = suiteUrl(config);
  const port = Number(new URL(url).port);
  const check: PreviewServerCheck = {
    url,
    port,
    portFromEnv: (process.env[E2E_PORT_ENV_VAR] ?? "").trim() !== "",
    servedHtml: await fetchServedHtml(url),
    localHtml: await readLocalBuild(),
  };

  const verdict = previewServerVerdict(check);
  switch (verdict.kind) {
    case "no-server":
      // Nessuno sulla porta: Playwright avvia il server di questo albero.
      return;
    case "same-tree":
      // Riuso verificato — lo si dice, così un verde riusato non è mai muto.
      console.log(
        `[e2e] riuso verificato del server su ${url}: serve il build di questo albero (${verdict.fingerprint}).`,
      );
      return;
    case "unverifiable":
    case "foreign-tree":
      throw new Error(`[e2e] ${verdict.message}`);
  }
}
