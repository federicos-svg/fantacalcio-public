// MOD-CALC — il calcolatore ESATTO dei tre modificatori di lega. PURO.
//
// Fonti normative, e sono due, non una:
//   - LEAGUE_RULES.md §19 (difesa), §20 (centrocampo), §21 (attacco), con la
//     CORREZIONE NORMATIVA di Pico del 2026-08-21 su §21;
//   - GEN-PROTOCOL-A §D.9, che ne fa la base di T6 e che ripete la regola in
//     una riga: «tutti e tre lavorano sul VOTO BASE; `DO_NOT_INTERPOLATE` sui
//     voti fuori tabella».
//
// Tre funzioni separate, e MAI una quarta che le somma. §D.9 lo scrive in
// chiaro — «Mai una somma dei tre: il regolamento li tratta separati e il
// prodotto anche» — e §D.12 spiega perche' un composito e' vietato: sarebbe un
// peso nascosto, cioe' una decisione di prodotto presa dentro una funzione.
//
// La correzione del 2026-08-21 in una riga: l'attaccante e' eleggibile se ha
// voto sufficiente E non ha ricevuto bonus — GOL **O ASSIST** — E non ha
// sbagliato rigori. Il testo precedente escludeva chi segna ma non chi serve
// un assist, e quindi «premiava due volte» chi prendeva il bonus assist. Al
// 2026-08-21 nessuna riga di codice implementava il modificatore attacco: la
// correzione e' arrivata prima dell'implementazione, e questa e'
// l'implementazione.
//
// Il voto base, mai il fantavoto: e' la frase di Pico riportata testualmente
// in §21 («Per tutti i ruoli si intende voto base»), ed e' anche il motivo per
// cui questo modulo NON importa `computeFantavoto`. Se un giorno lo importasse,
// il difetto sarebbe invisibile: i numeri resterebbero plausibili.

/** Un voto base valido, oppure `null` per senza-voto (LEAGUE_RULES §13: non produce voto di prestazione). */
export type BaseVote = number | null;

// ---------------------------------------------------------------------------
// §19 — modificatore difesa
// ---------------------------------------------------------------------------

/** Difensori con voto valido minimi perche' il modificatore difesa si attivi (§19). */
export const DEFENSE_MIN_VALID_DEFENDERS = 4;

/** Difensori che entrano nella media, oltre al portiere: i 3 MIGLIORI (§19). */
export const DEFENSE_COUNTED_DEFENDERS = 3;

/**
 * Le bande di §19, dalla piu' alta alla piu' bassa. Lettura a soglie
 * decrescenti: la prima soglia raggiunta vince, che e' esattamente
 * «>= 7.0 -> +6; >= 6.5 e < 7.0 -> +3; >= 6.0 e < 6.5 -> +1; < 6.0 -> 0».
 */
export const DEFENSE_BANDS: readonly { readonly minAverage: number; readonly bonus: number }[] = [
  { minAverage: 7, bonus: 6 },
  { minAverage: 6.5, bonus: 3 },
  { minAverage: 6, bonus: 1 },
] as const;

export type DefenseInactiveReason = "GOALKEEPER_WITHOUT_VOTE" | "NOT_ENOUGH_VALID_DEFENDERS";

export interface DefenseModifierResult {
  readonly active: boolean;
  /** Perche' non si e' attivato; `null` quando si e' attivato. */
  readonly reason: DefenseInactiveReason | null;
  /** Media di portiere + 3 migliori difensori; `null` se non attivo. */
  readonly average: number | null;
  /** Bonus di squadra. 0 anche quando non attivo — ed e' un 0 dichiarato, non una media sotto 6. */
  readonly bonus: number;
  readonly validDefenders: number;
  /** I voti effettivamente entrati nella media, in ordine decrescente dopo il portiere. */
  readonly countedVotes: readonly number[];
}

/**
 * §19. Si attiva SOLO con portiere a voto valido E almeno 4 difensori a voto
 * valido; calcola sulla media di `voto base portiere + 3 migliori voti base
 * dei difensori`.
 *
 * «Niente bonus/malus» e' testuale in §19, e ha una conseguenza che vale la
 * pena scrivere: il malus `Gs` del portiere (−1, §12, platea chiusa il
 * 2026-08-23) NON entra qui e non vi entrava prima. Sono due grandezze
 * distinte che capitava fossero confuse.
 *
 * L'attivazione con esattamente 3 difensori validi e' NEGATA: e' il caso
 * limite che separa una lettura corretta da una «quasi» — ed e' coperto da un
 * test suo.
 */
export function defenseModifier(gkBaseVote: BaseVote, defenderBaseVotes: readonly BaseVote[]): DefenseModifierResult {
  const validDefenders = defenderBaseVotes.filter((v): v is number => v !== null && Number.isFinite(v));
  if (gkBaseVote === null || !Number.isFinite(gkBaseVote)) {
    return {
      active: false,
      reason: "GOALKEEPER_WITHOUT_VOTE",
      average: null,
      bonus: 0,
      validDefenders: validDefenders.length,
      countedVotes: [],
    };
  }
  if (validDefenders.length < DEFENSE_MIN_VALID_DEFENDERS) {
    return {
      active: false,
      reason: "NOT_ENOUGH_VALID_DEFENDERS",
      average: null,
      bonus: 0,
      validDefenders: validDefenders.length,
      countedVotes: [],
    };
  }

  const bestThree = [...validDefenders].sort((a, b) => b - a).slice(0, DEFENSE_COUNTED_DEFENDERS);
  const counted = [gkBaseVote, ...bestThree];
  let sum = 0;
  for (const v of counted) sum += v;
  const average = sum / counted.length;

  let bonus = 0;
  for (const band of DEFENSE_BANDS) {
    if (average >= band.minAverage) {
      bonus = band.bonus;
      break;
    }
  }

  return {
    active: true,
    reason: null,
    average,
    bonus,
    validDefenders: validDefenders.length,
    countedVotes: counted,
  };
}

// ---------------------------------------------------------------------------
// §20 — modificatore centrocampo
// ---------------------------------------------------------------------------

/** Voto fittizio assegnato al lato con meno centrocampisti, fino a pareggiare la numerosita' (§20). */
export const MIDFIELD_FICTITIOUS_VOTE = 5;

/**
 * La tabella §20 letta a intervalli sulla DIFFERENZA delle somme.
 *
 * La tabella del regolamento elenca la griglia 0,5 e assegna lo stesso valore
 * a coppie consecutive (2,0 e 2,5 -> ±1; 3,0 e 3,5 -> ±1,5; …). La lettura a
 * intervalli `[2,3) -> 1`, `[3,4) -> 1,5`, … e' IDENTICA su ogni punto della
 * griglia, e in piu' e' definita fuori griglia — dove il regolamento tace
 * perche' il caso non esiste: le somme di voti base vivono su griglia 0,5 e i
 * fittizi da 5 la preservano, quindi «una differenza di 2,7 non esiste»
 * (GEN-PROTOCOL-A §J.6, verificato sui dati da P0.3).
 *
 * Il risultato porta comunque `onHalfPointGrid`, cosi' che se quel caso
 * impossibile si presentasse il chiamante lo vedrebbe invece di riceverlo
 * silenziosamente incasellato.
 */
export const MIDFIELD_BANDS: readonly { readonly minDifference: number; readonly magnitude: number }[] = [
  { minDifference: 7, magnitude: 3.5 },
  { minDifference: 6, magnitude: 3 },
  { minDifference: 5, magnitude: 2.5 },
  { minDifference: 4, magnitude: 2 },
  { minDifference: 3, magnitude: 1.5 },
  { minDifference: 2, magnitude: 1 },
] as const;

export interface MidfieldSideResult {
  /** Somma dei voti base effettivi + fittizi. */
  readonly total: number;
  /** Quanti voti fittizi da 5 sono stati aggiunti a questo lato. */
  readonly fictitiousVotes: number;
  /** Modificatore di questo lato: positivo al totale maggiore, negativo al minore. */
  readonly modifier: number;
}

export interface MidfieldModifierResult {
  readonly own: MidfieldSideResult;
  readonly opponent: MidfieldSideResult;
  /** `|somma_propria − somma_avversaria|`. */
  readonly difference: number;
  /** `false` se la differenza NON e' un multiplo di 0,5 — il caso che §J.6 dichiara impossibile. */
  readonly onHalfPointGrid: boolean;
}

/**
 * §20. Pareggia la numerosita' con voti fittizi da 5, somma i VOTI BASE
 * («esclusi bonus/malus», testuale), legge la tabella sulla differenza e
 * restituisce ENTRAMBI i lati.
 *
 * Entrambi i lati e non solo il proprio: il modificatore centrocampo e' un
 * confronto, e una funzione che restituisse un numero solo costringerebbe il
 * chiamante a richiamarla con gli argomenti scambiati — cioe' a fidarsi che le
 * due chiamate siano coerenti. Qui lo sono per costruzione.
 *
 * I senza-voto non contano ne' come voto ne' come numerosita': un
 * centrocampista senza voto non porta un voto base, e la numerosita' che §20
 * confronta e' quella dei voti che entrano nella somma.
 */
export function midfieldModifier(
  ownBaseVotes: readonly BaseVote[],
  opponentBaseVotes: readonly BaseVote[],
): MidfieldModifierResult {
  const own = ownBaseVotes.filter((v): v is number => v !== null && Number.isFinite(v));
  const opponent = opponentBaseVotes.filter((v): v is number => v !== null && Number.isFinite(v));
  const size = Math.max(own.length, opponent.length);
  const ownFictitious = size - own.length;
  const opponentFictitious = size - opponent.length;

  const sum = (votes: readonly number[], fictitious: number): number => {
    let acc = fictitious * MIDFIELD_FICTITIOUS_VOTE;
    for (const v of votes) acc += v;
    return acc;
  };
  const ownTotal = sum(own, ownFictitious);
  const opponentTotal = sum(opponent, opponentFictitious);
  const difference = Math.abs(ownTotal - opponentTotal);

  let magnitude = 0;
  for (const band of MIDFIELD_BANDS) {
    if (difference >= band.minDifference) {
      magnitude = band.magnitude;
      break;
    }
  }

  const ownModifier = ownTotal === opponentTotal ? 0 : ownTotal > opponentTotal ? magnitude : -magnitude;

  return {
    own: { total: ownTotal, fictitiousVotes: ownFictitious, modifier: ownModifier },
    opponent: { total: opponentTotal, fictitiousVotes: opponentFictitious, modifier: -ownModifier },
    difference,
    onHalfPointGrid: Number.isInteger(difference * 2),
  };
}

// ---------------------------------------------------------------------------
// §21 — modificatore attacco (con la correzione normativa 2026-08-21)
// ---------------------------------------------------------------------------

/** Voto minimo «sufficiente» per l'eleggibilita' al modificatore attacco (§21). */
export const ATTACK_MIN_SUFFICIENT_VOTE = 6;

/**
 * La tabella §21, dalla soglia piu' alta alla piu' bassa.
 *
 * `>= 8.0 -> +2` e' una BANDA nel regolamento, quindi 8,5 e 9 sono tabellati e
 * valgono +2. I voti sufficienti fuori griglia stanno tutti dentro `[6, 8)` —
 * 6,25, 6,75, 7,25, 7,75 — e la' la regola e' `DO_NOT_INTERPOLATE`.
 */
export const ATTACK_TABLE: readonly { readonly minVote: number; readonly bonus: number }[] = [
  { minVote: 8, bonus: 2 },
  { minVote: 7.5, bonus: 1.5 },
  { minVote: 7, bonus: 1 },
  { minVote: 6.5, bonus: 0.5 },
  { minVote: 6, bonus: 0 },
] as const;

export interface AttackPlayerInput {
  readonly baseVote: BaseVote;
  /**
   * QUALUNQUE bonus: gol **o assist**. E' la correzione normativa del
   * 2026-08-21 — «Se l'attaccante ha un bonus non prende il modificatore.
   * Quindi se fa gol **o assist** non ha il modificatore.»
   */
  readonly hasBonus: boolean;
  /** Rigore sbagliato: terza condizione di §21, invariata dalla correzione. */
  readonly missedPenalty: boolean;
}

export type AttackIneligibleReason = "NO_VOTE" | "INSUFFICIENT_VOTE" | "HAS_BONUS" | "MISSED_PENALTY";

export interface AttackPlayerResult {
  readonly eligible: boolean;
  readonly reason: AttackIneligibleReason | null;
  /** Contributo alla somma algebrica di squadra. 0 anche per un eleggibile a 6,0 e per un `nonTabulated`. */
  readonly contribution: number;
  /**
   * `true` per un voto SUFFICIENTE che non compare in tabella: contributo 0 e
   * bandiera alzata (`DO_NOT_INTERPOLATE`, LEAGUE_RULES §21/§27; P0.3 misura
   * quante volte succede e la conseguenza dichiarata e' una domanda a Pico,
   * non un'interpolazione).
   */
  readonly nonTabulated: boolean;
}

export interface AttackModifierResult {
  /** Somma algebrica dei contributi degli eleggibili (§21, ultima riga). */
  readonly total: number;
  readonly perPlayer: readonly AttackPlayerResult[];
  readonly eligibleCount: number;
  readonly nonTabulatedCount: number;
}

/**
 * §21 con la correzione 2026-08-21. Eleggibile ⇔ voto sufficiente **E** nessun
 * bonus (gol o assist) **E** nessun rigore sbagliato.
 *
 * Un eleggibile a 6,0 contribuisce 0: e' un contributo tabellato pari a zero,
 * non un non-eleggibile — e la differenza si vede in `eligible`, che e' quello
 * che il conteggio di squadra deve poter leggere.
 */
export function attackModifier(rows: readonly AttackPlayerInput[]): AttackModifierResult {
  const perPlayer = rows.map((row): AttackPlayerResult => {
    if (row.baseVote === null || !Number.isFinite(row.baseVote)) {
      return { eligible: false, reason: "NO_VOTE", contribution: 0, nonTabulated: false };
    }
    if (row.baseVote < ATTACK_MIN_SUFFICIENT_VOTE) {
      return { eligible: false, reason: "INSUFFICIENT_VOTE", contribution: 0, nonTabulated: false };
    }
    if (row.hasBonus) {
      return { eligible: false, reason: "HAS_BONUS", contribution: 0, nonTabulated: false };
    }
    if (row.missedPenalty) {
      return { eligible: false, reason: "MISSED_PENALTY", contribution: 0, nonTabulated: false };
    }
    const tabulated = attackTableBonus(row.baseVote);
    if (tabulated === null) {
      return { eligible: true, reason: null, contribution: 0, nonTabulated: true };
    }
    return { eligible: true, reason: null, contribution: tabulated, nonTabulated: false };
  });

  let total = 0;
  for (const p of perPlayer) total += p.contribution;
  return {
    total,
    perPlayer,
    eligibleCount: perPlayer.filter((p) => p.eligible).length,
    nonTabulatedCount: perPlayer.filter((p) => p.nonTabulated).length,
  };
}

/**
 * Il bonus tabellato di un voto SUFFICIENTE, oppure `null` se il voto e'
 * sufficiente ma fuori tabella (`DO_NOT_INTERPOLATE`).
 *
 * Sopra 8 la tabella e' una banda e copre qualunque voto, anche fuori griglia:
 * non c'e' niente da interpolare dove il regolamento dice gia' «>= 8.0».
 */
export function attackTableBonus(baseVote: number): number | null {
  if (baseVote >= 8) return 2;
  if (!Number.isInteger(baseVote * 2)) return null; // sufficiente ma fuori griglia 0,5
  for (const entry of ATTACK_TABLE) {
    if (baseVote >= entry.minVote) return entry.bonus;
  }
  return null;
}
