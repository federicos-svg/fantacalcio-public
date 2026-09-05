// DA CIÒ CHE È STATO LETTO ALLA RIGA CHE LO DICHIARA.
//
// Sta in un modulo suo, e non dentro la shell, per una ragione sola: è la parte
// che deve essere **provata**. La regola che questa schermata deve rispettare
// più di ogni altra — un dato vecchio non si presenta come fresco, un dato
// assente non si presenta come vuoto — vive qui dentro come una funzione pura,
// dove una prova può interrogarla senza browser e senza rete. Se vivesse dentro
// `render()` sarebbe verificabile solo guardandola.
//
// L'OROLOGIO È UN ARGOMENTO, mai una lettura. `costruisciLettura` riceve
// l'istante e non lo cerca: la stessa lettura, allo stesso istante, produce
// sempre la stessa riga, e una prova può far passare tre settimane in una riga
// di codice.

import {
  AVVERSARIO_NON_DISPONIBILE,
  lineupFreshness,
  NOMI_DEI_PEZZI,
  opponentForMatchday,
  type LineupChannelState,
  type LineupObservation,
  type ObservedCompetitionLineup,
  type ObservedParts,
} from "../packages/league-channel-contract/src/index.js";
import type {
  FormazioneLettura,
  FormazioneParteLetta,
  FormazioneSfida,
} from "./ui/formazione.js";

/**
 * L'ORDINE DEI PEZZI NON È ALFABETICO: è quello dell'importanza per chi schiera.
 * La formazione per prima, perché è il dato di cui la pagina parla; poi la
 * propria rosa, poi le regole, poi ciò che serve a sapere contro chi si gioca.
 *
 * È un ordine di LETTURA e nient'altro. Il pezzo che decide titolo, colore e
 * allarme della fascia non è «il primo di questo elenco»: è la formazione, e
 * `costruisciLettura` la prende per nome. Riordinare questa lista cambia in
 * quale ordine i pezzi si elencano, e non può cambiare che cosa la fascia
 * dichiara — è la differenza fra un'estetica e un significato, e prima erano
 * la stessa cosa.
 */
export const ORDINE_DEI_PEZZI: readonly (keyof ObservedParts)[] = [
  "lineup",
  "roster",
  "settings",
  "leagueTeams",
  "calendar",
];

function etichettaCompetizione(osservata: ObservedCompetitionLineup): string {
  const nome = osservata.competition.name;
  if (nome !== undefined && nome.length > 0) return nome;
  if (osservata.competition.kind === "campionato") return "Campionato";
  if (osservata.competition.kind === "coppa") return "Coppa";
  return "Competizione senza nome dichiarato";
}

function parte(
  nome: string,
  osservazione: LineupObservation | null,
  adesso: string,
  soglia: number | undefined,
): FormazioneParteLetta {
  return {
    nome,
    freschezza:
      osservazione === null ? null : lineupFreshness(osservazione, adesso, soglia),
  };
}

/**
 * Le sfide di questa giornata, una per competizione osservata.
 *
 * Una competizione la cui giornata non è nota non produce una sfida indovinata:
 * produce una riga che dice che la giornata non è nota. Schierare per la partita
 * sbagliata costa quanto non schierare, e in più non si vede.
 */
function sfide(state: Extract<LineupChannelState, { kind: "letto" }>): readonly FormazioneSfida[] {
  return state.competitions.map((osservata) => {
    const competizione = etichettaCompetizione(osservata);
    const giornata = osservata.matchday;
    if (giornata === null) {
      return {
        competizione,
        giornata: null,
        avversario: "",
        campo: null,
        rosaAvversarioLetta: false,
        motivoAssenza:
          "la giornata di questa competizione non è stata osservata, quindi non si sa con chi si gioca.",
      };
    }
    const esito = opponentForMatchday(
      state.calendar,
      osservata.competition.competitionId,
      giornata,
      state.leagueTeams,
    );
    if (!esito.trovato) {
      return {
        competizione,
        giornata,
        avversario: "",
        campo: null,
        rosaAvversarioLetta: false,
        motivoAssenza: AVVERSARIO_NON_DISPONIBILE[esito.cause],
      };
    }
    const avversario = esito.opponent;
    return {
      competizione,
      giornata,
      // Senza nome osservato resta l'id: è meno leggibile e vero, mentre un nome
      // costruito qui sarebbe leggibile e inventato.
      avversario: avversario.name ?? avversario.teamId,
      campo: avversario.venue,
      rosaAvversarioLetta: avversario.roster !== null,
      motivoAssenza: "",
    };
  });
}

/**
 * La fascia della lettura, dato lo stato del canale e l'istante in cui si guarda.
 *
 * `null` quando non c'è niente da datare — con l'avviso di canale al posto della
 * squadra non esiste nessuna formazione a schermo, e una fascia che dicesse
 * «letta mai» sopra il nulla aggiungerebbe rumore a un messaggio già chiaro.
 */
export function costruisciLettura(
  state: LineupChannelState,
  adesso: string,
  soglia?: number,
  /**
   * L'ordine in cui i pezzi si elencano. È un argomento, e non una costante
   * chiusa qui dentro, perché così una prova può permutarlo e pretendere che la
   * fascia dichiari **la stessa cosa**: senza poterlo permutare, «il pezzo si
   * prende per nome e non per posizione» resterebbe una frase in un commento.
   */
  ordine: readonly (keyof ObservedParts)[] = ORDINE_DEI_PEZZI,
): FormazioneLettura | null {
  if (state.kind !== "letto") return null;
  return {
    // PER NOME, non per posizione. `observations.lineup` è obbligatorio nel
    // contratto, quindi questa età esiste sempre e il tipo lo dichiara: è ciò
    // che toglie al disegno il ripiego che si era inventato.
    formazione: {
      nome: NOMI_DEI_PEZZI.lineup,
      freschezza: lineupFreshness(state.observations.lineup, adesso, soglia),
    },
    altre: ordine
      .filter((chiave) => chiave !== "lineup")
      .map((chiave) => parte(NOMI_DEI_PEZZI[chiave], state.observations[chiave], adesso, soglia)),
    seriesMatchday: state.observations.lineup.seriesMatchday,
    sfide: sfide(state),
  };
}
