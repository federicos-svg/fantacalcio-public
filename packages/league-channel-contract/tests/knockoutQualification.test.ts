// CHI PASSA IL TURNO — un caso deciso, due che restano indecisi.
//
// Il criterio di parità del doppio confronto l'ha dichiarato Pico il
// 2026-09-04: «Chi ha totalizzato più punti fantacalcio nelle due partite».
// Questi test coprono il caso deciso in entrambi i versi e, soprattutto, i
// rifiuti: il valore di questa funzione sta tanto in ciò che risolve quanto in
// ciò che si rifiuta di inventare.

import { describe, expect, it } from "vitest";

import {
  KNOCKOUT_IS_MINI_GROUP,
  type KnockoutQualification,
  type ObservedKnockoutLeg,
  cupScoringShape,
  resolveKnockoutQualification,
} from "../src/calendar.js";

/** Squadre sintetiche: id opachi inventati qui, come tutto il resto. */
const CASA = "t1";
const OSPITE = "t4";

interface Riga {
  readonly goals: number;
  readonly fantasyPoints: number;
}

function andata(a: Riga, b: Riga): ObservedKnockoutLeg {
  return gara(24, "andata", a, b);
}

function ritorno(a: Riga, b: Riga): ObservedKnockoutLeg {
  return gara(28, "ritorno", a, b);
}

function gara(
  matchday: number,
  leg: "andata" | "ritorno",
  a: Riga,
  b: Riga,
): ObservedKnockoutLeg {
  return {
    competitionId: "c2",
    matchday,
    cupPhase: "eliminazione",
    leg,
    played: true,
    sides: [
      { teamId: CASA, goals: a.goals, fantasyPoints: a.fantasyPoints },
      { teamId: OSPITE, goals: b.goals, fantasyPoints: b.fantasyPoints },
    ],
  };
}

/** Nessun esito non deciso porta con sé una squadra: mai una vittoria dedotta. */
function nessunaSquadra(esito: KnockoutQualification): void {
  expect(esito.decided).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(esito, "qualifiedTeamId")).toBe(false);
  expect(Object.values(esito)).not.toContain(CASA);
  expect(Object.values(esito)).not.toContain(OSPITE);
}

describe("primo criterio: il mini girone di due squadre (§22 3/1/0 su ciascuna gara, §23)", () => {
  it("chi fa più punti nelle due gare passa — verso 1", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }),
      ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
    );

    // 3 + 1 contro 0 + 1: il turno è deciso prima che il criterio di parità
    // entri in gioco, ed è deciso dai goal, non dai punteggi.
    expect(esito).toMatchObject({ decided: true, qualifiedTeamId: CASA, code: "punti_mini_girone" });
  });

  it("chi fa più punti nelle due gare passa — verso 2", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 1, fantasyPoints: 90 }, { goals: 2, fantasyPoints: 71 }),
      ritorno({ goals: 0, fantasyPoints: 90 }, { goals: 0, fantasyPoints: 60 }),
    );

    // L'ospite passa con 3 + 1 pur avendo totalizzato molti meno punti
    // fantacalcio: la somma dei punteggi è il SECONDO criterio, non il primo, e
    // non rimonta un turno già deciso.
    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: OSPITE,
      code: "punti_mini_girone",
    });
  });

  it("l'ordine in cui arrivano le due gare non conta", () => {
    const a = andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 });
    const r = ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 });

    // Andata e ritorno si riconoscono dal campo `leg` che dichiarano, non dalla
    // posizione: una lettura che le espone in ordine inverso non cambia l'esito.
    expect(resolveKnockoutQualification(r, a)).toEqual(resolveKnockoutQualification(a, r));
  });

  it("il turno resta un mini girone, non una gara di ritorno che decide", () => {
    expect(KNOCKOUT_IS_MINI_GROUP).toBe(true);
    expect(cupScoringShape("eliminazione")).toBe("punti_3_1_0");
  });
});

describe("secondo criterio: la somma dei punteggi fantacalcio (Pico, 2026-09-04)", () => {
  it("a parità di punti passa chi ha totalizzato di più nelle due partite — verso 1", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 72 }),
      ritorno({ goals: 0, fantasyPoints: 66 }, { goals: 1, fantasyPoints: 71.5 }),
    );

    // 3 + 0 contro 0 + 3: pari nel mini girone. 144.5 contro 143.5: passa la
    // prima, per un punto fantacalcio.
    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: CASA,
      code: "somma_punteggi_fantacalcio",
    });
    if (esito.decided) expect(esito.message).toContain("2026-09-04");
  });

  it("a parità di punti passa chi ha totalizzato di più nelle due partite — verso 2", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 74 }),
      ritorno({ goals: 0, fantasyPoints: 66 }, { goals: 1, fantasyPoints: 71.5 }),
    );

    // Stessi goal, stessa parità nel mini girone; cambia solo il punteggio
    // dell'andata dell'ospite: 145.5 contro 144.5, e passa l'altra squadra.
    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: OSPITE,
      code: "somma_punteggi_fantacalcio",
    });
  });

  it("vale anche quando la parità nasce da due pareggi, non da una vittoria a testa", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
      ritorno({ goals: 0, fantasyPoints: 64 }, { goals: 0, fantasyPoints: 64 }),
    );

    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: CASA,
      code: "somma_punteggi_fantacalcio",
    });
  });
});

describe("ciò che resta indeciso è indeciso perché nessuno l'ha deciso", () => {
  it("parità anche nella somma dei punteggi: non decidibile, e non si inventa un terzo criterio", () => {
    const esito = resolveKnockoutQualification(
      andata({ goals: 1, fantasyPoints: 66.5 }, { goals: 1, fantasyPoints: 66.5 }),
      ritorno({ goals: 2, fantasyPoints: 72 }, { goals: 2, fantasyPoints: 72 }),
    );

    // Pico ha deciso il criterio di parità, non il criterio della parità del
    // criterio di parità. Qui si ferma la decisione, non il codice.
    expect(esito.code).toBe("parita_dopo_punteggi_fantacalcio");
    nessunaSquadra(esito);
  });

  it("il girone da quattro ha un rifiuto suo, distinto da quello del doppio confronto", () => {
    const esito = resolveKnockoutQualification(
      { ...andata({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
      { ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
    );

    // La decisione del 2026-09-04 parla delle «due partite» di un doppio
    // confronto: un girone da quattro non ne ha due, e riusare lì quel criterio
    // sarebbe un'analogia, cioè esattamente ciò che §23 vieta.
    expect(esito.code).toBe("girone_da_quattro_non_dichiarato");
    nessunaSquadra(esito);
  });

  it("i due rifiuti di decisione mancante non si confondono fra loro", () => {
    const pari = resolveKnockoutQualification(
      andata({ goals: 1, fantasyPoints: 66.5 }, { goals: 1, fantasyPoints: 66.5 }),
      ritorno({ goals: 2, fantasyPoints: 72 }, { goals: 2, fantasyPoints: 72 }),
    );
    const girone = resolveKnockoutQualification(
      { ...andata({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
      { ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
    );
    expect(pari.code).not.toBe(girone.code);
  });
});

describe("una lettura insufficiente non è una parità", () => {
  it("punteggio fantacalcio mancante: si rifiuta anche se i goal basterebbero a decidere", () => {
    const senzaPunteggio: ObservedKnockoutLeg = {
      ...andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }),
      sides: [
        { teamId: CASA, goals: 2, fantasyPoints: 78.5 },
        { teamId: OSPITE, goals: 1 },
      ],
    };
    const esito = resolveKnockoutQualification(
      senzaPunteggio,
      ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
    );

    // I goal deciderebbero il turno al primo criterio, ma una gara letta a metà
    // è una gara che non sappiamo di aver letto tutta: si tace.
    expect(esito.code).toBe("osservazione_incompleta");
    if (!esito.decided) expect(esito.message).toContain("punteggio fantacalcio non osservato");
    nessunaSquadra(esito);
  });

  it("gara non giocata: rifiuto dichiarato, mai una vittoria a tavolino dedotta", () => {
    const nonGiocata: ObservedKnockoutLeg = {
      competitionId: "c2",
      matchday: 28,
      cupPhase: "eliminazione",
      leg: "ritorno",
      played: false,
    };
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }),
      nonGiocata,
    );
    expect(esito.code).toBe("osservazione_incompleta");
    if (!esito.decided) expect(esito.message).toContain("non è un pareggio");
    nessunaSquadra(esito);
  });

  it("non è osservato nemmeno se la gara si sia giocata: si rifiuta lo stesso", () => {
    const senzaPlayed: ObservedKnockoutLeg = {
      ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
      played: undefined,
    };
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }),
      senzaPlayed,
    );
    expect(esito.code).toBe("osservazione_incompleta");
    nessunaSquadra(esito);
  });

  it("gare di scontri diversi: squadre diverse fra andata e ritorno", () => {
    const altroScontro: ObservedKnockoutLeg = {
      ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
      sides: [
        { teamId: CASA, goals: 1, fantasyPoints: 70 },
        { teamId: "t7", goals: 1, fantasyPoints: 69.5 },
      ],
    };
    const esito = resolveKnockoutQualification(
      andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }),
      altroScontro,
    );
    expect(esito.code).toBe("osservazione_incompleta");
    if (!esito.decided) expect(esito.message).toContain("non sono lo stesso scontro");
    nessunaSquadra(esito);
  });

  it("gare di scontri diversi: competizioni diverse, o due andate, o la stessa giornata", () => {
    const base = andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 });
    const secondaGara = ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 });

    const altraCompetizione = resolveKnockoutQualification(base, {
      ...secondaGara,
      competitionId: "c1",
    });
    const dueAndate = resolveKnockoutQualification(base, { ...secondaGara, leg: "andata" });
    const stessaGiornata = resolveKnockoutQualification(base, { ...secondaGara, matchday: 24 });

    for (const esito of [altraCompetizione, dueAndate, stessaGiornata]) {
      expect(esito.code).toBe("osservazione_incompleta");
      nessunaSquadra(esito);
    }
  });

  it("la finale non è un doppio confronto e non si risolve come tale", () => {
    const esito = resolveKnockoutQualification(
      { ...andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 }), cupPhase: "finale" },
      { ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }), cupPhase: "finale" },
    );
    expect(esito.code).toBe("osservazione_incompleta");
    nessunaSquadra(esito);
  });

  it("dati strutturalmente rotti: giornata assente, squadra ripetuta, goal negativi", () => {
    const base = andata({ goals: 2, fantasyPoints: 78.5 }, { goals: 1, fantasyPoints: 71 });
    const secondaGara = ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 });

    const senzaGiornata = resolveKnockoutQualification(base, {
      ...secondaGara,
      matchday: undefined,
    });
    const senzaVerso = resolveKnockoutQualification(base, { ...secondaGara, leg: undefined });
    const stessaSquadra = resolveKnockoutQualification(base, {
      ...secondaGara,
      sides: [
        { teamId: CASA, goals: 1, fantasyPoints: 70 },
        { teamId: CASA, goals: 1, fantasyPoints: 69.5 },
      ],
    });
    const goalNegativi = resolveKnockoutQualification(base, {
      ...secondaGara,
      sides: [
        { teamId: CASA, goals: -1, fantasyPoints: 70 },
        { teamId: OSPITE, goals: 1, fantasyPoints: 69.5 },
      ],
    });

    for (const esito of [senzaGiornata, senzaVerso, stessaSquadra, goalNegativi]) {
      expect(esito.code).toBe("osservazione_incompleta");
      nessunaSquadra(esito);
    }
  });
});
