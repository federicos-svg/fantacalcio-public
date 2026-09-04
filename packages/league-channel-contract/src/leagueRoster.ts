// LE ALTRE SQUADRE DELLA LEGA, E L'AVVERSARIO DI QUESTA GIORNATA.
//
// Perché sta nel contratto e non accanto. Le rose avversarie e l'avversario di
// giornata sono **osservazioni della lega**, esattamente come la rosa propria e
// il calendario: hanno la stessa provenienza, la stessa incertezza e le stesse
// regole di dichiarazione. Metterle in una struttura a lato — un tipo comodo
// vicino alla schermata che le mostra — significherebbe avere due posti in cui
// vive la stessa idea, e il secondo non erediterebbe nessuna delle garanzie
// scritte qui: nessun campo inventato, nessun elenco vuoto al posto di un dato
// mancante, nessuna deduzione dal nome.
//
// LA DISTINZIONE CHE QUESTO FILE ESISTE PER TENERE. «Squadra elencata» e «rosa
// osservata» sono due fatti diversi e vanno rappresentati diversamente:
//
//   * la lega elenca le sue squadre — id e nome — e questo si osserva
//     leggendo l'elenco;
//   * la ROSA di una di quelle squadre è un'altra lettura, che può non essere
//     stata fatta, o non essere stata concessa.
//
// Per questo `roster` è `ObservedTeam | null` e **`null` non è una rosa vuota**:
// una rosa vuota dice «quella squadra non ha giocatori», che è falso e sarebbe
// creduto. `null` dice «non l'abbiamo letta», che è la verità e si può mostrare.
// Non esiste, e non deve nascere, un ripiego che trasformi il secondo nel primo.
//
// L'AVVERSARIO NON SI INDOVINA DAL CALENDARIO: si estrae dalla coppia
// (competizione, giornata), che è la chiave di una sfida — in una giornata di
// coppa se ne giocano due, con due avversari diversi, e una funzione che
// rispondesse «l'avversario della giornata 5» senza dire di quale competizione
// darebbe la risposta sbagliata la metà delle volte. `opponentForMatchday`
// pretende entrambi e non sceglie mai per conto di chi chiama.

import type { ObservedCalendar, ObservedVenue } from "./calendar.js";
import type { ObservedTeam } from "./roster.js";

/**
 * Una squadra della lega, come la lega la elenca.
 *
 * `name` opzionale perché «non osservato» esiste; `roster` `null` perché «non
 * letta» esiste, ed è diverso da «vuota».
 */
export interface ObservedLeagueTeam {
  /** Id opaco della squadra di lega. */
  readonly teamId: string;
  /** Etichetta osservata, se c'era. Mai costruita da qui. */
  readonly name?: string;
  /**
   * La rosa di quella squadra, quando è stata osservata. **`null` = non letta**,
   * mai «vuota»: le due cose non si confondono perché una è un'ignoranza e
   * l'altra un'affermazione.
   */
  readonly roster: ObservedTeam | null;
}

/** L'elenco delle squadre della lega, nell'ordine in cui la fonte le espone. */
export interface ObservedLeagueTeams {
  readonly teams: readonly ObservedLeagueTeam[];
}

/**
 * L'AVVERSARIO DI UNA GIORNATA, in una competizione dichiarata.
 *
 * `venue` è del nostro punto di vista, ed è la stessa che alimenta il fattore
 * campo di §14: non si deduce e non si ripiega su un valore comodo — una sfida
 * che non lo dichiara non produce un avversario, perché mezza informazione su
 * una partita porta a schierare per la partita sbagliata.
 */
export interface ObservedOpponent {
  readonly competitionId: string;
  readonly matchday: number;
  readonly teamId: string;
  readonly name?: string;
  readonly venue: ObservedVenue;
  /** La rosa dell'avversario, se osservata. `null` = non letta. */
  readonly roster: ObservedTeam | null;
}

/**
 * Perché l'avversario di questa giornata non si può dire.
 *
 * Sono cause distinte perché hanno rimedi distinti, e perché «non c'è partita»
 * e «la partita c'è ma non sappiamo con chi» sono due frasi che un lettore deve
 * poter distinguere.
 */
export type OpponentMissingCause =
  /** Il calendario non è stato osservato affatto. */
  | "calendario_non_letto"
  /** Il calendario non ha questa competizione. */
  | "competizione_assente"
  /** Nessuna sfida in quella giornata: in coppa è normale, non è un guasto. */
  | "nessuna_sfida"
  /** La sfida c'è ma non dichiara l'avversario. */
  | "avversario_non_dichiarato"
  /** La sfida c'è ma non dichiara dove si gioca: non si schiera al buio. */
  | "campo_non_dichiarato";

export type OpponentLookup =
  | { readonly trovato: true; readonly opponent: ObservedOpponent }
  | { readonly trovato: false; readonly cause: OpponentMissingCause };

/**
 * L'avversario della coppia (competizione, giornata), dal calendario osservato.
 *
 * Non inventa niente e non sceglie niente: se il calendario porta più di una
 * sfida per quella coppia, prende **la prima nell'ordine della fonte** — che è
 * l'unico ordine osservato — e non tenta di decidere quale sia «quella giusta»,
 * perché non ha con che deciderlo.
 *
 * Il nome e la rosa dell'avversario arrivano dall'elenco delle squadre, quando
 * c'è: senza elenco l'avversario resta un id, che è meno leggibile ma vero.
 */
export function opponentForMatchday(
  calendar: ObservedCalendar | null,
  competitionId: string,
  matchday: number,
  teams: ObservedLeagueTeams | null,
): OpponentLookup {
  if (calendar === null) return { trovato: false, cause: "calendario_non_letto" };
  const blocco = calendar.competitions.find(
    (voce) => voce.competition.competitionId === competitionId,
  );
  if (blocco === undefined) return { trovato: false, cause: "competizione_assente" };
  const sfida = blocco.fixtures.find(
    (voce) =>
      voce.matchday === matchday &&
      (voce.competitionId === undefined || voce.competitionId === competitionId),
  );
  if (sfida === undefined) return { trovato: false, cause: "nessuna_sfida" };
  if (sfida.opponentTeamId === undefined || sfida.opponentTeamId.length === 0) {
    return { trovato: false, cause: "avversario_non_dichiarato" };
  }
  if (sfida.venue === undefined) return { trovato: false, cause: "campo_non_dichiarato" };

  const elencata = teams?.teams.find((voce) => voce.teamId === sfida.opponentTeamId);
  return {
    trovato: true,
    opponent: {
      competitionId,
      matchday,
      teamId: sfida.opponentTeamId,
      ...(elencata?.name === undefined ? {} : { name: elencata.name }),
      venue: sfida.venue as ObservedVenue,
      roster: elencata?.roster ?? null,
    },
  };
}

/** Le frasi dei cinque rifiuti. Stanno qui perché sono la stessa cosa in ogni pagina. */
export const AVVERSARIO_NON_DISPONIBILE: Readonly<Record<OpponentMissingCause, string>> = {
  calendario_non_letto:
    "Il calendario della lega non è stato letto, quindi non si sa con chi si gioca questa giornata.",
  competizione_assente:
    "Il calendario letto non contiene questa competizione: l'avversario di giornata non è ricavabile.",
  nessuna_sfida:
    "Il calendario non riporta nessuna sfida per questa giornata in questa competizione. In coppa è la normalità nelle giornate che non sono di coppa.",
  avversario_non_dichiarato:
    "La sfida di questa giornata c'è, ma il calendario non dichiara chi sia l'avversario: qui non se ne indovina uno.",
  campo_non_dichiarato:
    "La sfida di questa giornata non dichiara se si gioca in casa o in trasferta, e il campo vale due punti su una fascia da sei: non viene scelto d'ufficio.",
};

/** Quante squadre della lega hanno una rosa davvero osservata. */
export function rosterCount(teams: ObservedLeagueTeams | null): number {
  if (teams === null) return 0;
  return teams.teams.reduce((conto, voce) => conto + (voce.roster === null ? 0 : 1), 0);
}
