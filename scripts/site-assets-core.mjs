// Site assets — PURE logic, NO Node imports (string-only).
// Single source of truth shared by:
//   - scripts/guardrails-core.mjs        (-> scripts/repo-guardrails.mjs)
//   - scripts/publication-gate-core.mjs  (-> scripts/publication-gate.mjs)
//   - packages/engine/tests/site_assets.test.ts
// Le due guardie non possono avere due idee diverse di quali file non di testo
// il sito ospita: la lista sta qui, in un posto solo.
//
// COSA È. Un elenco CHIUSO di percorsi ESATTI, senza glob, ciascuno con la sua
// impronta sha256. Sono i soli file non di testo che il sito pubblico tiene in
// `public/`: i caratteri ospitati (Barlow e Barlow Condensed, licenza OFL, così
// a runtime non parte nessuna richiesta a un servizio esterno), il marchio e le
// icone del sito (nostri).
//
// PERCHÉ ESISTE. Le due guardie rifiutano ogni file non di testo: repo-guardrails
// (`blocked-binary`, `blocked-ext`) e il publication gate (regola 7, «no binary
// allowlisted for this tree»). La regola esiste contro dati privati e file non
// controllati; un carattere con licenza OFL e un'icona nostra non sono dati
// privati, e l'impronta li tiene bloccati sul contenuto che è stato guardato.
//
// AUTORIZZAZIONE. Pico, 31/10/2026, in modale: «Eccezione stretta» — «Passano
// solo quei 15 file, col nome esatto e il contenuto bloccato: se uno cambia, la
// protezione torna a fermarlo.» Aggiungere, togliere o cambiare una voce di
// questo elenco è una modifica di questo nucleo pubblico e vuole una nuova
// autorizzazione scritta: non è un ritocco tecnico.
//
// COSA FA, ESATTAMENTE. Ogni guardia, per un file dell'elenco:
//   - contenuto uguale all'impronta -> il file passa le regole sul formato
//     (repo-guardrails: estensione e sniff binario; gate: regola 7). Ogni altra
//     regola del gate (percorso, segreti, email, impronte private) gira come
//     per qualunque altro file;
//   - contenuto diverso -> ROSSO (`blocked-site-asset` / `site-asset-changed`);
//   - voce dell'elenco che non esiste più nell'albero tracciato -> ROSSO
//     (`stale-site-asset`): un'eccezione che non esenta più niente è un debito,
//     la sua voce si toglie.
// Un file NON in elenco resta bloccato esattamente come prima, anche se ha lo
// stesso nome in un'altra cartella o gli stessi identici byte di uno in elenco:
// l'impronta autorizza un percorso, non un contenuto in astratto.
//
// IL SOFFITTO. `compileSiteAssets` rifiuta, già al caricamento, una voce che non
// sia sotto `public/` o la cui estensione non sia una di SITE_ASSET_EXTS: una
// lista non può quindi esentare un `.xlsx`, un `.exe` o una chiave, qualunque
// impronta porti. È lo stesso schema del soffitto di `EXEMPTABLE_EXTS` in
// guardrails-core.mjs, qui rivolto ai formati di un sito invece che ai dati.

const SHA256_HEX = /^[0-9a-f]{64}$/;

// Le tre sole estensioni che una voce può avere (il soffitto, vedi sopra).
export const SITE_ASSET_EXTS = new Set([".woff2", ".svg", ".png"]);

// La cartella servita al browser: l'unico posto dove una voce può stare.
const SITE_ASSET_ROOT = "public/";

// Un glob in un percorso esatto è quasi certamente un errore, e comunque
// questo elenco non ha globs: si dice al caricamento, non si lascia compilare.
const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Elenco compilato: percorsi esatti con la loro impronta.
 * @typedef {{
 *   size: number,
 *   paths: readonly string[],
 *   digestOf: (path: string) => string | null,
 * }} SiteAssets
 */

function failList(detail) {
  throw new Error(`invalid site-asset list: ${detail}`);
}

function validateEntryPath(path) {
  if (typeof path !== "string" || path.length === 0) failList("an entry has no path");
  if (path.startsWith("/")) failList(`"${path}" is absolute — use a repo-root-relative path`);
  if (path.includes("\\")) failList(`"${path}" uses a backslash — git paths use "/"`);
  if (GLOB_CHARS.test(path)) {
    failList(`"${path}" looks like a glob — this list names exact files, never patterns`);
  }
  for (const segment of path.split("/")) {
    if (segment.length === 0) failList(`"${path}" has an empty path segment`);
    if (segment === "." || segment === "..") {
      failList(`"${path}" has a relative segment ("." or "..")`);
    }
  }
  if (!path.startsWith(SITE_ASSET_ROOT)) {
    failList(`"${path}" is not under ${SITE_ASSET_ROOT} — only the served site folder may hold these files`);
  }
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  if (!SITE_ASSET_EXTS.has(ext)) {
    failList(
      `"${path}" has extension "${ext}" — only ${[...SITE_ASSET_EXTS].join(", ")} can be listed. ` +
        `This list is not a general allowlist.`,
    );
  }
}

/**
 * Valida un elenco `[{ path, sha256 }]` e lo compila. Lancia, nominando la voce,
 * davanti a qualunque voce malformata, larga o doppia. Non restituisce mai un
 * elenco parziale.
 *
 * @param {ReadonlyArray<{ path: string, sha256: string }>} spec
 * @returns {SiteAssets}
 */
export function compileSiteAssets(spec) {
  if (!Array.isArray(spec)) failList("the spec must be an array of { path, sha256 }");
  /** @type {Map<string, string>} */
  const digests = new Map();
  for (const entry of spec) {
    if (entry === null || typeof entry !== "object") failList("an entry is not an object");
    validateEntryPath(entry.path);
    if (typeof entry.sha256 !== "string" || !SHA256_HEX.test(entry.sha256)) {
      failList(`"${entry.path}" has no valid sha256 (64 lowercase hex characters)`);
    }
    if (digests.has(entry.path)) failList(`duplicate path "${entry.path}"`);
    digests.set(entry.path, entry.sha256);
  }
  const paths = Object.freeze([...digests.keys()]);
  return Object.freeze({
    size: digests.size,
    paths,
    digestOf(path) {
      return digests.get(path) ?? null;
    },
  });
}

// I 15 file. Impronta sha256 del contenuto intero, in byte.
export const SITE_ASSETS = compileSiteAssets([
  { path: "public/apple-touch-icon.png", sha256: "f91456240e329f0bb3bbd00d89158bd2b87e5a19cd276c6ecc1f73f1cd0f3d01" },
  { path: "public/brand/orizzontale-colori.svg", sha256: "781c402f6723172ccecd87c0cabd2e20deac7a2f9b4bc28175917083736f781d" },
  { path: "public/favicon-32.png", sha256: "aa72f9279595f49a9fdf42bd1cf0eeb052f24f7863c2f1e88bcf0bfd257bc85c" },
  { path: "public/favicon-48.png", sha256: "cc10a369d51e42c1d45f3fe08435e0e08e238c417cb19c732c367b789cb6913e" },
  { path: "public/favicon.svg", sha256: "b252bb9d392ce7acbe6053e1fc1b4232f319a2dbd401e44a6a6b82489d3a4188" },
  { path: "public/fonts/barlow-condensed-latin-600-normal.woff2", sha256: "215a93c696f442034a46fbb382958f753fda60e30490683aeea6b235fcbb2b66" },
  { path: "public/fonts/barlow-condensed-latin-700-normal.woff2", sha256: "3787a5a419171630e6890cfa47c4da067474d005cd0ff8dc11ec090fdc3ee2b8" },
  { path: "public/fonts/barlow-condensed-latin-ext-600-normal.woff2", sha256: "aef7edf54f79a5329fbca9c065b56dcec3852c680d58cf89a9ef2db6940ca4b3" },
  { path: "public/fonts/barlow-condensed-latin-ext-700-normal.woff2", sha256: "9d351bd9222bfab90f943850f8039aa73cdb40e0a6cfe4127308a48bef59d5f5" },
  { path: "public/fonts/barlow-latin-400-normal.woff2", sha256: "b0a8ad37ac45f5fb22ced461576db72e44e295107aad7a9c8a7a4bad728fd03b" },
  { path: "public/fonts/barlow-latin-600-normal.woff2", sha256: "4b52ddd4836b592df0e4832b8286956883cdc651b015126bdd18f184b7f90cc3" },
  { path: "public/fonts/barlow-latin-700-normal.woff2", sha256: "2d797dd8b35dcb3413e1af9d7052b3f4f8c341a147cdcb01f4f06af80db53289" },
  { path: "public/fonts/barlow-latin-ext-400-normal.woff2", sha256: "122b24bc2a90b0abe189f5229768bf2e9ba641324fe2459b48850079625934f1" },
  { path: "public/fonts/barlow-latin-ext-600-normal.woff2", sha256: "b7f099c421968b583734bc631e6706bff8fc23908112a219f5f0e37f59b03b32" },
  { path: "public/fonts/barlow-latin-ext-700-normal.woff2", sha256: "88c786d5fa8700a201615bc7b8ede09d209ec5d08cc3dd0a30ea1c4baff3476f" },
]);

/**
 * Che cosa pensa l'elenco di un file, dato il suo percorso e l'impronta sha256
 * (esadecimale minuscola) del suo contenuto intero, calcolata da chi chiama.
 *   - "unlisted": non è in elenco -> si applicano le regole di sempre;
 *   - "pinned":   è in elenco e il contenuto è quello bloccato;
 *   - "changed":  è in elenco e il contenuto è diverso, oppure l'impronta non è
 *                 stata fornita: senza impronta non si può verificare, e un file
 *                 non verificato non passa (chiuso per costruzione).
 *
 * @param {string} path
 * @param {string | null | undefined} digest
 * @param {SiteAssets} [assets]
 * @returns {"unlisted" | "pinned" | "changed"}
 */
export function siteAssetStatus(path, digest, assets = SITE_ASSETS) {
  const pinned = assets.digestOf(path);
  if (pinned === null) return "unlisted";
  return digest === pinned ? "pinned" : "changed";
}

/**
 * Le voci dell'elenco che non esistono più tra i percorsi tracciati. Una voce
 * così non esenta niente: è un debito, e la guardia resta rossa finché non la si
 * toglie.
 *
 * @param {Iterable<string>} trackedPaths
 * @param {SiteAssets} [assets]
 * @returns {string[]}
 */
export function staleSiteAssetEntries(trackedPaths, assets = SITE_ASSETS) {
  const tracked = new Set(trackedPaths);
  return assets.paths.filter((path) => !tracked.has(path));
}
