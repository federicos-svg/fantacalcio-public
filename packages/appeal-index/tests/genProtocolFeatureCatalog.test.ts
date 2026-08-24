import { describe, it, expect } from "vitest";
import {
  GEN_FEATURE_CATALOG,
  GenFeatureCatalogError,
  ROLLING3_HALF_LIFE,
  ROLLING3_WINDOW,
  ROLE_INTERACTION_FEATURES,
  TIER_B_INDICATOR_SUFFIX,
  activeFeatureNames,
  activeFeatureNamesForEra,
  assertCatalogInvariants,
  buildGenFeatureRows,
  encodeTierBWithIndicator,
  evaluateStatTransform,
  featureDefinition,
  partitionS3bByEra,
  roleInteractionNames,
  withRoleInteractions,
} from "../src/genProtocol/featureCatalog.js";
import type { GenPanelRow, GenRole, GenSeason, MatchdayVote } from "../src/genProtocol/genTypes.js";

function md(season: GenSeason, matchday: number, votoBase: number | null, extra: Partial<MatchdayVote> = {}): MatchdayVote {
  return {
    season,
    matchday,
    votoBase,
    isAsterisk: false,
    Gf: 0,
    Gs: 0,
    Rp: 0,
    Rs: 0,
    Rf: 0,
    Au: 0,
    Amm: 0,
    Esp: 0,
    Ass: 0,
    ...extra,
  };
}

function panelRow(
  playerKey: string,
  role: GenRole,
  season: GenSeason,
  matchdays: readonly MatchdayVote[],
  seasonStats?: Record<string, number | null>,
  team?: string,
): GenPanelRow {
  const presences = matchdays.filter((row) => row.votoBase !== null);
  const presenze = presences.length;
  const voteSum = presences.reduce((sum, row) => sum + (row.votoBase as number), 0);
  // Il fantavoto qui NON si ricalcola a mano: la fixture usa voti puliti senza
  // eventi, cosi' fantavoto = voto base e il numero atteso e' verificabile a
  // occhio. Dove servono eventi, il test lo dice.
  const totFantavoto = presences.reduce((sum, row) => sum + (row.votoBase as number) + 3 * row.Gf + row.Ass, 0);
  return {
    playerKey,
    role,
    season,
    presenze,
    totFantavoto,
    fantamedia: presenze > 0 ? totFantavoto / presenze : null,
    mediaVotoBase: presenze > 0 ? voteSum / presenze : null,
    matchdays,
    seasonStats,
    team,
  };
}

describe("genProtocol/featureCatalog — le invarianti del catalogo (§D.3, §D.5)", () => {
  it("il catalogo rispetta le sue invarianti dichiarate", () => {
    expect(() => assertCatalogInvariants()).not.toThrow();
  });

  it("nessuna feature che legge xG o xA ha il portiere nel dominio (§D.3, divieto assoluto)", () => {
    for (const definition of GEN_FEATURE_CATALOG) {
      const usesExpected = JSON.stringify(definition.transform ?? {}).includes("expected");
      if (!usesExpected) continue;
      expect(definition.roleDomain).not.toContain("P");
    }
  });

  it("l'assert INTERCETTA una violazione indotta: xG su ruolo P", () => {
    const corrupted = [
      ...GEN_FEATURE_CATALOG,
      {
        name: "xgSulPortiere",
        block: "R" as const,
        tier: "B" as const,
        sets: ["S3a" as const, "S3b" as const],
        roleDomain: ["P" as const],
        formula: "violazione indotta dal test",
        scope: "season" as const,
        rolling3: false,
        transform: { kind: "per90" as const, fields: ["expectedGoals" as const] },
      },
    ];
    expect(() => assertCatalogInvariants(corrupted)).toThrow(/dominio del portiere/);
  });

  it("i campi Tier B vivono solo in S3a/S3b, mai in S1 o S2 (§D.3)", () => {
    for (const definition of GEN_FEATURE_CATALOG) {
      if (definition.tier !== "B") continue;
      expect(definition.sets).not.toContain("S1");
      expect(definition.sets).not.toContain("S2");
    }
  });

  it("il blocco X e' completo: le feature nominate da §D.5 ci sono tutte", () => {
    const expected = [
      "fantamediaLag1",
      "mediaVotoBaseLag1",
      "presenzeLag1",
      "formaUltime10",
      "bonusRate",
      "malusRate",
      "golLag1",
      "assistLag1",
      "rigoristaHist",
      "cleanSheetRateLag1",
      "golSubitiPerPresenzaLag1",
      "rigoriParatiPerPresenzaLag1",
      "volatilitaVotoLastObserved",
      "stagioniOsservate",
      "teamChangedFlag",
      "etaSerieA",
    ];
    const blockX = GEN_FEATURE_CATALOG.filter((d) => d.block === "X").map((d) => d.name);
    expect([...blockX].sort()).toEqual([...expected].sort());
  });

  it("le tre feature del portiere del blocco X hanno dominio P e solo P", () => {
    for (const name of ["cleanSheetRateLag1", "golSubitiPerPresenzaLag1", "rigoriParatiPerPresenzaLag1"]) {
      expect(featureDefinition(name)?.roleDomain).toEqual(["P"]);
    }
  });

  it("le Rolling3 nominate da §D.5 si chiamano come le nomina il protocollo", () => {
    const names = activeFeatureNames("S1", "C");
    expect(names).toContain("fantamediaRolling3");
    expect(names).toContain("presenzeRolling3");
    expect(names).not.toContain("fantamediaLag1Rolling3");
  });

  it("il blocco K esiste solo per il portiere, e S1 non contiene statistiche", () => {
    const keeperOnly = GEN_FEATURE_CATALOG.filter((d) => d.block === "K");
    expect(keeperOnly.length).toBeGreaterThan(10);
    for (const definition of keeperOnly) expect(definition.roleDomain).toEqual(["P"]);
    for (const name of activeFeatureNames("S1", "P")) {
      const base = featureDefinition(name.replace(/Rolling3$/, "")) ?? featureDefinition(name);
      if (base === undefined) continue;
      expect(base.block).toBe("X");
    }
  });
});

describe("genProtocol/featureCatalog — le trasformazioni statistiche", () => {
  it("un rapporto legge numeratore e denominatore dichiarati", () => {
    const definition = featureDefinition("titolaritaShare")!;
    // 20 su 30 = 0,666…, e il denominatore minimo di titolarita' e' 5.
    expect(evaluateStatTransform(definition, { matchesStarted: 20, appearances: 30 })).toBeCloseTo(2 / 3, 12);
    expect(evaluateStatTransform(definition, { matchesStarted: 2, appearances: 4 })).toBeNaN();
  });

  it("il rating entra solo con countRating ≥ 10 (§D.5, blocco R)", () => {
    const definition = featureDefinition("ratingGated")!;
    expect(evaluateStatTransform(definition, { rating: 6.8, countRating: 10 })).toBe(6.8);
    expect(evaluateStatTransform(definition, { rating: 6.8, countRating: 9 })).toBeNaN();
  });

  it("un campo NON OSSERVATO produce NaN, mai 0 — il divieto di §D.3", () => {
    const definition = featureDefinition("goalsPer90")!;
    expect(evaluateStatTransform(definition, { goals: null, minutesPlayed: 900 })).toBeNaN();
    expect(evaluateStatTransform(definition, { minutesPlayed: 900 })).toBeNaN();
    // E il valore osservato passa: la NaN non e' un default pigro.
    expect(evaluateStatTransform(definition, { goals: 5, minutesPlayed: 900 })).toBeCloseTo(0.5, 12);
  });

  it("una somma per-90 con un addendo non osservato e' NaN, non la somma dei presenti", () => {
    const definition = featureDefinition("espulsioniTotaliPer90")!;
    expect(
      evaluateStatTransform(definition, { redCards: 1, yellowRedCards: null, directRedCards: 0, minutesPlayed: 900 }),
    ).toBeNaN();
    expect(
      evaluateStatTransform(definition, { redCards: 1, yellowRedCards: 1, directRedCards: 0, minutesPlayed: 900 }),
    ).toBeCloseTo(0.2, 12);
  });

  it("un campo MAI osservato non riceve la media di ruolo: resta NaN (§D.3, secondo divieto)", () => {
    // Due giocatori dello stesso ruolo: uno ha `keyPasses`, l'altro no. Se il
    // builder imputasse una media, il secondo prenderebbe un numero vicino al
    // primo. Deve invece restare NaN, e restarlo anche nella Rolling3.
    const rows = buildGenFeatureRows(
      [
        panelRow("CON", "C", "2017_18", [md("2017_18", 1, 6)], { keyPasses: 60, minutesPlayed: 2700 }, "TA"),
        panelRow("SENZA", "C", "2017_18", [md("2017_18", 1, 6)], { keyPasses: null, minutesPlayed: 2700 }, "TB"),
      ],
      "S2",
      "2018_19",
    );
    const con = rows.find((row) => row.playerKey === "CON")!;
    const senza = rows.find((row) => row.playerKey === "SENZA")!;
    expect(con.features.keyPassesPer90).toBeCloseTo(2, 12);
    expect(senza.features.keyPassesPer90).toBeNaN();
    expect(senza.features.keyPassesPer90Rolling3).toBeNaN();
  });

  it("l'encoding S3a e' l'UNICO punto in cui un'assenza diventa zero, e porta il suo indicatore", () => {
    expect(encodeTierBWithIndicator(1.4)).toEqual({ value: 1.4, indicator: 1 });
    expect(encodeTierBWithIndicator(Number.NaN)).toEqual({ value: 0, indicator: 0 });
  });
});

describe("genProtocol/featureCatalog — la riparazione della situazione B", () => {
  const seasons: GenSeason[] = ["2016_17", "2017_18", "2018_19"];

  const continuo = [
    panelRow("P_CONT", "C", seasons[0]!, [md(seasons[0]!, 1, 6), md(seasons[0]!, 2, 7)], { goals: 1, minutesPlayed: 900 }, "TA"),
    panelRow("P_CONT", "C", seasons[1]!, [md(seasons[1]!, 1, 6.5), md(seasons[1]!, 2, 6.5)], { goals: 2, minutesPlayed: 900 }, "TA"),
  ];
  // Il giocatore con il BUCO: osservato in 2016/17, assente in 2017/18.
  const conBuco = [
    panelRow("P_BUCO", "C", seasons[0]!, [md(seasons[0]!, 1, 7), md(seasons[0]!, 2, 7)], { goals: 3, minutesPlayed: 900 }, "TB"),
  ];

  it("emette una riga anche per chi ha il BUCO in s−1 (e il legacy non lo farebbe)", () => {
    const rows = buildGenFeatureRows([...continuo, ...conBuco], "S1", "2018_19");
    expect(rows.map((row) => row.playerKey).sort()).toEqual(["P_BUCO", "P_CONT"]);
  });

  it("col buco le Lag1 sono NaN e le Rolling3 usano le stagioni osservate", () => {
    const rows = buildGenFeatureRows(conBuco, "S1", "2018_19");
    const row = rows[0]!;
    expect(row.features.fantamediaLag1).toBeNaN();
    expect(row.features.presenzeLag1).toBeNaN();
    // La Rolling3 esiste: 2016/17 e' osservata, fantamedia = 7 su due presenze.
    expect(row.features.fantamediaRolling3).toBeCloseTo(7, 12);
    expect(row.features.stagioniOsservate).toBe(1);
    expect(row.sourceSeasons).toEqual(["2016_17"]);
  });

  it("senza buco, le Lag1 leggono s−1", () => {
    const rows = buildGenFeatureRows(continuo, "S1", "2018_19");
    const row = rows[0]!;
    expect(row.features.fantamediaLag1).toBeCloseTo(6.5, 12);
    expect(row.features.presenzeLag1).toBe(2);
    expect(row.sourceSeasons).toEqual(["2016_17", "2017_18"]);
  });

  it("nessuna riga per chi non ha alcuna stagione osservata prima del target", () => {
    const soloTarget = [panelRow("P_NEW", "C", "2018_19", [md("2018_19", 1, 6)])];
    expect(buildGenFeatureRows(soloTarget, "S1", "2018_19")).toHaveLength(0);
  });

  it("i bersagli arrivano dalla stagione target; se la riga non c'e', sono NaN e non 0", () => {
    const withTarget = [
      ...continuo,
      panelRow("P_CONT", "C", "2018_19", [md("2018_19", 1, 6), md("2018_19", 2, 6), md("2018_19", 3, null)]),
    ];
    const rows = buildGenFeatureRows(withTarget, "S1", "2018_19");
    expect(rows[0]!.targets.tN).toBe(2);
    expect(rows[0]!.targets.t1).toBeCloseTo(12, 12);
    expect(rows[0]!.targets.t2).toBeCloseTo(6, 12);

    const rowsSenzaTarget = buildGenFeatureRows(continuo, "S1", "2018_19");
    expect(rowsSenzaTarget[0]!.targets.tN).toBeNaN();
    expect(rowsSenzaTarget[0]!.targets.t1).toBeNaN();
  });

  it("una stagione tutta SV vale N = 0 e T2 indefinito, mai zeri al posto dei voti (§A.1)", () => {
    const tuttoSv = [
      panelRow("P_SV", "D", "2016_17", [md("2016_17", 1, 6), md("2016_17", 2, 6)]),
      panelRow("P_SV", "D", "2017_18", [md("2017_18", 1, null), md("2017_18", 2, null)]),
    ];
    const rows = buildGenFeatureRows(tuttoSv, "S1", "2018_19");
    const row = rows[0]!;
    expect(row.features.presenzeLag1).toBe(0);
    expect(row.features.fantamediaLag1).toBeNaN();
    expect(row.features.bonusRate).toBeNaN();
  });

  it("formaUltime10 usa la tariffa canonica: 3 punti per gol, non un numero riscritto qui", () => {
    const conGol = [
      panelRow("P_GOL", "A", "2017_18", [
        md("2017_18", 1, 6, { Gf: 1 }),
        md("2017_18", 2, 6),
      ]),
    ];
    const rows = buildGenFeatureRows(conGol, "S1", "2018_19");
    // (6 + 3) e 6 -> media 7,5.
    expect(rows[0]!.features.formaUltime10).toBeCloseTo(7.5, 12);
  });

  it("teamChangedFlag e' NaN quando la squadra non e' nota: mai uno 0 di comodo", () => {
    const senzaSquadra = [
      panelRow("P_NT", "C", "2016_17", [md("2016_17", 1, 6)]),
      panelRow("P_NT", "C", "2017_18", [md("2017_18", 1, 6)]),
    ];
    expect(buildGenFeatureRows(senzaSquadra, "S1", "2018_19")[0]!.features.teamChangedFlag).toBeNaN();
    const conSquadra = [
      panelRow("P_T", "C", "2016_17", [md("2016_17", 1, 6)], undefined, "TA"),
      panelRow("P_T", "C", "2017_18", [md("2017_18", 1, 6)], undefined, "TB"),
    ];
    expect(buildGenFeatureRows(conSquadra, "S1", "2018_19")[0]!.features.teamChangedFlag).toBe(1);
  });

  it("le costanti della Rolling3 sono quelle dichiarate", () => {
    expect(ROLLING3_WINDOW).toBe(3);
    expect(ROLLING3_HALF_LIFE).toBe(3);
  });
});

describe("genProtocol/featureCatalog — i set S3a e S3b", () => {
  const rows: GenPanelRow[] = [
    panelRow("X1", "C", "2019_20", [md("2019_20", 1, 6)], { goals: 2, minutesPlayed: 900, expectedGoals: null }, "TA"),
    panelRow("X1", "C", "2021_22", [md("2021_22", 1, 6)], { goals: 3, minutesPlayed: 900, expectedGoals: null }, "TA"),
    panelRow("X1", "C", "2022_23", [md("2022_23", 1, 6)], { goals: 4, minutesPlayed: 900, expectedGoals: 3.5 }, "TA"),
  ];

  it("S3a porta il valore e il suo indicatore, e la riga non esce mai per un NaN Tier B", () => {
    const built = buildGenFeatureRows(rows, "S3a", "2023_24");
    const features = built[0]!.features;
    expect(features).toHaveProperty(`expectedGoalsPer90${TIER_B_INDICATOR_SUFFIX}`);
    expect(features.expectedGoalsPer90Osservato).toBe(1);
    expect(Number.isFinite(features.expectedGoalsPer90!)).toBe(true);

    const senzaTierB = [
      panelRow("X2", "C", "2022_23", [md("2022_23", 1, 6)], { goals: 4, minutesPlayed: 900, expectedGoals: null }, "TA"),
    ];
    const builtSenza = buildGenFeatureRows(senzaTierB, "S3a", "2023_24");
    expect(builtSenza[0]!.features.expectedGoalsPer90).toBe(0);
    expect(builtSenza[0]!.features.expectedGoalsPer90Osservato).toBe(0);
    for (const name of activeFeatureNames("S3a", "C")) {
      expect(builtSenza[0]!.features).toHaveProperty(name);
    }
  });

  it("S3b non ha i termini Tier B prima della loro era, e la partizione le separa", () => {
    // Target 2020/21: prima di OGNI confine d'era, quindi nessun termine Tier B.
    const early = buildGenFeatureRows(rows, "S3b", "2020_21");
    expect(early[0]!.features).not.toHaveProperty("expectedGoalsPer90");
    const late = buildGenFeatureRows(rows, "S3b", "2023_24");
    expect(late[0]!.features).toHaveProperty("expectedGoalsPer90");

    const partitions = partitionS3bByEra([...early, ...late]);
    expect(partitions).toHaveLength(2);
    expect(partitions[0]!.tierBFields).toEqual([]);
    expect([...partitions[1]!.tierBFields].sort()).toEqual(["expectedAssists", "expectedGoals", "goalsPrevented"]);
  });

  it("activeFeatureNamesForEra segue i confini d'era", () => {
    const before = activeFeatureNamesForEra("C", "2020_21");
    const after = activeFeatureNamesForEra("C", "2023_24");
    expect(before).not.toContain("expectedGoalsPer90");
    expect(after).toContain("expectedGoalsPer90");
  });
});

describe("genProtocol/featureCatalog — il pooling FAM-2 (§D.2)", () => {
  const rows = buildGenFeatureRows(
    [
      panelRow("PL_D", "D", "2017_18", [md("2017_18", 1, 6)], { matchesStarted: 20, appearances: 30 }, "TA"),
      panelRow("PL_C", "C", "2017_18", [md("2017_18", 1, 7)], { matchesStarted: 10, appearances: 30 }, "TB"),
      panelRow("PL_P", "P", "2017_18", [md("2017_18", 1, 6)], { matchesStarted: 30, appearances: 30 }, "TC"),
    ],
    "S2",
    "2018_19",
  );

  it("aggiunge one-hot e interazioni ruolo×feature, con 0 per algebra dell'indicatore", () => {
    const outfield = rows.filter((row) => row.role !== "P");
    const pooled = withRoleInteractions(outfield);
    const difensore = pooled.find((row) => row.role === "D")!;
    expect(difensore.features.ruoloD).toBe(1);
    expect(difensore.features.ruoloC).toBe(0);
    expect(difensore.features.ruoloC_x_titolaritaShare).toBe(0);
    expect(difensore.features.ruoloD_x_titolaritaShare).toBeCloseTo(2 / 3, 12);
    expect(roleInteractionNames()).toContain("ruoloA_x_presenzeLag1");
    expect(ROLE_INTERACTION_FEATURES).toEqual(["fantamediaLag1", "presenzeLag1", "titolaritaShare"]);
  });

  it("una riga di PORTIERE nel pooled e' un errore fatale, non un filtro silenzioso (§D.2)", () => {
    expect(() => withRoleInteractions(rows)).toThrow(GenFeatureCatalogError);
  });

  it("una base assente dal set non produce una colonna tutta NaN", () => {
    const s1 = buildGenFeatureRows(
      [panelRow("S1_D", "D", "2017_18", [md("2017_18", 1, 6)], undefined, "TA")],
      "S1",
      "2018_19",
    );
    const pooled = withRoleInteractions(s1);
    expect(pooled[0]!.features).not.toHaveProperty("ruoloD_x_titolaritaShare");
    expect(pooled[0]!.features.ruoloD_x_presenzeLag1).toBe(1);
  });
});
