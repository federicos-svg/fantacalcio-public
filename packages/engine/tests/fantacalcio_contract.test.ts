import { describe, it, expect } from "vitest";
import { z } from "zod";

const voteRecord = z.object({
  source_id: z.literal("fantacalcio_xlsx"),
  vote_source: z.literal("italia"),
  season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/),
  matchday: z.number().int().min(1).max(38),
  external_id: z.number().int(),
  canonical_player_id: z.string().nullable().optional(),
  team: z.string().min(1),
  role: z.enum(["P", "D", "C", "A", "ALL"]),
  name: z.string().min(1),
  voto_raw: z.union([z.number(), z.string()]),
  voto_base: z.number().nullable(),
  is_asterisk: z.boolean(),
  is_sv: z.boolean(),
  is_blank: z.boolean(),
  is_real_performance: z.boolean(),
}).strict();

const manifest = z.object({
  source_id: z.literal("fantacalcio_xlsx"),
  vote_source: z.literal("italia"),
  season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/),
  matchday: z.number().int().min(1).max(38),
  raw_filename: z.string().min(1),
  raw_hash: z.string().regex(/^[a-f0-9]{64}$/),
  normalized_filename: z.string().min(1),
  normalized_hash: z.string().regex(/^[a-f0-9]{64}$/),
  transform_version: z.string().min(1),
  source_license: z.literal("proprietary_personal_use"),
  storage_allowed: z.literal("private_drive_only"),
  derived_use_allowed: z.literal("personal_only"),
  automation_allowed: z.literal("private_orchestrated_only"),
  redistribution_allowed: z.literal(false),
  drive_root_folder_id: z.string().min(1),
  raw_drive_folder_id: z.string().min(1),
  normalized_drive_folder_id: z.string().min(1),
  drive_visibility: z.literal("private"),
  shared_link_enabled: z.literal(false),
  auth_secret_ref: z.string().min(1),
  retrieved_at: z.string().min(1),
}).strict();

const base = {
  source_id: "fantacalcio_xlsx" as const,
  vote_source: "italia" as const,
  season: "2024_25",
  matchday: 38,
  team: "TeamSynthetic",
};

describe("FantacalcioVoteRecord — Redazione Italia synthetic fixtures", () => {
  it("numeric vote → real performance", () => {
    const r = { ...base, external_id: 1001, role: "D", name: "Synthetic D1", voto_raw: 6.5, voto_base: 6.5, is_asterisk: false, is_sv: false, is_blank: false, is_real_performance: true };
    expect(voteRecord.parse(r).voto_base).toBe(6.5);
  });
  it("asterisk 6* → voto_base 6, not real performance", () => {
    const r = { ...base, external_id: 1002, role: "C", name: "Synthetic C1", voto_raw: "6*", voto_base: 6, is_asterisk: true, is_sv: false, is_blank: false, is_real_performance: false };
    expect(voteRecord.parse(r).voto_base).toBe(6);
  });
  it("SV and blank remain non-performance", () => {
    expect(voteRecord.parse({ ...base, external_id: 1003, role: "A", name: "Synthetic A1", voto_raw: "SV", voto_base: null, is_asterisk: false, is_sv: true, is_blank: false, is_real_performance: false }).is_sv).toBe(true);
    expect(voteRecord.parse({ ...base, external_id: 1004, role: "P", name: "Synthetic P1", voto_raw: "", voto_base: null, is_asterisk: false, is_sv: false, is_blank: true, is_real_performance: false }).is_blank).toBe(true);
  });
  it("ALL is accepted in raw record", () => {
    expect(voteRecord.parse({ ...base, external_id: 1005, role: "ALL", name: "Synthetic Coach", voto_raw: 5.5, voto_base: 5.5, is_asterisk: false, is_sv: false, is_blank: false, is_real_performance: true }).role).toBe("ALL");
  });
  it("rejects the former generic vote_source and unknown fields", () => {
    const valid = { ...base, external_id: 1, role: "D", name: "x", voto_raw: 6, voto_base: 6, is_asterisk: false, is_sv: false, is_blank: false, is_real_performance: true };
    expect(voteRecord.safeParse({ ...valid, vote_source: "fantacalcio" }).success).toBe(false);
    expect(voteRecord.safeParse({ ...valid, value: 99 }).success).toBe(false);
  });
});

describe("FantacalcioXlsxManifest — Redazione Italia", () => {
  const good = {
    source_id: "fantacalcio_xlsx", vote_source: "italia", season: "2024_25", matchday: 38,
    raw_filename: "Voti_Fantacalcio_Stagione_2024_25_Giornata_38.xlsx", raw_hash: "a".repeat(64),
    normalized_filename: "Voti_Italia_2024_25_G38.normalized.xlsx", normalized_hash: "b".repeat(64),
    transform_version: "v2-redazione-italia", source_license: "proprietary_personal_use", storage_allowed: "private_drive_only",
    derived_use_allowed: "personal_only", automation_allowed: "private_orchestrated_only", redistribution_allowed: false,
    drive_root_folder_id: "ENV:FANTACALCIO_DRIVE_ROOT_ID", raw_drive_folder_id: "ENV:FANTACALCIO_RAW_DRIVE_FOLDER_ID",
    normalized_drive_folder_id: "ENV:FANTACALCIO_NORMALIZED_DRIVE_FOLDER_ID", drive_visibility: "private",
    shared_link_enabled: false, auth_secret_ref: "n8n_credential:google_drive_oauth", retrieved_at: "2026-06-30T12:00:00Z",
  };
  it("validates a complete Italia manifest", () => expect(manifest.parse(good).vote_source).toBe("italia"));
  it("rejects the former vote source", () => expect(manifest.safeParse({ ...good, vote_source: "fantacalcio" }).success).toBe(false));
  it("retains storage/privacy constraints", () => {
    expect(manifest.safeParse({ ...good, storage_allowed: "local_only" }).success).toBe(false);
    expect(manifest.safeParse({ ...good, shared_link_enabled: true }).success).toBe(false);
    expect(manifest.safeParse({ ...good, redistribution_allowed: true }).success).toBe(false);
  });
});

const HEADER = ["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"];
function rowIsSafeToDelete(cells: ReadonlyArray<unknown>): boolean {
  const nonEmpty = cells.filter((c) => c !== null && c !== undefined && c !== "");
  if (nonEmpty.length === 0) return true;
  if (HEADER.every((h, i) => cells[i] === h)) return false;
  const role = cells[1];
  if (["P", "D", "C", "A", "ALL"].includes(String(role))) return false;
  if (nonEmpty.length === 1 && typeof cells[0] === "string" && !String(cells[0]).startsWith("Voti ")) return false;
  return false;
}

describe("safe-delete guardrail", () => {
  it("only permits blank padding among covered cases", () => {
    expect(rowIsSafeToDelete([])).toBe(true);
    expect(rowIsSafeToDelete(HEADER)).toBe(false);
    expect(rowIsSafeToDelete(["Atalanta"])).toBe(false);
    expect(rowIsSafeToDelete([4431, "P", "Synthetic GK", 7])).toBe(false);
  });
});
