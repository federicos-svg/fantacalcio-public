import { describe, expect, it } from "vitest";

import { absenceIsMeaningful, matchPageSnapshot, rosterCompleteness } from "../src/matchPage.js";
import { PARSE_STOP_CODES, parseMatchPage, type ParseRequest } from "../src/parseMatchPage.js";
import { SOURCE_SHAPE_FAMILIES, readSourceShape, type SourceShape } from "../src/sourceShape.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { isRead } from "../src/readOutcome.js";

// FIXTURE SINTETICHE, E SOLO SINTETICHE.
//
// Nessun HTML reale di nessuna pagina, nessun testo editoriale copiato: si
// costruisce un documento finto con la FORMA misurata il 2026-09-04 — contenuto
// nell'HTML servito più un blocco di dati strutturati accanto — e si misura che
// cosa il parser ne ricava e dove si ferma. Le squadre si chiamano Alfa e Beta.

const PROSA = "questa e' prosa inventata per la prova, e non deve finire da nessuna parte nel candidato";

// LA TABELLA DELLE FAMIGLIE DI CHIAVI È INVENTATA, e apposta: nomi che nessuna
// fonte usa provano che il parser legge quello che gli si descrive e non una
// struttura che conosce già. La tabella vera vive nel privato.
const TABELLA_SINTETICA = {
  structuredBlocks: ['<script id="dati-di-prova"[^>]*>([\\s\\S]*?)</script>'],
  keys: {
    starters: "^undici$",
    bench: "^riserve$",
    substitutions: "^cambi$",
    module: "^disposizione$",
    coach: "^guida$",
    referee: "^direttore$",
    teamName: "^insegna$",
    playerName: "^etichetta$",
    shirtNumber: "^cifra$",
    role: "^mansione$",
    status: "^qualita$",
    homeSide: "^interno$",
    kickOff: "^avvio$",
    matchday: "^turno$",
    substitutionOff: "^esce$",
    substitutionOn: "^entra$",
    minute: "^istante$",
  },
  saysActual: "(effettiv|ufficial)",
  saysProbable: "(probabil|previst)",
};

function tabella(): SourceShape {
  const esito = readSourceShape(TABELLA_SINTETICA);
  if (!isRead(esito)) throw new Error("tabella di prova non leggibile");
  return esito.value;
}

/**
 * La stessa tabella con una famiglia riscritta.
 *
 * Serve soprattutto per le prove sulle chiavi **non ancorate**: `readSourceShape`
 * compila con `new RegExp(pattern, "i")` e non aggiunge ancoraggi, quindi una
 * tabella reale può benissimo contenere `interno` invece di `^interno$` — ed è
 * lì che nascono le ambiguità che il parser deve rifiutare.
 */
function tabellaCon(famiglia: keyof typeof TABELLA_SINTETICA.keys, pattern: string): SourceShape {
  const esito = readSourceShape({
    ...TABELLA_SINTETICA,
    keys: { ...TABELLA_SINTETICA.keys, [famiglia]: pattern },
  });
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

// LA FIXTURE DEVE POTER ESSERE POVERA QUANTO LA PAGINA PEGGIORE.
//
// Una fixture che dà sempre tutti i campi prova solo il ramo felice: il ramo
// «la fonte non espone questo campo» — la distinzione per cui `field.ts`
// esiste — non verrebbe mai eseguito, e la differenza fra «assente nella
// fonte» e «non guardato» resterebbe una buona intenzione invece che una
// misura. Ogni pezzo del giocatore e della squadra si può quindi togliere.
interface OpzioniGiocatore {
  readonly conMaglia?: boolean;
  readonly conRuolo?: boolean;
}

function undici(prefisso: string, opzioni: OpzioniGiocatore = {}): readonly Record<string, unknown>[] {
  return Array.from({ length: 11 }, (_, i) => {
    const giocatore: Record<string, unknown> = { etichetta: `${prefisso} ${String(i + 1)}` };
    if (opzioni.conMaglia !== false) giocatore["cifra"] = i + 1;
    if (opzioni.conRuolo !== false) giocatore["mansione"] = "CEN";
    return giocatore;
  });
}

/**
 * Chi si dichiara in casa. `"primo"` è la pagina normale; gli altri sono le
 * ambiguità che il parser deve rifiutare invece di sciogliere da sé.
 */
type LatoCasa = "primo" | "secondo" | "entrambi" | "contraddittorio";

interface OpzioniBlocco {
  readonly status?: string | null;
  readonly statusCasa?: string;
  readonly referee?: string | null;
  readonly matchday?: number | null;
  readonly kickoff?: string | null;
  readonly conPanchina?: boolean;
  readonly conCambi?: boolean;
  readonly conGuida?: boolean;
  readonly conDisposizione?: boolean;
  readonly conMaglia?: boolean;
  readonly conRuolo?: boolean;
  readonly latoCasaDichiarato?: boolean;
  readonly latoCasa?: LatoCasa;
  /** Una chiave in più nel blocco ospite: serve alle prove sulle chiavi non ancorate. */
  readonly extraTrasferta?: Record<string, unknown>;
}

function blocco(opzioni: OpzioniBlocco = {}): Record<string, unknown> {
  const lato: LatoCasa = opzioni.latoCasa ?? "primo";
  const giocatori: OpzioniGiocatore = { conMaglia: opzioni.conMaglia, conRuolo: opzioni.conRuolo };

  const casa: Record<string, unknown> = {
    insegna: "Alfa",
    undici: undici("Alfa", giocatori),
  };
  if (opzioni.conDisposizione !== false) casa["disposizione"] = "4-3-3";
  if (opzioni.conGuida !== false) casa["guida"] = "Allenatore Alfa";
  if (opzioni.conCambi !== false) casa["cambi"] = [{ esce: "Alfa 11", entra: "Alfa 12" }];
  if (opzioni.latoCasaDichiarato !== false) casa["interno"] = lato !== "secondo";
  if (lato === "contraddittorio") casa["internoBis"] = false;
  if (opzioni.conPanchina !== false) casa["riserve"] = [{ etichetta: "Alfa 12", cifra: 12 }];
  if (opzioni.statusCasa !== undefined) casa["qualita"] = opzioni.statusCasa;

  const trasferta: Record<string, unknown> = {
    insegna: "Beta",
    undici: undici("Beta", giocatori),
  };
  if (opzioni.conDisposizione !== false) trasferta["disposizione"] = "3-5-2";
  if (opzioni.conGuida !== false) trasferta["guida"] = "Allenatore Beta";
  if (opzioni.latoCasaDichiarato !== false) trasferta["interno"] = lato === "secondo" || lato === "entrambi";
  if (opzioni.extraTrasferta !== undefined) Object.assign(trasferta, opzioni.extraTrasferta);

  const partita: Record<string, unknown> = { squadre: [casa, trasferta] };
  if (opzioni.status !== null) partita["qualita"] = opzioni.status ?? "Formazioni ufficiali";
  if (opzioni.referee !== null) partita["direttore"] = opzioni.referee ?? "Arbitro Sintetico";
  if (opzioni.matchday !== null) partita["turno"] = opzioni.matchday ?? 2;
  if (opzioni.kickoff !== null) partita["avvio"] = opzioni.kickoff ?? "2026-09-04T20:45:00+02:00";

  return { radice: { contenuto: { partita } } };
}

/** Il blocco della partita dentro la fixture, senza percorsi scritti a mano ovunque. */
function dentro(meta: Record<string, unknown>): Record<string, unknown> {
  const radice = meta["radice"] as Record<string, unknown>;
  const contenuto = radice["contenuto"] as Record<string, unknown>;
  return contenuto["partita"] as Record<string, unknown>;
}

function richiesta(html: string, extra: Partial<ParseRequest> = {}): ParseRequest {
  return {
    rawHtml: html,
    shape: tabella(),
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
    const partita = dentro(invertito);
    const squadre = partita["squadre"] as unknown[];
    partita["squadre"] = [squadre[1], squadre[0]];
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
    const html = `<script id="dati-di-prova" type="application/json">{ questo non è json </script>`;
    const esito = parseMatchPage(richiesta(html));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.unreadableBlock);
  });

  it("un solo elenco di titolari: si ferma", () => {
    const meta = blocco();
    const partita = dentro(meta);
    (partita["squadre"] as unknown[]).pop();
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.startersNotTwo);
  });

  it("tre elenchi di titolari: si ferma, invece di scegliere i primi due", () => {
    const meta = blocco();
    const partita = dentro(meta);
    const squadre = partita["squadre"] as Record<string, unknown>[];
    partita["squadre"] = [...squadre, { insegna: "Gamma", interno: false, undici: undici("Gamma") }];
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
    const partita = dentro(meta);
    const squadre = partita["squadre"] as Record<string, unknown>[];
    const casa = squadre[0];
    if (casa === undefined) throw new Error("fixture rotta");
    casa["undici"] = [...undici("Alfa").slice(0, 10), { cifra: 11 }];
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

describe("CHI GIOCA IN CASA — dal campo dichiarato, e mai dalla posizione", () => {
  it("dichiara casa solo il primo blocco: la casa è il primo", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ latoCasa: "primo" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.team).toBe("Alfa");
  });

  it("dichiara casa solo il secondo blocco: la casa è il secondo", () => {
    // La prova che nessuna delle due convenzioni di posizione è in mezzo: né
    // «vince il primo» né «vince l'ultimo» può soddisfare insieme questo test e
    // quello sopra, perché l'unico dato che cambia è il campo dichiarato.
    const esito = parseMatchPage(richiesta(pagina(blocco({ latoCasa: "secondo" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.team).toBe("Beta");
    expect(esito.value.away.team).toBe("Alfa");
  });

  it("due blocchi che si dichiarano entrambi in casa: si ferma, e dice quale famiglia", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ latoCasa: "entrambi" }))));
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.homeSideConflicting);
    expect(esito.reason).toContain(`famiglia di chiavi "homeSide"`);
    expect(esito.at).toEqual(["parseMatchPage", "keys", "homeSide"]);
  });

  it("UNA CHIAVE NON ANCORATA NEL BLOCCO OSPITE NON INVERTE PIÙ LA PARTITA", () => {
    // Il caso realistico, non quello di laboratorio: la tabella privata compila
    // le espressioni **non ancorate**, quindi una chiave come `internoFavorito`
    // dentro il blocco ospite cade nella famiglia `homeSide`. Con la vecchia
    // regola «vince l'ultimo» questa pagina restituiva casa=Beta senza
    // fermarsi, e una partita invertita inverte tutto ciò che le sta sopra.
    const html = pagina(blocco({ extraTrasferta: { internoFavorito: true } }));
    const esito = parseMatchPage({ ...richiesta(html), shape: tabellaCon("homeSide", "interno") });
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) throw new Error("una pagina ambigua non deve produrre una partita");
    expect(esito.reason).toContain(PARSE_STOP_CODES.homeSideConflicting);
    // E soprattutto: nessuna partita invertita è uscita di qui.
    expect(JSON.stringify(esito)).not.toContain("Beta");
  });

  it("un solo blocco che si dichiara insieme in casa e in trasferta: si ferma", () => {
    const html = pagina(blocco({ latoCasa: "contraddittorio" }));
    const esito = parseMatchPage({ ...richiesta(html), shape: tabellaCon("homeSide", "interno") });
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.homeSideConflicting);
  });

  it("la stessa politica della natura discorde: si rifiuta, non si arbitra", () => {
    // Due ambiguità della stessa specie devono avere lo stesso esito: era
    // l'incoerenza da cui è nato il difetto.
    const natura = parseMatchPage(
      richiesta(pagina(blocco({ status: "Formazioni ufficiali", statusCasa: "Probabili formazioni" }))),
    );
    const casa = parseMatchPage(richiesta(pagina(blocco({ latoCasa: "entrambi" }))));
    expect(natura.status).toBe("shape-not-recognised");
    expect(casa.status).toBe("shape-not-recognised");
  });
});

describe("due elenchi di titolari, ma nello stesso blocco", () => {
  it("si ferma nel parser, e come problema di struttura", () => {
    // Con una chiave dei titolari non ancorata, `undici` e `undiciDiScorta`
    // cadono nella stessa famiglia dentro lo STESSO oggetto: due elenchi, una
    // squadra sola. Prima lo intercettava `readMatchPage` più a valle, per
    // identità del nome squadra — cioè un problema di contenuto al posto di un
    // problema di struttura, e con un motivo che non nomina la famiglia.
    const meta = {
      radice: {
        contenuto: {
          partita: {
            qualita: "Formazioni ufficiali",
            squadre: [
              {
                insegna: "Alfa",
                interno: true,
                undici: undici("Alfa"),
                undiciDiScorta: undici("Beta"),
              },
            ],
          },
        },
      },
    };
    const esito = parseMatchPage({
      ...richiesta(pagina(meta)),
      shape: tabellaCon("starters", "undici"),
    });
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.startersSameBlock);
    expect(esito.at).toEqual(["parseMatchPage", "keys", "starters"]);
  });
});

describe("un pezzo illeggibile ferma tutto, da qualunque parte stia", () => {
  it("titolare illeggibile in casa: si ferma", () => {
    const meta = blocco();
    const squadre = dentro(meta)["squadre"] as Record<string, unknown>[];
    const casa = squadre[0];
    if (casa === undefined) throw new Error("fixture rotta");
    casa["undici"] = [...undici("Alfa").slice(0, 10), { cifra: 11 }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PARSE_STOP_CODES.lineupUnreadable);
  });

  it("titolare illeggibile in trasferta: si ferma lo stesso", () => {
    // Il gemello del test sopra, e non è una ripetizione: la formazione ospite
    // si legge in un secondo momento, e senza questa prova il controllo su
    // quella metà può sparire senza che nessun test cambi colore.
    const meta = blocco();
    const squadre = dentro(meta)["squadre"] as Record<string, unknown>[];
    const trasferta = squadre[1];
    if (trasferta === undefined) throw new Error("fixture rotta");
    trasferta["undici"] = [...undici("Beta").slice(0, 10), { cifra: 11 }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.lineupUnreadable);
    expect(esito.reason).toContain(`famiglia di chiavi "playerName"`);
    expect(JSON.stringify(esito)).not.toContain("Beta 1");
  });

  it("panchina illeggibile in trasferta: si ferma, e nomina la panchina", () => {
    const meta = blocco();
    const squadre = dentro(meta)["squadre"] as Record<string, unknown>[];
    const trasferta = squadre[1];
    if (trasferta === undefined) throw new Error("fixture rotta");
    trasferta["riserve"] = [{ cifra: 12 }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(`famiglia di chiavi "bench"`);
  });
});

describe("LA FONTE CHE NON ESPONE UN CAMPO — assente nella fonte, mai «non guardato»", () => {
  it("maglia non esposta: assente nella fonte", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conMaglia: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    const primo = esito.value.home.starters;
    if (primo.presence !== "observed") throw new Error("attesi titolari osservati");
    const giocatore = primo.value.players[0];
    if (giocatore === undefined) throw new Error("fixture rotta");
    // Le due assenze non sono la stessa cosa: qui la pagina è stata letta e la
    // maglia lì non c'è. Dire «non guardato» sarebbe un'affermazione su di noi
    // spacciata per un'affermazione sulla fonte.
    expect(giocatore.shirtNumber).toEqual({ presence: "absent-in-source" });
    expect(giocatore.shirtNumber).not.toEqual({ presence: "not-observed" });
  });

  it("maglia esposta: osservata, col suo valore", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const primo = esito.value.home.starters;
    if (primo.presence !== "observed") throw new Error("attesi titolari osservati");
    expect(primo.value.players[0]?.shirtNumber).toEqual({ presence: "observed", value: 1 });
  });

  it("ruolo non esposto: assente nella fonte", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conRuolo: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    const primo = esito.value.home.starters;
    if (primo.presence !== "observed") throw new Error("attesi titolari osservati");
    expect(primo.value.players[0]?.role).toEqual({ presence: "absent-in-source" });
  });

  it("allenatore non esposto: assente nella fonte", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conGuida: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.coach).toEqual({ presence: "absent-in-source" });
    expect(esito.value.away.coach).toEqual({ presence: "absent-in-source" });
  });

  it("modulo non esposto: assente nella fonte", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conDisposizione: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.module).toEqual({ presence: "absent-in-source" });
  });

  it("sostituzioni non esposte: assenti nella fonte, MAI un elenco vuoto", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ conCambi: false }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.substitutions).toEqual({ presence: "absent-in-source" });
    expect(JSON.stringify(esito.value.home.substitutions)).not.toContain("[]");
  });

  it("una pagina spoglia si legge lo stesso, e dichiara ogni assenza", () => {
    // Nessun campo accessorio: è la pagina più povera che il contratto ammetta.
    // Il ramo «assente nella fonte» qui viene percorso per intero, ed è quello
    // che una fixture sempre completa non esegue mai.
    const spoglia = blocco({
      conMaglia: false,
      conRuolo: false,
      conGuida: false,
      conDisposizione: false,
      conPanchina: false,
      conCambi: false,
      referee: null,
      kickoff: null,
    });
    const esito = parseMatchPage(richiesta(pagina(spoglia)));
    if (!isRead(esito)) throw new Error("atteso letto");
    for (const campo of [
      esito.value.home.module,
      esito.value.home.coach,
      esito.value.home.bench,
      esito.value.home.substitutions,
      esito.value.kickOff,
      esito.value.referee,
    ]) {
      expect(campo).toEqual({ presence: "absent-in-source" });
    }
    // E le sezioni che questa pagina non porta affatto restano «non guardate»:
    // è un'affermazione su di noi, e non deve diventare un'affermazione sulla
    // fonte.
    for (const campo of [esito.value.home.unavailable, esito.value.home.suspended, esito.value.home.duels]) {
      expect(campo).toEqual({ presence: "not-observed" });
    }
  });
});

describe("IL CONFINE CON CHI CONSUMA — gli istanti escono col fuso, sempre", () => {
  it("il calcio d'inizio scritto con Z si legge", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ kickoff: "2026-09-04T18:45:00Z" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.kickOff).toEqual({ presence: "observed", value: "2026-09-04T18:45:00Z" });
  });

  it("il calcio d'inizio scritto con lo scostamento si legge", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco({ kickoff: "2026-09-04T20:45:00+02:00" }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.kickOff).toEqual({ presence: "observed", value: "2026-09-04T20:45:00+02:00" });
  });

  it("il momento della lettura senza fuso non entra: la lettura si ferma", () => {
    // Due ore di scostamento attraversano il calcio d'inizio per intero: un
    // istante senza fuso non è incompleto, è malformato, e non deve uscire di
    // qui nemmeno come momento dell'osservazione.
    const esito = parseMatchPage(richiesta(pagina(blocco()), { observedAt: "2026-09-04T18:00:00" }));
    expect(esito.status).toBe("out-of-contract");
    if (isRead(esito)) return;
    expect(esito.at).toEqual(["parseMatchPage", "provenance", "observedAt"]);
  });

  it("nessun istante esce da qui senza fuso, in nessun campo", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const istanti = JSON.stringify(esito.value).match(/\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})?/g) ?? [];
    expect(istanti.length).toBeGreaterThan(0);
    for (const istante of istanti) {
      expect(istante, istante).toMatch(/(Z|[+-]\d{2}:\d{2})$/);
    }
  });
});

describe("LA COMPLETEZZA RESTA «NON SO» — ed è un limite dichiarato della fonte", () => {
  it("undici nomi non dichiarano una lista completa", () => {
    const esito = parseMatchPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(rosterCompleteness(esito.value.home.starters)).toBe("unknown");
    expect(absenceIsMeaningful(esito.value.home.starters)).toBe(false);
  });

  it("nemmeno una pagina che scrive «completa» la fa valere: nessuna famiglia la descrive", () => {
    // Il limite, misurato invece che dichiarato a parole: la `SourceShape` non
    // ha una famiglia di chiavi per la completezza, quindi il parser non ha
    // modo di leggerla nemmeno quando la pagina la scrive. Il giorno in cui la
    // tabella privata porti quella famiglia, questo test cambia colore ed è il
    // segnale che la costante `UNKNOWN_COMPLETENESS` va sciolta.
    const meta = blocco();
    const squadre = dentro(meta)["squadre"] as Record<string, unknown>[];
    const casa = squadre[0];
    if (casa === undefined) throw new Error("fixture rotta");
    casa["completezza"] = "completa";
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.home.completeness).toBe("unknown");
    expect(rosterCompleteness(esito.value.home.starters)).toBe("unknown");
  });
});

describe("la tabella delle famiglie di chiavi è un ingresso obbligatorio", () => {
  it("una tabella completa si legge e si compila", () => {
    const esito = readSourceShape(TABELLA_SINTETICA);
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    for (const famiglia of SOURCE_SHAPE_FAMILIES) {
      expect(esito.value.keys[famiglia], famiglia).toBeInstanceOf(RegExp);
    }
  });

  it("una famiglia mancante ferma tutto, e dice QUALE mancava", () => {
    // Il punto del test: chi legge il motivo non ha scritto il parser, e deve
    // capire che cosa aggiungere alla tabella senza aprire il codice.
    for (const famiglia of SOURCE_SHAPE_FAMILIES) {
      const rotta = { ...TABELLA_SINTETICA, keys: { ...TABELLA_SINTETICA.keys } };
      delete (rotta.keys as Record<string, unknown>)[famiglia];
      const esito = readSourceShape(rotta);
      expect(esito.status, famiglia).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, famiglia).toEqual(["sourceShape", "keys", famiglia]);
    }
  });

  it("un'espressione che non compila è fuori contratto, non un caso da ignorare", () => {
    const rotta = { ...TABELLA_SINTETICA, keys: { ...TABELLA_SINTETICA.keys, starters: "([" } };
    const esito = readSourceShape(rotta);
    expect(esito.status).toBe("out-of-contract");
    if (isRead(esito)) return;
    expect(esito.at).toEqual(["sourceShape", "keys", "starters"]);
  });

  it("senza un modo di estrarre il blocco strutturato non si parte", () => {
    const esito = readSourceShape({ ...TABELLA_SINTETICA, structuredBlocks: [] });
    expect(esito.status).toBe("shape-not-recognised");
  });

  it("una tabella che descrive un'altra struttura non trova niente, e lo dichiara", () => {
    // Stessa pagina, tabella diversa: il parser non «riconosce lo stesso» —
    // prova che legge ciò che gli si descrive e non una forma che conosce già.
    const altra = readSourceShape({
      ...TABELLA_SINTETICA,
      keys: { ...TABELLA_SINTETICA.keys, starters: "^formazione-di-partenza$" },
    });
    if (!isRead(altra)) throw new Error("tabella non leggibile");
    const esito = parseMatchPage({ ...richiesta(pagina(blocco())), shape: altra.value });
    expect(esito.status).toBe("shape-not-recognised");
    if (isRead(esito)) return;
    expect(esito.reason).toContain(PARSE_STOP_CODES.startersNotTwo);
  });
});

describe("i motivi delle fermate si leggono senza aver scritto il parser", () => {
  it("ogni fermata legata a una famiglia la nomina, invece di dare un indice", () => {
    const casi: readonly [string, ParseRequest, string][] = [
      ["titolari", richiesta(pagina(blocco())), "starters"],
      ["natura", richiesta(pagina(blocco({ status: null }))), "status"],
      ["lato casa", richiesta(pagina(blocco({ latoCasaDichiarato: false }))), "homeSide"],
    ];
    // Il primo caso legge davvero: si rompe apposta la famiglia dei titolari.
    const senzaTitolari = readSourceShape({
      ...TABELLA_SINTETICA,
      keys: { ...TABELLA_SINTETICA.keys, starters: "^niente-di-simile$" },
    });
    if (!isRead(senzaTitolari)) throw new Error("tabella non leggibile");
    const primo = casi[0];
    if (primo === undefined) throw new Error("casi vuoti");
    const esiti: readonly [string, ReturnType<typeof parseMatchPage>][] = [
      ["starters", parseMatchPage({ ...primo[1], shape: senzaTitolari.value })],
      ["status", parseMatchPage(casi[1]?.[1] ?? primo[1])],
      ["homeSide", parseMatchPage(casi[2]?.[1] ?? primo[1])],
    ];
    for (const [famiglia, esito] of esiti) {
      expect(isRead(esito), famiglia).toBe(false);
      if (isRead(esito)) continue;
      expect(esito.reason, famiglia).toContain(`famiglia di chiavi "${famiglia}"`);
      expect(esito.at, famiglia).toEqual(["parseMatchPage", "keys", famiglia]);
    }
  });

  it("il titolare illeggibile nomina la famiglia del nome, non un numero d'ordine", () => {
    const meta = blocco();
    const partita = dentro(meta);
    const squadre = partita["squadre"] as Record<string, unknown>[];
    const casa = squadre[0];
    if (casa === undefined) throw new Error("fixture rotta");
    casa["undici"] = [...undici("Alfa").slice(0, 10), { cifra: 11 }];
    const esito = parseMatchPage(richiesta(pagina(meta)));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(`famiglia di chiavi "playerName"`);
  });
});
