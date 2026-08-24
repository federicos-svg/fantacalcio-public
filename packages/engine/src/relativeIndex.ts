// L'INDICE DI APPETIBILITÀ RELATIVO — dove sta il giocatore chiamato ADESSO,
// fra quelli del suo ruolo che si possono ancora prendere. Puro,
// deterministico, engine-only: nessuna UI, nessun I/O, nessun dato reale,
// nessun orologio, nessuna AI.
//
// ─── LA DEFINIZIONE, TESTUALE DI PICO ───────────────────────────────────────
//
// «l'indice relativo è quando, oltre a tutte le variabili che ti ho dato prima,
// ad esempio l'indice di appetibilità assoluto è 75 ma tutti i giocatori in
// quel ruolo con indice assoluto superiore a 75 sono stati presi, allora il suo
// valore relativo aumenta perché in quel momento magari ha una appetibilità
// diversa. Varia anche in base a quanti giocatori nel ruolo sono rimasti,
// quanti ne ho presi io e quanti gli avversari».
//
// Il numero NON è un punteggio nuovo: è la STESSA appetibilità, riletta sulla
// popolazione rimasta. Nell'esempio di Pico il 75 non cambia — cambia CHI C'È
// ANCORA SOPRA DI LUI.
//
// ─── LA FORMA: UNA POSIZIONE, PERCHÉ È L'UNICA CHE NON CHIEDE UNA CURVA ──────
//
// Le tre forme scrivibili erano una POSIZIONE (quanti liberi restano sopra di
// lui), una FASCIA e un INDICE RISCALATO. Le ultime due non sono scrivibili
// oggi senza inventare:
//
//   - un RISCALAMENTO ha bisogno di una curva. Riportare «terzo fra i liberi»
//     su una scala 0–100 richiede una forma (lineare? percentile? logistica?) e
//     due estremi, e nessun documento canonico ne dichiara nessuno. Sarebbe
//     esattamente il peso nascosto che docs/DECISIONS.md §D9 vieta;
//   - una FASCIA ha bisogno di confini. Quelli delle fasce d'asta (./tiers.ts)
//     esistono solo perché vengono da fuori — `ROSTER_REQUIREMENTS` è
//     regolamento e la larghezza è il censimento del tavolo — mentre confini
//     su una popolazione che si assottiglia durante la serata li sceglierebbe
//     il motore. `cliff.ts` e `livePlan.ts` rifiutano le fasce per questa
//     ragione precisa, e qui vale identica.
//
// Una POSIZIONE non chiede niente di tutto questo: è un CONTEGGIO. «Quanti
// giocatori del suo ruolo, ancora liberi, stanno sopra di lui nell'ordine già
// dichiarato» è un numero che si ottiene contando, e contare non ha parametri.
// Il numero mostrato è `1 + quelli` — la stessa convenzione 1-based di
// `RoleTierIndex.positionOf` e di `TierPlacement.tier`, non una scala nuova.
//
// Il precedente vincolante è `./opportunities.ts`, che rifiuta il prodotto
// `surplus × fit` e lo sostituisce con un ordine TOTALE DICHIARATO su fatti —
// «stessa informazione, zero pesi nascosti». Qui il passo è ancora più corto:
// non serve nemmeno un ordine nuovo, perché l'ordine c'è già.
//
// ─── «SOPRA DI LUI» È L'ORDINE GIÀ DICHIARATO, NON UN SECONDO CONFRONTO ─────
//
// Pico dice «indice assoluto superiore a 75». La traduzione letterale sarebbe
// un confronto sui punteggi; qui invece si contano i giocatori che stanno
// PRIMA DI LUI nell'ordine di `TierBook`, cioè nell'ordinamento che
// `buildRoleAppealOrder` produce dai punteggi serviti e che ROMPE I PAREGGI con
// `APPEAL_ORDER_TIE_BREAK`. Le due letture differiscono solo sui pari
// punteggio, e usare l'ordine dichiarato ha una ragione sola ma decisiva: è lo
// STESSO ordine su cui sono costruite le fasce, quindi il riquadro non può
// dire «terzo fra i liberi» mentre la fascia lo colloca altrove. Un secondo
// criterio qui sarebbe una seconda verità sullo stesso giocatore.
// Lettura dichiarata aperta: `RELATIVE_TIES_BY_DECLARED_ORDER`.
//
// ─── CHI NON È PIÙ PRENDIBILE ───────────────────────────────────────────────
//
// «Preso» è `AuctionState.purchasedPlayerIds` e nient'altro: la stessa nozione
// con cui `tiers.ts` calcola `TierOccupancy.freeCount`, quindi il riquadro e il
// pannello FASCIA non possono contare due popolazioni diverse. Include le
// RICONFERME, perché `reduce()` le semina nello stato: un giocatore
// riconfermato non si può prendere, ed è esattamente il fatto che serve.
// Lettura dichiarata aperta: `RELATIVE_TAKEN_INCLUDES_CONFIRMED`.
//
// ─── IL FONDO CONTA ─────────────────────────────────────────────────────────
//
// Pico dice «tutti i giocatori in quel ruolo con indice superiore»: non dice
// «di prima fascia», e non nomina le fasce. Qui quindi l'ordine intero conta,
// FONDO compreso — chi sta oltre l'ultima fascia è comunque un giocatore che
// si può ancora prendere. È il contrario della scelta di `./absoluteValue.ts`,
// che il fondo lo esclude, e la differenza non è un'incoerenza: là la fascia
// serviva a dire QUALE SLOT della ripartizione il giocatore occupa (e il fondo
// non ne occupa nessuno), qui serve solo a metterlo in fila.
// Lettura dichiarata aperta: `RELATIVE_ORDER_INCLUDES_FONDO`.
//
// ─── LE ALTRE VARIABILI DI PICO: MISURATE E ACCANTO, MAI DENTRO ─────────────
//
// «quanti giocatori nel ruolo sono rimasti, quanti ne ho presi io e quanti gli
// avversari». Tutti e tre sono MISURATI qui e viaggiano in
// `RelativeIndexPopulation`. Nessuno dei tre entra NEL numero, e la ragione è
// la regola di ferro: far entrare «quanti ne ho presi io» in una posizione
// richiede di dire QUANTO uno slot già riempito sposta l'appetibilità — cioè
// un coefficiente. Se quel coefficiente non è di Pico, non esiste; e in questo
// modulo non ce n'è nessuno da mettere a zero, perché non c'è nessuna
// moltiplicazione. Il numero è un conteggio, i fatti gli stanno accanto: è la
// forma di `opportunities.ts`, portata fino in fondo.
// Lettura dichiarata aperta: `RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER`.
//
// ─── DUE «NON LO SO» CHE NON SI FONDONO ─────────────────────────────────────
//
// La popolazione del ruolo — quanti ne restano liberi — è MISURATA anche
// quando nessuna riga porta l'indice: è un conteggio di righe di listone meno
// quelle già prese, e non ha bisogno di nessun punteggio. La POSIZIONE invece
// ha bisogno di un ordine, e senza verdetti non c'è ordine. I due casi restano
// due motivi distinti (`listone-senza-ordine`, `ruolo-non-ordinato`,
// `non-ordinato`) e la popolazione continua a viaggiare accanto all'assenza:
// «l'indice non c'è» e «non lo so calcolare» non sono la stessa frase.
//
// ─── COSA NON C'È, DI PROPOSITO ─────────────────────────────────────────────
//
//  - nessun coefficiente, nessun peso, nessuna soglia, nessuna moltiplicazione:
//    il numero esce da `Set.has` e da un contatore che avanza;
//  - nessun `?? 0` e nessun default: un ingrediente che manca produce
//    un'assenza col proprio motivo, mai uno zero;
//  - nessun output direttivo (docs/NO_GO.md §Prodotto): non nasce nessun
//    `value`, `fair_to_me`, `target_band`, `stretch_cap`, nessun consiglio e
//    nessun prezzo. Una posizione misurata non dice cosa fare;
//  - nessun intervallo, nessuna coppia di estremi (§D9 perimetro 2);
//  - nessuna previsione di quanti ne resteranno: si conta ciò che c'è adesso.

import {
  type RatificationStatus,
  type UnratifiedChoiceId,
} from "./declaredValues.js";
import { type TierBook } from "./tiers.js";
import { type AuctionState, type Role, ROLES } from "./types.js";

// ─── Le letture aperte che questo numero porta con sé ────────────────────────

/**
 * Le cinque letture su cui poggia ogni posizione prodotta qui, dichiarate
 * aperte in blocco come fa `ABSOLUTE_VALUE_UNRATIFIED_CHOICES`.
 *
 * In blocco e non ramo per ramo: sono le letture che danno FORMA al numero, non
 * condizioni che si accendono su un caso. Dichiararne una in più è la direzione
 * sicura; una in meno farebbe passare per chiusa una domanda che nessuno ha
 * firmato.
 */
export const RELATIVE_INDEX_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [
  "RELATIVE_NUMBER_IS_A_POSITION",
  "RELATIVE_TIES_BY_DECLARED_ORDER",
  "RELATIVE_TAKEN_INCLUDES_CONFIRMED",
  "RELATIVE_ORDER_INCLUDES_FONDO",
  "RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER",
];

const RATIFICATION: RatificationStatus = {
  ratified: false,
  unratifiedChoices: RELATIVE_INDEX_UNRATIFIED_CHOICES,
};

// ─── La scala dei liberi ─────────────────────────────────────────────────────

/**
 * Una riga di listone come questo modulo la vede: chi è, e in che ruolo gioca.
 *
 * Niente altro entra, e non è minimalismo: la posizione non ha bisogno del
 * nome, del club, della quotazione né del punteggio — il punteggio è già
 * dentro l'ORDINE, che arriva col `TierBook`. Una firma più larga sarebbe
 * l'invito ad aggiungere un ingrediente che nessuno ha dichiarato.
 */
export interface RelativeIndexPoolRow {
  readonly playerId: string;
  readonly role: Role;
}

/** La scala dei liberi di UN ruolo. Conteggi misurati, nessuna sintesi. */
export interface FreeLadderRole {
  readonly role: Role;
  /** Il ruolo è coperto dall'ordine dichiarato? Senza ordine niente posizioni. */
  readonly ordered: boolean;
  /** Quante righe di listone hanno questo ruolo. */
  readonly poolCount: number;
  /** Di quelle, quante NON sono ancora state prese. */
  readonly freeCount: number;
  /** Quante hanno un verdetto dell'indice, cioè stanno nell'ordine. */
  readonly rankedCount: number;
  /** Di quelle, quante ancora libere: la popolazione su cui la posizione vive. */
  readonly freeRankedCount: number;
  /**
   * Per ogni giocatore ORDINATO: quanti LIBERI lo precedono nell'ordine
   * dichiarato. Chiave assente = non è nell'ordine (nessun verdetto).
   *
   * È il cuore del modulo e vale la pena dire perché è una mappa e non una
   * funzione: la stessa passata che la riempie serve a tutti i giocatori del
   * ruolo, quindi il costo si paga una volta per acquisto invece di una volta
   * per tasto. Vedi la memoizzazione in src/relativeIndex.ts.
   */
  readonly freeAhead: ReadonlyMap<string, number>;
}

/** La scala dei liberi di tutti i ruoli, più chi non è più prendibile. */
export interface FreeLadder {
  /** Esiste un ordine dichiarato? `false` quando nessuna riga porta l'indice. */
  readonly ordered: boolean;
  /** Una voce per OGNI ruolo del regolamento, sempre: i conteggi possono essere 0. */
  readonly byRole: ReadonlyMap<Role, FreeLadderRole>;
  /** Chi è già stato preso — `purchasedPlayerIds`, riconferme comprese. */
  readonly taken: ReadonlySet<string>;
}

/**
 * Gli ingressi della scala. È DELIBERATAMENTE la lista completa e minima di
 * ciò che la costruzione legge: il listone, l'ordine e chi è già stato preso.
 *
 * Non c'è `AuctionState` e non è una dimenticanza: la scala non deve sapere
 * chi ha comprato, con che budget o in che ruolo gli restano slot — le sue
 * uniche domande sono «di che ruolo è questa riga?» e «è già stata presa?».
 * È anche la ragione per cui la memoizzazione di src/relativeIndex.ts è
 * dimostrabile e non promessa: la chiave della cache È questa firma.
 */
export interface FreeLadderInput {
  readonly pool: readonly RelativeIndexPoolRow[];
  /** Il libro delle fasce, o `null` quando nessun ordine è caricato. */
  readonly book: TierBook | null;
  /** `AuctionState.purchasedPlayerIds`: già ordinato e deduplicato da `reduce`. */
  readonly purchasedPlayerIds: readonly string[];
}

/**
 * Costruisce la scala dei liberi: per ogni ruolo, quanti ne restano e quanti
 * liberi precedono ciascun giocatore ordinato.
 *
 * Pura, totale e deterministica. Non lancia mai: la schermata di un'asta non
 * può permettersi un'eccezione al posto di un riquadro.
 *
 * UNA PASSATA PER RUOLO, e il conto scorre in avanti. `ahead` viene scritto
 * PRIMA di essere incrementato, quindi vale sempre «quanti liberi stanno
 * STRETTAMENTE prima di lui»: che il giocatore stesso sia libero o preso non
 * entra mai nel suo numero.
 */
export function freeLadder(input: FreeLadderInput): FreeLadder {
  const taken = new Set(input.purchasedPlayerIds);

  // Il censimento del listone per ruolo: righe totali e righe ancora libere.
  // Una passata sola sul listone, non una per ruolo.
  const poolCount = new Map<Role, number>();
  const freeCount = new Map<Role, number>();
  for (const role of ROLES) {
    poolCount.set(role, 0);
    freeCount.set(role, 0);
  }
  for (const row of input.pool) {
    poolCount.set(row.role, (poolCount.get(row.role) ?? 0) + 1);
    if (!taken.has(row.playerId)) {
      freeCount.set(row.role, (freeCount.get(row.role) ?? 0) + 1);
    }
  }

  const byRole = new Map<Role, FreeLadderRole>();
  for (const role of ROLES) {
    const index = input.book === null ? undefined : input.book.byRole.get(role);
    const freeAhead = new Map<string, number>();
    let ahead = 0;
    let freeRanked = 0;
    if (index !== undefined) {
      for (const playerId of index.order) {
        freeAhead.set(playerId, ahead);
        if (!taken.has(playerId)) {
          ahead += 1;
          freeRanked += 1;
        }
      }
    }
    byRole.set(role, {
      role,
      ordered: index !== undefined,
      poolCount: poolCount.get(role) ?? 0,
      freeCount: freeCount.get(role) ?? 0,
      rankedCount: index === undefined ? 0 : index.order.length,
      freeRankedCount: freeRanked,
      freeAhead,
    });
  }

  return { ordered: input.book !== null, byRole, taken };
}

// ─── L'esito ─────────────────────────────────────────────────────────────────

/**
 * Perché la posizione non esiste. Ogni motivo NOMINA LA COSA CHE MANCA, e i
 * quattro «non lo so» non si fondono: chi legge deve poter distinguere «il
 * listone non porta l'indice» da «l'indice non ha verdetto su di lui» da «non
 * è più in gioco».
 */
export type RelativeIndexMissingReason =
  /** Nessun giocatore chiamato: non c'è soggetto di cui dire la posizione. */
  | "nessun-chiamato"
  /** Nessun ordine dichiarato: «sopra di lui» non è definibile per nessuno. */
  | "listone-senza-ordine"
  /** C'è un ordine, ma non copre il suo ruolo. */
  | "ruolo-non-ordinato"
  /** Il ruolo è ordinato, lui no: nessun verdetto dell'indice su questa riga. */
  | "non-ordinato"
  /** È già stato preso: non è più fra quelli che si possono prendere. */
  | "gia-preso";

/**
 * I fatti della popolazione del ruolo, ADESSO. Sono le altre variabili che
 * Pico nomina, misurate e tenute ACCANTO al numero invece che dentro (vedi
 * l'intestazione, §"Le altre variabili di Pico").
 *
 * Viaggiano anche quando la posizione non esiste, e non è ridondanza: sono la
 * metà della risposta che non ha bisogno dell'indice, e tacerla insieme
 * all'altra significherebbe dire «non so niente» quando si sa qualcosa.
 */
export interface RelativeIndexPopulation {
  readonly role: Role;
  /** Quante righe di quel ruolo porta il listone. */
  readonly poolInRole: number;
  /** Quante di quelle si possono ancora prendere. MISURATO senza indice. */
  readonly freeInRole: number;
  /** Quante fra le libere hanno un verdetto: la popolazione dell'ordine. */
  readonly freeRankedInRole: number;
  /**
   * Quanti slot di quel ruolo ho già riempito io — riconferme comprese, come
   * `TeamState.filled`. `null` quando la mia squadra non è al tavolo: non 0,
   * che direbbe «non ne ho presi» invece di «non lo so».
   */
  readonly takenByMe: number | null;
  /** Quanti ne hanno riempiti gli avversari, nello stesso ruolo. */
  readonly takenByOpponents: number;
}

export type RelativeIndexReading =
  | {
      readonly kind: "assente";
      readonly reason: RelativeIndexMissingReason;
      /** La metà misurabile della risposta; `null` solo senza chiamato. */
      readonly population: RelativeIndexPopulation | null;
      readonly ratification: RatificationStatus;
    }
  | {
      readonly kind: "posizione";
      /** `1 + freeAhead`: 1-based come `positionOf` e `tier`, mai riscalato. */
      readonly position: number;
      /** Quanti liberi del ruolo stanno sopra di lui. Il conteggio nudo. */
      readonly freeAhead: number;
      readonly population: RelativeIndexPopulation;
      readonly ratification: RatificationStatus;
    };

export interface RelativeIndexInput {
  /** Il chiamato, con la STESSA identità dell'event log; `null` se non c'è. */
  readonly called: { readonly playerId: string; readonly role: Role } | null;
  /** La scala dei liberi, costruita da `freeLadder`. */
  readonly ladder: FreeLadder;
  /** Lo stato ridotto: da qui, e solo da qui, escono i due conteggi di rosa. */
  readonly state: AuctionState;
  /** La propria squadra. Assente ⇒ `takenByMe` è `null`, non 0. */
  readonly selfId?: string;
}

/**
 * Quanti slot di quel ruolo ha già riempito ciascuna metà del tavolo.
 *
 * Si legge `TeamState.filled`, che è la ROSA: le riconferme contano, ed è la
 * stessa asimmetria già dichiarata da `TierOpponentFacts.ownedAtTierOrBetter`
 * — «chi si è riconfermato un centrocampista ce l'ha, punto».
 */
function rosterCounts(
  state: AuctionState,
  role: Role,
  selfId: string | undefined,
): { readonly mine: number | null; readonly opponents: number } {
  let mine: number | null = null;
  let opponents = 0;
  for (const team of Object.values(state.teams)) {
    if (team.fantaTeamId === selfId) {
      mine = team.filled[role];
      continue;
    }
    opponents += team.filled[role];
  }
  return { mine, opponents };
}

/**
 * Dove sta il giocatore chiamato, adesso, fra quelli del suo ruolo che si
 * possono ancora prendere — oppure il motivo per cui la domanda non ha
 * risposta.
 *
 * Pura, totale e deterministica: ogni ingresso produce o una posizione con la
 * sua popolazione o un'assenza col suo motivo, e non esiste un terzo esito.
 * Non lancia mai.
 *
 * NON È MEMOIZZATA, ed è la scelta giusta: dipende dal chiamato, che cambia a
 * ogni tasto della ricerca, ed è un pugno di letture su mappe già costruite. È
 * la stessa divisione del lavoro di `tierFacts` rispetto a `buildTierBook` —
 * il libro si conserva, i fatti si rifanno.
 */
export function relativeIndexReading(input: RelativeIndexInput): RelativeIndexReading {
  const { called, ladder, state, selfId } = input;
  if (called === null) {
    return { kind: "assente", reason: "nessun-chiamato", population: null, ratification: RATIFICATION };
  }

  const role = called.role;
  // Totale per costruzione: `freeLadder` scrive una voce per OGNI ruolo del
  // regolamento. Il ramo di guardia resta perché il tipo `Map` non lo sa, e
  // perché un `!` qui sarebbe una promessa invece di un controllo.
  const roleLadder = ladder.byRole.get(role);
  const counts = rosterCounts(state, role, selfId);
  const population: RelativeIndexPopulation = {
    role,
    poolInRole: roleLadder?.poolCount ?? 0,
    freeInRole: roleLadder?.freeCount ?? 0,
    freeRankedInRole: roleLadder?.freeRankedCount ?? 0,
    takenByMe: counts.mine,
    takenByOpponents: counts.opponents,
  };
  const absent = (reason: RelativeIndexMissingReason): RelativeIndexReading => ({
    kind: "assente",
    reason,
    population,
    ratification: RATIFICATION,
  });

  // PRIMA DI TUTTO: è ancora prendibile? Una posizione «fra quelli che si
  // possono ancora prendere» calcolata su chi non si può più prendere sarebbe
  // un numero formalmente corretto e sostanzialmente falso.
  if (ladder.taken.has(called.playerId)) return absent("gia-preso");

  if (!ladder.ordered) return absent("listone-senza-ordine");
  if (roleLadder === undefined || !roleLadder.ordered) return absent("ruolo-non-ordinato");

  const ahead = roleLadder.freeAhead.get(called.playerId);
  if (ahead === undefined) return absent("non-ordinato");

  return {
    kind: "posizione",
    position: ahead + 1,
    freeAhead: ahead,
    population,
    ratification: RATIFICATION,
  };
}
