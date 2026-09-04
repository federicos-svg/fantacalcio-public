import { describe, expect, it } from "vitest";

import {
  looksLikeAddress,
  matchdayIfDeclared,
  readMatchdayReference,
  readProvenance,
} from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";
import { syntheticProvenance } from "./synthetic.js";

describe("la provenienza è obbligatoria e completa", () => {
  it("legge fonte, momento e giornata quando ci sono tutti e tre", () => {
    const outcome = readProvenance(syntheticProvenance());
    expect(outcome.status).toBe("read");
    if (!isRead(outcome)) return;
    expect(outcome.value.source).toBe("testata sintetica");
    expect(outcome.value.observedAt).toBe("2026-09-04T18:00:00+02:00");
    expect(outcome.value.matchday).toEqual({ origin: "declared-by-source", number: 2 });
  });

  it("rifiuta un'osservazione senza momento della lettura", () => {
    const candidate = syntheticProvenance();
    delete candidate["observedAt"];
    const outcome = readProvenance(candidate);
    expect(outcome.status).toBe("shape-not-recognised");
    if (isRead(outcome)) return;
    expect(outcome.at).toEqual(["provenance", "observedAt"]);
  });

  it("rifiuta un istante senza fuso: due istanti senza fuso non si ordinano", () => {
    const outcome = readProvenance(syntheticProvenance({ observedAt: "2026-09-04T18:00:00" }));
    expect(outcome.status).toBe("out-of-contract");
  });

  it("rifiuta un'osservazione senza giornata", () => {
    const candidate = syntheticProvenance();
    delete candidate["matchday"];
    expect(readProvenance(candidate).status).toBe("shape-not-recognised");
  });
});

describe("l'etichetta della fonte non è un indirizzo", () => {
  it.each([
    ["https://esempio.invalid/pagina"],
    ["www.esempio"],
    ["esempio.it"],
    ["calcio/serie-a/classifica"],
  ])("respinge %s", (label) => {
    expect(looksLikeAddress(label)).toBe(true);
    const outcome = readProvenance(syntheticProvenance({ source: label }));
    expect(outcome.status).toBe("out-of-contract");
  });

  it("accetta un'etichetta che è un nome", () => {
    expect(looksLikeAddress("testata sintetica")).toBe(false);
    expect(readProvenance(syntheticProvenance({ source: "testata sintetica" })).status).toBe("read");
  });

  it("vale anche per l'etichetta della pagina", () => {
    expect(readProvenance(syntheticProvenance({ page: "/partite/2026/giornata-2" })).status).toBe(
      "out-of-contract",
    );
  });
});

describe("la giornata porta con sé da dove viene", () => {
  it("una giornata dichiarata dalla fonte si può usare per attribuire l'osservazione", () => {
    const outcome = readMatchdayReference({ origin: "declared-by-source", number: 3 }, ["matchday"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(outcome.value)).toBe(3);
  });

  it("una giornata che viene da ciò che abbiamo chiesto NON vale come dichiarata", () => {
    const outcome = readMatchdayReference({ origin: "requested-by-caller", number: 3 }, ["matchday"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    // È il difetto che questo pacchetto esiste per rendere impossibile: il
    // numero c'è, si vede, si può mostrare — ma non è la giornata della pagina.
    expect(matchdayIfDeclared(outcome.value)).toBeNull();
  });

  it("una giornata non osservata non produce numeri", () => {
    const outcome = readMatchdayReference({ origin: "unobserved" }, ["matchday"]);
    if (!isRead(outcome)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(outcome.value)).toBeNull();
    expect(outcome.value).toEqual({ origin: "unobserved" });
  });

  it("un'origine sconosciuta è struttura non riconosciuta, non un ripiego", () => {
    expect(readMatchdayReference({ origin: "dedotta", number: 3 }, ["matchday"]).status).toBe(
      "shape-not-recognised",
    );
  });

  it("la giornata zero non esiste", () => {
    expect(readMatchdayReference({ origin: "declared-by-source", number: 0 }, ["matchday"]).status).toBe(
      "out-of-contract",
    );
  });
});
