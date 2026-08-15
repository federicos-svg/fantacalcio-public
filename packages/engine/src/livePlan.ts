// PIANO ROSA VIVO — «IL MIO PIANO (vivo)» di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §4.2, riga 3 di §8 («piano vivo +
// radar occasioni»). Puro, deterministico, engine-only.
//
// LA DECISIONE DI PRODOTTO CHE QUESTO MODULO ESEGUE (D8, ripresa dal design
// §4.2): «nessun PLAN-01 esterno, il piano vive nell'app». L'allocazione per
// ruolo è **ricalcolata a ogni assegnazione**, come un navigatore dopo una
// svolta sbagliata: non esiste un piano congelato a inizio asta che poi
// diverge dalla realtà, esiste una funzione pura dello stato corrente.
//
// I DUE INGREDIENTI, e nient'altro (§D9):
//  1. FATTI MISURATI — `TeamState` derivato dall'event log: speso per ruolo,
//     slot residui, budget residuo, riconferme già dentro (reduce.ts);
//  2. INPUT DICHIARATO DI OWNER — `DeclaredRolePlan`, i crediti che lui
//     assegna a ciascun ruolo. Il sistema non li propone e non li corregge.
// L'aritmetica di riallocazione qui sotto è dichiarata per intero e non
// contiene nessun peso proprio: le proporzioni con cui i crediti liberati si
// spostano sono le proporzioni del piano DI OWNER, non un peso scelto dal
// sistema.
//
// COSA NON C'È, di proposito:
//  - **nessuna «fascia»** (A1/A2/…) nell'allocazione, benché il design la
//    nomini: una fascia è un raggruppamento che il sistema sceglierebbe da sé
//    — lo stesso motivo per cui cliff.ts non ne ha. Se Owner dichiarerà le sue
//    fasce, entreranno come input dichiarato, non come invenzione;
//  - **nessun suggerimento di spesa**: il piano dice quanto RESTA allocato a
//    un ruolo, mai «compra qui». La matrice UI è esplicita: «Piano Owner:
//    target/riserve/scostamenti/fattibilità → nessun suggerimento di valore»;
//  - **nessun tetto morbido su `max_safe`**: l'allocazione è un piano, non un
//    vincolo duro. `maxSafe()` resta l'unico limite hard-safe (D4) e questo
//    modulo non lo tocca né lo riderivà.

import { type Role, type TeamState, COST_FLOOR, INITIAL_BUDGET, ROLES } from "./types.js";
import { type BudgetPlan, budgetPlan } from "./budget.js";

/**
 * Il piano dichiarato da Owner: quanti crediti destina a ciascun ruolo.
 *
 * `planVersion` è trasportata perché `docs/AUCTION_2026_EXECUTION_PLAN.md`
 * §4.1 lo richiede («ogni spiegazione di sacrificio indica il `plan_version`
 * usato»): un numero del piano senza la versione del piano che lo ha prodotto
 * non è ispezionabile a posteriori.
 */
export interface DeclaredRolePlan {
  readonly planVersion: string;
  readonly targets: Readonly<Record<Role, number>>;
}

export type RolePlanViolation =
  | "target-invalid" // non finito o negativo
  | "plan-version-empty" // un piano senza versione non è citabile in una spiegazione
  | "total-exceeds-initial-budget"; // la somma dei target supera la dotazione di lega

export interface RolePlanIssue {
  readonly role: Role | null;
  readonly violation: RolePlanViolation;
}

export interface RolePlanValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RolePlanIssue[];
}

/**
 * Validazione fail-closed del piano dichiarato, stesso contratto di
 * `validateAnchors`/`validateDeclaredValues`: pura, non lancia, riporta ogni
 * violazione.
 *
 * Il tetto è `INITIAL_BUDGET` e non il budget residuo di oggi: un piano si
 * dichiara PRIMA dell'asta, sulla dotazione di partenza. Che poi la spesa
 * reale lo abbia superato è uno scostamento da mostrare (`overspend`), non un
 * piano invalido da rifiutare a metà serata.
 */
export function validateRolePlan(plan: DeclaredRolePlan): RolePlanValidationResult {
  const issues: RolePlanIssue[] = [];
  if (plan.planVersion.length === 0) {
    issues.push({ role: null, violation: "plan-version-empty" });
  }
  let total = 0;
  for (const role of ROLES) {
    const target = plan.targets[role];
    if (!Number.isFinite(target) || target < 0) {
      issues.push({ role, violation: "target-invalid" });
      continue;
    }
    total += target;
  }
  if (issues.every((i) => i.violation !== "target-invalid") && total > INITIAL_BUDGET) {
    issues.push({ role: null, violation: "total-exceeds-initial-budget" });
  }
  return { ok: issues.length === 0, issues };
}

/** Su quale base la riallocazione ha ripartito i crediti, dichiarata nel dato. */
export type ReallocationBasis =
  | "declared-residual-targets" // proporzionale ai target residui dichiarati da Owner
  | "hard-floor-only" // piano esaurito sui ruoli aperti: resta la sola riserva dura
  | "roster-complete"; // nessuno slot residuo: non c'è più niente da allocare

/** Una riga del piano vivo: un ruolo, i suoi fatti e la sua allocazione. */
export interface RolePlanLine {
  readonly role: Role;
  /** Crediti dichiarati da Owner per questo ruolo (input, mai ricalcolato). */
  readonly declaredTarget: number;
  /** Speso davvero nel ruolo, riconferme incluse — fatto misurato. */
  readonly spent: number;
  readonly slotsFilled: number;
  readonly slotsRemaining: number;
  /** `max(0, declaredTarget − spent)`: quanto il piano dichiarato destina ancora al ruolo. */
  readonly residualTarget: number;
  /** `max(0, spent − declaredTarget)`: lo scostamento spesa-piano, mai nascosto. */
  readonly overspend: number;
  /** Riserva dura del ruolo (slot residui al floor) — da `budgetPlan`. */
  readonly minReserve: number;
  /** Tetto strutturale del ruolo (lascia fillabili gli altri slot) — da `budgetPlan`. */
  readonly maxAllocatable: number;
  /** L'allocazione VIVA dopo la riallocazione. Intera, mai sotto `minReserve`. */
  readonly allocation: number;
  /** `allocation − residualTarget`: quanto la riallocazione ha spostato su questo ruolo. */
  readonly reallocated: number;
  /** `allocation / slotsRemaining`, o `null` a ruolo completo. */
  readonly perSlotHeadroom: number | null;
  /** Il ruolo è chiuso (nessuno slot residuo)? I suoi crediti residui sono liberati. */
  readonly closed: boolean;
}

/**
 * Il piano rosa vivo di UNA squadra (la propria) allo stato corrente.
 *
 * `unallocated` è il «budget libero vero» della plancia (§4.2): i crediti
 * residui che né la riserva dura né l'allocazione di piano stanno impegnando.
 * È un residuo VISIBILE per costruzione — le allocazioni si arrotondano per
 * difetto e ciò che avanza finisce qui, invece di essere spalmato con una
 * regola di resto che nessuno ha dichiarato.
 *
 * Con la rosa NON completabile (`isCompletable === false`) `unallocated`
 * diventa negativo e vale esattamente `−budgetShortfall`: le allocazioni
 * restano alla sola riserva dura, che è già più di quanto resti in cassa. È lo
 * scoperto mostrato com'è, non un piano rimpicciolito fino a farlo sembrare
 * sostenibile.
 */
export interface LivePlan {
  readonly fantaTeamId: string;
  readonly planVersion: string;
  readonly budgetResidual: number;
  readonly totalSlotsRemaining: number;
  /** Somma delle riserve dure: da `budgetPlan`, non riderivata. */
  readonly totalReserve: number;
  readonly isCompletable: boolean;
  readonly budgetShortfall: number;
  readonly perRole: Readonly<Record<Role, RolePlanLine>>;
  /** Crediti liberati dai ruoli chiusi e ridistribuiti ai ruoli ancora aperti. */
  readonly freedByClosedRoles: number;
  readonly unallocated: number;
  readonly reallocationBasis: ReallocationBasis;
  /**
   * True quando il piano dichiarato chiede più crediti di quanti ne restino
   * sopra la riserva dura, e la ripartizione è stata scalata per rientrare.
   * Un piano non si «rompe» a metà asta: si dichiara che è stato compresso.
   */
  readonly overCommitted: boolean;
}

export interface LivePlanInput {
  readonly team: TeamState;
  readonly plan: DeclaredRolePlan;
}

/**
 * ARITMETICA DICHIARATA DELLA RIALLOCAZIONE, per intero:
 *
 * ```text
 * residualTarget[r] = max(0, declaredTarget[r] − spent[r])
 * closed[r]         = slotsRemaining[r] === 0
 * freed             = Σ residualTarget[r] per r chiusi
 * demand            = Σ residualTarget[r] per r aperti
 * raw[r]            = residualTarget[r] + freed × residualTarget[r] / demand   (r aperto)
 * floor[r]          = minReserve[r]                            (riserva dura del ruolo)
 * above[r]          = max(0, raw[r] − floor[r])
 * scale             = min(1, freeBudget / Σ above[r])          (freeBudget da budgetPlan)
 * allocation[r]     = floor[r] + ⌊above[r] × scale⌋
 * unallocated       = budgetResidual − Σ allocation[r]
 * ```
 *
 * Le tre proprietà che questa forma garantisce, e per cui è scritta così:
 *
 *  1. **nessun peso del sistema** — i crediti liberati si spostano in
 *     proporzione ai target residui DI OWNER. Se lui non ha destinato nulla a
 *     un ruolo, la riallocazione non gliene manda;
 *  2. **la rosa resta completabile** — ogni allocazione parte dalla riserva
 *     dura del ruolo, quindi nessuna riallocazione può rendere impossibile
 *     riempire uno slot obbligatorio (stessa invariante di `maxSafe`, che
 *     resta comunque l'unico limite hard-safe e non è toccato qui);
 *  3. **niente crediti inventati** — finché la rosa è completabile la somma
 *     delle allocazioni non supera il budget residuo e l'avanzo resta visibile
 *     in `unallocated`; quando non lo è, `unallocated` va in negativo e mostra
 *     lo scoperto invece di nasconderlo (vedi `LivePlan`).
 *
 * `demand === 0` con slot ancora aperti (piano esaurito) NON produce una
 * ripartizione di ripiego: `basis` diventa `hard-floor-only`, ogni ruolo tiene
 * la sola riserva dura e tutto il resto è `unallocated`. Il sistema non
 * ridistribuisce da sé un piano che Owner non ha più dichiarato.
 *
 * Deterministico: stesso `TeamState` + stesso piano → stesso risultato.
 * Lancia su un piano invalido (`validateRolePlan`), come `anchorBook`.
 */
export function livePlan(input: LivePlanInput): LivePlan {
  const { team, plan } = input;
  const validation = validateRolePlan(plan);
  if (!validation.ok) {
    throw new Error(
      `invalid role plan: ${validation.issues
        .map((i) => `${i.role ?? "plan"}:${i.violation}`)
        .join(", ")}`,
    );
  }

  const envelope: BudgetPlan = budgetPlan(team);

  // Lo speso per ruolo si legge dal roster derivato, quindi include le
  // RICONFERME (seq < 0, LEAGUE_RULES §4) ai prezzi dell'anno scorso. È
  // corretto e voluto: un target di ruolo copre tutti gli slot di quel ruolo, e
  // i crediti delle riconferme sono già usciti dal budget prima della prima
  // chiamata. Escluderli farebbe apparire disponibile un piano già speso.
  // (Diverso dall'inflazione misurata, che quei prezzi li scarta di proposito:
  // lì si misura il mercato di STASERA — vedi `settledPurchases` in anchors.ts.)
  const spentByRole = { P: 0, D: 0, C: 0, A: 0 } as Record<Role, number>;
  for (const entry of team.roster) spentByRole[entry.role] += entry.price;

  const residualTarget = {} as Record<Role, number>;
  let freed = 0;
  let demand = 0;
  for (const role of ROLES) {
    const residual = Math.max(0, plan.targets[role] - spentByRole[role]);
    residualTarget[role] = residual;
    if (team.slotsRemaining[role] === 0) freed += residual;
    else demand += residual;
  }

  const raw = {} as Record<Role, number>;
  let aboveTotal = 0;
  for (const role of ROLES) {
    const open = team.slotsRemaining[role] > 0;
    const share = open && demand > 0 ? residualTarget[role] + (freed * residualTarget[role]) / demand : 0;
    raw[role] = open ? share : 0;
    aboveTotal += Math.max(0, share - envelope.perRole[role].minReserve);
  }

  const scale = aboveTotal === 0 ? 0 : Math.min(1, envelope.freeBudget / aboveTotal);

  const perRole = {} as Record<Role, RolePlanLine>;
  let allocatedTotal = 0;
  for (const role of ROLES) {
    const roleEnvelope = envelope.perRole[role];
    const above = Math.max(0, raw[role] - roleEnvelope.minReserve);
    const allocation = roleEnvelope.minReserve + Math.floor(above * scale);
    allocatedTotal += allocation;
    const slotsRemaining = team.slotsRemaining[role];
    perRole[role] = {
      role,
      declaredTarget: plan.targets[role],
      spent: spentByRole[role],
      slotsFilled: team.filled[role],
      slotsRemaining,
      residualTarget: residualTarget[role],
      overspend: Math.max(0, spentByRole[role] - plan.targets[role]),
      minReserve: roleEnvelope.minReserve,
      maxAllocatable: roleEnvelope.maxAllocatable,
      allocation,
      reallocated: allocation - residualTarget[role],
      perSlotHeadroom: slotsRemaining === 0 ? null : allocation / slotsRemaining,
      closed: slotsRemaining === 0,
    };
  }

  const reallocationBasis: ReallocationBasis =
    team.totalSlotsRemaining === 0
      ? "roster-complete"
      : demand === 0
        ? "hard-floor-only"
        : "declared-residual-targets";

  return {
    fantaTeamId: team.fantaTeamId,
    planVersion: plan.planVersion,
    budgetResidual: team.budgetResidual,
    totalSlotsRemaining: team.totalSlotsRemaining,
    totalReserve: envelope.totalReserve,
    isCompletable: envelope.isCompletable,
    budgetShortfall: envelope.budgetShortfall,
    perRole,
    freedByClosedRoles: freed,
    unallocated: team.budgetResidual - allocatedTotal,
    reallocationBasis,
    // `aboveTotal === 0` non è un piano compresso: è un piano che non chiede
    // niente sopra la riserva dura (piano esaurito o rosa completa). Senza
    // questa condizione `scale === 0` lo marcherebbe come sfondato.
    overCommitted: aboveTotal > 0 && scale < 1,
  };
}

/**
 * Il piano copre ancora, da solo, il prezzo `price` in quel ruolo?
 *
 * È il «fit col piano» che il radar occasioni (opportunities.ts) e la
 * schermata chiamata (callScreen.ts) usano per dire se un candidato sta dentro
 * il piano o lo sfonda. Fatto contabile secco: NON è un consiglio, non è un
 * veto, e non ha nessuna autorità su `maxSafe` — un prezzo fuori piano resta
 * comprabile se il budget lo consente; semplicemente si sa che sfora.
 *
 * `COST_FLOOR` entra come minimo perché un giocatore non si compra a 0.
 */
export function fitsPlan(line: RolePlanLine, price: number): boolean {
  if (line.slotsRemaining <= 0) return false;
  if (!Number.isFinite(price)) return false;
  const effective = Math.max(COST_FLOOR, price);
  // Il resto degli slot del ruolo deve restare riempibile al floor: allocare
  // tutto a un solo giocatore lascerebbe il ruolo senza crediti per gli altri.
  return effective + (line.slotsRemaining - 1) * COST_FLOOR <= line.allocation;
}
