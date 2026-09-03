// CALENDARIO OSSERVATO — due competizioni, e la giornata che non si indovina.
//
// LA LEGA HA DUE MANIFESTAZIONI. Campionato (§22) e Coppa di Lega (§23) non
// sono due viste della stessa cosa: nelle giornate di coppa si giocano **due
// partite**, con **due avversari diversi**, e si schierano **due formazioni**.
// La chiave di una sfida non è quindi la giornata, è la coppia
// **(competizione, giornata)** — e un tipo che assumesse una partita per
// giornata sarebbe sbagliato di struttura, non di dettaglio: perderebbe una
// delle due sfide senza nemmeno poterlo segnalare. Per questo `ObservedCalendar`
// raggruppa le sfide per competizione e non le appiattisce mai.
//
// PERCHÉ QUESTO FILE È QUASI TUTTO FAIL-CLOSED. Il `GameweekContext` che
// `packages/league-gameweek` consuma ha due campi soli, `matchday` e
// `weAreHome`, e valgono entrambi un punteggio: §14 dà +2 alla squadra di casa
// **fino alla 28ª** e zero dalla 29ª. Sbagliare il campo vale due punti su una
// fascia da sei — un terzo di goal; sbagliare la giornata li vale tutti e due e
// in più sposta il confine del campo neutro; sbagliare la competizione li
// applica alla partita dell'altro avversario. Non c'è nessun valore di ripiego
// sensato per nessuno dei tre: `false` non è «non so se giochiamo in casa», è
// «giochiamo fuori», ed è una dichiarazione che nessuno ha fatto.
//
// LA GIORNATA SI DICHIARA DUE VOLTE, e la competizione anche. `toGameweekContext`
// prende il fixture, la giornata attesa e la competizione attesa, e pretende
// che coincidano. Sembra ridondante e non lo è: il chiamante sa per quale
// partita sta schierando, il fixture sa da quale lettura viene, e l'unico modo
// di accorgersi di una lettura vecchia o della sfida sbagliata — la pagina
// della giornata scorsa, la coppa scambiata col campionato in una giornata che
// ne ha due — è confrontarli. Una formazione giusta per la partita sbagliata è
// persa comunque.
//
// Le date restano stringhe opache e non vengono interpretate: qui non si
// costruisce nessuna `Date`, non si legge nessun orologio, e la deadline serve
// a chi decide *quando* agire — fuori da questo pacchetto, che è puro.

import type { GameweekContext } from "../../league-gameweek/src/gameweekSimulator.js";

/** Dove si gioca, dal nostro punto di vista. */
export type ObservedVenue = "casa" | "trasferta";

/**
 * Che competizione è. **Dichiarato, mai dedotto**: `sconosciuto` è un valore
 * legittimo e va usato quando la piattaforma non lo dice. Indovinarlo dal nome
 * («c'è scritto coppa, sarà la coppa») sarebbe un'imputazione, e da qui
 * deriverebbe quale regolamento di classifica si applica.
 */
export type ObservedCompetitionKind = "campionato" | "coppa" | "sconosciuto";

/**
 * Fase della coppa (§23): girone, eliminazione diretta, finale.
 *
 * **Dichiarata, mai dedotta dalla giornata.** La costante del regolamento qui
 * sotto dice quale fase ci si *aspetta* in quale giornata; da lì a scrivere la
 * fase su una sfida che non la dichiara ci sarebbe un'imputazione, e sarebbe
 * proprio quella a nascondere un calendario cambiato.
 */
export type ObservedCupPhase = "girone" | "eliminazione" | "finale";

/**
 * Andata o ritorno. Girone ed eliminazione diretta si giocano su due gare (§23);
 * la **finale è secca** e non ha andata né ritorno, quindi lì il campo resta
 * `undefined` — che è «non c'è», non «non osservato». La distinzione fra i due
 * la porta `cupPhase`, e nessuna delle due si deduce dall'altra.
 */
export type ObservedLeg = "andata" | "ritorno";

/** Una competizione della lega, con id opaco. */
export interface ObservedCompetition {
  /** Identificatore opaco, generato fuori da qui. Mai un id della piattaforma. */
  readonly competitionId: string;
  /** Etichetta osservata, se c'era. Non decide `kind`. */
  readonly name?: string;
  readonly kind: ObservedCompetitionKind;
}

/**
 * Una sfida di calendario, come la piattaforma la espone. Tutti i campi sono
 * opzionali: `undefined` è «non osservato», e per `competitionId`, `matchday` e
 * `venue` è un motivo sufficiente per non schierare.
 */
export interface ObservedFixture {
  /** A quale competizione appartiene questa sfida. */
  readonly competitionId?: string;
  readonly matchday?: number;
  /** Avversario di lega, id opaco. Mai un nome. */
  readonly opponentTeamId?: string;
  /**
   * Casa o trasferta. È una proprietà della **singola partita** e alimenta il
   * fattore campo di §14 esattamente come in campionato: anche una gara secca
   * ha un campo, e anche lì è dichiarato e mai dedotto.
   */
  readonly venue?: ObservedVenue;
  /** Fase di coppa, se la sfida ne ha una e la piattaforma la dichiara. */
  readonly cupPhase?: ObservedCupPhase;
  /** Andata o ritorno, dove la fase ne prevede due. Assente in finale. */
  readonly leg?: ObservedLeg;
  /**
   * Calcio d'inizio, stringa opaca così come letta. Non viene interpretata né
   * confrontata con un orologio: questo pacchetto non ne ha uno.
   */
  readonly kickoffAt?: string;
  /** Chiusura della formazione, stessa natura opaca di `kickoffAt`. */
  readonly deadlineAt?: string;
}

/** Le sfide di UNA competizione, nell'ordine in cui la fonte le espone. */
export interface ObservedCompetitionFixtures {
  readonly competition: ObservedCompetition;
  readonly fixtures: readonly ObservedFixture[];
}

/**
 * Il calendario osservato di una squadra: una lista per competizione, mai una
 * lista piatta di giornate.
 */
export interface ObservedCalendar {
  readonly teamId: string;
  readonly competitions: readonly ObservedCompetitionFixtures[];
}

/**
 * STRUTTURA DELLA COPPA DI LEGA SECONDO IL REGOLAMENTO (§23).
 *
 * **Due mini gironi da quattro squadre, andata e ritorno** — tre avversari per
 * due gare fanno sei giornate: 5, 8, 11, 14, 17, 20. Poi **le prime due di ogni
 * girone alle eliminazioni dirette, andata e ritorno** (24 e 28), e infine la
 * **finale in gara secca** (32). Le regole di punteggio sono le stesse del
 * campionato: cambia il tabellone, non l'aritmetica.
 *
 * **AVVERTENZA, e non è formale.** Questo è un dato del REGOLAMENTO, non
 * un'osservazione della piattaforma. Serve a sapere che cosa aspettarsi — in
 * quelle giornate ci sono due partite — non a decidere che cosa c'è: se il
 * calendario osservato dice altro, **prevale l'osservato**, e la differenza è
 * una divergenza dichiarata da portare a Pico (§28 change control), mai
 * un'imputazione e mai una sfida aggiunta d'ufficio a un calendario che non la
 * contiene. Nessuna funzione di questo pacchetto costruisce sfide da qui, e
 * nessuna scrive `cupPhase` o `leg` su una sfida che non li dichiara.
 *
 * **COSA NON C'È, di proposito**: nessuna logica di qualificazione, nessun
 * tabellone, nessuna regola di supplementari o rigori. §23 rinvia per quelle a
 * una pagina esterna e vieta di ricostruirne il contenuto: il contratto
 * **osserva** la coppa, non la simula.
 */
export const COPPA_STRUCTURE_2026_27 = {
  /** Due gironi da quattro, andata e ritorno. */
  groupStageMatchdays: [5, 8, 11, 14, 17, 20],
  /** Eliminazione diretta fra le prime due di ogni girone, andata e ritorno. */
  knockoutMatchdays: [24, 28],
  /** Finale, gara secca. */
  finalMatchday: 32,
} as const;

/** Le nove giornate in cui il regolamento prevede anche una partita di coppa. */
export const COPPA_MATCHDAYS_2026_27: readonly number[] = [
  ...COPPA_STRUCTURE_2026_27.groupStageMatchdays,
  ...COPPA_STRUCTURE_2026_27.knockoutMatchdays,
  COPPA_STRUCTURE_2026_27.finalMatchday,
];

/**
 * `true` se il regolamento (§23) prevede una partita di coppa in quella
 * giornata. Vedi l'avvertenza su `COPPA_STRUCTURE_2026_27`: è un'attesa, non
 * un'osservazione.
 */
export function isCupMatchday(matchday: number): boolean {
  assertMatchday(matchday);
  return COPPA_MATCHDAYS_2026_27.includes(matchday);
}

/**
 * La fase che il regolamento si aspetta in quella giornata, o `null` se il
 * regolamento non prevede coppa. **Serve a confrontare, non a compilare**: la
 * fase di una sfida è quella che la sfida dichiara, e una differenza fra le due
 * è una divergenza da registrare, mai una correzione.
 */
export function expectedCupPhase(matchday: number): ObservedCupPhase | null {
  assertMatchday(matchday);
  const groupStage: readonly number[] = COPPA_STRUCTURE_2026_27.groupStageMatchdays;
  const knockout: readonly number[] = COPPA_STRUCTURE_2026_27.knockoutMatchdays;
  if (groupStage.includes(matchday)) return "girone";
  if (knockout.includes(matchday)) return "eliminazione";
  if (matchday === COPPA_STRUCTURE_2026_27.finalMatchday) return "finale";
  return null;
}

/**
 * FORMA DI PUNTEGGIO DI UNA FASE (§23, dichiarazione di Pico).
 *
 * - `punti_3_1_0` — **girone** ed **eliminazione diretta**. Nei gironi valgono
 *   gli stessi punti del campionato; l'eliminazione diretta è un **mini girone
 *   di due squadre andata e ritorno**, quindi l'esito del turno si legge sul
 *   complesso delle due gare con gli stessi punti. Le due gare restano due
 *   giornate distinte, ciascuna col suo campo e il suo §14.
 * - `gara_secca` — la **finale**, che è fuori dal mini girone.
 *
 * Le regole di punteggio della singola giornata non cambiano mai: cambia solo
 * come si legge il turno.
 */
export type CupScoringShape = "punti_3_1_0" | "gara_secca";

/** Che forma di punteggio si applica a una fase. Dichiarazione, non calcolo. */
export function cupScoringShape(phase: ObservedCupPhase): CupScoringShape {
  return phase === "finale" ? "gara_secca" : "punti_3_1_0";
}

/**
 * L'eliminazione diretta è un mini girone da due, non una gara con ritorno
 * «di rimonta»: il turno vale come un girone di due squadre.
 */
export const KNOCKOUT_IS_MINI_GROUP = true as const;

/**
 * CHI PASSA IL TURNO — **non lo dice questo contratto, e non lo dice nemmeno il
 * regolamento**.
 *
 * A parità nel mini girone da due, §23 non dichiara il criterio, e per
 * supplementari e rigori rinvia a una pagina esterna che il regolamento vieta
 * di ricostruire. Le tre uscite possibili erano: indovinare un criterio
 * (differenza reti? gol in trasferta? punteggio totale?), copiare una regola da
 * un'altra competizione, oppure fermarsi. Le prime due sarebbero
 * un'imputazione su un esito eliminatorio, cioè il posto peggiore dove
 * indovinare. Questa funzione è la terza: esiste per **fallire in modo
 * dichiarato** invece di lasciare un vuoto in cui qualcuno, un giorno,
 * scriverebbe una regola inventata.
 *
 * Il contratto **osserva** la coppa: se serve sapere chi è passato, lo si legge
 * dalla piattaforma come un fatto, non lo si deriva qui.
 */
export function resolveKnockoutQualification(): never {
  throw new Error(
    "chi passa il turno di eliminazione non è dichiarato dal regolamento (§23 rinvia a una fonte esterna per supplementari e rigori, e vieta di ricostruirla): il contratto osserva la coppa, non la risolve",
  );
}

function assertMatchday(matchday: number): void {
  if (!Number.isInteger(matchday) || matchday < 1) {
    throw new Error(`giornata non valida: ${matchday}`);
  }
}

/**
 * Le sfide di una competizione dentro il calendario, o `null` se il calendario
 * non la contiene. Due blocchi con lo stesso `competitionId` fermano la
 * ricerca: sceglierne uno sarebbe un'imputazione.
 */
export function competitionFixtures(
  calendar: ObservedCalendar,
  competitionId: string,
): ObservedCompetitionFixtures | null {
  const found = calendar.competitions.filter(
    (block) => block.competition.competitionId === competitionId,
  );
  if (found.length > 1) {
    throw new Error(
      `calendario osservato con ${found.length} blocchi per la competizione ${competitionId}`,
    );
  }
  return found[0] ?? null;
}

/**
 * La sfida di una (competizione, giornata), o `null` se non c'è.
 *
 * La chiave è la coppia, non la sola giornata: nelle giornate di coppa le
 * partite sono due e cercare «la partita della 5ª» sarebbe una domanda mal
 * posta. Due sfide osservate per la stessa coppia fermano la ricerca invece di
 * far vincere la prima.
 */
export function fixtureFor(
  calendar: ObservedCalendar,
  competitionId: string,
  matchday: number,
): ObservedFixture | null {
  assertMatchday(matchday);
  const block = competitionFixtures(calendar, competitionId);
  if (block === null) return null;
  const found = block.fixtures.filter((fixture) => fixture.matchday === matchday);
  if (found.length > 1) {
    throw new Error(
      `calendario osservato con ${found.length} sfide per (${competitionId}, giornata ${matchday})`,
    );
  }
  return found[0] ?? null;
}

/**
 * Tutte le sfide osservate in una giornata, competizione per competizione: una
 * sola nelle giornate di solo campionato, **due** nelle giornate di coppa.
 * L'ordine è quello del calendario osservato.
 */
export function fixturesOnMatchday(
  calendar: ObservedCalendar,
  matchday: number,
): readonly { readonly competition: ObservedCompetition; readonly fixture: ObservedFixture }[] {
  assertMatchday(matchday);
  const out: { competition: ObservedCompetition; fixture: ObservedFixture }[] = [];
  for (const block of calendar.competitions) {
    for (const fixture of block.fixtures) {
      if (fixture.matchday === matchday) out.push({ competition: block.competition, fixture });
    }
  }
  return out;
}

/**
 * Il contesto di giornata che `simulateGameweek` e `proposeLineup` consumano.
 *
 * Fail-closed su cinque cose, tutte irrimediabili a valle:
 *  - la giornata attesa non è un intero >= 1;
 *  - il fixture non dichiara a quale competizione appartiene: in una giornata
 *    di coppa ci sono due partite, e una lettura che non dice quale è delle due
 *    non basta a schierare;
 *  - il fixture dichiara un'altra competizione;
 *  - il fixture non dichiara la giornata, o ne dichiara un'altra;
 *  - il fixture non dichiara il campo: `weAreHome` non ha un valore neutro.
 */
export function toGameweekContext(
  fixture: ObservedFixture,
  matchday: number,
  competitionId: string,
): GameweekContext {
  assertMatchday(matchday);
  if (competitionId.length === 0) {
    throw new Error("competizione attesa non dichiarata: la coppia (competizione, giornata) è la chiave della sfida");
  }
  if (fixture.competitionId === undefined) {
    throw new Error(
      `competizione non osservata sulla sfida della giornata ${matchday}: in una giornata di coppa le partite sono due e questa lettura non dice quale sia`,
    );
  }
  if (fixture.competitionId !== competitionId) {
    throw new Error(
      `sfida della competizione ${fixture.competitionId}, richiesta ${competitionId}: lettura non allineata`,
    );
  }
  if (fixture.matchday === undefined) {
    throw new Error(
      `giornata non osservata sulla sfida: non si schiera per la ${matchday} su una lettura che non dichiara la propria giornata`,
    );
  }
  if (fixture.matchday !== matchday) {
    throw new Error(
      `sfida della giornata ${fixture.matchday}, richiesta la ${matchday}: lettura non allineata`,
    );
  }
  if (fixture.venue === undefined) {
    throw new Error(
      `campo non osservato per la giornata ${matchday}: il fattore campo di §14 vale 2 punti e non ha un valore di ripiego`,
    );
  }
  return { matchday, weAreHome: fixture.venue === "casa" };
}
