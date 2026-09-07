// LE METRICHE DEL CONFRONTO — §11.2 del disegno del generatore, WP-3.
//
// SEI MISURE, TUTTE FUNZIONI PURE. Nessuna legge una fonte, nessuna conosce una
// giornata vera, nessuna decide niente: ricevono numeri e formazioni da chi li
// ha osservati e restituiscono la misura. È deliberato — il confronto di §11
// vive nel layer privato, dove i dati stanno; qui vive l'ARITMETICA di quel
// confronto, in un posto solo, così che due tabelle prodotte in due momenti
// diversi siano confrontabili perché fatte con la stessa funzione.
//
// IL RIMPIANTO NON SI RISCRIVE. `lineupRegret` esiste dal passo 3 e resta la
// sola implementazione: qui si aggiunge la componente che §11.2 chiede in più —
// il rimpianto in PUNTI DI LEGA, oltre a quello in fantapunti — e la si mette
// accanto alla sua, senza duplicarne una riga.
//
// CHE COSA QUESTE FUNZIONI NON FANNO, dichiarato invece che scoperto dopo:
//  - non attribuiscono un esito a una politica: chi passa un `GameweekOutcome`
//    dichiara di quale formazione è, e nessuna funzione può verificarlo;
//  - non stimano `hit(s,t)` di §7.4 — la quota di titolari previsti che sono
//    partiti titolari, con prior Beta pooled — che è un'altra misura, si calcola
//    sullo STATO dichiarato dalla fonte e non su una probabilità, e serve a
//    PESARE le fonti (§7.5). Quella è WP-5; qui c'è la CALIBRAZIONE di §11.2,
//    cioè se un `pStarter` di 0,9 corrisponde a nove titolari su dieci;
//  - non decidono nessuna promozione: §2.4 è un criterio pre-registrato che
//    legge questi numeri, e leggerli non è applicarli.

import type { GameweekOutcome, Lineup } from "./gameweekSimulator.js";
import { LEAGUE_RULE_VERSION, type LeagueRuleVersion } from "./leagueGameweek.js";
import {
  type BestLineupResult,
  type DeclaredLeaguePoints,
  LEAGUE_POINTS,
  leaguePointsOf,
  lineupRegret,
} from "./lineupOptimizer.js";
import { lineupKey, normalisedOpponentWeights, type WeightedOpponentLineup } from "./opponentDistribution.js";
import type { ReferencePolicyId } from "./referencePolicies.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUNTI DI LEGA REALIZZATI, e il cumulato stagionale.
// ─────────────────────────────────────────────────────────────────────────────

export interface RealisedLeaguePoints {
  /** `null` quando l'esito non è risolto: non è zero, è «non calcolabile». */
  readonly leaguePoints: number | null;
  readonly ourGoals: number;
  readonly theirGoals: number;
  readonly ourTotal: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * I PUNTI DI LEGA CHE UNA FORMAZIONE HA DAVVERO RACCOLTO, contro la formazione
 * VERA dell'avversario (§11.2). L'esito lo produce il simulatore, e chi chiama
 * dichiara che è quello della politica che sta misurando.
 *
 * UN ESITO NON RISOLTO NON VALE ZERO. Se un senza voto cade in una combinazione
 * che il regolamento non copre, il punteggio calcolato non è quello ufficiale:
 * dargli zero punti di lega significherebbe scrivere una sconfitta che nessuno
 * ha giocato, e sommarla nel cumulato la renderebbe invisibile. Qui vale `null`,
 * e il cumulato la conta a parte.
 */
export function realisedLeaguePoints(
  outcome: GameweekOutcome,
  points: DeclaredLeaguePoints = LEAGUE_POINTS,
): RealisedLeaguePoints {
  const common = {
    ourGoals: outcome.ourGoals,
    theirGoals: outcome.theirGoals,
    ourTotal: outcome.ours.total,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
  if (!outcome.resolved) {
    return {
      ...common,
      leaguePoints: null,
      reason:
        "esito non risolto: " +
        (outcome.unresolvedReason ?? "il regolamento non copre una delle combinazioni incontrate") +
        ". Il punteggio calcolato non è quello ufficiale, quindi non ci sono punti di lega da attribuire.",
    };
  }
  const league = leaguePointsOf(outcome, points);
  return {
    ...common,
    leaguePoints: league.value,
    reason: `${league.label}: ${outcome.ourGoals}-${outcome.theirGoals}`,
  };
}

/** Una giornata di una politica, come la registra chi tiene il confronto. */
export interface PolicyMatchday {
  readonly policy: ReferencePolicyId;
  readonly matchday: number;
  /** `null` = giornata non calcolabile (esito non risolto, o nessuna formazione). */
  readonly leaguePoints: number | null;
}

export interface PolicySeasonRow {
  readonly policy: ReferencePolicyId;
  /** Somma dei punti delle sole giornate calcolabili. */
  readonly total: number;
  readonly matchdaysCounted: number;
  /** Le giornate che non si sono potute contare, in ordine crescente. */
  readonly matchdaysNotCounted: readonly number[];
}

export interface PolicySeasonTable {
  /** Le righe in ordine di politica come dichiarato dalle osservazioni. */
  readonly rows: readonly PolicySeasonRow[];
  /** Le giornate viste, in ordine crescente: la base del confronto. */
  readonly matchdays: readonly number[];
  /**
   * `false` se qualche politica non ha una riga per qualche giornata. Un
   * cumulato su basi diverse non è un confronto, ed è il modo più facile di
   * far vincere una politica: farla giocare le giornate che le riescono.
   */
  readonly sameBasis: boolean;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * IL CUMULATO STAGIONALE PER POLITICA (§11.2), e la guardia che lo rende un
 * confronto: tutte le politiche devono avere la stessa base di giornate. Il
 * cumulato di chi ha giocato trenta giornate non si confronta con quello di chi
 * ne ha giocate ventotto, e la differenza è invisibile guardando due totali.
 */
export function policySeasonTable(entries: readonly PolicyMatchday[]): PolicySeasonTable {
  if (entries.length === 0) {
    throw new Error(
      "cumulato stagionale: nessuna giornata registrata. Una tabella vuota non è un confronto a zero " +
        "pari: è nessun confronto, e presentarla come una riga di zeri farebbe sembrare misurato ciò " +
        "che non è stato osservato.",
    );
  }
  const seen = new Set<string>();
  const matchdays = new Set<number>();
  const order: ReferencePolicyId[] = [];
  const byPolicy = new Map<ReferencePolicyId, PolicyMatchday[]>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.matchday) || entry.matchday < 1) {
      throw new Error(
        `cumulato stagionale: giornata non valida (${String(entry.matchday)}) per la politica ` +
          `${String(entry.policy)}. Le giornate sono interi da 1 in su.`,
      );
    }
    if (entry.leaguePoints !== null && !Number.isFinite(entry.leaguePoints)) {
      throw new Error(
        `cumulato stagionale: punti non finiti alla giornata ${entry.matchday} per ` +
          `${String(entry.policy)}. «Non calcolabile» si scrive null, non NaN.`,
      );
    }
    const key = `${String(entry.policy)}|${entry.matchday}`;
    if (seen.has(key)) {
      throw new Error(
        `cumulato stagionale: la politica ${String(entry.policy)} ha due righe per la giornata ` +
          `${entry.matchday}. Due esiti per la stessa giornata non sono un dato più ricco: uno dei due ` +
          "è di un'altra formazione, e sommarli conterebbe due volte una giornata sola.",
      );
    }
    seen.add(key);
    matchdays.add(entry.matchday);
    if (!byPolicy.has(entry.policy)) {
      byPolicy.set(entry.policy, []);
      order.push(entry.policy);
    }
    (byPolicy.get(entry.policy) as PolicyMatchday[]).push(entry);
  }

  const allMatchdays = [...matchdays].sort((a, b) => a - b);
  const rows: PolicySeasonRow[] = order.map((policy) => {
    const rowEntries = byPolicy.get(policy) as PolicyMatchday[];
    const counted = rowEntries.filter((entry) => entry.leaguePoints !== null);
    const missing = new Set(allMatchdays);
    for (const entry of rowEntries) if (entry.leaguePoints !== null) missing.delete(entry.matchday);
    return {
      policy,
      total: counted.reduce((sum, entry) => sum + (entry.leaguePoints as number), 0),
      matchdaysCounted: counted.length,
      matchdaysNotCounted: [...missing].sort((a, b) => a - b),
    };
  });
  const sameBasis = rows.every((row) => row.matchdaysNotCounted.length === 0);
  return {
    rows,
    matchdays: allMatchdays,
    sameBasis,
    reason: sameBasis
      ? `${rows.length} politica/che su ${allMatchdays.length} giornata/e, tutte sulla stessa base`
      : "BASI DIVERSE: " +
        rows
          .filter((row) => row.matchdaysNotCounted.length > 0)
          .map((row) => `${String(row.policy)} non conta ${row.matchdaysNotCounted.join(", ")}`)
          .join("; ") +
        ". I totali NON sono confrontabili fra loro finché la base non è la stessa.",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RIMPIANTO — quello di sempre, più la componente in punti di lega.
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicyRegret {
  /** Punti di lega persi rispetto al tetto ex-post. Mai negativo. */
  readonly leaguePointsRegret: number;
  /** Fantapunti persi: viene da `lineupRegret`, non è ricalcolato qui. */
  readonly scoreRegret: number;
  /** Goal persi: viene da `lineupRegret`. */
  readonly goalRegret: number;
  readonly chosenLeaguePoints: number;
  readonly bestLeaguePoints: number;
  readonly comparable: boolean;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * IL RIMPIANTO DI UNA POLITICA, in punti di lega e in fantapunti (§11.2).
 *
 * La parte in fantapunti e goal è `lineupRegret` e basta: non ce n'è una
 * seconda copia qui, perché due implementazioni dello stesso numero sono due
 * numeri che un giorno divergeranno. Questa funzione aggiunge la componente che
 * §11.2 chiede in più — i punti di lega — che il passo 3 non calcolava perché
 * allora l'obiettivo non era ancora dichiarato.
 *
 * IL CONFRONTO VALE SOLO CONTRO LO STESSO AVVERSARIO. `chosen` e il tetto devono
 * essere stati calcolati contro la stessa formazione avversaria vera e con le
 * stesse righe di giornata: è responsabilità di chi chiama, e nessun controllo
 * qui può accorgersene. Un tetto calcolato contro un altro avversario darebbe
 * un rimpianto che sembra un numero e non lo è.
 */
export function policyRegret(input: {
  readonly chosen: GameweekOutcome;
  readonly ceiling: BestLineupResult;
  readonly points?: DeclaredLeaguePoints;
}): PolicyRegret {
  const points = input.points ?? LEAGUE_POINTS;
  const base = lineupRegret(input.chosen, input.ceiling);
  const chosenPoints = leaguePointsOf(input.chosen, points).value;
  if (!base.comparable || input.ceiling.outcome === null) {
    return {
      leaguePointsRegret: 0,
      scoreRegret: base.scoreRegret,
      goalRegret: base.goalRegret,
      chosenLeaguePoints: chosenPoints,
      bestLeaguePoints: chosenPoints,
      comparable: false,
      reason: base.reason,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  const bestPoints = leaguePointsOf(input.ceiling.outcome, points).value;
  return {
    leaguePointsRegret: Math.max(0, bestPoints - chosenPoints),
    scoreRegret: base.scoreRegret,
    goalRegret: base.goalRegret,
    chosenLeaguePoints: chosenPoints,
    bestLeaguePoints: bestPoints,
    comparable: true,
    reason: `${base.reason}; punti di lega ${chosenPoints} contro ${bestPoints} del tetto ex-post`,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-4. CALIBRAZIONE — di P(vittoria) e di pStarter. Una sola aritmetica.
// ─────────────────────────────────────────────────────────────────────────────

/** §11.2 dice «per decili di probabilità prevista»: dieci intervalli, non nove. */
export const CALIBRATION_BINS = 10 as const;

export interface CalibrationBin {
  /** Estremi dell'intervallo: chiuso a sinistra, aperto a destra tranne l'ultimo. */
  readonly lower: number;
  readonly upper: number;
  readonly count: number;
  /** Media delle probabilità previste che sono cadute qui; `null` se vuoto. */
  readonly meanPredicted: number | null;
  /** Quota di esiti veri osservati qui; `null` se vuoto. */
  readonly observedRate: number | null;
}

export interface CalibrationReport {
  readonly bins: readonly CalibrationBin[];
  readonly count: number;
  /** Quanti decili hanno almeno un'osservazione. */
  readonly populatedBins: number;
  readonly meanPredicted: number;
  readonly observedRate: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

interface CalibrationObservation {
  readonly predicted: number;
  readonly happened: boolean;
}

function calibrationOf(
  observations: readonly CalibrationObservation[],
  where: string,
  note: string,
): CalibrationReport {
  if (observations.length === 0) {
    throw new Error(
      `${where}: nessuna osservazione. Una calibrazione senza osservazioni non è una calibrazione ` +
        "piatta: è nessuna misura, e una tabella di dieci righe vuote somiglia troppo a un risultato.",
    );
  }
  const counts = new Array<number>(CALIBRATION_BINS).fill(0);
  const predictedSums = new Array<number>(CALIBRATION_BINS).fill(0);
  const happenedCounts = new Array<number>(CALIBRATION_BINS).fill(0);
  let predictedTotal = 0;
  let happenedTotal = 0;
  for (const observation of observations) {
    const p = observation.predicted;
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`${where}: probabilità prevista fuori da [0,1] (${String(p)}).`);
    }
    if (typeof observation.happened !== "boolean") {
      throw new Error(
        `${where}: l'esito osservato non è un booleano (${String(observation.happened)}). ` +
          "«Non osservato» non è «non accaduto»: una riga senza esito si toglie, non si mette a false.",
      );
    }
    // L'ultimo decile è chiuso a destra, altrimenti p = 1 cadrebbe in un
    // undicesimo intervallo che non esiste.
    const index = Math.min(CALIBRATION_BINS - 1, Math.floor(p * CALIBRATION_BINS));
    counts[index] = (counts[index] as number) + 1;
    predictedSums[index] = (predictedSums[index] as number) + p;
    predictedTotal += p;
    if (observation.happened) {
      happenedCounts[index] = (happenedCounts[index] as number) + 1;
      happenedTotal += 1;
    }
  }
  const bins: CalibrationBin[] = counts.map((count, index) => ({
    lower: index / CALIBRATION_BINS,
    upper: (index + 1) / CALIBRATION_BINS,
    count,
    meanPredicted: count === 0 ? null : (predictedSums[index] as number) / count,
    observedRate: count === 0 ? null : (happenedCounts[index] as number) / count,
  }));
  const populatedBins = bins.filter((bin) => bin.count > 0).length;
  return {
    bins,
    count: observations.length,
    populatedBins,
    meanPredicted: predictedTotal / observations.length,
    observedRate: happenedTotal / observations.length,
    reason:
      `${observations.length} osservazione/i su ${populatedBins} decile/i popolato/i. ${note} ` +
      "I conteggi per decile sono esposti proprio perché una quota calcolata su poche osservazioni si " +
      "legga come tale invece di sembrare una frequenza.",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * CALIBRAZIONE DI `P(vittoria)` (§11.2): per decili di probabilità prevista, la
 * quota di vittorie osservate.
 *
 * §11.2 la dichiara GROSSOLANA e chiede che si dichiari tale: una stagione ha
 * trentotto giornate, quindi in media meno di quattro osservazioni per decile.
 * La dichiarazione non è un commento — viaggia dentro `reason`, dove finisce
 * anche nei report che qualcuno leggerà senza aver letto questo file.
 */
export function winProbabilityCalibration(
  observations: readonly { readonly predictedWin: number; readonly won: boolean }[],
): CalibrationReport {
  return calibrationOf(
    observations.map((o) => ({ predicted: o.predictedWin, happened: o.won })),
    "calibrazione di P(vittoria)",
    "MISURA GROSSOLANA E DICHIARATA TALE (§11.2): una stagione ha 38 giornate, e dieci decili su 38 " +
      "punti danno meno di quattro osservazioni per decile.",
  );
}

/** Un giocatore, una fonte, una squadra: la previsione e ciò che è successo. */
export interface StarterObservation {
  /** La fonte che ha prodotto il numero (Sky, Gazzetta, Fantacalcio.it…). */
  readonly source: string;
  /** La squadra REALE del giocatore: §7.4 misura per fonte E per squadra. */
  readonly team: string;
  readonly playerId: string;
  readonly pStarter: number;
  /** È partito titolare? La verità di riferimento di §7.3. */
  readonly started: boolean;
}

export interface StarterCalibrationGroup {
  readonly source: string;
  readonly team: string;
  readonly report: CalibrationReport;
}

export interface StarterCalibrationReport {
  /** Un gruppo per coppia fonte × squadra, in ordine di fonte e poi di squadra. */
  readonly groups: readonly StarterCalibrationGroup[];
  /** La calibrazione su tutte le osservazioni insieme. */
  readonly overall: CalibrationReport;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * CALIBRAZIONE DI `pStarter` PER FONTE E PER SQUADRA (§11.2, che rimanda a §7.4).
 *
 * MISURA UNA COSA SOLA: se un `pStarter` di 0,9 corrisponde davvero a nove
 * titolari su dieci. NON è `hit(s,t)` di §7.4 — la quota di titolari PREVISTI
 * che sono partiti titolari, stimata con un prior Beta pooled e usata per PESARE
 * le fonti in §7.5. Quella si calcola sullo STATO che la fonte dichiara
 * («titolare», «ballottaggio», «panchina»), non su una probabilità, e nasce
 * insieme all'acquisizione delle probabili: è WP-5, e costruirla qui vorrebbe
 * dire scegliere adesso i pseudo-conteggi del prior senza i dati che li
 * giustificano.
 */
export function pStarterCalibration(observations: readonly StarterObservation[]): StarterCalibrationReport {
  const seen = new Set<string>();
  const groups = new Map<string, { source: string; team: string; items: CalibrationObservation[] }>();
  for (const observation of observations) {
    for (const [name, value] of [
      ["source", observation.source],
      ["team", observation.team],
      ["playerId", observation.playerId],
    ] as const) {
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(
          `calibrazione di pStarter: ${name} mancante o vuoto. La misura è PER FONTE E PER SQUADRA ` +
            "(§7.4): senza l'una o senza l'altra non è quella misura, è un'altra.",
        );
      }
    }
    const key = `${observation.source}|${observation.team}|${observation.playerId}`;
    if (seen.has(key)) {
      throw new Error(
        `calibrazione di pStarter: ${observation.playerId} compare due volte per la fonte ` +
          `${observation.source} e la squadra ${observation.team}. §7.4 misura l'ULTIMA lettura prima ` +
          "del calcio d'inizio: due letture dello stesso giocatore vanno ridotte a quella prima di " +
          "arrivare qui, altrimenti la fonte pesa il doppio dove ha cambiato idea.",
      );
    }
    seen.add(key);
    const groupKey = `${observation.source}|${observation.team}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { source: observation.source, team: observation.team, items: [] });
    }
    (groups.get(groupKey) as { items: CalibrationObservation[] }).items.push({
      predicted: observation.pStarter,
      happened: observation.started,
    });
  }
  const ordered = [...groups.values()].sort((a, b) =>
    a.source === b.source ? (a.team < b.team ? -1 : a.team > b.team ? 1 : 0) : a.source < b.source ? -1 : 1,
  );
  return {
    groups: ordered.map((group) => ({
      source: group.source,
      team: group.team,
      report: calibrationOf(
        group.items,
        `calibrazione di pStarter (${group.source} × ${group.team})`,
        "Calibrazione, NON l'affidabilità hit(s,t) di §7.4 che pesa le fonti in §7.5.",
      ),
    })),
    overall: calibrationOf(
      observations.map((o) => ({ predicted: o.pStarter, happened: o.started })),
      "calibrazione di pStarter",
      "Calibrazione su tutte le fonti e squadre insieme: utile a vedere una distorsione comune, " +
        "inutile a scegliere una fonte — per quello servono i gruppi.",
    ),
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COPERTURA DELL'AVVERSARIO.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpponentCoverage {
  /** La formazione vera era nella distribuzione? */
  readonly covered: boolean;
  /** Con che peso normalizzato. Zero quando non c'era. */
  readonly weight: number;
  /** L'indice nella distribuzione dichiarata, `null` se non c'era. */
  readonly index: number | null;
  readonly candidates: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * COPERTURA DELL'AVVERSARIO (§11.2): la formazione vera era in `O`, e con che
 * peso?
 *
 * IL CONFRONTO È SULLA CHIAVE STRUTTURALE INTERA — modulo, portiere, titolari e
 * PANCHINA NELL'ORDINE. Non è pignoleria: l'ordine della panchina decide chi
 * entra quando il tetto di cinque sostituzioni morde (§10), quindi due
 * formazioni con gli stessi undici e panchine ordinate diversamente danno
 * punteggi diversi. Chiamarle «la stessa» gonfierebbe la copertura proprio nel
 * caso in cui la previsione ha sbagliato la cosa che conta. La panchina ordinata
 * è osservabile: §8.2 la legge dalle pagine delle partite.
 */
export function opponentCoverage(input: {
  readonly distribution: readonly WeightedOpponentLineup[];
  readonly trueLineup: Lineup;
}): OpponentCoverage {
  const weights = normalisedOpponentWeights(input.distribution, "copertura dell'avversario");
  const target = lineupKey(input.trueLineup);
  const index = input.distribution.findIndex((candidate) => lineupKey(candidate.lineup) === target);
  if (index === -1) {
    return {
      covered: false,
      weight: 0,
      index: null,
      candidates: input.distribution.length,
      reason:
        `la formazione vera non è fra le ${input.distribution.length} candidate: la distribuzione le ` +
        "dava peso zero, cioè la dichiarava impossibile. Non è un errore di stima come un altro — " +
        "l'obiettivo è stato massimizzato contro un insieme che non conteneva ciò che è successo.",
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  const weight = weights[index] as number;
  return {
    covered: true,
    weight,
    index,
    candidates: input.distribution.length,
    reason: `formazione vera coperta dalla candidata n. ${index + 1} su ${input.distribution.length}, peso ${weight}`,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SICUREZZA.
// ─────────────────────────────────────────────────────────────────────────────

/** Una giornata come si presenta al conto della sicurezza. */
export interface SafetyMatchday {
  readonly matchday: number;
  /** La formazione registrata per quella giornata; `null` = non c'è stata. */
  readonly lineup: Lineup | null;
  /** L'esito della nostra formazione; `null` quando non è stato calcolato. */
  readonly outcome: GameweekOutcome | null;
}

export interface SafetyMatchdayReport {
  readonly matchday: number;
  readonly hasLineup: boolean;
  /** Titolari senza voto rimasti senza rimpiazzo; `null` se non calcolabile. */
  readonly uncovered: number | null;
  readonly uncoveredIds: readonly string[];
}

export interface SafetyReport {
  readonly matchdays: readonly SafetyMatchdayReport[];
  /** DEVE essere zero: una giornata senza formazione è il guasto peggiore. */
  readonly matchdaysWithoutLineup: number;
  readonly totalUncovered: number;
  /** Giornate con una formazione ma senza esito: non contano fra gli scoperti. */
  readonly matchdaysNotEvaluated: number;
  /** `false` appena manca una formazione. Non è una media, è una soglia. */
  readonly safe: boolean;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * SICUREZZA (§11.2): quanti senza voto scoperti per giornata, e quante giornate
 * senza formazione — che «deve essere zero».
 *
 * PERCHÉ NON È UNA MEDIA. Una giornata senza formazione non si compensa con
 * trentasette giornate perfette: §16 fa valere la formazione della giornata
 * precedente, che nessuno ha scelto per questa. `safe` è quindi una soglia a
 * zero, non un punteggio, e diventa `false` alla prima.
 *
 * UNA GIORNATA CON FORMAZIONE E SENZA ESITO NON È UNA GIORNATA SICURA NÉ UNA
 * INSICURA: è una giornata non misurata, e si conta a parte invece di essere
 * silenziosamente sommata come zero scoperti.
 */
export function safetyReport(matchdays: readonly SafetyMatchday[]): SafetyReport {
  if (matchdays.length === 0) {
    throw new Error(
      "sicurezza: nessuna giornata registrata. Zero giornate senza formazione su zero giornate non è " +
        "un sistema sicuro: è un sistema che non ha ancora giocato.",
    );
  }
  const seen = new Set<number>();
  const rows: SafetyMatchdayReport[] = [];
  for (const entry of matchdays) {
    if (!Number.isInteger(entry.matchday) || entry.matchday < 1) {
      throw new Error(
        `sicurezza: giornata non valida (${String(entry.matchday)}). Le giornate sono interi da 1 in su.`,
      );
    }
    if (seen.has(entry.matchday)) {
      throw new Error(
        `sicurezza: la giornata ${entry.matchday} compare due volte. Una giornata è una: due righe ` +
          "conterebbero due volte gli stessi scoperti, o ne nasconderebbero una senza formazione.",
      );
    }
    seen.add(entry.matchday);
    const uncoveredIds = entry.outcome === null ? [] : entry.outcome.ours.resolution.uncoveredIds;
    rows.push({
      matchday: entry.matchday,
      hasLineup: entry.lineup !== null,
      uncovered: entry.outcome === null ? null : uncoveredIds.length,
      uncoveredIds: [...uncoveredIds],
    });
  }
  rows.sort((a, b) => a.matchday - b.matchday);
  const missing = rows.filter((row) => !row.hasLineup);
  const notEvaluated = rows.filter((row) => row.uncovered === null).length;
  const totalUncovered = rows.reduce((sum, row) => sum + (row.uncovered ?? 0), 0);
  return {
    matchdays: rows,
    matchdaysWithoutLineup: missing.length,
    totalUncovered,
    matchdaysNotEvaluated: notEvaluated,
    safe: missing.length === 0,
    reason:
      missing.length === 0
        ? `${rows.length} giornata/e, tutte con una formazione; ${totalUncovered} senza voto scoperto/i` +
          (notEvaluated > 0 ? `; ${notEvaluated} giornata/e con formazione ma senza esito calcolato` : "")
        : `GIORNATE SENZA FORMAZIONE: ${missing.map((row) => row.matchday).join(", ")}. §11.2 dice che ` +
          "questo numero deve essere zero, e §16 dice perché: senza formazione vale quella della " +
          "giornata precedente, che nessuno ha scelto per questa.",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}
