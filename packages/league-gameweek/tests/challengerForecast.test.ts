import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHALLENGER_FORECAST_MARK,
  DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS,
  DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS,
  LEAGUE_PRIOR_GAMEWEEKS,
  OPPONENT_PRIOR_GAMEWEEKS,
  type AppearanceEvents,
  type ChallengerForecast,
  type ExPostCeilingInput,
  type NoVoteKind,
  type ObservedChallengerHistory,
  type ObservedHistory,
  type ObservedPlayerLine,
  type OpponentGameweek,
  type PlayerAppearance,
  type Role,
  type TeamGameweek,
  buildBaseForecasts,
  buildChallengerForecasts,
  challengerOpponentHabits,
  mulberry32,
  observedChallengerHistory,
  observedHistory,
} from "../src/index.js";

// FIXTURE SINTETICHE, SEMPRE. Identificatori costruiti, voti scelti sulla
// griglia dei mezzi punti, nessun dato reale, nessuna rete, nessun orologio:
// `ASOF` è una stringa dichiarata e non viene mai confrontata con l'ora
// corrente, e ogni sorteggio passa da `mulberry32` con un seme scritto qui.
// Due esecuzioni di questo file, oggi e fra un anno, vedono gli stessi numeri.

const ASOF = "2026-09-09T18:00:00Z";
const PROVENANCE = "fixture sintetica — tabellini inventati per la prova";

// `S0` è la stagione PIÙ RECENTE: l'indice È «quante stagioni fa» (§6.2).
const S0 = "STAGIONE_0";
const S1 = "STAGIONE_1";
const S2 = "STAGIONE_2";
const SEASONS = [S0, S1, S2];
const GAMEWEEKS_PER_SEASON = 38;

const noEvents: AppearanceEvents = {
  goal: false,
  assist: false,
  yellow: false,
  red: false,
  ownGoal: false,
  penaltyMissed: false,
  penaltySaved: false,
};

function voted(
  playerId: string,
  season: string,
  gameweek: number,
  baseVote: number,
  role: Role = "C",
): PlayerAppearance {
  return { playerId, role, season, gameweek, voted: true, baseVote, started: true, events: noEvents };
}

function missed(
  playerId: string,
  season: string,
  gameweek: number,
  noVoteKind: NoVoteKind = "clean",
  role: Role = "C",
): PlayerAppearance {
  return { playerId, role, season, gameweek, voted: false, noVoteKind };
}

/** La media della distribuzione del voto base. È il numero che si confronta. */
function meanVote(forecast: { readonly distribution?: { readonly baseVote: readonly { readonly vote: number; readonly probability: number }[] } }): number {
  const masses = forecast.distribution?.baseVote ?? [];
  let sum = 0;
  for (const mass of masses) sum += mass.vote * mass.probability;
  return sum;
}

// ─── LA STORIA SENZA NESSUN SEGNALE ───────────────────────────────────────
//
// Voti estratti a caso attorno a una media, uguali per tutti, indipendenti fra
// giornate e fra giocatori: non c'è forma, non c'è tendenza, non c'è niente da
// imparare. È la prova che conta di più di tutte, perché il modo tipico in cui
// un motore che «impara» sbaglia non è imparare poco: è imparare il rumore e
// sembrare migliorato.

const NOISE_GRID = [5, 5.5, 6, 6.5, 7, 7.5];
const NOISE_PLAYERS = ["RUM_1", "RUM_2", "RUM_3", "RUM_4", "RUM_5", "RUM_6", "RUM_7", "RUM_8"];

/**
 * Il corpo di rumore: tre stagioni piene, otto giocatori, nessun segnale.
 * `upToGameweek` tronca la stagione PIÙ RECENTE: è così che si costruisce una
 * finestra «prima della giornata t» senza mai far entrare la giornata t.
 */
function noiseHistory(upToGameweek: number): PlayerAppearance[] {
  const rnd = mulberry32(424242);
  const rows: PlayerAppearance[] = [];
  for (const season of [S2, S1, S0]) {
    const last = season === S0 ? upToGameweek : GAMEWEEKS_PER_SEASON;
    for (let gw = 1; gw <= GAMEWEEKS_PER_SEASON; gw += 1) {
      for (const id of NOISE_PLAYERS) {
        // Le estrazioni si consumano SEMPRE, anche per le giornate che poi si
        // scartano: così il taglio a `upToGameweek` cambia solo QUANTO si vede,
        // mai CHE COSA. Due tagli diversi vedono lo stesso identico rumore.
        const plays = rnd();
        const pick = Math.floor(rnd() * NOISE_GRID.length);
        if (season === S0 && gw > last) continue;
        if (plays < 0.85) rows.push(voted(id, season, gw, NOISE_GRID[pick] as number));
        else rows.push(missed(id, season, gw, pick % 2 === 0 ? "clean" : "booked"));
      }
    }
  }
  return rows;
}

function sealed(rows: readonly PlayerAppearance[], teamGameweeks: readonly TeamGameweek[] = []): ObservedHistory {
  return observedHistory({ seasons: SEASONS, appearances: rows, teamGameweeks, provenance: PROVENANCE });
}

const requests = (ids: readonly string[]): readonly { playerId: string; role: Role; teamId: string }[] =>
  ids.map((playerId) => ({ playerId, role: "C" as Role, teamId: "SQUADRA_1" }));

/**
 * IL VALORE VERO CHE HA GENERATO IL RUMORE. La griglia è uniforme, quindi la
 * media è la sua media aritmetica: 6,25. In una fixture inventata la verità si
 * conosce, ed è la cosa giusta contro cui misurare.
 */
const NOISE_TRUE_MEAN = 6.25;

/**
 * IL BANCO DI PROVA, E CHE COSA NON È.
 *
 * Misura una cosa sola: quanto lontano cade la previsione dal valore VERO che
 * ha generato i dati, su giornate che il motore non aveva visto quando ha
 * previsto (walk-forward: si prevede la giornata `t` con le sole giornate
 * `< t`). Somma degli scarti assoluti: più basso è meglio.
 *
 * PERCHÉ CONTRO IL VALORE VERO E NON CONTRO IL VOTO POI USCITO. Il voto uscito
 * è il valore vero PIÙ il rumore di quella domenica, e quel rumore vale circa
 * 0,7 di varianza per previsione mentre la differenza fra i due motori vale
 * qualche centesimo: su qualche decina di previsioni la seconda sparisce dentro
 * il primo, e una prova che non riesce a vedere ciò che cerca non è una prova —
 * è una moneta lanciata con un commento sopra. Su una fixture inventata il
 * valore vero si conosce, e misurare contro quello toglie il rumore dalla
 * MISURA senza toglierlo dai DATI, che è dove deve restare.
 *
 * NON È IL CRITERIO DI §2.4, e non deve essere scambiato per quello. §2.4
 * confronta punti di lega realizzati e rimpianto su formazioni intere, su una
 * finestra di sei giornate, con regole di esclusione (coppa, voto politico,
 * proposta mancante) che qui non esistono; è PRE-REGISTRATO, vive altrove, e
 * questo pacchetto non lo implementa, non lo tocca e non lo interpreta. Questa
 * è una prova di laboratorio dentro un file di test: non promuove niente, non
 * entra in nessun prodotto, e nessuna riga di `src/` la chiama.
 */
function walkForward(
  cuts: readonly number[],
  historyAt: (upTo: number) => readonly PlayerAppearance[],
  players: readonly string[],
  truth: number,
  halfLife?: number,
): { readonly base: number; readonly challenger: number; readonly points: number; readonly challengerWins: number } {
  let base = 0;
  let challenger = 0;
  let points = 0;
  let challengerWins = 0;
  for (const cut of cuts) {
    const history = sealed(historyAt(cut - 1));
    const baseOut = buildBaseForecasts({ history, players: requests(players), asOf: ASOF });
    const challengerOut = buildChallengerForecasts({
      history,
      players: requests(players),
      asOf: ASOF,
      ...(halfLife === undefined
        ? {}
        : { tuning: { playerHalfLifeGameweeks: halfLife, opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS } }),
    });
    players.forEach((_, i) => {
      const eBase = Math.abs(meanVote((baseOut[i] as { forecast: unknown }).forecast as never) - truth);
      const eChallenger = Math.abs(meanVote((challengerOut[i] as ChallengerForecast).forecast) - truth);
      base += eBase;
      challenger += eChallenger;
      points += 1;
      if (eChallenger < eBase) challengerWins += 1;
    });
  }
  return { base, challenger, points, challengerWins };
}

const NOISE_CUTS = [24, 26, 28, 30, 32, 34, 36, 38];

describe("motore sfidante — la prova che conta: il rumore non si impara", () => {
  it("su una storia senza nessun segnale lo sfidante NON batte il base", () => {
    // COME SI LEGGE. Tre stagioni di voti estratti a caso attorno a 6,25, otto
    // giocatori, nessuna forma e nessuna tendenza: il numero giusto da
    // prevedere è sempre lo stesso, e chi «impara» non ha niente da imparare.
    //
    // PERCHÉ LO SFIDANTE DEVE PERDERE, E NON PAREGGIARE. Dimenticare costa
    // prove: con mezza vita 8 giornate il peso totale disponibile è circa 12
    // osservazioni equivalenti invece delle ~68 che il base raccoglie su tre
    // stagioni, quindi la sua stima personale è costruita su meno roba e balla
    // di più attorno al valore vero. Quando non c'è segnale, quella è una
    // perdita secca — ed è esattamente il prezzo che si accetta di pagare per
    // poter cogliere la forma quando invece il segnale c'è.
    //
    // SE UN GIORNO QUESTO TEST DIVENTASSE VERDE AL CONTRARIO — lo sfidante
    // meglio del base sul rumore — non sarebbe una buona notizia: vorrebbe dire
    // che sta leggendo qualcosa che nei dati non c'è. E il modo più facile
    // perché succeda è che la giornata da prevedere entri nella storia da cui
    // si prevede: si vede qui, in laboratorio, invece che a marzo in campo.
    const result = walkForward(NOISE_CUTS, noiseHistory, NOISE_PLAYERS, NOISE_TRUE_MEAN);

    expect(result.points).toBe(NOISE_CUTS.length * NOISE_PLAYERS.length);
    // Scarto totale dal vero: lo sfidante deve stare SOPRA, cioè peggio.
    expect(result.challenger).toBeGreaterThan(result.base);
    // E non deve nemmeno vincere la maggioranza delle singole previsioni: un
    // pareggio nel totale con il 70 % di vittorie singole sarebbe comunque un
    // motore che «sembra» migliore a chi conta le giornate.
    expect(result.challengerWins / result.points).toBeLessThan(0.5);
  });

  it("più in fretta dimentica, peggio va sul rumore: la scala è monotona", () => {
    // LA STESSA PROVA, CON TRE MEMORIE. Se lo sfidante stesse leggendo un
    // segnale vero, dimenticare di più a un certo punto lo aiuterebbe. Qui non
    // c'è segnale, quindi dimenticare di più deve solo peggiorare le cose — e
    // la monotonia è la firma del rumore: nessuna mezza vita «magica» che vince.
    const slow = walkForward(NOISE_CUTS, noiseHistory, NOISE_PLAYERS, NOISE_TRUE_MEAN, 40);
    const middle = walkForward(NOISE_CUTS, noiseHistory, NOISE_PLAYERS, NOISE_TRUE_MEAN);
    const fast = walkForward(NOISE_CUTS, noiseHistory, NOISE_PLAYERS, NOISE_TRUE_MEAN, 2);

    expect(slow.challenger).toBeLessThan(middle.challenger);
    expect(middle.challenger).toBeLessThan(fast.challenger);
    // E anche la memoria più lunga resta sopra il base: su tre stagioni di
    // rumore il metro cieco è imbattibile, ed è giusto così.
    expect(slow.challenger).toBeGreaterThan(slow.base);
  });
});

// ─── IL SEGNALE PIANTATO DENTRO APPOSTA ───────────────────────────────────

const IMPROVER = "MIGLIORA";
// I DUE LIVELLI SONO SCELTI CONTRO LO SFIDANTE, NON A SUO FAVORE. Il livello
// vecchio (6,5) sta SOPRA la media di ruolo del rumore (6,25): siccome lo
// sfidante è più shrinkato del base, prima del salto la sua stima è più BASSA,
// cioè più lontana dal livello nuovo. Ogni centesimo che guadagna dopo il salto
// se l'è preso rimontando quello svantaggio, e non può venire dallo shrink.
const OLD_LEVEL = 6.5;
const NEW_LEVEL = 9.5;

/**
 * Lo stesso rumore di prima, più UN giocatore che migliora davvero: 5,5 per due
 * stagioni e mezza, poi 7,5 a partire dalla giornata `SWITCH_AT` della stagione
 * più recente. Il salto è vero, netto e piantato a mano: se un motore che
 * dovrebbe cogliere la forma non coglie questo, non coglierà niente.
 */
const SWITCH_AT = 25;

function signalHistory(upToGameweek: number): PlayerAppearance[] {
  const rows = [...noiseHistory(upToGameweek)];
  for (const season of [S2, S1, S0]) {
    const last = season === S0 ? upToGameweek : GAMEWEEKS_PER_SEASON;
    for (let gw = 1; gw <= last; gw += 1) {
      const improved = season === S0 && gw >= SWITCH_AT;
      rows.push(voted(IMPROVER, season, gw, improved ? NEW_LEVEL : OLD_LEVEL));
    }
  }
  return rows;
}

describe("motore sfidante — il segnale vero si coglie prima", () => {
  const who = requests([IMPROVER]);
  const forecasts = (cut: number): { base: number; challenger: number } => {
    const history = sealed(signalHistory(cut));
    const base = buildBaseForecasts({ history, players: who, asOf: ASOF })[0];
    const challenger = buildChallengerForecasts({ history, players: who, asOf: ASOF })[0];
    return {
      base: meanVote((base as { forecast: unknown }).forecast as never),
      challenger: meanVote((challenger as ChallengerForecast).forecast),
    };
  };

  it("PRIMA del salto lo sfidante è INDIETRO: nessun vantaggio regalato dallo shrink", () => {
    // LA CONTROPROVA, E VIENE PRIMA DELLA PROVA. Se lo sfidante fosse
    // semplicemente «più alto» per costruzione — perché più shrinkato verso una
    // media di ruolo che qui sta sopra il livello del giocatore — sembrerebbe
    // più vicino a 9,5 anche quando il salto non è ancora successo, e la prova
    // successiva non proverebbe niente. Qui parte da dietro.
    const { base, challenger } = forecasts(SWITCH_AT - 1);
    expect(challenger).toBeLessThan(base);
  });

  it("un giocatore che migliora davvero: due giornate dopo il salto lo sfidante ha già sorpassato", () => {
    // DUE giornate, non venti: il punto è «prima», non «prima o poi». Il base
    // ha tre giornate nuove dentro centoquattro vecchie, tutte con lo stesso
    // peso dentro la stagione: non si muove quasi.
    const { base, challenger } = forecasts(SWITCH_AT + 2);
    expect(challenger).toBeGreaterThan(base);
  });

  it("e il vantaggio cresce a ogni giornata: la distanza dal vero si chiude", () => {
    let previous = -Infinity;
    for (const cut of [SWITCH_AT + 2, SWITCH_AT + 4, SWITCH_AT + 6, SWITCH_AT + 8]) {
      const { base, challenger } = forecasts(cut);
      const gapBase = NEW_LEVEL - base;
      const gapChallenger = NEW_LEVEL - challenger;
      expect(gapChallenger).toBeLessThan(gapBase);
      // La quota di distanza chiusa rispetto al base, giornata dopo giornata.
      const closed = 1 - gapChallenger / gapBase;
      expect(closed).toBeGreaterThan(previous);
      previous = closed;
    }
    // QUANTO, IN CHIARO E SENZA ABBELLIRLO: quattro giornate dopo il salto lo
    // sfidante ha chiuso circa un ottavo della distanza che il base non chiude.
    // È poco, ed è la conseguenza dichiarata della scelta (d) del modulo — lo
    // shrink misurato sul peso residuo, che è la lettura prudente. Un motore
    // che qui recuperasse metà della distanza starebbe credendo a cinque
    // domeniche, e su una stagione vera cinque domeniche fortunate esistono.
    const { base, challenger } = forecasts(SWITCH_AT + 4);
    expect(1 - (NEW_LEVEL - challenger) / (NEW_LEVEL - base)).toBeGreaterThan(0.1);
  });
});

// ─── I DUE ESTREMI DEL PARAMETRO DI DIMENTICANZA ──────────────────────────

describe("motore sfidante — i due estremi della memoria degenerano, e in due modi diversi", () => {
  /** La stessa storia con le etichette temporali PERMUTATE dentro la stagione. */
  function timeShuffled(rows: readonly PlayerAppearance[]): PlayerAppearance[] {
    const rnd = mulberry32(777);
    const inSeason = rows.filter((r) => r.season === S0);
    const others = rows.filter((r) => r.season !== S0);
    const gameweeks = [...new Set(inSeason.map((r) => r.gameweek))].sort((a, b) => a - b);
    const permuted = [...gameweeks];
    for (let i = permuted.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = permuted[i] as number;
      permuted[i] = permuted[j] as number;
      permuted[j] = tmp;
    }
    const map = new Map<number, number>();
    gameweeks.forEach((gw, i) => map.set(gw, permuted[i] as number));
    return [...others, ...inSeason.map((r) => ({ ...r, gameweek: map.get(r.gameweek) as number }))];
  }

  const HISTORY = signalHistory(GAMEWEEKS_PER_SEASON);
  const WHO = requests([IMPROVER, ...NOISE_PLAYERS]);

  it("ESTREMO LENTO — memoria infinita: QUANDO è successo smette di contare, e resta un motore cieco al tempo", () => {
    // `Infinity` è l'estremo scritto ESATTO: `0,5^(k/∞)` vale 1 per ogni
    // giornata. Con un numero grande ma finito i pesi differirebbero nelle
    // ultime cifre e «bit a bit» sarebbe falso per un motivo che non c'entra
    // niente con la memoria.
    const huge = {
      playerHalfLifeGameweeks: Number.POSITIVE_INFINITY,
      opponentHalfLifeGameweeks: Number.POSITIVE_INFINITY,
    };
    const straight = buildChallengerForecasts({ history: sealed(HISTORY), players: WHO, asOf: ASOF, tuning: huge });
    const shuffled = buildChallengerForecasts({
      history: sealed(timeShuffled(HISTORY)),
      players: WHO,
      asOf: ASOF,
      tuning: huge,
    });
    // Bit a bit: permutare le date non sposta un solo numero, perché con mezza
    // vita infinita tutte le giornate pesano uguale. È la definizione operativa
    // di «questo motore non guarda la forma recente».
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(straight));

    // E con la memoria vera, invece, si sposta: se anche questa fosse uguale,
    // il parametro non starebbe facendo niente.
    const real = buildChallengerForecasts({ history: sealed(HISTORY), players: WHO, asOf: ASOF });
    const realShuffled = buildChallengerForecasts({
      history: sealed(timeShuffled(HISTORY)),
      players: WHO,
      asOf: ASOF,
    });
    expect(JSON.stringify(realShuffled)).not.toBe(JSON.stringify(real));
  });

  it("ESTREMO VELOCE — memoria di una giornata: non impara più in fretta, DIMENTICA e torna al ruolo", () => {
    const tiny = { playerHalfLifeGameweeks: 0.05, opponentHalfLifeGameweeks: 0.05 };
    const out = buildChallengerForecasts({ history: sealed(HISTORY), players: WHO, asOf: ASOF, tuning: tiny })[0];
    const evidence = (out as ChallengerForecast).evidence;

    // 1) Il peso residuo è circa UNA osservazione: tutto il resto è stato
    //    dimenticato. Con lo shrink a 10, il ruolo si prende più del 90 %.
    expect(evidence.performanceWeight).toBeLessThan(1.5);
    expect(evidence.priorSharePerformance).toBeGreaterThan(0.9);

    // 2) E si vede da che cosa la stima ASCOLTA: cambiare un voto vecchio non
    //    la sposta di un millesimo di millesimo, cambiare l'ultimo la sposta di
    //    un quarto di punto. Non è «impara in fretta»: è «non sa più niente
    //    tranne domenica scorsa».
    //
    //    PERCHÉ NON «BIT A BIT» ANCHE QUI. Con mezza vita 0,05 il peso di una
    //    giornata di trentacinque fa è circa 1e−211: un numero ridicolo, ma
    //    diverso da zero, e il contratto della distribuzione porta ogni massa
    //    positiva sulla griglia. Pretendere l'uguaglianza esatta dei bit
    //    misurerebbe la virgola mobile, non la memoria: si misura lo
    //    spostamento, con la soglia scritta.
    const straight = meanVote(
      (buildChallengerForecasts({ history: sealed(HISTORY), players: WHO, asOf: ASOF, tuning: tiny })[0] as ChallengerForecast).forecast,
    );
    const oldChanged = HISTORY.map((r) =>
      r.playerId === IMPROVER && r.season === S0 && r.gameweek === 3 ? { ...r, baseVote: 4 } : r,
    );
    const lastChanged = HISTORY.map((r) =>
      r.playerId === IMPROVER && r.season === S0 && r.gameweek === GAMEWEEKS_PER_SEASON
        ? { ...r, baseVote: 4 }
        : r,
    );
    const after = (rows: readonly PlayerAppearance[]): number =>
      meanVote(
        (buildChallengerForecasts({ history: sealed(rows), players: WHO, asOf: ASOF, tuning: tiny })[0] as ChallengerForecast).forecast,
      );
    expect(Math.abs(after(oldChanged) - straight)).toBeLessThan(1e-9);
    expect(Math.abs(after(lastChanged) - straight)).toBeGreaterThan(0.15);
  });

  it("in mezzo non c'è nessuna soglia, ma c'è una CRESTA: dimenticare aiuta fino a un punto, poi torna indietro", () => {
    // LA FORMA DEL PARAMETRO, MISURATA E NON RACCONTATA. Su un segnale vero, la
    // stima sale mentre la memoria si accorcia — fin qui è quello che ci si
    // aspetta. Poi si gira: sotto una certa memoria il peso residuo diventa
    // così piccolo che lo shrink riporta tutto verso il ruolo, e il motore
    // torna indietro proprio mentre «impara più in fretta».
    //
    // È LA RAGIONE PER CUI LA MEZZA VITA DI DEFAULT È 8 E NON 6 — E QUESTA PROVA
    // È ANCHE IL POSTO DA CUI IL NUMERO 8 È USCITO. Detto senza abbellirlo:
    // l'8 NON viene da un principio indipendente, viene da QUI. La cresta è
    // stata misurata su questa fixture, cade attorno a 6, e l'8 è stato fissato
    // DOPO averlo visto, un passo prima della cresta. È taratura sui dati di
    // prova: legittima — la fixture è inventata e il passo è verso la
    // PRUDENZA, non verso la vittoria dello sfidante — ma è taratura, e va
    // dichiarata invece che raccontata come un principio. Scegliere la cresta
    // esatta sarebbe stato peggio: sarebbe scegliere il massimo di UNA storia
    // inventata, che è il modo in cui un parametro si sceglie sul rumore. Il
    // numero giusto su dati veri non lo sa nessuno, e si contesta con un record
    // datato.
    const who = requests([IMPROVER]);
    const history = sealed(signalHistory(GAMEWEEKS_PER_SEASON));
    const at = (h: number): number =>
      meanVote(
        (
          buildChallengerForecasts({
            history,
            players: who,
            asOf: ASOF,
            tuning: { playerHalfLifeGameweeks: h, opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS },
          })[0] as ChallengerForecast
        ).forecast,
      );

    const rising = [128, 64, 32, 16, 12, 10, 8].map(at);
    for (let i = 1; i < rising.length; i += 1) {
      expect(rising[i] as number).toBeGreaterThan(rising[i - 1] as number);
    }
    const falling = [6, 4, 2, 1].map(at);
    for (let i = 1; i < falling.length; i += 1) {
      expect(falling[i] as number).toBeLessThan(falling[i - 1] as number);
    }
    // E il default sta sul lato prudente della cresta: sotto il massimo.
    expect(at(DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS)).toBeLessThan(falling[0] as number);
  });
});

// ─── LO SPEGNIMENTO DELLE FAMIGLIE ────────────────────────────────────────

describe("motore sfidante — ogni famiglia si può spegnere, e spenta non resta niente", () => {
  it("con `recentForm` spenta lo sfidante È il base, numero per numero", () => {
    // §6.3 vieta di dare per buona una famiglia. La prova più severa che una
    // famiglia sia davvero l'UNICA differenza è questa: spegnendola, i due
    // motori producono la stessa identica previsione — stessa riga modale,
    // stessa distribuzione, stessi eventi. Ciò che resta diverso è solo la
    // targa, che DEVE restare diversa: il numero è lo stesso, chi l'ha fatto no.
    const history = sealed(signalHistory(GAMEWEEKS_PER_SEASON), []);
    const who = requests([IMPROVER, ...NOISE_PLAYERS]);
    const base = buildBaseForecasts({ history, players: who, asOf: ASOF });
    const off = buildChallengerForecasts({
      history,
      players: who,
      asOf: ASOF,
      families: { recentForm: false, opponentHabits: false },
    });

    off.forEach((row, i) => {
      const reference = base[i] as { forecast: { distribution?: { sourceQuality: string } } };
      const strip = (f: unknown): string =>
        JSON.stringify(f, (key, value) => (key === "sourceQuality" ? undefined : value));
      expect(strip(row.forecast)).toBe(strip(reference.forecast));
      expect(row.forecast.distribution?.sourceQuality).not.toBe(reference.forecast.distribution?.sourceQuality);
      expect(row.evidence.familiesOn).toEqual([]);
    });
  });

  it("la targa dice sempre PREVISIONE, e dice anche con quale memoria", () => {
    const out = buildChallengerForecasts({
      history: sealed(signalHistory(GAMEWEEKS_PER_SEASON)),
      players: requests([IMPROVER]),
      asOf: ASOF,
      tuning: { playerHalfLifeGameweeks: 12, opponentHalfLifeGameweeks: 50 },
    })[0] as ChallengerForecast;
    const quality = out.forecast.distribution?.sourceQuality ?? "";
    expect(quality).toContain(CHALLENGER_FORECAST_MARK);
    expect(quality).toContain("NON è un'osservazione");
    expect(quality).toContain("mezza vita rendimento 12 giornate");
    expect(quality).toContain(PROVENANCE);
  });
});

// ─── DETERMINISMO, E CHI HA GIOCATO POCO ──────────────────────────────────

describe("motore sfidante — determinismo e prudenza", () => {
  it("bit a bit: l'ordine delle righe in ingresso non sposta un solo numero", () => {
    const rows = signalHistory(GAMEWEEKS_PER_SEASON);
    const rnd = mulberry32(31337);
    const shuffled = [...rows];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuffled[i] as PlayerAppearance;
      shuffled[i] = shuffled[j] as PlayerAppearance;
      shuffled[j] = tmp;
    }
    const who = requests([IMPROVER, ...NOISE_PLAYERS]);
    const straight = buildChallengerForecasts({ history: sealed(rows), players: who, asOf: ASOF });
    const mixed = buildChallengerForecasts({ history: sealed(shuffled), players: who, asOf: ASOF });
    expect(JSON.stringify(mixed)).toBe(JSON.stringify(straight));
    // E due esecuzioni identiche restano identiche: nessun orologio, nessun
    // `Math.random`, nessuna iterazione che dipenda dall'ordine di una mappa.
    expect(JSON.stringify(buildChallengerForecasts({ history: sealed(rows), players: who, asOf: ASOF }))).toBe(
      straight === undefined ? "" : JSON.stringify(straight),
    );
  });

  it("un giocatore con due presenze non viene creduto sulla parola", () => {
    // DUE GIORNATE, ENTRAMBE FRESCHISSIME, ENTRAMBE A 8. È il caso in cui un
    // motore «che impara» fa più danni: la forma recente è tutta ciò che vede,
    // e la forma recente sono due partite fortunate. Lo shrink verso il ruolo
    // deve prendersi la parte del leone, e con una memoria corta se ne prende
    // ANCORA DI PIÙ del base, perché il peso disponibile è minore.
    const rows = [...noiseHistory(GAMEWEEKS_PER_SEASON)];
    rows.push(voted("DUE", S0, GAMEWEEKS_PER_SEASON, 8));
    rows.push(voted("DUE", S0, GAMEWEEKS_PER_SEASON - 1, 8));
    const history = sealed(rows);
    const who = requests(["DUE"]);
    const challenger = buildChallengerForecasts({ history, players: who, asOf: ASOF })[0] as ChallengerForecast;
    const base = buildBaseForecasts({ history, players: who, asOf: ASOF })[0] as { evidence: { priorSharePerformance: number } };

    expect(challenger.evidence.votedInHistory).toBe(2);
    expect(challenger.evidence.priorSharePerformance).toBeGreaterThan(0.8);
    // Più prudente del base, non meno: dimenticare in fretta significa avere
    // meno prove, e avere meno prove significa fidarsi di più del ruolo.
    expect(challenger.evidence.priorSharePerformance).toBeGreaterThan(base.evidence.priorSharePerformance);
    // E il numero che ne esce sta molto più vicino al ruolo (~6,25) che all'8
    // delle due domeniche.
    expect(meanVote(challenger.forecast)).toBeLessThan(6.6);
  });

  it("zero presenze: la previsione È quella del ruolo, e l'ultima notizia è dichiarata assente", () => {
    const history = sealed(noiseHistory(GAMEWEEKS_PER_SEASON));
    const out = buildChallengerForecasts({ history, players: requests(["MAI_VISTO"]), asOf: ASOF })[0] as ChallengerForecast;
    expect(out.evidence.gameweeksInHistory).toBe(0);
    expect(out.evidence.newestGameweeksAgo).toBe(-1);
    expect(out.evidence.priorSharePerformance).toBe(1);
  });
});

// ─── LE ABITUDINI DELL'AVVERSARIO: L'ALTRA VELOCITÀ ───────────────────────

const MODULES = ["343", "352", "442", "433", "451"];
const MANAGERS = ["ALLEN_1", "ALLEN_2", "ALLEN_3", "ALLEN_4", "ALLEN_5", "ALLEN_6", "ALLEN_7", "ALLEN_8"];

/** Una stagione di lega: otto fantallenatori, una giornata a settimana. */
function opponentRows(gameweeks: number): OpponentGameweek[] {
  const rnd = mulberry32(9001);
  const rows: OpponentGameweek[] = [];
  for (let gw = 1; gw <= gameweeks; gw += 1) {
    for (const managerId of MANAGERS) {
      // `ALLEN_1` è un monomodulista dichiarato: gioca sempre 343. Gli altri
      // pescano a caso, e servono a formare il riferimento di lega.
      const module =
        managerId === "ALLEN_1" ? "343" : (MODULES[Math.floor(rnd() * MODULES.length)] as string);
      rows.push({ managerId, season: S0, gameweek: gw, module, competition: "LEAGUE" });
    }
  }
  return rows;
}

function corpus(gameweeks: number): ObservedChallengerHistory {
  return observedChallengerHistory({
    history: sealed(noiseHistory(GAMEWEEKS_PER_SEASON)),
    opponentGameweeks: opponentRows(gameweeks),
  });
}

describe("motore sfidante — le abitudini dell'avversario vanno LENTE, perché i dati sono pochi", () => {
  it("le due velocità sono dichiarate diverse, e quella povera è la più lenta", () => {
    expect(DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS).toBeGreaterThan(DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS * 5);
  });

  it("a zero osservazioni la stima È il riferimento: uniforme sui moduli legali", () => {
    const habits = challengerOpponentHabits({
      corpus: corpus(0),
      managerId: "ALLEN_1",
      competition: "LEAGUE",
      legalModules: MODULES,
    });
    for (const row of habits.moduleWeights) expect(row.weight).toBeCloseTo(1 / MODULES.length, 12);
    expect(habits.evidence.ownShare).toBe(0);
  });

  it("con la velocità del RENDIMENTO le abitudini si dissolverebbero: la lenta le tiene", () => {
    // LA RAGIONE DELLE DUE VELOCITÀ, IN DUE NUMERI. Trenta giornate osservate:
    // con la mezza vita lenta restano ~28 giornate equivalenti di peso e
    // l'avversario decide sette ottavi della sua stima; con la mezza vita del
    // rendimento ne restano ~11, e con quella di due giornate ne resterebbero
    // meno di tre — cioè un'«abitudine» stimata su due domeniche e mezzo.
    const shared = { corpus: corpus(30), managerId: "ALLEN_1", competition: "LEAGUE" as const, legalModules: MODULES };
    const slow = challengerOpponentHabits(shared);
    const asFastAsPlayers = challengerOpponentHabits({
      ...shared,
      tuning: { playerHalfLifeGameweeks: DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS, opponentHalfLifeGameweeks: DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS },
    });
    const absurd = challengerOpponentHabits({
      ...shared,
      tuning: { playerHalfLifeGameweeks: 2, opponentHalfLifeGameweeks: 2 },
    });

    expect(slow.evidence.decayedWeight).toBeGreaterThan(25);
    expect(asFastAsPlayers.evidence.decayedWeight).toBeLessThan(13);
    expect(absurd.evidence.decayedWeight).toBeLessThan(4);
    // E la conseguenza che conta: quanto di quella stima è l'avversario.
    expect(slow.evidence.ownShare).toBeGreaterThan(0.85);
    expect(absurd.evidence.ownShare).toBeLessThan(0.5);
  });

  it("lo shrink a due livelli di §8.4: si esce dal riferimento solo guadagnandoselo", () => {
    const few = challengerOpponentHabits({
      corpus: corpus(3),
      managerId: "ALLEN_1",
      competition: "LEAGUE",
      legalModules: MODULES,
    });
    const many = challengerOpponentHabits({
      corpus: corpus(30),
      managerId: "ALLEN_1",
      competition: "LEAGUE",
      legalModules: MODULES,
    });
    const weightOf = (h: { moduleWeights: readonly { module: string; weight: number }[] }, m: string): number =>
      h.moduleWeights.find((row) => row.module === m)?.weight as number;

    // Tre giornate: `ALLEN_1` ha giocato 343 tre volte su tre, ma con `k = 4`
    // giornate equivalenti di riferimento non gli si crede più di così.
    expect(weightOf(few, "343")).toBeLessThan(0.65);
    expect(weightOf(few, "343")).toBeGreaterThan(1 / MODULES.length);
    // Trenta giornate: adesso se l'è guadagnato.
    expect(weightOf(many, "343")).toBeGreaterThan(0.85);
    expect(few.evidence.ownShare).toBeCloseTo(3 / (3 + OPPONENT_PRIOR_GAMEWEEKS), 1);
  });

  it("famiglia spenta: restano la lega e l'uniforme, e l'avversario non sposta niente", () => {
    const shared = { corpus: corpus(30), managerId: "ALLEN_1", competition: "LEAGUE" as const, legalModules: MODULES };
    const off = challengerOpponentHabits({ ...shared, families: { recentForm: true, opponentHabits: false } });
    expect(off.evidence.ownShare).toBe(0);
    expect(off.evidence.observedGameweeks).toBe(0);
    // Nessun modulo può staccarsi: senza i conteggi dell'avversario resta il
    // riferimento di lega, che su otto fantallenatori è quasi uniforme.
    for (const row of off.moduleWeights) expect(row.weight).toBeLessThan(0.45);
    expect(off.sourceQuality).toContain(CHALLENGER_FORECAST_MARK);
  });

  it("campionato e coppa non si mescolano (§8.3), e le righe doppie si fermano", () => {
    const league = opponentRows(10);
    const cup = league.map((row) => ({ ...row, module: "451", competition: "CUP" as const }));
    const both = observedChallengerHistory({
      history: sealed(noiseHistory(GAMEWEEKS_PER_SEASON)),
      opponentGameweeks: [...league, ...cup],
    });
    const inLeague = challengerOpponentHabits({
      corpus: both,
      managerId: "ALLEN_1",
      competition: "LEAGUE",
      legalModules: MODULES,
    });
    const inCup = challengerOpponentHabits({
      corpus: both,
      managerId: "ALLEN_1",
      competition: "CUP",
      legalModules: MODULES,
    });
    const w = (h: { moduleWeights: readonly { module: string; weight: number }[] }, m: string): number =>
      h.moduleWeights.find((row) => row.module === m)?.weight as number;
    expect(w(inLeague, "343")).toBeGreaterThan(w(inLeague, "451"));
    expect(w(inCup, "451")).toBeGreaterThan(w(inCup, "343"));

    expect(() =>
      observedChallengerHistory({
        history: sealed(noiseHistory(GAMEWEEKS_PER_SEASON)),
        opponentGameweeks: [...league, league[0] as OpponentGameweek],
      }),
    ).toThrow(/due righe per la giornata/);
  });

  it("bit a bit anche qui: l'ordine delle righe avversarie non sposta un peso", () => {
    const rows = opponentRows(30);
    const rnd = mulberry32(4242);
    const shuffled = [...rows];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuffled[i] as OpponentGameweek;
      shuffled[i] = shuffled[j] as OpponentGameweek;
      shuffled[j] = tmp;
    }
    const make = (list: readonly OpponentGameweek[]): string =>
      JSON.stringify(
        challengerOpponentHabits({
          corpus: observedChallengerHistory({
            history: sealed(noiseHistory(GAMEWEEKS_PER_SEASON)),
            opponentGameweeks: list,
          }),
          managerId: "ALLEN_3",
          competition: "LEAGUE",
          legalModules: MODULES,
        }),
      );
    expect(make(shuffled)).toBe(make(rows));
  });

  it("i moduli non legali con la rosa di oggi valgono zero, e la massa si rinormalizza", () => {
    const habits = challengerOpponentHabits({
      corpus: corpus(30),
      managerId: "ALLEN_1",
      competition: "LEAGUE",
      legalModules: ["343", "442"],
    });
    expect(habits.moduleWeights).toHaveLength(2);
    let total = 0;
    for (const row of habits.moduleWeights) total += row.weight;
    expect(total).toBeCloseTo(1, 12);
    expect(() =>
      challengerOpponentHabits({
        corpus: corpus(30),
        managerId: "ALLEN_1",
        competition: "LEAGUE",
        legalModules: [],
      }),
    ).toThrow(/nessun modulo legale dichiarato/);
    expect(LEAGUE_PRIOR_GAMEWEEKS).toBeGreaterThan(OPPONENT_PRIOR_GAMEWEEKS);
  });
});

// ─── LA PREVISIONE NON È UN'OSSERVAZIONE ──────────────────────────────────

describe("motore sfidante — il verso che conta: niente rientra come storico, niente esce come voto vero", () => {
  it("le righe della previsione non entrano nel tetto: `tsc --noEmit` le rifiuta", () => {
    // COME SI LEGGE QUESTO TEST. Le direttive qui sotto sono asserzioni del
    // COMPILATORE, non di vitest: se una di quelle costruzioni tornasse a
    // compilare, `tsc` segnalerebbe una direttiva inutilizzata e
    // `npm run typecheck` — il PRIMO comando di `npm run verify` — sarebbe
    // rosso prima che vitest parta. Il corpo del test esiste per tenerle dentro
    // un file che si esegue davvero, e per dire che gli oggetti rifiutati non
    // sono inventati: sono quelli che questo motore produce ogni giornata.
    const out = buildChallengerForecasts({
      history: sealed(signalHistory(GAMEWEEKS_PER_SEASON)),
      players: requests([IMPROVER]),
      asOf: ASOF,
    })[0] as ChallengerForecast;
    const line = {
      id: out.forecast.id,
      role: out.forecast.role,
      baseVote: out.forecast.expected.baseVote,
      fantasyScore: out.forecast.expected.fantasyScore,
      receivedAnyBonus: out.forecast.expected.receivedAnyBonus,
      missedPenalty: out.forecast.expected.missedPenalty,
    };

    // 1) La riga dello sfidante non è un voto osservato.
    // @ts-expect-error — riga di PREVISIONE dove si aspettano voti osservati.
    const asObserved: ObservedPlayerLine = line;

    // 2) E nemmeno in blocco, dalla porta d'ingresso del tetto ex-post: un
    //    tetto costruito sulle previsioni dello sfidante sarebbe più basso del
    //    vero, abbasserebbe il suo stesso rimpianto e lo promuoverebbe.
    // @ts-expect-error — il campo non accetta righe di previsione.
    const asCeiling: ExPostCeilingInput["squadLines"] = [line];

    // 3) Il sigillo non si falsifica a mano, e non ce n'è uno nuovo da
    //    falsificare: il corpo dello sfidante CONTIENE un `ObservedHistory`, la
    //    cui chiave è un simbolo che questo file non può nominare. La porta
    //    resta `observedHistory()` seguita da `observedChallengerHistory()`.
    const forged: ObservedChallengerHistory = {
      // @ts-expect-error — manca il sigillo EREDITATO, e nessun letterale può nominarlo.
      history: {
        seasons: SEASONS,
        appearances: [],
        teamGameweeks: [],
        origin: "OBSERVED",
        provenance: "targa scritta a mano su uno storico qualunque",
      },
      opponentGameweeks: [],
    };

    expect(asObserved.id).toBe(IMPROVER);
    expect(asCeiling).toHaveLength(1);
    expect(forged.opponentGameweeks).toHaveLength(0);
  });

  it("un cast attraversa il tipo ma non la guardia: senza targa il motore si ferma", () => {
    // IL VARCO CHE IL SIGILLO NON CHIUDE, dichiarato in testa al modulo come lo
    // dichiarano `baseForecast.ts` e `referencePolicies.ts`: il tipo nominale
    // ferma l'ASSEGNAZIONE, non chi scrive `as`. Qui il cast si scrive apposta,
    // ed è la guardia a runtime a doverlo fermare.
    const forged = {
      seasons: SEASONS,
      appearances: [],
      teamGameweeks: [],
      origin: "OBSERVED",
    } as unknown as ObservedHistory;

    expect(() => buildChallengerForecasts({ history: forged, players: requests(["X"]), asOf: ASOF })).toThrow(
      /non è passato da `observedHistory\(\)`/,
    );
    expect(() => observedChallengerHistory({ history: forged, opponentGameweeks: [] })).toThrow(
      /non è passato da `observedHistory\(\)`/,
    );
  });

  it("il motore non contiene il proprio giudizio, e il file lo dimostra", () => {
    // LA DIFESA STRUTTURALE CONTRO IL DIFETTO PEGGIORE POSSIBILE: un motore che
    // si dà la sufficienza da solo. Il criterio di ingresso di §2.4 —
    // finestra di sei giornate, punti di lega, rimpianto — è PRE-REGISTRATO e
    // vive altrove. Questa prova legge il sorgente e pretende che il modulo non
    // importi NIENTE dalle metriche del confronto, e che di `referencePolicies`
    // prenda soltanto due TIPI, quelli che gli servono per farsi rifiutare.
    const source = readFileSync(new URL("../src/challengerForecast.ts", import.meta.url), "utf8");
    expect(source).not.toContain("policyMetrics");
    expect(source).toContain('import type { ExPostCeilingInput, ObservedPlayerLine } from "./referencePolicies.js";');
    // Nessun import di valori da `referencePolicies`: solo la riga di tipi.
    const runtimeImports = source.match(/^import \{[^}]*\} from "\.\/referencePolicies\.js";/gm);
    expect(runtimeImports).toBeNull();
    // E nessuna funzione che confronti i due motori: le parole del giudizio
    // compaiono solo nei commenti che spiegano perché il giudizio NON è qui.
    expect(source).not.toContain("policyRegret");
    expect(source).not.toContain("realisedLeaguePoints");
    expect(source).not.toContain("bestElevenExPost");
  });
});
