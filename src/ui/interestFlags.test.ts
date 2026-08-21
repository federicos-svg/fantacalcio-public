// Le parole del gesto «chi era in gara» — unit test dei costruttori puri.
// Posti sintetici, etichette inventate: nessun nome reale.
import { describe, expect, it } from "vitest";
import {
  INTEREST_FLAG_EMPTY_SUMMARY,
  interestChipSpoken,
  interestFlagSummary,
  orderMarkedSeats,
} from "./interestFlags.js";

const SEATS = ["t2", "t3", "t4", "t5", "t6", "t7", "t8"];
const LABELS: Record<string, string> = {
  t2: "Posto 2",
  t3: "Posto 3",
  t4: "Posto 4",
  t5: "Posto 5",
  t6: "Posto 6",
  t7: "Posto 7",
  t8: "Posto 8",
};

describe("interestFlagSummary", () => {
  it("nessuno marcato è un esito NORMALE e si legge come tale", () => {
    expect(interestFlagSummary([], SEATS, LABELS)).toBe(INTEREST_FLAG_EMPTY_SUMMARY);
    // Nessun punto esclamativo, nessun «manca», nessun avviso: non marcare
    // niente non è un errore da correggere.
    expect(interestFlagSummary([], SEATS, LABELS)).not.toMatch(/manca|errore|!/i);
  });

  it("conta e nomina, nell'ordine dei posti e non in un ordine «per intensità»", () => {
    expect(interestFlagSummary(["t5", "t3"], SEATS, LABELS)).toBe("2 marcati: Posto 3, Posto 5");
  });

  it("un posto senza etichetta si nomina col proprio id, non sparisce", () => {
    expect(interestFlagSummary(["t3"], SEATS, {})).toBe("1 marcati: t3");
  });
});

describe("orderMarkedSeats", () => {
  it("segue l'ordine dichiarato dei posti", () => {
    expect(orderMarkedSeats(["t8", "t2", "t5"], SEATS)).toEqual(["t2", "t5", "t8"]);
  });

  it("un posto sconosciuto finisce in fondo invece di sparire in silenzio", () => {
    expect(orderMarkedSeats(["tX", "t3"], SEATS)).toEqual(["t3", "tX"]);
  });

  it("una marcatura doppia resta una sola", () => {
    expect(orderMarkedSeats(["tX", "tX"], SEATS)).toEqual(["tX"]);
    expect(orderMarkedSeats(["t3", "t3"], SEATS)).toEqual(["t3"]);
  });
});

describe("interestChipSpoken", () => {
  it("dice lo stato e il gesto che lo cambia, in entrambi i versi", () => {
    expect(interestChipSpoken("Posto 3", false)).toContain("non marcato");
    expect(interestChipSpoken("Posto 3", false)).toContain("Premi per marcarlo");
    expect(interestChipSpoken("Posto 3", true)).toContain("marcato come in gara");
    expect(interestChipSpoken("Posto 3", true)).toContain("Premi per togliere");
  });
});
