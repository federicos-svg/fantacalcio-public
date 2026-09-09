// Contratto eseguibile della giornata (passo 1), simulatore esatto (passo 2),
// ottimizzatore ex-post e regret (passo 3), produttore di formazione ex-ante
// (passo 4), politiche di riferimento e metriche del confronto (§11 del disegno
// del generatore), previsione base dai voti storici (§6.2, WP-4), motore
// sfidante che impara dalla stagione (§6.3). Fase 2 — Lineup Coach.
export * from "./leagueGameweek.js";
export * from "./gameweekSimulator.js";
export * from "./lineupOptimizer.js";
export * from "./competitionObjective.js";
export * from "./opponentDistribution.js";
export * from "./playerScenario.js";
export * from "./lineupProposer.js";
export * from "./referencePolicies.js";
export * from "./policyMetrics.js";
export * from "./baseForecast.js";
export * from "./challengerForecast.js";
