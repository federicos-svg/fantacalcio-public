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
import { homeFieldBonus } from "../../league-gameweek/src/leagueGameweek.js";

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

// Uno scontro con i punti del mini girone in parità (3 a 3: una vittoria per
// parte), così che a decidere sia sempre il secondo criterio. I punteggi base
// sono **senza** fattore campo; `bonusCampo: true` aggiunge il +2 di §14 a chi
// gioca in casa, gara per gara e solo dove §14 lo prevede — cioè esattamente
// ciò che la piattaforma esporrebbe.
const BASE = {
  andataCasa: 70.5,
  andataOspite: 68.0,
  ritornoCasa: 66.0,
  ritornoOspite: 69.5,
} as const;

function scontro(
  mdAndata: number,
  mdRitorno: number,
  opzioni: { readonly bonusCampo: boolean; readonly casaAndata: typeof CASA | typeof OSPITE },
): readonly [ObservedKnockoutLeg, ObservedKnockoutLeg] {
  const bonus = (matchday: number, squadraDiCasa: string, squadra: string): number =>
    opzioni.bonusCampo && squadraDiCasa === squadra ? homeFieldBonus(matchday) : 0;
  const casaRitorno = opzioni.casaAndata === CASA ? OSPITE : CASA;
  return [
    gara(
      mdAndata,
      "andata",
      {
        goals: 2,
        fantasyPoints: BASE.andataCasa + bonus(mdAndata, opzioni.casaAndata, CASA),
      },
      {
        goals: 1,
        fantasyPoints: BASE.andataOspite + bonus(mdAndata, opzioni.casaAndata, OSPITE),
      },
    ),
    gara(
      mdRitorno,
      "ritorno",
      { goals: 0, fantasyPoints: BASE.ritornoCasa + bonus(mdRitorno, casaRitorno, CASA) },
      { goals: 1, fantasyPoints: BASE.ritornoOspite + bonus(mdRitorno, casaRitorno, OSPITE) },
    ),
  ];
}

describe("il bonus campo di §14 si annulla, tranne a cavallo del limite", () => {
  it("la soglia si chiede all'autorità, non si trascrive", () => {
    // Le giornate 24 e 28 stanno dalla stessa parte del limite; la 28 e la 32
    // no. Il test lo verifica con la stessa funzione che usa il contratto,
    // invece di ribattere il numero 29 a mano.
    expect(homeFieldBonus(24)).toBe(homeFieldBonus(28));
    expect(homeFieldBonus(28)).not.toBe(homeFieldBonus(32));
    expect(homeFieldBonus(32)).toBe(homeFieldBonus(35));
  });

  it("caso normale: stesso scontro con e senza bonus campo, stesso vincitore", () => {
    // Le due gare hanno il campo invertito, quindi ciascuna squadra incassa il
    // +2 una volta sola: la DIFFERENZA fra le due somme non si muove, ed è la
    // differenza a decidere.
    const senza = resolveKnockoutQualification(
      ...scontro(24, 28, { bonusCampo: false, casaAndata: CASA }),
    );
    const con = resolveKnockoutQualification(
      ...scontro(24, 28, { bonusCampo: true, casaAndata: CASA }),
    );

    expect(senza).toMatchObject({
      decided: true,
      qualifiedTeamId: OSPITE,
      code: "somma_punteggi_fantacalcio",
    });
    expect(con).toMatchObject({
      decided: true,
      qualifiedTeamId: OSPITE,
      code: "somma_punteggi_fantacalcio",
    });

    // E lo stesso a parti invertite: chi gioca in casa per primo non conta.
    const conAltroVerso = resolveKnockoutQualification(
      ...scontro(24, 28, { bonusCampo: true, casaAndata: OSPITE }),
    );
    expect(conAltroVerso).toMatchObject({ decided: true, qualifiedTeamId: OSPITE });

    // L'annullamento in chiaro, sui numeri: +2 a testa lascia la differenza
    // dov'era.
    const deltaSenza =
      BASE.andataCasa + BASE.ritornoCasa - (BASE.andataOspite + BASE.ritornoOspite);
    const deltaCon =
      BASE.andataCasa + 2 + BASE.ritornoCasa - (BASE.andataOspite + (BASE.ritornoOspite + 2));
    expect(deltaCon).toBe(deltaSenza);
  });

  it("controllo: anche due gare entrambe oltre il limite restano decidibili", () => {
    // Dalla 29ª in poi il bonus non c'è per nessuno: le due gare stanno dalla
    // stessa parte del limite e la somma è confrontabile. Il calendario
    // osservato prevale sulle attese di §23, quindi un turno lì è possibile.
    const esito = resolveKnockoutQualification(
      ...scontro(32, 35, { bonusCampo: true, casaAndata: CASA }),
    );
    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: OSPITE,
      code: "somma_punteggi_fantacalcio",
    });
  });

  it("a cavallo del limite: non decidibile, in entrambi i versi", () => {
    // Giornate 28 e 32: il +2 entra in una sola delle due somme. Con la prima
    // squadra in casa all'andata il vincitore si ROVESCIA rispetto al conto
    // senza bonus; con l'altra il vincitore resta ma il margine triplica. In
    // nessuno dei due casi il criterio è dichiarato: si rifiuta.
    for (const casaAndata of [CASA, OSPITE] as const) {
      const esito = resolveKnockoutQualification(
        ...scontro(28, 32, { bonusCampo: true, casaAndata }),
      );
      expect(esito.code).toBe("cavallo_del_campo_neutro_non_dichiarato");
      if (!esito.decided) expect(esito.message).toContain("§14");
      nessunaSquadra(esito);
    }
  });

  it("a cavallo del limite ma già deciso dal mini girone: il turno si decide lo stesso", () => {
    // Il primo criterio viene dai goal, non dai punteggi: il fattore campo non
    // c'entra nulla, e fermarsi qui sarebbe inventare un limite che nessuno ha
    // posto.
    const esito = resolveKnockoutQualification(
      gara(28, "andata", { goals: 3, fantasyPoints: 82.5 }, { goals: 0, fantasyPoints: 60 }),
      gara(32, "ritorno", { goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 69.5 }),
    );
    expect(esito).toMatchObject({
      decided: true,
      qualifiedTeamId: CASA,
      code: "punti_mini_girone",
    });
  });

  it("il rifiuto a cavallo non si confonde con gli altri due di decisione mancante", () => {
    const cavallo = resolveKnockoutQualification(
      ...scontro(28, 32, { bonusCampo: true, casaAndata: CASA }),
    );
    const pari = resolveKnockoutQualification(
      andata({ goals: 1, fantasyPoints: 66.5 }, { goals: 1, fantasyPoints: 66.5 }),
      ritorno({ goals: 2, fantasyPoints: 72 }, { goals: 2, fantasyPoints: 72 }),
    );
    const girone = resolveKnockoutQualification(
      { ...andata({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
      { ...ritorno({ goals: 1, fantasyPoints: 70 }, { goals: 1, fantasyPoints: 70 }), cupPhase: "girone" },
    );
    expect(new Set([cavallo.code, pari.code, girone.code]).size).toBe(3);
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
