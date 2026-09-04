import { describe, expect, it } from "vitest";

import { absenceIsMeaningful, matchPageSnapshot, rosterCompleteness } from "../src/matchPage.js";
import { PARSE_STOP_CODES, parseMatchPage, type ParseRequest } from "../src/parseMatchPage.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";

// FIXTURE SINTETICHE, E SOLO SINTETICHE.
//
// Nessun HTML reale di nessuna pagina, nessun testo editoriale copiato: si
// costruisce un documento finto con la FORMA misurata il 2026-09-04 — contenuto
// nell'HTML servito più un blocco di dati strutturati accanto — e si misura che
// cosa il parser ne ricava e dove si ferma. Le squadre si chiamano Alfa e Beta.

const PROSA = "questa e' prosa inventata per la prova, e non deve finire da nessuna parte nel candidato";

function pagina(blocco: unknown): string {
  return (
    `<!doctype html><html><body><p>${PROSA}</p>` +
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(blocco)}</script>` +
    `</body></html>`
  );
}

function undici(prefisso: string): readonly Record<string, unknown>[] {
  return Array.from({ length: 11 }, (_, i) => ({
    name: `${prefisso} ${String(i + 1)}`,
    shirtNumber: i + 1,
    role: "CEN",
  }));
}

interface OpzioniBlocco {
  readonly status?: string | null;
  readonly statusCasa?: string;
  readonly referee?: string | null;
  readonly matchday?: number | null;
  readonly kickoff?: string | null;
  readonly conPanchina?: boolean;
  readonly latoCasaDichiarato?: boolean;
}

function blocco(opzioni: OpzioniBlocco = {}): Record<string, unknown> {
  const casa: Record<string, unknown> = {
    teamName: "Alfa",
    formation: "4-3-3",
    coach: "Allenatore Alfa",
    starters: undici("Alfa"),
    substitutions: [{ playerOut: "Alfa 11", playerIn: "Alfa 12" }],
  };
  if (opzioni.latoCasaDichiarato !== false) casa["isHome"] = true;
  if (opzioni.conPanchina !== false) casa["bench"] = [{ name: "Alfa 12", shirtNumber: 12 }];
  if (opzioni.statusCasa !== undefined) casa["status"] = opzioni.statusCasa;

  const trasferta: Record<string, unknown> = {
    teamName: "Beta",
    formation: "3-5-2",
    coach: "Allenatore Beta",
    starters: undici("Beta"),
  };
  if (opzioni.latoCasaDichiarato !== false) trasferta["isHome"] = false;

  const partita: Record<string, unknown> = { teams: [casa, trasferta] };
  if (opzioni.status !== null) partita["status"] = opzioni.status ?? "Formazioni ufficiali";
  if (opzioni.referee !== null) partita["referee"] = opzioni.referee ?? "Arbitro Sintetico";
  if (opzioni.matchday !== null) partita["matchday"] = opzioni.matchday ?? 2;
  if (opzioni.kickoff !== null) partita["kickoff"] = opzioni.kickoff ?? "2026-09-04T20:45:00+02:00";

  return { props: { pageProps: { match: partita } } };
}

function richiesta(html: string, extra: Partial<ParseRequest> = {}): ParseRequest {
  return {
    rawHtml: html,
    source: "testata sintetica",
    page: "pagina della partita",
    observedAt: "2026-09-04T18:00:00+02:00",
    requestedMatchday: 2,
    ...extra,
  };
}

describe("la pagina con la forma osservata si legge per intero", () => {
  it("produce una pagina partita valida per il contratto", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    expect(esito.value.home.team).toBe("Alfa");
    expect(esito.value.away.team).toBe("Beta");
    expect(esito.value.home.starters.presence).toBe("observed");
  });

  it("casa e trasferta vengono dal campo dichiarato, non dall'ordine degli elenchi", () => {
    // Stesso documento con l'ordine invertito: se il parser guardasse l'ordine,
    // qui scambierebbe le squadre — e le scambierebbe in ogni misura futura.
    const invertito = blocco();
    const partita = (invertito["props"] as Record<string, Record<string, Record<string, unknown>>>)["pageProps"]?.[
      "match"
    ] as Record<string, unknown>;
    const squadre = partita["teams"] as unknown[];
    partita["teams"] = [squadre[1], squadre[0]];
    const esito = parseMatchPage(richiesta(pagina(invertito)));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.team).toBe("Alfa");
    expect(esito.value.away.team).toBe("Beta");
  });

  it("nessuna prosa della pagina entra nel risultato", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    expect(JSON.stringify(esito)).not.toContain("prosa inventata");
  });

  it("è pura: due letture dello stesso testo danno lo stesso risultato", () => {
    const html = pagina(blocco());
    expect(parseMatchPage(richiesta(html))).toEqual(parseMatchPage(richiesta(html)));
  });

  it("il momento della lettura lo passa chi chiama: qui non c'è orologio", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco()), { observedAt: "2026-09-04T19:30:00+02:00" }));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.observedAt).toBe("2026-09-04T19:30:00+02:00");
    expect(matchPageSnapshot(esito.value)).toBe("before-kick-off");
  });
});

describe("la panchina dichiarata e la panchina che non c'è", () => {
  it("panchina dichiarata: si legge", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.bench.presence).toBe("observed");
  });

  it("panchina assente: è un'assenza dichiarata, MAI una panchina vuota", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conPanchina: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    // La squadra in trasferta non ha mai avuto la sezione panchina in questa
    // fixture: entrambe devono risultare assenti, non vuote.
    expect(esito.value.home.bench).toEqual({ presence: "absent-in-source" });
    expect(esito.value.away.bench).toEqual({ presence: "absent-in-source" });
  });

  it("la completezza resta «non so», e l'assenza di un nome non conta", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(rosterCompleteness(esito.value.home.starters)).toBe("unknown");
    expect(rosterCompleteness(esito.value.home.bench)).toBe("unknown");
    expect(esito.value.home.completeness).toBe("unknown");
    // È il punto: undici nomi non dichiarano una lista completa, quindi chi
    // manca dall'elenco non è «previsto fuori» — è silenzio.
    expect(absenceIsMeaningful(esito.value.home.starters)).toBe(false);
  });
});

describe("probabile e effettiva: si dichiarano, non si deducono", () => {
  it("una pagina che dichiara le ufficiali produce formazioni effettive", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ status: "Formazioni ufficiali" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.nature).toBe("actual");
    expect(esito.value.away.nature).toBe("actual");
  });

  it("una pagina che dichiara le probabili produce formazioni probabili", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ status: "Probabili formazioni" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.nature).toBe("probable");
  });

  it("una pagina che non lo dichiara si ferma", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ status: null }))));
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.natureUndeclared);
  });

  it("due dichiarazioni discordi non si arbitrano", () => {
    const esito = parseMatchPage(
      richiesta(pagina(blocco({ status: "Formazioni ufficiali", statusCasa: "Probabili formazioni" }))),
    );
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.natureConflicting);
  });
});

describe("l'arbitro c'è oppure non c'è", () => {
  it("arbitro esposto: si legge", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.referee).toEqual({ presence: "observed", value: "Arbitro Sintetico" });
  });

  it("arbitro non esposto: assente nella fonte, e la pagina si legge lo stesso", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ referee: null }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.referee).toEqual({ presence: "absent-in-source" });
  });
});

describe("la giornata: dichiarata, chiesta, oppure ignota", () => {
  it("dichiarata dalla pagina: vale", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ matchday: 3 }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBe(3);
  });

  it("non dichiarata: resta quella che avevamo chiesto, e NON vale come dichiarata", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ matchday: null }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "requested-by-caller", number: 2 });
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBeNull();
  });

  it("non dichiarata e non chiesta: non osservata", () => {
    const esito = parseMatchPage(
      richiesta(pagina(blocco({ matchday: null })), { requestedMatchday: null }),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "unobserved" });
  });
});

describe("il calcio d'inizio serve con il fuso, o non serve", () => {
  it("con fuso: si legge", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.kickOff).toEqual({ presence: "observed", value: "2026-09-04T20:45:00+02:00" });
  });

  it("senza fuso: assente, invece che ordinato a caso", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ kickoff: "2026-09-04T20:45:00" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.kickOff).toEqual({ presence: "absent-in-source" });
    expect(matchPageSnapshot(esito.value)).toBe("undetermined");
  });
});

describe("LA STRUTTURA CAMBIATA SOTTO DI NOI — si dichiara, non si arrangia", () => {
  it("nessun blocco di dati strutturati: si ferma", () => {
    const esito = parseMatchPage(richiesta("<html><body><p>solo prosa</p></body></html>"));
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.noStructuredBlock);
  });

  it("blocco presente ma illeggibile: si ferma", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{ questo non è json </script>`;
    const esito = parseMatchPage(richiesta(html));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.unreadableBlock);
  });

  it("un solo elenco di titolari: si ferma", () => {
    const meta = blocco();
    const partita = ((meta["props"] as Record<string, Record<string, unknown>>)["pageProps"] as Record<string, unknown>)[
      "match"
    ] as Record<string, unknown>;
    (partita["teams"] as unknown[]).pop();
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.startersNotTwo);
  });

  it("tre elenchi di titolari: si ferma, invece di scegliere i primi due", () => {
    const meta = blocco();
    const partita = ((meta["props"] as Record<string, Record<string, unknown>>)["pageProps"] as Record<string, unknown>)[
      "match"
    ] as Record<string, unknown>;
    const squadre = partita["teams"] as Record<string, unknown>[];
    partita["teams"] = [...squadre, { teamName: "Gamma", isHome: false, starters: undici("Gamma") }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.startersNotTwo);
  });

  it("UN TITOLARE ILLEGGIBILE FERMA TUTTO: mai una formazione a metà", () => {
    // È il difetto che questo test esiste per rendere impossibile: saltare
    // l'elemento che non si legge produrrebbe dieci titolari invece di undici,
    // e a valle sembrerebbe una squadra con pochi giocatori — un dato falso con
    // l'aria di un dato vero.
    const meta = blocco();
    const partita = ((meta["props"] as Record<string, Record<string, unknown>>)["pageProps"] as Record<string, unknown>)[
      "match"
    ] as Record<string, unknown>;
    const squadre = partita["teams"] as Record<string, unknown>[];
    const casa = squadre[0];
    if (casa === undefined) throw new Error("fixture rotta");
    casa["starters"] = [...undici("Alfa").slice(0, 10), { shirtNumber: 11 }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.lineupUnreadable);
    // E nessun pezzo di formazione trapela nell'esito.
    expect(JSON.stringify(esito)).not.toContain("Alfa 1");
  });

  it("il lato di casa non dichiarato ferma la lettura", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ latoCasaDichiarato: false }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.homeSideUndeclared);
  });

  it("testo vuoto: si ferma", () => {
    const esito = parseMatchPage(richiesta(""));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.emptyInput);
  });

  it("ogni fermata porta un codice stabile e il punto in cui si è fermata", () => {
    const esito = parseMatchPage(richiesta("<html></html>"));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.at).toEqual(["parseMatchPage"]);
    expect(Object.values(PARSE_STOP_CODES).some((code) => esito.reason.startsWith(code))).toBe(true);
  });
});
