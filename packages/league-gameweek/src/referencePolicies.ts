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
// `ExPostCeilingInput`, che chiede righe `ObservedPlayerLine` — voti
// OSSERVATI, non una previsione — e porta `ExPost` nel nome della funzione, nel
// campo `information` e nella ragione che restituisce.
//
// ── QUESTA RIGA DICEVA PIÙ DI QUEL CHE MANTENEVA, FINO AL 2026-09-07 ────────
//
// Fin qui il capoverso chiudeva così: «passare l'uno dove va l'altro non
// compila». DICHIARAVA una garanzia del compilatore, ed era vera solo a metà.
// Una review indipendente del 2026-09-07 ha verificato quale metà mancava: il
// tetto chiedeva `PlayerLine`, che è lo STESSO IDENTICO SHAPE sia che venga da
// `expectedLine()` del produttore sia che venga da un parser di voti veri.
// Passare `prepared.expectedSquadLines` / `prepared.expectedPlayers` a
// `bestElevenExPostPolicy` compilava, e restituiva un «tetto» costruito sulla
// previsione. Non un errore: un numero plausibile — la classe di guasto
// peggiore, perché non ha sintomi.
//
// PERCHÉ QUEL VARCO COSTAVA CARO. Il tetto entra nel RIMPIANTO (§2.4), e il
// rimpianto è il numero con cui il motore ricco entra o non entra in campo da
// solo. Un tetto contaminato dalla previsione è più BASSO del vero, quindi il
// rimpianto è più basso del vero, quindi il motore sembra migliore di quanto
// sia: il difetto non avrebbe prodotto un guasto, avrebbe prodotto una
// promozione ingiustificata che nessuno vede.
//
// COSA LO RENDE VERO ADESSO. `ObservedPlayerLine` non è `PlayerLine` con un
// commento sopra: è `PlayerLine` più un `origin: "OBSERVED"` leggibile e più un
// SIGILLO che nessun letterale può nominare, perché il simbolo che gli fa da
// chiave non è esportato. L'unica porta è `observedLines()`, che pretende la
// provenienza dei voti e la scrive nella ragione del tetto. Una riga di
// previsione non è assegnabile a una osservata: `tsc --noEmit` — il primo
// comando di `npm run verify` — la rifiuta, e le guardie di tipo in fondo al
// blocco del tetto pinnano proprio quel rifiuto. Restare onesti costa una
// chiamata; barare costa una bugia scritta a mano nella provenienza, che si
// vede nel diff e resta stampata nella ragione della politica.
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
      "Questo pacchetto non ha voti storici e non deve averli. Dal 2026-09-08 (decisione di Pico) il " +
      "pavimento NON schiera chi ha probabilità di voto zero: fino a quel giorno lo faceva, e un pavimento " +
      "che spreca un posto su un assente certo è più facile da battere — cioè un metro compiacente.",
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
 * IL SIGILLO DELLE RIGHE OSSERVATE — e il motivo per cui NON è esportato.
 *
 * `PlayerLine` non distingue un voto letto da un voto previsto: è la stessa
 * forma, e nessun controllo di runtime potrebbe separarli, perché a voti noti e
 * a previsione i campi sono gli stessi numeri. L'unica separazione possibile è
 * NOMINALE, e in TypeScript si ottiene con una chiave che il chiamante non può
 * scrivere: questo simbolo esiste solo nel tipo — `declare const` non emette
 * niente — e vive solo dentro questo modulo. Fuori di qui nessun letterale può
 * nominarlo, quindi nessun letterale può fabbricare una riga osservata.
 *
 * È una proprietà FANTASMA: a runtime non esiste, e non deve esistere. Non
 * serve a controllare qualcosa dopo, serve a impedirlo prima.
 */
declare const OBSERVED_VOTE_SEAL: unique symbol;

/**
 * UNA RIGA DI GIORNATA A VOTI OSSERVATI. È una `PlayerLine` a tutti gli effetti
 * — il simulatore la legge com'è — più due cose che una previsione non ha e non
 * può darsi da sola:
 *
 * - `origin` e `provenance`, LEGGIBILI: sopravvivono a un dump, a un JSON, a un
 *   log, e dicono a chi guarda un numero da dove vengono i voti che l'hanno
 *   prodotto;
 * - il sigillo, INVISIBILE a runtime e invalicabile a compilazione: è ciò che
 *   rende il tipo nominale invece che strutturale, cioè ciò che fa fallire
 *   `tsc --noEmit` su una riga di previsione passata al tetto.
 *
 * Le due cose insieme, e non una sola: `origin` da solo lo scriverebbe chiunque
 * in un letterale, il sigillo da solo non si vedrebbe leggendo un risultato.
 */
export interface ObservedPlayerLine extends PlayerLine {
  /** Voti letti dopo la giornata. Non c'è un altro valore: non è una scelta. */
  readonly origin: "OBSERVED";
  /** Chi ha pubblicato questi voti, come lo dichiara chi li ha letti. */
  readonly provenance: string;
  readonly [OBSERVED_VOTE_SEAL]: true;
}

/**
 * L'UNICA PORTA per ottenere righe osservate, e il posto in cui la provenienza
 * si dichiara invece di essere sottintesa.
 *
 * Le righe devono venire da un PARSER DI VOTI VERI — la lettura della giornata,
 * che in questo repository non vive (il core pubblico non acquisisce dati) e
 * arriva dal layer privato — mai da `expectedLine()` o da
 * `prepareGameweek(...).expectedSquadLines`, che sono la previsione.
 *
 * Questo modulo non può VERIFICARLO: una riga letta e una riga prevista hanno
 * gli stessi campi, e nessun controllo saprebbe dire quale delle due ha in
 * mano. Quindi fa l'unica cosa onesta — la stessa che il pavimento fa con la
 * fantamedia, e che `engineProposalPolicy` fa con il motore della previsione:
 * PRETENDE una targa e la porta fino in fondo, dentro la ragione della
 * politica. Chi passasse di qui una previsione non incapperebbe più in una
 * svista di tipi: dovrebbe scrivere a mano una provenienza falsa, che resta nel
 * diff e resta stampata sotto il numero che ha prodotto.
 */
export function observedLines(input: {
  /** Le righe lette dopo la giornata: nostre, loro, o entrambe. */
  readonly lines: readonly PlayerLine[];
  /** Da dove vengono i voti, in chiaro. */
  readonly provenance: string;
}): readonly ObservedPlayerLine[] {
  const { lines, provenance } = input;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    throw new Error(
      "righe osservate: la provenienza dei voti non è dichiarata. Il tetto ex-post ha senso solo se è " +
        "costruito su voti REALMENTE OSSERVATI, e questo modulo non può distinguerli da una previsione — " +
        "hanno gli stessi campi. La provenienza è ciò che rende la differenza leggibile a chi guarderà il " +
        "rimpianto: senza, il tetto sarebbe un numero senza mondo dietro.",
    );
  }
  const declared = provenance.trim();
  return lines.map(
    (line) => ({ ...line, origin: "OBSERVED", provenance: declared }) as ObservedPlayerLine,
  );
}

/** Le righe osservate indicizzate per id, nella forma che il simulatore vuole. */
export function observedPlayerMap(
  lines: readonly ObservedPlayerLine[],
): ReadonlyMap<string, ObservedPlayerLine> {
  const map = new Map<string, ObservedPlayerLine>();
  for (const line of lines) {
    const previous = map.get(line.id);
    if (previous !== undefined) {
      throw new Error(
        `righe osservate: due righe di giornata per ${line.id}. Due voti per lo stesso giocatore non ` +
          "sono un dato più ricco: sono una lettura che non si sa comporre, e il tetto non deve sceglierne " +
          "una in silenzio.",
      );
    }
    map.set(line.id, line);
  }
  return map;
}

/**
 * Gli ingressi del TETTO: i voti OSSERVATI della giornata, non una previsione.
 * Il tipo è diverso da `LineupProposalInput` apposta — non è un'inconvenienza,
 * è la guardia: una politica ex-ante non può ricevere questi campi per sbaglio,
 * e questa non può ricevere previsioni, perché `PlayerLine` non è assegnabile a
 * `ObservedPlayerLine`. Fino al 2026-09-07 questi due campi erano `PlayerLine`,
 * e la garanzia era solo scritta nel commento in testa al file.
 */
export interface ExPostCeilingInput {
  /** Le righe di giornata della nostra rosa, a voti osservati. */
  readonly squadLines: readonly ObservedPlayerLine[];
  /** La formazione VERA dell'avversario, letta dopo la giornata. */
  readonly theirLineup: Lineup;
  /** Le righe di giornata di tutti, nostre e loro, a voti osservati. */
  readonly players: ReadonlyMap<string, ObservedPlayerLine>;
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
  // LA PROVENIENZA DEI VOTI VIAGGIA FINO ALLA RAGIONE, e non si ferma al tipo.
  // Il sigillo impedisce l'errore di integrazione; la targa serve a chi, mesi
  // dopo, leggerà un rimpianto in tabella e dovrà sapere su quali voti quel
  // tetto è stato costruito senza risalire al chiamante. Distinte e ordinate:
  // nostre righe e righe avversarie possono venire da letture diverse.
  const declared = [
    ...new Set([...input.squadLines, ...input.players.values()].map((line) => line.provenance)),
  ].sort();
  return {
    policy: "BEST_EX_POST",
    information: "EX_POST",
    lineup: result.lineup,
    feasible: result.feasible,
    reason:
      "TETTO EX-POST, non una proposta: scelto A VOTI NOTI, cioè con informazioni che prima della " +
      "scadenza non esistevano. Voti OSSERVATI, provenienza dichiarata: " +
      `${declared.length === 0 ? "nessuna riga" : declared.join(" + ")}. ${result.reason}`,
    evaluated: result.evaluated,
    exPost: result,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

// ─── LE GUARDIE DI TIPO DEL TETTO ────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, cioè al PRIMO comando di `npm run verify`, senza
// eseguire una riga di vitest; e vivono ACCANTO alla dichiarazione, quindi
// finiscono nello stesso hunk di diff di chi riaprisse la porta. Stessa
// famiglia delle tre guardie di `packages/opponent-profiles/src/expectedSpend.ts`
// e con lo stesso limite dichiarato: chi vuole riaprire il varco può cancellare
// anche queste righe — ma allora lo sta facendo APPOSTA, sotto gli occhi di chi
// rilegge il diff, e non per una svista di tipi che compilava.

/**
 * UNA RIGA DI PREVISIONE NON È UNA RIGA OSSERVATA. È esattamente il varco che
 * fino al 2026-09-07 era aperto: `PlayerLine` — ciò che `expectedLine()`
 * produce — non deve essere assegnabile a `ObservedPlayerLine`.
 */
type AssertForecastLineIsNotObserved = PlayerLine extends ObservedPlayerLine ? never : true;
const _forecastLineIsNotObserved: AssertForecastLineIsNotObserved = true;
void _forecastLineIsNotObserved;

/**
 * ...e nell'altro verso invece sì: una riga osservata RESTA una riga di
 * giornata, altrimenti il simulatore e l'ottimizzatore non potrebbero leggerla
 * e la separazione sarebbe stata comprata con una copia dell'aritmetica.
 */
type AssertObservedLineIsAPlayerLine = ObservedPlayerLine extends PlayerLine ? true : never;
const _observedLineIsAPlayerLine: AssertObservedLineIsAPlayerLine = true;
void _observedLineIsAPlayerLine;

/** E il tetto chiede proprio quelle: se un giorno tornasse a `PlayerLine`, qui è rosso. */
type AssertCeilingWantsObservedLines = readonly PlayerLine[] extends ExPostCeilingInput["squadLines"]
  ? never
  : true;
const _ceilingWantsObservedLines: AssertCeilingWantsObservedLines = true;
void _ceilingWantsObservedLines;

/** Anche dalla porta di servizio: la mappa di tutti, non solo l'elenco della rosa. */
type AssertCeilingWantsObservedMap = ReadonlyMap<string, PlayerLine> extends ExPostCeilingInput["players"]
  ? never
  : true;
const _ceilingWantsObservedMap: AssertCeilingWantsObservedMap = true;
void _ceilingWantsObservedMap;

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

/** Il nome del reparto in italiano: serve a chi legge un rifiuto, non al codice. */
const ROLE_DEPARTMENT: Readonly<Record<Role, string>> = {
  P: "portiere",
  D: "difensori",
  C: "centrocampisti",
  A: "attaccanti",
};

/** Un reparto che non si riempie: quanti ne chiede il modulo, quanti ce ne sono. */
interface RoleShortage {
  readonly role: Role;
  readonly needed: number;
  readonly available: number;
}

/**
 * L'esito di un modulo: gli undici, oppure i reparti che restano scoperti.
 *
 * PERCHÉ NON PIÙ `null`. Finché il pavimento sceglieva sull'intera rosa, «non
 * riempibile» voleva dire «la rosa è troppo corta», e chi leggeva il rifiuto lo
 * capiva da solo. Da quando il pavimento esclude chi certamente non prende voto
 * (2026-09-08), lo stesso `null` può voler dire due cose molto diverse — la
 * rosa è corta, oppure gli indisponibili hanno svuotato un reparto — e un
 * rifiuto che non distingue le due lascia chi guarda senza la sola informazione
 * che gli serve. Quindi il motivo viene fin qui, invece di essere ricostruito
 * a valle.
 */
type ElevenForModule =
  | { readonly ok: true; readonly eleven: ElevenByValue }
  | { readonly ok: false; readonly shortages: readonly RoleShortage[] };

/**
 * Gli undici di un modulo scelti per valore: il migliore fra i portieri e i
 * migliori di ciascun ruolo di movimento. Quando la rosa non riempie il modulo
 * non è un errore — è un modulo non praticabile — e l'esito dice QUALI reparti
 * mancano, tutti, non solo il primo incontrato: un rifiuto che si ferma al
 * primo buco farebbe credere risolvibile una rosa che ne ha tre.
 */
function bestElevenForModule(
  module: Module,
  candidates: readonly PlayerForecast[],
  value: (f: PlayerForecast) => number,
): ElevenForModule {
  const shape = moduleShape(module);
  const sorted = [...candidates].sort(byValueThenId(value));
  const ofRole = (role: Role): PlayerForecast[] => sorted.filter((f) => f.role === role);
  const wanted: ReadonlyArray<readonly [Role, number]> = [
    ["P", 1],
    ["D", shape.defenders],
    ["C", shape.midfielders],
    ["A", shape.strikers],
  ];
  const shortages: RoleShortage[] = [];
  const picked = new Map<Role, readonly PlayerForecast[]>();
  for (const [role, n] of wanted) {
    const pool = ofRole(role);
    if (pool.length < n) {
      shortages.push({ role, needed: n, available: pool.length });
      continue;
    }
    picked.set(role, pool.slice(0, n));
  }
  if (shortages.length > 0) return { ok: false, shortages };
  const keeper = (picked.get("P") ?? [])[0];
  if (keeper === undefined) return { ok: false, shortages: [{ role: "P", needed: 1, available: 0 }] };
  const starters: PlayerForecast[] = [];
  for (const role of ["D", "C", "A"] as const) {
    for (const f of picked.get(role) ?? []) starters.push(f);
  }
  return {
    ok: true,
    eleven: {
      keeperId: keeper.id,
      starterIds: starters.map((f) => f.id),
      total: [keeper, ...starters].reduce((sum, f) => sum + value(f), 0),
    },
  };
}

/**
 * CHI CERTAMENTE NON PRENDE VOTO — e perché la soglia è ZERO e non un numero
 * scelto da qualcuno.
 *
 * Zero è il solo caso che non richiede una decisione: la previsione dice che in
 * NESSUNO scenario quel giocatore riceve un voto, quindi schierarlo è regalare
 * un posto. Qualunque altra soglia — «sotto il 20 %», «sotto il 50 %» — sarebbe
 * una scelta di prodotto che nessuno ha preso e che il disegno non contiene:
 * chi un giorno la volesse la porti in modale, non qui.
 *
 * `prepareGameweek` ha già convalidato `voteProbability` dentro [0, 1], quindi
 * questo `=== 0` e il `<= 0` con cui il produttore definisce lo stesso concetto
 * (`neverPlays`) dicono esattamente la stessa cosa. Non si importa quella
 * funzione perché non è esportata e il produttore è fuori dallo scope di questa
 * modifica: questo commento è il posto in cui i due criteri si tengono
 * allineati, e chi cambiasse l'uno deve guardare l'altro.
 */
function certainlyAbsent(f: PlayerForecast): boolean {
  return f.voteProbability === 0;
}

/**
 * MIGLIORI 11 PER FANTAMEDIA — il pavimento di §11.1.
 *
 * QUESTA POLITICA È CIECA ALL'AVVERSARIO, E QUELLA CECITÀ È IL PUNTO. Non
 * guarda la formazione altrui (lo dice §11.1) e non guarda la previsione di
 * giornata: sceglie sui soli valori di fantamedia, e questa parte della
 * definizione non è cambiata e non deve cambiare.
 *
 * ── LA DISPONIBILITÀ: FINO AL 2026-09-08 IL PAVIMENTO NON LA GUARDAVA ───────
 *
 * Fin qui questa funzione schierava i migliori 11 per fantamedia ANCHE quando
 * la previsione diceva che uno di loro certamente non avrebbe preso voto. Era
 * una lettura dichiarata e contestabile: §11.1 definisce il pavimento sui soli
 * valori di fantamedia, e §11.3 lo usa su rose fittizie dove la disponibilità è
 * un oracolo.
 *
 * PERCHÉ NON REGGEVA. Il pavimento non è una politica qualsiasi: è uno dei
 * metri con cui il motore ricco si promuoverà da solo. Un pavimento che spreca
 * un posto su un assente certo è più FACILE DA BATTERE, quindi il motore
 * sembra migliore di quanto sia — la stessa classe di guasto del tetto
 * contaminato descritta in testa al file: nessun sintomo, solo un numero più
 * bello del vero e una promozione che nessuno vede arrivare.
 *
 * COSA FA ADESSO, E CHI L'HA DECISO. Pico ha scelto in modale il 2026-09-08:
 * il pavimento NON considera schierabile chi ha probabilità di voto ZERO. La
 * motivazione registrata è che un metro compiacente è peggio di nessun metro, e
 * che l'asticella deve essere quella che un fantallenatore ragionevole userebbe
 * davvero — nessuno schiera di proposito un infortunato certo. Gli esclusi non
 * spariscono dalla rosa: restano in panchina, dove il regolamento li lascia già
 * senza effetto (chi non ha voto non entra), e la ragione della politica dice
 * quanti sono e chi sono.
 *
 * LA SOGLIA È ZERO E NON È UNA SCELTA: vedi `certainlyAbsent`. Nessun «sotto il
 * 20 %», che sarebbe una decisione di prodotto che nessuno ha preso.
 *
 * FAIL-CLOSED. Se, tolti gli indisponibili certi, nessun modulo è più
 * riempibile, la politica RIFIUTA e dice quale reparto è scoperto. Non ripiega
 * sul comportamento vecchio e non riammette gli assenti per far tornare i
 * conti: un pavimento costruito riammettendoli sarebbe di nuovo il metro
 * compiacente che Pico ha appena tolto di mezzo, e per giunta in silenzio.
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

  // LA DISPONIBILITÀ, dal 2026-09-08 (decisione di Pico in modale). La
  // fantamedia si pretende da TUTTA la rosa — il controllo qui sopra non si
  // ammorbidisce — perché il dato mancante resta un difetto dell'ingresso anche
  // per chi non giocherà; l'esclusione riguarda solo CHI SI PUÒ SCHIERARE.
  const excludedIds = squad.filter(certainlyAbsent).map((f) => f.id);
  const eligible = squad.filter((f) => !certainlyAbsent(f));
  const availability =
    excludedIds.length === 0
      ? "Disponibilità: nessuno escluso, ogni giocatore della rosa può prendere voto."
      : `Disponibilità: ${
          excludedIds.length === 1
            ? "escluso 1 giocatore che certamente non prenderà voto"
            : `esclusi ${excludedIds.length} giocatori che certamente non prenderanno voto`
        } ` +
        `(${[...excludedIds].sort().join(", ")}): in panchina, mai fra gli undici. ` +
        "Dal 2026-09-08 (decisione di Pico): un pavimento che schiera un assente certo spreca un posto ed " +
        "è più facile da battere, e un metro compiacente è peggio di nessun metro.";

  let best: { module: Module; eleven: ElevenByValue } | null = null;
  const unusable: { module: Module; shortages: readonly RoleShortage[] }[] = [];
  for (const module of MODULES) {
    const attempt = bestElevenForModule(module, eligible, value);
    if (!attempt.ok) {
      unusable.push({ module, shortages: attempt.shortages });
      continue;
    }
    // Somma maggiore; a parità vince il primo modulo dell'ordine dichiarato,
    // perché `>` non sostituisce il precedente a parità.
    if (best === null || attempt.eleven.total > best.eleven.total) best = { module, eleven: attempt.eleven };
  }
  if (best === null) {
    // FAIL-CLOSED, e il rifiuto NOMINA IL REPARTO. Chi legge deve poter dire
    // subito se manca gente o se mancano gli abili, e in quale ruolo: senza il
    // reparto, «non riempibile» è una diagnosi che costringe a rifare il conto
    // a mano. I reparti scoperti distinti vengono prima, il dettaglio per
    // modulo dopo.
    const uncovered = [
      ...new Set(unusable.flatMap((entry) => entry.shortages.map((s) => ROLE_DEPARTMENT[s.role]))),
    ];
    const detail = unusable
      .map(
        (entry) =>
          `${entry.module} (` +
          entry.shortages
            .map((s) => `${ROLE_DEPARTMENT[s.role]}: ne servono ${s.needed}, schierabili ${s.available}`)
            .join("; ") +
          ")",
      )
      .join(", ");
    return {
      policy: "TOP_ELEVEN_BY_SEASON_AVERAGE",
      information: "EX_ANTE",
      lineup: null,
      feasible: false,
      reason:
        "nessuno dei sette moduli di §9 è riempibile con i giocatori schierabili di questa rosa. " +
        `Reparti scoperti: ${uncovered.join(", ")}. Modulo per modulo: ${detail}. ${availability} ` +
        "Il pavimento non esiste per questa giornata: non lo si costruisce con dieci giocatori, e non lo si " +
        "costruisce riammettendo gli assenti certi per far tornare i conti.",
      evaluated: 0,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  const chosen = new Set([best.eleven.keeperId, ...best.eleven.starterIds]);
  // LA PANCHINA RESTA TUTTO IL RESTO DELLA ROSA, esclusi compresi: una
  // formazione si consegna con la rosa che si ha, e togliere di lì un assente
  // certo non aggiungerebbe niente — chi non ha voto non entra comunque (§ le
  // sostituzioni del simulatore lo saltano). L'ordine è quello dichiarato da
  // questa funzione e non cambia: riordinarlo per disponibilità sarebbe una
  // seconda modifica, non richiesta e non decisa.
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
      "MODULES. Nessuno sguardo all'avversario né alla previsione di giornata: è il pavimento di §11.1, e " +
      `quella cecità è la sua definizione. ${availability} Ordine della panchina scelto da questa ` +
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
    // L'esito dell'aiutante dice anche QUALI reparti mancano (serve al
    // pavimento, che su quello rifiuta); qui il modulo non praticabile si salta
    // com'è sempre stato, e il comportamento di questa politica non cambia.
    const attempt = bestElevenForModule(module, eligible, (f) => f.expected.fantasyScore);
    if (!attempt.ok) return null;
    const eleven = attempt.eleven;
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
