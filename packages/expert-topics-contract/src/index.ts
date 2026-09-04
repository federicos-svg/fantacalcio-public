// CONTRATTO DEI TOPIC DI PARTITA — superficie pubblica.
//
// Tipi, criterio di riconoscimento, parser strutturale e legame topic→partita:
// tutto **puro**, tutto **agnostico dalla fonte**. Nessuna rete, nessun host,
// nessun indirizzo, nessuna credenziale, nessun orologio, nessun numero a caso,
// e nessun contenuto editoriale — le fixture delle prove sono **sintetiche**.
//
// Il layer privato tiene ciò che questo pacchetto non deve sapere: come si
// raggiunge la pagina, con quali limiti, e dove si depositano i suoi byte.
export * from "./types.js";
export * from "./title.js";
export * from "./matchLink.js";
export * from "./topicPage.js";
export * from "./run.js";
