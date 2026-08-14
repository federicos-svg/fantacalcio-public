import { describe, expect, it } from "vitest";
import {
  effectiveWikidataResponsibility,
  WIKIDATA_PRECEDENCE_STATE_V1,
} from "../src/wikidataPrecedence.js";

describe("effectiveWikidataResponsibility", () => {
  it("v1 state has Wikidata as candidate but not pilot-verified — no real pilot has run yet", () => {
    expect(WIKIDATA_PRECEDENCE_STATE_V1.preferredSourceCandidate).toBe("wikidata");
    expect(WIKIDATA_PRECEDENCE_STATE_V1.wikidataPilotVerified).toBe(false);
  });

  it("effective responsibility is MISSING before a real pilot passes — never PRIMARY_WIKIDATA by default", () => {
    expect(effectiveWikidataResponsibility(WIKIDATA_PRECEDENCE_STATE_V1)).toBe("MISSING");
  });

  it("effective responsibility becomes PRIMARY_WIKIDATA only once a real pilot is verified", () => {
    const verified = { preferredSourceCandidate: "wikidata" as const, wikidataPilotVerified: true };
    expect(effectiveWikidataResponsibility(verified)).toBe("PRIMARY_WIKIDATA");
  });

  it("candidate 'none' is always MISSING regardless of the verified flag", () => {
    const noneCandidate = { preferredSourceCandidate: "none" as const, wikidataPilotVerified: true };
    expect(effectiveWikidataResponsibility(noneCandidate)).toBe("MISSING");
  });
});
