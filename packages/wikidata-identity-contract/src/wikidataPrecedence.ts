import type {
  WikidataPrecedenceResponsibility,
  WikidataPrecedenceState,
} from "./types.js";

// Before a real WIKIDATA-01 coverage pilot passes, Wikidata is a candidate
// only — mirrors packages/hybrid-dataset-contract's candidate/effective
// split (finding 1, that batch). No field in this contract may claim
// PRIMARY_WIKIDATA until `wikidataPilotVerified` is backed by a real,
// passed pilot — never a design doc or an MCP reachability check alone.
export const WIKIDATA_PRECEDENCE_STATE_V1: WikidataPrecedenceState = {
  preferredSourceCandidate: "wikidata",
  wikidataPilotVerified: false,
};

export function effectiveWikidataResponsibility(
  state: WikidataPrecedenceState,
): WikidataPrecedenceResponsibility {
  if (state.preferredSourceCandidate === "wikidata" && state.wikidataPilotVerified) {
    return "PRIMARY_WIKIDATA";
  }
  return "MISSING";
}
