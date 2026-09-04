// LA PORTA DI LETTURA, COLLEGATA — a un indirizzo dello stesso sito, e a nulla
// di più.
//
// QUI NON C'È NESSUN HOST, NESSUNA CREDENZIALE, NESSUNA PIATTAFORMA NOMINATA, ed
// è la stessa regola di confine che governa `/api/listone` e `/api/schede`
// (`docs/PUBLIC_PRIVATE_BOUNDARY.md`): il core pubblico conosce un **percorso
// relativo**, e chi sta dietro quel percorso — il layer privato — ha le
// credenziali, parla con la lega e non compare mai qui. Un percorso relativo non
// è un endpoint: non dice dove sia niente, e senza il sito che lo serve non
// porta da nessuna parte.
//
// PERCHÉ LA PORTA È SINCRONA E LA LETTURA NO. `LineupChannelPort.readState()`
// risponde subito, perché la pagina si ridisegna molte volte e non può attendere
// la rete a ogni riquadro. La lettura invece è una richiesta, e arriva quando
// arriva. Le due cose si tengono insieme nell'unico modo onesto: la richiesta si
// fa **una volta**, il suo esito si conserva, e la porta restituisce **quell'
// esito**. Finché non è arrivato, la porta risponde `risposta_assente` — che è
// la verità in quel momento, non un segnaposto.
//
// TUTTO CIÒ CHE ARRIVA È SOSPETTO FINCHÉ NON È STATO GUARDATO. `statoDaDeposito`
// non si fida di niente: un JSON che non è un oggetto, una rosa che non è una
// lista, una formazione senza portiere, una lettura senza il suo momento sono
// tutti `risposta_illeggibile`, mai un oggetto mezzo costruito. La regola è
// quella di tutta questa schermata: **una lettura che non si è potuta leggere si
// dichiara, non si arrotonda**.
//
// E LA GIORNATA SI CONTROLLA, sempre, con la doppia guardia nelle due scale che
// `../packages/league-channel-contract/src/lineupObservation.ts` descrive per
// esteso. Una formazione della giornata scorsa mostrata come quella di oggi è il
// peggior esito possibile di questa pagina: qui non passa.

import {
  connectLineupChannel,
} from "./formazioneChannel.js";
import {
  matchdayCoherence,
  type ChannelUnknownCause,
  type CompetitionLineupState,
  type LineupChannelState,
  type LineupFlags,
  type LineupObservation,
  type Module,
  type ObservedCalendar,
  type ObservedCompetitionFixtures,
  type ObservedCompetitionKind,
  type ObservedCompetitionLineup,
  type ObservedFixture,
  type ObservedLeagueSettings,
  type ObservedLeagueTeam,
  type ObservedLeagueTeams,
  type ObservedLineup,
  type ObservedParts,
  type ObservedPlayer,
  type ObservedTeam,
  type Role,
} from "../packages/league-channel-contract/src/index.js";

/**
 * L'indirizzo, relativo, servito dal layer privato dietro lo stesso controllo di
 * accesso di ogni altra pagina del sito. Nessun host: se il sito non lo serve,
 * questo percorso non porta da nessuna parte.
 */
export const FORMAZIONE_ENDPOINT = "/api/formazione";

/**
 * LA TARGA DEL DEPOSITO, e perché entra nel confronto invece di essere dedotta.
 *
 * Chi scrive il deposito e chi lo legge sono due programmi diversi, in due
 * repository diversi, aggiornati in momenti diversi. Senza una targa, un
 * deposito scritto con una forma vecchia verrebbe letto come se fosse della
 * forma nuova, e i campi mancanti diventerebbero silenziosamente `undefined` —
 * cioè «non osservato», cioè una bugia. Con la targa è un rifiuto dichiarato.
 */
export const FORMAZIONE_DEPOSITO_FORMATO = "LEAGUE-CHANNEL-OBSERVATION@1";

/**
 * Una formazione che non arriva in 5 secondi non vale una pagina bianca: la
 * richiesta si abbandona e la pagina dichiara che la lega non ha risposto. È la
 * stessa scelta già presa per il listone, con un secondo in più perché qui non
 * esiste una copia locale su cui ripiegare.
 */
export const FORMAZIONE_TIMEOUT_MS = 5000;

const MODULI: readonly string[] = ["541", "451", "532", "442", "352", "433", "343"];
const RUOLI: readonly string[] = ["P", "D", "C", "A"];
const GENERI: readonly string[] = ["campionato", "coppa", "sconosciuto"];

function ignoto(cause: ChannelUnknownCause, detail: string): LineupChannelState {
  return { kind: "sconosciuto", cause, detail };
}

function oggetto(valore: unknown): Record<string, unknown> | null {
  return typeof valore === "object" && valore !== null && !Array.isArray(valore)
    ? (valore as Record<string, unknown>)
    : null;
}

function testo(valore: unknown): string | undefined {
  return typeof valore === "string" && valore.length > 0 ? valore : undefined;
}

function numero(valore: unknown): number | undefined {
  return typeof valore === "number" && Number.isFinite(valore) ? valore : undefined;
}

function listaDiTesti(valore: unknown): readonly string[] | null {
  if (!Array.isArray(valore)) return null;
  const fuori: string[] = [];
  for (const voce of valore) {
    if (typeof voce !== "string" || voce.length === 0) return null;
    fuori.push(voce);
  }
  return fuori;
}

function giocatore(valore: unknown): ObservedPlayer | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const id = testo(grezzo["id"]);
  const ruolo = testo(grezzo["role"]);
  if (id === undefined || ruolo === undefined || !RUOLI.includes(ruolo)) return null;
  const nome = testo(grezzo["name"]);
  const squadraReale = testo(grezzo["realTeamId"]);
  const disponibilita = testo(grezzo["availability"]);
  return {
    id,
    role: ruolo as Role,
    ...(nome === undefined ? {} : { name: nome }),
    ...(squadraReale === undefined ? {} : { realTeamId: squadraReale }),
    ...(disponibilita === "disponibile" || disponibilita === "indisponibile" || disponibilita === "in_dubbio"
      ? { availability: disponibilita }
      : {}),
  } as ObservedPlayer;
}

function rosa(valore: unknown): ObservedTeam | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const teamId = testo(grezzo["teamId"]);
  if (teamId === undefined) return null;
  const elenco = grezzo["players"];
  if (!Array.isArray(elenco)) return null;
  const giocatori: ObservedPlayer[] = [];
  for (const voce of elenco) {
    const letto = giocatore(voce);
    if (letto === null) return null;
    giocatori.push(letto);
  }
  return { teamId, players: giocatori };
}

function bandiere(valore: unknown): LineupFlags {
  const grezzo = oggetto(valore);
  // Le due bandiere sono booleane nel contratto: un valore non osservato non può
  // restare `undefined`, e `false` è il ripiego CONSERVATIVO — «non nascosta» e
  // «non vale per tutte» sono ciò che la piattaforma fa se nessuno chiede altro.
  return {
    hidden: grezzo !== null && grezzo["hidden"] === true,
    allCompetitions: grezzo !== null && grezzo["allCompetitions"] === true,
  };
}

function formazione(valore: unknown, competitionId: string): ObservedLineup | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const modulo = testo(grezzo["module"]);
  const portiere = testo(grezzo["goalkeeperId"]);
  const titolari = listaDiTesti(grezzo["starterIds"]);
  const panchina = listaDiTesti(grezzo["benchIds"]);
  if (modulo === undefined || !MODULI.includes(modulo)) return null;
  if (portiere === undefined || titolari === null || panchina === null) return null;
  // La competizione della formazione è la competizione del blocco che la porta:
  // una formazione che ne dichiarasse un'altra è un dato incoerente, non un dato
  // da riassegnare d'ufficio.
  const dichiarata = testo(grezzo["competitionId"]);
  if (dichiarata !== undefined && dichiarata !== competitionId) return null;
  return {
    competitionId,
    module: modulo as Module,
    goalkeeperId: portiere,
    starterIds: titolari,
    benchIds: panchina,
    flags: bandiere(grezzo["flags"]),
  };
}

/** Il motivo, in parole, per cui una competizione non mostra la sua formazione. */
function motivoGiornata(
  esito: Extract<ReturnType<typeof matchdayCoherence>, { coerente: false }>,
): string {
  const n = esito.numbers;
  const numeri =
    `giornata di Serie A della lega ${n.leagueSeriesMatchday ?? "non dichiarata"}, ` +
    `prima giornata della competizione ${n.competitionStartDay ?? "non dichiarata"}, ` +
    `giornata di Serie A sulla formazione ${n.lineupSeriesMatchday ?? "non dichiarata"}, ` +
    `giornata di competizione sulla formazione ${n.lineupCompetitionMatchday ?? "non dichiarata"}`;
  if (esito.cause === "giornata_non_dichiarata") {
    return (
      "La lettura non dice a quale giornata appartiene questa formazione, quindi non si può stabilire " +
      `se sia quella di adesso: non viene mostrata (${numeri}).`
    );
  }
  const attesa =
    esito.expectedCompetitionMatchday === null ? "non calcolabile" : String(esito.expectedCompetitionMatchday);
  return (
    "La formazione letta appartiene a un'altra giornata e non viene mostrata al posto di quella di " +
    `adesso (attesa per questa competizione: ${attesa}; ${numeri}).`
  );
}

interface CompetizioneLetta {
  readonly osservata: ObservedCompetitionLineup;
  /** `null` quando la giornata è coerente. */
  readonly rifiuto: ChannelUnknownCause | null;
}

function competizione(valore: unknown, leagueSeriesMatchday: number | undefined): CompetizioneLetta | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const competitionId = testo(grezzo["competitionId"]);
  if (competitionId === undefined) return null;
  const genere = testo(grezzo["kind"]);
  if (genere === undefined || !GENERI.includes(genere)) return null;
  const nome = testo(grezzo["name"]);

  const competition = {
    competitionId,
    ...(nome === undefined ? {} : { name: nome }),
    kind: genere as ObservedCompetitionKind,
  };

  // LA GUARDIA DIFENDE UNA FORMAZIONE MOSTRATA, quindi si applica quando una
  // formazione c'è. Una competizione che dichiara PERCHÉ non ha una formazione —
  // la coppa che non è ancora cominciata è il caso reale — non ha niente da
  // datare: pretendere da lei i quattro numeri la farebbe cadere su una guardia
  // che non la riguarda, e la pagina direbbe «giornata sbagliata» dove la verità
  // è «non c'è ancora nessuna partita».
  const motivo = testo(grezzo["unavailableReason"]);
  if (motivo !== undefined) {
    return {
      osservata: { competition, matchday: null, state: { kind: "non_disponibile", reason: motivo } },
      rifiuto: null,
    };
  }

  const grezzaFormazione = grezzo["lineup"];
  if (grezzaFormazione === null || grezzaFormazione === undefined) {
    // La lega non ha (ancora) una formazione per questa partita: è una lettura
    // riuscita che dice «non hai schierato», e non va confusa con un guasto.
    // Anche qui non c'è niente da datare; la giornata, se dichiarata, serve
    // soltanto a sapere contro chi si gioca.
    const numeri = matchdayCoherence({
      leagueSeriesMatchday,
      competitionStartDay: numero(grezzo["startDay"]),
      lineupSeriesMatchday: numero(grezzo["lineupSeriesMatchday"]),
      lineupCompetitionMatchday: numero(grezzo["lineupCompetitionMatchday"]),
    });
    return {
      osservata: {
        competition,
        matchday: numeri.coerente ? numeri.competitionMatchday : null,
        state: { kind: "letta", lineup: null },
      },
      rifiuto: null,
    };
  }

  const esito = matchdayCoherence({
    leagueSeriesMatchday,
    competitionStartDay: numero(grezzo["startDay"]),
    lineupSeriesMatchday: numero(grezzo["lineupSeriesMatchday"]),
    lineupCompetitionMatchday: numero(grezzo["lineupCompetitionMatchday"]),
  });

  if (!esito.coerente) {
    // LA GIORNATA NON TORNA: la formazione NON si mostra, e il motivo è quello
    // dichiarato dai numeri, non un generico «non disponibile».
    const stato: CompetitionLineupState = { kind: "non_disponibile", reason: motivoGiornata(esito) };
    return {
      osservata: { competition, matchday: null, state: stato },
      rifiuto:
        esito.cause === "giornata_non_dichiarata"
          ? "giornata_non_dichiarata"
          : "giornata_non_corrispondente",
    };
  }

  const letta = formazione(grezzaFormazione, competitionId);
  if (letta === null) return null;
  return {
    osservata: {
      competition,
      matchday: esito.competitionMatchday,
      state: { kind: "letta", lineup: letta },
    },
    rifiuto: null,
  };
}

function squadraDiLega(valore: unknown): ObservedLeagueTeam | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const teamId = testo(grezzo["teamId"]);
  if (teamId === undefined) return null;
  const nome = testo(grezzo["name"]);
  const grezzaRosa = grezzo["roster"];
  // `null`/assente = rosa NON letta. Non si ripiega su una rosa vuota: direbbe
  // «quella squadra non ha giocatori», che è falso e verrebbe creduto.
  const letta = grezzaRosa === null || grezzaRosa === undefined ? null : rosa(grezzaRosa);
  if (grezzaRosa !== null && grezzaRosa !== undefined && letta === null) return null;
  return { teamId, ...(nome === undefined ? {} : { name: nome }), roster: letta };
}

function squadreDiLega(valore: unknown): ObservedLeagueTeams | null | "illeggibile" {
  if (valore === null || valore === undefined) return null;
  const grezzo = oggetto(valore);
  if (grezzo === null) return "illeggibile";
  const elenco = grezzo["teams"];
  if (!Array.isArray(elenco)) return "illeggibile";
  const squadre: ObservedLeagueTeam[] = [];
  for (const voce of elenco) {
    const letta = squadraDiLega(voce);
    if (letta === null) return "illeggibile";
    squadre.push(letta);
  }
  return { teams: squadre };
}

function sfida(valore: unknown): ObservedFixture | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const campo = testo(grezzo["venue"]);
  const fase = testo(grezzo["cupPhase"]);
  const gara = testo(grezzo["leg"]);
  return {
    ...(testo(grezzo["competitionId"]) === undefined
      ? {}
      : { competitionId: testo(grezzo["competitionId"]) }),
    ...(numero(grezzo["matchday"]) === undefined ? {} : { matchday: numero(grezzo["matchday"]) }),
    ...(testo(grezzo["opponentTeamId"]) === undefined
      ? {}
      : { opponentTeamId: testo(grezzo["opponentTeamId"]) }),
    ...(campo === "casa" || campo === "trasferta" ? { venue: campo } : {}),
    ...(fase === "girone" || fase === "eliminazione" || fase === "finale" ? { cupPhase: fase } : {}),
    ...(gara === "andata" || gara === "ritorno" ? { leg: gara } : {}),
    ...(testo(grezzo["kickoffAt"]) === undefined ? {} : { kickoffAt: testo(grezzo["kickoffAt"]) }),
    ...(testo(grezzo["deadlineAt"]) === undefined ? {} : { deadlineAt: testo(grezzo["deadlineAt"]) }),
  };
}

function calendario(valore: unknown): ObservedCalendar | null | "illeggibile" {
  if (valore === null || valore === undefined) return null;
  const grezzo = oggetto(valore);
  if (grezzo === null) return "illeggibile";
  const teamId = testo(grezzo["teamId"]);
  const elenco = grezzo["competitions"];
  if (teamId === undefined || !Array.isArray(elenco)) return "illeggibile";
  const blocchi: ObservedCompetitionFixtures[] = [];
  for (const voce of elenco) {
    const blocco = oggetto(voce);
    if (blocco === null) return "illeggibile";
    const competizioneGrezza = oggetto(blocco["competition"]);
    const sfideGrezze = blocco["fixtures"];
    if (competizioneGrezza === null || !Array.isArray(sfideGrezze)) return "illeggibile";
    const competitionId = testo(competizioneGrezza["competitionId"]);
    const genere = testo(competizioneGrezza["kind"]);
    if (competitionId === undefined || genere === undefined || !GENERI.includes(genere)) {
      return "illeggibile";
    }
    const nome = testo(competizioneGrezza["name"]);
    const sfide: ObservedFixture[] = [];
    for (const voceSfida of sfideGrezze) {
      const letta = sfida(voceSfida);
      if (letta === null) return "illeggibile";
      sfide.push(letta);
    }
    blocchi.push({
      competition: {
        competitionId,
        ...(nome === undefined ? {} : { name: nome }),
        kind: genere as ObservedCompetitionKind,
      },
      fixtures: sfide,
    });
  }
  return { teamId, competitions: blocchi };
}

function osservazione(valore: unknown): LineupObservation | null {
  const grezzo = oggetto(valore);
  if (grezzo === null) return null;
  const readAt = testo(grezzo["readAt"]);
  const seriesMatchday = numero(grezzo["seriesMatchday"]);
  if (readAt === undefined || seriesMatchday === undefined) return null;
  // Una data che non si riesce a leggere è una data che non c'è: se la si
  // lasciasse passare, `lineupFreshness` risponderebbe «età ignota» per sempre e
  // la pagina non saprebbe mai dire se sta guardando una cosa vecchia.
  if (!Number.isFinite(Date.parse(readAt))) return null;
  return { readAt, seriesMatchday };
}

/**
 * DAL PAYLOAD DEL DEPOSITO ALLO STATO DEL CANALE, senza mai inventare un campo.
 *
 * Funzione pura: nessuna rete, nessun orologio. La freschezza si valuta altrove,
 * al momento del disegno, perché dipende da **quando si guarda** e non da com'è
 * fatto il dato.
 *
 * Quando **tutte** le competizioni cadono sulla guardia della giornata non resta
 * niente di mostrabile: allora è l'intero stato a diventare ignoto, con la causa
 * che lo spiega, invece di una pagina di riquadri vuoti che il lettore deve
 * interpretare uno per uno.
 */
export function statoDaDeposito(payload: unknown): LineupChannelState {
  const grezzo = oggetto(payload);
  if (grezzo === null) {
    return ignoto("risposta_illeggibile", "il deposito non è un oggetto");
  }
  if (grezzo["format"] !== FORMAZIONE_DEPOSITO_FORMATO) {
    return ignoto(
      "risposta_illeggibile",
      `il deposito non porta la targa ${FORMAZIONE_DEPOSITO_FORMATO}`,
    );
  }

  const momenti = oggetto(grezzo["observations"]);
  if (momenti === null) {
    return ignoto("risposta_illeggibile", "il deposito non dice quando è stato letto");
  }
  const osservata = osservazione(momenti["lineup"]);
  const momentoRosa = osservazione(momenti["roster"]);
  const momentoImpostazioni = osservazione(momenti["settings"]);
  if (osservata === null || momentoRosa === null || momentoImpostazioni === null) {
    return ignoto(
      "risposta_illeggibile",
      "il deposito non dice quando sono stati letti tutti i suoi pezzi",
    );
  }
  // I due pezzi che possono legittimamente mancare: `null` è «non osservato», e
  // un momento illeggibile NON diventa `null` — sarebbe «non letto» al posto di
  // «letto e non databile», che è un'altra cosa.
  const momentoSquadre =
    momenti["leagueTeams"] === null || momenti["leagueTeams"] === undefined
      ? null
      : osservazione(momenti["leagueTeams"]);
  const momentoCalendario =
    momenti["calendar"] === null || momenti["calendar"] === undefined
      ? null
      : osservazione(momenti["calendar"]);
  if (
    (momenti["leagueTeams"] !== null && momenti["leagueTeams"] !== undefined && momentoSquadre === null) ||
    (momenti["calendar"] !== null && momenti["calendar"] !== undefined && momentoCalendario === null)
  ) {
    return ignoto("risposta_illeggibile", "un momento di lettura del deposito non è databile");
  }
  const osservazioni: ObservedParts = {
    lineup: osservata,
    roster: momentoRosa,
    settings: momentoImpostazioni,
    leagueTeams: momentoSquadre,
    calendar: momentoCalendario,
  };

  const squadra = rosa(grezzo["roster"]);
  if (squadra === null) {
    return ignoto("risposta_illeggibile", "la rosa letta non è leggibile");
  }

  const impostazioni = oggetto(grezzo["settings"]);
  if (impostazioni === null) {
    return ignoto("risposta_illeggibile", "le impostazioni di lega non sono leggibili");
  }

  const elenco = grezzo["competitions"];
  if (!Array.isArray(elenco) || elenco.length === 0) {
    return ignoto("risposta_illeggibile", "il deposito non porta nessuna competizione");
  }

  const competizioni: ObservedCompetitionLineup[] = [];
  const rifiuti: ChannelUnknownCause[] = [];
  for (const voce of elenco) {
    const letta = competizione(voce, osservata.seriesMatchday);
    if (letta === null) {
      return ignoto("risposta_illeggibile", "una competizione del deposito non è leggibile");
    }
    competizioni.push(letta.osservata);
    if (letta.rifiuto !== null) rifiuti.push(letta.rifiuto);
  }

  if (rifiuti.length === competizioni.length) {
    // Nessuna competizione è mostrabile: lo dice la pagina intera, una volta.
    const causa = rifiuti.includes("giornata_non_corrispondente")
      ? "giornata_non_corrispondente"
      : "giornata_non_dichiarata";
    return ignoto(
      causa,
      `giornata di Serie A dichiarata dalla lettura: ${osservata.seriesMatchday}`,
    );
  }

  const squadre = squadreDiLega(grezzo["leagueTeams"]);
  if (squadre === "illeggibile") {
    return ignoto("risposta_illeggibile", "l'elenco delle squadre della lega non è leggibile");
  }
  const calendarioLetto = calendario(grezzo["calendar"]);
  if (calendarioLetto === "illeggibile") {
    return ignoto("risposta_illeggibile", "il calendario della lega non è leggibile");
  }
  // Un pezzo presente senza il suo momento, o un momento senza il suo pezzo, è
  // un deposito incoerente: non si sceglie quale dei due credere.
  if ((squadre === null) !== (osservazioni.leagueTeams === null)) {
    return ignoto("risposta_illeggibile", "le squadre della lega e il loro momento non concordano");
  }
  if ((calendarioLetto === null) !== (osservazioni.calendar === null)) {
    return ignoto("risposta_illeggibile", "il calendario e il suo momento non concordano");
  }

  return {
    kind: "letto",
    observations: osservazioni,
    roster: squadra,
    settings: impostazioni as ObservedLeagueSettings,
    competitions: competizioni,
    leagueTeams: squadre,
    calendar: calendarioLetto,
  };
}

/** Ciò che serve per chiedere il deposito, iniettato per poterlo provare. */
export interface LetturaCanaleOpzioni {
  readonly fetchImpl: typeof fetch;
  readonly endpoint?: string;
  readonly timeoutMs?: number;
}

/**
 * Chiede il deposito **una volta** e traduce ogni esito in uno stato dichiarato.
 *
 * Nessun `throw` esce da qui: una rete caduta, un timeout, un codice di guasto
 * del layer privato sono tutti stati del canale, e la pagina li mostra al posto
 * della squadra invece di rompersi.
 */
export async function leggiCanaleDaDeposito(
  opzioni: LetturaCanaleOpzioni,
): Promise<LineupChannelState> {
  const endpoint = opzioni.endpoint ?? FORMAZIONE_ENDPOINT;
  const timeoutMs = opzioni.timeoutMs ?? FORMAZIONE_TIMEOUT_MS;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const scadenza =
    controller === null ? null : setTimeout(() => controller.abort(), timeoutMs);
  try {
    const risposta = await opzioni.fetchImpl(endpoint, {
      ...(controller === null ? {} : { signal: controller.signal }),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!risposta.ok) {
      // I codici del layer privato sono fissi e non portano dettagli della
      // piattaforma: riportarli aiuta chi legge il runbook e non dice niente a
      // nessun altro.
      return ignoto("risposta_assente", `la lettura della lega non è disponibile (${risposta.status})`);
    }
    const testoRisposta = await risposta.text();
    let payload: unknown;
    try {
      payload = JSON.parse(testoRisposta);
    } catch {
      return ignoto("risposta_illeggibile", "la risposta non è JSON");
    }
    return statoDaDeposito(payload);
  } catch (errore) {
    return ignoto(
      "risposta_assente",
      errore instanceof Error && errore.name === "AbortError"
        ? `la lettura della lega non è arrivata entro ${Math.round(timeoutMs / 1000)} secondi`
        : "",
    );
  } finally {
    if (scadenza !== null) clearTimeout(scadenza);
  }
}

/**
 * IL GANCIO D'AVVIO: collega la porta, chiede il deposito, e quando arriva
 * chiama `alCambio` perché la pagina si ridisegni con ciò che è arrivato.
 *
 * La porta viene collegata **subito**, prima che la richiesta parta: da quel
 * momento la pagina non dice più «canale non collegato» — quel messaggio
 * descrive una build senza layer privato, e qui il layer c'è — ma «la lega non
 * ha ancora risposto», che è ciò che sta davvero succedendo in quel secondo.
 */
export function avviaCanaleDaDeposito(
  opzioni: LetturaCanaleOpzioni & { readonly alCambio: () => void },
): Promise<void> {
  let ultimo: LineupChannelState = ignoto(
    "risposta_assente",
    "la lettura della lega non è ancora arrivata",
  );
  connectLineupChannel({ readState: () => ultimo });
  return leggiCanaleDaDeposito(opzioni).then((stato) => {
    ultimo = stato;
    opzioni.alCambio();
  });
}
