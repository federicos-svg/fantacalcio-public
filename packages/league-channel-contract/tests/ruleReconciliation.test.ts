import { describe, expect, it } from "vitest";

import { defenceModifier } from "../../league-gameweek/src/leagueGameweek.js";
import {
  EXPECTED_DEFENCE_BANDS,
  reconcileWithLeagueRules,
  reconciledFieldNames,
} from "../src/ruleReconciliation.js";
import { validateObservedLeagueSettings } from "../src/leagueSettings.js";
import { SETTINGS_IN_ACCORDO } from "./fixtures.js";

describe("riconciliazione col regolamento", () => {
  it("impostazioni che concordano su tutto: nessuna divergenza, nessuna lacuna, si gioca", () => {
    const outcome = reconcileWithLeagueRules(SETTINGS_IN_ACCORDO);
    expect(outcome.divergences).toEqual([]);
    expect(outcome.notObserved).toEqual([]);
    expect(outcome.agreements).toHaveLength(reconciledFieldNames().length);
    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.leagueRuleVersion).toBe("2026_27_v1");
  });

  it("una divergenza sul modificatore modulo mette safeToPlay a false", () => {
    // Il 3-4-3 regala 1,5 punti all'avversario. Una lega che ne regalasse 1,0
    // starebbe giocando un'altra partita, e ogni proposta del Coach sarebbe
    // tarata su un costo del modulo che non esiste.
    const outcome = reconcileWithLeagueRules({
      ...SETTINGS_IN_ACCORDO,
      moduleModifier: { ...SETTINGS_IN_ACCORDO.moduleModifier, "343": 1.0 },
    });

    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences).toEqual([
      {
        field: "moduleModifier.343",
        section: "§9",
        impact: "punteggio",
        expected: 1.5,
        observed: 1.0,
      },
    ]);
    // Tutti gli altri campi restano concordi: la divergenza è isolata, non
    // contagiosa.
    expect(outcome.agreements).toHaveLength(reconciledFieldNames().length - 1);
    expect(outcome.notObserved).toEqual([]);
  });

  it("i campi non osservati finiscono in notObserved e non diventano divergenze", () => {
    // La piattaforma non espone il tetto delle sostituzioni né la soglia goal:
    // non conferma e non smentisce, quindi resta autorità il regolamento e il
    // Coach può giocare. Trattare l'assenza come conferma sarebbe dichiarare un
    // accordo che nessuno ha dato; trattarla come divergenza bloccherebbe una
    // lega perfettamente regolare.
    const parziale = { ...SETTINGS_IN_ACCORDO };
    delete (parziale as { maxSubstitutions?: number }).maxSubstitutions;
    delete (parziale as { firstGoalThreshold?: number }).firstGoalThreshold;

    const outcome = reconcileWithLeagueRules(parziale);

    expect(outcome.divergences).toEqual([]);
    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.notObserved.map((entry) => entry.field)).toEqual([
      "maxSubstitutions",
      "firstGoalThreshold",
    ]);
    expect(outcome.notObserved.map((entry) => entry.expected)).toEqual([5, 66]);
    expect(outcome.agreements).toHaveLength(reconciledFieldNames().length - 2);
  });

  it("l'ordine di moduli e fasce non è una regola: nessuna divergenza se cambia", () => {
    const outcome = reconcileWithLeagueRules({
      ...SETTINGS_IN_ACCORDO,
      allowedModules: ["343", "433", "352", "442", "532", "451", "541"],
      defenceBands: [
        { minAverage: 6.0, bonus: 1 },
        { minAverage: 7.0, bonus: 6 },
        { minAverage: 6.5, bonus: 3 },
      ],
    });
    expect(outcome.divergences).toEqual([]);
    expect(outcome.safeToPlay).toBe(true);
  });

  it("un modulo mancante nella tabella osservata è una lacuna, non uno zero", () => {
    const senza343 = { ...SETTINGS_IN_ACCORDO.moduleModifier };
    delete senza343["343"];
    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, moduleModifier: senza343 });

    expect(outcome.divergences).toEqual([]);
    expect(outcome.notObserved.map((entry) => entry.field)).toEqual(["moduleModifier.343"]);
    expect(outcome.safeToPlay).toBe(true);
  });

  it("i punti di classifica divergono senza bloccare: cambiano l'obiettivo, non il punteggio", () => {
    // Con 2/1/0 invece di 3/1/0 molte scelte di varianza si ribalterebbero
    // (§22), ma la formazione resta legale e il punteggio identico: si registra
    // e si porta a Pico, non si blocca la giornata.
    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, pointsWin: 2 });

    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.divergences).toEqual([
      { field: "pointsWin", section: "§22", impact: "obiettivo", expected: 3, observed: 2 },
    ]);
  });

  it("il confronto è esatto: un millesimo è una divergenza, non un arrotondamento", () => {
    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, midfieldMaxDelta: 3.501 });
    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences).toHaveLength(1);
    expect(outcome.divergences[0]?.observed).toBe(3.501);
  });

  it("le fasce dichiarate di §19 dicono quel che dice defenceModifier, ai bordi", () => {
    // La tabella attesa è una ridichiarazione, e una ridichiarazione che
    // nessuno controlla diverge in silenzio. Qui si interroga l'autorità.
    const bonusAt = (average: number): number =>
      defenceModifier({
        goalkeeperBaseVote: average,
        defenderBaseVotes: [average, average, average, average],
      }).value;

    for (const [index, band] of EXPECTED_DEFENCE_BANDS.entries()) {
      expect(bonusAt(band.minAverage)).toBe(band.bonus);
      const successiva = EXPECTED_DEFENCE_BANDS[index + 1];
      expect(bonusAt(band.minAverage - 0.01)).toBe(successiva === undefined ? 0 : successiva.bonus);
    }
  });
});

describe("riconciliazione per competizione", () => {
  it("una regola diversa in coppa è una divergenza dichiarata, mai una media", () => {
    // La coppa non ha la classifica del campionato (§23): se la piattaforma
    // dichiara altri punti per la coppa, i due valori sono due fatti e restano
    // due voci separate. Nessuno dei due viene mediato o fatto prevalere.
    const outcome = reconcileWithLeagueRules({
      ...SETTINGS_IN_ACCORDO,
      perCompetition: [{ competitionId: "c2", settings: { pointsWin: 0, pointsDraw: 0 } }],
    });

    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.divergences).toEqual([
      {
        field: "competizione:c2.pointsWin",
        section: "§22",
        impact: "obiettivo",
        expected: 3,
        observed: 0,
      },
      {
        field: "competizione:c2.pointsDraw",
        section: "§22",
        impact: "obiettivo",
        expected: 1,
        observed: 0,
      },
    ]);
    // Il blocco per competizione dichiara due campi: gli altri non sono lacune,
    // sono «nessuna regola propria», e non entrano in notObserved.
    expect(outcome.notObserved).toEqual([]);
  });

  it("una regola di PUNTEGGIO diversa in una competizione blocca comunque", () => {
    // L'aritmetica del punteggio è la stessa in campionato e in coppa: una
    // competizione che dichiarasse un altro fattore campo starebbe contando in
    // un altro modo, e il Coach non schiera.
    const outcome = reconcileWithLeagueRules({
      ...SETTINGS_IN_ACCORDO,
      perCompetition: [{ competitionId: "c2", settings: { homeFieldBonus: 0 } }],
    });

    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences).toEqual([
      {
        field: "competizione:c2.homeFieldBonus",
        section: "§14",
        impact: "punteggio",
        expected: 2,
        observed: 0,
      },
    ]);
  });
});

describe("validazione di forma", () => {
  it("le impostazioni in accordo non hanno problemi di forma", () => {
    expect(validateObservedLeagueSettings(SETTINGS_IN_ACCORDO)).toEqual([]);
  });

  it("i problemi di forma sono elencati, non lanciati, e portano il prefisso del blocco", () => {
    const problemi = validateObservedLeagueSettings({
      maxSubstitutions: -1,
      allowedModules: [],
      perCompetition: [{ competitionId: "c2", settings: { firstGoalThreshold: 0 } }],
    });
    expect(problemi).toEqual([
      "maxSubstitutions: atteso intero >= 0, osservato -1",
      "allowedModules: lista vuota osservata (nessun modulo schierabile)",
      "perCompetition.c2.firstGoalThreshold: atteso intero >= 1, osservato 0",
    ]);
  });
});
