// LE PAROLE DEL VOCABOLARIO DELLA SCHEDA — un posto solo, nessuna copia.
//
// Stavano in src/ui/expertInsight.ts e sono uscite di lì quando le icone
// accanto al radar (src/ui/schedaIcone.ts) hanno avuto bisogno delle stesse
// parole. Le due strade possibili erano riscriverle — cioè avere due
// dizionari che possono divergere in silenzio — oppure un anello di import
// fra i due moduli. Questo file è la terza: le parole stanno sotto entrambi,
// e nessuno dei due dipende dall'altro.
//
// `expertInsight.ts` le RIESPORTA, quindi ogni import esistente (main.ts,
// schedaCompiler.ts, i test) continua a leggerle da dove le leggeva.
//
// Sono ETICHETTE UTENTE, non il vocabolario: il vocabolario — cioè i valori
// ammessi — vive nel contratto (src/expertScheda.ts, copia fedele di
// packages/gruppo-esperti/src/signals.ts, privato).

import type { Avviso, ListaEsperti, Piazzati, Rigori, Titolarita } from "../expertScheda.js";

/**
 * L'INTESTAZIONE della pastiglia categorica, come una COSTANTE e non come un
 * letterale dentro il template.
 *
 * Serve a un test, e il test è il motivo per cui questa costante esiste: la
 * pagella del Gruppo Esperti porta un asse che la fonte chiama con la stessa
 * parola («Titolarità 9/10») ma che è un VOTO, non l'affermazione categorica
 * che questa pastiglia mostra. `src/pagellaEsperti.test.ts` §"collisione"
 * confronta questa scritta con le etichette della pagella dopo `foldLabel` e
 * pretende che restino diverse. Con un letterale nel template il test avrebbe
 * confrontato la propria copia con sé stessa, cioè niente.
 */
export const TITOLARITA_HEAD = "TITOLARITÀ";

export const TITOLARITA_LABELS: Readonly<Record<Titolarita, string>> = {
  riserva: "riserva",
  ballottaggio: "ballottaggio",
  titolare: "titolare",
};

export const RIGORI_LABELS: Readonly<Record<Rigori, string>> = {
  designato: "designato",
  possibile: "possibile",
};

export const PIAZZATI_LABELS: Readonly<Record<Piazzati, string>> = {
  punizioni: "punizioni",
  angoli: "angoli",
};

/**
 * IL RANGO IN PAROLE — «1°», «2°», «3°» — scritto UNA volta per tutte le
 * superfici che lo mostrano: la colonna del listone, l'icona accanto al radar,
 * la pastiglia del riquadro, il riassunto del compilatore.
 *
 * Una sola forma, e non quattro: il rango è lo stesso fatto ovunque compaia, e
 * quattro modi di scriverlo sarebbero quattro cose che a colpo d'occhio non si
 * riconoscono come la stessa. L'ordinale con `°` è il modo in cui in italiano
 * si scrive un posto in una fila; «rango 2» o «#2» andrebbero letti, questo si
 * riconosce.
 */
export const RANGO_SUFFIX = "°";

/**
 * LA PAROLA CHE QUALIFICA UN RANGO DI PIAZZATI, uguale per punizioni e angoli.
 *
 * Serve perché un rango da solo non è una frase: la cella «1°» sotto
 * l'intestazione «Angoli» si legge, ma la stessa cella senza rango dovrebbe
 * restare vuota — e vuota è indistinguibile da `n/d`, che è invece un fatto
 * diverso («la scheda non lo dichiara affatto»). Con la parola le tre celle
 * possibili sono tre: «1° battitore», «battitore» (la specialità c'è, l'ordine
 * no), `n/d`.
 *
 * È la stessa parola sotto l'icona e nella colonna: la specialità è già scritta
 * nell'intestazione della colonna e nel nome dell'icona, e ripeterla nel valore
 * la direbbe due volte in una cella larga un pollice.
 */
export const PIAZZATI_BATTITORE = "battitore";

/** `2` -> `«2°»`; `null`/assente -> stringa vuota, MAI uno zero e mai un
 *  trattino: chi rende decide che parola usare per l'assenza (nel listone è
 *  `n/d`), e questa funzione non ne inventa una propria. */
export function rangoText(rango: number | null | undefined): string {
  return rango === null || rango === undefined ? "" : `${rango}${RANGO_SUFFIX}`;
}

/**
 * `«designato»` + rango `1` -> `«1° designato»`; senza rango resta
 * `«designato»`.
 *
 * IL NUMERO STA DAVANTI, e non in coda fra parentesi: in una cella di listone
 * larga un pollice la prima cosa che l'occhio incontra deve essere il posto
 * nella fila — è ciò che distingue il primo rigorista dal terzo — e in coda
 * finirebbe a capo, staccato dalla parola che qualifica. Come effetto secondario
 * l'ordinamento alfabetico della colonna diventa l'ordine della fila: `1°…`
 * prima di `2°…`, e le celle senza rango dopo tutte quelle che ce l'hanno.
 */
export function conRango(testo: string, rango: number | null | undefined): string {
  const r = rangoText(rango);
  return r === "" ? testo : `${r} ${testo}`;
}

export const AVVISO_LABELS: Readonly<Record<Avviso, string>> = {
  sconsigliato: "sconsigliato",
  rischio_fisico: "rischio fisico",
  provvisorio: "provvisorio",
  mercato: "mercato",
};

/**
 * LE TRE LISTE EDITORIALI, in parole.
 *
 * Stavano in src/ui/schedaIcone.ts, cioè sotto la quarta icona del riquadro.
 * Sono scese qui per la ragione per cui questo file esiste: adesso le legge
 * anche il MODULO che compila le schede (src/schedaCompiler.ts), e quello è un
 * layer puro — non può dipendere da schedaIcone.ts, che disegna HTML e importa
 * `escHtml`. Le due strade alternative erano una seconda copia del dizionario
 * (che diverge in silenzio) o del DOM dentro un layer che non ne ha: nessuna
 * delle due. `schedaIcone.ts` le RIESPORTA, quindi ogni import esistente resta
 * dov'era.
 */
export const LISTA_ESPERTI_LABELS: Readonly<Record<ListaEsperti, string>> = {
  consigliato: "consigliato",
  possibile_sorpresa: "possibile sorpresa",
  sconsigliato: "sconsigliato",
};
