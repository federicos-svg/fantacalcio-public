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

  it("rifiuta una riga senza nome, e lo dice nominando la riga", () => {
    // Fino al 2026-09-09 questa riga non veniva fermata qui: esplodeva più a
    // valle, dentro la normalizzazione, senza dire QUALE riga, e faceva
    // abortire il confronto fra le due liste intere. Una riga sporca su
    // migliaia bloccava tutto il lotto.
    expect(() =>
      declareRoster({
        sourceId: "listone",
        provenance: "lettura sintetica",
        records: [
          record("L1", "Marlo Zurbetti"),
          { ref: "L2", displayName: null as unknown as string },
        ],
      }),
    ).toThrow(/"L2"/);
  });

  it("un nome VUOTO invece passa la porta: è un dato povero, non una riga rotta", () => {
    // La distinzione è la sostanza della riparazione: nullo = contratto
    // violato, si ferma alla porta; vuoto = buco puntuale, prosegue ed esce
    // fra i non risolti con la propria ragione, senza toccare le altre righe.
    const declared = roster("listone", [record("L1", "   ", "ALFA"), record("L2", "Marlo Zurbetti", "ALFA")]);
    const resolution = resolveIdentities(
      declared,
      roster("piattaforma", [record("R2", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef])).toEqual([["L2", "R2"]]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "name_not_comparable"],
    ]);
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

describe("controlla-e-poi-usa: la porta legge una volta sola, e la copia congelata è l'unica che viaggia", () => {
  // Misurato sul codice PRIMA della riparazione, ed è la ragione per cui i
  // test qui sotto esistono: `declareRoster()` percorreva
  // `input.records` per validarlo e poi lo RILEGGEVA per conservarlo, e leggeva
  // due volte anche `sourceId`, `provenance`, `teamVocabulary`,
  // `identifierSpace` e i campi di ogni riga. Chi rimette una seconda lettura —
  // o riconserva il riferimento ricevuto invece della copia — rende rosso
  // esattamente uno di questi casi.

  it("il riferimento ricevuto non si conserva: una riga aggiunta DOPO il sì non arriva al risolutore", () => {
    // Il caso senza alcun trucco, e il più facile da incontrare per sbaglio:
    // nessun `getter`, solo un chiamante che continua a riempire il proprio
    // elenco. Prima della riparazione la seconda riga — chiave DUPLICATA, cioè
    // la cosa che questa porta promette di fermare — usciva agganciata a R1
    // con targa `strong`.
    const righe = [record("L1", "Marlo Zurbetti", "ALFA")];
    const listone = roster("listone", righe);
    righe.push(record("L1", "Nilo D'Orbeni", "ALFA"));

    expect(listone.records).toHaveLength(1);
    expect(rosterHandle(listone).recordCount).toBe(1);
    const resolution = resolveIdentities(
      listone,
      roster("piattaforma", [record("R1", "Nilo D'Orbeni", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
  });

  it("la riga conservata non è quella del chiamante: mutarla dopo il sì non cambia l'abbinamento", () => {
    const riga = { ref: "L1", displayName: "Marlo Zurbetti", teamKey: "ALFA", identifier: null };
    const listone = roster("listone", [riga]);
    // Prima della riparazione questo `null` arrivava fino dentro la
    // normalizzazione e faceva abortire il confronto fra le due liste intere.
    (riga as { displayName: unknown }).displayName = null;

    const resolution = resolveIdentities(
      listone,
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef])).toEqual([["L1", "R1"]]);
  });

  it("un elenco che risponde diverso alla seconda lettura viene letto una volta sola", () => {
    let letture = 0;
    const pulito = [record("L1", "Marlo Zurbetti", "ALFA")];
    const sporco = [
      record("L1", "Marlo Zurbetti", "ALFA"),
      { ref: "L1", displayName: null as unknown as string, teamKey: "ALFA", identifier: null },
    ];
    const listone = declareRoster({
      sourceId: "listone",
      provenance: "lettura sintetica",
      teamVocabulary: TEAM_VOCABULARY,
      identifierSpace: null,
      get records() {
        letture += 1;
        return letture === 1 ? pulito : sporco;
      },
    });

    expect(letture).toBe(1);
    expect(listone.records).toHaveLength(1);
  });

  it("un campo della riga che cambia risposta non fa validare una cosa e usare un'altra", () => {
    let letture = 0;
    const listone = declareRoster({
      sourceId: "listone",
      provenance: "lettura sintetica",
      teamVocabulary: TEAM_VOCABULARY,
      identifierSpace: null,
      records: [
        {
          ref: "L1",
          get displayName() {
            letture += 1;
            // Alla porta un nome, al risolutore no: è l'iterabile non
            // idempotente un piano più in basso.
            return letture === 1 ? "Marlo Zurbetti" : (null as unknown as string);
          },
          teamKey: "ALFA",
          identifier: null,
        },
      ],
    });

    expect(listone.records[0]?.displayName).toBe("Marlo Zurbetti");
    const resolution = resolveIdentities(
      listone,
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef])).toEqual([["L1", "R1"]]);
  });

  it("un campo della dichiarazione che cambia risposta viene verificato e copiato nella stessa lettura", () => {
    let letture = 0;
    const listone = declareRoster({
      sourceId: "listone",
      provenance: "lettura sintetica",
      get teamVocabulary() {
        letture += 1;
        // Prima della riparazione la verifica vedeva il vocabolario e la copia
        // vedeva questo: la lista finiva con `teamVocabulary` a `null`, cioè
        // con ogni squadra «non confrontabile», senza che nessuno lo dicesse.
        return letture === 1 ? TEAM_VOCABULARY : (12345 as unknown as string);
      },
      identifierSpace: null,
      records: [record("L1", "Marlo Zurbetti", "ALFA")],
    });

    expect(listone.teamVocabulary).toBe(TEAM_VOCABULARY);
  });

  it("la copia è congelata fino in fondo: lista, elenco e righe", () => {
    const listone = roster("listone", [record("L1", "Marlo Zurbetti", "ALFA")]);
    expect(Object.isFrozen(listone)).toBe(true);
    expect(Object.isFrozen(listone.records)).toBe(true);
    expect(Object.isFrozen(listone.records[0])).toBe(true);
  });
});
