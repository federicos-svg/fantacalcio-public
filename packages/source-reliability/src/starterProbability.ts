// LA COMBINAZIONE DELLE LETTURE DI PIÙ FONTI IN UNA PROBABILITÀ DI ESSERE
// TITOLARE. Funzioni pure, nessuna rete, nessun orologio, nessun caso.
//
// CHE COSA GARANTISCE. Date le letture che più fonti pubblicano sulla **stessa
// squadra** e la **stessa giornata** — per ciascun giocatore nominato uno stato
// dichiarato (titolare, ballottaggio, panchina, indisponibile) oppure una
// percentuale dichiarata dalla fonte — e il registro dell'affidabilità già
// misurata, questo modulo produce `pStarter` per ogni giocatore che almeno una
// fonte ha nominato. La combinazione avviene **in spazio logit**, con una media
// pesata dei logit delle probabilità dichiarate; il risultato è deterministico
// e ordinato: stesse letture in ingresso, stesso esito, nello stesso ordine.
//
// LA REGOLA DEI PESI, E PERCHÉ NON È UNA SCELTA DI QUESTO MODULO. Nessuna fonte
// si pesa prima di essere misurata. Quindi, **per squadra**: finché per quella
// squadra le giornate misurate non superano la soglia, le fonti si combinano a
// **pesi uguali**, e l'affidabilità misurata **non entra nel risultato** — il
// registro si legge per sapere a che punto è la squadra e per far girare
// l'ombra, non per pesare nessuno; oltre la soglia entrano i **pesi misurati**,
// senza che nessuno debba decidere. Il passaggio è per squadra e non globale: una squadra con sette
// giornate misurate usa i pesi misurati anche se un'altra ne ha due, perché
// l'affidabilità di una fonte su una squadra non è la sua affidabilità su
// un'altra, e mediarle sarebbe inventare misure che nessuno ha fatto.
//
// L'OMBRA. La combinazione pesata gira **anche sotto soglia**, come ombra
// accanto al risultato buono: così il giorno in cui i pesi misurati entrano si
// è già visto per settimane che cosa avrebbero cambiato, invece di scoprirlo
// quel giorno. L'ombra non è il risultato: `players` è il risultato, `shadow`
// sta accanto e porta scritto in faccia di essere un'ombra.
//
// CHE COSA NON GARANTISCE — e che cosa **non fa affatto**. Non acquisisce
// niente: le letture gliele passa chi le ha raccolte, con la loro targa. Non
// misura l'affidabilità: quella è `sourceAgreement.ts`, e qui entra già fatta,
// come conteggi. Non calcola `pPlays` e non conosce i subentri: la probabilità
// di **giocare** richiede la storia stagionale dei subentri del giocatore, che
// non vive in questo pacchetto, e una funzione che la inventasse qui
// restituirebbe un numero che nessuno ha misurato. Non conosce le formazioni
// **ufficiali**: qui entrano probabili, e un'ufficiale non è una probabile con
// una fiducia più alta — è un fatto, e va trattata dove i fatti entrano, non
// mescolata alle previsioni da una media. Non decide nulla di prodotto: non
// sceglie chi schierare, non ordina i giocatori per convenienza, non produce
// consigli.
//
// SCELTE TECNICHE DICHIARATE E CONTESTABILI (non decisioni di prodotto), tutte
// ancorate a un test che diventa rosso se qualcuno le cambia senza accorgersene:
// il numero di chiamate decise che vale una giornata (§«Il prior»); la media
// del prior quando non esiste ancora nessuna evidenza; il confine esatto della
// soglia — sei giornate misurate stanno ancora nei pesi uguali, la settima no;
// «giornata misurata per la squadra» definita come giornata misurata da almeno
// una fonte su quella squadra; il rifiuto — invece di una media inventata —
// quando la somma dei pesi è zero.

/** Versione della ricetta di combinazione: viaggia con l'esito, perché un numero senza la sua ricetta non è riproducibile. */
export const STARTER_COMBINATION_VERSION = "starter_probability_v1";

// ---------------------------------------------------------------------------
// Che cosa una fonte dice di un giocatore.
// ---------------------------------------------------------------------------

/**
 * Lo stato che una fonte dichiara. Quattro e non tre: «indisponibile» — che
 * copre anche lo squalificato — non è una panchina molto probabile, è
 * l'impossibilità di partire titolare, e tenerli insieme farebbe rientrare
 * dalla finestra, per media, un giocatore che non può scendere in campo.
 */
export type DeclaredStatus = "starter" | "doubt" | "bench" | "unavailable";

/**
 * La lettura di una fonte su un giocatore: o uno stato dichiarato, o una
 * percentuale che la fonte pubblica direttamente. Le due forme non si
 * mescolano in una sola: una percentuale è un numero che la fonte ha scritto,
 * uno stato è un'etichetta che noi traduciamo in numero, e sapere quale dei due
 * si sta guardando è metà del debug quando un `pStarter` non torna.
 */
export type SourceReading =
  | { readonly kind: "status"; readonly status: DeclaredStatus }
  | { readonly kind: "declaredProbability"; readonly probability: number };

/** Ciò che una fonte dice di un singolo giocatore. Chi non compare qui è silenzio, non panchina. */
export interface PlayerReading {
  readonly playerId: string;
  readonly reading: SourceReading;
}

/** Tutto ciò che una fonte dice di una squadra per una giornata. */
export interface SourceTeamReadings {
  readonly source: string;
  readonly readings: readonly PlayerReading[];
}

/**
 * Una riga del registro dell'affidabilità: quanto una fonte ha azzeccato su una
 * squadra, e su quante giornate. Sono i conteggi che `measureSourceAgreement`
 * già produce (`agreements`, `decided`, `matchdays` di `bySourceAndTeam`),
 * ricopiati qui come numeri e non importati come tipo: questo pacchetto resta
 * senza dipendenze, e chi chiama passa i tre numeri che ha in mano.
 *
 * Il registro che si passa contiene **tutte le squadre**, non solo quella che
 * si sta combinando: il prior è pooled su tutte le squadre, e senza le altre
 * righe non c'è niente da poolare.
 */
export interface SourceTeamReliability {
  readonly source: string;
  readonly team: string;
  /** Giornate in cui questa fonte è stata misurata su questa squadra. Intero ≥ 0. */
  readonly measuredMatchdays: number;
  /** Chiamate decise (accordi + disaccordi) su questa coppia fonte-squadra. Intero ≥ 0. */
  readonly decided: number;
  /** Quante di quelle chiamate erano accordi. Intero ≥ 0, mai più di `decided`. */
  readonly agreements: number;
}

// ---------------------------------------------------------------------------
// Le costanti dichiarate.
// ---------------------------------------------------------------------------

/**
 * Le probabilità dichiarate degli stati. Vengono dalla regola pre-registrata e
 * non sono una scelta di questo file: titolare `0,90`, ballottaggio `0,50`,
 * panchina `0,10`. La loro **calibrazione** — se un ballottaggio sia davvero
 * mezzo e mezzo — si misura altrove: qui sono costanti, dichiarate e visibili,
 * non numeri sparsi dentro un'espressione.
 */
export const Q_STARTER = 0.9;
export const Q_DOUBT = 0.5;
export const Q_BENCH = 0.1;

/**
 * Il ritaglio delle percentuali dichiarate. Una fonte che scrive `0%` o `100%`
 * sta dichiarando una certezza che, in logit, è infinita: da sola deciderebbe
 * la media qualunque cosa dicano le altre. Il ritaglio dice che una fonte può
 * essere quasi certa, non infallibile. Anche questi vengono dalla regola
 * pre-registrata.
 */
export const Q_CLIP_MIN = 0.02;
export const Q_CLIP_MAX = 0.98;

/**
 * La soglia, in giornate misurate **per squadra**. Sei giornate misurate stanno
 * ancora nei pesi uguali; dalla settima entrano i pesi misurati.
 *
 * SCELTA TECNICA DICHIARATA E CONTESTABILE — l'Executive, e non il documento:
 * la regola pre-registrata nomina «sei giornate» e «dalla settima» nella stessa
 * frase, e le due letture differiscono esattamente sul sesto. Qui il sesto sta
 * dalla parte dei pesi uguali, per la ragione che fa esistere la soglia: prima
 * di pesare una fonte la si vuole misurata *abbastanza*, e nel dubbio fra un
 * confine e il successivo si sceglie quello che misura di più. Chi la contesta
 * cambia questa costante, e due test diventano rossi: quello che fissa il
 * numero e quello che a sei giornate pretende ancora la media a pesi uguali.
 */
export const MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS = 6;

/**
 * IL PRIOR. La regola pre-registrata chiede un prior Beta pooled su tutte le
 * squadre, con pseudo-conteggi equivalenti a **due giornate**. Le due giornate
 * vengono da lì; quanto valga *una* giornata in chiamate decise no, e quel
 * pezzo è una scelta dichiarata qui.
 *
 * SCELTA TECNICA DICHIARATA E CONTESTABILE — l'Executive, e non il documento:
 * una giornata di chiamate decise su una squadra vale **undici** chiamate,
 * quanti sono i titolari che una formazione mette in campo. Le alternative
 * erano contare l'intera rosa nominata (venti e passa, e il prior peserebbe
 * come quattro giornate vere invece di due) o contare le sole chiamate
 * effettivamente decise nello storico (che farebbe dipendere il prior dai dati
 * che deve temperare — un prior che si adatta al campione non è più un prior).
 * Undici tiene la forza del prior dove la regola la voleva: due giornate, non
 * una e non quattro.
 *
 * Da qui: `PRIOR_PSEUDO_COUNTS = 2 × 11 = 22`, ripartiti fra `alpha` e `beta`
 * secondo la media pooled — `alpha = media × 22`, `beta = 22 − alpha`. La
 * ripartizione non è una scelta libera: è la media pooled che la regola chiede,
 * espressa in pseudo-conteggi.
 */
export const PRIOR_STRENGTH_MATCHDAYS = 2;
export const DECIDED_CALLS_PER_MATCHDAY = 11;
export const PRIOR_PSEUDO_COUNTS = PRIOR_STRENGTH_MATCHDAYS * DECIDED_CALLS_PER_MATCHDAY;

/**
 * La media del prior quando non c'è **nessuna** evidenza pooled: nessuna fonte
 * ha ancora una sola chiamata decisa da nessuna parte.
 *
 * SCELTA TECNICA DICHIARATA E CONTESTABILE — l'Executive, e non il documento:
 * `0,5`, cioè «non ne so niente». Qualunque altro numero sarebbe una
 * preferenza mascherata da default, e siccome il prior è pooled *fra le fonti
 * pesate allo stesso modo*, un prior diverso da mezzo sposterebbe i pesi
 * relativi senza che nessuno abbia misurato nulla. In pratica questo numero non
 * si vede quasi mai: sotto soglia i pesi sono uguali e il prior non viene
 * nemmeno letto, e dalla settima giornata l'evidenza pooled esiste per
 * costruzione. Resta per i casi di frontiera — l'ombra alla prima giornata —
 * dove l'alternativa sarebbe una divisione per zero o un rifiuto.
 */
export const PRIOR_MEAN_WITHOUT_EVIDENCE = 0.5;

// ---------------------------------------------------------------------------
// L'esito.
// ---------------------------------------------------------------------------

/** A pesi uguali oppure a pesi misurati: due regimi, mai una via di mezzo implicita. */
export type WeightingRegime = "equal" | "measured";

/** Perché quel regime, in un codice invece che in prosa da interpretare. */
export type WeightingReason =
  /** Le giornate misurate per la squadra non superano la soglia. */
  | "below_threshold_equal_weights"
  /** Le giornate misurate per la squadra superano la soglia: i pesi entrano da soli. */
  | "threshold_passed_measured_weights";

/** Il peso di una fonte su questa squadra, con i conti che l'hanno prodotto. */
export interface SourceWeight {
  readonly source: string;
  readonly weight: number;
  /** Giornate misurate per **questa** coppia fonte-squadra. Zero se la fonte non compare nel registro. */
  readonly measuredMatchdays: number;
  /** `alpha` del prior Beta per questa fonte: media pooled × pseudo-conteggi. */
  readonly priorAlpha: number;
  /** `beta` del prior Beta per questa fonte: pseudo-conteggi − `alpha`. */
  readonly priorBeta: number;
}

/** Che cosa una singola fonte ha portato nella media, per un singolo giocatore. */
export interface SourceContribution {
  readonly source: string;
  /**
   * La probabilità dichiarata, già tradotta e già ritagliata: **è questa** che
   * è entrata nel logit — tranne nell'unico caso in cui nessun logit è stato
   * calcolato, cioè una fonte che dà il giocatore indisponibile, dove `q` vale
   * `0` e il giocatore esce `pStarter = 0` per il caso e non per la media.
   */
  readonly q: number;
  /** Il peso applicato a questo logit. */
  readonly weight: number;
}

/** Il risultato per un giocatore, con addosso tutto ciò che serve a rifarlo a mano. */
export interface CombinedStarterProbability {
  readonly playerId: string;
  /**
   * `null` quando ogni fonte che l'ha nominato porta peso zero: la media
   * avrebbe denominatore zero, e il numero che si mettesse lì al suo posto non
   * l'avrebbe misurato nessuno. Succede solo a pesi misurati, e solo per una
   * fonte misurata sempre in errore. Mai un mezzo inventato per non scrivere
   * `null`.
   */
  readonly pStarter: number | null;
  /**
   * `true` quando almeno una fonte lo dà indisponibile o squalificato: in quel
   * caso `pStarter` è `0` per decisione e non per media, e le altre fonti non
   * lo risollevano. In logit quella dichiarazione è −∞, e −∞ in una media
   * pesata vince su tutto; qui si scrive come un caso, non come un infinito che
   * attraversa un'esponenziale.
   */
  readonly decidedByUnavailability: boolean;
  /** Chi ha parlato di lui, in ordine alfabetico di fonte. Chi ha taciuto non compare. */
  readonly contributors: readonly SourceContribution[];
}

/** La combinazione pesata che gira sotto soglia: si guarda, non si usa. */
export interface ShadowCombination {
  readonly weighting: "measured";
  readonly weights: readonly SourceWeight[];
  readonly players: readonly CombinedStarterProbability[];
}

export interface StarterProbabilityReport {
  readonly combinationVersion: typeof STARTER_COMBINATION_VERSION;
  readonly team: string;
  readonly matchday: number;
  /** Il regime applicato a `players`. */
  readonly weighting: WeightingRegime;
  readonly weightingReason: WeightingReason;
  /**
   * Giornate misurate **per la squadra**: il massimo fra le fonti, cioè una
   * giornata conta come misurata se almeno una fonte l'ha misurata su questa
   * squadra. Scelta tecnica dichiarata e contestabile: la soglia parla della
   * squadra, non della singola coppia, e prendere il minimo farebbe dipendere
   * l'intera squadra dalla fonte arrivata per ultima.
   */
  readonly teamMeasuredMatchdays: number;
  /** I pesi effettivamente applicati a `players`. Sotto soglia sono tutti `1`. */
  readonly weights: readonly SourceWeight[];
  /** Un giocatore per ogni nome pronunciato da almeno una fonte, in ordine alfabetico. */
  readonly players: readonly CombinedStarterProbability[];
  /**
   * La combinazione a pesi misurati che gira in ombra sotto soglia. `null`
   * quando il risultato buono è **già** a pesi misurati — un'ombra identica al
   * risultato non è un'ombra, è un doppione che invecchia male.
   */
  readonly shadow: ShadowCombination | null;
  /** Fatti dichiarati che non sono errori ma che chi legge deve sapere. */
  readonly notices: readonly string[];
}

/** Perché una combinazione non si fa. Codici, non prosa da interpretare. */
export type CombinationRejectionCode =
  | "empty_identifier"
  | "invalid_matchday"
  | "no_readings"
  | "source_listed_twice"
  | "player_listed_twice"
  | "probability_out_of_range"
  | "reliability_row_twice"
  | "reliability_counts_invalid"
  | "no_usable_weight";

export interface CombinationRejection {
  readonly code: CombinationRejectionCode;
  readonly detail: string;
}

export type StarterProbabilityOutcome =
  | { readonly ok: true; readonly report: StarterProbabilityReport }
  | { readonly ok: false; readonly rejections: readonly CombinationRejection[] };

// ---------------------------------------------------------------------------
// Spazio logit.
// ---------------------------------------------------------------------------

/**
 * Perché in logit e non sulle probabilità. Mediare `0,9` e `0,1` dà `0,5`, che
 * è ragionevole; ma mediare `0,98` e `0,90` dà `0,94`, cioè **meno** di quanto
 * dice la fonte meno sicura delle due, e due fonti che concordano su «quasi
 * certamente titolare» non possono produrre un dubbio. In logit le evidenze si
 * sommano invece di annacquarsi, ed è la forma che la regola pre-registrata
 * scrive.
 */
export function logit(p: number): number {
  return Math.log(p / (1 - p));
}

/** L'inversa di `logit`. */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * La probabilità dichiarata da una lettura, già ritagliata. `null` significa
 * «indisponibile»: non è un numero basso, è il caso che decide da solo.
 */
export function declaredProbabilityOf(reading: SourceReading): number | null {
  if (reading.kind === "status") {
    switch (reading.status) {
      case "starter":
        return Q_STARTER;
      case "doubt":
        return Q_DOUBT;
      case "bench":
        return Q_BENCH;
      case "unavailable":
        return null;
    }
  }
  return clip(reading.probability);
}

function clip(p: number): number {
  if (p < Q_CLIP_MIN) return Q_CLIP_MIN;
  if (p > Q_CLIP_MAX) return Q_CLIP_MAX;
  return p;
}

// ---------------------------------------------------------------------------
// I pesi.
// ---------------------------------------------------------------------------

/**
 * Il peso misurato di una fonte su una squadra: la media a posteriori del prior
 * Beta pooled aggiornato con i conteggi di quella coppia.
 *
 *     alpha = mediaPooled × PRIOR_PSEUDO_COUNTS
 *     beta  = PRIOR_PSEUDO_COUNTS − alpha
 *     peso  = (accordi + alpha) / (decise + alpha + beta)
 *
 * La media pooled è quella della fonte **su tutte le squadre del registro**,
 * quella compresa: è ciò che «pooled su tutte le squadre» vuol dire, ed è anche
 * l'unico modo perché una fonte misurata poco su una squadra parta da dove la
 * si è vista andare altrove invece che da mezzo.
 */
export function measuredWeight(options: {
  readonly pooledAgreements: number;
  readonly pooledDecided: number;
  readonly agreements: number;
  readonly decided: number;
}): { readonly weight: number; readonly priorAlpha: number; readonly priorBeta: number } {
  const pooledMean =
    options.pooledDecided > 0 ? options.pooledAgreements / options.pooledDecided : PRIOR_MEAN_WITHOUT_EVIDENCE;
  const priorAlpha = pooledMean * PRIOR_PSEUDO_COUNTS;
  const priorBeta = PRIOR_PSEUDO_COUNTS - priorAlpha;
  const weight = (options.agreements + priorAlpha) / (options.decided + priorAlpha + priorBeta);
  return { weight, priorAlpha, priorBeta };
}

// ---------------------------------------------------------------------------
// Validazione.
// ---------------------------------------------------------------------------

function isNonEmptyId(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice].sort();
}

// ---------------------------------------------------------------------------
// La combinazione.
// ---------------------------------------------------------------------------

/**
 * Combina le letture di più fonti sulla stessa squadra e la stessa giornata in
 * una `pStarter` per giocatore, oppure rifiuta con tutti i motivi.
 *
 * Sotto soglia il registro dell'affidabilità **non tocca il risultato**: i pesi
 * sono `1` per costruzione e non per coincidenza numerica, e lo stesso registro
 * serve solo a produrre l'ombra. È la proprietà che rende vera la frase «il
 * champion usa pesi uguali», ed è provata da un test che cambia l'affidabilità
 * in modo drastico e pretende lo stesso identico risultato.
 */
export function combineStarterProbabilities(input: {
  readonly team: string;
  readonly matchday: number;
  readonly sources: readonly SourceTeamReadings[];
  /** Il registro di **tutte** le squadre, non solo di questa: il prior è pooled. */
  readonly reliability: readonly SourceTeamReliability[];
}): StarterProbabilityOutcome {
  const rejections: CombinationRejection[] = [];
  const notices: string[] = [];

  if (!isNonEmptyId(input.team)) {
    rejections.push({ code: "empty_identifier", detail: "squadra senza identificativo" });
  }
  if (!Number.isInteger(input.matchday) || input.matchday <= 0) {
    rejections.push({ code: "invalid_matchday", detail: `giornata non valida (${String(input.matchday)})` });
  }
  if (input.sources.length === 0) {
    rejections.push({ code: "no_readings", detail: "nessuna fonte ha letto questa squadra in questa giornata" });
  }

  for (const twice of duplicates(input.sources.map((s) => s.source))) {
    rejections.push({ code: "source_listed_twice", detail: `fonte ${twice} dichiarata due volte` });
  }

  for (const source of input.sources) {
    const where = `fonte ${source.source}`;
    if (!isNonEmptyId(source.source)) {
      rejections.push({ code: "empty_identifier", detail: "fonte senza identificativo" });
    }
    for (const twice of duplicates(source.readings.map((r) => r.playerId))) {
      rejections.push({ code: "player_listed_twice", detail: `${where}: ${twice} dichiarato due volte` });
    }
    for (const reading of source.readings) {
      if (!isNonEmptyId(reading.playerId)) {
        rejections.push({ code: "empty_identifier", detail: `${where}: giocatore senza identificativo` });
      }
      if (reading.reading.kind === "declaredProbability") {
        const p = reading.reading.probability;
        if (!Number.isFinite(p) || p < 0 || p > 1) {
          rejections.push({
            code: "probability_out_of_range",
            detail: `${where}: ${reading.playerId} con percentuale dichiarata fuori da [0, 1] (${String(p)})`,
          });
        }
      }
    }
  }

  for (const twice of duplicates(input.reliability.map((row) => `${row.source}@${row.team}`))) {
    rejections.push({ code: "reliability_row_twice", detail: `registro: ${twice} compare due volte` });
  }
  for (const row of input.reliability) {
    const where = `registro ${row.source}@${row.team}`;
    if (!isNonEmptyId(row.source) || !isNonEmptyId(row.team)) {
      rejections.push({ code: "empty_identifier", detail: `${where}: fonte o squadra senza identificativo` });
    }
    if (!isCount(row.measuredMatchdays) || !isCount(row.decided) || !isCount(row.agreements)) {
      rejections.push({ code: "reliability_counts_invalid", detail: `${where}: conteggi non interi non negativi` });
    } else if (row.agreements > row.decided) {
      rejections.push({
        code: "reliability_counts_invalid",
        detail: `${where}: ${row.agreements} accordi su ${row.decided} chiamate decise`,
      });
    }
  }

  if (rejections.length > 0) return { ok: false, rejections };

  // --- il regime, per questa squadra ---

  const hereByTeam = input.reliability.filter((row) => row.team === input.team);
  const teamMeasuredMatchdays = hereByTeam.reduce((most, row) => Math.max(most, row.measuredMatchdays), 0);
  const measuredRegime = teamMeasuredMatchdays > MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS;

  const sources = [...input.sources].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

  const equalWeights: SourceWeight[] = sources.map((source) => ({
    source: source.source,
    weight: 1,
    measuredMatchdays: hereByTeam.find((row) => row.source === source.source)?.measuredMatchdays ?? 0,
    priorAlpha: Number.NaN,
    priorBeta: Number.NaN,
  }));

  const measuredWeights: SourceWeight[] = sources.map((source) => {
    const here = hereByTeam.find((row) => row.source === source.source);
    const pooled = input.reliability.filter((row) => row.source === source.source);
    const computed = measuredWeight({
      pooledAgreements: pooled.reduce((sum, row) => sum + row.agreements, 0),
      pooledDecided: pooled.reduce((sum, row) => sum + row.decided, 0),
      agreements: here?.agreements ?? 0,
      decided: here?.decided ?? 0,
    });
    return {
      source: source.source,
      weight: computed.weight,
      measuredMatchdays: here?.measuredMatchdays ?? 0,
      priorAlpha: computed.priorAlpha,
      priorBeta: computed.priorBeta,
    };
  });

  // I pesi uguali non portano un prior, perché non ne usano nessuno: scrivere
  // `alpha` e `beta` di un prior mai consultato inviterebbe a leggerli come se
  // avessero agito. `NaN` qui è la dichiarazione «non pertinente», e il campo
  // resta nel tipo perché la forma dell'esito non cambia col regime.
  const weights = measuredRegime ? measuredWeights : equalWeights;

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (!(totalWeight > 0)) {
    return {
      ok: false,
      rejections: [
        {
          code: "no_usable_weight",
          detail:
            "la somma dei pesi misurati è zero: nessuna fonte porta evidenza, e una media con denominatore zero sarebbe un numero inventato",
        },
      ],
    };
  }

  if (measuredRegime) {
    notices.push(
      `pesi misurati: la squadra ha ${String(teamMeasuredMatchdays)} giornate misurate, oltre le ${String(MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS)} a pesi uguali`,
    );
  } else {
    notices.push(
      `pesi uguali: la squadra ha ${String(teamMeasuredMatchdays)} giornate misurate, non oltre le ${String(MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS)} — il registro dell'affidabilità non è entrato nel risultato`,
    );
  }

  const players = combineWith(sources, weights);
  const shadowUsable = measuredWeights.reduce((sum, w) => sum + w.weight, 0) > 0;
  const shadow: ShadowCombination | null =
    measuredRegime || !shadowUsable
      ? null
      : { weighting: "measured", weights: measuredWeights, players: combineWith(sources, measuredWeights) };

  if (!measuredRegime && shadow === null) {
    notices.push("nessuna ombra: i pesi misurati sommerebbero zero, e un'ombra senza denominatore non si guarda");
  }

  return {
    ok: true,
    report: {
      combinationVersion: STARTER_COMBINATION_VERSION,
      team: input.team,
      matchday: input.matchday,
      weighting: measuredRegime ? "measured" : "equal",
      weightingReason: measuredRegime ? "threshold_passed_measured_weights" : "below_threshold_equal_weights",
      teamMeasuredMatchdays,
      weights,
      players,
      shadow,
      notices,
    },
  };
}

/**
 * La media pesata dei logit, giocatore per giocatore. Le fonti arrivano già
 * ordinate: l'ordine della somma è parte del risultato, perché due somme in
 * virgola mobile fatte in ordine diverso non danno lo stesso bit, e un esito
 * che dipende dall'ordine in cui il chiamante ha passato le fonti non sarebbe
 * riproducibile.
 */
function combineWith(
  sources: readonly SourceTeamReadings[],
  weights: readonly SourceWeight[],
): readonly CombinedStarterProbability[] {
  const weightOf = new Map(weights.map((w) => [w.source, w.weight]));

  const playerIds = new Set<string>();
  for (const source of sources) {
    for (const reading of source.readings) playerIds.add(reading.playerId);
  }

  const combined: CombinedStarterProbability[] = [];
  for (const playerId of [...playerIds].sort()) {
    const contributors: SourceContribution[] = [];
    let unavailable = false;
    let weightedLogits = 0;
    let totalWeight = 0;

    for (const source of sources) {
      const reading = source.readings.find((r) => r.playerId === playerId);
      if (reading === undefined) continue; // silenzio: non è panchina.
      const weight = weightOf.get(source.source) ?? 0;
      const q = declaredProbabilityOf(reading.reading);
      if (q === null) {
        unavailable = true;
        contributors.push({ source: source.source, q: 0, weight });
        continue;
      }
      contributors.push({ source: source.source, q, weight });
      weightedLogits += weight * logit(q);
      totalWeight += weight;
    }

    const pStarter = unavailable ? 0 : totalWeight > 0 ? logistic(weightedLogits / totalWeight) : null;
    combined.push({ playerId, pStarter, decidedByUnavailability: unavailable, contributors });
  }
  return combined;
}
