import { describe, it, expect } from "vitest";
import type { StorageLike } from "./logRecovery.js";
import {
  FORMAZIONE_CONSTRAINTS_SCAVALCATI,
  FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
  FORMAZIONE_CONSTRAINTS_STORAGE_KEY,
  formazioneConstraintsNotice,
  loadFormazioneConstraints,
  saveFormazioneConstraints,
} from "./formazioneConstraints.js";
import type { LineupConstraints } from "../packages/league-channel-contract/src/index.js";

// I VINCOLI CHE SOPRAVVIVONO AL RELOAD, e i modi in cui possono non farcela.
//
// Tre proprietà si provano qui e non altrove: che un giro completo
// scrittura-rilettura restituisca esattamente ciò che Pico ha premuto, che un
// archivio storto riparta VUOTO invece che a metà, e che una scrittura che non
// tiene venga DETTA invece di essere scoperta al prossimo avvio.

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Accetta la scrittura e non conserva niente: la modalità privata di certi browser. */
function amnesicStorage(): StorageLike {
  return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
}

/** Non dà proprio accesso all'archivio. */
function hostileStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("accesso negato");
    },
    setItem: () => {
      throw new Error("accesso negato");
    },
    removeItem: () => undefined,
  };
}

const CAMPIONATO = "c1";
const COPPA = "c2";

describe("il giro completo dei vincoli", () => {
  it("scrive e rilegge esattamente ciò che era stato premuto, competizione per competizione", () => {
    const storage = memoryStorage();
    const vincoli = new Map<string, LineupConstraints>([
      [CAMPIONATO, { lockedStarterIds: ["p3", "p2"], lockedModule: "352", locked: false }],
      [COPPA, { lockedStarterIds: [], locked: true }],
    ]);
    expect(saveFormazioneConstraints(storage, vincoli)).toEqual({ kind: "ok" });

    const riletti = loadFormazioneConstraints(storage);
    expect(riletti.status).toBe("ok");
    // L'ordine delle spunte è una preferenza, non un dettaglio: si conserva.
    expect(riletti.byCompetition.get(CAMPIONATO)).toEqual({
      lockedStarterIds: ["p3", "p2"],
      lockedModule: "352",
      locked: false,
    });
    expect(riletti.byCompetition.get(COPPA)).toEqual({ lockedStarterIds: [], locked: true });
  });

  it("un archivio assente non è un guaio: si riparte senza vincoli e senza avvisi", () => {
    const esito = loadFormazioneConstraints(memoryStorage());
    expect(esito.status).toBe("ok");
    expect(esito.byCompetition.size).toBe(0);
    expect(formazioneConstraintsNotice(esito.status)).toBe("");
  });

  it("le due competizioni restano separate: la coppa non eredita le spunte del campionato", () => {
    const storage = memoryStorage();
    saveFormazioneConstraints(
      storage,
      new Map<string, LineupConstraints>([[CAMPIONATO, { lockedStarterIds: ["p2"], locked: false }]]),
    );
    const riletti = loadFormazioneConstraints(storage);
    expect(riletti.byCompetition.get(COPPA)).toBeUndefined();
  });
});

describe("un archivio storto riparte vuoto, e lo dice", () => {
  const casi: readonly [string, string][] = [
    ["non è JSON", "{{{"],
    ["è JSON ma non è la forma attesa", JSON.stringify({ schemaVersion: 1, altro: [] })],
    [
      "porta una versione di schema che non è questa",
      JSON.stringify({ schemaVersion: 99, perCompetition: [] }),
    ],
    [
      "porta un campo in più",
      JSON.stringify({
        schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
        perCompetition: [{ competitionId: "c1", lockedStarterIds: [], locked: false, extra: 1 }],
      }),
    ],
    [
      "porta un modulo che in §9 non esiste",
      JSON.stringify({
        schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
        perCompetition: [
          { competitionId: "c1", lockedStarterIds: [], lockedModule: "4321", locked: false },
        ],
      }),
    ],
    [
      "dichiara due volte la stessa competizione",
      JSON.stringify({
        schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
        perCompetition: [
          { competitionId: "c1", lockedStarterIds: ["p2"], locked: false },
          { competitionId: "c1", lockedStarterIds: ["p3"], locked: true },
        ],
      }),
    ],
  ];

  for (const [etichetta, raw] of casi) {
    it(`quando ${etichetta}: nessun vincolo, e una riga che lo dice`, () => {
      const esito = loadFormazioneConstraints(
        memoryStorage({ [FORMAZIONE_CONSTRAINTS_STORAGE_KEY]: raw }),
      );
      expect(esito.status).toBe("quarantined");
      expect(esito.byCompetition.size).toBe(0);
      expect(formazioneConstraintsNotice(esito.status)).toContain("messi da parte");
    });
  }

  it("mezzo elenco di vincoli non viene mai applicato: è una preferenza che nessuno ha espresso", () => {
    // Una sola voce storta fra due: l'archivio intero si rifiuta, invece di
    // applicare quella buona e far credere che sia tutto lì.
    const raw = JSON.stringify({
      schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
      perCompetition: [
        { competitionId: "c1", lockedStarterIds: ["p2"], locked: false },
        { competitionId: "c2", lockedStarterIds: "p3", locked: false },
      ],
    });
    const esito = loadFormazioneConstraints(memoryStorage({ [FORMAZIONE_CONSTRAINTS_STORAGE_KEY]: raw }));
    expect(esito.status).toBe("quarantined");
    expect(esito.byCompetition.size).toBe(0);
  });

  it("una spunta scritta due volte nello stesso elenco non è una contraddizione: si tiene una volta", () => {
    const raw = JSON.stringify({
      schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
      perCompetition: [{ competitionId: "c1", lockedStarterIds: ["p2", "p2"], locked: false }],
    });
    const esito = loadFormazioneConstraints(memoryStorage({ [FORMAZIONE_CONSTRAINTS_STORAGE_KEY]: raw }));
    expect(esito.status).toBe("ok");
    expect(esito.byCompetition.get("c1")?.lockedStarterIds).toEqual(["p2"]);
  });
});

describe("una scrittura che non tiene viene detta", () => {
  it("uno storage che accetta e dimentica fa tornare false", () => {
    expect(
      saveFormazioneConstraints(
        amnesicStorage(),
        new Map<string, LineupConstraints>([[CAMPIONATO, { lockedStarterIds: ["p2"], locked: false }]]),
      ),
    ).toEqual({ kind: "non-scritta" });
  });

  it("uno storage che rifiuta l'accesso non fa esplodere niente, né in scrittura né in lettura", () => {
    const storage = hostileStorage();
    expect(saveFormazioneConstraints(storage, new Map())).toEqual({ kind: "non-scritta" });
    const esito = loadFormazioneConstraints(storage);
    expect(esito.status).toBe("storage-error");
    expect(esito.byCompetition.size).toBe(0);
    expect(formazioneConstraintsNotice(esito.status)).toContain("solo in memoria");
  });

  it("un elenco oltre il tetto non si scrive: il tetto è una difesa, non un arredo", () => {
    const troppi = Array.from({ length: 200 }, (_, index) => `p${index}`);
    expect(
      saveFormazioneConstraints(
        memoryStorage(),
        new Map<string, LineupConstraints>([[CAMPIONATO, { lockedStarterIds: troppi, locked: false }]]),
      ),
    ).toEqual({ kind: "non-scritta" });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   DUE SCHEDE NON SI CANCELLANO PIÙ LE SPUNTE A VICENDA, E IL SILENZIO FINISCE

   Lo scenario, riprodotto: la stessa pagina aperta in due schede dello stesso
   browser. La scheda A spunta un difensore, la scheda B un attaccante. Prima,
   l'archivio conservava soltanto la spunta di B — B ha scritto per ultima
   partendo dalla sua copia in memoria, che il difensore non lo aveva mai visto
   — e la scheda A continuava a mostrare la propria come se fosse salvata. Due
   preferenze espresse, una sopravvissuta, nessun avviso da nessuna parte.

   La guardia è quella di `saveAuctionLog` (`expectedPreviousLog` →
   `divergent-log`, src/logRecovery.ts): la base della scrittura viaggia con la
   scrittura, e se l'archivio non è più quella base non si scrive niente.
   ──────────────────────────────────────────────────────────────────────────── */
describe("una scrittura scavalcata da un'altra scheda non passa in silenzio", () => {
  const difensore = new Map<string, LineupConstraints>([
    [CAMPIONATO, { lockedStarterIds: ["D1"], locked: false }],
  ]);
  const attaccante = new Map<string, LineupConstraints>([
    [CAMPIONATO, { lockedStarterIds: ["A1"], locked: false }],
  ]);

  it("la seconda scheda viene rifiutata invece di cancellare la spunta della prima", () => {
    const storage = memoryStorage();
    // Le due schede partono dallo stesso archivio: vuoto.
    const baseComune = new Map<string, LineupConstraints>();

    // La scheda B scrive per prima e tiene.
    expect(saveFormazioneConstraints(storage, attaccante, baseComune)).toEqual({ kind: "ok" });

    // La scheda A scrive dopo, partendo da una base che non è più quella vera.
    expect(saveFormazioneConstraints(storage, difensore, baseComune)).toEqual({
      kind: "scavalcata",
    });

    // E soprattutto: l'archivio è rimasto quello di B, intatto. Una scrittura
    // rifiutata non tocca niente.
    const riletti = loadFormazioneConstraints(storage);
    expect(riletti.status).toBe("ok");
    expect(riletti.byCompetition.get(CAMPIONATO)?.lockedStarterIds).toEqual(["A1"]);
  });

  it("la riga che lo dice nomina la spunta non salvata e dice che cosa si vede adesso", () => {
    expect(FORMAZIONE_CONSTRAINTS_SCAVALCATI).toContain("NON è stata salvata");
    expect(FORMAZIONE_CONSTRAINTS_SCAVALCATI).toContain("altra scheda");
  });

  it("senza base dichiarata la scrittura resta incondizionata, come prima", () => {
    const storage = memoryStorage();
    expect(saveFormazioneConstraints(storage, attaccante, new Map())).toEqual({ kind: "ok" });
    // Nessuna base: è la sostituzione deliberata — si rilegge e si riscrive.
    expect(saveFormazioneConstraints(storage, difensore)).toEqual({ kind: "ok" });
    expect(
      loadFormazioneConstraints(storage).byCompetition.get(CAMPIONATO)?.lockedStarterIds,
    ).toEqual(["D1"]);
  });

  it("riscrivere sopra la propria base non è una scrittura concorrente", () => {
    const storage = memoryStorage();
    expect(saveFormazioneConstraints(storage, attaccante, new Map())).toEqual({ kind: "ok" });
    // Stessa scheda, secondo gesto: la base è ciò che ha scritto lei.
    expect(saveFormazioneConstraints(storage, difensore, attaccante)).toEqual({ kind: "ok" });
  });

  it("un archivio valido ma non normalizzato non è un falso allarme", () => {
    // Un id spuntato due volte nello stesso elenco: `loadFormazioneConstraints`
    // lo deduplica, quindi la copia in memoria e il grezzo nell'archivio non
    // sono byte per byte la stessa cosa. Chiamarla «scrittura di un altro»
    // bloccherebbe ogni spunta per sempre.
    const raw = JSON.stringify({
      schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
      perCompetition: [{ competitionId: CAMPIONATO, lockedStarterIds: ["A1", "A1"], locked: false }],
    });
    const storage = memoryStorage({ [FORMAZIONE_CONSTRAINTS_STORAGE_KEY]: raw });
    const base = loadFormazioneConstraints(storage).byCompetition;
    expect(saveFormazioneConstraints(storage, difensore, base)).toEqual({ kind: "ok" });
  });

  it("un archivio in quarantena non blocca la scrittura: lì non c'è nessuna spunta da rispettare", () => {
    const storage = memoryStorage({ [FORMAZIONE_CONSTRAINTS_STORAGE_KEY]: "{{{" });
    expect(saveFormazioneConstraints(storage, difensore, new Map())).toEqual({ kind: "ok" });
  });
});
