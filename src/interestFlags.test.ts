// La coda dei flag «chi era in gara» — unit test.
//
// Fixture interamente sintetiche: nessun nome di giocatore reale, nessun nome
// di persona. I posti sono `t1…t8` come negli altri test di questo file
// system, e i giocatori sono chiavi inventate.
//
// L'ASSERZIONE CHE CONTA PIÙ DI TUTTE non è qui ma in
// e2e/interest-flags.spec.ts: l'acquisto riesce anche quando la scrittura del
// flag fallisce. Qui si verifica la metà che quella spec presuppone — che
// nessuna funzione di questo modulo lanci, MAI, qualunque cosa faccia lo
// storage.
import { describe, expect, it } from "vitest";
import type { StorageLike } from "./logRecovery.js";
import {
  INTEREST_FLAGS_QUARANTINE_STORAGE_KEY,
  INTEREST_FLAGS_QUEUE_MAX,
  INTEREST_FLAGS_SCHEMA_VERSION,
  INTEREST_FLAGS_STORAGE_KEY,
  enqueueInterestFlag,
  loadInterestFlags,
  type InterestFlag,
} from "./interestFlags.js";

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class ReadThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("synthetic read failure");
  }
  setItem(): void {
    throw new Error("synthetic write failure");
  }
  removeItem(): void {
    throw new Error("synthetic write failure");
  }
}

class WriteThrowingStorage implements StorageLike {
  constructor(private readonly inner: MemoryStorage) {}
  getItem(key: string): string | null {
    return this.inner.getItem(key);
  }
  setItem(): void {
    throw new Error("synthetic write failure");
  }
  removeItem(key: string): void {
    this.inner.removeItem(key);
  }
}

function flag(overrides: Partial<InterestFlag> = {}): InterestFlag {
  return {
    purchaseSeq: 0,
    playerId: "sintetico-001|A|club1",
    winnerFantaTeamId: "t2",
    price: 25,
    contenders: ["t3", "t5"],
    flaggedAt: "2026-09-03T20:15:00.000Z",
    ...overrides,
  };
}

describe("enqueueInterestFlag", () => {
  it("accoda e persiste sotto la propria chiave, senza toccare nient'altro", () => {
    const storage = new MemoryStorage();
    const result = enqueueInterestFlag(storage, [], flag());

    expect(result.ok).toBe(true);
    expect(result.pending).toHaveLength(1);
    const raw = storage.getItem(INTEREST_FLAGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      schemaVersion: INTEREST_FLAGS_SCHEMA_VERSION,
      pending: [flag()],
    });
    // Una chiave sola: il log d'asta e le riconferme non sono nemmeno sfiorati.
    expect([...storage.map.keys()]).toEqual([INTEREST_FLAGS_STORAGE_KEY]);
  });

  it("«nessuno marcato» è un esito normale e viene accodato, non saltato", () => {
    const storage = new MemoryStorage();
    const result = enqueueInterestFlag(storage, [], flag({ contenders: [] }));

    expect(result.ok).toBe(true);
    expect(result.pending[0]?.contenders).toEqual([]);
    // «Non ho marcato nessuno» e «non mi è stato chiesto» restano due fatti
    // diversi: il primo lascia una voce, il secondo non lascia niente.
    expect(loadInterestFlags(storage).pending).toHaveLength(1);
  });

  it("è idempotente sul purchaseSeq: la seconda marcatura SOSTITUISCE la prima", () => {
    const storage = new MemoryStorage();
    const first = enqueueInterestFlag(storage, [], flag({ contenders: ["t3"] }));
    const second = enqueueInterestFlag(storage, first.pending, flag({ contenders: ["t3", "t4"] }));

    expect(second.pending).toHaveLength(1);
    expect(second.pending[0]?.contenders).toEqual(["t3", "t4"]);
  });

  it("uno storage che lancia in scrittura NON lancia a sua volta, e conserva la voce in memoria", () => {
    const storage = new WriteThrowingStorage(new MemoryStorage());
    const result = enqueueInterestFlag(storage, [], flag());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("storage-error");
    // La marcatura non evapora: resta nella coda in memoria della sessione, ed
    // è il chiamante a dichiarare che non è stata scritta.
    expect(result.pending).toHaveLength(1);
  });

  it("rifiuta una voce non conforme e riporta path+codice, mai il valore", () => {
    const storage = new MemoryStorage();
    // Una chiave con un nome di persona: lo schema è .strict(), quindi è un
    // errore di validazione e non un dato salvato in silenzio.
    const dirty = { ...flag(), displayName: "qualcuno" } as unknown as InterestFlag;
    const result = enqueueInterestFlag(storage, [], dirty);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid-entry");
    expect(result.message).not.toContain("qualcuno");
    expect(storage.getItem(INTEREST_FLAGS_STORAGE_KEY)).toBeNull();
  });

  it("il tetto della coda scarta le voci più VECCHIE, mai la più recente", () => {
    const storage = new MemoryStorage();
    let pending: readonly InterestFlag[] = [];
    for (let seq = 0; seq < INTEREST_FLAGS_QUEUE_MAX + 3; seq += 1) {
      pending = enqueueInterestFlag(storage, pending, flag({ purchaseSeq: seq })).pending;
    }
    expect(pending).toHaveLength(INTEREST_FLAGS_QUEUE_MAX);
    expect(pending[0]?.purchaseSeq).toBe(3);
    expect(pending[pending.length - 1]?.purchaseSeq).toBe(INTEREST_FLAGS_QUEUE_MAX + 2);
  });
});

describe("loadInterestFlags", () => {
  it("chiave mai scritta -> `none`, coda vuota, nessun rumore", () => {
    const result = loadInterestFlags(new MemoryStorage());
    expect(result.status).toBe("none");
    expect(result.pending).toEqual([]);
  });

  it("rilegge quel che è stato accodato", () => {
    const storage = new MemoryStorage();
    enqueueInterestFlag(storage, [], flag());
    const result = loadInterestFlags(storage);
    expect(result.status).toBe("valid");
    expect(result.pending).toEqual([flag()]);
  });

  it("contenuto illeggibile -> quarantena verbatim, coda vuota, MAI un blocco", () => {
    const storage = new MemoryStorage();
    storage.setItem(INTEREST_FLAGS_STORAGE_KEY, "{ questo non è JSON");
    const result = loadInterestFlags(storage);

    expect(result.status).toBe("quarantined");
    expect(result.pending).toEqual([]);
    expect(storage.getItem(INTEREST_FLAGS_QUARANTINE_STORAGE_KEY)).toBe("{ questo non è JSON");
  });

  it("envelope di una versione diversa: rifiutato, mai migrato a indovinare", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      INTEREST_FLAGS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, pending: [flag()] }),
    );
    expect(loadInterestFlags(storage).status).toBe("quarantined");
  });

  it("uno storage che lancia in lettura NON lancia a sua volta", () => {
    const result = loadInterestFlags(new ReadThrowingStorage());
    expect(result.status).toBe("storage-error");
    expect(result.pending).toEqual([]);
  });
});
