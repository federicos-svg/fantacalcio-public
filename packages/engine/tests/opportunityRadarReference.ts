// COPIA CONGELATA di `cliffFacts` e `opportunityRadar` COME ERANO PRIMA
// dell'ottimizzazione PERF-T008. Serve a una cosa sola: dimostrare che
// l'ottimizzazione è a OUTPUT IDENTICO, confrontando riga per riga il
// risultato della versione viva con quello di questa.
//
// NON è un file di test (non matcha `*.test.ts`) e NON è codice di produzione:
// niente lo importa fuori da `opportunityRadar.perf.test.ts`. È deliberatamente
// una copia — la regola del progetto vieta le seconde implementazioni destinate
// a divergere, ma qui la divergenza è esattamente ciò che il test deve poter
// vedere: se la versione viva cambia comportamento, questa NON cambia con lei e
// il test diventa rosso.
//
// Se un giorno il comportamento del radar cambia per una decisione di
// prodotto (non per una ottimizzazione), questo file va aggiornato
// deliberatamente insieme al test — mai "per far passare la suite".
//
// Provenienza: packages/engine/src/cliff.ts e packages/engine/src/opportunities.ts
// a origin/main dcc7c08 ("Motore strato 3 + war board in UI + due drift guard
// di contratto (#4)").

import {
  CLIFF_GAP_RATIO,
  OPPORTUNITY_DOWNGRADE_WARNING,
  ROLES,
  competitorSet,
  currentAnchor,
  dataQualityIndex,
  fitsPlan,
  maxSafe,
  opportunityQualityGate,
  type AnchorBook,
  type AuctionState,
  type CliffFacts,
  type CliffShape,
  type OpportunityCandidate,
  type OpportunityRadarInput,
  type OpportunityReason,
  type Role,
  type RolePlanLine,
} from "../src/index.js";

/** Verbatim: `cliffFacts` prima di PERF-T008. */
export function referenceCliffFacts(
  playerId: string,
  book: AnchorBook,
  state: AuctionState,
): CliffFacts | null {
  const anchor = book.byPlayerId.get(playerId);
  if (anchor === undefined) return null;

  const purchased = new Set(state.purchasedPlayerIds);
  const others = book.all.filter(
    (a) => a.role === anchor.role && a.playerId !== playerId && !purchased.has(a.playerId),
  );

  const betterAvailable = others.filter((a) => a.quotation > anchor.quotation).length;
  const atOrBelow = others.filter((a) => a.quotation <= anchor.quotation);
  const nextAlternativeAnchor =
    atOrBelow.length === 0 ? null : Math.max(...atOrBelow.map((a) => a.quotation));

  const gap = nextAlternativeAnchor === null ? null : anchor.quotation - nextAlternativeAnchor;
  const gapRatio = gap === null || anchor.quotation === 0 ? null : gap / anchor.quotation;

  const shape: CliffShape =
    others.length === 0
      ? "last-of-role"
      : nextAlternativeAnchor === null
        ? "bottom-of-ladder"
        : "gap-below";

  const isCliff =
    shape === "last-of-role"
      ? true
      : shape === "bottom-of-ladder"
        ? false
        : gapRatio !== null && gapRatio >= CLIFF_GAP_RATIO;

  return {
    playerId,
    role: anchor.role,
    anchor: anchor.quotation,
    playerAvailable: !purchased.has(playerId),
    othersAvailableInRole: others.length,
    betterAvailable,
    alternativesAtOrBelow: atOrBelow.length,
    nextAlternativeAnchor,
    gap,
    gapRatio,
    shape,
    isCliff,
  };
}

/** Verbatim: `opportunityRadar` prima di PERF-T008. */
export function referenceOpportunityRadar(
  input: OpportunityRadarInput,
): readonly OpportunityCandidate[] {
  const { book, values, state, inflation, selfId, plan, window } = input;
  const quality = dataQualityIndex(input.quality ?? []);
  const purchased = new Set(state.purchasedPlayerIds);
  const team = state.teams[selfId];
  if (team === undefined) {
    throw new Error(`opportunityRadar: unknown selfId "${selfId}"`);
  }

  const maxBidByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    const safe = maxSafe(team, role);
    maxBidByRole[role] = safe.biddable ? safe.maxSafe : 0;
  }

  const out: OpportunityCandidate[] = [];

  for (const declared of values.all) {
    const playerId = declared.playerId;
    if (purchased.has(playerId)) continue;
    const anchor = currentAnchor(playerId, book, inflation);
    if (anchor === null) continue;
    const role = anchor.role;
    if (team.slotsRemaining[role] <= 0) continue;
    const maxBid = maxBidByRole[role]!;
    if (maxBid < anchor.correctedAnchor) continue;
    const surplus = declared.declaredValue - anchor.correctedAnchor;
    if (surplus <= 0) continue;

    const cliff = referenceCliffFacts(playerId, book, state);
    if (cliff === null) continue;
    const line: RolePlanLine = plan.perRole[role];
    const withinRolePlan = fitsPlan(line, anchor.correctedAnchor);
    const competitors = competitorSet(state, role, anchor.correctedAnchor, selfId);

    const reasons: OpportunityReason[] = [
      { id: "surplus-vs-current-anchor", value: surplus, n: null },
      {
        id: "anchor-corrected-by-inflation",
        value: anchor.inflationApplied,
        n: anchor.coldStart ? null : anchor.n,
      },
    ];
    if (cliff.isCliff) {
      reasons.push({ id: "cliff-after", value: cliff.gapRatio, n: cliff.othersAvailableInRole });
    }
    if (withinRolePlan) {
      reasons.push({ id: "within-role-plan", value: line.allocation, n: line.slotsRemaining });
    }

    const gate = opportunityQualityGate(playerId, quality, anchor);
    const base = {
      playerId,
      role,
      declaredValue: declared.declaredValue,
      anchor,
      surplus,
      maxBid,
      withinRolePlan,
      cliff,
      window: {
        callsUntilNextTurn: window.callsUntilNextTurn,
        nominatorsBefore: window.nominatorsBefore,
        eligibleCompetitors: competitors.eligibleCount,
        atRisk: competitors.eligibleCount > 0,
      },
      quality: gate,
      reasons,
    };

    out.push(
      gate.passes
        ? { ...base, kind: "occasione", warning: null }
        : { ...base, kind: "segnalazione", warning: OPPORTUNITY_DOWNGRADE_WARNING },
    );
  }

  return out.sort(
    (a, b) =>
      Number(b.withinRolePlan) - Number(a.withinRolePlan) ||
      b.surplus - a.surplus ||
      b.anchor.correctedAnchor - a.anchor.correctedAnchor ||
      a.playerId.localeCompare(b.playerId),
  );
}
