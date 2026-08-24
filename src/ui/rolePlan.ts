// IL PIANO ROSA — le parole e il markup del pannello.
//
// Stesso idioma di ./roleDepletion.ts e ./liveFacts.ts: il calcolo sta in
// src/rolePlan.ts (puro, senza DOM e senza storage), il montaggio in
// ./views.ts, e qui in mezzo vive tutto ciò che riguarda LE PAROLE — quali
// numeri si dicono, in che ordine, e che frase si dice quando un numero non
// c'è. Costruttori di sole stringhe, verificabili senza jsdom/happy-dom,
// nessuno dei due configurato in questo progetto.
//
// LA REGOLA DELLE FRASI ONESTE, ereditata da ./roleDepletion.ts e portata al
// caso che qui conta di più: un dato che manca non diventa uno zero e non
// diventa un contenitore vuoto — diventa una frase che dice QUALE dei silenzi
// è. In questo pannello i silenzi non sono generici, sono DUE e a un'asta
// portano a due offerte diverse:
//
//   «non dichiarato»   il ruolo non ha ancora un target: non so quanto ci metterò
//   «0 cr»             il ruolo HA un target, e il target è zero: non ci metto niente
//
// Sono resi con due stringhe diverse — testo, non colore — perché confonderli
// costa un'offerta sbagliata. `TARGET_UNDECLARED` non contiene cifre e non è
// mai il risultato di una formattazione numerica: è un ramo separato del
// codice, e ./rolePlan.test.ts lo vigila.
//
// NIENTE COLORE DA SOLO. Lo scostamento sopra il piano porta la parola
// «SOPRA PIANO» e la cifra, non solo una tinta: chi non distingue i rossi
// legge la stessa informazione. Stessa regola per il ruolo chiuso e per la
// rosa non completabile.
//
// NESSUN OUTPUT DIRETTIVO (docs/NO_GO.md §Prodotto). Il pannello non nomina un
// valore, un prezzo, una banda obiettivo, un «conviene» o un «apri a». I
// target sono ciò che Owner ha dichiarato, il resto è la contabilità del log
// più l'aritmetica dichiarata del motore su quei due ingredienti.
//
// ── IL CRITERIO: CHE COSA PUÒ COMPARIRE A SCHERMO ───────────────────────────
//
// Deciso dal committente il 2026-08-22, e scritto qui perché la schermata che
// verrà dopo non debba riaprirlo:
//
//   UNA GRANDEZZA PUÒ COMPARIRE ANCHE SE L'ACCEPTANCE NON LA NOMINA, purché
//   sia ARITMETICA DERIVATA da ciò che l'utente ha dichiarato o da fatti già
//   registrati — acquisti, budget, slot. NON PUÒ COMPARIRE ciò che il sistema
//   RACCOMANDA: valore, fair-to-me, banda obiettivo, prezzo previsto, consiglio
//   d'acquisto. Quelli restano dietro il loro gate (PROJECT_STATE.md §"Gate
//   attivi": tutti e cinque NON attivi).
//
// La linea non passa fra «nominato» e «non nominato» dall'acceptance: passa fra
// DERIVATO e RACCOMANDATO. Un'acceptance è un minimo da consegnare, non un
// elenco chiuso di ciò che si ha il permesso di sommare; e un numero che il
// sistema si è inventato resterebbe vietato anche se l'acceptance lo nominasse.
// La domanda da farsi davanti a un campo nuovo è una sola: **se cambio questo
// numero, sto cambiando un'aritmetica sui dati di Owner, o sto dando un
// parere?**
//
// Le cinque grandezze che questo pannello mostra oltre l'acceptance stanno
// tutte dalla parte derivata, e la verifica è per definizione, non per
// impressione (packages/engine/src/livePlan.ts, blocco «ARITMETICA DICHIARATA
// DELLA RIALLOCAZIONE»):
//
//   allocation         floor[r] + ⌊above[r] × scale⌋ — floor è la riserva dura
//                      da budgetPlan() (slot residui × COST_FLOOR), above e
//                      scale escono dai target DI OWNER e dal budget residuo.
//                      Nessun peso del sistema entra nella formula: le
//                      proporzioni sono quelle dichiarate da Owner.
//   unallocated        budgetResidual − Σ allocation. Sottrazione fra due
//                      grandezze già a schermo.
//   freedByClosedRoles Σ residualTarget dei ruoli senza slot residui. Somma di
//                      target dichiarati meno speso misurato.
//   overCommitted      aboveTotal > 0 && scale < 1: un booleano che DICE che la
//                      ripartizione è stata scalata. Non consiglia di
//                      correggere il piano e non propone il piano corretto.
//   reallocationBasis  quale dei tre rami dell'aritmetica ha calcolato le
//                      allocazioni. Non è nemmeno un numero: è il nome del
//                      percorso, cioè la spiegazione di ciò che si sta già
//                      guardando.
//
// Nessuna delle cinque nomina un prezzo, un giocatore o un'offerta, e nessuna
// cambia se cambia il listone: cambiano solo se cambia ciò che Owner ha
// dichiarato o ciò che è già stato registrato.
//
// QUELLO CHE NON SI MOSTRA, E PERCHÉ IL MOTIVO NON È IL CRITERIO.
// `RolePlanLine.perSlotHeadroom` (`allocation / slotsRemaining`) esiste nel
// contratto del motore e non compare qui. Sotto il criterio SAREBBE
// mostrabile: è un quoziente fra un'allocazione derivata e un conteggio di
// slot misurato, esattamente come le cinque sopra. Non compare per una ragione
// di LETTURA, non di categoria: è l'unica delle grandezze di piano che si
// riferisce a UN acquisto singolo, ed è un numero in crediti; messo accanto a
// «max bid sicuro» si legge come la cifra da mettere sul prossimo giocatore,
// cioè verrebbe letto come un consiglio anche restando aritmetica. È una
// scelta di presentazione, reversibile, e non un divieto: chi vorrà mostrarlo
// dovrà risolvere quella confusione (un'unità diversa, un altro posto, un'altra
// parola), non chiedere un permesso che il criterio non nega.
//
// DETERMINISMO: nessuna `Date`, nessun `Intl`/`toLocaleString`, nessun numero
// a virgola. Ogni cifra di questo pannello è un credito intero o un conteggio
// e si stampa com'è.

import type { RolePlanGap, RolePlanReading, RolePlanRow } from "../rolePlan.js";
import type { LivePlan, ReallocationBasis } from "../../packages/engine/src/livePlan.js";
import type { Role } from "../../packages/engine/src/types.js";
import { ROLE_LABELS } from "./labels.js";
import { escHtml, roleChipHtml } from "./theme.js";

/** Titolo del pannello: nomina le tre grandezze che contiene, non una diagnosi. */
export const ROLE_PLAN_TITLE = "PIANO ROSA — TARGET, RISERVE, SCOSTAMENTO";

/**
 * IL BUCO, in parole. Non contiene cifre di proposito: nessuna
 * formattazione numerica può produrre questa stringa, e nessuna resa numerica
 * può essere scambiata per lei.
 */
export const TARGET_UNDECLARED = "non dichiarato";

/** L'unità, una volta sola, così le quattro schede non la scrivono ognuna a modo suo. */
export const CREDITS = "cr";

/** La frase che accompagna ogni riga priva di numeri di piano. */
export const NO_PLAN_NUMBERS =
  "Scostamento e allocazione: compaiono quando tutti e quattro i ruoli hanno un target e il piano ha una versione.";

/**
 * La nota in fondo. Dice che cosa il pannello NON contiene, con le stesse
 * parole delle altre superfici contabili di questa app (cfr. la nota di
 * AVVERSARI TIER-1): un pannello che mostra numeri accanto a un'asta deve
 * dichiarare da sé di non essere un consiglio.
 */
export const ROLE_PLAN_NOTE =
  "Solo il tuo piano dichiarato e la contabilità del log dell'asta: target che hai scritto tu, speso e slot derivati dagli acquisti, riserva dura per gli slot obbligatori. Nessun valore, nessun prezzo consigliato, nessuna banda obiettivo, nessun suggerimento di acquisto: il sistema non propone un piano e non corregge il tuo.";

/** Come si scrive un target dichiarato. Il ramo `undeclared` non passa di qui. */
function creditsText(value: number): string {
  return `${value} ${CREDITS}`;
}

/**
 * La resa del target di UNA riga — il punto in cui i due silenzi si separano.
 *
 * Due rami, non un ternario su un numero: `0` entra nel ramo dichiarato e ne
 * esce come `0 cr`, l'assenza entra nell'altro e ne esce come parole. Non
 * esiste un percorso in cui l'assenza attraversi `creditsText`.
 */
export function targetText(row: RolePlanRow): string {
  return row.declared.kind === "undeclared" ? TARGET_UNDECLARED : creditsText(row.declared.target);
}

/** Che cosa manca, in italiano, ruolo per ruolo. */
export function gapText(gap: RolePlanGap): string {
  return gap.kind === "plan-version-missing"
    ? "manca la versione del piano"
    : `${ROLE_LABELS[gap.role]}: nessun target dichiarato`;
}

/** Su che base il motore ha ripartito. Le tre parole del contratto, in chiaro. */
const BASIS_TEXT: Readonly<Record<ReallocationBasis, string>> = {
  "declared-residual-targets": "ripartizione in proporzione ai tuoi target residui",
  "hard-floor-only": "piano esaurito sui ruoli ancora aperti: resta la sola riserva dura",
  "roster-complete": "rosa completa: non c'è più niente da allocare",
};

/**
 * LA FRASE DI STATO — la prima riga del pannello, e quella che fa il lavoro.
 *
 * Quattro frasi per quattro esiti. Nessuna di loro finge che ci sia un piano:
 * l'assenza e l'incompletezza sono il caso NORMALE prima dell'asta e sono
 * scritte come tali, non come un errore.
 */
export function planStateText(reading: RolePlanReading): string {
  switch (reading.kind) {
    case "absent":
      return "Nessun piano dichiarato. Qui sotto ci sono solo i fatti misurati — slot e riserva dura per ruolo — perché sono gli unici che esistono senza un piano. Target e scostamento compaiono quando li dichiari tu: il sistema non ne propone nessuno.";
    case "incomplete": {
      const missing = reading.gaps.map(gapText).join("; ");
      return `Piano incompleto — ${missing}. Un ruolo senza target NON è un ruolo a zero: l'allocazione viva ripartisce i crediti liberati in proporzione ai target di tutti i ruoli, quindi finché ne manca uno non esiste una ripartizione da mostrare e il sistema non ne inventa una. I target già scritti restano come li hai scritti.`;
    }
    case "invalid": {
      const why = reading.issues
        .map((issue) =>
          issue.violation === "total-exceeds-initial-budget"
            ? "la somma dei target supera la dotazione iniziale di lega"
            : issue.violation === "plan-version-empty"
              ? "manca la versione del piano"
              : `${issue.role === null ? "piano" : ROLE_LABELS[issue.role]}: target non valido`,
        )
        .join("; ");
      return `Piano rifiutato dal motore — ${why}. Nessun numero di piano è mostrato: un piano che non passa la validazione non produce allocazioni, e correggerlo da soli sarebbe il sistema che decide al posto tuo.`;
    }
    case "live":
      // La versione fra virgolette e non con una «v» davanti: `plan_version` è
      // un'etichetta che Owner scrive, non un numero di release — «v7» funziona,
      // «vpre-asta 1» no. §4.1 chiede che la versione usata sia indicata, non
      // che abbia una forma.
      return `Piano dichiarato «${reading.live.planVersion}» — ${BASIS_TEXT[reading.live.reallocationBasis]}.`;
  }
}

/**
 * I TOTALI, solo con un piano vivo. Quattro fatti di piano che non stanno su
 * una singola riga di ruolo: fattibilità (l'acceptance la nomina), budget
 * libero vero, crediti liberati dai ruoli chiusi, e la compressione.
 *
 * `unallocated` negativo NON viene troncato a zero: il contratto del motore
 * dice che in quel caso vale esattamente `−budgetShortfall` ed è «lo scoperto
 * mostrato com'è». Mostrarlo a 0 sarebbe rimpicciolire il piano fino a farlo
 * sembrare sostenibile.
 */
export function planTotalsText(live: LivePlan): readonly string[] {
  const lines: string[] = [];
  lines.push(
    live.isCompletable
      ? `Rosa completabile: la riserva dura di ${creditsText(live.totalReserve)} sta dentro i ${creditsText(live.budgetResidual)} residui.`
      : `ROSA NON COMPLETABILE: mancano ${creditsText(live.budgetShortfall)} per coprire al minimo i ${live.totalSlotsRemaining} slot obbligatori che restano.`,
  );
  lines.push(
    live.unallocated >= 0
      ? `Budget libero vero: ${creditsText(live.unallocated)} — residui che né la riserva dura né il piano stanno impegnando.`
      : `Scoperto: ${creditsText(live.unallocated)} — le allocazioni sono già alla sola riserva dura e restano sopra il credito rimasto.`,
  );
  if (live.freedByClosedRoles > 0) {
    lines.push(
      `Crediti liberati dai ruoli chiusi e ridistribuiti su quelli aperti: ${creditsText(live.freedByClosedRoles)}.`,
    );
  }
  if (live.overCommitted) {
    lines.push(
      "PIANO COMPRESSO: il piano chiede più crediti di quanti ne restino sopra la riserva dura, e la ripartizione è stata scalata per rientrare. Il piano non si rompe a metà asta, si dichiara compresso.",
    );
  }
  return lines;
}

/** Le pastiglie di una riga: parole, mai il solo colore. */
function rowBadges(row: RolePlanRow): string {
  const badges: string[] = [];
  if (row.plan !== null && row.plan.overspend > 0) {
    badges.push(
      `<span class="badge badge--over-plan">SOPRA PIANO +${row.plan.overspend} ${CREDITS}</span>`,
    );
  }
  if (row.slotsRemaining === 0) {
    badges.push(`<span class="badge badge--assigned">REPARTO COMPLETO</span>`);
  }
  return badges.join("");
}

/**
 * Una scheda di ruolo.
 *
 * Un separatore letterale « · » divide le voci (non solo un `gap` CSS), così i
 * numeri restano distinguibili anche in `textContent` puro — che è ciò che
 * leggono le tecnologie assistive e le asserzioni di Playwright, e che la
 * spaziatura CSS non tocca. Stessa scelta di ./roleBudgetPlan.ts.
 *
 * Ogni cifra porta la sua parola accanto: nessuna colonna implicita da
 * associare a un'intestazione lontana, che a 390px e sotto pressione non si
 * associa.
 */
export function rolePlanCardHtml(row: RolePlanRow): string {
  const facts = [
    `<span><em>slot</em> ${row.slotsFilled}/${row.slotsFilled + row.slotsRemaining}</span>`,
    `<span><em>riserva</em> ${creditsText(row.minReserve)}</span>`,
  ].join(" · ");

  const planLine =
    row.plan === null
      ? `<span class="role-plan__silence">${escHtml(NO_PLAN_NUMBERS)}</span>`
      : `<span class="role-plan__numbers">${[
          `<span><em>speso</em> ${creditsText(row.plan.spent)}</span>`,
          `<span><em>residuo di piano</em> ${creditsText(row.plan.residualTarget)}</span>`,
          `<span><em>scostamento</em> ${row.plan.overspend > 0 ? "+" : ""}${creditsText(row.plan.overspend)}</span>`,
          `<span><em>allocazione viva</em> ${creditsText(row.plan.allocation)}</span>`,
        ].join(" · ")}</span>`;

  return `
    <div class="role-plan__card" id="role-plan-${row.role}">
      <span class="role-plan__head">${roleChipHtml(row.role)}<em>${escHtml(ROLE_LABELS[row.role])}</em>${rowBadges(row)}</span>
      <span class="role-plan__target"><em>target</em> <strong>${escHtml(targetText(row))}</strong></span>
      <span class="role-plan__facts">${facts}</span>
      ${planLine}
    </div>`;
}

export function rolePlanGridHtml(rows: readonly RolePlanRow[]): string {
  return rows.map(rolePlanCardHtml).join("");
}

// ── Il modulo di dichiarazione ──────────────────────────────────────────────

/** Etichetta del campo target di un ruolo. Il ruolo per esteso, non la sigla:
 *  un `<label>` letto da solo da uno screen reader deve bastare. */
export function targetFieldLabel(role: Role): string {
  return `Target ${ROLE_LABELS[role]} (crediti)`;
}

export const PLAN_VERSION_FIELD_LABEL = "Versione del piano";

export const PLAN_VERSION_HINT =
  "Un'etichetta tua, per esempio «pre-asta 1». Serve perché ogni numero di piano possa essere ricondotto al piano che l'ha prodotto.";

/**
 * IL PULSANTE DI AZZERAMENTO, con scritto sopra TUTTO quello che cancella.
 *
 * La dichiarazione azzerata è `EMPTY_ROLE_PLAN_DRAFT`, e quella porta
 * `planVersion: ""`: il gesto cancella anche LA VERSIONE del piano, non solo i
 * quattro target. Un'etichetta che nomina i soli ruoli promette meno di quanto
 * il gesto faccia — e questo gesto non ha né conferma né undo, quindi l'unico
 * momento in cui Owner può decidere è PRIMA di premerlo, leggendo il pulsante.
 * Scoprirlo dopo, trovando vuoto un campo che non si era detto di svuotare, è
 * il modo in cui una schermata si guadagna di non essere più creduta.
 */
export const ROLE_PLAN_CLEAR_LABEL = `Azzera il piano: tutti i ruoli a «${TARGET_UNDECLARED}», versione compresa`;

/** Che cosa si dice ad alta voce dopo l'azzeramento: le stesse due cose. */
export const ROLE_PLAN_CLEARED_ANNOUNCE = `Piano azzerato: tutti e quattro i ruoli sono di nuovo «${TARGET_UNDECLARED}», e la versione del piano è stata cancellata.`;

/**
 * LA SCRITTURA CHE NON HA ATTECCHITO.
 *
 * `persist()` torna `false` quando lo spazio di archiviazione del browser
 * rifiuta la scrittura (quota piena, storage negato). È l'unico caso in cui il
 * salvataggio riuscito e quello fallito si somigliano a schermo — la scheda del
 * ruolo si aggiorna comunque, perché la dichiarazione viva è in memoria — e
 * quindi è l'unico che va detto a parole. Sta qui, e non inline in views.ts,
 * per la stessa ragione delle altre frasi di questo file: le parole del
 * pannello si leggono e si provano in un posto solo.
 */
export const ROLE_PLAN_NOT_SAVED =
  "Il piano non è stato salvato: lo spazio di archiviazione del browser ha rifiutato la scrittura. Quello che vedi a schermo vale per questa sessione soltanto.";

export const TARGET_FIELD_HINT =
  "Campo vuoto = ruolo non dichiarato. Scrivere 0 è un'altra cosa: significa che a quel ruolo destini zero crediti, e il piano lo esegue.";

/** I rifiuti del campo, in parole. Nessun numero viene corretto d'ufficio. */
export const TARGET_REJECTION_TEXT: Readonly<Record<"not-an-integer" | "negative" | "above-cap", string>> = {
  "not-an-integer": "Solo crediti interi. Il campo non è stato cambiato.",
  negative: "Un target non può essere negativo. Il campo non è stato cambiato.",
  "above-cap": "Un target non può superare la dotazione iniziale di lega. Il campo non è stato cambiato.",
};

/** Il totale dichiarato, detto insieme a SU QUANTI ruoli è calcolato: un totale
 *  su tre ruoli non è confrontabile con uno su quattro, e tacere il
 *  denominatore lo farebbe sembrare tale. */
export function declaredTotalText(total: number, roles: number): string {
  if (roles === 0) return "Nessun target dichiarato.";
  return `Totale dichiarato: ${creditsText(total)} su ${roles} ${roles === 1 ? "ruolo" : "ruoli"} di 4.`;
}
