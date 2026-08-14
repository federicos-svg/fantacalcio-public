import { describe, it, expect } from "vitest";
import { normalizeVoteXlsxBytes } from "../src/normalizeVoteXlsx.js";
import { WorkbookError } from "../../engine/src/workbook.js";
import { buildXlsxBytes, teamBlock, playerRow, TITLE_ROW, type TestCell } from "../fixtures/testWorkbookBuilder.js";

const SELECTION = { season: "2024_25", matchday: 38 };

describe("normalizeVoteXlsxBytes", () => {
  it("uses Redazione Italia as the authoritative default in a multi-sheet workbook", async () => {
    const rows: (readonly TestCell[])[] = [
      TITLE_ROW,
      ...teamBlock("Atalanta", [
        playerRow(4431, "P", "Carnesecchi", 7),
        playerRow(697, "D", "Cuadrado", 6),
        playerRow(2077, "C", "Pasalic", "6*"),
        playerRow(4730, "A", "Lookman", 5.5),
        playerRow(684, "ALL", "Gasperini", 5.5),
      ]),
      ...teamBlock("Bologna", [
        playerRow(2722, "P", "Ravaglia", 5.5),
        playerRow(357, "D", "Calabria", 6),
        playerRow(788, "C", "Freuler", 5),
        playerRow(4436, "A", "Cambiaghi", 6),
        playerRow(4993, "ALL", "Italiano", 5),
      ]),
    ];
    const bytes = await buildXlsxBytes([
      { name: "Fantacalcio", rows: [["diagnostic sheet — not authoritative"]] },
      { name: "Statistico", rows: [["diagnostic sheet — not authoritative"]] },
      { name: "Italia", rows },
    ]);

    const manifest = await normalizeVoteXlsxBytes(bytes, SELECTION);

    expect(manifest.sheetNames).toEqual(["Fantacalcio", "Statistico", "Italia"]);
    expect(manifest.sheetUsed).toBe("Italia");
    expect(manifest.pipeline.status).not.toBe("invalid");
    expect(manifest.pipeline.counts.playerRecords).toBe(8); // 10 total rows - 2 ALL rows
    expect(manifest.pipeline.counts.parsedRecords).toBe(10);
    expect(manifest.data_promoted_eligible).toBe(false);
  });

  it("runs end to end on an Italia sheet shaped like the real file: title/team rows merged across all 13 columns", async () => {
    const rows: (readonly TestCell[])[] = [
      TITLE_ROW,
      ["Atalanta"],
      ["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"],
      playerRow(4431, "P", "Carnesecchi", 7),
      playerRow(684, "ALL", "Gasperini", 5.5),
    ];
    const bytes = await buildXlsxBytes([
      {
        name: "Italia",
        rows,
        merges: [
          [1, 1, 1, 13],
          [2, 1, 2, 13],
        ],
      },
    ]);

    const manifest = await normalizeVoteXlsxBytes(bytes, SELECTION);

    expect(manifest.sheetUsed).toBe("Italia");
    expect(manifest.pipeline.status).not.toBe("invalid");
    expect(manifest.pipeline.counts.parsedRecords).toBe(2);
    expect(manifest.pipeline.counts.playerRecords).toBe(1);
  });

  it("fails clearly with WorkbookError when the authoritative 'Italia' sheet is missing", async () => {
    const bytes = await buildXlsxBytes([
      { name: "Fantacalcio", rows: [TITLE_ROW, ...teamBlock("Atalanta", [playerRow(1, "P", "Test", 6)])] },
      { name: "Statistico", rows: [["x"]] },
    ]);
    await expect(normalizeVoteXlsxBytes(bytes, SELECTION)).rejects.toThrow(WorkbookError);
  });

  it("does not silently fall back to Fantacalcio when Italia is absent", async () => {
    const bytes = await buildXlsxBytes([
      { name: "Fantacalcio", rows: [TITLE_ROW, ...teamBlock("Atalanta", [playerRow(1, "P", "Test", 6)])] },
    ]);
    await expect(normalizeVoteXlsxBytes(bytes, SELECTION)).rejects.toThrow("Sheet 'Italia' not found");
  });

  it("surfaces an ambiguous/near-match header in Italia as an invalid pipeline result, not a thrown error", async () => {
    const nearHeader = ["Cod.", "Ruolo", "Nome"];
    const bytes = await buildXlsxBytes([
      { name: "Italia", rows: [TITLE_ROW, ["Atalanta"], nearHeader, [1, "P", "Test"]] },
    ]);
    const manifest = await normalizeVoteXlsxBytes(bytes, SELECTION);
    expect(manifest.pipeline.status).toBe("invalid");
    expect(manifest.pipeline.failedStage).toBe("normalize");
    expect(manifest.data_promoted_eligible).toBe(false);
  });

  it("allows an alternate sheet only when the caller explicitly selects it for diagnostics", async () => {
    const rows = [TITLE_ROW, ...teamBlock("Atalanta", [playerRow(1, "P", "Test", 6)])];
    const bytes = await buildXlsxBytes([
      { name: "Fantacalcio", rows },
      { name: "Italia", rows: [["not used in this explicit diagnostic"]] },
    ]);
    const manifest = await normalizeVoteXlsxBytes(bytes, { ...SELECTION, sheetName: "Fantacalcio" });
    expect(manifest.sheetUsed).toBe("Fantacalcio");
    expect(manifest.pipeline.status).not.toBe("invalid");
  });

  it("data_promoted_eligible is always false, even on a fully valid Italia dry-run", async () => {
    const bytes = await buildXlsxBytes([
      { name: "Italia", rows: [TITLE_ROW, ...teamBlock("Atalanta", [playerRow(1, "P", "Test", 6)])] },
    ]);
    const manifest = await normalizeVoteXlsxBytes(bytes, SELECTION);
    expect(manifest.data_promoted_eligible).toBe(false);
    expect(manifest.pipeline.data_promoted_eligible).toBe(false);
    expect(manifest.pipeline.canonical_promoted).toBe(false);
  });
});
