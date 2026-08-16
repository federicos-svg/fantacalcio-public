import { describe, expect, it } from "vitest";
import {
  DATA_SOURCE_REGISTRY,
  getSource,
  validateSourceRegistry,
} from "../src/sourceRegistry.js";
import type { SourceRegistryEntry } from "../src/types.js";

describe("data source registry", () => {
  it("accepts the canonical registry", () => {
    expect(validateSourceRegistry()).toEqual([]);
  });

  it("keeps blocked providers out of the live MVP and core Value", () => {
    const blocked = getSource("wikidata");
    expect(blocked.state).toBe("BLOCKED_TECHNICAL");
    expect(blocked.requiredForLiveMvp).toBe(false);
    expect(blocked.requiredForCoreValue).toBe(false);
  });

  it("keeps the manual rule source out of the live runtime dependency set", () => {
    const rules = getSource("league_manual");
    expect(rules.requiredForLiveMvp).toBe(false);
    expect(rules.dataFamilies).toEqual(["league_rule"]);
  });

  it("does not make external providers ground truth", () => {
    expect(getSource("api_football").authorityRoles).not.toContain("GROUND_TRUTH");
    expect(getSource("wikidata").authorityRoles).not.toContain("GROUND_TRUTH");
  });

  it("registers only Topic Unico as a non-authoritative expert source", () => {
    const experts = getSource("gruppo_esperti_topic_unico");
    expect(experts.authorityRoles).toContain("EXPERT_OPINION");
    expect(experts.authorityRoles).not.toContain("GROUND_TRUTH");
    expect(experts.state).toBe("NOT_TESTED");
    expect(experts.requiredForLiveMvp).toBe(false);
    expect(experts.requiredForCoreValue).toBe(false);
  });

  it("does not allow other sources to claim expert-opinion authority", () => {
    const entries = DATA_SOURCE_REGISTRY.map((entry) =>
      entry.id === "api_football"
        ? { ...entry, authorityRoles: ["EXPERT_OPINION"] as const }
        : entry,
    ) as readonly SourceRegistryEntry[];
    expect(validateSourceRegistry(entries)).toContain(
      "api_football: only gruppo_esperti_topic_unico may be EXPERT_OPINION",
    );
  });

  it("rejects duplicate source identifiers", () => {
    expect(validateSourceRegistry([...DATA_SOURCE_REGISTRY, DATA_SOURCE_REGISTRY[0]!])).toContain(
      "duplicate source id: fantacalcio_votes",
    );
  });

  it("rejects any non-operational source as a live dependency", () => {
    const entries = DATA_SOURCE_REGISTRY.map((entry) =>
      entry.id === "wikidata" ? { ...entry, requiredForLiveMvp: true } : entry,
    ) as readonly SourceRegistryEntry[];
    expect(validateSourceRegistry(entries)).toContain(
      "wikidata: state BLOCKED_TECHNICAL cannot satisfy live MVP",
    );
  });

  it("rejects external ground-truth authority", () => {
    const entries = DATA_SOURCE_REGISTRY.map((entry) =>
      entry.id === "api_football"
        ? { ...entry, authorityRoles: ["GROUND_TRUTH"] as const }
        : entry,
    ) as readonly SourceRegistryEntry[];
    expect(validateSourceRegistry(entries)).toContain(
      "api_football: only fantacalcio_votes may be GROUND_TRUTH",
    );
  });

  it("no longer registers the removed source, under any id or label", () => {
    const ids = DATA_SOURCE_REGISTRY.map((entry) => entry.id as string);
    expect(ids).not.toContain("transfermarkt");
    expect(ids).not.toContain("market_value");
    for (const entry of DATA_SOURCE_REGISTRY) {
      expect(entry.label.toLowerCase()).not.toContain("transfermarkt");
      expect(entry.dataFamilies as readonly string[]).not.toContain("market_value");
    }
  });

  it("fails closed when a required source disappears", () => {
    const entries = DATA_SOURCE_REGISTRY.filter((entry) => entry.id !== "league_manual");
    expect(validateSourceRegistry(entries)).toContain("missing required source: league_manual");
  });
});
