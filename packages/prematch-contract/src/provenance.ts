// LA PROVENIENZA — fonte, momento dell'osservazione, giornata.
//
// Non è un abbellimento ed è la ragione per cui questo pacchetto esiste prima
// dei tipi che descrivono le formazioni. Il record di fonte lo scrive come
// vincolo di forma sul dato: **ogni osservazione pre-partita porta con sé,
// sempre, la fonte che l'ha detta, il momento in cui è stata letta e la
// giornata a cui si riferisce**. Un'osservazione senza fonte non si attribuisce,
// una senza momento non si ordina rispetto alla notizia che la smentisce, una
// senza giornata non si confronta con niente. Per questo la provenienza è
// obbligatoria in ogni struttura di questo contratto, e non è mai un campo
// facoltativo aggiunto in fondo.
//
// «MOMENTO» È QUANDO ABBIAMO LETTO, non quando la fonte ha scritto. Sono due
// istanti diversi e il secondo, quando c'è, è un dato della pagina come gli
// altri; quello che conta per ordinare le osservazioni è il primo.
//
// LA GIORNATA NON SI RICAVA DALL'INDIRIZZO. È la regola che è costata di più
// impararla: un indirizzo che contiene un numero di giornata dice che cosa
// abbiamo chiesto, non che cosa la pagina dichiara. Le due cose coincidono
// quasi sempre e il «quasi» è tutto il problema — una pagina spostata, un
// rinvio, un indirizzo che risponde con altro. Quindi la giornata porta con sé
// **da dove viene**, e chi legge può decidere: `declared-by-source` si può
// usare per attribuire l'osservazione, `requested-by-caller` dice soltanto che
// cosa avevamo chiesto, `unobserved` dice che non lo sappiamo.
//
// L'ETICHETTA DELLA FONTE NON È UN INDIRIZZO. Questo pacchetto è agnostico
// dalla fonte: nessun host, nessun percorso, nessun selettore. La guardia qui
// sotto non è simbolica — impedisce che un indirizzo entri nel core pubblico
// travestito da dato, che è il modo in cui un confine si perde davvero.

import {
  carryFailure,
  isRead,
  outOfContract,
  read,
  readInstant,
  readLabel,
  readRecord,
  readWholeNumber,
  shapeNotRecognised,
  type ReadOutcome,
} from "./readOutcome.js";

/** Da dove viene il numero di giornata di un'osservazione. */
export type MatchdayReference =
  | { readonly origin: "declared-by-source"; readonly number: number }
  | { readonly origin: "requested-by-caller"; readonly number: number }
  | { readonly origin: "unobserved" };

export function matchdayDeclaredBySource(number: number): MatchdayReference {
  return { origin: "declared-by-source", number };
}

export function matchdayRequestedByCaller(number: number): MatchdayReference {
  return { origin: "requested-by-caller", number };
}

export function matchdayUnobserved(): MatchdayReference {
  return { origin: "unobserved" };
}

/**
 * Il numero di giornata **solo se la fonte lo dichiara**; `null` altrimenti.
 *
 * È la funzione che rende scomodo barare: chi vuole attribuire un'osservazione
 * a una giornata deve passare di qui, e qui una giornata che viene
 * dall'indirizzo non esiste.
 */
export function matchdayIfDeclared(reference: MatchdayReference): number | null {
  return reference.origin === "declared-by-source" ? reference.number : null;
}

/**
 * La provenienza di un'osservazione.
 *
 * `source` e `page` sono ETICHETTE — «la testata», «la pagina della partita» —
 * scelte da chi legge e stabili nel tempo, perché la misura di affidabilità si
 * aggrega per fonte e un'etichetta che cambia ogni settimana spezza la serie.
 * Non sono indirizzi, e la lettura rifiuta quelli che lo sembrano.
 */
export interface Provenance {
  readonly source: string;
  readonly page: string;
  /** Quando ABBIAMO LETTO, ISO-8601 con fuso esplicito. */
  readonly observedAt: string;
  readonly matchday: MatchdayReference;
}

const ADDRESS_SHAPED = /(:\/\/|^www\.|\/|\.[a-z]{2,6}(\b|$))/i;

/**
 * Un'etichetta che somiglia a un indirizzo — schema, `www.`, una barra, un
 * dominio di primo livello — non entra. La guardia è volutamente severa:
 * respinge anche qualche etichetta innocente («Sky.it»), e va bene così, perché
 * il costo di riscriverla è una parola e il costo di lasciar passare un
 * indirizzo è un confine.
 */
export function looksLikeAddress(label: string): boolean {
  return ADDRESS_SHAPED.test(label);
}

function readSourceLabel(candidate: unknown, at: readonly string[]): ReadOutcome<string> {
  const label = readLabel(candidate, at);
  if (!isRead(label)) return label;
  if (looksLikeAddress(label.value)) {
    return outOfContract<string>(
      "l'etichetta somiglia a un indirizzo: questo contratto non conosce host né percorsi",
      at,
    );
  }
  return label;
}

export function readMatchdayReference(candidate: unknown, at: readonly string[]): ReadOutcome<MatchdayReference> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);
  const origin = record.value["origin"];
  if (origin === "unobserved") return read(matchdayUnobserved());
  if (origin !== "declared-by-source" && origin !== "requested-by-caller") {
    return shapeNotRecognised<MatchdayReference>(
      "atteso origin fra declared-by-source, requested-by-caller e unobserved",
      [...at, "origin"],
    );
  }
  const number = readWholeNumber(record.value["number"], [...at, "number"]);
  if (!isRead(number)) return carryFailure(number);
  if (number.value < 1) {
    return outOfContract<MatchdayReference>("una giornata parte da 1", [...at, "number"]);
  }
  return read(
    origin === "declared-by-source"
      ? matchdayDeclaredBySource(number.value)
      : matchdayRequestedByCaller(number.value),
  );
}

export function readProvenance(candidate: unknown, at: readonly string[] = ["provenance"]): ReadOutcome<Provenance> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const source = readSourceLabel(record.value["source"], [...at, "source"]);
  if (!isRead(source)) return carryFailure(source);

  const page = readSourceLabel(record.value["page"], [...at, "page"]);
  if (!isRead(page)) return carryFailure(page);

  const observedAt = readInstant(record.value["observedAt"], [...at, "observedAt"]);
  if (!isRead(observedAt)) return carryFailure(observedAt);

  const matchday = readMatchdayReference(record.value["matchday"], [...at, "matchday"]);
  if (!isRead(matchday)) return carryFailure(matchday);

  return read({
    source: source.value,
    page: page.value,
    observedAt: observedAt.value,
    matchday: matchday.value,
  });
}
