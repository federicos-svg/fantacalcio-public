// SCHEDE GRUPPO ESPERTI — depositi sintetici per la suite E2E.
//
// Tutto inventato. I nomi («Dario Placeholder», «Aldo Prova») e i club
// («ClubQuattro», «ClubUno») sono gli stessi segnaposto del listone sintetico
// di questo repository; nessun giocatore reale, nessuna squadra reale, nessun
// handle di persona reale, nessun URL di forum. La prosa qui sotto è scritta
// per il test: non è, e non deve mai diventare, testo editoriale di terzi.
//
// PERCHÉ IL SEEDING PASSA DALL'ENDPOINT. `/api/schede` è lo stesso canale da
// cui l'app legge davvero il deposito (fetchExpertSchede in src/main.ts,
// servito in produzione dalla Pages Function del repository privato): la suite
// esercita quindi il percorso vero — content-type, JSON, validazione
// fail-closed, indicizzazione per `listonePlayerKey` — e non una porta di
// servizio aperta apposta per i test.

import type { ExpertScheda } from "../../src/expertScheda.js";
import { EXPERT_SCHEDA_SCHEMA_VERSION } from "../../src/expertScheda.js";

/** Il giocatore su cui la spec apre il momento LIVE. Ruolo A del listone sintetico. */
export const SCHEDA_PLAYER = "Dario Placeholder";
export const SCHEDA_CLUB = "ClubQuattro";

/** Un altro giocatore del listone sintetico: serve a provare «scheda non scritta». */
export const OTHER_PLAYER = "Aldo Prova";
export const OTHER_CLUB = "ClubUno";

/** La scheda piena: entrambi gli strati, visivo e prosa. */
export const FULL_SCHEDA: ExpertScheda = {
  player: SCHEDA_PLAYER,
  club: SCHEDA_CLUB,
  titolarita: "ballottaggio",
  percentuale: 60,
  gerarchia: 2,
  rigori: "designato",
  piazzati: ["punizioni"],
  avvisi: ["mercato"],
  nota:
    "Ballottaggio aperto da tre amichevoli e rinnovo non ancora firmato: se parte a fine mercato la scheda va riscritta da zero. Da rileggere il 1 settembre.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
};

/** Solo prosa: nessun segnale. Deve essere valida e rendersi bene. */
export const PROSE_ONLY_SCHEDA: ExpertScheda = {
  player: SCHEDA_PLAYER,
  club: SCHEDA_CLUB,
  nota: "Nessun segnale strutturato: la scheda dice solo che è rientrato in gruppo martedì.",
};

/** Fonte non di staff: il contenuto c'è ma non è attribuibile. */
export const COMMUNITY_SCHEDA: ExpertScheda = { ...FULL_SCHEDA, fonte: "community" };

/** Una scheda su un ALTRO giocatore: il deposito è letto, il chiamato non c'è. */
export const OTHER_PLAYER_SCHEDA: ExpertScheda = {
  player: OTHER_PLAYER,
  club: OTHER_CLUB,
  titolarita: "titolare",
};

export function schedeDeposit(schede: readonly ExpertScheda[]): string {
  return JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede });
}
