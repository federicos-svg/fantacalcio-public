// SVUOTAMENTO DEL RUOLO — misurato SOLO sul tavolo di stasera.
//
// LA DECISIONE CHE GOVERNA QUESTO FILE (Pico, 16/08/2026). Domanda posta:
// quando l'app avverte che un ruolo si sta svuotando, può guardare solo i
// giocatori già comprati stasera, oppure anche quanto valgono secondo il
// listino quelli rimasti? Risposta: «solo il tavolo adesso; la versione che
// guarda anche il listino si valuta dopo l'asta».
//
// Conseguenza operativa, e non è una preferenza di stile: la quotazione di
// listino non entra in questo calcolo, né come valore, né come peso, né come
// criterio d'ordinamento. Il modulo non importa `anchors.ts`, `cliff.ts` né
// `tension.ts` del motore, e la guardia che lo verifica non è questo commento
// ma `src/roleDepletion.noQuotation.test.ts`, che legge questo sorgente e
// diventa rossa se un import o un identificatore di quel perimetro ricompare.
//
// PERCHÉ IL MOTORE DELLA TENSIONE È RIMASTO FUORI. `tension()` esiste, è
// testato e risponderebbe a una domanda vicinissima, ma la sua prima riga utile
// è `currentAnchor(...)` e su `null` si ferma (packages/engine/src/tension.ts
// righe 119-120): senza Qt.A non produce nulla. Lo stesso vale per la scala del
// cliff, che è costruita sulle quotazioni (`cliff.ts` riga 92), e per
// l'inflazione misurata, il cui denominatore è la somma delle Qt.A
// (`anchors.ts` riga 284). Portarli a schermo oggi significherebbe far entrare
// il listino dalla finestra: restano dov'erano, e questo modulo misura la sola
// metà che la decisione consente.
//
// COSA MISURA, allora. Due famiglie di fatti, con provenienza diversa e tenute
// separate proprio per questo:
//  1. IL REGISTRO DI STASERA (event log): quanti giocatori di quel ruolo sono
//     stati presi, da chi, e a che prezzi. Sono cose successe, non previsioni;
//  2. IL CENSIMENTO DEI POSTI (stato ridotto): quanti posti di quel ruolo ha il
//     tavolo, quanti restano liberi, quante squadre ne cercano ancora almeno
//     uno, e quanti erano già occupati da RICONFERME prima che l'asta iniziasse.
//
// Le riconferme non vengono mai sommate agli acquisti di stasera: portano i
// prezzi della stagione precedente (LEAGUE_RULES §4, e la stessa asimmetria
// dichiarata in `anchors.ts` a proposito di `settledPurchases`). Contarle
// insieme significherebbe misurare il mercato di quest'anno con i prezzi
// dell'anno scorso.
//
// COSA NON C'È, di proposito (docs/NO_GO.md §Prodotto, docs/DECISIONS.md §D9):
//  - nessuna banda «bassa/media/alta» e nessun punteggio composito: una banda
//    è un conteggio di soglie pesate, e i pesi li sceglierebbe il sistema;
//  - nessun confronto fra ruoli e nessun ordinamento di intensità: il pannello
//    parla del solo ruolo in asta;
//  - nessuna stima di quanto costerà il prossimo, nessun intervallo di prezzo,
//    nessun «conviene». L'unico ordinamento prodotto è su acquisti GIÀ
//    avvenuti, come in `roleTopPurchases`.
//
// Strato senza DOM, come src/nominationContext.ts e src/postPurchaseProjection.ts:
// tutta la resa vive in src/ui/roleDepletion.ts, tutto il montaggio in views.ts.

import {
  type AuctionEvent,
  type AuctionState,
  type Role,
  ROSTER_REQUIREMENTS,
} from "../packages/engine/src/types.js";
import { effectivePurchases } from "./nominationContext.js";

export interface RoleDepletionInput {
  readonly log: readonly AuctionEvent[];
  readonly state: AuctionState;
  /** Il ruolo in asta; `""` quando non c'è nessun giocatore chiamato. */
  readonly role: Role | "";
}

/** Una squadra che stasera ha preso almeno un giocatore di quel ruolo. */
export interface RoleBuyerTonight {
  readonly fantaTeamId: string;
  readonly taken: number;
  readonly credits: number;
  /** I prezzi pagati da quella squadra, decrescenti; parità sciolta dal `seq`. */
  readonly prices: readonly number[];
}

export interface RoleDepletionFacts {
  readonly role: Role;

  // ── Il registro di stasera (event log, VOID compensati esclusi) ────────────
  /** Giocatori di quel ruolo passati stasera, in totale. */
  readonly takenTonight: number;
  /** Crediti spesi stasera su quel ruolo, da tutto il tavolo. */
  readonly creditsTonight: number;
  readonly buyers: readonly RoleBuyerTonight[];

  // ── Il censimento dei posti, adesso (stato ridotto) ───────────────────────
  /** Quante squadre sono entrate nel conto: censimento, non campione. */
  readonly teamsCounted: number;
  /** Posti di quel ruolo che il tavolo ha in tutto: regola di lega × squadre. */
  readonly roleSlotsTotal: number;
  /** Posti di quel ruolo ancora liberi, sommati su tutte le squadre. */
  readonly openSlots: number;
  readonly teamsWithOpenSlot: number;
  /** Quanti posti liberi ha la squadra che ne ha di più: la più scoperta. */
  readonly widestOpening: number;
  /** Posti di quel ruolo già occupati da riconferme, prima dell'asta. */
  readonly confirmedSlots: number;
}

export type RoleDepletionReading =
  | { readonly kind: "no-call" }
  | { readonly kind: "facts"; readonly facts: RoleDepletionFacts };

/**
 * Lo svuotamento del ruolo in asta, adesso.
 *
 * Deterministica: stesso log + stesso stato → stessi numeri e stesso ordine,
 * sempre. Nessuna data, nessun `Intl`, nessuna iterazione su strutture non
 * ordinate che arrivi fino all'output — l'ordine finale è totale.
 *
 * `role === ""` non è un errore né uno zero: è «non c'è ancora un soggetto», e
 * viaggia come tale fino alla frase che lo dice.
 */
export function roleDepletionReading(input: RoleDepletionInput): RoleDepletionReading {
  const { log, state, role } = input;
  if (role === "") return { kind: "no-call" };

  // ── Stasera ───────────────────────────────────────────────────────────────
  // `effectivePurchases` (src/nominationContext.ts) è la nozione di «acquisto
  // ancora in piedi» già usata dal pannello CONTESTO CHIAMATA, ed è la stessa
  // che il motore applica: l'equivalenza fra le due è tenuta da un test di
  // drift dedicato, in packages/engine/tests/. Riscriverne qui una terza copia
  // sarebbe la copia destinata a divergere.
  const tonight = effectivePurchases(log).filter((event) => event.role === role);

  const perTeam = new Map<string, { taken: number; credits: number; paid: { price: number; seq: number }[] }>();
  for (const purchase of tonight) {
    const row = perTeam.get(purchase.fantaTeamId) ?? { taken: 0, credits: 0, paid: [] };
    row.taken += 1;
    row.credits += purchase.price;
    row.paid.push({ price: purchase.price, seq: purchase.seq });
    perTeam.set(purchase.fantaTeamId, row);
  }

  // Ordine totale e stabile — quanti ne ha presi, poi quanto ha speso, poi
  // l'id. È un ordinamento su fatti GIÀ avvenuti, la stessa cosa che fa
  // `roleTopPurchases`: non è, e non deve diventare, una classifica di chi
  // spingerà di più sul prossimo.
  const buyers: readonly RoleBuyerTonight[] = [...perTeam.entries()]
    .map(([fantaTeamId, row]) => ({
      fantaTeamId,
      taken: row.taken,
      credits: row.credits,
      prices: row.paid
        .slice()
        .sort((a, b) => b.price - a.price || a.seq - b.seq)
        .map((entry) => entry.price),
    }))
    .sort(
      (a, b) =>
        b.taken - a.taken ||
        b.credits - a.credits ||
        a.fantaTeamId.localeCompare(b.fantaTeamId),
    );

  const creditsTonight = tonight.reduce((sum, purchase) => sum + purchase.price, 0);

  // ── Il censimento ─────────────────────────────────────────────────────────
  // Le riconferme si contano DIRETTAMENTE dalle righe di rosa con `seq`
  // negativo — è la marca che `reduce()` dà loro (reduce.ts riga 99) — e non
  // per differenza fra posti occupati e acquisti di stasera. Una sottrazione
  // qui produrrebbe un numero che sembra misurato e invece è dedotto, e che su
  // uno stato incoerente col log mentirebbe senza dirlo.
  const teams = Object.values(state.teams);
  let openSlots = 0;
  let teamsWithOpenSlot = 0;
  let widestOpening = 0;
  let confirmedSlots = 0;
  for (const team of teams) {
    const open = team.slotsRemaining[role];
    openSlots += open;
    if (open > 0) teamsWithOpenSlot += 1;
    if (open > widestOpening) widestOpening = open;
    for (const entry of team.roster) {
      if (entry.role === role && entry.seq < 0) confirmedSlots += 1;
    }
  }

  return {
    kind: "facts",
    facts: {
      role,
      takenTonight: tonight.length,
      creditsTonight,
      buyers,
      teamsCounted: teams.length,
      roleSlotsTotal: ROSTER_REQUIREMENTS[role] * teams.length,
      openSlots,
      teamsWithOpenSlot,
      widestOpening,
      confirmedSlots,
    },
  };
}
