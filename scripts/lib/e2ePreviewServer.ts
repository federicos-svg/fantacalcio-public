// E2E PREVIEW SERVER — porta e identità dell'albero servito.
//
// PERCHÉ ESISTE QUESTO FILE. `playwright.config.ts` inchiodava la porta 4173
// e teneva `reuseExistingServer: true`. Quella combinazione, su una macchina
// con più worktree dello stesso repository in parallelo (il modo normale di
// lavorare qui: worker delegati, rehearsal, corsie file-disjoint), fa una
// cosa sola e la fa in silenzio: se un ALTRO albero ha già un `vite preview`
// sulla 4173, Playwright lo riusa e la suite gira contro il build di
// qualcun altro, riportando verde. È successo davvero, e se ne è accorto
// solo perché una spec non toccata falliva. Un verde falso alla rehearsal
// del 02/09 sarebbe peggio di un rosso.
//
// DUE MECCANISMI, DISTINTI E COMPLEMENTARI:
//  1. la porta è sovrascrivibile (`E2E_PORT`), default INVARIATO a 4173, così
//     due alberi possono girare insieme senza contendersi nulla e i comandi
//     documentati continuano a funzionare parola per parola;
//  2. l'identità del build servito viene VERIFICATA prima di eseguire un solo
//     test: se ciò che risponde all'URL non è il build di QUESTO albero, la
//     run si ferma con un errore esplicito invece di passare in silenzio.
//
// Il confronto è sul byte di `dist/index.html`: Vite ci scrive dentro i nomi
// degli asset con hash di contenuto, quindi due build diversi hanno per
// costruzione due index.html diversi. Se invece i byte coincidono, il server
// sta servendo esattamente il codice che questo albero ha compilato, e
// riusarlo non cambia il risultato di nessun test — è il riuso legittimo che
// la CI usa apposta (avvia il preview come step esplicito e poi lancia la
// suite), e che qui resta intatto.
//
// Questo modulo è PURO e testato (`e2ePreviewServer.test.ts`): fetch, lettura
// da disco e `throw` stanno nel chiamante (`e2e/harness/global-setup.ts`).

import { createHash } from "node:crypto";

/** Porta storica e documentata della suite. Non cambia. */
export const DEFAULT_E2E_PORT = 4173;

/** L'unica variabile che sposta la porta. Nessun'altra fonte di verità. */
export const E2E_PORT_ENV_VAR = "E2E_PORT";

/**
 * La porta della suite: `E2E_PORT` se valorizzata, altrimenti 4173.
 *
 * Un valore non valido NON ricade sul default: fallirebbe silenziosamente
 * proprio nel modo che questo file esiste per chiudere (l'operatore crede di
 * essersi isolato su un'altra porta e invece è tornato sulla 4173 condivisa).
 * Si alza un errore parlante e la run si ferma.
 */
export function resolveE2ePort(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env[E2E_PORT_ENV_VAR];
  if (raw === undefined || raw.trim() === "") return DEFAULT_E2E_PORT;
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(
      `${E2E_PORT_ENV_VAR}="${raw}" non è un numero di porta. Attesi solo cifre, es. ${E2E_PORT_ENV_VAR}=4287.`,
    );
  }
  const port = Number(trimmed);
  if (port < 1024 || port > 65535) {
    throw new Error(
      `${E2E_PORT_ENV_VAR}=${trimmed} è fuori intervallo: servono 1024..65535 (le porte privilegiate < 1024 non sono utilizzabili da questa suite).`,
    );
  }
  return port;
}

/**
 * Impronta breve e stabile di un `index.html` servito o su disco. Serve solo
 * a rendere leggibile il messaggio d'errore: la decisione confronta i byte
 * normalizzati, non l'impronta.
 */
export function buildFingerprint(html: string): string {
  return createHash("sha256").update(normalizeHtml(html)).digest("hex").slice(0, 12);
}

/** Normalizzazione minima: solo spazi di bordo e CRLF, nient'altro. Un
 *  checkout su Windows non deve leggersi come un albero diverso. */
function normalizeHtml(html: string): string {
  return html.replace(/\r\n/g, "\n").trim();
}

/**
 * I riferimenti agli asset con hash che Vite scrive in `index.html`. Nel
 * messaggio d'errore valgono più di un digest: dicono a colpo d'occhio che i
 * due alberi hanno compilato codice diverso.
 */
export function assetReferences(html: string): readonly string[] {
  return [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map((m) => m[0]).sort();
}

export type PreviewServerVerdict =
  /** Nessuno risponde all'URL: Playwright avvierà il server di questo albero. */
  | { readonly kind: "no-server" }
  /** Risponde un server che serve esattamente questo build: riuso legittimo. */
  | { readonly kind: "same-tree"; readonly fingerprint: string }
  /** Risponde un server che serve un ALTRO build: si ferma tutto. */
  | { readonly kind: "foreign-tree"; readonly message: string }
  /** Risponde qualcuno ma non c'è un build locale con cui confrontarlo. */
  | { readonly kind: "unverifiable"; readonly message: string };

export interface PreviewServerCheck {
  readonly url: string;
  readonly port: number;
  /** `true` quando la porta arriva da `E2E_PORT`: cambia il consiglio finale. */
  readonly portFromEnv: boolean;
  /** Corpo servito dall'URL, `null` se nessuno risponde. */
  readonly servedHtml: string | null;
  /** `dist/index.html` di questo albero, `null` se non esiste. */
  readonly localHtml: string | null;
}

/** Suggerimento operativo, unico posto in cui è scritto. */
function isolationHint(check: PreviewServerCheck): string {
  const suggestion = check.portFromEnv ? check.port + 1 : DEFAULT_E2E_PORT + 114;
  return (
    `Per girare isolato da qualunque altro albero: ` +
    `${E2E_PORT_ENV_VAR}=${suggestion} npm run test:e2e ` +
    `(il default resta ${DEFAULT_E2E_PORT}).`
  );
}

/**
 * La decisione, pura. Non solleva nulla e non conosce né rete né disco: il
 * chiamante traduce `foreign-tree` e `unverifiable` in un errore che ferma
 * la run prima del primo test.
 */
export function previewServerVerdict(check: PreviewServerCheck): PreviewServerVerdict {
  if (check.servedHtml === null) return { kind: "no-server" };

  if (check.localHtml === null) {
    return {
      kind: "unverifiable",
      message:
        `Qualcuno risponde già su ${check.url}, ma questo albero non ha un dist/index.html ` +
        `con cui confrontarlo: impossibile stabilire di CHI sia quel server. ` +
        `La suite si ferma invece di testare, forse, il build di un altro albero. ` +
        `Esegui prima \`npm run build\`, oppure libera la porta. ${isolationHint(check)}`,
    };
  }

  const served = buildFingerprint(check.servedHtml);
  const local = buildFingerprint(check.localHtml);
  if (served === local) return { kind: "same-tree", fingerprint: served };

  const servedAssets = assetReferences(check.servedHtml);
  const localAssets = assetReferences(check.localHtml);
  return {
    kind: "foreign-tree",
    message:
      `Il server su ${check.url} NON sta servendo il build di questo albero.\n` +
      `  servito da lì : ${served} ${servedAssets.join(" ")}\n` +
      `  questo albero : ${local} ${localAssets.join(" ")}\n` +
      `Playwright lo riuserebbe (reuseExistingServer) e l'intera suite girerebbe ` +
      `contro codice altrui riportando verde. La run si ferma qui. ${isolationHint(check)}`,
  };
}
