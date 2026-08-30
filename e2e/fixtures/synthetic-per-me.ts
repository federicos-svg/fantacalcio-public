// PER ME — listone sintetico per la suite E2E.
//
// Tutto inventato: club «ClubAlfa/Beta/Gamma», giocatori «Attaccante Forte» e
// compagnia, quotazioni scelte per esercitare l'ordine e non copiate da nessuna
// fonte reale. Nessuna riga del listone vero (public/data/listone_2025_26.json)
// entra qui, e il network guard aborta qualunque richiesta esterna.
//
// LA SCENA È COSTRUITA PERCHÉ UN VALORE *DERIVATO* SBAGLIEREBBE. Il surplus del
// sottoblocco (decisione di Pico, 2026-08-25) sottrae l'ancora al valore che
// PICO DICHIARA, e qui nessuno è dichiarato: la scena non ne porta. Se qualcuno
// gli sostituisse il valore ASSOLUTO — piatto per ruolo, uguale per tutti gli
// attaccanti — l'unico candidato con differenza positiva sarebbe «Attaccante
// Scarso» a 2 cr, e i due da 40 e 60 sarebbero esclusi. Con i criteri veri
// «Attaccante Scarso» è invece ULTIMO, e a tetto di tre righe non compare
// nemmeno: è ciò che e2e/per-me-row.spec.ts asserisce sul DOM vivo.

import type { ListonePlayer } from "../../src/ui/listone.js";
import { listonePlayerKey } from "../../src/ui/listone.js";

/** La ricetta dell'indice, nella forma che la Factory emette. Una sola per
 *  tutto il listone: con due ricette la provenienza non sarebbe dichiarabile e
 *  il libro delle fasce si rifiuterebbe (src/tierOrdering.ts). */
export const PER_ME_RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";

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
 * Il listone sintetico. L'ordine di ingresso è deliberatamente DIVERSO
 * dall'ordine atteso a schermo: se il sottoblocco stampasse il pool così com'è,
 * il test lo vedrebbe.
 */
export const PER_ME_POOL: readonly ListonePlayer[] = [A_SCARSO, D_FORTE, A_MEDIO, A_FORTE];

/** Le chiavi con cui l'app identifica le righe: le stesse dell'event log. */
export const PER_ME_KEYS = {
  forte: listonePlayerKey(A_FORTE),
  medio: listonePlayerKey(A_MEDIO),
  scarso: listonePlayerKey(A_SCARSO),
  difensore: listonePlayerKey(D_FORTE),
} as const;
