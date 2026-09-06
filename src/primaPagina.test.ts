import { describe, it, expect, afterEach } from "vitest";
import { decidiPrimaPagina } from "./primaPagina.js";
import { connectLineupChannel } from "./formazioneChannel.js";
import type {
  LineupChannelState,
  ObservedTeam,
} from "../packages/league-channel-contract/src/index.js";

// LA PRIMA PAGINA DEL SITO, PROVATA SENZA BROWSER.
//
// Il difetto che queste prove sorvegliano non era una regola sbagliata: era un
// ORDINE sbagliato. La prima pagina veniva decisa **prima** che la porta della
// lega fosse collegata, quindi su uno stato che diceva «qui il canale non c'è»
// anche se il canale c'era e la richiesta stava per partire: il sito apriva
// sull'Asta. Poi, a pagina già a video, la risposta arrivava e la regola veniva
// riapplicata: la schermata cambiava da sola sotto gli occhi di chi la stava
// guardando.
//
// Qui si prova l'ordine, e si provano tutti gli esiti che l'ordine rende
// raggiungibili: la porta si collega, e SOLO DOPO si guarda che cosa risponde.

const MOMENTO = { readAt: "2026-09-05T09:00:00.000Z", seriesMatchday: 3 } as const;

function letto(roster: ObservedTeam): LineupChannelState {
  return {
    kind: "letto",
    observations: {
      lineup: MOMENTO,
      roster: MOMENTO,
      settings: MOMENTO,
      leagueTeams: null,
      calendar: null,
    },
    leagueTeams: null,
    calendar: null,
    roster,
    settings: {},
    competitions: [],
  };
}

const ROSA_PIENA: ObservedTeam = { teamId: "t1", players: [{ id: "p1", role: "P" }] };
const ROSA_VUOTA: ObservedTeam = { teamId: "t1", players: [] };

afterEach(() => {
  connectLineupChannel(null);
});

describe("la prima pagina si decide dopo aver collegato il canale", () => {
  it("con la porta appena collegata e la risposta per aria, apre sulla FORMAZIONE", () => {
    // Il caso di ogni apertura del prodotto. Se qualcuno rimettesse la
    // decisione prima del collegamento, lo stato letto qui sarebbe
    // `porta_non_collegata` e la schermata tornerebbe «asta»: sono le due
    // asserzioni che questa prova tiene insieme apposta.
    const esito = decidiPrimaPagina(() => {
      connectLineupChannel({
        readState: () => ({ kind: "sconosciuto", cause: "lettura_in_corso", detail: "" }),
      });
    });
    expect(esito.stato.kind).toBe("sconosciuto");
    if (esito.stato.kind === "sconosciuto") expect(esito.stato.cause).toBe("lettura_in_corso");
    expect(esito.schermata).toBe("formazione");
  });

  it("la regola della rosa vuota resta viva: se lo stato è già noto, apre sull'ASTA", () => {
    // Una porta che risponde subito — il caso in cui la prima pagina PUÒ essere
    // decisa su un dato vero. Prima dell'asta e a stagione finita non c'è
    // niente da schierare, e il sito apre dove si può fare qualcosa.
    const esito = decidiPrimaPagina(() => {
      connectLineupChannel({ readState: () => letto(ROSA_VUOTA) });
    });
    expect(esito.schermata).toBe("asta");
  });

  it("e con una rosa già letta e piena apre sulla Formazione", () => {
    const esito = decidiPrimaPagina(() => {
      connectLineupChannel({ readState: () => letto(ROSA_PIENA) });
    });
    expect(esito.schermata).toBe("formazione");
  });

  it("una build che non collega nessuna porta apre sull'Asta, come prima", () => {
    // `porta_non_collegata` non è «non so»: è «qui il canale non c'è». Aprire
    // sulla Formazione toglierebbe l'Asta a chi la usa per mostrarle una pagina
    // che può soltanto dichiarare la propria assenza.
    const esito = decidiPrimaPagina(() => undefined);
    expect(esito.schermata).toBe("asta");
  });

  it("la lettura avviene DOPO il gancio, non prima: è l'ordine, non una coincidenza", () => {
    // Prova diretta dell'ordine: la porta risponde una cosa diversa a seconda
    // di quando la si interroga, e ciò che finisce nella decisione è la
    // risposta di DOPO.
    let collegato = false;
    const esito = decidiPrimaPagina(() => {
      connectLineupChannel({ readState: () => letto(collegato ? ROSA_VUOTA : ROSA_PIENA) });
      collegato = true;
    });
    expect(esito.schermata).toBe("asta");
  });
});
