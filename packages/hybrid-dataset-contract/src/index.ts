// Hybrid dataset contract package. Pure, dependency-free, fixture-only — no network
// I/O, no Supabase, no n8n. Consumed by future adapters/scripts, never imported by
// src/ (browser app) or packages/engine (kept dependency-free by design).
// See docs/data/HYBRID_ALGORITHM_DATASET_CONTRACT.md for the full contract.

export * from "./types.js";
export * from "./coverageClassifier.js";
export * from "./conflictClassifier.js";
export * from "./precedencePolicy.js";
export * from "./pointInTimeClassifier.js";
