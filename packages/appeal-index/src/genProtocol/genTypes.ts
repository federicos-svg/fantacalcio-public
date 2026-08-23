// GEN-PROTOCOL-A — tipi condivisi del generatore di algoritmi. PURI, IO-free.
//
// Perche' questo modulo esiste: il protocollo preregistrato definisce i suoi
// bersagli (§A.3) e le sue perdite primarie (§B.2) PRIMA di qualunque
// candidato, e la regola di §C li congela. Se ogni famiglia si portasse
// dietro la propria idea di «riga giocatore-stagione» o di «bersaglio», due
// candidati potrebbero essere confrontati su due definizioni diverse senza
// che nessuno se ne accorga — ed e' esattamente il confronto che §B.4
// vieta («confronti sempre paired sugli stessi fold»). Qui le definizioni
// stanno scritte una volta sola.
//
// Nessuna tariffa e nessun calcolo vive qui: il fantavoto di una riga
// giornaliera si ottiene ESCLUSIVAMENTE da `computeFantavoto()` di
// `../fantavoto.ts` (versione `appeal_index_offline_v2_gs_keeper`, malus `Gs`
// al solo portiere). Non e' una preferenza di stile: una seconda tariffa in
// questo albero renderebbe i target storici incoerenti con se stessi, che e'
// il difetto che la correzione del 2026-08-23 ha appena finito di riparare.
//
// Nessun campo di questo modulo nomina un fornitore di statistiche: le
// statistiche di stagione entrano da `seasonStats`, una mappa nome->numero
// che il chiamante riempie. Il catalogo dei nomi arriva nell'ondata 2.

import type { Role } from "../types.js";

/** Etichetta di stagione nel formato canonico del repository: `"2015_16"`. */
export type GenSeason = string;

/**
 * Ruolo di lega. Alias di `Role` (`packages/engine`), non un secondo tipo:
 * un'unione ridichiarata qui divergerebbe il giorno in cui una delle due
 * cambia.
 */
export type GenRole = Role;

/** Ordine canonico dei ruoli — l'ordine in cui ogni report per ruolo si legge. */
export const GEN_ROLES: readonly GenRole[] = ["P", "D", "C", "A"] as const;

/**
 * Una riga giocatore-giornata (§A.1), gia' normalizzata dal chiamante.
 *
 * `votoBase === null` significa `SV` / `-` / cella vuota: NON e' uno zero, in
 * nessun punto della pipeline (§A.1, «Coercizione a zero: vietata»). Le regole
 * di lega sull'ufficio (portiere SV = 6, SV+ammonizione = 5, SV+espulsione = 4
 * — LEAGUE_RULES §13) sono punteggio di FORMAZIONE, non di prestazione: non
 * producono mai un `votoBase` qui.
 */
export interface MatchdayVote {
  readonly season: GenSeason;
  /** 1..38. */
  readonly matchday: number;
  /** Voto base, oppure `null` per SV/-/vuoto (§A.1). Mai 0 al posto di null. */
  readonly votoBase: number | null;
  /** `6*`: voto d'ufficio 6, che il contratto XLSX dichiara presenza valida (§A.1). */
  readonly isAsterisk: boolean;
  /** Gol fatti (§A.1). */
  readonly Gf: number;
  /** Gol subiti — termine di fantavoto attivo sul solo ruolo P (§A.1, guardia P0.4). */
  readonly Gs: number;
  /** Rigori parati (§A.1). */
  readonly Rp: number;
  /** Rigori sbagliati (§A.1); entra anche nel `flag_bonus` di T-D (§A.3). */
  readonly Rs: number;
  /** Rigori segnati — nessun termine proprio nel fantavoto, sono gia' dentro `Gf` (§A.1, guardia P0.5). */
  readonly Rf: number;
  /** Autogol (§A.1). */
  readonly Au: number;
  /** Ammonizioni (§A.1). */
  readonly Amm: number;
  /** Espulsioni (§A.1). */
  readonly Esp: number;
  /** Assist, anche da fermo (§A.1; LEAGUE_RULES §12). */
  readonly Ass: number;
}

/**
 * Presenza valida ⇔ il voto base esiste (§A.1). Vive qui e non dentro le
 * famiglie perche' e' la definizione da cui dipendono T-N, T1, T2 e T-D: se
 * due moduli la scrivessero in modo diverso, i quattro bersagli smetterebbero
 * di parlare della stessa stagione.
 */
export function isValidPresence(row: MatchdayVote): boolean {
  return row.votoBase !== null;
}

/**
 * Una riga giocatore-stagione del panel, gia' joinata dal chiamante (§A.0 fa
 * il join; questo modulo non lo rifa' e non conosce le fonti).
 *
 * Gli aggregati arrivano calcolati: il generatore non decide che cosa sia una
 * presenza a valle della definizione qui sopra, e il fantavoto lo produce la
 * tariffa canonica, mai questo file.
 */
export interface GenPanelRow {
  /** Chiave d'identita' LOCALE al generatore (§A.0). Non e' `canonical_player_id`. */
  readonly playerKey: string;
  readonly role: GenRole;
  readonly season: GenSeason;
  /** T-N: presenze valide, intero 0–38 (§A.3). Zero e' un valore, non un buco. */
  readonly presenze: number;
  /** T1: somma del fantavoto sulle presenze valide; 0 con N=0 (§A.3). */
  readonly totFantavoto: number;
  /** T2: `TOT/N`, oppure `null` se `N = 0` — indefinito, mai coercito a 0 (§A.3). */
  readonly fantamedia: number | null;
  /** Media del voto base sulle presenze valide; `null` con `N = 0`. */
  readonly mediaVotoBase: number | null;
  /** Le righe giornaliere della stagione: servono a T-D (§A.3) e alle feature di forma (§D.6). */
  readonly matchdays: readonly MatchdayVote[];
  /**
   * Statistiche di stagione da fonte non-XLSX, provider-neutre: mappa
   * nome->valore con `null` per «non osservato» (mai 0, §D.3 «Divieti
   * assoluti»). Il catalogo dei nomi e i tier S1/S2/S3 arrivano nell'ondata 2.
   */
  readonly seasonStats?: Readonly<Record<string, number | null>>;
}

/**
 * I bersagli supervisionati di una riga-target (§A.3).
 *
 * `t2` e' `NaN` quando `N = 0` (T2 indefinito): la riga esce dal solo T2, e il
 * peso `t2Weight = N` e' quello che §B.2 impone alla sua perdita primaria —
 * una fantamedia su 2 partite non pesa come una su 35.
 */
export interface GenTargets {
  /** T-N — presenze valide, 0–38 (§A.3). */
  readonly tN: number;
  /** T1 — totale fantapunti di stagione (§A.3). */
  readonly t1: number;
  /** T2 — fantamedia; `NaN` se `tN === 0`, mai 0 (§A.3). */
  readonly t2: number;
  /** Peso di T2 = presenze realizzate (§B.2, MAE pesato). */
  readonly t2Weight: number;
  /**
   * T-D — conteggi sui 9 bin del voto base (`voteDistribution.ts`), oppure
   * `null` se la stagione non ha presenze valide (§A.3).
   */
  readonly tDBinCounts: readonly number[] | null;
}

/**
 * Una riga di feature pronta per il fit, con la sua catena di anteriorita'.
 *
 * `features` porta `NaN` dove la feature NON e' osservabile (§D.3): mai uno
 * zero, mai una media imputata. Chi fitta esclude la riga e la CONTA
 * (`elasticNet.ts`, `boostedStumps.ts`) — l'esclusione silenziosa e' vietata
 * da §D.7.
 *
 * `sourceSeasons` e' la traccia d'audit di §G punto 2: ogni stagione che ha
 * contribuito, e `max(sourceSeasons) < targetSeason` e' la proprieta' che si
 * dimostra riga per riga, non si dichiara.
 */
export interface GenFeatureRow {
  readonly playerKey: string;
  readonly role: GenRole;
  readonly targetSeason: GenSeason;
  /** Nome->valore; `NaN` = feature non osservabile per questa riga (§D.3). */
  readonly features: Readonly<Record<string, number>>;
  /** Ogni stagione che ha alimentato `features`, in ordine crescente (§G.2). */
  readonly sourceSeasons: readonly GenSeason[];
  /** Peso di recency `0,5^{Δanni/h}` (§B.1), calcolato da `foldScheme.ts` dentro il fold. */
  readonly recencyWeight: number;
  /** Peso di presenza `N` (§B.2), usato dalla perdita primaria di T2. */
  readonly presenceWeight: number;
  readonly targets: GenTargets;
}

/** Identificatori dei bersagli del protocollo (§A.3, §A.4). */
export type GenTargetId = "T1" | "T2" | "TN" | "T3" | "TD" | "T6" | "T8";

/**
 * Le perdite PRIMARIE, una per bersaglio (§B.2: «La perdita primaria e' una
 * per bersaglio ed e' quella scritta qui»). Le secondarie esistono per
 * ammissibilita' e tie-break, mai per selezionare da sole.
 */
export type PrimaryLoss =
  /** MAE non pesato — T1, T-N, T3 (§B.2). */
  | "mae"
  /** MAE pesato sulle presenze realizzate — T2 (§B.2). */
  | "weightedMae"
  /** Log-loss multinomiale media per presenza — T-D (§B.2). */
  | "multinomialLogLoss"
  /** Errore % di contributo stagionale — T6 (§B.2, §D.9). */
  | "seasonalContributionError";

/**
 * Bersaglio -> perdita primaria (§B.2, tabella). Congelata da §C: cambiarla
 * invalida i confronti gia' fatti e richiede `protocol_id` 2.0.0.
 *
 * T8 usa il MAE su T2 della prima stagione italiana (§B.2, ultima riga): e'
 * un MAE, non una quinta famiglia di perdita.
 */
export const GEN_PRIMARY_LOSS: Readonly<Record<GenTargetId, PrimaryLoss>> = {
  T1: "mae",
  T2: "weightedMae",
  TN: "mae",
  T3: "mae",
  TD: "multinomialLogLoss",
  T6: "seasonalContributionError",
  T8: "mae",
} as const;

/** Clamp preregistrato delle predizioni di T-N (§B.2: «clamp predizioni a [0, 38]»). */
export const GEN_TN_CLAMP: readonly [number, number] = [0, 38] as const;
