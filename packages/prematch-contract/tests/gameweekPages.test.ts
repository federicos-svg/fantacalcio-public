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
