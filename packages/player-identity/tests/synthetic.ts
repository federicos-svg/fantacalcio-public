// FIXTURE SINTETICHE — e solo sintetiche.
//
// Nessun nome reale di giocatore entra in questo repository. I cognomi qui
// sotto sono inventati apposta per NON somigliare a nessuno: «Zurbetti»,
// «Vaschìn», «D'Orbeni», «Vamproni». Le squadre si chiamano ALFA, BETA e
// GAMMA, come nelle altre fixture del core.
//
// Le FORME, invece, sono quelle vere e sono il punto: un nome con l'accento e
// uno senza, un apostrofo scritto in due modi, un nome puntato contro un nome
// esteso, due omonimi nella stessa squadra. Una fixture che non somiglia alla
// realtà prova solo che il codice funziona su ciò che il codice si aspetta.

import {
  type DeclaredRoster,
  type RosterDeclaration,
  type SourcePlayerRecord,
  declareRoster,
} from "../src/declaredRoster.js";

export const TEAM_VOCABULARY = "squadre-sintetiche";
export const PLATFORM_IDENTIFIER_SPACE = "piattaforma-sintetica";
export const LISTONE_IDENTIFIER_SPACE = "listone-sintetico";

export function record(
  ref: string,
  displayName: string,
  teamKey: string | null = null,
  identifier: string | null = null,
): SourcePlayerRecord {
  return { ref, displayName, teamKey, identifier };
}

/**
 * Una lista dichiarata, con targa. `provenance` è finta come tutto il resto,
 * ma non è vuota: il modulo la pretende, e una fixture che la aggirasse
 * proverebbe qualcosa su un modulo diverso da quello che gira.
 */
export function roster(
  sourceId: string,
  records: readonly SourcePlayerRecord[],
  overrides: Partial<RosterDeclaration> = {},
): DeclaredRoster {
  return declareRoster({
    sourceId,
    provenance: `lettura sintetica della fonte ${sourceId}`,
    teamVocabulary: TEAM_VOCABULARY,
    identifierSpace: null,
    records,
    ...overrides,
  });
}

/** Le chiavi di un elenco, ordinate: per confrontare insiemi senza dipendere dall'ordine. */
export function refs(items: readonly { readonly ref: string }[]): readonly string[] {
  return [...items].map((item) => item.ref).sort();
}
