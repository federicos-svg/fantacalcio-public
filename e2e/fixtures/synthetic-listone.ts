// Wholly synthetic listone fixture for E2E — no real player, club, or
// quotation value from the shipped listone (public/data/listone_2025_26.json)
// or any other real source. Used only to intercept
// GET /data/listone_2025_26.json in e2e/self-assign-persists-after-reload.spec.ts,
// so the suite never fetches, reads, or depends on the real proprietary
// asset. See docs/data/LISTONE_UI_LOAD_CONTRACT.md for the real shape this
// mirrors (name/role/club/quotation), and src/ui/listone.ts (ListonePlayer)
// for the type it must satisfy.
import type { ListonePlayer } from "../../src/ui/listone.js";

export const SYNTHETIC_LISTONE_POOL: readonly ListonePlayer[] = [
  { name: "Aldo Prova", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Beatrice Fittizia", role: "D", club: "ClubDue", quotation: 8 },
  { name: "Carlo Esempio", role: "C", club: "ClubTre", quotation: 12 },
  { name: "Dario Placeholder", role: "A", club: "ClubQuattro", quotation: 20 },
];

// Wholly synthetic stand-in for what GET /api/listone serves from the private
// deposit: the same flat wire shape, deliberately different names from the
// static fixture above so a spec can tell which source actually won.
export const SYNTHETIC_REMOTE_LISTONE_POOL: readonly ListonePlayer[] = [
  { name: "Elena Deposito", role: "P", club: "ClubCinque", quotation: 6 },
  { name: "Furio Remoto", role: "C", club: "ClubSei", quotation: 15 },
];

/** Recipe version the synthetic served index declares — the same shape the
 *  Factory emits, never a value read from a real run. */
export const SYNTHETIC_APPEAL_INDEX_RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";
export const SYNTHETIC_APPEAL_INDEX_QUALITY = "sperimentale — evidenza scouting, non validato";

/**
 * Same rows as `SYNTHETIC_REMOTE_LISTONE_POOL`, plus the appeal index the
 * deposit carries once the Factory composes it: one row with a verdict, one
 * withheld, so a spec can assert both the number and the honest `n/d`.
 */
export const SYNTHETIC_REMOTE_LISTONE_POOL_WITH_INDEX: readonly ListonePlayer[] = [
  {
    ...SYNTHETIC_REMOTE_LISTONE_POOL[0]!,
    appealIndex: {
      score: null,
      quality: "non disponibile — nessun verdetto di modello",
      recipe: SYNTHETIC_APPEAL_INDEX_RECIPE,
      components: { appetibilitaBase: null, rischio: null },
    },
  },
  {
    ...SYNTHETIC_REMOTE_LISTONE_POOL[1]!,
    appealIndex: {
      score: 72.5,
      quality: SYNTHETIC_APPEAL_INDEX_QUALITY,
      recipe: SYNTHETIC_APPEAL_INDEX_RECIPE,
      components: { appetibilitaBase: 72.5, rischio: 40 },
    },
  },
];

/** Drive-shaped `modifiedTime` for the fixture above. 10:19 UTC in August is
 *  12:19 in Europe/Rome, which is what the note under the table must show. */
export const SYNTHETIC_REMOTE_MODIFIED_AT = "2026-08-12T10:19:04.617Z";
export const SYNTHETIC_REMOTE_MODIFIED_AT_LABEL = "12/08/2026 12:19";

// The player this suite's first slice calls and assigns — role A, present
// once, unambiguous name (no substring collision with the other 3 fixture
// rows above).
export const E2E_TARGET_PLAYER: ListonePlayer = SYNTHETIC_LISTONE_POOL[3]!;

// Well within budget (500) and far below any hard-reserve/floor boundary
// for a single purchase on an otherwise-empty roster (see
// packages/engine/src/feasibility.ts) — chosen only to be unambiguously
// feasible, not to exercise those boundaries (out of scope for this slice).
export const E2E_PURCHASE_PRICE = 10;
