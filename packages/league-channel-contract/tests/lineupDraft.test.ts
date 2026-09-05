import { describe, it, expect } from "vitest";
import {
  benchMoveConflict,
  draftLegality,
  editsBlockedReason,
  isLineupModified,
  moduleChangeConflict,
  moveBench,
  moveOutside,
  moveToBench,
  moveToStarters,
  placeOf,
  setLineupFlag,
  setLineupModule,
  fillSlot,
  swapPlayers,
  type ConstraintConflict,
  type LineupEdit,
} from "../src/lineupDraft.js";
import { pitchLayout, type PitchSlot } from "../src/pitchLayout.js";
import { NO_LINEUP_CONSTRAINTS } from "../src/lineupCoachSurface.js";
import { MODULES, moduleShape } from "../../league-gameweek/src/leagueGameweek.js";
import type { LineupConstraints } from "../../league-gameweek/src/lineupProposer.js";
import { rolesByPlayerId } from "../src/roster.js";
import type { ObservedLineup } from "../src/lineupSubmission.js";
import { CAMPIONATO, FORMAZIONE, ROSA, SETTINGS_IN_ACCORDO } from "./fixtures.js";

// MODIFICARE LA FORMAZIONE, INTERROGATO SENZA BROWSER.
//
// Le mosse sono funzioni pure e qui si provano una per una: che cosa cambia
// esattamente, che cosa NON cambia, e che cosa si rifiuta invece di indovinare.
// Le fixture sono quelle sintetiche del pacchetto — `p1…p16`, `t1`, `c1` — e
// nessun test tocca la rete, perché non c'è rete da toccare.

const RUOLI = rolesByPlayerId(ROSA);

function eseguita(edit: LineupEdit): ObservedLineup {
  expect(edit.ok, edit.ok ? "" : edit.reason).toBe(true);
  if (!edit.ok) throw new Error(edit.reason);
  return edit.lineup;
}

describe("dove sta un giocatore", () => {
  it("i quattro posti si distinguono, e «fuori» non è «in panchina»", () => {
    expect(placeOf(FORMAZIONE, "p1")).toBe("porta");
    expect(placeOf(FORMAZIONE, "p6")).toBe("titolare");
    expect(placeOf(FORMAZIONE, "p13")).toBe("panchina");
    expect(placeOf(FORMAZIONE, "p99")).toBe("fuori");
  });
});

describe("dalla panchina agli undici, e viceversa", () => {
  it("un giocatore di movimento entra in fondo agli undici e lascia la panchina", () => {
    const dopo = eseguita(moveToStarters(FORMAZIONE, "p14", RUOLI));
    expect(dopo.starterIds).toEqual([...FORMAZIONE.starterIds, "p14"]);
    expect(dopo.benchIds).toEqual(["p12", "p13", "p15", "p16"]);
    expect(dopo.goalkeeperId).toBe(FORMAZIONE.goalkeeperId);
  });

  it("un titolare va in panchina IN FONDO: nessuna posizione viene indovinata", () => {
    const dopo = eseguita(moveToBench(FORMAZIONE, "p11"));
    expect(dopo.starterIds).not.toContain("p11");
    expect(dopo.benchIds).toEqual([...FORMAZIONE.benchIds, "p11"]);
  });

  it("chi è fuori dai convocati può entrare in panchina, sempre in fondo", () => {
    const senzaP16 = eseguita(moveOutside(FORMAZIONE, "p16"));
    expect(placeOf(senzaP16, "p16")).toBe("fuori");
    const dopo = eseguita(moveToBench(senzaP16, "p16"));
    expect(dopo.benchIds).toEqual(["p12", "p13", "p14", "p15", "p16"]);
  });

  it("un portiere che entra prende la porta, e chi c'era prende il suo posto in panchina", () => {
    // La porta è un posto solo: entrare significa sostituire. Il posto in
    // panchina è quello che l'entrante lasciava — l'unico che non inventa una
    // posizione nuova in un elenco il cui ordine è un dato.
    const dopo = eseguita(moveToStarters(FORMAZIONE, "p12", RUOLI));
    expect(dopo.goalkeeperId).toBe("p12");
    expect(dopo.benchIds).toEqual(["p1", "p13", "p14", "p15", "p16"]);
    expect(dopo.starterIds).toEqual(FORMAZIONE.starterIds);
  });

  it("il portiere non lascia la porta vuota, e il rifiuto dice che cosa serve", () => {
    const edit = moveToBench(FORMAZIONE, "p1");
    expect(edit.ok).toBe(false);
    if (edit.ok) return;
    expect(edit.reason).toContain("un altro portiere");
  });

  it("un ruolo non osservato ferma la mossa invece di indovinarla", () => {
    const parziali = new Map(RUOLI);
    parziali.delete("p14");
    const edit = moveToStarters(FORMAZIONE, "p14", parziali);
    expect(edit.ok).toBe(false);
    if (edit.ok) return;
    expect(edit.reason).toContain("non è stato osservato");
  });

  it("una mossa che non esiste è un rifiuto scritto, mai un cambiamento a metà", () => {
    expect(moveToStarters(FORMAZIONE, "p6", RUOLI).ok).toBe(false);
    expect(moveToBench(FORMAZIONE, "p13").ok).toBe(false);
    expect(moveOutside(FORMAZIONE, "p99").ok).toBe(false);
  });
});

describe("l'ordine della panchina è un dato, e si riordina", () => {
  it("«su» scambia con chi entra prima, «giù» con chi entra dopo", () => {
    const su = eseguita(moveBench(FORMAZIONE, "p14", "su"));
    expect(su.benchIds).toEqual(["p12", "p14", "p13", "p15", "p16"]);
    const giu = eseguita(moveBench(FORMAZIONE, "p14", "giu"));
    expect(giu.benchIds).toEqual(["p12", "p13", "p15", "p14", "p16"]);
  });

  it("nessuno esce dai bordi, e il rifiuto lo dice", () => {
    expect(moveBench(FORMAZIONE, "p12", "su").ok).toBe(false);
    expect(moveBench(FORMAZIONE, "p16", "giu").ok).toBe(false);
    expect(moveBench(FORMAZIONE, "p6", "su").ok).toBe(false);
  });

  it("una panchina riordinata è una formazione MODIFICATA, non la stessa", () => {
    // Se questo confronto fosse insiemistico, riordinare la panchina — cioè
    // decidere chi entra la domenica — si leggerebbe «non modificata».
    const riordinata = eseguita(moveBench(FORMAZIONE, "p14", "su"));
    expect(isLineupModified(FORMAZIONE, riordinata)).toBe(true);
    expect(isLineupModified(FORMAZIONE, { ...FORMAZIONE })).toBe(false);
  });
});

describe("il modulo e le due opzioni", () => {
  it("cambiare modulo non ridispone nessuno", () => {
    const dopo = eseguita(setLineupModule(FORMAZIONE, "352"));
    expect(dopo.module).toBe("352");
    expect(dopo.starterIds).toEqual(FORMAZIONE.starterIds);
    expect(dopo.benchIds).toEqual(FORMAZIONE.benchIds);
  });

  it("le due opzioni si accendono e si spengono una per volta", () => {
    const nascosta = eseguita(setLineupFlag(FORMAZIONE, "hidden", true));
    expect(nascosta.flags).toEqual({ hidden: true, allCompetitions: false });
    const entrambe = eseguita(setLineupFlag(nascosta, "allCompetitions", true));
    expect(entrambe.flags).toEqual({ hidden: true, allCompetitions: true });
    expect(eseguita(setLineupFlag(entrambe, "hidden", false)).flags.allCompetitions).toBe(true);
  });

  it("modificare non tocca mai la formazione di partenza", () => {
    setLineupModule(FORMAZIONE, "352");
    moveBench(FORMAZIONE, "p14", "su");
    moveToBench(FORMAZIONE, "p11");
    expect(FORMAZIONE.module).toBe("442");
    expect(FORMAZIONE.benchIds).toEqual(["p12", "p13", "p14", "p15", "p16"]);
    expect(FORMAZIONE.starterIds).toContain("p11");
  });
});

describe("quando la formazione non si modifica affatto", () => {
  it("blindata: nessun comando la cambia, e il motivo è la blindatura", () => {
    const reason = editsBlockedReason({ lockedStarterIds: [], locked: true }, FORMAZIONE);
    expect(reason).toContain("blindata");
  });

  it("senza formazione letta non c'è niente da modificare, ed è un altro motivo", () => {
    const reason = editsBlockedReason({ lockedStarterIds: [], locked: false }, null);
    expect(reason).toContain("niente da modificare");
    expect(reason).not.toContain("blindata");
  });

  it("con una formazione e senza blindatura si modifica: nessun motivo", () => {
    expect(editsBlockedReason({ lockedStarterIds: ["p6"], locked: false }, FORMAZIONE)).toBe("");
  });
});

describe("modifica contro vincolo: si chiede, non si decide", () => {
  it("togliere dagli undici uno spuntato «lo voglio in campo» è un conflitto dichiarato", () => {
    const conflict = benchMoveConflict({ lockedStarterIds: ["p6"], locked: false }, "p6");
    expect(conflict?.kind).toBe("titolare_spuntato");
    expect(conflict?.message).toContain("p6");
    // E dice anche che cosa succede se si procede: la scelta è informata.
    expect(conflict?.ifRemoved).toContain("p6");
  });

  it("chi non è spuntato si sposta senza domande", () => {
    expect(benchMoveConflict({ lockedStarterIds: ["p6"], locked: false }, "p7")).toBeNull();
    expect(benchMoveConflict({ lockedStarterIds: [], locked: false }, "p6")).toBeNull();
  });

  it("cambiare modulo con un modulo bloccato diverso è un conflitto; con lo stesso no", () => {
    const constraints = { lockedStarterIds: [], lockedModule: "442", locked: false } as const;
    expect(moduleChangeConflict(constraints, "352")?.kind).toBe("modulo_bloccato");
    expect(moduleChangeConflict(constraints, "352")?.message).toContain("442");
    expect(moduleChangeConflict(constraints, "442")).toBeNull();
    expect(moduleChangeConflict({ lockedStarterIds: [], locked: false }, "352")).toBeNull();
  });
});

describe("la legalità di ciò che si vede, ricontrollata a ogni modifica", () => {
  const base = {
    matchday: 5,
    competitionId: CAMPIONATO.competitionId,
    roster: ROSA,
    settings: SETTINGS_IN_ACCORDO,
  };

  it("la formazione letta è legale per tutto ciò che si è potuto verificare", () => {
    const legality = draftLegality({ ...base, lineup: FORMAZIONE });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    expect(legality.blocking).toEqual([]);
    expect(legality.warnings).toEqual([]);
  });

  it("uno spostamento che rompe il modulo si vede SUBITO, e ferma il salvataggio", () => {
    const undici = eseguita(moveToStarters(FORMAZIONE, "p14", RUOLI));
    const legality = draftLegality({ ...base, lineup: undici });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    const codici = legality.blocking.map((violation) => violation.code);
    expect(codici).toContain("titolari_numero_errato");
    expect(codici).toContain("centrocampisti_numero_errato");
  });

  it("un modulo cambiato senza spostare nessuno è illegale, e i motivi arrivano insieme", () => {
    const legality = draftLegality({ ...base, lineup: eseguita(setLineupModule(FORMAZIONE, "343")) });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    // Non uno per volta: 4-4-2 verso 3-4-3 sbaglia difensori e attaccanti, e si
    // vedono entrambi al primo colpo d'occhio.
    const codici = legality.blocking.map((violation) => violation.code);
    expect(codici).toContain("difensori_numero_errato");
    expect(codici).toContain("attaccanti_numero_errato");
    expect(legality.blocking.length).toBeGreaterThanOrEqual(2);
  });

  it("un modulo fuori dall'elenco della lega è bloccante, e lo dice l'elenco osservato", () => {
    const legality = draftLegality({
      ...base,
      lineup: FORMAZIONE,
      settings: { ...SETTINGS_IN_ACCORDO, allowedModules: ["352"] },
    });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    expect(legality.blocking.map((violation) => violation.code)).toContain("modulo_non_ammesso");
  });

  it("ciò che non si è potuto verificare avverte e non ferma", () => {
    const { allowedModules: _ignorato, ...senzaModuli } = SETTINGS_IN_ACCORDO;
    const legality = draftLegality({ ...base, lineup: FORMAZIONE, settings: senzaModuli });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    expect(legality.blocking).toEqual([]);
    expect(legality.warnings.map((violation) => violation.code)).toContain(
      "modulo_non_verificabile",
    );
  });

  it("una panchina più corta delle sostituzioni avverte, perché §10 la lascia libera", () => {
    const corta = eseguita(moveOutside(FORMAZIONE, "p16"));
    const legality = draftLegality({ ...base, lineup: corta });
    expect(legality.kind).toBe("verificata");
    if (legality.kind !== "verificata") return;
    expect(legality.blocking).toEqual([]);
    expect(legality.warnings.map((violation) => violation.code)).toContain(
      "panchina_piu_corta_delle_sostituzioni",
    );
  });

  it("senza giornata non si dichiara «legale»: si dichiara che non si sa", () => {
    const legality = draftLegality({ ...base, matchday: null, lineup: FORMAZIONE });
    expect(legality.kind).toBe("non_verificabile");
    if (legality.kind !== "non_verificabile") return;
    expect(legality.reason).toContain("giornata");
  });

  it("un invio non costruibile diventa uno stato dichiarato, non un'eccezione", () => {
    const legality = draftLegality({ ...base, competitionId: "c2", lineup: FORMAZIONE });
    expect(legality.kind).toBe("non_verificabile");
    if (legality.kind !== "non_verificabile") return;
    expect(legality.reason).toContain("c2");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// LO SCAMBIO — atomico, e con un rifiuto che si legge.
//
// Ogni prova di rifiuto qui sotto mostra DUE cose, perché una sola non
// proverebbe niente: che il motivo è quello atteso, e che la formazione di
// partenza è rimasta esattamente quella di prima. Un rifiuto che avesse già
// spostato qualcuno sarebbe il difetto che questa funzione esiste per evitare.

/** Il rifiuto atteso, e la formazione che non si è mossa di un millimetro. */
function rifiutata(edit: LineupEdit, prima: ObservedLineup, copia: ObservedLineup): string {
  expect(edit.ok).toBe(false);
  if (edit.ok) throw new Error("lo scambio doveva essere rifiutato");
  expect(prima).toEqual(copia);
  return edit.reason;
}

/** Nessun vincolo: il caso in cui il modulo non è bloccato da niente. */
const SENZA_VINCOLI = NO_LINEUP_CONSTRAINTS;

/** Il modulo di partenza spuntato come «questo non si cambia». */
const MODULO_BLOCCATO: LineupConstraints = {
  lockedStarterIds: [],
  lockedModule: "442",
  locked: false,
};

/** Copia profonda, per confrontare il prima con il dopo. */
function copiaDi(lineup: ObservedLineup): ObservedLineup {
  return {
    ...lineup,
    starterIds: [...lineup.starterIds],
    benchIds: [...lineup.benchIds],
    flags: { ...lineup.flags },
  };
}

/** 3-5-2: dal 4-4-2 ogni scambio cade su un modulo ammesso, da qui no. */
const FORMAZIONE_352: ObservedLineup = {
  ...FORMAZIONE,
  module: "352",
  starterIds: ["p2", "p3", "p4", "p6", "p7", "p8", "p9", "p14", "p10", "p11"],
  benchIds: ["p12", "p5", "p13", "p15", "p16"],
};

describe("scambiare due giocatori di posto", () => {
  it("due titolari dello stesso ruolo si scambiano il posto, e il modulo non cambia", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p2", "p3", RUOLI, SENZA_VINCOLI));
    expect(dopo.module).toBe("442");
    expect(dopo.starterIds).toEqual(["p3", "p2", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"]);
    expect(dopo.benchIds).toEqual(FORMAZIONE.benchIds);
    expect(dopo.goalkeeperId).toBe("p1");
  });

  it("due titolari lontani nell'elenco si scambiano davvero, non tornano indietro", () => {
    // Se le due caselle si cercassero una dopo l'altra, la seconda troverebbe
    // l'id appena scritto e lo scambio si annullerebbe da sé.
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p2", "p5", RUOLI, SENZA_VINCOLI));
    expect(dopo.starterIds).toEqual(["p5", "p3", "p4", "p2", "p6", "p7", "p8", "p9", "p10", "p11"]);
  });

  it("due panchinari si scambiano l'ordine d'ingresso, e nient'altro si muove", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p12", "p16", RUOLI, SENZA_VINCOLI));
    expect(dopo.benchIds).toEqual(["p16", "p13", "p14", "p15", "p12"]);
    expect(dopo.starterIds).toEqual(FORMAZIONE.starterIds);
    expect(dopo.goalkeeperId).toBe("p1");
    expect(dopo.module).toBe("442");
  });

  it("panchina e campo con ruoli diversi: il modulo diventa quello che descrive gli undici", () => {
    // Un centrocampista entra al posto di un difensore: 4-4-2 diventa 3-5-2, e
    // l'etichetta segue i ruoli invece di contraddirli.
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p2", "p14", RUOLI, SENZA_VINCOLI));
    expect(dopo.module).toBe("352");
    expect(dopo.starterIds).toEqual([
      "p14",
      "p3",
      "p4",
      "p5",
      "p6",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
    ]);
    expect(dopo.benchIds).toEqual(["p12", "p13", "p2", "p15", "p16"]);
    expect(dopo.goalkeeperId).toBe("p1");
  });

  it("una forma che nessuno dei sette moduli ha si rifiuta, e la formazione resta quella", () => {
    const copia = copiaDi(FORMAZIONE_352);
    // Dal 3-5-2, un difensore che esce per un attaccante lascerebbe due
    // difensori: §9 non ha nessun modulo con due difensori.
    const reason = rifiutata(
      swapPlayers(FORMAZIONE_352, "p2", "p15", RUOLI, SENZA_VINCOLI),
      FORMAZIONE_352,
      copia,
    );
    expect(reason).toContain("2 difensori");
    expect(reason).toContain("sette moduli");

    // E la strada opposta esiste davvero: dalla stessa formazione, lo scambio
    // che cade su un modulo ammesso passa. Il rifiuto è la regola, non il muro.
    const ammesso = eseguita(swapPlayers(FORMAZIONE_352, "p14", "p13", RUOLI, SENZA_VINCOLI));
    expect(ammesso.module).toBe("442");
  });

  it("un ruolo non osservato fra i titolari ferma lo scambio invece di supporre la forma", () => {
    const senzaP7 = new Map(RUOLI);
    senzaP7.delete("p7");
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(swapPlayers(FORMAZIONE, "p2", "p14", senzaP7, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(reason).toContain("p7");
    expect(reason).toContain("non è stato osservato");

    // Con i ruoli completi lo stesso scambio si esegue: è il ruolo mancante a
    // cambiare la strada, non lo scambio in sé.
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p2", "p14", RUOLI, SENZA_VINCOLI));
    expect(dopo.module).toBe("352");
  });

  it("uno scambio che non tocca gli undici non ha bisogno di conoscere i ruoli", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p13", "p15", new Map(), SENZA_VINCOLI));
    expect(dopo.benchIds).toEqual(["p12", "p15", "p14", "p13", "p16"]);
    expect(dopo.module).toBe("442");
  });
});

describe("la porta, nello scambio", () => {
  it("un portiere della panchina prende la porta, e chi c'era prende la sua casella", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p1", "p12", RUOLI, SENZA_VINCOLI));
    expect(dopo.goalkeeperId).toBe("p12");
    expect(dopo.benchIds).toEqual(["p1", "p13", "p14", "p15", "p16"]);
    expect(dopo.starterIds).toEqual(FORMAZIONE.starterIds);
    expect(dopo.module).toBe("442");
  });

  it("in porta non ci va chi portiere non è, e la porta non resta mai vuota", () => {
    const copia = copiaDi(FORMAZIONE);
    const daPanchina = rifiutata(swapPlayers(FORMAZIONE, "p1", "p13", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(daPanchina).toContain("p13");
    expect(daPanchina).toContain("in porta ci va un portiere");

    const dalCampo = rifiutata(swapPlayers(FORMAZIONE, "p1", "p6", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(dalCampo).toContain("in porta ci va un portiere");
  });

  it("un portiere il cui ruolo non è stato letto non entra in porta per esclusione", () => {
    const senzaP12 = new Map(RUOLI);
    senzaP12.delete("p12");
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(swapPlayers(FORMAZIONE, "p1", "p12", senzaP12, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(reason).toContain("p12");
    expect(reason).toContain("non è stato osservato");
  });

  it("un secondo portiere fra gli undici di movimento si rifiuta: non c'è casella per lui", () => {
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(swapPlayers(FORMAZIONE, "p2", "p12", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(reason).toContain("portiere");
    expect(reason).toContain("sette moduli");
  });

  it("ogni scambio accettato lascia la porta occupata", () => {
    const accettati = [
      swapPlayers(FORMAZIONE, "p1", "p12", RUOLI, SENZA_VINCOLI),
      swapPlayers(FORMAZIONE, "p2", "p3", RUOLI, SENZA_VINCOLI),
      swapPlayers(FORMAZIONE, "p2", "p14", RUOLI, SENZA_VINCOLI),
    ];
    for (const edit of accettati) {
      expect(edit.ok).toBe(true);
      if (!edit.ok) continue;
      expect(edit.lineup.goalkeeperId.length).toBeGreaterThan(0);
    }
  });
});

describe("gli scambi che non sono scambi", () => {
  it("scambiare qualcuno con sé stesso non è una mossa", () => {
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(swapPlayers(FORMAZIONE, "p2", "p2", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(reason).toContain("sé stesso");
  });

  it("un id che nella formazione non c'è non ha un posto da cedere", () => {
    const copia = copiaDi(FORMAZIONE);
    const primo = rifiutata(swapPlayers(FORMAZIONE, "p99", "p2", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(primo).toContain("p99");
    expect(primo).toContain("non è schierato");

    const secondo = rifiutata(swapPlayers(FORMAZIONE, "p2", "p99", RUOLI, SENZA_VINCOLI), FORMAZIONE, copia);
    expect(secondo).toContain("p99");
  });

  it("chi è in rosa ma fuori dai convocati si fa entrare, non si scambia", () => {
    const senzaP16 = eseguita(moveOutside(FORMAZIONE, "p16"));
    expect(placeOf(senzaP16, "p16")).toBe("fuori");
    const copia = copiaDi(senzaP16);
    const reason = rifiutata(swapPlayers(senzaP16, "p16", "p15", RUOLI, SENZA_VINCOLI), senzaP16, copia);
    expect(reason).toContain("p16");
    expect(reason).toContain("non è schierato");
  });
});

describe("la forma di un modulo lo identifica", () => {
  it("i sette moduli di §9 hanno sette forme diverse: nessuno scambio è ambiguo", () => {
    const forme = MODULES.map((module) => {
      const shape = moduleShape(module);
      return `${shape.defenders}-${shape.midfielders}-${shape.strikers}`;
    });
    expect(new Set(forme).size).toBe(MODULES.length);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// IL MODULO BLOCCATO, E IL TRASCINAMENTO CHE NON LO AGGIRA.

/** Il rifiuto che porta con sé il vincolo contraddetto, e la formazione ferma. */
function conConflitto(
  edit: LineupEdit,
  prima: ObservedLineup,
  copia: ObservedLineup,
): ConstraintConflict {
  expect(edit.ok).toBe(false);
  if (edit.ok) throw new Error("la mossa doveva essere rifiutata");
  expect(prima).toEqual(copia);
  expect(edit.conflict, "un rifiuto per vincolo deve dire QUALE vincolo").toBeDefined();
  if (edit.conflict === undefined) throw new Error("rifiuto senza conflitto");
  // Mai muto: il motivo si mostra a schermo anche senza guardare il conflitto.
  expect(edit.reason.length).toBeGreaterThan(0);
  expect(edit.reason).toBe(edit.conflict.message);
  return edit.conflict;
}

describe("un modulo bloccato non si cambia trascinando", () => {
  it("lo scambio che cambierebbe il modulo bloccato produce IL CONFLITTO, non un'esecuzione silenziosa", () => {
    const copia = copiaDi(FORMAZIONE);
    const conflitto = conConflitto(
      swapPlayers(FORMAZIONE, "p2", "p14", RUOLI, MODULO_BLOCCATO),
      FORMAZIONE,
      copia,
    );
    // È lo STESSO conflitto del cambio di modulo esplicito: stessa forma,
    // stesse parole, stessa via d'uscita.
    expect(conflitto).toEqual(moduleChangeConflict(MODULO_BLOCCATO, "352"));
    expect(conflitto.kind).toBe("modulo_bloccato");
    expect(conflitto.ifRemoved).toContain("352");

    // E senza il vincolo lo stesso identico scambio passa: è la spunta a
    // cambiare la strada, non lo scambio.
    const senzaVincolo = eseguita(swapPlayers(FORMAZIONE, "p2", "p14", RUOLI, SENZA_VINCOLI));
    expect(senzaVincolo.module).toBe("352");
  });

  it("uno scambio che non cambia il modulo non tocca il vincolo", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE, "p2", "p3", RUOLI, MODULO_BLOCCATO));
    expect(dopo.module).toBe("442");
    expect(dopo.starterIds[0]).toBe("p3");
  });

  it("uno scambio che ARRIVA sul modulo bloccato è la mossa che il vincolo vuole", () => {
    const dopo = eseguita(swapPlayers(FORMAZIONE_352, "p14", "p13", RUOLI, MODULO_BLOCCATO));
    expect(dopo.module).toBe("442");
  });

  it("anche posare un giocatore su una casella vuota passa dal vincolo", () => {
    const copia = copiaDi(SENZA_UN_DIFENSORE);
    const conflitto = conConflitto(
      fillSlot(SENZA_UN_DIFENSORE, "p14", casellaVuotaDifesa(), RUOLI, MODULO_BLOCCATO),
      SENZA_UN_DIFENSORE,
      copia,
    );
    expect(conflitto).toEqual(moduleChangeConflict(MODULO_BLOCCATO, "352"));

    const senzaVincolo = eseguita(
      fillSlot(SENZA_UN_DIFENSORE, "p14", casellaVuotaDifesa(), RUOLI, SENZA_VINCOLI),
    );
    expect(senzaVincolo.module).toBe("352");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// POSARE QUALCUNO SU UNA CASELLA VUOTA.

/** Il 4-4-2 a cui manca un difensore: la casella libera è in difesa. */
const SENZA_UN_DIFENSORE: ObservedLineup = {
  ...FORMAZIONE,
  starterIds: FORMAZIONE.starterIds.filter((id) => id !== "p5"),
  benchIds: ["p12", "p13", "p14", "p15", "p16"],
};

/** Il 3-5-2 a cui manca un difensore: da qui non ogni forma è ammessa. */
const TRE_CINQUE_DUE_INCOMPLETO: ObservedLineup = {
  ...FORMAZIONE,
  module: "352",
  starterIds: ["p2", "p3", "p6", "p7", "p8", "p9", "p14", "p10", "p11"],
  benchIds: ["p12", "p5", "p13", "p15", "p16"],
};

/** La casella del campo di adesso, presa dal campo di adesso. */
function casellaDi(lineup: ObservedLineup, line: number, indexInLine: number): PitchSlot {
  const riga = pitchLayout(lineup, RUOLI).lines[line];
  const casella = riga === undefined ? undefined : riga[indexInLine];
  if (casella === undefined) throw new Error(`casella ${line}/${indexInLine} assente`);
  return casella;
}

/** L'unica casella vuota del 4-4-2 senza un difensore. */
function casellaVuotaDifesa(): PitchSlot {
  const casella = casellaDi(SENZA_UN_DIFENSORE, 1, 3);
  expect(casella.playerId).toBeNull();
  return casella;
}

describe("posare un giocatore su una casella vuota", () => {
  it("un difensore riempie la casella libera della difesa, e il modulo resta quello", () => {
    const dopo = eseguita(fillSlot(SENZA_UN_DIFENSORE, "p13", casellaVuotaDifesa(), RUOLI, SENZA_VINCOLI));
    expect(dopo.module).toBe("442");
    expect(dopo.starterIds).toEqual([...SENZA_UN_DIFENSORE.starterIds, "p13"]);
    expect(dopo.benchIds).toEqual(["p12", "p14", "p15", "p16"]);
    // E il campo non ha più buchi.
    const campo = pitchLayout(dopo, RUOLI);
    expect(campo.lines[1]?.map((slot) => slot.playerId)).toEqual(["p2", "p3", "p4", "p13"]);
    expect(campo.unplaced).toEqual([]);
  });

  it("un centrocampista posato sulla casella della difesa NON diventa un difensore", () => {
    const dopo = eseguita(fillSlot(SENZA_UN_DIFENSORE, "p14", casellaVuotaDifesa(), RUOLI, SENZA_VINCOLI));
    // Il conto dei reparti cambia e il modulo lo descrive: 3-5-2.
    expect(dopo.module).toBe("352");
    const campo = pitchLayout(dopo, RUOLI);
    expect(campo.lines[1]?.map((slot) => slot.playerId)).toEqual(["p2", "p3", "p4"]);
    expect(campo.lines[2]?.map((slot) => slot.playerId)).toEqual([
      "p6",
      "p7",
      "p8",
      "p9",
      "p14",
    ]);
    expect(campo.unplaced).toEqual([]);
  });

  it("una forma che nessun modulo ha si rifiuta con il motivo, e la formazione resta quella", () => {
    const casella = casellaDi(TRE_CINQUE_DUE_INCOMPLETO, 1, 2);
    expect(casella.playerId).toBeNull();
    const copia = copiaDi(TRE_CINQUE_DUE_INCOMPLETO);
    const reason = rifiutata(
      fillSlot(TRE_CINQUE_DUE_INCOMPLETO, "p15", casella, RUOLI, SENZA_VINCOLI),
      TRE_CINQUE_DUE_INCOMPLETO,
      copia,
    );
    expect(reason).toContain("p15");
    expect(reason).toContain("2 difensori");
    expect(reason).toContain("sette moduli");

    // La strada che passa esiste: un difensore nella stessa casella completa
    // il 3-5-2 e la mossa si esegue.
    const dopo = eseguita(
      fillSlot(TRE_CINQUE_DUE_INCOMPLETO, "p13", casella, RUOLI, SENZA_VINCOLI),
    );
    expect(dopo.module).toBe("352");
  });

  it("la porta vuota si riempie con un portiere, e con nessun altro", () => {
    const senzaPortiere: ObservedLineup = { ...FORMAZIONE, goalkeeperId: "" };
    const porta = casellaDi(senzaPortiere, 0, 0);
    expect(porta.playerId).toBeNull();

    const dopo = eseguita(fillSlot(senzaPortiere, "p12", porta, RUOLI, SENZA_VINCOLI));
    expect(dopo.goalkeeperId).toBe("p12");
    expect(dopo.benchIds).toEqual(["p13", "p14", "p15", "p16"]);
    expect(dopo.starterIds).toEqual(FORMAZIONE.starterIds);
    expect(dopo.module).toBe("442");

    const copia = copiaDi(senzaPortiere);
    const reason = rifiutata(
      fillSlot(senzaPortiere, "p13", porta, RUOLI, SENZA_VINCOLI),
      senzaPortiere,
      copia,
    );
    expect(reason).toContain("in porta ci va un portiere");
  });

  it("il portiere non lascia la porta vuota per andare in un posto libero", () => {
    const copia = copiaDi(SENZA_UN_DIFENSORE);
    const reason = rifiutata(
      fillSlot(SENZA_UN_DIFENSORE, "p1", casellaVuotaDifesa(), RUOLI, SENZA_VINCOLI),
      SENZA_UN_DIFENSORE,
      copia,
    );
    expect(reason).toContain("la porta non può restare vuota");
  });

  it("una casella occupata non si riempie: quello è uno scambio, e il rifiuto lo dice", () => {
    const occupata = casellaDi(FORMAZIONE, 1, 0);
    expect(occupata.playerId).toBe("p2");
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(
      fillSlot(FORMAZIONE, "p13", occupata, RUOLI, SENZA_VINCOLI),
      FORMAZIONE,
      copia,
    );
    expect(reason).toContain("p2");
    expect(reason).toContain("scambio");
  });

  it("una casella di un disegno precedente non è un posto", () => {
    // La casella libera del 4-4-2 senza un difensore, usata contro il 4-4-2
    // completo: lì dentro adesso c'è p5.
    const vecchia = casellaVuotaDifesa();
    const copia = copiaDi(FORMAZIONE);
    const reason = rifiutata(
      fillSlot(FORMAZIONE, "p13", vecchia, RUOLI, SENZA_VINCOLI),
      FORMAZIONE,
      copia,
    );
    expect(reason).toContain("p5");
    expect(reason).toContain("il campo è cambiato");
  });

  it("una casella che il modulo non prevede non esiste, e non si inventa", () => {
    const copia = copiaDi(SENZA_UN_DIFENSORE);
    const oltreLAttacco: PitchSlot = { role: "A", line: 3, indexInLine: 4, playerId: null };
    expect(
      rifiutata(
        fillSlot(SENZA_UN_DIFENSORE, "p13", oltreLAttacco, RUOLI, SENZA_VINCOLI),
        SENZA_UN_DIFENSORE,
        copia,
      ),
    ).toContain("non la prevede");

    // Stessa riga, ruolo che non è quello del reparto: la casella dichiarata
    // non corrisponde a nessuna casella vera.
    const ruoloSbagliato: PitchSlot = { role: "C", line: 1, indexInLine: 3, playerId: null };
    expect(
      rifiutata(
        fillSlot(SENZA_UN_DIFENSORE, "p13", ruoloSbagliato, RUOLI, SENZA_VINCOLI),
        SENZA_UN_DIFENSORE,
        copia,
      ),
    ).toContain("non la prevede");
  });

  it("chi è fuori dai convocati entra con la mossa che lo fa entrare", () => {
    const copia = copiaDi(TRE_CINQUE_DUE_INCOMPLETO);
    const casella = casellaDi(TRE_CINQUE_DUE_INCOMPLETO, 1, 2);
    const reason = rifiutata(
      fillSlot(TRE_CINQUE_DUE_INCOMPLETO, "p4", casella, RUOLI, SENZA_VINCOLI),
      TRE_CINQUE_DUE_INCOMPLETO,
      copia,
    );
    expect(reason).toContain("p4");
    expect(reason).toContain("non è schierato");
  });

  it("un titolare non si sposta di casella: il reparto lo decide il suo ruolo", () => {
    const copia = copiaDi(SENZA_UN_DIFENSORE);
    const reason = rifiutata(
      fillSlot(SENZA_UN_DIFENSORE, "p6", casellaVuotaDifesa(), RUOLI, SENZA_VINCOLI),
      SENZA_UN_DIFENSORE,
      copia,
    );
    expect(reason).toContain("è già fra i titolari");
  });

  it("un ruolo non osservato ferma la mossa invece di supporre la forma", () => {
    const senzaP13 = new Map(RUOLI);
    senzaP13.delete("p13");
    const copia = copiaDi(SENZA_UN_DIFENSORE);
    const casella = casellaDi(SENZA_UN_DIFENSORE, 1, 3);
    const reason = rifiutata(
      fillSlot(SENZA_UN_DIFENSORE, "p13", casella, senzaP13, SENZA_VINCOLI),
      SENZA_UN_DIFENSORE,
      copia,
    );
    expect(reason).toContain("p13");
    expect(reason).toContain("non è stato osservato");
  });
});
