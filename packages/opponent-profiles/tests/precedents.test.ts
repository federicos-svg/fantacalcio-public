import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  PRECEDENT_FACT_IDS,
  auctionPrecedents,
  calledPlayerIsExpensive,
  medianPrice,
  type ClubConcentrationFact,
  type PastAuctionPurchase,
  type PrecedentFact,
  type RepeatPurchaseFact,
  type TopSpendFact,
} from "../src/index.js";
import {
  CONFIRMED_PROFILE,
  PARTIALLY_CONFIRMED_PROFILE,
  PRECEDENT_SEATS_TO_PEOPLE,
  SUPPORTER_WITHOUT_SPEND_PROFILE,
  SYNTHETIC_CALLED_PLAYER,
  SYNTHETIC_CLUBS,
  SYNTHETIC_PERSON_IDS,
  SYNTHETIC_PERSON_ID_TORRES,
  SYNTHETIC_SEASONS,
  SYNTHETIC_SEAT_TORRES,
  syntheticAuctionHistory,
} from "../fixtures/synthetic.js";

// I PRECEDENTI D'ASTA, E IL CONFINE CHE NON POSSONO ATTRAVERSARE.
//
// Fixture sintetiche soltanto: club inventati, giocatori `sint-*`, persone
// legate a nessuno, posti con nomi di fantasquadra. Nessuna spesa e nessun
// tifo di una persona reale è riprodotto qui.
//
// Il file prova due cose diverse, e la seconda vale quanto la prima:
//  1. che i fatti misurati siano MISURATI BENE (conteggi, quote, numerosità);
//  2. che il pannello non possa produrre l'affermazione che gli è vietata —
//     in particolare «lo vuole perché tifa quella squadra».

const PROFILES = [CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE, SUPPORTER_WITHOUT_SPEND_PROFILE];

function reading(overrides: Partial<Parameters<typeof auctionPrecedents>[0]> = {}) {
  return auctionPrecedents({
    called: SYNTHETIC_CALLED_PLAYER,
    history: syntheticAuctionHistory(),
    seats: PRECEDENT_SEATS_TO_PEOPLE,
    profiles: PROFILES,
    ...overrides,
  });
}

function factOf<T extends PrecedentFact["id"]>(
  facts: readonly PrecedentFact[],
  id: T,
): Extract<PrecedentFact, { id: T }> | undefined {
  return facts.find((f) => f.id === id) as Extract<PrecedentFact, { id: T }> | undefined;
}

describe("medianPrice — aritmetica dichiarata, crediti interi", () => {
  it("con n dispari è il valore centrale, con n pari la media arrotondata per eccesso", () => {
    expect(medianPrice([10, 30, 20])).toBe(20);
    expect(medianPrice([80, 95])).toBe(88); // 87,5 -> 88: mezzo credito non esiste
    expect(medianPrice([])).toBeNull();
  });
});

describe("auctionPrecedents — il fatto più forte: ha già ricomprato QUESTO giocatore", () => {
  it("conta gli acquisti all'asta e NON i rinnovi, che restano dichiarati a parte", () => {
    const ataturk = reading().opponents.find((o) => o.fantaTeamId === "ataturk");
    const fact = factOf(ataturk!.facts, "ricomprato") as RepeatPurchaseFact;
    // Tre stagioni con quel giocatore in rosa, ma solo DUE volte ricomprato:
    // la terza è un rinnovo, cioè non averlo mai lasciato.
    expect(fact.auctionPurchases).toBe(2);
    expect(fact.purchaseSeasons).toEqual(["2022/23", "2024/25"]);
    expect(fact.renewalsExcluded).toBe(1);
    expect(fact.prices).toEqual([
      { season: "2022/23", price: 80 },
      { season: "2024/25", price: 95 },
    ]);
  });

  it("porta la propria numerosità: su quante stagioni, e quali", () => {
    const ataturk = reading().opponents.find((o) => o.fantaTeamId === "ataturk");
    const fact = factOf(ataturk!.facts, "ricomprato") as RepeatPurchaseFact;
    expect(fact.seasonsMeasured).toBe(5);
    expect(fact.seasons).toEqual([...SYNTHETIC_SEASONS]);
  });

  it("un solo rinnovo, senza nessun riacquisto, non è un precedente", () => {
    const history: readonly PastAuctionPurchase[] = [
      {
        season: "2024/25",
        personId: SYNTHETIC_PERSON_IDS.ataturk,
        playerId: SYNTHETIC_CALLED_PLAYER.playerId,
        club: SYNTHETIC_CLUBS.a,
        price: 90,
        acquisition: "riconferma",
      },
      {
        season: "2024/25",
        personId: SYNTHETIC_PERSON_IDS.ataturk,
        playerId: "sint-altro-1",
        club: SYNTHETIC_CLUBS.b,
        price: 10,
        acquisition: "asta",
      },
    ];
    const out = auctionPrecedents({
      called: SYNTHETIC_CALLED_PLAYER,
      history,
      seats: { ataturk: SYNTHETIC_PERSON_IDS.ataturk },
      profiles: [],
    });
    expect(out.opponents).toEqual([]);
    expect(out.emptyReason).toBe("no-facts");
  });
});

describe("auctionPrecedents — concentrazione di spesa sul club del chiamato", () => {
  it("tiene le stagioni separate: quattro alte e il crollo dell'ultima non si appiattiscono", () => {
    const dinamo = reading().opponents.find((o) => o.fantaTeamId === "dinamo_flavietto");
    const fact = factOf(dinamo!.facts, "club") as ClubConcentrationFact;
    expect(fact.perSeason.map((s) => Math.round(s.share * 1000) / 10)).toEqual([
      40, 35, 30, 28, 0,
    ]);
    expect(fact.seasonsAtOrAbove).toBe(4);
    expect(fact.seasonsMeasured).toBe(5);
    // L'ultima stagione è a zero e resta leggibile come tale: è il numero che
    // contraddice gli altri quattro, non uno da mediare con loro.
    expect(fact.latest).toEqual({ season: "2025/26", share: 0, amount: 0, total: 100 });
    expect(fact.threshold).toBe(DEFAULT_PRECEDENT_THRESHOLDS.clubShare);
  });

  it("i rinnovi non entrano nella quota di spesa: la stagione del rinnovo è a zero", () => {
    const ataturk = reading().opponents.find((o) => o.fantaTeamId === "ataturk");
    const fact = factOf(ataturk!.facts, "club") as ClubConcentrationFact;
    const renewalSeason = fact.perSeason.find((s) => s.season === "2023/24");
    expect(renewalSeason).toEqual({ season: "2023/24", share: 0, amount: 0, total: 100 });
    expect(fact.perSeason.map((s) => Math.round(s.share * 100))).toEqual([0, 80, 0, 95, 30]);
    expect(fact.seasonsAtOrAbove).toBe(3);
  });

  it("nessuna stagione alla soglia: nessun fatto, mai una riga «quota bassa»", () => {
    const out = reading({ thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, clubShare: 0.99 } });
    for (const opponent of out.opponents) {
      expect(factOf(opponent.facts, "club")).toBeUndefined();
    }
  });

  it("senza club sul giocatore chiamato la concentrazione non è calcolabile e non si finge", () => {
    const out = reading({ called: { playerId: SYNTHETIC_CALLED_PLAYER.playerId, club: "" } });
    for (const opponent of out.opponents) {
      expect(factOf(opponent.facts, "club")).toBeUndefined();
    }
  });
});

describe("auctionPrecedents — spesa sui propri più cari, e la sua pertinenza", () => {
  it("il chiamato è «caro» solo se lo dice lo storico, mai la quotazione del listone", () => {
    const history = syntheticAuctionHistory();
    // Mediana dei prezzi passati del chiamato: 80 e 95 -> 88.
    expect(calledPlayerIsExpensive(history, SYNTHETIC_CALLED_PLAYER, 50)).toBe(true);
    expect(calledPlayerIsExpensive(history, SYNTHETIC_CALLED_PLAYER, 200)).toBe(false);
    // Un giocatore che lo storico non ha mai visto all'asta non ha pertinenza,
    // e l'assenza non diventa un «sì».
    expect(
      calledPlayerIsExpensive(history, { playerId: "sint-mai-visto", club: SYNTHETIC_CLUBS.a }, 1),
    ).toBe(false);
  });

  it("il fatto sparisce quando il chiamato non è caro: la pertinenza è un cancello, non un dettaglio", () => {
    const withGate = reading().opponents.find((o) => o.fantaTeamId === SYNTHETIC_SEAT_TORRES);
    expect(factOf(withGate!.facts, "piu-cari")).toBeDefined();

    const closed = reading({
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, expensiveFrom: 200 },
    });
    expect(closed.opponents.find((o) => o.fantaTeamId === SYNTHETIC_SEAT_TORRES)).toBeUndefined();
    for (const opponent of closed.opponents) {
      expect(factOf(opponent.facts, "piu-cari")).toBeUndefined();
    }
  });

  it("un tratto che si regge sulla sola ultima stagione lo dichiara: 1 su 5", () => {
    const torres = reading().opponents.find((o) => o.fantaTeamId === SYNTHETIC_SEAT_TORRES);
    const fact = factOf(torres!.facts, "piu-cari") as TopSpendFact;
    expect(fact.perSeason.map((s) => Math.round(s.share * 100))).toEqual([48, 48, 48, 48, 80]);
    expect(fact.seasonsAtOrAbove).toBe(1);
    expect(fact.seasonsMeasured).toBe(5);
    expect(fact.latest.season).toBe("2025/26");
    expect(fact.topPurchases).toBe(DEFAULT_PRECEDENT_THRESHOLDS.topPurchases);
  });
});

describe("auctionPrecedents — il tifo non basta, e non può bastare", () => {
  it("chi tifa il club del chiamato ma non ci ha speso NON compare affatto", () => {
    const out = reading();
    // Persona 3 tifa il club A (profilo confermato) e ci ha speso il 3,6% e
    // poi lo 0%. Il pannello non deve poterla mostrare: la riga stessa
    // sarebbe l'affermazione «lo vuole», e nessun gesto la sostiene.
    expect(out.opponents.map((o) => o.fantaTeamId)).not.toContain("psg");
    expect(JSON.stringify(out)).not.toContain("psg");
  });

  it("il tifo non è nemmeno un tipo di fatto: non può diventare il titolo di una riga", () => {
    expect([...PRECEDENT_FACT_IDS]).toEqual(["ricomprato", "club", "piu-cari"]);
    expect(PRECEDENT_FACT_IDS as readonly string[]).not.toContain("tifo");
    for (const opponent of reading().opponents) {
      expect(opponent.facts.length).toBeGreaterThan(0);
      for (const fact of opponent.facts) {
        expect(PRECEDENT_FACT_IDS as readonly string[]).toContain(fact.id);
      }
    }
  });

  it("quando la riga esiste già, il tifo si accosta CON la spesa misurata accanto", () => {
    const ataturk = reading().opponents.find((o) => o.fantaTeamId === "ataturk");
    expect(ataturk!.supportedClub).not.toBeNull();
    expect(ataturk!.supportedClub!.club).toBe(SYNTHETIC_CLUBS.a);
    expect(ataturk!.supportedClub!.provenance).toBe("intervista_dichiarata");
    expect(ataturk!.supportedClub!.seasonsMeasured).toBe(5);
    expect(ataturk!.supportedClub!.latest!.season).toBe("2025/26");
  });

  it("un tifo solo PROPOSTO non è una dichiarazione e non viene accostato", () => {
    const proposed = {
      ...SUPPORTER_WITHOUT_SPEND_PROFILE,
      personId: SYNTHETIC_PERSON_IDS.ataturk,
      affinityClubs: {
        value: [SYNTHETIC_CLUBS.a],
        status: "proposto" as const,
        declaredAt: "2026-08-20",
      },
    };
    const out = reading({ profiles: [proposed] });
    const ataturk = out.opponents.find((o) => o.fantaTeamId === "ataturk");
    expect(ataturk!.supportedClub).toBeNull();
  });

  it("un tifo su un altro club non riguarda questo giocatore e non compare", () => {
    const other = {
      ...CONFIRMED_PROFILE,
      affinityClubs: {
        value: [SYNTHETIC_CLUBS.d],
        status: "confermato" as const,
        declaredAt: "2026-08-20",
      },
    };
    const ataturk = reading({ profiles: [other] }).opponents.find(
      (o) => o.fantaTeamId === "ataturk",
    );
    expect(ataturk!.supportedClub).toBeNull();
  });
});

describe("auctionPrecedents — i tre silenzi, e sono tre cose diverse", () => {
  it("nessun giocatore chiamato: non c'è soggetto, e lo dice", () => {
    const out = reading({ called: null });
    expect(out.opponents).toEqual([]);
    expect(out.emptyReason).toBe("no-called-player");
  });

  it("nessuno storico: non è «nessuno lo vuole», è «non lo so»", () => {
    const out = reading({ history: [] });
    expect(out.opponents).toEqual([]);
    expect(out.emptyReason).toBe("no-history");
    expect(out.seasons).toEqual([]);
  });

  it("storico presente ma nessun fatto pertinente a questo giocatore", () => {
    const out = reading({ called: { playerId: "sint-mai-visto", club: "Club Sintetico Z" } });
    expect(out.opponents).toEqual([]);
    expect(out.emptyReason).toBe("no-facts");
    expect(out.seasons).toEqual([...SYNTHETIC_SEASONS]);
  });

  it("un avversario ha un fatto e gli altri no: compare lui e nessun altro", () => {
    const history = syntheticAuctionHistory().filter(
      (r) => r.personId === SYNTHETIC_PERSON_IDS.dinamo,
    );
    const out = reading({ history });
    expect(out.opponents.map((o) => o.fantaTeamId)).toEqual(["dinamo_flavietto"]);
    expect(out.emptyReason).toBeNull();
    // Gli altri posti restano contati: «uno su quattro» è un'informazione, e
    // sparire dal denominatore la cancellerebbe.
    expect(out.seatsConsidered).toBe(5);
  });

  it("un posto senza persona è contato a parte: su di lui non esiste storico", () => {
    const out = reading();
    expect(out.seatsWithoutPerson).toBe(1);
    expect(out.opponents.map((o) => o.fantaTeamId)).not.toContain("ac_vostra");
  });

  it("la propria squadra è fuori dall'esito e dal denominatore", () => {
    const out = reading({ selfSeatId: "ataturk" });
    expect(out.opponents.map((o) => o.fantaTeamId)).not.toContain("ataturk");
    expect(out.seatsConsidered).toBe(4);
  });
});

describe("auctionPrecedents — ordine, determinismo, fail-closed", () => {
  it("ordina per TIPO di fatto dichiarato, poi per posto: mai per quanto è grande il numero", () => {
    const out = reading();
    expect(out.opponents.map((o) => o.fantaTeamId)).toEqual([
      "ataturk", // ricomprato
      "dinamo_flavietto", // club
      SYNTHETIC_SEAT_TORRES, // piu-cari
    ]);
    // Dentro una voce, i fatti seguono lo stesso ordine dichiarato.
    expect(out.opponents[0]!.facts.map((f) => f.id)).toEqual(["ricomprato", "club", "piu-cari"]);
  });

  it("a parità di tipo di fatto l'ordine è quello del posto, non quello della quota", () => {
    const history = [
      ...syntheticAuctionHistory().filter((r) => r.personId === SYNTHETIC_PERSON_IDS.dinamo),
      // Una seconda persona con lo stesso tipo di fatto e una quota PIÙ ALTA,
      // seduta in un posto che viene dopo in ordine alfabetico.
      ...syntheticAuctionHistory()
        .filter((r) => r.personId === SYNTHETIC_PERSON_IDS.dinamo)
        .map((r) => ({ ...r, personId: SYNTHETIC_PERSON_ID_TORRES, club: SYNTHETIC_CLUBS.a })),
    ];
    const out = auctionPrecedents({
      called: SYNTHETIC_CALLED_PLAYER,
      history,
      seats: PRECEDENT_SEATS_TO_PEOPLE,
      profiles: [],
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, expensiveFrom: 10_000 },
    });
    expect(out.opponents.map((o) => o.fantaTeamId)).toEqual([
      "dinamo_flavietto",
      SYNTHETIC_SEAT_TORRES,
    ]);
    const second = factOf(out.opponents[1]!.facts, "club") as ClubConcentrationFact;
    expect(second.latest.share).toBe(1);
  });

  it("stesso storico, stesso esito, sempre", () => {
    expect(JSON.stringify(reading())).toBe(JSON.stringify(reading()));
    const shuffled = [...syntheticAuctionHistory()].reverse();
    expect(JSON.stringify(reading({ history: shuffled }))).toBe(JSON.stringify(reading()));
  });

  it("uno storico strutturalmente rotto viene rifiutato, non contato a metà", () => {
    const broken = [
      ...syntheticAuctionHistory(),
      {
        season: "21-22", // non `YYYY/YY`: ordinerebbe in silenzio dopo 2025/26
        personId: SYNTHETIC_PERSON_IDS.dinamo,
        playerId: "sint-rotto",
        club: SYNTHETIC_CLUBS.b,
        price: 10,
        acquisition: "asta" as const,
      },
    ];
    expect(() => reading({ history: broken })).toThrow(/invalid history/);
  });

  it("l'esito dichiara su cosa poggia e con quali soglie, senza farlo indovinare", () => {
    const out = reading();
    expect(out.basis).toBe("auction-history");
    expect(out.seasons).toEqual([...SYNTHETIC_SEASONS]);
    expect(out.thresholds).toEqual(DEFAULT_PRECEDENT_THRESHOLDS);
  });
});

describe("il confine di prodotto: nessuno score, nessuna intenzione, nessuna previsione", () => {
  it("nessun campo aggregato di intensità in nessuna voce", () => {
    const out = reading();
    const FORBIDDEN =
      /score|punteggio|intensit|aggressiv|indice|ranking|rank|appetibil|interesse|want|desire|probab|predi|likelihood|tilt/i;
    for (const opponent of out.opponents) {
      for (const key of Object.keys(opponent)) expect(key).not.toMatch(FORBIDDEN);
      for (const fact of opponent.facts) {
        for (const key of Object.keys(fact)) expect(key).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("nessuna funzione del pacchetto promette di dire quanto un avversario vuole qualcosa", async () => {
    const api = await import("../src/index.js");
    const suspicious = Object.keys(api).filter((name) =>
      /score|aggressiv|wants|desire|intensity|predict|forecast|appeal/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });
});
