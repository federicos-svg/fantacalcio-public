// RADAR OCCASIONI — indice 2 di Owner, «pagare meno del valore»
// (docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §1, §4.2, riga 3 di §8). Puro,
// deterministico, engine-only.
//
// LA DOMANDA: «quali giocatori, ADESSO, costano meno di quanto valgono per
// me, e stanno nel mio piano?». Il surplus è un'aritmetica dichiarata su due
// ingredienti e nient'altro (§D9):
//
//   surplus = valore DICHIARATO da Owner − ancora corrente MISURATA
//
// dove l'ancora corrente è la Qt.A corretta dall'inflazione misurata
// (anchors.ts), con la propria base e il proprio campione al seguito.
//
// CONTROLLO ANTI-SELEZIONE-AVVERSA (requisito della issue #233): un prezzo
// basso è un'occasione solo se il dato che lo dice è di qualità alta. Se non
// lo è, il candidato NON sparisce e NON viene promosso: degrada a
// `segnalazione` con l'avvertenza «economico: verifica perché». La distinzione
// è nel TIPO, non in un flag: il ramo `occasione` esiste solo con il gate
// superato, quindi un renderer non può mostrare un badge OCCASIONE su un dato
// che non lo regge.
//
// «IL DATO CHE LO DICE» È L'ANCORA, non solo il listino. Il gate guarda quindi
// due lati: l'etichetta DICHIARATA dal chiamante e i FATTI MISURATI
// dell'ancora corrente. Un'ancora in cold start — campione 0, inflazione
// `null`, nessun confronto con ciò che il tavolo ha pagato — non qualifica
// nessun surplus, per quanto grande: il surplus sarebbe calcolato contro un
// numero che nessuna misura ha mai toccato, ed è esattamente la fregatura che
// il controllo deve intercettare. Fail-closed su fatti misurati, non solo su
// metadati di chi chiama.
//
// E il confronto dev'essere NEL RUOLO. Un'inflazione complessiva misurata su
// cinque difensori non dice niente sul mercato degli attaccanti: qualificare
// un attaccante con quel campione sarebbe la stessa promessa non mantenuta,
// scritta più in piccolo. Il gate richiede `basis === "role-inflation"`;
// l'ancora resta comunque corretta dalla misura complessiva (è la cascata
// dichiarata di anchors.ts, e correggere è meglio che non correggere), ma
// correggere e QUALIFICARE restano due domande diverse.
//
// COSA NON C'È, di proposito:
//  - **nessun punteggio di occasione** e nessun prodotto `surplus × fit`: un
//    prodotto richiede che «fit col piano» sia un numero, e quel numero
//    sarebbe un peso scelto dal sistema (§D9). L'ordinamento qui è un ordine
//    TOTALE DICHIARATO su fatti (dentro il piano prima, poi surplus, poi
//    ancora, poi id): stessa informazione, zero pesi nascosti;
//  - **nessuna finestra PREVISTA** («sparisce fra 4-6 chiamate»): la finestra
//    è fatta di due fatti — quante chiamate mancano al mio turno sul giro
//    fisso e quanti rivali possono davvero comprarlo adesso. Stimare un tasso
//    di consumo del mercato richiederebbe aste concluse che non esistono
//    (stessa motivazione già scritta in nominationWindow.ts);
//  - **nessun intervallo di prezzo per giocatore** (divieto di forma, §D9
//    perimetro 2): qui c'è uno scalare misurato e un surplus, mai una banda.

import { type AuctionState, type Role, ROLES } from "./types.js";
import { type AnchorBook, type CurrentAnchor, type MeasuredInflation, currentAnchor } from "./anchors.js";
import { type CliffFacts, cliffFacts } from "./cliff.js";
import { competitorSet } from "./competitors.js";
import { type DeclaredValueBook, type RatificationStatus } from "./declaredValues.js";
import { type LivePlan, type RolePlanLine, fitsPlan } from "./livePlan.js";
import { type NominationWindow } from "./nominationWindow.js";
import { maxSafe } from "./auction.js";

/**
 * L'etichetta di qualità del dato, portata DAL DATO (design §5: «etichetta di
 * qualità e versione portate dal dato»). Vocabolario chiuso: un consumatore
 * non può ricevere prosa libera al posto di un livello previsto.
 */
export const OPPORTUNITY_QUALITY_LEVELS = ["alta", "media", "bassa"] as const;

export type OpportunityQualityLevel = (typeof OPPORTUNITY_QUALITY_LEVELS)[number];

/**
 * Il giudizio di qualità su un giocatore, DICHIARATO dal chiamante — la
 * etichetta che accompagna la fonte del listino, più l'eventuale avvertenza di
 * Owner su una notizia non ancora verificata.
 *
 * `unclearedNews` è un INPUT DICHIARATO DI OWNER (§D9 ingrediente 2), non una
 * news letta da una fonte: il design §3 elenca le news come fonte futura, e
 * finché non è registrata in `docs/DECISIONS.md` non alimenta nulla. Qui c'è
 * solo l'interruttore con cui Owner dice «su questo c'è qualcosa che non ho
 * ancora controllato» — ed è sufficiente a far degradare l'occasione, che è
 * esattamente lo scudo anti-fregatura richiesto.
 */
export interface DeclaredDataQuality {
  readonly playerId: string;
  readonly level: OpportunityQualityLevel;
  readonly unclearedNews?: boolean;
}

export type QualityDowngradeReason =
  | "quality-label-missing" // nessuna etichetta: non si promuove un dato non qualificato
  | "quality-below-high" // etichetta media/bassa: sotto la soglia dichiarata
  | "uncleared-news" // Owner ha segnalato una notizia non verificata
  | "anchor-not-corrected"; // l'ancora che produce il surplus non porta nessuna misura di mercato

/**
 * L'avvertenza testuale del design §4.1 («economico: verifica perché»), in un
 * solo posto: nasce accanto al gate che la produce, così nessun renderer può
 * mostrare un candidato degradato senza il suo caveat, né inventarne uno
 * diverso.
 */
export const OPPORTUNITY_DOWNGRADE_WARNING = "economico: verifica perché";

export interface OpportunityQualityGate {
  readonly level: OpportunityQualityLevel | null;
  readonly unclearedNews: boolean;
  /**
   * L'ancora che produce il surplus porta una misura di mercato? `false`
   * quando è in cold start, quando la base di correzione è `none`, quando
   * l'inflazione applicata è `null` o quando il campione è 0 — cioè quando il
   * «prezzo basso» non è stato confrontato con nulla.
   */
  readonly anchorCorrected: boolean;
  /** Solo con `true` un candidato può essere promosso a OCCASIONE. */
  readonly passes: boolean;
  readonly downgradeReasons: readonly QualityDowngradeReason[];
  /**
   * Né la soglia `OPPORTUNITY_MIN_QUALITY` né la regola di qualificazione
   * dell'ancora sono registrate in un documento canonico: il giudizio viaggia
   * dichiarando su quali scelte aperte poggia.
   */
  readonly ratification: RatificationStatus;
}

/**
 * La soglia del controllo anti-selezione-avversa: **solo `alta`** promuove.
 *
 * **IN ATTESA DI RATIFICA DI OWNER.** Il commento originale la chiamava «soglia
 * dichiarata», ma non è preregistrata in nessun documento canonico (`grep` su
 * `docs/` a vuoto): a deciderlo è questo file. Resta scritta come costante in
 * un punto solo, e ogni gate che la usa porta `ratification.ratified === false`
 * con `OPPORTUNITY_MIN_QUALITY` in lista, così il declassamento è visibile al
 * consumatore invece di essere una convinzione del motore.
 */
export const OPPORTUNITY_MIN_QUALITY: OpportunityQualityLevel = "alta";

/**
 * Valuta il gate di qualità per un giocatore. Esportata perché la schermata
 * CHIAMATA (callScreen.ts) usa ESATTAMENTE questo gate per il badge OCCASIONE:
 * una sola implementazione, nessuna seconda copia destinata a divergere.
 *
 * IL GATE GUARDA DUE LATI, e serve che li guardi entrambi:
 *
 *  1. l'**etichetta dichiarata** dal chiamante sul giocatore (livello +
 *     eventuale notizia non verificata);
 *  2. i **fatti misurati dell'ancora** che produce il surplus.
 *
 * Il secondo lato è la correzione di un buco reale: la prima stesura
 * qualificava solo il listino, e un'ancora in cold start — campione 0,
 * inflazione `null`, nessun confronto col mercato — poteva accendere il badge
 * OCCASIONE su un surplus costruito contro un numero che nessuna misura aveva
 * mai toccato. L'intestazione del file prometteva «un prezzo basso è
 * un'occasione solo se il dato che lo dice è di qualità alta»: il dato che dice
 * che il prezzo è basso **è l'ancora**, quindi la qualità dell'ancora deve
 * stare nel gate. Fail-closed: `anchor === null` non passa.
 *
 * SERVE IL CAMPIONE **DEL RUOLO**, non uno qualsiasi. `currentAnchor` degrada
 * a `overall-inflation` quando il ruolo è sotto soglia (cascata dichiarata in
 * anchors.ts), ed è la degradazione giusta per CORREGGERE un'ancora: meglio la
 * misura del tavolo che nessuna misura. Ma non basta a QUALIFICARLA: cinque
 * difensori pagati sopra quotazione dicono che il tavolo ha pagato dei
 * difensori, non che il mercato degli attaccanti sia stato misurato, e
 * promuovere un attaccante su quel campione sarebbe di nuovo la promessa non
 * mantenuta di prima. Correggere e qualificare sono due domande diverse, e
 * questo gate risponde alla seconda: `basis === "role-inflation"`, altrimenti
 * `anchor-not-corrected` — l'ancora corretta resta e si mostra, il badge no.
 */
export function opportunityQualityGate(
  playerId: string,
  quality: ReadonlyMap<string, DeclaredDataQuality>,
  anchor: CurrentAnchor | null,
): OpportunityQualityGate {
  const reasons: QualityDowngradeReason[] = [];
  const declared = quality.get(playerId);

  if (declared === undefined) reasons.push("quality-label-missing");
  else {
    if (declared.level !== OPPORTUNITY_MIN_QUALITY) reasons.push("quality-below-high");
    if (declared.unclearedNews === true) reasons.push("uncleared-news");
  }

  const anchorCorrected =
    anchor !== null &&
    !anchor.coldStart &&
    anchor.basis === "role-inflation" &&
    anchor.inflationApplied !== null &&
    anchor.n > 0;
  if (!anchorCorrected) reasons.push("anchor-not-corrected");

  return {
    level: declared?.level ?? null,
    unclearedNews: declared?.unclearedNews === true,
    anchorCorrected,
    passes: reasons.length === 0,
    downgradeReasons: reasons,
    ratification: {
      ratified: false,
      unratifiedChoices: [
        "OPPORTUNITY_MIN_QUALITY",
        "ANCHOR_QUALIFICATION_REQUIRES_ROLE_SAMPLE",
      ],
    },
  };
}

/** Indicizza le etichette dichiarate; l'ultima dichiarazione per un id vince. */
export function dataQualityIndex(
  declared: readonly DeclaredDataQuality[],
): ReadonlyMap<string, DeclaredDataQuality> {
  const out = new Map<string, DeclaredDataQuality>();
  for (const d of declared) out.set(d.playerId, d);
  return out;
}

export type OpportunityReasonId =
  | "surplus-vs-current-anchor" // valore dichiarato sopra l'ancora corrente
  | "anchor-corrected-by-inflation" // l'ancora non è la Qt.A nuda: dice di quanto è corretta
  | "cliff-after" // dopo di lui la scala delle ancore fa un salto
  | "within-role-plan"; // il prezzo all'ancora sta dentro l'allocazione viva del ruolo

/**
 * Un pezzo del «motivo» di un'occasione: codice chiuso + il valore misurato
 * che lo sostiene + il campione, dove ce n'è uno. Stessa forma di
 * `TensionDriver`: nessuna prosa nel motore, la frase la scrive la UI.
 */
export interface OpportunityReason {
  readonly id: OpportunityReasonId;
  readonly value: number | null;
  readonly n: number | null;
}

/**
 * La finestra: due FATTI, mai una previsione.
 *  - quante chiamate mancano al mio turno sul giro fisso (§3-bis);
 *  - quanti rivali possono davvero comprarlo adesso, per soli vincoli duri.
 */
export interface OpportunityWindow {
  readonly callsUntilNextTurn: number;
  readonly nominatorsBefore: readonly string[];
  readonly eligibleCompetitors: number;
  /** `eligibleCompetitors > 0`: qualcuno PUÒ portarselo via prima del mio turno. */
  readonly atRisk: boolean;
}

interface OpportunityBase {
  readonly playerId: string;
  readonly role: Role;
  /** Valore dichiarato da Owner — input, mai derivato. */
  readonly declaredValue: number;
  /** Ancora corrente misurata, con base, inflazione applicata e campione. */
  readonly anchor: CurrentAnchor;
  /** `declaredValue − anchor.correctedAnchor`, sempre > 0 per un candidato. */
  readonly surplus: number;
  /** Il mio max bid vero nel ruolo (`maxSafe`), invariato e non riderivato. */
  readonly maxBid: number;
  /** Il prezzo all'ancora sta dentro l'allocazione viva del ruolo? */
  readonly withinRolePlan: boolean;
  readonly cliff: CliffFacts;
  readonly window: OpportunityWindow;
  readonly quality: OpportunityQualityGate;
  /** Sempre non vuoto: il surplus è la condizione d'ingresso e il primo motivo. */
  readonly reasons: readonly OpportunityReason[];
}

/**
 * Un candidato del radar. Unione discriminata, non un flag: il ramo
 * `occasione` esiste SOLO con il gate di qualità superato, e porta sempre
 * motivo, finestra ed etichetta (acceptance #233). Il ramo `segnalazione`
 * porta sempre l'avvertenza.
 */
export type OpportunityCandidate =
  | (OpportunityBase & { readonly kind: "occasione"; readonly warning: null })
  | (OpportunityBase & {
      readonly kind: "segnalazione";
      readonly warning: typeof OPPORTUNITY_DOWNGRADE_WARNING;
    });

export interface OpportunityRadarInput {
  readonly book: AnchorBook;
  readonly values: DeclaredValueBook;
  readonly state: AuctionState;
  readonly inflation: MeasuredInflation;
  /** La propria squadra: il radar guarda il MIO piano e i MIEI slot. */
  readonly selfId: string;
  readonly plan: LivePlan;
  /** Il giro fisso è noto prima dell'asta (§3-bis): la finestra è sempre un fatto. */
  readonly window: NominationWindow;
  readonly quality?: readonly DeclaredDataQuality[];
}

/**
 * Il radar delle occasioni allo stato corrente.
 *
 * CONDIZIONI D'INGRESSO, tutte necessarie e tutte deterministiche:
 *  1. il giocatore ha un'ancora **e** un valore dichiarato (senza uno dei due
 *     non c'è nessun surplus da misurare: resta fuori, non a zero);
 *  2. è ancora sul mercato (venduto o riconfermato ⇒ fuori);
 *  3. ho ancora uno slot aperto nel suo ruolo (altrimenti non è un'occasione
 *     per me: è la modalità spettatore di §4.1);
 *  4. il mio max bid vero copre l'ancora corrente (un'occasione che non posso
 *     comprare non è un'occasione);
 *  5. `surplus > 0`.
 *
 * ORDINAMENTO — ordine totale e stabile, dichiarato: dentro il piano prima,
 * poi surplus decrescente, poi ancora corrente decrescente (a parità di
 * surplus il pezzo più grosso della rosa vale prima), poi `playerId`. Stesso
 * stato → stessa lista, sempre.
 *
 * NON decide quante righe mostrare: come `warBoardRows`, la troncatura è una
 * scelta della vista, non del motore.
 */
export function opportunityRadar(input: OpportunityRadarInput): readonly OpportunityCandidate[] {
  const { book, values, state, inflation, selfId, plan, window } = input;
  const quality = dataQualityIndex(input.quality ?? []);
  const purchased = new Set(state.purchasedPlayerIds);
  const team = state.teams[selfId];
  if (team === undefined) {
    throw new Error(`opportunityRadar: unknown selfId "${selfId}"`);
  }

  // `maxSafe` non dipende dal ruolo se non per il ramo "role-full" (vedi
  // warBoardRows): si valuta una volta per ruolo aperto e si riusa.
  const maxBidByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    const safe = maxSafe(team, role);
    maxBidByRole[role] = safe.biddable ? safe.maxSafe : 0;
  }

  const out: OpportunityCandidate[] = [];

  for (const declared of values.all) {
    const playerId = declared.playerId;
    if (purchased.has(playerId)) continue;
    const anchor = currentAnchor(playerId, book, inflation);
    if (anchor === null) continue;
    const role = anchor.role;
    if (team.slotsRemaining[role] <= 0) continue;
    const maxBid = maxBidByRole[role];
    if (maxBid < anchor.correctedAnchor) continue;
    const surplus = declared.declaredValue - anchor.correctedAnchor;
    if (surplus <= 0) continue;

    const cliff = cliffFacts(playerId, book, state);
    if (cliff === null) continue; // irraggiungibile: stessa condizione di `anchor`
    const line: RolePlanLine = plan.perRole[role];
    const withinRolePlan = fitsPlan(line, anchor.correctedAnchor);
    const competitors = competitorSet(state, role, anchor.correctedAnchor, selfId);

    const reasons: OpportunityReason[] = [
      { id: "surplus-vs-current-anchor", value: surplus, n: null },
      {
        id: "anchor-corrected-by-inflation",
        value: anchor.inflationApplied,
        n: anchor.coldStart ? null : anchor.n,
      },
    ];
    if (cliff.isCliff) {
      reasons.push({ id: "cliff-after", value: cliff.gapRatio, n: cliff.othersAvailableInRole });
    }
    if (withinRolePlan) {
      reasons.push({ id: "within-role-plan", value: line.allocation, n: line.slotsRemaining });
    }

    const gate = opportunityQualityGate(playerId, quality, anchor);
    const base: OpportunityBase = {
      playerId,
      role,
      declaredValue: declared.declaredValue,
      anchor,
      surplus,
      maxBid,
      withinRolePlan,
      cliff,
      window: {
        callsUntilNextTurn: window.callsUntilNextTurn,
        nominatorsBefore: window.nominatorsBefore,
        eligibleCompetitors: competitors.eligibleCount,
        atRisk: competitors.eligibleCount > 0,
      },
      quality: gate,
      reasons,
    };

    out.push(
      gate.passes
        ? { ...base, kind: "occasione", warning: null }
        : { ...base, kind: "segnalazione", warning: OPPORTUNITY_DOWNGRADE_WARNING },
    );
  }

  return out.sort(
    (a, b) =>
      Number(b.withinRolePlan) - Number(a.withinRolePlan) ||
      b.surplus - a.surplus ||
      b.anchor.correctedAnchor - a.anchor.correctedAnchor ||
      a.playerId.localeCompare(b.playerId),
  );
}
