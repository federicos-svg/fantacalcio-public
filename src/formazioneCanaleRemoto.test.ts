import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  leggiCanaleDaDeposito,
  statoDaDeposito,
  FORMAZIONE_DEPOSITO_FORMATO,
  FORMAZIONE_ENDPOINT,
} from "./formazioneCanaleRemoto.js";
import { costruisciLettura } from "./formazioneLettura.js";
import {
  buildFormazioneView,
  prepareSubmission,
  saveBlockers,
  validateObservedLeagueSettings,
  MODULES,
  NO_LINEUP_CONSTRAINTS,
  type LineupChannelState,
  type ObservedLeagueSettings,
} from "../packages/league-channel-contract/src/index.js";

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

/* ────────────────────────────────────────────────────────────────────────────
   LE IMPOSTAZIONI DI LEGA — l'unico campo che non era validato
   ──────────────────────────────────────────────────────────────────────────── */

function impostazioniDi(payload: Record<string, unknown>): Record<string, unknown> {
  return payload["settings"] as Record<string, unknown>;
}

function conImpostazione(campo: string, valore: unknown): Record<string, unknown> {
  const payload = copia();
  impostazioniDi(payload)[campo] = valore;
  return payload;
}

/** Le impostazioni lette, oppure il fallimento della prova: mai un `as`. */
function impostazioniLette(payload: Record<string, unknown>): ObservedLeagueSettings {
  const stato = statoDaDeposito(payload);
  if (stato.kind !== "letto") throw new Error(`atteso letto, ottenuto ${stato.kind}`);
  return stato.settings;
}

describe("le impostazioni di lega si leggono campo per campo, come tutto il resto", () => {
  // LE TRE FORME DELL'AUDIT. Ognuna di queste, prima, arrivava intatta dentro lo
  // stato e faceva lanciare il disegno DOPO che il contenitore era già stato
  // svuotato: pagina bianca, e il ricaricamento non serviva a niente perché il
  // deposito era ancora quello.
  const FORME_STORTE: readonly [string, unknown][] = [
    ["una stringa", "442"],
    ["un oggetto vuoto", {}],
    ["un oggetto qualunque", { "442": true }],
    ["un numero", 3],
    ["un booleano", true],
    ["una lista di numeri", [442, 352]],
    ["una lista di null", [null]],
    ["una lista con un modulo che §9 non conosce", ["442", "4231"]],
  ];
  for (const [nome, valore] of FORME_STORTE) {
    it(`allowedModules ${nome} è un deposito NON CAPITO, non una lega senza moduli`, () => {
      const stato = statoDaDeposito(conImpostazione("allowedModules", valore));
      expect(stato.kind).toBe("sconosciuto");
      if (stato.kind !== "sconosciuto") return;
      expect(stato.cause).toBe("risposta_illeggibile");
      // Il campo si nomina: chi deve correggere il deposito non deve indovinare.
      expect(stato.detail).toContain("allowedModules");
    });
  }

  it("allowedModules `null` è NON OSSERVATO: la lettura riesce e il campo resta fuori", () => {
    // `null` è il vocabolario del deposito, non un guasto: la lega che non
    // dichiara i moduli è il caso normale, e la pagina lo dice invece di morire.
    const impostazioni = impostazioniLette(conImpostazione("allowedModules", null));
    expect(impostazioni.allowedModules).toBeUndefined();
    expect("allowedModules" in impostazioni).toBe(false);
    expect(impostazioni.maxSubstitutions).toBe(3);
  });

  it("un campo assente e un campo `null` si leggono allo stesso modo", () => {
    const payload = copia();
    delete impostazioniDi(payload)["allowedModules"];
    expect(impostazioniLette(payload)).toEqual(
      impostazioniLette(conImpostazione("allowedModules", null)),
    );
  });

  // OGNI CAMPO DEL CONTRATTO, non solo quello nominato dall'audit: la forma
  // sbagliata si dichiara, `null` significa «non osservato». La coppia dice
  // entrambe le cose sullo stesso campo, che è il punto.
  const CAMPI: readonly [string, unknown][] = [
    ["allowedModules", ["442"]],
    ["moduleModifier", { "442": 1.5 }],
    ["moduleModifierTarget", "avversario"],
    ["maxSubstitutions", 3],
    ["sameRoleOnly", true],
    ["moduleChangeViaSubstitution", false],
    ["officeReserveAllowed", false],
    ["bonusMalusTariff", { Gf: 3, Amm: -0.5 }],
    ["goalConcededMalusPerGoal", -1],
    ["goalConcededMalusRoles", ["P"]],
    ["noVoteBonusMalusBase", 6],
    ["noVoteBookedPreset", -0.5],
    ["noVoteSentOffDuringMatch", -1],
    ["homeFieldBonus", 2],
    ["neutralGroundFromMatchday", 20],
    ["firstGoalThreshold", 66],
    ["goalBandWidth", 6],
    ["sameBandExtraGoalMinGap", 4],
    ["bothBelowThresholdGoalMinGap", 4],
    ["lineupDeadlineMinutesBeforeKickoff", 0],
    ["missingLineupFallsBackToPrevious", true],
    ["defenceMinDefendersWithVote", 4],
    ["defenceBands", [{ minAverage: 6, bonus: 1 }]],
    ["midfieldFictitiousVote", 6],
    ["midfieldMaxDelta", 3.5],
    ["midfieldTable", [{ difference: 2, delta: 1 }]],
    ["attackSufficientVote", 6],
    ["attackMaxBonus", 3],
    ["attackMaxFromVote", 8],
    ["attackExcludesAnyBonus", true],
    ["attackTable", [{ vote: 7, bonus: 2 }]],
    ["pointsWin", 3],
    ["pointsDraw", 1],
    ["pointsLoss", 0],
    ["perCompetition", [{ competitionId: "c-camp", settings: { maxSubstitutions: 5 } }]],
  ];

  for (const [campo, buono] of CAMPI) {
    it(`${campo}: osservato si legge, «null» è non osservato, storto è illeggibile`, () => {
      expect(impostazioniLette(conImpostazione(campo, buono))).toHaveProperty(campo);

      const nonOsservato = impostazioniLette(conImpostazione(campo, null));
      expect(campo in nonOsservato).toBe(false);

      // Una forma che il contratto non dichiara per QUESTO campo. Un booleano non
      // è mai una lista, un numero, una mappa né una stringa d'enumerazione.
      const storto = typeof buono === "boolean" ? [1, 2] : "no";
      const stato = statoDaDeposito(conImpostazione(campo, storto));
      expect(stato.kind).toBe("sconosciuto");
      if (stato.kind === "sconosciuto") expect(stato.detail).toContain(campo);
    });
  }

  it("un modulo che §9 non conosce non entra nel modificatore modulo", () => {
    expect(statoDaDeposito(conImpostazione("moduleModifier", { "4231": 1 })).kind).toBe(
      "sconosciuto",
    );
  });

  it("in una mappa di numeri, i VALORI sono numeri sempre: è la parte che fa i conti", () => {
    for (const campo of ["moduleModifier", "bonusMalusTariff"] as const) {
      const chiave = campo === "moduleModifier" ? "442" : "Gf";
      const stato = statoDaDeposito(conImpostazione(campo, { [chiave]: "tre" }));
      expect(stato.kind, campo).toBe("sconosciuto");
    }
  });

  it("un evento della tariffa che il core pubblico non conosce viaggia, e non fa danno", () => {
    // L'elenco canonico degli eventi vive in un pacchetto che l'invariante di
    // isolamento della Fase 2 vieta di importare da `src/`, e riscriverlo a mano
    // qui rifiuterebbe domani un evento aggiunto là. La riconciliazione legge
    // solo gli eventi che conosce, quindi una chiave in più non sposta un conto.
    const impostazioni = impostazioniLette(conImpostazione("bonusMalusTariff", { Zzz: 1 }));
    expect(impostazioni.bonusMalusTariff).toEqual({ Zzz: 1 });
  });

  it("un blocco per competizione storto si dichiara, e nomina la competizione", () => {
    const stato = statoDaDeposito(
      conImpostazione("perCompetition", [
        { competitionId: "c-coppa", settings: { allowedModules: "442" } },
      ]),
    );
    expect(stato.kind).toBe("sconosciuto");
    if (stato.kind === "sconosciuto") {
      expect(stato.detail).toContain("perCompetition.c-coppa.allowedModules");
    }
  });

  it("un blocco per competizione senza il suo `settings` non diventa un blocco vuoto", () => {
    const stato = statoDaDeposito(conImpostazione("perCompetition", [{ competitionId: "c1" }]));
    expect(stato.kind).toBe("sconosciuto");
  });

  it("tutti i punti storti si dicono insieme, non uno per volta", () => {
    const payload = copia();
    impostazioniDi(payload)["allowedModules"] = "442";
    impostazioniDi(payload)["maxSubstitutions"] = "tre";
    const stato = statoDaDeposito(payload);
    if (stato.kind !== "sconosciuto") throw new Error("atteso sconosciuto");
    expect(stato.detail).toContain("allowedModules");
    expect(stato.detail).toContain("maxSubstitutions");
  });

  it("impostazioni osservate per intero arrivano intatte, e sono coerenti col contratto", () => {
    const payload = copia();
    const tutte: Record<string, unknown> = {};
    for (const [campo, buono] of CAMPI) tutte[campo] = buono;
    payload["settings"] = tutte;
    const impostazioni = impostazioniLette(payload);
    for (const [campo, buono] of CAMPI) {
      expect(impostazioni[campo as keyof ObservedLeagueSettings], campo).toEqual(buono);
    }
    // La forma passa anche il validatore del contratto: la lettura non produce
    // impostazioni che il pacchetto che le usa considererebbe malformate.
    expect(validateObservedLeagueSettings(impostazioni)).toEqual([]);
  });

  it("il MERITO non è forma: un tetto assurdo si legge e lo giudica il regolamento", () => {
    // Perdere la pagina intera perché la lega dichiara -3 sostituzioni sarebbe
    // una cura peggiore del male: il numero è un numero, e a dire che non torna è
    // `validateObservedLeagueSettings` col regolamento in mano.
    const impostazioni = impostazioniLette(conImpostazione("maxSubstitutions", -3));
    expect(impostazioni.maxSubstitutions).toBe(-3);
    expect(validateObservedLeagueSettings(impostazioni).join(" ")).toContain("maxSubstitutions");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   LA GARANZIA: nessun deposito può lasciare la pagina vuota
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Tutti i percorsi delle foglie del deposito di esempio, radice esclusa: è
 * l'elenco dei punti in cui il layer privato può scrivere qualcosa di storto.
 */
function percorsi(valore: unknown, prefisso: readonly string[] = []): string[][] {
  const qui = prefisso.length === 0 ? [] : [[...prefisso]];
  if (Array.isArray(valore)) {
    return [...qui, ...valore.flatMap((voce, i) => percorsi(voce, [...prefisso, String(i)]))];
  }
  if (typeof valore === "object" && valore !== null) {
    return [
      ...qui,
      ...Object.entries(valore).flatMap(([chiave, voce]) => percorsi(voce, [...prefisso, chiave])),
    ];
  }
  return qui;
}

function conMutazione(percorso: readonly string[], valore: unknown, togli: boolean): unknown {
  const payload = copia();
  let dentro: Record<string, unknown> = payload;
  for (const passo of percorso.slice(0, -1)) {
    dentro = dentro[passo] as Record<string, unknown>;
  }
  const ultimo = percorso[percorso.length - 1] as string;
  if (togli) delete dentro[ultimo];
  else dentro[ultimo] = valore;
  return payload;
}

/**
 * Ciò che la pagina ha da dipingere, dato uno stato. Non serve un browser: se
 * qui non lancia niente e resta qualcosa da mostrare, il disegno non può
 * svuotare il contenitore e poi morire — che è il modo in cui si arriva a una
 * pagina bianca da cui il ricaricamento non fa uscire.
 */
function qualcosaDaDipingere(stato: LineupChannelState): boolean {
  const vista = buildFormazioneView(stato, new Map([["c-camp", NO_LINEUP_CONSTRAINTS]]));
  costruisciLettura(stato, "2026-09-04T18:00:00.000Z");
  for (const competizione of vista.competitions) {
    saveBlockers(competizione);
    if (stato.kind === "letto" && competizione.lineup !== null && competizione.matchday !== null) {
      prepareSubmission({
        matchday: competizione.matchday,
        competitionId: competizione.competitionId,
        lineup: competizione.lineup,
        roster: stato.roster,
        settings: stato.settings,
        constraints: competizione.constraints,
      });
    }
  }
  return vista.known
    ? vista.competitions.length > 0
    : vista.notice !== null && vista.notice.title.length > 0 && vista.notice.detail.length > 0;
}

describe("qualunque cosa arrivi dal deposito, la pagina non resta mai vuota", () => {
  const FORME: readonly [string, unknown][] = [
    ["null", null],
    ["stringa", "442"],
    ["stringa vuota", ""],
    ["oggetto vuoto", {}],
    ["numero", 7],
    ["booleano", true],
    ["lista vuota", []],
    ["lista di numeri", [1, 2]],
    ["lista di null", [null]],
    ["lista di oggetti vuoti", [{}]],
    ["oggetto annidato", { a: { b: [1] } }],
  ];

  it("nessuna forma, in nessun punto del deposito, fa lanciare la lettura o il disegno", () => {
    const tutti = percorsi(ESEMPIO);
    // La prova vale quanto la sua copertura: se il deposito di esempio si
    // restringe, questo numero cade e la prova lo dice.
    expect(tutti.length).toBeGreaterThan(80);
    let provati = 0;
    for (const percorso of tutti) {
      for (const [nome, valore] of [...FORME, ["campo tolto", undefined] as const]) {
        const togli = nome === "campo tolto";
        const dove = `${percorso.join(".")} = ${nome}`;
        let stato: LineupChannelState;
        try {
          stato = statoDaDeposito(conMutazione(percorso, valore, togli));
        } catch (errore) {
          throw new Error(`la lettura ha lanciato su ${dove}: ${String(errore)}`);
        }
        try {
          expect(qualcosaDaDipingere(stato), dove).toBe(true);
        } catch (errore) {
          throw new Error(`schermo vuoto su ${dove}: ${String(errore)}`);
        }
        provati += 1;
      }
    }
    expect(provati).toBeGreaterThan(900);
  });

  it("e non lo fa nemmeno il deposito intero sostituito da una forma qualunque", () => {
    for (const [nome, valore] of FORME) {
      const stato = statoDaDeposito(valore);
      expect(stato.kind, nome).toBe("sconosciuto");
      expect(qualcosaDaDipingere(stato), nome).toBe(true);
    }
  });

  it("i moduli letti sono moduli veri: nessuna lista che il contratto non ammette", () => {
    for (const percorso of percorsi(ESEMPIO)) {
      for (const [, valore] of FORME) {
        const stato = statoDaDeposito(conMutazione(percorso, valore, false));
        if (stato.kind !== "letto") continue;
        for (const modulo of stato.settings.allowedModules ?? []) {
          expect(MODULES).toContain(modulo);
        }
      }
    }
  });
});
