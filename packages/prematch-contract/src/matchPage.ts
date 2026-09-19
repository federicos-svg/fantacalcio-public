// LA PAGINA DI UNA PARTITA — la formazione, e chi è sceso in campo davvero.
//
// Che cosa descrive questo file: **ciò che una pagina pre-partita espone su una
// singola partita** — formazione per squadra, panchina, sostituzioni, modulo,
// allenatore, arbitro — e nient'altro. Nessun host, nessun indirizzo, nessun
// selettore: chi legge la pagina vive nel layer privato e consegna qui un
// candidato già estratto. Questo pacchetto dice che forma deve avere, e lo
// rifiuta quando non ce l'ha.
//
// LA PREVISIONE E LA VERITÀ SONO LA STESSA STRUTTURA, e non è un risparmio: è
// il fatto osservato il 2026-09-04 — la stessa pagina porta le probabili prima
// del fischio d'inizio e le formazioni effettive dopo. Quello che le distingue
// non è la forma, sono due cose che vanno tenute separate con cura:
//
//   * `nature`, che la fonte DICHIARA — probabile, effettiva, oppure **niente**.
//     Non si deduce mai: una previsione scambiata per una verità falsa ogni
//     misura futura. Quando la fonte tace, la formazione esce con `undeclared`
//     addosso e `canStandAsTruth` la esclude dalla verità — vedi `LineupNature`.
//     La pagina della **singola partita** resta più severa e si ferma: là le due
//     dichiarazioni sono state misurate presenti, e un silenzio sarebbe una
//     struttura cambiata, non un modo di scrivere della fonte;
//   * il MOMENTO dell'istantanea rispetto al calcio d'inizio, che si calcola
//     dagli istanti e serve alla regola (a) del requisito di misurabilità:
//     vale l'ultima istantanea presa prima del calcio d'inizio, e ciò che una
//     fonte scrive dopo non conta come previsione.
//
// I DUE NON SI IMPLICANO. Una fonte può pubblicare le formazioni ufficiali un'ora
// prima del fischio: `nature` è «effettiva» e l'istantanea è «prima». Chi
// confondesse le due dimensioni finirebbe per dedurre l'una dall'altra, che è
// esattamente il divieto.
//
// OGNI LISTA DICE QUANTO È COMPLETA, e chi la legge non lo indovina. È il
// requisito che nasce dalla misura di affidabilità e cade qui: una fonte che
// nomina l'undici e tace sulla panchina non è una fonte che ha detto «questi
// undici e nessun altro». Vedi `Completeness` e `ObservedRoster` qui sotto.
//
// GLI STATI DI UN GIOCATORE NON SONO POSTI IN UNA FORMAZIONE. Infortunato,
// squalificato, diffidato: sono cose che valgono **del giocatore**, e non del
// suo posto nell'undici. Stanno quindi in un tipo loro — `ObservedPlayerCondition`
// — e non dentro `ObservedPlayer`, che descrive un nome in una lista. Le liste
// `unavailable` e `suspended` restano dove sono e significano quello che hanno
// sempre significato: **la sezione che la pagina espone**, con i nomi che ci
// stanno dentro. «La pagina ha una sezione indisponibili e contiene questo
// nome» e «la fonte dichiara che questo giocatore è infortunato» sono due
// fatti diversi, nessuno dei due si ricava dall'altro, e questo file non prova
// a farlo.
//
// IL DIFFIDATO NON È UNO SQUALIFICATO, e tenerli separati non è pignoleria: un
// diffidato **gioca**, e chi lo trattasse come uno squalificato lo toglierebbe
// da una formazione in cui la fonte lo mette. Prima di `ObservedPlayerCondition`
// il diffidato non aveva casa: la sola scelta era infilarlo in una delle due
// liste esistenti, cioè dire il falso.
//
// QUESTO FILE NON MISURA NIENTE. Il confronto per giocatore, l'aggregazione per
// fonte e per squadra, le soglie e i pesi sono lavoro futuro, esplicitamente non
// progettato nel record che autorizza queste pagine. Qui c'è solo la materia
// prima che quel lavoro richiederà: dati con la loro provenienza, e un'istantanea
// che sa dire da che parte del fischio d'inizio sta.

import { readField, readFieldOrUnobserved, type Field } from "./field.js";
import { readProvenance, type Provenance } from "./provenance.js";
import {
  carryFailure,
  isRead,
  outOfContract,
  read,
  readInstant,
  readLabel,
  readList,
  readRecord,
  readWholeNumber,
  shapeNotRecognised,
  type ReadOutcome,
} from "./readOutcome.js";

/**
 * QUANTO LA FONTE DICHIARA DI AVER DETTO — e perché è un dato, non un dettaglio.
 *
 * Una lista di nomi, da sola, non dice se è tutta la lista. E quella differenza
 * decide se una fonte è brava o se ha soltanto taciuto: se una pagina nomina
 * l'undici e non dice niente della panchina, ogni panchinaro le risulterebbe
 * «previsto non titolare» — e siccome in panchina si va spesso, la fonte
 * apparirebbe **brava per caso**, con un merito che nessuno le ha visto
 * guadagnare. Sapendo invece che quella lista è parziale, quei giocatori escono
 * dal conto come **silenzio**, che è la verità.
 *
 * Tre valori e non due:
 *
 *   * `declared-complete` — la fonte dichiara che quella lista è completa. Solo
 *     qui l'assenza di un nome è un'informazione;
 *   * `declared-partial` — la fonte dichiara che ne manca un pezzo;
 *   * `unknown` — **la pagina non lo dice**, ed è il valore di gran lunga più
 *     frequente. Non è un ripiego prudente: è il fatto.
 *
 * **`unknown` non ha un default ottimista, e non ne avrà mai uno.** Chi in
 * futuro sarà tentato di far valere «completa» quando la pagina tace stia
 * attento a che cosa compra: guadagna qualche osservazione in più nella misura,
 * e in cambio regala punteggio a ogni fonte che si è limitata a scrivere meno.
 * Il conto non torna in nessun caso.
 *
 * NON SI DEDUCE DAL CONTEGGIO. Undici nomi non dichiarano una lista completa —
 * una fonte può pubblicarne undici perché sono quelli che sa, non perché siano
 * tutti — e questo pacchetto non ha, e non deve avere, una funzione che guardi
 * la lunghezza dell'elenco per decidere.
 */
export type Completeness = "declared-complete" | "declared-partial" | "unknown";

/**
 * Una lista di giocatori **con la dichiarazione di quanto è completa**.
 *
 * I due dati viaggiano insieme perché separarli è precisamente il modo in cui
 * si perdono: una lista che gira da sola arriva a valle senza il suo «forse
 * manca qualcuno», e a valle nessuno può più recuperarlo.
 *
 * Attenzione alla distinzione che è già costata cara: `players: []` dentro un
 * campo osservato significa «la fonte espone la sezione e lì non c'è nessuno»;
 * una panchina che sulla pagina **non compare affatto** non è una panchina
 * vuota, è un campo `absent-in-source` o `not-observed`, e non deve mai
 * diventare un elenco vuoto.
 */
export interface ObservedRoster {
  readonly players: readonly ObservedPlayer[];
  readonly completeness: Completeness;
}

/**
 * OGNI LISTA DI QUESTO CONTRATTO DICHIARA QUANTO È COMPLETA — questo è il tipo
 * che lo dice, e il motivo per cui le due funzioni qui sotto non parlano solo
 * dell'undici e della panchina.
 *
 * Una pagina pre-partita porta altre liste: gli stati dei giocatori, le
 * previsioni di titolarità. Per tutte vale la stessa regola, e con lo stesso
 * conto: chi non compare in una lista che nessuno ha dichiarato completa **non
 * è un'informazione**. Un elenco di infortunati che non si dichiara completo
 * non dice che gli altri stanno bene.
 */
export interface DeclaresCompleteness {
  readonly completeness: Completeness;
}

/**
 * La completezza di una lista, tenendo conto anche del caso in cui la lista non
 * ci sia: nessuna lista, nessuna dichiarazione, quindi `unknown`.
 *
 * Il nome dice «roster» per la storia — è nata sull'undici — ma la domanda a
 * cui risponde vale per qualunque lista che la propria completezza la dichiari.
 */
export function rosterCompleteness(roster: Field<DeclaresCompleteness>): Completeness {
  return roster.presence === "observed" ? roster.value.completeness : "unknown";
}

/**
 * L'ASSENZA DI UN NOME DA QUESTA LISTA VUOL DIRE QUALCOSA?
 *
 * Vero **solo** se la lista è stata osservata e la fonte la dichiara completa.
 * È la funzione che chi misura l'affidabilità di una fonte deve attraversare
 * prima di contare un giocatore come «non previsto»: fuori di qui quel conto si
 * fa a occhio, e a occhio si conta il silenzio come una previsione.
 */
export function absenceIsMeaningful(roster: Field<DeclaresCompleteness>): boolean {
  return rosterCompleteness(roster) === "declared-complete";
}

/**
 * Un giocatore come la fonte lo scrive.
 *
 * `displayName` è l'etichetta della fonte, **non un'identità risolta**: due
 * fonti scrivono lo stesso giocatore in due modi, e riconciliarli è un altro
 * mestiere con un'altra casa. Inventare qui un identificativo significherebbe
 * decidere in silenzio che due nomi sono la stessa persona.
 */
export interface ObservedPlayer {
  readonly displayName: string;
  readonly shirtNumber: Field<number>;
  /** L'etichetta di ruolo della fonte, se c'è: non il ruolo di lega. */
  readonly role: Field<string>;
}

/**
 * LO STATO IN CUI LA FONTE DICHIARA UN GIOCATORE. Elenco chiuso, tre valori, e
 * nessuno dei tre si ricava da un altro.
 *
 *   * `injured` — la fonte lo dà infortunato: dice qualcosa del suo corpo, non
 *     del regolamento;
 *   * `suspended` — la fonte lo dà squalificato: **non può giocare**, e a dirlo
 *     è una decisione, non una previsione;
 *   * `warned` — il diffidato: un cartellino lo separa dalla squalifica, e
 *     intanto **gioca**. È il valore che non c'era, ed è il motivo per cui
 *     questo tipo è nato: l'unico modo di portarlo a valle era infilarlo fra
 *     gli squalificati o fra gli indisponibili, cioè dichiarare che non gioca
 *     uno che gioca.
 *
 * NON C'È UN QUARTO VALORE PER «IN DUBBIO», e non ci deve arrivare. Il dubbio
 * non è uno stato del giocatore: è una **previsione** su chi scenderà in campo
 * in una partita, e vive con la previsione — `ObservedStartingForecast` in
 * `gameweekPages.ts`. Un giocatore in dubbio è sano e senza squalifiche:
 * scriverlo qui gli attribuirebbe una condizione che la fonte non ha
 * dichiarato.
 */
export type PlayerConditionKind = "injured" | "suspended" | "warned";

/**
 * Uno stato che la fonte dichiara per un giocatore che nomina.
 *
 * `player` è l'etichetta della fonte, con la stessa avvertenza di
 * `ObservedPlayer.displayName`: non è un'identità risolta, e ricongiungerla a
 * un nome dell'undici è un mestiere che questo pacchetto non fa. Nessuna
 * funzione qui dentro confronta i due elenchi, e nessuna toglie dalla
 * formazione un nome che compare fra gli squalificati: sarebbe una decisione
 * sul prodotto presa dentro una lettura.
 */
export interface ObservedPlayerCondition {
  readonly player: string;
  readonly kind: PlayerConditionKind;
}

/**
 * Gli stati dichiarati per una squadra, **con la dichiarazione di quanto
 * l'elenco è completo**.
 *
 * La completezza viaggia insieme alla lista per la ragione di sempre, che qui
 * morde più che altrove: un elenco di infortunati che nessuno dichiara completo
 * **non dice che gli altri sono sani**. Chi lo leggesse così costruirebbe una
 * formazione sopra una salute che nessuno ha affermato.
 *
 * NON È LA LISTA `unavailable`, E NON LA SOSTITUISCE. Quella è la **sezione**
 * che la pagina espone, con dentro i nomi che ci stanno; questa dice **quale
 * stato** la fonte attribuisce a un giocatore. Una fonte può avere l'una e non
 * l'altra, e nessuna delle due si ricava dall'altra: dalla sezione
 * «indisponibili» non si deduce che quei nomi siano infortunati — potrebbero
 * essere squalificati — e da uno stato non si deduce una sezione.
 */
export interface ObservedConditionList {
  readonly conditions: readonly ObservedPlayerCondition[];
  readonly completeness: Completeness;
}

/**
 * Una sostituzione.
 *
 * `minute` è un campo, e sulla pagina partita osservata il 2026-09-04 è
 * **assente nella fonte**: i minuti di ingresso e di uscita lì non ci sono. Il
 * tipo lo sa dire; il lettore non lo inventa.
 */
export interface ObservedSubstitution {
  readonly off: string;
  readonly on: string;
  readonly minute: Field<number>;
}

/**
 * Un ballottaggio: due o più nomi in lizza per lo stesso posto.
 *
 * `favourite` esiste solo se **la fonte** indica un favorito. Nessuna funzione
 * di questo pacchetto ne sceglie uno: un ballottaggio risolto da noi sarebbe un
 * output direttivo travestito da lettura.
 *
 * `note` È L'ANNOTAZIONE BREVE DELLA FONTE, e non è una deroga al divieto di
 * ripubblicare testo editoriale: si legge con la stessa guardia di ogni altra
 * etichetta di questo pacchetto — `readLabel` — quindi una riga sola e non più
 * lunga di `MAX_LABEL_LENGTH`. Una nota che è una frase viene rifiutata
 * `out-of-contract`, ed è la risposta giusta: a quella lunghezza non è più
 * un'annotazione, è prosa, e la prosa resta dov'è.
 *
 * E NON SI LEGGE. La nota si porta a valle **come la fonte l'ha scritta**:
 * nessuna funzione qui dentro ci cerca dentro un favorito, una percentuale o un
 * «probabile». Un ballottaggio senza favorito dichiarato resta senza favorito
 * anche quando la nota sembra suggerirne uno — dedurlo dal testo sarebbe
 * esattamente il ballottaggio risolto da noi che il paragrafo sopra vieta,
 * fatto per la porta di servizio.
 */
export interface ObservedDuel {
  readonly contenders: readonly string[];
  readonly favourite: Field<string>;
  readonly note: Field<string>;
}

/**
 * Che cosa la fonte dichiara di stare pubblicando. **Mai dedotto**, e il terzo
 * valore è lì per non doverlo dedurre.
 *
 * `undeclared` — LA FONTE NON LO SCRIVE. È il caso misurato sull'istantanea
 * `357beb2f…` del 2026-09-11T17:53:47Z (l'ancora, con le impronte, sta in
 * `index.ts`): la pagina generale delle probabili di una testata porta dieci
 * partite e non dice, da nessuna parte, se le formazioni che pubblica sono
 * previsioni o la verità. Il campo che sembrava dirlo è lo stato **della
 * partita** — «da giocare» — che non è lo stato della formazione: una
 * formazione ufficiale esce mentre la partita è ancora da giocare, e leggere
 * l'uno come l'altro sarebbe la deduzione peggiore possibile, perché sbaglia
 * proprio nei minuti in cui la verità arriva.
 *
 * PERCHÉ UN TERZO VALORE E NON UNA FERMATA. Le due uscite oneste erano: fermare
 * la lettura, oppure lasciar passare il dato con la propria incertezza addosso.
 * La prima butta via duecentoventi righe vere per una cosa che la fonte non ha
 * scritto; la seconda le conserva **a patto che nessuno possa scambiarle per
 * una verità**. Questo tipo sceglie la seconda, e la garanzia sta in
 * `canStandAsTruth`: `undeclared` non è mai verità, e non lo diventa per
 * comodità di chi legge. Scelta tecnica dell'Executive delegato, dichiarata
 * come propria e contestabile.
 *
 * QUELLO CHE `undeclared` NON È: non è «probabile per difetto». Chi lo trattasse
 * come una previsione regalerebbe alla fonte ogni formazione ufficiale che ha
 * pubblicato senza dirlo, e la misura d'affidabilità finirebbe per confrontare
 * una fonte con se stessa. Un consumatore che ha bisogno di sapere quale delle
 * due è, deve trovare la dichiarazione altrove o rinunciare.
 */
export type LineupNature = "probable" | "actual" | "undeclared";

/**
 * Se una formazione può reggere come **verità su chi è sceso in campo**.
 *
 * Solo `actual`, e per una ragione sola: è l'unico dei tre valori in cui la
 * fonte **ha scritto** che quella formazione è un fatto. `probable` è una
 * previsione per dichiarazione, `undeclared` è una previsione o un fatto e
 * nessuno sa quale — e «nessuno sa quale» non si arrotonda al caso comodo.
 *
 * Esiste come funzione, e non come confronto scritto a mano da chi consuma,
 * perché un confronto scritto a mano diventa `!== "probable"` alla prima
 * fretta, e `!== "probable"` è vero anche per `undeclared`.
 */
export function canStandAsTruth(nature: LineupNature): boolean {
  return nature === "actual";
}

/**
 * Il modulo come la fonte lo scrive — «4-3-3», «3-5-2».
 *
 * È il modulo **della fonte**, non il modulo del regolamento della lega: i due
 * vivono in mondi diversi e questo pacchetto non conosce il secondo. La lettura
 * controlla soltanto che il testo abbia la forma di un modulo; non verifica che
 * i numeri sommino a dieci, perché una fonte che scrive un modulo impossibile è
 * un fatto da dichiarare, non da correggere.
 */
export type FormationShape = string;

export interface ObservedTeamLineup {
  /** L'etichetta della squadra come la fonte la scrive. */
  readonly team: string;
  readonly nature: LineupNature;
  readonly module: Field<FormationShape>;
  readonly coach: Field<string>;
  readonly starters: Field<ObservedRoster>;
  readonly bench: Field<ObservedRoster>;
  readonly substitutions: Field<readonly ObservedSubstitution[]>;
  readonly unavailable: Field<ObservedRoster>;
  readonly suspended: Field<ObservedRoster>;
  readonly duels: Field<readonly ObservedDuel[]>;
  /**
   * GLI STATI DICHIARATI PER I GIOCATORI DI QUESTA SQUADRA — infortunati,
   * squalificati, diffidati — con la loro dichiarazione di completezza.
   *
   * Sta accanto a `unavailable` e `suspended` e non al loro posto: quelle due
   * sono le sezioni della pagina, questa è ciò che la fonte dice **del
   * giocatore**. Una fonte può pubblicare l'una senza l'altra, e il diffidato —
   * che gioca — non ha nessun'altra casa in cui arrivare a valle senza essere
   * scambiato per uno che non gioca.
   */
  readonly conditions: Field<ObservedConditionList>;
  /**
   * La formazione **nel suo insieme**: la fonte dichiara di aver detto tutto
   * quello che c'era da dire su questa squadra, oppure no.
   *
   * Non si ricava dalla completezza delle singole liste, e non è la loro
   * congiunzione: una fonte può dichiarare completo l'undici e completa la
   * panchina, e tacere che gli indisponibili li pubblica altrove. Ricavarlo
   * sarebbe la solita deduzione, con la solita conseguenza — una fonte che
   * sembra più informativa di quanto sia.
   */
  readonly completeness: Completeness;
}

/**
 * La pagina di una partita.
 *
 * `referee` è un campo come gli altri: il record lo ammette «se la pagina lo
 * espone», e una pagina che non lo espone lo dichiara assente.
 */
export interface ObservedMatchPage {
  readonly provenance: Provenance;
  readonly home: ObservedTeamLineup;
  readonly away: ObservedTeamLineup;
  readonly kickOff: Field<string>;
  readonly referee: Field<string>;
}

/** Da che parte del fischio d'inizio sta un'istantanea. */
export type SnapshotSide = "before-kick-off" | "after-kick-off" | "undetermined";

/**
 * Colloca un'istantanea rispetto al calcio d'inizio — fail-closed.
 *
 * Tre esiti e non due, perché il caso in cui non si sa è reale e frequente: se
 * il calcio d'inizio non è stato osservato, l'istantanea è `undetermined` e
 * **non vale né come previsione né come verifica**. Anche l'istante esattamente
 * uguale al fischio d'inizio è `undetermined`: non è «prima» in nessun senso
 * utile, e chiamarlo previsione sarebbe un arrotondamento a nostro favore.
 */
export function classifySnapshot(observedAt: string, kickOff: Field<string>): SnapshotSide {
  if (kickOff.presence !== "observed") return "undetermined";
  const observedMs = Date.parse(observedAt);
  const kickOffMs = Date.parse(kickOff.value);
  if (Number.isNaN(observedMs) || Number.isNaN(kickOffMs)) return "undetermined";
  if (observedMs < kickOffMs) return "before-kick-off";
  if (observedMs > kickOffMs) return "after-kick-off";
  return "undetermined";
}

/** L'istantanea di questa pagina, rispetto al suo calcio d'inizio. */
export function matchPageSnapshot(page: ObservedMatchPage): SnapshotSide {
  return classifySnapshot(page.provenance.observedAt, page.kickOff);
}

const MODULE_SHAPE = /^\d{1,2}(-\d{1,2}){1,4}$/;

function readModule(candidate: unknown, at: readonly string[]): ReadOutcome<FormationShape> {
  const label = readLabel(candidate, at);
  if (!isRead(label)) return label;
  if (!MODULE_SHAPE.test(label.value)) {
    return outOfContract<FormationShape>("un modulo è fatto di numeri separati da trattini", at);
  }
  return label;
}

function readMinute(candidate: unknown, at: readonly string[]): ReadOutcome<number> {
  const minute = readWholeNumber(candidate, at);
  if (!isRead(minute)) return minute;
  // Nessun tetto sui recuperi: 90+7 si scrive 97, e un minuto alto è un fatto,
  // non un errore. Il tetto largo serve solo a fermare un numero che non è un
  // minuto — un anno, un identificativo — finito lì per sbaglio.
  if (minute.value > 130) {
    return outOfContract<number>("un minuto di partita non arriva a 130", at);
  }
  return minute;
}

export function readPlayer(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedPlayer> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const displayName = readLabel(record.value["displayName"], [...at, "displayName"]);
  if (!isRead(displayName)) return carryFailure(displayName);

  const shirtNumber = readField(record.value["shirtNumber"], [...at, "shirtNumber"], readWholeNumber);
  if (!isRead(shirtNumber)) return carryFailure(shirtNumber);

  const role = readField(record.value["role"], [...at, "role"], readLabel);
  if (!isRead(role)) return carryFailure(role);

  return read({ displayName: displayName.value, shirtNumber: shirtNumber.value, role: role.value });
}

export function readSubstitution(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedSubstitution> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const off = readLabel(record.value["off"], [...at, "off"]);
  if (!isRead(off)) return carryFailure(off);

  const on = readLabel(record.value["on"], [...at, "on"]);
  if (!isRead(on)) return carryFailure(on);

  if (off.value === on.value) {
    return outOfContract<ObservedSubstitution>("chi esce e chi entra non possono essere lo stesso nome", at);
  }

  const minute = readField(record.value["minute"], [...at, "minute"], readMinute);
  if (!isRead(minute)) return carryFailure(minute);

  return read({ off: off.value, on: on.value, minute: minute.value });
}

export function readDuel(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedDuel> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const contenders = readList(record.value["contenders"], [...at, "contenders"], readLabel);
  if (!isRead(contenders)) return carryFailure(contenders);
  if (contenders.value.length < 2) {
    return outOfContract<ObservedDuel>("un ballottaggio ha almeno due nomi in lizza", [...at, "contenders"]);
  }

  const favourite = readField(record.value["favourite"], [...at, "favourite"], readLabel);
  if (!isRead(favourite)) return carryFailure(favourite);
  const chosen = favourite.value.presence === "observed" ? favourite.value.value : null;
  if (chosen !== null && !contenders.value.includes(chosen)) {
    return outOfContract<ObservedDuel>(
      "il favorito indicato dalla fonte non è fra i nomi in lizza",
      [...at, "favourite"],
    );
  }

  // La nota è nata dopo i ballottaggi: un candidato che non la nomina è un
  // lettore scritto prima, non una fonte che non ce l'ha.
  const note = readFieldOrUnobserved(record.value["note"], [...at, "note"], readLabel);
  if (!isRead(note)) return carryFailure(note);

  return read({ contenders: contenders.value, favourite: favourite.value, note: note.value });
}

/**
 * Legge uno stato dichiarato per un giocatore.
 *
 * `kind` è obbligatorio e chiuso: uno stato che la fonte scrive con una parola
 * che non sappiamo classificare non diventa «infortunato» per somiglianza, e
 * non diventa nemmeno un quarto valore inventato qui. Chi legge la pagina
 * traduce i modi di dire della fonte in uno dei tre, oppure non produce la
 * voce: una voce non prodotta è silenzio, una voce classificata a caso è una
 * bugia che nessuno a valle può più smontare.
 */
export function readPlayerCondition(
  candidate: unknown,
  at: readonly string[],
): ReadOutcome<ObservedPlayerCondition> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const player = readLabel(record.value["player"], [...at, "player"]);
  if (!isRead(player)) return carryFailure(player);

  const kind = record.value["kind"];
  if (kind !== "injured" && kind !== "suspended" && kind !== "warned") {
    return shapeNotRecognised<ObservedPlayerCondition>(
      "lo stato di un giocatore è un valore chiuso: injured, suspended oppure warned",
      [...at, "kind"],
    );
  }

  return read({ player: player.value, kind });
}

function readConditionList(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedConditionList> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const conditions = readList(record.value["conditions"], [...at, "conditions"], readPlayerCondition);
  if (!isRead(conditions)) return carryFailure(conditions);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({ conditions: conditions.value, completeness: completeness.value });
}

/**
 * Legge la dichiarazione di completezza.
 *
 * **Obbligatoria e senza ripiego.** Una lista che arriva qui senza dichiarare
 * quanto è completa non diventa `unknown`: si ferma. La differenza è fra una
 * pagina che non lo dice — e allora chi l'ha letta scrive `unknown`, che è un
 * fatto — e un candidato costruito male, che è un difetto e va visto. Un
 * ripiego silenzioso qui renderebbe i due casi indistinguibili per sempre.
 */
export function readCompleteness(candidate: unknown, at: readonly string[]): ReadOutcome<Completeness> {
  if (candidate === "declared-complete" || candidate === "declared-partial" || candidate === "unknown") {
    return read(candidate);
  }
  return shapeNotRecognised<Completeness>(
    "la completezza va dichiarata: declared-complete, declared-partial oppure unknown",
    at,
  );
}

function readRoster(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedRoster> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const players = readList(record.value["players"], [...at, "players"], readPlayer);
  if (!isRead(players)) return carryFailure(players);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({ players: players.value, completeness: completeness.value });
}

export function readTeamLineup(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedTeamLineup> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const team = readLabel(record.value["team"], [...at, "team"]);
  if (!isRead(team)) return carryFailure(team);

  const nature = record.value["nature"];
  if (nature !== "probable" && nature !== "actual" && nature !== "undeclared") {
    return shapeNotRecognised<ObservedTeamLineup>(
      "la natura della formazione è un valore chiuso: probable, actual, oppure undeclared quando la fonte tace",
      [...at, "nature"],
    );
  }

  const module = readField(record.value["module"], [...at, "module"], readModule);
  if (!isRead(module)) return carryFailure(module);

  const coach = readField(record.value["coach"], [...at, "coach"], readLabel);
  if (!isRead(coach)) return carryFailure(coach);

  const starters = readField(record.value["starters"], [...at, "starters"], readRoster);
  if (!isRead(starters)) return carryFailure(starters);

  const bench = readField(record.value["bench"], [...at, "bench"], readRoster);
  if (!isRead(bench)) return carryFailure(bench);

  const substitutions = readField(record.value["substitutions"], [...at, "substitutions"], (value, valueAt) =>
    readList(value, valueAt, readSubstitution),
  );
  if (!isRead(substitutions)) return carryFailure(substitutions);

  const unavailable = readField(record.value["unavailable"], [...at, "unavailable"], readRoster);
  if (!isRead(unavailable)) return carryFailure(unavailable);

  const suspended = readField(record.value["suspended"], [...at, "suspended"], readRoster);
  if (!isRead(suspended)) return carryFailure(suspended);

  const duels = readField(record.value["duels"], [...at, "duels"], (value, valueAt) =>
    readList(value, valueAt, readDuel),
  );
  if (!isRead(duels)) return carryFailure(duels);

  // Gli stati sono nati dopo la formazione: un candidato che non li nomina è un
  // lettore scritto prima che esistessero, e «non guardato» è l'unica cosa che
  // si possa dire di lui. Un lettore che li guarda dichiara da sé
  // `absent-in-source` quando la pagina non li espone.
  const conditions = readFieldOrUnobserved(record.value["conditions"], [...at, "conditions"], readConditionList);
  if (!isRead(conditions)) return carryFailure(conditions);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({
    team: team.value,
    nature,
    module: module.value,
    coach: coach.value,
    starters: starters.value,
    bench: bench.value,
    substitutions: substitutions.value,
    unavailable: unavailable.value,
    suspended: suspended.value,
    duels: duels.value,
    conditions: conditions.value,
    completeness: completeness.value,
  });
}

export function readMatchPage(candidate: unknown, at: readonly string[] = ["matchPage"]): ReadOutcome<ObservedMatchPage> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const provenance = readProvenance(record.value["provenance"], [...at, "provenance"]);
  if (!isRead(provenance)) return carryFailure(provenance);

  const home = readTeamLineup(record.value["home"], [...at, "home"]);
  if (!isRead(home)) return carryFailure(home);

  const away = readTeamLineup(record.value["away"], [...at, "away"]);
  if (!isRead(away)) return carryFailure(away);

  if (home.value.team === away.value.team) {
    return outOfContract<ObservedMatchPage>("le due squadre di una partita non possono essere la stessa", at);
  }

  const kickOff = readField(record.value["kickOff"], [...at, "kickOff"], readInstant);
  if (!isRead(kickOff)) return carryFailure(kickOff);

  const referee = readField(record.value["referee"], [...at, "referee"], readLabel);
  if (!isRead(referee)) return carryFailure(referee);

  return read({
    provenance: provenance.value,
    home: home.value,
    away: away.value,
    kickOff: kickOff.value,
    referee: referee.value,
  });
}
