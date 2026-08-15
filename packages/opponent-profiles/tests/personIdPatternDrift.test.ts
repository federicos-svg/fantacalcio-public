import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PERSON_ID_PATTERN } from "../src/types.js";

// FINDING-4 (audit coerenza 14/08, BASSA).
//
// `PERSON_ID_PATTERN` (packages/opponent-profiles/src/types.ts:50) is a
// deliberate MIRROR, not an import, of the regex `src/leagueTeams.ts` uses
// inline in `personSchema.id` (`z.string().regex(/^person:[0-9a-f-]{36}$/i)`).
// The comment right above the constant explains why the duplication exists
// ("a package must not depend on the app root") — but a comment cannot keep
// the two copies in sync by itself. This is that sync check.
//
// Same technique as the structural tests already in privacy.test.ts (this
// directory), which assert on the actual repo filesystem via node:fs rather
// than on an import's runtime shape — reading the raw TEXT of
// src/leagueTeams.ts is what lets this test see the sibling regex literal at
// all, since it is not exported as a named value there and never will be
// (importing across the app-root/package boundary is exactly what the
// mirroring comment says this package must not do).
//
// If either regex literal changes without the other, this test goes red with
// a message naming both source locations, instead of the drift being
// discovered later by a `person:` id silently failing (or wrongly passing)
// validation on one side of the boundary but not the other.

const leagueTeamsPath = fileURLToPath(new URL("../../../src/leagueTeams.ts", import.meta.url));
const typesPath = fileURLToPath(new URL("../src/types.ts", import.meta.url));

/** Extracts the regex literal text (e.g. `/^person:[0-9a-f-]{36}$/i`) that
 *  immediately follows `label` in `source`, or throws with a message naming
 *  both the expected shape and the file, so a refactor that moves the regex
 *  fails loudly here instead of this drift guard silently no-op'ing. */
function extractRegexLiteralAfter(source: string, label: string, filePath: string): string {
  const labelIndex = source.indexOf(label);
  if (labelIndex === -1) {
    throw new Error(
      `person-id-pattern drift guard: could not find "${label}" in ${filePath} — ` +
        "this test's extraction is now out of sync with the source shape it checks. " +
        "Update the extraction alongside whatever changed the source.",
    );
  }
  const rest = source.slice(labelIndex + label.length);
  const match = rest.match(/\/\^.*?\$\/[a-z]*/);
  if (!match) {
    throw new Error(
      `person-id-pattern drift guard: found "${label}" in ${filePath} but no regex ` +
        "literal (/^.../flags) immediately after it — this test's extraction is now " +
        "out of sync with the source shape it checks.",
    );
  }
  return match[0];
}

describe("PERSON_ID_PATTERN mirror — drift guard (audit 14/08 FINDING-4)", () => {
  it("stays byte-identical to the inline regex in src/leagueTeams.ts's personSchema", () => {
    const leagueTeamsSource = readFileSync(leagueTeamsPath, "utf8");
    const typesSource = readFileSync(typesPath, "utf8");

    const leagueTeamsLiteral = extractRegexLiteralAfter(
      leagueTeamsSource,
      "id: z.string().regex(",
      "src/leagueTeams.ts",
    );
    const typesLiteral = extractRegexLiteralAfter(
      typesSource,
      "export const PERSON_ID_PATTERN = ",
      "packages/opponent-profiles/src/types.ts",
    );

    expect(
      typesLiteral,
      "PERSON_ID_PATTERN in packages/opponent-profiles/src/types.ts:50 has drifted " +
        "from the person-id regex src/leagueTeams.ts's personSchema.id validates " +
        "against. The comment above the constant says the two are deliberately " +
        "mirrored — update both together, or this validator accepts/rejects a " +
        "different set of ids than the league roster does.",
    ).toBe(leagueTeamsLiteral);

    // Cross-check the live, imported constant too — not just the second raw
    // text extraction — so a change that edits the exported value without
    // touching the literal text at line 50 (unlikely, but this is a drift
    // guard) cannot slip past silently either.
    expect(PERSON_ID_PATTERN.toString()).toBe(typesLiteral);
  });
});
