import { describe, it, expect } from "vitest";
import {
  NIENTE_DA_INVIARE,
  NO_LINEUP_CONSTRAINTS,
  buildFormazioneView,
  decideInitialScreen,
  localConstraintIssues,
  mergeConstraintIssues,
  normalizeConstraintReport,
  prepareSubmission,
  reconcileConstraints,
  setLockedModule,
  submissionUiState,
  toggleLocked,
  toggleLockedStarter,
  unmetConstraints,
  type ChannelUnknownCause,
  type LineupChannelState,
  type LineupConstraints,
  type ObservedCompetitionLineup,
} from "../src/lineupCoachSurface.js";
import { rolesByPlayerId } from "../src/roster.js";
import type { ObservedTeam } from "../src/roster.js";
import { rejectedOutcome, notAttemptedOutcome, outcomeFromReadBack } from "../src/lineupSubmission.js";
import { CAMPIONATO, COPPA, FORMAZIONE, ROSA, SETTINGS_IN_ACCORDO } from "./fixtures.js";

// LA PAGINA FORMAZIONE, INTERROGATA SENZA BROWSER.
//
// Tutto ciò che questa schermata decide è qui dentro, e qui dentro si prova:
// quale pagina apre il sito, quali vincoli salvati valgono ancora, che cosa può
// essere salvato e che cosa significa «salvato». Le fixture sono quelle
// sintetiche del pacchetto — `p1…p16`, `t1`, `c1`, `c2` — e nessun test tocca
// la rete, perché non c'è rete da toccare.

const ROSA_VUOTA: ObservedTeam = { teamId: "t1", players: [] };

function campionato(state: ObservedCompetitionLineup["state"], matchday: number | null = 5): ObservedCompetitionLineup {
  return { competition: CAMPIONATO, matchday, state };
}

function letto(
  competitions: readonly ObservedCompetitionLineup[],
  roster: ObservedTeam = ROSA,
): LineupChannelState {
  return { kind: "letto", roster, settings: SETTINGS_IN_ACCORDO, competitions };
}

function sconosciuto(cause: ChannelUnknownCause, detail = ""): LineupChannelState {
  return { kind: "sconosciuto", cause, detail };
}

describe("quale pagina apre il sito", () => {
  it("rosa vuota — prima dell'asta o a stagione finita — apre sull'asta", () => {
    expect(decideInitialScreen(letto([campionato({ kind: "letta", lineup: null })], ROSA_VUOTA))).toBe(
      "asta",
    );
  });

  it("rosa piena e formazione GIÀ schierata apre sulla formazione", () => {
    expect(decideInitialScreen(letto([campionato({ kind: "letta", lineup: FORMAZIONE })]))).toBe(
      "formazione",
    );
  });

  it("rosa piena e formazione ASSENTE apre sulla formazione: è quando serve di più", () => {
    // La distinzione che questa riga difende: «non ho ancora schierato» non è
    // «non ho niente da fare». Confondere rosa e formazione qui nasconderebbe
    // la pagina esattamente nel momento in cui è utile.
    expect(decideInitialScreen(letto([campionato({ kind: "letta", lineup: null })]))).toBe(
      "formazione",
    );
  });

  it("una lega che non risponde, o risponde storto, apre comunque sulla formazione", () => {
    for (const cause of ["risposta_assente", "risposta_illeggibile", "non_diagnosticabile"] as const) {
      expect(decideInitialScreen(sconosciuto(cause)), cause).toBe("formazione");
    }
  });

  it("la porta non collegata apre sull'asta: non è «non so», è «qui il canale non c'è»", () => {
    expect(decideInitialScreen(sconosciuto("porta_non_collegata"))).toBe("asta");
  });
});

describe("quando lo stato non è noto, l'avviso prende il posto della squadra", () => {
  it("nessuna competizione viene costruita: non esiste lo schermo misto", () => {
    for (const cause of [
      "porta_non_collegata",
      "risposta_assente",
      "risposta_illeggibile",
      "non_diagnosticabile",
    ] as const) {
      const view = buildFormazioneView(sconosciuto(cause), new Map());
      expect(view.known, cause).toBe(false);
      expect(view.competitions, cause).toEqual([]);
      expect(view.notice?.cause, cause).toBe(cause);
      expect(view.notice?.title.length, cause).toBeGreaterThan(0);
    }
  });

  it("i tre casi distinguibili si distinguono, e il dettaglio della porta viaggia con l'avviso", () => {
    const titoli = new Set(
      (["porta_non_collegata", "risposta_assente", "risposta_illeggibile"] as const).map(
        (cause) => buildFormazioneView(sconosciuto(cause), new Map()).notice?.title,
      ),
    );
    expect(titoli.size).toBe(3);
    const view = buildFormazioneView(sconosciuto("risposta_illeggibile", "campo mancante"), new Map());
    expect(view.notice?.detail).toContain("campo mancante");
  });

  it("quando la causa non è accertabile lo si dichiara con una formula sola", () => {
    const view = buildFormazioneView(sconosciuto("non_diagnosticabile"), new Map());
    expect(view.notice?.detail).toContain("non si sa");
  });
});

describe("le due formazioni", () => {
  it("il campionato si mostra e la coppa dichiara perché non è disponibile", () => {
    const view = buildFormazioneView(
      letto([
        campionato({ kind: "letta", lineup: FORMAZIONE }),
        {
          competition: COPPA,
          matchday: null,
          state: { kind: "non_disponibile", reason: "la coppa non è ancora cominciata" },
        },
      ]),
      new Map(),
    );
    expect(view.known).toBe(true);
    expect(view.competitions).toHaveLength(2);

    const [primo, secondo] = view.competitions;
    expect(primo?.lineup).toEqual(FORMAZIONE);
    expect(primo?.unavailableReason).toBe("");
    expect(primo?.editable).toBe(true);

    // La seconda formazione NON è una griglia vuota che sembri modificabile.
    expect(secondo?.lineup).toBeNull();
    expect(secondo?.unavailableReason).toBe("la coppa non è ancora cominciata");
    expect(secondo?.editable).toBe(false);
  });

  it("le righe della rosa dicono chi è in campo e chi porta la spunta", () => {
    const constraints = new Map<string, LineupConstraints>([
      [CAMPIONATO.competitionId, { lockedStarterIds: ["p6"], locked: false }],
    ]);
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      constraints,
    );
    const righe = view.competitions[0]?.players ?? [];
    expect(righe).toHaveLength(ROSA.players.length);
    expect(righe.find((riga) => riga.id === "p1")?.starter).toBe(true);
    expect(righe.find((riga) => riga.id === "p12")?.starter).toBe(false);
    expect(righe.find((riga) => riga.id === "p6")?.locked).toBe(true);
    expect(righe.find((riga) => riga.id === "p7")?.locked).toBe(false);
    expect(righe.find((riga) => riga.id === "p5")?.availability).toBe("in_dubbio");
  });

  it("una formazione blindata non è modificabile", () => {
    const constraints = new Map<string, LineupConstraints>([
      [CAMPIONATO.competitionId, { lockedStarterIds: [], locked: true }],
    ]);
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      constraints,
    );
    expect(view.competitions[0]?.editable).toBe(false);
  });
});

describe("i tre comandi", () => {
  it("la spunta si accende, si spegne, e conserva l'ordine in cui è stata messa", () => {
    let constraints: LineupConstraints = NO_LINEUP_CONSTRAINTS;
    constraints = toggleLockedStarter(constraints, "p3");
    constraints = toggleLockedStarter(constraints, "p2");
    expect(constraints.lockedStarterIds).toEqual(["p3", "p2"]);
    constraints = toggleLockedStarter(constraints, "p3");
    expect(constraints.lockedStarterIds).toEqual(["p2"]);
  });

  it("il modulo si blocca e si sblocca senza toccare le spunte", () => {
    const conSpunte: LineupConstraints = { lockedStarterIds: ["p2"], locked: false };
    const bloccato = setLockedModule(conSpunte, "352");
    expect(bloccato.lockedModule).toBe("352");
    expect(bloccato.lockedStarterIds).toEqual(["p2"]);
    const sbloccato = setLockedModule(bloccato, null);
    expect(sbloccato.lockedModule).toBeUndefined();
    expect(sbloccato.lockedStarterIds).toEqual(["p2"]);
  });

  it("blindare non cancella quello che era già stato scelto", () => {
    const partenza: LineupConstraints = { lockedStarterIds: ["p2"], lockedModule: "442", locked: false };
    const blindata = toggleLocked(partenza);
    expect(blindata.locked).toBe(true);
    expect(blindata.lockedStarterIds).toEqual(["p2"]);
    expect(blindata.lockedModule).toBe("442");
    expect(toggleLocked(blindata).locked).toBe(false);
  });
});

describe("i vincoli salvati che non valgono più finiscono in quarantena", () => {
  it("un giocatore bloccato che non è più in rosa si dice, e non si applica", () => {
    const reconciled = reconcileConstraints(
      { lockedStarterIds: ["p2", "p99"], locked: false },
      ROSA,
      SETTINGS_IN_ACCORDO.allowedModules,
    );
    expect(reconciled.applied.lockedStarterIds).toEqual(["p2"]);
    expect(reconciled.quarantined).toHaveLength(1);
    expect(reconciled.quarantined[0]?.kind).toBe("titolare_fuori_rosa");
    expect(reconciled.quarantined[0]?.value).toBe("p99");
    expect(reconciled.quarantined[0]?.reason).toContain("non è più in rosa");
  });

  it("un modulo che la lega non ammette più si mette da parte", () => {
    const reconciled = reconcileConstraints(
      { lockedStarterIds: [], lockedModule: "343", locked: false },
      ROSA,
      ["442", "352"],
    );
    expect(reconciled.applied.lockedModule).toBeUndefined();
    expect(reconciled.quarantined[0]?.kind).toBe("modulo_non_ammesso");
    expect(reconciled.quarantined[0]?.value).toBe("343");
  });

  it("senza un elenco osservato di moduli non si giudica il modulo bloccato", () => {
    const reconciled = reconcileConstraints(
      { lockedStarterIds: [], lockedModule: "343", locked: false },
      ROSA,
      undefined,
    );
    expect(reconciled.applied.lockedModule).toBe("343");
    expect(reconciled.quarantined).toEqual([]);
  });

  it("la quarantena arriva fino alla pagina, invece di sparire durante il tragitto", () => {
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      new Map([[CAMPIONATO.competitionId, { lockedStarterIds: ["p99"], locked: false }]]),
    );
    expect(view.competitions[0]?.quarantined).toHaveLength(1);
    expect(view.competitions[0]?.constraints.lockedStarterIds).toEqual([]);
  });
});

describe("quando i vincoli rendono la formazione impossibile, i motivi arrivano tutti insieme", () => {
  const roles = rolesByPlayerId(ROSA);
  const codici = (constraints: Parameters<typeof localConstraintIssues>[0], lineup = FORMAZIONE): readonly string[] =>
    localConstraintIssues(constraints, lineup, roles, SETTINGS_IN_ACCORDO.allowedModules).rejections.map(
      (issue) => issue.code,
    );

  it("cinque difensori bloccati con un 4-4-2 imposto non entrano in campo", () => {
    expect(
      codici({ lockedStarterIds: ["p2", "p3", "p4", "p5", "p13"], lockedModule: "442", locked: false }),
    ).toContain("LOCKED_MODULE_INCOMPATIBLE");
  });

  it("gli stessi cinque difensori stanno in un 5-4-1, e nessun motivo viene emesso", () => {
    expect(
      codici({ lockedStarterIds: ["p2", "p3", "p4", "p5", "p13"], lockedModule: "541", locked: false }),
    ).toEqual([]);
  });

  it("sei difensori non stanno in NESSUN modulo di §9, e il motivo lo dice", () => {
    expect(
      codici({ lockedStarterIds: ["p2", "p3", "p4", "p5", "p13", "p17"], locked: false }, FORMAZIONE),
    ).toContain("LOCKED_PLAYER_UNKNOWN");
    const roleOverflow = localConstraintIssues(
      { lockedStarterIds: ["p2", "p3", "p4", "p5", "p13"], locked: false },
      FORMAZIONE,
      new Map([
        ["p2", "D"],
        ["p3", "D"],
        ["p4", "D"],
        ["p5", "D"],
        ["p13", "D"],
      ]),
      ["442"],
    );
    expect(roleOverflow.rejections.map((issue) => issue.code)).toContain("LOCKED_MODULE_INCOMPATIBLE");
  });

  it("due portieri bloccati sfondano il reparto in qualunque modulo", () => {
    expect(codici({ lockedStarterIds: ["p1", "p12"], locked: false })).toContain(
      "LOCKED_ROLE_OVERFLOW",
    );
  });

  it("più di undici spuntati sono più di undici, e basta", () => {
    const dodici = ROSA.players.slice(0, 12).map((player) => player.id);
    expect(codici({ lockedStarterIds: dodici, locked: false })).toContain("LOCKED_TOO_MANY");
  });

  it("tre problemi insieme si vedono insieme: nessuno aspetta il suo turno", () => {
    const issues = localConstraintIssues(
      { lockedStarterIds: ["p2", "p2", "p99", "p1", "p12"], lockedModule: "442", locked: false },
      FORMAZIONE,
      roles,
      SETTINGS_IN_ACCORDO.allowedModules,
    );
    const emessi = issues.rejections.map((issue) => issue.code);
    expect(emessi).toContain("LOCKED_PLAYER_DUPLICATED");
    expect(emessi).toContain("LOCKED_PLAYER_UNKNOWN");
    expect(emessi).toContain("LOCKED_ROLE_OVERFLOW");
    expect(issues.rejections.length).toBeGreaterThanOrEqual(3);
  });

  it("ogni motivo porta i giocatori che lo causano, così la pagina lo può mettere sulla riga giusta", () => {
    const issues = localConstraintIssues(
      { lockedStarterIds: ["p1", "p12"], locked: false },
      FORMAZIONE,
      roles,
      SETTINGS_IN_ACCORDO.allowedModules,
    );
    expect(issues.rejections[0]?.playerIds).toEqual(["p1", "p12"]);
  });

  it("un ruolo non osservato non fa scattare nessun rifiuto sul suo reparto", () => {
    const parziali = new Map(roles);
    parziali.delete("p2");
    const issues = localConstraintIssues(
      { lockedStarterIds: ["p2", "p3"], lockedModule: "442", locked: false },
      FORMAZIONE,
      parziali,
      SETTINGS_IN_ACCORDO.allowedModules,
    );
    expect(issues.rejections.map((issue) => issue.code)).toEqual(["LOCKED_PLAYER_UNKNOWN"]);
  });

  it("il core pubblico non inventa mai l'avvertimento sulle previsioni", () => {
    // `LOCKED_PLAYER_NEVER_PLAYS` riguarda le previsioni, che qui non esistono:
    // arriva dal produttore o non arriva.
    expect(
      localConstraintIssues({ lockedStarterIds: ["p2"], locked: false }, FORMAZIONE, roles).warnings,
    ).toEqual([]);
  });

  it("la pagina non offre il salvataggio di una formazione impossibile", () => {
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      new Map([
        [
          CAMPIONATO.competitionId,
          { lockedStarterIds: ["p2", "p3", "p4", "p5", "p13"], lockedModule: "442", locked: false },
        ],
      ]),
    );
    expect(view.competitions[0]?.feasible).toBe(false);
    expect(view.competitions[0]?.issues.rejections.length).toBeGreaterThan(0);
  });
});

describe("la formazione blindata tiene quella che ha in mano, e senza quella rifiuta", () => {
  const roles = rolesByPlayerId(ROSA);

  it("blindata senza nessuna formazione letta: LOCKED_LINEUP_MISSING", () => {
    const issues = localConstraintIssues({ lockedStarterIds: [], locked: true }, null, roles);
    expect(issues.rejections.map((issue) => issue.code)).toEqual(["LOCKED_LINEUP_MISSING"]);
  });

  it("blindata su una formazione che contraddice le spunte: si dice quale contraddizione", () => {
    const issues = localConstraintIssues(
      { lockedStarterIds: ["p14"], locked: true },
      FORMAZIONE,
      roles,
    );
    const rifiuto = issues.rejections.find(
      (issue) => issue.code === "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS",
    );
    expect(rifiuto?.message).toContain("p14");
    expect(rifiuto?.playerIds).toEqual(["p14"]);
  });

  it("blindata su una formazione coerente non produce nessun motivo", () => {
    expect(
      localConstraintIssues({ lockedStarterIds: ["p6"], locked: true }, FORMAZIONE, roles).rejections,
    ).toEqual([]);
  });
});

describe("il rapporto del produttore si legge in entrambe le forme", () => {
  const rifiuto = {
    code: "LOCKED_MODULE_INCOMPATIBLE" as const,
    message: "nessun modulo regge i ruoli imposti",
    playerIds: ["p2"],
  };
  const avvertimento = {
    code: "LOCKED_PLAYER_NEVER_PLAYS" as const,
    message: "secondo le previsioni non gioca",
    playerIds: ["p11"],
  };

  it("un motivo solo, nella forma singola di oggi", () => {
    const issues = normalizeConstraintReport({ rejection: rifiuto, warnings: [avvertimento] });
    expect(issues.rejections).toEqual([rifiuto]);
    expect(issues.warnings).toEqual([avvertimento]);
  });

  it("una lista, nella forma che sta arrivando — sia su `rejections` sia su `rejection`", () => {
    expect(normalizeConstraintReport({ rejections: [rifiuto] }).rejections).toEqual([rifiuto]);
    expect(normalizeConstraintReport({ rejection: [rifiuto] }).rejections).toEqual([rifiuto]);
  });

  it("nessun rifiuto, o nessun rapporto affatto, non producono niente", () => {
    expect(normalizeConstraintReport({ rejection: null }).rejections).toEqual([]);
    expect(normalizeConstraintReport(undefined).rejections).toEqual([]);
    expect(normalizeConstraintReport(null).warnings).toEqual([]);
  });

  it("i motivi del produttore e quelli locali si mostrano insieme, senza doppioni", () => {
    const locali = { rejections: [rifiuto], warnings: [] };
    const daFuori = normalizeConstraintReport({ rejection: rifiuto, warnings: [avvertimento] });
    const uniti = mergeConstraintIssues(locali, daFuori);
    expect(uniti.rejections).toHaveLength(1);
    expect(uniti.warnings).toEqual([avvertimento]);
  });

  it("un avvertimento arriva alla pagina e NON impedisce il salvataggio", () => {
    // È una scelta costosa, non un errore: la squadra è di Pico.
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      new Map([[CAMPIONATO.competitionId, { lockedStarterIds: ["p11"], locked: false }]]),
      new Map([[CAMPIONATO.competitionId, { rejection: null, warnings: [avvertimento] }]]),
    );
    expect(view.competitions[0]?.issues.warnings).toEqual([avvertimento]);
    expect(view.competitions[0]?.feasible).toBe(true);
  });

  it("un rifiuto del produttore invece ferma il salvataggio, con il suo codice", () => {
    const view = buildFormazioneView(
      letto([campionato({ kind: "letta", lineup: FORMAZIONE })]),
      new Map(),
      new Map([[CAMPIONATO.competitionId, { rejection: rifiuto }]]),
    );
    expect(view.competitions[0]?.feasible).toBe(false);
    expect(view.competitions[0]?.issues.rejections[0]?.code).toBe("LOCKED_MODULE_INCOMPATIBLE");
  });
});

describe("una spunta che non cambia niente sarebbe peggio di nessuna spunta", () => {
  it("un bloccato fuori dagli undici è dichiarato non rispettato", () => {
    const unmet = unmetConstraints(FORMAZIONE, { lockedStarterIds: ["p14"], locked: false });
    expect(unmet).toHaveLength(1);
    expect(unmet[0]).toContain("p14");
  });

  it("un modulo bloccato diverso da quello schierato è dichiarato non rispettato", () => {
    const unmet = unmetConstraints(FORMAZIONE, { lockedStarterIds: [], lockedModule: "352", locked: false });
    expect(unmet[0]).toContain("352");
  });

  it("i titolari e il portiere già in campo non producono niente", () => {
    expect(unmetConstraints(FORMAZIONE, { lockedStarterIds: ["p1", "p6"], locked: false })).toEqual([]);
  });
});

describe("il salvataggio passa dalla validazione, e senza validazione non passa", () => {
  const base = {
    matchday: 5,
    competitionId: CAMPIONATO.competitionId,
    lineup: FORMAZIONE,
    roster: ROSA,
    settings: SETTINGS_IN_ACCORDO,
    constraints: NO_LINEUP_CONSTRAINTS,
  };

  it("una formazione legale produce un invio dichiarato, con la versione della regola", () => {
    const preparation = prepareSubmission(base);
    expect(preparation.ok).toBe(true);
    if (!preparation.ok) return;
    expect(preparation.submission.matchday).toBe(5);
    expect(preparation.submission.competitionId).toBe(CAMPIONATO.competitionId);
    expect(preparation.submission.leagueRuleVersion.length).toBeGreaterThan(0);
  });

  it("un modulo fuori dall'elenco della lega ferma il salvataggio, con la ragione", () => {
    const preparation = prepareSubmission({
      ...base,
      settings: { ...SETTINGS_IN_ACCORDO, allowedModules: ["352"] },
    });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.submission).toBeNull();
    expect(preparation.blocking.map((violation) => violation.code)).toContain("modulo_non_ammesso");
  });

  it("ciò che la lega non ha dichiarato viaggia come avvertimento, e non blocca", () => {
    const { allowedModules: _ignorato, ...senzaModuli } = SETTINGS_IN_ACCORDO;
    const preparation = prepareSubmission({ ...base, settings: senzaModuli });
    expect(preparation.ok).toBe(true);
    if (!preparation.ok) return;
    expect(preparation.warnings.map((violation) => violation.code)).toContain(
      "modulo_non_verificabile",
    );
  });

  it("i vincoli non rispettati fermano il salvataggio prima ancora di costruire l'invio", () => {
    const preparation = prepareSubmission({
      ...base,
      constraints: { lockedStarterIds: ["p14"], locked: false },
    });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.reason).toContain("p14");
    expect(preparation.reason).toContain("non è stato mandato niente");
  });

  it("i vincoli impossibili fermano il salvataggio con TUTTI i motivi, non con un errore", () => {
    const preparation = prepareSubmission({
      ...base,
      constraints: {
        lockedStarterIds: ["p2", "p3", "p4", "p5", "p13", "p99"],
        lockedModule: "442",
        locked: false,
      },
    });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.reason).toContain("LOCKED_MODULE_INCOMPATIBLE");
    expect(preparation.reason).toContain("LOCKED_PLAYER_UNKNOWN");
  });

  it("un rifiuto del produttore ferma il salvataggio come uno locale", () => {
    const preparation = prepareSubmission({
      ...base,
      producerReport: {
        rejection: {
          code: "LOCKED_LINEUP_ILLEGAL",
          message: "motivo del produttore",
          playerIds: [],
        },
      },
    });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.reason).toContain("motivo del produttore");
  });

  it("una giornata non valida non fa esplodere niente: diventa un rifiuto dichiarato", () => {
    const preparation = prepareSubmission({ ...base, matchday: 0 });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.reason).toContain("giornata");
  });

  it("una formazione calcolata per l'altra competizione non si manda per sbaglio", () => {
    const preparation = prepareSubmission({ ...base, competitionId: COPPA.competitionId });
    expect(preparation.ok).toBe(false);
    if (preparation.ok) return;
    expect(preparation.reason).toContain(COPPA.competitionId);
  });
});

describe("i tre stati dell'invio non si confondono mai", () => {
  it("niente tentato è «da inviare», e lo dice", () => {
    expect(submissionUiState(null)).toEqual(NIENTE_DA_INVIARE);
    expect(NIENTE_DA_INVIARE.kind).toBe("da_inviare");
  });

  it("porta d'invio non collegata è «da inviare»: nulla è partito", () => {
    const stato = submissionUiState({ kind: "non_collegata", reason: "nessuna porta" });
    expect(stato.kind).toBe("da_inviare");
    expect(stato.reason).toContain("nessuna porta");
  });

  it("una rilettura identica è l'unico «inviato e confermato»", () => {
    const stato = submissionUiState({
      kind: "esito",
      outcome: outcomeFromReadBack(FORMAZIONE, FORMAZIONE),
    });
    expect(stato.kind).toBe("inviato_confermato");
  });

  it("una rilettura diversa è «esito ignoto», con le differenze in mano", () => {
    const riletta = { ...FORMAZIONE, module: "352" as const };
    const stato = submissionUiState({
      kind: "esito",
      outcome: outcomeFromReadBack(FORMAZIONE, riletta),
    });
    expect(stato.kind).toBe("inviato_esito_ignoto");
    if (stato.kind !== "inviato_esito_ignoto") return;
    expect(stato.differences.some((difference) => difference.field === "module")).toBe(true);
  });

  it("una risposta che non arriva è «esito ignoto», non «non inviato»", () => {
    // La bugia più costosa di questa pagina sarebbe qui: dire «non è partito»
    // di un invio che forse è già sulla piattaforma.
    const stato = submissionUiState({ kind: "interrotta", reason: "connessione caduta" });
    expect(stato.kind).toBe("inviato_esito_ignoto");
  });

  it("un rifiuto e un «non tentato» tornano entrambi a «da inviare», con cause diverse", () => {
    const rifiutato = submissionUiState({ kind: "esito", outcome: rejectedOutcome("deadline passata") });
    const nonTentato = submissionUiState({
      kind: "esito",
      outcome: notAttemptedOutcome("previsione mancante"),
    });
    expect(rifiutato.kind).toBe("da_inviare");
    expect(nonTentato.kind).toBe("da_inviare");
    expect(rifiutato.reason).toContain("respinto");
    expect(nonTentato.reason).toContain("mai partito");
  });
});
