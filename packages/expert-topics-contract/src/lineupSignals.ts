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
//  5. **L'ordine dei post si verifica, non si assume.** L'ordine di un array è
//     una scelta di chi lo costruisce, non una misura: se `readTopicSignals` lo
//     prendesse per buono, «più recente» sarebbe una parola fabbricata, e con
//     essa sarebbero fabbricate `RIVISTO` e `SMENTITA_DICHIARATA` — cioè proprio
//     le relazioni per cui questa parte esiste. Quindi si guarda che cosa i post
//     portano addosso (indice di pagina, istanti in forma canonica), si controlla
//     che sia monotono, e dove le due misure si contraddicono **si rifiuta**
//     (`ORDINE_NON_MONOTONO`) invece di produrre relazioni temporali false. Dove
//     non c'è niente di confrontabile i segnali escono lo stesso, ma **senza**
//     relazioni temporali, e il verdetto lo dichiara. Chi userà queste funzioni
//     fra sei mesi non leggerà il referto: leggerà la firma, e il controllo deve
//     stare nel codice.
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
// proposizione**; l'indice di pagina come base **primaria** dell'ordine, con gli
// istanti dichiarati usati per **controllarlo** e mai per normalizzarlo, perché
// una data letta dalla fonte porta un fuso che questo perimetro non ha mai
// verificato; il rifiuto — invece del silenzio o di un aggiustamento — quando le
// due misure dell'ordine si contraddicono.

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
export type ContradictionSpan =
  /** Dentro un post: l'ordine è quello del testo, ed è sempre verificabile. */
  | "STESSO_POST"
  /** Fra due post, con l'ordine verificato: `first` è davvero il precedente. */
  | "POST_SUCCESSIVO"
  /** Fra due post di cui **non si sa** quale venga prima. Nessuna relazione temporale. */
  | "ORDINE_NON_VERIFICATO";

/**
 * Una contraddizione **dichiarata**: nessuno dei due segnali viene tolto.
 *
 * I due lati si chiamano `first` e `second`, non «prima» e «dopo», perché il
 * loro nome non deve promettere più di quanto sia stato verificato: `first`
 * precede `second` **solo** quando `span` è `STESSO_POST` o `POST_SUCCESSIVO`.
 * Con `ORDINE_NON_VERIFICATO` sono solo i due lati di un'incompatibilità, e le
 * relazioni che sarebbero temporali — `RIVISTO`, `SMENTITA_DICHIARATA` — non
 * vengono prodotte affatto.
 */
export interface SignalContradiction {
  readonly playerId: string;
  readonly relation: ContradictionRelation;
  readonly span: ContradictionSpan;
  /** Vero solo se `first` precede `second` per un ordine **verificato**. */
  readonly temporal: boolean;
  readonly first: SignalRef;
  readonly second: SignalRef;
  /** Entrambi restano leggibili: la contraddizione si dichiara, non si risolve. */
  readonly bothRetained: true;
}

/** Su che cosa poggia l'ordine dei post. Vocabolario chiuso. */
export type OrderBasis =
  /** Pagina depositata e posizione nella pagina: la struttura osservata. */
  | "indice_di_pagina"
  /** Istanti dichiarati dalla fonte, **tutti** nella stessa forma e con lo stesso scostamento. */
  | "istante_dichiarato"
  /** Niente di confrontabile: l'ordine dell'array non è una misura. */
  | "nessuna";

export type OrderState =
  /** Verificato: i post arrivano in ordine non decrescente sulla base dichiarata. */
  | "VERIFICATO"
  /** L'ordine osservato si contraddice: rifiutato, non aggiustato. */
  | "NON_MONOTONO"
  /** Non c'è niente da verificare: nessuna relazione temporale verrà prodotta. */
  | "NON_VERIFICABILE";

/**
 * Il verdetto sull'ordine dei post. **L'ordine si verifica, non si assume.**
 *
 * L'ordine di un array è una scelta di chi lo costruisce, non una misura: se
 * `readTopicSignals` lo prendesse per buono, «più recente» sarebbe una parola
 * fabbricata e con essa sarebbero fabbricate `RIVISTO` e `SMENTITA_DICHIARATA`
 * — cioè proprio le relazioni per cui questa parte esiste. Chi legge la firma
 * fra sei mesi non leggerà il referto: quindi il controllo sta nel codice.
 */
export interface OrderVerdict {
  readonly basis: OrderBasis;
  readonly state: OrderState;
  /** Vero quando la base primaria è stata **confrontata** con la seconda misura disponibile. */
  readonly crossChecked: boolean;
  readonly postsOrdered: number;
  /** Quante coppie di post consecutivi sono state confrontate. */
  readonly comparisons: number;
  readonly reason: string;
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
  /**
   * Coppie di segnali incompatibili fra post di cui non si sa quale venga
   * prima: la relazione temporale **non** è stata prodotta, e il fatto è
   * contato qui invece di sparire.
   */
  readonly pairsWithoutOrder: number;
  /** Questo pacchetto non pesa e non ordina per qualità. */
  readonly weighted: false;
}

/** Esito della lettura di un topic: quello di un post, più il rifiuto sull'ordine. */
export type TopicSignalOutcome =
  | PostSignalOutcome
  /** I post arrivano in un ordine che si contraddice: rifiutato, fail-closed. */
  | "ORDINE_NON_MONOTONO";

export interface TopicSignalReading {
  readonly outcome: TopicSignalOutcome;
  /** Che cosa è stato verificato dell'ordine, e su che cosa. */
  readonly order: OrderVerdict;
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
    // Dentro un post l'ordine è quello del testo: sempre verificabile, e
    // infatti nessun rango serve a stabilirlo.
    contradictions: contradictionsAmong(signals, null).contradictions,
    clausesRead,
    quotesRead: post.quotes.length,
    attenuatorsDeclared: lexicon.attenuators.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Ordine dei post, e contraddizioni: si verificano e si dichiarano.
// ---------------------------------------------------------------------------

/**
 * Forma canonica di un istante. Nessun orologio, nessuna costruzione di date:
 * si guarda **la forma**, e si confronta come testo. Vale come confronto
 * cronologico solo a parità di scostamento e di larghezza — condizione che
 * `canonicalInstants` verifica, invece di darla per buona.
 */
const CANONICAL_INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/;

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
 * L'ORDINE DEI POST SI VERIFICA, NON SI ASSUME.
 *
 * Un array è ordinato da chi lo costruisce: prenderne l'ordine per buono
 * significherebbe che «più recente» è una parola fabbricata, e con essa lo
 * sarebbero `RIVISTO` e `SMENTITA_DICHIARATA`. Qui si guarda che cosa i post
 * portano davvero addosso, in quest'ordine di preferenza:
 *
 *  1. **indice di pagina** — `pageOffset` e `positionInPage`, quando ogni post
 *     li ha: è la struttura osservata sulla pagina, non un'interpretazione. È la
 *     base primaria perché non dipende da nessun fuso;
 *  2. **istante dichiarato** — solo se **ogni** post ha una data in forma
 *     canonica, tutte con lo **stesso** scostamento e la **stessa** larghezza:
 *     a quella condizione il confronto lessicografico è un confronto
 *     cronologico corretto e non serve nessun orologio. Scostamenti diversi non
 *     si normalizzano: il fuso di questo perimetro non è mai stato verificato
 *     (README §"Che cosa NON è stato osservato", 7), e normalizzarlo sarebbe
 *     inventarlo;
 *  3. **niente** — e allora nessuna relazione temporale viene prodotta.
 *
 * Quando **entrambe** le misure ci sono, la seconda **controlla** la prima: due
 * osservazioni indipendenti che si contraddicono non si mediano e non si
 * scelgono, si rifiutano (`NON_MONOTONO`).
 */
function canonicalInstants(posts: readonly TopicPost[]): string[] | null {
  const keys: string[] = [];
  let offset: string | null = null;
  let width: number | null = null;
  for (const post of posts) {
    if (post.publishedAt === null) return null;
    const match = CANONICAL_INSTANT.exec(post.publishedAt);
    if (match === null) return null;
    const local = match[1] as string;
    const suffix = match[2] as string;
    if (offset === null) offset = suffix;
    else if (offset !== suffix) return null;
    if (width === null) width = local.length;
    else if (width !== local.length) return null;
    keys.push(local);
  }
  return keys;
}

function pageIndices(posts: readonly TopicPost[]): string[] | null {
  const keys: string[] = [];
  for (const post of posts) {
    if (post.pageOffset === null) return null;
    keys.push(`${padded(post.pageOffset)}:${padded(post.positionInPage)}`);
  }
  return keys;
}

/** Zero-padding a larghezza fissa: rende il confronto lessicografico un confronto numerico. */
function padded(value: number): string {
  const sign = value < 0 ? "-" : "0";
  const digits = `${Math.abs(Math.trunc(value))}`;
  return `${sign}${"0".repeat(Math.max(0, 12 - digits.length))}${digits}`;
}

function nonDecreasing(keys: readonly string[]): boolean {
  for (let i = 1; i < keys.length; i += 1) {
    if ((keys[i] as string) < (keys[i - 1] as string)) return false;
  }
  return true;
}

/** Rango per post: chiavi uguali = rango uguale, cioè «non si sa quale venga prima». */
function ranksOf(posts: readonly TopicPost[], keys: readonly string[]): Map<string, string> {
  const ranks = new Map<string, string>();
  posts.forEach((post, index) => {
    const key = keys[index];
    if (key !== undefined && !ranks.has(post.postId)) ranks.set(post.postId, key);
  });
  return ranks;
}

export interface VerifiedOrder {
  readonly verdict: OrderVerdict;
  /** `null` quando non c'è niente su cui ordinare. */
  readonly ranks: ReadonlyMap<string, string> | null;
}

/** Verifica l'ordine dei post così come il chiamante li consegna. */
export function verifyPostOrder(posts: readonly TopicPost[]): VerifiedOrder {
  const comparisons = Math.max(0, posts.length - 1);
  const byPage = pageIndices(posts);
  const byInstant = canonicalInstants(posts);

  if (byPage !== null) {
    if (!nonDecreasing(byPage)) {
      return {
        verdict: {
          basis: "indice_di_pagina",
          state: "NON_MONOTONO",
          crossChecked: byInstant !== null,
          postsOrdered: posts.length,
          comparisons,
          reason: "i post non arrivano in ordine di pagina e posizione",
        },
        ranks: null,
      };
    }
    if (byInstant !== null && !nonDecreasing(byInstant)) {
      return {
        verdict: {
          basis: "indice_di_pagina",
          state: "NON_MONOTONO",
          crossChecked: true,
          postsOrdered: posts.length,
          comparisons,
          reason: "gli istanti dichiarati contraddicono l'ordine di pagina",
        },
        ranks: null,
      };
    }
    return {
      verdict: {
        basis: "indice_di_pagina",
        state: "VERIFICATO",
        crossChecked: byInstant !== null,
        postsOrdered: posts.length,
        comparisons,
        reason:
          byInstant === null
            ? "ordine di pagina non decrescente"
            : "ordine di pagina non decrescente, confermato dagli istanti dichiarati",
      },
      ranks: ranksOf(posts, byPage),
    };
  }

  if (byInstant !== null) {
    if (!nonDecreasing(byInstant)) {
      return {
        verdict: {
          basis: "istante_dichiarato",
          state: "NON_MONOTONO",
          crossChecked: false,
          postsOrdered: posts.length,
          comparisons,
          reason: "gli istanti dichiarati non arrivano in ordine non decrescente",
        },
        ranks: null,
      };
    }
    return {
      verdict: {
        basis: "istante_dichiarato",
        state: "VERIFICATO",
        crossChecked: false,
        postsOrdered: posts.length,
        comparisons,
        reason: "istanti in forma canonica, stesso scostamento, ordine non decrescente",
      },
      ranks: ranksOf(posts, byInstant),
    };
  }

  return {
    verdict: {
      basis: "nessuna",
      state: "NON_VERIFICABILE",
      crossChecked: false,
      postsOrdered: posts.length,
      comparisons,
      reason:
        "nessun indice di pagina su tutti i post e nessun insieme di istanti confrontabili: l'ordine dell'array non è una misura",
    },
    ranks: null,
  };
}

/** Che cosa esce dal confronto delle coppie: le contraddizioni e ciò che non si è potuto dire. */
export interface ContradictionSet {
  readonly contradictions: readonly SignalContradiction[];
  /** Coppie incompatibili lasciate senza relazione temporale, perché l'ordine non è verificato. */
  readonly pairsWithoutOrder: number;
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
 *
 * `ranks` porta l'ordine **verificato** dei post. Dove quell'ordine non c'è:
 * `OPPOSTI` resta — dato titolare e dato fuori non possono valere insieme, e
 * questo non dipende da quale sia venuto prima — mentre `RIVISTO` e
 * `SMENTITA_DICHIARATA`, che sono affermazioni sul tempo, **non vengono
 * prodotte**: la coppia finisce in `pairsWithoutOrder`, contata e non nascosta.
 * Meglio nessuna relazione che una relazione inventata dall'ordine di un array.
 */
export function contradictionsAmong(
  signals: readonly LineupSignal[],
  ranks: ReadonlyMap<string, string> | null,
): ContradictionSet {
  const ordered = [...signals].sort(compareSignals);
  const byPlayer = new Map<string, LineupSignal[]>();
  for (const signal of ordered) {
    if (signal.playerId === null) continue;
    const list = byPlayer.get(signal.playerId);
    if (list === undefined) byPlayer.set(signal.playerId, [signal]);
    else list.push(signal);
  }
  const found: SignalContradiction[] = [];
  let pairsWithoutOrder = 0;
  const players = [...byPlayer.keys()].sort((a, b) => a.localeCompare(b));
  for (const playerId of players) {
    const list = byPlayer.get(playerId) ?? [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length && found.length < 500; j += 1) {
        const first = list[i] as LineupSignal;
        const second = list[j] as LineupSignal;
        const relation = contradictionBetween(first.kind, second.kind);
        if (relation === null) continue;

        const samePost = first.postId === second.postId;
        const firstRank = ranks?.get(first.postId);
        const secondRank = ranks?.get(second.postId);
        const strictlyBefore =
          firstRank !== undefined && secondRank !== undefined && firstRank < secondRank;
        // Dentro un post l'ordine è quello del testo, e quello si vede sempre.
        const ordinata = samePost || strictlyBefore;

        if (!ordinata && relation !== "OPPOSTI") {
          pairsWithoutOrder += 1;
          continue;
        }
        found.push({
          playerId,
          relation,
          span: samePost
            ? "STESSO_POST"
            : ordinata
              ? "POST_SUCCESSIVO"
              : "ORDINE_NON_VERIFICATO",
          temporal: ordinata,
          first: refOf(first),
          second: refOf(second),
          bothRetained: true,
        });
      }
    }
  }
  return { contradictions: found, pairsWithoutOrder };
}

/** Le tracce per giocatore: tutto ciò che è stato detto, in ordine osservato. */
export function traceSignals(
  signals: readonly LineupSignal[],
  ranks: ReadonlyMap<string, string> | null,
): readonly PlayerSignalTrace[] {
  const ordered = [...signals].sort(compareSignals);
  const { contradictions } = contradictionsAmong(ordered, ranks);
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
/**
 * Legge i segnali di un topic.
 *
 * **L'ordine si verifica prima di leggere.** `verifyPostOrder` guarda che cosa
 * i post portano addosso — indice di pagina, istanti in forma canonica — e dice
 * se l'ordine in cui arrivano è sostenuto da una misura. Da lì:
 *
 *  - ordine `NON_MONOTONO` (le due osservazioni si contraddicono, o i post
 *    arrivano fuori sequenza): **si rifiuta**, `ORDINE_NON_MONOTONO`,
 *    fail-closed. Produrre relazioni temporali su una sequenza che si
 *    contraddice significherebbe fabbricarle;
 *  - ordine `NON_VERIFICABILE`: i segnali **escono lo stesso** — sono stati
 *    detti — ma senza `RIVISTO` né `SMENTITA_DICHIARATA`, e il verdetto lo
 *    dichiara. Meglio nessuna relazione che una relazione inventata;
 *  - ordine `VERIFICATO`: tutto come sopra, e le relazioni temporali si
 *    producono perché adesso poggiano su qualcosa.
 */
export function readTopicSignals(
  posts: readonly TopicPost[],
  lexicon: SignalLexicon,
): TopicSignalReading {
  const missing = missingLexiconFamilies(lexicon);
  const order = verifyPostOrder(posts);

  if (order.verdict.state === "NON_MONOTONO") {
    return {
      outcome: "ORDINE_NON_MONOTONO",
      order: order.verdict,
      missingFamilies: missing,
      readings: [],
      signals: [],
      traces: [],
      contradictions: [],
      unattributed: [],
      measures: emptyMeasures(posts.length),
      signalsVersion: SIGNALS_VERSION,
    };
  }

  const readings = posts.map((post, index) => readPostSignals(post, lexicon, index));
  const signals = readings.flatMap((reading) => reading.signals).sort(compareSignals);
  const traces = traceSignals(signals, order.ranks);
  const { contradictions, pairsWithoutOrder } = contradictionsAmong(signals, order.ranks);

  const outcome: TopicSignalOutcome = missing.includes("lessico")
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
    pairsWithoutOrder,
    weighted: false,
  };

  return {
    outcome,
    order: order.verdict,
    missingFamilies: missing,
    readings,
    signals,
    traces,
    contradictions,
    unattributed: signals.filter((signal) => signal.playerId === null).map(refOf),
    measures,
    signalsVersion: SIGNALS_VERSION,
  };
}

/** Misure a zero: il rifiuto sull'ordine non conta niente che non abbia letto. */
function emptyMeasures(posts: number): SignalMeasures {
  return {
    posts,
    postsWithSignals: 0,
    postsSilent: 0,
    postsSilenceNotProvable: 0,
    signals: 0,
    byKind: {},
    byForm: {},
    byVoice: {},
    bySubject: {},
    byRoleClass: {},
    signalsFromUnverifiedRole: 0,
    contradictionsByRelation: {},
    playersWithChangedStance: 0,
    pairsWithoutOrder: 0,
    weighted: false,
  };
}
