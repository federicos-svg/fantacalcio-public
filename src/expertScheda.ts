// SCHEDA GIOCATORE (Gruppo Esperti) — contratto, validatore e risoluzione.
//
// CHE COSA È, E CHE COSA NON È. Non è l'output di un estrattore che gira
// durante l'asta: è un DEPOSITO COMPILATO PRIMA (decisione di Pico, riportata
// dall'Executive nella correzione del brief di questo task). Pico legge le
// schede del Gruppo Esperti nei giorni che precedono il 3 settembre, le
// trascrive in un file JSON e lo deposita nella cartella privata autorizzata;
// il sito lo legge a runtime dall'endpoint same-origin del repository privato,
// esattamente come già fa col listone (`functions/api/listone.ts`, dietro
// Cloudflare Access). Questo file porta il CONTRATTO e il VALIDATORE; il
// lettore che va su Drive vive nel privato e non esiste qui.
//
// PERCHÉ QUESTA FORMA RISOLVE ANCHE UN PROBLEMA DI CONFINE. `RedactedPost`
// (packages/gruppo-esperti/src/types.ts, privato) porta `textLength`, non il
// testo: la prosa del forum non attraversa la redazione per costruzione.
// Quindi la prosa che l'utente legge qui è SCRITTA DA PICO, non ripubblicata
// da terzi — e nessun handle di un autore reale, nessun URL del forum e
// nessuna superficie di nome copiata dalla scheda sorgente entra in questo
// contratto. L'identità del giocatore non viene dal forum: viene dal LISTONE
// (`player` + `club` sono le due colonne che Pico ha già sotto gli occhi), e
// la chiave è `listonePlayerKey`, la stessa con cui l'event log registra un
// acquisto.
//
// IL VOCABOLARIO NON È INVENTATO QUI. I valori ammessi — titolarità,
// designazione rigori, calci piazzati, categorie di avviso — sono quelli di
// `packages/gruppo-esperti/src/signals.ts` (privato); i cinque stati di
// disponibilità e le loro etichette italiane sono quelli di
// `EXPERT_INSIGHT_QUALITY_LABELS` in `packages/gruppo-esperti/src/
// insightComponent.ts`, riportati qui alla lettera perché il privato non è
// importabile dal core pubblico. La regola del privato — «etichetta di qualità
// portata dal dato, mai dedotta a valle» — resta: la vista porta sempre la sua
// `quality` accanto alla sua `availability`, e il renderer non la ricostruisce.
//
// NIENTE DI DIRETTIVO, MAI. Nessun campo di questo contratto è (o può
// diventare) `value`, `fair_to_me`, `target_band`, un prezzo o un consiglio
// d'asta — docs/NO_GO.md §Prodotto. Lo schema è `.strict()`: una chiave in più
// nel deposito è un errore di validazione, non un campo che passa in silenzio.
// Il campo percentuale si chiama `percentuale` e NON `quota`: in fantacalcio
// «quota» è il prezzo, e un campo che si legge come un prezzo in un pannello
// che non può mostrarne sarebbe un incidente aspettato.
//
// Layer senza DOM, testabile fuori dal browser — stessa forma di
// src/nominationContext.ts e src/leagueTeams.ts.

import { z } from "zod";
import type { Role } from "../packages/engine/src/types.js";
import {
  type PagellaScheda,
  type PagellaView,
  pagellaHasContent,
  pagellaSchema,
  pagellaVuota,
  resolvePagella,
} from "./pagellaEsperti.js";
import { listonePlayerKey, normalizeIdentityPart } from "./ui/listone.js";
import {
  normalizePlayerName,
  tokenizeNormalizedName,
} from "../packages/identity-policy/src/nameSimilarity.js";

// ── Vocabolario (copia fedele di packages/gruppo-esperti/src/signals.ts) ─────

export const TITOLARITA_VALUES = ["titolare", "ballottaggio", "riserva"] as const;
export type Titolarita = (typeof TITOLARITA_VALUES)[number];

export const RIGORI_VALUES = ["designato", "possibile"] as const;
export type Rigori = (typeof RIGORI_VALUES)[number];

export const PIAZZATI_VALUES = ["punizioni", "angoli"] as const;
export type Piazzati = (typeof PIAZZATI_VALUES)[number];

/**
 * IL RANGO — «il quantesimo della fila», per i tre incarichi che la fonte
 * pubblica IN ORDINE.
 *
 * PERCHÉ ESISTE. Le sezioni della scheda sorgente non sono insiemi: sono
 * ELENCHI ORDINATI. «Rigoristi: A, B, C» non dice che tre giocatori tirano i
 * rigori, dice che il primo tira, e gli altri due tirano quando il primo non
 * c'è. Fino a qui il contratto teneva la sola APPARTENENZA — `rigori` una
 * designazione, `piazzati` un insieme di due tipi — e l'ordine, che è metà del
 * fatto, si perdeva nel passaggio dalla fonte al deposito. Il secondo dei
 * rigoristi e il primo si leggevano identici a schermo.
 *
 * PERCHÉ TRE CAMPI PIATTI E NON UN OGGETTO `ranghi`. (a) Un oggetto sarebbe un
 * LIVELLO ANNIDATO in più, cioè un altro posto in cui un campo può nascere
 * senza una via d'ingresso nel modulo che compila le schede — il difetto che
 * `EXPERT_SCHEDA_NESTED_SHAPES` esiste per contare. (b) Piatti, i tre campi
 * possono stare NELLA SHAPE accanto al segnale che ordinano, e in questo
 * schema la posizione di una chiave è un fatto e non estetica (vedi il
 * commento sull'ordine in `ballottaggioSoggettoSchema`): il legame fra
 * `piazzati` e il rango delle punizioni si legge dove i due si toccano.
 *
 * PERCHÉ `rigori` E `piazzati` NON SONO DIVENTATI OGGETTI. Sarebbe la forma
 * più elegante — `{ designazione, rango }` — ed è esattamente quella che NON si
 * può scrivere: i depositi già scritti portano lì una stringa e un array di
 * stringhe, e uno schema `.strict()` fail-closed non rifiuta una riga, rifiuta
 * IL FILE. Cambiare il tipo di quei due campi vorrebbe dire buttare l'intero
 * deposito di ~200 schede il giorno dell'aggiornamento. È la stessa scelta, e
 * la stessa ragione, di `BallottaggioSoggetto.club`: il campo nuovo è
 * FACOLTATIVO e nasce accanto al vecchio, mai al suo posto.
 *
 * ASSENTE VUOL DIRE «NON DICHIARATO», mai un rango dedotto e mai uno zero. Una
 * scheda che dice «tira le punizioni» senza dire in che ordine ha detto una
 * cosa vera e una cosa in meno: a schermo diventa `n/d`, come ogni altra
 * assenza di questo repository. Il numero PARTE DA 1 anche per questo — uno
 * zero non è un rango, e un campo che ammettesse 0 renderebbe indistinguibile
 * «non dichiarato» da «primo meno uno».
 */
export const SCHEDA_RANGO_MIN = 1;

/**
 * Il tetto del rango. Nove come `SCHEDA_GERARCHIA_MAX`, e NON la stessa
 * costante: sono due fatti diversi — la gerarchia è il posto nel ruolo, il
 * rango è il posto nella fila di uno specifico incarico — e due fatti diversi
 * che oggi hanno lo stesso limite non sono lo stesso limite. Condividere la
 * costante legherebbe l'uno all'altro il giorno in cui uno dei due cambia.
 */
export const SCHEDA_RANGO_MAX = 9;

export const AVVISO_VALUES = ["sconsigliato", "rischio_fisico", "provvisorio", "mercato"] as const;
export type Avviso = (typeof AVVISO_VALUES)[number];

/**
 * LE TRE LISTE EDITORIALI del Gruppo Esperti — la quarta icona del riquadro
 * (src/ui/schedaIcone.ts).
 *
 * NON È UN CONSIGLIO D'ASTA E NON PUÒ DIVENTARLO. È l'appartenenza a una delle
 * tre liste che la fonte pubblica: «consigliati», «possibili sorprese»,
 * «sconsigliati». Il campo dice IN QUALE LISTA la fonte ha messo il giocatore,
 * come `fonte` dice chi parla — non che cosa deve fare Pico, non a che prezzo,
 * non fino a quanto spingere. Il riquadro resta descrittivo: `directive: false`
 * è ancora letterale nel payload e lo schema `.strict()` continua a rifiutare
 * `value` / `fair_to_me` / `target_band` / `prezzo` / `maxBid` /
 * `raccomandazione`, verificato dai test di questo file.
 *
 * PERCHÉ IL CAMPO NON SI CHIAMA `raccomandazione`. Perché quel nome È nella
 * lista dei campi direttivi vietati, e un test lo cerca per prefisso sulla
 * chiave normalizzata: chiamarlo così avrebbe fatto passare per direttivo un
 * dato che non lo è, o — peggio — avrebbe costretto ad ammorbidire la guardia.
 * Si chiama `lista` perché è esattamente ciò che è: l'elenco su cui il nome
 * compare.
 *
 * `sconsigliato` VIVE IN DUE POSTI, e non è una svista: era già un `Avviso`
 * (l'unico dei quattro che è un giudizio e non un rischio) ed è la sola delle
 * tre liste che il lato privato produce oggi. `resolveListaEsperti` qui sotto
 * tiene insieme le due strade con una precedenza dichiarata invece di lasciare
 * due verità che possono divergere.
 */
export const LISTA_ESPERTI_VALUES = ["consigliato", "possibile_sorpresa", "sconsigliato"] as const;
export type ListaEsperti = (typeof LISTA_ESPERTI_VALUES)[number];

/**
 * UN ALTRO SOGGETTO DEL BALLOTTAGGIO: chi si gioca il posto con questo
 * giocatore — NOME E SQUADRA — e la sua quota.
 *
 * PERCHÉ LE DUE CHIAVI DEL SEGNALE SONO IN INGLESE in un contratto che ha tutte
 * le altre in italiano. Sono i nomi del segnale privato
 * (`packages/gruppo-esperti/src/signals.ts`, `surface` e `sharePercent`) e
 * restano identici per la stessa ragione per cui il vocabolario qui sopra è una
 * copia fedele: quando l'estrazione privata comincerà a produrli, le due forme
 * devono combaciare senza un adattatore in mezzo, che è il punto in cui due
 * contratti divergono senza che nessuno se ne accorga.
 *
 * `club` NON VIENE DA LÌ, e per questo non ne prende il nome. `SignalSubject`
 * porta `surface`, `role`, `sharePercent`, `order` — nessuna squadra: la
 * squadra non è un dato del forum, è la SECONDA METÀ DELL'IDENTITÀ, e questo
 * contratto ha già un nome per quella metà. È `club`, la chiave con cui
 * `ExpertScheda` scrive la squadra del giocatore della scheda, ed è lo stesso
 * paio — nome + squadra — che porta una riga di listone (`ListonePlayer`), che
 * porta `SchedaTarget`, che porta `SchedaImportRow` e che `listonePlayerKey`
 * piega in `nome__club` quando serve una chiave. Una seconda forma per la
 * stessa cosa sarebbe una seconda superficie da sorvegliare, e divergerebbe il
 * giorno in cui la prima cambia: qui non ce n'è una seconda, c'è la stessa.
 *
 * PERCHÉ LA SQUADRA È ARRIVATA, ed è un dato e non un ornamento. Senza di lei
 * due giocatori con lo stesso identico nome in club diversi producono lo stesso
 * valore depositato e diventano indistinguibili dopo il salvataggio. Finché il
 * ballottaggio era testo mostrato era un fastidio; da quando la valutazione del
 * Gruppo Esperti entra nel calcolo — «la concorrenza nel ruolo si legge dai
 * fatti GE: titolarità, ballottaggi» — un accoppiamento sbagliato sposta un
 * numero. Decisione di Pico, 2026-08-24: «Salva anche la squadra».
 *
 * `surface` È IL NOME COME PICO LO SCRIVE e `club` LA SQUADRA COME LA SCRIVE IL
 * LISTONE, non superfici copiate dal forum: vale qui la stessa regola che vale
 * per `player` e `club` della scheda (l'intestazione di questo file), cioè
 * l'identità viene dal listone che Pico ha sotto gli occhi. Nessun handle di
 * persona, nessun URL, nessun testo di terzi ripubblicato.
 *
 * `club` È FACOLTATIVA, e la sua assenza NON è una squadra da indovinare. I
 * depositi scritti prima di questa forma portano il solo nome: restano
 * leggibili — romperli in silenzio sarebbe peggio del difetto che questa chiave
 * chiude — e dichiarano che la squadra manca, `n/d` col motivo. Non prendono
 * quella del primo omonimo e non prendono quella del giocatore della riga:
 * un default fabbricato qui sarebbe esattamente l'accoppiamento sbagliato che
 * la chiave esiste per rendere impossibile. Chi confronta due soggetti lo sa e
 * lo dichiara: `stessoSoggettoBallottaggio` qui sotto.
 *
 * IL GIOCATORE STESSO NON È IN QUESTA LISTA. La sua quota è `percentuale`,
 * scritta una volta sola: un elenco che contenesse anche lui costringerebbe il
 * riquadro a riconoscersi per nome — un confronto fragile — per sapere chi
 * togliere, e due numeri per la stessa quota possono divergere. «Lui» adesso si
 * dice per IDENTITÀ e non per nome: un omonimo pieno di un altro club non è
 * lui, ed è un rivale legittimo come qualunque altro.
 */
export interface BallottaggioSoggetto {
  /** Il nome dell'altro, come sta scritto sulla riga di listone. */
  readonly surface: string;
  /**
   * La sua squadra, come sta scritta sulla riga di listone — la seconda metà
   * dell'identità. Assente sui depositi scritti prima di questa forma: assente
   * vuol dire «non dichiarata», mai una squadra dedotta.
   */
  readonly club?: string;
  /** La sua quota in percentuale (es. 40), quando la scheda la dichiara. */
  readonly sharePercent?: number;
}

/**
 * COME SI SCRIVE UNA SQUADRA CHE LA SCHEDA NON DICHIARA.
 *
 * `n/d` è l'idioma di questo repository per un dato che esiste e non ce
 * l'abbiamo — l'indice di appetibilità (src/ui/listone.ts), la pagella non
 * estratta (`PAGELLA_ASSENTE`) — e questo è esattamente quel caso: il rivale
 * una squadra ce l'ha, il deposito è stato scritto prima che ci fosse un posto
 * dove metterla. Una parola sola, scritta qui una volta, perché il riassunto
 * del pannello e il dettaglio dell'icona non possano dire l'assenza in due modi
 * diversi. Mai una squadra dedotta al suo posto: sarebbe l'accoppiamento
 * sbagliato reso invisibile.
 */
export const SCHEDA_CLUB_NON_DICHIARATA = "squadra n/d";

/**
 * COME SI SCRIVE UN RANGO CHE LA SCHEDA NON DICHIARA — la stessa parola, e lo
 * stesso motivo, di `SCHEDA_CLUB_NON_DICHIARATA` qui sopra.
 *
 * Serve dove il segnale C'È e l'ordine no: «tira le punizioni, e la scheda non
 * dice in che ordine». Senza questa riga un'icona accesa senza numero si
 * leggerebbe come «il primo» — cioè un'assenza travestita da fatto, che è
 * esattamente ciò che `n/d` esiste per impedire.
 */
export const SCHEDA_RANGO_NON_DICHIARATO = "rango n/d";

/** Nome e squadra di un soggetto, ridotti a ciò che serve per confrontarlo. */
export type BallottaggioIdentita = Pick<BallottaggioSoggetto, "surface" | "club">;

/**
 * DUE RIGHE SONO LA STESSA PERSONA? La domanda che il tetto di quattro, il
 * rifiuto del doppione e «il giocatore stesso non entra» pongono tutti e tre,
 * scritta UNA volta perché le tre risposte non possano divergere.
 *
 * Con la squadra dichiarata da entrambe le parti è UGUAGLIANZA DI IDENTITÀ, la
 * stessa di `listonePlayerKey`: stesso nome e stessa squadra, piegati come li
 * piega la chiave di riga. Due omonimi pieni in club diversi sono due persone e
 * restano due persone — è il punto di tutta questa forma.
 *
 * Quando UNA DELLE DUE non dichiara la squadra si risponde `true` sul solo nome,
 * cioè FAIL-CLOSED: non si può sapere se siano la stessa persona, e la
 * direzione sicura è trattarle come tali. Il contrario — «nel dubbio sono due» —
 * lascerebbe entrare due quote per la stessa persona senza che nessuno lo dica,
 * che è esattamente ciò che il rifiuto del doppione esiste per impedire.
 */
export function stessoSoggettoBallottaggio(
  a: BallottaggioIdentita,
  b: BallottaggioIdentita,
): boolean {
  if (normalizeIdentityPart(a.surface) !== normalizeIdentityPart(b.surface)) return false;
  const clubA = (a.club ?? "").trim();
  const clubB = (b.club ?? "").trim();
  if (clubA === "" || clubB === "") return true;
  return normalizeIdentityPart(clubA) === normalizeIdentityPart(clubB);
}

/**
 * Quanti ALTRI soggetti può portare un ballottaggio.
 *
 * Quattro, e non «quanti ne arrivano»: un ballottaggio a cinque non è un
 * ballottaggio, è un elenco di rosa — e un elenco senza tetto entra in un
 * riquadro che si legge in due secondi durante un'asta e lo allunga senza
 * limite. Oltre il tetto il deposito è rifiutato con un errore dichiarato,
 * non troncato in silenzio: è la stessa postura di `SCHEDA_NOTA_MAX`.
 */
export const SCHEDA_BALLOTTAGGIO_MAX = 4;

/**
 * Con quale autorità la scheda sorgente parlava — `PostAuthority` del privato,
 * meno l'identità di chi ha scritto: «scheda ufficiale della squadra» e
 * «risposta staff» sono attribuzioni NON identificanti, l'handle di una
 * persona reale no e non arriva qui.
 *
 * `community` esiste per poter registrare che la fonte NON era autorevole:
 * `isAuthoritative()` (privato) non promuove mai la community, e qui produce
 * lo stato `author_authority_not_verified`.
 */
export const FONTE_VALUES = ["scheda", "staff", "community"] as const;
export type Fonte = (typeof FONTE_VALUES)[number];

// ── I cinque stati di disponibilità ──────────────────────────────────────────

export const EXPERT_INSIGHT_AVAILABILITIES = [
  "available",
  "source_unavailable",
  "no_expert_signal",
  "identity_not_resolved",
  "author_authority_not_verified",
] as const;

export type ExpertInsightAvailability = (typeof EXPERT_INSIGHT_AVAILABILITIES)[number];

/**
 * Le etichette italiane di `packages/gruppo-esperti/src/insightComponent.ts`,
 * VERBATIM. Non sono riscritte e non vanno riscritte: sono il caveat che
 * appartiene a ciascuno stato. Il dizionario è chiuso — un consumatore non
 * può ricevere prosa libera al posto di un caveat previsto.
 */
export const EXPERT_INSIGHT_QUALITY_LABELS = {
  available: "segnale esperto — descrittivo, non validato",
  source_unavailable: "fonte aggiuntiva non disponibile",
  no_expert_signal: "nessun segnale esperto per questo giocatore",
  identity_not_resolved: "identità non risolta — segnale in coda di revisione",
  author_authority_not_verified: "autore non verificato come staff — segnale non attribuibile",
} as const satisfies Record<ExpertInsightAvailability, string>;

export type ExpertInsightQualityLabel =
  (typeof EXPERT_INSIGHT_QUALITY_LABELS)[ExpertInsightAvailability];

// ── La scheda, cioè il modulo che Pico compila ───────────────────────────────

export const EXPERT_SCHEDA_SCHEMA_VERSION = 1;

/** Il deposito è servito qui, same-origin, dal repository privato. */
export const EXPERT_SCHEDA_ENDPOINT = "/api/schede";

/**
 * Quanto può essere lunga la prosa di una scheda.
 *
 * È un vincolo di PRODOTTO, non un limite tecnico: la schermata live è la più
 * lunga dell'app e questo riquadro convive con la war board, il momento
 * dell'asta e il form ASSEGNA A. 400 caratteri sono tre o quattro righe su
 * desktop e cinque su un telefono — abbastanza per «perché» di un avviso o una
 * situazione di mercato, non abbastanza per un tema che nessuno leggerà con
 * due secondi per decidere. Una nota più lunga è un errore di validazione
 * dichiarato, non un troncamento silenzioso.
 */
export const SCHEDA_NOTA_MAX = 400;

/**
 * LA MARCATURA DI PROVENIENZA DELLA PROSA, e perché è un PREFISSO DENTRO LA
 * STRINGA invece di un campo accanto.
 *
 * Non è la forma che si sarebbe scelta a tavolino: un `generatoDaModello:
 * true` accanto a `nota` sarebbe più pulito da leggere e più facile da
 * cercare. Non esiste, e non per pigrizia — `nota` è una `string` dentro uno
 * schema `.strict()`: un campo fratello non sopravvive alla soglia, e un
 * deposito che ci provasse verrebbe rifiutato IN BLOCCO, cioè zero schede
 * lette in silenzio su ogni giocatore. Il prefisso è l'unico posto in cui la
 * provenienza attraversa il contratto insieme al testo che qualifica.
 *
 * **QUESTO MODULO LEGGE LA MARCATURA, NON LA AUTENTICA.** Chi scrive la prosa
 * decide se apporla; il riquadro riporta ciò che il dato dichiara. La
 * resistenza alla contraffazione sta nel PRODUTTORE (privato: una bozza che
 * contiene una parentesi quadra è scartata prima che il prefisso venga
 * apposto), non qui: un lettore che provasse a dedurre da sé se una frase l'ha
 * scritta un modello starebbe indovinando, ed è esattamente ciò che una
 * marcatura esiste per non far fare a nessuno.
 *
 * Il tetto non cambia: la marcatura sta DENTRO `SCHEDA_NOTA_MAX`, e il
 * produttore privato tiene il proprio tetto sotto questo (`RIASSUNTO_NOTA_MAX`,
 * legato a questo dal seam test che vede i due lati).
 */
export const SCHEDA_NOTA_MARCATURA_MODELLO = "[sintesi automatica]";

/**
 * LE PAROLE DELLA MARCATURA SENZA LE PARENTESI — derivate, mai riscritte.
 *
 * Le legge la pastiglia del riquadro (src/ui/expertInsight.ts). Scriverle una
 * seconda volta a mano avrebbe creato due dizionari per lo stesso fatto: il
 * giorno in cui la marcatura nel dato cambiasse parola, a schermo resterebbe
 * la vecchia — e nessun test se ne accorgerebbe, perché ciascuno dei due
 * confronterebbe la propria copia con sé stessa.
 */
export const SCHEDA_NOTA_MARCATURA_PAROLE = SCHEDA_NOTA_MARCATURA_MODELLO.slice(1, -1);

/** La prosa letta: il testo senza la marcatura, e se la marcatura c'era. */
export interface NotaLetta {
  /** Il testo da mostrare, SENZA il prefisso e già ripulito ai bordi. */
  readonly testo: string;
  /** `true` se la stringa portava la marcatura di provenienza. */
  readonly generataDaModello: boolean;
}

/**
 * Stacca la marcatura dal testo, una volta sola per tutte le superfici.
 *
 * La marcatura resta nel DATO — è lì che è verificabile — ma non deve restare
 * in mezzo alla frase che Pico legge durante l'asta: una parentesi quadra
 * davanti a due righe di prosa si legge come un refuso, non come una
 * provenienza. Chi rende la stacca e la mostra per quello che è.
 *
 * Il prefisso è riconosciuto solo IN TESTA e solo esatto: un `[sintesi
 * automatica]` a metà frase è testo, non una marcatura, e non accende niente.
 */
export function leggiNota(nota: string | undefined | null): NotaLetta {
  const testo = (nota ?? "").trim();
  if (!testo.startsWith(SCHEDA_NOTA_MARCATURA_MODELLO)) {
    return { testo, generataDaModello: false };
  }
  return {
    testo: testo.slice(SCHEDA_NOTA_MARCATURA_MODELLO.length).trim(),
    generataDaModello: true,
  };
}

/**
 * Il tetto di `player` e `club`. Esportato perché la schermata che COMPILA le
 * schede (src/schedaCompiler.ts) deve poter rifiutare un'identità troppo lunga
 * dicendo il perché, invece di offrire un deposito che questo stesso schema
 * rifiuterà dopo.
 */
export const SCHEDA_NAME_MAX = 80;

/**
 * I DUE CAMPI QUANTITATIVI, coi loro limiti in un posto solo.
 *
 * Erano letterali dentro `schedaSchema`. Sono costanti esportate perché il
 * compilatore di schede deve metterli su `min`/`max` dei propri campi numerici
 * e nel messaggio d'errore che scrive a Pico: una seconda copia scritta a mano
 * là dentro sarebbe una regola che può divergere da quella che valida davvero,
 * e divergerebbe in silenzio — il modulo continuerebbe a compilare e il
 * deposito verrebbe rifiutato solo alla fine, senza dire quale numero fosse
 * fuori scala. Lo schema qui sotto li usa: c'è una definizione, non due.
 */
export const SCHEDA_PERCENTUALE_MIN = 0;
export const SCHEDA_PERCENTUALE_MAX = 100;
export const SCHEDA_GERARCHIA_MIN = 1;
export const SCHEDA_GERARCHIA_MAX = 9;

/**
 * Una scheda. **Solo `player` e `club` sono obbligatori** — insieme sono
 * l'identità, e senza identità la scheda non si aggancia a nessuna riga del
 * listone. Tutto il resto è facoltativo: una scheda con due righe di prosa e
 * nessun segnale è valida, e si rende bene.
 */
export interface ExpertScheda {
  /** Nome del giocatore COME NEL LISTONE, non come nel forum. */
  readonly player: string;
  /** Squadra di serie A come nel listone: la seconda metà dell'identità. */
  readonly club: string;
  readonly titolarita?: Titolarita;
  /**
   * Quota percentuale del ballottaggio dichiarata dalla scheda (es. `60`).
   * Non è un prezzo, non è una probabilità calcolata, non è un punteggio: è
   * il numero che la scheda sorgente scrive fra parentesi quadre.
   */
  readonly percentuale?: number;
  /**
   * GLI ALTRI in ballottaggio con lui, ciascuno con la propria quota.
   *
   * Vive accanto a `titolarita: "ballottaggio"` e non al suo posto: quel campo
   * dice CHE COSA è questo giocatore, questo dice CON CHI. Senza quella
   * titolarità l'elenco non arriva alla vista — un ballottaggio con qualcuno
   * mentre la scheda dà il giocatore titolare è una contraddizione, e il
   * riquadro non ne sceglie una metà (vedi `resolveExpertInsight`).
   */
  readonly ballottaggio?: readonly BallottaggioSoggetto[];
  /** Posizione nella gerarchia del ruolo (1 = prima scelta). */
  readonly gerarchia?: number;
  readonly rigori?: Rigori;
  /**
   * IL QUANTESIMO RIGORISTA (1 = il primo della fila). Assente = la scheda non
   * lo dichiara — mai un rango dedotto dalla designazione: `designato` non
   * significa «primo», significa che la fonte lo indica come rigorista, e le
   * due cose coincidono spesso ma non per definizione.
   *
   * NON PUÒ ESISTERE SENZA `rigori`: un rango che ordina una fila a cui il
   * giocatore non appartiene è un deposito malformato, e lo schema lo rifiuta
   * invece di renderlo (vedi `schedaSchema`).
   */
  readonly rangoRigori?: number;
  readonly piazzati?: readonly Piazzati[];
  /** Il quantesimo battitore di PUNIZIONI. Vale solo con `punizioni` fra i
   *  `piazzati`; assente = non dichiarato. */
  readonly rangoPunizioni?: number;
  /** Il quantesimo battitore di ANGOLI. Vale solo con `angoli` fra i
   *  `piazzati`; assente = non dichiarato. */
  readonly rangoAngoli?: number;
  readonly avvisi?: readonly Avviso[];
  /** In quale delle tre liste editoriali la fonte ha messo il giocatore. */
  readonly lista?: ListaEsperti;
  /** La prosa: il perché di un avviso, una situazione di mercato, un contesto. */
  readonly nota?: string;
  /** `YYYY-MM-DD` del giorno in cui Pico ha scritto o rivisto la scheda. */
  readonly aggiornata?: string;
  readonly fonte?: Fonte;
  /**
   * I CINQUE VOTI SU 10 e il totale dichiarato — la riga evidenziata della
   * scheda sorgente. Contratto, scala e regola di verifica: src/pagellaEsperti.ts.
   *
   * SI CHIAMA `pagella` E NON `punteggi`, e nessuna delle sue chiavi si chiama
   * `titolarita`. Il campo `titolarita` qui sopra, tre righe più in su, è
   * un'AFFERMAZIONE CATEGORICA («titolare»); la «Titolarità 9/10» della fonte è
   * un voto, e vive dentro `pagella.voti.pagella_titolarita`. Le due parole
   * della fonte sono la stessa; i due campi non possono esserlo, e un test
   * (src/pagellaEsperti.test.ts) diventa rosso se tornano a coincidere.
   *
   * OGGI È SEMPRE ASSENTE: l'estrazione che riempie questo campo vive nel
   * repository privato e non esiste ancora. Il core pubblico porta la forma,
   * non il dato.
   */
  readonly pagella?: PagellaScheda;
}

export interface ExpertSchedaDeposit {
  readonly schemaVersion: typeof EXPERT_SCHEDA_SCHEMA_VERSION;
  readonly schede: readonly ExpertScheda[];
}

/** `YYYY-MM-DD` e data di calendario vera — stessa regola di profileSchema.ts. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === (m as number) - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * IL SOGGETTO DEL BALLOTTAGGIO, come schema con un nome.
 *
 * Era anonimo, dentro l'array. Ha un nome perché le sue chiavi devono poter
 * essere LETTE — `SCHEDA_BALLOTTAGGIO_SCHEMA_KEYS` qui sotto — dalla guardia
 * strutturale del compilatore: `.strict()` protegge questo oggetto da una
 * chiave in più, ma nessuno proteggeva il MODULO da una chiave in meno. È lo
 * stesso punto cieco di cui parla il commento sull'array, visto dall'altro
 * lato: rigido in lettura, scoperto in scrittura.
 */
const ballottaggioSoggettoSchema = z
  .object({
    surface: z.string().trim().min(1).max(SCHEDA_NAME_MAX),
    // La squadra STA IN MEZZO, fra il nome e la quota, e non in coda. L'ordine
    // delle chiavi di uno schema non è estetica: zod ricostruisce l'oggetto
    // nell'ordine della propria `shape`, e il compilatore scrive nello stesso
    // ordine — se i due divergessero, scarica → reimporta → riscarica
    // renderebbe un file diverso a parità di contenuto. È il difetto che
    // `buildSchedaPagella` ha già trovato una volta sui voti; qui l'ordine è
    // quello dell'identità, nome e squadra vicine come in `ExpertScheda`.
    // Stesso tetto di `player`/`club`: è la stessa metà d'identità, non un
    // campo nuovo con una regola sua.
    club: z.string().trim().min(1).max(SCHEDA_NAME_MAX).optional(),
    sharePercent: z
      .number()
      .int()
      .min(SCHEDA_PERCENTUALE_MIN)
      .max(SCHEDA_PERCENTUALE_MAX)
      .optional(),
  })
  .strict();

/** Le chiavi del soggetto del ballottaggio, lette DALLO SCHEMA. */
export const SCHEDA_BALLOTTAGGIO_SCHEMA_KEYS: readonly string[] = Object.keys(
  ballottaggioSoggettoSchema.shape,
);

/** Un rango: intero, da 1 in su, col tetto dichiarato. Scritto una volta e
 *  usato tre volte — tre copie della stessa regola sarebbero tre regole. */
const rangoSchema = z.number().int().min(SCHEDA_RANGO_MIN).max(SCHEDA_RANGO_MAX);

/**
 * LA SCHEDA COME OGGETTO, prima del controllo di coerenza.
 *
 * Esiste separata da `schedaSchema` per una ragione meccanica: `.superRefine`
 * rende uno `ZodEffects`, che NON ha `.shape`, e la `shape` di questo oggetto è
 * ciò da cui si leggono `EXPERT_SCHEDA_SCHEMA_KEYS` e il censimento dei livelli
 * annidati. Le chiavi restano quelle vere dello schema — lette da qui, non
 * riscritte — e il controllo di coerenza ci si avvolge intorno senza toglierle.
 */
const schedaObjectSchema = z
  .object({
    player: z.string().trim().min(1).max(SCHEDA_NAME_MAX),
    club: z.string().trim().min(1).max(SCHEDA_NAME_MAX),
    titolarita: z.enum(TITOLARITA_VALUES).optional(),
    percentuale: z
      .number()
      .int()
      .min(SCHEDA_PERCENTUALE_MIN)
      .max(SCHEDA_PERCENTUALE_MAX)
      .optional(),
    // Gli ALTRI in ballottaggio: ogni soggetto è `.strict()` a sua volta, così
    // una chiave in più dentro l'elenco (un prezzo, un punteggio, un giudizio)
    // è un errore di validazione e non un campo che passa in silenzio dentro
    // un oggetto annidato — che è il punto cieco classico di uno schema
    // rigido solo al primo livello.
    ballottaggio: z
      .array(ballottaggioSoggettoSchema)
      .max(SCHEDA_BALLOTTAGGIO_MAX)
      .optional(),
    gerarchia: z.number().int().min(SCHEDA_GERARCHIA_MIN).max(SCHEDA_GERARCHIA_MAX).optional(),
    rigori: z.enum(RIGORI_VALUES).optional(),
    // I TRE RANGHI STANNO ATTACCATI AL SEGNALE CHE ORDINANO, e l'ordine di
    // queste chiavi è un fatto: zod ricostruisce l'oggetto nell'ordine della
    // propria `shape` e il compilatore in pagina scrive nello stesso ordine —
    // se i due divergessero, esporta → reimporta → riesporta renderebbe file
    // diversi a parità di contenuto (stessa trappola del commento in
    // `ballottaggioSoggettoSchema`). Qui l'ordine è quello del fatto: prima
    // «appartiene a questa fila», subito dopo «in che posto».
    rangoRigori: rangoSchema.optional(),
    piazzati: z.array(z.enum(PIAZZATI_VALUES)).max(PIAZZATI_VALUES.length).optional(),
    rangoPunizioni: rangoSchema.optional(),
    rangoAngoli: rangoSchema.optional(),
    avvisi: z.array(z.enum(AVVISO_VALUES)).max(AVVISO_VALUES.length).optional(),
    lista: z.enum(LISTA_ESPERTI_VALUES).optional(),
    nota: z.string().trim().max(SCHEDA_NOTA_MAX).optional(),
    aggiornata: z.string().refine(isValidIsoDate).optional(),
    fonte: z.enum(FONTE_VALUES).optional(),
    pagella: pagellaSchema.optional(),
  })
  .strict();

/**
 * UN RANGO SENZA LA SUA FILA È UN DEPOSITO MALFORMATO, non un dato da
 * interpretare a valle.
 *
 * Le due direzioni non sono simmetriche, e la differenza è tutto il punto:
 *
 *  - FILA SENZA RANGO — «tira le punizioni», niente ordine — è LEGITTIMA e
 *    resta tale: è ogni deposito scritto prima di questa forma, ed è la scheda
 *    che dice una cosa vera e una cosa in meno. A schermo diventa `n/d`.
 *  - RANGO SENZA FILA — «secondo battitore di angoli» su una scheda che non
 *    dichiara gli angoli — non è un'assenza, è una CONTRADDIZIONE: chi l'ha
 *    scritta ha perso per strada metà del fatto, e nessuna delle due letture
 *    possibili («allora batte gli angoli» / «allora il rango non vale») si può
 *    scegliere senza inventare. Fail-closed: il deposito è rifiutato, come lo
 *    è per una chiave in più o per un ballottaggio oltre il tetto.
 *
 * Il rifiuto NOMINA IL PERCORSO (`path`), perché su un deposito da ~200 schede
 * un motivo che non dice quale campo l'ha causato costringe a indovinare —
 * stessa regola già registrata per il setaccio del lato privato.
 */
function rangoCoerente(scheda: z.infer<typeof schedaObjectSchema>, ctx: z.RefinementCtx): void {
  const piazzati: readonly string[] = scheda.piazzati ?? [];
  const legami = [
    {
      chiave: "rangoRigori" as const,
      rango: scheda.rangoRigori,
      dichiarato: scheda.rigori !== undefined,
      fila: "la designazione dei rigori (`rigori`)",
    },
    {
      chiave: "rangoPunizioni" as const,
      rango: scheda.rangoPunizioni,
      dichiarato: piazzati.includes("punizioni"),
      fila: "«punizioni» fra i calci piazzati (`piazzati`)",
    },
    {
      chiave: "rangoAngoli" as const,
      rango: scheda.rangoAngoli,
      dichiarato: piazzati.includes("angoli"),
      fila: "«angoli» fra i calci piazzati (`piazzati`)",
    },
  ];
  for (const legame of legami) {
    if (legame.rango !== undefined && !legame.dichiarato) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [legame.chiave],
        message: `\`${legame.chiave}\` senza ${legame.fila}: un rango ordina una fila a cui questa scheda non dichiara che il giocatore appartenga.`,
      });
    }
  }
}

const schedaSchema = schedaObjectSchema.superRefine(rangoCoerente);

/**
 * LE CHIAVI CHE LO SCHEMA DELLA SCHEDA AMMETTE, lette DALLO SCHEMA e non
 * riscritte a mano.
 *
 * Serve a una cosa sola, e la cosa è un difetto già successo tre volte: il
 * contratto cresce — `ballottaggio`, `lista`, `pagella` sono arrivati così — e
 * il modulo con cui Pico compila le schede (src/schedaCompiler.ts) resta
 * indietro, senza che niente diventi rosso. Un campo che il contratto ammette e
 * che nessuno può scrivere è lavoro impossibile, non un dettaglio.
 *
 * Da qui la guardia strutturale del compilatore legge l'elenco vero: una chiave
 * nuova in `schedaSchema` compare in questo array lo stesso giorno, e la
 * guardia resta rossa finché quella chiave non ha una via d'ingresso — un campo
 * del modulo, oppure un'eccezione dichiarata col suo motivo.
 *
 * `Object.keys` sulla forma dello schema e non un elenco letterale: un elenco
 * letterale sarebbe una seconda copia del contratto, e divergerebbe in silenzio
 * esattamente come il modulo che questa guardia esiste per sorvegliare.
 */
export const EXPERT_SCHEDA_SCHEMA_KEYS: readonly string[] = Object.keys(
  schedaObjectSchema.shape,
);

// ── IL CENSIMENTO DEI LIVELLI ANNIDATI ───────────────────────────────────────
//
// PERCHÉ NON BASTAVA UN ELENCO SCRITTO A MANO. La guardia strutturale del
// compilatore (src/schedaCompiler.ts) confronta le chiavi del contratto con i
// campi del modulo, e per farlo ha bisogno di sapere QUALI sono i livelli. Il
// primo livello lo dà `EXPERT_SCHEDA_SCHEMA_KEYS`; i livelli annidati erano
// tre — il soggetto del `ballottaggio`, la `pagella` e i suoi `voti` — e per
// due di essi la guardia esisteva, per il terzo no. Un campo dichiarato dentro
// il soggetto del ballottaggio e non cablato nel modulo passava tutta la suite
// senza che una sola prova diventasse rossa: MISURATO, non temuto.
//
// Chiudere il buco con una quarta costante scritta a mano avrebbe rimesso la
// stessa trappola un livello più in là: il QUINTO livello annidato, il giorno
// che arriverà, non sarebbe in nessun elenco. Quindi i livelli non si
// elencano: si CONTANO, camminando dentro lo schema. La guardia pretende poi
// che l'insieme trovato sia esattamente quello dichiarato — un livello nuovo è
// rosso il giorno in cui nasce, senza che nessuno debba ricordarsene.
//
// FAIL-CLOSED ANCHE SE LA CAMMINATA SI ROMPE. Se un aggiornamento di zod
// cambiasse la forma interna che questa funzione attraversa, il censimento
// troverebbe MENO livelli di quelli dichiarati e la guardia diventerebbe rossa
// lo stesso: non può restare verde per non aver guardato.

/** Un nodo dello schema, ridotto a ciò che serve per attraversarlo. */
type SchemaNode = { readonly _def?: Record<string, unknown> };

/**
 * Toglie gli involucri che non cambiano la FORMA del dato — `optional`,
 * `nullable`, `default`, l'elemento di un array, il `refine`/`superRefine` —
 * e rende il nodo che c'è sotto.
 */
function unwrapSchemaNode(node: unknown): unknown {
  let current = node;
  // Un tetto invece di un `while (true)`: uno schema ricorsivo non deve poter
  // trasformare un censimento in un ciclo infinito al caricamento del modulo.
  for (let depth = 0; depth < 16; depth += 1) {
    const def = (current as SchemaNode | undefined)?._def;
    if (def === undefined) return current;
    switch (def.typeName) {
      case "ZodOptional":
      case "ZodNullable":
      case "ZodDefault":
        current = def.innerType;
        break;
      case "ZodArray":
        current = def.type;
        break;
      case "ZodEffects":
        current = def.schema;
        break;
      default:
        return current;
    }
  }
  return current;
}

/** La forma di un nodo, quando il nodo è un oggetto; `null` altrimenti. */
function shapeOfSchemaNode(node: unknown): Record<string, unknown> | null {
  const def = (unwrapSchemaNode(node) as SchemaNode | undefined)?._def;
  if (def?.typeName !== "ZodObject") return null;
  return (def.shape as () => Record<string, unknown>)();
}

function censusNestedShapes(
  node: unknown,
  path: string,
  out: Map<string, readonly string[]>,
): void {
  const shape = shapeOfSchemaNode(node);
  if (shape === null) return;
  if (path !== "") out.set(path, Object.keys(shape));
  for (const [key, child] of Object.entries(shape)) {
    censusNestedShapes(child, path === "" ? key : `${path}.${key}`, out);
  }
}

/**
 * Ogni livello ANNIDATO dello schema della scheda, col percorso e le chiavi che
 * ammette. Il primo livello non c'è (è `EXPERT_SCHEDA_SCHEMA_KEYS`): qui ci
 * sono solo gli oggetti dentro gli oggetti, che sono i posti in cui un campo
 * nuovo passa inosservato.
 */
export const EXPERT_SCHEDA_NESTED_SHAPES: ReadonlyMap<string, readonly string[]> = (() => {
  const out = new Map<string, readonly string[]>();
  censusNestedShapes(schedaObjectSchema, "", out);
  return out;
})();

const depositSchema = z
  .object({
    schemaVersion: z.literal(EXPERT_SCHEDA_SCHEMA_VERSION),
    schede: z.array(schedaSchema),
  })
  .strict();

// ── Il deposito letto, o il motivo per cui non lo è ──────────────────────────

/**
 * Fail-closed come `loadOpponentProfiles`: un deposito illeggibile o non
 * conforme NON produce una lettura parziale. Metà delle schede sarebbe peggio
 * di nessuna scheda — sul giocatore mancante il pannello direbbe «la fonte non
 * ha nulla su di lui» mentre la verità è «non sono riuscito a leggere il file».
 */
export type ExpertSchedaStore =
  | {
      readonly ok: true;
      readonly byPlayerKey: ReadonlyMap<string, readonly ExpertScheda[]>;
      /**
       * Lo stesso deposito, raggruppato per SQUADRA piegata — l'indice su cui
       * lavora l'aggancio per nome più sotto. È derivato da `byPlayerKey`, non
       * una seconda verità: si costruisce una volta a lettura del deposito
       * perché il confronto a token non ripaghi la piega di ~200 schede a ogni
       * render (stessa ragione per cui esiste `listonePoolIndex`).
       */
      readonly byClub: ReadonlyMap<string, readonly SchedaGroup[]>;
    }
  | { readonly ok: false; readonly reason: "absent" | "unreadable" | "invalid" };

export const EXPERT_SCHEDE_ABSENT: ExpertSchedaStore = { ok: false, reason: "absent" };

/**
 * Indicizza il deposito per `listonePlayerKey`. Le collisioni NON vengono
 * risolte scegliendone una: restano tutte, e la risoluzione le trasforma in
 * `identity_not_resolved`. Scegliere in automatico fra due schede scritte a
 * mano sullo stesso giocatore significherebbe mostrare la metà sbagliata senza
 * dirlo a nessuno.
 */
export function indexSchede(schede: readonly ExpertScheda[]): ReadonlyMap<string, readonly ExpertScheda[]> {
  const byPlayerKey = new Map<string, ExpertScheda[]>();
  for (const scheda of schede) {
    const key = listonePlayerKey({ name: scheda.player, club: scheda.club });
    const bucket = byPlayerKey.get(key);
    if (bucket === undefined) byPlayerKey.set(key, [scheda]);
    else bucket.push(scheda);
  }
  return byPlayerKey;
}

/** Testo JSON -> deposito indicizzato, o il motivo del rifiuto. Non lancia mai. */
export function parseExpertSchedaDeposit(rawText: string | null): ExpertSchedaStore {
  if (rawText === null) return EXPERT_SCHEDE_ABSENT;
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const parsed = depositSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return expertSchedaStore(parsed.data.schede);
}

/** Le schede validate -> il deposito indicizzato nei due modi che servono. */
export function expertSchedaStore(schede: readonly ExpertScheda[]): ExpertSchedaStore {
  const byPlayerKey = indexSchede(schede);
  return { ok: true, byPlayerKey, byClub: indexSchedeByClub(byPlayerKey) };
}

// ── L'AGGANCIO AL LISTONE ────────────────────────────────────────────────────
//
// IL PROBLEMA CHE RISOLVE, DETTO COME SI VEDE A SCHERMO. Pico scrive ~200
// schede a mano nei giorni prima dell'asta, leggendole dalle fonti del Gruppo
// Esperti. Le fonti scrivono «Mario Rossi»; il listone della lega, sulla stessa
// riga, può scrivere «Rossi». Fino a qui `indexSchede` indicizzava la scheda su
// `mario-rossi__inter` e il riquadro cercava `rossi__inter`: due chiavi diverse,
// nessun aggancio, e il pannello dichiarava «la scheda non è ancora stata
// scritta» su una scheda che Pico aveva scritto. È il difetto peggiore possibile
// per questo riquadro, perché è INVISIBILE: chi legge non ha modo di sapere che
// esisteva qualcosa da leggere, e il lavoro sparisce senza un errore.
//
// LA REGOLA, e perché è questa e non una somiglianza a punteggio. Nessuna
// distanza di edit, nessuna soglia da tarare, nessun punteggio: tre condizioni
// esatte, tutte verificabili a occhio da chi legge il risultato.
//
//  1. SQUADRA UGUALE dopo la piega, sempre. È il vincolo che rende il resto
//     sicuro: due omonimi in due squadre diverse non si incontrano mai, e la
//     ricerca resta dentro una ventina di schede invece che sul deposito
//     intero. Si usa `normalizeIdentityPart`, cioè ESATTAMENTE la piega con cui
//     `listonePlayerKey` costruisce la metà «squadra» della chiave: così
//     qualunque riga che si agganciava prima continua ad agganciarsi.
//  2. UGUAGLIANZA PIENA sul nome piegato — il caso normale, ed è un GRADINO A
//     SÉ: quando c'è un nome identico si prende quello e si smette di cercare.
//     Senza questa precedenza un listone che scrive «Rossi» accanto a una
//     scheda «Rossi» e a una «Mario Rossi» farebbe due candidati e una domanda
//     inutile, con la risposta giusta già in mano.
//  3. Altrimenti CONTENIMENTO DI TOKEN, nei due versi: tutti i token dell'uno
//     dentro l'altro. «Rossi» ⊂ «Mario Rossi» aggancia; «Rossi» e «Rossini»
//     no, perché sono due token diversi e nessuno contiene l'altro.
//
// PERCHÉ `normalizePlayerName` + `tokenizeNormalizedName` E NON LE ALTRE DUE
// PIEGHE DI QUESTO REPOSITORY. Sono la piega progettata per il confronto a
// token (packages/identity-policy/src/nameSimilarity.ts), e le altre due sono
// esplicitamente sbagliate qui:
//  - `normalizeIdentityName` (packages/engine/src/identityName.ts) VIETA nella
//    propria intestazione di alimentarci un confronto a token: tiene apostrofi
//    e trattini come caratteri di nome, quindi «N'Golo» resta un token solo;
//  - `normalizeIdentityPart` da sola unisce tutto in una stringa sola con `-`,
//    e il contenimento degraderebbe a sottostringa grezza: «Rossi» aggancerebbe
//    «Rossini». Per la SQUADRA va benissimo (è un confronto di uguaglianza, non
//    di contenimento) ed è per questo che lì resta.
//
// L'ESITO NON È MAI UN INDOVINELLO. Zero candidati = la scheda non c'è (o il
// nome è un refuso): il riquadro lo dice, come prima. Uno = si aggancia, e se
// non era un'uguaglianza piena il pannello DICHIARA su quale nome è scritta la
// scheda, così un aggancio sbagliato è leggibile invece che silenzioso. Due o
// più = non si sceglie: si chiede a Pico (`candidates` qui sotto), e la
// risposta è sua.

/**
 * Le schede che condividono una chiave di listone, con la loro identità già
 * piegata una volta sola. `player`/`club` sono COME SCRITTI sulla scheda: sono
 * ciò che Pico rilegge nella domanda, e una superficie piegata non gli
 * direbbe niente.
 */
export interface SchedaGroup {
  readonly key: string;
  readonly player: string;
  readonly club: string;
  readonly normalizedName: string;
  readonly nameTokens: readonly string[];
  readonly schede: readonly ExpertScheda[];
}

/** L'identità di una riga di listone come la vede questo modulo: nome + squadra. */
export interface SchedaTarget {
  readonly name: string;
  readonly club: string;
  /**
   * Il ruolo classico della riga, quando chi chiama ce l'ha. Serve a UNA cosa
   * sola: sapere QUALE sia il quarto asse della pagella — «Porta inviolata»
   * per i portieri, «Bonus» per il movimento — e accorgersi quando la scheda
   * ne porta uno di un altro ruolo.
   *
   * FACOLTATIVO, e il ramo senza ruolo NON indovina: rende lo stato
   * `ruolo_ignoto` e lo scrive a schermo. Non entra in `listonePlayerKey` né
   * in `schedaLinkRowKey`: l'identità di una riga resta nome + squadra, come
   * prima, e il ruolo non ne fa parte.
   */
  readonly role?: Role;
}

/**
 * Raggruppa il deposito per squadra piegata. L'ordine dentro ogni secchio è
 * quello del deposito, cioè l'ordine in cui Pico ha scritto le schede: è
 * deterministico e non è un ranking — nessuna delle due cose che una
 * graduatoria implicita farebbe credere.
 */
export function indexSchedeByClub(
  byPlayerKey: ReadonlyMap<string, readonly ExpertScheda[]>,
): ReadonlyMap<string, readonly SchedaGroup[]> {
  const byClub = new Map<string, SchedaGroup[]>();
  for (const [key, schede] of byPlayerKey) {
    const first = schede[0];
    if (first === undefined) continue;
    const normalizedName = normalizePlayerName(first.player);
    const group: SchedaGroup = {
      key,
      player: first.player,
      club: first.club,
      normalizedName,
      nameTokens: tokenizeNormalizedName(normalizedName),
      schede,
    };
    const clubKey = normalizeIdentityPart(first.club);
    const bucket = byClub.get(clubKey);
    if (bucket === undefined) byClub.set(clubKey, [group]);
    else bucket.push(group);
  }
  return byClub;
}

/**
 * Tutti i token di `inner` sono anche in `outer`. Un lato vuoto non contiene e
 * non è contenuto: «nessuna prova» non diventa mai un aggancio gratuito (stessa
 * postura di `computeTokenOverlap`, che su un lato vuoto rende 0).
 */
function tokensContained(inner: readonly string[], outer: readonly string[]): boolean {
  if (inner.length === 0 || outer.length === 0) return false;
  const set = new Set(outer);
  return inner.every((token) => set.has(token));
}

/**
 * Le schede che potrebbero appartenere a questa riga di listone, secondo la
 * regola dichiarata sopra. Pura: non sceglie, non ordina per merito, non
 * inventa. Zero, una o più — chi chiama decide che cosa farne.
 */
export function findSchedaCandidates(
  store: ExpertSchedaStore,
  target: SchedaTarget | null,
): readonly SchedaGroup[] {
  if (!store.ok || target === null) return [];
  const bucket = store.byClub.get(normalizeIdentityPart(target.club)) ?? [];
  if (bucket.length === 0) return [];
  const normalized = normalizePlayerName(target.name);
  const tokens = tokenizeNormalizedName(normalized);
  if (tokens.length === 0) return [];
  const exact = bucket.filter((group) => group.normalizedName === normalized);
  if (exact.length > 0) return exact;
  return bucket.filter(
    (group) =>
      tokensContained(tokens, group.nameTokens) || tokensContained(group.nameTokens, tokens),
  );
}

// ── La vista che il riquadro rende ───────────────────────────────────────────

/**
 * Una scheda candidata, ridotta a ciò che serve per farne una domanda leggibile:
 * il nome e la squadra COME SCRITTI sulla scheda, e quante schede stanno sotto
 * quell'identità (`count > 1` = due schede identiche, che restano da unire a
 * mano anche dopo la scelta).
 */
export interface ExpertSchedaCandidate {
  readonly schedaKey: string;
  readonly player: string;
  readonly club: string;
  readonly count: number;
}

/**
 * Come la scheda è finita accanto a questa riga di listone:
 *  - `exact`     — nome piegato identico, il caso normale;
 *  - `contained` — un nome contenuto nell'altro, aggancio unico e DICHIARATO
 *                  a schermo, perché un aggancio dedotto va letto;
 *  - `chosen`    — c'erano più candidati e Pico ha scelto.
 */
export type SchedaMatch = "exact" | "contained" | "chosen";

/**
 * Ciò che arriva al riquadro. I tre fatti di onestà sono LETTERALI `false`,
 * non configurazione: `contributesToIndex` (non entra in nessun calcolo),
 * `validated` (nessuno ha verificato questo segnale) e `directive` (non è un
 * consiglio). Sono nel payload E sono resi a schermo — un flag vero solo nel
 * JSON non lo legge nessuno.
 */
export interface ExpertInsightView {
  readonly availability: ExpertInsightAvailability;
  readonly quality: ExpertInsightQualityLabel;
  readonly contributesToIndex: false;
  readonly validated: false;
  readonly directive: false;
  /**
   * Le schede fra cui Pico deve scegliere, quando ce n'è più d'una che
   * potrebbe essere di questa riga. VUOTO quando non c'è niente da chiedere —
   * cioè quasi sempre. NON è un ranking e non è ordinato per merito: è
   * l'ordine in cui le schede sono scritte nel deposito, e nessuna delle due
   * è «la prima».
   */
  readonly candidates: readonly ExpertSchedaCandidate[];
  /**
   * La scheda che Pico ha scelto fra i candidati, o `null` quando non ha
   * ancora scelto. Torna `null` anche quando la scelta di ieri punta a una
   * scheda che oggi non è più fra i candidati: la domanda si riapre invece di
   * agganciare in silenzio qualcosa di diverso.
   */
  readonly chosenSchedaKey: string | null;
  /** Come si è arrivati a questa scheda, o `null` quando non c'è aggancio. */
  readonly matchedBy: SchedaMatch | null;
  /** Il nome COME SCRITTO sulla scheda agganciata — quello che Pico rilegge. */
  readonly matchedPlayer: string | null;
  readonly titolarita: Titolarita | null;
  readonly percentuale: number | null;
  /**
   * GLI ALTRI in ballottaggio, o lista vuota. Vuota anche quando la scheda ne
   * porta ma la titolarità non è `ballottaggio`: vedi `resolveExpertInsight`.
   * È una lista e non un `null`, come `piazzati` e `avvisi`.
   */
  readonly ballottaggio: readonly BallottaggioSoggetto[];
  readonly gerarchia: number | null;
  readonly rigori: Rigori | null;
  /**
   * IL RANGO DEI TRE INCARICHI, o `null` quando la scheda non lo dichiara.
   *
   * `null` E NON `0`, e non «l'ultimo posto»: è la stessa postura di
   * `percentuale` e `gerarchia` qui sopra. Chi rende una colonna o un'icona
   * scrive `n/d` — un rango inventato metterebbe un giocatore in una fila in
   * un posto che nessuno gli ha dato, che è il modo esatto in cui un'assenza
   * si traveste da fatto.
   *
   * Ciascuno sopravvive solo insieme alla propria fila: lo schema lo impone
   * già in lettura (`rangoCoerente`), e `resolveExpertInsight` non lo rimette
   * in circolo per conto proprio.
   */
  readonly rangoRigori: number | null;
  readonly piazzati: readonly Piazzati[];
  readonly rangoPunizioni: number | null;
  readonly rangoAngoli: number | null;
  readonly avvisi: readonly Avviso[];
  /** La lista editoriale in cui la fonte lo ha messo, o `null`. */
  readonly lista: ListaEsperti | null;
  /** La prosa SENZA la marcatura di provenienza: quella sta nel campo accanto. */
  readonly nota: string;
  /**
   * `true` quando la prosa portava la marcatura `SCHEDA_NOTA_MARCATURA_MODELLO`.
   *
   * È un campo della VISTA e non del contratto: nel deposito la provenienza
   * viaggia dentro la stringa, perché lo schema `.strict()` non ammette un
   * campo fratello. Qui i due fatti si separano una volta sola, e le due
   * superfici che li mostrano — il riquadro e la sua forma parlata — leggono
   * lo stesso, invece di ritagliare ciascuna il proprio prefisso.
   */
  readonly notaGenerataDaModello: boolean;
  readonly aggiornata: string | null;
  readonly fonte: Fonte | null;
  /**
   * La pagella risolta — sempre presente, anche quando è vuota (che oggi è
   * sempre). Non è `PagellaScheda | null`: il riquadro deve poter rendere i
   * cinque assi «assenti» senza che ogni chiamante si ricordi di gestire un
   * `null`, ed è la stessa postura di `piazzati`/`avvisi`, che sono liste
   * vuote e non `null`.
   */
  readonly pagella: PagellaView;
}

/**
 * Lo stato «non lo so», in tutte e quattro le sue forme. È VUOTO per
 * costruzione: nessun segnale, nessuna prosa, nessuna data. Quattro stati su
 * cinque significano che non c'è nulla da dire, e devono sembrarlo — un
 * riquadro che conserva mezzo contenuto mentre dichiara di non averne è
 * peggio di un riquadro vuoto, perché si legge come pieno.
 */
export function unknownExpertInsight(
  availability: Exclude<ExpertInsightAvailability, "available">,
  role: Role | null = null,
): ExpertInsightView {
  return {
    availability,
    quality: EXPERT_INSIGHT_QUALITY_LABELS[availability],
    contributesToIndex: false,
    validated: false,
    directive: false,
    candidates: [],
    chosenSchedaKey: null,
    matchedBy: null,
    matchedPlayer: null,
    titolarita: null,
    percentuale: null,
    ballottaggio: [],
    gerarchia: null,
    rigori: null,
    rangoRigori: null,
    piazzati: [],
    rangoPunizioni: null,
    rangoAngoli: null,
    avvisi: [],
    lista: null,
    nota: "",
    notaGenerataDaModello: false,
    aggiornata: null,
    fonte: null,
    // La pagella VUOTA porta comunque il ruolo, quando lo si conosce: così il
    // quarto asse ha già il proprio nome anche in uno stato che non lo mostra,
    // e la vista non cambia forma fra uno stato e l'altro.
    pagella: pagellaVuota(role),
  };
}

/**
 * LA LISTA EDITORIALE RISOLTA, con la precedenza scritta una volta sola.
 *
 * Due strade portano allo stesso fatto e non possono restare due verità:
 *
 *  - l'AVVISO `sconsigliato` — la sola delle tre liste che oggi esiste davvero
 *    nel deposito, e che il riquadro mostra già come pastiglia;
 *  - il campo `lista`, che porterà tutte e tre quando l'estrazione privata
 *    esisterà.
 *
 * L'AVVISO VINCE, sempre. Non è una scelta estetica: è la sola direzione
 * fail-closed. Una scheda che dichiara insieme «consigliato» e l'avviso
 * «sconsigliato» si contraddice, e delle due letture una promuove il giocatore
 * e l'altra lo scarta — mostrare quella che promuove significherebbe cancellare
 * a schermo l'unica prova che la scheda va riletta. La pastiglia dell'avviso
 * resta comunque dov'è: le due scritte restano tutte e due sotto gli occhi.
 */
export function resolveListaEsperti(scheda: ExpertScheda): ListaEsperti | null {
  if ((scheda.avvisi ?? []).includes("sconsigliato")) return "sconsigliato";
  return scheda.lista ?? null;
}

/**
 * GLI ALTRI DEL BALLOTTAGGIO CHE ARRIVANO ALLA VISTA — la regola scritta UNA
 * volta, e chiesta da tutti e due i lati.
 *
 * Un elenco di rivali su un giocatore che la scheda dà titolare (o su cui non
 * dichiara niente) non è un ballottaggio, è un elenco senza soggetto: il
 * riquadro non ne sceglie una metà, l'icona resta spenta e l'elenco non arriva
 * a schermo.
 *
 * PERCHÉ È UNA FUNZIONE E NON UNA CONDIZIONE RIPETUTA. La stessa riga viveva
 * due volte alla lettera: qui, nel consumatore, e dentro `buildScheda`
 * (src/schedaCompiler.ts), che rifiuta di salvare dei nomi che non verrebbero
 * mostrati. Due copie di una regola sono due regole, e queste due devono
 * restare la stessa o il compilatore comincerebbe ad accettare (o a rifiutare)
 * qualcosa che la vista tratta al contrario — cioè di nuovo lavoro scritto e
 * mai reso. Adesso il compilatore CHIEDE alla vista, invece di sapere.
 */
export function ballottaggioVisibile(
  scheda: Pick<ExpertScheda, "titolarita" | "ballottaggio">,
): readonly BallottaggioSoggetto[] {
  return scheda.titolarita === "ballottaggio" ? scheda.ballottaggio ?? [] : [];
}

/** `true` quando la scheda dice almeno una cosa — un segnale o una riga di prosa. */
export function schedaHasContent(scheda: ExpertScheda): boolean {
  return (
    scheda.titolarita !== undefined ||
    scheda.rigori !== undefined ||
    scheda.gerarchia !== undefined ||
    // Una scheda che porta SOLO la lista editoriale dice qualcosa: è la quarta
    // icona del riquadro, e senza questa riga verrebbe classificata «aperta ma
    // vuota» e l'icona sparirebbe insieme al resto del pannello.
    scheda.lista !== undefined ||
    (scheda.ballottaggio ?? []).length > 0 ||
    (scheda.piazzati ?? []).length > 0 ||
    (scheda.avvisi ?? []).length > 0 ||
    (scheda.nota ?? "").trim() !== "" ||
    // Una scheda che porta SOLO la pagella dice eccome qualcosa: sono i cinque
    // voti della riga evidenziata. Senza questa riga verrebbe classificata
    // «aperta ma vuota» e il riquadro nasconderebbe il radar che ha appena
    // ricevuto.
    (scheda.pagella !== undefined && pagellaHasContent(scheda.pagella))
  );
}

function toCandidate(group: SchedaGroup): ExpertSchedaCandidate {
  return {
    schedaKey: group.key,
    player: group.player,
    club: group.club,
    count: group.schede.length,
  };
}

/**
 * Dalla riga di listone alla vista. È l'unico punto in cui uno dei cinque stati
 * viene deciso, e ogni ramo ha una ragione dichiarata:
 *
 *  - deposito non letto             -> `source_unavailable`
 *  - nessun candidato               -> `no_expert_signal`   («non è ancora scritta»)
 *  - più candidati, nessuno scelto  -> `identity_not_resolved` + `candidates`
 *  - due schede sotto la stessa id  -> `identity_not_resolved` («vanno unite»)
 *  - `fonte: "community"`           -> `author_authority_not_verified`
 *  - scheda aperta ma vuota         -> `no_expert_signal`   (aperta ≠ compilata)
 *  - altrimenti                     -> `available`
 *
 * L'IDENTITÀ ARRIVA COME NOME + SQUADRA, non come chiave già calcolata: era una
 * chiave, e la coincidenza fra la ricetta di chi chiamava e quella di
 * `indexSchede` era un vincolo scritto solo in un commento. Ora la ricetta è
 * una sola e sta qui dentro — un `proxyId` di riga non può più entrare per
 * sbaglio nella chiave e mandare a vuoto un deposito indicizzato su nome+squadra.
 *
 * `chosenSchedaKey` è la risposta che Pico ha già dato per questa riga, quando
 * l'ha data. Vale SOLO in presenza di più candidati: non può creare un aggancio
 * dove la regola non ne trova, e non può spostarne uno dove ce n'è uno solo.
 *
 * `percentuale` sopravvive solo insieme a una titolarità: una percentuale da
 * sola non è un ballottaggio, è un numero senza soggetto.
 */
/**
 * Il deposito porta ALMENO UNA pagella con dei voti dentro?
 *
 * Serve a una decisione di costo, non di prodotto: la nota sotto il listone
 * conta righe complete, parziali, totali divergenti e assi incoerenti, e per
 * contarle deve risolvere l'aggancio nome+squadra di OGNI riga del pool. Oggi
 * quel conto varrebbe zero su ogni riga — l'estrazione privata non esiste
 * ancora — e sarebbe una passata su ~500 righe a ogni tasto premuto, cioè
 * esattamente il costo che la memoizzazione di #40 è appena andata a togliere.
 *
 * Con questa domanda, che costa quanto il deposito (~200 schede) e non quanto
 * il pool, la passata comincerà a girare il giorno in cui ci sarà davvero
 * qualcosa da contare, senza che nessuno debba ricordarsi di riaccenderla.
 */
export function expertSchedeHavePagella(store: ExpertSchedaStore): boolean {
  if (!store.ok) return false;
  for (const schede of store.byPlayerKey.values()) {
    for (const scheda of schede) {
      if (scheda.pagella !== undefined && pagellaHasContent(scheda.pagella)) return true;
    }
  }
  return false;
}

export function resolveExpertInsight(
  store: ExpertSchedaStore,
  target: SchedaTarget | null,
  chosenSchedaKey: string | null = null,
): ExpertInsightView {
  const role = target?.role ?? null;
  if (!store.ok) return unknownExpertInsight("source_unavailable", role);
  if (target === null) return unknownExpertInsight("no_expert_signal", role);

  const found = findSchedaCandidates(store, target);
  if (found.length === 0) return unknownExpertInsight("no_expert_signal", role);

  const ambiguous = found.length > 1;
  const candidates = ambiguous ? found.map(toCandidate) : [];
  const group = ambiguous
    ? found.find((candidate) => candidate.key === chosenSchedaKey) ?? null
    : (found[0] as SchedaGroup);

  // Più candidati e nessuna scelta valida: la domanda, non un'ipotesi.
  if (group === null) {
    return { ...unknownExpertInsight("identity_not_resolved", role), candidates };
  }

  const link = {
    candidates,
    chosenSchedaKey: ambiguous ? group.key : null,
    matchedBy: (ambiguous
      ? "chosen"
      : group.normalizedName === normalizePlayerName(target.name)
        ? "exact"
        : "contained") as SchedaMatch,
    matchedPlayer: group.player,
  };

  // Due schede sotto la STESSA identità: sceglierne una a caso mostrerebbe la
  // metà sbagliata senza dirlo. Restano da unire a mano, come prima.
  if (group.schede.length > 1) {
    return { ...unknownExpertInsight("identity_not_resolved", role), ...link };
  }
  const scheda = group.schede[0] as ExpertScheda;
  if (scheda.fonte === "community") {
    return { ...unknownExpertInsight("author_authority_not_verified", role), ...link };
  }
  if (!schedaHasContent(scheda)) {
    return { ...unknownExpertInsight("no_expert_signal", role), ...link };
  }
  const notaLetta = leggiNota(scheda.nota);
  return {
    availability: "available",
    quality: EXPERT_INSIGHT_QUALITY_LABELS.available,
    contributesToIndex: false,
    validated: false,
    directive: false,
    ...link,
    titolarita: scheda.titolarita ?? null,
    percentuale: scheda.titolarita === undefined ? null : scheda.percentuale ?? null,
    // GLI ALTRI IN BALLOTTAGGIO SOPRAVVIVONO SOLO A UN BALLOTTAGGIO — stessa
    // regola di `percentuale` una riga più sopra. La regola sta in
    // `ballottaggioVisibile` e non qui dentro: la chiede anche il compilatore
    // di schede, e due copie della stessa riga sono due regole.
    ballottaggio: ballottaggioVisibile(scheda),
    gerarchia: scheda.gerarchia ?? null,
    rigori: scheda.rigori ?? null,
    // IL RANGO SOPRAVVIVE SOLO INSIEME ALLA PROPRIA FILA — la stessa regola di
    // `percentuale` e del ballottaggio, ripetuta qui perché la vista non
    // dipenda dalla validazione per essere coerente: questa funzione riceve
    // anche schede costruite a mano nei test e nel compilatore, che non passano
    // dallo schema. Un rango orfano non arriva a schermo, non diventa `0` e non
    // accende un'icona.
    rangoRigori: scheda.rigori === undefined ? null : scheda.rangoRigori ?? null,
    piazzati: scheda.piazzati ?? [],
    rangoPunizioni: (scheda.piazzati ?? []).includes("punizioni")
      ? scheda.rangoPunizioni ?? null
      : null,
    rangoAngoli: (scheda.piazzati ?? []).includes("angoli") ? scheda.rangoAngoli ?? null : null,
    avvisi: scheda.avvisi ?? [],
    lista: resolveListaEsperti(scheda),
    // LA PROSA SI SDOPPIA QUI, e in nessun altro posto: il testo da leggere da
    // una parte, la marcatura di provenienza dall'altra. Il dato resta intero
    // — questa è la vista, non il deposito.
    nota: notaLetta.testo,
    notaGenerataDaModello: notaLetta.generataDaModello,
    aggiornata: scheda.aggiornata ?? null,
    fonte: scheda.fonte ?? null,
    // Il RUOLO viene dalla riga di listone, non dalla scheda: la scheda non
    // dichiara un ruolo, e chiederglielo aprirebbe una seconda verità
    // sull'identità del giocatore accanto a quella del listone.
    pagella: resolvePagella(scheda.pagella, role),
  };
}
