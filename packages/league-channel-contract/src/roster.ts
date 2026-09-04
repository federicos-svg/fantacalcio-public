// ROSA OSSERVATA — chi c'è, con che ruolo, e nient'altro.
//
// GLI ID SONO OPACHI, ed è una regola di confine prima che di stile. Qui non
// entrano nomi di giocatori, identificatori di lega o di squadra della
// piattaforma, né nulla che permetta di risalire alla fonte: `id` è una
// stringa che il layer privato genera e di cui questo pacchetto non interpreta
// un solo carattere. Le fixture di questo pacchetto usano `p1`, `t1`, ed è la
// forma che il contratto si aspetta anche in esercizio.
//
// DOVE FINISCE QUESTO FILE, e comincia qualcun altro. Una rosa osservata NON è
// una previsione. Sapere che `p3` è un centrocampista disponibile non dice
// nulla su quanto è probabile che prenda voto, né su che voto prenderà: quelli
// sono `PlayerForecast`, e chi li produce sta fuori da qui — fuori da questo
// pacchetto e fuori dal core pubblico. `toForecastSkeleton` esiste per rendere
// quel confine impossibile da attraversare per distrazione: produce l'ossatura
// con le probabilità **esplicitamente non impostate** (`null`, non zero), e
// `missingForecastIds` dice a voce alta chi manca. Senza previsione non si
// propone nulla: uno zero al posto di un `null` avrebbe l'aria di una
// previsione, e sarebbe la peggiore possibile — «certamente non gioca» — messa
// lì da nessuno.

import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";

/**
 * Il ruolo, ri-esportato da qui.
 *
 * Come `Module` in `lineupCoachSurface.ts`, e per la stessa ragione: la pagina
 * Formazione ha bisogno del tipo e **non deve imparare una seconda strada** per
 * arrivarci. La guardia gemella (`packages/league-gameweek/tests/isolation.test.ts`)
 * vieta a `src/` di nominare il contratto di giornata; senza questa
 * ri-esportazione l'unico modo di tipizzare un ruolo sarebbe violarla.
 */
export type { Role };
import type { PlayerForecast } from "../../league-gameweek/src/lineupProposer.js";

/**
 * Stato di disponibilità come la piattaforma lo dichiara. `undefined` sul campo
 * che lo porta significa «non osservato»: non è `disponibile`.
 */
export type ObservedAvailability = "disponibile" | "indisponibile" | "in_dubbio";

/** Un giocatore in rosa, con id opaco. */
export interface ObservedPlayer {
  /** Identificatore opaco, generato fuori da qui. Mai un nome. */
  readonly id: string;
  readonly role: Role;
  /** Squadra reale, se osservata. Opaca anch'essa. */
  readonly realTeamId?: string;
  readonly availability?: ObservedAvailability;
}

/** La rosa di una squadra di fantacalcio. L'id di squadra è opaco. */
export interface ObservedTeam {
  readonly teamId: string;
  readonly players: readonly ObservedPlayer[];
}

/**
 * L'ossatura di un `PlayerForecast`: identità e ruolo ci sono, la previsione no.
 *
 * Deliberatamente **non** assegnabile a `PlayerForecast`: `voteProbability` e
 * `expected` sono `null`, non numeri, quindi il compilatore rifiuta di passare
 * un'ossatura dove serve una previsione. È la stessa cosa che dice il commento
 * in testa al file, detta al compilatore invece che al lettore.
 */
export interface ForecastSkeleton {
  readonly id: string;
  readonly role: Role;
  /** Non impostata: chi la produce sta fuori da questo pacchetto. */
  readonly voteProbability: null;
  /** Non impostata, per la stessa ragione. */
  readonly expected: null;
  /** Riportata dall'osservazione, se c'era: è un indizio, non una probabilità. */
  readonly availability?: ObservedAvailability;
}

/**
 * Ossatura delle previsioni per una rosa osservata.
 *
 * Fail-closed su due cose che un id opaco rende invisibili a occhio: un id
 * vuoto e un id ripetuto. Il secondo è quello che fa danno — due righe con lo
 * stesso id producono una formazione che schiera due volte lo stesso giocatore
 * senza che nessuna guardia se ne accorga, perché a valle l'identità è la
 * chiave.
 */
export function toForecastSkeleton(team: ObservedTeam): readonly ForecastSkeleton[] {
  const seen = new Set<string>();
  const skeletons: ForecastSkeleton[] = [];
  for (const player of team.players) {
    if (player.id.length === 0) {
      throw new Error("rosa osservata con un id vuoto: l'identità non è ricostruibile");
    }
    if (seen.has(player.id)) {
      throw new Error(`rosa osservata con id ripetuto: ${player.id}`);
    }
    seen.add(player.id);
    skeletons.push(
      player.availability === undefined
        ? { id: player.id, role: player.role, voteProbability: null, expected: null }
        : {
            id: player.id,
            role: player.role,
            voteProbability: null,
            expected: null,
            availability: player.availability,
          },
    );
  }
  return skeletons;
}

/**
 * I ruoli della rosa osservata, per id.
 *
 * Esiste perché un invio porta **id opachi e nient'altro**: chi vuole
 * verificare che i dieci di movimento reggano il modulo dichiarato ha bisogno
 * dei ruoli, e l'unico posto in cui vivono è la rosa osservata. Ricostruirla a
 * mano dal lato del chiamante sarebbe la solita seconda dichiarazione che
 * diverge in silenzio.
 *
 * Fail-closed sulle stesse due cose di `toForecastSkeleton`, e per la stessa
 * ragione: un id vuoto non è ricostruibile, e un id ripetuto con due ruoli
 * diversi produrrebbe una mappa in cui l'ultimo vince senza che nessuno lo
 * sappia.
 */
export function rolesByPlayerId(team: ObservedTeam): ReadonlyMap<string, Role> {
  const roles = new Map<string, Role>();
  for (const player of team.players) {
    if (player.id.length === 0) {
      throw new Error("rosa osservata con un id vuoto: l'identità non è ricostruibile");
    }
    if (roles.has(player.id)) {
      throw new Error(`rosa osservata con id ripetuto: ${player.id}`);
    }
    roles.set(player.id, player.role);
  }
  return roles;
}

/**
 * Gli id per cui manca ancora la previsione, dato quel che è stato prodotto
 * fuori. Su un'ossatura appena costruita li restituisce **tutti**: è il punto.
 *
 * `produced` è una mappa id -> previsione, e non si fida della sua stessa
 * chiave: una previsione registrata sotto un id che nell'ossatura non esiste è
 * un errore di allineamento, e va vista subito.
 */
export function missingForecastIds(
  skeletons: readonly ForecastSkeleton[],
  produced: ReadonlyMap<string, PlayerForecast>,
): readonly string[] {
  const known = new Set(skeletons.map((skeleton) => skeleton.id));
  for (const id of produced.keys()) {
    if (!known.has(id)) {
      throw new Error(`previsione per un id fuori dalla rosa osservata: ${id}`);
    }
  }
  return skeletons.filter((skeleton) => !produced.has(skeleton.id)).map((skeleton) => skeleton.id);
}
