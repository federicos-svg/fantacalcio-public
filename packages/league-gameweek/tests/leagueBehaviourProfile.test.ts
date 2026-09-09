import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  BEHAVIOUR_QUANTITIES,
  LEAGUE_BEHAVIOUR_MARK,
  LEAGUE_PSEUDO_GAMEWEEKS,
  TEAM_PSEUDO_GAMEWEEKS,
  behaviourEstimate,
  leagueBehaviourProfile,
  observedLeagueGameweeks,
  teamBehaviourProfile,
  type AvailablePlayer,
  type BehaviourQuantityId,
  type LeagueBehaviourProfile,
  type ObservedLeagueGameweek,
  type ObservedMatch,
  type ObservedTeamLineup,
} from "../src/leagueBehaviourProfile.js";
import { MODULES, type Module } from "../src/leagueGameweek.js";
import { mulberry32 } from "../src/lineupProposer.js";

// LE PROVE DEL PROFILO DI COMPORTAMENTO (§8.3).
//
// La prima è quella che conta, e va letta prima delle altre: SU COMPORTAMENTI
// ESTRATTI A CASO IL PROFILO NON DEVE TROVARE ABITUDINI. Un profilo che trova
// tendenze dove non ce ne sono è peggio di nessun profilo: non fallisce, produce
// numeri plausibili, e chi li legge ci costruisce sopra una formazione.
//
// LE FIXTURE SONO SINTETICHE E NON SOMIGLIANO A NIENTE. Squadre `squadra-01`..
// `squadra-08`, giocatori `squadra-NN-gMM`, quotazioni dichiarate come numeri
// decrescenti: nessun nome reale, nessuna quotazione reale, nessuna rosa reale.
// Il generatore non ha ruoli perché questo modulo non li guarda — conta chi era
// in campo, non dove: l'undici è undici id, e il modulo è un'etichetta.
//
// NESSUNA DATA LETTERALE, NESSUN OROLOGIO. Tutto il caso viene da `mulberry32`
// col seme scritto qui: le stesse prove danno gli stessi numeri per sempre, e
// l'ultima prova del file verifica che il modulo non contenga nemmeno la
// possibilità di leggere l'ora.

const TEAMS: readonly string[] = Array.from(
  { length: 8 },
  (_, i) => `squadra-${String(i + 1).padStart(2, "0")}`,
);
const SQUAD_SIZE = 25;
const SEASON_GAMEWEEKS = 38;

/**
 * LA SOGLIA CON CUI QUESTE PROVE DICHIARANO UNA «TENDENZA», e non è una
 * costante del modulo: il modulo non dichiara tendenze, produce stime. È il
 * criterio di LETTURA di chi giudica il profilo — un quarto di tutta la massa
 * di probabilità lontano dal riferimento della lega — e vive qui perché è una
 * scelta di chi scrive la prova, contestabile, non una regola del prodotto.
 */
const SOGLIA_TENDENZA = 0.25;

/**
 * I TETTI MISURATI, non scelti a occhio. Sui semi elencati nelle prove:
 *
 *   - a stagione simulata piena (38 giornate, 40 semi) la deviazione massima
 *     della STIMA dal riferimento è 0,2031 — sotto la soglia, con il 23 % di
 *     margine. La FREQUENZA GREZZA arriva a 0,2332 sugli stessi dati;
 *   - su TUTTI i prefissi di stagione (8 semi × 38 giornate) la stima arriva a
 *     0,2982 e la frequenza grezza a 0,8690: un fattore quasi tre.
 *
 * I due tetti sotto stanno sopra il massimo misurato con margine, e sotto il
 * comportamento della frequenza grezza: se lo shrink sparisse, entrambi
 * diventerebbero rossi.
 */
const TETTO_STAGIONE_PIENA = 0.25;
const TETTO_SU_OGNI_PREFISSO = 0.4;
const PAVIMENTO_INGENUO_SUI_PREFISSI = 0.8;

// ─── IL GENERATORE DI FIXTURE ────────────────────────────────────────────────

function squad(teamId: string): AvailablePlayer[] {
  return Array.from({ length: SQUAD_SIZE }, (_, i) => ({
    playerId: `${teamId}-g${String(i + 1).padStart(2, "0")}`,
    // Quotazioni distinte e decrescenti: il più quotato è sempre `g01`, e non
    // c'è nessuna parità in cima se non dove una prova la pianta apposta.
    quotation: 40 - i,
  }));
}

function shuffled<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = out[i] as T;
    out[i] = out[j] as T;
    out[j] = swap;
  }
  return out;
}

interface LineupOptions {
  /** Panchina sistematicamente il più quotato: il comportamento PIANTATO. */
  readonly benchTopQuotation?: boolean;
  readonly status?: ObservedTeamLineup["status"];
  readonly withAvailability?: boolean;
}

function lineup(teamId: string, rnd: () => number, options: LineupOptions = {}): ObservedTeamLineup {
  const all = squad(teamId);
  const top = all[0] as AvailablePlayer;
  const pool = options.benchTopQuotation === true ? all.slice(1) : all;
  const picked = shuffled(pool, rnd);
  const eleven = picked.slice(0, 11);
  const bench =
    options.benchTopQuotation === true ? [top, ...picked.slice(11, 15)] : picked.slice(11, 16);
  return {
    teamId,
    module: MODULES[Math.floor(rnd() * MODULES.length)] as (typeof MODULES)[number],
    goalkeeperId: (eleven[0] as AvailablePlayer).playerId,
    starterIds: eleven.slice(1).map((p) => p.playerId),
    benchIds: bench.map((p) => p.playerId),
    status: options.status ?? "confermata",
    ...(options.withAvailability === false ? {} : { availability: all }),
  };
}

interface SeasonOptions {
  readonly gameweeks?: number;
  /** La squadra col comportamento piantato dentro, se c'è. */
  readonly planted?: string | null;
  /** Le squadre le cui righe si dichiarano NON confermate. */
  readonly unconfirmed?: readonly string[];
  /** Le squadre da tenere fuori dalle sfide: mai osservate. */
  readonly absent?: readonly string[];
}

function season(seed: number, options: SeasonOptions = {}): ObservedLeagueGameweek[] {
  const rnd = mulberry32(seed);
  const gameweeks = options.gameweeks ?? SEASON_GAMEWEEKS;
  const planted = options.planted ?? null;
  const unconfirmed = new Set(options.unconfirmed ?? []);
  const playing = TEAMS.filter((team) => !(options.absent ?? []).includes(team));
  const out: ObservedLeagueGameweek[] = [];
  for (let g = 1; g <= gameweeks; g += 1) {
    const order = shuffled(playing, rnd);
    const matches: ObservedMatch[] = [];
    for (let m = 0; m + 1 < order.length; m += 2) {
      const home = order[m] as string;
      const away = order[m + 1] as string;
      const u = rnd();
      matches.push({
        home: lineup(home, rnd, {
          benchTopQuotation: home === planted,
          status: unconfirmed.has(home) ? "non_confermata" : "confermata",
        }),
        away: lineup(away, rnd, {
          benchTopQuotation: away === planted,
          status: unconfirmed.has(away) ? "non_confermata" : "confermata",
        }),
        outcome: u < 0.4 ? "casa" : u < 0.8 ? "trasferta" : "pareggio",
      });
    }
    out.push({ gameweek: g, matches });
  }
  return out;
}

function profileOf(gameweeks: readonly ObservedLeagueGameweek[]): LeagueBehaviourProfile {
  return leagueBehaviourProfile({
    history: observedLeagueGameweeks({ gameweeks, provenance: "fixture sintetica della prova" }),
    teams: TEAMS,
  });
}

/**
 * IL MODELLO INGENUO: la frequenza grezza, cioè quello che verrebbe naturale
 * scrivere e che questo profilo si rifiuta di restituire. Vive nelle prove
 * perché è il TERMINE DI PARAGONE, e non nel modulo perché non deve essere
 * consumabile per sbaglio.
 */
function naiveShare(profile: LeagueBehaviourProfile, teamId: string, quantity: BehaviourQuantityId): number[] {
  const estimate = behaviourEstimate(teamBehaviourProfile(profile, teamId), quantity);
  if (estimate.observations === 0) return [...estimate.leagueReference];
  return estimate.counts.map((count) => count / estimate.observations);
}

/** La deviazione massima dal riferimento, su tutte le squadre e le quantità. */
function worstDeviation(profile: LeagueBehaviourProfile, estimator: "stima" | "ingenuo"): number {
  let worst = 0;
  for (const team of profile.teams) {
    for (const estimate of team.estimates) {
      const values =
        estimator === "stima" ? estimate.share : naiveShare(profile, team.teamId, estimate.quantity);
      for (let c = 0; c < estimate.categories.length; c += 1) {
        worst = Math.max(worst, Math.abs((values[c] as number) - (estimate.leagueReference[c] as number)));
      }
    }
  }
  return worst;
}

// ─── 1. IL RUMORE NON DEVE DIVENTARE UN'ABITUDINE ────────────────────────────

describe("su comportamenti estratti a caso il profilo non trova abitudini", () => {
  it("a stagione piena nessuna stima si allontana dal riferimento quanto una tendenza, su 40 semi", () => {
    let peggiore = 0;
    let peggioreIngenuo = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const profile = profileOf(season(seed));
      peggiore = Math.max(peggiore, worstDeviation(profile, "stima"));
      peggioreIngenuo = Math.max(peggioreIngenuo, worstDeviation(profile, "ingenuo"));
    }
    // Il numero misurato, non un'approssimazione: se cambia, qualcosa nel
    // modulo o nei pesi è cambiato, e va guardato invece che rinormalizzato.
    expect(peggiore).toBeLessThan(TETTO_STAGIONE_PIENA);
    expect(peggiore).toBeLessThan(peggioreIngenuo);
    expect(peggiore).toBeCloseTo(0.2031, 3);
  });

  it("su ogni prefisso di stagione la stima resta vicina al riferimento, la frequenza grezza no", () => {
    let peggiore = 0;
    let peggioreIngenuo = 0;
    let contrazioniRotte = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const full = season(seed);
      for (let prefix = 1; prefix <= SEASON_GAMEWEEKS; prefix += 1) {
        const profile = profileOf(full.slice(0, prefix));
        for (const team of profile.teams) {
          for (const estimate of team.estimates) {
            const naive = naiveShare(profile, team.teamId, estimate.quantity);
            for (let c = 0; c < estimate.categories.length; c += 1) {
              const reference = estimate.leagueReference[c] as number;
              const dStima = Math.abs((estimate.share[c] as number) - reference);
              const dIngenuo = Math.abs((naive[c] as number) - reference);
              peggiore = Math.max(peggiore, dStima);
              peggioreIngenuo = Math.max(peggioreIngenuo, dIngenuo);
              // LA CONTRAZIONE: la stima non può MAI stare più lontana dal
              // riferimento di quanto ci stia la frequenza grezza sugli stessi
              // dati. È la proprietà che lo shrink deve garantire sempre, non
              // in media, e basta un caso per smentirla.
              if (dStima > dIngenuo + 1e-12) contrazioniRotte += 1;
            }
          }
        }
      }
    }
    expect(contrazioniRotte).toBe(0);
    expect(peggiore).toBeLessThan(TETTO_SU_OGNI_PREFISSO);
    expect(peggioreIngenuo).toBeGreaterThan(PAVIMENTO_INGENUO_SUI_PREFISSI);
  });

  it("alla prima giornata il modello ingenuo dichiara già una tendenza per ogni squadra, il profilo per nessuna", () => {
    // Deterministico e senza margini: dopo UNA giornata la frequenza grezza del
    // modulo schierato è 1 per ogni squadra — un'abitudine ferrea costruita su
    // una sola osservazione. È il caso più nudo della differenza fra le due
    // letture, ed è quello che questo profilo esiste per non fare.
    const profile = profileOf(season(11, { gameweeks: 1 }));
    for (const team of profile.teams) {
      const estimate = behaviourEstimate(team, "moduleFielded");
      const naive = naiveShare(profile, team.teamId, "moduleFielded");
      const schierato = naive.indexOf(1);
      expect(schierato).toBeGreaterThanOrEqual(0);
      const reference = estimate.leagueReference[schierato] as number;
      expect(1 - reference).toBeGreaterThan(SOGLIA_TENDENZA);
      expect(Math.abs((estimate.share[schierato] as number) - reference)).toBeLessThan(SOGLIA_TENDENZA);
    }
  });
});

// ─── 2. UN'ABITUDINE VERA SI COGLIE, E PIÙ TARDI ─────────────────────────────

/** La prima giornata in cui l'una o l'altra lettura dichiara la tendenza piantata. */
function primaGiornataDiDichiarazione(
  seed: number,
  planted: string,
  estimator: "stima" | "ingenuo",
): number | null {
  const full = season(seed, { planted });
  for (let prefix = 1; prefix <= SEASON_GAMEWEEKS; prefix += 1) {
    const profile = profileOf(full.slice(0, prefix));
    const estimate = behaviourEstimate(
      teamBehaviourProfile(profile, planted),
      "topQuotationAvailableAmongStarters",
    );
    const value =
      estimator === "stima"
        ? (estimate.share[0] as number)
        : (naiveShare(profile, planted, "topQuotationAvailableAmongStarters")[0] as number);
    if ((estimate.leagueReference[0] as number) - value > SOGLIA_TENDENZA) return prefix;
  }
  return null;
}

describe("un comportamento vero e piantato dentro apposta viene colto, e più tardi", () => {
  const PIANTATA = TEAMS[0] as string;

  it("la squadra che panchina sistematicamente il più quotato viene colta, dopo il modello ingenuo", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ingenuo = primaGiornataDiDichiarazione(seed, PIANTATA, "ingenuo");
      const stima = primaGiornataDiDichiarazione(seed, PIANTATA, "stima");
      // Il modello ingenuo la dichiara alla PRIMA giornata: una sola
      // osservazione a zero gli basta, e gli basterebbe anche se fosse un caso.
      expect(ingenuo).toBe(1);
      // Il profilo la coglie comunque — l'abitudine c'è davvero — ma paga il
      // prezzo della prudenza in giornate. È il prezzo giusto: è lo stesso
      // ritardo che gli impedisce di dichiarare l'abitudine che non c'è.
      expect(stima).not.toBeNull();
      expect(stima as number).toBeGreaterThan(ingenuo as number);
      expect(stima as number).toBeLessThanOrEqual(15);
    }
  });

  it("a fine stagione la squadra piantata è l'unica lontana dal riferimento", () => {
    const profile = profileOf(season(3, { planted: PIANTATA }));
    const dichiarate: string[] = [];
    for (const team of profile.teams) {
      const estimate = behaviourEstimate(team, "topQuotationAvailableAmongStarters");
      const scarto = (estimate.leagueReference[0] as number) - (estimate.share[0] as number);
      if (scarto > SOGLIA_TENDENZA) dichiarate.push(team.teamId);
    }
    expect(dichiarate).toEqual([PIANTATA]);
    const piantata = behaviourEstimate(
      teamBehaviourProfile(profile, PIANTATA),
      "topQuotationAvailableAmongStarters",
    );
    // Zero volte in campo su 38 occasioni, e la stima non arriva comunque a
    // zero: resta la coda del riferimento, che è ciò che il conteggio grezzo
    // butterebbe via.
    expect(piantata.counts[0]).toBe(0);
    expect(piantata.observations).toBe(SEASON_GAMEWEEKS);
    expect(piantata.share[0] as number).toBeGreaterThan(0);
  });
});

// ─── 3. UNA SQUADRA MAI OSSERVATA RICEVE IL RIFERIMENTO, DICHIARATO ──────────

describe("una squadra mai osservata non ha un profilo: ha il riferimento", () => {
  const ASSENTE = TEAMS[7] as string;
  const PRESENTE = TEAMS[0] as string;

  it("riceve il riferimento della lega e lo dichiara come tale", () => {
    const profile = profileOf(season(21, { absent: [ASSENTE, TEAMS[6] as string] }));
    const assente = teamBehaviourProfile(profile, ASSENTE);
    expect(assente.gameweeksObserved).toBe(0);
    expect(assente.basis).toBe("riferimento-di-lega");
    expect(assente.reason).toContain("RIFERIMENTO DELLA LEGA");
    for (const estimate of assente.estimates) {
      expect(estimate.observations).toBe(0);
      expect(estimate.basis).toBe("riferimento-di-lega");
      expect(estimate.leagueReferenceWeight).toBe(1);
      // Non «vicino»: IDENTICO al riferimento, bit a bit. Con zero occasioni la
      // formula dello shrink restituisce il riferimento senza nessun ramo
      // speciale, e questa uguaglianza è ciò che lo dimostra.
      expect(estimate.share).toEqual(estimate.leagueReference);
      const referenceRow = profile.reference.find((row) => row.quantity === estimate.quantity);
      expect(estimate.share).toEqual(referenceRow?.share);
    }
    // E una squadra osservata NON riceve il riferimento: se lo ricevesse,
    // l'uguaglianza qui sopra sarebbe vera per tutti e non proverebbe niente.
    const presente = teamBehaviourProfile(profile, PRESENTE);
    expect(presente.basis).toBe("osservazioni-e-riferimento");
    expect(behaviourEstimate(presente, "moduleFielded").share).not.toEqual(
      behaviourEstimate(presente, "moduleFielded").leagueReference,
    );
  });

  it("una squadra mai dichiarata non esiste, e non si inventa", () => {
    const profile = profileOf(season(21));
    expect(() => teamBehaviourProfile(profile, "squadra-99")).toThrowError(/mai DICHIARATA/);
  });

  it("una squadra osservata ma non dichiarata ferma il calcolo invece di comparire dal nulla", () => {
    expect(() =>
      leagueBehaviourProfile({
        history: observedLeagueGameweeks({ gameweeks: season(21), provenance: "fixture" }),
        teams: TEAMS.slice(0, 6),
      }),
    ).toThrowError(/non nell'elenco della lega/);
  });
});

// ─── 4. UNA FORMAZIONE LETTA NON È UNA FORMAZIONE SCHIERATA ──────────────────

describe("le formazioni non confermate non entrano come se fossero scelte", () => {
  const PIANTATA = TEAMS[0] as string;

  it("un'abitudine ferrea vista solo in righe non confermate non compare nel profilo", () => {
    // La stessa squadra della prova 2, con lo stesso comportamento piantato: se
    // le righe non confermate entrassero, la tendenza si vedrebbe fortissima.
    const profile = profileOf(season(3, { planted: PIANTATA, unconfirmed: [PIANTATA] }));
    const piantata = teamBehaviourProfile(profile, PIANTATA);
    expect(piantata.gameweeksObserved).toBe(0);
    expect(piantata.gameweeksDiscardedUnconfirmed).toBe(SEASON_GAMEWEEKS);
    expect(piantata.basis).toBe("riferimento-di-lega");
    const estimate = behaviourEstimate(piantata, "topQuotationAvailableAmongStarters");
    expect(estimate.counts).toEqual([0, 0]);
    expect(estimate.share).toEqual(estimate.leagueReference);
  });

  it("una giornata non confermata pesa come una giornata assente, e si dichiara", () => {
    const base = season(5);
    const tutteNonConfermate = base.map((gw) =>
      gw.gameweek !== 5
        ? gw
        : {
            gameweek: gw.gameweek,
            matches: gw.matches.map((match) => ({
              home: { ...match.home, status: "non_confermata" as const },
              away: { ...match.away, status: "non_confermata" as const },
              outcome: match.outcome,
            })),
          },
    );
    const senzaLaQuinta = base.filter((gw) => gw.gameweek !== 5);
    const conNonConfermate = profileOf(tutteNonConfermate);
    const senza = profileOf(senzaLaQuinta);
    // I conteggi sono gli stessi: una lettura non confermata non è una scelta,
    // e non lo diventa perché è arrivata insieme alle altre.
    for (const team of conNonConfermate.teams) {
      const gemella = teamBehaviourProfile(senza, team.teamId);
      expect(team.estimates.map((e) => e.counts)).toEqual(gemella.estimates.map((e) => e.counts));
      expect(team.gameweeksObserved).toBe(gemella.gameweeksObserved);
    }
    // Ma NON è la stessa cosa di non averla letta: lo scarto esce in chiaro.
    expect(conNonConfermate.teamGameweeksDiscardedUnconfirmed).toBe(8);
    expect(senza.teamGameweeksDiscardedUnconfirmed).toBe(0);
  });

  it("una riga senza `status` ferma il calcolo invece di essere promossa a scelta", () => {
    const base = season(7, { gameweeks: 2 });
    const senzaStatus = base.map((gw, index) =>
      index !== 0
        ? gw
        : {
            gameweek: gw.gameweek,
            matches: gw.matches.map((match, m) =>
              m !== 0
                ? match
                : {
                    home: (() => {
                      const { status: _ignored, ...rest } = match.home;
                      return rest as ObservedTeamLineup;
                    })(),
                    away: match.away,
                    outcome: match.outcome,
                  },
            ),
          },
    );
    expect(() => profileOf(senzaStatus)).toThrowError(/status/);
  });

  it("una giornata non confermata spezza anche la catena delle giornate consecutive", () => {
    // Se la giornata 5 non è confermata, «uguale alla precedente» fra la 4 e la
    // 6 non è misurabile: in mezzo è successo qualcosa che non abbiamo visto.
    const base = season(9, { gameweeks: 6 });
    const conBuco = base.map((gw) =>
      gw.gameweek !== 5
        ? gw
        : {
            gameweek: gw.gameweek,
            matches: gw.matches.map((match) => ({
              home: { ...match.home, status: "non_confermata" as const },
              away: { ...match.away, status: "non_confermata" as const },
              outcome: match.outcome,
            })),
          },
    );
    const team = teamBehaviourProfile(profileOf(conBuco), TEAMS[0] as string);
    const estimate = behaviourEstimate(team, "elevenIdenticalToPrevious");
    // Cinque giornate confermate (1,2,3,4,6): tre coppie consecutive (1-2, 2-3,
    // 3-4) e due occasioni non misurabili (la prima giornata e la sesta).
    expect(team.gameweeksObserved).toBe(5);
    expect(estimate.observations).toBe(3);
    expect(estimate.notMeasurable).toBe(2);
  });
});

// ─── 5. DETERMINISMO BIT A BIT, ORDINI DI ITERAZIONE COMPRESI ────────────────

describe("determinismo bit a bit", () => {
  it("lo stesso storico dà lo stesso profilo, e non «quasi»", () => {
    const gameweeks = season(13);
    expect(JSON.stringify(profileOf(gameweeks))).toBe(JSON.stringify(profileOf(gameweeks)));
  });

  it("l'ordine con cui si dichiarano giornate, sfide e squadre non cambia un bit", () => {
    const gameweeks = season(13);
    const atteso = JSON.stringify(profileOf(gameweeks));

    const rimescolate = [...gameweeks]
      .reverse()
      .map((gw) => ({ gameweek: gw.gameweek, matches: [...gw.matches].reverse() }));
    const conSquadreAlContrario = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks: rimescolate, provenance: "fixture sintetica della prova" }),
      teams: [...TEAMS].reverse(),
    });
    expect(JSON.stringify(conSquadreAlContrario)).toBe(atteso);
  });

  it("l'ordine dei titolari dentro una formazione non cambia un bit: l'undici sono undici nomi", () => {
    const gameweeks = season(13, { gameweeks: 6 });
    const atteso = JSON.stringify(profileOf(gameweeks));
    const titolariAlContrario = gameweeks.map((gw) => ({
      gameweek: gw.gameweek,
      matches: gw.matches.map((match) => ({
        home: { ...match.home, starterIds: [...match.home.starterIds].reverse() },
        away: { ...match.away, starterIds: [...match.away.starterIds].reverse() },
        outcome: match.outcome,
      })),
    }));
    expect(JSON.stringify(profileOf(titolariAlContrario))).toBe(atteso);
  });

  it("lo stesso undici dichiarato in un altro ordine resta lo stesso undici", () => {
    // Il caso che l'ordine dei titolari lo rende visibile: la squadra ripete
    // ESATTAMENTE la stessa formazione, e la piattaforma la stampa al
    // contrario. Se la chiave dell'undici non ordinasse, questa ripetizione
    // sparirebbe dal profilo — e sparirebbe in silenzio, perché «diverso» è
    // una risposta plausibile.
    const rnd = mulberry32(41);
    const casa = lineup(TEAMS[0] as string, rnd, {});
    const ospite = lineup(TEAMS[1] as string, rnd, {});
    const gameweeks: ObservedLeagueGameweek[] = [1, 2].map((g) => ({
      gameweek: g,
      matches: [
        {
          home: g === 1 ? casa : { ...casa, starterIds: [...casa.starterIds].reverse() },
          away: ospite,
          outcome: "pareggio" as const,
        },
      ],
    }));
    const profile = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks, provenance: "fixture" }),
      teams: [TEAMS[0] as string, TEAMS[1] as string],
    });
    const estimate = behaviourEstimate(
      teamBehaviourProfile(profile, TEAMS[0] as string),
      "elevenIdenticalToPrevious",
    );
    expect(estimate.observations).toBe(1);
    expect(estimate.counts).toEqual([1, 0]);
  });

  it("le squadre escono ordinate per id, non nell'ordine dichiarato", () => {
    const profile = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks: season(13, { gameweeks: 4 }), provenance: "fixture" }),
      teams: [...TEAMS].reverse(),
    });
    expect(profile.teams.map((team) => team.teamId)).toEqual([...TEAMS]);
  });
});

// ─── 6. NESSUN RIPIEGO SILENZIOSO, NESSUN DEFAULT INVENTATO ──────────────────

describe("dove il dato non dice abbastanza, il conto non avviene e si vede", () => {
  it("senza disponibilità dichiarata l'occasione non diventa un «no»", () => {
    const rnd = mulberry32(31);
    const gameweeks: ObservedLeagueGameweek[] = [1, 2, 3].map((g) => ({
      gameweek: g,
      matches: [
        {
          home: lineup(TEAMS[0] as string, rnd, { withAvailability: false }),
          away: lineup(TEAMS[1] as string, rnd, {}),
          outcome: "pareggio" as const,
        },
      ],
    }));
    const profile = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks, provenance: "fixture" }),
      teams: [TEAMS[0] as string, TEAMS[1] as string],
    });
    const senza = behaviourEstimate(
      teamBehaviourProfile(profile, TEAMS[0] as string),
      "topQuotationAvailableAmongStarters",
    );
    expect(senza.counts).toEqual([0, 0]);
    expect(senza.notMeasurable).toBe(3);
    expect(senza.share).toEqual(senza.leagueReference);
    // La squadra è comunque OSSERVATA: l'altra quantità ha i suoi conteggi.
    expect(behaviourEstimate(teamBehaviourProfile(profile, TEAMS[0] as string), "moduleFielded").observations).toBe(3);
  });

  it("una parità in cima alla quotazione non si rompe a caso: l'occasione si scarta", () => {
    const rnd = mulberry32(33);
    const teamId = TEAMS[0] as string;
    const all = squad(teamId);
    const pari = all.map((p, i) => (i === 1 ? { ...p, quotation: (all[0] as AvailablePlayer).quotation } : p));
    const base = lineup(teamId, rnd, {});
    const gameweeks: ObservedLeagueGameweek[] = [
      {
        gameweek: 1,
        matches: [
          {
            home: { ...base, availability: pari },
            away: lineup(TEAMS[1] as string, rnd, {}),
            outcome: "pareggio" as const,
          },
        ],
      },
    ];
    const profile = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks, provenance: "fixture" }),
      teams: [teamId, TEAMS[1] as string],
    });
    const estimate = behaviourEstimate(
      teamBehaviourProfile(profile, teamId),
      "topQuotationAvailableAmongStarters",
    );
    expect(estimate.counts).toEqual([0, 0]);
    expect(estimate.notMeasurable).toBe(1);
  });

  it("una disponibilità che non elenca chi ha giocato ferma il calcolo", () => {
    const rnd = mulberry32(35);
    const teamId = TEAMS[0] as string;
    const base = lineup(teamId, rnd, {});
    const monca = squad(teamId).filter((p) => p.playerId !== base.goalkeeperId);
    expect(() =>
      leagueBehaviourProfile({
        history: observedLeagueGameweeks({
          gameweeks: [
            {
              gameweek: 1,
              matches: [
                {
                  home: { ...base, availability: monca },
                  away: lineup(TEAMS[1] as string, rnd, {}),
                  outcome: "pareggio" as const,
                },
              ],
            },
          ],
          provenance: "fixture",
        }),
        teams: [teamId, TEAMS[1] as string],
      }),
    ).toThrowError(/disponibilità dichiarata non lo elenca/);
  });

  it("la provenienza non si sottintende: un cast dimentico non passa", () => {
    expect(() =>
      leagueBehaviourProfile({
        history: { gameweeks: season(1, { gameweeks: 1 }) } as never,
        teams: TEAMS,
      }),
    ).toThrowError(/provenienza dichiarata/);
    expect(() => observedLeagueGameweeks({ gameweeks: [], provenance: "  " })).toThrowError(
      /provenienza delle fotografie non è dichiarata/,
    );
  });

  it("la stessa giornata due volte non è due osservazioni", () => {
    const uno = season(1, { gameweeks: 1 });
    expect(() => profileOf([...uno, ...uno])).toThrowError(/compare due volte/);
  });

  it("l'elenco delle squadre vuoto ferma il calcolo invece di dedurlo dalle fotografie", () => {
    expect(() =>
      leagueBehaviourProfile({
        history: observedLeagueGameweeks({ gameweeks: season(1, { gameweeks: 1 }), provenance: "fixture" }),
        teams: [],
      }),
    ).toThrowError(/elenco delle squadre della lega è vuoto/);
  });
});

// ─── 7. LE ETICHETTE SONO LEGATE AGLI INDICI CHE IL CONTEGGIO SCRIVE ─────────
//
// IL BUCO CHE QUESTE PROVE CHIUDONO, trovato da una review indipendente e non
// da me. `BehaviourQuantity.categories` dichiara «l'ordine è parte del
// contratto», ma fino a qui NESSUNA prova legava il TESTO di `categories[i]`
// all'indice che `bump()` scrive. Invertire due etichette — da
// `["identico","diverso"]` a `["diverso","identico"]` — senza toccare il codice
// che conta lasciava verdi tutte e ventisei le prove, e ribaltava in silenzio
// il significato di ogni `share` di quella quantità. È la famiglia di difetti
// peggiore: una dichiarazione di contratto senza la guardia che la difende, che
// non rompe niente il giorno in cui si scrive e mente per sempre dopo.
//
// COME SI CHIUDE, e perché non basta appuntare le stringhe. Fissare
// `expect(categories).toEqual([...])` sarebbe un pin tautologico: direbbe che
// l'elenco è quello che è, non che significhi quello che dice. Qui invece ogni
// prova FA ACCADERE UN FATTO NOTO — questa squadra ha schierato il 4-4-2, ha
// ripetuto l'undici, ha cambiato modulo dopo aver perso, ha lasciato fuori il
// più quotato — e pretende che l'unica categoria con massa sia quella la cui
// ETICHETTA descrive quel fatto. Il legame passa quindi per `bump()`, ed è
// rosso sia se si invertono le etichette sia se si invertono gli indici.

/** Una formazione interamente decisa dalla prova: modulo, undici, panchina. */
function fixedLineup(teamId: string, module: Module, elevenIndexes: readonly number[]): ObservedTeamLineup {
  const all = squad(teamId);
  const eleven = elevenIndexes.map((i) => all[i] as AvailablePlayer);
  const bench = all.filter((player) => !eleven.includes(player)).slice(0, 5);
  return {
    teamId,
    module,
    goalkeeperId: (eleven[0] as AvailablePlayer).playerId,
    starterIds: eleven.slice(1).map((player) => player.playerId),
    benchIds: bench.map((player) => player.playerId),
    status: "confermata",
    availability: all,
  };
}

/** L'undici che CONTIENE il più quotato (`g01`), e quello che lo lascia fuori. */
const UNDICI_COL_PIU_QUOTATO = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const UNDICI_SENZA_IL_PIU_QUOTATO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

interface GiornataDecisa {
  readonly module: Module;
  readonly eleven: readonly number[];
  /** L'esito della sfida: `trasferta` significa che la squadra in esame ha perso. */
  readonly outcome: ObservedMatch["outcome"];
}

const IN_ESAME = TEAMS[0] as string;
const AVVERSARIA = TEAMS[1] as string;

function profiloDeciso(giornate: readonly GiornataDecisa[]): LeagueBehaviourProfile {
  const gameweeks: ObservedLeagueGameweek[] = giornate.map((giornata, index) => ({
    gameweek: index + 1,
    matches: [
      {
        home: fixedLineup(IN_ESAME, giornata.module, giornata.eleven),
        away: fixedLineup(AVVERSARIA, "442", UNDICI_COL_PIU_QUOTATO),
        outcome: giornata.outcome,
      },
    ],
  }));
  return leagueBehaviourProfile({
    history: observedLeagueGameweeks({ gameweeks, provenance: "fixture sintetica della prova" }),
    teams: [IN_ESAME, AVVERSARIA],
  });
}

/**
 * L'etichetta della SOLA categoria che ha ricevuto massa. Se le categorie con
 * massa non sono esattamente una, lo scenario non è deciso come credeva chi
 * l'ha scritto, e la prova si ferma lì invece di leggere un'etichetta a caso.
 */
function etichettaConteggiata(profile: LeagueBehaviourProfile, quantity: BehaviourQuantityId): string {
  const estimate = behaviourEstimate(teamBehaviourProfile(profile, IN_ESAME), quantity);
  const conMassa = estimate.counts
    .map((count, index) => ({ count, index }))
    .filter((row) => row.count > 0);
  expect(conMassa.map((row) => row.count)).toEqual([1]);
  return estimate.categories[(conMassa[0] as { index: number }).index] as string;
}

describe("le etichette delle categorie sono legate agli indici che il conteggio scrive", () => {
  it("il modulo schierato finisce nella categoria che porta il suo nome, per tutti e sette", () => {
    // Sette scenari, non uno: se la corrispondenza reggesse per caso su un
    // modulo — perché quell'indice coincide — non reggerebbe su tutti e sette.
    for (const module of MODULES) {
      const profile = profiloDeciso([{ module, eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" }]);
      expect(etichettaConteggiata(profile, "moduleFielded")).toBe(module);
    }
  });

  it("l'undici ripetuto finisce in «identico», quello cambiato in «diverso»", () => {
    const ripetuto = profiloDeciso([
      { module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" },
      { module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" },
    ]);
    expect(etichettaConteggiata(ripetuto, "elevenIdenticalToPrevious")).toBe("identico");

    const cambiato = profiloDeciso([
      { module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" },
      { module: "442", eleven: UNDICI_SENZA_IL_PIU_QUOTATO, outcome: "pareggio" },
    ]);
    expect(etichettaConteggiata(cambiato, "elevenIdenticalToPrevious")).toBe("diverso");
  });

  it("dopo una sconfitta il modulo diverso finisce in «cambiato», quello uguale in «invariato»", () => {
    // `trasferta` = ha vinto chi giocava fuori casa, cioè la squadra in esame,
    // che gioca in casa, ha PERSO: è la condizione che apre l'occasione.
    const cambiato = profiloDeciso([
      { module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "trasferta" },
      { module: "343", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" },
    ]);
    expect(etichettaConteggiata(cambiato, "moduleChangedAfterDefeat")).toBe("cambiato");

    const invariato = profiloDeciso([
      { module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "trasferta" },
      { module: "442", eleven: UNDICI_SENZA_IL_PIU_QUOTATO, outcome: "pareggio" },
    ]);
    expect(etichettaConteggiata(invariato, "moduleChangedAfterDefeat")).toBe("invariato");
  });

  it("il più quotato in campo finisce in «fra i titolari», in panchina in «fuori dai titolari»", () => {
    const dentro = profiloDeciso([{ module: "442", eleven: UNDICI_COL_PIU_QUOTATO, outcome: "pareggio" }]);
    expect(etichettaConteggiata(dentro, "topQuotationAvailableAmongStarters")).toBe("fra i titolari");

    const fuori = profiloDeciso([{ module: "442", eleven: UNDICI_SENZA_IL_PIU_QUOTATO, outcome: "pareggio" }]);
    expect(etichettaConteggiata(fuori, "topQuotationAvailableAmongStarters")).toBe("fuori dai titolari");
  });

  it("ogni quantità dichiarata è coperta da una prova di questo blocco", () => {
    // La guardia della guardia: una quantità nuova aggiunta all'elenco senza la
    // sua prova qui rientrerebbe esattamente nel buco che questo blocco chiude.
    const coperte: readonly BehaviourQuantityId[] = [
      "moduleFielded",
      "elevenIdenticalToPrevious",
      "moduleChangedAfterDefeat",
      "topQuotationAvailableAmongStarters",
    ];
    expect(BEHAVIOUR_QUANTITIES.map((quantity) => quantity.id)).toEqual(coperte);
  });
});

// ─── 8. IL CONTRATTO DELL'USCITA ─────────────────────────────────────────────

describe("il contratto dell'uscita", () => {
  it("ogni stima somma a uno e porta accanto i conteggi che l'hanno fatta", () => {
    const profile = profileOf(season(17));
    expect(profile.mark).toBe(LEAGUE_BEHAVIOUR_MARK);
    for (const team of profile.teams) {
      expect(team.estimates.map((e) => e.quantity)).toEqual(BEHAVIOUR_QUANTITIES.map((q) => q.id));
      for (const estimate of team.estimates) {
        expect(estimate.share.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(estimate.leagueReference.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(estimate.counts.reduce((a, b) => a + b, 0)).toBe(estimate.observations);
        expect(estimate.leagueReferenceWeight).toBeCloseTo(
          TEAM_PSEUDO_GAMEWEEKS / (estimate.observations + TEAM_PSEUDO_GAMEWEEKS),
          12,
        );
      }
    }
    // I due pesi sono quelli di §8.4 e non si scelgono qui.
    expect(TEAM_PSEUDO_GAMEWEEKS).toBe(4);
    expect(LEAGUE_PSEUDO_GAMEWEEKS).toBe(8);
  });

  it("i nomi delle quantità dicono l'atto contato, non l'intenzione", () => {
    // Non è pudore lessicale: un nome che attribuisce un'intenzione la fa poi
    // trovare a chi legge il numero. Questa guardia elenca le parole che nel
    // dominio significano «perché», e le tiene fuori da nomi ed etichette.
    const vietate = /fedel|prudent|coraggi|aggressiv|psicolog|stile|attitud|propension|tendenz/i;
    for (const quantity of BEHAVIOUR_QUANTITIES) {
      expect(quantity.id).not.toMatch(vietate);
      expect(quantity.label).not.toMatch(vietate);
      expect(quantity.label.length).toBeGreaterThan(0);
      expect(quantity.trial.length).toBeGreaterThan(0);
      expect(quantity.categories.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("il modulo non ha nessun orologio e nessun caso: nessuna `Date`, nessun `Math.random`", () => {
    const sorgente = readFileSync(new URL("../src/leagueBehaviourProfile.ts", import.meta.url), "utf8");
    // I commenti si tolgono prima: parlano di `Date.now()` proprio per dire che
    // non c'è, e una guardia che inciampa nella propria motivazione è inutile.
    const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codice).not.toMatch(/\bDate\b/);
    expect(codice).not.toMatch(/\bMath\.random\b/);
    expect(codice).not.toMatch(/\bperformance\.now\b/);
  });
});
