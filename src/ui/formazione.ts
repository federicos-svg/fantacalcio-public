// LA SCHERMATA FORMAZIONE — la prima voce della barra, e la pagina che apre il
// sito quando c'è davvero una squadra da schierare.
//
// QUESTO FILE NON DECIDE NIENTE. Riceve un modello già costruito
// (`buildFormazioneView`, nel contratto di osservazione) e lo dipinge: nessuna
// derivazione, nessun default, nessun testo inventato sopra un dato mancante.
// La ragione è la stessa che governa la pagina: le decisioni che contano —
// quale schermata aprire, quali vincoli valgono ancora, che cosa significa
// «salvato», perché il salvataggio non si offre — sono funzioni pure verificate
// senza browser, e una funzione di render che ne rifacesse una pezzo per pezzo
// produrrebbe una seconda verità.
//
// MODIFICARE E VINCOLARE SONO DUE COSE DIVERSE, e la pagina le tiene separate a
// vista: sopra i comandi che cambiano la formazione di questa giornata, sotto le
// spunte e i blocchi che valgono per quella che verrà. Quando le due si
// contraddicono la pagina non esegue in silenzio e non blocca senza spiegare:
// mostra il vincolo contraddetto e offre di toglierlo, perché sono due volontà
// della stessa persona e la contraddizione la scioglie lei.
//
// L'AVVISO PRENDE IL POSTO DELLA SQUADRA. Quando lo stato del canale non è noto
// il modello non porta nessuna competizione, quindi qui non c'è niente da
// disegnare oltre l'avviso — non per disciplina di chi scrive, ma perché non
// esiste il dato con cui disegnare altro. Una griglia vuota accanto a un avviso
// si leggerebbe «non ho ancora schierato», che è una conclusione precisa e
// falsa: chi apre il sito deve capire che il problema è la lettura, non la sua
// formazione.
//
// LA PROVA CON UNA SQUADRA DI ESEMPIO non incrina niente di tutto questo, ed è
// costruita perché non possa. Non si accende da sola; quando è accesa il
// marchio sta NEL CORPO della pagina — in testa, in coda, sul titolo di ogni
// competizione e dentro ogni identificativo di giocatore — e non si può
// chiudere. Un ritaglio di questa schermata non può passare per la formazione
// di nessuno, e il salvataggio in prova non dice mai «inviato».
//
// ACCESSIBILITÀ, come nelle altre schermate: bottoni veri e caselle vere (mai
// un `div` con un `click`), etichette legate al controllo, `aria-*` sui gruppi,
// e il fuoco che resta dove era — `render()` ricostruisce l'albero a ogni clic,
// quindi ogni controllo ha un `id` stabile su cui la shell riporta il fuoco. Un
// comando che non si può usare resta VISIBILE e disabilitato, non sparisce: una
// riga che perde i suoi bottoni non dice a nessuno perché li ha persi.
//
// IL CAMPO È IL DISEGNO, NON UN ORNAMENTO. Una formazione si guarda come si
// guarda una squadra — la porta in basso, poi difesa, centrocampo, attacco — e
// non come un elenco di caselle in colonna: in colonna il modulo non si vede,
// il reparto scoperto non si vede, e la domanda che si fa la domenica mattina
// («chi mi manca davanti?») richiede di contare a mente ciò che un campo dice
// a colpo d'occhio.
//
// I POSTI NON LI CONTA QUESTA FUNZIONE. Li dà `pitchLayout`, che sa quanti ne
// prevede il modulo; ricavarli qui contando i giocatori produrrebbe una seconda
// geometria, e il giorno in cui il modulo cambia direbbe una cosa diversa da
// quella che l'invio manda. Un posto che il modulo prevede e nessuno occupa
// RESTA a schermo, vuoto — un reparto scoperto è la cosa più importante che
// questa pagina possa mostrare — e un titolare che il modulo non riesce a
// ospitare non sparisce dietro il verde: si dichiara, perché è schierato
// davvero ed è lui a rendere illegale l'invio.
//
// OGNI GESTO HA DUE STRADE, E LA SECONDA È QUELLA CHE CONTA. Il trascinamento
// nativo non esiste sotto un dito su un telefono e non esiste per chi usa la
// tastiera: affidargli il gesto principale significherebbe riservare la
// schermata a chi ha un mouse. Quindi ogni gettone, ogni posto del campo e ogni
// zona di posa è un BOTTONE VERO — si preme un giocatore per prenderlo, si
// preme la destinazione per posarlo, si preme di nuovo lo stesso per lasciarlo
// — e il trascinamento è una scorciatoia appoggiata sopra gli stessi comandi,
// mai l'unica via. Ciò che si sta tenendo in mano non lo ricorda questo file:
// lo tiene la shell e lo passa (`FormazionePresa`), come il conflitto aperto e
// l'esito dell'ultimo salvataggio.

import { C, escHtml, renderRoleChip } from "./theme.js";
import type {
  ConstraintConflict,
  ConstraintQuarantine,
  FormazioneCompetitionView,
  FormazionePlayerRow,
  FormazioneView,
  LineupDifference,
  LineupFlags,
  Module,
  PitchSlot,
  Role,
  SubmissionUiState,
  SubmissionViolation,
} from "../../packages/league-channel-contract/src/index.js";
import { pitchLayout } from "../../packages/league-channel-contract/src/index.js";
import { MODULES, saveBlockers } from "../../packages/league-channel-contract/src/index.js";
import {
  lineupAgeLabel,
  type LineupFreshness,
} from "../../packages/league-channel-contract/src/index.js";
import {
  etichettaProvaVale,
  PROVA_ESITO_SALVATAGGIO,
  PROVA_ETICHETTA_SALVATAGGIO,
  PROVA_INVITO,
  PROVA_NON_PERSISTITA,
  PROVA_SPIEGAZIONE,
  PROVA_TESTO_COMANDO,
  PROVA_TESTO_USCITA,
  PROVA_TITOLO,
} from "../formazioneProva.js";

/** I gesti della schermata. Nessuno di loro tocca la rete: li serve la shell. */
export interface FormazioneHandlers {
  readonly onToggleLockedStarter: (competitionId: string, playerId: string) => void;
  readonly onSetLockedModule: (competitionId: string, module: Module | null) => void;
  readonly onToggleLocked: (competitionId: string) => void;
  readonly onSave: (competitionId: string) => void;
  /** Porta un giocatore fra i titolari: dalla panchina o da fuori dai convocati. */
  readonly onMoveToStarters: (competitionId: string, playerId: string) => void;
  /** Manda un giocatore in panchina, in fondo. */
  readonly onMoveToBench: (competitionId: string, playerId: string) => void;
  /** Toglie un giocatore dai convocati. */
  readonly onMoveOutside: (competitionId: string, playerId: string) => void;
  /** Riordina la panchina di un posto: chi entra prima e chi entra dopo. */
  readonly onMoveBench: (competitionId: string, playerId: string, direction: "su" | "giu") => void;
  /**
   * DUE GIOCATORI SI SCAMBIANO IL POSTO — il gesto del campo.
   *
   * È il gesto che il trascinamento produce, e che il tocco e la tastiera
   * producono in due tempi (prendi, posa). Che cosa significhi scambiare non lo
   * decide questa schermata: lo decide `swapPlayers`, che è simmetrico e non
   * sceglie niente di nascosto — chi sale prende esattamente il posto di chi
   * scende, ordine della panchina compreso.
   */
  readonly onSwap: (competitionId: string, aId: string, bId: string) => void;
  /**
   * POSA UN GIOCATORE SU UNA CASELLA CHE IL MODULO PREVEDE E NESSUNO OCCUPA.
   *
   * Non è uno scambio — non c'è nessuno da scambiare — e non è «portalo fra i
   * titolari»: la casella dice DOVE si sta mirando, e `fillSlot` la ricontrolla
   * contro il campo di adesso. Per questo la casella viaggia per intero invece
   * di essere ridotta a un ruolo: un `PitchSlot` ricostruito qui sarebbe un
   * posto inventato con l'aspetto di un posto letto.
   */
  readonly onFillSlot: (competitionId: string, playerId: string, slot: PitchSlot) => void;
  /**
   * PRENDE UN GIOCATORE IN MANO, o lo lascia con `null`.
   *
   * Non cambia nessuna formazione: è la prima metà di un gesto in due tempi, ed
   * esiste perché il trascinamento da solo lascerebbe fuori chi usa un dito o
   * una tastiera. Lo stato che ne esce lo tiene la shell e torna qui come
   * `FormazionePresa`.
   */
  readonly onPrendi: (competitionId: string, playerId: string | null) => void;
  /** Cambia il modulo con cui la formazione è schierata. */
  readonly onSetModule: (competitionId: string, module: Module) => void;
  /** Accende o spegne una delle due opzioni della formazione. */
  readonly onSetFlag: (competitionId: string, flag: keyof LineupFlags, value: boolean) => void;
  /** Riporta la formazione a com'è stata letta dalla piattaforma. */
  readonly onResetLineup: (competitionId: string) => void;
  /** Scioglie il conflitto: `true` toglie il vincolo ed esegue, `false` lascia tutto. */
  readonly onResolveConflict: (competitionId: string, removeConstraint: boolean) => void;
  /**
   * Toglie un vincolo messo da parte — l'unico comando capace di raggiungerlo.
   *
   * Riceve il vincolo messo da parte per intero, così com'è nel modello: che
   * cosa significhi toglierlo lo decide `removeQuarantinedConstraint` nel
   * contratto, non questa funzione di render. Non è una comodità: la riga del
   * giocatore uscito di rosa a schermo non c'è più, quindi senza questo comando
   * la spunta non era togliibile da nessuna parte.
   */
  readonly onRemoveQuarantined: (
    competitionId: string,
    quarantine: ConstraintQuarantine,
  ) => void;
}

/** Ciò che la shell sa e il modello non porta: l'esito dell'ultimo salvataggio. */
export interface FormazioneSaveState {
  readonly competitionId: string | null;
  readonly state: SubmissionUiState;
  readonly blocking: readonly SubmissionViolation[];
  readonly warnings: readonly SubmissionViolation[];
}

/**
 * Ciò che la shell sa sulla modifica in corso: il conflitto che aspetta una
 * decisione, e l'ultima mossa rifiutata.
 *
 * Sono due cose diverse e non si mescolano. Un CONFLITTO è una domanda aperta —
 * il vincolo dice una cosa, la mossa un'altra, e finché non si risponde non
 * succede niente. Un RIFIUTO è una mossa che non esisteva (il portiere che
 * lascia la porta vuota, il primo di panchina che sale ancora): è già successo,
 * e si dice perché.
 */
export interface FormazioneEditState {
  readonly competitionId: string | null;
  readonly conflict: ConstraintConflict | null;
  /** Il motivo dell'ultima mossa rifiutata. Vuoto è la norma. */
  readonly refusal: string;
}

export const NESSUNA_MODIFICA_IN_SOSPESO: FormazioneEditState = {
  competitionId: null,
  conflict: null,
  refusal: "",
};

/**
 * IL GIOCATORE CHE SI HA IN MANO, e per quale competizione.
 *
 * È lo stato del gesto in due tempi, e non è una preferenza né un dato della
 * lega: nessuno lo persiste, e sparisce appena una mossa viene eseguita o
 * rifiutata. Sta nella shell e non in questo file per la ragione di sempre —
 * `render()` ricostruisce l'albero a ogni clic, e uno stato tenuto qui dentro
 * verrebbe buttato via proprio nel momento in cui serve.
 *
 * La competizione fa parte della presa: due formazioni sono due squadre della
 * stessa persona, e un giocatore preso su una non si posa sull'altra.
 */
export interface FormazionePresa {
  readonly competitionId: string | null;
  readonly playerId: string | null;
}

/** Niente in mano: lo stato normale, e quello a cui si torna dopo ogni mossa. */
export const NESSUNA_PRESA: FormazionePresa = { competitionId: null, playerId: null };

/**
 * LA PROVA CON UNA SQUADRA DI ESEMPIO, per quel che ne deve sapere la pagina:
 * se è accesa, come si accende, come si spegne.
 *
 * `attiva` non è una preferenza letta da qui: la decide la shell chiamando
 * `modalitaProvaAttiva`, che con una squadra vera letta risponde sempre `false`.
 * Questa struttura la riceve già decisa, così non esiste un secondo posto in cui
 * quella regola possa essere applicata a metà.
 */
export interface FormazioneProva {
  readonly attiva: boolean;
  /** `true` quando l'archivio locale non ha tenuto l'accensione: lo si dice. */
  readonly nonPersistita: boolean;
  readonly onEntra: () => void;
  readonly onEsci: () => void;
}

/** Nessuna prova: lo stato normale, e quello che la pagina aveva prima. */
export const NESSUNA_PROVA: FormazioneProva = {
  attiva: false,
  nonPersistita: false,
  onEntra: () => undefined,
  onEsci: () => undefined,
};

const ROLE_LABEL: Readonly<Record<string, string>> = { P: "Portiere", D: "Difensore", C: "Centrocampista", A: "Attaccante" };

function sectionTitle(text: string): HTMLElement {
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = text;
  return title;
}

function paragraph(text: string, extraCss = ""): HTMLElement {
  const p = document.createElement("p");
  p.style.cssText = `font-size:13px;line-height:1.55;color:${C.textMid};margin:0;${extraCss}`;
  p.textContent = text;
  return p;
}

function smallHeading(text: string, color: string): HTMLElement {
  const heading = document.createElement("div");
  heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${color};`;
  heading.textContent = text;
  return heading;
}

/** Un bottone di comando: sempre a schermo, disabilitato quando non si può usare. */
function commandButton(
  id: string,
  text: string,
  ariaLabel: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = "btn";
  button.textContent = text;
  button.setAttribute("aria-label", ariaLabel);
  button.disabled = disabled;
  // DISABILITATO E VISIBILMENTE TALE: il colore non basta da solo, ma qui il
  // bottone resta anche non premibile e i lettori di schermo lo annunciano.
  button.style.cssText = `font-size:11px;padding:2px 8px;${disabled ? "opacity:0.45;" : ""}`;
  if (!disabled) button.addEventListener("click", onClick);
  return button;
}

/**
 * L'AVVISO CHE SOSTITUISCE LA SQUADRA. `role="alert"` e non un pannello muto:
 * chi arriva qui deve sapere subito che la pagina non sa, e i lettori di
 * schermo devono dirlo senza che si vada a cercarlo.
 */
function renderUnknownNotice(view: FormazioneView): HTMLElement {
  const notice = view.notice;
  const panel = document.createElement("section");
  panel.id = "formazione-stato-ignoto";
  panel.className = "panel";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-label", "Stato della squadra non noto");
  panel.style.cssText = `border:1px solid ${C.stopRedDark};display:flex;flex-direction:column;gap:10px;`;

  const title = sectionTitle(notice === null ? "STATO DELLA SQUADRA IGNOTO" : notice.title);
  title.style.cssText = `color:${C.stopRed};`;
  panel.appendChild(title);
  if (notice !== null) panel.appendChild(paragraph(notice.detail, `color:${C.textPrimary};`));
  panel.appendChild(
    paragraph(
      "Finché la squadra non è stata letta questa pagina non mostra nessuna formazione, nemmeno vuota, " +
        "e non permette di salvarne una: sarebbe una formazione costruita sopra il nulla. L'Asta resta " +
        "raggiungibile dalla barra qui sopra.",
      `color:${C.textSec};`,
    ),
  );
  return panel;
}

/* ────────────────────────────────────────────────────────────────────────────
   QUANDO QUESTA FORMAZIONE È STATA LETTA
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Il momento della lettura, come la pagina lo riceve.
 *
 * `null` soltanto quando non c'è nessuna formazione a schermo — con l'avviso di
 * canale al posto della squadra non c'è niente da datare. In ogni altro caso
 * questa fascia **c'è**: è la regola che questa schermata deve rispettare più di
 * ogni altra, ed è il motivo per cui il campo è obbligatorio nel contratto.
 */
export interface FormazioneLettura {
  /**
   * IL PEZZO «FORMAZIONE», in un campo suo, perché è quello che decide che cosa
   * la fascia DICHIARA: titolo, colore, allarme.
   *
   * Non sta dentro l'elenco per una ragione che questo file ha già pagato una
   * volta: prenderlo da lì significherebbe prenderlo per POSIZIONE, e la
   * posizione non è un'identità. L'ordine dei pezzi vive in un altro file
   * (`../formazioneLettura.ts`); il giorno in cui qualcuno lo riordina — una
   * modifica che nessun compilatore fermerebbe — la fascia comincerebbe a
   * mostrare l'età di un altro pezzo con le parole della formazione. Il pezzo
   * di cui la fascia parla si nomina.
   *
   * `freschezza` non è annullabile, e questa non è una comodità: la lettura
   * della formazione è obbligatoria nel contratto (`ObservedParts.lineup`),
   * quindi la sua età esiste sempre. Dirlo QUI è ciò che toglie al disegno il
   * bisogno di inventarsi un ripiego — un valore che il modello non ha mai
   * prodotto — per un caso che non può capitare.
   */
  readonly formazione: FormazioneParteDatata;
  /**
   * Gli altri pezzi del deposito, ognuno con la sua età. **Uno per pezzo**, e
   * nessuno si eredita: rose e calendario si rileggono di rado, la formazione
   * spesso, e presentare una rosa di tre settimane fa con l'età della
   * formazione sarebbe lo stesso difetto della formazione vecchia, in un altro
   * vestito.
   */
  readonly altre: readonly FormazioneParteLetta[];
  /** La giornata di Serie A che la lettura della formazione ha osservato. */
  readonly seriesMatchday: number;
  /** Le sfide di questa giornata, una per competizione. */
  readonly sfide: readonly FormazioneSfida[];
}

export interface FormazioneParteLetta {
  readonly nome: string;
  /** `null` = questo pezzo non è stato letto affatto. */
  readonly freschezza: LineupFreshness | null;
}

/** Un pezzo la cui lettura il contratto pretende sempre: l'età c'è, e basta. */
export interface FormazioneParteDatata extends FormazioneParteLetta {
  readonly freschezza: LineupFreshness;
}

/** L'avversario di questa giornata in una competizione, o perché non si sa. */
export interface FormazioneSfida {
  readonly competizione: string;
  readonly giornata: number | null;
  /** Nome dell'avversario, o il suo id quando il nome non è stato osservato. */
  readonly avversario: string;
  readonly campo: "casa" | "trasferta" | null;
  /** `false` = elencato ma rosa non letta. Mai «rosa vuota». */
  readonly rosaAvversarioLetta: boolean;
  /** Vuoto quando l'avversario c'è; altrimenti il motivo dichiarato. */
  readonly motivoAssenza: string;
}

/**
 * LA FASCIA DEL MOMENTO DELLA LETTURA — sopra le competizioni, mai in fondo.
 *
 * Sta qui e non in un piè di pagina perché è la cosa che cambia il significato
 * di tutto ciò che sta sotto: undici nomi non dicono da soli se sono quelli di
 * adesso, e chi legge la formazione deve incontrare la sua data **prima** di
 * fidarsene, non dopo averci creduto.
 *
 * Tre stati e tre voci diverse, perché sono tre cose diverse: una lettura
 * recente si annuncia e basta; una lettura vecchia **smette di essere presentata
 * come attuale** e lo dice con la stessa evidenza di un avviso; una lettura di
 * cui non si sa l'età dichiara di non saperlo — non promette e non accusa.
 */
function renderLettura(lettura: FormazioneLettura, prova: boolean): HTMLElement {
  // IL PEZZO SI PRENDE PER NOME, e la sua età non ha ripieghi: il modello la
  // porta sempre (vedi `FormazioneLettura.formazione`), quindi qui non c'è
  // niente da inventare — che è la regola di questo file, non una preferenza.
  const fresca: LineupFreshness = lettura.formazione.freschezza;
  const vecchia = fresca.kind === "non_attuale";
  const ignota = fresca.kind === "eta_ignota";
  const allarme = vecchia || ignota;

  const banda = document.createElement("section");
  banda.id = "formazione-momento-lettura";
  banda.className = "panel";
  banda.dataset.freschezza = fresca.kind;
  banda.setAttribute(allarme ? "role" : "aria-live", allarme ? "alert" : "polite");
  banda.setAttribute("aria-label", "Momento della lettura della formazione");
  banda.style.cssText =
    `display:flex;flex-direction:column;gap:6px;` +
    (allarme ? `border:1px solid ${C.stopRedDark};` : ``);

  const quando =
    fresca.kind === "eta_ignota" ? lineupAgeLabel(null) : lineupAgeLabel(fresca.ageMinutes);

  const titolo = sectionTitle(
    vecchia
      ? "QUESTA NON È NECESSARIAMENTE LA FORMAZIONE DI ADESSO"
      : ignota
        ? "NON SI SA QUANTO SIA RECENTE QUESTA LETTURA"
        : `LETTA DALLA LEGA ${quando.toUpperCase()}`,
  );
  if (allarme) titolo.style.cssText = `color:${C.stopRed};`;
  banda.appendChild(titolo);

  const corpo = vecchia
    ? `L'ultima lettura della lega risale a ${quando}, oltre i ${fresca.thresholdMinutes} minuti ` +
      `entro cui una lettura può ancora essere presentata come attuale. Quella qui sotto è la ` +
      `formazione di allora: da allora può essere cambiata sulla piattaforma, e questa pagina non ` +
      `lo saprebbe. Giornata di Serie A dell'ultima lettura: ${lettura.seriesMatchday}.`
    : ignota
      ? `Il momento di questa lettura non è confrontabile con l'ora di questo dispositivo, quindi ` +
        `non si può dire se sia recente. Non viene presentata come attuale: non perché sia vecchia, ` +
        `ma perché non si sa. Giornata di Serie A dell'ultima lettura: ${lettura.seriesMatchday}.`
      : `La formazione qui sotto è quella che la lega riportava ${quando}, alla giornata di Serie A ` +
        `${lettura.seriesMatchday}. Nessuna modifica fatta sulla piattaforma dopo quel momento è ` +
        `visibile qui.`;
  banda.appendChild(paragraph(corpo, `color:${allarme ? C.textPrimary : C.textSec};`));

  // OGNI PEZZO, CON LA SUA ETÀ. Una riga per pezzo, sempre tutte: togliere quelle
  // «normali» lascerebbe l'elenco a parlare solo dei guasti, e allora l'assenza
  // di una riga diventerebbe un'informazione che nessuno ha scritto.
  const elenco = document.createElement("ul");
  elenco.id = "formazione-momenti-per-pezzo";
  elenco.style.cssText = `margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:${C.textSec};`;
  // La formazione per prima, perché è il pezzo di cui la fascia sta parlando;
  // gli altri nell'ordine che il modello dichiara.
  for (const parte of [lettura.formazione, ...lettura.altre]) {
    const voce = document.createElement("li");
    const stato = parte.freschezza;
    if (stato === null) {
      voce.textContent = `${parte.nome}: non letta.`;
    } else if (stato.kind === "eta_ignota") {
      voce.textContent = `${parte.nome}: letta, ma non si sa quando.`;
    } else {
      const quandoParte = lineupAgeLabel(stato.ageMinutes);
      voce.textContent =
        stato.kind === "non_attuale"
          ? `${parte.nome}: ${quandoParte} — non più presentata come attuale.`
          : `${parte.nome}: ${quandoParte}.`;
    }
    if (stato !== null && stato.kind !== "attuale") voce.style.cssText = `color:${C.stopRed};`;
    elenco.appendChild(voce);
  }
  banda.appendChild(elenco);

  // CON CHI SI GIOCA. Sta qui, accanto al momento della lettura, perché è un
  // dato della stessa lettura e ha la stessa fragilità: un avversario di una
  // giornata vecchia è sbagliato quanto una formazione di una giornata vecchia.
  for (const sfida of lettura.sfide) {
    const riga = document.createElement("p");
    riga.style.cssText = `margin:0;font-size:13px;line-height:1.6;color:${C.textPrimary};`;
    const giornata = sfida.giornata === null ? "giornata non dichiarata" : `giornata ${sfida.giornata}`;
    if (sfida.motivoAssenza.length > 0) {
      riga.style.cssText += `color:${C.textSec};`;
      riga.textContent = `${sfida.competizione}, ${giornata} — ${sfida.motivoAssenza}`;
    } else {
      const dove =
        sfida.campo === null ? "" : sfida.campo === "casa" ? ", in casa" : ", in trasferta";
      const rosa = sfida.rosaAvversarioLetta
        ? "rosa avversaria letta"
        : "rosa avversaria non letta — non è una rosa vuota, è una lettura che non c'è";
      riga.textContent = `${sfida.competizione}, ${giornata} — contro ${sfida.avversario}${dove}. ${rosa}.`;
    }
    banda.appendChild(riga);
  }

  if (prova) {
    banda.appendChild(
      paragraph(
        "Questa è la data della squadra di esempio, inventata come tutto il resto di questa prova.",
        `color:${C.textSec};`,
      ),
    );
  }
  return banda;
}

/**
 * IL MARCHIO DELLA PROVA — nel corpo della pagina, e non richiudibile.
 *
 * Non è un avviso che si congeda: non ha nessun comando che lo tolga, e finché
 * la prova è accesa viene disegnato due volte, in testa e in coda alla pagina,
 * perché un ritaglio dello schermo non possa mostrare una formazione senza
 * mostrare anche che è finta. L'unico bottone che porta è quello che spegne la
 * prova, cioè che toglie i dati insieme al marchio — mai il marchio da solo.
 *
 * `role="alert"` in testa e `role="status"` in coda: è la stessa informazione
 * detta due volte, e farla annunciare due volte ai lettori di schermo sarebbe
 * rumore. Il primo è quello che deve interrompere.
 */
function renderProvaMarchio(prova: FormazioneProva, posizione: "testa" | "coda"): HTMLElement {
  const panel = document.createElement("section");
  panel.id = posizione === "testa" ? "formazione-prova-marchio" : "formazione-prova-marchio-coda";
  panel.className = "panel";
  panel.dataset.prova = "attiva";
  panel.setAttribute("role", posizione === "testa" ? "alert" : "status");
  panel.setAttribute("aria-label", PROVA_TITOLO);
  panel.style.cssText = `border:2px dashed ${C.textAccent};display:flex;flex-direction:column;gap:10px;`;

  const title = sectionTitle(PROVA_TITOLO);
  title.style.cssText = `color:${C.textAccent};`;
  panel.appendChild(title);
  panel.appendChild(paragraph(PROVA_SPIEGAZIONE, `color:${C.textPrimary};`));
  if (prova.nonPersistita) {
    panel.appendChild(paragraph(PROVA_NON_PERSISTITA, `color:${C.textDim};font-size:12px;`));
  }

  if (posizione === "testa") {
    panel.appendChild(
      commandButton(
        "formazione-prova-esci",
        PROVA_TESTO_USCITA,
        "Esci dalla prova e torna a quello che la lega riporta",
        false,
        prova.onEsci,
      ),
    );
  }
  return panel;
}

/**
 * L'INVITO A PROVARE, accanto all'avviso e mai al posto suo.
 *
 * Chi non lo tocca continua a vedere esattamente la pagina di prima: nessun
 * dato finto compare finché qualcuno non lo chiede, ed è la prima delle quattro
 * difese descritte in `src/formazioneProva.ts`.
 */
function renderProvaInvito(prova: FormazioneProva): HTMLElement {
  const box = document.createElement("div");
  box.id = "formazione-prova-invito";
  box.style.cssText = `border:1px solid ${C.border};border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:10px;`;
  box.appendChild(paragraph(PROVA_INVITO, `color:${C.textSec};`));
  box.appendChild(
    commandButton(
      "formazione-prova-entra",
      PROVA_TESTO_COMANDO,
      PROVA_TESTO_COMANDO,
      false,
      prova.onEntra,
    ),
  );
  return box;
}

/**
 * DUE COMPETIZIONI INDISTINGUIBILI SI DICHIARANO, NON SI DISEGNANO DUE VOLTE.
 *
 * Il modello ha già tenuto la prima e scartato le altre (`FormazioneView.duplicated`):
 * qui non si sceglie niente, si dice che è successo. Il pannello scartato non
 * può sparire in silenzio — sarebbe una partita che nessuno sa di non aver
 * schierato — e non può nemmeno essere disegnato, perché ne uscirebbero due
 * bottoni «Salva» indistinguibili sopra la stessa chiave.
 */
function renderDuplicateNotice(duplicated: readonly string[]): HTMLElement {
  const box = document.createElement("section");
  box.id = "formazione-competizioni-duplicate";
  box.className = "panel";
  box.setAttribute("role", "alert");
  box.setAttribute("aria-label", "Competizioni con lo stesso identificativo");
  box.style.cssText = `border:1px solid ${C.stopRedDark};display:flex;flex-direction:column;gap:8px;`;
  const title = sectionTitle("DUE COMPETIZIONI CON LO STESSO IDENTIFICATIVO");
  title.style.cssText = `color:${C.stopRed};`;
  box.appendChild(title);
  box.appendChild(
    paragraph(
      "La lettura riporta più di una competizione con lo stesso identificativo: " +
        `${duplicated.join(", ")}. Da qui non si possono distinguere — i vincoli, le modifiche e ` +
        "il salvataggio le userebbero tutte come se fossero una sola — quindi ne viene mostrata " +
        "la prima e le altre NON sono in questa pagina. Non sono state schierate e non sono state " +
        "salvate: se sono due partite diverse, vanno schierate sulla piattaforma finché la lettura " +
        "non le distingue.",
      `color:${C.textPrimary};`,
    ),
  );
  return box;
}

/** L'elenco delle violazioni, quando ce ne sono. Testo, non colore soltanto. */
function renderViolations(
  id: string,
  label: string,
  violations: readonly SubmissionViolation[],
  color: string,
): HTMLElement | null {
  if (violations.length === 0) return null;
  const wrap = document.createElement("div");
  wrap.id = id;
  wrap.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
  wrap.appendChild(smallHeading(label, color));
  const list = document.createElement("ul");
  list.style.cssText = `margin:0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
  list.innerHTML = violations
    .map((violation) => `<li><strong>${escHtml(violation.code)}</strong> — ${escHtml(violation.message)}</li>`)
    .join("");
  wrap.appendChild(list);
  return wrap;
}

function renderDifferences(differences: readonly LineupDifference[]): HTMLElement | null {
  if (differences.length === 0) return null;
  const list = document.createElement("ul");
  list.id = "formazione-differenze";
  list.style.cssText = `margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
  list.innerHTML = differences
    .map((difference) => {
      const dove = difference.index === null ? difference.field : `${difference.field}[${difference.index}]`;
      return `<li>${escHtml(dove)}: voluto <strong>${escHtml(String(difference.a))}</strong>, riletto <strong>${escHtml(String(difference.b))}</strong></li>`;
    })
    .join("");
  return list;
}

/**
 * I TRE STATI DELL'INVIO, scritti a parole e non affidati a un colore.
 *
 * «da inviare» non dice mai «salvato»: se nulla è partito, il bottone che dice
 * il contrario è il difetto peggiore che questa pagina possa avere — chi legge
 * crederebbe di essere schierato e non lo è.
 */
function renderSubmissionState(save: FormazioneSaveState, prova: boolean): HTMLElement {
  // IN PROVA IL SALVATAGGIO NON FINGE, E NEMMENO IL SUO CONTRARIO. La regola —
  // l'etichetta della prova copre solo lo stato in cui nulla è partito — vive in
  // `etichettaProvaVale` e non in questa espressione: qui era una condizione
  // scritta dentro una funzione di render, cioè una promessa che si poteva
  // provare solo con un browser e che nessuna prova sorvegliava.
  const inProva = etichettaProvaVale(prova, save.state.kind);
  const box = document.createElement("div");
  box.id = "formazione-stato-invio";
  box.dataset.stato = save.state.kind;
  if (inProva) box.dataset.prova = "attiva";
  box.setAttribute("role", "status");
  const colore = inProva
    ? C.textAccent
    : save.state.kind === "inviato_confermato"
      ? C.green
      : save.state.kind === "inviato_esito_ignoto"
        ? C.stopRed
        : C.textSec;
  box.style.cssText = `border:1px solid ${colore};border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;`;

  const etichetta = document.createElement("div");
  etichetta.id = "formazione-stato-invio-etichetta";
  etichetta.style.cssText = `font-size:12px;font-weight:800;letter-spacing:0.06em;color:${colore};`;
  etichetta.textContent = inProva
    ? PROVA_ETICHETTA_SALVATAGGIO
    : save.state.kind === "inviato_confermato"
      ? "INVIATA E CONFERMATA DALLA PIATTAFORMA"
      : save.state.kind === "inviato_esito_ignoto"
        ? "INVIATA, ESITO IGNOTO"
        : "DA INVIARE — NULLA È PARTITO";
  box.appendChild(etichetta);
  if (inProva) box.appendChild(paragraph(PROVA_ESITO_SALVATAGGIO, `color:${C.textPrimary};`));
  box.appendChild(paragraph(save.state.reason, `color:${C.textMid};`));

  if (save.state.kind === "inviato_esito_ignoto") {
    const differenze = renderDifferences(save.state.differences);
    if (differenze !== null) box.appendChild(differenze);
  }

  const bloccanti = renderViolations(
    "formazione-violazioni-bloccanti",
    "PERCHÉ NON È PARTITO",
    save.blocking,
    C.stopRed,
  );
  if (bloccanti !== null) box.appendChild(bloccanti);
  const avvertimenti = renderViolations(
    "formazione-avvertimenti",
    "CIÒ CHE NON SI È POTUTO VERIFICARE",
    save.warnings,
    C.textAccent,
  );
  if (avvertimenti !== null) box.appendChild(avvertimenti);

  return box;
}

/**
 * COME LETTA, OPPURE MODIFICATA E NON ANCORA MANDATA — e il gesto solo che
 * riporta indietro.
 *
 * È la riga che questa pagina non può permettersi di non avere: le due
 * formazioni si assomigliano, e credere di guardare quella schierata mentre si
 * guarda una modifica mai inviata vale una giornata.
 */
function renderDraftState(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const box = document.createElement("div");
  box.id = `formazione-modifica-${competition.competitionId}`;
  box.dataset.modificata = competition.modified ? "si" : "no";
  box.setAttribute("role", "status");
  const colore = competition.modified ? C.textAccent : C.textSec;
  box.style.cssText = `border:1px solid ${colore};border-radius:8px;padding:10px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;`;

  const etichetta = document.createElement("div");
  etichetta.id = `formazione-modifica-etichetta-${competition.competitionId}`;
  etichetta.style.cssText = `font-size:12px;font-weight:800;letter-spacing:0.06em;color:${colore};`;
  etichetta.textContent = competition.modified
    ? "MODIFICATA — NON ANCORA INVIATA"
    : "COME LETTA DALLA PIATTAFORMA";
  box.appendChild(etichetta);

  box.appendChild(
    paragraph(
      competition.modified
        ? "Quello che vedi non è quello che la piattaforma riporta: finché non premi Salva, là c'è ancora la formazione di prima."
        : "Quello che vedi è quello che la piattaforma riporta adesso.",
      `flex:1 1 240px;color:${C.textMid};`,
    ),
  );

  box.appendChild(
    commandButton(
      `formazione-annulla-${competition.competitionId}`,
      "Annulla le modifiche",
      `Annulla le modifiche e torna alla formazione letta — ${competition.label}`,
      !competition.modified,
      () => handlers.onResetLineup(competition.competitionId),
    ),
  );
  return box;
}

/**
 * PERCHÉ QUESTO MODULO NON SI PUÒ SCHIERARE ADESSO. Vuoto = si può.
 *
 * Sta in una funzione sola perché è la stessa domanda per tutti e sette i
 * riquadri, e perché la risposta finisce in due posti — il bottone spento e la
 * riga che ne dice il motivo — che non devono poter dire due cose diverse.
 *
 * IL MODULO BLOCCATO NON COMPARE FRA LE RAGIONI, ed è deliberato: schierarne un
 * altro CONTRADDICE quel vincolo, e una contraddizione fra due volontà della
 * stessa persona la scioglie lei (`renderConflict`). Spegnere il bottone
 * toglierebbe la domanda insieme alla risposta.
 */
function moduloImpedito(
  competition: FormazioneCompetitionView,
  module: Module,
): string {
  const lineup = competition.lineup;
  if (lineup === null) return "non c'è nessuna formazione da schierare";
  if (competition.unavailableReason.length > 0) return competition.unavailableReason;
  if (!competition.editable) return "la formazione è blindata";
  if (lineup.module === module) return "è il modulo con cui è schierata adesso";
  if (competition.allowedModules === null) {
    return "la lega non ha dichiarato quali moduli ammette";
  }
  if (!competition.allowedModules.includes(module)) {
    return "la lega non lo dichiara schierabile";
  }
  return "";
}

/** La riga corta che sta sotto la chiave del modulo. Vuota è la norma. */
function moduloEtichetta(
  competition: FormazioneCompetitionView,
  module: Module,
  impedito: string,
): string {
  if (competition.lineup?.module === module) return "schierato";
  if (competition.constraints.lockedModule === module) return "bloccato";
  if (impedito === "la lega non lo dichiara schierabile") return "non ammesso";
  if (impedito === "la lega non ha dichiarato quali moduli ammette") return "non dichiarati";
  if (impedito.length > 0) return "non si cambia";
  return "";
}

/**
 * LA BARRA DEI MODULI — sette riquadri, sempre tutti e sette, mai una tendina.
 *
 * PERCHÉ TUTTI E SETTE. Un modulo che sparisce dalla barra non dice a nessuno
 * perché è sparito: chi cerca il 3-5-2 e non lo trova non sa se la lega lo
 * vieta, se lo vieta un suo vincolo, o se ha guardato male. Restano quindi a
 * schermo tutti — sono i sette di §9, che sono il regolamento e non una lista
 * scritta a mano qui — e quello che non si può schiera adesso è SPENTO con il
 * motivo scritto sotto.
 *
 * E LA REGOLA DI PRIMA NON SI PIEGA: quando la lega non dichiara quali moduli
 * ammette, da qui il modulo NON si cambia. Non si offre una scelta fra opzioni
 * che nessuno ha osservato — sarebbe un invio respinto là, deciso qui — e la
 * differenza rispetto a prima è solo che il divieto adesso si vede invece di
 * essere l'assenza di una tendina.
 */
function renderModuleBar(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const barra = document.createElement("div");
  barra.id = `formazione-modulo-schierato-${competition.competitionId}`;
  barra.setAttribute("role", "group");
  barra.setAttribute("aria-label", `Modulo schierato — ${competition.label}`);
  barra.style.cssText = `display:flex;flex-wrap:wrap;gap:6px;`;

  for (const module of MODULES) {
    const impedito = moduloImpedito(competition, module);
    const attivo = competition.lineup?.module === module;
    const etichetta = moduloEtichetta(competition, module, impedito);

    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.id = `formazione-modulo-schierato-${competition.competitionId}-${module}`;
    bottone.disabled = impedito.length > 0;
    bottone.dataset.modulo = module;
    bottone.dataset.attivo = attivo ? "si" : "no";
    bottone.setAttribute("aria-pressed", attivo ? "true" : "false");
    bottone.setAttribute(
      "aria-label",
      impedito.length > 0
        ? `Modulo ${module} — non schierabile: ${impedito}`
        : `Schiera il modulo ${module} — ${competition.label}`,
    );
    bottone.style.cssText =
      `display:flex;flex-direction:column;align-items:center;gap:2px;min-width:58px;` +
      `padding:5px 9px;border-radius:8px;font-family:${C.mono};cursor:${bottone.disabled ? "default" : "pointer"};` +
      `background:${attivo ? C.accentDim : C.panelInner};` +
      `border:1px solid ${attivo ? C.textAccent : C.border};` +
      `color:${attivo ? C.textPrimary : C.textMid};` +
      (bottone.disabled && !attivo ? "opacity:0.5;" : "");

    const chiave = document.createElement("span");
    chiave.style.cssText = `font-size:14px;font-weight:800;letter-spacing:0.04em;`;
    chiave.textContent = module;
    bottone.appendChild(chiave);

    // IL MOTIVO SI LEGGE, non si scopre passandoci sopra: un `title` non esiste
    // per chi ha un dito al posto del mouse, ed è precisamente chi ha più
    // bisogno di sapere perché un bottone è spento.
    const nota = document.createElement("span");
    nota.style.cssText = `font-size:9px;letter-spacing:0.04em;text-transform:uppercase;color:${attivo ? C.textSec : C.textDim};min-height:11px;`;
    nota.textContent = etichetta;
    bottone.appendChild(nota);

    if (!bottone.disabled) {
      bottone.addEventListener("click", () =>
        handlers.onSetModule(competition.competitionId, module),
      );
    }
    barra.appendChild(bottone);
  }
  return barra;
}

/**
 * IL MODULO CON CUI SI SCHIERA, e le due opzioni della formazione.
 *
 * L'ELENCO DEI MODULI VIENE DALLA LEGA, non da una costante di questo file: se
 * la lega non lo dichiara la pagina lo DICE e non lascia scegliere, perché una
 * scelta fra opzioni mai osservate produrrebbe un invio respinto là — e chi ha
 * scelto non saprebbe nemmeno di aver scelto fra opzioni inventate.
 */
function renderLineupControls(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = `formazione-comandi-${competition.competitionId}`;
  wrap.style.cssText = `display:flex;flex-direction:column;gap:10px;border:1px solid ${C.border};border-radius:8px;padding:10px 14px;`;
  wrap.appendChild(smallHeading("LA FORMAZIONE DI QUESTA GIORNATA", C.textSec));

  const lineup = competition.lineup;
  const allowed = competition.allowedModules;

  wrap.appendChild(smallHeading("MODULO SCHIERATO", C.textSec));
  wrap.appendChild(renderModuleBar(competition, handlers));

  if (allowed === null) {
    const riga = paragraph(
      `Schierata con «${lineup === null ? "—" : lineup.module}». La lega non ha dichiarato quali moduli ammette: ` +
        "da qui il modulo non si cambia, perché l'unica lista possibile sarebbe inventata.",
      `color:${C.textAccent};`,
    );
    riga.id = `formazione-moduli-non-dichiarati-${competition.competitionId}`;
    wrap.appendChild(riga);
  } else {
    // Il modulo con cui si è schierati adesso resta a schermo, e acceso, anche
    // se la lega non lo dichiara più: nasconderlo mostrerebbe una barra che
    // dice una cosa diversa dalla formazione che le sta accanto. Che sia fuori
    // elenco lo dice questa riga insieme alla violazione bloccante.
    const fuoriElenco = lineup !== null && !allowed.includes(lineup.module);
    wrap.appendChild(
      paragraph(
        `moduli dichiarati dalla lega: ${allowed.join(", ")}` +
          (fuoriElenco
            ? ` — la formazione è schierata con «${lineup.module}», che la lega non dichiara più`
            : ""),
        `font-size:12px;color:${fuoriElenco ? C.textAccent : C.textDim};`,
      ),
    );
  }

  wrap.appendChild(
    renderFlag(
      competition,
      handlers,
      "hidden",
      `formazione-nascosta-${competition.competitionId}`,
      "Formazione nascosta",
      "Gli avversari non vedono chi hai schierato finché la formazione non si chiude.",
    ),
  );
  wrap.appendChild(
    renderFlag(
      competition,
      handlers,
      "allCompetitions",
      `formazione-tutte-competizioni-${competition.competitionId}`,
      "Vale per tutte le competizioni",
      "La piattaforma usa questa formazione anche per l'altra partita di giornata. Resta però " +
        "calcolata contro un avversario solo: l'effetto sull'altra si vede rileggendo quella formazione.",
    ),
  );
  return wrap;
}

/** Una delle due opzioni, con scritto accanto che cosa fa davvero. */
function renderFlag(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  flag: keyof LineupFlags,
  id: string,
  label: string,
  spiegazione: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:flex-start;gap:8px;`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = competition.lineup !== null && competition.lineup.flags[flag];
  input.disabled = !competition.editable || competition.lineup === null;
  input.style.cssText = "margin-top:3px;";
  input.addEventListener("change", () =>
    handlers.onSetFlag(competition.competitionId, flag, input.checked),
  );
  wrap.appendChild(input);

  const testo = document.createElement("div");
  const etichetta = document.createElement("label");
  etichetta.setAttribute("for", id);
  etichetta.style.cssText = `font-size:13px;color:${C.textPrimary};display:block;`;
  etichetta.textContent = label;
  testo.appendChild(etichetta);
  testo.appendChild(paragraph(spiegazione, `font-size:12px;color:${C.textDim};margin-top:2px;`));
  wrap.appendChild(testo);

  return wrap;
}

/** Il selettore del modulo BLOCCATO, con l'interruttore «blindata» accanto. */
function renderModuleControl(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:12px;`;

  const selectId = `formazione-modulo-${competition.competitionId}`;
  const label = document.createElement("label");
  label.setAttribute("for", selectId);
  label.style.cssText = `font-size:12px;font-weight:700;letter-spacing:0.05em;color:${C.textSec};`;
  label.textContent = "MODULO BLOCCATO";
  wrap.appendChild(label);

  const select = document.createElement("select");
  select.id = selectId;
  select.disabled = !competition.editable;
  select.style.cssText = `background:${C.panelInner};color:${C.textPrimary};border:1px solid ${C.border};border-radius:6px;padding:5px 8px;font-size:13px;`;
  const nessuno = document.createElement("option");
  nessuno.value = "";
  nessuno.textContent = "nessun blocco";
  select.appendChild(nessuno);
  // Quando la lega dichiara i moduli si blocca solo fra quelli: bloccarne uno
  // che la lega non ammette sarebbe una preferenza destinata alla quarantena.
  // Quando non li dichiara restano i sette di §9, che sono il regolamento e non
  // una lista scritta a mano qui.
  for (const module of competition.allowedModules ?? MODULES) {
    const option = document.createElement("option");
    option.value = module;
    option.textContent = module;
    select.appendChild(option);
  }
  select.value = competition.constraints.lockedModule ?? "";
  select.addEventListener("change", () => {
    const value = select.value;
    handlers.onSetLockedModule(
      competition.competitionId,
      value === "" ? null : (value as Module),
    );
  });
  wrap.appendChild(select);

  const attuale = document.createElement("span");
  attuale.style.cssText = `font-size:12px;color:${C.textDim};`;
  attuale.textContent =
    competition.lineup === null
      ? "nessun modulo schierato dalla lega"
      : `schierato adesso: ${competition.lineup.module}`;
  wrap.appendChild(attuale);

  return wrap;
}

/** L'interruttore «formazione intera non modificabile». */
function renderLockControl(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const id = `formazione-blindata-${competition.competitionId}`;
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:center;gap:8px;`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = competition.constraints.locked;
  input.disabled = competition.unavailableReason.length > 0;
  input.addEventListener("change", () => handlers.onToggleLocked(competition.competitionId));
  wrap.appendChild(input);

  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.style.cssText = `font-size:13px;color:${C.textMid};`;
  label.textContent = "Formazione intera non modificabile";
  wrap.appendChild(label);

  return wrap;
}

/**
 * IL CONFLITTO FRA UNA MODIFICA E UN VINCOLO, con la decisione in mano a chi ha
 * messo il vincolo.
 *
 * Due bottoni e nessuna scorciatoia: né eseguire in silenzio calpestando la
 * spunta, né rifiutare senza dire quale spunta ha rifiutato.
 */
function renderConflict(
  competition: FormazioneCompetitionView,
  conflict: ConstraintConflict,
  handlers: FormazioneHandlers,
): HTMLElement {
  const box = document.createElement("div");
  box.id = `formazione-conflitto-${competition.competitionId}`;
  box.dataset.conflitto = conflict.kind;
  box.setAttribute("role", "alert");
  box.style.cssText = `border:1px solid ${C.textAccent};border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;`;
  box.appendChild(smallHeading("QUESTA MODIFICA CONTRADDICE UN VINCOLO CHE HAI MESSO", C.textAccent));
  box.appendChild(paragraph(conflict.message, `color:${C.textPrimary};`));
  box.appendChild(paragraph(`Se procedi: ${conflict.ifRemoved}.`, `color:${C.textMid};`));

  const comandi = document.createElement("div");
  comandi.style.cssText = `display:flex;flex-wrap:wrap;gap:10px;`;
  comandi.appendChild(
    commandButton(
      `formazione-conflitto-procedi-${competition.competitionId}`,
      "Togli il vincolo e procedi",
      `Togli il vincolo e applica la modifica — ${competition.label}`,
      false,
      () => handlers.onResolveConflict(competition.competitionId, true),
    ),
  );
  comandi.appendChild(
    commandButton(
      `formazione-conflitto-lascia-${competition.competitionId}`,
      "Lascia tutto com'è",
      `Tieni il vincolo e annulla la modifica — ${competition.label}`,
      false,
      () => handlers.onResolveConflict(competition.competitionId, false),
    ),
  );
  box.appendChild(comandi);
  return box;
}

/**
 * LA LEGALITÀ DI CIÒ CHE SI VEDE, adesso e non al salvataggio.
 *
 * Tutte le violazioni insieme, mai una alla volta: correggere e riprovare a
 * ripetizione è il difetto che questa validazione esiste per evitare.
 */
function renderLegality(competition: FormazioneCompetitionView): HTMLElement | null {
  if (competition.lineup === null) return null;
  const legality = competition.legality;
  const box = document.createElement("div");
  box.id = `formazione-legalita-${competition.competitionId}`;
  box.dataset.esito = legality.kind;

  if (legality.kind === "non_verificabile") {
    box.setAttribute("role", "alert");
    box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
    box.appendChild(smallHeading("LEGALITÀ NON VERIFICABILE DA QUI", C.stopRed));
    box.appendChild(paragraph(legality.reason, `color:${C.textMid};margin-top:4px;`));
    return box;
  }

  if (legality.blocking.length === 0 && legality.warnings.length === 0) {
    box.setAttribute("role", "status");
    box.style.cssText = `border:1px solid ${C.border};border-radius:8px;padding:8px 12px;`;
    box.appendChild(smallHeading("LEGALE PER TUTTO CIÒ CHE SI È POTUTO VERIFICARE", C.green));
    return box;
  }

  box.setAttribute("role", legality.blocking.length > 0 ? "alert" : "status");
  box.style.cssText = `border:1px solid ${legality.blocking.length > 0 ? C.stopRedDark : C.border};border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:8px;`;
  const bloccanti = renderViolations(
    `formazione-legalita-bloccanti-${competition.competitionId}`,
    "COSÌ NON SI PUÒ MANDARE",
    legality.blocking,
    C.stopRed,
  );
  if (bloccanti !== null) box.appendChild(bloccanti);
  const avvisi = renderViolations(
    `formazione-legalita-avvertimenti-${competition.competitionId}`,
    "CIÒ CHE NON SI È POTUTO VERIFICARE — NON FERMA NIENTE",
    legality.warnings,
    C.textAccent,
  );
  if (avvisi !== null) box.appendChild(avvisi);
  return box;
}

/** I codici che nominano ogni giocatore, per metterli sulla riga giusta. */
function codesByPlayer(competition: FormazioneCompetitionView): ReadonlyMap<string, string[]> {
  const map = new Map<string, string[]>();
  const push = (playerId: string, code: string): void => {
    const elenco = map.get(playerId) ?? [];
    if (!elenco.includes(code)) elenco.push(code);
    map.set(playerId, elenco);
  };
  for (const issue of [...competition.issues.rejections, ...competition.issues.warnings]) {
    for (const playerId of issue.playerIds) push(playerId, issue.code);
  }
  // Le violazioni dell'invio nominano il giocatore dentro il messaggio, non in
  // un campo: si mette il codice sulla riga di chi compare nel testo, che è
  // l'unico legame che il contratto espone e non uno inventato qui.
  if (competition.legality.kind === "verificata") {
    for (const violation of [...competition.legality.blocking, ...competition.legality.warnings]) {
      for (const player of competition.players) {
        if (violation.message.includes(`«${player.id}»`)) push(player.id, violation.code);
      }
    }
  }
  return map;
}

/* ────────────────────────────────────────────────────────────────────────────
   IL CAMPO, LA PANCHINA, I NON CONVOCATI — un gettone solo, quattro posti

   Tutto ciò che sta qui sotto disegna la stessa cosa in posti diversi: un
   giocatore che si può prendere e posare. Un gettone solo, e non quattro
   disegni che si assomigliano, perché è la stessa cosa: la differenza fra
   essere in campo ed essere in panchina la porta il modello (`place`), e i
   comandi che ne conseguono si scelgono da lì.
   ──────────────────────────────────────────────────────────────────────────── */

/** Il giocatore che si ha in mano su QUESTA competizione, o `null`. */
function inMano(competition: FormazioneCompetitionView, presa: FormazionePresa): string | null {
  return presa.competitionId === competition.competitionId ? presa.playerId : null;
}

/** I ruoli della rosa mostrata, per dare i posti del campo a `pitchLayout`. */
function ruoliMostrati(competition: FormazioneCompetitionView): ReadonlyMap<string, Role> {
  // Non è una derivazione: è la stessa rosa del modello, indicizzata per id
  // perché `pitchLayout` la chiede così. Nessun ruolo viene dedotto qui, e uno
  // che il modello non porta resta assente — è quello che rende un titolare
  // «senza posto» invece di metterlo in una linea indovinata.
  return new Map(competition.players.map((player) => [player.id, player.role]));
}

/**
 * DOVE STA, DETTO A PAROLE. Serve alle etichette dei lettori di schermo: chi non
 * vede il campo deve sapere dal testo quello che il verde dice a colpo d'occhio.
 */
function postoInParole(place: FormazionePlayerRow["place"]): string {
  return place === "porta"
    ? "in porta"
    : place === "titolare"
      ? "in campo"
      : place === "panchina"
        ? "in panchina"
        : "fuori dai convocati";
}

/**
 * LA POSA — che cosa succede quando si lascia andare qualcuno su un bersaglio.
 *
 * Una funzione sola, e non due, perché il trascinamento e il tocco DEVONO fare
 * la stessa cosa: due strade che portano allo stesso gesto sono una promessa, e
 * due elenchi di `if` scritti in due punti diversi la rompono al primo cambio.
 * Chi chiama passa il giocatore da posare — la presa nel caso del tocco, il
 * carico del trascinamento nel caso del mouse — e riceve il gesto già scelto.
 */
type Bersaglio =
  | { readonly kind: "gettone"; readonly playerId: string }
  /**
   * LA CASELLA VUOTA PORTA SÉ STESSA, e non è un dettaglio: `fillSlot` vuole
   * sapere QUALE posto, perché una casella libera in difesa dice che il modulo
   * aspetta ancora un difensore, e la ricontrolla contro il campo di adesso —
   * una casella di un disegno precedente descriverebbe una formazione che non
   * c'è più.
   */
  | { readonly kind: "posto_vuoto"; readonly slot: PitchSlot }
  | { readonly kind: "panchina" }
  | { readonly kind: "fuori" };

function posaSuBersaglio(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  bersaglio: Bersaglio,
  playerId: string,
): void {
  const competitionId = competition.competitionId;
  if (bersaglio.kind === "gettone") {
    // Posare qualcuno su sé stesso è lasciarlo: non è una mossa, e chiamare
    // `onSwap` produrrebbe un rifiuto scritto per una cosa che nessuno ha
    // sbagliato.
    if (bersaglio.playerId === playerId) {
      handlers.onPrendi(competitionId, null);
      return;
    }
    handlers.onSwap(competitionId, playerId, bersaglio.playerId);
    return;
  }
  if (bersaglio.kind === "posto_vuoto") {
    handlers.onFillSlot(competitionId, playerId, bersaglio.slot);
    return;
  }
  if (bersaglio.kind === "panchina") {
    handlers.onMoveToBench(competitionId, playerId);
    return;
  }
  handlers.onMoveOutside(competitionId, playerId);
}

/**
 * IL TRASCINAMENTO, appoggiato sopra i comandi che esistono già.
 *
 * `dragstart` non chiama nessun gesto e non fa ridisegnare niente: un `render()`
 * qui staccherebbe dal documento l'elemento che si sta trascinando, cioè
 * romperebbe il trascinamento nel suo primo millisecondo. Chi si sta muovendo
 * viaggia nel `dataTransfer`, che è il posto che il browser gli dà.
 *
 * `dragover` accetta senza guardare il carico — durante il trascinamento il
 * contenuto non è leggibile, è una regola del browser e non una scorciatoia —
 * e una posa che non ha senso finisce dove finiscono tutte le mosse che non
 * esistono: in un rifiuto dichiarato, con il motivo scritto.
 */
function rendiTrascinabile(elemento: HTMLElement, playerId: string): void {
  elemento.draggable = true;
  elemento.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", playerId);
    if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = "move";
  });
}

function rendiBersaglio(
  elemento: HTMLElement,
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  bersaglio: Bersaglio,
): void {
  elemento.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
  });
  elemento.addEventListener("drop", (event) => {
    event.preventDefault();
    // IL BERSAGLIO PIÙ INTERNO VINCE, E DA SOLO. Un gettone di panchina sta
    // dentro la striscia della panchina, e tutte e due sono bersagli: senza
    // questa riga una posa su un gettone eseguirebbe PRIMA lo scambio e POI il
    // «manda in panchina» della striscia sotto, cioè due mosse per un gesto, di
    // cui la seconda disfa la prima.
    event.stopPropagation();
    const playerId = event.dataTransfer?.getData("text/plain") ?? "";
    if (playerId.length === 0) return;
    posaSuBersaglio(competition, handlers, bersaglio, playerId);
  });
}

/**
 * IL GETTONE DEL GIOCATORE — un bottone vero, e il gesto principale della pagina.
 *
 * Un bottone e non un `div` con un `click`: si raggiunge con Tab, si preme con
 * Invio e con la barra, e i lettori di schermo lo annunciano per quello che è.
 * `aria-pressed` dice se è quello che si ha in mano, così lo stato della presa
 * non è affidato al solo colore del bordo.
 *
 * CHE COSA FA PREMERLO dipende da che cosa si ha in mano, e l'etichetta lo dice
 * sempre per esteso invece di lasciarlo indovinare: niente in mano lo prende;
 * sé stesso lo lascia; qualcun altro li scambia.
 */
function renderPlayerToken(
  competition: FormazioneCompetitionView,
  player: FormazionePlayerRow,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  presa: FormazionePresa,
): HTMLButtonElement {
  const held = inMano(competition, presa);
  const preso = held === player.id;
  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.id = `formazione-${competition.competitionId}-${player.id}-gettone`;
  bottone.className = "formazione-gettone";
  bottone.dataset.posto = player.place;
  bottone.dataset.ruolo = player.role;
  bottone.dataset.preso = preso ? "si" : "no";
  bottone.disabled = !competition.editable;
  bottone.setAttribute("aria-pressed", preso ? "true" : "false");

  const ruolo = ROLE_LABEL[player.role] ?? player.role;
  const disponibilita = player.availability === undefined ? "" : `, ${player.availability}`;
  const chiSono = `«${player.id}», ${ruolo}, ${postoInParole(player.place)}${disponibilita}`;
  bottone.setAttribute(
    "aria-label",
    !competition.editable
      ? `${chiSono} — la formazione non si modifica`
      : preso
        ? `Lascia ${chiSono}`
        : held === null
          ? `Prendi ${chiSono}`
          : `Scambia «${held}» con ${chiSono}`,
  );

  const bordo = preso ? C.textAccent : player.locked ? C.accent : C.border;
  bottone.style.cssText =
    `display:flex;flex-direction:column;align-items:stretch;gap:3px;width:100%;` +
    `padding:6px 7px;border-radius:8px;text-align:left;` +
    `background:${C.panel};border:${preso ? "2px" : "1px"} solid ${bordo};` +
    `cursor:${bottone.disabled ? "default" : "grab"};` +
    (bottone.disabled ? "opacity:0.6;" : "");

  const testa = document.createElement("span");
  testa.style.cssText = `display:flex;align-items:center;gap:5px;`;
  testa.appendChild(renderRoleChip(player.role));
  const nome = document.createElement("span");
  nome.style.cssText = `font-family:${C.mono};font-size:11px;font-weight:700;color:${C.textPrimary};overflow-wrap:anywhere;line-height:1.25;`;
  nome.textContent = player.id;
  testa.appendChild(nome);
  bottone.appendChild(testa);

  // I SEGNI CHE IL MODELLO PORTA, e nessun altro. La disponibilità è quella che
  // la lega ha dichiarato, la spunta è quella che qualcuno ha messo: qui non
  // nasce nessun giudizio nuovo sopra un dato mancante.
  const segni = document.createElement("span");
  segni.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:9.5px;line-height:1.3;`;
  if (player.availability !== undefined) {
    const stato = document.createElement("span");
    const colore =
      player.availability === "indisponibile"
        ? C.stopRed
        : player.availability === "in_dubbio"
          ? C.textAccent
          : C.textDim;
    stato.style.cssText = `color:${colore};letter-spacing:0.03em;`;
    stato.textContent = player.availability;
    segni.appendChild(stato);
  }
  if (player.locked) {
    const spunta = document.createElement("span");
    spunta.style.cssText = `color:${C.textAccent};font-weight:700;letter-spacing:0.03em;`;
    spunta.textContent = "lo voglio in campo";
    segni.appendChild(spunta);
  }
  const codici = codes.get(player.id) ?? [];
  if (codici.length > 0) {
    const nota = document.createElement("span");
    nota.className = "formazione-riga__motivo";
    nota.style.cssText = `font-family:${C.mono};color:${C.stopRed};`;
    nota.textContent = codici.join(" ");
    segni.appendChild(nota);
  }
  if (segni.childElementCount > 0) bottone.appendChild(segni);

  if (!bottone.disabled) {
    bottone.addEventListener("click", () => {
      if (held === null) {
        handlers.onPrendi(competition.competitionId, player.id);
        return;
      }
      posaSuBersaglio(
        competition,
        handlers,
        { kind: "gettone", playerId: player.id },
        held,
      );
    });
  }
  return bottone;
}

/** La spunta «lo voglio in campo», legata al suo controllo e mai a un colore. */
function renderSpunta(
  competition: FormazioneCompetitionView,
  player: FormazionePlayerRow,
  handlers: FormazioneHandlers,
): HTMLElement {
  const id = `formazione-spunta-${competition.competitionId}-${player.id}`;
  const wrap = document.createElement("span");
  wrap.style.cssText = `display:flex;align-items:center;gap:4px;`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = player.locked;
  input.disabled = !competition.editable;
  input.style.cssText = "margin:0;width:13px;height:13px;flex:none;";
  input.setAttribute("aria-label", `«${player.id}» — lo voglio in campo`);
  input.addEventListener("change", () =>
    handlers.onToggleLockedStarter(competition.competitionId, player.id),
  );
  wrap.appendChild(input);

  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.style.cssText = `font-size:9.5px;letter-spacing:0.03em;color:${C.textSec};cursor:pointer;`;
  label.textContent = "voglio";
  wrap.appendChild(label);
  return wrap;
}

/** Un bottone di comando piccolo, per la striscia sotto il gettone. */
function miniButton(
  id: string,
  text: string,
  ariaLabel: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = "btn";
  button.textContent = text;
  button.setAttribute("aria-label", ariaLabel);
  button.disabled = disabled;
  button.style.cssText = `font-size:9.5px;padding:1px 5px;${disabled ? "opacity:0.45;" : ""}`;
  if (!disabled) button.addEventListener("click", onClick);
  return button;
}

/**
 * I COMANDI DEL POSTO, sotto il gettone e sempre tutti.
 *
 * Sono gli stessi di prima, con gli stessi identificativi: il campo cambia il
 * disegno, non i gesti che esistevano. Restano perché il trascinamento non è
 * l'unica strada e nemmeno la presa lo è: «In panchina» è un comando che si
 * capisce senza aver capito niente del resto della pagina.
 */
function renderComandiPosto(
  competition: FormazioneCompetitionView,
  player: FormazionePlayerRow,
  handlers: FormazioneHandlers,
  benchLength: number,
): HTMLElement {
  const comandi = document.createElement("span");
  comandi.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:3px;`;
  const spento = !competition.editable;
  const prefisso = `formazione-${competition.competitionId}-${player.id}`;

  comandi.appendChild(renderSpunta(competition, player, handlers));

  if (player.place === "porta") {
    // Il portiere non lascia la porta vuota: il comando resta, disabilitato, e
    // accanto c'è scritto che cosa serve perché diventi possibile.
    comandi.appendChild(
      miniButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Manda «${player.id}» in panchina`,
        true,
        () => undefined,
      ),
    );
    const nota = document.createElement("span");
    nota.style.cssText = `font-size:9px;color:${C.textDim};`;
    nota.textContent = "esce quando entra un altro portiere";
    comandi.appendChild(nota);
  } else if (player.place === "titolare") {
    comandi.appendChild(
      miniButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Manda «${player.id}» in panchina`,
        spento,
        () => handlers.onMoveToBench(competition.competitionId, player.id),
      ),
    );
  } else if (player.place === "panchina") {
    comandi.appendChild(
      miniButton(
        `${prefisso}-in-campo`,
        "In campo",
        `Porta «${player.id}» fra i titolari`,
        spento,
        () => handlers.onMoveToStarters(competition.competitionId, player.id),
      ),
    );
    comandi.appendChild(
      miniButton(
        `${prefisso}-panchina-su`,
        "Su",
        `«${player.id}» entra prima`,
        spento || player.benchOrder === 1,
        () => handlers.onMoveBench(competition.competitionId, player.id, "su"),
      ),
    );
    comandi.appendChild(
      miniButton(
        `${prefisso}-panchina-giu`,
        "Giù",
        `«${player.id}» entra dopo`,
        spento || player.benchOrder === benchLength,
        () => handlers.onMoveBench(competition.competitionId, player.id, "giu"),
      ),
    );
    comandi.appendChild(
      miniButton(
        `${prefisso}-fuori`,
        "Fuori",
        `Togli «${player.id}» dai convocati`,
        spento,
        () => handlers.onMoveOutside(competition.competitionId, player.id),
      ),
    );
  } else {
    comandi.appendChild(
      miniButton(
        `${prefisso}-in-campo`,
        "In campo",
        `Porta «${player.id}» fra i titolari`,
        spento,
        () => handlers.onMoveToStarters(competition.competitionId, player.id),
      ),
    );
    comandi.appendChild(
      miniButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Porta «${player.id}» in panchina`,
        spento,
        () => handlers.onMoveToBench(competition.competitionId, player.id),
      ),
    );
  }
  return comandi;
}

/**
 * IL GIOCATORE INTERO: il gettone, l'ordine di panchina quando ce l'ha, e i
 * comandi del suo posto.
 *
 * `formazione-riga` resta la classe di ogni giocatore a schermo anche adesso che
 * non è più una riga: è il segno per cui «quanti giocatori si vedono» è una
 * domanda che si può ancora fare al DOM, e da quella domanda dipendono due
 * garanzie che non si toccano — che con il canale non letto non se ne veda
 * NESSUNO, e che in prova ognuno porti addosso il marchio della squadra finta.
 */
function renderPlayerUnit(
  competition: FormazioneCompetitionView,
  player: FormazionePlayerRow,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  presa: FormazionePresa,
  benchLength: number,
): HTMLElement {
  const unit = document.createElement("div");
  unit.className = "formazione-riga";
  unit.dataset.posto = player.place;
  unit.id = `formazione-giocatore-${competition.competitionId}-${player.id}`;
  unit.style.cssText = `display:flex;flex-direction:column;gap:3px;flex:0 1 148px;min-width:124px;`;

  if (player.place === "panchina" && player.benchOrder !== null) {
    const ordine = document.createElement("span");
    ordine.className = "formazione-riga__ordine";
    ordine.style.cssText = `font-size:10px;font-weight:700;font-family:${C.mono};color:${C.textAccent};`;
    ordine.textContent = `${player.benchOrder}º a entrare`;
    unit.appendChild(ordine);
  }

  unit.appendChild(renderPlayerToken(competition, player, handlers, codes, presa));
  unit.appendChild(renderComandiPosto(competition, player, handlers, benchLength));

  // IL TRASCINAMENTO PARTE DAL CONTENITORE, NON DAL BOTTONE, e non è una
  // preferenza di stile: un `<button draggable>` non fa partire nessun
  // trascinamento nei browser — il bottone si prende il `mousedown` per sé — e
  // la scorciatoia col mouse sarebbe rimasta una promessa scritta e mai
  // mantenuta. Il bottone resta quello che era, per il clic e per la tastiera;
  // il gesto del mouse vive un livello più fuori. Misurato in
  // `e2e/formazione-campo.spec.ts`, che trascina davvero.
  if (competition.editable) rendiTrascinabile(unit, player.id);
  rendiBersaglio(unit, competition, handlers, { kind: "gettone", playerId: player.id });
  return unit;
}

/**
 * UN POSTO CHE IL MODULO PREVEDE E NESSUNO OCCUPA.
 *
 * Resta a schermo, e resta vuoto: un reparto scoperto è la cosa più importante
 * che questa pagina possa mostrare la domenica mattina, e un posto che sparisce
 * quando nessuno lo occupa la nasconde proprio quando serve.
 *
 * È UNA DESTINAZIONE VERA, non un buco decorativo: la si raggiunge trascinando,
 * premendola col dito e premendola da tastiera, e ciò che ne esce è `fillSlot`,
 * che sa QUALE casella e la ricontrolla contro il campo di adesso.
 *
 * PREMERLO NON CAMBIA IL RUOLO DI NESSUNO. La casella dice dove si sta mirando,
 * non che reparto prende chi arriva: un centrocampista posato sulla casella
 * libera della difesa resta un centrocampista, il conto dei reparti cambia, e
 * se la forma nuova non è nessuno dei sette moduli la mossa si rifiuta dicendo
 * la forma. L'etichetta promette quindi «posa qui», che è ciò che succede, e
 * non «diventa un difensore», che non succede.
 *
 * SPENTO SOLO QUANDO PREMERLO NON SIGNIFICHEREBBE NIENTE — niente in mano, o
 * formazione che non si modifica. Tutto il resto passa e riceve una risposta:
 * un rifiuto scritto è un'informazione, un bottone spento su una mossa che
 * qualcuno stava per capire è un vicolo cieco.
 */
function renderEmptySlot(
  competition: FormazioneCompetitionView,
  slot: PitchSlot,
  handlers: FormazioneHandlers,
  presa: FormazionePresa,
): HTMLElement {
  const held = inMano(competition, presa);
  const impedito = !competition.editable
    ? "la formazione non si modifica"
    : held === null
      ? "nessun giocatore in mano: prendine uno, o usa «In campo» sul suo gettone"
      : "";

  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.id = `formazione-posto-${competition.competitionId}-${slot.line}-${slot.indexInLine}`;
  bottone.className = "formazione-posto-vuoto";
  bottone.dataset.ruolo = slot.role;
  bottone.dataset.linea = String(slot.line);
  bottone.disabled = impedito.length > 0;
  const ruolo = ROLE_LABEL[slot.role] ?? slot.role;
  bottone.setAttribute(
    "aria-label",
    impedito.length > 0
      ? `Posto vuoto, ${ruolo} — ${impedito}`
      : `Posto vuoto, ${ruolo} — posa qui «${held ?? ""}»`,
  );
  bottone.style.cssText =
    `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;` +
    `flex:0 1 148px;min-width:124px;min-height:64px;padding:6px 7px;border-radius:8px;` +
    `background:transparent;border:1px dashed ${bottone.disabled ? C.border : C.textAccent};` +
    `color:${C.textSec};cursor:${bottone.disabled ? "default" : "pointer"};`;

  const glifo = document.createElement("span");
  glifo.style.cssText = `font-size:11px;font-weight:800;font-family:${C.mono};letter-spacing:0.06em;`;
  glifo.textContent = slot.role;
  bottone.appendChild(glifo);
  const testo = document.createElement("span");
  testo.style.cssText = `font-size:9.5px;letter-spacing:0.03em;`;
  testo.textContent = "posto vuoto";
  bottone.appendChild(testo);

  if (!bottone.disabled && held !== null) {
    bottone.addEventListener("click", () =>
      posaSuBersaglio(competition, handlers, { kind: "posto_vuoto", slot }, held),
    );
  }
  rendiBersaglio(bottone, competition, handlers, { kind: "posto_vuoto", slot });
  return bottone;
}

/** Le righe del campo, disegnate con quello che il campo ha davvero. */
function renderPitchLines(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 150");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";

  const linea = (attrs: Readonly<Record<string, string>>, tag: string): void => {
    const el = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", "oklch(0.92 0.02 150 / 0.30)");
    el.setAttribute("stroke-width", "0.7");
    svg.appendChild(el);
  };

  linea({ x: "2", y: "2", width: "96", height: "146" }, "rect");
  linea({ x1: "2", y1: "75", x2: "98", y2: "75" }, "line");
  linea({ cx: "50", cy: "75", r: "13" }, "circle");
  // La porta è in basso: area di rigore e area piccola stanno da quella parte,
  // e in cima c'è quella dell'avversario. Un campo con una porta sola sarebbe
  // un campo che nessuno riconosce.
  linea({ x: "22", y: "121", width: "56", height: "27" }, "rect");
  linea({ x: "36", y: "138", width: "28", height: "10" }, "rect");
  linea({ x: "22", y: "2", width: "56", height: "27" }, "rect");
  linea({ x: "36", y: "2", width: "28", height: "10" }, "rect");
  return svg;
}

/**
 * IL CAMPO — la porta in basso, poi difesa, centrocampo, attacco.
 *
 * L'ordine del disegno è quello con cui si guarda una partita da dietro la
 * propria porta, che è il verso in cui la formazione si legge da sempre. Le
 * linee arrivano da `pitchLayout` nell'ordine del regolamento (porta per prima)
 * e si disegnano al contrario: da che parte cominciare a guardarle è una
 * decisione del disegno, e sta qui.
 */
function renderPitch(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  presa: FormazionePresa,
): HTMLElement {
  const group = document.createElement("div");
  group.id = `formazione-titolari-${competition.competitionId}`;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `In campo — ${competition.label}`);
  group.style.cssText = `display:flex;flex-direction:column;gap:8px;`;
  group.appendChild(smallHeading("IN CAMPO", C.textSec));

  const lineup = competition.lineup;
  if (lineup === null) return group;

  const layout = pitchLayout(lineup, ruoliMostrati(competition));
  const byId = new Map(competition.players.map((player) => [player.id, player]));

  const campo = document.createElement("div");
  campo.className = "formazione-campo";
  campo.dataset.modulo = layout.module;
  campo.style.cssText =
    `position:relative;display:flex;flex-direction:column-reverse;gap:10px;` +
    `padding:14px 10px;border-radius:12px;border:1px solid ${C.border};overflow:hidden;` +
    // Il verde a strisce del taglio dell'erba: due toni scuri, non un prato
    // acceso. Il fondo di questa app è scuro, e un campo luminoso qui sotto
    // renderebbe illeggibile tutto ciò che ci sta sopra.
    `background:repeating-linear-gradient(180deg, oklch(0.31 0.055 150) 0 26px, oklch(0.275 0.05 150) 26px 52px);`;
  campo.appendChild(renderPitchLines());

  // `column-reverse`: le linee arrivano porta-difesa-centrocampo-attacco e si
  // impilano dal basso, così l'attacco finisce in cima senza che l'ordine del
  // modello venga rovesciato prima di essere letto.
  for (const [numero, linea] of layout.lines.entries()) {
    const riga = document.createElement("div");
    riga.className = "formazione-campo__linea";
    riga.dataset.linea = String(numero);
    riga.style.cssText = `position:relative;display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:8px;`;
    for (const slot of linea) {
      // Un posto occupato da un id che nella rosa non c'è non produce un gettone
      // inventato: resta il posto vuoto, e chi manca lo dichiara `legality` con
      // `id_fuori_rosa`. È la stessa regola che il modello applica ai gruppi.
      const player = slot.playerId === null ? undefined : byId.get(slot.playerId);
      riga.appendChild(
        player === undefined
          ? renderEmptySlot(competition, slot, handlers, presa)
          : renderPlayerUnit(
              competition,
              player,
              handlers,
              codes,
              presa,
              competition.bench.length,
            ),
      );
    }
    campo.appendChild(riga);
  }
  group.appendChild(campo);

  // IN CAMPO E SENZA UN POSTO. Non è un dettaglio da nascondere sotto il verde:
  // è un giocatore schierato davvero, che il modulo non riesce a ospitare, ed è
  // lui a rendere illegale l'invio. Sta fuori dal campo perché nel campo non c'è
  // un posto per lui — inventargliene uno direbbe che il modulo lo prevede.
  const senzaPosto = layout.unplaced
    .map((id) => byId.get(id))
    .filter((player): player is FormazionePlayerRow => player !== undefined);
  if (senzaPosto.length > 0) {
    const box = document.createElement("div");
    box.id = `formazione-senza-posto-${competition.competitionId}`;
    box.setAttribute("role", "alert");
    box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;`;
    box.appendChild(smallHeading("IN CAMPO, E SENZA UN POSTO IN QUESTO MODULO", C.stopRed));
    box.appendChild(
      paragraph(
        `Sono schierati fra gli undici, e il modulo «${layout.module}» non ha un posto per loro. ` +
          "Finché restano qui la formazione non è quella che il modulo dichiara: cambia modulo, " +
          "oppure mandali in panchina.",
        `font-size:12px;color:${C.textMid};`,
      ),
    );
    const striscia = document.createElement("div");
    striscia.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;`;
    for (const player of senzaPosto) {
      striscia.appendChild(
        renderPlayerUnit(competition, player, handlers, codes, presa, competition.bench.length),
      );
    }
    box.appendChild(striscia);
    group.appendChild(box);
  }
  return group;
}

/**
 * UNA ZONA DI POSA — la panchina intera, o i non convocati interi.
 *
 * È un bottone e non un'area muta: senza di lui, mandare in panchina col dito o
 * con la tastiera richiederebbe di trovare il gettone giusto su cui posare, e
 * «mandalo in panchina» non è «scambialo con quello». Resta a schermo anche
 * quando non si può usare, con il motivo.
 */
function renderDropZone(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  presa: FormazionePresa,
  bersaglio: Bersaglio & { readonly kind: "panchina" | "fuori" },
): HTMLElement {
  const held = inMano(competition, presa);
  const heldRow =
    held === null ? undefined : competition.players.find((row) => row.id === held);
  const dove = bersaglio.kind === "panchina" ? "panchina" : "fuori dai convocati";
  const impedito = !competition.editable
    ? "la formazione non si modifica"
    : held === null
      ? "nessun giocatore in mano"
      : heldRow !== undefined && heldRow.place === (bersaglio.kind === "panchina" ? "panchina" : "fuori")
        ? `«${held}» è già ${dove === "panchina" ? "in panchina" : "fuori dai convocati"}`
        : heldRow !== undefined && heldRow.place === "porta"
          ? `«${held}» è in porta: esce solo quando un altro portiere entra al suo posto`
          : "";

  const bottone = document.createElement("button");
  bottone.type = "button";
  bottone.id = `formazione-${bersaglio.kind}-posa-${competition.competitionId}`;
  bottone.className = "btn";
  bottone.disabled = impedito.length > 0;
  bottone.textContent =
    bersaglio.kind === "panchina" ? "Posa qui: in panchina" : "Posa qui: fuori dai convocati";
  bottone.setAttribute(
    "aria-label",
    impedito.length > 0
      ? `${bottone.textContent} — non si può: ${impedito}`
      : bersaglio.kind === "panchina"
        ? `Manda «${held ?? ""}» in panchina`
        : `Togli «${held ?? ""}» dai convocati`,
  );
  bottone.style.cssText = `font-size:11px;padding:3px 9px;${bottone.disabled ? "opacity:0.45;" : ""}`;
  if (!bottone.disabled && held !== null) {
    bottone.addEventListener("click", () =>
      posaSuBersaglio(competition, handlers, bersaglio, held),
    );
  }

  // IL MOTIVO SI LEGGE ACCANTO AL BOTTONE, non solo dentro l'etichetta per i
  // lettori di schermo. «Nessun giocatore in mano» si capisce da solo e non si
  // ripete; tutto il resto — il portiere che non lascia la porta, la blindatura
  // — è una spiegazione che chi guarda deve poter leggere senza chiederla, come
  // già fa la nota accanto al comando spento del portiere.
  if (impedito.length === 0 || impedito === "nessun giocatore in mano") return bottone;
  const riga = document.createElement("span");
  riga.style.cssText = `display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;`;
  riga.appendChild(bottone);
  const nota = document.createElement("span");
  nota.style.cssText = `font-size:11px;color:${C.textDim};`;
  nota.textContent = impedito;
  riga.appendChild(nota);
  return riga;
}

/**
 * UNA STRISCIA DI GIOCATORI: la panchina, i non convocati, o la rosa intera
 * quando non c'è nessuna formazione da modificare.
 *
 * La striscia intera è un bersaglio del trascinamento, e il bottone di posa che
 * la accompagna fa la stessa cosa col dito e con la tastiera.
 */
function renderStrip(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  presa: FormazionePresa,
  suffisso: string,
  titolo: string,
  nota: string,
  righe: readonly FormazionePlayerRow[],
  zona: (Bersaglio & { readonly kind: "panchina" | "fuori" }) | null,
): HTMLElement {
  const group = document.createElement("div");
  group.id = `formazione-${suffisso}-${competition.competitionId}`;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `${titolo} — ${competition.label}`);
  group.style.cssText = `display:flex;flex-direction:column;gap:6px;border:1px solid ${C.border};border-radius:10px;padding:10px 12px;`;

  const testa = document.createElement("div");
  testa.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:8px;`;
  testa.appendChild(smallHeading(titolo.toUpperCase(), C.textSec));
  if (zona !== null) testa.appendChild(renderDropZone(competition, handlers, presa, zona));
  group.appendChild(testa);

  if (nota.length > 0) {
    group.appendChild(paragraph(nota, `font-size:12px;color:${C.textDim};`));
  }

  const striscia = document.createElement("div");
  striscia.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;`;
  if (righe.length === 0) {
    striscia.appendChild(paragraph("nessuno", `font-size:12px;color:${C.textDim};`));
  }
  for (const player of righe) {
    striscia.appendChild(
      renderPlayerUnit(competition, player, handlers, codes, presa, competition.bench.length),
    );
  }
  if (zona !== null) rendiBersaglio(striscia, competition, handlers, zona);
  group.appendChild(striscia);
  return group;
}

/** La rosa intera con la sola spunta, quando non c'è nessuna formazione da modificare. */
function renderRosterOnly(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  presa: FormazionePresa,
): HTMLElement {
  // NIENTE CAMPO QUI, e non è una dimenticanza: senza una formazione letta non
  // c'è nessun modulo, quindi non ci sono posti da disegnare. Un campo verde con
  // undici caselle vuote si leggerebbe «non ho ancora schierato nessuno», che è
  // una conclusione precisa e diversa da «la lega non riporta niente».
  return renderStrip(
    competition,
    handlers,
    codes,
    presa,
    "rosa",
    "Rosa",
    "Le spunte dicono chi vuoi in campo e restano anche se non salvi adesso.",
    competition.players,
    null,
  );
}

/**
 * I VINCOLI SALVATI CHE OGGI NON VALGONO PIÙ: si vedono, non si scartano, E SI
 * POSSONO TOGLIERE.
 *
 * L'ultima parte è quella che mancava, ed era la più grave. Una spunta messa su
 * un giocatore che oggi non è più in rosa non ha nessuna riga a schermo — la
 * riga del giocatore non c'è più — quindi non c'era NESSUN comando in tutta la
 * pagina capace di toglierla: la formazione restava bloccata e l'unica via
 * d'uscita era cancellare l'archivio locale a mano. Un prodotto in cui non si
 * può disfare ciò che si è fatto è rotto anche quando tutti i dati sono giusti.
 *
 * Il comando sta QUI e non altrove perché questo riquadro è l'unico posto in
 * cui il vincolo è ancora nominato.
 */
function renderQuarantine(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement | null {
  if (competition.quarantined.length === 0) return null;
  const box = document.createElement("div");
  box.id = `formazione-quarantena-${competition.competitionId}`;
  box.setAttribute("role", "alert");
  box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:8px;`;
  box.appendChild(smallHeading("VINCOLI MESSI DA PARTE", C.stopRed));
  box.appendChild(
    paragraph(
      "Non vengono applicati, e finché sono qui il salvataggio si ferma: erano scelte tue e non " +
        "si buttano al posto tuo. Toglili da qui quando non li vuoi più.",
      `font-size:12px;color:${C.textDim};`,
    ),
  );

  for (const q of competition.quarantined) {
    const riga = document.createElement("div");
    riga.className = "formazione-quarantena__riga";
    riga.dataset.vincolo = q.kind;
    riga.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-size:12px;line-height:1.5;color:${C.textMid};`;
    const testo = document.createElement("span");
    testo.style.cssText = "flex:1 1 240px;";
    testo.innerHTML = `<strong style="font-family:${C.mono};">${escHtml(q.value)}</strong> — ${escHtml(q.reason)}`;
    riga.appendChild(testo);
    riga.appendChild(
      commandButton(
        `formazione-quarantena-togli-${competition.competitionId}-${q.value}`,
        "Togli questo vincolo",
        q.kind === "modulo_non_ammesso"
          ? `Togli il blocco sul modulo «${q.value}» — ${competition.label}`
          : `Togli la spunta su «${q.value}» — ${competition.label}`,
        false,
        () => handlers.onRemoveQuarantined(competition.competitionId, q),
      ),
    );
    box.appendChild(riga);
  }
  return box;
}

/** Una delle due formazioni: campionato o coppa. */
function renderCompetition(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  save: FormazioneSaveState,
  edit: FormazioneEditState,
  prova: boolean,
  presa: FormazionePresa,
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = `formazione-competizione-${competition.competitionId}`;
  panel.setAttribute(
    "aria-label",
    prova
      ? `${PROVA_TITOLO} — ${competition.label}`
      : `Formazione — ${competition.label}`,
  );
  if (prova) panel.dataset.prova = "attiva";
  panel.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

  const giornata = competition.matchday === null ? "giornata non nota" : `giornata ${competition.matchday}`;
  // IL MARCHIO ANCHE SUL TITOLO. La cornice in testa alla pagina si può perdere
  // scorrendo; il titolo del riquadro sta attaccato alla formazione che marca.
  panel.appendChild(
    sectionTitle(
      `${prova ? `${PROVA_TITOLO} — ` : ""}${competition.label.toUpperCase()} — ${giornata.toUpperCase()}`,
    ),
  );

  // NON DISPONIBILE È UNO STATO, NON UN VUOTO. La coppa non ancora cominciata
  // non produce una seconda formazione vuota che sembri modificabile: produce
  // questa riga, con il motivo che la lettura ha dichiarato.
  if (competition.unavailableReason.length > 0) {
    const box = document.createElement("div");
    box.id = `formazione-non-disponibile-${competition.competitionId}`;
    box.setAttribute("role", "status");
    box.style.cssText = `border:1px dashed ${C.border};border-radius:8px;padding:10px 14px;`;
    box.appendChild(paragraph(`Non disponibile: ${competition.unavailableReason}`, `color:${C.textMid};`));
    box.appendChild(
      paragraph(
        "Nessuna formazione viene mostrata per questa competizione, e non se ne può salvare una.",
        `color:${C.textDim};font-size:12px;margin-top:4px;`,
      ),
    );
    panel.appendChild(box);
    return panel;
  }

  if (competition.lineup === null) {
    panel.appendChild(
      paragraph(
        "La lega non riporta nessuna formazione schierata per questa partita. La rosa qui sotto è quella " +
          "letta: le spunte dicono chi vuoi in campo, e restano anche se non salvi adesso. Non c'è nessuna " +
          "formazione da modificare finché la lega non ne riporta una.",
        `color:${C.textSec};`,
      ),
    );
  }

  if (competition.constraints.locked) {
    panel.appendChild(
      paragraph(
        "Formazione blindata: i comandi che la cambierebbero sono disabilitati e restano a vista finché " +
          "la blindatura è accesa. Toglierla li riaccende, e quello che avevi scelto resta dov'era.",
        `color:${C.textAccent};`,
      ),
    );
  }

  if (competition.lineup !== null) {
    panel.appendChild(renderDraftState(competition, handlers));
    panel.appendChild(renderLineupControls(competition, handlers));
  }

  if (edit.competitionId === competition.competitionId && edit.conflict !== null) {
    panel.appendChild(renderConflict(competition, edit.conflict, handlers));
  }
  if (edit.competitionId === competition.competitionId && edit.refusal.length > 0) {
    const box = document.createElement("div");
    box.id = `formazione-mossa-rifiutata-${competition.competitionId}`;
    box.setAttribute("role", "alert");
    box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
    box.appendChild(smallHeading("MOSSA NON ESEGUITA", C.stopRed));
    box.appendChild(paragraph(edit.refusal, `color:${C.textMid};margin-top:4px;`));
    panel.appendChild(box);
  }

  // LA SQUADRA SUBITO, E I MOTIVI SOTTO. Il campo sta qui — attaccato al modulo
  // che lo forma e alla riga che dice se è quello della piattaforma — e non in
  // fondo dopo cinque riquadri di diagnostica: chi apre questa pagina la
  // domenica mattina viene a vedere la sua squadra, non un referto. I riquadri
  // che spiegano perché qualcosa non va restano tutti, uno per uno, e stanno
  // sotto ciò che descrivono e sopra il bottone che fermano.
  const codes = codesByPlayer(competition);
  if (competition.lineup === null) {
    panel.appendChild(renderRosterOnly(competition, handlers, codes, presa));
  } else {
    panel.appendChild(renderPitch(competition, handlers, codes, presa));
    panel.appendChild(
      renderStrip(
        competition,
        handlers,
        codes,
        presa,
        "panchina",
        "Panchina",
        "L'ordine conta: quando i senza voto sono più delle sostituzioni disponibili entra chi sta più " +
          "in alto — a sinistra si entra prima. «Su» lo fa entrare prima, «Giù» dopo.",
        competition.bench,
        { kind: "panchina" },
      ),
    );
    panel.appendChild(
      renderStrip(
        competition,
        handlers,
        codes,
        presa,
        "fuori",
        "Fuori dai convocati",
        "In rosa, e non schierati in questa partita.",
        competition.outside,
        { kind: "fuori" },
      ),
    );
  }

  const vincoli = document.createElement("div");
  vincoli.id = `formazione-vincoli-${competition.competitionId}`;
  vincoli.style.cssText = `display:flex;flex-direction:column;gap:10px;border:1px solid ${C.border};border-radius:8px;padding:10px 14px;`;
  vincoli.appendChild(smallHeading("I VINCOLI — VALGONO ANCHE PER LE PROSSIME GIORNATE", C.textSec));
  vincoli.appendChild(renderModuleControl(competition, handlers));
  vincoli.appendChild(renderLockControl(competition, handlers));
  panel.appendChild(vincoli);

  const quarantena = renderQuarantine(competition, handlers);
  if (quarantena !== null) panel.appendChild(quarantena);

  // TUTTI I MOTIVI INSIEME, non uno alla volta: se tre spunte sono in conflitto,
  // mostrarne una per volta costringerebbe a correggere e riprovare tre volte
  // senza mai vedere quanto è grande il problema.
  if (competition.issues.rejections.length > 0) {
    const impossibile = document.createElement("div");
    impossibile.id = `formazione-impossibile-${competition.competitionId}`;
    impossibile.setAttribute("role", "alert");
    impossibile.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
    impossibile.appendChild(
      smallHeading("CON QUESTI VINCOLI LA FORMAZIONE NON SI PUÒ FARE", C.stopRed),
    );
    const list = document.createElement("ul");
    list.style.cssText = `margin:4px 0 0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
    list.innerHTML = competition.issues.rejections
      .map((issue) => {
        const chi =
          issue.playerIds.length === 0
            ? ""
            : ` <span style="font-family:${C.mono};color:${C.textDim};">(${escHtml(issue.playerIds.join(", "))})</span>`;
        return `<li><strong>${escHtml(issue.code)}</strong> — ${escHtml(issue.message)}${chi}</li>`;
      })
      .join("");
    impossibile.appendChild(list);
    panel.appendChild(impossibile);
  }

  // UN AVVERTIMENTO NON È UN RIFIUTO. «Hai bloccato in campo uno che secondo le
  // previsioni non gioca» è una scelta legittima e costosa: si dice, e non si
  // impedisce. La squadra è di Pico.
  if (competition.issues.warnings.length > 0) {
    const avvisi = document.createElement("div");
    avvisi.id = `formazione-avvertimenti-vincoli-${competition.competitionId}`;
    avvisi.setAttribute("role", "status");
    avvisi.style.cssText = `border:1px solid ${C.border};border-radius:8px;padding:8px 12px;`;
    avvisi.appendChild(smallHeading("SCELTE COSTOSE, NON ERRORI — RESTANO TUE", C.textAccent));
    const list = document.createElement("ul");
    list.style.cssText = `margin:4px 0 0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
    list.innerHTML = competition.issues.warnings
      .map((issue) => {
        const chi =
          issue.playerIds.length === 0
            ? ""
            : ` <span style="font-family:${C.mono};color:${C.textDim};">(${escHtml(issue.playerIds.join(", "))})</span>`;
        return `<li><strong>${escHtml(issue.code)}</strong> — ${escHtml(issue.message)}${chi}</li>`;
      })
      .join("");
    avvisi.appendChild(list);
    panel.appendChild(avvisi);
  }

  // UNA SPUNTA CHE NON CAMBIA NIENTE È PEGGIO DI NESSUNA SPUNTA. Se la
  // formazione mostrata non rispetta un vincolo, lo si dice qui e il salvataggio
  // si ferma. Adesso la formazione si può anche modificare, quindi la strada per
  // rispettarlo è a portata di clic: prima non c'era, e questo riquadro era un
  // vicolo cieco.
  if (competition.unmet.length > 0) {
    const box = document.createElement("div");
    box.id = `formazione-vincoli-non-rispettati-${competition.competitionId}`;
    box.setAttribute("role", "alert");
    box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
    box.appendChild(smallHeading("VINCOLI NON RISPETTATI DA QUESTA FORMAZIONE", C.stopRed));
    const list = document.createElement("ul");
    list.style.cssText = `margin:4px 0 0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
    list.innerHTML = competition.unmet.map((riga) => `<li>${escHtml(riga)}</li>`).join("");
    box.appendChild(list);
    box.appendChild(
      paragraph(
        "Finché non sono rispettati il salvataggio si ferma: non viene mandato niente.",
        `color:${C.textDim};font-size:12px;margin-top:4px;`,
      ),
    );
    panel.appendChild(box);
  }

  const legalita = renderLegality(competition);
  if (legalita !== null) panel.appendChild(legalita);

  const blockers = saveBlockers(competition);
  const salva = document.createElement("button");
  salva.type = "button";
  salva.id = `formazione-salva-${competition.competitionId}`;
  salva.className = "btn";
  salva.disabled = blockers.length > 0;
  salva.textContent = "Salva";
  salva.setAttribute("aria-describedby", "formazione-stato-invio");
  salva.addEventListener("click", () => handlers.onSave(competition.competitionId));
  panel.appendChild(salva);

  // MAI UN SALVATAGGIO CHE SORPRENDE, e nemmeno un bottone spento senza motivo:
  // se non si può salvare, il perché sta qui accanto e non dopo il clic.
  if (blockers.length > 0) {
    const perche = document.createElement("div");
    perche.id = `formazione-salva-impedito-${competition.competitionId}`;
    perche.setAttribute("role", "status");
    perche.style.cssText = `font-size:12px;line-height:1.5;color:${C.textMid};`;
    perche.innerHTML =
      `<strong style="color:${C.stopRed};">Non si può salvare:</strong> ` +
      escHtml(blockers.join("; "));
    panel.appendChild(perche);
  }

  if (save.competitionId === competition.competitionId) {
    panel.appendChild(renderSubmissionState(save, prova));
  }

  return panel;
}

/**
 * La schermata intera.
 *
 * `notice` è la riga della shell sui vincoli salvati (archivio illeggibile o
 * non accessibile): sta sopra tutto perché riguarda la fiducia in ciò che si
 * sta per applicare, ed è vuota nel caso normale.
 */
export function renderFormazioneScreen(
  view: FormazioneView,
  handlers: FormazioneHandlers,
  save: FormazioneSaveState,
  edit: FormazioneEditState = NESSUNA_MODIFICA_IN_SOSPESO,
  notice = "",
  prova: FormazioneProva = NESSUNA_PROVA,
  /**
   * QUANDO ogni pezzo è stato letto, e con chi si gioca. `null` soltanto quando
   * non c'è nessuna formazione a schermo: con l'avviso al posto della squadra
   * non c'è niente da datare. In ogni altro caso questa fascia c'è.
   */
  lettura: FormazioneLettura | null = null,
  /**
   * IL GIOCATORE CHE SI HA IN MANO. Non è un dato della lega e non si persiste:
   * è la prima metà del gesto in due tempi, e la seconda strada — quella che
   * esiste per chi non ha un mouse — non funzionerebbe senza.
   */
  presa: FormazionePresa = NESSUNA_PRESA,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "screen-container";
  wrap.id = "formazione-screen";
  wrap.style.cssText = `flex:1;padding:18px 24px;gap:14px;`;
  if (prova.attiva) wrap.dataset.prova = "attiva";

  // PRIMA DI TUTTO IL RESTO, e prima di qualunque formazione: se quello che si
  // sta per leggere è una squadra di esempio, lo si legge per primo.
  if (prova.attiva) wrap.appendChild(renderProvaMarchio(prova, "testa"));

  if (notice.length > 0) {
    const riga = document.createElement("div");
    riga.id = "formazione-avviso-vincoli";
    riga.setAttribute("role", "alert");
    riga.style.cssText = `font-size:13px;line-height:1.5;color:${C.stopRed};border:1px solid ${C.stopRedDark};border-radius:8px;padding:10px 14px;`;
    riga.textContent = notice;
    wrap.appendChild(riga);
  }

  if (!view.known) {
    wrap.appendChild(renderUnknownNotice(view));
    // L'invito sta SOTTO l'avviso e non al posto suo: la verità sul canale
    // resta la prima cosa che si legge, e la prova è ciò che si può fare
    // intanto. Con la prova già accesa non si offre di riaccenderla.
    if (!prova.attiva) wrap.appendChild(renderProvaInvito(prova));
    return wrap;
  }

  // PRIMA DELLE FORMAZIONI, perché riguarda quante ce ne sono: se una
  // competizione non è stata disegnata, saperlo viene prima di guardare quelle
  // che ci sono.
  if (view.duplicated.length > 0) wrap.appendChild(renderDuplicateNotice(view.duplicated));

  if (view.competitions.length === 0) {
    wrap.appendChild(
      paragraph(
        "La lega è stata letta e non riporta nessuna competizione in corso: non c'è nessuna formazione da schierare.",
        `color:${C.textSec};`,
      ),
    );
    return wrap;
  }

  // PRIMA DELLE FORMAZIONI, non dopo: chi legge undici nomi deve incontrare la
  // loro data prima di fidarsene, non dopo averci creduto.
  if (lettura !== null) wrap.appendChild(renderLettura(lettura, prova.attiva));

  for (const competition of view.competitions) {
    wrap.appendChild(renderCompetition(competition, handlers, save, edit, prova.attiva, presa));
  }
  if (prova.attiva) wrap.appendChild(renderProvaMarchio(prova, "coda"));
  return wrap;
}
