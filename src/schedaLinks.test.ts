// Le risposte di Pico sull'aggancio delle schede, e la sola cosa che questo
// archivio deve garantire: una risposta data sopravvive al reload, e quando NON
// sopravvive chi chiama lo sa. Il resto — forma illeggibile, chiave che non è
// una chiave, storage che rifiuta — deve finire tutto nella stessa direzione:
// «te lo richiedo», mai «ho scelto io».
//
// Fake in memoria, mai `localStorage` vero: stessa postura di
// src/leagueTeams.test.ts e src/confirmationsStore.test.ts.

import { describe, expect, it } from "vitest";
import {
  NO_SCHEDA_LINKS,
  SCHEDA_LINKS_MAX,
  SCHEDA_LINKS_SCHEMA_VERSION,
  SCHEDA_LINKS_STORAGE_KEY,
  loadSchedaLinks,
  saveSchedaLinks,
  schedaLinkRowKey,
  withSchedaLink,
} from "./schedaLinks.js";
import type { StorageLike } from "./logRecovery.js";
import { listonePlayerKey } from "./ui/listone.js";

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  constructor(private readonly mode: "ok" | "throw-write" | "silent-drop" = "ok") {}
  getItem(key: string): string | null {
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
    this.map.set(SCHEDA_LINKS_STORAGE_KEY, raw);
  }
}

const ROW = { name: "Placeholder", club: "ClubQuattro" } as const;
const ROW_KEY = schedaLinkRowKey(ROW);
const SCHEDA_KEY = listonePlayerKey({ name: "Dario Placeholder", club: "ClubQuattro" });

describe("la chiave della riga", () => {
  it("è nome + squadra, la stessa identità su cui l'aggancio lavora", () => {
    expect(ROW_KEY).toBe("placeholder__clubquattro");
  });

  // Una riga di listone che porta un `proxyId` renderebbe `proxy:<id>` da
  // `listonePlayerKey`, e la risposta finirebbe archiviata sotto un'identità
  // che l'aggancio non usa: la stessa domanda tornerebbe a ogni chiamata.
  it("non cambia per una riga che porta un proxyId", () => {
    expect(schedaLinkRowKey({ name: ROW.name, club: ROW.club })).toBe(ROW_KEY);
    expect(listonePlayerKey({ proxyId: 7, name: ROW.name, club: ROW.club })).not.toBe(ROW_KEY);
  });
});

describe("aggiungere e togliere una risposta", () => {
  it("aggiunge senza toccare la mappa ricevuta", () => {
    const before = NO_SCHEDA_LINKS;
    const after = withSchedaLink(before, ROW_KEY, SCHEDA_KEY);
    expect(after.get(ROW_KEY)).toBe(SCHEDA_KEY);
    expect(before.size).toBe(0);
  });

  it("«nessuna di queste» toglie la riga invece di scriverci un vuoto", () => {
    const linked = withSchedaLink(NO_SCHEDA_LINKS, ROW_KEY, SCHEDA_KEY);
    const cleared = withSchedaLink(linked, ROW_KEY, null);
    expect(cleared.has(ROW_KEY)).toBe(false);
    expect(cleared.size).toBe(0);
  });
});

describe("il giro completo, che è l'unica cosa che conta", () => {
  it("una risposta data si rilegge identica dopo un reload", () => {
    const storage = new MemoryStorage();
    expect(saveSchedaLinks(storage, withSchedaLink(NO_SCHEDA_LINKS, ROW_KEY, SCHEDA_KEY))).toBe(true);
    expect([...loadSchedaLinks(storage)]).toEqual([[ROW_KEY, SCHEDA_KEY]]);
  });

  it("archivio assente = nessuna risposta data, che è lo stato normale", () => {
    expect(loadSchedaLinks(new MemoryStorage())).toEqual(NO_SCHEDA_LINKS);
  });
});

describe("fail-closed: un archivio rotto richiede, non decide", () => {
  it.each([
    ["testo che non è JSON", "{ non json"],
    ["JSON che non è la forma attesa", JSON.stringify({ links: { a: "b" } })],
    ["versione di schema diversa", JSON.stringify({ schemaVersion: 99, links: { a: "b" } })],
    ["una chiave in più", JSON.stringify({ schemaVersion: SCHEDA_LINKS_SCHEMA_VERSION, links: {}, extra: 1 })],
    [
      "un valore che non è una stringa",
      JSON.stringify({ schemaVersion: SCHEDA_LINKS_SCHEMA_VERSION, links: { a: 3 } }),
    ],
    [
      "un valore vuoto",
      JSON.stringify({ schemaVersion: SCHEDA_LINKS_SCHEMA_VERSION, links: { a: "" } }),
    ],
  ])("%s -> nessuna risposta", (_label, raw) => {
    const storage = new MemoryStorage();
    storage.seed(raw);
    expect(loadSchedaLinks(storage)).toEqual(NO_SCHEDA_LINKS);
  });

  it("un archivio oltre il tetto non viene né letto né scritto", () => {
    const tooMany = new Map<string, string>();
    for (let i = 0; i <= SCHEDA_LINKS_MAX; i += 1) tooMany.set(`riga-${i}__club`, SCHEDA_KEY);
    const storage = new MemoryStorage();
    expect(saveSchedaLinks(storage, tooMany)).toBe(false);
    storage.seed(
      JSON.stringify({
        schemaVersion: SCHEDA_LINKS_SCHEMA_VERSION,
        links: Object.fromEntries(tooMany),
      }),
    );
    expect(loadSchedaLinks(storage)).toEqual(NO_SCHEDA_LINKS);
  });

  it("uno storage che esplode non lancia: rende false, e chi chiama lo dice", () => {
    const links = withSchedaLink(NO_SCHEDA_LINKS, ROW_KEY, SCHEDA_KEY);
    expect(saveSchedaLinks(new MemoryStorage("throw-write"), links)).toBe(false);
  });

  // Il caso peggiore, perché non lancia: la scrittura passa e non attecchisce.
  // Senza la rilettura di controllo il riquadro prometterebbe una scelta che al
  // prossimo avvio non c'è più.
  it("uno storage che accetta e non conserva viene comunque riportato come fallito", () => {
    const links = withSchedaLink(NO_SCHEDA_LINKS, ROW_KEY, SCHEDA_KEY);
    expect(saveSchedaLinks(new MemoryStorage("silent-drop"), links)).toBe(false);
  });
});
