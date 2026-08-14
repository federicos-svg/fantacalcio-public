// FINESTRA — la parte deterministica della riga 2 di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §8 («tensione, cliff, finestra,
// insieme eleggibile»), driver di §4.1 e §4.2 («IL TUO TURNO tra 3 chiamate —
// a rischio prima: Lookman, Zortea»). Puro, deterministico, engine-only.
//
// COSA C'È: due FATTI.
//  1. quante chiamate mancano al proprio turno — pura aritmetica sul giro
//     fisso di LEAGUE_RULES.md §3-bis (`nomination_order: FIXED_ROTATION`);
//  2. quali dei propri obiettivi hanno, ADESSO, almeno un rivale che per
//     vincolo duro potrebbe portarseli via (slot aperto + max bid vero
//     all'ancora corrente).
//
// COSA NON C'È, di proposito: la «finestra stimata» come PREVISIONE («spariscono
// fra 4-6 chiamate»). Stimare quante chiamate resiste un profilo richiede un
// tasso di consumo del mercato che si può misurare solo su aste concluse: è la
// stessa classe di oggetti che il design ha tolto dal loop live (§3, «il
// predittore di prezzo parametrico non entra nel loop live... richiederebbe un
// prezzo predetto senza ≥2 post-aste») e che §D9 vieta come feature imputata.
// «A rischio» qui significa quindi «esiste un rivale che PUÒ prenderlo», non
// «probabilmente lo perdi»: è un insieme di fatti, non una probabilità.

import { type AuctionState, type Role } from "./types.js";
import { type AnchorBook, type MeasuredInflation, currentAnchor } from "./anchors.js";
import { competitorSet } from "./competitors.js";

export interface NominationWindow {
  readonly selfId: string;
  readonly nextNominatorId: string;
  /** 0 quando la prossima chiamata è la propria. */
  readonly callsUntilNextTurn: number;
  /** Chi chiama prima di me, in ordine di giro. Vuoto se tocca a me adesso. */
  readonly nominatorsBefore: readonly string[];
}

/**
 * Quante chiamate mancano al proprio turno nel giro fisso, e di chi sono.
 *
 * Fail-closed sull'ordine (throw, come `anchorBook` sul listino): un giro
 * vuoto, con duplicati o che non contiene una delle due squadre non è un dato
 * mancante da mostrare come `n/d`, è un ordine di chiamata rotto — e da un
 * ordine rotto non si deve poter derivare nessun numero.
 */
export function nominationWindow(
  order: readonly string[],
  nextNominatorId: string,
  selfId: string,
): NominationWindow {
  if (order.length === 0) throw new Error("nominationWindow: empty nomination order");
  if (new Set(order).size !== order.length) {
    throw new Error("nominationWindow: duplicate fantaTeamId in nomination order");
  }
  const nextIndex = order.indexOf(nextNominatorId);
  if (nextIndex === -1) {
    throw new Error(`nominationWindow: nextNominatorId "${nextNominatorId}" not in order`);
  }
  const selfIndex = order.indexOf(selfId);
  if (selfIndex === -1) {
    throw new Error(`nominationWindow: selfId "${selfId}" not in order`);
  }

  const callsUntilNextTurn = (selfIndex - nextIndex + order.length) % order.length;
  const nominatorsBefore: string[] = [];
  for (let i = 0; i < callsUntilNextTurn; i++) {
    nominatorsBefore.push(order[(nextIndex + i) % order.length]!);
  }
  return { selfId, nextNominatorId, callsUntilNextTurn, nominatorsBefore };
}

/**
 * Un obiettivo che, per soli vincoli duri, qualcun altro può portarsi via.
 * Nessuna probabilità, nessuna previsione: un conteggio di rivali eleggibili.
 */
export interface TargetAtRisk {
  readonly playerId: string;
  readonly role: Role;
  readonly correctedAnchor: number;
  readonly eligibleCompetitors: number;
}

export interface TargetsAtRiskInput {
  readonly targetPlayerIds: readonly string[];
  readonly book: AnchorBook;
  readonly state: AuctionState;
  readonly inflation: MeasuredInflation;
  readonly selfId?: string;
}

/**
 * Gli obiettivi ancora sul mercato per cui esiste almeno un rivale eleggibile
 * all'ancora corrente. Restano fuori: gli obiettivi senza ancora (niente su cui
 * misurare la soglia), quelli già assegnati o riconfermati, e quelli che
 * nessun rivale può comprare — questi ultimi non sono «a basso rischio», sono
 * fuori portata di chiunque altro per vincolo duro, il che è un fatto diverso.
 *
 * Ordinamento totale e stabile: più rivali prima, poi ancora corrente più
 * alta, poi playerId — così due chiamate sullo stesso stato danno la stessa
 * lista nello stesso ordine.
 */
export function targetsAtRisk(input: TargetsAtRiskInput): readonly TargetAtRisk[] {
  const { targetPlayerIds, book, state, inflation, selfId } = input;
  const purchased = new Set(state.purchasedPlayerIds);
  const out: TargetAtRisk[] = [];
  const seen = new Set<string>();

  for (const playerId of targetPlayerIds) {
    if (seen.has(playerId)) continue;
    seen.add(playerId);
    if (purchased.has(playerId)) continue;
    const anchor = currentAnchor(playerId, book, inflation);
    if (anchor === null) continue;
    const set = competitorSet(state, anchor.role, anchor.correctedAnchor, selfId);
    if (set.eligibleCount === 0) continue;
    out.push({
      playerId,
      role: anchor.role,
      correctedAnchor: anchor.correctedAnchor,
      eligibleCompetitors: set.eligibleCount,
    });
  }

  return out.sort(
    (a, b) =>
      b.eligibleCompetitors - a.eligibleCompetitors ||
      b.correctedAnchor - a.correctedAnchor ||
      a.playerId.localeCompare(b.playerId),
  );
}
