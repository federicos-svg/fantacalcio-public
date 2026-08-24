// L'INDICE DI APPETIBILITÀ RELATIVO — quanto è appetibile il giocatore chiamato
// ADESSO, fra quelli del suo ruolo che si possono ancora prendere. Puro,
// deterministico, engine-only: nessuna UI, nessun I/O, nessun dato reale,
// nessun orologio, nessuna AI.
//
// ─── DA DOVE VIENE QUESTO NUMERO: I RECORD, E SOLO I RECORD ─────────────────
//
// Qui non c'è nessuna frase attribuita a Pico fra virgolette, e l'assenza è
// deliberata. La versione precedente di questo file ne portava una, con la sua
// data: non risultava registrata da nessuna parte — era arrivata da un brief di
// delega — ed è uscita. Il registro lo scrive per esteso in `docs/DECISIONS.md`
// §"Un testuale attribuito a Pico che non risulta detto da Pico — errore
// dell'Executive" (2026-08-24), che chiude con una regola vincolante: nessuna
// citazione di Pico in codice senza un record che la contenga.
//
// Ciò che È registrato, e su cui questo modulo poggia per intero:
//
//  1. `docs/DECISIONS.md` §"Il riquadro del valore porta quattro numeri"
//     (Pico, 2026-08-21): lo slot 2 è «indice di appetibilità relativo —
//     l'indice che si muove durante la serata», e «l'unità di misura è quindi
//     decisa, e in due unità distinte: due numeri sono indici e due sono
//     crediti». Lo stesso record dichiara che la FORMULA non è decisa;
//  2. §"La ricetta dei quattro numeri si congela con il codice" (Pico,
//     2026-08-24): «i coefficienti hanno default a zero, e con tutti a zero i
//     due numeri relativi si muovono comunque — per fatti duri: la scala dei
//     rivali, il tetto del tavolo che scende, la posizione fra i giocatori
//     ancora liberi». È il record che dice DI CHE COSA questo numero è fatto —
//     la posizione fra i liberi — e non dice in che forma si mostri;
//  3. §"Lo slot 2 è un punteggio da 0 a 100" (Pico, 2026-08-24, in modale):
//     poste tre strade — una posizione, un punteggio da 0 a 100, oppure `n/d`
//     col motivo — Pico ha scelto **il punteggio da 0 a 100**. La FORMA è
//     quindi sua; la CURVA no, e la sezione qui sotto esiste per mostrare che
//     non serve sceglierne una.
//
// ─── LA FORMA: UNA QUOTA DI CONTEGGI, NON UNA CURVA ─────────────────────────
//
// Il numero è
//
//     punteggio = 100 × dietro / (davanti + dietro)
//
// dove `davanti` sono i liberi ORDINATI del ruolo che lo precedono nell'ordine
// dichiarato e `dietro` quelli che lo seguono. È una percentuale di una
// popolazione: la QUOTA degli altri liberi ordinati che lui precede. Un
// conteggio diviso per un conteggio — nessun coefficiente, nessun estremo
// scelto, nessuna soglia, nessuna moltiplicazione per una costante che non sia
// il 100 della scala che Pico ha nominato.
//
// PERCHÉ QUESTA È ANCHE «RISCALARE IL RANGO LINEARMENTE», ed è la stessa cosa.
// Sia N il numero di liberi ordinati del ruolo e r la posizione 1-based del
// chiamato fra loro. Allora davanti = r − 1, dietro = N − r, la loro somma è
// N − 1, e
//
//     100 × (N − r)/(N − 1)  =  100 × (1 − (r − 1)/(N − 1))
//
// che è l'UNICA mappa affine decrescente che porta r = 1 su 100 e r = N su 0.
// «Riscalare un rango linearmente su 0–100» e «la quota degli altri che
// precede» non sono due scelte fra cui decidere: sono la stessa funzione,
// scritta due volte. È il percent rank inclusivo — `(quanti stanno sotto)/(n −
// 1)` — e non coincide con le altre convenzioni di percentile (`sotto/n`, o il
// punto medio), che infatti su r = 1 non danno 100. Nel codice resta la
// seconda scrittura perché rende VISIBILE che non c'è nessun parametro: si
// contano due popolazioni e si fa il rapporto.
//
// PERCHÉ L'ALTRA STRADA NON ERA SCRIVIBILE. La forma che avrebbe avuto un
// parametro è riscalare il PUNTEGGIO — `appealIndex.score` — fra il minimo e il
// massimo dei liberi. Lì servono due estremi, e sono estremi che si muovono
// QUANDO UN SOLO GIOCATORE VIENE VENDUTO: basta che parta il migliore perché
// tutti gli altri salgano senza che nessuno di loro sia cambiato, e un solo
// outlier in fondo schiaccia tutti gli altri in un pugno di punti. Scegliere
// quella forma, o scegliere come trattare gli outlier, sarebbe il peso nascosto
// che `docs/DECISIONS.md` §D9 vieta di scegliere al posto di Pico — e nessun
// record la dichiara. La quota di conteggi non ha estremi da scegliere: i suoi
// due capi sono i due capi della popolazione, e una popolazione non è un
// parametro, è un fatto misurato.
//
// QUESTO MODULO NON INTRODUCE NESSUN PESO NUOVO — e la frase difendibile è
// questa, non «il numero non ha pesi». Il rango da cui il punteggio esce è una
// trasformazione MONOTONA di `appealIndex.score`, quindi trasporta per intero i
// pesi della ricetta dell'indice: quelli stanno di là, e questo numero li
// eredita tutti. Ciò che si può affermare, e si afferma, è che fra l'indice e
// questo numero non entra nessun coefficiente nuovo.
//
// ─── IL CONFLITTO CON LA DEROGA DISPLAY-ONLY, NOMINATO ──────────────────────
//
// Si nomina, non si aggira. La deroga del 2026-08-12 che consente di mostrare
// l'indice di appetibilità pone fra le condizioni vincolanti del suo perimetro
// chiuso che l'indice «non entra nel motore decisionale, non produce ranking
// d'asta». Un numero costruito su un ORDINE fra giocatori è precisamente ciò
// che quella riga guarda, e le estensioni concesse fino a ieri non lo
// coprivano: (1) 2026-08-16, l'ordinamento da cui si derivano le FASCE; (2)
// 2026-08-21, l'indice come ingrediente dei due valori mostrati in crediti; (3)
// 2026-08-24, l'ordinamento dei candidati della sola riga «far spendere gli
// altri» (src/baitCandidates.ts, che nomina la propria deroga allo stesso
// modo). Nessuna si estende oltre il proprio uso.
//
// L'autorizzazione che scioglie il conflitto è la QUARTA deroga stretta,
// registrata in `docs/DECISIONS.md` §"Lo slot 2 è un punteggio da 0 a 100"
// (Pico, 2026-08-24): perimetro «lo slot 2 del riquadro del valore, e
// nient'altro», e non autorizza una classifica mostrata altrove. Questo modulo
// resta dentro quel perimetro per costruzione: produce UN NUMERO PER UN
// GIOCATORE, non ordina una lista, non ne restituisce una, e non espone la
// posizione come tale. Chi volesse mostrare «3º su 41» partendo da qui
// dovrebbe tornare da Pico.
//
// ─── «SOPRA DI LUI» È L'ORDINE GIÀ DICHIARATO, NON UN SECONDO CONFRONTO ─────
//
// Si contano i giocatori che stanno PRIMA DI LUI nell'ordine di `TierBook`,
// cioè nell'ordinamento che `buildRoleAppealOrder` produce dai punteggi serviti
// e che ROMPE I PAREGGI con `APPEAL_ORDER_TIE_BREAK`. Un confronto nudo sui
// punteggi darebbe un altro numero sui pari punteggio; usare l'ordine
// dichiarato ha una ragione sola ma decisiva: è lo STESSO ordine su cui sono
// costruite le fasce, quindi il riquadro non può contraddire il pannello
// FASCIA sullo stesso giocatore. Un secondo criterio qui sarebbe una seconda
// verità. La conseguenza va detta: due giocatori a PARI PUNTEGGIO ricevono due
// punteggi relativi DIVERSI, perché il tie-break li separa.
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
// Nessun record nomina le fasce quando parla di questo numero: parla della
// «posizione fra i giocatori ancora liberi». Qui quindi l'ordine intero conta,
// FONDO compreso — chi sta oltre l'ultima fascia è comunque un giocatore che si
// può ancora prendere. È il contrario della scelta di `./absoluteValue.ts`, che
// il fondo lo esclude, e la differenza non è un'incoerenza: là la fascia serve
// a dire QUALE SLOT della ripartizione il giocatore occupa (e il fondo non ne
// occupa nessuno), qui serve solo a metterlo in fila.
// Lettura dichiarata aperta: `RELATIVE_ORDER_INCLUDES_FONDO`.
//
// ─── LE ALTRE VARIABILI DELLA SERATA: MISURATE E ACCANTO, MAI DENTRO ────────
//
// Quanti giocatori del ruolo sono rimasti, quanti ne ha presi Pico e quanti gli
// avversari: tutti e tre sono MISURATI qui e viaggiano in
// `RelativeIndexPopulation`. Nessuno dei tre entra NEL numero, e la ragione è
// la regola di ferro: far entrare «quanti ne ho presi io» richiede di dire
// QUANTO uno slot già riempito sposta l'appetibilità — cioè un coefficiente. Se
// quel coefficiente non è di Pico, non esiste. Il numero è una quota di
// conteggi, i fatti gli stanno accanto: è la forma di `opportunities.ts`
// («stessa informazione, zero pesi nascosti»), portata fino in fondo.
// Lettura dichiarata aperta: `RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER`.
//
// ─── I TRE CASI LIMITE, CHIUSI COL MOTIVO ───────────────────────────────────
//
//  1. UN SOLO LIBERO ORDINATO NEL RUOLO. `davanti + dietro` è zero: il numero
//     sarebbe 0/0. Non è 100 e non è 0, e la ragione è che sarebbero ENTRAMBI
//     imposti dalla stessa regola — chi è primo vale 100, chi è ultimo vale 0,
//     e lì il chiamato è tutti e due. Una regola che si contraddice non produce
//     un numero: produce un'assenza col proprio motivo
//     (`unico-libero-ordinato`), che è la regola di casa «`n/d` col motivo, mai
//     un default fabbricato».
//     Lettura dichiarata aperta: `RELATIVE_ONLY_FREE_HAS_NO_SCORE`.
//  2. ARROTONDAMENTO. Il numero NON viene arrotondato qui: esce esatto e resta
//     esatto fino a `ValueSlot.value`. È la RESA a stamparne uno con un
//     decimale (src/ui/valueBox.ts, `valueNumberText`), regola già in casa per
//     i crediti. Ma una resa arrotondata può creare PAREGGI che il rango non
//     aveva — due giocatori distinti che mostrano lo stesso numero — e il
//     limite va misurato, non promesso: due ranghi adiacenti distano
//     100/(N − 1), quindi due stringhe collidono solo con N > 1001 liberi
//     ordinati NELLO STESSO RUOLO, oltre qualunque listone di questo progetto
//     (532 righe in tutto, tutti i ruoli insieme). Due test in
//     src/valueBox.test.ts lo pinnano: a 532 nessuna coppia collide, a 1002 la
//     collisione è esibita — documentata, non approvata.
//     Lettura dichiarata aperta: `RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING`.
//  3. IL DENOMINATORE. La popolazione è quella dei liberi ORDINATI
//     (`freeRankedCount`), non quella dei liberi: un giocatore senza verdetto
//     non sta nell'ordine, quindi fra lui e il chiamato non c'è nessun
//     confronto, e contarlo farebbe scendere il punteggio per un confronto mai
//     avvenuto. Numeratore e denominatore devono contare la stessa cosa.
//     Lettura dichiarata aperta: `RELATIVE_DENOMINATOR_IS_FREE_RANKED`, con un
//     test che muore se la si sostituisce.
//
// ─── UNA CONSEGUENZA DELLA FORMA, DA SAPERE PRIMA DI GUARDARE IL NUMERO ─────
//
// Una POSIZIONE si muove solo quando viene preso qualcuno SOPRA. Una QUOTA si
// muove anche quando viene preso qualcuno SOTTO, e scende: fra quelli che
// restano, lui ne precede uno in meno. Non è un difetto della scrittura, è che
// cosa significa «quota». La forma è cambiata il 2026-08-24 e le asserzioni
// che dicevano il contrario sono state INVERTITE nei test, con la ragione e la
// data accanto, non tolte.
//
// ─── COSA NON C'È, DI PROPOSITO ─────────────────────────────────────────────
//
//  - nessun coefficiente, nessun peso nuovo, nessuna soglia: il numero esce da
//    `Set.has`, da un contatore che avanza e da un rapporto fra due conteggi;
//  - nessun `?? 0` e nessun default, in tutto il file: le mappe per ruolo sono
//    `Record<Role, …>` totali per il compilatore invece che `Map` con un
//    ripiego, e un ingrediente che manca produce un'assenza col proprio motivo;
//  - nessun output direttivo (docs/NO_GO.md §Prodotto): non nasce nessun
//    `value`, `fair_to_me`, `target_band`, `stretch_cap`, nessun consiglio e
//    nessun prezzo. Una quota misurata non dice cosa fare;
//  - nessun intervallo, nessuna coppia di estremi (§D9 perimetro 2);
//  - nessuna previsione di quanti ne resteranno: si conta ciò che c'è adesso;
//  - nessuna lista ordinata in uscita, e non è un dettaglio: è la riga per cui
//    la quarta deroga stretta resta rispettata.

import {
  type RatificationStatus,
  type UnratifiedChoiceId,
} from "./declaredValues.js";
import { type TierBook } from "./tiers.js";
import { type AuctionState, type Role, ROLES } from "./types.js";

// ─── Le letture aperte che questo numero porta con sé ────────────────────────

/**
 * Le sette letture su cui poggia ogni punteggio prodotto qui, dichiarate aperte
 * in blocco come fa `ABSOLUTE_VALUE_UNRATIFIED_CHOICES`.
 *
 * In blocco e non ramo per ramo: sono le letture che danno FORMA al numero, non
 * condizioni che si accendono su un caso. Dichiararne una in più è la direzione
 * sicura; una in meno farebbe passare per chiusa una domanda che nessuno ha
 * firmato.
 *
 * PICO HA DECISO LA FORMA, NON LA CURVA. `RELATIVE_NUMBER_IS_A_POSITION` non è
 * più in questo elenco perché la scelta che dichiarava — «il numero è una
 * posizione» — non esiste più: il 2026-08-24 Pico ha deciso un punteggio da 0 a
 * 100. Al suo posto entra `RELATIVE_SCORE_IS_SHARE_OF_FREE_RANKED`, che
 * dichiara aperta la sola cosa che Pico NON ha detto: come si riscala. Il fatto
 * che la scrittura scelta sia l'unica senza parametri liberi è dimostrato
 * nell'intestazione, non ratificato da nessuno.
 */
export const RELATIVE_INDEX_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [
  "RELATIVE_SCORE_IS_SHARE_OF_FREE_RANKED",
  "RELATIVE_DENOMINATOR_IS_FREE_RANKED",
  "RELATIVE_ONLY_FREE_HAS_NO_SCORE",
  "RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING",
  "RELATIVE_TIES_BY_DECLARED_ORDER",
  "RELATIVE_TAKEN_INCLUDES_CONFIRMED",
  "RELATIVE_ORDER_INCLUDES_FONDO",
  "RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER",
];

const RATIFICATION: RatificationStatus = {
  ratified: false,
  unratifiedChoices: RELATIVE_INDEX_UNRATIFIED_CHOICES,
};

/**
 * I due capi della scala che Pico ha nominato — «un punteggio da 0 a 100».
 * Stanno qui come costanti perché siano LEGGIBILI e citabili da un test, non
 * perché siano parametri: non sono scelti dal motore, sono le due parole del
 * record.
 */
export const RELATIVE_SCORE_MIN = 0;
export const RELATIVE_SCORE_MAX = 100;

// ─── La scala dei liberi ─────────────────────────────────────────────────────

/**
 * Una riga di listone come questo modulo la vede: chi è, e in che ruolo gioca.
 *
 * Niente altro entra, e non è minimalismo: il punteggio relativo non ha bisogno
 * del nome, del club, della quotazione né dell'indice assoluto — l'indice è già
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
  /** Il ruolo è coperto dall'ordine dichiarato? Senza ordine niente punteggi. */
  readonly ordered: boolean;
  /** Quante righe di listone hanno questo ruolo. */
  readonly poolCount: number;
  /** Di quelle, quante NON sono ancora state prese. */
  readonly freeCount: number;
  /** Quante hanno un verdetto dell'indice, cioè stanno nell'ordine. */
  readonly rankedCount: number;
  /**
   * Di quelle, quante ancora libere: la popolazione su cui il punteggio vive, e
   * il denominatore dichiarato (`RELATIVE_DENOMINATOR_IS_FREE_RANKED`).
   */
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

/** Un contatore per ruolo, TOTALE per il compilatore. È la ragione per cui in
 *  questo file non compare nessun `?? 0`: un `Record<Role, number>` scritto per
 *  esteso non ha una chiave assente da rimpiazzare con uno zero di ripiego, e
 *  il giorno in cui il regolamento guadagnasse un ruolo sarebbe `tsc` a
 *  chiedere la riga in più. */
function zeroByRole(): Record<Role, number> {
  return { P: 0, D: 0, C: 0, A: 0 };
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
  const poolCount = zeroByRole();
  const freeCount = zeroByRole();
  for (const row of input.pool) {
    poolCount[row.role] += 1;
    if (!taken.has(row.playerId)) freeCount[row.role] += 1;
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
      poolCount: poolCount[role],
      freeCount: freeCount[role],
      rankedCount: index === undefined ? 0 : index.order.length,
      freeRankedCount: freeRanked,
      freeAhead,
    });
  }

  return { ordered: input.book !== null, byRole, taken };
}

// ─── L'esito ─────────────────────────────────────────────────────────────────

/**
 * Perché il punteggio non esiste. Ognuno nomina LA COSA CHE MANCA nel proprio
 * campo di competenza, e i «non lo so» non si fondono: chi legge deve poter
 * distinguere «non esiste nessun ordine» da «l'indice non ha verdetto su di
 * lui» da «non è più in gioco».
 *
 * `listone-senza-ordine` NOMINA L'ORDINE, NON LA SUA CAUSA, ed è una
 * qualificazione voluta: le ragioni per cui un ordine non si costruisce sono
 * cinque (src/tierOrdering.ts, `TierBandUnavailable`) e questo motore non le
 * riceve — riceve `book: null`. La causa la nomina il pannello FASCIA, che quel
 * dettaglio ce l'ha; qui si dice l'unica cosa vera in tutti e cinque i casi,
 * cioè che senza ordine «quanti stanno sopra di lui» non è una domanda con
 * risposta. Affermare di più significherebbe indovinare, e sul listone senza
 * indice il riquadro direbbe la cosa giusta per caso.
 */
export type RelativeIndexMissingReason =
  /** Nessun giocatore chiamato: non c'è soggetto di cui dire il punteggio. */
  | "nessun-chiamato"
  /** Nessun ordine dichiarato: «sopra di lui» non è definibile per nessuno. */
  | "listone-senza-ordine"
  /** C'è un ordine, ma non copre il suo ruolo. */
  | "ruolo-non-ordinato"
  /** Il ruolo è ordinato, lui no: nessun verdetto dell'indice su questa riga. */
  | "non-ordinato"
  /** È già stato preso: non è più fra quelli che si possono prendere. */
  | "gia-preso"
  /** È l'unico libero ordinato del ruolo: la quota sarebbe 0/0 (vedi §"I tre
   *  casi limite"). Non è 100 e non è 0, è un'assenza. */
  | "unico-libero-ordinato";

/**
 * I fatti della popolazione del ruolo, ADESSO. Sono le altre variabili della
 * serata, misurate e tenute ACCANTO al numero invece che dentro (vedi
 * l'intestazione, §"Le altre variabili della serata").
 *
 * Viaggiano anche quando il punteggio non esiste, e non è ridondanza: sono la
 * metà della risposta che non ha bisogno dell'indice, e tacerla insieme
 * all'altra significherebbe dire «non so niente» quando si sa qualcosa.
 */
export interface RelativeIndexPopulation {
  readonly role: Role;
  /** Quante righe di quel ruolo porta il listone. */
  readonly poolInRole: number;
  /** Quante di quelle si possono ancora prendere. MISURATO senza indice. */
  readonly freeInRole: number;
  /** Quante fra le libere hanno un verdetto: la popolazione del punteggio. */
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
      /** La metà misurabile della risposta; `null` senza chiamato o senza ruolo. */
      readonly population: RelativeIndexPopulation | null;
      readonly ratification: RatificationStatus;
    }
  | {
      readonly kind: "punteggio";
      /**
       * Da 0 a 100, esatto e mai arrotondato qui: `100 × freeBehind /
       * (freeAhead + freeBehind)`. 100 = nessun libero ordinato davanti;
       * 0 = nessuno dietro.
       */
      readonly score: number;
      /** Quanti liberi ordinati lo precedono. Il conteggio nudo di sinistra. */
      readonly freeAhead: number;
      /** Quanti liberi ordinati lo seguono. Il conteggio nudo di destra. */
      readonly freeBehind: number;
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
 * Quanto è appetibile il giocatore chiamato adesso, fra quelli del suo ruolo
 * che si possono ancora prendere — oppure il motivo per cui la domanda non ha
 * risposta.
 *
 * Pura, totale e deterministica: ogni ingresso produce o un punteggio con la
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
  // regolamento. Il ramo resta perché il tipo `Map` non lo sa, e un `!` sarebbe
  // una promessa invece di un controllo — ma NON produce zeri di ripiego:
  // senza voce non c'è niente da contare, e «niente da contare» è
  // `population: null`, non `poolInRole: 0`, che direbbe «zero righe» al posto
  // di «non lo so».
  const roleLadder = ladder.byRole.get(role);
  if (roleLadder === undefined) {
    return { kind: "assente", reason: "ruolo-non-ordinato", population: null, ratification: RATIFICATION };
  }

  const counts = rosterCounts(state, role, selfId);
  const population: RelativeIndexPopulation = {
    role,
    poolInRole: roleLadder.poolCount,
    freeInRole: roleLadder.freeCount,
    freeRankedInRole: roleLadder.freeRankedCount,
    takenByMe: counts.mine,
    takenByOpponents: counts.opponents,
  };
  const absent = (reason: RelativeIndexMissingReason): RelativeIndexReading => ({
    kind: "assente",
    reason,
    population,
    ratification: RATIFICATION,
  });

  // PRIMA DI TUTTO: è ancora prendibile? Un punteggio «fra quelli che si
  // possono ancora prendere» calcolato su chi non si può più prendere sarebbe
  // un numero formalmente corretto e sostanzialmente falso.
  if (ladder.taken.has(called.playerId)) return absent("gia-preso");

  if (!ladder.ordered) return absent("listone-senza-ordine");
  if (!roleLadder.ordered) return absent("ruolo-non-ordinato");

  const freeAhead = roleLadder.freeAhead.get(called.playerId);
  if (freeAhead === undefined) return absent("non-ordinato");

  // Qui il chiamato è LIBERO (il ramo `gia-preso` è già passato) e ORDINATO
  // (`freeAhead` esiste), quindi sta lui stesso fra i `freeRankedCount`: gli
  // altri sono `freeRankedCount − 1`, e quelli dietro sono ciò che resta
  // togliendo quelli davanti. Nessuna sottrazione può andare sotto zero, ed è
  // una conseguenza dei due rami sopra, non una speranza.
  const freeBehind = roleLadder.freeRankedCount - freeAhead - 1;
  const others = freeAhead + freeBehind;
  if (others === 0) return absent("unico-libero-ordinato");

  return {
    kind: "punteggio",
    score: (RELATIVE_SCORE_MAX * freeBehind) / others,
    freeAhead,
    freeBehind,
    population,
    ratification: RATIFICATION,
  };
}
