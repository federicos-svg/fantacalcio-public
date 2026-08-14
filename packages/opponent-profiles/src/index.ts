// Opponent profiles (T16, issue #234) — package entry point.
//
// Schema + validator for the pre-auction interview profile, deterministic
// observed counters with a declared cold start, and the join that pairs the
// two without ever blending them. Fixture-only in the repo: real profiles
// live exclusively in runtime-local storage (storage.ts).
//
// Contract: docs/data/OPPONENT_PROFILE_CONTRACT.md
// Perimeter: docs/DECISIONS.md §D9 perimetro 3
//
// NOT in this package (deliberately, and each for its own reason):
//   - the LLM interview agent (separate work item; it is pre-auction tooling,
//     and no LLM may ever sit in the live loop — docs/NO_GO.md);
//   - any UI (this tranche ships no file under the app root `src/`);
//   - seat accounting — budget residual, slots per role — which is already
//     `opponentTier1()` in packages/engine and is not duplicated here.

export * from "./types.js";
export * from "./profileSchema.js";
export * from "./counters.js";
export * from "./profileView.js";
export * from "./storage.js";
