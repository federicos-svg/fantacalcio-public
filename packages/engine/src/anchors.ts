// Ancore reali + INFLAZIONE MISURATA — strato 4 di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §3, riga 2 di §8. Puro,
// deterministico, engine-only: nessuna UI, nessun dato reale, nessun gate.
//
// REGOLA DEI TRE INGREDIENTI (docs/DECISIONS.md §D9, norma sovraordinata).
// Ogni numero prodotto qui è:
//  1. un FATTO MISURATO — la Qt.A del listone (`PlayerAnchor.quotation`) e i
//     prezzi realmente pagati al tavolo (l'event log);
//  2. oppure un'ARITMETICA DICHIARATA su quei fatti — la formula è scritta qui
//     sotto per intero e il campione che la sostiene viaggia col numero (`n`).
// Non c'è un terzo ingrediente nascosto: nessun peso scelto dal sistema,
// nessun parametro fittato, nessuna feature imputata.
//
// COSA QUESTO MODULO NON È, di proposito (§D9 perimetro 2 + design §3):
//  - NON è un predittore di prezzo. Il predittore parametrico è uscito dagli
//    strati live proprio perché richiederebbe un prezzo predetto senza ≥2
//    post-aste. Qui non si predice: si misura cosa il tavolo HA già pagato
//    rispetto alle quotazioni, e si applica quella misura all'ancora.
//  - NON produce e non deve mai produrre un INTERVALLO di prezzo per
//    giocatore: il divieto di forma è pieno. `currentAnchor` restituisce uno
//    scalare con la propria provenienza, mai una banda, mai un minimo/massimo.
//  - NON è un output direttivo: non dice quanto vale un giocatore per Owner
//    (`value`/`fair_to_me`/`target_band` restano fuori da questo file).
//
// COLD START DICHIARATO (§3 «strato 2» e §5): ogni contatore espone il proprio
// `n`; sotto `MIN_INFLATION_SAMPLE` la misura NON viene mostrata come numero,
// vale `null` e porta il motivo. Un'inflazione su 2 acquisti non è
// un'inflazione: è rumore con un'etichetta.

import {
  type AuctionEvent,
  type AuctionState,
  type PurchaseEvent,
  type Role,
  COST_FLOOR,
  INITIAL_BUDGET,
  ROLES,
  TOTAL_SLOTS,
} from "./types.js";

/**
 * Un'ancora reale per un giocatore: la Qt.A del listone, più la FVM quando la
 * fonte la porta. Fatto misurato, copiato dal listone — mai derivato, mai
 * imputato, mai riempito con un default quando manca (un giocatore senza
 * ancora resta senza ancora, e chi lo consuma mostra `n/d`).
 *
 * `fvm` è trasportata perché il design la elenca fra le ancore reali (§3
 * strato 4), ma NON entra in nessun calcolo di questo modulo: non corregge la
 * Qt.A, non ne fa la media, non la sostituisce. Mescolare due ancore con una
 * proporzione scelta qui sarebbe esattamente il «peso nascosto» vietato da §D9.
 */
export interface PlayerAnchor {
  readonly playerId: string;
  readonly role: Role;
  /** Qt.A — quotazione attuale di listino, stagione corrente (LEAGUE_RULES §3-bis / listone). */
  readonly quotation: number;
  /** FVM, se la fonte la porta. Trasportata, mai usata nei calcoli qui. */
  readonly fvm?: number;
}

export type AnchorViolation =
  | "player-id-empty" // playerId vuoto: nessuna identità su cui agganciare l'ancora
  | "duplicate-player" // stesso playerId più volte: quale delle due ancore sarebbe "la" Qt.A?
  | "quotation-invalid" // Qt.A non finita o negativa (NaN/Infinity/-3)
  | "fvm-invalid"; // FVM presente ma non finita o negativa

export interface AnchorIssue {
  readonly index: number;
  readonly playerId: string;
  readonly violation: AnchorViolation;
}

export interface AnchorValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AnchorIssue[];
}

/**
 * Validazione fail-closed del listino di ancore, stesso contratto di
 * `validateConfirmations`/`purchaseFeasibility`: pura, non lancia mai, riporta
 * OGNI violazione trovata per ogni riga (non solo la prima).
 *
 * `quotation-invalid` copre esplicitamente NaN: ogni confronto con NaN è
 * falso, quindi una Qt.A NaN attraverserebbe in silenzio ogni soglia di questo
 * file e produrrebbe un'inflazione NaN presentata come numero — la stessa
 * classe di bug già chiusa in `purchaseFeasibility` per il prezzo.
 */
export function validateAnchors(anchors: readonly PlayerAnchor[]): AnchorValidationResult {
  const issues: AnchorIssue[] = [];
  const seen = new Set<string>();

  anchors.forEach((a, index) => {
    const add = (violation: AnchorViolation): void => {
      issues.push({ index, playerId: a.playerId, violation });
    };

    if (a.playerId.length === 0) add("player-id-empty");
    else if (seen.has(a.playerId)) add("duplicate-player");
    else seen.add(a.playerId);

    if (!Number.isFinite(a.quotation) || a.quotation < 0) add("quotation-invalid");
    if (a.fvm !== undefined && (!Number.isFinite(a.fvm) || a.fvm < 0)) add("fvm-invalid");
  });

  return { ok: issues.length === 0, issues };
}

/**
 * Il listino di ancore indicizzato per playerId — struttura di sola lettura
 * costruita una volta e riusata da tutto lo strato 2 (cliff, tensione,
 * competitor set), così ogni vista legge la STESSA ancora per lo stesso
 * giocatore.
 */
export interface AnchorBook {
  readonly all: readonly PlayerAnchor[];
  readonly byPlayerId: ReadonlyMap<string, PlayerAnchor>;
}

/**
 * Costruisce l'`AnchorBook`, **lanciando** su un listino invalido — stessa
 * postura fail-closed di `reduce()` con un batch di riconferme invalido: è
 * strutturalmente impossibile derivare ancore, inflazione o tensione da un
 * listino che non ha passato `validateAnchors`.
 */
export function anchorBook(anchors: readonly PlayerAnchor[]): AnchorBook {
  const validation = validateAnchors(anchors);
  if (!validation.ok) {
    throw new Error(
      `invalid anchors: ${validation.issues
        .map((i) => `${i.index}/${i.playerId}:${i.violation}`)
        .join(", ")}`,
    );
  }
  const byPlayerId = new Map<string, PlayerAnchor>();
  for (const a of anchors) byPlayerId.set(a.playerId, a);
  return { all: anchors.slice(), byPlayerId };
}

/**
 * Gli acquisti ancora in piedi: i PURCHASE non compensati da un VOID, in
 * ordine di `seq`. È la stessa nozione che `reduce()` applica internamente,
 * qui esposta perché le misure di questo strato hanno bisogno dei PREZZI, che
 * lo stato derivato non conserva evento per evento.
 *
 * Si legge il LOG e non `state.teams[*].roster` di proposito: il roster
 * contiene anche le riconferme (seq negativo, LEAGUE_RULES §4), che sono
 * prezzi della STAGIONE PRECEDENTE. Farle entrare nell'inflazione «di serata»
 * significherebbe misurare il mercato di quest'anno con i prezzi dell'anno
 * scorso. Qui non entrano, per costruzione.
 *
 * `src/nominationContext.ts` tiene una funzione locale equivalente
 * (`effectivePurchases`) per il pannello D7; i due nomi restano distinti
 * perché le due copie vivono su lati opposti del confine engine/UI e questa
 * tranche non tocca `src/`.
 */
export function settledPurchases(log: readonly AuctionEvent[]): readonly PurchaseEvent[] {
  const voided = new Set<number>();
  for (const e of log) if (e.type === "VOID") voided.add(e.targetSeq);
  return log
    .filter((e): e is PurchaseEvent => e.type === "PURCHASE" && !voided.has(e.seq))
    .sort((a, b) => a.seq - b.seq); // `filter` ha già prodotto un array nuovo: nessuna mutazione del log
}

/**
 * Un acquisto di serata affiancato alla sua ancora: la riga di provenienza
 * dietro il numero di inflazione. Chi mostra un'inflazione può mostrare
 * esattamente il campione che la produce, riga per riga.
 */
export interface AnchorSample {
  readonly seq: number;
  readonly playerId: string;
  readonly role: Role;
  readonly fantaTeamId: string;
  readonly price: number;
  readonly quotation: number;
  /** price − Qt.A: il sovrapprezzo in crediti, misurato. */
  readonly delta: number;
  /** price / Qt.A, oppure `null` se la Qt.A è 0 (rapporto non definito). */
  readonly ratio: number | null;
}

/**
 * Gli acquisti di serata per cui esiste un'ancora, appaiati alla propria Qt.A.
 * Gli acquisti di giocatori senza ancora sono esclusi (non silenziati:
 * `measuredInflation` li conta in `missingAnchor`).
 */
export function paidAnchorSamples(
  log: readonly AuctionEvent[],
  book: AnchorBook,
): readonly AnchorSample[] {
  return samplesOf(settledPurchases(log), book);
}

function samplesOf(
  purchases: readonly PurchaseEvent[],
  book: AnchorBook,
): readonly AnchorSample[] {
  const out: AnchorSample[] = [];
  for (const p of purchases) {
    const anchor = book.byPlayerId.get(p.playerId);
    if (anchor === undefined) continue;
    out.push({
      seq: p.seq,
      playerId: p.playerId,
      role: p.role,
      fantaTeamId: p.fantaTeamId,
      price: p.price,
      quotation: anchor.quotation,
      delta: p.price - anchor.quotation,
      ratio: anchor.quotation === 0 ? null : p.price / anchor.quotation,
    });
  }
  return out;
}

/**
 * Soglia minima di campione pre-dichiarata (§3 «cold start dichiarato», §5).
 * Fissata QUI, una volta, non la sera dell'asta: sotto questo numero di
 * acquisti ancorati l'inflazione non è un numero mostrabile.
 */
export const MIN_INFLATION_SAMPLE = 5;

export type InflationUnavailableReason =
  | "no-anchor-coverage" // nessun acquisto di serata ha un'ancora: niente da misurare
  | "insufficient-sample" // campione < MIN_INFLATION_SAMPLE: cold start dichiarato
  | "zero-anchor-base"; // le ancore del campione sommano 0: il rapporto non esiste

/**
 * Una misura di inflazione, sempre col proprio campione accanto.
 *
 * FORMULA DICHIARATA: `inflation = (Σ prezzi pagati / Σ Qt.A degli stessi
 * giocatori) − 1`. È un rapporto PESATO SUI CREDITI, non la media dei rapporti
 * per giocatore: la media dei rapporti farebbe pesare un 5 pagato su una Qt.A
 * di 1 (ratio 5,0) quanto un 60 pagato su una Qt.A di 50 (ratio 1,2), e
 * l'inflazione che interessa al tavolo è quella dei crediti, non quella dei
 * nomi. La scelta è dichiarata qui e ispezionabile riga per riga via
 * `paidAnchorSamples`.
 */
export interface InflationMeasure {
  /** Acquisti di serata con ancora nota che compongono la misura. */
  readonly n: number;
  /** Acquisti di serata SENZA ancora, esclusi dalla misura: copertura dichiarata. */
  readonly missingAnchor: number;
  readonly paidTotal: number;
  readonly anchorTotal: number;
  /** `null` sotto soglia o senza base: mai un 0 travestito da misura. */
  readonly inflation: number | null;
  readonly sufficient: boolean;
  readonly reason: InflationUnavailableReason | null;
}

export interface MeasuredInflation {
  readonly overall: InflationMeasure;
  readonly perRole: Record<Role, InflationMeasure>;
  /** La soglia effettivamente applicata, trasportata col risultato. */
  readonly minSample: number;
}

function measureFrom(
  samples: readonly AnchorSample[],
  missingAnchor: number,
  minSample: number,
): InflationMeasure {
  const n = samples.length;
  let paidTotal = 0;
  let anchorTotal = 0;
  for (const s of samples) {
    paidTotal += s.price;
    anchorTotal += s.quotation;
  }
  const reason: InflationUnavailableReason | null =
    n === 0
      ? "no-anchor-coverage"
      : n < minSample
        ? "insufficient-sample"
        : anchorTotal === 0
          ? "zero-anchor-base"
          : null;
  return {
    n,
    missingAnchor,
    paidTotal,
    anchorTotal,
    inflation: reason === null ? paidTotal / anchorTotal - 1 : null,
    sufficient: reason === null,
    reason,
  };
}

/**
 * L'inflazione misurata del tavolo, complessiva e per ruolo, dal solo event
 * log e dalle ancore. Deterministica: stesso log + stesse ancore → stesso
 * risultato, sempre.
 *
 * Le misure per ruolo sono INDIPENDENTI l'una dall'altra e da quella
 * complessiva: ognuna ha il proprio `n` e il proprio cold start. Un ruolo
 * «caldo» su 6 acquisti e un ruolo intoccato su 0 convivono senza che il
 * secondo erediti nulla dal primo.
 */
export function measuredInflation(
  log: readonly AuctionEvent[],
  book: AnchorBook,
  minSample: number = MIN_INFLATION_SAMPLE,
): MeasuredInflation {
  const purchases = settledPurchases(log);
  const samples = samplesOf(purchases, book);

  const missingOverall = purchases.length - samples.length;
  const perRole = {} as Record<Role, InflationMeasure>;
  for (const role of ROLES) {
    const roleSamples = samples.filter((s) => s.role === role);
    const roleMissing =
      purchases.filter((p) => p.role === role).length - roleSamples.length;
    perRole[role] = measureFrom(roleSamples, roleMissing, minSample);
  }

  return {
    overall: measureFrom(samples, missingOverall, minSample),
    perRole,
    minSample,
  };
}

/**
 * La seconda metà dell'«inflazione misurata» di §3 strato 4: la pressione che
 * viene da **crediti e slot residui del tavolo**, non dai prezzi già pagati.
 * È contabilità censuaria pura — nessun campione, nessun cold start: si
 * contano i crediti che restano e gli slot che restano, adesso.
 *
 * FORMULA DICHIARATA: `pressure = (crediti residui / slot residui) /
 * (INITIAL_BUDGET / TOTAL_SLOTS) − 1`. Il denominatore è la dotazione di
 * partenza per slot della lega (500/28 ≈ 17,86), cioè il punto di equilibrio
 * del tavolo alla prima chiamata: sopra lo zero restano più crediti per slot
 * di quanti ce ne fossero all'inizio (i soldi inseguono meno posti), sotto lo
 * zero il tavolo si sta prosciugando. Nessun peso scelto dal sistema: il
 * riferimento è una costante di regolamento.
 *
 * Le RICONFERME sono già dentro `budgetResidual`/`slotsRemaining` di ogni
 * squadra (le semina `reduce()`), quindi lo stato di partenza asimmetrico
 * della lega è contato correttamente senza nessun trattamento speciale qui.
 */
export interface ResidualPressure {
  readonly creditsRemaining: number;
  readonly slotsRemaining: number;
  readonly creditsPerSlot: number | null;
  readonly baselineCreditsPerSlot: number;
  readonly pressure: number | null;
  /** Quante squadre sono entrate nel conto: è un censimento, non un campione. */
  readonly teamsCounted: number;
  readonly reason: "no-remaining-slots" | null;
}

export function residualPressure(state: AuctionState): ResidualPressure {
  let creditsRemaining = 0;
  let slotsRemaining = 0;
  let teamsCounted = 0;
  for (const team of Object.values(state.teams)) {
    creditsRemaining += team.budgetResidual;
    slotsRemaining += team.totalSlotsRemaining;
    teamsCounted += 1;
  }
  const baselineCreditsPerSlot = INITIAL_BUDGET / TOTAL_SLOTS;
  if (slotsRemaining === 0) {
    return {
      creditsRemaining,
      slotsRemaining,
      creditsPerSlot: null,
      baselineCreditsPerSlot,
      pressure: null,
      teamsCounted,
      reason: "no-remaining-slots",
    };
  }
  const creditsPerSlot = creditsRemaining / slotsRemaining;
  return {
    creditsRemaining,
    slotsRemaining,
    creditsPerSlot,
    baselineCreditsPerSlot,
    pressure: creditsPerSlot / baselineCreditsPerSlot - 1,
    teamsCounted,
    reason: null,
  };
}

/**
 * Su quale misura è stata corretta l'ancora. Dichiarato nel risultato, non
 * scelto in silenzio: chi legge il numero sa da quale campione viene.
 *
 * `residualPressure` NON compare in questa cascata, di proposito: combinare la
 * pressione residua con l'inflazione realizzata richiederebbe un peso fra le
 * due, e quel peso lo sceglierebbe il sistema (vietato, §D9). L'ancora si
 * corregge con la misura fatta sui PREZZI realmente pagati rispetto alle
 * quotazioni; la pressione residua resta un fatto di mercato mostrato accanto
 * — è la riga «MERCATO» della plancia, non un moltiplicatore nascosto.
 */
export type AnchorCorrectionBasis =
  | "role-inflation" // inflazione misurata del ruolo (preferita: più vicina al mercato di quel ruolo)
  | "overall-inflation" // inflazione misurata del tavolo, quando il ruolo è ancora sotto soglia
  | "none"; // cold start su entrambe: l'ancora resta la Qt.A nuda

/**
 * L'ANCORA CORRENTE di un giocatore: Qt.A corretta dall'inflazione misurata
 * (design §3 strato 4, §4.1, §D9 perimetro 5 «scenario primario = alle
 * ancore»). Uno scalare, mai una banda.
 *
 * FORMULA DICHIARATA: `correctedAnchor = max(COST_FLOOR, round(Qt.A × (1 +
 * inflazione misurata)))`. Il `max` col floor esiste perché un giocatore non
 * si compra a 0 crediti (LEAGUE_RULES: rilancio minimo +1 su base ≥ 1), quindi
 * nemmeno un'ancora deflazionata può scendere sotto il floor.
 *
 * CASCATA DICHIARATA: inflazione di ruolo se ha campione sufficiente, altrimenti
 * inflazione complessiva se ce l'ha, altrimenti NESSUNA correzione — e in
 * quest'ultimo caso `coldStart` è `true` e l'ancora corrente coincide con la
 * Qt.A. Non c'è un valore di ripiego inventato per far apparire comunque un
 * numero corretto.
 *
 * Restituisce `null` quando il giocatore non ha ancora: un `n/d` esplicito,
 * non uno zero o una media di ruolo messa al suo posto.
 */
export interface CurrentAnchor {
  readonly playerId: string;
  readonly role: Role;
  /** Qt.A nuda — fatto misurato, sempre visibile accanto alla corretta. */
  readonly baseAnchor: number;
  readonly basis: AnchorCorrectionBasis;
  /** L'inflazione effettivamente applicata, o `null` in cold start. */
  readonly inflationApplied: number | null;
  /** Il campione della misura applicata (0 in cold start). */
  readonly n: number;
  readonly correctedAnchor: number;
  readonly coldStart: boolean;
}

export function currentAnchor(
  playerId: string,
  book: AnchorBook,
  inflation: MeasuredInflation,
): CurrentAnchor | null {
  const anchor = book.byPlayerId.get(playerId);
  if (anchor === undefined) return null;

  const roleMeasure = inflation.perRole[anchor.role];
  const applied = roleMeasure.sufficient
    ? { basis: "role-inflation" as const, measure: roleMeasure }
    : inflation.overall.sufficient
      ? { basis: "overall-inflation" as const, measure: inflation.overall }
      : null;

  if (applied === null) {
    return {
      playerId,
      role: anchor.role,
      baseAnchor: anchor.quotation,
      basis: "none",
      inflationApplied: null,
      n: 0,
      correctedAnchor: Math.max(COST_FLOOR, Math.round(anchor.quotation)),
      coldStart: true,
    };
  }

  const inflationApplied = applied.measure.inflation as number;
  return {
    playerId,
    role: anchor.role,
    baseAnchor: anchor.quotation,
    basis: applied.basis,
    inflationApplied,
    n: applied.measure.n,
    correctedAnchor: Math.max(
      COST_FLOOR,
      Math.round(anchor.quotation * (1 + inflationApplied)),
    ),
    coldStart: false,
  };
}

/**
 * True quando il giocatore è ancora sul mercato. `purchasedPlayerIds` copre
 * sia i venduti sia i RICONFERMATI (che `reduce()` vi inserisce): sono fuori
 * mercato allo stesso modo. Scansione lineare, pensata per il controllo
 * singolo; chi filtra un listino intero costruisce un `Set` una volta sola
 * (vedi cliff.ts).
 */
export function isPlayerAvailable(playerId: string, state: AuctionState): boolean {
  return !state.purchasedPlayerIds.includes(playerId);
}
