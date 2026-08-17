// Ordinamenti SINTETICI per le fasce d'asta (packages/engine/src/tiers.ts).
//
// Nessun valore di appetibilità reale vive qui e non deve mai viverci: i
// punteggi dell'indice sono dato privato (docs/DECISIONS.md §"Eccezioni
// operative scritte", 2026-08-16, condizione 3) e questo repository resta a
// sole fixture sintetiche. Gli id sono quelli del pool sintetico di
// `synthetic.ts` (`P1…P10`, `D1…D30`, `C1…C30`, `A1…A20`) e l'«ordine di
// appetibilità» è semplicemente l'ordine numerico degli id — una convenzione
// di test, non una misura.

import type { AppealOrdering, AppealOrderProvenance, RoleAppealOrder } from "../src/tiers.js";
import { APPEAL_ORDER_TIE_BREAK } from "../src/tiers.js";
import type { Role } from "../src/types.js";
import { syntheticPool } from "./synthetic.js";

/** Provenienza dichiarata delle fixture: dice a voce alta di essere finta. */
export const SYNTHETIC_ORDER_PROVENANCE: AppealOrderProvenance = {
  source: "fixture-sintetica",
  recipe: "FIXTURE-ORDER@1.0.0",
  tieBreak: APPEAL_ORDER_TIE_BREAK,
};

/** `idsOf("C", 1, 8)` → `["C1", …, "C8"]`. Solo generazione di id, nessun dato. */
export function idsOf(role: Role, from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i += 1) out.push(`${role}${i}`);
  return out;
}

/** Impacchetta uno o più ruoli in un `AppealOrdering` con la provenienza data. */
export function orderingOf(
  roles: readonly RoleAppealOrder[],
  provenance: AppealOrderProvenance = SYNTHETIC_ORDER_PROVENANCE,
): AppealOrdering {
  return { provenance, roles };
}

/**
 * L'ordinamento sintetico completo sul pool di `syntheticPool()`: tutti e
 * quattro i ruoli, ciascuno nell'ordine numerico degli id.
 *
 * Nota per chi legge i test: il pool sintetico è CORTO rispetto al
 * regolamento (10 P, 30 D, 30 C, 20 A contro fasce da 8 × 3/9/9/7), quindi
 * qui nessun ruolo ha fondo e l'ultima fascia piena è parziale. È il caso
 * «listone corto» del vero repository pubblico, non una svista.
 */
export function syntheticAppealOrdering(): AppealOrdering {
  const pool = syntheticPool();
  const roles: RoleAppealOrder[] = (["P", "D", "C", "A"] as const).map((role) => ({
    role,
    playerIds: pool.filter((p) => p.role === role).map((p) => p.playerId),
  }));
  return orderingOf(roles);
}
