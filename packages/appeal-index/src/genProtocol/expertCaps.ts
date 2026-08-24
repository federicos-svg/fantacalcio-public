// GEN-PROTOCOL-A §D.10.2 — i tetti su N̂ dal giudizio degli esperti. PURI.
//
// Che cosa sono questi numeri, detto prima di tutto il resto: NON sono una
// stima. Sono un input dichiarato del committente, ratificato da Pico il
// 2026-08-23 dopo aver visto la tabella riga per riga (scartate «solo il tetto
// salute» e «lasciala spenta»). Nessun dato puo' validarli, perche' la fonte
// del giudizio non ha storico (§H.4): il canale e' acceso per decisione, e la
// sua falsificazione e' prospettica — se sulla stagione 2026/27
// `MAE(N̂_finale) ≥ MAE(N̂_modello)`, la tabella e' dannosa e si ritira.
//
// La direzione e' l'altra meta' della decisione: **solo verso il basso**. Gli
// esperti possono sapere che uno non giochera' (trasferimento, gerarchie
// nuove); non possono promettere che giochera'. Per questo `nFinal` e' un
// `min` e mai un `max`, e per questo il risultato porta SEMPRE il valore
// grezzo accanto a quello tettato: la sensibilita' obbligatoria del report
// (distribuzione di Δindice con e senza tetti) si calcola su quella coppia, e
// una funzione che restituisse solo il numero finale la renderebbe impossibile.
//
// ORDINE DI APPLICAZIONE (§D.15.3, v2.0.0): i tetti si applicano DOPO il layer
// delle prime giornate. `N̂_finale = min(N̂_layer, tetto_titolarita',
// tetto_salute)`. L'ordine non e' indifferente: il layer puo' alzare la stima
// (una doppia titolarita' osservata e' un fatto, e i fatti possono spingere
// verso l'alto), il tetto puo' solo abbassarla. Applicare il tetto prima
// lascerebbe che un fatto osservato scavalchi un giudizio — che e' esattamente
// il contrario della gerarchia dichiarata.
//
// I BORDI DELLE FASCE. La griglia dei punteggi e' 0,5: 7,75 non esiste. Ma il
// codice non puo' fingere che un valore fuori griglia non arrivi mai, e non
// puo' nemmeno arrotondarlo (arrotondare e' decidere). Le fasce sono quindi
// intervalli CHIUSI-APERTI che coprono tutta la retta, e ogni valore cade in
// esattamente una: `[8, ∞) → 38`, `[6, 8) → 33`, `[4, 6) → 24`, `[2, 4) → 15`,
// `(−∞, 2) → 8`. Sulla griglia dichiarata questa lettura coincide, punto per
// punto, con la tabella ratificata; fuori griglia risponde senza inventare.

/**
 * La tabella dei tetti di titolarita' (§D.10.2), come soglie DECRESCENTI.
 *
 * Trascritta dalla tabella ratificata:
 *   ≥ 8 → 38 (nessun tetto) | 6–7,5 → 33 | 4–5,5 → 24 | 2–3,5 → 15 | ≤ 1,5 → 8
 */
export const EXPERT_STARTER_CAPS: readonly ExpertCapBand[] = [
  { minScore: 8, inclusive: true, cap: 38 },
  { minScore: 6, inclusive: true, cap: 33 },
  { minScore: 4, inclusive: true, cap: 24 },
  { minScore: 2, inclusive: true, cap: 15 },
  { minScore: Number.NEGATIVE_INFINITY, inclusive: true, cap: 8 },
] as const;

/**
 * La tabella dei tetti di salute (§D.10.2): ≥ 4 → nessuno | ≤ 3 → 20 | ≤ 1 → 10.
 *
 * `null` = nessun tetto, che NON e' 38: «nessun tetto» significa che questa
 * dimensione non partecipa al `min`, e scriverlo come 38 funzionerebbe per
 * caso oggi e sarebbe sbagliato il giorno in cui il layer producesse una stima
 * sopra 38 per un errore a monte — il tetto salute la taglierebbe a 38 fingendo
 * di essere una regola quando sarebbe un caso.
 */
export const EXPERT_HEALTH_CAPS: readonly ExpertCapBand[] = [
  { minScore: 4, inclusive: true, cap: null },
  // La fascia intermedia e' «≤ 3»: il suo estremo inferiore e' l'APERTURA di
  // «≤ 1», che e' chiusa a 1. Quindi `(1, 4)`, ed e' l'unica riga di tutte e
  // due le tabelle con l'estremo inferiore aperto — un 1 esatto e' salute
  // «≤ 1» e prende il tetto 10, non il 20.
  { minScore: 1, inclusive: false, cap: 20 },
  { minScore: Number.NEGATIVE_INFINITY, inclusive: true, cap: 10 },
] as const;

export interface ExpertCapBand {
  readonly minScore: number;
  /** `true` = l'estremo inferiore appartiene alla fascia (`≥`); `false` = e' aperto (`>`). */
  readonly inclusive: boolean;
  /** `null` = nessun tetto: la dimensione non partecipa al `min`. */
  readonly cap: number | null;
}

export interface ExpertCapLookup {
  readonly cap: number | null;
  /** La soglia della fascia in cui il punteggio e' caduto: rende leggibile il perche'. */
  readonly bandMinScore: number;
  /** `true` se il punteggio non sta sulla griglia 0,5 dichiarata (7,75 e simili). */
  readonly offGrid: boolean;
}

/** Griglia dichiarata dei punteggi degli esperti: mezzi punti. */
export const EXPERT_SCORE_GRID_STEP = 0.5;

function onGrid(score: number): boolean {
  const scaled = score / EXPERT_SCORE_GRID_STEP;
  return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/**
 * La lettura di una tabella di fasce: la PRIMA riga la cui soglia il punteggio
 * raggiunge, scorrendo dall'alto.
 *
 * Una funzione sola per le due tabelle. Se ce ne fossero due, la prossima
 * modifica ne toccherebbe una e l'altra resterebbe indietro senza che nulla lo
 * dica.
 */
export function lookupCapBand(score: number, bands: readonly ExpertCapBand[], label: string): ExpertCapLookup {
  if (!Number.isFinite(score)) {
    throw new Error(`${label}: punteggio non finito — un giudizio assente non e' un tetto, e' un giudizio assente`);
  }
  for (const band of bands) {
    if (band.inclusive ? score >= band.minScore : score > band.minScore) {
      return { cap: band.cap, bandMinScore: band.minScore, offGrid: !onGrid(score) };
    }
  }
  throw new Error(`${label}: nessuna fascia copre ${String(score)} — e' un bug della tabella, non del punteggio`);
}

/** Il tetto di titolarita' per un punteggio 0–10 (§D.10.2). */
export function starterCap(score: number): ExpertCapLookup {
  return lookupCapBand(score, EXPERT_STARTER_CAPS, "starterCap");
}

/** Il tetto di salute per un punteggio 0–10 (§D.10.2). `cap: null` = nessun tetto. */
export function healthCap(score: number): ExpertCapLookup {
  return lookupCapBand(score, EXPERT_HEALTH_CAPS, "healthCap");
}

export interface ExpertScores {
  /** Titolarita' 0–10; `null` = nessun giudizio, quindi nessun tetto da quella dimensione. */
  readonly titolarita: number | null;
  /** Salute 0–10; `null` = nessun giudizio. */
  readonly salute: number | null;
}

export interface ExpertCapResult {
  /** N̂ come arriva dal modello o dal layer (§D.15.3): il numero grezzo, mai perso. */
  readonly raw: number;
  /** `min(raw, tetti)` — solo verso il basso. */
  readonly capped: number;
  readonly starterCap: number | null;
  readonly healthCap: number | null;
  /** `true` se un tetto ha effettivamente morso: la sensibilita' del report parte da qui. */
  readonly capApplied: boolean;
  /** `true` se un punteggio era fuori dalla griglia 0,5 dichiarata. */
  readonly offGridScore: boolean;
}

/**
 * `N̂_finale = min(N̂_layer, tetto_titolarita', tetto_salute)` (§D.10.2, §D.15.3).
 *
 * L'argomento si chiama `nLayer` e non `nModello` perche' §D.15 ha cambiato chi
 * lo produce: quando il layer delle prime giornate vince la sua selezione, il
 * numero che entra qui e' gia' aggiornato con le presenze osservate. Quando il
 * layer resta U0, e' la predizione dell'incumbent. In entrambi i casi i tetti
 * arrivano dopo, e la firma lo dice.
 */
export function applyExpertCaps(nLayer: number, scores: ExpertScores): ExpertCapResult {
  const starter = scores.titolarita === null ? null : starterCap(scores.titolarita);
  const health = scores.salute === null ? null : healthCap(scores.salute);
  const caps: number[] = [];
  if (starter?.cap !== null && starter?.cap !== undefined) caps.push(starter.cap);
  if (health?.cap !== null && health?.cap !== undefined) caps.push(health.cap);

  const capped = Number.isFinite(nLayer) ? Math.min(nLayer, ...caps) : nLayer;
  return {
    raw: nLayer,
    capped,
    starterCap: starter?.cap ?? null,
    healthCap: health?.cap ?? null,
    capApplied: Number.isFinite(nLayer) && capped < nLayer,
    offGridScore: (starter?.offGrid ?? false) || (health?.offGrid ?? false),
  };
}

/**
 * La regola del rigorista di §D.15.4: `r_G` osservato PREVALE su una
 * designazione assente o contraria.
 *
 * «Fatto > giudizio», scritto come funzione pura perche' il privato la applichi
 * al serving senza reimplementarla. Il flag vale 1 se: designazione presente,
 * OPPURE un rigore osservato nelle giornate 1..G, OPPURE la storia recente lo
 * dice. Un solo `false` esplicito della designazione non spegne un rigore
 * calciato davvero.
 */
export function penaltyTakerFlag(input: {
  readonly expertDesignation: boolean | null;
  readonly observedInEarlyMatchdays: boolean;
  readonly historicalFlag: boolean;
}): { readonly flag: 0 | 1; readonly reason: "OBSERVED" | "EXPERT" | "HISTORY" | "NONE" } {
  if (input.observedInEarlyMatchdays) return { flag: 1, reason: "OBSERVED" };
  if (input.expertDesignation === true) return { flag: 1, reason: "EXPERT" };
  if (input.historicalFlag) return { flag: 1, reason: "HISTORY" };
  return { flag: 0, reason: "NONE" };
}
