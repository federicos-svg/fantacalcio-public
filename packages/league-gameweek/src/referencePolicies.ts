// LE POLITICHE DI RIFERIMENTO — §11.1 del disegno del generatore, WP-3.
//
// PERCHÉ ESISTONO, E PERCHÉ VENGONO PRIMA DEL MODELLO. Queste non sono
// alternative fra cui scegliere: sono il METRO contro cui ogni motore futuro
// dovrà giustificarsi. La regola del progetto è scritta e vincolante — «un
// sistema complesso che non batte stabilmente baseline semplici non deve essere
// promosso» — e una regola così vale quanto valgono le baseline: se il pavimento
// è finto, qualunque motore lo scavalca e la promozione diventa automatica.
//
// ── L'ONESTÀ DI UNA POLITICA È UNA PROPRIETÀ DEL SUO INGRESSO ────────────────
//
// Una politica EX-ANTE si costruisce con il solo dato che avrebbe avuto PRIMA
// della giornata; una politica EX-POST guarda i voti veri e non è un obiettivo
// raggiungibile, è il tetto. Se una politica ex-post si travestisse da ex-ante,
// il confronto sarebbe truccato e nessuno se ne accorgerebbe: il numero
// continuerebbe a uscire, più bello del vero.
//
// Qui la differenza non è affidata a un commento: è nei TIPI. Le politiche
// ex-ante prendono `LineupProposalInput` — gli stessi ingressi del produttore,
// cioè previsioni — e non hanno modo di leggere un voto vero. Il tetto prende
// `ExPostCeilingInput`, che chiede `PlayerLine` con i voti della giornata già
// dentro, e porta `ExPost` nel nome della funzione, nel campo `information` e
// nella ragione che restituisce. Passare l'uno dove va l'altro non compila.
//
// ── NIENTE DEFAULT, MAI ─────────────────────────────────────────────────────
//
// Dove il regolamento o il disegno tacciono, queste funzioni DICHIARANO invece
// di scegliere in silenzio: la fantamedia non si sostituisce con il punteggio
// atteso (è un'altra cosa), la sua provenienza si dichiara, e un vincolo del
// fantallenatore fa rifiutare la politica invece di essere ignorato.
//
// ── NESSUNA ARITMETICA PARALLELA ────────────────────────────────────────────
//
// Ogni politica valuta con `simulateGameweek` e, dove le serve una previsione,
// con gli STESSI scenari del produttore (`prepareGameweek`). Il confronto di
// §11 deve misurare la DECISIONE, non i dati e nemmeno la ricerca: per questo
// la regola dei 72 riusa il vicinato del produttore e la sua chiave di rottura
// dei pareggi, e cambia solo ciò che massimizza.

import {
  type GameweekContext,
  type Lineup,
  type PlayerLine,
  type Role,
  lineupViolations,
  simulateGameweek,
} from "./gameweekSimulator.js";
import {
  FIRST_GOAL_THRESHOLD,
  GOAL_BAND_WIDTH,
  LEAGUE_RULE_VERSION,
  type LeagueRuleVersion,
  MODULES,
  type Module,
  moduleShape,
} from "./leagueGameweek.js";
import {
  type BestLineupResult,
  type DeclaredLeaguePoints,
  bestLineupExPost,
} from "./lineupOptimizer.js";
import {
  MAX_REFINEMENT_ITERATIONS,
  type LineupConstraints,
  type LineupPlan,
  type LineupProposalInput,
  type PlayerForecast,
  buildLineupFromPlan,
  neighbours,
  prepareGameweek,
  proposeLineup,
  startingBench,
  tieBreakKey,
} from "./lineupProposer.js";

/** Una riga di §11.1, con il nome che il disegno le dà. */
export type ReferencePolicyId =
  | "BEST_EX_POST"
  | "TOP_ELEVEN_BY_SEASON_AVERAGE"
  | "RULE_OF_72"
  | "BASE_ENGINE"
  | "RICH_ENGINE"
  | "FIELDED";

/**
 * CON QUALE INFORMAZIONE la politica ha scelto. È il campo che rende impossibile
 * confondere il tetto con una politica giocabile: `EX_POST` non è un dettaglio
 * di implementazione, è il motivo per cui quel numero non è un bersaglio.
 */
export type PolicyInformation =
  /** Solo il dato disponibile PRIMA della giornata: una politica giocabile. */
  | "EX_ANTE"
  /** A voti noti: il tetto. NON è raggiungibile e non è un obiettivo. */
  | "EX_POST"
  /** Né scelta né stimata: una formazione osservata, che si registra e basta. */
  | "OBSERVED";

export interface ReferencePolicyDescriptor {
  readonly id: ReferencePolicyId;
  /** Il nome della riga in §11.1, in italiano. */
  readonly name: string;
  /** La definizione, come la scrive §11.1. */
  readonly definition: string;
  /** Il ruolo che §11.1 le assegna nel confronto. */
  readonly role: string;
  readonly information: PolicyInformation;
  /**
   * `true` se la DECISIONE è calcolata in questo pacchetto. `false` non vuol
   * dire «non implementata di nascosto»: vuol dire che la decisione non nasce
   * qui, e `note` dice dove nasce.
   */
  readonly decidedHere: boolean;
  readonly note: string;
}

/**
 * IL CATALOGO COMPLETO DI §11.1 — sei righe, nessuna omessa e nessuna
 * inventata. Le righe che questo pacchetto non decide restano nel catalogo con
 * il motivo scritto: un catalogo che elenca solo ciò che si sa fare fa sembrare
 * completo un confronto che non lo è.
 */
export const REFERENCE_POLICIES: readonly ReferencePolicyDescriptor[] = [
  {
    id: "BEST_EX_POST",
    name: "Migliore a posteriori",
    definition: "a voti noti, la formazione legale con il massimo obiettivo",
    role: "tetto",
    information: "EX_POST",
    decidedHere: true,
    note:
      "È `bestLineupExPost`, e usa informazioni che prima della scadenza non esistevano: " +
      "serve a misurare il rimpianto, MAI come bersaglio di una proposta.",
  },
  {
    id: "TOP_ELEVEN_BY_SEASON_AVERAGE",
    name: "Migliori 11 per fantamedia",
    definition:
      "per modulo, i giocatori con la fantamedia più alta della stagione in corso " +
      "(giornata 1: stagione precedente), modulo con somma maggiore, senza avversario",
    role: "pavimento",
    information: "EX_ANTE",
    decidedHere: true,
    note:
      "La fantamedia NON si calcola qui: è un ingresso dichiarato, con la sua provenienza. " +
      "Questo pacchetto non ha voti storici e non deve averli.",
  },
  {
    id: "RULE_OF_72",
    name: "Regola dei 72",
    definition: "massimizza P(punteggio >= 72) senza avversario (§2.2)",
    role: "riferimento di Pico",
    information: "EX_ANTE",
    decidedHere: true,
    note:
      "È la politica che Pico ha chiesto di mettere ALLA PROVA, non di adottare: entra nel " +
      "confronto e diventa l'obiettivo solo se lo batte fuori campione (§1.2).",
  },
  {
    id: "BASE_ENGINE",
    name: "Base",
    definition: "§6.2 con obiettivo §3",
    role: "champion iniziale",
    information: "EX_ANTE",
    decidedHere: false,
    note:
      "La DECISIONE è `proposeLineup`, che sta in questo pacchetto; ciò che rende «base» questa " +
      "riga è la PREVISIONE di §6.2 — voti storici, decadimento, shrink — che è WP-4 e vive nel " +
      "layer privato. Qui la si riceve dichiarata dal chiamante e non si finge di produrla.",
  },
  {
    id: "RICH_ENGINE",
    name: "Ricco",
    definition: "§6.3 con obiettivo §3",
    role: "challenger",
    information: "EX_ANTE",
    decidedHere: false,
    note:
      "Stessa decisione della riga «Base» con la previsione di §6.3, che al 2026-09-07 non esiste " +
      "in nessun repository: §6.3 elenca FAMIGLIE CANDIDATE, mai ammesse a priori. Una politica " +
      "«ricca» costruita qui sarebbe un'approssimazione senza modello dietro.",
  },
  {
    id: "FIELDED",
    name: "Schierata",
    definition:
      "la formazione effettivamente inviata, quando differisce dalla proposta del champion " +
      "per intervento di Pico",
    role: "misura dell'override, fuori dal criterio §2.4",
    information: "OBSERVED",
    decidedHere: false,
    note:
      "Non è una regola di decisione: è un'osservazione. La funzione qui sotto la registra con la " +
      "sua targa e non la ottimizza, perché ottimizzare l'override significherebbe cancellarlo.",
  },
];

export function referencePolicy(id: ReferencePolicyId): ReferencePolicyDescriptor {
  const found = REFERENCE_POLICIES.find((policy) => policy.id === id);
  if (found === undefined) {
    throw new Error(
      `politica di riferimento sconosciuta: ${String(id)}. §11.1 ne elenca sei, e sono in REFERENCE_POLICIES.`,
    );
  }
  return found;
}

/** Che cosa una politica consegna. La stessa forma per tutte: è il confronto. */
export interface ReferencePolicyLineup {
  readonly policy: ReferencePolicyId;
  readonly information: PolicyInformation;
  readonly lineup: Lineup | null;
  readonly feasible: boolean;
  readonly reason: string;
  /** Quante formazioni la politica ha valutato per arrivare a questa. */
  readonly evaluated: number;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * LA SOGLIA DELLA REGOLA DEI 72, DERIVATA DAL REGOLAMENTO E NON SCRITTA A MANO.
 *
 * Pico l'ha detta così: «*credo che dovremmo puntare a stare sopra i due gol
 * partita… stare sempre sopra i 72 paghi di più*». I due gol e i 72 sono la
 * stessa cosa perché §15 li lega: il primo goal arriva a 66 e ogni fascia è
 * larga 6, quindi il secondo goal arriva esattamente a 72. Scriverlo come somma
 * delle due costanti del regolamento invece che come numero significa che il
 * giorno in cui la lega cambiasse le fasce questa politica seguirebbe la lega e
 * non resterebbe indietro con un 72 che non vuol più dire «due gol».
 *
 * Il confronto è `>= 72`: è la definizione operativa che §2.2 registra
 * («massimizzare la probabilità che il nostro punteggio sia >= 72, senza
 * guardare l'avversario»), non una lettura del «sopra» della frase.
 */
export const RULE_OF_72_TARGET_GOALS = 2 as const;
export const RULE_OF_72_THRESHOLD: number =
  FIRST_GOAL_THRESHOLD + GOAL_BAND_WIDTH * (RULE_OF_72_TARGET_GOALS - 1);

/**
 * UNA POLITICA DI RIFERIMENTO NON SI MISURA SU UNA FORMAZIONE VINCOLATA.
 *
 * I vincoli del fantallenatore sono volontà, non informazione (dichiarazione 5
 * del produttore): una politica che li rispettasse misurerebbe Pico, e una che
 * li ignorasse consegnerebbe una formazione che il fantallenatore crede
 * impossibile. Nessuna delle due è il confronto di §11, che mette a paragone
 * REGOLE DI DECISIONE. La riga che misura l'intervento di Pico esiste già ed è
 * «Schierata».
 */
function assertNoConstraints(constraints: LineupConstraints | undefined, policy: string): void {
  if (constraints === undefined) return;
  const active =
    constraints.locked || constraints.lockedModule !== undefined || constraints.lockedStarterIds.length > 0;
  if (!active) return;
  throw new Error(
    `${policy}: la politica di riferimento non si calcola su ingressi vincolati. I vincoli del ` +
      "fantallenatore sono volontà, non informazione: rispettarli misurerebbe Pico invece della regola di " +
      "decisione, e ignorarli produrrebbe una formazione che lui crede impossibile. Il confronto di §11.1 " +
      "misura l'intervento di Pico con la riga «Schierata», non piegando le altre politiche.",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IL TETTO — EX-POST, e il nome lo dice tre volte.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gli ingressi del TETTO: i voti VERI della giornata, non una previsione. Il
 * tipo è diverso da `LineupProposalInput` apposta — non è un'inconvenienza, è
 * la guardia: una politica ex-ante non può ricevere questi campi per sbaglio, e
 * questa non può ricevere previsioni.
 */
export interface ExPostCeilingInput {
  /** Le righe di giornata della nostra rosa, a voti noti. */
  readonly squadLines: readonly PlayerLine[];
  /** La formazione VERA dell'avversario, letta dopo la giornata. */
  readonly theirLineup: Lineup;
  /** Le righe di giornata di tutti, nostre e loro. */
  readonly players: ReadonlyMap<string, PlayerLine>;
  readonly context: GameweekContext;
  /** Omesso: i punti di lega dichiarati. `null`: l'ordinamento surrogato. */
  readonly points?: DeclaredLeaguePoints | null;
}

/**
 * IL TETTO A VOTI NOTI. Non è una politica giocabile e non deve mai comparire
 * come proposta: è il termine di paragone del rimpianto (§11.2).
 *
 * Non riscrive nulla: chiama `bestLineupExPost`, che è dove quella ricerca vive.
 */
export function bestElevenExPostPolicy(input: ExPostCeilingInput): ReferencePolicyLineup & {
  readonly exPost: BestLineupResult;
} {
  const result = bestLineupExPost({
    squad: input.squadLines,
    theirLineup: input.theirLineup,
    players: input.players,
    context: input.context,
    ...(input.points === undefined ? {} : { points: input.points }),
  });
  return {
    policy: "BEST_EX_POST",
    information: "EX_POST",
    lineup: result.lineup,
    feasible: result.feasible,
    reason:
      "TETTO EX-POST, non una proposta: scelto A VOTI NOTI, cioè con informazioni che prima della " +
      `scadenza non esistevano. ${result.reason}`,
    evaluated: result.evaluated,
    exPost: result,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IL PAVIMENTO — migliori 11 per fantamedia.
// ─────────────────────────────────────────────────────────────────────────────

/** La fantamedia di un giocatore, come la dichiara chi l'ha calcolata. */
export interface SeasonAverage {
  readonly playerId: string;
  readonly average: number;
}

export interface TopElevenBySeasonAverageInput {
  /** GLI STESSI INGRESSI DEL PRODUTTORE: la politica sceglie sulla stessa rosa. */
  readonly proposal: LineupProposalInput;
  /** La fantamedia di ogni giocatore della NOSTRA rosa. Nessuna può mancare. */
  readonly seasonAverages: readonly SeasonAverage[];
  /**
   * DA DOVE VIENE la fantamedia, in chiaro: §11.1 dice «stagione in corso», e
   * «giornata 1: stagione precedente». Quale delle due sia lo sa chi l'ha
   * calcolata, non questo modulo: la dichiarazione finisce nella ragione, così
   * chi legge una tabella di confronto sa quale stagione ha prodotto il
   * pavimento invece di doverlo indovinare.
   */
  readonly averagesProvenance: string;
}

/** Ordine dichiarato: valore decrescente, poi id crescente. Nient'altro. */
function byValueThenId(value: (f: PlayerForecast) => number) {
  return (a: PlayerForecast, b: PlayerForecast): number => {
    const delta = value(b) - value(a);
    if (delta !== 0) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

interface ElevenByValue {
  readonly keeperId: string;
  readonly starterIds: readonly string[];
  readonly total: number;
}

/**
 * Gli undici di un modulo scelti per valore: il migliore fra i portieri e i
 * migliori di ciascun ruolo di movimento. `null` quando la rosa non riempie il
 * modulo — che non è un errore, è un modulo non praticabile.
 */
function bestElevenForModule(
  module: Module,
  candidates: readonly PlayerForecast[],
  value: (f: PlayerForecast) => number,
): ElevenByValue | null {
  const shape = moduleShape(module);
  const sorted = [...candidates].sort(byValueThenId(value));
  const ofRole = (role: Role): PlayerForecast[] => sorted.filter((f) => f.role === role);
  const keeper = ofRole("P")[0];
  if (keeper === undefined) return null;
  const wanted: ReadonlyArray<readonly [Role, number]> = [
    ["D", shape.defenders],
    ["C", shape.midfielders],
    ["A", shape.strikers],
  ];
  const starters: PlayerForecast[] = [];
  for (const [role, n] of wanted) {
    const pool = ofRole(role);
    if (pool.length < n) return null;
    for (const f of pool.slice(0, n)) starters.push(f);
  }
  return {
    keeperId: keeper.id,
    starterIds: starters.map((f) => f.id),
    total: [keeper, ...starters].reduce((sum, f) => sum + value(f), 0),
  };
}

/**
 * MIGLIORI 11 PER FANTAMEDIA — il pavimento di §11.1.
 *
 * QUESTA POLITICA È CIECA, E LA SUA CECITÀ È IL PUNTO. Non guarda l'avversario
 * (lo dice §11.1), non guarda la previsione della giornata e — lettura
 * dichiarata di chi scrive, contestabile — non guarda nemmeno la
 * DISPONIBILITÀ: §11.1 la definisce sui soli valori di fantamedia, e §11.3 la
 * usa per costruire le formazioni di rose fittizie dove la disponibilità è un
 * oracolo. Aggiungerle un filtro sugli infortunati la renderebbe una politica
 * migliore, e quindi un pavimento più alto di quello che il disegno ha
 * scelto: il confronto ne uscirebbe più severo per il motore senza che nessuno
 * l'abbia deciso. Se un giorno si vorrà quel filtro, sarà un'altra riga di
 * §11.1, non questa cambiata di nascosto.
 *
 * IL MODULO si sceglie per somma maggiore delle undici fantamedie; a parità
 * vince il primo nell'ordine dichiarato di `MODULES`. L'ORDINE DELLA PANCHINA
 * lo sceglie questa funzione — il disegno tace, e una formazione senza panchina
 * non è consegnabile — con lo stesso criterio degli undici, fantamedia
 * decrescente e poi id crescente. È una scelta di chi scrive, dichiarata qui e
 * nella ragione, non una regola di lega.
 */
export function topElevenBySeasonAveragePolicy(
  input: TopElevenBySeasonAverageInput,
): ReferencePolicyLineup {
  const { proposal, seasonAverages, averagesProvenance } = input;
  assertNoConstraints(proposal.constraints, "migliori 11 per fantamedia");
  if (typeof averagesProvenance !== "string" || averagesProvenance.trim().length === 0) {
    throw new Error(
      "migliori 11 per fantamedia: la provenienza della fantamedia non è dichiarata. §11.1 la vuole " +
        "«della stagione in corso (giornata 1: stagione precedente)»: quale delle due sia lo sa chi l'ha " +
        "calcolata, e un pavimento senza la stagione che lo ha prodotto non è confrontabile con niente.",
    );
  }

  const averages = new Map<string, number>();
  for (const entry of seasonAverages) {
    if (averages.has(entry.playerId)) {
      throw new Error(
        `migliori 11 per fantamedia: fantamedia dichiarata due volte per ${entry.playerId}. Due valori ` +
          "per lo stesso giocatore non sono un dato più ricco: sono una richiesta che non si sa leggere.",
      );
    }
    if (!Number.isFinite(entry.average)) {
      throw new Error(
        `migliori 11 per fantamedia: fantamedia non finita per ${entry.playerId} ` +
          `(${String(entry.average)}).`,
      );
    }
    averages.set(entry.playerId, entry.average);
  }

  // La preparazione convalida gli ingressi del produttore con le stesse regole:
  // la politica del pavimento sceglie sulla stessa rosa, o non è un confronto.
  const prepared = prepareGameweek(proposal);
  const squad = prepared.squad;

  const missing = squad.filter((f) => !averages.has(f.id)).map((f) => f.id);
  if (missing.length > 0) {
    throw new Error(
      `migliori 11 per fantamedia: fantamedia mancante per ${missing.join(", ")}. Non si sostituisce con ` +
        "il punteggio atteso della previsione, che è un'altra cosa — quello è ciò che pensiamo di QUESTA " +
        "giornata, la fantamedia è ciò che il giocatore ha reso finora — e non si sostituisce con uno zero, " +
        "che manderebbe in panchina un titolare per un dato mancante invece che per una scelta.",
    );
  }
  const value = (f: PlayerForecast): number => averages.get(f.id) as number;

  let best: { module: Module; eleven: ElevenByValue } | null = null;
  const unusable: string[] = [];
  for (const module of MODULES) {
    const eleven = bestElevenForModule(module, squad, value);
    if (eleven === null) {
      unusable.push(module);
      continue;
    }
    // Somma maggiore; a parità vince il primo modulo dell'ordine dichiarato,
    // perché `>` non sostituisce il precedente a parità.
    if (best === null || eleven.total > best.eleven.total) best = { module, eleven };
  }
  if (best === null) {
    return {
      policy: "TOP_ELEVEN_BY_SEASON_AVERAGE",
      information: "EX_ANTE",
      lineup: null,
      feasible: false,
      reason:
        `nessuno dei sette moduli di §9 è riempibile con questa rosa (${unusable.join(", ")}): ` +
        "il pavimento non esiste per questa giornata, e non lo si costruisce con dieci giocatori.",
      evaluated: 0,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  const chosen = new Set([best.eleven.keeperId, ...best.eleven.starterIds]);
  const bench = [...squad]
    .filter((f) => !chosen.has(f.id))
    .sort(byValueThenId(value))
    .map((f) => f.id);
  const lineup = buildLineupFromPlan(
    {
      module: best.module,
      keeperId: best.eleven.keeperId,
      starterIds: best.eleven.starterIds,
      benchIds: bench,
    },
    prepared.byId,
  );

  // La legalità si verifica, non si dà per scontata: se questa formazione non
  // fosse schierabile il difetto sarebbe di questa funzione, non del dato.
  const violations = lineupViolations(lineup, prepared.expectedPlayers);
  if (violations.length > 0) {
    throw new Error(
      `bug del pavimento: la formazione per fantamedia non è legale (${violations.join("; ")}). ` +
        "Gli ingressi erano già stati convalidati dalla preparazione.",
    );
  }

  return {
    policy: "TOP_ELEVEN_BY_SEASON_AVERAGE",
    information: "EX_ANTE",
    lineup,
    feasible: true,
    reason:
      `migliori 11 per fantamedia (${averagesProvenance}), modulo ${best.module} con somma ` +
      `${best.eleven.total} — la maggiore fra i moduli riempibili, parità rotta dall'ordine dichiarato di ` +
      "MODULES. Nessuno sguardo all'avversario, alla previsione di giornata o alla disponibilità: è il " +
      "pavimento di §11.1, e la sua cecità è la sua definizione. Ordine della panchina scelto da questa " +
      "funzione — fantamedia decrescente, poi id — perché il disegno tace e una formazione senza panchina " +
      "non è consegnabile.",
    evaluated: MODULES.length - unusable.length,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA REGOLA DEI 72 — la politica che Pico ha chiesto di mettere alla prova.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * REGOLA DEI 72 — massimizza `P(punteggio nostro >= 72)`, §2.2.
 *
 * NON È L'OBIETTIVO DEL COACH, ED È PER QUESTO CHE ESISTE. Pico l'ha proposta
 * («*stare sempre sopra i 72 paghi di più*») e ha scelto in modale di metterla
 * ALLA PROVA nel confronto storico invece di adottarla: se batte l'obiettivo
 * fuori campione diventa l'obiettivo, altrimenti resta un termine di paragone.
 * L'obiezione registrata in §2.2 è una sola e pesa: la regola GUARDA SOLO IL
 * NOSTRO PUNTEGGIO e ignora l'avversario. Due casi in cui tradisce, entrambi
 * scritti nel disegno: avversario a un goal (si vince a 68, e il rischio per
 * arrivare a 72 non compra niente) e avversario a 76 — dove 72 pieni PERDONO
 * 2-3, perché §15 dà un goal in più a chi sta nella stessa fascia con almeno 4
 * punti di distacco. Il test `la regola dei 72 perde il caso «avversario a 76»`
 * è quel caso, ed è il cuore di questo pacchetto.
 *
 * «SENZA AVVERSARIO» È UNA PROPRIETÀ DELL'OBIETTIVO, NON DELL'ARITMETICA, e la
 * distinzione va dichiarata perché è facile leggerla male. Il nostro punteggio
 * NON è calcolabile senza la formazione avversaria: §20 confronta i voti base
 * dei due centrocampi (e aggiunge voti fittizi da 5 a chi ne schiera meno) e §9
 * ci regala i punti del modulo altrui. Quindi l'avversario entra qui come
 * ingresso del simulatore — non c'è modo di toglierlo senza inventare un'altra
 * lega — e NON entra in ciò che si massimizza: la politica non guarda mai se
 * vince, se pareggia o di quanto perde. Chi volesse una regola davvero cieca
 * all'avversario dovrebbe prima riscrivere §20, che non è un lavoro di questo
 * pacchetto.
 *
 * LA RICERCA È QUELLA DEL PRODUTTORE, E DI PROPOSITO. Stesso vicinato, stessa
 * chiave di rottura dei pareggi, stesso tetto di iterazioni, stessi scenari:
 * fra questa politica e il motore cambia UNA cosa sola, ciò che si massimizza.
 * Se cambiasse anche la ricerca, un confronto perso non direbbe più se ha perso
 * l'obiettivo o l'algoritmo. L'innesco invece NON è quello del produttore —
 * `bestLineupExPost` innesca sull'obiettivo §3, che guarda l'avversario — e
 * parte dai migliori undici per punteggio atteso di ciascun modulo, che è la
 * partenza più vicina allo spirito della regola.
 */
export function ruleOf72Policy(input: LineupProposalInput): ReferencePolicyLineup & {
  /** P(punteggio nostro >= 72) della formazione consegnata. */
  readonly probability: number;
  readonly scenarios: number;
  readonly method: "exact" | "sampled";
  readonly seed: number | null;
  /** `true` se la salita si è fermata sul tetto invece che su un ottimo locale. */
  readonly refinementCapReached: boolean;
} {
  assertNoConstraints(input.constraints, "regola dei 72");
  const prepared = prepareGameweek(input);
  const { squad, byId, context, opponentLineups } = prepared;
  const scenarios = prepared.scenarios();

  let evaluated = 0;
  /** P(punteggio nostro >= 72): l'unica cosa che questa politica guarda. */
  const probabilityOf = (lineup: Lineup): number => {
    evaluated += 1;
    let mass = 0;
    for (const scenario of scenarios) {
      const outcome = simulateGameweek({
        ourLineup: lineup,
        theirLineup: opponentLineups[scenario.opponentIndex] as Lineup,
        players: scenario.players,
        context,
      });
      if (outcome.ours.total >= RULE_OF_72_THRESHOLD) mass += scenario.weight;
    }
    return mass;
  };

  // Chi non prende voto in nessuno scenario non entra fra i titolari: sarebbe
  // un senza voto certo, e la stessa guardia vale nel vicinato del produttore.
  const eligible = squad.filter((f) => f.voteProbability > 0);
  const planFor = (module: Module): LineupPlan | null => {
    const eleven = bestElevenForModule(module, eligible, (f) => f.expected.fantasyScore);
    if (eleven === null) return null;
    const chosen = new Set([eleven.keeperId, ...eleven.starterIds]);
    return {
      module,
      keeperId: eleven.keeperId,
      starterIds: eleven.starterIds,
      benchIds: startingBench(squad, chosen),
    };
  };

  let current: { plan: LineupPlan; lineup: Lineup; probability: number } | null = null;
  for (const module of MODULES) {
    const plan = planFor(module);
    if (plan === null) continue;
    const lineup = buildLineupFromPlan(plan, byId);
    const probability = probabilityOf(lineup);
    if (
      current === null ||
      probability > current.probability ||
      (probability === current.probability && tieBreakKey(lineup) < tieBreakKey(current.lineup))
    ) {
      current = { plan, lineup, probability };
    }
  }
  if (current === null) {
    return {
      policy: "RULE_OF_72",
      information: "EX_ANTE",
      lineup: null,
      feasible: false,
      reason:
        "nessuno dei sette moduli di §9 è riempibile con i giocatori che possono prendere voto: la " +
        "regola dei 72 non ha nessuna formazione da valutare.",
      evaluated,
      probability: 0,
      scenarios: scenarios.length,
      method: prepared.method,
      seed: prepared.seed,
      refinementCapReached: false,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  // Salita a vicinato, identica a quella del produttore tranne che nel criterio.
  const noLocks: ReadonlySet<string> = new Set<string>();
  let iterations = 0;
  let capReached = false;
  for (;;) {
    if (iterations >= MAX_REFINEMENT_ITERATIONS) {
      capReached = true;
      break;
    }
    let bestMove: { plan: LineupPlan; lineup: Lineup; probability: number } | null = null;
    for (const plan of neighbours(current.plan, squad, byId, noLocks, undefined)) {
      const lineup = buildLineupFromPlan(plan, byId);
      const probability = probabilityOf(lineup);
      if (
        bestMove === null ||
        probability > bestMove.probability ||
        (probability === bestMove.probability && tieBreakKey(lineup) < tieBreakKey(bestMove.lineup))
      ) {
        bestMove = { plan, lineup, probability };
      }
    }
    // Solo un miglioramento STRETTO muove la ricerca: fra formazioni che valgono
    // uguale la chiave di rottura sceglie, non fa camminare.
    if (bestMove === null || bestMove.probability <= current.probability) break;
    current = bestMove;
    iterations += 1;
  }

  const violations = lineupViolations(current.lineup, prepared.expectedPlayers);
  if (violations.length > 0) {
    throw new Error(
      `bug della regola dei 72: la formazione proposta non è legale (${violations.join("; ")}). ` +
        "Gli ingressi erano già stati convalidati dalla preparazione.",
    );
  }

  return {
    policy: "RULE_OF_72",
    information: "EX_ANTE",
    lineup: current.lineup,
    feasible: true,
    reason:
      `regola dei 72: massimizzata P(punteggio nostro >= ${RULE_OF_72_THRESHOLD}) = ` +
      `${current.probability} su ${scenarios.length} scenari (${prepared.method}), ${iterations} ` +
      "mossa/e accettata/e. L'avversario entra nel calcolo del NOSTRO punteggio perché §20 e §9 lo " +
      "impongono, e non entra in ciò che si massimizza: questa politica non guarda mai il risultato. " +
      "NON è l'obiettivo del Coach — è la politica che Pico ha chiesto di mettere alla prova (§1.2)" +
      (capReached
        ? `; TETTO DI ${MAX_REFINEMENT_ITERATIONS} ITERAZIONI RAGGIUNTO: la salita non è convergente`
        : ""),
    evaluated,
    probability: current.probability,
    scenarios: scenarios.length,
    method: prepared.method,
    seed: prepared.seed,
    refinementCapReached: capReached,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LE DUE RIGHE CHE QUESTO PACCHETTO NON DECIDE — e non per questo si omettono.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LE RIGHE «BASE» E «RICCO» DI §11.1, che sono la STESSA regola di decisione con
 * previsioni diverse: `proposeLineup` con l'obiettivo §3. Ciò che le distingue —
 * §6.2 contro §6.3 — sta tutto nella previsione che arriva dentro
 * `LineupProposalInput`, e questo pacchetto non la produce né sa riconoscerla.
 *
 * Per questo il motore che ha prodotto la previsione lo DICHIARA il chiamante, e
 * la dichiarazione finisce nella ragione com'è: una targa, non una verifica.
 * Attribuire una previsione al motore sbagliato sporcherebbe il ledger di §2.4,
 * dove il champion si decide contando le giornate di ciascuno.
 */
export function engineProposalPolicy(
  input: LineupProposalInput,
  forecastEngine: "BASE_ENGINE" | "RICH_ENGINE",
): ReferencePolicyLineup & { readonly proposal: ReturnType<typeof proposeLineup> } {
  if (forecastEngine !== "BASE_ENGINE" && forecastEngine !== "RICH_ENGINE") {
    throw new Error(
      `motore della previsione non dichiarato o sconosciuto: ${String(forecastEngine)}. §11.1 ha due ` +
        "righe di motore, «Base» (§6.2) e «Ricco» (§6.3), e chi chiama sa quale previsione ha passato.",
    );
  }
  const proposal = proposeLineup(input);
  const descriptor = referencePolicy(forecastEngine);
  return {
    policy: forecastEngine,
    information: "EX_ANTE",
    lineup: proposal.lineup,
    feasible: proposal.feasible,
    reason:
      `riga «${descriptor.name}» di §11.1: decisione di \`proposeLineup\` con l'obiettivo §3, su una ` +
      `previsione DICHIARATA dal chiamante come ${descriptor.definition}. Questo pacchetto non verifica ` +
      `la provenienza della previsione: la trascrive. ${proposal.reason}`,
    evaluated: proposal.evaluated,
    proposal,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * LA RIGA «SCHIERATA»: la formazione davvero inviata. Non è una regola di
 * decisione ed è l'unica del catalogo che non sceglie niente — serve a misurare
 * l'override di Pico, e per misurarlo bisogna registrarlo com'è. Riordinarla,
 * riottimizzarla o «sistemarla» significherebbe cancellare proprio la
 * differenza che questa riga esiste per misurare.
 */
export function fieldedLineupPolicy(input: {
  readonly lineup: Lineup;
  /** Perché è stata inviata questa e non la proposta del champion. */
  readonly note: string;
}): ReferencePolicyLineup {
  if (typeof input.note !== "string" || input.note.trim().length === 0) {
    throw new Error(
      "formazione schierata: manca la nota che dice perché è stata inviata questa e non la proposta del " +
        "champion. §11.1 la definisce «quando differisce dalla proposta del champion per intervento di " +
        "Pico»: senza il motivo, la riga misura una differenza di cui nessuno saprà la causa.",
    );
  }
  return {
    policy: "FIELDED",
    information: "OBSERVED",
    lineup: input.lineup,
    feasible: true,
    reason: `formazione OSSERVATA, non scelta da nessuna regola: ${input.note}`,
    evaluated: 0,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}
