// IL PREZZO RELATIVO — «quanto costa vincere adesso», e non è un consiglio.
// Puro, deterministico, engine-only: nessun DOM, nessuno stato, nessun I/O.
//
// LA REGOLA, ED È DI REGOLAMENTO PRIMA CHE DI CODICE. `docs/DECISIONS.md`
// §"Il prezzo relativo si assesta su quanto mette il secondo, non il più
// ricco" (Pico, 2026-08-24, in modale, secondo giro), che PRECISA — non
// supera — §"Il valore relativo varia anche in base ai soldi rimasti in
// circolazione" dello stesso giorno. L'asta è **a rilanci**: chi vince non
// paga quanto è disposto a mettere il più ricco, paga **quanto è disposto a
// mettere il secondo, più uno**. Il più ricco dice soltanto SE PUOI PERDERE;
// il secondo dice QUANTO TI COSTA VINCERE.
//
//     prezzo relativo = (secondo max bid fra i rivali eleggibili) + 1
//                       con tetto al max bid del più ricco
//                       e tetto a maxSafe(io, ruolo)
//
// L'ESEMPIO DI PICO È IL TEST DI ACCETTAZIONE, alla lettera, e sta in
// packages/engine/tests/relativeValue.test.ts:
//
//   > Giocatore da 150 di valore assoluto. Restano capienti: Bianchi con max
//   > bid 96, Rossi con 61, Verdi con 34; gli altri quattro hanno il ruolo
//   > pieno. Il tetto dice: non può valere più di 96. La scala dei rivali dice
//   > 62 — perché a 62 Bianchi vince da solo, e a 61 Rossi ha già mollato. Se
//   > Rossi compra altrove e scende a 40, la stessa chiamata cinque minuti
//   > dopo dà 41. Il tetto non si è mosso di un credito.
//
// IL VALORE ASSOLUTO NON ENTRA. I «150» dell'esempio sono il contesto della
// domanda, non un ingrediente della risposta: questa funzione non legge un
// valore dichiarato, un'ancora, un indice o una fascia, e la sua firma lo
// garantisce — riceve lo stato d'asta, il ruolo e la propria identità, e
// nient'altro. Quanto costa vincere è un fatto sul TAVOLO, non sul giocatore.
//
// DA DOVE VENGONO GLI INGREDIENTI, e sono due, tutti e due già misurati:
//
//  1. LA SCALA DEI RIVALI — `competitorSet()` di ./competitors.ts. Il suo
//     campo `eligible` è GIÀ ORDINATO per max bid decrescente (ordinamento
//     totale e stabile, id crescente a parità): il secondo è `eligible[1]`, il
//     più ricco è `eligible[0]`, e leggerli costa due accessi a un array. Qui
//     non si riordina niente e non si ricostruisce niente: una seconda
//     graduatoria scritta in questo file sarebbe una copia destinata a
//     divergere, esattamente come lo sarebbe una seconda formula di `maxSafe`.
//
//  2. IL MIO TETTO — `maxSafe()` di ./auction.ts, INTERROGATA e mai riderivata,
//     mai spostata di un credito. Resta hard-safe e non overridabile (D4): il
//     prezzo relativo non la supera in nessun ramo, e non perché una clausola
//     lo dica a parole ma perché è uno degli argomenti del minimo finale.
//
// LA SOGLIA CON CUI SI CHIEDE L'INSIEME ELEGGIBILE È `COST_FLOOR`, e la scelta
// va dichiarata perché è l'unico grado di libertà del modulo. La domanda a cui
// il numero risponde è «chi, al tavolo, può ancora comprarlo», non «chi può
// arrivare a un prezzo X»: con la soglia al pavimento restano fuori soltanto i
// vincoli DURI — ruolo pieno e budget bloccato dalla riserva —, che è
// esattamente la lista di esclusioni dell'esempio di Pico («gli altri quattro
// hanno il ruolo pieno»). Una soglia più alta (l'ancora corrente, il prezzo
// live, il valore dichiarato) sceglierebbe una formula che Pico non ha deciso
// e toglierebbe rivali dall'insieme senza che nessuno l'abbia chiesto.
//
// `n/d` COL MOTIVO, MAI UN DEFAULT FABBRICATO. Il vocabolario delle assenze è
// CHIUSO e ogni voce nomina un fatto verificabile. In particolare NON esiste un
// ramo in cui un ingrediente mancante diventa uno zero, un pavimento o un
// vicino arrotondato: senza un secondo rivale non esiste un secondo max bid, e
// «non lo so» è la risposta giusta. Nessun `?? 0` compare in questo file.
//
// NESSUN OUTPUT DIRETTIVO, E NESSUN GATE. Questo numero non dice che cosa fare:
// dice quanto costa vincere adesso, che è aritmetica dichiarata su fatti duri
// dell'event log (budget residuo, slot residui, riserva dura). Non è un
// `target_band`, non è uno `stretch_cap`, non è un «prendilo fino a», non è una
// banda e non è un intervallo: è uno scalare intero di crediti. Non legge, non
// scrive e non dipende da nessun flag di promozione, e in particolare NON è il
// campo `fair_to_me` model-derived, che resta gated e che questo file non tocca
// in nessun ramo.
//
// PERCHÉ IL FILE SI CHIAMA `relativeValue.ts` E I SIMBOLI SI CHIAMANO `price`,
// e non è una svista. Il FILE porta il nome dello slot che alimenta — il quarto
// del riquadro, «valore relativo» —; i SIMBOLI portano il nome che il record di
// Pico dà alla cosa, «prezzo relativo». Tenerli distinti non è cosmesi: nel
// motore la famiglia dei simboli «value» è ESATTAMENTE quella di
// ./declaredValues.ts — «derivato dai valori dichiarati di Owner», §D9
// perimetro 1 — ed è sorvegliata per identità del binding dallo scope guard di
// packages/engine/tests/engine.test.ts §12, che pretende che ogni nome
// autorizzato NASCA in quel modulo. Questo numero in quella famiglia non ci
// sta, e non deve starci: non tocca un solo valore dichiarato. Chiamarlo
// `value` lo farebbe passare per un parente di ciò che non è, e per entrarci
// dovrebbe indebolire la guardia che tiene fuori il FTM model-derived.
//
// CHE COSA QUESTO MODULO NON È, per non promettere più di quel che fa. Il
// record del 2026-08-24 sui coefficienti («La ricetta dei quattro numeri si
// congela con il codice») dichiara che il valore relativo avrà anche altre
// gambe, con pesi che oggi NON SONO DECISI e che hanno default a zero. Qui c'è
// la sola gamba che Pico ha specificato per intero — la scala dei rivali —, e
// nessun peso: aggiungerne uno adesso significherebbe inventare la ricetta che
// quel record tiene aperta fino alla sera del 2 settembre.

import { maxSafe } from "./auction.js";
import { competitorSet } from "./competitors.js";
import { type AuctionState, type Role, COST_FLOOR } from "./types.js";

/**
 * IL RILANCIO MINIMO — un credito.
 *
 * PROVENIENZA, ACCANTO AL NUMERO E NON ALTROVE (§D9): è di REGOLAMENTO prima
 * che di conversazione. `docs/data/LEAGUE_RULES.md` §3-bis lo dichiara due
 * volte, come campo e come frase — `min_bid_increment: 1` e «rilancio minimo:
 * +1 credito» —, ed è la stessa regola che il «più uno» di Pico nomina nel
 * record di `docs/DECISIONS.md` citato in testa a questo file. Le due fonti non
 * sono in concorrenza: il regolamento è la casa del numero, il record è il
 * posto dove Pico dice quale numero entra nella formula del prezzo relativo.
 * Senza la prima riga qui sopra questo 1 sarebbe indistinguibile da un 1
 * scelto stasera.
 *
 * Vale un credito e oggi coincide NUMERICAMENTE con `COST_FLOOR`, ma è un'altra
 * grandezza: `COST_FLOOR` è il costo minimo di uno slot, questo è lo scatto
 * minimo fra un'offerta e la successiva. Scriverli con lo stesso nome
 * significherebbe che il giorno in cui una delle due cambia si muove anche
 * l'altra, in silenzio.
 */
export const MINIMUM_RAISE = 1;

/**
 * Perché il prezzo relativo NON esiste adesso. Vocabolario chiuso: ogni voce è
 * un fatto verificabile sullo stato d'asta, mai una scusa generica, e nessuna
 * di esse ha un numero di ripiego dietro.
 */
export type RelativePriceMissingReason =
  /** `selfId` non è una squadra di questo stato: non c'è un «io» che paghi. */
  | "squadra-assente"
  /** Il ruolo è pieno PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi. */
  | "ruolo-pieno-per-me"
  /** Il mio `maxSafe` è a zero (budget bloccato dalla riserva dura): nessuna offerta valida. */
  | "max-safe-a-zero"
  /** Nessun rivale eleggibile: non c'è nessuna asta da vincere, e nessuna scala su cui misurarla. */
  | "nessun-rivale-eleggibile"
  /** Un solo rivale eleggibile: IL SECONDO NON ESISTE, e non si sostituisce col primo. */
  | "un-solo-rivale-eleggibile";

/** Quale dei tre vincoli ha fissato il numero. Uno solo, il più stretto. */
export type RelativePriceBound =
  /** `secondo + 1`: nessuno dei due tetti ha morso. */
  | "scala-dei-rivali"
  /** Il max bid del più ricco: nemmeno lui può arrivare a `secondo + 1`. */
  | "tetto-del-piu-ricco"
  /** `maxSafe(io, ruolo)`: il tavolo chiede più di quanto io possa mettere. */
  | "tetto-max-safe";

/**
 * LA CATENA, PASSO PER PASSO. Viaggia col numero perché una derivazione che non
 * sa dire da dove viene è indistinguibile da un numero inventato: chi guarda
 * «62» deve poter vedere che 61 era il secondo, 96 il più ricco e 473 il
 * proprio tetto, e quale dei tre ha deciso.
 */
export interface RelativePriceChain {
  readonly role: Role;
  /** Quanti rivali possono ancora comprarlo, io escluso. Mai meno di 2 quando c'è un numero. */
  readonly eligibleCount: number;
  /** `eligible[0].maxBid` — il tetto invalicabile: dice SE puoi perdere. */
  readonly richestMaxBid: number;
  /** `eligible[1].maxBid` — la scala: dice QUANTO ti costa vincere. */
  readonly secondMaxBid: number;
  /** `secondMaxBid + MINIMUM_RAISE`, prima dei due tetti. */
  readonly rivalScale: number;
  /** `maxSafe(io, ruolo)`, interrogata e non riderivata. */
  readonly myMaxSafe: number;
  readonly boundBy: RelativePriceBound;
}

export type RelativePriceReading =
  | { readonly kind: "prezzo"; readonly credits: number; readonly chain: RelativePriceChain }
  | { readonly kind: "assente"; readonly reason: RelativePriceMissingReason };

export interface RelativePriceInput {
  /** Lo stato d'asta prodotto dal reducer: budget, slot e rose di tutte le squadre. */
  readonly state: AuctionState;
  /** Il ruolo del giocatore chiamato: è su quello che si compete. */
  readonly role: Role;
  /** La mia squadra. Esce dall'insieme dei rivali e fornisce il tetto `maxSafe`. */
  readonly selfId: string;
}

/**
 * Quanto costa vincere QUESTO giocatore ADESSO, in crediti interi.
 *
 * Deterministica e totale: stesso stato, stesso ruolo, stessa identità →
 * stessa risposta, sempre; e ogni ingresso produce o un prezzo con la sua
 * catena o un'assenza col suo motivo, senza un terzo esito.
 *
 * L'ARITMETICA RESTA INTERA senza un arrotondamento scritto qui: `maxSafe` è
 * `budgetResidual − hardReserve(slot)`, cioè una differenza di interi del
 * libro mastro, e `MINIMUM_RAISE` è 1. Un `Math.round` in fondo alla catena
 * nasconderebbe un ingresso rotto invece di farlo vedere.
 */
export function relativePriceReading(input: RelativePriceInput): RelativePriceReading {
  const { state, role, selfId } = input;

  const me = state.teams[selfId];
  if (me === undefined) return { kind: "assente", reason: "squadra-assente" };

  // I DUE MOTIVI CHE RIGUARDANO ME, nell'ordine in cui si annidano — lo stesso
  // criterio di `CompetitorAssessment.blockers`: un ruolo pieno ha per forza
  // anche `maxSafe` a zero, ma dire che il problema è il budget sarebbe falso.
  if (me.slotsRemaining[role] <= 0) return { kind: "assente", reason: "ruolo-pieno-per-me" };
  const mine = maxSafe(me, role);
  if (!mine.biddable) return { kind: "assente", reason: "max-safe-a-zero" };

  // LA SCALA DEI RIVALI, letta e non ricostruita. `eligible` arriva già in fila
  // per max bid decrescente: qui non c'è nessun `sort`, di proposito.
  const rivals = competitorSet(state, role, COST_FLOOR, selfId).eligible;
  if (rivals.length === 0) return { kind: "assente", reason: "nessun-rivale-eleggibile" };
  if (rivals.length === 1) return { kind: "assente", reason: "un-solo-rivale-eleggibile" };

  const richestMaxBid = rivals[0]!.maxBid;
  const secondMaxBid = rivals[1]!.maxBid;
  const rivalScale = secondMaxBid + MINIMUM_RAISE;

  const credits = Math.min(rivalScale, richestMaxBid, mine.maxSafe);
  // Quale vincolo ha deciso, a parità il primo dell'ordine: la scala è la
  // regola, i due tetti sono limiti che mordono soltanto quando sono più
  // stretti di lei.
  //
  // I DUE `<=` SONO LA REGOLA DI PARITÀ, e non una comodità di scrittura:
  // portarli a `<` non sposterebbe `credits` di un credito — `Math.min` non
  // distingue i pari — ma cambierebbe l'ETICHETTA, e con lei la frase che il
  // riquadro mostra a chi guarda: un pareggio diventerebbe «il tavolo chiede di
  // più» quando il tavolo non chiede niente di più. Per questo i due pareggi
  // sono pinnati uno a uno in packages/engine/tests/relativeValue.test.ts
  // (describe «la parità va alla scala»), e non soltanto dichiarati qui.
  const boundBy: RelativePriceBound =
    rivalScale <= richestMaxBid && rivalScale <= mine.maxSafe
      ? "scala-dei-rivali"
      : richestMaxBid <= mine.maxSafe
        ? "tetto-del-piu-ricco"
        : "tetto-max-safe";

  return {
    kind: "prezzo",
    credits,
    chain: {
      role,
      eligibleCount: rivals.length,
      richestMaxBid,
      secondMaxBid,
      rivalScale,
      myMaxSafe: mine.maxSafe,
      boundBy,
    },
  };
}

/**
 * IL DEBITO SALDATO, DICHIARATO DOVE IL PROSSIMO LO TROVA.
 *
 * Lo slot 4 del riquadro del valore (src/valueBox.ts) nasceva agganciato a
 * `DecisionNumbers.fairToMeMaxEffective` — la catena §4.2 costruita su
 * `declaredValue`, sull'α del profilo di rischio e sul costo opportunità del
 * piano B. Sono due formule diverse per lo stesso slot, e questa le separa: da
 * qui in avanti lo slot legge `relativePriceReading()`.
 *
 * LA CATENA FTM NON SI CANCELLA — vale la regola «un'asserzione si aggiorna o
 * si inverte, mai si toglie», e vale per il codice come per i documenti.
 * `callScreen()` resta la commutazione target/occasione/spettatore, `chainOk`
 * resta l'invariante che tiene ogni numero sotto `max_safe`,
 * `opportunityQualityGate` resta il cancello della qualità del dato. Quello che
 * è cambiato è UNA SOLA COSA: da dove il riquadro prende il numero dello slot 4.
 * Il campo `fairToMeMaxEffective` è quindi, da adesso, senza consumatori sul
 * percorso del riquadro — è marcato come tale nell'intestazione di
 * ./callScreen.ts, stesso trattamento deciso il 2026-08-24 per
 * `nominationWindow.ts`, perché il prossimo che lo trova non lo scambi per un
 * pezzo da collegare.
 */
export const SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO =
  "slot 4 (valore relativo): la sorgente è relativePriceReading() — secondo max bid " +
  "fra i rivali eleggibili, +1, con tetto al più ricco e a maxSafe(io, ruolo). " +
  "DecisionNumbers.fairToMeMaxEffective non alimenta più questo slot e resta senza " +
  "consumatori su questo percorso: marcato, non rimosso.";
