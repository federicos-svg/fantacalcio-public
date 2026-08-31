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
// Il PREZZO RELATIVO — «quanto costa vincere adesso»: il secondo max bid fra i
// rivali eleggibili, più uno, con tetto al più ricco e a `maxSafe(io, ruolo)`.
// Vedi packages/engine/src/relativeValue.ts e `docs/DECISIONS.md` §"Il prezzo
// relativo si assesta su quanto mette il secondo, non il più ricco" (2026-08-24).
export * from "./relativeValue.js";
export * from "./identityName.js";
// Fasce d'asta — l'ordinamento arriva INIETTATO col proprio contratto di
// provenienza (mai calcolato né cablato qui) e il motore ne ricava la fascia
// del giocatore chiamato più la contabilità che le sta intorno. Vedi
// packages/engine/src/tiers.ts §"Il contratto di iniezione" e
// docs/DECISIONS.md §"Eccezioni operative scritte" (2026-08-16).
export * from "./tiers.js";
// Valore assoluto in crediti — la scala DERIVATA dal regolamento (budget
// ripartito dai target dichiarati di Pico, diviso per gli slot del ruolo,
// collocato dalla fascia) più le tre gambe che la spostano, oggi tutte a peso
// zero. Vedi packages/engine/src/absoluteValue.ts §"La catena della
// derivazione" (decisione di Pico, 2026-08-24).
export * from "./absoluteValue.js";
// Indice di appetibilità RELATIVO — quanto è appetibile il chiamato adesso fra
// quelli del suo ruolo che si possono ancora prendere. Un punteggio da 0 a 100
// (decisione di Pico, 2026-08-24) scritto come QUOTA di due conteggi sull'ordine
// già dichiarato: nessuna curva da scegliere, nessun coefficiente nuovo.
// Vedi packages/engine/src/relativeIndex.ts §"La forma: una quota di conteggi".
export * from "./relativeIndex.js";
// `P̂` — IL PREZZO ATTESO DI STASERA (NOM-PROTOCOL-A §A.2): la curva storica
// rango→prezzo per fasce dichiarate, col suo pool medio misurato, e la catena
// che la legge al rango di listone con pool ratio, inflazione di ruolo e tetto
// del più ricco rivale eleggibile. Uno scalare che non esiste senza il proprio
// blocco d'incertezza. Vedi packages/engine/src/priceHistory.ts e
// packages/engine/src/expectedPrice.ts.
export * from "./priceHistory.js";
export * from "./expectedPrice.js";
// `V` — IL VALORE IN CREDITI (NOM-PROTOCOL-A §A.1) e `S` — IL SURPLUS ATTESO
// (§A.3): il VORP sul rango di rimpiazzo derivato dal regolamento, il residuo
// del tavolo ripartito col metodo dei resti maggiori, le due correzioni
// dichiarate entrambe spente di default, e l'override di Pico che comanda al
// posto della targa del generatore — mai una media fra i due. Vedi
// packages/engine/src/creditValue.ts.
export * from "./creditValue.js";
// `E_o`, `drain`, `D` e `S_base` — LA SPESA ATTESA DEGLI ALTRI E IL DIVARIO
// DELL'ESCA (NOM-PROTOCOL-A §A.5/§A.6): il tetto contabile di ciascun esposto
// incrociato col prezzo di mercato e col sovrapprezzo INIETTATO dei suoi
// precedenti (interruttore spento di default), poi la scala degli esposti —
// secondo più uno, col tetto al massimo — e le due sottrazioni che ne
// discendono. Vedi packages/engine/src/baitDrain.ts.
export * from "./baitDrain.js";
