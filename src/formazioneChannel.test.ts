import { describe, it, expect, afterEach } from "vitest";
import {
  connectLineupChannel,
  connectLineupProducer,
  connectLineupSubmit,
  lineupProducerReports,
  readLineupChannelState,
  submitLineup,
} from "./formazioneChannel.js";
import type {
  LineupChannelState,
  LineupConstraints,
  LineupSubmission,
  ObservedLineup,
} from "../packages/league-channel-contract/src/index.js";

// LE DUE PORTE, E I MODI IN CUI POSSONO NON RISPONDERE.
//
// Nel core pubblico nessuna delle due è collegata: la prima cosa che questi
// test provano è che quella assenza abbia un nome — `porta_non_collegata` — e
// non diventi «non hai schierato». Le altre provano che un'eccezione non faccia
// mai cadere lo schermo e, soprattutto, che un invio esploso NON venga
// raccontato come «non inviato»: forse è già sulla piattaforma.

/** Formazione sintetica: id opachi inventati qui, come vuole il contratto. */
const FORMAZIONE_SINTETICA: ObservedLineup = {
  competitionId: "c1",
  module: "442",
  goalkeeperId: "p1",
  starterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
  benchIds: ["p12", "p13", "p14", "p15", "p16"],
  flags: { hidden: false, allCompetitions: false },
};

const INVIO_SINTETICO: LineupSubmission = {
  matchday: 5,
  competitionId: "c1",
  lineup: FORMAZIONE_SINTETICA,
  leagueRuleVersion: "2026_27_v1",
};

const LETTO: LineupChannelState = {
  kind: "letto",
  roster: { teamId: "t1", players: [{ id: "p1", role: "P" }] },
  settings: {},
  competitions: [],
};

afterEach(() => {
  connectLineupChannel(null);
  connectLineupSubmit(null);
  connectLineupProducer(null);
});

const VINCOLI = new Map<string, LineupConstraints>([
  ["c1", { lockedStarterIds: ["p2"], locked: true }],
]);

const LETTO_CON_COMPETIZIONE: LineupChannelState = {
  kind: "letto",
  roster: { teamId: "t1", players: [{ id: "p1", role: "P" }] },
  settings: {},
  competitions: [
    {
      competition: { competitionId: "c1", kind: "campionato" },
      matchday: 5,
      state: { kind: "letta", lineup: FORMAZIONE_SINTETICA },
    },
  ],
};

describe("la porta di lettura", () => {
  it("senza nessuna porta collegata dichiara che il canale non c'è", () => {
    const state = readLineupChannelState();
    expect(state.kind).toBe("sconosciuto");
    if (state.kind !== "sconosciuto") return;
    expect(state.cause).toBe("porta_non_collegata");
  });

  it("una porta collegata risponde con quello che ha letto, senza che nessuno lo ritocchi", () => {
    connectLineupChannel({ readState: () => LETTO });
    expect(readLineupChannelState()).toEqual(LETTO);
  });

  it("una porta che non restituisce niente diventa «risposta assente», non «letto vuoto»", () => {
    connectLineupChannel({ readState: () => null as unknown as LineupChannelState });
    const state = readLineupChannelState();
    expect(state.kind).toBe("sconosciuto");
    if (state.kind !== "sconosciuto") return;
    expect(state.cause).toBe("risposta_assente");
  });

  it("una porta che rompe diventa «risposta illeggibile», col dettaglio che ha dato", () => {
    connectLineupChannel({
      readState: () => {
        throw new Error("campo mancante");
      },
    });
    const state = readLineupChannelState();
    expect(state.kind).toBe("sconosciuto");
    if (state.kind !== "sconosciuto") return;
    expect(state.cause).toBe("risposta_illeggibile");
    expect(state.detail).toBe("campo mancante");
  });

  it("scollegare la porta riporta allo stato dichiarato di partenza", () => {
    connectLineupChannel({ readState: () => LETTO });
    connectLineupChannel(null);
    const state = readLineupChannelState();
    if (state.kind !== "sconosciuto") throw new Error("atteso stato sconosciuto");
    expect(state.cause).toBe("porta_non_collegata");
  });
});

describe("la porta di invio", () => {
  it("senza porta collegata nulla parte, e lo si dice", () => {
    const attempt = submitLineup(INVIO_SINTETICO);
    expect(attempt.kind).toBe("non_collegata");
  });

  it("l'esito della porta arriva così com'è: qui non si arrotonda niente", () => {
    connectLineupSubmit({
      submit: () => ({
        kind: "esito",
        outcome: {
          status: "rifiutato",
          differences: [],
          reason: "deadline passata",
          leagueRuleVersion: "2026_27_v1",
        },
      }),
    });
    const attempt = submitLineup(INVIO_SINTETICO);
    expect(attempt.kind).toBe("esito");
    if (attempt.kind !== "esito") return;
    expect(attempt.outcome.status).toBe("rifiutato");
  });

  it("una porta che esplode non diventa «non inviato»: diventa «interrotta»", () => {
    // È la bugia più costosa possibile: dire che non è partito niente di un
    // invio che potrebbe essere già sulla piattaforma.
    connectLineupSubmit({
      submit: () => {
        throw new Error("connessione caduta");
      },
    });
    const attempt = submitLineup(INVIO_SINTETICO);
    expect(attempt.kind).toBe("interrotta");
    if (attempt.kind !== "interrotta") return;
    expect(attempt.reason).toBe("connessione caduta");
  });

  it("una porta che non dice com'è andata è «interrotta» anche lei", () => {
    connectLineupSubmit({ submit: () => undefined as unknown as never });
    expect(submitLineup(INVIO_SINTETICO).kind).toBe("interrotta");
  });

  it("l'invio che arriva alla porta è quello costruito, non una copia rifatta", () => {
    let visto: LineupSubmission | null = null;
    connectLineupSubmit({
      submit: (submission) => {
        visto = submission;
        return { kind: "interrotta", reason: "" };
      },
    });
    submitLineup(INVIO_SINTETICO);
    expect(visto).toBe(INVIO_SINTETICO);
  });
});

describe("la porta del produttore", () => {
  it("senza produttore non si finge di averlo interrogato", () => {
    const esito = lineupProducerReports(LETTO_CON_COMPETIZIONE, VINCOLI);
    expect(esito.reports.size).toBe(0);
    expect(esito.failure).toBe("");
  });

  it("la formazione corrente arriva sempre al produttore: con la blindatura è quella da tenere", () => {
    let visto: unknown = null;
    connectLineupProducer({
      report: (input) => {
        visto = input;
        return { rejection: null };
      },
    });
    lineupProducerReports(LETTO_CON_COMPETIZIONE, VINCOLI);
    expect(visto).toEqual({
      competitionId: "c1",
      constraints: { lockedStarterIds: ["p2"], locked: true },
      currentLineup: FORMAZIONE_SINTETICA,
    });
  });

  it("un produttore che rompe viene DETTO, non confuso con un produttore assente", () => {
    connectLineupProducer({
      report: () => {
        throw new Error("previsioni mancanti");
      },
    });
    const esito = lineupProducerReports(LETTO_CON_COMPETIZIONE, VINCOLI);
    expect(esito.reports.size).toBe(0);
    expect(esito.failure).toContain("previsioni mancanti");
  });

  it("senza una squadra letta non c'è niente da chiedere a nessuno", () => {
    connectLineupProducer({ report: () => ({ rejection: null }) });
    expect(
      lineupProducerReports({ kind: "sconosciuto", cause: "risposta_assente", detail: "" }, VINCOLI)
        .reports.size,
    ).toBe(0);
  });
});
