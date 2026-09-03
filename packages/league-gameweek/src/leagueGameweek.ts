// CONTRATTO ESEGUIBILE DELLA GIORNATA — le regole di lega che decidono una
// formazione, in codice invece che in prosa. Passo 1 della Fase 2 (Lineup
// Coach), proposto dalla review critica del master recap §8.
//
// PERCHÉ ESISTE. Il recap della Fase 2 progetta un motore di decisione che
// sceglie la formazione, ma non nomina mai cinque regole che quella scelta la
// decidono davvero: il modificatore modulo, il fattore campo, la soglia dei
// quattro difensori, i voti fittizi da 5 del centrocampo e la conversione
// punteggio -> goal. Chi implementasse dal recap ottimizzerebbe la cosa
// sbagliata. Questo file è la risposta: le regole vere, esatte, versionate e
// provate, prima di qualunque previsione.
//
// LA REGOLA DELLE REGOLE: si lavora sul VOTO BASE, mai sul fantavoto. Vale per
// tutti e tre i modificatori, ed è una dichiarazione esplicita del committente
// («Per tutti i ruoli si intende voto base»), non una comodità di calcolo. Un
// bonus che entrasse in un modificatore premierebbe due volte lo stesso
// evento.
//
// PERCHÉ VIVE IN UN PACCHETTO SUO, E NON NEL MOTORE D'ASTA. Il primo tentativo
// lo metteva in `packages/engine/`, e la guardia §D9 del motore lo ha respinto:
// vieta qualunque simbolo esportato che contenga «modifier», perché nel
// prodotto d'asta un «Modifier» sarebbe un output di valore model-derived. La
// guardia ha ragione due volte. Ha ragione sul nome — non si rinomina un
// termine del regolamento per far tacere un divieto — e ha ragione sul posto:
// questo è il contratto di una FASE DIVERSA del prodotto, e nel motore d'asta
// non deve entrare affatto. La soluzione non è stata né un'aggiunta
// all'allowlist §D9 (sarebbe stata «un'etichetta al posto di un divieto», che
// quella stessa guardia documenta come bypass provato) né un rinomino: è
// l'isolamento, sorvegliato da `tests/isolation.test.ts` sullo stesso modello
// già usato per `packages/appeal-index`.
//
// Nulla di ciò che sta qui è un valore ai sensi di §D9: non c'è modello, non
// c'è prezzo, non c'è feature imputata. Ci sono i voti base che qualcun altro
// fornisce e le tabelle del regolamento applicate a quelli.
//
// COSA NON C'È, di proposito:
//  - nessuna previsione, nessuna probabilità, nessun modello: qui c'è solo
//    aritmetica di regolamento, deterministica e riproducibile;
//  - nessuna interpolazione fuori tabella. Dove il regolamento tabula punti
//    discreti e vieta di interpolare, un valore non tabulato produce un esito
//    dichiarato — mai uno zero silenzioso, che somiglierebbe a un risultato;
//  - i punti di lega, che il regolamento non quantificava, sono dichiarati da
//    Pico il 2026-09-03 sulla convenzione della Serie A: 3 / 1 / 0. Il
//    fallback di ordinamento resta, ma non è più la strada principale;
//  - il «senza voto» invece NON è più un'incognita: dichiarato da Pico il
//    2026-09-03 sul regolamento ufficiale, è modellato sotto in cinque casi,
//    e i punteggi d'ufficio che ne escono sono voti base a tutti gli effetti.

/**
 * Versione del regolamento su cui poggia ogni funzione di questo file. Ogni
 * risultato la porta con sé: un numero senza la versione della regola che lo
 * ha prodotto non è riproducibile.
 */
export const LEAGUE_RULE_VERSION = "2026_27_v1" as const;

export type LeagueRuleVersion = typeof LEAGUE_RULE_VERSION;

/** I sette moduli schierabili. La chiave è la notazione D-C-A senza trattini. */
export type Module = "541" | "451" | "532" | "442" | "352" | "433" | "343";

export const MODULES: readonly Module[] = ["541", "451", "532", "442", "352", "433", "343"] as const;

/** Quanti giocatori per ruolo richiede ogni modulo, portiere escluso. */
export interface ModuleShape {
  readonly defenders: number;
  readonly midfielders: number;
  readonly strikers: number;
}

const MODULE_SHAPES: Readonly<Record<Module, ModuleShape>> = {
  "541": { defenders: 5, midfielders: 4, strikers: 1 },
  "451": { defenders: 4, midfielders: 5, strikers: 1 },
  "532": { defenders: 5, midfielders: 3, strikers: 2 },
  "442": { defenders: 4, midfielders: 4, strikers: 2 },
  "352": { defenders: 3, midfielders: 5, strikers: 2 },
  "433": { defenders: 4, midfielders: 3, strikers: 3 },
  "343": { defenders: 3, midfielders: 4, strikers: 3 },
};

/**
 * MODIFICATORE MODULO — e il bersaglio è l'AVVERSARIO, non noi.
 *
 * È la regola che il recap della Fase 2 non nomina mai, ed è quella che rende
 * sbagliato l'optimizer «massimizza il mio punteggio»: schierare 3-4-3 regala
 * 1,5 punti a chi ci sta di fronte. Con la prima soglia goal a 66 e le fasce
 * da 6, un punto e mezzo è un quarto di fascia — non è rumore.
 *
 * Il segno è il punteggio che il modulo REGALA ALL'AVVERSARIO: negativo
 * significa che l'avversario perde punti, cioè che il modulo è difensivo.
 */
const MODULE_POINTS_TO_OPPONENT: Readonly<Record<Module, number>> = {
  "541": -1.5,
  "451": -1.0,
  "532": -0.5,
  "442": 0,
  "352": 0.5,
  "433": 1.0,
  "343": 1.5,
};

/** Forma del modulo: quanti D, C, A schierare (il portiere è sempre uno). */
export function moduleShape(module: Module): ModuleShape {
  const shape = MODULE_SHAPES[module];
  if (shape === undefined) {
    throw new Error(`modulo sconosciuto: ${module as string}`);
  }
  return shape;
}

/**
 * Punti che il modulo scelto assegna ALL'AVVERSARIO. Il nome dice il bersaglio
 * proprio perché il segno, letto di sfuggita, invita all'errore opposto.
 */
export function modulePointsToOpponent(module: Module): number {
  const points = MODULE_POINTS_TO_OPPONENT[module];
  if (points === undefined) {
    throw new Error(`modulo sconosciuto: ${module as string}`);
  }
  return points;
}

/**
 * FATTORE CAMPO — +2 alla squadra di casa fino alla 28ª, poi campo neutro.
 *
 * Seconda regola che il recap non nomina. Due punti su una fascia da sei sono
 * un terzo di goal, e dalla 29ª spariscono: una decisione presa a novembre non
 * è la stessa decisione ad aprile.
 */
export const NEUTRAL_GROUND_FROM_MATCHDAY = 29 as const;
export const HOME_FIELD_BONUS = 2 as const;

export function homeFieldBonus(matchday: number): number {
  if (!Number.isInteger(matchday) || matchday < 1) {
    throw new Error(`giornata non valida: ${matchday}`);
  }
  return matchday >= NEUTRAL_GROUND_FROM_MATCHDAY ? 0 : HOME_FIELD_BONUS;
}

/**
 * Esito di un modificatore che può non applicarsi affatto. `applied: false`
 * non è «zero»: è «la regola non si è attivata», e la ragione è dichiarata.
 */
export interface ModifierOutcome {
  readonly applied: boolean;
  readonly value: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

function outcome(applied: boolean, value: number, reason: string): ModifierOutcome {
  return { applied, value, reason, leagueRuleVersion: LEAGUE_RULE_VERSION };
}

/**
 * MODIFICATORE DIFESA.
 *
 * Terza regola che il recap manca, e la manca a metà: sa che si usano «il
 * portiere e i 3 migliori difensori», non sa che il modificatore **si attiva
 * solo se** il portiere ha voto valido E almeno QUATTRO difensori hanno voto
 * valido. È quella soglia a rendere non lineare il valore del quarto e del
 * quinto difensore, e a legare la scelta del modulo alla copertura della
 * panchina: con tre difensori a voto il modificatore non c'è, per quanto alti
 * siano i loro voti.
 *
 * Media su quattro voti: portiere più i tre difensori migliori. Voti base.
 */
export const DEFENCE_MIN_DEFENDERS_WITH_VOTE = 4 as const;

export function defenceModifier(input: {
  readonly goalkeeperBaseVote: number | null;
  readonly defenderBaseVotes: readonly number[];
}): ModifierOutcome {
  const { goalkeeperBaseVote, defenderBaseVotes } = input;
  if (goalkeeperBaseVote === null) {
    return outcome(false, 0, "portiere senza voto valido");
  }
  const valid = defenderBaseVotes.filter((vote) => Number.isFinite(vote));
  if (valid.length < DEFENCE_MIN_DEFENDERS_WITH_VOTE) {
    return outcome(
      false,
      0,
      `difensori con voto valido: ${valid.length} (ne servono ${DEFENCE_MIN_DEFENDERS_WITH_VOTE})`,
    );
  }
  const bestThree = [...valid].sort((a, b) => b - a).slice(0, 3);
  const average = (goalkeeperBaseVote + bestThree.reduce((sum, vote) => sum + vote, 0)) / 4;
  // Solo per la ragione leggibile: il confronto di fascia resta sul valore pieno.
  const shown = Math.round(average * 1000) / 1000;
  // Fasce del regolamento: sono intervalli dichiarati, non punti tabulati, e
  // quindi qui non c'è nessuna interpolazione da vietare.
  if (average >= 7.0) return outcome(true, 6, `media ${shown} >= 7.0`);
  if (average >= 6.5) return outcome(true, 3, `media ${shown} in [6.5, 7.0)`);
  if (average >= 6.0) return outcome(true, 1, `media ${shown} in [6.0, 6.5)`);
  return outcome(true, 0, `media ${shown} < 6.0`);
}

/**
 * MODIFICATORE CENTROCAMPO — e i voti fittizi da 5.
 *
 * Quarta regola mancante, ed è la ragione tecnica per cui il Coach deve
 * simulare anche l'avversario: alla squadra che schiera MENO centrocampisti
 * vengono aggiunti tanti voti fittizi da 5 quanti servono a pareggiare il
 * numero, poi si confrontano le somme dei voti base.
 *
 * Conseguenza che il recap non poteva vedere: un 3-4-3 contro un 4-5-1 non è
 * «4 voti contro 5», è «5 voti contro 5» dove uno dei nostri vale 5,00 fisso.
 * È un'asimmetria sfruttabile, e va sfruttata sapendo che c'è.
 */
export const MIDFIELD_FICTITIOUS_VOTE = 5 as const;

/** Esito bilaterale: il modificatore centrocampo muove entrambe le squadre. */
export interface MidfieldOutcome {
  readonly ourDelta: number;
  readonly theirDelta: number;
  readonly ourTotal: number;
  readonly theirTotal: number;
  readonly difference: number;
  readonly tabulated: boolean;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/**
 * Tabella esatta delle differenze. Il regolamento tabula punti discreti a passi
 * di 0,5 e altrove dichiara `DO_NOT_INTERPOLATE`: qui si legge come tabella,
 * non come fasce continue. Con voti a mezzo punto ogni differenza possibile è
 * un multiplo di 0,5 e la tabella è esaustiva; una differenza che non lo fosse
 * esce come `tabulated: false` invece di essere arrotondata di nascosto.
 */
const MIDFIELD_TABLE: ReadonlyArray<readonly [difference: number, delta: number]> = [
  [2.0, 1],
  [2.5, 1],
  [3.0, 1.5],
  [3.5, 1.5],
  [4.0, 2],
  [4.5, 2],
  [5.0, 2.5],
  [5.5, 2.5],
  [6.0, 3],
  [6.5, 3],
];
export const MIDFIELD_MAX_DELTA = 3.5 as const;
const MIDFIELD_MAX_FROM_DIFFERENCE = 7.0 as const;

export function midfieldModifier(input: {
  readonly ourBaseVotes: readonly number[];
  readonly theirBaseVotes: readonly number[];
}): MidfieldOutcome {
  const ours = [...input.ourBaseVotes];
  const theirs = [...input.theirBaseVotes];
  const target = Math.max(ours.length, theirs.length);
  while (ours.length < target) ours.push(MIDFIELD_FICTITIOUS_VOTE);
  while (theirs.length < target) theirs.push(MIDFIELD_FICTITIOUS_VOTE);

  const ourTotal = ours.reduce((sum, vote) => sum + vote, 0);
  const theirTotal = theirs.reduce((sum, vote) => sum + vote, 0);
  const difference = Math.abs(ourTotal - theirTotal);
  const base = {
    ourTotal,
    theirTotal,
    difference,
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  } as const;

  if (difference < 2.0) {
    return { ...base, ourDelta: 0, theirDelta: 0, tabulated: true, reason: "differenza < 2.0" };
  }

  let delta: number | null = null;
  if (difference >= MIDFIELD_MAX_FROM_DIFFERENCE) {
    delta = MIDFIELD_MAX_DELTA;
  } else {
    const row = MIDFIELD_TABLE.find(([tabulated]) => tabulated === difference);
    delta = row === undefined ? null : row[1];
  }

  if (delta === null) {
    // Differenza non tabulata: il regolamento vieta di interpolare, quindi non
    // si sceglie un valore vicino. Si dichiara e si passa la mano.
    return {
      ...base,
      ourDelta: 0,
      theirDelta: 0,
      tabulated: false,
      reason: `differenza ${difference} non tabulata; il regolamento vieta di interpolare`,
    };
  }

  const weAreHigher = ourTotal > theirTotal;
  return {
    ...base,
    ourDelta: weAreHigher ? delta : -delta,
    theirDelta: weAreHigher ? -delta : delta,
    tabulated: true,
    reason: `differenza ${difference} -> ±${delta}`,
  };
}

/**
 * MODIFICATORE ATTACCO — con la correzione normativa del 2026-08-21.
 *
 * Il recap descrive la versione precedente e incompleta, che escludeva chi
 * segna ma non chi serve un assist: applicata alla lettera premiava due volte
 * l'attaccante con bonus assist. La regola vigente esclude QUALUNQUE bonus.
 *
 * Si applica ai soli attaccanti che: ricevono voto sufficiente; NON hanno
 * ricevuto bonus (gol o assist che sia); non sbagliano rigori.
 * Il modificatore di squadra è la somma algebrica dei loro modificatori.
 */
export interface StrikerLine {
  /** Voto base, mai fantavoto. `null` = senza voto. */
  readonly baseVote: number | null;
  /** Un qualunque bonus ricevuto esclude l'attaccante. */
  readonly receivedAnyBonus: boolean;
  /** Rigore sbagliato: esclude. */
  readonly missedPenalty: boolean;
}

const ATTACK_TABLE: ReadonlyArray<readonly [vote: number, bonus: number]> = [
  [6.0, 0],
  [6.5, 0.5],
  [7.0, 1],
  [7.5, 1.5],
];
export const ATTACK_MAX_BONUS = 2 as const;
export const ATTACK_MAX_FROM_VOTE = 8.0 as const;
export const SUFFICIENT_VOTE = 6.0 as const;

/** Esito per singolo attaccante, con la ragione dell'esclusione se esclusa. */
export interface StrikerOutcome {
  readonly eligible: boolean;
  readonly bonus: number;
  readonly tabulated: boolean;
  readonly reason: string;
}

export function strikerAttackModifier(striker: StrikerLine): StrikerOutcome {
  if (striker.baseVote === null) {
    return { eligible: false, bonus: 0, tabulated: true, reason: "senza voto" };
  }
  if (striker.baseVote < SUFFICIENT_VOTE) {
    return { eligible: false, bonus: 0, tabulated: true, reason: `voto ${striker.baseVote} insufficiente` };
  }
  if (striker.receivedAnyBonus) {
    // La correzione del 2026-08-21: qualunque bonus esclude, assist compresi.
    return { eligible: false, bonus: 0, tabulated: true, reason: "ha ricevuto un bonus" };
  }
  if (striker.missedPenalty) {
    return { eligible: false, bonus: 0, tabulated: true, reason: "ha sbagliato un rigore" };
  }
  if (striker.baseVote >= ATTACK_MAX_FROM_VOTE) {
    return { eligible: true, bonus: ATTACK_MAX_BONUS, tabulated: true, reason: `voto ${striker.baseVote} >= 8.0` };
  }
  const row = ATTACK_TABLE.find(([vote]) => vote === striker.baseVote);
  if (row === undefined) {
    // Voto sufficiente ma non tabulato: `DO_NOT_INTERPOLATE`. Nessun valore
    // inventato, nessuno zero silenzioso — l'esito lo dice.
    return {
      eligible: true,
      bonus: 0,
      tabulated: false,
      reason: `voto ${striker.baseVote} sufficiente ma non tabulato; il regolamento vieta di interpolare`,
    };
  }
  return { eligible: true, bonus: row[1], tabulated: true, reason: `voto ${striker.baseVote} -> +${row[1]}` };
}

export interface AttackOutcome {
  readonly value: number;
  readonly perStriker: readonly StrikerOutcome[];
  /** `false` se almeno un attaccante eleggibile aveva un voto fuori tabella. */
  readonly fullyTabulated: boolean;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

export function attackModifier(strikers: readonly StrikerLine[]): AttackOutcome {
  const perStriker = strikers.map(strikerAttackModifier);
  return {
    value: perStriker.reduce((sum, s) => sum + s.bonus, 0),
    perStriker,
    fullyTabulated: perStriker.every((s) => s.tabulated),
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * CONVERSIONE PUNTEGGIO -> GOAL.
 *
 * Quinta regola che il recap non nomina, e che anzi dà per MANCANTE: è invece
 * definita per intero. Da qui viene la ragione per cui la varianza conta
 * quanto la media — la fascia è larga 6, e mezzo punto in più può non valere
 * nulla o valere un goal a seconda di dove cade.
 *
 * Base: sotto 66 nessun goal; da 66 in su `1 + floor((punteggio - 66) / 6)`.
 * Eccezioni: stessa fascia e distacco >= 4 -> un goal in più a chi ha di più;
 * entrambe sotto soglia e distacco >= 10 -> un goal a chi ha di più.
 */
export const FIRST_GOAL_THRESHOLD = 66 as const;
export const GOAL_BAND_WIDTH = 6 as const;
export const SAME_BAND_EXTRA_GOAL_MIN_GAP = 4 as const;
export const BOTH_BELOW_THRESHOLD_GOAL_MIN_GAP = 10 as const;

function baseGoals(score: number): number {
  if (score < FIRST_GOAL_THRESHOLD) return 0;
  return 1 + Math.floor((score - FIRST_GOAL_THRESHOLD) / GOAL_BAND_WIDTH);
}

export interface GoalsOutcome {
  readonly ourGoals: number;
  readonly theirGoals: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

export function scoreToGoals(ourScore: number, theirScore: number): GoalsOutcome {
  let ourGoals = baseGoals(ourScore);
  let theirGoals = baseGoals(theirScore);
  const gap = Math.abs(ourScore - theirScore);
  const weAreHigher = ourScore > theirScore;
  let reason = "conversione base";

  const bothBelow = ourScore < FIRST_GOAL_THRESHOLD && theirScore < FIRST_GOAL_THRESHOLD;
  if (bothBelow) {
    if (gap >= BOTH_BELOW_THRESHOLD_GOAL_MIN_GAP) {
      if (weAreHigher) ourGoals += 1;
      else theirGoals += 1;
      reason = `entrambe sotto ${FIRST_GOAL_THRESHOLD} e distacco ${gap} >= ${BOTH_BELOW_THRESHOLD_GOAL_MIN_GAP}`;
    }
    return { ourGoals, theirGoals, reason, leagueRuleVersion: LEAGUE_RULE_VERSION };
  }

  if (ourGoals === theirGoals && gap >= SAME_BAND_EXTRA_GOAL_MIN_GAP) {
    if (weAreHigher) ourGoals += 1;
    else theirGoals += 1;
    reason = `stessa fascia e distacco ${gap} >= ${SAME_BAND_EXTRA_GOAL_MIN_GAP}`;
  }
  return { ourGoals, theirGoals, reason, leagueRuleVersion: LEAGUE_RULE_VERSION };
}

/**
 * SOSTITUZIONI — vincoli dichiarati, non ancora un simulatore.
 * Il simulatore che li applica è il passo 2; qui vivono i numeri, in un posto
 * solo, perché il passo 2 non li reinventi.
 */
export const SUBSTITUTION_RULES = {
  maxSubstitutions: 5,
  sameRoleOnly: true,
  moduleChangeAllowed: false,
} as const;

/**
 * FORMAZIONE NON COMUNICATA — e non è un dettaglio burocratico.
 *
 * Se la formazione manca vale quella della giornata precedente. Per il Coach è
 * un regalo: nel modellare la formazione dell'avversario, la sua formazione
 * della giornata precedente non è una congettura, è un esito regolamentare con
 * probabilità non nulla — la baseline più forte e più economica che esista.
 * (Alla prima giornata, senza una formazione precedente, si prende 0.)
 */
export const MISSING_LINEUP_POLICY = {
  fallbackToPreviousMatchday: true,
  firstMatchdayScoreWithoutPrevious: 0,
} as const;

/**
 * Stato disciplinare nella giornata. `red` è l'espulsione **a partita in
 * corso**; `red_after_match` è quella comminata dopo il fischio finale, che il
 * regolamento tratta in modo opposto — resta un senza voto, e si sostituisce.
 */
export type CardStatus = "none" | "yellow" | "red" | "red_after_match";

/**
 * SENZA VOTO — dichiarato da Pico il 2026-09-03 sul regolamento ufficiale.
 *
 * Le prime due risposte («sono il punteggio di chi non prende voto», «il senza
 * voto si sostituisce, portiere compreso») erano lette su un blocco di tre
 * valori che si è poi rivelato incompleto e in un punto sbagliato: `goalkeeper_sv`
 * era **un errore di trascrizione**, e il regolamento non dà nessun punteggio
 * d'ufficio al portiere che resta scoperto. Quel che il regolamento dice
 * davvero è più semplice e più largo:
 *
 * - un SV che porta **un qualunque bonus/malus** resta in campo e prende
 *   **6 più il valore di quel bonus/malus**;
 * - l'**ammonito e nient'altro** è un caso a parte, con un valore prestabilito
 *   dalla lega — la piattaforma consiglia 5,5, **noi abbiamo settato 5**, già
 *   inclusivo del malus. Se porta **anche altri** bonus/malus il preset non si
 *   applica e vale la regola generale, col malus vero del cartellino: ammonito
 *   più gol fa 6 + (−0,5 + 3) = **8,5**, non 8. Fra i due casi resta un salto
 *   di mezzo punto, ed è la scelta di lega a produrlo;
 * - l'**espulso a partita in corso** ha fantavoto **4**, automatico: non è la
 *   base meno il malus, è un valore a sé;
 * - l'**espulso dopo il fischio finale** resta senza voto, e si sostituisce;
 * - il **senza voto puro**, senza alcun bonus/malus, si sostituisce; e se la
 *   panchina non lo copre conta come assente, perché `officeReserve` è
 *   `prohibited` e nessun punteggio d'ufficio esiste per lui.
 *
 * **Il portiere non ha una regola propria.** Il regolamento lo nomina una volta
 * sola, per escludere il bonus imbattibilità da un suo SV e mandarlo in
 * sostituzione: è una regola sul *bonus*, non sul portiere, e vive nel
 * contratto del campo `otherBonusMalus` qui sotto.
 */
export const NO_VOTE_RULES = {
  /** La base del «6 + bonus/malus». */
  bonusMalusBase: 6,
  /** Espulso a partita in corso: fantavoto automatico, non derivato dalla base. */
  sentOffDuringMatch: 4,
  /**
   * Ammonito **e nient'altro**: valore prestabilito dalla nostra lega, dove
   * l'aritmetica darebbe 5,5 (6 meno il malus). Il salto di mezzo punto è una
   * scelta di lega, non un errore: si vede confrontando questo 5 con il
   * risultato del caso qui sotto.
   */
  bookedPreset: 5,
  /** Malus da cartellino, per l'ammonito che porta ANCHE altri bonus/malus. */
  yellowCardMalus: -0.5,
  officeReserve: "prohibited",
} as const;

export interface NoVoteOutcome {
  /**
   * `office_score` — resta in campo con un punteggio; `must_be_replaced` — è un
   * senza voto da sostituire, e senza rimpiazzo conta come assente;
   * `undeclared` — il regolamento non copre questa combinazione, e il calcolo
   * si ferma invece di sceglierne una.
   */
  readonly status: "office_score" | "must_be_replaced" | "undeclared";
  /** Voto base d'ufficio: alimenta i modificatori come un voto qualunque. */
  readonly baseVote: number | null;
  readonly fantasyScore: number | null;
  readonly reason: string;
}

/**
 * Che cosa succede a un titolare che ha preso SV.
 *
 * **Contratto di `otherBonusMalus`** — somma algebrica dei bonus/malus della
 * giornata **esclusi i cartellini**, che hanno i loro casi dedicati, e —
 * **per il portiere** — **escluso il bonus imbattibilità**, che il regolamento
 * dice espressamente di non sommare a un SV, mandandolo invece in
 * sostituzione. `null` significa «non lo so», e produce `undeclared`: fra un SV
 * puro da sostituire e un SV a 6 più bonus la differenza è l'intera formazione.
 *
 * **Una lettura, non una regola:** per l'espulso il regolamento dichiara il
 * *fantavoto* 4 e tace sul voto base. Qui il 4 vale come voto base, per
 * simmetria con l'ammonito, dove il regolamento dice esplicitamente che «il
 * voto preso in considerazione sarà esattamente quello inserito nelle
 * opzioni». Se fosse sbagliata, si cambia in questa funzione e basta.
 */
export function resolveNoVote(input: {
  readonly cards: CardStatus | null;
  readonly otherBonusMalus: number | null;
}): NoVoteOutcome {
  const { cards, otherBonusMalus } = input;

  if (cards === null) {
    return {
      status: "undeclared",
      baseVote: null,
      fantasyScore: null,
      reason: "stato dei cartellini non dichiarato: il regolamento ha tre esiti diversi a seconda del cartellino",
    };
  }

  if (cards === "red") {
    return {
      status: "office_score",
      baseVote: NO_VOTE_RULES.sentOffDuringMatch,
      fantasyScore: NO_VOTE_RULES.sentOffDuringMatch,
      reason: "espulso a partita in corso: fantavoto automatico 4",
    };
  }

  if (otherBonusMalus === null) {
    return {
      status: "undeclared",
      baseVote: null,
      fantasyScore: null,
      reason:
        "bonus/malus non dichiarati: senza quel dato non si distingue un senza voto puro, da sostituire, da un senza voto a 6 più bonus/malus",
    };
  }

  if (cards === "yellow") {
    if (otherBonusMalus !== 0) {
      // Dichiarato da Pico il 2026-09-03: «bonus e malus si sommano, quindi
      // ammonito e gol -0,5 + 3 = +2,5». Il valore prestabilito della lega NON
      // entra qui: l'aritmetica usa il malus vero del cartellino, e il caso
      // ricade nella regola generale del «6 più bonus/malus».
      const sum = otherBonusMalus + NO_VOTE_RULES.yellowCardMalus;
      return {
        status: "office_score",
        baseVote: NO_VOTE_RULES.bonusMalusBase,
        fantasyScore: NO_VOTE_RULES.bonusMalusBase + sum,
        reason: `ammonito con altri bonus/malus: 6 più ${sum} (il malus del cartellino si somma, il valore prestabilito non si applica)`,
      };
    }
    return {
      status: "office_score",
      baseVote: NO_VOTE_RULES.bookedPreset,
      fantasyScore: NO_VOTE_RULES.bookedPreset,
      reason: "ammonito e nient'altro: valore prestabilito dalla lega, già inclusivo del malus",
    };
  }

  // `none` e `red_after_match`: il rosso dopo il fischio finale resta un SV.
  if (otherBonusMalus === 0) {
    return {
      status: "must_be_replaced",
      baseVote: null,
      fantasyScore: null,
      reason:
        cards === "red_after_match"
          ? "espulso dopo la fine della partita: resta senza voto, si sostituisce"
          : "senza voto puro: si sostituisce, e senza rimpiazzo conta come assente",
    };
  }

  return {
    status: "office_score",
    baseVote: NO_VOTE_RULES.bonusMalusBase,
    fantasyScore: NO_VOTE_RULES.bonusMalusBase + otherBonusMalus,
    reason: `senza voto con bonus/malus: 6 più ${otherBonusMalus}`,
  };
}
