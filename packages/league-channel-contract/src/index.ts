// CONTRATTO DI OSSERVAZIONE DELLA LEGA — passo 5 della Fase 2 (Lineup Coach).
// Tipi canonici, validatori e funzioni pure che descrivono ciò che una lega
// reale espone, **agnostici dalla fonte**: qui non c'è nessun codice di
// acquisizione, nessun host, nessun endpoint, nessun header, nessuna
// credenziale. È il ponte fra la lettura della piattaforma (privata) e
// `packages/league-gameweek`, che calcola.
export * from "./leagueSettings.js";
export * from "./ruleReconciliation.js";
export * from "./roster.js";
export * from "./calendar.js";
export * from "./lineupSubmission.js";
export * from "./lineupDraft.js";
export * from "./pitchLayout.js";
export * from "./submissionLegality.js";
export * from "./lineupCoachSurface.js";
