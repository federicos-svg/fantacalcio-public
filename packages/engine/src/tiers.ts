// FASCE D'ASTA — la fascia del giocatore chiamato e la contabilità che le sta
// intorno. Puro, deterministico, engine-only: nessuna UI, nessun dato reale,
// nessun I/O, nessun gate promosso.
//
// IL CONCETTO, NELLE PAROLE DI PICO (docs/DECISIONS.md §"Eccezioni operative
// scritte", record 2026-08-16). Per ogni ruolo il numero di FASCE è il numero
// di giocatori che servono in rosa, e ogni fascia contiene tanti giocatori
// quante sono le squadre al tavolo: «i centrocampisti necessari per completare
// la rosa sono nove, quindi mettendo in ordine di appetibilità i giocatori
// avremo 8 giocatori di prima fascia (ipoteticamente 1 per squadra), 8 di
// seconda fascia e via discorrendo». Con `ROSTER_REQUIREMENTS` (P 3, D 9, C 9,
// A 7) e otto squadre: P 3 fasce da 24, D 9 da 72, C 9 da 72, A 7 da 56. I
// giocatori oltre l'ultima fascia sono FONDO, senza fascia — e col listone
// vero (~532 righe) il fondo è la maggioranza, non un caso limite.
//
// PERCHÉ QUESTA «FASCIA» NON È QUELLA CHE cliff.ts E livePlan.ts RIFIUTANO.
// Quei due moduli escludono le fasce perché «una fascia è un raggruppamento
// che il sistema sceglierebbe da sé» — il peso nascosto vietato da
// docs/DECISIONS.md §D9 — e livePlan.ts scrive già la condizione che le
// riammette: «Se Owner dichiarerà le sue fasce, entreranno come input
// dichiarato, non come invenzione». È esattamente questo modulo. I confini
// qui non li sceglie il motore: sono tre ingredienti, tutti esterni.
//   1. QUANTE fasce → `ROSTER_REQUIREMENTS[role]`, costante di regolamento
//      (docs/data/LEAGUE_RULES.md), non una soglia scelta stasera;
//   2. QUANTO È LARGA una fascia → il numero di squadre al tavolo, censimento
//      misurato, passato dal chiamante (`teamsCount`) e riverificato contro
//      lo stato derivato;
//   3. IN CHE ORDINE → un ordinamento INIETTATO dal chiamante, con la propria
//      provenienza dichiarata. Questo file non calcola appetibilità, non ne
//      cabla i valori e non ne conosce la formula.
// Nessun `CLIFF_GAP_RATIO` locale, nessuna soglia inventata: per questo il
// risultato non porta un `RatificationStatus` (declaredValues.ts) — non c'è
// nessuna scelta del motore da far ratificare.
//
// L'ORDINAMENTO È INPUT, MAI DATO CABLATO. La decisione di Pico del 2026-08-16
// nomina l'indice di appetibilità del progetto (`packages/appeal-index/`) come
// ordinamento; i suoi VALORI sono dato privato e il repository pubblico resta a
// sole fixture sintetiche. Vale quindi lo stesso idioma già usato per le
// eccezioni del guardrail (`scripts/guardrails-core.mjs`): la LOGICA vive qui,
// pubblica e testata; l'ELENCO lo inietta il repository che possiede il dato.
//
// COSA NON C'È, di proposito, e non deve mai entrare (il divieto NON è stato
// revocato: il record 2026-08-16 autorizza il solo ordinamento):
//  - nessun PREZZO PREDETTO e nessuna banda: al posto del «prezzo atteso» si
//    riportano i prezzi DAVVERO PAGATI stasera per quel ruolo e quella fascia
//    — registro dell'asta, non previsione;
//  - nessun PUNTEGGIO COMPOSITO e nessun RANKING DI INTENSITÀ fra avversari:
//    si riportano i fatti contabili per avversario, in ordine di id, e chi li
//    mostra decide come ordinarli;
//  - nessuna PROBABILITÀ, nessuna lettura psicologica, nessun `value` /
//    `fair_to_me` / `target_band`;
//  - nessun CONSIGLIO: non esiste un campo che dica cosa fare. La guardia che
//    lo tiene vero è in packages/engine/tests/tiers.test.ts §"non può
//    produrre un consiglio" (insieme di chiavi esatto, a ogni livello).
//
// PROVENIENZA ATTACCATA AL DATO (condizione vincolante 1 del record). Ogni
// risultato porta `provenance` — sorgente, versione di ricetta, criterio di
// rottura dei pareggi — oppure `null`. Una fascia senza provenienza non è
// utilizzabile, e `null` non viene mai sostituito da un valore inventato
// (condizione 2): ordinamento assente, ruolo non ordinato o giocatore non
// ordinato producono un «non lo so» esplicito e distinto, mai una fascia
// dedotta.
//
// ─── IL CONTRATTO DI INIEZIONE (per il repository privato) ───────────────────
//
// Il privato costruisce il libro UNA volta, al caricamento del listone, e poi
// lo passa a ogni chiamata:
//
//   const ordering: AppealOrdering = {
//     provenance: {
//       source: "appeal-index-serving-deposit",       // da dove viene l'ordine
//       recipe: APPEAL_INDEX_RECIPE.recipeVersion,    // es. "APPEAL-INDEX-RECIPE@1.3.0"
//       tieBreak: APPEAL_ORDER_TIE_BREAK,             // se ordina con buildRoleAppealOrder()
//     },
//     roles: ROLES.map((role) =>
//       buildRoleAppealOrder(role, rowsOfRole(role).map((r) => ({
//         playerId: r.playerId,                       // la STESSA identità dell'event log
//         score: r.appealIndex?.score ?? null,        // `null` = nessun verdetto
//       }))),
//     ),
//   };
//   const book = tierBook(ordering, { teamsCount: leagueTeams.length, pool });
//
// Regole del contratto, tutte verificate qui e nessuna lasciata alla buona fede:
//  a. IDENTITÀ. `playerId` deve essere la stessa chiave che compare in
//     `PurchaseEvent.playerId` e in `state.purchasedPlayerIds`. Se il listone
//     privato usa un'altra chiave, la traduzione avviene PRIMA di costruire
//     l'ordinamento: qui non c'è nessuna risoluzione di identità (quella vive
//     in packages/identity-policy/ e identityName.ts).
//  b. PROVENIENZA COMPLETA. `source`, `recipe` e `tieBreak` non vuote, sempre.
//     `recipe` è la versione della ricetta che ha prodotto l'ordine, copiata
//     dal dato servito — mai scritta a mano qui e mai dedotta.
//  c. NESSUN VERDETTO ⇒ NESSUNA POSIZIONE. Una riga con `score === null` (o
//     non finito) esce dall'ordinamento: il giocatore risulta `unranked`, non
//     ultimo. Riempirla con uno zero o con una mediana sarebbe l'invenzione
//     che la condizione 2 vieta.
//  d. COERENZA. `tierBook()` LANCIA su duplicati, provenienza incompleta,
//     ruolo dichiarato due volte e — se gli si passa il `pool` — su giocatori
//     che non sono nel listone o che vi compaiono con un altro ruolo. Postura
//     fail-closed identica a `anchorBook()`/`reduce()`: un ordinamento
//     incoerente non produce fasce silenziosamente sbagliate. Il controllo
//     senza lancio è `validateAppealOrdering()`.
//  e. PARZIALITÀ AMMESSA. `roles` può contenere meno di quattro ruoli, e un
//     ruolo può ordinare meno giocatori di quanti ne abbia il listone: sono
//     casi normali, distinti fra loro nel risultato (`role-not-ordered` vs
//     `unranked`) e mai mascherati.
//  f. REVOCA (condizione 4 del record). Revocata l'autorizzazione, il privato
//     costruisce lo stesso `AppealOrdering` dalla quotazione ufficiale con
//     un'altra `provenance`: questo file non cambia di una riga.
//
// DETERMINISMO ASSOLUTO. Nessun orologio, nessun `Math.random`, nessun `Intl`,
// nessuna formattazione dipendente dalla locale, nessuna iterazione il cui
// esito dipenda dall'ordine di inserimento di una struttura non ordinata: le
// liste in uscita sono sempre riordinate con un ordine TOTALE esplicito. I
// confronti fra id usano `<`/`>` sulle code unit UTF-16 e non
// `String.prototype.localeCompare` (che consulta la locale di default del
// runtime): è una deliberata divergenza da competitors.ts, dove `localeCompare`
// è rimasto, e vale la pena solo perché qui l'ordine è parte del contratto.
// Stesso stato → stessa uscita, sempre.

import {
  type AuctionEvent,
  type AuctionState,
  type PoolPlayer,
  type Role,
  ROSTER_REQUIREMENTS,
} from "./types.js";
import { type MaxSafeResult, maxSafe } from "./auction.js";
import { settledPurchases } from "./anchors.js";

/** Ordine totale sugli id, indipendente dalla locale (vedi header). */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── Ordinamento iniettato + provenienza ─────────────────────────────────────

/**
 * Da dove viene l'ordine, dichiarato dal chiamante e trasportato intatto fino
 * a chi lo mostra. Nessun campo è opzionale e nessuno può essere vuoto: una
 * fascia la cui provenienza non si può leggere non è utilizzabile.
 */
export interface AppealOrderProvenance {
  /** Quale sorgente ha prodotto l'ordine (es. il deposito dell'indice servito). */
  readonly source: string;
  /** Quale versione di ricetta, copiata dal dato servito — mai scritta a mano. */
  readonly recipe: string;
  /** Con quale criterio sono stati rotti i pareggi a monte. */
  readonly tieBreak: string;
}

/** I giocatori di un ruolo, dal migliore al peggiore. Ordine preso come dato. */
export interface RoleAppealOrder {
  readonly role: Role;
  readonly playerIds: readonly string[];
}

/** L'ordinamento completo iniettato: uno o più ruoli, più la provenienza. */
export interface AppealOrdering {
  readonly provenance: AppealOrderProvenance;
  /** Un ruolo può mancare: significa «per questo ruolo non ho un ordine». */
  readonly roles: readonly RoleAppealOrder[];
}

export type AppealOrderViolation =
  | "provenance-incomplete" // source/recipe/tieBreak vuota: il dato non è tracciabile
  | "duplicate-role" // lo stesso ruolo ordinato due volte: quale dei due sarebbe l'ordine?
  | "player-id-empty" // id vuoto: nessuna identità su cui agganciare la fascia
  | "duplicate-player" // stesso id due volte (nello stesso ruolo o in due ruoli)
  | "unknown-player" // id assente dal listone passato: la fascia poggerebbe sul nulla
  | "role-mismatch"; // il listone assegna a quell'id un ruolo diverso

export interface AppealOrderIssue {
  /** Il ruolo in cui è stata trovata; `null` per le violazioni di provenienza. */
  readonly role: Role | null;
  /** Posizione della voce nella lista in cui è stata trovata; `-1` se non applicabile. */
  readonly index: number;
  /** L'id coinvolto; stringa vuota per le violazioni non legate a un giocatore. */
  readonly playerId: string;
  readonly violation: AppealOrderViolation;
}

export interface AppealOrderValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AppealOrderIssue[];
}

/**
 * Validazione pura e non lanciante dell'ordinamento iniettato — stesso
 * contratto di `validateAnchors`/`validateConfirmations`: riporta OGNI
 * violazione trovata, non solo la prima, così il chiamante vede tutto il
 * disastro in un colpo solo invece di scoprirlo una riga per volta.
 *
 * `pool` è opzionale di proposito. Senza, si controlla ciò che l'ordinamento
 * dice di sé (provenienza, duplicati, ruoli ripetuti, id vuoti). Con, si
 * controlla anche che ogni id sia davvero nel listone e col ruolo giusto —
 * ed è così che va chiamata dal privato, dove il listone esiste. Non passarlo
 * non rende l'ordinamento valido: rende soltanto il controllo più debole, e
 * questo è dichiarato invece che nascosto.
 */
export function validateAppealOrdering(
  ordering: AppealOrdering,
  pool?: readonly PoolPlayer[],
): AppealOrderValidationResult {
  const issues: AppealOrderIssue[] = [];

  const p = ordering.provenance;
  if (
    p === undefined ||
    p === null ||
    p.source.length === 0 ||
    p.recipe.length === 0 ||
    p.tieBreak.length === 0
  ) {
    issues.push({ role: null, index: -1, playerId: "", violation: "provenance-incomplete" });
  }

  const roleOf: Map<string, Role> | null =
    pool === undefined ? null : new Map(pool.map((entry) => [entry.playerId, entry.role]));

  const seenRoles = new Set<Role>();
  const seenPlayers = new Set<string>();

  ordering.roles.forEach((entry, roleIndex) => {
    if (seenRoles.has(entry.role)) {
      issues.push({
        role: entry.role,
        index: roleIndex,
        playerId: "",
        violation: "duplicate-role",
      });
    } else {
      seenRoles.add(entry.role);
    }

    entry.playerIds.forEach((playerId, index) => {
      const add = (violation: AppealOrderViolation): void => {
        issues.push({ role: entry.role, index, playerId, violation });
      };
      if (playerId.length === 0) add("player-id-empty");
      else if (seenPlayers.has(playerId)) add("duplicate-player");
      else seenPlayers.add(playerId);

      if (roleOf !== null && playerId.length > 0) {
        const known = roleOf.get(playerId);
        if (known === undefined) add("unknown-player");
        else if (known !== entry.role) add("role-mismatch");
      }
    });
  });

  return { ok: issues.length === 0, issues };
}

// ─── Costruzione dell'ordine a partire dai punteggi (opzionale) ──────────────

/**
 * Il criterio di rottura dei pareggi applicato da `buildRoleAppealOrder`,
 * esportato perché chi ordina, chi verifica e chi mostra usino la STESSA
 * stringa e non tre copie destinate a divergere. È l'unica convenzione che
 * questo modulo potrebbe imporre in silenzio, e infatti viaggia dentro
 * `provenance.tieBreak` accanto a ogni fascia prodotta.
 */
export const APPEAL_ORDER_TIE_BREAK =
  "punteggio decrescente, pareggi rotti per playerId crescente (code unit UTF-16)";

/**
 * Una riga di punteggio in ingresso. `score === null` significa NESSUN
 * VERDETTO, esattamente come lo serve il dato (`ListoneAppealIndex.score`).
 */
export interface AppealScoreEntry {
  readonly playerId: string;
  readonly score: number | null;
}

/**
 * Ordina i giocatori di un ruolo a partire dai punteggi INIETTATI. Questo
 * modulo non li calcola e non li conosce: li riceve e li mette in fila.
 *
 * Esiste per una ragione sola: rendere il pareggio DETERMINISTICO e
 * DICHIARATO. Un `sort` per solo punteggio lascerebbe l'ordine di due
 * giocatori a 62,0 alla libreria e all'ordine di partenza — e al confine fra
 * la prima e la seconda fascia quell'ordine decide chi è di prima. Qui il
 * confronto è un ordine TOTALE (`APPEAL_ORDER_TIE_BREAK`) e non dipende dalla
 * stabilità del `sort` sottostante.
 *
 * Le righe senza verdetto (`null`, `NaN`, `Infinity`) NON entrano: il
 * giocatore resta fuori dall'ordinamento e sarà `unranked`, non ultimo. Un
 * ultimo posto assegnato a chi non ha punteggio sarebbe un valore inventato.
 *
 * Il chiamante che ordina da sé non usa questa funzione: dichiara il proprio
 * criterio in `provenance.tieBreak` e inietta la lista già fatta.
 */
export function buildRoleAppealOrder(
  role: Role,
  entries: readonly AppealScoreEntry[],
): RoleAppealOrder {
  const scored = entries.filter(
    (entry): entry is { readonly playerId: string; readonly score: number } =>
      entry.score !== null && Number.isFinite(entry.score),
  );
  const sorted = scored
    .slice()
    .sort((a, b) => b.score - a.score || compareIds(a.playerId, b.playerId));
  return { role, playerIds: sorted.map((entry) => entry.playerId) };
}

// ─── Il libro delle fasce ────────────────────────────────────────────────────

/** Le fasce di UN ruolo, già materializzate. Strutture di sola lettura. */
export interface RoleTierIndex {
  readonly role: Role;
  /** Quante fasce ha il ruolo: `ROSTER_REQUIREMENTS[role]`, costante di regolamento. */
  readonly tierCount: number;
  /** L'ordine iniettato, dal migliore al peggiore. */
  readonly order: readonly string[];
  /** playerId → fascia 1-based. Assente ⇒ fondo (o fuori ordinamento). */
  readonly tierOf: ReadonlyMap<string, number>;
  /** playerId → posizione 1-based nell'ordine. Assente ⇒ fuori ordinamento. */
  readonly positionOf: ReadonlyMap<string, number>;
  /** `tiers[k - 1]` = i giocatori della fascia k, nell'ordine iniettato. */
  readonly tiers: readonly (readonly string[])[];
  /** Chi sta oltre l'ultima fascia: col listone vero è la maggioranza. */
  readonly fondo: readonly string[];
}

/**
 * L'ordinamento iniettato trasformato in fasce, una volta sola. Si costruisce
 * al caricamento e si riusa a ogni chiamata: `tierFacts()` non ricalcola nulla.
 */
export interface TierBook {
  readonly provenance: AppealOrderProvenance;
  /** Quanti giocatori entrano in una fascia = quante squadre al tavolo. */
  readonly tierSize: number;
  readonly byRole: ReadonlyMap<Role, RoleTierIndex>;
}

export interface TierBookOptions {
  /** Le squadre al tavolo. Larghezza della fascia, censita, non stimata. */
  readonly teamsCount: number;
  /** Il listone, se disponibile: abilita i controlli `unknown-player`/`role-mismatch`. */
  readonly pool?: readonly PoolPlayer[];
}

/**
 * Costruisce il libro delle fasce, **lanciando** su un ordinamento incoerente —
 * stessa postura fail-closed di `anchorBook()` con un listino invalido e di
 * `reduce()` con riconferme invalide. Un ordinamento con un duplicato o senza
 * provenienza non produce fasce «quasi giuste»: non ne produce affatto.
 */
export function tierBook(ordering: AppealOrdering, options: TierBookOptions): TierBook {
  const { teamsCount } = options;
  if (!Number.isInteger(teamsCount) || teamsCount < 1) {
    throw new Error(
      `tierBook: teamsCount must be an integer >= 1, got ${String(teamsCount)}`,
    );
  }

  const validation = validateAppealOrdering(ordering, options.pool);
  if (!validation.ok) {
    throw new Error(
      `invalid appeal ordering: ${validation.issues
        .map((i) => `${i.role ?? "-"}/${i.index}/${i.playerId}:${i.violation}`)
        .join(", ")}`,
    );
  }

  const byRole = new Map<Role, RoleTierIndex>();
  for (const entry of ordering.roles) {
    byRole.set(entry.role, roleTierIndex(entry, teamsCount));
  }

  return {
    provenance: { ...ordering.provenance },
    tierSize: teamsCount,
    byRole,
  };
}

function roleTierIndex(entry: RoleAppealOrder, tierSize: number): RoleTierIndex {
  const tierCount = ROSTER_REQUIREMENTS[entry.role];
  const order = entry.playerIds.slice();
  const positionOf = new Map<string, number>();
  const tierOf = new Map<string, number>();
  const tiers: string[][] = [];
  for (let k = 0; k < tierCount; k += 1) tiers.push([]);
  const fondo: string[] = [];

  order.forEach((playerId, i) => {
    positionOf.set(playerId, i + 1);
    const tier = Math.floor(i / tierSize) + 1;
    if (tier <= tierCount) {
      tierOf.set(playerId, tier);
      tiers[tier - 1]!.push(playerId);
    } else {
      fondo.push(playerId);
    }
  });

  return { role: entry.role, tierCount, order, tierOf, positionOf, tiers, fondo };
}

// ─── I fatti della chiamata ──────────────────────────────────────────────────

/**
 * Dove sta il giocatore chiamato. Cinque esiti DISTINTI, mai collassati in
 * uno: le tre forme di «non lo so» dicono cose diverse a chi guarda, e
 * confonderle sarebbe già inventare.
 */
export type TierPlacementKind =
  | "tier" // in fascia: `tier` è il numero
  | "fondo" // ordinato, ma oltre l'ultima fascia del ruolo
  | "unranked" // il ruolo è ordinato, questo giocatore no
  | "role-not-ordered" // c'è un ordinamento, ma non copre questo ruolo
  | "no-ordering"; // nessun ordinamento caricato

export interface TierPlacement {
  readonly kind: TierPlacementKind;
  /** La fascia 1-based; `null` per ogni esito diverso da `tier`. */
  readonly tier: number | null;
  /** Posizione 1-based nell'ordine del ruolo; `null` se il giocatore non è ordinato. */
  readonly position: number | null;
}

/**
 * IL REGISTRO, NON UNA BANDA — nota di forma, vale per ogni
 * `pricesPaidInTier` di questo file.
 *
 * Questi prezzi escono come LISTA CRESCENTE dei singoli prezzi davvero
 * pagati, non come la coppia `{ minPrice, maxPrice }` che verrebbe spontanea.
 * Non è una preferenza di stile: `packages/engine/tests/engine.test.ts`
 * §"nessun tipo esportato dichiara una coppia di estremi numerici" vieta a
 * ogni tipo esportato del motore di dichiarare due estremi numerici della
 * stessa grandezza — è il divieto di FORMA di docs/DECISIONS.md §D9
 * perimetro 2 («nessun intervallo di prezzo»), e la contro-prova di quella
 * guardia cita testualmente `{ minPrice: number; maxPrice: number }` come la
 * sonda che deve catturare. Rinominare i due campi per passare il controllo
 * sarebbe esattamente l'aggiramento che la guardia esiste per impedire.
 *
 * La lista è anche più onesta della coppia: è il registro dell'asta riga per
 * riga, non due numeri sintetizzati che a schermo si leggono come un
 * intervallo di riferimento. Chi mostra ricava da qui «quanti» (`length`),
 * «minimo» (primo) e «massimo» (ultimo) — la stessa derivazione che
 * `rolePriceFacts` fa già di là dal confine, in src/nominationContext.ts.
 *
 * `null` = fuori fascia, «non lo so». `[]` = in fascia e nessuno ha pagato
 * niente. Le due cose non si confondono, e nessuna diventa uno 0.
 */

/** Quanti ne restano di quella fascia, e quanti erano in origine. */
export interface TierOccupancy {
  readonly tier: number;
  /** Quanti giocatori contiene la fascia: MISURATO sull'ordine, non `tierSize`
   *  per assunzione — l'ultima fascia di un ruolo corto ne ha meno. */
  readonly originalSize: number;
  readonly freeCount: number;
  readonly takenCount: number;
}

/**
 * Cosa si può MISURARE di un avversario rispetto a questo giocatore. Fatti
 * contabili, uno accanto all'altro, senza sintesi: non c'è un punteggio di
 * quanto lo vuole, non c'è una posizione in classifica, non c'è un giudizio.
 *
 * Volutamente NON c'è nemmeno `eligible`/`blockers`: quella è la domanda di
 * `competitorSet()` (competitors.ts) rispetto a una soglia, e duplicarla qui
 * produrrebbe due risposte destinate a divergere. Le due viste si affiancano.
 */
export interface TierOpponentFacts {
  readonly fantaTeamId: string;
  /** Slot ancora da riempire in questo ruolo. */
  readonly slotsRemainingInRole: number;
  readonly budgetResidual: number;
  /** Massimo che può offrire: `maxSafe()` invariato, mai riderivato qui. */
  readonly maxBid: MaxSafeResult;
  /**
   * Quanti giocatori di QUESTA FASCIA O MIGLIORE ha già in rosa in questo
   * ruolo. `null` quando il chiamato non è in fascia: «non lo so», non zero.
   *
   * Si legge la ROSA (`TeamState.roster`), quindi le riconferme contano:
   * chi si è riconfermato un centrocampista di prima fascia ce l'ha, punto —
   * ed è precisamente il fatto che interessa («chi non l'ha preso sarà più
   * interessato»).
   */
  readonly ownedAtTierOrBetter: number | null;
  /** Di quelli, quanti esattamente di questa fascia. `null` fuori fascia. */
  readonly ownedSameTier: number | null;
  /**
   * Cosa ha pagato STASERA per giocatori di questo ruolo e di questa fascia:
   * i singoli prezzi, crescenti (vedi §"Il registro, non una banda").
   * `null` fuori fascia.
   *
   * Qui si legge il LOG (`settledPurchases`), non la rosa, ed è l'asimmetria
   * opposta a quella sopra — deliberata, stessa ragione scritta in anchors.ts:
   * le riconferme portano prezzi della STAGIONE PRECEDENTE, e farle entrare
   * nel registro di serata significherebbe misurare il mercato di stasera coi
   * prezzi dell'anno scorso.
   */
  readonly pricesPaidInTier: readonly number[] | null;
}

/**
 * Tutto ciò che si può misurare, adesso, sulla fascia del giocatore chiamato.
 * Nessun campo di questo tipo dice cosa fare.
 */
export interface TierFacts {
  readonly playerId: string;
  readonly role: Role;
  /** Quante fasce ha il ruolo (regolamento). Noto anche senza ordinamento. */
  readonly tierCount: number;
  /** Quanti giocatori entrano in una fascia (squadre al tavolo). */
  readonly tierSize: number;
  /** Chi ha prodotto l'ordinamento; `null` quando non ce n'è uno. */
  readonly provenance: AppealOrderProvenance | null;
  readonly placement: TierPlacement;
  /** Occupazione della fascia del chiamato; `null` quando non è in fascia. */
  readonly occupancy: TierOccupancy | null;
  /**
   * Il registro di serata dell'INTERO tavolo per questo ruolo e questa fascia,
   * `selfId` compreso: è il mercato, non un avversario. Prezzi crescenti
   * (vedi §"Il registro, non una banda"); `null` fuori fascia.
   */
  readonly pricesPaidInTier: readonly number[] | null;
  /** Un elemento per avversario, in ordine di id crescente. */
  readonly opponents: readonly TierOpponentFacts[];
  /**
   * Su cosa poggiano questi numeri, dichiarato nel dato — stessa forma del
   * `basis: "hard-constraints"` di `competitorSet()`. Qui: regolamento,
   * censimento del tavolo, event log e ordinamento dichiarato. Niente altro.
   */
  readonly basis: "measured-facts";
}

export interface TierFactsInput {
  /** Stato derivato dal log (reduce.ts): rose, budget, slot, già venduti. */
  readonly state: AuctionState;
  /** Il log grezzo: serve per i PREZZI, che lo stato derivato non conserva. */
  readonly log: readonly AuctionEvent[];
  /** Il giocatore chiamato. */
  readonly playerId: string;
  /** Il suo ruolo, dichiarato dal chiamante come in `competitorSet()`. */
  readonly role: Role;
  /** Il libro delle fasce, o `null` se nessun ordinamento è caricato. */
  readonly book: TierBook | null;
  /** La propria squadra, esclusa da `opponents` (mai dal registro del tavolo). */
  readonly selfId?: string;
}

/**
 * I fatti della fascia per il giocatore chiamato. Puro e deterministico:
 * stesso stato + stesso log + stesso libro → stessa uscita, sempre.
 *
 * LANCIA solo su un'incoerenza strutturale fra libro e stato (fasce costruite
 * per un numero di squadre diverso da quelle al tavolo): è un errore di
 * programmazione, non una condizione del dato, e mostrare fasce larghe otto a
 * un tavolo da dieci sarebbe sbagliato in silenzio.
 */
export function tierFacts(input: TierFactsInput): TierFacts {
  const { state, log, playerId, role, book, selfId } = input;

  const teamsAtTable = Object.keys(state.teams).length;
  if (book !== null && book.tierSize !== teamsAtTable) {
    throw new Error(
      `tierFacts: tierSize mismatch — book built for ${book.tierSize} teams, state has ${teamsAtTable}`,
    );
  }

  const index = book === null ? undefined : book.byRole.get(role);
  const placement = placementOf(playerId, book, index);
  const tier = placement.tier;

  const occupancy =
    tier === null || index === undefined ? null : occupancyOf(index, tier, state);

  const purchases = settledPurchases(log);
  const inTier = (id: string): boolean =>
    index !== undefined && tier !== null && index.tierOf.get(id) === tier;

  const pricesPaidInTier =
    tier === null
      ? null
      : ascending(
          purchases
            .filter((p) => p.role === role && inTier(p.playerId))
            .map((p) => p.price),
        );

  const opponents: TierOpponentFacts[] = [];
  for (const team of Object.values(state.teams)) {
    if (team.fantaTeamId === selfId) continue;

    let ownedAtTierOrBetter: number | null = null;
    let ownedSameTier: number | null = null;
    if (tier !== null && index !== undefined) {
      ownedAtTierOrBetter = 0;
      ownedSameTier = 0;
      for (const entry of team.roster) {
        if (entry.role !== role) continue;
        const owned = index.tierOf.get(entry.playerId);
        if (owned === undefined) continue;
        if (owned <= tier) ownedAtTierOrBetter += 1;
        if (owned === tier) ownedSameTier += 1;
      }
    }

    opponents.push({
      fantaTeamId: team.fantaTeamId,
      slotsRemainingInRole: team.slotsRemaining[role],
      budgetResidual: team.budgetResidual,
      maxBid: maxSafe(team, role),
      ownedAtTierOrBetter,
      ownedSameTier,
      pricesPaidInTier:
        tier === null
          ? null
          : ascending(
              purchases
                .filter(
                  (p) =>
                    p.fantaTeamId === team.fantaTeamId &&
                    p.role === role &&
                    inTier(p.playerId),
                )
                .map((p) => p.price),
            ),
    });
  }
  opponents.sort((a, b) => compareIds(a.fantaTeamId, b.fantaTeamId));

  return {
    playerId,
    role,
    tierCount: ROSTER_REQUIREMENTS[role],
    tierSize: book === null ? teamsAtTable : book.tierSize,
    provenance: book === null ? null : book.provenance,
    placement,
    occupancy,
    pricesPaidInTier,
    opponents,
    basis: "measured-facts",
  };
}

function placementOf(
  playerId: string,
  book: TierBook | null,
  index: RoleTierIndex | undefined,
): TierPlacement {
  if (book === null) return { kind: "no-ordering", tier: null, position: null };
  if (index === undefined) return { kind: "role-not-ordered", tier: null, position: null };
  const position = index.positionOf.get(playerId);
  if (position === undefined) return { kind: "unranked", tier: null, position: null };
  const tier = index.tierOf.get(playerId);
  if (tier === undefined) return { kind: "fondo", tier: null, position };
  return { kind: "tier", tier, position };
}

function occupancyOf(
  index: RoleTierIndex,
  tier: number,
  state: AuctionState,
): TierOccupancy {
  const members = index.tiers[tier - 1] ?? [];
  const purchased = new Set(state.purchasedPlayerIds);
  let freeCount = 0;
  for (const id of members) if (!purchased.has(id)) freeCount += 1;
  return {
    tier,
    originalSize: members.length,
    freeCount,
    takenCount: members.length - freeCount,
  };
}

/** Ordine crescente sui prezzi: ordine totale sui numeri, quindi deterministico. */
function ascending(prices: readonly number[]): readonly number[] {
  return prices.slice().sort((a, b) => a - b);
}
