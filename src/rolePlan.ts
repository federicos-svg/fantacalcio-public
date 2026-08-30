// IL PIANO ROSA DI OWNER — la dichiarazione, e la sua lettura allo stato
// corrente. `PLAN-01` di docs/AUCTION_2026_EXECUTION_PLAN.md §4.1, lato app.
//
// COSA C'È QUI, e perché è QUI e non nel motore. Il motore
// (packages/engine/src/livePlan.ts) espone già il piano vivo per intero —
// `DeclaredRolePlan`, `LivePlan`, `validateRolePlan()`, l'aritmetica di
// riallocazione dichiarata riga per riga — ed è completo e testato. Quello che
// mancava non era il calcolo: mancava il pezzo di app che RACCOGLIE la
// dichiarazione di Owner, la conserva, e decide che cosa si può onestamente
// mostrare quando quella dichiarazione non c'è ancora tutta. Questo modulo è
// quel pezzo, e non ricalcola nulla di ciò che il motore calcola già.
//
// LA DIFFERENZA CHE QUESTO MODULO ESISTE PER TENERE IN PIEDI.
// `DeclaredRolePlan.targets` è `Record<Role, number>`: quattro ruoli, quattro
// numeri, obbligatori. È la forma giusta per il MOTORE — un piano si calcola
// solo quando c'è tutto — ma non sa dire la differenza fra le due frasi che a
// un'asta portano a due offerte diverse:
//
//   «sul portiere NON HO ANCORA DECISO»   -> non so quanto ci metterò
//   «sul portiere HO DECISO ZERO»         -> non ci metto niente, il minimo
//
// Il secondo è un piano vero, e il motore lo esegue: target 0 significa che la
// riallocazione non manda crediti a quel ruolo («se lui non ha destinato nulla
// a un ruolo, la riallocazione non gliene manda», livePlan.ts) e il ruolo resta
// alla sola riserva dura. Il primo non è un piano: è un buco. Passare il buco
// al motore come 0 lo trasformerebbe nella seconda frase — e la schermata
// direbbe a Owner, con la faccia seria di un numero, una decisione che lui non
// ha preso.
//
// Quindi: la dichiarazione vive QUI in forma PARZIALE (`RolePlanDraft`, chiave
// assente = ruolo non dichiarato), e attraversa il confine verso il motore solo
// quando è completa. Finché non lo è, `rolePlanReading()` restituisce i FATTI
// MISURATI (che non dipendono dal piano: da `budgetPlan()` e da `TeamState`) e
// dichiara il buco per quello che è. Nessun ripiego, nessun default, nessun
// valore di comodo — la stessa «regola delle frasi oneste» di
// src/ui/roleDepletion.ts: un dato che manca non diventa uno zero, diventa una
// frase che dice QUALE dei silenzi è.
//
// IL MOTORE NON È STATO TOCCATO. Aggiungere `Partial` ai suoi target sarebbe
// stata una modifica di contratto, e un contratto non si cambia da un pannello:
// il limite è riportato, non aggirato (vedi il corpo della PR).
//
// NIENTE OUTPUT DIRETTIVO (docs/NO_GO.md §Prodotto). Qui non si produce nessun
// valore, nessun prezzo, nessuna banda, nessun consiglio d'acquisto: i target
// sono INPUT DICHIARATO DI OWNER, i residui e gli scostamenti sono aritmetica
// dichiarata del motore su quell'input più i fatti del log. Il sistema non
// propone un piano, non corregge un piano e non ne suggerisce uno.
//
// NON C'È PIÙ UN MODULO CHE RACCOGLIE LA DICHIARAZIONE. Il pannello PIANO ROSA
// e la sua persistenza sono stati rimossi: resta la sola LETTURA, che oggi
// riceve `null` da ogni chiamante vivo e risponde «nessun piano dichiarato».
// La forma parziale e i tre esiti restano perché sono il contratto che
// src/perMeCandidates.ts legge, e perché il giorno in cui una dichiarazione
// tornerà da qualche parte non deve tornare anche l'ambiguità fra «zero» e
// «non deciso».

import { budgetPlan } from "../packages/engine/src/budget.js";
import {
  type DeclaredRolePlan,
  type LivePlan,
  type RolePlanIssue,
  livePlan,
  validateRolePlan,
} from "../packages/engine/src/livePlan.js";
import { INITIAL_BUDGET, ROLES, type Role, type TeamState } from "../packages/engine/src/types.js";

/**
 * LA DICHIARAZIONE DI OWNER, parziale per costruzione.
 *
 * `targets[r] === undefined` significa **ruolo non dichiarato**, e non è
 * intercambiabile con `targets[r] === 0`. Il tipo è `Partial` apposta: se fosse
 * `Record<Role, number>` la distinzione non sarebbe esprimibile e il buco
 * dovrebbe essere inventato da qualcuno — che è esattamente il difetto.
 *
 * `planVersion` è parte della dichiarazione, non un decoro: §4.1 impone che
 * ogni spiegazione indichi il `plan_version` usato, e il motore rifiuta un
 * piano senza versione (`plan-version-empty`). Un piano dichiarato senza
 * versione qui resta INCOMPLETO, non viene battezzato con una versione
 * generata dall'app: la versione è una cosa che Owner scrive.
 */
export interface RolePlanDraft {
  readonly planVersion: string;
  readonly targets: Readonly<Partial<Record<Role, number>>>;
}

/**
 * Che cosa manca perché la dichiarazione sia un piano.
 *
 * Sono due silenzi diversi e portano a due frasi diverse a schermo, per lo
 * stesso motivo per cui i due silenzi di roleDepletion.ts non si fondono.
 */
export type RolePlanGap =
  | { readonly kind: "role-undeclared"; readonly role: Role }
  | { readonly kind: "plan-version-missing" };

/** Il target di un ruolo, o l'assenza del target. Mai un numero al posto del buco. */
export type DeclaredTarget =
  | { readonly kind: "declared"; readonly target: number }
  | { readonly kind: "undeclared" };

/**
 * I numeri che SOLO un piano completo produce. Vengono dal motore così come
 * sono (`RolePlanLine`), non ricalcolati: `spent`, `residualTarget` e
 * `overspend` sono campi di `livePlan()`, non aritmetica di questo file.
 */
export interface RolePlanNumbers {
  readonly spent: number;
  readonly residualTarget: number;
  readonly overspend: number;
  readonly allocation: number;
  readonly reallocated: number;
  readonly closed: boolean;
}

/**
 * Una riga di ruolo a schermo.
 *
 * `slotsFilled`/`slotsRemaining`/`minReserve`/`maxAllocatable` sono FATTI
 * MISURATI: vengono da `TeamState` e da `budgetPlan()`, esistono anche senza
 * nessun piano dichiarato e si mostrano sempre. Il pannello non tace su ciò che
 * sa perché gli manca altro.
 *
 * `plan` è `null` ogni volta che un piano completo e valido non c'è. È il campo
 * che rende impossibile, per costruzione, che un piano assente produca un
 * numero: non esiste un ramo in cui `plan` sia popolato senza che il motore
 * l'abbia calcolato.
 */
export interface RolePlanRow {
  readonly role: Role;
  readonly declared: DeclaredTarget;
  readonly slotsFilled: number;
  readonly slotsRemaining: number;
  readonly minReserve: number;
  readonly maxAllocatable: number;
  readonly plan: RolePlanNumbers | null;
}

/**
 * La lettura del piano allo stato corrente. Quattro esiti, e il caso normale
 * prima dell'asta è uno dei primi due.
 *
 *  - `absent`   — non è stato dichiarato niente del tutto;
 *  - `incomplete` — qualcosa è stato dichiarato, ma non tutto: si dice CHE COSA
 *    manca, ruolo per ruolo, e i ruoli già dichiarati restano scritti come Owner
 *    li ha scritti (zero compreso);
 *  - `invalid`  — la dichiarazione è completa ma il motore la rifiuta
 *    (`validateRolePlan`): si riportano le violazioni sue, non una diagnosi di
 *    questo file;
 *  - `live`     — il piano vivo del motore, per intero.
 */
export type RolePlanReading =
  | { readonly kind: "absent"; readonly rows: readonly RolePlanRow[] }
  | {
      readonly kind: "incomplete";
      readonly rows: readonly RolePlanRow[];
      readonly gaps: readonly RolePlanGap[];
      readonly planVersion: string;
    }
  | {
      readonly kind: "invalid";
      readonly rows: readonly RolePlanRow[];
      readonly issues: readonly RolePlanIssue[];
      readonly planVersion: string;
    }
  | { readonly kind: "live"; readonly rows: readonly RolePlanRow[]; readonly live: LivePlan };

/**
 * Il tetto che il motore impone alla somma dei target (`validateRolePlan`:
 * `total-exceeds-initial-budget`). Ri-esportato perché il campo di
 * dichiarazione possa dirlo a Owner PRIMA che il motore rifiuti, senza che
 * nessuna superficie riscriva 500 a mano.
 */
export const ROLE_PLAN_TOTAL_CAP = INITIAL_BUDGET;

function declaredTargetOf(draft: RolePlanDraft | null, role: Role): DeclaredTarget {
  const target = draft?.targets[role];
  return target === undefined ? { kind: "undeclared" } : { kind: "declared", target };
}

/**
 * Legge il piano allo stato corrente della squadra.
 *
 * Puro e deterministico: stesso `TeamState` + stessa dichiarazione -> stessa
 * lettura. Non lancia mai — `livePlan()` lancia su un piano invalido, e per
 * questo la validazione avviene PRIMA e il ramo `invalid` esiste: la schermata
 * di un'asta non può permettersi un'eccezione al posto di un pannello.
 */
export function rolePlanReading(team: TeamState, draft: RolePlanDraft | null): RolePlanReading {
  const envelope = budgetPlan(team);

  const gaps: RolePlanGap[] = [];
  for (const role of ROLES) {
    if (draft?.targets[role] === undefined) gaps.push({ kind: "role-undeclared", role });
  }
  const planVersion = draft?.planVersion.trim() ?? "";
  if (planVersion.length === 0) gaps.push({ kind: "plan-version-missing" });

  /** Le righe SENZA numeri di piano: solo fatti misurati più l'eco di ciò che
   *  Owner ha dichiarato. `plan: null` è la sola resa possibile qui. */
  const measuredRows = (): readonly RolePlanRow[] =>
    ROLES.map((role) => ({
      role,
      declared: declaredTargetOf(draft, role),
      slotsFilled: team.filled[role],
      slotsRemaining: team.slotsRemaining[role],
      minReserve: envelope.perRole[role].minReserve,
      maxAllocatable: envelope.perRole[role].maxAllocatable,
      plan: null,
    }));

  if (draft === null || gaps.length === ROLES.length + 1) {
    return { kind: "absent", rows: measuredRows() };
  }
  if (gaps.length > 0) {
    return { kind: "incomplete", rows: measuredRows(), gaps, planVersion };
  }

  // Da qui in poi la dichiarazione è completa: tutti e quattro i target esistono
  // e la versione c'è. Solo adesso ha una forma che il motore accetta.
  const declared: DeclaredRolePlan = {
    planVersion,
    targets: {
      P: draft.targets.P!,
      D: draft.targets.D!,
      C: draft.targets.C!,
      A: draft.targets.A!,
    },
  };

  const validation = validateRolePlan(declared);
  if (!validation.ok) {
    return { kind: "invalid", rows: measuredRows(), issues: validation.issues, planVersion };
  }

  const live = livePlan({ team, plan: declared });
  const rows: readonly RolePlanRow[] = ROLES.map((role) => {
    const line = live.perRole[role];
    return {
      role,
      declared: { kind: "declared", target: line.declaredTarget },
      slotsFilled: line.slotsFilled,
      slotsRemaining: line.slotsRemaining,
      minReserve: line.minReserve,
      maxAllocatable: line.maxAllocatable,
      plan: {
        spent: line.spent,
        residualTarget: line.residualTarget,
        overspend: line.overspend,
        allocation: line.allocation,
        reallocated: line.reallocated,
        closed: line.closed,
      },
    };
  });

  return { kind: "live", rows, live };
}
