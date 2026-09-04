// LA SUPERFICIE DELLA PAGINA FORMAZIONE — che cosa la schermata sa, che cosa
// dichiara di non sapere, e che cosa può salvare.
//
// PERCHÉ STA QUI E NON NELLA UI. La pagina Formazione ha tre decisioni che non
// hanno niente a che vedere con il DOM e tutto a che vedere con l'onestà di ciò
// che si mostra: quale schermata aprire all'avvio, quali vincoli salvati sono
// ancora applicabili, e che cosa significa davvero «salvato». Tenerle dentro
// una funzione di render le renderebbe verificabili solo con un browser, cioè
// quasi mai; qui sono funzioni pure e i test le interrogano una per una.
//
// NIENTE RETE, COME IN TUTTO IL PACCHETTO. Nessun host, nessun endpoint,
// nessuna credenziale, nessun nome di piattaforma: la lettura della lega e
// l'invio della formazione sono due PORTE — due tipi che il layer privato
// implementa — e questo file ne descrive solo la forma. Nei test e in sviluppo
// le porte sono alimentate da fixture sintetiche.
//
// LA ROSA E LA FORMAZIONE SONO DUE COSE DIVERSE, e la pagina iniziale dipende
// dalla prima, non dalla seconda. Vale la pena scriverlo per esteso perché la
// confusione fra le due è l'errore che rende inutile l'intera schermata:
//
//  - la ROSA è chi hai in squadra. È vuota prima dell'asta e a stagione finita,
//    quando la lega risponde «squadra vuota». In quel momento non c'è niente da
//    schierare e la pagina che serve è l'Asta;
//  - la FORMAZIONE è chi mandi in campo questa giornata. È assente ogni volta
//    che non hai ancora schierato — che è precisamente il momento in cui la
//    pagina Formazione serve di più. Trattare «formazione assente» come «niente
//    da fare» significherebbe nascondere la pagina proprio quando è utile.
//
// QUANDO NON SI SA, LO SI DICE — E BASTA. Se il canale non risponde, o risponde
// qualcosa che non si riesce a leggere, la pagina NON mostra una griglia vuota:
// una griglia vuota si legge come «non ho ancora schierato», che è una
// conclusione precisa e sbagliata. `buildFormazioneView` fa di questa regola una
// proprietà strutturale e non una raccomandazione: quando lo stato non è noto
// l'elenco delle competizioni è VUOTO, quindi non esiste nessuno stato
// rappresentabile in cui l'avviso e un pezzo di formazione stiano sullo stesso
// schermo. L'avviso prende il posto della squadra, non le sta accanto.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import { MODULES, moduleShape } from "../../league-gameweek/src/leagueGameweek.js";
import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type {
  ConstraintIssue,
  ConstraintRejectionCode,
  ConstraintWarningCode,
  LineupConstraints,
} from "../../league-gameweek/src/lineupProposer.js";
import type { ObservedCompetition } from "./calendar.js";
import type { ObservedLeagueSettings } from "./leagueSettings.js";
import type {
  LineupDifference,
  LineupSubmission,
  ObservedLineup,
  SubmitOutcome,
} from "./lineupSubmission.js";
import { toSubmission } from "./lineupSubmission.js";
import type { ObservedPlayer, ObservedTeam } from "./roster.js";
import { rolesByPlayerId } from "./roster.js";
import type { SubmissionViolation } from "./submissionLegality.js";
import { validateSubmissionAgainstSettings } from "./submissionLegality.js";

/**
 * I moduli, ri-esportati da qui.
 *
 * Non è una comodità: la UI dell'asta non deve nominare `league-gameweek` — la
 * guardia di isolamento di quel pacchetto lo vieta a chiunque stia fuori dalla
 * Fase 2 — e senza questa ri-esportazione la pagina Formazione dovrebbe
 * riscrivere a mano l'elenco dei sette moduli di §9, cioè tenere una seconda
 * dichiarazione che diverge in silenzio il giorno in cui la prima cambia.
 */
export type { Module };
export { MODULES };

/**
 * I VINCOLI DELLA FORMAZIONE — i tre comandi che Pico ha chiesto — e i tipi con
 * cui il produttore riferisce che cosa ne ha fatto.
 *
 * SI CONSUMANO DALLA LORO CASA, non se ne tiene una copia: la dichiarazione
 * canonica vive in `packages/league-gameweek/src/lineupProposer.ts`, accanto al
 * produttore che li rispetta o li rifiuta. Una seconda dichiarazione qui
 * sarebbe la solita che diverge in silenzio il giorno in cui la prima cambia —
 * e cambierebbe senza che nessun test se ne accorga, perché due tipi
 * strutturalmente identici sono assegnabili l'uno all'altro finché restano tali.
 */
export type { LineupConstraints, ConstraintIssue, ConstraintRejectionCode, ConstraintWarningCode };

/** Nessun vincolo: il caso di partenza, e quello a cui si torna. */
export const NO_LINEUP_CONSTRAINTS: LineupConstraints = {
  lockedStarterIds: [],
  locked: false,
};

/* ────────────────────────────────────────────────────────────────────────────
   LO STATO DEL CANALE — che cosa la lettura della lega ha prodotto
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Perché il canale non dice nulla di utile. I tre casi distinguibili sono
 * distinti; il quarto esiste perché **una diagnosi che non si ha non si
 * inventa**: quando la causa non è accertabile si dichiara che non lo è, con
 * una formula sola, invece di sceglierne una che suoni plausibile.
 */
export type ChannelUnknownCause =
  /** Nessuna porta collegata: questa build non ha il canale della lega. */
  | "porta_non_collegata"
  /** La porta c'è e non ha risposto. */
  | "risposta_assente"
  /** La porta ha risposto qualcosa che non si è potuto leggere. */
  | "risposta_illeggibile"
  /** Non si sa quale dei tre: si dichiara l'ignoranza, non se ne sceglie uno. */
  | "non_diagnosticabile";

export interface LineupChannelUnknown {
  readonly kind: "sconosciuto";
  readonly cause: ChannelUnknownCause;
  /** Il dettaglio che la porta ha fornito. Mai inventato, può essere vuoto. */
  readonly detail: string;
}

/** La formazione di una competizione: letta, oppure non disponibile e perché. */
export type CompetitionLineupState =
  | {
      readonly kind: "letta";
      /** `null` = la lega non ha (ancora) una formazione per questa partita. */
      readonly lineup: ObservedLineup | null;
    }
  | {
      readonly kind: "non_disponibile";
      /** Il motivo, dichiarato dalla lettura. Mai dedotto qui. */
      readonly reason: string;
    };

/** Una competizione e la sua formazione, con la giornata se è nota. */
export interface ObservedCompetitionLineup {
  readonly competition: ObservedCompetition;
  /** `null` quando la giornata non è stata osservata: non si suppone. */
  readonly matchday: number | null;
  readonly state: CompetitionLineupState;
}

export interface LineupChannelRead {
  readonly kind: "letto";
  readonly roster: ObservedTeam;
  readonly settings: ObservedLeagueSettings;
  readonly competitions: readonly ObservedCompetitionLineup[];
}

/** Ciò che la porta di lettura restituisce. */
export type LineupChannelState = LineupChannelRead | LineupChannelUnknown;

/** La porta di LETTURA. Il layer privato la implementa; qui c'è solo la forma. */
export interface LineupChannelPort {
  readState(): LineupChannelState;
}

/* ────────────────────────────────────────────────────────────────────────────
   LA SCHERMATA INIZIALE
   ──────────────────────────────────────────────────────────────────────────── */

/** Le due schermate che possono aprire il sito. */
export type InitialScreen = "formazione" | "asta";

/**
 * QUALE PAGINA APRE IL SITO, dato ciò che il canale della lega ha risposto.
 *
 * Quattro casi, e ognuno per una ragione sua:
 *
 *  1. rosa VUOTA — prima dell'asta, o a stagione finita: `asta`. Non c'è niente
 *     da schierare, e la pagina che serve è quella che si può usare;
 *  2. rosa PIENA — con o senza formazione: `formazione`. «Non ho ancora
 *     schierato» è il momento in cui quella pagina serve di più, non un motivo
 *     per non mostrarla (vedi la nota in testa al file);
 *  3. stato NON NOTO perché la porta non risponde o risponde qualcosa di
 *     illeggibile: `formazione`, con l'avviso al posto della squadra. È la
 *     scelta di Pico, ed è deliberatamente il contrario del ripiego comodo: un
 *     canale rotto dietro una schermata che funziona resta rotto per settimane;
 *  4. PORTA NON COLLEGATA: `asta`. Questo caso non è «non so»: è «qui il canale
 *     non c'è», ed è lo stato del solo core pubblico, che il layer privato non
 *     ha ancora completato. Aprire il sito su una pagina che può soltanto
 *     dichiarare la propria assenza non renderebbe visibile nessun problema —
 *     non ce n'è uno — mentre toglierebbe la schermata d'asta a chi la usa.
 *     Nel prodotto reale la porta c'è sempre: se poi tace o risponde storto si
 *     ricade nel caso 3, che è quello che Pico voleva vedere.
 */
export function decideInitialScreen(state: LineupChannelState): InitialScreen {
  if (state.kind === "sconosciuto") {
    return state.cause === "porta_non_collegata" ? "asta" : "formazione";
  }
  return state.roster.players.length === 0 ? "asta" : "formazione";
}

/* ────────────────────────────────────────────────────────────────────────────
   I VINCOLI SALVATI CHE NON VALGONO PIÙ — quarantena, non scarto silenzioso
   ──────────────────────────────────────────────────────────────────────────── */

/** Un vincolo salvato che non è più applicabile, e perché. */
export interface ConstraintQuarantine {
  readonly kind: "titolare_fuori_rosa" | "modulo_non_ammesso";
  /** L'id del giocatore, o il modulo: la cosa messa da parte. */
  readonly value: string;
  readonly reason: string;
}

export interface ReconciledConstraints {
  /** I vincoli che restano applicabili. */
  readonly applied: LineupConstraints;
  /** Quelli messi da parte, con la ragione. Mai scartati in silenzio. */
  readonly quarantined: readonly ConstraintQuarantine[];
}

/**
 * I VINCOLI SALVATI CONTRO LA ROSA DI OGGI.
 *
 * Un giocatore bloccato che non è più in rosa non è un dettaglio da ignorare:
 * è una preferenza che Pico ha espresso e che oggi non si può rispettare.
 * Scartarlo in silenzio produrrebbe una formazione diversa da quella che
 * credeva di aver bloccato, senza che nessuno glielo dica; applicarlo
 * produrrebbe un invio con un id fuori rosa. La terza strada è l'unica onesta:
 * si mette da parte e **lo si dice**.
 *
 * Il modulo si giudica solo contro un elenco OSSERVATO. Se la lega non ha
 * dichiarato quali moduli ammette, un modulo bloccato non è né valido né
 * invalido: qui non si pronuncia, e al salvataggio
 * `validateSubmissionAgainstSettings` dichiara di non aver potuto verificarlo.
 */
export function reconcileConstraints(
  constraints: LineupConstraints,
  roster: ObservedTeam,
  allowedModules?: readonly Module[],
): ReconciledConstraints {
  const rosterIds = new Set(roster.players.map((player) => player.id));
  const quarantined: ConstraintQuarantine[] = [];
  const kept: string[] = [];

  for (const id of constraints.lockedStarterIds) {
    if (kept.includes(id)) continue;
    if (!rosterIds.has(id)) {
      quarantined.push({
        kind: "titolare_fuori_rosa",
        value: id,
        reason:
          "il giocatore bloccato non è più in rosa: la spunta resta da parte e non viene applicata",
      });
      continue;
    }
    kept.push(id);
  }

  let lockedModule = constraints.lockedModule;
  if (
    lockedModule !== undefined &&
    allowedModules !== undefined &&
    !allowedModules.includes(lockedModule)
  ) {
    quarantined.push({
      kind: "modulo_non_ammesso",
      value: lockedModule,
      reason: `la lega non dichiara più «${lockedModule}» fra i moduli schierabili: il blocco resta da parte`,
    });
    lockedModule = undefined;
  }

  const applied: LineupConstraints =
    lockedModule === undefined
      ? { lockedStarterIds: kept, locked: constraints.locked }
      : { lockedStarterIds: kept, lockedModule, locked: constraints.locked };

  return { applied, quarantined };
}

/* ────────────────────────────────────────────────────────────────────────────
   I TRE COMANDI — spunta per giocatore, modulo bloccato, formazione blindata
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * La spunta «questo lo voglio in campo», accesa o spenta.
 *
 * L'ordine è quello in cui le spunte sono state messe, e si conserva: due
 * elenchi con gli stessi id in ordine diverso sono due preferenze diverse per
 * chiunque legga la panchina, e riordinarli qui sarebbe una decisione presa al
 * posto di chi ha premuto.
 */
export function toggleLockedStarter(
  constraints: LineupConstraints,
  playerId: string,
): LineupConstraints {
  const presente = constraints.lockedStarterIds.includes(playerId);
  const lockedStarterIds = presente
    ? constraints.lockedStarterIds.filter((id) => id !== playerId)
    : [...constraints.lockedStarterIds, playerId];
  return constraints.lockedModule === undefined
    ? { lockedStarterIds, locked: constraints.locked }
    : { lockedStarterIds, lockedModule: constraints.lockedModule, locked: constraints.locked };
}

/** Il modulo bloccato, o `null` per togliere il blocco. */
export function setLockedModule(
  constraints: LineupConstraints,
  module: Module | null,
): LineupConstraints {
  return module === null
    ? { lockedStarterIds: [...constraints.lockedStarterIds], locked: constraints.locked }
    : {
        lockedStarterIds: [...constraints.lockedStarterIds],
        lockedModule: module,
        locked: constraints.locked,
      };
}

/**
 * L'intera formazione non modificabile, acceso o spento.
 *
 * Blindare NON cancella le spunte né il modulo bloccato: sono tre comandi
 * distinti, e chi toglie la blindatura si ritrova quello che aveva scelto
 * invece di ricominciare da capo.
 */
export function toggleLocked(constraints: LineupConstraints): LineupConstraints {
  return constraints.lockedModule === undefined
    ? { lockedStarterIds: [...constraints.lockedStarterIds], locked: !constraints.locked }
    : {
        lockedStarterIds: [...constraints.lockedStarterIds],
        lockedModule: constraints.lockedModule,
        locked: !constraints.locked,
      };
}

/* ────────────────────────────────────────────────────────────────────────────
   QUANDO I VINCOLI RENDONO LA FORMAZIONE IMPOSSIBILE — TUTTI I MOTIVI INSIEME
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * I motivi, in blocco.
 *
 * PERCHÉ UNA LISTA E NON IL PRIMO. Se Pico spunta cinque giocatori e tre sono in
 * conflitto, un motivo per volta lo costringerebbe a correggere e riprovare
 * cinque volte, senza mai vedere quanto è grande il problema. Si raccolgono
 * tutti e si mostrano insieme; l'ordine è quello dei controlli, che è stabile.
 *
 * I RIFIUTI E GLI AVVERTIMENTI NON SI MESCOLANO. Un rifiuto ferma; un
 * avvertimento — «hai bloccato in campo uno che secondo le previsioni non gioca»
 * — è una scelta legittima e costosa, e la squadra è di Pico: si dice e non si
 * impedisce.
 */
export interface FormazioneConstraintIssues {
  readonly rejections: readonly ConstraintIssue<ConstraintRejectionCode>[];
  readonly warnings: readonly ConstraintIssue<ConstraintWarningCode>[];
}

export const NESSUN_PROBLEMA_DI_VINCOLI: FormazioneConstraintIssues = {
  rejections: [],
  warnings: [],
};

function reparto(role: Role, shape: ReturnType<typeof moduleShape>): number {
  if (role === "P") return 1;
  if (role === "D") return shape.defenders;
  if (role === "C") return shape.midfielders;
  return shape.strikers;
}

/** Il massimo che QUALUNQUE modulo candidato concede a quel reparto. */
function postiMassimi(role: Role, candidati: readonly Module[]): number {
  return candidati.reduce((max, module) => Math.max(max, reparto(role, moduleShape(module))), 0);
}

/**
 * I PROBLEMI DEI VINCOLI CHE IL CORE PUBBLICO PUÒ PROVARE DA SOLO.
 *
 * Il produttore di formazioni vive in `lineupProposer` e decide su previsioni
 * che qui non esistono: quando è collegato, i suoi motivi valgono e si mostrano
 * testuali (`normalizeConstraintReport`). Questa funzione copre ciò che si vede
 * senza previsioni — cinque difensori bloccati non entrano in un 4-4-2 nemmeno
 * con la migliore previsione del mondo — e usa gli STESSI codici, così i due
 * elenchi si leggono come uno solo invece che come due vocabolari diversi.
 *
 * Ciò che questa funzione NON produce mai è `LOCKED_PLAYER_NEVER_PLAYS`: è un
 * avvertimento sulle previsioni, e le previsioni sono fuori dal core pubblico.
 * Arriva dal produttore o non arriva; qui non lo si simula.
 *
 * Un ruolo non osservato non fa scattare nessun rifiuto sul suo reparto: non si
 * conta un giocatore in un reparto che nessuno ha letto.
 */
export function localConstraintIssues(
  constraints: LineupConstraints,
  lineup: ObservedLineup | null,
  roles: ReadonlyMap<string, Role>,
  allowedModules?: readonly Module[],
): FormazioneConstraintIssues {
  const rejections: ConstraintIssue<ConstraintRejectionCode>[] = [];
  const ids = constraints.lockedStarterIds;

  const ripetuti = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (ripetuti.length > 0) {
    rejections.push({
      code: "LOCKED_PLAYER_DUPLICATED",
      message: `lo stesso giocatore è spuntato più di una volta: ${[...new Set(ripetuti)].join(", ")}`,
      playerIds: [...new Set(ripetuti)],
    });
  }

  const sconosciuti = [...new Set(ids.filter((id) => !roles.has(id)))];
  if (sconosciuti.length > 0) {
    rejections.push({
      code: "LOCKED_PLAYER_UNKNOWN",
      message: `spuntati giocatori che non risultano in rosa: ${sconosciuti.join(", ")}`,
      playerIds: sconosciuti,
    });
  }

  if (ids.length > 11) {
    rejections.push({
      code: "LOCKED_TOO_MANY",
      message: `gli undici sono undici: ne hai spuntati ${ids.length}`,
      playerIds: [...ids],
    });
  }

  const candidati = constraints.lockedModule !== undefined
    ? [constraints.lockedModule]
    : allowedModules !== undefined && allowedModules.length > 0
      ? allowedModules
      : MODULES;

  if (
    constraints.lockedModule !== undefined &&
    allowedModules !== undefined &&
    !allowedModules.includes(constraints.lockedModule)
  ) {
    rejections.push({
      code: "LOCKED_MODULE_NOT_ALLOWED",
      message: `il modulo bloccato «${constraints.lockedModule}» non è fra quelli che la lega dichiara schierabili`,
      playerIds: [],
    });
  }

  const conteggio: Record<Role, string[]> = { P: [], D: [], C: [], A: [] };
  for (const id of ids) {
    const role = roles.get(id);
    if (role !== undefined) conteggio[role].push(id);
  }
  for (const role of ["P", "D", "C", "A"] as const) {
    const quanti = conteggio[role].length;
    if (quanti === 0) continue;
    const massimoAssoluto = postiMassimi(role, MODULES);
    if (quanti > massimoAssoluto) {
      rejections.push({
        code: "LOCKED_ROLE_OVERFLOW",
        message: `nel reparto ${role} nessun modulo di §9 arriva a ${quanti} posti: al massimo ${massimoAssoluto}`,
        playerIds: conteggio[role],
      });
      continue;
    }
    if (quanti > postiMassimi(role, candidati)) {
      rejections.push({
        code: "LOCKED_MODULE_INCOMPATIBLE",
        message:
          `nessuno dei moduli praticabili (${candidati.join(", ")}) regge ${quanti} giocatori ` +
          `spuntati nel reparto ${role}`,
        playerIds: conteggio[role],
      });
    }
  }

  // `locked: true` TIENE LA FORMAZIONE CHE HA IN MANO, e senza quella non c'è
  // niente da tenere: è lo stesso rifiuto che il produttore restituirebbe, con
  // lo stesso codice, perché la condizione è la stessa e si vede da qui.
  if (constraints.locked && lineup === null) {
    rejections.push({
      code: "LOCKED_LINEUP_MISSING",
      message:
        "la formazione è blindata ma non ce n'è nessuna letta dalla lega da tenere: non c'è niente da blindare",
      playerIds: [],
    });
  }
  if (constraints.locked && lineup !== null) {
    const unmet = unmetConstraints(lineup, constraints);
    if (unmet.length > 0) {
      rejections.push({
        code: "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS",
        message: `la formazione blindata contraddice gli altri vincoli: ${unmet.join("; ")}`,
        playerIds: constraints.lockedStarterIds.filter(
          (id) => ![lineup.goalkeeperId, ...lineup.starterIds].includes(id),
        ),
      });
    }
  }

  return { rejections, warnings: [] };
}

/**
 * IL RAPPORTO DEL PRODUTTORE, LETTO IN ENTRAMBE LE FORME.
 *
 * `ConstraintReport` sta cambiando forma proprio adesso: nasceva con UN motivo
 * di rifiuto (`rejection`) e sta diventando una LISTA, perché un motivo per
 * volta costringe a correggere e riprovare. Questa funzione legge tutte e due —
 * `rejection` singolo, `rejection` già lista, `rejections` lista — e restituisce
 * sempre una lista.
 *
 * Non è tolleranza per il disordine: è che la schermata non deve fermarsi ad
 * aspettare un cambio in un altro pacchetto, e il giorno in cui la forma vecchia
 * sparisce questa funzione continua a fare la cosa giusta senza che nessuno la
 * tocchi. Se un giorno restasse solo la lista, il ramo singolo diventa codice
 * morto e si toglie in una riga.
 */
export interface ConstraintReportLike {
  readonly rejection?:
    | ConstraintIssue<ConstraintRejectionCode>
    | readonly ConstraintIssue<ConstraintRejectionCode>[]
    | null;
  readonly rejections?: readonly ConstraintIssue<ConstraintRejectionCode>[] | null;
  readonly warnings?: readonly ConstraintIssue<ConstraintWarningCode>[] | null;
}

export function normalizeConstraintReport(
  report: ConstraintReportLike | null | undefined,
): FormazioneConstraintIssues {
  if (report === null || report === undefined) return NESSUN_PROBLEMA_DI_VINCOLI;
  const rejections: ConstraintIssue<ConstraintRejectionCode>[] = [];
  if (Array.isArray(report.rejections)) rejections.push(...report.rejections);
  const singolo = report.rejection;
  if (Array.isArray(singolo)) {
    rejections.push(...(singolo as readonly ConstraintIssue<ConstraintRejectionCode>[]));
  } else if (singolo !== null && singolo !== undefined) {
    rejections.push(singolo as ConstraintIssue<ConstraintRejectionCode>);
  }
  return { rejections, warnings: report.warnings ?? [] };
}

/**
 * La porta del PRODUTTORE di formazioni: dichiarata, e nel core pubblico non
 * collegata. Serve a una cosa sola — far arrivare alla pagina i motivi che il
 * produttore restituisce, testuali, invece di riscriverli qui.
 */
export interface LineupProducerPort {
  /**
   * `currentLineup` è la formazione che la lega riporta adesso: con
   * `locked: true` è quella che il produttore deve tenere, e senza di lei
   * rifiuta con `LOCKED_LINEUP_MISSING`.
   */
  report(input: {
    readonly competitionId: string;
    readonly constraints: LineupConstraints;
    readonly currentLineup: ObservedLineup | null;
  }): ConstraintReportLike;
}

/** I due elenchi, uniti senza ripetere lo stesso codice sullo stesso giocatore. */
export function mergeConstraintIssues(
  ...gruppi: readonly FormazioneConstraintIssues[]
): FormazioneConstraintIssues {
  const rejections: ConstraintIssue<ConstraintRejectionCode>[] = [];
  const warnings: ConstraintIssue<ConstraintWarningCode>[] = [];
  const visti = new Set<string>();
  for (const gruppo of gruppi) {
    for (const issue of gruppo.rejections) {
      const chiave = `${issue.code}|${[...issue.playerIds].sort().join(",")}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      rejections.push(issue);
    }
    for (const issue of gruppo.warnings) {
      const chiave = `w|${issue.code}|${[...issue.playerIds].sort().join(",")}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      warnings.push(issue);
    }
  }
  return { rejections, warnings };
}

/**
 * I VINCOLI CHE LA FORMAZIONE IN MANO NON RISPETTA.
 *
 * Serve perché altrimenti una spunta sarebbe decorazione. Il core pubblico non
 * ha il produttore di formazioni — vive nel contratto di giornata e lavora su
 * previsioni che qui non esistono — quindi da questa pagina non si può
 * RICALCOLARE una formazione che rispetti i vincoli: si può solo dire se quella
 * che si sta per mandare li rispetta. La differenza è tutta:
 *
 *  - dirlo, e rifiutare l'invio, significa «la tua spunta conta»;
 *  - tacere e mandare la formazione com'era significa che la spunta non ha
 *    fatto niente e nessuno lo sa. È il modo più veloce per rendere questa
 *    pagina peggio che inutile.
 */
export function unmetConstraints(
  lineup: ObservedLineup,
  constraints: LineupConstraints,
): readonly string[] {
  const inCampo = new Set([lineup.goalkeeperId, ...lineup.starterIds]);
  const unmet: string[] = [];
  for (const id of constraints.lockedStarterIds) {
    if (!inCampo.has(id)) {
      unmet.push(
        `«${id}» è spuntato come «lo voglio in campo» ma non è fra i titolari di questa formazione`,
      );
    }
  }
  if (constraints.lockedModule !== undefined && constraints.lockedModule !== lineup.module) {
    unmet.push(
      `il modulo bloccato è «${constraints.lockedModule}» e questa formazione è schierata con «${lineup.module}»`,
    );
  }
  return unmet;
}

/* ────────────────────────────────────────────────────────────────────────────
   IL MODELLO DELLA PAGINA — costruito qui, dipinto altrove
   ──────────────────────────────────────────────────────────────────────────── */

/** Una riga della rosa come la pagina la mostra. */
export interface FormazionePlayerRow {
  readonly id: string;
  readonly role: Role;
  /** È fra i titolari della formazione mostrata. */
  readonly starter: boolean;
  /** Porta la spunta «questo lo voglio in campo». */
  readonly locked: boolean;
  /** Disponibilità dichiarata dalla lega, se osservata. */
  readonly availability?: ObservedPlayer["availability"];
}

/** Una delle due formazioni: campionato o coppa. */
export interface FormazioneCompetitionView {
  readonly competitionId: string;
  readonly label: string;
  readonly matchday: number | null;
  /** Vuoto quando la formazione è leggibile; altrimenti il motivo dichiarato. */
  readonly unavailableReason: string;
  /** `null` quando non è disponibile, o quando la lega non ne ha una. */
  readonly lineup: ObservedLineup | null;
  /** `false` quando l'intera formazione è bloccata o non è disponibile. */
  readonly editable: boolean;
  readonly players: readonly FormazionePlayerRow[];
  readonly constraints: LineupConstraints;
  readonly quarantined: readonly ConstraintQuarantine[];
  /**
   * TUTTI i motivi insieme — quelli che si vedono da qui e quelli che il
   * produttore ha restituito — e gli avvertimenti, che non fermano niente.
   */
  readonly issues: FormazioneConstraintIssues;
  /** `false` quando c'è almeno un rifiuto: il salvataggio non si offre. */
  readonly feasible: boolean;
  /** I vincoli che la formazione mostrata NON rispetta. Vuoto è la norma. */
  readonly unmet: readonly string[];
}

/** L'avviso che prende il posto della squadra quando lo stato non è noto. */
export interface FormazioneUnknownNotice {
  readonly cause: ChannelUnknownCause;
  readonly title: string;
  readonly detail: string;
}

export interface FormazioneView {
  /** `true` solo quando la lega è stata letta davvero. */
  readonly known: boolean;
  /** Valorizzato se e solo se `known` è `false`. */
  readonly notice: FormazioneUnknownNotice | null;
  /** VUOTO se e solo se `known` è `false`: l'avviso non convive con la squadra. */
  readonly competitions: readonly FormazioneCompetitionView[];
}

/**
 * Come si chiama una competizione a schermo.
 *
 * `name` è OPZIONALE nel contratto — `undefined` significa «non osservato» — e
 * qui non si inventa un nome: si ripiega sul `kind`, che è osservato, e quando
 * nemmeno quello dice qualcosa lo si dichiara. Scrivere «Campionato» sopra una
 * competizione di cui la lettura non ha detto niente sarebbe una etichetta
 * inventata su un dato mancante, cioè esattamente ciò che questa pagina non fa.
 */
function competitionLabel(competition: ObservedCompetition): string {
  if (competition.name !== undefined && competition.name.length > 0) return competition.name;
  if (competition.kind === "campionato") return "Campionato";
  if (competition.kind === "coppa") return "Coppa";
  return "Competizione senza nome dichiarato";
}

const AVVISI: Readonly<Record<ChannelUnknownCause, string>> = {
  porta_non_collegata:
    "Il canale della lega non è collegato in questa versione del sito: la tua squadra non è stata letta, e quello che vedi qui sotto non è una formazione vuota — è l'assenza di una lettura.",
  risposta_assente:
    "La lega non ha risposto: la tua squadra e la tua formazione non sono state lette. Questa pagina non mostra una formazione perché non ne conosce nessuna, non perché tu non abbia schierato.",
  risposta_illeggibile:
    "La lega ha risposto qualcosa che non si è riusciti a leggere: la tua squadra e la tua formazione restano ignote. Nessuna formazione viene mostrata, perché mostrarne una vuota direbbe una cosa falsa.",
  non_diagnosticabile:
    "Non si riesce a sapere come sta la tua squadra in questo momento, e non si riesce nemmeno a dire perché. Nessuna formazione viene mostrata: quello che c'è da sapere è che non si sa.",
};

const TITOLI: Readonly<Record<ChannelUnknownCause, string>> = {
  porta_non_collegata: "CANALE DELLA LEGA NON COLLEGATO",
  risposta_assente: "LA LEGA NON HA RISPOSTO",
  risposta_illeggibile: "RISPOSTA DELLA LEGA NON LEGGIBILE",
  non_diagnosticabile: "STATO DELLA SQUADRA IGNOTO",
};

/**
 * Il modello della pagina, dato ciò che il canale ha risposto e i vincoli
 * salvati per ogni competizione.
 *
 * INVARIANTE, e i test lo sorvegliano: `known === false` implica
 * `competitions.length === 0`. Non c'è modo di rappresentare uno schermo con
 * l'avviso e mezza formazione insieme.
 */
export function buildFormazioneView(
  state: LineupChannelState,
  constraintsByCompetition: ReadonlyMap<string, LineupConstraints>,
  /**
   * Ciò che il produttore ha risposto, per competizione, quando è collegato.
   * Assente nel core pubblico: la pagina mostra allora i soli motivi che si
   * vedono da qui, che sono un sottoinsieme, mai un'invenzione.
   */
  producerReports?: ReadonlyMap<string, ConstraintReportLike>,
): FormazioneView {
  if (state.kind === "sconosciuto") {
    const detail = state.detail.length === 0 ? AVVISI[state.cause] : `${AVVISI[state.cause]} (${state.detail})`;
    return {
      known: false,
      notice: { cause: state.cause, title: TITOLI[state.cause], detail },
      competitions: [],
    };
  }

  const roles = rolesByPlayerId(state.roster);
  const competitions = state.competitions.map((observed) => {
    const saved = constraintsByCompetition.get(observed.competition.competitionId) ?? NO_LINEUP_CONSTRAINTS;
    const reconciled = reconcileConstraints(saved, state.roster, state.settings.allowedModules);
    const lineup = observed.state.kind === "letta" ? observed.state.lineup : null;
    const unavailableReason = observed.state.kind === "non_disponibile" ? observed.state.reason : "";
    const starters = new Set(lineup === null ? [] : [lineup.goalkeeperId, ...lineup.starterIds]);
    const locked = new Set(reconciled.applied.lockedStarterIds);

    const issues = mergeConstraintIssues(
      localConstraintIssues(reconciled.applied, lineup, roles, state.settings.allowedModules),
      normalizeConstraintReport(producerReports?.get(observed.competition.competitionId)),
    );

    return {
      competitionId: observed.competition.competitionId,
      label: competitionLabel(observed.competition),
      matchday: observed.matchday,
      unavailableReason,
      lineup,
      editable: unavailableReason.length === 0 && !reconciled.applied.locked,
      players: state.roster.players.map((player) => ({
        id: player.id,
        role: player.role,
        starter: starters.has(player.id),
        locked: locked.has(player.id),
        ...(player.availability === undefined ? {} : { availability: player.availability }),
      })),
      constraints: reconciled.applied,
      quarantined: reconciled.quarantined,
      issues,
      feasible: issues.rejections.length === 0,
      unmet: lineup === null ? [] : unmetConstraints(lineup, reconciled.applied),
    } satisfies FormazioneCompetitionView;
  });

  return { known: true, notice: null, competitions };
}

/* ────────────────────────────────────────────────────────────────────────────
   IL SALVATAGGIO — validato prima, e mai dichiarato riuscito senza prova
   ──────────────────────────────────────────────────────────────────────────── */

export type SubmissionPreparation =
  | {
      readonly ok: true;
      readonly submission: LineupSubmission;
      /** Ciò che non si è potuto verificare. Non blocca, ma si mostra. */
      readonly warnings: readonly SubmissionViolation[];
    }
  | {
      readonly ok: false;
      readonly submission: null;
      readonly blocking: readonly SubmissionViolation[];
      readonly warnings: readonly SubmissionViolation[];
      readonly reason: string;
    };

export interface SubmissionPreparationInput {
  readonly matchday: number;
  readonly competitionId: string;
  readonly lineup: ObservedLineup;
  readonly roster: ObservedTeam;
  readonly settings: ObservedLeagueSettings;
  readonly constraints: LineupConstraints;
  /** Ciò che il produttore ha risposto, se collegato. I suoi rifiuti fermano. */
  readonly producerReport?: ConstraintReportLike;
}

/** Un rifiuto dei vincoli scritto per chi legge, non per chi ha scritto il codice. */
export interface ConstraintRefusalSummary {
  readonly reason: string;
  readonly issues: FormazioneConstraintIssues;
}

/** Tutti i motivi in una riga sola, nell'ordine in cui sono stati raccolti. */
function refusalReason(issues: FormazioneConstraintIssues): string {
  return (
    `i vincoli non si possono rispettare per ${issues.rejections.length} motivi: ` +
    issues.rejections.map((issue) => `${issue.code} — ${issue.message}`).join("; ")
  );
}

/**
 * DA «SALVA» A UN INVIO VALIDATO, o a un rifiuto con il motivo.
 *
 * Tre filtri in fila, e nessuno di loro è saltabile:
 *
 *  1. i vincoli devono essere compatibili col modulo che si sta per mandare —
 *     se non lo sono, non si costruisce nemmeno l'invio;
 *  2. l'invio deve essere costruibile: giornata intera e positiva, competizione
 *     coerente fra invio e formazione (`toSubmission` rifiuta il resto);
 *  3. l'invio deve passare `validateSubmissionAgainstSettings` contro ciò che
 *     la lega ha dichiarato di sé, con la rosa e i ruoli osservati.
 *
 * Ciò che è `bloccante` ferma il salvataggio; ciò che è `avvertimento` — un
 * vincolo che la lega non ha dichiarato e che quindi nessuno ha potuto
 * verificare — viaggia con l'invio e si mostra, perché chi manda deve sapere
 * che cosa non è stato controllato.
 */
export function prepareSubmission(input: SubmissionPreparationInput): SubmissionPreparation {
  const issues = mergeConstraintIssues(
    localConstraintIssues(
      input.constraints,
      input.lineup,
      rolesByPlayerId(input.roster),
      input.settings.allowedModules,
    ),
    normalizeConstraintReport(input.producerReport),
  );
  if (issues.rejections.length > 0) {
    // TUTTI i motivi, non il primo: correggerne uno per volta significherebbe
    // riprovare tante volte quanti sono i conflitti.
    return { ok: false, submission: null, blocking: [], warnings: [], reason: refusalReason(issues) };
  }

  const unmet = unmetConstraints(input.lineup, input.constraints);
  if (unmet.length > 0) {
    return {
      ok: false,
      submission: null,
      blocking: [],
      warnings: [],
      reason:
        `la formazione che stai per mandare non rispetta i vincoli che hai messo (${unmet.join("; ")}): ` +
        "non è stato mandato niente",
    };
  }

  let submission: LineupSubmission;
  try {
    submission = toSubmission(input.matchday, input.competitionId, input.lineup);
  } catch (error) {
    return {
      ok: false,
      submission: null,
      blocking: [],
      warnings: [],
      reason: error instanceof Error ? error.message : "invio non costruibile",
    };
  }

  const violations = validateSubmissionAgainstSettings(submission, input.settings, {
    rosterIds: input.roster.players.map((player) => player.id),
    roles: rolesByPlayerId(input.roster),
  });
  const blocking = violations.filter((violation) => violation.severity === "bloccante");
  const warnings = violations.filter((violation) => violation.severity === "avvertimento");

  if (blocking.length > 0) {
    return {
      ok: false,
      submission: null,
      blocking,
      warnings,
      reason: `l'invio non è legale in ${blocking.length} punti: non è stato mandato niente`,
    };
  }
  return { ok: true, submission, warnings };
}

/**
 * CIÒ CHE È SUCCESSO ALL'INVIO, come la porta lo riferisce.
 *
 * `interrotta` non è un doppione di `esito`: è il caso in cui l'invio è partito
 * e la risposta non è arrivata. Non sappiamo se la piattaforma lo abbia preso,
 * e questa è precisamente l'informazione da conservare.
 */
export type SubmitAttempt =
  | { readonly kind: "non_collegata"; readonly reason: string }
  | { readonly kind: "interrotta"; readonly reason: string }
  | { readonly kind: "esito"; readonly outcome: SubmitOutcome };

/** La porta di INVIO. Anche questa è solo una forma: qui non parte niente. */
export interface LineupSubmitPort {
  submit(submission: LineupSubmission): SubmitAttempt;
}

/**
 * I TRE STATI CHE LA PAGINA MOSTRA, e che non vanno mai confusi.
 *
 * `da_inviare` — nulla è sulla piattaforma. Ci finiscono anche il rifiuto e il
 * «non tentato»: «ci hanno detto di no» e «non abbiamo provato» hanno cause
 * diverse (la ragione le distingue) ma la stessa conseguenza, cioè che Pico NON
 * è schierato. Un bottone che dicesse «salvato» qui è il difetto peggiore che
 * questa pagina possa avere.
 *
 * `inviato_confermato` — la rilettura coincide posizione per posizione. È
 * l'unico stato in cui si può dire di essere schierati, e richiede una prova.
 *
 * `inviato_esito_ignoto` — qualcosa è partito e non sappiamo che cosa ci sia
 * adesso sulla piattaforma: la risposta non è arrivata, oppure la rilettura è
 * diversa da ciò che si voleva. Le differenze, quando ci sono, viaggiano con lo
 * stato: nessuna viene «accettata» in silenzio.
 */
export type SubmissionUiState =
  | { readonly kind: "da_inviare"; readonly reason: string }
  | { readonly kind: "inviato_confermato"; readonly reason: string }
  | {
      readonly kind: "inviato_esito_ignoto";
      readonly reason: string;
      readonly differences: readonly LineupDifference[];
    };

/** Lo stato di partenza: niente è stato tentato. */
export const NIENTE_DA_INVIARE: SubmissionUiState = {
  kind: "da_inviare",
  reason: "nessun invio tentato: la formazione che vedi non è stata mandata da qui",
};

export function submissionUiState(attempt: SubmitAttempt | null): SubmissionUiState {
  if (attempt === null) return NIENTE_DA_INVIARE;
  if (attempt.kind === "non_collegata") {
    return {
      kind: "da_inviare",
      reason: `nulla è partito: ${attempt.reason}`,
    };
  }
  if (attempt.kind === "interrotta") {
    return {
      kind: "inviato_esito_ignoto",
      reason: `l'invio è partito e la risposta non è arrivata: ${attempt.reason}`,
      differences: [],
    };
  }
  const outcome = attempt.outcome;
  if (outcome.status === "confermato") {
    return { kind: "inviato_confermato", reason: outcome.reason };
  }
  if (outcome.status === "divergente") {
    return {
      kind: "inviato_esito_ignoto",
      reason: `l'invio è passato ma la rilettura non coincide: ${outcome.reason}`,
      differences: outcome.differences,
    };
  }
  return {
    kind: "da_inviare",
    reason:
      outcome.status === "rifiutato"
        ? `la piattaforma ha respinto l'invio: ${outcome.reason}`
        : `l'invio non è mai partito: ${outcome.reason}`,
  };
}
