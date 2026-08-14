import { describe, expect, it } from "vitest";
import { resolveReferenceDate } from "../src/referenceDate.js";

describe("resolveReferenceDate — context-driven, no cross-context precedence (round 2 finding 1)", () => {
  it("PLAYER_MATCH picks MATCH_DATE even when AUCTION_DATE and SEASON_START_DATE are also known", () => {
    const result = resolveReferenceDate("PLAYER_MATCH", [
      { type: "AUCTION_DATE", value: "2019-09-01" },
      { type: "SEASON_START_DATE", value: "2019-08-24" },
      { type: "MATCH_DATE", value: "2019-09-15" },
    ]);
    expect(result).toEqual({ status: "OK", type: "MATCH_DATE", value: "2019-09-15" });
  });

  it("PLAYER_SEASON picks SEASON_START_DATE even when a MATCH_DATE is also present", () => {
    const result = resolveReferenceDate("PLAYER_SEASON", [
      { type: "MATCH_DATE", value: "2019-09-15" },
      { type: "SEASON_START_DATE", value: "2019-08-24" },
    ]);
    expect(result).toEqual({ status: "OK", type: "SEASON_START_DATE", value: "2019-08-24" });
  });

  it("AUCTION_BACKTEST picks only AUCTION_DATE, ignoring every other candidate present", () => {
    const result = resolveReferenceDate("AUCTION_BACKTEST", [
      { type: "SEASON_START_DATE", value: "2019-08-24" },
      { type: "MATCH_DATE", value: "2019-09-15" },
      { type: "OBSERVATION_DATE", value: "2019-10-01" },
      { type: "AUCTION_DATE", value: "2019-09-01" },
    ]);
    expect(result).toEqual({ status: "OK", type: "AUCTION_DATE", value: "2019-09-01" });
  });

  it("GENERIC_SNAPSHOT picks OBSERVATION_DATE", () => {
    const result = resolveReferenceDate("GENERIC_SNAPSHOT", [
      { type: "OBSERVATION_DATE", value: "2019-10-01" },
    ]);
    expect(result).toEqual({ status: "OK", type: "OBSERVATION_DATE", value: "2019-10-01" });
  });

  it("returns REFERENCE_DATE_MISSING when the context's required date is absent, even if other types are present", () => {
    const result = resolveReferenceDate("PLAYER_MATCH", [
      { type: "AUCTION_DATE", value: "2019-09-01" },
      { type: "SEASON_START_DATE", value: "2019-08-24" },
    ]);
    expect(result).toEqual({ status: "REFERENCE_DATE_MISSING", requiredType: "MATCH_DATE" });
  });

  it("returns REFERENCE_DATE_MISSING when no candidates are known at all", () => {
    const result = resolveReferenceDate("AUCTION_BACKTEST", []);
    expect(result).toEqual({ status: "REFERENCE_DATE_MISSING", requiredType: "AUCTION_DATE" });
  });

  it("never falls back across contexts implicitly — no explicitFallbackOrder means no substitution", () => {
    const result = resolveReferenceDate("AUCTION_BACKTEST", [
      { type: "OBSERVATION_DATE", value: "2019-10-01" },
    ]);
    expect(result.status).toBe("REFERENCE_DATE_MISSING");
  });

  it("an explicit, caller-provided fallback order is honored only when named", () => {
    const result = resolveReferenceDate(
      "AUCTION_BACKTEST",
      [{ type: "SEASON_START_DATE", value: "2019-08-24" }],
      ["SEASON_START_DATE"],
    );
    expect(result).toEqual({ status: "OK", type: "SEASON_START_DATE", value: "2019-08-24" });
  });

  it("season 2019-20: AUCTION_BACKTEST/PLAYER_SEASON/PLAYER_MATCH each resolve to their own distinct 2019 date", () => {
    const candidates = [
      { type: "AUCTION_DATE" as const, value: "2019-09-01" },
      { type: "SEASON_START_DATE" as const, value: "2019-08-24" },
      { type: "MATCH_DATE" as const, value: "2019-09-15" },
    ];
    expect(resolveReferenceDate("AUCTION_BACKTEST", candidates)).toEqual({
      status: "OK",
      type: "AUCTION_DATE",
      value: "2019-09-01",
    });
    expect(resolveReferenceDate("PLAYER_SEASON", candidates)).toEqual({
      status: "OK",
      type: "SEASON_START_DATE",
      value: "2019-08-24",
    });
    expect(resolveReferenceDate("PLAYER_MATCH", candidates)).toEqual({
      status: "OK",
      type: "MATCH_DATE",
      value: "2019-09-15",
    });
  });
});
