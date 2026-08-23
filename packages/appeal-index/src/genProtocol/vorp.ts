// GEN-PROTOCOL-A §A.4 (T4) e §D.11 (T5, T7) — VORP, crediti, fair-to-me. PURI.
//
// «L'indice consuma T1̂ e nient'altro; T2̂, N̂ e il rischio viaggiano accanto
// come campi propri, mai fusi in un composito nascosto» (§A.4). La firma di
// `computeVorp` e' quella frase resa impossibile da violare: prende `t1Hat` e
// basta. Se un giorno servisse un peso d'incrocio fra T1̂, T2̂ e rischio, §A.4
// dice come si ottiene — «dopo i test», scritto e versionato — e sarebbe
// comunque un'altra funzione, non un parametro in piu' qui.
//
// L'aritmetica di T5 e' interamente ispezionabile per costruzione: fatti
// misurati piu' aritmetica dichiarata, senza un solo coefficiente stimato. Il
// largest-remainder non e' un dettaglio di arrotondamento: e' cio' che rende
// vera l'identita' `Σ credito = |{VORP>0}| + B_res`, e quell'identita' e' il
// modo in cui chi legge puo' verificare che nessun credito e' stato inventato
// ne' perso per strada.
//
// T7 e' l'unico punto che tocca `fair_to_me`, e va letto con §0-bis davanti:
// `value`, `fair_to_me` e `target_band` restano dietro i loro gate. Questo
// modulo calcola; non promuove, non serve e non accende nulla. `max_safe` entra
// e esce identico: e' hard-safe, e nessun numero calcolato qui lo sposta.

import { GEN_ROLES, type GenRole } from "./genTypes.js";
import { AUCTION_TOTAL_CREDITS, AUCTION_TOTAL_SLOTS, PRICE_MIN_CREDITS } from "./priceCurve.js";

/**
 * Il rango del primo giocatore NON rosterabile per ruolo (§A.4):
 * P 25, D 73, C 73, A 57.
 *
 * `[C]` da 8 squadre × rosa 3/9/9/7 = 24/72/72/56 posseduti: il replacement e'
 * il primo che resta fuori. E' la definizione di «sopra la sostituzione»: il
 * valore di un giocatore non e' quanto produce, e' quanto produce IN PIU' di
 * chi avresti comunque.
 */
export const REPLACEMENT_RANK: Readonly<Record<GenRole, number>> = { P: 25, D: 73, C: 73, A: 57 } as const;

/** Slot di rosa per ruolo, per squadra (§A.4): 3/9/9/7 = 28. */
export const ROSTER_SLOTS_BY_ROLE: Readonly<Record<GenRole, number>> = { P: 3, D: 9, C: 9, A: 7 } as const;

/** Squadre al tavolo (§A.4). */
export const LEAGUE_TEAMS = 8;

/** Decimali dell'indice di appetibilita' (§A.4: `round₁`). */
export const APPEAL_INDEX_DECIMALS = 1;

export interface VorpInput {
  readonly playerKey: string;
  readonly role: GenRole;
  /** `TOT̂(i)`: la predizione di T1, e nient'altro (§A.4). */
  readonly t1Hat: number;
}

export interface VorpRow extends VorpInput {
  /** Rango nel ruolo per `t1Hat` decrescente, 1-based. */
  readonly rank: number;
  /** `max(0, TOT̂(i) − TOT̂(r*))`. */
  readonly vorp: number;
  /** `A(i) = round₁(100·VORP/max VORP del ruolo)`, 0 per VORP ≤ 0, separato per ruolo. */
  readonly appealIndex: number;
}

export interface VorpRoleSummary {
  readonly role: GenRole;
  readonly replacementRank: number;
  /** `TOT̂(r*)`: il valore letto al rango di replacement. */
  readonly replacementValue: number;
  /** `true` se il ruolo ha meno giocatori del rango di replacement: si legge l'ultimo, e si dice. */
  readonly shortOfReplacementRank: boolean;
  readonly maxVorp: number;
  readonly scoredRows: number;
}

export interface VorpResult {
  readonly rows: readonly VorpRow[];
  readonly byRole: readonly VorpRoleSummary[];
}

/**
 * T4 — VORP e indice di appetibilita', separati per ruolo (§A.4).
 *
 * Le righe con `t1Hat` non finito non sono scorabili: restano fuori dal
 * ranking e non ricevono indice (`NaN`). Non e' un'esclusione silenziosa —
 * `scoredRows` per ruolo le conta, ed e' il denominatore che §B.3.2 confronta.
 */
export function computeVorp(inputs: readonly VorpInput[]): VorpResult {
  const rows: VorpRow[] = [];
  const byRole: VorpRoleSummary[] = [];

  for (const role of GEN_ROLES) {
    const roleInputs = inputs.filter((input) => input.role === role);
    if (roleInputs.length === 0) continue;
    const scorable = roleInputs.filter((input) => Number.isFinite(input.t1Hat));
    const sorted = [...scorable].sort(
      (a, b) => b.t1Hat - a.t1Hat || (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0),
    );
    const replacementRank = REPLACEMENT_RANK[role];
    const shortOfReplacementRank = sorted.length < replacementRank;
    const replacementIndex = Math.min(replacementRank, sorted.length) - 1;
    const replacementValue = replacementIndex >= 0 ? sorted[replacementIndex]!.t1Hat : NaN;

    const withVorp = sorted.map((input, index) => ({
      input,
      rank: index + 1,
      vorp: Math.max(0, input.t1Hat - replacementValue),
    }));
    let maxVorp = 0;
    for (const entry of withVorp) maxVorp = Math.max(maxVorp, entry.vorp);

    for (const entry of withVorp) {
      rows.push({
        ...entry.input,
        rank: entry.rank,
        vorp: entry.vorp,
        appealIndex: entry.vorp > 0 && maxVorp > 0 ? round1((100 * entry.vorp) / maxVorp) : 0,
      });
    }
    for (const input of roleInputs) {
      if (Number.isFinite(input.t1Hat)) continue;
      rows.push({ ...input, rank: NaN, vorp: NaN, appealIndex: NaN });
    }
    byRole.push({
      role,
      replacementRank,
      replacementValue,
      shortOfReplacementRank,
      maxVorp,
      scoredRows: sorted.length,
    });
  }

  return { rows, byRole };
}

/** `round₁` di §A.4, senza sorprese di virgola mobile su `x,x5`. */
function round1(value: number): number {
  const factor = 10 ** APPEAL_INDEX_DECIMALS;
  return Math.round((value + Number.EPSILON * Math.abs(value)) * factor) / factor;
}

export interface CreditAllocationRow {
  readonly playerKey: string;
  readonly role: GenRole;
  readonly vorp: number;
  /** Crediti interi assegnati: 1 per i VORP ≤ 0, `1 + quota` per gli altri. */
  readonly credits: number;
  /** La quota esatta prima dell'arrotondamento: si riporta, cosi' il resto e' verificabile. */
  readonly exactShare: number;
}

export interface CreditAllocation {
  readonly rows: readonly CreditAllocationRow[];
  readonly bPool: number;
  readonly slots: number;
  readonly bRes: number;
  readonly positiveVorpCount: number;
  readonly sumPositiveVorp: number;
  /** `Σ credito` sui soli VORP > 0: DEVE valere `positiveVorpCount + bRes` (§D.11). */
  readonly allocatedToPositive: number;
}

/**
 * Il nucleo di T5: distribuisce `B_res` sui VORP positivi con
 * largest-remainder, cosi' che `Σ credito = |{VORP>0}| + B_res` ESATTAMENTE.
 *
 * Largest-remainder e non arrotondamento indipendente: arrotondando ogni quota
 * per conto suo la somma sbaglia di qualche credito, e su un'asta «qualche
 * credito» e' un giocatore. I pareggi sul resto si rompono per VORP
 * decrescente e poi per chiave: due tavoli identici devono produrre la stessa
 * assegnazione, sempre.
 */
export function allocateCredits(rows: readonly VorpRow[], bRes: number): CreditAllocation {
  // `bPool` e `slots` escono `NaN` da qui e li riempiono i due chiamanti: questa
  // funzione conosce solo `B_res`, e scrivere un pool inventato per «avere il
  // campo pieno» significherebbe che la stessa struttura porta a volte un
  // numero misurato e a volte uno di comodo.
  if (!Number.isInteger(bRes) || bRes < 0) {
    throw new Error(`allocateCredits: B_res deve essere un intero non negativo, ricevuto '${String(bRes)}'`);
  }
  const positives = rows.filter((row) => Number.isFinite(row.vorp) && row.vorp > 0);
  let sumPositiveVorp = 0;
  for (const row of positives) sumPositiveVorp += row.vorp;

  const exact = new Map<string, number>();
  for (const row of positives) {
    exact.set(row.playerKey, sumPositiveVorp > 0 ? (bRes * row.vorp) / sumPositiveVorp : 0);
  }
  const floors = new Map<string, number>();
  let floorTotal = 0;
  for (const row of positives) {
    const value = Math.floor(exact.get(row.playerKey)!);
    floors.set(row.playerKey, value);
    floorTotal += value;
  }
  let remaining = bRes - floorTotal;
  const byRemainder = [...positives].sort((a, b) => {
    const ra = exact.get(a.playerKey)! - floors.get(a.playerKey)!;
    const rb = exact.get(b.playerKey)! - floors.get(b.playerKey)!;
    if (rb !== ra) return rb - ra;
    if (b.vorp !== a.vorp) return b.vorp - a.vorp;
    return a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0;
  });
  const extra = new Map<string, number>();
  for (const row of byRemainder) {
    if (remaining <= 0) break;
    extra.set(row.playerKey, 1);
    remaining--;
  }

  let allocatedToPositive = 0;
  const out: CreditAllocationRow[] = rows.map((row) => {
    const isPositive = Number.isFinite(row.vorp) && row.vorp > 0;
    if (!isPositive) {
      return { playerKey: row.playerKey, role: row.role, vorp: row.vorp, credits: 1, exactShare: 0 };
    }
    const credits = 1 + floors.get(row.playerKey)! + (extra.get(row.playerKey) ?? 0);
    allocatedToPositive += credits;
    return {
      playerKey: row.playerKey,
      role: row.role,
      vorp: row.vorp,
      credits,
      exactShare: exact.get(row.playerKey)!,
    };
  });

  return {
    rows: out,
    bPool: NaN,
    slots: NaN,
    bRes,
    positiveVorpCount: positives.length,
    sumPositiveVorp,
    allocatedToPositive,
  };
}

/**
 * T5 assoluto (§D.11): `B_pool = 4.000 − R`, `Slot = 224 − rinnovi`,
 * `B_res = B_pool − Slot`.
 *
 * `Slot` e' il numero di slot ancora da riempire, e ognuno costa almeno 1: per
 * questo si sottrae. `B_res` e' quel che resta da distribuire per merito.
 */
export function allocateCreditsAbsolute(
  rows: readonly VorpRow[],
  input: { readonly renewalSpend: number; readonly renewalCount: number },
): CreditAllocation {
  const bPool = AUCTION_TOTAL_CREDITS - input.renewalSpend;
  const slots = AUCTION_TOTAL_SLOTS - input.renewalCount;
  const bRes = bPool - slots;
  const allocation = allocateCredits(rows, bRes);
  return { ...allocation, bPool, slots };
}

/**
 * T5 relativo (§D.11): identica aritmetica sullo STATO RESIDUO passato dal
 * chiamante (budget residui, slot residui, giocatori residui, VORP ricalcolato
 * col replacement aggiornato).
 *
 * Il ricalcolo del VORP sui residui NON avviene qui: e' il chiamante a passare
 * righe gia' ricalcolate, perche' sa quali giocatori sono ancora in lista e
 * quanti slot restano. Questa funzione fa l'aritmetica, non l'inventario.
 */
export function allocateCreditsRelative(
  rows: readonly VorpRow[],
  input: { readonly residualBudget: number; readonly residualSlots: number },
): CreditAllocation {
  const bRes = input.residualBudget - input.residualSlots;
  const allocation = allocateCredits(rows, Math.max(0, bRes));
  return { ...allocation, bPool: input.residualBudget, slots: input.residualSlots };
}

// --- T7: fair-to-me, banda, stretch ----------------------------------------

export interface GreedyCandidate {
  readonly playerKey: string;
  readonly role: GenRole;
  /** Nome normalizzato: ultimo tie-break dei pareggi (§D.11). */
  readonly normalizedName: string;
  /** Il valore in uso: nella forma servita sono i valori DICHIARATI di Pico (§D9 punto 1). */
  readonly value: number;
  /** Prezzo atteso del giocatore: il denominatore dell'ordinamento greedy. */
  readonly expectedPrice: number;
  /** Indice A: primo tie-break dei pareggi (§D.11). */
  readonly appealIndex: number;
}

export interface RosterState {
  readonly budget: number;
  readonly slotsByRole: Readonly<Record<GenRole, number>>;
}

export interface GreedyCompletion {
  readonly totalValue: number;
  readonly spent: number;
  readonly picked: readonly string[];
}

/**
 * Il completamento greedy deterministico di §D.11.
 *
 * Ordine: `valore / prezzo atteso` decrescente; pareggi rotti per indice A
 * decrescente, poi per nome normalizzato crescente. Un candidato e' comprabile
 * se il suo ruolo ha ancora slot E se, dopo averlo comprato, restano almeno
 * tanti crediti quanti slot ancora da riempire — «ogni slot costa almeno 1» e'
 * la stessa invariante che regge `B_res` in T5, e senza di essa il greedy
 * spenderebbe tutto sul primo nome lasciando la rosa incompleta.
 */
export function greedyCompletion(candidates: readonly GreedyCandidate[], state: RosterState): GreedyCompletion {
  const slots: Record<GenRole, number> = { ...state.slotsByRole };
  let budget = state.budget;
  let totalValue = 0;
  let spent = 0;
  const picked: string[] = [];

  const ordered = [...candidates].sort((a, b) => {
    const ratioA = a.value / Math.max(PRICE_MIN_CREDITS, a.expectedPrice);
    const ratioB = b.value / Math.max(PRICE_MIN_CREDITS, b.expectedPrice);
    if (ratioB !== ratioA) return ratioB - ratioA;
    if (b.appealIndex !== a.appealIndex) return b.appealIndex - a.appealIndex;
    return a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0;
  });

  for (const candidate of ordered) {
    if (slots[candidate.role] <= 0) continue;
    const price = Math.max(PRICE_MIN_CREDITS, Math.round(candidate.expectedPrice));
    const slotsAfter = totalSlots(slots) - 1;
    if (budget - price < slotsAfter) continue;
    slots[candidate.role] -= 1;
    budget -= price;
    spent += price;
    totalValue += candidate.value;
    picked.push(candidate.playerKey);
  }
  return { totalValue, spent, picked };
}

function totalSlots(slots: Readonly<Record<GenRole, number>>): number {
  let total = 0;
  for (const role of GEN_ROLES) total += Math.max(0, slots[role]);
  return total;
}

export interface FairToMeResult {
  /** La differenza fra i due completamenti: il valore marginale di `i` a questo prezzo. */
  readonly fairToMe: number;
  readonly withFocal: number;
  readonly withoutFocal: number;
  readonly price: number;
}

/**
 * T7 — `fair_to_me(i)` = completamento ottimo CON `i` al prezzo `p` meno
 * completamento ottimo SENZA `i` (§D.11).
 *
 * Il default `p = 0` da' il valore marginale puro di `i` per questa rosa,
 * cioe' il numero con cui la catena `banda ≤ stretch ≤ ftm ≤ max_safe` si
 * confronta. Passando un `p` si ottiene la stessa differenza al netto del
 * prezzo, che e' la forma letterale del protocollo.
 *
 * Il vettore di valori arriva dal chiamante e questo modulo non lo giudica: e'
 * il punto in cui §D9 punto 1 vuole i valori DICHIARATI di Pico nella forma
 * servita, e i valori-modello solo come ricerca etichettata.
 */
export function fairToMe(
  candidates: readonly GreedyCandidate[],
  state: RosterState,
  focalKey: string,
  price = 0,
): FairToMeResult {
  const focal = candidates.find((candidate) => candidate.playerKey === focalKey);
  if (focal === undefined) throw new Error(`fairToMe: '${focalKey}' non e' fra i candidati`);
  const others = candidates.filter((candidate) => candidate.playerKey !== focalKey);

  const withoutFocal = greedyCompletion(others, state).totalValue;
  const slotsWithFocal: Record<GenRole, number> = { ...state.slotsByRole };
  slotsWithFocal[focal.role] = Math.max(0, slotsWithFocal[focal.role] - 1);
  const withFocal =
    focal.value +
    greedyCompletion(others, { budget: state.budget - price, slotsByRole: slotsWithFocal }).totalValue;

  return { fairToMe: withFocal - withoutFocal, withFocal, withoutFocal, price };
}

export interface T7Chain {
  readonly targetBand: readonly [number, number];
  readonly stretchCap: number;
  readonly fairToMe: number;
  /** `max_safe` cosi' com'e' entrato: hard-safe, mai spostato da nulla di tutto questo (§D.11). */
  readonly maxSafe: number;
}

/**
 * La catena di T7 con il clamp finale `banda ≤ stretch_cap ≤ fair_to_me ≤ max_safe`.
 *
 * `target_band = [T3̂_P25, T3̂_P75] ∩ [0, fair_to_me]`;
 * `stretch_cap = min(T3̂_P90, fair_to_me)`.
 *
 * L'ordine dei clamp e' dall'alto verso il basso e non e' invertibile: prima
 * `fair_to_me` si abbassa fino a `max_safe`, poi `stretch_cap` fino a
 * `fair_to_me`, poi la banda fino a `stretch_cap`. Al contrario, un
 * `stretch_cap` alto tirerebbe su la banda sopra un `fair_to_me` che nel
 * frattempo e' sceso.
 */
export function buildT7Chain(input: {
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  readonly fairToMe: number;
  readonly maxSafe: number;
}): T7Chain {
  const fair = Math.min(input.fairToMe, input.maxSafe);
  const stretch = Math.min(input.p90, fair);
  const bandLow = Math.min(Math.max(0, input.p25), stretch);
  const bandHigh = Math.min(Math.max(0, input.p75), stretch);
  return {
    targetBand: [Math.min(bandLow, bandHigh), Math.max(bandLow, bandHigh)],
    stretchCap: stretch,
    fairToMe: fair,
    maxSafe: input.maxSafe,
  };
}
