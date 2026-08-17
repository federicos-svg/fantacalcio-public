// War board TAVOLO — pure HTML builders for the two variants decided by Owner
// (2026-08-14 ~12:50Z, bacheca #222 voce 18; revisione dell'invariante #86
// registrata in docs/FRONTEND_STRUCTURE.md):
//
//  - MINI, during the live auction (momento `asta`): one compact strip,
//    residual budget + true max bid for every team and nothing else;
//  - COMPLETA, during player selection (momento `chiamata`): one card per
//    team with budget, max bid, free slots per role and the last purchases.
//
// Both variants are rendered FROM `warBoardRows()` (packages/engine/src/
// auction.ts, tranche 3 corsia A / PR #302) and recompute nothing: the engine
// already sorts the rows, tags `isSelf`, and carries the FULL acquisition
// history. What this module owns is display only — truncation, wording,
// markup — which is exactly the choice `warBoardRows()`'s docstring leaves to
// the UI corsia.
//
// Il tetto mostrato dalle due varianti è `maxSafe()` e si chiama `max bid` in
// tutte e due, con quel nome e non un altro: è il tetto di UNA offerta, ed è
// una grandezza diversa dal `max reparto` che la fascia critica mostra per
// ruolo (maxAllocatable). I due nomi vivono in src/ui/budgetLabels.ts, che
// spiega perché confonderli è caro.
//
// §D9 (docs/DECISIONS.md, "regola dei tre ingredienti"): every number here is
// a measured fact from the event log or declared arithmetic over it
// (`maxSafe()`). No model field, no behavioural index, no `value` /
// `fair_to_me` / `target_band`, no recommendation of any kind.
//
// Pure string builders (same idiom as roleBudgetPlan.ts / listone.ts's
// `listoneRowHtml`) so the whole rendering logic is unit-testable without
// jsdom/happy-dom — neither is configured in this project. The DOM wrappers
// live in views.ts (`renderWarBoardMini` / `renderWarBoardFull`).

import { ROLES } from "../../packages/engine/src/types.js";
import type { RosterEntry } from "../../packages/engine/src/types.js";
import type { MaxSafeResult, WarBoardRow } from "../../packages/engine/src/auction.js";
import { escHtml, roleChipHtml } from "./theme.js";
import { type ListonePlayer, resolvePlayerDisplayName } from "./listone.js";
import { MAX_BID_GLOSS, MAX_BID_LABEL, ROLE_MAX_GLOSS, ROLE_MAX_LABEL } from "./budgetLabels.js";

/**
 * How many acquisitions the COMPLETE variant shows per team, most recent
 * first. `warBoardRows()` hands over every entry ever recorded (up to 28 per
 * team); a card that listed them all would push the eight teams' budgets and
 * ceilings off screen, which is the one thing this board exists to show.
 * Three is the "what has this team just been doing" window; the remainder is
 * never hidden silently — it is counted in the `+N precedenti` line, and the
 * full roster is one click away on the Rose screen.
 */
export const WAR_BOARD_ACQUISITIONS_SHOWN = 3;

/** Presentation of one team's max bid, in the three states maxSafe() reports. */
export interface WarBoardBidDisplay {
  /** Short form for the compact strip and the card metric. */
  readonly value: string;
  /** Why the ceiling is not a number — empty when it is one. */
  readonly note: string;
  /** State modifier class; colour is never the only carrier (see `note`). */
  readonly stateClass: string;
  /** Full spoken form, for the aria-label of the item that carries it. */
  readonly spoken: string;
}

/**
 * `maxSafe()` output -> display. Three states, deliberately distinct:
 *
 *  - biddable: the ceiling is a real number of credits;
 *  - `budget-locked`: the team can still fill its slots but only at the cost
 *    floor, so there is no headroom to bid — printing `maxSafe` here would
 *    show a figure BELOW the floor as if it were a ceiling, which reads as
 *    "can bid that much" and is false. It shows `—` plus the reason instead;
 *  - `role-full`: no open role left, i.e. a complete roster. Not a failure.
 *
 * Same honesty rule as renderCriticalAuctionStrip's bid metric: the state is
 * always stated in words, never only in colour.
 */
export function warBoardBidDisplay(maxBid: MaxSafeResult): WarBoardBidDisplay {
  if (maxBid.biddable) {
    return {
      value: `${maxBid.maxSafe}`,
      note: "",
      stateClass: "war-board-bid--open",
      spoken: `max bid ${maxBid.maxSafe} crediti`,
    };
  }
  if (maxBid.reason === "role-full") {
    return {
      value: "—",
      note: "rosa completa",
      stateClass: "war-board-bid--done",
      spoken: "nessun max bid: rosa completa",
    };
  }
  return {
    value: "—",
    note: "budget bloccato",
    stateClass: "war-board-bid--locked",
    spoken: "nessun max bid: budget bloccato, solo al minimo",
  };
}

/** Display label for a team id, falling back to the id itself. */
function teamLabel(fantaTeamId: string, labels: Readonly<Record<string, string>>): string {
  return labels[fantaTeamId] ?? fantaTeamId;
}

/**
 * The acquisitions actually shown for a team, plus how many older ones were
 * left out. `row.acquisitions` is already most-recent-first (warBoardRows()
 * reverses the roster's ascending-seq order), so this is a head slice — no
 * sorting, no re-derivation.
 */
export function warBoardAcquisitionsShown(row: WarBoardRow): {
  readonly shown: readonly RosterEntry[];
  readonly hidden: number;
} {
  const shown = row.acquisitions.slice(0, WAR_BOARD_ACQUISITIONS_SHOWN);
  return { shown, hidden: row.acquisitions.length - shown.length };
}

/**
 * Free slots as chip+count pairs, in ROLES order. Shared shape with the
 * `opponent-tier1__slot` idiom already used on Rose, so "slot residui per
 * ruolo" looks the same wherever it appears.
 */
function slotsHtml(row: WarBoardRow): string {
  return ROLES.map(
    (role) =>
      `<span class="war-board__slot">${roleChipHtml(role)}<em>${row.slotsRemaining[role]}</em></span>`,
  ).join("");
}

/** Spoken form of the slots line — the chips alone carry no text for AT. */
function slotsSpoken(row: WarBoardRow): string {
  return ROLES.map((role) => `${role} ${row.slotsRemaining[role]}`).join(", ");
}

/**
 * One acquisition line: role chip, resolved player name, price paid.
 *
 * The name comes from `resolvePlayerDisplayName()` against a pool index the
 * CALLER builds once for the whole board (see views.ts) — never a scan of the
 * pool per entry, which would be O(pool x acquisitions) per render on a
 * 500+ row listone (audit round 2, finding 2; #293 performance caveat).
 *
 * A riconferma pre-asta (LEAGUE_RULES.md §4) is seeded by reduce() with
 * `seq < 0`, strictly below every live event: the same signal, and the same
 * `R` badge, that renderRoseCard already uses — this board must not invent a
 * second convention for the same fact.
 */
function acquisitionHtml(entry: RosterEntry, poolIndex: ReadonlyMap<string, ListonePlayer>): string {
  const name = resolvePlayerDisplayName(entry.playerId, poolIndex);
  const badge =
    entry.seq < 0
      ? `<span class="roster-badge-confirmed" aria-label="Riconfermato" title="Riconfermato pre-asta (regolamento di lega, §4)">R</span>`
      : "";
  return `
    <li class="war-board__acq-item">
      ${roleChipHtml(entry.role)}
      <span class="war-board__acq-name" title="${escHtml(name)}">${escHtml(name)}</span>
      ${badge}
      <span class="war-board__acq-price">${entry.price}</span>
    </li>`;
}

function acquisitionsHtml(row: WarBoardRow, poolIndex: ReadonlyMap<string, ListonePlayer>): string {
  const { shown, hidden } = warBoardAcquisitionsShown(row);
  if (shown.length === 0) {
    return `<span class="war-board__acq-empty">nessun acquisto</span>`;
  }
  const items = shown.map((entry) => acquisitionHtml(entry, poolIndex)).join("");
  const more = hidden > 0 ? `<span class="war-board__acq-more">+${hidden} precedenti</span>` : "";
  return `<ol class="war-board__acq-list">${items}</ol>${more}`;
}

/**
 * MINI (momento asta) — one `<li>` per team inside a single strip: name,
 * residual budget, max bid. Nothing else, by design: the compactness IS the
 * reason this variant is allowed on the live auction screen at all
 * (docs/FRONTEND_STRUCTURE.md, revisione 2026-08-14 dell'invariante #86).
 *
 * Each item carries its own `aria-label` because the visible form is
 * abbreviated (`bdg` / `max bid`): assistive tech gets the full sentence
 * while the eye gets two numbers.
 *
 * La sigla del tetto è `max bid`, la stessa della variante COMPLETA e non più
 * un «max» nudo: è LO STESSO numero reso dallo STESSO `warBoardBidDisplay()`,
 * e due parole diverse per una grandezza sola sono già mezza confusione (e
 * l'altra mezza è che «max» nudo è anche il nome che la fascia critica dava al
 * tetto di reparto — src/ui/budgetLabels.ts). Le due cifre stanno una per riga
 * proprio perché l'etichetta è più lunga: incolonnate, ognuna sotto la sua
 * sigla, si legge quale numero è quale meglio di quando erano affiancate.
 */
export function warBoardMiniHtml(
  rows: readonly WarBoardRow[],
  labels: Readonly<Record<string, string>>,
): string {
  return rows
    .map((row) => {
      const label = teamLabel(row.fantaTeamId, labels);
      const bid = warBoardBidDisplay(row.maxBid);
      const spoken = `${label}${row.isSelf ? " (io)" : ""}: budget residuo ${row.budgetResidual} crediti, ${bid.spoken}`;
      return `
        <li class="war-board-mini__item${row.isSelf ? " war-board-mini__item--self" : ""}"
            id="war-board-mini-${escHtml(row.fantaTeamId)}"
            aria-label="${escHtml(spoken)}">
          <span class="war-board-mini__name" title="${escHtml(label)}">${escHtml(label)}</span>
          <span class="war-board-mini__nums">
            <span class="war-board-mini__budget"><em>bdg</em>${row.budgetResidual}</span>
            <span class="war-board-mini__bid ${bid.stateClass}"><em>${MAX_BID_LABEL}</em>${bid.value}</span>
          </span>
        </li>`;
    })
    .join("");
}

/**
 * COMPLETA (momento chiamata) — one card per team: budget, max bid, free
 * slots per role, last purchases. Same rows, same numbers as the MINI strip;
 * only here is there time to read the detail.
 */
export function warBoardFullHtml(
  rows: readonly WarBoardRow[],
  labels: Readonly<Record<string, string>>,
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): string {
  return rows
    .map((row) => {
      const label = teamLabel(row.fantaTeamId, labels);
      const bid = warBoardBidDisplay(row.maxBid);
      return `
        <li class="war-board__card${row.isSelf ? " war-board__card--self" : ""}"
            id="war-board-full-${escHtml(row.fantaTeamId)}">
          <span class="war-board__name" title="${escHtml(label)}">${escHtml(label)}${
            row.isSelf ? `<em class="war-board__self">● io</em>` : ""
          }</span>
          <span class="war-board__metrics">
            <span class="war-board__metric war-board__metric--budget">
              <span>budget</span>
              <strong>${row.budgetResidual} cr</strong>
            </span>
            <span class="war-board__metric">
              <span>${MAX_BID_LABEL}</span>
              <strong class="${bid.stateClass}">${bid.value}${bid.value === "—" ? "" : " cr"}</strong>
              ${bid.note ? `<em class="war-board__bid-note">${bid.note}</em>` : ""}
            </span>
          </span>
          <span class="war-board__slots" aria-label="Slot residui per ruolo: ${escHtml(slotsSpoken(row))}">
            ${slotsHtml(row)}
          </span>
          <span class="war-board__acq" aria-label="Ultimi acquisti di ${escHtml(label)}">
            ${acquisitionsHtml(row, poolIndex)}
          </span>
        </li>`;
    })
    .join("");
}

/**
 * The one line under either variant that says what these numbers are and,
 * just as importantly, what they are not. Wording rule (see
 * docs/FRONTEND_STRUCTURE.md): never repeat the exact `STORICO ACQUISTI`
 * panel title — several e2e specs locate that panel by a case-insensitive
 * `hasText` and a nested repetition makes the locator ambiguous.
 *
 * Le glosse vengono da src/ui/budgetLabels.ts: la nota spiega la sigla che sta
 * davvero sopra, e se la sigla cambia la nota cambia con lei. La variante
 * COMPLETA nomina anche l'altro tetto perché nel momento CHIAMATA i due
 * convivono a schermo — war board qui, `max reparto` nel dettaglio per ruolo
 * della fascia in alto — ed è lì che si confondevano.
 */
export const WAR_BOARD_MINI_NOTE = `bdg = crediti residui · ${MAX_BID_LABEL} = ${MAX_BID_GLOSS}. Sola contabilità dal log dell'asta: nessuna stima, nessun suggerimento.`;

export const WAR_BOARD_FULL_NOTE = `Contabilità di tutto il tavolo, derivata dal log dell'asta: crediti residui, ${MAX_BID_LABEL} (${MAX_BID_GLOSS}), slot ancora liberi per ruolo e gli ultimi acquisti registrati (R = riconferma pre-asta). Da non confondere con il «${ROLE_MAX_LABEL}» del dettaglio per ruolo, in alto: quello è ${ROLE_MAX_GLOSS}. Nessuna stima di interesse, nessun indice comportamentale, nessuna raccomandazione.`;
