// COMPETITOR SET — «CHI PUÒ COMPETERE» di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §4.1, riga 2 di §8 («insieme
// eleggibile»). Puro, deterministico, engine-only.
//
// L'INSIEME ELEGGIBILE È DETERMINISTICO, e solo quello (§D9 perimetro 4, design
// §4.1): una squadra può competere su un giocatore se ha ancora uno SLOT del
// ruolo aperto e un MAX BID VERO che arriva alla soglia. Nient'altro. In
// particolare NON c'è, e non deve entrare qui:
//  - nessun punto di fold numerico («si ferma a 38»): sarebbe una predizione
//    comportamentale su dati inesistenti;
//  - nessuno score di fame/tilt/stile: §D9 vieta gli score psicologici fittati;
//  - nessun contatore osservato per avversario (aste ingaggiate/vinte,
//    sovrapprezzo medio, distanza dal max bid) e nessun interesse dichiarato in
//    intervista: sono lo strato 2 «profili avversario» di §3, perimetro #234.
//    Si agganciano SOPRA questo insieme, non dentro: qui resta il vincolo duro.
//
// MAX BID VERO = `maxSafe()` di auction.ts, importato e riusato, mai
// riderivato: è già «budget − minimo necessario per gli slot obbligatori
// residui» (issue #231) ed è hard-safe (D4). Una seconda formula equivalente
// in questo file sarebbe una copia destinata a divergere.

import { type AuctionState, type Role, COST_FLOOR } from "./types.js";
import { maxSafe } from "./auction.js";

export type CompetitorBlocker =
  | "role-full" // nessuno slot residuo del ruolo: non può proprio comprarlo
  | "budget-locked" // budget bloccato dalla riserva dura: non può fare un'offerta valida
  | "below-threshold"; // può offrire, ma il suo max bid vero non arriva alla soglia

export interface CompetitorAssessment {
  readonly fantaTeamId: string;
  readonly budgetResidual: number;
  readonly slotsRemainingInRole: number;
  /** Max bid vero (`maxSafe`): 0 quando la squadra non è in condizione di offrire. */
  readonly maxBid: number;
  readonly eligible: boolean;
  /**
   * Perché NON è eleggibile; vuoto quando lo è. Se ne riporta UNO, il più a
   * monte, e non l'elenco completo come fa `purchaseFeasibility`: qui i
   * blocchi sono annidati, non paralleli. Una squadra col ruolo pieno ha per
   * forza anche max bid 0 e quindi "sotto soglia", ma dire che il problema è
   * il budget sarebbe falso — il problema è che quel giocatore non le serve.
   * La forma resta una lista perché il vincolo che blocca è un dato, e un
   * domani i vincoli potrebbero non essere più annidati.
   */
  readonly blockers: readonly CompetitorBlocker[];
}

export interface CompetitorSet {
  readonly role: Role;
  /** La soglia effettivamente applicata (intera, mai sotto il floor). */
  readonly threshold: number;
  readonly eligible: readonly CompetitorAssessment[];
  readonly excluded: readonly CompetitorAssessment[];
  readonly eligibleCount: number;
  /**
   * Su cosa poggia l'insieme, dichiarato nel dato: solo vincoli duri
   * dell'event log. Nessun profilo, nessuna intervista, nessun contatore
   * comportamentale è entrato in questa valutazione.
   */
  readonly basis: "hard-constraints";
}

/**
 * Chi, al tavolo, può realmente arrivare a `threshold` su un giocatore di
 * `role`, adesso.
 *
 * La soglia si arrotonda per ECCESSO all'intero e non scende mai sotto
 * `COST_FLOOR`: si compete a crediti interi, e per battere un'ancora di 32,4
 * servono 33. La soglia applicata viaggia nel risultato, così chi la mostra non
 * mostra un numero diverso da quello usato.
 *
 * `selfId`, quando passato, esce dall'insieme: la domanda di §4.1 è «chi ALTRO
 * può competere», e la propria squadra falserebbe il conteggio dei rivali.
 *
 * Ordinamento totale e stabile: eleggibili per max bid decrescente poi id
 * crescente; esclusi per id crescente. Stesso stato → stessa lista, sempre.
 */
export function competitorSet(
  state: AuctionState,
  role: Role,
  threshold: number,
  selfId?: string,
): CompetitorSet {
  if (!Number.isFinite(threshold)) {
    throw new Error(`competitorSet: threshold must be finite, got ${String(threshold)}`);
  }
  const effectiveThreshold = Math.max(COST_FLOOR, Math.ceil(threshold));

  const eligible: CompetitorAssessment[] = [];
  const excluded: CompetitorAssessment[] = [];

  for (const team of Object.values(state.teams)) {
    if (team.fantaTeamId === selfId) continue;
    const safe = maxSafe(team, role);
    const blockers: CompetitorBlocker[] = [];
    if (team.slotsRemaining[role] <= 0) blockers.push("role-full");
    else if (!safe.biddable) blockers.push("budget-locked");
    else if (safe.maxSafe < effectiveThreshold) blockers.push("below-threshold");

    const assessment: CompetitorAssessment = {
      fantaTeamId: team.fantaTeamId,
      budgetResidual: team.budgetResidual,
      slotsRemainingInRole: team.slotsRemaining[role],
      maxBid: safe.biddable ? safe.maxSafe : 0,
      eligible: blockers.length === 0,
      blockers,
    };
    (assessment.eligible ? eligible : excluded).push(assessment);
  }

  eligible.sort((a, b) => b.maxBid - a.maxBid || a.fantaTeamId.localeCompare(b.fantaTeamId));
  excluded.sort((a, b) => a.fantaTeamId.localeCompare(b.fantaTeamId));

  return {
    role,
    threshold: effectiveThreshold,
    eligible,
    excluded,
    eligibleCount: eligible.length,
    basis: "hard-constraints",
  };
}
