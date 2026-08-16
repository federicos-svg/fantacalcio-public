// Opponent profiles (T16, issue #234) — shared types. PURE data shapes only.
//
// Two strictly separated halves, and the separation is the whole point of the
// package (docs/DECISIONS.md §D9 perimetro 3):
//
//   PRIOR   = the pre-auction interview. Every value here is a DECLARED input
//             of Owner (D9 "ingrediente 2"). Nothing in this half is ever
//             estimated, fitted, or inferred by the system.
//   OBSERVED = deterministic counters read off the live event log (D9
//             "ingrediente 1" + "ingrediente 3": measured facts and declared
//             arithmetic on them). See counters.ts.
//
// The two halves are never blended into a single number. `profileView.ts`
// pairs them side by side with their provenance labelled; there is no
// psychological score, no Bayesian update of behavioural parameters, and no
// fitted parameter anywhere in this package.
//
// PRIVACY (no-go, issue #234 "Nota privacy"): a profile is a personal
// judgement about a real person in the league. Real profiles therefore live
// ONLY in runtime-local storage (storage.ts) and are NEVER versioned, never
// committed, never logged verbatim. Two structural guarantees make that hard
// to get wrong by accident rather than merely documented:
//
//   1. the profile carries a `personId` reference and NO name field at all —
//      the human-readable label lives in the league roster (also
//      runtime-local), so a profile blob on its own carries opaque ids;
//   2. the zod schema is `.strict()` (profileSchema.ts), so a stray `name`,
//      `displayName` or `email` key is rejected instead of silently stored.
//
// Every fixture in this package's tests is synthetic.

/**
 * Schema version of the interview profile. Bumped whenever the persisted
 * shape changes; `storage.ts` refuses to read any other version rather than
 * guessing a migration.
 */
export const OPPONENT_PROFILE_SCHEMA_VERSION = 1;

/**
 * Person id shape, mirroring the league roster's (`src/leagueTeams.ts`
 * `personSchema`). Deliberately mirrored rather than imported: a package must
 * not depend on the app root, and this package only needs to agree on the
 * *shape* of the reference, never on the identity of the declaration.
 *
 * The person, not the seat, is what a profile is about: seats change hands
 * between seasons, the judgement follows the human. Counters (counters.ts)
 * are keyed by SEAT (`fantaTeamId`) instead, because that is what the auction
 * event log records; `profileView.ts` joins the two through the roster.
 */
export const PERSON_ID_PATTERN = /^person:[0-9a-f-]{36}$/i;

/** Upper bound on the free-text interview note. Structural, not semantic. */
export const NOTES_MAX_LENGTH = 500;

/** Upper bound on one free-text label (a club or a recurring target name). */
export const LABEL_MAX_LENGTH = 60;

/** Upper bound on how many labels one list field may carry. */
export const LABEL_LIST_MAX = 20;

/**
 * Spending style declared in the interview (design doc §7: "presto/tardi").
 *
 * Every closed vocabulary in this file is declared ONCE as a `as const` tuple
 * and its TypeScript type derived from it, so `z.enum(...)` in
 * profileSchema.ts consumes the same single source of truth: a value added to
 * the vocabulary cannot be accepted by the type and rejected by the schema
 * (or the reverse), because there is only one list.
 */
export const SPENDING_TIMINGS = ["presto", "tardi", "misto"] as const;

export type SpendingTiming = (typeof SPENDING_TIMINGS)[number];

/** Declared susceptibility to tilt. A DECLARED judgement, never a fitted score. */
export const TILT_SUSCEPTIBILITIES = ["bassa", "media", "alta"] as const;

export type TiltSusceptibility = (typeof TILT_SUSCEPTIBILITIES)[number];

/**
 * Closed vocabulary of declared weaknesses (design doc §7: "si innamora dei
 * big, tirchio, tilt dopo un'asta persa"). A fixed enum rather than free text
 * so that a weakness is machine-checkable, comparable across profiles, and
 * safe to summarise in a log without leaking a sentence about a real person.
 */
export const WEAKNESS_CODES = [
  "si_innamora_dei_big",
  "tirchio",
  "tilt_dopo_asta_persa",
  "insegue_i_giocatori_della_sua_squadra",
  "svuota_il_budget_presto",
  "resta_liquido_troppo_a_lungo",
] as const;

export type WeaknessCode = (typeof WEAKNESS_CODES)[number];

/**
 * Per-field confirmation state. Design doc §7: "l'agente propone, Owner
 * conferma riga per riga: il giudizio resta suo, l'agente fa la fatica".
 *
 * `proposto` is therefore NOT a usable input: it is an LLM proposal awaiting
 * Owner's word. Only `confermato` fields are declared inputs under D9
 * ingrediente 2, and `confirmedPrior()` (profileView.ts) is what enforces it
 * — a consumer that reads the raw profile cannot accidentally treat a
 * proposal as a declaration, because the two are different statuses on the
 * same wrapper and the stripping helper is the documented entry point.
 */
export type DeclarationStatus = "confermato" | "proposto";

/** One interview answer plus the provenance that makes it usable (or not). */
export interface Declared<T> {
  readonly value: T;
  readonly status: DeclarationStatus;
  /** ISO `YYYY-MM-DD` of the interview turn that produced this answer. */
  readonly declaredAt: string;
}

/** The interview-side field names, in a stable order. */
export type ProfileFieldId =
  | "spendingTiming"
  | "tiltSusceptibility"
  | "weaknesses"
  | "affinityClubs"
  | "recurringTargets"
  | "notes";

export const PROFILE_FIELD_IDS: readonly ProfileFieldId[] = [
  "spendingTiming",
  "tiltSusceptibility",
  "weaknesses",
  "affinityClubs",
  "recurringTargets",
  "notes",
] as const;

/**
 * One opponent's pre-auction profile. Every judgement field is optional: an
 * interview that did not reach a question leaves it ABSENT, never filled with
 * a fabricated default. Absence and "declared as unknown" are not the same
 * thing and the schema keeps them distinguishable.
 */
export interface OpponentProfile {
  readonly schemaVersion: typeof OPPONENT_PROFILE_SCHEMA_VERSION;
  /** Reference to the person in the league roster. No name is ever stored here. */
  readonly personId: string;
  /** Opaque id of the interview session that produced this profile. */
  readonly interviewId: string;
  readonly spendingTiming?: Declared<SpendingTiming>;
  readonly tiltSusceptibility?: Declared<TiltSusceptibility>;
  readonly weaknesses?: Declared<readonly WeaknessCode[]>;
  /** Clubs the person supports or gravitates to. Club labels, not personal data. */
  readonly affinityClubs?: Declared<readonly string[]>;
  /** Players this person buys year after year ("nomi ricorrenti", design doc §7). */
  readonly recurringTargets?: Declared<readonly string[]>;
  /** Free-text anecdotes from the interview. Runtime-local only, never logged verbatim. */
  readonly notes?: Declared<string>;
}

/** The persisted envelope: what runtime-local storage holds, and nothing else. */
export interface OpponentProfileStore {
  readonly schemaVersion: typeof OPPONENT_PROFILE_SCHEMA_VERSION;
  readonly profiles: readonly OpponentProfile[];
}

// ---------------------------------------------------------------------------
// Observed side — inputs
// ---------------------------------------------------------------------------

/**
 * One observed participation: seat `fantaTeamId` was seen bidding on
 * `playerId` during the auction at (or around) sequence `seq`.
 *
 * WHY THIS IS A SEPARATE INPUT AND NOT READ OFF THE EVENT LOG: the live
 * engine's append-only log (packages/engine/src/events.ts, tranche 1 #263)
 * records only PURCHASE and VOID — who WON, never who BID. "Aste ingaggiate"
 * (D9 perimetro 3) therefore has no producer in the repo today. Rather than
 * silently equating "engaged" with "won" — which would fabricate a 100% win
 * rate out of thin air — the counters report `source-missing` whenever this
 * stream is absent. Supplying it is a separate, deliberate act.
 */
export interface ObservedEngagement {
  readonly seq: number;
  readonly playerId: string;
  readonly fantaTeamId: string;
}

/**
 * The listone anchor for one player: `Qt.A`. Caller-supplied, because this
 * package never reads `public/data/**` and never touches the listone loader.
 */
export interface PriceAnchor {
  readonly playerId: string;
  readonly qtA: number;
}

/**
 * The theoretical max bid a seat had available IMMEDIATELY BEFORE the
 * purchase recorded at `seq`.
 *
 * Caller-supplied on purpose: it is `maxSafe()` (packages/engine/src/
 * auction.ts) evaluated against the state replayed up to `seq`. This package
 * deliberately does not re-derive auction state — it imports the engine's
 * TYPES and its event CONTRACT, never its reducer — so there is exactly one
 * implementation of the hard-safe arithmetic in the repo and no second copy
 * that could drift from it.
 */
export interface MaxBidSnapshot {
  readonly seq: number;
  readonly fantaTeamId: string;
  readonly maxBid: number;
}

/** Which optional input stream a counter needed and did not get. */
export type CounterSource = "engagements" | "priceAnchors" | "maxBidSnapshots";

// ---------------------------------------------------------------------------
// Observed side — outputs
// ---------------------------------------------------------------------------

export type CounterId =
  | "auctionsWon"
  | "auctionsEngaged"
  | "contestedLosses"
  | "winRate"
  | "averageOverpayVsQtA"
  | "averageDistanceFromMaxBid"
  | "spendPaceVsTable";

export const COUNTER_IDS: readonly CounterId[] = [
  "auctionsWon",
  "auctionsEngaged",
  "contestedLosses",
  "winRate",
  "averageOverpayVsQtA",
  "averageDistanceFromMaxBid",
  "spendPaceVsTable",
] as const;

/**
 * The cold-start contract, made a type instead of a convention (D9 perimetro
 * 3: "ogni contatore espone il proprio n; sotto la soglia minima
 * pre-dichiarata il contatore si mostra come «campione insufficiente»").
 *
 * A discriminated union rather than `value?: number`: below threshold there
 * is NO `value` property to read at all, so a consumer cannot fall back to a
 * fabricated default (`?? 0`, `?? 1`) without the type system objecting. The
 * declared UI wording for `insufficient-sample` is «campione insufficiente»;
 * the machine code stays English like every other status enum in the repo.
 *
 * `n` is always present, including on the failing branches — that is the
 * whole point of declaring the cold start rather than hiding it.
 */
export type CounterResult<T> =
  | {
      readonly status: "observed";
      readonly value: T;
      readonly n: number;
      readonly minimumSample: number;
    }
  | {
      readonly status: "insufficient-sample";
      readonly n: number;
      readonly minimumSample: number;
    }
  | {
      readonly status: "source-missing";
      readonly n: 0;
      readonly minimumSample: number;
      readonly missingSource: CounterSource;
    };

/**
 * Minimum sample per statistic-shaped counter.
 *
 * EXACT COUNTS ARE NOT LISTED HERE, and that is a deliberate honesty
 * distinction rather than an omission: "ha vinto 2 aste" is a complete fact
 * at n = 2, while "paga in media +7 su Qt.A" at n = 2 is an estimate dressed
 * as a fact. Counts are always `observed` (minimumSample 0, value === n);
 * only averages and rates can be «campione insufficiente».
 */
export interface CounterThresholds {
  readonly winRate: number;
  readonly averageOverpayVsQtA: number;
  readonly averageDistanceFromMaxBid: number;
  readonly spendPaceVsTable: number;
}

/**
 * PRE-DECLARED defaults — declared parameters, never estimated from data and
 * never tuned by the system. They are exported (rather than hidden inside the
 * computation) precisely so that the threshold in force is inspectable next
 * to the number it gates. Overriding them is a declared input of Owner (D9
 * ingrediente 2), not a system choice.
 *
 * OPEN POINT for Owner: these values are a first declaration by the
 * implementing session, not his. They are provisional until he confirms or
 * replaces them in the pre-auction interview.
 */
export const DEFAULT_COUNTER_THRESHOLDS: CounterThresholds = {
  winRate: 4,
  averageOverpayVsQtA: 3,
  averageDistanceFromMaxBid: 3,
  spendPaceVsTable: 3,
};

/** All counters for one seat, plus the facts that carry no sample of their own. */
export interface OpponentCounters {
  /** The SEAT, as recorded by the auction event log. */
  readonly fantaTeamId: string;
  readonly counters: Readonly<Record<CounterId, CounterResult<number>>>;
  /**
   * `seq` of the most recent auction this seat contested and lost, or `null`.
   *
   * Deliberately NOT called a "tilt flag". It is an observed fact ("has just
   * lost a contested auction"); calling it tilt would be a psychological claim
   * the event log cannot support. The interpretation is the DECLARED
   * `tiltSusceptibility` prior from the interview, paired with this fact —
   * with both provenances visible — in `profileView.ts`. Fact times
   * declaration, never a fitted score.
   */
  readonly lastContestedLossSeq: number | null;
}

// ---------------------------------------------------------------------------
// Precedenti d'asta — lo storico multi-stagione e i fatti pertinenti al
// giocatore chiamato
// ---------------------------------------------------------------------------
//
// PERCHÉ QUESTA METÀ ESISTE, E PERCHÉ NON STA IN UN CAMPO NOTE. Il pannello
// AVVERSARI della schermata live non chiede più «chi può arrivare alla cifra»
// (vincolo duro, packages/engine/src/competitors.ts) ma «cosa ha fatto davvero
// questo avversario che riguardi il giocatore chiamato». Le risposte sono
// misurate su uno storico d'asta di più stagioni, e nessuna delle caselle già
// presenti in questo pacchetto poteva ospitarle:
//
//  - il PRIOR d'intervista è dichiarato, non misurato, ed è per persona, non
//    per giocatore chiamato;
//  - i CONTATORI OSSERVATI (counters.ts) leggono l'event log della stagione IN
//    CORSO, che per costruzione non sa nulla delle stagioni precedenti;
//  - `notes` è testo libero: ficcarci dentro «ha ricomprato X tre volte»
//    renderebbe il fatto non verificabile, non contabile e non falsificabile,
//    che è l'opposto di ciò che serve.
//
// Da qui una terza famiglia di tipi, con la stessa disciplina delle altre due:
// ogni fatto porta la propria NUMEROSITÀ (su quante stagioni è misurato), i
// valori restano separati stagione per stagione, e non esiste — né deve
// esistere — un numero unico che aggreghi «quanto lo vuole».
//
// IL DIVIETO CHE GOVERNA QUESTA SEZIONE. Nessuna inferenza psicologica,
// nessuna stima d'intenzione, nessuno score, indice, punteggio o classifica di
// intensità, nessuna previsione di comportamento. Un fatto è ammesso qui solo
// se è un gesto già compiuto, contabile a partire dallo storico, e pertinente
// al giocatore chiamato. Il giudizio — «allora lo vuole» — resta di Pico e
// resta fuori dal codice.

/**
 * Come è entrato in rosa un giocatore, in una stagione passata.
 *
 * LA DISTINZIONE È LOAD-BEARING, non una sfumatura di catalogazione: un
 * RINNOVO non è un gesto ripetuto, è non aver mai lasciato il giocatore. Solo
 * `asta` conta come «lo ha voluto di nuovo, contro gli altri, a un prezzo». Il
 * conteggio dei precedenti esclude quindi i rinnovi per costruzione, e il
 * numero dei rinnovi esclusi viaggia accanto al fatto come PROVENIENZA (perché
 * il conteggio è più basso delle stagioni in cui l'ha avuto), mai come un
 * secondo segnale di interesse.
 */
export const ACQUISITION_KINDS = ["asta", "riconferma"] as const;

export type AcquisitionKind = (typeof ACQUISITION_KINDS)[number];

/**
 * Etichetta di stagione, `YYYY/YY`. Il formato è vincolato per una ragione
 * meccanica e non estetica: l'ordinamento cronologico di questo pacchetto è
 * l'ordinamento LESSICOGRAFICO dell'etichetta, e lo è correttamente solo se
 * l'etichetta comincia con l'anno a quattro cifre. Una stagione scritta
 * «21-22» ordinerebbe in silenzio dopo «2025/26».
 */
export const SEASON_PATTERN = /^\d{4}\/\d{2}$/;

/**
 * Un acquisto passato, come lo storico d'asta lo registra. Una riga per
 * giocatore per stagione.
 *
 * Chiavato sulla PERSONA e non sul posto a tavola, per la stessa ragione del
 * profilo (vedi `PERSON_ID_PATTERN`): fra una stagione e l'altra i posti
 * cambiano mano, e un precedente segue l'essere umano che l'ha compiuto. Il
 * ponte posto -> persona è il registro lega, passato a `auctionPrecedents()`
 * come mappa, mai importato.
 *
 * Nessun campo nome, qui come nel profilo: `playerId` è un identificatore, e
 * il nome del giocatore chiamato è già sullo schermo. Lo storico d'asta di una
 * lega reale è dato personale (chi ha speso cosa, con nome e cognome) e vive
 * SOLO nello storage runtime-local, mai nel repository — vedi storage.ts.
 */
export interface PastAuctionPurchase {
  /** `YYYY/YY`, vedi `SEASON_PATTERN`. */
  readonly season: string;
  readonly personId: string;
  readonly playerId: string;
  /** Il club REALE del giocatore in quella stagione (Serie A), non la fantasquadra. */
  readonly club: string;
  readonly price: number;
  readonly acquisition: AcquisitionKind;
}

/** Versione dello storico persistito. Una versione diversa è rifiutata, mai migrata. */
export const AUCTION_HISTORY_SCHEMA_VERSION = 1;

/** L'involucro persistito: ciò che lo storage runtime-local tiene, e nient'altro. */
export interface AuctionHistoryStore {
  readonly schemaVersion: typeof AUCTION_HISTORY_SCHEMA_VERSION;
  readonly purchases: readonly PastAuctionPurchase[];
}

/** Il giocatore chiamato al tavolo: le sole due cose che servono per la pertinenza. */
export interface CalledPlayer {
  readonly playerId: string;
  /** Club reale del giocatore chiamato. Stringa vuota quando non è noto. */
  readonly club: string;
}

/**
 * I tipi di fatto ammessi, NELL'ORDINE DI FORZA DICHIARATO (il più forte per
 * primo). L'ordine è una decisione, non una misura: `ricomprato` viene prima
 * perché riguarda esattamente il giocatore chiamato, `club` perché riguarda la
 * sua squadra reale, `piu-cari` perché riguarda la sua fascia di prezzo.
 *
 * IL TIFO NON È IN QUESTA LISTA, ed è la garanzia strutturale che regge tutto
 * il pannello: «tifa quella squadra» non è un gesto compiuto, è
 * un'appartenenza dichiarata, e da solo non dice nulla su cosa quella persona
 * farà con i crediti — il caso che lo dimostra è un tifoso che sul proprio
 * club ha speso il 3,6% e poi lo 0%. Non essendo un `PrecedentFactId` non può
 * diventare il titolo di una riga né, da solo, far comparire un avversario:
 * vive in un campo subordinato di `OpponentPrecedents`, che esiste soltanto
 * quando la riga esiste già per un fatto misurato.
 */
export const PRECEDENT_FACT_IDS = ["ricomprato", "club", "piu-cari"] as const;

export type PrecedentFactId = (typeof PRECEDENT_FACT_IDS)[number];

/** Una stagione e la quota misurata in quella stagione. Mai una media sola. */
export interface SeasonShare {
  readonly season: string;
  /** Quota 0..1 della spesa all'asta di quella stagione. */
  readonly share: number;
  /** Crediti che compongono il numeratore. */
  readonly amount: number;
  /** Crediti spesi all'asta in tutta la stagione: il denominatore. */
  readonly total: number;
}

/** Una stagione e il prezzo pagato in quella stagione. */
export interface SeasonPrice {
  readonly season: string;
  readonly price: number;
}

/**
 * Ciò che ogni fatto porta con sé, sempre: SU QUANTE STAGIONI è misurato.
 *
 * Non è un dettaglio da nota a piè di pagina. Un tratto visto in quattro
 * stagioni e uno visto solo nell'ultima non sono la stessa affermazione, e un
 * pannello che li stampasse uguali mentirebbe due volte: sul primo, perché ne
 * nasconderebbe la tenuta; sul secondo, perché gliene presterebbe una che non
 * ha. `seasons` è l'elenco completo, in ordine crescente, così chi legge vede
 * anche QUALI stagioni, non solo quante.
 */
export interface PrecedentSample {
  readonly seasonsMeasured: number;
  readonly seasons: readonly string[];
}

/**
 * Ha già ricomprato QUESTO giocatore all'asta. Il fatto più forte, perché non
 * è un'analogia: è lo stesso giocatore.
 */
export interface RepeatPurchaseFact extends PrecedentSample {
  readonly id: "ricomprato";
  /** Quante volte lo ha ricomprato ALL'ASTA. I rinnovi non entrano mai qui. */
  readonly auctionPurchases: number;
  /** In quali stagioni lo ha ricomprato all'asta, crescenti. */
  readonly purchaseSeasons: readonly string[];
  /** Prezzi pagati, stagione per stagione: la prova accanto al conteggio. */
  readonly prices: readonly SeasonPrice[];
  /**
   * Quante volte lo ha RINNOVATO. Provenienza del conteggio qui sopra — spiega
   * perché è più basso delle stagioni in cui lo ha avuto — e nient'altro:
   * non è un secondo segnale e non entra in nessun conteggio.
   */
  readonly renewalsExcluded: number;
}

/** Concentrazione di spesa sul club reale del giocatore chiamato. */
export interface ClubConcentrationFact extends PrecedentSample {
  readonly id: "club";
  readonly club: string;
  /** TUTTE le stagioni misurate, crescenti: nessun appiattimento in una media. */
  readonly perSeason: readonly SeasonShare[];
  /** In quante di quelle stagioni la quota è arrivata alla soglia dichiarata. */
  readonly seasonsAtOrAbove: number;
  /** L'ultima stagione misurata, che può contraddire tutte le precedenti. */
  readonly latest: SeasonShare;
  /** La soglia dichiarata effettivamente applicata, accanto al numero che gatekeepa. */
  readonly threshold: number;
}

/**
 * Quota di spesa sui propri giocatori più cari. Pertinente solo quando il
 * giocatore chiamato è a sua volta caro — vedi `CalledPlayerPriceBand`.
 */
export interface TopSpendFact extends PrecedentSample {
  readonly id: "piu-cari";
  /** Quanti acquisti compongono «i propri più cari». Dichiarato, non scelto dai dati. */
  readonly topPurchases: number;
  readonly perSeason: readonly SeasonShare[];
  readonly seasonsAtOrAbove: number;
  readonly latest: SeasonShare;
  readonly threshold: number;
}

export type PrecedentFact = RepeatPurchaseFact | ClubConcentrationFact | TopSpendFact;

/**
 * La spesa MISURATA sul club per cui una persona tifa, accostata al tifo
 * dichiarato. Sempre calcolata, anche (soprattutto) quando è bassa: è la prova
 * che può smentire il tifo, e senza di lei «tifa quella squadra» sarebbe una
 * frase senza contraddittorio.
 */
export interface SupportedClubNote {
  readonly club: string;
  /** Sempre questo letterale: viene dall'intervista, confermata riga per riga. */
  readonly provenance: "intervista_dichiarata";
  readonly perSeason: readonly SeasonShare[];
  readonly seasonsMeasured: number;
  /** `null` quando la persona non ha nessuna stagione misurata nello storico. */
  readonly latest: SeasonShare | null;
}

/**
 * Un avversario e i suoi precedenti sul giocatore chiamato.
 *
 * `facts` non è mai vuoto: senza un fatto misurato la voce non viene creata,
 * perché una riga in questo pannello è già un'affermazione. `supportedClub`
 * può esserci o no e non basta a creare la riga (vedi `PRECEDENT_FACT_IDS`).
 */
export interface OpponentPrecedents {
  /** Il POSTO a tavola: è così che il pannello scrive la riga. */
  readonly fantaTeamId: string;
  /** La PERSONA a cui i precedenti appartengono. */
  readonly personId: string;
  readonly facts: readonly PrecedentFact[];
  readonly supportedClub: SupportedClubNote | null;
}

/** Perché il pannello non ha voci. Mai un elenco vuoto senza motivo scritto. */
export type PrecedentsEmptyReason =
  /** Nessun giocatore chiamato: non c'è un soggetto a cui i fatti si riferiscano. */
  | "no-called-player"
  /** Nessuno storico caricato: non è «nessuno lo vuole», è «non lo so». */
  | "no-history"
  /** Storico presente, nessun fatto pertinente a QUESTO giocatore. */
  | "no-facts";

/**
 * L'esito completo, con tutto ciò che serve a leggerlo senza indovinare:
 * quante persone sono state esaminate, quanti posti non hanno una persona (e
 * quindi non hanno storico), su quali stagioni poggia lo storico e quali
 * soglie dichiarate erano in vigore.
 */
export interface PrecedentsReading {
  readonly opponents: readonly OpponentPrecedents[];
  /** Su cosa poggia, dichiarato nel dato: storico d'asta misurato, nient'altro. */
  readonly basis: "auction-history";
  /** Le stagioni presenti nello storico, crescenti. */
  readonly seasons: readonly string[];
  /** Quanti posti rivali sono stati esaminati (la propria squadra esclusa). */
  readonly seatsConsidered: number;
  /** Quanti di quelli non hanno una persona assegnata: su loro non esiste storico. */
  readonly seatsWithoutPerson: number;
  readonly thresholds: PrecedentThresholds;
  readonly emptyReason: PrecedentsEmptyReason | null;
}

/**
 * Soglie PRE-DICHIARATE — parametri dichiarati, mai stimati dai dati e mai
 * tarati dal sistema. Esportate (invece che nascoste dentro il calcolo)
 * proprio perché la soglia in vigore sia ispezionabile accanto al numero che
 * lascia passare: `PrecedentsReading.thresholds` le riporta nell'esito.
 *
 * PUNTO APERTO PER PICO: questi valori sono una prima dichiarazione della
 * sessione che implementa, non sua. Restano provvisori finché non li conferma
 * o li sostituisce — esattamente come `DEFAULT_COUNTER_THRESHOLDS`.
 */
export interface PrecedentThresholds {
  /** Quota della spesa all'asta di UNA stagione su un club, da cui in su è un fatto. */
  readonly clubShare: number;
  /** Quanti acquisti compongono «i propri giocatori più cari». */
  readonly topPurchases: number;
  /** Quota della spesa all'asta di UNA stagione sui propri più cari, da cui in su è un fatto. */
  readonly topShare: number;
  /**
   * Prezzo mediano passato del giocatore CHIAMATO, in crediti, da cui in su
   * quel giocatore è «caro» e il fatto `piu-cari` diventa pertinente. È
   * l'unico modo in cui la pertinenza entra qui: misurata sullo storico
   * d'asta, mai dedotta dalla quotazione del listone (che questo pacchetto non
   * legge, e che il pannello live non deriva — docs/AUCTION_2026_EXECUTION_PLAN.md §3).
   */
  readonly expensiveFrom: number;
}

export const DEFAULT_PRECEDENT_THRESHOLDS: PrecedentThresholds = {
  clubShare: 0.15,
  topPurchases: 3,
  topShare: 0.5,
  expensiveFrom: 50,
};
