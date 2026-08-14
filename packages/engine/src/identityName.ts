// Identity name normalization (Validation + Identity Contract, Batch 0E) —
// PURE, in-memory, fixture-only. Formalizes in code the `normalized_name`
// rule that VALIDATION_IDENTITY_CONTRACT.md and
// schemas/fantacalcio_identity_candidate.schema.json describe as design:
// "forma normalizzata deterministica: lowercase, accenti->ascii, trim,
// collapse spazi". This module only produces the string — it does NOT
// resolve identity, does NOT match candidates, does NOT touch
// canonical_player_id/canonical_team_id (both stay out of scope here, always
// null upstream). NO real names, NO I/O, NO dependency: inputs are always
// synthetic in this repo.
//
// Relationship to the repo's two existing name-normalization functions —
// disclosed here following the same convention
// packages/identity-policy/src/nameSimilarity.ts already uses for its own
// intentional duplication ("Deliberately duplicated from ..." header):
// - packages/appeal-index/src/nameNormalization.ts's normalizePlayerName()
//   and packages/identity-policy/src/nameSimilarity.ts's
//   normalizePlayerName() are a *comparison aid* for fuzzy/token-overlap
//   identity matching (FASE 3 candidate scoring). Both collapse ANY
//   non-alphanumeric run — including apostrophes and hyphens — to a single
//   space (`[^a-z0-9\s]` -> " "), so `"O'Brien"` -> `"o brien"`.
// - `normalizeIdentityName()` here is a genuinely different, THIRD variant,
//   not a copy of the two above: it targets the schema's canonical
//   `normalized_name` field (`fantacalcio_identity_candidate.schema.json`),
//   where an apostrophe or hyphen is a meaningful, stable part of the name,
//   not noise — `"O'Brien"` -> `"o'brien"` (kept), never `"o brien"`.
// Use nameNormalization.ts / nameSimilarity.ts for fuzzy/token-overlap
// comparison signals. Use this function only to produce the canonical
// `normalized_name` field. The two are not interchangeable: do not feed
// this function's output into token-overlap comparison, and do not use the
// other two to populate `normalized_name`.
//
// Known limitation (disclosed, not yet resolved): step 1 below only strips
// *combining* diacritics (Unicode block U+0300-U+036F) produced by NFD
// decomposition. Letters with no canonical NFD decomposition are silently
// DROPPED by step 4 (treated as noise), not transliterated — e.g.
// `"Straße"` -> `"stra e"` (ß lost, not "ss"), `"Łukasz"` -> `"ukasz"` (Ł
// lost, not "l"), `"Đorđe"` -> `"or e"` (Đ lost, not "d"). Same class of
// limitation as nameNormalization.ts/nameSimilarity.ts. This is a first
// implementation validated only on synthetic fixtures (see
// identityName.test.ts); real-name coverage of these letters (e.g. Serbian/
// Croatian/Polish/German surnames plausible in Serie A) is an open item —
// see VALIDATION_IDENTITY_CONTRACT.md "Open decisions residue".

const COMBINING_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
const APOSTROPHE_LOOKALIKES_RE = /[‘’ʼ´`]/g;
const DASH_LOOKALIKES_RE = /[–—]/g;
const NON_NAME_CHAR_RE = /[^a-z0-9'\- ]/g;
const WHITESPACE_RUN_RE = /\s+/g;

/**
 * Deterministic, pure normalization for a player/team display name into the
 * `normalized_name` form used by identity candidates. Order:
 * 1. Unicode NFD decomposition + strip combining diacritics (accents -> ascii,
 *    e.g. "é" -> "e", "ç" -> "c", "ñ" -> "n").
 * 2. Canonicalize apostrophe look-alikes (curly/backtick/acute) to `'` and
 *    dash look-alikes (en/em dash) to `-` — both kept as meaningful name
 *    characters (e.g. "N'Golo", "Sarr-Diallo"), never stripped.
 * 3. Lowercase.
 * 4. Drop any character that is not a-z, 0-9, space, `'` or `-` (punctuation
 *    noise like periods/commas/parentheses).
 * 5. Collapse runs of whitespace to a single space and trim.
 *
 * Empty or whitespace-only input normalizes to `""` — this function only
 * normalizes, it does not enforce the identity-candidate schema's
 * `minLength: 1` (that stays a downstream/schema concern).
 */
export function normalizeIdentityName(input: string): string {
  const withoutAccents = input.normalize("NFD").replace(COMBINING_DIACRITICS_RE, "");
  const withCanonicalPunctuation = withoutAccents
    .replace(APOSTROPHE_LOOKALIKES_RE, "'")
    .replace(DASH_LOOKALIKES_RE, "-");
  const lowered = withCanonicalPunctuation.toLowerCase();
  const strippedNoise = lowered.replace(NON_NAME_CHAR_RE, " ");
  return strippedNoise.replace(WHITESPACE_RUN_RE, " ").trim();
}
