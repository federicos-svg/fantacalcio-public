// LE SCRITTE DELLA PAGINA FORMAZIONE CHE NASCONO DA UN CODICE.
//
// PERCHÉ ESISTE. Il contratto del canale e il produttore dei vincoli parlano per
// codici: `in_dubbio`, `id_fuori_rosa`, `LOCKED_TOO_MANY`, e i moduli come
// «442». Sono valori giusti per chi li scambia e illeggibili per chi guarda la
// pagina: il trattino basso è una scritta da programma, e «442» si legge
// quattrocentoquarantadue. Questo file è la TRADUZIONE PER LA VISUALIZZAZIONE,
// e nient'altro.
//
// CAMBIA SOLO COME SI MOSTRA. Il dato resta quello del contratto: la
// disponibilità dentro il modello è ancora `in_dubbio`, il modulo scambiato con
// la lega è ancora «442», un codice di violazione è ancora quello che il
// produttore ha emesso. Gli identificativi degli elementi, gli attributi `data-*`
// e le classi (`fz-chip--in_dubbio`) non passano di qui e non cambiano: sono
// ganci per le prove e per il disegno, non testo che si legge.
//
// UNA TABELLA PER CODICE, E UN CODICE CHE LE TABELLE NON CONOSCONO NON SI
// MOSTRA MAI COL TRATTINO BASSO: ricade su `ricadutaLeggibile`, che lo scrive a
// parole sue invece di stamparlo com'è. Così un produttore più nuovo di questa
// pagina non fa tornare crudo a schermo quello che la pagina non sa ancora dire.
//
// QUESTO FILE NON IMPORTA IL CONTRATTO, ed è una scelta e non una dimenticanza:
// la guardia di isolamento di `league-channel-contract` ammette un elenco
// chiuso di file della pagina Formazione, e una traduzione di parole non ha
// bisogno di una porta in più verso il contratto — le tabelle sono letterali, e
// la funzione prende stringhe. L'aderenza ai codici veri la tiene la prova
// (`formazioneScritte.test.ts`), che il contratto lo importa: ogni codice
// dichiarato deve avere la sua voce, ogni voce deve corrispondere a un codice
// dichiarato, e la compilazione stessa rifiuta l'una e l'altra deriva.
//
// NIENTE DI NUOVO PER IL PRODOTTO: le parole sono quelle che la pagina già usa
// («spuntato», «blindata», «fuori rosa») e non aggiungono nessun significato al
// codice che traducono. Dove un messaggio esteso già spiega il caso, la voce è
// solo il titolo corto che gli sta davanti.

/** Come si scrive a schermo la disponibilità che la lega ha dichiarato. */
export const DISPONIBILITA_SCRITTA = {
  disponibile: "disponibile",
  indisponibile: "indisponibile",
  in_dubbio: "in dubbio",
} as const;

/** Le violazioni dell'invio emesse dal contratto, a parole. */
export const VIOLAZIONI_SCRITTE = {
  modulo_sconosciuto: "modulo sconosciuto",
  modulo_non_ammesso: "modulo non ammesso",
  modulo_non_verificabile: "modulo non verificabile",
  portiere_mancante: "portiere mancante",
  portiere_ruolo_errato: "in porta non c'è un portiere",
  titolari_numero_errato: "titolari in numero sbagliato",
  difensori_numero_errato: "difensori in numero sbagliato",
  centrocampisti_numero_errato: "centrocampisti in numero sbagliato",
  attaccanti_numero_errato: "attaccanti in numero sbagliato",
  composizione_non_verificabile: "reparti non verificabili",
  ruolo_non_osservato: "ruolo non letto",
  id_ripetuto: "giocatore ripetuto",
  id_fuori_rosa: "fuori rosa",
  giornata_non_valida: "giornata non valida",
  competizione_incoerente: "competizione incoerente",
  competizione_estesa_non_verificabile: "tutte le competizioni: non verificabile",
  panchina_piu_corta_delle_sostituzioni: "panchina troppo corta",
} as const;

/**
 * I motivi di rifiuto e gli avvertimenti dei vincoli («lo voglio in campo»,
 * modulo bloccato, formazione blindata), a parole.
 */
export const VINCOLI_SCRITTI = {
  LOCKED_PLAYER_UNKNOWN: "giocatore non in rosa",
  LOCKED_PLAYER_DUPLICATED: "giocatore spuntato due volte",
  LOCKED_MODULE_NOT_ALLOWED: "modulo bloccato non ammesso",
  LOCKED_TOO_MANY: "troppi giocatori spuntati",
  LOCKED_ROLE_OVERFLOW: "troppi giocatori dello stesso ruolo",
  LOCKED_MODULE_INCOMPATIBLE: "modulo non compatibile con le spunte",
  LOCKED_ELEVEN_NOT_A_MODULE: "gli undici non compongono un modulo",
  LOCKED_LINEUP_MISSING: "nessuna formazione da blindare",
  LOCKED_LINEUP_ILLEGAL: "formazione blindata non regolare",
  LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS: "formazione blindata contro i vincoli",
  LOCKED_PLAYER_NEVER_PLAYS: "giocatore che non gioca",
} as const;

/**
 * Un codice che nessuna tabella conosce: si scrive a parole sue, minuscolo e
 * senza trattini bassi. Non è una traduzione e non finge di esserlo — è il modo
 * di non stampare mai una scritta da programma anche davanti a un codice nuovo.
 */
export function ricadutaLeggibile(codice: string): string {
  return codice.replace(/_+/g, " ").trim().toLowerCase();
}

/** La disponibilità come si legge: «in dubbio», non `in_dubbio`. */
export function disponibilitaScritta(disponibilita: string): string {
  return Object.hasOwn(DISPONIBILITA_SCRITTA, disponibilita)
    ? DISPONIBILITA_SCRITTA[disponibilita as keyof typeof DISPONIBILITA_SCRITTA]
    : ricadutaLeggibile(disponibilita);
}

/**
 * Un codice di violazione o di vincolo come si legge. Le due tabelle non hanno
 * chiavi in comune (minuscolo con trattino basso da una parte, maiuscolo
 * dall'altra), quindi un solo punto d'ingresso basta a chi mostra l'elenco.
 */
export function codiceScritto(codice: string): string {
  if (Object.hasOwn(VIOLAZIONI_SCRITTE, codice)) {
    return VIOLAZIONI_SCRITTE[codice as keyof typeof VIOLAZIONI_SCRITTE];
  }
  if (Object.hasOwn(VINCOLI_SCRITTI, codice)) {
    return VINCOLI_SCRITTI[codice as keyof typeof VINCOLI_SCRITTI];
  }
  return ricadutaLeggibile(codice);
}

/**
 * I sette moduli di §9, scritti qui in lettere perché questo file non importa il
 * contratto (vedi sopra). Sono gli stessi di `MODULES` in
 * `packages/league-gameweek`: `formazioneScritte.test.ts` li confronta con
 * quelli veri e fallisce se uno dei due elenchi cambia da solo.
 */
const MODULI_DI_PAGINA: readonly string[] = ["541", "451", "532", "442", "352", "433", "343"];

/**
 * Un modulo come si legge: «4-4-2», non «442». Il valore che si scambia con la
 * lega e che sta nel modello resta «442»; questa funzione si usa solo nel punto
 * in cui il modulo diventa testo per chi guarda.
 *
 * SOLO I SETTE MODULI DI §9 PRENDONO I TRATTINI, come in `moduleLabel` del
 * contratto (`submissionLegality.ts`): un valore che non è uno dei sette passa
 * com'è, ed è proprio ciò che una violazione («modulo_non_ammesso») sta
 * denunciando — «999» scritto «9-9-9» sembrerebbe un modulo. Prima bastava
 * «tre cifre qualunque», che dava «9-9-9»: mostrare quello che c'è è meglio che
 * inventare un trattino dove non c'è un modulo.
 */
export function moduloScritto(modulo: string): string {
  return MODULI_DI_PAGINA.includes(modulo) ? modulo.split("").join("-") : modulo;
}
