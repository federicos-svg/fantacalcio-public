import { describe, it, expect } from "vitest";
import { LISTONE_PAGE_SIZE } from "./listone.js";
import {
  CALL_SCREEN_ALLOCATED_PX,
  CALL_SCREEN_BUDGET_LEDGER,
  CALL_SCREEN_BUDGET_RESERVE_PX,
  CALL_SCREEN_BUDGET_SCREENS,
  CALL_SCREEN_BUDGET_UNRATIFIED,
  CALL_SCREEN_BUDGET_VIEWPORT,
  CALL_SCREEN_NAME_LENGTH_PINS,
  CALL_SCREEN_OVER_BUDGET_STATES,
  CALL_SCREEN_STATES,
  CALL_SCREEN_VERTICAL_BUDGET_PX,
  LISTONE_ALLOCATION_PX,
  LISTONE_CHROME_PX,
  LISTONE_HEAD_PX,
  LISTONE_ROW_PX,
  LISTONE_TAIL_PX,
  callScreenBudgetAttribution,
  callScreenBudgetFindings,
  callScreenNewBlockCostPx,
  callScreenVerticalBudgetPx,
  describeCallScreenBudgetFinding,
  type CallScreenBudgetUnratifiedId,
  type CallScreenState,
  type CallScreenSweep,
  type MeasuredCallScreenBlock,
} from "./callScreenBudget.js";

// L'ARITMETICA DEL MASTRO, SENZA BROWSER.
//
// ⚠️ TRAPPOLA DI MANUTENZIONE. «la riserva è oggi NEGATIVA» e «ogni voce
// dichiara uno scarto coerente col totale» ASSERISCONO CHE IL BUDGET È
// SFORATO: sono test di caratterizzazione, congelano un debito e non lo
// riparano. Chi riparerà davvero la schermata li vedrà diventare rossi senza
// aver rotto niente — si rimisura e si aggiornano i numeri (con la data) in
// src/ui/callScreenBudget.ts, non si allentano le asserzioni.
//
// È questo il pezzo che rende il mastro non-meccanico: l'uguaglianza esatta
// gira a ogni `npm test`, in millisecondi, e non si può alzare la propria riga
// per far tornare il verde — bisogna abbassare, NELLO STESSO DIFF, la riserva
// o la riga di un vicino con nome e cognome.

/** Il blocco misurato, con i valori che il browser restituirebbe. */
const block = (domId: string, consumptionPx: number): MeasuredCallScreenBlock => ({
  domId,
  description: `div#${domId}`,
  consumptionPx,
});

/**
 * Lo stato `ricerca` come è misurato oggi su main: tutto dentro le allocazioni.
 * Misura del 2026-08-29 su `519d694` — vedi CALL_SCREEN_BUDGET_MEASURED_ON.
 *
 * DUE VALORI QUI DENTRO SONO LA FIRMA DELLA BARRA FISSA, e vanno letti insieme:
 * `call-search-row` consuma 0 perché è `position: fixed` e non occupa altezza
 * verticale, e `call-screen-eyebrow` consuma 18 perché lo span comincia dal SUO
 * bordo superiore. Erano 151,5 e 0 fino al 2026-08-29.
 */
const healthySweep = (over: Partial<CallScreenSweep> = {}): CallScreenSweep => ({
  state: "ricerca",
  spanPx: 1470,
  blocks: [
    block("call-screen-eyebrow", 18),
    block("call-search-row", 0),
    // 14 e non 65,75: senza selezione questo nodo è VUOTO, e i 14 px sono il
    // margine del vicino di sotto, che la piastrellatura attribuisce a lui.
    block("call-search-hint", 14),
    // 267 e non 300,5: il sottoblocco PER ME mostra la sua frase di silenzio.
    block("suggested-player", 267),
    block("listone-block", 1171),
  ],
  listone: { rowCount: LISTONE_PAGE_SIZE, rowHeightPx: 92.5, headPx: 233, tailPx: 13 },
  ...over,
});

describe("il totale non è un numero nuovo", () => {
  it("è quello che la guardia di #333 già usa: l'altezza della finestra per due", () => {
    expect(CALL_SCREEN_BUDGET_SCREENS).toBe(2);
    expect(callScreenVerticalBudgetPx(844)).toBe(844 * 2);
    expect(callScreenVerticalBudgetPx(720)).toBe(720 * 2);
    expect(CALL_SCREEN_VERTICAL_BUDGET_PX).toBe(CALL_SCREEN_BUDGET_VIEWPORT.height * 2);
    expect(CALL_SCREEN_VERTICAL_BUDGET_PX).toBe(1688);
  });
});

describe("l'identità aritmetica del mastro", () => {
  // L'UGUAGLIANZA, ED È UN `===` E NON UN `<=`: con un `<=` si potrebbe alzare
  // la propria riga finché c'è spazio e lasciare la riserva dov'è, cioè
  // esattamente il difetto che questo mastro esiste per chiudere.
  it("somma delle allocazioni + riserva === il totale dichiarato", () => {
    expect(CALL_SCREEN_ALLOCATED_PX + CALL_SCREEN_BUDGET_RESERVE_PX).toBe(
      CALL_SCREEN_VERTICAL_BUDGET_PX,
    );
  });

  it("la somma è quella delle righe dichiarate, non un numero scritto a mano", () => {
    const sum = CALL_SCREEN_BUDGET_LEDGER.reduce((t, r) => t + r.allocationPx, 0);
    expect(CALL_SCREEN_ALLOCATED_PX).toBe(sum);
    expect(sum).toBe(2620);
  });

  // Il numero che il mastro esiste per far vedere. Pinnato: se qualcuno alza
  // una riga senza restituire niente, questo test cambia valore e il diff lo
  // mostra in un file tracciato — che è l'allarme che oggi manca del tutto.
  // ⚠️ RISALITA DA −1100 A −986 IL 2026-08-29, E NON PERCHÉ QUALCUNO ABBIA
  // RESTITUITO SPAZIO: la riga di ricerca è uscita dal flusso e i suoi 152 px
  // sono passati a `--assign-bar-h`, che questo mastro non contabilizza. Il
  // test pinna il numero nuovo perché il diff mostri il movimento; la ragione
  // per cui non è un miglioramento sta in BARRA_FISSA_FUORI_DAL_TOTALE.
  it("la riserva è oggi NEGATIVA: il totale è già sfondato dai blocchi che ci sono", () => {
    expect(CALL_SCREEN_BUDGET_RESERVE_PX).toBe(-932);
    expect(CALL_SCREEN_BUDGET_RESERVE_PX).toBeLessThan(0);
  });

  it("dice che cosa costa il blocco che ancora non esiste", () => {
    // «chi chiamare per me» — la prima metà di GIOCATORE SUGGERITO, già in
    // lavorazione — non arriva in uno spazio vuoto: arriva dovendo restituire
    // la propria altezza PIÙ il rosso della riserva.
    expect(callScreenNewBlockCostPx(0)).toBe(932);
    expect(callScreenNewBlockCostPx(120)).toBe(1052);
  });
});

describe("il mastro è un elenco onesto", () => {
  it("ogni riga ha identificativo, etichetta, id DOM, stato e commit della misura", () => {
    for (const row of CALL_SCREEN_BUDGET_LEDGER) {
      expect(row.id.length, row.id).toBeGreaterThan(0);
      expect(row.label.length, row.id).toBeGreaterThan(0);
      expect(row.domId.length, row.id).toBeGreaterThan(0);
      expect(row.why.length, row.id).toBeGreaterThan(0);
      expect(row.measuredAtCommit.length, row.id).toBeGreaterThan(0);
      expect(row.allocationPx, row.id).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.allocationPx), row.id).toBe(true);
      expect(row.requiredIn.length, row.id).toBeGreaterThan(0);
      expect(
        CALL_SCREEN_STATES.map((s) => s.id),
        row.id,
      ).toEqual(expect.arrayContaining([...row.requiredIn]));
      expect(
        CALL_SCREEN_STATES.some((s) => s.id === row.measuredInState),
        row.id,
      ).toBe(true);
    }
  });

  it("nessun identificativo e nessun id DOM ripetuto: due righe per lo stesso blocco non attribuiscono", () => {
    const ids = CALL_SCREEN_BUDGET_LEDGER.map((r) => r.id);
    const domIds = CALL_SCREEN_BUDGET_LEDGER.map((r) => r.domId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(domIds).size).toBe(domIds.length);
  });

  it("CONTESTO CHIAMATA è dichiarato obbligatorio solo dove esiste davvero", () => {
    const row = CALL_SCREEN_BUDGET_LEDGER.find((r) => r.id === "contesto-chiamata");
    expect(row?.requiredIn).toEqual([
      "riga-selezionata",
      "contesto-aperto",
      "contesto-aperto-ricerca-vuota",
    ]);
    // Senza selezione il pannello non è nel DOM: pretenderlo a boot renderebbe
    // rosso uno stato sano, cioè il modo più veloce per far disattivare la
    // guardia da qualcuno.
    expect(row?.requiredIn).not.toContain("ricerca");
  });
});

describe("la riga del listone è un'uguaglianza derivata dalla sua forma", () => {
  it("(righe per pagina × altezza di riga) + testata, non un numero piatto", () => {
    expect(LISTONE_CHROME_PX).toBe(LISTONE_HEAD_PX + LISTONE_TAIL_PX);
    expect(LISTONE_ALLOCATION_PX).toBe(LISTONE_PAGE_SIZE * LISTONE_ROW_PX + LISTONE_CHROME_PX);
    expect(LISTONE_ALLOCATION_PX).toBe(1176);
  });

  it("è la riga più grande del mastro: i due terzi dello span", () => {
    const listone = CALL_SCREEN_BUDGET_LEDGER.find((r) => r.id === "listone");
    expect(listone?.allocationPx).toBe(LISTONE_ALLOCATION_PX);
    const others = CALL_SCREEN_BUDGET_LEDGER.filter((r) => r.id !== "listone").map(
      (r) => r.allocationPx,
    );
    for (const a of others) expect(LISTONE_ALLOCATION_PX).toBeGreaterThan(a);
  });
});

describe("gli stati che oggi sfondano il totale, pinnati e non approvati", () => {
  it("ogni voce dichiara uno scarto coerente col totale", () => {
    expect(CALL_SCREEN_OVER_BUDGET_STATES.length).toBeGreaterThan(0);
    for (const s of CALL_SCREEN_OVER_BUDGET_STATES) {
      expect(s.spanPx - CALL_SCREEN_VERTICAL_BUDGET_PX, s.state).toBe(s.overBudgetPx);
      expect(s.overBudgetPx, s.state).toBeGreaterThan(0);
      expect(s.why.length, s.state).toBeGreaterThan(0);
      expect(
        CALL_SCREEN_STATES.some((k) => k.id === s.state),
        s.state,
      ).toBe(true);
    }
  });

  it("lo stato peggiore è il contesto aperto con la ricerca svuotata, al 152% del totale", () => {
    // Il numero è sceso tre volte, e solo la terza è una riparazione: −151 il
    // 2026-08-29 mattina (INSIGHT GIOCATORE se n'è andato nella scheda del
    // chiamato, vedi SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA), −113 la sera
    // (la riga di ricerca è uscita dal flusso e il suo costo è passato a
    // `--assign-bar-h`, vedi BARRA_FISSA_FUORI_DAL_TOTALE) — due traslochi, non
    // due pagamenti — e −103 il 2026-08-30, che invece è denaro vero: il
    // contatore delle interazioni di chiamata e l'istruzione sempre a schermo
    // sulla ricerca hanno smesso di esistere. Il debito resta grande: 878 px.
    const worst = CALL_SCREEN_OVER_BUDGET_STATES.find(
      (s) => s.state === "contesto-aperto-ricerca-vuota",
    );
    expect(worst?.spanPx).toBe(2566);
    expect(worst?.overBudgetPx).toBe(878);
    // LA SOMMA DELLE ALLOCAZIONI STA SOPRA QUELLO STATO, E DA OGGI DI PIÙ DEL
    // SOLO ARROTONDAMENTO. Fino al 2026-08-29 lo scarto era ≤ 1 px per riga:
    // lo stato peggiore portava OGNI blocco alla sua altezza massima, quindi
    // la somma delle righe e quello stato erano lo stesso numero.
    //
    // Non lo sono più, e la ragione è precisa e non è un allentamento: da
    // quando `esito-ricerca` parla soltanto con una riga selezionata, il suo
    // massimo (48,5 px) si raggiunge in uno stato — `riga-selezionata` — che
    // NON è il peggiore; nel peggiore, che ha la ricerca svuotata, quel nodo è
    // muto e ne consuma 14. Un'allocazione è il massimo che un blocco
    // RAGGIUNGE, non il massimo che raggiunge quel giorno lì: abbassarla a 14
    // renderebbe rossa una schermata sana.
    //
    // Lo scarto resta piccolo e sorvegliato — se qualcuno alzasse una riga
    // senza restituire niente crescerebbe, e questa soglia diventerebbe rossa.
    const slack = CALL_SCREEN_ALLOCATED_PX - worst!.spanPx;
    expect(slack).toBeGreaterThan(0);
    expect(slack, "lo scarto fra la somma delle righe e lo stato peggiore").toBeLessThanOrEqual(
      60,
    );
  });

  it("la guardia totale di #333 non li vedeva: misura solo lo stato di boot", () => {
    expect(CALL_SCREEN_OVER_BUDGET_STATES.map((s) => s.state)).not.toContain("ricerca");
  });
});

describe("le scelte che restano tali", () => {
  it("ogni voce non ratificata porta il proprio perché, macchina-leggibile", () => {
    const ids: readonly CallScreenBudgetUnratifiedId[] = [
      "NOME_GIOCATORE_LUNGHEZZA_NON_DICHIARATA",
      "CONTESTO_CHIAMATA_APERTO_NON_DICHIARATO",
      "LISTONE_COLONNE_DEFAULT_NON_DICHIARATE",
      "RISERVA_NEGATIVA_SENZA_PROPRIETARIO",
      "SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA",
      "MISURE_LEGATE_AL_RENDERING_PINNATO",
      // La barra fissa del 2026-08-29: il totale non contabilizza più i suoi
      // 152 px, che vivono adesso in un budget senza guardie.
      "BARRA_FISSA_FUORI_DAL_TOTALE",
      // Era PROVA_1_MARGINE_ESAURITO fino al 2026-08-29, e diceva il contrario:
      // il margine è risalito da 2 a 115 px, ma per un trasloco e non per una
      // riparazione. Un identificativo che dice «esaurito» su un margine di 115
      // px sarebbe una voce che mente.
      "PROVA_1_MARGINE_RIAPERTO_SENZA_RIPAGARE",
    ];
    // Stesso patto di UNRATIFIED_CHOICES nel motore: l'elenco del tipo e
    // l'elenco del dato non possono divergere, e nessuna voce può essere muta.
    expect(Object.keys(CALL_SCREEN_BUDGET_UNRATIFIED).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(CALL_SCREEN_BUDGET_UNRATIFIED[id].length, id).toBeGreaterThan(0);
  });

  // ERA «e sfora in entrambi i casi». Dal 2026-08-30 non sfora più: la colonna
  // della chiamata ha perso 103 px (il contatore delle interazioni e
  // l'istruzione di ricerca sempre a schermo) e i due pin sono rientrati.
  // L'aritmetica resta sorvegliata alla lettera; il SEGNO no, perché adesso è
  // un fatto misurato e non una premessa.
  it("la lunghezza dei nomi è pinnata a 18 e 22 caratteri, con la sua distanza dal totale", () => {
    expect(CALL_SCREEN_NAME_LENGTH_PINS.map((p) => p.chars)).toEqual([18, 22]);
    for (const pin of CALL_SCREEN_NAME_LENGTH_PINS) {
      expect(pin.spanPx - CALL_SCREEN_VERTICAL_BUDGET_PX, `${pin.chars} caratteri`).toBe(
        pin.deltaFromBudgetPx,
      );
    }
    // E il margine che resta è SOTTILE, non comodo: il pin più stretto sta
    // dentro per meno del 2% del totale. Se qualcuno lo allargasse per
    // distrazione questa riga non se ne accorgerebbe; se qualcuno lo
    // consumasse, sì.
    const worst = Math.max(...CALL_SCREEN_NAME_LENGTH_PINS.map((p) => p.deltaFromBudgetPx));
    expect(worst).toBeLessThan(0);
    expect(Math.abs(worst) / CALL_SCREEN_VERTICAL_BUDGET_PX).toBeLessThan(0.02);
  });
});

describe("la spazzata che attribuisce", () => {
  it("su main, allo stato misurato, non trova niente da attribuire", () => {
    expect(callScreenBudgetFindings(healthySweep())).toEqual([]);
  });

  // PROVA 1 — la guardia per blocco morde PRIMA del totale: una riga di testo
  // in più (17px) supera l'allocazione del blocco pur restando ben dentro le
  // due schermate.
  it("una riga di testo in più a un blocco esistente lo nomina, e nomina solo lui", () => {
    const findings = callScreenBudgetFindings(
      healthySweep({
        spanPx: 1470 + 17.25,
        blocks: healthySweep().blocks.map((b) =>
          b.domId === "suggested-player" ? block(b.domId, 281 + 17.25) : b,
        ),
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "oltre-allocazione",
      id: "giocatore-suggerito",
      consumptionPx: 298,
      allocationPx: 281,
      overflowPx: 17,
    });
    expect(describeCallScreenBudgetFinding(findings[0]!)).toContain("giocatore-suggerito");
    expect(describeCallScreenBudgetFinding(findings[0]!)).toContain("+17px");
  });

  // PROVA 2 — un blocco finto montato nella colonna: rosso per «senza riga nel
  // mastro», mai per sforamento. I due fallimenti dicono cose diverse e non
  // vanno confusi.
  it("un blocco a schermo senza riga nel mastro è rosso col suo nome, la sua altezza e la riserva", () => {
    const findings = callScreenBudgetFindings(
      healthySweep({
        blocks: [...healthySweep().blocks, block("blocco-finto", 40)],
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "blocco-senza-riga",
      domId: "blocco-finto",
      consumptionPx: 40,
      reservePx: CALL_SCREEN_BUDGET_RESERVE_PX,
    });
    const line = describeCallScreenBudgetFinding(findings[0]!);
    expect(line).toContain("blocco-finto");
    expect(line).toContain("40px");
    expect(line).toContain("-932px");
  });

  it("un blocco senza id non scappa: viene nominato per forma", () => {
    const findings = callScreenBudgetFindings(
      healthySweep({
        blocks: [
          ...healthySweep().blocks,
          { domId: "", description: "section.nuovo-pannello", consumptionPx: 90 },
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    expect(describeCallScreenBudgetFinding(findings[0]!)).toContain("section.nuovo-pannello");
  });

  // PROVA 3 — una riga tolta al listone rompe l'UGUAGLIANZA DERIVATA, non un
  // `<=`: il consumo scende (starebbe comodo sotto l'allocazione) e il rosso
  // arriva lo stesso, perché la forma non è più quella dichiarata.
  it("una riga in meno nel listone rompe l'uguaglianza derivata, non un tetto", () => {
    const sweep = healthySweep({
      spanPx: 1572.5 - 92.5,
      blocks: healthySweep().blocks.map((b) =>
        b.domId === "listone-block" ? block(b.domId, b.consumptionPx - 92.5) : b,
      ),
      listone: { rowCount: LISTONE_PAGE_SIZE - 1, rowHeightPx: 92.5, headPx: 233, tailPx: 13 },
    });
    const findings = callScreenBudgetFindings(sweep);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "forma-listone",
      part: "righe",
      measured: LISTONE_PAGE_SIZE - 1,
      declared: LISTONE_PAGE_SIZE,
    });
    // E il consumo, da solo, sarebbe passato: è la prova che il `<=` non basta.
    expect(1171 - 92.5).toBeLessThan(LISTONE_ALLOCATION_PX);
  });

  it("una colonna in più che manda a capo nomina IL LISTONE, non l'ultimo blocco arrivato", () => {
    const findings = callScreenBudgetFindings(
      healthySweep({
        listone: { rowCount: LISTONE_PAGE_SIZE, rowHeightPx: 112.5, headPx: 233, tailPx: 13 },
        blocks: healthySweep().blocks.map((b) =>
          b.domId === "listone-block" ? block(b.domId, 1351) : b,
        ),
      }),
    );
    expect(findings.map((f) => f.kind).sort()).toEqual(["forma-listone", "oltre-allocazione"]);
    const shape = findings.find((f) => f.kind === "forma-listone");
    expect(shape).toMatchObject({ part: "altezza-riga", measured: 113, declared: LISTONE_ROW_PX });
    expect(describeCallScreenBudgetFinding(shape!)).toContain("LISTONE");
  });

  // PROVA 4 — l'anti-vacuità. Una spazzata che non trova niente passerebbe per
  // vuoto: è un difetto che questo repository ha già pagato.
  it("una schermata svuotata rompe l'anti-vacuità, non passa per vuoto", () => {
    const findings = callScreenBudgetFindings(healthySweep({ blocks: [], listone: null }));
    expect(findings.some((f) => f.kind === "spazzata-vuota")).toBe(true);
    // E ogni riga obbligatoria dello stato viene nominata una per una.
    const missing = findings.flatMap((f) => (f.kind === "riga-senza-blocco" ? [f.id] : []));
    expect(missing).toEqual([
      "intestazione-ricerca",
      "ricerca",
      "esito-ricerca",
      "giocatore-suggerito",
      "listone",
    ]);
  });

  it("un blocco sparito nello stato in cui deve esserci è rosso col suo nome", () => {
    const findings = callScreenBudgetFindings(
      healthySweep({
        blocks: healthySweep().blocks.filter((b) => b.domId !== "call-search-hint"),
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "riga-senza-blocco", id: "esito-ricerca" });
  });

  it("dove il listone non mostra una pagina piena la forma non si pretende", () => {
    // `riga-selezionata`: il filtro lascia una riga sola. Un'uguaglianza a
    // dieci righe qui sarebbe falsa, e una guardia falsa la disattiva qualcuno.
    const sweep: CallScreenSweep = {
      state: "riga-selezionata",
      spanPx: 874.25,
      blocks: [
        block("call-screen-eyebrow", 18),
        block("call-search-row", 0),
        block("call-search-hint", 48.5),
        block("nomination-context", 151.5),
        // Il riquadro INSIGHT GIOCATORE è obbligatorio in ogni stato con una
        // riga selezionata dal 2026-08-26: senza di lui la spazzata sarebbe
        // rossa per «riga-senza-blocco», ed è la guardia che lo pretende.
        block("suggested-player", 281),
        block("listone-block", 338.5),
      ],
      listone: { rowCount: 1, rowHeightPx: 92.5, headPx: 233, tailPx: 13 },
    };
    expect(callScreenBudgetFindings(sweep)).toEqual([]);
  });

  it("il contesto aperto sta esattamente sulla propria allocazione: un pixel in più è rosso", () => {
    const open = (consumption: number): CallScreenSweep => ({
      state: "contesto-aperto",
      spanPx: 1782,
      blocks: [
        block("call-screen-eyebrow", 18),
        block("call-search-row", 0),
        block("call-search-hint", 48.5),
        block("nomination-context", consumption),
        block("suggested-player", 281),
        block("listone-block", 338.5),
      ],
      listone: { rowCount: 1, rowHeightPx: 92.5, headPx: 233, tailPx: 13 },
    });
    expect(callScreenBudgetFindings(open(1096.25))).toEqual([]);
    expect(callScreenBudgetFindings(open(1097.5))[0]).toMatchObject({
      kind: "oltre-allocazione",
      id: "contesto-chiamata",
      overflowPx: 2,
    });
  });
});

describe("il messaggio che oggi manca alla guardia totale", () => {
  it("dice lo span, il totale, e CHI è oltre la propria allocazione", () => {
    const msg = callScreenBudgetAttribution(
      healthySweep({
        spanPx: 1700,
        blocks: healthySweep().blocks.map((b) =>
          b.domId === "suggested-player" ? block(b.domId, 320) : b,
        ),
      }),
      CALL_SCREEN_BUDGET_VIEWPORT.height,
    );
    expect(msg).toContain("lo span è 1700px su 1688px");
    expect(msg).toContain("giocatore-suggerito");
    expect(msg).toContain("+39px");
  });

  it("quando nessun blocco sfora lo dice, invece di tacere", () => {
    const msg = callScreenBudgetAttribution(healthySweep(), CALL_SCREEN_BUDGET_VIEWPORT.height);
    expect(msg).toContain("lo span è 1470px su 1688px");
    expect(msg).toContain("nessun blocco è oltre la propria allocazione");
  });

  it("nomina il peggiore quando ce n'è più di uno", () => {
    const msg = callScreenBudgetAttribution(
      healthySweep({
        blocks: healthySweep().blocks.map((b) =>
          b.domId === "suggested-player"
            ? block(b.domId, 400)
            : b.domId === "call-search-hint"
              ? block(b.domId, 100)
              : b,
        ),
      }),
      CALL_SCREEN_BUDGET_VIEWPORT.height,
    );
    // +119px contro +51px: il messaggio nomina UNO, e nomina il peggiore.
    expect(msg).toContain("giocatore-suggerito");
    expect(msg).toContain("+119px");
    expect(msg).not.toContain("esito-ricerca");
  });
});

describe("gli stati della schermata sono dichiarati, non improvvisati", () => {
  it("ogni stato ha etichetta e dice se il listone è a pagina piena", () => {
    const ids: readonly CallScreenState[] = [
      "ricerca",
      "riga-selezionata",
      "contesto-aperto",
      "contesto-aperto-ricerca-vuota",
      "listone-non-caricabile",
    ];
    expect(CALL_SCREEN_STATES.map((s) => s.id)).toEqual(ids);
    for (const s of CALL_SCREEN_STATES) expect(s.label.length, s.id).toBeGreaterThan(0);
    expect(CALL_SCREEN_STATES.filter((s) => s.listoneFullPage).map((s) => s.id)).toEqual([
      "ricerca",
      "contesto-aperto-ricerca-vuota",
    ]);
  });

  // IL TAVOLO È SEMPRE APERTO dal 2026-08-26: uno stato «tavolo aperto»
  // distinto da `ricerca` dichiarerebbe una differenza che la schermata non ha
  // più. Questo test è ciò che impedisce di rimetterlo per abitudine, o di
  // ricomparire con un altro nome: il mastro non deve MAI dichiarare uno stato
  // irraggiungibile, perché una riga che non si può misurare è una riga che
  // nessuno può smentire.
  it("non dichiara nessuno stato del tavolo: aperto è l'unico che esiste", () => {
    const ids = CALL_SCREEN_STATES.map((s) => s.id);
    expect(ids).not.toContain("tavolo-aperto" as CallScreenState);
    expect(ids.filter((id) => id.includes("tavolo"))).toEqual([]);
  });
});
