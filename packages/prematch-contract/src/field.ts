// IL CAMPO CHE PUÒ NON ESSERCI — e le due assenze che non vanno confuse.
//
// Ogni campo che una fonte pre-partita può non dare è **dichiaratamente
// assente**, mai dedotto e mai riempito con un ripiego comodo. Questo file è il
// pezzo minimo che rende quella regola un tipo invece che una buona intenzione:
// finché un campo è `Field<T>`, chi lo legge è costretto dal compilatore a
// chiedersi che cosa succede quando non c'è.
//
// LE DUE ASSENZE SONO FATTI DIVERSI:
//
//   * `absent-in-source` — la pagina è stata letta, e quel campo lì non c'è.
//     Esempio misurato il 2026-09-04: sulla pagina partita il minuto di
//     ingresso e quello di uscita non sono esposti. È un'AFFERMAZIONE sulla
//     fonte, e si può usare per decidere che quella fonte non serve a quello
//     scopo;
//   * `not-observed` — quel campo non lo abbiamo guardato: la sezione non è
//     stata letta, la lettura si è fermata prima, il giro non comprendeva
//     quella pagina. È un'AFFERMAZIONE SU DI NOI, e non dice niente sulla
//     fonte.
//
// Confonderle sembra innocuo e non lo è: «Sky non espone l'arbitro» e «non
// abbiamo letto la pagina dove starebbe» portano a due decisioni opposte, e la
// seconda, scambiata per la prima, farebbe cancellare una fonte buona.
//
// NON ESISTE, E NON DEVE NASCERE, un aiuto del tipo «dammi il valore, oppure
// questo default». Sarebbe la deduzione riammessa dalla porta di servizio: chi
// ha bisogno del valore deve gestire il caso in cui non c'è, in chiaro.
//
// ESISTE INVECE, e per un caso solo, `readFieldOrUnobserved`, in fondo a questo
// file: un campo **aggiunto al contratto dopo** che i lettori erano già scritti,
// e che quindi il candidato non nomina affatto. Non restituisce nessun valore —
// restituisce `not-observed`, l'unica assenza che si possa affermare senza aver
// guardato niente. Le ragioni, e i limiti, stanno sulla funzione.

import {
  carryFailure,
  isRead,
  read,
  readRecord,
  shapeNotRecognised,
  type ReadOutcome,
} from "./readOutcome.js";

/** Un campo osservabile: presente, assente nella fonte, oppure non guardato. */
export type Field<T> =
  | { readonly presence: "observed"; readonly value: T }
  | { readonly presence: "absent-in-source" }
  | { readonly presence: "not-observed" };

export function observed<T>(value: T): Field<T> {
  return { presence: "observed", value };
}

/** La pagina è stata letta e quel campo non c'è. */
export function absentInSource<T>(): Field<T> {
  return { presence: "absent-in-source" };
}

/** Quel campo non è stato guardato: non dice nulla sulla fonte. */
export function notObserved<T>(): Field<T> {
  return { presence: "not-observed" };
}

export function isObserved<T>(field: Field<T>): field is { readonly presence: "observed"; readonly value: T } {
  return field.presence === "observed";
}

/**
 * Il valore, se e solo se è stato osservato; altrimenti `null`.
 *
 * `null` qui significa «non c'è un valore», e non è un valore: nessuna funzione
 * di questo pacchetto lo scambia per uno zero, per un elenco vuoto o per una
 * stringa vuota.
 */
export function observedValue<T>(field: Field<T>): T | null {
  return field.presence === "observed" ? field.value : null;
}

/** Trasforma il valore osservato, lasciando intatte le due assenze. */
export function mapField<A, B>(field: Field<A>, transform: (value: A) => B): Field<B> {
  return field.presence === "observed" ? observed(transform(field.value)) : field;
}

/**
 * Legge un campo da un candidato grezzo.
 *
 * La forma attesa è esplicita — `{ presence: … }` — e non c'è scorciatoia: un
 * campo mancante nell'oggetto candidato **non** diventa «assente nella fonte»,
 * perché quale delle due assenze sia non lo può decidere questo file. Chi
 * costruisce il candidato lo sa e lo scrive; qui si controlla che l'abbia
 * scritto.
 */
export function readField<T>(
  candidate: unknown,
  at: readonly string[],
  readValue: (value: unknown, valueAt: readonly string[]) => ReadOutcome<T>,
): ReadOutcome<Field<T>> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);
  const presence = record.value["presence"];
  if (presence === "absent-in-source") return read(absentInSource<T>());
  if (presence === "not-observed") return read(notObserved<T>());
  if (presence !== "observed") {
    return shapeNotRecognised<Field<T>>(
      "atteso presence fra observed, absent-in-source e not-observed",
      [...at, "presence"],
    );
  }
  const value = readValue(record.value["value"], [...at, "value"]);
  if (!isRead(value)) return carryFailure(value);
  return read(observed(value.value));
}

/**
 * UN CAMPO CHE IL CANDIDATO PUÒ NON NOMINARE AFFATTO — e perché non è la
 * scorciatoia che `readField` vieta.
 *
 * `readField` pretende che il campo ci sia, e ha ragione: chi costruisce il
 * candidato sa quale delle due assenze ha visto, e deve scriverla. Ma un
 * contratto che cresce ha un caso che quella regola non copre — **un campo
 * aggiunto dopo**. Il lettore che gira oggi è stato scritto prima che quel
 * campo esistesse: non lo nomina, non perché la fonte non ce l'abbia, ma
 * perché nessuno gliel'ha ancora chiesto di guardarlo.
 *
 * Quella è esattamente `not-observed`, ed è l'unica assenza che si può
 * affermare senza sapere niente: **un'affermazione su di noi**. La chiave che
 * manca nel candidato non diventa e non deve mai diventare `absent-in-source`,
 * che sarebbe un'affermazione sulla fonte fatta da chi la fonte non l'ha
 * guardata.
 *
 * QUESTO NON È IL «DAMMI IL VALORE, OPPURE UN DEFAULT» vietato in cima a
 * questo file: qui non esce nessun valore, mai — esce la dichiarazione più
 * debole che il tipo possieda. E vale per il candidato, non per la pagina: una
 * chiave presente resta letta con tutta la severità di `readField`, e un
 * lettore che il campo lo guarda scrive `absent-in-source` da sé quando la
 * pagina non ce l'ha.
 *
 * Si usa **solo** per i campi nati dopo che il contratto era già in uso. Un
 * campo nuovo letto con `readField` renderebbe illeggibile ogni candidato
 * costruito prima, e un contratto che rompe i suoi lettori a ogni aggiunta
 * finisce per non aggiungere più niente.
 */
export function readFieldOrUnobserved<T>(
  candidate: unknown,
  at: readonly string[],
  readValue: (value: unknown, valueAt: readonly string[]) => ReadOutcome<T>,
): ReadOutcome<Field<T>> {
  // Solo la chiave **assente** passa di qui. Un `null` scritto apposta è un
  // candidato malformato, e come tale si ferma dentro `readField`.
  if (candidate === undefined) return read(notObserved<T>());
  return readField(candidate, at, readValue);
}
