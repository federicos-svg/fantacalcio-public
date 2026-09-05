// IL LEGAME FRA UN TOPIC E LA SUA PARTITA.
//
// Il titolo non porta la giornata (vedi `title.ts`): il legame si fa per
// **coppia di squadre e orario** contro un **calendario iniettato**. Il
// calendario arriva da fuori — questo pacchetto non sa da dove — e senza
// calendario la giornata resta **ignota**, non «probabile».
//
// NIENTE OROLOGI, NIENTE DATE COSTRUITE QUI. Gli istanti entrano come
// millisecondi epoch, calcolati da chi legge la fonte. È ciò che rende questa
// funzione pura e le sue prove ripetibili: stesso ingresso, stesso esito, oggi
// e fra un anno.

import { normaliseTeamName } from "./title.js";
import type { CalendarFixture, MatchKey, MatchLink, TeamAliases } from "./types.js";

/**
 * Finestra di difetto intorno al momento dell'osservazione. Serve perché il
 * titolo porta un'ora **senza data**: la data la dà la vicinanza fra quando
 * abbiamo letto e quando si gioca. Quattro giorni sono una scelta dichiarata e
 * contestabile, non una misura.
 */
export const DEFAULT_WINDOW_DAYS = 4;

const DAY_MS = 86_400_000;

export interface MatchLinkOptions {
  readonly calendar: readonly CalendarFixture[];
  readonly aliases?: TeamAliases;
  /** Millisecondi epoch di quando i byte sono stati letti; `null` se ignoto. */
  readonly observedAtEpochMs: number | null;
  readonly windowDays?: number;
}

function unorderedPair(a: string, b: string): readonly [string, string] {
  return a <= b ? [a, b] : [b, a];
}

/** Lega un topic alla sua partita, o dichiara **perché** non ci riesce. */
export function linkTopicToMatch(key: MatchKey, options: MatchLinkOptions): MatchLink {
  const aliases = options.aliases ?? {};
  const calendar = options.calendar;

  if (calendar.length === 0) {
    return {
      state: "CALENDARIO_ASSENTE",
      matchday: null,
      matchId: null,
      calendarSource: null,
      candidates: 0,
      reason:
        "nessun calendario iniettato: la giornata resta ignota e non si deduce dal titolo",
    };
  }

  if (!key.pairPresent || !key.kickoffPresent) {
    return {
      state: "CHIAVE_INCOMPLETA",
      matchday: null,
      matchId: null,
      calendarSource: null,
      candidates: 0,
      reason: "titolo senza coppia di squadre riconosciuta o senza orario riconosciuto",
    };
  }

  const windowMs =
    (typeof options.windowDays === "number" && options.windowDays > 0
      ? options.windowDays
      : DEFAULT_WINDOW_DAYS) * DAY_MS;
  const wanted = unorderedPair(key.firstTeamNormalised, key.secondTeamNormalised);

  let anyTeamSeen = false;
  const candidates: CalendarFixture[] = [];
  for (const fixture of calendar) {
    const home = normaliseTeamName(fixture.homeTeam, aliases);
    const away = normaliseTeamName(fixture.awayTeam, aliases);
    if (home === wanted[0] || home === wanted[1] || away === wanted[0] || away === wanted[1]) {
      anyTeamSeen = true;
    }
    const pair = unorderedPair(home, away);
    if (pair[0] !== wanted[0] || pair[1] !== wanted[1]) continue;
    // L'orario del calendario, quando c'è, deve coincidere con quello del
    // titolo: due squadre si incontrano due volte in una stagione, e l'ora è
    // metà della chiave.
    if (
      typeof fixture.kickoffLocal === "string" &&
      fixture.kickoffLocal.length > 0 &&
      fixture.kickoffLocal !== key.kickoffLocal
    ) {
      continue;
    }
    if (
      options.observedAtEpochMs !== null &&
      Math.abs(fixture.kickoffEpochMs - options.observedAtEpochMs) > windowMs
    ) {
      continue;
    }
    candidates.push(fixture);
  }

  if (candidates.length === 1) {
    const only = candidates[0] as CalendarFixture;
    return {
      state: "RISOLTO",
      matchday: only.matchday,
      matchId: only.matchId ?? null,
      calendarSource: only.source ?? null,
      candidates: 1,
      reason: "",
    };
  }

  if (candidates.length > 1) {
    return {
      state: "CORRISPONDENZA_AMBIGUA",
      matchday: null,
      matchId: null,
      calendarSource: null,
      candidates: candidates.length,
      reason:
        "più di una partita corrisponde a coppia e orario nella finestra dichiarata: non si sceglie",
    };
  }

  return {
    state: anyTeamSeen ? "NESSUNA_CORRISPONDENZA" : "SQUADRE_NON_RICONCILIATE",
    matchday: null,
    matchId: null,
    calendarSource: null,
    candidates: 0,
    reason: anyTeamSeen
      ? "nessuna partita con quella coppia e quell'orario nella finestra dichiarata"
      : "le squadre lette dal titolo non compaiono nel calendario: serve la tabella di alias, mai un accostamento indovinato",
  };
}
