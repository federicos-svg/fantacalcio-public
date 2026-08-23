import { describe, it, expect } from "vitest";
import {
  ATTACK_MIN_SUFFICIENT_VOTE,
  DEFENSE_MIN_VALID_DEFENDERS,
  MIDFIELD_FICTITIOUS_VOTE,
  attackModifier,
  attackTableBonus,
  defenseModifier,
  midfieldModifier,
} from "../src/genProtocol/modCalc.js";

/**
 * Le tre tabelle di LEAGUE_RULES §19/§20/§21, TRASCRITTE A MANO dal
 * regolamento. Nessun valore qui e' letto dalle costanti del modulo
 * sorvegliato: sono la prova per mutazione: cambiare una banda nel codice
 * senza cambiarla nel regolamento rende rossa la suite.
 */
const DEFENSE_TABLE_19: readonly { readonly average: number; readonly bonus: number }[] = [
  { average: 5.99, bonus: 0 },
  { average: 6.0, bonus: 1 },
  { average: 6.49, bonus: 1 },
  { average: 6.5, bonus: 3 },
  { average: 6.99, bonus: 3 },
  { average: 7.0, bonus: 6 },
  { average: 9.0, bonus: 6 },
];

const MIDFIELD_TABLE_20: readonly { readonly difference: number; readonly magnitude: number }[] = [
  { difference: 0, magnitude: 0 },
  { difference: 1.5, magnitude: 0 },
  { difference: 2.0, magnitude: 1 },
  { difference: 2.5, magnitude: 1 },
  { difference: 3.0, magnitude: 1.5 },
  { difference: 3.5, magnitude: 1.5 },
  { difference: 4.0, magnitude: 2 },
  { difference: 4.5, magnitude: 2 },
  { difference: 5.0, magnitude: 2.5 },
  { difference: 5.5, magnitude: 2.5 },
  { difference: 6.0, magnitude: 3 },
  { difference: 6.5, magnitude: 3 },
  { difference: 7.0, magnitude: 3.5 },
  { difference: 12.0, magnitude: 3.5 },
];

const ATTACK_TABLE_21: readonly { readonly vote: number; readonly bonus: number }[] = [
  { vote: 6.0, bonus: 0 },
  { vote: 6.5, bonus: 0.5 },
  { vote: 7.0, bonus: 1 },
  { vote: 7.5, bonus: 1.5 },
  { vote: 8.0, bonus: 2 },
  { vote: 8.5, bonus: 2 },
  { vote: 10, bonus: 2 },
];

describe("modCalc §19 — modificatore difesa", () => {
  it("le bande sono quelle del regolamento (prova per mutazione)", () => {
    for (const { average, bonus } of DEFENSE_TABLE_19) {
      // Quattro voti pari alla media desiderata: portiere + 3 difensori.
      const result = defenseModifier(average, [average, average, average, average]);
      expect(result.active).toBe(true);
      expect(result.average).toBeCloseTo(average, 12);
      expect(result.bonus).toBe(bonus);
    }
  });

  it("NON si attiva con 3 difensori validi — il minimo e' 4", () => {
    expect(DEFENSE_MIN_VALID_DEFENDERS).toBe(4);
    const withThree = defenseModifier(7, [7, 7, 7]);
    expect(withThree.active).toBe(false);
    expect(withThree.reason).toBe("NOT_ENOUGH_VALID_DEFENDERS");
    expect(withThree.bonus).toBe(0);
    expect(withThree.average).toBeNull();

    // Con un quarto difensore valido, lo stesso blocco si attiva.
    const withFour = defenseModifier(7, [7, 7, 7, 7]);
    expect(withFour.active).toBe(true);
    expect(withFour.bonus).toBe(6);
  });

  it("un difensore senza voto non conta nella numerosita'", () => {
    expect(defenseModifier(7, [7, 7, 7, null]).active).toBe(false);
    expect(defenseModifier(7, [7, 7, 7, null, 7]).active).toBe(true);
  });

  it("senza portiere valido non si attiva, nemmeno con dieci difensori da 8", () => {
    const result = defenseModifier(null, [8, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
    expect(result.active).toBe(false);
    expect(result.reason).toBe("GOALKEEPER_WITHOUT_VOTE");
    expect(result.bonus).toBe(0);
  });

  it("usa i TRE MIGLIORI difensori, non i primi tre", () => {
    // gk 6 + migliori 8, 7, 7 (scartando 4 e 3) -> media (6+8+7+7)/4 = 7 -> +6
    const result = defenseModifier(6, [3, 8, 4, 7, 7]);
    expect(result.countedVotes).toEqual([6, 8, 7, 7]);
    expect(result.average).toBeCloseTo(7, 12);
    expect(result.bonus).toBe(6);
  });

  it("il malus «gol subito» del portiere non entra nella media: §19 lavora sui voti base", () => {
    // Due chiamate identiche: il modulo non ha modo di vedere un Gs, e non deve averlo.
    expect(defenseModifier(6, [6, 6, 6, 6]).average).toBe(6);
    expect(defenseModifier(6, [6, 6, 6, 6]).bonus).toBe(1);
  });
});

describe("modCalc §20 — modificatore centrocampo", () => {
  it("la tabella e' quella del regolamento (prova per mutazione)", () => {
    for (const { difference, magnitude } of MIDFIELD_TABLE_20) {
      // Due lati con lo stesso numero di centrocampisti: nessun fittizio.
      const own = [6, 6, 6, 6];
      const opponent = [6, 6, 6, 6 - difference];
      const result = midfieldModifier(own, opponent);
      expect(result.difference).toBeCloseTo(difference, 12);
      expect(result.own.modifier).toBeCloseTo(difference === 0 ? 0 : magnitude, 12);
      expect(result.opponent.modifier).toBeCloseTo(difference === 0 ? 0 : -magnitude, 12);
    }
  });

  it("il voto fittizio e' 5 e pareggia la numerosita' (§20)", () => {
    expect(MIDFIELD_FICTITIOUS_VOTE).toBe(5);
    // Proprio lato: 3 centrocampisti da 7 = 21. Avversario: 5 da 6 = 30.
    // Al proprio lato si aggiungono DUE fittizi da 5 -> 21 + 10 = 31.
    const result = midfieldModifier([7, 7, 7], [6, 6, 6, 6, 6]);
    expect(result.own.fictitiousVotes).toBe(2);
    expect(result.opponent.fictitiousVotes).toBe(0);
    expect(result.own.total).toBe(31);
    expect(result.opponent.total).toBe(30);
    // Differenza 1 -> sotto 2 -> nessun modificatore.
    expect(result.difference).toBe(1);
    expect(result.own.modifier).toBe(0);
  });

  it("senza voti fittizi il conto sarebbe diverso: la regola cambia l'esito", () => {
    // Le stesse somme grezze, 21 contro 30, darebbero differenza 9 -> ±3,5.
    const withFictitious = midfieldModifier([7, 7, 7], [6, 6, 6, 6, 6]);
    const rawDifference = Math.abs(21 - 30);
    expect(rawDifference).toBe(9);
    expect(withFictitious.difference).toBe(1);
  });

  it("i due lati sono sempre opposti e la somma dei modificatori e' zero", () => {
    const result = midfieldModifier([8, 8, 8, 8], [5, 5, 5, 5]);
    expect(result.difference).toBe(12);
    expect(result.own.modifier).toBe(3.5);
    expect(result.opponent.modifier).toBe(-3.5);
    expect(result.own.modifier + result.opponent.modifier).toBe(0);
  });

  it("una differenza fuori griglia 0,5 alza la bandiera invece di sparire", () => {
    const onGrid = midfieldModifier([6, 6], [6, 5.5]);
    expect(onGrid.onHalfPointGrid).toBe(true);
    const offGrid = midfieldModifier([6, 6], [6, 3.3]);
    expect(offGrid.onHalfPointGrid).toBe(false);
    // La lettura a intervalli resta definita: 2,7 cade in [2, 3) -> ±1.
    expect(offGrid.difference).toBeCloseTo(2.7, 12);
    expect(offGrid.own.modifier).toBe(1);
  });

  it("i senza-voto non entrano ne' come voto ne' come numerosita'", () => {
    const conSenzaVoto = midfieldModifier([6, 6, null], [6, 6]);
    const senza = midfieldModifier([6, 6], [6, 6]);
    // Il CALCOLO e' identico: il `null` non porta un voto e non alza la
    // numerosita' che genera i fittizi.
    expect(conSenzaVoto.own.total).toBe(senza.own.total);
    expect(conSenzaVoto.own.fictitiousVotes).toBe(senza.own.fictitiousVotes);
    expect(conSenzaVoto.own.modifier).toBe(senza.own.modifier);
    expect(conSenzaVoto.difference).toBe(senza.difference);
  });

  it("i senza-voto scartati si CONTANO, per lato: l'interpretazione sta nell'output", () => {
    // Il regolamento non dice che cosa farne (LEAGUE_RULES §27: non inferire) e
    // dentro il protocollo il caso non si presenta (§D.9): questa funzione pero'
    // e' MOD-CALC generale, e chi la chiama deve vedere quanti ne ha persi.
    const result = midfieldModifier([6, null, 6, null], [7, 7, null]);
    expect(result.own.filteredNoVote).toBe(2);
    expect(result.opponent.filteredNoVote).toBe(1);
    // Restano 2 voti contro 2: nessun fittizio, e la somma e' quella dei validi.
    expect(result.own.fictitiousVotes).toBe(0);
    expect(result.opponent.fictitiousVotes).toBe(0);
    expect(result.own.total).toBe(12);
    expect(result.opponent.total).toBe(14);
    // Senza `null` in ingresso il conteggio e' zero su entrambi i lati.
    const pulito = midfieldModifier([6, 6], [7, 7]);
    expect(pulito.own.filteredNoVote).toBe(0);
    expect(pulito.opponent.filteredNoVote).toBe(0);
  });
});

describe("modCalc §21 — modificatore attacco, con la correzione 2026-08-21", () => {
  it("la tabella e' quella del regolamento (prova per mutazione)", () => {
    for (const { vote, bonus } of ATTACK_TABLE_21) {
      const result = attackModifier([{ baseVote: vote, hasBonus: false, missedPenalty: false }]);
      expect(result.perPlayer[0]!.eligible).toBe(true);
      expect(result.perPlayer[0]!.contribution).toBe(bonus);
      expect(result.total).toBe(bonus);
    }
  });

  it("L'ASSIST ESCLUDE — e' la correzione del 2026-08-21, non un dettaglio", () => {
    // Stesso voto, stessa tabella: cambia solo l'aver preso un bonus.
    const senzaBonus = attackModifier([{ baseVote: 7.5, hasBonus: false, missedPenalty: false }]);
    expect(senzaBonus.perPlayer[0]!.eligible).toBe(true);
    expect(senzaBonus.total).toBe(1.5);

    const conAssist = attackModifier([{ baseVote: 7.5, hasBonus: true, missedPenalty: false }]);
    expect(conAssist.perPlayer[0]!.eligible).toBe(false);
    expect(conAssist.perPlayer[0]!.reason).toBe("HAS_BONUS");
    expect(conAssist.total).toBe(0);
    // Il testo precedente, incompleto, avrebbe dato +1,5 a chi ha servito un
    // assist: e' esattamente il doppio premio che la correzione ripara.
    expect(conAssist.total).not.toBe(1.5);
  });

  it("il rigore sbagliato esclude, e il voto insufficiente pure", () => {
    expect(ATTACK_MIN_SUFFICIENT_VOTE).toBe(6);
    const rigore = attackModifier([{ baseVote: 8, hasBonus: false, missedPenalty: true }]);
    expect(rigore.perPlayer[0]!.reason).toBe("MISSED_PENALTY");
    const insufficiente = attackModifier([{ baseVote: 5.5, hasBonus: false, missedPenalty: false }]);
    expect(insufficiente.perPlayer[0]!.reason).toBe("INSUFFICIENT_VOTE");
    const senzaVoto = attackModifier([{ baseVote: null, hasBonus: false, missedPenalty: false }]);
    expect(senzaVoto.perPlayer[0]!.reason).toBe("NO_VOTE");
    expect(rigore.total + insufficiente.total + senzaVoto.total).toBe(0);
  });

  it("DO_NOT_INTERPOLATE: voto sufficiente fuori tabella -> contributo 0 e bandiera", () => {
    for (const vote of [6.25, 6.75, 7.25, 7.9]) {
      const result = attackModifier([{ baseVote: vote, hasBonus: false, missedPenalty: false }]);
      expect(result.perPlayer[0]!.eligible).toBe(true);
      expect(result.perPlayer[0]!.nonTabulated).toBe(true);
      expect(result.perPlayer[0]!.contribution).toBe(0);
      expect(result.nonTabulatedCount).toBe(1);
      // Nessuna interpolazione: 6,75 NON vale 0,75.
      expect(result.total).toBe(0);
      expect(attackTableBonus(vote)).toBeNull();
    }
  });

  it("sopra 8 la tabella e' una BANDA: 8,25 e' tabellato e vale +2", () => {
    const result = attackModifier([{ baseVote: 8.25, hasBonus: false, missedPenalty: false }]);
    expect(result.perPlayer[0]!.nonTabulated).toBe(false);
    expect(result.perPlayer[0]!.contribution).toBe(2);
  });

  it("un eleggibile a 6,0 e' eleggibile con contributo 0, non un non-eleggibile", () => {
    const result = attackModifier([{ baseVote: 6, hasBonus: false, missedPenalty: false }]);
    expect(result.perPlayer[0]!.eligible).toBe(true);
    expect(result.perPlayer[0]!.contribution).toBe(0);
    expect(result.eligibleCount).toBe(1);
  });

  it("il modificatore di squadra e' la SOMMA ALGEBRICA degli eleggibili", () => {
    const result = attackModifier([
      { baseVote: 7, hasBonus: false, missedPenalty: false }, // +1
      { baseVote: 8, hasBonus: false, missedPenalty: false }, // +2
      { baseVote: 9, hasBonus: true, missedPenalty: false }, // escluso
      { baseVote: 5, hasBonus: false, missedPenalty: false }, // escluso
    ]);
    expect(result.total).toBe(3);
    expect(result.eligibleCount).toBe(2);
  });
});

describe("modCalc — i tre modificatori restano separati (§D.9)", () => {
  it("non esiste una funzione che li sommi: si leggono uno per uno", () => {
    const difesa = defenseModifier(7, [7, 7, 7, 7]);
    const centrocampo = midfieldModifier([8, 8, 8, 8], [5, 5, 5, 5]);
    const attacco = attackModifier([{ baseVote: 7, hasBonus: false, missedPenalty: false }]);
    // Tre grandezze, tre numeri, tre nomi. Il test esiste per fissare la forma
    // dell'API: se qualcuno aggiungesse un `totalModifier`, questo file
    // resterebbe verde ma la revisione avrebbe qui il punto in cui guardare.
    expect(difesa.bonus).toBe(6);
    expect(centrocampo.own.modifier).toBe(3.5);
    expect(attacco.total).toBe(1);
    expect(Object.keys(difesa)).not.toContain("total");
  });
});
