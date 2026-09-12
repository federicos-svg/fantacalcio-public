// LA DISTRIBUZIONE DELLE FORMAZIONI AVVERSARIE — WP-1.
//
// PERCHÉ ESISTE. Fino a qui il produttore assumeva UNA formazione avversaria e
// ottimizzava contro quella. È una assunzione comoda e falsa: la formazione
// dell'avversario è nascosta fino alla scadenza, e ciò che si può conoscere è
// al più un insieme di formazioni plausibili con i loro pesi. Ottimizzare
// contro la sola modale significa scegliere la formazione che batte l'ipotesi
// più probabile e che può perdere contro tutte le altre.
//
// RETROCOMPATIBILITÀ, E NON È UNA CORTESIA. Una formazione singola È una
// distribuzione con un solo elemento a peso 1: non c'è un ramo «vecchio» e uno
// «nuovo», c'è un solo calcolo di cui il caso di prima è il caso degenere. Ogni
// chiamante esistente resta valido senza modifiche perché non c'è nulla da
// modificare.
//
// I DUE SOTTO-SEMI, E PERCHÉ NON BASTA UN SEME SOLO. Gli scenari servono a
// confrontare formazioni candidate, non a misurare il rumore del
// campionamento: perciò tutte le candidate della stessa giornata vedono gli
// STESSI scenari. Se però il sorteggio della formazione avversaria pescasse
// dallo stesso flusso di numeri casuali dei giocatori, il vettore delle
// disponibilità dipenderebbe da quante formazioni avversarie ci sono, e due
// giornate «uguali» con un candidato avversario in più non sarebbero più
// confrontabili. Da qui due flussi separati, ciascuno con il suo sotto-seme
// derivato dal seme di giornata, e il vettore delle formazioni avversarie
// generato UNA VOLTA SOLA prima della ricerca.

import type { Lineup } from "./gameweekSimulator.js";

/**
 * Una formazione avversaria con il suo peso nella distribuzione. Il peso è
 * RELATIVO: la normalizzazione la fa questo modulo, così chi produce la
 * distribuzione può passare conteggi grezzi senza doverli dividere.
 */
export interface WeightedOpponentLineup {
  readonly lineup: Lineup;
  /** Peso relativo, finito e strettamente positivo. */
  readonly weight: number;
}

/**
 * Il sale del sotto-seme del sorteggio avversario. È un numero dichiarato e
 * costante: cambiarlo cambia ogni scenario campionato di ogni giornata, quindi
 * non si cambia senza un record che dica perché.
 */
export const OPPONENT_DRAW_SUBSEED_SALT = 0x4f50504e as const; // "OPPN"

/**
 * Mescolatore a 32 bit (splitmix a due giri). Serve solo a derivare un
 * sotto-seme da un seme: due semi vicini devono dare flussi scorrelati,
 * altrimenti «due sotto-semi» sarebbero due nomi per lo stesso flusso.
 *
 * ESPORTATO, E IL MOTIVO È UNO SOLO: chi deve derivare un sotto-seme nuovo lo
 * deriva con QUESTO mescolatore. Una seconda copia di queste sei righe altrove
 * nel pacchetto non sarebbe una seconda scelta, sarebbe la stessa scelta scritta
 * due volte — e due scritture della stessa cosa divergono il giorno in cui una
 * delle due si corregge. L'export non cambia nessun comportamento: la funzione
 * è identica a com'era, e i due sotto-semi qui sotto continuano a essere gli
 * unici che questo modulo dichiara.
 */
export function mix32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Il sotto-seme del sorteggio dei GIOCATORI è il seme di giornata stesso.
 *
 * Scelta dichiarata e contestabile, e la ragione è una sola: le proposte già
 * registrate con un seme devono restare rifacibili bit a bit. Derivare anche
 * questo flusso avrebbe spostato ogni scenario campionato mai prodotto, senza
 * comprare nulla — l'indipendenza fra i due flussi la garantisce già il fatto
 * che l'ALTRO sia derivato. Se un giorno servirà un terzo flusso, si deriverà
 * come quello avversario e questa identità resterà il flusso «zero».
 */
export function playerDrawSubSeed(seed: number): number {
  return seed >>> 0;
}

/** Il sotto-seme del sorteggio della formazione avversaria, derivato. */
export function opponentDrawSubSeed(seed: number): number {
  return mix32((seed >>> 0) ^ OPPONENT_DRAW_SUBSEED_SALT);
}

/**
 * Convalida la distribuzione e ne restituisce i pesi NORMALIZZATI, nell'ordine
 * in cui è stata dichiarata. L'ordine è parte del contratto: è quello che rompe
 * le parità di peso quando si cerca la modale, e cambiarlo cambierebbe la
 * formazione con cui si innesca il livello 1.
 */
export function normalisedOpponentWeights(
  distribution: readonly WeightedOpponentLineup[],
  where: string,
): number[] {
  if (distribution.length === 0) {
    throw new Error(`${where}: la distribuzione delle formazioni avversarie è vuota. Una distribuzione senza elementi non è «nessuna assunzione»: è nessun avversario.`);
  }
  let total = 0;
  for (const candidate of distribution) {
    if (!Number.isFinite(candidate.weight) || candidate.weight <= 0) {
      throw new Error(
        `${where}: peso non valido (${String(candidate.weight)}). I pesi sono relativi, finiti e ` +
          "strettamente positivi: un peso zero è una formazione che si dichiara possibile e si tratta come " +
          "impossibile, e vale la pena toglierla invece di scriverla.",
      );
    }
    total += candidate.weight;
  }
  return distribution.map((candidate) => candidate.weight / total);
}

/**
 * L'indice della formazione MODALE: quella a peso maggiore, e a parità di peso
 * la prima dichiarata. È la formazione con cui il livello 1 si innesca (§10 del
 * disegno): non è quella che decide, è quella da cui si parte.
 */
export function modalOpponentIndex(weights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < weights.length; i += 1) {
    if ((weights[i] as number) > (weights[best] as number)) best = i;
  }
  return best;
}

/** Chiave strutturale di una formazione: modulo, portiere, titolari, panchina. */
export function lineupKey(lineup: Lineup): string {
  return `${lineup.module}|${lineup.goalkeeperId}|${[...lineup.starterIds].join(",")}|${lineup.benchIds.join(",")}`;
}

/**
 * IL VETTORE DELLE FORMAZIONI AVVERSARIE, UNA VOLTA SOLA PER GIORNATA.
 *
 * Restituisce, per ciascuno dei `budget` scenari, l'indice della formazione
 * avversaria estratta. Dipende SOLO da pesi, budget e seme: non dalla rosa
 * nostra, non dal numero di formazioni candidate, non dall'ordine con cui la
 * ricerca le visita. È la condizione perché il confronto fra due candidate
 * misuri la formazione e non il campionamento.
 *
 * Con un solo elemento non si estrae nulla: sarebbe un sorteggio con un esito
 * solo, e consumare numeri casuali per un esito certo è un modo per rendere
 * fragile ciò che è deterministico.
 */
export function drawOpponentLineupIndices(
  normalisedWeights: readonly number[],
  budget: number,
  seed: number,
  random: (seed: number) => () => number,
): number[] {
  if (normalisedWeights.length === 1) return new Array<number>(budget).fill(0);
  const rnd = random(opponentDrawSubSeed(seed));
  // Somme cumulate calcolate una volta sola: l'ultima soglia è forzata a 1 per
  // non lasciare che un errore di arrotondamento faccia cadere un'estrazione
  // fuori da ogni intervallo.
  const cumulative: number[] = [];
  let running = 0;
  for (let i = 0; i < normalisedWeights.length; i += 1) {
    running += normalisedWeights[i] as number;
    cumulative.push(i === normalisedWeights.length - 1 ? 1 : running);
  }
  const out: number[] = [];
  for (let s = 0; s < budget; s += 1) {
    const u = rnd();
    let index = cumulative.length - 1;
    for (let i = 0; i < cumulative.length; i += 1) {
      if (u < (cumulative[i] as number)) {
        index = i;
        break;
      }
    }
    out.push(index);
  }
  return out;
}
