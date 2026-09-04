// LA TABELLA DELLE FAMIGLIE DI CHIAVI — l'ingresso obbligatorio del parser, e
// il motivo per cui non vive qui dentro.
//
// COS'È. Un parser deve pur sapere come si chiamano le cose nel documento che
// legge: quale chiave porta i titolari, quale la panchina, quale dice chi gioca
// in casa. Quell'elenco di nomi è **la forma di una fonte precisa**: non è un
// indirizzo e non è un host, ma chi lo legge capisce di quale sito si tratta.
//
// PERCHÉ STA FUORI DAL CORE PUBBLICO. La regola del confine
// (`docs/PUBLIC_PRIVATE_BOUNDARY.md`) dice **UNKNOWN → PRIVATE, sempre**: nel
// dubbio il file resta privato e l'ambiguità si segnala. Il caso è
// esattamente un dubbio — la regola manda i parser nel pubblico, ma non
// contemplava un parser la cui **forma** identifica la fonte — e nel dubbio
// vince il privato. Quindi la tabella arriva **da fuori, come parametro**, e
// questo pacchetto resta una macchina che sa leggere *una* struttura descritta
// da qualcun altro, senza dire di chi è.
//
// **NON RIMETTERLA QUI DENTRO.** Sembrerà una semplificazione — «tanto sono
// solo nomi di campo» — e costerebbe due cose: il core pubblico direbbe di
// quale sito si parla, e ogni volta che la fonte rinomina un campo bisognerebbe
// **ripubblicare un parser** invece di aggiornare un dato privato. Chi arriva
// qui fra sei mesi con l'idea di accorciare il giro legga questo paragrafo
// prima.
//
// SENZA TABELLA IL PARSER NON TENTA NIENTE. Non esiste un elenco di riserva,
// non esiste un valore per difetto, non esiste un tentativo «alla cieca» su
// nomi plausibili: una tabella assente, incompleta o malformata è un esito
// dichiarato, e il parser si ferma prima di guardare il documento.
//
// I MOTIVI SI LEGGONO SENZA AVERE SCRITTO IL PARSER: ogni fermata nomina **la
// famiglia** che mancava — `starters`, `bench`, `homeSide` — non un indice
// numerico dentro una struttura che chi legge non ha davanti.

import { carryFailure, isRead, outOfContract, read, readRecord, shapeNotRecognised, type ReadOutcome } from "./readOutcome.js";

/**
 * Le famiglie di chiavi che il parser deve saper riconoscere.
 *
 * Ogni voce è **un'espressione regolare scritta come testo**, che questo file
 * compila: la tabella viaggia come dato — un file di configurazione privato, un
 * parametro di workflow — e un dato non può essere una funzione.
 */
export interface SourceShapePatterns {
  /**
   * Come si estrae dal documento il blocco di dati strutturati: espressioni con
   * **un gruppo di cattura**, provate in ordine. La prima che cattura un testo
   * leggibile come JSON vince.
   */
  readonly structuredBlocks: readonly string[];
  /** I nomi delle chiavi, famiglia per famiglia. */
  readonly keys: Readonly<Record<SourceShapeFamily, string>>;
  /** Che cosa dice una fonte quando pubblica le formazioni effettive. */
  readonly saysActual: string;
  /** Che cosa dice quando pubblica le probabili. */
  readonly saysProbable: string;
}

/** Le famiglie che la tabella deve coprire. Elenco chiuso: una in meno ferma il parser. */
export const SOURCE_SHAPE_FAMILIES = [
  "starters",
  "bench",
  "substitutions",
  "module",
  "coach",
  "referee",
  "teamName",
  "playerName",
  "shirtNumber",
  "role",
  "status",
  "homeSide",
  "kickOff",
  "matchday",
  "substitutionOff",
  "substitutionOn",
  "minute",
] as const;

export type SourceShapeFamily = (typeof SOURCE_SHAPE_FAMILIES)[number];

/** La tabella compilata: quello che il parser usa davvero. */
export interface SourceShape {
  readonly structuredBlocks: readonly RegExp[];
  readonly keys: Readonly<Record<SourceShapeFamily, RegExp>>;
  readonly saysActual: RegExp;
  readonly saysProbable: RegExp;
}

function compile(pattern: unknown, at: readonly string[]): ReadOutcome<RegExp> {
  if (typeof pattern !== "string" || pattern.trim().length === 0) {
    return shapeNotRecognised<RegExp>("attesa un'espressione regolare come testo non vuoto", at);
  }
  try {
    return read(new RegExp(pattern, "i"));
  } catch {
    // Un'espressione che non compila non è un caso limite da ignorare: è una
    // tabella rotta, e con una tabella rotta il parser leggerebbe metà documento.
    return outOfContract<RegExp>("espressione regolare non compilabile", at);
  }
}

/**
 * Legge la tabella, o dice quale famiglia manca.
 *
 * Fail-closed su tutto: una famiglia assente, un'espressione vuota, una che non
 * compila, zero modi di estrarre il blocco strutturato. Nessuna di queste
 * situazioni ha un ripiego, perché ogni ripiego sarebbe una supposizione sulla
 * forma della fonte fatta dal pezzo di codice che quella forma non la conosce.
 */
export function readSourceShape(
  candidate: unknown,
  at: readonly string[] = ["sourceShape"],
): ReadOutcome<SourceShape> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const rawBlocks = record.value["structuredBlocks"];
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return shapeNotRecognised<SourceShape>(
      "serve almeno un modo di estrarre il blocco di dati strutturati",
      [...at, "structuredBlocks"],
    );
  }
  const blocks: RegExp[] = [];
  for (let i = 0; i < rawBlocks.length; i += 1) {
    const compiled = compile(rawBlocks[i], [...at, "structuredBlocks", String(i)]);
    if (!isRead(compiled)) return carryFailure(compiled);
    blocks.push(compiled.value);
  }

  const rawKeys = readRecord(record.value["keys"], [...at, "keys"]);
  if (!isRead(rawKeys)) return carryFailure(rawKeys);

  const keys: Partial<Record<SourceShapeFamily, RegExp>> = {};
  for (const family of SOURCE_SHAPE_FAMILIES) {
    const compiled = compile(rawKeys.value[family], [...at, "keys", family]);
    if (!isRead(compiled)) return carryFailure(compiled);
    keys[family] = compiled.value;
  }

  const saysActual = compile(record.value["saysActual"], [...at, "saysActual"]);
  if (!isRead(saysActual)) return carryFailure(saysActual);
  const saysProbable = compile(record.value["saysProbable"], [...at, "saysProbable"]);
  if (!isRead(saysProbable)) return carryFailure(saysProbable);

  return read({
    structuredBlocks: blocks,
    keys: keys as Readonly<Record<SourceShapeFamily, RegExp>>,
    saysActual: saysActual.value,
    saysProbable: saysProbable.value,
  });
}
