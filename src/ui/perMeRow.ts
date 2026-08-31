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
// liberi che il piano copre, che si possono pagare al prezzo atteso, ordinati
// per surplus e poi per scarsità misurata — e nient'altro.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA PAROLA «VALORE» NON COMPARE PIÙ, E NON È UN GIRO DI PAROLE
// ─────────────────────────────────────────────────────────────────────────────
//
// `V` è il valore in crediti del DTI §A.1: un numero DERIVATO dal generatore
// (o dichiarato da Pico come override), non l'output direttivo `value` che il
// gate di `docs/NO_GO.md` tiene spento. Scriverlo per esteso a schermo lo
// renderebbe indistinguibile in lettura da quell'altro; la sigla con la sua
// TARGA accanto — «V 42 cr (generatore GEN-RECIPE@1.0.0)» — dice esattamente
// che numero è e da quale ricetta viene, e la targa arriva DAL DATO
// (`genForecast.recipeVersion`), mai da una costante scritta qui.
//
// NESSUN NUMERO DIRETTIVO, e non per prudenza: `fair_to_me_promoted` e
// `decision_promoted` sono gate OFF (PROJECT_STATE.md §"Gate attivi"). Qui non
// compare un «offri Y», una banda, un badge OCCASIONE o un punteggio di
// occasione. Compaiono `V` con la sua targa, il prezzo atteso coi suoi tre
// qualificatori obbligatori (§B.3), la loro sottrazione, il costo per vincerlo
// adesso col vincolo che l'ha fissato, due conteggi di scarsità,
// l'allocazione del piano, il max bid hard-safe e una posizione in un ordine
// dichiarato. `perMeRow.test.ts` §"guardia di deriva" cerca il vocabolario
// vietato su TUTTO il testo del sottoblocco.
//
// LO SCALARE, MAI LA BANDA (§B.3). `errMinus`/`errPlus` si scrivono accanto al
// numero come scarti dell'ERRORE STORICO della fascia — «tipicamente −4/+9» —
// e non come un intervallo «da X a Y», che il divieto di forma di §D9 esclude.
// Il bias firmato chiude la frase perché è il modo tipico in cui la previsione
// fa danno. La vista non può mostrare `P̂` senza i tre qualificatori: qui non
// esiste un percorso che stampi il numero senza stamparli, perché arrivano
// nello stesso membro dell'unione.
//
// IL GESTO È QUELLO DEL LISTONE, E LO È DAVVERO. La riga chiama
// `selectListonePlayer()` — l'UNICA via che arma la CTA «Avvia» — con la
// `ListonePlayer` che il candidato porta con sé. Non esiste una seconda via di
// selezione: due strade per selezionare un giocatore sono due superfici da
// sorvegliare, e la seconda diverge il giorno in cui la prima cambia.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso.

import type {
  PerMeCandidate,
  PerMeEmptyReason,
  PerMeParameters,
  PerMePlanReading,
  PerMeReading,
} from "../perMeCandidates.js";
import { perMeShownCandidates } from "../perMeCandidates.js";
import type {
  ExpectedPriceBiasDirection,
  ExpectedPriceMissingReason,
  RelativePriceBound,
} from "../../packages/engine/src/index.js";
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
export const PER_ME_TITLE = `${PER_ME_TITLE_SHORT} — liberi nel piano, che puoi pagare al prezzo atteso, per surplus e scarsità`;

/**
 * Quale dei due va a schermo. Stessa regola — e stessa misura — di
 * `baitTitleFor`: la seconda metà dell'occhiello descrive CHE COSA SONO LE
 * RIGHE, e senza righe non c'è niente da descrivere.
 */
export function perMeTitleFor(reading: PerMeReading): string {
  return reading.kind === "candidates" ? PER_ME_TITLE : PER_ME_TITLE_SHORT;
}

/** Il secondo canale della selezione, oltre al contorno: una parola. */
export const PER_ME_SELECTED_MARK = "✓ selezionato";

/**
 * IL MARCATORE DEL MOMENTO, e la ragione per cui non è una previsione.
 *
 * Compare quando `withinPlan(i) ∧ isCliff(i)`: due fatti già definiti altrove
 * — l'appartenenza a `TARGET*` e il dislivello misurato sulla scala delle
 * ancore — e nessuna soglia nuova inventata qui. Non dice «sparirà fra N
 * chiamate» (quella stima è vietata) e non dice «prendilo»: dice che questo
 * giocatore è nel piano E che sotto di lui il gradino è ripido.
 */
export const PER_ME_NOW_MARK = "⚑ adesso";

/**
 * QUANDO NON COMPARE, DICE QUALE SILENZIO È. Vocabolario CHIUSO di sette
 * motivi, sul modello di `baitEmptyText`: sette frasi diverse, perché sono
 * sette cose diverse, e appiattirle sarebbe già mezza bugia.
 *
 * NESSUNA DI QUESTE FRASI INVENTA UN NUMERO e nessuna dice «non c'è nessuno»
 * quando la verità è «non lo so». Le tre del piano dichiarato non ci sono più:
 * il piano dinamico esiste sempre dove esistono `V` e `P̂`, e una dichiarazione
 * rotta si dice nella nota mentre il dinamico lavora — mai un pannello vuoto.
 *
 * LE FRASI STANNO DENTRO LA LORO RIGA DEL MASTRO, e non è un vezzo: questo
 * blocco ha un'allocazione verticale misurata (`giocatore-suggerito`,
 * src/ui/callScreenBudget.ts) e una frase più lunga la sfonda —
 * e2e/call-screen-budget.spec.ts lo ha già dimostrato una volta.
 */
export function perMeEmptyText(reason: PerMeEmptyReason): string {
  switch (reason) {
    case "no-pool":
      return "Nessun listone caricato: senza righe non c'è una popolazione da guardare.";
    case "no-quotation":
      return "Nessuna riga del listone porta la Qt.A: senza quotazione non esiste un'ancora da misurare, e un'ancora inventata non è un'ancora.";
    case "anchors-refused":
      return "Le quotazioni caricate non passano la validazione del motore: da un listino rotto non si deriva nessuna ancora.";
    case "no-forecast":
      return "Deposito assente o monco: senza le previsioni servite o senza storico d'asta non si formano né V né il prezzo atteso, e nessuno dei due si inventa.";
    case "no-open-role":
      return "Nessun reparto aperto con margine: un acquisto non sarebbe registrabile in nessun ruolo.";
    case "no-free-in-open-roles":
      return "Nessun libero con quotazione nei reparti che ti restano aperti.";
    case "no-affordable":
      return "Ci sono liberi con V nei tuoi reparti aperti, ma il tuo max bid non copre il prezzo atteso di nessuno.";
  }
}

/**
 * LA NOTA COMPARE SOLO DOVE UN PARAMETRO HA GOVERNATO QUALCOSA — stessa regola,
 * e stessa ragione di altezza, di `baitNoteApplies`.
 *
 * Con le righe la nota c'è per intero. Nei due silenzi che nascono DOPO la
 * misura — `no-free-in-open-roles` e `no-affordable` — la nota resta perché lì
 * un parametro ha davvero deciso. Negli altri cinque esiti nessun numero è mai
 * stato prodotto: recitare i parametri sarebbe elencare soglie che non hanno
 * governato niente.
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
 * LA TARGA DI `V`: da dove viene il numero, in una parentesi.
 *
 * Due sorgenti e due sole, come il vocabolario del motore (`CreditValueSource`,
 * chiuso a «generatore» e «dichiarato»): mai una media fra le due, mai una
 * terza parola. La versione della ricetta arriva DAL DATO e non da una
 * costante di questo file — un payload che non la portasse non riceve una
 * targa inventata, riceve la dichiarazione che la targa manca.
 */
export function perMeValueProvenance(candidate: PerMeCandidate): string {
  if (candidate.valueSource === "dichiarato") return "dichiarato da te";
  return candidate.valueRecipe === null
    ? "generatore, ricetta non dichiarata"
    : `generatore ${candidate.valueRecipe}`;
}

/**
 * `V` E `S` SULLA STESSA RIGA, perché il secondo è la sottrazione del primo.
 *
 * «V 42 cr (generatore GEN-RECIPE@1.0.0) · S 4 cr (42 − 38)»: c'è il minuendo,
 * c'è il sottraendo, c'è la differenza, e chi legge può rifare il conto a mano
 * — la stessa postura con cui il surplus di ieri mostrava la propria distanza.
 * Non c'è nessun «è un affare», nessun badge, nessun punteggio: quella
 * promozione ha un gate, e il gate è OFF.
 *
 * QUANDO `S` NON ESISTE non c'è un ripiego: la riga porta il solo `V`, e la
 * nota conta quante righe sono in quel caso. `null` non diventa 0 («vale
 * esattamente quanto costa» sarebbe una dichiarazione che nessuno ha fatto).
 */
export function perMeValueText(candidate: PerMeCandidate): string {
  const head = `V ${candidate.value} cr (${perMeValueProvenance(candidate)})`;
  if (candidate.surplus === null || candidate.expectedPrice.kind !== "prezzo") return head;
  const s = candidate.surplus;
  const sign = s > 0 ? "+" : s < 0 ? "−" : "";
  return `${head} · S ${sign}${Math.abs(s)} cr (${candidate.value} − ${candidate.expectedPrice.credits})`;
}

/** Il bias firmato, detto a parole chiuse invece che dedotto dal segno. */
function biasText(direction: ExpectedPriceBiasDirection): string {
  switch (direction) {
    case "basso":
      return "tende a sbagliare basso";
    case "alto":
      return "tende a sbagliare alto";
    case "nessuno":
      return "non tende a sbagliare da un lato";
  }
}

/** Perché `P̂` non c'è. Vocabolario chiuso del motore, una frase per motivo. */
function priceMissingText(reason: ExpectedPriceMissingReason): string {
  switch (reason) {
    case "curva-assente":
      return "la curva storica non è formabile";
    case "previsione-assente":
      return "questa riga non porta le previsioni del deposito";
    case "rango-ignoto":
      return "il giocatore non è nel listone da cui il rango è stato costruito";
    case "fascia-senza-osservazioni":
      return "la sua fascia di rango non ha osservazioni storiche";
    case "fascia-sotto-campione":
      return "la sua fascia di rango è sotto il campione minimo";
  }
}

/**
 * IL PREZZO ATTESO, NELLA FORMA CHE RISPETTA I DUE DIVIETI (§B.3).
 *
 * Uno SCALARE centrale, mai una banda «da X a Y»; accanto, i tre qualificatori
 * obbligatori: quante aste storiche compongono la fascia, quanto tipicamente
 * la curva sbaglia in meno e in più, e da che parte tende a sbagliare. Il tipo
 * li porta insieme al numero, quindi non esiste qui un ramo che stampi il
 * numero senza di loro.
 *
 * QUANDO NON C'È, NON C'È UN NUMERO AL POSTO SUO: c'è il motivo, e la riga
 * resta a schermo in coda. È il caso §D.7 — fascia di rango senza osservazioni
 * o sotto campione — e il caso §A.3 di un giocatore dichiarato che il
 * generatore non copre.
 */
export function perMePriceText(candidate: PerMeCandidate): string {
  const p = candidate.expectedPrice;
  if (p.kind === "assente") {
    return `prezzo atteso non formabile: ${priceMissingText(p.reason)}`;
  }
  const u = p.uncertainty;
  const aste = u.n === 1 ? "asta simile" : "aste simili";
  return (
    `atteso ${p.credits} cr · su ${u.n} ${aste} · ` +
    `tipicamente −${u.errMinus}/+${u.errPlus} · ${biasText(u.biasDirection)}`
  );
}

/** Quale dei tre vincoli ha fissato il costo per vincere adesso. */
function boundText(bound: RelativePriceBound): string {
  switch (bound) {
    case "scala-dei-rivali":
      return "scala dei rivali";
    case "tetto-del-piu-ricco":
      return "tetto del più ricco";
    case "tetto-max-safe":
      return `tetto ${MAX_BID_LABEL}`;
  }
}

/**
 * IL COSTO PER VINCERLO ADESSO — un altro fatto, accanto a `P̂` e mai fuso con
 * lui: una media fra i due sarebbe un peso scelto dal sistema.
 *
 * `null` quando non esiste, e allora la riga non porta niente: i cinque motivi
 * per cui il secondo max bid non è misurabile (nessun rivale, un rivale solo,
 * ruolo pieno per me…) sono fatti dello STATO, uguali per tutte le righe di
 * quel ruolo, e ripeterli su ogni candidato costerebbe una riga di testo a
 * candidato per zero fatti in più.
 */
export function perMeWinNowText(candidate: PerMeCandidate): string | null {
  const r = candidate.relativePrice;
  if (r.kind === "assente") return null;
  return `vincerlo adesso ${r.credits} cr (${boundText(r.chain.boundBy)})`;
}

/**
 * IL CRITERIO 3 E IL SUO GEMELLO, i due fatti di scarsità MISURATA.
 *
 * «alternative a scendere» è il conteggio che ordina (`alternativesAtOrBelow`,
 * packages/engine/src/cliff.ts): quanti altri del ruolo, ancora disponibili,
 * stanno alla sua quota o sotto. «rivali eleggibili con slot» è il conteggio
 * dall'altro lato del tavolo. Sono due CONTEGGI su fatti misurati, non due
 * stime di quanto durerà sul mercato: quella stima resta vietata.
 */
export function perMeScarcityText(candidate: PerMeCandidate): string {
  const alt = candidate.cliff.alternativesAtOrBelow;
  const rivals = candidate.rivalsWithSlot;
  return (
    `${alt} ${alt === 1 ? "alternativa" : "alternative"} a scendere nel ruolo · ` +
    `${rivals} ${rivals === 1 ? "rivale eleggibile" : "rivali eleggibili"} con slot`
  );
}

/**
 * LA POSIZIONE DI APPETIBILITÀ. È USCITA DALL'ORDINE (§B.1: `V` è la sua
 * trasformazione in crediti, e tenerli entrambi sarebbe contare lo stesso fatto
 * due volte) MA NON DALLA RIGA: è una decisione registrata di Pico, e un fatto
 * mostrato non si toglie perché ha smesso di ordinare.
 *
 * È una POSIZIONE in un ordine dichiarato, non un punteggio: il numero
 * dell'indice non compare, perché non è il numero che ordina questa riga e
 * mostrarlo lo farebbe leggere come un giudizio. L'assenza di verdetto ha la
 * sua frase e non un numero di ripiego.
 */
export function perMeAppealText(candidate: PerMeCandidate): string {
  if (candidate.appealPosition === null || candidate.appealOrderSize === null) {
    return "senza verdetto di appetibilità";
  }
  return `${candidate.appealPosition}ª di ${candidate.appealOrderSize} per appetibilità`;
}

/**
 * L'ANCORA CORRENTE — non più il sottraendo del surplus (quel posto è di `P̂`)
 * ma la SCOMPOSIZIONE dell'inflazione misurata di stasera, che è l'unico punto
 * in cui si legge quanto il tavolo si sta scaldando e su quanti acquisti.
 * Porta sempre con sé i tre pezzi che la rendono ispezionabile: la Qt.A nuda,
 * l'inflazione applicata e il campione su cui poggia. In cold start non c'è un
 * numero al posto della misura mancante: c'è la frase che dice che manca.
 */
export function perMeAnchorText(candidate: PerMeCandidate): string {
  const a = candidate.anchor;
  const head = `ancora ${a.correctedAnchor} cr (Qt.A ${a.baseAnchor}`;
  if (a.coldStart || a.inflationApplied === null) {
    // La SOGLIA del campione non si ripete qui: sta nella nota, accanto agli
    // altri parametri, ed è la stessa per tutte le righe.
    return `${head} · nessuna inflazione misurata)`;
  }
  const where = a.basis === "role-inflation" ? "del ruolo" : "del tavolo";
  const what = a.n === 1 ? "acquisto" : "acquisti";
  return `${head} · inflazione misurata ${formatSignedPercent(a.inflationApplied)} su ${a.n} ${what} ${where})`;
}

/**
 * IL CRITERIO 1 — IL FILTRO — DETTO A SCHERMO, più il tetto hard-safe accanto.
 *
 * «dentro/fuori dal piano» è un FATTO CONTABILE — l'appartenenza a `TARGET*`,
 * oppure `fitsPlan` quando Pico ha dichiarato un piano — non un consiglio e non
 * un veto: un prezzo fuori piano resta comprabile se il budget lo consente,
 * semplicemente si sa che sfora. L'etichetta del piano viaggia con
 * l'allocazione perché «210 cr sul ruolo» significa due cose diverse a seconda
 * di chi le ha decise, e chi legge deve saperlo senza aprire un file.
 *
 * Il max bid porta il nome dichiarato in ./budgetLabels.ts e non una
 * formulazione propria: due nomi per due grandezze, non cinque per due.
 */
export function perMePlanText(candidate: PerMeCandidate, planLabel: string): string {
  const where = candidate.withinPlan ? "nel piano" : "fuori dal piano";
  // Il RUOLO si scrive con la lettera e non col nome esteso: il nome per esteso
  // costava una riga di testo in più a 390px, e la lettera è già quella che la
  // testa della riga porta due righe sopra.
  // «slot» è invariabile in italiano: qui non c'è nessun plurale da scegliere.
  return (
    `${where} ${candidate.role} (${candidate.planAllocation} cr / ` +
    `${candidate.planSlotsRemaining} slot · ${planLabel}) · ${MAX_BID_LABEL} ${candidate.maxBid} cr`
  );
}

/**
 * La nota del sottoblocco: la PROVENIENZA, l'ORDINE dichiarato criterio per
 * criterio, i parametri in vigore, le DUE letture non ratificate e i TRE
 * contatori delle assenze — stesso modello di `baitNoteText`.
 *
 * L'ordine si stampa per esteso di proposito: un ordine che non si legge è un
 * peso nascosto scritto in un file.
 *
 * I TRE CONTATORI SONO TRE, e non uno solo: «i liberi che il deposito non
 * serve», «le righe senza prezzo atteso» e «le righe senza verdetto di
 * appetibilità» sono tre assenze diverse, di tre ingredienti diversi, e ognuna
 * pesa in un punto diverso. Compaiono solo quando c'è qualcosa da contare.
 *
 * UNA DICHIARAZIONE DI PIANO ROTTA SI DICE QUI, e il pannello resta pieno: il
 * dinamico ha lavorato lo stesso, e nascondere il guasto sarebbe far sembrare
 * dichiarato un piano che non lo è.
 */
export function perMeNoteText(
  parameters: PerMeParameters,
  plan: PerMePlanReading | null,
  withoutValue: number,
  withoutSurplus: number,
  withoutAppealPosition: number,
): string {
  const parts = [
    "V dal generatore e prezzo atteso dalla curva storica" +
      (plan === null ? "" : `, ${plan.label} «${plan.planVersion}»`),
    "ordine: piano → surplus → alternative a scendere → V → chiave di listone",
    `campione minimo ${parameters.minInflationSample} (inflazione) e ${parameters.minPriceBandSample} (fascia di prezzo)`,
    `riserva ${parameters.costFloor} cr per ogni slot non ancora pianificato`,
    `${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} al massimo (${parameters.rowsMaxStatus})`,
    "NON RATIFICATE: il silenzio senza la scala delle Qt.A; il piano dichiarato provato sul prezzo atteso",
  ];
  if (plan !== null && plan.kind === "dynamic" && plan.declaredIssue !== null) {
    parts.push(
      plan.declaredIssue === "plan-incomplete"
        ? "la tua dichiarazione di piano è a metà: comanda il piano ricalcolato"
        : "la tua dichiarazione di piano è stata rifiutata dal motore: comanda il piano ricalcolato",
    );
  }
  if (withoutValue > 0) {
    parts.push(
      `${withoutValue} ${withoutValue === 1 ? "libero" : "liberi"} senza V, fuori dalla popolazione`,
    );
  }
  if (withoutSurplus > 0) {
    parts.push(
      `${withoutSurplus} ${withoutSurplus === 1 ? "riga" : "righe"} senza prezzo atteso, in fondo senza surplus fabbricato`,
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
 * teste, valori, prezzi, scarsità, ancore, piano, posizioni e nota insieme,
 * invece di dieci asserzioni che si dimenticano l'undicesima. Riproduce SOLO
 * ciò che il sottoblocco RENDE davvero — una guardia che leggesse testo non
 * renderizzato sorveglierebbe un'altra pagina.
 *
 * IL TITOLO RESTA IN QUESTA STRINGA anche da quando non si disegna più (Pico,
 * 2026-08-31): non è testo non renderizzato, è testo reso fuori dalla vista e
 * dentro l'albero di accessibilità — è il nome che chi naviga a voce sente
 * entrando nel sottoblocco.
 */
export function perMeSectionText(reading: PerMeReading): string {
  const out: string[] = [perMeTitleFor(reading)];
  if (reading.kind === "empty") {
    out.push(perMeEmptyText(reading.reason));
    if (perMeNoteApplies(reading)) {
      out.push(perMeNoteText(reading.parameters, null, 0, 0, 0));
    }
    return out.join("\n");
  }
  for (const candidate of perMeShownCandidates(reading)) {
    out.push(perMeHeadText(candidate));
    if (candidate.flagNow) out.push(PER_ME_NOW_MARK);
    out.push(perMeValueText(candidate));
    const price = perMePriceText(candidate);
    const winNow = perMeWinNowText(candidate);
    out.push(winNow === null ? price : `${price} · ${winNow}`);
    out.push(`${perMeScarcityText(candidate)} · ${perMeAppealText(candidate)}`);
    out.push(perMeAnchorText(candidate));
    out.push(perMePlanText(candidate, reading.plan.label));
  }
  out.push(
    perMeNoteText(
      reading.parameters,
      reading.plan,
      reading.withoutValue,
      reading.withoutSurplus,
      reading.withoutAppealPosition,
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
  //
  // NON SI DISEGNA PIÙ — «Nascondi #per-me-title» (Pico, 2026-08-31), e la
  // ragione è di struttura, non di gusto: l'occhiello che sta sopra
  // (`#suggested-player-mine-title`, src/main.ts) intitola
  // `<section id="suggested-player-mine">`, che contiene SOLO questo
  // sottoblocco — il pannello esca è una sezione sorella, appesa a
  // `#suggested-player`. «CHI CHIAMARE ORA» e «PER ME» nominavano quindi la
  // stessa cosa, impilati uno sotto l'altro.
  //
  // RESTA NEL DOM, FUORI DALLA VISTA, e non è un ripiego: `aria-labelledby`
  // punta qui, e un titolo tolto (o messo a `display: none`) lascerebbe
  // `#per-me-block` SENZA NOME ACCESSIBILE. L'idioma del non-disegnato è
  // quello che il repository ha già — `.listone-axis-tag__sr`,
  // `.scheda-icona__sr` — e la sua misura sta in src/styles/perMe.css.
  const title = renderSchedaCardTitle(perMeTitleFor(reading), { id: "per-me-title" });
  title.classList.add("per-me__title--sr");
  section.appendChild(title);

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
      // IL MARCATORE STA NELLA TESTA, accanto al nome: è una proprietà di
      // QUESTO giocatore adesso, non una riga di dettaglio, e nella testa non
      // costa una riga fissa perché il flex avvolge.
      if (candidate.flagNow) head.appendChild(line("per-me-row__now", PER_ME_NOW_MARK));
      row.appendChild(head);

      // I DUE NUMERI DEL CRITERIO 2, nello stesso blocco: `V` col suo
      // marchio e la sottrazione che ne discende.
      row.appendChild(line("per-me-row__value", perMeValueText(candidate)));

      // IL PREZZO ATTESO coi suoi tre qualificatori, e accanto — mai fuso — il
      // costo per vincerlo adesso.
      const price = document.createElement("span");
      price.className = "per-me-row__price";
      price.appendChild(line("per-me-row__forecast", perMePriceText(candidate)));
      const winNow = perMeWinNowText(candidate);
      if (winNow !== null) price.appendChild(line("per-me-row__winnow", winNow));
      row.appendChild(price);

      // I DUE CONTEGGI DI SCARSITÀ più la posizione di appetibilità, che resta
      // un fatto mostrato anche da quando non ordina più.
      const scarcity = document.createElement("span");
      scarcity.className = "per-me-row__scarcity";
      scarcity.appendChild(line("per-me-row__alternatives", perMeScarcityText(candidate)));
      scarcity.appendChild(line("per-me-row__appeal", perMeAppealText(candidate)));
      row.appendChild(scarcity);

      row.appendChild(line("per-me-row__anchor", perMeAnchorText(candidate)));
      row.appendChild(line("per-me-row__plan", perMePlanText(candidate, reading.plan.label)));
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
      reading.kind === "candidates" ? reading.plan : null,
      reading.kind === "candidates" ? reading.withoutValue : 0,
      reading.kind === "candidates" ? reading.withoutSurplus : 0,
      reading.kind === "candidates" ? reading.withoutAppealPosition : 0,
    );
    section.appendChild(note);
  }

  return section;
}
