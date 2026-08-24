import { describe, it, expect } from "vitest";
import {
  EUROPEAN_PARTICIPATION_DECLARED,
  SERIE_A_CLUBS_IN_EUROPE_2026_27,
  playsInEurope,
} from "./serieACompetitions.js";
import { SERIE_A_CLUBS_2026_27 } from "./ui/serieA.js";

// L'ELENCO È PINNATO, come `SERIE_A_CLUBS_2026_27` in src/ui/serieA.test.ts:
// un elenco dichiarato che nessun test guarda è un elenco che qualcuno può
// cambiare per far passare qualcos'altro.
//
// COSA MISURANO QUESTI TEST, e perché ognuno serve da solo:
//
//  a. l'elenco è quello verificato — sette nomi, non «più o meno quelli»;
//  b. ogni nome COMBACIA con la lista dei club di Serie A 2026/27: un nome che
//     non combacia è un aggancio che non avverrà mai, e a schermo si vedrebbe
//     come un'assenza invece che come un errore;
//  c. i TRE esiti restano tre. `false` è un'assenza DICHIARATA e `null` è «non
//     lo so»: fonderli significherebbe far dire all'app che una squadra non
//     gioca le coppe ogni volta che non riesce a riconoscerne il nome.

describe("l'elenco delle squadre in Europa nel 2026/27", () => {
  it("porta le sette squadre verificate, senza duplicati", () => {
    expect([...SERIE_A_CLUBS_IN_EUROPE_2026_27]).toEqual([
      "Inter",
      "Napoli",
      "Roma",
      "Como",
      "Milan",
      "Juventus",
      "Atalanta",
    ]);
    expect(new Set(SERIE_A_CLUBS_IN_EUROPE_2026_27).size).toBe(
      SERIE_A_CLUBS_IN_EUROPE_2026_27.length,
    );
  });

  it("ogni nome è scritto come nella lista dei club di Serie A 2026/27", () => {
    for (const club of SERIE_A_CLUBS_IN_EUROPE_2026_27) {
      expect(SERIE_A_CLUBS_2026_27, club).toContain(club);
    }
  });

  it("l'elenco è dichiarato, e la costante che lo dice è coerente con lui", () => {
    expect(EUROPEAN_PARTICIPATION_DECLARED).toBe(SERIE_A_CLUBS_IN_EUROPE_2026_27.length > 0);
    expect(EUROPEAN_PARTICIPATION_DECLARED).toBe(true);
  });
});

describe("playsInEurope — tre esiti, e il terzo non è il secondo", () => {
  it("true per chi è in elenco", () => {
    expect(playsInEurope("Inter")).toBe(true);
    expect(playsInEurope("Atalanta")).toBe(true);
  });

  it("false per un club di Serie A che NON è in elenco: un'assenza dichiarata", () => {
    expect(playsInEurope("Lazio")).toBe(false);
    expect(playsInEurope("Bologna")).toBe(false);
    expect(playsInEurope("Lecce")).toBe(false);
  });

  it("null senza club: senza soggetto la domanda non ha risposta", () => {
    expect(playsInEurope(null)).toBeNull();
    expect(playsInEurope(undefined)).toBeNull();
    expect(playsInEurope("")).toBeNull();
    expect(playsInEurope("   ")).toBeNull();
  });

  it("null per un nome che non è fra i club di Serie A: mai un `false` di comodo", () => {
    // È il ramo che protegge dall'errore silenzioso peggiore: un club europeo
    // scritto in un modo che non combacia uscirebbe come `false`, cioè come una
    // dichiarazione di assenza al posto di un mancato aggancio.
    expect(playsInEurope("Juve")).toBeNull();
    expect(playsInEurope("Internazionale")).toBeNull();
    expect(playsInEurope("Real Madrid")).toBeNull();
    expect(playsInEurope("Cremonese")).toBeNull(); // retrocessa: non è in Serie A 2026/27
  });

  it("tollera spazi e maiuscole, che è tutta la tolleranza che si concede", () => {
    expect(playsInEurope("  inter ")).toBe(true);
    expect(playsInEurope("JUVENTUS")).toBe(true);
    // Nessuna normalizzazione oltre: non è una risoluzione d'identità.
    expect(playsInEurope("Inter FC")).toBeNull();
  });

  it("non lancia mai, su nessun ingresso", () => {
    for (const club of [...SERIE_A_CLUBS_2026_27, "", "???", "Inter", null, undefined]) {
      expect(() => playsInEurope(club)).not.toThrow();
    }
  });
});
