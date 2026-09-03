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
//  - nessun punteggio di lega per vittoria/pareggio/sconfitta: il regolamento
//    mette «punti» al primo criterio di classifica e non li quantifica, e
//    dedurli è vietato. Finché il committente non li dichiara, la funzione
//    obiettivo del Coach non esiste e questo file non la finge;
//  - nessun valore attribuito al «senza voto»: le costanti dichiarate dal
//    regolamento sono esposte sotto, ma la loro semantica non è confermata e
//    NESSUN calcolo di questo file le usa.

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
 * SENZA VOTO — costanti dichiarate dal regolamento, DELIBERATAMENTE NON USATE.
 *
 * Il regolamento porta questi tre numeri sotto «Senza voto», ma non dichiara la
 * loro semantica esatta, e dedurla è vietato. Se fossero il punteggio attribuito
 * a chi non prende voto, allora tutto l'impianto di rischio del recap
 * («probabilità di chiudere con 10, con 9») poggerebbe su una premessa
 * sbagliata, perché un giocatore senza voto non contribuirebbe zero.
 *
 * Sono esposti qui perché la domanda sia visibile nel codice e non solo in un
 * documento, e perché il giorno in cui il committente risponde ci sia un posto
 * solo da cambiare. Nessuna funzione di questo file li legge.
 */
export const SV_VALUES_SEMANTICS_UNCONFIRMED = {
  goalkeeper: 6,
  playerWithYellowCard: 5,
  playerWithRedCard: 4,
  officeReserve: "prohibited",
} as const;
