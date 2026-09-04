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
  type LineupEdit,
} from "../src/lineupDraft.js";
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
