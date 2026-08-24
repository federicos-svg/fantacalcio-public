// IL POSTO DELLA RISPOSTA LENTA — le parole dei tre stati (più il silenzio
// onesto), pure e testabili senza DOM.
//
// La meccanica sta in src/lateAnswer.ts; qui c'è solo che cosa si legge. La
// regola di scrittura è una sola e vale per tutte e quattro le righe: dicono
// SEMPRE a che punto è la risposta, e non promettono mai contenuto che non
// c'è. Nessuna di queste frasi è un suggerimento, un prezzo o una direttiva:
// il posto è un contenitore, e finché è vuoto lo dichiara.

import type { LateAnswerState } from "../lateAnswer.js";
import { escHtml } from "./theme.js";

export const LATE_ANSWER_TITLE = "APPROFONDIMENTO SUL CHIAMATO";

/**
 * La nota fissa del riquadro. Esiste perché un riquadro che dice «non
 * richiesta» senza spiegare che cos'è sembra un pezzo rotto invece di un posto
 * predisposto.
 */
export const LATE_ANSWER_NOTE =
  "Posto predisposto per una risposta che si prepara mentre l'asta va avanti: non è mai sul percorso critico " +
  "e non blocca mai lo schermo. Nessuna fonte è collegata in questa versione.";

/** Che cosa si legge, stato per stato. Una riga sola, sempre. */
export function lateAnswerStatusText<T>(state: LateAnswerState<T>, subjectLabel: string): string {
  switch (state.kind) {
    case "non-richiesta":
      return "Non richiesta.";
    case "in-preparazione":
      return `In preparazione per ${subjectLabel}…`;
    case "arrivata":
      return `Arrivata per ${subjectLabel}.`;
    case "non-disponibile":
      // Il motivo si dice, non si nasconde: «non disponibile» senza perché è
      // indistinguibile da «non l'ho chiesta».
      return `Non disponibile per ${subjectLabel}: ${state.reason}.`;
  }
}

/**
 * Il valore dello stato in forma di attributo, per il CSS e per i test. È
 * letteralmente `state.kind`: un secondo vocabolario di nomi di stato
 * divergerebbe dal primo alla prima aggiunta.
 */
export function lateAnswerStateAttr<T>(state: LateAnswerState<T>): string {
  return state.kind;
}

/**
 * Il corpo: il testo della risposta quando è arrivata, e nient'altro in tutti
 * gli altri stati — mai un segnaposto grigio a forma di contenuto, che a
 * colpo d'occhio si legge come contenuto.
 */
export function lateAnswerBodyHtml(state: LateAnswerState<string>): string {
  if (state.kind !== "arrivata") return "";
  return `<p class="late-answer__text">${escHtml(state.value)}</p>`;
}
