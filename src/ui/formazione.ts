// LA SCHERMATA FORMAZIONE — la prima voce della barra, e la pagina che apre il
// sito quando c'è davvero una squadra da schierare.
//
// QUESTO FILE NON DECIDE NIENTE. Riceve un modello già costruito
// (`buildFormazioneView`, nel contratto di osservazione) e lo dipinge: nessuna
// derivazione, nessun default, nessun testo inventato sopra un dato mancante.
// La ragione è la stessa che governa la pagina: le decisioni che contano —
// quale schermata aprire, quali vincoli valgono ancora, che cosa significa
// «salvato» — sono funzioni pure verificate senza browser, e una funzione di
// render che ne rifacesse una pezzo per pezzo produrrebbe una seconda verità.
//
// L'AVVISO PRENDE IL POSTO DELLA SQUADRA. Quando lo stato del canale non è noto
// il modello non porta nessuna competizione, quindi qui non c'è niente da
// disegnare oltre l'avviso — non per disciplina di chi scrive, ma perché non
// esiste il dato con cui disegnare altro. Una griglia vuota accanto a un avviso
// si leggerebbe «non ho ancora schierato», che è una conclusione precisa e
// falsa: chi apre il sito deve capire che il problema è la lettura, non la sua
// formazione.
//
// ACCESSIBILITÀ, come nelle altre schermate: bottoni veri e caselle vere (mai
// un `div` con un `click`), etichette legate al controllo, `aria-*` sui gruppi,
// e il fuoco che resta dove era — `render()` ricostruisce l'albero a ogni clic,
// quindi ogni controllo ha un `id` stabile su cui la shell riporta il fuoco.

import { C, escHtml } from "./theme.js";
import type {
  FormazioneCompetitionView,
  FormazioneView,
  LineupDifference,
  Module,
  SubmissionUiState,
  SubmissionViolation,
} from "../../packages/league-channel-contract/src/index.js";
import { MODULES } from "../../packages/league-channel-contract/src/index.js";

/** I gesti della schermata. Nessuno di loro tocca la rete: li serve la shell. */
export interface FormazioneHandlers {
  readonly onToggleLockedStarter: (competitionId: string, playerId: string) => void;
  readonly onSetLockedModule: (competitionId: string, module: Module | null) => void;
  readonly onToggleLocked: (competitionId: string) => void;
  readonly onSave: (competitionId: string) => void;
}

/** Ciò che la shell sa e il modello non porta: l'esito dell'ultimo salvataggio. */
export interface FormazioneSaveState {
  readonly competitionId: string | null;
  readonly state: SubmissionUiState;
  readonly blocking: readonly SubmissionViolation[];
  readonly warnings: readonly SubmissionViolation[];
}

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
  const heading = document.createElement("div");
  heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${color};`;
  heading.textContent = label;
  wrap.appendChild(heading);
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
function renderSubmissionState(save: FormazioneSaveState): HTMLElement {
  const box = document.createElement("div");
  box.id = "formazione-stato-invio";
  box.dataset.stato = save.state.kind;
  box.setAttribute("role", "status");
  const colore =
    save.state.kind === "inviato_confermato"
      ? C.green
      : save.state.kind === "inviato_esito_ignoto"
        ? C.stopRed
        : C.textSec;
  box.style.cssText = `border:1px solid ${colore};border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:6px;`;

  const etichetta = document.createElement("div");
  etichetta.id = "formazione-stato-invio-etichetta";
  etichetta.style.cssText = `font-size:12px;font-weight:800;letter-spacing:0.06em;color:${colore};`;
  etichetta.textContent =
    save.state.kind === "inviato_confermato"
      ? "INVIATA E CONFERMATA DALLA PIATTAFORMA"
      : save.state.kind === "inviato_esito_ignoto"
        ? "INVIATA, ESITO IGNOTO"
        : "DA INVIARE — NULLA È PARTITO";
  box.appendChild(etichetta);
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

/** Il selettore del modulo, con l'interruttore «modulo bloccato» accanto. */
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
  for (const module of MODULES) {
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

/** La rosa con la spunta «questo lo voglio in campo» su ogni riga. */
function renderPlayers(
  competition: FormazioneCompetitionView,
  handlers: FormazioneHandlers,
): HTMLElement {
  const group = document.createElement("div");
  group.id = `formazione-rosa-${competition.competitionId}`;
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `Giocatori da tenere in campo — ${competition.label}`);
  group.style.cssText = `display:flex;flex-direction:column;gap:4px;`;

  // IL MOTIVO ACCANTO A CIÒ CHE LO CAUSA. Un elenco di codici in fondo alla
  // pagina obbliga chi legge a ricostruire da sé quale spunta ha creato quale
  // problema; qui il codice compare anche sulla riga del giocatore che lo porta.
  const codiciPerGiocatore = new Map<string, string[]>();
  for (const issue of [...competition.issues.rejections, ...competition.issues.warnings]) {
    for (const playerId of issue.playerIds) {
      const elenco = codiciPerGiocatore.get(playerId) ?? [];
      if (!elenco.includes(issue.code)) elenco.push(issue.code);
      codiciPerGiocatore.set(playerId, elenco);
    }
  }

  for (const player of competition.players) {
    const row = document.createElement("div");
    row.className = "formazione-riga";
    row.style.cssText = `display:flex;align-items:center;gap:10px;padding:4px 6px;border-radius:6px;background:${player.starter ? C.panelInner : "transparent"};`;

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

    const label = document.createElement("label");
    label.setAttribute("for", id);
    label.style.cssText = `font-size:13px;color:${C.textPrimary};display:flex;gap:8px;align-items:baseline;`;
    const ruolo = ROLE_LABEL[player.role] ?? player.role;
    const stato = player.starter ? "in campo" : "in panchina o fuori";
    const disponibilita = player.availability === undefined ? "" : ` · ${player.availability}`;
    label.innerHTML =
      `<strong style="font-family:${C.mono};">${escHtml(player.id)}</strong>` +
      `<span style="color:${C.textDim};font-size:12px;">${escHtml(ruolo)} · ${escHtml(stato)}${escHtml(disponibilita)}</span>`;
    row.appendChild(label);

    const codici = codiciPerGiocatore.get(player.id) ?? [];
    if (codici.length > 0) {
      const nota = document.createElement("span");
      nota.className = "formazione-riga__motivo";
      nota.style.cssText = `font-size:11px;font-family:${C.mono};color:${C.stopRed};`;
      nota.textContent = codici.join(" ");
      row.appendChild(nota);
    }

    group.appendChild(row);
  }
  return group;
}

/** I vincoli salvati che oggi non valgono più: si vedono, non si scartano. */
function renderQuarantine(competition: FormazioneCompetitionView): HTMLElement | null {
  if (competition.quarantined.length === 0) return null;
  const box = document.createElement("div");
  box.id = `formazione-quarantena-${competition.competitionId}`;
  box.setAttribute("role", "alert");
  box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
  const heading = document.createElement("div");
  heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${C.stopRed};`;
  heading.textContent = "VINCOLI MESSI DA PARTE";
  box.appendChild(heading);
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
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = `formazione-competizione-${competition.competitionId}`;
  panel.setAttribute("aria-label", `Formazione — ${competition.label}`);
  panel.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

  const giornata = competition.matchday === null ? "giornata non nota" : `giornata ${competition.matchday}`;
  panel.appendChild(sectionTitle(`${competition.label.toUpperCase()} — ${giornata.toUpperCase()}`));

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
          "letta: le spunte dicono chi vuoi in campo, e restano anche se non salvi adesso.",
        `color:${C.textSec};`,
      ),
    );
  }

  if (competition.constraints.locked) {
    panel.appendChild(
      paragraph(
        "Formazione blindata: nessun comando di questa pagina la può cambiare finché la blindatura resta accesa.",
        `color:${C.textAccent};`,
      ),
    );
  }

  panel.appendChild(renderModuleControl(competition, handlers));
  panel.appendChild(renderLockControl(competition, handlers));

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
    const heading = document.createElement("div");
    heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${C.stopRed};`;
    heading.textContent = "CON QUESTI VINCOLI LA FORMAZIONE NON SI PUÒ FARE";
    impossibile.appendChild(heading);
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
    const heading = document.createElement("div");
    heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${C.textAccent};`;
    heading.textContent = "SCELTE COSTOSE, NON ERRORI — RESTANO TUE";
    avvisi.appendChild(heading);
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
  // formazione in mano non rispetta un vincolo, lo si dice qui e il salvataggio
  // si ferma: questa pagina non sa ricalcolare l'undici (il produttore vive
  // fuori dal core pubblico), quindi non finge di averlo fatto.
  if (competition.unmet.length > 0) {
    const box = document.createElement("div");
    box.id = `formazione-vincoli-non-rispettati-${competition.competitionId}`;
    box.setAttribute("role", "alert");
    box.style.cssText = `border:1px solid ${C.stopRedDark};border-radius:8px;padding:8px 12px;`;
    const heading = document.createElement("div");
    heading.style.cssText = `font-size:11px;font-weight:700;letter-spacing:0.06em;color:${C.stopRed};`;
    heading.textContent = "VINCOLI NON RISPETTATI DA QUESTA FORMAZIONE";
    box.appendChild(heading);
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

  panel.appendChild(renderPlayers(competition, handlers));

  const salva = document.createElement("button");
  salva.type = "button";
  salva.id = `formazione-salva-${competition.competitionId}`;
  salva.className = "btn";
  salva.disabled = !competition.feasible || competition.unmet.length > 0 || competition.lineup === null;
  salva.textContent = "Salva";
  salva.setAttribute("aria-describedby", "formazione-stato-invio");
  salva.addEventListener("click", () => handlers.onSave(competition.competitionId));
  panel.appendChild(salva);

  if (save.competitionId === competition.competitionId) {
    panel.appendChild(renderSubmissionState(save));
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
  notice = "",
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "screen-container";
  wrap.id = "formazione-screen";
  wrap.style.cssText = `flex:1;padding:18px 24px;gap:14px;`;

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
    wrap.appendChild(renderCompetition(competition, handlers, save));
  }
  return wrap;
}
