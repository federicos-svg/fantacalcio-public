import { describe, it, expect } from "vitest";
import {
  ATTACK_MAX_BONUS,
  DEFENCE_MIN_DEFENDERS_WITH_VOTE,
  HOME_FIELD_BONUS,
  LEAGUE_RULE_VERSION,
  MIDFIELD_FICTITIOUS_VOTE,
  MODULES,
  MISSING_LINEUP_POLICY,
  NEUTRAL_GROUND_FROM_MATCHDAY,
  SUBSTITUTION_RULES,
  SV_VALUES_SEMANTICS_UNCONFIRMED,
  attackModifier,
  defenceModifier,
  homeFieldBonus,
  midfieldModifier,
  moduleShape,
  modulePointsToOpponent,
  scoreToGoals,
  strikerAttackModifier,
  type Module,
} from "../src/index.js";

// GOLDEN FIXTURE DEL REGOLAMENTO. Ogni numero qui sotto è copiato dal
// regolamento di lega versionato, non calcolato da questo codice: se una
// regola cambia, questi test devono rompersi PRIMA che si rompa una decisione.

describe("versione del regolamento", () => {
  it("è stampata su ogni esito, perché un numero senza la sua regola non è riproducibile", () => {
    expect(LEAGUE_RULE_VERSION).toBe("2026_27_v1");
    expect(defenceModifier({ goalkeeperBaseVote: 6, defenderBaseVotes: [6, 6, 6, 6] }).leagueRuleVersion).toBe(
      LEAGUE_RULE_VERSION,
    );
    expect(midfieldModifier({ ourBaseVotes: [6], theirBaseVotes: [6] }).leagueRuleVersion).toBe(LEAGUE_RULE_VERSION);
    expect(attackModifier([]).leagueRuleVersion).toBe(LEAGUE_RULE_VERSION);
    expect(scoreToGoals(70, 66).leagueRuleVersion).toBe(LEAGUE_RULE_VERSION);
  });
});

describe("moduli e modificatore modulo", () => {
  it("copre i sette moduli schierabili e nient'altro", () => {
    expect([...MODULES]).toEqual(["541", "451", "532", "442", "352", "433", "343"]);
  });

  it("assegna a ogni modulo la sua forma D-C-A, dieci giocatori più il portiere", () => {
    for (const module of MODULES) {
      const shape = moduleShape(module);
      expect(shape.defenders + shape.midfielders + shape.strikers).toBe(10);
      expect(`${shape.defenders}${shape.midfielders}${shape.strikers}`).toBe(module);
    }
  });

  it("regala punti ALL'AVVERSARIO, ed è la regola che rende sbagliato «massimizza il mio punteggio»", () => {
    expect(modulePointsToOpponent("541")).toBe(-1.5);
    expect(modulePointsToOpponent("451")).toBe(-1.0);
    expect(modulePointsToOpponent("532")).toBe(-0.5);
    expect(modulePointsToOpponent("442")).toBe(0);
    expect(modulePointsToOpponent("352")).toBe(0.5);
    expect(modulePointsToOpponent("433")).toBe(1.0);
    expect(modulePointsToOpponent("343")).toBe(1.5);
  });

  it("il modulo più offensivo costa un quarto di fascia goal all'avversario in regalo", () => {
    // 1.5 punti su una fascia larga 6: se qualcuno rendesse questo numero zero,
    // il test dice quanto vale l'errore invece di limitarsi a fallire.
    expect(modulePointsToOpponent("343") / 6).toBeCloseTo(0.25, 10);
  });

  it("rifiuta un modulo che non esiste invece di indovinarne la forma", () => {
    expect(() => moduleShape("4222" as Module)).toThrow(/modulo sconosciuto/);
    expect(() => modulePointsToOpponent("4222" as Module)).toThrow(/modulo sconosciuto/);
  });
});

describe("fattore campo", () => {
  it("vale +2 fino alla 28ª", () => {
    expect(homeFieldBonus(1)).toBe(HOME_FIELD_BONUS);
    expect(homeFieldBonus(28)).toBe(2);
  });

  it("sparisce dalla 29ª, quando si gioca in campo neutro", () => {
    expect(homeFieldBonus(NEUTRAL_GROUND_FROM_MATCHDAY)).toBe(0);
    expect(homeFieldBonus(38)).toBe(0);
  });

  it("rifiuta una giornata che non esiste", () => {
    expect(() => homeFieldBonus(0)).toThrow(/giornata non valida/);
    expect(() => homeFieldBonus(2.5)).toThrow(/giornata non valida/);
  });
});

describe("modificatore difesa", () => {
  it("non si attiva senza il portiere, e lo dice invece di valere zero", () => {
    const out = defenceModifier({ goalkeeperBaseVote: null, defenderBaseVotes: [7, 7, 7, 7] });
    expect(out.applied).toBe(false);
    expect(out.value).toBe(0);
    expect(out.reason).toMatch(/portiere/);
  });

  it("non si attiva con tre soli difensori a voto, per quanto alti siano i voti", () => {
    // È la soglia che il recap della Fase 2 non conosce: tre 10 non bastano.
    const out = defenceModifier({ goalkeeperBaseVote: 7, defenderBaseVotes: [10, 10, 10] });
    expect(out.applied).toBe(false);
    expect(out.value).toBe(0);
    expect(out.reason).toContain(`ne servono ${DEFENCE_MIN_DEFENDERS_WITH_VOTE}`);
  });

  it("con quattro difensori a voto usa il portiere più i TRE migliori", () => {
    // Portiere 7, difensori 8/7/6/3: i tre migliori sono 8/7/6, media
    // (7+8+7+6)/4 = 7.0 -> +6. Il 3 non entra: se entrasse la media sarebbe 6.25.
    const out = defenceModifier({ goalkeeperBaseVote: 7, defenderBaseVotes: [8, 7, 6, 3] });
    expect(out.applied).toBe(true);
    expect(out.value).toBe(6);
  });

  it("applica le tre fasce e lo zero sotto il 6", () => {
    expect(defenceModifier({ goalkeeperBaseVote: 7, defenderBaseVotes: [7, 7, 7, 7] }).value).toBe(6);
    expect(defenceModifier({ goalkeeperBaseVote: 6.5, defenderBaseVotes: [6.5, 6.5, 6.5, 6] }).value).toBe(3);
    expect(defenceModifier({ goalkeeperBaseVote: 6, defenderBaseVotes: [6, 6, 6, 6] }).value).toBe(1);
    expect(defenceModifier({ goalkeeperBaseVote: 5, defenderBaseVotes: [5, 5, 5, 5] }).value).toBe(0);
  });

  it("il confine di fascia sta dove lo mette il regolamento, non mezzo punto più in là", () => {
    // Quattro difensori a voto in entrambi i casi: qui si misura la fascia, non
    // la soglia di attivazione. Media esattamente 6.5 -> +3; media 6.49 -> +1.
    expect(defenceModifier({ goalkeeperBaseVote: 6.5, defenderBaseVotes: [6.5, 6.5, 6.5, 6.5] }).value).toBe(3);
    expect(defenceModifier({ goalkeeperBaseVote: 6.5, defenderBaseVotes: [6.5, 6.5, 6.46, 6] }).value).toBe(1);
  });
});

describe("modificatore centrocampo", () => {
  it("pareggia il numero di centrocampisti con voti fittizi da 5", () => {
    // Noi tre da 7 (21), loro cinque da 6 (30). A noi si aggiungono due 5:
    // 21 + 10 = 31 contro 30, differenza 1 -> sotto soglia, nessuno si muove.
    const out = midfieldModifier({ ourBaseVotes: [7, 7, 7], theirBaseVotes: [6, 6, 6, 6, 6] });
    expect(out.ourTotal).toBe(31);
    expect(out.theirTotal).toBe(30);
    expect(out.difference).toBe(1);
    expect(out.ourDelta).toBe(0);
    expect(out.theirDelta).toBe(0);
  });

  it("il voto fittizio vale 5, e si vede quando la differenza dipende solo da lui", () => {
    // Noi quattro da 6 (24) + un fittizio da 5 = 29; loro cinque da 6 = 30.
    const out = midfieldModifier({ ourBaseVotes: [6, 6, 6, 6], theirBaseVotes: [6, 6, 6, 6, 6] });
    expect(MIDFIELD_FICTITIOUS_VOTE).toBe(5);
    expect(out.ourTotal).toBe(29);
    expect(out.theirTotal).toBe(30);
  });

  it("sotto 2.0 di differenza non muove niente", () => {
    const out = midfieldModifier({ ourBaseVotes: [7, 7], theirBaseVotes: [6, 6.5] });
    expect(out.difference).toBe(1.5);
    expect(out.ourDelta).toBe(0);
    expect(out.tabulated).toBe(true);
  });

  it("applica la tabella e la applica in modo simmetrico", () => {
    const win = midfieldModifier({ ourBaseVotes: [8, 8], theirBaseVotes: [6, 6] });
    expect(win.difference).toBe(4);
    expect(win.ourDelta).toBe(2);
    expect(win.theirDelta).toBe(-2);

    const lose = midfieldModifier({ ourBaseVotes: [6, 6], theirBaseVotes: [8, 8] });
    expect(lose.ourDelta).toBe(-2);
    expect(lose.theirDelta).toBe(2);
  });

  it("copre tutti i gradini tabulati", () => {
    const cases: ReadonlyArray<readonly [difference: number, delta: number]> = [
      [2.0, 1],
      [2.5, 1],
      [3.0, 1.5],
      [3.5, 1.5],
      [4.0, 2],
      [4.5, 2],
      [5.0, 2.5],
      [5.5, 2.5],
      [6.0, 3],
      [6.5, 3],
      [7.0, 3.5],
      [12.0, 3.5],
    ];
    for (const [difference, delta] of cases) {
      const out = midfieldModifier({ ourBaseVotes: [6 + difference], theirBaseVotes: [6] });
      expect(out.difference).toBeCloseTo(difference, 10);
      expect(out.ourDelta).toBe(delta);
      expect(out.tabulated).toBe(true);
    }
  });

  it("una differenza fuori tabella non viene arrotondata di nascosto", () => {
    // Il regolamento vieta di interpolare: l'esito lo dichiara invece di
    // scegliere il gradino più vicino.
    const out = midfieldModifier({ ourBaseVotes: [8.2], theirBaseVotes: [6] });
    expect(out.difference).toBeCloseTo(2.2, 10);
    expect(out.tabulated).toBe(false);
    expect(out.ourDelta).toBe(0);
    expect(out.reason).toMatch(/vieta di interpolare/);
  });
});

describe("modificatore attacco", () => {
  it("esclude chi ha ricevuto un bonus — assist compresi (correzione 2026-08-21)", () => {
    // È la differenza fra la regola vera e quella descritta nel recap: chi
    // serve un assist NON prende il modificatore.
    const conAssist = strikerAttackModifier({ baseVote: 7, receivedAnyBonus: true, missedPenalty: false });
    expect(conAssist.eligible).toBe(false);
    expect(conAssist.bonus).toBe(0);
    expect(conAssist.reason).toMatch(/bonus/);
  });

  it("esclude il voto insufficiente, il senza voto e il rigore sbagliato", () => {
    expect(strikerAttackModifier({ baseVote: 5.5, receivedAnyBonus: false, missedPenalty: false }).eligible).toBe(false);
    expect(strikerAttackModifier({ baseVote: null, receivedAnyBonus: false, missedPenalty: false }).eligible).toBe(
      false,
    );
    expect(strikerAttackModifier({ baseVote: 7, receivedAnyBonus: false, missedPenalty: true }).eligible).toBe(false);
  });

  it("applica la tabella dei voti tabulati", () => {
    const bonusFor = (baseVote: number): number =>
      strikerAttackModifier({ baseVote, receivedAnyBonus: false, missedPenalty: false }).bonus;
    expect(bonusFor(6.0)).toBe(0);
    expect(bonusFor(6.5)).toBe(0.5);
    expect(bonusFor(7.0)).toBe(1);
    expect(bonusFor(7.5)).toBe(1.5);
    expect(bonusFor(8.0)).toBe(ATTACK_MAX_BONUS);
    expect(bonusFor(9.5)).toBe(ATTACK_MAX_BONUS);
  });

  it("un voto sufficiente fuori tabella resta eleggibile ma non riceve un valore inventato", () => {
    const out = strikerAttackModifier({ baseVote: 6.75, receivedAnyBonus: false, missedPenalty: false });
    expect(out.eligible).toBe(true);
    expect(out.tabulated).toBe(false);
    expect(out.bonus).toBe(0);
    expect(out.reason).toMatch(/vieta di interpolare/);
  });

  it("il modificatore di squadra è la somma degli eleggibili, e segnala se qualcuno era fuori tabella", () => {
    const out = attackModifier([
      { baseVote: 7, receivedAnyBonus: false, missedPenalty: false }, // +1
      { baseVote: 8, receivedAnyBonus: false, missedPenalty: false }, // +2
      { baseVote: 9, receivedAnyBonus: true, missedPenalty: false }, // escluso: ha segnato
    ]);
    expect(out.value).toBe(3);
    expect(out.fullyTabulated).toBe(true);
    expect(out.perStriker).toHaveLength(3);

    const conFuoriTabella = attackModifier([{ baseVote: 6.75, receivedAnyBonus: false, missedPenalty: false }]);
    expect(conFuoriTabella.fullyTabulated).toBe(false);
  });

  it("una squadra senza attaccanti eleggibili vale zero, e non è un errore", () => {
    expect(attackModifier([]).value).toBe(0);
  });
});

describe("conversione punteggio -> goal", () => {
  it("riproduce gli esempi del regolamento", () => {
    expect(scoreToGoals(70, 66)).toMatchObject({ ourGoals: 2, theirGoals: 1 });
    expect(scoreToGoals(65, 55)).toMatchObject({ ourGoals: 1, theirGoals: 0 });
  });

  it("sotto la soglia non si segna", () => {
    expect(scoreToGoals(65, 64)).toMatchObject({ ourGoals: 0, theirGoals: 0 });
  });

  it("conta le fasce da 6 a partire da 66", () => {
    expect(scoreToGoals(66, 0).ourGoals).toBe(1);
    expect(scoreToGoals(71.5, 0).ourGoals).toBe(1);
    expect(scoreToGoals(72, 0).ourGoals).toBe(2);
    expect(scoreToGoals(78, 0).ourGoals).toBe(3);
  });

  it("dentro la stessa fascia un distacco di 4 vale un goal in più", () => {
    // 71 e 66 stanno entrambe nella prima fascia: distacco 5 >= 4.
    const out = scoreToGoals(71, 66);
    expect(out.ourGoals).toBe(2);
    expect(out.theirGoals).toBe(1);
    expect(out.reason).toMatch(/stessa fascia/);
  });

  it("dentro la stessa fascia un distacco di 3.5 non basta", () => {
    const out = scoreToGoals(69.5, 66);
    expect(out.ourGoals).toBe(1);
    expect(out.theirGoals).toBe(1);
  });

  it("entrambe sotto soglia, dieci punti di distacco valgono un goal", () => {
    const out = scoreToGoals(65, 55);
    expect(out.ourGoals).toBe(1);
    expect(out.theirGoals).toBe(0);
    expect(out.reason).toMatch(/entrambe sotto/);
  });

  it("entrambe sotto soglia, nove punti di distacco non bastano", () => {
    expect(scoreToGoals(64, 55)).toMatchObject({ ourGoals: 0, theirGoals: 0 });
  });

  it("è simmetrica: invertire i punteggi inverte i goal", () => {
    const diretta = scoreToGoals(71, 66);
    const inversa = scoreToGoals(66, 71);
    expect(inversa.ourGoals).toBe(diretta.theirGoals);
    expect(inversa.theirGoals).toBe(diretta.ourGoals);
  });
});

describe("vincoli dichiarati, non ancora simulati", () => {
  it("porta i numeri delle sostituzioni in un posto solo", () => {
    expect(SUBSTITUTION_RULES).toEqual({ maxSubstitutions: 5, sameRoleOnly: true, moduleChangeAllowed: false });
  });

  it("dichiara che la formazione mancante ricade sulla precedente", () => {
    // Per il Coach non è burocrazia: è la baseline più economica per modellare
    // la formazione dell'avversario.
    expect(MISSING_LINEUP_POLICY.fallbackToPreviousMatchday).toBe(true);
    expect(MISSING_LINEUP_POLICY.firstMatchdayScoreWithoutPrevious).toBe(0);
  });

  it("espone i valori del senza voto SENZA usarli, perché la loro semantica non è confermata", () => {
    expect(SV_VALUES_SEMANTICS_UNCONFIRMED).toEqual({
      goalkeeper: 6,
      playerWithYellowCard: 5,
      playerWithRedCard: 4,
      officeReserve: "prohibited",
    });
    // Nessun calcolo li legge: un senza voto non entra in nessuna delle
    // funzioni di questo modulo finché il committente non dice che cosa vale.
    expect(defenceModifier({ goalkeeperBaseVote: null, defenderBaseVotes: [7, 7, 7, 7] }).value).toBe(0);
  });
});
