// Hard-safe admission layer — Batch 2.
// maxSafe ADVISES the strongest safe bid; this module ENFORCES that a manually
// entered purchase cannot drive the auction into an impossible state.
// Pure functions; deterministic; no value/price model, no UI, no data.

import {
  type AuctionEvent,
  type AuctionState,
  type PurchaseEvent,
  type ReleaseEvent,
  type TradeEvent,
  type VoidEvent,
  type Role,
  COST_FLOOR,
  ROLES,
  ROSTER_REQUIREMENTS,
} from "./types.js";
import { appendEvent } from "./events.js";
import { type ConfirmationInput, type ConfirmationViolation, validateConfirmations } from "./confirmations.js";
import { reduce } from "./reduce.js";
import { hardReserve } from "./auction.js";

/** A manual purchase the operator wants to record — before it becomes an event. */
export interface ProposedPurchase {
  readonly playerId: string;
  readonly role: Role;
  readonly fantaTeamId: string;
  readonly price: number;
  /**
   * Operator's explicit declaration, made in the same gesture as this
   * purchase, that LEAGUE_RULES.md §6's zero-cost exception applies: same
   * real club as a portiere already on this team's roster, and no other
   * participant interested. Both are facts about the table this engine
   * cannot observe (competitors.ts deliberately does not model "interest",
   * and PoolPlayer carries no real-club field) — so eligibility here is
   * never inferred, only declared. Declaring it does NOT by itself admit
   * anything: purchaseFeasibility below still requires this purchase to
   * structurally BE the team's third portiere slot. Irrelevant (ignored) on
   * any purchase priced at COST_FLOOR or above.
   */
  readonly declareThirdGoalkeeperZero?: boolean;
}

export type FeasibilityViolation =
  | "unknown-team" // fantaTeamId not in the auction
  | "role-full" // no remaining slot for this role on this team
  | "duplicate-player" // player already won (and not voided) by someone
  | "price-invalid" // price is not an integer (NaN, Infinity, 10.5, ...)
  | "price-below-floor" // price < COST_FLOOR
  | "insufficient-budget" // price exceeds the team's residual budget
  | "breaks-hard-reserve"; // residual after this buy can't fill the OTHER mandatory slots at floor

export interface FeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly FeasibilityViolation[];
}

/**
 * Checks a proposed purchase against the current derived state.
 * Returns every violation found (not just the first) so the UI can explain why.
 * A purchase is feasible iff it leaves the roster completable: residual minus
 * price must still cover every OTHER still-empty mandatory slot at COST_FLOOR.
 *
 * ONE exception to `price >= COST_FLOOR`: LEAGUE_RULES.md §6, third portiere
 * at 0. It only ever applies when BOTH hold together:
 *  (a) STRUCTURAL, checked here from state — role is "P" and
 *      `team.slotsRemaining.P === 1`, i.e. this purchase completes the
 *      team's third (last) portiere slot. A contested first or second
 *      portiere, or any other role, never qualifies — this is the only
 *      branch price 0 can ever pass through.
 *  (b) DECLARED, never inferred — `proposed.declareThirdGoalkeeperZero ===
 *      true`. The rule's actual conditions (same real club as a portiere
 *      already rostered; no other participant interested) are facts about
 *      the table this engine cannot observe on its own, so it never assumes
 *      them — the operator states them, in the same gesture, at the moment.
 * (a) without (b) still rejects price 0 (a genuinely contested third
 * portiere costs at least COST_FLOOR). (b) without (a) is inert — a
 * declaration attached to any other slot changes nothing. Every price below
 * COST_FLOOR that is not this exact, declared case is rejected exactly as
 * before.
 */
export function purchaseFeasibility(
  state: AuctionState,
  proposed: ProposedPurchase,
): FeasibilityResult {
  const team = state.teams[proposed.fantaTeamId];
  if (!team) {
    return { ok: false, violations: ["unknown-team"] };
  }

  const violations: FeasibilityViolation[] = [];

  const isDeclaredThirdGoalkeeperZero =
    proposed.price === 0 &&
    proposed.role === "P" &&
    team.slotsRemaining.P === 1 &&
    proposed.declareThirdGoalkeeperZero === true;

  // Checked FIRST and separately from the floor: every comparison with NaN is
  // false, so NaN slips past `price < COST_FLOOR`, past the budget check and
  // past the hard reserve, and the whole admission layer reports `ok: true`.
  // A fractional price (10.5) clears them all legitimately. Only the zod
  // schema in appendEvent() rejects both today, one layer further downstream
  // than what callers treat as admission. This does not replace
  // "price-below-floor": a negative fractional price reports both.
  if (!Number.isInteger(proposed.price)) violations.push("price-invalid");
  if (proposed.price < COST_FLOOR && !isDeclaredThirdGoalkeeperZero) {
    violations.push("price-below-floor");
  }
  if (team.slotsRemaining[proposed.role] <= 0) violations.push("role-full");
  if (state.purchasedPlayerIds.includes(proposed.playerId)) {
    violations.push("duplicate-player");
  }
  if (proposed.price > team.budgetResidual) violations.push("insufficient-budget");

  // Hard reserve: buying this player fills one slot now; every OTHER still-empty
  // mandatory slot must remain fillable at the floor.
  const otherSlots = team.totalSlotsRemaining - 1;
  if (otherSlots > 0 && team.budgetResidual - proposed.price < otherSlots * COST_FLOOR) {
    violations.push("breaks-hard-reserve");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Manual-input contract: turn an operator's proposed purchase into the next
 * append-only event, but ONLY if it is hard-safe feasible. Throws otherwise.
 * `ts` is supplied by the caller (deterministic, testable — no clock here).
 * Returns a NEW log; never mutates the input.
 */
export function recordPurchase(
  log: readonly AuctionEvent[],
  state: AuctionState,
  proposed: ProposedPurchase,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = purchaseFeasibility(state, proposed);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible purchase (${proposed.playerId} -> ${proposed.fantaTeamId} @ ${proposed.price}): ${feasibility.violations.join(", ")}`,
    );
  }
  const nextSeq = log.length > 0 ? log[log.length - 1]!.seq + 1 : 0;
  // By this point `feasibility.ok` is true, so a price of 0 can only have
  // been admitted through the declared-third-portiere exception above — but
  // this re-checks `declareThirdGoalkeeperZero` explicitly rather than
  // inferring "price === 0 implies declared", so the field written to the
  // log always reflects what the operator actually declared, not what
  // purchaseFeasibility happened to accept it through.
  const event: PurchaseEvent = {
    type: "PURCHASE",
    seq: nextSeq,
    ts,
    playerId: proposed.playerId,
    role: proposed.role,
    fantaTeamId: proposed.fantaTeamId,
    price: proposed.price,
    ...(proposed.price === 0 && proposed.declareThirdGoalkeeperZero === true
      ? { thirdGoalkeeperZeroDeclared: true as const }
      : {}),
  };
  return appendEvent(log, event);
}

export type VoidViolation =
  | "target-not-found" // no event in the log carries this seq
  | "target-not-purchase" // the targeted event is a VOID: a VOID of a VOID means nothing
  | "already-voided" // a VOID already compensates this seq
  /**
   * Un gesto PIU RECENTE poggia su questo: l'acquisto che si vuole annullare
   * ha gia portato quel giocatore dentro uno svincolo o uno scambio, e
   * toglierlo adesso lascerebbe quel gesto a nominare un giocatore che nessuno
   * ha mai comprato — un log che `reduce()` non sa piu leggere.
   *
   * Non e una regola di prudenza: e la condizione esatta sotto cui il replay
   * lancerebbe. Si annulla prima il gesto piu recente, poi questo.
   */
  | "target-superseded";

export interface VoidFeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly VoidViolation[];
}

/**
 * Checks whether a PURCHASE at `targetSeq` can be voided/corrected.
 * A void only RELAXES constraints (frees budget + a slot), so it can never make
 * the roster less completable — there is no budget/slot check here, only the
 * structural ones: the target must exist, be a PURCHASE, and not be voided yet.
 * Pure; reads the log only.
 */
export function voidFeasibility(
  log: readonly AuctionEvent[],
  targetSeq: number,
): VoidFeasibilityResult {
  const target = log.find((e) => e.seq === targetSeq);
  if (!target) {
    return { ok: false, violations: ["target-not-found"] };
  }
  const violations: VoidViolation[] = [];
  if (target.type === "VOID") violations.push("target-not-purchase");
  if (log.some((e) => e.type === "VOID" && e.targetSeq === targetSeq)) {
    violations.push("already-voided");
  }
  if (target.type !== "VOID" && supersededBy(log, target) !== null) {
    violations.push("target-superseded");
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Il primo gesto ancora in piedi che poggia su `target`, o `null`.
 *
 * «Poggia su» ha una definizione sola e meccanica: `target` mette un giocatore
 * in una rosa (PURCHASE, o TRADE che gliela consegna) e un evento successivo,
 * non annullato, MUOVE quello stesso giocatore. Annullare il primo senza
 * annullare il secondo produrrebbe un log irriducibile, ed e la ragione per cui
 * `reduce()` lancia invece di ignorare: qui quel throw viene anticipato in un
 * rifiuto leggibile.
 */
function supersededBy(
  log: readonly AuctionEvent[],
  target: Exclude<AuctionEvent, VoidEvent>,
): AuctionEvent | null {
  const voided = new Set<number>();
  for (const e of log) if (e.type === "VOID") voided.add(e.targetSeq);

  const touched = new Set<string>(
    target.type === "PURCHASE"
      ? [target.playerId]
      : target.type === "RELEASE"
        ? [target.playerId]
        : [...target.fromA, ...target.fromB],
  );

  for (const e of log) {
    if (e.seq <= target.seq || e.type === "VOID" || voided.has(e.seq)) continue;
    if (e.type === "PURCHASE") {
      // UN ACQUISTO SUCCESSIVO CONTA SOLO SE IL TARGET E UNO SVINCOLO, ed e il
      // caso che questa funzione sbagliava.
      //
      // Il ragionamento che c'era prima — «un acquisto non puo toccare un
      // giocatore gia in rosa, quindi si salta sempre» — e vero finche il
      // target e un PURCHASE o un TRADE: in entrambi i casi il giocatore resta
      // di qualcuno, e nessuno puo ricomprarlo. E FALSO quando il target e un
      // RELEASE, perche e proprio quello svincolo ad averlo rimesso fra i
      // liberi: l'acquisto successivo e legittimo, e annullare lo svincolo
      // sotto di lui metterebbe lo stesso giocatore in DUE rose insieme.
      //
      // Trovato dalla lente Engineering sulla PR pubblica #73, con
      // controesempio eseguito: `voidFeasibility` diceva ok, `reduce()` non
      // lanciava, e a rifiutare restava solo `validateAuctionLog` al bordo del
      // salvataggio — con un messaggio generico invece di quello che nomina il
      // gesto da annullare per primo.
      if (target.type === "RELEASE" && touched.has(e.playerId)) return e;
      continue;
    }
    if (e.type === "RELEASE") {
      if (touched.has(e.playerId)) return e;
      continue;
    }
    for (const playerId of [...e.fromA, ...e.fromB]) {
      if (touched.has(playerId)) return e;
    }
  }
  return null;
}

/**
 * Manual correction contract: append a VOID compensating the PURCHASE at
 * `targetSeq`, but ONLY if structurally valid. Throws otherwise.
 * `ts` is supplied by the caller (deterministic — no clock here).
 * Returns a NEW log; never mutates the input. The reducer treats the voided
 * purchase as absent, restoring budget/slots on replay.
 */
export function recordVoid(
  log: readonly AuctionEvent[],
  targetSeq: number,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = voidFeasibility(log, targetSeq);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible void (target seq ${targetSeq}): ${feasibility.violations.join(", ")}`,
    );
  }
  const nextSeq = log.length > 0 ? log[log.length - 1]!.seq + 1 : 0;
  const event: VoidEvent = { type: "VOID", seq: nextSeq, ts, targetSeq };
  return appendEvent(log, event);
}


// ── SVINCOLO ────────────────────────────────────────────────────────────────

/** Uno svincolo che l'operatore vuole registrare, prima che diventi evento. */
export interface ProposedRelease {
  readonly playerId: string;
  readonly fantaTeamId: string;
  /** Crediti restituiti al budget. Vedi `ReleaseEvent.creditsReturned`. */
  readonly creditsReturned: number;
}

export type ReleaseViolation =
  | "unknown-team" // fantaTeamId non e al tavolo
  | "player-not-on-roster" // quella squadra non ha quel giocatore
  | "credits-invalid" // non e un intero (NaN, Infinity, 7.5, ...)
  | "credits-negative" // uno svincolo non puo togliere crediti
  | "credits-above-price"; // recuperare piu del pagato sarebbe creare crediti dal nulla

export interface ReleaseFeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly ReleaseViolation[];
}

/**
 * Uno svincolo LIBERA sempre: una casella torna vuota e il budget non
 * diminuisce. Non c'e quindi niente da controllare sul lato «la rosa resta
 * completabile» — l'unica cosa che uno svincolo puo rompere e la contabilita,
 * e la rompe in un modo solo: restituendo piu di quanto e stato pagato.
 *
 * IL TETTO NON E UNA REGOLA DI LEGA, E UNA CONSERVAZIONE. Il regolamento fissa
 * il recupero solo per §5 (`ceil(prezzo / 2)`); qui non si impone quel numero —
 * lo si mostra a schermo e lo si lascia scegliere — ma si rifiuta il caso in
 * cui l'app fabbricherebbe crediti che nessuno ha mai messo sul tavolo.
 */
export function releaseFeasibility(
  state: AuctionState,
  proposed: ProposedRelease,
): ReleaseFeasibilityResult {
  const team = state.teams[proposed.fantaTeamId];
  if (!team) return { ok: false, violations: ["unknown-team"] };

  const violations: ReleaseViolation[] = [];
  const entry = team.roster.find((r) => r.playerId === proposed.playerId);
  if (entry === undefined) violations.push("player-not-on-roster");

  if (!Number.isInteger(proposed.creditsReturned)) {
    violations.push("credits-invalid");
  } else if (proposed.creditsReturned < 0) {
    violations.push("credits-negative");
  } else if (entry !== undefined && proposed.creditsReturned > entry.price) {
    violations.push("credits-above-price");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Contratto di registrazione dello svincolo: `releaseFeasibility` prima,
 * append dopo, eccezione se il gesto non passa. `ts` lo fornisce il chiamante
 * (deterministico: qui non c'e orologio). Ritorna un log NUOVO.
 */
export function recordRelease(
  log: readonly AuctionEvent[],
  state: AuctionState,
  proposed: ProposedRelease,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = releaseFeasibility(state, proposed);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible release (${proposed.playerId} <- ${proposed.fantaTeamId}): ${feasibility.violations.join(", ")}`,
    );
  }
  const event: ReleaseEvent = {
    type: "RELEASE",
    seq: log.length > 0 ? log[log.length - 1]!.seq + 1 : 0,
    ts,
    playerId: proposed.playerId,
    fantaTeamId: proposed.fantaTeamId,
    creditsReturned: proposed.creditsReturned,
  };
  return appendEvent(log, event);
}

// ── SCAMBIO ─────────────────────────────────────────────────────────────────

/** Uno scambio che l'operatore vuole registrare, prima che diventi evento. */
export interface ProposedTrade {
  readonly teamAId: string;
  readonly teamBId: string;
  readonly fromA: readonly string[];
  readonly fromB: readonly string[];
  /** Conguaglio pagato da A a B; negativo se paga B. */
  readonly creditsAToB: number;
}

export type TradeViolation =
  | "unknown-team" // una delle due squadre non e al tavolo
  | "same-team" // A e B sono la stessa squadra: non e uno scambio
  | "empty-trade" // nessun giocatore e nessun conguaglio: non succede niente
  | "duplicate-player" // lo stesso playerId compare due volte nella proposta
  | "player-not-on-roster" // una delle due cede un giocatore che non ha
  | "role-overflow" // una delle due rose sfonderebbe 3P/9D/9C/7A in un ruolo
  | "credits-invalid" // il conguaglio non e un intero
  | "insufficient-budget" // il conguaglio manderebbe un budget sotto zero
  | "breaks-hard-reserve"; // dopo lo scambio una rosa non e piu completabile a COST_FLOOR

export interface TradeFeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly TradeViolation[];
}

/**
 * LA GUARDIA E SUL RISULTATO, NON SULLA FORMA (decisione di Pico, 2026-08-30).
 *
 * Non si chiede che lo scambio sia uno-a-uno ne che i ruoli combacino: si
 * simula lo stato che ne uscirebbe e si rifiuta solo se quello stato e
 * impossibile. Tre cose lo rendono impossibile, e sono le stesse tre che
 * governano un acquisto:
 *
 *  1. IL CONTEGGIO PER RUOLO. LEAGUE_RULES.md §8 dice «mantenendo sempre la
 *     rosa 3P/9D/9C/7A»: nessuna delle due puo superare il tetto di un ruolo.
 *     Restare SOTTO e invece normale — a meta asta ogni rosa e sotto.
 *  2. IL BUDGET. Il conguaglio non puo portare nessuno dei due sotto zero.
 *  3. LA RISERVA DURA. Dopo lo scambio ogni casella ancora vuota deve restare
 *     riempibile a COST_FLOOR, esattamente come dopo un acquisto: una rosa che
 *     non si puo completare non e uno scambio audace, e un vicolo cieco.
 *
 * Ogni violazione trovata viene riportata, non solo la prima: la schermata
 * deve poter dire tutto quello che non va in una volta sola.
 */
export function tradeFeasibility(
  state: AuctionState,
  proposed: ProposedTrade,
): TradeFeasibilityResult {
  const teamA = state.teams[proposed.teamAId];
  const teamB = state.teams[proposed.teamBId];
  if (!teamA || !teamB) return { ok: false, violations: ["unknown-team"] };
  if (proposed.teamAId === proposed.teamBId) return { ok: false, violations: ["same-team"] };

  const violations: TradeViolation[] = [];
  const all = [...proposed.fromA, ...proposed.fromB];
  if (all.length === 0 && proposed.creditsAToB === 0) violations.push("empty-trade");
  if (new Set(all).size !== all.length) violations.push("duplicate-player");

  // Le righe che si muovono, prese dalle rose vere: senza di loro non si
  // conosce ne il ruolo ne il prezzo, e senza quelli non si simula niente.
  const leaving = (
    team: AuctionState["teams"][string],
    playerIds: readonly string[],
  ): { readonly entries: readonly { role: Role; price: number }[]; readonly missing: number } => {
    const entries: { role: Role; price: number }[] = [];
    let missing = 0;
    for (const playerId of playerIds) {
      const entry = team.roster.find((r) => r.playerId === playerId);
      if (entry === undefined) missing += 1;
      else entries.push({ role: entry.role, price: entry.price });
    }
    return { entries, missing };
  };

  const outA = leaving(teamA, proposed.fromA);
  const outB = leaving(teamB, proposed.fromB);
  if (outA.missing > 0 || outB.missing > 0) violations.push("player-not-on-roster");

  if (!Number.isInteger(proposed.creditsAToB)) {
    violations.push("credits-invalid");
  }

  // Da qui in giu si simula. Con righe mancanti o un conguaglio non intero la
  // simulazione girerebbe su numeri che non descrivono niente: si e gia detto
  // che cosa non va, e aggiungere violazioni derivate da un input rotto
  // significherebbe far leggere all'operatore conseguenze inventate.
  if (violations.length > 0) return { ok: false, violations };

  const after = (
    team: AuctionState["teams"][string],
    out: readonly { role: Role; price: number }[],
    incoming: readonly { role: Role; price: number }[],
    creditsPaid: number,
  ): { readonly overflow: boolean; readonly residual: number; readonly emptySlots: number } => {
    const filled: Record<Role, number> = { ...team.filled };
    for (const entry of out) filled[entry.role] -= 1;
    for (const entry of incoming) filled[entry.role] += 1;
    let overflow = false;
    let emptySlots = 0;
    for (const role of ROLES) {
      if (filled[role] > ROSTER_REQUIREMENTS[role]) overflow = true;
      emptySlots += Math.max(0, ROSTER_REQUIREMENTS[role] - filled[role]);
    }
    // Il budget si muove del SOLO conguaglio: i prezzi viaggiano con le righe
    // ma non sono crediti che cambiano di mano (vedi il registro in reduce.ts).
    return { overflow, residual: team.budgetResidual - creditsPaid, emptySlots };
  };

  const stateA = after(teamA, outA.entries, outB.entries, proposed.creditsAToB);
  const stateB = after(teamB, outB.entries, outA.entries, -proposed.creditsAToB);

  if (stateA.overflow || stateB.overflow) violations.push("role-overflow");
  if (stateA.residual < 0 || stateB.residual < 0) violations.push("insufficient-budget");
  else if (
    stateA.residual < stateA.emptySlots * COST_FLOOR ||
    stateB.residual < stateB.emptySlots * COST_FLOOR
  ) {
    violations.push("breaks-hard-reserve");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Contratto di registrazione dello scambio: `tradeFeasibility` prima, append
 * dopo, eccezione se il gesto non passa. Ritorna un log NUOVO.
 */
export function recordTrade(
  log: readonly AuctionEvent[],
  state: AuctionState,
  proposed: ProposedTrade,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = tradeFeasibility(state, proposed);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible trade (${proposed.teamAId} <-> ${proposed.teamBId}): ${feasibility.violations.join(", ")}`,
    );
  }
  const event: TradeEvent = {
    type: "TRADE",
    seq: log.length > 0 ? log[log.length - 1]!.seq + 1 : 0,
    ts,
    teamAId: proposed.teamAId,
    teamBId: proposed.teamBId,
    fromA: [...proposed.fromA],
    fromB: [...proposed.fromB],
    creditsAToB: proposed.creditsAToB,
  };
  return appendEvent(log, event);
}

// ── Rinnovo con il log gia avviato ────────────────────────────────────────────

/**
 * IL RINNOVO E UNA RICONFERMA, E UNA RICONFERMA SEMINA t=0. Questo non cambia:
 * `reduce()` la mette in rosa PRIMA di rigiocare il log, oggi come ieri.
 *
 * QUELLO CHE CAMBIA E CHI PUO DIRE DI NO. Fino al 2026-08-30 la schermata si
 * proteggeva con una riga sola — «il log non e vuoto, quindi niente rinnovi» —
 * e quella riga costava piu di quanto proteggesse: il primo inserimento
 * manuale scrive un PURCHASE, quindi chiudeva i rinnovi per sempre. Due gesti
 * della stessa modale, e uno uccideva l'altro senza dirlo.
 *
 * `validateConfirmations` non poteva sostituirla perche guarda le riconferme
 * FRA LORO, a t=0, e il log non lo vede: dice se un batch e coerente da solo,
 * non se regge sotto gli acquisti gia registrati. Le tre domande che restavano
 * senza risposta sono esattamente quelle che qui hanno un nome:
 *
 *  - il giocatore e gia in una rosa? seminarlo a t=0 produrrebbe il conflitto
 *    che `reduce()` rifiuta lanciando — e lanciare a schermata aperta, a meta
 *    asta, e il modo peggiore di scoprirlo;
 *  - il budget regge? le riconferme si validano contro `INITIAL_BUDGET`, ma
 *    dopo il log quel budget e gia stato speso in parte;
 *  - la rosa si chiude ancora a `COST_FLOOR`? stessa ragione.
 *
 * Il rifiuto lo dà quindi lo stato ricomposto per davvero, non una regola
 * riscritta a mano: si rigioca `reduce(log, riconferme)` PRIMA di salvare, e
 * si guarda che cosa ne esce. Se lanciasse comunque — non dovrebbe, le tre
 * domande sopra coprono i casi noti — `replay-refused` tiene la rete chiusa
 * invece di lasciar passare uno stato che nessuno ha ispezionato.
 */
export type RenewalViolation =
  | ConfirmationViolation // le regole di t=0, invariate: le decide validateConfirmations
  | "player-in-auction-log" // il log lo ha gia mosso: comprato, o comprato e svincolato
  | "budget-exhausted-by-log" // dopo gli acquisti registrati il budget non regge la riconferma
  | "role-slots-exhausted-by-log" // dopo gli acquisti registrati non c'e piu una casella di quel ruolo
  | "roster-not-completable" // la rosa non si chiuderebbe piu a COST_FLOOR
  | "replay-refused"; // reduce() ha rifiutato lo stato risultante — rete fail-closed

export interface RenewalFeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly RenewalViolation[];
}

/**
 * `confirmations` e il batch COMPLETO proposto, non la sola riga nuova: e lo
 * stesso contratto del pannello che lo chiama («ogni azione ricompone il
 * batch»), ed e l'unico che tiene veri per costruzione i limiti di ruolo e il
 * totale di squadra, invece che per attenzione di chi scrive il chiamante.
 */
/**
 * Ogni playerId che il log NOMINA in un evento non annullato. Non e «chi e in
 * rosa adesso»: e piu largo apposta, perche una riconferma vale da t=0 e
 * contraddice il log anche per un giocatore che l'asta ha solo attraversato.
 * Serve unicamente a scegliere il MOTIVO di un rifiuto che `reduce()` ha gia
 * deciso — mai a decidere il rifiuto al posto suo.
 */
function playerIdsTouchedByLog(log: readonly AuctionEvent[]): ReadonlySet<string> {
  const voided = new Set<number>();
  for (const e of log) if (e.type === "VOID") voided.add(e.targetSeq);

  const touched = new Set<string>();
  for (const e of log) {
    if (e.type === "VOID" || voided.has(e.seq)) continue;
    if (e.type === "PURCHASE" || e.type === "RELEASE") {
      touched.add(e.playerId);
    } else {
      for (const id of e.fromA) touched.add(id);
      for (const id of e.fromB) touched.add(id);
    }
  }
  return touched;
}

export function renewalFeasibility(
  log: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[],
  fantaTeamId: string,
): RenewalFeasibilityResult {
  const validation = validateConfirmations(confirmations, fantaTeamIds);
  if (!validation.ok) {
    // Deduplicate: due riconferme che rompono la stessa regola non devono
    // stampare due volte la stessa frase all'operatore.
    return { ok: false, violations: [...new Set(validation.issues.map((i) => i.violation))] };
  }

  // L'ORACOLO E `reduce()`, NON UNA COPIA DELLE SUE REGOLE. Rigiocare qui la
  // semantica dei VOID (un acquisto annullato non conta, uno scambio muove
  // due liste) significherebbe scriverla una seconda volta e tenerla allineata
  // a mano: la seconda copia sbaglierebbe per prima. Si chiede quindi al
  // motore, e si traduce il suo rifiuto in un motivo leggibile.
  let seeded: AuctionState;
  try {
    seeded = reduce(log, fantaTeamIds, confirmations);
  } catch {
    // UN CASO SOLO PORTA QUI, ed e piu ampio di «il giocatore e di qualcuno
    // adesso»: la riconferma vale da t=0, quindi contraddice il log anche
    // quando quel giocatore l'asta lo ha soltanto ATTRAVERSATO — comprato e
    // poi svincolato. Seminarlo prima dell'inizio renderebbe il suo stesso
    // acquisto irrappresentabile, e `reduce()` lancerebbe. Distinguere qui i
    // due casi non aiuterebbe chi legge: la strada e la stessa, e passa dallo
    // storico.
    const touched = playerIdsTouchedByLog(log);
    return {
      ok: false,
      violations: [
        confirmations.some((c) => touched.has(c.playerId))
          ? "player-in-auction-log"
          : "replay-refused",
      ],
    };
  }

  const team = seeded.teams[fantaTeamId];
  if (!team) return { ok: false, violations: ["unknown-team"] };

  const violations: RenewalViolation[] = [];
  if (team.budgetResidual < 0) violations.push("budget-exhausted-by-log");
  if (ROLES.some((r) => team.slotsRemaining[r] < 0)) {
    violations.push("role-slots-exhausted-by-log");
  } else if (team.budgetResidual >= 0 && team.budgetResidual < hardReserve(team.totalSlotsRemaining)) {
    // Solo con le caselle in ordine ha senso chiedere se la rosa si chiude:
    // un conteggio di slot negativo renderebbe la riserva un numero senza
    // significato, e la seconda frase coprirebbe la prima.
    violations.push("roster-not-completable");
  }

  return { ok: violations.length === 0, violations };
}
