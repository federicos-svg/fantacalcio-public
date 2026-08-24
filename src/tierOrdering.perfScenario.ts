// Scenario sintetico DETERMINISTICO per la misura degli aggregati del libro
// delle fasce (src/tierOrdering.ts). Stessa postura di
// packages/engine/tests/perfScenario.ts: NON è un file di test (non matcha
// `*.test.ts`), è il laboratorio su cui girano il banco di misura e il test di
// non regressione — e su cui gira anche il confronto con/senza cache.
//
// ZERO DATI REALI, per costruzione: nessun nome di giocatore, nessun club,
// nessuna quotazione e nessun punteggio di appetibilità è copiato da un
// listone o da un foglio di Owner. Ogni numero nasce qui da un PRNG SEMINATO
// (`mulberry32`, la stessa funzione del laboratorio del motore), quindi lo
// scenario è riproducibile bit-per-bit su qualunque macchina: senza questa
// proprietà una misura di performance non è confrontabile con se stessa e un
// test di regressione non è rosso per il motivo giusto.
//
// La FORMA imita la sagoma operativa reale della sera d'asta — 532 righe di
// listone, otto squadre, 224 acquisti (8 x 28 slot: l'asta FINITA, che è il
// momento in cui il giro di render costa di più) — perché una misura presa su
// una fixture da dieci righe non dice niente su cosa succede davvero.

import { reduce } from "../packages/engine/src/reduce.js";
import { ROLES, ROSTER_REQUIREMENTS } from "../packages/engine/src/types.js";
import type { AuctionEvent, AuctionState, Role } from "../packages/engine/src/types.js";
import type { ListonePlayer } from "./ui/listone.js";
import { listonePlayerKey } from "./ui/listone.js";

/**
 * PRNG seminato (mulberry32): 32 bit di stato, nessuna dipendenza, stessa
 * sequenza ovunque. `Math.random()` qui sarebbe un bug — renderebbe la misura
 * non riproducibile e il test di regressione intermittente.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le otto squadre del tavolo. Etichette sintetiche, nessuna lega reale. */
export const PERF_TEAMS: readonly string[] = [
  "Squadra 1",
  "Squadra 2",
  "Squadra 3",
  "Squadra 4",
  "Squadra 5",
  "Squadra 6",
  "Squadra 7",
  "Squadra 8",
];

export const PERF_SELF = PERF_TEAMS[0]!;

/** Il listone di riferimento: 532 righe, la sagoma del classico. */
export const PERF_POOL_ROWS = 532;

/** Ricetta sintetica: una sola, come `validateListonePool` pretende. */
const PERF_RECIPE = "SYNTHETIC-APPEAL-RECIPE@0.0.0";
const PERF_QUALITY = "sintetico — fixture di misura, non validato";
const TS = "2026-08-01T12:00:00Z";

/** Composizione per ruolo di un listone di Serie A, in quota sul totale. */
const ROLE_SHARE: Readonly<Record<Role, number>> = { P: 0.11, D: 0.34, C: 0.34, A: 0.21 };

/** Quote del listone: molte righe da pochi crediti, poche da tante. */
function drawQuotation(rnd: () => number): number {
  const u = rnd();
  if (u < 0.55) return 1 + Math.floor(rnd() * 4);
  if (u < 0.8) return 5 + Math.floor(rnd() * 8);
  if (u < 0.93) return 13 + Math.floor(rnd() * 13);
  return 26 + Math.floor(rnd() * 30);
}

/**
 * Un listone sintetico di `rows` righe con l'indice di appetibilità su ognuna.
 *
 * `seed` esiste per una ragione sola e non decorativa: **due listoni diversi**.
 * Il test del ricarico ha bisogno di un `pool` che sia un altro oggetto E un
 * altro contenuto, altrimenti «il libro cambia dopo il ricarico» sarebbe vero
 * per caso.
 *
 * `withIndex: false` produce righe senza `appealIndex`: è il ramo `no-index`.
 */
export function perfPool(rows = PERF_POOL_ROWS, seed = 20260824, withIndex = true): ListonePlayer[] {
  const rnd = mulberry32(seed);
  const pool: ListonePlayer[] = [];
  const width = String(rows).length;
  let index = 0;
  for (const role of ROLES) {
    const count = role === "A" ? rows - index : Math.max(1, Math.round(rows * ROLE_SHARE[role]));
    for (let i = 0; i < count && index < rows; i++, index++) {
      // Nome UNICO per riga: `listonePlayerKey` è nome+club normalizzati, e due
      // chiavi uguali fanno rifiutare l'ordinamento (`ordering-refused`) — cioè
      // misurerebbero il ramo che esce subito invece del libro.
      const name = `Sintetico ${String(index).padStart(width, "0")}`;
      const club = `Club ${String(index % 20).padStart(2, "0")}`;
      const score = Math.round(rnd() * 10000) / 100;
      pool.push({
        name,
        role,
        club,
        quotation: drawQuotation(rnd),
        ...(withIndex
          ? {
              appealIndex: {
                score,
                quality: PERF_QUALITY,
                recipe: PERF_RECIPE,
                components: { appetibilitaBase: score },
              },
            }
          : {}),
      });
    }
  }
  return pool;
}

/**
 * Il log dell'asta: `purchases` acquisti distribuiti sulle otto squadre
 * rispettando gli slot per ruolo (3/9/9/7). Con `purchases = 224` il tavolo è
 * pieno: è il caso peggiore realistico, e il repository misura proprio lì il
 * giro di render più caro.
 */
export function perfLog(
  pool: readonly ListonePlayer[],
  purchases = 224,
  seed = 20260824,
): AuctionEvent[] {
  const rnd = mulberry32(seed ^ 0x5f5f);
  const byRole: Record<Role, ListonePlayer[]> = { P: [], D: [], C: [], A: [] };
  for (const row of pool) byRole[row.role].push(row);

  const filled: Record<string, Record<Role, number>> = {};
  for (const id of PERF_TEAMS) filled[id] = { P: 0, D: 0, C: 0, A: 0 };

  const events: AuctionEvent[] = [];
  let seq = 0;
  let turn = 0;
  // Giro fisso sui ruoli e sulle squadre: deterministico e senza collisioni,
  // ogni riga venduta una volta sola.
  const cursor: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  outer: while (events.length < purchases) {
    let placedThisPass = false;
    for (const role of ROLES) {
      if (events.length >= purchases) break outer;
      let team: string | null = null;
      for (let probe = 0; probe < PERF_TEAMS.length; probe++) {
        const cand = PERF_TEAMS[(turn + probe) % PERF_TEAMS.length]!;
        if (filled[cand]![role] < ROSTER_REQUIREMENTS[role]) {
          team = cand;
          turn = (turn + probe + 1) % PERF_TEAMS.length;
          break;
        }
      }
      if (team === null) continue;
      const rows = byRole[role];
      if (cursor[role] >= rows.length) continue;
      const row = rows[cursor[role]]!;
      cursor[role] += 1;
      filled[team]![role] += 1;
      placedThisPass = true;
      const inflation = 1.05 + rnd() * 0.3;
      events.push({
        type: "PURCHASE",
        seq,
        ts: TS,
        playerId: listonePlayerKey(row),
        role,
        fantaTeamId: team,
        price: Math.max(1, Math.round((row.quotation ?? 1) * inflation)),
      });
      seq += 1;
    }
    if (!placedThisPass) break;
  }
  return events;
}

export interface TierPerfScenario {
  readonly pool: ListonePlayer[];
  readonly log: AuctionEvent[];
  readonly state: AuctionState;
  /** La riga selezionata a schermo: quella su cui si leggono i fatti di fascia. */
  readonly called: ListonePlayer;
}

/**
 * Lo scenario completo pronto per il banco: listone, log, stato derivato e una
 * riga chiamata.
 *
 * La riga chiamata è quella con l'indice di appetibilità PIÙ ALTO fra le non
 * vendute, e la scelta non è estetica: è l'unica che garantisce un chiamato IN
 * FASCIA (prima fascia del suo ruolo). Un chiamato «fondo» produce
 * `occupancy: null` e `pricesPaidInTier: null` — cioè il ramo che esce subito,
 * che è più povero sia da misurare sia da confrontare.
 */
export function tierPerfScenario(
  rows = PERF_POOL_ROWS,
  purchases = 224,
  seed = 20260824,
): TierPerfScenario {
  const pool = perfPool(rows, seed);
  const log = perfLog(pool, purchases, seed);
  const sold = new Set(log.map((e) => (e.type === "PURCHASE" ? e.playerId : "")));
  let called = pool[0]!;
  let best = -Infinity;
  for (const row of pool) {
    if (sold.has(listonePlayerKey(row))) continue;
    const score = row.appealIndex?.score;
    if (score === undefined || score === null || !Number.isFinite(score)) continue;
    if (score > best) {
      best = score;
      called = row;
    }
  }
  return { pool, log, state: reduce(log, PERF_TEAMS), called };
}
