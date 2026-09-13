// IL PRODUTTORE DELLA DISTRIBUZIONE DELLE FORMAZIONI AVVERSARIE — §8.4, WP-6.
//
// PERCHÉ ESISTE, E CHE COSA MANCAVA DAVVERO. `leagueBehaviourProfile.ts`
// (§8.3) misura conteggi comportamentali aggregati per squadra — quante volte
// un modulo, quante volte l'undici ripetuto, e così via — con lo shrink a due
// livelli di §8.4 punto 4 già dentro la stima `moduleFielded`.
// `opponentDistribution.ts` (WP-1) consuma già un insieme PESATO di
// formazioni (`WeightedOpponentLineup[]`) dentro `lineupProposer.ts`. FRA I
// DUE NON C'ERA NIENTE: §8.3 sa "quale modulo usa questa squadra in media",
// non "quali undici nomi ci mette dentro stasera". Questo file è il calcolo
// che manca: dai conteggi di §8.3 più la previsione della rosa avversaria
// (§6, la stessa catena nostra) a `WeightedOpponentLineup[]`.
//
// UNA DISTRIBUZIONE INVENTATA È PEGGIO DEL FALLIMENTO DI ADESSO. Ogni peso
// qui dentro si spiega a partire da un conteggio osservato o da una previsione
// dichiarata altrove — mai da una sensazione. Dove l'informazione per un pezzo
// di §8.4 non esiste, quel pezzo NON SI INVENTA: si omette e lo si dichiara
// (vedi "CHE COSA QUESTO FILE NON FA" più sotto), e il resto si consegna
// onestamente per quello che è.
//
// ── I QUATTRO PEZZI DI §8.4 CHE QUESTO FILE COMPONE ─────────────────────────
//
// 1-2) ROSA E MODULI LEGALI (§8.4 punti 1-2). La previsione della rosa
//    avversaria arriva già pronta (`PlayerForecast[]`, la stessa catena
//    nostra di §6 — questo file non prevede nulla). Un modulo è legale OGGI
//    se, fra i giocatori con `voteProbability > 0` (dichiarazione 1 di
//    `lineupProposer.ts`: chi ha p = 0 è senza voto in ogni scenario), la
//    rosa regge la sua forma. La legalità NON si ricalcola con una formula
//    propria: la decide `bestLineupExPost` restituendo `feasible`, perché è
//    già la stessa domanda che quella funzione risolve per noi.
//
// 3) L'UNDICI "RAZIONALE" (§8.4 punto 3). Per ogni modulo legale, l'undici
//    che `bestLineupExPost` sceglierebbe per l'avversario con l'obiettivo di
//    §3 CONTRO LA NOSTRA FORMAZIONE DI RIFERIMENTO. Riusare
//    `bestLineupExPost` — invece di riscrivere "chi schiererei io al posto
//    loro" — è la stessa disciplina "NESSUNA FORMULA PARALLELA" di
//    `lineupProposer.ts`: un secondo ottimizzatore, anche solo per un
//    modulo alla volta, è il modo in cui due numeri divergono in silenzio.
//
//    L'APPROSSIMAZIONE "UN SOLO GIRO" È DICHIARATA E NON SI RISOLVE QUI: la
//    nostra formazione di riferimento (`ourReferenceLineup` più
//    `ourReferencePlayers`) è un INPUT, non un calcolo di questo file. Di
//    solito è il livello 1 (punto atteso) del nostro produttore contro la
//    modale avversaria già nota — un vero equilibrio richiederebbe iterare
//    la risposta reciproca all'infinito, che è esattamente ciò che §8.4
//    dichiara di NON fare.
//
// 4) I PESI DEI MODULI (§8.4 punto 4). `w_t,m` è ESATTAMENTE la stima
//    `moduleFielded.share` di `leagueBehaviourProfile.ts`: stesso `k = 4`,
//    stesso `k' = 8`, stessa formula a due livelli, dichiarata e provata là.
//    Questo file non la ricalcola: la LEGGE e la RISTRINGE ai moduli legali
//    con la rosa del momento, rinormalizzando sul sottoinsieme legale — è la
//    parte di §8.4 punto 4 che `leagueBehaviourProfile.ts` esplicitamente
//    NON fa (le sue categorie sono "tutti i moduli", dichiarato nel
//    commento f-bis di `challengerForecast.ts`).
//
// 5) LA FORMAZIONE DELLA GIORNATA PRECEDENTE (§8.4 punto 5). Se il chiamante
//    la fornisce (`previousLineup`, l'undici REALMENTE osservato, non una
//    bozza), entra come candidata in più con peso pari alla quota "ripete
//    la formazione" del profilo (`elevenIdenticalToPrevious.share[0]`), con
//    il floor del 10% nelle prime 6 giornate imposto testualmente da §8.4.
//    Il resto del peso (`1 - quota`) si distribuisce fra i moduli secondo il
//    punto 4. Senza formazione precedente questo pezzo semplicemente non
//    esiste: non si inventa un "undici precedente" che nessuno ha osservato.
//
// ── CHE COSA QUESTO FILE NON FA, E PERCHÉ NON LO INVENTA ────────────────────
//
// LE VARIANTI-BALLOTTAGGIO DI §8.4 PUNTO 6 NON SONO IMPLEMENTATE. Il disegno
// le descrive testualmente ("per i primi 3 moduli in peso, l'undici con i 2
// ballottaggi più incerti risolti nell'altro modo, peso proporzionale alle
// probabilità") ma non fissa NESSUNO dei tre numeri che servirebbero per
// scriverle senza indovinare:
//   - CHE COSA CONTA COME "BALLOTTAGGIO" fra due giocatori dello stesso ruolo
//     — un margine su `voteProbability`? Su `expected.fantasyScore`? Sotto
//     quale soglia due candidati sono "incerti" invece che uno chiaramente
//     migliore dell'altro?
//   - QUALE "ALTRO MODO" si risolve — la previsione porta un `voteProbability`
//     per titolarità, non due esiti alternativi dichiarati con le loro
//     probabilità congiunte;
//   - CHE COS'È "la probabilità" del punto 6 quando i due giocatori del
//     ballottaggio non sono complementari (due riserve diverse, non un
//     testa a testa a somma 1).
// Scrivere comunque una regola qui significherebbe fissare io stesso questi
// tre numeri e chiamarli "il peso di §8.4": è esattamente la distribuzione
// verosimile-ma-non-giustificata che il criterio del task vieta. La
// distribuzione che questo file produce senza le varianti è quindi PIÙ POVERA
// di §8.4 punto 6 MA ONESTA: ogni peso che porta si spiega con un conteggio
// osservato o una previsione dichiarata, mai con una soglia inventata su due
// prove diverse. Il pezzo mancante si riferisce, non si finge chiuso.
//
// QUESTO FILE NON PREVEDE NULLA E NON LEGGE NESSUNA FONTE: riceve
// `PlayerForecast[]` (rosa avversaria) e `TeamBehaviourProfile` (§8.3) da chi
// li produce, esattamente come `lineupProposer.ts` riceve `OpponentForecast`.

import {
  type GameweekContext,
  type Lineup,
  type PlayerLine,
  lineupViolations,
} from "./gameweekSimulator.js";
import { MODULES, type Module } from "./leagueGameweek.js";
import { bestLineupExPost } from "./lineupOptimizer.js";
import {
  type EstimateBasis,
  type TeamBehaviourProfile,
  behaviourEstimate,
} from "./leagueBehaviourProfile.js";
import {
  type PlayerForecast,
  absentLine,
  assertForecasts,
  expectedLine,
  neverPlays,
} from "./lineupProposer.js";
import { type WeightedOpponentLineup, lineupKey, modalOpponentIndex } from "./opponentDistribution.js";

/**
 * Il floor testuale di §8.4 punto 5: "mai sotto il 10 % nelle prime 6
 * giornate". Non è una scelta di questo file: è copiato dal disegno.
 */
export const EARLY_SEASON_REPEAT_FLOOR = 0.1 as const;

/** Quante giornate contano come "prime 6" per il floor di cui sopra. */
export const EARLY_SEASON_WINDOW_GAMEWEEKS = 6 as const;

/** L'errore di questo modulo. Un prefisso solo, come nei moduli vicini. */
function fail(message: string): never {
  throw new Error(`distribuzione delle formazioni avversarie (§8.4): ${message}`);
}

export interface OpponentLineupDistributionInput {
  /** Rosa e previsione dell'avversario per questa giornata (§6, §8.4 punto 1). */
  readonly opponentForecast: readonly PlayerForecast[];
  /** Il profilo §8.3 di QUESTA squadra — da `teamBehaviourProfile()`. */
  readonly opponentBehaviour: TeamBehaviourProfile;
  /**
   * LA NOSTRA FORMAZIONE DI RIFERIMENTO — l'approssimazione "un solo giro" di
   * §8.4 punto 3, dichiarata lì come tale. Fissata da chi chiama, non
   * calcolata qui: di regola è il livello 1 del nostro produttore contro la
   * modale avversaria già nota.
   */
  readonly ourReferenceLineup: Lineup;
  /**
   * Le righe di giornata dei NOSTRI giocatori che compaiono in
   * `ourReferenceLineup` (titolari, portiere, panchina) — bastano quelle: è
   * la stessa mappa che `simulateGameweek` userebbe per il nostro lato.
   */
  readonly ourReferencePlayers: ReadonlyMap<string, PlayerLine>;
  readonly context: GameweekContext;
  /**
   * La formazione REALMENTE schierata dall'avversario alla giornata
   * precedente (§8.4 punto 5), se nota. Assente = quel pezzo della
   * distribuzione non esiste, e non si inventa.
   */
  readonly previousLineup?: Lineup;
}

export interface OpponentLineupDistributionResult {
  /** `false` se NESSUN modulo è schierabile con la rosa di oggi: fail-closed. */
  readonly feasible: boolean;
  readonly reason: string;
  /** Vuoto se `feasible` è `false`. Pesi > 0, ordine dichiarato, somma 1. */
  readonly distribution: readonly WeightedOpponentLineup[];
  /** La formazione a peso maggiore della distribuzione, `null` se non `feasible`. */
  readonly modalLineup: Lineup | null;
  readonly legalModules: readonly Module[];
  readonly illegalModules: readonly Module[];
  /** Peso assegnato a `previousLineup`. `null` se non fornita o non usata. */
  readonly repeatPreviousWeight: number | null;
  /** `true` se il floor del 10% (§8.4 punto 5) ha alzato la quota osservata. */
  readonly repeatPreviousFloored: boolean;
  /** Propagato da `TeamBehaviourProfile.basis`: dice se questa squadra è mai stata osservata. */
  readonly basis: EstimateBasis;
}

/** Converte una previsione in riga di giornata: assente se non ha voto. */
function toPlayerLine(f: PlayerForecast): PlayerLine {
  return neverPlays(f) ? absentLine(f) : expectedLine(f);
}

export function opponentLineupDistribution(
  input: OpponentLineupDistributionInput,
): OpponentLineupDistributionResult {
  assertForecasts(input.opponentForecast, "rosa avversaria (§8.4)");
  if (input.opponentForecast.length === 0) {
    fail("la rosa avversaria è vuota: non esiste una distribuzione senza giocatori.");
  }

  const opponentIds = new Set(input.opponentForecast.map((f) => f.id));
  const ourIds = new Set(input.ourReferencePlayers.keys());
  const shared = [...opponentIds].filter((id) => ourIds.has(id));
  if (shared.length > 0) {
    fail(
      `id condivisi fra la rosa avversaria e i nostri giocatori di riferimento: ${shared.join(", ")}. ` +
        "Un giocatore non gioca contro se stesso.",
    );
  }

  const opponentLines = new Map<string, PlayerLine>(
    input.opponentForecast.map((f) => [f.id, toPlayerLine(f)]),
  );
  const opponentSquad: readonly PlayerLine[] = [...opponentLines.values()];
  const combinedPlayers = new Map<string, PlayerLine>([...input.ourReferencePlayers, ...opponentLines]);

  const ourViolations = lineupViolations(input.ourReferenceLineup, input.ourReferencePlayers);
  if (ourViolations.length > 0) {
    fail(`la formazione di riferimento nostra non è legale: ${ourViolations.join("; ")}`);
  }

  // ── PUNTI 2-3: per ciascuno dei sette moduli, l'undici razionale se il
  // modulo è schierabile con la rosa di oggi. Nessuna formula di legalità
  // propria: la decide `bestLineupExPost`, che è la stessa domanda già
  // risolta per il nostro lato.
  const rationalByModule = new Map<Module, Lineup>();
  for (const module of MODULES) {
    const attempt = bestLineupExPost({
      squad: opponentSquad,
      theirLineup: input.ourReferenceLineup,
      players: combinedPlayers,
      context: input.context,
      onlyModule: module,
    });
    if (attempt.feasible && attempt.lineup !== null) {
      rationalByModule.set(module, attempt.lineup);
    }
  }
  const legalModules = MODULES.filter((m) => rationalByModule.has(m));
  const illegalModules = MODULES.filter((m) => !rationalByModule.has(m));
  if (legalModules.length === 0) {
    return {
      feasible: false,
      reason:
        "nessuno dei sette moduli di §9 è schierabile con la rosa avversaria di oggi (giocatori con " +
        "voteProbability > 0 insufficienti in almeno un ruolo per ciascun modulo). Fail-closed: una " +
        "distribuzione senza nessuna formazione legale non è una distribuzione povera, è nessun avversario.",
      distribution: [],
      modalLineup: null,
      legalModules: [],
      illegalModules: MODULES,
      repeatPreviousWeight: null,
      repeatPreviousFloored: false,
      basis: input.opponentBehaviour.basis,
    };
  }

  // ── PUNTO 4: i pesi dei moduli sono `moduleFielded.share` di §8.3/§8.4,
  // letti e mai ricalcolati, ristretti ai moduli legali e rinormalizzati.
  const moduleEstimate = behaviourEstimate(input.opponentBehaviour, "moduleFielded");
  if (moduleEstimate.share.length !== MODULES.length) {
    fail(
      `la stima dei moduli del profilo (§8.3) ha ${moduleEstimate.share.length} categorie invece di ` +
        `${MODULES.length}: il profilo e questo file non stanno descrivendo gli stessi sette moduli.`,
    );
  }
  const moduleWeight = new Map<Module, number>();
  let totalLegalShare = 0;
  for (const module of legalModules) {
    const idx = MODULES.indexOf(module);
    const share = moduleEstimate.share[idx] as number;
    if (!Number.isFinite(share) || share <= 0) {
      fail(
        `il peso del modulo ${module} nel profilo (§8.3) non è un numero finito e positivo (${String(share)}). ` +
          "Un profilo con conteggi contraddittori o incompleti non produce una distribuzione parziale " +
          "spacciata per completa: qui ci si ferma.",
      );
    }
    moduleWeight.set(module, share);
    totalLegalShare += share;
  }

  // ── PUNTO 5: la formazione della giornata precedente, se fornita. Il peso
  // è la quota "ripete la formazione" osservata, con il floor testuale nelle
  // prime 6 giornate; il resto del peso va ai moduli.
  let repeatWeight: number | null = null;
  let repeatFloored = false;
  if (input.previousLineup !== undefined) {
    const previous = input.previousLineup;
    const previousViolations = lineupViolations(previous, opponentLines);
    if (previousViolations.length > 0) {
      fail(
        `la formazione della giornata precedente dell'avversario non è legale con la rosa dichiarata: ` +
          `${previousViolations.join("; ")}. Una formazione realmente schierata non può essere strutturalmente ` +
          "illegale: o l'id di squadra o la rosa dichiarata sono sbagliati, e indovinare quale sarebbe " +
          "peggio che fermarsi.",
      );
    }
    const strangerBenchIds = previous.benchIds.filter((id) => !opponentLines.has(id));
    if (strangerBenchIds.length > 0) {
      fail(
        `la formazione della giornata precedente ha in panchina giocatori che non sono nella rosa ` +
          `dichiarata di oggi: ${strangerBenchIds.join(", ")}. Rosa e formazione precedente descrivono due ` +
          "squadre diverse, e questo file non decide quale delle due ha ragione.",
      );
    }
    const repeatEstimate = behaviourEstimate(input.opponentBehaviour, "elevenIdenticalToPrevious");
    const observedShare = repeatEstimate.share[0];
    if (typeof observedShare !== "number" || !Number.isFinite(observedShare) || observedShare < 0) {
      fail(
        `la quota "ripete la formazione" del profilo (§8.3) non è un numero valido (${String(observedShare)}).`,
      );
    }
    const withinEarlyWindow = input.context.matchday <= EARLY_SEASON_WINDOW_GAMEWEEKS;
    repeatWeight = withinEarlyWindow ? Math.max(observedShare, EARLY_SEASON_REPEAT_FLOOR) : observedShare;
    repeatFloored = withinEarlyWindow && EARLY_SEASON_REPEAT_FLOOR > observedShare;
  }

  // ── COMPOSIZIONE FINALE. Ordine dichiarato: moduli in ordine di §9, poi la
  // formazione precedente. Due candidate con la STESSA formazione (per
  // esempio: l'undici razionale di un modulo coincide con quello di ieri) si
  // fondono per somma dei pesi invece di comparire due volte con la stessa
  // chiave — `opponentDistribution.ts` non vieta i duplicati, ma trattarli
  // come due formazioni diverse sarebbe falso.
  const order: string[] = [];
  const byKey = new Map<string, { lineup: Lineup; weight: number }>();
  const add = (lineup: Lineup, weight: number): void => {
    const key = lineupKey(lineup);
    const existing = byKey.get(key);
    if (existing !== undefined) {
      byKey.set(key, { lineup: existing.lineup, weight: existing.weight + weight });
    } else {
      byKey.set(key, { lineup, weight });
      order.push(key);
    }
  };

  const modulePool = repeatWeight === null ? 1 : 1 - repeatWeight;
  for (const module of legalModules) {
    const normalised = ((moduleWeight.get(module) as number) / totalLegalShare) * modulePool;
    add(rationalByModule.get(module) as Lineup, normalised);
  }
  if (repeatWeight !== null) {
    add(input.previousLineup as Lineup, repeatWeight);
  }

  const distribution: WeightedOpponentLineup[] = order.map((key) => {
    const entry = byKey.get(key) as { lineup: Lineup; weight: number };
    return { lineup: entry.lineup, weight: entry.weight };
  });
  const weights = distribution.map((d) => d.weight);
  const modal = distribution[modalOpponentIndex(weights)] as WeightedOpponentLineup;

  const reasonParts = [
    `${legalModules.length}/${MODULES.length} moduli legali con la rosa avversaria di oggi`,
    `pesi di modulo da §8.3/§8.4 punto 4 (shrink k=4/k'=8) su ${input.opponentBehaviour.gameweeksObserved} ` +
      `giornate confermate (${input.opponentBehaviour.basis})`,
  ];
  if (repeatWeight !== null) {
    reasonParts.push(
      `più la formazione della giornata precedente, peso ${repeatWeight.toFixed(4)}` +
        (repeatFloored ? " (floor 10% prime 6 giornate, §8.4 punto 5)" : " (quota di ripetizione osservata)"),
    );
  }
  reasonParts.push(
    "varianti-ballottaggio di §8.4 punto 6 NON incluse: il disegno non fissa una regola numerica di " +
      "risoluzione, e inventarne una qui produrrebbe pesi verosimili ma non giustificati (vedi il commento " +
      "in testa al file)",
  );

  return {
    feasible: true,
    reason: reasonParts.join("; ") + ".",
    distribution,
    modalLineup: modal.lineup,
    legalModules,
    illegalModules,
    repeatPreviousWeight: repeatWeight,
    repeatPreviousFloored: repeatFloored,
    basis: input.opponentBehaviour.basis,
  };
}
