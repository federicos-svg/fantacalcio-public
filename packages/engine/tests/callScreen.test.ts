import { describe, it, expect } from "vitest";
import {
  ABSOLUTE_VALUE_UNRATIFIED_CHOICES,
  ALPHA_BY_PROFILE,
  COST_FLOOR,
  DECLARED_VALUE_PROVENANCE,
  UNRATIFIED_CHOICES,
  VALUE_PROFILES,
  WIDTH_NO_TARGET_OVER_BUDGET,
  anchorBook,
  bestAlternative,
  callScreen,
  livePlan,
  maxSafe,
  measuredInflation,
  type AuctionEvent,
  type AuctionState,
  type CallScreenInput,
  type DeclaredDataQuality,
  type PlayerAnchor,
  type UnratifiedChoiceId,
  type ValueProfile,
} from "../src/index.js";
import { TEAMS, anchor, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";
import { plan, value, valueBookOf } from "./layer3Fixtures.js";

const SELF = TEAMS[0]!;
const RIVAL = TEAMS[1]!;
const DECLARED_PLAN = plan({ P: 20, D: 80, C: 140, A: 210 });

// ---------------------------------------------------------------------------
// Listino "salto": dopo a_occ (30) la migliore alternativa a scendere è a 12,
// quindi a_occ è un cliff. Serve a esercitare il rimpianto alto.
// ---------------------------------------------------------------------------
const ANCHORS: PlayerAnchor[] = [
  anchor("a_occ", "A", 30),
  anchor("a_pari", "A", 40),
  anchor("a_caro", "A", 50),
  anchor("a_low", "A", 12),
  anchor("a_muto", "A", 10),
  anchor("c_occ", "C", 25),
  anchor("p_zero", "P", 4),
  ...Array.from({ length: 5 }, (_, i) => anchor(`x${i + 1}`, "A", 10)),
];
const BOOK = anchorBook(ANCHORS);

/**
 * Mercato scaldato: cinque acquisti ancorati a 12 su Qt.A 10 ⇒ inflazione
 * misurata +20% con campione 5. Serve SOLO dove la modalità `occasione` è in
 * gioco: il gate anti-selezione-avversa non promuove un'ancora che nessuna
 * misura ha toccato, quindi a mercato freddo il badge non si accende mai.
 * Il resto dei test resta a mercato freddo, dove l'ancora è la Qt.A nuda e i
 * numeri della catena si leggono senza aritmetica di inflazione in mezzo.
 */
const WARM_LOG = buildLog(
  Array.from({ length: 5 }, (_, i) => buy(`x${i + 1}`, "A", TEAMS[i + 1]!, 12)),
);
const VALUES = valueBookOf([
  value("a_occ", 60),
  value("a_pari", 40),
  value("a_caro", 20),
  value("a_low", 20),
  value("c_occ", 45),
  value("p_zero", 0),
]);
const QUALITY: DeclaredDataQuality[] = [
  { playerId: "a_occ", level: "alta" },
  { playerId: "a_low", level: "media" },
];

// ---------------------------------------------------------------------------
// Listino "scala densa": nessun cliff, così il rimpianto può essere medio o
// basso e le due condizioni si distinguono.
// ---------------------------------------------------------------------------
const DENSE_BOOK = anchorBook([
  anchor("b1", "A", 50),
  anchor("b2", "A", 45),
  anchor("b3", "A", 40),
]);
const DENSE_VALUES = valueBookOf([value("b1", 60), value("b2", 60), value("b3", 40)]);

function screen(
  overrides: Partial<CallScreenInput> & Pick<CallScreenInput, "playerId">,
  log: readonly AuctionEvent[] = [],
) {
  const state: AuctionState = stateOf(log);
  const base: CallScreenInput = {
    playerId: overrides.playerId,
    book: BOOK,
    values: VALUES,
    state,
    inflation: measuredInflation(log, overrides.book ?? BOOK),
    selfId: SELF,
    plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
    profile: "media",
    quality: QUALITY,
  };
  return callScreen({ ...base, ...overrides, state });
}

describe("callScreen — commutazione automatica della schermata", () => {
  it("OCCASIONE: ancora corrente misurata sotto il valore dichiarato, con qualità alta", () => {
    const result = screen({ playerId: "a_occ" }, WARM_LOG);
    expect(result.mode).toBe("occasione");
    expect(result.anchor!.correctedAnchor).toBe(36); // Qt.A 30 × (1 + 0,20)
    expect(result.surplus).toBe(24);
    expect(result.quality.passes).toBe(true);
    expect(result.quality.anchorCorrected).toBe(true);
  });

  it("TARGET: surplus positivo ma dato non qualificato — il badge non si accende", () => {
    const result = screen({ playerId: "a_low" }, WARM_LOG);
    expect(result.surplus).toBeGreaterThan(0);
    expect(result.mode).toBe("target");
    expect(result.quality.downgradeReasons).toEqual(["quality-below-high"]);
    expect(result.numbers).not.toBeNull();
  });

  it("TARGET: a mercato freddo nessun badge, per quanto grande sia il surplus", () => {
    // Stesso giocatore, stessa etichetta «alta», stesso valore dichiarato: a
    // cambiare è solo che il tavolo non ha ancora pagato nulla di ancorato.
    const cold = screen({ playerId: "a_occ" });
    expect(cold.surplus).toBe(30); // più alto di quello caldo, e vale meno
    expect(cold.mode).toBe("target");
    expect(cold.quality.anchorCorrected).toBe(false);
    expect(cold.quality.downgradeReasons).toEqual(["anchor-not-corrected"]);
  });

  it("TARGET: nel mio piano ma senza surplus all'ancora corrente", () => {
    const result = screen({ playerId: "a_pari" });
    expect(result.surplus).toBe(0);
    expect(result.mode).toBe("target");
  });

  it("SPETTATORE senza ancora: nessun ruolo, nessun numero, motivo dichiarato", () => {
    const result = screen({ playerId: "sconosciuto" });
    expect(result.mode).toBe("spettatore");
    expect(result.role).toBeNull();
    expect(result.numbers).toBeNull();
    expect(result.noTargetReason).toBe("anchor-missing");
    expect(result.tension).toBeNull();
    expect(result.competitors).toBeNull();
  });

  it("SPETTATORE senza valore dichiarato: i fatti del tavolo restano, i numeri no", () => {
    const result = screen({ playerId: "a_muto" });
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("declared-value-missing");
    expect(result.numbers).toBeNull();
    expect(result.declaredValue).toBeNull();
    // La modalità spettatore del design §4.1 mostra comunque il drenaggio del
    // tavolo: tensione e insieme eleggibile restano popolati.
    expect(result.tension).not.toBeNull();
    expect(result.competitors).not.toBeNull();
  });

  it("SPETTATORE con il ruolo pieno", () => {
    const result = screen({ playerId: "c_occ" }, buildLog(fillRole(SELF, "C", 9, 1)));
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("role-full");
  });

  it("SPETTATORE con il budget bloccato dalla riserva dura", () => {
    const log = buildLog([
      ...fillRole(SELF, "P", 3, 20),
      ...fillRole(SELF, "D", 9, 20),
      ...fillRole(SELF, "C", 9, 20),
      ...fillRole(SELF, "A", 4, 20),
    ]);
    const result = screen({ playerId: "a_occ" }, log);
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("not-biddable");
  });

  it("SPETTATORE quando la catena finisce sotto il floor: «per me vale 0»", () => {
    const result = screen({ playerId: "p_zero" });
    expect(result.declaredValue).toBe(0);
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("below-cost-floor");
    expect(result.numbers).toBeNull();
  });

  it("SPETTATORE su un giocatore già assegnato: nessun numero per un'asta che non c'è", () => {
    const result = screen({ playerId: "a_occ" }, buildLog([buy("a_occ", "A", RIVAL, 31)]));
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("already-assigned");
    expect(result.numbers).toBeNull();
    expect(result.tension!.reason).toBe("player-not-available");
    expect(result.cliff!.playerAvailable).toBe(false);
  });

  it("SPETTATORE anche su un riconfermato: è fuori mercato allo stesso modo", () => {
    const state = stateOf([], [{ fantaTeamId: RIVAL, playerId: "a_occ", role: "A", price: 28 }]);
    const result = callScreen({
      playerId: "a_occ",
      book: BOOK,
      values: VALUES,
      state,
      inflation: measuredInflation([], BOOK),
      selfId: SELF,
      plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
      profile: "media",
    });
    expect(result.noTargetReason).toBe("already-assigned");
    expect(result.numbers).toBeNull();
  });
});

describe("callScreen — i tre numeri decisionali, derivati dai valori di Owner", () => {
  const result = screen({ playerId: "a_occ" });
  const numbers = result.numbers!;

  it("porta l'etichetta di provenienza imposta dal design §4.1", () => {
    expect(numbers.provenance).toBe(DECLARED_VALUE_PROVENANCE);
  });

  it("«prendilo fino a» si ferma all'ancora corrente misurata, senza margini inventati", () => {
    expect(numbers.bandMargin).toBe(0);
    expect(numbers.takeUpTo).toBe(result.anchor!.correctedAnchor);
  });

  it("«mollalo a» è il fair-to-me effettivo derivato dai valori dichiarati", () => {
    // valore 60, α media = 1 ⇒ l'opportunity cost non sposta il tetto.
    expect(numbers.alpha).toBe(ALPHA_BY_PROFILE.media);
    expect(numbers.fairToMeMaxRaw).toBe(60);
    expect(numbers.stretchCap).toBe(60);
    expect(numbers.fairToMeMaxEffective).toBe(60);
  });

  it("l'opportunity cost è il surplus della migliore alternativa comprabile", () => {
    // a_low: valore 20 su ancora 12 ⇒ surplus 8.
    expect(numbers.opportunityCost).toBe(8);
    expect(result.planB!.alternative!.playerId).toBe("a_low");
  });

  it.each(VALUE_PROFILES)("il profilo dichiarato «%s» usa l'α preregistrato del piano", (profile) => {
    const withProfile = screen({ playerId: "a_occ", profile });
    expect(withProfile.numbers!.alpha).toBe(ALPHA_BY_PROFILE[profile]);
    expect(withProfile.numbers!.profile).toBe(profile);
  });

  it("prudente ≤ media ≤ aggressiva quando c'è un'alternativa che rende", () => {
    const ftm = (profile: ValueProfile) =>
      screen({ playerId: "a_occ", profile }).numbers!.fairToMeMaxEffective;
    expect(ftm("prudente")).toBe(58); // ⌊60 − 8 × 0,15⌋
    expect(ftm("media")).toBe(60);
    expect(ftm("aggressiva")).toBe(61); // ⌊60 + 8 × 0,15⌋
  });

  it("senza alternativa comprabile l'opportunity cost è 0 e i tre α coincidono", () => {
    // Unico centrocampista ancorato: non resta nessun ripiego nel ruolo.
    const values = VALUE_PROFILES.map(
      (profile) => screen({ playerId: "c_occ", profile }).numbers!.fairToMeMaxEffective,
    );
    expect(screen({ playerId: "c_occ" }).numbers!.opportunityCost).toBe(0);
    expect(new Set(values).size).toBe(1);
  });

  it("il margine dichiarato da Owner alza la banda, mai sopra il tetto", () => {
    const withMargin = screen({ playerId: "a_occ", bandMargin: 5 }).numbers!;
    expect(withMargin.takeUpTo).toBe(35);
    expect(withMargin.takeUpTo).toBeLessThanOrEqual(withMargin.stretchCap);
    const huge = screen({ playerId: "a_occ", bandMargin: 1000 }).numbers!;
    expect(huge.takeUpTo).toBe(huge.stretchCap);
  });

  it("rifiuta un margine non finito o negativo invece di ignorarlo", () => {
    expect(() => screen({ playerId: "a_occ", bandMargin: -1 })).toThrow(/bandMargin/);
    expect(() => screen({ playerId: "a_occ", bandMargin: Number.NaN })).toThrow(/bandMargin/);
  });

  it("lancia su un selfId che non è al tavolo", () => {
    expect(() => screen({ playerId: "a_occ", selfId: "squadra_fantasma" })).toThrow(
      /unknown selfId/,
    );
  });

  it("il troncamento non perde un credito per errore di virgola mobile", () => {
    // ⌊60 − 8 × (1 − 0,85)⌋ = ⌊58,8⌋ = 58: senza epsilon un caso esatto
    // scenderebbe di un credito. Verificato su un valore che cade sull'intero.
    const exact = screen({
      playerId: "a_occ",
      profile: "prudente",
      values: valueBookOf([value("a_occ", 61), value("a_low", 32)]),
    }).numbers!;
    // alternativa a_low: 32 − 12 = 20 di surplus ⇒ ⌊61 − 20 × 0,15⌋ = ⌊58⌋ = 58
    expect(exact.opportunityCost).toBe(20);
    expect(exact.fairToMeMaxRaw).toBe(58);
  });
});

describe("callScreen — width gate §4.2", () => {
  it("banda troppo larga rispetto al budget residuo ⇒ no_target, nessun numero", () => {
    // La sonda della review: `takeUpTo` basso e `stretchCap` altissimo su un
    // budget da 500 producevano una banda larga 399 (80% del budget) e i numeri
    // uscivano lo stesso. §4.2: «`no_target` non conserva né mostra una banda
    // nascosta come operativa».
    const result = screen({
      playerId: "a_low",
      values: valueBookOf([value("a_low", 400)]),
    });
    expect(result.numbers).toBeNull();
    expect(result.mode).toBe("spettatore");
    expect(result.noTargetReason).toBe("band-too-wide");
    // Il motivo resta ispezionabile: «niente numeri» senza il perché non basta.
    expect(result.widthGate!.verdict).toBe("no_target");
    expect(result.widthGate!.width).toBe(400 - 12);
    expect(result.widthGate!.widthOverBudget).toBeGreaterThan(WIDTH_NO_TARGET_OVER_BUDGET);
  });

  it("banda stretta ⇒ useful, e i numeri escono", () => {
    const result = screen({ playerId: "a_occ" });
    expect(result.widthGate!.verdict).toBe("useful");
    expect(result.widthGate!.width).toBe(60 - 30);
    expect(result.widthGate!.widthOverBudget).toBeCloseTo(30 / 500, 10);
    expect(result.numbers).not.toBeNull();
    expect(result.numbers!.widthGate).toEqual(result.widthGate);
  });

  it("fra le due soglie ⇒ cautious, senza togliere i numeri", () => {
    // width/budget fra 15% e 25%: valore 130 su ancora 30 ⇒ width 100 su 500.
    const result = screen({ playerId: "a_occ", values: valueBookOf([value("a_occ", 130)]) });
    expect(result.widthGate!.widthOverBudget).toBeCloseTo(0.2, 10);
    expect(result.widthGate!.verdict).toBe("cautious");
    expect(result.numbers).not.toBeNull();
  });

  it("misura la dimensione midpoint ma dichiara di non usarla per chiudere", () => {
    // §4.2 ha due dimensioni; qui ne è attiva una sola, e la seconda viaggia
    // come numero misurato invece di sparire. Il gap è visibile, non silenzioso.
    const result = screen({ playerId: "a_occ" });
    const gate = result.widthGate!;
    expect(gate.gatedDimensions).toEqual(["budget-residual"]);
    expect(gate.midpoint).toBe((30 + 60) / 2);
    expect(gate.widthOverMidpoint).toBeCloseTo(30 / 45, 10);
    // Sulla sola dimensione midpoint §4.2 direbbe `no_target` (0,67 > 0,35):
    // il verdetto emesso resta `useful` perché quella dimensione non è attiva.
    expect(gate.widthOverMidpoint!).toBeGreaterThan(0.35);
    expect(gate.verdict).toBe("useful");
  });
});

describe("callScreen — scelte del motore non ratificate, dichiarate nel dato", () => {
  it("la catena dichiara aperta l'identificazione V(WITHOUT) := opportunityCost", () => {
    const numbers = screen({ playerId: "a_occ" }).numbers!;
    expect(numbers.ratification.ratified).toBe(false);
    expect(numbers.ratification.unratifiedChoices).toEqual([
      "V_WITHOUT_EQUALS_OPPORTUNITY_COST",
    ]);
  });

  it("il piano B dichiara aperte sia la fascia sia la soglia del cliff", () => {
    const planB = screen({ playerId: "a_occ" }).planB!;
    expect(planB.ratification.ratified).toBe(false);
    expect(planB.ratification.unratifiedChoices).toEqual(["REGRET_BAND_LEVELS", "CLIFF_GAP_RATIO"]);
  });

  it("il width gate dichiara aperta la dimensione midpoint che non chiude", () => {
    const gate = screen({ playerId: "a_occ" }).widthGate!;
    expect(gate.ratification.ratified).toBe(false);
    expect(gate.ratification.unratifiedChoices).toEqual(["WIDTH_GATE_MIDPOINT_DIMENSION_OFF"]);
    // Anche quando è il gate a togliere i numeri, la scelta aperta viaggia.
    const wide = screen({ playerId: "a_low", values: valueBookOf([value("a_low", 400)]) });
    expect(wide.noTargetReason).toBe("band-too-wide");
    expect(wide.widthGate!.ratification.ratified).toBe(false);
  });

  /**
   * LE SCELTE APERTE CHE UNA SUPERFICIE FUORI DAL MOTORE PORTA.
   *
   * `UNRATIFIED_CHOICES` è il vocabolario del motore perché è lì che sta la
   * casa delle scelte aperte, ma non tutte le superfici che ne portano una
   * vivono qui: il sottoblocco «PER ME» (src/perMeCandidates.ts) è codice
   * d'app, e un test del motore non importa codice d'app — sarebbe il motore a
   * dipendere dall'app, cioè il confine al contrario.
   *
   * Quindi l'elenco si dichiara qui PER NOME, e la dichiarazione non è
   * autocertificata: src/perMeCandidates.test.ts §"le DUE scelte non
   * ratificate" pinna che quella lettura porti esattamente questi due
   * identificatori. Se qualcuno li togliesse di là, questo elenco resterebbe
   * qui a mentire — ed è per questo che il test di là esiste e li nomina uno
   * per uno invece di contarli.
   */
  const CARRIED_OUTSIDE_THE_ENGINE: readonly UnratifiedChoiceId[] = [
    "PER_ME_ORDER_APPEAL_REPLACES_SURPLUS",
    "PER_ME_REQUIRES_COMPLETE_ROLE_PLAN",
  ];

  it("ogni scelta aperta ha un motivo scritto, non solo un identificatore", () => {
    const screens = screen({ playerId: "a_occ" });
    const used = [
      ...screens.planB!.ratification.unratifiedChoices,
      ...screens.numbers!.ratification.unratifiedChoices,
      ...screens.widthGate!.ratification.unratifiedChoices,
      ...screens.quality.ratification.unratifiedChoices,
      // LA SECONDA SUPERFICIE che porta scelte aperte del motore: la
      // derivazione del valore assoluto (../src/absoluteValue.ts). Entra qui
      // per elenco dichiarato e non per esecuzione perché la lista che quella
      // lettura porta è la stessa su ogni ramo — e il suo contenuto è a sua
      // volta pinnato in packages/engine/tests/absoluteValue.test.ts, quindi
      // non può gonfiarsi in silenzio per far passare questo confronto.
      ...ABSOLUTE_VALUE_UNRATIFIED_CHOICES,
      ...CARRIED_OUTSIDE_THE_ENGINE,
    ];
    for (const id of used) expect(UNRATIFIED_CHOICES[id].length).toBeGreaterThan(0);
    // Nessun identificatore del vocabolario resta orfano: se se ne aggiunge uno
    // e nessuna superficie lo porta, o è morto o qualcuno se l'è dimenticato.
    expect([...new Set(used)].sort()).toEqual(Object.keys(UNRATIFIED_CHOICES).sort());
  });

  it("il piano B porta le grandezze CONTINUE sotto la fascia", () => {
    // Chi non vuole l'etichetta non ratificata mostra questi due numeri: sono
    // gli ingredienti della banda, non una seconda derivazione.
    const result = screen({ playerId: "b2", book: DENSE_BOOK, values: DENSE_VALUES });
    const planB = result.planB!;
    expect(planB.regret).toBe("medio");
    expect(planB.surplusGap).toBe(result.surplus! - planB.alternative!.surplus);
    expect(planB.cliffGapRatio).toBe(result.cliff!.gapRatio);
  });

  it("PINNA il comportamento aperto: con profilo aggressiva il tetto supera il valore", () => {
    // QUESTO TEST DOCUMENTA, NON APPROVA. §4.2 tratta V(WITHOUT) e
    // opportunityCost come grandezze distinte; identificarle è una lettura del
    // motore, e la sua conseguenza è che un piano B più ricco ALZA il tetto sul
    // giocatore che stai chiamando. Se Owner sceglie l'altra lettura, questo
    // test cambia — ed è esattamente il punto: il comportamento è pinnato,
    // quindi non può cambiare per sbaglio.
    const values = valueBookOf([value("a_occ", 40), value("a_low", 32)]);
    const ftm = (profile: ValueProfile) =>
      screen({ playerId: "a_occ", profile, values }).numbers!.fairToMeMaxEffective;
    expect(screen({ playerId: "a_occ", values }).numbers!.opportunityCost).toBe(20);
    expect(ftm("prudente")).toBe(37); // ⌊40 − 20 × 0,15⌋ — segno atteso
    expect(ftm("media")).toBe(40);
    expect(ftm("aggressiva")).toBe(43); // 43 > 40: il tetto SUPERA il valore dichiarato
    // …e cresce al migliorare del piano B: inversione di monotonicità pinnata.
    const richerPlanB = valueBookOf([value("a_occ", 40), value("a_low", 42)]);
    const withRicher = screen({
      playerId: "a_occ",
      profile: "aggressiva",
      values: richerPlanB,
    }).numbers!;
    expect(withRicher.opportunityCost).toBe(30);
    expect(withRicher.fairToMeMaxEffective).toBeGreaterThan(ftm("aggressiva"));
  });
});

describe("callScreen — ACCEPTANCE #233: i tre numeri sono sempre ≤ max_safe (D4)", () => {
  const SCENARIOS: readonly (readonly [string, readonly AuctionEvent[]])[] = [
    ["tavolo intatto", buildLog([])],
    ["mercato caldo", buildLog([
      buy("a_pari", "A", RIVAL, 70),
      buy("a_caro", "A", TEAMS[2]!, 80),
      buy("a_muto", "A", TEAMS[3]!, 25),
      buy("c_occ", "C", TEAMS[4]!, 40),
      buy("p_zero", "P", TEAMS[5]!, 9),
    ])],
    ["io quasi a secco", buildLog([
      ...fillRole(SELF, "P", 3, 30),
      ...fillRole(SELF, "D", 9, 30),
      ...fillRole(SELF, "C", 4, 30),
    ])],
    ["io con un big preso", buildLog([buy("a_caro", "A", SELF, 300)])],
    ["ruoli quasi chiusi", buildLog([
      ...fillRole(SELF, "P", 3, 2),
      ...fillRole(SELF, "D", 9, 2),
      ...fillRole(SELF, "C", 9, 2),
      ...fillRole(SELF, "A", 6, 2),
    ])],
  ];
  const CALLED = ["a_occ", "a_pari", "a_low", "c_occ", "a_caro"] as const;
  const RICH_VALUES = valueBookOf([
    value("a_occ", 60),
    value("a_pari", 40),
    value("a_caro", 480), // volutamente sopra qualunque max bid vero
    value("a_low", 20),
    value("c_occ", 45),
    value("p_zero", 0),
  ]);

  for (const [label, log] of SCENARIOS) {
    for (const profile of VALUE_PROFILES) {
      for (const playerId of CALLED) {
        it(`[${label} · ${profile} · ${playerId}] catena sotto il tetto hard-safe`, () => {
          const result = screen(
            { playerId, profile, values: RICH_VALUES, bandMargin: 25 },
            log,
          );
          if (result.numbers === null) {
            expect(result.mode).toBe("spettatore");
            expect(result.noTargetReason).not.toBeNull();
            return;
          }
          const n = result.numbers;
          const state = stateOf(log);
          const trueMaxSafe = maxSafe(state.teams[SELF]!, result.role!);
          // Il tetto non è riderivato: è esattamente `maxSafe()`.
          expect(n.maxSafe).toBe(trueMaxSafe.maxSafe);
          expect(n.chainOk).toBe(true);
          expect(n.takeUpTo).toBeGreaterThanOrEqual(COST_FLOOR);
          expect(n.takeUpTo).toBeLessThanOrEqual(n.stretchCap);
          expect(n.stretchCap).toBeLessThanOrEqual(n.fairToMeMaxEffective);
          expect(n.fairToMeMaxEffective).toBeLessThanOrEqual(n.maxSafe);
          // Terzo numero decisionale: il piano B deve essere davvero comprabile.
          const alternative = result.planB?.alternative ?? null;
          if (alternative !== null) {
            expect(alternative.correctedAnchor).toBeLessThanOrEqual(n.maxSafe);
          }
        });
      }
    }
  }

  it("un valore dichiarato enorme viene tagliato dal tetto contabile, non lo sfonda", () => {
    const result = screen({ playerId: "a_caro", values: RICH_VALUES }, buildLog([
      ...fillRole(SELF, "P", 3, 30),
      ...fillRole(SELF, "D", 9, 30),
      ...fillRole(SELF, "C", 4, 30),
    ]));
    const n = result.numbers!;
    expect(n.fairToMeMaxRaw).toBeGreaterThan(n.maxSafe);
    expect(n.fairToMeMaxEffective).toBe(n.maxSafe);
    expect(n.stretchCap).toBe(n.maxSafe);
  });
});

describe("callScreen — piano B e costo del rimpianto", () => {
  it("rimpianto ALTO quando dopo di lui la scala salta (cliff)", () => {
    const result = screen({ playerId: "a_occ" });
    expect(result.cliff!.isCliff).toBe(true);
    expect(result.planB!.regret).toBe("alto");
    expect(result.planB!.drivers).toContain("cliff-after");
  });

  it("rimpianto ALTO quando non resta nessun ripiego comprabile", () => {
    const result = screen({ playerId: "c_occ" });
    expect(result.planB!.alternative).toBeNull();
    expect(result.planB!.regret).toBe("alto");
    expect(result.planB!.drivers).toContain("no-affordable-alternative");
  });

  it("rimpianto BASSO quando l'alternativa rende almeno quanto lui", () => {
    const result = screen({ playerId: "b1", book: DENSE_BOOK, values: DENSE_VALUES });
    expect(result.cliff!.isCliff).toBe(false);
    expect(result.planB!.alternative!.playerId).toBe("b2"); // surplus 15 ≥ 10
    expect(result.planB!.regret).toBe("basso");
  });

  it("rimpianto MEDIO quando l'alternativa rende meno di lui", () => {
    const result = screen({ playerId: "b2", book: DENSE_BOOK, values: DENSE_VALUES });
    expect(result.planB!.alternative!.playerId).toBe("b1"); // surplus 10 < 15
    expect(result.planB!.regret).toBe("medio");
    expect(result.planB!.drivers).toEqual(["alternative-surplus-lower"]);
  });

  it("il piano B non propone un giocatore già assegnato", () => {
    const result = screen({ playerId: "a_occ" }, buildLog([buy("a_low", "A", RIVAL, 13)]));
    expect(result.planB!.alternative?.playerId).not.toBe("a_low");
  });

  it("bestAlternative tiene i ripieghi a surplus negativo: sono comunque uno slot riempito", () => {
    const state = stateOf([]);
    const alternative = bestAlternative({
      excludePlayerId: "a_occ",
      role: "A",
      book: BOOK,
      values: valueBookOf([value("a_occ", 60), value("a_caro", 20)]),
      state,
      inflation: measuredInflation([], BOOK),
      plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
      maxBid: maxSafe(state.teams[SELF]!, "A").maxSafe,
    });
    expect(alternative).not.toBeNull();
    expect(alternative!.playerId).toBe("a_caro");
    expect(alternative!.surplus).toBeLessThan(0);
  });

  it("bestAlternative scarta ciò che il max bid vero non copre", () => {
    const state = stateOf([]);
    const alternative = bestAlternative({
      excludePlayerId: "a_occ",
      role: "A",
      book: BOOK,
      values: VALUES,
      state,
      inflation: measuredInflation([], BOOK),
      plan: livePlan({ team: state.teams[SELF]!, plan: DECLARED_PLAN }),
      maxBid: 11,
    });
    expect(alternative).toBeNull();
  });
});

describe("callScreen — barra live prezzo corrente vs atteso", () => {
  const cases: readonly (readonly [number, string])[] = [
    [25, "dentro-il-piano"],
    [30, "dentro-il-piano"],
    [45, "in-stretch"],
    [60, "in-stretch"],
    [61, "oltre-lo-stop"],
    [10_000, "oltre-max-safe"],
  ];

  it.each(cases)("prezzo %i ⇒ %s", (currentPrice, status) => {
    const result = screen({ playerId: "a_occ", currentPrice });
    expect(result.livePrice!.status).toBe(status);
    expect(result.livePrice!.vsCurrentAnchor).toBe(currentPrice - result.anchor!.correctedAnchor);
  });

  it("senza prezzo corrente, o con un prezzo che non è un prezzo, non inventa una barra", () => {
    expect(screen({ playerId: "a_occ" }).livePrice).toBeNull();
    expect(screen({ playerId: "a_occ", currentPrice: Number.NaN }).livePrice).toBeNull();
    expect(screen({ playerId: "a_occ", currentPrice: Number.POSITIVE_INFINITY }).livePrice).toBeNull();
    expect(screen({ playerId: "a_occ", currentPrice: -1 }).livePrice).toBeNull();
  });
});

describe("callScreen — determinismo e riuso dello strato 2", () => {
  it("stesso stato e stessi listini ⇒ stessa schermata", () => {
    expect(screen({ playerId: "a_occ" })).toEqual(screen({ playerId: "a_occ" }));
  });

  it("porta tensione, insieme eleggibile e cliff dello strato 2, non copie locali", () => {
    const result = screen({ playerId: "a_occ" });
    expect(result.tension!.band).not.toBeUndefined();
    expect(result.competitors!.basis).toBe("hard-constraints");
    expect(result.competitors!.threshold).toBe(result.anchor!.correctedAnchor);
    expect(result.cliff!.playerId).toBe("a_occ");
  });

  it("non produce nessun campo di intervallo di prezzo (divieto di forma §D9)", () => {
    const numbers = screen({ playerId: "a_occ" }).numbers!;
    const keys = Object.keys(numbers as unknown as Record<string, unknown>);
    for (const forbidden of ["priceRange", "bandLower", "priceLow", "priceHigh", "predictedPrice"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
