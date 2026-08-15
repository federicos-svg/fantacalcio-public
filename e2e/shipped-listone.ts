// The listone THIS REPOSITORY ACTUALLY SHIPS (public/data/listone_2025_26.json),
// read and validated through the SAME validator src/main.ts runs at boot
// (validateListonePool) — never a private re-implementation of its rules.
//
// Why this file exists: BUNDLE-01's cold-start/integrity specs used to assert
// on hardcoded row values (one of them "Aldo Prova", the public repo's own
// 6-row synthetic fixture) copied straight into the spec. That ties the spec
// to whichever CONTENT happens to be loaded when it was written — and the
// private repository ships a different, real 532-row listone, whose row
// values are private data and never appear in this file. There the
// hardcoded names don't exist at all, and the derived target
// (`rows.find(r => r.role === "A")`) fell at index 429/532 — past the first
// paginated page — so a hardcoded assign-by-text helper timed out. Result:
// PR #328 (core import 8bb12ce), CI run 31906106225, 97/100 E2E green, 3 red,
// all on this one cause.
//
// The fix is to follow the shipped asset BY IDENTITY, not by content: whatever
// public/data/listone_2025_26.json contains, on whichever repository ships it,
// these exports describe it truthfully, in the order the app renders it. See
// e2e/fixtures/synthetic-listone.ts for the DIFFERENT, deliberately synthetic
// pool used where a spec needs to inject its own network-served data (e.g.
// e2e/assign-command-line.spec.ts) — that is a different contract and must
// stay separate from what this file proves.
//
// Fails loudly (throw, at import time) rather than silently on any shape this
// module cannot make sense of: a spec asserting on a value derived from a
// broken or empty shipped asset would be worse than no spec at all.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  validateListonePool,
  filterListonePool,
  LISTONE_PAGE_SIZE,
  type ListonePlayer,
} from "../src/ui/listone.js";

const ASSET_PATH = fileURLToPath(new URL("../public/data/listone_2025_26.json", import.meta.url));

function loadShippedListone(): readonly ListonePlayer[] {
  const raw = readFileSync(ASSET_PATH, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `shipped-listone: ${ASSET_PATH} non è JSON valido (${(err as Error).message}). ` +
        `Le spec BUNDLE-01 dipendono da questo file per il pool realmente spedito da questo ` +
        `repository: impossibile continuare senza un asset leggibile.`,
    );
  }
  const result = validateListonePool(parsed);
  if (!result.ok) {
    throw new Error(
      `shipped-listone: ${ASSET_PATH} non supera validateListonePool ` +
        `(reason: ${result.reason}${result.identity ? `, identity: ${result.identity}` : ""}). ` +
        `Questo è lo STESSO validatore che src/main.ts usa a runtime: le spec BUNDLE-01 non ` +
        `possono asserire su un asset che l'app stessa rifiuterebbe di caricare.`,
    );
  }
  return result.pool;
}

/** The shipped listone, validated, in the order the asset serves it — the
 *  same order the app renders on a fresh load (paginateListonePool slices
 *  this order; nothing re-sorts it by default). */
export const SHIPPED_LISTONE: readonly ListonePlayer[] = loadShippedListone();

/** The exact rows on page 1 of the listone table on a fresh, unsorted,
 *  unfiltered load. `LISTONE_PAGE_SIZE` is imported, never hand-copied, so
 *  this stays correct if the page size ever changes. */
export const SHIPPED_LISTONE_FIRST_PAGE: readonly ListonePlayer[] = SHIPPED_LISTONE.slice(0, LISTONE_PAGE_SIZE);

/**
 * True when filtering the WHOLE pool by `name` through the REAL search
 * predicate (`filterListonePool`, the same function `#search-player` drives
 * at runtime — see `selectListoneRowByName` in e2e/helpers.ts) leaves exactly
 * one row. `selectListoneRowByName` types the candidate's name into that
 * search box and waits for exactly one `.listone-row` to remain: the filter
 * matches by NORMALIZED SUBSTRING (`normalizeIdentityPart(p.name).includes(q)`
 * in `filterListonePool`), not by exact equality, so a name can be unique
 * character-for-character in the pool and still not be substring-safe: e.g.
 * two rows named "Bianchi" and "Bianchi Junior" both stay exact-unique, but
 * searching "Bianchi" now matches both. Only this predicate — the real one,
 * not a re-implementation of it — can tell the two apart.
 */
function isSearchSafe(pool: readonly ListonePlayer[], name: string): boolean {
  const matches = filterListonePool(pool, { text: name, role: "", club: "", status: "all" }, new Set());
  return matches.length === 1;
}

/**
 * Exported ONLY so it can be exercised by a committed, CI-run unit test
 * (scripts/lib/shippedListoneTargetSelection.test.ts — vitest excludes
 * `e2e/**`, so a test living in this directory would never actually run).
 * Not meant to be imported by app or spec code beyond that: `SHIPPED_TARGET`
 * below, computed from the real shipped asset, remains the one export specs
 * should use.
 */
export function findUniqueRoleATarget(pool: readonly ListonePlayer[]): ListonePlayer {
  const nameCounts = new Map<string, number>();
  for (const p of pool) nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
  const exactUniqueRoleA = pool.filter((p) => p.role === "A" && nameCounts.get(p.name) === 1);
  if (exactUniqueRoleA.length === 0) {
    throw new Error(
      `shipped-listone: nessuna riga di ruolo "A" con nome unico (carattere per carattere) nell'intero ` +
        `pool in ${ASSET_PATH} (${pool.length} righe totali). Le spec BUNDLE-01 che assegnano un ` +
        `giocatore hanno bisogno di un target inequivocabile: impossibile derivarne uno da questo pool.`,
    );
  }
  // Exact-name uniqueness alone is not enough: selectListoneRowByName selects
  // through #search-player, whose match is by SUBSTRING (filterListonePool),
  // not by exact name — see isSearchSafe above. A candidate whose name is a
  // substring of another row's name (e.g. "Bianchi" inside "Bianchi Junior",
  // same worked example as isSearchSafe above) is exact-unique but NOT
  // search-safe: typing it would leave more than one row on screen and
  // selectListoneRowByName would time out waiting for exactly one. Pick the
  // first candidate that is BOTH.
  const target = exactUniqueRoleA.find((p) => isSearchSafe(pool, p.name));
  if (!target) {
    throw new Error(
      `shipped-listone: ${exactUniqueRoleA.length} righe di ruolo "A" hanno un nome unico carattere per ` +
        `carattere nell'intero pool in ${ASSET_PATH} (${pool.length} righe totali), ma NESSUNA sopravvive ` +
        `al filtro reale che #search-player usa (filterListonePool: normalizeIdentityPart(nome).includes(query)) ` +
        `— ognuna di quelle ${exactUniqueRoleA.length} righe è sottostringa (o normalizza sulla stessa ` +
        `sottostringa) del nome di almeno un'altra riga del pool. Le spec BUNDLE-01 che assegnano un ` +
        `giocatore selezionano tramite ricerca reale (selectListoneRowByName): impossibile derivarne un ` +
        `target sicuro da questo pool.`,
    );
  }
  return target;
}

/** The first role-A row whose name is unique across the whole shipped pool
 *  BOTH character-for-character AND under the real search filter
 *  (`filterListonePool`, substring match) — the target the offline cold-start
 *  spec assigns via `selectListoneRowByName`. Selected by (role, exact
 *  uniqueness, search-safety) instead of a hardcoded name or index, so it
 *  stays valid whether the loaded asset is the 6-row public fixture or the
 *  real listone, wherever in the pool that row happens to land, and whatever
 *  other names happen to be near it that night. */
export const SHIPPED_TARGET: ListonePlayer = findUniqueRoleATarget(SHIPPED_LISTONE);
