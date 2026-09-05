import { describe, it, expect } from "vitest";
import {
  LINEA_ATTACCO,
  LINEA_CENTROCAMPO,
  LINEA_DIFESA,
  LINEA_PORTA,
  pitchLayout,
  type PitchLayout,
} from "../src/pitchLayout.js";
import { rolesByPlayerId } from "../src/roster.js";
import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type { ObservedLineup } from "../src/lineupSubmission.js";
import { FORMAZIONE, ROSA } from "./fixtures.js";

// IL CAMPO, INTERROGATO SENZA BROWSER.
//
// Ogni prova qui sotto misura una decisione che il disegno NON deve prendere:
// quanti posti ha un reparto, chi ci va dentro, in che ordine, e che cosa
// succede a chi non ci sta. Le fixture sono le sintetiche del pacchetto —
// `p1…p16`, ruoli in `ROSA` — e nessun test apre una pagina.

const RUOLI = rolesByPlayerId(ROSA);

/** Gli id di una riga, con `null` dove la casella è vuota. */
function riga(layout: PitchLayout, line: number): readonly (string | null)[] {
  const trovata = layout.lines[line];
  expect(trovata, `riga ${line}`).toBeDefined();
  if (trovata === undefined) throw new Error(`riga ${line} assente`);
  for (const [indexInLine, slot] of trovata.entries()) {
    // La casella dichiara sempre dove si trova: chi disegna non conta da sé.
    expect(slot.line).toBe(line);
    expect(slot.indexInLine).toBe(indexInLine);
  }
  return trovata.map((slot) => slot.playerId);
}

/** Una mappa dei ruoli a cui manca qualcuno, per provare il ruolo non letto. */
function ruoliSenza(...ids: readonly string[]): ReadonlyMap<string, Role> {
  const parziale = new Map(RUOLI);
  for (const id of ids) parziale.delete(id);
  return parziale;
}

describe("il campo di una formazione completa", () => {
  it("il 4-4-2 dà una porta, quattro difensori, quattro centrocampisti e due attaccanti", () => {
    const layout = pitchLayout(FORMAZIONE, RUOLI);
    expect(layout.module).toBe("442");
    expect(layout.lines).toHaveLength(4);
    expect(riga(layout, LINEA_PORTA)).toEqual(["p1"]);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p2", "p3", "p4", "p5"]);
    expect(riga(layout, LINEA_CENTROCAMPO)).toEqual(["p6", "p7", "p8", "p9"]);
    expect(riga(layout, LINEA_ATTACCO)).toEqual(["p10", "p11"]);
    expect(layout.unplaced).toEqual([]);
  });

  it("ogni casella dichiara il ruolo del suo reparto, e la porta è «P»", () => {
    const layout = pitchLayout(FORMAZIONE, RUOLI);
    const ruoliPerRiga = layout.lines.map((line) => [...new Set(line.map((slot) => slot.role))]);
    expect(ruoliPerRiga).toEqual([["P"], ["D"], ["C"], ["A"]]);
  });

  it("la panchina non entra in campo: il campo mostra gli undici e nessun altro", () => {
    const layout = pitchLayout(FORMAZIONE, RUOLI);
    const inCampo = layout.lines.flat().map((slot) => slot.playerId);
    for (const panchinaro of FORMAZIONE.benchIds) {
      expect(inCampo).not.toContain(panchinaro);
      expect(layout.unplaced).not.toContain(panchinaro);
    }
  });
});

describe("i posti vengono dal modulo, non dal conteggio dei presenti", () => {
  it("un reparto incompleto resta con la casella vuota: il 4-4-2 con tre difensori non diventa un 3-4-2", () => {
    const treDifensori: ObservedLineup = {
      ...FORMAZIONE,
      starterIds: FORMAZIONE.starterIds.filter((id) => id !== "p5"),
    };
    const layout = pitchLayout(treDifensori, RUOLI);
    expect(layout.module).toBe("442");
    // Quattro caselle, tre occupate: il modulo resta quello schierato e il
    // buco si vede. Un layout costruito sui presenti ne avrebbe disegnate tre.
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p2", "p3", "p4", null]);
    expect(riga(layout, LINEA_CENTROCAMPO)).toEqual(["p6", "p7", "p8", "p9"]);
    expect(layout.unplaced).toEqual([]);
  });

  it("i titolari in eccesso finiscono fra i non collocati, e non sparisce nessuno", () => {
    // Gli stessi undici schierati con 3-5-2: il quarto difensore non ha casella.
    const layout = pitchLayout({ ...FORMAZIONE, module: "352" }, RUOLI);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p2", "p3", "p4"]);
    expect(riga(layout, LINEA_CENTROCAMPO)).toEqual(["p6", "p7", "p8", "p9", null]);
    expect(riga(layout, LINEA_ATTACCO)).toEqual(["p10", "p11"]);
    expect(layout.unplaced).toEqual(["p5"]);
    // Nessun titolare è stato perso per strada.
    const visti = [...layout.lines.flat().map((slot) => slot.playerId), ...layout.unplaced];
    for (const id of FORMAZIONE.starterIds) expect(visti).toContain(id);
  });
});

describe("il reparto lo decide il ruolo letto, mai la posizione nell'elenco", () => {
  it("un titolare senza ruolo osservato non prende una casella per esclusione", () => {
    const layout = pitchLayout(FORMAZIONE, ruoliSenza("p6"));
    expect(layout.unplaced).toEqual(["p6"]);
    // Il centrocampo perde un occupante, non un posto: p6 non è finito in
    // difesa perché «avanzava un posto in difesa».
    expect(riga(layout, LINEA_CENTROCAMPO)).toEqual(["p7", "p8", "p9", null]);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p2", "p3", "p4", "p5"]);
  });

  it("un portiere fra i titolari di movimento non ha reparto: il modulo non ha caselle per lui", () => {
    const conDuePortieri: ObservedLineup = {
      ...FORMAZIONE,
      starterIds: ["p12", ...FORMAZIONE.starterIds.filter((id) => id !== "p2")],
      benchIds: FORMAZIONE.benchIds.filter((id) => id !== "p12"),
    };
    const layout = pitchLayout(conDuePortieri, RUOLI);
    expect(layout.unplaced).toEqual(["p12"]);
    expect(riga(layout, LINEA_PORTA)).toEqual(["p1"]);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p3", "p4", "p5", null]);
  });

  it("l'ordine dentro il reparto è quello dichiarato dalla formazione, non quello della rosa", () => {
    const alContrario: ObservedLineup = {
      ...FORMAZIONE,
      starterIds: ["p5", "p4", "p3", "p2", "p9", "p8", "p7", "p6", "p11", "p10"],
    };
    const layout = pitchLayout(alContrario, RUOLI);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p5", "p4", "p3", "p2"]);
    expect(riga(layout, LINEA_CENTROCAMPO)).toEqual(["p9", "p8", "p7", "p6"]);
    expect(riga(layout, LINEA_ATTACCO)).toEqual(["p11", "p10"]);
    // Mescolare i reparti fra loro non cambia chi sta in quale riga: il ruolo
    // decide la riga, l'elenco decide il posto dentro la riga.
    const mescolata: ObservedLineup = {
      ...FORMAZIONE,
      starterIds: ["p10", "p2", "p6", "p3", "p7", "p11", "p4", "p8", "p5", "p9"],
    };
    const mescolato = pitchLayout(mescolata, RUOLI);
    expect(riga(mescolato, LINEA_DIFESA)).toEqual(["p2", "p3", "p4", "p5"]);
    expect(riga(mescolato, LINEA_ATTACCO)).toEqual(["p10", "p11"]);
  });

  it("gli stessi argomenti danno lo stesso campo: nessun ordine dipende da un'iterazione", () => {
    expect(pitchLayout(FORMAZIONE, RUOLI)).toEqual(pitchLayout(FORMAZIONE, RUOLI));
    // Una mappa dei ruoli costruita in un altro ordine non sposta nessuno.
    const invertita = new Map([...RUOLI].reverse());
    expect(pitchLayout(FORMAZIONE, invertita)).toEqual(pitchLayout(FORMAZIONE, RUOLI));
  });
});

describe("la porta, che è un posto solo e dichiarato", () => {
  it("il portiere sta dove la formazione dice, anche se il suo ruolo non è stato letto", () => {
    // Spostarlo fra i non collocati disegnerebbe una porta vuota che nella
    // formazione vuota non è. Che sia illegale lo dice `submissionLegality`.
    const layout = pitchLayout(FORMAZIONE, ruoliSenza("p1"));
    expect(riga(layout, LINEA_PORTA)).toEqual(["p1"]);
    expect(layout.unplaced).toEqual([]);
  });

  it("una porta senza nessuno si disegna vuota, non si riempie", () => {
    const layout = pitchLayout({ ...FORMAZIONE, goalkeeperId: "" }, RUOLI);
    expect(riga(layout, LINEA_PORTA)).toEqual([null]);
    expect(riga(layout, LINEA_DIFESA)).toEqual(["p2", "p3", "p4", "p5"]);
  });
});

describe("un modulo che i sette di §9 non contengono", () => {
  it("resta la porta, e ogni titolare di movimento si dichiara non collocato", () => {
    const inventato = { ...FORMAZIONE, module: "4231" } as unknown as ObservedLineup;
    const layout = pitchLayout(inventato, RUOLI);
    expect(layout.lines).toHaveLength(1);
    expect(riga(layout, LINEA_PORTA)).toEqual(["p1"]);
    // Nessuno ha una casella, e nessuno sparisce: l'elenco è quello dichiarato.
    expect(layout.unplaced).toEqual([...FORMAZIONE.starterIds]);
  });
});
