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
import type { PagellaScheda } from "../../src/pagellaEsperti.js";

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

// ── L'AGGANCIO DEL NOME ──────────────────────────────────────────────────────
//
// Il caso reale che l'aggancio esiste per non perdere: le fonti del Gruppo
// Esperti scrivono il nome intero, il listone della lega scrive il cognome
// nudo. Le schede qui sotto sono scritte sul nome INTERO, e la riga di listone
// che le cerca porta solo `SHORT_NAME` — la stessa asimmetria di un deposito
// vero, riprodotta con nomi che restano segnaposto.

/** Il cognome nudo, come lo scrive il listone della lega. */
export const SHORT_NAME = "Placeholder";

/** Un secondo nome intero sullo stesso cognome e nella stessa squadra. */
export const SECOND_FULL_NAME = "Bruna Placeholder";

/** Scheda scritta sul nome intero: la riga «Placeholder» deve trovarla. */
export const FULL_NAME_SCHEDA: ExpertScheda = {
  player: SCHEDA_PLAYER,
  club: SCHEDA_CLUB,
  titolarita: "titolare",
  nota: "Scheda scritta col nome intero, come la scrivono le fonti.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
};

/** La seconda scheda: due nomi interi diversi, un cognome solo. Qui si chiede. */
export const SECOND_FULL_NAME_SCHEDA: ExpertScheda = {
  player: SECOND_FULL_NAME,
  club: SCHEDA_CLUB,
  titolarita: "riserva",
  nota: "Seconda scheda, altro nome intero sullo stesso cognome.",
  aggiornata: "2026-08-30",
  fonte: "staff",
};

// ── LA PAGELLA GRUPPO ESPERTI ────────────────────────────────────────────────
//
// I cinque voti su 10 della riga evidenziata delle schede, tutti INVENTATI: i
// numeri qui sotto non vengono da nessuna scheda reale e non descrivono nessun
// giocatore reale. Servono a esercitare le tre forme che il radar deve reggere
// — completa, parziale, assente — più i due difetti che il contratto è fatto
// per dichiarare: il TOTALE che non torna e l'asse del ruolo sbagliato.

/** Movimento, cinque voti su cinque, totale coerente: 9+7+9+6+8 = 39. */
export const PAGELLA_COMPLETA: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
};

/** Lo stesso, ma con il TOTALE della fonte che NON torna: la prova di un errore. */
export const PAGELLA_DIVERGENTE: PagellaScheda = { ...PAGELLA_COMPLETA, totaleFonte: 41 };

/** Due voti su cinque: il radar deve mostrare i punti e NON il poligono. */
export const PAGELLA_PARZIALE: PagellaScheda = {
  voti: { pagella_titolarita: 9, pagella_salute: 4 },
};

/** Portiere: il quarto asse è «porta inviolata». 1+1+8+1+1 = 12. */
export const PAGELLA_PORTIERE: PagellaScheda = {
  voti: {
    pagella_titolarita: 1,
    pagella_media_voto: 1,
    pagella_salute: 8,
    pagella_porta_inviolata: 1,
    pagella_consiglio: 1,
  },
  totaleFonte: 12,
};

/** La scheda del chiamato CON la pagella completa. */
export const PAGELLA_SCHEDA: ExpertScheda = { ...FULL_SCHEDA, pagella: PAGELLA_COMPLETA };
export const PAGELLA_SCHEDA_PARZIALE: ExpertScheda = { ...FULL_SCHEDA, pagella: PAGELLA_PARZIALE };
export const PAGELLA_SCHEDA_DIVERGENTE: ExpertScheda = { ...FULL_SCHEDA, pagella: PAGELLA_DIVERGENTE };

/** Una scheda di PORTIERE, sul portiere del listone sintetico. */
export const PAGELLA_SCHEDA_PORTIERE: ExpertScheda = {
  player: OTHER_PLAYER,
  club: OTHER_CLUB,
  titolarita: "titolare",
  nota: "Scheda di portiere: il quarto asse è la porta inviolata.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
  pagella: PAGELLA_PORTIERE,
};

/**
 * Una scheda di MOVIMENTO appiccicata al portiere: l'asse dichiarato è
 * «bonus», l'asse atteso è «porta inviolata». Il voto non va usato, va detto.
 */
export const PAGELLA_SCHEDA_RUOLO_SBAGLIATO: ExpertScheda = {
  ...PAGELLA_SCHEDA_PORTIERE,
  pagella: PAGELLA_COMPLETA,
};

// ── LE ICONE ACCANTO AL RADAR ────────────────────────────────────────────────
//
// I nomi degli altri in ballottaggio sono segnaposto come tutto il resto di
// questo file: «Bruna Placeholder», «Carlo Segnaposto», «Dina Fittizia». Le
// quote sono inventate e non sommano a nessuna verità.
//
// OGNI SOGGETTO PORTA LA PROPRIA SQUADRA, come il contratto adesso ammette: la
// stessa del giocatore della scheda, perché un ballottaggio è una contesa per
// un posto in una formazione e questi segnaposto sono i suoi compagni. Non è
// una regola del contratto — un rivale di un altro club resta ammesso — è la
// forma normale del caso che queste fixture rappresentano.

/** Tutte e quattro le icone accese: tre segnali più la lista «consigliato». */
export const ICONE_SCHEDA_PIENA: ExpertScheda = {
  player: SCHEDA_PLAYER,
  club: SCHEDA_CLUB,
  titolarita: "ballottaggio",
  percentuale: 60,
  ballottaggio: [{ surface: "Bruna Placeholder", club: SCHEDA_CLUB, sharePercent: 40 }],
  rigori: "designato",
  piazzati: ["punizioni", "angoli"],
  lista: "consigliato",
  nota: "Scheda sintetica: serve a provare le quattro icone accese insieme.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
};

/** Tre icone SPENTE e nessuna quarta: la scheda dice solo che è titolare. */
export const ICONE_SCHEDA_SPENTA: ExpertScheda = {
  player: SCHEDA_PLAYER,
  club: SCHEDA_CLUB,
  titolarita: "titolare",
  nota: "Scheda sintetica: nessun rigore, nessun piazzato, nessuna lista.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
};

/** Ballottaggio a TRE: due altri nomi, ognuno con la sua quota. */
export const ICONE_SCHEDA_TRE_NOMI: ExpertScheda = {
  ...ICONE_SCHEDA_PIENA,
  percentuale: 50,
  ballottaggio: [
    { surface: "Bruna Placeholder", club: SCHEDA_CLUB, sharePercent: 30 },
    { surface: "Carlo Segnaposto", club: SCHEDA_CLUB, sharePercent: 20 },
  ],
  lista: "possibile_sorpresa",
};

/** La lista «possibile sorpresa», da sola. */
export const ICONE_SCHEDA_SORPRESA: ExpertScheda = {
  ...ICONE_SCHEDA_SPENTA,
  lista: "possibile_sorpresa",
};

/**
 * La sola delle tre liste che il deposito produce OGGI, e arriva come avviso:
 * la quarta icona deve accendersi rossa senza che il campo `lista` esista.
 */
export const ICONE_SCHEDA_SCONSIGLIATO: ExpertScheda = {
  ...ICONE_SCHEDA_SPENTA,
  avvisi: ["sconsigliato"],
};

/** Le quattro icone INSIEME al radar disegnato: la colonna piena, per la geometria. */
export const ICONE_SCHEDA_CON_PAGELLA: ExpertScheda = {
  ...ICONE_SCHEDA_PIENA,
  pagella: PAGELLA_COMPLETA,
};
