import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  reduce,
  appendEvent,
  maxSafe,
  hardReserve,
  roleScarcity,
  opponentTier1,
  validateEvent,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
  TOTAL_SLOTS,
  type AuctionEvent,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticPool, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;

describe("event log — append-only", () => {
  it("2. does not mutate existing events on append", () => {
    const log = syntheticLog();
    const snapshot = JSON.stringify(log);
    const next = appendEvent(log, {
      type: "PURCHASE", seq: 7, ts: "2026-08-01T10:06:00Z",
      playerId: "C2", role: "C", fantaTeamId: "ac_vostra", price: 12,
    });
    expect(JSON.stringify(log)).toBe(snapshot); // original untouched
    expect(next.length).toBe(log.length + 1);
    expect(next).not.toBe(log); // new array
  });

  it("rejects non-increasing seq (append-only invariant)", () => {
    const log = syntheticLog();
    expect(() =>
      appendEvent(log, { type: "VOID", seq: 2, ts: "x", targetSeq: 0 }),
    ).toThrow(/append-only/);
  });

  it("validates event schema", () => {
    expect(() => validateEvent({ type: "PURCHASE", seq: 0, ts: "t", playerId: "A1", role: "Z", fantaTeamId: "x", price: 1 })).toThrow();
  });
});

describe("reduce — deterministic projection", () => {
  it("1. same log -> same state", () => {
    const a = reduce(syntheticLog(), TEAMS);
    const b = reduce(syntheticLog(), TEAMS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("1b. order-independent (sorts by seq)", () => {
    const log = syntheticLog();
    const shuffled = [...log].reverse();
    expect(JSON.stringify(reduce(shuffled, TEAMS))).toBe(
      JSON.stringify(reduce(log, TEAMS)),
    );
  });

  it("3. initial budget is 500 for an empty log", () => {
    const s = reduce([], TEAMS);
    for (const id of TEAMS) expect(s.teams[id]!.budgetResidual).toBe(500);
    expect(INITIAL_BUDGET).toBe(500);
  });

  it("4. roster target is 3P/9D/9C/7A (=28)", () => {
    expect(ROSTER_REQUIREMENTS).toEqual({ P: 3, D: 9, C: 9, A: 7 });
    expect(TOTAL_SLOTS).toBe(28);
    const s = reduce([], TEAMS);
    const t = s.teams["new_milf"]!;
    expect(t.totalSlotsRemaining).toBe(28);
  });

  it("8. a purchase updates budget, slots and roster", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const milf = s.teams["new_milf"]!;
    expect(milf.spent).toBe(102 + 22); // A1 + D1
    expect(milf.budgetResidual).toBe(500 - 124);
    expect(milf.filled.A).toBe(1);
    expect(milf.filled.D).toBe(1);
    expect(milf.totalSlotsRemaining).toBe(28 - 2);
    expect(milf.roster.map((r) => r.playerId)).toEqual(["A1", "D1"]);
  });

  it("9. VOID (undo) yields a coherent compensated state", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const ataturk = s.teams["ataturk"]!;
    // D2 was bought at 999 (seq3), voided (seq4), re-bought at 7 (seq5)
    expect(ataturk.spent).toBe(7);
    expect(ataturk.filled.D).toBe(1);
    expect(ataturk.budgetResidual).toBe(500 - 7);
    expect(s.purchasedPlayerIds.filter((p) => p === "D2").length).toBe(1);
  });

  it("9b. replay: senza il VOID quel log non descrive nessuna asta, e reduce() lo dice", () => {
    // L'ASSERZIONE ERA PIÙ DEBOLE, e diceva meno del vero. Confrontava lo
    // `spent` dei due replay e pretendeva che fossero diversi — vero, ma è la
    // conseguenza minore. Il fatto grosso è che il log senza il VOID mette D2
    // DUE VOLTE nella stessa rosa (comprato a 999 al seq3, ricomprato a 7 al
    // seq5): non è un'asta con un errore di prezzo, è un'asta impossibile, e
    // `validateAuctionLog` infatti la rifiuta al bordo del salvataggio.
    //
    // Dal 2026-08-30 la rifiuta anche `reduce()`, che prima ci girava sopra
    // producendo otto budget plausibili e sbagliati (vedi `ownerOf` in
    // reduce.ts, e il rilievo della lente Engineering sulla PR pubblica #73).
    // Il VOID non è cosmetico: senza, non c'è nessuno stato da calcolare.
    const full = syntheticLog();
    const noVoid = full.filter((e) => !(e.type === "VOID")) as AuctionEvent[];
    expect(() => reduce(noVoid, TEAMS)).toThrow(/already on/);
    // E col VOID il log torna riducibile, con la correzione applicata.
    expect(reduce(full, TEAMS).teams["ataturk"]!.spent).toBe(7);
  });
});

describe("hard reserve & max_safe", () => {
  it("5. hard_reserve = slots_to_reserve * 1", () => {
    expect(hardReserve(0)).toBe(0);
    expect(hardReserve(27)).toBe(27);
    expect(hardReserve(5)).toBe(5);
  });

  it("6. max_safe = budget_residual - hard_reserve (empty roster)", () => {
    const s = reduce([], TEAMS);
    const t = s.teams["new_milf"]!;
    const r = maxSafe(t, "A");
    // 28 slots, buying one leaves 27 to reserve
    expect(r.hardReserve).toBe(27);
    expect(r.maxSafe).toBe(500 - 27);
    expect(r.biddable).toBe(true);
  });

  it("7. spending max_safe still leaves the roster completable", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const t = s.teams["new_milf"]!;
    const r = maxSafe(t, "C");
    // after spending maxSafe, residual must cover the OTHER remaining slots at 1
    const residualAfter = t.budgetResidual - r.maxSafe;
    const otherSlots = t.totalSlotsRemaining - 1;
    expect(residualAfter).toBeGreaterThanOrEqual(otherSlots * 1);
    expect(residualAfter).toBe(r.hardReserve);
  });

  it("7b. max_safe never recommends breaking the roster (full role not biddable)", () => {
    // simulate a team with role A full
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: "t", playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const t = reduce(log, TEAMS).teams["psg"]!;
    const r = maxSafe(t, "A");
    expect(r.biddable).toBe(false);
    expect(r.reason).toBe("role-full");
  });
});

describe("role scarcity & opponent Tier-1", () => {
  it("11. role scarcity returns coherent remaining supply", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const sc = roleScarcity(s, syntheticPool());
    // pool has 20 A; A1 bought -> 19 remain
    expect(sc.A.poolRemaining).toBe(19);
    // league A slots: 8 teams * 7 = 56, minus 1 filled (new_milf A1)
    expect(sc.A.leagueSlotsRemaining).toBe(8 * 7 - 1);
    expect(sc.D.poolRemaining).toBe(30 - 2); // D1, D2 bought
  });

  it("10. opponent Tier-1 shows residual budget and slots, excludes self", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const opp = opponentTier1(s, "new_milf");
    expect(opp.find((o) => o.fantaTeamId === "new_milf")).toBeUndefined();
    const ataturk = opp.find((o) => o.fantaTeamId === "ataturk")!;
    expect(ataturk.budgetResidual).toBe(500 - 7);
    expect(ataturk.slotsRemaining.D).toBe(9 - 1);
    expect(ataturk.totalSlotsRemaining).toBe(28 - 1);
  });
});

// ---------------------------------------------------------------------------
// 12. Scope guard sui simboli di valore.
//
// La guardia nasce nello Sprint 1, quando NESSUN simbolo di valore poteva
// esistere nel motore. Dal 2026-08-14 `docs/DECISIONS.md` §D9 perimetro 1 e la
// matrice UI di `docs/AUCTION_2026_EXECUTION_PLAN.md` §3 autorizzano
// esplicitamente UNA famiglia e una sola: i numeri «derivati dai valori
// dichiarati di Owner» (issue #233, strato 3 del copilota). Tutto il resto —
// valore model-derived, FTM model-derived, banda/stretch di modello, modifier,
// Spearman — resta fuori dal motore e dietro receipt e gate.
//
// La guardia è quindi RISTRETTA, non rimossa, e conserva i denti: i simboli
// autorizzati sono elencati uno per uno qui sotto e confrontati per nome
// ESATTO. Un nuovo export che contenga «value» e non sia in questa lista fa
// fallire il test, e aggiungercelo è un atto deliberato che passa da una
// review — che è esattamente ciò che la guardia deve costare.
// ---------------------------------------------------------------------------
describe("12. scope guard — solo i simboli di valore autorizzati da §D9", () => {
  /**
   * Autorizzati da §D9 perimetro 1 + matrice UI §3, CON IL MODULO IN CUI OGNUNO
   * DEVE NASCERE.
   *
   * Il modulo fa parte dell'autorizzazione e non è una nota: la guardia
   * certifica l'IDENTITÀ del binding (vedi «Bypass 1» più sotto), e un nome
   * autorizzato che arrivasse da un altro file sarebbe di nuovo un'etichetta al
   * posto di un divieto. Due moduli autorizzati, e solo due:
   *
   *  - `declaredValues.ts` — i valori DICHIARATI di Owner (#233);
   *  - `absoluteValue.ts` — il valore ASSOLUTO in crediti, decisione di Pico del
   *    2026-08-24. Sta nella famiglia autorizzata e non in quella vietata, e la
   *    differenza è verificabile riga per riga: gli ingredienti sono il BUDGET
   *    DEL REGOLAMENTO (`INITIAL_BUDGET`), gli SLOT DEL REGOLAMENTO
   *    (`ROSTER_REQUIREMENTS`), i TARGET DI RUOLO DICHIARATI da Pico e
   *    un'ARITMETICA DICHIARATA su di essi — i tre ingredienti di §D9 e
   *    nient'altro. Nessun modello, nessuna statistica, nessun prezzo di mercato
   *    previsto, nessun peso scelto dal sistema: i tre `delta` delle gambe sono
   *    numeri di Pico e valgono 0 finché non li dichiara.
   *
   *  - `creditValue.ts` — `V(i)`, il VALORE IN CREDITI del passo 2 del nucleo
   *    P0 (NOM-PROTOCOL-A §A.1). Sta nella famiglia autorizzata per lo stesso
   *    motivo dell'assoluto, e la differenza è di nuovo verificabile riga per
   *    riga: gli ingredienti sono il DEPOSITO SERVITO (`T1̂`/`N̂`, letto e mai
   *    prodotto qui), il POOL e gli SLOT DEL REGOLAMENTO
   *    (`INITIAL_BUDGET × NUM_FANTA_TEAMS`, `ROSTER_REQUIREMENTS ×
   *    NUM_FANTA_TEAMS`), i VALORI DICHIARATI di Pico come override che
   *    comanda, e un'ARITMETICA DICHIARATA su di essi (VORP sul rango di
   *    rimpiazzo, ripartizione col metodo dei resti maggiori). Nessun modello,
   *    nessun peso scelto dal sistema: le due sole correzioni previste hanno il
   *    default che non aggiunge nulla (`γ = 0`, tetto spento) e si accendono
   *    solo per esito dei test preregistrati.
   *
   * Il nome nudo `value` resta fuori, qui come altrove.
   */
  const DECLARED_VALUE_ALLOWLIST: Readonly<Record<string, string>> = {
    DECLARED_VALUE_PROVENANCE: "declaredValues.js",
    VALUE_PROFILES: "declaredValues.js",
    declaredValueBook: "declaredValues.js",
    declaredValueOf: "declaredValues.js",
    validateDeclaredValues: "declaredValues.js",
    ABSOLUTE_VALUE_DELTAS: "absoluteValue.js",
    ABSOLUTE_VALUE_LEGS: "absoluteValue.js",
    ABSOLUTE_VALUE_UNRATIFIED_CHOICES: "absoluteValue.js",
    absoluteValueReading: "absoluteValue.js",
    CREDIT_VALUE_GAMMAS: "creditValue.js",
    CREDIT_VALUE_UNRATIFIED_CHOICES: "creditValue.js",
    DEFAULT_CREDIT_VALUE_GAMMA: "creditValue.js",
    creditValueBook: "creditValue.js",
    creditValueCredits: "creditValue.js",
    creditValueOf: "creditValue.js",
  };
  const ALLOWED_VALUE_NAMES = Object.keys(DECLARED_VALUE_ALLOWLIST);

  /** Sorgenti del motore, lette dal disco: la guardia non si fida del barrel. */
  const SRC_DIR = new URL("../src/", import.meta.url);
  const SRC_FILES = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));
  const sourceOf = (file: string): string =>
    readFileSync(new URL(file, SRC_DIR), "utf8");

  /**
   * Toglie commenti e stringhe: dentro un commento «§4.2» e dentro una stringa
   * «0,30» non sono costanti del programma, e contarli renderebbe la guardia
   * rumorosa al punto da farla disattivare.
   */
  function stripCommentsAndStrings(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/`(?:[^`\\]|\\.)*`/g, '""')
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, '""');
  }

  it("nessun simbolo di valore fuori dall'allowlist §D9", async () => {
    const mod = await import("../src/index.js");
    const banned = ["value", "fairtome", "targetband", "stretchcap", "modifier", "spearman"];
    const offenders = Object.keys(mod).filter(
      (key) =>
        !ALLOWED_VALUE_NAMES.includes(key) &&
        banned.some((b) => key.toLowerCase().includes(b)),
    );
    expect(offenders).toEqual([]);
  });

  it("l'allowlist non contiene voci morte: ogni nome è davvero esportato", async () => {
    const mod = await import("../src/index.js");
    const keys = Object.keys(mod);
    for (const allowed of ALLOWED_VALUE_NAMES) expect(keys).toContain(allowed);
  });

  // -------------------------------------------------------------------------
  // Bypass 1 provato da una review avversariale: un produttore di fair-to-me
  // model-derived (`modelFairToMe`, pesi inventati per ruolo) esportato dal
  // barrel SOTTO un nome dell'allowlist:
  //     export { modelFairToMe as declaredValueOf } from "./__evil.js";
  // I tre controlli precedenti passavano tutti — l'allowlist aveva trasformato
  // un divieto sul nome in una licenza permanente su cinque nomi. Da qui in poi
  // l'allowlist certifica l'IDENTITÀ del binding, non l'etichetta.
  // -------------------------------------------------------------------------
  it("i nomi in allowlist sono i binding del loro modulo autorizzato, non alias di altro", async () => {
    const mod = (await import("../src/index.js")) as Record<string, unknown>;
    const owners = new Map<string, Record<string, unknown>>([
      ["declaredValues.js", (await import("../src/declaredValues.js")) as Record<string, unknown>],
      ["absoluteValue.js", (await import("../src/absoluteValue.js")) as Record<string, unknown>],
      ["creditValue.js", (await import("../src/creditValue.js")) as Record<string, unknown>],
    ]);
    for (const [allowed, owner] of Object.entries(DECLARED_VALUE_ALLOWLIST)) {
      const source = owners.get(owner)!;
      expect(source[allowed], `${allowed} deve nascere in ${owner}`).toBeDefined();
      // `Object.is` sul binding: un re-export con rinomina fallisce qui, perché
      // l'oggetto esportato non è più quello del modulo autorizzato.
      expect(
        Object.is(mod[allowed], source[allowed]),
        `${allowed} nel barrel non è il binding di ${owner}`,
      ).toBe(true);
    }
  });

  it("absoluteValue.ts non cabla nessun peso: le sole costanti numeriche sono gli zeri dei delta", () => {
    // Stessa sonda applicata a declaredValues.ts, sull'altro modulo
    // autorizzato: chiusa la strada dell'alias, l'attacco si sposta DENTRO il
    // file coperto dall'allowlist. Qui i soli letterali ammessi sono `0` (i tre
    // delta spenti, la linea di base delle coppe, i confronti) e `1` (la
    // presenza nelle coppe e l'aritmetica dell'ordinale del vocabolario). Un
    // `0.6` o un `1.15` che comparissero qui sarebbero un peso scelto dal
    // sistema, cioè esattamente ciò che §D9 vieta.
    //
    // Il `2` è il DIVISORE DEL PUNTO MEDIO di una lista — `(length - 1) / 2`,
    // il centro del vocabolario della concorrenza. È la definizione di «metà»,
    // non un coefficiente: cambia da solo se il vocabolario cambia lunghezza, e
    // nessun valore diverso da 2 può comparire al suo posto senza smettere di
    // essere un punto medio.
    const ALLOWED_NUMERIC_LITERALS = new Set(["0", "1", "2"]);
    const code = stripCommentsAndStrings(sourceOf("absoluteValue.ts"));
    const literals = [...code.matchAll(/(?<![\w.$])\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map(
      (m) => m[0],
    );
    const unexpected = [...new Set(literals)].filter((n) => !ALLOWED_NUMERIC_LITERALS.has(n));
    expect(unexpected).toEqual([]);
  });

  it("declaredValues.ts non contiene costanti numeriche oltre gli α preregistrati", () => {
    // Chiusa la strada dell'alias, l'attacco si sposta dentro il modulo
    // autorizzato: pesi cablati in un file che l'allowlist copre. Le uniche
    // costanti ammesse sono gli α di §4.2 (0,85 · 1,0 · 1,15) e i due valori
    // strutturali 0/1 dei confronti di validazione.
    const ALLOWED_NUMERIC_LITERALS = new Set(["0", "1", "0.85", "1.0", "1.15"]);
    const code = stripCommentsAndStrings(sourceOf("declaredValues.ts"));
    const literals = [...code.matchAll(/(?<![\w.$])\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map(
      (m) => m[0],
    );
    const unexpected = [...new Set(literals)].filter((n) => !ALLOWED_NUMERIC_LITERALS.has(n));
    expect(unexpected).toEqual([]);
  });

  it("creditValue.ts non cabla nessun peso: solo i γ dichiarati e il calendario", () => {
    // La stessa sonda sul terzo modulo autorizzato. I soli letterali ammessi
    // sono `0`/`1` (i confronti, il pavimento di un credito, l'unità di resto,
    // il `+1` che porta dal numero di slot al primo rango non riempito), `38`
    // (le giornate di una stagione: il calendario, lo stesso 1..38 che parser e
    // validatori già impongono) e i due γ diversi da zero dell'inventario del
    // DTI (§E: `{0, 0.25, 0.5}`). Il pool, gli slot del tavolo e i quattro
    // ranghi di rimpiazzo NON compaiono qui come numeri: sono derivati dal
    // regolamento, ed è questa sonda a garantire che restino tali — il giorno
    // in cui qualcuno scrivesse `4000`, `224` o `57` a mano, questo test lo
    // direbbe.
    const ALLOWED_NUMERIC_LITERALS = new Set(["0", "1", "38", "0.25", "0.5"]);
    const code = stripCommentsAndStrings(sourceOf("creditValue.ts"));
    const literals = [...code.matchAll(/(?<![\w.$])\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)].map(
      (m) => m[0],
    );
    const unexpected = [...new Set(literals)].filter((n) => !ALLOWED_NUMERIC_LITERALS.has(n));
    expect(unexpected).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Bypass 2, peggiore: la coppia ADDITIVA. Nessuno dei nomi contiene una
  // parola bandita, quindi niente reagiva:
  //     export function stopPriceFor(...): number            // FTM model-derived
  //     export function priceRangeFor(...): { lo: number; hi: number }
  // Il secondo è per di più il divieto di FORMA di §D9 perimetro 2 («nessun
  // intervallo di prezzo per giocatore»). Un divieto di forma si controlla
  // sulla forma: qui si guarda il TIPO restituito e la SHAPE dichiarata, non
  // il nome — così un rename non basta più ad aggirarlo.
  // -------------------------------------------------------------------------

  /**
   * Coppie di estremi riconosciute. Il confronto è sul RESTO del nome dopo il
   * prefisso: `minPrice`/`maxPrice` è un intervallo (resto «price» uguale),
   * `minReserve`/`maxAllocatable` no (resti diversi) — ed è la distinzione che
   * evita di scambiare per una banda di prezzo l'inviluppo contabile di
   * `budgetPlan`, che è invece esattamente ciò che il progetto vuole mostrare.
   */
  const BOUND_PAIRS: readonly (readonly [string, string])[] = [
    ["min", "max"],
    ["lo", "hi"],
    ["low", "high"],
    ["lower", "upper"],
    ["from", "to"],
    ["start", "end"],
    ["floor", "ceiling"],
    ["bottom", "top"],
  ];

  /** True se il testo di un tipo dichiara due estremi numerici della stessa grandezza. */
  function declaresNumericRange(typeText: string): boolean {
    if (/\[\s*number\s*,\s*number\s*\]/.test(typeText)) return true;
    const numericFields = [...typeText.matchAll(/(\w+)\s*\??\s*:\s*number\b/g)].map((m) =>
      m[1]!.toLowerCase(),
    );
    for (const [a, b] of BOUND_PAIRS) {
      const restsA = numericFields.filter((f) => f.startsWith(a)).map((f) => f.slice(a.length));
      const restsB = numericFields.filter((f) => f.startsWith(b)).map((f) => f.slice(b.length));
      if (restsA.some((r) => restsB.includes(r))) return true;
    }
    return false;
  }

  it("nessuna funzione esportata restituisce un intervallo (divieto di forma §D9 perimetro 2)", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const code = stripCommentsAndStrings(sourceOf(file));
      // Il tipo di ritorno si cattura fino alla graffa che apre il CORPO, cioè
      // l'ultima della riga: un `([\s\S]*?)\{` pigro si fermerebbe alla prima,
      // che per un ritorno inline (`): { lo: number; hi: number } {`) è la
      // graffa del tipo stesso — e la sonda passerebbe indisturbata.
      for (const m of code.matchAll(
        /export function (\w+)\s*\(([\s\S]*?)\)\s*:\s*([^\n]*?)\s*\{[ \t]*$/gm,
      )) {
        if (declaresNumericRange(m[3]!)) offenders.push(`${file}:${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nessun tipo esportato dichiara una coppia di estremi numerici", () => {
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const code = stripCommentsAndStrings(sourceOf(file));
      for (const m of code.matchAll(/export (?:interface|type) (\w+)[^{]*\{([^}]*)\}/g)) {
        if (declaresNumericRange(m[2]!)) offenders.push(`${file}:${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nessuna tabella di pesi per ruolo nel motore (§D9: parametri comportamentali fittati)", () => {
    // Terza sonda della review: `stopPriceFor(quotation, role)` restituisce uno
    // SCALARE con un nome innocuo, quindi né il controllo sui nomi né quello
    // sulla forma possono vederlo. Ma un fair-to-me model-derived per ruolo ha
    // bisogno di una cosa che non può nascondere: la tabella di pesi che lo
    // alimenta. È quella che si cerca qui — ovunque nel motore, esportata o no.
    //
    // Le tabelle per ruolo legittime sono elencate per testo esatto, ognuna con
    // la propria fonte normativa. Sono tutte REGOLE DI LEGA o accumulatori
    // azzerati, mai coefficienti: una quarta tabella è un atto deliberato che
    // passa da una review.
    const ALLOWED_ROLE_TABLES = new Set([
      "{ P: 3, D: 9, C: 9, A: 7 }", // ROSTER_REQUIREMENTS — LEAGUE_RULES, composizione rosa
      "{ P: 0, D: 1, C: 1, A: 1 }", // CONFIRMATION_LIMITS — LEAGUE_RULES §4, riconferme per ruolo
      "{ P: 0, D: 0, C: 0, A: 0 }", // accumulatori azzerati (reduce, livePlan, confirmations)
    ]);
    const offenders: string[] = [];
    for (const file of SRC_FILES) {
      const code = stripCommentsAndStrings(sourceOf(file));
      for (const m of code.matchAll(
        /\{\s*P\s*:\s*-?[\d.]+\s*,\s*D\s*:\s*-?[\d.]+\s*,\s*C\s*:\s*-?[\d.]+\s*,\s*A\s*:\s*-?[\d.]+\s*,?\s*\}/g,
      )) {
        const normalised = m[0]!.replace(/\s+/g, " ").replace(/,\s*\}/, " }");
        if (!ALLOWED_ROLE_TABLES.has(normalised)) offenders.push(`${file}: ${normalised}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("i valori autorizzati restano DICHIARATI: nessun export che ne produca uno", async () => {
    // La differenza fra ciò che §D9 consente e ciò che vieta non è il nome, è
    // chi produce il numero. Il motore INDICIZZA e VALIDA i valori di Owner; non
    // esiste (e non deve esistere) un export che li calcoli.
    const mod = await import("../src/index.js");
    // Prefissi allo stato di radice, non al participio: la versione precedente
    // richiedeva un confine camelCase (`^compute[A-Z]`) e lasciava passare
    // `computedValue`, `estimatedPriceOf`, `predictedAnchor`, `inferredFit`.
    // `fitsPlan` resta fuori senza bisogno di eccezioni — chiede se un prezzo
    // STA nel piano, e «fits» non è «fitted».
    const producers = Object.keys(mod).filter((key) =>
      /^(comput|estimat|predict|infer|fitted|fitting|scor)/i.test(key),
    );
    expect(producers).toEqual([]);
  });

  it("i tre controlli di forma catturano davvero le sonde della review", () => {
    // Contro-prova: la guardia deve reagire agli attacchi che l'hanno superata.
    // Senza questo test non si distingue «nessun offender» da «controllo rotto».
    expect(declaresNumericRange("{ lo: number; hi: number }")).toBe(true);
    expect(declaresNumericRange("{ lower: number; upper: number }")).toBe(true);
    expect(declaresNumericRange("[number, number]")).toBe(true);
    expect(declaresNumericRange("{ minPrice: number; maxPrice: number }")).toBe(true);
    // …e NON deve reagire agli inviluppi contabili legittimi già nel motore.
    expect(declaresNumericRange("{ minReserve: number; maxAllocatable: number }")).toBe(false);
    expect(declaresNumericRange("{ maxSafe: number; hardReserve: number }")).toBe(false);
    expect(/^(comput|estimat|predict|infer|fitted|fitting|scor)/i.test("estimatedPriceOf")).toBe(
      true,
    );
    expect(/^(comput|estimat|predict|infer|fitted|fitting|scor)/i.test("fitsPlan")).toBe(false);
  });

  it("LIMITI DICHIARATI della guardia — ciò che NON copre", () => {
    // Una guardia sopravvalutata è peggio di una assente. Registrato come test
    // perché resti leggibile accanto a ciò che la guardia fa davvero:
    //  1. `Object.keys` vede solo i binding a RUNTIME: `interface`/`type` sono
    //     invisibili al primo controllo (i due controlli di forma sopra leggono
    //     però il sorgente, quindi li coprono per la sola shape a intervallo);
    //  2. la guardia è NOMINALE sui produttori: `callScreen` produce i numeri
    //     della famiglia valore e non contiene nessuna stringa vietata — la sua
    //     conformità §D9 poggia sui test dedicati, non qui;
    //  3. il parser di forma è una regex, non un compilatore: una firma con
    //     tipi funzione annidati o un tipo di ritorno costruito via generici
    //     può sfuggirle;
    //  4. **pesi in ARRAY INDICIZZATO** — quarta sonda di una review
    //     avversariale (S4). Il controllo sulle tabelle per ruolo cerca la
    //     forma `{ P: …, D: …, C: …, A: … }`; un vettore posizionale
    //     equivalente, per esempio `const W = [0.71, 1.13, 1.42, 1.87]` letto
    //     con `W[ROLES.indexOf(role)]`, porta gli stessi pesi senza quella
    //     forma e **non viene catturato**. Non lo si insegue con una regex più
    //     larga: distinguere un vettore di pesi da un array di costanti
    //     legittime richiede di capire come è usato, cioè un'analisi che un
    //     test di guardia non fa. Resta un compito della review umana, ed è
    //     dichiarato qui perché nessuno lo dia per coperto.
    // Il valore della guardia è impedire una REGRESSIONE silenziosa, non
    // sostituire la review.
    expect(SRC_FILES.length).toBeGreaterThan(0);
  });
});
