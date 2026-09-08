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
  normalizedName,
  normalizedTokens,
  teamAgreementOf,
} from "./identityCriteria.js";

export type Side = "left" | "right";

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
  /** I candidati, per chiave, ordinati: un elenco, mai una scelta. */
  readonly candidates: readonly string[];
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
}

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
  const leftName = normalizedName(left);
  const rightName = normalizedName(right);
  if (leftName.length === 0 || rightName.length === 0) return false;
  if (evidence === "exact_name") return leftName === rightName;
  if (leftName === rightName) return false;
  return abbreviationCompatible(normalizedTokens(left), normalizedTokens(right));
}

/**
 * IL PASSAGGIO ZERO — i conflitti d'identificativo, prima di ogni abbinamento.
 *
 * Due righe che portano lo stesso identificativo nello stesso spazio
 * dichiarato ma nomi che non si sostengono sono una premessa rotta, non una
 * coppia difficile: o lo spazio non è quello che qualcuno ha dichiarato, o
 * l'identificativo è stato riusato. In entrambi i casi l'unica risposta
 * onesta è togliere ENTRAMBE le righe dal giro, prima che un criterio più
 * debole le agganci ad altro sulla base di una grafia — cioè prima che il
 * dubbio più grave venga risolto dal segnale più leggero.
 */
function sweepIdentifierConflicts(
  left: DeclaredRoster,
  right: DeclaredRoster,
  openLeft: Set<string>,
  openRight: Set<string>,
  unresolved: UnresolvedRecord[],
): void {
  const leftConflicts = new Map<string, { reason: UnresolvedReason; counterparts: Set<string> }>();
  const rightConflicts = new Map<string, { reason: UnresolvedReason; counterparts: Set<string> }>();

  for (const leftRecord of left.records) {
    for (const rightRecord of right.records) {
      const agreement = identifierAgreement(
        leftRecord,
        rightRecord,
        left.identifierSpace,
        right.identifierSpace,
      );
      if (agreement !== "identifier_name_conflict" && agreement !== "identifier_without_comparable_name") {
        continue;
      }
      const reason: UnresolvedReason = agreement;
      const l = leftConflicts.get(leftRecord.ref) ?? { reason, counterparts: new Set<string>() };
      l.counterparts.add(rightRecord.ref);
      leftConflicts.set(leftRecord.ref, l);
      const r = rightConflicts.get(rightRecord.ref) ?? { reason, counterparts: new Set<string>() };
      r.counterparts.add(leftRecord.ref);
      rightConflicts.set(rightRecord.ref, r);
    }
  }

  const detailOf = (reason: UnresolvedReason): string =>
    reason === "identifier_name_conflict"
      ? "stesso identificativo nello stesso spazio dichiarato, ma i nomi non si sostengono: più " +
        "probabilmente uno spazio dichiarato male o un identificativo riusato che due grafie lontane. " +
        "Nessuna delle due righe viene agganciata, qui o altrove."
      : "stesso identificativo nello stesso spazio dichiarato, ma almeno una delle due righe non ha un " +
        "nome confrontabile: l'identificativo non si può controincrociare, e da solo non basta.";

  for (const [ref, entry] of leftConflicts) {
    openLeft.delete(ref);
    unresolved.push({
      side: "left",
      ref,
      reason: entry.reason,
      counterparts: sortedRefs(entry.counterparts),
      detail: detailOf(entry.reason),
    });
  }
  for (const [ref, entry] of rightConflicts) {
    openRight.delete(ref);
    unresolved.push({
      side: "right",
      ref,
      reason: entry.reason,
      counterparts: sortedRefs(entry.counterparts),
      detail: detailOf(entry.reason),
    });
  }
}

function edgesForCriterion(
  criterion: MatchCriterion,
  left: DeclaredRoster,
  right: DeclaredRoster,
  leftIndex: ReadonlyMap<string, SourcePlayerRecord>,
  rightIndex: ReadonlyMap<string, SourcePlayerRecord>,
  openLeft: ReadonlySet<string>,
  openRight: ReadonlySet<string>,
): readonly Edge[] {
  const edges: Edge[] = [];
  for (const leftRef of sortedRefs(openLeft)) {
    const leftRecord = leftIndex.get(leftRef);
    if (leftRecord === undefined) continue;
    for (const rightRef of sortedRefs(openRight)) {
      const rightRecord = rightIndex.get(rightRef);
      if (rightRecord === undefined) continue;
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
      edges.push({ leftRef, rightRef, teamAgreement: agreement });
    }
  }
  return edges;
}

/**
 * ABBINA DUE LISTE DICHIARATE. Non legge dati, non scrive niente, non conosce
 * le fonti: conosce solo ciò che le due dichiarazioni portano con sé.
 *
 * Le due liste possono venire da qualunque coppia di fonti — listone e
 * piattaforma, voti e piattaforma, probabili e rosa reale: il modulo non ha
 * un'opinione su quali siano, e non deve averla. Ciò che cambia fra una coppia
 * e l'altra è quanto è forte l'evidenza disponibile, e quella la dichiara chi
 * costruisce le liste (identificativi? vocabolario di squadra condiviso?), non
 * questo file.
 */
export function resolveIdentities(left: DeclaredRoster, right: DeclaredRoster): IdentityResolution {
  assertDeclaredProvenance(left, "sinistra");
  assertDeclaredProvenance(right, "destra");

  const leftIndex = indexByRef(left.records);
  const rightIndex = indexByRef(right.records);
  const openLeft = new Set(left.records.map((record) => record.ref));
  const openRight = new Set(right.records.map((record) => record.ref));

  const matches: IdentityMatch[] = [];
  const ambiguous: AmbiguousRecord[] = [];
  const unresolved: UnresolvedRecord[] = [];

  sweepIdentifierConflicts(left, right, openLeft, openRight, unresolved);

  for (const criterion of MATCH_CRITERIA) {
    const edges = edgesForCriterion(criterion, left, right, leftIndex, rightIndex, openLeft, openRight);
    if (edges.length === 0) continue;

    const byLeft = new Map<string, Edge[]>();
    const byRight = new Map<string, Edge[]>();
    for (const edge of edges) {
      const l = byLeft.get(edge.leftRef) ?? [];
      l.push(edge);
      byLeft.set(edge.leftRef, l);
      const r = byRight.get(edge.rightRef) ?? [];
      r.push(edge);
      byRight.set(edge.rightRef, r);
    }

    // Accettazione: solo le coppie esclusive da entrambi i lati. Nessun
    // ordinamento fa da spareggio, e nessun ramo qui sotto sceglie fra
    // candidati — dove i candidati sono più d'uno si scrive un'ambiguità.
    const acceptedLeft = new Set<string>();
    const acceptedRight = new Set<string>();
    for (const edge of edges) {
      if ((byLeft.get(edge.leftRef) ?? []).length !== 1) continue;
      if ((byRight.get(edge.rightRef) ?? []).length !== 1) continue;
      acceptedLeft.add(edge.leftRef);
      acceptedRight.add(edge.rightRef);
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
      });
    }

    for (const [ref, own] of byLeft) {
      if (acceptedLeft.has(ref)) {
        openLeft.delete(ref);
        continue;
      }
      const contested = own.length === 1;
      ambiguous.push({
        side: "left",
        ref,
        criterion: criterion.code,
        rank: criterion.rank,
        reason: contested ? "contested_candidate" : "multiple_candidates",
        candidates: sortedRefs(own.map((edge) => edge.rightRef)),
        detail: contested
          ? "un solo candidato, ma quel candidato è conteso da più righe di questa lista: abbinare " +
            "significherebbe scegliere quale delle pretendenti è quella giusta."
          : "più di un candidato a questo criterio. Non si sceglie il primo, e nessun criterio più " +
            "debole viene provato dopo: uno più debole potrebbe produrre un vincitore, non riconoscerlo.",
      });
      openLeft.delete(ref);
    }
    for (const [ref, own] of byRight) {
      if (acceptedRight.has(ref)) {
        openRight.delete(ref);
        continue;
      }
      const contested = own.length === 1;
      ambiguous.push({
        side: "right",
        ref,
        criterion: criterion.code,
        rank: criterion.rank,
        reason: contested ? "contested_candidate" : "multiple_candidates",
        candidates: sortedRefs(own.map((edge) => edge.leftRef)),
        detail: contested
          ? "un solo candidato, ma quel candidato è conteso da più righe dell'altra lista: abbinare " +
            "significherebbe scegliere quale delle pretendenti è quella giusta."
          : "più di un candidato a questo criterio. Non si sceglie il primo, e nessun criterio più " +
            "debole viene provato dopo: uno più debole potrebbe produrre un vincitore, non riconoscerlo.",
      });
      openRight.delete(ref);
    }
  }

  const leftover = (side: Side, refs: ReadonlySet<string>, index: ReadonlyMap<string, SourcePlayerRecord>) => {
    for (const ref of refs) {
      const record = index.get(ref);
      const comparable = record !== undefined && normalizedName(record).length > 0;
      unresolved.push({
        side,
        ref,
        reason: comparable ? "no_candidate" : "name_not_comparable",
        counterparts: [],
        detail: comparable
          ? "nessun criterio ha prodotto un candidato nell'altra lista. È un buco visibile, non un " +
            "abbinamento debole: a valle si decide che farne."
          : "il nome non lascia niente di confrontabile dopo la normalizzazione, e non c'è un " +
            "identificativo che lo supplisca.",
      });
    }
  };
  leftover("left", openLeft, leftIndex);
  leftover("right", openRight, rightIndex);

  const byRef = (a: { readonly ref: string }, b: { readonly ref: string }): number =>
    a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  const bySide = (a: { readonly side: Side }, b: { readonly side: Side }): number =>
    a.side === b.side ? 0 : a.side === "left" ? -1 : 1;

  return {
    left: rosterHandle(left),
    right: rosterHandle(right),
    matches: [...matches].sort((a, b) =>
      a.leftRef < b.leftRef ? -1 : a.leftRef > b.leftRef ? 1 : a.rightRef < b.rightRef ? -1 : 1,
    ),
    ambiguous: [...ambiguous].sort((a, b) => bySide(a, b) || byRef(a, b)),
    unresolved: [...unresolved].sort((a, b) => bySide(a, b) || byRef(a, b)),
  };
}
