// New shell views for Batch A (development shell). Every function here is
// either a DEV STATICO block (no real logic behind it) or a read-only view
// derived from the already-reduced AuctionState (no new engine logic, no
// fake data). Nothing here writes to localStorage or mutates app state —
// mutation stays in main.ts.

import {
  type AuctionState,
  type Role,
  ROLES,
  ROSTER_REQUIREMENTS,
  INITIAL_BUDGET,
} from "../../packages/engine/src/types.js";
import type { OpponentTier1, RoleScarcity, WarBoardRow } from "../../packages/engine/src/auction.js";
import type { RolePriceFacts } from "../nominationContext.js";
import type { AssignCommandResolution } from "../assignCommand.js";
import { C, escHtml, renderRoleChip, roleChipHtml } from "./theme.js";
import { ROLE_LABELS, ROLE_LABEL_SING } from "./labels.js";
import { devStaticPanel, devStaticBadge } from "./devStatic.js";
import {
  type ListonePlayer,
  type ListoneColumn,
  type ListoneSort,
  type ListoneStatusFilter,
  listoneRowHtml,
  listoneTableHeadHtml,
  listoneColumns,
  listoneColumnFlex,
  listoneColumnHeaderLabel,
  listoneColumnTooltip,
  listonePlayerKey,
  listonePoolIndex,
  resolvePlayerDisplayName,
  sortListonePool,
  paginateListonePool,
} from "./listone.js";
import {
  WAR_BOARD_FULL_NOTE,
  WAR_BOARD_MINI_NOTE,
  warBoardFullHtml,
  warBoardMiniHtml,
} from "./warBoard.js";
import type { ResidualPressure } from "../../packages/engine/src/anchors.js";
import type { CompetitorSet } from "../../packages/engine/src/competitors.js";
import {
  MOMENT_FACTS_NOTE,
  OPPONENT_REACH_NOTE,
  OPPONENT_REACH_NO_ROLE,
  OPPONENT_REACH_TITLE,
  type ReachThresholdSource,
  competitorReachHeadline,
  competitorReachHtml,
  marketPressureHtml,
  momentScarcityHtml,
} from "./liveFacts.js";

export interface ListonePanelState {
  /** Full loaded listone, unfiltered — drives column discovery and the "N giocatori caricati" note. */
  readonly pool: readonly ListonePlayer[];
  /** `pool` after the search bar (name/role/club) + Assegnato status filter — what the table actually shows. */
  readonly displayPool: readonly ListonePlayer[];
  readonly loadError: string;
  /** Honest source note shown under the table — built by `listoneSourceNote`
   *  from whichever source produced `pool` (see ui/listone.ts). */
  readonly sourceNote: string;
  /** Line qualifying the "Indice" column — quality label and recipe version,
   *  both carried by the served rows. `null` when the pool carries no index. */
  readonly appealIndexNote: string | null;
  readonly sort: ListoneSort | null;
  readonly visibleColumnKeys: readonly string[];
  readonly page: number;
  readonly columnPanelOpen: boolean;
  readonly manualOverrideOpen: boolean;
  /** listonePlayerKey values already purchased (and not voided) in the auction log. */
  readonly assignedKeys: ReadonlySet<string>;
  readonly statusFilter: ListoneStatusFilter;
  readonly statusFilterOpen: boolean;
  /** listonePlayerKey of the row currently selected via click (see onSelectPlayer), or null. */
  readonly selectedKey: string | null;
}

export interface ListonePanelHandlers {
  readonly onFileText: (text: string) => void;
  readonly onSortColumn: (key: string) => void;
  readonly onToggleColumn: (key: string) => void;
  readonly onForget: () => void;
  readonly onChangePage: (page: number) => void;
  readonly onToggleColumnPanel: () => void;
  readonly onToggleManualOverride: () => void;
  readonly onStatusFilterChange: (status: ListoneStatusFilter) => void;
  readonly onToggleStatusFilter: () => void;
  /** Clicking a (non-assigned) row — populates the search bar with this player. */
  readonly onSelectPlayer: (p: ListonePlayer) => void;
}

// ── Listone Svincolati (Chiamata moment) ──────────────────────────────────────
// `pool` is display-only and supplied by the caller (main.ts) — this
// function never fetches, never parses XLSX, never touches the engine.
// Empty pool -> DEV STATICO empty state (unchanged shape); non-empty pool ->
// a real, sortable table with a column selector. Loading itself is a
// local-file-only affordance (see renderListoneLoader): no network, no
// repo data. Sorting/column selection are pure-function-backed (listone.ts)
// so the table logic is unit-testable without a DOM environment.
export function renderListoneSvincolati(
  panelState: ListonePanelState,
  handlers: ListonePanelHandlers,
): HTMLElement {
  const {
    pool,
    displayPool,
    loadError,
    sourceNote,
    appealIndexNote,
    sort,
    visibleColumnKeys,
    page,
    columnPanelOpen,
    manualOverrideOpen,
    assignedKeys,
    statusFilter,
    statusFilterOpen,
    selectedKey,
  } = panelState;
  const {
    onFileText,
    onSortColumn,
    onToggleColumn,
    onForget,
    onChangePage,
    onToggleColumnPanel,
    onToggleManualOverride,
    onStatusFilterChange,
    onToggleStatusFilter,
    onSelectPlayer,
  } = handlers;

  const wrap = document.createElement("div");

  if (loadError) {
    const err = document.createElement("div");
    err.style.cssText = `font-size:12px;color:${C.stopRed};margin-bottom:10px;`;
    err.textContent = loadError;
    wrap.appendChild(err);
  }

  if (pool.length === 0) {
    const table = document.createElement("div");
    table.className = "listone-table";
    const head = document.createElement("div");
    head.className = "listone-table-head";
    head.innerHTML = listoneTableHeadHtml();
    table.appendChild(head);
    const empty = document.createElement("div");
    empty.style.cssText = `font-size:13px;color:${C.textDim};padding:14px 12px;`;
    empty.textContent = "Nessun listone caricato al momento.";
    table.appendChild(empty);

    const wrapEmpty = document.createElement("div");
    wrapEmpty.appendChild(table);
    wrapEmpty.appendChild(
      renderListoneManualOverride(onFileText, false, onForget, manualOverrideOpen, onToggleManualOverride),
    );

    wrap.appendChild(
      devStaticPanel(
        "LISTONE SVINCOLATI",
        "Manca il pool giocatori: nessun dato reale, nessuna riga finta con valori plausibili. Il caricamento automatico non è (ancora) riuscito — vedi \"Caricamento manuale\" sotto per un override.",
        wrapEmpty,
      ),
    );
    return wrap;
  }

  const columns = listoneColumns(pool);
  const visibleColumns = columns.filter((c) => visibleColumnKeys.includes(c.key));
  const sortedPool = sort ? sortListonePool(displayPool, sort.key, sort.direction) : displayPool;
  const paged = paginateListonePool(sortedPool, page);

  const panel = document.createElement("div");
  panel.className = "panel--bordered";

  const titleRow = document.createElement("div");
  titleRow.style.cssText = `display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;`;
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "LISTONE SVINCOLATI";
  titleRow.appendChild(title);

  const rightControls = document.createElement("div");
  rightControls.style.cssText = `display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;
  rightControls.appendChild(
    renderStatusFilterControl(statusFilter, statusFilterOpen, onStatusFilterChange, onToggleStatusFilter),
  );
  rightControls.appendChild(renderColumnPanelToggle(columnPanelOpen, onToggleColumnPanel));
  titleRow.appendChild(rightControls);
  panel.appendChild(titleRow);

  if (columnPanelOpen) {
    panel.appendChild(renderListoneColumnSelector(columns, visibleColumnKeys, onToggleColumn));
  }

  const table = document.createElement("div");
  table.className = "listone-table";

  if (visibleColumns.length === 0) {
    const noCols = document.createElement("div");
    noCols.style.cssText = `font-size:13px;color:${C.textDim};padding:14px 12px;`;
    noCols.textContent = "Nessuna colonna selezionata — apri l'icona colonne sopra e spuntane almeno una.";
    table.appendChild(noCols);
  } else {
    table.appendChild(renderListoneTableHead(visibleColumns, sort, onSortColumn));
    if (paged.items.length === 0) {
      const noMatch = document.createElement("div");
      noMatch.style.cssText = `font-size:13px;color:${C.textDim};padding:14px 12px;`;
      noMatch.textContent = "Nessun giocatore corrisponde ai filtri correnti.";
      table.appendChild(noMatch);
    } else {
      for (const p of paged.items) {
        const key = listonePlayerKey(p);
        const isAssigned = assignedKeys.has(key);
        const isSelected = selectedKey === key;
        const row = document.createElement("div");
        row.className =
          "listone-row" +
          (isAssigned ? " listone-row--assigned" : " listone-row--clickable") +
          (isSelected ? " listone-row--selected" : "");
        row.innerHTML = listoneRowHtml(p, visibleColumns, isAssigned);
        if (!isAssigned) {
          row.title = "Clic per selezionare questo giocatore nella ricerca";
          row.addEventListener("click", () => onSelectPlayer(p));
        }
        table.appendChild(row);
      }
    }
  }
  panel.appendChild(table);

  panel.appendChild(renderListonePagination(paged.page, paged.totalPages, onChangePage));

  const note = document.createElement("div");
  note.style.cssText = `font-size:11px;color:${C.textDim};margin-top:8px;`;
  note.textContent =
    displayPool.length === pool.length
      ? `${pool.length} giocatori caricati. ${sourceNote}`
      : `${displayPool.length} di ${pool.length} giocatori (filtrati). ${sourceNote}`;
  panel.appendChild(note);

  if (appealIndexNote !== null) {
    const indexNote = document.createElement("div");
    indexNote.style.cssText = `font-size:11px;color:${C.textDim};margin-top:4px;`;
    indexNote.textContent = appealIndexNote;
    panel.appendChild(indexNote);
  }

  panel.appendChild(renderListoneManualOverride(onFileText, true, onForget, manualOverrideOpen, onToggleManualOverride));

  wrap.appendChild(panel);

  return wrap;
}

const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  readonly value: ListoneStatusFilter;
  readonly label: string;
  readonly title: string;
}> = [
  { value: "available", label: "Liberi", title: "Mostra solo i giocatori non ancora assegnati" },
  { value: "assigned", label: "Assegnati", title: "Mostra solo i giocatori già assegnati a una squadra" },
  { value: "all", label: "Tutti", title: "Mostra tutti i giocatori, liberi e assegnati" },
];

// Assegnato status filter. A dropdown, not three side-by-side buttons: the
// options only get longer, and three cramped segments next to the column icon
// crowded the title row. "Liberi" is the default — a purchased player is
// excluded from the base view until this is switched.
//
// Not a native <select> because the trigger has to show the ACTIVE filter as
// a labelled value ("Filtro: Liberi") and the open list marks the current one;
// the listbox pattern below gives that with real keyboard support.
function renderStatusFilterControl(
  status: ListoneStatusFilter,
  open: boolean,
  onChange: (status: ListoneStatusFilter) => void,
  onToggle: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "status-filter";
  wrap.id = "listone-status-filter";

  const current = STATUS_FILTER_OPTIONS.find((o) => o.value === status) ?? STATUS_FILTER_OPTIONS[0]!;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "listone-status-filter-trigger";
  trigger.className = "status-filter__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", String(open));
  trigger.title = current.title;
  trigger.innerHTML =
    `<span class="status-filter__label">Filtro</span>` +
    `<span class="status-filter__value">${escHtml(current.label)}</span>` +
    `<span class="status-filter__caret" aria-hidden="true">▾</span>`;
  trigger.addEventListener("click", onToggle);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      onToggle();
    }
  });
  wrap.appendChild(trigger);

  if (!open) return wrap;

  const list = document.createElement("div");
  list.id = "listone-status-filter-list";
  list.className = "status-filter__list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Filtro stato giocatori");

  STATUS_FILTER_OPTIONS.forEach((opt, index) => {
    const active = opt.value === status;
    const item = document.createElement("button");
    item.type = "button";
    item.id = `listone-status-filter-option-${opt.value}`;
    item.className = "status-filter__option" + (active ? " is-active" : "");
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(active));
    item.title = opt.title;
    item.innerHTML =
      `<span class="status-filter__check" aria-hidden="true">${active ? "✓" : ""}</span>` +
      `<span>${escHtml(opt.label)}</span>`;
    item.addEventListener("click", () => onChange(opt.value));
    item.addEventListener("keydown", (e) => {
      const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (delta !== 0) {
        e.preventDefault();
        const next = STATUS_FILTER_OPTIONS[(index + delta + STATUS_FILTER_OPTIONS.length) % STATUS_FILTER_OPTIONS.length]!;
        document.getElementById(`listone-status-filter-option-${next.value}`)?.focus();
      }
    });
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

// Small icon-only toggle for the column-visibility panel — sits at the
// right edge of the title row, same line as "LISTONE SVINCOLATI". Text
// label kept in aria-label/title (not on-screen) so the control stays
// compact without losing accessibility.
function renderColumnPanelToggle(open: boolean, onToggle: () => void): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "⚙";
  btn.setAttribute("aria-label", "Colonne visibili");
  btn.setAttribute("aria-expanded", String(open));
  btn.title = "Colonne visibili — apri/chiudi il pannello per scegliere quali colonne mostrare";
  btn.className = "btn btn--icon" + (open ? " is-active" : "");
  btn.style.flex = "none";
  btn.addEventListener("click", onToggle);
  return btn;
}

// Prev/next pagination controls — acts on the already-sorted/filtered pool
// (see paginateListonePool in listone.ts), so it never changes row order.
function renderListonePagination(page: number, totalPages: number, onChangePage: (page: number) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;font-size:12px;color:${C.textSec};`;

  const prev = document.createElement("button");
  prev.type = "button";
  prev.textContent = "◂ Precedente";
  prev.disabled = page <= 1;
  prev.className = "btn--pagination";
  prev.addEventListener("click", () => onChangePage(page - 1));

  const indicator = document.createElement("span");
  indicator.textContent = `Pagina ${page} di ${totalPages}`;

  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Successiva ▸";
  next.disabled = page >= totalPages;
  next.className = "btn--pagination";
  next.addEventListener("click", () => onChangePage(page + 1));

  wrap.appendChild(prev);
  wrap.appendChild(indicator);
  wrap.appendChild(next);
  return wrap;
}

// Clickable header row — click toggles asc/desc on that column (asc first).
// Kept in the DOM layer (not listone.ts) because click wiring needs
// addEventListener; the label text itself (with sort arrow) comes from the
// pure, tested listoneColumnHeaderLabel().
function renderListoneTableHead(
  columns: readonly ListoneColumn[],
  sort: ListoneSort | null,
  onSortColumn: (key: string) => void,
): HTMLElement {
  const head = document.createElement("div");
  head.className = "listone-table-head";
  for (const col of columns) {
    const cell = document.createElement("div");
    cell.style.cssText = `flex:${listoneColumnFlex(col.key)};cursor:pointer;user-select:none;`;
    cell.textContent = listoneColumnHeaderLabel(col, sort);
    cell.title = `${listoneColumnTooltip(col)} — clic per ordinare`;
    cell.addEventListener("click", () => onSortColumn(col.key));
    head.appendChild(cell);
  }
  return head;
}

// Column-visibility checkboxes — one per available column (core + any extra
// columns discovered in the loaded file). Toggling never touches the
// underlying pool, only which columns are rendered. Rendered inside the
// panel opened by renderColumnPanelToggle (see above), not sprawled under
// the title by default.
function renderListoneColumnSelector(
  columns: readonly ListoneColumn[],
  visibleColumnKeys: readonly string[],
  onToggleColumn: (key: string) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px;padding:10px;border:1px solid ${C.border};border-radius:8px;background:${C.panelInner};`;

  const label = document.createElement("span");
  label.style.cssText = `font-size:11px;font-weight:600;color:${C.textSec};`;
  label.textContent = "Colonne:";
  wrap.appendChild(label);

  for (const col of columns) {
    const chip = document.createElement("label");
    chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:${C.textMid};cursor:pointer;`;
    chip.title = listoneColumnTooltip(col);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = visibleColumnKeys.includes(col.key);
    checkbox.addEventListener("change", () => onToggleColumn(col.key));
    chip.appendChild(checkbox);
    chip.appendChild(document.createTextNode(col.label));
    wrap.appendChild(chip);
  }
  return wrap;
}

// Manual JSON loader — kept as a debug/override affordance, but collapsed
// behind a small disclosure by default now that the real listone auto-loads
// (see docs/data/LISTONE_UI_LOAD_CONTRACT.md): it no longer occupies
// primary visible space next to the table. Reads a file picked from local
// disk via FileReader and hands the raw text up to the caller — no fetch,
// no upload, no XLSX parsing. A successful load is saved to this browser's
// localStorage (main.ts savePersistedPool), but the shipped static asset
// still wins back on the next reload — this is a same-session override.
function renderListoneManualOverride(
  onFileText: (text: string) => void,
  hasPool: boolean,
  onForget: () => void,
  open: boolean,
  onToggle: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `margin-top:10px;`;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = `${open ? "▾" : "▸"} Caricamento manuale (debug/override)`;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.style.cssText = `font-size:11px;color:${C.textDim};background:none;border:none;padding:0;cursor:pointer;text-decoration:underline;`;
  toggle.addEventListener("click", onToggle);
  wrap.appendChild(toggle);

  if (!open) return wrap;

  const body = document.createElement("div");
  body.style.cssText = `display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;`;

  const label = document.createElement("label");
  label.style.cssText = `font-size:12px;font-weight:600;color:${C.textSec};cursor:pointer;border:1px solid ${C.border};border-radius:6px;padding:6px 10px;`;
  label.textContent = "Carica listone (JSON locale)";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.style.cssText = `display:none;`;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onFileText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsText(file);
    input.value = ""; // allow reselecting the same file after fixing it
  });
  label.appendChild(input);

  const hint = document.createElement("span");
  hint.style.cssText = `font-size:11px;color:${C.textDim};`;
  hint.textContent =
    "Solo locale: nessun upload, nessuna rete. Atteso JSON già normalizzato — nessun XLSX qui. Sovrascrive la sessione corrente; al reload torna il listone caricato automaticamente, se disponibile.";

  body.appendChild(label);
  body.appendChild(hint);

  if (hasPool) {
    const forget = document.createElement("span");
    forget.textContent = "✕ dimentica il listone salvato";
    forget.title = "Rimuove l'override dal browser (localStorage) e ritenta il listone caricato automaticamente";
    forget.style.cssText = `font-size:11px;color:${C.textDim};cursor:pointer;text-decoration:underline;`;
    forget.addEventListener("click", onForget);
    body.appendChild(forget);
  }

  wrap.appendChild(body);
  return wrap;
}

// ── Scarsità per ruolo (Chiamata moment) ──────────────────────────────────────
// Surfaces packages/engine/src/auction.ts roleScarcity(), which existed and
// was tested but had never been wired to a screen (#221).
//
// Two different numbers, deliberately labelled apart because they have
// different provenance and the UI matrix (docs/AUCTION_2026_EXECUTION_PLAN.md
// §3, "Scarsità | Visibile se derivata solo dal log dell'asta") treats them
// differently:
//  - "slot liberi sul tavolo" = leagueSlotsRemaining, summed over all 8 teams,
//    derived ONLY from the auction event log via reduce();
//  - "in listone" = poolRemaining, i.e. how many rows of that role the loaded
//    listone still has unsold. It is a row COUNT of the display-only listone
//    (never its quotation, never a ranking), and it is shown as `n/d` when no
//    listone is loaded rather than as a misleading 0.
// No model field, no receipt, no suggestion of whom to call.
export function renderRoleScarcityPanel(
  scarcity: Readonly<Record<Role, RoleScarcity>>,
  poolLoaded: boolean,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "role-scarcity-panel";
  panel.className = "panel scarcity-panel";
  panel.setAttribute("aria-label", "Scarsità per ruolo");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "SCARSITÀ PER RUOLO";
  panel.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "scarcity-grid";
  grid.id = "role-scarcity-grid";
  grid.innerHTML = ROLES.map((role) => {
    const s = scarcity[role];
    return `
      <div class="scarcity-cell" id="scarcity-${role}">
        <span class="scarcity-cell__head">${roleChipHtml(role)}<em>${escHtml(ROLE_LABELS[role])}</em></span>
        <span class="scarcity-metric">
          <span>slot liberi</span>
          <strong id="scarcity-slots-${role}">${s.leagueSlotsRemaining}</strong>
        </span>
        <span class="scarcity-metric scarcity-metric--secondary">
          <span>in listone</span>
          <strong id="scarcity-pool-${role}">${poolLoaded ? s.poolRemaining : "n/d"}</strong>
        </span>
      </div>`;
  }).join("");
  panel.appendChild(grid);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "role-scarcity-note";
  // Wording note: this copy deliberately says "log dell'asta" and never the
  // exact phrase used as the STORICO ACQUISTI panel title — several E2E specs
  // locate that panel with a case-insensitive `hasText`, which any nested
  // panel repeating the phrase would make ambiguous.
  note.textContent = poolLoaded
    ? "Slot liberi: slot di quel ruolo ancora vuoti su tutto il tavolo, somma delle 8 squadre, derivata dal log dell'asta. In listone: righe di quel ruolo non ancora assegnate nel listone caricato. Nessun dato di modello, nessun suggerimento."
    : "Slot liberi: slot di quel ruolo ancora vuoti su tutto il tavolo, somma delle 8 squadre, derivata dal log dell'asta. Nessun listone caricato: la disponibilità a listone resta n/d. Nessun dato di modello, nessun suggerimento.";
  panel.appendChild(note);

  return panel;
}

// ── War board TAVOLO — due varianti (#231 tranche 3, corsia B) ───────────────
// Product decision by Owner, 2026-08-14 ~12:50Z (bacheca #222 voce 18): MINI
// during the live auction, COMPLETA during player selection. The #86 UI
// invariant ("nessun blocco di tavolo nella schermata Asta") is revised in
// perimeter — not revoked — and the revision is registered in
// docs/FRONTEND_STRUCTURE.md §"Invarianti UI da preservare".
//
// Both wrappers are thin: every display choice (truncation, wording, markup)
// lives in the pure builders of ./warBoard.ts, which are unit-tested without
// a DOM. Both consume `warBoardRows()` output built by the caller — this file
// never calls the engine and never derives a number of its own.
//
// The AVVERSARI TIER-1 block stays where it is (Rose, renderOpponentTier1Panel
// below): this is a different component — all eight teams including "io",
// max bid included, no editing — not that one moved.

/**
 * MINI (momento asta): one strip, `budget` + `max bid` per team, nothing
 * else. It is deliberately NOT sticky — the sticky element on this screen is
 * the critical accounting strip (my own ceiling), and a second sticky band
 * would eat the vertical room the assign form needs mid-auction.
 */
export function renderWarBoardMini(
  rows: readonly WarBoardRow[],
  teamLabels: Readonly<Record<string, string>>,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "war-board-mini";
  panel.className = "panel war-board-mini";
  panel.setAttribute("aria-label", "Tavolo: budget e max bid di tutte le squadre");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "TAVOLO — BUDGET E MAX BID";
  panel.appendChild(title);

  const list = document.createElement("ul");
  list.id = "war-board-mini-list";
  list.className = "war-board-mini__list";
  list.innerHTML = warBoardMiniHtml(rows, teamLabels);
  panel.appendChild(list);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "war-board-mini-note";
  note.textContent = WAR_BOARD_MINI_NOTE;
  panel.appendChild(note);

  return panel;
}

/**
 * COMPLETA (momento chiamata): one card per team — budget, max bid, free
 * slots per role, last purchases.
 *
 * `poolIndex` is built ONCE by the caller for all eight cards (see
 * listonePoolIndex): resolving each acquisition's display name by scanning
 * the pool instead would be O(pool x acquisitions) on every render of a
 * screen that re-renders on every keystroke of the search box.
 */
export function renderWarBoardFull(
  rows: readonly WarBoardRow[],
  teamLabels: Readonly<Record<string, string>>,
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "war-board-full";
  panel.className = "panel war-board";
  panel.setAttribute("aria-label", "Tavolo: war board completo");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "TAVOLO — WAR BOARD";
  panel.appendChild(title);

  const grid = document.createElement("ul");
  grid.id = "war-board-full-grid";
  // Same 1/2/4 responsive breakpoints as SQUADRE (LEGA) and AVVERSARI TIER-1
  // (.teams-grid, src/styles/asta.css): all three are one-card-per-team grids
  // and must not disagree about when a column drops.
  grid.className = "teams-grid war-board__grid";
  grid.innerHTML = warBoardFullHtml(rows, teamLabels, poolIndex);
  panel.appendChild(grid);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "war-board-full-note";
  note.textContent = WAR_BOARD_FULL_NOTE;
  panel.appendChild(note);

  return panel;
}

// ── Contesto chiamata / `nomination_context` (Chiamata moment) ───────────────
// D7, Binario A (docs/DECISIONS.md §Prodotto): a READ-ONLY, ON-DEMAND panel
// for a player Owner is already considering, built ONLY from deterministic
// facts already in scope — opponents' residual budget, free slots per role,
// scarcity, top-of-role already assigned, prices from the event log.
//
// The D7 constraints are structural here, not stylistic:
//  - no per-opponent behavioural index: the opponent rows carry credits and
//    slots and nothing else;
//  - no ranking of nomination candidates: the only ordered list is of
//    purchases that already happened (see src/nominationContext.ts);
//  - no "chiama X" output: this panel names exactly one player, the one
//    already selected by Owner, and never proposes another;
//  - `nomination_context` never touches `max_safe`: the bid ceiling is
//    rendered by renderCriticalAuctionStrip/maxSafe() and no value computed
//    here is an input to it.
// Naming follows D7's approved list (`nomination_context`); none of the
// rejected names is used.

/** One already-assigned top-of-role purchase, resolved for display. */
export interface NominationContextTopEntry {
  readonly playerName: string;
  readonly teamLabel: string;
  readonly price: number;
}

export interface NominationContextProps {
  readonly playerName: string;
  readonly club: string;
  readonly role: Role;
  /** On-demand: the body exists in the DOM only when this is true. */
  readonly open: boolean;
  readonly scarcity: RoleScarcity;
  /** False when no listone is loaded — availability shows `n/d`, never 0. */
  readonly poolLoaded: boolean;
  readonly opponents: readonly OpponentTier1[];
  readonly teamLabels: Readonly<Record<string, string>>;
  readonly priceFacts: RolePriceFacts;
  readonly topAssigned: readonly NominationContextTopEntry[];
}

export function renderNominationContextPanel(
  props: NominationContextProps,
  onToggle: () => void,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "nomination-context";
  panel.className = "panel nomination-context";
  panel.setAttribute("aria-label", "Contesto chiamata");

  const head = document.createElement("div");
  head.className = "nomination-context__head";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "CONTESTO CHIAMATA";
  head.appendChild(title);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "nomination-context-toggle";
  toggle.className = "btn btn--secondary";
  toggle.setAttribute("aria-expanded", String(props.open));
  // On-demand means the body is genuinely absent from the DOM when collapsed,
  // so `aria-controls` is only set while the element it names actually exists
  // — a dangling idref is worse than no idref for a screen reader.
  if (props.open) toggle.setAttribute("aria-controls", "nomination-context-body");
  toggle.textContent = props.open ? "Nascondi contesto" : "Mostra contesto";
  toggle.addEventListener("click", onToggle);
  head.appendChild(toggle);

  panel.appendChild(head);

  const subject = document.createElement("p");
  subject.className = "hint-text";
  subject.id = "nomination-context-subject";
  subject.textContent = `Giocatore selezionato: ${props.playerName}${props.club ? ` (${props.club})` : ""} — ${ROLE_LABEL_SING[props.role]}.`;
  panel.appendChild(subject);

  if (!props.open) return panel;

  const body = document.createElement("div");
  body.id = "nomination-context-body";
  body.className = "nomination-context__body";

  // 1. Scarcity of THIS role — the same two differently-sourced numbers the
  //    standalone scarcity panel shows, restated for the selected role only.
  const scarcityBlock = document.createElement("div");
  scarcityBlock.className = "nomination-context__block";
  scarcityBlock.id = "nomination-context-scarcity";
  scarcityBlock.innerHTML =
    `<h3 class="nomination-context__block-title">Scarsità ${escHtml(ROLE_LABELS[props.role].toLowerCase())}</h3>` +
    `<ul class="nomination-context__facts">` +
    `<li><span>slot liberi sul tavolo</span><strong id="nomination-context-slots">${props.scarcity.leagueSlotsRemaining}</strong></li>` +
    `<li><span>in listone</span><strong id="nomination-context-pool">${props.poolLoaded ? props.scarcity.poolRemaining : "n/d"}</strong></li>` +
    `</ul>`;
  body.appendChild(scarcityBlock);

  // 2. Prices ALREADY PAID in this role, straight from the event log.
  const pricesBlock = document.createElement("div");
  pricesBlock.className = "nomination-context__block";
  pricesBlock.id = "nomination-context-prices";
  const facts = props.priceFacts;
  pricesBlock.innerHTML =
    `<h3 class="nomination-context__block-title">Prezzi già pagati nel ruolo</h3>` +
    `<ul class="nomination-context__facts">` +
    `<li><span>acquisti registrati</span><strong id="nomination-context-purchases">${facts.purchases}</strong></li>` +
    `<li><span>prezzo minimo</span><strong>${facts.minPrice === null ? "n/d" : `${facts.minPrice} cr`}</strong></li>` +
    `<li><span>prezzo massimo</span><strong>${facts.maxPrice === null ? "n/d" : `${facts.maxPrice} cr`}</strong></li>` +
    `<li><span>totale speso</span><strong>${facts.totalSpent} cr</strong></li>` +
    `</ul>`;
  body.appendChild(pricesBlock);

  // 3. Top of role ALREADY ASSIGNED — past purchases, never callable again.
  const topBlock = document.createElement("div");
  topBlock.className = "nomination-context__block";
  topBlock.id = "nomination-context-top";
  const topRows =
    props.topAssigned.length === 0
      ? `<li class="nomination-context__empty">Nessun ${escHtml(ROLE_LABEL_SING[props.role].toLowerCase())} ancora assegnato.</li>`
      : props.topAssigned
          .map(
            (entry) =>
              `<li><span>${escHtml(entry.playerName)} · ${escHtml(entry.teamLabel)}</span><strong>${entry.price} cr</strong></li>`,
          )
          .join("");
  topBlock.innerHTML =
    `<h3 class="nomination-context__block-title">Top di ruolo già assegnati</h3>` +
    `<ul class="nomination-context__facts">${topRows}</ul>`;
  body.appendChild(topBlock);

  // 4. Opponent accounting: credits and free slots, nothing else.
  const opponentsBlock = document.createElement("div");
  opponentsBlock.className = "nomination-context__block nomination-context__block--wide";
  opponentsBlock.id = "nomination-context-opponents";
  const opponentRows = props.opponents
    .map((opponent) => {
      const label = props.teamLabels[opponent.fantaTeamId] ?? opponent.fantaTeamId;
      return (
        `<li id="nomination-context-opponent-${escHtml(opponent.fantaTeamId)}">` +
        `<span>${escHtml(label)}</span>` +
        `<strong>${opponent.budgetResidual} cr</strong>` +
        `<em>${opponent.slotsRemaining[props.role]} slot ${escHtml(props.role)} · ${opponent.totalSlotsRemaining} totali</em>` +
        `</li>`
      );
    })
    .join("");
  opponentsBlock.innerHTML =
    `<h3 class="nomination-context__block-title">Avversari — credito e slot residui</h3>` +
    `<ul class="nomination-context__opponents" id="nomination-context-opponents-list">${opponentRows}</ul>`;
  body.appendChild(opponentsBlock);

  panel.appendChild(body);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "nomination-context-note";
  note.textContent =
    "Solo fatti deterministici dal log dell'asta e dal listone caricato. Non è una raccomandazione di chiamata, non ordina i giocatori da chiamare e non modifica il max bid sicuro.";
  panel.appendChild(note);

  return panel;
}

// ── Command line di inserimento (Chiamata moment) ────────────────────────────
// #231 (T13): the fast path. One typed line — `<squadra> <prezzo> <giocatore>`
// — records a purchase without walking select -> Avvia -> price -> conferma.
//
// The whole safety argument lives in src/assignCommand.ts: this view only
// renders what the resolver already decided. Two properties matter here and
// are structural, not cosmetic:
//
//  1. The preview is ALWAYS rendered before the commit, and states exactly
//     which player, which team and which price will be written. The operator
//     reads the interpretation, not just their own typing.
//  2. Enter (and the button) commit ONLY when the line resolves to exactly one
//     purchase. An ambiguous or unknown line does nothing but explain itself —
//     it never falls back to a "best" match. At the table a wrong assignment
//     costs far more than retyping.
//
// No suggestion, no ranking, no value: the panel proposes nothing and only
// echoes what was typed. `max_safe` and the hard reserve are untouched — a
// command that violates them is refused by purchaseFeasibility() exactly like
// a form entry (see renderAssignCommandFeedback's "not-feasible" branch and
// docs/NO_GO.md §Prodotto).

export interface AssignCommandPanelProps {
  readonly value: string;
  /** `null` while the line is empty — nothing to interpret yet. */
  readonly resolution: AssignCommandResolution | null;
  /** Message from a refused/failed execution, already human-readable. */
  readonly error: string;
}

export interface AssignCommandPanelHandlers {
  readonly onInput: (value: string) => void;
  readonly onSubmit: () => void;
}

/** The one-line explanation of what the resolver made of the typed line. */
function assignCommandPreviewText(resolution: AssignCommandResolution): string {
  if (resolution.ok) {
    const r = resolution.resolved;
    const club = r.club ? ` (${r.club})` : "";
    return `Registrerà: ${r.playerName}${club} · ${ROLE_LABEL_SING[r.role]} → ${r.teamLabel} · ${r.price} cr.`;
  }
  switch (resolution.reason) {
    case "empty":
      return "";
    case "price-missing":
      return "Manca il prezzo: serve un numero intero positivo tra squadra e giocatore.";
    case "price-ambiguous":
      return "Due numeri interi nella riga: non è chiaro quale sia il prezzo. Riscrivi la riga con un solo numero.";
    case "team-missing":
      return "Manca la squadra prima del prezzo.";
    case "player-missing":
      return "Manca il giocatore dopo il prezzo.";
    case "team-not-found":
      return `Nessuna squadra corrisponde a "${resolution.query}".`;
    case "team-ambiguous":
      return `"${resolution.query}" corrisponde a più squadre: ${resolution.candidates.join(", ")}. Aggiungi lettere.`;
    case "player-not-found":
      return `Nessun giocatore disponibile corrisponde a "${resolution.query}".`;
    case "player-ambiguous":
      return `"${resolution.query}" corrisponde a più giocatori: ${resolution.candidates.join(", ")}. Aggiungi il club o altre lettere.`;
    case "player-already-assigned":
      return `${resolution.playerName} è già stato assegnato.`;
  }
}

export function renderAssignCommandPanel(
  props: AssignCommandPanelProps,
  handlers: AssignCommandPanelHandlers,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "assign-command-panel";
  panel.className = "panel assign-command";
  panel.setAttribute("aria-label", "Inserimento rapido da riga di comando");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "INSERIMENTO RAPIDO";
  panel.appendChild(title);

  const row = document.createElement("div");
  row.className = "assign-command__row";

  const input = document.createElement("input");
  input.id = "assign-command-input";
  input.name = "assign-command-input";
  input.type = "text";
  input.className = "field-input";
  input.autocomplete = "off";
  input.placeholder = "squadra prezzo giocatore — es. look 34 ataturk";
  input.setAttribute("aria-describedby", "assign-command-preview");
  input.value = props.value;
  input.addEventListener("input", (e) => handlers.onInput((e.target as HTMLInputElement).value));
  input.addEventListener("keydown", (e) => {
    // Enter is the whole point of the fast path, but it is inert unless the
    // line already resolves — see the panel comment above.
    if (e.key === "Enter") {
      e.preventDefault();
      handlers.onSubmit();
    }
  });
  row.appendChild(input);

  const submit = document.createElement("button");
  submit.id = "assign-command-submit";
  submit.type = "button";
  submit.className = "btn btn--primary";
  submit.textContent = "Registra da comando";
  submit.disabled = !(props.resolution?.ok ?? false);
  submit.addEventListener("click", handlers.onSubmit);
  row.appendChild(submit);

  panel.appendChild(row);

  // aria-live so the interpretation is announced as it changes: the operator
  // must never commit a line whose reading they could not perceive.
  const preview = document.createElement("p");
  preview.id = "assign-command-preview";
  preview.setAttribute("role", "status");
  preview.setAttribute("aria-live", "polite");
  const resolution = props.resolution;
  if (resolution === null) {
    preview.className = "hint-text";
    preview.textContent =
      "Ordine fisso: squadra, prezzo, giocatore. Invio registra solo quando la riga individua una sola squadra e un solo giocatore.";
  } else {
    preview.className = resolution.ok
      ? "assign-command__preview assign-command__preview--ready"
      : "assign-command__preview assign-command__preview--blocked";
    preview.textContent = assignCommandPreviewText(resolution);
  }
  panel.appendChild(preview);

  if (props.error) {
    const error = document.createElement("p");
    error.id = "assign-command-error";
    error.setAttribute("role", "alert");
    error.className = "assign-command__error";
    error.textContent = props.error;
    panel.appendChild(error);
  }

  return panel;
}

// ── Insight giocatore (Asta moment) ───────────────────────────────────────────
// STILL a devStaticPanel, on purpose, while the two blocks below it stopped
// being one. Every PLAYER-LEVEL measured fact the engine can produce today
// needs the anchor book (`AnchorBook`, packages/engine/src/anchors.ts): the
// current anchor, the cliff to the next available player of the role, the
// tension band — all three take `book` as a required input, and the book is
// built from the listone's Qt.A, which this app does not yet declare. The
// only player-level fact reachable without it is "is he still available",
// which in this moment is a tautology (the moment is open on him).
// The listone quotation cannot fill the gap either: the UI matrix
// (docs/AUCTION_2026_EXECUTION_PLAN.md §3) admits it display-only and
// forbids deriving scarcity, ranking or any suggestion from it.
// An honest empty block beats a number nobody measured — so this one waits.
export function renderPlayerInsightsBlock(): HTMLElement {
  return devStaticPanel(
    "INSIGHT GIOCATORE",
    "Richiede insight statici sul giocatore chiamato (non implementati).",
    "Nessun insight disponibile per questo giocatore.",
  );
}

// ── Momento dell'asta (Asta moment) ──────────────────────────────────────────
// Was a devStaticPanel whose own note named the source it was waiting for
// ("osservazioni derivate dallo storico, es. scarsità ruolo"). That source
// exists and was already wired — but only to the `chiamata` moment
// (renderRoleScarcityPanel above). This block brings it to the live screen,
// where "how many of this role are left on the table" is the question, and
// adds the second half of the same census: how many credits and how many
// slots the table still has (`residualPressure`, packages/engine/src/
// anchors.ts). Both are derived from the event log alone.
//
// The DEV STATICO marker is gone because the block is no longer non-operative
// — that marker means exactly "questo blocco non fa nulla di reale"
// (src/ui/devStatic.ts), and keeping it over real numbers would be the same
// dishonesty in the opposite direction. Nothing that was displayed here has
// been dropped: the placeholder displayed one sentence saying it had nothing.

export interface MomentFactsProps {
  readonly scarcity: Readonly<Record<Role, RoleScarcity>>;
  /** False when no listone is loaded — availability shows `n/d`, never 0. */
  readonly poolLoaded: boolean;
  /** The called player's role, marked in the grid. `""` marks nothing. */
  readonly calledRole: Role | "";
  readonly pressure: ResidualPressure;
}

export function renderMomentInsightsBlock(props: MomentFactsProps): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "moment-facts-panel";
  panel.className = "panel moment-facts";
  panel.setAttribute("aria-label", "Momento dell'asta: scarsità per ruolo e mercato");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "MOMENTO DELL'ASTA";
  panel.appendChild(title);

  const grid = document.createElement("div");
  grid.id = "moment-scarcity-grid";
  grid.className = "moment-scarcity__grid";
  grid.innerHTML = momentScarcityHtml(props.scarcity, props.poolLoaded, props.calledRole);
  panel.appendChild(grid);

  const market = document.createElement("div");
  market.innerHTML = marketPressureHtml(props.pressure);
  panel.appendChild(market);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "moment-facts-note";
  note.textContent = MOMENT_FACTS_NOTE;
  panel.appendChild(note);

  return panel;
}

// ── Avversari: chi può arrivare alla cifra (Asta moment) ─────────────────────
// Was a devStaticPanel with two empty lists ("POTENZIALMENTE INTERESSATI:
// nessuno tra quelli tracciati" / "PROBABILMENTE NON INTERESSATI: nessuno")
// and a note naming the missing logic: "slot mancanti + budget avversario".
// That is exactly `competitorSet()` (packages/engine/src/competitors.ts),
// whose inputs — AuctionState, role, threshold — are all already on this
// screen. Both groups survive, in the same order and the same place; what
// changes is that they now carry the eight teams' real numbers instead of a
// placeholder, and their headings state the basis that actually produced them
// ("può arrivarci", a hard constraint) rather than an interest the engine
// explicitly refuses to infer (§D9: no behavioural score, no declared intent).
//
// The PANEL TITLE follows the same rule as the headings, and for the same
// reason. It used to read "AVVERSARI — INTERESSE SUL GIOCATORE", inherited
// from the placeholder: an assertion about intent that `competitorSet` does
// not compute and §D9 forbids inferring. It now names what is actually
// measured — arithmetic reachability. The disclaimer in OPPONENT_REACH_NOTE
// («può arrivarci non significa lo vuole») stays: with the title corrected it
// is no longer a rebuttal of the panel's own heading, but it still guards the
// reading of the numbers, and a precision that costs one line does no harm.

export interface OpponentReachProps {
  /** `null` when the moment carries no role — see OPPONENT_REACH_NO_ROLE. */
  readonly set: CompetitorSet | null;
  readonly teamLabels: Readonly<Record<string, string>>;
  readonly thresholdSource: ReachThresholdSource;
}

export function renderOpponentInterestBlock(props: OpponentReachProps): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "opponent-reach-panel";
  panel.className = "panel opponent-reach";
  // The visible title is short on purpose — it sits on the tightest screen of
  // the app, must stay on one line down to 390px, and echoes the two group
  // headings word for word so title, headline and groups read as one
  // statement. The aria-label carries the same fact spelled out in full,
  // where there is no width to fight for.
  panel.setAttribute(
    "aria-label",
    "Avversari: chi può ancora arrivare alla cifra, per solo vincolo duro",
  );

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = OPPONENT_REACH_TITLE;
  panel.appendChild(title);

  const headline = document.createElement("p");
  headline.id = "opponent-reach-headline";
  headline.className = "opponent-reach__headline";
  // aria-live: mid-auction this line changes as the price is typed, without a
  // full re-render (see updateOpponentReach in main.ts), so the change has to
  // be announced rather than only repainted.
  headline.setAttribute("role", "status");
  headline.setAttribute("aria-live", "polite");
  panel.appendChild(headline);

  const body = document.createElement("div");
  body.id = "opponent-reach-body";
  body.className = "opponent-reach__body";
  panel.appendChild(body);

  fillOpponentReach(panel, props);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "opponent-reach-note";
  note.textContent = OPPONENT_REACH_NOTE;
  panel.appendChild(note);

  return panel;
}

/**
 * Writes the headline + the two groups into an already-mounted panel. Split
 * out of the builder above because the live screen updates this block WITHOUT
 * re-rendering: the price field deliberately does not call render() (it would
 * lose focus and caret mid-auction — see main.ts), so the same in-place patch
 * idiom `#price-display` already uses is what keeps the threshold shown here
 * equal to the figure actually typed.
 */
export function fillOpponentReach(root: ParentNode, props: OpponentReachProps): void {
  const headline = root.querySelector("#opponent-reach-headline");
  const body = root.querySelector("#opponent-reach-body");
  if (headline === null || body === null) return;
  if (props.set === null) {
    headline.textContent = OPPONENT_REACH_NO_ROLE;
    body.innerHTML = "";
    return;
  }
  headline.textContent = competitorReachHeadline(props.set, props.thresholdSource);
  body.innerHTML = competitorReachHtml(props.set, props.teamLabels);
}

// ── Impostazioni — left menu, content on the right ──────────────────────────
// Everything on this screen reports or edits REAL state, so nothing here is
// wrapped in devStaticPanel: that marker means "non operativo".

/** Monochrome, currentColor line icons — one per settings area, matching the
 *  app's existing glyph-not-emoji idiom (⚙, ▸/▾, ●). */
export const SETTINGS_ICONS = {
  people:
    '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 14c0-2.4 2-3.9 4.5-3.9s4.5 1.5 4.5 3.9"/><path d="M11 3.4a2.5 2.5 0 0 1 0 4.6"/><path d="M12.6 10.4c1.3.6 1.9 1.8 1.9 3.6"/>',
  confirm: '<path d="M2 8.4 6 12l8-8"/>',
  status: '<path d="M1.5 8h3l2-4.6L9.6 12l1.9-4h3"/>',
} as const;

export interface SettingsArea {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  /** Built lazily: only the selected area's body is constructed. */
  readonly body: () => HTMLElement;
}

/**
 * Master/detail settings: the menu is a vertical tablist and the right pane
 * the matching tabpanel, which is the ARIA pattern for "pick one, swap the
 * content in place" — so the menu is reachable with arrow keys and the
 * selected item is announced as such, not merely coloured differently.
 * `activeId` comes from app state rather than the DOM because render()
 * rebuilds the whole tree on every keystroke inside a panel.
 */
export function renderImpostazioniScreen(
  areas: readonly SettingsArea[],
  activeId: string,
  onSelect: (id: string) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "settings-layout";

  const active = areas.find((area) => area.id === activeId) ?? areas[0];

  const menu = document.createElement("div");
  menu.className = "settings-menu";
  menu.id = "settings-menu";
  menu.setAttribute("role", "tablist");
  menu.setAttribute("aria-orientation", "vertical");
  menu.setAttribute("aria-label", "Sezioni delle impostazioni");

  areas.forEach((area, index) => {
    const isActive = area.id === active?.id;
    const item = document.createElement("button");
    item.type = "button";
    item.id = `settings-tab-${area.id}`;
    item.className = `settings-menu__item${isActive ? " is-active" : ""}`;
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(isActive));
    item.setAttribute("aria-controls", "settings-panel");
    // Roving tabindex: one stop for the whole menu, arrows move within it.
    item.tabIndex = isActive ? 0 : -1;
    item.innerHTML =
      `<svg class="settings-menu__icon" viewBox="0 0 16 16" width="15" height="15" fill="none" ` +
      `stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ` +
      `aria-hidden="true">${area.icon}</svg>` +
      `<span>${escHtml(area.title)}</span>`;
    item.addEventListener("click", () => onSelect(area.id));
    item.addEventListener("keydown", (e) => {
      const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      let next: number | null = null;
      if (delta !== 0) next = (index + delta + areas.length) % areas.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = areas.length - 1;
      if (next === null) return;
      e.preventDefault();
      onSelect(areas[next]!.id);
    });
    menu.appendChild(item);
  });
  wrap.appendChild(menu);

  const panel = document.createElement("section");
  panel.className = "settings-panel";
  panel.id = "settings-panel";
  panel.setAttribute("role", "tabpanel");
  if (active) {
    panel.setAttribute("aria-labelledby", `settings-tab-${active.id}`);
    const heading = document.createElement("h2");
    heading.className = "settings-panel__title";
    heading.textContent = active.title;
    panel.appendChild(heading);
    panel.appendChild(active.body());
  }
  wrap.appendChild(panel);

  return wrap;
}

// ── Rose screen — read-only recap derived from the real AuctionState ─────────
// The grid itself is REAL data (names/prices/slots from the event log via
// reduce, done by the caller) — no marker on the grid. Only the interactive
// controls (svincola / assegna / modifica budget) are non-operative and
// carry the DEV badge; clicking them opens a mock modal via onMockAction.
export function renderRoseScreen(
  aState: AuctionState,
  fantaTeamIds: readonly string[],
  selfId: string,
  pool: readonly ListonePlayer[],
  onMockAction: (title: string, body: string) => void,
  // Display labels keyed by the stable team id; an id absent here shows itself.
  teamLabels: Readonly<Record<string, string>> = {},
  // Pure accounting rows from packages/engine/src/auction.ts opponentTier1(),
  // built by the caller. Empty array -> the panel is not rendered at all.
  opponents: readonly OpponentTier1[] = [],
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "screen-container";
  wrap.style.cssText = `flex:1;padding:18px 24px;gap:12px;`;

  const hint = document.createElement("div");
  hint.className = "hint-text";
  hint.innerHTML = `Rose — sola lettura, derivata dallo storico acquisti. Le icone <span style="border:1px dashed ${C.textDim};border-radius:3px;padding:0 3px;">DEV</span> non eseguono azioni reali.`;
  wrap.appendChild(hint);

  if (opponents.length > 0) {
    wrap.appendChild(renderOpponentTier1Panel(opponents, teamLabels));
  }

  // Responsive breakpoints (1/2/4 per row) live in src/styles/asta.css
  // (.teams-grid) — inline styles can't express @media, see that file. Same
  // class the "SQUADRE (LEGA)" panel uses (src/main.ts renderTeamsPanel):
  // both are one-card-per-team grids, so they share the same breakpoints.
  const grid = document.createElement("div");
  grid.className = "teams-grid";

  // ONE index for all eight cards (audit round 2, finding 2): every roster
  // entry resolves its display name in O(1) instead of scanning the whole pool
  // — 224 rows against a 532-row listone cost ~110 ms per Rose render before.
  const poolIndex = listonePoolIndex(pool);

  for (const teamId of fantaTeamIds) {
    const team = aState.teams[teamId];
    grid.appendChild(renderRoseCard(teamId, team, selfId, poolIndex, onMockAction, teamLabels[teamId] ?? teamId));
  }

  wrap.appendChild(grid);
  return wrap;
}

// ── AVVERSARI TIER-1 — contabilità (Rose screen) ─────────────────────────────
// Surfaces packages/engine/src/auction.ts opponentTier1(), implemented and
// tested but never called from a screen since PR #86 removed its panel (#221).
//
// UI invariant, honoured integrally (docs/FRONTEND_STRUCTURE.md §"Invarianti
// UI da preservare"): the `AVVERSARI TIER-1` block "non deve riapparire nella
// schermata Asta". This accounting view therefore lives on the **Rose**
// screen, never on Asta, and is not laid out next to the auction accounting
// the way the removed block was. It is pure arithmetic off the event log —
// residual budget and free slots per opponent — with no behavioural index, no
// interest estimate and no ordering by anything but the team id the engine
// already sorts on.
//
// The 2026-08-14 revision of that invariant (#222 voce 18, #231 tranche 3)
// admits the WAR BOARD to the Asta screen — a different component, see
// renderWarBoardMini/renderWarBoardFull above — and leaves THIS block exactly
// where it is. `e2e/opponent-tier1-accounting.spec.ts` still enforces it.
export function renderOpponentTier1Panel(
  opponents: readonly OpponentTier1[],
  teamLabels: Readonly<Record<string, string>>,
): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "opponent-tier1-panel";
  panel.className = "panel opponent-tier1";
  panel.setAttribute("aria-label", "Avversari Tier-1, contabilità");

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "AVVERSARI TIER-1 — CONTABILITÀ";
  panel.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "opponent-tier1__grid";
  grid.id = "opponent-tier1-grid";
  grid.innerHTML = opponents
    .map((opponent) => {
      const label = teamLabels[opponent.fantaTeamId] ?? opponent.fantaTeamId;
      const slots = ROLES.map(
        (role) =>
          `<span class="opponent-tier1__slot">${roleChipHtml(role)}<em>${opponent.slotsRemaining[role]}</em></span>`,
      ).join("");
      return `
        <div class="opponent-tier1__card" id="opponent-tier1-${escHtml(opponent.fantaTeamId)}">
          <span class="opponent-tier1__name">${escHtml(label)}</span>
          <span class="opponent-tier1__budget">${opponent.budgetResidual} <em>cr residui</em></span>
          <span class="opponent-tier1__total">slot residui: <strong>${opponent.totalSlotsRemaining}</strong></span>
          <span class="opponent-tier1__slots">${slots}</span>
        </div>`;
    })
    .join("");
  panel.appendChild(grid);

  const note = document.createElement("p");
  note.className = "hint-text";
  note.id = "opponent-tier1-note";
  note.textContent =
    "Sola contabilità derivata dal log dell'asta: credito residuo e slot ancora liberi per ogni avversario. Nessuna stima di interesse, nessun indice comportamentale, nessuna raccomandazione.";
  panel.appendChild(note);

  return panel;
}

function renderRoseCard(
  teamId: string,
  team: AuctionState["teams"][string] | undefined,
  selfId: string,
  poolIndex: ReadonlyMap<string, ListonePlayer>,
  onMockAction: (title: string, body: string) => void,
  label: string,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "panel--compact";
  card.style.overflow = "hidden";

  const isSelf = teamId === selfId;
  const header = document.createElement("div");
  header.style.cssText = `display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;`;

  const nameEl = document.createElement("div");
  nameEl.style.cssText = `font-weight:700;font-size:13.5px;color:${C.textPrimary};`;
  nameEl.textContent = label + (isSelf ? " ● io" : "");

  const creditsWrap = document.createElement("div");
  creditsWrap.style.cssText = `display:flex;align-items:center;gap:5px;`;
  const creditsEl = document.createElement("span");
  creditsEl.style.cssText = `font-family:${C.mono};font-size:12.5px;color:${C.green};`;
  creditsEl.textContent = `${team?.budgetResidual ?? INITIAL_BUDGET} cr`;
  const editIcon = document.createElement("span");
  editIcon.textContent = "✎";
  editIcon.title = "Modifica credito residuo (non attivo)";
  editIcon.style.cssText = `font-size:12px;color:${C.textDim};cursor:pointer;`;
  editIcon.appendChild(devStaticBadge());
  editIcon.addEventListener("click", () =>
    onMockAction(
      "Modifica credito residuo",
      `Funzione non attiva in questa shell di sviluppo. In produzione permetterebbe di correggere manualmente il budget residuo di ${label}. Nessuna azione eseguita.`,
    ),
  );
  creditsWrap.appendChild(creditsEl);
  creditsWrap.appendChild(editIcon);

  header.appendChild(nameEl);
  header.appendChild(creditsWrap);
  card.appendChild(header);

  for (const role of ROLES) {
    const total = ROSTER_REQUIREMENTS[role] ?? 0;
    const roster = team?.roster ?? [];
    const roleEntries = roster.filter((e) => e.role === role);

    const gapDiv = document.createElement("div");
    gapDiv.style.height = "4px";
    card.appendChild(gapDiv);

    for (let i = 0; i < total; i++) {
      const entry = roleEntries[i];
      const row = document.createElement("div");
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px;`;

      row.appendChild(renderRoleChip(role));

      if (entry) {
        const name = document.createElement("span");
        name.style.cssText = `color:${C.textMid};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
        const playerDisplay = resolvePlayerDisplayName(entry.playerId, poolIndex);
        name.textContent = playerDisplay;
        name.title = playerDisplay;

        const price = document.createElement("span");
        price.style.cssText = `font-family:${C.mono};color:oklch(0.78 0.006 270);flex:none;`;
        price.textContent = String(entry.price);

        const svincola = document.createElement("span");
        svincola.textContent = "✕";
        svincola.title = "Svincola (non attivo)";
        svincola.style.cssText = `color:${C.textDim};cursor:pointer;font-size:12px;flex:none;`;
        svincola.appendChild(devStaticBadge());
        svincola.addEventListener("click", () =>
          onMockAction(
            `Svincolare ${playerDisplay}?`,
            `Funzione non attiva in questa shell di sviluppo. In produzione libererebbe lo slot ${role} senza restituire i ${entry.price} cr al budget residuo (azione irreversibile). Nessuna azione eseguita.`,
          ),
        );

        row.appendChild(name);
        // Tranche 2b (#231): a riconferma pre-asta (LEAGUE_RULES.md §4) is
        // seeded into the roster by reduce() with seq < 0 (strictly below
        // every live event's seq, which is always >= 0 by schema — see
        // packages/engine/src/reduce.ts) — the only signal this view needs
        // to tell "riconfermato" apart from "acquistato live" without a new
        // field on RosterEntry.
        if (entry.seq < 0) {
          const confirmedBadge = document.createElement("span");
          confirmedBadge.className = "roster-badge-confirmed";
          confirmedBadge.textContent = "R";
          confirmedBadge.title = "Riconfermato pre-asta (regolamento di lega, §4)";
          // Fix 5 (a11y, round 2, #285): `title` is a tooltip, not a
          // guaranteed accessible name for a plain <span> across AT — the
          // badge needs its own explicit name.
          confirmedBadge.setAttribute("aria-label", "Riconfermato");
          row.appendChild(confirmedBadge);
        }
        row.appendChild(price);
        row.appendChild(svincola);
      } else {
        const empty = document.createElement("span");
        empty.textContent = "— assegna";
        empty.title = "Assegna giocatore d'ufficio (non attivo)";
        empty.style.cssText = `font-size:11px;color:${C.textDim};cursor:pointer;`;
        empty.appendChild(devStaticBadge());
        empty.addEventListener("click", () =>
          onMockAction(
            "Assegna giocatore",
            `Funzione non attiva in questa shell di sviluppo. In produzione permetterebbe di assegnare un giocatore a questo slot ${role} per ${label}. Nessuna azione eseguita.`,
          ),
        );
        row.appendChild(empty);
      }

      card.appendChild(row);
    }
  }

  return card;
}

// ── Generic mock modal — used by Rose's DEV controls ──────────────────────────
export function renderMockModal(title: string, body: string, onClose: () => void): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const inner = document.createElement("div");
  const t = document.createElement("div");
  t.style.cssText = `font-size:15px;font-weight:700;color:white;margin-bottom:8px;`;
  t.textContent = title;
  const b = document.createElement("div");
  b.style.cssText = `font-size:13px;line-height:1.55;color:${C.textMid};margin-bottom:16px;`;
  b.textContent = body;
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Chiudi";
  closeBtn.className = "btn btn--secondary";
  closeBtn.addEventListener("click", onClose);
  inner.appendChild(t);
  inner.appendChild(b);
  inner.appendChild(closeBtn);

  const modal = devStaticPanel("", "Modale dimostrativa — nessuna azione reale eseguita.", inner);
  modal.style.maxWidth = "400px";
  modal.style.width = "100%";
  overlay.appendChild(modal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });

  return overlay;
}

// ── Recovery — fail-closed auction log persistence (LIVE-02) ─────────────
// See src/logRecovery.ts for the validation/storage module this renders
// state for. Deliberately NOT a modal: a blocked/storage-error state
// replaces the entire screen (nothing critical is ever hidden behind it),
// and the recovered/started-new notice is a persistent inline panel below
// the header, not an overlay.

export interface RecoveryBlockedProps {
  readonly reason: "invalid-log" | "storage-error";
  /** Exact quarantined text, or null when there was nothing readable to
   *  quarantine (a "storage-error" raised before any canonical could be read). */
  readonly quarantinedRaw: string | null;
  readonly quarantineStored: boolean;
  readonly storageErrorMessage: string | null;
  readonly confirmingNewLog: boolean;
}

export interface RecoveryBlockedHandlers {
  readonly onRetry: () => void;
  readonly onExport: () => void;
  readonly onRequestStartNew: () => void;
  readonly onConfirmStartNew: () => void;
  readonly onCancelStartNew: () => void;
}

/**
 * Full-screen recovery/error state — replaces the entire app shell (see
 * main.ts render()). Blocks normal auction mutations until resolved: either
 * a retry succeeds, or the user explicitly confirms starting a new (empty)
 * log. Always offers the exact corrupted payload for export when one
 * exists; never offers "start new" before that export option is visible.
 */
export function renderRecoveryBlockedScreen(
  props: RecoveryBlockedProps,
  handlers: RecoveryBlockedHandlers,
): HTMLElement {
  const { reason, quarantinedRaw, quarantineStored, storageErrorMessage, confirmingNewLog } = props;
  const { onRetry, onExport, onRequestStartNew, onConfirmStartNew, onCancelStartNew } = handlers;

  const wrap = document.createElement("div");
  wrap.setAttribute("role", "alert");
  wrap.style.cssText = `max-width:640px;margin:48px auto;padding:0 24px;display:flex;flex-direction:column;gap:16px;`;

  const title = document.createElement("h1");
  title.id = "recovery-heading";
  title.tabIndex = -1;
  title.style.cssText = `font-size:20px;font-weight:700;color:${C.stopRed};margin:0;`;
  title.textContent =
    reason === "storage-error"
      ? "Storage del browser non disponibile"
      : "Storico asta non valido — recovery richiesta";
  wrap.appendChild(title);

  const body = document.createElement("div");
  body.style.cssText = `font-size:14px;line-height:1.6;color:${C.textMid};`;
  body.textContent =
    reason === "storage-error"
      ? `Non è stato possibile leggere o aggiornare lo storico asta salvato nel browser (${escHtml(storageErrorMessage ?? "errore sconosciuto")}). ` +
        `L'app non procede finché lo storage non torna utilizzabile: nessuna azione qui verrebbe salvata davvero.`
      : "Il file dello storico asta salvato in questo browser non è valido (corrotto o alterato). " +
        "Per evitare di perdere o sovrascrivere dati reali, l'asta non riparte automaticamente da uno storico vuoto. " +
        "Non esiste una copia di sicurezza valida da cui ripristinare.";
  wrap.appendChild(body);

  if (quarantinedRaw !== null && !quarantineStored) {
    const warning = document.createElement("div");
    warning.setAttribute("role", "status");
    warning.style.cssText = `font-size:13px;line-height:1.5;color:${C.stopRed};`;
    warning.textContent =
      "La quarantena non può essere salvata nello storage. Il payload resta disponibile in memoria ed è comunque esportabile finché questa pagina resta aperta.";
    wrap.appendChild(warning);
  }

  const actions = document.createElement("div");
  actions.style.cssText = `display:flex;flex-wrap:wrap;gap:10px;`;

  const retryBtn = document.createElement("button");
  retryBtn.id = "recovery-retry-btn";
  retryBtn.type = "button";
  retryBtn.textContent = "Riprova lettura storage";
  retryBtn.className = "btn btn--secondary";
  retryBtn.addEventListener("click", onRetry);
  actions.appendChild(retryBtn);

  if (quarantinedRaw !== null) {
    const exportBtn = document.createElement("button");
    exportBtn.id = "recovery-export-btn";
    exportBtn.type = "button";
    exportBtn.textContent = "Esporta payload corrotto";
    exportBtn.className = "btn btn--secondary";
    exportBtn.addEventListener("click", onExport);
    actions.appendChild(exportBtn);

    if (!confirmingNewLog && reason === "invalid-log") {
      const startNewBtn = document.createElement("button");
      startNewBtn.id = "recovery-start-new-btn";
      startNewBtn.type = "button";
      startNewBtn.textContent = "Inizia nuovo log";
      startNewBtn.className = "btn btn--danger";
      startNewBtn.addEventListener("click", onRequestStartNew);
      actions.appendChild(startNewBtn);
    }
  }

  wrap.appendChild(actions);

  if (confirmingNewLog) {
    const confirmPanel = document.createElement("div");
    confirmPanel.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:10px;padding:16px 18px;background:${C.panelInner};`;

    const confirmTitle = document.createElement("div");
    confirmTitle.style.cssText = `font-size:14px;font-weight:700;color:${C.textPrimary};margin-bottom:8px;`;
    confirmTitle.textContent = "Confermi di iniziare un nuovo log vuoto?";
    confirmPanel.appendChild(confirmTitle);

    const confirmBody = document.createElement("div");
    confirmBody.style.cssText = `font-size:13px;line-height:1.55;color:${C.textMid};margin-bottom:14px;`;
    confirmBody.textContent =
      "Questo NON ripara il log precedente: crea un log completamente vuoto, separato. " +
      "Il payload corrotto resta in quarantena e resta esportabile anche dopo questa conferma.";
    confirmPanel.appendChild(confirmBody);

    const confirmActions = document.createElement("div");
    confirmActions.style.cssText = `display:flex;gap:10px;`;

    const cancelBtn = document.createElement("button");
    cancelBtn.id = "recovery-cancel-new-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Annulla";
    cancelBtn.className = "btn btn--secondary";
    cancelBtn.addEventListener("click", onCancelStartNew);

    const confirmBtn = document.createElement("button");
    confirmBtn.id = "recovery-confirm-new-btn";
    confirmBtn.type = "button";
    confirmBtn.textContent = "Sì, inizia un nuovo log vuoto";
    confirmBtn.className = "btn btn--danger";
    confirmBtn.addEventListener("click", onConfirmStartNew);

    confirmActions.appendChild(cancelBtn);
    confirmActions.appendChild(confirmBtn);
    confirmPanel.appendChild(confirmActions);
    wrap.appendChild(confirmPanel);
  }

  return wrap;
}

export interface RecoveryBannerProps {
  readonly kind: "recovered" | "started-new";
  readonly quarantineStored: boolean;
}
export interface RecoveryBannerHandlers {
  readonly onExport: () => void;
}

/**
 * Persistent (non-dismissible) inline notice shown above the normal screen
 * content once a recovery has happened this session — either restored from
 * a last-known-good copy, or a fresh empty log started after the user
 * explicitly confirmed it. Never hides that a recovery occurred; always
 * offers the export while the quarantined payload exists.
 */
export function renderRecoveryBanner(
  props: RecoveryBannerProps,
  handlers: RecoveryBannerHandlers,
): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `margin:14px 24px 0;padding:12px 16px;border:1px solid ${C.stopRedDark};border-radius:8px;background:${C.panelInner};display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;`;

  const text = document.createElement("div");
  text.style.cssText = `font-size:13px;line-height:1.5;color:${C.textMid};`;
  text.textContent =
    props.kind === "recovered"
      ? "Storico asta ripristinato da una copia di sicurezza valida: il file salvato più recente non era valido. Budget, rosa e storico riflettono la copia di sicurezza."
      : "Il log precedente non era valido ed è stato messo in quarantena. Hai iniziato un nuovo log vuoto.";
  banner.appendChild(text);

  if (!props.quarantineStored) {
    const warning = document.createElement("div");
    warning.style.cssText = `font-size:12px;line-height:1.4;color:${C.stopRed};`;
    warning.textContent =
      "Quarantena non salvata nello storage: esporta ora il payload conservato in memoria.";
    banner.appendChild(warning);
  }

  const exportBtn = document.createElement("button");
  exportBtn.id = "recovery-banner-export-btn";
  exportBtn.type = "button";
  exportBtn.textContent = "Esporta payload non valido";
  exportBtn.className = "btn btn--secondary";
  exportBtn.style.flex = "none";
  exportBtn.addEventListener("click", handlers.onExport);
  banner.appendChild(exportBtn);

  return banner;
}

// ── Riconferme pre-asta recovery (tranche 2b, #231) ───────────────────────
// Same family as the auction-log recovery above (LIVE-02), but for a
// SEPARATE store (src/confirmationsStore.ts, its own keys/quarantine) that
// can be invalid independently of the log. Deliberately NOT the same
// component: "start new" for the log means "discard the append-only
// history", which has no equivalent here — the only destructive action a
// corrupted riconferme batch ever needs is discarding ITSELF, never the
// standing log. See the archived design (issue #231, comment 5290847863)
// and the PR body for why this is a sibling view rather than a reused one.

export interface ConfirmationsBlockedProps {
  readonly quarantinedRaw: string;
  readonly quarantineStored: boolean;
  readonly confirmingRestart: boolean;
}
export interface ConfirmationsBlockedHandlers {
  readonly onRetry: () => void;
  readonly onExport: () => void;
  readonly onRequestRestart: () => void;
  readonly onConfirmRestart: () => void;
  readonly onCancelRestart: () => void;
}

/**
 * Full-screen block — same posture as renderRecoveryBlockedScreen: the
 * standing auction log is non-empty, so silently dropping the corrupted
 * riconferme batch could desynchronize what the operator sees from what was
 * actually paid pre-asta. Reached only when the log itself is NOT already
 * blocked (main.ts checks the log's own recovery family first) and the log
 * is non-empty — an empty log takes the non-blocking banner path instead
 * (renderConfirmationsQuarantineBanner).
 */
export function renderConfirmationsBlockedScreen(
  props: ConfirmationsBlockedProps,
  handlers: ConfirmationsBlockedHandlers,
): HTMLElement {
  const { quarantinedRaw, quarantineStored, confirmingRestart } = props;
  const { onRetry, onExport, onRequestRestart, onConfirmRestart, onCancelRestart } = handlers;

  const wrap = document.createElement("div");
  wrap.setAttribute("role", "alert");
  wrap.style.cssText = `max-width:640px;margin:48px auto;padding:0 24px;display:flex;flex-direction:column;gap:16px;`;

  const title = document.createElement("h1");
  title.id = "confirmations-recovery-heading";
  title.tabIndex = -1;
  title.style.cssText = `font-size:20px;font-weight:700;color:${C.stopRed};margin:0;`;
  title.textContent = "Riconferme pre-asta non valide — intervento richiesto";
  wrap.appendChild(title);

  const body = document.createElement("div");
  body.style.cssText = `font-size:14px;line-height:1.6;color:${C.textMid};`;
  body.textContent =
    "Le riconferme pre-asta (regolamento di lega, §4) salvate in questo browser non sono valide (corrotte o alterate), e lo storico asta corrente non è vuoto: continuare senza risolvere rischia una contabilità incoerente tra riconferme e acquisti live. " +
    "L'asta non riparte automaticamente senza riconferme: serve una conferma esplicita.";
  wrap.appendChild(body);

  if (!quarantineStored) {
    const warning = document.createElement("div");
    warning.setAttribute("role", "status");
    warning.style.cssText = `font-size:13px;line-height:1.5;color:${C.stopRed};`;
    warning.textContent =
      "La quarantena delle riconferme non può essere salvata nello storage. Il payload resta disponibile in memoria ed è comunque esportabile finché questa pagina resta aperta.";
    wrap.appendChild(warning);
  }

  const actions = document.createElement("div");
  actions.style.cssText = `display:flex;flex-wrap:wrap;gap:10px;`;

  const retryBtn = document.createElement("button");
  retryBtn.id = "confirmations-recovery-retry-btn";
  retryBtn.type = "button";
  retryBtn.textContent = "Riprova lettura storage";
  retryBtn.className = "btn btn--secondary";
  retryBtn.addEventListener("click", onRetry);
  actions.appendChild(retryBtn);

  const exportBtn = document.createElement("button");
  exportBtn.id = "confirmations-recovery-export-btn";
  exportBtn.type = "button";
  exportBtn.textContent = "Esporta riconferme corrotte";
  exportBtn.className = "btn btn--secondary";
  exportBtn.addEventListener("click", onExport);
  actions.appendChild(exportBtn);

  if (!confirmingRestart) {
    const restartBtn = document.createElement("button");
    restartBtn.id = "confirmations-recovery-restart-btn";
    restartBtn.type = "button";
    restartBtn.textContent = "Riparti senza riconferme";
    restartBtn.className = "btn btn--danger";
    restartBtn.addEventListener("click", onRequestRestart);
    actions.appendChild(restartBtn);
  }

  wrap.appendChild(actions);

  if (confirmingRestart) {
    const confirmPanel = document.createElement("div");
    confirmPanel.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:10px;padding:16px 18px;background:${C.panelInner};`;

    const confirmTitle = document.createElement("div");
    confirmTitle.style.cssText = `font-size:14px;font-weight:700;color:${C.textPrimary};margin-bottom:8px;`;
    confirmTitle.textContent = "Confermi di ripartire senza riconferme?";
    confirmPanel.appendChild(confirmTitle);

    const confirmBody = document.createElement("div");
    confirmBody.style.cssText = `font-size:13px;line-height:1.55;color:${C.textMid};margin-bottom:14px;`;
    confirmBody.textContent =
      "Questo NON tocca lo storico asta già registrato: azzera solo le riconferme salvate, che dovranno essere reinserite da Impostazioni → Riconferme pre-asta. " +
      "Il payload corrotto resta in quarantena e resta esportabile anche dopo questa conferma.";
    confirmPanel.appendChild(confirmBody);

    const confirmActions = document.createElement("div");
    confirmActions.style.cssText = `display:flex;gap:10px;`;

    const cancelBtn = document.createElement("button");
    cancelBtn.id = "confirmations-recovery-cancel-restart-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Annulla";
    cancelBtn.className = "btn btn--secondary";
    cancelBtn.addEventListener("click", onCancelRestart);

    const confirmBtn = document.createElement("button");
    confirmBtn.id = "confirmations-recovery-confirm-restart-btn";
    confirmBtn.type = "button";
    confirmBtn.textContent = "Sì, riparti senza riconferme";
    confirmBtn.className = "btn btn--danger";
    confirmBtn.addEventListener("click", onConfirmRestart);

    confirmActions.appendChild(cancelBtn);
    confirmActions.appendChild(confirmBtn);
    confirmPanel.appendChild(confirmActions);
    wrap.appendChild(confirmPanel);
  }

  return wrap;
}

export interface ConfirmationsStorageErrorProps {
  readonly message: string;
}
export interface ConfirmationsStorageErrorHandlers {
  readonly onRetry: () => void;
}

/**
 * Full-screen block for the ONE outcome loadConfirmations() can raise before
 * anything was even read to quarantine: the riconferme storage key itself
 * could not be read (browser storage disabled/unavailable/throwing) — see
 * main.ts's ConfirmationsRecoveryState doc comment (post-review fix, round
 * 2, #285). Deliberately minimal — no export/restart actions, unlike
 * renderConfirmationsBlockedScreen above: there is no payload to act on when
 * the read itself failed, only "try reading storage again". Kept as its own
 * small component rather than folded into that one, since the two states
 * share nothing else (one has a corrupted payload to quarantine/export/
 * discard, the other has none).
 */
export function renderConfirmationsStorageErrorScreen(
  props: ConfirmationsStorageErrorProps,
  handlers: ConfirmationsStorageErrorHandlers,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "alert");
  wrap.style.cssText = `max-width:640px;margin:48px auto;padding:0 24px;display:flex;flex-direction:column;gap:16px;`;

  const title = document.createElement("h1");
  title.id = "confirmations-storage-error-heading";
  title.tabIndex = -1;
  title.style.cssText = `font-size:20px;font-weight:700;color:${C.stopRed};margin:0;`;
  title.textContent = "Storage delle riconferme non disponibile";
  wrap.appendChild(title);

  const body = document.createElement("div");
  body.style.cssText = `font-size:14px;line-height:1.6;color:${C.textMid};`;
  body.textContent =
    `Non è stato possibile leggere le riconferme pre-asta salvate in questo browser (${escHtml(props.message)}). ` +
    `L'app non procede finché lo storage non torna utilizzabile: nessuna riconferma verrebbe letta o salvata davvero.`;
  wrap.appendChild(body);

  const actions = document.createElement("div");
  actions.style.cssText = `display:flex;flex-wrap:wrap;gap:10px;`;

  const retryBtn = document.createElement("button");
  retryBtn.id = "confirmations-storage-error-retry-btn";
  retryBtn.type = "button";
  retryBtn.textContent = "Riprova lettura storage";
  retryBtn.className = "btn btn--secondary";
  retryBtn.addEventListener("click", handlers.onRetry);
  actions.appendChild(retryBtn);
  wrap.appendChild(actions);

  return wrap;
}

export interface ConfirmationsBannerProps {
  readonly reason: "quarantined-empty-log" | "restarted-without-confirmations";
  readonly quarantineStored: boolean;
}
export interface ConfirmationsBannerHandlers {
  readonly onExport: () => void;
}

/**
 * Persistent, non-blocking notice — reached when the riconferme batch is
 * invalid but the standing auction log is EMPTY, so there is nothing yet
 * for a mismatched batch to desynchronize from; the operator can simply
 * re-enter riconferme from scratch. Also shown after an explicit
 * "Riparti senza riconferme" confirmation from the blocked screen above.
 */
export function renderConfirmationsQuarantineBanner(
  props: ConfirmationsBannerProps,
  handlers: ConfirmationsBannerHandlers,
): HTMLElement {
  const banner = document.createElement("div");
  banner.id = "confirmations-quarantine-banner";
  banner.setAttribute("role", "alert");
  banner.style.cssText = `margin:14px 24px 0;padding:12px 16px;border:1px solid ${C.stopRedDark};border-radius:8px;background:${C.panelInner};display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;`;

  const text = document.createElement("div");
  text.style.cssText = `font-size:13px;line-height:1.5;color:${C.textMid};`;
  text.textContent =
    props.reason === "quarantined-empty-log"
      ? "Le riconferme pre-asta salvate non erano valide e sono state messe in quarantena. Lo storico asta è vuoto: puoi reinserirle da Impostazioni → Riconferme pre-asta."
      : "Le riconferme pre-asta precedenti non erano valide: hai scelto di ripartire senza riconferme. Il payload corrotto resta in quarantena ed esportabile.";
  banner.appendChild(text);

  if (!props.quarantineStored) {
    const warning = document.createElement("div");
    warning.style.cssText = `font-size:12px;line-height:1.4;color:${C.stopRed};`;
    warning.textContent =
      "Quarantena non salvata nello storage: esporta ora il payload conservato in memoria.";
    banner.appendChild(warning);
  }

  const exportBtn = document.createElement("button");
  exportBtn.id = "confirmations-quarantine-banner-export-btn";
  exportBtn.type = "button";
  exportBtn.textContent = "Esporta riconferme non valide";
  exportBtn.className = "btn btn--secondary";
  exportBtn.style.flex = "none";
  exportBtn.addEventListener("click", handlers.onExport);
  banner.appendChild(exportBtn);

  return banner;
}
