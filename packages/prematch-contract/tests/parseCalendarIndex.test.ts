import { describe, expect, it } from "vitest";

import {
  CALENDAR_INDEX_FAMILIES,
  CALENDAR_INDEX_STOP_CODES,
  fixtureLookups,
  parseCalendarIndex,
  readCalendarIndexShape,
  type CalendarIndexShape,
  type ParseCalendarIndexRequest,
} from "../src/parseCalendarIndex.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";

// FIXTURE SINTETICHE, E SOLO SINTETICHE.
//
// Nessun HTML reale, nessun calendario vero: si costruisce un indice finto con
// la forma misurata il 2026-09-04 — più di una giornata sulla stessa pagina — e
// si misura che cosa il parser ne ricava e dove si ferma.

const PROSA = "questa e' prosa inventata per la prova, e non deve finire da nessuna parte nel candidato";

const TABELLA_SINTETICA = {
  structuredBlocks: ['<script id="dati-di-prova"[^>]*>([\\s\\S]*?)</script>'],
  keys: {
    gameweeks: "^turni$",
    matchday: "^turno$",
    fixtures: "^sfide$",
    homeTeam: "^ospitante$",
    awayTeam: "^ospite$",
    kickOff: "^avvio$",
    homeScore: "^reti-ospitante$",
    awayScore: "^reti-ospite$",
  },
};

function tabella(): CalendarIndexShape {
  const esito = readCalendarIndexShape(TABELLA_SINTETICA);
  if (!isRead(esito)) throw new Error("tabella di prova non leggibile");
  return esito.value;
}

function pagina(blocco: unknown): string {
  return (
    `<!doctype html><html><body><p>${PROSA}</p>` +
    `<script id="dati-di-prova" type="application/json">${JSON.stringify(blocco)}</script>` +
    `</body></html>`
  );
}

interface OpzioniSfida {
  readonly avvio?: string | null;
  readonly reti?: readonly [number, number] | null;
}

function sfida(casa: string, ospite: string, opzioni: OpzioniSfida = {}): Record<string, unknown> {
  const out: Record<string, unknown> = { ospitante: casa, ospite };
  if (opzioni.avvio !== null) out["avvio"] = opzioni.avvio ?? "2026-09-05T20:45:00+02:00";
  if (opzioni.reti != null) {
    out["reti-ospitante"] = opzioni.reti[0];
    out["reti-ospite"] = opzioni.reti[1];
  }
  return out;
}

interface OpzioniTurno {
  readonly numero?: number | null;
  readonly sfide?: readonly Record<string, unknown>[];
  readonly senzaElenco?: boolean;
}

function turno(opzioni: OpzioniTurno = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (opzioni.numero !== null) out["turno"] = opzioni.numero ?? 1;
  if (opzioni.senzaElenco !== true) {
    out["sfide"] = opzioni.sfide ?? [sfida("Alfa", "Beta"), sfida("Gamma", "Delta")];
  }
  return out;
}

function blocco(turni?: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { radice: { contenuto: { turni: turni ?? [turno(), turno({ numero: 2 })] } } };
}

function richiesta(html: string, extra: Partial<ParseCalendarIndexRequest> = {}): ParseCalendarIndexRequest {
  return {
    rawHtml: html,
    shape: tabella(),
    source: "testata sintetica",
    page: "calendario e risultati",
    observedAt: "2026-09-04T18:00:00+02:00",
    requestedMatchday: 1,
    ...extra,
  };
}

describe("l'indice completo si legge per intero", () => {
  it("produce tutte le giornate, ciascuna con le sue partite", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    expect(esito.value.gameweeks).toHaveLength(2);
    expect(esito.value.gameweeks[0]?.fixtures).toHaveLength(2);
    expect(esito.value.gameweeks[0]?.fixtures[0]?.home).toBe("Alfa");
    expect(esito.value.gameweeks[0]?.fixtures[0]?.away).toBe("Beta");
  });

  it("PER OGNI PARTITA C'È CIÒ CHE SERVE A RITROVARE LA SUA PAGINA: due squadre e la giornata", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const chiavi = fixtureLookups(esito.value);
    expect(chiavi).toHaveLength(4);
    expect(chiavi[0]).toEqual({ home: "Alfa", away: "Beta", matchday: { origin: "declared-by-source", number: 1 } });
    expect(chiavi[3]?.matchday).toEqual({ origin: "declared-by-source", number: 2 });
  });

  it("nessuna prosa della pagina entra nel risultato", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    expect(JSON.stringify(esito)).not.toContain("prosa inventata");
  });

  it("è puro: due letture dello stesso testo danno lo stesso risultato", () => {
    const html = pagina(blocco());
    expect(parseCalendarIndex(richiesta(html))).toEqual(parseCalendarIndex(richiesta(html)));
  });

  it("nessun indirizzo entra nell'indice: ci sono nomi di squadra e niente altro", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(Object.keys(esito.value.gameweeks[0]?.fixtures[0] ?? {}).sort()).toEqual([
      "away",
      "home",
      "kickOff",
      "score",
    ]);
  });
});

describe("LA GIORNATA SI DICHIARA, E NON SI RICAVA DALLA POSIZIONE", () => {
  it("giornata dichiarata dal gruppo: vale", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno({ numero: 7 })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(esito.value.gameweeks[0]?.matchday ?? { origin: "unobserved" })).toBe(7);
  });

  it("GIORNATA NON DICHIARATA: si dichiara ignota, e NON diventa la posizione nell'elenco", () => {
    // Il primo gruppo non dichiara niente e il secondo dichiara 2: chi ricavasse
    // il numero dalla posizione scriverebbe «1» qui, e manderebbe ogni partita
    // alla pagina sbagliata.
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno({ numero: null }), turno({ numero: 2 })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.matchday).toEqual({ origin: "unobserved" });
    expect(esito.value.gameweeks[1]?.matchday).toEqual({ origin: "declared-by-source", number: 2 });
    expect(matchdayIfDeclared(esito.value.gameweeks[0]?.matchday ?? { origin: "unobserved" })).toBeNull();
  });

  it("la giornata chiesta non scende nei gruppi: resta sulla provenienza della pagina", () => {
    const esito = parseCalendarIndex(
      richiesta(pagina(blocco([turno({ numero: null })])), { requestedMatchday: 4 }),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.matchday).toEqual({ origin: "unobserved" });
    expect(esito.value.provenance.matchday).toEqual({ origin: "requested-by-caller", number: 4 });
  });

  it("la provenienza della pagina non dichiara mai una giornata: un indice ne porta più d'una", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBeNull();
  });

  it("senza giornata chiesta e senza dichiarazioni: non osservata da entrambe le parti", () => {
    const esito = parseCalendarIndex(
      richiesta(pagina(blocco([turno({ numero: null })])), { requestedMatchday: null }),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "unobserved" });
    expect(esito.value.gameweeks[0]?.matchday).toEqual({ origin: "unobserved" });
  });
});

describe("i campi che una partita può non dare", () => {
  it("orario senza fuso: assente, invece che ordinato a caso", () => {
    const esito = parseCalendarIndex(
      richiesta(pagina(blocco([turno({ sfide: [sfida("Alfa", "Beta", { avvio: "2026-09-05T20:45:00" })] })]))),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.fixtures[0]?.kickOff).toEqual({ presence: "absent-in-source" });
  });

  it("partita non ancora giocata: il risultato è assente, non zero a zero", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.fixtures[0]?.score).toEqual({ presence: "absent-in-source" });
  });

  it("risultato dichiarato: si legge come la fonte lo scrive", () => {
    const esito = parseCalendarIndex(
      richiesta(pagina(blocco([turno({ sfide: [sfida("Alfa", "Beta", { reti: [2, 1] })] })]))),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.fixtures[0]?.score).toEqual({
      presence: "observed",
      value: { home: 2, away: 1 },
    });
  });

  it("mezzo risultato non è un risultato: resta assente", () => {
    const mezzo = sfida("Alfa", "Beta");
    mezzo["reti-ospitante"] = 2;
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno({ sfide: [mezzo] })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.gameweeks[0]?.fixtures[0]?.score).toEqual({ presence: "absent-in-source" });
  });
});

describe("LA STRUTTURA CAMBIATA SOTTO DI NOI — si dichiara, non si arrangia", () => {
  it("testo vuoto: si ferma", () => {
    const esito = parseCalendarIndex(richiesta(""));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.emptyInput);
  });

  it("nessun blocco di dati strutturati: si ferma", () => {
    const esito = parseCalendarIndex(richiesta("<html><body><p>solo prosa</p></body></html>"));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.noStructuredBlock);
  });

  it("blocco presente ma illeggibile: si ferma", () => {
    const html = `<script id="dati-di-prova" type="application/json">{ questo non è json </script>`;
    const esito = parseCalendarIndex(richiesta(html));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.unreadableBlock);
  });

  it("ELENCO DI GIORNATE VUOTO: si ferma, invece di consegnare un indice senza partite", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco([]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.gameweeksEmpty);
    expect(esito.at).toEqual(["parseCalendarIndex", "keys", "gameweeks"]);
  });

  it("UN BLOCCO MANCANTE: una giornata senza il proprio elenco di partite ferma la lettura", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno(), turno({ senzaElenco: true })]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.fixturesMissing);
    expect(esito.reason).toContain(`famiglia di chiavi "fixtures"`);
  });

  it("una giornata con l'elenco vuoto: si ferma", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno({ sfide: [] })]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.fixturesEmpty);
  });

  it("UNA PARTITA SENZA UNA DELLE DUE SQUADRE FERMA TUTTO: mai un indice a metà", () => {
    const rotta: Record<string, unknown> = { ospitante: "Alfa", avvio: "2026-09-05T20:45:00+02:00" };
    const esito = parseCalendarIndex(
      richiesta(pagina(blocco([turno({ sfide: [sfida("Gamma", "Delta"), rotta] })]))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.fixtureUnreadable);
    // Il motivo nomina LA FAMIGLIA, non l'indice della partita nell'elenco.
    expect(esito.reason).toContain(`famiglia di chiavi "awayTeam"`);
    expect(esito.at).toEqual(["parseCalendarIndex", "keys", "awayTeam"]);
    expect(JSON.stringify(esito)).not.toContain("Gamma");
  });

  it("una squadra contro sé stessa è fuori contratto", () => {
    const esito = parseCalendarIndex(richiesta(pagina(blocco([turno({ sfide: [sfida("Alfa", "Alfa")] })]))));
    expect(esito.status).toBe("out-of-contract");
  });

  it("una tabella che descrive un'altra struttura non trova niente, e lo dichiara", () => {
    const altra = readCalendarIndexShape({
      ...TABELLA_SINTETICA,
      keys: { ...TABELLA_SINTETICA.keys, gameweeks: "^giornate-di-campionato$" },
    });
    if (!isRead(altra)) throw new Error("tabella non leggibile");
    const esito = parseCalendarIndex({ ...richiesta(pagina(blocco())), shape: altra.value });
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(CALENDAR_INDEX_STOP_CODES.gameweeksNotOne);
    expect(esito.at).toEqual(["parseCalendarIndex", "keys", "gameweeks"]);
  });
});

describe("la tabella delle famiglie di chiavi è un ingresso obbligatorio", () => {
  it("una famiglia mancante ferma tutto, e dice QUALE mancava", () => {
    for (const famiglia of CALENDAR_INDEX_FAMILIES) {
      const rotta = { ...TABELLA_SINTETICA, keys: { ...TABELLA_SINTETICA.keys } };
      delete (rotta.keys as Record<string, unknown>)[famiglia];
      const esito = readCalendarIndexShape(rotta);
      expect(esito.status, famiglia).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, famiglia).toEqual(["calendarIndexShape", "keys", famiglia]);
    }
  });

  it("senza un modo di estrarre il blocco strutturato non si parte", () => {
    const esito = readCalendarIndexShape({ ...TABELLA_SINTETICA, structuredBlocks: [] });
    expect(esito.status).toBe("shape-not-recognised");
  });
});
