// IL MOTORE SFIDANTE — quello che impara dalla stagione. §6.3 e §2.4 del
// disegno del generatore.
//
// CHE COS'È. La previsione base (§6.2, `baseForecast.ts`) è il METRO: cieca al
// contesto di partita, con un decadimento a grana di STAGIONE, e per questo
// pesa allo stesso modo la giornata di due settimane fa e quella di venti mesi
// fa dentro la stessa stagione. È deliberato, ed è il suo pregio. Questo modulo
// è lo SFIDANTE: la stessa catena, la stessa forma in uscita, ma con le stime
// che si AGGIORNANO giornata dopo giornata.
//
// ── IL PERICOLO VERO DI QUESTO MODULO ────────────────────────────────────────
//
// Non è imparare poco: è imparare il RUMORE e SEMBRARE migliorato. Un modello
// che si aggiorna in fretta spiega benissimo ciò che è appena successo, e su
// una trentina di osservazioni «spiegare ciò che è appena successo» e
// «indovinare ciò che succederà» sono due cose diverse che si somigliano molto.
// Da qui le tre regole che governano tutto il file:
//
//  1) VELOCE DOVE IL SEGNALE C'È, LENTO DOVE NON C'È. Il rendimento di un
//     giocatore ha migliaia di osservazioni (tutta la Serie A, ogni giornata):
//     lì si può dimenticare in fretta. Le abitudini di un fantallenatore ne
//     hanno decine (otto avversari, una giornata a settimana, una trentina di
//     osservazioni in una stagione): lì dimenticare in fretta significa non
//     stimare più niente. Le due quantità hanno quindi DUE mezze vite diverse,
//     dichiarate una per una, e ogni quantità di questo file dice a quale delle
//     due famiglie appartiene.
//
//  2) DIMENTICARE COSTA PROVE, E LO SHRINK FA PAGARE IL CONTO DA SÉ. Il peso
//     totale di una storia infinita con mezza vita `h` giornate non è infinito:
//     vale `1 / (1 − 2^(−1/h))`, cioè circa `h / ln 2`. Con `h = 8` un
//     giocatore che ha giocato ottanta partite porta un peso di circa 12, non
//     di 80. Lo shrink verso il ruolo — lo stesso di §6.2, stesso `K` — vede
//     quel peso e non le partite: chi dimentica in fretta si ritrova
//     automaticamente più vicino al suo riferimento. Non è un effetto
//     collaterale da correggere: è la difesa principale contro l'inseguimento
//     della prestazione fortunata, e va letta insieme al parametro.
//
//  3) QUESTO MOTORE NON PUÒ PROMUOVERSI DA SOLO. Qui dentro non c'è, e non
//     deve esserci, NIENTE che confronti lo sfidante con il base: né punti di
//     lega, né rimpianto, né finestre di sei giornate, né una funzione che dica
//     «meglio». Il criterio di ingresso è PRE-REGISTRATO in §2.4 e vive
//     altrove. Un motore che si dà la sufficienza da solo è il difetto peggiore
//     possibile, e la sola difesa strutturale è che il codice del giudizio non
//     stia nel modulo giudicato.
//
// ── LA DIFESA CONTRO L'AUTOCONFERMA, EREDITATA E NON RIFATTA ─────────────────
//
// `baseForecast.ts` ha già costruito il verso che conta per un previsore —
// L'INGRESSO: se l'uscita di un motore rientrasse come storico, il modello si
// confermerebbe da solo, il rimpianto di §2.4 scenderebbe e nessun errore lo
// direbbe. La difesa è un tipo sigillato (`ObservedHistory`) con una porta sola
// (`observedHistory()`) che pretende una provenienza dichiarata, e ha scritto
// sopra fin dove arriva: ferma l'ASSEGNAZIONE, non un cast esplicito.
//
// QUESTO MODULO NON NE COSTRUISCE UNA SECONDA. Prende lo storico dei giocatori
// esattamente da quel tipo, e per le giornate degli avversari — che quel tipo
// non contiene — non inventa un secondo sigillo: `ObservedChallengerHistory` è
// un involucro che CONTIENE un `ObservedHistory` già sigillato, e non si può
// costruire senza averne uno. Il sigillo è quello di là, ed è l'unico. In
// uscita, ogni distribuzione prodotta qui porta `CHALLENGER_FORECAST_MARK`
// dentro `sourceQuality`, insieme ai parametri con cui è stata fatta: due
// previsioni fatte con mezze vite diverse non si confondono in un dump.
//
// ── SCELTE DI CHI SCRIVE, DICHIARATE E CONTESTABILI ──────────────────────────
//
// Ognuna è una scelta mia, non un fatto: si contesta con un record datato, e
// ognuna si può SPEGNERE (`ChallengerFamilies`) senza toccare il codice.
//
// a) IL TEMPO SI MISURA IN GIORNATE OSSERVATE, NON IN DATE. Questo modulo non
//    legge l'orologio e non ha un calendario, esattamente come il base. La
//    linea del tempo la costruisce dal corpo storico: l'insieme delle coppie
//    (stagione, giornata) che compaiono davvero, ordinate dalla più recente
//    alla più vecchia. L'indice in quell'elenco È «quante giornate fa». Una
//    giornata saltata da tutti (sosta, rinvio generale) semplicemente non
//    esiste nella linea del tempo, che è la lettura giusta: il decadimento
//    conta le partite viste, non i giorni passati.
//
// b) LA MEZZA VITA DEL RENDIMENTO È 8 GIORNATE, ed è IL PARAMETRO PIÙ
//    PERICOLOSO DEL PACCHETTO. Otto giornate significa che una prestazione di
//    due mesi fa pesa un quarto di quella di domenica scorsa, e che il peso
//    totale disponibile — punto 2 qui sopra — è circa 12 osservazioni
//    equivalenti contro le 10 dello shrink: lo sfidante si allontana dal ruolo
//    poco più della metà del cammino, e per farlo di più deve avere una storia
//    coerente, non una domenica buona.
//
//    DA DOVE VIENE IL NUMERO 8, DETTO COME VA DETTO. Non da un principio
//    indipendente: il file di prova misura, sulla SUA fixture sintetica, dove
//    cade la cresta — il punto oltre il quale accorciare la memoria peggiora la
//    stima invece di migliorarla — e la cresta cade attorno a 6. L'8 è stato
//    fissato DOPO quella misura, un passo prima della cresta. È **taratura sui
//    dati di prova**: legittima, perché la fixture è inventata e il numero non
//    è stato scelto per far vincere lo sfidante — ma è taratura, e questo file
//    non può pretendere da altri una dichiarazione che non fa per sé. Il numero
//    giusto su dati veri non lo sa nessuno, e si contesta con un record datato.
//    Ai due estremi il comportamento degenera, e i due modi di degenerare sono
//    DIVERSI:
//
//    - MEZZA VITA INFINITA (`Infinity`, l'estremo scritto esatto) → tutte le
//      giornate pesano 1: l'ordine temporale smette di contare e la stima
//      diventa indipendente da QUANDO è successo ciò che è successo. È un
//      motore cieco al tempo, cioè il base con più codice. Il file di prova lo
//      pinna permutando le etichette temporali e pretendendo lo stesso numero
//      BIT A BIT.
//    - MEZZA VITA MINUSCOLA → conta solo l'ultima giornata: il peso totale
//      crolla a circa 1, lo shrink porta la stima quasi tutta sul ruolo, e ciò
//      che resta insegue l'ultimo voto. Non è «impara più in fretta»: è
//      «dimentica tutto e non sa più niente», e si vede perché la quota del
//      ruolo sale sopra il 90 %.
//
//    Fra i due estremi non c'è una soglia: la miscela è continua, e nessun
//    giocatore salta da una previsione all'altra per una giornata in più.
//
// c) LE ABITUDINI DELL'AVVERSARIO HANNO UNA MEZZA VITA DI 60 GIORNATE, cioè
//    più di una stagione e mezza di campionato: praticamente nessun
//    decadimento sull'orizzonte in cui esistono i dati. È voluto. Con una
//    trentina di osservazioni per avversario, un decadimento vero lascerebbe
//    tre o quattro giornate a decidere il modulo di un fantallenatore, e
//    quella non è una stima: è l'ultima domenica travestita da abitudine.
//    Sopra al decadimento c'è lo shrink a due livelli di §8.4 — l'avversario
//    verso la lega, la lega verso l'uniforme sui moduli legali — che è lo
//    stesso principio dello shrink del base applicato a un'altra scala: la
//    stima resta attaccata al suo riferimento finché non si è guadagnata il
//    diritto di allontanarsene.
//
// d) LO SHRINK DEL RENDIMENTO RESTA QUELLO DEL BASE, `K = 10`, E SI MISURA SUL
//    PESO RESIDUO. Cambiarlo avrebbe voluto dire cambiare due cose insieme — la
//    memoria e la fiducia — e poi non poter più dire quale delle due ha prodotto
//    la differenza. Una cosa per volta: qui la novità è la MEMORIA.
//
//    L'ALTERNATIVA CHE NON HO PRESO, e che è la prima obiezione seria a questo
//    file. Una media pesata esponenzialmente ha, per la varianza, una
//    «numerosità efficace» di `(1+r)/(1−r)` osservazioni — con mezza vita 8
//    giornate sono circa 23, quasi il doppio del peso residuo (circa 12). Usare
//    23 al posto di 12 nello shrink porterebbe la quota del ruolo dal 45 % al
//    30 %, e questo motore si muoverebbe molto di più. Non l'ho fatto perché
//    quella formula vale se tutte le osservazioni vengono dalla STESSA
//    distribuzione — che è esattamente ciò che il decadimento nega: se il
//    livello di un giocatore cambia, le venti giornate vecchie non sono venti
//    prove sul livello di oggi. Fra sopravvalutare e sottovalutare le proprie
//    prove, un motore che deve dimostrare di non leggere il rumore sottovaluta.
//    Conseguenza dichiarata e scomoda: su un salto vero questo motore si muove
//    MENO di quanto potrebbe, e il file di prova lo misura invece di nasconderlo.
//
// e) IL CONTORNO RESTA IDENTICO AL BASE, E NON PER PIGRIZIA. Finestra di 3
//    stagioni, griglia dei voti, separazione fra «gioca» e «rende», le cinque
//    fattispecie di §13, i gol subiti della squadra e non del portiere, riga
//    modale modale fino in fondo, nessun default: sono le regole di §6.1 e
//    §6.2, non caratteristiche del base. Cambiarne una qui significherebbe
//    confrontare due motori che rispondono a domande diverse, e il confronto di
//    §2.4 non misurerebbe più niente.
//
// f) NON C'È NESSUNA FEATURE DI PARTITA. §6.3 elenca le famiglie candidate del
//    motore ricco — disponibilità e minuti, forma, bonus da xG/xA, rigorista,
//    falli e arbitro, matchup, correlazioni intra-partita, stile
//    dell'allenatore, marcatore diretto — e le dichiara MAI ammesse a priori.
//    Di quell'elenco questo pacchetto costruisce UNA sola famiglia, la FORMA
//    RECENTE, e nessuna delle altre: costruirle qui senza che nessuno le abbia
//    chieste sarebbe inventare una decisione. Quella che c'è resta candidata,
//    non promossa.
//
// f-bis) `opponentHabits` NON È UNA FAMIGLIA DI §6.3, ED È UN DOPPIONE. VA
//    LETTA PRIMA DI COLLEGARLA A QUALUNQUE COSA.
//
//    §6.3 non elenca le abitudini di modulo dell'avversario, in nessuna forma:
//    la matematica scritta qui sotto è quella di §8.4 — stessi `k = 4` e
//    `k' = 8`, stessa struttura a due livelli — e §8.4 nella tabella dei
//    pacchetti appartiene a WP-6, non alla traccia del motore ricco. Chiamarla
//    «famiglia dello sfidante» era mio, ed era sbagliato.
//
//    LO STESSO CALCOLO ESISTE GIÀ NELL'ALBERO, ACCANTO A QUESTO FILE.
//    `leagueBehaviourProfile.ts` (§8.3/§8.4, WP-6) stima la quantità
//    `moduleFielded` — la distribuzione dei moduli di una squadra della lega —
//    con lo shrink a due livelli di §8.4 e con gli stessi due numeri, che oggi
//    il barile esporta DUE VOLTE sotto due nomi: `TEAM_PSEUDO_GAMEWEEKS` = 4 e
//    `LEAGUE_PSEUDO_GAMEWEEKS` = 8 di là, `OPPONENT_PRIOR_GAMEWEEKS` = 4 e
//    `LEAGUE_PRIOR_GAMEWEEKS` = 8 qui. È la stessa formula scritta due volte.
//
//    E DOVE I DUE DIFFERISCONO, DIFFERISCONO NEI DUE VERSI. Va detto per intero,
//    perché una dichiarazione di doppione che descrive male il doppione è essa
//    stessa un'affermazione falsa.
//
//    DI LÀ C'È, E QUI NO — ed è la parte che pesa di più:
//    - `LineupRecordStatus`, obbligatorio e senza ripiego: `confermata` (la
//      formazione SCHIERATA, letta dopo la scadenza) contro `non_confermata`
//      (lettura anticipata o divergente), con le non confermate tenute FUORI da
//      ogni conteggio e riportate in chiaro. `OpponentGameweek` qui sotto non
//      ha quel campo: conta come abitudine anche una lettura che nessuno
//      garantisce fosse definitiva;
//    - altre tre quantità di §8.3 («ripete l'undici», «cambia modulo dopo una
//      sconfitta», «il più quotato disponibile era in campo») dove qui c'è solo
//      il modulo;
//    - `notMeasurable`, le occasioni che una quantità non ha potuto misurare,
//      dichiarate invece che confuse con un «no».
//
//    QUI C'È, E DI LÀ NO — e per questo la riconciliazione è lavoro vero, non
//    una cancellazione:
//    - il DECADIMENTO. Di là i conteggi non decadono affatto; qui pesano
//      `0,5^(giornate fa / 60)`, cioè lentissimo ma non nullo;
//    - la separazione CAMPIONATO/COPPA che §8.3 pretende (`competition`), che
//      di là non c'è;
//    - la restrizione ai MODULI LEGALI con la rosa del momento, con
//      rinormalizzazione — il passo 4 di §8.4 — che di là non c'è, perché di là
//      le categorie sono i moduli tutti;
//    - la dimensione STAGIONE, ereditata da `ObservedHistory` con la sua
//      finestra di 3 stagioni; di là la giornata è un intero dentro una
//      competizione sola.
//
//    Il saldo resta a sfavore di questo file: la differenza che conta per la
//    verità del numero — schierata contro non confermata — ce l'ha l'altro, e
//    le tre cose che ha questo sono aggiunte alla formula, non alla qualità del
//    dato che la alimenta.
//
//    OGGI È INNOCUA PERCHÉ NESSUNO LA CHIAMA. `challengerOpponentHabits` non è
//    invocata da nessuna riga di questo repository: non alimenta il produttore,
//    non produce `WeightedOpponentLineup`, non tocca nessuna decisione. Resta
//    codice disconnesso, e per questo non blocca niente.
//
//    LA RIGA CHE DEVE FERMARE CHI PASSA DI QUI FRA UN MESE: **questa funzione
//    duplica §8.4 con un contratto dati più povero del modulo sorella, e va
//    RICONCILIATA con `leagueBehaviourProfile.ts` PRIMA che una delle due venga
//    collegata a qualunque produzione.** Cablarla com'è significherebbe mandare
//    in campo la versione che non sa se quella formazione era stata davvero
//    schierata. La riconciliazione è un lavoro suo, con la sua revisione: non si
//    fa di soppiatto dentro la PR del motore sfidante.
//
// g) LA DUPLICAZIONE CON `baseForecast.ts` È VOLUTA E COSTOSA. Convalida delle
//    righe, pool pesati, shrink, normalizzazione: sono riscritti qui perché il
//    base non li esporta e il base NON SI TOCCA — chi cambia il metro non sta
//    più misurando. Il prezzo è che una correzione di contratto va fatta due
//    volte; il prezzo dell'alternativa era modificare il metro per comodità
//    dello sfidante, che è esattamente il modo in cui un confronto si corrompe.
//    Se un giorno il base esporterà quei mattoni, questo file si accorcia.

import type { Role } from "./gameweekSimulator.js";
import {
  HISTORY_SEASONS,
  type AppearanceEvents,
  type BaseForecast,
  type BaseForecastEvidence,
  type BaseForecastRequest,
  type NoVoteKind,
  type ObservedHistory,
  type PlayerAppearance,
  type SeasonId,
  type TeamGameweek,
} from "./baseForecast.js";
import type { PlayerForecast } from "./lineupProposer.js";
import {
  BASE_VOTE_GRID,
  BASE_VOTE_MIN,
  BASE_VOTE_STEP,
  BONUS_MALUS_TARIFF,
  GOAL_CONCEDED_MALUS,
  GOAL_CONCEDED_MALUS_ROLE,
  type BaseVoteMass,
  type NoVoteKindMasses,
  type PlayerDistribution,
  type PlayerEventRates,
  assertPlayerDistribution,
} from "./playerScenario.js";
import type { ExPostCeilingInput, ObservedPlayerLine } from "./referencePolicies.js";

// ─── LE COSTANTI DICHIARATE ──────────────────────────────────────────────────

/**
 * LA TARGA CHE VIAGGIA COL NUMERO, e che dice anche CON QUALI PARAMETRI è
 * stato fatto. Stessa funzione di `BASE_FORECAST_MARK`: non impedisce niente da
 * sola, ma rende una previsione spacciata per osservazione una bugia scritta a
 * mano, visibile nel diff.
 */
export const CHALLENGER_FORECAST_MARK =
  "PREVISIONE SFIDANTE (motore che impara dalla stagione) — NON è un'osservazione" as const;

/**
 * LA MEZZA VITA DEL RENDIMENTO, IN GIORNATE OSSERVATE — scelta (b) in testa al
 * file, e il parametro più pericoloso del pacchetto. Quantità RICCA di dati:
 * l'intera Serie A, ogni giornata.
 */
export const DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS = 8 as const;

/**
 * LA MEZZA VITA DELLE ABITUDINI DELL'AVVERSARIO, IN GIORNATE OSSERVATE —
 * scelta (c). Quantità POVERA di dati: otto fantallenatori, una giornata a
 * settimana. Sessanta giornate su una trentina di osservazioni significa
 * «quasi nessun decadimento», ed è la risposta giusta a una quantità che non
 * ha abbastanza osservazioni per potersene permettere uno.
 */
export const DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS = 60 as const;

/** Lo shrink del rendimento, in osservazioni equivalenti — scelta (d), = §6.2. */
export const CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS = 10 as const;

/** §8.4: `k`, in giornate equivalenti, dell'avversario verso la lega. */
export const OPPONENT_PRIOR_GAMEWEEKS = 4 as const;

/** §8.4: `k'`, in giornate equivalenti, della lega verso l'uniforme. */
export const LEAGUE_PRIOR_GAMEWEEKS = 8 as const;

/**
 * I DUE INTERRUTTORI. §6.3 vieta di dare per buona una famiglia: quindi ciò che
 * questo motore aggiunge si dichiara e si spegne. Con TUTTI spenti il motore
 * ricade sulla legge del base — decadimento a grana di stagione, nessuna
 * abitudine — e la differenza fra i due si riduce a zero: è il modo più diretto
 * per vedere quanto di ciò che fa viene da queste due scelte e quanto dal
 * contorno.
 *
 * SOLO IL PRIMO È UNA FAMIGLIA DI §6.3. Il secondo è §8.4 travestito da
 * famiglia — scelta (f-bis) in testa al file — ed è un doppione con un
 * contratto più povero di `leagueBehaviourProfile.ts`.
 */
export interface ChallengerFamilies {
  /**
   * LA FORMA RECENTE. Accesa: il decadimento è a grana di GIORNATA osservata.
   * Spenta: torna a grana di stagione, mezza vita 1,5 stagioni, cioè la legge
   * di §6.2 — e allora questo motore non sa più niente che il base non sappia.
   */
  readonly recentForm: boolean;
  /**
   * LE ABITUDINI DELL'AVVERSARIO — **NON è una famiglia di §6.3: è §8.4, e
   * DUPLICA la quantità `moduleFielded` di `leagueBehaviourProfile.ts` con un
   * contratto dati più povero (nessun `LineupRecordStatus`: non sa se quella
   * formazione fosse confermata o solo letta). Va riconciliata con quel modulo
   * PRIMA che una delle due venga collegata a qualunque produzione** — scelta
   * (f-bis) in testa al file.
   *
   * Accesa: i conteggi dell'avversario entrano nella stima dei suoi moduli.
   * Spenta: la stima resta il RIFERIMENTO (lega e uniforme), e l'avversario non
   * sposta niente di suo.
   */
  readonly opponentHabits: boolean;
}

export const DEFAULT_CHALLENGER_FAMILIES: ChallengerFamilies = {
  recentForm: true,
  opponentHabits: true,
};

/** Le due velocità, una per famiglia di quantità. Nessuna delle due è l'altra. */
export interface ChallengerTuning {
  /** Mezza vita del RENDIMENTO, in giornate osservate. Quantità ricca. */
  readonly playerHalfLifeGameweeks: number;
  /** Mezza vita delle ABITUDINI, in giornate osservate. Quantità povera. */
  readonly opponentHalfLifeGameweeks: number;
}

export const DEFAULT_CHALLENGER_TUNING: ChallengerTuning = {
  playerHalfLifeGameweeks: DEFAULT_PLAYER_HALF_LIFE_GAMEWEEKS,
  opponentHalfLifeGameweeks: DEFAULT_OPPONENT_HALF_LIFE_GAMEWEEKS,
};

/** L'ordine di §13, uguale a quello del base: è anche l'ordine di estrazione. */
const NO_VOTE_KIND_ORDER: readonly NoVoteKind[] = [
  "clean",
  "booked",
  "sentOffDuringMatch",
  "withOtherBonusMalus",
  "sentOffAfterMatch",
];

/** La corrispondenza fra evento osservato e tasso previsto, in un posto solo. */
const EVENT_KEYS: readonly (readonly [keyof AppearanceEvents, keyof PlayerEventRates])[] = [
  ["goal", "pGoal"],
  ["assist", "pAssist"],
  ["yellow", "pYellow"],
  ["red", "pRed"],
  ["ownGoal", "pOwnGoal"],
  ["penaltyMissed", "pPenMissed"],
  ["penaltySaved", "pPenSaved"],
];

/** I tre eventi che ALZANO il punteggio: §21 esclude dal modificatore attacco. */
const BONUS_EVENT_KEYS: readonly (keyof AppearanceEvents)[] = ["goal", "assist", "penaltySaved"];

const ROLES: readonly Role[] = ["P", "D", "C", "A"];

/** L'errore di questo modulo. Un prefisso solo, messaggi che dicono perché. */
function fail(message: string): never {
  throw new Error(`motore sfidante: ${message}`);
}

// ─── LO STORICO DEGLI AVVERSARI, E IL SIGILLO CHE NON SI RIFÀ ────────────────

/** Campionato e coppa si contano separati (§8.3): l'obiettivo è diverso (§3.3). */
export type Competition = "LEAGUE" | "CUP";

/**
 * UNA GIORNATA DI UN FANTALLENATORE DELLA LEGA, come si legge dalla pagina
 * della partita dopo la scadenza (§8.2). Qui serve solo il MODULO: §8.3 elenca
 * altri conteggi (difesa a 3/4/5, ordine di panchina, «ripete la formazione»)
 * e costruirli senza che nessuno li abbia chiesti sarebbe inventare una
 * decisione — scelta (f).
 */
export interface OpponentGameweek {
  /** La squadra della lega, come la chiama chi ha letto la pagina. */
  readonly managerId: string;
  readonly season: SeasonId;
  /** Numero di giornata dentro la stagione: intero >= 1. */
  readonly gameweek: number;
  /** Il modulo schierato, come etichetta letta. Questo modulo non lo interpreta. */
  readonly module: string;
  readonly competition: Competition;
}

/**
 * IL CORPO STORICO DELLO SFIDANTE — e il motivo per cui NON porta un sigillo
 * suo.
 *
 * Il campo `history` è un `ObservedHistory`, cioè il tipo sigillato di
 * `baseForecast.ts`: un letterale non può costruirne uno, perché la chiave che
 * chiude quel tipo è un simbolo che nessun altro file può nominare. Quindi
 * NEMMENO questo involucro si può costruire a mano, e un secondo sigillo non
 * comprerebbe niente: aggiungerebbe una seconda difesa da mantenere, con lo
 * stesso identico limite dichiarato di là (un cast la attraversa) e un secondo
 * posto in cui sbagliarla. La difesa si eredita, non si rifà.
 */
export interface ObservedChallengerHistory {
  /** Lo storico dei giocatori, già passato da `observedHistory()`. */
  readonly history: ObservedHistory;
  /** Le giornate lette sulle pagine delle partite (§8.2). */
  readonly opponentGameweeks: readonly OpponentGameweek[];
}

/**
 * LA PORTA. Non pretende una targa nuova — quella la porta già `history` — ma
 * convalida le righe degli avversari, che nessun altro convalida.
 */
export function observedChallengerHistory(input: {
  readonly history: ObservedHistory;
  readonly opponentGameweeks: readonly OpponentGameweek[];
}): ObservedChallengerHistory {
  assertDeclaredProvenance(input.history);
  const rows = input.opponentGameweeks;
  if (!Array.isArray(rows)) fail("le giornate degli avversari non sono un elenco.");
  rows.forEach((row, i) => {
    const where = `giornata avversaria #${i + 1}`;
    if (typeof row.managerId !== "string" || row.managerId.length === 0) {
      fail(`${where}: managerId mancante.`);
    }
    if (typeof row.season !== "string" || row.season.length === 0) {
      fail(`${where}: stagione mancante.`);
    }
    if (!Number.isInteger(row.gameweek) || row.gameweek < 1) {
      fail(`${where}: giornata non valida (${String(row.gameweek)}). Serve un intero >= 1.`);
    }
    if (typeof row.module !== "string" || row.module.length === 0) {
      fail(`${where}: modulo mancante. Il conteggio dei moduli di §8.3 è l'unica cosa che si legge qui.`);
    }
    if (row.competition !== "LEAGUE" && row.competition !== "CUP") {
      fail(
        `${where}: competizione «${String(row.competition)}» sconosciuta. §8.3 tiene campionato e coppa ` +
          "separati perché l'obiettivo è diverso (§3.3): mescolarli conterebbe abitudini di due giochi.",
      );
    }
  });
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.managerId}|${row.season}|${row.gameweek}|${row.competition}`;
    if (seen.has(key)) {
      fail(
        `${row.managerId} ha due righe per la giornata ${row.gameweek} di ${row.season} ` +
          `(${row.competition}). Una giornata si schiera una volta: due righe sono due letture unite male, ` +
          "e conterebbero doppio in ogni frequenza.",
      );
    }
    seen.add(key);
  }
  return { history: input.history, opponentGameweeks: rows };
}

/**
 * LA TARGA PRETESA A RUNTIME, DOVE IL TIPO NON ARRIVA. Stessa guardia e stesso
 * limite dichiarato del base: intercetta il cast DIMENTICO, cioè chi attraversa
 * il tipo senza passare dalla porta e quindi non porta nemmeno la provenienza.
 * Un cast che inventa anche la provenienza passa: rischio accettato e
 * dichiarato, e la bugia resta scritta dentro `sourceQuality`.
 */
function assertDeclaredProvenance(history: ObservedHistory): string {
  // `history?.` non è una svista: questa guardia esiste proprio perché ci si
  // arriva con un cast, cioè perché il tipo qui può mentire.
  const provenance = history?.provenance;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    fail(
      "lo storico non porta una provenienza dichiarata, quindi non è passato da `observedHistory()`. " +
        "Senza targa questo storico potrebbe essere l'uscita di un motore invece di voti letti, e un " +
        "motore addestrato sulla propria previsione si conferma da solo: il rimpianto di §2.4 scenderebbe " +
        "senza che nessun errore lo dica.",
    );
  }
  return provenance.trim();
}

// ─── LA LINEA DEL TEMPO ──────────────────────────────────────────────────────

/** La chiave di una giornata del calendario osservato. */
function matchdayKey(season: SeasonId, gameweek: number): string {
  return `${season}#${gameweek}`;
}

/**
 * LA LINEA DEL TEMPO, COSTRUITA DAL CORPO STORICO — scelta (a) in testa al
 * file. Le coppie (stagione, giornata) che compaiono davvero, dalla più recente
 * alla più vecchia; l'indice È «quante giornate osservate fa». Deterministica
 * per costruzione: dipende solo dall'insieme delle coppie, mai dall'ordine in
 * cui le righe sono arrivate.
 */
function buildTimeline(
  seasonsAgo: ReadonlyMap<SeasonId, number>,
  matchdays: readonly { readonly season: SeasonId; readonly gameweek: number }[],
): ReadonlyMap<string, number> {
  const unique = new Map<string, { season: SeasonId; gameweek: number }>();
  for (const day of matchdays) {
    const ago = seasonsAgo.get(day.season);
    if (ago === undefined || ago >= HISTORY_SEASONS) continue;
    unique.set(matchdayKey(day.season, day.gameweek), { season: day.season, gameweek: day.gameweek });
  }
  const ordered = [...unique.values()].sort((a, b) => {
    const sa = seasonsAgo.get(a.season) as number;
    const sb = seasonsAgo.get(b.season) as number;
    if (sa !== sb) return sa - sb;
    // Dentro la stessa stagione la giornata PIÙ ALTA è la più recente.
    if (a.gameweek !== b.gameweek) return b.gameweek - a.gameweek;
    return 0;
  });
  const index = new Map<string, number>();
  ordered.forEach((day, i) => index.set(matchdayKey(day.season, day.gameweek), i));
  return index;
}

/** Il decadimento a grana di GIORNATA: mezza vita `h` giornate osservate. */
function gameweekWeight(gameweeksAgo: number, halfLife: number): number {
  return Math.pow(0.5, gameweeksAgo / halfLife);
}

/** Il decadimento a grana di STAGIONE, cioè la legge del base (§6.2). */
function seasonWeight(seasonsAgo: number): number {
  return Math.pow(0.5, seasonsAgo / 1.5);
}

/**
 * `Number.POSITIVE_INFINITY` È AMMESSO, ED È L'ESTREMO LENTO SCRITTO ESATTO.
 * `0,5^(k/∞)` vale `0,5^0`, cioè 1 per ogni giornata: tutte pesano uguale e il
 * tempo smette di contare. Scriverlo con un numero grande ma finito — `1e9` —
 * darebbe pesi diversi fra loro nell'ultima decina di cifre, e allora
 * «permutare le date non sposta un bit» sarebbe falso per un motivo che non
 * c'entra niente con la memoria. L'estremo esiste: si dichiara.
 * Zero e i negativi no: non sono «dimenticare tutto», sono una formula senza
 * significato — con mezza vita zero l'esponente è infinito anche per la
 * giornata di oggi, e non resterebbe nemmeno l'ultima.
 */
function assertHalfLife(value: number, what: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    fail(
      `${what}: mezza vita ${String(value)}. Deve essere un numero strettamente positivo (o ` +
        "`Infinity`, che è l'estremo lento: nessun decadimento). Zero e i negativi non sono «dimenticare " +
        "tutto», sono una formula senza significato.",
    );
  }
  return value;
}

// ─── I POOL: CONTEGGI PESATI, NIENT'ALTRO ────────────────────────────────────

interface PerformancePool {
  availabilityWeight: number;
  votedWeight: number;
  noVotedWeight: number;
  voteWeight: number[];
  eventWeight: number[];
  startedWeight: number;
  noVoteKindWeight: number[];
  otherBonusMalusWeighted: number;
}

function emptyPool(): PerformancePool {
  return {
    availabilityWeight: 0,
    votedWeight: 0,
    noVotedWeight: 0,
    voteWeight: BASE_VOTE_GRID.map(() => 0),
    eventWeight: EVENT_KEYS.map(() => 0),
    startedWeight: 0,
    noVoteKindWeight: NO_VOTE_KIND_ORDER.map(() => 0),
    otherBonusMalusWeighted: 0,
  };
}

/** L'indice di un voto sulla griglia, o −1 se il voto non ci sta sopra. */
function gridIndex(vote: number): number {
  const index = Math.round((vote - BASE_VOTE_MIN) / BASE_VOTE_STEP);
  return BASE_VOTE_GRID[index] === vote ? index : -1;
}

/** Lo shrink: peso osservato più K osservazioni finte distribuite come il ruolo. */
function shrink(observedWeight: number, totalWeight: number, prior: number): number {
  return (
    (observedWeight + CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS * prior) /
    (totalWeight + CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS)
  );
}

function shrinkMasses(
  observed: readonly number[],
  totalWeight: number,
  prior: readonly number[],
): number[] {
  return observed.map((weight, i) => shrink(weight, totalWeight, prior[i] as number));
}

/** L'indice della massa più grande; parità rotta dall'indice più piccolo. */
function modeIndex(masses: readonly number[]): number {
  let top = 0;
  for (let i = 1; i < masses.length; i += 1) {
    if ((masses[i] as number) > (masses[top] as number)) top = i;
  }
  return top;
}

/**
 * Le masse normalizzate a somma uno, col residuo scaricato sulla massa più
 * grande: `assertPlayerDistribution` pretende la somma esatta entro 1e-9, e una
 * deriva di virgola mobile su tredici termini non deve diventare un errore di
 * contratto.
 */
function normalised(masses: readonly number[], what: string): number[] {
  let total = 0;
  for (const mass of masses) total += mass;
  if (!(total > 0)) fail(`${what}: massa totale ${total}, non si può normalizzare.`);
  const out = masses.map((mass) => mass / total);
  const top = modeIndex(out);
  let others = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (i !== top) others += out[i] as number;
  }
  out[top] = 1 - others;
  return out;
}

// ─── LA CONVALIDA DEL CORPO STORICO ──────────────────────────────────────────

function assertAppearance(a: PlayerAppearance, where: string): void {
  if (typeof a.playerId !== "string" || a.playerId.length === 0) fail(`${where}: playerId mancante.`);
  if (!ROLES.includes(a.role)) fail(`${where}: ruolo non valido (${String(a.role)}).`);
  if (!Number.isInteger(a.gameweek) || a.gameweek < 1) {
    fail(`${where}: giornata non valida (${String(a.gameweek)}). Serve un intero >= 1.`);
  }
  if (typeof a.voted !== "boolean") {
    fail(`${where}: \`voted\` non dichiarato. «Non lo so» non è «non ha giocato».`);
  }
  if (a.voted) {
    if (typeof a.baseVote !== "number" || gridIndex(a.baseVote) < 0) {
      fail(`${where}: voto base ${String(a.baseVote)} fuori dalla griglia ${BASE_VOTE_MIN}..10.`);
    }
    if (typeof a.started !== "boolean") {
      fail(`${where}: \`started\` non dichiarato su una giornata con voto: dedurlo sarebbe inventarlo.`);
    }
    if (a.events === undefined) fail(`${where}: eventi non dichiarati su una giornata con voto.`);
    for (const [observed] of EVENT_KEYS) {
      if (typeof a.events[observed] !== "boolean") {
        fail(`${where}: evento \`${observed}\` non dichiarato. §12 lo paga: «non dichiarato» non è «non successo».`);
      }
    }
    if (a.noVoteKind !== undefined || a.otherBonusMalus !== undefined) {
      fail(`${where}: una giornata CON voto porta anche una fattispecie del senza voto. I rami sono disgiunti.`);
    }
    return;
  }
  if (a.noVoteKind === undefined || !NO_VOTE_KIND_ORDER.includes(a.noVoteKind)) {
    fail(`${where}: fattispecie del senza voto mancante o sconosciuta (${String(a.noVoteKind)}).`);
  }
  if (a.baseVote !== undefined || a.started !== undefined || a.events !== undefined) {
    fail(`${where}: una giornata SENZA voto porta voto, titolarità o eventi. I rami sono disgiunti.`);
  }
  if (a.noVoteKind === "withOtherBonusMalus") {
    if (typeof a.otherBonusMalus !== "number" || !Number.isFinite(a.otherBonusMalus)) {
      fail(`${where}: \`withOtherBonusMalus\` senza il suo valore. §13 dà «6 più QUEL valore».`);
    }
    if (a.otherBonusMalus === 0) {
      fail(
        `${where}: \`withOtherBonusMalus\` con valore zero. Un senza voto con bonus/malus pari a zero È il ` +
          "senza voto puro: la fattispecie giusta è `clean`.",
      );
    }
  } else if (a.otherBonusMalus !== undefined) {
    fail(`${where}: valore di bonus/malus dichiarato su una fattispecie che non lo prevede (${a.noVoteKind}).`);
  }
}

// ─── L'INDICE DEL CORPO ──────────────────────────────────────────────────────

interface RawTally {
  gameweeks: number;
  voted: number;
  discarded: number;
  /** Quante giornate osservate fa è la giornata più recente di questo giocatore. */
  newestGameweeksAgo: number;
}

interface CorpusIndex {
  readonly provenance: string;
  readonly byPlayer: ReadonlyMap<string, PerformancePool>;
  readonly byRole: ReadonlyMap<Role, PerformancePool>;
  readonly rawCounts: ReadonlyMap<string, RawTally>;
  readonly concededByTeam: ReadonlyMap<string, readonly number[]>;
  readonly concededPooled: readonly number[];
  readonly timelineLength: number;
}

function seasonIndex(seasons: readonly SeasonId[]): ReadonlyMap<SeasonId, number> {
  if (!Array.isArray(seasons) || seasons.length === 0) {
    fail("nessuna stagione dichiarata. L'ordine delle stagioni è l'ossatura del tempo: senza, non c'è previsione.");
  }
  const seasonsAgo = new Map<SeasonId, number>();
  seasons.forEach((season, i) => {
    if (typeof season !== "string" || season.length === 0) fail(`stagione senza etichetta all'indice ${i}.`);
    if (seasonsAgo.has(season)) fail(`stagione dichiarata due volte: ${season}.`);
    seasonsAgo.set(season, i);
  });
  return seasonsAgo;
}

function indexCorpus(
  history: ObservedHistory,
  halfLife: number,
  recentForm: boolean,
): CorpusIndex {
  const provenance = assertDeclaredProvenance(history);
  const seasonsAgo = seasonIndex(history.seasons);
  const ageOf = (season: SeasonId, what: string): number => {
    const ago = seasonsAgo.get(season);
    if (ago === undefined) fail(`${what} in una stagione non dichiarata: ${String(season)}.`);
    return ago;
  };

  // ── L'ORDINE CANONICO, PRIMA DI SOMMARE QUALUNQUE COSA. Due corpi con le
  //    stesse righe in ordine diverso devono dare lo stesso numero BIT A BIT, e
  //    la somma di virgola mobile non è commutativa.
  const appearances = [...history.appearances];
  appearances.forEach((a, i) => {
    assertAppearance(a, `giornata #${i + 1}`);
    ageOf(a.season, `giornata di ${a.playerId}`);
  });
  appearances.sort((a, b) => {
    const sa = ageOf(a.season, `giornata di ${a.playerId}`);
    const sb = ageOf(b.season, `giornata di ${b.playerId}`);
    if (sa !== sb) return sa - sb;
    if (a.gameweek !== b.gameweek) return a.gameweek - b.gameweek;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
  for (let i = 1; i < appearances.length; i += 1) {
    const previous = appearances[i - 1] as PlayerAppearance;
    const current = appearances[i] as PlayerAppearance;
    if (
      previous.playerId === current.playerId &&
      previous.season === current.season &&
      previous.gameweek === current.gameweek
    ) {
      fail(
        `${current.playerId} ha due righe per la giornata ${current.gameweek} di ${current.season}. Una ` +
          "giornata si gioca una volta: due righe sono due letture unite male e conterebbero doppio.",
      );
    }
  }

  const teamGameweeks = [...history.teamGameweeks];
  teamGameweeks.forEach((t, i) => {
    if (typeof t.teamId !== "string" || t.teamId.length === 0) {
      fail(`giornata di squadra #${i + 1}: teamId mancante.`);
    }
    if (!Number.isInteger(t.gameweek) || t.gameweek < 1) {
      fail(`giornata di squadra #${i + 1}: giornata non valida (${String(t.gameweek)}).`);
    }
    if (!Number.isInteger(t.goalsConceded) || t.goalsConceded < 0) {
      fail(
        `giornata di squadra #${i + 1}: gol subiti ${String(t.goalsConceded)}. §12-bis paga −1 PER GOL, e ` +
          "un conteggio non intero o negativo non è pagabile.",
      );
    }
    ageOf(t.season, `giornata della squadra ${t.teamId}`);
  });
  teamGameweeks.sort((a, b) => {
    const sa = ageOf(a.season, `giornata della squadra ${a.teamId}`);
    const sb = ageOf(b.season, `giornata della squadra ${b.teamId}`);
    if (sa !== sb) return sa - sb;
    if (a.gameweek !== b.gameweek) return a.gameweek - b.gameweek;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });
  for (let i = 1; i < teamGameweeks.length; i += 1) {
    const previous = teamGameweeks[i - 1] as TeamGameweek;
    const current = teamGameweeks[i] as TeamGameweek;
    if (
      previous.teamId === current.teamId &&
      previous.season === current.season &&
      previous.gameweek === current.gameweek
    ) {
      fail(
        `la squadra ${current.teamId} ha due righe per la giornata ${current.gameweek} di ` +
          `${current.season}. Una giornata si gioca una volta.`,
      );
    }
  }

  // ── LA LINEA DEL TEMPO, sull'unione dei due calendari: le giornate delle
  //    squadre e quelle dei giocatori sono lo stesso calendario visto da due
  //    parti, e due linee del tempo diverse darebbero a una stessa domenica due
  //    età diverse.
  const timeline = buildTimeline(seasonsAgo, [...appearances, ...teamGameweeks]);

  const weightOf = (season: SeasonId, gameweek: number): number => {
    if (!recentForm) return seasonWeight(seasonsAgo.get(season) as number);
    const ago = timeline.get(matchdayKey(season, gameweek));
    if (ago === undefined) {
      fail(`giornata ${gameweek} di ${season} fuori dalla linea del tempo: è un difetto di questo modulo.`);
    }
    return gameweekWeight(ago, halfLife);
  };

  const byPlayer = new Map<string, PerformancePool>();
  const byRole = new Map<Role, PerformancePool>();
  const rawCounts = new Map<string, RawTally>();
  const tallyOf = (id: string): RawTally => {
    let entry = rawCounts.get(id);
    if (entry === undefined) {
      entry = { gameweeks: 0, voted: 0, discarded: 0, newestGameweeksAgo: Number.POSITIVE_INFINITY };
      rawCounts.set(id, entry);
    }
    return entry;
  };

  for (const a of appearances) {
    const ago = ageOf(a.season, `giornata di ${a.playerId}`);
    const tally = tallyOf(a.playerId);
    if (ago >= HISTORY_SEASONS) {
      tally.discarded += 1;
      continue;
    }
    const w = weightOf(a.season, a.gameweek);
    const daysAgo = timeline.get(matchdayKey(a.season, a.gameweek)) as number;
    if (daysAgo < tally.newestGameweeksAgo) tally.newestGameweeksAgo = daysAgo;
    tally.gameweeks += 1;
    if (a.voted) tally.voted += 1;

    let player = byPlayer.get(a.playerId);
    if (player === undefined) {
      player = emptyPool();
      byPlayer.set(a.playerId, player);
    }
    let role = byRole.get(a.role);
    if (role === undefined) {
      role = emptyPool();
      byRole.set(a.role, role);
    }
    for (const pool of [player, role]) {
      pool.availabilityWeight += w;
      if (a.voted) {
        pool.votedWeight += w;
        const vote = gridIndex(a.baseVote as number);
        pool.voteWeight[vote] = (pool.voteWeight[vote] as number) + w;
        if (a.started === true) pool.startedWeight += w;
        EVENT_KEYS.forEach(([observed], i) => {
          if ((a.events as AppearanceEvents)[observed]) {
            pool.eventWeight[i] = (pool.eventWeight[i] as number) + w;
          }
        });
      } else {
        pool.noVotedWeight += w;
        const kind = NO_VOTE_KIND_ORDER.indexOf(a.noVoteKind as NoVoteKind);
        pool.noVoteKindWeight[kind] = (pool.noVoteKindWeight[kind] as number) + w;
        if (a.noVoteKind === "withOtherBonusMalus") {
          pool.otherBonusMalusWeighted += w * (a.otherBonusMalus as number);
        }
      }
    }
  }

  let maxConceded = 0;
  for (const t of teamGameweeks) {
    if (ageOf(t.season, "giornata di squadra") < HISTORY_SEASONS && t.goalsConceded > maxConceded) {
      maxConceded = t.goalsConceded;
    }
  }
  const concededByTeam = new Map<string, number[]>();
  const concededPooled = new Array<number>(maxConceded + 1).fill(0);
  for (const t of teamGameweeks) {
    if (ageOf(t.season, "giornata di squadra") >= HISTORY_SEASONS) continue;
    const w = weightOf(t.season, t.gameweek);
    let team = concededByTeam.get(t.teamId);
    if (team === undefined) {
      team = new Array<number>(maxConceded + 1).fill(0);
      concededByTeam.set(t.teamId, team);
    }
    team[t.goalsConceded] = (team[t.goalsConceded] as number) + w;
    concededPooled[t.goalsConceded] = (concededPooled[t.goalsConceded] as number) + w;
  }

  return {
    provenance,
    byPlayer,
    byRole,
    rawCounts,
    concededByTeam,
    concededPooled,
    timelineLength: timeline.size,
  };
}

// ─── LA RICHIESTA E L'USCITA ─────────────────────────────────────────────────

/** Identica a quella del base: stessa domanda, altro motore. */
export type ChallengerForecastRequest = BaseForecastRequest;

export interface ChallengerForecastInput {
  readonly history: ObservedHistory;
  /** Uno per giocatore, senza ripetizioni. L'uscita esce in questo ordine. */
  readonly players: readonly ChallengerForecastRequest[];
  /**
   * L'istante a cui questa previsione si dichiara aggiornata (§5). Lo DICHIARA
   * il chiamante: questo modulo non legge l'orologio, perché una previsione che
   * si data da sola non è rifacibile identica domani.
   */
  readonly asOf: string;
  /** Le due velocità. Omesse: quelle dichiarate qui sopra. */
  readonly tuning?: Partial<ChallengerTuning>;
  /** Gli interruttori delle due famiglie. Omessi: entrambe accese. */
  readonly families?: Partial<ChallengerFamilies>;
}

/**
 * Le prove del base PIÙ ciò che solo questo motore ha da dire: quanto in
 * fretta dimentica, quante osservazioni equivalenti gli restano DOPO aver
 * dimenticato, e quanto è vecchia la sua ultima notizia. Sono i tre numeri che
 * permettono di leggere una stima come stima e non come verdetto.
 */
export interface ChallengerForecastEvidence extends BaseForecastEvidence {
  /** La mezza vita del rendimento usata per questa previsione, in giornate. */
  readonly playerHalfLifeGameweeks: number;
  /** Le famiglie accese, per nome. Elenco vuoto: questo è il base con più codice. */
  readonly familiesOn: readonly string[];
  /**
   * Quante giornate osservate fa è l'ultima giornata di questo giocatore.
   * `-1` se non ne ha nessuna nella finestra: «non lo so» non è «ieri».
   */
  readonly newestGameweeksAgo: number;
  /** Quante giornate distinte contiene la linea del tempo del corpo storico. */
  readonly timelineGameweeks: number;
}

/**
 * LA STESSA FORMA DEL BASE. `forecast` è un `PlayerForecast` completo, pronto
 * per `proposeLineup` senza un adattatore; `evidence` estende quella del base,
 * quindi un `ChallengerForecast` è assegnabile ovunque si aspetti un
 * `BaseForecast` — e in fondo al file c'è la guardia di tipo che lo pinna.
 */
export interface ChallengerForecast {
  readonly playerId: string;
  readonly forecast: PlayerForecast;
  readonly evidence: ChallengerForecastEvidence;
}

/** Il pool del ruolo, che è il bersaglio dello shrink. Vuoto: ci si ferma. */
function rolePool(corpus: CorpusIndex, role: Role): PerformancePool {
  const pool = corpus.byRole.get(role);
  if (pool === undefined || pool.availabilityWeight <= 0) {
    fail(
      `nessuna giornata di ruolo ${role} nelle ultime ${HISTORY_SEASONS} stagioni. Lo shrink tira verso la ` +
        "distribuzione del RUOLO: senza quella non c'è niente verso cui tirare, e inventare un ripiego " +
        "produrrebbe un numero plausibile costruito sul nulla.",
    );
  }
  if (pool.votedWeight <= 0) {
    fail(`nessun voto osservato per il ruolo ${role}: la previsione di chi ha giocato poco sarebbe un'invenzione.`);
  }
  if (pool.noVotedWeight <= 0) {
    fail(
      `nessun senza voto osservato per il ruolo ${role}. Le cinque fattispecie di §13 devono sommare a uno, ` +
        "e sceglierne una d'ufficio sposterebbe punteggi interi.",
    );
  }
  return pool;
}

/**
 * LA PREVISIONE SFIDANTE, per i giocatori richiesti e nell'ordine in cui sono
 * richiesti. Funzione pura: nessun orologio, nessuna rete, nessun file, nessun
 * `Math.random`. Stessa storia e stessi parametri, stessa uscita, per sempre.
 */
export function buildChallengerForecasts(
  input: ChallengerForecastInput,
): readonly ChallengerForecast[] {
  const families: ChallengerFamilies = { ...DEFAULT_CHALLENGER_FAMILIES, ...(input.families ?? {}) };
  const tuning: ChallengerTuning = { ...DEFAULT_CHALLENGER_TUNING, ...(input.tuning ?? {}) };
  const halfLife = assertHalfLife(tuning.playerHalfLifeGameweeks, "rendimento del giocatore");
  assertHalfLife(tuning.opponentHalfLifeGameweeks, "abitudini dell'avversario");
  if (typeof input.asOf !== "string" || input.asOf.length === 0) {
    fail(
      "`asOf` non dichiarato. La regola as-of di §5 confronta istanti, e questo modulo non legge l'orologio " +
        "apposta: una previsione che si data da sola non è rifacibile identica domani.",
    );
  }
  const corpus = indexCorpus(input.history, halfLife, families.recentForm);
  const familiesOn: string[] = [];
  if (families.recentForm) familiesOn.push("recentForm");
  if (families.opponentHabits) familiesOn.push("opponentHabits");

  const seen = new Set<string>();
  const out: ChallengerForecast[] = [];
  for (const request of input.players) {
    if (typeof request.playerId !== "string" || request.playerId.length === 0) {
      fail("richiesta senza playerId.");
    }
    if (seen.has(request.playerId)) fail(`richiesta doppia per ${request.playerId}.`);
    seen.add(request.playerId);
    if (!ROLES.includes(request.role)) {
      fail(`${request.playerId}: ruolo non valido (${String(request.role)}).`);
    }
    if (typeof request.teamId !== "string" || request.teamId.length === 0) {
      fail(
        `${request.playerId}: squadra non dichiarata. I gol subiti di §6.2 sono della squadra, non del ` +
          "portiere, e senza la squadra non si sa quale distribuzione usare.",
      );
    }
    out.push(forecastOne(corpus, request, input.asOf, halfLife, familiesOn));
  }
  return out;
}

function forecastOne(
  corpus: CorpusIndex,
  request: ChallengerForecastRequest,
  asOf: string,
  halfLife: number,
  familiesOn: readonly string[],
): ChallengerForecast {
  const role = rolePool(corpus, request.role);
  const own = corpus.byPlayer.get(request.playerId) ?? emptyPool();
  const tally =
    corpus.rawCounts.get(request.playerId) ??
    ({ gameweeks: 0, voted: 0, discarded: 0, newestGameweeksAgo: Number.POSITIVE_INFINITY } as RawTally);

  // ── 1) GIOCA O NON GIOCA. Denominatore: le giornate a disposizione. Questa
  //    quantità non tocca nessun voto, e nessun voto la tocca (§6.1).
  const priorPlays = role.votedWeight / role.availabilityWeight;
  const pPlays = shrink(own.votedWeight, own.availabilityWeight, priorPlays);

  // ── 2) IL RENDIMENTO, CONDIZIONATO A GIOCARE — ed è QUI che vive la forma
  //    recente: gli stessi voti dello stesso giocatore, pesati per quanto sono
  //    freschi invece che tutti uguali.
  const priorVote = normalised(
    role.voteWeight.map((w) => w / role.votedWeight),
    `distribuzione del voto per il ruolo ${request.role}`,
  );
  const voteMasses = normalised(
    shrinkMasses(own.voteWeight, own.votedWeight, priorVote),
    `distribuzione del voto di ${request.playerId}`,
  );
  const baseVote: BaseVoteMass[] = [];
  BASE_VOTE_GRID.forEach((vote, i) => {
    const probability = voteMasses[i] as number;
    if (probability > 0) baseVote.push({ vote, probability });
  });
  const modalBaseVote = BASE_VOTE_GRID[modeIndex(voteMasses)] as number;

  const events: Record<string, number> = {};
  EVENT_KEYS.forEach(([, rate], i) => {
    events[rate] = shrink(
      own.eventWeight[i] as number,
      own.votedWeight,
      (role.eventWeight[i] as number) / role.votedWeight,
    );
  });

  const startedShare = shrink(own.startedWeight, own.votedWeight, role.startedWeight / role.votedWeight);
  const pStarter = pPlays * startedShare;
  // Sottrazione e non moltiplicazione: `pStarter + pSub` non può superare
  // `pPlays` nemmeno di un ulp.
  const pSub = pPlays - pStarter;

  // ── 3) LE CINQUE FATTISPECIE DI §13, condizionate al NON prendere voto.
  const priorSv = normalised(
    role.noVoteKindWeight.map((w) => w / role.noVotedWeight),
    `fattispecie del senza voto per il ruolo ${request.role}`,
  );
  const svMasses = normalised(
    shrinkMasses(own.noVoteKindWeight, own.noVotedWeight, priorSv),
    `fattispecie del senza voto di ${request.playerId}`,
  );
  const svKind: NoVoteKindMasses = {
    clean: svMasses[0] as number,
    booked: svMasses[1] as number,
    sentOffDuringMatch: svMasses[2] as number,
    withOtherBonusMalus: svMasses[3] as number,
    sentOffAfterMatch: svMasses[4] as number,
  };
  // Il VALORE del bonus/malus viene dal RUOLO, come nel base: su una o due
  // occorrenze personali sarebbe rumore puro, ed è il caso limite per cui lo
  // shrink esiste.
  let svOtherBonusMalus: number | undefined;
  if (svKind.withOtherBonusMalus > 0) {
    const roleMass = role.noVoteKindWeight[3] as number;
    if (roleMass <= 0) {
      fail(
        `${request.playerId}: la fattispecie \`withOtherBonusMalus\` ha massa positiva ma il ruolo ` +
          `${request.role} non ne ha nemmeno un'occorrenza osservata da cui prendere il valore.`,
      );
    }
    const mean = role.otherBonusMalusWeighted / roleMass;
    if (mean === 0) {
      fail(
        `${request.playerId}: la media di ruolo del bonus/malus da senza voto è esattamente zero. Un senza ` +
          "voto con bonus/malus zero È il senza voto puro, e chiamarlo `withOtherBonusMalus` terrebbe in " +
          "campo a 6 un giocatore che il regolamento manda in panchina.",
      );
    }
    svOtherBonusMalus = mean;
  }

  // ── 4) I GOL SUBITI, DELLA SQUADRA (§6.2). Solo il portiere li paga (§12-bis).
  let goalsConceded: number[] | undefined;
  if (request.role === GOAL_CONCEDED_MALUS_ROLE) {
    let pooledWeight = 0;
    for (const w of corpus.concededPooled) pooledWeight += w;
    if (pooledWeight <= 0) {
      fail(
        `${request.playerId}: nessuna giornata di squadra con gol subiti nelle ultime ${HISTORY_SEASONS} ` +
          "stagioni. §12-bis paga −1 per gol al portiere, e dargliene zero senza averlo detto sarebbe " +
          "regalargli un'imbattibilità che nessuno ha osservato.",
      );
    }
    const priorConceded = normalised(
      corpus.concededPooled.map((w) => w / pooledWeight),
      "distribuzione dei gol subiti, tutte le squadre",
    );
    const teamWeights = corpus.concededByTeam.get(request.teamId) ?? corpus.concededPooled.map(() => 0);
    let teamWeight = 0;
    for (const w of teamWeights) teamWeight += w;
    goalsConceded = normalised(
      shrinkMasses(teamWeights, teamWeight, priorConceded),
      `gol subiti della squadra ${request.teamId}`,
    );
  }

  const distribution: PlayerDistribution = {
    pPlays,
    pStarter,
    pSub,
    baseVote,
    events: {
      pGoal: events["pGoal"] as number,
      pAssist: events["pAssist"] as number,
      pYellow: events["pYellow"] as number,
      pRed: events["pRed"] as number,
      pOwnGoal: events["pOwnGoal"] as number,
      pPenMissed: events["pPenMissed"] as number,
      pPenSaved: events["pPenSaved"] as number,
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
    },
    svKind,
    ...(svOtherBonusMalus === undefined ? {} : { svOtherBonusMalus }),
    asOf,
    // LA TARGA, CON I PARAMETRI DENTRO: due previsioni fatte con mezze vite
    // diverse sono due previsioni diverse, e devono restare distinguibili in un
    // dump, in un log e in una tabella.
    sourceQuality:
      `${CHALLENGER_FORECAST_MARK}; mezza vita rendimento ${halfLife} giornate; ` +
      `famiglie: ${familiesOn.length === 0 ? "nessuna" : familiesOn.join(", ")}; ` +
      `storico: ${corpus.provenance}`,
  };

  // ── 5) LA RIGA MODALE, MODALE FINO IN FONDO — come nel base, e per la stessa
  //    ragione: i due flag di §21 devono uscire dalla stessa configurazione da
  //    cui esce il punteggio, altrimenti possono contraddirlo.
  const modal = EVENT_KEYS.map(([, rate]) => (events[rate] as number) > 0.5);
  let delta = 0;
  EVENT_KEYS.forEach(([observed], i) => {
    if (modal[i] !== true) return;
    switch (observed) {
      case "goal":
        delta += BONUS_MALUS_TARIFF.goal;
        break;
      case "assist":
        delta += BONUS_MALUS_TARIFF.assist;
        break;
      case "yellow":
        delta += BONUS_MALUS_TARIFF.yellowCard;
        break;
      case "red":
        delta += BONUS_MALUS_TARIFF.redCard;
        break;
      case "ownGoal":
        delta += BONUS_MALUS_TARIFF.ownGoal;
        break;
      case "penaltyMissed":
        delta += BONUS_MALUS_TARIFF.penaltyMissed;
        break;
      default:
        delta += BONUS_MALUS_TARIFF.penaltySaved;
    }
  });
  if (goalsConceded !== undefined) delta += modeIndex(goalsConceded) * GOAL_CONCEDED_MALUS;
  const receivedAnyBonus = EVENT_KEYS.some(
    ([observed], i) => modal[i] === true && BONUS_EVENT_KEYS.includes(observed),
  );
  const missedPenalty = modal[EVENT_KEYS.findIndex(([observed]) => observed === "penaltyMissed")] === true;

  const forecast: PlayerForecast = {
    id: request.playerId,
    role: request.role,
    voteProbability: pPlays,
    expected: {
      baseVote: modalBaseVote,
      // `+ 0` normalizza un eventuale −0.
      fantasyScore: modalBaseVote + delta + 0,
      receivedAnyBonus,
      missedPenalty,
    },
    distribution,
  };

  // La convalida è del CONSUMATORE, non mia: chiamare qui il controllo che il
  // produttore userebbe comunque significa che una previsione malformata muore
  // dove è nata, con il nome del giocatore.
  assertPlayerDistribution(
    { id: forecast.id, role: forecast.role, voteProbability: pPlays, modalBaseVote },
    distribution,
    `previsione sfidante di ${request.playerId}`,
  );

  const priorShareAvailability =
    CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS / (own.availabilityWeight + CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS);
  const priorSharePerformance =
    CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS / (own.votedWeight + CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS);
  const newestGameweeksAgo = Number.isFinite(tally.newestGameweeksAgo) ? tally.newestGameweeksAgo : -1;
  const evidence: ChallengerForecastEvidence = {
    playerId: request.playerId,
    gameweeksInHistory: tally.gameweeks,
    votedInHistory: tally.voted,
    discardedOutOfWindow: tally.discarded,
    availabilityWeight: own.availabilityWeight,
    performanceWeight: own.votedWeight,
    priorShareAvailability,
    priorSharePerformance,
    playerHalfLifeGameweeks: halfLife,
    familiesOn,
    newestGameweeksAgo,
    timelineGameweeks: corpus.timelineLength,
    reason:
      `${CHALLENGER_FORECAST_MARK}. ${tally.voted} giornate con voto su ${tally.gameweeks} a disposizione ` +
      `nelle ultime ${HISTORY_SEASONS} stagioni; l'ultima è ${newestGameweeksAgo} giornate osservate fa su ` +
      `una linea del tempo di ${corpus.timelineLength}. Con mezza vita ${halfLife} giornate restano ` +
      `${own.availabilityWeight} di peso sulla disponibilità e ${own.votedWeight} sul rendimento: ` +
      `dimenticare COSTA prove, e con lo shrink a ${CHALLENGER_SHRINK_PSEUDO_OBSERVATIONS} osservazioni ` +
      `equivalenti il ruolo ${request.role} pesa ${priorShareAvailability} sulla disponibilità e ` +
      `${priorSharePerformance} sul rendimento. Famiglie accese: ` +
      `${familiesOn.length === 0 ? "nessuna (è la legge del base)" : familiesOn.join(", ")}. Nessuna ` +
      `feature di partita (§6.3): niente casa/trasferta, niente avversario reale, niente arbitro, niente ` +
      `xG, nessuna correlazione. Storico dichiarato: ${corpus.provenance}.`,
  };

  return { playerId: request.playerId, forecast, evidence };
}

// ─── LE ABITUDINI DELL'AVVERSARIO — LA QUANTITÀ POVERA ───────────────────────
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ FERMATI PRIMA DI CABLARE QUESTO BLOCCO.                                 │
// │                                                                         │
// │ QUESTO NON È §6.3, È §8.4 — che nella tabella dei pacchetti appartiene   │
// │ a WP-6 e non alla traccia del motore ricco. La formula qui sotto è       │
// │ quella di §8.4: stessi `k = 4` e `k' = 8`, stessa struttura a due        │
// │ livelli.                                                                │
// │                                                                         │
// │ E LO STESSO CALCOLO È GIÀ NELL'ALBERO, IN `leagueBehaviourProfile.ts`:   │
// │ la sua quantità `moduleFielded` è questa stessa distribuzione dei        │
// │ moduli, con lo stesso shrink e con gli stessi due numeri — che il        │
// │ barile ora esporta due volte sotto due nomi.                            │
// │                                                                         │
// │ IL SUO CONTRATTO DATI È PIÙ RICHIESTIVO DEL MIO, ED È LA DIFFERENZA CHE  │
// │ CONTA PER LA VERITÀ DEL NUMERO: `LineupRecordStatus` obbligatorio,       │
// │ `confermata` (schierata, letta dopo la scadenza) contro                 │
// │ `non_confermata`, e le non confermate tenute FUORI da ogni conteggio.   │
// │ `OpponentGameweek` qui sotto quel campo non ce l'ha.                    │
// │                                                                         │
// │ Nei due versi: di là ci sono anche altre tre quantità di §8.3 e le       │
// │ occasioni non misurabili in chiaro; qui ci sono il decadimento lento,    │
// │ la separazione campionato/coppa e i moduli legali con rinormalizzazione, │
// │ che di là non ci sono. Il saldo resta a sfavore di questo file.          │
// │                                                                         │
// │ Oggi è innocua perché NESSUNO LA CHIAMA: `challengerOpponentHabits` non  │
// │ è invocata da nessuna riga di questo repository, non alimenta il         │
// │ produttore e non tocca nessuna decisione.                               │
// │                                                                         │
// │ **VA RICONCILIATA CON `leagueBehaviourProfile.ts` PRIMA CHE UNA DELLE    │
// │ DUE VENGA COLLEGATA A QUALUNQUE PRODUZIONE.** Cablarla com'è             │
// │ significherebbe mandare in campo la versione che non sa se quella        │
// │ formazione era stata davvero schierata.                                 │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Ciò che resta valido di questo blocco è la LETTURA della quantità — poca, e
// quindi lenta — che è la ragione per cui esiste la seconda velocità del file.
//
// QUANTE OSSERVAZIONI CI SONO DAVVERO. Sette avversari, una giornata a
// settimana, trentotto giornate: una trentina di formazioni per avversario in
// una stagione intera, e le prime otto giornate ne hanno otto. Su quel volume
// un decadimento vero — la mezza vita che si usa per il rendimento — lascerebbe
// tre o quattro giornate a decidere il modulo di un fantallenatore. Da qui le
// due difese, sovrapposte:
//
//  - IL DECADIMENTO È LENTISSIMO (60 giornate di mezza vita, scelta (c)):
//    sull'orizzonte in cui i dati esistono è quasi assente. Le abitudini di un
//    fantallenatore cambiano in anni, non in settimane.
//  - LO SHRINK È A DUE LIVELLI, come lo scrive §8.4: l'avversario verso la
//    LEGA con `k = 4` giornate equivalenti, la lega verso l'UNIFORME sui moduli
//    legali con `k' = 8` (una giornata di tutte le squadre). A zero
//    osservazioni la stima È l'uniforme, che è la risposta giusta a «non lo
//    so»; a quattro giornate l'avversario pesa metà; a venti pesa cinque sesti.
//
// I MODULI NON LEGALI CON LA ROSA DEL MOMENTO VALGONO ZERO e la massa si
// rinormalizza (§8.4). Chi chiama dichiara i moduli legali: questo modulo non
// li deduce, perché non conosce la rosa.

export interface OpponentModuleWeight {
  readonly module: string;
  /** Peso normalizzato sull'insieme dei moduli dichiarati legali. */
  readonly weight: number;
}

export interface OpponentHabitEvidence {
  /** Giornate dell'avversario contate, dopo il filtro di competizione e finestra. */
  readonly observedGameweeks: number;
  /** Il loro peso dopo il decadimento lento. */
  readonly decayedWeight: number;
  /** Quanto di questa stima è l'avversario: n_t / (n_t + k). */
  readonly ownShare: number;
  /** Quanto è la lega: la quota restante, prima dell'uniforme. */
  readonly leagueShare: number;
  /** La mezza vita usata, in giornate osservate. */
  readonly halfLifeGameweeks: number;
  readonly reason: string;
}

export interface OpponentHabits {
  readonly managerId: string;
  readonly competition: Competition;
  /** Nell'ORDINE in cui i moduli legali sono stati dichiarati: l'ordine è del chiamante. */
  readonly moduleWeights: readonly OpponentModuleWeight[];
  readonly evidence: OpponentHabitEvidence;
  /** La targa, come per le previsioni: questa è una stima, non una lettura. */
  readonly sourceQuality: string;
}

export interface OpponentHabitsInput {
  readonly corpus: ObservedChallengerHistory;
  /** Di chi si stimano le abitudini. */
  readonly managerId: string;
  /** Campionato o coppa: §8.3 li tiene separati. */
  readonly competition: Competition;
  /** I moduli legali CON LA ROSA DEL MOMENTO, dichiarati da chi chiama. */
  readonly legalModules: readonly string[];
  readonly tuning?: Partial<ChallengerTuning>;
  readonly families?: Partial<ChallengerFamilies>;
}

/**
 * LA STIMA DELLE ABITUDINI.
 *
 * **DOPPIONE DICHIARATO: questa funzione implementa §8.4 (non §6.3) e duplica
 * la quantità `moduleFielded` di `leagueBehaviourProfile.ts` con un contratto
 * dati più povero — `OpponentGameweek` non porta il `LineupRecordStatus` di là,
 * quindi conta come abitudine anche una formazione che nessuno garantisce
 * fosse quella schierata. Nessuno la chiama, ed è così che deve restare finché
 * le due implementazioni non sono riconciliate: non collegarla a nessuna
 * produzione prima di quella riconciliazione.**
 *
 * Funzione pura, nessun orologio, nessun `Math.random`.
 *
 * Con la famiglia `opponentHabits` SPENTA i conteggi dell'avversario non
 * entrano: resta il riferimento (lega verso uniforme), che è esattamente ciò
 * che si vuole dire con «questa famiglia è spenta» — non un errore, non uno
 * zero, ma la stima che si avrebbe senza di lei.
 */
export function challengerOpponentHabits(input: OpponentHabitsInput): OpponentHabits {
  const families: ChallengerFamilies = { ...DEFAULT_CHALLENGER_FAMILIES, ...(input.families ?? {}) };
  const tuning: ChallengerTuning = { ...DEFAULT_CHALLENGER_TUNING, ...(input.tuning ?? {}) };
  const halfLife = assertHalfLife(tuning.opponentHalfLifeGameweeks, "abitudini dell'avversario");
  const provenance = assertDeclaredProvenance(input.corpus?.history);
  if (typeof input.managerId !== "string" || input.managerId.length === 0) {
    fail("abitudini: managerId non dichiarato.");
  }
  if (input.competition !== "LEAGUE" && input.competition !== "CUP") {
    fail(`abitudini: competizione «${String(input.competition)}» sconosciuta.`);
  }
  const legal = input.legalModules;
  if (!Array.isArray(legal) || legal.length === 0) {
    fail(
      "abitudini: nessun modulo legale dichiarato. Questo modulo non conosce la rosa e non può dedurre " +
        "quali moduli siano schierabili: senza l'elenco non c'è un insieme su cui distribuire la massa.",
    );
  }
  const legalIndex = new Map<string, number>();
  legal.forEach((module, i) => {
    if (typeof module !== "string" || module.length === 0) fail(`abitudini: modulo senza nome all'indice ${i}.`);
    if (legalIndex.has(module)) fail(`abitudini: modulo dichiarato due volte fra i legali: ${module}.`);
    legalIndex.set(module, i);
  });

  const seasonsAgo = seasonIndex(input.corpus.history.seasons);
  const rows = input.corpus.opponentGameweeks.filter(
    (row) => row.competition === input.competition && (seasonsAgo.get(row.season) ?? HISTORY_SEASONS) < HISTORY_SEASONS,
  );
  // ORDINE CANONICO PRIMA DI SOMMARE, come per i giocatori: due corpi con le
  // stesse righe in ordine diverso devono dare lo stesso numero bit a bit.
  const ordered = [...rows].sort((a, b) => {
    const sa = seasonsAgo.get(a.season) as number;
    const sb = seasonsAgo.get(b.season) as number;
    if (sa !== sb) return sa - sb;
    if (a.gameweek !== b.gameweek) return a.gameweek - b.gameweek;
    return a.managerId < b.managerId ? -1 : a.managerId > b.managerId ? 1 : 0;
  });
  // LA LINEA DEL TEMPO DELLE ABITUDINI È LA SUA, non quella dei giocatori: le
  // giornate di coppa e di campionato sono due calendari diversi (§8.3), e
  // contare le une nell'età delle altre darebbe a una stessa domenica due età.
  const timeline = buildTimeline(seasonsAgo, ordered);

  const uniform = 1 / legal.length;
  const leagueCounts = legal.map(() => 0);
  const ownCounts = legal.map(() => 0);
  let leagueTotal = 0;
  let ownTotal = 0;
  let ownRows = 0;
  for (const row of ordered) {
    const slot = legalIndex.get(row.module);
    // Un modulo non legale con la rosa di OGGI non entra nemmeno nel conteggio
    // di lega: §8.4 gli dà peso zero, e lasciarlo nel denominatore
    // schiaccerebbe verso il basso tutti i moduli che invece si possono
    // schierare.
    if (slot === undefined) continue;
    const ago = timeline.get(matchdayKey(row.season, row.gameweek)) as number;
    const w = gameweekWeight(ago, halfLife);
    leagueCounts[slot] = (leagueCounts[slot] as number) + w;
    leagueTotal += w;
    if (row.managerId === input.managerId) {
      ownCounts[slot] = (ownCounts[slot] as number) + w;
      ownTotal += w;
      ownRows += 1;
    }
  }

  // q_m = (C_m + k' · u_m) / (N + k') — lega verso uniforme.
  const league = legal.map(
    (_, i) =>
      ((leagueCounts[i] as number) + LEAGUE_PRIOR_GAMEWEEKS * uniform) / (leagueTotal + LEAGUE_PRIOR_GAMEWEEKS),
  );
  // w_t,m = (c_t,m + k · q_m) / (n_t + k) — avversario verso lega. Famiglia
  // spenta: `c_t,m` e `n_t` valgono zero, e la stima È il riferimento.
  const effectiveOwn = families.opponentHabits ? ownCounts : legal.map(() => 0);
  const effectiveOwnTotal = families.opponentHabits ? ownTotal : 0;
  const raw = legal.map(
    (_, i) =>
      ((effectiveOwn[i] as number) + OPPONENT_PRIOR_GAMEWEEKS * (league[i] as number)) /
      (effectiveOwnTotal + OPPONENT_PRIOR_GAMEWEEKS),
  );
  const weights = normalised(raw, `abitudini di ${input.managerId}`);

  const ownShare = effectiveOwnTotal / (effectiveOwnTotal + OPPONENT_PRIOR_GAMEWEEKS);
  return {
    managerId: input.managerId,
    competition: input.competition,
    moduleWeights: legal.map((module, i) => ({ module, weight: weights[i] as number })),
    evidence: {
      observedGameweeks: families.opponentHabits ? ownRows : 0,
      decayedWeight: effectiveOwnTotal,
      ownShare,
      leagueShare: 1 - ownShare,
      halfLifeGameweeks: halfLife,
      reason:
        `Abitudini di ${input.managerId} (${input.competition}) sui ${legal.length} moduli dichiarati ` +
        `legali. ${families.opponentHabits ? ownRows : 0} giornate sue contate, peso ${effectiveOwnTotal} ` +
        `dopo un decadimento LENTO (mezza vita ${halfLife} giornate: su una trentina di osservazioni un ` +
        `decadimento veloce lascerebbe tre giornate a decidere un'abitudine). Shrink a due livelli di §8.4: ` +
        `l'avversario pesa ${ownShare} e il riferimento di lega ${1 - ownShare}; la lega a sua volta è ` +
        `shrinkata verso l'uniforme con ${LEAGUE_PRIOR_GAMEWEEKS} giornate equivalenti. Famiglia ` +
        `\`opponentHabits\` ${families.opponentHabits ? "accesa" : "SPENTA: questa è la sola stima di riferimento"}.`,
    },
    sourceQuality: `${CHALLENGER_FORECAST_MARK}; abitudini §8.4; storico: ${provenance}`,
  };
}

// ─── LE GUARDIE DI TIPO ──────────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, cioè al PRIMO comando di `npm run verify`, senza
// eseguire una riga di vitest. Stessa famiglia — e stesso limite dichiarato —
// di quelle in fondo a `baseForecast.ts` e a `referencePolicies.ts`: chi vuole
// riaprire il varco può cancellare anche queste righe, ma allora lo sta facendo
// APPOSTA, sotto gli occhi di chi rilegge il diff.

/**
 * CIÒ CHE ESCE DA QUI NON È UN VOTO OSSERVATO. La riga di giornata che si
 * costruisce da questa previsione ha esattamente la forma di quella che il
 * produttore consegna, e non deve essere assegnabile a `ObservedPlayerLine`: il
 * tetto ex-post costruito su una previsione è più BASSO del vero, quindi
 * abbassa il rimpianto di §2.4 e promuove un motore che non lo merita, senza
 * sintomi. Per lo sfidante il difetto sarebbe letale due volte: promuoverebbe
 * proprio lui.
 */
type ChallengerForecastLine = {
  readonly id: string;
  readonly role: Role;
  readonly baseVote: number;
  readonly fantasyScore: number;
  readonly receivedAnyBonus: boolean;
  readonly missedPenalty: boolean;
};
type AssertChallengerLineIsNotObserved = ChallengerForecastLine extends ObservedPlayerLine ? never : true;
const _challengerLineIsNotObserved: AssertChallengerLineIsNotObserved = true;
void _challengerLineIsNotObserved;

/** E nemmeno in blocco, dalla porta d'ingresso del tetto. */
type AssertCeilingRefusesChallenger = readonly ChallengerForecastLine[] extends ExPostCeilingInput["squadLines"]
  ? never
  : true;
const _ceilingRefusesChallenger: AssertCeilingRefusesChallenger = true;
void _ceilingRefusesChallenger;

/**
 * IL VERSO CHE RIGUARDA UN PREVISORE: il corpo storico dello sfidante non si
 * costruisce con un letterale. La chiave che lo chiude è il sigillo EREDITATO
 * di `ObservedHistory`, e se un giorno quel tipo tornasse strutturale questa
 * guardia diventerebbe rossa insieme a quella del base.
 */
type PlainChallengerHistory = {
  readonly history: {
    readonly seasons: readonly SeasonId[];
    readonly appearances: readonly PlayerAppearance[];
    readonly teamGameweeks: readonly TeamGameweek[];
    readonly origin: "OBSERVED";
    readonly provenance: string;
  };
  readonly opponentGameweeks: readonly OpponentGameweek[];
};
type AssertPlainChallengerHistoryIsNotObserved = PlainChallengerHistory extends ObservedChallengerHistory
  ? never
  : true;
const _plainChallengerHistoryIsNotObserved: AssertPlainChallengerHistoryIsNotObserved = true;
void _plainChallengerHistoryIsNotObserved;

/**
 * LA STESSA FORMA DEL BASE, PINNATA DAL COMPILATORE. Se un giorno l'uscita
 * dello sfidante smettesse di essere consumabile dove si consuma quella del
 * base, il produttore avrebbe bisogno di un adattatore — e un adattatore fra i
 * due motori è il posto in cui una differenza si nasconde.
 */
type AssertChallengerHasBaseShape = ChallengerForecast extends BaseForecast ? true : never;
const _challengerHasBaseShape: AssertChallengerHasBaseShape = true;
void _challengerHasBaseShape;
