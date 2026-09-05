import { describe, it, expect } from "vitest";
import {
  lineupAge,
  lineupAgeLabel,
  lineupFreshness,
  matchdayCoherence,
  LETTURA_ATTUALE_ENTRO_MINUTI,
  NOMI_DEI_PEZZI,
} from "../src/lineupObservation.js";
import {
  AVVERSARIO_NON_DISPONIBILE,
  opponentForMatchday,
  rosterCount,
  type ObservedLeagueTeams,
} from "../src/leagueRoster.js";
import type { ObservedCalendar } from "../src/calendar.js";

// IL MOMENTO DELLA LETTURA E LE DUE SCALE DELLA GIORNATA.
//
// Le prove di questo file difendono l'unica cosa che questa schermata non può
// sbagliare: una formazione di un'altra giornata non deve poter comparire al
// posto di quella di adesso, e una lettura vecchia non deve poter sembrare
// fresca. I numeri usati sono quelli **misurati sulla lega vera** — Serie A 3,
// `sDay` 3, `mday` 1, `cmday` 3 — perché è esattamente la configurazione su cui
// il confronto ingenuo aveva già rifiutato una formazione giusta.

const ADESSO = "2026-09-04T18:00:00.000Z";

describe("le due scale della giornata", () => {
  it("la formazione della lega vera è coerente: mday 1, cmday 3, sDay 3, Serie A 3", () => {
    const esito = matchdayCoherence({
      leagueSeriesMatchday: 3,
      competitionStartDay: 3,
      lineupSeriesMatchday: 3,
      lineupCompetitionMatchday: 1,
    });
    expect(esito.coerente).toBe(true);
    if (esito.coerente) {
      expect(esito.seriesMatchday).toBe(3);
      expect(esito.competitionMatchday).toBe(1);
    }
  });

  it("il confronto INGENUO — mday contro status.mday — non è quello che viene fatto", () => {
    // 1 contro 3: è il confronto che rifiutò a torto la prima scrittura reale.
    // Se questa prova diventasse rossa, significherebbe che qualcuno l'ha
    // rimesso, e la pagina rifiuterebbe formazioni giuste.
    const esito = matchdayCoherence({
      leagueSeriesMatchday: 3,
      competitionStartDay: 3,
      lineupSeriesMatchday: 3,
      lineupCompetitionMatchday: 1,
    });
    expect(esito.coerente).toBe(true);
  });

  it("una coppa che comincia alla 7ª è coerente con mday 1 alla giornata 7", () => {
    const esito = matchdayCoherence({
      leagueSeriesMatchday: 7,
      competitionStartDay: 7,
      lineupSeriesMatchday: 7,
      lineupCompetitionMatchday: 1,
    });
    expect(esito.coerente).toBe(true);
  });

  it("una formazione della giornata SCORSA non passa, e lo dice con la scala giusta", () => {
    const esito = matchdayCoherence({
      leagueSeriesMatchday: 4,
      competitionStartDay: 3,
      lineupSeriesMatchday: 4,
      lineupCompetitionMatchday: 1, // dovrebbe essere 2
    });
    expect(esito.coerente).toBe(false);
    if (!esito.coerente) {
      expect(esito.cause).toBe("giornata_competizione_non_coincidente");
      expect(esito.expectedCompetitionMatchday).toBe(2);
      // I numeri del confronto viaggiano col rifiuto: un rifiuto senza i numeri
      // che l'hanno prodotto non è diagnosticabile da nessuno.
      expect(esito.numbers.lineupCompetitionMatchday).toBe(1);
    }
  });

  it("le due strade sono DUE: la prima cade da sola, con la sua causa", () => {
    const esito = matchdayCoherence({
      leagueSeriesMatchday: 3,
      competitionStartDay: 3,
      lineupSeriesMatchday: 2, // Serie A contro Serie A: non torna
      lineupCompetitionMatchday: 1,
    });
    expect(esito.coerente).toBe(false);
    if (!esito.coerente) expect(esito.cause).toBe("giornata_serie_a_non_coincidente");
  });

  it("manca UNO dei quattro numeri: non si sceglie il ramo permissivo", () => {
    const base = {
      leagueSeriesMatchday: 3,
      competitionStartDay: 3,
      lineupSeriesMatchday: 3,
      lineupCompetitionMatchday: 1,
    };
    for (const chiave of Object.keys(base) as (keyof typeof base)[]) {
      const numeri = { ...base, [chiave]: undefined };
      const esito = matchdayCoherence(numeri);
      expect(esito.coerente, chiave).toBe(false);
      if (!esito.coerente) expect(esito.cause, chiave).toBe("giornata_non_dichiarata");
    }
  });
});

describe("quanto è vecchia una lettura", () => {
  it("l'età si misura contro un istante DATO, mai contro un orologio letto qui", () => {
    expect(lineupAge("2026-09-04T17:00:00.000Z", ADESSO)).toBe(60);
    expect(lineupAge("2026-09-04T18:00:00.000Z", ADESSO)).toBe(0);
  });

  it("una lettura NEL FUTURO non è «freschissima»: l'età non è determinabile", () => {
    // È il caso più insidioso: un orologio che non torna produrrebbe un'età
    // negativa, e trattarla come zero farebbe passare per attuale un dato di cui
    // non si sa nulla.
    expect(lineupAge("2026-09-04T19:00:00.000Z", ADESSO)).toBeNull();
  });

  it("date illeggibili o vuote danno età ignota, non zero", () => {
    expect(lineupAge("", ADESSO)).toBeNull();
    expect(lineupAge("ieri pomeriggio", ADESSO)).toBeNull();
    expect(lineupAge(ADESSO, "")).toBeNull();
  });

  it("oltre la soglia la lettura smette di essere attuale, e la soglia viaggia con l'esito", () => {
    const dentro = lineupFreshness({ readAt: "2026-09-04T17:00:00.000Z", seriesMatchday: 3 }, ADESSO);
    expect(dentro.kind).toBe("attuale");

    const fuori = lineupFreshness({ readAt: "2026-09-04T10:00:00.000Z", seriesMatchday: 3 }, ADESSO);
    expect(fuori.kind).toBe("non_attuale");
    if (fuori.kind === "non_attuale") {
      expect(fuori.thresholdMinutes).toBe(LETTURA_ATTUALE_ENTRO_MINUTI);
      expect(fuori.ageMinutes).toBe(480);
    }
  });

  it("il confine è ESATTAMENTE la soglia: novanta minuti sono ancora attuali, novantuno no", () => {
    const alLimite = lineupFreshness({ readAt: "2026-09-04T16:30:00.000Z", seriesMatchday: 3 }, ADESSO);
    expect(alLimite.kind).toBe("attuale");
    const oltre = lineupFreshness({ readAt: "2026-09-04T16:29:00.000Z", seriesMatchday: 3 }, ADESSO);
    expect(oltre.kind).toBe("non_attuale");
  });

  it("età ignota è un terzo esito, non un ripiego su uno degli altri due", () => {
    const esito = lineupFreshness({ readAt: "non una data", seriesMatchday: 3 }, ADESSO);
    expect(esito.kind).toBe("eta_ignota");
  });

  it("l'età in parole non arrotonda mai verso il recente", () => {
    expect(lineupAgeLabel(0)).toBe("adesso");
    expect(lineupAgeLabel(1)).toBe("1 minuto fa");
    expect(lineupAgeLabel(59.9)).toBe("59 minuti fa");
    // 99 minuti NON sono «poco fa»: sono un'ora abbondante.
    expect(lineupAgeLabel(99)).toBe("1 ora fa");
    expect(lineupAgeLabel(60 * 25)).toBe("1 giorno fa");
    expect(lineupAgeLabel(60 * 24 * 21)).toBe("21 giorni fa");
    expect(lineupAgeLabel(null)).toBe("da quando non si sa");
  });

  it("ogni pezzo ha un nome, e i nomi sono tutti diversi", () => {
    const nomi = Object.values(NOMI_DEI_PEZZI);
    expect(new Set(nomi).size).toBe(nomi.length);
    expect(nomi.every((nome) => nome.length > 0)).toBe(true);
  });
});

describe("l'avversario di questa giornata", () => {
  const CALENDARIO: ObservedCalendar = {
    teamId: "t1",
    competitions: [
      {
        competition: { competitionId: "c1", name: "Campionato", kind: "campionato" },
        fixtures: [
          { competitionId: "c1", matchday: 1, opponentTeamId: "t2", venue: "casa" },
          { competitionId: "c1", matchday: 2, opponentTeamId: "t3" },
          { competitionId: "c1", matchday: 3, venue: "trasferta" },
        ],
      },
    ],
  };
  const SQUADRE: ObservedLeagueTeams = {
    teams: [
      { teamId: "t1", name: "La mia", roster: { teamId: "t1", players: [] } },
      { teamId: "t2", name: "L'altra", roster: null },
    ],
  };

  it("prende nome e rosa dall'elenco delle squadre, quando c'è", () => {
    const esito = opponentForMatchday(CALENDARIO, "c1", 1, SQUADRE);
    expect(esito.trovato).toBe(true);
    if (esito.trovato) {
      expect(esito.opponent.teamId).toBe("t2");
      expect(esito.opponent.name).toBe("L'altra");
      expect(esito.opponent.venue).toBe("casa");
      // ELENCATA MA ROSA NON LETTA: `null`, mai una rosa vuota.
      expect(esito.opponent.roster).toBeNull();
    }
  });

  it("senza elenco l'avversario resta un id: meno leggibile e vero", () => {
    const esito = opponentForMatchday(CALENDARIO, "c1", 1, null);
    expect(esito.trovato).toBe(true);
    if (esito.trovato) {
      expect(esito.opponent.teamId).toBe("t2");
      expect(esito.opponent.name).toBeUndefined();
    }
  });

  it("i cinque rifiuti sono distinti, e ognuno ha la sua frase", () => {
    expect(opponentForMatchday(null, "c1", 1, SQUADRE)).toEqual({
      trovato: false,
      cause: "calendario_non_letto",
    });
    expect(opponentForMatchday(CALENDARIO, "coppa", 1, SQUADRE)).toEqual({
      trovato: false,
      cause: "competizione_assente",
    });
    expect(opponentForMatchday(CALENDARIO, "c1", 9, SQUADRE)).toEqual({
      trovato: false,
      cause: "nessuna_sfida",
    });
    // La sfida della 2ª dichiara l'avversario ma NON il campo: due punti su una
    // fascia da sei non si scelgono d'ufficio.
    expect(opponentForMatchday(CALENDARIO, "c1", 2, SQUADRE)).toEqual({
      trovato: false,
      cause: "campo_non_dichiarato",
    });
    // La sfida della 3ª dichiara il campo ma non con chi si gioca.
    expect(opponentForMatchday(CALENDARIO, "c1", 3, SQUADRE)).toEqual({
      trovato: false,
      cause: "avversario_non_dichiarato",
    });
    const frasi = Object.values(AVVERSARIO_NON_DISPONIBILE);
    expect(new Set(frasi).size).toBe(frasi.length);
  });

  it("si contano le rose davvero osservate, non le squadre elencate", () => {
    expect(rosterCount(SQUADRE)).toBe(1);
    expect(rosterCount(null)).toBe(0);
  });
});
