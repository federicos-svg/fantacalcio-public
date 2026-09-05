// LA MODALITÀ DIMOSTRATIVA DELLA PAGINA FORMAZIONE — provare i comandi su una
// squadra di esempio, senza che nessuno possa scambiarla per la propria.
//
// PERCHÉ ESISTE. Nel core pubblico il canale della lega non è collegato, e la
// pagina Formazione lo dichiara al posto della squadra: è onesta e non si può
// usare. Chi la apre non ha modo di sapere che cosa faranno i comandi il giorno
// in cui la porta ci sarà. Questa modalità serve a quello e a nient'altro: una
// rosa finta, la stessa schermata, gli stessi comandi, la stessa validazione.
//
// IL VINCOLO CHE VIENE PRIMA DI TUTTI, e a cui tutto il resto di questo file è
// subordinato: NESSUNO DEVE POTER CREDERE CHE LA FORMAZIONE MOSTRATA SIA LA
// PROPRIA. Non è una raccomandazione di stile, è la ragione per cui la pagina
// preferisce un avviso a una griglia vuota. Qui si difende in quattro modi che
// non dipendono l'uno dall'altro:
//
//  1. NON SI ACCENDE DA SOLA. Serve un comando esplicito; chi non lo tocca vede
//     esattamente quello che vedeva prima;
//  2. IL MARCHIO STA NEL DATO, non solo nella cornice. Ogni identificativo di
//     questa rosa comincia con `ESEMPIO-`, quindi ogni riga a schermo — e ogni
//     messaggio di rifiuto, di conflitto e di legalità, che l'identificativo lo
//     citano — porta la parola addosso. Ritagliare la pagina non la toglie;
//  3. IL MARCHIO NON SI CHIUDE. La cornice che lo dice sta nel corpo della
//     pagina e non si può congedare: finché la modalità è accesa, è a schermo;
//  4. I DATI VERI VINCONO SEMPRE. `modalitaProvaAttiva` è una porta chiusa a
//     chiave: quando il canale ha LETTO davvero una squadra, la modalità è
//     spenta — anche se qualcuno l'aveva lasciata accesa in una visita
//     precedente, anche se l'archivio locale dice il contrario. Non c'è nessuno
//     stato rappresentabile in cui la squadra vera e quella di esempio stiano
//     sullo stesso schermo.
//
// NIENTE RETE E NIENTE NOMI VERI, come in tutta la corsia. Non si collega
// nessuna porta: `connectLineupChannel` e le sue sorelle restano scollegate, e
// questa modalità non passa di lì. Se ci passasse, la finzione diventerebbe
// indistinguibile da una lettura, che è precisamente ciò che non deve poter
// succedere. La rosa è integralmente sintetica — identificativi inventati qui,
// nessun nome di giocatore, nessuna squadra reale, nessun identificativo di
// piattaforma — come vuole la regola delle fixture del core pubblico.
//
// I VINCOLI DELLA PROVA NON SI PERSISTONO, ed è la seconda metà della stessa
// regola: le spunte messe su una squadra finta non devono finire nell'archivio
// delle spunte vere, e quelle vere non devono comparire sulla squadra finta.
// Vivono in memoria, in una mappa loro, e `destinazioneVincoli` dice a voce
// alta dove finisce ogni spunta. L'unica cosa che si scrive nell'archivio
// locale è se la prova è accesa, e sotto una chiave sua.

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";
import type {
  ConstraintIssue,
  ConstraintReportLike,
  ConstraintWarningCode,
  LineupChannelState,
  LineupConstraints,
  ObservedLeagueSettings,
  ObservedLineup,
  ObservedTeam,
  SubmissionUiState,
} from "../packages/league-channel-contract/src/index.js";

/* ────────────────────────────────────────────────────────────────────────────
   IL MARCHIO — le parole che restano a schermo finché la prova è accesa
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Il prefisso di ogni identificativo della rosa di esempio.
 *
 * È il marchio che non si può ritagliare: la pagina stampa gli identificativi
 * su ogni riga e li cita dentro ogni motivo di rifiuto, quindi la parola
 * compare ovunque la formazione compaia, non solo dove qualcuno si è ricordato
 * di metterla.
 */
export const PROVA_PREFISSO_ID = "ESEMPIO-";

/** Il comando che accende la prova. Non c'è nessun'altra strada per accenderla. */
export const PROVA_TESTO_COMANDO = "Prova i comandi con una squadra di esempio";

/** Il comando che la spegne. */
export const PROVA_TESTO_USCITA = "Esci dalla prova";

/** L'intestazione della cornice che marca la pagina. Non si può chiudere. */
export const PROVA_TITOLO = "SQUADRA DI ESEMPIO — NON È LA TUA";

/** Il corpo della cornice: che cosa si sta guardando, detto senza scorciatoie. */
export const PROVA_SPIEGAZIONE =
  "Questa non è la tua squadra e questa non è la tua formazione: è una rosa inventata, " +
  "servita per provare i comandi. Ogni giocatore qui sotto ha un nome che comincia con " +
  "«ESEMPIO-» perché non ci sia modo di confonderlo con uno vero. Il canale della lega " +
  "resta scollegato: da questa pagina non parte niente verso nessuna lega, nemmeno premendo Salva.";

/** La riga che accompagna il comando di accensione, nello stato «non collegato». */
export const PROVA_INVITO =
  "Finché la lega non è collegata puoi provare i comandi su una squadra di esempio: " +
  "gli stessi spostamenti, gli stessi moduli, le stesse spunte e la stessa validazione " +
  "che troverai sulla tua, su dati inventati e dichiarati tali.";

/** L'etichetta dell'esito di un Salva in prova. Non dice mai «inviato». */
export const PROVA_ETICHETTA_SALVATAGGIO = "PROVA — NULLA È PARTITO, NESSUNA LEGA È STATA TOCCATA";

/**
 * LA RAGIONE DELL'ESITO DI UN SALVA IN PROVA, parola per parola.
 *
 * Sta qui e non dentro la shell perché è la sola cosa che, a schermo,
 * distingue «la porta non è stata chiamata» da «la porta è stata chiamata e non
 * era collegata»: quest'ultima produrrebbe lo stesso stato `da_inviare` e la
 * stessa etichetta, con una ragione diversa. Un test può pretenderla alla
 * lettera solo se la ragione ha un nome.
 */
export const PROVA_SALVATAGGIO_MOTIVO =
  "la formazione di esempio ha passato la validazione, e non è stata mandata a nessuno: " +
  "questa è una prova, e il canale della lega resta scollegato.";

/** Che cosa è successo davvero premendo Salva in prova. */
export const PROVA_ESITO_SALVATAGGIO =
  "Non è stato inviato niente: questa è una prova, la lega non è collegata e nessuna " +
  "formazione è stata comunicata a nessuno. Qui sotto c'è l'esito del controllo, che è " +
  "lo stesso che girerà sulla tua squadra il giorno in cui la lega sarà collegata.";

/** La riga in più quando l'archivio locale non ha tenuto l'accensione. */
export const PROVA_NON_PERSISTITA =
  "L'archivio locale di questo browser non ha tenuto la prova: resta accesa adesso, e al " +
  "prossimo avvio andrà riaccesa.";

/* ────────────────────────────────────────────────────────────────────────────
   LA SQUADRA DI ESEMPIO — integralmente sintetica
   ──────────────────────────────────────────────────────────────────────────── */

/** La competizione della prova. Identificativo inventato qui, come tutto il resto. */
export const PROVA_COMPETITION_ID = "prova-campionato";

/** La giornata della prova: un numero qualunque, purché intero e positivo. */
export const PROVA_GIORNATA = 5;

function id(ruolo: string, numero: number): string {
  return `${PROVA_PREFISSO_ID}${ruolo}-${numero}`;
}

/**
 * LA ROSA DI ESEMPIO, composta perché i comandi si possano provare davvero e
 * non solo guardare.
 *
 * Le quantità non sono decorative. Due portieri, perché la porta non resta
 * vuota e il cambio del portiere è un gesto a sé. Sei difensori, sette
 * centrocampisti e cinque attaccanti, perché i sette moduli di §9 chiedono al
 * massimo cinque difensori, cinque centrocampisti e tre attaccanti fra i
 * titolari: con questi numeri ognuno dei sette si può comporre per intero
 * spostando giocatori, invece di limitarsi a scegliere il modulo e vedere una
 * violazione che non si può togliere.
 *
 * DUE CASI SCOMODI, deliberati. `ESEMPIO-Attaccante-2` è dichiarato
 * indisponibile ed è schierato titolare: spuntarlo «lo voglio in campo» fa
 * comparire davvero l'avvertimento su chi non scende in campo, che altrimenti
 * resterebbe un ramo mai visto. `ESEMPIO-Difensore-3` è in dubbio, che non è la
 * stessa cosa e non produce nessun avvertimento: la differenza fra i due stati
 * si vede meglio con tutti e due sotto gli occhi.
 */
export const PROVA_ROSA: ObservedTeam = {
  teamId: `${PROVA_PREFISSO_ID}Squadra`,
  players: [
    { id: id("Portiere", 1), role: "P", availability: "disponibile" },
    { id: id("Difensore", 1), role: "D", availability: "disponibile" },
    { id: id("Difensore", 2), role: "D", availability: "disponibile" },
    { id: id("Difensore", 3), role: "D", availability: "in_dubbio" },
    { id: id("Difensore", 4), role: "D", availability: "disponibile" },
    { id: id("Centrocampista", 1), role: "C", availability: "disponibile" },
    { id: id("Centrocampista", 2), role: "C", availability: "disponibile" },
    { id: id("Centrocampista", 3), role: "C", availability: "disponibile" },
    { id: id("Centrocampista", 4), role: "C", availability: "disponibile" },
    { id: id("Attaccante", 1), role: "A", availability: "disponibile" },
    { id: id("Attaccante", 2), role: "A", availability: "indisponibile" },
    { id: id("Portiere", 2), role: "P", availability: "disponibile" },
    { id: id("Difensore", 5), role: "D", availability: "disponibile" },
    { id: id("Centrocampista", 5), role: "C", availability: "indisponibile" },
    { id: id("Attaccante", 3), role: "A", availability: "disponibile" },
    { id: id("Difensore", 6), role: "D", availability: "disponibile" },
    { id: id("Centrocampista", 6), role: "C", availability: "disponibile" },
    { id: id("Centrocampista", 7), role: "C", availability: "disponibile" },
    { id: id("Attaccante", 4), role: "A", availability: "disponibile" },
    { id: id("Attaccante", 5), role: "A", availability: "disponibile" },
  ],
};

/**
 * LA FORMAZIONE DI ESEMPIO: un 4-4-2 legale, con la panchina ordinata e tre
 * giocatori fuori dai convocati.
 *
 * Parte legale di proposito. Una formazione che nascesse già illegale
 * mostrerebbe le violazioni prima ancora che qualcuno abbia toccato qualcosa,
 * e non si capirebbe più quali le ha prodotte una mossa e quali c'erano da
 * prima: la prova serve a vedere il nesso fra il gesto e la conseguenza.
 */
export const PROVA_FORMAZIONE: ObservedLineup = {
  competitionId: PROVA_COMPETITION_ID,
  module: "442",
  goalkeeperId: id("Portiere", 1),
  starterIds: [
    id("Difensore", 1),
    id("Difensore", 2),
    id("Difensore", 3),
    id("Difensore", 4),
    id("Centrocampista", 1),
    id("Centrocampista", 2),
    id("Centrocampista", 3),
    id("Centrocampista", 4),
    id("Attaccante", 1),
    id("Attaccante", 2),
  ],
  benchIds: [
    id("Portiere", 2),
    id("Difensore", 5),
    id("Centrocampista", 5),
    id("Attaccante", 3),
    id("Difensore", 6),
    id("Centrocampista", 6),
  ],
  flags: { hidden: false, allCompetitions: false },
};

/**
 * LE IMPOSTAZIONI DELLA LEGA DI ESEMPIO — soltanto quelle che questa schermata
 * legge davvero.
 *
 * `undefined` significa «non osservato» in tutto il contratto, e vale anche
 * qui: dichiarare in una fixture campi che la pagina non guarda darebbe
 * l'impressione che la prova verifichi più di quello che verifica. I sette
 * moduli ci sono perché il cambio di modulo è uno dei comandi da provare, e le
 * cinque sostituzioni perché la panchina accorciata produce l'avvertimento che
 * si vedrebbe anche sulla squadra vera.
 */
export const PROVA_IMPOSTAZIONI: ObservedLeagueSettings = {
  allowedModules: ["541", "451", "532", "442", "352", "433", "343"],
  maxSubstitutions: 5,
};

/**
 * LO STATO DEL CANALE, COME SE LA LEGA AVESSE RISPOSTO — e non ha risposto
 * nessuno.
 *
 * Non passa da `readLineupChannelState()` e non collega nessuna porta: è un
 * valore costruito qui, che la shell usa al posto di quello vero soltanto
 * quando `modalitaProvaAttiva` lo consente. La differenza è tutta: una porta
 * finta collegata sarebbe indistinguibile da una vera per chiunque a valle,
 * questo valore no — chi lo usa ha dovuto chiederlo.
 */
export function provaChannelState(): LineupChannelState {
  return {
    kind: "letto",
    roster: PROVA_ROSA,
    settings: PROVA_IMPOSTAZIONI,
    competitions: [
      {
        competition: {
          competitionId: PROVA_COMPETITION_ID,
          name: "Campionato di esempio",
          kind: "campionato",
        },
        matchday: PROVA_GIORNATA,
        state: { kind: "letta", lineup: PROVA_FORMAZIONE },
      },
    ],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   IL PRODUTTORE DI ESEMPIO — l'avvertimento su chi non scende in campo
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Chi, nella squadra di esempio, non scende in campo secondo le previsioni.
 *
 * Si ricava dalla rosa invece di essere un secondo elenco scritto a mano:
 * cambiare la disponibilità di un giocatore lassù cambia anche questo, e non
 * esiste il caso in cui i due si contraddicono in silenzio.
 */
export const PROVA_MAI_IN_CAMPO: readonly string[] = PROVA_ROSA.players
  .filter((player) => player.availability === "indisponibile")
  .map((player) => player.id);

/**
 * IL RAPPORTO DEL PRODUTTORE, COME LO DAREBBE QUELLO VERO.
 *
 * Il produttore di formazioni vive fuori dal core pubblico e decide su
 * previsioni che qui non esistono: l'avvertimento «bloccato in campo uno che
 * non gioca» arriva da lui, e senza di lui non si vedrebbe mai. Questa funzione
 * lo riproduce sulla squadra di esempio con la stessa regola del produttore
 * vero — con la formazione blindata contano tutti gli schierati, altrimenti
 * contano i soli spuntati — perché la prova serve a vedere il comportamento che
 * ci sarà, non uno somigliante.
 *
 * Un avvertimento NON è un rifiuto: non ferma il salvataggio, e non deve. La
 * squadra è di chi la schiera.
 */
export function provaProducerReport(input: {
  readonly constraints: LineupConstraints;
  readonly currentLineup: ObservedLineup | null;
}): ConstraintReportLike {
  const schierati =
    input.constraints.locked && input.currentLineup !== null
      ? [input.currentLineup.goalkeeperId, ...input.currentLineup.starterIds]
      : input.constraints.lockedStarterIds;
  const maiInCampo = schierati.filter((playerId) => PROVA_MAI_IN_CAMPO.includes(playerId));
  if (maiInCampo.length === 0) return { warnings: [] };
  const warnings: readonly ConstraintIssue<ConstraintWarningCode>[] = [
    {
      code: "LOCKED_PLAYER_NEVER_PLAYS",
      message:
        `imposti in campo con probabilità di voto zero: ${maiInCampo.join(", ")}. ` +
        "Non è un vincolo impossibile: è un senza voto in ogni scenario, che §13 manda in " +
        "sostituzione e che, se scoperto, conta come assente. La formazione ne esce peggiore, " +
        "e questo è il prezzo dichiarato della scelta, non un errore da correggere.",
      playerIds: maiInCampo,
    },
  ];
  return { warnings };
}

/** I rapporti per competizione, nella forma che `buildFormazioneView` consuma. */
export function provaProducerReports(
  constraintsByCompetition: ReadonlyMap<string, LineupConstraints>,
  lineup: ObservedLineup | null,
): ReadonlyMap<string, ConstraintReportLike> {
  const constraints = constraintsByCompetition.get(PROVA_COMPETITION_ID);
  if (constraints === undefined) return new Map();
  return new Map([[PROVA_COMPETITION_ID, provaProducerReport({ constraints, currentLineup: lineup })]]);
}

/* ────────────────────────────────────────────────────────────────────────────
   LA PORTA CHIUSA A CHIAVE — i dati veri vincono sempre
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * CHI HA CHIESTO LA PROVA, E QUANDO.
 *
 * Non sono due sfumature della stessa cosa. `adesso` è un comando appena
 * premuto da chi sta guardando la pagina: sa che cosa ha chiesto e vede subito
 * il marchio. `ricordata` è l'accensione riletta dall'archivio locale di una
 * visita precedente: nessuno l'ha chiesta oggi, e chi apre il sito non si
 * aspetta che una squadra inventata compaia prima ancora che si sappia se la
 * sua c'è.
 */
export type ProvaRichiesta = "no" | "adesso" | "ricordata";

/**
 * LA PROVA È ACCESA? Una domanda sola, con una risposta sola, in un posto solo.
 *
 * Due regole, e la seconda è la metà che mancava.
 *
 * 1. I DATI VERI VINCONO SEMPRE: se il canale ha LETTO una squadra la risposta
 *    è `false` comunque. È l'unico modo per cui una prova dimenticata accesa non
 *    possa mai coprire la formazione vera — nemmeno per il tempo di un render,
 *    nemmeno se l'archivio è stato manomesso.
 *
 * 2. UNA PROVA RICORDATA NON SI RIACCENDE FINCHÉ NON SI SA SE CI SONO DATI VERI.
 *    «Il canale ha letto» e «il canale non ha letto» non esauriscono gli stati:
 *    fra i due c'è «non si sa», e ci si sta per tutto il tempo di una lettura e
 *    per sempre se la lettura fallisce. In quel tempo la regola 1 non protegge
 *    niente, perché la squadra vera non è ancora arrivata: una prova riaccesa da
 *    sola coprirebbe dati veri che stanno per esserci. `porta_non_collegata` è
 *    l'unica causa che dice «non c'è nessun canale», cioè l'unica in cui si SA
 *    che nessun dato vero può arrivare, ed è quindi l'unica in cui una prova
 *    ricordata torna accesa da sé.
 *
 *    Una prova chiesta ADESSO non passa da questa seconda regola: è un comando
 *    esplicito di chi guarda, dato sopra un avviso che dice a chiare lettere che
 *    la squadra non è stata letta. La regola 1 continua a valere anche per lei.
 */
export function modalitaProvaAttiva(
  richiesta: ProvaRichiesta,
  channel: LineupChannelState,
): boolean {
  if (richiesta === "no") return false;
  if (channel.kind === "letto") return false;
  if (richiesta === "ricordata") return channel.cause === "porta_non_collegata";
  return true;
}

/* ────────────────────────────────────────────────────────────────────────────
   L'ETICHETTA DELLA PROVA — copre ciò che non è partito, e nient'altro
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * L'ETICHETTA «PROVA» VALE SOLO SULLO STATO IN CUI NULLA È PARTITO.
 *
 * In prova la porta d'invio non viene chiamata affatto, quindi `da_inviare` è
 * l'unico stato che la shell può produrre: questa funzione non è una
 * precauzione contro un caso normale, è la difesa contro il giorno in cui uno
 * stato «inviato» arrivasse qui comunque — per un difetto, per un ordine di
 * esecuzione cambiato, per una porta collegata dove non doveva. In quel giorno
 * scrivere «PROVA — NULLA È PARTITO» sopra un invio vero sarebbe la bugia di
 * questa pagina girata dall'altra parte, e costerebbe come l'altra: si tiene
 * l'etichetta vera, e la prova la si vede lo stesso dal marchio che non si
 * chiude.
 */
export function etichettaProvaVale(prova: boolean, stato: SubmissionUiState["kind"]): boolean {
  return prova && stato === "da_inviare";
}

/** Dove finisce una spunta messa adesso: nell'archivio vero, o solo nella prova. */
export function destinazioneVincoli(prova: boolean): "archivio" | "prova" {
  return prova ? "prova" : "archivio";
}

/* ────────────────────────────────────────────────────────────────────────────
   L'ACCENSIONE, RICORDATA FRA UNA VISITA E L'ALTRA
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * La chiave dell'archivio locale, distinta da quella dei vincoli
 * (`fac_formazione_vincoli`) e senza nessun campo in comune con lei: qui si
 * scrive se la prova è accesa, e nient'altro. Le spunte della prova non si
 * scrivono da nessuna parte.
 */
export const FORMAZIONE_PROVA_STORAGE_KEY = "fac_formazione_prova";
export const FORMAZIONE_PROVA_SCHEMA_VERSION = 1;

const provaSchema = z
  .object({
    schemaVersion: z.literal(FORMAZIONE_PROVA_SCHEMA_VERSION),
    attiva: z.boolean(),
  })
  .strict();

/**
 * Rilegge l'accensione. Fail-closed a SPENTA: qualunque guaio — archivio
 * illeggibile, forma inattesa, browser che non dà accesso — produce una pagina
 * che si comporta come si è sempre comportata, cioè l'avviso al posto della
 * squadra. Un archivio storto che accendesse la prova sarebbe l'unico modo per
 * far comparire dati finti senza che nessuno li abbia chiesti.
 */
export function caricaModalitaProva(storage: StorageLike): boolean {
  let raw: string | null;
  try {
    raw = storage.getItem(FORMAZIONE_PROVA_STORAGE_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  const result = provaSchema.safeParse(parsed);
  return result.success ? result.data.attiva : false;
}

/**
 * Scrive l'accensione, e dice se ha tenuto — con la rilettura dentro il
 * contratto, come gli altri archivi di questa pagina. Chi chiama usa il `false`
 * per dirlo a schermo invece di lasciarlo scoprire al prossimo avvio.
 */
export function salvaModalitaProva(storage: StorageLike, attiva: boolean): boolean {
  const raw = JSON.stringify({ schemaVersion: FORMAZIONE_PROVA_SCHEMA_VERSION, attiva });
  try {
    storage.setItem(FORMAZIONE_PROVA_STORAGE_KEY, raw);
    return storage.getItem(FORMAZIONE_PROVA_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}
