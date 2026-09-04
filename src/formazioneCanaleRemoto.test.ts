import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  leggiCanaleDaDeposito,
  statoDaDeposito,
  FORMAZIONE_DEPOSITO_FORMATO,
  FORMAZIONE_ENDPOINT,
} from "./formazioneCanaleRemoto.js";

// L'ADATTATORE FRA IL DEPOSITO E LA PAGINA, provato senza rete.
//
// Le prove qui dentro difendono una regola sola, in tutte le forme in cui può
// essere violata: **ciò che non è stato letto non prende l'aspetto di ciò che è
// stato letto**. Un deposito storto non produce mezza formazione, una rosa non
// letta non diventa una rosa vuota, una formazione di un'altra giornata non
// compare al posto di quella di adesso.

const ESEMPIO = JSON.parse(
  readFileSync(new URL("../fixtures/league-channel-observation.example.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

function copia(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ESEMPIO)) as Record<string, unknown>;
}

function competizioni(payload: Record<string, unknown>): Record<string, unknown>[] {
  return payload["competitions"] as Record<string, unknown>[];
}

describe("il percorso è relativo e non nomina niente", () => {
  it("nessun host, nessuno schema, nessuna piattaforma", () => {
    expect(FORMAZIONE_ENDPOINT.startsWith("/")).toBe(true);
    expect(FORMAZIONE_ENDPOINT).not.toContain("http");
    expect(FORMAZIONE_ENDPOINT).not.toContain(".");
  });
});

describe("la fixture sintetica si legge per intero", () => {
  it("rosa, impostazioni, formazione, squadre di lega e calendario arrivano tutti", () => {
    const stato = statoDaDeposito(ESEMPIO);
    expect(stato.kind).toBe("letto");
    if (stato.kind !== "letto") return;

    expect(stato.roster.players).toHaveLength(12);
    expect(stato.competitions).toHaveLength(2);
    expect(stato.competitions[0]?.state.kind).toBe("letta");
    expect(stato.competitions[0]?.matchday).toBe(1);
    // La coppa dichiara PERCHÉ non c'è una formazione, e non cade sulla guardia
    // della giornata: non ha niente da datare.
    expect(stato.competitions[1]?.state.kind).toBe("non_disponibile");
    expect(stato.leagueTeams?.teams).toHaveLength(2);
    expect(stato.calendar?.competitions[0]?.fixtures[0]?.opponentTeamId).toBe("t-avv");
  });

  it("ogni pezzo porta il PROPRIO momento, e non sono lo stesso", () => {
    const stato = statoDaDeposito(ESEMPIO);
    if (stato.kind !== "letto") throw new Error("atteso letto");
    // È il punto di tutto il meccanismo: la formazione è di mezz'ora fa, le rose
    // di stamattina, e la pagina deve poterlo dire separatamente.
    expect(stato.observations.lineup.readAt).not.toBe(stato.observations.roster.readAt);
    expect(stato.observations.calendar).not.toBeNull();
  });

  it("le rose avversarie NON LETTE restano null, mai una rosa vuota", () => {
    const stato = statoDaDeposito(ESEMPIO);
    if (stato.kind !== "letto") throw new Error("atteso letto");
    for (const squadra of stato.leagueTeams?.teams ?? []) {
      expect(squadra.roster).toBeNull();
    }
  });
});

describe("un deposito che non si può leggere si dichiara, non si arrotonda", () => {
  const casi: readonly [string, unknown][] = [
    ["non è un oggetto", ["niente"]],
    ["è nullo", null],
    ["è una stringa", "formazione"],
  ];
  for (const [nome, payload] of casi) {
    it(`rifiuta un deposito che ${nome}`, () => {
      const stato = statoDaDeposito(payload);
      expect(stato.kind).toBe("sconosciuto");
      if (stato.kind === "sconosciuto") expect(stato.cause).toBe("risposta_illeggibile");
    });
  }

  it("senza la targa del formato non si legge niente", () => {
    const payload = copia();
    payload["format"] = "LEAGUE-CHANNEL-OBSERVATION@0";
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") {
      expect(stato.cause).toBe("risposta_illeggibile");
      expect(stato.detail).toContain(FORMAZIONE_DEPOSITO_FORMATO);
    }
  });

  it("un deposito SENZA il momento della lettura è illeggibile, non «vecchio»", () => {
    const payload = copia();
    delete (payload["observations"] as Record<string, unknown>)["lineup"];
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") expect(stato.cause).toBe("risposta_illeggibile");
  });

  it("un momento che non è una data non passa: altrimenti l'età resterebbe ignota per sempre", () => {
    const payload = copia();
    (payload["observations"] as Record<string, Record<string, unknown>>)["lineup"] = {
      readAt: "ieri sera",
      seriesMatchday: 3,
    };
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
  });

  it("un pezzo presente senza il suo momento è un deposito incoerente", () => {
    const payload = copia();
    (payload["observations"] as Record<string, unknown>)["calendar"] = null;
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") expect(stato.detail).toContain("calendario");
  });

  it("una formazione senza portiere non produce mezza formazione", () => {
    const payload = copia();
    delete (competizioni(payload)[0]?.["lineup"] as Record<string, unknown>)["goalkeeperId"];
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
  });

  it("una formazione che dichiara un'ALTRA competizione non viene riassegnata d'ufficio", () => {
    const payload = copia();
    (competizioni(payload)[0]?.["lineup"] as Record<string, unknown>)["competitionId"] = "c-altra";
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
  });

  it("una rosa avversaria malformata non diventa «non letta»: fa fallire la lettura", () => {
    const payload = copia();
    (payload["leagueTeams"] as { teams: Record<string, unknown>[] }).teams[1]!["roster"] = {
      teamId: "t-avv",
      players: [{ id: "x" }],
    };
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
  });
});

describe("la giornata: una formazione di un'altra giornata non compare", () => {
  it("il campionato di un'altra giornata non si mostra, e il motivo porta i numeri", () => {
    const payload = copia();
    // La lega è alla 3ª, il campionato comincia alla 3ª: la formazione dovrebbe
    // portare mday 1. Questa ne porta 5 — è di quattro giornate dopo.
    competizioni(payload)[0]!["lineupCompetitionMatchday"] = 5;
    const stato = statoDaDeposito(payload);
    // La coppa resta mostrabile, quindi lo stato è letto e la sola competizione
    // incoerente dichiara il perché: non si nasconde tutta la pagina per una.
    expect(stato.kind).toBe("letto");
    if (stato.kind !== "letto") return;
    const campionato = stato.competitions[0];
    expect(campionato?.state.kind).toBe("non_disponibile");
    if (campionato?.state.kind === "non_disponibile") {
      expect(campionato.state.reason).toContain("un'altra giornata");
      expect(campionato.state.reason).toContain("attesa per questa competizione: 1");
    }
  });

  it("quando NESSUNA competizione è mostrabile lo dice la pagina intera, una volta", () => {
    const payload = copia();
    competizioni(payload)[0]!["lineupCompetitionMatchday"] = 5;
    // Anche la coppa porta ora una formazione, e di una giornata sbagliata.
    competizioni(payload)[1] = {
      ...competizioni(payload)[1],
      lineupSeriesMatchday: 3,
      lineupCompetitionMatchday: 9,
      lineup: (competizioni(payload)[0] as Record<string, unknown>)["lineup"],
    };
    delete competizioni(payload)[1]!["unavailableReason"];
    (competizioni(payload)[1]!["lineup"] as Record<string, unknown>)["competitionId"] = "c-coppa";
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") expect(stato.cause).toBe("giornata_non_corrispondente");
  });

  it("manca uno dei quattro numeri: si dichiara che non si è potuto controllare", () => {
    const payload = copia();
    delete competizioni(payload)[0]!["startDay"];
    const stato = statoDaDeposito(payload);
    expect(stato.kind).toBe("letto");
    if (stato.kind !== "letto") return;
    const campionato = stato.competitions[0];
    if (campionato?.state.kind === "non_disponibile") {
      expect(campionato.state.reason).toContain("non dice a quale giornata");
    } else {
      throw new Error("atteso non disponibile");
    }
  });
});

describe("la richiesta: ogni esito è uno stato dichiarato, mai un'eccezione", () => {
  const rispostaOk = (payload: unknown): typeof fetch =>
    (async () =>
      new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;

  it("una risposta buona diventa uno stato letto", async () => {
    const stato = await leggiCanaleDaDeposito({ fetchImpl: rispostaOk(ESEMPIO) });
    expect(stato.kind).toBe("letto");
  });

  it("un codice di guasto del layer privato diventa «la lega non ha risposto», col codice", async () => {
    const fetchImpl = (async () =>
      new Response('{"error":"configuration_missing"}', { status: 503 })) as unknown as typeof fetch;
    const stato = await leggiCanaleDaDeposito({ fetchImpl });
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") {
      expect(stato.cause).toBe("risposta_assente");
      expect(stato.detail).toContain("503");
    }
  });

  it("una rete caduta non fa cadere lo schermo", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const stato = await leggiCanaleDaDeposito({ fetchImpl });
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") expect(stato.cause).toBe("risposta_assente");
  });

  it("una risposta che non è JSON è illeggibile, non assente: sono rimedi diversi", async () => {
    const fetchImpl = (async () =>
      new Response("<html>errore</html>", { status: 200 })) as unknown as typeof fetch;
    const stato = await leggiCanaleDaDeposito({ fetchImpl });
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") expect(stato.cause).toBe("risposta_illeggibile");
  });

  it("la richiesta viene abbandonata dopo il tempo dichiarato", async () => {
    const fetchImpl = ((_: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_risolvi, rifiuta) => {
        init?.signal?.addEventListener("abort", () => {
          const errore = new Error("aborted");
          errore.name = "AbortError";
          rifiuta(errore);
        });
      })) as unknown as typeof fetch;
    const stato = await leggiCanaleDaDeposito({ fetchImpl, timeoutMs: 5 });
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") {
      expect(stato.cause).toBe("risposta_assente");
      expect(stato.detail).toContain("secondi");
    }
  });
});
