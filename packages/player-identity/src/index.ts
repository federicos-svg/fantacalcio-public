// WP-6a — identità del giocatore fra le fonti. Superficie pubblica del
// pacchetto: la porta (`declareRoster`), i criteri con il loro ordine, e il
// risolutore. Chi importa qualcosa che non è riesportato qui sta usando un
// dettaglio interno, e lo sta facendo apposta.
export {
  type DeclaredRoster,
  type RosterDeclaration,
  type RosterHandle,
  type SourcePlayerRecord,
  declareRoster,
  rosterHandle,
} from "./declaredRoster.js";
export {
  MATCH_CRITERIA,
  type Certainty,
  type IdentifierAgreement,
  type MatchCriterion,
  type MatchCriterionCode,
  type NameCoverage,
  type NameEvidence,
  type TeamAgreement,
  abbreviationCompatible,
  identifierAgreement,
  nameCoverage,
  normalizedName,
  normalizedTokens,
  teamAgreementOf,
} from "./identityCriteria.js";
export {
  type AmbiguityReason,
  type AmbiguousRecord,
  type IdentityMatch,
  type IdentityResolution,
  type Side,
  type UnresolvedRecord,
  type UnresolvedReason,
  resolveIdentities,
} from "./resolveIdentities.js";
