import { describe, expect, it } from "vitest";

import {
  MATCH_CRITERIA,
  type Certainty,
  abbreviationCompatible,
  identifierAgreement,
  isComparableName,
  normalizedName,
  normalizedTokens,
  teamAgreementOf,
} from "../src/identityCriteria.js";
import { LISTONE_IDENTIFIER_SPACE, PLATFORM_IDENTIFIER_SPACE, record } from "./synthetic.js";

describe("normalizzazione — accenti e apostrofi non devono separare due grafie della stessa persona", () => {
  it("l'accento cade", () => {
    expect(normalizedName(record("A", "Ondrè Vaschìn"))).toBe("ondre vaschin");
    expect(normalizedName(record("B", "Ondre Vaschin"))).toBe("ondre vaschin");
  });

  it("l'apostrofo diventa uno spazio, su entrambi i lati", () => {
    expect(normalizedTokens(record("A", "Nilo D'Orbeni"))).toEqual(["nilo", "d", "orbeni"]);
    expect(normalizedTokens(record("B", "Nilo D Orbeni"))).toEqual(["nilo", "d", "orbeni"]);
  });

  it("un nome che non lascia niente di confrontabile normalizza a vuoto, e non a un token finto", () => {
    expect(normalizedName(record("A", "   "))).toBe("");
    expect(normalizedTokens(record("A", "-- .. --"))).toEqual([]);
  });

  it("un nome è confrontabile solo se porta almeno un token pieno", () => {
    expect(isComparableName([])).toBe(false);
    expect(isComparableName(["m"])).toBe(false);
    expect(isComparableName(["m", "z"])).toBe(false);
    expect(isComparableName(["m", "zurbetti"])).toBe(true);
  });
});

describe("nome abbreviato contro nome esteso — e i casi in cui la regola si rifiuta", () => {
  it("aggancia l'iniziale puntata al nome esteso, con il cognome pieno a fare da ancora", () => {
    expect(abbreviationCompatible(["m", "zurbetti"], ["marlo", "zurbetti"])).toBe(true);
  });

  it("rifiuta due sole iniziali: senza un token pieno uguale non c'è ancora, e aggancerebbe mezzo listone", () => {
    expect(abbreviationCompatible(["m", "z"], ["marlo", "zurbetti"])).toBe(false);
  });

  it("rifiuta un numero di token diverso: la regola non indovina quale token manca", () => {
    expect(abbreviationCompatible(["m", "zurbetti"], ["marlo", "pio", "zurbetti"])).toBe(false);
  });

  it("rifiuta l'ordine invertito: se le fonti scrivono i token al contrario non aggancia, e non sbaglia", () => {
    expect(abbreviationCompatible(["zurbetti", "m"], ["marlo", "zurbetti"])).toBe(false);
  });

  it("rifiuta l'uguaglianza esatta: quella ha un rango suo, più alto", () => {
    expect(abbreviationCompatible(["marlo", "zurbetti"], ["marlo", "zurbetti"])).toBe(false);
  });

  it("rifiuta un'iniziale che non è l'iniziale", () => {
    expect(abbreviationCompatible(["q", "zurbetti"], ["marlo", "zurbetti"])).toBe(false);
  });
});

describe("la squadra — «non lo so» non è «un'altra»", () => {
  it("stesso vocabolario e stessa chiave: prova in più", () => {
    expect(teamAgreementOf("ALFA", "ALFA", "v", "v")).toBe("same_declared_team");
  });

  it("stesso vocabolario e chiavi diverse: prova contraria, non esclusione", () => {
    expect(teamAgreementOf("ALFA", "BETA", "v", "v")).toBe("different_declared_team");
  });

  it("vocabolari diversi non si confrontano: fingere che coincidano è il guasto, non la cautela", () => {
    expect(teamAgreementOf("ALFA", "ALFA", "v1", "v2")).toBe("team_not_comparable");
  });

  it("una squadra assente resta «non lo so», mai «nessuna squadra»", () => {
    expect(teamAgreementOf("ALFA", null, "v", "v")).toBe("team_not_comparable");
    expect(teamAgreementOf(null, null, "v", "v")).toBe("team_not_comparable");
  });
});

describe("l'identificativo si controincrocia, non si crede sulla parola", () => {
  it("stesso spazio e stesso identificativo con nomi che si sostengono: aggancia", () => {
    expect(
      identifierAgreement(
        record("L1", "Marlo Zurbetti", null, "P-0001"),
        record("R1", "Zurbetti M.", null, "P-0001"),
        PLATFORM_IDENTIFIER_SPACE,
        PLATFORM_IDENTIFIER_SPACE,
      ),
    ).toBe("identifier_match");
  });

  it("stesso identificativo e nomi che non si somigliano: conflitto, mai promozione silenziosa", () => {
    expect(
      identifierAgreement(
        record("L1", "Marlo Zurbetti", null, "P-0002"),
        record("R1", "Quilfrè Vamproni", null, "P-0002"),
        PLATFORM_IDENTIFIER_SPACE,
        PLATFORM_IDENTIFIER_SPACE,
      ),
    ).toBe("identifier_name_conflict");
  });

  it("stesso identificativo ma un nome non confrontabile: da solo non basta", () => {
    expect(
      identifierAgreement(
        record("L1", "   ", null, "P-0003"),
        record("R1", "Marlo Zurbetti", null, "P-0003"),
        PLATFORM_IDENTIFIER_SPACE,
        PLATFORM_IDENTIFIER_SPACE,
      ),
    ).toBe("identifier_without_comparable_name");
  });

  it("spazi diversi non si confrontano: che due colonne identificativo coincidano è un'ipotesi", () => {
    expect(
      identifierAgreement(
        record("L1", "Marlo Zurbetti", null, "0001"),
        record("R1", "Marlo Zurbetti", null, "0001"),
        LISTONE_IDENTIFIER_SPACE,
        PLATFORM_IDENTIFIER_SPACE,
      ),
    ).toBe("identifier_not_comparable");
  });
});

describe("l'ordine dei criteri è una decisione, e sta in un posto solo", () => {
  it("le sette righe, nell'ordine, con i ranghi che seguono la posizione", () => {
    expect(MATCH_CRITERIA.map((criterion) => criterion.code)).toEqual([
      "shared_identifier",
      "exact_name_same_team",
      "exact_name_team_not_comparable",
      "exact_name_other_team",
      "abbreviated_name_same_team",
      "abbreviated_name_team_not_comparable",
      "abbreviated_name_other_team",
    ]);
    expect(MATCH_CRITERIA.map((criterion) => criterion.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("la certezza non risale mai scendendo di rango", () => {
    const order: Record<Certainty, number> = { certain: 3, strong: 2, moderate: 1, weak: 0 };
    for (let i = 1; i < MATCH_CRITERIA.length; i += 1) {
      const previous = MATCH_CRITERIA[i - 1];
      const current = MATCH_CRITERIA[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) continue;
      expect(order[current.certainty]).toBeLessThanOrEqual(order[previous.certainty]);
    }
  });

  it("ogni criterio dichiara la propria evidenza in chiaro: una targa senza testo non è una targa", () => {
    for (const criterion of MATCH_CRITERIA) {
      expect(criterion.evidence.trim().length).toBeGreaterThan(0);
    }
  });
});
