import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "../src/index.js";

// Issue #234, privacy note: "i profili sono giudizi personali su persone reali
// della lega — mai versionati, mai loggati". These tests are the enforcement
// of that sentence, not a restatement of it.

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("PRIVACY — the repo carries the schema, never the data", () => {
  it("contains only TypeScript sources: no data file of any kind", () => {
    // A profile that reached the repo would arrive as a committed file. There
    // is no path for one because the package holds no data file at all — and
    // this test fails the moment somebody adds the first .json/.csv/.xlsx.
    const offenders = walk(packageRoot).filter((file) => !file.endsWith(".ts"));
    expect(offenders).toEqual([]);
  });

  it("offers no export/serialise-to-file helper", () => {
    // The reason is mechanical rather than moral: a package with an export
    // function is one call away from a real profile in a file, an attachment
    // or a log. So the mechanism does not exist.
    const suspicious = Object.keys(api).filter((name) =>
      /export|download|toFile|writeFile|serializeTo/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });

  it("persists only through the runtime-local storage key", () => {
    expect(api.OPPONENT_PROFILES_STORAGE_KEY).toBe("fac_opponent_profiles");
    expect(api.OPPONENT_PROFILES_STORAGE_KEY).not.toMatch(/[/\\.]/);
  });

  it("has no name-shaped field anywhere in the profile schema", () => {
    // The label of a person lives in the league roster (also runtime-local);
    // a profile carries an opaque personId and judgements, nothing else.
    const shape = api.opponentProfileSchema.shape;
    for (const key of Object.keys(shape)) {
      expect(key).not.toMatch(/name|nome|email|telefono|phone/i);
    }
  });

  it("rejects, rather than stores, a profile carrying a person's name", () => {
    const result = api.validateOpponentProfile({
      schemaVersion: 1,
      personId: "person:00000000-0000-4000-8000-00000000000a",
      interviewId: "i1",
      name: "Nome Reale Che Non Deve Entrare",
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Nome Reale Che Non Deve Entrare");
  });
});
