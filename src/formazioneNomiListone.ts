// I NOMI CHE L'ANAGRAFICA INTERNA CONOSCE, per identificativo di giocatore.
//
// PERCHÉ ESISTE. La piattaforma della lega dichiara gli identificativi dei
// giocatori e **non** i loro nomi: misurato, e registrato come tale nel
// repository privato — nessuna chiave dell'osservazione è stata misurata come
// «nome del giocatore». Finché è così, la pagina Formazione avrebbe un numero
// al posto del nome su ogni gettone. L'anagrafica che il prodotto già carica
// per l'asta conosce quei nomi, ed è indicizzata sulla STESSA chiave.
//
// CHE LA CHIAVE SIA LA STESSA È MISURATO, NON SUPPOSTO — ed è il tipo di
// affermazione che in questo progetto è già costata quattro volte in un giorno
// quando è stata dedotta invece che verificata. Su una formazione reale di 28
// giocatori: **24 identificativi su 28** ritrovati nell'anagrafica, e sui 24
// ritrovati **24 accordi di ruolo su 24**. I 4 assenti non sono una chiave
// diversa — due stanno SOPRA l'identificativo più alto che quel file contiene,
// gli altri due sono stretti fra identificativi presenti: è la copertura di
// un'anagrafica di una stagione fa, che non ha mai avuto occasione di
// contenerli. Se fossero due spazi di identificativi diversi il ritrovamento
// atteso sarebbe intorno al 7%, non all'86%, e 24 accordi di ruolo su 24 per
// caso hanno probabilità dell'ordine di 10⁻¹⁵.
//
// IL NOME CHE ESCE DA QUI NON È «IL NOME CHE LA LEGA CI HA DATO», e chi lo
// mostra deve dirlo. Questo modulo produce nomi RICONCILIATI: la loro
// provenienza viaggia con loro fino allo schermo (`FormazionePlayerRow.
// nameSource`), e non si fonde mai con quella della lega.
//
// E DA QUI NON ESCE ALTRO CHE IL NOME. Non il ruolo — sulla formazione comanda
// la lega, e due giocatori di questa lega sono `T;A` e `W;A` nell'anagrafica
// mentre la lega li schiera attaccanti: un ruolo preso di qui direbbe
// «centrocampista» di chi gioca davanti. Non la quotazione, non l'indice,
// niente: un solo campo, e il resto della riga di anagrafica resta dov'è.

import type { ListonePlayer } from "./ui/listone.js";

/**
 * La chiave con cui l'anagrafica porta l'identificativo di piattaforma.
 *
 * Non è un campo «core» della riga di listone, quindi il parser lo conserva
 * fra gli `extra` senza interpretarlo — ed è giusto così: per il listone è un
 * numero come un altro, e solo qui diventa una chiave di identità.
 */
export const LISTONE_CHIAVE_IDENTIFICATIVO = "Id";

/**
 * Costruisce la mappa identificativo -> nome a partire dall'anagrafica.
 *
 * FAIL-CLOSED SULLE AMBIGUITÀ, e non per prudenza generica: qui un errore non
 * produce una pagina rotta ma una pagina **sbagliata e credibile**, cioè un
 * nome altrui sul gettone di un giocatore. Quindi:
 *
 * - una riga senza identificativo utilizzabile non entra: non si indovina;
 * - una riga senza nome non entra: un nome vuoto non è un nome;
 * - un identificativo che compare **due volte con nomi diversi** non entra
 *   affatto, e ne viene tolta anche la prima occorrenza. «L'ultimo vince»
 *   sceglierebbe in silenzio fra due candidati, e la pagina mostrerebbe un
 *   nome preciso senza che nessuno sappia perché quello. Meglio nessun nome:
 *   il gettone ha già il modo di dire che il nome non lo sa.
 *
 * Un identificativo ripetuto con lo **stesso** nome non è un'ambiguità: è la
 * stessa persona due volte, e resta.
 */
export function nomiPerIdentificativo(
  anagrafica: readonly ListonePlayer[],
): ReadonlyMap<string, string> {
  const nomi = new Map<string, string>();
  const ambigui = new Set<string>();

  for (const riga of anagrafica) {
    const grezzo = riga.extra?.[LISTONE_CHIAVE_IDENTIFICATIVO];
    // Numero o stringa: l'anagrafica lo porta come numero, ma la chiave con cui
    // la lega identifica i giocatori è una stringa opaca, e il confronto va
    // fatto in una scala sola. La conversione avviene QUI, una volta, invece
    // che a ogni confronto — due conversioni in due punti sono due occasioni
    // di divergere.
    if (typeof grezzo !== "number" && typeof grezzo !== "string") continue;
    const identificativo = String(grezzo).trim();
    if (identificativo.length === 0) continue;

    const nome = riga.name.trim();
    if (nome.length === 0) continue;

    const gia = nomi.get(identificativo);
    if (gia !== undefined && gia !== nome) {
      ambigui.add(identificativo);
      continue;
    }
    nomi.set(identificativo, nome);
  }

  for (const identificativo of ambigui) nomi.delete(identificativo);
  return nomi;
}
