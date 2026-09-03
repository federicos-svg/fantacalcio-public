// SIMULATORE ESATTO DELLA GIORNATA — passo 2 della Fase 2 (Lineup Coach).
//
// Date due formazioni e i voti della giornata, questo modulo dice esattamente
// come finisce: sostituzioni applicate, tre modificatori calcolati, modificatore
// modulo assegnato all'avversario, fattore campo, punteggi di squadra e
// conversione in goal. Nessuna previsione: i voti arrivano da fuori — veri,
// storici o sintetici — e qui si applica il regolamento e basta.
//
// PERCHÉ QUESTO VIENE PRIMA DI QUALUNQUE MODELLO. Senza un simulatore esatto,
// una previsione non è valutabile: non si può misurare quanto vale una
// previsione se non si sa tradurre i suoi numeri nel risultato che contano.
// La review critica della Fase 2 lo mette al primo posto proprio per questo,
// spostandolo dal quinto posto in cui il recap lo collocava.
//
// LA TARIFFA BONUS/MALUS NON VIVE QUI, DI PROPOSITO. Il fantavoto individuale
// (gol +3, assist +1, ammonizione −0,5, il −1 al solo portiere…) è già
// implementato in `packages/appeal-index/src/fantavoto.ts`, con la sua guardia
// sulla platea del malus e la sua versione di regola. Reimplementarlo qui
// significherebbe avere due copie della stessa tariffa che un giorno
// divergeranno in silenzio. Questo simulatore riceve il punteggio individuale
// già formato e si occupa di ciò che quel modulo non fa: la formazione.
//
// IL VOTO BASE E IL PUNTEGGIO INDIVIDUALE SONO DUE COSE DIVERSE, e servono
// entrambi: i modificatori lavorano sul voto base («Per tutti i ruoli si
// intende voto base»), la somma di squadra sui punteggi individuali. Chi li
// confonde premia due volte lo stesso gol.

import {
  LEAGUE_RULE_VERSION,
  type LeagueRuleVersion,
  type Module,
  attackModifier,
  defenceModifier,
  homeFieldBonus,
  midfieldModifier,
  modulePointsToOpponent,
  moduleShape,
  scoreToGoals,
  SUBSTITUTION_RULES,
  type CardStatus,
  noVoteScore,
} from "./leagueGameweek.js";

export type Role = "P" | "D" | "C" | "A";

/**
 * Una riga di giornata per un giocatore. `null` su entrambi i voti significa
 * SENZA VOTO: non è uno zero, ed è la ragione per cui esiste la panchina.
 */
export interface PlayerLine {
  readonly id: string;
  readonly role: Role;
  /** Voto base — alimenta i modificatori. `null` = senza voto. */
  readonly baseVote: number | null;
  /** Punteggio individuale (voto base più bonus/malus). `null` = senza voto. */
  readonly fantasyScore: number | null;
  /** Un qualunque bonus ricevuto esclude l'attaccante dal modificatore attacco. */
  readonly receivedAnyBonus?: boolean;
  /** Rigore sbagliato: esclude dal modificatore attacco. */
  readonly missedPenalty?: boolean;
  /**
   * Stato disciplinare. Serve SOLO a chi resta in campo senza voto, dove decide
   * fra 5, 4 e nessun punteggio. Lasciarlo indefinito su un senza voto scoperto
   * non è neutro: il calcolo si ferma invece di supporre «nessun cartellino»,
   * perché quella supposizione vale un punteggio intero.
   */
  readonly cards?: CardStatus;
}

/**
 * Una formazione dichiarata. L'ORDINE CONTA, ed è l'ordine del fantallenatore:
 * è l'unica preferenza che il regolamento ci dà per decidere chi entra e chi
 * resta fuori quando i senza voto sono più delle sostituzioni disponibili.
 */
export interface Lineup {
  readonly module: Module;
  readonly goalkeeperId: string;
  /** Titolari di movimento, nell'ordine dichiarato dal fantallenatore. */
  readonly starterIds: readonly string[];
  /** Panchina, nell'ordine dichiarato: il primo utile entra per primo. */
  readonly benchIds: readonly string[];
}

export interface SubstitutionRecord {
  readonly outId: string;
  readonly inId: string;
  readonly role: Role;
}

/** Un titolare rimasto in campo senza voto, e quel che il regolamento gli dà. */
export interface NoVoteApplication {
  readonly id: string;
  readonly role: Role;
  readonly cards: CardStatus | null;
  /** `null` = nessun punteggio d'ufficio, conta come assente. */
  readonly score: number | null;
}

export interface SideResolution {
  /** Gli undici effettivi dopo le sostituzioni. */
  readonly fielded: readonly PlayerLine[];
  readonly substitutions: readonly SubstitutionRecord[];
  /** Titolari rimasti senza voto e senza rimpiazzo, col punteggio che spetta loro. */
  readonly noVote: readonly NoVoteApplication[];
  /** Fra quelli, chi non dichiara lo stato cartellini: il punteggio non è calcolabile. */
  readonly undeclaredCardIds: readonly string[];
  /** Somma dei punteggi d'ufficio applicati. */
  readonly noVoteTotal: number;
  readonly substitutionsUsed: number;
  readonly substitutionCapReached: boolean;
}

function lineOf(players: ReadonlyMap<string, PlayerLine>, id: string): PlayerLine {
  const line = players.get(id);
  if (line === undefined) throw new Error(`giocatore non presente nelle righe di giornata: ${id}`);
  return line;
}

const hasVote = (line: PlayerLine): boolean => line.baseVote !== null && line.fantasyScore !== null;

/**
 * SOSTITUZIONI — massimo 5, stesso ruolo, nessun cambio modulo.
 *
 * L'ORDINE DI ENTRATA È QUELLO DELLA PANCHINA, e l'ordine di uscita è quello
 * dei titolari: sono entrambe preferenze DICHIARATE dal fantallenatore. Il
 * regolamento non detta un criterio diverso, e inventarne uno (per esempio «esce
 * chi ha la media più bassa») significherebbe far scegliere al sistema al posto
 * di chi schiera.
 */
export function applySubstitutions(
  lineup: Lineup,
  players: ReadonlyMap<string, PlayerLine>,
): SideResolution {
  const starters = [lineup.goalkeeperId, ...lineup.starterIds].map((id) => lineOf(players, id));
  const bench = lineup.benchIds.map((id) => lineOf(players, id));
  const fielded = [...starters];
  const substitutions: SubstitutionRecord[] = [];
  const benchUsed = new Set<string>();

  for (const candidate of bench) {
    if (substitutions.length >= SUBSTITUTION_RULES.maxSubstitutions) break;
    if (!hasVote(candidate) || benchUsed.has(candidate.id)) continue;
    // Stesso ruolo, e il primo titolare senza voto in ordine dichiarato.
    const index = fielded.findIndex((line) => line.role === candidate.role && !hasVote(line));
    if (index === -1) continue;
    substitutions.push({ outId: fielded[index]!.id, inId: candidate.id, role: candidate.role });
    fielded[index] = candidate;
    benchUsed.add(candidate.id);
  }

  // La sostituzione viene prima, sempre e per tutti — il portiere compreso, che
  // in `fielded` è un titolare come gli altri e che la panchina copre per ruolo.
  // Solo su chi resta scoperto il regolamento mette un punteggio d'ufficio.
  const noVote: NoVoteApplication[] = fielded
    .filter((line) => !hasVote(line))
    .map((line) => {
      const cards = line.cards ?? null;
      const isGoalkeeper = line.role === "P";
      // Il portiere non ha bisogno dei cartellini: il regolamento gli dà 6 e
      // basta. Il movimento sì, e senza quel dato il punteggio non si calcola.
      const score =
        isGoalkeeper || cards !== null
          ? noVoteScore({ isGoalkeeper, cards: cards ?? "none" })
          : null;
      return { id: line.id, role: line.role, cards, score };
    });

  return {
    fielded,
    substitutions,
    noVote,
    undeclaredCardIds: noVote
      .filter((entry) => entry.cards === null && entry.role !== "P")
      .map((entry) => entry.id),
    noVoteTotal: noVote.reduce((sum, entry) => sum + (entry.score ?? 0), 0),
    substitutionsUsed: substitutions.length,
    substitutionCapReached: substitutions.length >= SUBSTITUTION_RULES.maxSubstitutions,
  };
}

/** Contesto della sfida: chi gioca in casa e in che giornata. */
export interface GameweekContext {
  readonly matchday: number;
  /** `true` se la nostra squadra gioca in casa (fattore campo fino alla 28ª). */
  readonly weAreHome: boolean;
}

export interface SideScore {
  readonly resolution: SideResolution;
  /** Somma dei punteggi individuali degli undici effettivi, punteggi d'ufficio inclusi. */
  readonly playersTotal: number;
  /** Quanta parte di `playersTotal` viene dai senza voto rimasti scoperti. */
  readonly noVoteTotal: number;
  readonly defence: number;
  readonly midfield: number;
  readonly attack: number;
  /** Modificatore modulo RICEVUTO da questa squadra, cioè regalato dall'altra. */
  readonly moduleFromOpponent: number;
  readonly homeField: number;
  readonly total: number;
}

export interface GameweekOutcome {
  readonly ours: SideScore;
  readonly theirs: SideScore;
  readonly ourGoals: number;
  readonly theirGoals: number;
  /**
   * `false` quando un giocatore di movimento è rimasto in campo senza voto e
   * senza che i suoi cartellini siano dichiarati: fra 5, 4 e nessun punteggio
   * ci sono cinque punti, e sceglierne uno per comodità somiglierebbe a un
   * risultato. Il senza voto in sé non rende più irrisolta la giornata — la sua
   * semantica è dichiarata dal 2026-09-03.
   */
  readonly resolved: boolean;
  readonly unresolvedReason: string | null;
  /** `false` se un modificatore ha incontrato un valore fuori tabella. */
  readonly fullyTabulated: boolean;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

function baseVotesOfRole(fielded: readonly PlayerLine[], role: Role): number[] {
  return fielded
    .filter((line) => line.role === role && line.baseVote !== null)
    .map((line) => line.baseVote as number);
}

/**
 * IL CUORE: due formazioni, i voti della giornata, e il risultato esatto.
 *
 * L'ordine dei passi non è arbitrario ed è quello del regolamento:
 * sostituzioni -> punteggi individuali -> modificatori sui voti base ->
 * modificatore modulo all'AVVERSARIO -> fattore campo -> conversione in goal.
 */
export function simulateGameweek(input: {
  readonly ourLineup: Lineup;
  readonly theirLineup: Lineup;
  readonly players: ReadonlyMap<string, PlayerLine>;
  readonly context: GameweekContext;
}): GameweekOutcome {
  const { ourLineup, theirLineup, players, context } = input;
  const ourResolution = applySubstitutions(ourLineup, players);
  const theirResolution = applySubstitutions(theirLineup, players);

  const unresolved = [...ourResolution.undeclaredCardIds, ...theirResolution.undeclaredCardIds];

  const ourMid = baseVotesOfRole(ourResolution.fielded, "C");
  const theirMid = baseVotesOfRole(theirResolution.fielded, "C");
  const midfield = midfieldModifier({ ourBaseVotes: ourMid, theirBaseVotes: theirMid });

  const attackOf = (resolution: SideResolution) =>
    attackModifier(
      resolution.fielded
        .filter((line) => line.role === "A")
        .map((line) => ({
          baseVote: line.baseVote,
          receivedAnyBonus: line.receivedAnyBonus === true,
          missedPenalty: line.missedPenalty === true,
        })),
    );

  const sideOf = (
    resolution: SideResolution,
    opponentModule: Module,
    midfieldDelta: number,
    attack: ReturnType<typeof attackModifier>,
    isHome: boolean,
  ): SideScore => {
    const goalkeeper = resolution.fielded.find((line) => line.role === "P");
    const defence = defenceModifier({
      goalkeeperBaseVote: goalkeeper?.baseVote ?? null,
      defenderBaseVotes: baseVotesOfRole(resolution.fielded, "D"),
    });
    // I senza voto scoperti hanno `fantasyScore` nullo e valgono zero nella
    // somma: il loro punteggio d'ufficio si aggiunge qui, una volta sola.
    const playersTotal =
      resolution.fielded.reduce((sum, line) => sum + (line.fantasyScore ?? 0), 0) + resolution.noVoteTotal;
    // Il modificatore modulo lo REGALA L'AVVERSARIO col suo modulo: qui si
    // legge quello dell'altra formazione, non il proprio.
    const moduleFromOpponent = modulePointsToOpponent(opponentModule);
    const homeField = isHome ? homeFieldBonus(context.matchday) : 0;
    return {
      resolution,
      playersTotal,
      noVoteTotal: resolution.noVoteTotal,
      defence: defence.value,
      midfield: midfieldDelta,
      attack: attack.value,
      moduleFromOpponent,
      homeField,
      total: playersTotal + defence.value + midfieldDelta + attack.value + moduleFromOpponent + homeField,
    };
  };

  const ourAttack = attackOf(ourResolution);
  const theirAttack = attackOf(theirResolution);
  const ours = sideOf(ourResolution, theirLineup.module, midfield.ourDelta, ourAttack, context.weAreHome);
  const theirs = sideOf(theirResolution, ourLineup.module, midfield.theirDelta, theirAttack, !context.weAreHome);

  const goals = scoreToGoals(ours.total, theirs.total);

  return {
    ours,
    theirs,
    ourGoals: goals.ourGoals,
    theirGoals: goals.theirGoals,
    resolved: unresolved.length === 0,
    unresolvedReason:
      unresolved.length === 0
        ? null
        : `senza voto, senza rimpiazzo e senza stato cartellini dichiarato: ${unresolved.join(", ")}. Il regolamento dà 5 col giallo, 4 col rosso e nessun punteggio senza cartellini: il punteggio qui sopra li conta come assenti, quindi NON è il punteggio ufficiale.`,
    fullyTabulated: midfield.tabulated && ourAttack.fullyTabulated && theirAttack.fullyTabulated,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * Verifica che una formazione sia legale per il suo modulo: numeri per ruolo,
 * un portiere solo, nessun giocatore ripetuto fra titolari e panchina.
 * Restituisce l'elenco delle violazioni: vuoto significa legale.
 */
export function lineupViolations(lineup: Lineup, players: ReadonlyMap<string, PlayerLine>): readonly string[] {
  const violations: string[] = [];
  const shape = moduleShape(lineup.module);
  const goalkeeper = players.get(lineup.goalkeeperId);
  if (goalkeeper === undefined) violations.push(`portiere assente dalle righe: ${lineup.goalkeeperId}`);
  else if (goalkeeper.role !== "P") violations.push(`il portiere dichiarato ha ruolo ${goalkeeper.role}`);

  const counts: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const id of lineup.starterIds) {
    const line = players.get(id);
    if (line === undefined) {
      violations.push(`titolare assente dalle righe: ${id}`);
      continue;
    }
    counts[line.role] += 1;
  }
  if (counts.P > 0) violations.push("un secondo portiere fra i titolari di movimento");
  if (counts.D !== shape.defenders) violations.push(`difensori: ${counts.D}, il modulo ne chiede ${shape.defenders}`);
  if (counts.C !== shape.midfielders)
    violations.push(`centrocampisti: ${counts.C}, il modulo ne chiede ${shape.midfielders}`);
  if (counts.A !== shape.strikers) violations.push(`attaccanti: ${counts.A}, il modulo ne chiede ${shape.strikers}`);

  const all = [lineup.goalkeeperId, ...lineup.starterIds, ...lineup.benchIds];
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) violations.push(`giocatore schierato due volte: ${id}`);
    seen.add(id);
  }
  return violations;
}
