// PER ME — listone sintetico per la suite E2E.
//
// Tutto inventato: club «ClubAlfa/Beta/Gamma», giocatori «Attaccante NN» e
// compagnia, quotazioni, previsioni e prezzi storici scelti per esercitare
// l'ordine e non copiati da nessuna fonte. Nessuna riga del listone vero
// (public/data/listone_2025_26.json) entra qui, e il network guard aborta
// qualunque richiesta esterna.
//
// ─────────────────────────────────────────────────────────────────────────────
// DUE SCENE, PERCHÉ IL PANNELLO HA DUE ESITI VERI
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. `PER_ME_POOL` — quattro righe con la sola Qt.A, SENZA le previsioni del
//    deposito. È la scena del silenzio dichiarato: senza previsioni non si
//    forma nessun `V`, quindi nemmeno un surplus, e il sottoblocco dice
//    `no-forecast` invece di mostrare righe fabbricate.
//
// 2. `PER_ME_DEPOSIT_POOL` + `PER_ME_HISTORY_STORE` — sessanta attaccanti con
//    le previsioni servite, più cinque stagioni di storico d'asta nello
//    storage runtime-local. È la scena in cui il pannello PARLA, ed è grande
//    per una ragione strutturale, non per gusto:
//      - `V` esiste solo dove il ruolo arriva al proprio rango di rimpiazzo,
//        che per gli attaccanti è 57 (7 slot × 8 squadre + 1);
//      - `P̂` esiste solo dove la fascia di rango (1-3, 4-8, 9-15, 16-30, 31+)
//        ha almeno cinque osservazioni storiche.
//    Con trentacinque acquisti a stagione tutte e cinque le fasce sono
//    leggibili; una scena più piccola proverebbe soltanto che il pannello tace.
//
// LA SCENA È COSTRUITA PERCHÉ UN VALORE *DERIVATO* SBAGLIEREBBE. Il surplus
// sottrae il prezzo atteso al valore in crediti `V`, che CRESCE con la
// produzione prevista del singolo giocatore. Se qualcuno gli sostituisse una
// base piatta per ruolo, `S` diventerebbe monotona decrescente nel prezzo e in
// cima finirebbe il più economico, cioè il peggiore: qui il peggiore ha `V` al
// pavimento e non compare fra le tre righe mostrate.

import type { ListonePlayer } from "../../src/ui/listone.js";
import { listonePlayerKey } from "../../src/ui/listone.js";

/** La ricetta dell'indice, nella forma che la Factory emette. Una sola per
 *  tutto il listone: con due ricette la provenienza non sarebbe dichiarabile e
 *  il libro delle fasce si rifiuterebbe (src/tierOrdering.ts). */
export const PER_ME_RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";

/** La ricetta del GENERATORE, cioè la targa che la riga mostra accanto a `V`. */
export const PER_ME_GEN_RECIPE = "GEN-RECIPE@1.0.0";

/** La chiave dello storico d'asta runtime-local, come l'app la legge al boot. */
export const AUCTION_HISTORY_KEY = "fac_auction_history";

function withIndex(row: ListonePlayer, score: number): ListonePlayer {
  return {
    ...row,
    appealIndex: {
      score,
      quality: "sintetico — fixture E2E, non validato",
      recipe: PER_ME_RECIPE,
      components: { base: score },
    },
  };
}

// ─── Scena 1: il silenzio dichiarato ─────────────────────────────────────────

export const A_FORTE = withIndex(
  { name: "Attaccante Forte", role: "A", club: "ClubAlfa", quotation: 60 },
  90,
);
export const A_MEDIO = withIndex(
  { name: "Attaccante Medio", role: "A", club: "ClubAlfa", quotation: 40 },
  80,
);
export const A_SCARSO = withIndex(
  { name: "Attaccante Scarso", role: "A", club: "ClubBeta", quotation: 2 },
  10,
);
export const D_FORTE = withIndex(
  { name: "Difensore Forte", role: "D", club: "ClubGamma", quotation: 30 },
  70,
);

/**
 * Il listone sintetico SENZA deposito. L'ordine di ingresso è deliberatamente
 * diverso dall'ordine atteso a schermo: se il sottoblocco stampasse il pool
 * così com'è, il test lo vedrebbe.
 */
export const PER_ME_POOL: readonly ListonePlayer[] = [A_SCARSO, D_FORTE, A_MEDIO, A_FORTE];

/** Le chiavi con cui l'app identifica le righe: le stesse dell'event log. */
export const PER_ME_KEYS = {
  forte: listonePlayerKey(A_FORTE),
  medio: listonePlayerKey(A_MEDIO),
  scarso: listonePlayerKey(A_SCARSO),
  difensore: listonePlayerKey(D_FORTE),
} as const;

// ─── Scena 2: il pannello che parla ──────────────────────────────────────────

/**
 * Un attaccante servito dal deposito. Quotazione e previsioni decrescono col
 * numero, così il rango di listone (per `T1̂`) coincide con l'ordine dei nomi e
 * ogni asserzione sull'ordine resta leggibile.
 */
function servedAttacker(i: number): ListonePlayer {
  const n = String(i + 1).padStart(2, "0");
  return {
    ...withIndex(
      {
        name: `Attaccante ${n}`,
        role: "A",
        club: i % 2 === 0 ? "ClubAlfa" : "ClubBeta",
        quotation: 100 - i,
      },
      100 - i,
    ),
    genForecast: {
      recipeVersion: PER_ME_GEN_RECIPE,
      protocolVersion: "2.1.3",
      runId: "refit-0000synthetic",
      authority: "advisory",
      targets: {
        T2: { value: 6.5 - i / 100, interval: null, status: "winner" },
        TN: { value: 30, interval: null, status: "winner", capApplied: false },
        T1: { value: 300 - 4 * i, interval: null, status: "winner" },
      },
    },
  };
}

/** Sessanta attaccanti serviti: `r*` è 57, quindi i primi 56 stanno sopra il
 *  rimpiazzo e gli ultimi quattro hanno `V` al pavimento. */
export const PER_ME_DEPOSIT_POOL: readonly ListonePlayer[] = Array.from({ length: 60 }, (_, i) =>
  servedAttacker(i),
);

/** Il giocatore di testa della scena servita. */
export const PER_ME_DEPOSIT_TOP = PER_ME_DEPOSIT_POOL[0]!;

const SEASONS = ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"] as const;
const PURCHASES_PER_SEASON = 35;

/**
 * Cinque stagioni di storico d'asta sintetico, nella forma esatta che lo
 * storage runtime-local persiste (`AuctionHistoryStore`).
 *
 * I `personId` sono UUID inventati nel formato che lo schema impone: nessuna
 * persona reale, nessun posto reale. I `playerId` sono le chiavi delle righe
 * del listone servito, perché il ruolo di una riga storica non è nello storico
 * e si risolve dal listone.
 */
export function syntheticPerMeHistory(): unknown {
  const purchases = SEASONS.flatMap((season, s) =>
    Array.from({ length: PURCHASES_PER_SEASON }, (_, k) => {
      const rank = k + 1;
      const player = PER_ME_DEPOSIT_POOL[k]!;
      return {
        season,
        personId: `person:00000000-0000-4000-8000-0000000000${String(s + 1).padStart(2, "0")}`,
        playerId: listonePlayerKey(player),
        club: player.club,
        price: 140 - 3 * rank,
        acquisition: "asta",
      };
    }),
  );
  return { schemaVersion: 1, purchases };
}
