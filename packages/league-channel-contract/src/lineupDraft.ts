// LA FORMAZIONE CHE SI STA MODIFICANDO — le mosse, i loro rifiuti dichiarati, e
// i conflitti fra una modifica e un vincolo già messo.
//
// PERCHÉ MODIFICARE E VINCOLARE SONO DUE COSE DIVERSE. Un vincolo dice «questo
// lo voglio in campo» e vale per la formazione che verrà; una modifica dice
// «questo mettilo in panchina adesso» e vale per quella che si sta guardando.
// Sono due volontà distinte della stessa persona, e possono contraddirsi: la
// terza strada — eseguire in silenzio, oppure rifiutare senza spiegare — è
// esattamente quella che questo file non lascia percorrere. Le mosse che
// contraddicono un vincolo non le decide il codice: `benchMoveConflict` e
// `moduleChangeConflict` restituiscono il conflitto, e chi ha messo il vincolo
// sceglie se toglierlo.
//
// OGNI MOSSA IMPOSSIBILE È UN RIFIUTO DICHIARATO, mai un cambiamento a metà.
// `LineupEdit` è una somma, non una formazione: una mossa che non si può fare
// restituisce il motivo, e chi chiama non ha modo di confondere «fatto» con
// «non fatto» perché non riceve una formazione affatto.
//
// L'ORDINE DELLA PANCHINA È DATO, NON PRESENTAZIONE. §10 dà cinque
// sostituzioni: quando i senza voto sono più delle sostituzioni disponibili,
// chi entra e chi resta fuori lo decide l'ordine della panchina — l'unica
// preferenza che il regolamento concede. Per questo la panchina si riordina, e
// per questo nessuna funzione di qui riordina niente da sé: chi esce dagli
// undici va IN FONDO, dove entra per ultimo, e spostarlo è un gesto di chi
// guarda. Mettere un uscente «al suo posto» significherebbe scegliere al posto
// suo chi entra per primo la domenica.
//
// NIENTE RETE E NIENTE OROLOGIO, come in tutto il pacchetto: funzioni pure, gli
// stessi argomenti danno lo stesso esito.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import { MODULES, moduleShape } from "../../league-gameweek/src/leagueGameweek.js";
import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type { LineupConstraints } from "../../league-gameweek/src/lineupProposer.js";
import type { ObservedLeagueSettings } from "./leagueSettings.js";
import type { LineupFlags, ObservedLineup } from "./lineupSubmission.js";
import { diffLineups, toSubmission } from "./lineupSubmission.js";
import type { PitchSlot } from "./pitchLayout.js";
import { LINEA_PORTA, pitchLayout } from "./pitchLayout.js";
import type { ObservedTeam } from "./roster.js";
import { rolesByPlayerId } from "./roster.js";
import type { SubmissionViolation } from "./submissionLegality.js";
import { validateSubmissionAgainstSettings } from "./submissionLegality.js";

/**
 * L'esito di una mossa: la formazione nuova, oppure il motivo del rifiuto.
 *
 * IL RIFIUTO PUÒ PORTARE UN CONFLITTO, e non è una terza strada: è lo stesso
 * rifiuto di sempre, con accanto il vincolo che lo ha prodotto quando ce n'è
 * uno. `reason` c'è sempre e da sola basta a mostrare a schermo perché la mossa
 * non è passata — un rifiuto muto diventerebbe «non succede niente» sotto le
 * dita di chi trascina. `conflict`, quando c'è, dice **quale** vincolo si sta
 * contraddicendo e che cosa succede se lo si toglie: è la stessa
 * `ConstraintConflict` che `moduleChangeConflict` restituisce per un cambio di
 * modulo esplicito, perché è la stessa contraddizione e non deve avere due
 * forme diverse a seconda di come la si raggiunge.
 */
export type LineupEdit =
  | { readonly ok: true; readonly lineup: ObservedLineup }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly conflict?: ConstraintConflict;
    };

function rifiutata(reason: string): LineupEdit {
  return { ok: false, reason };
}

/** Un rifiuto che porta con sé il vincolo contraddetto, e il modo di scioglierlo. */
function inConflitto(conflict: ConstraintConflict): LineupEdit {
  return { ok: false, reason: conflict.message, conflict };
}

function eseguita(lineup: ObservedLineup): LineupEdit {
  return { ok: true, lineup };
}

/**
 * PERCHÉ QUESTA FORMAZIONE NON SI MODIFICA, quando non si modifica.
 *
 * Vuoto significa che si modifica. Le due condizioni sono opposte fra loro e
 * vanno tenute distinte: la BLINDATURA è una volontà dichiarata — «questa
 * tienila così» — e si toglie con un clic; l'ASSENZA di una formazione letta è
 * un fatto della lettura, e non c'è nessun comando che la produca da qui.
 *
 * Sta nel contratto e non nella shell perché è una regola, non un dettaglio di
 * disegno: un bottone disabilitato da una condizione scritta nel DOM è una
 * regola che si può provare solo con un browser.
 */
export function editsBlockedReason(
  constraints: LineupConstraints,
  lineup: ObservedLineup | null,
): string {
  if (constraints.locked) {
    return "la formazione è blindata: nessun comando la cambia finché la blindatura resta accesa";
  }
  if (lineup === null) {
    return "non c'è nessuna formazione letta per questa partita: non c'è niente da modificare";
  }
  return "";
}

/** Dove sta un giocatore nella formazione che si sta guardando. */
export type LineupPlace = "porta" | "titolare" | "panchina" | "fuori";

/** Dove sta `playerId` in `lineup`. `fuori` = in rosa e non schierato. */
export function placeOf(lineup: ObservedLineup, playerId: string): LineupPlace {
  if (playerId === lineup.goalkeeperId) return "porta";
  if (lineup.starterIds.includes(playerId)) return "titolare";
  if (lineup.benchIds.includes(playerId)) return "panchina";
  return "fuori";
}

/**
 * DA FUORI O DALLA PANCHINA AGLI UNDICI.
 *
 * Due mosse diverse, perché i due posti sono diversi:
 *
 *  - un PORTIERE entra in porta, e il posto in porta è uno solo: chi c'era
 *    prende la casella che l'entrante lasciava in panchina. Non è una scelta
 *    estetica — è l'unica che non inventa una posizione nuova in un elenco il
 *    cui ordine è un dato;
 *  - un giocatore DI MOVIMENTO entra in fondo agli undici. Se il modulo non lo
 *    prevede, l'undici diventa illegale e si vede subito: è la conseguenza che
 *    `draftLegality` mostra, non un errore da nascondere impedendo la mossa.
 *
 * Un ruolo NON OSSERVATO ferma la mossa invece di indovinarla: senza sapere se
 * quel giocatore entrerebbe in porta o in campo non c'è nessuna mossa da fare,
 * e sceglierne una sarebbe dedurre un dato che nessuno ha letto.
 */
export function moveToStarters(
  lineup: ObservedLineup,
  playerId: string,
  roles: ReadonlyMap<string, Role>,
): LineupEdit {
  const place = placeOf(lineup, playerId);
  if (place === "porta" || place === "titolare") {
    return rifiutata(`«${playerId}» è già fra i titolari di questa formazione`);
  }
  const role = roles.get(playerId);
  if (role === undefined) {
    return rifiutata(
      `il ruolo di «${playerId}» non è stato osservato: non si sa se entrerebbe in porta o in ` +
        "campo, e qui non lo si deduce",
    );
  }

  if (role === "P") {
    const benchIds = [...lineup.benchIds];
    const index = benchIds.indexOf(playerId);
    if (index === -1) {
      // Fuori dalla panchina e portiere: prende la porta, e chi esce va in
      // fondo alla panchina come ogni altro uscente.
      return eseguita({
        ...lineup,
        goalkeeperId: playerId,
        benchIds: [...benchIds, lineup.goalkeeperId],
      });
    }
    benchIds[index] = lineup.goalkeeperId;
    return eseguita({ ...lineup, goalkeeperId: playerId, benchIds });
  }

  return eseguita({
    ...lineup,
    starterIds: [...lineup.starterIds, playerId],
    benchIds: lineup.benchIds.filter((id) => id !== playerId),
  });
}

/**
 * IN PANCHINA, IN FONDO — dagli undici o da fuori dai convocati.
 *
 * LA PORTA NON RESTA VUOTA. Un portiere lascia la porta soltanto quando un
 * altro portiere la prende: una formazione senza portiere non è una tappa
 * intermedia utile, è un invio illegale che nessuno voleva. Il rifiuto lo dice
 * con parole, e la mossa che serve — far entrare l'altro portiere — è a due
 * righe di distanza sullo schermo.
 */
export function moveToBench(lineup: ObservedLineup, playerId: string): LineupEdit {
  const place = placeOf(lineup, playerId);
  if (place === "porta") {
    return rifiutata(
      `«${playerId}» è in porta, e la porta non può restare vuota: lascia il posto solo quando ` +
        "un altro portiere entra al suo posto",
    );
  }
  if (place === "panchina") return rifiutata(`«${playerId}» è già in panchina`);
  return eseguita({
    ...lineup,
    starterIds: lineup.starterIds.filter((id) => id !== playerId),
    benchIds: [...lineup.benchIds, playerId],
  });
}

/** Fuori dai convocati: né titolare né in panchina. */
export function moveOutside(lineup: ObservedLineup, playerId: string): LineupEdit {
  const place = placeOf(lineup, playerId);
  if (place === "porta") {
    return rifiutata(
      `«${playerId}» è in porta: esce solo quando un altro portiere entra al suo posto`,
    );
  }
  if (place === "fuori") return rifiutata(`«${playerId}» non è schierato in questa formazione`);
  return eseguita({
    ...lineup,
    starterIds: lineup.starterIds.filter((id) => id !== playerId),
    benchIds: lineup.benchIds.filter((id) => id !== playerId),
  });
}

/** Verso l'alto entra prima, verso il basso entra dopo. */
export type BenchDirection = "su" | "giu";

/**
 * RIORDINA LA PANCHINA di un posto.
 *
 * Uno scambio con il vicino, non un inserimento: un inserimento sposterebbe
 * tutti gli altri di una posizione, e ognuna di quelle posizioni è una
 * preferenza che qualcuno ha espresso.
 */
export function moveBench(
  lineup: ObservedLineup,
  playerId: string,
  direction: BenchDirection,
): LineupEdit {
  const benchIds = [...lineup.benchIds];
  const index = benchIds.indexOf(playerId);
  if (index === -1) return rifiutata(`«${playerId}» non è in panchina`);
  const target = direction === "su" ? index - 1 : index + 1;
  if (target < 0 || target >= benchIds.length) {
    return rifiutata(
      direction === "su"
        ? `«${playerId}» è già il primo a entrare`
        : `«${playerId}» è già l'ultimo a entrare`,
    );
  }
  const vicino = benchIds[target];
  const proprio = benchIds[index];
  if (vicino === undefined || proprio === undefined) {
    return rifiutata("la panchina non è leggibile in quella posizione");
  }
  benchIds[index] = vicino;
  benchIds[target] = proprio;
  return eseguita({ ...lineup, benchIds });
}

/**
 * IL MODULO DELLA FORMAZIONE.
 *
 * Cambiare modulo non ridispone nessuno: gli undici restano quelli, e se non
 * compongono il modulo nuovo la violazione si vede subito accanto a chi la
 * causa. Ridisporli qui significherebbe scegliere al posto di chi guarda quali
 * giocatori sacrificare — che è precisamente la decisione che sta prendendo.
 */
export function setLineupModule(lineup: ObservedLineup, module: Module): LineupEdit {
  if (lineup.module === module) return rifiutata(`la formazione è già schierata con «${module}»`);
  return eseguita({ ...lineup, module });
}

/* ────────────────────────────────────────────────────────────────────────────
   LO SCAMBIO — il gesto del campo, e l'unica mossa che non ha uno stato di mezzo
   ──────────────────────────────────────────────────────────────────────────── */

/** Dove sta un giocatore, e in quale casella dell'elenco. `-1` = la porta. */
interface Posizione {
  readonly place: LineupPlace;
  readonly index: number;
}

function posizione(lineup: ObservedLineup, playerId: string): Posizione | null {
  const place = placeOf(lineup, playerId);
  if (place === "porta") return { place, index: -1 };
  if (place === "titolare") return { place, index: lineup.starterIds.indexOf(playerId) };
  if (place === "panchina") return { place, index: lineup.benchIds.indexOf(playerId) };
  return null;
}

/** Quanti titolari di movimento per ruolo, o l'id del primo ruolo non letto. */
function reparti(
  starterIds: readonly string[],
  roles: ReadonlyMap<string, Role>,
): Readonly<Record<Role, number>> | { readonly ruoloIgnoto: string } {
  const counts: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const id of starterIds) {
    const role = roles.get(id);
    if (role === undefined) return { ruoloIgnoto: id };
    counts[role] += 1;
  }
  return counts;
}

/** Il modulo dei sette che ha esattamente questa forma, se ce n'è uno. */
function moduloConLaForma(
  defenders: number,
  midfielders: number,
  strikers: number,
): Module | undefined {
  return MODULES.find((module) => {
    const shape = moduleShape(module);
    return (
      shape.defenders === defenders &&
      shape.midfielders === midfielders &&
      shape.strikers === strikers
    );
  });
}

/**
 * LA CHIUSURA COMUNE DELLE DUE MOSSE DEL CAMPO — lo scambio e il posare
 * qualcuno su una casella vuota. Le due mosse sono gesti diversi e arrivano qui
 * con formazioni già costruite; da qui in poi le regole sono le stesse, e
 * scriverle due volte avrebbe significato lasciarle divergere.
 *
 * IL MODULO BLOCCATO NON SI AGGIRA TRASCINANDO. Un cambio di modulo esplicito
 * passa da `moduleChangeConflict` perché chi lo chiede SA di cambiare modulo.
 * Un trascinamento no: chi lo fa sposta un giocatore, e il modulo cambia come
 * conseguenza — una conseguenza che il chiamante non ha modo di prevedere e
 * quindi non ha modo di andare a chiedere. Una guardia che valesse solo se
 * qualcun altro si ricorda di interrogarla non sarebbe una guardia: il vincolo
 * sul modulo esiste perché quel modulo non cambi, e se un trascinamento glielo
 * cambia in silenzio il vincolo non c'è. Perciò il conflitto si calcola QUI,
 * con la stessa funzione e nella stessa forma del cambio esplicito, e chi ha
 * messo la spunta scioglie la contraddizione togliendola — come già fa altrove.
 *
 * `formaCambiata` non si deduce contando: lo dice la mossa, che sa se ha
 * toccato o no la composizione degli undici di movimento.
 */
function concludiMossaDelCampo(
  precedente: ObservedLineup,
  proposta: ObservedLineup,
  formaCambiata: boolean,
  roles: ReadonlyMap<string, Role>,
  constraints: LineupConstraints,
  gesto: string,
): LineupEdit {
  if (proposta.goalkeeperId.length === 0 && precedente.goalkeeperId.length > 0) {
    return rifiutata(
      `${gesto} lascerebbe la porta vuota, e la porta lascia il posto solo quando un altro ` +
        "portiere entra al suo posto",
    );
  }
  if (proposta.goalkeeperId !== precedente.goalkeeperId) {
    const role = roles.get(proposta.goalkeeperId);
    if (role === undefined) {
      return rifiutata(
        `il ruolo di «${proposta.goalkeeperId}» non è stato osservato: in porta non ci si mette ` +
          "per esclusione, e qui non lo si deduce",
      );
    }
    if (role !== "P") {
      return rifiutata(
        `«${proposta.goalkeeperId}» è di ruolo ${role}: in porta ci va un portiere, e la porta ` +
          "è l'unico posto che non ammette un'eccezione",
      );
    }
  }

  if (!formaCambiata) return eseguita(proposta);

  const conto = reparti(proposta.starterIds, roles);
  if ("ruoloIgnoto" in conto) {
    return rifiutata(
      `il ruolo di «${conto.ruoloIgnoto}» non è stato osservato: la forma che ${gesto} ` +
        "lascerebbe non è calcolabile, e non si suppone",
    );
  }
  const modulo = conto.P > 0 ? undefined : moduloConLaForma(conto.D, conto.C, conto.A);
  if (modulo === undefined) {
    const portieri =
      conto.P === 0
        ? ""
        : `, più ${conto.P} portiere${conto.P === 1 ? "" : "i"} fra i titolari di movimento`;
    return rifiutata(
      `${gesto} lascerebbe ${conto.D} difensori, ${conto.C} centrocampisti e ` +
        `${conto.A} attaccanti${portieri}: nessuno dei sette moduli di §9 ha questa forma, e ` +
        "una formazione così non si invia",
    );
  }
  if (modulo === proposta.module) return eseguita(proposta);

  const conflitto = moduleChangeConflict(constraints, modulo);
  if (conflitto !== null) return inConflitto(conflitto);
  return eseguita({ ...proposta, module: modulo });
}

/**
 * SCAMBIARE DUE GIOCATORI DI POSTO — il gesto che il campo rende naturale, e
 * che l'elenco in colonna non suggeriva nemmeno.
 *
 * È ATOMICO, ed è la ragione per cui non è «una mossa fuori più una mossa
 * dentro». Le due mosse in fila passerebbero per un undici a dodici o a dieci:
 * uno stato che nessuno ha voluto, che `draftLegality` mostrerebbe come
 * illegale, e su cui un secondo rifiuto lascerebbe la formazione a metà strada.
 * Qui o esce una formazione legale, o non esce niente e il motivo è scritto.
 *
 * IL MODULO SEGUE I RUOLI, NON LI COMANDA. Scambiare un difensore in panchina
 * con un centrocampista in campo cambia la forma degli undici: se la forma
 * nuova è uno dei sette moduli di §9 la mossa si esegue e il modulo della
 * formazione diventa quello — gli undici sono esattamente quelli che chi guarda
 * ha composto, e l'etichetta li descrive invece di contraddirli. Se invece la
 * forma nuova non è nessuno dei sette, la mossa si rifiuta dicendo la forma che
 * avrebbe prodotto: eseguirla lascerebbe una formazione che non si può inviare.
 *
 * PERCHÉ QUI SI RIFIUTA E `moveToStarters` INVECE LASCIA PASSARE L'ILLEGALE.
 * Non è la stessa situazione, ed è bene dirlo perché sembra esserlo. Far entrare
 * qualcuno AGGIUNGE un titolare: il conto passa da dieci a undici di movimento,
 * nessun modulo lo prevede, e l'unica alternativa a mostrare l'illegalità
 * sarebbe stata decidere al posto di chi guarda chi esce — che è la scelta che
 * quella funzione si rifiuta di fare. Lo scambio invece dice già chi esce: il
 * conto resta dieci, l'unica cosa che può cambiare è la forma, e per la forma
 * esiste una risposta giusta — il modulo che la descrive — che non toglie
 * nessuna decisione a nessuno. Dove non esiste, si rifiuta.
 *
 * LA PORTA È UN POSTO SOLO. Lo scambio non la lascia mai vuota (chi esce dalla
 * porta viene rimpiazzato nello stesso gesto) e non ci mette chi portiere non
 * è: un ruolo diverso da `P`, o non osservato, ferma la mossa. Un secondo
 * portiere fra i titolari di movimento cade invece sulla regola della forma —
 * nessuno dei sette moduli ha una casella per lui.
 *
 * CHI È FUORI DAI CONVOCATI NON SI SCAMBIA: non ha un posto da cedere. Entra
 * con `moveToStarters` o `moveToBench`, che è la mossa che descrive ciò che
 * sta succedendo davvero.
 *
 * I VINCOLI SONO UN ARGOMENTO, e obbligatorio. Uno scambio che cambia il modulo
 * contraddice un modulo bloccato esattamente come lo contraddice un cambio
 * esplicito, e il conflitto esce da qui invece di dipendere da chi disegna:
 * `NO_LINEUP_CONSTRAINTS` è il valore da passare quando vincoli non ce ne sono.
 */
export function swapPlayers(
  lineup: ObservedLineup,
  aId: string,
  bId: string,
  roles: ReadonlyMap<string, Role>,
  constraints: LineupConstraints,
): LineupEdit {
  if (aId === bId) {
    return rifiutata(`«${aId}» è già al suo posto: scambiarlo con sé stesso non cambia niente`);
  }
  const posA = posizione(lineup, aId);
  if (posA === null) {
    return rifiutata(
      `«${aId}» non è schierato in questa formazione: non ha un posto da scambiare, e per farlo ` +
        "entrare c'è la mossa che lo fa entrare",
    );
  }
  const posB = posizione(lineup, bId);
  if (posB === null) {
    return rifiutata(
      `«${bId}» non è schierato in questa formazione: non ha un posto da scambiare, e per farlo ` +
        "entrare c'è la mossa che lo fa entrare",
    );
  }

  // Le due caselle si leggono PRIMA di scrivere: cercare la seconda dopo aver
  // scritto la prima la troverebbe sull'id appena messo, e uno scambio dentro
  // lo stesso elenco tornerebbe indietro da sé.
  const starterIds = [...lineup.starterIds];
  const benchIds = [...lineup.benchIds];
  let goalkeeperId = lineup.goalkeeperId;
  const scrivi = (posto: Posizione, id: string): boolean => {
    if (posto.place === "porta") {
      goalkeeperId = id;
      return true;
    }
    const lista = posto.place === "titolare" ? starterIds : benchIds;
    if (posto.index < 0 || posto.index >= lista.length) return false;
    lista[posto.index] = id;
    return true;
  };
  if (!scrivi(posA, bId) || !scrivi(posB, aId)) {
    return rifiutata("la formazione non è leggibile in una delle due posizioni dello scambio");
  }

  // Gli undici di movimento cambiano composizione solo quando uno dei due posti
  // è fra i titolari e l'altro no. Negli altri casi — due titolari, due
  // panchinari, porta e panchina — la forma è per costruzione quella di prima,
  // e il modulo non ha ragione di cambiare.
  const formaCambiata = (posA.place === "titolare") !== (posB.place === "titolare");
  return concludiMossaDelCampo(
    lineup,
    { ...lineup, goalkeeperId, starterIds, benchIds },
    formaCambiata,
    roles,
    constraints,
    "lo scambio",
  );
}

/**
 * POSARE QUALCUNO SU UNA CASELLA VUOTA — il secondo gesto del campo, e quello
 * che una formazione incompleta rende necessario.
 *
 * NON È UNO SCAMBIO e non è `moveToStarters`. Non è uno scambio perché non c'è
 * nessuno da scambiare: la casella è vuota per definizione, e chiedere allo
 * scambio di gestirla significherebbe fargli inventare un secondo giocatore.
 * Non è `moveToStarters` perché quella mossa non sa **dove** stai posando, e il
 * dove qui conta: una casella libera in difesa dice che il modulo aspetta ancora
 * un difensore, e portarci un centrocampista cambia il conto dei reparti.
 *
 * LA CASELLA DICE DOVE SI STA MIRANDO, NON CHE RUOLO PRENDE CHI ARRIVA. È la
 * distinzione che tiene lontano il difetto di sempre: un centrocampista posato
 * sulla casella libera della difesa **non diventa un difensore** — resta un
 * centrocampista, il conto dei reparti cambia, e se la forma nuova è uno dei
 * sette moduli la mossa passa con il modulo che la descrive. Se non lo è, si
 * rifiuta dicendo la forma. La casella serve a due cose sole, ed entrambe sono
 * fatti e non deduzioni: dire che un posto libero **c'è** — un modulo già
 * completo non ne ha, e allora non si aggiunge un dodicesimo — e distinguere la
 * porta dal resto del campo.
 *
 * LA CASELLA DEV'ESSERE QUELLA DI ADESSO. Il `PitchSlot` che arriva viene
 * ricontrollato contro il campo che questa formazione produce ora: una casella
 * presa da un disegno precedente descriverebbe un campo che non c'è più, e
 * posarci qualcuno sopra sarebbe eseguire una mossa mirata a un'altra
 * formazione.
 *
 * Il resto è lo stesso dello scambio, e passa dalle stesse righe: atomica, la
 * porta è un posto solo e vuole un portiere, chi è fuori dai convocati entra con
 * le mosse che lo fanno entrare, e un modulo bloccato non si aggira posando.
 */
export function fillSlot(
  lineup: ObservedLineup,
  playerId: string,
  slot: PitchSlot,
  roles: ReadonlyMap<string, Role>,
  constraints: LineupConstraints,
): LineupEdit {
  if (slot.playerId !== null) {
    return rifiutata(
      `quel posto è già di «${slot.playerId}»: due giocatori su una casella sola non esistono, e ` +
        "per metterli uno al posto dell'altro c'è lo scambio",
    );
  }

  // La casella si riconosce nel campo di ADESSO, non si prende per buona.
  const campo = pitchLayout(lineup, roles);
  const riga = campo.lines[slot.line];
  const casella = riga === undefined ? undefined : riga[slot.indexInLine];
  if (casella === undefined || casella.role !== slot.role) {
    return rifiutata(
      `quella casella non esiste nel campo di questa formazione: il modulo «${lineup.module}» ` +
        "non la prevede, e una casella di un disegno precedente non è un posto",
    );
  }
  if (casella.playerId !== null) {
    return rifiutata(
      `quel posto è ora di «${casella.playerId}»: il campo è cambiato da quando è stato ` +
        "disegnato, e la mossa mirava a un'altra formazione",
    );
  }

  const place = placeOf(lineup, playerId);
  if (place === "fuori") {
    return rifiutata(
      `«${playerId}» non è schierato in questa formazione: prima entra fra i convocati, e per ` +
        "quello c'è la mossa che lo fa entrare",
    );
  }

  const gesto = `posare «${playerId}» in quel posto`;

  if (slot.line === LINEA_PORTA) {
    if (place === "porta") return rifiutata(`«${playerId}» è già in porta`);
    return concludiMossaDelCampo(
      lineup,
      {
        ...lineup,
        goalkeeperId: playerId,
        starterIds: lineup.starterIds.filter((id) => id !== playerId),
        benchIds: lineup.benchIds.filter((id) => id !== playerId),
      },
      place === "titolare",
      roles,
      constraints,
      gesto,
    );
  }

  if (place === "porta") {
    return rifiutata(
      `«${playerId}» è in porta, e la porta non può restare vuota: lascia il posto solo quando ` +
        "un altro portiere entra al suo posto",
    );
  }
  if (place === "titolare") {
    return rifiutata(
      `«${playerId}» è già fra i titolari, e la casella in cui compare la decide il suo ruolo: ` +
        "spostarlo su un posto libero di un altro reparto non lo cambierebbe di reparto",
    );
  }

  // Dalla panchina agli undici, in fondo: dentro il suo reparto è l'ultimo, che
  // è esattamente la prima casella libera che il campo gli mostra. Inserirlo
  // altrove sposterebbe di una posizione ogni compagno del suo reparto.
  return concludiMossaDelCampo(
    lineup,
    {
      ...lineup,
      starterIds: [...lineup.starterIds, playerId],
      benchIds: lineup.benchIds.filter((id) => id !== playerId),
    },
    true,
    roles,
    constraints,
    gesto,
  );
}

/** Le due opzioni della formazione, una alla volta. */
export function setLineupFlag(
  lineup: ObservedLineup,
  flag: keyof LineupFlags,
  value: boolean,
): LineupEdit {
  if (lineup.flags[flag] === value) return rifiutata("l'opzione è già così");
  return eseguita({ ...lineup, flags: { ...lineup.flags, [flag]: value } });
}

/**
 * CIÒ CHE SI VEDE È CIÒ CHE LA PIATTAFORMA RIPORTA?
 *
 * Il confronto è quello dell'invio (`diffLineups`), indice per indice: due
 * panchine con gli stessi nomi in ordine diverso sono due formazioni diverse, e
 * dire «non modificata» di una panchina riordinata nasconderebbe proprio la
 * modifica che decide chi entra la domenica.
 */
export function isLineupModified(read: ObservedLineup, shown: ObservedLineup): boolean {
  return diffLineups(read, shown).length > 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   MODIFICA CONTRO VINCOLO — il conflitto si dichiara, non si risolve da soli
   ──────────────────────────────────────────────────────────────────────────── */

/** Un vincolo che la modifica appena chiesta contraddice. */
export interface ConstraintConflict {
  readonly kind: "titolare_spuntato" | "modulo_bloccato";
  /** Il vincolo contraddetto, scritto per chi lo ha messo. */
  readonly message: string;
  /** Che cosa succede se lo si toglie. Mai un'azione presa da sola. */
  readonly ifRemoved: string;
}

/**
 * Spostare in panchina (o fuori) qualcuno che è spuntato «lo voglio in campo».
 *
 * Non è un errore e non è un divieto: sono due volontà della stessa persona che
 * si contraddicono, e la contraddizione la scioglie lei.
 */
export function benchMoveConflict(
  constraints: LineupConstraints,
  playerId: string,
): ConstraintConflict | null {
  if (!constraints.lockedStarterIds.includes(playerId)) return null;
  return {
    kind: "titolare_spuntato",
    message: `«${playerId}» è spuntato come «lo voglio in campo»: toglierlo dagli undici contraddice quel vincolo`,
    ifRemoved: `la spunta su «${playerId}» viene tolta, e la mossa viene eseguita`,
  };
}

/** Cambiare modulo quando ce n'è uno bloccato, e non è quello. */
export function moduleChangeConflict(
  constraints: LineupConstraints,
  module: Module,
): ConstraintConflict | null {
  const bloccato = constraints.lockedModule;
  if (bloccato === undefined || bloccato === module) return null;
  return {
    kind: "modulo_bloccato",
    message: `il modulo bloccato è «${bloccato}»: schierare «${module}» contraddice quel vincolo`,
    ifRemoved: `il blocco sul modulo «${bloccato}» viene tolto, e la formazione passa a «${module}»`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   LA LEGALITÀ DI CIÒ CHE SI VEDE, ricontrollata a ogni modifica
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * L'esito del controllo di legalità sulla formazione mostrata.
 *
 * `non_verificabile` NON è «legale»: è «da qui non si può dire», e i due casi
 * che lo producono sono entrambi fatti dell'osservazione, non della formazione
 * — la giornata non nota e un invio non costruibile. Trattarlo come un via
 * libera sarebbe la stessa bugia che `submissionLegality` evita in grande.
 */
export type DraftLegality =
  | {
      readonly kind: "verificata";
      /** Fermano il salvataggio, e si mostrano tutte insieme. */
      readonly blocking: readonly SubmissionViolation[];
      /** Non fermano niente, e si mostrano lo stesso. */
      readonly warnings: readonly SubmissionViolation[];
    }
  | { readonly kind: "non_verificabile"; readonly reason: string };

export interface DraftLegalityInput {
  readonly lineup: ObservedLineup;
  /** `null` quando la giornata non è stata osservata: non si suppone. */
  readonly matchday: number | null;
  readonly competitionId: string;
  readonly roster: ObservedTeam;
  readonly settings: ObservedLeagueSettings;
}

/**
 * LA STESSA VALIDAZIONE DEL SALVATAGGIO, ADESSO.
 *
 * È `validateSubmissionAgainstSettings`, la stessa funzione che decide se
 * l'invio parte, chiamata a ogni modifica invece che solo alla fine. La ragione
 * è tutta qui: un controllo che arriva al momento del salvataggio trasforma
 * ogni errore in un giro di correggi-e-riprova, e ogni giro costa a chi schiera
 * il tempo che alla deadline di §16 non ha. Le violazioni si vedono mentre si
 * modifica, tutte insieme, accanto a ciò che le causa.
 */
export function draftLegality(input: DraftLegalityInput): DraftLegality {
  if (input.matchday === null) {
    return {
      kind: "non_verificabile",
      reason:
        "la giornata non è nota: la legalità di questa formazione non è verificabile da qui, e " +
        "un invio senza giornata finirebbe su una partita che nessuno ha scelto",
    };
  }
  let violations: readonly SubmissionViolation[];
  try {
    const submission = toSubmission(input.matchday, input.competitionId, input.lineup);
    violations = validateSubmissionAgainstSettings(submission, input.settings, {
      rosterIds: input.roster.players.map((player) => player.id),
      roles: rolesByPlayerId(input.roster),
    });
  } catch (error) {
    return {
      kind: "non_verificabile",
      reason: error instanceof Error ? error.message : "invio non costruibile",
    };
  }
  return {
    kind: "verificata",
    blocking: violations.filter((violation) => violation.severity === "bloccante"),
    warnings: violations.filter((violation) => violation.severity === "avvertimento"),
  };
}

/** Le violazioni bloccanti, o nessuna quando la legalità non è verificabile. */
export function blockingViolations(legality: DraftLegality): readonly SubmissionViolation[] {
  return legality.kind === "verificata" ? legality.blocking : [];
}
