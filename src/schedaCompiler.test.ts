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
  EMPTY_SCHEDA_PAGELLA,
  NO_SCHEDA_DRAFTS,
  SCHEDA_DEPOSIT_FILENAME,
  SCHEDA_DRAFTS_SCHEMA_VERSION,
  SCHEDA_DRAFTS_STORAGE_KEY,
  SCHEDA_ENTRY_POINTS,
  SCHEDA_PAGELLA_ENTRY_POINTS,
  applySchedaImport,
  buildScheda,
  buildSchedaDeposit,
  loadSchedaDrafts,
  planSchedaImport,
  saveSchedaDrafts,
  schedaBallottaggioFuoriListone,
  schedaPagellaVerificaText,
  schedaProgress,
  schedaSummary,
  schedaToForm,
  withEditing,
  withScheda,
  type SchedaDraftState,
  type SchedaFormValues,
  type SchedaPagellaValues,
} from "./schedaCompiler.js";
import {
  EXPERT_SCHEDA_SCHEMA_KEYS,
  EXPERT_SCHEDA_SCHEMA_VERSION,
  LISTA_ESPERTI_VALUES,
  SCHEDA_BALLOTTAGGIO_MAX,
  SCHEDA_GERARCHIA_MAX,
  SCHEDA_NAME_MAX,
  SCHEDA_NOTA_MAX,
  SCHEDA_PERCENTUALE_MAX,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
  type ExpertScheda,
} from "./expertScheda.js";
import {
  PAGELLA_SCHEMA_KEYS,
  PAGELLA_TOTALE_MAX,
  PAGELLA_VOTI_SCHEMA_KEYS,
} from "./pagellaEsperti.js";
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

/**
 * Le due righe di listone con un RUOLO: il quarto asse della pagella dipende da
 * lì, e senza ruolo non si potrebbe provare né che il portiere prende «porta
 * inviolata» né che il movimento prende «bonus».
 */
const TARGET_MOVIMENTO = { name: TARGET.name, club: TARGET.club, role: "A" } as const;
const TARGET_PORTIERE = { name: "Elia Portiere", club: "ClubCinque", role: "P" } as const;

const PAGELLA_MOVIMENTO: SchedaPagellaValues = {
  ...EMPTY_SCHEDA_PAGELLA,
  pagella_titolarita: "9",
  pagella_media_voto: "7",
  pagella_salute: "9",
  pagella_bonus: "6",
  pagella_consiglio: "8",
  totaleFonte: "39",
};

const PAGELLA_PORTIERE: SchedaPagellaValues = {
  ...EMPTY_SCHEDA_PAGELLA,
  pagella_titolarita: "1",
  pagella_media_voto: "1",
  pagella_salute: "8",
  pagella_porta_inviolata: "1",
  pagella_consiglio: "1",
  totaleFonte: "12",
};

/** Il modulo compilato in OGNI sua parte: la fixture della guardia strutturale. */
function fullForm(overrides: Partial<SchedaFormValues> = {}): SchedaFormValues {
  return form({
    titolarita: "ballottaggio",
    percentuale: "60",
    ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: "40" }],
    gerarchia: "2",
    rigori: "designato",
    piazzati: ["punizioni", "angoli"],
    avvisi: ["mercato"],
    lista: "consigliato",
    nota: "Nota sintetica.",
    aggiornata: "2026-08-30",
    fonte: "scheda",
    pagella: PAGELLA_MOVIMENTO,
    ...overrides,
  });
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

// ── LA GUARDIA STRUTTURALE ───────────────────────────────────────────────────
//
// PERCHÉ ESISTE, E PERCHÉ È LA PARTE PIÙ IMPORTANTE DI QUESTO FILE. Tre campi
// del contratto — `ballottaggio`, `lista`, `pagella` — sono nati e cresciuti
// senza che il modulo di compilazione ne sapesse niente. Per tre volte il
// deposito ha ammesso un dato che l'unica persona autorizzata a scriverlo non
// aveva nessun modo di scrivere, e per tre volte NESSUN TEST È DIVENTATO ROSSO:
// tutte le prove di questo file guardavano un campo alla volta, cioè
// esattamente i campi che c'erano già. Un test per campo non può accorgersi di
// un campo che manca.
//
// Questa guardia guarda invece il CONFINE fra le due cose: enumera le chiavi
// che lo schema della scheda ammette — lette dallo schema, non ricopiate — e
// pretende che ognuna abbia una via d'ingresso nel modulo. Il giorno in cui il
// contratto cresce e il modulo resta indietro, diventa rossa da sola.
//
// LE ECCEZIONI NON SONO UNO `skip`. `player` e `club` non hanno un campo del
// modulo e non devono averlo: si scelgono dalla riga di listone, ed è quella
// scelta che aggancia la scheda al giocatore. Sono dichiarate una per una col
// loro motivo dentro `SCHEDA_ENTRY_POINTS`, e la guardia pretende che restino
// DUE: una terza eccezione va scritta a mano qui sotto, cioè decisa.
describe("la guardia strutturale: il contratto cresce, il modulo se ne accorge", () => {
  it("ogni chiave che lo SCHEMA della scheda ammette ha una via d'ingresso dichiarata", () => {
    const senzaIngresso = EXPERT_SCHEDA_SCHEMA_KEYS.filter((key) => !(key in SCHEDA_ENTRY_POINTS));
    expect(
      senzaIngresso,
      `campi del contratto che nessuno può compilare: ${senzaIngresso.join(", ")}`,
    ).toEqual([]);
  });

  it("nessuna via d'ingresso punta a una chiave che il contratto non ammette più", () => {
    const orfane = Object.keys(SCHEDA_ENTRY_POINTS).filter(
      (key) => !EXPERT_SCHEDA_SCHEMA_KEYS.includes(key),
    );
    expect(orfane, `vie d'ingresso senza chiave nel contratto: ${orfane.join(", ")}`).toEqual([]);
  });

  it("ogni via d'ingresso «form» nomina un campo che il modulo ha DAVVERO", () => {
    for (const [key, entry] of Object.entries(SCHEDA_ENTRY_POINTS)) {
      if (entry.kind !== "form") continue;
      expect(EMPTY_SCHEDA_FORM, `${key} dichiara il campo «${entry.field}»`).toHaveProperty(
        entry.field,
      );
    }
  });

  it("le eccezioni sono DUE, dichiarate una per una col loro motivo — mai uno skip", () => {
    const eccezioni = Object.entries(SCHEDA_ENTRY_POINTS).filter(
      ([, entry]) => entry.kind === "riga-di-listone",
    );
    expect(eccezioni.map(([key]) => key)).toEqual(["player", "club"]);
    for (const [key, entry] of eccezioni) {
      if (entry.kind !== "riga-di-listone") continue;
      expect(
        entry.perche.length,
        `l'eccezione «${key}» deve portare un motivo scritto, non una riga vuota`,
      ).toBeGreaterThan(60);
    }
  });

  it("un modulo compilato in OGNI sua parte produce una scheda con tutte le chiavi del contratto", () => {
    // La prova che le vie d'ingresso non sono solo dichiarate: funzionano.
    const result = buildScheda(TARGET_MOVIMENTO, fullForm());
    expect(result.ok, `il modulo pieno deve passare: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) return;
    expect([...Object.keys(result.scheda)].sort()).toEqual([...EXPERT_SCHEDA_SCHEMA_KEYS].sort());
  });

  it("ogni chiave dello schema della PAGELLA ha una via d'ingresso dichiarata", () => {
    // Il livello annidato è il punto cieco classico di uno schema rigido solo
    // al primo livello: `pagella` avrebbe una via d'ingresso anche se dentro
    // mancasse metà del suo contenuto.
    const senzaIngresso = PAGELLA_SCHEMA_KEYS.filter(
      (key) => !(key in SCHEDA_PAGELLA_ENTRY_POINTS),
    );
    expect(senzaIngresso, `chiavi della pagella senza via d'ingresso: ${senzaIngresso.join(", ")}`).toEqual(
      [],
    );
  });

  it("ogni ASSE che lo schema della pagella ammette ha la sua casella nel modulo", () => {
    const senzaCasella = PAGELLA_VOTI_SCHEMA_KEYS.filter((asse) => !(asse in EMPTY_SCHEDA_PAGELLA));
    expect(senzaCasella, `assi senza casella: ${senzaCasella.join(", ")}`).toEqual([]);
  });

  it("i due assi di ruolo hanno ciascuno la propria via, e insieme coprono i sei dello schema", () => {
    const movimento = buildScheda(TARGET_MOVIMENTO, fullForm());
    const portiere = buildScheda(TARGET_PORTIERE, fullForm({ pagella: PAGELLA_PORTIERE }));
    expect(movimento.ok).toBe(true);
    expect(portiere.ok).toBe(true);
    if (!movimento.ok || !portiere.ok) return;
    const scritti = new Set([
      ...Object.keys(movimento.scheda.pagella?.voti ?? {}),
      ...Object.keys(portiere.scheda.pagella?.voti ?? {}),
    ]);
    expect([...scritti].sort()).toEqual([...PAGELLA_VOTI_SCHEMA_KEYS].sort());
    // E MAI insieme nella stessa scheda: è la regola dello schema, non una in più.
    expect(movimento.scheda.pagella?.voti.pagella_porta_inviolata).toBeUndefined();
    expect(portiere.scheda.pagella?.voti.pagella_bonus).toBeUndefined();
  });
});

// ── I TRE CAMPI, UNO PER UNO ─────────────────────────────────────────────────

describe("gli altri del ballottaggio: con chi si gioca il posto", () => {
  it("arrivano alla vista, con la loro quota, e la quota assente resta assente", () => {
    const scheda = builtScheda({
      titolarita: "ballottaggio",
      percentuale: "50",
      ballottaggio: [
        { surface: "Bruna Placeholder", sharePercent: "30" },
        { surface: "Carlo Segnaposto", sharePercent: "" },
      ],
    });
    expect(scheda.ballottaggio).toEqual([
      { surface: "Bruna Placeholder", sharePercent: 30 },
      { surface: "Carlo Segnaposto" },
    ]);
    // Nessun `?? 0`: la seconda quota manca e resta mancante.
    expect(scheda.ballottaggio?.[1]).not.toHaveProperty("sharePercent");
    const deposit = buildSchedaDeposit(new Map([[ROW_KEY, scheda]]));
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    const view = resolveExpertInsight(parseExpertSchedaDeposit(deposit.text), TARGET);
    expect(view.ballottaggio).toEqual(scheda.ballottaggio);
  });

  it("SENZA la titolarità «ballottaggio» si rifiuta: il riquadro non li mostrerebbe", () => {
    // La regola è scritta in `resolveExpertInsight` e non è inventata qui: un
    // elenco di rivali su un giocatore dato titolare non arriva alla vista.
    for (const titolarita of ["titolare", "riserva", ""]) {
      const result = buildScheda(
        TARGET,
        form({ titolarita, ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: "" }] }),
      );
      expect(result.ok, `titolarità «${titolarita}» non deve portare un ballottaggio`).toBe(false);
      if (result.ok) continue;
      expect(result.errors.some((e) => e.field === "ballottaggio")).toBe(true);
    }
  });

  it("e il rifiuto non è teorico: scritti così, il riquadro li scarterebbe davvero", () => {
    const scheda: ExpertScheda = {
      player: TARGET.name,
      club: TARGET.club,
      titolarita: "titolare",
      ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: 40 }],
    };
    const view = resolveExpertInsight(parseExpertSchedaDeposit(JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede: [scheda] })), TARGET);
    expect(view.ballottaggio).toEqual([]);
  });

  it("una quota senza nome NON sparisce in silenzio: si dice", () => {
    const result = buildScheda(
      TARGET,
      form({ titolarita: "ballottaggio", ballottaggio: [{ surface: "", sharePercent: "40" }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toContain("ballottaggio");
    expect(result.errors[0]?.message).toContain("40");
  });

  it("una riga del tutto vuota non è un soggetto e non è un errore", () => {
    const scheda = builtScheda({
      titolarita: "ballottaggio",
      ballottaggio: [{ surface: "", sharePercent: "" }],
    });
    expect(scheda).not.toHaveProperty("ballottaggio");
  });

  it("il giocatore stesso non entra fra gli altri: la sua quota è scritta una volta sola", () => {
    const result = buildScheda(
      TARGET,
      form({ titolarita: "ballottaggio", ballottaggio: [{ surface: TARGET.name, sharePercent: "50" }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["ballottaggio"]);
  });

  it("lo stesso nome due volte si rifiuta: due quote per la stessa persona possono divergere", () => {
    const result = buildScheda(
      TARGET,
      form({
        titolarita: "ballottaggio",
        ballottaggio: [
          { surface: "Bruna Placeholder", sharePercent: "30" },
          { surface: "bruna  placeholder", sharePercent: "20" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["ballottaggio"]);
  });

  it("oltre il tetto del contratto si rifiuta, dicendo il tetto", () => {
    const troppi = Array.from({ length: SCHEDA_BALLOTTAGGIO_MAX + 1 }, (_, i) => ({
      surface: `Rivale ${i}`,
      sharePercent: "",
    }));
    const result = buildScheda(TARGET, form({ titolarita: "ballottaggio", ballottaggio: troppi }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain(String(SCHEDA_BALLOTTAGGIO_MAX));
  });

  it("una quota fuori scala e un nome troppo lungo si dicono, uno per uno", () => {
    const result = buildScheda(
      TARGET,
      form({
        titolarita: "ballottaggio",
        ballottaggio: [
          { surface: "Bruna Placeholder", sharePercent: "101" },
          { surface: "L".repeat(SCHEDA_NAME_MAX + 1), sharePercent: "" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.field === "ballottaggio")).toBe(true);
  });

  it("un nome che il listone caricato non porta si DICHIARA, non si abbina al più simile", () => {
    const pool = [
      { name: "Bruna Placeholder", club: TARGET.club },
      { name: "Carlo Segnaposto", club: "ClubUno" },
    ];
    // «Placeholder» somiglia a «Bruna Placeholder» e «Rossini» a «Rossi»:
    // nessuno dei due viene abbinato, tutti e due vengono detti.
    expect(
      schedaBallottaggioFuoriListone(
        [
          { surface: "Bruna Placeholder", sharePercent: "" },
          { surface: "Placeholder", sharePercent: "" },
          { surface: "Carlo Segnaposto", sharePercent: "" },
        ],
        pool,
      ),
    ).toEqual(["Placeholder"]);
  });

  it("la dichiarazione non ripete lo stesso nome due volte e salta le righe vuote", () => {
    expect(
      schedaBallottaggioFuoriListone(
        [
          { surface: "Ignoto Uno", sharePercent: "" },
          { surface: "  ", sharePercent: "10" },
          { surface: "ignoto uno", sharePercent: "" },
        ],
        [],
      ),
    ).toEqual(["Ignoto Uno"]);
  });

  it("il riassunto scrive i nomi e le quote, senza fabbricarne nessuna", () => {
    const scheda = builtScheda({
      titolarita: "ballottaggio",
      percentuale: "50",
      ballottaggio: [
        { surface: "Bruna Placeholder", sharePercent: "30" },
        { surface: "Carlo Segnaposto", sharePercent: "" },
      ],
    });
    const summary = schedaSummary(scheda);
    expect(summary).toContain("ballottaggio 50%");
    expect(summary).toContain("con: Bruna Placeholder 30%, Carlo Segnaposto");
    expect(summary).not.toContain("Carlo Segnaposto 0%");
  });
});

describe("la lista editoriale: tre valori, e l'assenza che non è un quarto", () => {
  it.each([...LISTA_ESPERTI_VALUES])("«%s» arriva alla vista", (lista) => {
    const scheda = builtScheda({ lista });
    expect(scheda.lista).toBe(lista);
    const deposit = buildSchedaDeposit(new Map([[ROW_KEY, scheda]]));
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    const view = resolveExpertInsight(parseExpertSchedaDeposit(deposit.text), TARGET);
    // `sconsigliato` arriva anche dall'avviso: la vista ha una precedenza
    // dichiarata (`resolveListaEsperti`), e qui non c'è nessun avviso.
    expect(view.lista).toBe(lista);
  });

  it("l'ASSENZA non scrive la chiave: non esiste una quarta lista «nessuna»", () => {
    const scheda = builtScheda({ lista: "", nota: "Solo prosa." });
    expect(scheda).not.toHaveProperty("lista");
    expect(Object.keys(scheda)).toEqual(["player", "club", "nota"]);
  });

  it("la lista da sola è una scheda valida: è la quarta icona del riquadro", () => {
    const scheda = builtScheda({ lista: "possibile_sorpresa" });
    expect(scheda.lista).toBe("possibile_sorpresa");
  });

  it("rifiuta un valore fuori dal vocabolario", () => {
    const result = buildScheda(TARGET, form({ lista: "consigliatissimo" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["lista"]);
  });
});

describe("la pagella: i cinque voti, il totale dichiarato e le due regole del modulo", () => {
  it("i cinque voti e il totale arrivano al riquadro, col quarto asse del ruolo", () => {
    const result = buildScheda(TARGET_MOVIMENTO, fullForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheda.pagella).toEqual({
      voti: {
        pagella_titolarita: 9,
        pagella_media_voto: 7,
        pagella_salute: 9,
        pagella_bonus: 6,
        pagella_consiglio: 8,
      },
      totaleFonte: 39,
    });
    const deposit = buildSchedaDeposit(new Map([[ROW_KEY, result.scheda]]));
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    const view = resolveExpertInsight(parseExpertSchedaDeposit(deposit.text), TARGET_MOVIMENTO);
    expect(view.pagella.completa).toBe(true);
    expect(view.pagella.totaleRicalcolato).toBe(39);
    expect(view.pagella.verificaTotale).toBe("coerente");
  });

  it("UN VOTO MANCANTE RESTA MANCANTE: nessuna chiave, nessuno zero", () => {
    const result = buildScheda(
      TARGET_MOVIMENTO,
      fullForm({
        pagella: { ...PAGELLA_MOVIMENTO, pagella_salute: "", totaleFonte: "" },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheda.pagella?.voti).not.toHaveProperty("pagella_salute");
    expect(result.scheda.pagella).not.toHaveProperty("totaleFonte");
    // E una pagella parziale non produce nessuna somma.
    const view = resolveExpertInsight(
      parseExpertSchedaDeposit(
        JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede: [result.scheda] }),
      ),
      TARGET_MOVIMENTO,
    );
    expect(view.pagella.completa).toBe(false);
    expect(view.pagella.totaleRicalcolato).toBeNull();
  });

  it("lo ZERO è un voto vero e non si confonde con l'assenza", () => {
    const result = buildScheda(
      TARGET_MOVIMENTO,
      fullForm({ pagella: { ...PAGELLA_MOVIMENTO, pagella_salute: "0", totaleFonte: "" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheda.pagella?.voti.pagella_salute).toBe(0);
  });

  it("i due assi di ruolo insieme si rifiutano: una scheda parla di un giocatore solo", () => {
    const result = buildScheda(
      TARGET_MOVIMENTO,
      fullForm({ pagella: { ...PAGELLA_MOVIMENTO, pagella_porta_inviolata: "3" } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["pagella"]);
    expect(result.errors[0]?.message).toContain("Porta inviolata");
    expect(result.errors[0]?.message).toContain("Bonus");
  });

  it("l'asse di un ALTRO ruolo si rifiuta: il riquadro non lo userebbe", () => {
    // `resolvePagella` lo dichiara `asseIncoerente` e lascia l'asse assente:
    // salvarlo sarebbe una perdita silenziosa, quindi si dice prima.
    const result = buildScheda(TARGET_PORTIERE, fullForm({ pagella: PAGELLA_MOVIMENTO }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field)).toEqual(["pagella"]);
    expect(result.errors[0]?.message).toContain("Porta inviolata");
  });

  it("senza ruolo della riga non si indovina il quarto asse: quello scritto passa", () => {
    const senzaRuolo = buildScheda(TARGET, fullForm());
    expect(senzaRuolo.ok).toBe(true);
    if (!senzaRuolo.ok) return;
    expect(senzaRuolo.scheda.pagella?.voti.pagella_bonus).toBe(6);
  });

  it("un voto fuori scala e un totale fuori scala si dicono, uno per uno", () => {
    const result = buildScheda(
      TARGET_MOVIMENTO,
      fullForm({
        pagella: { ...PAGELLA_MOVIMENTO, pagella_salute: "11", totaleFonte: String(PAGELLA_TOTALE_MAX + 1) },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.field === "pagella")).toBe(true);
  });

  it("una pagella vuota non scrive la chiave: `{ voti: {} }` non dice niente", () => {
    const scheda = builtScheda({ nota: "Solo prosa.", pagella: EMPTY_SCHEDA_PAGELLA });
    expect(scheda).not.toHaveProperty("pagella");
  });

  it("la pagella da sola è una scheda valida: sono i cinque voti della fonte", () => {
    const result = buildScheda(TARGET_MOVIMENTO, form({ pagella: PAGELLA_MOVIMENTO }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.scheda)).toEqual(["player", "club", "pagella"]);
  });

  it("IL TOTALE NON SI APPIANA: su divergenza restano scritti tutti e due", () => {
    const result = buildScheda(
      TARGET_MOVIMENTO,
      fullForm({ pagella: { ...PAGELLA_MOVIMENTO, totaleFonte: "41" } }),
    );
    expect(result.ok, "una divergenza è un fatto della scheda, non un errore di compilazione").toBe(
      true,
    );
    if (!result.ok) return;
    // La somma vera è 39: il deposito conserva il 41 della fonte, non lo corregge.
    expect(result.scheda.pagella?.totaleFonte).toBe(41);
    const view = resolveExpertInsight(
      parseExpertSchedaDeposit(
        JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede: [result.scheda] }),
      ),
      TARGET_MOVIMENTO,
    );
    expect(view.pagella.verificaTotale).toBe("divergente");
    expect(view.pagella.totaleRicalcolato).toBe(39);
    expect(view.pagella.totaleFonte).toBe(41);
  });

  it("la riga di verifica scrive entrambi i numeri quando non tornano, e nessuno quando la pagella è parziale", () => {
    const divergente = schedaPagellaVerificaText(
      { ...PAGELLA_MOVIMENTO, totaleFonte: "41" },
      "A",
    );
    expect(divergente).toContain("39/50");
    expect(divergente).toContain("41/50");
    expect(divergente).toContain("NON TORNANO");

    const parziale = schedaPagellaVerificaText(
      { ...PAGELLA_MOVIMENTO, pagella_salute: "", totaleFonte: "39" },
      "A",
    );
    expect(parziale).toContain("4 voti su 5");
    expect(parziale).not.toContain("/50,");
    expect(parziale).toContain("non confrontabile");

    expect(schedaPagellaVerificaText(EMPTY_SCHEDA_PAGELLA, "A")).toContain("n/d");
  });

  it("il riassunto dice quanti voti ci sono e non somma una pagella parziale", () => {
    const parziale = builtScheda({
      pagella: { ...EMPTY_SCHEDA_PAGELLA, pagella_titolarita: "9", pagella_salute: "4" },
    });
    expect(schedaSummary(parziale)).toContain("pagella: 2/5 voti, somma n/d");
  });
});

describe("i tre campi nuovi sopravvivono al giro completo", () => {
  it("si riaprono nel modulo esattamente come sono stati scritti", () => {
    const first = buildScheda(TARGET_MOVIMENTO, fullForm());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = buildScheda(TARGET_MOVIMENTO, schedaToForm(first.scheda));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.scheda).toEqual(first.scheda);
  });

  it("un archivio scritto PRIMA dei tre campi si rilegge intero, modulo aperto compreso", () => {
    // La scheda aperta di ieri non ha `ballottaggio`, `lista` né `pagella`:
    // senza i default di `formSchema` sarebbe diventata «nessuna scheda
    // aperta», cioè fino a 90 secondi di battitura persi senza un errore.
    const storage = new MemoryStorage();
    const scheda = builtScheda({ titolarita: "titolare" });
    const vecchio = {
      schemaVersion: SCHEDA_DRAFTS_SCHEMA_VERSION,
      entries: [{ rowKey: ROW_KEY, scheda }],
      editing: {
        rowKey: ROW_KEY,
        values: {
          titolarita: "titolare",
          percentuale: "",
          gerarchia: "",
          rigori: "",
          piazzati: [],
          avvisi: [],
          nota: "Stavo scrivendo ieri sera.",
          aggiornata: "",
          fonte: "",
        },
      },
    };
    storage.seed(JSON.stringify(vecchio));
    const reloaded = loadSchedaDrafts(storage);
    expect(reloaded.schede.get(ROW_KEY)).toEqual(scheda);
    expect(reloaded.editing?.values.nota).toBe("Stavo scrivendo ieri sera.");
    expect(reloaded.editing?.values.ballottaggio).toEqual([]);
    expect(reloaded.editing?.values.lista).toBe("");
    expect(reloaded.editing?.values.pagella).toEqual(EMPTY_SCHEDA_PAGELLA);
  });

  it("l'archivio locale conserva e rilegge una scheda che porta tutti e tre", () => {
    const storage = new MemoryStorage();
    const result = buildScheda(TARGET_MOVIMENTO, fullForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(saveSchedaDrafts(storage, stateWith([[ROW_KEY, result.scheda]]))).toBe(true);
    expect(loadSchedaDrafts(storage).schede.get(ROW_KEY)).toEqual(result.scheda);
  });

  it("il deposito con tutti e tre passa il contratto e torna identico dopo un'importazione", () => {
    const result = buildScheda(TARGET_MOVIMENTO, fullForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deposit = buildSchedaDeposit(new Map([[ROW_KEY, result.scheda]]));
    expect(deposit.ok).toBe(true);
    if (!deposit.ok) return;
    const plan = planSchedaImport(deposit.text, [{ rowKey: ROW_KEY, ...TARGET }], new Map());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const applied = applySchedaImport(new Map(), plan.plan, null);
    expect(applied).not.toBeNull();
    const again = buildSchedaDeposit(applied as ReadonlyMap<string, ExpertScheda>);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.text).toBe(deposit.text);
  });
});
