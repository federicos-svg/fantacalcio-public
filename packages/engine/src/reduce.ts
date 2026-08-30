import {
  type AuctionEvent,
  type AuctionState,
  type Role,
  type TeamState,
  type RosterEntry,
  ROLES,
  ROSTER_REQUIREMENTS,
  INITIAL_BUDGET,
} from "./types.js";
import { type ConfirmationInput, validateConfirmations } from "./confirmations.js";

function emptyFilled(): Record<Role, number> {
  return { P: 0, D: 0, C: 0, A: 0 };
}

/**
 * `creditLedger` — LA CORREZIONE CHE TIENE INSIEME ROSA E BUDGET.
 *
 * Fino a quando il log conosceva solo acquisti, «speso» era la somma dei
 * prezzi in rosa: una sola verita, letta in un posto solo. Svincoli e scambi
 * rompono quell'uguaglianza, e la rompono in due modi diversi.
 *
 *  - SVINCOLO. La casella si libera e la riga esce dalla rosa, ma i crediti
 *    tornati sono `creditsReturned`, non il prezzo pagato. La differenza —
 *    quello che lo svincolo e costato — non e piu rappresentata da nessuna
 *    riga di rosa, e senza registro sparirebbe: la squadra si ritroverebbe il
 *    budget di prima dell'acquisto, come se non fosse mai successo niente.
 *  - SCAMBIO. Le righe cambiano rosa portandosi il prezzo che avevano (il
 *    prezzo e la memoria dell'asta, non un valore corrente). Se il budget
 *    seguisse la somma dei prezzi, cedere un giocatore da 84 e riceverne uno
 *    da 1 regalerebbe 83 crediti a chi cede — crediti che nessuno ha pagato.
 *    Il registro annulla il movimento dei prezzi e lascia passare il solo
 *    conguaglio, che e l'unica cosa che davvero cambia di mano.
 *
 * `spent = somma dei prezzi in rosa + registro`, e `budgetResidual` resta
 * `INITIAL_BUDGET - spent` come e sempre stato.
 */
function buildTeam(fantaTeamId: string, roster: RosterEntry[], creditLedger: number): TeamState {
  const filled = emptyFilled();
  let spent = creditLedger;
  for (const r of roster) {
    filled[r.role] += 1;
    spent += r.price;
  }
  const slotsRemaining: Record<Role, number> = {
    P: ROSTER_REQUIREMENTS.P - filled.P,
    D: ROSTER_REQUIREMENTS.D - filled.D,
    C: ROSTER_REQUIREMENTS.C - filled.C,
    A: ROSTER_REQUIREMENTS.A - filled.A,
  };
  const totalSlotsRemaining =
    slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A;
  return {
    fantaTeamId,
    spent,
    budgetResidual: INITIAL_BUDGET - spent,
    filled,
    slotsRemaining,
    totalSlotsRemaining,
    roster: roster
      .slice()
      .sort((a, b) => a.seq - b.seq), // deterministic order = purchase order
  };
}

/**
 * Pure, deterministic projection of the event log to current state.
 * VOID events compensate prior PURCHASEs (no mutation, no deletion).
 * Same log -> same state, always.
 *
 * `confirmations` (LEAGUE_RULES.md §4, optional, default none) seed each
 * team's INITIAL roster — budget and one role slot reduced per riconferma —
 * BEFORE the live event log is replayed on top, via the same roster/buildTeam
 * arithmetic an ordinary PURCHASE goes through. They are NOT AuctionEvents:
 * they never enter the append-only log, so the live VOID/undo mechanism
 * (feasibility.ts) stays scoped to actual bids placed at the table, and
 * maxSafe()/hardReserve()/purchaseFeasibility()/budgetPlan() need no change —
 * they only ever see the resulting TeamState. Fail-closed: an invalid
 * confirmations batch throws instead of silently producing a wrong state
 * (see validateConfirmations for the non-throwing check). Omitting
 * `confirmations` (or passing []) reproduces prior behaviour exactly — no
 * regression for existing callers.
 */
export function reduce(
  events: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): AuctionState {
  if (confirmations.length > 0) {
    const validation = validateConfirmations(confirmations, fantaTeamIds);
    if (!validation.ok) {
      throw new Error(
        `invalid confirmations: ${validation.issues
          .map((i) => `${i.fantaTeamId}/${i.playerId}:${i.violation}`)
          .join(", ")}`,
      );
    }
  }

  const voided = new Set<number>();
  for (const e of events) {
    if (e.type === "VOID") voided.add(e.targetSeq);
  }

  const rosters = new Map<string, RosterEntry[]>();
  const ledger = new Map<string, number>();
  for (const id of fantaTeamIds) {
    rosters.set(id, []);
    ledger.set(id, 0);
  }

  /**
   * playerId -> squadra che lo ha ADESSO. Serve a una cosa sola, e non e una
   * comodita: rifiutare un acquisto di un giocatore che e gia di qualcuno.
   *
   * PERCHE LA RETE STA QUI E NON SOLO AL BORDO. `validateAuctionLog`
   * (src/logRecovery.ts) rifiuta gia questo log quando lo si salva o lo si
   * importa, ed e il motivo per cui nessuno stato corrotto e mai stato
   * persistito. Ma `reduce()` e la funzione da cui ogni numero dell'app
   * discende, e girava su quel log senza lanciare: produceva lo stesso
   * giocatore in DUE rose, un `purchasedPlayerIds` con un doppione, e otto
   * budget plausibili e sbagliati. Uno stato plausibile e sbagliato e la forma
   * di errore peggiore per una contabilita d'asta, e questa riga la rende
   * irrappresentabile invece che improbabile.
   *
   * Trovato dalla lente Engineering sulla PR pubblica #73: il commento su
   * `target-superseded` (feasibility.ts) prometteva «e la condizione esatta
   * sotto cui il replay lancerebbe», e per un caso il replay non lanciava.
   * Adesso la promessa e vera.
   */
  const ownerOf = new Map<string, string>();

  /** La rosa di una squadra nominata da un evento, o un rifiuto. Un id di
   *  squadra che il tavolo non conosce e un log corrotto, non un caso da
   *  ignorare in silenzio: ignorarlo produrrebbe uno stato plausibile e
   *  sbagliato — la forma di errore peggiore per una contabilita d'asta. */
  const rosterOf = (fantaTeamId: string, where: string): RosterEntry[] => {
    const roster = rosters.get(fantaTeamId);
    if (!roster) throw new Error(`unknown fantaTeamId in log: ${fantaTeamId} (${where})`);
    return roster;
  };

  // Riconferme seed the roster first, with seq strictly below every live
  // event's seq (>= 0 by schema — see events.ts), so they always sort before
  // any live purchase: deterministic order = confirmations, then bids.
  // `confirmedBy` indexes them by playerId for the O(1) conflict check below.
  const confirmedBy = new Map<string, string>();
  confirmations.forEach((c, index) => {
    rosters.get(c.fantaTeamId)!.push({
      playerId: c.playerId,
      role: c.role,
      price: c.price,
      seq: index - confirmations.length,
    });
    confirmedBy.set(c.playerId, c.fantaTeamId);
    ownerOf.set(c.playerId, c.fantaTeamId);
  });

  let lastSeq = -1;

  // process in seq order for determinism regardless of input ordering
  const ordered = events.slice().sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    lastSeq = Math.max(lastSeq, e.seq);
    if (e.type === "VOID") continue;
    if (voided.has(e.seq)) continue;

    if (e.type === "PURCHASE") {
      // Confirmations and the live log are validated independently: a riconferma
      // for a player and a live PURCHASE of that same player are each valid on
      // their own, and nothing else sees both. Replaying them together would
      // put the same player on two rosters at once — a silent double count of
      // budget and slots. Fail-closed, same style as the invalid-confirmations
      // throw above, rather than silently producing a wrong state.
      const confirmedTeam = confirmedBy.get(e.playerId);
      if (confirmedTeam !== undefined) {
        throw new Error(
          `confirmations/live-log conflict: playerId "${e.playerId}" already confirmed (team ${confirmedTeam}), cannot also be purchased live by ${e.fantaTeamId}`,
        );
      }
      const owner = ownerOf.get(e.playerId);
      if (owner !== undefined) {
        throw new Error(
          `PURCHASE seq ${e.seq}: playerId "${e.playerId}" is already on ${owner}'s roster, cannot also be purchased by ${e.fantaTeamId}`,
        );
      }
      rosterOf(e.fantaTeamId, `PURCHASE seq ${e.seq}`).push({
        playerId: e.playerId,
        role: e.role,
        price: e.price,
        seq: e.seq,
      });
      ownerOf.set(e.playerId, e.fantaTeamId);
      continue;
    }

    if (e.type === "RELEASE") {
      const roster = rosterOf(e.fantaTeamId, `RELEASE seq ${e.seq}`);
      const index = roster.findIndex((entry) => entry.playerId === e.playerId);
      // Un log che svincola un giocatore che quella squadra non ha e un log
      // che non descrive nessuna partita reale. Puo nascere solo da un VOID
      // che toglie l'acquisto SOTTO uno svincolo gia registrato: e proprio
      // quel VOID che `voidFeasibility` rifiuta (`target-superseded`), e
      // questo throw e la rete sotto quel rifiuto.
      if (index === -1) {
        throw new Error(
          `RELEASE seq ${e.seq}: playerId "${e.playerId}" is not on ${e.fantaTeamId}'s roster`,
        );
      }
      const [entry] = roster.splice(index, 1);
      ledger.set(e.fantaTeamId, ledger.get(e.fantaTeamId)! + entry!.price - e.creditsReturned);
      ownerOf.delete(e.playerId);
      continue;
    }

    // TRADE
    const rosterA = rosterOf(e.teamAId, `TRADE seq ${e.seq}`);
    const rosterB = rosterOf(e.teamBId, `TRADE seq ${e.seq}`);
    const moved = (
      from: RosterEntry[],
      to: RosterEntry[],
      playerIds: readonly string[],
      fromId: string,
      moves: string[],
    ): number => {
      let pricesMoved = 0;
      for (const playerId of playerIds) {
        const index = from.findIndex((entry) => entry.playerId === playerId);
        if (index === -1) {
          throw new Error(
            `TRADE seq ${e.seq}: playerId "${playerId}" is not on ${fromId}'s roster`,
          );
        }
        const [entry] = from.splice(index, 1);
        to.push(entry!);
        pricesMoved += entry!.price;
        moves.push(playerId);
      }
      return pricesMoved;
    };
    // Le due chiamate leggono le rose PRIMA di scriverle a vicenda solo per i
    // giocatori che stanno cedendo: un id presente in `fromA` e in `fromB`
    // non puo quindi essere spostato due volte, e `tradeFeasibility` lo
    // rifiuta comunque a monte (`duplicate-player`).
    const toB: string[] = [];
    const toA: string[] = [];
    const pricesAToB = moved(rosterA, rosterB, e.fromA, e.teamAId, toB);
    const pricesBToA = moved(rosterB, rosterA, e.fromB, e.teamBId, toA);
    for (const playerId of toB) ownerOf.set(playerId, e.teamBId);
    for (const playerId of toA) ownerOf.set(playerId, e.teamAId);
    // Il registro annulla il movimento dei prezzi e lascia passare il solo
    // conguaglio: vedi il commento su `buildTeam`.
    ledger.set(e.teamAId, ledger.get(e.teamAId)! + e.creditsAToB + pricesAToB - pricesBToA);
    ledger.set(e.teamBId, ledger.get(e.teamBId)! - e.creditsAToB + pricesBToA - pricesAToB);
  }

  const teams: Record<string, TeamState> = {};
  // `purchasedPlayerIds` SI DERIVA DALLE ROSE, e non piu da una lista che
  // cresce a ogni acquisto. Da quando esiste lo svincolo la domanda non e piu
  // «chi e stato comprato» ma «chi e ancora di qualcuno»: un giocatore
  // svincolato deve tornare libero nel listone, e una lista che accumula non
  // saprebbe mai toglierlo. L'insieme delle rose e per costruzione la
  // risposta giusta a entrambe le domande finche esistevano solo acquisti, e
  // resta quella giusta adesso.
  const owned: string[] = [];
  for (const id of fantaTeamIds) {
    const roster = rosters.get(id)!;
    teams[id] = buildTeam(id, roster, ledger.get(id)!);
    for (const entry of roster) owned.push(entry.playerId);
  }

  return {
    teams,
    purchasedPlayerIds: owned.slice().sort(),
    lastSeq,
  };
}

/**
 * CHI E ANCORA DI QUALCUNO, senza mai lanciare.
 *
 * Stesse regole di `reduce()` — acquisti non annullati, riconferme, meno gli
 * svincoli, con gli scambi che spostano e non tolgono — ma TOLLERANTE: un id
 * di squadra sconosciuto o un evento che nomina un giocatore che non c'e
 * vengono saltati invece di far lanciare.
 *
 * Esiste perche un chiamante ce l'ha davvero, e non e un capriccio: la
 * guardia che rifiuta uno scambio di listone capace di orfanare dei giocatori
 * gia acquistati gira sul percorso ASINCRONO di caricamento del pool, dove
 * un'eccezione salterebbe il `render()` e lascerebbe la schermata ferma su
 * uno stato vecchio senza dire perche. Li serve la lista, non la validazione:
 * la validazione la fanno `validateAuctionLog` e `reduce()`, ognuno al suo
 * posto.
 */
export function standingPlayerIds(
  events: readonly AuctionEvent[],
  confirmations: readonly ConfirmationInput[] = [],
): string[] {
  const voided = new Set<number>();
  for (const e of events) if (e.type === "VOID") voided.add(e.targetSeq);

  /** playerId -> squadra che lo ha adesso. */
  const ownerOf = new Map<string, string>();
  for (const c of confirmations) ownerOf.set(c.playerId, c.fantaTeamId);

  for (const e of events.slice().sort((a, b) => a.seq - b.seq)) {
    if (e.type === "VOID" || voided.has(e.seq)) continue;
    if (e.type === "PURCHASE") {
      ownerOf.set(e.playerId, e.fantaTeamId);
    } else if (e.type === "RELEASE") {
      if (ownerOf.get(e.playerId) === e.fantaTeamId) ownerOf.delete(e.playerId);
    } else {
      for (const playerId of e.fromA) {
        if (ownerOf.get(playerId) === e.teamAId) ownerOf.set(playerId, e.teamBId);
      }
      for (const playerId of e.fromB) {
        if (ownerOf.get(playerId) === e.teamBId) ownerOf.set(playerId, e.teamAId);
      }
    }
  }
  return [...ownerOf.keys()].sort();
}

export { ROLES };
