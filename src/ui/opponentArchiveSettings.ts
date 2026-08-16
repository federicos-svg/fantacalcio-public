// ARCHIVIO AVVERSARI — la schermata da cui l'archivio entra, e da cui esce.
//
// È la superficie di src/opponentArchive.ts, e non fa nient'altro: nessuna
// validazione propria, nessuna lettura di storage, nessun conteggio calcolato
// qui. Riceve ciò che la memoria locale contiene ADESSO (riletto dal chiamante
// dopo ogni azione) e lo scrive; le decisioni sono già state prese dove sono
// verificabili senza un DOM.
//
// PERCHÉ UN FILE E NON UN MODULO DI INTERVISTA. Lo storico d'asta di cinque
// stagioni e i profili sono dati di persone reali (issue #234, nota privacy):
// nascono nel layer privato, dove quei dati possono stare, e da lì arrivano
// qui come un file che Pico sceglie a mano. Nessuna rete, nessun upload,
// nessun endpoint: il `FileReader` legge dal disco locale e il testo finisce
// nella memoria locale di QUESTO browser. È lo stesso idioma del caricamento
// manuale del listone (ui/views.ts `renderListoneManualOverride`), con una
// differenza deliberata: l'input non è nascosto dietro una `<label>`, perché
// un `input[type=file]` con `display:none` non è raggiungibile da tastiera —
// e questo è un comando che si usa da fermi, non in mezzo a un'asta.
//
// TRE COSE STANNO SULLO SCHERMO INSIEME, e nessuna delle tre è decorativa:
//  1. che cosa è caricato, IN NUMERI — stagioni, partecipanti, acquisti, e
//     quanti di quei partecipanti siedono davvero a un posto rivale. Si legge
//     prima dell'asta: è la differenza fra sapere che il pannello sarà muto e
//     scoprirlo mentre parte la chiamata;
//  2. la forma esatta che il file deve avere, scritta per esteso, così si può
//     preparare senza leggere una riga di codice;
//  3. il modo di TOGLIERE un archivio sbagliato, che altrimenti si rimuove
//     solo svuotando la memoria del browser a mano — cioè buttando via anche
//     il log dell'asta in corso, le riconferme e il listone.

import {
  historyArchiveSummary,
  historySummaryText,
  profilesArchiveSummary,
  profilesSummaryText,
  HISTORY_EMPTY_TEXT,
  PROFILES_EMPTY_TEXT,
  type ArchiveMessage,
} from "../opponentArchive.js";
import type {
  OpponentProfile,
  PastAuctionPurchase,
} from "../../packages/opponent-profiles/src/index.js";

/**
 * L'icona del menu Impostazioni per quest'area: una scatola d'archivio.
 *
 * Dichiarata qui e non accanto alle altre in `views.ts` `SETTINGS_ICONS` per
 * la ragione più prosaica: quest'area è tutta in questi due file nuovi, e
 * tenerci anche il glifo evita di toccare un file condiviso per tre righe.
 * Stesso idioma monocromatico `currentColor` delle altre, stessa viewBox 16.
 */
export const ARCHIVE_SETTINGS_ICON =
  '<path d="M1.5 4.5h13v2.5h-13z"/><path d="M2.6 7v6.5h10.8V7"/><path d="M6.3 9.6h3.4"/>';

/**
 * La forma esatta del file dello storico, da leggere come si legge una
 * ricetta. Sintetica al 100%: `person:…0001` non è nessuno e «ClubEsempio»
 * non esiste. Nessun dato reale entra in questo repository per nessuna via.
 */
export const HISTORY_FILE_TEMPLATE = `{
  "schemaVersion": 1,
  "purchases": [
    {
      "season": "2024/25",
      "personId": "person:00000000-0000-4000-8000-000000000001",
      "playerId": "identificativo-del-giocatore",
      "club": "ClubEsempio",
      "price": 42,
      "acquisition": "asta"
    }
  ]
}`;

/** La forma esatta del file dei profili. Sintetica per gli stessi motivi. */
export const PROFILES_FILE_TEMPLATE = `{
  "schemaVersion": 1,
  "profiles": [
    {
      "schemaVersion": 1,
      "personId": "person:00000000-0000-4000-8000-000000000001",
      "interviewId": "intervista-1",
      "affinityClubs": {
        "value": ["ClubEsempio"],
        "status": "confermato",
        "declaredAt": "2026-08-20"
      }
    }
  ]
}`;

/**
 * Le regole del file dello storico che un template non mostra da solo.
 *
 * Sono qui e non in un documento perché è qui che servono: chi prepara il file
 * ha questa schermata aperta, e una regola che vive altrove è una regola che
 * si scopre dal messaggio d'errore.
 */
const HISTORY_RULES: readonly string[] = [
  "`season`: esattamente `AAAA/AA`, per esempio `2024/25`. L'ordine cronologico dell'app è l'ordine alfabetico di questa etichetta, quindi `24-25` finirebbe in fondo senza dirlo a nessuno.",
  "`personId`: `person:` seguito dall'UUID della PERSONA nel registro lega (Impostazioni → Partecipanti e squadre), mai il nome e mai il posto a tavola. I posti cambiano mano fra una stagione e l'altra, un precedente segue la persona.",
  "`playerId`: l'identificativo del giocatore, lo stesso in tutte le stagioni. Se cambia, lo stesso giocatore viene contato come due giocatori diversi e i precedenti spariscono in silenzio.",
  "`club`: la squadra REALE del giocatore in quella stagione (Serie A), non la fantasquadra.",
  "`price`: crediti interi, da 0 in su.",
  "`acquisition`: `asta` oppure `riconferma`. Solo `asta` conta come riacquisto: rinnovare non è ricomprare.",
  "Nessun campo in più, da nessuna parte: un `name` o un'`email` di troppo fa rifiutare l'intero file, e questo è voluto — è la garanzia che nessun nome finisca in un archivio che parla di persone.",
  "Una sola riga per stagione + persona + giocatore. Due righe identiche gonfierebbero il conteggio dei precedenti, quindi il file viene rifiutato invece che ripulito.",
];

const PROFILES_RULES: readonly string[] = [
  "`personId`: come sopra, l'UUID della persona nel registro lega. Un solo profilo per persona.",
  "`interviewId`: un'etichetta libera che identifica l'intervista da cui il profilo viene.",
  "Ogni risposta è un oggetto `{ value, status, declaredAt }`: `status` è `confermato` o `proposto`, e SOLO `confermato` viene letto — una risposta proposta è una proposta, non una dichiarazione di Pico.",
  "`declaredAt`: data ISO `AAAA-MM-GG`, e deve essere una data vera.",
  "Campi ammessi: `spendingTiming`, `tiltSusceptibility`, `weaknesses`, `affinityClubs`, `recurringTargets`, `notes`. Tutti facoltativi; il pannello dei precedenti legge solo `affinityClubs`.",
  "Nessun campo in più: nessun nome, nessun contatto. Vale la stessa regola dello storico, per la stessa ragione.",
];

export interface OpponentArchiveSettingsProps {
  /** Lo storico COME LA MEMORIA LOCALE LO CONTIENE ADESSO, non come è stato inviato. */
  readonly history: readonly PastAuctionPurchase[];
  readonly profiles: readonly OpponentProfile[];
  /** posto -> persona, dal registro lega: serve a dire quanti avversari sono coperti. */
  readonly seats: Readonly<Record<string, string | null>>;
  readonly selfSeatId: string;
  /** L'esito dell'ULTIMA azione su questo archivio, o `null` se non ce n'è stata. */
  readonly historyMessage: ArchiveMessage | null;
  readonly profilesMessage: ArchiveMessage | null;
  readonly onHistoryFileText: (text: string) => void;
  readonly onProfilesFileText: (text: string) => void;
  readonly onForgetHistory: () => void;
  readonly onForgetProfiles: () => void;
}

/**
 * Il selettore di file, con la sua etichetta.
 *
 * `input.value = ""` dopo ogni lettura non è un tic: senza, riselezionare LO
 * STESSO file dopo averlo corretto non emette nessun evento `change`, e la
 * schermata resta ferma sull'errore precedente come se la correzione non
 * fosse servita a niente.
 */
function filePicker(id: string, labelText: string, onText: (text: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "archive-picker";

  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = id;
  label.textContent = labelText;
  wrap.appendChild(label);

  const input = document.createElement("input");
  input.id = id;
  input.type = "file";
  input.accept = "application/json,.json";
  input.className = "archive-picker__input";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onText(typeof reader.result === "string" ? reader.result : "");
    };
    // Un file illeggibile dal disco non è la stessa cosa di un file non
    // conforme, ma per questa schermata l'esito è lo stesso e va detto: il
    // testo vuoto non è JSON, quindi passa dal rifiuto ordinario invece di
    // lasciare la schermata muta.
    reader.onerror = () => onText("");
    reader.readAsText(file);
    input.value = "";
  });
  wrap.appendChild(input);

  return wrap;
}

/** L'esito dell'ultima azione. Assente finché un'azione non c'è stata. */
function messageLine(id: string, message: ArchiveMessage | null): HTMLElement | null {
  if (message === null) return null;
  const p = document.createElement("p");
  p.id = id;
  p.className = `archive-message archive-message--${message.tone}`;
  // `role="status"` e non `alert`: la schermata non è modale e l'operatore ha
  // appena compiuto il gesto che lo produce, quindi va annunciato senza
  // interrompere ciò che sta leggendo.
  p.setAttribute("role", "status");
  p.textContent = message.text;
  return p;
}

/** Il blocco «che forma deve avere il file», chiuso finché non serve. */
function shapeHelp(idPrefix: string, template: string, rules: readonly string[]): HTMLElement {
  const details = document.createElement("details");
  details.className = "archive-shape";
  details.id = `${idPrefix}-shape`;

  const summary = document.createElement("summary");
  summary.className = "archive-shape__summary";
  summary.textContent = "Che forma deve avere il file";
  details.appendChild(summary);

  const pre = document.createElement("pre");
  pre.className = "archive-shape__template";
  pre.textContent = template;
  details.appendChild(pre);

  const list = document.createElement("ul");
  list.className = "archive-shape__rules";
  for (const rule of rules) {
    const li = document.createElement("li");
    li.textContent = rule;
    list.appendChild(li);
  }
  details.appendChild(list);

  return details;
}

/**
 * Una delle due sezioni. Identiche nella struttura di proposito: sono la
 * stessa operazione su due archivi, e differenziarle graficamente farebbe
 * sembrare che una delle due segua regole diverse.
 */
function archiveSection(args: {
  readonly idPrefix: string;
  readonly title: string;
  readonly intro: string;
  readonly pickerLabel: string;
  readonly summaryText: string;
  readonly loaded: boolean;
  readonly message: ArchiveMessage | null;
  readonly template: string;
  readonly rules: readonly string[];
  readonly onFileText: (text: string) => void;
  readonly onForget: () => void;
  readonly forgetLabel: string;
}): HTMLElement {
  const section = document.createElement("section");
  section.id = `${args.idPrefix}-section`;
  section.className = "archive-section";
  section.setAttribute("aria-label", args.title);

  const heading = document.createElement("h3");
  heading.className = "archive-section__title";
  heading.textContent = args.title;
  section.appendChild(heading);

  const intro = document.createElement("p");
  intro.className = "hint-text";
  intro.textContent = args.intro;
  section.appendChild(intro);

  const summary = document.createElement("p");
  summary.id = `${args.idPrefix}-summary`;
  summary.className = args.loaded ? "archive-summary" : "archive-summary archive-summary--empty";
  summary.textContent = args.summaryText;
  section.appendChild(summary);

  const controls = document.createElement("div");
  controls.className = "archive-controls";
  controls.appendChild(filePicker(`${args.idPrefix}-file`, args.pickerLabel, args.onFileText));

  if (args.loaded) {
    const forget = document.createElement("button");
    forget.type = "button";
    forget.id = `${args.idPrefix}-forget`;
    forget.className = "btn btn--secondary";
    forget.textContent = "Rimuovi";
    forget.title = args.forgetLabel;
    forget.setAttribute("aria-label", args.forgetLabel);
    forget.addEventListener("click", args.onForget);
    controls.appendChild(forget);
  }
  section.appendChild(controls);

  const message = messageLine(`${args.idPrefix}-message`, args.message);
  if (message !== null) section.appendChild(message);

  section.appendChild(shapeHelp(args.idPrefix, args.template, args.rules));

  return section;
}

export function renderOpponentArchiveSettings(props: OpponentArchiveSettingsProps): HTMLElement {
  const panel = document.createElement("section");
  panel.id = "opponent-archive-settings";
  panel.className = "opponent-archive-settings";
  panel.setAttribute("aria-label", "Archivio avversari");

  const intro = document.createElement("p");
  intro.className = "hint-text";
  intro.textContent =
    "Da qui entra ciò che il pannello AVVERSARI: I PRECEDENTI misura durante l'asta: gli acquisti delle stagioni passate e, facoltativi, i profili d'intervista. Restano nella memoria locale di questo browser, non vengono inviati da nessuna parte e non finiscono in nessun repository: sono spese di persone reali della lega. Un file non conforme viene rifiutato per intero e non tocca quello che è già caricato.";
  panel.appendChild(intro);

  const historySummary = historyArchiveSummary(props.history, props.seats, props.selfSeatId);
  panel.appendChild(
    archiveSection({
      idPrefix: "archive-history",
      title: "Storico d'asta (stagioni passate)",
      intro:
        "È la sola fonte dei precedenti: chi ha già ricomprato il giocatore chiamato, quanto ha concentrato la spesa sul suo club, quanto ha speso sui propri più cari. Senza questo il pannello non ha fatti e lo dichiara.",
      pickerLabel: "Carica lo storico d'asta (file JSON dal disco)",
      summaryText: props.history.length === 0 ? HISTORY_EMPTY_TEXT : historySummaryText(historySummary),
      loaded: props.history.length > 0,
      message: props.historyMessage,
      template: HISTORY_FILE_TEMPLATE,
      rules: HISTORY_RULES,
      onFileText: props.onHistoryFileText,
      onForget: props.onForgetHistory,
      forgetLabel: "Rimuovi lo storico d'asta dalla memoria locale di questo browser",
    }),
  );

  const profilesSummary = profilesArchiveSummary(props.profiles, props.seats, props.selfSeatId);
  panel.appendChild(
    archiveSection({
      idPrefix: "archive-profiles",
      title: "Profili d'intervista (facoltativi)",
      intro:
        "Aggiungono al pannello una sola cosa: il club tifato dichiarato in intervista, accostato alla spesa MISURATA su quel club. Da solo il tifo non fa comparire nessuno — tifare una squadra non è averci speso.",
      pickerLabel: "Carica i profili d'intervista (file JSON dal disco)",
      summaryText: props.profiles.length === 0 ? PROFILES_EMPTY_TEXT : profilesSummaryText(profilesSummary),
      loaded: props.profiles.length > 0,
      message: props.profilesMessage,
      template: PROFILES_FILE_TEMPLATE,
      rules: PROFILES_RULES,
      onFileText: props.onProfilesFileText,
      onForget: props.onForgetProfiles,
      forgetLabel: "Rimuovi i profili d'intervista dalla memoria locale di questo browser",
    }),
  );

  return panel;
}
