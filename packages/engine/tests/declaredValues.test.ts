import { describe, it, expect } from "vitest";
import {
  ALPHA_BY_PROFILE,
  DECLARED_VALUE_PROVENANCE,
  VALUE_PROFILES,
  declaredValueBook,
  declaredValueOf,
  validateDeclaredValues,
  type DeclaredPlayerValue,
} from "../src/index.js";
import { value } from "./layer3Fixtures.js";

describe("validateDeclaredValues — fail-closed, ogni violazione di ogni riga", () => {
  it("accetta un listino pulito", () => {
    const result = validateDeclaredValues([value("a1", 70), value("a2", 0)]);
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("rifiuta playerId vuoto", () => {
    const result = validateDeclaredValues([value("", 10)]);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ index: 0, playerId: "", violation: "player-id-empty" }]);
  });

  it("rifiuta il duplicato, e solo la seconda occorrenza", () => {
    const result = validateDeclaredValues([value("a1", 10), value("a1", 20)]);
    expect(result.issues).toEqual([{ index: 1, playerId: "a1", violation: "duplicate-player" }]);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negativo", -3],
  ])("rifiuta un valore %s", (_label, declared) => {
    const result = validateDeclaredValues([{ playerId: "a1", declaredValue: declared }]);
    expect(result.issues).toEqual([
      { index: 0, playerId: "a1", violation: "declared-value-invalid" },
    ]);
  });

  it("riporta più violazioni sulla stessa riga e su righe diverse", () => {
    const rows: DeclaredPlayerValue[] = [
      { playerId: "", declaredValue: Number.NaN },
      value("a1", 10),
      value("a1", -1),
    ];
    const result = validateDeclaredValues(rows);
    expect(result.issues).toEqual([
      { index: 0, playerId: "", violation: "player-id-empty" },
      { index: 0, playerId: "", violation: "declared-value-invalid" },
      { index: 2, playerId: "a1", violation: "duplicate-player" },
      { index: 2, playerId: "a1", violation: "declared-value-invalid" },
    ]);
  });

  it("un valore dichiarato 0 è valido: «per me vale zero» è una dichiarazione", () => {
    expect(validateDeclaredValues([value("a1", 0)]).ok).toBe(true);
  });
});

describe("declaredValueBook", () => {
  it("lancia su un listino invalido, come anchorBook", () => {
    expect(() => declaredValueBook([value("a1", Number.NaN)])).toThrow(/invalid declared values/);
  });

  it("indicizza per playerId e non condivide l'array del chiamante", () => {
    const rows = [value("a1", 70)];
    const book = declaredValueBook(rows);
    rows.push(value("a2", 10));
    expect(book.all).toHaveLength(1);
    expect(book.byPlayerId.get("a1")?.declaredValue).toBe(70);
  });

  it("distingue «vale zero» da «non dichiarato»", () => {
    const book = declaredValueBook([value("a1", 0)]);
    expect(declaredValueOf("a1", book)).toBe(0);
    expect(declaredValueOf("sconosciuto", book)).toBeNull();
  });
});

describe("profilo di rischio — α preregistrati dal piano §4.2", () => {
  it("porta esattamente i tre α del contratto FTM", () => {
    expect(ALPHA_BY_PROFILE).toEqual({ prudente: 0.85, media: 1.0, aggressiva: 1.15 });
  });

  it("il vocabolario dei profili è chiuso e copre tutti gli α", () => {
    expect(Object.keys(ALPHA_BY_PROFILE).sort()).toEqual([...VALUE_PROFILES].sort());
  });
});

describe("provenienza", () => {
  it("l'etichetta imposta dal design §4.1 vive accanto ai valori", () => {
    expect(DECLARED_VALUE_PROVENANCE).toBe("derivato dai tuoi valori");
  });
});
