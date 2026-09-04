// CONTRATTO DEI TOPIC DI PARTITA — tipi canonici.
//
// Descrive che cosa sono un topic di partita, un post, un autore, un ruolo e
// una citazione, e come un topic si lega alla sua partita. È **agnostico dalla
// fonte**: qui non c'è nessun host, nessun indirizzo, nessuna sezione, nessuna
// credenziale, nessuna chiamata di rete — e nessun contenuto editoriale.
// Chi va a prendere la pagina e chi deposita i byte vive nel layer privato;
// qui vive solo ciò che, dati quei byte, si può dire con certezza.

/** Versione del contratto, stampata accanto a ogni risultato. */
export const CONTRACT_VERSION = "expert-topics-contract-v1" as const;

/** Versione del parser puro, stampata accanto a ogni risultato. */
export const PARSER_VERSION = "expert-topics-parser-v1.0.0" as const;

/**
 * Classe di autorità di un post. Tre valori, non due: «non lo sappiamo» è un
 * fatto diverso da «non è staff», e confonderli fa sparire un esperto dai
 * conteggi.
 */
export type AuthorRole = "staff_verificato" | "comunita" | "non_verificabile";

/** Perché la classe è quella: la prova, non un'impressione. */
export type RoleEvidence =
  | "immagine_rango_staff_nel_blocco_autore"
  | "blocco_autore_riconosciuto_senza_marcatore_di_rango"
  | "nessun_blocco_autore"
  | "blocco_autore_dopo_il_contenuto";

export interface AuthorIdentity {
  /** Nome pubblico dell'autore. Dato privato: non esce mai da un referto. */
  readonly handle: string;
  /** Identificativo numerico dell'autore, quando la pagina lo espone. */
  readonly userId: string;
  readonly authorBlockRecognised: boolean;
}

export interface AuthorRoleVerdict {
  readonly role: AuthorRole;
  readonly evidence: RoleEvidence;
  /** Marcatore cercato: **iniettato**, mai scritto qui dentro. */
  readonly markerLookedFor: string;
  /** Etichetta testuale di rango eventualmente presente. Mai decisiva. */
  readonly rankLabelObserved: string;
  readonly labelIsNotEvidence: true;
}

export interface Quote {
  /** 1 = citazione di primo livello, 2 = citazione dentro citazione. */
  readonly depth: number;
  readonly quotedAuthor: string;
  readonly quotedPostId: string;
  readonly quotedAuthorRecognised: boolean;
  /** Il ruolo di chi è citato non passa **mai** a chi cita. */
  readonly roleInherited: false;
}

export interface TopicPost {
  readonly postId: string;
  readonly positionInPage: number;
  readonly pageOffset: number | null;
  readonly author: AuthorIdentity;
  readonly role: AuthorRoleVerdict;
  /** Solo dall'attributo `datetime`: una data in prosa non si interpreta. */
  readonly publishedAt: string | null;
  readonly editedAt: string | null;
  readonly editDeclared: boolean;
  readonly quotes: readonly Quote[];
  readonly maxQuoteDepth: number;
  /** Testo del post al netto delle citazioni. Dato privato. */
  readonly textWithoutQuotes: string;
  readonly contentRecognised: boolean;
}

export interface ParsedTopicPage {
  readonly topicId: string;
  readonly title: string;
  readonly posts: readonly TopicPost[];
  readonly rawLength: number;
}

/**
 * Chiave d'incrocio letta dal titolo. **Non contiene la giornata**: il titolo
 * non la porta (misurato sul campione di riferimento: zero su dieci), e
 * dedurla dal titolo è fuori contratto.
 */
export interface MatchKey {
  readonly firstTeam: string;
  readonly secondTeam: string;
  readonly firstTeamNormalised: string;
  readonly secondTeamNormalised: string;
  readonly pairPresent: boolean;
  /** Quale squadra giochi in casa **non è stato osservato**. */
  readonly homeAwayUnverified: true;
  /** `HH:MM`, oppure stringa vuota. */
  readonly kickoffLocal: string;
  /** Quale separatore è comparso: la misura resta visibile. */
  readonly timeSeparator: string;
  readonly kickoffPresent: boolean;
  /** Dichiarato fuori banda: il titolo non porta il fuso. */
  readonly declaredTimeZone: string;
  /** Misura da riportare, **mai** usata per legare. */
  readonly matchdayNumberInTitle: boolean;
}

export type MatchLinkState =
  | "RISOLTO"
  | "CALENDARIO_ASSENTE"
  | "CHIAVE_INCOMPLETA"
  | "SQUADRE_NON_RICONCILIATE"
  | "NESSUNA_CORRISPONDENZA"
  | "CORRISPONDENZA_AMBIGUA";

export interface MatchLink {
  readonly state: MatchLinkState;
  /** Valorizzata **solo** in `RISOLTO`. In ogni altro stato è `null`. */
  readonly matchday: number | null;
  readonly matchId: string | null;
  readonly calendarSource: string | null;
  readonly candidates: number;
  readonly reason: string;
}

/**
 * Una partita del calendario **iniettato**. Gli istanti sono millisecondi
 * epoch: il pacchetto non legge orologi e non costruisce date, così lo stesso
 * ingresso dà sempre lo stesso risultato.
 */
export interface CalendarFixture {
  readonly matchday: number;
  readonly matchId?: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /** `HH:MM` locale, quando la fonte di calendario lo dichiara. */
  readonly kickoffLocal?: string;
  readonly kickoffEpochMs: number;
  readonly source?: string;
}

/** Tabella di riconciliazione dei nomi: normalizzato → canonico. */
export type TeamAliases = Readonly<Record<string, string>>;

export interface RoleVerificationOptions {
  /**
   * Percorso del marcatore di rango staff, **iniettato**: quale sia dipende
   * dalla fonte, e questo pacchetto non ne conosce nessuna.
   */
  readonly staffRankMarker: string;
  /**
   * Host della fonte, **iniettato**: un'immagine con host serve da marcatore
   * solo se viene da lì. Vuoto = nessuna forma con host è accettata.
   */
  readonly sourceHost: string;
}

export type MatchTopicRejection =
  | "MARCATORE_DI_ALTRO_PERIMETRO"
  | "NESSUNA_COPPIA_RICONOSCIUTA"
  | "NESSUN_ORARIO_RICONOSCIUTO"
  | "PAROLE_DI_SEZIONE_NON_SQUADRE";

export interface MatchTopicVerdict {
  readonly isMatchTopic: boolean;
  readonly rejection: MatchTopicRejection | null;
  readonly key: MatchKey;
}
