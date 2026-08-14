import { describe, it, expect } from "vitest";
import {
  FREE_TEXT_WARNING_LENGTH,
  canonicalizeListoneId,
  isValidIsoDate,
  validateEnrichmentRow,
} from "../src/fieldValidation.js";
import type { Cell, ManualEnrichmentOptions } from "../src/types.js";

// All fixtures below are synthetic — no real player/team/source names anywhere.
// A synthetic allowlist, not a real registered source — this test never
// asserts anything about which sources are actually registered in
// docs/DECISIONS.md, only that the allowlist mechanism itself works.
const OPTIONS: ManualEnrichmentOptions = { allowedSources: new Set(["synthetic_source_a"]) };

function baseRow(): Map<string, Cell> {
  return new Map<string, Cell>([
    ["listone_id", 101],
    ["nome", "Synth Testman"],
    ["ruolo", "A"],
    ["squadra_attuale", "Synthopoli"],
    ["titolarita_prevista", "titolare"],
    ["injury_flag", "nessuno"],
    ["source", "synthetic_source_a"],
    ["source_method", "manual_file"],
    ["confidence", "alta"],
    ["updated_at", "2026-07-10"],
  ]);
}

describe("isValidIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isValidIsoDate("2026-07-10")).toBe(true);
  });
  it("rejects a wrong-shaped string", () => {
    expect(isValidIsoDate("10/07/2026")).toBe(false);
  });
  it("rejects a non-existent calendar date (Feb 30)", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});

describe("canonicalizeListoneId", () => {
  it("accepts a non-negative integer number", () => {
    expect(canonicalizeListoneId(101)).toBe("101");
  });
  it("accepts a numeric string, stripping leading zeros", () => {
    expect(canonicalizeListoneId("00101")).toBe("101");
  });
  it("rejects a negative number", () => {
    expect(canonicalizeListoneId(-1)).toBeNull();
  });
  it("rejects a non-integer number", () => {
    expect(canonicalizeListoneId(1.5)).toBeNull();
  });
  it("rejects a non-numeric string", () => {
    expect(canonicalizeListoneId("abc")).toBeNull();
  });
  it("rejects null", () => {
    expect(canonicalizeListoneId(null)).toBeNull();
  });

  it("accepts zero", () => {
    expect(canonicalizeListoneId(0)).toBe("0");
  });

  it("accepts Number.MAX_SAFE_INTEGER exactly", () => {
    expect(canonicalizeListoneId(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("rejects a number cell beyond Number.MAX_SAFE_INTEGER, never silently rounding it", () => {
    expect(canonicalizeListoneId(Number.MAX_SAFE_INTEGER + 2)).toBeNull();
  });

  it("rejects an enormous numeric string that would lose precision, never coercing it to a different id", () => {
    // 20 nines: parses to a float far beyond MAX_SAFE_INTEGER, never Infinity either way — both must be rejected.
    expect(canonicalizeListoneId("99999999999999999999")).toBeNull();
  });

  it("accepts a numeric string at exactly Number.MAX_SAFE_INTEGER with leading zeros, stripping them", () => {
    expect(canonicalizeListoneId(`00${Number.MAX_SAFE_INTEGER}`)).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it("rejects a decimal string", () => {
    expect(canonicalizeListoneId("1.5")).toBeNull();
  });
});

describe("validateEnrichmentRow — profilo minimo v1 completo e valido", () => {
  it("produces a record with no issues", () => {
    const { record, issues } = validateEnrichmentRow(baseRow(), OPTIONS);
    expect(issues).toEqual([]);
    expect(record).toMatchObject({
      listoneId: "101",
      nome: "Synth Testman",
      ruolo: "A",
      squadraAttuale: "Synthopoli",
      titolaritaPrevista: "titolare",
      injuryFlag: "nessuno",
      source: "synthetic_source_a",
      sourceMethod: "manual_file",
      confidence: "alta",
      updatedAt: "2026-07-10",
    });
  });
});

describe("validateEnrichmentRow — campi obbligatori mancanti", () => {
  it("record is null when an identity-critical field is missing (nome)", () => {
    const row = baseRow();
    row.delete("nome");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "missing_field" && i.field === "nome" && i.blocking)).toBe(true);
  });

  it("record is null when a non-identity mandatory field is missing (source) — never a partial record", () => {
    const row = baseRow();
    row.delete("source");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "missing_field" && i.field === "source" && i.blocking)).toBe(true);
  });
});

describe("validateEnrichmentRow — nessun valore inventato per campi obbligatori invalidi", () => {
  // Every mandatory field must independently make `record` null when
  // invalid/missing — a fabricated placeholder ("ignoto"/""/"bassa") must
  // never be exposed for a field that actually failed validation.
  it.each([
    ["ruolo", "X"],
    ["titolarita_prevista", "sicuro"],
    ["injury_flag", "malato"],
    ["confidence", "altissima"],
    ["source_method", "automatic_scrape"],
    ["updated_at", "not-a-date"],
  ])("record:null when %s is invalid (%s)", (field, badValue) => {
    const row = baseRow();
    row.set(field, badValue);
    const { record } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
  });
});

describe("validateEnrichmentRow — enum validi/non validi", () => {
  it.each(["P", "D", "C", "A"])("accepts role %s", (role) => {
    const row = baseRow();
    row.set("ruolo", role);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_role")).toBe(false);
  });

  it("rejects an unknown role", () => {
    const row = baseRow();
    row.set("ruolo", "X");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_role" && i.blocking)).toBe(true);
  });

  it.each(["titolare", "ballottaggio", "riserva", "ignoto"])("accepts titolarita_prevista %s", (v) => {
    const row = baseRow();
    row.set("titolarita_prevista", v);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_titolarita_prevista")).toBe(false);
  });

  it("rejects an unknown titolarita_prevista", () => {
    const row = baseRow();
    row.set("titolarita_prevista", "sicuro");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_titolarita_prevista" && i.blocking)).toBe(true);
  });

  it.each(["nessuno", "dubbio", "indisponibile", "ignoto"])("accepts injury_flag %s", (v) => {
    const row = baseRow();
    row.set("injury_flag", v);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_injury_flag")).toBe(false);
  });

  it("rejects an unknown injury_flag", () => {
    const row = baseRow();
    row.set("injury_flag", "malato");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_injury_flag" && i.blocking)).toBe(true);
  });

  it.each(["alta", "media", "bassa"])("accepts confidence %s", (v) => {
    const row = baseRow();
    row.set("confidence", v);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_confidence")).toBe(false);
  });

  it("rejects an unknown confidence", () => {
    const row = baseRow();
    row.set("confidence", "altissima");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_confidence" && i.blocking)).toBe(true);
  });

  it("requires source_method to be exactly manual_file", () => {
    const row = baseRow();
    row.set("source_method", "automatic_scrape");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_source_method" && i.blocking)).toBe(true);
  });
});

describe("validateEnrichmentRow — source deve corrispondere a un allowedSources fornito dal chiamante", () => {
  it("an allowed source produces no issue", () => {
    const { issues } = validateEnrichmentRow(baseRow(), OPTIONS);
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(false);
  });

  it("a source not in allowedSources -> record:null, invalid, unregistered_source issue", () => {
    const row = baseRow();
    row.set("source", "synthetic_source_b");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "unregistered_source" && i.field === "source" && i.blocking)).toBe(true);
  });

  it("a typo'd source (near-miss of an allowed one) is rejected, never fuzzy-corrected", () => {
    const row = baseRow();
    row.set("source", "synthetic_sourc_a"); // missing an 'e' vs. the allowed "synthetic_source_a"
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(true);
  });

  it("a case-different source is rejected, never auto-corrected to match", () => {
    const row = baseRow();
    row.set("source", "Synthetic_Source_A");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(true);
  });

  it("a source with leading/trailing whitespace is rejected, never trimmed-then-accepted", () => {
    const row = baseRow();
    row.set("source", " synthetic_source_a ");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(true);
  });

  it("an empty allowedSources rejects every source, never a silent default-allow", () => {
    const row = baseRow();
    const { record, issues } = validateEnrichmentRow(row, { allowedSources: new Set() });
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(true);
  });

  it("the unregistered_source issue never interpolates the offending source value", () => {
    const row = baseRow();
    row.set("source", "a-very-distinctive-unregistered-source-value-zzqx");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain("a-very-distinctive-unregistered-source-value-zzqx");
  });

  it("empty source produces missing_field, not unregistered_source (no double-reporting)", () => {
    const row = baseRow();
    row.delete("source");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "missing_field" && i.field === "source")).toBe(true);
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(false);
  });
});

describe("validateEnrichmentRow — celle numeriche mai coercite silenziosamente in campi stringa", () => {
  it("a numeric cell in nome -> invalid_cell_type, record:null, never coerced to a string name", () => {
    const row = baseRow();
    row.set("nome", 12345);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_cell_type" && i.field === "nome" && i.blocking)).toBe(true);
  });

  it("a numeric cell in squadra_attuale -> invalid_cell_type, record:null", () => {
    const row = baseRow();
    row.set("squadra_attuale", 42);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_cell_type" && i.field === "squadra_attuale" && i.blocking)).toBe(
      true,
    );
  });

  it("a numeric cell in source -> invalid_cell_type, record:null, never checked against the allowlist", () => {
    const row = baseRow();
    row.set("source", 7);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_cell_type" && i.field === "source" && i.blocking)).toBe(true);
    expect(issues.some((i) => i.code === "unregistered_source")).toBe(false);
  });

  it("a numeric cell in ruolo -> invalid_role (reused code), record:null", () => {
    const row = baseRow();
    row.set("ruolo", 1);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_role" && i.blocking)).toBe(true);
  });

  it("a numeric cell in titolarita_prevista -> invalid_titolarita_prevista, record:null", () => {
    const row = baseRow();
    row.set("titolarita_prevista", 1);
    const { record } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
  });

  it("a numeric cell in updated_at -> invalid_updated_at, record:null (never stringified into a fake date)", () => {
    const row = baseRow();
    row.set("updated_at", 20260710);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_updated_at" && i.blocking)).toBe(true);
  });

  it("a numeric cell in the optional ballottaggio -> non-blocking invalid_cell_type, field omitted from record", () => {
    const row = baseRow();
    row.set("ballottaggio", 99);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).not.toBeNull();
    expect(record?.ballottaggio).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_cell_type" && i.field === "ballottaggio" && !i.blocking)).toBe(
      true,
    );
  });

  it("a numeric cell in the optional data_nascita -> non-blocking issue, field omitted", () => {
    const row = baseRow();
    row.set("data_nascita", 19950412);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).not.toBeNull();
    expect(record?.dataNascita).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_updated_at" && i.field === "data_nascita" && !i.blocking)).toBe(
      true,
    );
  });
});

describe("validateEnrichmentRow — confronto esatto, nessuna correzione di whitespace sui campi canonici", () => {
  it("ruolo with stray leading whitespace is rejected, never trimmed-then-accepted", () => {
    const row = baseRow();
    row.set("ruolo", " A");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_role")).toBe(true);
  });

  it("titolarita_prevista with stray trailing whitespace is rejected", () => {
    const row = baseRow();
    row.set("titolarita_prevista", "titolare ");
    const { record } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
  });

  it("confidence with stray whitespace is rejected", () => {
    const row = baseRow();
    row.set("confidence", " alta");
    const { record } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
  });

  it("source_method with stray whitespace is rejected", () => {
    const row = baseRow();
    row.set("source_method", "manual_file ");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_source_method")).toBe(true);
  });

  it("updated_at with stray whitespace is rejected (the ISO regex anchors the whole string)", () => {
    const row = baseRow();
    row.set("updated_at", " 2026-07-10");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_updated_at")).toBe(true);
  });

  it("booleans remain deliberately more lenient: incidental whitespace is still tolerated", () => {
    const row = baseRow();
    row.set("rigorista", " true ");
    const { issues, record } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_boolean")).toBe(false);
    expect(record?.rigorista).toBe(true);
  });

  it("nome/squadra_attuale/ballottaggio are still trimmed (documented, intentional — genuine free text)", () => {
    const row = baseRow();
    row.set("nome", "  Synth Testman  ");
    row.set("squadra_attuale", "  Synthopoli  ");
    row.set("ballottaggio", "  Synth Rival  ");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.nome).toBe("Synth Testman");
    expect(record?.squadraAttuale).toBe("Synthopoli");
    expect(record?.ballottaggio).toBe("Synth Rival");
    expect(issues).toEqual([]);
  });
});

describe("validateEnrichmentRow — eta e gerarchia_portiere: interi sicuri, mai Infinity/imprecisi", () => {
  it("eta accepts Number.MAX_SAFE_INTEGER exactly (number cell)", () => {
    const row = baseRow();
    row.set("eta", Number.MAX_SAFE_INTEGER);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBe(Number.MAX_SAFE_INTEGER);
    expect(issues.some((i) => i.code === "invalid_integer")).toBe(false);
  });

  it("eta rejects a number cell beyond Number.MAX_SAFE_INTEGER, never storing an imprecise value", () => {
    const row = baseRow();
    row.set("eta", Number.MAX_SAFE_INTEGER + 2);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "eta" && !i.blocking)).toBe(true);
    expect(JSON.stringify(record)).not.toContain("Infinity");
  });

  it("eta rejects an enormous digit string, never Infinity in the record", () => {
    const row = baseRow();
    row.set("eta", "99999999999999999999");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "eta")).toBe(true);
    expect(JSON.stringify(record)).not.toContain("Infinity");
  });

  it("eta accepts zero", () => {
    const row = baseRow();
    row.set("eta", 0);
    const { record } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBe(0);
  });

  it("eta rejects a negative number", () => {
    const row = baseRow();
    row.set("eta", -1);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "eta")).toBe(true);
  });

  it("eta rejects a decimal", () => {
    const row = baseRow();
    row.set("eta", 30.5);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.eta).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "eta")).toBe(true);
  });

  it("gerarchia_portiere accepts Number.MAX_SAFE_INTEGER exactly (role P)", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", Number.MAX_SAFE_INTEGER);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.gerarchiaPortiere).toBe(Number.MAX_SAFE_INTEGER);
    expect(issues.some((i) => i.code === "invalid_integer")).toBe(false);
  });

  it("gerarchia_portiere rejects a number cell beyond Number.MAX_SAFE_INTEGER", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", Number.MAX_SAFE_INTEGER + 2);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.gerarchiaPortiere).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "gerarchia_portiere")).toBe(true);
    expect(JSON.stringify(record)).not.toContain("Infinity");
  });

  it("gerarchia_portiere rejects an enormous digit string", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", "99999999999999999999");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.gerarchiaPortiere).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "gerarchia_portiere")).toBe(true);
  });

  it("gerarchia_portiere rejects zero (must be strictly positive)", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", 0);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.gerarchiaPortiere).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "gerarchia_portiere")).toBe(true);
  });

  it("gerarchia_portiere rejects a decimal", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", 1.5);
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record?.gerarchiaPortiere).toBeUndefined();
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "gerarchia_portiere")).toBe(true);
  });
});

describe("validateEnrichmentRow — updated_at", () => {
  it("accepts a valid ISO date", () => {
    const { issues } = validateEnrichmentRow(baseRow(), OPTIONS);
    expect(issues.some((i) => i.code === "invalid_updated_at")).toBe(false);
  });
  it("rejects an invalid ISO date", () => {
    const row = baseRow();
    row.set("updated_at", "not-a-date");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_updated_at" && i.blocking)).toBe(true);
  });
});

describe("validateEnrichmentRow — listone_id", () => {
  it("rejects a non-numeric listone_id", () => {
    const row = baseRow();
    row.set("listone_id", "abc");
    const { record, issues } = validateEnrichmentRow(row, OPTIONS);
    expect(record).toBeNull();
    expect(issues.some((i) => i.code === "invalid_listone_id" && i.blocking)).toBe(true);
  });
});

describe("validateEnrichmentRow — booleani opzionali", () => {
  it.each(["true", "TRUE", "false", "FALSE"])("accepts canonical boolean string %s", (v) => {
    const row = baseRow();
    row.set("trasferito_si_no", v);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_boolean")).toBe(false);
  });

  it("rejects a non-canonical boolean string", () => {
    const row = baseRow();
    row.set("rigorista", "si");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_boolean" && i.field === "rigorista" && !i.blocking)).toBe(true);
  });

  it("optional booleans are simply absent when the cell is blank — no issue", () => {
    const { issues } = validateEnrichmentRow(baseRow(), OPTIONS);
    expect(issues.some((i) => i.field === "piazzati")).toBe(false);
  });
});

describe("validateEnrichmentRow — coerenza campi opzionali", () => {
  it("flags both data_nascita and eta present as a non-blocking coherence issue", () => {
    const row = baseRow();
    row.set("data_nascita", "1995-04-12");
    row.set("eta", 30);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "both_data_nascita_and_eta_present" && !i.blocking)).toBe(true);
  });

  it("accepts only eta with no issue", () => {
    const row = baseRow();
    row.set("eta", 30);
    const { issues, record } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "both_data_nascita_and_eta_present")).toBe(false);
    expect(record?.eta).toBe(30);
  });
});

describe("validateEnrichmentRow — gerarchia_portiere", () => {
  it("no issue when present for role P", () => {
    const row = baseRow();
    row.set("ruolo", "P");
    row.set("gerarchia_portiere", 1);
    const { issues, record } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "gerarchia_portiere_role_mismatch")).toBe(false);
    expect(record?.gerarchiaPortiere).toBe(1);
  });

  it("flags a non-blocking mismatch when present for a non-P role", () => {
    const row = baseRow();
    row.set("ruolo", "A");
    row.set("gerarchia_portiere", 1);
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "gerarchia_portiere_role_mismatch" && !i.blocking)).toBe(true);
  });

  it("rejects a non-positive-integer value as a non-blocking issue", () => {
    const row = baseRow();
    row.set("gerarchia_portiere", "abc");
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "invalid_integer" && i.field === "gerarchia_portiere" && !i.blocking)).toBe(
      true,
    );
  });
});

describe("validateEnrichmentRow — testo libero troppo lungo (limite strutturale)", () => {
  it("flags a nome longer than the threshold as a non-blocking warning, never invents/truncates it", () => {
    const row = baseRow();
    const long = "x".repeat(FREE_TEXT_WARNING_LENGTH + 1);
    row.set("nome", long);
    const { issues, record } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "free_text_too_long" && i.field === "nome" && !i.blocking)).toBe(true);
    expect(record?.nome).toBe(long);
  });

  it("does not flag a nome at exactly the threshold", () => {
    const row = baseRow();
    row.set("nome", "x".repeat(FREE_TEXT_WARNING_LENGTH));
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "free_text_too_long")).toBe(false);
  });

  it("flags an overlong ballottaggio (never copy of an editorial scheda)", () => {
    const row = baseRow();
    row.set("ballottaggio", "x".repeat(FREE_TEXT_WARNING_LENGTH + 20));
    const { issues } = validateEnrichmentRow(row, OPTIONS);
    expect(issues.some((i) => i.code === "free_text_too_long" && i.field === "ballottaggio")).toBe(true);
  });
});

describe("validateEnrichmentRow — determinismo", () => {
  it("same input always yields the same output", () => {
    const row = baseRow();
    const first = validateEnrichmentRow(row, OPTIONS);
    const second = validateEnrichmentRow(row, OPTIONS);
    expect(first).toEqual(second);
  });
});

describe("validateEnrichmentRow — nessuna canonicalizzazione", () => {
  it("never carries canonical_player_id/canonical_team_id in any casing", () => {
    const { record } = validateEnrichmentRow(baseRow(), OPTIONS);
    const serialized = JSON.stringify(record).toLowerCase();
    expect(serialized).not.toContain("canonical_player_id");
    expect(serialized).not.toContain("canonical_team_id");
    expect(serialized).not.toContain("canonicalplayerid");
    expect(serialized).not.toContain("canonicalteamid");
  });
});
