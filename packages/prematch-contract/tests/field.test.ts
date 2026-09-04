import { describe, expect, it } from "vitest";

import {
  absentInSource,
  isObserved,
  mapField,
  notObserved,
  observed,
  observedValue,
  readField,
  type Field,
} from "../src/field.js";
import { isRead, readLabel, readWholeNumber } from "../src/readOutcome.js";

describe("le due assenze restano due cose diverse", () => {
  it("«la fonte non lo espone» e «non l'abbiamo guardato» non collassano", () => {
    const assente: Field<number> = absentInSource();
    const nonVisto: Field<number> = notObserved();
    expect(assente).not.toEqual(nonVisto);
    expect(observedValue(assente)).toBeNull();
    expect(observedValue(nonVisto)).toBeNull();
    expect(isObserved(assente)).toBe(false);
  });

  it("un valore osservato si legge, e zero è un valore come gli altri", () => {
    const zero = observed(0);
    expect(isObserved(zero)).toBe(true);
    expect(observedValue(zero)).toBe(0);
  });

  it("mapField trasforma il valore e lascia intatte le assenze", () => {
    expect(mapField(observed(2), (n) => n * 3)).toEqual(observed(6));
    expect(mapField(absentInSource<number>(), (n) => n * 3)).toEqual(absentInSource());
    expect(mapField(notObserved<number>(), (n) => n * 3)).toEqual(notObserved());
  });
});

describe("la lettura di un campo non decide quale assenza sia", () => {
  it("legge le tre presenze dichiarate", () => {
    const osservato = readField({ presence: "observed", value: 7 }, ["c"], readWholeNumber);
    expect(osservato).toEqual({ status: "read", value: observed(7) });
    expect(readField({ presence: "absent-in-source" }, ["c"], readWholeNumber)).toEqual({
      status: "read",
      value: absentInSource(),
    });
    expect(readField({ presence: "not-observed" }, ["c"], readWholeNumber)).toEqual({
      status: "read",
      value: notObserved(),
    });
  });

  it("un campo mancante NON diventa «assente nella fonte»", () => {
    // Quale delle due assenze sia lo sa solo chi ha letto la pagina: qui si
    // pretende che l'abbia scritto, invece di sceglierne una noi.
    const outcome = readField(undefined, ["c"], readWholeNumber);
    expect(outcome.status).toBe("shape-not-recognised");
  });

  it("una presenza sconosciuta si ferma, con il punto in cui si è fermata", () => {
    const outcome = readField({ presence: "forse" }, ["c"], readWholeNumber);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["c", "presence"]);
  });

  it("un valore che non passa la lettura fa fallire il campo, con la ragione originale", () => {
    const outcome = readField({ presence: "observed", value: "sette" }, ["c"], readWholeNumber);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["c", "value"]);
  });
});

describe("nessun campo può contenere una frase", () => {
  it("una stringa lunga come un periodo è fuori contratto, non un'etichetta", () => {
    const prosa = "a".repeat(121);
    const outcome = readField({ presence: "observed", value: prosa }, ["c"], readLabel);
    expect(outcome.status).toBe("out-of-contract");
  });

  it("una stringa su più righe è testo, e non entra", () => {
    expect(readLabel("prima riga\nseconda riga", ["c"]).status).toBe("out-of-contract");
  });
});
