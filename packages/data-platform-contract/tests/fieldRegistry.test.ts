import { describe, expect, it } from "vitest";
import {
  DATA_FIELD_REGISTRY,
  getField,
  validateFieldRegistry,
} from "../src/fieldRegistry.js";
import type { FieldRegistryEntry } from "../src/types.js";

describe("data field registry", () => {
  it("accepts the canonical registry", () => {
    expect(validateFieldRegistry()).toEqual([]);
  });

  it("keeps editorial observations, rules and derived scores separate", () => {
    expect(getField("fantacalcio_base_vote").family).toBe("editorial_vote");
    expect(getField("league_rule_version").family).toBe("league_rule");
    expect(getField("fantacalcio_player_score").family).toBe("derived_fantasy_score");
    expect(getField("fantacalcio_player_score").providers[0]?.sourceId).toBe(
      "internal_derivation",
    );
  });

  it("keeps external feature names provider-scoped", () => {
    expect(getField("api_football_rating").providers[0]?.providerScopedName).toBe(
      "api_football_rating",
    );
    expect(getField("transfermarkt_market_value").providers[0]?.providerScopedName).toBe(
      "transfermarkt_market_value",
    );
    expect(
      getField("player_date_of_birth").providers.find((provider) => provider.sourceId === "wikidata")
        ?.role,
    ).toBe("CROSS_CHECK");
  });

  it("rejects an external provider as target authority", () => {
    const target = getField("api_football_rating");
    const entries = DATA_FIELD_REGISTRY.map((entry) =>
      entry.id === target.id ? { ...entry, algorithmUse: "TARGET" as const } : entry,
    );
    expect(validateFieldRegistry(entries)).toContain(
      "api_football_rating: api_football cannot provide a TARGET",
    );
  });

  it("requires available_at for features and targets", () => {
    const entries = DATA_FIELD_REGISTRY.map((entry) =>
      entry.id === "player_minutes"
        ? {
            ...entry,
            requiredTimestamps: entry.requiredTimestamps.filter(
              (timestamp) => timestamp !== "available_at",
            ),
          }
        : entry,
    ) as readonly FieldRegistryEntry[];
    expect(validateFieldRegistry(entries)).toContain(
      "player_minutes: FEATURE requires available_at",
    );
  });

  it("rejects ambiguous bare provider field names", () => {
    const entries = DATA_FIELD_REGISTRY.map((entry) =>
      entry.id === "api_football_rating"
        ? {
            ...entry,
            providers: [{ ...entry.providers[0]!, providerScopedName: "rating" }],
          }
        : entry,
    ) as readonly FieldRegistryEntry[];
    expect(validateFieldRegistry(entries)).toContain(
      "api_football_rating: ambiguous provider field name rating",
    );
  });

  it("rejects a provider field without its required prefix", () => {
    const entries = DATA_FIELD_REGISTRY.map((entry) =>
      entry.id === "player_minutes"
        ? {
            ...entry,
            providers: [{ ...entry.providers[0]!, providerScopedName: "provider_minutes" }],
          }
        : entry,
    ) as readonly FieldRegistryEntry[];
    expect(validateFieldRegistry(entries)).toContain(
      "player_minutes: api_football field must start with api_football_",
    );
  });

  it("rejects internal derivation outside derived-score fields", () => {
    const entries = DATA_FIELD_REGISTRY.map((entry) =>
      entry.id === "api_football_rating"
        ? {
            ...entry,
            providers: [
              {
                sourceId: "internal_derivation" as const,
                providerScopedName: "internal_rating",
                role: "DERIVATION" as const,
                coverageStatus: "DERIVED_ONLY" as const,
              },
            ],
          }
        : entry,
    ) as readonly FieldRegistryEntry[];
    expect(validateFieldRegistry(entries)).toContain(
      "api_football_rating: internal derivation is only valid for derived_fantasy_score",
    );
  });
});
