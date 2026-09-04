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

import { C, escHtml } from "./theme.js";
import type {
  ConstraintConflict,
  FormazioneCompetitionView,
  FormazionePlayerRow,
  FormazioneView,
  LineupDifference,
  LineupFlags,
  Module,
  SubmissionUiState,
  SubmissionViolation,
} from "../../packages/league-channel-contract/src/index.js";
import { MODULES, saveBlockers } from "../../packages/league-channel-contract/src/index.js";
import {
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
  /** Cambia il modulo con cui la formazione è schierata. */
  readonly onSetModule: (competitionId: string, module: Module) => void;
  /** Accende o spegne una delle due opzioni della formazione. */
  readonly onSetFlag: (competitionId: string, flag: keyof LineupFlags, value: boolean) => void;
  /** Riporta la formazione a com'è stata letta dalla piattaforma. */
  readonly onResetLineup: (competitionId: string) => void;
  /** Scioglie il conflitto: `true` toglie il vincolo ed esegue, `false` lascia tutto. */
  readonly onResolveConflict: (competitionId: string, removeConstraint: boolean) => void;
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
  // IN PROVA IL SALVATAGGIO NON FINGE, E NEMMENO IL SUO CONTRARIO. L'etichetta
  // della prova si usa solo sullo stato in cui nulla è partito — l'unico che la
  // shell produce in prova, perché la porta d'invio non viene chiamata affatto.
  // Se un giorno arrivasse qui uno stato «inviato», dirgli «prova» sarebbe la
  // stessa bugia girata dall'altra parte: si tiene l'etichetta vera.
  const inProva = prova && save.state.kind === "da_inviare";
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
 * IL MODULO CON CUI SI SCHIERA, e le due opzioni della formazione.
 *
 * L'ELENCO DEI MODULI VIENE DALLA LEGA, non da una costante di questo file: se
 * la lega non lo dichiara la pagina lo DICE e non offre una lista, perché una
 * lista inventata qui produrrebbe un invio respinto là — e chi ha scelto non
 * saprebbe nemmeno di aver scelto fra opzioni mai osservate.
 */
function renderLineupControls(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = `formazione-comandi-${competition.competitionId}`;
  wrap.style.cssText = `display:flex;flex-direction:column;gap:10px;border:1px solid ${C.border};border-radius:8px;padding:10px 14px;`;
  wrap.appendChild(smallHeading("LA FORMAZIONE DI QUESTA GIORNATA", C.textSec));

  const riga = document.createElement("div");
  riga.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:12px;`;

  const lineup = competition.lineup;
  const allowed = competition.allowedModules;
  const selectId = `formazione-modulo-schierato-${competition.competitionId}`;

  if (allowed === null) {
    riga.appendChild(
      paragraph(
        `Schierata con «${lineup === null ? "—" : lineup.module}». La lega non ha dichiarato quali moduli ammette: ` +
          "da qui il modulo non si cambia, perché l'unica lista possibile sarebbe inventata.",
        `color:${C.textAccent};`,
      ),
    );
    riga.id = `formazione-moduli-non-dichiarati-${competition.competitionId}`;
    wrap.appendChild(riga);
  } else {
    const label = document.createElement("label");
    label.setAttribute("for", selectId);
    label.style.cssText = `font-size:12px;font-weight:700;letter-spacing:0.05em;color:${C.textSec};`;
    label.textContent = "MODULO SCHIERATO";
    riga.appendChild(label);

    const select = document.createElement("select");
    select.id = selectId;
    select.disabled = !competition.editable || lineup === null;
    select.style.cssText = `background:${C.panelInner};color:${C.textPrimary};border:1px solid ${C.border};border-radius:6px;padding:5px 8px;font-size:13px;`;

    // Il modulo con cui si è schierati adesso resta selezionabile anche se la
    // lega non lo dichiara più: nasconderlo mostrerebbe una tendina che dice
    // una cosa diversa dalla formazione che le sta accanto. Che sia fuori
    // elenco lo dice la violazione bloccante, non un'opzione che sparisce.
    const opzioni = [...allowed];
    if (lineup !== null && !opzioni.includes(lineup.module)) opzioni.unshift(lineup.module);
    for (const module of opzioni) {
      const option = document.createElement("option");
      option.value = module;
      option.textContent =
        allowed.includes(module) ? module : `${module} (non più dichiarato dalla lega)`;
      select.appendChild(option);
    }
    if (lineup !== null) select.value = lineup.module;
    select.addEventListener("change", () => {
      handlers.onSetModule(competition.competitionId, select.value as Module);
    });
    riga.appendChild(select);
    riga.appendChild(
      paragraph(
        `moduli dichiarati dalla lega: ${allowed.join(", ")}`,
        `font-size:12px;color:${C.textDim};`,
      ),
    );
    wrap.appendChild(riga);
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

/** Una riga di giocatore: la spunta, chi è, i motivi, e i comandi del posto. */
function renderPlayerRow(
  competition: FormazioneCompetitionView,
  player: FormazionePlayerRow,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  benchLength: number,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "formazione-riga";
  row.dataset.posto = player.place;
  row.style.cssText = `display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:4px 6px;border-radius:6px;background:${player.starter ? C.panelInner : "transparent"};`;

  const id = `formazione-spunta-${competition.competitionId}-${player.id}`;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = player.locked;
  input.disabled = !competition.editable;
  input.addEventListener("change", () =>
    handlers.onToggleLockedStarter(competition.competitionId, player.id),
  );
  row.appendChild(input);

  if (player.place === "panchina" && player.benchOrder !== null) {
    const ordine = document.createElement("span");
    ordine.className = "formazione-riga__ordine";
    ordine.style.cssText = `font-size:12px;font-weight:700;font-family:${C.mono};color:${C.textAccent};min-width:22px;`;
    ordine.textContent = `${player.benchOrder}º`;
    ordine.setAttribute("aria-label", `${player.benchOrder}º a entrare`);
    row.appendChild(ordine);
  }

  const label = document.createElement("label");
  label.setAttribute("for", id);
  label.style.cssText = `font-size:13px;color:${C.textPrimary};display:flex;gap:8px;align-items:baseline;flex:1 1 200px;`;
  const ruolo = ROLE_LABEL[player.role] ?? player.role;
  const stato =
    player.place === "porta"
      ? "in porta"
      : player.place === "titolare"
        ? "in campo"
        : player.place === "panchina"
          ? "in panchina"
          : "fuori dai convocati";
  const disponibilita = player.availability === undefined ? "" : ` · ${player.availability}`;
  label.innerHTML =
    `<strong style="font-family:${C.mono};">${escHtml(player.id)}</strong>` +
    `<span style="color:${C.textDim};font-size:12px;">${escHtml(ruolo)} · ${escHtml(stato)}${escHtml(disponibilita)}</span>`;
  row.appendChild(label);

  const codici = codes.get(player.id) ?? [];
  if (codici.length > 0) {
    const nota = document.createElement("span");
    nota.className = "formazione-riga__motivo";
    nota.style.cssText = `font-size:11px;font-family:${C.mono};color:${C.stopRed};`;
    nota.textContent = codici.join(" ");
    row.appendChild(nota);
  }

  const comandi = document.createElement("div");
  comandi.style.cssText = `display:flex;flex-wrap:wrap;gap:6px;margin-left:auto;`;
  const spento = !competition.editable;
  const prefisso = `formazione-${competition.competitionId}-${player.id}`;

  if (player.place === "porta") {
    // Il portiere non lascia la porta vuota: il comando resta, disabilitato, e
    // accanto c'è scritto che cosa serve perché diventi possibile.
    comandi.appendChild(
      commandButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Manda «${player.id}» in panchina`,
        true,
        () => undefined,
      ),
    );
    const nota = document.createElement("span");
    nota.style.cssText = `font-size:11px;color:${C.textDim};`;
    nota.textContent = "esce quando entra un altro portiere";
    comandi.appendChild(nota);
  } else if (player.place === "titolare") {
    comandi.appendChild(
      commandButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Manda «${player.id}» in panchina`,
        spento,
        () => handlers.onMoveToBench(competition.competitionId, player.id),
      ),
    );
  } else if (player.place === "panchina") {
    comandi.appendChild(
      commandButton(
        `${prefisso}-in-campo`,
        "In campo",
        `Porta «${player.id}» fra i titolari`,
        spento,
        () => handlers.onMoveToStarters(competition.competitionId, player.id),
      ),
    );
    comandi.appendChild(
      commandButton(
        `${prefisso}-panchina-su`,
        "Su",
        `«${player.id}» entra prima`,
        spento || player.benchOrder === 1,
        () => handlers.onMoveBench(competition.competitionId, player.id, "su"),
      ),
    );
    comandi.appendChild(
      commandButton(
        `${prefisso}-panchina-giu`,
        "Giù",
        `«${player.id}» entra dopo`,
        spento || player.benchOrder === benchLength,
        () => handlers.onMoveBench(competition.competitionId, player.id, "giu"),
      ),
    );
    comandi.appendChild(
      commandButton(
        `${prefisso}-fuori`,
        "Fuori",
        `Togli «${player.id}» dai convocati`,
        spento,
        () => handlers.onMoveOutside(competition.competitionId, player.id),
      ),
    );
  } else {
    comandi.appendChild(
      commandButton(
        `${prefisso}-in-campo`,
        "In campo",
        `Porta «${player.id}» fra i titolari`,
        spento,
        () => handlers.onMoveToStarters(competition.competitionId, player.id),
      ),
    );
    comandi.appendChild(
      commandButton(
        `${prefisso}-in-panchina`,
        "In panchina",
        `Porta «${player.id}» in panchina`,
        spento,
        () => handlers.onMoveToBench(competition.competitionId, player.id),
      ),
    );
  }
  row.appendChild(comandi);

  return row;
}

/** Un gruppo di righe: i titolari, la panchina, chi non è convocato. */
function renderGroup(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
  suffisso: string,
  titolo: string,
  nota: string,
  righe: readonly FormazionePlayerRow[],
): HTMLElement {
  const group = document.createElement("div");
  group.id = `formazione-${suffisso}-${competition.competitionId}`;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `${titolo} — ${competition.label}`);
  group.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
  group.appendChild(smallHeading(titolo.toUpperCase(), C.textSec));
  if (nota.length > 0) {
    group.appendChild(paragraph(nota, `font-size:12px;color:${C.textDim};`));
  }
  if (righe.length === 0) {
    group.appendChild(paragraph("nessuno", `font-size:12px;color:${C.textDim};`));
    return group;
  }
  for (const player of righe) {
    group.appendChild(
      renderPlayerRow(competition, player, handlers, codes, competition.bench.length),
    );
  }
  return group;
}

/** La rosa intera con la sola spunta, quando non c'è nessuna formazione da modificare. */
function renderRosterOnly(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  codes: ReadonlyMap<string, string[]>,
): HTMLElement {
  return renderGroup(
    competition,
    handlers,
    codes,
    "rosa",
    "Rosa",
    "Le spunte dicono chi vuoi in campo e restano anche se non salvi adesso.",
    competition.players,
  );
}

/** I vincoli salvati che oggi non valgono più: si vedono, non si scartano. */
function renderQuarantine(competition: FormazioneCompetitionView): HTMLElement | null {
  if (competition.quarantined.length === 0) return null;
  const box = document.createElement("div");
  box.id = `formazione-quarantena-${competition.competitionId}`;
  box.setAttribute("role", "alert");
  box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
  box.appendChild(smallHeading("VINCOLI MESSI DA PARTE", C.stopRed));
  const list = document.createElement("ul");
  list.style.cssText = `margin:4px 0 0;padding-left:18px;font-size:12px;line-height:1.5;color:${C.textMid};`;
  list.innerHTML = competition.quarantined
    .map((q) => `<li><strong>${escHtml(q.value)}</strong> — ${escHtml(q.reason)}</li>`)
    .join("");
  box.appendChild(list);
  return box;
}

/** Una delle due formazioni: campionato o coppa. */
function renderCompetition(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
  save: FormazioneSaveState,
  edit: FormazioneEditState,
  prova: boolean,
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

  const vincoli = document.createElement("div");
  vincoli.id = `formazione-vincoli-${competition.competitionId}`;
  vincoli.style.cssText = `display:flex;flex-direction:column;gap:10px;border:1px solid ${C.border};border-radius:8px;padding:10px 14px;`;
  vincoli.appendChild(smallHeading("I VINCOLI — VALGONO ANCHE PER LE PROSSIME GIORNATE", C.textSec));
  vincoli.appendChild(renderModuleControl(competition, handlers));
  vincoli.appendChild(renderLockControl(competition, handlers));
  panel.appendChild(vincoli);

  const quarantena = renderQuarantine(competition);
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

  const codes = codesByPlayer(competition);
  if (competition.lineup === null) {
    panel.appendChild(renderRosterOnly(competition, handlers, codes));
  } else {
    panel.appendChild(
      renderGroup(
        competition,
        handlers,
        codes,
        "titolari",
        "In campo",
        "Il portiere per primo, poi i dieci di movimento.",
        competition.starters,
      ),
    );
    panel.appendChild(
      renderGroup(
        competition,
        handlers,
        codes,
        "panchina",
        "Panchina",
        "L'ordine conta: quando i senza voto sono più delle sostituzioni disponibili entra chi sta più " +
          "in alto. «Su» lo fa entrare prima, «Giù» dopo.",
        competition.bench,
      ),
    );
    panel.appendChild(
      renderGroup(
        competition,
        handlers,
        codes,
        "fuori",
        "Fuori dai convocati",
        "In rosa, e non schierati in questa partita.",
        competition.outside,
      ),
    );
  }

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

  if (view.competitions.length === 0) {
    wrap.appendChild(
      paragraph(
        "La lega è stata letta e non riporta nessuna competizione in corso: non c'è nessuna formazione da schierare.",
        `color:${C.textSec};`,
      ),
    );
    return wrap;
  }

  for (const competition of view.competitions) {
    wrap.appendChild(renderCompetition(competition, handlers, save, edit, prova.attiva));
  }
  if (prova.attiva) wrap.appendChild(renderProvaMarchio(prova, "coda"));
  return wrap;
}
