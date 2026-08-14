// Command line di inserimento — the fast path that records a purchase from a
// single typed line, so the operator never falls behind the table (#231, T13).
//
// Layer without DOM, so it is unit-testable outside a browser environment —
// same shape as src/voidCommand.ts, src/logRecovery.ts and
// src/nominationContext.ts.
//
// What this module is NOT, by construction:
//  - it is not a new engine. Resolution ends in the SAME ProposedPurchase the
//    existing form builds, validated by the SAME purchaseFeasibility() and
//    persisted by the SAME saveAuctionLog(). `max_safe` and the hard reserve
//    keep their meaning and stay non-overridable: a command that would break
//    them is refused here exactly as the form is refused (docs/NO_GO.md
//    §Prodotto);
//  - it is not a suggestion surface. It never proposes a player, a team or a
//    price: it only resolves what the operator already typed;
//  - it never guesses. "Aggressive autocomplete" here means the matcher walks
//    exact -> prefix -> substring and stops at the FIRST tier that produces
//    matches; two matches in that tier are reported as ambiguous with the
//    candidates listed, never silently disambiguated. A wrong assignment is
//    far more expensive at the table than one more keystroke.
//
// Grammar (deliberately fixed, one order only):
//
//     <squadra> <prezzo> <giocatore…>          e.g.  `look 34 ataturk`
//
// The price is the unique positive-integer token; everything before it is the
// team query, everything after it the player query. A line with no integer
// token, or with two, is refused with an explicit reason rather than
// reinterpreted — the alternative (accepting both `squadra prezzo giocatore`
// and `giocatore prezzo squadra`) cannot be disambiguated safely, and getting
// it wrong assigns a real player to the wrong roster.

import type { AuctionEvent, AuctionState, Role } from "../packages/engine/src/types.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import {
  purchaseFeasibility,
  recordPurchase,
  type ProposedPurchase,
} from "../packages/engine/src/feasibility.js";
import { saveAuctionLog, type SaveLogResult, type StorageLike } from "./logRecovery.js";
import { normalizeIdentityPart } from "./ui/listone.js";
import { parsePositiveIntegerPrice } from "./price.js";

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface ParsedAssignCommand {
  readonly teamQuery: string;
  readonly price: number;
  readonly playerQuery: string;
}

export type AssignParseFailure =
  | "empty"
  | "price-missing"
  | "price-ambiguous"
  | "team-missing"
  | "player-missing";

export type AssignCommandParseResult =
  | { readonly ok: true; readonly parsed: ParsedAssignCommand }
  | { readonly ok: false; readonly reason: AssignParseFailure };

/** Splits `<squadra> <prezzo> <giocatore…>`. Pure; no matching yet. */
export function parseAssignCommand(raw: string): AssignCommandParseResult {
  const tokens = raw.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return { ok: false, reason: "empty" };

  const priceIndexes: number[] = [];
  tokens.forEach((token, index) => {
    if (parsePositiveIntegerPrice(token) !== null) priceIndexes.push(index);
  });

  if (priceIndexes.length === 0) return { ok: false, reason: "price-missing" };
  // Two integer tokens could mean either could be the price. Refusing is the
  // only safe reading: picking "the first" would silently fold the other into
  // a name query and record a price the operator did not intend.
  if (priceIndexes.length > 1) return { ok: false, reason: "price-ambiguous" };

  const priceIndex = priceIndexes[0]!;
  const teamTokens = tokens.slice(0, priceIndex);
  const playerTokens = tokens.slice(priceIndex + 1);
  if (teamTokens.length === 0) return { ok: false, reason: "team-missing" };
  if (playerTokens.length === 0) return { ok: false, reason: "player-missing" };

  return {
    ok: true,
    parsed: {
      teamQuery: teamTokens.join(" "),
      price: parsePositiveIntegerPrice(tokens[priceIndex]!)!,
      playerQuery: playerTokens.join(" "),
    },
  };
}

// ── Matching ──────────────────────────────────────────────────────────────────

/** How many candidates an ambiguity reports before truncating the list. */
export const AMBIGUITY_CANDIDATE_LIMIT = 6;

type MatchTier = "exact" | "prefix" | "substring";
const MATCH_TIERS: readonly MatchTier[] = ["exact", "prefix", "substring"] as const;

function matchesTier(haystack: string, needle: string, tier: MatchTier): boolean {
  if (haystack === "" || needle === "") return false;
  if (tier === "exact") return haystack === needle;
  if (tier === "prefix") return haystack.startsWith(needle);
  return haystack.includes(needle);
}

/**
 * The first tier (exact, then prefix, then substring) that matches anything.
 * Returns every match at that tier — one means resolved, several mean
 * ambiguous. Never falls through to a weaker tier once a stronger one has
 * matched, so a query that exactly names one candidate is never dragged into
 * an ambiguity by some longer candidate that merely contains it.
 */
function bestTierMatches<T>(
  candidates: readonly T[],
  needle: string,
  haystacksOf: (candidate: T) => readonly string[],
): readonly T[] {
  for (const tier of MATCH_TIERS) {
    const hits = candidates.filter((candidate) =>
      haystacksOf(candidate).some((haystack) => matchesTier(haystack, needle, tier)),
    );
    if (hits.length > 0) return hits;
  }
  return [];
}

// ── Resolution ────────────────────────────────────────────────────────────────

/** A seat the command line can address: its stable id plus its display label. */
export interface AssignCommandSeat {
  readonly fantaTeamId: string;
  readonly label: string;
}

/** A listone row the command line can address, already keyed by the caller. */
export interface AssignCommandPlayer {
  readonly playerId: string;
  readonly name: string;
  readonly club: string;
  readonly role: Role;
}

export interface ResolvedAssignCommand {
  readonly fantaTeamId: string;
  readonly teamLabel: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly club: string;
  readonly role: Role;
  readonly price: number;
}

export type AssignCommandResolution =
  | { readonly ok: true; readonly resolved: ResolvedAssignCommand }
  | { readonly ok: false; readonly reason: AssignParseFailure }
  | { readonly ok: false; readonly reason: "team-not-found"; readonly query: string }
  | {
      readonly ok: false;
      readonly reason: "team-ambiguous";
      readonly query: string;
      readonly candidates: readonly string[];
    }
  | { readonly ok: false; readonly reason: "player-not-found"; readonly query: string }
  | {
      readonly ok: false;
      readonly reason: "player-ambiguous";
      readonly query: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: "player-already-assigned";
      readonly query: string;
      readonly playerName: string;
    };

export interface AssignCommandContext {
  readonly seats: readonly AssignCommandSeat[];
  readonly pool: readonly AssignCommandPlayer[];
  /** `playerId`s already bought in the standing log — excluded from matching. */
  readonly assignedPlayerIds: ReadonlySet<string>;
}

function playerLabel(player: AssignCommandPlayer): string {
  return player.club ? `${player.name} (${player.club})` : player.name;
}

/**
 * Turns a typed line into exactly one purchase, or into an explicit reason why
 * it could not. Pure: no storage, no engine state, no side effect — the caller
 * decides what to do with the outcome.
 */
export function resolveAssignCommand(
  raw: string,
  context: AssignCommandContext,
): AssignCommandResolution {
  const parseResult = parseAssignCommand(raw);
  if (!parseResult.ok) return parseResult;
  const { teamQuery, price, playerQuery } = parseResult.parsed;

  const teamNeedle = normalizeIdentityPart(teamQuery);
  const seatMatches = bestTierMatches(context.seats, teamNeedle, (seat) => [
    normalizeIdentityPart(seat.label),
    normalizeIdentityPart(seat.fantaTeamId),
  ]);
  if (seatMatches.length === 0) return { ok: false, reason: "team-not-found", query: teamQuery };
  if (seatMatches.length > 1) {
    return {
      ok: false,
      reason: "team-ambiguous",
      query: teamQuery,
      candidates: seatMatches.slice(0, AMBIGUITY_CANDIDATE_LIMIT).map((seat) => seat.label),
    };
  }
  const seat = seatMatches[0]!;

  const playerNeedle = normalizeIdentityPart(playerQuery);
  // Club is part of the haystack so `ataturk juventus` can disambiguate two
  // namesakes, but it is never REQUIRED: a bare surname still matches.
  const haystacksOf = (player: AssignCommandPlayer): readonly string[] => [
    normalizeIdentityPart(player.name),
    normalizeIdentityPart(`${player.name} ${player.club}`),
  ];

  const available = context.pool.filter((p) => !context.assignedPlayerIds.has(p.playerId));
  const playerMatches = bestTierMatches(available, playerNeedle, haystacksOf);

  if (playerMatches.length === 0) {
    // Nothing available matched. Before reporting a bare "not found", check
    // whether the operator named someone already bought — that is a different
    // situation and deserves its own message rather than looking like a typo.
    const assigned = context.pool.filter((p) => context.assignedPlayerIds.has(p.playerId));
    const assignedMatches = bestTierMatches(assigned, playerNeedle, haystacksOf);
    if (assignedMatches.length === 1) {
      return {
        ok: false,
        reason: "player-already-assigned",
        query: playerQuery,
        playerName: playerLabel(assignedMatches[0]!),
      };
    }
    return { ok: false, reason: "player-not-found", query: playerQuery };
  }
  if (playerMatches.length > 1) {
    return {
      ok: false,
      reason: "player-ambiguous",
      query: playerQuery,
      candidates: playerMatches.slice(0, AMBIGUITY_CANDIDATE_LIMIT).map(playerLabel),
    };
  }
  const player = playerMatches[0]!;

  return {
    ok: true,
    resolved: {
      fantaTeamId: seat.fantaTeamId,
      teamLabel: seat.label,
      playerId: player.playerId,
      playerName: player.name,
      club: player.club,
      role: player.role,
      price,
    },
  };
}

// ── Execution ─────────────────────────────────────────────────────────────────

export type AssignCommandExecution =
  | { readonly ok: true; readonly events: readonly AuctionEvent[] }
  | { readonly ok: false; readonly reason: "not-feasible"; readonly violations: readonly string[] }
  | { readonly ok: false; readonly reason: "application-error"; readonly message: string }
  | Extract<SaveLogResult, { readonly ok: false }>;

/**
 * Records a resolved command as a purchase, through the ordinary engine path:
 * purchaseFeasibility() (which is what keeps `max_safe`/hard reserve
 * non-overridable) -> recordPurchase() -> saveAuctionLog().
 *
 * Fail-closed like executeVoidCommand: the caller must not advance its
 * in-memory log unless this returns `ok: true`, so a refused or unpersisted
 * command leaves no trace of a purchase that did not happen.
 *
 * `confirmations` (tranche 2b, optional, default none — byte-identical to
 * pre-2b when omitted) is pass-through only: `state` already reflects them
 * (the caller derives it via reduce(log, teamIds, confirmations), so a
 * confirmed player already shows up in `state.purchasedPlayerIds` and
 * purchaseFeasibility naturally refuses it as `duplicate-player` — no new
 * check needed here). This parameter only reaches saveAuctionLog(), so the
 * write validates/re-baselines against the same riconferme batch.
 */
export function executeAssignCommand(
  storage: StorageLike,
  log: readonly AuctionEvent[],
  state: AuctionState,
  resolved: ResolvedAssignCommand,
  timestamp: string,
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): AssignCommandExecution {
  const proposed: ProposedPurchase = {
    playerId: resolved.playerId,
    role: resolved.role,
    fantaTeamId: resolved.fantaTeamId,
    price: resolved.price,
  };

  const feasibility = purchaseFeasibility(state, proposed);
  if (!feasibility.ok) {
    return { ok: false, reason: "not-feasible", violations: feasibility.violations };
  }

  let nextLog: readonly AuctionEvent[];
  try {
    nextLog = recordPurchase(log, state, proposed, timestamp);
  } catch (err) {
    return {
      ok: false,
      reason: "application-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // `log` is the baseline this purchase was computed FROM: passing it makes
  // the write optimistic-concurrency safe, so a second tab that already
  // changed the stored log is not silently overwritten (audit fix 1).
  const saved = saveAuctionLog(storage, nextLog, fantaTeamIds, log, confirmations);
  if (!saved.ok) return saved;
  return { ok: true, events: nextLog };
}
