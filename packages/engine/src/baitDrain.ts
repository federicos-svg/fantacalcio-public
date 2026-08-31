// `E_o(i)`, `drain(i)`, `D(i)` e `S_base(i)` — LA SPESA ATTESA DEGLI ALTRI E IL
// DIVARIO DELL'ESCA (NOM-PROTOCOL-A §A.5 e §A.6, passo 4 del nucleo P0). Puro,
// deterministico, engine-only: nessuna UI, nessuna rete, nessun dato reale.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA CATENA, PER INTERO — non c'è altra aritmetica in questo file
// ─────────────────────────────────────────────────────────────────────────────
//
//   E_o(i)   = min( maxSafe(o, ruolo(i)),
//                   max(COST_FLOOR, round( P̂_mercato(i) × uplift_o(i) )) )
//   drain(i) = |esposti| ≥ 2 :  min( secondo max fra {E_o} + MINIMUM_RAISE,
//                                    massimo fra {E_o} )
//              |esposti| = 1 :  prezzo base (nessuna gara attesa)
//   D(i)     = drain(i) − V(i)
//   S_base(i)= V(i) − prezzo base
//
// `maxSafe` SI INTERROGA, MAI SI RIDERIVA (D4): è la stessa riga del libro
// mastro che il tavolo legge, e una seconda formula qui divergerebbe in
// silenzio. `P̂_mercato` è il prezzo di mercato PRIMA del tetto del più ricco
// (`ExpectedPriceChain.marketPrice`, ./expectedPrice.ts) e non `P̂` già
// cappato: il tetto del più ricco riguarda ciò che il MERCATO può pagare, e
// applicarlo prima del sovrapprezzo di QUESTA persona confonderebbe due
// vincoli diversi. Il tetto di questa persona è il suo `maxSafe`, ed è il
// primo argomento del minimo.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE COSA `E_o` NON È — e deve risultare dal codice come dai nomi
// ─────────────────────────────────────────────────────────────────────────────
//
// NON è «quanto lo vuole». È «quanto ha già pagato profili così, se ha slot e
// crediti»: ogni ingrediente è un gesto compiuto, contabile, con la sua `n` —
// un prezzo davvero pagato, una mediana davvero osservata, uno slot davvero
// libero, un budget davvero residuo. Non è uno stato mentale, non è una
// probabilità, non è una previsione di comportamento. Per questo il
// sovrapprezzo arriva INIETTATO (`SpendUpliftInjection`) col proprio `n` e la
// propria provenienza, e non esiste in questo file una funzione che lo
// produca: chi lo compone è
// packages/opponent-profiles/src/expectedSpend.ts, che legge i fatti misurati
// dei precedenti — e il motore non importa quel pacchetto, che sarebbe una
// dipendenza all'incontrario.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'INTERRUTTORE È SPENTO, ED È IL DEFAULT
// ─────────────────────────────────────────────────────────────────────────────
//
// L'inventario dei parametri del DTI (§E) porta l'interruttore degli uplift a
// `off`, e l'atto che lo accende è UNO SOLO: il test T-E, eseguito e chiuso.
// «Non eseguito» equivale a «non chiuso», quindi spento — non è una cautela di
// questa sessione, è la regola scritta. Con l'interruttore spento vale
//
//   E_o(i) = min( maxSafe(o, ruolo(i)), P̂(i) )
//
// che NON è «uplift = 1»: è un'altra grandezza, un TETTO DI MERCATO uguale per
// ogni esposto, e il `drain` che ne discende ordina per capienza e non per
// precedente. La forma della riga non cambia, il contenuto sì — ed è il modo
// più efficiente di mentire con dei fatti. Per questo `basis` e
// `marketCeilingReason` viaggiano NEL DATO e non in un commento: chi mostra il
// numero ha l'obbligo, e i mezzi, di dire quale delle due cose sta mostrando.
//
// I RAPPORTI RESTANO CALCOLABILI E NON APPLICATI. `SpendUpliftInjection` arriva
// comunque, con la sua `n`: accendere l'interruttore non richiede di
// ricostruire nulla, e spegnerlo non cancella la misura. Un interruttore che
// obbligasse a ricalcolare sarebbe un interruttore che nessuno prova.
//
// ─────────────────────────────────────────────────────────────────────────────
// IL `drain` È LA SCALA DEI RIVALI, APPLICATA AGLI ESPOSTI
// ─────────────────────────────────────────────────────────────────────────────
//
// Stessa logica di `relativePriceReading()` (./relativeValue.ts): l'asta è a
// rilanci, chi vince paga quanto mette il secondo più uno, col tetto di chi
// può davvero arrivarci. Tre differenze, tutte dichiarate:
//
//  1. la popolazione non sono i rivali ELEGGIBILI ma gli ESPOSTI, cioè chi ha
//     insieme slot, crediti e un precedente misurato su questo giocatore;
//  2. la scala non è fatta di `maxSafe` ma di `E_o`, cioè di quanto ciascuno
//     è già arrivato a pagare per profili così, col proprio tetto già dentro;
//  3. NON c'è il tetto `maxSafe(io, ruolo)`. Il prezzo relativo misura quanto
//     costa a ME vincere; il `drain` misura quanto brucia IL TAVOLO su una
//     riga che io sto chiamando per non prenderla. Il mio tetto non c'entra, e
//     metterlo dentro renderebbe il divario più piccolo quanto più sono
//     povero, che è l'opposto di ciò che la riga vuole dire.
//
// CON UN SOLO ESPOSTO NON C'È GARA: l'esca gli resta al prezzo base e il tavolo
// non si è prosciugato. Il `drain` vale allora il prezzo base — un fatto, non
// un ripiego — e lo dice con `basis`.
//
// `MINIMUM_RAISE` è IMPORTATO da ./relativeValue.ts, non riscritto: è il
// rilancio minimo di regolamento (LEAGUE_RULES §3-bis) e ha già la sua casa.
// Riscriverne il valore qui significherebbe che il giorno in cui il
// regolamento cambia il rilancio, una delle due copie resta indietro.
//
// ─────────────────────────────────────────────────────────────────────────────
// NESSUNO ZERO AL POSTO DI UN'ASSENZA
// ─────────────────────────────────────────────────────────────────────────────
//
// Ogni funzione di questo file è TOTALE e non lancia mai: produce o un numero
// con la sua catena o un'assenza col suo motivo, e il vocabolario dei motivi è
// chiuso. `D` è `null` quando `V` non esiste E quando il `drain` non si forma
// (tipicamente perché `P̂` non esiste, §D.7): la riga resta candidabile —
// l'esposizione è binaria e non dipende da `P̂` — e si ordina dopo quelle col
// divario misurato, dichiarandolo. È la stessa disciplina di
// `compareCreditSurplus` (./creditValue.ts), e vale qui alla lettera.

import { maxSafe } from "./auction.js";
import { MINIMUM_RAISE } from "./relativeValue.js";
import {
  type CreditValueMissingReason,
  type CreditValueReading,
  type CreditValueSource,
} from "./creditValue.js";
import {
  type ExpectedPriceMissingReason,
  type ExpectedPriceReading,
} from "./expectedPrice.js";
import { COST_FLOOR, type Role, type TeamState } from "./types.js";

// ─── L'interruttore ──────────────────────────────────────────────────────────

/**
 * IL DEFAULT È SPENTO. Vedi l'intestazione: lo accende soltanto un test T-E
 * eseguito e chiuso, e «non eseguito» equivale a «non chiuso».
 */
export const UPLIFT_DEFAULT_ENABLED = false;

/**
 * Lo stato dell'interruttore, con la provenienza accanto: un booleano nudo
 * direbbe «acceso» o «spento» senza dire chi l'ha deciso, e sarebbe
 * indistinguibile da un flag lasciato lì da qualcuno.
 */
export interface UpliftSwitch {
  readonly enabled: boolean;
  /** Chi ha deciso questo stato. Vocabolario chiuso, due voci. */
  readonly provenance: UpliftSwitchProvenance;
}

export type UpliftSwitchProvenance =
  /** Nessun T-E chiuso: l'inventario del DTI lascia l'interruttore a `off`. */
  | "default-spento-test-non-chiuso"
  /** Un T-E eseguito e chiuso lo ha acceso. Non è uno stato che il codice si dà da sé. */
  | "acceso-da-test-chiuso";

/** L'interruttore come arriva se nessuno lo tocca: spento, col proprio motivo. */
export const DEFAULT_UPLIFT_SWITCH: UpliftSwitch = Object.freeze({
  enabled: UPLIFT_DEFAULT_ENABLED,
  provenance: "default-spento-test-non-chiuso",
});

// ─── Il sovrapprezzo, iniettato ──────────────────────────────────────────────

/**
 * L'unica provenienza ammessa per un uplift. È un letterale nel TIPO, non una
 * stringa libera: un numero che arrivasse da un'altra ricetta non potrebbe
 * nemmeno essere scritto qui dentro senza cambiare questa riga.
 */
export const SPEND_UPLIFT_PROVENANCE =
  "mediana dei rapporti prezzo/curva, righe unite dei fatti dei precedenti";

/**
 * IL CONTRATTO DI INIEZIONE del sovrapprezzo — stessa postura del contratto di
 * iniezione dell'ordinamento in ./tiers.ts: il motore riceve il numero già
 * misurato, con la sua `n` e la sua provenienza, e non ha modo di produrlo.
 *
 * TRE CAMPI, E NESSUN ALTRO. In particolare non c'è un campo «profili», non c'è
 * un campo «tifo» e non c'è un campo «intensità»: il tifo non ha un canale per
 * entrare qui, e le asserzioni in fondo al file lo pinnano a `tsc --noEmit`.
 */
export interface SpendUpliftInjection {
  /** `uplift_o(i)`, adimensionale. `null` quando non è misurabile: mai 1 al suo posto. */
  readonly ratio: number | null;
  /** Le righe che lo compongono. `0` quando `ratio` è `null`. */
  readonly n: number;
  readonly provenance: typeof SPEND_UPLIFT_PROVENANCE;
}

// ─── `E_o(i)` — la spesa attesa di un avversario ─────────────────────────────

/** Perché `E_o` NON si forma per questo avversario. Vocabolario chiuso. */
export type ExpectedSpendMissingReason =
  /** Il reparto di quel ruolo è pieno: non ha dove metterlo. */
  | "ruolo-pieno"
  /** `maxSafe` non è biddable: la riserva dura gli blocca il budget. */
  | "budget-bloccato"
  /** `P̂` non esiste per questa riga: senza prezzo non c'è spesa attesa (§D.7). */
  | "prezzo-assente";

/** Su che cosa poggia il numero. Due cose diverse, e si dice sempre quale. */
export type ExpectedSpendBasis =
  /** Il sovrapprezzo MISURATO di questa persona su questo profilo. */
  | "sovrapprezzo-misurato"
  /** Un TETTO DI MERCATO, uguale per ogni esposto: `min(maxSafe, P̂)`. */
  | "tetto-di-mercato";

/** Perché il numero è un tetto di mercato invece del sovrapprezzo di quella persona. */
export type MarketCeilingReason =
  /** L'interruttore è spento: nessun T-E chiuso lo ha acceso. */
  | "interruttore-spento"
  /** L'interruttore è acceso ma il sovrapprezzo non è misurabile su questa persona. */
  | "sovrapprezzo-non-misurato";

/**
 * LA CATENA, passo per passo, accanto al numero: una derivazione che non sa dire
 * da dove viene è indistinguibile da un numero inventato. Stessa postura di
 * `RelativePriceChain` e di `ExpectedPriceChain`.
 */
export interface ExpectedSpendChain {
  readonly role: Role;
  /** `maxSafe(o, ruolo)`, interrogata e non riderivata. */
  readonly maxSafe: number;
  /** `P̂_mercato(i)`: il prezzo di mercato PRIMA del tetto del più ricco. */
  readonly marketPrice: number;
  /** `P̂(i)`: lo stesso prezzo dopo quel tetto. È il tetto di mercato del ramo spento. */
  readonly expectedPrice: number;
  /** Il sovrapprezzo iniettato, `null` quando non è misurabile. */
  readonly upliftRatio: number | null;
  /** Le righe su cui poggia. Viaggia sempre col rapporto. */
  readonly upliftSample: number;
  /** `true` solo quando l'interruttore è acceso E il rapporto è misurato. */
  readonly upliftApplied: boolean;
  readonly switchEnabled: boolean;
  readonly switchProvenance: UpliftSwitchProvenance;
  /** `max(COST_FLOOR, round(P̂_mercato × uplift))`, prima del tetto. `null` se non applicato. */
  readonly upliftedPrice: number | null;
  /** `true` quando il pavimento di un credito ha morso sul prodotto. */
  readonly flooredAtCostFloor: boolean;
  readonly basis: ExpectedSpendBasis;
  readonly marketCeilingReason: MarketCeilingReason | null;
  /** `true` quando è il tetto della persona ad aver fissato il numero. */
  readonly cappedByMaxSafe: boolean;
}

export interface ExpectedSpendCredits {
  readonly kind: "spesa";
  /** Il POSTO a tavola: è così che la riga si scrive. */
  readonly fantaTeamId: string;
  /** `E_o(i)`, crediti interi. Uno SCALARE, mai una banda. */
  readonly credits: number;
  readonly chain: ExpectedSpendChain;
}

export interface ExpectedSpendAbsent {
  readonly kind: "assente";
  readonly fantaTeamId: string;
  readonly reason: ExpectedSpendMissingReason;
  /** Il motivo dell'ingrediente mancante, così il chiamante conta la causa vera. */
  readonly priceReason: ExpectedPriceMissingReason | null;
}

export type ExpectedSpendReading = ExpectedSpendCredits | ExpectedSpendAbsent;

export interface ExpectedSpendInput {
  /** Il posto dell'avversario. La riga parla di posti, i precedenti di persone. */
  readonly fantaTeamId: string;
  /** Lo stato contabile dell'avversario, dal reducer. `maxSafe` si legge da qui. */
  readonly team: TeamState;
  readonly role: Role;
  /** `P̂` con la sua catena: `marketPrice` e `credits` vengono entrambi da qui. */
  readonly price: ExpectedPriceReading;
  /** Il sovrapprezzo iniettato. `null` = non misurato, che non è «uguale a 1». */
  readonly uplift: SpendUpliftInjection | null;
  /** Omesso: `DEFAULT_UPLIFT_SWITCH`, cioè spento. */
  readonly upliftSwitch?: UpliftSwitch;
}

/**
 * `E_o(i)` — quanti crediti è plausibile che questo avversario arrivi a mettere
 * su questo giocatore, per aritmetica dichiarata su ciò che ha già fatto.
 *
 * Deterministica e totale: non lancia mai, e ogni ingresso produce o un numero
 * con la sua catena o un'assenza col suo motivo.
 */
export function expectedSpendReading(input: ExpectedSpendInput): ExpectedSpendReading {
  const { fantaTeamId } = input;
  const safe = maxSafe(input.team, input.role);
  if (!safe.biddable) {
    // I DUE MOTIVI, nell'ordine in cui si annidano — stesso criterio di
    // `relativePriceReading`: un ruolo pieno ha per forza anche `maxSafe` a
    // zero, ma dire che il problema è il budget sarebbe falso.
    return {
      kind: "assente",
      fantaTeamId,
      reason: input.team.slotsRemaining[input.role] <= 0 ? "ruolo-pieno" : "budget-bloccato",
      priceReason: null,
    };
  }

  if (input.price.kind === "assente") {
    return {
      kind: "assente",
      fantaTeamId,
      reason: "prezzo-assente",
      priceReason: input.price.reason,
    };
  }

  const sw = input.upliftSwitch ?? DEFAULT_UPLIFT_SWITCH;
  const ratio = input.uplift === null ? null : input.uplift.ratio;
  const upliftSample = input.uplift === null ? 0 : input.uplift.n;
  const applied = sw.enabled && ratio !== null;
  const marketCeilingReason: MarketCeilingReason | null = applied
    ? null
    : sw.enabled
      ? "sovrapprezzo-non-misurato"
      : "interruttore-spento";

  const marketPrice = input.price.chain.marketPrice;
  const expectedPrice = input.price.credits;

  // IL PAVIMENTO DI UN CREDITO, dichiarato dove morde. `P̂_mercato` lo porta già
  // (./expectedPrice.ts: `max(COST_FLOOR, round(...))`); un uplift sotto 1 su
  // una riga da un credito potrebbe altrimenti produrre `E_o = 0`, cioè la
  // frase «si aspetta di spendere zero» su una persona che il cancello
  // dell'esposizione ha già dichiarato capace di pagare il prezzo base. Non è
  // un tetto e non è un peso: è lo stesso pavimento, applicato dove il prodotto
  // potrebbe scenderci sotto, e il campo `flooredAtCostFloor` lo dice.
  const rawUplifted = applied ? Math.round(marketPrice * (ratio as number)) : null;
  const upliftedPrice = rawUplifted === null ? null : Math.max(COST_FLOOR, rawUplifted);
  const ceiling = upliftedPrice === null ? expectedPrice : upliftedPrice;
  const credits = Math.min(safe.maxSafe, ceiling);

  return {
    kind: "spesa",
    fantaTeamId,
    credits,
    chain: {
      role: input.role,
      maxSafe: safe.maxSafe,
      marketPrice,
      expectedPrice,
      upliftRatio: ratio,
      upliftSample,
      upliftApplied: applied,
      switchEnabled: sw.enabled,
      switchProvenance: sw.provenance,
      upliftedPrice,
      flooredAtCostFloor: rawUplifted !== null && rawUplifted < COST_FLOOR,
      basis: applied ? "sovrapprezzo-misurato" : "tetto-di-mercato",
      marketCeilingReason,
      cappedByMaxSafe: safe.maxSafe < ceiling,
    },
  };
}

/** I crediti di una spesa attesa, o `null` quando non si forma. Mai uno zero al suo posto. */
export function expectedSpendCredits(reading: ExpectedSpendReading): number | null {
  return reading.kind === "spesa" ? reading.credits : null;
}

// ─── `drain(i)` — quanto brucia il tavolo ────────────────────────────────────

/** Perché il `drain` NON si forma. Vocabolario chiuso. */
export type DrainMissingReason =
  /** Nessun esposto: non c'è nessuno da far spendere. */
  | "nessun-esposto"
  /** Due o più esposti, ma meno di due spese attese formate: il secondo non esiste. */
  | "spesa-attesa-assente";

/** Quale regola ha fissato il numero. Uno solo, e si dice quale. */
export type DrainBasis =
  /** `secondo + MINIMUM_RAISE`, col tetto al massimo: la scala degli esposti. */
  | "scala-degli-esposti"
  /** Il tetto del massimo ha morso: nemmeno lui arriva a `secondo + 1`. */
  | "tetto-del-massimo"
  /** Un solo esposto: nessuna gara attesa, resta al prezzo base. */
  | "un-solo-esposto";

/**
 * IL CENSIMENTO — ciò che si sa comunque, anche quando il numero non si forma.
 * Vive separato dalla catena perché un `drain` assente non ha una `basis`: una
 * regola che ha deciso un numero che non c'è sarebbe un'etichetta vuota.
 */
export interface DrainCensus {
  /** Quanti ESPOSTI ci sono. Un censimento binario, mai una misura di desiderio. */
  readonly exposedCount: number;
  /** Quanti di loro hanno una spesa attesa formata. */
  readonly spendCount: number;
  /** Il massimo fra le `E_o`: il tetto. `null` quando la scala non si forma. */
  readonly highestSpend: number | null;
  /** Il secondo massimo fra le `E_o`: la scala. `null` quando non si forma. */
  readonly secondSpend: number | null;
  /** `secondSpend + MINIMUM_RAISE`, prima del tetto. */
  readonly rivalScale: number | null;
  /** Il prezzo base, dichiarato e mai dedotto. */
  readonly openingPrice: number;
}

export interface DrainChain extends DrainCensus {
  readonly basis: DrainBasis;
}

export interface DrainCredits {
  readonly kind: "drain";
  /** `drain(i)`, crediti interi. */
  readonly credits: number;
  readonly chain: DrainChain;
  /** Le spese attese che l'hanno prodotto, decrescenti. La prova accanto al numero. */
  readonly spends: readonly ExpectedSpendCredits[];
}

export interface DrainAbsent {
  readonly kind: "assente";
  readonly reason: DrainMissingReason;
  /** Il censimento resta leggibile: «zero esposti» e «nessun prezzo» sono due fatti. */
  readonly census: DrainCensus;
}

export type DrainReading = DrainCredits | DrainAbsent;

export interface DrainInput {
  /**
   * UNA VOCE PER ESPOSTO, formata o no. La lunghezza di questa lista È
   * `|esposti(i)|`: il censimento è binario e non dipende da `P̂`, quindi non
   * si conta filtrando le spese attese — con `P̂` assente resterebbero zero
   * esposti, e la riga direbbe «non lo vuole nessuno» invece di «non lo so».
   */
  readonly spends: readonly ExpectedSpendReading[];
  /** Omesso: `COST_FLOOR`, il prezzo base dichiarato per l'esca. */
  readonly openingPrice?: number;
}

/**
 * `drain(i)` — quanti crediti il tavolo brucia se l'esca parte.
 *
 * Deterministica e totale. Ordinamento: `E_o` decrescente, `fantaTeamId`
 * crescente a parità — totale e stabile, così «il secondo» è sempre lo stesso
 * secondo.
 */
export function drainReading(input: DrainInput): DrainReading {
  const openingPrice = input.openingPrice ?? COST_FLOOR;
  const exposedCount = input.spends.length;
  const formed = input.spends
    .filter((s): s is ExpectedSpendCredits => s.kind === "spesa")
    .sort((a, b) => b.credits - a.credits || a.fantaTeamId.localeCompare(b.fantaTeamId));

  const base = {
    exposedCount,
    spendCount: formed.length,
    highestSpend: null,
    secondSpend: null,
    rivalScale: null,
    openingPrice,
  };

  if (exposedCount === 0) {
    return { kind: "assente", reason: "nessun-esposto", census: base };
  }

  if (exposedCount === 1) {
    // NESSUNA GARA ATTESA. Il numero è il prezzo base, ed è un fatto: con un
    // solo interessato l'esca gli resta lì e il tavolo non si è prosciugato.
    // Non serve che la sua `E_o` esista — «quanto arriverebbe a mettere» è una
    // domanda su una gara che non ci sarà.
    return {
      kind: "drain",
      credits: openingPrice,
      chain: { ...base, basis: "un-solo-esposto" },
      spends: formed,
    };
  }

  if (formed.length < 2) {
    return { kind: "assente", reason: "spesa-attesa-assente", census: base };
  }

  const highestSpend = formed[0]!.credits;
  const secondSpend = formed[1]!.credits;
  const rivalScale = secondSpend + MINIMUM_RAISE;
  const credits = Math.min(rivalScale, highestSpend);

  return {
    kind: "drain",
    credits,
    chain: {
      exposedCount,
      spendCount: formed.length,
      highestSpend,
      secondSpend,
      rivalScale,
      openingPrice,
      // LA PARITÀ VA ALLA SCALA, esattamente come in `relativePriceReading`: il
      // `<=` non sposta il numero — `Math.min` non distingue i pari — ma cambia
      // l'ETICHETTA, e con lei la frase che la riga mostra.
      basis: rivalScale <= highestSpend ? "scala-degli-esposti" : "tetto-del-massimo",
    },
    spends: formed,
  };
}

/** I crediti di un `drain`, o `null` quando non si forma. */
export function drainCredits(reading: DrainReading): number | null {
  return reading.kind === "drain" ? reading.credits : null;
}

// ─── `D(i)` — il divario, e `S_base(i)` — il piano B con un numero ───────────

/** Perché `D` non esiste. Due casi, distinti perché sono due fatti diversi. */
export type DrainGapMissingReason =
  /** `V` non esiste per questa riga. */
  | "valore-assente"
  /** `V` esiste ma il `drain` no: tipicamente `P̂` assente, o nessun esposto. */
  | "drain-assente";

export interface DrainGapCredits {
  readonly kind: "divario";
  /** `D(i) = drain(i) − V(i)`. Può essere ≤ 0: ordina, non esclude. */
  readonly credits: number;
  readonly drain: number;
  /** `V(i)`, col suo `source`: chi legge `D` sa di quale valore è la sottrazione. */
  readonly worth: number;
  readonly worthSource: CreditValueSource;
  readonly drainBasis: DrainBasis;
}

export interface DrainGapAbsent {
  readonly kind: "assente";
  readonly reason: DrainGapMissingReason;
  /** Il motivo dell'ingrediente mancante, così il chiamante conta la causa vera. */
  readonly worthReason: CreditValueMissingReason | null;
  readonly drainReason: DrainMissingReason | null;
}

export type DrainGapReading = DrainGapCredits | DrainGapAbsent;

/**
 * `D(i)` — «quanti crediti veri il tavolo brucerà sopra il valore»: la misura
 * letterale dell'«ingolfare».
 *
 * `null` HA DUE CASI, e il secondo è quello che si dimentica: `V` assente, e
 * `drain` assente (che include `P̂` assente, §D.7). La riga resta candidabile e
 * si ordina in coda, contata — mai uno zero, che sarebbe la dichiarazione «il
 * tavolo brucia esattamente quanto vale», che nessuno ha fatto.
 */
export function drainGapReading(
  drain: DrainReading,
  worth: CreditValueReading,
): DrainGapReading {
  if (worth.kind === "assente") {
    return {
      kind: "assente",
      reason: "valore-assente",
      worthReason: worth.reason,
      drainReason: drain.kind === "assente" ? drain.reason : null,
    };
  }
  if (drain.kind === "assente") {
    return {
      kind: "assente",
      reason: "drain-assente",
      worthReason: null,
      drainReason: drain.reason,
    };
  }
  return {
    kind: "divario",
    credits: drain.credits - worth.credits,
    drain: drain.credits,
    worth: worth.credits,
    worthSource: worth.source,
    drainBasis: drain.chain.basis,
  };
}

/** I crediti di un divario, o `null` quando non esiste. */
export function drainGapCredits(reading: DrainGapReading): number | null {
  return reading.kind === "divario" ? reading.credits : null;
}

export interface BaseSurplusCredits {
  readonly kind: "surplus-base";
  /** `S_base(i) = V(i) − prezzo base`. Può essere ≤ 0. */
  readonly credits: number;
  readonly worth: number;
  readonly worthSource: CreditValueSource;
  readonly openingPrice: number;
}

export type BaseSurplusReading =
  | BaseSurplusCredits
  | {
      readonly kind: "assente";
      readonly reason: CreditValueMissingReason;
    };

/**
 * `S_base(i)` — IL PIANO B CON UN NUMERO.
 *
 * Un'esca con `S_base > 0` è un'esca che, se resta a te, è comunque un acquisto
 * sotto il valore: l'avvertimento «se resta a me me lo prendo» smette di essere
 * una frase e diventa una sottrazione.
 *
 * NON DIPENDE DAL `drain`, di proposito: si mostra ogni volta che `V` esiste,
 * anche quando il tavolo non brucerà niente. È il caso in cui serve di più.
 */
export function baseSurplusReading(
  worth: CreditValueReading,
  openingPrice: number = COST_FLOOR,
): BaseSurplusReading {
  if (worth.kind === "assente") return { kind: "assente", reason: worth.reason };
  return {
    kind: "surplus-base",
    credits: worth.credits - openingPrice,
    worth: worth.credits,
    worthSource: worth.source,
    openingPrice,
  };
}

/** I crediti di un surplus di ripiego, o `null` quando non esiste. */
export function baseSurplusCredits(reading: BaseSurplusReading): number | null {
  return reading.kind === "surplus-base" ? reading.credits : null;
}

// ─── LE GUARDIE DI TIPO ──────────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, cioè al PRIMO comando di `npm run verify`, e vivono
// ACCANTO alla dichiarazione. Stessa famiglia — e stesso limite dichiarato — di
// `AssertNoProfilesChannel` in src/baitCandidates.ts.

type EmptyObject = { readonly [K in never]: never };
type RequiredKeysOf<T> = {
  [K in keyof T]-?: EmptyObject extends Pick<T, K> ? never : K;
}[keyof T];

/** L'ingresso di `E_o` non porta i profili d'intervista: il tifo non ha da dove entrare. */
type AssertNoProfilesChannel = "profiles" extends keyof ExpectedSpendInput ? never : true;
const _noProfilesChannel: AssertNoProfilesChannel = true;
void _noProfilesChannel;

/** Né una nota di tifo per un'altra strada. */
type AssertNoSupportedClubChannel = "supportedClub" extends keyof ExpectedSpendInput
  ? never
  : true;
const _noSupportedClubChannel: AssertNoSupportedClubChannel = true;
void _noSupportedClubChannel;

/** E nemmeno attraverso il contratto di iniezione del sovrapprezzo. */
type AssertUpliftCarriesNoProfiles = "profiles" | "supportedClub" extends
  keyof SpendUpliftInjection
  ? never
  : true;
const _upliftCarriesNoProfiles: AssertUpliftCarriesNoProfiles = true;
void _upliftCarriesNoProfiles;

/** Un sovrapprezzo non esiste senza la sua `n` e la sua provenienza: il tipo lo impone. */
type AssertUpliftCarriesSample = "ratio" | "n" | "provenance" extends
  RequiredKeysOf<SpendUpliftInjection>
  ? true
  : never;
const _upliftCarriesSample: AssertUpliftCarriesSample = true;
void _upliftCarriesSample;
