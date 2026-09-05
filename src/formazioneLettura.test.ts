import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { costruisciLettura, ORDINE_DEI_PEZZI } from "./formazioneLettura.js";
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
    // Cinque pezzi: la formazione, che sta in un campo suo, più gli altri
    // quattro. La formazione non è «il primo dell'elenco»: è nominata.
    expect(lettura?.formazione.nome).toBe("formazione");
    expect(lettura?.altre).toHaveLength(4);
    expect(lettura?.altre.map((parte) => parte.nome)).not.toContain("formazione");
  });

  /* ── L'IDENTITÀ NON È LA POSIZIONE ─────────────────────────────────────────
   *
   * La fascia prende titolo, colore e allarme dall'età della FORMAZIONE. Finché
   * quel pezzo veniva preso come «il primo dell'elenco», il significato della
   * schermata era appeso all'ordine di una lista che vive in un altro file e
   * che nessun compilatore protegge: riordinarla — un gesto che sembra
   * estetico — avrebbe fatto dichiarare alla fascia l'età di un altro pezzo,
   * con le parole della formazione.
   */
  it("riordinare l'elenco dei pezzi non cambia che cosa dichiara la fascia", () => {
    const dritto = costruisciLettura(STATO, POCO_DOPO);
    const alContrario = costruisciLettura(STATO, POCO_DOPO, undefined, [
      ...ORDINE_DEI_PEZZI,
    ].reverse());

    // Il pezzo della fascia è lo stesso, e la sua età è la stessa: qui la
    // formazione è dentro la soglia mentre la rosa — che in questo ordine
    // sarebbe la prima — è già fuori. Se la fascia si prendesse per posizione,
    // questo confronto cadrebbe.
    expect(alContrario?.formazione).toEqual(dritto?.formazione);
    expect(alContrario?.formazione.freschezza.kind).toBe("attuale");
    expect(alContrario?.altre[0]?.freschezza?.kind).toBe("non_attuale");

    // E l'elenco è lo stesso insieme di pezzi, soltanto in un altro ordine:
    // riordinare cambia l'estetica, e nient'altro.
    expect(alContrario?.altre.map((parte) => parte.nome)).toEqual(
      [...(dritto?.altre ?? [])].reverse().map((parte) => parte.nome),
    );
  });

  it("formazione fresca e rose vecchie convivono, ognuna con la sua verità", () => {
    const lettura = costruisciLettura(STATO, POCO_DOPO);
    // 20 minuti: dentro la soglia.
    expect(lettura?.formazione.freschezza.kind).toBe("attuale");
    // 12 ore: fuori. È lo stesso deposito, letto nello stesso istante.
    expect(lettura?.altre[0]?.freschezza?.kind).toBe("non_attuale");
  });

  it("una rosa avversaria di tre settimane fa NON si presenta come attuale", () => {
    const lettura = costruisciLettura(STATO, TRE_SETTIMANE_DOPO);
    expect(lettura?.formazione.freschezza.kind).toBe("non_attuale");
    for (const parte of lettura?.altre ?? []) {
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
    const calendario = lettura?.altre.find((parte) => parte.nome === "calendario");
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
    expect(lettura?.formazione.freschezza.kind).toBe("non_attuale");
  });

  it("la prova ha un avversario, e la sua rosa è dichiarata non letta", () => {
    const lettura = costruisciLettura(provaChannelState(), POCO_DOPO);
    expect(lettura?.sfide[0]?.avversario).toBe("Avversario di esempio");
    expect(lettura?.sfide[0]?.rosaAvversarioLetta).toBe(false);
  });
});
