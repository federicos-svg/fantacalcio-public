// BUNDLE-01 offline layer: it installs the bundle integrity gate over
// `window.fetch` and starts the service-worker registration during module
// evaluation. See src/offline/register.ts.
//
// The guarantee is ES module semantics, NOT this line's position. Every import
// in this list is evaluated before main.ts's own top-level body runs, so the
// gate is installed before any code written below can fetch anything — and that
// holds from any position among these imports. An earlier version of this
// comment said the import "must stay the FIRST"; review falsified it by moving
// this line LAST among the ~30 imports here, after which the whole offline E2E
// suite stayed green (connectivity-truth 8/8, bundle-integrity 8/8,
// offline-cold-start 4/4). Position is a convention worth keeping, not the
// mechanism.
//
// The real thing not to do, which no test here catches: adding a SIBLING import
// ABOVE this line that does something eager at ITS own top level — a `fetch`, a
// `navigator.serviceWorker` call, a window `online`/`offline` listener. Sibling
// modules are evaluated in source order, so such an import runs before the gate
// exists and its requests are never gated. Keeping this import first is the
// cheap way to make that impossible by construction.
import "./offline/register.js";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/asta.css";
import "./styles/listone.css";
import "./styles/bait.css";
import "./styles/perMe.css";
import "./styles/schedaCard.css";
import {
  type AuctionEvent,
  type AuctionState,
  type PoolPlayer,
  type Role,
  type TeamState,
  ROLES,
  ROSTER_REQUIREMENTS,
  COST_FLOOR,
} from "../packages/engine/src/types.js";
import { reduce } from "../packages/engine/src/reduce.js";
import {
  maxSafe,
  opponentTier1,
  roleScarcity,
  warBoardRows,
  type RoleScarcity,
} from "../packages/engine/src/auction.js";
import { residualPressure } from "../packages/engine/src/anchors.js";
import {
  auctionPrecedents,
  loadAuctionHistory,
  loadOpponentProfiles,
  type OpponentProfile,
  type PastAuctionPurchase,
} from "../packages/opponent-profiles/src/index.js";
import { baitCandidates, exposureBook } from "./baitCandidates.js";
import { renderBaitSection, type BaitSectionProps } from "./ui/baitRow.js";
import { perMeCandidates } from "./perMeCandidates.js";
import { renderPerMeSection, type PerMeSectionProps } from "./ui/perMeRow.js";
import {
  applyAuctionHistoryText,
  applyOpponentProfilesText,
  forgetAuctionHistory,
  forgetOpponentProfiles,
  type ArchiveMessage,
} from "./opponentArchive.js";
import {
  ARCHIVE_SETTINGS_ICON,
  renderOpponentArchiveSettings,
} from "./ui/opponentArchiveSettings.js";
import {
  attemptCopy,
  copyMessage,
  copySucceeded,
  type CopyOutcome,
} from "./personIdClipboard.js";
import { budgetPlan } from "../packages/engine/src/budget.js";
import {
  purchaseFeasibility,
  recordPurchase,
  type ProposedPurchase,
} from "../packages/engine/src/feasibility.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import { C, escHtml, roleChipHtml, renderRoleChip } from "./ui/theme.js";
import { ROLE_LABELS, ROLE_LABEL_SING } from "./ui/labels.js";
// #333 §A — un nome solo per grandezza, e viene da qui. Le due superfici di
// questo file che stampavano una formulazione propria (la metrica della fascia
// critica e la nota sotto «Prezzo da pagare») leggono adesso la costante.
import {
  MAX_BID_LABEL_LONG,
  MAX_BID_LABEL_LONG_SENTENCE,
} from "./ui/budgetLabels.js";
import {
  addPerson,
  assignSeat,
  loadLeagueRoster,
  PERSON_NAME_MAX,
  renamePerson,
  saveLeagueRoster,
  seatLabel,
  seatPerson,
  type LeagueRoster,
} from "./leagueTeams.js";
// PIANO ROSA (PLAN-01): la dichiarazione di Owner e la sua lettura. Il calcolo
// vero resta nel motore (livePlan.ts) — qui si legge, si conserva, e si passa
// al pannello. La forma PARZIALE della dichiarazione (`RolePlanDraft`) è ciò
// che tiene separati «ruolo non dichiarato» e «ruolo dichiarato a zero»: vedi
// la testa di src/rolePlan.ts.
import {
  EMPTY_ROLE_PLAN_DRAFT,
  type RolePlanDraft,
  clearRolePlan,
  declaredTotal,
  loadRolePlan,
  rolePlanReading,
  saveRolePlan,
} from "./rolePlan.js";
import { requiredRoleError } from "./callGuard.js";
import { parsePositiveIntegerPrice } from "./price.js";
import {
  projectAfterPurchase,
  projectionAlarmText,
  projectionLabelText,
  projectionValueText,
  type PostPurchaseProjection,
} from "./postPurchaseProjection.js";
import { executeVoidCommand, voidErrorText } from "./voidCommand.js";
import { rolePriceFacts, roleTopPurchases } from "./nominationContext.js";
import { buildFreeLadder } from "./relativeIndex.js";
import { buildTierBook, tierBandReading } from "./tierOrdering.js";
// L'elenco DICHIARATO delle squadre di Serie A impegnate in una coppa europea
// nel 2026/27 — la gamba «coppe e turnover» del valore assoluto. Costante
// verificata, non un dato acquisito: src/serieACompetitions.ts.
import { playsInEurope } from "./serieACompetitions.js";
import {
  renderListoneSvincolati,
  renderPlayerInsightsBlock,
  type PlayerInsightProps,
  renderMomentInsightsBlock,
  renderOpponentPrecedentsBlock,
  renderTierBandBlock,
  type TierBandProps,
  renderImpostazioniScreen,
  SETTINGS_ICONS,
  type SettingsArea,
  renderNominationContextPanel,
  type NominationContextTopEntry,
  fillOpponentPrecedents,
  type OpponentPrecedentsProps,
  renderRoleScarcityPanel,
  renderWarBoardFull,
  renderWarBoardMini,
  renderRolePlanPanel,
  renderRoseScreen,
  renderMockModal,
  renderRecoveryBlockedScreen,
  renderRecoveryBanner,
  renderConfirmationsBlockedScreen,
  renderConfirmationsQuarantineBanner,
  renderConfirmationsStorageErrorScreen,
  renderRoleDepletionBlock,
  type RoleDepletionProps,
  type RecoveryBlockedProps,
  renderInterestFlagRow,
  renderLateAnswerBlock,
  renderValueBoxBlock,
  type ValueBoxProps,
} from "./ui/views.js";
import { valueBoxReading } from "./valueBox.js";
import {
  INTEREST_FLAG_NOT_PERSISTED_NOTICE,
  enqueueInterestFlag,
  loadInterestFlags,
  type InterestFlag,
} from "./interestFlags.js";
import { createLateAnswerSlot, type LateAnswerProducer } from "./lateAnswer.js";
import { roleDepletionReading } from "./roleDepletion.js";
import {
  loadAuctionLog,
  saveAuctionLog,
  exportAuctionLog,
  importAuctionLog,
  peekPortableLogEnvelope,
  type LoadLogResult,
  type SaveLogResult,
  type StorageLike,
} from "./logRecovery.js";
import {
  loadConfirmations,
  saveConfirmations,
  confirmationErrorText,
  readQuarantinedConfirmations,
  type LoadConfirmationsResult,
} from "./confirmationsStore.js";
import { CONFIRMATION_LIMITS } from "../packages/engine/src/confirmations.js";
import { renderClubBadge } from "./ui/serieA.js";
import { activateAccessibleDialog } from "./ui/accessibleDialog.js";
import {
  type ListonePlayer,
  type ListonePoolSource,
  type ListoneSort,
  type ListoneStatusFilter,
  type ResolvedListonePool,
  validateListonePool,
  parseListoneJsonText,
  resolveListonePool,
  listoneSourceNote,
  listoneAppealIndexNote,
  listoneGenForecastNote,
  filterListonePool,
  listonePlayerKey,
  listonePoolIndex,
  normalizeIdentityPart,
  orphanPlayerIds,
  resolvePlayerDisplayName,
  defaultVisibleColumnKeys,
  listoneColumns,
  listoneExpertSignalsNote,
  poolHasAppealIndex,
} from "./ui/listone.js";
import {
  loadListoneColumnPrefs,
  saveListoneColumnPrefs,
  toggleColumnPref,
  visibleColumnKeys,
  type ListoneColumnPrefs,
} from "./listoneColumnPrefs.js";
import { roleBudgetPlanHtml } from "./ui/roleBudgetPlan.js";
import {
  AVVISO_VALUES,
  EXPERT_SCHEDA_ENDPOINT,
  EXPERT_SCHEDE_ABSENT,
  FONTE_VALUES,
  LISTA_ESPERTI_VALUES,
  PIAZZATI_VALUES,
  RIGORI_VALUES,
  SCHEDA_BALLOTTAGGIO_MAX,
  SCHEDA_CLUB_NON_DICHIARATA,
  SCHEDA_GERARCHIA_MAX,
  SCHEDA_GERARCHIA_MIN,
  SCHEDA_NOTA_MAX,
  SCHEDA_PERCENTUALE_MAX,
  SCHEDA_PERCENTUALE_MIN,
  SCHEDA_RANGO_MAX,
  SCHEDA_RANGO_MIN,
  TITOLARITA_VALUES,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
  type ExpertSchedaStore,
  type SchedaTarget,
} from "./expertScheda.js";
import {
  PAGELLA_ASSI_COMUNI,
  PAGELLA_ETICHETTE,
  PAGELLA_QUARTO_ASSE_IGNOTO,
  PAGELLA_TOTALE_MAX,
  PAGELLA_VOTO_MAX,
  PAGELLA_VOTO_MIN,
  pagellaAsseDelRuolo,
  type PagellaAsse,
} from "./pagellaEsperti.js";
import {
  AVVISO_LABELS,
  FONTE_LABELS,
  PIAZZATI_LABELS,
  RIGORI_LABELS,
  TITOLARITA_LABELS,
} from "./ui/expertInsight.js";
import { LISTA_ESPERTI_LABELS } from "./ui/schedaLabels.js";
import { renderSchedaCardTitle } from "./ui/schedaCard.js";
import {
  loadSchedaLinks,
  saveSchedaLinks,
  schedaLinkRowKey,
  withSchedaLink,
  type SchedaLinks,
} from "./schedaLinks.js";
import {
  listoneExpertPagellaViews,
  listoneRowSignalsLookup,
  type ListoneSignalsInput,
} from "./listoneRowSignals.js";
import {
  EMPTY_SCHEDA_BALLOTTAGGIO_ROW,
  EMPTY_SCHEDA_FORM,
  SCHEDA_DEPOSIT_FILENAME,
  applySchedaImport,
  buildScheda,
  buildSchedaDeposit,
  loadSchedaDrafts,
  planSchedaImport,
  saveSchedaDrafts,
  schedaBallottaggioFuoriListone,
  schedaPagellaVerificaText,
  schedaProgress,
  schedaSummary,
  schedaToForm,
  withEditing,
  withScheda,
  type SchedaDraftState,
  type SchedaFieldError,
  type SchedaBallottaggioValues,
  type SchedaFormValues,
  type SchedaPagellaValues,
  type SchedaImportPlan,
  type SchedaImportResolution,
} from "./schedaCompiler.js";

/**
 * Un'importazione letta e non ancora applicata. Vive solo in `AppState`: è la
 * domanda che il pannello sta facendo, non un dato da conservare.
 */
interface PendingSchedaImport {
  readonly fileName: string;
  readonly plan: SchedaImportPlan;
  /** `null` finché Pico non ha scelto. Serve solo quando ci sono conflitti. */
  readonly resolution: SchedaImportResolution | null;
}

// Path of the shipped, Cloudflare-Access-gated static listone asset — see
// docs/data/LISTONE_UI_LOAD_CONTRACT.md for the shape and authorization.
const LISTONE_STATIC_ASSET_URL = "/data/listone_2025_26.json";

// Same-origin Pages Function serving the current listone from the Factory's
// private deposit (functions/api/listone.ts). Same Cloudflare Access gate as
// every other path of this app — no separate host, no token in the client.
const LISTONE_REMOTE_ENDPOINT = "/api/listone";
const LISTONE_REMOTE_HEADER_MODIFIED_AT = "x-listone-modified-at";
// A listone that hasn't arrived in 4s is not worth a blank panel during an
// auction: the request is abandoned and the static/localStorage copy stands.
const LISTONE_REMOTE_TIMEOUT_MS = 4000;

// Same-origin Pages Function serving the Gruppo Esperti schede written by hand
// before the auction and deposited in the private Drive folder — same shape,
// same perimeter and same Cloudflare Access gate as /api/listone above. The
// reader that talks to Drive lives in the private repository; the public core
// carries the contract, the validator, the UI and synthetic fixtures only.
// Timeout shorter than the listone's: without the listone the app has nothing
// to show at all, without the schede it has an honest "not read" to show, so
// this request must never be the one that keeps the screen waiting.
const EXPERT_SCHEDE_TIMEOUT_MS = 3000;

// ── League config (MVP: fixed roster, no editing UI) ───────────────────────────
const SELF_ID = "Io";
const FANTA_TEAM_IDS: readonly string[] = [
  "Io",
  "Squadra2",
  "Squadra3",
  "Squadra4",
  "Squadra5",
  "Squadra6",
  "Squadra7",
  "Squadra8",
];

// ── Storage keys ───────────────────────────────────────────────────────────────
// The auction log's own keys (canonical/last-known-good/quarantine) are
// owned by ./logRecovery.js — see LOG_STORAGE_KEY etc. there. Only the
// unrelated listone pool cache key lives here.
const KEY_POOL = "fac_pool";

// ── App state ──────────────────────────────────────────────────────────────────
type Screen = "asta" | "rose" | "impostazioni";
type Moment = "chiamata" | "asta";

interface CallState {
  playerName: string;
  role: Role | "";
  club: string;
  // Set only by clicking a row in the Listone (see selectListonePlayer).
  // The Avvia CTA requires playerName/role/club to still match this exact
  // player — editing any of the three after selecting breaks the
  // correlation and disables Avvia again (see isCallCorrelated).
  selectedPlayer: ListonePlayer | null;
}

interface AssignState {
  fantaTeamId: string;
  price: string;
}

// Post-review fix (round 2, #285) — see AppState.riconfermeDraft's own doc
// comment for why this exists. `playerId`/`priceRaw` are the exact raw
// strings read from the DOM at the moment of the failed attempt (not the
// parsed price) — so re-rendering the form can put them back byte-for-byte,
// including a value that failed to parse as a price at all.
interface RiconfermeDraft {
  readonly seatId: string;
  readonly role: Role;
  readonly playerId: string;
  readonly priceRaw: string;
}

interface MockModal {
  title: string;
  body: string;
}

// ── Recovery UI state (LIVE-02) ──────────────────────────────────────────
// Mirrors the outcomes of loadAuctionLog() (see ./logRecovery.ts) plus the
// two states reachable only through user action from "blocked": confirming
// the destructive "start new log" step, and having done so ("started-new").
// "none": normal boot, nothing to show. "recovered"/"started-new": a
// persistent, non-blocking banner (see renderRecoveryBanner). "blocked"/
// "storage-error": the entire screen is replaced (see
// renderRecoveryBlockedScreen) until resolved.
type RecoveryState =
  | { readonly kind: "none" }
  | {
      readonly kind: "recovered";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  | {
      readonly kind: "started-new";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  | {
      readonly kind: "blocked";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
      readonly confirmingNewLog: boolean;
    }
  // quarantinedRaw is non-null only when a corrupted canonical was already
  // read and quarantined before this state was reached: from "blocked" (a
  // write failure while confirming a new log), or at boot when the recovery
  // re-persist of the last-known-good copy could not be written/verified.
  // A boot storage-error where the canonical couldn't even be read has
  // nothing to quarantine yet, and carries null.
  | {
      readonly kind: "storage-error";
      readonly message: string;
      readonly quarantinedRaw: string | null;
      readonly quarantineStored: boolean;
    };

// ── Riconferme recovery UI state (tranche 2b, #231) ────────────────────
// Mirrors loadConfirmations()'s outcomes (./confirmationsStore.ts) — a
// SEPARATE store from the auction log, so its own recovery state is
// independent of RecoveryState above. "none": normal boot (includes both
// "no key yet" and "valid"), nothing to show. "blocked": the batch is
// invalid AND the standing log is non-empty — full-screen block (see
// renderConfirmationsBlockedScreen), same reasoning as the log's own
// blocked state but scoped to riconferme only. "banner": the batch is
// invalid but the log is EMPTY (nothing yet to desync from), or the
// operator already confirmed restarting without riconferme from the
// blocked screen — a persistent, non-blocking notice
// (renderConfirmationsQuarantineBanner). "storage-error": the riconferme
// key itself could not even be READ (browser storage disabled/unavailable)
// — a SEPARATE top-level kind, never folded into "blocked", because there
// is nothing to quarantine/export/restart-without yet, only "try again".
// Post-review fix (round 2, #285): before this kind existed, a
// confirmations-only storage-error fell through `result.status !== "invalid"`
// into "none" — a silent "nessuna riconferma" that looked identical to a
// device that genuinely never had any, even though real data may exist and
// simply couldn't be read this time. Always full-screen (never a banner),
// same posture as RecoveryState's own "storage-error": a browser storage
// failure is scarier than merely-invalid data and is never downgraded to a
// dismissible notice.
type ConfirmationsRecoveryState =
  | { readonly kind: "none" }
  | {
      readonly kind: "banner";
      readonly reason:
        | "quarantined-empty-log"
        | "restarted-without-confirmations";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  | {
      readonly kind: "blocked";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
      readonly confirmingRestart: boolean;
    }
  | { readonly kind: "storage-error"; readonly message: string };

interface AppState {
  screen: Screen;
  moment: Moment;
  log: AuctionEvent[];
  recovery: RecoveryState;
  // Riconferme pre-asta (LEAGUE_RULES.md §4, tranche 2b) — NOT part of the
  // append-only log (see packages/engine/src/confirmations.ts): a batch
  // that seeds each team's initial roster before `log` is replayed. Loaded
  // at boot BEFORE `log` (see bootConfirmations below) because validating
  // `log` itself now depends on it (a live PURCHASE of an already-confirmed
  // playerId is invalid — see reduce()'s fail-closed throw, audit fix 3).
  confirmations: ConfirmationInput[];
  confirmationsRecovery: ConfirmationsRecoveryState;
  // Human-readable outcome of the last riconferme panel action (Impostazioni
  // → Riconferme pre-asta). Cleared on the next successful action, on
  // navigating away from the current screen/settings tab (post-review fix,
  // round 2, #285 — a stale refusal must never sit there indefinitely), or
  // together with `riconfermeDraft` below.
  riconfermeError: string;
  // Post-review fix (round 2, #285): the picker/price the operator was
  // filling in for ONE seat+role slot when the last riconferme action was
  // REFUSED — render() rebuilds the whole panel from scratch on every call
  // (see renderRiconfermeSettings), which used to silently wipe an
  // uncontrolled <select>/<input> back to blank right when the operator
  // most needed to see (and fix) what they had just typed. Captured only at
  // the moment of a failed attempt (confirmRiconferma/applyRiconfermeBatch),
  // never on every keystroke — the rest of this form stays deliberately
  // uncontrolled (see confirmRiconferma's own doc comment). Cleared on a
  // successful apply and alongside `riconfermeError` (they are always set/
  // cleared as a pair).
  riconfermeDraft: RiconfermeDraft | null;
  // Set only when a mutation (purchase/void) could not be persisted — a
  // distinct surface from `error` (assign-form validation) so a storage
  // failure is never confused with "you typed something wrong", and stays
  // visible regardless of chiamata/asta moment (see renderAsta()).
  persistenceError: string;
  call: CallState;
  callInteractions: number;
  // D7 Binario A: the "Contesto chiamata" panel is ON-DEMAND, so it starts
  // closed and is reopened only by an explicit click. Reset to false whenever
  // the selected player changes, so the panel never shows a previous player's
  // context under a new name. See renderNominationContextPanel.
  nominationContextOpen: boolean;
  // #331 punto 5 — the critical strip is ONE row, so the per-role detail
  // (progress bar + budget envelope) sits behind an explicit gesture instead
  // of a second full-width line. Nothing was removed: this flag is what makes
  // it reachable, and it is deliberately app state (not DOM state) because
  // render() rebuilds the strip from scratch on every keystroke.
  criticalPlanOpen: boolean;
  // #331 punto 2 — MOMENTO DELL'ASTA è ridotto al ruolo chiamato dentro la
  // scheda del giocatore; gli altri tre ruoli, il censimento MERCATO e la nota
  // metodologica stanno dietro questo gesto. Come le due bandiere qui sopra è
  // stato dell'app e non del DOM, perché render() ricostruisce l'albero a ogni
  // tasto battuto nel campo del prezzo: una `aria-expanded` tenuta solo nel DOM
  // si richiuderebbe da sola alla prima cifra.
  momentFactsDetailOpen: boolean;
  // True only immediately after entering the "chiamata" moment (boot, the
  // "← Indietro" link, or right after a completed purchase) — consumed once
  // by renderMomentoChiamata to focus the search input, so re-renders
  // triggered by typing/selecting within that same moment never steal focus
  // back. See #219.
  chiamataFocusPending: boolean;
  assign: AssignState;
  /**
   * CHI ERA IN GARA — la marcatura in corso, LEGATA AL SUO SOGGETTO.
   *
   * `subjectKey` è il `listonePlayerKey` del giocatore per cui le marcature
   * valgono. Tenere il soggetto accanto alle marcature, invece di ricordarsi di
   * azzerarle a ogni cambio di giocatore, è ciò che rende STRUTTURALMENTE
   * impossibile che una marcatura fatta per un giocatore finisca sull'acquisto
   * di un altro: chi legge confronta la chiave, e una chiave diversa vale
   * quanto nessuna marcatura. Le tre strade che cambiano giocatore
   * (selezione di una riga, ricerca azzerata, listone che non contiene più il
   * selezionato) non hanno quindi nulla da ricordarsi.
   */
  interestMarks: { subjectKey: string | null; contenders: string[] };
  /**
   * La coda locale dei flag già registrati, in memoria. Rispecchia lo storage
   * quando l'ultima scrittura è riuscita; quando NON è riuscita resta più
   * ricca di lui — la marcatura non si perde per la sessione — e
   * `interestFlagsNotice` lo dice.
   */
  interestFlags: readonly InterestFlag[];
  /** Perché la coda dei flag non è al sicuro. Vuoto è lo stato normale. */
  interestFlagsNotice: string;
  confirmVoidSeq: number | null;
  confirmVoidLabel: string;
  // Whether the purchase being confirmed for void is the most recent one still
  // standing. Only drives the extra warning in the confirmation dialog — the
  // engine itself voids any target (voidFeasibility/recordVoid are
  // order-independent, see packages/engine/src/feasibility.ts). LIVE-06.
  confirmVoidIsLatest: boolean;
  pendingImportRaw: string | null;
  error: string;
  mockModal: MockModal | null;
  // Listone Svincolati pool — see ui/listone.ts for the auto-load/
  // localStorage/manual-override priority. Never fed to the decision
  // engine, never promotes a gate.
  pool: ListonePlayer[];
  /** Which source produced `pool` — drives the honest note under the table. */
  poolSource: ListonePoolSource;
  /** Drive `modifiedTime` of the remote deposit, only when `poolSource` is
   *  "remote". Display-only freshness hint, never a data input. */
  poolModifiedAt: string | null;
  poolLoadError: string;
  // What the LAST pool change did that the operator has to know about: an
  // automatic substitution refused because it would orphan standing purchases
  // (audit round 2, finding 1), an armed selection disarmed because the new
  // pool does not contain it (finding 3), a pool that could not be persisted
  // (finding 4). Events, not derived state — the standing-orphans clause is
  // recomputed at render instead (see poolOrphanNotice). Distinct from
  // `poolLoadError`, which is about the file/payload that was refused, and
  // from `persistenceError`, which is about the auction log itself. Replaced
  // by the next pool change, never dismissable by the operator.
  poolNotice: string;
  poolSort: ListoneSort | null;
  /**
   * LE DEVIAZIONI DI PICO DALLE COLONNE DI DEFAULT — non l'elenco delle
   * colonne visibili.
   *
   * Qui c'era `poolVisibleColumns: string[]`, un elenco assoluto ricalcolato
   * dal default a OGNI cambio di pool (boot, deposito che risponde, file
   * caricato a mano, «dimentica»): cioè la scelta di chi guardava veniva
   * buttata via cinque volte al giorno, in silenzio. Le colonne visibili sono
   * adesso DERIVATE a ogni render da queste deviazioni più il pool corrente
   * (`listoneVisibleColumnKeys` più sotto), quindi non c'è più nessuno stato
   * da tenere in sincrono e nessun punto in cui una ricarica possa perderlo.
   * Contratto e ragioni: src/listoneColumnPrefs.ts.
   */
  poolColumnPrefs: ListoneColumnPrefs;
  /** `false` quando l'ultima scrittura delle preferenze non ha tenuto. */
  poolColumnPrefsPersisted: boolean;
  poolPage: number;
  poolColumnPanelOpen: boolean;
  poolManualOverrideOpen: boolean;
  poolStatusFilter: ListoneStatusFilter;
  poolStatusFilterOpen: boolean;
  offline: boolean;
  leagueRoster: LeagueRoster;
  /**
   * La dichiarazione di piano rosa di Owner, in forma parziale.
   *
   * `null` = non è mai stata dichiarata (o la copia conservata era illeggibile
   * ed è stata rifiutata in blocco: fail-closed, mai una dichiarazione
   * parziale indovinata). Non è la stessa cosa di una dichiarazione con tutti i
   * ruoli a zero, e il pannello le mostra in due modi diversi.
   */
  rolePlan: RolePlanDraft | null;
  /**
   * Lo storico d'asta multi-stagione e i profili d'intervista, letti al boot
   * dallo storage locale del browser.
   *
   * MAI NEL REPOSITORY, e la scelta di tenerli in `AppState` invece che di
   * rileggerli a ogni render è deliberata: sono dati di persone reali, quindi
   * più il codice che li tocca è poco e in un posto solo, meglio è. Vuoti è lo
   * stato normale finché il layer privato non li deposita — e vuoti il
   * pannello AVVERSARI lo DICE, invece di mostrare un elenco che sembrerebbe
   * «nessuno lo vuole» (src/ui/liveFacts.ts, OPPONENT_PRECEDENTS_NO_HISTORY).
   */
  auctionHistory: readonly PastAuctionPurchase[];
  opponentProfiles: readonly OpponentProfile[];
  /**
   * L'esito dell'ULTIMA azione sui due archivi (Impostazioni → Archivio
   * avversari), o `null` finché non ce n'è stata nessuna in questa sessione.
   *
   * In stato, non nel DOM, per la ragione di sempre in questo file: `render()`
   * ricostruisce l'intero albero a ogni tasto, e un messaggio che vivesse solo
   * a schermo sparirebbe al primo re-render — cioè spesso prima di essere
   * stato letto. Non è mai persistito: è il racconto di un gesto appena
   * compiuto, non un fatto dell'archivio.
   */
  archiveHistoryMessage: ArchiveMessage | null;
  archiveProfilesMessage: ArchiveMessage | null;
  /**
   * Le schede del Gruppo Esperti, lette a runtime dal deposito privato
   * (src/expertScheda.ts). `{ ok: false, reason: "absent" }` è lo stato di
   * partenza e resta tale finché la risposta non arriva valida: assente,
   * illeggibile o non conforme producono tutte lo stesso esito verso l'utente
   * — «non ho letto nulla» — che il riquadro DICHIARA invece di far sembrare
   * «non c'è nulla da dire su questo giocatore».
   */
  expertSchede: ExpertSchedaStore;
  /**
   * Le risposte già date da Pico su quale scheda appartenga a quale riga di
   * listone, quando ce n'era più d'una possibile (src/schedaLinks.ts). Vuota è
   * lo stato normale: la domanda si pone solo dove i nomi divergono.
   */
  schedaLinks: SchedaLinks;
  /** `false` solo quando l'ULTIMA risposta non è stata scritta nello storage. */
  schedaLinksPersisted: boolean;
  /**
   * LE SCHEDE CHE PICO STA SCRIVENDO, non quelle che il deposito serve.
   *
   * Due archivi distinti e nessuna confusione possibile: `expertSchede` è il
   * deposito LETTO a runtime dall'endpoint privato in sola lettura, e resta
   * intoccabile; questo è il lavoro in corso nel browser di chi compila
   * (src/schedaCompiler.ts), che alla fine diventa il file che Pico deposita a
   * mano. Il sito non scrive mai sul deposito, né qui né altrove.
   */
  schedaDrafts: SchedaDraftState;
  /** `false` solo quando l'ULTIMA scrittura delle schede non ha attecchito. */
  schedaDraftsPersisted: boolean;
  /** La riga di listone su cui si sta compilando, o `null` — chiave di riga. */
  schedaTargetKey: string | null;
  /** Il modulo in composizione, come lo rende il DOM: tutto stringa. */
  schedaForm: SchedaFormValues;
  /** I motivi dell'ultimo salvataggio rifiutato. Vuoto è lo stato normale. */
  schedaErrors: readonly SchedaFieldError[];
  /** L'esito dell'ultima azione riuscita, o il motivo per cui il deposito non è pronto. */
  schedaNotice: string;
  /** Filtro sul selettore del giocatore: il listone reale supera le 500 righe. */
  schedaFilter: string;
  /** La scheda per cui è stata chiesta la cancellazione, in attesa del secondo clic. */
  schedaConfirmDelete: string | null;
  /**
   * L'importazione LETTA e non ancora applicata: che cosa succederebbe se si
   * confermasse, in attesa che Pico lo confermi. `null` è lo stato normale.
   *
   * Transitoria per scelta, e non persistita come le schede: è una domanda
   * aperta su un file scelto adesso, non lavoro da mettere al sicuro. Un
   * reload la chiude, e il file si ricarica con un gesto.
   */
  schedaImport: PendingSchedaImport | null;
  /** Perché l'ultimo file NON è stato importato. Vuoto è lo stato normale. */
  schedaImportError: string;
  rosterError: string;
  newPersonName: string;
  /**
   * L'esito dell'ULTIMO gesto di copia di un identificativo, o `null` finché
   * non ce n'è stato nessuno.
   *
   * Porta il NOME e non l'id: la conferma sta sotto un elenco di pulsanti
   * identici, e senza il nome due clic ravvicinati non si distinguono. Non è
   * mai persistito — è il racconto di un gesto, non un fatto del registro.
   */
  personIdCopy: {
    readonly personName: string;
    readonly outcome: CopyOutcome;
  } | null;
  settingsArea: string;
}

// Fail-closed load result -> (log, recovery UI state), shared by the boot
// sequence below and by retryRecovery() (see near doAssign). Pure — never
// touches storage itself, storage.getItem already happened in loadAuctionLog.
function logFromLoadResult(result: LoadLogResult): AuctionEvent[] {
  return result.status === "valid" || result.status === "recovered"
    ? (result.log as AuctionEvent[])
    : [];
}

function recoveryFromLoadResult(result: LoadLogResult): RecoveryState {
  switch (result.status) {
    case "no-log":
    case "valid":
      return { kind: "none" };
    case "recovered":
      return {
        kind: "recovered",
        quarantinedRaw: result.quarantinedRaw,
        quarantineStored: result.quarantineStored,
      };
    case "unrecoverable":
      return {
        kind: "blocked",
        quarantinedRaw: result.quarantinedRaw,
        quarantineStored: result.quarantineStored,
        confirmingNewLog: false,
      };
    case "storage-error":
      // quarantinedRaw is non-null only for the one storage-error the loader
      // can raise AFTER quarantining a corrupted canonical (a failed recovery
      // re-persist); it is passed through so the forensic export stays
      // available there. A plain unreadable-canonical error still carries null.
      return {
        kind: "storage-error",
        message: result.message,
        quarantinedRaw: result.quarantinedRaw,
        quarantineStored: result.quarantineStored,
      };
  }
}

// Riconferme: `LoadConfirmationsResult` -> the confirmations array to
// actually derive/replay state from. An invalid/storage-error outcome
// falls back to [] — the SAME fallback "no confirmations" already means
// pre-2b (see loadConfirmations's own "none" outcome) — while the separate
// `confirmationsRecoveryFromLoadResult` below decides what (if anything)
// the operator needs to see about it.
function confirmationsFromLoadResult(
  result: LoadConfirmationsResult,
): ConfirmationInput[] {
  return result.status === "valid" ? [...result.confirmations] : [];
}

/**
 * `logIsEmpty` is the STANDING log's length AFTER its own load/recovery —
 * what decides whether an invalid riconferme batch needs the full-screen
 * block (a non-empty log could desync from a silently-dropped batch) or
 * only a non-blocking banner (an empty log has nothing yet to desync from).
 */
function confirmationsRecoveryFromLoadResult(
  result: LoadConfirmationsResult,
  logIsEmpty: boolean,
): ConfirmationsRecoveryState {
  // Post-review fix (round 2, #285): a storage-error is never routed through
  // the "invalid" branch's fallback-to-none below — that fallback is for
  // "there is nothing to report", and a read that THREW is not nothing, it
  // is unknown. Always blocks, regardless of logIsEmpty (mirrors
  // RecoveryState's own "storage-error", which is unconditional too).
  if (result.status === "storage-error")
    return { kind: "storage-error", message: result.message };
  if (result.status !== "invalid") return { kind: "none" };
  return logIsEmpty
    ? {
        kind: "banner",
        reason: "quarantined-empty-log",
        quarantinedRaw: result.quarantinedRaw,
        quarantineStored: result.quarantineStored,
      }
    : {
        kind: "blocked",
        quarantinedRaw: result.quarantinedRaw,
        quarantineStored: result.quarantineStored,
        confirmingRestart: false,
      };
}

function acquireBrowserStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      getItem: () => {
        throw new Error(message);
      },
      setItem: () => {
        throw new Error(message);
      },
      removeItem: () => {
        throw new Error(message);
      },
    };
  }
}

let browserStorage = acquireBrowserStorage();

// Boot-time load — riconferme FIRST: validating the auction log now depends
// on them (a live PURCHASE of an already-confirmed playerId is invalid —
// reduce()'s fail-closed throw, audit fix 3), so loadAuctionLog needs the
// confirmations batch already in hand. Computed once, before `state`
// exists, so `log`/`recovery`/`confirmations`/`confirmationsRecovery` below
// all derive from the SAME pair of reads without re-reading storage.
const bootConfirmationsResult = loadConfirmations(
  browserStorage,
  FANTA_TEAM_IDS,
);
const bootConfirmations = confirmationsFromLoadResult(bootConfirmationsResult);
const bootLog = loadAuctionLog(
  browserStorage,
  FANTA_TEAM_IDS,
  bootConfirmations,
);

// Raw localStorage read for the persisted pool, or null if missing/
// inaccessible. Silent by design (no error surfaced — this runs on every
// boot, not in response to a user action). Kept separate from parsing so
// resolveListonePool (see ui/listone.ts) stays the single place that
// decides which source wins.
function readPersistedPoolText(): string | null {
  try {
    return browserStorage.getItem(KEY_POOL);
  } catch {
    return null;
  }
}

// Both writes below are fail-soft and NEVER throw (audit round 2, finding 4).
// They used to call browserStorage naked — the only storage writes in the
// project without error handling, while saveLeagueRoster returns a boolean and
// saveAuctionLog is fail-closed with a SaveLogResult. Their call sites all sit
// BEFORE render(), so a quota/denied-storage throw skipped the repaint and
// left the DOM showing a pool the app had already replaced in memory: the
// panel said "Nessun listone caricato" (or kept the previous table) with no
// error at all, until the operator happened to touch something else.
// `false` = the pool is loaded for this session but not persisted; the caller
// says so in the notice surface instead of the screen quietly lying.

function savePersistedPool(text: string): boolean {
  try {
    browserStorage.setItem(KEY_POOL, text);
    return true;
  } catch {
    return false;
  }
}

function forgetPersistedPool(): boolean {
  try {
    browserStorage.removeItem(KEY_POOL);
    return true;
  } catch {
    return false;
  }
}

/** Shown whenever the pool on screen could not be written to localStorage. */
const POOL_NOT_PERSISTED_NOTICE =
  "Listone caricato per questa sessione ma non salvato in locale (spazio del browser pieno o negato): " +
  "al prossimo reload tornerà quello automatico.";

/**
 * One rule for the whole notice surface: the events of a single pool change,
 * in the order they happened, with the branches that had nothing to say
 * dropped instead of leaving a stray separator behind.
 *
 * Shared by all three call sites (applyResolvedPool, loadPoolFromText,
 * forgetPool) because they used to disagree: one filtered `!== null`, the
 * other two `!== ""` on an array that can hold `null` — `disarmSelectionOutsidePool`
 * returns `null` when there was no armed selection to disarm — so
 * `[null, NOTICE].join(" ")` came out with a leading space. Cosmetic, but
 * three lines meant to say the same thing that didn't. `null` and `""` are
 * the same thing here ("nothing to report"), so both drop; the single-value
 * sites in loadPoolFromText's two rejection branches use `?? ""`, which is
 * this same rule for one part.
 */
function joinPoolNotices(parts: readonly (string | null)[]): string {
  return parts.filter((s): s is string => s !== null && s !== "").join(" ");
}

// Synchronous first paint: localStorage only, since neither the deposit nor
// the static asset fetch (autoLoadListonePool below) has resolved yet. Either
// one, once it parses, wins over this — see autoLoadListonePool.
const bootPool: ResolvedListonePool = resolveListonePool({
  remoteJsonText: null,
  staticJsonText: null,
  localStorageText: readPersistedPoolText(),
});

const bootLogEvents = logFromLoadResult(bootLog);

// Le schede in composizione, rilette una volta al boot: sono ore di battitura
// e devono essere di nuovo lì al reload, compreso il modulo lasciato aperto a
// metà (src/schedaCompiler.ts).
const bootSchedaDrafts = loadSchedaDrafts(browserStorage);

// La coda dei flag «chi era in gara», riletta al boot. Fail-SOFT per
// costruzione (src/interestFlags.ts): nessuno dei quattro esiti blocca lo
// schermo, e in tutti e quattro `pending` è utilizzabile. Il solo caso che
// produce una riga a schermo è quello in cui qualcosa si è perso davvero, e la
// riga lo dice senza allarmare: la contabilità dell'asta non è toccata.
const bootInterestFlags = loadInterestFlags(browserStorage);

function interestFlagsBootNotice(
  result: ReturnType<typeof loadInterestFlags>,
): string {
  if (result.status === "quarantined") {
    return (
      "La coda locale delle marcature «chi era in gara» non era leggibile ed è stata messa da parte: " +
      "riparte vuota. Storico dell'asta, budget e slot non sono toccati."
    );
  }
  if (result.status === "storage-error") {
    return (
      "La coda locale delle marcature «chi era in gara» non è accessibile in questo browser: " +
      "le marcature di stasera resteranno solo in memoria. Storico dell'asta, budget e slot non sono toccati."
    );
  }
  return "";
}

const state: AppState = {
  screen: "asta",
  moment: "chiamata",
  log: bootLogEvents,
  recovery: recoveryFromLoadResult(bootLog),
  confirmations: bootConfirmations,
  confirmationsRecovery: confirmationsRecoveryFromLoadResult(
    bootConfirmationsResult,
    bootLogEvents.length === 0,
  ),
  riconfermeError: "",
  riconfermeDraft: null,
  persistenceError: "",
  call: { playerName: "", role: "", club: "", selectedPlayer: null },
  callInteractions: 0,
  nominationContextOpen: false,
  criticalPlanOpen: false,
  momentFactsDetailOpen: false,
  chiamataFocusPending: true,
  assign: { fantaTeamId: SELF_ID, price: "" },
  interestMarks: { subjectKey: null, contenders: [] },
  interestFlags: bootInterestFlags.pending,
  interestFlagsNotice: interestFlagsBootNotice(bootInterestFlags),
  confirmVoidSeq: null,
  confirmVoidLabel: "",
  confirmVoidIsLatest: true,
  pendingImportRaw: null,
  error: "",
  mockModal: null,
  pool: bootPool.pool,
  poolSource: bootPool.source,
  poolModifiedAt: null,
  poolLoadError: "",
  poolNotice: "",
  poolSort: null,
  // Fail-closed a vuoto come gli altri side-store: un archivio illeggibile
  // riparte dalle undici colonne di default, non da una tabella storta.
  poolColumnPrefs: loadListoneColumnPrefs(browserStorage),
  poolColumnPrefsPersisted: true,
  poolPage: 1,
  poolColumnPanelOpen: false,
  poolManualOverrideOpen: false,
  poolStatusFilter: "available",
  poolStatusFilterOpen: false,
  offline: !navigator.onLine,
  leagueRoster: loadLeagueRoster(browserStorage, FANTA_TEAM_IDS),
  rolePlan: loadRolePlan(browserStorage),
  // Fail-closed entrambi: assente o corrotto -> lista vuota, mai parziale. Un
  // conteggio di precedenti fatto su metà delle righe sarebbe un numero
  // sbagliato con l'aria di un fatto.
  auctionHistory: loadAuctionHistory(browserStorage).purchases,
  opponentProfiles: loadOpponentProfiles(browserStorage).profiles,
  // Nessun messaggio al boot: non è stato compiuto nessun gesto. Lo stato
  // degli archivi lo dice il riepilogo, che è un fatto e non un esito.
  archiveHistoryMessage: null,
  archiveProfilesMessage: null,
  // Nessuna scheda finché il deposito non risponde: il riquadro parte da
  // «fonte aggiuntiva non disponibile», che è la verità al primo frame.
  expertSchede: EXPERT_SCHEDE_ABSENT,
  schedaLinks: loadSchedaLinks(browserStorage),
  schedaLinksPersisted: true,
  // Fail-closed a vuoto come gli altri side-store: un archivio illeggibile
  // riparte da zero DICENDOLO, invece di mostrare un elenco a cui manca in
  // silenzio qualcosa.
  schedaDrafts: bootSchedaDrafts,
  schedaDraftsPersisted: true,
  schedaTargetKey: bootSchedaDrafts.editing?.rowKey ?? null,
  schedaForm: bootSchedaDrafts.editing?.values ?? EMPTY_SCHEDA_FORM,
  schedaErrors: [],
  schedaNotice: "",
  schedaFilter: "",
  schedaConfirmDelete: null,
  schedaImport: null,
  schedaImportError: "",
  rosterError: "",
  newPersonName: "",
  personIdCopy: null,
  // Opens on the area you act on; app status is diagnostics, read on demand.
  settingsArea: "teams",
};

// Set as soon as the user picks a file manually, so a still-in-flight
// autoLoadListonePool() fetch that resolves afterwards never clobbers an
// explicit user action taken while it was loading.
let manualPoolLoadSinceBoot = false;

// Raw text of the shipped static listone asset (see LISTONE_STATIC_ASSET_URL),
// or null when it is missing/unreachable. Never throws, never surfaces an
// error: this runs on every boot, not in response to a user action.
async function fetchStaticListone(): Promise<string | null> {
  try {
    const res = await fetch(LISTONE_STATIC_ASSET_URL);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// Raw text served by the private-deposit endpoint plus its freshness header,
// or null when the endpoint is unavailable, too slow, or answers with anything
// that isn't JSON. The content-type check is what makes "not deployed yet"
// deterministic: a static preview/build without Pages Functions answers this
// path with the SPA's own index.html at status 200, and treating that as data
// would be a silent default.
async function fetchRemoteListone(): Promise<{
  text: string;
  modifiedAt: string | null;
} | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    LISTONE_REMOTE_TIMEOUT_MS,
  );
  try {
    const res = await fetch(LISTONE_REMOTE_ENDPOINT, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) return null;
    return {
      text: await res.text(),
      modifiedAt: res.headers.get(LISTONE_REMOTE_HEADER_MODIFIED_AT),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Le schede del Gruppo Esperti servite dal deposito privato, o `null` quando
// l'endpoint non è raggiungibile, è troppo lento o risponde con qualcosa che
// non è JSON. Il controllo del content-type è la stessa difesa che /api/listone
// applica già, e per lo stesso motivo: una build statica senza Pages Functions
// risponde a questo path con l'index.html della SPA a status 200, e trattarlo
// come dati sarebbe un default silenzioso. Non lancia mai e non blocca il
// primo render: la schermata parte con lo stato onesto «non letto».
async function fetchExpertSchede(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    EXPERT_SCHEDE_TIMEOUT_MS,
  );
  try {
    const res = await fetch(EXPERT_SCHEDA_ENDPOINT, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Un deposito che non si legge NON cancella quello che è già a schermo — ma al
// boot non c'è niente da cancellare, quindi qui l'unico effetto è che lo stato
// resta «non letto». Nessun errore visibile: la mancanza della fonte è già
// dichiarata dentro il riquadro, dove serve, e un banner in più su questa
// schermata costerebbe altezza a chi ha due secondi per decidere.
async function autoLoadExpertSchede(): Promise<void> {
  const store = parseExpertSchedaDeposit(await fetchExpertSchede());
  if (!store.ok) return;
  state.expertSchede = store;
  render();
}

// ── Listone ⇄ log identity reconciliation (audit round 2, findings 1 and 3) ──
// The event log's `playerId` IS a `listonePlayerKey` of the row that was
// clicked (see doAssign), so the log's identities are only as stable as the
// pool that produced them. Nothing used to compare the two: when the pool was
// replaced — a deposit that becomes reachable, a different season's file, the
// same player spelled differently — every id already written silently stopped
// resolving. The purchased player came back as free and clickable, the
// "Assegnato" badge and the Assegnati filter lost him, `roleScarcity` counted
// him as available again, and the engine accepted the second purchase because
// `duplicate-player` compares playerIds, not physical players: budget and slot
// counted twice, in silence, after a plain page reload.

/** How many orphan names a notice spells out before summarising the rest. */
const POOL_NOTICE_NAME_LIMIT = 6;

/**
 * playerIds of the purchases still standing (a PURCHASE with no VOID against
 * its seq), PLUS every current riconferma's playerId — the same two sources
 * `reduce()` merges to build `purchasedPlayerIds` (see its own doc comment:
 * a riconferma seeds a team's INITIAL roster and is never itself logged as
 * an AuctionEvent, so it would otherwise be invisible here).
 *
 * Escalation (post-#285): `state.confirmations` did not exist when this
 * function was first written against the log alone, so a riconfermato
 * player orphaned by a pool swap (identical failure mode to finding 1 —
 * different spelling, different season's file, a deposit that comes back
 * reachable under new names) went undetected — the swap applied instead of
 * being refused, and the riconfermato came back free and re-purchasable.
 *
 * Deliberately a pure read of `state.log`/`state.confirmations` rather than
 * `deriveAuctionState()`: this runs on the asynchronous pool-load path,
 * where a `reduce()` throw would skip `render()` — the exact failure shape
 * finding 4 closes below. `state.confirmations` is read as-is, unvalidated
 * here on purpose: this function only needs the playerIds, and both
 * `loadConfirmations` (boot) and `saveConfirmations` (every write) already
 * enforce structural + semantic validity before anything reaches `state`.
 */
function standingPurchasedPlayerIds(): string[] {
  const voided = new Set<number>();
  for (const e of state.log) {
    if (e.type === "VOID") voided.add(e.targetSeq);
  }
  const fromLog = state.log.flatMap((e) =>
    e.type === "PURCHASE" && !voided.has(e.seq) ? [e.playerId] : [],
  );
  const fromConfirmations = state.confirmations.map((c) => c.playerId);
  return [...fromLog, ...fromConfirmations];
}

/** "Alfa Uno, Beta Due e altri 3" — names read from the pool that still
 *  resolves them, or reconstructed from the id when none does. */
function playerIdListLabel(
  ids: readonly string[],
  index: ReadonlyMap<string, ListonePlayer>,
): string {
  const named = ids
    .slice(0, POOL_NOTICE_NAME_LIMIT)
    .map((id) => resolvePlayerDisplayName(id, index));
  const rest = ids.length - named.length;
  return rest > 0 ? `${named.join(", ")} e altri ${rest}` : named.join(", ");
}

/**
 * The standing purchases the pool CURRENTLY on screen cannot account for.
 *
 * Derived at render time and never stored: it must stop being shown the moment
 * it stops being true — when the listone the log was written against is loaded
 * back, or when the orphaned purchases are voided — instead of leaving a
 * warning on screen that no longer describes anything.
 */
function poolOrphanNotice(): string {
  // Orphans resolve nowhere by definition, so the names below are the
  // reconstruction from the stored id — which is exactly all the app still
  // knows about them.
  const index = listonePoolIndex(state.pool);
  const orphans = orphanPlayerIds(standingPurchasedPlayerIds(), index);
  if (orphans.length === 0) return "";
  const subject =
    orphans.length === 1
      ? "1 acquisto dello storico non corrisponde"
      : `${orphans.length} acquisti dello storico non corrispondono`;
  return (
    `Attenzione: ${subject} a nessuna riga del listone attualmente caricato ` +
    `(${playerIdListLabel(orphans, index)}). ` +
    "Quei giocatori risultano di nuovo liberi e possono essere ri-acquistati per errore: " +
    "budget e slot verrebbero contati due volte. Ricarica il listone da cui è nato lo storico prima di continuare."
  );
}

/**
 * Disarms a selection the new pool no longer contains (finding 3) and returns
 * the sentence that says so, or null when there was nothing to disarm.
 *
 * `isCallCorrelated` compares three strings against `state.call`, never
 * membership of the current pool, and neither loader used to touch
 * `state.call`: after the pool was wiped or swapped, "Avvia" stayed enabled on
 * a player no listone on screen contains, and the purchase went through — into
 * a log entry no screen could ever show as "Assegnato" again.
 */
function disarmSelectionOutsidePool(
  index: ReadonlyMap<string, ListonePlayer>,
): string | null {
  const selected = state.call.selectedPlayer;
  if (selected === null || index.has(listonePlayerKey(selected))) return null;
  const wasInAsta = state.moment === "asta";
  state.call = { playerName: "", role: "", club: "", selectedPlayer: null };
  state.callInteractions = 0;
  state.nominationContextOpen = false;
  // An assignment form still pointed at a player who is no longer in any
  // listone is worse than no form: back to the call moment, same shape as
  // "← Indietro".
  if (wasInAsta) {
    state.moment = "chiamata";
    state.chiamataFocusPending = true;
    state.assign = { fantaTeamId: SELF_ID, price: "" };
    state.error = "";
  }
  // Il selezionato non esiste più nel listone: il posto della risposta lenta si
  // svuota con lui, dopo le mutazioni e prima che il chiamante ridipinga.
  armLateAnswer(null);
  const head = wasInAsta
    ? "Selezione annullata e asta in corso interrotta"
    : "Selezione annullata";
  return `${head}: ${selected.name} non è più nel listone caricato.`;
}

// Applies a resolved pool to the screen, unless the user has meanwhile loaded
// a file by hand (that explicit action always wins for the session). Persists
// the raw text it came from, so the freshest automatic source also becomes the
// offline copy — exactly what the static asset already did on its own.
//
// Fail-closed against the identity orphaning above: an AUTOMATIC substitution
// that would stop resolving purchases the pool on screen still resolves is
// REFUSED, not performed with a warning. This is the stronger of the two
// directions the audit gave, and the one coherent with the rest of the app's
// posture — the operator keeps a listone that agrees with the standing log
// instead of one that silently re-offers players already bought. The escape
// hatch is the explicit one that already exists: "✕ dimentica il listone
// salvato" empties the pool (nothing left to lose) and re-runs this load,
// which then applies — and the notice below names that path.
function applyResolvedPool(
  resolved: ResolvedListonePool,
  rawText: string | null,
  modifiedAt: string | null,
): void {
  if (manualPoolLoadSinceBoot) return;
  const currentIndex = listonePoolIndex(state.pool);
  const nextIndex = listonePoolIndex(resolved.pool);
  const standing = standingPurchasedPlayerIds();
  const lost = orphanPlayerIds(standing, nextIndex).filter((id) =>
    currentIndex.has(id),
  );
  if (lost.length > 0) {
    const missing =
      lost.length === 1
        ? "non contiene 1 giocatore già acquistato"
        : `non contiene ${lost.length} giocatori già acquistati`;
    state.poolNotice =
      `Sostituzione automatica del listone rifiutata: il listone in arrivo ${missing} ` +
      `(${playerIdListLabel(lost, currentIndex)}). ` +
      "Applicarlo li renderebbe di nuovo liberi e ri-acquistabili, con budget e slot contati due volte. " +
      "Resta caricato il listone attuale, coerente con lo storico. " +
      "Per sostituirlo comunque: «Caricamento manuale (debug/override) → ✕ dimentica il listone salvato», " +
      "oppure carica a mano il file corretto.";
    render();
    return;
  }
  state.pool = resolved.pool;
  state.poolSource = resolved.source;
  state.poolModifiedAt = modifiedAt;
  state.poolLoadError = "";
  state.poolSort = null;
  state.poolPage = 1;
  const notices = [disarmSelectionOutsidePool(nextIndex)];
  // Never persist a raw payload that resolves to zero rows (finding 5): the
  // saved copy is the offline defence for auction day, and a degraded source
  // must not be allowed to overwrite it.
  if (
    rawText !== null &&
    resolved.pool.length > 0 &&
    (resolved.source === "remote" || resolved.source === "static")
  ) {
    if (!savePersistedPool(rawText)) notices.push(POOL_NOT_PERSISTED_NOTICE);
  }
  state.poolNotice = joinPoolNotices(notices);
  render();
}

// Boot (and post-"dimentica", see forgetPool) load, in the priority order of
// docs/data/LISTONE_UI_LOAD_CONTRACT.md: private deposit, then static asset,
// then localStorage, then the empty state. Both requests start together and
// the locally-available one is painted as soon as it lands, so a slow or
// unreachable deposit can never leave the panel blank for its whole timeout;
// the deposit still overrides it the moment it arrives valid. Never blocks the
// initial render and never surfaces an error — a missing source just leaves
// the next one down in charge.
async function autoLoadListonePool(): Promise<void> {
  const remotePending = fetchRemoteListone();
  const staticText = await fetchStaticListone();
  applyResolvedPool(
    resolveListonePool({
      remoteJsonText: null,
      staticJsonText: staticText,
      localStorageText: readPersistedPoolText(),
    }),
    staticText,
    null,
  );

  const remote = await remotePending;
  if (remote === null) return;
  const resolved = resolveListonePool({
    remoteJsonText: remote.text,
    staticJsonText: null,
    localStorageText: null,
  });
  // An unparsable deposit payload is not allowed to clear what is already on
  // screen — same fail-closed posture as a rejected file.
  if (resolved.source !== "remote") return;
  applyResolvedPool(resolved, remote.text, remote.modifiedAt);
}

// Parses a locally-selected JSON file's text into the listone pool. Never
// touches the network; the file is read client-side only (see
// ui/listone.ts renderListoneLoader). Malformed JSON/shape sets a visible
// error instead of throwing or silently keeping stale data. Every load
// (success or failure) resets sort/column-visibility too, so a stale sort
// key or extra-column selection from a previous file never lingers. Always
// overrides whatever is currently shown for this session — static asset
// included — and marks manualPoolLoadSinceBoot so a slower in-flight
// autoLoadListonePool() fetch can't clobber this explicit user action.
//
// Unlike the automatic path above this one does NOT refuse a pool that orphans
// standing purchases: loading this file is an explicit operator action, and
// refusing it would leave no way to change listone at all. The consequence is
// stated instead (poolOrphanNotice, recomputed at render), and the armed
// selection is disarmed here — on the two rejection paths too, since a file
// that empties the pool leaves the CTA pointing at a player no listone
// contains, which is how PROBE F recorded a purchase into a log no screen
// could ever show again.
function loadPoolFromText(text: string): void {
  manualPoolLoadSinceBoot = true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    state.pool = [];
    state.poolSource = "none";
    state.poolModifiedAt = null;
    state.poolLoadError = "File non valido: non è JSON leggibile.";
    state.poolNotice =
      disarmSelectionOutsidePool(listonePoolIndex(state.pool)) ?? "";
    state.poolSort = null;
    render();
    return;
  }
  const validation = validateListonePool(parsed);
  if (!validation.ok) {
    state.pool = [];
    state.poolSource = "none";
    state.poolModifiedAt = null;
    state.poolLoadError =
      validation.reason === "gated-field"
        ? "File rifiutato: contiene campi decisionali non autorizzati. Nessuna riga è stata caricata."
        : validation.reason === "ambiguous-identity"
          ? "Identità ambigua: due righe hanno lo stesso nome e club senza proxyId distinti. Nessuna riga è stata caricata."
          : validation.reason === "duplicate-identity"
            ? "Identificatore duplicato: ogni proxyId deve essere unico. Nessuna riga è stata caricata."
            : validation.reason === "inconsistent-appeal-index"
              ? "Indice incoerente: le righe portano versioni diverse della ricetta. Nessuna riga è stata caricata."
              : "Formato non valido: attesa una lista di { proxyId?, name, role, club, quotation? } con role ∈ P/D/C/A (più eventuali colonne extra).";
    state.poolNotice =
      disarmSelectionOutsidePool(listonePoolIndex(state.pool)) ?? "";
    state.poolSort = null;
    render();
    return;
  }
  const pool = validation.pool;
  state.pool = pool;
  state.poolSource = "manual";
  state.poolModifiedAt = null;
  state.poolLoadError = "";
  state.poolSort = null;
  state.poolPage = 1;
  const notices = [disarmSelectionOutsidePool(listonePoolIndex(pool))];
  if (!savePersistedPool(text)) notices.push(POOL_NOT_PERSISTED_NOTICE);
  state.poolNotice = joinPoolNotices(notices);
  render();
}

// Clears the pool from both the current view and localStorage, then re-runs
// the automatic load — "dimentica" un-does a manual override, it doesn't have
// to mean "go blank" if the private deposit or the static asset can still
// answer. Falls through to the empty state only if both also fail.
function forgetPool(): void {
  state.pool = [];
  state.poolSource = "none";
  state.poolModifiedAt = null;
  state.poolLoadError = "";
  state.poolSort = null;
  state.poolPage = 1;
  // Empty pool: nothing left for an automatic source to orphan, which is
  // exactly what makes this the explicit way past a refused substitution
  // (see applyResolvedPool). The selection is still disarmed if it pointed
  // at a row that has just gone away, and the standing log is announced as
  // unmatched until a listone that covers it is loaded again.
  const notices = [disarmSelectionOutsidePool(listonePoolIndex(state.pool))];
  if (!forgetPersistedPool()) {
    notices.push(
      "Copia locale del listone non cancellata (spazio del browser negato): potrebbe riapparire al reload.",
    );
  }
  state.poolNotice = joinPoolNotices(notices);
  manualPoolLoadSinceBoot = false;
  render();
  void autoLoadListonePool();
}

function sortListoneByColumn(key: string): void {
  const current = state.poolSort;
  const direction: "asc" | "desc" =
    current && current.key === key && current.direction === "asc"
      ? "desc"
      : "asc";
  state.poolSort = { key, direction };
  state.poolPage = 1; // a new sort order starts back at the top, not wherever the old order left off
  render();
}

/**
 * LE COLONNE VISIBILI ADESSO — derivate, non conservate.
 *
 * Le undici di default per QUESTO pool, meno quelle che Pico ha spento, più
 * quelle che ha acceso; nell'ordine deciso da `listoneColumns`, che è quello
 * del suo elenco. Ricalcolarle a ogni render invece di tenerle in `state` è
 * ciò che fa sopravvivere la sua scelta a un cambio di listone: prima ogni
 * ricarica del pool la sovrascriveva col default.
 */
function listoneVisibleColumnKeys(): string[] {
  return visibleColumnKeys(
    listoneColumns(state.pool),
    defaultVisibleColumnKeys(state.pool),
    state.poolColumnPrefs,
  );
}

function toggleListoneColumn(key: string): void {
  // IL SECONDO GIRO DI CHIAVE (2026-08-24). Il pannello non attacca nemmeno il
  // gestore del clic alle tre colonne blindate, quindi da lì questa riga non
  // scatta mai. Sta qui perché una chiamata che arrivasse da un'altra strada
  // non deve poter SCRIVERE nell'archivio una preferenza che poi nessuno
  // onora: `visibleColumnKeys` mostrerebbe la colonna comunque, e resterebbe
  // in `localStorage` una riga che dice il falso. La bandiera è quella della
  // colonna, non un secondo elenco di chiavi tenuto a mano.
  if (listoneColumns(state.pool).find((c) => c.key === key)?.locked === true)
    return;
  state.poolColumnPrefs = toggleColumnPref(
    state.poolColumnPrefs,
    key,
    defaultVisibleColumnKeys(state.pool),
  );
  state.poolColumnPrefsPersisted = saveListoneColumnPrefs(
    browserStorage,
    state.poolColumnPrefs,
  );
  render();
  // Il fuoco torna sull'interruttore appena premuto: si accendono e spengono
  // più colonne di fila, e senza questo ogni pressione riporterebbe al body.
  focusAfterRender(`listone-column-toggle-${key}`);
}

function changePoolPage(page: number): void {
  state.poolPage = page;
  render();
}

function toggleListoneColumnPanel(): void {
  state.poolColumnPanelOpen = !state.poolColumnPanelOpen;
  render();
  // `render()` ricostruisce il DOM, quindi il bottone appena premuto non
  // esiste più e il fuoco finisce sul body: chi era arrivato qui con TAB
  // dovrebbe ripartire dall'inizio della schermata per premerlo di nuovo.
  // Stessa cura, e stessa ragione, del filtro di stato qui sopra.
  focusAfterRender("listone-column-panel-toggle");
}

function toggleListoneManualOverride(): void {
  state.poolManualOverrideOpen = !state.poolManualOverrideOpen;
  render();
}

function setPoolStatusFilter(status: ListoneStatusFilter): void {
  state.poolStatusFilter = status;
  state.poolStatusFilterOpen = false;
  state.poolPage = 1;
  render();
  // Focus lands back on the trigger, which now carries the new value: after
  // picking from a menu the option that had focus no longer exists.
  focusAfterRender("listone-status-filter-trigger");
}

/**
 * Il ruolo su cui il listone filtra, scritto da uno dei quattro interruttori.
 *
 * FA ESATTAMENTE CIÒ CHE FA IL MENU «Ruolo» della ricerca, e non per pigrizia:
 * è lo stesso fatto, e due percorsi che scrivono lo stesso campo in due modi
 * diversi divergono alla prima correzione fatta su uno solo. Le tre righe
 * accanto all'assegnazione — il conteggio delle interazioni, la pagina che
 * torna alla prima, il render — sono le stesse per la stessa ragione: cambiare
 * filtro e restare a pagina sette mostrerebbe una tabella vuota che sembra un
 * elenco senza risultati.
 */
function setListoneRoleFilter(role: Role | ""): void {
  state.call.role = role;
  state.callInteractions += 1;
  state.poolPage = 1;
  render();
}

function togglePoolStatusFilter(): void {
  state.poolStatusFilterOpen = !state.poolStatusFilterOpen;
  render();
  if (state.poolStatusFilterOpen) {
    focusAfterRender(`listone-status-filter-option-${state.poolStatusFilter}`);
  }
}

// Dismissal for the status-filter menu, installed once rather than per
// render(): render() rebuilds the DOM on every keystroke, so a listener
// attached during rendering would pile up copies. A click inside the control
// is ignored here — the trigger and the options handle their own.
document.addEventListener("click", (e) => {
  if (!state.poolStatusFilterOpen) return;
  // closest() on the event target, NOT contains() from the live element: the
  // trigger's own handler has already re-rendered by the time this runs, so
  // the clicked node is detached and the fresh control never contains it —
  // which closed the menu on the very click that opened it. The detached
  // subtree keeps its ancestors, so closest() still identifies the origin.
  if (e.target instanceof Element && e.target.closest("#listone-status-filter"))
    return;
  state.poolStatusFilterOpen = false;
  render();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !state.poolStatusFilterOpen) return;
  state.poolStatusFilterOpen = false;
  render();
  focusAfterRender("listone-status-filter-trigger");
});

// Clicking a (non-assigned) Listone row: this is the only way to arm the
// Avvia CTA — see isCallCorrelated. Populates the search bar's three fields
// with this exact player so the search visibly "agrees" with the listone.
function selectListonePlayer(p: ListonePlayer): void {
  state.callInteractions += 1;
  state.call.playerName = p.name;
  state.call.role = p.role;
  state.call.club = p.club;
  state.call.selectedPlayer = p;
  state.poolPage = 1;
  // A new selection means a new subject: the context panel goes back to its
  // on-demand closed state instead of silently re-pointing at another player.
  state.nominationContextOpen = false;
  state.chiamataFocusPending = true;
  // Nuovo soggetto: la risposta lenta si arma su di lui e quella del giocatore
  // di prima viene annullata nello stesso gesto (src/lateAnswer.ts). Le
  // marcature «chi era in gara» non hanno bisogno di essere azzerate qui:
  // portano il proprio soggetto con sé, e per un soggetto diverso valgono
  // quanto nessuna marcatura.
  armLateAnswer(listonePlayerKey(p));
  render();
}

function toggleNominationContext(): void {
  state.nominationContextOpen = !state.nominationContextOpen;
  render();
  // Keyboard stays on the control that now carries the new value — render()
  // rebuilds the whole tree, so the button the user pressed is gone.
  focusAfterRender("nomination-context-toggle");
}

/**
 * #331 punto 2 — il gesto che apre gli altri tre ruoli e il censimento MERCATO
 * dentro la scheda del giocatore. Stessa forma di toggleNominationContext:
 * stato dell'app, re-render intero, tastiera rimessa sul controllo che adesso
 * porta il nuovo `aria-expanded`.
 *
 * (Il gemello che apriva IL TAVOLO non esiste più: quel gruppo è SEMPRE
 * APERTO dal 2026-08-26 — vedi renderTableDetail.)
 */
function toggleMomentFactsDetail(): void {
  state.momentFactsDetailOpen = !state.momentFactsDetailOpen;
  render();
  focusAfterRender("moment-facts-toggle");
}

// True only when the search bar's three fields still exactly match the
// player last clicked in the Listone — editing playerName/role/club after
// selecting breaks this until another row is clicked. Gates both the Avvia
// CTA (see renderMomentoChiamata) and launchAsta itself (defense-in-depth
// against a stray Enter keypress).
function isCallCorrelated(call: CallState): boolean {
  const sp = call.selectedPlayer;
  return (
    sp !== null &&
    sp.name === call.playerName &&
    sp.role === call.role &&
    sp.club === call.club
  );
}

// Undoes a wrong/stale listone selection: clears the search bar and the
// selected-player correlation (Avvia goes back to disabled) and restores
// the listone to its default "Liberi" view. Pure client-side UI state —
// touches only `call`/`poolStatusFilter`/`poolPage`, never `state.log`, so
// it never creates an event, and has no effect on budget/roster/void state.
function resetListoneSearch(): void {
  state.call = { playerName: "", role: "", club: "", selectedPlayer: null };
  state.callInteractions = 0;
  state.nominationContextOpen = false;
  state.poolStatusFilter = "available";
  state.poolPage = 1;
  state.chiamataFocusPending = true;
  armLateAnswer(null);
  render();
}

// ── Derived state helpers ──────────────────────────────────────────────────────
// `state.confirmations` (tranche 2b) seeds the initial roster before `log`
// is replayed — see reduce()'s own doc comment. Every screen derives its
// AuctionState through here, so a riconferma is reflected everywhere
// (budget/slots/purchasedPlayerIds) without a single other call site
// touching reduce() directly. render() guards this exact call against a
// confirmations/live-log conflict throw (audit fix 3) before any screen is
// built — see the render() comment "Fix 3 (#283) fail-closed guard".
// ── IL MIO PIANO (PLAN-01) — costruzione del pannello ───────────────────────
//
// Il motore calcolava già il piano rosa vivo e nessuna schermata lo importava.
// Qui si chiudono i due fili che mancavano: la LETTURA (`rolePlanReading`, che
// chiama `livePlan()` solo quando la dichiarazione è completa e valida) e la
// PERSISTENZA della dichiarazione. views.ts riceve le due funzioni e non tocca
// né il motore né lo storage, come ogni altro pannello.
function renderMyRolePlanPanel(aState: AuctionState): HTMLElement | null {
  const team = myTeam(aState);
  if (team === undefined) return null;
  return renderRolePlanPanel({
    draft: state.rolePlan ?? EMPTY_ROLE_PLAN_DRAFT,
    read: (draft) => rolePlanReading(team, draft),
    persist: (draft) => {
      state.rolePlan = draft;
      // Una dichiarazione tornata completamente vuota non lascia dietro di sé
      // un guscio conservato: niente dichiarato, niente scritto. Al prossimo
      // avvio si rilegge «nessun piano», che è la verità.
      const { roles } = declaredTotal(draft);
      if (roles === 0 && draft.planVersion.trim().length === 0) {
        return clearRolePlan(browserStorage);
      }
      return saveRolePlan(browserStorage, draft);
    },
  });
}

function deriveAuctionState(): AuctionState {
  return reduce(state.log, FANTA_TEAM_IDS, state.confirmations);
}

function myTeam(aState: AuctionState): TeamState | undefined {
  return aState.teams[SELF_ID];
}

// Historical purchases of players that were only ever in the manual-scouting
// registry (removed) resolve through legacyPlayerIdDisplayName instead: a
// reconstruction from the stored id, not a crash.
function auctionDisplayPool(): ListonePlayer[] {
  return [...state.pool];
}

/**
 * The same pool as an index by playerId, for the panels that resolve MANY ids
 * at once (audit round 2, finding 2).
 *
 * Built once per panel, not once per id: `resolvePlayerDisplayName` used to be
 * a linear scan that recomputed `listonePlayerKey` for every row it walked,
 * and STORICO calls it for every standing purchase on every render — and
 * render() rebuilds the whole DOM on every keystroke of the player search. A
 * complete auction (224 purchases) against a real listone (532 rows) cost
 * ~140 ms per keystroke, on the critical path of a call, growing exactly as
 * the auction went on.
 *
 * «Una volta per pannello» qui è una DISCIPLINA, non una garanzia provata:
 * nessun test fallisce se una chiamata futura sposta questa costruzione
 * dentro il ciclo che risolve gli id. `renderZona4` costruisce DOM e questo
 * progetto non ha un ambiente di test jsdom/happy-dom, quindi il contatore
 * che protegge la passata O(pool) (src/ui/listone.test.ts) arriva fino alla
 * funzione, non fino a questo call site. Chi tocca questa riga lo faccia
 * sapendo che è sorvegliata da un commento, non da un rosso.
 */
function auctionDisplayIndex(): ReadonlyMap<string, ListonePlayer> {
  return listonePoolIndex(state.pool);
}

// The engine's roleScarcity() counts remaining supply per role over a
// PoolPlayer[]. Listone rows already carry the same identity the event log
// stores (listonePlayerKey), so this mapping is lossless for the only two
// fields scarcity reads — playerId and role. Nothing from the quotation (or
// any other listone column) crosses into the engine here.
function scarcityPool(): PoolPlayer[] {
  return state.pool.map((p) => ({
    playerId: listonePlayerKey(p),
    role: p.role,
    name: p.name,
  }));
}

/**
 * Ingressi del blocco AVVERSARI della schermata live: i PRECEDENTI D'ASTA sul
 * giocatore chiamato (views.ts `renderOpponentPrecedentsBlock`).
 *
 * DA DOVE VENGONO I DATI, E PERCHÉ DA LÌ. Lo storico d'asta multi-stagione e i
 * profili d'intervista sono giudizi e spese di persone reali della lega: non
 * stanno nel repository e non ci staranno mai (issue #234, nota privacy).
 * Vivono nello storage locale del browser, letti al boot dalle due funzioni
 * `loadAuctionHistory` / `loadOpponentProfiles` del pacchetto, che sono
 * fail-closed: uno storico assente o corrotto rende una lista VUOTA, mai una
 * lista parziale, e il pannello lo dichiara invece di mostrare un elenco muto.
 *
 * IDENTITÀ DEL GIOCATORE. `listonePlayerKey` è la stessa chiave con cui
 * l'event log registra un acquisto (doAssign) e con cui il listone si indicizza:
 * usare qui una seconda ricetta significherebbe contare come «un altro
 * giocatore» lo stesso giocatore, cioè perdere in silenzio ogni precedente.
 *
 * SÉ STESSO. `SELF_ID` è escluso, come fa `opponentTier1()`: la domanda è cosa
 * hanno fatto GLI ALTRI. Il selettore di squadra del form ASSEGNA A non cambia
 * questo — quel selettore dice di chi è l'acquisto che si sta registrando,
 * questo blocco si legge sempre dalla sedia di Pico.
 *
 * NON DIPENDE DAL PREZZO CHE SI STA BATTENDO, e non è un dettaglio: i
 * precedenti sono del giocatore, non della cifra. È la differenza col blocco
 * che stava qui prima (`competitorSet`), che si ricalcolava a ogni tasto
 * proprio perché la sua domanda conteneva la cifra.
 */
function opponentPrecedentsProps(): OpponentPrecedentsProps {
  const selected = state.call.selectedPlayer;
  const called =
    selected === null
      ? null
      : {
          playerId: listonePlayerKey(selected),
          club: selected.club ?? state.call.club,
        };
  return {
    reading: auctionPrecedents({
      called,
      history: state.auctionHistory,
      seats: state.leagueRoster.seats,
      profiles: state.opponentProfiles,
      selfSeatId: SELF_ID,
    }),
    teamLabels: seatLabelMap(),
  };
}

/**
 * Ingressi della seconda metà del blocco «giocatore suggerito»: i LIBERI su cui
 * più avversari hanno insieme un precedente misurato, lo slot e i crediti.
 *
 * Legge le stesse tre memorie del pannello AVVERSARI: I PRECEDENTI — storico
 * d'asta, registro lega, listone — e nessuna in più. `exposureBook` è
 * memoizzato sull'IDENTITÀ di `state.auctionHistory`, `baitCandidates`
 * sull'identità di `state.pool`: fra un tasto e l'altro della ricerca cambia
 * solo `state.call.playerName`, che non è nella firma di nessuno dei due.
 *
 * `state.log.length` è una delle due firme dello stato derivato; l'altra la
 * costruisce `baitCandidates` da sé (budget, slot e chiavi dei venduti per
 * esteso). Servono entrambe, e il log NON è append-only per questa via:
 * `applyImportedRaw` più sopra lo SOSTITUISCE — vedi il commento su
 * `BaitCacheEntry` in src/baitCandidates.ts.
 */
function baitSectionProps(aState: AuctionState): BaitSectionProps {
  const selected = state.call.selectedPlayer;
  return {
    reading: baitCandidates({
      pool: state.pool,
      source: state.poolSource,
      book: exposureBook(state.auctionHistory),
      seats: state.leagueRoster.seats,
      state: aState,
      selfId: SELF_ID,
      logLength: state.log.length,
    }),
    teamLabels: seatLabelMap(),
    selectedKey: selected === null ? null : listonePlayerKey(selected),
  };
}

/**
 * Ingressi della PRIMA metà del blocco «giocatore suggerito»: i liberi che il
 * piano rosa dichiarato copre, che il max bid hard-safe regge, nell'ordine di
 * appetibilità dichiarato del ruolo.
 *
 * L'ORDINE È QUELLO DECISO DA PICO IL 2026-08-25 (in sessione): «deve essere un
 * mix tra le due cose. Il numero uno è il filtro a monte ma il due è quello
 * successivo» — il piano rosa FILTRA, il surplus ORDINA chi ha passato il
 * filtro. La lettura è tutta in src/perMeCandidates.ts.
 *
 * `values: null`, E PERCHÉ NON È UNA DIMENTICANZA. Il surplus ha per primo
 * ingrediente il listino dei valori DICHIARATI da Pico (`DeclaredValueBook`,
 * packages/engine/src/declaredValues.js), e quel listino **non ha ancora una
 * sorgente in `src/`** — è la stessa mancanza per cui `valueBoxProps` passa
 * `call: null` e lo slot 4 del riquadro del valore dice `n/d`. Fabbricarne uno
 * qui (un valore dedotto dalla Qt.A, una media di ruolo) sarebbe inventare
 * l'ingrediente 2 di §D9, cioè far dire all'app che Pico ha dichiarato
 * qualcosa che non ha dichiarato. Il campo è OBBLIGATORIO nel contratto proprio
 * perché questa scelta sia scritta a ogni chiamata invece che dimenticata: con
 * `null` nessuna riga ha un surplus, il sottoblocco lo DICE riga per riga
 * («valore non dichiarato») e le conta nella nota, e l'ordine cade sui criteri
 * che restano. Il giorno in cui quel listino entra nell'app, questa riga passa
 * un libro vero e il criterio 2 si accende senza toccare né la lettura né la
 * vista.
 *
 * Le tre memorie che legge sono quelle che l'app ha già: le righe del listone
 * (con la loro Qt.A e il loro indice di appetibilità), il log d'asta (da cui
 * l'inflazione misurata) e la dichiarazione di piano rosa conservata in
 * `state.rolePlan`. Nessuna sorgente nuova, nessun dato inventato.
 *
 * `state.rolePlan` attraversa il confine COSÌ COM'È, nella sua forma parziale:
 * un ruolo non dichiarato resta una chiave assente e non diventa uno zero
 * (src/rolePlan.ts), e il sottoblocco lo dice invece di ordinare su un piano
 * che Pico non ha scritto.
 */
function perMeSectionProps(aState: AuctionState): PerMeSectionProps {
  const selected = state.call.selectedPlayer;
  return {
    reading: perMeCandidates({
      pool: state.pool,
      source: state.poolSource,
      state: aState,
      log: state.log,
      selfId: SELF_ID,
      planDraft: state.rolePlan,
      values: null,
    }),
    selectedKey: selected === null ? null : listonePlayerKey(selected),
  };
}

// ── ARCHIVIO AVVERSARI — la via d'ingresso dei due depositi runtime-local ────
//
// PERCHÉ QUESTE QUATTRO FUNZIONI ESISTONO. `opponentPrecedentsProps()` qui
// sopra legge `state.auctionHistory` e `state.opponentProfiles`, che il boot
// riempie da `loadAuctionHistory` / `loadOpponentProfiles`. Fino a qui nessun
// punto dell'app chiamava mai le SCRITTURE gemelle di quelle letture: il
// pannello AVVERSARI: I PRECEDENTI era una stanza arredata senza porta, e in
// produzione avrebbe detto «Nessuno storico d'asta caricato» per sempre.
// Queste sono la porta; la logica sta in src/opponentArchive.ts, dove è
// verificabile senza un DOM.
//
// LO STATO RISPECCHIA LA MEMORIA, MAI L'INTENZIONE. Ogni azione riassegna
// `state.auctionHistory` con ciò che il modulo ha RILETTO dallo storage dopo
// l'azione — non con ciò che si è tentato di scrivere. È così che il rifiuto
// di un file storto lascia visibile l'archivio che è rimasto, e che una
// scrittura non attecchita si vede invece di essere promessa.

function loadAuctionHistoryFromText(text: string): void {
  const applied = applyAuctionHistoryText(browserStorage, text);
  state.auctionHistory = applied.stored;
  state.archiveHistoryMessage = applied.message;
  render();
}

function loadOpponentProfilesFromText(text: string): void {
  const applied = applyOpponentProfilesText(browserStorage, text);
  state.opponentProfiles = applied.stored;
  state.archiveProfilesMessage = applied.message;
  render();
}

function forgetAuctionHistoryArchive(): void {
  const applied = forgetAuctionHistory(browserStorage);
  state.auctionHistory = applied.stored;
  state.archiveHistoryMessage = applied.message;
  render();
}

function forgetOpponentProfilesArchive(): void {
  const applied = forgetOpponentProfiles(browserStorage);
  state.opponentProfiles = applied.stored;
  state.archiveProfilesMessage = applied.message;
  render();
}

/** Il corpo dell'area Impostazioni → Archivio avversari. */
function renderArchivioAvversariSettings(): HTMLElement {
  return renderOpponentArchiveSettings({
    history: state.auctionHistory,
    profiles: state.opponentProfiles,
    seats: state.leagueRoster.seats,
    selfSeatId: SELF_ID,
    historyMessage: state.archiveHistoryMessage,
    profilesMessage: state.archiveProfilesMessage,
    onHistoryFileText: loadAuctionHistoryFromText,
    onProfilesFileText: loadOpponentProfilesFromText,
    onForgetHistory: forgetAuctionHistoryArchive,
    onForgetProfiles: forgetOpponentProfilesArchive,
  });
}

/**
 * Ingressi del riquadro FASCIA DEL CHIAMATO (views.ts `renderTierBandBlock`):
 * in che fascia d'asta sta il giocatore chiamato e cosa è stato davvero pagato
 * in quella fascia stasera.
 *
 * Tutto il lavoro sta in `tierBandReading` (src/tierOrdering.ts), che è puro e
 * testato senza DOM: qui si passano soltanto i pezzi di stato che quella
 * funzione non può conoscere. `listonePlayerKey` è la STESSA chiave con cui
 * l'event log registra un acquisto — usarne una seconda qui significherebbe
 * cercare le fasce di un giocatore diverso da quello comprato.
 *
 * `role` viene dalla riga selezionata e non da `state.call.role`: sono lo
 * stesso valore finché la chiamata è correlata (isCallCorrelated), e la riga è
 * la sola delle due a essere anche l'identità su cui la fascia è costruita.
 */
function tierBandProps(aState: AuctionState): TierBandProps {
  const selected = state.call.selectedPlayer;
  return {
    reading: tierBandReading({
      pool: state.pool,
      source: state.poolSource,
      state: aState,
      log: state.log,
      called:
        selected === null
          ? null
          : { playerId: listonePlayerKey(selected), role: selected.role },
      selfId: SELF_ID,
    }),
    role: selected === null ? "" : selected.role,
  };
}

/**
 * Ingressi del RIQUADRO DEL VALORE (views.ts `renderValueBoxBlock`): i quattro
 * numeri di `docs/DECISIONS.md` §"Il riquadro del valore porta quattro numeri",
 * per il giocatore chiamato adesso.
 *
 * Tutto il lavoro sta in `valueBoxReading` (src/valueBox.ts), che è puro e
 * testato senza DOM: qui si passano soltanto i pezzi di stato che quella
 * funzione non può conoscere. `listonePlayerKey` è la STESSA chiave con cui
 * l'event log registra un acquisto, come per `tierBandProps`.
 *
 * `call: null`, E ADESSO NON ALIMENTA PIÙ NIENTE. La schermata CHIAMATA del
 * motore (`callScreen()`, packages/engine/src/callScreen.ts) è scritta,
 * esportata e provata, ma pretende DUE dichiarazioni di Pico che il core
 * pubblico non ha ancora un posto dove raccogliere: il listino dei valori per
 * giocatore (`DeclaredValueBook`) e il profilo di rischio (`ValueProfile`).
 * Fino al 2026-08-24 quella era la ragione per cui i due numeri in crediti
 * tacevano; dopo le due corsie di quel giorno non lo è più, perché nessuno dei
 * due passa più di lì. `call` resta nella firma e resta `null`, e non si
 * fabbrica: inventare un valore dedotto dalla quotazione o un profilo «medio»
 * di default sarebbe far dire all'app che Pico ha dichiarato qualcosa che non
 * ha dichiarato (§D9, ingrediente 2).
 *
 * LO SLOT 3 HA GIÀ TUTTI I SUOI INGRESSI. Il valore assoluto è DERIVATO
 * (packages/engine/src/absoluteValue.ts): budget del regolamento ripartito dai
 * TARGET DI RUOLO che Pico dichiara nel piano rosa (`state.rolePlan`, che una
 * sorgente ce l'ha), diviso per gli slot del ruolo, collocato dalla fascia del
 * libro. Le tre gambe arrivano da dove già vivono — la titolarità e la pagella
 * dalla scheda del Gruppo Esperti, la partecipazione alle coppe dall'elenco
 * dichiarato di src/serieACompetitions.ts — e oggi hanno tutte peso zero,
 * quindi la loro assenza non toglie il numero.
 *
 * LO SLOT 4 SI ACCENDE DAL PRIMO SECONDO, e `table` è la ragione. Dal
 * 2026-08-24 quel numero è «quanto costa vincere adesso» — il secondo max bid
 * fra i rivali eleggibili, più uno — e i suoi ingredienti sono soltanto fatti
 * duri dell'event log che l'app HA GIÀ: `deriveAuctionState()` e `SELF_ID`,
 * cioè gli stessi due che alimentano la war board e il momento dell'asta.
 *
 * ANCHE LO SLOT 2 SI MUOVE, ed è tutto il suo mestiere. Il punteggio relativo è
 * misurato sulla SCALA DEI LIBERI (src/relativeIndex.ts), memoizzata su
 * `(pool, libro, presi)`, cioè su una chiave che il log tocca soltanto per il
 * pezzo che il log davvero cambia: cambia quando qualcuno compra, e un tasto
 * nella ricerca la lascia intatta.
 *
 * LO SLOT 3, AL CONTRARIO, NON SI MUOVE DURANTE LA SERATA, ed è vero per
 * costruzione e non per attenzione: `AbsoluteValueInput` non ha un campo in cui
 * uno stato d'asta possa entrare, e il libro che ne esce è memoizzato su
 * `(pool, source, teamsCount)` e non conosce il log.
 *
 * `aState` SERVE QUINDI A TRE COSE DIVERSE, e vanno tenute distinte perché la
 * prima sembra contraddire le altre: allo SLOT 3 solo per il censimento delle
 * squadre dentro `buildTierBook` (come fa già il riquadro FASCIA); allo SLOT 2
 * per portare al motore chi è stato preso e quanti slot di quel ruolo sono già
 * riempiti; allo SLOT 4 per intero, perché è la serata. Arriva come PARAMETRO e
 * non da una seconda `deriveAuctionState()`: il riquadro deve mostrare lo
 * stesso tavolo della scheda che lo circonda, e due derivazioni nello stesso
 * render sono due fotografie che possono divergere.
 */
function valueBoxProps(aState: AuctionState): ValueBoxProps {
  const selected = state.call.selectedPlayer;
  const book = buildTierBook(state.pool, state.poolSource, aState);
  // La scheda del Gruppo Esperti del chiamato, risolta come la risolve il
  // riquadro INSIGHT GIOCATORE: una sorgente sola per gli stessi fatti, così le
  // due superfici non possono dire due cose diverse sullo stesso giocatore.
  const target = playerInsightTarget();
  const insight =
    target === null
      ? null
      : resolveExpertInsight(
          state.expertSchede,
          target,
          state.schedaLinks.get(schedaLinkRowKey(target)) ?? null,
        );
  const pagella = insight?.pagella;
  return {
    reading: valueBoxReading({
      called:
        selected === null
          ? null
          : { playerId: listonePlayerKey(selected), role: selected.role },
      appealIndex: selected?.appealIndex,
      call: null,
      // LISTA VUOTA, E NON PER DIMENTICANZA: nessuno dei quattro numeri
      // aspetta più una dichiarazione di Pico, quindi la nota in testata
      // («… ancora fuori dall'app») prometterebbe una cella spenta per una
      // ragione che non è la sua. Ogni `n/d` nomina adesso la cosa che manca
      // A QUELLA cella. `DECLARED_INPUTS_WITHOUT_SOURCE` resta dichiarata e
      // provata in src/valueBox.ts, dove il fatto che descrive è ancora vero,
      // e da qui NON è più nemmeno importata: un import che sopravvive al
      // proprio ultimo uso è un aggancio che sembra vivo, e `strict` senza
      // `noUnusedLocals` non lo segnala.
      missingDeclaredInputs: [],
      // LA SCALA DEI LIBERI, memoizzata: il libro è già quello sopra (una
      // costruzione sola, non due), i presi vengono dallo stato ridotto —
      // riconferme comprese, perché `reduce()` le semina lì ed è la stessa
      // nozione di «non prendibile» che usa l'occupazione delle fasce.
      //
      // IL MOTIVO DEL RIFIUTO NON PASSA, E LA CELLA NON FINGE DI AVERLO. Il
      // libro può mancare per CINQUE ragioni diverse (`TierBandUnavailable`), e
      // qui ne resta soltanto «non c'è»: il motore dell'indice relativo riceve
      // `null` e può dire una cosa sola. La conseguenza è dichiarata dove si
      // vede — la cella dello slot 2 dice «nessun ordine dichiarato» e non
      // afferma una causa che non conosce (src/ui/valueBox.ts,
      // `VALUE_MISSING_TEXT`) — mentre la causa vera la nomina il pannello
      // FASCIA, che il motivo ce l'ha. Far viaggiare il motivo fin qui è una
      // corsia sua: cambierebbe la firma del riquadro e il vocabolario dei
      // motivi, e non è il cambio di forma dello slot 2.
      relative: {
        ladder: buildFreeLadder(
          state.pool,
          book.kind === "book" ? book.book : null,
          aState.purchasedPlayerIds,
        ),
        state: aState,
        selfId: SELF_ID,
      },
      absolute: {
        // I TARGET DICHIARATI, così come Pico li ha scritti: la forma parziale
        // attraversa il confine intatta, e un ruolo non dichiarato resta una
        // chiave assente invece di diventare uno zero (src/rolePlan.ts).
        roleTargets: state.rolePlan?.targets ?? {},
        book: book.kind === "book" ? book.book : null,
        legs: {
          titolarita: insight?.titolarita ?? null,
          // `null` quando la riga non porta il club o quando il club non è fra
          // quelli di Serie A 2026/27: un'assenza dichiarata al posto di una
          // dedotta (src/serieACompetitions.ts).
          inEurope: playsInEurope(selected?.club ?? state.call.club),
          // SOLO PAGELLE COMPLETE, che è già la regola di src/pagellaEsperti.ts:
          // `totaleRicalcolato` è `null` finché i cinque assi non ci sono tutti.
          pagella:
            pagella !== undefined &&
            pagella.completa &&
            pagella.totaleRicalcolato !== null
              ? {
                  totale: pagella.totaleRicalcolato,
                  totaleMax: PAGELLA_TOTALE_MAX,
                }
              : null,
        },
      },
      table: { state: aState, selfId: SELF_ID },
    }),
  };
}

/**
 * L'identità con cui il riquadro INSIGHT GIOCATORE cerca la scheda: NOME +
 * SQUADRA della riga selezionata, `null` quando non c'è nessuna riga.
 *
 * `proxyId` è deliberatamente FUORI. Pico scrive nome e squadra come li legge
 * nel listone e non ha modo di conoscere un `proxyId`: passarlo qui farebbe
 * cercare `proxy:…` in un deposito indicizzato su nome+squadra, e il riquadro
 * direbbe «non è ancora scritta» su una scheda che esiste. Da quando
 * `resolveExpertInsight` riceve la coppia invece di una chiave già calcolata,
 * questo è un fatto della firma e non più un patto scritto in un commento.
 */
function playerInsightTarget(): SchedaTarget | null {
  const selected = state.call.selectedPlayer;
  if (selected === null) return null;
  // Il RUOLO viaggia insieme a nome e squadra, e serve a una cosa sola: sapere
  // quale sia il quarto asse della pagella (src/pagellaEsperti.ts). Non entra
  // nell'identità — `schedaLinkRowKey` continua a essere nome + squadra — e
  // senza di lui il quarto asse non si indovina, si dichiara `ruolo ignoto`.
  return {
    name: selected.name,
    club: selected.club ?? state.call.club,
    role: selected.role,
  };
}

/**
 * La vista del riquadro INSIGHT GIOCATORE per il giocatore attualmente in
 * asta, con la risposta che Pico ha già dato per questa riga quando ce n'era
 * una da dare.
 *
 * SENZA GIOCATORE SELEZIONATO la ricerca non parte e la risoluzione rende lo
 * stato onesto: non si cerca «una scheda qualsiasi».
 */
function playerInsightProps(): PlayerInsightProps {
  const target = playerInsightTarget();
  const chosen =
    target === null
      ? null
      : (state.schedaLinks.get(schedaLinkRowKey(target)) ?? null);
  return {
    view: resolveExpertInsight(state.expertSchede, target, chosen),
    choicePersisted: state.schedaLinksPersisted,
    onChooseScheda: chooseScheda,
    // LE PREVISIONI ARRIVANO DALLA RIGA, non dal deposito delle schede: sono
    // un campo del listone servito (`genForecast`), già validato dal contratto
    // di lettura, e la riga selezionata È la riga di listone su cui Pico ha
    // cliccato. Nessuna riga selezionata, o una riga che il deposito non serve:
    // `null`, e il riquadro non mostra nessuna riga di previsione invece di
    // mostrarne una vuota.
    genForecast: state.call.selectedPlayer?.genForecast ?? null,
  };
}

/**
 * I SEGNALI DI OGNI RIGA DEL LISTONE — i cinque voti del Gruppo Esperti e i
 * due campi «rigorista» e «piazzati» — presi da dove vivono davvero: il
 * deposito delle schede, agganciato per NOME + SQUADRA, non la riga di
 * listone. È la stessa risoluzione del riquadro INSIGHT GIOCATORE, quindi le
 * due superfici non possono dire due cose diverse sullo stesso giocatore.
 *
 * IL CALCOLO NON VIVE PIÙ QUI: sta in src/listoneRowSignals.ts, memoizzato
 * ATTRAVERSO i render invece che dentro uno solo. La versione che stava in
 * questo file costruiva una `Map` all'inizio del giro e la buttava alla fine —
 * dichiarato nel suo stesso commento — quindi `render()`, che gira a ogni
 * tasto della ricerca, ripagava tutto da capo. Misurato sul banco a 532 righe
 * (src/tierOrdering.perfScenario.ts): 4,5-6,4 ms per tasto con le pagelle nel
 * deposito e 4,4-4,6 ms per tasto OGGI con la tabella ordinata per una colonna
 * di segnale — quel secondo caso non è dietro `expertSchedeHavePagella` e non
 * era mai stato misurato. Qui resta solo la lettura dello stato.
 *
 * I CINQUE VOTI SONO SEMPRE VUOTI, OGGI, E LA COLONNA LO DICE (`n/d`).
 * L'estrazione dei voti dalle schede vive fuori da questo ramo e non è ancora
 * atterrata: quando lo farà, i voti arriveranno dentro la vista della scheda e
 * `resolveRowSignals` li porterà in tabella senza che questo file cambi.
 * Fino ad allora non si inventa niente: nessuno zero, nessuna media, nessun
 * valore di riempimento. Un voto che nessuno ha scritto non è un voto basso.
 */
function listoneSignalsInput(): ListoneSignalsInput {
  return {
    pool: state.pool,
    schede: state.expertSchede,
    links: state.schedaLinks,
  };
}

/**
 * Pico risponde alla domanda «quale di queste schede è sua», o la ritira
 * («nessuna di queste», `schedaKey === null`).
 *
 * La risposta è una preferenza di lettura, non un dato d'asta: non entra
 * nell'event log, non tocca il deposito (che è in sola lettura) e non cambia
 * nessun numero. Una scrittura fallita NON viene nascosta — `state
 * .schedaLinksPersisted` la porta a schermo — perché una scelta che sparisce al
 * prossimo avvio senza dirlo è esattamente il difetto silenzioso che questo
 * riquadro esiste per non avere.
 */
function chooseScheda(schedaKey: string | null): void {
  const target = playerInsightTarget();
  if (target === null) return;
  state.schedaLinks = withSchedaLink(
    state.schedaLinks,
    schedaLinkRowKey(target),
    schedaKey,
  );
  state.schedaLinksPersisted = saveSchedaLinks(
    browserStorage,
    state.schedaLinks,
  );
  render();
}

// How many already-assigned top-of-role purchases the "Contesto chiamata"
// panel lists. Small on purpose: it is a factual recap of what the role has
// already cost, not a leaderboard.
const NOMINATION_CONTEXT_TOP_LIMIT = 5;

/** Top-of-role purchases already registered, resolved to display names. */
function nominationContextTopAssigned(role: Role): NominationContextTopEntry[] {
  const poolIndex = auctionDisplayIndex();
  return roleTopPurchases(state.log, role, NOMINATION_CONTEXT_TOP_LIMIT).map(
    (entry) => ({
      playerName: resolvePlayerDisplayName(entry.playerId, poolIndex),
      teamLabel: displayTeamLabel(entry.fantaTeamId),
      price: entry.price,
    }),
  );
}

/**
 * Ingressi del riquadro IL RUOLO STASERA (views.ts `renderRoleDepletionBlock`):
 * che cosa è successo al ruolo in asta stasera, e quanti posti di quel ruolo
 * restano aperti al tavolo.
 *
 * Tutto il lavoro sta in `roleDepletionReading` (src/roleDepletion.ts), che è
 * puro e testato senza DOM: qui si passano soltanto i pezzi di stato che quella
 * funzione non può conoscere.
 *
 * `state.call.role` e non il ruolo della riga selezionata: è il ruolo con cui
 * la chiamata è partita, cioè quello che il resto della schermata live sta già
 * usando (`momentScarcityHtml` marca la sua cella con lo stesso valore), e due
 * ruoli diversi sulla stessa schermata sarebbero due risposte a due domande
 * mentre la domanda è una sola. `""` — nessuna chiamata — arriva fino alla
 * frase che lo dice, e non diventa un ruolo di ripiego.
 *
 * NON RICEVE IL LISTONE, e non è una dimenticanza: la decisione di Pico del
 * 16/08/2026 tiene la quotazione fuori dal calcolo, quindi questo pannello non
 * ha nemmeno il modo di guardarla. Vedi la nota in testa a src/roleDepletion.ts.
 */
function roleDepletionProps(aState: AuctionState): RoleDepletionProps {
  return {
    reading: roleDepletionReading({
      log: state.log,
      state: aState,
      role: state.call.role,
    }),
    teamLabels: seatLabelMap(),
  };
}

// ── Render entry point ────────────────────────────────────────────────────────
// Every render() rebuilds the whole DOM tree (app.innerHTML = ""), which
// would normally drop focus/cursor position on every keystroke in a live
// text input (e.g. the Listone name search). To keep typing feeling live
// without a dedicated partial-update path, we snapshot the focused
// element's id + text selection before tearing the DOM down and restore
// both afterwards.
/** Restores focus after a full-screen blocked render, same rule in every
 *  branch that replaces the whole app: keep whatever had focus if it still
 *  exists, otherwise land on the screen's own heading. */
function focusBlockedScreen(
  focusId: string | null,
  fallbackHeadingId: string,
): void {
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  } else {
    document.getElementById(fallbackHeadingId)?.focus({ preventScroll: true });
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;

  const active = document.activeElement;
  let focusId: string | null = null;
  let selStart: number | null = null;
  let selEnd: number | null = null;
  if (active instanceof HTMLElement && active.id && app.contains(active)) {
    focusId = active.id;
    if (
      active instanceof HTMLInputElement &&
      (active.type === "text" || active.type === "search")
    ) {
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    }
  }

  app.innerHTML = "";

  // A blocked/storage-error recovery state replaces the ENTIRE app: no
  // header, no nav, no Rose/Impostazioni — those all derive from the same
  // (potentially fabricated) log, and normal mutations must not be
  // reachable until this is resolved. See LIVE-02.
  if (
    state.recovery.kind === "blocked" ||
    state.recovery.kind === "storage-error"
  ) {
    app.appendChild(
      renderRecoveryBlockedScreen(
        recoveryBlockedProps(state.recovery),
        recoveryBlockedHandlers,
      ),
    );
    focusBlockedScreen(focusId, "recovery-heading");
    return;
  }

  // Post-review fix (round 2, #285): the riconferme storage key itself could
  // not be READ (not merely invalid — see ConfirmationsRecoveryState's own
  // doc comment). Checked right alongside the log's own blocked/storage-error
  // branch above, for the same reason: never let a real read failure
  // masquerade as "no confirmations".
  if (state.confirmationsRecovery.kind === "storage-error") {
    app.appendChild(
      renderConfirmationsStorageErrorScreen(
        { message: state.confirmationsRecovery.message },
        { onRetry: retryRecovery },
      ),
    );
    focusBlockedScreen(focusId, "confirmations-storage-error-heading");
    return;
  }

  // Tranche 2b (#231): riconferme pre-asta invalid AND the standing log is
  // non-empty — same full-app-replace posture as the log's own blocked
  // state above, but a SEPARATE store (src/confirmationsStore.ts) with its
  // own recovery family (see ConfirmationsRecoveryState). Checked second:
  // the log's own blocked state already has nothing else to show regardless.
  if (state.confirmationsRecovery.kind === "blocked") {
    app.appendChild(
      renderConfirmationsBlockedScreen(
        {
          quarantinedRaw: state.confirmationsRecovery.quarantinedRaw,
          quarantineStored: state.confirmationsRecovery.quarantineStored,
          confirmingRestart: state.confirmationsRecovery.confirmingRestart,
        },
        confirmationsBlockedHandlers,
      ),
    );
    focusBlockedScreen(focusId, "confirmations-recovery-heading");
    return;
  }

  // Fix 3 (#283) fail-closed guard: reduce() throws when the standing log
  // and the riconferme batch conflict (a live PURCHASE of an already-
  // confirmed playerId — packages/engine/src/reduce.ts). Structurally
  // excluded by the normal single-tab flow (purchaseFeasibility already
  // treats a confirmed player as duplicate-player via
  // aState.purchasedPlayerIds, and the riconferme panel is read-only once
  // the log is non-empty — see renderRiconfermeSettings), but reachable via
  // a multi-tab race after this tab already booted successfully: boot's own
  // validateAuctionLog gate (logRecovery.ts) only protects state computed
  // AT boot time, not a divergence introduced afterwards by another tab.
  // Checked HERE, once per render, before ANY screen calls
  // deriveAuctionState() — never a crash; degrades into the SAME governed
  // "storage-error" blocked screen the log's own persistence failures use.
  // Deliberate minimal-scope choice, declared in the PR body: no dedicated
  // UI for this specific conflict — "Riprova" (which reloads both stores
  // fresh) is the recovery path.
  try {
    reduce(state.log, FANTA_TEAM_IDS, state.confirmations);
  } catch (err) {
    state.recovery = {
      kind: "storage-error",
      message: `Le riconferme pre-asta salvate non sono coerenti con lo storico asta (${err instanceof Error ? err.message : String(err)}). Probabile scrittura concorrente da un'altra scheda: usa "Riprova lettura storage" per rileggere lo stato aggiornato.`,
      quarantinedRaw: null,
      quarantineStored: false,
    };
    app.appendChild(
      renderRecoveryBlockedScreen(
        recoveryBlockedProps(state.recovery),
        recoveryBlockedHandlers,
      ),
    );
    focusBlockedScreen(focusId, "recovery-heading");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "app-shell";

  wrapper.appendChild(renderHeader());

  // #331 punto 5 — the critical strip is page CHROME, not a card inside the
  // page column: it is mounted HERE, as the header's sibling, so it can be as
  // wide as the header and sit flush against it (inside .screen-container it
  // was capped at the 1200px column and floated 20px below the bar). And it is
  // mounted ONLY in the chiamata moment: during the live asta the same numbers
  // are answered by the player card (la nota «max bid sicuro» sotto «Prezzo da
  // pagare») and the war board MINI, and Pico asked for the vertical room back
  // exactly there.
  if (criticalStripMounted()) {
    wrapper.appendChild(
      renderCriticalAuctionStrip(myTeam(deriveAuctionState())),
    );
  }

  if (
    state.recovery.kind === "recovered" ||
    state.recovery.kind === "started-new"
  ) {
    wrapper.appendChild(
      renderRecoveryBanner(
        {
          kind: state.recovery.kind,
          quarantineStored: state.recovery.quarantineStored,
        },
        { onExport: exportQuarantinedLog },
      ),
    );
  }

  if (state.confirmationsRecovery.kind === "banner") {
    wrapper.appendChild(
      renderConfirmationsQuarantineBanner(
        {
          reason: state.confirmationsRecovery.reason,
          quarantineStored: state.confirmationsRecovery.quarantineStored,
        },
        { onExport: exportQuarantinedConfirmations },
      ),
    );
  }

  if (state.screen === "rose") {
    const roseState = deriveAuctionState();
    wrapper.appendChild(
      renderRoseScreen(
        roseState,
        FANTA_TEAM_IDS,
        SELF_ID,
        auctionDisplayPool(),
        openMock,
        seatLabelMap(),
        // Tier-1 accounting lives HERE, not on the Asta screen — see the UI
        // invariant in docs/FRONTEND_STRUCTURE.md and renderOpponentTier1Panel.
        opponentTier1(roseState, SELF_ID),
        renderMyRolePlanPanel(roseState),
      ),
    );
  } else if (state.screen === "impostazioni") {
    wrapper.appendChild(
      renderImpostazioniScreen(SETTINGS_AREAS, state.settingsArea, (id) => {
        state.settingsArea = id;
        // Fix 7 (PX, round 2, #285): a riconferme refusal must not sit there
        // sticky forever — switching settings tabs (away from riconferme OR
        // back onto it) is a "next render" the operator clearly asked for,
        // so it is exactly where the stale error/draft gets cleared.
        state.riconfermeError = "";
        state.riconfermeDraft = null;
        render();
        // Keep the keyboard where it was: arrow-key navigation re-renders.
        focusAfterRender(`settings-tab-${id}`);
      }),
    );
  } else {
    wrapper.appendChild(renderAsta());
  }

  app.appendChild(wrapper);

  if (state.pendingImportRaw !== null) {
    app.appendChild(renderImportConfirm());
    return;
  }

  // Mock modal takes priority over everything else on screen.
  if (state.mockModal) {
    app.appendChild(
      renderMockModal(state.mockModal.title, state.mockModal.body, closeMock),
    );
    return;
  }

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true });
      if (selStart !== null && el instanceof HTMLInputElement)
        el.setSelectionRange(selStart, selEnd ?? selStart);
    }
  } else if (state.screen === "asta" && state.moment === "asta") {
    // Restore focus to price input on first entry into the asta moment.
    // preventScroll: true so this doesn't fight the scroll-to-top done on
    // the chiamata/asta transition.
    const priceInput = document.getElementById(
      "assign-price",
    ) as HTMLInputElement | null;
    if (priceInput) priceInput.focus({ preventScroll: true });
  }
}

function openMock(title: string, body: string): void {
  state.mockModal = { title, body };
  render();
}

function closeMock(): void {
  state.mockModal = null;
  render();
}

// ── Recovery handlers (LIVE-02) ──────────────────────────────────────────

function recoveryBlockedProps(
  recovery: Extract<RecoveryState, { kind: "blocked" | "storage-error" }>,
): RecoveryBlockedProps {
  if (recovery.kind === "storage-error") {
    return {
      reason: "storage-error",
      quarantinedRaw: recovery.quarantinedRaw,
      quarantineStored: recovery.quarantineStored,
      storageErrorMessage: recovery.message,
      confirmingNewLog: false,
    };
  }
  return {
    reason: "invalid-log",
    quarantinedRaw: recovery.quarantinedRaw,
    quarantineStored: recovery.quarantineStored,
    storageErrorMessage: null,
    confirmingNewLog: recovery.confirmingNewLog,
  };
}

const recoveryBlockedHandlers = {
  onRetry: () => retryRecovery(),
  onExport: () => exportQuarantinedLog(),
  onRequestStartNew: () => requestStartNewLog(),
  onConfirmStartNew: () => confirmStartNewLog(),
  onCancelStartNew: () => cancelStartNewLog(),
};

const confirmationsBlockedHandlers = {
  onRetry: () => retryRecovery(),
  onExport: () => exportQuarantinedConfirmations(),
  onRequestRestart: () => requestRestartWithoutConfirmations(),
  onConfirmRestart: () => confirmRestartWithoutConfirmations(),
  onCancelRestart: () => cancelRestartWithoutConfirmations(),
};

/** "Riprova": a fresh read+validate of BOTH stores, nothing more — same
 *  fail-closed logic as boot, just re-run on demand (e.g. after fixing
 *  storage externally, or to pick up a change made from another tab).
 *  Riconferme are re-read FIRST for the same reason boot does: the log's
 *  own validation depends on them. */
function retryRecovery(): void {
  browserStorage = acquireBrowserStorage();
  const confirmationsResult = loadConfirmations(browserStorage, FANTA_TEAM_IDS);
  const confirmations = confirmationsFromLoadResult(confirmationsResult);
  const result = loadAuctionLog(browserStorage, FANTA_TEAM_IDS, confirmations);
  const logEvents = logFromLoadResult(result);
  state.log = logEvents;
  state.recovery = recoveryFromLoadResult(result);
  state.confirmations = confirmations;
  state.confirmationsRecovery = confirmationsRecoveryFromLoadResult(
    confirmationsResult,
    logEvents.length === 0,
  );
  render();
}

/** Downloads the exact quarantined text as-is — never parsed, never
 *  normalized, so a non-JSON payload still exports byte-for-byte. */
function exportQuarantinedLog(): void {
  const recovery = state.recovery;
  const raw = "quarantinedRaw" in recovery ? recovery.quarantinedRaw : null;
  if (raw === null) {
    state.persistenceError =
      "Export non disponibile: il payload non valido non è presente in memoria.";
    render();
    return;
  }
  const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fac_log_quarantine_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Same idea as exportQuarantinedLog, for the riconferme store's own
 *  quarantine key — never parsed, never normalized. */
function exportQuarantinedConfirmations(): void {
  const recovery = state.confirmationsRecovery;
  const raw = "quarantinedRaw" in recovery ? recovery.quarantinedRaw : null;
  if (raw === null) {
    state.riconfermeError =
      "Export non disponibile: il payload non valido non è presente in memoria.";
    render();
    return;
  }
  const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fac_confirmations_quarantine_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function requestRestartWithoutConfirmations(): void {
  if (state.confirmationsRecovery.kind !== "blocked") return;
  state.confirmationsRecovery = {
    ...state.confirmationsRecovery,
    confirmingRestart: true,
  };
  render();
}

function cancelRestartWithoutConfirmations(): void {
  if (state.confirmationsRecovery.kind !== "blocked") return;
  state.confirmationsRecovery = {
    ...state.confirmationsRecovery,
    confirmingRestart: false,
  };
  render();
}

/**
 * The only destructive confirmations-recovery action: persists a brand-new
 * EMPTY riconferme batch (never a "repair" of the corrupted one) after
 * explicit confirmation — mirrors confirmStartNewLog()'s posture for the
 * log, but touches ONLY the confirmations store, never `state.log`. The
 * quarantined payload is never touched here — it stays exportable from the
 * banner that follows. A write failure escalates to the SAME app-wide
 * "storage-error" the log's own confirmStartNewLog uses on the same kind of
 * failure: an empty batch that cannot be written means the browser storage
 * itself is not currently usable, which is a bigger problem than riconferme.
 */
function confirmRestartWithoutConfirmations(): void {
  if (state.confirmationsRecovery.kind !== "blocked") return;
  const { quarantinedRaw, quarantineStored } = state.confirmationsRecovery;
  const saveResult = saveConfirmations(browserStorage, [], FANTA_TEAM_IDS);
  if (!saveResult.ok) {
    const message =
      saveResult.reason === "storage-write-error" ||
      saveResult.reason === "partial-write"
        ? saveResult.message
        : "salvataggio rifiutato";
    state.recovery = {
      kind: "storage-error",
      message: `Impossibile salvare riconferme vuote (${message}). Riprova.`,
      quarantinedRaw: null,
      quarantineStored: false,
    };
    render();
    return;
  }
  state.confirmations = [];
  state.confirmationsRecovery = {
    kind: "banner",
    reason: "restarted-without-confirmations",
    quarantinedRaw,
    quarantineStored,
  };
  render();
}

function downloadAuctionLog(raw: string): void {
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fantacalcio-auction-log.v2.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCurrentLog(): void {
  const result = exportAuctionLog(
    state.log,
    FANTA_TEAM_IDS,
    state.confirmations,
  );
  if (!result.ok) {
    state.persistenceError =
      "Export rifiutato: lo storico corrente non supera la validazione.";
    render();
    return;
  }
  downloadAuctionLog(result.raw);
}

/**
 * Post-review fix (round 2, #285): the confirm dialog used to gate only on
 * `state.log.length > 0`. On a device with an EMPTY log but real riconferme
 * already entered (the ordinary pre-asta state — the panel is only editable
 * while the log is empty), importing skipped the dialog entirely and
 * silently replaced those riconferme: a v1 file overwrites them with
 * whatever WAS in storage when import ran (no-op, harmless), but a v2
 * file's own `confirmations` field replaces them outright — real riconferme
 * lost with no confirmation step at all. Gating on confirmations too closes
 * that hole; the two conditions are independent (either non-empty is
 * enough), and pendingImportRaw's copy (renderImportConfirm) says exactly
 * what will be replaced once the raw is classified.
 */
function importRequiresConfirmation(): boolean {
  return state.log.length > 0 || state.confirmations.length > 0;
}

async function importCurrentLog(file: File): Promise<void> {
  let raw: string;
  try {
    raw = await file.text();
  } catch (err) {
    state.persistenceError = `Impossibile leggere il file selezionato (${err instanceof Error ? err.message : String(err)}).`;
    render();
    return;
  }
  if (importRequiresConfirmation()) {
    state.pendingImportRaw = raw;
    render();
    return;
  }
  applyImportedRaw(raw);
}

/**
 * `importAuctionLog` (tranche 2b) now also carries the confirmations paired
 * with the imported log: a v2 file's own batch (already persisted by
 * importAuctionLog via saveConfirmations, atomic-with-rollback against the
 * log — see logRecovery.ts), or the device's unchanged batch for a v1
 * legacy file. Either way `state.confirmations` is updated to match exactly
 * what is now on disk, so state never drifts from storage after an import.
 */
function applyImportedRaw(raw: string): void {
  const result = importAuctionLog(
    browserStorage,
    state.log,
    raw,
    FANTA_TEAM_IDS,
    true,
    state.confirmations,
  );
  if (!result.ok) {
    if (
      result.reason === "storage-write-error" ||
      result.reason === "partial-write"
    ) {
      handleSaveFailure(result);
    } else if (result.reason === "incompatible-version") {
      state.persistenceError =
        "Import rifiutato: versione del file non compatibile. Nessuna modifica applicata.";
    } else if (result.reason === "invalid-log") {
      state.persistenceError =
        "Import rifiutato: il log non è semanticamente valido (o non coerente con le riconferme correnti). Nessuna modifica applicata.";
    } else {
      state.persistenceError =
        "Import rifiutato: file malformato. Nessuna modifica applicata.";
    }
    render();
    return;
  }
  state.log = [...result.events];
  state.confirmations = [...result.confirmations];
  // Post-review fix (round 2, #285): explicit post-import feedback that
  // names exactly what changed — a v2 file replaces both stores, a v1
  // legacy file only ever touches the log (see the v1 branch in
  // parseAuctionLogImport). `raw` was already accepted above, so this
  // classification cannot land on "unknown" — peekPortableLogEnvelope uses
  // the SAME envelope-shape checks parseAuctionLogImport itself used.
  state.persistenceError =
    peekPortableLogEnvelope(raw) === "v2"
      ? "Import completato: storico e riconferme aggiornati dal file importato."
      : "Import completato: storico aggiornato. Le riconferme restano quelle del dispositivo, validate contro il file importato.";
  state.error = "";
  render();
}

function focusAfterRender(id: string): void {
  requestAnimationFrame(() =>
    document.getElementById(id)?.focus({ preventScroll: true }),
  );
}

function cancelPendingImport(): void {
  state.pendingImportRaw = null;
  state.persistenceError =
    "Import annullato: nessuna modifica applicata (storico e riconferme invariati).";
  render();
  focusAfterRender("auction-log-import");
}

function renderImportConfirm(): HTMLElement {
  const overlay = document.createElement("div");
  // Opens on the Asta screen, under the sticky critical strip, which paints
  // over it on purpose — `.modal-overlay`'s own top padding is what keeps the
  // dialog's heading clear of it. See the comment in src/styles/components.css.
  overlay.className = "modal-overlay";
  overlay.id = "import-confirm-overlay";

  const modal = document.createElement("div");
  modal.className = "confirmation-dialog";
  modal.setAttribute("aria-labelledby", "import-confirm-title");

  // Post-review fix (round 2, #285): the copy must declare EXACTLY what
  // this import will replace — a v2 file carries its OWN riconferme batch
  // (replaces both stores), a v1 legacy file carries none (the device's
  // riconferme survive, the imported log is only checked against them).
  // "unknown" (malformed/unrecognised envelope) falls back to the more
  // cautious wording rather than assert a version the peek cannot confirm —
  // applyImportedRaw's own validation is still what actually decides
  // accept/reject once confirmed.
  const importKind =
    state.pendingImportRaw !== null
      ? peekPortableLogEnvelope(state.pendingImportRaw)
      : "unknown";

  const title = document.createElement("h2");
  title.id = "import-confirm-title";
  title.textContent = "Sostituire lo storico corrente?";
  const body = document.createElement("p");
  body.id = "import-confirm-body";
  body.textContent =
    importKind === "v2"
      ? "Il file importato sostituirà storico E riconferme, solo dopo validazione e persistenza completate."
      : importKind === "v1"
        ? "Il file importato sostituirà solo lo storico: le riconferme del dispositivo restano e il log importato verrà validato contro di esse, solo dopo validazione e persistenza completate."
        : "L'import sostituirà lo storico corrente (ed eventuali riconferme incluse nel file) solo dopo validazione e persistenza completate.";
  const actions = document.createElement("div");
  actions.className = "confirmation-dialog__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.id = "import-confirm-cancel";
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--secondary";
  cancelBtn.textContent = "Mantieni storico";
  cancelBtn.dataset.dialogInitialFocus = "";
  cancelBtn.addEventListener("click", cancelPendingImport);

  const confirmBtn = document.createElement("button");
  confirmBtn.id = "import-confirm-apply";
  confirmBtn.type = "button";
  confirmBtn.className = "btn btn--danger";
  confirmBtn.textContent = "Sostituisci con import";
  confirmBtn.addEventListener("click", () => {
    const raw = state.pendingImportRaw;
    if (raw === null || confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    state.pendingImportRaw = null;
    applyImportedRaw(raw);
    focusAfterRender(criticalFocusAnchorId());
  });

  actions.append(cancelBtn, confirmBtn);
  modal.append(title, body, actions);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) cancelPendingImport();
  });
  activateAccessibleDialog(overlay, modal, cancelPendingImport);
  return overlay;
}

function requestStartNewLog(): void {
  if (state.recovery.kind !== "blocked") return;
  state.recovery = { ...state.recovery, confirmingNewLog: true };
  render();
}

function cancelStartNewLog(): void {
  if (state.recovery.kind !== "blocked") return;
  state.recovery = { ...state.recovery, confirmingNewLog: false };
  render();
}

/** The only destructive recovery action: persists a brand-new EMPTY log
 *  (never a "repair" of the old one) after explicit confirmation. The
 *  quarantined payload is never touched here — it stays available for
 *  export in the "started-new" banner that follows. */
function confirmStartNewLog(): void {
  if (state.recovery.kind !== "blocked") return;
  const quarantinedRaw = state.recovery.quarantinedRaw;
  const quarantineStored = state.recovery.quarantineStored;
  const saveResult = saveAuctionLog(
    browserStorage,
    [],
    FANTA_TEAM_IDS,
    undefined,
    state.confirmations,
  );
  if (!saveResult.ok) {
    // Saving `[]` is always structurally valid against ANY confirmations
    // batch (an empty log has no PURCHASE to conflict with one) — a
    // failure here means the browser genuinely can't write right now. Stay
    // fail-closed rather than pretend a new log started.
    state.recovery = {
      kind: "storage-error",
      message: persistenceErrorMessage(saveResult),
      quarantinedRaw,
      quarantineStored,
    };
    render();
    return;
  }
  state.log = [];
  state.recovery = { kind: "started-new", quarantinedRaw, quarantineStored };
  render();
}

// Simple, reliable scroll reset for the main view transitions (nav between
// screens, moment switches). Deliberately not hooked into every render() —
// only into the transitions that actually change "which page you're on",
// so opening a mock modal or Undo confirm doesn't lose your scroll spot.
function scrollToTop(): void {
  window.scrollTo(0, 0);
}

// ── Header — persistent nav across the 3 shell screens ───────────────────────
function renderHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "topbar";

  const logo = document.createElement("span");
  logo.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.08em;color:${C.textSec};`;
  logo.textContent = "FANTACALCIO COPILOT";

  const nav = document.createElement("nav");
  nav.style.cssText = `display:flex;gap:20px;font-size:13px;`;

  const items: Array<{ label: string; screen: Screen }> = [
    { label: "Asta", screen: "asta" },
    { label: "Rose", screen: "rose" },
    { label: "Impostazioni", screen: "impostazioni" },
  ];
  for (const item of items) {
    const link = document.createElement("span");
    link.textContent = item.label;
    const active = state.screen === item.screen;
    link.style.cssText = `cursor:pointer;font-weight:${active ? "700" : "400"};color:${active ? C.textPrimary : C.textSec};`;
    link.tabIndex = 0;
    link.setAttribute("role", "button");
    link.addEventListener("click", () => {
      state.screen = item.screen;
      // Fix 7 (PX, round 2, #285): see the settingsArea callback's own
      // comment above — a top-level screen switch is the same kind of
      // "next render the operator asked for" that clears a sticky
      // riconferme refusal, not just a successful save.
      state.riconfermeError = "";
      state.riconfermeDraft = null;
      scrollToTop();
      render();
    });
    link.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        link.click();
      }
    });
    nav.appendChild(link);
  }

  header.appendChild(logo);
  header.appendChild(nav);
  return header;
}

// ── Asta screen ───────────────────────────────────────────────────────────────
function renderAsta(): HTMLElement {
  const aState = deriveAuctionState();
  const team = myTeam(aState);

  const wrap = document.createElement("div");
  wrap.className = "screen-container";
  wrap.style.cssText = `padding:20px 24px;gap:18px;`;

  // A mutation (purchase/void) that could not be persisted — distinct from
  // `state.error` (assign-form validation) and visible regardless of
  // chiamata/asta moment, since a void can fail from either. See LIVE-02.
  if (state.persistenceError) {
    const persistErr = document.createElement("div");
    persistErr.setAttribute("role", "alert");
    persistErr.style.cssText = `font-size:13px;line-height:1.5;color:${C.stopRed};border:1px solid ${C.stopRedDark};border-radius:8px;padding:10px 14px;`;
    persistErr.textContent = state.persistenceError;
    wrap.appendChild(persistErr);
  }

  // Listone ⇄ log reconciliation (audit round 2, findings 1/3/4). Rendered
  // here, next to the persistence error and above the critical strip, for the
  // same reason: it is about the trustworthiness of the accounting on screen,
  // it must be visible in BOTH moments (a pool can change while an asta is
  // open — the deposit lands on its own), and it is never dismissable.
  //
  // Two halves, deliberately: the standing-orphans clause is DERIVED here, so
  // it disappears by itself once it stops being true, while `state.poolNotice`
  // carries what happened at the last pool change (a refused substitution, a
  // disarmed selection, a pool that could not be saved) — events, which no
  // recomputation could recover.
  const poolNoticeText = [poolOrphanNotice(), state.poolNotice]
    .filter((s) => s !== "")
    .join(" ");
  if (poolNoticeText) {
    const poolNotice = document.createElement("div");
    poolNotice.id = "pool-notice";
    poolNotice.setAttribute("role", "alert");
    poolNotice.style.cssText = `font-size:13px;line-height:1.5;color:${C.stopRed};border:1px solid ${C.stopRedDark};border-radius:8px;padding:10px 14px;`;
    poolNotice.textContent = poolNoticeText;
    wrap.appendChild(poolNotice);
  }

  // LA CODA DEI FLAG «CHI ERA IN GARA» NON È AL SICURO — e si dice a voce
  // bassa, di proposito. Non è `role="alert"` e non è rossa come le due righe
  // qui sopra: quelle parlano della contabilità dell'asta, questa di un dato di
  // contorno che si è perso. Alzare la voce per lui mentre l'asta corre
  // costerebbe attenzione più di quanto il dato valga, e la frase dice come
  // prima cosa che l'acquisto c'è.
  if (state.interestFlagsNotice) {
    const flagNotice = document.createElement("div");
    flagNotice.id = "interest-flag-notice";
    flagNotice.setAttribute("role", "status");
    flagNotice.className = "hint-text";
    flagNotice.style.cssText = `border:1px solid ${C.border};border-radius:8px;padding:8px 12px;`;
    flagNotice.textContent = state.interestFlagsNotice;
    wrap.appendChild(flagNotice);
  }

  // The critical strip used to be appended here. It now lives next to the
  // header (see render()) so it can be header-wide and header-attached, and
  // only in the chiamata moment — #331 punto 5.

  // Confirm void overlay
  if (state.confirmVoidSeq !== null) {
    wrap.appendChild(renderVoidConfirm());
    return wrap;
  }

  // Remaining supply per role — deterministic, from the event log (slots) and
  // the loaded listone row count (availability). Derived ONCE per render and
  // handed to both readers: the CONTESTO CHIAMATA panel (selected role only)
  // and the table-side block below.
  const scarcity = roleScarcity(aState, scarcityPool());

  // Zone 1
  wrap.appendChild(renderZona1(aState, team, scarcity));

  // #333 — where the table lives, per moment.
  //
  // CHIAMATA: scarsità per ruolo + war board are one block (renderTableDetail),
  // below the whole call panel. They read the same eight seats from the TABLE's
  // side, and together they were more than half of this screen's height while
  // the search field — the reason the screen exists — sat below the fold. Moved
  // and grouped, not removed: every number is still in the DOM, in the same
  // panels, and since 2026-08-26 in plain sight — the group is ALWAYS OPEN
  // (Pico's decision; see renderTableDetail).
  //
  // ASTA: il momento live non ha questo gruppo. La contabilità di tutto il
  // tavolo lì è la striscia WAR BOARD (MINI), renderWarBoardMini in
  // renderMomentoAsta.
  if (state.moment === "chiamata") {
    wrap.appendChild(renderTableDetail(aState, scarcity));
  }

  // Zone 4
  wrap.appendChild(renderZona4(aState));

  return wrap;
}

/**
 * Whether `#critical-auction-strip` is on screen right now — #331 punto 5
 * moved it out of the Asta page column and restricted it to the chiamata
 * moment, so "is the strip there?" is no longer "are we on the Asta screen?".
 * Two things read it: where the strip is mounted (render()) and everything
 * that used it as a focus/clearance anchor (the two confirmation overlays).
 */
function criticalStripMounted(): boolean {
  return state.screen === "asta" && state.moment === "chiamata";
}

/**
 * Where focus lands after a confirmation overlay that has no better return
 * target. The strip was that anchor unconditionally; in the asta moment it is
 * not rendered any more, so the anchor falls back to the price field — the
 * control that moment is built around.
 */
function criticalFocusAnchorId(): string {
  return criticalStripMounted() ? "critical-auction-strip" : "assign-price";
}

/**
 * A modal confirmation is up. The strip keeps painting OVER it on purpose (the
 * accounting must stay readable while you confirm), which is exactly why its
 * one control has to stand down while that is true: a focusable, clickable
 * button rendered outside a modal dialog would sit on top of it, escape the
 * dialog's focus trap by pointer, and could grow the strip over the dialog's
 * own heading. While an overlay is open the roster is a plain readout and its
 * detail stays collapsed — `state.criticalPlanOpen` is untouched, so it comes
 * back exactly as it was once the dialog closes.
 */
function confirmationOverlayOpen(): boolean {
  return (
    state.confirmVoidSeq !== null ||
    state.pendingImportRaw !== null ||
    state.mockModal !== null
  );
}

// Persistent, constraint-only accounting: budget/slots/max_safe come from the
// engine and never expose gated ranking, target-band or FTM fields.
// Absorbs what the separate BUDGET & ROSA panel used to show further down the
// page: residuo/spesi and the per-role roster progress. They answer the same
// question as the ceiling ("how much room is left, and where"), so splitting
// them across a sticky strip and a panel you had to scroll to meant reading
// two places for one answer.
//
// #331 punto 5 — UNA RIGA SOLA, senza perdere niente. The four metrics AND the
// per-role roster progress (chip + filled/total) share a single line; what used
// to force a second full-width line — the four progress bars and the per-role
// budget envelope (slot/min/max) — moved behind an explicit toggle, still one
// key/click away, still in the DOM, still announced (aria-expanded/controls).
// Nothing was deleted: the strip renders the same facts, in less room.
function renderCriticalAuctionStrip(team: TeamState | undefined): HTMLElement {
  const strip = document.createElement("section");
  strip.id = "critical-auction-strip";
  strip.className = "critical-auction-strip";
  strip.tabIndex = -1;
  strip.setAttribute("aria-label", "Budget, rosa e vincoli critici asta");

  if (!team) {
    strip.innerHTML = `<div class="critical-strip__row"><div class="critical-metric critical-metric--bid critical-bid--stop"><span>${MAX_BID_LABEL_LONG_SENTENCE}</span><strong>— <em>stato squadra non disponibile</em></strong></div></div>`;
    return strip;
  }

  const plan = budgetPlan(team);
  // One ceiling, not four. maxSafe() is role-independent by construction
  // (budget_residual − (slot_rimanenti − 1) × COST_FLOOR); the role acts only
  // as a switch that zeroes a full department, and a full department is not
  // one you are bidding on — nor a stable state, since a void frees the slot
  // again. So any role with a free slot yields THE ceiling.
  const openRole = ROLES.find((role) => team.slotsRemaining[role] > 0);
  const bid = openRole ? maxSafe(team, openRole) : null;

  // The old standalone HARD STOP badge restated `max_safe >= COST_FLOOR` as a
  // boolean; it is folded into this number's state instead. Amber is the case
  // the badge could not express: alive but locked at the floor.
  let bidState: string;
  let bidValue: string;
  let bidNote: string;
  if (!bid) {
    bidState = "critical-bid--done";
    bidValue = "—";
    bidNote = "rosa completa";
  } else if (!plan.isCompletable) {
    bidState = "critical-bid--stop";
    bidValue = `${bid.maxSafe} cr`;
    bidNote = `rosa non completabile · deficit ${plan.budgetShortfall} cr`;
  } else if (plan.freeBudget === 0) {
    bidState = "critical-bid--locked";
    bidValue = `${bid.maxSafe} cr`;
    bidNote = "budget bloccato · solo al minimo";
  } else {
    bidState = "critical-bid--open";
    bidValue = `${bid.maxSafe} cr`;
    bidNote = "";
  }

  // Roster progress per role. `filled/total` is roster completion; the "Slot"
  // metric above stays because it is the aggregate that drives the ceiling
  // (max_safe = budget − slot + 1) and is not readable off these four bars
  // without summing four subtractions.
  //
  // Two renderings of the SAME four roles, deliberately:
  //  - the pills, on the single row: chip + filled/total + the completion
  //    tick. This is the part the operator reads between one call and the
  //    next, so it never goes behind a gesture;
  //  - the detail, one gesture away: the progress bar (with its progressbar
  //    role and aria values) and the per-role structural budget envelope —
  //    plan.perRole (issue #265 item #1, matrice UI §3 "Contabilità: budget,
  //    slot, hard_reserve, max_safe, violazioni | Visibile | Nessuno").
  //    Read-only off the engine's output: no new calculation, no advice.
  const rosterPills = ROLES.map((role) => {
    const filled = team.filled[role] ?? 0;
    const total = ROSTER_REQUIREMENTS[role] ?? 0;
    const complete = total > 0 && filled >= total;
    return `<span class="critical-role-pill${complete ? " critical-role-pill--complete" : ""}">${roleChipHtml(role)}<em>${filled}/${total}${complete ? " ✓" : ""}</em></span>`;
  }).join("");

  // The pills ARE the disclosure control: pressing the roster opens the roster
  // detail. A separate labelled toggle button cost ~137px of the single row —
  // enough to push the row onto a second line at 768px, i.e. to spend on the
  // gesture exactly the space the gesture exists to save. `aria-label` restates
  // the counts so screen readers lose nothing by the pills being a button name.
  const rosterAriaCounts = ROLES.map(
    (role) =>
      `${ROLE_LABELS[role]} ${team.filled[role] ?? 0} su ${ROSTER_REQUIREMENTS[role] ?? 0}`,
  ).join(", ");

  const rosterDetail = ROLES.map((role) => {
    const filled = team.filled[role] ?? 0;
    const total = ROSTER_REQUIREMENTS[role] ?? 0;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    const complete = total > 0 && filled >= total;
    const envelope = plan.perRole[role];
    return `
      <div class="critical-role${complete ? " critical-role--complete" : ""}">
        <span class="critical-role-head">
          ${roleChipHtml(role)}
          <em>${filled}/${total}${complete ? " ✓" : ""}</em>
        </span>
        <span class="critical-role-bar" role="progressbar"
              aria-label="${ROLE_LABELS[role]}"
              aria-valuenow="${filled}" aria-valuemin="0" aria-valuemax="${total}">
          <i style="width:${pct}%"></i>
        </span>
        <span class="critical-role-plan" id="critical-role-plan-${role}"
              aria-label="Piano budget ${ROLE_LABELS[role]}: ${envelope.slotsRemaining} slot residui, riserva minima ${envelope.minReserve} cr, massimo allocabile ${envelope.maxAllocatable} cr">
          ${roleBudgetPlanHtml(envelope)}
        </span>
      </div>`;
  }).join("");

  const interactive = !confirmationOverlayOpen();
  const planOpen = state.criticalPlanOpen && interactive;
  const roster = interactive
    ? `<button type="button" class="critical-roster" id="critical-roster"
              aria-expanded="${planOpen}" aria-controls="critical-roster-detail"
              title="Dettaglio per ruolo: avanzamento e piano budget"
              aria-label="Avanzamento rosa — ${rosterAriaCounts}. ${planOpen ? "Chiudi" : "Apri"} il dettaglio per ruolo.">${rosterPills}<span class="critical-roster__caret" aria-hidden="true">${planOpen ? "▴" : "▾"}</span></button>`
    : `<div class="critical-roster critical-roster--static" id="critical-roster"
            aria-label="Avanzamento rosa — ${rosterAriaCounts}.">${rosterPills}</div>`;
  strip.innerHTML = `
    <div class="critical-strip__row">
      <div class="critical-metric">
        <span>Budget</span>
        <strong id="critical-budget">${team.budgetResidual} cr</strong>
      </div>
      <div class="critical-metric">
        <span>Spesi</span>
        <strong id="critical-spent">${team.spent} cr</strong>
      </div>
      <div class="critical-metric">
        <span>Slot</span>
        <strong id="critical-slots">${team.totalSlotsRemaining}</strong>
      </div>
      ${roster}
      <div class="critical-metric critical-metric--bid ${bidState}"
           id="critical-max-bid" role="status" aria-live="polite">
        <span>${MAX_BID_LABEL_LONG_SENTENCE}</span>
        <strong>${bidValue}${bidNote ? ` <em>${bidNote}</em>` : ""}</strong>
      </div>
    </div>
    <div class="critical-roster-detail" id="critical-roster-detail"${planOpen ? "" : " hidden"}>${rosterDetail}</div>
  `;

  const toggle = strip.querySelector("#critical-roster");
  toggle?.addEventListener("click", () => {
    state.criticalPlanOpen = !state.criticalPlanOpen;
    render();
    // The strip is rebuilt from scratch by render(); without this the keyboard
    // would be dropped on the body right after opening the detail.
    focusAfterRender("critical-roster");
  });
  return strip;
}

// App status, NOT auction state. These three are constants or near-constants
// (SHADOW and NO TARGET never change while the gates are closed; connectivity
// changes without any operational consequence once the pool is loaded), so
// they earn no room in the Asta view, where the only question per call is how
// high you can go. They live in Impostazioni and are read on demand.
// Rendered here rather than in views.ts because connectivity reads app state.
/** Display name for a seat: its occupant, or the seat id while free. */
function displayTeamLabel(id: string): string {
  return seatLabel(state.leagueRoster, id);
}

// The Impostazioni areas. Bodies are thunks so only the selected one is
// built — an unselected area costs nothing to list.
const SETTINGS_AREAS: readonly SettingsArea[] = [
  {
    id: "teams",
    title: "Partecipanti e squadre",
    icon: SETTINGS_ICONS.people,
    body: () => renderLeagueTeamsSettings(),
  },
  {
    id: "riconferme",
    title: "Riconferme pre-asta",
    icon: SETTINGS_ICONS.confirm,
    body: () => renderRiconfermeSettings(),
  },
  {
    id: "schede",
    title: "Schede Gruppo Esperti",
    icon: SETTINGS_ICONS.scheda,
    body: () => renderSchedeSettings(),
  },
  {
    // La via d'ingresso dello storico d'asta: senza questa area il pannello
    // AVVERSARI resterebbe muto in produzione, perché non esisterebbe alcun
    // punto in cui caricare l'archivio. Convive con "schede": le due aree
    // sono nate in parallelo e occupavano lo stesso slot, ma rispondono a
    // due domande diverse e nessuna sostituisce l'altra.
    id: "archivio",
    title: "Archivio avversari",
    icon: ARCHIVE_SETTINGS_ICON,
    body: () => renderArchivioAvversariSettings(),
  },
  {
    id: "status",
    title: "Stato app",
    icon: SETTINGS_ICONS.status,
    body: () => renderOperatingModeStatus(),
  },
];

/** Seat -> display name, for views that render many seats at once. */
function seatLabelMap(): Record<string, string> {
  return Object.fromEntries(
    FANTA_TEAM_IDS.map((id) => [id, displayTeamLabel(id)]),
  );
}

// ── CHI ERA IN GARA — il flag al submit ───────────────────────────────────
// Uno stream SECONDARIO e best-effort accanto all'acquisto, mai dentro di lui:
// la meccanica, la coda e il motivo per cui qui il fail-closed sarebbe il
// difetto e non la garanzia stanno in testa a src/interestFlags.ts.

/** I posti marcabili: i sette avversari, mai il mio (la domanda è su di loro). */
function interestSeatIds(): readonly string[] {
  return FANTA_TEAM_IDS.filter((id) => id !== SELF_ID);
}

/** Il soggetto delle marcature: il giocatore selezionato, o `null`. */
function currentInterestSubjectKey(): string | null {
  const selected = state.call.selectedPlayer;
  return selected === null ? null : listonePlayerKey(selected);
}

/**
 * Le marcature valide ADESSO. Una marcatura il cui soggetto non è il giocatore
 * corrente non vale niente e non viene mostrata: è la garanzia strutturale
 * descritta su `AppState.interestMarks`.
 */
function currentInterestMarks(): readonly string[] {
  const subject = currentInterestSubjectKey();
  if (subject === null || state.interestMarks.subjectKey !== subject) return [];
  return state.interestMarks.contenders;
}

/**
 * Marca/smarca un posto e restituisce l'elenco aggiornato al chiamante, che
 * ridipinge SOLO la pastiglia toccata e la riga di sintesi. Nessun `render()`:
 * ricostruire l'albero intero costerebbe il fuoco del campo del prezzo, cioè
 * farebbe pagare al gesto principale il costo di un dato di contorno.
 */
function toggleInterestMark(seatId: string): readonly string[] {
  const subject = currentInterestSubjectKey();
  if (subject === null) return [];
  const previous = currentInterestMarks();
  const next = previous.includes(seatId)
    ? previous.filter((id) => id !== seatId)
    : [...previous, seatId];
  state.interestMarks = { subjectKey: subject, contenders: [...next] };
  return next;
}

/**
 * Accoda il flag dell'acquisto appena registrato. BEST-EFFORT ASSOLUTO: viene
 * chiamata DOPO che l'acquisto è già stato scritto e non ha alcun modo di
 * disfarlo — non lancia (il modulo restituisce esiti, e questo `try` copre
 * anche uno storage che lanci da dentro un punto non previsto), non tocca
 * `state.log`, non imposta `state.error` e non impedisce il `render()` finale.
 *
 * Nessuna marcatura è un esito NORMALE e silenzioso: si accoda comunque una
 * voce con `contenders: []`, perché «l'operatore non ha marcato nessuno» e
 * «non gli è stato chiesto» sono due fatti diversi e solo il primo è vero qui.
 */
function recordInterestFlag(
  purchaseSeq: number,
  proposed: ProposedPurchase,
  contenders: readonly string[],
): void {
  try {
    const result = enqueueInterestFlag(browserStorage, state.interestFlags, {
      purchaseSeq,
      playerId: proposed.playerId,
      winnerFantaTeamId: proposed.fantaTeamId,
      price: proposed.price,
      contenders: [...contenders],
      flaggedAt: new Date().toISOString(),
    });
    state.interestFlags = result.pending;
    state.interestFlagsNotice = result.ok
      ? ""
      : INTEREST_FLAG_NOT_PERSISTED_NOTICE;
  } catch {
    // Irraggiungibile per costruzione (enqueueInterestFlag non lancia), e
    // tenuto lo stesso: è l'ultima rete fra un dato di contorno e un acquisto
    // registrato. Il flag si perde, l'asta no.
    state.interestFlagsNotice = INTEREST_FLAG_NOT_PERSISTED_NOTICE;
  }
}

// ── IL POSTO DELLA RISPOSTA LENTA ─────────────────────────────────────────
// La meccanica (generazioni, annullamento, i tre stati più il silenzio onesto)
// sta in src/lateAnswer.ts; qui c'è solo il cablaggio.
//
// `onChange` ridipinge la schermata SOLO quando lo stato visibile cambia
// davvero: una risposta obsoleta viene scartata dal posto e non arriva
// nemmeno a chiedere un re-render.
const lateAnswerSlot = createLateAnswerSlot<string>({
  onChange: () => render(),
});

/**
 * L'UNICO punto d'innesto dichiarato. La corsia che alimenterà questo posto —
 * l'agente di lettura — registrerà qui il proprio produttore; finché resta
 * `null` non parte nessuna richiesta, e il riquadro lo DICE («Non richiesta»)
 * invece di far finta di stare preparando qualcosa.
 *
 * In questo task l'esito è deliberatamente `null`: nessuna dipendenza nuova,
 * nessuna rete, nessuna chiamata a modelli. Il produttore finto vive nei test.
 *
 * È una funzione e non una costante perché una costante inizializzata a `null`
 * verrebbe ristretta a `null` dal compilatore in ogni punto d'uso: il tipo del
 * posto d'innesto sparirebbe, e con lui la dichiarazione di che cosa ci andrà.
 */
function lateAnswerProducer(): LateAnswerProducer<string> | null {
  return null;
}

/**
 * La richiesta parte QUANDO IL GIOCATORE VIENE SELEZIONATO, non quando la
 * risposta servirebbe: è la differenza fra «si prepara mentre l'asta va
 * avanti» e «l'asta aspetta».
 *
 * Il cambio di soggetto passa sempre di qui — con un produttore (nuova
 * richiesta, generazione nuova, la precedente annullata) o senza (posto
 * svuotato) — quindi non esiste una strada che cambi giocatore lasciando in
 * piedi la risposta del giocatore di prima.
 */
function armLateAnswer(subjectKey: string | null): void {
  const producer = lateAnswerProducer();
  if (subjectKey === null || producer === null) {
    lateAnswerSlot.clear();
    return;
  }
  lateAnswerSlot.request(subjectKey, producer);
}

function persistRoster(next: LeagueRoster): void {
  state.leagueRoster = next;
  state.rosterError = saveLeagueRoster(browserStorage, FANTA_TEAM_IDS, next)
    ? ""
    : "Modifica non salvata: la memoria locale ha rifiutato la scrittura. Le altre funzioni non sono toccate.";
}

/** Il nodo che mostra a schermo l'identificativo di una persona, o `null`. */
function personIdNode(personId: string): Element | null {
  return document.querySelector(
    `.person-id-value[data-person-id="${CSS.escape(personId)}"]`,
  );
}

/**
 * Seleziona a schermo l'identificativo. Rende `false` quando non c'è niente da
 * selezionare — così «è selezionato, premi Ctrl+C» non viene mai detto su una
 * selezione che non esiste.
 */
function selectPersonIdOnScreen(personId: string): boolean {
  const node = personIdNode(personId);
  if (node === null) return false;
  const selection = window.getSelection();
  if (selection === null) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * Copia l'identificativo di un partecipante, e dice che cosa è successo
 * DAVVERO (src/personIdClipboard.ts: tre esiti, tre frasi).
 *
 * L'esistenza del nodo si controlla senza selezionarlo: `attemptCopy` promette
 * di non toccare la selezione dell'utente quando gli appunti rispondono, e
 * selezionare durante la costruzione delle porte violerebbe quella promessa
 * proprio nel caso normale.
 *
 * LA RISELEZIONE DOPO IL RENDER non è un dettaglio: `render()` ricostruisce
 * l'intero albero, quindi la selezione fatta dal ripiego morirebbe insieme al
 * nodo che la teneva — e la frase «è selezionato a schermo» diventerebbe falsa
 * nell'istante in cui viene scritta.
 */
async function copyPersonId(person: {
  readonly id: string;
  readonly name: string;
}): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const outcome = await attemptCopy(person.id, {
    writeText:
      typeof clipboard?.writeText === "function"
        ? (text) => clipboard.writeText(text)
        : null,
    selectAndCopy:
      personIdNode(person.id) === null
        ? null
        : () =>
            selectPersonIdOnScreen(person.id) && document.execCommand("copy"),
  });
  state.personIdCopy = { personName: person.name, outcome };
  render();
  if (outcome === "selection") selectPersonIdOnScreen(person.id);
}

const ROSTER_ERRORS: Record<string, string> = {
  "name-required": "Serve un nome.",
  "duplicate-name": "C'è già un partecipante con questo nome.",
  "unknown-person": "Partecipante non trovato: ricarica la pagina.",
};

// League participants and who sits where. Two distinct operations, because
// they mean different things: renaming a PERSON fixes a label and keeps their
// identity (and everything that will hang off it), while reassigning a SEAT
// means somebody else is playing that team. Only the second is blocked once
// the seat has bought — the log records fantaTeamId at write time and is
// append-only, so those purchases can never follow a new occupant.
// People are archived and never deleted: whoever leaves stays pickable, so a
// returning participant is the same person and not a fresh one.
// Lives in main.ts (not views.ts) because it reads and mutates app state.
function renderLeagueTeamsSettings(): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "league-teams-settings";
  panel.className = "league-teams-settings";
  panel.setAttribute("aria-label", "Partecipanti e squadre");

  const intro = document.createElement("p");
  intro.className = "hint-text";
  intro.textContent =
    "I partecipanti esistono a prescindere dalla squadra che occupano: chi è Squadra2 quest'anno può essere Squadra3 il prossimo, e resta la stessa persona. Chi lascia la lega non viene cancellato, resta selezionabile e al rientro è di nuovo se stesso.";
  panel.appendChild(intro);

  const aState = deriveAuctionState();

  const seats = document.createElement("div");
  seats.className = "league-teams-grid";
  for (const id of FANTA_TEAM_IDS) {
    const field = document.createElement("label");
    field.className = "league-team-field";

    const caption = document.createElement("span");
    caption.className = "field-label";
    caption.textContent = id === SELF_ID ? `${id} (io)` : id;
    field.appendChild(caption);

    // A seat that has bought is claimed: swapping its occupant now would
    // hand those purchases to somebody who never made them.
    const purchases = aState.teams[id]?.roster.length ?? 0;
    const locked = purchases > 0;
    if (locked) field.classList.add("league-team-field--locked");

    const select = document.createElement("select");
    select.id = `seat-person-${id}`;
    select.className = "field-input";
    const occupant = seatPerson(state.leagueRoster, id);

    const free = document.createElement("option");
    free.value = "";
    free.textContent = "— libero —";
    if (!occupant) free.selected = true;
    select.appendChild(free);

    // Everyone is listed, seated elsewhere included: picking them here moves
    // them, rather than forcing you to free the other seat first.
    for (const person of state.leagueRoster.people) {
      const opt = document.createElement("option");
      opt.value = person.id;
      const elsewhere = FANTA_TEAM_IDS.find(
        (other) =>
          other !== id && state.leagueRoster.seats[other] === person.id,
      );
      opt.textContent = elsewhere
        ? `${person.name} (ora ${elsewhere})`
        : person.name;
      if (occupant?.id === person.id) opt.selected = true;
      select.appendChild(opt);
    }

    if (locked) {
      select.disabled = true;
      select.setAttribute("aria-describedby", `seat-person-note-${id}`);
    } else {
      select.addEventListener("change", (e) => {
        const value = (e.target as HTMLSelectElement).value;
        const result = assignSeat(
          state.leagueRoster,
          id,
          value === "" ? null : value,
        );
        if (!result.ok) {
          state.rosterError =
            ROSTER_ERRORS[result.reason] ?? "Operazione rifiutata.";
          render();
          return;
        }
        persistRoster(result.roster);
        render();
      });
    }
    field.appendChild(select);

    if (locked) {
      const note = document.createElement("span");
      note.className = "league-team-note";
      note.id = `seat-person-note-${id}`;
      note.textContent = `Posto assegnato: ${purchases} acquist${purchases === 1 ? "o" : "i"} registrat${purchases === 1 ? "o" : "i"}. Si libera annullandoli.`;
      field.appendChild(note);
    }

    seats.appendChild(field);
  }
  panel.appendChild(seats);

  const peopleTitle = document.createElement("h3");
  peopleTitle.className = "league-people-title";
  peopleTitle.textContent = "ARCHIVIO PARTECIPANTI";
  panel.appendChild(peopleTitle);

  const people = document.createElement("div");
  people.className = "league-teams-grid";
  people.id = "league-people-list";
  for (const person of state.leagueRoster.people) {
    const field = document.createElement("label");
    field.className = "league-team-field";

    const seatOf = FANTA_TEAM_IDS.find(
      (id) => state.leagueRoster.seats[id] === person.id,
    );
    const caption = document.createElement("span");
    caption.className = "field-label";
    caption.textContent = seatOf ?? "senza squadra";
    field.appendChild(caption);

    // Renaming a person is always allowed, seat lock or not: it corrects a
    // label, it does not put a different human in the seat.
    const input = document.createElement("input");
    input.id = `person-name-${person.id}`;
    input.className = "field-input";
    input.maxLength = PERSON_NAME_MAX;
    input.value = person.name;
    input.addEventListener("input", (e) => {
      const result = renamePerson(
        state.leagueRoster,
        person.id,
        (e.target as HTMLInputElement).value,
      );
      if (!result.ok) {
        // Keep what was typed visible; only refuse to persist it.
        state.rosterError = ROSTER_ERRORS[result.reason] ?? "Nome rifiutato.";
        return;
      }
      state.rosterError = "";
      persistRoster(result.roster);
    });
    field.appendChild(input);

    // L'IDENTIFICATIVO DELLA PERSONA, LEGGIBILE E COPIABILE, ACCANTO AL NOME.
    //
    // Sta qui e non in una schermata propria perché è qui che serve: lo
    // storico d'asta (Impostazioni → Archivio avversari) è chiavato su
    // `personId`, e quando Pico compila quel file sta guardando questo elenco.
    // Un elenco di identificativi senza i nomi accanto non servirebbe a
    // niente: l'utilità è tutta nell'accostamento.
    //
    // Il pulsante sta dentro la `<label>` della persona: attivarlo NON sposta
    // il fuoco sul campo del nome, perché la label salta il proprio
    // comportamento di attivazione quando il bersaglio dell'evento è a sua
    // volta un elemento interattivo.
    const idRow = document.createElement("div");
    idRow.className = "person-id-row";

    const idValue = document.createElement("code");
    idValue.className = "person-id-value";
    idValue.dataset.personId = person.id;
    idValue.textContent = person.id;
    // Nome accessibile esplicito: letto da solo, `person:8f3…` non dice a
    // quale delle due cose accanto si riferisce.
    idValue.setAttribute("aria-label", `Identificativo di ${person.name}`);
    idRow.appendChild(idValue);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn--secondary person-id-copy";
    copyBtn.dataset.personId = person.id;
    copyBtn.textContent = "Copia";
    copyBtn.title = `Copia l'identificativo di ${person.name}`;
    copyBtn.setAttribute("aria-label", copyBtn.title);
    copyBtn.addEventListener("click", () => {
      void copyPersonId(person);
    });
    idRow.appendChild(copyBtn);

    field.appendChild(idRow);
    people.appendChild(field);
  }
  panel.appendChild(people);

  // L'esito dell'ULTIMO gesto di copia. Un gesto senza risposta si ripete, e
  // ripetuto su un pulsante che NON ha copiato produce un file scritto con una
  // stringa vuota incollata dentro.
  if (state.personIdCopy !== null) {
    const status = document.createElement("p");
    status.id = "person-id-copy-status";
    status.setAttribute("role", "status");
    status.className = copySucceeded(state.personIdCopy.outcome)
      ? "person-id-copy-status"
      : "person-id-copy-status person-id-copy-status--warn";
    status.textContent = copyMessage(
      state.personIdCopy.personName,
      state.personIdCopy.outcome,
    );
    panel.appendChild(status);
  }

  const idHint = document.createElement("p");
  idHint.className = "hint-text";
  idHint.id = "person-id-hint";
  idHint.textContent =
    "L'identificativo sotto ogni nome è la chiave con cui lo storico d'asta riconosce la persona (Impostazioni → Archivio avversari). Si genera una volta e non cambia mai: rinominare qualcuno corregge l'etichetta, non l'identità.";
  panel.appendChild(idHint);

  if (state.leagueRoster.people.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint-text";
    empty.id = "league-people-empty";
    empty.textContent = "Nessun partecipante ancora inserito.";
    panel.appendChild(empty);
  }

  const addRow = document.createElement("div");
  addRow.className = "league-people-add";
  const addInput = document.createElement("input");
  addInput.id = "new-person-name";
  addInput.className = "field-input";
  addInput.maxLength = PERSON_NAME_MAX;
  addInput.placeholder = "Nome del partecipante";
  addInput.value = state.newPersonName;
  addInput.addEventListener("input", (e) => {
    state.newPersonName = (e.target as HTMLInputElement).value;
  });
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.id = "add-person";
  addButton.className = "btn btn--secondary";
  addButton.textContent = "Aggiungi partecipante";
  const submitNewPerson = (): void => {
    const result = addPerson(state.leagueRoster, state.newPersonName);
    if (!result.ok) {
      state.rosterError =
        ROSTER_ERRORS[result.reason] ?? "Partecipante non aggiunto.";
      render();
      return;
    }
    state.rosterError = "";
    state.newPersonName = "";
    persistRoster(result.roster);
    render();
    focusAfterRender("new-person-name");
  };
  addButton.addEventListener("click", submitNewPerson);
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitNewPerson();
    }
  });
  addRow.append(addInput, addButton);
  panel.appendChild(addRow);

  if (state.rosterError) {
    const error = document.createElement("p");
    error.id = "league-teams-error";
    error.className = "league-teams-error";
    error.setAttribute("role", "alert");
    error.textContent = state.rosterError;
    panel.appendChild(error);
  }

  return panel;
}

// ── Riconferme pre-asta (LEAGUE_RULES.md §4, tranche 2b, #231) ─────────────
// Editable ONLY while state.log.length === 0: once the live auction has
// started, a riconferma is an accounting fact fixed at t=0 (reduce() seeds
// it BEFORE the log replays — packages/engine/src/reduce.ts), and changing
// it mid-asta would be an out-of-band mutation the append-only log exists
// to prevent. If Owner ever wants a mid-asta correction, that is a new
// business rule (fascia C) — not anticipated here, only declared.
//
// Picker is DAL LISTONE only (playerId = listonePlayerKey): with an empty
// pool there is nothing to pick from, and this panel does not offer a
// manual-id fallback — a deliberate limit, not an oversight (a hand-typed
// id could not be cross-checked against the player's real role or against
// a duplicate purchase later).
//
// The "due stagioni di fila" constraint (LEAGUE_RULES.md §4) needs last
// SEASON's confirmations, which this app has no source for — the archived
// design's proposal (c): NOT enforced, declared with a fixed, non-blocking
// notice below rather than silently ignored. From this season on, the
// persisted batch makes the constraint checkable starting next season
// (`previouslyConfirmedPlayerIds` as a future engine extension) — not built
// here.
const RICONFERME_ROLES: readonly Role[] = (
  Object.keys(CONFIRMATION_LIMITS) as Role[]
).filter((role) => CONFIRMATION_LIMITS[role] > 0);

function renderRiconfermeSettings(): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "riconferme-settings";
  panel.className = "riconferme-settings";
  panel.setAttribute("aria-label", "Riconferme pre-asta");

  const intro = document.createElement("p");
  intro.className = "hint-text";
  intro.textContent =
    "Riconferme pre-asta (regolamento di lega, §4): fino a un difensore, un centrocampista e un attaccante per squadra, al prezzo pagato la scorsa stagione. Non sono acquisti: vengono sottratte al budget iniziale e a uno slot per ruolo PRIMA che l'asta cominci.";
  panel.appendChild(intro);

  const twoSeasonsNote = document.createElement("p");
  twoSeasonsNote.id = "riconferme-two-seasons-note";
  twoSeasonsNote.className = "hint-text riconferme-two-seasons-note";
  twoSeasonsNote.textContent =
    'Vincolo "due stagioni di fila" (regolamento di lega, §4) NON applicato automaticamente: l\'app non dispone dello storico della stagione precedente. Verifica manualmente prima di confermare.';
  panel.appendChild(twoSeasonsNote);

  const editable = state.log.length === 0;
  if (editable) {
    // Fix 8 (PX polish, round 2, #285): a fixed, always-visible warning that
    // this editability is temporary — same idiom as twoSeasonsNote above,
    // not a dismissible banner, so it cannot be missed-then-forgotten.
    const lockNote = document.createElement("p");
    lockNote.id = "riconferme-lock-note";
    lockNote.className = "hint-text riconferme-two-seasons-note";
    lockNote.textContent =
      "Al primo acquisto live lo storico asta smette di essere vuoto: da quel momento questo pannello diventa di sola lettura e le riconferme non sono più modificabili.";
    panel.appendChild(lockNote);
  }
  if (!editable) {
    const readonlyNote = document.createElement("p");
    readonlyNote.id = "riconferme-readonly-note";
    readonlyNote.setAttribute("role", "note");
    readonlyNote.className = "hint-text";
    readonlyNote.textContent =
      "Sola lettura: lo storico asta non è vuoto. Le riconferme fissano il budget e la rosa iniziali di ogni squadra a t=0 e non si modificano a partita iniziata.";
    panel.appendChild(readonlyNote);
  }

  const poolAvailable = state.pool.length > 0;
  if (editable && !poolAvailable) {
    const emptyListoneNote = document.createElement("p");
    emptyListoneNote.id = "riconferme-empty-listone-note";
    emptyListoneNote.className = "hint-text";
    emptyListoneNote.textContent =
      "Carica il listone (Asta → Ricerca giocatore) per selezionare i giocatori da riconfermare: qui non è previsto un inserimento manuale dell'identificativo.";
    panel.appendChild(emptyListoneNote);
  }

  // purchasedPlayerIds already includes every riconferma (reduce() seeds
  // them, see deriveAuctionState()'s own comment) — with the log empty in
  // the only state this panel is editable, it is EXACTLY the set of
  // already-confirmed players, so it doubles as "not selectable again"
  // without a second source of truth.
  const aState = deriveAuctionState();
  const usedPlayerIds = new Set(aState.purchasedPlayerIds);
  const pool = auctionDisplayPool();
  // resolvePlayerDisplayName takes the O(1) index (audit r2 D2 refactor,
  // post-#285): #285 built the riconferme panel against the pre-refactor
  // array signature, so this call site needs the index form alongside the
  // array `pool` above, which the eligible-players filter below still uses.
  const poolIndex = auctionDisplayIndex();

  const grid = document.createElement("div");
  grid.className = "riconferme-grid";
  grid.id = "riconferme-grid";

  for (const seatId of FANTA_TEAM_IDS) {
    const seatRow = document.createElement("div");
    seatRow.className = "riconferme-seat";
    seatRow.id = `riconferme-seat-${seatId}`;

    const seatLabelEl = document.createElement("div");
    seatLabelEl.className = "riconferme-seat__label";
    seatLabelEl.textContent = displayTeamLabel(seatId);
    seatRow.appendChild(seatLabelEl);

    const slots = document.createElement("div");
    slots.className = "riconferme-seat__slots";

    for (const role of RICONFERME_ROLES) {
      const slot = document.createElement("div");
      slot.className = "riconferme-slot";
      slot.id = `riconferme-slot-${seatId}-${role}`;
      slot.appendChild(renderRoleChip(role));

      const existing = state.confirmations.find(
        (c) => c.fantaTeamId === seatId && c.role === role,
      );
      if (existing) {
        const display = resolvePlayerDisplayName(existing.playerId, poolIndex);
        const name = document.createElement("span");
        name.className = "riconferme-slot__name";
        name.textContent = display;
        name.title = display;
        slot.appendChild(name);

        const price = document.createElement("span");
        price.className = "riconferme-slot__price";
        price.textContent = `${existing.price} cr`;
        slot.appendChild(price);

        if (editable) {
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.id = `riconferme-remove-${seatId}-${role}`;
          removeBtn.className = "btn btn--icon";
          removeBtn.textContent = "✕";
          // Fix 5 (a11y, round 2, #285): `title` alone is a weak accessible
          // name (tooltip-only for most AT, absent on touch) — aria-label is
          // the real accessible name here, kept byte-identical to the
          // tooltip so the two never say different things.
          removeBtn.title = `Rimuovi la riconferma di ${display}`;
          removeBtn.setAttribute("aria-label", removeBtn.title);
          removeBtn.addEventListener("click", () =>
            removeRiconferma(seatId, role),
          );
          slot.appendChild(removeBtn);
        }
      } else if (editable && poolAvailable) {
        // Role-filtered: "ruolo derivato non editabile" — the operator
        // never picks a role separately, only a player already of the role
        // this slot/column represents. Already-used players (confirmed
        // elsewhere in this batch) are excluded, never shown as pickable.
        const eligible = pool.filter(
          (p) => p.role === role && !usedPlayerIds.has(listonePlayerKey(p)),
        );

        // Fix 6 (PX, round 2, #285): the last REFUSED attempt for exactly
        // this slot, if any — see AppState.riconfermeDraft's own doc
        // comment. render() rebuilds this <select>/<input> from scratch on
        // every call, so without this the operator's picks silently vanish
        // right when the error message tells them to fix something.
        const draft =
          state.riconfermeDraft &&
          state.riconfermeDraft.seatId === seatId &&
          state.riconfermeDraft.role === role
            ? state.riconfermeDraft
            : null;

        const seatLabelText = displayTeamLabel(seatId);
        const roleLabelText = ROLE_LABEL_SING[role];

        const select = document.createElement("select");
        select.id = `riconferme-picker-${seatId}-${role}`;
        select.className = "field-input riconferme-slot__picker";
        select.setAttribute(
          "aria-label",
          `Riconferma ${roleLabelText} per ${seatLabelText}`,
        );
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent =
          eligible.length === 0
            ? "— nessun giocatore disponibile —"
            : "— seleziona —";
        select.appendChild(emptyOpt);
        for (const p of eligible) {
          const opt = document.createElement("option");
          opt.value = listonePlayerKey(p);
          opt.textContent = p.club ? `${p.name} (${p.club})` : p.name;
          select.appendChild(opt);
        }
        select.disabled = eligible.length === 0;
        if (
          draft &&
          eligible.some((p) => listonePlayerKey(p) === draft.playerId)
        ) {
          select.value = draft.playerId;
        }
        slot.appendChild(select);

        const priceInput = document.createElement("input");
        priceInput.id = `riconferme-price-${seatId}-${role}`;
        priceInput.type = "number";
        priceInput.min = "1";
        priceInput.step = "1";
        priceInput.setAttribute("inputmode", "numeric");
        priceInput.placeholder = "prezzo";
        priceInput.title =
          "Prezzo pagato per questo giocatore la scorsa stagione (crediti interi).";
        priceInput.setAttribute(
          "aria-label",
          `Prezzo riconferma ${roleLabelText} per ${seatLabelText}`,
        );
        priceInput.className = "field-input riconferme-slot__price-input";
        priceInput.disabled = eligible.length === 0;
        if (draft) priceInput.value = draft.priceRaw;
        slot.appendChild(priceInput);

        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.id = `riconferme-confirm-${seatId}-${role}`;
        confirmBtn.className = "btn btn--secondary";
        confirmBtn.textContent = "Conferma";
        confirmBtn.setAttribute(
          "aria-label",
          `Conferma riconferma ${roleLabelText} per ${seatLabelText}`,
        );
        confirmBtn.disabled = eligible.length === 0;
        confirmBtn.addEventListener("click", () =>
          confirmRiconferma(seatId, role),
        );
        slot.appendChild(confirmBtn);
      } else {
        const empty = document.createElement("span");
        empty.className = "riconferme-slot__empty";
        empty.textContent = "—";
        slot.appendChild(empty);
      }

      slots.appendChild(slot);
    }

    seatRow.appendChild(slots);
    grid.appendChild(seatRow);
  }
  panel.appendChild(grid);

  if (state.riconfermeError) {
    const error = document.createElement("p");
    error.id = "riconferme-error";
    error.className = "riconferme-error";
    error.setAttribute("role", "alert");
    error.textContent = state.riconfermeError;
    panel.appendChild(error);
  }

  return panel;
}

/**
 * Fix 6 (PX, round 2, #285): renders a riconferme-panel failure and then
 * scrolls `#riconferme-error` into view — the panel can be tall enough
 * (up to 8 seats × 3 slots) that an error appended at the very bottom lands
 * off-screen from wherever the operator was editing, and role="alert" alone
 * only guarantees it is ANNOUNCED, not that it is visible. `render()` is
 * synchronous (direct DOM rebuild, no framework tick), so the element is
 * already in the document by the time this call returns.
 */
function renderRiconfermeFailure(): void {
  render();
  document
    .getElementById("riconferme-error")
    ?.scrollIntoView({ block: "nearest" });
}

/**
 * Reads the pending pick straight from the DOM at click time (same
 * uncontrolled-input style as the rest of this file's forms — e.g.
 * renderMomentoAsta's priceInput) rather than tracking it in AppState:
 * nothing here re-renders while the operator is choosing, so the browser's
 * own input value already IS the source of truth until this click.
 */
function confirmRiconferma(seatId: string, role: Role): void {
  const select = document.getElementById(
    `riconferme-picker-${seatId}-${role}`,
  ) as HTMLSelectElement | null;
  const priceInput = document.getElementById(
    `riconferme-price-${seatId}-${role}`,
  ) as HTMLInputElement | null;
  if (!select || !priceInput) return;

  const playerId = select.value;
  const priceRaw = priceInput.value;
  const draft: RiconfermeDraft = { seatId, role, playerId, priceRaw };
  if (!playerId) {
    state.riconfermeError =
      "Seleziona un giocatore dal listone prima di confermare.";
    state.riconfermeDraft = draft;
    renderRiconfermeFailure();
    return;
  }
  const price = parsePositiveIntegerPrice(priceRaw);
  if (price === null) {
    state.riconfermeError =
      "Prezzo non valido: inserisci un numero intero positivo (l'importo pagato la scorsa stagione).";
    state.riconfermeDraft = draft;
    renderRiconfermeFailure();
    return;
  }

  // "ogni azione ricompone il batch" — replace this seat+role's entry (if
  // any) and re-submit the WHOLE batch, never a partial/incremental update.
  const next = [
    ...state.confirmations.filter(
      (c) => !(c.fantaTeamId === seatId && c.role === role),
    ),
    { fantaTeamId: seatId, playerId, role, price },
  ];
  applyRiconfermeBatch(next, draft);
}

function removeRiconferma(seatId: string, role: Role): void {
  const next = state.confirmations.filter(
    (c) => !(c.fantaTeamId === seatId && c.role === role),
  );
  applyRiconfermeBatch(next);
}

/**
 * validate-prima-di-scrivere -> saveConfirmations, humanized errors in the
 * panel (confirmationErrorText for the engine's 7 violation codes).
 * `draftOnFailure` (fix 6, round 2, #285) is the form values to restore into
 * state on a REFUSED attempt — omitted by removeRiconferma, which has no
 * picker/price of its own to preserve.
 */
function applyRiconfermeBatch(
  next: readonly ConfirmationInput[],
  draftOnFailure?: RiconfermeDraft,
): void {
  const result = saveConfirmations(browserStorage, next, FANTA_TEAM_IDS);
  if (!result.ok) {
    state.riconfermeDraft = draftOnFailure ?? null;
    state.riconfermeError =
      result.reason === "invalid-semantic"
        ? confirmationErrorText(result.issues.map((issue) => issue.violation))
        : result.reason === "invalid-schema"
          ? "Dati non validi: riprova la selezione."
          : `Impossibile salvare (${result.message}).`;
    renderRiconfermeFailure();
    return;
  }
  state.confirmations = [...next];
  state.riconfermeError = "";
  state.riconfermeDraft = null;
  render();
}

// ── SCHEDE GRUPPO ESPERTI — la schermata che le compila ─────────────────────
//
// PERCHÉ ESISTE. Il deposito delle schede (src/expertScheda.ts) è un file JSON
// che Pico scrive PRIMA dell'asta: ~200 schede, misurate fra i 20 secondi di
// una magra e i 90 di una piena, circa due ore. Finora l'unico modo era battere
// il JSON a mano contro uno schema `.strict()` e un lettore fail-closed: un
// refuso di virgola non rovina una riga, rifiuta il file intero. Questa
// schermata esiste perché quelle due ore non dipendano da una virgola.
//
// LE QUATTRO REGOLE DEL PANNELLO, e ognuna toglie di mezzo un modo di sbagliare:
//
//  1. L'IDENTITÀ SI SCEGLIE, NON SI SCRIVE. Il giocatore si prende da una riga
//     del listone caricato, mai da un campo di testo: `player` e `club` vengono
//     da lì, quindi la scheda si aggancia a quella riga per costruzione
//     (`findSchedaCandidates`). L'errore peggiore possibile per queste schede è
//     il silenzioso — scheda scritta, depositata e mai resa perché il nome non
//     combacia — e questo lo rende impossibile invece che improbabile.
//  2. OGNI CAMPO DEL VOCABOLARIO È UN CONTROLLO. Titolarità, rigori, fonte e
//     lista editoriale sono `<select>` costruiti sui vocabolari del contratto;
//     calci piazzati e avvisi sono checkbox; i numerici — le due quote, la
//     gerarchia, i cinque voti della pagella e il totale dichiarato — portano i
//     limiti dello schema, letti da `src/expertScheda.ts` e
//     `src/pagellaEsperti.ts` e non riscritti qui. Anche i NOMI degli altri in
//     ballottaggio si scelgono da una riga di listone: fuori dalla nota non
//     esiste un punto in cui si possa digitare un valore che il contratto non
//     conosce.
//  2-bis. E OGNI CAMPO DEL CONTRATTO HA IL SUO CONTROLLO. Per tre volte il
//     contratto era cresciuto e questo pannello era rimasto indietro: il campo
//     che risponde a «quanti si contendono quel posto», la quarta icona e i
//     cinque voti del radar erano irraggiungibili per l'unica persona che può
//     scriverli. Adesso la corrispondenza è sorvegliata da una guardia
//     strutturale (src/schedaCompiler.ts §«la via d'ingresso di ogni campo»),
//     che diventa rossa il giorno in cui il contratto cresce e il modulo no.
//  3. LA NOTA NON VIENE MAI TAGLIATA DA SOLA. Contatore visibile e limite
//     dichiarato; oltre il limite il salvataggio si RIFIUTA e dice di quanto si
//     è lunghi. Un `maxlength` che tronca un incollaggio perderebbe la coda
//     della frase senza dirlo, che è esattamente ciò che non deve succedere.
//  4. IL DEPOSITO SI VALIDA PRIMA DI OFFRIRLO, con `parseExpertSchedaDeposit` —
//     la funzione vera, quella che leggerà il file a runtime. Se non passa, il
//     pannello dice perché invece di consegnare un file rotto.
//
// NIENTE DI DIRETTIVO, QUI DENTRO NON C'È E NON PUÒ ENTRARE. Nessun prezzo,
// nessun `value` / `fair_to_me` / `target_band`, nessun punteggio, nessuna
// classifica, nessun «conviene»: i campi compilabili sono esattamente quelli
// del contratto, che è descrittivo per costruzione (docs/NO_GO.md §Prodotto).
//
// Vive in main.ts e non in views.ts per la stessa ragione dei due pannelli
// sopra: legge e muta lo stato dell'app.

/** La riga di listone dietro una chiave di riga, o `null` se non c'è (più). */
function schedaRowTarget(rowKey: string | null): SchedaTarget | null {
  if (rowKey === null) return null;
  const row = auctionDisplayIndex().get(rowKey);
  return row === undefined
    ? null
    : { name: row.name, club: row.club, role: row.role };
}

/**
 * Scrive l'archivio e RICORDA se la scrittura ha attecchito.
 *
 * Il lavoro resta a schermo anche quando lo storage lo rifiuta — buttarlo via
 * sarebbe la perdita che questa schermata esiste per evitare — ma il pannello
 * lo dichiara con `#schede-persist-error`: una scheda che sembra salvata e non
 * lo è vale meno di zero.
 */
function persistSchedaDrafts(next: SchedaDraftState): void {
  state.schedaDrafts = next;
  state.schedaDraftsPersisted = saveSchedaDrafts(browserStorage, next);
}

/** Il modulo attualmente aperto, nella forma che l'archivio persiste. */
function schedaEditingSnapshot(): SchedaDraftState {
  return withEditing(
    state.schedaDrafts,
    state.schedaTargetKey === null
      ? null
      : { rowKey: state.schedaTargetKey, values: state.schedaForm },
  );
}

/**
 * Apre (o chiude) la compilazione su una riga di listone. Una riga già scritta
 * si riapre com'era: correggere una scheda sbagliata non deve costare quanto
 * riscriverla.
 */
function selectSchedaTarget(rowKey: string | null): void {
  const existing =
    rowKey === null ? undefined : state.schedaDrafts.schede.get(rowKey);
  state.schedaTargetKey = rowKey;
  state.schedaForm =
    existing === undefined ? EMPTY_SCHEDA_FORM : schedaToForm(existing);
  state.schedaErrors = [];
  state.schedaNotice = "";
  state.schedaConfirmDelete = null;
  persistSchedaDrafts(schedaEditingSnapshot());
  render();
}

/** Un campo cambiato. Non ridisegna: il DOM del modulo è già quello giusto. */
function updateSchedaForm(patch: Partial<SchedaFormValues>): void {
  state.schedaForm = { ...state.schedaForm, ...patch };
}

/**
 * Il modulo aperto, messo al sicuro.
 *
 * Legato a `change` (cioè al momento in cui un campo è stato lasciato) e non a
 * `input`: una scrittura per tasto premuto rifarebbe `JSON.stringify` + la
 * validazione di contratto su tutte le schede a ogni carattere. Il peggio che
 * si perde così è il campo che si sta battendo in questo istante, e solo se la
 * scheda del browser muore prima di lasciarlo.
 */
function persistSchedaEditing(): void {
  const before = state.schedaDraftsPersisted;
  persistSchedaDrafts(schedaEditingSnapshot());
  // RIDISEGNA SOLO QUANDO L'ESITO DELLA SCRITTURA CAMBIA, e non a ogni campo
  // lasciato. Non è un'ottimizzazione: `change` scatta al BLUR, cioè
  // nell'istante esatto in cui si preme «Salva la scheda», e un `render()` lì
  // dentro distrugge il pulsante fra il mousedown e il click — il clic non
  // arriva mai al gestore. Misurato sul campo: dopo aver scritto in un campo,
  // il primo clic su «Salva» non faceva niente. L'unica cosa che questo
  // ridisegno deve mostrare è la comparsa (o la sparizione) della riga «ULTIMA
  // MODIFICA NON SALVATA», e quella cambia una volta sola.
  if (before !== state.schedaDraftsPersisted) render();
}

/** Salva la scheda compilata, o mostra TUTTI i motivi per cui non si può. */
function saveSchedaFromForm(): void {
  const target = schedaRowTarget(state.schedaTargetKey);
  const rowKey = state.schedaTargetKey;
  if (target === null || rowKey === null) {
    state.schedaErrors = [
      {
        field: "identita",
        message:
          "Scegli prima una riga del listone: nome e squadra della scheda vengono da lì.",
      },
    ];
    state.schedaNotice = "";
    render();
    return;
  }
  const result = buildScheda(target, state.schedaForm);
  if (!result.ok) {
    state.schedaErrors = result.errors;
    state.schedaNotice = "";
    render();
    focusAfterRender("schede-errors");
    return;
  }
  state.schedaErrors = [];
  state.schedaTargetKey = null;
  state.schedaForm = EMPTY_SCHEDA_FORM;
  state.schedaConfirmDelete = null;
  persistSchedaDrafts(
    withEditing(withScheda(state.schedaDrafts, rowKey, result.scheda), null),
  );
  state.schedaNotice = `Scheda salvata: ${result.scheda.player} (${result.scheda.club}).`;
  render();
  // Il giro è: scegli, compila, salva, scegli il prossimo. La messa a fuoco
  // torna dove ricomincia, non dove è finita.
  focusAfterRender("schede-player");
}

/** Riapre una scheda già scritta per correggerla. */
function editScheda(rowKey: string): void {
  selectSchedaTarget(rowKey);
  focusAfterRender("schede-titolarita");
}

/**
 * Cancella una scheda, in due tempi.
 *
 * Il primo clic chiede conferma, il secondo cancella. Una scheda piena sono 90
 * secondi di battitura e non c'è nessun annulla: un clic sbagliato su una fila
 * di pulsanti identici è il modo normale in cui quel lavoro sparirebbe.
 */
function requestSchedaDelete(rowKey: string): void {
  state.schedaConfirmDelete = rowKey;
  state.schedaNotice = "";
  render();
  focusAfterRender(`schede-delete-${rowKey}`);
}

function cancelSchedaDelete(): void {
  state.schedaConfirmDelete = null;
  render();
}

function deleteScheda(rowKey: string): void {
  const removed = state.schedaDrafts.schede.get(rowKey);
  const closing = state.schedaTargetKey === rowKey;
  if (closing) {
    state.schedaTargetKey = null;
    state.schedaForm = EMPTY_SCHEDA_FORM;
    state.schedaErrors = [];
  }
  state.schedaConfirmDelete = null;
  persistSchedaDrafts(
    withEditing(
      withScheda(state.schedaDrafts, rowKey, null),
      closing ? null : state.schedaDrafts.editing,
    ),
  );
  state.schedaNotice =
    removed === undefined
      ? "Scheda già rimossa."
      : `Scheda cancellata: ${removed.player} (${removed.club}).`;
  render();
  focusAfterRender("schede-player");
}

function downloadSchedaDeposit(text: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = SCHEDA_DEPOSIT_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copia il deposito negli appunti. Gli appunti sono una capacità del browser
 * che può mancare (contesto non sicuro) o essere negata: entrambi i casi
 * diventano una frase che rimanda al pulsante che scarica il file, mai un
 * silenzio che si legge come «fatto».
 */
function copySchedaDeposit(text: string, count: number): void {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard === undefined || typeof clipboard.writeText !== "function") {
    state.schedaNotice =
      "Questo browser non dà accesso agli appunti: usa «Scarica il deposito».";
    render();
    return;
  }
  void clipboard.writeText(text).then(
    () => {
      state.schedaNotice = `Deposito copiato negli appunti: ${count} sched${count === 1 ? "a" : "e"}.`;
      render();
    },
    () => {
      state.schedaNotice =
        "Il browser ha rifiutato la copia negli appunti: usa «Scarica il deposito».";
      render();
    },
  );
}

// ── RIPRENDERE UN DEPOSITO GIÀ SCRITTO ───────────────────────────────────────
//
// Il giro si chiude qui. Le due ore sono distribuite su più sere e il deposito
// finisce su Drive: senza rilettura il lavoro viveva solo in `localStorage` —
// un browser pulito, un'altra macchina, una cronologia svuotata, e sparivano
// senza un errore — e una scheda da correggere tre giorni dopo si poteva solo
// riscrivere.
//
// LA FUSIONE NON SI DECIDE DA SOLA. Le schede del file su righe che in locale
// sono vuote entrano sempre: aggiungono e non distruggono, quindi non c'è
// niente da chiedere. Le schede in CONFLITTO — stessa riga, due versioni — non
// si sovrascrivono e non si scartano: la tendina non ha nessuna opzione
// preselezionata, esattamente come la domanda dell'aggancio in
// src/ui/expertInsight.ts, e senza una risposta `applySchedaImport` rende
// `null` invece di sceglierne una.

const SCHEDA_IMPORT_REFUSALS: Readonly<
  Record<"absent" | "unreadable" | "invalid" | "empty", string>
> = {
  absent: "Nessun file letto: riprova a sceglierlo.",
  unreadable:
    "Il file non è JSON leggibile. Non è stato toccato niente di quello che hai già scritto.",
  invalid:
    "Il file non è un deposito valido secondo il contratto (parseExpertSchedaDeposit): versione diversa, un campo fuori vocabolario o una chiave che non esiste. Non è stato toccato niente di quello che hai già scritto.",
  empty: "Il file è un deposito valido ma non contiene nessuna scheda.",
};

/** Le righe del listone come le vede il pianificatore d'importazione. */
function schedaImportRows(): { rowKey: string; name: string; club: string }[] {
  return state.pool.map((p) => ({
    rowKey: listonePlayerKey(p),
    name: p.name,
    club: p.club,
  }));
}

/**
 * Legge il file scelto e prepara la domanda. Non importa niente: mostra che
 * cosa succederebbe, e aspetta.
 *
 * Il campo viene svuotato subito dopo la lettura, così riscegliere LO STESSO
 * file torna a produrre un evento — senza, un secondo tentativo dopo un
 * rifiuto non farebbe nulla e sembrerebbe un pannello morto.
 */
function readSchedaImportFile(input: HTMLInputElement): void {
  const file = input.files?.[0] ?? null;
  // NON si azzera qui `input.value`: ogni strada che segue finisce in un
  // `render()`, che ricostruisce il campo vuoto da sé — e azzerarlo mentre la
  // lettura del file è ancora in volo è un modo di far sparire il file da sotto
  // la promessa.
  if (file === null) {
    state.schedaImport = null;
    state.schedaImportError = "Nessun file letto: riprova a sceglierlo.";
    render();
    return;
  }
  const failed = (why: string): void => {
    state.schedaImport = null;
    state.schedaImportError = why;
    render();
  };
  file
    .text()
    .then((text) => openSchedaImport(text, file.name))
    // Una sola rete di sicurezza per TUTTO ciò che sta sopra, lettura e
    // pianificazione comprese: un errore inatteso qui dentro, senza questa,
    // resterebbe una promessa rifiutata e nessuno vedrebbe niente — il
    // pannello sembrerebbe semplicemente non rispondere al file scelto.
    .catch((err: unknown) =>
      failed(
        `Il file non è stato letto dal browser (${err instanceof Error ? err.message : String(err)}). Non è stato toccato niente.`,
      ),
    );
}

function openSchedaImport(text: string, fileName: string): void {
  const result = planSchedaImport(
    text,
    schedaImportRows(),
    state.schedaDrafts.schede,
  );
  if (!result.ok) {
    state.schedaImport = null;
    state.schedaImportError =
      result.reason === "duplicate"
        ? `Il file contiene due schede sulla stessa identità (${result.identities.join("; ")}): il riquadro non ne mostrerebbe nessuna delle due. Non è stato importato niente.`
        : SCHEDA_IMPORT_REFUSALS[result.reason];
    render();
    return;
  }
  state.schedaImport = { fileName, plan: result.plan, resolution: null };
  state.schedaImportError = "";
  state.schedaNotice = "";
  render();
  focusAfterRender(
    result.plan.conflicts.length > 0
      ? "schede-import-resolution"
      : "schede-import-confirm",
  );
}

function cancelSchedaImport(): void {
  state.schedaImport = null;
  state.schedaImportError = "";
  render();
}

function confirmSchedaImport(): void {
  const pending = state.schedaImport;
  if (pending === null) return;
  const next = applySchedaImport(
    state.schedaDrafts.schede,
    pending.plan,
    pending.resolution,
  );
  if (next === null) {
    state.schedaImportError =
      "Scegli prima che cosa fare delle schede in conflitto: non ne sovrascrivo nessuna da solo.";
    render();
    return;
  }
  const { fresh, conflicts, unmatched } = pending.plan;
  const parts = [`${fresh.length} nuov${fresh.length === 1 ? "a" : "e"}`];
  if (conflicts.length > 0) {
    parts.push(
      pending.resolution === "take-file"
        ? `${conflicts.length} sostituit${conflicts.length === 1 ? "a" : "e"} con quell${conflicts.length === 1 ? "a" : "e"} del file`
        : `${conflicts.length} conflitt${conflicts.length === 1 ? "o risolto" : "i risolti"} tenendo le tue`,
    );
  }
  if (unmatched.length > 0) {
    parts.push(`${unmatched.length} senza riga nel listone caricato`);
  }
  // Il modulo eventualmente aperto si chiude: le sue caselle sono state
  // riempite PRIMA dell'importazione, e salvarle dopo rimetterebbe in silenzio
  // la versione vecchia sopra quella appena importata.
  state.schedaTargetKey = null;
  state.schedaForm = EMPTY_SCHEDA_FORM;
  state.schedaErrors = [];
  state.schedaConfirmDelete = null;
  state.schedaImport = null;
  state.schedaImportError = "";
  persistSchedaDrafts({ schede: next, editing: null });
  state.schedaNotice = `Deposito ripreso da «${pending.fileName}»: ${parts.join(", ")}.`;
  render();
  focusAfterRender("schede-player");
}

/** Che cosa succederebbe a confermare, scritto prima di chiedere. */
function renderSchedaImportPreview(pending: PendingSchedaImport): HTMLElement {
  const box = document.createElement("div");
  box.id = "schede-import-preview";
  box.className = "schede-progress";

  const headline = document.createElement("p");
  headline.id = "schede-import-headline";
  headline.className = "schede-progress__count";
  const total = pending.plan.incoming.size;
  headline.textContent = `«${pending.fileName}»: ${total} sched${total === 1 ? "a" : "e"} nel file — ${pending.plan.fresh.length} nuov${pending.plan.fresh.length === 1 ? "a" : "e"}, ${pending.plan.conflicts.length} in conflitto con quelle che hai già.`;
  box.appendChild(headline);

  if (pending.plan.unmatched.length > 0) {
    const unmatched = document.createElement("p");
    unmatched.id = "schede-import-unmatched";
    unmatched.className = "hint-text";
    unmatched.textContent = `${pending.plan.unmatched.length} sched${pending.plan.unmatched.length === 1 ? "a" : "e"} non corrispond${pending.plan.unmatched.length === 1 ? "e" : "ono"} a nessuna riga del listone caricato (${pending.plan.unmatched.map((e) => `${e.player} — ${e.club}`).join("; ")}). Entrano lo stesso e restano nel deposito, ma non contano nell'avanzamento finché la riga non c'è.`;
    box.appendChild(unmatched);
  }

  if (pending.plan.conflicts.length > 0) {
    const list = document.createElement("p");
    list.id = "schede-import-conflicts";
    list.className = "hint-text";
    list.textContent = `In conflitto: ${pending.plan.conflicts.map((e) => `${e.player} — ${e.club}`).join("; ")}.`;
    box.appendChild(list);

    // Nessuna opzione preselezionata: la scelta è di Pico, e su queste righe
    // costa del lavoro in un verso o nell'altro.
    const select = document.createElement("select");
    select.id = "schede-import-resolution";
    select.className = "field-input";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— scegli che cosa fare —";
    select.appendChild(empty);
    for (const [value, label] of [
      ["keep-local", "tieni le mie schede sulle righe in conflitto"],
      ["take-file", "usa quelle del file sulle righe in conflitto"],
    ] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    select.value = pending.resolution ?? "";
    select.addEventListener("change", (e) => {
      const value = (e.target as HTMLSelectElement).value;
      state.schedaImport = {
        ...pending,
        resolution: value === "" ? null : (value as SchedaImportResolution),
      };
      state.schedaImportError = "";
      render();
    });
    box.appendChild(
      schedaField("schede-import-resolution", "SCHEDE IN CONFLITTO", select),
    );
  }

  const actions = document.createElement("div");
  actions.className = "schede-form__actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.id = "schede-import-confirm";
  confirm.className = "btn btn--primary";
  confirm.textContent = "Riprendi questo deposito";
  confirm.disabled =
    pending.plan.conflicts.length > 0 && pending.resolution === null;
  confirm.addEventListener("click", () => confirmSchedaImport());
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.id = "schede-import-cancel";
  cancel.className = "btn btn--secondary";
  cancel.textContent = "Annulla";
  cancel.addEventListener("click", () => cancelSchedaImport());
  actions.append(confirm, cancel);
  box.appendChild(actions);

  return box;
}

/** Una `<label>` col suo controllo, nella forma già usata dagli altri pannelli. */
function schedaField(
  id: string,
  caption: string,
  control: HTMLElement,
): HTMLElement {
  const field = document.createElement("label");
  field.className = "league-team-field";
  field.htmlFor = id;
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = caption;
  field.append(label, control);
  return field;
}

/** Un `<select>` costruito su un vocabolario del contratto. Mai testo libero. */
function schedaSelect(
  id: string,
  emptyLabel: string,
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
  current: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  select.className = "field-input";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = labels[value] ?? value;
    select.appendChild(opt);
  }
  select.value = current;
  select.addEventListener("change", (e) => {
    onChange((e.target as HTMLSelectElement).value);
    persistSchedaEditing();
  });
  return select;
}

/** Un gruppo di checkbox su un vocabolario chiuso: presenza/assenza, non testo. */
function schedaCheckGroup(
  id: string,
  legend: string,
  values: readonly string[],
  labels: Readonly<Record<string, string>>,
  chosen: readonly string[],
  onChange: (next: readonly string[]) => void,
): HTMLElement {
  const group = document.createElement("fieldset");
  group.id = id;
  group.className = "schede-checks";
  const caption = document.createElement("legend");
  caption.className = "field-label";
  caption.textContent = legend;
  group.appendChild(caption);
  for (const value of values) {
    const item = document.createElement("label");
    item.className = "schede-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = `${id}-${value}`;
    box.checked = chosen.includes(value);
    box.addEventListener("change", () => {
      const next = box.checked
        ? [...chosen, value]
        : chosen.filter((v) => v !== value);
      onChange(next);
      persistSchedaEditing();
    });
    const text = document.createElement("span");
    text.textContent = labels[value] ?? value;
    item.append(box, text);
    group.appendChild(item);
  }
  return group;
}

/** Un intero coi limiti LETTI dal contratto, mai riscritti qui. */
function schedaNumberInput(
  id: string,
  min: number,
  max: number,
  current: string,
  onChange: (value: string) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.id = id;
  input.className = "field-input";
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  input.setAttribute("inputmode", "numeric");
  input.value = current;
  input.addEventListener("input", (e) =>
    onChange((e.target as HTMLInputElement).value),
  );
  input.addEventListener("change", () => persistSchedaEditing());
  return input;
}

const SCHEDA_DEPOSIT_REFUSALS: Readonly<Record<"empty" | "invalid", string>> = {
  empty: "Nessuna scheda scritta: non c'è ancora niente da depositare.",
  invalid:
    "Il contratto del deposito rifiuta l'insieme delle schede scritte. Non viene offerto un file che il sito non saprebbe rileggere: correggi o cancella le schede qui sopra.",
};

function renderSchedeSettings(): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "schede-settings";
  panel.className = "schede-settings";
  panel.setAttribute("aria-label", "Schede Gruppo Esperti");

  const intro = document.createElement("p");
  intro.className = "hint-text";
  intro.textContent =
    "Le schede del Gruppo Esperti si scrivono qui, una per giocatore, e alla fine diventano il file da depositare nella cartella privata. Il riquadro che le mostra durante l'asta è descrittivo: non ci sono prezzi, punteggi né consigli d'asta, né qui né lì. Il sito non scrive mai sul deposito: il file lo scarichi e lo carichi tu.";
  panel.appendChild(intro);

  const pool = auctionDisplayPool();
  const rowKeys = pool.map((p) => listonePlayerKey(p));
  const progress = schedaProgress(rowKeys, state.schedaDrafts.schede);

  // ── L'avanzamento delle due ore ───────────────────────────────────────────
  const progressBox = document.createElement("div");
  progressBox.className = "schede-progress";
  progressBox.id = "schede-progress";

  const progressLine = document.createElement("div");
  progressLine.className = "schede-progress__line";
  const progressCount = document.createElement("span");
  progressCount.id = "schede-progress-count";
  progressCount.className = "schede-progress__count";
  progressCount.textContent =
    progress.total === 0
      ? `${progress.written} sched${progress.written === 1 ? "a" : "e"} scritt${progress.written === 1 ? "a" : "e"} — nessuna riga di listone caricata`
      : `${progress.written} su ${progress.total} righe del listone — ne mancano ${progress.missing}`;
  const progressPercent = document.createElement("span");
  progressPercent.id = "schede-progress-percent";
  progressPercent.className = "schede-progress__percent";
  progressPercent.textContent = `${progress.percent}%`;
  progressLine.append(progressCount, progressPercent);
  progressBox.appendChild(progressLine);

  const track = document.createElement("span");
  track.className = "schede-progress__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(progress.total));
  track.setAttribute("aria-valuenow", String(progress.written));
  track.setAttribute("aria-label", "Schede scritte sulle righe del listone");
  const fill = document.createElement("span");
  fill.className = "schede-progress__fill";
  fill.style.width = `${progress.percent}%`;
  track.appendChild(fill);
  progressBox.appendChild(track);

  // Le schede scritte su righe che il listone caricato ORA non ha più. Contate
  // a parte e DETTE: sparire dal conteggio senza dirlo è il modo in cui il
  // lavoro si perde senza un errore.
  if (progress.orphans > 0) {
    const orphans = document.createElement("p");
    orphans.id = "schede-orphans";
    orphans.className = "hint-text";
    orphans.textContent = `${progress.orphans} sched${progress.orphans === 1 ? "a" : "e"} non corrispond${progress.orphans === 1 ? "e" : "ono"} a nessuna riga del listone caricato: rest${progress.orphans === 1 ? "a" : "ano"} nel deposito e nell'elenco qui sotto, ma non contano nell'avanzamento.`;
    progressBox.appendChild(orphans);
  }
  panel.appendChild(progressBox);

  if (!state.schedaDraftsPersisted) {
    const persistError = document.createElement("p");
    persistError.id = "schede-persist-error";
    persistError.className = "schede-alert";
    persistError.setAttribute("role", "alert");
    persistError.textContent =
      "ULTIMA MODIFICA NON SALVATA: la memoria locale del browser ha rifiutato la scrittura. Quello che vedi è ancora qui, ma un ricaricamento lo perde — scarica subito il deposito.";
    panel.appendChild(persistError);
  }

  if (pool.length === 0) {
    const emptyPool = document.createElement("p");
    emptyPool.id = "schede-empty-listone";
    emptyPool.className = "hint-text";
    emptyPool.textContent =
      "Carica il listone (Asta → Ricerca giocatore) per scegliere il giocatore di una scheda: qui non si scrive un nome a mano, si sceglie una riga — è ciò che garantisce che la scheda si agganci a quel giocatore.";
    panel.appendChild(emptyPool);
  } else {
    panel.appendChild(renderSchedaPicker(pool));
    const target = schedaRowTarget(state.schedaTargetKey);
    if (target !== null) panel.appendChild(renderSchedaForm(target, pool));
  }

  panel.appendChild(renderSchedaList());
  panel.appendChild(renderSchedaDeposit());

  if (state.schedaNotice) {
    const notice = document.createElement("p");
    notice.id = "schede-notice";
    notice.className = "hint-text schede-notice";
    notice.setAttribute("role", "status");
    notice.textContent = state.schedaNotice;
    panel.appendChild(notice);
  }

  return panel;
}

/** Il giocatore si SCEGLIE da una riga del listone. Mai un campo di testo. */
function renderSchedaPicker(pool: readonly ListonePlayer[]): HTMLElement {
  const box = document.createElement("div");
  box.className = "schede-picker";

  const filter = document.createElement("input");
  filter.id = "schede-filter";
  filter.className = "field-input";
  filter.type = "text";
  filter.placeholder = "es. Placeholder";
  filter.value = state.schedaFilter;
  filter.addEventListener("input", (e) => {
    state.schedaFilter = (e.target as HTMLInputElement).value;
    // render() rimette la messa a fuoco e il cursore dov'erano (vedi render()).
    render();
  });
  box.appendChild(schedaField("schede-filter", "FILTRA IL LISTONE", filter));

  const needle = normalizeIdentityPart(state.schedaFilter);
  const rows = pool.filter((p) => {
    if (needle === "") return true;
    return (
      normalizeIdentityPart(p.name).includes(needle) ||
      normalizeIdentityPart(p.club).includes(needle)
    );
  });

  const select = document.createElement("select");
  select.id = "schede-player";
  select.className = "field-input";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent =
    rows.length === 0
      ? "— nessuna riga corrisponde al filtro —"
      : "— scegli un giocatore —";
  select.appendChild(empty);
  for (const row of rows) {
    const key = listonePlayerKey(row);
    const opt = document.createElement("option");
    opt.value = key;
    // «✓» davanti a chi ha già una scheda: si vede quale riga è fatta senza
    // cercarla nell'elenco più in basso.
    opt.textContent = `${state.schedaDrafts.schede.has(key) ? "✓ " : ""}${row.name} (${row.club})`;
    select.appendChild(opt);
  }
  select.value = state.schedaTargetKey ?? "";
  select.disabled = rows.length === 0;
  select.addEventListener("change", (e) => {
    const value = (e.target as HTMLSelectElement).value;
    selectSchedaTarget(value === "" ? null : value);
    if (value !== "") focusAfterRender("schede-titolarita");
  });
  box.appendChild(
    schedaField("schede-player", "GIOCATORE (DAL LISTONE)", select),
  );

  return box;
}

/** Il modulo: un controllo per campo, nessun testo libero fuori dalla nota. */
function renderSchedaForm(
  target: SchedaTarget,
  pool: readonly ListonePlayer[],
): HTMLElement {
  const form = document.createElement("div");
  form.id = "schede-form";
  form.className = "schede-form";

  const heading = document.createElement("h3");
  heading.id = "schede-form-title";
  heading.className = "schede-form__title";
  const known =
    state.schedaTargetKey !== null &&
    state.schedaDrafts.schede.has(state.schedaTargetKey);
  heading.textContent = `${known ? "Correggi" : "Scrivi"} la scheda — ${target.name} (${target.club})`;
  form.appendChild(heading);

  const identity = document.createElement("p");
  identity.className = "hint-text";
  identity.id = "schede-identity-note";
  identity.textContent =
    "Nome e squadra sono quelli della riga del listone e non si modificano qui: è ciò che fa agganciare la scheda a questo giocatore durante l'asta.";
  form.appendChild(identity);

  const grid = document.createElement("div");
  grid.className = "league-teams-grid";

  grid.appendChild(
    schedaField(
      "schede-titolarita",
      "TITOLARITÀ",
      schedaSelect(
        "schede-titolarita",
        "— non dichiarata —",
        TITOLARITA_VALUES,
        TITOLARITA_LABELS,
        state.schedaForm.titolarita,
        (value) => updateSchedaForm({ titolarita: value }),
      ),
    ),
  );

  grid.appendChild(
    schedaField(
      "schede-percentuale",
      `QUOTA DEL BALLOTTAGGIO (${SCHEDA_PERCENTUALE_MIN}–${SCHEDA_PERCENTUALE_MAX}%)`,
      schedaNumberInput(
        "schede-percentuale",
        SCHEDA_PERCENTUALE_MIN,
        SCHEDA_PERCENTUALE_MAX,
        state.schedaForm.percentuale,
        (value) => updateSchedaForm({ percentuale: value }),
      ),
    ),
  );

  grid.appendChild(
    schedaField(
      "schede-gerarchia",
      `GERARCHIA NEL RUOLO (${SCHEDA_GERARCHIA_MIN}–${SCHEDA_GERARCHIA_MAX}, 1 = PRIMA SCELTA)`,
      schedaNumberInput(
        "schede-gerarchia",
        SCHEDA_GERARCHIA_MIN,
        SCHEDA_GERARCHIA_MAX,
        state.schedaForm.gerarchia,
        (value) => updateSchedaForm({ gerarchia: value }),
      ),
    ),
  );

  grid.appendChild(
    schedaField(
      "schede-rigori",
      "RIGORI",
      schedaSelect(
        "schede-rigori",
        "— non dichiarati —",
        RIGORI_VALUES,
        RIGORI_LABELS,
        state.schedaForm.rigori,
        (value) => updateSchedaForm({ rigori: value }),
      ),
    ),
  );

  // IL RANGO DEI RIGORI, subito dopo la designazione che ordina — nella stessa
  // posizione che ha nella `shape` del contratto. Vuoto è «non dichiarato» e
  // NON è zero: la casella non ha un valore di partenza, e `buildScheda`
  // rifiuta un rango scritto senza la sua fila invece di lasciarlo passare
  // fino al deposito, dove il rifiuto sarebbe del file intero.
  grid.appendChild(
    schedaField(
      "schede-rango-rigori",
      `RANGO RIGORI (${SCHEDA_RANGO_MIN}–${SCHEDA_RANGO_MAX}, 1 = IL PRIMO DELLA FILA)`,
      schedaNumberInput(
        "schede-rango-rigori",
        SCHEDA_RANGO_MIN,
        SCHEDA_RANGO_MAX,
        state.schedaForm.rangoRigori,
        (value) => updateSchedaForm({ rangoRigori: value }),
      ),
    ),
  );

  grid.appendChild(
    schedaField(
      "schede-fonte",
      "FONTE DELLA SCHEDA",
      schedaSelect(
        "schede-fonte",
        "— non dichiarata —",
        FONTE_VALUES,
        FONTE_LABELS,
        state.schedaForm.fonte,
        (value) => updateSchedaForm({ fonte: value }),
      ),
    ),
  );

  // LA QUARTA ICONA. `""` è un'opzione a sé — «non dichiarata» — e non un
  // quarto valore del vocabolario: una scheda che non dice in quale lista sta
  // è diversa da una che dice «in nessuna», e il riquadro le rende diverse.
  grid.appendChild(
    schedaField(
      "schede-lista",
      "LISTA DEL GRUPPO ESPERTI",
      schedaSelect(
        "schede-lista",
        "— non dichiarata —",
        LISTA_ESPERTI_VALUES,
        LISTA_ESPERTI_LABELS,
        state.schedaForm.lista,
        (value) => updateSchedaForm({ lista: value }),
      ),
    ),
  );

  const date = document.createElement("input");
  date.id = "schede-aggiornata";
  date.className = "field-input";
  date.type = "date";
  date.value = state.schedaForm.aggiornata;
  date.addEventListener("input", (e) =>
    updateSchedaForm({ aggiornata: (e.target as HTMLInputElement).value }),
  );
  date.addEventListener("change", () => persistSchedaEditing());
  grid.appendChild(schedaField("schede-aggiornata", "AGGIORNATA AL", date));

  form.appendChild(grid);

  form.appendChild(
    schedaCheckGroup(
      "schede-piazzati",
      "CALCI PIAZZATI",
      PIAZZATI_VALUES,
      PIAZZATI_LABELS,
      state.schedaForm.piazzati,
      (next) => updateSchedaForm({ piazzati: next }),
    ),
  );

  // I DUE RANGHI DELLE SPECIALITÀ, attaccati alle caselle che li rendono
  // scrivibili. Vivono in una griglia loro e non in quella dei campi generali
  // per una ragione sola: il rango di una specialità ha senso solo accanto
  // alla spunta che la dichiara, e a due schermate di distanza si compila
  // guardando la casella sbagliata.
  const ranghiPiazzati = document.createElement("div");
  ranghiPiazzati.className = "league-team-grid";
  ranghiPiazzati.id = "schede-ranghi-piazzati";
  for (const [kind, id] of [
    ["punizioni", "schede-rango-punizioni"],
    ["angoli", "schede-rango-angoli"],
  ] as const) {
    const campo = kind === "punizioni" ? ("rangoPunizioni" as const) : ("rangoAngoli" as const);
    ranghiPiazzati.appendChild(
      schedaField(
        id,
        `RANGO ${PIAZZATI_LABELS[kind].toUpperCase()} (${SCHEDA_RANGO_MIN}–${SCHEDA_RANGO_MAX})`,
        schedaNumberInput(
          id,
          SCHEDA_RANGO_MIN,
          SCHEDA_RANGO_MAX,
          state.schedaForm[campo],
          (value) => updateSchedaForm({ [campo]: value } as Partial<SchedaFormValues>),
        ),
      ),
    );
  }
  form.appendChild(ranghiPiazzati);

  form.appendChild(
    schedaCheckGroup(
      "schede-avvisi",
      "AVVISI",
      AVVISO_VALUES,
      AVVISO_LABELS,
      state.schedaForm.avvisi,
      (next) => updateSchedaForm({ avvisi: next }),
    ),
  );

  form.appendChild(renderSchedaBallottaggio(target, pool));
  form.appendChild(renderSchedaPagella(target));

  // ── La nota: l'unico testo libero, col suo limite scritto ─────────────────
  const notaField = document.createElement("div");
  notaField.className = "league-team-field";
  const notaLabel = document.createElement("label");
  notaLabel.className = "field-label";
  notaLabel.htmlFor = "schede-nota";
  notaLabel.textContent =
    "NOTA (IL PERCHÉ DI UN AVVISO, UNA SITUAZIONE DI MERCATO, UN CONTESTO)";
  const nota = document.createElement("textarea");
  nota.id = "schede-nota";
  nota.className = "field-input schede-nota";
  nota.rows = 4;
  nota.value = state.schedaForm.nota;
  const counter = document.createElement("span");
  counter.id = "schede-nota-counter";
  const notaLength = (value: string): number => value.trim().length;
  const paintCounter = (value: string): void => {
    const used = notaLength(value);
    counter.className = `schede-nota__counter${used > SCHEDA_NOTA_MAX ? " is-over" : ""}`;
    counter.textContent =
      used > SCHEDA_NOTA_MAX
        ? `${used} / ${SCHEDA_NOTA_MAX} caratteri — ${used - SCHEDA_NOTA_MAX} di troppo, la nota non viene tagliata da sola`
        : `${used} / ${SCHEDA_NOTA_MAX} caratteri`;
  };
  paintCounter(state.schedaForm.nota);
  // Nessun `maxlength`: troncherebbe un incollaggio perdendone la coda senza
  // dirlo. Il contatore si aggiorna qui, sul nodo, senza ridisegnare tutto.
  nota.addEventListener("input", (e) => {
    const value = (e.target as HTMLTextAreaElement).value;
    updateSchedaForm({ nota: value });
    paintCounter(value);
  });
  nota.addEventListener("change", () => persistSchedaEditing());
  notaField.append(notaLabel, nota, counter);
  form.appendChild(notaField);

  const actions = document.createElement("div");
  actions.className = "schede-form__actions";
  const save = document.createElement("button");
  save.type = "button";
  save.id = "schede-save";
  save.className = "btn btn--primary";
  save.textContent = known ? "Salva la correzione" : "Salva la scheda";
  save.addEventListener("click", () => saveSchedaFromForm());
  const close = document.createElement("button");
  close.type = "button";
  close.id = "schede-close";
  close.className = "btn btn--secondary";
  close.textContent = "Chiudi senza salvare";
  close.addEventListener("click", () => {
    selectSchedaTarget(null);
    focusAfterRender("schede-player");
  });
  actions.append(save, close);
  form.appendChild(actions);

  if (state.schedaErrors.length > 0) {
    const errors = document.createElement("ul");
    errors.id = "schede-errors";
    errors.className = "schede-alert schede-errors";
    errors.setAttribute("role", "alert");
    errors.tabIndex = -1;
    for (const error of state.schedaErrors) {
      const item = document.createElement("li");
      item.id = `schede-error-${error.field}`;
      item.textContent = error.message;
      errors.appendChild(item);
    }
    form.appendChild(errors);
  }

  return form;
}

// ── CON CHI SI GIOCA IL POSTO ────────────────────────────────────────────────
//
// PERCHÉ QUESTO CAMPO CONTA PIÙ DEGLI ALTRI. La quota del ballottaggio dice
// QUANTO vale la contesa; questo dice CON CHI, ed è il solo dato del deposito
// che risponda davvero a «quanti si contendono quel posto». Fino a ieri le
// uniche due occorrenze di `ballottaggio` in questo pannello erano commenti: il
// contratto lo ammetteva e l'unica persona che può scriverlo non aveva nessuna
// via per farlo.
//
// SI SCEGLIE DA UNA RIGA, COME IL GIOCATORE. È la prima regola del pannello, e
// vale anche qui: nessun campo di testo per un nome. Un nome battuto a mano
// finirebbe nel deposito con un refuso, e il refuso non lo vedrebbe nessuno —
// il riquadro d'asta scrive quel nome così com'è.
//
// E DA OGGI LA RIGA PORTA TUTTE E DUE LE METÀ. Il contratto deposita `surface`
// E `club` (src/expertScheda.ts): il valore di un'opzione non è più il nome, è
// l'IDENTITÀ — `listonePlayerKey`, la stessa chiave con cui l'event log
// registra un acquisto e con cui `planSchedaImport` riaggancia una scheda alla
// sua riga. La scelta da listone diventa così PIÙ naturale, non meno: la riga
// porta già nome e squadra, e un gesto solo le scrive tutte e due. Col solo
// nome, due omonimi pieni in club diversi producevano lo stesso valore
// depositato ed erano indistinguibili dopo il salvataggio.
//
// I DUE GRUPPI NON SONO UNA GRADUATORIA, E NON SONO UN FILTRO. «Stessa
// squadra» sta in cima perché un ballottaggio è una contesa per un posto in una
// formazione, e i rivali plausibili sono i compagni: è un raggruppamento per un
// fatto dichiarato, non un ordinamento per merito, e OGNI riga del listone
// resta scegliibile. Restringere l'elenco ai soli compagni era una delle tre
// strade sul tavolo il 2026-08-24, ed è quella che Pico NON ha scelto: la
// squadra è entrata nel dato proprio perché non servisse restringere la scelta
// per sapere di chi si parla.
//
// UN NOME CHE IL LISTONE NON HA SI DICHIARA, NON SI ABBINA. Riaprendo una
// scheda ripresa da un deposito scritto altrove, un'identità può non
// corrispondere a nessuna riga caricata: resta scritta COM'È, l'opzione la
// porta segnata, e una riga sotto il campo lo dice. Agganciarla «alla più
// simile» attaccherebbe in silenzio il rivale sbagliato — la stessa cosa che
// `planSchedaImport` si rifiuta di fare.
//
// E LO STESSO VALE PER LA SQUADRA CHE MANCA. Un soggetto scritto prima di
// questa forma porta il solo nome: l'opzione lo mostra con «squadra n/d» e NON
// gli attacca la squadra del primo omonimo che il listone porta, nemmeno quando
// ce n'è uno solo. Chi vuole completarlo riapre il `<select>` e sceglie la
// riga: è un gesto, e un gesto è la sola cosa che può decidere quale dei due
// omonimi fosse.

/** Le righe che una casella «con chi» può nominare: tutte tranne lui stesso. */
function ballottaggioOptions(
  target: SchedaTarget,
  pool: readonly ListonePlayer[],
): {
  readonly stessoClub: readonly ListonePlayer[];
  readonly altri: readonly ListonePlayer[];
} {
  const self = listonePlayerKey({ name: target.name, club: target.club });
  const club = normalizeIdentityPart(target.club);
  const stessoClub: ListonePlayer[] = [];
  const altri: ListonePlayer[] = [];
  for (const row of pool) {
    // Per NOME+SQUADRA e non per `listonePlayerKey(row)`: su una riga proxy
    // quella chiave è `proxy:<id>` e non combacerebbe mai con `self`, cioè il
    // giocatore della scheda comparirebbe fra i propri rivali. È la stessa
    // forma con cui `planSchedaImport` indicizza le righe, per la stessa
    // ragione.
    if (ballottaggioOptionValue({ surface: row.name, club: row.club }) === self)
      continue;
    (normalizeIdentityPart(row.club) === club ? stessoClub : altri).push(row);
  }
  return { stessoClub, altri };
}

/**
 * IL VALORE DI UN'OPZIONE «CON CHI»: l'identità, non il nome.
 *
 * `listonePlayerKey` è la forma di casa per la coppia nome+squadra, e usarla
 * qui vuol dire che il `<select>` e il deposito parlano della stessa cosa senza
 * traduzioni in mezzo. Costruita SEMPRE da nome e squadra — mai da `proxyId` —
 * perché il valore deve essere ricostruibile da un soggetto già depositato, che
 * un `proxyId` non ce l'ha.
 *
 * Un soggetto SENZA squadra (deposito scritto prima di questa forma) prende il
 * solo nome piegato. I due spazi di valori non possono collidere: la piega di
 * `normalizeIdentityPart` non emette mai `_`, quindi solo un'identità intera
 * contiene `__`.
 */
function ballottaggioOptionValue(identita: {
  readonly surface: string;
  readonly club: string;
}): string {
  const surface = identita.surface.trim();
  const club = identita.club.trim();
  if (surface === "") return "";
  return club === ""
    ? normalizeIdentityPart(surface)
    : listonePlayerKey({ name: surface, club });
}

function renderSchedaBallottaggio(
  target: SchedaTarget,
  pool: readonly ListonePlayer[],
): HTMLElement {
  const group = document.createElement("fieldset");
  group.id = "schede-ballottaggio";
  group.className = "schede-group";
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = `CON CHI SI GIOCA IL POSTO (FINO A ${SCHEDA_BALLOTTAGGIO_MAX})`;
  group.appendChild(legend);

  const hint = document.createElement("p");
  hint.id = "schede-ballottaggio-hint";
  hint.className = "hint-text";
  hint.textContent =
    "Gli altri in ballottaggio, ciascuno con la sua quota quando la scheda la dichiara. Arrivano al riquadro d'asta solo con la titolarità «ballottaggio»: senza quella non verrebbero mostrati, e il salvataggio lo dice invece di perderli. La quota non è obbligatoria — lasciarla vuota vuol dire «non dichiarata», non «zero».";
  group.appendChild(hint);

  const { stessoClub, altri } = ballottaggioOptions(target, pool);
  const righe = state.schedaForm.ballottaggio;
  // Le righe scritte più UNA vuota in coda, fino al tetto del contratto: quattro
  // caselle sempre aperte sarebbero tre caselle vuote nel caso normale.
  const quante = Math.min(righe.length + 1, SCHEDA_BALLOTTAGGIO_MAX);

  for (let i = 0; i < quante; i += 1) {
    const riga = righe[i] ?? EMPTY_SCHEDA_BALLOTTAGGIO_ROW;
    const row = document.createElement("div");
    row.className = "league-teams-grid";

    const select = document.createElement("select");
    select.id = `schede-ballottaggio-nome-${i}`;
    select.className = "field-input";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— nessuno —";
    select.appendChild(empty);
    // L'indice valore -> riga: è ciò che permette al gestore di scrivere
    // INSIEME le due metà dell'identità. Senza, il `<select>` porterebbe una
    // chiave e il modulo dovrebbe ripiegarla in nome e squadra, cioè inventarsi
    // all'indietro le due superfici che la riga ha già scritte giuste.
    const byValue = new Map<string, ListonePlayer>();
    const appendRows = (
      rows: readonly ListonePlayer[],
      label: string,
    ): void => {
      if (rows.length === 0) return;
      const optgroup = document.createElement("optgroup");
      optgroup.label = label;
      for (const p of rows) {
        const opt = document.createElement("option");
        // Il VALORE è l'IDENTITÀ, non il nome: due omonimi pieni in club
        // diversi sono due opzioni distinte, e restano distinte fin dentro il
        // file. Col solo nome producevano lo stesso valore, e il secondo
        // vinceva in silenzio.
        opt.value = ballottaggioOptionValue({ surface: p.name, club: p.club });
        opt.textContent = `${p.name} (${p.club})`;
        byValue.set(opt.value, p);
        optgroup.appendChild(opt);
      }
      select.appendChild(optgroup);
    };
    appendRows(stessoClub, "Stessa squadra");
    appendRows(altri, "Altre squadre");
    // Un soggetto che nessuna riga del listone porta — perché è davvero fuori,
    // o perché è scritto senza squadra e questo pannello non gliene inventa
    // una: entra COM'È, segnato, e non viene riabbinato a niente. Senza questa
    // opzione il `<select>` ricadrebbe su «nessuno» al primo ridisegno, cioè
    // cancellerebbe il soggetto per non avere un posto dove scriverlo.
    const value = ballottaggioOptionValue(riga);
    if (value !== "" && !byValue.has(value)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent =
        riga.club.trim() === ""
          ? `${riga.surface} (${SCHEDA_CLUB_NON_DICHIARATA})`
          : `${riga.surface} (${riga.club}) — fuori dal listone caricato`;
      select.appendChild(opt);
    }
    select.value = value;
    select.addEventListener("change", (e) => {
      const scelto = (e.target as HTMLSelectElement).value;
      const row = byValue.get(scelto);
      // Le due metà si scrivono INSIEME o non si scrivono: è la scelta della
      // riga a garantire che combacino. «Nessuno» le toglie tutte e due —
      // mezza identità rimasta indietro sarebbe un accoppiamento sbagliato che
      // nessuno vede. L'opzione «com'è scritto» non cambia niente: è già lei.
      if (scelto === "") updateSchedaBallottaggio(i, { surface: "", club: "" });
      else if (row !== undefined) {
        updateSchedaBallottaggio(i, { surface: row.name, club: row.club });
      }
      persistSchedaEditing();
      // Ridisegna: una riga scelta ne apre una nuova in coda, una riga svuotata
      // sparisce, e gli indici delle altre si spostano.
      render();
    });
    row.appendChild(
      schedaField(`schede-ballottaggio-nome-${i}`, `ALTRO ${i + 1}`, select),
    );

    const quota = document.createElement("input");
    quota.id = `schede-ballottaggio-quota-${i}`;
    quota.className = "field-input";
    quota.type = "number";
    quota.min = String(SCHEDA_PERCENTUALE_MIN);
    quota.max = String(SCHEDA_PERCENTUALE_MAX);
    quota.step = "1";
    quota.setAttribute("inputmode", "numeric");
    quota.value = riga.sharePercent;
    quota.addEventListener("input", (e) => {
      updateSchedaBallottaggio(i, {
        sharePercent: (e.target as HTMLInputElement).value,
      });
    });
    quota.addEventListener("change", () => persistSchedaEditing());
    row.appendChild(
      schedaField(
        `schede-ballottaggio-quota-${i}`,
        `QUOTA ${i + 1} (${SCHEDA_PERCENTUALE_MIN}–${SCHEDA_PERCENTUALE_MAX}%, FACOLTATIVA)`,
        quota,
      ),
    );

    group.appendChild(row);
  }

  const fuoriListone = schedaBallottaggioFuoriListone(righe, pool);
  if (fuoriListone.length > 0) {
    const note = document.createElement("p");
    note.id = "schede-ballottaggio-fuori-listone";
    note.className = "hint-text";
    note.textContent = `${fuoriListone.join(", ")}: ${fuoriListone.length === 1 ? "questo nome non corrisponde" : "questi nomi non corrispondono"} a nessuna riga del listone caricato. Rest${fuoriListone.length === 1 ? "a scritto com'è" : "ano scritti come sono"} — non ${fuoriListone.length === 1 ? "viene abbinato" : "vengono abbinati"} al nome più somigliante.`;
    group.appendChild(note);
  }

  return group;
}

/**
 * Una casella del ballottaggio cambia: la riga si crea se non c'era, e sparisce
 * quando resta senza NIENTE dentro. Una riga con la sola quota NON sparisce —
 * il numero c'è, e buttarlo via in silenzio sarebbe la perdita che questo
 * pannello esiste per non avere: `buildScheda` lo dice invece.
 */
function updateSchedaBallottaggio(
  index: number,
  patch: Partial<SchedaBallottaggioValues>,
): void {
  const righe = [...state.schedaForm.ballottaggio];
  while (righe.length <= index) righe.push(EMPTY_SCHEDA_BALLOTTAGGIO_ROW);
  righe[index] = { ...(righe[index] as SchedaBallottaggioValues), ...patch };
  const compacted = righe.filter(
    (r) =>
      r.surface.trim() !== "" ||
      r.club.trim() !== "" ||
      r.sharePercent.trim() !== "",
  );
  updateSchedaForm({ ballottaggio: compacted });
  // Non persiste qui: come per gli altri numerici, si scrive su `change` e non
  // a ogni tasto (schedaNumberInput). Chi cambia il `<select>` persiste da sé,
  // perché lì un gesto solo è già la modifica finita.
}

// ── LA PAGELLA: I CINQUE VOTI, ATTERRATI ─────────────────────────────────────
//
// Il radar del riquadro d'asta esiste da tempo ed è VUOTO PER COSTRUZIONE:
// l'estrazione che lo riempirebbe vive nel repository privato e non esiste
// ancora. Queste caselle sono la via d'ingresso che mancava — non un
// estrattore, non un giudizio: i cinque numeri che la fonte scrive, ricopiati.
//
// IL QUARTO ASSE LO DECIDE IL RUOLO DELLA RIGA, non chi compila: «Porta
// inviolata» per i portieri, «Bonus» per il movimento. Lo schema RIFIUTA una
// pagella che li porti entrambi, quindi non c'è una casella per ciascuno: c'è
// la casella del ruolo. L'unica eccezione è la scheda ripresa da un deposito
// che porta l'asse dell'altro ruolo: quella casella compare in più, segnata,
// perché si possa TOGLIERE — nasconderla avrebbe lasciato un valore
// incorreggibile dentro un modulo che si rifiuta di salvare.
//
// IL TOTALE È QUELLO DELLA FONTE. La somma dei cinque si ricalcola e serve a
// SMENTIRLO: la riga sotto le caselle scrive tutti e due i numeri quando non
// tornano, e non ne appiana nessuno. Una pagella parziale non produce nessuna
// somma — «20/50» con tre voti su cinque è un numero falso che sembra vero.

function renderSchedaPagella(target: SchedaTarget): HTMLElement {
  const group = document.createElement("fieldset");
  group.id = "schede-pagella";
  group.className = "schede-group";
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = `PAGELLA DEL GRUPPO ESPERTI (CINQUE VOTI ${PAGELLA_VOTO_MIN}–${PAGELLA_VOTO_MAX} E IL TOTALE DICHIARATO)`;
  group.appendChild(legend);

  const hint = document.createElement("p");
  hint.id = "schede-pagella-hint";
  hint.className = "hint-text";
  hint.textContent =
    "Un voto lasciato vuoto resta mancante e si legge «n/d»: non diventa uno zero, perché uno zero è un giudizio durissimo della fonte. Il TOTALE è quello che la scheda dichiara, non la somma: la somma la ricalcola l'app, qui sotto, per poterlo smentire.";
  group.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "league-teams-grid";

  const verifica = document.createElement("p");
  verifica.id = "schede-pagella-verifica";
  verifica.className = "hint-text";
  const paintVerifica = (): void => {
    verifica.textContent = schedaPagellaVerificaText(
      state.schedaForm.pagella,
      target.role,
    );
  };

  const votoInput = (asse: PagellaAsse, etichetta: string): HTMLElement => {
    const id = `schede-${asse.replace(/_/g, "-")}`;
    const input = schedaNumberInput(
      id,
      PAGELLA_VOTO_MIN,
      PAGELLA_VOTO_MAX,
      state.schedaForm.pagella[asse],
      (value) => {
        updateSchedaPagella({ [asse]: value } as Partial<SchedaPagellaValues>);
        paintVerifica();
      },
    );
    return schedaField(id, etichetta.toUpperCase(), input);
  };

  const [primo, secondo, terzo, quinto] = PAGELLA_ASSI_COMUNI;
  for (const asse of [primo, secondo, terzo] as const) {
    grid.appendChild(votoInput(asse, PAGELLA_ETICHETTE[asse]));
  }

  // Il quarto: quello che il RUOLO della riga chiede.
  const atteso = pagellaAsseDelRuolo(target.role);
  if (atteso === null) {
    const ignoto = document.createElement("p");
    ignoto.id = "schede-pagella-ruolo-ignoto";
    ignoto.className = "hint-text";
    ignoto.textContent = `${PAGELLA_QUARTO_ASSE_IGNOTO}: questa riga di listone non dichiara un ruolo, quindi non si sa quale sia il quarto asse e non se ne sceglie uno al posto suo.`;
    grid.appendChild(ignoto);
  } else {
    grid.appendChild(
      votoInput(atteso, `${PAGELLA_ETICHETTE[atteso]} (dal ruolo della riga)`),
    );
  }

  grid.appendChild(
    votoInput(
      quinto as PagellaAsse,
      `${PAGELLA_ETICHETTE.pagella_consiglio} (parere della fonte)`,
    ),
  );

  // L'asse dell'ALTRO ruolo, solo se una scheda ripresa ne porta uno: c'è per
  // poterlo togliere, e lo dice.
  const estraneo =
    atteso === "pagella_porta_inviolata"
      ? "pagella_bonus"
      : atteso === "pagella_bonus"
        ? "pagella_porta_inviolata"
        : null;
  if (estraneo !== null && state.schedaForm.pagella[estraneo].trim() !== "") {
    grid.appendChild(
      votoInput(
        estraneo,
        `${PAGELLA_ETICHETTE[estraneo]} — asse di un altro ruolo, da togliere`,
      ),
    );
  }

  const totale = schedaNumberInput(
    "schede-pagella-totale",
    0,
    PAGELLA_TOTALE_MAX,
    state.schedaForm.pagella.totaleFonte,
    (value) => {
      updateSchedaPagella({ totaleFonte: value });
      paintVerifica();
    },
  );
  grid.appendChild(
    schedaField(
      "schede-pagella-totale",
      `TOTALE DICHIARATO DALLA FONTE (0–${PAGELLA_TOTALE_MAX})`,
      totale,
    ),
  );

  group.appendChild(grid);
  paintVerifica();
  group.appendChild(verifica);
  return group;
}

function updateSchedaPagella(patch: Partial<SchedaPagellaValues>): void {
  updateSchedaForm({ pagella: { ...state.schedaForm.pagella, ...patch } });
}

/** Le schede già scritte: rileggibili, correggibili, cancellabili. */
function renderSchedaList(): HTMLElement {
  const box = document.createElement("div");
  box.className = "schede-list";
  box.id = "schede-list";

  const title = document.createElement("h3");
  title.className = "league-people-title";
  title.textContent = "SCHEDE SCRITTE";
  box.appendChild(title);

  if (state.schedaDrafts.schede.size === 0) {
    const empty = document.createElement("p");
    empty.id = "schede-list-empty";
    empty.className = "hint-text";
    empty.textContent = "Nessuna scheda scritta finora.";
    box.appendChild(empty);
    return box;
  }

  for (const [rowKey, scheda] of state.schedaDrafts.schede) {
    const row = document.createElement("div");
    row.className = "schede-row";
    const head = document.createElement("div");
    head.className = "schede-row__head";
    row.appendChild(head);

    const identity = document.createElement("span");
    identity.className = "schede-row__identity";
    identity.textContent = `${scheda.player} (${scheda.club})`;
    head.appendChild(identity);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.id = `schede-edit-${rowKey}`;
    edit.className = "btn btn--secondary";
    edit.textContent = "Modifica";
    edit.setAttribute("aria-label", `Modifica la scheda di ${scheda.player}`);
    edit.addEventListener("click", () => editScheda(rowKey));
    head.appendChild(edit);

    // Cancellazione in due tempi: il primo clic chiede, il secondo esegue.
    const confirming = state.schedaConfirmDelete === rowKey;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.id = `schede-delete-${rowKey}`;
    remove.className = confirming ? "btn btn--danger" : "btn btn--secondary";
    remove.textContent = confirming ? "Confermi?" : "Cancella";
    remove.setAttribute(
      "aria-label",
      confirming
        ? `Conferma la cancellazione della scheda di ${scheda.player}`
        : `Cancella la scheda di ${scheda.player}`,
    );
    remove.addEventListener("click", () =>
      confirming ? deleteScheda(rowKey) : requestSchedaDelete(rowKey),
    );
    head.appendChild(remove);

    if (confirming) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.id = `schede-delete-cancel-${rowKey}`;
      cancel.className = "btn btn--secondary";
      cancel.textContent = "No";
      cancel.setAttribute(
        "aria-label",
        `Non cancellare la scheda di ${scheda.player}`,
      );
      cancel.addEventListener("click", () => cancelSchedaDelete());
      head.appendChild(cancel);
    }

    const summary = document.createElement("span");
    summary.className = "schede-row__summary";
    summary.textContent = schedaSummary(scheda);
    row.appendChild(summary);

    box.appendChild(row);
  }

  return box;
}

/** Il deposito pronto — o il motivo per cui non lo è, mai un file rotto. */
function renderSchedaDeposit(): HTMLElement {
  const box = document.createElement("div");
  box.className = "schede-deposit";
  box.id = "schede-deposit";

  const title = document.createElement("h3");
  title.className = "league-people-title";
  title.textContent = "IL DEPOSITO";
  box.appendChild(title);

  const result = buildSchedaDeposit(state.schedaDrafts.schede);

  const status = document.createElement("p");
  status.id = "schede-deposit-status";
  status.className = result.ok ? "hint-text" : "schede-alert";
  if (!result.ok) status.setAttribute("role", "alert");
  status.textContent = result.ok
    ? `Deposito pronto: ${result.count} sched${result.count === 1 ? "a" : "e"}, validate col contratto vero (parseExpertSchedaDeposit). Scaricalo come «${SCHEDA_DEPOSIT_FILENAME}» e caricalo tu nella cartella privata: il sito non lo scrive mai.`
    : result.reason === "duplicate"
      ? `Due schede finiscono sulla stessa identità (${result.identities.join("; ")}): il riquadro non ne mostrerebbe nessuna delle due. Cancellane una o correggi il giocatore prima di depositare.`
      : SCHEDA_DEPOSIT_REFUSALS[result.reason];
  box.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "schede-form__actions";

  const download = document.createElement("button");
  download.type = "button";
  download.id = "schede-download";
  download.className = "btn btn--primary";
  download.textContent = "Scarica il deposito";
  download.disabled = !result.ok;
  if (result.ok)
    download.addEventListener("click", () =>
      downloadSchedaDeposit(result.text),
    );

  const copy = document.createElement("button");
  copy.type = "button";
  copy.id = "schede-copy";
  copy.className = "btn btn--secondary";
  copy.textContent = "Copia negli appunti";
  copy.disabled = !result.ok;
  if (result.ok)
    copy.addEventListener("click", () =>
      copySchedaDeposit(result.text, result.count),
    );

  actions.append(download, copy);
  box.appendChild(actions);

  // ── L'altra direzione: riprendere un deposito già scritto ────────────────
  const importTitle = document.createElement("h3");
  importTitle.className = "league-people-title";
  importTitle.textContent = "RIPRENDI UN DEPOSITO GIÀ SCRITTO";
  box.appendChild(importTitle);

  const importHint = document.createElement("p");
  importHint.className = "hint-text";
  importHint.textContent =
    "Carica un file di deposito per continuare da dove eri: quello che scarichi qui rientra identico, anche su un altro browser o su un'altra macchina. Il file viene letto in locale, non viene mandato da nessuna parte, e prima di applicarlo il pannello ti dice esattamente che cosa cambierebbe.";
  box.appendChild(importHint);

  const importFile = document.createElement("input");
  importFile.type = "file";
  importFile.id = "schede-import-file";
  importFile.className = "field-input schede-import-file";
  importFile.accept = "application/json,.json";
  importFile.setAttribute(
    "aria-label",
    "Scegli il file di deposito da riprendere",
  );
  importFile.addEventListener("change", (e) =>
    readSchedaImportFile(e.target as HTMLInputElement),
  );
  box.appendChild(importFile);

  if (state.schedaImportError) {
    const error = document.createElement("p");
    error.id = "schede-import-error";
    error.className = "schede-alert";
    error.setAttribute("role", "alert");
    error.textContent = state.schedaImportError;
    box.appendChild(error);
  }

  if (state.schedaImport !== null)
    box.appendChild(renderSchedaImportPreview(state.schedaImport));

  return box;
}

function renderOperatingModeStatus(): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "operating-mode-status";
  panel.className = "operating-mode-status";
  panel.setAttribute("aria-label", "Stato app");
  panel.innerHTML = `
    <ul class="operating-state-list">
      <li id="shadow-status" class="operating-state operating-state--shadow">
        <span class="operating-dot" aria-hidden="true"></span>
        <strong>SHADOW</strong>
        <span class="operating-desc">Solo registrazione tecnica; nessun output di modello è operativo.</span>
      </li>
      <li id="no-target-status" class="operating-state operating-state--no-target">
        <span class="operating-dot" aria-hidden="true"></span>
        <strong>NO TARGET</strong>
        <span class="operating-desc">Nessuna evidenza autorizzata: usa soltanto i vincoli contabili.</span>
      </li>
      <li id="connectivity-status" class="operating-state ${state.offline ? "operating-state--offline" : "operating-state--online"}"
          role="status" aria-live="polite">
        <span class="operating-dot" aria-hidden="true"></span>
        <strong>${state.offline ? "OFFLINE" : "CLIENT LOCALE"}</strong>
        <span class="operating-desc">${state.offline ? "Rete assente; il core già caricato resta disponibile." : "Core locale pronto; nessun backend richiesto."}</span>
      </li>
    </ul>
  `;
  return panel;
}

// ── IL TAVOLO — sempre aperto (momento chiamata) ─────────────────────────────
//
// COM'ERA (#333). SCARSITÀ PER RUOLO e TAVOLO — WAR BOARD sono le stesse otto
// squadre lette due volte, e nessuna delle due risponde alle quattro domande
// dal MIO posto (quanto posso spendere per questo · chi me lo contende · quanto
// mi serve questo ruolo adesso · quanto mi resta se lo prendo): quelle risposte
// stanno nella fascia critica e nel CONTESTO CHIAMATA. Occupavano più di metà
// della pagina mentre il campo di ricerca — l'unica ragione per cui la
// schermata esiste — stava sotto la piega, e #333 le ha spostate QUI, fuori dal
// pannello della chiamata e sotto il listone, mettendole per giunta dietro un
// gesto.
//
// COM'È (decisione di Pico, 2026-08-26): SEMPRE APERTO, e non «aperto di
// default». Il gesto non c'è più — nessun controllo può richiuderlo — perché
// «aperto ma richiudibile» non è quello che è stato chiesto, e perché ciò che
// il gesto proteggeva se lo tiene ormai la POSIZIONE:
//
//  - il campo di ricerca sopra la piega non dipende più da questo blocco. Il
//    gruppo sta DOPO l'intero pannello della chiamata, quindi qualunque sia la
//    sua altezza non spinge giù niente che gli stia sopra
//    (`e2e/call-screen-order.spec.ts`, il confronto fra `#table-detail` e
//    `#search-player`, resta verde per costruzione);
//  - il budget verticale della schermata non lo vede nemmeno: lo span che il
//    mastro governa finisce all'indicatore di pagina del listone, e IL TAVOLO
//    sta sotto — vedi `src/ui/callScreenBudget.ts`, che per questa ragione non
//    distingue più uno stato «tavolo aperto» da uno «chiuso»: da oggi
//    l'unico stato è aperto, in tutti e cinque gli stati della schermata.
//
// Ciò che resta di #333 è la parte che contava: i due pannelli NON sono più in
// mezzo alla schermata di chiamata. Non sono più nemmeno dietro un gesto.
function renderTableDetail(
  aState: AuctionState,
  scarcity: Readonly<Record<Role, RoleScarcity>>,
): HTMLElement {
  const section = document.createElement("section");
  section.id = "table-detail";
  // Deliberatamente NON `.panel`: i pannelli interni lo sono già, e diverse
  // spec localizzano un pannello con `.panel` + hasText — un antenato con la
  // stessa classe renderebbe quei locator ambigui.
  section.className = "table-detail";
  section.setAttribute("aria-label", "Tavolo: scarsità e war board");

  // LA TESTATA NON È PIÙ UN CONTROLLO, quindi non è più un `<button>`: un
  // bottone che non fa niente è una promessa non mantenuta per chi naviga da
  // tastiera, e `aria-expanded` su un pannello che non si può chiudere
  // dichiarerebbe uno stato che non esiste. Resta ciò che la testata diceva —
  // il nome e il proprio contenuto — perché serviva a leggere il gruppo, non
  // ad aprirlo.
  const head = document.createElement("div");
  head.id = "table-detail-head";
  head.className = "table-detail__head";
  head.innerHTML =
    `<span class="panel-title">IL TAVOLO</span>` +
    `<span class="table-detail__what">scarsità per ruolo · war board</span>`;
  section.appendChild(head);

  const body = document.createElement("div");
  body.id = "table-detail-body";
  body.className = "table-detail__body";
  body.appendChild(renderRoleScarcityPanel(scarcity, state.pool.length > 0));
  // War board COMPLETA — #231 tranche 3, decisione di Owner #222 voce 18
  // (revisione registrata dell'invariante #86, docs/FRONTEND_STRUCTURE.md).
  // The full table state belongs to THIS moment: choosing whom to call is
  // when there is time to read eight cards. The live moment gets the MINI
  // strip instead (renderMomentoAsta) — never both at once.
  // `auctionDisplayIndex()` is the same one-index-per-render helper STORICO
  // and Rose already use: no per-acquisition scan of the pool.
  body.appendChild(
    renderWarBoardFull(
      warBoardRows(aState, SELF_ID),
      seatLabelMap(),
      auctionDisplayIndex(),
    ),
  );
  section.appendChild(body);

  return section;
}

// ── Zone 1: Chiamata panel ────────────────────────────────────────────────────
function renderZona1(
  aState: AuctionState,
  team: TeamState | undefined,
  scarcity: Readonly<Record<Role, RoleScarcity>>,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.style.cssText = `padding:24px;border:1px solid ${C.border};`;

  if (state.moment === "chiamata") {
    panel.appendChild(renderMomentoChiamata(aState, scarcity));
  } else {
    panel.appendChild(renderMomentoAsta(aState, team));
  }

  return panel;
}

/**
 * #333 — L'ORDINE DI QUESTA SCHERMATA È UNA DECISIONE, NON UN INVENTARIO.
 *
 * Le quattro domande del tavolo, in ordine di frequenza (confermate da Pico):
 *   1. quanto posso spendere per questo;
 *   2. chi me lo contende;
 *   3. quanto mi serve davvero questo ruolo adesso;
 *   4. quanto mi resta se lo prendo.
 * Criterio: ciò che serve alla decisione più frequente sta in alto e non si
 * scrolla; ciò che non serve a nessuna delle quattro scende. Il contesto è
 * un'asta dal vivo: qualcuno urla un prezzo e ci sono due secondi.
 *
 * Da cui l'ordine qui sotto, che è l'unica cosa cambiata — nessun blocco è
 * stato cancellato, nessun numero è sparito:
 *   1. RICERCA GIOCATORE — è l'unica ragione per cui questa schermata esiste,
 *      e stava sotto la piega a tutte le risoluzioni. Ora è il primo elemento
 *      della colonna, sotto la fascia critica (che porta già D1 e D4).
 *   2. CONTESTO CHIAMATA — l'unico blocco che risponde a D1+D2+D3 insieme per
 *      il giocatore selezionato. Compare solo dopo la selezione (D7 Binario A:
 *      on-demand, e resta on-demand) ma ora compare SUBITO SOTTO il campo di
 *      ricerca, non alla quarta schermata.
 *   3. LISTONE — la risposta alla ricerca, attaccata alla ricerca.
 *   4. INSERIMENTO RAPIDO — è un'azione (registra un acquisto già concluso),
 *      non una risposta: scende sotto la coppia ricerca/listone, ma resta un
 *      pannello pieno e visibile perché lo si usa a ogni aggiudicazione.
 *   5. GIOCATORE SUGGERITO — stava in fondo perché era vuoto per costruzione
 *      («nessun motore di suggerimento è abilitato»). Adesso le due metà sono
 *      costruite entrambe — PER ME e PER FAR SPENDERE GLI ALTRI — e nessuna
 *      delle due è una predizione: sono fatti misurati messi in un ordine
 *      dichiarato. La POSIZIONE però non cambia in questa tranche: spostarlo
 *      più in alto è una decisione di prodotto di Pico, non una conseguenza
 *      dell'averlo riempito, e `e2e/call-screen-order.spec.ts` pinna l'ordine
 *      verticale che lui ha deciso.
 * Il tavolo (scarsità, war board, squadre) non è più qui in mezzo: sta dietro
 * un gesto solo, fuori da questo pannello — vedi renderTableDetail().
 */
function renderMomentoChiamata(
  aState: AuctionState,
  scarcity: Readonly<Record<Role, RoleScarcity>>,
): HTMLElement {
  const wrap = document.createElement("div");
  // LA COLONNA DELLA CHIAMATA HA UN NOME PERCHÉ IL BUDGET VERTICALE HA
  // UN LIBRO MASTRO. `e2e/call-screen-budget.spec.ts` raccoglie i blocchi di
  // questa schermata PER FORMA (ogni figlio di questo contenitore, qualunque
  // cosa sia) e non da un elenco: è l'unico modo che regge il blocco che
  // ancora non esiste — arriva come un figlio in più e viene misurato senza
  // che nessuno debba ricordarsi di dichiararlo. Gli id qui sotto sono le
  // ancore con cui ogni blocco si riconosce nella sua riga del mastro
  // (`src/ui/callScreenBudget.ts`): senza id un blocco non è attribuibile, e
  // il mastro lo boccia invece di lasciar pagare il conto all'ultimo arrivato.
  wrap.id = "call-screen-column";

  const eyebrow = document.createElement("div");
  eyebrow.id = "call-screen-eyebrow";
  eyebrow.className = "panel-title";
  eyebrow.style.marginBottom = "14px";
  eyebrow.textContent = "RICERCA GIOCATORE";
  wrap.appendChild(eyebrow);

  // Search row
  const row = document.createElement("div");
  row.id = "call-search-row";
  row.className = "form-row";

  // Player name input
  const nameGroup = document.createElement("div");
  nameGroup.style.cssText = `flex:2;min-width:200px;`;
  const nameLabel = document.createElement("div");
  nameLabel.className = "field-label";
  nameLabel.textContent = "Nome giocatore";
  const nameInput = document.createElement("input");
  nameInput.id = "search-player";
  nameInput.name = "search-player";
  nameInput.type = "text";
  nameInput.placeholder = "es. Strefezza";
  nameInput.value = state.call.playerName;
  nameInput.className = "field-input";
  nameInput.addEventListener("input", (e) => {
    // Live-updates the Listone below as you type (see filterListonePool in
    // renderListoneSvincolati call below) — cursor position is preserved
    // across the re-render, see render().
    state.call.playerName = (e.target as HTMLInputElement).value;
    state.callInteractions += 1;
    state.poolPage = 1;
    render();
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") launchAsta();
  });
  nameGroup.appendChild(nameLabel);
  nameGroup.appendChild(nameInput);

  // Role selector
  const roleGroup = document.createElement("div");
  roleGroup.style.cssText = `flex:1;min-width:130px;`;
  const roleLabel = document.createElement("div");
  roleLabel.className = "field-label";
  roleLabel.textContent = "Ruolo";
  const roleSelect = document.createElement("select");
  roleSelect.id = "search-role";
  roleSelect.name = "search-role";
  roleSelect.className = "field-input";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Tutti";
  roleSelect.appendChild(optAll);
  for (const r of ROLES) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = `${r} — ${ROLE_LABEL_SING[r]}`;
    if (state.call.role === r) opt.selected = true;
    roleSelect.appendChild(opt);
  }
  roleSelect.addEventListener("change", (e) => {
    state.call.role = (e.target as HTMLSelectElement).value as Role | "";
    state.callInteractions += 1;
    state.poolPage = 1;
    render();
  });
  roleGroup.appendChild(roleLabel);
  roleGroup.appendChild(roleSelect);

  // Club selector — populated from the clubs actually present in the
  // currently loaded pool (deduped, sorted), NOT from the hardcoded
  // SERIE_A_CLUBS_2026_27 season list. Audit #231 round 2, finding D7: the
  // hardcoded list left up to 85/532 real-listone players unfilterable by
  // club whenever the loaded pool's clubs diverged from that fixed set
  // (promotions/relegations, a stale season, a private deposit). serieA.ts
  // stays the source for club logos only (renderClubBadge/clubBadgeHtml
  // elsewhere in this file) — never for this filter's option list.
  const clubGroup = document.createElement("div");
  clubGroup.style.cssText = `flex:1;min-width:150px;`;
  const clubLabel = document.createElement("div");
  clubLabel.className = "field-label";
  clubLabel.textContent = "Squadra (Serie A)";
  const clubSelect = document.createElement("select");
  clubSelect.id = "search-club";
  clubSelect.name = "search-club";
  clubSelect.className = "field-input";
  const optAllClubs = document.createElement("option");
  optAllClubs.value = "";
  optAllClubs.textContent = "Tutte";
  clubSelect.appendChild(optAllClubs);
  const poolClubs = [...new Set(state.pool.map((p) => p.club))].sort((a, b) =>
    a.localeCompare(b, "it"),
  );
  for (const club of poolClubs) {
    const opt = document.createElement("option");
    opt.value = club;
    opt.textContent = club;
    if (state.call.club === club) opt.selected = true;
    clubSelect.appendChild(opt);
  }
  // A selected club no longer present in the currently loaded pool (e.g. the
  // pool was reloaded/replaced after the filter was set) still needs to show
  // correctly here, not silently fall back to "Tutte" — otherwise the
  // visible select would desync from state.call.club.
  if (state.call.club && !poolClubs.includes(state.call.club)) {
    const opt = document.createElement("option");
    opt.value = state.call.club;
    opt.textContent = state.call.club;
    opt.selected = true;
    clubSelect.appendChild(opt);
  }
  clubSelect.addEventListener("change", (e) => {
    state.call.club = (e.target as HTMLSelectElement).value;
    state.callInteractions += 1;
    state.poolPage = 1;
    render();
  });
  clubGroup.appendChild(clubLabel);
  clubGroup.appendChild(clubSelect);

  // Avvia button — disabled until the search bar exactly matches a player
  // clicked in the Listone below (see isCallCorrelated): the search can
  // only "start" from a listone player, never from free-typed text alone.
  const correlated = isCallCorrelated(state.call);
  const avviaBtn = document.createElement("button");
  avviaBtn.textContent = "Avvia →";
  avviaBtn.disabled = !correlated;
  avviaBtn.className = "btn btn--primary";
  avviaBtn.style.flex = "none";
  avviaBtn.title = correlated
    ? ""
    : "Seleziona un giocatore cliccandolo nel listone qui sotto per abilitare l'avvio.";
  avviaBtn.addEventListener("click", launchAsta);

  // Reset — clears a wrong/stale selection (search fields + selectedPlayer +
  // status filter) without touching the event log/budget/roster. Always
  // available, not just when something is set: a no-op reset is harmless.
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "✕ Reset";
  resetBtn.title =
    "Cancella ricerca e selezione corrente (nessuna azione sullo storico acquisti)";
  resetBtn.style.cssText = `background:transparent;color:${C.textDim};font-size:12.5px;font-weight:600;padding:10px 14px;border-radius:7px;border:1px solid ${C.border};cursor:pointer;flex:none;`;
  resetBtn.addEventListener("click", resetListoneSearch);

  row.appendChild(nameGroup);
  row.appendChild(roleGroup);
  row.appendChild(clubGroup);
  row.appendChild(avviaBtn);
  row.appendChild(resetBtn);
  wrap.appendChild(row);

  const hint = document.createElement("div");
  hint.id = "call-search-hint";
  hint.className = "hint-text";
  hint.style.marginTop = "8px";
  const roleError = state.call.selectedPlayer
    ? requiredRoleError(state.call.role)
    : null;
  if (roleError) {
    hint.setAttribute("role", "alert");
    hint.style.color = C.stopRed;
    hint.textContent = roleError;
  } else if (correlated && state.call.selectedPlayer) {
    hint.style.color = C.green;
    hint.textContent = `✓ Selezionato dal listone: ${state.call.selectedPlayer.name} (${state.call.selectedPlayer.role} — ${state.call.selectedPlayer.club}). Premi Avvia o Invio.`;
  } else {
    hint.textContent =
      "Filtra per nome/ruolo/squadra, poi clicca il giocatore nel listone qui sotto per selezionarlo: solo così l'asta può partire.";
  }
  wrap.appendChild(hint);

  const interactionCount = document.createElement("div");
  interactionCount.id = "call-interaction-count";
  interactionCount.className = "hint-text";
  interactionCount.textContent = `Interazioni chiamata: ${state.callInteractions}`;
  wrap.appendChild(interactionCount);

  // D7 Binario A — "Contesto chiamata": read-only, on-demand, and only for a
  // player Owner has already selected. No selection, no panel: there is no
  // subject to give context for, and offering one would edge towards
  // suggesting whom to call.
  const selected = state.call.selectedPlayer;
  if (selected) {
    wrap.appendChild(
      renderNominationContextPanel(
        {
          playerName: selected.name,
          club: selected.club,
          role: selected.role,
          open: state.nominationContextOpen,
          scarcity: scarcity[selected.role],
          poolLoaded: state.pool.length > 0,
          opponents: opponentTier1(aState, SELF_ID),
          teamLabels: seatLabelMap(),
          priceFacts: rolePriceFacts(state.log, selected.role),
          topAssigned: nominationContextTopAssigned(selected.role),
        },
        toggleNominationContext,
      ),
    );

    // ── PERCHÉ QUI NON C'È LA SCHEDA DEL GIOCATORE ─────────────────────────
    //
    // C'era, da #333 fino al 2026-08-29: il riquadro INSIGHT GIOCATORE col
    // radar della pagella, montato subito sotto CONTESTO CHIAMATA. Pico l'ha
    // spostato — «si visualizza durante la scelta del giocatore mentre
    // dovrebbe vedersi durante l'asta dentro #call-card come secondo figlio» —
    // e ora vive là, attaccato al nome del chiamato (`renderMomentoAsta`).
    //
    // La ragione regge: quel riquadro si legge mentre qualcuno urla un prezzo,
    // non mentre si scorre l'elenco per decidere chi chiamare. Qui parlava di
    // un giocatore che nessuno aveva ancora chiamato, e costava 151px alla
    // schermata più affollata del prodotto — fino a 1109 con una scheda piena
    // in pagina, che era il numero dichiarato come non ancora misurato.
    //
    // NON È UNA RESA IN MENO, È L'UNICA RESA. Restava il vincolo che i due
    // momenti non fossero mai in pagina insieme, perché gli id sono gli stessi;
    // con un posto solo il vincolo non serve più a nessuno.
    //
    // La riga `scheda-esperto` del libro mastro del budget verticale
    // (src/ui/callScreenBudget.ts) è stata tolta insieme al blocco: un mastro
    // che continuasse ad allocare l'altezza di un blocco che qui non c'è
    // direbbe il falso sul totale di questa schermata.
  }

  // Suggested player block — design slot "CHI CHIAMARE ORA".
  // Honest placeholder: there is NO suggestion engine yet (richiede dati reali +
  // gate non attivi). Mostriamo il blocco in modo stabile, senza fingere una
  // predizione. Non è una raccomandazione.
  const suggested = document.createElement("div");
  suggested.id = "suggested-player";
  suggested.style.cssText = `background:${C.panelInner};border:1px solid ${C.border};border-radius:8px;padding:12px 16px;margin-top:18px;`;
  // PRIMA METÀ — «chi chiamare per me». Il segnaposto onesto che stava qui non
  // c'è più: al suo posto c'è il sottoblocco vero, e il segnaposto diceva «il
  // motore richiede dati reali, non ancora abilitati» di una cosa che adesso i
  // dati ce li ha — Qt.A del listone, log d'asta, piano rosa dichiarato.
  //
  // NON È IL RADAR OCCASIONI DEL MOTORE, e la differenza non è di aritmetica ma
  // di domanda. La sottrazione è la STESSA (`surplusOverAnchor`,
  // packages/engine/src/opportunities.ts, condivisa e non copiata), ma il radar
  // ne fa una condizione d'ingresso — chi non ha surplus positivo non è
  // un'occasione — mentre qui il surplus ORDINA e non ESCLUDE: la domanda è
  // «chi chiamare adesso», e un giocatore che il piano copre resta chiamabile
  // anche se costa quanto vale. L'ordine dichiarato sta in
  // src/perMeCandidates.ts, scritto criterio per criterio nella nota che il
  // sottoblocco stampa.
  //
  // `onSelect` è `selectListonePlayer`, come per la seconda metà: L'UNICA via
  // che arma la CTA «Avvia», riusata e non duplicata.
  const suggestedFirst = document.createElement("section");
  suggestedFirst.id = "suggested-player-mine";
  // L'occhiello porta il titolo CONDIVISO (src/ui/schedaCard.ts) e non più uno
  // `style.cssText` a mano: era la terza copia della stessa forma, ed era già
  // divergente dalle altre due (0.06em di spaziatura invece di 0.04em).
  //
  // LA MISURA, perché una riga in più qui la pagherebbe il mastro del budget:
  // rimisurato a 390×844 dopo il cambio, lo span della schermata di chiamata è
  // IDENTICO — 1654px allo stato `ricerca`, gli stessi pin di
  // e2e/call-screen-budget.spec.ts, nessun numero del mastro toccato.
  // L'occhiello sta sulle stesse righe con entrambe le spaziature, e i 2px di
  // margine in più si perdono nel collasso col `margin-top` di `.per-me`.
  suggestedFirst.appendChild(
    renderSchedaCardTitle("GIOCATORE SUGGERITO — CHI CHIAMARE ORA", {
      id: "suggested-player-mine-title",
      tag: "div",
    }),
  );
  suggestedFirst.appendChild(
    renderPerMeSection(perMeSectionProps(aState), selectListonePlayer),
  );
  suggested.appendChild(suggestedFirst);
  // SECONDA METÀ — «chi chiamare per far spendere gli altri». `onSelect` è
  // `selectListonePlayer`, cioè L'UNICA via che arma la CTA «Avvia»: il
  // candidato È una riga di listone, quindi la stessa funzione si applica senza
  // adattatori e non nasce una seconda superficie di selezione.
  suggested.appendChild(
    renderBaitSection(baitSectionProps(aState), selectListonePlayer),
  );
  wrap.appendChild(suggested);

  // Il listone sta SOTTO il blocco del giocatore suggerito (richiesta di Pico,
  // 2026-08-17). L'ordine verticale della schermata è una decisione di
  // prodotto e vive qui, nell'ordine degli appendChild: la ricerca resta in
  // cima — è la ragione per cui la schermata esiste, e `e2e/call-screen-order.
  // spec.ts` la tiene sopra la piega — poi il contesto della chiamata, poi il
  // segnaposto del suggerito, e infine la tabella da cui si seleziona.
  const listoneWrap = document.createElement("div");
  // Ancora stabile per l'ordine verticale: `e2e/call-screen-order.spec.ts`
  // confronta la posizione di questo blocco con quella di `#suggested-player`,
  // e senza un id il confronto dovrebbe appoggiarsi a una classe di layout
  // interna al listone, che può cambiare senza che l'ordine cambi.
  listoneWrap.id = "listone-block";
  listoneWrap.style.cssText = `margin-top:18px;`;
  const assignedKeys = new Set(aState.purchasedPlayerIds);
  const displayPool = filterListonePool(
    state.pool,
    {
      text: state.call.playerName,
      role: state.call.role,
      club: state.call.club,
      status: state.poolStatusFilter,
    },
    assignedKeys,
  );
  // Un lookup solo per tutto il render, e la sua memo NON muore con il render:
  // vive in src/listoneRowSignals.ts, indicizzata sull'identità di (pool,
  // deposito, risposte di Pico). Copre sia le righe a schermo sia la passata
  // della nota, e un tasto nella ricerca non ne rifà nessuna.
  const signalsInput = listoneSignalsInput();
  const rowSignals = listoneRowSignalsLookup(signalsInput);
  listoneWrap.appendChild(
    renderListoneSvincolati(
      {
        pool: state.pool,
        displayPool,
        loadError: state.poolLoadError,
        sourceNote: listoneSourceNote(
          state.poolSource,
          state.poolModifiedAt,
          poolHasAppealIndex(state.pool),
        ),
        appealIndexNote: listoneAppealIndexNote(state.pool),
        genForecastNote: listoneGenForecastNote(state.pool),
        // I conteggi di #33 girano solo quando c'è qualcosa da contare: la
        // nota lo dice, e oggi dice che i voti non sono ancora estratti.
        expertSignalsNote: listoneExpertSignalsNote(
          listoneExpertPagellaViews(signalsInput),
        ),
        sort: state.poolSort,
        visibleColumnKeys: listoneVisibleColumnKeys(),
        rowSignals,
        columnPrefsPersisted: state.poolColumnPrefsPersisted,
        page: state.poolPage,
        columnPanelOpen: state.poolColumnPanelOpen,
        manualOverrideOpen: state.poolManualOverrideOpen,
        assignedKeys,
        statusFilter: state.poolStatusFilter,
        statusFilterOpen: state.poolStatusFilterOpen,
        // Lo STESSO campo che alimenta il menu «Ruolo» della ricerca e il
        // filtro qui sotto: gli interruttori sono una maniglia in più sulla
        // stessa porta, non una seconda porta.
        roleFilter: state.call.role,
        selectedKey: state.call.selectedPlayer
          ? listonePlayerKey(state.call.selectedPlayer)
          : null,
      },
      {
        onFileText: loadPoolFromText,
        onSortColumn: sortListoneByColumn,
        onToggleColumn: toggleListoneColumn,
        onForget: forgetPool,
        onChangePage: changePoolPage,
        onToggleColumnPanel: toggleListoneColumnPanel,
        onToggleManualOverride: toggleListoneManualOverride,
        onStatusFilterChange: setPoolStatusFilter,
        onToggleStatusFilter: togglePoolStatusFilter,
        onRoleFilterChange: setListoneRoleFilter,
        onSelectPlayer: selectListonePlayer,
      },
    ),
  );
  wrap.appendChild(listoneWrap);

  // Focus the search input only on the first render after entering this
  // moment (boot, "← Indietro", or right after a completed purchase) — never
  // on a re-render triggered by typing/selecting here, which would otherwise
  // steal focus back from whatever the user is doing on every keystroke.
  // Reuses the same focusAfterRender() helper the rest of the file uses for
  // one-shot post-render focus. See #219.
  if (state.chiamataFocusPending) {
    state.chiamataFocusPending = false;
    focusAfterRender("search-player");
  }

  return wrap;
}

/**
 * Il testo scritto SUL bottone del terzo portiere a 0 — una costante e non tre
 * stringhe uguali, perché il messaggio d'errore del prezzo digitato lo cita
 * alla lettera: se il bottone cambia nome, il messaggio che ci manda l'operatore
 * cambia con lui e non può indicare un comando che non esiste più.
 */
const THIRD_GOALKEEPER_ZERO_LABEL = "Dichiaro e registro a 0 cr";

/**
 * La condizione STRUTTURALE del terzo portiere: questo acquisto è l'ultimo
 * slot P della squadra selezionata. È l'unica cosa che decide se il gesto a 0
 * si vede a schermo — l'ammissione resta di purchaseFeasibility(). Sta in una
 * funzione sola perché la usano tre punti (bottone, nota di max_safe,
 * messaggio d'errore del prezzo) e devono dire tutti la stessa cosa.
 */
function isThirdGoalkeeperSlot(assignTeam: TeamState | undefined): boolean {
  return (
    state.call.role === "P" &&
    assignTeam !== undefined &&
    assignTeam.slotsRemaining.P === 1
  );
}

/**
 * L'acquisto ESATTO che il bottone registrerebbe adesso, o `null` quando non
 * c'è un giocatore selezionato. Costruito qui una volta sola: la schermata lo
 * usa per CHIEDERE a purchaseFeasibility() se quel gesto passerebbe, e
 * registerThirdGoalkeeperZero() usa lo stesso oggetto per commetterlo. Testo a
 * schermo e comportamento del click nascono così dalla stessa proposta, non da
 * due derivazioni che possono divergere.
 */
function thirdGoalkeeperZeroProposal(): ProposedPurchase | null {
  const selectedPlayer = state.call.selectedPlayer;
  if (!selectedPlayer) return null;
  return {
    playerId: listonePlayerKey(selectedPlayer),
    role: selectedPlayer.role,
    fantaTeamId: state.assign.fantaTeamId,
    price: 0,
    declareThirdGoalkeeperZero: true,
  };
}

// ── «Dopo l'acquisto»: quanto resta se lo prendi a questa cifra ─────────────
// La quarta domanda del tavolo. Budget, Spesi e Slot dicono lo stato ADESSO;
// nessun pannello diceva lo stato che si otterrebbe pagando la cifra che si sta
// digitando, e a due secondi dal rilancio quel conto si faceva a mente.
//
// DOVE STA, E PERCHÉ LÌ. Dentro la riga ASSEGNA A, fra il campo del prezzo e
// «Registra acquisto», dove occupa lo spazio orizzontale che quella riga aveva
// già libero e non allunga la schermata di una riga.
//
// La motivazione originale era un'altra e non vale più: quando questo blocco è
// nato, «Prezzo da pagare» era in cima allo schermo e il campo del prezzo
// 1000px più giù, quindi mentre si digitava quel blocco era già fuori (bordo
// superiore a −65px a 1440×900) e una proiezione lì non l'avrebbe vista
// nessuno. Con #331 punti 2-3 i due stanno nella stessa scheda e sono in vista
// insieme: la posizione resta questa perché è quella che non costa altezza e
// che mette la conseguenza PRIMA del bottone nell'ordine di lettura e di
// tabulazione, non più perché l'alternativa fosse invisibile.
//
// DI CHI PARLA. Della squadra selezionata nel menu ASSEGNA A — quella che sta
// per ricevere l'acquisto — e lo dice per esteso nell'etichetta. Sulla stessa
// schermata maxSafe() è già chiamata con due ricette diverse (la squadra del
// menu e la squadra dell'utente): una proiezione senza nome sarebbe una terza
// lettura indistinguibile dalle altre due.

/** Il guscio DOM del blocco. Il testo lo scrive fillAssignAfter, sia al primo
 *  render sia a ogni tasto battuto nel campo del prezzo. */
function renderAssignAfterBlock(): HTMLElement {
  const box = document.createElement("div");
  box.id = "assign-after";
  box.className = "assign-after";
  // Cambia mentre si digita SENZA re-render (vedi il listener di #assign-price),
  // quindi va annunciato e non solo ridipinto — stesso trattamento della
  // headline del pannello AVVERSARI, che si aggiorna con lo stesso idioma.
  box.setAttribute("role", "status");
  box.setAttribute("aria-live", "polite");
  box.setAttribute("aria-atomic", "true");

  const label = document.createElement("div");
  label.id = "assign-after-label";
  label.className = "assign-after__label";

  const value = document.createElement("div");
  value.id = "assign-after-value";
  value.className = "assign-after__value";

  const alarm = document.createElement("div");
  alarm.id = "assign-after-alarm";
  alarm.className = "assign-after__alarm";

  box.append(label, value, alarm);
  return box;
}

/**
 * La proiezione da mostrare adesso: squadra del menu ASSEGNA A (con la squadra
 * dell'utente come ripiego solo se quell'id non esiste nello stato, esattamente
 * come fa il blocco «Prezzo da pagare» più in alto), ruolo del giocatore
 * chiamato, prezzo grezzo così com'è nel campo. `null` solo quando la schermata
 * non porta un ruolo — irraggiungibile dalla UI, perché launchAsta richiede una
 * chiamata correlata, ma il tipo lo prevede.
 */
function assignAfterProjection(
  aState: AuctionState,
  team: TeamState | undefined,
): PostPurchaseProjection | null {
  const assignTeam = aState.teams[state.assign.fantaTeamId] ?? team;
  const role = state.call.role;
  if (assignTeam === undefined || role === "") return null;
  return projectAfterPurchase(assignTeam, role as Role, state.assign.price);
}

/**
 * Scrive le tre righe nel blocco passato. Separata dal costruttore per lo
 * stesso motivo di fillOpponentReach: il campo del prezzo non chiama render()
 * — lo farebbe perdere fuoco e cursore in mezzo a un rilancio — quindi la
 * proiezione si aggiorna con la stessa toppa in place che `#price-display` usa
 * da sempre. La riga d'allarme resta nel DOM anche vuota: svuotarne il testo la
 * fa collassare da sé (`.assign-after__alarm:empty`), e non c'è un secondo ramo
 * di costruzione da tenere allineato al primo.
 *
 * Il parametro è IL BLOCCO, non un suo antenato, e non è un dettaglio:
 * `querySelector` guarda solo i discendenti, quindi una versione che cercava
 * `#assign-after` dentro il blocco stesso lo mancava e lasciava la proiezione
 * muta a schermo pur avendola calcolata. Successo davvero, alla prima stesura;
 * la spec e2e ora lo intercetta perché asserisce il TESTO, non la presenza.
 */
function fillAssignAfter(
  box: HTMLElement,
  projection: PostPurchaseProjection | null,
): void {
  const label = box.querySelector("#assign-after-label");
  const value = box.querySelector("#assign-after-value");
  const alarm = box.querySelector("#assign-after-alarm");
  if (label === null || value === null || alarm === null) return;
  if (projection === null) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  label.textContent = projectionLabelText(
    displayTeamLabel(projection.fantaTeamId),
  );
  value.textContent = projectionValueText(projection);
  const alarmText = projectionAlarmText(projection);
  alarm.textContent = alarmText;
  box.classList.toggle("assign-after--alarm", alarmText !== "");
}

function renderMomentoAsta(
  aState: AuctionState,
  team: TeamState | undefined,
): HTMLElement {
  const wrap = document.createElement("div");

  // Back link
  const back = document.createElement("div");
  back.style.cssText = `font-size:12.5px;font-weight:600;color:${C.textAccent};cursor:pointer;margin-bottom:14px;`;
  back.textContent = "← Indietro alla ricerca";
  back.tabIndex = 0;
  back.setAttribute("role", "button");
  back.addEventListener("click", () => {
    state.moment = "chiamata";
    state.chiamataFocusPending = true;
    state.error = "";
    scrollToTop();
    render();
  });
  back.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      back.click();
    }
  });
  wrap.appendChild(back);

  // ── LA SCHEDA DEL GIOCATORE ────────────────────────────────────────────────
  // #331 punti 2 e 3, e il numero che li ha resi urgenti. Misurato con Chromium
  // su pool sintetico da 532 righe e log vuoto: «ASSEGNA A» — il gesto per cui
  // questa schermata esiste — cominciava a 1154px in produzione (254px sotto la
  // piega a 1440×900, 74px sotto a 1920×1080) e a 1262px una volta arrivato il
  // pannello FASCIA DEL CHIAMATO (362px e 182px sotto). Ogni corsia misurava il
  // proprio pannello; nessuna misurava la schermata risultante.
  //
  // La scheda porta, in quest'ordine, le tre cose che si guardano nei due
  // secondi in cui qualcuno urla un prezzo: chi è chiamato e quanto costa
  // (con «max bid sicuro» accanto), come sta il mercato PER QUEL RUOLO, e il
  // gesto che registra l'acquisto. Tutto il resto della schermata sta sotto.
  //
  // PERCHÉ UNA SCHEDA E NON TRE BLOCCHI SPOSTATI. Sopra il gesto resta soltanto
  // la riga d'identità del giocatore: un pannello aggiunto domani finisce sotto
  // la scheda e non può più spingere «ASSEGNA A» fuori dallo schermo. È
  // l'invariante che e2e/asta-gesto-principale.spec.ts asserisce per ordine,
  // non solo per pixel, proprio perché la schermata continuerà a crescere.
  const card = document.createElement("section");
  card.id = "call-card";
  card.className = "call-card";
  card.setAttribute(
    "aria-label",
    "Giocatore chiamato: prezzo, momento del ruolo e assegnazione",
  );

  // Player info + maxSafe row
  const topRow = document.createElement("div");
  topRow.style.cssText = `display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:18px;`;

  const playerInfo = document.createElement("div");
  const callLabel = document.createElement("div");
  callLabel.className = "field-label";
  callLabel.textContent = "Giocatore chiamato";
  const callName = document.createElement("div");
  callName.style.cssText = `font-size:20px;font-weight:700;color:${C.textPrimary};display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;
  callName.append(state.call.playerName || "—");
  if (state.call.role) {
    const roleSpan = document.createElement("span");
    roleSpan.style.cssText = `font-size:14px;font-weight:400;color:${C.textSec};display:inline-flex;align-items:center;gap:5px;`;
    roleSpan.append(
      "— ",
      renderRoleChip(state.call.role),
      ` ${ROLE_LABEL_SING[state.call.role as Role]}`,
    );
    callName.appendChild(roleSpan);
  }
  if (state.call.club) {
    const clubSpan = document.createElement("span");
    clubSpan.style.cssText = `font-size:14px;font-weight:400;color:${C.textSec};display:inline-flex;align-items:center;gap:5px;`;
    clubSpan.append(
      "· ",
      renderClubBadge(state.call.club),
      ` ${state.call.club}`,
    );
    callName.appendChild(clubSpan);
  }
  playerInfo.appendChild(callLabel);
  playerInfo.appendChild(callName);

  // maxSafe display — must reflect the team actually selected in the
  // "Assegna a" form below (state.assign.fantaTeamId), not always "my" team:
  // registering an opponent's purchase has to show their own ceiling.
  // purchaseFeasibility (doAssign) already keys off this same id — only this
  // display previously used Owner's team unconditionally. See #219.
  const maxSafeWrap = document.createElement("div");
  maxSafeWrap.style.cssText = `text-align:right;`;
  const assignTeam = aState.teams[state.assign.fantaTeamId] ?? team;

  // IL GESTO A 0, DECISO UNA VOLTA SOLA PER TUTTA LA SCHERMATA.
  // `zeroGestureAvailable` è la condizione strutturale (si vede il bottone);
  // `zeroAdmitted` è la risposta di purchaseFeasibility() alla proposta esatta
  // che il click commetterebbe — cioè il comportamento vero, non una sua
  // seconda derivazione. La nota di max_safe qui sotto legge il secondo, così
  // non può dichiarare indisponibile un acquisto che il bottone registrerebbe.
  const zeroGestureAvailable = isThirdGoalkeeperSlot(assignTeam);
  const zeroProposal = zeroGestureAvailable
    ? thirdGoalkeeperZeroProposal()
    : null;
  const zeroAdmitted =
    zeroProposal !== null && purchaseFeasibility(aState, zeroProposal).ok;

  if (assignTeam && state.call.role) {
    const ms = maxSafe(assignTeam, state.call.role as Role);
    const priceLabel = document.createElement("div");
    priceLabel.className = "field-label";
    priceLabel.textContent = "Prezzo da pagare";
    const priceDisplay = document.createElement("div");
    priceDisplay.id = "price-display";
    priceDisplay.className = "kpi-value";
    priceDisplay.style.cssText = `font-size:32px;color:${C.textPrimary};background:${C.panelInner};border-radius:7px;padding:6px 16px;display:inline-block;`;
    priceDisplay.textContent = state.assign.price
      ? `${state.assign.price} cr`
      : "— cr";
    // #333 §A — QUESTO NUMERO SI CHIAMA COME SI CHIAMA ALTROVE. Era «max per
    // completare la rosa di X»: terza formulazione per la cifra che la fascia
    // critica chiama «Max bid sicuro» e la war board «max bid», e la sola per
    // cui src/ui/budgetLabels.ts dichiarava ancora un'eccezione «da allineare
    // quando quei file si toccano». Si stanno toccando: l'eccezione è rientrata
    // e l'etichetta viene dalla costante, non da una stringa scritta a mano.
    const maxSafeNote = document.createElement("div");
    maxSafeNote.id = "max-safe-note";
    maxSafeNote.style.cssText = `font-size:11.5px;color:${C.textSec};margin-top:5px;`;
    // «n/d» da solo dice "nessun acquisto possibile qui", ed è vero per ogni
    // prezzo digitabile (il minimo è 1 cr) ma NON quando il terzo portiere a 0
    // è ancora ammesso. Succede in un caso limite reale: budget residuo
    // esattamente pari agli altri slot da riempire (budgetResidual ===
    // otherSlots) — max_safe vale 0 e non è offribile, mentre l'acquisto a 0
    // non consuma nulla e resta ammesso. Prima la nota diceva «n/d» mentre il
    // bottone sotto registrava davvero: schermata e comportamento in
    // contraddizione. La coda qui sotto la toglie, e la toglie solo quando è
    // purchaseFeasibility() a dire di sì.
    const ceiling = ms.biddable ? `${ms.maxSafe} cr` : "n/d";
    const zeroTail =
      !ms.biddable && zeroAdmitted
        ? " — resta solo il terzo portiere a 0 cr"
        : "";
    maxSafeNote.textContent = `${MAX_BID_LABEL_LONG} di ${displayTeamLabel(state.assign.fantaTeamId)}: ${ceiling}${zeroTail}`;
    maxSafeWrap.appendChild(priceLabel);
    maxSafeWrap.appendChild(priceDisplay);
    maxSafeWrap.appendChild(maxSafeNote);
  }

  topRow.appendChild(playerInfo);
  topRow.appendChild(maxSafeWrap);
  card.appendChild(topRow);

  // LA SCHEDA DEL GIOCATORE CHIAMATO — secondo figlio di #call-card, subito
  // sotto la riga d'identità. Posto chiesto da Pico il 2026-08-29.
  //
  // Stava SOTTO la scheda, fra la fascia del chiamato e la war board, e stava
  // anche nella schermata di chiamata: due posti, nessuno dei due dentro la
  // scheda del giocatore di cui parla. Qui invece è attaccato al nome che
  // apre la scheda, ed è l'ordine in cui la si legge: chi è chiamato → che
  // cosa dicono gli esperti di lui → quanto vale → come sta il mercato del suo
  // ruolo → il gesto che registra l'acquisto.
  //
  // STA SOPRA IL GESTO, quindi la sua altezza è un vincolo e non un dettaglio:
  // e2e/asta-gesto-principale.spec.ts asserisce che «ASSEGNA A» resti entro una
  // distanza dichiarata dal bordo del documento, ed è quel test — non questo
  // commento — a dire se il blocco ci sta.
  card.appendChild(renderPlayerInsightsBlock(playerInsightProps()));

  // RIQUADRO DEL VALORE — i quattro numeri, dentro la scheda del chiamato e
  // SUBITO sotto la riga d'identità e il prezzo.
  //
  // PERCHÉ QUI E NON ALTROVE. `docs/DECISIONS.md` §«Scarsità solo dal tavolo»
  // vale solo per la scarsità, non per il valore mostrato» e §"Estensione della
  // deroga display-only dell'indice" nominano entrambe lo stesso posto — «il
  // riquadro del valore della scheda del giocatore chiamato» —, ed è anche
  // l'unico punto dell'app in cui la domanda «quanto vale» viene fatta con
  // qualcuno che sta urlando un prezzo. L'ordine di lettura della scheda
  // diventa: chi è chiamato e quanto costa adesso → quanto vale → come sta il
  // mercato di quel ruolo → il gesto che registra l'acquisto.
  //
  // STA SOPRA IL GESTO, quindi il suo costo in altezza è un vincolo e non un
  // dettaglio: e2e/asta-gesto-principale.spec.ts asserisce che «ASSEGNA A»
  // resti entro 560px dal bordo del documento, ed è la ragione per cui le
  // quattro celle stanno su una riga sola (src/styles/asta.css).
  card.appendChild(renderValueBoxBlock(valueBoxProps(aState)));

  // MOMENTO DELL'ASTA — ridotto al ruolo chiamato, dentro la scheda (#331
  // punto 2). Le altre tre celle di ruolo, il censimento MERCATO e la nota
  // metodologica restano nel DOM dietro un gesto: la motivazione per esteso e
  // il vincolo «ridurre non toglie informazione» stanno sopra
  // renderMomentInsightsBlock in src/ui/views.ts.
  card.appendChild(
    renderMomentInsightsBlock({
      scarcity: roleScarcity(aState, scarcityPool()),
      poolLoaded: state.pool.length > 0,
      calledRole: state.call.role,
      pressure: residualPressure(aState),
      detailOpen: state.momentFactsDetailOpen,
      onToggleDetail: toggleMomentFactsDetail,
    }),
  );

  // ── ASSEGNA A — il gesto, dentro la scheda e rimpicciolito ────────────────
  // #331 punto 3. Era una sezione a sé in fondo alla pagina, sotto la griglia a
  // due colonne e (dal ramo delle fasce) sotto anche FASCIA DEL CHIAMATO. Le
  // stesse tre cose — squadra, prezzo, registrazione — e la proiezione «dopo
  // l'acquisto» stanno adesso nella scheda, subito sotto ciò che si sta
  // comprando e a che punto è il mercato di quel ruolo.
  //
  // RIMPICCIOLITO, NON SVUOTATO: nessun controllo, nessuna etichetta e nessuna
  // nota sono spariti. È cambiata la scatola — il titolo e la nota di esito
  // condividono una riga sola invece di prenderne due, e la riga di campi non
  // porta più il bordo/padding di una sezione separata, perché la scheda che
  // la contiene fa già quel lavoro.
  const divider = document.createElement("div");
  divider.id = "assign-block";
  divider.className = "assign-block";

  const assignHead = document.createElement("div");
  assignHead.className = "assign-block__head";

  const assignLabel = document.createElement("div");
  assignLabel.className = "panel-title";
  assignLabel.textContent = "ASSEGNA A";
  assignHead.appendChild(assignLabel);

  const headNote = document.createElement("div");
  headNote.className = "hint-text assign-block__note";
  headNote.textContent =
    "Il prezzo viene registrato nello storico; il piano rosa viene rivalutato subito dopo.";
  assignHead.appendChild(headNote);
  divider.appendChild(assignHead);

  const formRow = document.createElement("div");
  formRow.className = "form-row";

  // Team selector
  const teamGroup = document.createElement("div");
  teamGroup.style.cssText = `flex:1;min-width:160px;`;
  const teamLabel = document.createElement("div");
  teamLabel.className = "field-label";
  teamLabel.textContent = "Squadra fantacalcio";
  const teamSelect = document.createElement("select");
  teamSelect.id = "assign-team";
  teamSelect.name = "assign-team";
  teamSelect.className = "field-input";
  for (const tid of FANTA_TEAM_IDS) {
    const opt = document.createElement("option");
    opt.value = tid;
    opt.textContent =
      tid === SELF_ID ? `${displayTeamLabel(tid)} (io)` : displayTeamLabel(tid);
    if (state.assign.fantaTeamId === tid) opt.selected = true;
    teamSelect.appendChild(opt);
  }
  teamSelect.addEventListener("change", (e) => {
    state.assign.fantaTeamId = (e.target as HTMLSelectElement).value;
    // The «max bid sicuro di X» note above reads the selected team, not always
    // "my" team — it must reflect the switch. See #219.
    render();
  });
  teamGroup.appendChild(teamLabel);
  teamGroup.appendChild(teamSelect);

  // Price input
  const priceGroup = document.createElement("div");
  priceGroup.style.cssText = `flex:0 0 120px;`;
  const priceLabel = document.createElement("div");
  priceLabel.className = "field-label";
  priceLabel.textContent = "Prezzo (cr)";
  const priceInput = document.createElement("input");
  priceInput.id = "assign-price";
  priceInput.name = "assign-price";
  priceInput.type = "number";
  priceInput.min = "1";
  priceInput.step = "1";
  priceInput.setAttribute("inputmode", "numeric");
  priceInput.placeholder = "es. 25";
  priceInput.title = "Prezzo in crediti: solo numero intero positivo.";
  priceInput.value = state.assign.price;
  priceInput.className = "field-input";
  // Costruito qui perché il listener qui sotto lo aggiorna a ogni tasto.
  const assignAfter = renderAssignAfterBlock();
  fillAssignAfter(assignAfter, assignAfterProjection(aState, team));
  priceInput.addEventListener("input", (e) => {
    state.assign.price = (e.target as HTMLInputElement).value;
    // live-update maxSafe price display without full re-render
    const pd = wrap.querySelector("#price-display");
    if (pd)
      pd.textContent = state.assign.price ? `${state.assign.price} cr` : "— cr";
    // Stesso motivo, stesso idioma, per «dopo l'acquisto»: è la risposta a
    // «quanto mi resta se lo prendo A QUESTA CIFRA», quindi deve seguire la
    // cifra mentre viene battuta, non l'ultima cifra registrata.
    fillAssignAfter(assignAfter, assignAfterProjection(aState, team));
    // Il blocco AVVERSARI non viene più ridipinto qui, e l'assenza è una
    // conseguenza del cambio di mestiere, non una dimenticanza: i PRECEDENTI
    // sono del giocatore chiamato, non della cifra che si sta battendo, quindi
    // battere una cifra non ne cambia nemmeno un numero. Il blocco che stava
    // qui prima (`competitorSet`) doveva seguire il prezzo perché la sua
    // domanda conteneva il prezzo; questo no.
  });
  priceInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAssign(aState);
  });
  priceGroup.appendChild(priceLabel);
  priceGroup.appendChild(priceInput);

  // Submit button
  const submitBtn = document.createElement("button");
  submitBtn.textContent = "Registra acquisto";
  submitBtn.className = "btn btn--primary";
  submitBtn.style.flex = "none";
  submitBtn.addEventListener("click", () => doAssign(aState));

  formRow.appendChild(teamGroup);
  formRow.appendChild(priceGroup);
  // Fra il prezzo e il bottone, non dopo il bottone: l'ordine di lettura (e di
  // tabulazione) diventa «chi, quanto, cosa resta, conferma» — la conseguenza
  // si legge prima di premere, non dopo.
  formRow.appendChild(assignAfter);
  formRow.appendChild(submitBtn);
  divider.appendChild(formRow);

  // CHI ERA IN GARA — il flag al submit, DENTRO il gesto e sotto la riga di
  // campi. Sta qui e non altrove per tre motivi che si sommano:
  //
  //  1. è la marcatura DI QUESTO acquisto: metterla in un pannello a parte
  //     vorrebbe dire chiedere all'operatore di ricordarsi di tornarci;
  //  2. sotto la riga di campi, quindi il titolo «ASSEGNA A» non si sposta di
  //     un pixel — e2e/asta-gesto-principale.spec.ts misura esattamente quello;
  //  3. saltarla non costa NIENTE: non è un passo del percorso verso «Registra
  //     acquisto», è una riga che si può ignorare, e ignorarla non produce
  //     avvisi né conferme.
  divider.appendChild(
    renderInterestFlagRow({
      seatIds: interestSeatIds(),
      seatLabels: seatLabelMap(),
      marked: currentInterestMarks(),
      onToggle: toggleInterestMark,
    }),
  );

  // Terzo portiere a 0 — LEAGUE_RULES.md §6 (decisione Pico, 2026-08-15).
  // Rendered ONLY when this purchase is structurally the selected team's
  // third (last) portiere slot — `zeroGestureAvailable`, computed at the top
  // of this function and SHARED with the max_safe note above, so the two
  // cannot disagree about whether this gesture exists. That condition only
  // decides whether to SHOW the gesture; the engine call below is still the
  // sole authority on whether it is actually admitted. Everywhere else this
  // button does not exist, so there is nothing to misclick into recording a 0.
  //
  // ONE gesture, not two: this click both DECLARES (that the table-level
  // facts the engine cannot see — same real club as a portiere already on
  // the roster, no other participant interested — hold right now) AND
  // commits the purchase at price 0, in the same action. No modal, no
  // field, no second confirm — see registerThirdGoalkeeperZero below.
  if (zeroGestureAvailable) {
    const zeroWrap = document.createElement("div");
    zeroWrap.style.cssText = `margin-top:12px;padding:10px 12px;border:1px dashed ${C.accent};border-radius:7px;background:${C.panelInner};display:flex;align-items:center;gap:12px;flex-wrap:wrap;`;
    const zeroNote = document.createElement("div");
    zeroNote.style.cssText = `font-size:12px;color:${C.textSec};flex:1;min-width:220px;`;
    zeroNote.textContent = `Terzo portiere di ${displayTeamLabel(state.assign.fantaTeamId)}: se stesso club di un portiere già in rosa e nessun altro interessato (LEAGUE_RULES §6) → registralo a 0 cr.`;
    const zeroBtn = document.createElement("button");
    zeroBtn.id = "declare-third-goalkeeper-zero";
    zeroBtn.textContent = THIRD_GOALKEEPER_ZERO_LABEL;
    // PESO VISIVO = COSA FA. Questo bottone scrive nel registro degli
    // acquisti esattamente come «Registra acquisto», quindi porta la stessa
    // classe e lo stesso peso: prima era `btn--secondary`, l'aspetto di
    // un'azione minore (fantasma, bordo sottile) su un comando che invece
    // registra un acquisto. Nessun colore nuovo è stato introdotto per
    // ottenerlo — è la classe primaria che l'app già usa e che la guardia di
    // contrasto già copre. A distinguerlo dall'acquisto ordinario resta il
    // riquadro tratteggiato che lo contiene, con la sua nota.
    zeroBtn.className = "btn btn--primary";
    zeroBtn.style.flex = "none";
    zeroBtn.title =
      "Un solo click: dichiara che le condizioni del regolamento sono soddisfatte adesso e registra l'acquisto a 0 crediti. La dichiarazione resta nello storico.";
    zeroBtn.addEventListener("click", () =>
      registerThirdGoalkeeperZero(aState),
    );
    zeroWrap.appendChild(zeroNote);
    zeroWrap.appendChild(zeroBtn);
    divider.appendChild(zeroWrap);
  }

  if (state.error) {
    const errEl = document.createElement("div");
    errEl.style.cssText = `font-size:13px;color:${C.stopRed};margin-top:10px;`;
    errEl.textContent = state.error;
    divider.appendChild(errEl);
  }

  card.appendChild(divider);
  wrap.appendChild(card);

  // ── Sotto la scheda: tutto ciò che informa la decisione senza esserne il
  // gesto. L'ordine segue le quattro domande del tavolo confermate da Pico
  // (#333): la fascia del chiamato resta la più vicina al campo del prezzo,
  // perché il registro di quella fascia è il numero che si guarda mentre si
  // batte la cifra; poi la scheda esperto sul giocatore chiamato; poi chi me lo
  // contende (war board MINI, AVVERSARI). Niente di tutto questo può più
  // spingere «ASSEGNA A» sotto la piega: sta tutto DOPO la scheda che lo
  // contiene.
  wrap.appendChild(renderTierBandBlock(tierBandProps(aState)));

  // IL RIQUADRO INSIGHT NON STA PIÙ QUI: è salito DENTRO #call-card, come
  // secondo figlio (Pico, 2026-08-29). Renderlo anche qui lo duplicherebbe
  // nella stessa pagina — stessi id, due volte — che è esattamente il difetto
  // che la resa unica esisteva per non avere.

  // IL POSTO DELLA RISPOSTA LENTA — sempre presente, anche (anzi soprattutto)
  // quando non ha niente da mostrare: è la resa della regola «se non è pronta
  // lo dice invece di far aspettare». Sta SOTTO la scheda del giocatore, come
  // ogni altro riquadro: una risposta che arriva non può spingere il gesto
  // principale fuori dallo schermo, e mentre lei si prepara la schermata resta
  // interamente usabile.
  wrap.appendChild(
    renderLateAnswerBlock({
      state: lateAnswerSlot.state(),
      subjectLabel:
        state.call.playerName === ""
          ? "il giocatore chiamato"
          : state.call.playerName,
    }),
  );

  // War board MINI — #231 tranche 3, decisione di Owner #222 voce 18
  // (revisione registrata dell'invariante #86, docs/FRONTEND_STRUCTURE.md).
  // "Chi altro può ancora arrivarci, e fin dove": due numeri per squadra,
  // nessun dettaglio — il dettaglio vive nella variante COMPLETA del momento
  // di chiamata. La riga di legenda («bdg = crediti residui · max bid = …») è
  // parte di questo pannello (renderWarBoardMini) e si sposta con lui.
  wrap.appendChild(
    renderWarBoardMini(warBoardRows(aState, SELF_ID), seatLabelMap()),
  );

  // IL RUOLO STASERA — che cosa è successo al ruolo in asta stasera (quanti ne
  // sono passati, da chi, a che prezzi) e quanti posti di quel ruolo restano
  // aperti al tavolo. Sta QUI, subito sopra il blocco MOMENTO DELL'ASTA, perché
  // le due letture si leggono in fila: prima come il ruolo si è svuotato, poi
  // quanto ne resta. Sola lettura, sola aritmetica sull'event log e sul
  // censimento dei posti: nessuna quotazione di listino entra nel calcolo
  // (decisione di Pico 16/08/2026 — vedi la nota in testa a
  // src/roleDepletion.ts).
  wrap.appendChild(renderRoleDepletionBlock(roleDepletionProps(aState)));

  // AVVERSARI — auctionPrecedents(): cosa ogni avversario ha già fatto che
  // riguardi il giocatore chiamato, contato sullo storico d'asta multi-stagione
  // (packages/opponent-profiles). Prima qui c'era competitorSet(), cioè chi
  // poteva arrivare alla cifra per solo vincolo duro: quei numeri non sono
  // spariti dall'app — max bid e budget di tutte le squadre stanno nella
  // striscia WAR BOARD (MINI) qui sopra, gli slot per ruolo nella war board
  // COMPLETA del momento CHIAMATA e in AVVERSARI TIER-1 su Rose — hanno
  // smesso di essere ricontati qui (#331 punto 1).
  //
  // LA FASCIA A DUE COLONNE RESTA, con un pannello solo dentro. Non è un
  // residuo: è la casa che #331 punto 4 destina alla divisione «interessati /
  // non interessati», e toglierla adesso vorrebbe dire ricostruirla poi. Il
  // pannello superstite attraversa entrambe le colonne (.moment-blocks-grid--
  // single) invece di lasciarne una vuota; le colonne e il loro breakpoint di
  // impilamento sono quelli di prima.
  const suggestionsGrid = document.createElement("div");
  suggestionsGrid.className = "moment-blocks-grid moment-blocks-grid--single";
  suggestionsGrid.appendChild(
    renderOpponentPrecedentsBlock(opponentPrecedentsProps()),
  );
  wrap.appendChild(suggestionsGrid);

  return wrap;
}

function launchAsta(): void {
  // CTA is disabled in the UI for this exact condition (see renderMomentoChiamata) —
  // this guard is defense-in-depth against a stray Enter keypress.
  if (!isCallCorrelated(state.call)) return;
  state.callInteractions += 1;
  state.moment = "asta";
  if (!state.assign.fantaTeamId) {
    state.assign.fantaTeamId = SELF_ID;
  }
  state.assign.price = "";
  state.error = "";
  scrollToTop();
  render();
}

/**
 * Human-readable rendering of a refused purchase. Shared by the assignment
 * form and the command line so the SAME violation never gets two different
 * explanations depending on which input path produced it.
 */
function feasibilityErrorText(
  violations: readonly string[],
  role: Role,
): string {
  const msgs: Record<string, string> = {
    "unknown-team": "Squadra sconosciuta.",
    "role-full": `Nessuno slot ${ROLE_LABEL_SING[role]} disponibile per questa squadra.`,
    "duplicate-player": "Questo giocatore è già stato assegnato.",
    // Unreachable from the UI (both input paths parse the price with
    // parsePositiveIntegerPrice first), kept so a non-integer price surfaces
    // as Italian rather than as a raw violation code — same defense-in-depth
    // posture as voidErrorText's structural messages.
    "price-invalid": "Il prezzo deve essere un numero intero.",
    "price-below-floor": "Il prezzo deve essere almeno 1 cr.",
    "insufficient-budget": "Budget insufficiente per questa squadra.",
    "breaks-hard-reserve":
      "Questo acquisto renderebbe impossibile completare la rosa (hard reserve violata).",
  };
  return violations.map((v) => msgs[v] ?? v).join(" ");
}

/**
 * Shared commit path for every purchase-entry gesture in the app: the
 * typed-price form (doAssign) and the one-click third-portiere-at-0
 * declaration (registerThirdGoalkeeperZero) below. Runs the SAME
 * purchaseFeasibility() -> recordPurchase() -> saveAuctionLog() sequence
 * regardless of which gesture produced `proposed`, so `max_safe`/hard
 * reserve stay non-overridable no matter which UI path is used.
 */
function commitPurchase(
  aState: AuctionState,
  proposed: ProposedPurchase,
  role: Role,
): void {
  const feasibility = purchaseFeasibility(aState, proposed);
  if (!feasibility.ok) {
    state.error = feasibilityErrorText(feasibility.violations, role);
    render();
    return;
  }

  try {
    const newLog = recordPurchase(
      state.log,
      aState,
      proposed,
      new Date().toISOString(),
    );
    // `state.log` is the baseline this purchase was computed FROM: it is what
    // arms the optimistic-concurrency guard (audit fix 1), so a second tab
    // that moved the canonical underneath gets a refusal, not a silent
    // overwrite.
    const saveResult = saveAuctionLog(
      browserStorage,
      newLog,
      FANTA_TEAM_IDS,
      state.log,
      state.confirmations,
    );
    if (!saveResult.ok) {
      // Fail-closed: the in-memory log is never advanced past what was
      // actually persisted — no false "saved" state, no silent data loss
      // risk if the browser reloads right after this.
      handleSaveFailure(saveResult);
      render();
      return;
    }
    state.log = newLog as AuctionEvent[];
    state.persistenceError = "";
    // IL FLAG NON PUÒ FAR FALLIRE L'ACQUISTO, E QUESTO È IL PUNTO IN CUI SI
    // VEDE. L'acquisto è già registrato e persistito quando questa riga viene
    // eseguita: `recordInterestFlag` non può tornare indietro, non lancia e
    // non ha un ramo che salti il `render()` qui sotto. Se lo storage del flag
    // rifiuta la scrittura, la marcatura resta in coda in memoria e la
    // schermata lo dice — l'acquisto resta registrato in ogni caso.
    //
    // Le marcature si leggono PRIMA di azzerare `state.call`: dopo, il
    // soggetto non esiste più e `currentInterestMarks()` restituirebbe — con
    // ragione — un elenco vuoto.
    const flagged = currentInterestMarks();
    const purchaseSeq = newLog[newLog.length - 1]?.seq;
    if (purchaseSeq !== undefined)
      recordInterestFlag(purchaseSeq, proposed, flagged);
    state.interestMarks = { subjectKey: null, contenders: [] };
    state.moment = "chiamata";
    state.chiamataFocusPending = true;
    state.call = { playerName: "", role: "", club: "", selectedPlayer: null };
    state.callInteractions = 0;
    state.nominationContextOpen = false;
    state.assign = { fantaTeamId: SELF_ID, price: "" };
    state.error = "";
    // Il soggetto non c'è più: il posto della risposta lenta si svuota e
    // qualunque risposta in volo viene annullata. Sta QUI, subito prima del
    // render, perché svuotarlo prima significherebbe ridipingere la schermata
    // in mezzo alle mutazioni.
    armLateAnswer(null);
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : "Errore sconosciuto.";
    render();
  }
}

function doAssign(aState: AuctionState): void {
  const selectedPlayer = state.call.selectedPlayer;
  if (!selectedPlayer) {
    // Unreachable via the UI (launchAsta already requires correlation and
    // nothing clears selectedPlayer during the asta moment) — kept as a
    // type-safety guard, not a real user-facing path.
    state.error = "Nessun giocatore selezionato dal listone.";
    render();
    return;
  }
  const price = parsePositiveIntegerPrice(state.assign.price);
  if (price === null) {
    state.error = priceRejectedText(state.assign.price, aState);
    render();
    return;
  }
  const playerId = listonePlayerKey(selectedPlayer);
  const role = selectedPlayer.role;
  const proposed: ProposedPurchase = {
    playerId,
    role,
    fantaTeamId: state.assign.fantaTeamId,
    price,
  };
  commitPurchase(aState, proposed, role);
}

/**
 * Il rifiuto di un prezzo che il parser non accetta — invariato in ogni caso
 * tranne UNO: uno zero digitato mentre la schermata sta mostrando il gesto del
 * terzo portiere. Lì «inserisci un numero intero positivo» è vero ma è un
 * vicolo cieco: lo 0 in quel punto è un caso legittimo del regolamento e
 * l'operatore ha davanti il comando che lo registra, senza che niente glielo
 * dica. La coda lo nomina, con le stesse identiche parole scritte sul bottone
 * (THIRD_GOALKEEPER_ZERO_LABEL, una costante sola per non poter divergere).
 * Fuori da quel caso il messaggio resta parola per parola quello di prima:
 * dove il bottone non c'è, indicarlo sarebbe una bugia.
 */
function priceRejectedText(raw: string, aState: AuctionState): string {
  const base = "Prezzo non valido: inserisci un numero intero positivo.";
  // Solo uno zero (anche scritto "00" o con spazi): un prezzo negativo o una
  // parola non sono il caso del regolamento e non vanno indirizzati lì.
  const typedZero = /^0+$/.test(raw.trim());
  if (
    !typedZero ||
    !isThirdGoalkeeperSlot(aState.teams[state.assign.fantaTeamId])
  )
    return base;
  return `${base} Per il terzo portiere a 0 usa il bottone «${THIRD_GOALKEEPER_ZERO_LABEL}».`;
}

/**
 * One-gesture declaration path for LEAGUE_RULES.md §6's third-portiere
 * exception (Pico, 2026-08-15). Only reachable by clicking the button
 * renderMomentoAsta shows exclusively when this IS the selected team's
 * third portiere slot — this function does not re-derive that gate, it
 * defers entirely to purchaseFeasibility() (via commitPurchase) as the
 * single source of truth, same as every other purchase path. The click
 * itself is both the operator's declaration that the table-level facts
 * (same real club as a portiere already on the roster; no other
 * participant interested) hold right now, AND the commit — no second step,
 * no field to fill in. `commitPurchase` -> `recordPurchase` writes that
 * declaration onto the event (`thirdGoalkeeperZeroDeclared: true`), so the
 * log explains the 0 on replay.
 */
function registerThirdGoalkeeperZero(aState: AuctionState): void {
  // La proposta viene dalla stessa funzione che la schermata ha già
  // interrogato per decidere cosa scrivere nella nota di max_safe: quello che
  // il testo dichiara possibile è letteralmente ciò che questo click commette.
  const proposed = thirdGoalkeeperZeroProposal();
  if (!proposed) {
    state.error = "Nessun giocatore selezionato dal listone.";
    render();
    return;
  }
  commitPurchase(aState, proposed, proposed.role);
}

/** Human-readable, non-alarmist explanation of a failed save — always
 *  paired with an explicit statement that nothing was applied, per
 *  LIVE-02's "mai dichiarare falsamente un salvataggio avvenuto". */
function persistenceErrorMessage(
  result: Extract<SaveLogResult, { ok: false }>,
): string {
  if (result.reason === "partial-write") {
    return `Persistenza in stato indeterminato (${result.message}). Le azioni sono bloccate: usa Riprova per rileggere lo stato effettivo.`;
  }
  if (result.reason === "invalid-log") {
    return "Salvataggio rifiutato: l'operazione non ha superato la validazione interna dello storico. Nessuna modifica applicata.";
  }
  if (result.reason === "divergent-log") {
    return "Un'altra scheda ha modificato lo storico: ricarica la pagina prima di continuare. La modifica NON è stata applicata.";
  }
  return `Impossibile salvare nel browser (${result.message}). La modifica NON è stata applicata.`;
}

function handleSaveFailure(
  result: Extract<SaveLogResult, { ok: false }>,
): void {
  const message = persistenceErrorMessage(result);
  if (result.reason === "partial-write") {
    state.recovery = {
      kind: "storage-error",
      message,
      quarantinedRaw: null,
      quarantineStored: false,
    };
    state.persistenceError = "";
    return;
  }
  state.persistenceError = message;
}

// ── Budget & Rosa — full-width panel (own row, no longer a 3-column grid
// alongside Violazioni/Avversari — Violazioni was removed outright (the old
// computeViolations/STOP badge panel); Avversari still exists but moved into
// the per-call suggestions grid inside renderMomentoAsta, so it is no longer
// laid out next to this panel) ─────────────────────────────────────────────

// ── Zone 4: Event log ─────────────────────────────────────────────────────────
function renderZona4(aState: AuctionState): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel";

  const header = document.createElement("div");
  header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;`;
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "STORICO ACQUISTI";
  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;";
  const exportBtn = document.createElement("button");
  exportBtn.id = "auction-log-export";
  exportBtn.type = "button";
  exportBtn.className = "btn btn--secondary";
  exportBtn.textContent = "Esporta";
  exportBtn.addEventListener("click", exportCurrentLog);
  const importBtn = document.createElement("button");
  importBtn.id = "auction-log-import";
  importBtn.type = "button";
  importBtn.className = "btn btn--secondary";
  importBtn.textContent = "Importa";
  const fileInput = document.createElement("input");
  fileInput.id = "auction-log-import-file";
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.hidden = true;
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void importCurrentLog(file);
  });
  actions.appendChild(exportBtn);
  actions.appendChild(importBtn);
  actions.appendChild(fileInput);
  header.appendChild(title);
  header.appendChild(actions);
  panel.appendChild(header);

  // Build visible entries from log (PURCHASE only, not voided)
  const voided = new Set<number>();
  for (const e of state.log) {
    if (e.type === "VOID") voided.add(e.targetSeq);
  }
  const entries = state.log
    .filter((e) => e.type === "PURCHASE" && !voided.has(e.seq))
    .reverse();

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = `font-size:14px;color:${C.textDim};padding:10px 0;`;
    empty.textContent = "Nessun acquisto registrato.";
    panel.appendChild(empty);
    return panel;
  }

  // ONE index for the whole panel (audit round 2, finding 2): every entry
  // below resolves its display name through it in O(1), instead of each one
  // copying `state.pool` and scanning it while recomputing listonePlayerKey
  // per row.
  const poolIndex = auctionDisplayIndex();

  entries.forEach((entry, idx) => {
    if (entry.type !== "PURCHASE") return;
    const isLatest = idx === 0;
    const time = entry.ts
      ? new Date(entry.ts).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const row = document.createElement("div");
    row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${C.border};font-size:14px;`;

    // LO ZERO DICHIARATO SI LEGGE COME TALE. Un acquisto a 0 cr, in mezzo a
    // prezzi che per regola partono da 1, è indistinguibile da un errore di
    // battitura di chi rilegge lo storico: qui la dichiarazione che l'ha reso
    // possibile — l'unica cosa che spiega quello 0 — smette di restare solo
    // dentro l'evento (`thirdGoalkeeperZeroDeclared`, scritto da
    // recordPurchase) e viene mostrata accanto alla cifra. Compare SOLO sugli
    // eventi che la portano davvero: nessun acquisto ordinario la vede, e uno
    // 0 senza dichiarazione (che l'admission layer non ammette) resterebbe
    // nudo, come deve.
    const declaredZero = entry.thirdGoalkeeperZeroDeclared === true;
    // `badge--declared-zero` è una classe di sola IDENTITÀ (nessuna regola CSS
    // la usa): serve alla guardia di contrasto per trovare questo testo per
    // quello che è, non per il colore che ha — stessa ragione per cui le
    // pastiglie di ruolo si cercano per classe (e2e/text-contrast-aa.spec.ts).
    const declaredZeroBadge = declaredZero
      ? `<span class="badge--declared-zero" style="font-size:11.5px;color:${C.textSec};border:1px solid ${C.border};border-radius:5px;padding:1px 7px;white-space:nowrap;"
               title="Registrato a 0 crediti su dichiarazione esplicita dell'operatore (terzo portiere, regolamento di lega §6). Non è un errore di inserimento.">terzo portiere dichiarato</span>`
      : "";

    const left = document.createElement("div");
    left.style.cssText = `display:flex;align-items:center;gap:14px;color:${C.textMid};flex-wrap:wrap;`;
    left.innerHTML = `
      <span style="font-family:${C.mono};color:${C.textDim};">${escHtml(time)}</span>
      <span style="font-weight:600;">${escHtml(resolvePlayerDisplayName(entry.playerId, poolIndex))}</span>
      ${roleChipHtml(entry.role)}
      <span style="font-family:${C.mono};">${entry.price} cr</span>
      ${declaredZeroBadge}
      <span style="color:${C.textDim};">${escHtml(displayTeamLabel(entry.fantaTeamId))}</span>
    `;
    row.appendChild(left);

    // LIVE-06: any standing purchase can be voided, not only the most recent
    // one. The engine already supported it — voidFeasibility()/recordVoid()
    // accept any target seq and reduce() replays the whole log, so the derived
    // state is order-independent (packages/engine/src/feasibility.ts,
    // packages/engine/src/reduce.ts). Only this UI restricted it. The
    // confirmation below is explicit and states which purchase it is.
    const undoLink = document.createElement("span");
    undoLink.id = `undo-purchase-${entry.seq}`;
    undoLink.tabIndex = 0;
    undoLink.setAttribute("role", "button");
    undoLink.style.cssText = `font-size:12.5px;font-weight:600;color:${C.textAccent};cursor:pointer;white-space:nowrap;`;
    undoLink.textContent = "Annulla";
    undoLink.title = isLatest
      ? "Annulla questo acquisto (l'ultimo registrato)"
      : "Annulla questo acquisto (non è l'ultimo registrato)";
    undoLink.addEventListener("click", () => {
      // Rebuilt on the click, not captured from the render above: the label in
      // the confirmation must name the player as the pool CURRENTLY on screen
      // does, exactly as before this panel got its index.
      const playerDisplay = resolvePlayerDisplayName(
        entry.playerId,
        auctionDisplayIndex(),
      );
      state.confirmVoidSeq = entry.seq;
      // La dichiarazione segue l'acquisto anche qui: chi sta per annullare uno
      // 0 deve sapere se sta cancellando un errore o una scelta dichiarata.
      state.confirmVoidLabel = `${playerDisplay} – ${entry.price} cr${
        declaredZero ? " (terzo portiere dichiarato)" : ""
      } – ${displayTeamLabel(entry.fantaTeamId)}`;
      state.confirmVoidIsLatest = isLatest;
      render();
    });
    undoLink.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        undoLink.click();
      }
    });
    row.appendChild(undoLink);

    panel.appendChild(row);
  });

  return panel;
}

// ── Void confirm overlay ──────────────────────────────────────────────────────
function renderVoidConfirm(): HTMLElement {
  const overlay = document.createElement("div");
  // Opens on the Asta screen, under the sticky critical strip — see the
  // modifier's comment in src/styles/components.css. Without it the heading
  // that distinguishes the non-last void from the ordinary one is covered.
  // See renderImportConfirm and src/styles/components.css.
  overlay.className = "modal-overlay";
  overlay.id = "void-confirm-overlay";

  const modal = document.createElement("div");
  modal.className = "confirmation-dialog";
  modal.setAttribute("aria-labelledby", "void-confirm-title");

  const title = document.createElement("h2");
  title.id = "void-confirm-title";
  title.style.cssText = `font-size:16px;font-weight:700;color:${C.textPrimary};margin-bottom:10px;`;
  title.textContent = state.confirmVoidIsLatest
    ? "Annullare l'ultimo acquisto?"
    : "Annullare questo acquisto?";

  const body = document.createElement("div");
  body.style.cssText = `font-size:13px;line-height:1.55;color:${C.textMid};margin-bottom:${state.confirmVoidIsLatest ? "20px" : "12px"};`;
  body.textContent = `${state.confirmVoidLabel} — l'acquisto verrà rimosso dallo storico e il budget/slot ripristinati.`;

  // LIVE-06: voiding a purchase that is not the most recent one is legitimate
  // and safe (a VOID only relaxes constraints, and reduce() replays the whole
  // log), but it is not what the operator does by reflex — so it is never
  // silent. The later purchases are explicitly stated to be untouched.
  const nonLatestNote = document.createElement("div");
  nonLatestNote.id = "void-confirm-non-latest-note";
  nonLatestNote.setAttribute("role", "note");
  nonLatestNote.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.textSec};border-left:2px solid ${C.accent};padding-left:10px;margin-bottom:20px;`;
  nonLatestNote.textContent =
    "Non è l'ultimo acquisto registrato. Gli acquisti successivi restano validi: lo stato di budget e slot viene ricalcolato sull'intero storico.";

  const btnRow = document.createElement("div");
  btnRow.style.cssText = `display:flex;gap:10px;justify-content:flex-end;`;

  const keepBtn = document.createElement("button");
  keepBtn.id = "void-confirm-cancel";
  keepBtn.textContent = "Mantieni";
  keepBtn.className = "btn btn--secondary";
  keepBtn.dataset.dialogInitialFocus = "";
  keepBtn.addEventListener("click", () => {
    const returnId =
      state.confirmVoidSeq === null
        ? criticalFocusAnchorId()
        : `undo-purchase-${state.confirmVoidSeq}`;
    state.confirmVoidSeq = null;
    state.confirmVoidLabel = "";
    render();
    focusAfterRender(returnId);
  });

  const voidBtn = document.createElement("button");
  voidBtn.id = "void-confirm-apply";
  voidBtn.textContent = "Annulla acquisto";
  voidBtn.className = "btn btn--danger";
  voidBtn.addEventListener("click", () => {
    if (state.confirmVoidSeq === null || voidBtn.disabled) return;
    voidBtn.disabled = true;
    keepBtn.disabled = true;
    const result = executeVoidCommand(
      browserStorage,
      state.log,
      state.confirmVoidSeq,
      new Date().toISOString(),
      FANTA_TEAM_IDS,
      state.confirmations,
    );
    if (result.ok) {
      state.log = [...result.events];
      state.persistenceError = "";
      state.error = "";
    } else if (result.reason === "not-feasible") {
      // Structural refusal from voidFeasibility() — humanized the same way
      // feasibilityErrorText() does for purchases (issue #265 item #4).
      // Defense-in-depth: unreachable via the UI today (only a non-voided
      // PURCHASE row exposes "Annulla"), kept here for correctness.
      state.persistenceError = voidErrorText(result.violations);
    } else if (result.reason === "application-error") {
      state.persistenceError = `Impossibile annullare l'acquisto (${result.message}). Nessuna modifica applicata.`;
    } else {
      handleSaveFailure(result);
    }
    state.confirmVoidSeq = null;
    state.confirmVoidLabel = "";
    render();
    focusAfterRender(criticalFocusAnchorId());
  });

  btnRow.appendChild(keepBtn);
  btnRow.appendChild(voidBtn);
  modal.appendChild(title);
  modal.appendChild(body);
  if (!state.confirmVoidIsLatest) modal.appendChild(nonLatestNote);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);

  // Close on backdrop click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      state.confirmVoidSeq = null;
      state.confirmVoidLabel = "";
      render();
      focusAfterRender(criticalFocusAnchorId());
    }
  });

  activateAccessibleDialog(overlay, modal, () => {
    const returnId =
      state.confirmVoidSeq === null
        ? criticalFocusAnchorId()
        : `undo-purchase-${state.confirmVoidSeq}`;
    state.confirmVoidSeq = null;
    state.confirmVoidLabel = "";
    render();
    focusAfterRender(returnId);
  });
  return overlay;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
render();
void autoLoadListonePool();
void autoLoadExpertSchede();

window.addEventListener("offline", () => {
  state.offline = true;
  render();
});
window.addEventListener("online", () => {
  state.offline = false;
  render();
});
