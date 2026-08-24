// L'IMPALCATURA CHE NON FA MAI ASPETTARE L'ASTA.
//
// Un posto dichiarato dove una risposta LENTA può comparire quando sarà
// pronta — oggi nessuna, domani quella dell'agente di lettura — senza che lo
// schermo la aspetti mai. La regola del contratto è testuale: «si prepara
// prima, non è mai sul percorso critico, e se non è pronta LO DICE invece di
// far aspettare».
//
// TRE STATI VISIBILI, PIÙ IL SILENZIO ONESTO.
//
//   non-richiesta   — nessuno l'ha chiesta (o il posto è stato svuotato);
//   in-preparazione — è stata chiesta e non è ancora arrivata;
//   arrivata        — c'è, ed è del soggetto giusto;
//   non-disponibile — è stata chiesta e NON arriverà (il produttore ha
//                     rifiutato o è scaduto).
//
// Il quarto stato non è un quarto stato «di troppo»: è la forma che prende
// «lo dice invece di far aspettare». Senza di lui un fallimento resterebbe
// «in preparazione» per sempre — uno spinner eterno travestito da attesa —
// oppure tornerebbe a «non richiesta», che è una bugia: la risposta era stata
// chiesta.
//
// NIENTE QUI DENTRO BLOCCA. Nessun `await` sul percorso di rendering, nessuna
// promessa attesa da chi disegna, nessun overlay: il chiamante legge `state()`
// — che è sincrono e istantaneo — e disegna una riga di testo. Il costo di una
// risposta lenta è zero pixel di attesa.
//
// L'ANNULLAMENTO È LA PARTE CHE CONTA. Una risposta giusta sul giocatore
// SBAGLIATO è peggio di nessuna risposta: al tavolo verrebbe letta come se
// riguardasse chi è chiamato adesso. Qui non può succedere, e non per
// convenzione ma per costruzione — ogni richiesta porta una GENERAZIONE, e una
// risoluzione che arriva con una generazione superata viene scartata senza
// toccare lo stato. Cambiare soggetto, richiedere di nuovo o svuotare il posto
// incrementano tutti la generazione, quindi non esiste un modo di cambiare
// soggetto che dimentichi di annullare: è la stessa riga di codice.
//
// NESSUNA RETE, NESSUNA DIPENDENZA, NESSUN MODELLO. Il produttore è un
// parametro: questo modulo non sa da dove venga la risposta e non ne parla mai
// con nessuno. Nei test il produttore è finto; nell'app oggi non ce n'è
// nessuno registrato, e il posto lo dichiara dicendo «non richiesta».
//
// I TIMEOUT SONO DEL PRODUTTORE, NON DEL POSTO. Qui non ci sono timer: un
// produttore che può metterci troppo si dà la propria scadenza e rifiuta
// (l'app lo fa già così altrove — vedi EXPERT_SCHEDE_TIMEOUT_MS in main.ts).
// Un timer in più qui dentro sarebbe una seconda verità sul «troppo tardi».

/** Che cosa il posto ha da mostrare, adesso. */
export type LateAnswerState<T> =
  | { readonly kind: "non-richiesta" }
  | { readonly kind: "in-preparazione"; readonly subjectKey: string }
  | { readonly kind: "arrivata"; readonly subjectKey: string; readonly value: T }
  | { readonly kind: "non-disponibile"; readonly subjectKey: string; readonly reason: string };

/**
 * Il gettone della richiesta (`LateAnswerTicket`), che il produttore riceve
 * come unico parametro. Un produttore corretto lo interroga
 * prima di lavorare a lungo e smette se la risposta non serve più; un
 * produttore che lo ignora non può comunque sporcare lo schermo, perché è il
 * posto a scartare la risoluzione superata.
 */
export interface LateAnswerTicket {
  readonly subjectKey: string;
  isCancelled(): boolean;
}

export type LateAnswerProducer<T> = (ticket: LateAnswerTicket) => Promise<T>;

export interface LateAnswerSlot<T> {
  /** Lettura sincrona: è ciò che il rendering usa, e non attende nulla. */
  state(): LateAnswerState<T>;
  /** Il soggetto attualmente armato, o `null` se il posto è vuoto. */
  subject(): string | null;
  /**
   * Arma il posto su `subjectKey` e avvia il produttore. Ritorna subito: lo
   * stato passa a `in-preparazione` nello stesso istante, mai dopo un giro di
   * rete. Richiamarla annulla la richiesta precedente, anche sullo stesso
   * soggetto (una ri-richiesta esplicita è una richiesta nuova).
   */
  request(subjectKey: string, producer: LateAnswerProducer<T>): void;
  /** Svuota il posto e annulla quel che è in volo. Torna a `non-richiesta`. */
  clear(): void;
  /**
   * Quante risoluzioni superate sono state scartate. Esiste per i test e per
   * la diagnosi: un annullamento che «funziona» perché il produttore non ha
   * mai risposto non è un annullamento verificato.
   */
  droppedCount(): number;
}

export interface LateAnswerSlotOptions {
  /**
   * Chiamato SOLO quando lo stato visibile cambia davvero — mai per una
   * risoluzione scartata. Il chiamante ci attacca il proprio re-render, e una
   * risposta obsoleta non deve nemmeno ridipingere lo schermo.
   */
  readonly onChange?: () => void;
}

export function createLateAnswerSlot<T>(options: LateAnswerSlotOptions = {}): LateAnswerSlot<T> {
  let generation = 0;
  let current: LateAnswerState<T> = { kind: "non-richiesta" };
  let dropped = 0;

  const commit = (next: LateAnswerState<T>): void => {
    current = next;
    options.onChange?.();
  };

  return {
    state: () => current,
    subject: () => (current.kind === "non-richiesta" ? null : current.subjectKey),
    droppedCount: () => dropped,

    request(subjectKey, producer) {
      generation += 1;
      const mine = generation;
      const ticket: LateAnswerTicket = { subjectKey, isCancelled: () => mine !== generation };
      commit({ kind: "in-preparazione", subjectKey });

      // Il produttore viene invocato DENTRO la stessa protezione della sua
      // risoluzione: un produttore che lancia in modo sincrono (un bug suo)
      // deve valere quanto una promessa rifiutata, non far cadere il gesto
      // dell'operatore che l'ha armato.
      let promise: Promise<T>;
      try {
        promise = producer(ticket);
      } catch (err) {
        if (mine === generation) commit({ kind: "non-disponibile", subjectKey, reason: reasonOf(err) });
        else dropped += 1;
        return;
      }

      void promise.then(
        (value) => {
          if (mine !== generation) {
            dropped += 1;
            return;
          }
          commit({ kind: "arrivata", subjectKey, value });
        },
        (err: unknown) => {
          if (mine !== generation) {
            dropped += 1;
            return;
          }
          commit({ kind: "non-disponibile", subjectKey, reason: reasonOf(err) });
        },
      );
    },

    clear() {
      generation += 1;
      if (current.kind === "non-richiesta") return;
      commit({ kind: "non-richiesta" });
    },
  };
}

function reasonOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  return trimmed === "" ? "motivo non dichiarato" : trimmed;
}
