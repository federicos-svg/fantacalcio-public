// WP-6a — L'IDENTITÀ DEL GIOCATORE FRA LE FONTI. La porta d'ingresso.
//
// PERCHÉ QUESTO MODULO ESISTE. Lo stesso giocatore compare in quattro elenchi
// diversi — il listone d'asta, i fogli dei voti, le pagine dei probabili
// schieramenti, la piattaforma della lega — con quattro grafie diverse e
// nessun identificativo in comune. Finché non esiste un modo per dire «questo
// è lo stesso giocatore», i voti storici non si possono attaccare a una riga,
// gli schieramenti avversari non si possono leggere e i conti non si possono
// verificare contro i punteggi ufficiali.
//
// ── UN ABBINAMENTO SBAGLIATO È PEGGIO DI UN ABBINAMENTO MANCANTE ────────────
//
// Un giocatore non agganciato è un buco: si vede, si conta, si dichiara, e a
// valle qualcuno decide che farne. Un giocatore agganciato MALE mette i voti
// di Tizio sulla riga di Caio e non produce nessun sintomo: la previsione esce
// plausibile, il totale torna, e l'errore si scopre solo se la persona
// sbagliata gioca e qualcuno confronta a mano. È la stessa classe di guasto
// che il tetto ex-post del contratto di giornata ha già pagato una volta —
// numeri belli, mondo sbagliato — e la risposta qui è la stessa: FAIL-CLOSED.
//
//   - l'abbinamento CERTO si dichiara certo;
//   - l'abbinamento INCERTO non si fa: esce come non risolto, con la ragione;
//   - due candidati non diventano MAI «il primo»: diventano «ambiguo», con
//     l'elenco dei candidati, e nessun criterio più debole ha il permesso di
//     scioglierli dopo (§«L'AMBIGUITÀ BRUCIA», in resolveIdentities.ts).
//
// ── LA TARGA, E PERCHÉ SI PRETENDE INVECE DI DEDURLA ────────────────────────
//
// Questo modulo non può SAPERE che due righe sono la stessa persona: vede due
// stringhe. Quindi fa l'unica cosa onesta, la stessa che `observedLines()` fa
// con i voti nel contratto di giornata: PRETENDE che chi porta una lista
// dichiari da dove viene, e porta quella dichiarazione fino dentro ogni
// abbinamento prodotto. A valle nessuno deve fidarsi «in blocco»: ogni
// abbinamento dice con quale criterio è nato, quindi si può filtrare per grado
// di certezza invece che per fiducia.
//
// Il sigillo di `DeclaredRoster` — un simbolo `unique` non esportato — ferma
// l'ASSEGNAZIONE accidentale di un elenco grezzo al risolutore. Non ferma un
// cast esplicito: un tipo nominale in TypeScript è una promessa fra chi scrive
// e chi rilegge, non una barriera. Contro il cast dimentico c'è, a runtime,
// la guardia sulla provenienza in `resolveIdentities.ts`; contro chi mente
// apposta non c'è niente, qui come là, e questa riga serve perché chi legge
// chiuda il file sapendolo.
//
// ── CONTROLLA-E-POI-USA: SI LEGGE UNA VOLTA SOLA ────────────────────────────
//
// Una funzione che VALIDA l'ingresso e poi CONSERVA o RILEGGE l'oggetto
// ricevuto, invece della copia appena validata, valida una cosa e ne usa
// un'altra. Basta che chi chiama passi qualcosa che risponde in modo diverso
// alla prima e alla seconda lettura — un `getter` che cambia risposta — oppure,
// senza alcun trucco, che muti il proprio elenco DOPO che la porta ha detto sì:
// il riferimento conservato è lo stesso oggetto, e il risolutore lo rilegge per
// conto suo a ogni criterio. Misurato su questo file prima della riparazione:
// una lista di una riga passava la porta, il chiamante ne aggiungeva una
// seconda con la chiave DUPLICATA — la cosa che `declareRoster()` promette di
// fermare — e quella riga usciva agganciata con targa `strong`.
//
// La riparazione ha una forma sola, e `declareRoster()` la applica: leggere
// ogni campo UNA VOLTA in una costante locale, validare QUELLA, e materializzare
// subito una copia congelata (`Object.freeze` sulla lista, su ogni riga e sul
// risultato) che è l'unica cosa che viaggia a valle. Da lì in poi `input` non
// si tocca più.
//
// FIN DOVE ARRIVA, ESATTAMENTE. La copia congelata è una barriera vera a
// runtime: un cast non la attraversa, e riscriverla in un modulo — sempre in
// strict mode — solleva. Ma congela ciò che è PASSATO DI QUI: un
// `DeclaredRoster` fabbricato con un cast esplicito non ha mai visto questa
// funzione, quindi non è né copiato né congelato, ed è lo stesso rischio
// accettato e dichiarato del sigillo di `DeclaredRoster`. E la copia non toglie
// niente al chiamante: il suo elenco resta suo e mutabile, semplicemente non è
// più quello che il risolutore legge.
//
// ── NESSUNA TABELLA DI ECCEZIONI CABLATA, E PERCHÉ ──────────────────────────
//
// Questo modulo NON contiene, e non deve contenere, un elenco di alias
// «Tizio → Caio» scritto nel sorgente. In questo progetto se n'è trovata una,
// scaduta da due stagioni, che nessuno guardava più: una tabella cablata non
// ha una data di scadenza leggibile, non fallisce quando invecchia, e continua
// a produrre abbinamenti finché qualcuno non la rilegge per caso. Il correttivo
// manuale, quando serve davvero, ha già la sua forma in questo contratto e non
// è una tabella: è un IDENTIFICATIVO dichiarato in uno spazio dichiarato
// (§`identifierSpace`). Chi corregge a mano scrive l'identificativo della
// piattaforma sulla riga che lo merita, in un dato versionato che vive fuori di
// qui — nel layer privato — e questo modulo lo aggancia al rango 1 come
// qualunque altro identificativo, senza sapere che era un correttivo.
//
// ── CHE COSA QUESTO MODULO NON FA ───────────────────────────────────────────
//
// Non acquisisce dati (il core pubblico non ha I/O verso fonti esterne), non
// riconcilia i NOMI DELLE SQUADRE fra le fonti — pretende che siano già in un
// vocabolario dichiarato, §`teamVocabulary` — e non usa il RUOLO come
// discriminante: le fonti classificano il ruolo in modo diverso fra loro e
// dallo stesso giocatore in stagioni diverse, quindi sciogliere un'ambiguità
// col ruolo significherebbe scegliere un candidato su un segnale che non è
// identità. Il campo non c'è apposta: un campo inutilizzato invita a usarlo.

/**
 * UNA RIGA DI GIOCATORE COME LA SCRIVE UNA FONTE. Deliberatamente povera: non
 * è un record di giocatore vero, è ciò che serve per decidere un'identità.
 */
export interface SourcePlayerRecord {
  /**
   * La chiave con cui il chiamante ritroverà questa riga nel proprio mondo.
   * Deve essere unica DENTRO la fonte: non è un'identità condivisa, è una
   * maniglia. Il risultato parla per `ref`, mai per posizione nell'elenco.
   */
  readonly ref: string;
  /** Il nome del giocatore com'è scritto nella fonte, senza ripulire niente. */
  readonly displayName: string;
  /**
   * La squadra in un vocabolario CONDIVISO fra le due fonti confrontate — non
   * il nome che la fonte stampa. Assente quando la fonte non la dice: assente
   * significa «non lo so», mai «nessuna squadra».
   */
  readonly teamKey?: string | null;
  /**
   * L'identificativo del giocatore nello spazio dichiarato dalla fonte
   * (§`identifierSpace`). Assente sulla stragrande maggioranza delle righe:
   * è il caso normale, non un difetto.
   */
  readonly identifier?: string | null;
}

/** Quel che il chiamante dichiara portando una lista al risolutore. */
export interface RosterDeclaration {
  /** Nome macchina corto della fonte, per leggere il risultato. */
  readonly sourceId: string;
  /**
   * DA DOVE VIENE QUESTA LISTA, in chiaro: chi l'ha prodotta, da quale
   * lettura, con quale parser. È la targa, e viene copiata dentro ogni
   * abbinamento: sotto un numero prodotto da questo modulo resta sempre
   * scritto su quali due letture è nato.
   */
  readonly provenance: string;
  /**
   * Il nome del vocabolario in cui `teamKey` è espresso. Due liste possono
   * confrontare le squadre SOLO se dichiarano lo stesso vocabolario: due
   * vocabolari diversi non sono confrontabili, e il risolutore li tratta come
   * squadra non dichiarata invece di far finta che coincidano.
   */
  readonly teamVocabulary?: string | null;
  /**
   * Il nome dello spazio in cui `identifier` è espresso (per esempio quello
   * della piattaforma di lega). Due identificativi si confrontano SOLO se le
   * due liste dichiarano lo stesso spazio: che la colonna identificativo di
   * due fonti diverse sia lo stesso numero è un'IPOTESI da misurare, non un
   * fatto, e questo modulo si rifiuta di assumerla al posto di chi legge.
   */
  readonly identifierSpace?: string | null;
  readonly records: readonly SourcePlayerRecord[];
}

/**
 * IL SIGILLO — e il motivo per cui non è esportato. Esiste solo nel tipo
 * (`declare const` non emette niente) e vive solo dentro questo modulo: fuori
 * di qui nessun letterale può nominarlo, quindi nessun letterale può
 * soddisfare `DeclaredRoster`. Serve a impedire prima, non a controllare dopo.
 */
declare const DECLARED_ROSTER_SEAL: unique symbol;

/** Una lista che è passata dalla porta, con la sua targa attaccata. */
export interface DeclaredRoster extends RosterDeclaration {
  readonly provenance: string;
  readonly [DECLARED_ROSTER_SEAL]: true;
}

/** La targa di una lista, come compare nel risultato. */
export interface RosterHandle {
  readonly sourceId: string;
  readonly provenance: string;
  readonly recordCount: number;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * LA PORTA PREVISTA per portare una lista al risolutore, e il posto in cui
 * ogni cosa sottintesa diventa dichiarata. Rifiuta invece di indovinare:
 * ogni `throw` qui sotto è un caso in cui proseguire avrebbe prodotto
 * abbinamenti plausibili su una premessa mai verificata.
 */
export function declareRoster(input: RosterDeclaration): DeclaredRoster {
  // UNA LETTURA SOLA, E POI LA COPIA — §«CONTROLLA-E-POI-USA» in testa al file.
  // Ogni campo che entra si legge QUI, una volta, in una costante locale; da
  // qui in giù nessuna riga tocca più `input`. Il vecchio codice leggeva due
  // volte (`nonEmpty(input.sourceId)` e poi `input.sourceId.trim()`, la lista
  // per validarla e poi di nuovo per conservarla): chi passa un oggetto che
  // risponde in modo diverso alla prima e alla seconda lettura faceva validare
  // una cosa e usare un'altra.
  const sourceId = input.sourceId;
  const provenance = input.provenance;
  const teamVocabulary = input.teamVocabulary;
  const identifierSpace = input.identifierSpace;
  const incoming = input.records;

  if (!nonEmpty(sourceId)) {
    throw new Error(
      "lista dichiarata: manca il nome della fonte. Il risultato dell'abbinamento parla per fonte, e una " +
        "fonte senza nome rende illeggibile ogni riga che ne esce.",
    );
  }
  if (!nonEmpty(provenance)) {
    throw new Error(
      "lista dichiarata: manca la provenienza. Questo modulo non può sapere se due nomi sono la stessa " +
        "persona — vede due stringhe — quindi pretende di sapere almeno da dove vengono, e la scrive " +
        "dentro ogni abbinamento che produce. Senza targa un abbinamento è un'affermazione senza autore.",
    );
  }

  const seen = new Set<string>();
  const records: SourcePlayerRecord[] = [];
  let identifierPresent = false;
  let teamPresent = false;
  // Si percorre `incoming` UNA VOLTA SOLA, e la stessa passata valida e copia:
  // validare in un giro e copiare in un altro sarebbe di nuovo due letture.
  for (const incomingRecord of incoming) {
    const ref: unknown = incomingRecord.ref;
    const displayName: unknown = incomingRecord.displayName;
    const teamKey: unknown = incomingRecord.teamKey;
    const identifier: unknown = incomingRecord.identifier;

    if (!nonEmpty(ref)) {
      throw new Error(
        `lista dichiarata (${sourceId}): una riga senza chiave. La chiave è la maniglia con cui il ` +
          "chiamante ritrova la riga: senza, un abbinamento non si potrebbe nemmeno riferire a qualcosa.",
      );
    }
    if (seen.has(ref)) {
      throw new Error(
        `lista dichiarata (${sourceId}): la chiave "${ref}" compare due volte. Due righe con ` +
          "la stessa maniglia non sono un dato più ricco: sono un elenco che non si sa indicizzare, e " +
          "l'abbinamento finirebbe su una delle due a caso.",
      );
    }
    seen.add(ref);
    // UN NOME NULLO NON È UN NOME VUOTO, e le due cose finiscono in due posti
    // diversi apposta. Un nome VUOTO («   ») è un dato povero: la riga passa,
    // non aggancia niente, ed esce fra i non risolti con la propria ragione —
    // un buco puntuale, che è il modo giusto di fallire su una riga sporca fra
    // mille pulite. Un nome NULLO o non stringa è invece una violazione del
    // contratto del chiamante: il tipo dice `string`, e un parser non tipizzato
    // a monte che consegna `null` non ha prodotto una riga povera, ha prodotto
    // una riga rotta. Fino al 2026-09-09 non veniva fermata qui: esplodeva più
    // a valle, dentro la normalizzazione, SENZA DIRE QUALE RIGA, e faceva
    // abortire il confronto fra le due liste intere. Adesso muore alla porta,
    // con la chiave scritta, come ogni altra premessa che questo modulo non
    // può dedurre.
    if (typeof displayName !== "string") {
      throw new Error(
        `lista dichiarata (${sourceId}): la riga "${ref}" non porta un nome. Un nome vuoto ` +
          "sarebbe un dato povero e uscirebbe come non risolto; un nome assente è una riga rotta, e " +
          "riconoscerla qui costa una riga sola invece di far abortire il confronto fra le due liste " +
          "intere in un punto che non sa nemmeno dire quale riga fosse.",
      );
    }
    if (nonEmpty(identifier)) identifierPresent = true;
    if (nonEmpty(teamKey)) teamPresent = true;

    // I valori APPENA VALIDATI, non i campi da cui venivano: la riga che
    // viaggia è questa, e la sua sorgente non la può più cambiare.
    records.push(
      Object.freeze({
        ref,
        displayName,
        teamKey: teamKey as string | null | undefined,
        identifier: identifier as string | null | undefined,
      }),
    );
  }

  if (identifierPresent && !nonEmpty(identifierSpace)) {
    throw new Error(
      `lista dichiarata (${sourceId}): ci sono identificativi ma nessuno spazio dichiarato. Che la ` +
        "colonna identificativo di due fonti diverse sia lo stesso numero è un'ipotesi da misurare: " +
        "confrontarli senza dichiarare lo spazio significherebbe assumerla, e l'assunzione sbagliata " +
        "produce abbinamenti certi e falsi, che è il guasto peggiore di tutti.",
    );
  }
  if (teamPresent && !nonEmpty(teamVocabulary)) {
    throw new Error(
      `lista dichiarata (${sourceId}): ci sono squadre ma nessun vocabolario dichiarato. Questo ` +
        "modulo non riconcilia i nomi delle squadre fra le fonti: pretende che siano già nella stessa " +
        "lingua, e senza il nome di quella lingua non può sapere se lo sono.",
    );
  }

  return Object.freeze({
    sourceId: sourceId.trim(),
    provenance: provenance.trim(),
    teamVocabulary: nonEmpty(teamVocabulary) ? teamVocabulary.trim() : null,
    identifierSpace: nonEmpty(identifierSpace) ? identifierSpace.trim() : null,
    records: Object.freeze(records),
  }) as DeclaredRoster;
}

/** La targa di una lista, nella forma che finisce nel risultato. */
export function rosterHandle(roster: DeclaredRoster): RosterHandle {
  return {
    sourceId: roster.sourceId,
    provenance: roster.provenance,
    recordCount: roster.records.length,
  };
}

/**
 * GUARDIA A RUNTIME contro il cast dimentico. Il sigillo ferma
 * `{...} as never`-free, cioè l'assegnazione accidentale di un
 * `RosterDeclaration` dove va un `DeclaredRoster`; non ferma
 * `declaration as DeclaredRoster`. Chi scrive quel cast aggira il tipo ma
 * quasi sempre non pensa alla targa: qui muore, con la ragione scritta.
 * Chi inventa anche la targa passa, e resta un rischio ACCETTATO e DICHIARATO
 * — costa una bugia scritta a mano, che si vede nel diff e resta stampata
 * dentro ogni abbinamento prodotto.
 */
export function assertDeclaredProvenance(roster: DeclaredRoster, side: string): void {
  const provenance: unknown = (roster as { provenance?: unknown }).provenance;
  if (typeof provenance === "string" && provenance.trim().length > 0) return;
  throw new Error(
    `abbinamento di identità: la lista "${side}" non porta una provenienza dichiarata. È arrivata qui ` +
      "senza passare da `declareRoster()`, l'unica porta che la targa la pretende e la scrive. Il sigillo " +
      "di `DeclaredRoster` ferma l'assegnazione accidentale, non un cast esplicito, e senza targa un " +
      "abbinamento non si può più attribuire a nessuna lettura.",
  );
}

/**
 * Vero solo per una stringa presente e non vuota — l'assenza non è mai un
 * valore. Prende `unknown` e non `string | null | undefined` perché è un
 * `typeof` a runtime e deve poter dire di no anche a ciò che il TIPO prometteva
 * stringa: chi valida un campo che arriva da fuori lo fa proprio quando il tipo
 * non basta più.
 */
export function isDeclared(value: unknown): value is string {
  return nonEmpty(value);
}
