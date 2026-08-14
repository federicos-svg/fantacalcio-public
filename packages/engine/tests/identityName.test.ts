import { describe, it, expect } from "vitest";
import { normalizeIdentityName } from "../src/identityName.js";

// PURE, in-memory, fixture-only. All names below are synthetic, chosen only
// to exercise normalization rules (accents, apostrophes, dashes, suffixes,
// whitespace) — never real player/team data. Locks the `normalized_name`
// form described in VALIDATION_IDENTITY_CONTRACT.md and
// schemas/fantacalcio_identity_candidate.schema.json. This is normalization
// only: no identity matching, no candidates, no canonical ids here.

describe("normalizeIdentityName", () => {
  it("lowercases a plain name", () => {
    expect(normalizeIdentityName("Rossi")).toBe("rossi");
    expect(normalizeIdentityName("ROSSI")).toBe("rossi");
  });

  it("is case-insensitive end to end (same output regardless of input case)", () => {
    expect(normalizeIdentityName("Mario Rossi")).toBe(normalizeIdentityName("MARIO ROSSI"));
    expect(normalizeIdentityName("Mario Rossi")).toBe(normalizeIdentityName("mario rossi"));
  });

  it("trims leading/trailing whitespace and collapses internal runs", () => {
    expect(normalizeIdentityName("  Mario   Rossi  ")).toBe("mario rossi");
    expect(normalizeIdentityName("Mario\tRossi\n")).toBe("mario rossi");
  });

  it("converts common accented letters to ascii", () => {
    expect(normalizeIdentityName("José")).toBe("jose");
    expect(normalizeIdentityName("Müller")).toBe("muller");
    expect(normalizeIdentityName("François")).toBe("francois");
    expect(normalizeIdentityName("Álvarez")).toBe("alvarez");
    expect(normalizeIdentityName("Niño")).toBe("nino");
  });

  it("keeps apostrophes as meaningful name characters", () => {
    expect(normalizeIdentityName("O'Brien")).toBe("o'brien");
    expect(normalizeIdentityName("N'Golo")).toBe("n'golo");
  });

  it("canonicalizes apostrophe look-alikes to a straight apostrophe", () => {
    expect(normalizeIdentityName("O’Brien")).toBe("o'brien"); // curly apostrophe
    expect(normalizeIdentityName("O‘Brien")).toBe("o'brien"); // reversed curly apostrophe
    expect(normalizeIdentityName("O´Brien")).toBe("o'brien"); // acute accent used as apostrophe
  });

  it("keeps hyphens for double-barrelled names", () => {
    expect(normalizeIdentityName("Sarr-Diallo")).toBe("sarr-diallo");
  });

  it("canonicalizes en/em dash look-alikes to a plain hyphen", () => {
    expect(normalizeIdentityName("Sarr–Diallo")).toBe("sarr-diallo"); // en dash
    expect(normalizeIdentityName("Sarr—Diallo")).toBe("sarr-diallo"); // em dash
  });

  it("handles Jr/Sr suffixes by lowercasing and stripping trailing punctuation", () => {
    expect(normalizeIdentityName("Rossi Jr.")).toBe("rossi jr");
    expect(normalizeIdentityName("Rossi Sr.")).toBe("rossi sr");
  });

  it("handles double surnames with lowercase particles", () => {
    expect(normalizeIdentityName("De Ketelaere")).toBe("de ketelaere");
    expect(normalizeIdentityName("Di Lorenzo")).toBe("di lorenzo");
    expect(normalizeIdentityName("Van Basten")).toBe("van basten");
  });

  it("strips reasonable special-character noise (periods, commas, parentheses)", () => {
    expect(normalizeIdentityName("Rossi, Mario")).toBe("rossi mario");
    expect(normalizeIdentityName("Rossi (P)")).toBe("rossi p");
  });

  it("normalizes empty or whitespace-only input to an empty string, explicitly", () => {
    expect(normalizeIdentityName("")).toBe("");
    expect(normalizeIdentityName("   ")).toBe("");
    expect(normalizeIdentityName("\t\n")).toBe("");
  });

  it("is deterministic — same input always yields the same output", () => {
    const name = "François O'Brien-Müller Jr.";
    expect(normalizeIdentityName(name)).toBe(normalizeIdentityName(name));
  });

  it("is idempotent — normalizing an already-normalized name returns it unchanged", () => {
    const once = normalizeIdentityName("François O'Brien-Müller Jr.");
    expect(normalizeIdentityName(once)).toBe(once);
  });
});
