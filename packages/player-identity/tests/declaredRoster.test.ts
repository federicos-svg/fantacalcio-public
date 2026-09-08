import { describe, expect, it } from "vitest";

import { type DeclaredRoster, declareRoster, rosterHandle } from "../src/declaredRoster.js";
import { resolveIdentities } from "../src/resolveIdentities.js";
import { PLATFORM_IDENTIFIER_SPACE, TEAM_VOCABULARY, record, roster } from "./synthetic.js";

describe("la porta d'ingresso pretende ciò che il risolutore non può dedurre", () => {
  it("rifiuta una lista senza provenienza dichiarata", () => {
    expect(() =>
      declareRoster({ sourceId: "listone", provenance: "   ", records: [record("L1", "Marlo Zurbetti")] }),
    ).toThrow(/provenienza/i);
  });

  it("rifiuta una lista senza nome della fonte", () => {
    expect(() => declareRoster({ sourceId: "", provenance: "lettura sintetica", records: [] })).toThrow(
      /nome della fonte/i,
    );
  });

  it("rifiuta due righe con la stessa chiave: un elenco che non si sa indicizzare", () => {
    expect(() =>
      declareRoster({
        sourceId: "listone",
        provenance: "lettura sintetica",
        records: [record("L1", "Marlo Zurbetti"), record("L1", "Mirla Zurbetti")],
      }),
    ).toThrow(/due volte/i);
  });

  it("rifiuta una riga senza chiave", () => {
    expect(() =>
      declareRoster({
        sourceId: "listone",
        provenance: "lettura sintetica",
        records: [record("", "Marlo Zurbetti")],
      }),
    ).toThrow(/senza chiave/i);
  });

  it("rifiuta identificativi senza uno spazio dichiarato — l'ipotesi non si assume", () => {
    expect(() =>
      declareRoster({
        sourceId: "listone",
        provenance: "lettura sintetica",
        records: [record("L1", "Marlo Zurbetti", null, "P-0001")],
      }),
    ).toThrow(/spazio dichiarato/i);
  });

  it("rifiuta squadre senza un vocabolario dichiarato — qui non si riconciliano i nomi delle squadre", () => {
    expect(() =>
      declareRoster({
        sourceId: "listone",
        provenance: "lettura sintetica",
        records: [record("L1", "Marlo Zurbetti", "ALFA")],
      }),
    ).toThrow(/vocabolario/i);
  });

  it("accetta una lista completa e le attacca la targa", () => {
    const declared = roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA", "P-0001")], {
      identifierSpace: PLATFORM_IDENTIFIER_SPACE,
    });
    expect(rosterHandle(declared)).toEqual({
      sourceId: "piattaforma",
      provenance: "lettura sintetica della fonte piattaforma",
      recordCount: 1,
    });
    expect(declared.teamVocabulary).toBe(TEAM_VOCABULARY);
  });

  it("la guardia a runtime ferma il cast dimentico: senza targa non si abbina", () => {
    // Il sigillo di `DeclaredRoster` ferma l'ASSEGNAZIONE accidentale di un
    // elenco grezzo; NON ferma questo cast. Che è esattamente il caso che la
    // guardia a runtime esiste per raccogliere: chi aggira il tipo quasi mai
    // si ricorda anche di inventare la provenienza.
    const senzaTarga = {
      sourceId: "fonte-anonima",
      provenance: "",
      teamVocabulary: null,
      identifierSpace: null,
      records: [record("X1", "Marlo Zurbetti")],
    } as unknown as DeclaredRoster;
    const buona = roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]);
    expect(() => resolveIdentities(senzaTarga, buona)).toThrow(/provenienza dichiarata/i);
    expect(() => resolveIdentities(buona, senzaTarga)).toThrow(/provenienza dichiarata/i);
  });
});
