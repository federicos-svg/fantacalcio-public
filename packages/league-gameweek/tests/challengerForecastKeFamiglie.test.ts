import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS,
  DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS,
  SHRINK_PSEUDO_OBSERVATIONS,
  type AppearanceEvents,
  type ChallengerForecast,
  type ChallengerForecastInput,
  type Competition,
  type NoVoteKind,
  type ObservedHistory,
  type ObservedMatchSignal,
  type OpponentGameweek,
  type PlayerAppearance,
  type Role,
  type TeamGameweek,
  buildChallengerForecasts,
  challengerOpponentHabits,
  mulberry32,
  observedChallengerHistory,
  observedHistory,
  observedMatchSignals,
} from "../src/index.js";

// UN SOLO K, E L'IMPRONTA DI CIÒ CHE IL MOTORE SFIDANTE PRODUCE.
//
// Questo file prova due cose che il resto della suite dà per scontate.
//
//  1) CHE LO SHRINK DELLO SFIDANTE SIA LO STESSO NUMERO DEL BASE, NON UN NUMERO
//     UGUALE. `baseForecast.ts` e `challengerForecast.ts` avevano ciascuno la
//     sua costante, `10` e `10`: due scritture della stessa promessa («lo
//     sfidante cambia la memoria e basta, la fiducia è quella del metro»), che
//     nessun compilatore e nessuna prova tenevano insieme — se qualcuno avesse
//     cambiato l'una, i due motori avrebbero smesso di rispondere alla stessa
//     domanda senza che niente diventasse rosso. Adesso la costante è una sola,
//     importata, e la prova qui sotto la sposta di nascosto e guarda lo sfidante
//     seguirla.
//
//  2) CHE TOGLIERE UNA DUPLICAZIONE NON ABBIA MOSSO UN NUMERO. È la fotografia
//     dei NUMERI che escono dallo sfidante su una fixture sintetica ricca (tutti
//     i ruoli, i minuti, i gol attesi, i gol subiti, i senza voto, le abitudini
//     dell'avversario), registrata con il codice di PRIMA della pulizia e
//     rifatta con quello di DOPO. È una prova di caratterizzazione, non una
//     verità: dice «questi numeri sono quelli di allora», non «sono giusti». Se
//     un giorno cambia perché il motore è stato cambiato APPOSTA, l'impronta si
//     registra di nuovo nello stesso commit, con il motivo scritto accanto; se
//     cambia da sola, qualcuno ha mosso un numero senza dirlo.
//
// Fixture sintetiche, sempre: identificatori inventati, voti sulla griglia dei
// mezzi punti, nessun dato reale, nessun orologio, ogni sorteggio da
// `mulberry32` con un seme scritto qui.

const ASOF = "2026-09-09T18:00:00Z";
const PROVENANCE = "fixture sintetica — tabellini inventati per la prova";

const S0 = "STAGIONE_0";
const S1 = "STAGIONE_1";
const S2 = "STAGIONE_2";
const SEASONS = [S0, S1, S2];

// ─── LA FIXTURE RICCA ────────────────────────────────────────────────────────

const noEvents: AppearanceEvents = {
  goal: false,
  assist: false,
  yellow: false,
  red: false,
  ownGoal: false,
  penaltyMissed: false,
  penaltySaved: false,
};

const NO_VOTE_KINDS: readonly NoVoteKind[] = [
  "clean",
  "booked",
  "sentOffDuringMatch",
  "withOtherBonusMalus",
  "sentOffAfterMatch",
];

interface SyntheticPlayer {
  readonly id: string;
  readonly role: Role;
  readonly teamId: string;
  /** Il livello del voto, sulla griglia dei mezzi punti. */
  readonly level: number;
  /** La probabilità di avere voto in una giornata a disposizione. */
  readonly pVoted: number;
  /** La probabilità di giocare titolare, dato che ha voto. */
  readonly pStarter: number;
}

const PLAYERS: readonly SyntheticPlayer[] = [
  { id: "P_UNO", role: "P", teamId: "SQ_A", level: 6, pVoted: 0.95, pStarter: 1 },
  { id: "P_DUE", role: "P", teamId: "SQ_B", level: 5.5, pVoted: 0.6, pStarter: 0.9 },
  { id: "D_UNO", role: "D", teamId: "SQ_A", level: 6, pVoted: 0.9, pStarter: 0.95 },
  { id: "D_DUE", role: "D", teamId: "SQ_B", level: 6.5, pVoted: 0.85, pStarter: 0.9 },
  { id: "D_TRE", role: "D", teamId: "SQ_C", level: 5.5, pVoted: 0.5, pStarter: 0.7 },
  { id: "D_QUATTRO", role: "D", teamId: "SQ_C", level: 6, pVoted: 0.7, pStarter: 0.8 },
  { id: "C_UNO", role: "C", teamId: "SQ_A", level: 6.5, pVoted: 0.9, pStarter: 0.9 },
  { id: "C_DUE", role: "C", teamId: "SQ_B", level: 6, pVoted: 0.8, pStarter: 0.8 },
  { id: "C_TRE", role: "C", teamId: "SQ_C", level: 7, pVoted: 0.75, pStarter: 0.85 },
  { id: "C_QUATTRO", role: "C", teamId: "SQ_A", level: 5.5, pVoted: 0.4, pStarter: 0.5 },
  { id: "A_UNO", role: "A", teamId: "SQ_B", level: 7, pVoted: 0.9, pStarter: 0.9 },
  { id: "A_DUE", role: "A", teamId: "SQ_C", level: 6, pVoted: 0.8, pStarter: 0.7 },
  { id: "A_TRE", role: "A", teamId: "SQ_A", level: 6.5, pVoted: 0.65, pStarter: 0.6 },
  { id: "A_QUATTRO", role: "A", teamId: "SQ_B", level: 5.5, pVoted: 0.3, pStarter: 0.3 },
];

const GAMEWEEKS = 30;

interface RichFixture {
  readonly history: ObservedHistory;
  readonly signals: readonly ObservedMatchSignal[];
  readonly requests: readonly { playerId: string; role: Role; teamId: string }[];
}

function richFixture(): RichFixture {
  const rnd = mulberry32(20261010);
  const appearances: PlayerAppearance[] = [];
  const signals: ObservedMatchSignal[] = [];
  const teamGameweeks: TeamGameweek[] = [];
  for (const season of [S2, S1, S0]) {
    for (let gw = 1; gw <= GAMEWEEKS; gw += 1) {
      for (const teamId of ["SQ_A", "SQ_B", "SQ_C"]) {
        teamGameweeks.push({ teamId, season, gameweek: gw, goalsConceded: Math.floor(rnd() * 4) });
      }
      for (const p of PLAYERS) {
        // Le estrazioni si consumano SEMPRE e nello stesso ordine: la fixture
        // non dipende da quale ramo si prende.
        const rVoted = rnd();
        const rVote = rnd();
        const rStarter = rnd();
        const rEvent = rnd();
        const rKind = rnd();
        const rMinutes = rnd();
        const rXg = rnd();
        const rHasMinutes = rnd();
        const rHasXg = rnd();
        if (rVoted < p.pVoted) {
          const wobble = Math.floor(rVote * 5) - 2; // −2..+2 mezzi punti
          const vote = Math.min(10, Math.max(4, p.level + wobble * 0.5));
          const started = rStarter < p.pStarter;
          const events: AppearanceEvents = {
            ...noEvents,
            goal: rEvent < (p.role === "A" ? 0.25 : p.role === "C" ? 0.1 : 0.03),
            assist: rEvent > 0.85,
            yellow: rEvent > 0.5 && rEvent < 0.62,
            red: rEvent > 0.995,
            ownGoal: rEvent > 0.99 && rEvent <= 0.995,
            penaltyMissed: rEvent > 0.98 && rEvent <= 0.985,
            penaltySaved: p.role === "P" && rEvent > 0.97 && rEvent <= 0.98,
          };
          appearances.push({
            playerId: p.id,
            role: p.role,
            season,
            gameweek: gw,
            voted: true,
            baseVote: vote,
            started,
            events,
          });
          if (rHasMinutes < 0.7) {
            const minutesPlayed = started ? Math.round(60 + rMinutes * 30) : Math.round(10 + rMinutes * 30);
            signals.push({ playerId: p.id, season, gameweek: gw, minutesPlayed });
          }
          if (rHasXg < 0.5) {
            // Una parte dei gol attesi arriva su righe che hanno già i minuti, una no.
            const expectedGoals = Math.round(rXg * 120) / 100;
            const existing = signals.findIndex(
              (s) => s.playerId === p.id && s.season === season && s.gameweek === gw,
            );
            if (existing >= 0) signals[existing] = { ...(signals[existing] as ObservedMatchSignal), expectedGoals };
            else signals.push({ playerId: p.id, season, gameweek: gw, expectedGoals });
          }
        } else {
          const noVoteKind = NO_VOTE_KINDS[Math.floor(rKind * NO_VOTE_KINDS.length)] as NoVoteKind;
          appearances.push({
            playerId: p.id,
            role: p.role,
            season,
            gameweek: gw,
            voted: false,
            noVoteKind,
            ...(noVoteKind === "withOtherBonusMalus" ? { otherBonusMalus: rKind < 0.76 ? -1 : 0.5 } : {}),
          });
          // Gol attesi dichiarati su una giornata SENZA voto: dichiarati e non contati.
          if (rHasXg < 0.2) signals.push({ playerId: p.id, season, gameweek: gw, expectedGoals: 0.3 });
        }
      }
    }
  }
  // Un giocatore con due presenze sole, e uno mai visto: i due casi in cui lo
  // shrink pesa di più e in cui `K` si legge a occhio nudo.
  appearances.push({
    playerId: "NUOVO",
    role: "C",
    season: S0,
    gameweek: GAMEWEEKS,
    voted: true,
    baseVote: 8,
    started: true,
    events: noEvents,
  });
  appearances.push({
    playerId: "NUOVO",
    role: "C",
    season: S0,
    gameweek: GAMEWEEKS - 1,
    voted: true,
    baseVote: 8,
    started: true,
    events: noEvents,
  });
  const history = observedHistory({ seasons: SEASONS, appearances, teamGameweeks, provenance: PROVENANCE });
  const requests = [
    ...PLAYERS.map((p) => ({ playerId: p.id, role: p.role, teamId: p.teamId })),
    { playerId: "NUOVO", role: "C" as Role, teamId: "SQ_A" },
    { playerId: "MAI_VISTO", role: "A" as Role, teamId: "SQ_C" },
  ];
  return { history, signals, requests };
}

// ─── L'IMPRONTA ──────────────────────────────────────────────────────────────

/**
 * I NUMERI, E SOLO I NUMERI. Le tre stringhe che dicono QUALI famiglie erano
 * accese (`familiesOn`, `reason`, `sourceQuality`) sono testo di presentazione
 * e sono provate a parte; tutto il resto — probabilità, distribuzione del voto,
 * tassi di evento, righe modali, pesi, quote di shrink — entra nell'impronta.
 *
 * OGNI NUMERO È ARROTONDATO A NOVE CIFRE SIGNIFICATIVE prima di essere hashato.
 * Non per indulgenza: la specifica di ECMAScript lascia `Math.pow` e `Math.exp`
 * «approssimati dall'implementazione», e questo file gira su macchine e motori
 * che nessuno ha misurato; un'impronta che dipende dall'ultimo bit del loro
 * risultato sarebbe una prova che si rompe per ragioni che non c'entrano col
 * motore. Nove cifre sono molto più larghe di quel rumore e molto più fini di
 * qualunque cambiamento vero: portare `K` da 10 a 11 fa cadere tutte le
 * impronte che dipendono da `K` (misurato nel commit che ha introdotto questo
 * file). L'uguaglianza ESATTA, bit per bit, fra il codice di prima e quello di
 * dopo è stata verificata a parte, in sessione, e non è una promessa di questa
 * prova.
 */
function numericFingerprint(value: unknown): string {
  const json = JSON.stringify(value, (key, v) => {
    if (key === "sourceQuality" || key === "reason" || key === "familiesOn") return undefined;
    if (typeof v === "number") return Number.isFinite(v) ? v.toPrecision(9) : String(v);
    return v;
  });
  return createHash("sha256").update(json).digest("hex");
}

const FAMILIES_ALL_OFF = { recentForm: false, minutesPlayed: false, expectedGoals: false };

/** Le configurazioni su cui si fotografa il motore. Ognuna con il suo nome. */
function scenarios(): readonly { readonly name: string; readonly run: () => unknown }[] {
  const fx = richFixture();
  const signals = observedMatchSignals({ history: fx.history, signals: fx.signals });
  const base: ChallengerForecastInput = { history: fx.history, players: fx.requests, asOf: ASOF };
  const withSignals: ChallengerForecastInput = { ...base, signals };
  return [
    { name: "default, senza segnali", run: () => buildChallengerForecasts(base) },
    { name: "default, con minuti e gol attesi", run: () => buildChallengerForecasts(withSignals) },
    {
      name: "forma recente spenta, con segnali",
      run: () => buildChallengerForecasts({ ...withSignals, families: { recentForm: false } }),
    },
    {
      name: "minuti e gol attesi spenti, con segnali",
      run: () =>
        buildChallengerForecasts({ ...withSignals, families: { minutesPlayed: false, expectedGoals: false } }),
    },
    {
      name: "tutte le famiglie spente, con segnali",
      run: () => buildChallengerForecasts({ ...withSignals, families: FAMILIES_ALL_OFF }),
    },
    {
      name: "mezza vita 3",
      run: () =>
        buildChallengerForecasts({
          ...withSignals,
          tuning: { playerHalfLifeGameweeks: 3, opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS },
        }),
    },
    {
      name: "mezza vita 25",
      run: () =>
        buildChallengerForecasts({
          ...withSignals,
          tuning: { playerHalfLifeGameweeks: 25, opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS },
        }),
    },
    {
      name: "mezza vita infinita",
      run: () =>
        buildChallengerForecasts({
          ...withSignals,
          tuning: {
            playerHalfLifeGameweeks: Number.POSITIVE_INFINITY,
            opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS,
          },
        }),
    },
    ...opponentScenarios(fx.history),
  ];
}

const MODULES = ["343", "352", "442", "433", "451"];
const MANAGERS = ["ALLEN_1", "ALLEN_2", "ALLEN_3", "ALLEN_4", "ALLEN_5", "ALLEN_6", "ALLEN_7", "ALLEN_8"];

/** Due calendari, campionato e coppa, per otto fantallenatori su due stagioni. */
function opponentRowsOf(): OpponentGameweek[] {
  const rnd = mulberry32(777001);
  const rows: OpponentGameweek[] = [];
  for (const season of [S1, S0]) {
    for (let gw = 1; gw <= GAMEWEEKS; gw += 1) {
      for (const managerId of MANAGERS) {
        const module =
          managerId === "ALLEN_1" ? "343" : (MODULES[Math.floor(rnd() * MODULES.length)] as string);
        rows.push({ managerId, season, gameweek: gw, module, competition: "LEAGUE" });
        if (gw % 3 === 0) {
          const cupModule = managerId === "ALLEN_2" ? "451" : (MODULES[Math.floor(rnd() * MODULES.length)] as string);
          rows.push({ managerId, season, gameweek: gw, module: cupModule, competition: "CUP" });
        }
      }
    }
  }
  return rows;
}

function opponentScenarios(history: ObservedHistory): readonly { readonly name: string; readonly run: () => unknown }[] {
  const corpus = observedChallengerHistory({ history, opponentGameweeks: opponentRowsOf() });
  const habits = (managerId: string, competition: Competition, legalModules: readonly string[]) => ({
    name: `abitudini di ${managerId} (${competition}) su ${legalModules.length} moduli`,
    run: () => challengerOpponentHabits({ corpus, managerId, competition, legalModules }),
  });
  return [
    habits("ALLEN_1", "LEAGUE", MODULES),
    habits("ALLEN_3", "LEAGUE", MODULES),
    habits("ALLEN_2", "CUP", MODULES),
    habits("ALLEN_1", "LEAGUE", ["343", "442"]),
    habits("MAI_VISTO", "LEAGUE", MODULES),
  ];
}

/**
 * L'IMPRONTA REGISTRATA CON IL CODICE DI PRIMA DELLA PULIZIA: il
 * `challengerForecast.ts` del commit 65dae2fcc322a1fc2cc3bfe612c9ac5b58606e88,
 * con queste stesse fixture. Una riga per scenario, così che un'impronta che si
 * rompe dica QUALE.
 *
 * Per registrarla di nuovo, nello stesso commit che cambia il motore APPOSTA e
 * con il motivo scritto nel messaggio: `IMPRONTA_STAMPA=1 npx vitest run
 * packages/league-gameweek/tests/challengerForecastKeFamiglie.test.ts` stampa
 * una riga `IMPRONTA|nome|hash` per scenario.
 */
const IMPRONTA_REGISTRATA: Readonly<Record<string, string>> = {
  "default, senza segnali":
    "4405c6aaa51189d6324e8fd0518e7e7f9bd95d631c9304b67d31ae1cb4e4062c",
  "default, con minuti e gol attesi":
    "9dbb14ba176b8bb3832653ad77f5b074b9d4f862252953c99dd5bea099167cff",
  "forma recente spenta, con segnali":
    "70669492d04243af719271ac7b791f7a44ac73a7f61b79753cc60633b12d0034",
  "minuti e gol attesi spenti, con segnali":
    "4405c6aaa51189d6324e8fd0518e7e7f9bd95d631c9304b67d31ae1cb4e4062c",
  "tutte le famiglie spente, con segnali":
    "166c70dab721e6568d93b5636d05bedcac1ed53071f7852a02879e45c459ce0d",
  "mezza vita 3":
    "db3ee31e9231adef91cb8a0f84cc32898f610dc51c61064bcc0e5a5b6513dbe3",
  "mezza vita 25":
    "72a2b7e468a66bdda1812827ac1e9df0309b60d25dabef0dbe628ca7768b7506",
  "mezza vita infinita":
    "d636e384349b0da2cdcce1eaa246a92097ea7865589e850fcd9cf1b22326dd04",
  "abitudini di ALLEN_1 (LEAGUE) su 5 moduli":
    "8660cfa8a20a080972046829a6b986778f1d8057b7eeb0b973bd987b6a0943a9",
  "abitudini di ALLEN_3 (LEAGUE) su 5 moduli":
    "c4eac18c45e56be5a7e02e7653a665e4f765938b4556506aebca2f1a9a050c53",
  "abitudini di ALLEN_2 (CUP) su 5 moduli":
    "50852b441aae3d85543094927e17e1c4de9fbae13702b122322fa21c69ed72e2",
  "abitudini di ALLEN_1 (LEAGUE) su 2 moduli":
    "4ae9e8547fc67c5efb66b25c5a63e8efd70ddd0efa1b7b3293c605ce769856ec",
  "abitudini di MAI_VISTO (LEAGUE) su 5 moduli":
    "93e4fe58fd012b694a2349673756a7a71d405b81336caadb3d4c5c9e39bd87a5",
};

describe("motore sfidante — l'impronta dei numeri non si è mossa", () => {
  const all = scenarios();

  it("la fixture è ricca davvero: tutte le fattispecie e i due segnali sono presenti", () => {
    const fx = richFixture();
    const kinds = new Set(
      fx.history.appearances.filter((a) => !a.voted).map((a) => a.noVoteKind as NoVoteKind),
    );
    expect([...kinds].sort()).toEqual([...NO_VOTE_KINDS].sort());
    const roles = new Set(fx.history.appearances.map((a) => a.role));
    expect([...roles].sort()).toEqual(["A", "C", "D", "P"]);
    expect(fx.signals.some((s) => s.minutesPlayed !== undefined)).toBe(true);
    expect(fx.signals.some((s) => s.expectedGoals !== undefined)).toBe(true);
    expect(fx.history.teamGameweeks.length).toBeGreaterThan(0);
  });

  it.each(all.map((s) => [s.name, s] as const))("%s", (name, scenario) => {
    const actual = numericFingerprint(scenario.run());
    if (process.env["IMPRONTA_STAMPA"] === "1") {
      console.log(`IMPRONTA|${name}|${actual}`);
    }
    expect(actual).toBe(IMPRONTA_REGISTRATA[name]);
  });
});

// ─── UN SOLO K ───────────────────────────────────────────────────────────────

describe("motore sfidante — K è uno solo", () => {
  it("il vecchio nome è un alias del K del base, oggi e sempre", () => {
    expect(SHRINK_PSEUDO_OBSERVATIONS).toBe(10);
    expect(CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS).toBe(SHRINK_PSEUDO_OBSERVATIONS);
  });

  it("se il base cambia K, lo sfidante lo segue: non esiste un secondo 10", async () => {
    // LA PROVA CHE UN `10 === 10` NON PUÒ DARE. Con le due costanti uguali di
    // valore, «K dello sfidante = K del base» è vero anche quando sono due
    // scritture indipendenti, e una prova che confronta i due valori passa
    // nelle due disposizioni. Qui il valore del base viene spostato a 7 PRIMA
    // che lo sfidante lo importi: se lo sfidante lo legge da là, la sua quota di
    // shrink diventa `7 / (peso + 7)`; se ha ancora il suo `10`, resta
    // `10 / (peso + 10)` e questa prova è l'unica a cadere.
    //
    // Il modulo del base viene ricaricato con la sola costante cambiata e tutto
    // il resto IDENTICO (`importOriginal`), quindi ciò che si misura è l'effetto
    // di K e di nient'altro. I moduli si scaricano a fine prova.
    const fx = richFixture();
    vi.resetModules();
    vi.doMock("../src/baseForecast.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../src/baseForecast.js")>()),
      SHRINK_PSEUDO_OBSERVATIONS: 7,
    }));
    try {
      const challenger = await import("../src/challengerForecast.js");
      expect(challenger.CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS).toBe(7);
      const out = challenger.buildChallengerForecasts({
        history: fx.history,
        players: [{ playerId: "NUOVO", role: "C", teamId: "SQ_A" }],
        asOf: ASOF,
      })[0] as ChallengerForecast;
      const e = out.evidence;
      expect(e.priorShareAvailability).toBe(7 / (e.availabilityWeight + 7));
      expect(e.priorSharePerformance).toBe(7 / (e.performanceWeight + 7));
      expect(e.reason).toContain("con lo shrink a 7 osservazioni equivalenti");
    } finally {
      vi.doUnmock("../src/baseForecast.js");
      vi.resetModules();
    }

    // E senza lo spostamento, K è quello di sempre: la prova sopra si è mossa
    // per la costante e non per il modo di caricare i moduli.
    const plain = buildChallengerForecasts({
      history: fx.history,
      players: [{ playerId: "NUOVO", role: "C", teamId: "SQ_A" }],
      asOf: ASOF,
    })[0] as ChallengerForecast;
    expect(plain.evidence.priorShareAvailability).toBe(10 / (plain.evidence.availabilityWeight + 10));
    expect(plain.evidence.reason).toContain("con lo shrink a 10 osservazioni equivalenti");
  });
});
