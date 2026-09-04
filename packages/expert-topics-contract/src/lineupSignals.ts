// I SEGNALI DI FORMAZIONE DENTRO UN POST — funzioni pure, misura e dichiara.
//
// CHE COSA FA. Dato un post già strutturato (`TopicPost`) e un **lessico
// iniettato**, dice quali affermazioni di formazione quel post contiene: un
// giocatore **dato titolare**, **in dubbio**, **dato fuori**, oppure una
// **smentita** di una notizia precedente. Ogni segnale esce con il grado della
// propria evidenza e con il punto del post da cui viene.
//
// CHE COSA NON FA, E NON DEVE FARE. Non pesa, non ordina, non sceglie, non
// riassume, non tiene «l'ultima versione». Il testo di un post non è un dato
// strutturato: ogni estrazione da testo libero è un'**inferenza**, e una
// inferenza che si presentasse come un fatto sarebbe peggio di nessuna
// estrazione. Per questo qui si misura e si dichiara — come fa
// `packages/source-reliability` con l'accordo fra fonti — e chi sta a valle
// decide quanto credere a che cosa. Nessuna funzione di questo file assegna un
// punteggio, un peso, una fiducia o un ordinamento per qualità.
//
// LE QUATTRO REGOLE CHE REGGONO TUTTO IL FILE.
//
//  1. **Il silenzio non è un'assenza di informazione sul giocatore.** Un post
//     che non contiene segnali riconoscibili non produce segnali, e questo non
//     è un errore: è `SILENZIO`, ed è un fatto diverso da «detto fuori». Il
//     silenzio si può dichiarare **solo se il testo è stato davvero letto**: se
//     il corpo del post non è riconosciuto, l'esito è
//     `SILENZIO_NON_DIMOSTRABILE`, che non autorizza nessuna conclusione.
//
//  2. **Una contraddizione non cancella niente.** Un segnale più recente che
//     contraddice uno precedente non sostituisce il precedente: restano
//     entrambi, ciascuno col proprio momento, e la contraddizione viene
//     **dichiarata**. Non esiste in questo file un campo «ultimo segnale»:
//     esisterebbe per essere letto da solo, e chi legge deve poter vedere che
//     l'esperto ha cambiato idea.
//
//  3. **Il ruolo si verifica, non si presume.** Un segnale prodotto da un
//     autore con ruolo non verificato è **valido** e viene emesso, **marcato**
//     come tale (`roleVerified: false`, con la classe di ruolo accanto): mai
//     scartato in silenzio, mai promosso. Scartarlo sarebbe inventare un
//     silenzio; promuoverlo sarebbe inventare un'autorità.
//
//  4. **Una citazione non trasferisce il ruolo.** Le parole dentro una
//     citazione restano parole di chi è citato: producono segnali — perché sono
//     state dette — ma con `voice: "citazione"` e `roleInherited: false`. Il
//     ruolo verificato di chi cita non copre ciò che ha detto un altro, e il
//     ruolo di chi è citato non passa a chi cita. Il contratto lo dice già in
//     `Quote`; qui viene rispettato.
//
// PERCHÉ IL LESSICO È UN INGRESSO E NON UNA COSTANTE. Le parole con cui una
// fonte dice «titolare», «in dubbio», «fuori», «smentito» sono **la forma di
// quella fonte**: un elenco di parole scritto qui dentro sarebbe una
// descrizione della fonte pubblicata nel core, esattamente come lo sarebbe la
// tabella delle chiavi di un documento — che infatti, per la stessa ragione, è
// già stata spostata fuori dal sorgente che la usa. Qui non c'è nessun elenco
// di riserva, nessun valore per difetto e nessun tentativo «alla cieca» su
// parole plausibili: **senza lessico il parser non tenta niente**, e lo dice
// (`LESSICO_ASSENTE`, `LESSICO_INCOMPLETO`, con la famiglia che mancava).
//
// SCELTE TECNICHE DICHIARATE E CONTESTABILI (non decisioni di prodotto):
// la segmentazione a due livelli — periodi su `.;:!?` e a capo, proposizioni su
// virgola — con i termini di segnale cercati nella proposizione e gli
// attenuatori nel periodo; il confronto letterale su testo ripiegato (minuscole
// e diacritici tolti) invece di espressioni regolari compilate dal dato del
// chiamante; la vittoria del **termine più lungo** quando due famiglie si
// sovrappongono sugli stessi caratteri; **un solo segnale per famiglia e per
// proposizione**; l'ordine dei segnali preso dall'ordine in cui il chiamante
// consegna i post, e non dalle date dichiarate — che viaggiano accanto e non
// vengono interpretate, perché una data letta dalla fonte porta un fuso che
// questo perimetro non ha mai verificato.

import type { AuthorRole, Quote, TopicPost } from "./types.js";

/** Versione dell'estrazione dei segnali: viaggia con l'esito. */
export const SIGNALS_VERSION = "expert-topics-signals-v1.0.0" as const;

/** Le famiglie di parole che il lessico deve coprire. Elenco chiuso. */
export const SIGNAL_FAMILIES = ["titolare", "in_dubbio", "fuori", "smentita"] as const;

export type SignalFamily = (typeof SIGNAL_FAMILIES)[number];

/** Che cosa un segnale afferma. Vocabolario chiuso, uno per famiglia. */
export type SignalKind = "DATO_TITOLARE" | "IN_DUBBIO" | "DATO_FUORI" | "SMENTITA";

const KIND_OF: Readonly<Record<SignalFamily, SignalKind>> = {
  titolare: "DATO_TITOLARE",
  in_dubbio: "IN_DUBBIO",
  fuori: "DATO_FUORI",
  smentita: "SMENTITA",
};

/** Le forme con cui un giocatore compare nel testo. **Iniettate**: qui non se ne conosce nessuna. */
export interface PlayerForms {
  readonly playerId: string;
  readonly forms: readonly string[];
}

/**
 * Il lessico: **l'ingresso obbligatorio** del riconoscitore.
 *
 * **NON SCRIVERLO QUI DENTRO.** Sembrerà una semplificazione — «tanto sono solo
 * parole» — e costerebbe due cose: il core pubblico direbbe come parla la fonte
 * che leggiamo, e ogni volta che quella cambia modo di dirlo bisognerebbe
 * ripubblicare un parser invece di aggiornare un dato privato.
 */
export interface SignalLexicon {
  /** Le parole di ogni famiglia. Una famiglia vuota ferma il riconoscimento. */
  readonly terms: Readonly<Record<SignalFamily, readonly string[]>>;
  /**
   * Le forme che **attenuano** un enunciato senza cambiarne la famiglia. Può
   * essere vuota: allora nessun segnale sarà mai `attenuata`, e il fatto è
   * dichiarato (`attenuatorsDeclared: false`), non nascosto.
   */
  readonly attenuators: readonly string[];
  /** I soggetti riconoscibili. Vuoto = nessun segnale avrà mai un soggetto. */
  readonly players: readonly PlayerForms[];
}

/** Forma dell'enunciato: com'è detto, non quanto vale. */
export type StatementForm = "affermata" | "attenuata";

/** Di chi sono le parole. */
export type SignalVoice = "autore" | "citazione";

/** Se il soggetto del segnale è stato identificato, e come. */
export type SubjectResolution = "risolto" | "ambiguo" | "non_identificato";

/** Dove è stato trovato il soggetto: nella proposizione, o nel periodo. */
export type SubjectScope = "proposizione" | "periodo" | "nessuno";

/**
 * Il grado dell'evidenza di un segnale: **fatti osservati, messi accanto**.
 *
 * Deliberatamente **non** un punteggio e **non** un ordinale: `alto/medio/basso`
 * sarebbe già un peso, e pesare qui vorrebbe dire che la misura giustifica la
 * scelta che l'ha prodotta. Chi sta a valle guarda questi campi e decide.
 */
export interface SignalEvidence {
  readonly form: StatementForm;
  /** Il termine attenuatore osservato, come lo ha scritto il chiamante. `""` se nessuno. */
  readonly attenuatorTerm: string;
  readonly subject: SubjectResolution;
  readonly subjectScope: SubjectScope;
  /** Quanti soggetti distinti erano in gioco: 1 = risolto, >1 = ambiguo, 0 = nessuno. */
  readonly candidateSubjects: number;
  /** La classe di ruolo dell'autore del post, dal verdetto del parser. */
  readonly roleClass: AuthorRole;
  /** Vero **solo** per `staff_verificato`: un ruolo non verificato non è «non staff». */
  readonly roleVerified: boolean;
  /** Questo pacchetto non assegna pesi e non ordina per qualità. */
  readonly weighted: false;
}

/** Da quale parte del post viene il segnale. */
export interface SignalOrigin {
  readonly voice: SignalVoice;
  /** `0` nel corpo dell'autore; `1`, `2`, … dentro le citazioni. */
  readonly quoteDepth: number;
  /** Indice della citazione nel post, in ordine di apertura. `-1` nel corpo. */
  readonly quoteIndex: number;
  readonly quotedAuthorRecognised: boolean;
  /** Il ruolo di chi è citato non passa **mai** a chi cita. */
  readonly roleInherited: false;
  readonly sentenceIndex: number;
  readonly clauseIndex: number;
  /** Posizione del termine nella proposizione ripiegata. Serve a rifare la misura. */
  readonly termOffset: number;
}

/** Un'affermazione di formazione, con addosso tutto ciò che serve a soppesarla altrove. */
export interface LineupSignal {
  /** Deterministico: stesso ingresso, stesso identificativo. */
  readonly signalId: string;
  readonly postId: string;
  /** Ordine **osservato** dei post, dichiarato dal chiamante. Non è una data. */
  readonly sequence: number;
  /** La data dichiarata dalla fonte, così com'è. Mai interpretata, mai confrontata. */
  readonly publishedAt: string | null;
  readonly kind: SignalKind;
  readonly family: SignalFamily;
  /** Il termine iniettato che ha prodotto il segnale, come lo ha scritto il chiamante. */
  readonly matchedTerm: string;
  /** `null` quando il soggetto non è risolto: il segnale resta, dichiarato. */
  readonly playerId: string | null;
  /** I soggetti in gioco quando il segnale è ambiguo. Ordine alfabetico. */
  readonly candidates: readonly string[];
  readonly evidence: SignalEvidence;
  readonly origin: SignalOrigin;
}

/** Riferimento breve a un segnale, per le tracce e le contraddizioni. */
export interface SignalRef {
  readonly signalId: string;
  readonly postId: string;
  readonly sequence: number;
  readonly publishedAt: string | null;
  readonly kind: SignalKind;
  readonly voice: SignalVoice;
  readonly form: StatementForm;
  readonly roleVerified: boolean;
}

/** Che rapporto c'è fra due segnali che non stanno insieme. Vocabolario chiuso. */
export type ContradictionRelation =
  /** Dato titolare e dato fuori: non possono valere insieme. */
  | "OPPOSTI"
  /** Una certezza e un dubbio sullo stesso giocatore: la posizione è stata rivista. */
  | "RIVISTO"
  /** Una smentita esplicita accanto a un'affermazione. */
  | "SMENTITA_DICHIARATA";

/** Dove sta la contraddizione: dentro un post, o fra due post. */
export type ContradictionSpan = "STESSO_POST" | "POST_SUCCESSIVO";

/** Una contraddizione **dichiarata**: nessuno dei due segnali viene tolto. */
export interface SignalContradiction {
  readonly playerId: string;
  readonly relation: ContradictionRelation;
  readonly span: ContradictionSpan;
  readonly earlier: SignalRef;
  readonly later: SignalRef;
  /** Entrambi restano leggibili: la contraddizione si dichiara, non si risolve. */
  readonly bothRetained: true;
}

/**
 * Tutto ciò che è stato detto su un giocatore, in ordine osservato.
 *
 * Non esiste un campo «ultimo»: sarebbe letto da solo, e chi legge deve poter
 * vedere che l'esperto ha cambiato idea.
 */
export interface PlayerSignalTrace {
  readonly playerId: string;
  readonly entries: readonly SignalRef[];
  readonly kindsSeen: readonly SignalKind[];
  readonly contradictions: readonly SignalContradiction[];
  readonly stanceChanged: boolean;
}

/** Esito della lettura di un post. Il silenzio ha un nome, e non è un errore. */
export type PostSignalOutcome =
  /** Il lessico non è arrivato: non è stato letto niente. */
  | "LESSICO_ASSENTE"
  /** Il lessico è arrivato incompleto: non è stato letto niente. */
  | "LESSICO_INCOMPLETO"
  /** Almeno un segnale riconosciuto. */
  | "SEGNALI"
  /** Testo letto, nessun segnale: **silenzio**, non «detto fuori». */
  | "SILENZIO"
  /** Il corpo del post non è riconosciuto: il silenzio non è dimostrabile. */
  | "SILENZIO_NON_DIMOSTRABILE";

export interface PostSignalReading {
  readonly postId: string;
  readonly sequence: number;
  readonly outcome: PostSignalOutcome;
  /** Le famiglie mancanti quando il lessico è incompleto. Ordine alfabetico. */
  readonly missingFamilies: readonly string[];
  readonly signals: readonly LineupSignal[];
  /** Segnali opposti dentro **lo stesso** post: dichiarati qui. */
  readonly contradictions: readonly SignalContradiction[];
  readonly textRecognised: boolean;
  readonly clausesRead: number;
  readonly quotesRead: number;
  readonly attenuatorsDeclared: boolean;
  readonly signalsVersion: typeof SIGNALS_VERSION;
}

/** Conteggi, e nient'altro. Nessuna classifica: le chiavi escono in ordine alfabetico. */
export interface SignalMeasures {
  readonly posts: number;
  readonly postsWithSignals: number;
  readonly postsSilent: number;
  readonly postsSilenceNotProvable: number;
  readonly signals: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly byForm: Readonly<Record<string, number>>;
  readonly byVoice: Readonly<Record<string, number>>;
  readonly bySubject: Readonly<Record<string, number>>;
  readonly byRoleClass: Readonly<Record<string, number>>;
  readonly signalsFromUnverifiedRole: number;
  readonly contradictionsByRelation: Readonly<Record<string, number>>;
  readonly playersWithChangedStance: number;
  /** Questo pacchetto non pesa e non ordina per qualità. */
  readonly weighted: false;
}

export interface TopicSignalReading {
  readonly outcome: PostSignalOutcome;
  readonly missingFamilies: readonly string[];
  readonly readings: readonly PostSignalReading[];
  readonly signals: readonly LineupSignal[];
  /** Tracce per giocatore, in ordine **alfabetico** di identificativo, mai per rilevanza. */
  readonly traces: readonly PlayerSignalTrace[];
  readonly contradictions: readonly SignalContradiction[];
  /** Segnali senza soggetto risolto: dichiarati, mai scartati in silenzio. */
  readonly unattributed: readonly SignalRef[];
  readonly measures: SignalMeasures;
  readonly signalsVersion: typeof SIGNALS_VERSION;
}

// ---------------------------------------------------------------------------
// Confronto letterale su testo ripiegato.
//
// Niente espressioni regolari costruite col dato del chiamante: un lessico è un
// dato di configurazione, e compilarlo come pattern renderebbe il risultato
// dipendente da come è scritto invece che da che cosa dice.
// ---------------------------------------------------------------------------

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** Minuscole e diacritici via: «Òmicron» e «omicron» sono la stessa parola. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && WORD_CHARACTER.test(value);
}

/** Un termine vale solo se sta su confini di parola: `gamma` non è dentro `gammaico`. */
function bounded(haystack: string, start: number, end: number): boolean {
  return !isWordCharacter(haystack[start - 1]) && !isWordCharacter(haystack[end]);
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  if (needle.length === 0) return found;
  let from = 0;
  while (found.length < 200) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (bounded(haystack, at, at + needle.length)) found.push(at);
    from = at + 1;
  }
  return found;
}

interface TermHit {
  readonly family: SignalFamily;
  readonly term: string;
  readonly start: number;
  readonly end: number;
}

/**
 * I termini trovati in una proposizione, ridotti a uno per famiglia.
 *
 * Due passaggi, entrambi dichiarati: quando due termini di famiglie diverse
 * coprono **gli stessi caratteri** — «gamma» dentro «gamma spenta» — vince il
 * **più lungo**, perché il più corto è un pezzo dell'altro e contarli entrambi
 * fabbricherebbe una contraddizione che il testo non contiene; poi resta **un
 * solo segnale per famiglia**, il primo, perché ripetere la stessa parola nella
 * stessa proposizione non è dire due volte una cosa diversa.
 */
function hitsIn(folded: string, lexicon: SignalLexicon): TermHit[] {
  const all: TermHit[] = [];
  for (const family of SIGNAL_FAMILIES) {
    for (const term of lexicon.terms[family]) {
      const foldedTerm = fold(term);
      for (const at of occurrences(folded, foldedTerm)) {
        all.push({ family, term, start: at, end: at + foldedTerm.length });
      }
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end || a.family.localeCompare(b.family));

  const kept: TermHit[] = [];
  let reach = -1;
  for (const hit of all) {
    if (hit.start < reach) continue;
    kept.push(hit);
    reach = hit.end;
  }

  const perFamily: TermHit[] = [];
  for (const hit of kept) {
    if (perFamily.some((seen) => seen.family === hit.family)) continue;
    perFamily.push(hit);
  }
  return perFamily;
}

/** I giocatori nominati in un tratto di testo. Ordine alfabetico, senza ripetizioni. */
function playersIn(folded: string, lexicon: SignalLexicon): string[] {
  const found: string[] = [];
  for (const player of lexicon.players) {
    for (const form of player.forms) {
      if (occurrences(folded, fold(form)).length === 0) continue;
      if (!found.includes(player.playerId)) found.push(player.playerId);
      break;
    }
  }
  return found.sort((a, b) => a.localeCompare(b));
}

function attenuatorIn(folded: string, lexicon: SignalLexicon): string {
  for (const term of lexicon.attenuators) {
    if (occurrences(folded, fold(term)).length > 0) return term;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Segmentazione: periodi, poi proposizioni.
// ---------------------------------------------------------------------------

interface Clause {
  readonly sentenceIndex: number;
  readonly clauseIndex: number;
  readonly folded: string;
}

interface Sentence {
  readonly index: number;
  readonly folded: string;
  readonly clauses: readonly Clause[];
}

function segment(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const pieces = text.split(/[.;:!?\n\r]+/u);
  for (const piece of pieces) {
    const foldedSentence = fold(piece);
    if (foldedSentence === "") continue;
    const index = sentences.length;
    const clauses: Clause[] = [];
    for (const part of piece.split(",")) {
      const foldedClause = fold(part);
      if (foldedClause === "") continue;
      clauses.push({ sentenceIndex: index, clauseIndex: clauses.length, folded: foldedClause });
    }
    if (clauses.length === 0) continue;
    sentences.push({ index, folded: foldedSentence, clauses });
  }
  return sentences;
}

// ---------------------------------------------------------------------------
// Lessico: senza, non si tenta niente.
// ---------------------------------------------------------------------------

/** Le famiglie mancanti di un lessico. Vuoto = lessico utilizzabile. */
export function missingLexiconFamilies(lexicon: SignalLexicon | null | undefined): string[] {
  if (lexicon === null || lexicon === undefined) return ["lessico"];
  const missing: string[] = [];
  const terms: Partial<Record<SignalFamily, readonly string[]>> = lexicon.terms ?? {};
  for (const family of SIGNAL_FAMILIES) {
    const list = terms[family];
    if (!Array.isArray(list) || list.filter((term) => fold(term) !== "").length === 0) {
      missing.push(`terms.${family}`);
    }
  }
  if (!Array.isArray(lexicon.attenuators)) missing.push("attenuators");
  if (!Array.isArray(lexicon.players)) missing.push("players");
  return missing.sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Lettura di un post.
// ---------------------------------------------------------------------------

interface Zone {
  readonly voice: SignalVoice;
  readonly quoteDepth: number;
  readonly quoteIndex: number;
  readonly quotedAuthorRecognised: boolean;
  readonly text: string;
}

function zonesOf(post: TopicPost): Zone[] {
  const zones: Zone[] = [
    {
      voice: "autore",
      quoteDepth: 0,
      quoteIndex: -1,
      quotedAuthorRecognised: false,
      text: post.textWithoutQuotes,
    },
  ];
  post.quotes.forEach((quote: Quote, index: number) => {
    zones.push({
      voice: "citazione",
      quoteDepth: quote.depth,
      quoteIndex: index,
      quotedAuthorRecognised: quote.quotedAuthorRecognised,
      text: quote.text,
    });
  });
  return zones;
}

function refOf(signal: LineupSignal): SignalRef {
  return {
    signalId: signal.signalId,
    postId: signal.postId,
    sequence: signal.sequence,
    publishedAt: signal.publishedAt,
    kind: signal.kind,
    voice: signal.origin.voice,
    form: signal.evidence.form,
    roleVerified: signal.evidence.roleVerified,
  };
}

/**
 * Legge i segnali di **un** post.
 *
 * `sequence` è l'ordine **osservato** che il chiamante dichiara — di norma la
 * posizione del post nella sequenza delle pagine depositate. Non è una data:
 * le date dei post vengono dalla fonte con un fuso mai verificato su questo
 * perimetro, e ordinare su di esse sarebbe ordinare su un'assunzione.
 */
export function readPostSignals(
  post: TopicPost,
  lexicon: SignalLexicon,
  sequence: number,
): PostSignalReading {
  const missing = missingLexiconFamilies(lexicon);
  const base = {
    postId: post.postId,
    sequence,
    textRecognised: post.contentRecognised,
    signalsVersion: SIGNALS_VERSION,
  } as const;

  if (missing.includes("lessico")) {
    return {
      ...base,
      outcome: "LESSICO_ASSENTE",
      missingFamilies: missing,
      signals: [],
      contradictions: [],
      clausesRead: 0,
      quotesRead: 0,
      attenuatorsDeclared: false,
    };
  }
  if (missing.length > 0) {
    return {
      ...base,
      outcome: "LESSICO_INCOMPLETO",
      missingFamilies: missing,
      signals: [],
      contradictions: [],
      clausesRead: 0,
      quotesRead: 0,
      attenuatorsDeclared: false,
    };
  }

  const roleClass = post.role.role;
  const roleVerified = roleClass === "staff_verificato";
  const signals: LineupSignal[] = [];
  let clausesRead = 0;

  for (const zone of zonesOf(post)) {
    // Il ruolo verificato di chi cita **non copre** le parole di chi è citato.
    // Dentro una citazione la classe di ruolo è quella di un autore di cui qui
    // non si sa niente — `non_verificabile` — e non la classe del post che
    // ospita la citazione: ereditarla darebbe a un altro l'autorità di chi lo
    // riporta, che è esattamente ciò che `Quote.roleInherited: false` vieta.
    const zoneRoleClass: AuthorRole = zone.voice === "autore" ? roleClass : "non_verificabile";
    const zoneRoleVerified = zone.voice === "autore" ? roleVerified : false;
    for (const sentence of segment(zone.text)) {
      const attenuator = attenuatorIn(sentence.folded, lexicon);
      const inSentence = playersIn(sentence.folded, lexicon);
      for (const clause of sentence.clauses) {
        clausesRead += 1;
        const hits = hitsIn(clause.folded, lexicon);
        if (hits.length === 0) continue;
        const inClause = playersIn(clause.folded, lexicon);
        const candidates = inClause.length > 0 ? inClause : inSentence;
        const scope: SubjectScope =
          inClause.length > 0 ? "proposizione" : inSentence.length > 0 ? "periodo" : "nessuno";
        const subject: SubjectResolution =
          candidates.length === 1 ? "risolto" : candidates.length > 1 ? "ambiguo" : "non_identificato";
        for (const hit of hits) {
          const where =
            zone.voice === "autore" ? "corpo" : `cit${zone.quoteIndex}d${zone.quoteDepth}`;
          signals.push({
            signalId: `${post.postId}:${where}:${clause.sentenceIndex}.${clause.clauseIndex}:${hit.family}`,
            postId: post.postId,
            sequence,
            publishedAt: post.publishedAt,
            kind: KIND_OF[hit.family],
            family: hit.family,
            matchedTerm: hit.term,
            playerId: subject === "risolto" ? (candidates[0] as string) : null,
            candidates,
            evidence: {
              form: attenuator === "" ? "affermata" : "attenuata",
              attenuatorTerm: attenuator,
              subject,
              subjectScope: scope,
              candidateSubjects: candidates.length,
              roleClass: zoneRoleClass,
              roleVerified: zoneRoleVerified,
              weighted: false,
            },
            origin: {
              voice: zone.voice,
              quoteDepth: zone.quoteDepth,
              quoteIndex: zone.quoteIndex,
              quotedAuthorRecognised: zone.quotedAuthorRecognised,
              roleInherited: false,
              sentenceIndex: clause.sentenceIndex,
              clauseIndex: clause.clauseIndex,
              termOffset: hit.start,
            },
          });
        }
      }
    }
  }

  const outcome: PostSignalOutcome =
    signals.length > 0 ? "SEGNALI" : post.contentRecognised ? "SILENZIO" : "SILENZIO_NON_DIMOSTRABILE";

  return {
    ...base,
    outcome,
    missingFamilies: [],
    signals,
    contradictions: contradictionsAmong(signals),
    clausesRead,
    quotesRead: post.quotes.length,
    attenuatorsDeclared: lexicon.attenuators.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Contraddizioni: si dichiarano, non si risolvono.
// ---------------------------------------------------------------------------

/**
 * Che rapporto c'è fra due affermazioni sullo stesso giocatore. Matrice chiusa:
 * due volte la stessa cosa non è una contraddizione, una smentita accanto a
 * qualunque altra affermazione lo è per definizione, titolare e fuori non
 * possono valere insieme, e una certezza accanto a un dubbio è una posizione
 * rivista — che è una cosa da vedere, non da appianare.
 */
export function contradictionBetween(
  first: SignalKind,
  second: SignalKind,
): ContradictionRelation | null {
  if (first === second) return null;
  if (first === "SMENTITA" || second === "SMENTITA") return "SMENTITA_DICHIARATA";
  if (
    (first === "DATO_TITOLARE" && second === "DATO_FUORI") ||
    (first === "DATO_FUORI" && second === "DATO_TITOLARE")
  ) {
    return "OPPOSTI";
  }
  return "RIVISTO";
}

function orderOf(signal: LineupSignal): [number, string, string] {
  return [signal.sequence, signal.postId, signal.signalId];
}

function compareSignals(a: LineupSignal, b: LineupSignal): number {
  const [as, ap, ai] = orderOf(a);
  const [bs, bp, bi] = orderOf(b);
  return as - bs || ap.localeCompare(bp) || ai.localeCompare(bi);
}

/**
 * Le contraddizioni fra un insieme di segnali, giocatore per giocatore.
 *
 * **Nessun segnale viene tolto.** Il segnale più recente non sostituisce il
 * precedente: la coppia viene dichiarata, con i momenti di entrambi, così chi
 * legge vede che l'esperto ha cambiato idea invece di trovarsi solo l'ultima
 * versione. I segnali senza soggetto risolto non entrano nelle coppie — non si
 * sa di chi parlino — ma non spariscono: `readTopicSignals` li elenca in
 * `unattributed`.
 */
export function contradictionsAmong(
  signals: readonly LineupSignal[],
): readonly SignalContradiction[] {
  const ordered = [...signals].sort(compareSignals);
  const byPlayer = new Map<string, LineupSignal[]>();
  for (const signal of ordered) {
    if (signal.playerId === null) continue;
    const list = byPlayer.get(signal.playerId);
    if (list === undefined) byPlayer.set(signal.playerId, [signal]);
    else list.push(signal);
  }
  const found: SignalContradiction[] = [];
  const players = [...byPlayer.keys()].sort((a, b) => a.localeCompare(b));
  for (const playerId of players) {
    const list = byPlayer.get(playerId) ?? [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length && found.length < 500; j += 1) {
        const earlier = list[i] as LineupSignal;
        const later = list[j] as LineupSignal;
        const relation = contradictionBetween(earlier.kind, later.kind);
        if (relation === null) continue;
        found.push({
          playerId,
          relation,
          span: earlier.postId === later.postId ? "STESSO_POST" : "POST_SUCCESSIVO",
          earlier: refOf(earlier),
          later: refOf(later),
          bothRetained: true,
        });
      }
    }
  }
  return found;
}

/** Le tracce per giocatore: tutto ciò che è stato detto, in ordine osservato. */
export function traceSignals(signals: readonly LineupSignal[]): readonly PlayerSignalTrace[] {
  const ordered = [...signals].sort(compareSignals);
  const contradictions = contradictionsAmong(ordered);
  const players = [
    ...new Set(
      ordered.filter((signal) => signal.playerId !== null).map((signal) => signal.playerId as string),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return players.map((playerId) => {
    const entries = ordered.filter((signal) => signal.playerId === playerId).map(refOf);
    const kindsSeen = [...new Set(entries.map((entry) => entry.kind))].sort((a, b) =>
      a.localeCompare(b),
    );
    const own = contradictions.filter((item) => item.playerId === playerId);
    return {
      playerId,
      entries,
      kindsSeen,
      contradictions: own,
      stanceChanged: own.length > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Lettura di un topic intero.
// ---------------------------------------------------------------------------

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const name = key(item);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  const sorted: Record<string, number> = {};
  for (const name of Object.keys(counts).sort((a, b) => a.localeCompare(b))) {
    sorted[name] = counts[name] as number;
  }
  return sorted;
}

/**
 * Legge i segnali di un topic: i post **nell'ordine in cui il chiamante li
 * consegna**, che è l'ordine osservato sulla pagina.
 */
export function readTopicSignals(
  posts: readonly TopicPost[],
  lexicon: SignalLexicon,
): TopicSignalReading {
  const missing = missingLexiconFamilies(lexicon);
  const readings = posts.map((post, index) => readPostSignals(post, lexicon, index));
  const signals = readings.flatMap((reading) => reading.signals).sort(compareSignals);
  const traces = traceSignals(signals);
  const contradictions = contradictionsAmong(signals);

  const outcome: PostSignalOutcome = missing.includes("lessico")
    ? "LESSICO_ASSENTE"
    : missing.length > 0
      ? "LESSICO_INCOMPLETO"
      : signals.length > 0
        ? "SEGNALI"
        : readings.every((reading) => reading.textRecognised)
          ? "SILENZIO"
          : "SILENZIO_NON_DIMOSTRABILE";

  const measures: SignalMeasures = {
    posts: posts.length,
    postsWithSignals: readings.filter((reading) => reading.outcome === "SEGNALI").length,
    postsSilent: readings.filter((reading) => reading.outcome === "SILENZIO").length,
    postsSilenceNotProvable: readings.filter(
      (reading) => reading.outcome === "SILENZIO_NON_DIMOSTRABILE",
    ).length,
    signals: signals.length,
    byKind: countBy(signals, (signal) => signal.kind),
    byForm: countBy(signals, (signal) => signal.evidence.form),
    byVoice: countBy(signals, (signal) => signal.origin.voice),
    bySubject: countBy(signals, (signal) => signal.evidence.subject),
    byRoleClass: countBy(signals, (signal) => signal.evidence.roleClass),
    signalsFromUnverifiedRole: signals.filter((signal) => !signal.evidence.roleVerified).length,
    contradictionsByRelation: countBy(contradictions, (item) => item.relation),
    playersWithChangedStance: traces.filter((trace) => trace.stanceChanged).length,
    weighted: false,
  };

  return {
    outcome,
    missingFamilies: missing.includes("lessico") || missing.length > 0 ? missing : [],
    readings,
    signals,
    traces,
    contradictions,
    unattributed: signals.filter((signal) => signal.playerId === null).map(refOf),
    measures,
    signalsVersion: SIGNALS_VERSION,
  };
}
