// FASE 3 name-similarity helper v1 — PURE, deterministic, fixture-only.
//
// Provides the `nameTokenOverlap` signal that candidateKeyPolicy.ts's
// `IdentityCandidateComparison` expects but explicitly does not compute
// itself (see that module's header: "callers are responsible for computing
// nameTokenOverlap"). This is a comparison AID, never a canonical identity:
// no player rows are read here, only two already-in-hand name strings a
// caller supplies, and the output is only generic scores/flags.
//
// Deliberately duplicated from (not imported from)
// packages/appeal-index/src/nameNormalization.ts: appeal-index is a
// self-contained offline-ML exploration, not a shared library other
// packages are meant to depend on, and identity-policy is the more
// foundational/upstream concern here — importing "downward" from an ML
// package into a policy package would invert that relationship.
//
// LE DUE VERSIONI OGGI DIVERGONO, ed è una riga che va letta e non saltata.
// Fino alla riparazione delle lettere latine estese (§`EXTENDED_LATIN_FOLDING`)
// la regola era identica nei due pacchetti, e la si diceva identica apposta.
// Adesso la riparazione vive QUI — è questo il normalizzatore che
// `packages/player-identity` importa per decidere un'identità — e in
// `appeal-index`, che quella riparazione non l'ha ricevuta, lo STESSO difetto è
// ancora in piedi: una `ø` continua a diventare uno spazio. Non è stato toccato
// perché il suo normalizzatore produce la chiave del giocatore del generatore,
// e cambiarla cambia le chiavi di un altro sottosistema: è una riparazione a sé,
// con la sua misura. Questa riga esiste perché la prossima persona non legga
// «identiche» in un commento e ci creda.
//
// This is NOT a real matcher, NOT canonicalization: no threshold/band
// decision happens here (that stays in candidateKeyPolicy.ts), and no
// result ever carries a `canonical_player_id`/`canonical_team_id` field.

// U+0300-U+036F: Unicode "Combining Diacritical Marks" block, produced by
// String.prototype.normalize("NFD") when it decomposes accented letters.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

// ── LE LETTERE LATINE CHE NFD NON SCOMPONE, e perché le perdevamo ───────────
//
// `normalize("NFD")` scompone una lettera accentata in lettera base più segno
// combinante, e la riga sopra toglie il segno: `é` diventa `e`. Ma una parte
// dell'alfabeto latino esteso NON è una lettera base più un accento — è una
// lettera a sé, con un tratto o una legatura DENTRO il glifo — e NFD la lascia
// intatta: la `ø` nordica non è una `o` con un segno sopra, `đ`/`ð` non sono
// una `d`, `ł` non è una `l`, `ß` non è una `s`, e `æ`/`œ` sono legature di
// due lettere.
//
// Fino a questa riparazione quelle lettere cadevano nel filtro `[^a-z0-9\s]`
// qui sotto e diventavano uno SPAZIO. Il guasto non era estetico: uno spazio in
// mezzo a un cognome lo SPEZZA in due token, e un cognome che comincia con una
// di queste lettere perde la propria iniziale. Un confronto per token che
// riceve due token dove ce n'era uno non aggancia più — e non fallisce, il che
// è peggio: risponde «nessuna somiglianza» con la stessa faccia con cui
// risponderebbe su due persone diverse.
//
// LA TABELLA È DATO, NON UN `if`. Ogni riga è una traslitterazione dichiarata e
// contestabile: le legature si aprono nelle due lettere che rappresentano
// (`æ` → `ae`, `ß` → `ss`, `þ` → `th`), il resto va alla propria lettera base.
// Si applica DOPO il minuscolo, quindi bastano le chiavi minuscole.
//
// NON È UN ELENCO DI LINGUE E NON VA LETTA COME COMPLETA: copre le lettere
// latine estese che ricorrono nei nomi di questo dominio. Una lettera fuori da
// qui continua a diventare uno spazio, che resta il comportamento giusto per la
// punteggiatura e per ciò che latino non è affatto — un alfabeto non latino non
// ha una «lettera base» da scegliere, e sceglierne una sarebbe indovinare.
const EXTENDED_LATIN_FOLDING: ReadonlyMap<string, string> = new Map([
  ["\u00f8", "o"],
  ["\u0111", "d"],
  ["\u00f0", "d"],
  ["\u0142", "l"],
  ["\u0127", "h"],
  ["\u0167", "t"],
  ["\u014b", "n"],
  ["\u0131", "i"],
  ["\u0138", "k"],
  ["\u017f", "s"],
  ["\u00e6", "ae"],
  ["\u0153", "oe"],
  ["\u00df", "ss"],
  ["\u00fe", "th"],
]);

const EXTENDED_LATIN_PATTERN = new RegExp(`[${[...EXTENDED_LATIN_FOLDING.keys()].join("")}]`, "g");

/**
 * Riporta all'alfabeto latino di base le lettere che `NFD` non scompone. Pura e
 * totale: una lettera fuori tabella esce com'è entrata, e sarà il filtro a
 * valle a decidere che farne.
 */
function foldExtendedLatin(lowercased: string): string {
  return lowercased.replace(EXTENDED_LATIN_PATTERN, (ch) => EXTENDED_LATIN_FOLDING.get(ch) ?? ch);
}

/**
 * Lowercase, strip diacritics, fold the extended-Latin letters NFD does not
 * decompose (§`EXTENDED_LATIN_FOLDING`), then collapse any remaining
 * non-alphanumeric run (spaces, hyphens, apostrophes, periods, ...) into a
 * single space, trim. Preserves every letter/digit token — never drops a token
 * outright, and never SPLITS one that was whole — so downstream token-overlap
 * comparison neither over-matches by silently discarding a meaningful name
 * part, nor under-matches by breaking a surname in two.
 */
export function normalizePlayerName(name: string): string {
  const withoutDiacritics = name.normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase();
  return foldExtendedLatin(withoutDiacritics)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits an already-normalized name into its space-separated tokens. Empty input yields []. */
export function tokenizeNormalizedName(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Jaccard token-overlap: |intersection| / |union|, in [0, 1]. Two empty
 * token lists (or either being empty) return 0 — "no evidence" is treated
 * as no overlap, never as a free match. Order-independent, deterministic.
 */
export function computeTokenOverlap(tokensA: readonly string[], tokensB: readonly string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  const union = new Set([...setA, ...setB]);
  return shared / union.size;
}

/** Full set of generic, redacted comparison signals between two raw name strings. */
export interface NameComparisonSignals {
  readonly normalizedA: string;
  readonly normalizedB: string;
  readonly tokensA: readonly string[];
  readonly tokensB: readonly string[];
  /** Jaccard token overlap in [0, 1] — feed directly into candidateKeyPolicy's `nameTokenOverlap`. */
  readonly tokenOverlap: number;
  /** True only when both sides normalize to a non-empty, identical string. */
  readonly exactNormalizedMatch: boolean;
  /** True when a side normalizes to the empty string (e.g. blank/whitespace-only input). */
  readonly emptyA: boolean;
  readonly emptyB: boolean;
  /** True when either side has zero tokens after normalization — not enough evidence to compare. */
  readonly insufficientTokens: boolean;
}

/**
 * Compare two raw name strings end to end: normalize, tokenize, score.
 * Pure — no I/O, no randomness, same input always yields the same output.
 * Never assigns any identity: only descriptive signals a caller (e.g.
 * candidateKeyPolicy.ts) can feed into its own decision logic.
 */
export function compareNames(rawA: string, rawB: string): NameComparisonSignals {
  const normalizedA = normalizePlayerName(rawA);
  const normalizedB = normalizePlayerName(rawB);
  const tokensA = tokenizeNormalizedName(normalizedA);
  const tokensB = tokenizeNormalizedName(normalizedB);
  const emptyA = normalizedA.length === 0;
  const emptyB = normalizedB.length === 0;
  const insufficientTokens = tokensA.length === 0 || tokensB.length === 0;

  return {
    normalizedA,
    normalizedB,
    tokensA,
    tokensB,
    tokenOverlap: computeTokenOverlap(tokensA, tokensB),
    exactNormalizedMatch: !emptyA && !emptyB && normalizedA === normalizedB,
    emptyA,
    emptyB,
    insufficientTokens,
  };
}
