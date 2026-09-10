// WP-6a — IL RISOLUTORE. Date due liste dichiarate, produce: gli abbinamenti
// risolti con la loro targa, i non risolti con la ragione, gli ambigui con i
// candidati. Puro, deterministico, senza I/O.
//
// ── COME LAVORA, IN CINQUE RIGHE ────────────────────────────────────────────
//
// I criteri di `identityCriteria.ts` si provano in ordine, dal più forte al
// più debole. A ogni criterio si costruiscono TUTTE le coppie che quel
// criterio ammette fra le righe ancora aperte, e si accetta una coppia solo
// se è ESCLUSIVA DA ENTRAMBI I LATI: la riga di sinistra ha quel solo
// candidato, e quel candidato ha quella sola pretendente. Tutto il resto — un
// lato con due candidati, un candidato conteso da due lati — non è un
// abbinamento debole: è un'ambiguità, e si dichiara.
//
// ── L'AMBIGUITÀ BRUCIA, E QUESTA È LA DECISIONE PIÙ CONTESTABILE DI TUTTE ───
//
// Una riga che è risultata ambigua a un criterio NON viene riprovata ai
// criteri più deboli: esce dal giro. La ragione è che un criterio più debole
// non può SCIOGLIERE ciò che uno più forte ha lasciato aperto — può solo
// produrre un vincitore per un motivo meno buono di quello che era già
// insufficiente. Se due righe hanno lo stesso nome esatto nella stessa
// squadra, sciogliere l'ambiguità con un'iniziale sarebbe scegliere, non
// riconoscere. Il costo dichiarato di questa scelta: una riga ambigua resta
// non agganciata anche quando, a un criterio più debole, esisteva una sola
// coppia possibile. È il verso giusto in cui sbagliare — §«un abbinamento
// sbagliato è peggio di un abbinamento mancante», in `declaredRoster.ts`.
//
// ── L'ESCLUSIVITÀ SI MISURA SUL GRUPPO DI PARTENZA ──────────────────────────
//
// «Esclusiva da entrambi i lati» si misura sulle LISTE INTERE, non su ciò che
// resta dopo che un criterio più forte ha portato via qualcuno. La differenza
// non è teorica: fino al 2026-09-09 questo file contava i candidati sugli
// insiemi ancora aperti, e produceva questo —
//
//   SINISTRA:  L1 «Rossi Mario» ALFA id=ID-1  |  L2 «Rossi Mario» ALFA
//   DESTRA:    R1 «Rossi Mario» ALFA id=ID-1  |  R2 «Rossi Mario» ALFA
//
//   L1/R1  shared_identifier  certain   ← giusto
//   L2/R2  exact_name_same_team STRONG  ← INVENTATO
//
// L2 e R2 non hanno NESSUNA prova di identità oltre a un nome e una squadra
// che condividono con altri due. Passavano perché il rango 1 aveva consumato
// L1 e R1 e li aveva tolti dagli insiemi aperti: al giro dopo restavano soli,
// e l'esclusività reciproca li promuoveva. Non perché fossero distinguibili,
// ma perché l'algoritmo aveva ripulito il campo prima di guardarli.
//
// PERCHÉ ERA LA COSA PEGGIORE POSSIBILE. La copertura PARZIALE degli
// identificativi fra due fonti è il caso NORMALE che questo modulo dichiara di
// gestire, non un limite remoto: quasi ogni coppia di liste vere ha qualche
// riga con identificativo e molte senza. Se L2 e R2 sono davvero due persone
// diverse, i voti dell'una finiscono sulla riga dell'altra con targa `strong`,
// `matches` pieno, conto che torna, e nessun sintomo — mai.
//
// PERCHÉ L'ELIMINAZIONE NON È UN RAGIONAMENTO VALIDO QUI. «Se L1 è R1, allora
// L2 non può che essere R2» vale solo se i due gruppi sono CHIUSI e COMPLETI:
// se cioè si sa che ogni omonimo di sinistra ha una controparte a destra e
// viceversa. Questo modulo non lo sa e non lo può sapere — «presente in una
// fonte e assente nell'altra» è un caso previsto, con la sua ragione e la sua
// prova. Su liste che possono essere incomplete, l'eliminazione non è una
// deduzione: è una scommessa che non lascia traccia.
//
// COME SI MISURA ADESSO. A ogni criterio i candidati di ciascuna riga si
// contano su TUTTE le righe dell'altra lista, aperte o già consumate; una
// coppia si accetta solo se entrambi i conti fanno uno E entrambe le righe
// sono ancora aperte. Una riga che nel gruppo di partenza aveva più di un
// candidato esce come ambigua anche se oggi quel candidato è rimasto solo, e
// `resolvedElsewhere` dice quali dei suoi candidati erano già stati agganciati
// altrove — cioè risponde alla domanda «perché è ambigua se sembra sola?».
//
// È una regola sola, nel ciclo generico, quindi vale per OGNI criterio per
// costruzione: il gemello del difetto sul nome abbreviato e quello sul
// trasferito muoiono con lo stesso codice, non con tre rattoppi.
//
// ── L'ESCLUSIVITÀ NON PROVA L'UNICITÀ NEL MONDO ─────────────────────────────
//
// «Esclusivo da entrambi i lati» è una proprietà di CIÒ CHE SI VEDE. Due liste
// che contengono una sola riga «Zurbetti» a testa, nella stessa squadra, si
// agganciano in modo esclusivo — e la coppia è sbagliata se quelle due righe
// sono due persone diverse e il vero contraltare di ciascuna manca dall'altra
// lista. L'esito allora ha la forma esatta di un aggancio giusto: `ambiguous`
// vuoto, `unresolved` vuoto, i conti che tornano. È un FALSO POSITIVO, cioè il
// verso in cui questo modulo dichiara altrove di non voler sbagliare, e sui
// criteri deboli è il rischio vero — §(e) in `identityCriteria.ts`.
//
// NON È IMPEDIBILE CON LE SOLE DUE LISTE, e questo file non finge di
// impedirlo: nessun conteggio può mostrare una riga che in nessuna delle due
// liste c'è. Quel che si può fare è non lasciare il chiamante cieco, e sta in
// una differenza di posizione: chi consuma vede un abbinamento alla volta,
// questo modulo vede ENTRAMBE LE LISTE INTERE. Quindi ogni abbinamento porta
// con sé i conti dell'insieme in cui il suo criterio poteva pescare (`cohort`):
// quante righe per lato, e quante di quelle sono rimaste senza alcun
// abbinamento.
//
// CHE COSA QUEI CONTI DICONO, ESATTAMENTE — e non una parola di più:
//   - `leftWithoutMatch`/`rightWithoutMatch` a zero dicono che dentro
//     quell'insieme ogni riga ha trovato posto: nessuna riga di quella rosa è
//     rimasta scoperta IN QUESTO CONFRONTO;
//   - un numero diverso da zero dice che l'insieme è visibilmente scoperto, ed
//     è la condizione in cui una coppia debole merita di essere guardata;
//   - i conteggi NON dicono che l'aggancio è giusto. Nel caso peggiore — la
//     riga assente da entrambe le liste — i conti tornano puliti e la coppia
//     resta sbagliata. Un test lo pinna apposta, perché chi arriva dopo lo
//     trovi scritto invece di scoprirlo.
//
// E QUI FINISCE. Se un'evidenza debole dentro un insieme chiuso basti o no è
// una POLITICA DI ACCETTAZIONE, e non si scrive qui: questo modulo dà i
// numeri, mai il verdetto. Nessuna soglia, nessun campo «affidabile», nessuna
// targa che cambi per via di un conteggio.
//
// ── NON ESISTE «IL PRIMO CANDIDATO» ─────────────────────────────────────────
//
// In nessun punto di questo file un elenco di candidati viene ridotto
// prendendone uno. Non c'è `[0]`, non c'è `find`, non c'è un ordinamento che
// faccia da spareggio: dove i candidati sono più d'uno il ramo scrive
// un'ambiguità e basta. `tests/ambiguity.test.ts` è scritto per diventare
// rosso il giorno in cui qualcuno cambia idea, e per restare rosso anche se
// quel qualcuno rende la scelta deterministica ordinando i candidati.
//
// ── QUEL CHE ENTRA ED ESCE È CONTABILE ──────────────────────────────────────
//
// Ogni riga di ciascuna lista compare in ESATTAMENTE UNO dei tre esiti —
// abbinata, ambigua, non risolta. Non è una proprietà accidentale: è la sola
// forma in cui «il giocatore non agganciato è un buco visibile» significa
// qualcosa, ed è pinnata da un test. Un abbinamento che sparisse senza
// lasciare traccia in nessuno dei tre elenchi sarebbe indistinguibile da un
// giocatore che nella fonte non c'era.

import {
  type DeclaredRoster,
  type RosterHandle,
  type SourcePlayerRecord,
  assertDeclaredProvenance,
  isDeclared,
  rosterHandle,
} from "./declaredRoster.js";
import {
  MATCH_CRITERIA,
  type Certainty,
  type MatchCriterion,
  type MatchCriterionCode,
  type NameEvidence,
  type TeamAgreement,
  abbreviationCompatible,
  identifierAgreement,
  isComparableName,
  nameCoverage,
  normalizedName,
  normalizedTokens,
  teamAgreementOf,
} from "./identityCriteria.js";

export type Side = "left" | "right";

/**
 * L'INSIEME IN CUI QUESTO CRITERIO POTEVA PESCARE, E QUANTO È COPERTO.
 *
 * Vedi §«L'ESCLUSIVITÀ NON PROVA L'UNICITÀ NEL MONDO» in testa al file. Sono
 * CONTI, non un giudizio: qui non c'è nessuna soglia, nessun «affidabile», e
 * nessuna politica. Chi consuma decide che farne — e la regola su quando
 * un'evidenza debole dentro un insieme chiuso basta non vive in questo file.
 */
export interface MatchCohort {
  /**
   * `declared_team` quando il criterio pretende la stessa squadra dichiarata:
   * lì nessun candidato può venire da fuori quella rosa, e l'insieme è chiuso.
   * `whole_list` per tutti gli altri criteri: non lavorano dentro un insieme
   * chiuso, e i conti sono sulle liste intere.
   */
  readonly scope: "declared_team" | "whole_list";
  /** La chiave di squadra quando `scope` è `declared_team`; `null` altrimenti. */
  readonly key: string | null;
  /** Righe di sinistra dentro l'insieme (tutte, non solo quelle agganciate). */
  readonly leftRecords: number;
  readonly rightRecords: number;
  /**
   * Quante di quelle righe non compaiono in NESSUN abbinamento dell'esito —
   * ambigue, non risolte, o rimaste fuori, senza distinzione. È il numero che
   * dice se l'insieme è visibilmente scoperto.
   */
  readonly leftWithoutMatch: number;
  readonly rightWithoutMatch: number;
}

/** Un abbinamento risolto, con la targa che dice COME è stato ottenuto. */
export interface IdentityMatch {
  readonly leftRef: string;
  readonly rightRef: string;
  readonly criterion: MatchCriterionCode;
  readonly rank: number;
  readonly certainty: Certainty;
  readonly nameEvidence: NameEvidence;
  /** Che cosa diceva la squadra, anche quando non è servita a decidere. */
  readonly teamAgreement: TeamAgreement;
  readonly evidence: string;
  /** Le due targhe delle liste: sotto un abbinamento resta scritto da dove viene. */
  readonly provenance: { readonly left: string; readonly right: string };
  /**
   * I conti dell'insieme in cui questo criterio poteva pescare candidati. Non
   * cambiano l'abbinamento e non lo qualificano: servono a chi legge per
   * distinguere «unico perché ce n'è uno solo» da «unico perché l'altro non è
   * in questa lista» — §«L'ESCLUSIVITÀ NON PROVA L'UNICITÀ NEL MONDO».
   */
  readonly cohort: MatchCohort;
}

export type AmbiguityReason = "multiple_candidates" | "contested_candidate";

/** Una riga che NON è stata abbinata perché i candidati erano più d'uno. */
export interface AmbiguousRecord {
  readonly side: Side;
  readonly ref: string;
  /** Il criterio al quale l'ambiguità è emersa: dice quanto era forte l'evidenza in gioco. */
  readonly criterion: MatchCriterionCode;
  readonly rank: number;
  readonly reason: AmbiguityReason;
  /**
   * I candidati a questo criterio sulla lista INTERA, per chiave, ordinati: un
   * elenco, mai una scelta. Comprende i candidati che un criterio più forte ha
   * già agganciato altrove — è il gruppo di partenza, non il residuo.
   */
  readonly candidates: readonly string[];
  /**
   * Quali di quei candidati erano già usciti dal giro a un criterio più forte —
   * agganciati, oppure a loro volta dichiarati ambigui. Vuoto nel caso normale;
   * non vuoto è la risposta alla domanda «perché questa riga è ambigua se il
   * candidato che resta è uno solo?».
   */
  readonly resolvedElsewhere: readonly string[];
  readonly detail: string;
}

export type UnresolvedReason =
  | "identifier_name_conflict"
  | "identifier_without_comparable_name"
  | "name_not_comparable"
  | "no_candidate";

/** Una riga rimasta senza abbinamento, con la ragione. */
export interface UnresolvedRecord {
  readonly side: Side;
  readonly ref: string;
  readonly reason: UnresolvedReason;
  /** Le righe dell'altra lista implicate nella ragione, quando ce ne sono. */
  readonly counterparts: readonly string[];
  readonly detail: string;
}

export interface IdentityResolution {
  readonly left: RosterHandle;
  readonly right: RosterHandle;
  readonly matches: readonly IdentityMatch[];
  readonly ambiguous: readonly AmbiguousRecord[];
  readonly unresolved: readonly UnresolvedRecord[];
}

interface Edge {
  readonly leftRef: string;
  readonly rightRef: string;
  readonly teamAgreement: TeamAgreement;
  /** La squadra condivisa, solo quando le due righe la dichiarano uguale. */
  readonly teamKey: string | null;
}

/**
 * Un abbinamento com'è mentre il giro è in corso: tutto tranne i conti
 * dell'insieme, che si sanno solo a esito chiuso. `cohortKey` è la squadra in
 * cui il CRITERIO ha ristretto i candidati, `null` quando non ne ha ristretto
 * nessuno.
 */
type MatchWithoutCohort = Omit<IdentityMatch, "cohort"> & { readonly cohortKey: string | null };

function indexByRef(records: readonly SourcePlayerRecord[]): ReadonlyMap<string, SourcePlayerRecord> {
  const map = new Map<string, SourcePlayerRecord>();
  for (const record of records) map.set(record.ref, record);
  return map;
}

function sortedRefs(refs: Iterable<string>): readonly string[] {
  return [...refs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function nameEvidenceHolds(
  evidence: NameEvidence,
  left: SourcePlayerRecord,
  right: SourcePlayerRecord,
  leftSpace: string | null | undefined,
  rightSpace: string | null | undefined,
): boolean {
  if (evidence === "shared_identifier") {
    return identifierAgreement(left, right, leftSpace, rightSpace) === "identifier_match";
  }
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  // Un nome entra nei criteri solo se porta almeno un token pieno: «M» contro
  // «M» è la stessa iniziale, non lo stesso nome. Il criterio del nome
  // abbreviato pretende già la sua ancora; qui la stessa regola copre anche il
  // nome esatto, che altrimenti promuoverebbe un troncamento a targa `strong`.
  if (!isComparableName(leftTokens) || !isComparableName(rightTokens)) return false;
  const leftName = normalizedName(left);
  const rightName = normalizedName(right);
  if (evidence === "exact_name") return leftName === rightName;
  if (leftName === rightName) return false;
  if (evidence === "abbreviated_name") return abbreviationCompatible(leftTokens, rightTokens);
  // I due gradi del confronto per token — copertura piena e copertura parziale
  // — si escludono a vicenda: una coppia produce un arco in UNO SOLO dei due
  // ranghi, mai in entrambi. `NameEvidence` e `NameCoverage` condividono i due
  // nomi apposta, così il confronto qui resta una riga invece di una tabella
  // che un giorno divergerebbe.
  return nameCoverage(leftTokens, rightTokens) === evidence;
}

/**
 * IL PASSAGGIO ZERO — gli identificativi che non reggono, prima di ogni
 * abbinamento, e con il VALORE dell'identificativo come unità.
 *
 * Due righe che portano lo stesso identificativo nello stesso spazio dichiarato
 * ma nomi che non si sostengono sono una premessa rotta, non una coppia
 * difficile: o lo spazio non è quello che qualcuno ha dichiarato, o
 * l'identificativo è stato riusato.
 *
 * L'unità non è però la COPPIA, è il VALORE. Se un identificativo sbaglia su
 * una coppia, non è affidabile su nessuna: escono dal giro TUTTE le righe che
 * lo portano, su entrambi i lati — compresa la terza, che con quel conflitto
 * non c'entrava. Agganciarla al rango 1 significherebbe scrivere `certain`
 * sotto un abbinamento fondato su un identificativo che abbiamo appena visto
 * sbagliare, ed è proprio la targa che non deve mai mentire. Il costo è
 * dichiarato: una riga innocente può perdere un aggancio che avrebbe avuto. Il
 * verso è quello giusto — un buco visibile invece di una certezza falsa — e la
 * ragione che quella riga porta dice che a saltare è stato l'identificativo,
 * non il suo nome.
 */
function sweepUnreliableIdentifiers(
  left: DeclaredRoster,
  right: DeclaredRoster,
  openLeft: Set<string>,
  openRight: Set<string>,
  unresolved: UnresolvedRecord[],
): void {
  if (!isDeclared(left.identifierSpace) || !isDeclared(right.identifierSpace)) return;
  if (left.identifierSpace !== right.identifierSpace) return;

  const byValue = (records: readonly SourcePlayerRecord[]): ReadonlyMap<string, SourcePlayerRecord[]> => {
    const map = new Map<string, SourcePlayerRecord[]>();
    for (const record of records) {
      if (!isDeclared(record.identifier)) continue;
      const value = record.identifier.trim();
      const bucket = map.get(value) ?? [];
      bucket.push(record);
      map.set(value, bucket);
    }
    return map;
  };

  const leftByValue = byValue(left.records);
  const rightByValue = byValue(right.records);

  for (const [value, leftRows] of leftByValue) {
    const rightRows = rightByValue.get(value);
    if (rightRows === undefined) continue;

    // La ragione peggiore vince: un conflitto vero conta più di
    // «non ho potuto controincrociare», perché dice qualcosa di più forte.
    let reason: UnresolvedReason | null = null;
    for (const leftRecord of leftRows) {
      for (const rightRecord of rightRows) {
        const agreement = identifierAgreement(
          leftRecord,
          rightRecord,
          left.identifierSpace,
          right.identifierSpace,
        );
        if (agreement === "identifier_name_conflict") reason = "identifier_name_conflict";
        else if (agreement === "identifier_without_comparable_name" && reason === null) {
          reason = "identifier_without_comparable_name";
        }
      }
    }
    if (reason === null) continue;

    const detail =
      reason === "identifier_name_conflict"
        ? "questo identificativo non regge il controincrocio sui nomi: su almeno una coppia che lo porta " +
          "i nomi non si sostengono, e la spiegazione più probabile è uno spazio dichiarato male o un " +
          "identificativo riusato. Esce dal giro ogni riga che lo porta, su entrambi i lati — anche " +
          "quelle che quel conflitto non l'avevano: un identificativo che sbaglia una volta non merita " +
          "una targa «certo» sulle altre."
        : "questo identificativo non si può controincrociare: almeno una riga che lo porta non ha un nome " +
          "confrontabile, e un identificativo che nessun nome sostiene non basta da solo. Esce dal giro " +
          "ogni riga che lo porta, su entrambi i lati.";

    const leftRefs = sortedRefs(leftRows.map((row) => row.ref));
    const rightRefs = sortedRefs(rightRows.map((row) => row.ref));
    for (const row of leftRows) {
      if (!openLeft.delete(row.ref)) continue;
      unresolved.push({ side: "left", ref: row.ref, reason, counterparts: rightRefs, detail });
    }
    for (const row of rightRows) {
      if (!openRight.delete(row.ref)) continue;
      unresolved.push({ side: "right", ref: row.ref, reason, counterparts: leftRefs, detail });
    }
  }
}

/**
 * Tutte le coppie che un criterio ammette, sulle liste INTERE. Deliberatamente
 * non filtra sugli insiemi ancora aperti: è il conto su questo elenco che
 * decide l'esclusività — §«L'ESCLUSIVITÀ SI MISURA SUL GRUPPO DI PARTENZA».
 */
function edgesForCriterion(
  criterion: MatchCriterion,
  left: DeclaredRoster,
  right: DeclaredRoster,
): readonly Edge[] {
  const edges: Edge[] = [];
  for (const leftRecord of [...left.records].sort((a, b) => (a.ref < b.ref ? -1 : 1))) {
    for (const rightRecord of [...right.records].sort((a, b) => (a.ref < b.ref ? -1 : 1))) {
      const agreement = teamAgreementOf(
        leftRecord.teamKey,
        rightRecord.teamKey,
        left.teamVocabulary,
        right.teamVocabulary,
      );
      if (criterion.teamAgreement !== null && criterion.teamAgreement !== agreement) continue;
      if (
        !nameEvidenceHolds(
          criterion.nameEvidence,
          leftRecord,
          rightRecord,
          left.identifierSpace,
          right.identifierSpace,
        )
      ) {
        continue;
      }
      edges.push({
        leftRef: leftRecord.ref,
        rightRef: rightRecord.ref,
        teamAgreement: agreement,
        // Solo quando le due righe dichiarano la STESSA squadra c'è una chiave
        // condivisa da nominare: «un'altra squadra» sono due chiavi, e
        // «non confrontabile» non è una chiave.
        teamKey:
          agreement === "same_declared_team" && isDeclared(leftRecord.teamKey) ? leftRecord.teamKey : null,
      });
    }
  }
  return edges;
}

function groupEdges(
  edges: readonly Edge[],
  key: (edge: Edge) => string,
): ReadonlyMap<string, readonly Edge[]> {
  const map = new Map<string, Edge[]>();
  for (const edge of edges) {
    const bucket = map.get(key(edge)) ?? [];
    bucket.push(edge);
    map.set(key(edge), bucket);
  }
  return map;
}

/**
 * I CONTI DELL'INSIEME, a esito chiuso — §«L'ESCLUSIVITÀ NON PROVA L'UNICITÀ
 * NEL MONDO».
 *
 * Una sola passata su ciascuna lista costruisce due tabelle per lato: quante
 * righe dichiarano ciascuna squadra, e quante di quelle non compaiono in
 * NESSUN abbinamento. «Nessun abbinamento» è deliberatamente grossolano —
 * ambigua, non risolta o rimasta fuori contano uguale — perché la domanda a
 * cui questi numeri rispondono è «quanto di questo insieme è rimasto
 * scoperto», non «perché».
 *
 * I numeri sono DERIVATI dagli stessi elenchi che l'esito porta, quindi non
 * possono discordarne: si calcolano qui una volta sola, dagli abbinamenti
 * definitivi, e un test pinna l'uguaglianza fra i due modi di contarli.
 */
function cohortCounter(
  roster: DeclaredRoster,
  matchedRefs: ReadonlySet<string>,
): (key: string | null) => { readonly records: number; readonly withoutMatch: number } {
  const records = new Map<string, number>();
  const withoutMatch = new Map<string, number>();
  let wholeWithoutMatch = 0;
  for (const record of roster.records) {
    const unmatched = !matchedRefs.has(record.ref);
    if (unmatched) wholeWithoutMatch += 1;
    if (!isDeclared(record.teamKey)) continue;
    records.set(record.teamKey, (records.get(record.teamKey) ?? 0) + 1);
    if (unmatched) withoutMatch.set(record.teamKey, (withoutMatch.get(record.teamKey) ?? 0) + 1);
  }
  return (key) =>
    key === null
      ? { records: roster.records.length, withoutMatch: wholeWithoutMatch }
      : { records: records.get(key) ?? 0, withoutMatch: withoutMatch.get(key) ?? 0 };
}

export function resolveIdentities(left: DeclaredRoster, right: DeclaredRoster): IdentityResolution {
  assertDeclaredProvenance(left, "sinistra");
  assertDeclaredProvenance(right, "destra");

  const leftIndex = indexByRef(left.records);
  const rightIndex = indexByRef(right.records);
  const openLeft = new Set(left.records.map((record) => record.ref));
  const openRight = new Set(right.records.map((record) => record.ref));

  // Gli abbinamenti si raccolgono SENZA i conti dell'insieme, e i conti si
  // attaccano alla fine: `leftWithoutMatch`/`rightWithoutMatch` guardano
  // l'esito intero, che a metà giro non esiste ancora. Calcolarli qui dentro
  // vorrebbe dire contare su un mondo che sta ancora cambiando.
  const matches: MatchWithoutCohort[] = [];
  const ambiguous: AmbiguousRecord[] = [];
  const unresolved: UnresolvedRecord[] = [];

  sweepUnreliableIdentifiers(left, right, openLeft, openRight, unresolved);

  for (const criterion of MATCH_CRITERIA) {
    // I conti si fanno QUI, sulle liste intere: `byLeftAll`/`byRightAll` sono
    // il gruppo di partenza, non il residuo. Vedi il §in testa al file.
    const allEdges = edgesForCriterion(criterion, left, right);
    if (allEdges.length === 0) continue;
    const byLeftAll = groupEdges(allEdges, (edge) => edge.leftRef);
    const byRightAll = groupEdges(allEdges, (edge) => edge.rightRef);

    const exclusive = (edge: Edge): boolean =>
      (byLeftAll.get(edge.leftRef) ?? []).length === 1 && (byRightAll.get(edge.rightRef) ?? []).length === 1;

    // Accettazione: la coppia è esclusiva sul gruppo di partenza E entrambe le
    // righe sono ancora aperte. Nessun ordinamento fa da spareggio, e nessun
    // ramo qui sotto sceglie fra candidati.
    const accepted: Edge[] = [];
    for (const edge of allEdges) {
      if (!openLeft.has(edge.leftRef) || !openRight.has(edge.rightRef)) continue;
      if (!exclusive(edge)) continue;
      accepted.push(edge);
    }
    for (const edge of accepted) {
      openLeft.delete(edge.leftRef);
      openRight.delete(edge.rightRef);
      matches.push({
        leftRef: edge.leftRef,
        rightRef: edge.rightRef,
        criterion: criterion.code,
        rank: criterion.rank,
        certainty: criterion.certainty,
        nameEvidence: criterion.nameEvidence,
        teamAgreement: edge.teamAgreement,
        evidence: criterion.evidence,
        provenance: { left: left.provenance, right: right.provenance },
        // L'insieme lo dichiara il CRITERIO, non la coppia: un abbinamento per
        // identificativo può capitare fra due righe che dichiarano la stessa
        // squadra, ma il rango 1 non ha mai ristretto i candidati a quella
        // rosa, e scrivere `declared_team` lì sarebbe un conto giusto su un
        // insieme sbagliato.
        cohortKey: criterion.teamAgreement === "same_declared_team" ? edge.teamKey : null,
      });
    }

    // Ambiguità, sempre sul gruppo di partenza. Una riga con più di un
    // candidato è ambigua anche se oggi ne è rimasto uno solo aperto; una riga
    // con un solo candidato conteso da altri è ambigua per il verso opposto.
    // Resta fuori — e prosegue ai criteri più deboli — solo la riga che a
    // questo criterio era esclusiva ma la cui controparte era già stata
    // agganciata da un criterio più forte: quella non è ambigua, ha solo perso
    // il suo unico candidato.
    const declareAmbiguous = (
      side: Side,
      open: Set<string>,
      own: ReadonlyMap<string, readonly Edge[]>,
      other: ReadonlyMap<string, readonly Edge[]>,
      otherOpen: ReadonlySet<string>,
      counterpartOf: (edge: Edge) => string,
    ): void => {
      for (const [ref, edges] of own) {
        if (!open.has(ref)) continue;
        const counterparts = edges.map(counterpartOf);
        const contested =
          edges.length === 1 && counterparts.some((c) => (other.get(c) ?? []).length > 1);
        if (edges.length <= 1 && !contested) continue;
        open.delete(ref);
        ambiguous.push({
          side,
          ref,
          criterion: criterion.code,
          rank: criterion.rank,
          reason: contested ? "contested_candidate" : "multiple_candidates",
          candidates: sortedRefs(counterparts),
          resolvedElsewhere: sortedRefs(counterparts.filter((c) => !otherOpen.has(c))),
          detail: contested
            ? "un solo candidato, ma quel candidato è conteso da più righe dell'altra lista: abbinare " +
              "significherebbe scegliere quale delle pretendenti è quella giusta."
            : "più di un candidato a questo criterio, contati sulla lista intera. Non si sceglie il " +
              "primo; non si sceglie nemmeno l'unico rimasto, perché essere rimasti soli non è essere " +
              "distinguibili; e nessun criterio più debole viene provato dopo.",
        });
      }
    };
    const openRightSnapshot = new Set(openRight);
    const openLeftSnapshot = new Set(openLeft);
    declareAmbiguous("left", openLeft, byLeftAll, byRightAll, openRightSnapshot, (edge) => edge.rightRef);
    declareAmbiguous("right", openRight, byRightAll, byLeftAll, openLeftSnapshot, (edge) => edge.leftRef);
  }

  const leftover = (side: Side, refs: ReadonlySet<string>, index: ReadonlyMap<string, SourcePlayerRecord>) => {
    for (const ref of refs) {
      const record = index.get(ref);
      const comparable = record !== undefined && isComparableName(normalizedTokens(record));
      unresolved.push({
        side,
        ref,
        reason: comparable ? "no_candidate" : "name_not_comparable",
        counterparts: [],
        detail: comparable
          ? "nessun criterio ha prodotto un candidato nell'altra lista. È un buco visibile, non un " +
            "abbinamento debole: a valle si decide che farne."
          : "il nome non lascia niente di confrontabile dopo la normalizzazione — vuoto, oppure fatto di " +
            "sole iniziali, che non identificano nessuno — e non c'è un identificativo che lo supplisca.",
      });
    }
  };
  leftover("left", openLeft, leftIndex);
  leftover("right", openRight, rightIndex);

  const byRef = (a: { readonly ref: string }, b: { readonly ref: string }): number =>
    a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  const bySide = (a: { readonly side: Side }, b: { readonly side: Side }): number =>
    a.side === b.side ? 0 : a.side === "left" ? -1 : 1;

  // I conti dell'insieme, adesso che l'esito non cambia più.
  const leftCounts = cohortCounter(left, new Set(matches.map((match) => match.leftRef)));
  const rightCounts = cohortCounter(right, new Set(matches.map((match) => match.rightRef)));
  const withCohort: readonly IdentityMatch[] = matches.map(({ cohortKey, ...match }) => {
    const leftSide = leftCounts(cohortKey);
    const rightSide = rightCounts(cohortKey);
    return {
      ...match,
      cohort: {
        scope: cohortKey === null ? "whole_list" : "declared_team",
        key: cohortKey,
        leftRecords: leftSide.records,
        rightRecords: rightSide.records,
        leftWithoutMatch: leftSide.withoutMatch,
        rightWithoutMatch: rightSide.withoutMatch,
      },
    };
  });

  return {
    left: rosterHandle(left),
    right: rosterHandle(right),
    matches: [...withCohort].sort((a, b) =>
      a.leftRef < b.leftRef ? -1 : a.leftRef > b.leftRef ? 1 : a.rightRef < b.rightRef ? -1 : 1,
    ),
    ambiguous: [...ambiguous].sort((a, b) => bySide(a, b) || byRef(a, b)),
    unresolved: [...unresolved].sort((a, b) => bySide(a, b) || byRef(a, b)),
  };
}
