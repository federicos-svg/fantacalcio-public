// WP-6a — I CRITERI, E IL LORO ORDINE. Puro, deterministico, senza I/O.
//
// Un criterio qui è una COPPIA: che cosa dicono i nomi, e che cosa dice la
// squadra. La tabella `MATCH_CRITERIA` più in basso è l'ordine in cui si
// prova, dal più forte al più debole, ed è DATO — non un `if` sparso in una
// funzione — perché l'ordine è la decisione contestabile di questo modulo e
// deve stare in un posto solo, leggibile e pinnabile da un test.
//
// ── PERCHÉ QUEST'ORDINE (scelta mia, contestabile) ──────────────────────────
//
// 1. L'IDENTIFICATIVO CONDIVISO viene prima di tutto perché è l'unica prova di
//    identità che non passa dalla grafia. Non è però una prova cieca: un
//    identificativo uguale con due nomi che non si somigliano affatto è più
//    probabilmente uno spazio dichiarato male o un identificativo riusato che
//    una coincidenza felice, e in quel caso NON si abbina (vedi
//    `identifierAgreement` sotto). La soglia sotto cui i nomi «non si
//    somigliano» non è nuova: è `NAME_OVERLAP_LOW_BAND`, già dichiarata e già
//    contestabile in `packages/identity-policy`. Inventarne una seconda
//    avrebbe voluto dire due numeri da calibrare invece di uno.
//
// 2. IL NOME ESATTO (normalizzato) viene prima del nome abbreviato perché è
//    evidenza di grado diverso, non solo di grado maggiore: due nomi completi
//    uguali sono un fatto, un'iniziale compatibile è un'ipotesi.
//
// 3. LA SQUADRA RAFFINA, NON DECIDE. Dentro ciascun livello di evidenza sul
//    nome, la squadra ordina i tre casi così: stessa squadra dichiarata (prova
//    in più), squadra non confrontabile (nessuna prova), squadra diversa
//    (prova CONTRARIA, ma debole). Non è simmetrico per caso: «non lo so» vale
//    più di «risulta un'altra», perché la seconda può essere un omonimo in
//    un'altra rosa.
//
// ── LA SQUADRA CAMBIA DURANTE LA STAGIONE, E QUESTO È IL PUNTO ──────────────
//
// Un giocatore ceduto a gennaio è lo stesso giocatore. Se la squadra fosse un
// FILTRO, ogni cessione diventerebbe un giocatore sparito il giorno dopo il
// mercato, e la sparizione sarebbe silenziosa: la fonte più vecchia lo mette
// ancora in ALFA, la più nuova già in BETA, e il filtro li terrebbe separati
// per sempre. Quindi la squadra qui NON esclude mai: `exact_name_other_team`
// esiste apposta, aggancia, e porta nella targa che le due fonti dichiarano
// squadre diverse. Chi a valle non se lo può permettere — per esempio chi
// legge una rosa avversaria alla giornata N — filtra per criterio e scarta
// quella targa; chi invece unisce voti storici la tiene. La decisione resta a
// valle perché il costo di sbagliarla è diverso a valle.
//
// Il rovescio, dichiarato: quando due fonti sono disallineate sul mercato, un
// vero omonimo in un'altra squadra e un vero trasferito hanno esattamente la
// stessa forma. Questo modulo non li distingue e non finge di farlo: li
// aggancia entrambi con la targa più debole, oppure — se sono più d'uno — non
// li aggancia affatto.
//
// ── GLI OMONIMI, E LE DUE SOLE COSE CHE NE SCIOLGONO UNO ────────────────────
//
// Due giocatori con lo stesso nome normalizzato producono due candidati, e due
// candidati sono «ambiguo» per costruzione (`resolveIdentities.ts`). Il RUOLO
// non entra come discriminante — le fonti lo classificano diversamente fra
// loro, e usarlo significherebbe scegliere un omonimo su un segnale che non è
// identità.
//
// Le uniche due cose che sciolgono un omonimo, in questo contratto, sono:
//   - un IDENTIFICATIVO dichiarato nello stesso spazio (rango 1);
//   - una SQUADRA dichiarata che separi davvero i due, cioè quando ciascun
//     omonimo ha una sola controparte nella propria squadra (rango 2).
//
// E c'è una terza cosa che NON li scioglie, benché lo sembri: l'ESCLUSIONE.
// Che il gemello sia già stato agganciato da un criterio più forte non rende
// distinguibile chi resta — §«L'ESCLUSIVITÀ SI MISURA SUL GRUPPO DI PARTENZA»
// in `resolveIdentities.ts`. Fino al 2026-09-09 questo file prometteva
// «solo un identificativo, e nient'altro» mentre il codice ne scioglieva uno
// per esclusione: la riga qui sopra è stata riscritta per dire quel che il
// codice fa adesso, che è anche quel che deve fare.
//
// ── UN NOME È CONFRONTABILE SOLO SE PORTA UN TOKEN PIENO ────────────────────
//
// «M» contro «M», stessa squadra, non è un nome uguale: è un'iniziale uguale,
// e un'iniziale non identifica nessuno. Un nome troncato da un parser a monte
// produrrebbe così un abbinamento inventato con targa `strong`. Quindi un nome
// entra nei criteri solo se, dopo la normalizzazione, porta almeno un token di
// due caratteri o più — la stessa ANCORA che il criterio del nome abbreviato
// già pretendeva per conto suo: una regola sola, applicata in due posti,
// invece di due regole che un giorno divergono. Un nome fatto di sole iniziali
// non è un errore del chiamante: esce fra i non risolti con la propria
// ragione, che è un buco visibile.

import { NAME_OVERLAP_LOW_BAND } from "../../identity-policy/src/candidateKeyPolicy.js";
import {
  computeTokenOverlap,
  normalizePlayerName,
  tokenizeNormalizedName,
} from "../../identity-policy/src/nameSimilarity.js";
import { isDeclared, type SourcePlayerRecord } from "./declaredRoster.js";

/**
 * La normalizzazione NON è riscritta qui. È quella di
 * `packages/identity-policy/src/nameSimilarity.ts` — minuscole, accenti tolti,
 * ogni separatore (spazio, apostrofo, trattino, punto) collassato in uno
 * spazio, nessun token buttato via — e si riusa apposta: due normalizzazioni
 * parallele nello stesso repository divergono, e il giorno che divergono
 * l'abbinamento cambia senza che nessuno abbia cambiato una regola.
 *
 * Conseguenze visibili, e volute: «Ferrà» e «Ferra» diventano lo stesso token;
 * «D'Angelo» diventa due token («d», «angelo») su ENTRAMBI i lati, quindi
 * resta confrontabile; «M.» diventa il token «m», che è esattamente ciò che
 * serve al criterio del nome abbreviato.
 */
export function normalizedTokens(record: SourcePlayerRecord): readonly string[] {
  return tokenizeNormalizedName(normalizePlayerName(record.displayName));
}

/** Il nome normalizzato in una stringa sola — vuota quando non c'è nulla di confrontabile. */
export function normalizedName(record: SourcePlayerRecord): string {
  return normalizePlayerName(record.displayName);
}

/**
 * Un nome è CONFRONTABILE solo se porta almeno un token di due caratteri o
 * più. Vedi §«UN NOME È CONFRONTABILE SOLO SE PORTA UN TOKEN PIENO» in testa
 * al file: «M» e «M» non sono lo stesso nome, sono la stessa iniziale, e la
 * differenza vale un abbinamento inventato con targa `strong`.
 */
export function isComparableName(tokens: readonly string[]): boolean {
  return tokens.some((token) => token.length > 1);
}

/** Che cosa dicono i nomi. */
export type NameEvidence = "shared_identifier" | "exact_name" | "abbreviated_name";

/** Che cosa dice la squadra, con «non lo so» distinto da «un'altra». */
export type TeamAgreement = "same_declared_team" | "team_not_comparable" | "different_declared_team";

/** Quanto ci si può fidare, in una parola sola, per filtrare a valle senza rileggere il codice. */
export type Certainty = "certain" | "strong" | "moderate" | "weak";

export type MatchCriterionCode =
  | "shared_identifier"
  | "exact_name_same_team"
  | "exact_name_team_not_comparable"
  | "exact_name_other_team"
  | "abbreviated_name_same_team"
  | "abbreviated_name_team_not_comparable"
  | "abbreviated_name_other_team";

export interface MatchCriterion {
  readonly code: MatchCriterionCode;
  /** 1 = si prova per primo. È la posizione nella tabella, non un peso. */
  readonly rank: number;
  readonly nameEvidence: NameEvidence;
  /** `null` sul rango dell'identificativo: lì la squadra non entra affatto. */
  readonly teamAgreement: TeamAgreement | null;
  readonly certainty: Certainty;
  /** Perché questo criterio sta dov'è, in una riga, per chi legge un risultato. */
  readonly evidence: string;
}

/**
 * L'ORDINE DEI CRITERI, COME DATO. Sette righe, provate dall'alto in basso.
 * Cambiare quest'ordine è una decisione, non un refactoring: un test la pinna.
 */
export const MATCH_CRITERIA: readonly MatchCriterion[] = [
  {
    code: "shared_identifier",
    rank: 1,
    nameEvidence: "shared_identifier",
    teamAgreement: null,
    certainty: "certain",
    evidence:
      "identificativo uguale nello stesso spazio dichiarato dalle due fonti, con i nomi che si sostengono",
  },
  {
    code: "exact_name_same_team",
    rank: 2,
    nameEvidence: "exact_name",
    teamAgreement: "same_declared_team",
    certainty: "strong",
    evidence: "nome normalizzato identico e stessa squadra dichiarata nello stesso vocabolario",
  },
  {
    code: "exact_name_team_not_comparable",
    rank: 3,
    nameEvidence: "exact_name",
    teamAgreement: "team_not_comparable",
    certainty: "moderate",
    evidence: "nome normalizzato identico; la squadra non è confrontabile e non aggiunge né toglie nulla",
  },
  {
    code: "exact_name_other_team",
    rank: 4,
    nameEvidence: "exact_name",
    teamAgreement: "different_declared_team",
    certainty: "moderate",
    evidence:
      "nome normalizzato identico ma squadre dichiarate diverse: può essere un trasferimento, può essere un omonimo altrove",
  },
  {
    code: "abbreviated_name_same_team",
    rank: 5,
    nameEvidence: "abbreviated_name",
    teamAgreement: "same_declared_team",
    certainty: "moderate",
    evidence: "nome abbreviato compatibile con nome esteso, stessa squadra dichiarata",
  },
  {
    code: "abbreviated_name_team_not_comparable",
    rank: 6,
    nameEvidence: "abbreviated_name",
    teamAgreement: "team_not_comparable",
    certainty: "weak",
    evidence: "nome abbreviato compatibile con nome esteso; la squadra non è confrontabile",
  },
  {
    code: "abbreviated_name_other_team",
    rank: 7,
    nameEvidence: "abbreviated_name",
    teamAgreement: "different_declared_team",
    certainty: "weak",
    evidence: "nome abbreviato compatibile con nome esteso ma squadre dichiarate diverse",
  },
];

/**
 * COMPATIBILITÀ FRA NOME ABBREVIATO E NOME ESTESO — la definizione, per esteso,
 * perché è la regola più facile da rendere troppo generosa senza accorgersene.
 *
 * Vale quando, e solo quando:
 *   - entrambi i nomi hanno almeno due token e lo STESSO numero di token;
 *   - posizione per posizione, i due token o sono uguali, o uno è di un solo
 *     carattere e quel carattere è l'iniziale dell'altro;
 *   - almeno una posizione è davvero un'abbreviazione (altrimenti è il nome
 *     esatto, che ha già il suo rango, più alto);
 *   - almeno una posizione è un token PIENO uguale — l'ancora. Senza ancora,
 *     «A. B.» e «Anna Bruni» risulterebbero compatibili, e con loro mezzo
 *     listone.
 *
 * CHE COSA QUESTA REGOLA NON COPRE, dichiarato invece che scoperto dopo:
 * assume che le due fonti scrivano i token nello STESSO ORDINE. Se una scrive
 * «Cognome Nome» e l'altra «Nome Cognome», il criterio non aggancia. Non
 * aggancia: non sbaglia. Il giocatore esce come non risolto ed è visibile,
 * che è il modo giusto di fallire qui.
 */
export function abbreviationCompatible(a: readonly string[], b: readonly string[]): boolean {
  if (a.length < 2 || b.length < 2 || a.length !== b.length) return false;
  let abbreviated = false;
  let fullAnchor = false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (left === undefined || right === undefined) return false;
    if (left === right) {
      if (left.length > 1) fullAnchor = true;
      continue;
    }
    if (left.length === 1 && right.startsWith(left)) {
      abbreviated = true;
      continue;
    }
    if (right.length === 1 && left.startsWith(right)) {
      abbreviated = true;
      continue;
    }
    return false;
  }
  return abbreviated && fullAnchor;
}

/**
 * Che cosa dice la squadra, per una coppia. Il vocabolario conta: due
 * vocabolari diversi non sono confrontabili, e fingere che lo siano è
 * esattamente il modo in cui «Inter» e «Internazionale» diventerebbero due
 * squadre diverse — o, peggio, due squadre uguali che non lo sono.
 */
export function teamAgreementOf(
  leftKey: string | null | undefined,
  rightKey: string | null | undefined,
  leftVocabulary: string | null | undefined,
  rightVocabulary: string | null | undefined,
): TeamAgreement {
  if (!isDeclared(leftKey) || !isDeclared(rightKey)) return "team_not_comparable";
  if (!isDeclared(leftVocabulary) || !isDeclared(rightVocabulary)) return "team_not_comparable";
  if (leftVocabulary !== rightVocabulary) return "team_not_comparable";
  return leftKey === rightKey ? "same_declared_team" : "different_declared_team";
}

/** L'esito del confronto fra due identificativi, quando entrambi ci sono. */
export type IdentifierAgreement =
  | "identifier_match"
  | "identifier_name_conflict"
  | "identifier_without_comparable_name"
  | "identifier_different"
  | "identifier_not_comparable";

/**
 * IL CONTROINCROCIO SULL'IDENTIFICATIVO. Un identificativo uguale è la prova
 * più forte che questo contratto conosca, ma resta un dato che qualcuno ha
 * dichiarato: se le due righe che lo portano hanno nomi che non si somigliano
 * affatto, la spiegazione più probabile non è «grafie molto diverse», è
 * «spazio dichiarato male» o «identificativo riusato». In quel caso non si
 * abbina e non si sceglie: si dichiara il conflitto. È la stessa regola già
 * scritta in `packages/identity-policy` (`review_external_id_reuse`): un
 * identificativo riusato va in revisione, mai in promozione silenziosa.
 *
 * FIN DOVE ARRIVA IL CONFLITTO — la frase era più stretta del comportamento
 * fino al 2026-09-09, quando diceva «le due righe restano fuori». Non sono due
 * righe: chi decide che farne è `sweepUnreliableIdentifiers()` in
 * `resolveIdentities.ts`, e la sua unità non è la coppia, è il VALORE
 * dell'identificativo. Se un identificativo non regge il controincrocio su una
 * sola coppia, non è affidabile per nessuna: escono dal giro tutte le righe che
 * lo portano, su entrambi i lati, compresa la terza che con quel conflitto non
 * c'entrava — perché agganciarla al rango 1 significherebbe dichiarare `certain`
 * un abbinamento fondato su un identificativo che abbiamo appena visto
 * sbagliare. La ragione che quelle righe portano dice questo, e non «i tuoi due
 * nomi non si somigliano», che per la terza sarebbe falso.
 */
export function identifierAgreement(
  left: SourcePlayerRecord,
  right: SourcePlayerRecord,
  leftSpace: string | null | undefined,
  rightSpace: string | null | undefined,
): IdentifierAgreement {
  if (!isDeclared(left.identifier) || !isDeclared(right.identifier)) return "identifier_not_comparable";
  if (!isDeclared(leftSpace) || !isDeclared(rightSpace)) return "identifier_not_comparable";
  if (leftSpace !== rightSpace) return "identifier_not_comparable";
  if (left.identifier.trim() !== right.identifier.trim()) return "identifier_different";

  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  // Stessa regola dell'ancora: un nome di sole iniziali non controincrocia
  // niente, e un identificativo che nessun nome sostiene non basta da solo.
  if (!isComparableName(leftTokens) || !isComparableName(rightTokens)) {
    return "identifier_without_comparable_name";
  }
  if (computeTokenOverlap(leftTokens, rightTokens) < NAME_OVERLAP_LOW_BAND) return "identifier_name_conflict";
  return "identifier_match";
}
