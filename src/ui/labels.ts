// Role display labels — pure constants, no state/DOM coupling. Extracted
// from main.ts (Frontend Structure Foundation v1) so it's a plain,
// import-only dependency for any future UI module that needs a role label,
// with zero risk of a circular import back into main.ts.

import type { Role } from "../../packages/engine/src/types.js";

export const ROLE_LABELS: Record<Role, string> = {
  P: "Portieri",
  D: "Difensori",
  C: "Centrocampisti",
  A: "Attaccanti",
};

export const ROLE_LABEL_SING: Record<Role, string> = {
  P: "Portiere",
  D: "Difensore",
  C: "Centrocampista",
  A: "Attaccante",
};
