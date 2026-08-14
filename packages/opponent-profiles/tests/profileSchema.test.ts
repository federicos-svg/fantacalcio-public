import { describe, it, expect } from "vitest";
import {
  opponentProfileStoreSchema,
  parseOpponentProfile,
  profileLogSummary,
  validateOpponentProfile,
  validateOpponentProfileStore,
} from "../src/profileSchema.js";
import { NOTES_MAX_LENGTH, LABEL_LIST_MAX } from "../src/types.js";
import {
  CONFIRMED_PROFILE,
  PARTIALLY_CONFIRMED_PROFILE,
  SYNTHETIC_PERSON_IDS,
} from "../fixtures/synthetic.js";

// Every fixture here is synthetic — see fixtures/synthetic.ts.

const VALID = CONFIRMED_PROFILE as unknown as Record<string, unknown>;

function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...VALID, [field]: value };
}

function codes(result: ReturnType<typeof validateOpponentProfile>): readonly string[] {
  return result.ok ? [] : result.issues.map((i) => i.code);
}

describe("opponentProfileSchema — accepts a well-formed interview profile", () => {
  it("validates the fully confirmed fixture", () => {
    const result = validateOpponentProfile(CONFIRMED_PROFILE);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.personId).toBe(SYNTHETIC_PERSON_IDS.ataturk);
  });

  it("validates a profile whose interview only reached some questions", () => {
    // ABSENT is a legitimate state: an unanswered question is not filled with
    // a fabricated default anywhere in this schema.
    expect(validateOpponentProfile(PARTIALLY_CONFIRMED_PROFILE).ok).toBe(true);
  });

  it("accepts a profile with no judgement field at all", () => {
    const bare = {
      schemaVersion: 1,
      personId: SYNTHETIC_PERSON_IDS.psg,
      interviewId: "intervista-vuota",
    };
    expect(validateOpponentProfile(bare).ok).toBe(true);
  });

  it("parseOpponentProfile returns the profile and throws on garbage", () => {
    expect(parseOpponentProfile(CONFIRMED_PROFILE).interviewId).toBe("intervista-sintetica-1");
    expect(() => parseOpponentProfile({ schemaVersion: 1 })).toThrow();
  });
});

describe("opponentProfileSchema — PRIVACY: unknown keys are refused", () => {
  // The whole reason the schema is `.strict()`. A profile that accepted a
  // `name` would be a profile that can carry a real person's name into
  // storage, an export or a log.
  it.each(["name", "displayName", "email", "telefono", "note"])(
    "rejects the extra key %s",
    (key) => {
      const result = validateOpponentProfile(withField(key, "qualcosa"));
      expect(result.ok).toBe(false);
      expect(codes(result)).toContain("unrecognized_keys");
    },
  );

  it("names the rejected key in the issue path (a field name, never a value)", () => {
    const result = validateOpponentProfile(withField("name", "Valore Da Non Registrare"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path.includes("name"))).toBe(true);
    expect(JSON.stringify(result.issues)).not.toContain("Valore Da Non Registrare");
  });

  it("rejects an unknown key nested inside a declared wrapper", () => {
    const result = validateOpponentProfile(
      withField("spendingTiming", {
        value: "presto",
        status: "confermato",
        declaredAt: "2026-08-20",
        confidence: "alta",
      }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("unrecognized_keys");
  });

  it("never puts an offending VALUE into an issue", () => {
    const forbiddenValue = "STRINGA-CHE-NON-DEVE-COMPARIRE";
    const result = validateOpponentProfile(
      withField("spendingTiming", { value: forbiddenValue, status: "confermato", declaredAt: "2026-08-20" }),
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(forbiddenValue);
  });
});

describe("opponentProfileSchema — fail-closed on every field", () => {
  it("refuses a foreign schemaVersion instead of guessing a migration", () => {
    expect(validateOpponentProfile({ ...VALID, schemaVersion: 2 }).ok).toBe(false);
    expect(validateOpponentProfile({ ...VALID, schemaVersion: "1" }).ok).toBe(false);
  });

  it.each([
    ["", "empty"],
    ["ataturk", "a seat id, not a person id"],
    ["person:not-a-uuid", "malformed uuid"],
  ])("rejects personId %s (%s)", (personId) => {
    expect(validateOpponentProfile({ ...VALID, personId }).ok).toBe(false);
  });

  it("rejects a value outside the declared vocabulary", () => {
    expect(
      validateOpponentProfile(
        withField("spendingTiming", {
          value: "prestissimo",
          status: "confermato",
          declaredAt: "2026-08-20",
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateOpponentProfile(
        withField("tiltSusceptibility", {
          value: "altissima",
          status: "confermato",
          declaredAt: "2026-08-20",
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateOpponentProfile(
        withField("weaknesses", {
          value: ["gioca_male"],
          status: "confermato",
          declaredAt: "2026-08-20",
        }),
      ).ok,
    ).toBe(false);
  });

  it("rejects an unknown declaration status — there are only two", () => {
    expect(
      validateOpponentProfile(
        withField("spendingTiming", {
          value: "presto",
          status: "quasi_confermato",
          declaredAt: "2026-08-20",
        }),
      ).ok,
    ).toBe(false);
  });

  it.each(["2026-02-30", "2026-8-20", " 2026-08-20", "20/08/2026", ""])(
    "rejects declaredAt %s",
    (declaredAt) => {
      expect(
        validateOpponentProfile(
          withField("spendingTiming", { value: "presto", status: "confermato", declaredAt }),
        ).ok,
      ).toBe(false);
    },
  );

  it("accepts a real leap day and rejects a fake one", () => {
    const ok = withField("spendingTiming", {
      value: "presto",
      status: "confermato",
      declaredAt: "2028-02-29",
    });
    const ko = withField("spendingTiming", {
      value: "presto",
      status: "confermato",
      declaredAt: "2026-02-29",
    });
    expect(validateOpponentProfile(ok).ok).toBe(true);
    expect(validateOpponentProfile(ko).ok).toBe(false);
  });

  it("rejects a repeated weakness code rather than deduping it silently", () => {
    const result = validateOpponentProfile(
      withField("weaknesses", {
        value: ["tirchio", "tirchio"],
        status: "confermato",
        declaredAt: "2026-08-20",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("bounds the free-text note", () => {
    const long = "x".repeat(NOTES_MAX_LENGTH + 1);
    expect(
      validateOpponentProfile(
        withField("notes", { value: long, status: "confermato", declaredAt: "2026-08-20" }),
      ).ok,
    ).toBe(false);
    const atLimit = "x".repeat(NOTES_MAX_LENGTH);
    expect(
      validateOpponentProfile(
        withField("notes", { value: atLimit, status: "confermato", declaredAt: "2026-08-20" }),
      ).ok,
    ).toBe(true);
  });

  it("bounds how many labels a list field may carry", () => {
    const many = Array.from({ length: LABEL_LIST_MAX + 1 }, (_, i) => `Club ${i}`);
    expect(
      validateOpponentProfile(
        withField("affinityClubs", { value: many, status: "confermato", declaredAt: "2026-08-20" }),
      ).ok,
    ).toBe(false);
  });

  it("rejects an empty or whitespace-only label", () => {
    expect(
      validateOpponentProfile(
        withField("affinityClubs", { value: ["   "], status: "confermato", declaredAt: "2026-08-20" }),
      ).ok,
    ).toBe(false);
  });
});

describe("opponentProfileStoreSchema", () => {
  it("accepts a store of distinct people", () => {
    const result = validateOpponentProfileStore({
      schemaVersion: 1,
      profiles: [CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.store.profiles).toHaveLength(2);
  });

  it("refuses two profiles for the same person", () => {
    const result = validateOpponentProfileStore({
      schemaVersion: 1,
      profiles: [CONFIRMED_PROFILE, { ...CONFIRMED_PROFILE, interviewId: "seconda" }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown key on the envelope", () => {
    expect(
      opponentProfileStoreSchema.safeParse({ schemaVersion: 1, profiles: [], exportedAt: "oggi" })
        .success,
    ).toBe(false);
  });

  it("accepts an empty store", () => {
    expect(validateOpponentProfileStore({ schemaVersion: 1, profiles: [] }).ok).toBe(true);
  });
});

describe("profileLogSummary — safe by construction", () => {
  it("counts declared and confirmed fields without echoing any of them", () => {
    const summary = profileLogSummary(CONFIRMED_PROFILE);
    expect(summary.schemaVersion).toBe(1);
    expect(summary.declaredFieldCount).toBe(6);
    expect(summary.confirmedFieldCount).toBe(6);
    expect(summary.fieldsPresent).toEqual([
      "affinityClubs",
      "notes",
      "recurringTargets",
      "spendingTiming",
      "tiltSusceptibility",
      "weaknesses",
    ]);
  });

  it("separates confirmed from merely proposed", () => {
    const summary = profileLogSummary(PARTIALLY_CONFIRMED_PROFILE);
    expect(summary.declaredFieldCount).toBe(3);
    expect(summary.confirmedFieldCount).toBe(1);
  });

  it("contains no note text, no label and no personId", () => {
    const serialized = JSON.stringify(profileLogSummary(CONFIRMED_PROFILE));
    expect(serialized).not.toContain("Nota sintetica");
    expect(serialized).not.toContain("Club Sintetico A");
    expect(serialized).not.toContain("Giocatore Sintetico 1");
    expect(serialized).not.toContain(SYNTHETIC_PERSON_IDS.ataturk);
    expect(serialized).not.toContain("presto");
  });
});
