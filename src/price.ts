// Pure price-parsing logic, extracted out of main.ts so it is unit-testable
// under this repo's no-jsdom posture (same pattern as callGuard.ts: a small
// pure module main.ts imports, with no DOM/storage dependency of its own).
// See src/price.test.ts.

// Strict positive-integer price parser: rejects anything parseInt would
// silently accept by truncation/partial-read — decimals ("1.5" -> 1),
// exponential notation ("1e3" -> 1) — plus negative/zero/empty/whitespace
// input. Only a bare run of digits with no leading zero is a valid price.
export function parsePositiveIntegerPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
  return Number(trimmed);
}
