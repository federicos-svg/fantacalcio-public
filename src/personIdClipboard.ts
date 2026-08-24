// L'IDENTIFICATIVO DI UNA PERSONA, NEGLI APPUNTI — e che cosa dire quando non
// ci arriva.
//
// PERCHÉ ESISTE. Lo storico d'asta è chiavato su `personId` (packages/
// opponent-profiles/src/types.ts: il precedente segue la persona, non il posto
// a tavola, perché i posti cambiano mano fra una stagione e l'altra). Quei
// valori li genera l'app quando un partecipante viene creato, e fino a qui non
// c'era nessun posto in cui leggerli: per scrivere il file dell'archivio Pico
// avrebbe dovuto aprire gli strumenti da sviluppatore del browser e pescarli
// da `localStorage` — cioè fare a mano la cosa che quella schermata esiste per
// evitargli. Una capacità che c'è e che nessuno può usare non è una capacità.
//
// PERCHÉ UN GESTO E NON UNA TRASCRIZIONE. Un `personId` è `person:` più un
// UUID: quarantacinque caratteri, otto volte. Trascriverli a occhio è il modo
// più affidabile di produrre un file che verrà rifiutato per un carattere — e
// il rifiuto, giustamente, non dirà quale (src/opponentArchive.ts, regola sui
// messaggi d'errore).
//
// PERCHÉ LA COPIA PUÒ FALLIRE, E PERCHÉ CONTA. `navigator.clipboard` esiste
// solo in contesto sicuro e può essere negata dal browser; `execCommand("copy")`
// è il ripiego storico e può a sua volta rifiutare. Un pulsante che dicesse
// «Copiato» senza aver copiato è peggio di uno che non copia: il gesto non si
// ripete, il file si scrive con una stringa vuota incollata dentro, e l'errore
// si scopre alla riga sbagliata. Da qui tre esiti distinti e tre frasi diverse,
// mai una sola frase ottimista.
//
// Le due capacità del browser arrivano INIETTATE e non lette qui dentro: così
// questo file è interamente verificabile in Node, senza DOM e senza appunti
// veri, e la parte non verificabile si riduce a due righe in main.ts.

/** Le due strade verso gli appunti, come il chiamante riesce a offrirle. */
export interface ClipboardPorts {
  /** `navigator.clipboard.writeText`, o `null` quando l'API non è disponibile. */
  readonly writeText: ((text: string) => Promise<void>) | null;
  /**
   * Ripiego: seleziona a schermo il testo e chiede al browser di copiarlo.
   * Rende `true` se la copia è riuscita, `false` se è riuscita solo la
   * selezione. `null` quando non c'è niente da selezionare.
   */
  readonly selectAndCopy: (() => boolean) | null;
}

/**
 * Che cosa è successo davvero.
 *
 * `selection` NON è un fallimento e non è un successo: il testo è selezionato
 * a schermo e un `Ctrl+C` lo porta negli appunti. È lo stato che merita una
 * frase propria, perché l'azione che resta da fare è diversa nei due casi.
 */
export type CopyOutcome = "clipboard" | "selection" | "failed";

/**
 * Prova le strade in ordine e riporta la prima che regge.
 *
 * L'ordine non è arbitrario: `writeText` non tocca la selezione dell'utente,
 * mentre il ripiego gliela sovrascrive. Si disturba lo schermo solo quando la
 * strada pulita non c'è o ha rifiutato.
 */
export async function attemptCopy(text: string, ports: ClipboardPorts): Promise<CopyOutcome> {
  if (ports.writeText !== null) {
    try {
      await ports.writeText(text);
      return "clipboard";
    } catch {
      // Negata o non disponibile in questo contesto: si prova il ripiego.
    }
  }
  if (ports.selectAndCopy !== null) {
    let copied = false;
    try {
      copied = ports.selectAndCopy();
    } catch {
      copied = false;
    }
    return copied ? "clipboard" : "selection";
  }
  return "failed";
}

/**
 * La frase che la schermata mostra dopo il gesto.
 *
 * Nomina SEMPRE la persona: la conferma sta sotto un elenco di partecipanti e
 * i pulsanti sono uguali fra loro, quindi un «Copiato» anonimo dopo due clic
 * ravvicinati non direbbe quale dei due ha funzionato.
 */
export function copyMessage(personName: string, outcome: CopyOutcome): string {
  switch (outcome) {
    case "clipboard":
      return `Identificativo di ${personName} copiato negli appunti.`;
    case "selection":
      return `Appunti non disponibili: l'identificativo di ${personName} è selezionato a schermo, premi Ctrl+C (⌘C) per copiarlo.`;
    case "failed":
      return `Copia non riuscita: seleziona a mano l'identificativo di ${personName} e copialo.`;
  }
}

/** `true` solo quando il testo è davvero negli appunti. */
export function copySucceeded(outcome: CopyOutcome): boolean {
  return outcome === "clipboard";
}
