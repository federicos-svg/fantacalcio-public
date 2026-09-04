import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { costruisciLettura } from "./formazioneLettura.js";
import { statoDaDeposito } from "./formazioneCanaleRemoto.js";
import { provaChannelState } from "./formazioneProva.js";

// LA RIGA CHE DICHIARA QUANDO OGNI PEZZO È STATO LETTO.
//
// Queste prove esistono perché la regola che difendono è invisibile a occhio:
// una pagina che mostra una formazione vecchia sembra identica a una che ne
// mostra una fresca. L'orologio è un argomento, quindi qui si possono far
// passare tre settimane in una riga.

const ESEMPIO = JSON.parse(
  readFileSync(new URL("../fixtures/league-channel-observation.example.json", import.meta.url), "utf8"),
) as unknown;

const STATO = statoDaDeposito(ESEMPIO);

// La fixture legge la formazione alle 17:40 e le rose alle 06:00 dello stesso
// giorno: sono i due estremi che servono a far vedere due età diverse.
const POCO_DOPO = "2026-09-04T18:00:00.000Z";
const TRE_SETTIMANE_DOPO = "2026-09-25T18:00:00.000Z";

describe("ogni pezzo dichiara la propria età, e nessuna si eredita", () => {
  it("c'è una riga per pezzo, sempre tutte", () => {
    const lettura = costruisciLettura(STATO, POCO_DOPO);
    expect(lettura).not.toBeNull();
    expect(lettura?.parti).toHaveLength(5);
    // La formazione è la prima: è il dato di cui la pagina parla, ed è la riga
    // che decide il titolo della fascia.
    expect(lettura?.parti[0]?.nome).toBe("formazione");
  });

  it("formazione fresca e rose vecchie convivono, ognuna con la sua verità", () => {
    const lettura = costruisciLettura(STATO, POCO_DOPO);
    // 20 minuti: dentro la soglia.
    expect(lettura?.parti[0]?.freschezza?.kind).toBe("attuale");
    // 12 ore: fuori. È lo stesso deposito, letto nello stesso istante.
    expect(lettura?.parti[1]?.freschezza?.kind).toBe("non_attuale");
  });

  it("una rosa avversaria di tre settimane fa NON si presenta come attuale", () => {
    const lettura = costruisciLettura(STATO, TRE_SETTIMANE_DOPO);
    for (const parte of lettura?.parti ?? []) {
      expect(parte.freschezza?.kind, parte.nome).toBe("non_attuale");
    }
  });

  it("un pezzo non letto è «non letto», non «vecchio quanto gli altri»", () => {
    if (STATO.kind !== "letto") throw new Error("atteso letto");
    const senzaCalendario = {
      ...STATO,
      calendar: null,
      observations: { ...STATO.observations, calendar: null, leagueTeams: null },
      leagueTeams: null,
    };
    const lettura = costruisciLettura(senzaCalendario, POCO_DOPO);
    const calendario = lettura?.parti.find((parte) => parte.nome === "calendario");
    expect(calendario?.freschezza).toBeNull();
  });

  it("senza formazione a schermo non c'è niente da datare", () => {
    const lettura = costruisciLettura(
      { kind: "sconosciuto", cause: "risposta_assente", detail: "" },
      POCO_DOPO,
    );
    expect(lettura).toBeNull();
  });
});

describe("con chi si gioca", () => {
  it("l'avversario esce dal calendario, col campo, e dichiara che la sua rosa non è letta", () => {
    const lettura = costruisciLettura(STATO, POCO_DOPO);
    const campionato = lettura?.sfide[0];
    expect(campionato?.avversario).toBe("Squadra avversaria");
    expect(campionato?.campo).toBe("casa");
    expect(campionato?.giornata).toBe(1);
    // ELENCATA MA NON LETTA: la pagina non deve poter dire «rosa vuota».
    expect(campionato?.rosaAvversarioLetta).toBe(false);
    expect(campionato?.motivoAssenza).toBe("");
  });

  it("la coppa non ancora cominciata non produce un avversario indovinato", () => {
    const lettura = costruisciLettura(STATO, POCO_DOPO);
    const coppa = lettura?.sfide[1];
    expect(coppa?.avversario).toBe("");
    expect(coppa?.motivoAssenza.length).toBeGreaterThan(0);
  });

  it("senza calendario non si indovina nessun avversario", () => {
    if (STATO.kind !== "letto") throw new Error("atteso letto");
    const lettura = costruisciLettura(
      { ...STATO, calendar: null, observations: { ...STATO.observations, calendar: null } },
      POCO_DOPO,
    );
    expect(lettura?.sfide[0]?.avversario).toBe("");
    expect(lettura?.sfide[0]?.motivoAssenza).toContain("calendario");
  });
});

describe("la squadra di esempio si data come tutto il resto di sé", () => {
  it("la prova porta una data fissa e inventata, e non si presenta come attuale", () => {
    const lettura = costruisciLettura(provaChannelState(), POCO_DOPO);
    expect(lettura?.parti[0]?.freschezza?.kind).toBe("non_attuale");
  });

  it("la prova ha un avversario, e la sua rosa è dichiarata non letta", () => {
    const lettura = costruisciLettura(provaChannelState(), POCO_DOPO);
    expect(lettura?.sfide[0]?.avversario).toBe("Avversario di esempio");
    expect(lettura?.sfide[0]?.rosaAvversarioLetta).toBe(false);
  });
});
