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
// 4. I DUE RANGHI DEL CONFRONTO PER TOKEN si intercalano fra quelli del nome
//    abbreviato invece di stare in coda, e per una ragione che va detta: quei
//    due livelli di evidenza esistono SOLO nella variante «stessa squadra»
//    (§(a) più sotto), quindi non c'è un terzetto di squadra da ordinare al
//    loro interno e la regola «prima il nome, poi la squadra» non li può
//    collocare da sola. Si ordinano allora per evidenza complessiva — nome più
//    squadra — e la scala di certezza resta monotona lungo i ranghi, che è la
//    sola proprietà su cui un filtro a valle può contare.
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
//
// ── UN NOME CORTO CONTRO UN NOME COMPLETO, DENTRO UNA SQUADRA ───────────────
//
// I criteri qui sopra confrontano nomi INTERI: «Marlo Zurbetti» contro «Marlo
// Zurbetti», oppure «M. Zurbetti» contro «Marlo Zurbetti» token per token
// nella stessa posizione e nello stesso numero. Una piattaforma di lega non
// scrive però nomi interi: scrive «Zurbetti», oppure «Zurbetti M.» — il
// cognome, più l'iniziale quando serve a distinguere. Contro un deposito che
// porta «Marlo Zurbetti» nessuno dei criteri sul nome intero aggancia, e non
// perché i due nomi siano di due persone: perché uno dei due è più corto
// dell'altro. Su un'anagrafica misurata di 594 voci, 408 portano una sola
// parola e 91 portano un'iniziale puntata: non è un caso di bordo, è la forma
// normale del dato.
//
// I due ranghi che seguono confrontano quindi i TOKEN, senza pretendere né
// l'ordine né lo stesso numero. Quattro scelte, tutte mie e tutte
// contestabili:
//
// (a) LA SQUADRA È COSTITUTIVA, NON UN RAFFINAMENTO. Un cognome condiviso su
//     una lista intera non è evidenza su cui agire; dentro una rosa reale —
//     insieme piccolo e chiuso — lo diventa. Perciò di questi due livelli di
//     evidenza esiste SOLO la variante «stessa squadra dichiarata»: le altre
//     due — «non confrontabile» e «un'altra» — non ci sono, e la loro assenza
//     è una decisione, non una dimenticanza. Il costo è dichiarato: un
//     trasferito che una fonte conosce solo per cognome non viene agganciato
//     da qui, e resta un buco visibile. Nota che la dottrina «la squadra non
//     esclude mai» (§sopra) non è contraddetta: là la squadra non poteva
//     ESCLUDERE una coppia che il nome sosteneva da sé, qui il nome da sé non
//     sostiene niente e la squadra è metà della prova.
//
// (b) UN TOKEN PIENO SI CONFRONTA SOLO PER UGUAGLIANZA, MAI PER PREFISSO.
//     «Vasch» e «Vaschin» sono due cognomi, non due grafie dello stesso: chi
//     aggancia per prefisso aggancia ogni cognome corto a tutti i cognomi
//     lunghi che lo contengono, e lo fa in silenzio. L'unico confronto per
//     prima lettera che questo file conosce riguarda le iniziali puntate, e
//     solo nel verso descritto qui sotto.
//
// (c) L'INIZIALE PUNTATA NON È UN NOME, E QUI PUÒ SOLO TOGLIERE. «Zurbetti M.»
//     dice una lettera, non un nome proprio. Quindi: (i) un'iniziale non fa
//     mai da ancora — serve almeno un token pieno uguale, come per il nome
//     abbreviato; (ii) un'iniziale non aggiunge MAI un candidato che il solo
//     nome corto non avesse già, può solo toglierne. «Zurbetti M.» vede i
//     candidati di «Zurbetti» meno quelli in cui l'iniziale non copre nessun
//     token. L'eccezione, che va detta perché la frase senza di essa sarebbe
//     falsa: quando l'altro nome è «Zurbetti» in persona, «Zurbetti» contro
//     «Zurbetti» non è copertura ma NOME IDENTICO (rango 2), e la coppia
//     ricompare qui come copertura parziale (rango 9) — cioè con MENO forza,
//     mai con più, e mai come coppia nuova per il risolutore.
//     Ed è un rifiuto secco, non un declassamento: «Zurbetti Q.» contro
//     «Marlo Zurbetti» non ricade
//     nel rango del solo cognome ignorando la Q — esce non risolto. Il costo
//     dichiarato è che un'iniziale che si riferisce a un secondo nome assente
//     dall'altra fonte fa perdere l'aggancio; il verso è quello giusto.
//     Quel che l'iniziale separa sono due persone che condividono il COGNOME,
//     mai due che condividono il nome intero: quelle restano ambigue, e
//     §«GLI OMONIMI» qui sopra vale ancora parola per parola.
//
// (d) DUE GRADI, PERCHÉ SONO DUE EVIDENZE DIVERSE.
//       - `unordered_name`: il nome corto rende conto di OGNI token del nome
//         lungo — ciascuno è lo stesso token, oppure è coperto da un'iniziale
//         di cui è la prima lettera. «Zurbetti M.» rende conto di «Marlo
//         Zurbetti» per intero. Coprire tutto impone che i token siano
//         TANTI QUANTI — ciascuno ne consuma esattamente uno — quindi questo
//         grado è il nome abbreviato senza l'ipotesi sull'ordine, e nient'altro
//         di più: stessa evidenza, stessa targa, `moderate`. Ci cade dentro
//         anche la pura permutazione — «Zurbetti Marlo» contro «Marlo
//         Zurbetti» — che i criteri sul nome intero non agganciano perché
//         confrontano stringhe.
//       - `partial_name`: i token del nome corto stanno tutti nel nome lungo,
//         ma il nome lungo porta token che il corto non conferma — il caso del
//         solo cognome, che nell'anagrafica misurata è la forma di 408 voci su
//         594. La targa è `weak`,
//         e non per prudenza generica: la scala di questo file è già
//         calibrata, e se «cognome più iniziale nella stessa squadra» vale
//         `moderate` (rango 5), «cognome nudo nella stessa squadra» sta sotto,
//         e sotto `moderate` c'è `weak`. Conseguenza da guardare in faccia:
//         chi a valle scarta il debole non aggancia le voci che portano il
//         solo cognome, che sono le più numerose. La targa dice quanta
//         evidenza c'è, non quanta se ne vorrebbe.
//
// E una cosa che questi due ranghi NON sanno: quale token sia il cognome.
// Nessuna funzione qui sotto si chiama `surname`, e nessuna targa lo dice: la
// piattaforma scrive il cognome per convenzione, ma il modulo vede token e
// dichiara solo ciò che vede — «i token del nome corto stanno in quello
// lungo». Chiamarlo cognome sarebbe una promessa che il codice non mantiene,
// e la prima conseguenza pratica è che un nome proprio condiviso dentro una
// squadra produce una coppia esattamente come un cognome condiviso: per
// questo `partial_name` è debole e per questo l'esclusività resta l'unica
// cosa che ne autorizza l'accettazione.

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
export type NameEvidence =
  | "shared_identifier"
  | "exact_name"
  | "abbreviated_name"
  | "unordered_name"
  | "partial_name";

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
  | "unordered_name_same_team"
  | "abbreviated_name_team_not_comparable"
  | "abbreviated_name_other_team"
  | "partial_name_same_team";

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
 * L'ORDINE DEI CRITERI, COME DATO. Nove righe, provate dall'alto in basso.
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
    code: "unordered_name_same_team",
    rank: 6,
    nameEvidence: "unordered_name",
    teamAgreement: "same_declared_team",
    certainty: "moderate",
    evidence:
      "il nome corto rende conto di ogni token del nome lungo — tanti token quanti, ciascuno lo stesso " +
      "token oppure coperto dall'iniziale di cui è la prima lettera, in qualunque ordine — e la squadra " +
      "dichiarata è la stessa",
  },
  {
    code: "abbreviated_name_team_not_comparable",
    rank: 7,
    nameEvidence: "abbreviated_name",
    teamAgreement: "team_not_comparable",
    certainty: "weak",
    evidence: "nome abbreviato compatibile con nome esteso; la squadra non è confrontabile",
  },
  {
    code: "abbreviated_name_other_team",
    rank: 8,
    nameEvidence: "abbreviated_name",
    teamAgreement: "different_declared_team",
    certainty: "weak",
    evidence: "nome abbreviato compatibile con nome esteso ma squadre dichiarate diverse",
  },
  {
    code: "partial_name_same_team",
    rank: 9,
    nameEvidence: "partial_name",
    teamAgreement: "same_declared_team",
    certainty: "weak",
    evidence:
      "i token del nome corto stanno tutti nel nome lungo, che però porta token che il corto non " +
      "conferma (il caso del solo cognome), e la squadra dichiarata è la stessa",
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
 * QUANTO UN NOME CORTO COPRE DI UN NOME LUNGO — i due gradi, e nient'altro in
 * mezzo. `unordered_name` è la copertura piena, `partial_name` quella parziale;
 * l'assenza di copertura è `null`. Vedi §(d) in testa al file.
 */
export type NameCoverage = "unordered_name" | "partial_name";

/**
 * UN SOLO VERSO: i token di `inner` stanno in quelli di `outer`?
 *
 * Il conto è su MULTINSIEMI, non su insiemi: un token che compare due volte a
 * destra ne copre due a sinistra e non tre. Le regole, tutte già dichiarate in
 * testa al file:
 *   - un token PIENO di `inner` deve comparire IDENTICO in `outer` (§(b));
 *   - un token di un solo carattere che non compare identico è un'INIZIALE, e
 *     deve coprire un token di `outer` ancora libero di cui è la prima lettera;
 *     se non ne copre nessuno il verso è chiuso (§(c));
 *   - se alla fine `outer` non ha più niente di scoperto la copertura è piena,
 *     altrimenti è parziale (§(d)).
 *
 * L'ANCORA (§(c)(i)) non è un controllo a parte, ed è deliberato: `inner`
 * arriva qui solo da `nameCoverage()`, che rifiuta i nomi senza token pieni; e
 * un token pieno o compare identico in `outer` o chiude il verso. Ne segue che
 * ogni copertura accettata condivide almeno un token pieno — un `if` in più
 * qui non aggiungerebbe niente, sarebbe irraggiungibile, e nessun test
 * potrebbe diventare rosso rompendolo. Chi toglie il gate di comparabilità
 * toglie l'ancora: è quel gate a portarla, e un test la pinna come proprietà
 * dell'esito invece che come riga di codice.
 *
 * NON normalizza niente: riceve token già normalizzati da `normalizedTokens()`
 * su ENTRAMBI i lati. Normalizzare qui un lato solo — o riceverne uno grezzo —
 * è il difetto che aggancia cose diverse senza lasciare traccia, ed è per
 * questo che questa funzione non vede mai una `displayName`.
 */
function coverageOfInnerInOuter(
  inner: readonly string[],
  outer: readonly string[],
): NameCoverage | null {
  if (inner.length === 0 || outer.length === 0) return null;
  if (inner.length > outer.length) return null;

  const free = new Map<string, number>();
  for (const token of outer) free.set(token, (free.get(token) ?? 0) + 1);

  const initials: string[] = [];
  for (const token of inner) {
    const available = free.get(token) ?? 0;
    if (available > 0) {
      free.set(token, available - 1);
      continue;
    }
    // Un token pieno che il nome lungo non porta chiude il verso: nessun
    // prefisso, nessuna indulgenza.
    if (token.length > 1) return null;
    initials.push(token);
  }

  // Le iniziali rimaste coprono, una per una, un token ancora libero che
  // comincia con quella lettera. Il conto PER LETTERA è esatto, non
  // un'euristica: due iniziali diverse non possono coprire lo stesso token —
  // «m» copre solo token che cominciano per «m» — quindi gli insiemi dei
  // candidati di lettere diverse sono DISGIUNTI, e a pari lettera consumare un
  // token o un altro lascia lo stesso numero di token scoperti. L'esito non
  // dipende quindi da quale token si scelga, e non c'è nessuno spareggio da
  // dichiarare.
  const needed = new Map<string, number>();
  for (const initial of initials) needed.set(initial, (needed.get(initial) ?? 0) + 1);
  for (const [letter, count] of needed) {
    let covered = 0;
    for (const [token, available] of free) {
      if (available <= 0 || !token.startsWith(letter)) continue;
      const used = Math.min(available, count - covered);
      free.set(token, available - used);
      covered += used;
      if (covered === count) break;
    }
    // Un'iniziale che non copre niente RIFIUTA la coppia. È l'unico potere che
    // ha, ed è quello di togliere.
    if (covered < count) return null;
  }

  let uncovered = 0;
  for (const available of free.values()) uncovered += available;
  return uncovered === 0 ? "unordered_name" : "partial_name";
}

/**
 * LA COPERTURA FRA DUE NOMI, nel verso che ne esce meglio — perché quale dei
 * due lati sia il corto è una proprietà del dato, non delle liste: la
 * piattaforma scrive corto e il deposito lungo, ma questo modulo non sa quale
 * lista gli sia stata passata a sinistra. Simmetrica per costruzione, e un
 * test lo pinna.
 *
 * Si rifiuta in due casi, entrambi voluti:
 *   - un nome senza token pieni non è confrontabile (§«UN NOME È CONFRONTABILE
 *     SOLO SE PORTA UN TOKEN PIENO»);
 *   - due nomi identici token per token: quelli hanno un rango loro, più alto,
 *     e duplicarli qui vorrebbe dire scrivere due volte la stessa evidenza con
 *     due targhe diverse.
 */
export function nameCoverage(
  a: readonly string[],
  b: readonly string[],
): NameCoverage | null {
  if (!isComparableName(a) || !isComparableName(b)) return null;
  if (a.length === b.length && a.every((token, index) => token === b[index])) return null;
  const forward = coverageOfInnerInOuter(a, b);
  const backward = coverageOfInnerInOuter(b, a);
  if (forward === "unordered_name" || backward === "unordered_name") return "unordered_name";
  if (forward === "partial_name" || backward === "partial_name") return "partial_name";
  return null;
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
