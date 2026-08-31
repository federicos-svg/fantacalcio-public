import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { composeAppealIndexComponents } from "../src/appealIndex.js";
import {
  BURNED_HOLDOUT_SEASON,
  deterministicConfigHash,
  preparePassiveFold,
  runPassiveHarness,
  type PassiveHarnessConfig,
  type PassiveHarnessResult,
  type PassiveRow,
} from "../src/passiveHarness.js";
import {
  appendRegistryEntry,
  assertOutputOutsideRepository,
  sha256,
  writeOofOnce,
  type PassiveRegistryEntry,
} from "../src/passiveRegistry.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

const config: PassiveHarnessConfig = {
  protocolVersion: "VAL-PROTOCOL-A@1.0.0",
  targets: ["fantamediaNext", "presenzeNext"],
  pipelines: [
    { id: "missing_indicator_train_median", featureNames: ["form", "volatility"] },
    { id: "complete_case", featureNames: ["form", "volatility"] },
    {
      id: "cold_start_role_fallback",
      featureNames: ["form", "volatility"],
      fallback: "train_role_mean",
    },
  ],
  candidates: [{ id: "train_mean" }, { id: "train_role_mean" }],
  minTrainSeasons: 2,
  seed: 17,
  burnedHoldoutPolicy: {
    season: BURNED_HOLDOUT_SEASON,
    allowDescriptiveAccess: false,
  },
};

function row(
  rowId: string,
  targetSeason: string,
  role: PassiveRow["role"],
  overrides: Partial<PassiveRow> = {},
): PassiveRow {
  const start = Number(targetSeason.slice(0, 4));
  const sourceSeason = `${start - 1}_${String(start).slice(-2)}`;
  return {
    rowId,
    cohortId: `cohort:${targetSeason}`,
    targetSeason,
    role,
    populationStatus: "observed",
    sourceSeasons: [sourceSeason],
    features: { form: 6, volatility: 0.5 },
    targets: { fantamediaNext: 6, presenzeNext: 20 },
    ...overrides,
  };
}

function fixtureRows(): PassiveRow[] {
  const seasons = ["2021_22", "2022_23", "2023_24", "2024_25"];
  const rows = seasons.flatMap((season, index) => [
    row(`r${index}-d`, season, "D", {
      features: { form: 5 + index, volatility: index === 2 ? null : 0.4 },
      targets: { fantamediaNext: 5.5 + index, presenzeNext: 18 + index },
    }),
    row(`r${index}-a`, season, "A", {
      features: { form: 6 + index, volatility: 0.7 },
      targets: { fantamediaNext: 6.2 + index, presenzeNext: 22 + index },
    }),
  ]);
  rows.push(
    row("cold-start", "2024_25", "P", {
      populationStatus: "cold_start",
      sourceSeasons: [],
      features: { form: null, volatility: null },
      targets: { fantamediaNext: null, presenzeNext: 0 },
    }),
    row("burned", BURNED_HOLDOUT_SEASON, "C"),
  );
  return rows;
}

function componentRow(volatility: number): FeatureRow {
  const features = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Record<
    (typeof FEATURE_NAMES)[number],
    number
  >;
  features.volatilitaVotoLastObserved = volatility;
  features.roleD = 1;
  return {
    playerKey: "redacted:1",
    name: "SYNTHETIC",
    role: "D",
    featureSeason: "2023_24",
    targetSeason: "2024_25",
    features,
    targets: { fantamediaNext: 0, presenzeNext: 0 },
    sourceSeasons: ["2023_24"],
  };
}

describe("Fase 2 missing-data hardening", () => {
  it("does not turn missing volatility into maximum continuity or favorable risk", () => {
    const components = composeAppealIndexComponents({
      features: componentRow(Number.NaN).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(components.continuitaVoto.value).toBeNull();
    expect(components.rischio.value).toBeNull();
    expect(components.continuitaVoto.availability).toBe("missing_input");
  });

  it("keeps a real zero distinct from missing", () => {
    const zero = composeAppealIndexComponents({
      features: componentRow(0).features,
      predictedFantamediaNext: 0,
      predictedPresenzeNext: 0,
      roleCohortFantamediaNext: [0],
    });
    const missing = composeAppealIndexComponents({
      features: componentRow(Number.NaN).features,
      predictedFantamediaNext: Number.NaN,
      predictedPresenzeNext: Number.NaN,
      roleCohortFantamediaNext: [],
    });
    expect(zero.continuitaVoto.value).toBe(1);
    expect(zero.appetibilitaBase.value).toBe(0);
    expect(missing.continuitaVoto.value).toBeNull();
    expect(missing.appetibilitaBase.value).toBeNull();
  });

  it("never emits validated true for passive predictions", () => {
    const components = composeAppealIndexComponents({
      features: componentRow(0.5).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(Object.values(components).every((component) => component.validated === false)).toBe(true);
  });
});

describe("Fase 2 passive harness", () => {
  it("retains zero appearances and cold start in denominator without fabricating fantamedia", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const presenze = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" && entry.target === "presenzeNext",
    )!;
    const fantamedia = result.oof.filter((item) => item.rowId === "cold-start");
    const presenzeOof = result.oof.filter(
      (item) => item.rowId === "cold-start" && item.target === "presenzeNext",
    );
    expect(presenze.value.cohortDenominator).toBeGreaterThan(0);
    expect(presenze.value.byRole.P.cohortDenominator).toBe(1);
    expect(presenzeOof.every((item) => item.actual === 0)).toBe(true);
    expect(fantamedia.some((item) => item.target === "fantamediaNext")).toBe(false);
  });

  it("counts an unobservable cold-start target in the explicit cohort denominator", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const coverage = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" &&
        entry.target === "fantamediaNext",
    )!.value;
    expect(coverage.byRole.P.cohortDenominator).toBe(1);
    expect(coverage.byRole.P.targetNotObservable).toBe(1);
    expect(coverage.byRole.P.evaluated).toBe(0);
    expect(coverage.byRole.P.excluded).toBe(0);
  });

  it("complete-case reports exclusions and lower coverage", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const complete = result.coverage.find(
      (entry) => entry.pipelineId === "complete_case" && entry.target === "presenzeNext",
    )!;
    const fallback = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" && entry.target === "presenzeNext",
    )!;
    expect(complete.value.excluded).toBeGreaterThan(0);
    expect(complete.value.ratio).toBeLessThan(fallback.value.ratio);
  });

  it("fits imputation only on train even when validation is poisoned", () => {
    const train = [
      row("train-1", "2022_23", "D", { features: { form: 4, volatility: 1 } }),
      row("train-2", "2022_23", "A", { features: { form: 8, volatility: null } }),
    ];
    const normal = [row("test", "2023_24", "D", { features: { form: null, volatility: 2 } })];
    const poisoned = [
      row("test", "2023_24", "D", { features: { form: 999999, volatility: 999999 } }),
    ];
    const pipeline = config.pipelines[0]!;
    expect(preparePassiveFold(pipeline, train, normal).trainImputation).toEqual(
      preparePassiveFold(pipeline, train, poisoned).trainImputation,
    );
  });

  it("fails closed when a feature has no observed train value", () => {
    const pipeline = config.pipelines[0]!;
    const train = [
      row("missing-1", "2022_23", "D", { features: { form: 4, volatility: null } }),
      row("missing-2", "2023_24", "D", { features: { form: 5, volatility: null } }),
    ];
    const test = [
      row("missing-test", "2024_25", "D", {
        features: { form: 6, volatility: null },
      }),
    ];
    const prepared = preparePassiveFold(pipeline, train, test);
    expect(prepared.trainImputation.volatility).toBeNull();
    expect(prepared.test).toEqual([]);
    expect(prepared.excludedTest[0]?.reason).toBe("missing_feature_no_train_stat");

    const result = runPassiveHarness([...train, ...test], {
      ...config,
      targets: ["fantamediaNext"],
      pipelines: [pipeline],
    });
    expect(result.oof.some((prediction) => prediction.rowId === "missing-test")).toBe(false);
    expect(result.coverage[0]!.value.exclusionReasons.missing_feature_no_train_stat).toBe(1);
  });

  it("applies train-role fallback to cold starts and accounts for unavailable roles", () => {
    const rows = fixtureRows();
    rows.push(
      row("cold-d", "2024_25", "D", {
        populationStatus: "cold_start",
        sourceSeasons: [],
        features: { form: null, volatility: null },
        targets: { fantamediaNext: 9, presenzeNext: 12 },
      }),
      row("cold-c", "2024_25", "C", {
        populationStatus: "cold_start",
        sourceSeasons: [],
        features: { form: null, volatility: null },
        targets: { fantamediaNext: 7, presenzeNext: 10 },
      }),
    );
    const result = runPassiveHarness(rows, {
      ...config,
      targets: ["fantamediaNext"],
      pipelines: [config.pipelines[2]!],
    });
    const predictions = result.oof.filter((item) => item.rowId === "cold-d");
    const trainRoleValues = rows
      .filter(
        (item) =>
          item.role === "D" &&
          item.targetSeason < "2024_25" &&
          item.targets.fantamediaNext !== null,
      )
      .map((item) => item.targets.fantamediaNext!);
    const expected = trainRoleValues.reduce((sum, value) => sum + value, 0) / trainRoleValues.length;
    expect(predictions).toHaveLength(config.candidates.length);
    expect(predictions.every((item) => item.predicted === expected)).toBe(true);
    expect(
      predictions.every(
        (item) =>
          item.fallback.used &&
          item.fallback.method === "train_role_mean" &&
          item.fallback.validated === false,
      ),
    ).toBe(true);
    const coverage = result.coverage[0]!.value;
    expect(coverage.fallback.used).toBe(1);
    expect(coverage.fallback.unavailable).toBe(1);
    expect(
      result.oof.some((item) => item.rowId === "cold-c" && item.target === "fantamediaNext"),
    ).toBe(false);
  });

  it("rejects NaN and Infinity before serialization can coerce them to null", () => {
    expect(() =>
      runPassiveHarness(
        [row("nan", "2024_25", "D", { features: { form: Number.NaN, volatility: 1 } })],
        config,
      ),
    ).toThrow(/Non-finite value/);
    expect(() =>
      runPassiveHarness(
        [
          row("infinity", "2024_25", "D", {
            targets: { fantamediaNext: Number.POSITIVE_INFINITY, presenzeNext: 1 },
          }),
        ],
        config,
      ),
    ).toThrow(/Non-finite value/);
  });

  it("rejects future leakage and silent reuse of the burned holdout", () => {
    expect(() =>
      runPassiveHarness(
        [
          row("leak", "2024_25", "D", {
            sourceSeasons: ["2025_26"],
          }),
        ],
        config,
      ),
    ).toThrow(/Future season leaked/);
    const result = runPassiveHarness(fixtureRows(), config);
    expect(result.oof.some((item) => item.season === BURNED_HOLDOUT_SEASON)).toBe(false);
    expect(result.holdoutAccesses).toEqual([]);
  });

  it("logs every intentional descriptive access to 2025-26", () => {
    const result = runPassiveHarness(fixtureRows(), {
      ...config,
      burnedHoldoutPolicy: {
        season: BURNED_HOLDOUT_SEASON,
        allowDescriptiveAccess: true,
      },
    });
    expect(result.holdoutAccesses).toEqual([
      { season: BURNED_HOLDOUT_SEASON, purpose: "descriptive_advisory" },
    ]);
    expect(result.oof.some((item) => item.season === BURNED_HOLDOUT_SEASON)).toBe(false);
  });

  it("produces aligned OOF, role-season metrics and season-block uncertainty", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    expect(result.oof.length).toBeGreaterThan(0);
    expect(result.paired.every((item) => item.alignedRows > 0)).toBe(true);
    expect(result.metrics.byRoleSeason.length).toBeGreaterThan(0);
    expect(result.metrics.foldDispersion.every((item) => item.seasonalMae.length > 0)).toBe(true);
    expect(result.status).toBe("no_verdict");
    expect("champion" in result).toBe(false);
  });

  it("is deterministic for config, output and seed", () => {
    const first = runPassiveHarness(fixtureRows(), config);
    const second = runPassiveHarness(fixtureRows(), config);
    expect(first).toEqual(second);
    expect(deterministicConfigHash(config)).toBe(first.configHash);
  });
});

describe("Fase 2 external append-only registry", () => {
  it("writes OOF once outside the repo and refuses duplicates/overwrite", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const external = mkdtempSync(join(tmpdir(), "val-passive-"));
    const result = runPassiveHarness(fixtureRows(), config);
    const oof = writeOofOnce(repoRoot, join(external, "oof.json"), result.oof);
    expect(oof.hash).toBe(sha256(readFileSync(oof.path, "utf8")));
    expect(() => writeOofOnce(repoRoot, oof.path, result.oof)).toThrow();

    const entry: PassiveRegistryEntry = {
      runId: "synthetic-passive-run",
      protocolVersion: config.protocolVersion,
      inputManifestHash: sha256("synthetic-input"),
      commitSha: "0000000000000000000000000000000000000000",
      configHash: result.configHash,
      leagueRuleVersion: "synthetic-rule-v1",
      cohortType: "explicit_target_cohort",
      pipelineIds: config.pipelines.map((item) => item.id),
      candidateIds: config.candidates.map((item) => item.id),
      seed: config.seed,
      deterministic: true,
      metrics: result.metrics,
      coverage: result.coverage,
      oofRef: oof,
      artifactRefs: [],
      holdoutAccesses: result.holdoutAccesses,
      status: "no_verdict",
    };
    const registry = join(external, "registry.jsonl");
    appendRegistryEntry(repoRoot, registry, entry);
    expect(() => appendRegistryEntry(repoRoot, registry, entry)).toThrow(/duplicate\/overwrite/);
  });

  it("refuses output anywhere inside the repository", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    expect(() => assertOutputOutsideRepository(repoRoot, join(repoRoot, "oof.json"))).toThrow(
      /inside repository/,
    );
  });
});

describe("Fase 2 isolation invariants", () => {
  // IL PERIMETRO SORVEGLIATO È QUELLO DICHIARATO: `src/` E IL MOTORE.
  //
  // Fino al 2026-08-31 questo blocco camminava SOLO su `src/`, mentre il
  // divieto è sempre stato dichiarato «da `src/` e dal motore». Il buco non era
  // teorico: `packages/engine/src/priceHistory.ts`, `expectedPrice.ts`,
  // `creditValue.ts`, `dynamicPlan.ts`, `baitDrain.ts` e
  // `packages/opponent-profiles/src/expectedSpend.ts` — circa 2.500 righe
  // arrivate in pochi giorni — non venivano mai letti da nessuna guardia. Non
  // c'era violazione (verificata a mano), ma la garanzia automatica non
  // copriva più il punto dove il rischio si era spostato.
  const ISOLATED_ROOTS = ["src", "packages/engine/src", "packages/opponent-profiles/src"];

  /**
   * I file sorvegliati di una radice, esclusi i test. Le radici oggi
   * contengono solo `.ts` (e fogli di stile, che non importano moduli), ma il
   * filtro accetta anche JavaScript: un `loader.js` messo qui importerebbe il
   * pacchetto esattamente come un `.ts`, e una guardia fail-closed non si fa
   * aggirare cambiando estensione.
   */
  const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
  const sourceFiles = (root: string): readonly string[] => {
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (WATCHED_EXTENSIONS.test(entry) && !/\.test\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry))
          files.push(path);
      }
    };
    walk(root);
    return files;
  };

  /**
   * GLI SPECIFICATORI DI MODULO, non il testo intero, ed è una necessità del
   * perimetro nuovo: il motore NOMINA legittimamente questo pacchetto nei
   * propri commenti — `packages/engine/src/tiers.ts` dichiara da dove viene
   * l'ordine di appetibilità, `identityName.ts` dichiara di quale
   * normalizzazione è gemello — e una guardia su testo grezzo le leggerebbe
   * come violazioni, costringendo a riscrivere la documentazione per far
   * passare il test. Quello che il divieto vieta è DIPENDERE, cioè importare.
   *
   * FINO AL 2026-08-31 L'ESTRAZIONE ERA UNA REGEX su quattro forme e vedeva
   * SOLO le stringhe fra virgolette. Due file da tre righe messi in
   * `packages/engine/src/` — uno che raggiungeva `appealIndex.js` con un
   * import dinamico il cui specificatore era scritto fra backtick, l'altro con
   * quello stesso specificatore passato per una costante — lasciavano
   * la suite VERDE. Il commento dichiarava però una copertura completa e la
   * contro-prova qui sotto provava solo le forme fra virgolette: il buco non
   * era sfuggito per caso, non era mai stato messo alla prova.
   *
   * Ora l'estrazione non è più tessuto ma STRUTTURA: si parsa il file col
   * compilatore TypeScript e si leggono i nodi. I commenti restano fuori per
   * costruzione — compresi quelli che citano `packages/appeal-index/` fra
   * backtick, che a una regex sono indistinguibili da un template literal.
   *
   * CHE COSA CATTURA — ogni posizione in cui il linguaggio ammette uno
   * specificatore di modulo:
   *   `import … from "x"`, `import "x"`, `export … from "x"`, `export * from "x"`,
   *   `import x = require("x")`, il tipo `import("x").T`, e le chiamate
   *   `import("x")`, `require("x")`, `require.resolve("x")` — con l'argomento
   *   scritto fra virgolette OPPURE come template literal senza sostituzioni.
   * `require.resolve` è dentro per scelta: non crea una dipendenza a runtime,
   * ma nomina il pacchetto, e un buco sintattico in una guardia fail-closed
   * non si lascia aperto solo perché il danno sarebbe minore.
   *
   * CHE COSA NON LEGGE, ed è il motivo della seconda regola: uno specificatore
   * che non è staticamente decidibile — `import(modPath)`, `import(base + name)`,
   * e un template literal con sostituzioni. Di questi non si può PROVARE che
   * non raggiungano il pacchetto, quindi non si finge di saperlo:
   * `unreadable` li raccoglie e il test li rifiuta in blocco. Fra le due regole
   * la copertura è chiusa: o lo specificatore si legge e si controlla, o la
   * chiamata è vietata; oggi le radici sorvegliate non ne contengono nessuna.
   *
   * Restano fuori dal perimetro, dichiarati e non dimenticati: il caricamento
   * che non passa da import/require (`eval`, `new Function`, `createRequire`)
   * e qualunque file fuori dalle radici sorvegliate.
   */
  const scriptKind = (path: string): ts.ScriptKind => {
    if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
    if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
    if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  };

  const parseSource = (source: string, path = "guard.ts"): ts.SourceFile =>
    ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));

  /** Il testo di un letterale staticamente decidibile; `undefined` altrimenti. */
  const staticText = (node: ts.Node): string | undefined =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;

  /** `require` / `require.resolve` / la parola chiave `import`. */
  const isModuleCall = (node: ts.CallExpression): boolean => {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(node.expression)) return node.expression.text === "require";
    return (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "require" &&
      node.expression.name.text === "resolve"
    );
  };

  type ModuleReferences = {
    /** Specificatori letti per intero. */
    readonly specifiers: readonly string[];
    /** Argomenti di caricamento che non si leggono staticamente. */
    readonly unreadable: readonly string[];
  };

  const moduleReferences = (source: string, path?: string): ModuleReferences => {
    const specifiers: string[] = [];
    const unreadable: string[] = [];
    const read = (node: ts.Node | undefined): void => {
      if (node === undefined) return;
      const text = staticText(node);
      if (text === undefined) unreadable.push(node.getText());
      else specifiers.push(text);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) read(node.moduleSpecifier);
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        read(node.moduleReference.expression);
      else if (ts.isImportTypeNode(node))
        read(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument);
      else if (ts.isCallExpression(node) && isModuleCall(node)) read(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(parseSource(source, path));
    return { specifiers, unreadable };
  };

  const importSpecifiers = (source: string): readonly string[] =>
    moduleReferences(source).specifiers;

  it("is not imported by the live UI or hard-safe src path", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const liveRoot = join(repoRoot, "src");
    const imports = sourceFiles(liveRoot)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(imports).not.toContain("packages/appeal-index");
    expect(imports).not.toContain("@fantacalcio/appeal-index");
  });

  it("is not imported by the engine or the opponent-profiles package either", () => {
    // LA CONTRO-PROVA È NEL CONTEGGIO, e non è cerimoniale: una guardia che
    // camminasse su una radice vuota (rinominata, spostata) sarebbe verde
    // senza aver letto niente. Qui si pretende che i file letti ci siano e che
    // i moduli arrivati di recente siano fra quelli.
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const watched = ISOLATED_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)));
    expect(watched.length).toBeGreaterThan(60);
    for (const recent of [
      "packages/engine/src/priceHistory.ts",
      "packages/engine/src/expectedPrice.ts",
      "packages/engine/src/creditValue.ts",
      "packages/engine/src/dynamicPlan.ts",
      "packages/engine/src/baitDrain.ts",
      "packages/opponent-profiles/src/expectedSpend.ts",
      "src/perMeCandidates.ts",
      "src/baitCandidates.ts",
    ]) {
      expect(watched, recent).toContain(join(repoRoot, recent));
    }

    for (const path of watched) {
      const { specifiers, unreadable } = moduleReferences(readFileSync(path, "utf8"), path);
      for (const specifier of specifiers) {
        expect(specifier, `${path} importa «${specifier}»`).not.toMatch(/appeal-index/);
      }
      // FAIL-CLOSED: uno specificatore che non si legge non si assolve. Qui
      // dentro non ce ne sono, e se ne comparisse uno andrebbe reso statico —
      // oppure discusso, non lasciato passare in silenzio.
      expect(unreadable, `${path} carica un modulo da uno specificatore non leggibile`).toEqual([]);
    }
  });

  it("the guard bites: an import of appeal-index is refused wherever it appears", () => {
    // CONTRO-PROVA DELL'ESTRATTORE, e conta più dell'estrattore stesso: una
    // regex negata su un insieme che potrebbe essere vuoto è verde e non prova
    // niente. Fino al 2026-08-31 questa lista provava SOLO le forme fra
    // virgolette — cioè proprio non i casi in cui la guardia non mordeva. Ora
    // prova OGNI forma che il commento dell'estrattore dichiara di catturare.
    const vietati = [
      'import { composeAppealIndexComponents } from "../../appeal-index/src/appealIndex.js";',
      'import type { FeatureRow } from "@fantacalcio/appeal-index";',
      'import "../../appeal-index/src/types.js";',
      'export { composeAppealIndexComponents } from "../../appeal-index/src/appealIndex.js";',
      'export * from "@fantacalcio/appeal-index";',
      'import ai = require("../../appeal-index/src/appealIndex.js");',
      'type Row = import("../../appeal-index/src/types.js").FeatureRow;',
      'const m = await import("../../appeal-index/src/report.js");',
      'const m = require("packages/appeal-index/src/dataset.js");',
      'const p = require.resolve("../../appeal-index/src/types.js");',
      // …e le stesse chiamate con l'argomento fra backtick: è la forma che il
      // 2026-08-31 attraversava la guardia senza essere vista.
      "const m = await import(`../../appeal-index/src/appealIndex.js`);",
      "const m = require(`packages/appeal-index/src/dataset.js`);",
      "const p = require.resolve(`../../appeal-index/src/types.js`);",
    ];
    for (const riga of vietati) {
      const specifiers = importSpecifiers(riga);
      expect(specifiers.length, riga).toBeGreaterThan(0);
      expect(
        specifiers.some((s) => /appeal-index/.test(s)),
        riga,
      ).toBe(true);
    }

    // I DUE FILE DI LABORATORIO, alla lettera: messi in `packages/engine/src/`
    // lasciavano la suite verde. Il primo ora si legge; il secondo non si legge
    // affatto — e proprio per questo viene rifiutato invece che ignorato.
    const provaTemplate = [
      "export async function loadAppealIndex() {",
      "  return import(`../../appeal-index/src/appealIndex.js`);",
      "}",
    ].join("\n");
    expect(importSpecifiers(provaTemplate)).toContain("../../appeal-index/src/appealIndex.js");

    const provaCostante = [
      "const modPath = `../../appeal-index/src/appealIndex.js`;",
      "export async function loadAppealIndex() { return import(modPath); }",
    ].join("\n");
    expect(moduleReferences(provaCostante).specifiers).toEqual([]);
    expect(moduleReferences(provaCostante).unreadable).toEqual(["modPath"]);

    // La regola fail-closed sugli specificatori non decidibili, in tutte le
    // forme che la producono.
    for (const opaco of [
      "const m = await import(base + name);",
      "const m = await import(`../../${pkg}/src/appealIndex.js`);",
      "const m = require(paths[0]);",
      'const p = require.resolve(prefix + "/appealIndex.js");',
    ]) {
      expect(moduleReferences(opaco).unreadable.length, opaco).toBeGreaterThan(0);
      expect(moduleReferences(opaco).specifiers, opaco).toEqual([]);
    }

    // …e NON morde su ciò che il motore usa davvero, né sui commenti che
    // nominano il pacchetto: se lo facesse, il test qui sopra sarebbe verde
    // per la ragione sbagliata e la documentazione andrebbe riscritta.
    expect(importSpecifiers('import { hardReserve } from "./auction.js";')).toEqual([
      "./auction.js",
    ]);
    expect(
      importSpecifiers("// packages/appeal-index/src/nameNormalization.ts's normalizePlayerName()"),
    ).toEqual([]);
    // Il caso che una regex non può distinguere da un template literal: un
    // commento che cita il percorso del pacchetto fra backtick, come fa
    // `packages/engine/src/tiers.ts`.
    expect(importSpecifiers("// l'indice di appetibilità (`packages/appeal-index/`)")).toEqual([]);
    expect(importSpecifiers("/* vedi packages/appeal-index/src/report.ts */")).toEqual([]);
    // Una stringa che nomina il pacchetto senza importarlo non è un import.
    expect(importSpecifiers('const reason = "inconsistent-appeal-index";')).toEqual([]);
    // E dove non si carica nessun modulo non si inventa un «non leggibile».
    expect(moduleReferences('const label = ids[0] + "-x";').unreadable).toEqual([]);
  });

  it("has no receipt, gate or authority fields in passive output", () => {
    const output = runPassiveHarness(fixtureRows(), config) as unknown as Record<string, unknown>;
    expect(output.status).toBe("no_verdict");
    expect(output).not.toHaveProperty("champion");
    expect(output).not.toHaveProperty("receipt");
    expect(output).not.toHaveProperty("gateStatus");
    expect(
      (output.oof as PassiveHarnessResult["oof"]).every(
        (prediction) => prediction.fallback.validated === false,
      ),
    ).toBe(true);
  });
});
