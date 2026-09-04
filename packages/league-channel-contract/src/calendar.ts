// CALENDARIO OSSERVATO — due competizioni, e la giornata che non si indovina.
//
// LA LEGA HA DUE MANIFESTAZIONI. Campionato (§22) e Coppa di Lega (§23) non
// sono due viste della stessa cosa: nelle giornate di coppa si giocano **due
// partite**, con **due avversari diversi**, e si schierano **due formazioni**.
// La chiave di una sfida non è quindi la giornata, è la coppia
// **(competizione, giornata)** — e un tipo che assumesse una partita per
// giornata sarebbe sbagliato di struttura, non di dettaglio: perderebbe una
// delle due sfide senza nemmeno poterlo segnalare. Per questo `ObservedCalendar`
// raggruppa le sfide per competizione e non le appiattisce mai.
//
// PERCHÉ QUESTO FILE È QUASI TUTTO FAIL-CLOSED. Il `GameweekContext` che
// `packages/league-gameweek` consuma ha due campi soli, `matchday` e
// `weAreHome`, e valgono entrambi un punteggio: §14 dà +2 alla squadra di casa
// **fino alla 28ª** e zero dalla 29ª. Sbagliare il campo vale due punti su una
// fascia da sei — un terzo di goal; sbagliare la giornata li vale tutti e due e
// in più sposta il confine del campo neutro; sbagliare la competizione li
// applica alla partita dell'altro avversario. Non c'è nessun valore di ripiego
// sensato per nessuno dei tre: `false` non è «non so se giochiamo in casa», è
// «giochiamo fuori», ed è una dichiarazione che nessuno ha fatto.
//
// LA GIORNATA SI DICHIARA DUE VOLTE, e la competizione anche. `toGameweekContext`
// prende il fixture, la giornata attesa e la competizione attesa, e pretende
// che coincidano. Sembra ridondante e non lo è: il chiamante sa per quale
// partita sta schierando, il fixture sa da quale lettura viene, e l'unico modo
// di accorgersi di una lettura vecchia o della sfida sbagliata — la pagina
// della giornata scorsa, la coppa scambiata col campionato in una giornata che
// ne ha due — è confrontarli. Una formazione giusta per la partita sbagliata è
// persa comunque.
//
// Le date restano stringhe opache e non vengono interpretate: qui non si
// costruisce nessuna `Date`, non si legge nessun orologio, e la deadline serve
// a chi decide *quando* agire — fuori da questo pacchetto, che è puro.
//
// L'UNICA COSA CHE QUESTO FILE **RISOLVE** È IL DOPPIO CONFRONTO DI COPPA, e la
// risolve perché qualcuno l'ha decisa. `resolveKnockoutQualification` era
// fail-closed su tutto finché il criterio di parità non esisteva; **Pico l'ha
// dichiarato il 2026-09-04**, in modale, testuale: «*Chi ha totalizzato più
// punti fantacalcio nelle due partite*». Da lì la funzione decide il turno a
// eliminazione diretta: prima i punti 3 / 1 / 0 del mini girone di due squadre
// (§22 applicato a ciascuna delle due gare, §23), poi — solo a parità — la
// somma dei punteggi fantacalcio delle due gare.
//
// CHE COSA SIA UN «PUNTO FANTACALCIO» — **interpretazione dell'Executive,
// 2026-09-04, dichiarata e contestabile.** «Punti fantacalcio di una gara»
// significa il **punteggio finale della squadra in quella gara**: quello
// comprensivo dei modificatori (§9 modulo, §19 difesa, §20 centrocampo, §21
// attacco) e di tutto ciò che il regolamento fa entrare nel totale — il numero
// che compare accanto alla squadra a fine giornata. Il «lordo senza
// modificatori» non è un numero che esista da qualche parte, quindi non può
// essere ciò che Pico intendeva.
//
// **Non è una decisione di prodotto**, ed è per questo che non è stata portata
// a Pico: è il significato che l'espressione ha già nel gioco, cioè
// un'interpretazione del testo di una decisione presa, non una regola nuova.
// Le scelte tecniche le fa l'Executive e le dichiara come proprie: questa è una
// di quelle, e chi non è d'accordo la contesta qui. Sul piano del codice ha una
// conseguenza sola: `fantasyPoints` è il punteggio **dichiarato**
// dall'osservazione, e questa funzione non aggiunge né toglie nulla.
//
// **CIÒ CHE RESTA INDECISO È INDECISO PERCHÉ NESSUNO L'HA DECISO**, non perché
// manchi codice. Tre casi:
//  - la parità che sopravvive *anche* alla somma dei punteggi fantacalcio;
//  - la parità nel **girone da quattro** (§23,
//    `cup_group_ranking_criteria: UNSPECIFIED`), su cui la decisione del
//    2026-09-04 non dice nulla — parla delle «due partite» di un doppio
//    confronto, e un girone da quattro non ne ha due;
//  - lo scontro **a cavallo del limite di §14**, spiegato qui sotto.
//
// **IL BONUS CAMPO DI §14 SI ANNULLA — TRANNE A CAVALLO DELLA 28ª.** Nel caso
// normale la preoccupazione non morde: le due gare hanno il campo invertito,
// quindi ciascuna squadra incassa il +2 **una volta sola** nella somma, e la
// differenza fra le due somme è identica con o senza. Vale in entrambi i versi
// e anche quando **nessuna** delle due gare ha il bonus (entrambe dalla 29ª in
// poi): ciò che conta è che le due gare stiano **dalla stessa parte** del
// limite. Non si annulla quando lo scontro è a cavallo — andata entro la 28ª,
// ritorno dalla 29ª: lì il +2 entra in **una sola** delle due somme, e a
// riceverlo è chi ha giocato in casa per primo. Col calendario di coppa (§23:
// 5, 8, 11, 14, 17, 20, 24, 28, 32) il caso è **concreto**, non teorico: la
// coppia **28 e 32** lo produce, ed è la finale — dove però non c'è un doppio
// confronto — oltre a qualsiasi turno che il calendario osservato spostasse a
// cavallo. Che cosa decida in quel caso Pico non l'ha detto, quindi è il terzo
// rifiuto per decisione mancante e non una correzione applicata d'ufficio:
// togliere il +2 «per simmetria» sarebbe inventare il criterio invece di
// chiederlo.
//
// Nessuno di questi tre rifiuti va «aggiustato»: si sbloccano con una nuova
// dichiarazione di Pico registrata in `docs/data/LEAGUE_RULES.md` §23, non con
// un criterio dedotto qui. Dettaglio, codici e confini: la prosa davanti a
// `resolveKnockoutQualification`.

import { homeFieldBonus } from "../../league-gameweek/src/leagueGameweek.js";
import type { GameweekContext } from "../../league-gameweek/src/gameweekSimulator.js";

/** Dove si gioca, dal nostro punto di vista. */
export type ObservedVenue = "casa" | "trasferta";

/**
 * Che competizione è. **Dichiarato, mai dedotto**: `sconosciuto` è un valore
 * legittimo e va usato quando la piattaforma non lo dice. Indovinarlo dal nome
 * («c'è scritto coppa, sarà la coppa») sarebbe un'imputazione, e da qui
 * deriverebbe quale regolamento di classifica si applica.
 */
export type ObservedCompetitionKind = "campionato" | "coppa" | "sconosciuto";

/**
 * Fase della coppa (§23): girone, eliminazione diretta, finale.
 *
 * **Dichiarata, mai dedotta dalla giornata.** La costante del regolamento qui
 * sotto dice quale fase ci si *aspetta* in quale giornata; da lì a scrivere la
 * fase su una sfida che non la dichiara ci sarebbe un'imputazione, e sarebbe
 * proprio quella a nascondere un calendario cambiato.
 */
export type ObservedCupPhase = "girone" | "eliminazione" | "finale";

/**
 * Andata o ritorno. Girone ed eliminazione diretta si giocano su due gare (§23);
 * la **finale è secca** e non ha andata né ritorno, quindi lì il campo resta
 * `undefined` — che è «non c'è», non «non osservato». La distinzione fra i due
 * la porta `cupPhase`, e nessuna delle due si deduce dall'altra.
 */
export type ObservedLeg = "andata" | "ritorno";

/** Una competizione della lega, con id opaco. */
export interface ObservedCompetition {
  /** Identificatore opaco, generato fuori da qui. Mai un id della piattaforma. */
  readonly competitionId: string;
  /** Etichetta osservata, se c'era. Non decide `kind`. */
  readonly name?: string;
  readonly kind: ObservedCompetitionKind;
}

/**
 * Una sfida di calendario, come la piattaforma la espone. Tutti i campi sono
 * opzionali: `undefined` è «non osservato», e per `competitionId`, `matchday` e
 * `venue` è un motivo sufficiente per non schierare.
 */
export interface ObservedFixture {
  /** A quale competizione appartiene questa sfida. */
  readonly competitionId?: string;
  readonly matchday?: number;
  /** Avversario di lega, id opaco. Mai un nome. */
  readonly opponentTeamId?: string;
  /**
   * Casa o trasferta. È una proprietà della **singola partita** e alimenta il
   * fattore campo di §14 esattamente come in campionato: anche una gara secca
   * ha un campo, e anche lì è dichiarato e mai dedotto.
   */
  readonly venue?: ObservedVenue;
  /** Fase di coppa, se la sfida ne ha una e la piattaforma la dichiara. */
  readonly cupPhase?: ObservedCupPhase;
  /** Andata o ritorno, dove la fase ne prevede due. Assente in finale. */
  readonly leg?: ObservedLeg;
  /**
   * Calcio d'inizio, stringa opaca così come letta. Non viene interpretata né
   * confrontata con un orologio: questo pacchetto non ne ha uno.
   */
  readonly kickoffAt?: string;
  /** Chiusura della formazione, stessa natura opaca di `kickoffAt`. */
  readonly deadlineAt?: string;
}

/** Le sfide di UNA competizione, nell'ordine in cui la fonte le espone. */
export interface ObservedCompetitionFixtures {
  readonly competition: ObservedCompetition;
  readonly fixtures: readonly ObservedFixture[];
}

/**
 * Il calendario osservato di una squadra: una lista per competizione, mai una
 * lista piatta di giornate.
 */
export interface ObservedCalendar {
  readonly teamId: string;
  readonly competitions: readonly ObservedCompetitionFixtures[];
}

/**
 * STRUTTURA DELLA COPPA DI LEGA SECONDO IL REGOLAMENTO (§23).
 *
 * **Due mini gironi da quattro squadre, andata e ritorno** — tre avversari per
 * due gare fanno sei giornate: 5, 8, 11, 14, 17, 20. Poi **le prime due di ogni
 * girone alle eliminazioni dirette, andata e ritorno** (24 e 28), e infine la
 * **finale in gara secca** (32). Le regole di punteggio sono le stesse del
 * campionato: cambia il tabellone, non l'aritmetica.
 *
 * **AVVERTENZA, e non è formale.** Questo è un dato del REGOLAMENTO, non
 * un'osservazione della piattaforma. Serve a sapere che cosa aspettarsi — in
 * quelle giornate ci sono due partite — non a decidere che cosa c'è: se il
 * calendario osservato dice altro, **prevale l'osservato**, e la differenza è
 * una divergenza dichiarata da portare a Pico (§28 change control), mai
 * un'imputazione e mai una sfida aggiunta d'ufficio a un calendario che non la
 * contiene. Nessuna funzione di questo pacchetto costruisce sfide da qui, e
 * nessuna scrive `cupPhase` o `leg` su una sfida che non li dichiara.
 *
 * **COSA NON C'È, di proposito**: nessuna logica di qualificazione, nessun
 * tabellone, nessuna regola di supplementari o rigori. §23 rinvia per quelle a
 * una pagina esterna e vieta di ricostruirne il contenuto: il contratto
 * **osserva** la coppa, non la simula.
 */
export const COPPA_STRUCTURE_2026_27 = {
  /** Due gironi da quattro, andata e ritorno. */
  groupStageMatchdays: [5, 8, 11, 14, 17, 20],
  /** Eliminazione diretta fra le prime due di ogni girone, andata e ritorno. */
  knockoutMatchdays: [24, 28],
  /** Finale, gara secca. */
  finalMatchday: 32,
} as const;

/** Le nove giornate in cui il regolamento prevede anche una partita di coppa. */
export const COPPA_MATCHDAYS_2026_27: readonly number[] = [
  ...COPPA_STRUCTURE_2026_27.groupStageMatchdays,
  ...COPPA_STRUCTURE_2026_27.knockoutMatchdays,
  COPPA_STRUCTURE_2026_27.finalMatchday,
];

/**
 * `true` se il regolamento (§23) prevede una partita di coppa in quella
 * giornata. Vedi l'avvertenza su `COPPA_STRUCTURE_2026_27`: è un'attesa, non
 * un'osservazione.
 */
export function isCupMatchday(matchday: number): boolean {
  assertMatchday(matchday);
  return COPPA_MATCHDAYS_2026_27.includes(matchday);
}

/**
 * La fase che il regolamento si aspetta in quella giornata, o `null` se il
 * regolamento non prevede coppa. **Serve a confrontare, non a compilare**: la
 * fase di una sfida è quella che la sfida dichiara, e una differenza fra le due
 * è una divergenza da registrare, mai una correzione.
 */
export function expectedCupPhase(matchday: number): ObservedCupPhase | null {
  assertMatchday(matchday);
  const groupStage: readonly number[] = COPPA_STRUCTURE_2026_27.groupStageMatchdays;
  const knockout: readonly number[] = COPPA_STRUCTURE_2026_27.knockoutMatchdays;
  if (groupStage.includes(matchday)) return "girone";
  if (knockout.includes(matchday)) return "eliminazione";
  if (matchday === COPPA_STRUCTURE_2026_27.finalMatchday) return "finale";
  return null;
}

/**
 * FORMA DI PUNTEGGIO DI UNA FASE DI COPPA (§23).
 *
 * **Da dove viene questo numero, perché la domanda è già stata fatta una
 * volta.** Non è un travaso dei 3/1/0 di §22 sulla coppa per analogia col
 * campionato — §22 è la classifica del campionato e la coppa aveva
 * `head_to_head_table_algorithm: UNSPECIFIED`. Viene da una **dichiarazione di
 * Pico del 2026-09-03**, testuale: «Durante i gironi di coppa ci sono i
 * punteggi 3/1/0 mentre alle eliminazioni dirette funziona come alle
 * eliminazioni delle coppe ovvero un mini girone di due squadre che si
 * affrontano andata e ritorno», registrata in `docs/data/LEAGUE_RULES.md` §23 e
 * nel record di `docs/DECISIONS.md`.
 *
 * - `punti_3_1_0` — **girone**: i punti sono quelli dichiarati per i gironi di
 *   coppa. E **eliminazione diretta**, ma per una ragione sua: il turno **è un
 *   mini girone di due squadre** andata e ritorno, quindi si legge come un
 *   girone perché lo è, non perché somigli al campionato.
 * - `gara_secca` — la **finale**, che sta fuori dal mini girone.
 *
 * Le regole di punteggio della singola giornata non cambiano mai fra le due
 * competizioni: cambia solo come si legge il turno. Le due gare di un turno
 * restano due giornate distinte, ciascuna col suo campo e il suo §14.
 */
export type CupScoringShape = "punti_3_1_0" | "gara_secca";

/** Che forma di punteggio si applica a una fase. Dichiarazione, non calcolo. */
export function cupScoringShape(phase: ObservedCupPhase): CupScoringShape {
  return phase === "finale" ? "gara_secca" : "punti_3_1_0";
}

/**
 * L'eliminazione diretta è un mini girone da due, non una gara con ritorno
 * «di rimonta»: il turno vale come un girone di due squadre.
 */
export const KNOCKOUT_IS_MINI_GROUP = true as const;

/**
 * CHI PASSA IL TURNO — **un caso deciso e due che restano indecisi**.
 *
 * **Che cosa è deciso, da chi, quando.** Il criterio di parità del doppio
 * confronto a eliminazione diretta l'ha dichiarato **Pico il 2026-09-04**, in
 * modale, testuale: «*Chi ha totalizzato più punti fantacalcio nelle due
 * partite*». Prima di quella frase questa funzione rifiutava tutto, perché il
 * criterio non esisteva; ora risolve il caso dichiarato e continua a rifiutare
 * gli altri due.
 *
 * **L'ordine dei criteri** è quello del regolamento più la decisione:
 *  1. il turno è un **mini girone di due squadre** (`KNOCKOUT_IS_MINI_GROUP`,
 *     §23): i punti 3 / 1 / 0 di §22 si assegnano **su ciascuna delle due
 *     gare**, e la somma decide il turno prima di ogni altro criterio;
 *  2. a parità di punti, la **somma dei punteggi fantacalcio delle due gare**
 *     (Pico, 2026-09-04);
 *  3. a parità anche lì, **non decidibile**.
 *
 * **CHE COSA RESTA INDECISO — e non è un limite tecnico.** I tre rifiuti che
 * restano non sono un pezzo di codice mancante, sono una **decisione mancante**:
 *  - `parita_dopo_punteggi_fantacalcio` — che cosa succede se *anche* la somma
 *    dei punteggi fantacalcio è pari: Pico non l'ha detto, e §23 rinvia per
 *    supplementari e rigori a una pagina esterna che §27 punto 8 vieta di
 *    ricostruire;
 *  - `girone_da_quattro_non_dichiarato` — il criterio di parità della **fase a
 *    gironi** (§23, `cup_group_ranking_criteria: UNSPECIFIED`), che la decisione
 *    del 2026-09-04 **non** tocca: parla delle «due partite» di un doppio
 *    confronto, e il girone da quattro non ne ha due;
 *  - `cavallo_del_campo_neutro_non_dichiarato` — lo scontro **a cavallo del
 *    limite di §14**, dove il +2 entra in una sola delle due somme e a
 *    incassarlo è chi ha giocato in casa per primo. Fuori da quel caso il bonus
 *    campo **si annulla** e la somma è confrontabile senza alcuna correzione
 *    (vedi la prosa in testa al file); dentro, il criterio di parità non è
 *    dichiarato per quel caso e la decisione è di Pico. Questo rifiuto si
 *    incontra **solo al secondo criterio**: se il mini girone ha già deciso il
 *    turno, il fattore campo non c'entra nulla — i punti vengono dai goal — e
 *    fermarsi lì sarebbe inventare un limite che nessuno ha posto.
 *
 * Chi incontra uno di questi tre rifiuti **non deve aggiustarlo**: non c'è
 * niente da riparare qui dentro. Estenderli per analogia — riusare il criterio
 * dell'eliminazione nel girone, o inventare un terzo criterio dopo il secondo —
 * sarebbe un'imputazione su un esito eliminatorio, cioè il posto peggiore dove
 * indovinare. La strada è **una nuova dichiarazione di Pico**, registrata in
 * `docs/data/LEAGUE_RULES.md` §23; finché non c'è, il rifiuto è il
 * comportamento corretto.
 *
 * **E un terzo rifiuto, di natura diversa.** `osservazione_incompleta` non è
 * una decisione mancante ma una **lettura insufficiente**: un punteggio
 * assente, una gara non giocata, due gare che non appartengono allo stesso
 * scontro. Un dato mancante **non è una parità** e non produce mai una vittoria
 * dedotta: il contratto osserva la coppa, e su ciò che non ha osservato tace.
 */
export type KnockoutDecisionCode = "punti_mini_girone" | "somma_punteggi_fantacalcio";

/**
 * I quattro modi di non decidere, tenuti distinti di proposito: i primi tre
 * sono decisioni che Pico non ha preso, il quarto è una lettura che non basta.
 */
export type KnockoutRefusalCode =
  | "parita_dopo_punteggi_fantacalcio"
  | "girone_da_quattro_non_dichiarato"
  | "cavallo_del_campo_neutro_non_dichiarato"
  | "osservazione_incompleta";

/** Il turno è deciso: passa questa squadra, per questo motivo. */
export interface KnockoutQualificationDecided {
  readonly decided: true;
  /** Chi passa. Presente **solo** quando `decided` è `true`. */
  readonly qualifiedTeamId: string;
  readonly code: KnockoutDecisionCode;
  readonly message: string;
}

/** Il turno non è decidibile, per questo motivo. Nessuna squadra, mai. */
export interface KnockoutQualificationUndecided {
  readonly decided: false;
  readonly code: KnockoutRefusalCode;
  readonly message: string;
}

/**
 * Esito **dichiarato** del doppio confronto. Non un booleano nudo e non un id
 * che potrebbe essere vuoto: il motivo viaggia con l'esito, come codice stabile
 * (confrontabile) più messaggio in italiano (leggibile).
 */
export type KnockoutQualification = KnockoutQualificationDecided | KnockoutQualificationUndecided;

/**
 * Una delle due squadre in una gara del doppio confronto, come la piattaforma
 * la espone. Tutti i campi opzionali: `undefined` è «non osservato», e qui è
 * sempre un motivo per non decidere.
 */
export interface ObservedKnockoutSide {
  /** Id opaco della squadra. Mai un nome. */
  readonly teamId?: string;
  /**
   * Goal della gara, **osservati**. Non si derivano dal punteggio: la
   * conversione punteggio → goal è §15 e vive in `packages/league-gameweek`.
   */
  readonly goals?: number;
  /**
   * Punteggio fantacalcio della gara: il **punteggio finale della squadra**,
   * modificatori compresi (§9, §19, §20, §21), così come la piattaforma lo
   * espone — non un pezzo da ricomporre qui. È l'interpretazione dichiarata
   * dall'Executive il 2026-09-04, in testa al file. Nessun modificatore viene
   * aggiunto o tolto in questa funzione, il +2 di §14 compreso.
   */
  readonly fantasyPoints?: number;
}

/**
 * Una delle due gare di uno scontro a eliminazione diretta. La fase e il verso
 * sono **dichiarati**, mai dedotti dalla giornata: è la regola di tutto questo
 * file, e qui vale doppio perché l'esito è eliminatorio.
 */
export interface ObservedKnockoutLeg {
  readonly competitionId?: string;
  readonly matchday?: number;
  /** Fase dichiarata: solo `eliminazione` è un doppio confronto. */
  readonly cupPhase?: ObservedCupPhase;
  /** Andata o ritorno. Le due gare devono dichiarare versi diversi. */
  readonly leg?: ObservedLeg;
  /**
   * Se la gara si è giocata. `false` è «non giocata», `undefined` è «non
   * osservato»: nessuno dei due è una parità.
   */
  readonly played?: boolean;
  /** Le due squadre della gara, in un ordine qualsiasi. */
  readonly sides?: readonly [ObservedKnockoutSide, ObservedKnockoutSide];
}

/**
 * Chi passa il turno di eliminazione diretta, dato il doppio confronto.
 *
 * Funzione **pura e deterministica**: nessuna rete, nessun orologio, nessun
 * caso. L'ordine delle due gare è indifferente — andata e ritorno si
 * riconoscono dal campo `leg` che dichiarano, non dalla posizione in cui
 * arrivano.
 *
 * Vedi il blocco di prosa qui sopra per i codici e, soprattutto, per che cosa
 * **non** va aggiustato.
 */
export function resolveKnockoutQualification(
  primaGara: ObservedKnockoutLeg,
  secondaGara: ObservedKnockoutLeg,
): KnockoutQualification {
  const gare: readonly ObservedKnockoutLeg[] = [primaGara, secondaGara];

  // La fase a gironi ha un rifiuto suo, e viene prima di ogni altro controllo:
  // se la domanda riguarda il girone da quattro, la risposta è che il criterio
  // non è dichiarato — non che i dati sono incompleti.
  if (gare.some((gara) => gara.cupPhase === "girone")) {
    return rifiuto(
      "girone_da_quattro_non_dichiarato",
      "il criterio di parità del girone da quattro non è dichiarato dal regolamento (§23, cup_group_ranking_criteria) e la decisione del 2026-09-04 riguarda solo il doppio confronto a eliminazione: serve una dichiarazione di Pico, non un criterio dedotto",
    );
  }
  if (gare.some((gara) => gara.cupPhase === "finale")) {
    return rifiuto(
      "osservazione_incompleta",
      "la finale è gara secca (§23) e non è un doppio confronto: qui non c'è un turno da risolvere",
    );
  }

  const lette: LetturaGara[] = [];
  for (const [indice, gara] of gare.entries()) {
    const lettura = leggiGara(gara, indice === 0 ? "prima gara" : "seconda gara");
    if (typeof lettura === "string") return rifiuto("osservazione_incompleta", lettura);
    lette.push(lettura);
  }

  const [gara1, gara2] = lette as [LetturaGara, LetturaGara];

  if (gara1.competitionId !== gara2.competitionId) {
    return rifiuto(
      "osservazione_incompleta",
      `gare di competizioni diverse (${gara1.competitionId} e ${gara2.competitionId}): non sono lo stesso scontro`,
    );
  }
  if (gara1.matchday === gara2.matchday) {
    return rifiuto(
      "osservazione_incompleta",
      `due gare osservate sulla stessa giornata ${gara1.matchday}: andata e ritorno sono due giornate distinte`,
    );
  }
  if (gara1.leg === gara2.leg) {
    return rifiuto(
      "osservazione_incompleta",
      `due gare dichiarate entrambe come ${gara1.leg}: un doppio confronto è un'andata e un ritorno`,
    );
  }
  const squadre1 = [gara1.sides[0].teamId, gara1.sides[1].teamId].sort();
  const squadre2 = [gara2.sides[0].teamId, gara2.sides[1].teamId].sort();
  if (squadre1[0] !== squadre2[0] || squadre1[1] !== squadre2[1]) {
    return rifiuto(
      "osservazione_incompleta",
      `le due gare non oppongono le stesse squadre (${squadre1.join("/")} e ${squadre2.join("/")}): non sono lo stesso scontro`,
    );
  }

  const [squadraA, squadraB] = squadre1 as [string, string];

  // Criterio 1 — il mini girone di due squadre: 3 / 1 / 0 su ciascuna gara.
  const puntiA = puntiMiniGirone(squadraA, gara1) + puntiMiniGirone(squadraA, gara2);
  const puntiB = puntiMiniGirone(squadraB, gara1) + puntiMiniGirone(squadraB, gara2);
  if (puntiA !== puntiB) {
    const vincente = puntiA > puntiB ? squadraA : squadraB;
    return {
      decided: true,
      qualifiedTeamId: vincente,
      code: "punti_mini_girone",
      message: `${vincente} passa con ${Math.max(puntiA, puntiB)} punti contro ${Math.min(puntiA, puntiB)} nel mini girone di due squadre (§22 3/1/0 su ciascuna delle due gare, §23)`,
    };
  }

  // Prima del criterio 2, e solo qui: le due somme sono confrontabili soltanto
  // se le gare stanno dalla stessa parte del limite di §14. La soglia non è
  // trascritta, si chiede all'autorità che la possiede (`homeFieldBonus`): due
  // gare con lo stesso bonus lo vedono annullarsi, due gare con bonus diverso
  // no. Al criterio 1 questo controllo non serve — i punti vengono dai goal.
  if (homeFieldBonus(gara1.matchday) !== homeFieldBonus(gara2.matchday)) {
    return rifiuto(
      "cavallo_del_campo_neutro_non_dichiarato",
      `lo scontro è a cavallo del limite del fattore campo (§14): la giornata ${gara1.matchday} e la giornata ${gara2.matchday} non hanno lo stesso bonus campo, quindi il +2 entra in una sola delle due somme e a incassarlo è chi ha giocato in casa per primo — che cosa decida la parità in questo caso non è dichiarato, ed è una decisione di Pico`,
    );
  }

  // Criterio 2 — la somma dei punteggi fantacalcio (Pico, 2026-09-04). Il
  // confronto è esatto, senza tolleranza: i punteggi arrivano osservati e in
  // mezzi punti, e una tolleranza inventata qui deciderebbe un'eliminazione con
  // un numero che nessuno ha dichiarato.
  const puntiFantaA = puntiFantacalcio(squadraA, gara1) + puntiFantacalcio(squadraA, gara2);
  const puntiFantaB = puntiFantacalcio(squadraB, gara1) + puntiFantacalcio(squadraB, gara2);
  if (puntiFantaA !== puntiFantaB) {
    const vincente = puntiFantaA > puntiFantaB ? squadraA : squadraB;
    return {
      decided: true,
      qualifiedTeamId: vincente,
      code: "somma_punteggi_fantacalcio",
      message: `parità nel mini girone (${puntiA} punti a testa): passa ${vincente}, che ha totalizzato più punti fantacalcio nelle due partite (${Math.max(puntiFantaA, puntiFantaB)} contro ${Math.min(puntiFantaA, puntiFantaB)}) — criterio dichiarato da Pico il 2026-09-04`,
    };
  }

  // Criterio 3 — non esiste: qui si ferma la decisione, non il codice.
  return rifiuto(
    "parita_dopo_punteggi_fantacalcio",
    `parità nel mini girone (${puntiA} punti a testa) e parità anche nella somma dei punteggi fantacalcio (${puntiFantaA} a testa): che cosa decida a questo punto non è dichiarato da nessuno — la decisione del 2026-09-04 si ferma qui e §23 rinvia a una fonte esterna che è vietato ricostruire`,
  );
}

interface LetturaLato {
  readonly teamId: string;
  readonly goals: number;
  readonly fantasyPoints: number;
}

interface LetturaGara {
  readonly competitionId: string;
  readonly matchday: number;
  readonly leg: ObservedLeg;
  readonly sides: readonly [LetturaLato, LetturaLato];
}

function rifiuto(code: KnockoutRefusalCode, message: string): KnockoutQualificationUndecided {
  return { decided: false, code, message };
}

/** La gara letta per intero, oppure il motivo per cui non lo è. */
function leggiGara(gara: ObservedKnockoutLeg, etichetta: string): LetturaGara | string {
  if (gara.competitionId === undefined || gara.competitionId.length === 0) {
    return `${etichetta}: competizione non osservata`;
  }
  if (gara.matchday === undefined) return `${etichetta}: giornata non osservata`;
  if (!Number.isInteger(gara.matchday) || gara.matchday < 1) {
    return `${etichetta}: giornata non valida (${gara.matchday})`;
  }
  if (gara.leg === undefined) {
    return `${etichetta}: andata o ritorno non dichiarato, e non si deduce dalla giornata`;
  }
  if (gara.played === false) {
    return `${etichetta} (giornata ${gara.matchday}): gara non giocata, e una gara non giocata non è un pareggio`;
  }
  if (gara.played !== true) {
    return `${etichetta} (giornata ${gara.matchday}): non è osservato se la gara si sia giocata`;
  }
  if (gara.sides === undefined || gara.sides.length !== 2) {
    return `${etichetta} (giornata ${gara.matchday}): le due squadre della gara non sono osservate`;
  }
  const lati: LetturaLato[] = [];
  for (const lato of gara.sides) {
    if (lato.teamId === undefined || lato.teamId.length === 0) {
      return `${etichetta} (giornata ${gara.matchday}): squadra non osservata`;
    }
    if (lato.goals === undefined) {
      return `${etichetta} (giornata ${gara.matchday}): goal non osservati per ${lato.teamId}`;
    }
    if (!Number.isInteger(lato.goals) || lato.goals < 0) {
      return `${etichetta} (giornata ${gara.matchday}): goal non validi per ${lato.teamId} (${lato.goals})`;
    }
    if (lato.fantasyPoints === undefined) {
      return `${etichetta} (giornata ${gara.matchday}): punteggio fantacalcio non osservato per ${lato.teamId}`;
    }
    if (!Number.isFinite(lato.fantasyPoints)) {
      return `${etichetta} (giornata ${gara.matchday}): punteggio fantacalcio non valido per ${lato.teamId} (${lato.fantasyPoints})`;
    }
    lati.push({ teamId: lato.teamId, goals: lato.goals, fantasyPoints: lato.fantasyPoints });
  }
  const [primo, secondo] = lati as [LetturaLato, LetturaLato];
  if (primo.teamId === secondo.teamId) {
    return `${etichetta} (giornata ${gara.matchday}): la stessa squadra ${primo.teamId} osservata su entrambi i lati`;
  }
  return {
    competitionId: gara.competitionId,
    matchday: gara.matchday,
    leg: gara.leg,
    sides: [primo, secondo],
  };
}

/** I 3 / 1 / 0 di §22 applicati alla singola gara del mini girone (§23). */
function puntiMiniGirone(teamId: string, gara: LetturaGara): number {
  const nostro = gara.sides[0].teamId === teamId ? gara.sides[0] : gara.sides[1];
  const altro = gara.sides[0].teamId === teamId ? gara.sides[1] : gara.sides[0];
  if (nostro.goals > altro.goals) return 3;
  if (nostro.goals === altro.goals) return 1;
  return 0;
}

function puntiFantacalcio(teamId: string, gara: LetturaGara): number {
  return (gara.sides[0].teamId === teamId ? gara.sides[0] : gara.sides[1]).fantasyPoints;
}

function assertMatchday(matchday: number): void {
  if (!Number.isInteger(matchday) || matchday < 1) {
    throw new Error(`giornata non valida: ${matchday}`);
  }
}

/**
 * Le sfide di una competizione dentro il calendario, o `null` se il calendario
 * non la contiene. Due blocchi con lo stesso `competitionId` fermano la
 * ricerca: sceglierne uno sarebbe un'imputazione.
 */
export function competitionFixtures(
  calendar: ObservedCalendar,
  competitionId: string,
): ObservedCompetitionFixtures | null {
  const found = calendar.competitions.filter(
    (block) => block.competition.competitionId === competitionId,
  );
  if (found.length > 1) {
    throw new Error(
      `calendario osservato con ${found.length} blocchi per la competizione ${competitionId}`,
    );
  }
  return found[0] ?? null;
}

/**
 * La sfida di una (competizione, giornata), o `null` se non c'è.
 *
 * La chiave è la coppia, non la sola giornata: nelle giornate di coppa le
 * partite sono due e cercare «la partita della 5ª» sarebbe una domanda mal
 * posta. Due sfide osservate per la stessa coppia fermano la ricerca invece di
 * far vincere la prima.
 */
export function fixtureFor(
  calendar: ObservedCalendar,
  competitionId: string,
  matchday: number,
): ObservedFixture | null {
  assertMatchday(matchday);
  const block = competitionFixtures(calendar, competitionId);
  if (block === null) return null;
  const found = block.fixtures.filter((fixture) => fixture.matchday === matchday);
  if (found.length > 1) {
    throw new Error(
      `calendario osservato con ${found.length} sfide per (${competitionId}, giornata ${matchday})`,
    );
  }
  return found[0] ?? null;
}

/**
 * Tutte le sfide osservate in una giornata, competizione per competizione: una
 * sola nelle giornate di solo campionato, **due** nelle giornate di coppa.
 * L'ordine è quello del calendario osservato.
 */
export function fixturesOnMatchday(
  calendar: ObservedCalendar,
  matchday: number,
): readonly { readonly competition: ObservedCompetition; readonly fixture: ObservedFixture }[] {
  assertMatchday(matchday);
  const out: { competition: ObservedCompetition; fixture: ObservedFixture }[] = [];
  for (const block of calendar.competitions) {
    for (const fixture of block.fixtures) {
      if (fixture.matchday === matchday) out.push({ competition: block.competition, fixture });
    }
  }
  return out;
}

/**
 * Il contesto di giornata che `simulateGameweek` e `proposeLineup` consumano.
 *
 * Fail-closed su cinque cose, tutte irrimediabili a valle:
 *  - la giornata attesa non è un intero >= 1;
 *  - il fixture non dichiara a quale competizione appartiene: in una giornata
 *    di coppa ci sono due partite, e una lettura che non dice quale è delle due
 *    non basta a schierare;
 *  - il fixture dichiara un'altra competizione;
 *  - il fixture non dichiara la giornata, o ne dichiara un'altra;
 *  - il fixture non dichiara il campo: `weAreHome` non ha un valore neutro.
 */
export function toGameweekContext(
  fixture: ObservedFixture,
  matchday: number,
  competitionId: string,
): GameweekContext {
  assertMatchday(matchday);
  if (competitionId.length === 0) {
    throw new Error("competizione attesa non dichiarata: la coppia (competizione, giornata) è la chiave della sfida");
  }
  if (fixture.competitionId === undefined) {
    throw new Error(
      `competizione non osservata sulla sfida della giornata ${matchday}: in una giornata di coppa le partite sono due e questa lettura non dice quale sia`,
    );
  }
  if (fixture.competitionId !== competitionId) {
    throw new Error(
      `sfida della competizione ${fixture.competitionId}, richiesta ${competitionId}: lettura non allineata`,
    );
  }
  if (fixture.matchday === undefined) {
    throw new Error(
      `giornata non osservata sulla sfida: non si schiera per la ${matchday} su una lettura che non dichiara la propria giornata`,
    );
  }
  if (fixture.matchday !== matchday) {
    throw new Error(
      `sfida della giornata ${fixture.matchday}, richiesta la ${matchday}: lettura non allineata`,
    );
  }
  if (fixture.venue === undefined) {
    throw new Error(
      `campo non osservato per la giornata ${matchday}: il fattore campo di §14 vale 2 punti e non ha un valore di ripiego`,
    );
  }
  return { matchday, weAreHome: fixture.venue === "casa" };
}
