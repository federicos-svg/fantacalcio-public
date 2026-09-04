// COME SI GUARDA DENTRO UN DOCUMENTO — i pezzi comuni a tutti i parser.
//
// Quattro pagine, quattro parser, **un solo modo di guardare**: si estrae il
// blocco di dati strutturati descritto dalla tabella, lo si legge come JSON, e
// poi si cercano le cose **per nome di chiave**, non per percorso. Il motivo è
// scritto per esteso in `parseMatchPage.ts` e vale identico qui: l'osservazione
// di una struttura misura quali campi esistono, non a che profondità stanno, e
// un percorso scritto a mano si rompe al primo annidamento diverso.
//
// PERCHÉ IN UN FILE SOLO. Quando il secondo parser è arrivato, queste funzioni
// erano già scritte dentro il primo. Copiarle avrebbe fatto divergere quattro
// copie della stessa idea — «un elemento illeggibile ferma tutto», «senza fuso
// non si legge» — e la divergenza si sarebbe vista solo alla prima lettura vera,
// su una pagina sola, senza capire perché le altre tre funzionavano.
//
// QUI NON C'È NIENTE DELLA FONTE. Nessun nome di chiave, nessuna espressione:
// le espressioni arrivano tutte come argomento, dalla tabella che vive nel
// privato. Questo file sa cercare, non sa che cosa.
//
// PURO: nessun orologio, nessun numero casuale, nessuno stato fra una chiamata
// e l'altra. L'unico `Date` è `Date.parse` dentro le letture di istanti, che è
// funzione del suo argomento e di nient'altro.

import { isRead, readLabel, shapeNotRecognised, type ReadOutcome } from "./readOutcome.js";

/** Un modulo come lo scrive una fonte: numeri separati da trattini. */
export const MODULE_SHAPE = /^\d{1,2}(-\d{1,2}){1,4}$/;

/** Un istante ISO-8601 **con fuso esplicito**: senza fuso non si ordina niente. */
export const INSTANT_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Una coppia chiave/valore del documento, con il contenitore in cui è stata trovata. */
export interface Entry {
  readonly key: string;
  readonly value: unknown;
  readonly container: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Una fermata, detta in modo che si capisca da fuori: il codice stabile, **la
 * famiglia di chiavi** in ballo quando ce n'è una, e il perché in parole.
 *
 * `where` è il nome del parser, e finisce nel percorso: chi legge un motivo sa
 * subito quale delle quattro letture si è fermata.
 */
export function stopAt<T>(
  where: string,
  code: string,
  family: string | null,
  why: string,
): ReadOutcome<T> {
  const at = family === null ? [where] : [where, "keys", family];
  const named = family === null ? why : `famiglia di chiavi "${family}": ${why}`;
  return shapeNotRecognised<T>(`${code} — ${named}`, at);
}

/**
 * Ogni coppia chiave/valore del documento, **una volta sola**, con il proprio
 * contenitore. Contarne una due volte farebbe fallire i controlli di cardinalità
 * — «due elenchi di titolari», «un solo elenco di giornate» — proprio sulle
 * pagine giuste.
 */
export function entriesOf(root: unknown): readonly Entry[] {
  const out: Entry[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 14 || out.length > 20000) return;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && i < 60; i += 1) walk(value[i], depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of Object.keys(value)) {
      out.push({ key, value: value[key], container: value });
      walk(value[key], depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** I blocchi di dati strutturati estratti dal testo, nell'ordine dei modi dichiarati. */
export function structuredBlocks(html: string, patterns: readonly RegExp[]): readonly string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    // `exec` su una regexp con stato globale sarebbe una funzione con memoria:
    // se ne fa una copia senza `g` per restare puri fra una chiamata e l'altra.
    const once = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
    const match = once.exec(html);
    const body = match?.[1];
    if (body !== undefined && out.length < 10) out.push(body);
  }
  return out;
}

/**
 * Il primo blocco che si legge come JSON, oppure `null`.
 *
 * Un blocco illeggibile non è fatale finché ne resta un altro. Fatale è non
 * averne nessuno, e lo dice chi chiama.
 */
export function firstReadableJson(blocks: readonly string[]): unknown {
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // Vedi sopra: si prova il prossimo.
    }
  }
  return null;
}

/** Un'etichetta pulita, oppure `null`. Le stringhe lunghe come una frase non lo sono. */
export function label(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const outcome = readLabel(value.replace(/\s+/g, " "), []);
  return isRead(outcome) ? outcome.value : null;
}

export function firstLabelIn(container: Record<string, unknown>, pattern: RegExp): string | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const text = label(container[key]);
    if (text !== null) return text;
  }
  return null;
}

/** Il primo intero non negativo sotto una chiave della famiglia, oppure `null`. */
export function firstWholeNumberIn(container: Record<string, unknown>, pattern: RegExp): number | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const value = container[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d{1,3}$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

/**
 * Il primo intero **con segno**, oppure `null`.
 *
 * Serve alla differenza reti, che è l'unica colonna in cui −7 è un numero
 * legittimo: leggerla come le altre l'avrebbe rifiutata, e una colonna rifiutata
 * sarebbe diventata un'assenza che la fonte non ha dichiarato.
 */
export function firstIntegerIn(container: Record<string, unknown>, pattern: RegExp): number | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const value = container[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^[+-]?\d{1,3}$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

export function firstArrayIn(container: Record<string, unknown>, pattern: RegExp): readonly unknown[] | null {
  for (const key of Object.keys(container)) {
    const value = container[key];
    if (pattern.test(key) && Array.isArray(value)) return value;
  }
  return null;
}

/** Il primo istante **con fuso** sotto una chiave della famiglia, oppure `null`. */
export function firstInstantIn(container: Record<string, unknown>, pattern: RegExp): string | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const value = container[key];
    if (typeof value === "string" && INSTANT_WITH_ZONE.test(value)) return value;
  }
  return null;
}

/** Tutti gli elenchi che stanno sotto una chiave della famiglia, con il loro contenitore. */
export function arraysNamed(entries: readonly Entry[], pattern: RegExp): readonly Entry[] {
  return entries.filter((entry) => pattern.test(entry.key) && Array.isArray(entry.value));
}

/**
 * Un numero di giornata scritto da una fonte, oppure `null`.
 *
 * Il tetto a 60 non è una regola di lega: è la guardia contro un numero che non
 * è una giornata — un anno, un identificativo — finito lì per sbaglio.
 */
export function matchdayNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 60) return value;
  if (typeof value === "string" && /^\s*\d{1,2}\s*$/.test(value)) {
    const number = Number(value.trim());
    if (number >= 1) return number;
  }
  return null;
}

/** Il numero di giornata dichiarato **dentro un contenitore preciso**, oppure `null`. */
export function declaredMatchdayIn(container: Record<string, unknown>, pattern: RegExp): number | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const number = matchdayNumber(container[key]);
    if (number !== null) return number;
  }
  return null;
}

/** Il numero di giornata dichiarato **da qualche parte nel documento**, oppure `null`. */
export function declaredMatchdayAmong(entries: readonly Entry[], pattern: RegExp): number | null {
  for (const entry of entries) {
    if (!pattern.test(entry.key)) continue;
    const number = matchdayNumber(entry.value);
    if (number !== null) return number;
  }
  return null;
}
