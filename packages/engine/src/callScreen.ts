// SCHERMATA CHIAMATA — i tre numeri decisionali e la commutazione automatica
// target / occasione / spettatore (docs/AUCTION_COPILOT_STRATEGY_DESIGN.md
// §4.1, riga 3 di §8). Puro, deterministico, engine-only.
//
// UN CAMPO DI QUESTO FILE È RIMASTO SENZA CONSUMATORI, E VA DETTO QUI INVECE
// CHE SCOPERTO FRA SEI MESI: `DecisionNumbers.fairToMeMaxEffective`.
// Alimentava lo slot 4 del riquadro del valore (src/valueBox.ts) fino al
// 2026-08-24; quel giorno `docs/DECISIONS.md` §"Il prezzo relativo si assesta
// su quanto mette il secondo, non il più ricco" ha dato al PREZZO RELATIVO una
// formula diversa — il secondo max bid fra i rivali eleggibili, più uno, con
// tetto al più ricco e a `max_safe` — e la sorgente dello slot è passata a
// ./relativeValue.ts. Le due formule non si somigliano: questa parte dai valori
// dichiarati di Owner, quella dai soli vincoli duri del tavolo.
//
// NON SI CANCELLA NIENTE, e non è pigrizia: vale la regola «un'asserzione si
// aggiorna o si inverte, mai si toglie», ed è lo stesso trattamento deciso il
// 2026-08-24 per `nominationWindow.ts`. `callScreen()` resta la commutazione
// target/occasione/spettatore, `chainOk` resta l'invariante che tiene ogni
// numero sotto `max_safe`, `opportunityQualityGate` resta il cancello sulla
// qualità del dato, `fairToMeMaxRaw` resta diagnostico e non renderizzabile. È
// il solo `fairToMeMaxEffective` a non avere più, su quel percorso, chi lo
// legga — marcato, non rimosso, perché il prossimo che lo trova non lo scambi
// per un pezzo da collegare. La marcatura pinnata sta in
// ./relativeValue.ts, `SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO`.
//
// DA DOVE VIENE L'AUTORITÀ DI QUESTI NUMERI. `docs/DECISIONS.md` §D9 perimetro
// 1 e la matrice UI di `docs/AUCTION_2026_EXECUTION_PLAN.md` §3: «`fair_to_me`,
// `target_band`, `stretch_cap`, STOP **derivati dai valori dichiarati di
// Owner** → visibili, nessun receipt», con etichetta «derivato dai tuoi
// valori» e catena `banda ≤ stretch ≤ ftm ≤ max_safe`. Il campo FTM
// *model-derived* resta gated e questo file non lo produce: non c'è nessun
// modello nel calcolo, solo i valori che Owner ha dichiarato e le ancore
// misurate.
//
// LA CATENA, PER INTERO E DICHIARATA (contratto §4.2 del piano, istanziato sui
// valori dichiarati). La formula qui sotto è quella ESEGUITA, clamp e
// troncamenti compresi: se diverge dal codice è la formula a essere sbagliata,
// perché è questa che un revisore legge.
//
// ```text
// V(WITH player @ p)  = declaredValue(player) − p        surplus se lo vinco a p
// V(WITHOUT player)   = opportunityCost                  surplus se lo lascio e prendo l'alternativa
// opportunityCost     = max(0, declaredValue(bestAlt) − currentAnchor(bestAlt))
//
// condizione §4.2:  V(WITH @ p) ≥ V(WITHOUT) − α × opportunityCost
//                   declaredValue − p ≥ oc − α × oc
//          ⇒        p ≤ declaredValue − oc × (1 − α)
//
// fairToMeMaxRaw       = ⌊ declaredValue − oc × (1 − α) ⌋        (troncamento con ε)
// fairToMeMaxEffective = min(fairToMeMaxRaw, maxSafe)            (§4.2)
//     se fairToMeMaxEffective < COST_FLOOR  ⇒  no_target, nessun numero emesso
// stretchCap  «MOLLALO A»       = fairToMeMaxEffective
// takeUpTo    «PRENDILO FINO A» = max(COST_FLOOR,
//                                     min(stretchCap, ⌊currentAnchor + bandMargin⌋))
//     width = stretchCap − takeUpTo
//     se width > WIDTH_NO_TARGET_OVER_BUDGET × budgetResidual ⇒ no_target (§4.2)
// ```
//
// `V(WITH @ p)` è non crescente in `p`, come §4.2 richiede, quindi il massimo
// esiste in forma chiusa e non serve enumerare i prezzi interi. Gli α sono
// quelli **preregistrati** nel piano (§4.2, `ALPHA_BY_PROFILE` in
// declaredValues.ts): parametri dichiarati in un documento canonico, non pesi
// scelti dal sistema.
//
// UNA SCELTA DEL MOTORE CHE NESSUNO HA RATIFICATO, e va detta forte:
// l'identificazione `V(WITHOUT player) := opportunityCost`. §4.2 tratta le due
// grandezze come DISTINTE (`V(WITH…) ≥ V(WITHOUT…) − α × opportunityCost`);
// collassarle è una lettura di questo file, non del piano. La conseguenza è
// misurabile e va guardata in faccia: con `α = 1,15` (aggressiva) il tetto
// **supera il valore dichiarato di Owner** (dichiarato 40, oc 20 ⇒ ftm 43) e
// **cresce al migliorare del piano B** — un'alternativa più ricca autorizza a
// pagare di più il giocatore che stai chiamando, che è l'inverso di quanto ci
// si aspetta. Con `α = 0,85` il segno è quello atteso (40 ⇒ 37). Il
// comportamento è PINNATO da un test dedicato che lo documenta senza
// approvarlo, e `DecisionNumbers.ratification` lo dichiara aperto: la scelta
// fra le due letture è di Owner, e finché non decide il motore non la nasconde.
//
// `bandMargin` è **0 se Owner non dichiara altro**, e questa è una scelta di
// onestà, non una dimenticanza: senza una soglia dichiarata la banda si ferma
// all'ancora corrente MISURATA — fin lì stai pagando il mercato, oltre stai
// allungando sul tuo valore. Un margine di default inventato qui sarebbe
// esattamente il peso nascosto che §D9 vieta.
//
// COSA NON C'È, di proposito:
//  - nessun prezzo predetto e nessun «prezzo equo» di mercato (`docs/NO_GO.md`
//    §Prodotto): `declaredValue` è quanto vale PER OWNER, non quanto pagherà il
//    tavolo;
//  - nessun override di `max_safe`: resta hard-safe (D4) e tutta la catena
//    vive sotto quel tetto per costruzione, verificato nei test;
//  - nessun intervallo di prezzo per giocatore (§D9 perimetro 2): la catena è
//    fatta di soglie decisionali dichiarate, non è una banda di prezzo
//    predetta.

import { type AuctionState, type Role, COST_FLOOR } from "./types.js";
import { type AnchorBook, type CurrentAnchor, type MeasuredInflation, currentAnchor } from "./anchors.js";
import { type CliffFacts, cliffFacts } from "./cliff.js";
import { type CompetitorSet, competitorSet } from "./competitors.js";
import {
  type DeclaredValueBook,
  type RatificationStatus,
  type ValueProfile,
  ALPHA_BY_PROFILE,
  DECLARED_VALUE_PROVENANCE,
} from "./declaredValues.js";
import { type LivePlan, fitsPlan } from "./livePlan.js";
import {
  type DeclaredDataQuality,
  type OpportunityQualityGate,
  dataQualityIndex,
  opportunityQualityGate,
  surplusOverAnchor,
} from "./opportunities.js";
import { type TensionAssessment, tension } from "./tension.js";
import { maxSafe } from "./auction.js";

/**
 * Epsilon del troncamento. `1 − 0.85` non è esattamente 0,15 in binario:
 * senza questa tolleranza un `47` esatto uscirebbe come `46` per un residuo
 * di 1e-16. 1e-9 è nove ordini di grandezza sotto il credito, quindi non può
 * mai promuovere un prezzo a quello superiore per motivi reali.
 */
const FLOOR_EPSILON = 1e-9;

function floorCredits(x: number): number {
  return Math.floor(x + FLOOR_EPSILON);
}

/**
 * Un'alternativa comprabile nello stesso ruolo: il piano B, e insieme la
 * sorgente dell'`opportunityCost` della catena.
 */
export interface AlternativeCandidate {
  readonly playerId: string;
  readonly role: Role;
  readonly declaredValue: number;
  readonly correctedAnchor: number;
  /** `declaredValue − correctedAnchor`: può essere negativo (ripiego che sconta). */
  readonly surplus: number;
  /** Il prezzo all'ancora sta dentro l'allocazione viva del ruolo? */
  readonly withinRolePlan: boolean;
}

export interface AlternativeInput {
  readonly excludePlayerId: string;
  readonly role: Role;
  readonly book: AnchorBook;
  readonly values: DeclaredValueBook;
  readonly state: AuctionState;
  readonly inflation: MeasuredInflation;
  readonly plan: LivePlan;
  /** Il mio max bid vero nel ruolo: un'alternativa che non posso comprare non è un'alternativa. */
  readonly maxBid: number;
}

/**
 * La migliore alternativa ancora sul mercato nel ruolo, fra quelle che hanno
 * un'ancora, un valore dichiarato e un prezzo che il mio max bid vero copre.
 *
 * Ordinamento dichiarato: surplus decrescente, poi valore dichiarato
 * decrescente, poi `playerId`. Il surplus è la chiave giusta perché la domanda
 * a cui questa funzione risponde è «quanto ci perdo a lasciarlo andare»: ciò
 * che si perde è il vantaggio sul prezzo, non il nome più grosso.
 *
 * Le alternative a surplus NEGATIVO restano in gioco: un ripiego che costa un
 * po' più di quanto valga per me è comunque un modo di riempire lo slot, e
 * scartarlo farebbe apparire «nessun piano B» dove un piano B c'è.
 */
export function bestAlternative(input: AlternativeInput): AlternativeCandidate | null {
  const { excludePlayerId, role, book, values, state, inflation, plan, maxBid } = input;
  const purchased = new Set(state.purchasedPlayerIds);
  const line = plan.perRole[role];

  let best: AlternativeCandidate | null = null;
  for (const declared of values.all) {
    if (declared.playerId === excludePlayerId) continue;
    if (purchased.has(declared.playerId)) continue;
    const anchor = currentAnchor(declared.playerId, book, inflation);
    if (anchor === null || anchor.role !== role) continue;
    if (maxBid < anchor.correctedAnchor) continue;
    const candidate: AlternativeCandidate = {
      playerId: declared.playerId,
      role,
      declaredValue: declared.declaredValue,
      correctedAnchor: anchor.correctedAnchor,
      surplus: declared.declaredValue - anchor.correctedAnchor,
      withinRolePlan: fitsPlan(line, anchor.correctedAnchor),
    };
    if (
      best === null ||
      candidate.surplus > best.surplus ||
      (candidate.surplus === best.surplus &&
        (candidate.declaredValue > best.declaredValue ||
          (candidate.declaredValue === best.declaredValue &&
            candidate.playerId.localeCompare(best.playerId) < 0)))
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Perché il rimpianto è quello che è: condizioni booleane, non una scala inventata. */
export type RegretDriverId =
  | "no-affordable-alternative" // non resta nessun ripiego comprabile con valore dichiarato
  | "cliff-after" // dopo di lui la scala delle ancore fa un salto
  | "alternative-surplus-lower"; // il ripiego rende meno di lui

/**
 * La banda di rimpianto.
 *
 * **IN ATTESA DI RATIFICA DI OWNER — incoerenza interna dichiarata.**
 * `livePlan.ts` e `cliff.ts` rifiutano le «fasce» perché sono «un
 * raggruppamento che il sistema sceglierebbe da sé», citando §D9; questa è
 * una fascia a tre livelli con confini scelti nel motore, e uno dei due
 * confini poggia su `CLIFF_GAP_RATIO = 0,30`, che non è registrato in nessun
 * documento canonico (un credito di differenza sull'alternativa ribalta
 * l'etichetta che Owner legge). O il criterio vale per entrambe o per nessuna
 * delle due: la scelta è sua.
 *
 * Cosa fa il motore nel frattempo, senza decidere al posto suo: la banda
 * resta calcolata (rimuoverla toglierebbe il terzo numero decisionale che
 * #233 chiede), porta `ratification.ratified === false`, e **viaggia insieme
 * alle grandezze continue da cui esce** (`surplusGap`, `cliffGapRatio`), così
 * una vista può mostrare il valore continuo invece dell'etichetta senza
 * ricalcolare nulla e senza che il motore abbia scelto per lei.
 */
export type RegretBand = "basso" | "medio" | "alto";

/**
 * Il costo del rimpianto: «SE LO PERDI» di §4.1, con il piano B e il perché.
 *
 * REGOLA DICHIARATA:
 *  - `alto` se non c'è nessuna alternativa comprabile **oppure** il giocatore
 *    è un cliff (dopo di lui la scala salta);
 *  - `basso` se l'alternativa rende almeno quanto lui (sostituto vero);
 *  - `medio` altrimenti.
 * Ogni condizione è un booleano su fatti misurati e valori dichiarati; i
 * driver che hanno fatto scattare la banda viaggiano col risultato.
 */
export interface PlanB {
  readonly alternative: AlternativeCandidate | null;
  readonly regret: RegretBand;
  readonly drivers: readonly RegretDriverId[];
  /**
   * `surplus(chiamato) − surplus(alternativa)`, in crediti: quanto rende in
   * più il giocatore in asta rispetto al ripiego. `null` senza alternativa.
   * È la grandezza CONTINUA sotto la banda: chi non vuole l'etichetta non
   * ratificata mostra questa.
   */
  readonly surplusGap: number | null;
  /** L'altro ingrediente continuo della banda: il dislivello del cliff. */
  readonly cliffGapRatio: number | null;
  readonly ratification: RatificationStatus;
}

export function planBFor(
  called: { readonly surplus: number },
  alternative: AlternativeCandidate | null,
  cliff: CliffFacts,
): PlanB {
  const drivers: RegretDriverId[] = [];
  if (alternative === null) drivers.push("no-affordable-alternative");
  if (cliff.isCliff) drivers.push("cliff-after");
  if (alternative !== null && alternative.surplus < called.surplus) {
    drivers.push("alternative-surplus-lower");
  }
  const regret: RegretBand =
    alternative === null || cliff.isCliff
      ? "alto"
      : alternative.surplus >= called.surplus
        ? "basso"
        : "medio";
  return {
    alternative,
    regret,
    drivers,
    surplusGap: alternative === null ? null : called.surplus - alternative.surplus,
    cliffGapRatio: cliff.gapRatio,
    ratification: {
      ratified: false,
      unratifiedChoices: ["REGRET_BAND_LEVELS", "CLIFF_GAP_RATIO"],
    },
  };
}

/**
 * I TRE NUMERI DECISIONALI, con la propria provenienza e la catena verificata.
 *
 * `chain` non è un commento: è l'invariante `COST_FLOOR ≤ takeUpTo ≤
 * stretchCap ≤ fairToMeMaxEffective ≤ maxSafe` valutata sul risultato appena
 * costruito. È ridondante per costruzione, e deve restarlo: se un domani la
 * formula cambia e rompe la catena, il flag lo dice invece di lasciar passare
 * un numero sopra `max_safe`.
 */
export interface DecisionNumbers {
  /** «PRENDILO FINO A» — il prezzo più alto che resta dentro il piano. */
  readonly takeUpTo: number;
  /** «MOLLALO A» — il tetto: oltre questo prezzo si molla (STOP strategico). */
  readonly stretchCap: number;
  /** `fair_to_me_max_effective` (§4.2): il tetto derivato dai valori di Owner. */
  readonly fairToMeMaxEffective: number;
  /**
   * `fair_to_me_max_raw` prima del cap contabile.
   *
   * **DIAGNOSTICO — NON RENDERIZZABILE.** Questo campo NON va mostrato in UI,
   * né da solo né accanto agli altri. §4.2 definisce
   * `raw_domain = { p ∈ Z | 1 ≤ p ≤ budget_remaining }`, mentre qui la forma
   * chiusa è calcolata **senza vincolo di dominio**: sulla matrice di
   * acceptance `fairToMeMaxRaw > maxSafe` in 21 casi su 54, e con budget 20 e
   * `maxSafe` 9 vale 480. Mostrarlo produrrebbe «480» accanto a «max_safe 9»,
   * esattamente la microcopy che `docs/NO_GO.md` §Prodotto e §4.2 vogliono
   * impedire. Esiste per ispezionare la catena in test e in debug; il numero
   * mostrabile è `fairToMeMaxEffective`.
   */
  readonly fairToMeMaxRaw: number;
  /** Esito del width gate §4.2 sulla larghezza della banda decisionale. */
  readonly widthGate: WidthGate;
  /**
   * L'identificazione `V(WITHOUT) := opportunityCost` non è ratificata: vedi
   * l'intestazione del file. Il numero si mostra, la scelta si dichiara.
   */
  readonly ratification: RatificationStatus;
  /** Il limite hard-safe (D4). Nessun numero qui sopra lo supera mai. */
  readonly maxSafe: number;
  readonly profile: ValueProfile;
  readonly alpha: number;
  /** Il surplus che rinuncerei prendendo lui invece della migliore alternativa. */
  readonly opportunityCost: number;
  /** Margine dichiarato da Owner sopra l'ancora per la banda; 0 se non dichiarato. */
  readonly bandMargin: number;
  readonly provenance: typeof DECLARED_VALUE_PROVENANCE;
  /** L'invariante della catena, valutata: `false` non deve mai accadere. */
  readonly chainOk: boolean;
}

export type NoTargetReason =
  | "anchor-missing" // nessuna Qt.A: non c'è scala su cui misurare niente
  | "already-assigned" // già venduto o riconfermato: non c'è nessuna asta su cui offrire
  | "declared-value-missing" // Owner non l'ha valutato: nessun numero derivabile dai suoi valori
  | "role-full" // il ruolo è pieno: non posso comprarlo
  | "not-biddable" // budget bloccato dalla riserva dura
  | "below-cost-floor" // la catena finisce sotto il floor: non c'è offerta valida
  | "band-too-wide"; // width gate §4.2: la banda è troppo larga per essere operativa

// ---------------------------------------------------------------------------
// WIDTH GATE — `docs/AUCTION_2026_EXECUTION_PLAN.md` §4.2.
//
// Il piano impone tre esiti sulla LARGHEZZA della banda decisionale, su due
// dimensioni: `useful` (≤15% del budget residuo **e** ≤20% del midpoint),
// `no_target` (>25% del budget residuo **o** >35% del midpoint), `cautious`
// altrimenti. «`no_target` non conserva né mostra una banda nascosta come
// operativa»: quando scatta, i numeri non escono affatto.
//
// COSA È IMPLEMENTATO E COSA NO, per non promettere più di quel che si fa.
// Qui è attiva la sola dimensione **budget residuo**. La dimensione
// **midpoint** è MISURATA e trasportata (`widthOverMidpoint`) ma non chiude il
// gate, e la ragione è che chiuderlo sarebbe una decisione di prodotto presa
// dal motore: con la banda ancorata al mercato (`takeUpTo` = ancora corrente)
// e il tetto sul valore di Owner, il rapporto width/midpoint supera 0,35 nella
// maggioranza delle occasioni vere — accenderlo trasformerebbe in `no_target`
// gran parte dei casi che #233 esiste per mostrare. Il numero resta visibile
// perché il gap sia ispezionabile invece che silenzioso; l'attivazione è di
// Owner (vedi Escalation della PR).
// ---------------------------------------------------------------------------

/** §4.2: `no_target` se la larghezza supera questa quota del budget residuo. */
export const WIDTH_NO_TARGET_OVER_BUDGET = 0.25;
/** §4.2: `useful` solo se la larghezza sta entro questa quota del budget residuo. */
export const WIDTH_USEFUL_OVER_BUDGET = 0.15;

export type WidthVerdict = "useful" | "cautious" | "no_target";

export interface WidthGate {
  /** `stretchCap − takeUpTo`, in crediti. */
  readonly width: number;
  readonly budgetResidual: number;
  /** `width / budgetResidual`, o `null` a budget 0. */
  readonly widthOverBudget: number | null;
  /** `(takeUpTo + stretchCap) / 2`: il midpoint di §4.2. */
  readonly midpoint: number;
  /** Misurato e dichiarato, ma NON usato per chiudere il gate (vedi sopra). */
  readonly widthOverMidpoint: number | null;
  readonly verdict: WidthVerdict;
  /** Le dimensioni di §4.2 che questo gate applica davvero. */
  readonly gatedDimensions: readonly ["budget-residual"];
  /**
   * Chiudere una sola delle due dimensioni di §4.2 è una scelta del motore, non
   * una lettura del piano: viaggia dichiarata, come le altre. Le due soglie
   * (25% / 15%) sono invece **preregistrate** in §4.2 e non entrano qui.
   */
  readonly ratification: RatificationStatus;
}

function widthGateFor(
  takeUpTo: number,
  stretchCap: number,
  budgetResidual: number,
): WidthGate {
  const width = stretchCap - takeUpTo;
  const midpoint = (takeUpTo + stretchCap) / 2;
  const widthOverBudget = budgetResidual <= 0 ? null : width / budgetResidual;
  const widthOverMidpoint = midpoint <= 0 ? null : width / midpoint;
  // A budget 0 il rapporto non esiste: non si inventa un verdetto favorevole,
  // ma nemmeno se ne inventa uno sfavorevole — con budget 0 `maxSafe` ha già
  // chiuso la catena molto prima (`not-biddable`/`below-cost-floor`).
  const verdict: WidthVerdict =
    widthOverBudget === null
      ? "cautious"
      : widthOverBudget > WIDTH_NO_TARGET_OVER_BUDGET
        ? "no_target"
        : widthOverBudget <= WIDTH_USEFUL_OVER_BUDGET
          ? "useful"
          : "cautious";
  return {
    width,
    budgetResidual,
    widthOverBudget,
    midpoint,
    widthOverMidpoint,
    verdict,
    gatedDimensions: ["budget-residual"],
    ratification: {
      ratified: false,
      unratifiedChoices: ["WIDTH_GATE_MIDPOINT_DIMENSION_OFF"],
    },
  };
}

export type CallMode =
  | "target" // è nel mio piano e posso comprarlo
  | "occasione" // come target, e l'ancora corrente sta sotto il mio valore, con dato di qualità
  | "spettatore"; // non è mio: si guarda, non si compra

export type LivePriceStatus =
  | "dentro-il-piano" // ≤ «prendilo fino a»
  | "in-stretch" // fra la banda e il tetto: si allunga sul proprio valore
  | "oltre-lo-stop" // sopra lo STOP; overridabile solo fino a max_safe (§4.2)
  | "oltre-max-safe"; // oltre il limite hard-safe: nessun rilancio valido

/** La barra live: prezzo corrente contro atteso (l'ancora) e contro la catena. */
export interface LivePriceReadout {
  readonly currentPrice: number;
  /** `currentPrice − correctedAnchor`: quanto il tavolo sta pagando sopra l'atteso. */
  readonly vsCurrentAnchor: number;
  readonly status: LivePriceStatus;
}

export interface CallScreen {
  readonly playerId: string;
  /** `null` solo senza ancora: senza Qt.A non si conosce nemmeno il ruolo. */
  readonly role: Role | null;
  readonly mode: CallMode;
  readonly anchor: CurrentAnchor | null;
  readonly tension: TensionAssessment | null;
  readonly competitors: CompetitorSet | null;
  readonly cliff: CliffFacts | null;
  /** Valore dichiarato da Owner, o `null` se non l'ha dichiarato. */
  readonly declaredValue: number | null;
  /** `declaredValue − correctedAnchor`, o `null` se manca uno dei due. */
  readonly surplus: number | null;
  readonly numbers: DecisionNumbers | null;
  /** Perché non ci sono numeri; `null` quando ci sono. */
  readonly noTargetReason: NoTargetReason | null;
  readonly planB: PlanB | null;
  readonly quality: OpportunityQualityGate;
  readonly livePrice: LivePriceReadout | null;
  /** Il prezzo all'ancora sta dentro l'allocazione viva del ruolo? */
  readonly withinRolePlan: boolean;
  /**
   * L'esito del width gate, presente anche quando è LUI ad aver tolto i
   * numeri (`noTargetReason === "band-too-wide"`): il motivo di un `no_target`
   * dev'essere ispezionabile, altrimenti la schermata dice «niente numeri»
   * senza dire perché. `null` quando la catena non è mai stata calcolata.
   */
  readonly widthGate: WidthGate | null;
}

export interface CallScreenInput {
  readonly playerId: string;
  readonly book: AnchorBook;
  readonly values: DeclaredValueBook;
  readonly state: AuctionState;
  readonly inflation: MeasuredInflation;
  readonly selfId: string;
  readonly plan: LivePlan;
  /** Profilo dichiarato da Owner: sceglie l'α preregistrato del piano §4.2. */
  readonly profile: ValueProfile;
  /** Margine dichiarato sopra l'ancora per la banda. Assente ⇒ 0. */
  readonly bandMargin?: number;
  readonly quality?: readonly DeclaredDataQuality[];
  /** Il prezzo corrente al tavolo, quando la chiamata è già partita. */
  readonly currentPrice?: number;
}

/**
 * La schermata CHIAMATA per un giocatore, adesso.
 *
 * COMMUTAZIONE AUTOMATICA (requisito #233), esaustiva e mutuamente esclusiva,
 * nell'ordine:
 *  1. **spettatore** — manca l'ancora, manca il valore dichiarato, il ruolo è
 *     pieno, il budget è bloccato, oppure la catena finisce sotto il floor.
 *     In tutti questi casi non è la mia asta e i tre numeri NON esistono:
 *     `numbers` è `null` con il motivo, mai una banda di ripiego;
 *  2. **occasione** — altrimenti, se l'ancora corrente sta sotto il valore
 *     dichiarato **e** il gate di qualità del dato passa (stesso gate del
 *     radar, `opportunityQualityGate`);
 *  3. **target** — altrimenti.
 *
 * Un surplus positivo con dato di qualità insufficiente NON diventa occasione:
 * resta `target` e il gate porta i motivi del declassamento — il badge
 * OCCASIONE non si accende su un dato che non lo regge.
 *
 * ASIMMETRIA DICHIARATA CON IL RADAR, e perché resta.
 * `opportunityRadar` ha una condizione d'ingresso in più: «il mio max bid vero
 * copre l'ancora corrente». La CHIAMATA non ce l'ha, quindi lo stesso
 * giocatore può essere **fuori dal radar** e comunque `mode === "occasione"`
 * qui — misurato: `maxSafe = 13` con ancora corrente `30` esclude il candidato
 * dal radar, mentre la CHIAMATA emette `takeUpTo = stretchCap = maxSafe = 13`.
 * Non è un difetto e non va allineato: le due superfici rispondono a due
 * domande diverse. Il radar propone cosa *cercare*, e proporre un giocatore
 * che non posso pagare al prezzo atteso è rumore; la CHIAMATA reagisce a un
 * nome **già chiamato**, e il prezzo atteso è un'attesa, non il prezzo — sotto
 * 13 quel giocatore è ancora vincibile, e nascondere i numeri toglierebbe una
 * decisione che esiste. Il **gate di qualità** resta invece uno solo e
 * condiviso (`opportunityQualityGate`): a divergere è la condizione di
 * ammissione, mai la regola che accende il badge.
 *
 * Deterministica: stesso stato + stessi listini + stesso profilo → stessa
 * schermata, sempre.
 */
export function callScreen(input: CallScreenInput): CallScreen {
  const { playerId, book, values, state, inflation, selfId, plan, profile } = input;
  const team = state.teams[selfId];
  if (team === undefined) {
    throw new Error(`callScreen: unknown selfId "${selfId}"`);
  }
  const qualityIndex = dataQualityIndex(input.quality ?? []);
  const bandMargin = input.bandMargin ?? 0;
  if (!Number.isFinite(bandMargin) || bandMargin < 0) {
    throw new Error(`callScreen: bandMargin must be finite and >= 0, got ${String(bandMargin)}`);
  }

  const anchor = currentAnchor(playerId, book, inflation);
  const declaredValue = values.byPlayerId.get(playerId)?.declaredValue ?? null;
  const quality = opportunityQualityGate(playerId, qualityIndex, anchor);

  if (anchor === null) {
    return {
      playerId,
      role: null,
      mode: "spettatore",
      anchor: null,
      tension: null,
      competitors: null,
      cliff: null,
      declaredValue,
      surplus: null,
      numbers: null,
      noTargetReason: "anchor-missing",
      planB: null,
      quality,
      livePrice: null,
      withinRolePlan: false,
      widthGate: null,
    };
  }

  const role = anchor.role;
  const cliff = cliffFacts(playerId, book, state)!; // stessa condizione di `anchor`
  const safe = maxSafe(team, role);
  const maxBid = safe.biddable ? safe.maxSafe : 0;
  const competitors = competitorSet(state, role, anchor.correctedAnchor, selfId);
  const assessment = tension({ playerId, book, state, inflation, selfId });
  // La sottrazione NON è riscritta qui: è `surplusOverAnchor` (opportunities.ts),
  // l'unica aritmetica del surplus del progetto. `null` resta `null` — un valore
  // non dichiarato non diventa uno zero da sottrarre.
  const surplus = declaredValue === null ? null : surplusOverAnchor(declaredValue, anchor);
  const withinRolePlan = fitsPlan(plan.perRole[role], anchor.correctedAnchor);

  const alternative =
    declaredValue === null || !safe.biddable
      ? null
      : bestAlternative({
          excludePlayerId: playerId,
          role,
          book,
          values,
          state,
          inflation,
          plan,
          maxBid,
        });

  const spectator = (reason: NoTargetReason, widthGate: WidthGate | null = null): CallScreen => ({
    playerId,
    role,
    mode: "spettatore",
    anchor,
    tension: assessment,
    competitors,
    cliff,
    declaredValue,
    surplus,
    numbers: null,
    noTargetReason: reason,
    planB: null,
    quality,
    livePrice: null,
    withinRolePlan,
    widthGate,
  });

  // Un giocatore già assegnato (venduto o riconfermato) non ha un'asta in
  // corso: mostrare «prendilo fino a 34» su di lui sarebbe un numero valido
  // per una decisione che non esiste. Il controllo viene PRIMA di quelli sui
  // miei valori perché è un fatto del tavolo, non una mancanza mia — e la
  // stessa condizione tiene i venduti fuori dal radar occasioni.
  if (!cliff.playerAvailable) return spectator("already-assigned");
  if (declaredValue === null) return spectator("declared-value-missing");
  if (team.slotsRemaining[role] <= 0) return spectator("role-full");
  if (!safe.biddable) return spectator("not-biddable");

  // Oltre questa riga il valore dichiarato esiste, quindi anche il surplus:
  // il narrowing di `surplus` non sopravvive alle guardie sopra, e ricavarlo
  // di nuovo è meno fragile di un fallback che maschererebbe un `null` vero.
  const declaredSurplus = declaredValue - anchor.correctedAnchor;

  // La catena, esattamente come dichiarata nell'intestazione del file.
  const opportunityCost = alternative === null ? 0 : Math.max(0, alternative.surplus);
  const alpha = ALPHA_BY_PROFILE[profile];
  const fairToMeMaxRaw = floorCredits(declaredValue - opportunityCost * (1 - alpha));
  const fairToMeMaxEffective = Math.min(fairToMeMaxRaw, maxBid);
  if (fairToMeMaxEffective < COST_FLOOR) return spectator("below-cost-floor");

  const stretchCap = fairToMeMaxEffective;
  const takeUpTo = Math.max(
    COST_FLOOR,
    Math.min(stretchCap, floorCredits(anchor.correctedAnchor + bandMargin)),
  );

  // Width gate §4.2: «`no_target` non conserva né mostra una banda nascosta
  // come operativa». Quando scatta i numeri non escono, e il gate viaggia lo
  // stesso perché il motivo sia leggibile.
  const widthGate = widthGateFor(takeUpTo, stretchCap, team.budgetResidual);
  if (widthGate.verdict === "no_target") return spectator("band-too-wide", widthGate);

  const numbers: DecisionNumbers = {
    takeUpTo,
    stretchCap,
    fairToMeMaxEffective,
    fairToMeMaxRaw,
    widthGate,
    ratification: {
      ratified: false,
      unratifiedChoices: ["V_WITHOUT_EQUALS_OPPORTUNITY_COST"],
    },
    maxSafe: maxBid,
    profile,
    alpha,
    opportunityCost,
    bandMargin,
    provenance: DECLARED_VALUE_PROVENANCE,
    chainOk:
      COST_FLOOR <= takeUpTo &&
      takeUpTo <= stretchCap &&
      stretchCap <= fairToMeMaxEffective &&
      fairToMeMaxEffective <= maxBid,
  };

  // Un prezzo non finito o negativo non è un prezzo: nessuna barra, invece di
  // una barra che confronta la catena con un numero che non esiste. Stessa
  // postura di `purchaseFeasibility` sul prezzo invalido.
  const livePrice: LivePriceReadout | null =
    input.currentPrice === undefined ||
    !Number.isFinite(input.currentPrice) ||
    input.currentPrice < 0
      ? null
      : {
          currentPrice: input.currentPrice,
          vsCurrentAnchor: input.currentPrice - anchor.correctedAnchor,
          status:
            input.currentPrice <= takeUpTo
              ? "dentro-il-piano"
              : input.currentPrice <= stretchCap
                ? "in-stretch"
                : input.currentPrice <= maxBid
                  ? "oltre-lo-stop"
                  : "oltre-max-safe",
        };

  return {
    playerId,
    role,
    mode: declaredSurplus > 0 && quality.passes ? "occasione" : "target",
    anchor,
    tension: assessment,
    competitors,
    cliff,
    declaredValue,
    surplus,
    numbers,
    noTargetReason: null,
    planB: planBFor({ surplus: declaredSurplus }, alternative, cliff),
    quality,
    livePrice,
    withinRolePlan,
    widthGate,
  };
}
