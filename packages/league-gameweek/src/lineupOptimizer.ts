// OTTIMIZZATORE E MISURA — passo 3 della Fase 2 (Lineup Coach).
//
// Due cose, e nessuna delle due è una previsione:
//  1. data una giornata di cui si conoscono i voti, qual era la MIGLIOR
//     formazione schierabile? (il tetto ex-post)
//  2. quanto è costata la formazione che è stata scelta davvero? (il REGRET)
//
// Il regret è la metrica contro cui ogni modello futuro dovrà giustificarsi.
// Va letto con la cautela che il recap stesso raccomanda: la miglior
// formazione ex-post usa informazioni che prima della deadline non c'erano, e
// quindi non è un obiettivo raggiungibile — è il metro, non il bersaglio.
//
// LA FUNZIONE OBIETTIVO NON HA UN DEFAULT, ED È UNA SCELTA.
// Il regolamento mette «punti» al primo criterio di classifica e NON dice
// quanto vale una vittoria; dedurlo è vietato. Perciò `expectedLeaguePoints`
// PRETENDE i tre numeri come input e non ne inventa nessuno: finché il
// committente non li dichiara, il confronto fra formazioni ricade su un
// ordinamento dichiarato (goal, poi punteggio) che porta la sua etichetta a
// vista. Un `3` scritto qui come default sarebbe una regola di lega inventata
// dal sistema.

import {
  type GameweekContext,
  type GameweekOutcome,
  type Lineup,
  type PlayerLine,
  type Role,
  simulateGameweek,
} from "./gameweekSimulator.js";
import { LEAGUE_RULE_VERSION, type LeagueRuleVersion, MODULES, type Module, moduleShape } from "./leagueGameweek.js";

/** Tutte le combinazioni di `k` elementi, in ordine deterministico. */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k < 0 || k > items.length) return [];
  if (k === 0) return [[]];
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i <= items.length - (k - current.length); i += 1) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

const hasVote = (line: PlayerLine): boolean => line.baseVote !== null && line.fantasyScore !== null;

export interface BestLineupResult {
  readonly lineup: Lineup | null;
  readonly outcome: GameweekOutcome | null;
  /** `false` quando nessuna formazione completa era schierabile con i voti dati. */
  readonly feasible: boolean;
  readonly reason: string;
  /** Quante formazioni complete sono state valutate. */
  readonly evaluated: number;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * LA MIGLIOR FORMAZIONE EX-POST.
 *
 * SI MASSIMIZZA IL RISULTATO, NON IL NOSTRO PUNTEGGIO — ed è il punto su cui
 * la review critica ha bocciato l'impianto del recap. Il modificatore modulo
 * non tocca il nostro totale: toglie o aggiunge punti a LORO. Un ottimizzatore
 * che massimizzasse `ours.total` sceglierebbe il modulo guardando solo i propri
 * giocatori e regalerebbe fino a 1,5 punti all'avversario senza accorgersene.
 * Qui il criterio è l'obiettivo: i punti di lega se sono dichiarati, altrimenti
 * differenza goal e poi punteggio, con l'etichetta a vista.
 *
 * PERCHÉ NON SERVE LA FORZA BRUTA, E QUAL È LA CONDIZIONE.
 * A modulo e portiere fissati, difensori e attaccanti muovono SOLO il nostro
 * totale, con contributo additivo, e l'obiettivo è monotono nel nostro totale
 * a totale avversario fermo: si scelgono massimizzando `ours.total`, e la loro
 * scelta non dipende dagli altri ruoli. I centrocampisti sono l'unico ruolo che
 * muove entrambi i totali, e la conversione in goal è a bande: vanno quindi
 * scelti PER ULTIMI, sull'obiettivo, con difesa e attacco già definitivi.
 * Costa 126 + 35 + 126 valutazioni per portiere invece del loro prodotto, e
 * ogni candidato è misurato dentro una simulazione completa: non c'è una
 * seconda formula parallela che un giorno divergerà.
 *
 * L'ordine è la condizione, non un dettaglio: scegliere il centrocampo prima
 * dell'attacco rende il risultato subottimale, ed è l'errore che una review
 * indipendente ha trovato nella prima versione di questo file.
 *
 * Le sostituzioni non entrano nel conto perché a voti noti non servono: chi
 * sceglie ex-post non schiera mai un giocatore senza voto se ne ha uno con
 * voto. Se in un ruolo i giocatori con voto non bastano, non esiste una
 * formazione completa e la funzione lo dichiara invece di produrne una monca.
 */
export function bestLineupExPost(input: {
  readonly squad: readonly PlayerLine[];
  readonly theirLineup: Lineup;
  readonly players: ReadonlyMap<string, PlayerLine>;
  readonly context: GameweekContext;
  /** Limita la ricerca a un modulo solo; assente = tutti e sette. */
  readonly onlyModule?: Module;
  /**
   * Giocatori che DEVONO essere schierati — portiere o movimento. Assente o
   * vuoto: la ricerca è quella di sempre, bit a bit.
   *
   * Un imposto entra anche SENZA VOTO. Non è un'incoerenza con la regola qui
   * sopra («chi sceglie ex-post non schiera mai un giocatore senza voto»):
   * quella descrive che cosa SCEGLIE questa funzione, mentre un imposto non è
   * una sua scelta, è una volontà di chi schiera. Questa funzione la rispetta,
   * oppure dichiara che il modulo non la regge — non la rilassa.
   */
  readonly mustStart?: readonly string[];
  /**
   * I punti di lega dichiarati. `null` (o assente) = non dichiarati: si ordina
   * su differenza goal e poi punteggio, con l'etichetta a vista.
   */
  /** Omesso: `LEAGUE_POINTS`, i punti dichiarati. `null`: l'ordinamento surrogato. */
  readonly points?: DeclaredLeaguePoints | null;
}): BestLineupResult {
  const { squad, theirLineup, players, context } = input;
  // Omettere i punti significa «usa quelli della lega»; passare esplicitamente
  // `null` significa «fammi vedere che succede senza», ed è un'altra domanda.
  const points = input.points === undefined ? LEAGUE_POINTS : input.points;
  const valueOf = (outcome: GameweekOutcome): number => objectiveValue(outcome, points).value;
  const withVote = squad.filter(hasVote);
  const byRole = (role: Role): PlayerLine[] => withVote.filter((line) => line.role === role);
  const modules = input.onlyModule === undefined ? MODULES : [input.onlyModule];

  // Titolari imposti: l'insieme vuoto lascia ogni pool identico a `byRole`, e
  // quindi lascia la ricerca identica a quella di sempre.
  const mustStartIds = new Set(input.mustStart ?? []);
  const squadIds = new Set(squad.map((line) => line.id));
  for (const id of mustStartIds) {
    if (!squadIds.has(id)) {
      throw new Error(`mustStart: ${id} non è in rosa. Chi impone un titolare deve averlo fra le righe passate.`);
    }
  }
  /** Gli imposti di un ruolo, con o senza voto: la volontà non si filtra. */
  const forcedByRole = (role: Role): PlayerLine[] =>
    squad.filter((line) => mustStartIds.has(line.id) && line.role === role);
  /** I liberi di un ruolo: quelli con voto che nessuno ha imposto. */
  const freeByRole = (role: Role): PlayerLine[] => byRole(role).filter((line) => !mustStartIds.has(line.id));

  let best: { lineup: Lineup; outcome: GameweekOutcome } | null = null;
  let evaluated = 0;
  const shortfalls: string[] = [];

  const OUTFIELD: readonly ("D" | "C" | "A")[] = ["D", "C", "A"];

  for (const module of modules) {
    const shape = moduleShape(module);
    const forcedKeepers = forcedByRole("P");
    if (forcedKeepers.length > 1) {
      shortfalls.push(`${module}: ${forcedKeepers.length} portieri imposti, il modulo ne chiede uno`);
      continue;
    }
    const keepers = forcedKeepers.length === 1 ? forcedKeepers : byRole("P");
    const wanted: Record<"D" | "C" | "A", number> = {
      D: shape.defenders,
      C: shape.midfielders,
      A: shape.strikers,
    };
    const forcedOf: Record<"D" | "C" | "A", PlayerLine[]> = {
      D: forcedByRole("D"),
      C: forcedByRole("C"),
      A: forcedByRole("A"),
    };
    const freeOf: Record<"D" | "C" | "A", PlayerLine[]> = {
      D: freeByRole("D"),
      C: freeByRole("C"),
      A: freeByRole("A"),
    };
    let blocked = false;
    for (const role of OUTFIELD) {
      if (forcedOf[role].length > wanted[role]) {
        shortfalls.push(`${module}: ${forcedOf[role].length} ${role} imposti, il modulo ne chiede ${wanted[role]}`);
        blocked = true;
        break;
      }
      if (freeOf[role].length < wanted[role] - forcedOf[role].length) {
        shortfalls.push(`${module}: giocatori con voto insufficienti per il modulo`);
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    if (keepers.length < 1) {
      shortfalls.push(`${module}: giocatori con voto insufficienti per il modulo`);
      continue;
    }

    // Massimizzazione separata per ruolo: ogni combinazione viene valutata
    // dentro una formazione completa, così il punteggio è sempre quello vero
    // del simulatore e non una somma parallela che potrebbe divergere. Gli
    // imposti occupano i loro posti e la ricerca combina solo il resto.
    const pick = (role: "D" | "C" | "A"): PlayerLine[][] =>
      combinations(freeOf[role], wanted[role] - forcedOf[role].length).map((rest) => [...forcedOf[role], ...rest]);
    const picksD = pick("D");
    const picksC = pick("C");
    const picksA = pick("A");

    for (const keeper of keepers) {
      let bestForKeeper: { lineup: Lineup; outcome: GameweekOutcome } | null = null;
      const evaluate = (d: PlayerLine[], c: PlayerLine[], a: PlayerLine[]): GameweekOutcome => {
        const starters = [...d, ...c, ...a];
        const chosen = new Set([keeper.id, ...starters.map((p) => p.id)]);
        const bench = squad
          .filter((p) => !chosen.has(p.id))
          // Panchina della formazione CONTROFATTUALE: ordine per punteggio
          // decrescente. È una scelta dell'ottimizzatore, non una regola di
          // lega — a voti noti non cambia il risultato, perché nessun titolare
          // resta senza voto, ma resta dichiarata invece che implicita.
          .sort((x, y) => (y.fantasyScore ?? -Infinity) - (x.fantasyScore ?? -Infinity))
          .map((p) => p.id);
        const lineup: Lineup = {
          module,
          goalkeeperId: keeper.id,
          starterIds: starters.map((p) => p.id),
          benchIds: bench,
        };
        evaluated += 1;
        const outcome = simulateGameweek({ ourLineup: lineup, theirLineup, players, context });
        if (
          bestForKeeper === null ||
          valueOf(outcome) > valueOf(bestForKeeper.outcome) ||
          (valueOf(outcome) === valueOf(bestForKeeper.outcome) &&
            lineup.starterIds.join(",") < bestForKeeper.lineup.starterIds.join(","))
        ) {
          bestForKeeper = { lineup, outcome };
        }
        return outcome;
      };

      // L'ORDINE DEI TRE RUOLI NON È INDIFFERENTE, E LA PRIMA VERSIONE DI
      // QUESTO FILE LO SBAGLIAVA. Difensori e attaccanti muovono SOLO il nostro
      // totale, e l'obiettivo è monotono in quello a totale avversario fermo:
      // si scelgono quindi massimizzando `ours.total`, e la loro scelta non
      // dipende da nient'altro perché il contributo è additivo. I
      // centrocampisti sono l'unico ruolo che muove ENTRAMBI i totali (il loro
      // delta è il nostro cambiato di segno), e la conversione in goal è a
      // bande, cioè non lineare: il centrocampo migliore accanto a un attacco
      // debole NON è detto sia il migliore accanto all'attacco vero. Perciò il
      // centrocampo si sceglie PER ULTIMO, con difesa e attacco già definitivi.
      //
      // La prima versione sceglieva il centrocampo in mezzo, contro un attacco
      // «di riferimento» arbitrario, e una review indipendente ha prodotto il
      // controesempio: mezzo punto di differenza sul massimo. Il test
      // `non esiste una rosa in cui la forza bruta batta l'algoritmo` percorre
      // ora un campionario di rose invece di una sola.
      const refC = picksC[0]!;
      const refA = picksA[0]!;

      let bestD = picksD[0]!;
      let bestDTotal = -Infinity;
      for (const d of picksD) {
        const total = evaluate(d, refC, refA).ours.total;
        if (total > bestDTotal) {
          bestDTotal = total;
          bestD = d;
        }
      }
      let bestA = refA;
      let bestATotal = -Infinity;
      for (const a of picksA) {
        const total = evaluate(bestD, refC, a).ours.total;
        if (total > bestATotal) {
          bestATotal = total;
          bestA = a;
        }
      }
      let bestC = refC;
      let bestCValue = -Infinity;
      for (const c of picksC) {
        const value = valueOf(evaluate(bestD, c, bestA));
        if (value > bestCValue) {
          bestCValue = value;
          bestC = c;
        }
      }
      evaluate(bestD, bestC, bestA);

      const candidate = bestForKeeper as { lineup: Lineup; outcome: GameweekOutcome } | null;
      if (candidate !== null && (best === null || valueOf(candidate.outcome) > valueOf(best.outcome))) {
        best = candidate;
      }
    }
  }

  if (best === null) {
    return {
      lineup: null,
      outcome: null,
      feasible: false,
      reason:
        shortfalls.length > 0
          ? `nessuna formazione completa schierabile con i voti dati (${shortfalls.join("; ")})`
          : "nessuna formazione completa schierabile con i voti dati",
      evaluated,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  return {
    lineup: best.lineup,
    outcome: best.outcome,
    feasible: true,
    reason:
      `massimo su ${modules.length} modulo/i, criterio ${objectiveValue(best.outcome, points).objective}; ` +
      "ricerca per ruoli con il centrocampo valutato per ultimo, e ogni candidato misurato dentro una simulazione completa",

    evaluated,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

export interface RegretResult {
  /** Punti persi rispetto alla miglior formazione ex-post. Mai negativo. */
  readonly scoreRegret: number;
  /** Goal persi rispetto alla miglior formazione ex-post. Mai negativo. */
  readonly goalRegret: number;
  readonly chosenTotal: number;
  readonly bestTotal: number;
  readonly comparable: boolean;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * REGRET — quanto è costata la formazione scelta rispetto al tetto ex-post.
 *
 * Non è un giudizio sul fantallenatore: il tetto usa informazioni che prima
 * della deadline non esistevano. È il metro con cui, un giorno, si misurerà se
 * un modello vale la complessità che costa.
 */
export function lineupRegret(chosen: GameweekOutcome, best: BestLineupResult): RegretResult {
  if (!best.feasible || best.outcome === null) {
    return {
      scoreRegret: 0,
      goalRegret: 0,
      chosenTotal: chosen.ours.total,
      bestTotal: chosen.ours.total,
      comparable: false,
      reason: best.reason,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  if (!chosen.resolved) {
    return {
      scoreRegret: 0,
      goalRegret: 0,
      chosenTotal: chosen.ours.total,
      bestTotal: best.outcome.ours.total,
      comparable: false,
      reason:
        "la formazione scelta ha titolari senza voto e senza rimpiazzo: il suo punteggio non è quello ufficiale, quindi il confronto non è comparabile",
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  return {
    scoreRegret: Math.max(0, best.outcome.ours.total - chosen.ours.total),
    goalRegret: Math.max(0, best.outcome.ourGoals - chosen.ourGoals),
    chosenTotal: chosen.ours.total,
    bestTotal: best.outcome.ours.total,
    comparable: true,
    reason: "confronto con il massimo ex-post",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * I punti che la lega assegna a vittoria, pareggio e sconfitta. NON hanno un
 * default: il regolamento non li dichiara e questo modulo non li inventa.
 */
export interface DeclaredLeaguePoints {
  readonly win: number;
  readonly draw: number;
  readonly loss: number;
}

export interface ObjectiveValue {
  readonly value: number;
  readonly objective: "LEAGUE_POINTS" | "GOALS_THEN_SCORE";
  readonly label: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * I tre numeri devono essere ordinati: una vittoria non può valere meno di un
 * pareggio. Non è una preferenza di stile — tutta la ricerca del massimo
 * poggia sulla monotonia dell'obiettivo, e tre numeri disordinati la
 * romperebbero in silenzio. Meglio fermarsi che restituire un massimo che non
 * lo è.
 */
/**
 * I punti di lega, dichiarati da Pico il 2026-09-03: **la convenzione della
 * Serie A**, 3 / 1 / 0. Il regolamento metteva «punti» al primo criterio di
 * classifica senza quantificarli, e §27 vietava di dedurli.
 *
 * **Non è un numero neutro per il Coach.** Con 3/1/0 una vittoria vale tre
 * pareggi, quindi da sfavorito conviene alzare la varianza: il pareggio che si
 * protegge vale un terzo di quel che si rischia di guadagnare. Con 2/1/0 la
 * stessa formazione sarebbe spesso la scelta sbagliata. Su una decisione
 * deterministica a giornata singola invece non cambia nulla, perché lì conta
 * solo l'ordine V > N > P.
 */
export const LEAGUE_POINTS: DeclaredLeaguePoints = { win: 3, draw: 1, loss: 0 };

export function assertDeclaredLeaguePoints(points: DeclaredLeaguePoints): void {
  if (!(points.win >= points.draw && points.draw >= points.loss)) {
    throw new Error(
      `punti di lega non ordinati: vittoria ${points.win}, pareggio ${points.draw}, sconfitta ${points.loss}. ` +
        "La ricerca del massimo assume che una vittoria non valga meno di un pareggio.",
    );
  }
}

/** Punti di lega di un singolo esito, dati i tre numeri dichiarati. */
export function leaguePointsOf(outcome: GameweekOutcome, points: DeclaredLeaguePoints): ObjectiveValue {
  assertDeclaredLeaguePoints(points);
  const value =
    outcome.ourGoals > outcome.theirGoals
      ? points.win
      : outcome.ourGoals === outcome.theirGoals
        ? points.draw
        : points.loss;
  return {
    value,
    objective: "LEAGUE_POINTS",
    label: `punti di lega dichiarati (V ${points.win} / N ${points.draw} / P ${points.loss})`,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/** +1 vittoria, 0 pareggio, −1 sconfitta. Il risultato, non il suo margine. */
export function resultSign(outcome: GameweekOutcome): number {
  if (outcome.ourGoals > outcome.theirGoals) return 1;
  if (outcome.ourGoals === outcome.theirGoals) return 0;
  return -1;
}

/**
 * Ordinamento fra due esiti quando i punti di lega NON sono dichiarati.
 *
 * Non è inventato: ricalca l'ordine dei criteri di classifica del regolamento —
 * punti, poi **somma del punteggio totale**, poi differenza reti. I punti non
 * sono calcolabili (è la domanda aperta), ma il risultato che li produce sì:
 * quindi prima l'esito (vittoria > pareggio > sconfitta), poi il punteggio
 * totale, poi la differenza reti. Resta un surrogato, e lo dice.
 */
export function compareOutcomesWithoutDeclaredPoints(a: GameweekOutcome, b: GameweekOutcome): number {
  if (resultSign(a) !== resultSign(b)) return resultSign(b) - resultSign(a);
  if (a.ours.total !== b.ours.total) return b.ours.total - a.ours.total;
  return b.ourGoals - b.theirGoals - (a.ourGoals - a.theirGoals);
}

/**
 * Valore di un esito secondo l'obiettivo disponibile. Con i punti dichiarati
 * usa quelli; senza, ricade sull'ordinamento dichiarato e lo dice.
 */
export function objectiveValue(
  outcome: GameweekOutcome,
  points: DeclaredLeaguePoints | null,
): ObjectiveValue {
  if (points !== null) {
    // I punti da soli sono un obiettivo PIATTO: con 3/1/0 ogni vittoria vale
    // quanto ogni altra, e fra decine di formazioni che vincono l'ottimizzatore
    // sceglierebbe a caso — anche quella che vince buttando dentro i peggiori.
    // Il pareggio si rompe con i criteri che il regolamento mette subito dopo
    // «punti» in §22: somma del punteggio totale, poi differenza reti. Non è
    // un'invenzione per far tornare i conti, è l'ordine della classifica.
    const league = leaguePointsOf(outcome, points);
    return {
      value: league.value * 1_000_000 + outcome.ours.total * 1_000 + (outcome.ourGoals - outcome.theirGoals),
      objective: "LEAGUE_POINTS",
      label: `${league.label}, pareggi rotti da punteggio totale e differenza reti (criteri di classifica §22)`,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }
  // Codifica lessicografica in un numero solo: esito, poi punteggio totale,
  // poi differenza reti — l'ordine dei criteri di classifica del regolamento
  // meno i punti, che non sono dichiarati. I fattori sono più grandi di
  // qualunque valore che i termini successivi possano assumere.
  return {
    value:
      resultSign(outcome) * 1_000_000 +
      outcome.ours.total * 1_000 +
      (outcome.ourGoals - outcome.theirGoals),
    objective: "GOALS_THEN_SCORE",
    label:
      "punti di lega esclusi su richiesta: ordinamento su esito, poi punteggio totale, poi differenza reti (ordine dei criteri di classifica del regolamento). NON è la funzione obiettivo del Coach, che dal 2026-09-03 usa LEAGUE_POINTS",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}
