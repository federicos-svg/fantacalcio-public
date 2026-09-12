import { describe, it, expect } from "vitest";
import {
  normalizePlayerName,
  tokenizeNormalizedName,
  computeTokenOverlap,
  compareNames,
} from "../src/nameSimilarity.js";
import { classifyIdentityCandidate } from "../src/candidateKeyPolicy.js";

// All names below are synthetic fixtures invented for this test only — not
// real players, not drawn from any real dataset (see docs/NO_GO.md).

describe("normalizePlayerName", () => {
  it("strips accents/diacritics", () => {
    expect(normalizePlayerName("Ünïcòdé Plàyér")).toBe("unicode player");
  });

  it("lowercases and collapses whitespace", () => {
    expect(normalizePlayerName("  Synth   Testman  ")).toBe("synth testman");
  });

  it("handles a punctuation variant (apostrophe/hyphen) as a separator", () => {
    expect(normalizePlayerName("D'Alpha-Beta")).toBe("d alpha beta");
  });

  // ── LE LETTERE LATINE CHE NFD NON SCOMPONE ────────────────────────────────
  //
  // Regressione della riparazione: `ø`, `đ`, `ł`, `ß`, `æ`... non sono lettere
  // base più un accento, quindi `normalize("NFD")` le lascia intatte e, prima
  // della riparazione, il filtro `[^a-z0-9\s]` le trasformava in uno SPAZIO.
  // Il danno misurabile è quello sotto: un cognome intero spezzato in due
  // token, oppure privato della propria iniziale. Tutti i nomi qui sono
  // sintetici, inventati per questo test (docs/NO_GO.md).

  it("una lettera latina estesa a inizio cognome non ne mangia l'iniziale", () => {
    expect(normalizePlayerName("\u00d8sterman")).toBe("osterman");
    expect(tokenizeNormalizedName(normalizePlayerName("\u00d8sterman"))).toHaveLength(1);
  });

  it("una lettera latina estesa DENTRO il cognome non lo spezza in due token", () => {
    expect(normalizePlayerName("Bj\u00f8rnsen")).toBe("bjornsen");
    expect(tokenizeNormalizedName(normalizePlayerName("Bj\u00f8rnsen"))).toHaveLength(1);
  });

  it("apre le legature nelle due lettere che rappresentano", () => {
    expect(normalizePlayerName("Stra\u00dfner")).toBe("strassner");
    expect(normalizePlayerName("\u00c6girsen")).toBe("aegirsen");
    expect(normalizePlayerName("\u0152rsted")).toBe("oersted");
    expect(normalizePlayerName("\u00derandur")).toBe("thrandur");
  });

  it("riporta alla lettera base le altre latine estese", () => {
    expect(normalizePlayerName("\u0110urovic")).toBe("durovic");
    expect(normalizePlayerName("Ha\u00f0ir")).toBe("hadir");
    expect(normalizePlayerName("\u0141ukasik")).toBe("lukasik");
  });

  // ── OGNI ENTRY DELLA TABELLA HA LA PROPRIA PROVA ──────────────────────────
  //
  // Il criterio è quello del mutation testing applicato al DATO invece che al
  // codice: tolta una riga sola dalla tabella, almeno una prova deve cadere.
  // Le quattro entry qui sotto non erano coperte da niente prima di questo
  // blocco, e `\u0131`/`\u017f`/`\u0138` hanno in più una trappola che vale la pena
  // pinnare — vedi il blocco successivo.

  it("copre le lettere con tratto o gancio che nessun'altra prova tocca", () => {
    expect(normalizePlayerName("\u0126alveni")).toBe("halveni");   // U+0127 minuscolo
    expect(normalizePlayerName("\u0166orbeni")).toBe("torbeni");   // U+0167 minuscolo
    expect(normalizePlayerName("\u014asterby")).toBe("nsterby");   // U+014B minuscolo
    expect(normalizePlayerName("Vas\u0138ini")).toBe("vaskini");   // U+0138, minuscolo soltanto
  });

  it("copre le lettere senza il proprio segno, che valgono la lettera piena", () => {
    expect(normalizePlayerName("Zurbett\u0131n")).toBe("zurbettin"); // U+0131, i senza punto
    expect(normalizePlayerName("Va\u017fcone")).toBe("vascone");     // U+017F, s lunga
  });

  it("le tre senza maiuscolo propria arrivano solo dal testo già minuscolo — e non è una svista", () => {
    // La piegatura gira DOPO `toLowerCase()`. `\u0131` e `\u017f` hanno un maiuscolo che
    // NON è loro — `I` e `S` — quindi una `I` maiuscola non diventa mai `\u0131` e
    // non incontra mai la tabella; `\u0138` un maiuscolo non ce l'ha affatto. Le
    // righe servono per il testo che le porta già così, ed è il caso vero.
    expect("\u0131".toUpperCase()).toBe("I");
    expect("\u017f".toUpperCase()).toBe("S");
    expect(normalizePlayerName("I")).toBe("i");
    expect(normalizePlayerName("S")).toBe("s");
    // Una maiuscola di partenza NON perde niente: la strada è un'altra, non un buco.
    expect(normalizePlayerName("\u0130lmaz")).toBe("ilmaz"); // U+0130 si scompone via NFD
  });

  it("nessuna entry della tabella è muta: ognuna cambia almeno un risultato", () => {
    // Se una riga della tabella sparisse, la lettera tornerebbe a diventare uno
    // spazio e almeno una di queste coppie collasserebbe. È la stessa prova che
    // il revisore ha fatto a mano, resa automatica.
    const coppie: readonly (readonly [string, string])[] = [
      ["\u00f8", "o"],
      ["\u0111", "d"],
      ["\u00f0", "d"],
      ["\u0142", "l"],
      ["\u0127", "h"],
      ["\u0167", "t"],
      ["\u014b", "n"],
      ["\u0131", "i"],
      ["\u0138", "k"],
      ["\u017f", "s"],
      ["\u00e6", "ae"],
      ["\u0153", "oe"],
      ["\u00df", "ss"],
      ["\u00fe", "th"],
    ];
    for (const [lettera, base] of coppie) {
      // In mezzo a un cognome: un token solo, e la lettera piegata al posto giusto.
      expect(normalizePlayerName(`Zur${lettera}betti`)).toBe(`zur${base}betti`);
      expect(tokenizeNormalizedName(normalizePlayerName(`Zur${lettera}betti`))).toHaveLength(1);
    }
    expect(coppie).toHaveLength(14);
  });

  it("il confronto per token aggancia le due grafie dello stesso cognome", () => {
    // Prima della riparazione: "osterman" contro " sterman" -> zero token in
    // comune, cioè lo stesso verdetto che darebbe su due persone diverse.
    expect(compareNames("\u00d8sterman", "Osterman").tokenOverlap).toBe(1);
    expect(compareNames("\u00d8sterman", "Osterman").exactNormalizedMatch).toBe(true);
  });

  it("non tocca la punteggiatura, che resta un separatore", () => {
    expect(normalizePlayerName("D'\u00d8sterman-Ruiz")).toBe("d osterman ruiz");
  });

  it("una lettera fuori dall'alfabeto latino resta uno spazio: non si indovina una base", () => {
    // Nessuna «lettera base» esiste per un alfabeto non latino: sceglierne una
    // sarebbe inventare. Resta separatore, ed è la scelta dichiarata.
    expect(normalizePlayerName("\u03b1\u03b2 Synth")).toBe("synth");
  });

  it("normalizes an empty/whitespace-only string to the empty string", () => {
    expect(normalizePlayerName("   ")).toBe("");
    expect(normalizePlayerName("")).toBe("");
  });
});

describe("tokenizeNormalizedName", () => {
  it("splits on the single collapsed space", () => {
    expect(tokenizeNormalizedName("synth testman")).toEqual(["synth", "testman"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(tokenizeNormalizedName("")).toEqual([]);
  });
});

describe("computeTokenOverlap", () => {
  it("exact same token set returns 1", () => {
    expect(computeTokenOverlap(["synth", "testman"], ["synth", "testman"])).toBe(1);
  });

  it("no shared tokens returns 0", () => {
    expect(computeTokenOverlap(["alpha", "beta"], ["gamma", "delta"])).toBe(0);
  });

  it("partial overlap returns the expected Jaccard score", () => {
    // intersection={synth}, union={synth,testman,omega} -> 1/3
    expect(computeTokenOverlap(["synth", "testman"], ["synth", "omega"])).toBeCloseTo(1 / 3, 10);
  });

  it("either side empty returns 0, never divides by zero", () => {
    expect(computeTokenOverlap([], ["synth"])).toBe(0);
    expect(computeTokenOverlap(["synth"], [])).toBe(0);
    expect(computeTokenOverlap([], [])).toBe(0);
  });

  it("is order-independent", () => {
    const a = computeTokenOverlap(["synth", "testman", "omega"], ["testman", "zeta"]);
    const b = computeTokenOverlap(["zeta", "testman"], ["omega", "testman", "synth"]);
    expect(a).toBe(b);
  });
});

describe("compareNames", () => {
  it("exact normalized match: tokenOverlap=1, exactNormalizedMatch=true", () => {
    const result = compareNames("Synth Testman", "synth   testman");
    expect(result.tokenOverlap).toBe(1);
    expect(result.exactNormalizedMatch).toBe(true);
    expect(result.insufficientTokens).toBe(false);
  });

  it("accent + casing + punctuation variant still resolves to an exact match", () => {
    const result = compareNames("Ünïcòdé D'Testér", "unicode d tester");
    expect(result.exactNormalizedMatch).toBe(true);
  });

  it("double-surname / added middle token: partial overlap, not exact or zero", () => {
    // "Synth Testman" vs "Synth Omega Testman" (an inserted middle token)
    const result = compareNames("Synth Testman", "Synth Omega Testman");
    expect(result.exactNormalizedMatch).toBe(false);
    expect(result.tokenOverlap).toBeCloseTo(2 / 3, 10);
    expect(result.tokenOverlap).toBeGreaterThan(0);
    expect(result.tokenOverlap).toBeLessThan(1);
  });

  it("no token overlap at all", () => {
    const result = compareNames("Alpha Beta", "Gamma Delta");
    expect(result.tokenOverlap).toBe(0);
    expect(result.exactNormalizedMatch).toBe(false);
  });

  it("empty/blank input on one side is handled safely, never throws", () => {
    const result = compareNames("", "  ");
    expect(result.emptyA).toBe(true);
    expect(result.emptyB).toBe(true);
    expect(result.insufficientTokens).toBe(true);
    expect(result.tokenOverlap).toBe(0);
    expect(result.exactNormalizedMatch).toBe(false); // both empty is never treated as a match
  });

  it("empty input on only one side sets insufficientTokens without throwing", () => {
    const result = compareNames("Synth Testman", "");
    expect(result.emptyA).toBe(false);
    expect(result.emptyB).toBe(true);
    expect(result.insufficientTokens).toBe(true);
    expect(result.tokenOverlap).toBe(0);
  });

  it("is fully deterministic across repeated calls", () => {
    const a = compareNames("Synth Omega Testman", "Synth Testman");
    const b = compareNames("Synth Omega Testman", "Synth Testman");
    expect(a).toEqual(b);
  });

  it("no output field is or resembles canonical_player_id/canonical_team_id", () => {
    const result = compareNames("Synth Testman", "Synth Omega Testman");
    const keys = Object.keys(result);
    expect(keys).not.toContain("canonical_player_id");
    expect(keys).not.toContain("canonical_team_id");
    expect(keys).not.toContain("canonicalPlayerId");
    expect(keys).not.toContain("canonicalTeamId");
  });
});

describe("integration: compareNames feeding classifyIdentityCandidate", () => {
  it("strong name continuity + same external_id/role/team -> accept_candidate, high confidence", () => {
    const names = compareNames("Synth Testman", "synth   testman");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    expect(result.outcome).toBe("accept_candidate");
    expect(result.confidenceBand).toBe("high");
  });

  it("weak name overlap + same external_id -> review_external_id_reuse, even with role/team continuity", () => {
    const names = compareNames("Alpha Beta", "Gamma Delta");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    expect(result.outcome).toBe("review_external_id_reuse");
  });

  it("moderate overlap from a double-surname/middle-token case -> review_name_mismatch", () => {
    const names = compareNames("Synth Testman", "Synth Omega Testman");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    // 2/3 overlap falls in the moderate band (>= LOW, < HIGH per candidateKeyPolicy.ts).
    expect(result.outcome).toBe("review_name_mismatch");
  });
});
