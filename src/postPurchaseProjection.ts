// «Quanto mi resta se lo prendo» — la quarta domanda del tavolo, in forma pura.
//
// Estratto fuori da main.ts per lo stesso motivo di src/price.ts e
// src/callGuard.ts: un modulo piccolo, senza DOM e senza storage, che main.ts
// importa e che si può testare unitariamente sotto la postura no-jsdom di
// questo repo. Qui vive sia il calcolo sia la COPIA che finisce a schermo, così
// anche le parole sono coperte da test e non solo i numeri.
//
// CONTABILITÀ, MAI CONSIGLIO. Non si calcola nessun valore, nessun prezzo
// giusto, nessuna appetibilità, nessuna banda obiettivo, nessun «conviene»:
// solo aritmetica su una cifra che l'operatore ha già digitato — quanti crediti
// e quanti slot restano alla squadra scelta se quella cifra viene pagata, e se
// dopo averla pagata la rosa resta completabile. Nessun campo direttivo entra o
// esce da qui (docs/NO_GO.md; la guardia anti-scope-creep di
// packages/engine/tests/budget.test.ts ha qui il suo gemello, vedi
// postPurchaseProjection.test.ts §"nessun campo direttivo").
//
// LA MATEMATICA È QUELLA DEL MOTORE, NON UNA SECONDA COPIA.
// La riserva dura non viene ricalcolata: `maxSafe(team, role)` la calcola già
// sull'ipotesi esatta di questo blocco — «uno slot viene riempito adesso»,
// cioè hardReserve(totalSlotsRemaining - 1) — e il campo `hardReserve` del suo
// risultato è quello che si legge qui. Il confronto si fa contro quella riserva
// e NON contro il campo `maxSafe.maxSafe`: nel ramo budget-locked quel campo è
// troncato a `Math.max(0, …)`, quindi «quanti crediti mancano» letto da lì
// sarebbe sbagliato proprio sulle squadre già in difficoltà (fixture e misura
// in postPurchaseProjection.test.ts §"squadra già bloccata"). L'unica
// aritmetica locale sono le due
// operazioni che DEFINISCONO l'acquisto — un prezzo esce dai crediti, uno slot
// esce dagli slot — le stesse due che reduce() esegue quando l'acquisto diventa
// evento. Un test di equivalenza tiene il verdetto allineato a
// purchaseFeasibility(): la proiezione non può dire «completabile» dove il
// bottone «Registra acquisto» rifiuterebbe per breaks-hard-reserve, né il
// contrario.

import { maxSafe } from "../packages/engine/src/auction.js";
import type { Role, TeamState } from "../packages/engine/src/types.js";
import { parsePositiveIntegerPrice } from "./price.js";

/**
 * Cosa resta alla squadra scelta DOPO l'acquisto alla cifra digitata.
 *
 * Tre esiti, nessuno dei quali inventa un numero:
 * - `no-price`: il campo è vuoto o la cifra non è un prezzo valido — non c'è
 *   niente da proiettare e non si mostra alcun numero;
 * - `no-slot`: la squadra scelta non ha uno slot libero in questo ruolo, quindi
 *   l'acquisto non può avvenire e «dopo» non esiste;
 * - `after`: la proiezione vera.
 */
export type PostPurchaseProjection =
  | { readonly kind: "no-price"; readonly fantaTeamId: string }
  | { readonly kind: "no-slot"; readonly fantaTeamId: string }
  | {
      readonly kind: "after";
      readonly fantaTeamId: string;
      /** Crediti residui dopo aver pagato la cifra. Può essere negativo: se il
       *  prezzo supera il budget la sottrazione resta quella vera, non si
       *  tronca a zero fingendo che l'acquisto stia in piedi. */
      readonly creditsAfter: number;
      /** Slot ancora da riempire dopo che questo ne ha riempito uno. */
      readonly slotsAfter: number;
      /** Crediti che DEVONO restare per completare la rosa al minimo, dopo
       *  questo acquisto. Viene da maxSafe().hardReserve — motore, non qui. */
      readonly reserveAfter: number;
      /** `false` quando i crediti residui non coprono più la riserva dura. */
      readonly completable: boolean;
      /** Quanti crediti mancherebbero per completare la rosa (0 se completabile). */
      readonly missingCredits: number;
    };

/**
 * Proietta lo stato della squadra scelta al prezzo digitato.
 * `rawPrice` è il contenuto grezzo del campo: vuoto, spazi, «0», «1.5», «abc»
 * e i negativi finiscono tutti in `no-price` — stesso parser che il bottone
 * «Registra acquisto» usa (parsePositiveIntegerPrice), così proiezione e
 * registrazione accettano esattamente le stesse cifre.
 */
export function projectAfterPurchase(
  team: TeamState,
  role: Role,
  rawPrice: string,
): PostPurchaseProjection {
  const ms = maxSafe(team, role);
  if (ms.reason === "role-full") {
    return { kind: "no-slot", fantaTeamId: team.fantaTeamId };
  }
  const price = parsePositiveIntegerPrice(rawPrice);
  if (price === null) {
    return { kind: "no-price", fantaTeamId: team.fantaTeamId };
  }
  // Le due operazioni che definiscono «pagare»: il prezzo esce dai crediti,
  // uno slot esce dagli slot. `reserveAfter` NON è ricalcolato qui.
  const creditsAfter = team.budgetResidual - price;
  const slotsAfter = team.totalSlotsRemaining - 1;
  const reserveAfter = ms.hardReserve;
  const completable = creditsAfter >= reserveAfter;
  return {
    kind: "after",
    fantaTeamId: team.fantaTeamId,
    creditsAfter,
    slotsAfter,
    reserveAfter,
    completable,
    missingCredits: completable ? 0 : reserveAfter - creditsAfter,
  };
}

// ── La copia a schermo ───────────────────────────────────────────────────────
// Tre stringhe, tutte pure e tutte testate. L'etichetta DICHIARA SEMPRE DI CHI
// PARLA: sulla stessa schermata maxSafe() viene già chiamata con due ricette
// diverse (la squadra del menu ASSEGNA A e la squadra dell'utente), quindi una
// proiezione senza nome sarebbe indistinguibile dall'altra lettura. Qui il nome
// è la squadra selezionata nel menu — quella che sta per ricevere l'acquisto.
// Nessuna delle tre stringhe contiene la parola «max»: quella formulazione è di
// un'altra corsia e non se ne introduce una seconda.

/** Segno meno tipografico (U+2212): non è un trattino, e in colonna si legge. */
const MINUS = "−";

function credits(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)} cr` : `${n} cr`;
}

/** «dopo l'acquisto · Io» — chi paga, detto per esteso. */
export function projectionLabelText(teamLabel: string): string {
  return `dopo l'acquisto · ${teamLabel}`;
}

/**
 * La riga dei numeri. Con il campo vuoto o non valido restano i trattini
 * dell'idioma già in uso da `#price-display` («— cr»): niente numero finto.
 */
export function projectionValueText(projection: PostPurchaseProjection): string {
  if (projection.kind === "no-slot") return "nessuno slot libero in questo ruolo";
  if (projection.kind === "no-price") return "restano — cr e — slot";
  return `restano ${credits(projection.creditsAfter)} e ${projection.slotsAfter} slot`;
}

/**
 * La riga d'allarme, vuota quando non c'è niente da dire — è la sola riga che
 * compare e scompare, e per questo è l'unica che può cambiare l'altezza del
 * blocco. Due varianti perché sono due fatti diversi: il prezzo che sfonda il
 * budget (l'acquisto non può proprio avvenire) e il prezzo che lo lascia in
 * piedi ma consuma la riserva dura (l'acquisto avverrebbe e lascerebbe una rosa
 * non completabile). Nessuna delle due dice se comprare: dicono cosa succede.
 */
export function projectionAlarmText(projection: PostPurchaseProjection): string {
  if (projection.kind !== "after" || projection.completable) return "";
  if (projection.creditsAfter < 0) {
    return `oltre il budget di ${credits(-projection.creditsAfter)}`;
  }
  // Singolare quando manca un credito solo: a un tavolo si legge di sfuggita,
  // e «mancano 1 cr» è il genere di stonatura che fa rileggere la riga.
  const verb = projection.missingCredits === 1 ? "manca" : "mancano";
  return `rosa non completabile: ${verb} ${credits(projection.missingCredits)}`;
}
