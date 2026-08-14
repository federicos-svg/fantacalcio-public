// Name normalization — a comparison AID for cross-season identity checks,
// never a canonical identity. Real canonical identity resolution
// (fuzzy+manual matching, confidence, false-match thresholds) remains
// Batch 0E / gate `data_promoted`, out of scope here.

// U+0300-U+036F: Unicode "Combining Diacritical Marks" block, produced by
// String.prototype.normalize("NFD") when it decomposes accented letters.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Lowercase, strip diacritics, collapse punctuation/whitespace. */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
