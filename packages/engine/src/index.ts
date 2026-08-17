export * from "./types.js";
export * from "./events.js";
export * from "./confirmations.js";
export * from "./reduce.js";
export * from "./auction.js";
export * from "./feasibility.js";
export * from "./settings.js";
export * from "./budget.js";
export * from "./parser.js";
export * from "./normalizer.js";
export * from "./workbook.js";
export * from "./voteRecordValidation.js";
export * from "./pipeline.js";
export * from "./rawFileValidation.js";
export * from "./acquisitionManifestValidation.js";
export * from "./pilotDryRunExecutor.js";
// Motore live — strato 2 (ancore reali, inflazione misurata, cliff, competitor
// set, tensione, finestra). Vedi docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §3/§8.
export * from "./anchors.js";
export * from "./cliff.js";
export * from "./competitors.js";
export * from "./tension.js";
export * from "./nominationWindow.js";
// Motore live — strato 3 (valori dichiarati di Owner, piano rosa vivo, radar
// occasioni, schermata chiamata coi tre numeri decisionali). Vedi
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §4.1/§4.2 e riga 3 di §8.
export * from "./declaredValues.js";
export * from "./livePlan.js";
export * from "./opportunities.js";
export * from "./callScreen.js";
export * from "./identityName.js";
// Fasce d'asta — l'ordinamento arriva INIETTATO col proprio contratto di
// provenienza (mai calcolato né cablato qui) e il motore ne ricava la fascia
// del giocatore chiamato più la contabilità che le sta intorno. Vedi
// packages/engine/src/tiers.ts §"Il contratto di iniezione" e
// docs/DECISIONS.md §"Eccezioni operative scritte" (2026-08-16).
export * from "./tiers.js";
