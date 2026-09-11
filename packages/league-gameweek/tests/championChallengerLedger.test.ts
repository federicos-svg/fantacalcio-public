import { describe, it, expect } from "vitest";
import {
  CHAMPION_CHALLENGER_WINDOW,
  REGRET_MAJORITY_MATCHDAYS,
  championChallengerCriterion,
  missingProposal,
  registeredProposal,
  runChampionChallengerLedger,
  type LedgerMatchday,
  type LedgerRow,
  type LedgerWindowEntry,
} from "../src/index.js";

// FIXTURE INTERAMENTE SINTETICHE. Nessun giocatore, nessuna quotazione, nessun
// avversario, nessun nome di lega: qui si simula il LEDGER, cioè due colonne di
// numeri già calcolati altrove, e i due motori sono due etichette costruite.
// È esattamente la prova di accettazione che §14 chiede per WP-9, e l'unica che
// si possa fare oggi: il criterio §2.4 è aritmetica su un registro, e un
// registro sintetico è un registro a tutti gli effetti.

const BASE = "motore-base";
const RICH = "motore-ricco-v1";

/**
 * LA GIORNATA IN CUI LO SFIDANTE DOMINA: più punti e meno rimpianto. Sei
 * giornate così soddisfano tutte e tre le condizioni di §2.4 punto 3.
 */
function challengerAhead(matchday: number, extra: Partial<LedgerMatchday> = {}): LedgerMatchday {
  return {
    matchday,
    competition: "LEAGUE",
    politicalVote: false,
    champion: registeredProposal("v1", 0, 10),
    challenger: registeredProposal("v1", 3, 5),
    ...extra,
  };
}

/** La stessa giornata a ruoli invertiti: chi è in carica domina, nessun cambio. */
function championAhead(matchday: number, extra: Partial<LedgerMatchday> = {}): LedgerMatchday {
  return {
    matchday,
    competition: "LEAGUE",
    politicalVote: false,
    champion: registeredProposal("v1", 3, 5),
    challenger: registeredProposal("v1", 0, 10),
    ...extra,
  };
}

function rowAt(rows: readonly LedgerRow[], matchday: number): LedgerRow {
  const row = rows.find((candidate) => candidate.matchday === matchday);
  if (row === undefined) throw new Error(`fixture: nessuna riga per la giornata ${matchday}`);
  return row;
}

function windowEntry(
  matchday: number,
  championLeaguePoints: number,
  championRegret: number,
  challengerLeaguePoints: number,
  challengerRegret: number,
): LedgerWindowEntry {
  return { matchday, championLeaguePoints, championRegret, challengerLeaguePoints, challengerRegret };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IL SESTO E NON PRIMA — le due metà della stessa regola.
// ─────────────────────────────────────────────────────────────────────────────

describe("lo sfidante entra al sesto e non prima (§2.4 punti 3 e 5)", () => {
  it("al quinto NON entra, per quanto domini", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5].map((matchday) => challengerAhead(matchday)),
    });

    expect(result.swaps).toEqual([]);
    expect(result.champion).toBe(BASE);
    expect(result.challenger).toBe(RICH);
    // Il criterio non è stato applicato NEMMENO UNA VOLTA: non è che sia stato
    // applicato e abbia detto di no. La differenza è tutta qui.
    expect(result.rows.every((row) => row.verdict === null)).toBe(true);
    expect(result.rows.every((row) => row.swapped === false)).toBe(true);
    expect(result.openWindow).toEqual([1, 2, 3, 4, 5]);
    expect(result.validMatchdaysToNextEvaluation).toBe(1);
  });

  it("al sesto entra, e i sei numeri del cambio sono quelli di (a), (b), (c)", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6].map((matchday) => challengerAhead(matchday)),
    });

    expect(result.swaps).toHaveLength(1);
    const swap = result.swaps[0];
    expect(swap?.afterMatchday).toBe(6);
    expect(swap?.previousChampion).toBe(BASE);
    expect(swap?.newChampion).toBe(RICH);
    expect(swap?.windowMatchdays).toEqual([1, 2, 3, 4, 5, 6]);
    // I SEI NUMERI di §2.4 punto 7, tre per motore: la mail del privato li
    // prende da qui e non li ricalcola.
    expect(swap?.numbers).toEqual({
      champion: { leaguePointsTotal: 0, meanRegret: 10, regretNotWorseMatchdays: 0 },
      challenger: { leaguePointsTotal: 18, meanRegret: 5, regretNotWorseMatchdays: 6 },
    });
    expect(result.champion).toBe(RICH);
    expect(result.challenger).toBe(BASE);

    // La riga della sesta giornata dice che il criterio è stato applicato LÌ.
    const sixth = rowAt(result.rows, 6);
    expect(sixth.swapped).toBe(true);
    expect(sixth.verdict?.pointsAtLeast).toBe(true);
    expect(sixth.verdict?.meanRegretLower).toBe(true);
    expect(sixth.verdict?.regretMajority).toBe(true);
    // Il confronto riparte da zero (§2.4 punto 5).
    expect(result.openWindow).toEqual([]);
    expect(result.validMatchdaysToNextEvaluation).toBe(CHAMPION_CHALLENGER_WINDOW);
  });

  it("dopo un cambio il confronto riparte da zero: al quinto successivo nessun secondo cambio", () => {
    const matchdays: LedgerMatchday[] = [
      ...[1, 2, 3, 4, 5, 6].map((matchday) => challengerAhead(matchday)),
      // Dopo il cambio i ruoli sono invertiti: in carica il ricco, in ombra la
      // base. Qui domina chi è in ombra, cioè la base che vuole rientrare.
      ...[7, 8, 9, 10, 11].map((matchday) => challengerAhead(matchday)),
    ];
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays,
    });

    expect(result.swaps).toHaveLength(1);
    expect(result.champion).toBe(RICH);
    expect(result.openWindow).toEqual([7, 8, 9, 10, 11]);
    // Nessuna delle cinque giornate dopo il cambio ha visto il criterio.
    for (const matchday of [7, 8, 9, 10, 11]) {
      expect(rowAt(result.rows, matchday).verdict).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. L'USCITA È SIMMETRICA.
// ─────────────────────────────────────────────────────────────────────────────

describe("il campione esce con lo stesso criterio a parti invertite (§2.4 punto 4)", () => {
  it("sei giornate dopo il cambio, chi è tornato in ombra rientra", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((matchday) => challengerAhead(matchday)),
    });

    expect(result.swaps).toHaveLength(2);
    expect(result.swaps[0]?.afterMatchday).toBe(6);
    expect(result.swaps[0]?.previousChampion).toBe(BASE);
    expect(result.swaps[0]?.newChampion).toBe(RICH);
    expect(result.swaps[1]?.afterMatchday).toBe(12);
    expect(result.swaps[1]?.previousChampion).toBe(RICH);
    expect(result.swaps[1]?.newChampion).toBe(BASE);
    expect(result.swaps[1]?.windowMatchdays).toEqual([7, 8, 9, 10, 11, 12]);
    expect(result.champion).toBe(BASE);
    expect(result.challenger).toBe(RICH);

    // Le righe attribuiscono i ruoli al momento in cui la giornata si è
    // giocata: prima del cambio la base è in carica, dopo è in ombra.
    expect(rowAt(result.rows, 6).championEngine).toBe(BASE);
    expect(rowAt(result.rows, 7).championEngine).toBe(RICH);
    expect(rowAt(result.rows, 7).challengerEngine).toBe(BASE);
  });

  it("chi è in carica e domina non esce mai, per quante giornate passino", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((matchday) => championAhead(matchday)),
    });

    expect(result.swaps).toEqual([]);
    expect(result.champion).toBe(BASE);
    // Il criterio è stato applicato, e ha detto di no: dalla sesta in poi ogni
    // riga ha un verdetto, e nessuno è un cambio.
    expect(rowAt(result.rows, 5).verdict).toBeNull();
    expect(rowAt(result.rows, 6).verdict?.swap).toBe(false);
    expect(rowAt(result.rows, 12).verdict?.swap).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. I TRE CASI CHE ALLUNGANO LA FINESTRA (§2.4 punto 6), uno per test.
// ─────────────────────────────────────────────────────────────────────────────

describe("coppa, voto politico e registrazione mancante allungano la finestra", () => {
  it("una giornata di COPPA non conta e sposta il cambio dalla sesta alla settima", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7].map((matchday) =>
        matchday === 3 ? challengerAhead(matchday, { competition: "CUP" }) : challengerAhead(matchday),
      ),
    });

    const cup = rowAt(result.rows, 3);
    expect(cup.counted).toBe(false);
    expect(cup.exclusions).toEqual(["CUP"]);
    // La finestra non è avanzata su quella giornata.
    expect(cup.validMatchdaysInWindow).toBe(2);
    // Alla sesta la finestra ha ancora cinque giornate valide: nessun criterio.
    expect(rowAt(result.rows, 6).verdict).toBeNull();
    expect(rowAt(result.rows, 6).validMatchdaysInWindow).toBe(5);
    // Il cambio arriva alla settima, e la finestra non contiene la terza.
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]?.afterMatchday).toBe(7);
    expect(result.swaps[0]?.windowMatchdays).toEqual([1, 2, 4, 5, 6, 7]);
    expect(result.exclusions).toEqual([{ matchday: 3, reasons: ["CUP"] }]);
  });

  it("una giornata a VOTO POLITICO non conta e sposta il cambio dalla sesta alla settima", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7].map((matchday) =>
        matchday === 4 ? challengerAhead(matchday, { politicalVote: true }) : challengerAhead(matchday),
      ),
    });

    const political = rowAt(result.rows, 4);
    expect(political.counted).toBe(false);
    expect(political.exclusions).toEqual(["POLITICAL_VOTE"]);
    expect(political.validMatchdaysInWindow).toBe(3);
    expect(rowAt(result.rows, 6).verdict).toBeNull();
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]?.afterMatchday).toBe(7);
    expect(result.swaps[0]?.windowMatchdays).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it("una REGISTRAZIONE MANCANTE non conta, anche se manca a un motore solo", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7].map((matchday) =>
        matchday === 5
          ? challengerAhead(matchday, { champion: missingProposal("proposta oltre la scadenza") })
          : challengerAhead(matchday),
      ),
    });

    const broken = rowAt(result.rows, 5);
    expect(broken.counted).toBe(false);
    expect(broken.exclusions).toEqual(["MISSING_REGISTRATION"]);
    expect(broken.validMatchdaysInWindow).toBe(4);
    // NON è un punto a favore dello sfidante, che invece aveva registrato: la
    // giornata sparisce per tutti e due.
    expect(rowAt(result.rows, 6).verdict).toBeNull();
    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]?.afterMatchday).toBe(7);
    expect(result.swaps[0]?.windowMatchdays).toEqual([1, 2, 3, 4, 6, 7]);
    expect(broken.reason).toContain("WP-8");
  });

  it("la registrazione mancante vale anche quando a mancare è lo sfidante", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7].map((matchday) =>
        matchday === 2
          ? challengerAhead(matchday, { challenger: missingProposal() })
          : challengerAhead(matchday),
      ),
    });

    expect(rowAt(result.rows, 2).exclusions).toEqual(["MISSING_REGISTRATION"]);
    expect(result.swaps[0]?.afterMatchday).toBe(7);
    expect(result.swaps[0]?.windowMatchdays).toEqual([1, 3, 4, 5, 6, 7]);
  });

  it("i tre motivi si sommano sulla stessa giornata invece di nascondersi a vicenda", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [
        challengerAhead(1, {
          competition: "CUP",
          politicalVote: true,
          champion: missingProposal(),
        }),
        challengerAhead(2),
      ],
    });

    expect(rowAt(result.rows, 1).exclusions).toEqual(["CUP", "POLITICAL_VOTE", "MISSING_REGISTRATION"]);
    expect(result.openWindow).toEqual([2]);
  });

  it("tre giornate escluse allungano la finestra di tre, non di una", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((matchday) => {
        if (matchday === 2) return challengerAhead(matchday, { competition: "CUP" });
        if (matchday === 4) return challengerAhead(matchday, { politicalVote: true });
        if (matchday === 6) return challengerAhead(matchday, { challenger: missingProposal() });
        return challengerAhead(matchday);
      }),
    });

    expect(result.swaps).toHaveLength(1);
    expect(result.swaps[0]?.afterMatchday).toBe(9);
    expect(result.swaps[0]?.windowMatchdays).toEqual([1, 3, 5, 7, 8, 9]);
    expect(result.exclusions).toEqual([
      { matchday: 2, reasons: ["CUP"] },
      { matchday: 4, reasons: ["POLITICAL_VOTE"] },
      { matchday: 6, reasons: ["MISSING_REGISTRATION"] },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. IL TERZO INVIO DI PICO NON MUOVE I NUMERI (§2.4 punto 2).
// ─────────────────────────────────────────────────────────────────────────────

describe("il terzo invio di Pico si registra e non conta", () => {
  it("un override clamoroso su ogni giornata lascia i numeri e la decisione identici", () => {
    const plain = [1, 2, 3, 4, 5, 6].map((matchday) => challengerAhead(matchday));
    // La formazione schierata a mano batte tutti: tre punti e rimpianto zero,
    // ogni giornata. Se entrasse nei conti, il campione non uscirebbe più.
    const overridden = plain.map((matchday) => ({
      ...matchday,
      picoOverride: { leaguePoints: 3, regret: 0, note: "terzo invio, formazione inserita a mano" },
    }));

    const withoutPico = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: plain,
    });
    const withPico = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: overridden,
    });

    expect(withPico.swaps).toEqual(withoutPico.swaps);
    expect(withPico.champion).toBe(withoutPico.champion);
    expect(withPico.challenger).toBe(withoutPico.challenger);
    expect(withPico.rows.map((row) => row.verdict)).toEqual(withoutPico.rows.map((row) => row.verdict));
    expect(withPico.rows.map((row) => row.counted)).toEqual(withoutPico.rows.map((row) => row.counted));

    // L'unica differenza è che l'intervento è REGISTRATO: §11.1 misura la
    // politica di Pico a parte, e per misurarla qualcuno deve averla scritta.
    expect(withPico.picoOverrideMatchdays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(withoutPico.picoOverrideMatchdays).toEqual([]);
    expect(withPico.rows.every((row) => row.picoOverrideRecorded)).toBe(true);
    expect(rowAt(withPico.rows, 1).reason).toContain("NON contato");
  });

  it("un override non salva il campione che sta perdendo il confronto", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6].map((matchday) =>
        challengerAhead(matchday, { picoOverride: { leaguePoints: 3, regret: 0 } }),
      ),
    });

    expect(result.swaps).toHaveLength(1);
    expect(result.champion).toBe(RICH);
    expect(result.swaps[0]?.numbers.champion).toEqual({
      leaguePointsTotal: 0,
      meanRegret: 10,
      regretNotWorseMatchdays: 0,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. IL CRITERIO NUDO — le tre condizioni, una per volta.
// ─────────────────────────────────────────────────────────────────────────────

describe("le tre condizioni di §2.4 punto 3, ciascuna necessaria", () => {
  it("(a) i punti pari bastano: il segno è `≥`, non `>`", () => {
    // Punti identici, rimpianto dello sfidante sempre minore.
    const verdict = championChallengerCriterion(
      [1, 2, 3, 4, 5, 6].map((matchday) => windowEntry(matchday, 1, 10, 1, 5)),
    );
    expect(verdict.pointsAtLeast).toBe(true);
    expect(verdict.swap).toBe(true);
  });

  it("(a) meno punti fermano il cambio anche con il rimpianto migliore", () => {
    const verdict = championChallengerCriterion(
      [1, 2, 3, 4, 5, 6].map((matchday) => windowEntry(matchday, 3, 10, 0, 1)),
    );
    expect(verdict.pointsAtLeast).toBe(false);
    expect(verdict.meanRegretLower).toBe(true);
    expect(verdict.regretMajority).toBe(true);
    expect(verdict.swap).toBe(false);
  });

  it("(b) il rimpianto medio PARI non basta: il segno è `<` stretto", () => {
    const verdict = championChallengerCriterion(
      [1, 2, 3, 4, 5, 6].map((matchday) => windowEntry(matchday, 3, 7, 3, 7)),
    );
    expect(verdict.pointsAtLeast).toBe(true);
    expect(verdict.meanRegretLower).toBe(false);
    // Tutti pari: (c) conta i pari come «non peggiore», ed è corretto.
    expect(verdict.regretMajority).toBe(true);
    expect(verdict.swap).toBe(false);
  });

  it("(c) tre giornate su sei non bastano, ne servono quattro", () => {
    // Tre giornate con vantaggio enorme, tre con svantaggio piccolo: la media
    // dello sfidante è migliore, ma il vantaggio è concentrato.
    const verdict = championChallengerCriterion([
      windowEntry(1, 0, 30, 3, 0),
      windowEntry(2, 0, 30, 3, 0),
      windowEntry(3, 0, 30, 3, 0),
      windowEntry(4, 0, 1, 3, 2),
      windowEntry(5, 0, 1, 3, 2),
      windowEntry(6, 0, 1, 3, 2),
    ]);
    expect(verdict.pointsAtLeast).toBe(true);
    expect(verdict.meanRegretLower).toBe(true);
    expect(verdict.numbers.challenger.regretNotWorseMatchdays).toBe(3);
    expect(verdict.regretMajority).toBe(false);
    expect(verdict.swap).toBe(false);
    expect(REGRET_MAJORITY_MATCHDAYS).toBe(4);
  });

  it("una finestra che non ha esattamente sei giornate non è una finestra", () => {
    const five = [1, 2, 3, 4, 5].map((matchday) => windowEntry(matchday, 0, 10, 3, 5));
    expect(() => championChallengerCriterion(five)).toThrow(/sei giornate valide|5 giornata/);
    const seven = [1, 2, 3, 4, 5, 6, 7].map((matchday) => windowEntry(matchday, 0, 10, 3, 5));
    expect(() => championChallengerCriterion(seven)).toThrow(/7 giornata/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. LE GUARDIE — ciò che il ledger rifiuta invece di indovinare.
// ─────────────────────────────────────────────────────────────────────────────

describe("il ledger rifiuta ciò che non può interpretare", () => {
  it("un ledger vuoto non è una parità", () => {
    expect(() =>
      runChampionChallengerLedger({ initialChampion: BASE, initialChallenger: RICH, matchdays: [] }),
    ).toThrow(/mai cominciato/);
  });

  it("due righe per la stessa giornata sono un errore, non un dato più ricco", () => {
    expect(() =>
      runChampionChallengerLedger({
        initialChampion: BASE,
        initialChallenger: RICH,
        matchdays: [challengerAhead(1), challengerAhead(1)],
      }),
    ).toThrow(/compare due volte/);
  });

  it("un motore non si confronta con se stesso", () => {
    expect(() =>
      runChampionChallengerLedger({
        initialChampion: BASE,
        initialChallenger: BASE,
        matchdays: [challengerAhead(1)],
      }),
    ).toThrow(/stesso nome/);
  });

  it("un rimpianto negativo si rifiuta: nessuno batte il tetto ex-post", () => {
    expect(() =>
      runChampionChallengerLedger({
        initialChampion: BASE,
        initialChallenger: RICH,
        matchdays: [challengerAhead(1, { challenger: registeredProposal("v2", 3, -1) })],
      }),
    ).toThrow(/rimpianto negativo/);
  });

  it("se il registro e il criterio non concordano su chi era in carica, si ferma", () => {
    expect(() =>
      runChampionChallengerLedger({
        initialChampion: BASE,
        initialChallenger: RICH,
        matchdays: [challengerAhead(1, { championEngine: RICH })],
      }),
    ).toThrow(/dichiara campione/);
  });

  it("il controllo facoltativo sui nomi passa quando il registro è coerente, cambio compreso", () => {
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: [1, 2, 3, 4, 5, 6, 7].map((matchday) =>
        challengerAhead(matchday, {
          championEngine: matchday <= 6 ? BASE : RICH,
          challengerEngine: matchday <= 6 ? RICH : BASE,
        }),
      ),
    });
    expect(result.swaps).toHaveLength(1);
    expect(result.champion).toBe(RICH);
  });

  it("le righe si riportano in ordine di giornata anche se arrivano sparse", () => {
    const shuffled = [4, 1, 6, 2, 5, 3].map((matchday) => challengerAhead(matchday));
    const result = runChampionChallengerLedger({
      initialChampion: BASE,
      initialChallenger: RICH,
      matchdays: shuffled,
    });
    expect(result.rows.map((row) => row.matchday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.swaps[0]?.afterMatchday).toBe(6);
  });
});
