// End-to-end pipeline orchestration + compact markdown report — PURE.
//
// Ties together dataset.ts (panel + features + anti-leakage),
// validation.ts (walk-forward folds + metrics), baselines.ts/models/*
// (candidates) and appealIndex.ts (component composition) into one report.
// Never touches any repo gate: every report carries explicit
// `*_promoted: false` / `connectedToLiveApp: false` fields instead of
// silently omitting the question.

import type { AnagraficaAgeIndex, FeatureRow, TargetName } from "./types.js";
import { TARGET_NAMES } from "./types.js";
import { buildPlayerSeasonPanel, buildFeatureRows, type SeasonRecords } from "./dataset.js";
import type { IdentityStabilityReport } from "./identityStability.js";
import {
  buildWalkForwardSplit,
  evaluateCandidateAcrossFolds,
  foldWinRate,
  bestByMae,
  type CandidateResult,
} from "./validation.js";
import { BASELINE_TRAINERS } from "./baselines.js";
import { ridgeRegressionTrainer } from "./models/ridgeRegression.js";
import { regressionTreeTrainer } from "./models/regressionTree.js";
import { knnRegressionTrainer } from "./models/knnRegression.js";
import { composeAppealIndexComponents, type AppealIndexComponents } from "./appealIndex.js";
import type { Trainer } from "./types.js";

// Fraction of folds a model must beat the best baseline on BOTH metrics at
// in the legacy diagnostic comparison. It does not select a champion.
// a coin-flip win rate is not "stable" per the task's own rule ("se un
// modello ML non batte le baseline in modo stabile, dichiaralo").
const MODEL_WIN_RATE_THRESHOLD = 0.6;

function candidateTrainers(): readonly Trainer[] {
  return [...BASELINE_TRAINERS, ridgeRegressionTrainer(), regressionTreeTrainer(), knnRegressionTrainer()];
}

export interface TargetReport {
  readonly target: TargetName;
  readonly nFolds: number;
  readonly results: readonly CandidateResult[];
  readonly bestBaselineName: string;
  readonly diagnosticComparatorName: string;
  readonly diagnosticComparatorIsBaseline: boolean;
  readonly diagnosticWinRateVsBestBaseline: number;
  readonly holdout: {
    readonly season: string | null;
    readonly diagnosticComparatorMetrics: null;
    readonly bestBaselineMetrics: null;
  };
}

export interface DatasetSummary {
  readonly nSeasons: number;
  readonly nPlayerSeasonRows: number;
  readonly nFeatureRows: number;
  readonly nFolds: number;
  readonly holdoutSeason: string | null;
}

export type AppealIndexDatasetProvenance = "synthetic_fixture" | "external_real" | "unknown";

export interface AppealIndexReport {
  readonly datasetProvenance: AppealIndexDatasetProvenance;
  readonly datasetSummary: DatasetSummary;
  readonly identity: IdentityStabilityReport;
  readonly perTarget: Readonly<Record<TargetName, TargetReport>>;
  readonly sampleComponents: readonly { readonly playerKey: string; readonly components: AppealIndexComponents }[];
  readonly limits: readonly string[];
  readonly gateStatus: {
    readonly dataPromoted: false;
    readonly canonicalPromoted: false;
    readonly decisionPromoted: false;
    readonly fairToMePromoted: false;
    readonly connectedToLiveApp: false;
  };
}

const COMMON_LIMITS: readonly string[] = [
  "Il join cross-stagione usa una playerKey locale a questo package, non canonical_player_id: non promuove alcuna identità.",
  "fantavoto calcolato con la tariffa dichiarata in FANTAVOTO_RULE_VERSION: include il malus Gs (solo portiere) e i rigori segnati Rf (+3, ogni ruolo). Resta una tariffa dei soli eventi individuali di §12: nessun modificatore di squadra (difesa, attacco) entra in questo numero.",
  "Il dataset esclude per costruzione i giocatori che escono dal pannello l'anno successivo (retrocessione, fine carriera, trasferimento fuori dai dati tracciati): il modello predice prestazione condizionata alla permanenza, non probabilità di permanenza.",
  "Feature di ruolo usano il ruolo osservato nell'ultima stagione storica come proxy del ruolo dichiarato pre-asta: una semplificazione, non lo stesso segnale di un listone stagionale reale (che qui non esiste per le stagioni storiche).",
  "Con poche stagioni disponibili le baseline (specialmente lo shrinkage verso la media di ruolo) sono un avversario molto difficile da battere in modo stabile — un esito 'baseline vince' è un risultato onesto, non un fallimento della pipeline.",
  "Nessun dato di età/infortuni/minutaggio: 'rischio' e 'continuità voto' restano euristiche dichiaratamente non validate via ML.",
];

function provenanceLimit(provenance: AppealIndexDatasetProvenance): string {
  switch (provenance) {
    case "synthetic_fixture":
      return "Dataset dichiarato dal chiamante come fixture sintetica; nessun dato reale è rappresentato da questa etichetta.";
    case "external_real":
      return "Dataset esterno/reale dichiarato dal chiamante; questa etichetta registra la provenienza dichiarata, non valida licenza, integrità o riproducibilità.";
    case "unknown":
      return "Provenienza del dataset non dichiarata o sconosciuta; il report non assume né dichiara che i dati siano reali.";
  }
}

function trainerFor(name: string, trainers: readonly Trainer[]): Trainer {
  const found = trainers.find((t) => t.name === name);
  if (!found) throw new Error(`trainerFor: no trainer named '${name}'`);
  return found;
}

function buildTargetReport(rows: readonly FeatureRow[], target: TargetName): TargetReport {
  const split = buildWalkForwardSplit(rows);
  if (split.folds.length === 0) {
    throw new Error(
      `buildTargetReport: no walk-forward folds available for target '${target}' — not enough distinct ` +
        "target seasons in this dataset (need at least minTrainTargetSeasons + 1 evaluable seasons).",
    );
  }

  const trainers = candidateTrainers();
  const results = trainers.map((t) => evaluateCandidateAcrossFolds(split.folds, t, target));
  const baselineNames = new Set(BASELINE_TRAINERS.map((t) => t.name));
  const baselineResults = results.filter((r) => baselineNames.has(r.modelName));
  const modelResults = results.filter((r) => !baselineNames.has(r.modelName));

  const bestBaseline = bestByMae(baselineResults);

  let diagnosticResult = bestBaseline;
  let diagnosticComparatorIsBaseline = true;
  let diagnosticWinRateVsBestBaseline = 0;
  for (const modelResult of modelResults) {
    const winRate = foldWinRate(modelResult, bestBaseline);
    if (winRate >= MODEL_WIN_RATE_THRESHOLD && winRate > diagnosticWinRateVsBestBaseline) {
      diagnosticResult = modelResult;
      diagnosticComparatorIsBaseline = false;
      diagnosticWinRateVsBestBaseline = winRate;
    }
  }

  // The legacy path has no audited descriptive-access API. It therefore
  // ignores the burned holdout and emits no holdout metrics.
  const holdout = {
    season: null,
    diagnosticComparatorMetrics: null,
    bestBaselineMetrics: null,
  } as const;

  return {
    target,
    nFolds: split.folds.length,
    results,
    bestBaselineName: bestBaseline.modelName,
    diagnosticComparatorName: diagnosticResult.modelName,
    diagnosticComparatorIsBaseline,
    diagnosticWinRateVsBestBaseline,
    holdout,
  };
}

export interface RunAppealIndexPipelineOptions {
  // Provenance is caller-supplied. Missing input is fail-closed as unknown;
  // the pipeline never infers real data from file names, CLI flags or rows.
  readonly datasetProvenance?: AppealIndexDatasetProvenance;
  // How many players to illustrate with composeAppealIndexComponents.
  // 0 (or any value <= 0) computes NO sample rows at all — the safe choice
  // for a real-data run, since each sample carries a real playerKey (see
  // renderAppealIndexReportMarkdown's includeSamples for the matching
  // render-time guard). Note Array.prototype.slice(-0) is equivalent to
  // slice(0) (the WHOLE array, because -0 === 0) — sampleSize<=0 is handled
  // explicitly below instead of relying on slice() to do the right thing.
  readonly sampleSize?: number;
  /**
   * Resolved ages for `ageAtSeasonStart` (@2.2.0), threaded straight through
   * to `buildFeatureRows`. Omitted leaves the feature `NaN` on every row, which
   * the complete-case comparators then drop — the pipeline reports that
   * honestly rather than imputing an age.
   */
  readonly anagrafica?: AnagraficaAgeIndex;
}

export function runAppealIndexPipeline(
  seasons: readonly SeasonRecords[],
  opts: RunAppealIndexPipelineOptions = {},
): AppealIndexReport {
  const datasetProvenance = opts.datasetProvenance ?? "unknown";
  const panel = buildPlayerSeasonPanel(seasons);
  const rows = buildFeatureRows(panel, { anagrafica: opts.anagrafica });
  if (rows.length === 0) {
    throw new Error("runAppealIndexPipeline: no supervised feature rows could be built from the given seasons");
  }

  const perTarget = {} as Record<TargetName, TargetReport>;
  for (const target of TARGET_NAMES) {
    perTarget[target] = buildTargetReport(rows, target);
  }

  // Illustrative component composition for a handful of the most recent
  // feature rows, using each target's passive diagnostic comparator on rows earlier
  // than that row's own target season (never later — same rule as any fold).
  const sampleSize = opts.sampleSize ?? 5;
  const fantamediaComparatorName = perTarget.fantamediaNext.diagnosticComparatorName;
  const presenzeComparatorName = perTarget.presenzeNext.diagnosticComparatorName;

  let sampleComponents: AppealIndexReport["sampleComponents"] = [];
  if (sampleSize > 0) {
    const trainers = candidateTrainers();
    // Only rows with at least one strictly-earlier target season in the
    // dataset can be illustrated without borrowing "future" rows as training
    // data for the demo — the same rule as any real fold.
    const illustrableRows = rows.filter(
      (row) =>
        row.targetSeason !== "2025_26" &&
        rows.some(
          (r) => r.targetSeason !== "2025_26" && r.targetSeason < row.targetSeason,
        ),
    );
    const sortedRows = [...illustrableRows].sort((a, b) => a.targetSeason.localeCompare(b.targetSeason));
    const sampleRows = sortedRows.slice(-sampleSize);

    sampleComponents = sampleRows.map((row) => {
      const trainRows = rows.filter(
        (r) => r.targetSeason !== "2025_26" && r.targetSeason < row.targetSeason,
      );
      const fantamediaPredictor = trainerFor(fantamediaComparatorName, trainers).fit(trainRows, "fantamediaNext");
      const presenzePredictor = trainerFor(presenzeComparatorName, trainers).fit(trainRows, "presenzeNext");
      const roleCohort = trainRows.filter((r) => r.role === row.role).map((r) => r.targets.fantamediaNext);
      const components = composeAppealIndexComponents({
        features: row.features,
        predictedFantamediaNext: fantamediaPredictor.predict(row.features),
        predictedPresenzeNext: presenzePredictor.predict(row.features),
        roleCohortFantamediaNext: roleCohort,
      });
      return { playerKey: row.playerKey, components };
    });
  }

  return {
    datasetProvenance,
    datasetSummary: {
      nSeasons: panel.orderedSeasons.length,
      nPlayerSeasonRows: panel.rows.length,
      nFeatureRows: rows.length,
      nFolds: perTarget.fantamediaNext.nFolds,
      holdoutSeason: perTarget.fantamediaNext.holdout.season,
    },
    identity: panel.identity,
    perTarget,
    sampleComponents,
    limits: [provenanceLimit(datasetProvenance), ...COMMON_LIMITS],
    gateStatus: {
      dataPromoted: false,
      canonicalPromoted: false,
      decisionPromoted: false,
      fairToMePromoted: false,
      connectedToLiveApp: false,
    },
  };
}

function fmt(n: number | null): string {
  return n !== null && Number.isFinite(n) ? n.toFixed(3) : "n/a";
}

function renderTargetTable(t: TargetReport): string {
  const lines: string[] = [];
  lines.push(`| modello | MAE (media fold) | Spearman (media fold) | top-quartile hit-rate |`);
  lines.push(`|---|---|---|---|`);
  for (const r of t.results) {
    const marker = r.modelName === t.diagnosticComparatorName ? " **← comparatore diagnostico**" : "";
    lines.push(`| ${r.modelName}${marker} | ${fmt(r.meanMae)} | ${fmt(r.meanSpearman)} | ${fmt(r.meanTopQuartileHitRate)} |`);
  }
  return lines.join("\n");
}

function provenanceTitle(provenance: AppealIndexDatasetProvenance): string {
  if (provenance === "synthetic_fixture") return "SINTETICO";
  if (provenance === "external_real") return "DATI ESTERNI/REALI — DICHIARATI DAL CHIAMANTE";
  return "PROVENIENZA NON DICHIARATA";
}

function provenanceSummary(provenance: AppealIndexDatasetProvenance): string {
  if (provenance === "synthetic_fixture") {
    return "Generato da `packages/appeal-index` su una fixture sintetica dichiarata dal chiamante.";
  }
  if (provenance === "external_real") {
    return "Generato da `packages/appeal-index` su un dataset esterno/reale dichiarato dal chiamante; " +
      "la dichiarazione non valida licenza, integrità o riproducibilità del dataset.";
  }
  return "Generato da `packages/appeal-index` con provenienza non dichiarata o sconosciuta; " +
    "il report non assume che il dataset sia reale.";
}

export interface RenderReportOptions {
  // Default true (unchanged behavior for the existing synthetic-fixture
  // callers/tests). Set false for any real-data run: `report.sampleComponents`
  // carries a real `playerKey` (a real player name once the identity
  // verdict is "unstable" and the dataset falls back to the
  // normalized_name+role key — see playerKey.ts) per illustrated player,
  // which the "## Componenti indice" section below would otherwise print
  // verbatim. Every other section (dataset counts, identity rates, target
  // metrics, limits, gate status) is aggregate-only and safe either way.
  readonly includeSamples?: boolean;
}

export function renderAppealIndexReportMarkdown(
  report: AppealIndexReport,
  opts: RenderReportOptions = {},
): string {
  const includeSamples = opts.includeSamples ?? true;
  const lines: string[] = [];
  lines.push(`# Appeal Index — report offline (${provenanceTitle(report.datasetProvenance)})`);
  lines.push("");
  lines.push(
    provenanceSummary(report.datasetProvenance) +
      " Nessun gate attivato, nessuna connessione alla live app.",
  );
  lines.push("");
  lines.push("## Dataset");
  lines.push(`- Stagioni: ${report.datasetSummary.nSeasons}`);
  lines.push(`- Righe player-season: ${report.datasetSummary.nPlayerSeasonRows}`);
  lines.push(`- Righe feature (coppie stagione→stagione successiva utilizzabili): ${report.datasetSummary.nFeatureRows}`);
  lines.push(`- Fold walk-forward: ${report.datasetSummary.nFolds}`);
  lines.push(
    `- Holdout bruciato 2025-26: ${report.datasetSummary.holdoutSeason ?? "non presente nel fixture"}`,
  );
  lines.push("");
  lines.push("## Verifica stabilità Id/Cod.");
  lines.push(`- Verdetto: **${report.identity.verdict}**`);
  lines.push(`- Chiave cross-stagione usata dal dataset: **${report.identity.recommendedJoinKey}**`);
  lines.push(
    `- stableMatchRate=${fmt(report.identity.stableMatchRate)} · driftRate=${fmt(report.identity.driftRate)} · ` +
      `collisionRate=${fmt(report.identity.collisionRate)} · withinSeasonCollisions=${report.identity.withinSeasonCollisions}`,
  );
  for (const note of report.identity.notes) lines.push(`- Nota: ${note}`);
  lines.push("");

  for (const target of TARGET_NAMES) {
    const t = report.perTarget[target];
    lines.push(`## Target: ${target}`);
    lines.push(renderTargetTable(t));
    lines.push("");
    lines.push(
      t.diagnosticComparatorIsBaseline
        ? `**Diagnostica fixture: la baseline (${t.bestBaselineName}) resta il comparatore; nessun verdict o champion.**`
        : `**Comparatore diagnostico: ${t.diagnosticComparatorName}** — differenza illustrativa dalla baseline ` +
            `su ${fmt(t.diagnosticWinRateVsBestBaseline)} dei fold; nessun verdict o champion.`,
    );
    lines.push("");
  }

  if (includeSamples) {
    const sampleProvenance =
      report.datasetProvenance === "synthetic_fixture"
        ? "dati sintetici"
        : report.datasetProvenance === "external_real"
          ? "provenienza esterna/reale dichiarata"
          : "provenienza non dichiarata";
    lines.push(`## Componenti indice (esempio, ${sampleProvenance})`);
    lines.push(
      "Tutti i componenti fixture/passivi sono `validated:false`; i primi due sono proxy target e gli altri euristiche " +
        "storiche dichiarate `validated:false` — vedi `docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md`.",
    );
    for (const sample of report.sampleComponents) {
      lines.push("");
      lines.push(`### ${sample.playerKey}`);
      for (const [name, c] of Object.entries(sample.components)) {
        lines.push(`- **${name}**: ${fmt(c.value)} (validated=${c.validated}) — ${c.method}`);
      }
    }
    lines.push("");
  } else {
    lines.push("## Componenti indice (esempio)");
    lines.push(
      "Omesso in modalità identity-only/safe: questa sezione stamperebbe un `playerKey` reale per riga " +
        "(nome giocatore o nome normalizzato, vedi `packages/appeal-index/src/playerKey.ts`) — non sicuro per " +
        "un run su dati reali. Vedi la sezione \"Verifica stabilità Id/Cod.\" sopra per il solo dato aggregato.",
    );
    lines.push("");
  }

  lines.push("## Limiti e rischi");
  for (const l of report.limits) lines.push(`- ${l}`);
  lines.push("");

  lines.push("## Stato gate");
  lines.push(
    `- data_promoted=${report.gateStatus.dataPromoted} · canonical_promoted=${report.gateStatus.canonicalPromoted} · ` +
      `decision_promoted=${report.gateStatus.decisionPromoted} · fair_to_me_promoted=${report.gateStatus.fairToMePromoted} · ` +
      `connected_to_live_app=${report.gateStatus.connectedToLiveApp}`,
  );

  return lines.join("\n");
}
