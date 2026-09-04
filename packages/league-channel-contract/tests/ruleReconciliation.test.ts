import { describe, expect, it } from "vitest";

import {
  MIDFIELD_MAX_DELTA,
  defenceModifier,
} from "../../league-gameweek/src/leagueGameweek.js";
import { FANTAVOTO_TARIFF } from "../../appeal-index/src/fantavoto.js";
import {
  EXPECTED_ATTACK_TABLE,
  EXPECTED_DEFENCE_BANDS,
  EXPECTED_MIDFIELD_TABLE,
  reconcileWithLeagueRules,
  reconciledFieldNames,
} from "../src/ruleReconciliation.js";
import type { ObservedDefenceBand } from "../src/leagueSettings.js";
import { validateObservedLeagueSettings } from "../src/leagueSettings.js";
import { SETTINGS_IN_ACCORDO } from "./fixtures.js";

describe("riconciliazione col regolamento", () => {
  it("impostazioni che concordano su tutto: nessuna divergenza, nessuna lacuna, si gioca", () => {
    const outcome = reconcileWithLeagueRules(SETTINGS_IN_ACCORDO);
    expect(outcome.divergences).toEqual([]);
    expect(outcome.notObserved).toEqual([]);
    expect(outcome.agreements).toHaveLength(reconciledFieldNames().length);
    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.essentialNotObserved).toBe(0);
    expect(outcome.leagueRuleVersion).toBe("2026_27_v1");
  });

  it("safeToPlay non basta da solo: su una lettura vuota è true e il contatore lo dice", () => {
    // «Nessuno ha smentito il regolamento» non è «la piattaforma conferma il
    // regolamento». Il booleano da solo confonderebbe i due, e il contatore è
    // la metà mancante della risposta.
    const outcome = reconcileWithLeagueRules({});
    expect(outcome.agreements).toEqual([]);
    expect(outcome.divergences).toEqual([]);
    expect(outcome.safeToPlay).toBe(true);
    expect(outcome.essentialNotObserved).toBeGreaterThan(0);
    expect(outcome.essentialNotObserved).toBe(
      outcome.notObserved.filter((entry) => entry.impact === "punteggio").length,
    );
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

  it("la tabella del modificatore attacco alterata di un gradino blocca (§21)", () => {
    // 7.0 vale +1: dichiararlo +1,5 sposterebbe ogni scelta d'attacco.
    const alterata = EXPECTED_ATTACK_TABLE.map((row) =>
      row.vote === 7.0 ? { vote: 7.0, bonus: 1.5 } : row,
    );
    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, attackTable: alterata });
    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences.map((d) => d.field)).toEqual(["attackTable"]);
    expect(outcome.divergences[0]?.impact).toBe("punteggio");
  });

  it("la scala del modificatore centrocampo alterata di un gradino blocca (§20)", () => {
    const alterata = EXPECTED_MIDFIELD_TABLE.map((row) =>
      row.difference === 4.0 ? { difference: 4.0, delta: 2.5 } : row,
    );
    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, midfieldTable: alterata });
    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences.map((d) => d.field)).toEqual(["midfieldTable"]);
  });

  it("le due tabelle attese sono derivate dall'autorità, non ricopiate", () => {
    // Il tetto della scala di §20 è l'unico numero trascritto: se fosse
    // sbagliato, l'ultima riga derivata non porterebbe il delta massimo.
    expect(EXPECTED_ATTACK_TABLE).toEqual([
      { vote: 6.0, bonus: 0 },
      { vote: 6.5, bonus: 0.5 },
      { vote: 7.0, bonus: 1 },
      { vote: 7.5, bonus: 1.5 },
      { vote: 8.0, bonus: 2 },
    ]);
    expect(EXPECTED_MIDFIELD_TABLE).toHaveLength(11);
    expect(EXPECTED_MIDFIELD_TABLE.at(-1)).toEqual({ difference: 7.0, delta: MIDFIELD_MAX_DELTA });
  });

  it("la tariffa di §12 e la platea di §12-bis sono confrontate contro le costanti del core", () => {
    // La leva di punteggio più grande del regolamento: senza queste righe, un
    // gol dichiarato +4 sarebbe passato come «tutto in accordo».
    const outcome = reconcileWithLeagueRules({
      ...SETTINGS_IN_ACCORDO,
      bonusMalusTariff: { ...SETTINGS_IN_ACCORDO.bonusMalusTariff, Gf: 4 },
      goalConcededMalusRoles: ["P", "D"],
    });
    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences).toEqual([
      {
        field: "bonusMalusTariff.Gf",
        section: "§12",
        impact: "punteggio",
        expected: FANTAVOTO_TARIFF.Gf,
        observed: 4,
      },
      {
        field: "goalConcededMalusRoles",
        section: "§12-bis",
        impact: "punteggio",
        expected: ["P"],
        observed: ["P", "D"],
      },
    ]);
  });

  it("un insieme con valori scritti come testo diverge, non concorda", () => {
    // Una chiave costruita per interpolazione avrebbe detto «uguale»: il buco
    // stava proprio dove il pacchetto esiste per non averne. Il confronto è
    // fail-closed sul tipo, e non dipende dal fatto che il chiamante abbia
    // chiamato prima il validatore.
    const testuali = [
      { minAverage: "7", bonus: "6" },
      { minAverage: "6.5", bonus: "3" },
      { minAverage: "6", bonus: "1" },
    ] as unknown as readonly ObservedDefenceBand[];

    const outcome = reconcileWithLeagueRules({ ...SETTINGS_IN_ACCORDO, defenceBands: testuali });
    expect(outcome.safeToPlay).toBe(false);
    expect(outcome.divergences.map((d) => d.field)).toEqual(["defenceBands"]);
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
