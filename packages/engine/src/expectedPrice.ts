// `P̂` — IL PREZZO ATTESO DI STASERA (NOM-PROTOCOL-A §A.2, passo 1 del nucleo
// P0). Puro, deterministico, engine-only: nessuna UI, nessuna rete, nessun dato
// reale. È l'ingrediente CONDIVISO dei due pannelli del blocco «giocatore
// suggerito», e per questo si costruisce per primo e da solo.
//
// LA CATENA, PASSO PER PASSO — scritta qui per intero perché è tutta
// l'aritmetica che c'è, e non ce n'è altra:
//
//   rango(i)      = posizione 1-based di i fra TUTTI i giocatori del suo ruolo
//                   (venduti inclusi) nell'ordine del listone per T1̂
//                   decrescente; pareggi: N̂ decrescente, poi chiave di listone
//   base(i)       = mediana della curva storica alla fascia di rango(i)
//   pool_ratio    = (crediti della lega − rinnovi dichiarati) / pool medio
//                   misurato sulle aste storiche
//   infl_r        = inflazione di RUOLO misurata stasera, e solo se qualificata
//                   (n_r ≥ MIN_INFLATION_SAMPLE)
//   P̂_mercato(i)  = max(COST_FLOOR, round(base(i) × pool_ratio × (1 + infl_r)))
//   P̂(i)          = min(P̂_mercato(i), max bid del PIÙ RICCO fra i rivali
//                   eleggibili sul ruolo)
//
// OGNI FATTORE MANCANTE È DICHIARATO, MAI SOSTITUITO DA UN 1 SILENZIOSO. Un
// moltiplicatore neutro e un moltiplicatore assente producono lo stesso numero
// e sono due affermazioni diverse: la prima dice «misurato, e non sposta
// niente», la seconda «non misurato». La provenienza porta quale delle due è.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'INCERTEZZA NON È UN OPZIONALE: È NEL TIPO
// ─────────────────────────────────────────────────────────────────────────────
//
// §B.3 del DTI vieta di mostrare `P̂` senza i suoi tre qualificatori (`n`,
// scarto tipico, bias firmato). Qui il divieto non è un commento: lo scalare e
// il blocco d'incertezza vivono nello STESSO membro dell'unione e sono
// entrambi obbligatori, quindi non esiste un percorso di tipo che porti al
// numero senza portare anche i qualificatori. Due asserzioni di tipo in fondo
// al file lo pinnano a `tsc --noEmit`, cioè al primo comando di `npm run
// verify`, senza eseguire una riga di vitest.
//
// LA FORMA RESTA UNO SCALARE. `errMinus`/`errPlus` sono scarti dell'ERRORE
// STORICO della fascia, dichiarati accanto al numero — non sono un intervallo
// di prezzo del giocatore, che il divieto di forma di §D9 esclude e che questo
// modulo non produce da nessuna parte.
//
// ─────────────────────────────────────────────────────────────────────────────
// ACCANTO A `P̂`, MAI FUSO CON LUI
// ─────────────────────────────────────────────────────────────────────────────
//
// Il COSTO PER VINCERLO ADESSO è un altro fatto e ha già il suo modulo:
// `relativePriceReading()` (./relativeValue.ts), cioè «secondo max bid fra i
// rivali eleggibili + 1» coi suoi due tetti. Questo file non lo chiama, non lo
// media con `P̂` e non lo fonde: una media fra i due sarebbe un peso scelto dal
// sistema, cioè esattamente ciò che §D9 vieta. Sono due numeri, si mostrano
// entrambi, ciascuno con la propria provenienza.

import { priceCurveBandAt, AUCTION_POOL_CREDITS, type PriceCurveBook, type PriceRankBand } from "./priceHistory.js";
import { competitorSet } from "./competitors.js";
import { type MeasuredInflation } from "./anchors.js";
import { COST_FLOOR, ROLES, type AuctionState, type Role } from "./types.js";

/**
 * `R_rinnovi_2026` PRIMA DELLE DICHIARAZIONI: 489 crediti.
 *
 * È una media storica, non una misura di quest'anno, ed è dichiarata come tale
 * nell'inventario dei parametri del DTI (§E, «chiuso, sostituito dal dato reale
 * al tavolo»). Chi conosce le riconferme davvero dichiarate passa la loro somma
 * a `expectedPriceContext` e questo numero non entra: è un ripiego dichiarato,
 * non un default che si insedia.
 */
export const RENEWALS_SPEND_BEFORE_DECLARATIONS = 489;

// ─── IL RANGO ────────────────────────────────────────────────────────────────

/**
 * Le due previsioni che ordinano il listone, ESATTAMENTE come il deposito le
 * serve: `T1̂` (totale previsto) e `N̂` (presenze previste).
 *
 * QUESTO MODULO LE LEGGE, NON LE PRODUCE. Arrivano dal deposito servito sulla
 * riga di listone; qui non c'è nessuna ricetta, nessun modello e nessun modo di
 * fabbricarne una — una riga senza previsioni non riceve un rango inventato,
 * riceve un'assenza col suo motivo.
 */
export interface RankForecast {
  /** `T1̂` — totale previsto. Criterio primario dell'ordine. */
  readonly total: number;
  /** `N̂` — presenze previste. Primo pareggio. */
  readonly appearances: number;
}

/**
 * Una riga del listone come il rango la vede.
 *
 * `playerId` è la CHIAVE DI LISTONE — la stessa identità che l'event log usa
 * (`listonePlayerKey()` lato vista) — ed è per questo l'ultimo pareggio: non
 * serve un secondo campo per dire la stessa cosa.
 *
 * `sold` viaggia con la riga ma NON la esclude: i venduti entrano nel rango di
 * proposito (vedi `roleRankBook`). Il campo esiste perché la proprietà sia
 * ispezionabile nel risultato invece che affidata alla buona volontà di chi
 * costruisce la lista.
 */
export interface RankRow {
  readonly playerId: string;
  readonly role: Role;
  readonly forecast: RankForecast | null;
  readonly sold: boolean;
}

export interface RankEntry {
  readonly playerId: string;
  readonly role: Role;
  /** Posizione 1-based nel proprio ruolo. */
  readonly rank: number;
  readonly sold: boolean;
}

export interface RoleRankBook {
  readonly byPlayerId: ReadonlyMap<string, RankEntry>;
  /**
   * Le righe che non hanno ricevuto un rango perché non portano previsioni
   * utilizzabili. Non è un insieme di scarti: è ciò che permette di distinguere
   * «questa riga non ha il deposito» da «questo giocatore non l'ho mai visto»,
   * e sono due assenze diverse con due motivi diversi.
   */
  readonly withoutForecast: ReadonlySet<string>;
  /** Quanti giocatori hanno un rango, per ruolo. */
  readonly rankedByRole: ReadonlyMap<Role, number>;
  /** Quanti dei ranghi assegnati sono a giocatori GIÀ VENDUTI. Dichiarato. */
  readonly soldRanked: number;
  readonly rows: number;
}

/**
 * IL RANGO DI RUOLO, venduti inclusi.
 *
 * PERCHÉ I VENDUTI ENTRANO, e non è una svista da correggere: la curva storica
 * è costruita su aste COMPLETE, dove tutti i giocatori del ruolo erano ancora
 * in gioco. Il rango di mercato di un giocatore non migliora perché i migliori
 * sono già stati venduti — quella è scarsità, ed entra per un'altra via (il
 * tavolo, e il costo per vincerlo adesso). Escludere i venduti farebbe salire
 * di fascia ogni riga rimasta e leggerebbe la curva a un rango che nello
 * storico significava un giocatore diverso.
 *
 * ORDINE: `T1̂` decrescente, `N̂` decrescente, `playerId` crescente. Totale e
 * stabile: stesse righe → stessi ranghi, sempre.
 *
 * Una previsione non finita NON è una previsione: la riga finisce fra le
 * `withoutForecast`, non in fondo alla classifica. Metterla in fondo sarebbe
 * dire «è il peggiore», che è un verdetto che nessuno ha emesso.
 */
export function roleRankBook(rows: readonly RankRow[]): RoleRankBook {
  const byPlayerId = new Map<string, RankEntry>();
  const withoutForecast = new Set<string>();
  const rankedByRole = new Map<Role, number>();
  let soldRanked = 0;

  for (const role of ROLES) {
    const ranked = rows
      .filter((r) => r.role === role)
      .filter((r) => {
        const usable =
          r.forecast !== null &&
          Number.isFinite(r.forecast.total) &&
          Number.isFinite(r.forecast.appearances);
        if (!usable) withoutForecast.add(r.playerId);
        return usable;
      })
      .sort(
        (a, b) =>
          b.forecast!.total - a.forecast!.total ||
          b.forecast!.appearances - a.forecast!.appearances ||
          a.playerId.localeCompare(b.playerId),
      );

    ranked.forEach((row, i) => {
      byPlayerId.set(row.playerId, {
        playerId: row.playerId,
        role: row.role,
        rank: i + 1,
        sold: row.sold,
      });
      if (row.sold) soldRanked += 1;
    });
    rankedByRole.set(role, ranked.length);
  }

  return { byPlayerId, withoutForecast, rankedByRole, soldRanked, rows: rows.length };
}

// ─── IL TETTO DEL PIÙ RICCO ──────────────────────────────────────────────────

/**
 * Il max bid vero del PIÙ RICCO fra i rivali eleggibili, per ruolo.
 *
 * QUATTRO CHIAMATE A `competitorSet`, NON UNA PER CANDIDATO. L'insieme
 * eleggibile dipende da (stato, ruolo, soglia) e NON dal giocatore: al floor,
 * il più ricco rivale del ruolo è lo stesso per tutte le righe di quel ruolo.
 * Interrogarlo per candidato sarebbe centinaia di volte lo stesso lavoro a ogni
 * render — lo stesso errore che src/baitCandidates.ts evita costruendo
 * l'esposizione una volta per lettura.
 *
 * `null` quando NESSUN rivale può competere: non c'è un tetto, e zero non è un
 * tetto — sarebbe la dichiarazione «costa 0», che nessuno ha fatto.
 */
export function richestRivalCaps(
  state: AuctionState,
  selfId: string,
): ReadonlyMap<Role, number | null> {
  const caps = new Map<Role, number | null>();
  for (const role of ROLES) {
    // `eligible` arriva già in fila per max bid decrescente: nessun `sort` qui.
    const eligible = competitorSet(state, role, COST_FLOOR, selfId).eligible;
    caps.set(role, eligible.length === 0 ? null : eligible[0]!.maxBid);
  }
  return caps;
}

// ─── IL CONTESTO DI UNA LETTURA ──────────────────────────────────────────────

/** Perché `pool_ratio` non esiste. Vocabolario chiuso. */
export type PoolRatioUnavailableReason =
  /** Lo storico non produce un pool medio: nessuna stagione, o pool non positivo. */
  | "no-mean-train-pool"
  /** I rinnovi dichiarati assorbono tutti i crediti: il pool di stasera non è positivo. */
  | "current-pool-not-positive";

export interface ExpectedPriceContextInput {
  readonly curves: PriceCurveBook;
  readonly ranks: RoleRankBook;
  /** L'inflazione misurata STASERA, dal log e dalle ancore. Letta, non riderivata. */
  readonly inflation: MeasuredInflation;
  readonly state: AuctionState;
  readonly selfId: string;
  /**
   * La somma dei prezzi delle riconferme DICHIARATE. Omessa: si usa il ripiego
   * dichiarato `RENEWALS_SPEND_BEFORE_DECLARATIONS`, e la provenienza lo dice.
   */
  readonly renewalsSpend?: number;
}

/**
 * Tutto ciò che non dipende dal singolo giocatore, calcolato UNA VOLTA per
 * lettura: il pool di stasera, il rapporto coi pool storici e i quattro tetti.
 *
 * Chi legge cento candidati costruisce questo una volta e chiama
 * `expectedPriceReading` cento volte su una manciata di ricerche su `Map`.
 */
export interface ExpectedPriceContext {
  readonly curves: PriceCurveBook;
  readonly ranks: RoleRankBook;
  readonly inflation: MeasuredInflation;
  readonly caps: ReadonlyMap<Role, number | null>;
  readonly renewalsSpend: number;
  /** `true` quando `renewalsSpend` è il ripiego e non un dato dichiarato. */
  readonly renewalsSpendIsFallback: boolean;
  readonly currentPool: number;
  readonly poolRatio: number | null;
  readonly poolRatioReason: PoolRatioUnavailableReason | null;
}

export function expectedPriceContext(input: ExpectedPriceContextInput): ExpectedPriceContext {
  const renewalsSpendIsFallback = input.renewalsSpend === undefined;
  const renewalsSpend = input.renewalsSpend ?? RENEWALS_SPEND_BEFORE_DECLARATIONS;
  const currentPool = AUCTION_POOL_CREDITS - renewalsSpend;
  const meanTrainPool = input.curves.meanTrainPool;

  const poolRatioReason: PoolRatioUnavailableReason | null =
    meanTrainPool === null || meanTrainPool <= 0
      ? "no-mean-train-pool"
      : currentPool <= 0
        ? "current-pool-not-positive"
        : null;

  return {
    curves: input.curves,
    ranks: input.ranks,
    inflation: input.inflation,
    caps: richestRivalCaps(input.state, input.selfId),
    renewalsSpend,
    renewalsSpendIsFallback,
    currentPool,
    poolRatio: poolRatioReason === null ? currentPool / (meanTrainPool as number) : null,
    poolRatioReason,
  };
}

// ─── LA LETTURA ──────────────────────────────────────────────────────────────

/** Perché `P̂` NON esiste per questa riga. Vocabolario chiuso, nessun numero dietro. */
export type ExpectedPriceMissingReason =
  /** Nessuna curva formabile: storico assente o senza acquisti d'asta. */
  | "curva-assente"
  /** La riga non porta il deposito: senza `T1̂` non c'è rango, e senza rango non c'è base. */
  | "previsione-assente"
  /** Il giocatore non è nel listone da cui il rango è stato costruito. */
  | "rango-ignoto"
  /** La fascia di quel rango non ha nessuna osservazione storica. */
  | "fascia-senza-osservazioni"
  /** La fascia ha osservazioni ma sotto il minimo dichiarato: cold start. */
  | "fascia-sotto-campione";

/** Su quale inflazione poggia il fattore di serata, dichiarato nel dato. */
export type ExpectedPriceInflationBasis =
  /** Inflazione di RUOLO misurata stasera, con campione sufficiente. */
  | "role-inflation"
  /** Nessuna: il fattore non entra nella catena, e non è un 1 travestito da misura. */
  | "none";

/**
 * IL BLOCCO D'INCERTEZZA, obbligatorio e inseparabile dal numero.
 *
 * `errMinus`/`errPlus` sono gli scarti della FASCIA — `mediana − P25` e `P75 −
 * mediana` dei prezzi storici che compongono la fascia — cioè fatti
 * sull'errore tipico della curva, non un intervallo di prezzo del giocatore.
 * Si prendono dalla fascia GREZZA, come §A.2 del DTI li definisce, e non
 * riscalati dai fattori della catena: sono la dispersione misurata dello
 * storico, e riscalarla la trasformerebbe in una previsione di dispersione,
 * che nessuno ha misurato. Il fattore applicato resta leggibile nella catena
 * (`appliedFactor`) per chi debba confrontare le due grandezze.
 */
export interface ExpectedPriceUncertainty {
  /** `mediana − P25` della fascia: quanto tipicamente si sbaglia in meno. */
  readonly errMinus: number;
  /** `P75 − mediana` della fascia: quanto tipicamente si sbaglia in più. */
  readonly errPlus: number;
  /** `media(mediana − pagato)` della fascia. Negativo: la curva legge basso. */
  readonly signedBias: number;
  /** La direzione del bias, detta a parole chiuse invece che dedotta dal segno. */
  readonly biasDirection: ExpectedPriceBiasDirection;
  /** Osservazioni storiche della fascia. Viaggia sempre col numero. */
  readonly n: number;
}

export type ExpectedPriceBiasDirection = "basso" | "alto" | "nessuno";

/**
 * LA CATENA, passo per passo, accanto al numero: una derivazione che non sa
 * dire da dove viene è indistinguibile da un numero inventato. Stessa postura
 * di `RelativePriceChain` in ./relativeValue.ts.
 */
export interface ExpectedPriceChain {
  readonly role: Role;
  readonly rank: number;
  readonly band: PriceRankBand;
  /** `base(i)`: la mediana della fascia, prima di ogni fattore. */
  readonly base: number;
  readonly poolRatio: number | null;
  readonly poolRatioReason: PoolRatioUnavailableReason | null;
  readonly currentPool: number;
  readonly meanTrainPool: number | null;
  /** L'inflazione di ruolo effettivamente applicata, `null` se non qualificata. */
  readonly roleInflation: number | null;
  readonly inflationBasis: ExpectedPriceInflationBasis;
  /** `n_r` della misura d'inflazione del ruolo, qualificata o no. */
  readonly inflationSample: number;
  /** Il prodotto dei soli fattori DAVVERO applicati. 1 = nessuno è entrato. */
  readonly appliedFactor: number;
  /** `P̂_mercato`, prima del tetto. */
  readonly marketPrice: number;
  /** Max bid del più ricco rivale eleggibile, `null` quando non ce n'è nessuno. */
  readonly richestRivalMaxBid: number | null;
  /** `true` quando è il tetto ad aver fissato il numero, non il mercato. */
  readonly cappedByRichest: boolean;
}

/** Il numero, con tutto ciò che deve viaggiare con lui. Mai l'uno senza l'altro. */
export interface ExpectedPriceCredits {
  readonly kind: "prezzo";
  /** `P̂(i)`, crediti interi. Uno SCALARE, mai una banda. */
  readonly credits: number;
  readonly uncertainty: ExpectedPriceUncertainty;
  readonly chain: ExpectedPriceChain;
}

export type ExpectedPriceReading =
  | ExpectedPriceCredits
  | { readonly kind: "assente"; readonly reason: ExpectedPriceMissingReason };

/**
 * `P̂` per un giocatore, dal contesto già costruito.
 *
 * Deterministica e TOTALE: ogni ingresso produce o un prezzo con la sua catena
 * e la sua incertezza, o un'assenza col suo motivo. Non lancia mai — nessuna
 * eccezione sul percorso critico — e non restituisce mai uno zero al posto di
 * un'assenza né una media di ruolo al posto di una fascia vuota.
 */
export function expectedPriceReading(
  playerId: string,
  context: ExpectedPriceContext,
): ExpectedPriceReading {
  const entry = context.ranks.byPlayerId.get(playerId);
  if (entry === undefined) {
    // Le due assenze si distinguono, perché sono due fatti diversi: una riga
    // che il listone ha ma il deposito non serve, e un giocatore che il listone
    // non ha proprio.
    return {
      kind: "assente",
      reason: context.ranks.withoutForecast.has(playerId) ? "previsione-assente" : "rango-ignoto",
    };
  }

  if (context.curves.reason !== null) return { kind: "assente", reason: "curva-assente" };

  const band = priceCurveBandAt(context.curves, entry.role, entry.rank);
  if (band === null || band.reason === "no-observations") {
    return { kind: "assente", reason: "fascia-senza-osservazioni" };
  }
  if (!band.sufficient) return { kind: "assente", reason: "fascia-sotto-campione" };

  // Da qui in poi i quattro quantili e il bias della fascia sono non-null per
  // costruzione (`sufficient` è vero solo quando lo sono tutti insieme).
  const base = band.median as number;
  const p25 = band.p25 as number;
  const p75 = band.p75 as number;
  const signedBias = band.signedBias as number;

  const roleMeasure = context.inflation.perRole[entry.role];
  const inflationApplies = roleMeasure.sufficient && roleMeasure.inflation !== null;
  const roleInflation = inflationApplies ? (roleMeasure.inflation as number) : null;

  // I FATTORI CHE ENTRANO DAVVERO. Un fattore assente non diventa 1: non entra
  // nel prodotto, e la catena dice che non c'è.
  let appliedFactor = 1;
  if (context.poolRatio !== null) appliedFactor *= context.poolRatio;
  if (roleInflation !== null) appliedFactor *= 1 + roleInflation;

  const marketPrice = Math.max(COST_FLOOR, Math.round(base * appliedFactor));
  const richestRivalMaxBid = context.caps.get(entry.role) ?? null;
  // Il tetto non ha bisogno di un secondo `max` col floor: un rivale eleggibile
  // al floor ha per costruzione un max bid ≥ COST_FLOOR.
  const credits =
    richestRivalMaxBid === null ? marketPrice : Math.min(marketPrice, richestRivalMaxBid);

  return {
    kind: "prezzo",
    credits,
    uncertainty: {
      errMinus: base - p25,
      errPlus: p75 - base,
      signedBias,
      biasDirection: signedBias < 0 ? "basso" : signedBias > 0 ? "alto" : "nessuno",
      n: band.n,
    },
    chain: {
      role: entry.role,
      rank: entry.rank,
      band: band.band,
      base,
      poolRatio: context.poolRatio,
      poolRatioReason: context.poolRatioReason,
      currentPool: context.currentPool,
      meanTrainPool: context.curves.meanTrainPool,
      roleInflation,
      inflationBasis: roleInflation === null ? "none" : "role-inflation",
      inflationSample: roleMeasure.n,
      appliedFactor,
      marketPrice,
      richestRivalMaxBid,
      cappedByRichest: richestRivalMaxBid !== null && credits < marketPrice,
    },
  };
}

// ─── LE DUE GUARDIE DI TIPO ──────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, vivono ACCANTO alla dichiarazione (quindi finiscono
// nello stesso hunk di diff di chi rendesse opzionale un qualificatore) e non
// hanno bisogno che vitest giri. Stessa famiglia di `AssertNoProfilesChannel`
// in src/baitCandidates.ts.

/** Le chiavi che un tipo dichiara OBBLIGATORIE. */
type EmptyObject = { readonly [K in never]: never };
type RequiredKeysOf<T> = {
  [K in keyof T]-?: EmptyObject extends Pick<T, K> ? never : K;
}[keyof T];

/** `P̂` non esiste senza il suo blocco d'incertezza: il tipo lo impone. */
type AssertPriceCarriesUncertainty = "credits" | "uncertainty" extends
  RequiredKeysOf<ExpectedPriceCredits>
  ? true
  : never;
const _priceCarriesUncertainty: AssertPriceCarriesUncertainty = true;
void _priceCarriesUncertainty;

/** I tre qualificatori di §B.3 sono obbligatori, tutti e tre insieme. */
type AssertThreeQualifiers = "errPlus" | "errMinus" | "signedBias" | "n" extends
  RequiredKeysOf<ExpectedPriceUncertainty>
  ? true
  : never;
const _threeQualifiers: AssertThreeQualifiers = true;
void _threeQualifiers;
