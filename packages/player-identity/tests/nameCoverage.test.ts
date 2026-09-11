// IL NOME CORTO CONTRO IL NOME COMPLETO — le prove del criterio per token.
//
// Il criterio esiste perché una piattaforma di lega scrive «Zurbetti» o
// «Zurbetti M.» dove un deposito esterno scrive «Marlo Zurbetti»: nessuno dei
// criteri sul nome intero aggancia due nomi di lunghezza diversa. Le fixture
// qui sotto sono sintetiche come tutte le altre — «Zurbetti», «Vaschìn»,
// «D'Orbeni», «Vasch-Orbeni», ALFA/BETA/GAMMA — ma le FORME sono quelle
// misurate sul dato reale, e sono il punto: cognome nudo, cognome più iniziale
// puntata, accento, apostrofo, trattino, due cognomi uguali nella stessa
// squadra, due cognomi uguali in squadre diverse, e un cognome che è prefisso
// di un altro.
//
// Ogni blocco chiude una strada che fa danno in silenzio:
//   - la normalizzazione applicata da un lato solo;
//   - il confronto per prefisso su un token pieno («Vasch» ⊂ «Vaschin»);
//   - l'iniziale puntata usata come se fosse un nome proprio;
//   - i candidati contati sul residuo invece che sulle liste intere;
//   - la targa promossa oltre l'evidenza.

import { describe, expect, it } from "vitest";

import { MATCH_CRITERIA, nameCoverage, normalizedTokens } from "../src/identityCriteria.js";
import { type IdentityResolution, resolveIdentities } from "../src/resolveIdentities.js";
import { PLATFORM_IDENTIFIER_SPACE, record, refs, roster } from "./synthetic.js";

/** I token normalizzati di un nome scritto come lo scrive una fonte. */
function tokens(displayName: string): readonly string[] {
  return normalizedTokens(record("x", displayName));
}

/**
 * La copertura fra due nomi COME LI SCRIVONO LE FONTI — cioè passando da
 * `normalizedTokens()` su entrambi i lati, che è l'unico modo in cui il
 * risolutore la chiama. Una prova che normalizzasse un lato solo proverebbe
 * qualcosa su un codice diverso da quello che gira.
 */
function coverage(a: string, b: string): string | null {
  return nameCoverage(tokens(a), tokens(b));
}

/** Ogni riga finisce in esattamente uno dei tre esiti — l'invariante contabile. */
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

describe("copertura piena e copertura parziale — i due gradi, e niente in mezzo", () => {
  it("il cognome nudo copre solo in parte il nome completo", () => {
    expect(coverage("Zurbetti", "Marlo Zurbetti")).toBe("partial_name");
  });

  it("il cognome con l'iniziale puntata copre il nome completo per intero", () => {
    expect(coverage("Zurbetti M.", "Marlo Zurbetti")).toBe("unordered_name");
  });

  it("l'ordine non conta: l'iniziale davanti o dietro copre lo stesso nome", () => {
    expect(coverage("M. Zurbetti", "Marlo Zurbetti")).toBe("unordered_name");
    expect(coverage("Zurbetti M.", "Marlo Zurbetti")).toBe("unordered_name");
  });

  it("la pura permutazione è copertura piena: i criteri sul nome intero confrontano stringhe, questo no", () => {
    expect(coverage("Zurbetti Marlo", "Marlo Zurbetti")).toBe("unordered_name");
  });

  it("due nomi identici non passano da qui: hanno un rango loro, più alto", () => {
    expect(coverage("Marlo Zurbetti", "Marlo Zurbetti")).toBeNull();
    expect(coverage("Zurbetti", "Zurbetti")).toBeNull();
  });

  it("un nome intermedio che una sola fonte porta lascia la copertura parziale", () => {
    expect(coverage("Marlo Zurbetti", "Marlo Pio Zurbetti")).toBe("partial_name");
    expect(coverage("Zurbetti M.", "Marlo Pio Zurbetti")).toBe("partial_name");
  });

  it("due iniziali coprono due nomi, e il conto per lettera è esatto", () => {
    expect(coverage("Zurbetti M. P.", "Marlo Pio Zurbetti")).toBe("unordered_name");
    // Due «M.» pretendono DUE token che cominciano per «m»: uno solo non basta.
    expect(coverage("Zurbetti M. M.", "Marlo Mirla Zurbetti")).toBe("unordered_name");
    expect(coverage("Zurbetti M. M.", "Marlo Pio Zurbetti")).toBeNull();
  });

  it("la copertura piena impone tanti token quanti: è il nome abbreviato senza l'ipotesi sull'ordine", () => {
    const coppie: readonly (readonly [string, string])[] = [
      ["Zurbetti M.", "Marlo Zurbetti"],
      ["Zurbetti Marlo", "Marlo Zurbetti"],
      ["Zurbetti M. P.", "Marlo Pio Zurbetti"],
      ["Zurbetti", "Marlo Zurbetti"],
      ["Zurbetti M.", "Marlo Pio Zurbetti"],
      ["D'Orbeni N.", "Nilo D'Orbeni"],
    ];
    for (const [a, b] of coppie) {
      if (coverage(a, b) !== "unordered_name") continue;
      expect(tokens(a).length).toBe(tokens(b).length);
    }
    // Il verso opposto della stessa proprietà: un token in più da un lato non
    // arriva mai alla copertura piena, per quanto tutto il resto torni.
    expect(coverage("Zurbetti M.", "Marlo Pio Zurbetti")).toBe("partial_name");
  });

  it("è simmetrica: quale lista arrivi a sinistra è un fatto del chiamante, non del nome", () => {
    const coppie: readonly (readonly [string, string])[] = [
      ["Zurbetti", "Marlo Zurbetti"],
      ["Zurbetti M.", "Marlo Zurbetti"],
      ["Zurbetti Marlo", "Marlo Zurbetti"],
      ["Vasch", "Ondre Vaschin"],
      ["Marlo Zurbetti", "Marlo Pio Zurbetti"],
      ["M. Z.", "Marlo Zurbetti"],
    ];
    for (const [a, b] of coppie) {
      expect(coverage(a, b)).toBe(coverage(b, a));
    }
  });
});

describe("la normalizzazione vale da entrambi i lati, o non vale", () => {
  it("l'accento cade su entrambi i lati: il cognome accentato copre il nome senza accento", () => {
    expect(coverage("Vaschìn", "Ondre Vaschin")).toBe("partial_name");
    expect(coverage("Vaschin", "Ondrè Vaschìn")).toBe("partial_name");
  });

  it("l'apostrofo diventa uno spazio su entrambi i lati, e i suoi token si confrontano interi", () => {
    expect(coverage("D'Orbeni", "Nilo D'Orbeni")).toBe("partial_name");
    expect(coverage("D'Orbeni", "Nilo D Orbeni")).toBe("partial_name");
    // «D'Orbeni N.»: la «d» dell'apostrofo si confronta IDENTICA (non come
    // iniziale), la «n» copre «Nilo», e non resta niente di scoperto.
    expect(coverage("D'Orbeni N.", "Nilo D'Orbeni")).toBe("unordered_name");
  });

  it("il trattino diventa uno spazio su entrambi i lati", () => {
    expect(coverage("Vasch-Orbeni", "Nilo Vasch-Orbeni")).toBe("partial_name");
    expect(coverage("Vasch-Orbeni", "Nilo Vasch Orbeni")).toBe("partial_name");
    expect(coverage("Vasch-Orbeni N.", "Nilo Vasch-Orbeni")).toBe("unordered_name");
  });
});

describe("un token pieno si confronta per uguaglianza, mai per prefisso", () => {
  it("«Vasch» non è «Vaschin»: due cognomi, non due grafie", () => {
    expect(coverage("Vasch", "Ondre Vaschin")).toBeNull();
    expect(coverage("Vasch O.", "Ondre Vaschin")).toBeNull();
  });

  it("nemmeno un cognome che contiene l'altro aggancia: il contenimento è fra token, non fra lettere", () => {
    expect(coverage("Vaschin", "Ondre Vasch")).toBeNull();
  });
});

describe("l'iniziale puntata non è un nome: non fa da ancora, e può solo togliere", () => {
  it("senza un token pieno uguale non c'è ancora, e non c'è copertura", () => {
    expect(coverage("M. Z.", "Marlo Zurbetti")).toBeNull();
    expect(coverage("Z.", "Marlo Zurbetti")).toBeNull();
    expect(coverage("M. Z.", "M. Zurbetti")).toBeNull();
  });

  it("l'ancora è una proprietà dell'esito: ogni copertura accettata condivide un token pieno", () => {
    // Non c'è un `if` che la controlli, e non ci deve essere: sarebbe
    // irraggiungibile (vedi `coverageOfInnerInOuter`). A portarla sono il gate
    // di comparabilità e la regola che un token pieno o compare identico o
    // chiude il verso — quindi la si pinna come proprietà, sulle forme che
    // proverebbero a violarla.
    const coppie: readonly (readonly [string, string])[] = [
      ["M. Z.", "Marlo Zurbetti"],
      ["Z.", "Marlo Zurbetti"],
      ["M.", "Marlo Pio Zurbetti"],
      ["Zurbetti", "Marlo Zurbetti"],
      ["Zurbetti M.", "Marlo Zurbetti"],
      ["D'Orbeni", "Nilo D Orbeni"],
      ["D. O.", "Nilo D Orbeni"],
      ["Vasch", "Ondre Vaschin"],
    ];
    for (const [a, b] of coppie) {
      if (coverage(a, b) === null) continue;
      const pieni = new Set(tokens(a).filter((token) => token.length > 1));
      expect(tokens(b).some((token) => token.length > 1 && pieni.has(token))).toBe(true);
    }
  });

  it("un'iniziale che non copre nessun token RIFIUTA la coppia, non si fa ignorare", () => {
    // «Zurbetti Q.» non ricade nel rango del solo cognome buttando via la «Q»:
    // esce fuori. Il costo è dichiarato — un'iniziale che si riferisce a un
    // secondo nome assente dall'altra fonte fa perdere l'aggancio.
    expect(coverage("Zurbetti Q.", "Marlo Zurbetti")).toBeNull();
  });

  it("l'iniziale non AGGIUNGE mai un candidato che il solo cognome non avesse già", () => {
    // La proprietà che rende onesto usarla come discriminante: l'insieme delle
    // coppie ammesse con l'iniziale è un SOTTOINSIEME di quello ammesso senza.
    const altri = [
      "Marlo Zurbetti",
      "Ondre Zurbetti",
      "Marlo Pio Zurbetti",
      "Marlo Vaschin",
      "Zurbetti Marlo",
    ] as const;
    for (const altro of altri) {
      if (coverage("Zurbetti M.", altro) === null) continue;
      expect(coverage("Zurbetti", altro)).not.toBeNull();
    }
  });

  it("l'unica eccezione alla riga qui sopra non porta al risolutore nessuna coppia nuova", () => {
    // «Zurbetti M.» contro «Zurbetti»: senza l'iniziale i due nomi sarebbero
    // IDENTICI, quindi la coppia è già un candidato al rango del nome identico.
    // Qui ricompare come copertura parziale — con meno forza, mai con più.
    expect(coverage("Zurbetti", "Zurbetti")).toBeNull();
    expect(coverage("Zurbetti M.", "Zurbetti")).toBe("partial_name");
    const conIniziale = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti M.", "ALFA")]),
      roster("deposito", [record("R1", "Zurbetti", "ALFA")]),
    );
    expect(conIniziale.matches.map((match) => [match.criterion, match.certainty])).toEqual([
      ["partial_name_same_team", "weak"],
    ]);
    const senzaIniziale = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Zurbetti", "ALFA")]),
    );
    expect(senzaIniziale.matches.map((match) => [match.criterion, match.certainty])).toEqual([
      ["exact_name_same_team", "strong"],
    ]);
  });
});

describe("le lettere latine che NFD non scompone non spezzano piu\u0300 un cognome", () => {
  // Regressione della riparazione in `packages/identity-policy`: `\u00f8`, `\u0111`,
  // `\u0142`, `\u00df`, `\u00e6` non sono una lettera base pi\u00f9 un accento, quindi NFD le
  // lascia intatte e il filtro le trasformava in uno SPAZIO. Un cognome cos\u00ec
  // spezzato produceva due token dove ce n'era uno, e il criterio per token —
  // che \u00e8 l'unico che aggancia un cognome nudo a un nome completo — non
  // trovava pi\u00f9 niente. Cognomi sintetici, come in tutto questo file.

  it("un cognome con la lettera nordica aggancia in modo esclusivo dentro la rosa", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "\u00d8sterbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo \u00d8sterbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "partial_name_same_team"],
    ]);
    expect(resolution.ambiguous).toEqual([]);
    expectFullAccounting(resolution, ["L1"], ["R1"]);
  });

  it("aggancia anche quando le due fonti scrivono la stessa lettera in modo diverso", () => {
    // La piattaforma scrive la lettera nordica, il deposito la scrive gi\u00e0
    // piegata: prima della riparazione erano due cognomi senza un token in
    // comune, cio\u00e8 lo stesso verdetto di due persone diverse.
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "\u00d8sterbetti", "ALFA")]),
      roster("deposito", [record("R1", "Osterbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.criterion, match.certainty])).toEqual([
      ["exact_name_same_team", "strong"],
    ]);
    expectFullAccounting(resolution, ["L1"], ["R1"]);
  });

  it("la riparazione non inventa un aggancio: due cognomi diversi restano diversi", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "\u00d8sterbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Vamproni", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expectFullAccounting(resolution, ["L1"], ["R1"]);
  });

  it("la riparazione non spegne l'ambiguit\u00e0: due omonimi restano due candidati", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "\u00d8sterbetti", "ALFA")]),
      roster("deposito", [
        record("R1", "Marlo \u00d8sterbetti", "ALFA"),
        record("R2", "Ondre Osterbetti", "ALFA"),
      ]),
    );
    expect(resolution.matches).toEqual([]);
    // L'ambiguit\u00e0 brucia da tutt'e due i lati: nessuna delle tre righe esce
    // agganciata, e nessuna sparisce senza motivo.
    expect(refs(resolution.ambiguous)).toEqual(["L1", "R1", "R2"]);
    expectFullAccounting(resolution, ["L1"], ["R1", "R2"]);
  });
});

describe("dentro la rosa di una squadra reale, il cognome aggancia", () => {
  it("il solo cognome aggancia il nome completo, con la targa che dice «debole»", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "partial_name_same_team"],
    ]);
    expect(resolution.matches[0]?.certainty).toBe("weak");
    expect(resolution.matches[0]?.nameEvidence).toBe("partial_name");
    expect(resolution.matches[0]?.teamAgreement).toBe("same_declared_team");
    expectFullAccounting(resolution, ["L1"], ["R1"]);
  });

  it("il cognome con l'iniziale aggancia con una targa più alta, ma non «forte»", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti M.", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => match.criterion)).toEqual(["unordered_name_same_team"]);
    expect(resolution.matches[0]?.certainty).toBe("moderate");
  });

  it("l'iniziale separa due che condividono il cognome nella stessa squadra", () => {
    // È il solo lavoro che l'iniziale fa: togliere il candidato la cui prima
    // lettera non torna. Non ne inventa nessuno.
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti M.", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Ondre Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "unordered_name_same_team"],
    ]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([["R2", "no_candidate"]]);
    expectFullAccounting(resolution, ["L1"], ["R1", "R2"]);
  });

  it("senza iniziale gli stessi due candidati restano ambigui: il cognome da solo non scioglie niente", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Ondre Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    const sinistra = resolution.ambiguous.filter((item) => item.side === "left");
    expect(sinistra).toHaveLength(1);
    expect(sinistra[0]?.criterion).toBe("partial_name_same_team");
    expect(sinistra[0]?.reason).toBe("multiple_candidates");
    expect(sinistra[0]?.candidates).toEqual(["R1", "R2"]);
    expectFullAccounting(resolution, ["L1"], ["R1", "R2"]);
  });

  it("due cognomi uguali nella stessa squadra restano ambigui su entrambi i lati", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(refs(resolution.ambiguous)).toEqual(["L1", "R1", "R2"]);
  });

  it("due cognomi uguali in squadre diverse si agganciano: la rosa li separa davvero", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA"), record("L2", "Zurbetti", "BETA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Ondre Zurbetti", "BETA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef])).toEqual([
      ["L1", "R1"],
      ["L2", "R2"],
    ]);
    expect(resolution.ambiguous).toEqual([]);
  });

  it("un cognome che è prefisso di un altro non aggancia, e resta un buco visibile", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Vasch", "ALFA")]),
      roster("deposito", [record("R1", "Ondre Vaschin", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.map((item) => [item.ref, item.reason])).toEqual([
      ["L1", "no_candidate"],
      ["R1", "no_candidate"],
    ]);
  });

  it("accento, apostrofo e trattino non separano le due grafie della stessa persona", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [
        record("L1", "Vaschìn", "ALFA"),
        record("L2", "D'Orbeni", "ALFA"),
        record("L3", "Vasch-Orbeni N.", "BETA"),
      ]),
      roster("deposito", [
        record("R1", "Ondre Vaschin", "ALFA"),
        record("R2", "Nilo D Orbeni", "ALFA"),
        record("R3", "Nilo Vasch-Orbeni", "BETA"),
      ]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "partial_name_same_team"],
      ["L2", "R2", "partial_name_same_team"],
      ["L3", "R3", "unordered_name_same_team"],
    ]);
  });
});

describe("la squadra è metà della prova: senza, questo criterio non aggancia", () => {
  it("squadra non dichiarata da un lato: nessun aggancio, e il costo è dichiarato", () => {
    // Di questo livello di evidenza esiste SOLO la variante «stessa squadra».
    // Se un giorno comparisse quella «squadra non confrontabile», questa riga
    // cadrebbe — ed è il modo giusto di cambiare la decisione.
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", null)]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(resolution.unresolved.map((item) => item.reason)).toEqual(["no_candidate", "no_candidate"]);
  });

  it("un trasferito noto solo per cognome non viene agganciato da qui", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "BETA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(refs(resolution.unresolved)).toEqual(["L1", "R1"]);
  });
});

describe("l'esclusività si misura sulle liste intere, anche qui", () => {
  it("il cognome nudo NON viene promosso da ciò che un criterio più forte ha portato via", () => {
    // L1/R1 si agganciano al rango 1 con l'identificativo. L2 resta con un solo
    // candidato APERTO (R2), e proprio per questo il conto va fatto sulle liste
    // intere: sul gruppo di partenza L2 ne ha due, quindi non è distinguibile.
    const resolution = resolveIdentities(
      roster(
        "piattaforma",
        [record("L1", "Zurbetti M.", "ALFA", "ID-1"), record("L2", "Zurbetti", "ALFA")],
        { identifierSpace: PLATFORM_IDENTIFIER_SPACE },
      ),
      roster(
        "deposito",
        [record("R1", "Marlo Zurbetti", "ALFA", "ID-1"), record("R2", "Marlo Zurbetti", "ALFA")],
        { identifierSpace: PLATFORM_IDENTIFIER_SPACE },
      ),
    );

    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "shared_identifier"],
    ]);
    const l2 = resolution.ambiguous.find((item) => item.ref === "L2");
    expect(l2?.criterion).toBe("partial_name_same_team");
    expect(l2?.reason).toBe("multiple_candidates");
    expect(l2?.candidates).toEqual(["R1", "R2"]);
    // Entrambi i candidati erano già usciti dal giro quando L2 è arrivata al
    // suo rango: R1 agganciato dall'identificativo, R2 dichiarato conteso al
    // rango della copertura piena (il suo unico candidato, L1, ne aveva due
    // sulle liste intere). `resolvedElsewhere` risponde esattamente alla
    // domanda «perché è ambigua se sembra sola?».
    expect(l2?.resolvedElsewhere).toEqual(["R1", "R2"]);
    const r2 = resolution.ambiguous.find((item) => item.ref === "R2");
    expect(r2?.criterion).toBe("unordered_name_same_team");
    expect(r2?.reason).toBe("contested_candidate");
    expectFullAccounting(resolution, ["L1", "L2"], ["R1", "R2"]);
  });

  it("un candidato conteso da due cognomi uguali non viene assegnato a nessuno dei due", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA"), record("L2", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches).toEqual([]);
    expect(refs(resolution.ambiguous)).toEqual(["L1", "L2", "R1"]);
    expect(resolution.ambiguous.filter((item) => item.side === "right")[0]?.candidates).toEqual([
      "L1",
      "L2",
    ]);
  });

  it("permutare l'ordine d'ingresso non cambia una virgola del risultato", () => {
    const destra = [record("R1", "Marlo Zurbetti", "ALFA"), record("R2", "Ondre Zurbetti", "ALFA")];
    const diretto = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", destra),
    );
    const invertito = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [...destra].reverse()),
    );
    expect(invertito).toEqual(diretto);
  });
});

describe("l'esclusività non prova l'unicità nel mondo", () => {
  it("LA FIXTURE DEL PERICOLO: un aggancio esclusivo che può essere sbagliato, e non lo dice", () => {
    // Questo test NON impedisce niente, e non è scritto per impedire: con due
    // sole liste il caso non è impedibile. È scritto perché chi arriva dopo lo
    // trovi documentato invece di scoprirlo su una rosa vera.
    //
    // Se L1 è in realtà un ALTRO Zurbetti della stessa squadra, e il suo vero
    // contraltare manca dal deposito perché nessuno l'ha ancora tracciato,
    // queste due righe sono due persone diverse. L'esito qui sotto è
    // indistinguibile da quello di un aggancio giusto.
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.criterion, match.certainty])).toEqual([
      ["partial_name_same_team", "weak"],
    ]);
    expect(resolution.ambiguous).toEqual([]);
    expect(resolution.unresolved).toEqual([]);

    // E i conti dell'insieme, qui, NON aiutano: sono puliti. È il caso
    // peggiore — la riga che manca da entrambe le liste — e nessun conteggio
    // può mostrare una riga che in nessuna delle due liste c'è.
    expect(resolution.matches[0]?.cohort).toEqual({
      scope: "declared_team",
      key: "ALFA",
      leftRecords: 1,
      rightRecords: 1,
      leftWithoutMatch: 0,
      rightWithoutMatch: 0,
    });
  });

  it("lo stesso pericolo al rango della copertura piena: l'iniziale distingue solo fra i presenti", () => {
    const resolution = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti M.", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.criterion, match.certainty])).toEqual([
      ["unordered_name_same_team", "moderate"],
    ]);
    expect(resolution.ambiguous).toEqual([]);
    expect(resolution.unresolved).toEqual([]);
    expect(resolution.matches[0]?.cohort.leftWithoutMatch).toBe(0);
  });

  it("quando l'insieme è invece visibilmente scoperto, i conti lo dicono", () => {
    // Qui il deposito non copre tutta la rosa dichiarata: una riga di sinistra
    // resta senza abbinamento, e quel numero arriva a chi consuma attaccato
    // all'abbinamento debole, non da qualche altra parte.
    // La riga di un'ALTRA squadra sta nella fixture apposta: i conti sono
    // dentro la rosa dichiarata, non sulla lista intera, e se un giorno
    // qualcuno li allargasse alla lista questa riga cadrebbe.
    const resolution = resolveIdentities(
      roster("piattaforma", [
        record("L1", "Zurbetti", "ALFA"),
        record("L2", "Vamproni", "ALFA"),
        record("L3", "Vaschin", "BETA"),
      ]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    expect(resolution.matches.map((match) => [match.leftRef, match.rightRef, match.criterion])).toEqual([
      ["L1", "R1", "partial_name_same_team"],
    ]);
    expect(resolution.matches[0]?.cohort).toEqual({
      scope: "declared_team",
      key: "ALFA",
      leftRecords: 2,
      rightRecords: 1,
      leftWithoutMatch: 1,
      rightWithoutMatch: 0,
    });
  });

  it("i conti non cambiano né la targa né il criterio: sono numeri, non un giudizio", () => {
    const scoperto = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA"), record("L2", "Vamproni", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    const coperto = resolveIdentities(
      roster("piattaforma", [record("L1", "Zurbetti", "ALFA")]),
      roster("deposito", [record("R1", "Marlo Zurbetti", "ALFA")]),
    );
    // Insiemi coperti in modo diverso, stessa targa e stesso criterio: se un
    // giorno un conteggio cominciasse a declassare o promuovere, questa riga
    // cadrebbe — e quella sarebbe una politica di accettazione, che non vive
    // in questo pacchetto.
    expect(scoperto.matches[0]?.certainty).toBe(coperto.matches[0]?.certainty);
    expect(scoperto.matches[0]?.criterion).toBe(coperto.matches[0]?.criterion);
  });
});

describe("i due ranghi nuovi non riscrivono la scala, ci si siedono dentro", () => {
  it("il nome intero batte il nome corto: la copertura non ruba un aggancio più forte", () => {
    // L1 avrebbe copertura piena con R2 («Zurbetti Marlo» permutato) e nome
    // identico con R1: vince R1, al rango 2.
    const resolution = resolveIdentities(
      roster("deposito", [record("L1", "Marlo Zurbetti", "ALFA")]),
      roster("altro-deposito", [
        record("R1", "Marlo Zurbetti", "ALFA"),
        record("R2", "Zurbetti Marlo", "ALFA"),
      ]),
    );
    expect(resolution.matches.map((match) => [match.rightRef, match.criterion])).toEqual([
      ["R1", "exact_name_same_team"],
    ]);
  });

  it("la certezza non risale mai scendendo di rango, nemmeno con i due ranghi nuovi in mezzo", () => {
    const order = { certain: 3, strong: 2, moderate: 1, weak: 0 } as const;
    for (let i = 1; i < MATCH_CRITERIA.length; i += 1) {
      const previous = MATCH_CRITERIA[i - 1];
      const current = MATCH_CRITERIA[i];
      if (previous === undefined || current === undefined) continue;
      expect(order[current.certainty]).toBeLessThanOrEqual(order[previous.certainty]);
    }
  });
});
