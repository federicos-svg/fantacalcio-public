import { describe, it, expect } from "vitest";
import { joinAndEvaluate, mapIdentityOutcomeToStatus } from "../src/identityJoin.js";
import { evaluateIdentityCandidate } from "../../identity-policy/src/identityCandidateEvaluator.js";
import type { EnrichmentRecord, ListoneCandidate } from "../src/types.js";

// All fixtures below are synthetic — no real player/team names anywhere.
function record(overrides: Partial<EnrichmentRecord> = {}): EnrichmentRecord {
  return {
    listoneId: "101",
    nome: "Synth Testman",
    ruolo: "A",
    squadraAttuale: "Synthopoli",
    titolaritaPrevista: "titolare",
    injuryFlag: "nessuno",
    source: "synthetic_source_a",
    sourceMethod: "manual_file",
    confidence: "alta",
    updatedAt: "2026-07-10",
    ...overrides,
  };
}

function candidate(overrides: Partial<ListoneCandidate> = {}): ListoneCandidate {
  return { listoneId: "101", name: "Synth Testman", role: "A", team: "Synthopoli", ...overrides };
}

function indexOf(candidates: readonly ListoneCandidate[]): ReadonlyMap<string, readonly ListoneCandidate[]> {
  const map = new Map<string, ListoneCandidate[]>();
  for (const c of candidates) {
    const existing = map.get(c.listoneId);
    if (existing) existing.push(c);
    else map.set(c.listoneId, [c]);
  }
  return map;
}

describe("mapIdentityOutcomeToStatus — mappatura completa", () => {
  it("accept_candidate + high -> valid", () => {
    expect(mapIdentityOutcomeToStatus("accept_candidate", "high")).toBe("valid");
  });
  it("accept_candidate + medium -> warning (never a silent valid)", () => {
    expect(mapIdentityOutcomeToStatus("accept_candidate", "medium")).toBe("warning");
  });
  it("review_name_mismatch -> requires_manual_review", () => {
    expect(mapIdentityOutcomeToStatus("review_name_mismatch", "medium")).toBe("requires_manual_review");
  });
  it("review_external_id_reuse -> requires_manual_review", () => {
    expect(mapIdentityOutcomeToStatus("review_external_id_reuse", "low")).toBe("requires_manual_review");
  });
  it("review_role_change -> requires_manual_review", () => {
    expect(mapIdentityOutcomeToStatus("review_role_change", "medium")).toBe("requires_manual_review");
  });
  it("insufficient_evidence -> requires_manual_review", () => {
    expect(mapIdentityOutcomeToStatus("insufficient_evidence", "not_applicable")).toBe("requires_manual_review");
  });
  it("reject_candidate -> rejected", () => {
    expect(mapIdentityOutcomeToStatus("reject_candidate", "not_applicable")).toBe("rejected");
  });
});

describe("mapIdentityOutcomeToStatus — casi non raggiungibili tramite joinAndEvaluate reale", () => {
  // joinAndEvaluate always sets externalId on both MinimalIdentityRow sides from
  // the already-matched, non-empty listoneId (see identityJoin.ts) — so
  // reject_candidate (different external_id) and insufficient_evidence
  // (missing external_id on one side) can never actually happen through the
  // real join. They stay tested directly against evaluateIdentityCandidate/
  // mapIdentityOutcomeToStatus as defense-in-depth for hand-built callers,
  // same posture as packages/engine/src/pipeline.ts's own documented note on
  // validator errors being unreachable end-to-end from its own parser output.
  it("different external_id -> reject_candidate -> rejected", () => {
    const evaluation = evaluateIdentityCandidate(
      { externalId: "101", name: "Synth Testman", role: "A", team: "Synthopoli" },
      { externalId: "999", name: "Synth Testman", role: "A", team: "Synthopoli" },
    );
    expect(evaluation.policy.outcome).toBe("reject_candidate");
    expect(mapIdentityOutcomeToStatus(evaluation.policy.outcome, evaluation.policy.confidenceBand)).toBe("rejected");
  });

  it("missing external_id on one side -> insufficient_evidence -> requires_manual_review", () => {
    const evaluation = evaluateIdentityCandidate(
      { name: "Synth Testman", role: "A", team: "Synthopoli" },
      { externalId: "101", name: "Synth Testman", role: "A", team: "Synthopoli" },
    );
    expect(evaluation.policy.outcome).toBe("insufficient_evidence");
    expect(mapIdentityOutcomeToStatus(evaluation.policy.outcome, evaluation.policy.confidenceBand)).toBe(
      "requires_manual_review",
    );
  });
});

describe("joinAndEvaluate — cardinalità", () => {
  it("zero candidates -> requires_manual_review, never a name-based fallback search", () => {
    const result = joinAndEvaluate(record(), indexOf([]));
    expect(result.matchCount).toBe(0);
    expect(result.status).toBe("requires_manual_review");
    expect(result.identityOutcome).toBeUndefined();
  });

  it("more than one candidate sharing the same listoneId -> ambiguous, never auto-picks one", () => {
    const result = joinAndEvaluate(
      record(),
      indexOf([candidate({ name: "Synth A" }), candidate({ name: "Synth B" })]),
    );
    expect(result.matchCount).toBe(2);
    expect(result.status).toBe("ambiguous");
  });
});

describe("joinAndEvaluate — candidato unico", () => {
  it("strong match on every signal -> valid", () => {
    const result = joinAndEvaluate(record(), indexOf([candidate()]));
    expect(result.matchCount).toBe(1);
    expect(result.identityOutcome).toBe("accept_candidate");
    expect(result.identityConfidenceBand).toBe("high");
    expect(result.status).toBe("valid");
  });

  it("team-only mismatch (transfer) -> accept_candidate/medium -> warning", () => {
    const result = joinAndEvaluate(record(), indexOf([candidate({ team: "Altrove FC" })]));
    expect(result.identityOutcome).toBe("accept_candidate");
    expect(result.identityConfidenceBand).toBe("medium");
    expect(result.status).toBe("warning");
  });

  it("role change despite strong name match -> review_role_change -> requires_manual_review", () => {
    const result = joinAndEvaluate(record({ ruolo: "A" }), indexOf([candidate({ role: "D" })]));
    expect(result.identityOutcome).toBe("review_role_change");
    expect(result.status).toBe("requires_manual_review");
  });

  it("moderately different name, same id -> review_name_mismatch -> requires_manual_review", () => {
    // "Synth Testman" vs "Synth Omega Testman" -> 2/3 token overlap, inside
    // the [0.3, 0.7) moderate band of candidateKeyPolicy.ts.
    const result = joinAndEvaluate(record(), indexOf([candidate({ name: "Synth Omega Testman" })]));
    expect(result.identityOutcome).toBe("review_name_mismatch");
    expect(result.status).toBe("requires_manual_review");
  });

  it("strongly incompatible name, same id -> review_external_id_reuse -> requires_manual_review", () => {
    const result = joinAndEvaluate(record({ nome: "Synth Testman" }), indexOf([candidate({ name: "Completely Different Person" })]));
    expect(result.identityOutcome).toBe("review_external_id_reuse");
    expect(result.status).toBe("requires_manual_review");
  });
});

describe("joinAndEvaluate — determinismo e nessuna canonicalizzazione", () => {
  it("same input always yields the same output", () => {
    const idx = indexOf([candidate()]);
    expect(joinAndEvaluate(record(), idx)).toEqual(joinAndEvaluate(record(), idx));
  });

  it("never carries canonical_player_id/canonical_team_id/isCanonical:true in any casing", () => {
    const result = joinAndEvaluate(record(), indexOf([candidate()]));
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("canonical_player_id");
    expect(serialized).not.toContain("canonical_team_id");
    expect(serialized).not.toContain("iscanonical\":true");
  });
});
