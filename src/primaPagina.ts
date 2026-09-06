// LA PRIMA PAGINA DEL SITO — decisa una volta sola, e nell'ordine giusto.
//
// PERCHÉ È UNA FUNZIONE E NON TRE RIGHE NEL BLOCCO D'AVVIO. Non per eleganza:
// perché le tre righe sbagliate erano indistinguibili da quelle giuste a
// occhio, e nessuna prova poteva accorgersene. La prima pagina dipende da che
// cosa la porta della lega risponde nell'istante del primo disegno, e la porta
// risponde «qui il canale non c'è» finché non è collegata: decidere PRIMA di
// collegarla significava aprire il sito sull'Asta per un dato che non era
// ancora stato chiesto, e poi — quando la lettura arrivava — ridecidere, cioè
// cambiare la pagina sotto gli occhi di chi la stava guardando.
//
// Qui l'ordine è UNO SOLO e sta scritto in tre righe che si leggono insieme:
// si collega la porta, si legge quello che dice adesso, si decide. Chi rimette
// le cose nell'ordine di prima rompe una prova
// (`./primaPagina.test.ts`), non soltanto il prodotto.
//
// E SI DECIDE UNA VOLTA SOLA. Questa funzione si chiama al boot e mai più:
// dopo il primo disegno la schermata la cambia soltanto chi naviga. Ciò che la
// lettura scopre dopo — una rosa vuota, un canale muto, una risposta storta —
// si DICHIARA sulla pagina aperta (`buildFormazioneView`), e non diventa mai
// una navigazione che nessuno ha chiesto.

import {
  decideInitialScreen,
  type InitialScreen,
  type LineupChannelState,
} from "../packages/league-channel-contract/src/index.js";
import { readLineupChannelState } from "./formazioneChannel.js";

export interface PrimaPagina {
  /** Lo stato del canale nell'istante del primo disegno. */
  readonly stato: LineupChannelState;
  /** La schermata che va a schermo, e che non cambierà da sola. */
  readonly schermata: InitialScreen;
}

/**
 * Collega il canale della lega, guarda che cosa risponde ADESSO, e da lì decide
 * la pagina che apre il sito.
 *
 * `collegaCanale` è il gancio che collega la porta (e, nel prodotto, fa partire
 * la richiesta): viene chiamato **prima** della lettura, sempre, ed è l'unica
 * ragione per cui questa funzione esiste invece di due righe in fila.
 */
export function decidiPrimaPagina(collegaCanale: () => void): PrimaPagina {
  collegaCanale();
  const stato = readLineupChannelState();
  return { stato, schermata: decideInitialScreen(stato) };
}
