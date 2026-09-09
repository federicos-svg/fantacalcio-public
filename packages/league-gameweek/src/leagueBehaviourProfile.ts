// IL PROFILO DI COMPORTAMENTO DELLE SQUADRE DELLA LEGA, SU TUTTE LE GIORNATE.
// Il «profilo per avversario» di §8.3 del disegno del generatore, alimentato da
// §8.2 (la fotografia per giornata). Fase 2 — Lineup Coach.
//
// DUE DELLE QUATTRO QUANTITÀ SONO NEL DISEGNO, DUE LE AGGIUNGO IO. §8.3 elenca
// testualmente i conteggi dei moduli usati e «ripete la formazione precedente»;
// NON contiene «sconfitta» né «quotazione», in §8.3 né altrove nel documento.
// Le altre due sono un'aggiunta di chi scrive, dichiarata alla nota i) e
// contestabile come tutte le altre. L'artefatto è di §8.3; l'elenco delle
// quantità non lo è per intero, e questo file non deve lasciar credere il
// contrario.
//
// PERCHÉ ESISTE, E PERCHÉ NON COSTA NULLA. `opponentDistribution.ts` consuma un
// insieme PESATO di formazioni avversarie; §8.4 dice da dove vengono quei pesi,
// e la prima riga della formula è «i conteggi dei moduli di quella squadra». Chi
// quei conteggi li produce non c'era. Oggi il modello dell'avversario guarda la
// sfida che ci riguarda: UNA formazione avversaria per giornata, circa 38 in una
// stagione. Ma la fotografia di §8.2 legge l'INTERA giornata di lega — quattro
// sfide, otto formazioni — e sei su otto finivano nel cestino. Osservandole
// tutte le osservazioni diventano circa 300 invece di 38, senza una richiesta in
// più a nessuno: è la stessa lettura, letta tutta.
//
// QUESTO MODULO NON SOSTITUISCE NIENTE. Non tocca `opponentDistribution.ts`, non
// costruisce formazioni, non pesa niente per conto della ricerca: produce i
// CONTEGGI e le loro stime prudenti, che sono l'ingrediente che a §8.4 mancava.
// Chi vorrà usarli per costruire `WeightedOpponentLineup` lo farà altrove, e
// sarà un altro lavoro con un'altra revisione.
//
// ── LE QUATTRO REGOLE CHE GOVERNANO OGNI RIGA DI QUESTO FILE ─────────────────
//
// 1) IL PERICOLO È IMPARARE IL RUMORE E SEMBRARE BRAVI. Anche con 300
//    osservazioni di lega, per SQUADRA restano circa 38 giornate — e per le
//    quantità condizionate (che cosa ha fatto DOPO una sconfitta) molte meno.
//    Una frequenza grezza su otto casi non è un'abitudine: è un aneddoto con
//    l'aria di un numero, e ha esattamente lo stesso aspetto di un'abitudine
//    vera. Perciò qui NON esiste una frequenza grezza in uscita: ogni quantità è
//    uno SHRINK verso il riferimento della lega, con la stessa forma di
//    `baseForecast.ts` — peso osservato più K osservazioni finte distribuite
//    come il riferimento. Con zero osservazioni la stima È il riferimento; con
//    molte il riferimento sparisce; in mezzo la miscela è continua e nessuna
//    soglia fa saltare una squadra da un profilo all'altro a giornate +1. I
//    conteggi grezzi restano in uscita — §8.3 vuole conteggi — ma come EVIDENZA
//    accanto alla stima, non come la stima.
//
// 2) OSSERVARE NON È CAPIRE. Si può misurare CHE COSA una squadra ha fatto; il
//    PERCHÉ non lo sappiamo e non lo sapremo da qui. Quindi ogni quantità è
//    nominata per l'atto contato — «quante volte il giocatore più quotato fra
//    quelli disponibili era fra i titolari» — e mai per l'intenzione che
//    verrebbe da leggerci dentro («quanto è fedele ai big», «quanto è
//    prudente», «insegue la forma»). Non è pudore lessicale: un nome che
//    attribuisce un'intenzione la fa poi trovare a chi legge il numero, e il
//    profilo diventa una storia che si conferma da sola. §8.3 lo dice già per i
//    profili d'asta — «nessun punteggio di psicologia, nessuna etichetta» — e
//    qui vale identico.
//
// 3) UNA SQUADRA MAI OSSERVATA NON HA UN PROFILO. Ha il riferimento della lega,
//    e lo dice: `basis: "riferimento-di-lega"`. L'elenco delle squadre della
//    lega lo DICHIARA il chiamante e non si deduce da chi è comparso nelle
//    fotografie — dedurlo significherebbe che una squadra mai vista sparisce
//    invece di comparire col riferimento, che è il caso esatto per cui questa
//    regola esiste. Nessun ripiego silenzioso: dove la quantità non è
//    misurabile il conto NON avviene e il numero delle occasioni saltate esce
//    in chiaro.
//
// 4) UNA FORMAZIONE LETTA NON È UNA FORMAZIONE SCHIERATA. È la distinzione che
//    questa corsia ha già pagato — `lineupObservation.ts` esiste per un difetto
//    della stessa famiglia: una formazione non porta scritto addosso che cosa
//    sia. Una lettura fatta prima della scadenza, o una rilettura che non
//    coincide, è una BOZZA: contarla come una scelta significa mettere nel
//    profilo di una squadra ciò che quella squadra non ha schierato. Questo
//    modulo non può distinguerle guardando i nomi — una bozza e una formazione
//    hanno gli stessi campi — quindi fa l'unica cosa onesta: PRETENDE che chi
//    passa il dato lo dichiari, riga per riga (`status`), e le righe non
//    confermate le tiene fuori da tutto, compresa la catena delle giornate
//    consecutive. Il campo non ha valore di ripiego: una riga senza `status`
//    ferma il calcolo invece di essere promossa a scelta vera.
//
// ── CHE COSA QUESTO MODULO NON È, E NON DIVENTA ──────────────────────────────
//
// NON SERVE ALL'ASTA, e la distinzione non è formale. `packages/opponent-
// profiles` è il profilo d'asta (intervista pre-asta più contatori del log
// d'asta): un altro perimetro, un altro contratto, un'altra decisione di
// prodotto. Questo modulo vive nella Fase 2, parla di FORMAZIONI e alimenta la
// distribuzione avversaria di §8.4. Il legame fra comportamento osservato in
// formazione e prodotto d'asta è una decisione di prodotto che nessuno ha preso,
// e non si prende scrivendo un import: la guardia di perimetro è già viva in
// `tests/isolation.test.ts` di questo pacchetto.
//
// LA QUOTAZIONE DICHIARATA NON È UN PREZZO D'ASTA. Entra qui come SOLO ORDINE —
// serve a dire quale, fra i giocatori che la squadra aveva a disposizione, era
// il più quotato — e non viene sommata, spesa, confrontata con un budget né
// restituita. Se un giorno servisse a un calcolo d'asta, quel calcolo non
// nascerà qui.
//
// NON C'È NESSUN OUTPUT DIRETTIVO. Questo modulo non dice che cosa fare, non
// ordina avversari, non produce un valore, una fascia o un consiglio: conta e
// stima quantità descrittive. E non legge l'orologio: nessuna `Date`, nessun
// `Date.now()`, nessun `Math.random()`. La stessa storia dà lo stesso profilo
// per sempre, bit a bit.
//
// ── SCELTE DI CHI SCRIVE, DICHIARATE E CONTESTABILI ──────────────────────────
//
// a) OGNI QUANTITÀ È UNA DISTRIBUZIONE SU CATEGORIE CHIUSE, anche quando le
//    categorie sono due. È la scelta che permette UNA sola formula di shrink per
//    tutto il file — quella di §8.4, che era già scritta per i moduli — invece
//    di una formula per le distribuzioni e una per i tassi, con due ancore
//    scelte separatamente e due modi di sbagliare. L'ancora esterna è quindi
//    sempre la stessa cosa: uniforme sulle categorie dichiarate.
// b) I DUE PESI VENGONO DA §8.4 E NON LI SCELGO IO: `TEAM_PSEUDO_GAMEWEEKS = 4`
//    (k) e `LEAGUE_PSEUDO_GAMEWEEKS = 8` (k'), in giornate equivalenti — quattro
//    giornate per fidarsi di una squadra invece che della lega, e una giornata
//    di tutte e otto le squadre per fidarsi della lega invece dell'uniforme.
//    Cambiarli cambia ogni numero prodotto qui e vuole un record datato.
// c) LO SHRINK È A DUE LIVELLI E IL LIVELLO ESTERNO ESISTE PER UNA RAGIONE
//    PRECISA: a inizio stagione anche la LEGA ha pochi dati, e una squadra senza
//    osservazioni ereditava un riferimento che era a sua volta rumore. Con
//    l'ancora uniforme il caso «nessuno ha ancora giocato» dà l'uniforme, che è
//    la risposta giusta a «non lo so» e non uno zero travestito.
// d) LE GIORNATE CONSECUTIVE SONO CONSECUTIVE PER NUMERO, non «le prossime che
//    ho in mano». Le quantità che confrontano una giornata con la precedente
//    (l'undici ripetuto, il modulo dopo una sconfitta) contano un'occasione solo
//    se le due giornate confermate sono `g` e `g+1`. Un buco significa che in
//    mezzo è successo qualcosa che non abbiamo visto, e «uguale alla
//    precedente» attraverso un buco misura un'altra cosa.
// e) L'UNDICI SONO UNDICI NOMI: portiere più titolari, confrontati come
//    INSIEME. Panchina e modulo sono altre due quantità e non entrano in questo
//    confronto — l'ordine della panchina cambia senza che l'undici cambi, e
//    metterlo dentro trasformerebbe «ha ripetuto l'undici» in «non ha toccato
//    niente», che è un'altra domanda.
// f) LA FREQUENZA DI DIFESA A 3/4/5 E DI ATTACCO A 1/2/3 (§8.3) NON È UNA
//    QUANTITÀ A PARTE, ed è una scelta, non una dimenticanza: è una funzione
//    deterministica della distribuzione dei moduli, che questo modulo stima già.
//    Stimarla di nuovo darebbe due numeri che possono contraddirsi — perché lo
//    shrink di una somma non è la somma degli shrink — e nessuno saprebbe quale
//    dei due è il profilo. Chi la vuole la ricava dalla distribuzione dei moduli
//    con `moduleShape()`.
// g) PARITÀ IN CIMA ALLA QUOTAZIONE: L'OCCASIONE SI SCARTA. Se due giocatori
//    disponibili condividono la quotazione più alta, «il più quotato» non esiste
//    e nessuna regola di spareggio lo farebbe esistere: sceglierne uno per id
//    sarebbe inventare il dato che manca. L'occasione non si conta e finisce nel
//    numero delle occasioni non misurabili, in chiaro.
// h) L'ORDINE DI USCITA È ORDINATO, NON QUELLO DICHIARATO. Le squadre escono
//    ordinate per id in ordine di punto di codice (`<` fra stringhe, non
//    `localeCompare`, che dipende dalla lingua di chi esegue). Due chiamanti che
//    dichiarano le stesse squadre in ordine diverso ottengono lo stesso profilo
//    bit a bit — che è il punto di «determinismo, ordini di iterazione
//    compresi».
// i) DA DOVE VIENE OGNI QUANTITÀ, UNA PER UNA — perché «§8.3» sopra un elenco
//    di quattro voci ne attribuisce quattro al disegno, e il disegno ne dice
//    due. Chi legge un numero ha diritto di sapere se qualcuno l'ha chiesto o
//    se l'ho scelto io:
//
//      - `moduleFielded` — §8.3, testuale: «conteggi dei moduli usati».
//      - `elevenIdenticalToPrevious` — §8.3, testuale: «"ripete la formazione
//        precedente": quante volte l'undici è identico al precedente».
//      - `moduleChangedAfterDefeat` — AGGIUNTA DI CHI SCRIVE. Il disegno non
//        nomina mai la sconfitta come condizione, qui né altrove. La aggiungo
//        perché §8.3 chiede già di conservare «risultato e punteggio di ogni
//        giornata», e un conteggio condizionato al risultato è aritmetica su un
//        dato che il profilo tiene comunque.
//      - `topQuotationAvailableAmongStarters` — AGGIUNTA DI CHI SCRIVE. Il
//        disegno non nomina mai la quotazione. La aggiungo come sostituto
//        misurabile della voce §8.3 «quota di titolari che le probabili davano
//        in ballottaggio o in panchina», che qui NON è costruibile: le probabili
//        vivono nello strato live di §7, cioè nel layer privato.
//
//    Le due aggiunte sono statistica interna: non hanno consumatori, non
//    escono da questo pacchetto e non cambiano niente che si veda usando il
//    prodotto. Restano scelte di chi scrive — si contestano con un record
//    datato, come le altre note di questo blocco — e non si citano come testo
//    del disegno.

import { MODULES, moduleShape, type Module } from "./leagueGameweek.js";

// ─── LE COSTANTI DICHIARATE ──────────────────────────────────────────────────

/**
 * LA TARGA CHE VIAGGIA COL NUMERO, come `BASE_FORECAST_MARK` in
 * `baseForecast.ts`. Non impedisce niente da sola — chi vuole spacciare una
 * stima per un conteggio la riscrive — ma rende la bugia una riga scritta a
 * mano, visibile nel diff, invece di una svista che compila.
 */
export const LEAGUE_BEHAVIOUR_MARK =
  "PROFILO OSSERVATO (§8.3): conteggi e stime prudenti di CHE COSA è stato schierato — non del perché" as const;

/**
 * K — le giornate equivalenti con cui il riferimento di lega pesa dentro la
 * stima di UNA squadra. §8.4, testuale: `k = 4`.
 */
export const TEAM_PSEUDO_GAMEWEEKS = 4 as const;

/**
 * K' — le giornate equivalenti con cui l'uniforme pesa dentro il riferimento
 * della lega. §8.4, testuale: `k' = 8`, «cioè una giornata di tutte le squadre».
 */
export const LEAGUE_PSEUDO_GAMEWEEKS = 8 as const;

// ─── LA FOTOGRAFIA DI GIORNATA (§8.2), COME ARRIVA QUI ───────────────────────

/**
 * SE QUESTA FORMAZIONE È UNA SCELTA O UNA LETTURA, e non c'è un terzo valore.
 *
 * `confermata` significa: questa è la formazione che quella squadra ha
 * SCHIERATO, letta dopo la scadenza, quando la piattaforma la mostra come
 * definitiva. `non_confermata` è tutto il resto — una lettura anticipata, una
 * rilettura divergente, una fotografia di cui chi l'ha presa non può garantire
 * che fosse quella finale.
 *
 * Il campo è OBBLIGATORIO e non ha ripiego: chi passa il dato deve dichiarare
 * quale delle due cose ha in mano. Regola 4 in testa al file.
 */
export type LineupRecordStatus = "confermata" | "non_confermata";

/**
 * Un giocatore che quella squadra AVEVA A DISPOSIZIONE per quella giornata, con
 * la sua quotazione dichiarata. La quotazione serve SOLO come ordine (vedi la
 * nota in testa): dice quale era il più quotato, e nient'altro.
 */
export interface AvailablePlayer {
  readonly playerId: string;
  /** Quotazione dichiarata da chi ha letto. Finita; l'ordine è l'unico uso. */
  readonly quotation: number;
}

/** La formazione di UNA squadra in UNA giornata, come la fotografia la porta. */
export interface ObservedTeamLineup {
  readonly teamId: string;
  readonly module: Module;
  readonly goalkeeperId: string;
  /** I dieci titolari di movimento. L'ordine è quello letto e qui non conta. */
  readonly starterIds: readonly string[];
  /** La panchina nell'ordine letto. Qui non entra in nessuna quantità (nota e). */
  readonly benchIds: readonly string[];
  /** Scelta schierata o lettura non confermata: si dichiara, non si deduce. */
  readonly status: LineupRecordStatus;
  /**
   * Chi era a disposizione, con le quotazioni. OPZIONALE perché una fotografia
   * può non portarla; assente significa che la quantità sul più quotato non è
   * misurabile per quella giornata, e l'occasione saltata esce in chiaro invece
   * di diventare un «no». Se è dichiarata deve essere non vuota e deve
   * contenere ogni giocatore schierato: una disponibilità che non elenca chi ha
   * giocato è una delle due letture sbagliata, e il calcolo si ferma.
   */
  readonly availability?: readonly AvailablePlayer[];
}

/** L'esito della sfida, dichiarato da chi ha letto. Non si ricalcola qui. */
export type MatchOutcome = "casa" | "trasferta" | "pareggio";

/** Una delle sfide della giornata: due formazioni e un esito dichiarato. */
export interface ObservedMatch {
  readonly home: ObservedTeamLineup;
  readonly away: ObservedTeamLineup;
  /**
   * Chi ha vinto, DICHIARATO. Questo modulo non somma punteggi e non applica
   * modificatori: il regolamento vive altrove (`leagueGameweek.ts`), e
   * ricalcolare qui il risultato significherebbe avere due autorità sullo stesso
   * fatto e scoprirlo il giorno che divergono.
   */
  readonly outcome: MatchOutcome;
}

/** UNA giornata di lega intera: tutte le sfide, quindi tutte le formazioni. */
export interface ObservedLeagueGameweek {
  /** Numero di giornata dentro la competizione: intero >= 1, senza doppioni. */
  readonly gameweek: number;
  readonly matches: readonly ObservedMatch[];
}

/**
 * IL SIGILLO DEL CORPO OSSERVATO — e il motivo per cui NON è esportato.
 * Stessa costruzione, stesso limite e stessa ragione di `OBSERVED_HISTORY_SEAL`
 * in `baseForecast.ts`: il simbolo esiste solo nel tipo, vive solo in questo
 * modulo, e fuori di qui nessun letterale può nominarlo. Un cast sì.
 */
declare const OBSERVED_LEAGUE_SEAL: unique symbol;

/** Le fotografie di §8.2, con la targa di chi le ha lette. */
export interface ObservedLeagueHistory {
  readonly gameweeks: readonly ObservedLeagueGameweek[];
  /** Fotografie di giornate già giocate. Non c'è un altro valore. */
  readonly origin: "OBSERVED";
  /** Chi ha letto queste giornate, in chiaro. */
  readonly provenance: string;
  readonly [OBSERVED_LEAGUE_SEAL]: true;
}

/** L'errore di questo modulo. Un prefisso solo, messaggi che dicono perché. */
function fail(message: string): never {
  throw new Error(`profilo di comportamento (§8.3): ${message}`);
}

/**
 * LA PORTA PREVISTA per ottenere un corpo osservato, e il posto in cui la
 * provenienza si dichiara invece di essere sottintesa. Stessa forma e stesso
 * limite dichiarato di `observedHistory()` in `baseForecast.ts`: una formazione
 * letta e una formazione inventata da un motore hanno gli stessi campi, questo
 * modulo non può distinguerle, e allora pretende una TARGA e la porta fino in
 * fondo dentro il profilo che produce.
 */
export function observedLeagueGameweeks(input: {
  readonly gameweeks: readonly ObservedLeagueGameweek[];
  /** Da dove vengono queste fotografie, in chiaro. */
  readonly provenance: string;
}): ObservedLeagueHistory {
  const { provenance } = input;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    fail(
      "la provenienza delle fotografie non è dichiarata. Un profilo ha senso solo se è costruito su " +
        "formazioni REALMENTE SCHIERATE, e questo modulo non può distinguerle dall'uscita di un motore — " +
        "hanno gli stessi campi. Se un giorno le formazioni proposte dal produttore rientrassero come " +
        "storico, il profilo confermerebbe le nostre stesse abitudini e nessun errore lo direbbe.",
    );
  }
  return {
    gameweeks: input.gameweeks,
    origin: "OBSERVED",
    provenance: provenance.trim(),
  } as ObservedLeagueHistory;
}

/**
 * LA TARGA PRETESA A RUNTIME, DOVE IL TIPO NON ARRIVA. Il sigillo ferma
 * l'assegnazione, non un cast esplicito: questa guardia intercetta il cast
 * DIMENTICO, quello che attraversa il tipo senza passare dalla porta e quindi
 * non porta nemmeno la provenienza. Un cast che inventa anche la provenienza
 * passa: è un rischio ACCETTATO e DICHIARATO, e la bugia resta scritta dentro
 * il profilo.
 */
function assertDeclaredProvenance(history: ObservedLeagueHistory): string {
  // `history?.` NON È UNA SVISTA: si arriva qui proprio perché il tipo può
  // mentire, e fidarsi del tipo dentro il controllo che lo verifica renderebbe
  // il controllo finto.
  const provenance = history?.provenance;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    fail(
      "le fotografie non portano una provenienza dichiarata, quindi non sono passate da " +
        "`observedLeagueGameweeks()` — l'unica porta che quella targa la pretende e la scrive.",
    );
  }
  return provenance.trim();
}

// ─── LE QUANTITÀ: CHE COSA SI CONTA, E COME SI CHIAMA ────────────────────────

/**
 * Le quantità misurate. I nomi dicono l'ATTO CONTATO, mai l'intenzione (regola
 * 2). L'elenco è chiuso: aggiungerne una è un cambiamento di contratto, perché
 * l'ordine di questo elenco è l'ordine delle stime in uscita.
 *
 * Le prime due vengono da §8.3 alla lettera; le altre due le aggiunge chi
 * scrive e la nota i) in testa al file dice perché. L'elenco intero non è
 * «§8.3»: due voci lo sono, due no.
 */
export type BehaviourQuantityId =
  | "moduleFielded"
  | "elevenIdenticalToPrevious"
  | "moduleChangedAfterDefeat"
  | "topQuotationAvailableAmongStarters";

/** La definizione di una quantità: categorie chiuse più una riga in chiaro. */
export interface BehaviourQuantity {
  readonly id: BehaviourQuantityId;
  /**
   * Le categorie, in ordine dichiarato, e L'ORDINE È PARTE DEL CONTRATTO: la
   * posizione `i` di `categories` è la stessa posizione `i` di `counts`,
   * `share` e `leagueReference`. Il legame è però una CONVENZIONE fra questo
   * elenco e gli indici che il conteggio scrive, e una convenzione senza
   * guardia si rompe in silenzio — invertire due etichette qui, senza toccare
   * il codice che conta, ribalta il significato di uno `share` senza rompere
   * niente che compili. La guardia che lo impedisce sta nelle prove
   * («le etichette sono legate agli indici che il conteggio scrive»): fa
   * accadere un fatto noto e pretende che l'etichetta con la massa sia quella
   * che lo descrive, per ogni quantità e per ogni categoria.
   */
  readonly categories: readonly string[];
  /**
   * Che cosa è stato contato, in una frase che descrive un ATTO. Viaggia dentro
   * la stima: chi legge un numero legge accanto la domanda a cui risponde.
   */
  readonly label: string;
  /** Che cosa è UN'OCCASIONE per questa quantità, cioè il denominatore. */
  readonly trial: string;
}

export const BEHAVIOUR_QUANTITIES: readonly BehaviourQuantity[] = [
  {
    id: "moduleFielded",
    categories: MODULES,
    label: "Quale modulo è stato schierato.",
    trial: "Una giornata confermata della squadra.",
  },
  {
    id: "elevenIdenticalToPrevious",
    categories: ["identico", "diverso"],
    label:
      "Se gli undici nomi in campo (portiere più titolari, come insieme) coincidono con quelli della " +
      "giornata immediatamente precedente.",
    trial: "Una coppia di giornate confermate con numeri consecutivi.",
  },
  {
    id: "moduleChangedAfterDefeat",
    categories: ["cambiato", "invariato"],
    label: "Se il modulo della giornata successiva a una sconfitta differisce da quello schierato nella sconfitta.",
    trial:
      "Una coppia di giornate confermate con numeri consecutivi in cui la prima delle due è stata persa " +
      "dalla squadra.",
  },
  {
    id: "topQuotationAvailableAmongStarters",
    categories: ["fra i titolari", "fuori dai titolari"],
    label:
      "Se il giocatore con la quotazione dichiarata più alta fra quelli disponibili era fra gli undici in " +
      "campo.",
    trial:
      "Una giornata confermata della squadra con la disponibilità dichiarata e un solo giocatore in cima " +
      "alla quotazione.",
  },
] as const;

// ─── L'USCITA ────────────────────────────────────────────────────────────────

/** Su che cosa poggia una stima. Due valori, e si dice sempre quale. */
export type EstimateBasis = "riferimento-di-lega" | "osservazioni-e-riferimento";

/** La stima di UNA quantità per UNA squadra, con accanto tutto ciò che l'ha fatta. */
export interface BehaviourEstimate {
  readonly quantity: BehaviourQuantityId;
  readonly label: string;
  readonly categories: readonly string[];
  /** I conteggi grezzi della squadra (§8.3 vuole conteggi). NON sono la stima. */
  readonly counts: readonly number[];
  /** Le occasioni della squadra: la somma di `counts`. */
  readonly observations: number;
  /**
   * Occasioni che questa quantità NON ha potuto misurare per questa squadra —
   * disponibilità non dichiarata, parità in cima alla quotazione, giornata senza
   * la precedente confermata e consecutiva. Escono in chiaro perché il
   * denominatore che manca è la prima cosa che rende un numero ingannevole.
   */
  readonly notMeasurable: number;
  /** LA STIMA: shrink dei conteggi verso il riferimento di lega. Somma 1. */
  readonly share: readonly number[];
  /** Il riferimento di lega usato: shrink dei conteggi di tutti verso l'uniforme. */
  readonly leagueReference: readonly number[];
  readonly leagueCounts: readonly number[];
  readonly leagueObservations: number;
  /** Quanto pesa il riferimento dentro la stima: `k / (n + k)`. Uno se n = 0. */
  readonly leagueReferenceWeight: number;
  readonly basis: EstimateBasis;
}

/** Il profilo di una squadra: le stime in ordine di `BEHAVIOUR_QUANTITIES`. */
export interface TeamBehaviourProfile {
  readonly teamId: string;
  /** Giornate confermate osservate per questa squadra. Zero è un valore lecito. */
  readonly gameweeksObserved: number;
  /** Giornate lette ma NON confermate, tenute fuori da tutto. In chiaro. */
  readonly gameweeksDiscardedUnconfirmed: number;
  readonly estimates: readonly BehaviourEstimate[];
  /** `riferimento-di-lega` se questa squadra non è mai stata osservata. */
  readonly basis: EstimateBasis;
  /** Una riga che dice da quanti dati viene questo profilo e quanto pesa il riferimento. */
  readonly reason: string;
}

/** Il riferimento della lega, esposto per sé: è ciò che riceve chi non ha dati. */
export interface LeagueReferenceEstimate {
  readonly quantity: BehaviourQuantityId;
  readonly label: string;
  readonly categories: readonly string[];
  readonly counts: readonly number[];
  readonly observations: number;
  readonly share: readonly number[];
}

export interface LeagueBehaviourProfile {
  readonly mark: string;
  readonly provenance: string;
  readonly gameweeksInHistory: number;
  readonly teamGameweeksObserved: number;
  readonly teamGameweeksDiscardedUnconfirmed: number;
  readonly reference: readonly LeagueReferenceEstimate[];
  /** Una per squadra dichiarata, ordinate per id in ordine di punto di codice. */
  readonly teams: readonly TeamBehaviourProfile[];
}

// ─── LO SHRINK, IN UNA FORMULA SOLA ──────────────────────────────────────────

/**
 * LO SHRINK DI §8.4, valido per ogni quantità di questo file (nota a):
 * conteggi osservati più K occasioni finte distribuite come il riferimento,
 * diviso il totale. Con `total = 0` il risultato È il riferimento, e non per un
 * ramo speciale: è la formula stessa che ci arriva.
 *
 * `prior` deve sommare a 1 e avere la stessa lunghezza di `counts`: sono
 * invarianti interne, garantite da chi chiama, e per questo il controllo qui è
 * un'asserzione secca invece di un messaggio didattico.
 */
function shrinkToPrior(
  counts: readonly number[],
  total: number,
  prior: readonly number[],
  pseudo: number,
): number[] {
  if (counts.length !== prior.length) {
    fail(`shrink fra vettori di lunghezza diversa (${counts.length} contro ${prior.length}).`);
  }
  const denominator = total + pseudo;
  return counts.map((count, i) => (count + pseudo * (prior[i] as number)) / denominator);
}

/** L'ancora esterna: uniforme sulle categorie dichiarate (nota a). */
function uniform(size: number): number[] {
  return new Array<number>(size).fill(1 / size);
}

// ─── LA CONVALIDA DELLE FOTOGRAFIE ───────────────────────────────────────────

const ELEVEN_OUTFIELD = 10 as const;

function assertNonEmptyId(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${what} non è un identificatore dichiarato.`);
  }
  return value;
}

function validateLineup(lineup: ObservedTeamLineup, where: string): void {
  assertNonEmptyId(lineup.teamId, `${where}: l'id della squadra`);
  if (lineup.status !== "confermata" && lineup.status !== "non_confermata") {
    fail(
      `${where}: la formazione non dichiara se è una scelta schierata o una lettura non confermata ` +
        "(`status`). Non c'è un valore di ripiego: contare una bozza come una scelta mette nel profilo " +
        "di una squadra ciò che quella squadra non ha schierato, e nessun errore lo direbbe dopo.",
    );
  }
  if (!MODULES.includes(lineup.module)) {
    fail(`${where}: modulo non riconosciuto (${String(lineup.module)}).`);
  }
  const shape = moduleShape(lineup.module);
  const outfield = shape.defenders + shape.midfielders + shape.strikers;
  if (outfield !== ELEVEN_OUTFIELD) {
    fail(`${where}: il modulo ${lineup.module} non descrive dieci giocatori di movimento.`);
  }
  assertNonEmptyId(lineup.goalkeeperId, `${where}: il portiere`);
  const starters: readonly string[] = lineup.starterIds ?? [];
  if (starters.length !== ELEVEN_OUTFIELD) {
    fail(
      `${where}: i titolari di movimento sono ${starters.length} invece di ` +
        `${ELEVEN_OUTFIELD}. Un undici incompleto non è una formazione osservata: è una lettura parziale, ` +
        "e va dichiarata `non_confermata` invece di essere completata a mano.",
    );
  }
  const seen = new Set<string>();
  for (const id of [lineup.goalkeeperId, ...starters, ...(lineup.benchIds ?? [])]) {
    assertNonEmptyId(id, `${where}: un giocatore`);
    if (seen.has(id)) fail(`${where}: il giocatore ${id} compare due volte nella stessa formazione.`);
    seen.add(id);
  }
  if (lineup.availability !== undefined) {
    if (lineup.availability.length === 0) {
      fail(
        `${where}: la disponibilità è dichiarata vuota. Vuota e non dichiarata sono due cose diverse: ` +
          "una squadra senza nessun giocatore disponibile non avrebbe schierato una formazione. Se la " +
          "fotografia non porta la disponibilità, si omette il campo.",
      );
    }
    const available = new Set<string>();
    for (const entry of lineup.availability) {
      assertNonEmptyId(entry.playerId, `${where}: un giocatore disponibile`);
      if (!Number.isFinite(entry.quotation)) {
        fail(`${where}: la quotazione dichiarata di ${entry.playerId} non è un numero finito.`);
      }
      if (available.has(entry.playerId)) {
        fail(`${where}: il giocatore ${entry.playerId} compare due volte nella disponibilità.`);
      }
      available.add(entry.playerId);
    }
    for (const id of [lineup.goalkeeperId, ...starters]) {
      if (!available.has(id)) {
        fail(
          `${where}: ${id} è stato schierato ma la disponibilità dichiarata non lo elenca. Una delle due ` +
            "letture è sbagliata, e scegliere quale sarebbe indovinare.",
        );
      }
    }
  }
}

// ─── LA RACCOLTA: DA FOTOGRAFIE A CONTEGGI ───────────────────────────────────

/** Una riga confermata, appiattita e pronta per i conti di una sola squadra. */
interface ConfirmedRecord {
  readonly gameweek: number;
  readonly module: Module;
  readonly elevenKey: string;
  readonly lost: boolean;
  readonly availability?: readonly AvailablePlayer[];
  readonly goalkeeperId: string;
  readonly starterIds: readonly string[];
}

/**
 * La chiave dell'undici: portiere più titolari ORDINATI (nota e). L'ordine
 * dichiarato dal fantallenatore conta per il regolamento delle sostituzioni,
 * non per la domanda «sono gli stessi undici»: ordinare qui è ciò che rende la
 * risposta indipendente da come la piattaforma ha stampato la lista.
 */
function elevenKey(lineup: ObservedTeamLineup): string {
  return `${lineup.goalkeeperId}|${[...lineup.starterIds].sort().join(",")}`;
}

function lostBy(match: ObservedMatch, side: "home" | "away"): boolean {
  if (match.outcome === "pareggio") return false;
  return side === "home" ? match.outcome === "trasferta" : match.outcome === "casa";
}

/** Conteggi per squadra e per quantità, più le occasioni non misurabili. */
interface TeamTally {
  readonly counts: Map<BehaviourQuantityId, number[]>;
  readonly notMeasurable: Map<BehaviourQuantityId, number>;
  confirmed: number;
  unconfirmed: number;
}

function emptyTally(): TeamTally {
  const counts = new Map<BehaviourQuantityId, number[]>();
  const notMeasurable = new Map<BehaviourQuantityId, number>();
  for (const quantity of BEHAVIOUR_QUANTITIES) {
    counts.set(quantity.id, new Array<number>(quantity.categories.length).fill(0));
    notMeasurable.set(quantity.id, 0);
  }
  return { counts, notMeasurable, confirmed: 0, unconfirmed: 0 };
}

function bump(tally: TeamTally, quantity: BehaviourQuantityId, categoryIndex: number): void {
  const row = tally.counts.get(quantity) as number[];
  row[categoryIndex] = (row[categoryIndex] as number) + 1;
}

function skip(tally: TeamTally, quantity: BehaviourQuantityId): void {
  tally.notMeasurable.set(quantity, (tally.notMeasurable.get(quantity) as number) + 1);
}

/**
 * IL GIOCATORE PIÙ QUOTATO FRA I DISPONIBILI, o `null` se non esiste UNO solo
 * (nota g). `null` non è «nessuno»: è «la domanda non ha risposta qui», e chi
 * chiama lo tratta come occasione non misurabile invece che come un «no».
 */
function soleTopQuotation(available: readonly AvailablePlayer[]): AvailablePlayer | null {
  let best: AvailablePlayer | null = null;
  let tied = false;
  for (const entry of available) {
    if (best === null || entry.quotation > best.quotation) {
      best = entry;
      tied = false;
      continue;
    }
    if (entry.quotation === best.quotation) tied = true;
  }
  return tied ? null : best;
}

// ─── IL PROFILO ──────────────────────────────────────────────────────────────

export interface LeagueBehaviourInput {
  readonly history: ObservedLeagueHistory;
  /**
   * LE SQUADRE DELLA LEGA, DICHIARATE. Non si deducono da chi è comparso nelle
   * fotografie: una squadra mai osservata deve comparire col riferimento
   * (regola 3), e dedurre l'elenco la farebbe sparire proprio nel caso per cui
   * la regola esiste. Una squadra osservata ma non dichiarata ferma il calcolo:
   * significa che l'elenco e le fotografie parlano di due leghe diverse.
   */
  readonly teams: readonly string[];
}

export function leagueBehaviourProfile(input: LeagueBehaviourInput): LeagueBehaviourProfile {
  const provenance = assertDeclaredProvenance(input.history);

  const declared = new Set<string>();
  for (const teamId of input.teams) {
    assertNonEmptyId(teamId, "l'elenco delle squadre della lega contiene un id che");
    if (declared.has(teamId)) fail(`la squadra ${teamId} è dichiarata due volte nell'elenco della lega.`);
    declared.add(teamId);
  }
  if (declared.size === 0) {
    fail(
      "l'elenco delle squadre della lega è vuoto. Senza l'elenco non esiste la differenza fra «questa " +
        "squadra non l'abbiamo mai osservata» e «questa squadra non esiste», che è la sola ragione per " +
        "cui l'elenco si dichiara.",
    );
  }

  // ORDINE DI ITERAZIONE, PRIMA DI OGNI SOMMA (nota h e nota d). Le giornate si
  // ordinano per numero: la catena delle consecutive dipende dall'ordine, e
  // dipendere dall'ordine in cui il chiamante le ha messe in un array
  // significherebbe due profili diversi dalla stessa storia.
  const gameweeks = [...input.history.gameweeks].sort((a, b) => a.gameweek - b.gameweek);
  const seenGameweeks = new Set<number>();
  for (const gw of gameweeks) {
    if (!Number.isInteger(gw.gameweek) || gw.gameweek < 1) {
      fail(`numero di giornata non valido (${String(gw.gameweek)}): serve un intero >= 1.`);
    }
    if (seenGameweeks.has(gw.gameweek)) {
      fail(
        `la giornata ${gw.gameweek} compare due volte. Due fotografie della stessa giornata non sono due ` +
          "osservazioni: sono la stessa giornata contata due volte, e raddoppierebbero il peso di una " +
          "squadra senza che nessuno lo veda.",
      );
    }
    seenGameweeks.add(gw.gameweek);
    if (gw.matches.length === 0) {
      fail(`la giornata ${gw.gameweek} non porta nessuna sfida.`);
    }
  }

  // Le righe confermate, per squadra, in ordine di giornata.
  const perTeam = new Map<string, ConfirmedRecord[]>();
  const tallies = new Map<string, TeamTally>();
  for (const teamId of declared) {
    perTeam.set(teamId, []);
    tallies.set(teamId, emptyTally());
  }

  let teamGameweeksObserved = 0;
  let teamGameweeksDiscardedUnconfirmed = 0;

  for (const gw of gameweeks) {
    const seenTeams = new Set<string>();
    for (let m = 0; m < gw.matches.length; m += 1) {
      const match = gw.matches[m] as ObservedMatch;
      if (match.outcome !== "casa" && match.outcome !== "trasferta" && match.outcome !== "pareggio") {
        fail(
          `giornata ${gw.gameweek}, sfida ${m + 1}: l'esito non è dichiarato (${String(match.outcome)}). ` +
            "Questo modulo non ricalcola i punteggi: il regolamento ha già una sola autorità, ed è un " +
            "altro file.",
        );
      }
      for (const side of ["home", "away"] as const) {
        const lineup = match[side];
        const where = `giornata ${gw.gameweek}, sfida ${m + 1}, ${side === "home" ? "casa" : "trasferta"}`;
        validateLineup(lineup, where);
        if (!declared.has(lineup.teamId)) {
          fail(
            `${where}: la squadra ${lineup.teamId} compare nelle fotografie ma non nell'elenco della ` +
              "lega. L'elenco e le fotografie stanno descrivendo due leghe diverse, e scegliere quale " +
              "delle due ha ragione non spetta a questo modulo.",
          );
        }
        if (seenTeams.has(lineup.teamId)) {
          fail(`${where}: la squadra ${lineup.teamId} compare due volte nella stessa giornata.`);
        }
        seenTeams.add(lineup.teamId);

        const tally = tallies.get(lineup.teamId) as TeamTally;
        if (lineup.status === "non_confermata") {
          tally.unconfirmed += 1;
          teamGameweeksDiscardedUnconfirmed += 1;
          continue;
        }
        tally.confirmed += 1;
        teamGameweeksObserved += 1;
        (perTeam.get(lineup.teamId) as ConfirmedRecord[]).push({
          gameweek: gw.gameweek,
          module: lineup.module,
          elevenKey: elevenKey(lineup),
          lost: lostBy(match, side),
          availability: lineup.availability,
          goalkeeperId: lineup.goalkeeperId,
          starterIds: lineup.starterIds,
        });
      }
    }
  }

  // I CONTEGGI, squadra per squadra, in ordine di id (nota h).
  const teamIds = [...declared].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const teamId of teamIds) {
    const records = perTeam.get(teamId) as ConfirmedRecord[];
    const tally = tallies.get(teamId) as TeamTally;
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i] as ConfirmedRecord;

      // 1) Il modulo schierato: un'occasione per ogni giornata confermata.
      bump(tally, "moduleFielded", MODULES.indexOf(record.module));

      // 2) Il più quotato disponibile fra i titolari.
      if (record.availability === undefined) {
        skip(tally, "topQuotationAvailableAmongStarters");
      } else {
        const top = soleTopQuotation(record.availability);
        if (top === null) {
          skip(tally, "topQuotationAvailableAmongStarters");
        } else {
          const fielded = top.playerId === record.goalkeeperId || record.starterIds.includes(top.playerId);
          bump(tally, "topQuotationAvailableAmongStarters", fielded ? 0 : 1);
        }
      }

      // 3) e 4) Le due quantità che guardano indietro di UNA giornata: contano
      // solo se la precedente è confermata e il suo numero è quello di prima
      // (nota d). La prima giornata osservata non ha una precedente e non è
      // un'occasione mancata: è l'inizio, e la si conta fra le non misurabili
      // perché il denominatore che manca vada detto invece che sottinteso.
      const previous = i > 0 ? (records[i - 1] as ConfirmedRecord) : null;
      const adjacent = previous !== null && previous.gameweek === record.gameweek - 1;
      if (!adjacent) {
        skip(tally, "elevenIdenticalToPrevious");
        skip(tally, "moduleChangedAfterDefeat");
        continue;
      }
      const prior = previous as ConfirmedRecord;
      bump(tally, "elevenIdenticalToPrevious", prior.elevenKey === record.elevenKey ? 0 : 1);
      if (prior.lost) {
        bump(tally, "moduleChangedAfterDefeat", prior.module === record.module ? 1 : 0);
      } else {
        skip(tally, "moduleChangedAfterDefeat");
      }
    }
  }

  // IL RIFERIMENTO DELLA LEGA: conteggi di tutte le squadre, shrinkati verso
  // l'uniforme (nota c). Le somme scorrono in ordine di id, così due chiamanti
  // che dichiarano le stesse squadre in ordine diverso sommano gli stessi
  // numeri nella stessa sequenza.
  const reference: LeagueReferenceEstimate[] = [];
  const referenceShare = new Map<BehaviourQuantityId, number[]>();
  const referenceCounts = new Map<BehaviourQuantityId, number[]>();
  const referenceObservations = new Map<BehaviourQuantityId, number>();
  for (const quantity of BEHAVIOUR_QUANTITIES) {
    const totals = new Array<number>(quantity.categories.length).fill(0);
    for (const teamId of teamIds) {
      const row = (tallies.get(teamId) as TeamTally).counts.get(quantity.id) as number[];
      for (let c = 0; c < totals.length; c += 1) {
        totals[c] = (totals[c] as number) + (row[c] as number);
      }
    }
    const observations = totals.reduce((sum, value) => sum + value, 0);
    const share = shrinkToPrior(totals, observations, uniform(totals.length), LEAGUE_PSEUDO_GAMEWEEKS);
    referenceCounts.set(quantity.id, totals);
    referenceObservations.set(quantity.id, observations);
    referenceShare.set(quantity.id, share);
    reference.push({
      quantity: quantity.id,
      label: quantity.label,
      categories: quantity.categories,
      counts: totals,
      observations,
      share,
    });
  }

  // LE STIME PER SQUADRA.
  const teams: TeamBehaviourProfile[] = teamIds.map((teamId) => {
    const tally = tallies.get(teamId) as TeamTally;
    const estimates: BehaviourEstimate[] = BEHAVIOUR_QUANTITIES.map((quantity) => {
      const counts = tally.counts.get(quantity.id) as number[];
      const observations = counts.reduce((sum, value) => sum + value, 0);
      const leagueRef = referenceShare.get(quantity.id) as number[];
      return {
        quantity: quantity.id,
        label: quantity.label,
        categories: quantity.categories,
        counts,
        observations,
        notMeasurable: tally.notMeasurable.get(quantity.id) as number,
        share: shrinkToPrior(counts, observations, leagueRef, TEAM_PSEUDO_GAMEWEEKS),
        leagueReference: leagueRef,
        leagueCounts: referenceCounts.get(quantity.id) as number[],
        leagueObservations: referenceObservations.get(quantity.id) as number,
        leagueReferenceWeight: TEAM_PSEUDO_GAMEWEEKS / (observations + TEAM_PSEUDO_GAMEWEEKS),
        basis: observations === 0 ? "riferimento-di-lega" : "osservazioni-e-riferimento",
      };
    });
    const basis: EstimateBasis = tally.confirmed === 0 ? "riferimento-di-lega" : "osservazioni-e-riferimento";
    const reason =
      tally.confirmed === 0
        ? `${LEAGUE_BEHAVIOUR_MARK}. Nessuna giornata confermata osservata per ${teamId}` +
          (tally.unconfirmed > 0
            ? ` (${tally.unconfirmed} lette ma non confermate, tenute fuori)`
            : "") +
          `: questo non è un profilo, è il RIFERIMENTO DELLA LEGA dichiarato come tale. Il riferimento è a ` +
          `sua volta uno shrink dei conteggi di tutte le squadre verso l'uniforme, con peso ` +
          `${LEAGUE_PSEUDO_GAMEWEEKS} giornate equivalenti. Storico dichiarato: ${provenance}.`
        : `${LEAGUE_BEHAVIOUR_MARK}. ${tally.confirmed} giornate confermate osservate per ${teamId}` +
          (tally.unconfirmed > 0
            ? `, più ${tally.unconfirmed} lette ma non confermate e tenute fuori da ogni conteggio`
            : "") +
          `. Ogni stima è uno shrink dei conteggi verso il riferimento di lega con peso ` +
          `${TEAM_PSEUDO_GAMEWEEKS} giornate equivalenti (§8.4), e il riferimento è a sua volta uno shrink ` +
          `verso l'uniforme con peso ${LEAGUE_PSEUDO_GAMEWEEKS}. I numeri dicono CHE COSA è stato ` +
          `schierato: nessuno di essi dice perché. Storico dichiarato: ${provenance}.`;
    return {
      teamId,
      gameweeksObserved: tally.confirmed,
      gameweeksDiscardedUnconfirmed: tally.unconfirmed,
      estimates,
      basis,
      reason,
    };
  });

  return {
    mark: LEAGUE_BEHAVIOUR_MARK,
    provenance,
    gameweeksInHistory: gameweeks.length,
    teamGameweeksObserved,
    teamGameweeksDiscardedUnconfirmed,
    reference,
    teams,
  };
}

/**
 * Il profilo di UNA squadra. Si ferma se la squadra non era nell'elenco
 * dichiarato: restituire `undefined` inviterebbe chi chiama a inventarsi un
 * ripiego, ed è esattamente il ripiego silenzioso che la regola 3 vieta.
 */
export function teamBehaviourProfile(
  profile: LeagueBehaviourProfile,
  teamId: string,
): TeamBehaviourProfile {
  const found = profile.teams.find((team) => team.teamId === teamId);
  if (found === undefined) {
    fail(
      `${teamId} non è fra le squadre dichiarate della lega. Una squadra mai OSSERVATA riceve il ` +
        "riferimento; una squadra mai DICHIARATA non esiste per questo profilo, e non si inventa qui.",
    );
  }
  return found;
}

/** La stima di una quantità dentro un profilo di squadra. */
export function behaviourEstimate(
  team: TeamBehaviourProfile,
  quantity: BehaviourQuantityId,
): BehaviourEstimate {
  const found = team.estimates.find((estimate) => estimate.quantity === quantity);
  if (found === undefined) fail(`quantità sconosciuta: ${quantity}.`);
  return found;
}
