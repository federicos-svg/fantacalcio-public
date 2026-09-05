import { describe, expect, it } from "vitest";

import { goalDifferenceCheck, playedCheck } from "../src/gameweekPages.js";
import {
  STANDINGS_FAMILIES,
  STANDINGS_STOP_CODES,
  STANDINGS_WORDINGS,
  parseStandings,
  readStandingsShape,
  type ParseStandingsRequest,
  type StandingsShape,
} from "../src/parseStandings.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";

// FIXTURE SINTETICHE, E SOLO SINTETICHE.
//
// Nessun HTML reale, nessuna classifica vera: squadre Alfa, Beta e Gamma, numeri
// inventati. La forma è quella di una tabella di classifica; i contenuti no.

const PROSA = "questa e' prosa inventata per la prova, e non deve finire da nessuna parte nel candidato";

const TABELLA_SINTETICA = {
  structuredBlocks: ['<script id="dati-di-prova"[^>]*>([\\s\\S]*?)</script>'],
  keys: {
    rows: "^righe$",
    position: "^posto$",
    teamName: "^insegna$",
    points: "^punti$",
    played: "^giocate$",
    won: "^vinte$",
    drawn: "^pari$",
    lost: "^perse$",
    goalsFor: "^fatti$",
    goalsAgainst: "^subiti$",
    goalDifference: "^scarto$",
    recentForm: "^andamento$",
  },
  saysWin: "^(v|w)$",
  saysDraw: "^(n|d)$",
  saysLoss: "^(p|l)$",
};

function tabella(): StandingsShape {
  const esito = readStandingsShape(TABELLA_SINTETICA);
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

interface OpzioniRiga {
  readonly senzaPunti?: boolean;
  readonly senzaAndamento?: boolean;
  readonly andamento?: readonly unknown[];
  readonly scarto?: number;
}

function riga(posto: number, insegna: string, opzioni: OpzioniRiga = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    posto,
    insegna,
    giocate: 3,
    vinte: 2,
    pari: 1,
    perse: 0,
    fatti: 5,
    subiti: 2,
    scarto: opzioni.scarto ?? 3,
  };
  if (opzioni.senzaPunti !== true) out["punti"] = 7;
  if (opzioni.senzaAndamento !== true) out["andamento"] = opzioni.andamento ?? ["V", "N", "V"];
  return out;
}

function blocco(righe?: readonly Record<string, unknown>[]): Record<string, unknown> {
  return {
    radice: {
      contenuto: {
        righe: righe ?? [riga(1, "Alfa"), riga(2, "Beta"), riga(3, "Gamma", { scarto: -2 })],
      },
    },
  };
}

function richiesta(html: string, extra: Partial<ParseStandingsRequest> = {}): ParseStandingsRequest {
  return {
    rawHtml: html,
    shape: tabella(),
    source: "testata sintetica",
    page: "classifica",
    observedAt: "2026-09-04T18:00:00+02:00",
    requestedMatchday: 3,
    ...extra,
  };
}

describe("la classifica completa si legge per intero", () => {
  it("produce tutte le righe, con posizione e squadra", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    expect(esito.value.rows).toHaveLength(3);
    expect(esito.value.rows.map((r) => [r.position, r.team])).toEqual([
      [1, "Alfa"],
      [2, "Beta"],
      [3, "Gamma"],
    ]);
  });

  it("le colonne dichiarate si leggono come la fonte le scrive", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const prima = esito.value.rows[0];
    if (prima === undefined) throw new Error("riga mancante");
    expect(prima.points).toEqual({ presence: "observed", value: 7 });
    expect(prima.goalDifference).toEqual({ presence: "observed", value: 3 });
    expect(prima.recentForm).toEqual({ presence: "observed", value: ["win", "draw", "win"] });
  });

  it("la differenza reti con segno si legge: −2 è un numero legittimo", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.rows[2]?.goalDifference).toEqual({ presence: "observed", value: -2 });
  });

  it("le verifiche dichiarano, non riparano", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const prima = esito.value.rows[0];
    if (prima === undefined) throw new Error("riga mancante");
    expect(goalDifferenceCheck(prima)).toBe("agree");
    expect(playedCheck(prima)).toBe("agree");
    // Una divergenza si mostra e resta: la fonte non si corregge.
    const storta = parseStandings(richiesta(pagina(blocco([riga(1, "Alfa", { scarto: 9 })]))));
    if (!isRead(storta)) throw new Error("atteso letto");
    const rigaStorta = storta.value.rows[0];
    if (rigaStorta === undefined) throw new Error("riga mancante");
    expect(goalDifferenceCheck(rigaStorta)).toBe("disagree");
    expect(rigaStorta.goalDifference).toEqual({ presence: "observed", value: 9 });
  });

  it("nessuna prosa della pagina entra nel risultato", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    expect(JSON.stringify(esito)).not.toContain("prosa inventata");
  });

  it("è puro: due letture dello stesso testo danno lo stesso risultato", () => {
    const html = pagina(blocco());
    expect(parseStandings(richiesta(html))).toEqual(parseStandings(richiesta(html)));
  });

  it("la classifica non dichiara una giornata: resta quella che avevamo chiesto", () => {
    const esito = parseStandings(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "requested-by-caller", number: 3 });
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBeNull();
  });
});

describe("UNA COLONNA CHE NON C'È RESTA ASSENTE — mai uno zero", () => {
  it("colonna punti mancante: assente nella fonte, e la riga si legge lo stesso", () => {
    const esito = parseStandings(richiesta(pagina(blocco([riga(1, "Alfa", { senzaPunti: true })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.rows[0]?.points).toEqual({ presence: "absent-in-source" });
    // E niente zero travestito da dato.
    expect(esito.value.rows[0]?.points).not.toEqual({ presence: "observed", value: 0 });
  });

  it("andamento recente non pubblicato: assente, non serie vuota", () => {
    const esito = parseStandings(richiesta(pagina(blocco([riga(1, "Alfa", { senzaAndamento: true })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.rows[0]?.recentForm).toEqual({ presence: "absent-in-source" });
  });

  it("con una colonna assente la verifica non si può fare, e lo dice", () => {
    const esito = parseStandings(richiesta(pagina(blocco([riga(1, "Alfa", { senzaPunti: true })]))));
    if (!isRead(esito)) throw new Error("atteso letto");
    const senzaGol: Record<string, unknown> = riga(1, "Alfa");
    delete senzaGol["fatti"];
    const altra = parseStandings(richiesta(pagina(blocco([senzaGol]))));
    if (!isRead(altra)) throw new Error("atteso letto");
    const rigaSenzaGol = altra.value.rows[0];
    if (rigaSenzaGol === undefined) throw new Error("riga mancante");
    expect(rigaSenzaGol.goalsFor).toEqual({ presence: "absent-in-source" });
    expect(goalDifferenceCheck(rigaSenzaGol)).toBe("not-checkable");
  });
});

describe("LA STRUTTURA CAMBIATA SOTTO DI NOI — si dichiara, non si arrangia", () => {
  it("testo vuoto: si ferma", () => {
    const esito = parseStandings(richiesta(""));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.emptyInput);
  });

  it("nessun blocco di dati strutturati: si ferma", () => {
    const esito = parseStandings(richiesta("<html><body><p>solo prosa</p></body></html>"));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.noStructuredBlock);
  });

  it("blocco presente ma illeggibile: si ferma", () => {
    const html = `<script id="dati-di-prova" type="application/json">{ questo non è json </script>`;
    const esito = parseStandings(richiesta(html));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.unreadableBlock);
  });

  it("CLASSIFICA VUOTA: si ferma, invece di consegnare zero righe", () => {
    const esito = parseStandings(richiesta(pagina(blocco([]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.rowsEmpty);
    expect(esito.at).toEqual(["parseStandings", "keys", "rows"]);
  });

  it("UNA RIGA SENZA SQUADRA FERMA TUTTO: mai una classifica a metà", () => {
    const rotta: Record<string, unknown> = riga(2, "Beta");
    delete rotta["insegna"];
    const esito = parseStandings(richiesta(pagina(blocco([riga(1, "Alfa"), rotta]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.rowUnreadable);
    // Il motivo nomina LA FAMIGLIA, non il numero d'ordine della riga.
    expect(esito.reason).toContain(`famiglia di chiavi "teamName"`);
    expect(esito.at).toEqual(["parseStandings", "keys", "teamName"]);
    expect(JSON.stringify(esito)).not.toContain("Alfa");
  });

  it("una riga senza posizione ferma la lettura, e nomina la sua famiglia", () => {
    const rotta: Record<string, unknown> = riga(1, "Alfa");
    delete rotta["posto"];
    const esito = parseStandings(richiesta(pagina(blocco([rotta]))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(`famiglia di chiavi "position"`);
  });

  it("un esito dell'andamento che non si riconosce ferma la riga, invece di accorciare la serie", () => {
    const esito = parseStandings(
      richiesta(pagina(blocco([riga(1, "Alfa", { andamento: ["V", "?", "V"] })]))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(`famiglia di chiavi "recentForm"`);
  });

  it("una tabella che descrive un'altra struttura non trova niente, e lo dichiara", () => {
    const altra = readStandingsShape({
      ...TABELLA_SINTETICA,
      keys: { ...TABELLA_SINTETICA.keys, rows: "^classifica-completa$" },
    });
    if (!isRead(altra)) throw new Error("tabella non leggibile");
    const esito = parseStandings({ ...richiesta(pagina(blocco())), shape: altra.value });
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(STANDINGS_STOP_CODES.rowsNotOne);
    expect(esito.at).toEqual(["parseStandings", "keys", "rows"]);
  });
});

describe("la tabella delle famiglie di chiavi è un ingresso obbligatorio", () => {
  it("una famiglia mancante ferma tutto, e dice QUALE mancava", () => {
    for (const famiglia of STANDINGS_FAMILIES) {
      const rotta = { ...TABELLA_SINTETICA, keys: { ...TABELLA_SINTETICA.keys } };
      delete (rotta.keys as Record<string, unknown>)[famiglia];
      const esito = readStandingsShape(rotta);
      expect(esito.status, famiglia).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, famiglia).toEqual(["standingsShape", "keys", famiglia]);
    }
  });

  it("un modo di dire mancante ferma tutto: senza, l'andamento non si legge", () => {
    for (const modo of STANDINGS_WORDINGS) {
      const rotta: Record<string, unknown> = { ...TABELLA_SINTETICA };
      delete rotta[modo];
      const esito = readStandingsShape(rotta);
      expect(esito.status, modo).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, modo).toEqual(["standingsShape", modo]);
    }
  });
});
