// LA DIVERGENZA FRA I DUE NORMALIZZATORI, PIANTATA — e perché una prova e non
// una frase.
//
// In questo repository vivono due `normalizePlayerName()` con lo stesso nome e
// due comportamenti diversi:
//
//   - `packages/identity-policy/src/nameSimilarity.ts` — RIPARATO: piega le
//     lettere latine estese che NFD non scompone (`ø`, `đ`, `ß`, `æ`…) alla
//     loro lettera base, con una tabella dichiarata;
//   - `packages/appeal-index/src/nameNormalization.ts` — NON riparato, e
//     apposta: il suo risultato è la chiave del giocatore del generatore, e
//     cambiarla cambia le chiavi di un altro sottosistema. È una riparazione a
//     sé, con la sua misura.
//
// PERCHÉ QUESTA PROVA ESISTE. Fino a oggi l'unica difesa di questa differenza
// era la PROSA dei commenti, e la prosa si scolla: la stessa frase — «stessa
// classe di limite» — è rimasta vera in due file e falsa in un terzo per tutto
// il tempo fra la riparazione e la review che l'ha trovata. Un commento non si
// accorge di niente. Questa prova sì.
//
// COME VA LETTO UN ROSSO QUI. Se un giorno qualcuno riallinea i due — o li fa
// divergere ancora di più — questa prova diventa rossa. **Quel rosso non è un
// guasto da mettere a tacere: è una decisione da prendere.** Chi lo vede deve
// scegliere, e scriverlo: o la riparazione è stata portata anche
// nell'altro pacchetto (e allora questa prova va cambiata insieme alla misura
// che lo giustifica, non prima), oppure la divergenza è stata rotta per
// sbaglio e va rimessa. Cambiare questo file per far tornare il verde, senza
// scegliere, è l'unico uso vietato.
//
// Nomi sintetici, come ovunque nel core.

import { describe, expect, it } from "vitest";

import { normalizePlayerName as appealIndex } from "../../appeal-index/src/nameNormalization.js";
import { normalizePlayerName as identityPolicy } from "../src/nameSimilarity.js";

/** Le quattordici lettere della tabella, con la base a cui `identity-policy` le piega. */
const LETTERE_PIEGATE: readonly (readonly [string, string])[] = [
  ["ø", "o"],
  ["đ", "d"],
  ["ð", "d"],
  ["ł", "l"],
  ["ħ", "h"],
  ["ŧ", "t"],
  ["ŋ", "n"],
  ["ı", "i"],
  ["ĸ", "k"],
  ["ſ", "s"],
  ["æ", "ae"],
  ["œ", "oe"],
  ["ß", "ss"],
  ["þ", "th"],
];

/**
 * I casi su cui i due devono restare D'ACCORDO. Se qui cade qualcosa, la
 * divergenza si è allargata oltre ciò che è stato deciso — che è l'altro modo
 * di scollarsi, e va visto come il primo.
 */
const CASI_CONDIVISI: readonly string[] = [
  "Zurbetti Nadio",
  "  Synth   Testman  ",
  "D'Alpha-Beta",
  "Ferràndoli Ivo",
  "Ünïcòdé Plàyér",
  "Vaschìn M.",
  "",
  "   ",
];

describe("i due normalizzatori divergono, e la divergenza è voluta", () => {
  it("su ognuna delle quattordici lettere i due danno risposte DIVERSE", () => {
    for (const [lettera, base] of LETTERE_PIEGATE) {
      const nome = `Zur${lettera}betti`;
      expect(identityPolicy(nome)).toBe(`zur${base}betti`);
      // `appeal-index` la trasforma ancora in uno spazio: due token dove ce
      // n'era uno. È il difetto che qui è stato riparato e là no.
      expect(appealIndex(nome)).toBe("zur betti");
      expect(identityPolicy(nome)).not.toBe(appealIndex(nome));
    }
  });

  it("la differenza è esattamente quella, e non un'altra: su tutto il resto coincidono", () => {
    for (const caso of CASI_CONDIVISI) {
      expect(identityPolicy(caso)).toBe(appealIndex(caso));
    }
  });

  it("un cognome che non contiene nessuna di quelle lettere resta identico nei due", () => {
    // Il contro-esempio che rende la prova sopra informativa invece che
    // tautologica: la divergenza dipende dalla lettera, non dal pacchetto.
    expect(identityPolicy("Vamproni Oscar")).toBe(appealIndex("Vamproni Oscar"));
    expect(identityPolicy("Vamproni Oscar")).toBe("vamproni oscar");
  });

  it("il buco dell'altro pacchetto è quello noto, e questa riga lo tiene scritto", () => {
    // Non è una prova del comportamento giusto: è una prova del comportamento
    // SBAGLIATO che abbiamo scelto di non toccare adesso. Se diventa verde da
    // sé, qualcuno ha riparato `appeal-index` — buona notizia, ma da leggere e
    // da accompagnare con la misura sulle chiavi del generatore.
    expect(appealIndex("Østerbetti")).toBe("sterbetti"); // iniziale mangiata
    expect(appealIndex("Straßner")).toBe("stra ner"); // cognome spezzato
    expect(identityPolicy("Østerbetti")).toBe("osterbetti");
    expect(identityPolicy("Straßner")).toBe("strassner");
  });
});
