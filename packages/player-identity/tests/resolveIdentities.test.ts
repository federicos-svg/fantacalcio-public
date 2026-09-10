import { describe, expect, it } from "vitest";

import { type IdentityResolution, resolveIdentities } from "../src/resolveIdentities.js";
import {
  LISTONE_IDENTIFIER_SPACE,
  PLATFORM_IDENTIFIER_SPACE,
  record,
  refs,
  roster,
} from "./synthetic.js";

/**
 * OGNI RIGA FINISCE IN ESATTAMENTE UNO DEI TRE ESITI. È l'invariante che
 * rende vera la frase «il giocatore non agganciato è un buco visibile»: se
 * una riga potesse sparire senza comparire da nessuna parte, un abbinamento
 * perso sarebbe indistinguibile da un giocatore che nella fonte non c'era.
 */
function expectFullAccounting(
  resolution: IdentityResolution,
  leftRefs: readonly string[],
  rightRefs: readonly string[],
): void {
  for (const [side, all] of [
    ["left", leftRefs],
    ["right", rightRefs],
  ] as const) {
    const seen = [
      ...resolution.matches.map((match) => (side === "left" ? match.leftRef : match.rightRef)),
      ...resolution.ambiguous.filter((item) => item.side === side).map((item) => item.ref),
      ...resolution.unresolved.filter((item) => item.side === side).map((item) => item.ref),
    ];
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...all].sort());
  }
}

describe("abbinamento certo", () => {
  it("l'identificativo condiviso aggancia anche dove nessun criterio sul nome ci arriverebbe", () => {
    const listone = roster("listone", [record("L1", "Marlo Zurbetti", "ALFA", "P-0001")], {
      identifierSpace: PLATFORM_IDENTIFIER_SPACE,
    });
    const piattaforma = roster("piattaforma", [record("R1", "Zurbetti M.", "BETA", "P-0001")], {
      identifierSpace: PLATFORM_IDENTIFIER_SPACE,
    });
    const resolution = resolveIdentities(listone, piattaforma);

    expect(resolution.matches).toHaveLength(1);
    const [match] = resolution.matches;
    expect(match).toBeDefined();
    expect(match?.criterion).toBe("shared_identifier");
    expect(match?.certainty).toBe("certain");
    // La squadra non entra al rango 1, ma resta scritta nella targa.
    expect(match?.teamAgreement).toBe("different_declared_team");
    expect(match?.provenance).toEqual({
      left: "lettura sintetica della fonte listone",
      right: "lettura sintetica della fonte piattaforma",
    });
    expectFullAccounting(resolution, ["L1"], ["R1"]);
  });

  it("nome identico e stessa squadra: la targa dice «forte», non «certo»", () => {
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Ondrè Vaschìn", "ALFA")]),
      roster("piattaforma", [record("R1", "Ondre Vaschin", "ALFA")]),
    );
    expect(resolution.matches).toHaveLength(1);
    expect(resolution.matches[0]?.criterion).toBe("exact_name_same_team");
    expect(resolution.matches[0]?.certainty).toBe("strong");
  });

  it("apostrofi scritti in due modi restano la stessa persona", () => {
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "Nilo D'Orbeni", "ALFA")]),
      roster("piattaforma", [record("R1", "Nilo D Orbeni", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef])).toEqual([["L1", "R1"]]);
  });

  it("nome puntato contro nome esteso: aggancia, e la targa dice che è un'iniziale", () => {
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "M. Zurbetti", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toHaveLength(1);
    expect(resolution.matches[0]?.criterion).toBe("abbreviated_name_same_team");
    expect(resolution.matches[0]?.nameEvidence).toBe("abbreviated_name");
  });
});

describe("la squadra cambia durante la stagione", () => {
  it("un ceduto resta lo stesso giocatore: aggancia, con la targa che dichiara le squadre diverse", () => {
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Ondre Vaschin", "ALFA")]),
      roster("piattaforma", [record("R1", "Ondre Vaschin", "BETA")]),
    );
    expect(resolution.matches).toHaveLength(1);
    expect(resolution.matches[0]?.criterion).toBe("exact_name_other_team");
    expect(resolution.matches[0]?.teamAgreement).toBe("different_declared_team");
    // Chi a valle non se lo può permettere filtra per certezza: la targa
    // esiste apposta perché la decisione resti dov'è il costo di sbagliarla.
    expect(resolution.matches.filter((match) => match.certainty === "strong")).toEqual([]);
  });

  it("la squadra non esclude mai da sola: senza il rango «squadra diversa» il ceduto sparirebbe", () => {
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Ondre Vaschin", "GAMMA")]),
      roster("piattaforma", [record("R1", "Ondre Vaschin", "BETA")]),
    );
    expect(resolution.unresolved).toEqual([]);
    expect(resolution.matches).toHaveLength(1);
  });

  it("vocabolari di squadra diversi: la squadra smette di essere una prova, il nome resta", () => {
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Ondre Vaschin", "ALFA")], { teamVocabulary: "vocabolario-uno" }),
      roster("piattaforma", [record("R1", "Ondre Vaschin", "ALFA")], { teamVocabulary: "vocabolario-due" }),
    );
    expect(resolution.matches[0]?.criterion).toBe("exact_name_team_not_comparable");
  });
});

describe("l'ordine dei criteri, visto su un caso vivo", () => {
  it("il nome esatto in un'altra squadra batte l'iniziale nella stessa squadra", () => {
    // DECISIONE CONTESTABILE, ED È QUI CHE SI VEDE: l'evidenza sul nome viene
    // prima di quella sulla squadra. Un nome completo uguale è un fatto,
    // un'iniziale compatibile è un'ipotesi — anche quando l'ipotesi è nella
    // rosa giusta. Chi cambia idea cambia `MATCH_CRITERIA` e fa cadere questo
    // test, che è il modo giusto in cui una decisione si cambia.
    const resolution = resolveIdentities(
      roster("voti", [record("L1", "Marlo Zurbetti", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "BETA"), record("R2", "M. Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "exact_name_other_team"],
    ]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([["R2", "no_candidate"]]);
  });
});

describe("presente in una fonte, assente nell'altra", () => {
  it("resta un buco visibile con la sua ragione, mai un abbinamento debole", () => {
    const resolution = resolveIdentities(
      roster("listone", [record("L1", "Marlo Zurbetti", "ALFA"), record("L2", "Quilfrè Vamproni", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(refs(resolution.unresolved)).toEqual(["L2"]);
    expect(resolution.unresolved[0]?.reason).toBe("no_candidate");
    expectFullAccounting(resolution, ["L1", "L2"], ["R1"]);
  });

  it("un nome che non lascia niente di confrontabile lo dichiara con la propria ragione", () => {
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "  --  ", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "name_not_comparable"],
      ["R1", "no_candidate"],
    ]);
  });
});

describe("l'identificativo che non regge il controincrocio", () => {
  it("stesso identificativo e nomi lontani: entrambe le righe escono dal giro, e non le riprende il nome", () => {
    // La riga R9 avrebbe agganciato L1 sul nome esatto nella stessa squadra.
    // Non lo fa: L1 porta un identificativo che confligge, e una premessa
    // rotta non si aggira con un criterio più leggero.
    const listone = roster("listone", [record("L1", "Marlo Zurbetti", "ALFA", "P-0002")], {
      identifierSpace: PLATFORM_IDENTIFIER_SPACE,
    });
    const piattaforma = roster(
      "piattaforma",
      [record("R2", "Quilfrè Vamproni", "ALFA", "P-0002"), record("R9", "Marlo Zurbetti", "ALFA")],
      { identifierSpace: PLATFORM_IDENTIFIER_SPACE },
    );
    const resolution = resolveIdentities(listone, piattaforma);

    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "identifier_name_conflict"],
      ["R2", "identifier_name_conflict"],
      ["R9", "no_candidate"],
    ]);
    expectFullAccounting(resolution, ["L1"], ["R2", "R9"]);
  });

  it("spazi di identificativo diversi: si scende ai criteri sul nome invece di assumere l'ipotesi", () => {
    const listone = roster("listone", [record("L1", "Marlo Zurbetti", "ALFA", "7")], {
      identifierSpace: LISTONE_IDENTIFIER_SPACE,
    });
    const piattaforma = roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA", "7")], {
      identifierSpace: PLATFORM_IDENTIFIER_SPACE,
    });
    const resolution = resolveIdentities(listone, piattaforma);
    expect(resolution.matches[0]?.criterion).toBe("exact_name_same_team");
  });
});

describe("il conto torna sempre", () => {
  it("nessuna riga compare due volte, nessuna riga sparisce", () => {
    const listone = roster("listone", [
      record("L1", "Marlo Zurbetti", "ALFA"),
      record("L2", "Mirla Zurbetti", "ALFA"),
      record("L3", "Ondrè Vaschìn", "BETA"),
      record("L4", "Quilfrè Vamproni", "GAMMA"),
      record("L5", "M. Zurbetti", "BETA"),
    ]);
    const piattaforma = roster("piattaforma", [
      record("R1", "Marlo Zurbetti", "ALFA"),
      record("R2", "Mirla Zurbetti", "ALFA"),
      record("R3", "Ondre Vaschin", "BETA"),
      record("R6", "Marlo Zurbetti", "BETA"),
    ]);
    const resolution = resolveIdentities(listone, piattaforma);
    expectFullAccounting(resolution, ["L1", "L2", "L3", "L4", "L5"], ["R1", "R2", "R3", "R6"]);
  });
});

describe("un nome di sole iniziali non identifica nessuno", () => {
  it("«M» contro «M» nella stessa squadra non è un abbinamento: è un troncamento", () => {
    // Fino al 2026-09-09 usciva `exact_name_same_team` / `strong`. Su un nome
    // troncato da un parser a monte era un abbinamento inventato, con la targa
    // più tranquillizzante che questo modulo sappia scrivere sotto un nome.
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "M", "ALFA")]),
      roster("piattaforma", [record("R1", "M", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "name_not_comparable"],
      ["R1", "name_not_comparable"],
    ]);
  });

  it("nemmeno due iniziali fanno un nome: «M. Z.» resta non confrontabile", () => {
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "M. Z.", "ALFA")]),
      roster("piattaforma", [record("R1", "M. Z.", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.every((item) => item.reason === "name_not_comparable")).toBe(true);
  });

  it("un identificativo non si controincrocia contro una sola iniziale, e da solo non basta", () => {
    const resolution = resolveIdentities(
      roster("listone", [record("L1", "M", "ALFA", "ID-4")], {
        identifierSpace: PLATFORM_IDENTIFIER_SPACE,
      }),
      roster("piattaforma", [record("R1", "M", "ALFA", "ID-4")], {
        identifierSpace: PLATFORM_IDENTIFIER_SPACE,
      }),
    );
    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.every((item) => item.reason === "identifier_without_comparable_name")).toBe(
      true,
    );
  });

  it("un token pieno basta a rendere confrontabile un nome che ha anche iniziali", () => {
    const resolution = resolveIdentities(
      roster("probabili", [record("L1", "M. Zurbetti", "ALFA")]),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toHaveLength(1);
  });
});

describe("un identificativo che salta salta per tutti", () => {
  it("anche la terza riga innocente esce dal giro, e la ragione dice che è stato l'identificativo", () => {
    // L1/R1 avrebbero agganciato al rango 1 con targa «certo» — su un
    // identificativo che, sulla coppia accanto, abbiamo appena visto sbagliare.
    // La frase «le due righe restano fuori» prometteva un perimetro più stretto
    // del reale: l'unità non è la coppia, è il valore dell'identificativo.
    const resolution = resolveIdentities(
      roster(
        "listone",
        [record("L1", "Marlo Zurbetti", "ALFA", "ID-3"), record("L2", "Quilfrè Vamproni", "ALFA", "ID-3")],
        { identifierSpace: PLATFORM_IDENTIFIER_SPACE },
      ),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA", "ID-3")], {
        identifierSpace: PLATFORM_IDENTIFIER_SPACE,
      }),
    );

    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "identifier_name_conflict"],
      ["L2", "identifier_name_conflict"],
      ["R1", "identifier_name_conflict"],
    ]);
    // La ragione della riga innocente non dice «i tuoi nomi non si somigliano»,
    // che per lei sarebbe falso: dice che a saltare è stato l'identificativo.
    expect(resolution.unresolved[0]?.detail).toMatch(/ogni riga che lo porta/);
  });
});

describe("i conti dell'insieme viaggiano con l'abbinamento", () => {
  it("l'insieme lo dichiara il CRITERIO, non la coppia: il rango 1 non ha ristretto niente", () => {
    // Le due righe dichiarano la stessa squadra, ma l'identificativo non ha
    // mai ristretto i candidati a quella rosa: scrivere «dentro ALFA» sarebbe
    // un conto giusto su un insieme sbagliato. Chi legge la squadra
    // dall'abbinamento la trova comunque in `teamAgreement`.
    const resolution = resolveIdentities(
      roster(
        "listone",
        [record("L1", "Marlo Zurbetti", "ALFA", "P-1"), record("L2", "Quilfrè Vamproni", "BETA")],
        { identifierSpace: PLATFORM_IDENTIFIER_SPACE },
      ),
      roster("piattaforma", [record("R1", "Marlo Zurbetti", "ALFA", "P-1")], {
        identifierSpace: PLATFORM_IDENTIFIER_SPACE,
      }),
    );
    const match = resolution.matches[0];
    expect(match?.criterion).toBe("shared_identifier");
    expect(match?.teamAgreement).toBe("same_declared_team");
    expect(match?.cohort).toEqual({
      scope: "whole_list",
      key: null,
      leftRecords: 2,
      rightRecords: 1,
      leftWithoutMatch: 1,
      rightWithoutMatch: 0,
    });
  });

  it("i conti concordano con gli elenchi che l'esito porta: due modi di contare, un numero solo", () => {
    const sinistra = [
      record("L1", "Marlo Zurbetti", "ALFA"),
      record("L2", "Mirla Zurbetti", "ALFA"),
      record("L3", "Ondrè Vaschìn", "BETA"),
      record("L4", "Quilfrè Vamproni", "BETA"),
    ];
    const destra = [
      record("R1", "Marlo Zurbetti", "ALFA"),
      record("R2", "Ondre Vaschin", "BETA"),
      record("R3", "Nilo D'Orbeni", "BETA"),
    ];
    const resolution = resolveIdentities(roster("voti", sinistra), roster("piattaforma", destra));
    const matchedLeft = new Set(resolution.matches.map((match) => match.leftRef));
    const matchedRight = new Set(resolution.matches.map((match) => match.rightRef));

    expect(resolution.matches.length).toBeGreaterThan(0);
    for (const match of resolution.matches) {
      const key = match.cohort.key;
      const inCohort = (rows: readonly { readonly ref: string; readonly teamKey?: string | null }[]) =>
        key === null ? rows : rows.filter((row) => row.teamKey === key);
      expect(match.cohort.leftRecords).toBe(inCohort(sinistra).length);
      expect(match.cohort.rightRecords).toBe(inCohort(destra).length);
      expect(match.cohort.leftWithoutMatch).toBe(
        inCohort(sinistra).filter((row) => !matchedLeft.has(row.ref)).length,
      );
      expect(match.cohort.rightWithoutMatch).toBe(
        inCohort(destra).filter((row) => !matchedRight.has(row.ref)).length,
      );
    }
  });

  it("«senza abbinamento» conta anche le ambigue: la domanda è quanto resta scoperto, non perché", () => {
    // R1 e R2 sono contesi e restano ambigui; L3 aggancia. Nell'insieme ALFA
    // due righe di destra restano senza abbinamento, e il conto le vede
    // esattamente come vedrebbe due non risolte.
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA"), record("L3", "Vamproni", "ALFA")]),
      roster("deposito", [
        record("R1", "Marlo Zurbetti", "ALFA"),
        record("R2", "Ondre Zurbetti", "ALFA"),
        record("R3", "Quilfrè Vamproni", "ALFA"),
      ]),
    );
    expect(resolution.ambiguous.length).toBeGreaterThan(0);
    const match = resolution.matches.find((item) => item.leftRef === "L3");
    expect(match?.cohort.rightRecords).toBe(3);
    expect(match?.cohort.rightWithoutMatch).toBe(2);
  });
});
