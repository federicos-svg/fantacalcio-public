// L'AMBIGUITÀ CHE DEVE RESTARE AMBIGUA.
//
// Questo file è scritto per diventare ROSSO il giorno in cui qualcuno decide
// di «risolvere» un'ambiguità scegliendo un candidato — e per restare rosso
// anche se quel qualcuno rende la scelta deterministica (ordinando i
// candidati, o prendendo sempre il primo dell'elenco d'ingresso). Le quattro
// prove che seguono chiudono le quattro strade:
//
//   1. il ref ambiguo NON compare fra gli abbinati, e compare fra gli ambigui
//      con TUTTI i suoi candidati — muore chi sceglie, comunque scelga;
//   2. permutando l'ordine d'ingresso il risultato è IDENTICO — muore chi
//      sceglie «il primo che arriva»;
//   3. i due candidati rivali sono INDISTINGUIBILI a meno della chiave —
//      quindi nessun criterio potrebbe preferirne uno, e sceglierne uno è
//      arbitrario per costruzione, non per pigrizia;
//   4. l'ambiguità BRUCIA: un criterio più debole non riprende la riga —
//      muore chi «scioglie» ricadendo su un segnale più leggero.
//
// Se un giorno il progetto decidesse davvero di accettare abbinamenti
// probabili, questi test vanno CANCELLATI con una decisione scritta e datata,
// non aggirati: è esattamente il gesto che si vuole rendere rumoroso.

import { describe, expect, it } from "vitest";

import { type IdentityResolution, resolveIdentities } from "../src/resolveIdentities.js";
import { record, refs, roster } from "./synthetic.js";

/** Due omonimi nella stessa squadra, e una riga abbreviata che li vede entrambi. */
function omonimi(rightOrder: "diretto" | "invertito"): IdentityResolution {
  const destra = [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Mirla Zurbetti", "ALFA")];
  return resolveIdentities(
    roster("probabili", [record("L1", "M. Zurbetti", "ALFA")]),
    roster("piattaforma", rightOrder === "diretto" ? destra : [...destra].reverse()),
  );
}

describe("omonimi nella stessa squadra: l'ambiguità si dichiara, non si scioglie", () => {
  it("nessun abbinamento, e la riga ambigua porta con sé TUTTI i candidati", () => {
    const resolution = omonimi("diretto");

    // Il cuore della prova: se un giorno qualcuno «risolvesse» prendendo un
    // candidato — il primo, l'ultimo, il più corto, quello con la chiave
    // minore — questa riga diventerebbe rossa. Non c'è modo di scegliere che
    // la superi.
    expect(resolution.matches).toEqual([]);

    const ambiguaSinistra = resolution.ambiguous.filter((item) => item.side === "left");
    expect(ambiguaSinistra).toHaveLength(1);
    expect(ambiguaSinistra[0]?.ref).toBe("L1");
    expect(ambiguaSinistra[0]?.reason).toBe("multiple_candidates");
    expect(ambiguaSinistra[0]?.criterion).toBe("abbreviated_name_same_team");
    expect(ambiguaSinistra[0]?.candidates).toEqual(["R1", "R2"]);

    // E i due rivali non spariscono: sanno di essere stati contesi.
    expect(refs(resolution.ambiguous.filter((item) => item.side === "right"))).toEqual(["R1", "R2"]);
    for (const item of resolution.ambiguous.filter((entry) => entry.side === "right")) {
      expect(item.reason).toBe("contested_candidate");
      expect(item.candidates).toEqual(["L1"]);
    }
  });

  it("nessuna chiave dichiarata ambigua ricompare fra gli abbinati", () => {
    const resolution = omonimi("diretto");
    const ambigue = new Set(resolution.ambiguous.map((item) => `${item.side}:${item.ref}`));
    for (const match of resolution.matches) {
      expect(ambigue.has(`left:${match.leftRef}`)).toBe(false);
      expect(ambigue.has(`right:${match.rightRef}`)).toBe(false);
    }
    expect(ambigue.size).toBeGreaterThan(0);
  });

  it("permutare l'ordine d'ingresso non cambia una virgola del risultato", () => {
    // Chi «sceglie il primo candidato» sopravvive alla prova qui sopra solo
    // se ordina i candidati; chi non li ordina muore qui, perché invertendo
    // le due righe rivali sceglierebbe l'altra.
    expect(omonimi("invertito")).toEqual(omonimi("diretto"));
  });

  it("i due candidati sono indistinguibili a meno della chiave: preferirne uno è arbitrario", () => {
    // Non «difficile da decidere»: IMPOSSIBILE da decidere con ciò che questo
    // modulo sa. Stesso identico contenuto confrontabile, stessa squadra,
    // stessa forma del nome rispetto alla riga di sinistra.
    const gemelli = [
      record("R1", "Marlo Zurbetti", "ALFA"),
      record("R2", "Marlo Zurbetti", "ALFA"),
    ];
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "Marlo Zurbetti", "ALFA")]),
      roster("piattaforma", gemelli),
    );
    const [primo, secondo] = gemelli;
    expect(primo).toBeDefined();
    expect(secondo).toBeDefined();
    expect({ ...primo, ref: "" }).toEqual({ ...secondo, ref: "" });

    expect(resolution.matches).toEqual([]);
    expect(resolution.ambiguous.filter((item) => item.side === "left")[0]?.candidates).toEqual(["R1", "R2"]);
  });
});

describe("l'ambiguità brucia: nessun criterio più debole la riprende", () => {
  it("una riga ambigua sul nome esatto non viene poi agganciata dal rango «squadra diversa»", () => {
    // Se l'ambiguità NON bruciasse, L1 uscirebbe agganciata a R3 con targa
    // «squadra diversa»: un vincitore prodotto da un criterio più debole di
    // quello che era già risultato insufficiente. È scegliere, non
    // riconoscere — e questa riga lo vieta.
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Nilo D'Orbeni", "ALFA")]),
      roster("piattaforma", [
        record("R1", "Nilo D'Orbeni", "ALFA"),
        record("R2", "Nilo D Orbeni", "ALFA"),
        record("R3", "Nilo D'Orbeni", "BETA"),
      ]),
    );

    expect(resolution.matches).toEqual([]);
    const sinistra = resolution.ambiguous.filter((item) => item.side === "left");
    expect(sinistra).toHaveLength(1);
    expect(sinistra[0]?.criterion).toBe("exact_name_same_team");
    expect(sinistra[0]?.candidates).toEqual(["R1", "R2"]);
    // R3 non è stata «recuperata» da nessuno: resta un buco visibile.
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([["R3", "no_candidate"]]);
  });

  it("un candidato conteso da due righe non viene assegnato a nessuna delle due", () => {
    const resolution = resolveIdentities(
      roster("listone", [record("L1", "Marlo Zurbetti", "ALFA"), record("L2", "Marlo Zurbetti", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(refs(resolution.ambiguous)).toEqual(["L1", "L2", "R1"]);
    expect(
      resolution.ambiguous.filter((item) => item.side === "right")[0]?.candidates,
    ).toEqual(["L1", "L2"]);
  });
});
