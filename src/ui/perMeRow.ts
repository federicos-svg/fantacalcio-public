// PER ME — le parole e la riga cliccabile della prima metà del blocco
// «giocatore suggerito».
//
// L'altra metà del paio di src/perMeCandidates.ts: là il calcolo puro, qui la
// forma. Stesso taglio di ./baitRow.ts, ./tierBand.ts e ./liveFacts.ts — ogni
// stringa nasce da una funzione pura ed è coperta da test, così anche la COPIA
// è falsificabile e non solo i numeri.
//
// IL TITOLO NOMINA CIÒ CHE IL BLOCCO CONTIENE, NON UN'INTENZIONE — la regola
// con cui ./liveFacts.ts ha corretto «INTERESSE SUL GIOCATORE» in «I
// PRECEDENTI». L'occhiello per esteso dice quindi che cosa le righe SONO —
// liberi che il piano copre, che si possono pagare, ordinati per surplus e
// poi per appetibilità — e nient'altro.
//
// LA FRASE CHE IL BLOCCO PUÒ DIRE, E QUELLA CHE NON PUÒ. Con la decisione di
// Pico del 2026-08-25 («il numero uno è il filtro a monte ma il due è quello
// successivo») il surplus è tornato al suo posto nell'ordine, quindi «costa
// meno di quanto vale per te» è di nuovo DICIBILE — ma **solo** per le righe
// che portano un valore dichiarato da Pico, e infatti solo quelle lo dicono.
// Per le altre non c'è nessuna sottrazione da fare: nessun numero di ripiego,
// nessuno zero al posto della dichiarazione che manca, e l'assenza detta una
// volta sola nella nota, contata («N righe senza valore dichiarato»). Il
// perché di «una volta sola» invece che «su ogni riga» è misurato e sta
// accanto a `perMeSurplusText`.
//
// NESSUN NUMERO DIRETTIVO, e non per prudenza: `fair_to_me_promoted` e
// `decision_promoted` sono gate OFF (PROJECT_STATE.md §"Gate attivi"). Qui non
// compare un «offri Y», una banda, un prezzo previsto, un badge OCCASIONE o un
// punteggio di occasione. Compaiono il valore che PICO HA DICHIARATO (§D9
// ingrediente 2, non un numero del motore) con la sua distanza dall'ancora,
// l'ancora corrente misurata con la sua provenienza, il piano dichiarato da
// Pico, il max bid hard-safe e una posizione in un ordine dichiarato.
// `perMeRow.test.ts` §"guardia di deriva" cerca il vocabolario vietato su TUTTO
// il testo del sottoblocco, e la sola parola «valore» che lascia passare è
// quella che porta con sé «dichiarato».
//
// IL GESTO È QUELLO DEL LISTONE, E LO È DAVVERO. La riga chiama
// `selectListonePlayer()` — l'UNICA via che arma la CTA «Avvia» — con la
// `ListonePlayer` che il candidato porta con sé. Non esiste una seconda via di
// selezione: due strade per selezionare un giocatore sono due superfici da
// sorvegliare, e la seconda diverge il giorno in cui la prima cambia. È
// esattamente ciò che ./baitRow.ts fa già per l'altra metà del blocco.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso.

import type {
  PerMeCandidate,
  PerMeEmptyReason,
  PerMeParameters,
  PerMeReading,
} from "../perMeCandidates.js";
import { perMeShownCandidates } from "../perMeCandidates.js";
import { MAX_BID_LABEL } from "./budgetLabels.js";
import { formatSignedPercent } from "./liveFacts.js";
import type { ListonePlayer } from "./listone.js";
import { renderSchedaCardTitle } from "./schedaCard.js";

/** Il NOME del sottoblocco. Nomina il contenuto, non l'intenzione. */
export const PER_ME_TITLE_SHORT = "PER ME";

/**
 * L'occhiello per esteso: il nome più ciò che le righe SONO, nell'ordine in cui
 * i criteri le ordinano. `PER_ME_TITLE_SHORT` è un prefisso letterale per
 * costruzione (il secondo è interpolato dal primo), e un test lo verifica: i
 * due non possono diventare due nomi diversi.
 */
export const PER_ME_TITLE = `${PER_ME_TITLE_SHORT} — liberi nel tuo piano, che puoi pagare, per surplus e appetibilità`;

/**
 * Quale dei due va a schermo. Stessa regola — e stessa misura — di
 * `baitTitleFor`: la seconda metà dell'occhiello descrive CHE COSA SONO LE
 * RIGHE, e senza righe non c'è niente da descrivere. La frase del silenzio,
 * subito sotto, dice già per intero perché non ce ne sono; ripetere l'elenco
 * dei criteri sopra un «non lo so» aggiunge altezza e zero informazione, su una
 * schermata che è già oltre budget.
 */
export function perMeTitleFor(reading: PerMeReading): string {
  return reading.kind === "candidates" ? PER_ME_TITLE : PER_ME_TITLE_SHORT;
}

/** Il secondo canale della selezione, oltre al contorno: una parola. */
export const PER_ME_SELECTED_MARK = "✓ selezionato";

/**
 * QUANDO NON COMPARE, DICE QUALE SILENZIO È. Vocabolario CHIUSO di nove motivi,
 * sul modello di `baitEmptyText`: nove frasi diverse, perché sono nove cose
 * diverse, e appiattirle sarebbe già mezza bugia.
 *
 * NESSUNA DI QUESTE FRASI INVENTA UN NUMERO e nessuna dice «non c'è nessuno»
 * quando la verità è «non lo so»: le tre del piano indicano la dichiarazione che
 * manca, le due delle quotazioni indicano il dato che manca, e quella del
 * listino rifiutato porta il motivo del motore invece di nasconderlo.
 */
export function perMeEmptyText(reason: PerMeEmptyReason): string {
  switch (reason) {
    case "no-pool":
      return "Nessun listone caricato: senza righe non c'è una popolazione da guardare.";
    case "no-quotation":
      return "Nessuna riga del listone porta la Qt.A: senza quotazione non esiste un'ancora da misurare, e un'ancora inventata non è un'ancora.";
    case "anchors-refused":
      return "Le quotazioni caricate non passano la validazione del motore: da un listino rotto non si deriva nessuna ancora.";
    case "plan-absent":
      return "Nessun piano rosa dichiarato: il primo criterio dell'ordine è «dentro il tuo piano», e senza piano quell'ordine non esiste. Il pannello che raccoglieva quella dichiarazione è stato rimosso, quindi oggi questo sottoblocco non ha di che parlare: resta muto invece di ordinare su un piano indovinato.";
    case "plan-incomplete":
      return "Piano rosa dichiarato a metà: manca un target di ruolo o la versione del piano, e un piano incompleto non attraversa il confine verso il motore.";
    case "plan-invalid":
      return "Piano rosa rifiutato dal motore: finché la dichiarazione non è valida non se ne deriva nessun ordine.";
    case "no-open-role":
      return "Nessun reparto aperto con margine: un acquisto non sarebbe registrabile in nessun ruolo.";
    case "no-free-in-open-roles":
      return "Nessun libero con quotazione nei reparti che ti restano aperti.";
    case "no-affordable":
      return "Ci sono liberi nei tuoi reparti aperti, ma il tuo max bid non copre l'ancora corrente di nessuno.";
  }
}

/**
 * LA NOTA COMPARE SOLO DOVE UN PARAMETRO HA GOVERNATO QUALCOSA — stessa regola,
 * e stessa ragione di altezza, di `baitNoteApplies`.
 *
 * Con le righe la nota c'è per intero. Nei due silenzi che nascono DOPO la
 * misura — `no-free-in-open-roles` e `no-affordable` — la nota resta perché lì
 * un parametro ha davvero deciso: l'ancora corrente contro cui `no-affordable`
 * si pronuncia è corretta (o non corretta) dal campione minimo dichiarato. Negli
 * altri sette esiti nessun numero è mai stato prodotto: recitare i parametri
 * sarebbe elencare soglie che non hanno governato niente.
 */
export function perMeNoteApplies(reading: PerMeReading): boolean {
  return (
    reading.kind === "candidates" ||
    reading.reason === "no-free-in-open-roles" ||
    reading.reason === "no-affordable"
  );
}

/** «Nome (A · Inter)» — chi è, in una riga. */
export function perMeHeadText(candidate: PerMeCandidate): string {
  return `${candidate.player.name} (${candidate.role} · ${candidate.player.club})`;
}

/**
 * IL CRITERIO 2, DETTO A SCHERMO — il surplus, cioè la distanza fra il valore
 * che PICO HA DICHIARATO e l'ancora corrente misurata.
 *
 * SI SCRIVE COME UNA DISTANZA, NON COME UN VERDETTO. «12 cr sotto il tuo
 * valore dichiarato (48 cr)» è un fatto ispezionabile: c'è la distanza, c'è il
 * minuendo, e il sottraendo sta nella riga dell'ancora subito sotto — chi
 * legge può rifare la sottrazione a mano. Non c'è nessun «è un'occasione»,
 * nessun badge, nessun punteggio: quella promozione ha un gate, e il gate è
 * OFF.
 *
 * I TRE CASI IN CUI C'È QUALCOSA DA DIRE, e nessuno è un default dell'altro:
 *  - sotto il valore dichiarato → la distanza, con «sotto»;
 *  - sopra → la stessa distanza con «sopra», e la riga RESTA a schermo: qui il
 *    surplus ordina e non esclude (src/perMeCandidates.ts §4);
 *  - esattamente pari → si dice «esattamente», perché «0 cr sotto» si legge
 *    come un arrotondamento e questo è un pareggio.
 *
 * E IL QUARTO CASO — valore non dichiarato — RESTITUISCE `null`: niente riga.
 * Non è l'assenza taciuta, è l'assenza detta UNA VOLTA SOLA, nella nota, con
 * il suo contatore («N righe senza valore dichiarato, in fondo senza surplus
 * fabbricato»). La ragione è MISURATA, non stimata: oggi nessuna riga ha un
 * valore dichiarato — l'app non ha ancora una sorgente per quel listino —
 * quindi ripetere la stessa frase su ogni candidato porta il sottoblocco pieno
 * da 574px a 683px a 390x844, cioè sopra il tetto di regressione che
 * e2e/per-me-row.spec.ts sorveglia, per zero fatti in più: tre volte la stessa
 * riga dice quello che la nota dice una volta e meglio (perché le conta).
 * Quando invece un surplus c'è, la riga lo porta: è il criterio che l'ha messa
 * lì, e distingue una riga dall'altra.
 *
 * `null` E NON `""`: una stringa vuota è una riga di testo che il renderer
 * aggiunge lo stesso e che una guardia di deriva legge come «coperto». `null`
 * dice «qui non c'è niente da mostrare» e il chiamante deve gestirlo.
 */
export function perMeSurplusText(candidate: PerMeCandidate): string | null {
  const { declaredValue, surplus } = candidate;
  if (declaredValue === null || surplus === null) return null;
  if (surplus === 0) return `esattamente il tuo valore dichiarato (${declaredValue} cr)`;
  const where = surplus > 0 ? "sotto" : "sopra";
  return `${Math.abs(surplus)} cr ${where} il tuo valore dichiarato (${declaredValue} cr)`;
}

/**
 * IL CRITERIO 3, DETTO A SCHERMO. È una POSIZIONE in un ordine dichiarato, non
 * un punteggio: il numero dell'indice non compare, perché non è il numero che
 * ordina questa riga e mostrarlo lo farebbe leggere come un giudizio.
 *
 * NON È SCOMPARSO CON IL RITORNO DEL SURPLUS: è sceso di un gradino e decide a
 * parità di surplus — e da solo, per le righe che un valore dichiarato non ce
 * l'hanno, che oggi sono tutte.
 *
 * L'assenza di verdetto ha la sua frase e non un numero di ripiego: una riga
 * senza posizione non è «l'ultima», è «senza verdetto», e l'ordine la tratta
 * come tale (`compareAppealPosition`, src/perMeCandidates.ts).
 */
export function perMeAppealText(candidate: PerMeCandidate): string {
  if (candidate.appealPosition === null || candidate.appealOrderSize === null) {
    return "senza verdetto di appetibilità";
  }
  return `${candidate.appealPosition}ª di ${candidate.appealOrderSize} per appetibilità`;
}

/**
 * L'ANCORA CORRENTE, MOSTRATA E POI SOTTRATTA — è il sottraendo del surplus
 * della riga sopra, e si mostra per intero proprio perché quella sottrazione
 * si possa rifare a mano. Porta sempre con sé i tre pezzi
 * che la rendono ispezionabile: la Qt.A nuda, l'inflazione applicata e il
 * campione su cui poggia. In cold start non c'è un numero al posto della misura
 * mancante: c'è la frase che dice che la misura manca.
 */
export function perMeAnchorText(candidate: PerMeCandidate): string {
  const a = candidate.anchor;
  const head = `ancora ${a.correctedAnchor} cr (Qt.A ${a.baseAnchor}`;
  if (a.coldStart || a.inflationApplied === null) {
    // La SOGLIA del campione non si ripete qui: sta nella nota, accanto agli
    // altri parametri, ed è la stessa per tutte le righe. Ripeterla su ognuna
    // costerebbe una riga di testo per candidato su uno schermo da 390px senza
    // aggiungere un fatto.
    return `${head} · nessuna inflazione misurata)`;
  }
  const where = a.basis === "role-inflation" ? "del ruolo" : "del tavolo";
  const what = a.n === 1 ? "acquisto" : "acquisti";
  return `${head} · inflazione misurata ${formatSignedPercent(a.inflationApplied)} su ${a.n} ${what} ${where})`;
}

/**
 * IL CRITERIO 1 — IL FILTRO — DETTO A SCHERMO, più il tetto hard-safe accanto.
 *
 * «dentro/fuori dal piano» è un FATTO CONTABILE (`fitsPlan`), non un consiglio e
 * non un veto: un prezzo fuori piano resta comprabile se il budget lo consente,
 * semplicemente si sa che sfora. Il max bid porta il nome dichiarato in
 * ./budgetLabels.ts e non una formulazione propria: due nomi per due grandezze,
 * non cinque per due.
 */
export function perMePlanText(candidate: PerMeCandidate): string {
  const where = candidate.withinRolePlan ? "nel piano" : "fuori dal piano";
  // Il RUOLO si scrive con la lettera e non col nome esteso: il nome per esteso
  // costava una riga di testo in più a 390px, e la lettera è già quella che la
  // testa della riga porta due righe sopra.
  // «slot» è invariabile in italiano: qui non c'è nessun plurale da scegliere,
  // e un ternario con i due rami uguali sarebbe un ramo che non gira mai.
  return (
    `${where} ${candidate.role} (${candidate.planAllocation} cr / ` +
    `${candidate.planSlotsRemaining} slot) · ${MAX_BID_LABEL} ${candidate.maxBid} cr`
  );
}

/**
 * La nota del sottoblocco: la PROVENIENZA, l'ORDINE dichiarato criterio per
 * criterio, i parametri in vigore, la SCELTA NON RATIFICATA che resta e i DUE
 * contatori delle assenze — stesso modello di `baitNoteText` e di
 * `PrecedentsReading.thresholds`.
 *
 * L'ordine si stampa per esteso di proposito: i suoi primi due criteri sono la
 * decisione di Pico del 2026-08-25, e un ordine che non si legge è un peso
 * nascosto scritto in un file.
 *
 * I DUE CONTATORI SONO DUE, e non uno solo: «non ha un valore dichiarato» e
 * «non ha un verdetto di appetibilità» sono due assenze diverse, di due
 * ingredienti diversi, e ognuna manda la riga in fondo per una ragione sua.
 * Compaiono solo quando c'è qualcosa da contare.
 */
export function perMeNoteText(
  parameters: PerMeParameters,
  planVersion: string | null,
  withoutAppealPosition: number,
  withoutDeclaredValue: number,
): string {
  const parts = [
    "Qt.A del listone corretta dall'inflazione misurata" +
      (planVersion === null ? "" : `, piano «${planVersion}»`),
    "ordine: piano → surplus dichiarato → appetibilità del ruolo → ancora → chiave di listone",
    `campione minimo ${parameters.minInflationSample}`,
    `${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} al massimo (${parameters.rowsMaxStatus})`,
    "NON RATIFICATA: a parità di surplus decide l'appetibilità del ruolo",
  ];
  if (withoutDeclaredValue > 0) {
    parts.push(
      `${withoutDeclaredValue} ${withoutDeclaredValue === 1 ? "riga" : "righe"} senza valore dichiarato, in fondo senza surplus fabbricato`,
    );
  }
  if (withoutAppealPosition > 0) {
    parts.push(
      `${withoutAppealPosition} ${withoutAppealPosition === 1 ? "riga" : "righe"} senza verdetto di appetibilità, in fondo senza posizione fabbricata`,
    );
  }
  return parts.join(" · ");
}

/**
 * TUTTO il testo del sottoblocco, in una stringa. Esiste per essere passato
 * alla guardia di deriva: una regex su questa stringa copre titolo, motivi,
 * teste, ancore, piano, posizioni e nota insieme, invece di sette asserzioni
 * che si dimenticano l'ottava. Riproduce SOLO ciò che la vista mostra davvero —
 * una guardia che leggesse testo non renderizzato sorveglierebbe un'altra pagina.
 */
export function perMeSectionText(reading: PerMeReading): string {
  const out: string[] = [perMeTitleFor(reading)];
  if (reading.kind === "empty") {
    out.push(perMeEmptyText(reading.reason));
    if (perMeNoteApplies(reading)) {
      out.push(perMeNoteText(reading.parameters, null, 0, 0));
    }
    return out.join("\n");
  }
  for (const candidate of perMeShownCandidates(reading)) {
    out.push(perMeHeadText(candidate));
    const surplus = perMeSurplusText(candidate);
    if (surplus !== null) out.push(surplus);
    out.push(perMeAppealText(candidate));
    out.push(perMeAnchorText(candidate));
    out.push(perMePlanText(candidate));
  }
  out.push(
    perMeNoteText(
      reading.parameters,
      reading.planVersion,
      reading.withoutAppealPosition,
      reading.withoutDeclaredValue,
    ),
  );
  return out.join("\n");
}

// ─── La riga a schermo ───────────────────────────────────────────────────────

export interface PerMeSectionProps {
  readonly reading: PerMeReading;
  /** `listonePlayerKey` del giocatore attualmente selezionato, o `null`. */
  readonly selectedKey: string | null;
}

function line(className: string, text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Il sottoblocco intero. `onSelect` È `selectListonePlayer` e non un suo
 * gemello: il candidato porta la propria `ListonePlayer`, quindi la stessa
 * funzione del listone si applica senza adattatori.
 *
 * ACCESSIBILITÀ, e non per compilare una casella: la riga è un `<button>` VERO.
 * Tab la raggiunge, Invio e Spazio la attivano, il dito la tocca, e non c'è un
 * solo listener di tastiera scritto a mano da tenere allineato — è il browser a
 * garantirlo.
 */
export function renderPerMeSection(
  props: PerMeSectionProps,
  onSelect: (player: ListonePlayer) => void,
): HTMLElement {
  const { reading, selectedKey } = props;
  const section = document.createElement("section");
  section.id = "per-me-block";
  section.className = "per-me";
  section.setAttribute("aria-labelledby", "per-me-title");

  // Il titolo è quello CONDIVISO (src/ui/schedaCard.ts): `.per-me__title` era
  // una copia byte per byte di `.bait__title`, e due copie della stessa forma
  // divergono al primo ritocco.
  section.appendChild(renderSchedaCardTitle(perMeTitleFor(reading), { id: "per-me-title" }));

  if (reading.kind === "empty") {
    const empty = document.createElement("p");
    empty.id = "per-me-empty";
    empty.className = "per-me__empty";
    empty.textContent = perMeEmptyText(reading.reason);
    empty.dataset.reason = reading.reason;
    section.appendChild(empty);
  } else {
    const rows = document.createElement("div");
    rows.id = "per-me-rows";
    rows.className = "per-me__rows";
    for (const candidate of perMeShownCandidates(reading)) {
      const selected = selectedKey === candidate.playerId;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `per-me-row${selected ? " per-me-row--selected" : ""}`;
      row.dataset.playerKey = candidate.playerId;
      row.setAttribute("aria-pressed", selected ? "true" : "false");
      row.title = "Clic per selezionare questo giocatore nella ricerca";

      const head = document.createElement("span");
      head.className = "per-me-row__head";
      head.appendChild(line("per-me-row__name", perMeHeadText(candidate)));
      // I DUE CRITERI D'ORDINE che non sono il piano, nello stesso blocco che
      // avvolge: il surplus (criterio 2) prima dell'appetibilità (criterio 3),
      // nello stesso ordine in cui ordinano. A 390px vanno a capo da soli e non
      // costano una riga fissa per candidato. Il surplus compare solo dove
      // esiste: l'assenza la dice la nota, una volta e contata.
      const surplusText = perMeSurplusText(candidate);
      if (surplusText !== null) {
        head.appendChild(line("per-me-row__surplus", surplusText));
      }
      head.appendChild(line("per-me-row__appeal", perMeAppealText(candidate)));
      row.appendChild(head);

      row.appendChild(line("per-me-row__anchor", perMeAnchorText(candidate)));
      row.appendChild(line("per-me-row__plan", perMePlanText(candidate)));
      if (selected) row.appendChild(line("per-me-row__selected", PER_ME_SELECTED_MARK));

      row.addEventListener("click", () => onSelect(candidate.player));
      rows.appendChild(row);
    }
    section.appendChild(rows);
  }

  if (perMeNoteApplies(reading)) {
    const note = document.createElement("p");
    note.id = "per-me-note";
    note.className = "per-me__note";
    note.textContent = perMeNoteText(
      reading.parameters,
      reading.kind === "candidates" ? reading.planVersion : null,
      reading.kind === "candidates" ? reading.withoutAppealPosition : 0,
      reading.kind === "candidates" ? reading.withoutDeclaredValue : 0,
    );
    section.appendChild(note);
  }

  return section;
}
