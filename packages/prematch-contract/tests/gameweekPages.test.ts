import { describe, expect, it } from "vitest";

import { absentInSource, notObserved, observed } from "../src/field.js";
import {
  goalDifferenceCheck,
  playedCheck,
  readCalendarIndex,
  readProbableLineupsPage,
  readStandings,
  type StandingsRow,
} from "../src/gameweekPages.js";
import { absenceIsMeaningful, rosterCompleteness } from "../src/matchPage.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";
import { syntheticLineup, syntheticProvenance } from "./synthetic.js";

function probableLineupsPage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provenance: syntheticProvenance({ page: "probabili formazioni" }),
    matches: [{ home: syntheticLineup("Alfa", "probable"), away: syntheticLineup("Beta", "probable") }],
    ...overrides,
  };
}

describe("la pagina generale delle probabili", () => {
  it("legge le partite della giornata con le loro probabili", () => {
    const outcome = readProbableLineupsPage(probableLineupsPage());
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    expect(outcome.value.matches).toHaveLength(1);
    expect(outcome.value.matches[0]?.home.nature).toBe("probable");
  });

  it("una formazione effettiva dentro una pagina di probabili è fuori contratto", () => {
    // La verità su chi è sceso in campo ha una casa sola: la pagina della
    // partita. Se arrivasse anche da qui, la previsione e la verifica
    // finirebbero mescolate e nessuna misura futura potrebbe separarle.
    const outcome = readProbableLineupsPage(
      probableLineupsPage({
        matches: [{ home: syntheticLineup("Alfa", "actual"), away: syntheticLineup("Beta", "probable") }],
      }),
    );
    expect(outcome.status).toBe("out-of-contract");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["probableLineupsPage", "matches", "0", "home", "nature"]);
  });

  it("senza provenienza non si legge niente", () => {
    const candidate = probableLineupsPage();
    delete candidate["provenance"];
    expect(readProbableLineupsPage(candidate).status).toBe("shape-not-recognised");
  });
});

// LA PREVISIONE PER GIOCATORE — percentuale di titolarità e «in dubbio».
//
// Due facce per ogni prova, come sempre: la fonte il dato ce l'ha, e allora
// arriva; la fonte non ce l'ha, e allora arriva un'assenza dichiarata. Quello
// che non deve succedere mai è la terza cosa — uno zero al posto di un
// silenzio, che a valle è indistinguibile da «non giocherà di sicuro».

function previsioni(
  forecasts: readonly Record<string, unknown>[],
  completeness = "unknown",
): Record<string, unknown> {
  return { presence: "observed", value: { forecasts, completeness } };
}

function paginaConPrevisioni(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return probableLineupsPage({
    matches: [
      {
        home: syntheticLineup("Alfa", "probable"),
        away: syntheticLineup("Beta", "probable"),
        ...overrides,
      },
    ],
  });
}

describe("la previsione su un giocatore vive con le probabili, non con il giocatore osservato", () => {
  it("la fonte ha il dato: percentuale e dubbio arrivano a chi consuma", () => {
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni(
          [
            {
              player: "Alfa 9",
              startingProbability: { presence: "observed", value: 85 },
              doubtful: { presence: "observed", value: false },
            },
            {
              player: "Alfa 10",
              startingProbability: { presence: "observed", value: 55.5 },
              doubtful: { presence: "observed", value: true },
            },
          ],
          "declared-complete",
        ),
      }),
    );
    if (!isRead(outcome)) throw new Error("atteso letto");
    const forecasts = outcome.value.matches[0]?.homeForecasts;
    if (forecasts === undefined || forecasts.presence !== "observed") {
      throw new Error("attese previsioni osservate");
    }
    expect(forecasts.value.forecasts[0]?.startingProbability).toEqual(observed(85));
    // I decimali della fonte restano i decimali della fonte: arrotondarli
    // sarebbe questo pacchetto che corregge chi legge.
    expect(forecasts.value.forecasts[1]?.startingProbability).toEqual(observed(55.5));
    expect(forecasts.value.forecasts[1]?.doubtful).toEqual(observed(true));
  });

  it("la fonte non ha il dato: assenza dichiarata, e MAI uno zero di comodo", () => {
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni([
          {
            player: "Alfa 9",
            startingProbability: { presence: "absent-in-source" },
            doubtful: { presence: "not-observed" },
          },
          {
            player: "Alfa 10",
            startingProbability: { presence: "observed", value: 0 },
            doubtful: { presence: "observed", value: false },
          },
        ]),
      }),
    );
    if (!isRead(outcome)) throw new Error("atteso letto");
    const forecasts = outcome.value.matches[0]?.homeForecasts;
    if (forecasts === undefined || forecasts.presence !== "observed") {
      throw new Error("attese previsioni osservate");
    }
    const senzaDato = forecasts.value.forecasts[0];
    expect(senzaDato?.startingProbability).toEqual(absentInSource());
    expect(senzaDato?.startingProbability).not.toEqual(observed(0));
    expect(senzaDato?.doubtful).toEqual(notObserved());
    // Lo zero osservato, invece, è un dato: la fonte ha scritto zero.
    expect(forecasts.value.forecasts[1]?.startingProbability).toEqual(observed(0));
  });

  it("«in dubbio» ha tre stati e non due: sì, no, e la fonte non si esprime", () => {
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni([
          { player: "Alfa 9", startingProbability: { presence: "not-observed" }, doubtful: { presence: "observed", value: true } },
          { player: "Alfa 10", startingProbability: { presence: "not-observed" }, doubtful: { presence: "observed", value: false } },
          { player: "Alfa 11", startingProbability: { presence: "not-observed" }, doubtful: { presence: "absent-in-source" } },
        ]),
      }),
    );
    if (!isRead(outcome)) throw new Error("atteso letto");
    const forecasts = outcome.value.matches[0]?.homeForecasts;
    if (forecasts === undefined || forecasts.presence !== "observed") {
      throw new Error("attese previsioni osservate");
    }
    expect(forecasts.value.forecasts.map((f) => f.doubtful)).toEqual([
      observed(true),
      observed(false),
      absentInSource(),
    ]);
  });

  it("un candidato scritto prima che la previsione esistesse resta leggibile, e la dichiara non guardata", () => {
    const outcome = readProbableLineupsPage(probableLineupsPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.matches[0]?.homeForecasts).toEqual(notObserved());
    expect(outcome.value.matches[0]?.awayForecasts).toEqual(notObserved());
    expect(outcome.value.matches[0]?.homeForecasts).not.toEqual(absentInSource());
  });

  it("una percentuale fuori scala si ferma, invece di essere riscalata in qualcosa di credibile", () => {
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni([
          {
            player: "Alfa 9",
            startingProbability: { presence: "observed", value: 250 },
            doubtful: { presence: "not-observed" },
          },
        ]),
      }),
    );
    expect(outcome.status).toBe("out-of-contract");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual([
      "probableLineupsPage",
      "matches",
      "0",
      "homeForecasts",
      "value",
      "forecasts",
      "0",
      "startingProbability",
      "value",
    ]);
  });

  it("un «in dubbio» che non è un sì o un no dichiarato non si interpreta", () => {
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni([
          {
            player: "Alfa 9",
            startingProbability: { presence: "not-observed" },
            doubtful: { presence: "observed", value: "forse" },
          },
        ]),
      }),
    );
    expect(outcome.status).toBe("shape-not-recognised");
  });

  it("l'elenco delle previsioni dichiara quanto è completo, e senza dichiarazione non dice niente sugli altri", () => {
    const voce = {
      player: "Alfa 9",
      startingProbability: { presence: "observed", value: 85 },
      doubtful: { presence: "not-observed" },
    };
    const senza = readProbableLineupsPage(paginaConPrevisioni({ homeForecasts: previsioni([voce]) }));
    if (!isRead(senza)) throw new Error("atteso letto");
    const parziale = senza.value.matches[0]?.homeForecasts ?? notObserved();
    expect(rosterCompleteness(parziale)).toBe("unknown");
    expect(absenceIsMeaningful(parziale)).toBe(false);

    const completa = readProbableLineupsPage(
      paginaConPrevisioni({ homeForecasts: previsioni([voce], "declared-complete") }),
    );
    if (!isRead(completa)) throw new Error("atteso letto");
    expect(absenceIsMeaningful(completa.value.matches[0]?.homeForecasts ?? notObserved())).toBe(true);
  });

  it("una previsione può nominare un giocatore che non è in formazione, e non è un errore", () => {
    // Una fonte dà una percentuale anche a chi poi non schiera. Rifiutarlo
    // qui vorrebbe dire chiamare «fuori contratto» un fatto vero.
    const outcome = readProbableLineupsPage(
      paginaConPrevisioni({
        homeForecasts: previsioni([
          {
            player: "Alfa 99",
            startingProbability: { presence: "observed", value: 20 },
            doubtful: { presence: "not-observed" },
          },
        ]),
      }),
    );
    expect(outcome.status).toBe("read");
  });
});

describe("l'indice del calendario", () => {
  const index = {
    provenance: syntheticProvenance({ page: "calendario e risultati", matchday: { origin: "unobserved" } }),
    gameweeks: [
      {
        matchday: { origin: "declared-by-source", number: 1 },
        fixtures: [
          {
            home: "Alfa",
            away: "Beta",
            kickOff: { presence: "observed", value: "2026-08-28T20:45:00+02:00" },
            score: { presence: "observed", value: { home: 1, away: 0 } },
          },
        ],
      },
      {
        matchday: { origin: "declared-by-source", number: 2 },
        fixtures: [
          {
            home: "Gamma",
            away: "Delta",
            kickOff: { presence: "observed", value: "2026-09-04T20:45:00+02:00" },
            score: { presence: "absent-in-source" },
          },
        ],
      },
    ],
  };

  it("porta più di una giornata, come la pagina osservata il 2026-09-04", () => {
    const outcome = readCalendarIndex(index);
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    expect(outcome.value.gameweeks).toHaveLength(2);
    expect(matchdayIfDeclared(outcome.value.gameweeks[1]?.matchday ?? { origin: "unobserved" })).toBe(2);
  });

  it("nessuna delle giornate è «quella corrente»: l'indice non lo dice", () => {
    const outcome = readCalendarIndex(index);
    if (!isRead(outcome)) throw new Error("atteso letto");
    // Il tipo non ha un campo «corrente», e questo test esiste perché non ne
    // nasca uno: sarebbe una deduzione con l'aria di un dato.
    expect(Object.keys(outcome.value)).toEqual(["provenance", "gameweeks"]);
  });

  it("una partita non giocata non ha un risultato zero a zero", () => {
    const outcome = readCalendarIndex(index);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.gameweeks[1]?.fixtures[0]?.score).toEqual(absentInSource());
  });

  it("un risultato con un numero negativo non entra", () => {
    const rotto = {
      ...index,
      gameweeks: [
        {
          matchday: { origin: "declared-by-source", number: 1 },
          fixtures: [
            {
              home: "Alfa",
              away: "Beta",
              kickOff: { presence: "not-observed" },
              score: { presence: "observed", value: { home: -1, away: 0 } },
            },
          ],
        },
      ],
    };
    expect(readCalendarIndex(rotto).status).toBe("out-of-contract");
  });
});

describe("la classifica di Serie A — contesto, non la classifica della lega", () => {
  const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    position: 1,
    team: "Alfa",
    points: { presence: "observed", value: 6 },
    played: { presence: "observed", value: 2 },
    won: { presence: "observed", value: 2 },
    drawn: { presence: "observed", value: 0 },
    lost: { presence: "observed", value: 0 },
    goalsFor: { presence: "observed", value: 5 },
    goalsAgainst: { presence: "observed", value: 1 },
    goalDifference: { presence: "observed", value: 4 },
    recentForm: { presence: "observed", value: ["win", "win"] },
    ...overrides,
  });

  const standings = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    provenance: syntheticProvenance({ page: "classifica", matchday: { origin: "unobserved" } }),
    rows: [row()],
    ...overrides,
  });

  it("legge le colonne misurate il 2026-09-04", () => {
    const outcome = readStandings(standings());
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    const first = outcome.value.rows[0];
    expect(first?.points).toEqual(observed(6));
    expect(first?.recentForm).toEqual(observed(["win", "win"]));
  });

  it("una differenza reti negativa è un numero legittimo", () => {
    const outcome = readStandings(
      standings({
        rows: [
          row({
            goalsFor: { presence: "observed", value: 1 },
            goalsAgainst: { presence: "observed", value: 8 },
            goalDifference: { presence: "observed", value: -7 },
          }),
        ],
      }),
    );
    expect(outcome.status).toBe("read");
  });

  it("una colonna che la fonte non mostra resta assente, non zero", () => {
    const outcome = readStandings(standings({ rows: [row({ points: { presence: "absent-in-source" } })] }));
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.rows[0]?.points).toEqual(absentInSource());
  });

  it("un andamento recente con un esito sconosciuto ferma la lettura", () => {
    expect(
      readStandings(standings({ rows: [row({ recentForm: { presence: "observed", value: ["win", "boh"] } })] }))
        .status,
    ).toBe("shape-not-recognised");
  });
});

describe("i controlli dichiarano, non riparano", () => {
  function builtRow(overrides: Partial<StandingsRow> = {}): StandingsRow {
    return {
      position: 1,
      team: "Alfa",
      points: observed(6),
      played: observed(2),
      won: observed(2),
      drawn: observed(0),
      lost: observed(0),
      goalsFor: observed(5),
      goalsAgainst: observed(1),
      goalDifference: observed(4),
      recentForm: notObserved(),
      ...overrides,
    };
  }

  it("concordi quando i numeri tornano", () => {
    expect(goalDifferenceCheck(builtRow())).toBe("agree");
    expect(playedCheck(builtRow())).toBe("agree");
  });

  it("discordi quando non tornano — e nessuno dei due numeri viene corretto", () => {
    const row = builtRow({ goalDifference: observed(9) });
    expect(goalDifferenceCheck(row)).toBe("disagree");
    expect(row.goalDifference).toEqual(observed(9));
    expect(row.goalsFor).toEqual(observed(5));
  });

  it("non controllabile quando manca un pezzo: la differenza reti non si calcola", () => {
    expect(goalDifferenceCheck(builtRow({ goalDifference: absentInSource() }))).toBe("not-checkable");
    expect(playedCheck(builtRow({ played: notObserved() }))).toBe("not-checkable");
  });
});
