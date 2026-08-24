// GEN-PROTOCOL-A — i mondi sintetici: l'autonomia di prova del motore. PURI.
//
// A che cosa servono. Un generatore di algoritmi che si giudica solo sui dati
// reali non e' verificabile: quando sbaglia, non c'e' modo di sapere se ha
// sbagliato il metodo o se il segnale non c'era. I mondi sintetici mettono
// il metodo alla prova su domande di cui si conosce gia' la risposta:
//
//   - `powerWorld`  — un mondo in cui il segnale ESISTE, con coefficienti
//     piantati e noti. Se la selezione non lo trova, il difetto e' nel motore;
//   - `nullWorld`   — un mondo in cui il segnale NON esiste. Se la selezione
//     trova un vincitore, il motore produce vincitori per caso, ed e'
//     esattamente cio' che §B.4 e' scritto per impedire;
//   - `leakCanaryWorld` — un mondo con una stagione futura da intercettare
//     (§G.4) e, dalla v2.0.0, una presenza alla giornata `G + 1` che l'audit
//     del layer deve intercettare (§D.15.6);
//   - `svCoercionCanary` — un mondo pieno di SV, con i conteggi attesi
//     scritti accanto: nessun percorso deve trasformare un SV in uno zero
//     (§A.1), e qui la violazione si vede come un numero sbagliato, non come
//     un'intenzione tradita.
//
// Nessun nome reale, nessuna squadra reale, nessuna quotazione: le chiavi sono
// `PW_D_017` e simili, e le squadre sono lettere. Il fantavoto delle righe
// generate NON viene mai ricalcolato a mano: passa da `matchdayFantavoto`, che
// e' la tariffa canonica. Un mondo che si costruisse una tariffa propria
// proverebbe cose su una lega che non esiste.
//
// Tutto e' seminato con `mulberry32`: due chiamate con lo stesso seme
// producono lo stesso mondo, byte per byte. E' la precondizione dei test di
// determinismo, non un vezzo.

import { mulberry32, type GenRandom } from "./prng.js";
import { matchdayFantavoto, type GenPanelRow, type GenRole, type GenSeason, type MatchdayVote } from "./genTypes.js";

/** Le sette feature su cui `powerWorld` pianta i coefficienti veri. */
export const PLANTED_FEATURES = [
  "titolaritaShare",
  "goalsPer90",
  "keyPassesPer90",
  "assistsPer90",
  "foulsPer90",
  "totalShotsPer90",
  "dispossessedPer90",
] as const;

export type PlantedFeature = (typeof PLANTED_FEATURES)[number];

/**
 * I coefficienti VERI, sulla scala delle feature (non degli z).
 *
 * Sono scelti perche' i prodotti `|β_j| × sd(feature_j)` risultino ben
 * separati: cosi' l'ordine di importanza e' una proprieta' del mondo, e un
 * test puo' chiedere che il modello lo recuperi invece di limitarsi ai segni.
 * Due segni sono NEGATIVI apposta — un mondo in cui tutto aiuta non
 * distinguerebbe un modello da un contatore.
 */
export const PLANTED_COEFFICIENTS: Readonly<Record<PlantedFeature, number>> = {
  titolaritaShare: 4,
  goalsPer90: 6,
  keyPassesPer90: 0.6,
  assistsPer90: 2.8,
  foulsPer90: -0.4,
  totalShotsPer90: 0.2,
  dispossessedPer90: -0.15,
} as const;

/** Feature generate ma SENZA effetto: servono a vedere se il modello ci casca. */
export const NOISE_FEATURES = ["clearancesPer90", "interceptionsPer90"] as const;

/**
 * Come si muove la titolarita' di un giocatore fra una stagione e l'altra.
 *
 * Serve al layer di §D.15, che vive esattamente su questa domanda: le presenze
 * delle prime giornate dicono qualcosa che la stagione precedente non sapeva
 * gia'?
 *
 *   - `drifting` (default): la titolarita' segue il profilo del giocatore, che
 *     persiste ma si muove. E' il regime normale;
 *   - `stable`: la titolarita' e' FISSA per tutta la carriera. `N(s−1)` e' gia'
 *     una stima ottima del giocatore, e due giornate osservate non possono
 *     aggiungere nulla: e' il mondo in cui il layer NON deve accendersi;
 *   - `shocked`: una quota di stagioni riparte da una titolarita' nuova
 *     (trasferimento, gerarchia nuova). `N(s−1)` e' sistematicamente sbagliato
 *     per quelli, e le prime giornate lo rivelano: e' il mondo in cui il layer
 *     DEVE battere l'incumbent;
 *   - `earlyIndependent`: le prime giornate si giocano con una moneta SLEGATA
 *     dal resto della stagione (l'emergenza, il turnover di agosto, il rientro
 *     tardivo). E' il vero null del layer, e vale la pena dire perche' non lo
 *     e' `stable`: anche con una titolarita' costante, `p_1…p_G` sono
 *     osservazioni di Bernoulli su una `p` che l'incumbent conosce solo con
 *     errore, quindi qualcosa la aggiungono davvero — pretendere che non lo
 *     facciano sarebbe pretendere una falsita'. Il null giusto e' «le prime
 *     giornate non dicono NULLA sul resto», ed e' questo.
 */
export type StarterRegime = "drifting" | "stable" | "shocked" | "earlyIndependent";

/** Giornate iniziali slegate dal resto, nel regime `earlyIndependent`. */
export const EARLY_INDEPENDENT_MATCHDAYS = 3;

/** Quota di stagioni con titolarita' rifondata, nel regime `shocked`. */
export const STARTER_SHOCK_FRACTION = 0.35;

export interface SyntheticWorldOptions {
  /** Stagioni generate (default 8): ≥ 6 e' il minimo perche' FAM-2 possa vincere. */
  readonly seasons?: number;
  /** Giocatori (default 130): ≥ 120 e' il minimo dichiarato. */
  readonly players?: number;
  /** Prima stagione, formato `"YYYY_YY"` (default `"2016_17"`). */
  readonly firstSeason?: GenSeason;
  /** Prefisso delle chiavi: mai un nome, nemmeno inventato. */
  readonly keyPrefix?: string;
  /** Regime di titolarita' (default `drifting`). */
  readonly starterRegime?: StarterRegime;
}

export interface SyntheticWorld {
  readonly panel: readonly GenPanelRow[];
  readonly seasons: readonly GenSeason[];
  readonly seed: number;
  /** Ruolo per chiave: il chiamante ne ha bisogno per i pool di contesto. */
  readonly roleOf: ReadonlyMap<string, GenRole>;
}

export interface PowerWorld extends SyntheticWorld {
  readonly trueCoefficients: Readonly<Record<PlantedFeature, number>>;
  readonly plantedFeatures: readonly PlantedFeature[];
  readonly noiseFeatures: readonly string[];
}

const DEFAULT_SEASONS = 8;
const DEFAULT_PLAYERS = 130;
const DEFAULT_FIRST_SEASON = "2016_17";
const MATCHDAYS = 38;

/** Persistenza del profilo del giocatore fra stagioni: un giocatore resta se stesso. */
const PROFILE_PERSISTENCE = 0.7;

/** Rumore sul livello di rendimento della stagione, in punti di fantamedia. */
const LEVEL_NOISE_SD = 0.35;

/** Quota di ruoli: 1 P ogni 8, poi D/C/A come la rosa (9/9/7 su 25 di movimento). */
function roleForIndex(index: number): GenRole {
  const bucket = index % 8;
  if (bucket === 0) return "P";
  if (bucket <= 3) return "D";
  if (bucket <= 6) return "C";
  return "A";
}

function seasonLabel(firstSeason: GenSeason, offset: number): GenSeason {
  const start = Number(firstSeason.slice(0, 4)) + offset;
  const end = (start + 1) % 100;
  return `${String(start)}_${String(end).padStart(2, "0")}`;
}

/** Normale standard da un uniforme seminato: Box-Muller, senza stato nascosto. */
function nextNormal(random: GenRandom): number {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Voto base sulla griglia 0,5, dentro [1, 10] — la griglia che P0.3 verifica sui dati veri. */
function toVoteGrid(value: number): number {
  const clamped = Math.min(10, Math.max(1, value));
  return Math.round(clamped * 2) / 2;
}

interface Profile {
  readonly starter: number;
  readonly keyPass: number;
  readonly shots: number;
  readonly goals: number;
  readonly assists: number;
  readonly fouls: number;
  readonly dispossessed: number;
  readonly noiseA: number;
  readonly noiseB: number;
}

function drawProfile(random: GenRandom, previous: Profile | null): Profile {
  const mix = (before: number): number =>
    previous === null
      ? nextNormal(random)
      : PROFILE_PERSISTENCE * before + Math.sqrt(1 - PROFILE_PERSISTENCE ** 2) * nextNormal(random);
  return {
    starter: mix(previous?.starter ?? 0),
    keyPass: mix(previous?.keyPass ?? 0),
    shots: mix(previous?.shots ?? 0),
    goals: mix(previous?.goals ?? 0),
    assists: mix(previous?.assists ?? 0),
    fouls: mix(previous?.fouls ?? 0),
    dispossessed: mix(previous?.dispossessed ?? 0),
    noiseA: mix(previous?.noiseA ?? 0),
    noiseB: mix(previous?.noiseB ?? 0),
  };
}

interface SeasonDraft {
  readonly profile: Profile;
  readonly presences: number;
  readonly matchdays: readonly MatchdayVote[];
  readonly stats: Record<string, number | null>;
  /** Le feature piantate, calcolate come le calcolera' il catalogo: il ponte fra mondo e modello. */
  readonly plantedValues: Readonly<Record<PlantedFeature, number>>;
}

/**
 * Genera una stagione per un giocatore.
 *
 * `level` e' il livello di rendimento della stagione: nel `powerWorld` viene
 * dalle feature della stagione PRECEDENTE coi coefficienti veri; nel
 * `nullWorld` e' rumore puro. Il resto del generatore e' identico nei due
 * mondi, ed e' importante che lo sia: se differissero anche nel modo di
 * generare i voti, il confronto fra i due direbbe qualcosa sui generatori,
 * non sul motore.
 */
function draftSeason(
  random: GenRandom,
  role: GenRole,
  season: GenSeason,
  playerKey: string,
  previousProfile: Profile | null,
  level: number,
  regime: StarterRegime = "drifting",
  anchorStarter: number | null = null,
): SeasonDraft {
  const profile = drawProfile(random, previousProfile);
  const starterLatent =
    regime === "stable" && anchorStarter !== null
      ? anchorStarter
      : regime === "shocked" && random() < STARTER_SHOCK_FRACTION
        ? nextNormal(random)
        : profile.starter;
  const starterShare = Math.min(1, Math.max(0.05, 0.5 + 0.25 * starterLatent));
  const presenceProbability = Math.min(0.97, Math.max(0.1, 0.35 + 0.45 * starterShare));

  // Nel regime `earlyIndependent` le prime giornate hanno la loro moneta, e non
  // e' quella della stagione.
  const earlyProbability = regime === "earlyIndependent" ? 0.1 + 0.8 * random() : presenceProbability;

  const matchdays: MatchdayVote[] = [];
  let presences = 0;
  for (let matchday = 1; matchday <= MATCHDAYS; matchday++) {
    const probability = matchday <= EARLY_INDEPENDENT_MATCHDAYS ? earlyProbability : presenceProbability;
    if (random() > probability) {
      matchdays.push(emptyRow(season, matchday));
      continue;
    }
    presences++;
    const votoBase = toVoteGrid(6 + level + nextNormal(random) * 0.9);
    const scoringRate = Math.max(0, 0.05 + 0.03 * profile.goals);
    const assistRate = Math.max(0, 0.04 + 0.02 * profile.assists);
    const Gf = random() < scoringRate ? 1 : 0;
    const Ass = random() < assistRate ? 1 : 0;
    const Amm = random() < 0.12 ? 1 : 0;
    // `Gs` SOLO sul portiere: la tariffa canonica lancia su una riga non-P con
    // `Gs ≠ 0` (guardia P0.4), e una fixture che la violasse non sarebbe una
    // fixture, sarebbe un dato che non e' quello che crediamo.
    const Gs = role === "P" && random() < 0.55 ? 1 : 0;
    const Rp = role === "P" && random() < 0.02 ? 1 : 0;
    matchdays.push({
      season,
      matchday,
      votoBase,
      isAsterisk: false,
      Gf,
      Gs,
      Rp,
      Rs: 0,
      Rf: 0,
      Au: 0,
      Amm,
      Esp: 0,
      Ass,
    });
  }

  const appearances = presences;
  const matchesStarted = Math.round(appearances * starterShare);
  const minutesPlayed = Math.round(appearances * (55 + 35 * starterShare));
  const per90Units = minutesPlayed / 90;
  const keyPasses = Math.max(0, Math.round(per90Units * (1.2 + 0.6 * profile.keyPass)));
  const totalShots = Math.max(0, Math.round(per90Units * (1.5 + 0.7 * profile.shots)));
  const goals = Math.max(0, Math.round(per90Units * (0.2 + 0.12 * profile.goals)));
  const assists = Math.max(0, Math.round(per90Units * (0.15 + 0.1 * profile.assists)));
  const fouls = Math.max(0, Math.round(per90Units * (1 + 0.5 * profile.fouls)));
  const dispossessed = Math.max(0, Math.round(per90Units * (1.3 + 0.6 * profile.dispossessed)));
  const clearances = Math.max(0, Math.round(per90Units * (1.1 + 0.5 * profile.noiseA)));
  const interceptions = Math.max(0, Math.round(per90Units * (1 + 0.45 * profile.noiseB)));

  const stats: Record<string, number | null> = {
    appearances,
    matchesStarted,
    minutesPlayed,
    keyPasses,
    totalShots,
    goals,
    assists,
    fouls,
    dispossessed,
    clearances,
    interceptions,
  };

  const definedPer90 = (value: number): number => (minutesPlayed >= 270 ? (value * 90) / minutesPlayed : NaN);
  const plantedValues: Record<PlantedFeature, number> = {
    titolaritaShare: appearances >= 5 ? matchesStarted / appearances : NaN,
    goalsPer90: definedPer90(goals),
    keyPassesPer90: definedPer90(keyPasses),
    assistsPer90: definedPer90(assists),
    foulsPer90: definedPer90(fouls),
    totalShotsPer90: definedPer90(totalShots),
    dispossessedPer90: definedPer90(dispossessed),
  };

  void playerKey;
  return { profile, presences, matchdays, stats, plantedValues };
}

function emptyRow(season: GenSeason, matchday: number): MatchdayVote {
  return {
    season,
    matchday,
    votoBase: null,
    isAsterisk: false,
    Gf: 0,
    Gs: 0,
    Rp: 0,
    Rs: 0,
    Rf: 0,
    Au: 0,
    Amm: 0,
    Esp: 0,
    Ass: 0,
  };
}

function toPanelRow(
  playerKey: string,
  role: GenRole,
  season: GenSeason,
  draft: SeasonDraft,
  team: string,
): GenPanelRow {
  let totFantavoto = 0;
  let voteSum = 0;
  for (const row of draft.matchdays) {
    if (row.votoBase === null) continue;
    totFantavoto += matchdayFantavoto(row, role, playerKey);
    voteSum += row.votoBase;
  }
  const presenze = draft.presences;
  return {
    playerKey,
    role,
    season,
    presenze,
    totFantavoto,
    fantamedia: presenze > 0 ? totFantavoto / presenze : null,
    mediaVotoBase: presenze > 0 ? voteSum / presenze : null,
    matchdays: draft.matchdays,
    seasonStats: draft.stats,
    team,
  };
}

/**
 * Il livello della stagione dalle feature della precedente, coi coefficienti
 * veri: `level = Σ β_j (x_j − centro_j) + ε`.
 *
 * Il centraggio serve solo a tenere il livello attorno a zero (cioe' la
 * fantamedia attorno a 6): non cambia i coefficienti, che sono la cosa che il
 * test deve recuperare. Una feature non definita (minuti sotto soglia)
 * contribuisce 0, che e' l'unica lettura possibile senza inventare un valore.
 */
const PLANTED_CENTERS: Readonly<Record<PlantedFeature, number>> = {
  titolaritaShare: 0.5,
  goalsPer90: 0.2,
  keyPassesPer90: 1.2,
  assistsPer90: 0.15,
  foulsPer90: 1,
  totalShotsPer90: 1.5,
  dispossessedPer90: 1.3,
} as const;

function levelFromPrevious(previous: SeasonDraft | null, random: GenRandom): number {
  const noise = nextNormal(random) * LEVEL_NOISE_SD;
  if (previous === null) return noise;
  let level = 0;
  for (const feature of PLANTED_FEATURES) {
    const value = previous.plantedValues[feature];
    if (!Number.isFinite(value)) continue;
    level += PLANTED_COEFFICIENTS[feature] * (value - PLANTED_CENTERS[feature]);
  }
  return level + noise;
}

/**
 * Il mondo con il segnale: il rendimento della stagione `s` dipende dalle
 * feature della stagione `s−1` con i coefficienti di `PLANTED_COEFFICIENTS`.
 */
export function powerWorld(seed: number, options: SyntheticWorldOptions = {}): PowerWorld {
  const world = generateWorld(seed, options, "PW", () => levelFromPrevious);
  return {
    ...world,
    trueCoefficients: PLANTED_COEFFICIENTS,
    plantedFeatures: [...PLANTED_FEATURES],
    noiseFeatures: [...NOISE_FEATURES],
  };
}

/**
 * Persistenza del rendimento nel `nullWorld`: un AR(1) con ρ = 0,71.
 *
 * Il numero non e' arbitrario, ed e' la parte piu' delicata di tutto il file.
 * Un mondo «senza segnale» in cui anche la BASELINE e' cieca non prova niente:
 * qualunque candidato la batterebbe, legittimamente, e il test leggerebbe come
 * «vincitore per caso» un vantaggio vero. Perche' il null sia un vero null
 * servono due proprieta' insieme:
 *
 *   1. il rendimento e' MARKOVIANO — dato `s−1`, le stagioni piu' vecchie non
 *      aggiungono nulla. Cosi' nemmeno una media multi-stagione (FAM-1) puo'
 *      guadagnare sul lag singolo;
 *   2. il peso ottimo sul lag e' ≈ ρ, e B0-T2 usa `n/(n + 10)`, che con le ~25
 *      presenze tipiche di questo generatore vale ≈ 0,71. Scegliendo ρ = 0,71
 *      la baseline preregistrata e' anche quella (quasi) ottima.
 *
 * Con queste due, nessun candidato ha nulla da guadagnare, e un vincitore
 * dichiarato qui e' davvero un vincitore per caso.
 */
const NULL_WORLD_PERSISTENCE = 0.71;

/**
 * Il mondo senza segnale: le STATISTICHE non aggiungono nulla sopra la
 * persistenza del giocatore.
 *
 * E' questo il null giusto, e non «il bersaglio e' rumore puro». In un mondo di
 * puro rumore anche la baseline sarebbe cieca — B0 shrinkerebbe una fantamedia
 * precedente che non predice niente — e un elastic net che manda tutto a zero
 * la batterebbe di netto: un «vincitore» vero, non casuale, che pero' non
 * proverebbe niente sul motore. Qui invece la qualita' del giocatore persiste
 * (quindi B0 fa il suo mestiere, ed e' pure calibrato bene: vedi
 * `NULL_WORLD_SEASON_NOISE_VARIANCE`) e le feature statistiche sono
 * indipendenti dal bersaglio. Un motore che dichiara un vincitore qui sta
 * leggendo il rumore, ed e' esattamente cio' che §B.4 e' scritta per impedire.
 */
export function nullWorld(seed: number, options: SyntheticWorldOptions = {}): SyntheticWorld {
  return generateWorld(seed, options, "NW", (random) => {
    let level = nextNormal(random);
    let first = true;
    return () => {
      if (first) {
        first = false;
        return level;
      }
      level =
        NULL_WORLD_PERSISTENCE * level + Math.sqrt(1 - NULL_WORLD_PERSISTENCE ** 2) * nextNormal(random);
      return level;
    };
  });
}

function generateWorld(
  seed: number,
  options: SyntheticWorldOptions,
  defaultPrefix: string,
  levelFactory: (random: GenRandom) => (previous: SeasonDraft | null, random: GenRandom) => number,
): SyntheticWorld {
  const seasonCount = options.seasons ?? DEFAULT_SEASONS;
  const playerCount = options.players ?? DEFAULT_PLAYERS;
  const firstSeason = options.firstSeason ?? DEFAULT_FIRST_SEASON;
  const prefix = options.keyPrefix ?? defaultPrefix;
  const random = mulberry32(seed);

  const seasons: GenSeason[] = [];
  for (let s = 0; s < seasonCount; s++) seasons.push(seasonLabel(firstSeason, s));

  const panel: GenPanelRow[] = [];
  const roleOf = new Map<string, GenRole>();

  const regime = options.starterRegime ?? "drifting";

  for (let p = 0; p < playerCount; p++) {
    const role = roleForIndex(p);
    const playerKey = `${prefix}_${role}_${String(p + 1).padStart(3, "0")}`;
    roleOf.set(playerKey, role);
    const levelOf = levelFactory(random);
    let previous: SeasonDraft | null = null;
    let anchorStarter: number | null = null;
    let team = `T${String(p % 20)}`;
    for (const season of seasons) {
      // Un cambio squadra ogni tanto: `teamChangedFlag` deve avere qualcosa da
      // misurare, altrimenti la colonna e' costante e il test non la tocca.
      if (random() < 0.15) team = `T${String(Math.floor(random() * 20))}`;
      const level = levelOf(previous, random);
      const draft = draftSeason(random, role, season, playerKey, previous?.profile ?? null, level, regime, anchorStarter);
      if (anchorStarter === null) anchorStarter = draft.profile.starter;
      panel.push(toPanelRow(playerKey, role, season, draft, team));
      previous = draft;
    }
  }

  return { panel, seasons, seed, roleOf };
}

export interface LeakCanaryWorld extends SyntheticWorld {
  /** La stagione «di lavoro»: le righe con questo target non devono cambiare mai. */
  readonly targetSeason: GenSeason;
  /** La stagione sintetica `s+1` da iniettare. */
  readonly futureSeason: GenSeason;
  /** Le righe di panel della stagione futura, gia' pronte da iniettare. */
  readonly futureRows: readonly GenPanelRow[];
}

/**
 * Il mondo del canarino di anteriorita' (§G.4).
 *
 * Le righe della stagione futura sono ESAGERATE (38 presenze, fantamedia
 * altissima, statistiche fuori scala): se una di esse raggiungesse una feature
 * del passato, la differenza sarebbe grande e visibile. Un canarino che canta
 * piano non e' un canarino.
 */
export function leakCanaryWorld(seed: number, options: SyntheticWorldOptions = {}): LeakCanaryWorld {
  const world = generateWorld(seed, { ...options, seasons: options.seasons ?? 5 }, "LC", () => levelFromPrevious);
  const seasons = world.seasons;
  const targetSeason = seasons[seasons.length - 1]!;
  const futureSeason = seasonLabel(targetSeason, 1);
  const futureRows: GenPanelRow[] = [];
  const random = mulberry32(seed + 1);
  for (let i = 0; i < 3; i++) {
    const role: GenRole = i === 0 ? "P" : "C";
    const playerKey = `LC_FUTURE_${String(i + 1)}`;
    const draft = draftSeason(random, role, futureSeason, playerKey, null, 4);
    futureRows.push(toPanelRow(playerKey, role, futureSeason, draft, "TX"));
  }
  return { ...world, targetSeason, futureSeason, futureRows };
}

/**
 * Le giornate di evidenza del layer con UNA presenza oltre la finestra (§D.15.6).
 *
 * L'audit del layer DEVE intercettarla: e' la versione «prime giornate» del
 * canarino di §G.4, e senza di essa la deroga circoscritta all'anteriorita'
 * sarebbe una deroga senza guardia.
 */
export function earlyEvidenceCanaryMatchdays(season: GenSeason, G: number): readonly MatchdayVote[] {
  const rows: MatchdayVote[] = [];
  for (let matchday = 1; matchday <= G; matchday++) {
    rows.push({ ...emptyRow(season, matchday), votoBase: 6.5 });
  }
  // La riga proibita: giornata G+1 della stagione target.
  rows.push({ ...emptyRow(season, G + 1), votoBase: 7 });
  return rows;
}

export interface SvCanaryWorld extends SyntheticWorld {
  /** Righe giornaliere senza voto piantate, per stagione. */
  readonly expectedSvRows: number;
  /** Presenze valide attese, per stagione: il numero che deve tornare a valle. */
  readonly expectedValidPresences: number;
  /** Giocatori con la stagione INTERAMENTE SV: `N = 0`, `T1 = 0`, `T2` indefinito (§A.3). */
  readonly allSvPlayers: readonly string[];
}

/**
 * Il canarino della coercizione SV (§A.1: «un `SV` non e' uno zero, mai, in
 * nessun punto della pipeline»).
 *
 * Il mondo pianta SV in quantita' nota e dichiara i conteggi attesi a valle. Un
 * percorso che coercisse un SV a zero non lancerebbe alcuna eccezione: farebbe
 * scendere una fantamedia e salire un conteggio di presenze, e sono proprio
 * quei due numeri che il test confronta. Fra i giocatori ce n'e' uno con la
 * stagione INTERAMENTE SV, che e' il caso limite: `N = 0` legittimo, `T1 = 0`
 * legittimo, `T2` indefinito e mai 0.
 */
export function svCoercionCanary(seed: number): SvCanaryWorld {
  const random = mulberry32(seed);
  const season: GenSeason = "2019_20";
  const seasons = [season];
  const panel: GenPanelRow[] = [];
  const roleOf = new Map<string, GenRole>();
  const allSvPlayers: string[] = [];
  let expectedSvRows = 0;
  let expectedValidPresences = 0;

  // 12 giocatori: 10 con meta' giornate SV, 2 interamente SV.
  for (let p = 0; p < 12; p++) {
    const role = roleForIndex(p);
    const playerKey = `SV_${role}_${String(p + 1).padStart(2, "0")}`;
    roleOf.set(playerKey, role);
    const allSv = p >= 10;
    if (allSv) allSvPlayers.push(playerKey);
    const matchdays: MatchdayVote[] = [];
    let presences = 0;
    let totFantavoto = 0;
    let voteSum = 0;
    for (let matchday = 1; matchday <= MATCHDAYS; matchday++) {
      const isSv = allSv || matchday % 2 === 0;
      if (isSv) {
        matchdays.push(emptyRow(season, matchday));
        expectedSvRows++;
        continue;
      }
      const votoBase = toVoteGrid(6 + nextNormal(random) * 0.8);
      const row: MatchdayVote = { ...emptyRow(season, matchday), votoBase };
      matchdays.push(row);
      presences++;
      expectedValidPresences++;
      totFantavoto += matchdayFantavoto(row, role, playerKey);
      voteSum += votoBase;
    }
    panel.push({
      playerKey,
      role,
      season,
      presenze: presences,
      totFantavoto,
      fantamedia: presences > 0 ? totFantavoto / presences : null,
      mediaVotoBase: presences > 0 ? voteSum / presences : null,
      matchdays,
      seasonStats: {},
      team: "TS",
    });
  }

  return { panel, seasons, seed, roleOf, expectedSvRows, expectedValidPresences, allSvPlayers };
}
