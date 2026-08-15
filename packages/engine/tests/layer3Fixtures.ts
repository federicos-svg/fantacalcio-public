// Fixture sintetiche condivise dai test dello strato 3 del motore live
// (valori dichiarati, piano rosa vivo, radar occasioni, schermata chiamata).
//
// NON è un file di test (non matcha la glob `*.test.ts` di Vitest): estende
// `layer2Fixtures.ts` con i soli ingredienti nuovi dello strato 3. Zero dati
// reali — nomi giocatore sintetici, valori dichiarati inventati per il test e
// mai copiati da un listino o da un foglio di Owner.

import {
  type DeclaredPlayerValue,
  type DeclaredRolePlan,
  type Role,
  declaredValueBook,
  type DeclaredValueBook,
} from "../src/index.js";

export function value(playerId: string, declaredValue: number): DeclaredPlayerValue {
  return { playerId, declaredValue };
}

export function valueBookOf(values: readonly DeclaredPlayerValue[]): DeclaredValueBook {
  return declaredValueBook(values);
}

/** Un piano dichiarato con i quattro target, versione fissa per i test. */
export function plan(
  targets: Partial<Record<Role, number>>,
  planVersion = "test-plan-1",
): DeclaredRolePlan {
  return {
    planVersion,
    targets: {
      P: targets.P ?? 0,
      D: targets.D ?? 0,
      C: targets.C ?? 0,
      A: targets.A ?? 0,
    },
  };
}
