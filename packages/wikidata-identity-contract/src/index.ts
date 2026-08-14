// WIKIDATA-01 contract package. Pure, dependency-free, fixture-only — no
// network I/O, no Supabase, no n8n, no Wikipedia text parsing. Consumed by a
// future real pilot/adapter, never imported by src/ (browser app) or by
// packages/hybrid-dataset-contract (kept independent by design — identity/
// birthdate is a separate domain from the hybrid vote/feature dataset).
// See docs/data/WIKIDATA_IDENTITY_BIRTHDATE_CONTRACT.md.

export * from "./types.js";
export * from "./anagraficaResolution.js";
export * from "./calendarDate.js";
export * from "./calculateAgeAt.js";
export * from "./dateOfBirthUsability.js";
export * from "./identityMatchPolicy.js";
export * from "./referenceDate.js";
export * from "./wikidataBirthDate.js";
export * from "./wikidataPrecedence.js";
