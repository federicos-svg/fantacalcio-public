import { describe, expect, it } from "vitest";

import { absentInSource, notObserved, observed } from "../src/field.js";
import {
  absenceIsMeaningful,
  classifySnapshot,
  matchPageSnapshot,
  readDuel,
  readMatchPage,
  readTeamLineup,
  rosterCompleteness,
} from "../src/matchPage.js";
import { isRead } from "../src/readOutcome.js";
import {
  syntheticEleven,
  syntheticLineup,
  syntheticMatchPage,
  syntheticPlayer,
  syntheticRoster,
} from "./synthetic.js";

describe("la pagina di una partita si legge per intero, o non si legge", () => {
  it("legge le due formazioni, il modulo, l'allenatore e l'arbitro", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    expect(outcome.value.home.team).toBe("Alfa");
    expect(outcome.value.away.team).toBe("Beta");
    expect(outcome.value.home.module).toEqual(observed("4-3-3"));
    expect(outcome.value.referee).toEqual(observed("Arbitro Sintetico"));
    expect(outcome.value.home.starters.presence).toBe("observed");
  });

  it("il minuto della sostituzione resta assente, e non diventa zero", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    const substitutions = outcome.value.home.substitutions;
    if (substitutions.presence !== "observed") throw new Error("attese sostituzioni osservate");
    const first = substitutions.value[0];
    expect(first).toBeDefined();
    // È il fatto misurato il 2026-09-04: la pagina partita non espone i minuti.
    expect(first?.minute).toEqual(absentInSource());
  });

  it("le sezioni non lette restano «non osservate», che non è «la fonte non le ha»", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.home.unavailable).toEqual(notObserved());
  });

  it("una formazione che non dichiara la propria natura ferma la lettura", () => {
    const lineup = syntheticLineup("Alfa", "actual");
    delete lineup["nature"];
    const outcome = readMatchPage(syntheticMatchPage({ home: lineup }));
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["matchPage", "home", "nature"]);
  });

  it("una squadra contro sé stessa è fuori contratto", () => {
    const outcome = readMatchPage(syntheticMatchPage({ away: syntheticLineup("Alfa", "actual") }));
    expect(outcome.status).toBe("out-of-contract");
  });

  it("un modulo che non ha la forma di un modulo non entra", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      module: { presence: "observed", value: "offensivo" },
    });
    expect(readTeamLineup(lineup, ["l"]).status).toBe("out-of-contract");
  });

  it("un titolare senza nome ferma l'elenco al punto giusto, invece di saltarlo", () => {
    const starters = [
      syntheticPlayer("Alfa 1", 1),
      { shirtNumber: { presence: "not-observed" }, role: { presence: "not-observed" } },
    ];
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: syntheticRoster(starters) },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["l", "starters", "value", "players", "1", "displayName"]);
  });

  it("undici titolari non sono un obbligo: si legge quel che la fonte espone", () => {
    // Una fonte che ne pubblica dieci ha pubblicato dieci. Completarli a undici
    // sarebbe inventare un giocatore, e inventarlo proprio dove conta.
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: syntheticRoster([syntheticPlayer("Alfa 1", 1)]) },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    expect(outcome.value.starters.presence === "observed" ? outcome.value.starters.value.players.length : -1).toBe(
      1,
    );
  });
});

describe("ogni lista dichiara quanto è completa", () => {
  it("legge la dichiarazione dell'undici, della panchina e della formazione intera", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(rosterCompleteness(outcome.value.home.starters)).toBe("declared-complete");
    expect(rosterCompleteness(outcome.value.home.bench)).toBe("unknown");
    expect(outcome.value.home.completeness).toBe("unknown");
  });

  it("l'assenza di un nome conta solo da una lista dichiarata completa", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    // L'undici è dichiarato completo: chi non c'è, davvero non c'era.
    expect(absenceIsMeaningful(outcome.value.home.starters)).toBe(true);
    // La panchina no: chi non c'è potrebbe esserci e non essere stato scritto.
    // Contarlo come «previsto fuori» farebbe apparire brava una fonte che ha
    // solo taciuto.
    expect(absenceIsMeaningful(outcome.value.home.bench)).toBe(false);
  });

  it("una lista che non c'è non dichiara niente, e non è una lista vuota", () => {
    const lineup = syntheticLineup("Alfa", "probable", { bench: { presence: "absent-in-source" } });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.bench).toEqual(absentInSource());
    expect(rosterCompleteness(outcome.value.bench)).toBe("unknown");
    expect(absenceIsMeaningful(outcome.value.bench)).toBe(false);
  });

  it("una sezione esposta e vuota resta un'affermazione diversa da una sezione assente", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      suspended: { presence: "observed", value: syntheticRoster([], "declared-complete") },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    // «Nessuno squalificato», dichiarato dalla fonte, è un dato utile; la stessa
    // squadra con la sezione assente non dice niente, e le due non si toccano.
    expect(outcome.value.suspended.presence).toBe("observed");
    expect(absenceIsMeaningful(outcome.value.suspended)).toBe(true);
  });

  it("una lista senza dichiarazione di completezza si ferma: non diventa «non so»", () => {
    // Una pagina che non lo dice produce `unknown` per mano di chi l'ha letta;
    // un candidato che non lo scrive è un difetto, e va visto.
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: { players: [syntheticPlayer("Alfa 1", 1)] } },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["l", "starters", "value", "completeness"]);
  });

  it("nemmeno la formazione intera ha un valore per difetto", () => {
    const lineup = syntheticLineup("Alfa", "probable");
    delete lineup["completeness"];
    const outcome = readTeamLineup(lineup, ["l"]);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["l", "completeness"]);
  });

  it("undici nomi non dichiarano una lista completa", () => {
    // Nessuna funzione di questo pacchetto guarda la lunghezza dell'elenco per
    // decidere: undici nomi con dichiarazione «non so» restano «non so».
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: syntheticRoster(syntheticEleven("Alfa")) },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(rosterCompleteness(outcome.value.starters)).toBe("unknown");
    expect(absenceIsMeaningful(outcome.value.starters)).toBe(false);
  });

  it("una dichiarazione fuori dai tre valori non entra", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: syntheticRoster(syntheticEleven("Alfa"), "quasi tutta") },
    });
    expect(readTeamLineup(lineup, ["l"]).status).toBe("shape-not-recognised");
  });

  it("una lista dichiarata parziale non è una lista completa", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      starters: { presence: "observed", value: syntheticRoster(syntheticEleven("Alfa"), "declared-partial") },
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(rosterCompleteness(outcome.value.starters)).toBe("declared-partial");
    expect(absenceIsMeaningful(outcome.value.starters)).toBe(false);
  });
});

describe("il ballottaggio non lo risolviamo noi", () => {
  it("legge i nomi in lizza e il favorito indicato dalla fonte", () => {
    const outcome = readDuel(
      { contenders: ["Alfa 9", "Alfa 10"], favourite: { presence: "observed", value: "Alfa 9" } },
      ["d"],
    );
    expect(outcome.status).toBe("read");
  });

  it("senza favorito indicato, il campo resta assente e nessuno ne sceglie uno", () => {
    const outcome = readDuel({ contenders: ["Alfa 9", "Alfa 10"], favourite: { presence: "absent-in-source" } }, ["d"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.favourite).toEqual(absentInSource());
  });

  it("un favorito che non è fra i nomi in lizza è fuori contratto", () => {
    const outcome = readDuel(
      { contenders: ["Alfa 9", "Alfa 10"], favourite: { presence: "observed", value: "Alfa 7" } },
      ["d"],
    );
    expect(outcome.status).toBe("out-of-contract");
  });

  it("un ballottaggio con un nome solo non è un ballottaggio", () => {
    expect(readDuel({ contenders: ["Alfa 9"], favourite: { presence: "not-observed" } }, ["d"]).status).toBe(
      "out-of-contract",
    );
  });
});

describe("da che parte del fischio d'inizio sta un'istantanea", () => {
  it("prima del calcio d'inizio", () => {
    expect(classifySnapshot("2026-09-04T18:00:00+02:00", observed("2026-09-04T20:45:00+02:00"))).toBe(
      "before-kick-off",
    );
  });

  it("dopo il calcio d'inizio", () => {
    expect(classifySnapshot("2026-09-04T22:40:00+02:00", observed("2026-09-04T20:45:00+02:00"))).toBe(
      "after-kick-off",
    );
  });

  it("senza calcio d'inizio osservato non si sa, e non si tira a indovinare", () => {
    expect(classifySnapshot("2026-09-04T18:00:00+02:00", absentInSource())).toBe("undetermined");
    expect(classifySnapshot("2026-09-04T18:00:00+02:00", notObserved())).toBe("undetermined");
  });

  it("l'istante esattamente uguale al fischio d'inizio non è una previsione", () => {
    expect(classifySnapshot("2026-09-04T20:45:00+02:00", observed("2026-09-04T20:45:00+02:00"))).toBe(
      "undetermined",
    );
  });

  it("i fusi diversi si confrontano davvero, non come stringhe", () => {
    // Le 19:00 in tempo universale sono le 21:00 a Roma: l'istantanea è DOPO il
    // fischio d'inizio delle 20:45, e chi confrontasse i due testi direbbe
    // «prima» — cioè scambierebbe una verifica per una previsione.
    expect(classifySnapshot("2026-09-04T19:00:00Z", observed("2026-09-04T20:45:00+02:00"))).toBe(
      "after-kick-off",
    );
  });

  it("una pagina intera sa collocare la propria istantanea", () => {
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(matchPageSnapshot(outcome.value)).toBe("before-kick-off");
  });

  it("natura dichiarata e momento dell'istantanea restano indipendenti", () => {
    // Le formazioni ufficiali escono un'ora prima del fischio: «effettiva» e
    // «prima del calcio d'inizio» convivono, e nessuna delle due si deduce
    // dall'altra.
    const outcome = readMatchPage(syntheticMatchPage());
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.home.nature).toBe("actual");
    expect(matchPageSnapshot(outcome.value)).toBe("before-kick-off");
  });
});

// GLI STATI DI UN GIOCATORE, E LA NOTA DEL BALLOTTAGGIO.
//
// Ogni segnale si prova sulle sue due facce, perché il contratto vive nella
// differenza fra loro: **la fonte il dato ce l'ha**, e allora arriva a valle
// come lei lo ha scritto; **la fonte il dato non ce l'ha**, e allora arriva
// un'assenza dichiarata — mai un elenco vuoto, mai uno zero, mai un favorito
// scelto da noi.

function statiOsservati(
  conditions: readonly Record<string, unknown>[],
  completeness = "unknown",
): Record<string, unknown> {
  return { presence: "observed", value: { conditions, completeness } };
}

describe("gli stati di un giocatore non sono posti in una formazione", () => {
  it("la fonte li ha: i tre stati arrivano a valle come li ha scritti", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      conditions: statiOsservati(
        [
          { player: "Alfa 3", kind: "injured" },
          { player: "Alfa 5", kind: "suspended" },
          { player: "Alfa 7", kind: "warned" },
        ],
        "declared-complete",
      ),
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    const conditions = outcome.value.conditions;
    if (conditions.presence !== "observed") throw new Error("attesi stati osservati");
    expect(conditions.value.conditions).toEqual([
      { player: "Alfa 3", kind: "injured" },
      { player: "Alfa 5", kind: "suspended" },
      { player: "Alfa 7", kind: "warned" },
    ]);
  });

  it("IL DIFFIDATO GIOCA: non è uno squalificato, e non finisce fra chi non può giocare", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      conditions: statiOsservati([{ player: "Alfa 7", kind: "warned" }]),
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    const conditions = outcome.value.conditions;
    if (conditions.presence !== "observed") throw new Error("attesi stati osservati");
    expect(conditions.value.conditions[0]?.kind).toBe("warned");
    // E la lista degli squalificati resta quello che era — la sezione della
    // pagina, qui non guardata: nessuno dei due dati si è travasato nell'altro.
    expect(outcome.value.suspended).toEqual(notObserved());
  });

  it("la fonte non li ha: il campo lo dichiara, e non diventa un elenco vuoto", () => {
    // Il candidato è quello di sempre — scritto prima che gli stati esistessero
    // — e resta leggibile: «non guardato», l'unica cosa vera che si possa dire
    // di un lettore che non li cerca.
    const primaDegliStati = readTeamLineup(syntheticLineup("Alfa", "probable"), ["l"]);
    if (!isRead(primaDegliStati)) throw new Error("atteso letto");
    expect(primaDegliStati.value.conditions).toEqual(notObserved());
    expect(primaDegliStati.value.conditions).not.toEqual(absentInSource());

    // Chi invece la sezione l'ha guardata e non l'ha trovata dice un'altra
    // cosa, e le due non collassano.
    const guardataENonTrovata = readTeamLineup(
      syntheticLineup("Alfa", "probable", { conditions: { presence: "absent-in-source" } }),
      ["l"],
    );
    if (!isRead(guardataENonTrovata)) throw new Error("atteso letto");
    expect(guardataENonTrovata.value.conditions).toEqual(absentInSource());
  });

  it("uno stato che non è uno dei tre non si arrotonda al più vicino", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      conditions: statiOsservati([{ player: "Alfa 3", kind: "acciaccato" }]),
    });
    const outcome = readTeamLineup(lineup, ["l"]);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["l", "conditions", "value", "conditions", "0", "kind"]);
  });

  it("uno stato senza il nome del giocatore ferma l'elenco invece di saltarlo", () => {
    const lineup = syntheticLineup("Alfa", "probable", {
      conditions: statiOsservati([{ kind: "injured" }]),
    });
    expect(readTeamLineup(lineup, ["l"]).status).toBe("shape-not-recognised");
  });

  it("l'elenco degli stati dichiara quanto è completo, e senza dichiarazione non dice che gli altri stanno bene", () => {
    const senzaDichiarazione = readTeamLineup(
      syntheticLineup("Alfa", "probable", {
        conditions: statiOsservati([{ player: "Alfa 3", kind: "injured" }]),
      }),
      ["l"],
    );
    if (!isRead(senzaDichiarazione)) throw new Error("atteso letto");
    expect(rosterCompleteness(senzaDichiarazione.value.conditions)).toBe("unknown");
    expect(absenceIsMeaningful(senzaDichiarazione.value.conditions)).toBe(false);

    const dichiarataCompleta = readTeamLineup(
      syntheticLineup("Alfa", "probable", {
        conditions: statiOsservati([{ player: "Alfa 3", kind: "injured" }], "declared-complete"),
      }),
      ["l"],
    );
    if (!isRead(dichiarataCompleta)) throw new Error("atteso letto");
    expect(absenceIsMeaningful(dichiarataCompleta.value.conditions)).toBe(true);
  });
});

describe("la nota di un ballottaggio si porta, non si interpreta", () => {
  it("la fonte la scrive: arriva a valle come l'ha scritta", () => {
    const outcome = readDuel(
      {
        contenders: ["Alfa 9", "Alfa 10"],
        favourite: { presence: "absent-in-source" },
        note: { presence: "observed", value: "ballottaggio aperto" },
      },
      ["d"],
    );
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.note).toEqual(observed("ballottaggio aperto"));
  });

  it("la fonte non la scrive: nessuna nota inventata, e il ballottaggio resta leggibile", () => {
    const senzaChiave = readDuel(
      { contenders: ["Alfa 9", "Alfa 10"], favourite: { presence: "absent-in-source" } },
      ["d"],
    );
    if (!isRead(senzaChiave)) throw new Error("atteso letto");
    expect(senzaChiave.value.note).toEqual(notObserved());

    const guardataENonTrovata = readDuel(
      {
        contenders: ["Alfa 9", "Alfa 10"],
        favourite: { presence: "absent-in-source" },
        note: { presence: "absent-in-source" },
      },
      ["d"],
    );
    if (!isRead(guardataENonTrovata)) throw new Error("atteso letto");
    expect(guardataENonTrovata.value.note).toEqual(absentInSource());
  });

  it("una nota lunga come una frase non è una nota: è prosa, e non entra", () => {
    const outcome = readDuel(
      {
        contenders: ["Alfa 9", "Alfa 10"],
        favourite: { presence: "absent-in-source" },
        note: { presence: "observed", value: "a".repeat(121) },
      },
      ["d"],
    );
    expect(outcome.status).toBe("out-of-contract");
  });

  it("LA NOTA NON SCEGLIE IL FAVORITO, nemmeno quando sembra indicarlo", () => {
    // È la regola del ballottaggio non risolto, difesa anche dalla porta di
    // servizio: se bastasse leggere la nota per nominare un favorito, il
    // contratto sceglierebbe al posto della fonte.
    const outcome = readDuel(
      {
        contenders: ["Alfa 9", "Alfa 10"],
        favourite: { presence: "absent-in-source" },
        note: { presence: "observed", value: "Alfa 9 in vantaggio" },
      },
      ["d"],
    );
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(outcome.value.favourite).toEqual(absentInSource());
  });
});
