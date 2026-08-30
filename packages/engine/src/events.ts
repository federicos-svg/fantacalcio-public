import { z } from "zod";
import type { AuctionEvent } from "./types.js";
import { ROLES } from "./types.js";

const roleSchema = z.enum(["P", "D", "C", "A"]);

export const purchaseSchema = z.object({
  type: z.literal("PURCHASE"),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  playerId: z.string().min(1),
  role: roleSchema,
  fantaTeamId: z.string().min(1),
  price: z.number().int().nonnegative(),
  // See PurchaseEvent.thirdGoalkeeperZeroDeclared (types.ts) — optional so
  // every existing event (and every non-zero purchase) is unaffected; must
  // stay `z.literal(true)` (never a plain boolean) so the schema itself
  // rejects `false`, which would only ever be a bug, never a real fact.
  thirdGoalkeeperZeroDeclared: z.literal(true).optional(),
});

export const voidSchema = z.object({
  type: z.literal("VOID"),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  targetSeq: z.number().int().nonnegative(),
});

// Un playerId dentro uno scambio: stessa forma minima del playerId di un
// acquisto. La verifica che quel giocatore sia DAVVERO nella rosa della
// squadra che lo cede e semantica, non strutturale, e vive in
// `tradeFeasibility` (feasibility.ts) — qui si controlla solo la forma.
const playerIdSchema = z.string().min(1);

export const releaseSchema = z.object({
  type: z.literal("RELEASE"),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  playerId: playerIdSchema,
  fantaTeamId: z.string().min(1),
  // Interi non negativi: il tetto (mai piu del prezzo pagato) e semantico e lo
  // impone `releaseFeasibility`, perche solo li si conosce il prezzo.
  creditsReturned: z.number().int().nonnegative(),
});

export const tradeSchema = z.object({
  type: z.literal("TRADE"),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  teamAId: z.string().min(1),
  teamBId: z.string().min(1),
  fromA: z.array(playerIdSchema),
  fromB: z.array(playerIdSchema),
  // Il conguaglio e l'UNICO campo firmato di tutto il log: il segno dice chi
  // paga, e senza segno servirebbero due campi che possono contraddirsi.
  creditsAToB: z.number().int(),
});

export const eventSchema = z.discriminatedUnion("type", [
  purchaseSchema,
  voidSchema,
  releaseSchema,
  tradeSchema,
]);

export function validateEvent(e: unknown): AuctionEvent {
  return eventSchema.parse(e) as AuctionEvent;
}

/**
 * Append-only LOW-LEVEL primitive: returns a NEW array; never mutates inputs.
 * Enforces strictly increasing seq + event schema. The existing log is
 * frozen-safe: we copy, we do not write into it.
 *
 * HARD-SAFE BOUNDARY: this does NOT check auction feasibility (budget, slots,
 * duplicates, hard reserve). A schema-valid but impossible PURCHASE will be
 * appended. Manual purchase input MUST go through `recordPurchase`
 * (see feasibility.ts), which runs `purchaseFeasibility` before appending.
 * Use `appendEvent` directly only for events already known to be safe
 * (e.g. VOID, or a purchase already admitted by `recordPurchase`). Lo stesso
 * vale per RELEASE e TRADE: passano da `recordRelease` / `recordTrade`, che
 * eseguono `releaseFeasibility` / `tradeFeasibility` prima di appendere.
 */
export function appendEvent(
  log: readonly AuctionEvent[],
  event: AuctionEvent,
): readonly AuctionEvent[] {
  validateEvent(event);
  const lastSeq = log.length > 0 ? log[log.length - 1]!.seq : -1;
  if (event.seq <= lastSeq) {
    throw new Error(
      `append-only violation: seq ${event.seq} must be > last seq ${lastSeq}`,
    );
  }
  return [...log, event];
}

export { ROLES };
