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
});

export const voidSchema = z.object({
  type: z.literal("VOID"),
  seq: z.number().int().nonnegative(),
  ts: z.string().min(1),
  targetSeq: z.number().int().nonnegative(),
});

export const eventSchema = z.discriminatedUnion("type", [purchaseSchema, voidSchema]);

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
 * (e.g. VOID, or a purchase already admitted by `recordPurchase`).
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
