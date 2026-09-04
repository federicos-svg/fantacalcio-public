// IMPOSTAZIONI DI LEGA OSSERVATE — la forma canonica di ciò che una lega reale
// dichiara di sé, scritta senza sapere da dove la si è letta. Passo 5 della
// Fase 2 (Lineup Coach).
//
// PERCHÉ ESISTE, E PERCHÉ È VUOTO DI I/O. Fra la piattaforma su cui la lega
// vive e `packages/league-gameweek`, che calcola il punteggio, manca un pezzo:
// la dichiarazione di che cosa la piattaforma dice. Quel pezzo ha due metà, e
// solo una può stare qui. La metà che *legge* — host, endpoint, header,
// credenziali, identificatori di lega e di squadra, e il parser che ne
// traduce le risposte — è privata per `docs/PUBLIC_PRIVATE_BOUNDARY.md`
// §"Host e metodo di accesso non si nominano nel pubblico". La metà che
// *dichiara* — i tipi, i validatori, il confronto col regolamento — è questa,
// ed è pubblica proprio perché non rivela nulla di come si legge: chi legge
// questo file non impara a leggere quella lega.
//
// Conseguenza pratica, e non è una formalità: in questo pacchetto non c'è una
// sola stringa di rete, nessun nome di campo di una fonte, nessun `fetch`,
// nessuna `Date` e nessun `Math.random`. Le funzioni sono pure e i loro esiti
// riproducibili bit a bit.
//
// LA REGOLA DEL FILE: `undefined` significa «NON OSSERVATO», mai un default.
// Ogni campo è opzionale, e l'assenza è un'informazione a sé — la piattaforma
// non conferma e non smentisce — che `reconcileWithLeagueRules` registra in
// `notObserved` invece di riempirla col valore del regolamento. Un default
// silenzioso qui varrebbe una formazione intera: una lega che avesse davvero
// cambiato il tetto delle sostituzioni sarebbe indistinguibile da una lega che
// quel campo non lo espone.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import type { FANTAVOTO_TARIFF } from "../../appeal-index/src/fantavoto.js";

/**
 * Gli eventi della tariffa di §12, presi dall'unica dichiarazione che il core
 * pubblico possiede — `FANTAVOTO_TARIFF` — invece che riscritti a mano: un
 * evento aggiunto là entra qui senza che nessuno se ne ricordi.
 */
export type BonusMalusEvent = keyof typeof FANTAVOTO_TARIFF;

/**
 * Una fascia osservata del modificatore difesa (§19): media minima inclusa e
 * bonus. Il regolamento la dichiara come intervallo, non come punto tabulato.
 */
export interface ObservedDefenceBand {
  readonly minAverage: number;
  readonly bonus: number;
}

/**
 * Una riga osservata della tabella del modificatore attacco (§21): voto base
 * tabulato e bonus. Il regolamento tabula punti discreti e vieta di
 * interpolare, quindi è una tabella, non una fascia.
 */
export interface ObservedAttackBonusRow {
  readonly vote: number;
  readonly bonus: number;
}

/**
 * Una riga osservata della scala del modificatore centrocampo (§20):
 * differenza fra le somme dei voti base e delta assegnato a chi ha di più.
 */
export interface ObservedMidfieldRow {
  readonly difference: number;
  readonly delta: number;
}

/**
 * Dove la lega applica il modificatore modulo. Il regolamento canonico dice
 * `OPPONENT` (§9): il modulo scelto assegna punti ALL'AVVERSARIO. Una lega che
 * dichiarasse `self` starebbe calcolando un'altra partita.
 */
export type ObservedModuleModifierTarget = "avversario" | "noi_stessi";

/**
 * REGOLE DI PUNTEGGIO E DI CLASSIFICA OSSERVATE.
 *
 * Ogni campo è opzionale **per costruzione**, non per comodità: chi compila
 * questa struttura riempie soltanto ciò che ha letto davvero. I nomi sono
 * quelli del regolamento canonico (`docs/data/LEAGUE_RULES.md`), non quelli
 * della fonte: la traduzione dai nomi della fonte a questi vive nel privato, ed
 * è esattamente il pezzo che non deve comparire qui.
 */
export interface ObservedScoringSettings {
  // §9 — moduli e modificatore modulo.
  /** I moduli che la lega dichiara schierabili. */
  readonly allowedModules?: readonly Module[];
  /**
   * Punti che ogni modulo assegna, modulo per modulo. È una mappa **parziale**:
   * un modulo assente non è «zero», è «non osservato», e il confronto lo tratta
   * come tale.
   */
  readonly moduleModifier?: Readonly<Partial<Record<Module, number>>>;
  readonly moduleModifierTarget?: ObservedModuleModifierTarget;

  // §10 — panchina e sostituzioni.
  readonly maxSubstitutions?: number;
  readonly sameRoleOnly?: boolean;
  readonly moduleChangeViaSubstitution?: boolean;
  /** Riserva d'ufficio: il regolamento la vieta. */
  readonly officeReserveAllowed?: boolean;

  // §12 — tariffa bonus/malus, e §12-bis la platea del gol subito.
  /**
   * Punti per evento, evento per evento. Le chiavi sono quelle della tariffa
   * del core pubblico (`FANTAVOTO_TARIFF`): mappa **parziale**, un evento
   * assente è «non osservato» e non zero.
   */
  readonly bonusMalusTariff?: Readonly<Partial<Record<BonusMalusEvent, number>>>;
  /** Punti per gol subito (§12-bis: -1). */
  readonly goalConcededMalusPerGoal?: number;
  /**
   * A CHI si applica il malus del gol subito. §12-bis lo chiude sul solo
   * portiere, scartando esplicitamente «a tutta la difesa»: è una platea, non
   * un dettaglio, e cambia ogni punteggio di giornata.
   */
  readonly goalConcededMalusRoles?: readonly string[];

  // §13 — senza voto.
  readonly noVoteBonusMalusBase?: number;
  readonly noVoteBookedPreset?: number;
  readonly noVoteSentOffDuringMatch?: number;

  // §14 — fattore campo.
  readonly homeFieldBonus?: number;
  readonly neutralGroundFromMatchday?: number;

  // §15 — conversione punteggio -> goal.
  readonly firstGoalThreshold?: number;
  readonly goalBandWidth?: number;
  readonly sameBandExtraGoalMinGap?: number;
  readonly bothBelowThresholdGoalMinGap?: number;

  // §16 — formazione non comunicata e deadline.
  /** Minuti fra la chiusura della formazione e il calcio d'inizio. */
  readonly lineupDeadlineMinutesBeforeKickoff?: number;
  readonly missingLineupFallsBackToPrevious?: boolean;

  // §19 — modificatore difesa.
  readonly defenceMinDefendersWithVote?: number;
  /** Fasce osservate, nell'ordine in cui la fonte le dichiara. */
  readonly defenceBands?: readonly ObservedDefenceBand[];

  // §20 — modificatore centrocampo.
  readonly midfieldFictitiousVote?: number;
  readonly midfieldMaxDelta?: number;
  /**
   * La scala delle differenze, riga per riga. Il tetto (`>= 7.0 -> 3.5`) è una
   * riga come le altre; il fondo (`< 2.0 -> 0`) non lo è e non compare.
   */
  readonly midfieldTable?: readonly ObservedMidfieldRow[];

  // §21 — modificatore attacco.
  readonly attackSufficientVote?: number;
  readonly attackMaxBonus?: number;
  readonly attackMaxFromVote?: number;
  /** `true` se un qualunque bonus esclude l'attaccante, come vuole §21. */
  readonly attackExcludesAnyBonus?: boolean;
  /** La tabella voto -> bonus, riga per riga, tetto compreso. */
  readonly attackTable?: readonly ObservedAttackBonusRow[];

  // §22 — punti di classifica.
  readonly pointsWin?: number;
  readonly pointsDraw?: number;
  readonly pointsLoss?: number;
}

/**
 * REGOLE DICHIARATE PER UNA SINGOLA COMPETIZIONE.
 *
 * La lega ha **due manifestazioni** — campionato (§22) e Coppa di Lega (§23) —
 * e non sono la stessa cosa: le regole di *punteggio* sono le stesse per
 * entrambe, ma la classifica del campionato non esiste in coppa, che ha una
 * sua forma (gironi, semifinali, finale). Una piattaforma può quindi dichiarare
 * qualcosa di diverso per competizione, e quel qualcosa va letto per quello che
 * è.
 *
 * **Assenza qui non significa «non osservato»**, a differenza del blocco
 * generale: significa «questa competizione non dichiara una regola propria», e
 * quindi vale quella di lega. Per questo la riconciliazione non produce
 * `notObserved` sui blocchi per competizione — sarebbe rumore per costruzione.
 */
export interface ObservedCompetitionSettings {
  /** Identificatore opaco della competizione. Mai un nome della piattaforma. */
  readonly competitionId: string;
  readonly settings: ObservedScoringSettings;
}

/**
 * Le impostazioni di lega osservate: il blocco generale più, se la piattaforma
 * le espone, le dichiarazioni per competizione.
 */
export interface ObservedLeagueSettings extends ObservedScoringSettings {
  readonly perCompetition?: readonly ObservedCompetitionSettings[];
}

/**
 * Problemi di FORMA, non di merito: qui non si confronta col regolamento (lo fa
 * `reconcileWithLeagueRules`), si controlla che ciò che è stato osservato sia
 * almeno leggibile come numero e come insieme. Un campo non osservato non è mai
 * un problema di forma.
 *
 * Restituisce la lista dei problemi, vuota se non ce ne sono: nessun throw,
 * perché una lettura malformata è un fatto da registrare, non un incidente del
 * chiamante.
 */
export function validateObservedLeagueSettings(
  observed: ObservedLeagueSettings,
): readonly string[] {
  const problems = [...validateScoringSettings(observed, "")];
  if (observed.perCompetition !== undefined) {
    const seen = new Set<string>();
    for (const block of observed.perCompetition) {
      if (block.competitionId.length === 0) {
        problems.push("perCompetition: blocco con competitionId vuoto");
      }
      if (seen.has(block.competitionId)) {
        problems.push(`perCompetition: competitionId ripetuto ${block.competitionId}`);
      }
      seen.add(block.competitionId);
      problems.push(
        ...validateScoringSettings(block.settings, `perCompetition.${block.competitionId}.`),
      );
    }
  }
  return problems;
}

function validateScoringSettings(
  observed: ObservedScoringSettings,
  prefix: string,
): readonly string[] {
  const problems: string[] = [];

  const finite = (label: string, value: number | undefined): void => {
    if (value !== undefined && !Number.isFinite(value)) {
      problems.push(`${prefix}${label}: valore non finito`);
    }
  };
  const positiveInteger = (label: string, value: number | undefined): void => {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < 1) {
      problems.push(`${prefix}${label}: atteso intero >= 1, osservato ${value}`);
    }
  };
  const nonNegativeInteger = (label: string, value: number | undefined): void => {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < 0) {
      problems.push(`${prefix}${label}: atteso intero >= 0, osservato ${value}`);
    }
  };

  nonNegativeInteger("maxSubstitutions", observed.maxSubstitutions);
  positiveInteger("neutralGroundFromMatchday", observed.neutralGroundFromMatchday);
  positiveInteger("firstGoalThreshold", observed.firstGoalThreshold);
  positiveInteger("goalBandWidth", observed.goalBandWidth);
  nonNegativeInteger("sameBandExtraGoalMinGap", observed.sameBandExtraGoalMinGap);
  nonNegativeInteger("bothBelowThresholdGoalMinGap", observed.bothBelowThresholdGoalMinGap);
  nonNegativeInteger(
    "lineupDeadlineMinutesBeforeKickoff",
    observed.lineupDeadlineMinutesBeforeKickoff,
  );
  positiveInteger("defenceMinDefendersWithVote", observed.defenceMinDefendersWithVote);

  finite("homeFieldBonus", observed.homeFieldBonus);
  finite("noVoteBonusMalusBase", observed.noVoteBonusMalusBase);
  finite("noVoteBookedPreset", observed.noVoteBookedPreset);
  finite("noVoteSentOffDuringMatch", observed.noVoteSentOffDuringMatch);
  finite("midfieldFictitiousVote", observed.midfieldFictitiousVote);
  finite("midfieldMaxDelta", observed.midfieldMaxDelta);
  finite("attackSufficientVote", observed.attackSufficientVote);
  finite("attackMaxBonus", observed.attackMaxBonus);
  finite("attackMaxFromVote", observed.attackMaxFromVote);
  finite("pointsWin", observed.pointsWin);
  finite("pointsDraw", observed.pointsDraw);
  finite("pointsLoss", observed.pointsLoss);

  if (observed.allowedModules !== undefined) {
    const seen = new Set<Module>();
    for (const module of observed.allowedModules) {
      if (seen.has(module)) problems.push(`${prefix}allowedModules: modulo ripetuto ${module}`);
      seen.add(module);
    }
    if (observed.allowedModules.length === 0) {
      problems.push(`${prefix}allowedModules: lista vuota osservata (nessun modulo schierabile)`);
    }
  }

  if (observed.moduleModifier !== undefined) {
    for (const [module, value] of Object.entries(observed.moduleModifier)) {
      if (value !== undefined && !Number.isFinite(value)) {
        problems.push(`${prefix}moduleModifier.${module}: valore non finito`);
      }
    }
  }

  for (const [label, rows] of [
    ["attackTable", observed.attackTable],
    ["midfieldTable", observed.midfieldTable],
  ] as const) {
    if (rows === undefined) continue;
    for (const [index, row] of rows.entries()) {
      const values = Object.values(row);
      if (values.some((value) => !Number.isFinite(value))) {
        problems.push(`${prefix}${label}[${index}]: valore non finito`);
      }
    }
  }

  if (observed.defenceBands !== undefined) {
    for (const [index, band] of observed.defenceBands.entries()) {
      if (!Number.isFinite(band.minAverage) || !Number.isFinite(band.bonus)) {
        problems.push(`${prefix}defenceBands[${index}]: valore non finito`);
      }
    }
  }

  return problems;
}
