// L'ESITO DI UNA LETTURA — e perché non è mai un valore nudo.
//
// Ogni funzione di questo pacchetto che trasforma un candidato grezzo in un
// tipo del contratto restituisce un ESITO, non il dato. La ragione è la regola
// che questo pacchetto esiste per far rispettare: **non dedurre**. Una forma
// che non è quella attesa non si aggiusta, non si completa e non si tira via in
// silenzio: si dichiara, e il conto si ferma lì.
//
// Tre stati, e la differenza fra i due modi di fallire conta:
//
//   * `read` — il candidato è stato letto per intero e rispetta il contratto;
//   * `shape-not-recognised` — la STRUTTURA non è quella attesa: un campo che
//     doveva esserci non c'è, un elenco è un oggetto, un numero è una stringa.
//     È lo stato che i record di fonte chiamano «struttura di pagina non
//     riconosciuta», ed è una stop condition;
//   * `out-of-contract` — la struttura c'è, ma il CONTENUTO viola una regola
//     scritta: un'etichetta di fonte che è in realtà un indirizzo, un campo
//     lungo come una frase (cioè testo editoriale travestito da dato), una
//     pagina di probabili che dichiara formazioni effettive.
//
// Tenere separati i due fallimenti non è pedanteria: il primo dice «la fonte è
// cambiata, vai a guardarla», il secondo dice «chi ha scritto il lettore ha
// passato qualcosa che non deve entrare». Sono due lavori diversi per due
// persone diverse, e un solo stato d'errore li avrebbe confusi per sempre.
//
// `at` è il percorso dentro il candidato — `["home", "starters", "3"]` — perché
// un rifiuto senza indirizzo costringe a rileggere tutto per trovare il punto.

/** L'esito di una lettura: il dato, oppure il motivo per cui non c'è. */
export type ReadOutcome<T> =
  | { readonly status: "read"; readonly value: T }
  | { readonly status: "shape-not-recognised"; readonly reason: string; readonly at: readonly string[] }
  | { readonly status: "out-of-contract"; readonly reason: string; readonly at: readonly string[] };

export function read<T>(value: T): ReadOutcome<T> {
  return { status: "read", value };
}

export function shapeNotRecognised<T>(reason: string, at: readonly string[]): ReadOutcome<T> {
  return { status: "shape-not-recognised", reason, at };
}

export function outOfContract<T>(reason: string, at: readonly string[]): ReadOutcome<T> {
  return { status: "out-of-contract", reason, at };
}

/** Vero solo sullo stato `read`: nessun altro stato porta un valore. */
export function isRead<T>(outcome: ReadOutcome<T>): outcome is { readonly status: "read"; readonly value: T } {
  return outcome.status === "read";
}

/**
 * Riporta un fallimento su un altro tipo, conservandone motivo e percorso.
 *
 * Serve a chi legge una struttura composta: il fallimento di un pezzo è il
 * fallimento dell'insieme, e deve arrivare a chi chiama **con la ragione
 * originale**, non riscritto in un generico «non valido».
 */
export function carryFailure<A, B>(
  failure: Exclude<ReadOutcome<A>, { status: "read" }>,
): ReadOutcome<B> {
  return failure.status === "shape-not-recognised"
    ? shapeNotRecognised<B>(failure.reason, failure.at)
    : outOfContract<B>(failure.reason, failure.at);
}

/**
 * LA LUNGHEZZA MASSIMA DI UN'ETICHETTA — la guardia contro il testo editoriale.
 *
 * I record di fonte vietano senza eccezioni la ripubblicazione del testo
 * editoriale: si estraggono fatti — un nome, una squadra, un modulo — mai
 * prosa. Questo contratto **non ha un solo campo destinato a contenere una
 * frase**, e questa costante è ciò che rende il divieto verificabile invece che
 * dichiarato: qualunque stringa più lunga di così è respinta come
 * `out-of-contract`, perché a quella lunghezza non è più un'etichetta.
 *
 * 120 caratteri è una scelta tecnica dell'Executive, dichiarata come tale e
 * contestabile: sta larga sul nome più lungo che una fonte italiana scrive per
 * un giocatore o una squadra, e stretta su qualunque periodo di prosa.
 */
export const MAX_LABEL_LENGTH = 120;

/**
 * Legge un'etichetta: stringa, non vuota, senza a capo, non lunga come una
 * frase. Gli a capo sono esclusi perché una stringa multiriga è, di fatto, già
 * un pezzo di articolo.
 */
export function readLabel(candidate: unknown, at: readonly string[]): ReadOutcome<string> {
  if (typeof candidate !== "string") {
    return shapeNotRecognised<string>("atteso un testo breve", at);
  }
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return shapeNotRecognised<string>("etichetta vuota", at);
  }
  if (/[\r\n]/.test(trimmed)) {
    return outOfContract<string>("un'etichetta su più righe non è un dato, è testo", at);
  }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    return outOfContract<string>(
      `etichetta di ${String(trimmed.length)} caratteri: oltre ${String(MAX_LABEL_LENGTH)} non è un'etichetta ma testo editoriale`,
      at,
    );
  }
  return read(trimmed);
}

/** Legge un intero non negativo. Niente conversioni da stringa: una stringa qui è una struttura diversa da quella attesa. */
export function readWholeNumber(candidate: unknown, at: readonly string[]): ReadOutcome<number> {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
    return shapeNotRecognised<number>("atteso un numero intero", at);
  }
  if (candidate < 0) {
    return outOfContract<number>("atteso un numero non negativo", at);
  }
  return read(candidate);
}

/** Legge un intero con segno (la differenza reti ne ha bisogno). */
export function readInteger(candidate: unknown, at: readonly string[]): ReadOutcome<number> {
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
    return shapeNotRecognised<number>("atteso un numero intero", at);
  }
  return read(candidate);
}

/**
 * Legge un istante come stringa ISO-8601 **con fuso esplicito**.
 *
 * Il fuso non è un dettaglio: il requisito di misurabilità distingue ciò che
 * una fonte ha scritto prima del calcio d'inizio da ciò che ha scritto dopo, e
 * due istanti senza fuso non si possono ordinare fra loro senza supporre in
 * quale ora del mondo siano stati presi. Supporre, qui, è esattamente ciò che
 * non si fa.
 */
export function readInstant(candidate: unknown, at: readonly string[]): ReadOutcome<string> {
  if (typeof candidate !== "string") {
    return shapeNotRecognised<string>("atteso un istante ISO-8601", at);
  }
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
  if (!withZone.test(candidate)) {
    return outOfContract<string>("istante senza fuso esplicito, o non ISO-8601", at);
  }
  if (Number.isNaN(Date.parse(candidate))) {
    return outOfContract<string>("istante ISO-8601 non interpretabile", at);
  }
  return read(candidate);
}

/** Legge un oggetto semplice: né `null`, né un elenco, né un altro tipo. */
export function readRecord(candidate: unknown, at: readonly string[]): ReadOutcome<Record<string, unknown>> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return shapeNotRecognised<Record<string, unknown>>("atteso un oggetto", at);
  }
  return read(candidate as Record<string, unknown>);
}

/**
 * Legge un elenco, elemento per elemento, fermandosi al primo che non passa.
 *
 * Fermarsi, e non saltare l'elemento cattivo, è deliberato: un elenco di
 * titolari a cui manca un nome perché il lettore lo ha scartato in silenzio è
 * peggio di nessun elenco, perché ha l'aria di essere completo.
 */
export function readList<T>(
  candidate: unknown,
  at: readonly string[],
  readItem: (item: unknown, itemAt: readonly string[]) => ReadOutcome<T>,
): ReadOutcome<readonly T[]> {
  if (!Array.isArray(candidate)) {
    return shapeNotRecognised<readonly T[]>("atteso un elenco", at);
  }
  const out: T[] = [];
  for (let i = 0; i < candidate.length; i += 1) {
    const outcome = readItem(candidate[i], [...at, String(i)]);
    if (!isRead(outcome)) return carryFailure(outcome);
    out.push(outcome.value);
  }
  return read(out as readonly T[]);
}
