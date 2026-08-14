// Adapter package entry point. Kept SEPARATE from packages/engine/src/index.ts
// on purpose: this package depends on `exceljs` to decode real XLSX bytes,
// while packages/engine stays dependency-free per every data contract in this
// repo. Nothing here is imported by the browser app (src/); it exists for the
// operational CLI (scripts/normalize-vote-xlsx.ts) and its own tests.

export * from "./xlsxWorkbookAdapter.js";
export * from "./normalizeVoteXlsx.js";
export * from "./bulkRevalidationReport.js";
export * from "./listoneWorkbook.js";
export * from "./listoneCandidate.js";
export * from "./listoneLiveBundle.js";
export * from "./parseListoneXlsx.js";
