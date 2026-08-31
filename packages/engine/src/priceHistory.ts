// LA CURVA STORICA RANGO→PREZZO — il primo ingrediente di `P̂`, il prezzo
// atteso di stasera (NOM-PROTOCOL-A §A.2, passo 1 del nucleo P0). Puro,
// deterministico, engine-only: nessuna UI, nessuna rete, nessun dato reale.
//
// REGOLA DEI TRE INGREDIENTI (docs/DECISIONS.md §D9), la stessa di ./anchors.ts.
// Ogni numero prodotto qui è un FATTO MISURATO — i prezzi realmente pagati
// nelle aste passate, riga per riga — oppure un'ARITMETICA DICHIARATA su quei
// fatti, scritta per intero qui sotto, col campione (`n`) che viaggia sempre
// accanto al numero. Non c'è un terzo ingrediente: nessun peso scelto dal
// sistema, nessun coefficiente fittato, nessuna interpolazione silenziosa.
//
// ─────────────────────────────────────────────────────────────────────────────
// PERCHÉ QUESTA CURVA ESISTE QUI E NON SI IMPORTA QUELLA CHE ESISTE GIÀ
// ─────────────────────────────────────────────────────────────────────────────
//
// Una curva rango→prezzo vive già nella corsia degli Indici
// (`genProtocol/priceCurve.ts` del pacchetto dell'indice di appetibilità), e
// questo file ne REPLICA L'ARITMETICA senza importarla: il divieto di
// importare quel pacchetto da `src/` e dal motore è un'invariante dichiarata
// (vedi l'intestazione «CONTRATTO DI SOLA LETTURA» di src/ui/listone.ts) e non
// si tocca. La duplicazione è quindi voluta e dichiarata, non una svista —
// e non è nemmeno la stessa curva:
//
//  - là la popolazione sono le aste del TRAINING del generatore, qui è lo
//    storico d'asta caricato nel client, lo stesso che il pannello esca legge
//    per `ExposureBook` (src/baitCandidates.ts);
//  - là la tabella è per rango singolo con smoothing isotonico e riporto in
//    avanti, qui è per FASCE dichiarate (1–3, 4–8, 9–15, 16–30, 31+) e una
//    fascia senza campione NON viene riempita da nessuna vicina.
//
// Il quantile è il tipo 7 (lo stesso stimatore, aritmetica identica) perché due
// implementazioni diverse dello stesso quantile sono il modo in cui due
// schermate finiscono per scrivere due mediane diverse dello stesso storico.
//
// ─────────────────────────────────────────────────────────────────────────────
// COSA QUESTO MODULO NON È, DI PROPOSITO
// ─────────────────────────────────────────────────────────────────────────────
//
//  - NON è un valore: non dice quanto vale un giocatore per Owner
//    (`value`/`fair_to_me`/`target_band` restano fuori da questo file).
//  - NON produce un intervallo di prezzo per giocatore. I quantili qui sono
//    quantili dello STORICO di una fascia di rango — un fatto sull'errore
//    tipico della curva — e chi li mostra li mostra come scarti accanto a uno
//    scalare, mai come una banda «da X a Y» (divieto di forma, §B.3 del DTI).
//  - NON è un modello: non c'è nulla da fittare, nessun parametro appreso.
//    Si contano prezzi già pagati e si leggono i loro quantili.

import { INITIAL_BUDGET, NUM_FANTA_TEAMS, ROLES, type Role } from "./types.js";

/**
 * I crediti in gara di un'asta intera, PRIMA dei rinnovi: la dotazione della
 * lega, non un numero scritto a mano. `500 × 8 = 4.000` — se il regolamento
 * cambia budget o numero di squadre, il pool cambia con lui invece di restare
 * indietro in una costante copiata.
 */
export const AUCTION_POOL_CREDITS = INITIAL_BUDGET * NUM_FANTA_TEAMS;

/**
 * L'etichetta con cui lo storico registra un RINNOVO.
 *
 * La distinzione è load-bearing e vale qui esattamente come nei precedenti
 * d'asta: un rinnovo è un prezzo AMMINISTRATO, non formato in gara. Esce
 * quindi dalla popolazione della curva ED entra nel calcolo del pool, perché i
 * crediti spesi in rinnovi non sono più disponibili al tavolo.
 */
export const RENEWAL_ACQUISITION = "riconferma";

/**
 * Il campione minimo perché una fascia sia LEGGIBILE come curva.
 *
 * PARAMETRO NUOVO, E LO SI DICHIARA COME TALE: l'inventario dei parametri del
 * DTI (§E) non ne contiene uno per la numerosità di fascia, ma il mandato
 * chiede esplicitamente che «una fascia senza abbastanza osservazioni lo
 * dichiari e non inventi». Un minimo serve quindi per forza, e il valore non è
 * scelto qui a caso: è lo STESSO di `MIN_INFLATION_SAMPLE` (./anchors.ts),
 * l'unica soglia di campione già chiusa nel motore, per la stessa ragione —
 * quattro prezzi non fanno un quantile, fanno rumore con un'etichetta.
 *
 * È iniettabile (`PriceCurveOptions.minBandSample`) perché resti un ingresso
 * ispezionabile e non una costante nascosta nel calcolo.
 *
 * RATIFICATO A 5 IL 2026-08-31 — `docs/DECISIONS.md` §«Cinque letture del
 * motore dei pannelli di chiamata, chiuse in blocco», punto 5, che è l'unico
 * dei cinque a essere un PARAMETRO di §E e non una regola di implementazione:
 * lo status passa da «da ratificare» a chiuso, con provenienza `vice` e non
 * `pico`. La ragione registrata è la stessa che questo commento portava — «la
 * casa deve avere una sola risposta alla domanda quando un campione è
 * abbastanza grande per parlare» — e il costo di sbagliare resta il più basso
 * possibile: il valore non sposta un numero, cambia solo quante fasce restano
 * mute, e ogni fascia muta si vede e si conta.
 */
export const MIN_PRICE_BAND_SAMPLE = 5;

/**
 * Una fascia di rango: la coppia di estremi INTERI che la delimitano, inclusi.
 *
 * L'ultima è aperta a destra (`31+`) e lo dice con `openEnded`, non con un
 * numero grande scelto per comodità: «tutti gli altri» è una proprietà della
 * fascia, non un estremo misurato.
 */
export interface PriceRankBand {
  /** Posizione della fascia in `PRICE_RANK_BANDS`, 0-based. Identità stabile. */
  readonly index: number;
  /** Primo rango della fascia, incluso. */
  readonly rankFirst: number;
  /** Ultimo rango della fascia, incluso; `Number.POSITIVE_INFINITY` se aperta. */
  readonly rankLast: number;
  readonly openEnded: boolean;
}

/**
 * LE FASCE, dichiarate una volta: 1–3, 4–8, 9–15, 16–30, 31+.
 *
 * Sono le stesse fasce di residuo della corsia degli Indici, e la coincidenza è
 * voluta: se il generatore misura il proprio errore su quelle fasce e questo
 * modulo ne misurasse altre, i due errori non sarebbero più confrontabili.
 */
export const PRICE_RANK_BANDS: readonly PriceRankBand[] = [
  { index: 0, rankFirst: 1, rankLast: 3, openEnded: false },
  { index: 1, rankFirst: 4, rankLast: 8, openEnded: false },
  { index: 2, rankFirst: 9, rankLast: 15, openEnded: false },
  { index: 3, rankFirst: 16, rankLast: 30, openEnded: false },
  { index: 4, rankFirst: 31, rankLast: Number.POSITIVE_INFINITY, openEnded: true },
] as const;

/** La fascia di un rango, oppure `null` se il rango non è un intero ≥ 1. */
export function priceRankBandOf(rank: number): PriceRankBand | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  return PRICE_RANK_BANDS.find((b) => rank >= b.rankFirst && rank <= b.rankLast) ?? null;
}

/**
 * Una riga dello storico d'asta, col ruolo GIÀ RISOLTO dal chiamante.
 *
 * IL RUOLO NON È NELLO STORICO, ed è un fatto e non un'omissione: la riga
 * persistita porta stagione, persona, giocatore, club, prezzo e tipo di
 * acquisizione — non il ruolo. Il ruolo è quindi un ingresso di questo modulo,
 * risolto una volta dal chiamante (il listone lo porta per ogni riga) e passato
 * qui esplicitamente. Le righe d'asta per cui il ruolo non è risolvibile NON
 * entrano nella curva e NON spariscono: `historicalPurchases` le conta.
 *
 * `role` È `null` QUANDO IL RUOLO NON SI RISOLVE, e per i RINNOVI questo non è
 * una perdita: un rinnovo non entra mai nella curva, ma la sua spesa entra nel
 * pool — e il pool non ha ruoli. Legare la contabilità del pool alla
 * risoluzione dei ruoli farebbe sparire dai rinnovi ogni giocatore che oggi non
 * è più a listone, e il pool storico risulterebbe più ricco di quanto è stato.
 */
export interface HistoricalPurchase {
  /** L'asta di appartenenza: è il BLOCCO su cui si calcola il rango storico. */
  readonly season: string;
  readonly playerId: string;
  readonly role: Role | null;
  /** Crediti pagati, interi. */
  readonly price: number;
  /** Rinnovo: fuori dalla popolazione della curva, dentro il pool. */
  readonly renewal: boolean;
}

/**
 * La forma MINIMA che il chiamante deve portare da una riga di storico. È un
 * sottoinsieme strutturale della riga persistita dai precedenti d'asta: il
 * motore non importa quel pacchetto (sarebbe una dipendenza all'incontrario) e
 * non ne conosce il tipo — chiede i quattro campi che gli servono e basta.
 */
export interface HistoricalPurchaseInput {
  readonly season: string;
  readonly playerId: string;
  readonly price: number;
  readonly acquisition: string;
}

/**
 * Perché una riga di storico non è entrata. `role-unresolved` riguarda le sole
 * righe d'asta: un rinnovo senza ruolo entra lo stesso, perché serve al pool.
 */
export type HistoricalPurchaseSkip = "role-unresolved" | "price-invalid" | "season-empty";

export interface HistoricalPurchaseIntake {
  readonly rows: readonly HistoricalPurchase[];
  /** Righe lette in ingresso, prima di qualunque esclusione. */
  readonly seen: number;
  /** Righe escluse e perché: la copertura è dichiarata, mai silenziata. */
  readonly skipped: Readonly<Record<HistoricalPurchaseSkip, number>>;
}

/**
 * Le righe utili alla curva, col ruolo risolto e la copertura dichiarata.
 *
 * Non lancia mai: una riga rotta viene esclusa e contata, esattamente come
 * `measuredInflation` conta gli acquisti senza ancora in `missingAnchor`. Un
 * prezzo non finito o negativo attraverserebbe in silenzio ogni quantile e
 * produrrebbe una mediana NaN presentata come numero — la stessa classe di bug
 * già chiusa in `validateAnchors` per la Qt.A.
 */
export function historicalPurchases(
  rows: readonly HistoricalPurchaseInput[],
  roleByPlayerId: ReadonlyMap<string, Role>,
): HistoricalPurchaseIntake {
  const out: HistoricalPurchase[] = [];
  let roleUnresolved = 0;
  let priceInvalid = 0;
  let seasonEmpty = 0;

  for (const row of rows) {
    if (row.season.length === 0) {
      seasonEmpty += 1;
      continue;
    }
    if (!Number.isFinite(row.price) || row.price < 0) {
      priceInvalid += 1;
      continue;
    }
    const renewal = row.acquisition === RENEWAL_ACQUISITION;
    const role = roleByPlayerId.get(row.playerId) ?? null;
    if (role === null && !renewal) {
      // Solo le righe d'ASTA hanno bisogno del ruolo: sono loro a comporre la
      // curva. Un rinnovo senza ruolo resta, perché la sua spesa è pool.
      roleUnresolved += 1;
      continue;
    }
    out.push({ season: row.season, playerId: row.playerId, role, price: row.price, renewal });
  }

  return {
    rows: out,
    seen: rows.length,
    skipped: {
      "role-unresolved": roleUnresolved,
      "price-invalid": priceInvalid,
      "season-empty": seasonEmpty,
    },
  };
}

/** Perché una fascia non è leggibile. Vocabolario chiuso, nessun ripiego dietro. */
export type PriceBandUnavailableReason =
  /** Nessun prezzo storico è caduto in questa fascia: non c'è niente da leggere. */
  | "no-observations"
  /** Campione sotto `minBandSample`: cold start dichiarato, come per l'inflazione. */
  | "insufficient-sample";

/**
 * Una fascia della curva coi suoi quantili e la sua `n`.
 *
 * I quattro quantili sono `null` INSIEME quando la fascia non è leggibile: un
 * quantile senza campione non è uno zero e non è la mediana della fascia
 * accanto. `sufficient` e `reason` dicono quale dei due casi è, e chi consuma
 * non ha modo di leggere un numero senza aver visto il motivo.
 */
export interface PriceCurveBand {
  readonly band: PriceRankBand;
  /** Prezzi storici caduti nella fascia. Viaggia SEMPRE col numero. */
  readonly n: number;
  readonly median: number | null;
  readonly p25: number | null;
  readonly p75: number | null;
  readonly p90: number | null;
  /**
   * BIAS FIRMATO della fascia: `media(mediana della fascia − prezzo osservato)`.
   *
   * È l'errore che la curva commette SU SE STESSA, misurato: negativo significa
   * che leggendo la mediana si prevede MENO di quanto è stato pagato, cioè «la
   * previsione tende a sbagliare basso», che è la frase che §B.3 del DTI chiede
   * di mostrare accanto al numero. `null` quando la fascia non è leggibile.
   */
  readonly signedBias: number | null;
  readonly sufficient: boolean;
  readonly reason: PriceBandUnavailableReason | null;
}

/** La curva di UN ruolo: le cinque fasce, sempre tutte e cinque. */
export interface RolePriceCurve {
  readonly role: Role;
  /** Una voce per fascia, nell'ordine di `PRICE_RANK_BANDS`. */
  readonly bands: readonly PriceCurveBand[];
  /** Acquisti d'asta del ruolo che hanno prodotto la curva (rinnovi esclusi). */
  readonly observations: number;
  /** Quante fasce sono leggibili: zero ⇒ il ruolo non ha una curva usabile. */
  readonly readableBands: number;
}

/** Perché la curva NON è formabile. Vocabolario chiuso. */
export type PriceCurveUnavailableReason =
  /** Nessuna riga di storico: non è «i prezzi sono bassi», è «non lo so». */
  | "no-history"
  /** Righe presenti ma nessun ACQUISTO d'asta: solo rinnovi, o solo righe scartate. */
  | "no-auction-rows";

export interface PriceCurveOptions {
  /** Il minimo di campione applicato alle fasce. Default: `MIN_PRICE_BAND_SAMPLE`. */
  readonly minBandSample?: number;
}

/**
 * Il libro delle curve: una curva per ruolo più la contabilità del pool.
 *
 * `meanTrainPool` è il denominatore di `pool_ratio` (§A.2) e si MISURA dallo
 * storico, non si dichiara: per ogni stagione presente, `pool = crediti della
 * lega − spesa in rinnovi di quella stagione`; la media di quei pool è il
 * denominatore. `null` quando non è calcolabile (nessuna stagione, o un pool
 * medio non positivo) — e allora chi lo consuma degrada dichiarandolo, invece
 * di moltiplicare per un 1 silenzioso.
 */
export interface PriceCurveBook {
  readonly byRole: ReadonlyMap<Role, RolePriceCurve>;
  /** Le stagioni presenti nello storico, crescenti. */
  readonly seasons: readonly string[];
  /** Righe di storico entrate nel calcolo (rinnovi compresi). */
  readonly rows: number;
  /** Righe di rinnovo: fuori dalla curva, dentro il pool. Dichiarate. */
  readonly renewalRows: number;
  /** Stagione → pool misurato di quella stagione. */
  readonly poolBySeason: ReadonlyMap<string, number>;
  readonly meanTrainPool: number | null;
  readonly minBandSample: number;
  readonly reason: PriceCurveUnavailableReason | null;
}

/**
 * QUANTILE TIPO 7 — la stessa aritmetica della curva del generatore, replicata
 * e non importata (vedi l'intestazione). Interpolazione lineare fra le due
 * statistiche d'ordine adiacenti: `h = (n − 1)p`, poi `x[⌊h⌋] + (h − ⌊h⌋)
 * (x[⌈h⌉] − x[⌊h⌋])`.
 *
 * Riceve una lista GIÀ ordinata crescente: ordinarla di nuovo per ognuno dei
 * quattro quantili sarebbe quattro volte lo stesso lavoro sullo stesso array.
 */
function quantileType7(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * IL RANGO STORICO di un acquisto: dentro la sua stagione e dentro il suo
 * ruolo, i prezzi si ordinano DECRESCENTI e la posizione 1-based è il rango.
 *
 * È il rango di PREZZO OSSERVATO, e non è lo stesso rango con cui la curva si
 * legge al tavolo (quello è l'ordine del listone per `T1̂`, ./expectedPrice.ts):
 * la tabella dice «quanto è costato il quinto attaccante più pagato», la
 * lettura dice «questo giocatore, stasera, è il quinto attaccante». Ordinare
 * per prezzo e poi leggere il prezzo sarebbe prevedere il passato.
 *
 * Pareggi: `playerId` crescente. Stesso storico → stessi ranghi, sempre.
 */
function bandedPrices(
  rows: readonly HistoricalPurchase[],
  role: Role,
  seasons: readonly string[],
): Map<number, number[]> {
  const byBand = new Map<number, number[]>();
  for (const season of seasons) {
    const purchases = rows
      .filter((r) => r.season === season && r.role === role && !r.renewal)
      .sort((a, b) => b.price - a.price || a.playerId.localeCompare(b.playerId));
    for (let i = 0; i < purchases.length; i++) {
      const band = priceRankBandOf(i + 1);
      if (band === null) continue; // irraggiungibile: i è ≥ 0, quindi il rango è ≥ 1
      const bucket = byBand.get(band.index);
      if (bucket === undefined) byBand.set(band.index, [purchases[i]!.price]);
      else bucket.push(purchases[i]!.price);
    }
  }
  return byBand;
}

function curveBandOf(
  band: PriceRankBand,
  prices: readonly number[],
  minBandSample: number,
): PriceCurveBand {
  const n = prices.length;
  const reason: PriceBandUnavailableReason | null =
    n === 0 ? "no-observations" : n < minBandSample ? "insufficient-sample" : null;
  if (reason !== null) {
    return {
      band,
      n,
      median: null,
      p25: null,
      p75: null,
      p90: null,
      signedBias: null,
      sufficient: false,
      reason,
    };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const median = quantileType7(sorted, 0.5);
  let biasSum = 0;
  for (const price of sorted) biasSum += median - price;
  return {
    band,
    n,
    median,
    p25: quantileType7(sorted, 0.25),
    p75: quantileType7(sorted, 0.75),
    p90: quantileType7(sorted, 0.9),
    signedBias: biasSum / n,
    sufficient: true,
    reason: null,
  };
}

/**
 * Costruisce il libro delle curve dallo storico d'asta caricato nel client.
 *
 * Deterministica e totale: stesse righe → stesso libro, sempre; e ogni ingresso
 * produce o un libro leggibile o un libro con il proprio `reason`, senza un
 * terzo esito e senza eccezioni sul percorso critico.
 *
 * IL COSTO. Due passate sullo storico per ruolo (filtro + ordinamento) più
 * quattro quantili su liste piccole: si costruisce UNA VOLTA per lettura e si
 * riusa per tutti i candidati, esattamente come `ExposureBook` in
 * src/baitCandidates.ts. Non è pensato per essere richiamato per candidato.
 */
export function priceCurveBook(
  rows: readonly HistoricalPurchase[],
  options: PriceCurveOptions = {},
): PriceCurveBook {
  const minBandSample = options.minBandSample ?? MIN_PRICE_BAND_SAMPLE;
  const seasons = [...new Set(rows.map((r) => r.season))].sort();

  const poolBySeason = new Map<string, number>();
  for (const season of seasons) {
    const renewalSpend = rows
      .filter((r) => r.season === season && r.renewal)
      .reduce((sum, r) => sum + r.price, 0);
    poolBySeason.set(season, AUCTION_POOL_CREDITS - renewalSpend);
  }
  const poolSum = [...poolBySeason.values()].reduce((sum, pool) => sum + pool, 0);
  const meanTrainPool =
    seasons.length === 0 || poolSum <= 0 ? null : poolSum / seasons.length;

  const byRole = new Map<Role, RolePriceCurve>();
  let auctionRows = 0;
  for (const role of ROLES) {
    const banded = bandedPrices(rows, role, seasons);
    const bands = PRICE_RANK_BANDS.map((band) =>
      curveBandOf(band, banded.get(band.index) ?? [], minBandSample),
    );
    const observations = [...banded.values()].reduce((sum, prices) => sum + prices.length, 0);
    auctionRows += observations;
    byRole.set(role, {
      role,
      bands,
      observations,
      readableBands: bands.filter((b) => b.sufficient).length,
    });
  }

  const renewalRows = rows.filter((r) => r.renewal).length;
  const reason: PriceCurveUnavailableReason | null =
    rows.length === 0 ? "no-history" : auctionRows === 0 ? "no-auction-rows" : null;

  return {
    byRole,
    seasons,
    rows: rows.length,
    renewalRows,
    poolBySeason,
    meanTrainPool,
    minBandSample,
    reason,
  };
}

/**
 * La fascia della curva di `role` al rango `rank`, oppure `null` quando il
 * ruolo non ha curva o il rango non è un rango.
 *
 * NESSUNA INTERPOLAZIONE: una fascia sotto campione torna com'è — non leggibile
 * e col suo motivo — e non viene sostituita dalla fascia vicina. Chi legge
 * decide cosa farne; questo modulo non decide al posto suo riempiendo il buco.
 */
export function priceCurveBandAt(
  book: PriceCurveBook,
  role: Role,
  rank: number,
): PriceCurveBand | null {
  const curve = book.byRole.get(role);
  if (curve === undefined) return null;
  const band = priceRankBandOf(rank);
  if (band === null) return null;
  return curve.bands[band.index] ?? null;
}
