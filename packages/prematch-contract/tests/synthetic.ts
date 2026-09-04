// FIXTURE SINTETICHE — e solo sintetiche.
//
// Nessun dato reale entra in questo repository: le squadre si chiamano «Alfa» e
// «Beta», i giocatori sono lettere e numeri, gli istanti sono inventati. Le
// forme, invece, sono quelle misurate il 2026-09-04 sulle pagine autorizzate —
// una formazione per squadra, panchina, sostituzioni senza minuto, modulo,
// allenatore, arbitro — perché una fixture che non somiglia alla realtà prova
// solo che il codice funziona su ciò che il codice si aspetta.

export function syntheticPlayer(name: string, shirt: number | null = null): Record<string, unknown> {
  return {
    displayName: name,
    shirtNumber: shirt === null ? { presence: "absent-in-source" } : { presence: "observed", value: shirt },
    role: { presence: "not-observed" },
  };
}

export function syntheticEleven(prefix: string): readonly Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i <= 11; i += 1) out.push(syntheticPlayer(`${prefix} ${String(i)}`, i));
  return out;
}

/**
 * Una lista con la sua dichiarazione di completezza. Il valore di riferimento è
 * `unknown`, perché è quello che una pagina che non dichiara niente produce: le
 * fixture non devono essere più generose della realtà.
 */
export function syntheticRoster(
  players: readonly Record<string, unknown>[],
  completeness: string = "unknown",
): Record<string, unknown> {
  return { players, completeness };
}

export function syntheticProvenance(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "testata sintetica",
    page: "pagina della partita",
    observedAt: "2026-09-04T18:00:00+02:00",
    matchday: { origin: "declared-by-source", number: 2 },
    ...overrides,
  };
}

export function syntheticLineup(
  team: string,
  nature: "probable" | "actual",
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    team,
    nature,
    module: { presence: "observed", value: "4-3-3" },
    coach: { presence: "observed", value: `Allenatore ${team}` },
    starters: { presence: "observed", value: syntheticRoster(syntheticEleven(team), "declared-complete") },
    bench: { presence: "observed", value: syntheticRoster([syntheticPlayer(`${team} 12`, 12)]) },
    // Il minuto non c'è: è ciò che la pagina partita osservata NON espone.
    substitutions: {
      presence: "observed",
      value: [{ off: `${team} 11`, on: `${team} 12`, minute: { presence: "absent-in-source" } }],
    },
    unavailable: { presence: "not-observed" },
    suspended: { presence: "not-observed" },
    duels: { presence: "not-observed" },
    completeness: "unknown",
    ...overrides,
  };
}

export function syntheticMatchPage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provenance: syntheticProvenance(),
    home: syntheticLineup("Alfa", "actual"),
    away: syntheticLineup("Beta", "actual"),
    kickOff: { presence: "observed", value: "2026-09-04T20:45:00+02:00" },
    referee: { presence: "observed", value: "Arbitro Sintetico" },
    ...overrides,
  };
}
