// Misura dell'affidabilità delle fonti pre-partita: accordo fra ciò che una
// fonte dichiara e chi è sceso in campo davvero, per giocatore, e aggregato per
// fonte, per squadra e per giornata. Solo misura — nessun peso, nessuna
// classifica, nessuna raccomandazione.
export * from "./sourceAgreement.js";

// La combinazione delle letture di più fonti in una probabilità di essere
// titolare: pesi uguali finché la squadra non è misurata abbastanza, pesi
// misurati dopo, con il prior Beta dichiarato. Il peso lo decide la regola
// pre-registrata, non chi chiama.
export * from "./starterProbability.js";
