// FATTI MISURATI DEL MOMENTO LIVE — pure HTML builders for the two blocks the
// `asta` moment used to mount as `devStaticPanel` placeholders:
//
//  - MOMENTO DELL'ASTA: how tight the table is right now — remaining supply
//    per role (`roleScarcity`, already wired in the `chiamata` moment) plus
//    the census of credits and slots still on the table (`residualPressure`);
//  - AVVERSARI: CHI PUÒ ARRIVARCI: who, by HARD CONSTRAINT ONLY, can still
//    reach the figure being typed (`competitorSet`).
//
// PROVENANCE (docs/AUCTION_2026_EXECUTION_PLAN.md §3, "regola dei tre
// ingredienti" of docs/DECISIONS.md §D9). Every number below is either a
// measured fact of the event log (residual credits, free slots, prices paid)
// or declared arithmetic over those facts (`maxSafe`, credits per slot). The
// UI matrix rows that authorise them are:
//  - "Scarsità | Visibile se derivata solo dal log dell'asta | Nessuno";
//  - "Contabilità: budget, slot, hard_reserve, max_safe | Visibile | Nessuno";
//  - "Event log, undo/replay, import/export, avversari Tier-1 | Visibile".
//
// WHAT IS DELIBERATELY NOT HERE, and must never be added:
//  - no `value`, `fair_to_me`, `target_band`, `stretch_cap`, no projection, no
//    ranking, no "how high you should go" — those are model-derived outputs
//    behind a gate that is closed (docs/NO_GO.md §Prodotto);
//  - no behavioural or psychological read of an opponent: `competitorSet`'s
//    basis is `hard-constraints`, and this module states that in words rather
//    than letting a heading imply intent it cannot measure;
//  - nothing derived from the listone quotation beyond the row COUNT the
//    scarcity panel already shows (§3, "Listone e quotazioni").
//
// Pure string builders (same idiom as warBoard.ts / roleBudgetPlan.ts) so the
// whole rendering logic is unit-testable without jsdom/happy-dom, neither of
// which is configured in this project. The DOM wrappers live in views.ts
// (`renderMomentInsightsBlock` / `renderOpponentInterestBlock`).
//
// DETERMINISM: no `Date`, no `Intl`/`toLocaleString` (locale-dependent output
// would make the same state render two different strings on two machines), no
// network, no iteration over unordered structures — the engine hands over
// totally ordered lists and this module preserves that order.

import { ROLES, type Role } from "../../packages/engine/src/types.js";
import type { RoleScarcity } from "../../packages/engine/src/auction.js";
import type { ResidualPressure } from "../../packages/engine/src/anchors.js";
import type {
  CompetitorAssessment,
  CompetitorBlocker,
  CompetitorSet,
} from "../../packages/engine/src/competitors.js";
import { escHtml, roleChipHtml } from "./theme.js";
import { ROLE_LABELS } from "./labels.js";
// Vocabolario unico dei due tetti (src/ui/budgetLabels.ts). Qui serve
// `MAX_BID_LABEL`, non una stringa scritta a mano: la cifra di questa riga è
// `maxSafe()`, la stessa grandezza che la war board chiama «max bid». Finché
// diceva «max» nuda non collideva con nulla; da quando il piano per ruolo si
// chiama «max reparto» e la war board «max bid», un «max» nudo a pochi pixel
// di distanza è la terza formulazione della stessa cosa — ed è la schermata
// dove Pico ha due secondi per decidere.
import { MAX_BID_LABEL } from "./budgetLabels.js";

// ── Number formatting (locale-free, deterministic) ───────────────────────────

/**
 * One decimal, Italian decimal comma, no thousands separator and no `Intl`.
 * `-0,0` is normalised to `0,0`: a rounded-away negative is not a negative.
 */
export function formatDecimal1(n: number): string {
  if (!Number.isFinite(n)) return "n/d";
  const rounded = Math.round(n * 10) / 10;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  return safe.toFixed(1).replace(".", ",");
}

/**
 * A ratio as a signed whole percentage. The sign is explicit (`+8%` / `−12%`)
 * because the interesting part of this number is its direction; an exact zero
 * after rounding prints `0%` with no sign, never `-0%`.
 *
 * The minus is U+2212 MINUS SIGN, not a hyphen: at 11px a hyphen next to a
 * digit reads as a dash in the copy.
 */
export function formatSignedPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "n/d";
  const pct = Math.round(ratio * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

// ── MOMENTO DELL'ASTA — scarsità per ruolo, dal log dell'asta ────────────────

/**
 * The same two numbers the `chiamata` moment's SCARSITÀ PER RUOLO panel shows
 * (views.ts `renderRoleScarcityPanel`), rebuilt compact for the live screen
 * and with the called role marked.
 *
 * They keep their separate labels because they have different provenance:
 * "slot liberi" is summed from the event log across all eight teams, while
 * "in listone" is a row count of the display-only listone — shown as `n/d`,
 * never as a misleading 0, when no listone is loaded.
 *
 * `calledRole` is `""` while the moment has no role (defensive: the live
 * moment is only reachable through a correlated listone row, which always
 * carries one). Nothing is hidden in that case — no cell is highlighted.
 */
export function momentScarcityHtml(
  scarcity: Readonly<Record<Role, RoleScarcity>>,
  poolLoaded: boolean,
  calledRole: Role | "",
): string {
  return ROLES.map((role) => {
    const s = scarcity[role];
    const isCalled = role === calledRole;
    return `
      <div class="moment-scarcity__cell${isCalled ? " moment-scarcity__cell--called" : ""}"
           id="moment-scarcity-${role}">
        <span class="moment-scarcity__head">${roleChipHtml(role)}<em>${escHtml(ROLE_LABELS[role])}</em>${
          isCalled ? `<b class="moment-scarcity__called">in asta</b>` : ""
        }</span>
        <span class="moment-scarcity__metric">
          <span>slot liberi</span>
          <strong id="moment-scarcity-slots-${role}">${s.leagueSlotsRemaining}</strong>
        </span>
        <span class="moment-scarcity__metric moment-scarcity__metric--secondary">
          <span>in listone</span>
          <strong id="moment-scarcity-pool-${role}">${poolLoaded ? s.poolRemaining : "n/d"}</strong>
        </span>
      </div>`;
  }).join("");
}

// ── MOMENTO DELL'ASTA — mercato: crediti e slot ancora sul tavolo ────────────

/**
 * `residualPressure()` rendered as what it is: a CENSUS, not a sample and not
 * a multiplier. Three figures — credits still on the table, slots still to
 * fill, and their ratio — plus the declared comparison against the league's
 * starting endowment per slot (500/28 ≈ 17,9), which is a rule constant and
 * not a weight chosen by the system.
 *
 * When no slot is left the ratio does not exist: `n/d` with the reason in
 * words, never a 0 dressed up as a measure.
 */
export function marketPressureHtml(pressure: ResidualPressure): string {
  const exhausted = pressure.reason === "no-remaining-slots";
  const perSlot = exhausted ? "n/d" : `${formatDecimal1(pressure.creditsPerSlot ?? 0)} cr`;
  const delta = exhausted || pressure.pressure === null ? "n/d" : formatSignedPercent(pressure.pressure);
  const deltaClass =
    exhausted || pressure.pressure === null
      ? "moment-market__delta--none"
      : Math.round(pressure.pressure * 100) === 0
        ? "moment-market__delta--flat"
        : pressure.pressure > 0
          ? "moment-market__delta--up"
          : "moment-market__delta--down";
  return `
    <div class="moment-market" id="moment-market">
      <span class="moment-market__head">MERCATO — CREDITI E SLOT ANCORA SUL TAVOLO</span>
      <span class="moment-market__row">
        <span class="moment-market__metric">
          <span>crediti residui</span>
          <strong id="moment-market-credits">${pressure.creditsRemaining}</strong>
        </span>
        <span class="moment-market__metric">
          <span>slot da riempire</span>
          <strong id="moment-market-slots">${pressure.slotsRemaining}</strong>
        </span>
        <span class="moment-market__metric">
          <span>crediti per slot</span>
          <strong id="moment-market-per-slot">${perSlot}</strong>
        </span>
        <span class="moment-market__metric">
          <span>vs partenza (${formatDecimal1(pressure.baselineCreditsPerSlot)})</span>
          <strong id="moment-market-delta" class="${deltaClass}">${delta}</strong>
        </span>
      </span>
      <span class="moment-market__basis" id="moment-market-basis">${
        exhausted
          ? `Nessuno slot residuo al tavolo: il rapporto crediti/slot non ha denominatore e resta n/d. Censimento su ${pressure.teamsCounted} squadre.`
          : `Censimento su ${pressure.teamsCounted} squadre: nessun campione, nessun cold start.`
      }</span>
    </div>`;
}

export const MOMENT_FACTS_NOTE =
  "Slot liberi: slot di quel ruolo ancora vuoti su tutto il tavolo, somma delle 8 squadre, derivata dal log dell'asta. In listone: righe di quel ruolo non ancora assegnate nel listone caricato. Crediti per slot: crediti residui di tutto il tavolo diviso gli slot che restano da riempire, confrontati con la dotazione iniziale della lega (500/28). Sola contabilità: nessun dato di modello, nessuna stima, nessun suggerimento su quanto spingere.";

// ── AVVERSARI — chi può arrivare alla cifra, per solo vincolo duro ───────────

/**
 * Why a team cannot reach the threshold. One reason per team, the most
 * upstream one, exactly as `competitorSet` reports it: a team with the role
 * full also has max bid 0, but saying "budget" there would be false — the
 * problem is that it does not need that player at all.
 */
export function competitorBlockerLabel(blocker: CompetitorBlocker): string {
  switch (blocker) {
    case "role-full":
      return "ruolo pieno";
    case "budget-locked":
      return "budget bloccato";
    case "below-threshold":
      return "sotto la soglia";
  }
}

/** Spoken/extended form of the same reason, for the row's `title`. */
export function competitorBlockerDetail(blocker: CompetitorBlocker): string {
  switch (blocker) {
    case "role-full":
      return "Nessuno slot di questo ruolo ancora libero: questo giocatore non le serve.";
    case "budget-locked":
      return "Budget bloccato dalla riserva dura: non può fare nemmeno un'offerta valida.";
    case "below-threshold":
      return "Può offrire, ma il suo max bid sicuro non arriva alla soglia.";
  }
}

/**
 * How the threshold shown to the operator was obtained. `price` = the figure
 * typed in the assignment form; `floor` = nothing typed yet, so the question
 * degrades to the honest weaker one ("who can still enter at the minimum
 * bid") instead of inventing a figure nobody said.
 */
export type ReachThresholdSource = "price" | "floor";

/** The one line that says what the count below actually counts. */
export function competitorReachHeadline(set: CompetitorSet, source: ReachThresholdSource): string {
  const total = set.eligibleCount + set.excluded.length;
  const at =
    source === "price"
      ? `a ${set.threshold} cr`
      : `al rilancio minimo (${set.threshold} cr): nessun prezzo ancora inserito`;
  return `${set.eligibleCount} rivali su ${total} possono arrivare ${at}`;
}

function competitorRowHtml(
  a: CompetitorAssessment,
  labels: Readonly<Record<string, string>>,
  kind: "eligible" | "excluded",
): string {
  const label = labels[a.fantaTeamId] ?? a.fantaTeamId;
  const blocker = a.blockers[0];
  const reason = blocker === undefined ? "" : competitorBlockerLabel(blocker);
  const detail = blocker === undefined ? "" : competitorBlockerDetail(blocker);
  const spoken =
    kind === "eligible"
      ? `${label}: può arrivarci, max bid ${a.maxBid} crediti, ${a.slotsRemainingInRole} slot liberi nel ruolo`
      : `${label}: non può arrivarci, ${detail} Max bid ${a.maxBid} crediti, ${a.slotsRemainingInRole} slot liberi nel ruolo, ${a.budgetResidual} crediti residui`;
  return `
    <li class="opponent-reach__row opponent-reach__row--${kind}"
        id="opponent-reach-${escHtml(a.fantaTeamId)}"
        aria-label="${escHtml(spoken)}">
      <span class="opponent-reach__name" title="${escHtml(label)}">${escHtml(label)}</span>
      <span class="opponent-reach__nums">
        <span class="opponent-reach__bid"><em>${MAX_BID_LABEL}</em>${a.maxBid}</span>
        <span class="opponent-reach__slots"><em>slot</em>${a.slotsRemainingInRole}</span>
      </span>
      ${reason === "" ? "" : `<em class="opponent-reach__reason" title="${escHtml(detail)}">${escHtml(reason)}</em>`}
    </li>`;
}

/**
 * The two groups, in the engine's own order (eligible by max bid desc then
 * id; excluded by id). Both groups are always rendered, including when empty:
 * "nobody else can reach this figure" and "everybody can" are different
 * facts, and a group that vanished would leave the operator unable to tell
 * which one they are looking at.
 *
 * Headings state the BASIS in the heading itself ("può arrivarci" / "non può
 * arrivarci"), because `competitorSet` measures reachability under hard
 * constraints and nothing else: no declared interest, no observed counter, no
 * behavioural profile ever enters it (§D9).
 */
export function competitorReachHtml(
  set: CompetitorSet,
  labels: Readonly<Record<string, string>>,
): string {
  const group = (
    id: string,
    heading: string,
    rows: readonly CompetitorAssessment[],
    kind: "eligible" | "excluded",
    empty: string,
  ): string => `
    <div class="opponent-reach__group" id="opponent-reach-${id}">
      <span class="opponent-reach__heading">${escHtml(heading)}<b>${rows.length}</b></span>
      ${
        rows.length === 0
          ? `<span class="opponent-reach__empty">${escHtml(empty)}</span>`
          : `<ul class="opponent-reach__list">${rows.map((r) => competitorRowHtml(r, labels, kind)).join("")}</ul>`
      }
    </div>`;

  return (
    group(
      "eligible",
      `PUÒ ARRIVARE A ${set.threshold} CR`,
      set.eligible,
      "eligible",
      "Nessun rivale può arrivare a questa cifra.",
    ) +
    group(
      "excluded",
      "NON PUÒ ARRIVARCI",
      set.excluded,
      "excluded",
      "Nessun rivale è fuori: tutti possono arrivarci.",
    )
  );
}

/**
 * Titolo del pannello. Dice la quantità che il pannello MISURA —
 * raggiungibilità aritmetica — e non quella che non calcola: il titolo
 * ereditato dal segnaposto diceva «INTERESSE SUL GIOCATORE», cioè
 * un'intenzione, che `competitorSet` rifiuta per costruzione (`basis:
 * "hard-constraints"`) e che §D9 vieta di inferire.
 *
 * Perché questa formulazione e non un'altra:
 *  - il SOGGETTO resta «AVVERSARI»: a essere sbagliato era il predicato, non
 *    di chi parla il pannello, e rinominare il soggetto avrebbe introdotto un
 *    secondo termine per la stessa cosa accanto ad «AVVERSARI TIER-1» (Rose);
 *  - «PUÒ» è il verbo portante e non è negoziabile: è possibilità aritmetica,
 *    non previsione. «CHI ARRIVA» sarebbe una predizione;
 *  - «ARRIVARCI» è la stessa parola delle due intestazioni interne («PUÒ
 *    ARRIVARE A N CR» / «NON PUÒ ARRIVARCI»), così titolo, riga di sintesi e
 *    gruppi si leggono come una frase sola invece che come tre affermazioni;
 *  - il «-ci» ha il suo antecedente una riga sotto, nella riga di sintesi
 *    («N rivali su M possono arrivare a X cr»), e per intero nell'aria-label
 *    del pannello, dove non c'è larghezza da contendere.
 *
 * I due punti al posto del trattone di «TAVOLO — BUDGET E MAX BID» sono una
 * scelta di larghezza, misurata e non stimata: a 390px il titolo ha 244px, e
 * questo pannello vive sulla schermata più stretta dell'app, in asta.
 *   AVVERSARI — INTERESSE SUL GIOCATORE   312px  (andava a capo: 2 righe)
 *   AVVERSARI — CHI PUÒ ARRIVARCI         254px  (andrebbe a capo)
 *   AVVERSARI: CHI PUÒ ARRIVARCI          242px  (una riga, margine 2px)
 * Il margine è sottile: se un giorno un altro font lo fa andare a capo, il
 * titolo torna su due righe come ci stava quello vecchio — nessun overflow,
 * nessuno scroll orizzontale. Per questo l'E2E pretende una riga sola a 768 e
 * 1280 e si limita a vietare il traboccamento a 390.
 */
export const OPPONENT_REACH_TITLE = "AVVERSARI: CHI PUÒ ARRIVARCI";

export const OPPONENT_REACH_NOTE =
  "Solo vincolo duro, dal log dell'asta: uno slot del ruolo ancora libero e un max bid sicuro (budget − minimo necessario per gli slot obbligatori che restano) che arriva alla soglia. «Può arrivarci» non significa «lo vuole»: nessun profilo avversario, nessuna intenzione dichiarata, nessun indice comportamentale entra in questo conteggio. La tua squadra è esclusa: la domanda è chi ALTRO può arrivarci.";

/** The block's honest state when the moment has no role yet. */
export const OPPONENT_REACH_NO_ROLE =
  "Nessun ruolo sul giocatore chiamato: senza ruolo non esiste lo slot su cui misurare chi può competere, e un elenco costruito senza quel vincolo sarebbe falso.";
