// IL COMPILATORE DI SCHEDE, MISURATO SUL LAYER PURO.
//
// Che cosa deve garantire, in una frase: chi compila non può produrre un
// deposito che il contratto rifiuta, e non può perdere il lavoro senza
// saperlo. Tutto il resto di questo file è la stessa frase, un pezzo alla
// volta.
//
// Solo fixture sintetiche — «Dario Placeholder», «ClubQuattro» — come
// src/expertScheda.test.ts e src/schedaLinks.test.ts. Nessun giocatore reale,
// nessuna squadra reale, nessun handle, nessun URL.
//
// Fake in memoria, mai `localStorage` vero: stessa postura di
// src/leagueTeams.test.ts, src/confirmationsStore.test.ts e
// src/schedaLinks.test.ts.

import { describe, expect, it } from "vitest";
import {
  EMPTY_SCHEDA_FORM,
  NO_SCHEDA_DRAFTS,
  SCHEDA_DEPOSIT_FILENAME,
  SCHEDA_DRAFTS_SCHEMA_VERSION,
  SCHEDA_DRAFTS_STORAGE_KEY,
  applySchedaImport,
  buildScheda,
  buildSchedaDeposit,
  loadSchedaDrafts,
  planSchedaImport,
  saveSchedaDrafts,
  schedaProgress,
  schedaSummary,
  schedaToForm,
  withEditing,
  withScheda,
  type SchedaDraftState,
  type SchedaFormValues,
} from "./schedaCompiler.js";
import {
  EXPERT_SCHEDA_SCHEMA_VERSION,
  SCHEDA_GERARCHIA_MAX,
  SCHEDA_NOTA_MAX,
  SCHEDA_PERCENTUALE_MAX,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
  type ExpertScheda,
} from "./expertScheda.js";
import { listonePlayerKey } from "./ui/listone.js";
import type { StorageLike } from "./logRecovery.js";

const TARGET = { name: "Dario Placeholder", club: "ClubQuattro" } as const;
const ROW_KEY = listonePlayerKey({ name: TARGET.name, club: TARGET.club });

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  constructor(private readonly mode: "ok" | "throw-write" | "throw-read" | "silent-drop" = "ok") {}
  getItem(key: string): string | null {
    if (this.mode === "throw-read") throw new Error("storage non leggibile");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.mode === "throw-write") throw new Error("quota");
    if (this.mode === "silent-drop") return;
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  seed(raw: string): void {
    this.map.set(SCHEDA_DRAFTS_STORAGE_KEY, raw);
  }
  rawStored(): string | null {
    return this.map.get(SCHEDA_DRAFTS_STORAGE_KEY) ?? null;
  }
}

function form(overrides: Partial<SchedaFormValues> = {}): SchedaFormValues {
  return { ...EMPTY_SCHEDA_FORM, ...overrides };
}

function builtScheda(overrides: Partial<SchedaFormValues> = {}): ExpertScheda {
  const result = buildScheda(TARGET, form(overrides));
  if (!result.ok) throw new Error(`scheda non costruita: ${JSON.stringify(result.errors)}`);
  return result.scheda;
}

function stateWith(entries: readonly (readonly [string, ExpertScheda])[]): SchedaDraftState {
  return { schede: new Map(entries), editing: null };
}

describe("costruire una scheda dal modulo compilato", () => {
  it("prende nome e squadra dalla RIGA DI LISTONE, non da un campo di testo", () => {
    const scheda = builtScheda({ titolarita: "titolare" });
    expect(scheda.player).toBe(TARGET.name);
    expect(scheda.club).toBe(TARGET.club);
  });

  it("la scheda costruita si aggancia davvero alla riga da cui è stata scritta", () => {
    // Il difetto che questa schermata esiste per rendere impossibile: una
    // scheda scritta, salvata, depositata e MAI resa perché l'identità non
    // combacia con nessuna riga.
    const deposit = buildSchedaDeposit(new Map([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]));
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    const store = parseExpertSchedaDeposit(deposit.text);
    const view = resolveExpertInsight(store, TARGET);
    expect(view.availability).toBe("available");
    expect(view.titolarita).toBe("titolare");
  });

  it("una scheda con la sola nota è valida: bastano due righe di prosa", () => {
    const scheda = builtScheda({ nota: "  Rientro previsto dopo la sosta.  " });
    expect(scheda.nota).toBe("Rientro previsto dopo la sosta.");
    expect(scheda.titolarita).toBeUndefined();
  });

  it("mette i valori multipli nell'ordine del VOCABOLARIO, non in quello dei clic", () => {
    const a = builtScheda({ piazzati: ["angoli", "punizioni"], avvisi: ["mercato", "sconsigliato"] });
    const b = builtScheda({ piazzati: ["punizioni", "angoli"], avvisi: ["sconsigliato", "mercato"] });
    expect(a.piazzati).toEqual(["punizioni", "angoli"]);
    expect(a.avvisi).toEqual(["sconsigliato", "mercato"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("non scrive le chiavi dei campi lasciati vuoti", () => {
    const scheda = builtScheda({ nota: "Solo prosa." });
    expect(Object.keys(scheda)).toEqual(["player", "club", "nota"]);
  });

  it("una scheda piena passa il contratto campo per campo", () => {
    const scheda = builtScheda({
      titolarita: "ballottaggio",
      percentuale: "60",
      gerarchia: "2",
      rigori: "possibile",
      piazzati: ["punizioni"],
      avvisi: ["rischio_fisico"],
      nota: "Ballottaggio aperto fino alla rifinitura.",
      aggiornata: "2026-08-30",
      fonte: "staff",
    });
    expect(scheda).toEqual({
      player: TARGET.name,
      club: TARGET.club,
      titolarita: "ballottaggio",
      percentuale: 60,
      gerarchia: 2,
      rigori: "possibile",
      piazzati: ["punizioni"],
      avvisi: ["rischio_fisico"],
      nota: "Ballottaggio aperto fino alla rifinitura.",
      aggiornata: "2026-08-30",
      fonte: "staff",
    });
  });
});

describe("i rifiuti, uno per campo e tutti insieme", () => {
  it("rifiuta una percentuale fuori scala, dicendo quale scala", () => {
    const result = buildScheda(TARGET, form({ titolarita: "ballottaggio", percentuale: "101" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("percentuale");
    expect(result.errors[0]?.message).toContain(String(SCHEDA_PERCENTUALE_MAX));
  });

  it("rifiuta una percentuale che non è un intero", () => {
    for (const raw of ["60,5", "60.5", "1e2", "sessanta", " "]) {
      const result = buildScheda(TARGET, form({ titolarita: "ballottaggio", percentuale: raw }));
      // " " è spazio: si legge come «campo vuoto», e un campo vuoto è legittimo
      // solo perché la titolarità da sola è una scheda valida.
      if (raw.trim() === "") {
        expect(result.ok).toBe(true);
        continue;
      }
      expect(result.ok, `«${raw}» doveva essere rifiutato`).toBe(false);
    }
  });

  it("rifiuta una percentuale SENZA titolarità: il riquadro non la mostrerebbe", () => {
    const result = buildScheda(TARGET, form({ percentuale: "60" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["percentuale"]);
    expect(result.errors[0]?.message).toContain("titolarità");
  });

  it("rifiuta una gerarchia fuori scala", () => {
    const result = buildScheda(TARGET, form({ gerarchia: String(SCHEDA_GERARCHIA_MAX + 1) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["gerarchia"]);
  });

  it("una nota troppo lunga viene RIFIUTATA, mai troncata in silenzio", () => {
    const nota = "x".repeat(SCHEDA_NOTA_MAX + 7);
    const result = buildScheda(TARGET, form({ nota }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["nota"]);
    expect(result.errors[0]?.message).toContain("7");
  });

  it("una nota esattamente al limite passa", () => {
    const scheda = builtScheda({ nota: "x".repeat(SCHEDA_NOTA_MAX) });
    expect(scheda.nota).toHaveLength(SCHEDA_NOTA_MAX);
  });

  it("rifiuta una data che non esiste sul calendario", () => {
    const result = buildScheda(TARGET, form({ nota: "Nota.", aggiornata: "2026-02-30" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["aggiornata"]);
  });

  it("rifiuta un valore fuori dal vocabolario, campo per campo", () => {
    const result = buildScheda(
      TARGET,
      form({ titolarita: "panchinaro", rigori: "forse", fonte: "twitter", piazzati: ["rimesse"], avvisi: ["boh"] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field).sort()).toEqual(
      ["avvisi", "fonte", "piazzati", "rigori", "titolarita"].sort(),
    );
  });

  it("rende TUTTI i motivi insieme, non solo il primo", () => {
    const result = buildScheda(TARGET, form({ percentuale: "999", gerarchia: "0", aggiornata: "ieri" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["percentuale", "gerarchia", "aggiornata"]);
  });

  it("rifiuta una scheda che non dice niente: aperta non è compilata", () => {
    const result = buildScheda(TARGET, form());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["scheda"]);
  });

  it("una data o una fonte da sole NON sono contenuto", () => {
    // `schedaHasContent` non le conta, e il riquadro renderebbe «nessun
    // segnale esperto»: il rifiuto qui è la stessa regola, detta prima.
    const result = buildScheda(TARGET, form({ aggiornata: "2026-08-30", fonte: "scheda" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["scheda"]);
  });

  it("rifiuta una riga di listone senza identità", () => {
    const result = buildScheda({ name: "  ", club: "ClubQuattro" }, form({ nota: "Nota." }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["identita"]);
  });

  it("rifiuta un'identità che il contratto non accetterebbe per lunghezza", () => {
    const result = buildScheda({ name: "D".repeat(81), club: "ClubQuattro" }, form({ nota: "Nota." }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["identita"]);
  });
});

describe("riaprire una scheda salvata", () => {
  it("il modulo ricostruito rende la stessa scheda", () => {
    const values = form({
      titolarita: "titolare",
      percentuale: "80",
      gerarchia: "1",
      rigori: "designato",
      piazzati: ["punizioni", "angoli"],
      avvisi: ["mercato"],
      nota: "Trattativa aperta.",
      aggiornata: "2026-08-30",
      fonte: "scheda",
    });
    const first = buildScheda(TARGET, values);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = buildScheda(TARGET, schedaToForm(first.scheda));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.scheda).toEqual(first.scheda);
  });
});

describe("l'archivio locale: il lavoro non si perde, e quando si perde si sa", () => {
  it("una scheda salvata si rilegge dopo il boot successivo", () => {
    const storage = new MemoryStorage();
    const scheda = builtScheda({ titolarita: "titolare" });
    expect(saveSchedaDrafts(storage, stateWith([[ROW_KEY, scheda]]))).toBe(true);
    const reloaded = loadSchedaDrafts(storage);
    expect(reloaded.schede.get(ROW_KEY)).toEqual(scheda);
  });

  it("anche la scheda APERTA e non salvata sopravvive al reload", () => {
    const storage = new MemoryStorage();
    const editing = { rowKey: ROW_KEY, values: form({ nota: "Sto ancora scrivendo" }) };
    expect(saveSchedaDrafts(storage, withEditing(NO_SCHEDA_DRAFTS, editing))).toBe(true);
    expect(loadSchedaDrafts(storage).editing).toEqual(editing);
  });

  it("conserva l'ordine in cui le schede sono state scritte", () => {
    const storage = new MemoryStorage();
    const other = { name: "Ugo Placeholder", club: "ClubQuattro" } as const;
    const otherKey = listonePlayerKey(other);
    const first = builtScheda({ titolarita: "titolare" });
    const second = buildScheda(other, form({ titolarita: "riserva" }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    saveSchedaDrafts(storage, stateWith([[ROW_KEY, first], [otherKey, second.scheda]]));
    expect([...loadSchedaDrafts(storage).schede.keys()]).toEqual([ROW_KEY, otherKey]);
  });

  it("rende false quando la scrittura non attecchisce", () => {
    // Lo storage accetta setItem e non conserva niente: senza la rilettura di
    // controllo, due ore di lavoro sparirebbero senza un solo errore.
    const dropping = new MemoryStorage("silent-drop");
    expect(saveSchedaDrafts(dropping, stateWith([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]))).toBe(false);
  });

  it("rende false quando lo storage lancia", () => {
    const throwing = new MemoryStorage("throw-write");
    expect(saveSchedaDrafts(throwing, stateWith([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]))).toBe(false);
  });

  it("un archivio illeggibile rende ZERO schede, mai un elenco parziale", () => {
    for (const raw of [
      "{",
      "null",
      '{"schemaVersion":2,"entries":[],"editing":null}',
      '{"schemaVersion":1,"entries":[],"editing":null,"extra":1}',
      '{"schemaVersion":1,"entries":[{"rowKey":"x","scheda":{"player":"Dario Placeholder"}}],"editing":null}',
      '{"schemaVersion":1,"entries":[{"rowKey":"x","scheda":{"player":"Dario Placeholder","club":"ClubQuattro","value":9}}],"editing":null}',
    ]) {
      const storage = new MemoryStorage();
      storage.seed(raw);
      expect(loadSchedaDrafts(storage).schede.size, `«${raw.slice(0, 40)}» doveva rendere zero schede`).toBe(0);
    }
  });

  it("due schede sulla stessa riga di listone rendono l'archivio vuoto invece di sceglierne una", () => {
    const scheda = { player: TARGET.name, club: TARGET.club, titolarita: "titolare" };
    const storage = new MemoryStorage();
    storage.seed(
      JSON.stringify({
        schemaVersion: SCHEDA_DRAFTS_SCHEMA_VERSION,
        entries: [
          { rowKey: ROW_KEY, scheda },
          { rowKey: ROW_KEY, scheda: { ...scheda, titolarita: "riserva" } },
        ],
        editing: null,
      }),
    );
    expect(loadSchedaDrafts(storage).schede.size).toBe(0);
  });

  it("una scheda APERTA malformata non porta con sé le schede SALVATE", () => {
    // L'unica asimmetria dell'archivio, e la sua ragione: il lavoro vero sono
    // le schede salvate. Perderle per un modulo a metà sarebbe il contrario
    // della promessa di questa schermata.
    const storage = new MemoryStorage();
    const scheda = builtScheda({ titolarita: "titolare" });
    saveSchedaDrafts(storage, stateWith([[ROW_KEY, scheda]]));
    const stored = JSON.parse(storage.rawStored() as string) as Record<string, unknown>;
    stored["editing"] = { rowKey: ROW_KEY, values: { nota: 42 } };
    storage.seed(JSON.stringify(stored));
    const reloaded = loadSchedaDrafts(storage);
    expect(reloaded.schede.get(ROW_KEY)).toEqual(scheda);
    expect(reloaded.editing).toBeNull();
  });

  it("uno storage che lancia in lettura rende l'archivio vuoto senza propagare", () => {
    expect(loadSchedaDrafts(new MemoryStorage("throw-read"))).toEqual(NO_SCHEDA_DRAFTS);
  });

  it("aggiunge, sostituisce e cancella senza toccare la mappa ricevuta", () => {
    const scheda = builtScheda({ titolarita: "titolare" });
    const base = stateWith([[ROW_KEY, scheda]]);
    const corrected = buildScheda(TARGET, form({ titolarita: "riserva" }));
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    const replaced = withScheda(base, ROW_KEY, corrected.scheda);
    expect(replaced.schede.get(ROW_KEY)?.titolarita).toBe("riserva");
    expect(base.schede.get(ROW_KEY)?.titolarita).toBe("titolare");
    expect(withScheda(base, ROW_KEY, null).schede.size).toBe(0);
    expect(base.schede.size).toBe(1);
  });
});

describe("l'avanzamento delle due ore", () => {
  it("conta le righe scritte e quelle che mancano", () => {
    const rows = ["a", "b", "c", "d"];
    const progress = schedaProgress(rows, new Map([["a", builtScheda({ nota: "Nota." })]]));
    expect(progress).toEqual({ total: 4, written: 1, missing: 3, orphans: 0, percent: 25 });
  });

  it("conta a parte le schede su righe che il listone caricato non ha", () => {
    const progress = schedaProgress(["a"], new Map([["z", builtScheda({ nota: "Nota." })]]));
    expect(progress.written).toBe(0);
    expect(progress.orphans).toBe(1);
  });

  it("senza listone non c'è avanzamento su niente", () => {
    expect(schedaProgress([], new Map()).percent).toBe(0);
  });
});

describe("il deposito pronto", () => {
  it("il testo prodotto passa il contratto vero", () => {
    const scheda = builtScheda({ titolarita: "titolare", nota: "Nota." });
    const result = buildSchedaDeposit(new Map([[ROW_KEY, scheda]]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(1);
    const parsed = JSON.parse(result.text) as { schemaVersion: number; schede: unknown[] };
    expect(parsed.schemaVersion).toBe(EXPERT_SCHEDA_SCHEMA_VERSION);
    expect(parsed.schede).toHaveLength(1);
    expect(parseExpertSchedaDeposit(result.text).ok).toBe(true);
  });

  it("senza schede non offre un file: lo dice", () => {
    const result = buildSchedaDeposit(new Map());
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  it("rifiuta due schede sulla stessa identità, nominandola", () => {
    // Sarebbe un file VALIDO che a schermo non mostra niente:
    // `resolveExpertInsight` rende `identity_not_resolved`. Due schede
    // scritte, zero lette.
    const scheda = builtScheda({ titolarita: "titolare" });
    const result = buildSchedaDeposit(
      new Map([
        ["proxy:1", scheda],
        ["proxy:2", { ...scheda, titolarita: "riserva" } as ExpertScheda],
      ]),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("duplicate");
    if (result.reason !== "duplicate") return;
    expect(result.identities).toEqual([`${TARGET.name} (${TARGET.club})`]);
  });

  it("il file si chiama come il deposito che il privato legge", () => {
    expect(SCHEDA_DEPOSIT_FILENAME).toBe("schede_gruppo_esperti.json");
  });
});

describe("riprendere un deposito già scritto", () => {
  const OTHER = { name: "Ugo Placeholder", club: "ClubQuattro" } as const;
  const OTHER_KEY = listonePlayerKey(OTHER);
  const ROWS = [
    { rowKey: ROW_KEY, name: TARGET.name, club: TARGET.club },
    { rowKey: OTHER_KEY, name: OTHER.name, club: OTHER.club },
  ];

  /** Il testo che il pannello scarica davvero, non un JSON scritto a mano. */
  function depositOf(schede: readonly ExpertScheda[]): string {
    const built = buildSchedaDeposit(new Map(schede.map((s, i) => [`k${i}`, s])));
    if (!built.ok) throw new Error(`deposito non costruito: ${built.reason}`);
    return built.text;
  }

  it("il giro si chiude: quello che esce rientra identico", () => {
    // La prova che andata e ritorno sono la stessa cosa: due schede scritte,
    // esportate, rilette in un archivio VUOTO — come su un browser pulito o su
    // un'altra macchina, che è il caso in cui oggi le due ore sparivano.
    const first = builtScheda({ titolarita: "titolare", nota: "Prima." });
    const second = buildScheda(OTHER, form({ titolarita: "riserva" }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const text = depositOf([first, second.scheda]);

    const planned = planSchedaImport(text, ROWS, new Map());
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.conflicts).toEqual([]);
    expect(planned.plan.fresh.map((e) => e.player)).toEqual([TARGET.name, OTHER.name]);

    const applied = applySchedaImport(new Map(), planned.plan, null);
    expect(applied).not.toBeNull();
    expect(applied?.get(ROW_KEY)).toEqual(first);
    expect(applied?.get(OTHER_KEY)).toEqual(second.scheda);
  });

  it("riaggancia la scheda alla RIGA del listone, anche quando la chiave è un proxy", () => {
    // Il deposito porta nome+squadra, non la chiave di riga: senza l'indice
    // costruito nel verso giusto, una riga con `proxyId` non ritroverebbe mai
    // la propria scheda.
    const scheda = builtScheda({ titolarita: "titolare" });
    const proxyRows = [{ rowKey: "proxy:77", name: TARGET.name, club: TARGET.club }];
    const planned = planSchedaImport(depositOf([scheda]), proxyRows, new Map());
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect([...planned.plan.incoming.keys()]).toEqual(["proxy:77"]);
    expect(planned.plan.fresh[0]?.matched).toBe(true);
  });

  it("una scheda senza riga nel listone non si perde: entra e viene contata a parte", () => {
    const scheda = builtScheda({ titolarita: "titolare" });
    const planned = planSchedaImport(depositOf([scheda]), [], new Map());
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.unmatched.map((e) => e.player)).toEqual([TARGET.name]);
    expect(planned.plan.incoming.get(ROW_KEY)).toEqual(scheda);
  });

  it("un file illeggibile o non conforme NON tocca niente e dice perché", () => {
    const local = new Map([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]);
    const refusals: readonly (readonly [string | null, string])[] = [
      [null, "absent"],
      ["{", "unreadable"],
      ['{"schemaVersion":2,"schede":[]}', "invalid"],
      ['{"schemaVersion":1,"schede":[{"player":"Dario Placeholder"}]}', "invalid"],
      ['{"schemaVersion":1,"schede":[{"player":"Dario Placeholder","club":"ClubQuattro","value":9}]}', "invalid"],
      ['{"schemaVersion":1,"schede":[]}', "empty"],
    ];
    for (const [raw, reason] of refusals) {
      const planned = planSchedaImport(raw, ROWS, local);
      expect(planned.ok, `«${String(raw).slice(0, 30)}» doveva essere rifiutato`).toBe(false);
      if (planned.ok) continue;
      expect(planned.reason, `«${String(raw).slice(0, 30)}»`).toBe(reason);
    }
    // E l'archivio locale è ancora quello di prima: il rifiuto non è distruttivo.
    expect(local.size).toBe(1);
  });

  it("rifiuta un file con due schede sulla stessa identità, nominandola", () => {
    const scheda = { player: TARGET.name, club: TARGET.club, titolarita: "titolare" };
    const raw = JSON.stringify({
      schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION,
      schede: [scheda, { ...scheda, titolarita: "riserva" }],
    });
    const planned = planSchedaImport(raw, ROWS, new Map());
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toBe("duplicate");
    if (planned.reason !== "duplicate") return;
    expect(planned.identities).toEqual([`${TARGET.name} (${TARGET.club})`]);
  });

  it("separa le schede nuove da quelle in conflitto", () => {
    const local = new Map([[ROW_KEY, builtScheda({ titolarita: "titolare", nota: "La mia." })]]);
    const fromFile = builtScheda({ titolarita: "riserva", nota: "Quella del file." });
    const other = buildScheda(OTHER, form({ titolarita: "titolare" }));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const planned = planSchedaImport(depositOf([fromFile, other.scheda]), ROWS, local);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.conflicts.map((e) => e.player)).toEqual([TARGET.name]);
    expect(planned.plan.fresh.map((e) => e.player)).toEqual([OTHER.name]);
  });

  it("SENZA una decisione sui conflitti non fonde niente: rende null", () => {
    // Il cuore della regola. Una fusione automatica sceglierebbe per Pico
    // esattamente dove la scelta costa del lavoro.
    const local = new Map([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]);
    const planned = planSchedaImport(depositOf([builtScheda({ titolarita: "riserva" })]), ROWS, local);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(applySchedaImport(local, planned.plan, null)).toBeNull();
  });

  it("«tieni le mie» conserva le locali in conflitto e fa entrare comunque le nuove", () => {
    const mine = builtScheda({ titolarita: "titolare", nota: "La mia." });
    const local = new Map([[ROW_KEY, mine]]);
    const fromFile = builtScheda({ titolarita: "riserva", nota: "Quella del file." });
    const other = buildScheda(OTHER, form({ titolarita: "titolare" }));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const planned = planSchedaImport(depositOf([fromFile, other.scheda]), ROWS, local);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const applied = applySchedaImport(local, planned.plan, "keep-local");
    expect(applied?.get(ROW_KEY)).toEqual(mine);
    expect(applied?.get(OTHER_KEY)).toEqual(other.scheda);
  });

  it("«usa quelle del file» sostituisce SOLO le schede in conflitto", () => {
    const mine = builtScheda({ titolarita: "titolare", nota: "La mia." });
    const untouched = buildScheda(OTHER, form({ nota: "Scritta stasera, non nel file." }));
    expect(untouched.ok).toBe(true);
    if (!untouched.ok) return;
    const local = new Map([
      [ROW_KEY, mine],
      [OTHER_KEY, untouched.scheda],
    ]);
    const fromFile = builtScheda({ titolarita: "riserva", nota: "Quella del file." });
    const planned = planSchedaImport(depositOf([fromFile]), ROWS, local);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const applied = applySchedaImport(local, planned.plan, "take-file");
    expect(applied?.get(ROW_KEY)).toEqual(fromFile);
    // Ciò che il file non nomina resta intatto: importare non è azzerare.
    expect(applied?.get(OTHER_KEY)).toEqual(untouched.scheda);
  });

  it("non tocca la mappa che riceve", () => {
    const local = new Map([[ROW_KEY, builtScheda({ titolarita: "titolare" })]]);
    const planned = planSchedaImport(depositOf([builtScheda({ titolarita: "riserva" })]), ROWS, local);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    applySchedaImport(local, planned.plan, "take-file");
    expect(local.get(ROW_KEY)?.titolarita).toBe("titolare");
  });

  it("il deposito rientrato si riscarica ancora valido", () => {
    // Andata, ritorno e SECONDA andata: è il giro che Pico fa fra una sera e
    // l'altra, e deve chiudersi ogni volta.
    const planned = planSchedaImport(depositOf([builtScheda({ titolarita: "titolare" })]), ROWS, new Map());
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const applied = applySchedaImport(new Map(), planned.plan, null);
    expect(applied).not.toBeNull();
    const again = buildSchedaDeposit(applied as ReadonlyMap<string, ExpertScheda>);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(parseExpertSchedaDeposit(again.text).ok).toBe(true);
  });
});

describe("il riassunto di una scheda salvata", () => {
  it("usa le etichette del riquadro, non una seconda traduzione", () => {
    const scheda = builtScheda({
      titolarita: "ballottaggio",
      percentuale: "60",
      gerarchia: "1",
      rigori: "designato",
      piazzati: ["punizioni"],
      avvisi: ["rischio_fisico"],
      nota: "Nota breve.",
      fonte: "staff",
      aggiornata: "2026-08-30",
    });
    expect(schedaSummary(scheda)).toBe(
      "ballottaggio 60% · 1ª scelta · rigori: designato · piazzati: punizioni · ! rischio fisico · nota (11 caratteri) · risposta staff · 30/08/2026",
    );
  });

  it("una scheda magra rende una riga magra", () => {
    expect(schedaSummary(builtScheda({ titolarita: "titolare" }))).toBe("titolare");
  });
});
