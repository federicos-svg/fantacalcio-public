import { describe, it, expect } from "vitest";
import {
  FORMAZIONE_PROVA_SCHEMA_VERSION,
  FORMAZIONE_PROVA_STORAGE_KEY,
  PROVA_COMPETITION_ID,
  PROVA_ESITO_SALVATAGGIO,
  PROVA_ETICHETTA_SALVATAGGIO,
  PROVA_FORMAZIONE,
  PROVA_GIORNATA,
  PROVA_IMPOSTAZIONI,
  PROVA_MAI_IN_CAMPO,
  PROVA_PREFISSO_ID,
  PROVA_ROSA,
  PROVA_SPIEGAZIONE,
  caricaModalitaProva,
  destinazioneVincoli,
  modalitaProvaAttiva,
  provaChannelState,
  provaProducerReport,
  provaProducerReports,
  salvaModalitaProva,
} from "./formazioneProva.js";
import {
  FORMAZIONE_CONSTRAINTS_STORAGE_KEY,
  loadFormazioneConstraints,
  saveFormazioneConstraints,
} from "./formazioneConstraints.js";
import {
  MODULES,
  buildFormazioneView,
  moveToBench,
  moveToStarters,
  prepareSubmission,
  rolesByPlayerId,
  saveBlockers,
  setLineupModule,
  type LineupChannelState,
  type LineupConstraints,
  type Module,
} from "../packages/league-channel-contract/src/index.js";
import type { StorageLike } from "./logRecovery.js";

const MOMENTO = { readAt: "2026-09-04T18:00:00.000Z", seriesMatchday: 3 } as const;

// LA PROVA CON UNA SQUADRA DI ESEMPIO, misurata dove si può misurare: funzioni
// pure, senza browser. Questa suite sorveglia le cose che rendono la prova
// accettabile invece che pericolosa — il marchio nel dato, la porta chiusa dei
// dati veri, la separazione dei vincoli, il salvataggio che non finge — e
// lascia al browser (e2e/formazione-prova.spec.ts) ciò che riguarda il DOM.

function memoria(): StorageLike & { readonly dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value);
    },
    removeItem: (key) => {
      dump.delete(key);
    },
  };
}

function vincoli(parziale: Partial<LineupConstraints> = {}): LineupConstraints {
  return { lockedStarterIds: [], locked: false, ...parziale };
}

const CANALE_LETTO_VERO: LineupChannelState = {
  kind: "letto",
  observations: {
    lineup: MOMENTO,
    roster: MOMENTO,
    settings: MOMENTO,
    leagueTeams: null,
    calendar: null,
  },
  leagueTeams: null,
  calendar: null,
  roster: { teamId: "t1", players: [{ id: "p1", role: "P" }] },
  settings: {},
  competitions: [],
};

const CANALE_NON_COLLEGATO: LineupChannelState = {
  kind: "sconosciuto",
  cause: "porta_non_collegata",
  detail: "",
};

describe("il marchio sta nel dato, non solo nella cornice", () => {
  it("ogni giocatore della squadra di esempio porta il prefisso addosso", () => {
    expect(PROVA_ROSA.players.length).toBeGreaterThan(0);
    for (const player of PROVA_ROSA.players) {
      expect(player.id.startsWith(PROVA_PREFISSO_ID), player.id).toBe(true);
    }
    expect(PROVA_ROSA.teamId.startsWith(PROVA_PREFISSO_ID)).toBe(true);
  });

  it("il marchio è nei nomi anche dove la pagina li cita: schierati e panchina", () => {
    const schierati = [
      PROVA_FORMAZIONE.goalkeeperId,
      ...PROVA_FORMAZIONE.starterIds,
      ...PROVA_FORMAZIONE.benchIds,
    ];
    for (const id of schierati) {
      expect(id.startsWith(PROVA_PREFISSO_ID), id).toBe(true);
    }
  });

  it("gli identificativi non contengono spazi: finiscono in un attributo id", () => {
    // Un id con uno spazio dentro produrrebbe HTML non valido e romperebbe sia
    // il ritorno del fuoco sia ogni selettore della suite del browser.
    for (const player of PROVA_ROSA.players) {
      expect(/\s/.test(player.id), player.id).toBe(false);
    }
    expect(/\s/.test(PROVA_COMPETITION_ID)).toBe(false);
  });

  it("le parole che marcano la pagina dicono che non è la squadra di chi guarda", () => {
    expect(PROVA_SPIEGAZIONE).toContain("non è la tua squadra");
    expect(PROVA_SPIEGAZIONE).toContain(PROVA_PREFISSO_ID);
    // L'etichetta del salvataggio non dice mai «inviata» né «confermata».
    expect(PROVA_ETICHETTA_SALVATAGGIO).toContain("NULLA È PARTITO");
    expect(PROVA_ETICHETTA_SALVATAGGIO.toLowerCase()).not.toContain("inviat");
    expect(PROVA_ETICHETTA_SALVATAGGIO.toLowerCase()).not.toContain("confermat");
    expect(PROVA_ESITO_SALVATAGGIO).toContain("Non è stato inviato niente");
  });
});

describe("la squadra di esempio è composta perché i comandi si possano provare", () => {
  it("la rosa regge tutti e sette i moduli di §9, reparto per reparto", () => {
    const perRuolo = { P: 0, D: 0, C: 0, A: 0 };
    for (const player of PROVA_ROSA.players) perRuolo[player.role] += 1;
    expect(perRuolo.P).toBeGreaterThanOrEqual(2);
    for (const module of MODULES) {
      const [d, c, a] = [...module].map((cifra) => Number(cifra)) as [number, number, number];
      expect(perRuolo.D, `difensori per ${module}`).toBeGreaterThanOrEqual(d);
      expect(perRuolo.C, `centrocampisti per ${module}`).toBeGreaterThanOrEqual(c);
      expect(perRuolo.A, `attaccanti per ${module}`).toBeGreaterThanOrEqual(a);
    }
  });

  it("la lega di esempio dichiara tutti e sette i moduli", () => {
    expect([...(PROVA_IMPOSTAZIONI.allowedModules ?? [])].sort()).toEqual([...MODULES].sort());
  });

  it("la panchina è piena e c'è chi resta fuori dai convocati", () => {
    const max = PROVA_IMPOSTAZIONI.maxSubstitutions ?? 0;
    expect(PROVA_FORMAZIONE.benchIds.length).toBeGreaterThanOrEqual(max);
    const schierati = new Set([
      PROVA_FORMAZIONE.goalkeeperId,
      ...PROVA_FORMAZIONE.starterIds,
      ...PROVA_FORMAZIONE.benchIds,
    ]);
    const fuori = PROVA_ROSA.players.filter((player) => !schierati.has(player.id));
    expect(fuori.length).toBeGreaterThan(0);
  });

  it("nessun id ripetuto, e ogni schierato appartiene alla rosa", () => {
    expect(() => rolesByPlayerId(PROVA_ROSA)).not.toThrow();
    const inRosa = new Set(PROVA_ROSA.players.map((player) => player.id));
    const schierati = [
      PROVA_FORMAZIONE.goalkeeperId,
      ...PROVA_FORMAZIONE.starterIds,
      ...PROVA_FORMAZIONE.benchIds,
    ];
    expect(new Set(schierati).size).toBe(schierati.length);
    for (const id of schierati) expect(inRosa.has(id), id).toBe(true);
  });

  it("c'è chi secondo le previsioni non gioca, ed è già in campo", () => {
    expect(PROVA_MAI_IN_CAMPO.length).toBeGreaterThan(0);
    const inCampo = [PROVA_FORMAZIONE.goalkeeperId, ...PROVA_FORMAZIONE.starterIds];
    expect(PROVA_MAI_IN_CAMPO.some((id) => inCampo.includes(id))).toBe(true);
  });

  it("la formazione di esempio parte legale: nessuna violazione prima di toccarla", () => {
    const view = buildFormazioneView(provaChannelState(), new Map());
    const competizione = view.competitions[0];
    expect(competizione).toBeDefined();
    if (competizione === undefined) return;
    expect(competizione.legality.kind).toBe("verificata");
    if (competizione.legality.kind !== "verificata") return;
    expect(competizione.legality.blocking).toEqual([]);
    expect(competizione.legality.warnings).toEqual([]);
    expect(saveBlockers(competizione)).toEqual([]);
    expect(competizione.modified).toBe(false);
  });
});

describe("i comandi sulla squadra di esempio si comportano come su quella vera", () => {
  const roles = rolesByPlayerId(PROVA_ROSA);

  it("il portiere non lascia la porta vuota, e il rifiuto lo dice", () => {
    const esito = moveToBench(PROVA_FORMAZIONE, PROVA_FORMAZIONE.goalkeeperId);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.reason).toContain("la porta non può restare vuota");
  });

  it("cambiare modulo senza ridisporre nessuno rende visibili le violazioni", () => {
    const esito = setLineupModule(PROVA_FORMAZIONE, "352");
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const canale = provaChannelState();
    const view = buildFormazioneView(
      canale,
      new Map(),
      undefined,
      new Map([[PROVA_COMPETITION_ID, esito.lineup]]),
    );
    const competizione = view.competitions[0];
    expect(competizione?.modified).toBe(true);
    expect(competizione?.legality.kind).toBe("verificata");
    if (competizione === undefined || competizione.legality.kind !== "verificata") return;
    // Quattro difensori dentro un 3-5-2 sono uno di troppo: si vede subito.
    expect(competizione.legality.blocking.length).toBeGreaterThan(0);
    expect(saveBlockers(competizione).length).toBeGreaterThan(0);
  });

  it("ognuno dei sette moduli si può comporre davvero spostando giocatori", () => {
    for (const module of MODULES) {
      const [difensori, centrocampisti, attaccanti] = [...module].map((cifra) => Number(cifra)) as [
        number,
        number,
        number,
      ];
      const perRuolo = { D: difensori, C: centrocampisti, A: attaccanti };
      const titolari: string[] = [];
      const contati = { D: 0, C: 0, A: 0 };
      for (const player of PROVA_ROSA.players) {
        if (player.role === "P") continue;
        const ruolo = player.role as "D" | "C" | "A";
        if (contati[ruolo] >= perRuolo[ruolo]) continue;
        contati[ruolo] += 1;
        titolari.push(player.id);
      }
      expect(titolari, module).toHaveLength(10);

      // Si arriva a quell'undici con le mosse vere, non costruendolo a mano.
      let lineup = { ...PROVA_FORMAZIONE, module: module as Module };
      for (const id of [...PROVA_FORMAZIONE.starterIds]) {
        if (titolari.includes(id)) continue;
        const uscita = moveToBench(lineup, id);
        expect(uscita.ok, `${module}: fuori ${id}`).toBe(true);
        if (!uscita.ok) return;
        lineup = uscita.lineup;
      }
      for (const id of titolari) {
        if (lineup.starterIds.includes(id)) continue;
        const entrata = moveToStarters(lineup, id, roles);
        expect(entrata.ok, `${module}: dentro ${id}`).toBe(true);
        if (!entrata.ok) return;
        lineup = entrata.lineup;
      }

      const preparato = prepareSubmission({
        matchday: PROVA_GIORNATA,
        competitionId: PROVA_COMPETITION_ID,
        lineup,
        roster: PROVA_ROSA,
        settings: PROVA_IMPOSTAZIONI,
        constraints: vincoli(),
      });
      expect(preparato.ok, `${module}: ${preparato.ok ? "" : preparato.reason}`).toBe(true);
    }
  });
});

describe("l'avvertimento su chi non scende in campo si vede davvero", () => {
  it("spuntare un indisponibile produce LOCKED_PLAYER_NEVER_PLAYS", () => {
    const chiNonGioca = PROVA_MAI_IN_CAMPO[0];
    expect(chiNonGioca).toBeDefined();
    if (chiNonGioca === undefined) return;
    const report = provaProducerReport({
      constraints: vincoli({ lockedStarterIds: [chiNonGioca] }),
      currentLineup: PROVA_FORMAZIONE,
    });
    expect(report.warnings?.[0]?.code).toBe("LOCKED_PLAYER_NEVER_PLAYS");
    expect(report.warnings?.[0]?.playerIds).toEqual([chiNonGioca]);
  });

  it("è un avvertimento e non un rifiuto: il salvataggio resta possibile", () => {
    const chiNonGioca = PROVA_MAI_IN_CAMPO.find((id) =>
      [PROVA_FORMAZIONE.goalkeeperId, ...PROVA_FORMAZIONE.starterIds].includes(id),
    );
    expect(chiNonGioca).toBeDefined();
    if (chiNonGioca === undefined) return;
    const constraints = new Map([
      [PROVA_COMPETITION_ID, vincoli({ lockedStarterIds: [chiNonGioca] })],
    ]);
    const view = buildFormazioneView(
      provaChannelState(),
      constraints,
      provaProducerReports(constraints, PROVA_FORMAZIONE),
    );
    const competizione = view.competitions[0];
    expect(competizione?.issues.rejections).toEqual([]);
    expect(competizione?.issues.warnings.map((issue) => issue.code)).toContain(
      "LOCKED_PLAYER_NEVER_PLAYS",
    );
    if (competizione === undefined) return;
    expect(saveBlockers(competizione)).toEqual([]);
  });

  it("spuntare chi gioca non produce nessun avvertimento", () => {
    const chiGioca = PROVA_FORMAZIONE.starterIds.find((id) => !PROVA_MAI_IN_CAMPO.includes(id));
    expect(chiGioca).toBeDefined();
    if (chiGioca === undefined) return;
    const report = provaProducerReport({
      constraints: vincoli({ lockedStarterIds: [chiGioca] }),
      currentLineup: PROVA_FORMAZIONE,
    });
    expect(report.warnings).toEqual([]);
  });

  it("con la formazione blindata contano gli schierati, come nel produttore vero", () => {
    const report = provaProducerReport({
      constraints: vincoli({ locked: true }),
      currentLineup: PROVA_FORMAZIONE,
    });
    expect(report.warnings?.[0]?.code).toBe("LOCKED_PLAYER_NEVER_PLAYS");
  });

  it("senza vincoli per quella competizione non si finge nessun rapporto", () => {
    expect(provaProducerReports(new Map(), PROVA_FORMAZIONE).size).toBe(0);
  });
});

describe("i dati veri vincono sempre sulla prova", () => {
  it("con una squadra letta la prova è spenta, anche se richiesta", () => {
    expect(modalitaProvaAttiva(true, CANALE_LETTO_VERO)).toBe(false);
    expect(modalitaProvaAttiva(false, CANALE_LETTO_VERO)).toBe(false);
  });

  it("una prova salvata in una visita precedente non sopravvive alla lettura vera", () => {
    const storage = memoria();
    expect(salvaModalitaProva(storage, true)).toBe(true);
    // È il boot della visita successiva: si rilegge l'accensione, e la lega
    // stavolta risponde. La prova non deve poter coprire la squadra vera.
    const richiesta = caricaModalitaProva(storage);
    expect(richiesta).toBe(true);
    expect(modalitaProvaAttiva(richiesta, CANALE_LETTO_VERO)).toBe(false);
    // E con la porta ancora scollegata resta invece disponibile.
    expect(modalitaProvaAttiva(richiesta, CANALE_NON_COLLEGATO)).toBe(true);
  });

  it("la prova si accende solo su richiesta: senza richiesta non si accende mai", () => {
    expect(modalitaProvaAttiva(false, CANALE_NON_COLLEGATO)).toBe(false);
    for (const cause of [
      "porta_non_collegata",
      "risposta_assente",
      "risposta_illeggibile",
      "non_diagnosticabile",
    ] as const) {
      expect(modalitaProvaAttiva(false, { kind: "sconosciuto", cause, detail: "" })).toBe(false);
    }
  });

  it("un archivio storto non accende la prova: fail-closed a spenta", () => {
    const storage = memoria();
    for (const raw of [
      "non json",
      "{}",
      JSON.stringify({ schemaVersion: 99, attiva: true }),
      JSON.stringify({ schemaVersion: FORMAZIONE_PROVA_SCHEMA_VERSION, attiva: "si" }),
      JSON.stringify({ schemaVersion: FORMAZIONE_PROVA_SCHEMA_VERSION, attiva: true, extra: 1 }),
    ]) {
      storage.setItem(FORMAZIONE_PROVA_STORAGE_KEY, raw);
      expect(caricaModalitaProva(storage), raw).toBe(false);
    }
  });

  it("un archivio inaccessibile non accende la prova e non lancia", () => {
    const rotto: StorageLike = {
      getItem: () => {
        throw new Error("bloccato");
      },
      setItem: () => {
        throw new Error("bloccato");
      },
      removeItem: () => undefined,
    };
    expect(caricaModalitaProva(rotto)).toBe(false);
    expect(salvaModalitaProva(rotto, true)).toBe(false);
  });

  it("una scrittura che non tiene viene dichiarata, non scoperta al prossimo avvio", () => {
    const finto: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(salvaModalitaProva(finto, true)).toBe(false);
  });
});

describe("i vincoli della prova e quelli veri non si mescolano", () => {
  it("le due chiavi dell'archivio locale sono diverse", () => {
    expect(FORMAZIONE_PROVA_STORAGE_KEY).not.toBe(FORMAZIONE_CONSTRAINTS_STORAGE_KEY);
  });

  it("accendere la prova non tocca i vincoli veri già salvati", () => {
    const storage = memoria();
    const veri = new Map<string, LineupConstraints>([
      ["c1", vincoli({ lockedStarterIds: ["p7"], lockedModule: "433" })],
    ]);
    expect(saveFormazioneConstraints(storage, veri)).toBe(true);
    salvaModalitaProva(storage, true);
    const riletti = loadFormazioneConstraints(storage);
    expect(riletti.status).toBe("ok");
    expect(riletti.byCompetition.get("c1")?.lockedStarterIds).toEqual(["p7"]);
    expect(riletti.byCompetition.get("c1")?.lockedModule).toBe("433");
  });

  it("una spunta messa in prova non ha nessun archivio in cui finire", () => {
    // La regola che la shell applica, dichiarata dove si può provare: in prova
    // le spunte non vanno nell'archivio, ci vanno solo fuori dalla prova.
    expect(destinazioneVincoli(true)).toBe("prova");
    expect(destinazioneVincoli(false)).toBe("archivio");
  });

  it("i vincoli veri non si applicano alla squadra di esempio", () => {
    // Le due mappe sono separate: costruendo la vista della prova con i vincoli
    // veri di un'altra competizione, sulla squadra di esempio non compare nulla.
    const veri = new Map<string, LineupConstraints>([
      ["c1", vincoli({ lockedStarterIds: ["p7"], locked: true })],
    ]);
    const view = buildFormazioneView(provaChannelState(), veri);
    const competizione = view.competitions[0];
    expect(competizione?.competitionId).toBe(PROVA_COMPETITION_ID);
    expect(competizione?.constraints.lockedStarterIds).toEqual([]);
    expect(competizione?.constraints.locked).toBe(false);
    expect(competizione?.players.every((row) => !row.locked)).toBe(true);
  });
});

describe("il canale della prova non passa da nessuna porta", () => {
  it("è un valore costruito qui, e dichiara una squadra letta", () => {
    const canale = provaChannelState();
    expect(canale.kind).toBe("letto");
    if (canale.kind !== "letto") return;
    expect(canale.roster).toBe(PROVA_ROSA);
    expect(canale.competitions).toHaveLength(1);
    expect(canale.competitions[0]?.matchday).toBe(PROVA_GIORNATA);
    expect(canale.competitions[0]?.competition.competitionId).toBe(PROVA_COMPETITION_ID);
  });

  it("nessun identificativo della prova può essere scambiato per uno vero", () => {
    const canale = provaChannelState();
    if (canale.kind !== "letto") return;
    expect(canale.competitions[0]?.competition.name).toContain("esempio");
  });
});
