import type { Role } from "../packages/engine/src/types.js";

export const REQUIRED_ROLE_MESSAGE =
  "Ruolo obbligatorio: seleziona P, D, C o A. Senza ruolo non viene registrato alcun evento.";

export function requiredRoleError(role: Role | ""): string | null {
  return role === "" ? REQUIRED_ROLE_MESSAGE : null;
}
