// GEN-PROTOCOL-A — il generatore pseudo-casuale del protocollo. PURO.
//
// Perche' un PRNG scritto a mano invece di `Math.random`: il protocollo lo
// vieta esplicitamente («Nessun generatore pseudo-casuale non seminato: dove
// serve casualita' (bootstrap, simulazioni) si usa un PRNG deterministico
// dichiarato (`mulberry32`) con seed scritti in questo documento.
// `Math.random` e' vietato» — GEN-PROTOCOL-A, preambolo «Implementazione»).
// La ragione non e' estetica: §B.3.1 rende il determinismo una condizione di
// AMMISSIBILITA' («due generazioni byte-identiche»), quindi un candidato che
// pesca da una sorgente non riproducibile e' fuori dal confronto per
// costruzione, non perche' abbia perso.
//
// `mulberry32` e' l'algoritmo standard a 32 bit di stato: qui non e'
// modificato di un bit rispetto alla forma pubblicata, e i suoi primi tre
// valori per il seme 0 sono verificati nel test contro un'aritmetica svolta a
// mano — se qualcuno «ottimizzasse» uno shift, la suite se ne accorge.
//
// Nota sul PRNG che gia' esiste nel repository: `phase4Selection.ts`
// (`seasonBlockInterval`) usa un LCG suo. Non e' stato riusato e non e' stato
// toccato: il protocollo nomina `mulberry32` e impone che il seed arrivi dal
// chiamante, mentre quel LCG e' interno alla propria funzione. Due stream
// diversi per due protocolli diversi, ciascuno dichiarato dove vive.

/** Una sorgente uniforme in `[0, 1)`. */
export type GenRandom = () => number;

/**
 * mulberry32 — 32 bit di stato, un moltiplicatore, due xorshift.
 *
 * Il seme e' forzato a intero non firmato a 32 bit: `mulberry32(-1)` e
 * `mulberry32(0xFFFFFFFF)` sono la stessa sequenza, e va bene che lo siano,
 * purche' sia scritto.
 */
export function mulberry32(seed: number): GenRandom {
  if (!Number.isFinite(seed)) throw new Error("mulberry32: seed must be finite");
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Indice uniforme in `[0, n)`. Un solo punto in cui il float diventa indice,
 * cosi' il bootstrap e le simulazioni campionano nello stesso modo esatto.
 */
export function nextIndex(random: GenRandom, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error("nextIndex: n must be a positive integer");
  const i = Math.floor(random() * n);
  // `random()` e' in [0,1), quindi i < n sempre; il clamp e' una cintura
  // contro un'implementazione futura che restituisse esattamente 1.
  return i < n ? i : n - 1;
}

/**
 * I semi PREREGISTRATI di §C. Congelati con il metro: cambiarne uno cambia i
 * numeri di ogni confronto gia' fatto, quindi richiede `protocol_id` 2.0.0.
 *
 * Stanno qui e non sparsi nei moduli perche' un seme scritto due volte e' un
 * seme che prima o poi vale due cose diverse.
 */
export const GEN_SEEDS = {
  /** Audit delle 100 catene d'identita' (§A.0 punto 5). */
  identityAudit: 20260825,
  /** Bootstrap season-block delle differenze paired (§B.4 punto 6, §D.14). */
  bootstrap: 20260902,
  /** Simulazioni dei contributi ai modificatori, T6 (§D.9). */
  modifierSimulation: 20260903,
} as const;
