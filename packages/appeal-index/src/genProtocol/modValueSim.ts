// GEN-PROTOCOL-A §D.9 — MOD-VALUE: il contributo marginale ai modificatori. PURO.
//
// MOD-CALC (`modCalc.ts`) calcola i tre modificatori di una giornata REALE, ed
// e' esatto. Non prova pero' nulla sulla stima PRE-ASTA, che e' una domanda
// diversa: «quanto vale, in bonus di squadra, avere questo giocatore invece del
// suo replacement?». Quella e' MOD-VALUE, ed e' quello che vive qui, col suo
// backtest.
//
// TRE SCELTE DI DISEGNO CHE VENGONO DAL PROTOCOLLO, non dalla comodita':
//
//   1. si campionano GIORNATE REALI INTERE. Compagni e avversari entrano con le
//      LORO righe di QUELLA giornata, non con estrazioni indipendenti. Le
//      correlazioni di giornata — la domenica in cui tutti i difensori di una
//      difesa prendono 7, la giornata da tre gol — restano reali invece di
//      essere ipotizzate indipendenti, che e' l'ipotesi che gonfia o sgonfia
//      sistematicamente i bonus di squadra;
//   2. chi e' SV quella giornata conta come non schierabile e si RICAMPIONA il
//      SINGOLO SLOT, non l'intera giornata: sostituire la giornata intera
//      cambierebbe la distribuzione delle giornate campionate verso quelle in
//      cui tutti hanno giocato;
//   3. i tre contributi si riportano SEPARATI. Mai una somma: il regolamento li
//      tratta separati e il prodotto anche. Una funzione che restituisse un
//      totale renderebbe la somma inevitabile.
//
// E una scelta che il protocollo impone e che vale la pena rendere esplicita:
// il giocatore focale entra con la sua DISTRIBUZIONE T-D (predetta, o empirica
// realizzata nel backtest), tutti gli altri con le loro righe reali. Cosi' fra
// candidato e baseline cambia una cosa sola — la distribuzione del giocatore —
// e la differenza misura la parte predetta, non i contesti, che sono
// convenzionali e identici nei due termini (§D.9, «Backtest MOD-VALUE»).

import { mulberry32, nextIndex, GEN_SEEDS, type GenRandom } from "./prng.js";
import { GEN_ROLES, isValidPresence, type GenRole, type GenPanelRow, type GenSeason, type MatchdayVote } from "./genTypes.js";
import { attackTableBonus, defenseModifier, midfieldModifier, type BaseVote } from "./modCalc.js";
import {
  buildJointVoteDistribution,
  buildVoteDistribution,
  normalizeCounts,
  VOTE_BIN_COUNT,
  VOTE_BIN_VALUES,
} from "./voteDistribution.js";

/** Giornate simulate per giocatore (§D.9): 20.000. */
export const MOD_VALUE_DRAWS = 20_000;

/** Soglia dell'errore MC: `< 5%` del valore stimato, altrimenti si raddoppia M una volta sola (§D.9). */
export const MOD_VALUE_MC_ERROR_THRESHOLD = 0.05;

/** Il seme preregistrato delle simulazioni T6 (§C, §D.9). */
export const MOD_VALUE_SEED = GEN_SEEDS.modifierSimulation;

/** Numerosita' del blocco difensivo simulato: portiere + 4 difensori (§D.9, §19). */
export const DEFENSE_BLOCK_DEFENDERS = 4;

/** Compagni di centrocampo del lato proprio, oltre al giocatore focale (§D.9). */
export const MIDFIELD_OWN_TEAMMATES = 4;

/** Numerosita' avversaria di centrocampo: estratta uniforme da {4, 5} (§D.9). */
export const MIDFIELD_OPPONENT_SIZES: readonly number[] = [4, 5] as const;

/** Il pool «posseduti» per ruolo (§D.9): i primi 24 P / 72 D / 72 C / 56 A. */
export const OWNED_POOL_SIZE: Readonly<Record<GenRole, number>> = { P: 24, D: 72, C: 72, A: 56 } as const;

/** Il rango del replacement usato dalle differenze (§D.9): 25° P, 73° D, 73° C, 57° A. */
export const REPLACEMENT_POOL_RANK: Readonly<Record<GenRole, number>> = { P: 25, D: 73, C: 73, A: 57 } as const;

/** Chiave di una giornata dell'archivio. */
export interface MatchdayKey {
  readonly season: GenSeason;
  readonly matchday: number;
}

/**
 * L'archivio delle giornate reali campionabili: `(stagione, giornata)` ->
 * righe per giocatore.
 *
 * `keys` e' ordinato per stagione e giornata: l'estrazione uniforme dipende
 * dall'ordine dell'array, e un ordine che dipendesse dall'ordine di arrivo
 * delle righe renderebbe il seme insufficiente a riprodurre il risultato.
 */
export interface GenMatchdayArchive {
  readonly keys: readonly MatchdayKey[];
  readonly rows: ReadonlyMap<string, ReadonlyMap<string, MatchdayVote>>;
}

function archiveKey(key: MatchdayKey): string {
  return `${key.season}#${String(key.matchday)}`;
}

/**
 * Costruisce l'archivio dalle righe di panel fino a `maxSeason` INCLUSA.
 *
 * Il filtro sulla stagione e' l'anteriorita' di §D.9: «si estrae una coppia
 * (stagione ≤ s−1, giornata)». Una giornata della stagione di test dentro
 * l'archivio sarebbe leakage, e sarebbe invisibile perche' il risultato
 * resterebbe plausibile.
 */
export function buildMatchdayArchive(
  panel: readonly GenPanelRow[],
  seasonsUpTo: readonly GenSeason[],
): GenMatchdayArchive {
  const allowed = new Set(seasonsUpTo);
  const rows = new Map<string, Map<string, MatchdayVote>>();
  for (const player of panel) {
    if (!allowed.has(player.season)) continue;
    for (const md of player.matchdays) {
      if (md.season !== player.season) {
        throw new Error(
          `buildMatchdayArchive: riga giornaliera di stagione '${md.season}' dentro il panel di '${player.season}'`,
        );
      }
      const key = archiveKey(md);
      const bucket = rows.get(key);
      if (bucket === undefined) rows.set(key, new Map([[player.playerKey, md]]));
      else bucket.set(player.playerKey, md);
    }
  }
  const keys = [...rows.keys()]
    .map((key) => {
      const [season = "", matchday = "0"] = key.split("#");
      return { season, matchday: Number(matchday) };
    })
    .sort((a, b) => (a.season < b.season ? -1 : a.season > b.season ? 1 : a.matchday - b.matchday));
  return { keys, rows };
}

/** I pool di contesto: posseduti per ruolo piu' il replacement di ciascun ruolo. */
export interface GenContextPools {
  readonly owned: Readonly<Record<GenRole, readonly string[]>>;
  readonly replacement: Readonly<Partial<Record<GenRole, string>>>;
}

/**
 * Costruisce i pool dal ranking point-in-time: i primi `OWNED_POOL_SIZE[role]`
 * sono i «posseduti», il successivo e' il replacement.
 *
 * `ranking` e' la mappa `playerKey -> rango` che produce
 * `priceCurve.pointInTimeRanking` (fantamedia `s−1` shrunk, tie-break presenze
 * poi nome): §D.9 chiede «lo stesso ordinamento di B0-T3», e riusarne
 * l'implementazione e' il modo di essere sicuri che sia lo stesso davvero.
 */
export function buildContextPools(
  ranking: ReadonlyMap<string, number>,
  roleOf: (playerKey: string) => GenRole | undefined,
): GenContextPools {
  const owned: Record<GenRole, string[]> = { P: [], D: [], C: [], A: [] };
  const replacement: Partial<Record<GenRole, string>> = {};
  for (const role of GEN_ROLES) {
    const players = [...ranking.entries()]
      .filter(([playerKey]) => roleOf(playerKey) === role)
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      .map(([playerKey]) => playerKey);
    owned[role] = players.slice(0, OWNED_POOL_SIZE[role]);
    const replacementIndex = REPLACEMENT_POOL_RANK[role] - 1;
    const chosen = players[replacementIndex];
    if (chosen !== undefined) replacement[role] = chosen;
  }
  return { owned, replacement };
}

export type ModValueTarget = "MD" | "MC" | "MA";

export interface ModValueResult {
  readonly target: ModValueTarget;
  readonly playerKey: string;
  readonly role: GenRole;
  /** Contributo atteso PER GIORNATA GIOCATA. */
  readonly perMatchday: number;
  /** Versione stagionale `Δ · N̂`; `null` se il chiamante non passa `N̂` — non si inventa. */
  readonly seasonal: number | null;
  /** Errore standard Monte Carlo della media stimata. */
  readonly mcStandardError: number;
  /** `true` se l'errore MC e' ≥ 5% del valore: il chiamante raddoppia M UNA volta sola (§D.9). */
  readonly mcErrorAboveThreshold: boolean;
  readonly draws: number;
  readonly seed: number;
  /** Slot ricampionati perche' il giocatore estratto era SV quella giornata. */
  readonly resampledSlots: number;
  /** Estrazioni che non hanno potuto formare un contesto valido: contate, mai nascoste. */
  readonly failedDraws: number;
}

export interface ModValueOptions {
  readonly draws?: number;
  readonly seed?: number;
  /** `N̂` per la versione stagionale. Assente -> `seasonal: null`. */
  readonly expectedPresences?: number;
}

/** Il giocatore focale: la sua distribuzione T-D e il resto del contesto. */
export interface ModValueSubject {
  readonly playerKey: string;
  readonly role: GenRole;
  /** Distribuzione del voto base sui 9 bin (predetta, o empirica realizzata nel backtest). */
  readonly voteDistribution: readonly number[];
  /**
   * Distribuzione congiunta a 18 bin (voto × flag_bonus) — obbligatoria per ΔMA,
   * dove l'eleggibilita' dipende dall'assenza di bonus (§A.3, §D.9).
   */
  readonly jointDistribution?: readonly number[];
}

/**
 * ΔMD (§D.9) — portieri e difensori: bonus difesa col giocatore dentro il
 * blocco MENO lo stesso valore col replacement al suo posto.
 *
 * L'attivazione (portiere con voto valido e ≥ 4 difensori con voto valido) fa
 * parte della simulazione, non e' un'ipotesi: una giornata in cui il blocco non
 * si forma contribuisce 0 alla differenza, ed e' un fatto sul modificatore, non
 * un caso da scartare.
 */
export function simulateDeltaMD(
  subject: ModValueSubject,
  archive: GenMatchdayArchive,
  pools: GenContextPools,
  options: ModValueOptions = {},
): ModValueResult {
  if (subject.role !== "P" && subject.role !== "D") {
    throw new Error(`simulateDeltaMD: ΔMD e' definito per P e D, non per '${subject.role}'`);
  }
  const draws = options.draws ?? MOD_VALUE_DRAWS;
  const seed = options.seed ?? MOD_VALUE_SEED;
  const random = mulberry32(seed);
  const state = { resampled: 0, failed: 0 };
  const samples: number[] = [];

  for (let d = 0; d < draws; d++) {
    const key = archive.keys[nextIndex(random, archive.keys.length)];
    if (key === undefined) {
      state.failed++;
      continue;
    }
    const dayRows = archive.rows.get(archiveKey(key));
    if (dayRows === undefined) {
      state.failed++;
      continue;
    }
    const focalVote = sampleVote(subject.voteDistribution, random);
    const replacementKey = pools.replacement[subject.role];
    const replacementVote =
      replacementKey === undefined ? null : drawRealVote(dayRows, [replacementKey], random, state);

    let withFocal: number;
    let withReplacement: number;
    if (subject.role === "P") {
      const defenders = drawSlots(dayRows, pools.owned.D, DEFENSE_BLOCK_DEFENDERS, [subject.playerKey], random, state);
      withFocal = defenseModifier(focalVote, defenders).bonus;
      withReplacement = defenseModifier(replacementVote, defenders).bonus;
    } else {
      const goalkeeper = drawSlots(dayRows, pools.owned.P, 1, [], random, state)[0] ?? null;
      const teammates = drawSlots(
        dayRows,
        pools.owned.D,
        DEFENSE_BLOCK_DEFENDERS - 1,
        [subject.playerKey, ...(replacementKey === undefined ? [] : [replacementKey])],
        random,
        state,
      );
      withFocal = defenseModifier(goalkeeper, [focalVote, ...teammates]).bonus;
      withReplacement = defenseModifier(goalkeeper, [replacementVote, ...teammates]).bonus;
    }
    samples.push(withFocal - withReplacement);
  }

  return summarize("MD", subject, samples, draws, seed, state, options);
}

/**
 * ΔMC (§D.9) — centrocampisti: differenza attesa del bonus centrocampo col
 * giocatore al posto del replacement, contro un centrocampo avversario la cui
 * numerosita' si estrae uniforme da {4, 5}.
 *
 * I voti fittizi da 5 per il lato con meno centrocampisti li applica
 * `midfieldModifier`, esattamente come da §20: qui non si riscrive la regola,
 * si chiama.
 */
export function simulateDeltaMC(
  subject: ModValueSubject,
  archive: GenMatchdayArchive,
  pools: GenContextPools,
  options: ModValueOptions = {},
): ModValueResult {
  if (subject.role !== "C") throw new Error(`simulateDeltaMC: ΔMC e' definito per C, non per '${subject.role}'`);
  const draws = options.draws ?? MOD_VALUE_DRAWS;
  const seed = options.seed ?? MOD_VALUE_SEED;
  const random = mulberry32(seed);
  const state = { resampled: 0, failed: 0 };
  const samples: number[] = [];
  const replacementKey = pools.replacement.C;

  for (let d = 0; d < draws; d++) {
    const key = archive.keys[nextIndex(random, archive.keys.length)];
    if (key === undefined) {
      state.failed++;
      continue;
    }
    const dayRows = archive.rows.get(archiveKey(key));
    if (dayRows === undefined) {
      state.failed++;
      continue;
    }
    const focalVote = sampleVote(subject.voteDistribution, random);
    const replacementVote = replacementKey === undefined ? null : drawRealVote(dayRows, [replacementKey], random, state);
    const exclude = [subject.playerKey, ...(replacementKey === undefined ? [] : [replacementKey])];
    const teammates = drawSlots(dayRows, pools.owned.C, MIDFIELD_OWN_TEAMMATES, exclude, random, state);
    const opponentSize = MIDFIELD_OPPONENT_SIZES[nextIndex(random, MIDFIELD_OPPONENT_SIZES.length)]!;
    const opponents = drawSlots(dayRows, pools.owned.C, opponentSize, exclude, random, state);

    const withFocal = midfieldModifier([focalVote, ...teammates], opponents).own.modifier;
    const withReplacement = midfieldModifier([replacementVote, ...teammates], opponents).own.modifier;
    samples.push(withFocal - withReplacement);
  }

  return summarize("MC", subject, samples, draws, seed, state, options);
}

/**
 * ΔMA (§D.9) — attaccanti: `Σ_v p(v, no-bonus) · bonus_attacco(v)`, IN FORMA
 * CHIUSA.
 *
 * Il modificatore attacco e' additivo per regolamento (somma algebrica sugli
 * eleggibili), quindi il contributo del singolo non dipende dai compagni e la
 * media non ha bisogno di essere simulata: si calcola. La simulazione resta
 * solo per l'incertezza, ed e' quello che il protocollo chiede — riportare un
 * errore MC su un valore che non e' stato simulato sarebbe una precisione
 * finta.
 *
 * `p(v, no-bonus)` viene dalla congiunta a 18 bin, dove `flag_bonus` e'
 * `Gf>0 ∨ Ass>0 ∨ Rs>0` (§A.3): l'insieme «senza bonus» coincide esattamente
 * con l'eleggibilita' di §21 dopo la correzione del 2026-08-21 (voto
 * sufficiente E nessun gol/assist E nessun rigore sbagliato).
 */
export function computeDeltaMA(subject: ModValueSubject, options: ModValueOptions = {}): ModValueResult {
  if (subject.role !== "A") throw new Error(`computeDeltaMA: ΔMA e' definito per A, non per '${subject.role}'`);
  const joint = subject.jointDistribution;
  if (joint === undefined || joint.length !== VOTE_BIN_COUNT * 2) {
    throw new Error("computeDeltaMA: serve la distribuzione congiunta a 18 bin (voto × flag_bonus)");
  }
  const draws = options.draws ?? MOD_VALUE_DRAWS;
  const seed = options.seed ?? MOD_VALUE_SEED;

  let expected = 0;
  for (let bin = 0; bin < VOTE_BIN_COUNT; bin++) {
    const probability = joint[bin]!; // i primi 9 bin sono «senza bonus»
    const bonus = attackTableBonus(VOTE_BIN_VALUES[bin]!) ?? 0;
    expected += probability * bonus;
  }

  // L'incertezza: si campiona dalla congiunta e si misura la dispersione del
  // contributo, che e' cio' che l'errore MC del protocollo descrive.
  const random = mulberry32(seed);
  const samples: number[] = [];
  for (let d = 0; d < draws; d++) {
    const index = sampleIndex(joint, random);
    const bonus = index < VOTE_BIN_COUNT ? (attackTableBonus(VOTE_BIN_VALUES[index]!) ?? 0) : 0;
    samples.push(bonus);
  }
  const mcStandardError = standardErrorOf(samples);
  const seasonal = options.expectedPresences === undefined ? null : expected * options.expectedPresences;
  return {
    target: "MA",
    playerKey: subject.playerKey,
    role: subject.role,
    perMatchday: expected,
    seasonal,
    mcStandardError,
    mcErrorAboveThreshold: aboveThreshold(mcStandardError, expected),
    draws,
    seed,
    resampledSlots: 0,
    failedDraws: 0,
  };
}

function summarize(
  target: ModValueTarget,
  subject: ModValueSubject,
  samples: readonly number[],
  draws: number,
  seed: number,
  state: { resampled: number; failed: number },
  options: ModValueOptions,
): ModValueResult {
  const perMatchday = samples.length > 0 ? samples.reduce((sum, value) => sum + value, 0) / samples.length : NaN;
  const mcStandardError = standardErrorOf(samples);
  return {
    target,
    playerKey: subject.playerKey,
    role: subject.role,
    perMatchday,
    seasonal: options.expectedPresences === undefined ? null : perMatchday * options.expectedPresences,
    mcStandardError,
    mcErrorAboveThreshold: aboveThreshold(mcStandardError, perMatchday),
    draws,
    seed,
    resampledSlots: state.resampled,
    failedDraws: state.failed,
  };
}

/**
 * `errore MC ≥ 5% del valore stimato` (§D.9).
 *
 * Con un valore stimato nullo il rapporto non esiste: si segnala `true`,
 * perche' «non riesco a distinguere questo contributo da zero» e' esattamente
 * l'informazione che la soglia deve trasmettere.
 */
function aboveThreshold(standardError: number, value: number): boolean {
  if (!Number.isFinite(standardError) || !Number.isFinite(value)) return true;
  if (value === 0) return standardError > 0;
  return standardError >= MOD_VALUE_MC_ERROR_THRESHOLD * Math.abs(value);
}

function standardErrorOf(samples: readonly number[]): number {
  const n = samples.length;
  if (n < 2) return NaN;
  let sum = 0;
  for (const value of samples) sum += value;
  const mean = sum / n;
  let variance = 0;
  for (const value of samples) variance += (value - mean) ** 2;
  return Math.sqrt(variance / (n - 1)) / Math.sqrt(n);
}

/** Estrae un bin dalla distribuzione e restituisce il voto rappresentativo. */
function sampleVote(distribution: readonly number[], random: GenRandom): number {
  const index = sampleIndex(distribution, random);
  return VOTE_BIN_VALUES[index % VOTE_BIN_COUNT]!;
}

/** Estrazione da una distribuzione discreta: CDF inversa, deterministica. */
function sampleIndex(distribution: readonly number[], random: GenRandom): number {
  let total = 0;
  for (const p of distribution) {
    if (!Number.isFinite(p) || p < 0) throw new Error("sampleIndex: distribuzione con probabilita' non valide");
    total += p;
  }
  if (!(total > 0)) throw new Error("sampleIndex: distribuzione a massa nulla");
  const u = random() * total;
  let cumulative = 0;
  for (let i = 0; i < distribution.length; i++) {
    cumulative += distribution[i]!;
    if (u < cumulative) return i;
  }
  return distribution.length - 1;
}

/**
 * Riempie `count` slot dal pool con le righe REALI della giornata.
 *
 * Un giocatore SV quella giornata non e' schierabile: si ricampiona IL SINGOLO
 * SLOT (fino a un numero finito di tentativi, poi lo slot resta vuoto e la
 * mancata formazione del blocco e' essa stessa un esito). `exclude` tiene fuori
 * il focale e il suo replacement, che entrano dai loro rami e non devono poter
 * comparire due volte nello stesso blocco.
 */
function drawSlots(
  dayRows: ReadonlyMap<string, MatchdayVote>,
  pool: readonly string[],
  count: number,
  exclude: readonly string[],
  random: GenRandom,
  state: { resampled: number; failed: number },
): BaseVote[] {
  const excluded = new Set(exclude);
  const used = new Set<string>();
  const out: BaseVote[] = [];
  for (let slot = 0; slot < count; slot++) {
    const vote = drawRealVote(dayRows, pool, random, state, excluded, used);
    out.push(vote);
  }
  return out;
}

/** Numero massimo di ricampionamenti di UNO slot prima di dichiararlo vuoto. */
const MAX_SLOT_RESAMPLES = 20;

function drawRealVote(
  dayRows: ReadonlyMap<string, MatchdayVote>,
  pool: readonly string[],
  random: GenRandom,
  state: { resampled: number; failed: number },
  excluded: ReadonlySet<string> = new Set(),
  used?: Set<string>,
): BaseVote {
  if (pool.length === 0) return null;
  for (let attempt = 0; attempt < MAX_SLOT_RESAMPLES; attempt++) {
    const playerKey = pool[nextIndex(random, pool.length)]!;
    if (excluded.has(playerKey) || used?.has(playerKey) === true) {
      state.resampled++;
      continue;
    }
    const row = dayRows.get(playerKey);
    if (row === undefined || !isValidPresence(row)) {
      // SV o assente quella giornata: non schierabile, si ricampiona lo slot.
      state.resampled++;
      continue;
    }
    used?.add(playerKey);
    return row.votoBase;
  }
  state.failed++;
  return null;
}

/**
 * La distribuzione EMPIRICA REALIZZATA di un giocatore in una stagione: il
 * termine `ΔM_real` del backtest (§D.9).
 *
 * «Stessa funzione con distribuzione empirica realizzata al posto della
 * predetta, stessi contesti e stesso seed»: e' letteralmente questo — si
 * costruisce la distribuzione dalle giornate realizzate e la si passa alle
 * stesse `simulateDelta*`. Nessun secondo simulatore.
 */
export function realizedVoteDistribution(matchdays: readonly MatchdayVote[]): readonly number[] | null {
  return normalizeCounts(buildVoteDistribution(matchdays).counts);
}

/** La congiunta a 18 bin realizzata: il termine `ΔM_real` di ΔMA (§D.9). */
export function realizedJointDistribution(matchdays: readonly MatchdayVote[]): readonly number[] | null {
  return normalizeCounts(buildJointVoteDistribution(matchdays).counts);
}
