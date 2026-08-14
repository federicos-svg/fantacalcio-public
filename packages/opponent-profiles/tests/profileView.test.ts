import { describe, it, expect } from "vitest";
import { confirmedPrior, resolveOpponentViews } from "../src/profileView.js";
import { computeOpponentCounters } from "../src/counters.js";
import { PROFILE_FIELD_IDS } from "../src/types.js";
import {
  CONFIRMED_PROFILE,
  PARTIALLY_CONFIRMED_PROFILE,
  SYNTHETIC_PERSON_IDS,
  SYNTHETIC_SEATS,
  SYNTHETIC_SEATS_TO_PEOPLE,
  syntheticEngagements,
  syntheticLog,
} from "../fixtures/synthetic.js";

const counters = computeOpponentCounters({
  events: syntheticLog(),
  fantaTeamIds: SYNTHETIC_SEATS,
  engagements: syntheticEngagements(),
});

function views(selfSeatId?: string) {
  return resolveOpponentViews({
    counters,
    seats: SYNTHETIC_SEATS_TO_PEOPLE,
    profiles: [CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE],
    ...(selfSeatId === undefined ? {} : { selfSeatId }),
  });
}

describe("confirmedPrior — only what Owner confirmed row by row", () => {
  it("keeps every confirmed field", () => {
    const prior = confirmedPrior(CONFIRMED_PROFILE);
    expect(prior.spendingTiming).toBe("presto");
    expect(prior.tiltSusceptibility).toBe("alta");
    expect(prior.weaknesses).toEqual(["si_innamora_dei_big", "tilt_dopo_asta_persa"]);
    expect(prior.pendingConfirmation).toEqual([]);
    expect(prior.provenance).toBe("intervista_dichiarata");
  });

  it("strips a merely PROPOSED value and keeps only its field name", () => {
    // An LLM proposal is not a declared input of Owner until he says so.
    const prior = confirmedPrior(PARTIALLY_CONFIRMED_PROFILE);
    expect(prior.spendingTiming).toBe("tardi");
    expect(prior).not.toHaveProperty("tiltSusceptibility");
    expect(prior).not.toHaveProperty("weaknesses");
    expect(prior.pendingConfirmation).toEqual(["tiltSusceptibility", "weaknesses"]);
  });

  it("lists pending fields in the declared field order, not in object order", () => {
    const scrambled = {
      schemaVersion: 1 as const,
      personId: SYNTHETIC_PERSON_IDS.psg,
      interviewId: "ordine",
      notes: { value: "n", status: "proposto" as const, declaredAt: "2026-08-20" },
      spendingTiming: { value: "misto" as const, status: "proposto" as const, declaredAt: "2026-08-20" },
    };
    expect(confirmedPrior(scrambled).pendingConfirmation).toEqual(["spendingTiming", "notes"]);
  });

  it("returns no judgement at all for a profile with no confirmed field", () => {
    const prior = confirmedPrior({
      schemaVersion: 1,
      personId: SYNTHETIC_PERSON_IDS.psg,
      interviewId: "vuota",
    });
    expect(prior.pendingConfirmation).toEqual([]);
    for (const field of PROFILE_FIELD_IDS) expect(prior).not.toHaveProperty(field);
  });

  it("never invents a default for an unanswered question", () => {
    const prior = confirmedPrior(PARTIALLY_CONFIRMED_PROFILE);
    // `affinityClubs` was never asked: absent, not `[]`.
    expect(prior).not.toHaveProperty("affinityClubs");
  });
});

describe("resolveOpponentViews — two labelled halves, never a blend", () => {
  it("pairs each seat's counters with the prior of the person sitting there", () => {
    const ataturk = views().find((v) => v.fantaTeamId === "ataturk")!;
    expect(ataturk.personId).toBe(SYNTHETIC_PERSON_IDS.ataturk);
    expect(ataturk.prior?.spendingTiming).toBe("presto");
    expect(ataturk.observed.counters.auctionsWon.n).toBe(2);
  });

  it("exposes exactly two data halves and no third combined field", () => {
    // The structural no-go guard: nothing here merges a declared judgement
    // with a measured average into one number.
    for (const view of views()) {
      expect(Object.keys(view).sort()).toEqual([
        "fantaTeamId",
        "observed",
        "personId",
        "prior",
      ]);
    }
  });

  it("gives an empty seat a null prior rather than an empty stand-in profile", () => {
    const empty = views().find((v) => v.fantaTeamId === "ac_vostra")!;
    expect(empty.personId).toBeNull();
    expect(empty.prior).toBeNull();
    // The counters are still facts about that seat.
    expect(empty.observed.counters.auctionsWon.status).toBe("observed");
  });

  it("gives a seated person with no interview yet a null prior", () => {
    const noProfile = resolveOpponentViews({
      counters,
      seats: SYNTHETIC_SEATS_TO_PEOPLE,
      profiles: [],
    });
    expect(noProfile.every((v) => v.prior === null)).toBe(true);
    expect(noProfile).toHaveLength(SYNTHETIC_SEATS.length);
  });

  it("excludes Owner's own seat when it is declared", () => {
    const ids = views("ataturk").map((v) => v.fantaTeamId);
    expect(ids).not.toContain("ataturk");
    expect(ids).toHaveLength(SYNTHETIC_SEATS.length - 1);
  });

  it("keeps a seat whose occupant the roster does not know", () => {
    const partial = resolveOpponentViews({
      counters,
      seats: { ataturk: SYNTHETIC_PERSON_IDS.ataturk },
      profiles: [CONFIRMED_PROFILE],
    });
    // The other three seats survive with personId null: a measured fact is
    // never hidden behind a missing label.
    expect(partial).toHaveLength(SYNTHETIC_SEATS.length);
    expect(partial.filter((v) => v.personId === null)).toHaveLength(3);
  });

  it("is deterministic and sorted by seat id", () => {
    expect(views().map((v) => v.fantaTeamId)).toEqual(
      [...SYNTHETIC_SEATS].sort((a, b) => a.localeCompare(b)),
    );
    expect(views()).toEqual(views());
  });

  it("ignores a profile for a person who is not seated", () => {
    const orphan = resolveOpponentViews({
      counters,
      seats: { ataturk: SYNTHETIC_PERSON_IDS.ataturk },
      profiles: [PARTIALLY_CONFIRMED_PROFILE],
    });
    expect(orphan.every((v) => v.prior === null)).toBe(true);
  });
});
