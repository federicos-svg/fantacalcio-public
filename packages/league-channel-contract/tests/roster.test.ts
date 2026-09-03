import { describe, expect, it } from "vitest";

import type { PlayerForecast } from "../../league-gameweek/src/lineupProposer.js";
import { missingForecastIds, toForecastSkeleton } from "../src/roster.js";
import { ROSA } from "./fixtures.js";

describe("ossatura delle previsioni", () => {
  it("non inventa probabilità: voteProbability ed expected restano non impostate", () => {
    // È il punto dell'intero file. Uno zero al posto di un `null` avrebbe
    // l'aria di una previsione, e sarebbe la peggiore possibile — «certamente
    // non gioca» — messa lì da nessuno.
    const ossatura = toForecastSkeleton(ROSA);

    expect(ossatura).toHaveLength(ROSA.players.length);
    for (const riga of ossatura) {
      expect(riga.voteProbability).toBeNull();
      expect(riga.expected).toBeNull();
    }
    expect(ossatura.map((riga) => riga.id)).toEqual(ROSA.players.map((player) => player.id));
    expect(ossatura.map((riga) => riga.role)).toEqual(ROSA.players.map((player) => player.role));
  });

  it("riporta la disponibilità osservata e lascia assente quella non osservata", () => {
    const perId = new Map(toForecastSkeleton(ROSA).map((riga) => [riga.id, riga]));
    expect(perId.get("p2")?.availability).toBe("disponibile");
    expect(perId.get("p5")?.availability).toBe("in_dubbio");
    expect(perId.get("p11")?.availability).toBe("indisponibile");
    // `p1` non dichiara disponibilità: il campo NON compare, non vale
    // «disponibile».
    expect(perId.get("p1")).not.toHaveProperty("availability");
  });

  it("senza previsione non si propone nulla: su un'ossatura nuova mancano tutti", () => {
    const ossatura = toForecastSkeleton(ROSA);
    const mancanti = missingForecastIds(ossatura, new Map<string, PlayerForecast>());
    expect(mancanti).toEqual(ROSA.players.map((player) => player.id));
  });

  it("una previsione prodotta toglie quell'id dai mancanti, e solo quello", () => {
    const ossatura = toForecastSkeleton(ROSA);
    const prodotte = new Map<string, PlayerForecast>([
      [
        "p1",
        {
          id: "p1",
          role: "P",
          voteProbability: 0.9,
          expected: {
            baseVote: 6,
            fantasyScore: 6,
            receivedAnyBonus: false,
            missedPenalty: false,
          },
        },
      ],
    ]);
    expect(missingForecastIds(ossatura, prodotte)).toEqual(
      ROSA.players.map((player) => player.id).filter((id) => id !== "p1"),
    );
  });

  it("una previsione per un id fuori rosa è un disallineamento, non un extra", () => {
    const ossatura = toForecastSkeleton(ROSA);
    const prodotte = new Map<string, PlayerForecast>([
      [
        "p99",
        {
          id: "p99",
          role: "A",
          voteProbability: 0.5,
          expected: {
            baseVote: 6,
            fantasyScore: 6,
            receivedAnyBonus: false,
            missedPenalty: false,
          },
        },
      ],
    ]);
    expect(() => missingForecastIds(ossatura, prodotte)).toThrow(/fuori dalla rosa osservata/);
  });

  it("id ripetuto e id vuoto fermano la costruzione", () => {
    expect(() =>
      toForecastSkeleton({ teamId: "t1", players: [{ id: "p1", role: "P" }, { id: "p1", role: "D" }] }),
    ).toThrow(/id ripetuto/);
    expect(() => toForecastSkeleton({ teamId: "t1", players: [{ id: "", role: "P" }] })).toThrow(
      /id vuoto/,
    );
  });
});
