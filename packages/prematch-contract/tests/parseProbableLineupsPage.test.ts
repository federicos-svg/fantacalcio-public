import { describe, expect, it } from "vitest";

import { absenceIsMeaningful, canStandAsTruth, rosterCompleteness } from "../src/matchPage.js";
import {
  PROBABLE_LINEUPS_FAMILIES,
  PROBABLE_LINEUPS_STOP_CODES,
  PROBABLE_LINEUPS_WORDINGS,
  parseProbableLineupsPage,
  readProbableLineupsShape,
  type ParseProbableLineupsRequest,
  type ProbableLineupsShape,
} from "../src/parseProbableLineupsPage.js";
import { matchdayIfDeclared } from "../src/provenance.js";
import { MAX_LABEL_LENGTH, isRead } from "../src/readOutcome.js";

// FIXTURE SINTETICHE, E SOLO SINTETICHE.
//
// Nessun HTML reale, nessun testo editoriale copiato: si costruisce un
// documento finto con la forma di una pagina che porta le probabili di tutte le
// partite di una giornata, e si misura che cosa il parser ne ricava e dove si
// ferma. Le squadre si chiamano Alfa, Beta, Gamma, Delta.

const PROSA = "questa e' prosa inventata per la prova, e non deve finire da nessuna parte nel candidato";

// LA TABELLA È INVENTATA, e apposta: nomi che nessuna fonte usa provano che il
// parser legge quello che gli si descrive e non una struttura che conosce già.
const TABELLA_SINTETICA = {
  structuredBlocks: ['<script id="dati-di-prova"[^>]*>([\\s\\S]*?)</script>'],
  keys: {
    matches: "^incontri$",
    teamName: "^insegna$",
    starters: "^undici$",
    bench: "^riserve$",
    playerName: "^etichetta$",
    shirtNumber: "^cifra$",
    role: "^mansione$",
    module: "^disposizione$",
    coach: "^guida$",
    status: "^qualita$",
    homeSide: "^interno$",
    matchday: "^turno$",
    startersCompleteness: "^undici-copertura$",
    benchCompleteness: "^riserve-copertura$",
    lineupCompleteness: "^copertura$",
  },
  saysActual: "(effettiv|ufficial)",
  saysProbable: "(probabil|previst)",
  saysComplete: "(completa|intera)",
  saysPartial: "(parziale|incompleta)",
  // Il separatore con cui questa fonte inventata infila piu' nomi in un campo
  // solo. E' una voce obbligatoria della tabella: una fonte che non lo fa
  // dichiara un'espressione che non corrisponde a niente, come qui sotto nella
  // prova della panchina scritta come riga.
  joinsNames: "\\s*\\|\\s*",
};

function tabella(): ProbableLineupsShape {
  const esito = readProbableLineupsShape(TABELLA_SINTETICA);
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

function undici(prefisso: string): readonly Record<string, unknown>[] {
  return Array.from({ length: 11 }, (_, i) => ({
    etichetta: `${prefisso} ${String(i + 1)}`,
    cifra: i + 1,
    mansione: "CEN",
  }));
}

interface OpzioniSquadra {
  readonly conPanchina?: boolean;
  readonly undiciCopertura?: string;
  readonly riserveCopertura?: string;
  readonly copertura?: string;
  readonly latoCasaDichiarato?: boolean;
}

function squadra(nome: string, inCasa: boolean, opzioni: OpzioniSquadra = {}): Record<string, unknown> {
  const blocco: Record<string, unknown> = {
    insegna: nome,
    disposizione: "4-3-3",
    guida: `Allenatore ${nome}`,
    undici: undici(nome),
  };
  if (opzioni.latoCasaDichiarato !== false) blocco["interno"] = inCasa;
  if (opzioni.conPanchina !== false) blocco["riserve"] = [{ etichetta: `${nome} 12`, cifra: 12 }];
  if (opzioni.undiciCopertura !== undefined) blocco["undici-copertura"] = opzioni.undiciCopertura;
  if (opzioni.riserveCopertura !== undefined) blocco["riserve-copertura"] = opzioni.riserveCopertura;
  if (opzioni.copertura !== undefined) blocco["copertura"] = opzioni.copertura;
  return blocco;
}

interface OpzioniPagina {
  readonly status?: string | null;
  readonly matchday?: number | null;
  readonly incontri?: readonly Record<string, unknown>[];
  readonly casa?: OpzioniSquadra;
}

function blocco(opzioni: OpzioniPagina = {}): Record<string, unknown> {
  const incontri = opzioni.incontri ?? [
    { squadre: [squadra("Alfa", true, opzioni.casa ?? {}), squadra("Beta", false)] },
    { squadre: [squadra("Gamma", true), squadra("Delta", false)] },
  ];
  const pagina: Record<string, unknown> = { incontri };
  if (opzioni.status !== null) pagina["qualita"] = opzioni.status ?? "Probabili formazioni";
  if (opzioni.matchday !== null) pagina["turno"] = opzioni.matchday ?? 3;
  return { radice: { contenuto: pagina } };
}

function richiesta(html: string, extra: Partial<ParseProbableLineupsRequest> = {}): ParseProbableLineupsRequest {
  return {
    rawHtml: html,
    shape: tabella(),
    source: "testata sintetica",
    page: "probabili di giornata",
    observedAt: "2026-09-04T18:00:00+02:00",
    requestedMatchday: 3,
    ...extra,
  };
}

describe("la pagina completa si legge per intero", () => {
  it("produce tutte le partite, ciascuna con le sue due squadre", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco())));
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    expect(esito.value.matches).toHaveLength(2);
    expect(esito.value.matches.map((partita) => [partita.home.team, partita.away.team])).toEqual([
      ["Alfa", "Beta"],
      ["Gamma", "Delta"],
    ]);
  });

  it("casa e trasferta vengono dal campo dichiarato, non dall'ordine degli elenchi", () => {
    const meta = blocco({
      incontri: [{ squadre: [squadra("Beta", false), squadra("Alfa", true)] }],
    });
    const esito = parseProbableLineupsPage(richiesta(pagina(meta)));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.matches[0]?.home.team).toBe("Alfa");
    expect(esito.value.matches[0]?.away.team).toBe("Beta");
  });

  it("nessuna prosa della pagina entra nel risultato", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco())));
    expect(JSON.stringify(esito)).not.toContain("prosa inventata");
  });

  it("è pura: due letture dello stesso testo danno lo stesso risultato", () => {
    const html = pagina(blocco());
    expect(parseProbableLineupsPage(richiesta(html))).toEqual(parseProbableLineupsPage(richiesta(html)));
  });

  it("il momento della lettura lo passa chi chiama: qui non c'è orologio", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco()), { observedAt: "2026-09-04T09:15:00+02:00" }),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.observedAt).toBe("2026-09-04T09:15:00+02:00");
  });
});

describe("LA COMPLETEZZA SI DICHIARA, E «NON SO» È UN VALORE", () => {
  it("pagina che non dichiara niente: tutte e tre le completezze sono «non so»", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(casa.starters)).toBe("unknown");
    expect(rosterCompleteness(casa.bench)).toBe("unknown");
    expect(casa.completeness).toBe("unknown");
    // È il punto: undici nomi non dichiarano una lista completa, quindi chi
    // manca dall'elenco non è «previsto fuori» — è silenzio.
    expect(absenceIsMeaningful(casa.starters)).toBe(false);
  });

  it("undici dichiarato completo: l'assenza di un nome comincia a significare qualcosa", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ casa: { undiciCopertura: "lista completa" } }))),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(casa.starters)).toBe("declared-complete");
    expect(absenceIsMeaningful(casa.starters)).toBe(true);
  });

  it("LISTA PARZIALE: si legge parziale, e l'assenza torna a non significare niente", () => {
    const esito = parseProbableLineupsPage(
      richiesta(
        pagina(
          blocco({
            casa: { undiciCopertura: "lista completa", riserveCopertura: "elenco parziale" },
          }),
        ),
      ),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(casa.bench)).toBe("declared-partial");
    expect(absenceIsMeaningful(casa.bench)).toBe(false);
  });

  it("le tre dichiarazioni sono tre fatti diversi, e la terza non è la congiunzione delle prime due", () => {
    const esito = parseProbableLineupsPage(
      richiesta(
        pagina(
          blocco({
            casa: {
              undiciCopertura: "lista completa",
              riserveCopertura: "lista completa",
              copertura: "elenco parziale",
            },
          }),
        ),
      ),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(casa.starters)).toBe("declared-complete");
    expect(rosterCompleteness(casa.bench)).toBe("declared-complete");
    expect(casa.completeness).toBe("declared-partial");
  });

  it("una dichiarazione che non si riconosce resta «non so», MAI completa per difetto", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ casa: { undiciCopertura: "chissa'" } }))),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(casa.starters)).toBe("unknown");
    expect(absenceIsMeaningful(casa.starters)).toBe(false);
  });
});

describe("un blocco mancante: assenza dichiarata, non riempimento", () => {
  it("panchina assente: è un'assenza dichiarata, MAI una panchina vuota", () => {
    const meta = blocco({
      incontri: [{ squadre: [squadra("Alfa", true, { conPanchina: false }), squadra("Beta", false)] }],
    });
    const esito = parseProbableLineupsPage(richiesta(pagina(meta)));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.matches[0]?.home.bench).toEqual({ presence: "absent-in-source" });
    // E la panchina che non c'è non porta nemmeno una completezza inventata.
    expect(rosterCompleteness(esito.value.matches[0]?.home.bench ?? { presence: "not-observed" })).toBe("unknown");
  });

  it("le sezioni che questa pagina non porta sono «non guardate», non «assenti nella fonte»", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(casa.substitutions).toEqual({ presence: "not-observed" });
    expect(casa.unavailable).toEqual({ presence: "not-observed" });
    expect(casa.duels).toEqual({ presence: "not-observed" });
  });
});

describe("probabile e effettiva: si dichiarano, non si deducono", () => {
  it("una pagina che non lo dichiara produce formazioni di natura ignota, non una fermata", () => {
    // LA DECISIONE, IN UNA PROVA. Prima questa pagina non produceva niente: la
    // fonte non scriveva una parola, e ventidue giocatori veri finivano nel
    // cestino. Ora escono, e ciascuno si porta addosso il fatto che nessuno sa
    // se sia una previsione o la verita'.
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ status: null }))));
    expect(esito.status).toBe("read");
    if (!isRead(esito)) return;
    expect(esito.value.matches[0]?.home.nature).toBe("undeclared");
    expect(esito.value.matches[0]?.away.nature).toBe("undeclared");
  });

  it("la natura ignota non e' verita', e nessuno puo' scambiarla per tale", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ status: null }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    const casa = esito.value.matches[0]?.home;
    if (casa === undefined) throw new Error("partita mancante");
    expect(canStandAsTruth(casa.nature)).toBe(false);
    // E nemmeno una formazione dichiarata probabile lo e': la verita' la dice
    // solo chi scrive «effettiva».
    expect(canStandAsTruth("probable")).toBe(false);
    expect(canStandAsTruth("actual")).toBe(true);
  });

  it("dichiarata probabile resta probabile: il valore ignoto non mangia le dichiarazioni", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco())));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.matches[0]?.home.nature).toBe("probable");
  });

  it("una pagina di probabili che dichiara formazioni effettive è fuori contratto", () => {
    // Non perché sia impossibile, ma perché mescola due cose che a valle non si
    // separano più: la verità su chi è sceso in campo sta sulla pagina partita.
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ status: "Formazioni ufficiali" }))));
    expect(esito.status).toBe("out-of-contract");
  });

  it("due dichiarazioni discordi nella stessa partita non si arbitrano", () => {
    const casa = squadra("Alfa", true);
    casa["qualita"] = "Probabili formazioni";
    const trasferta = squadra("Beta", false);
    trasferta["qualita"] = "Formazioni ufficiali";
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ status: null, incontri: [{ squadre: [casa, trasferta] }] }))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.natureConflicting);
  });
});

describe("la giornata: dichiarata, chiesta, oppure ignota", () => {
  it("dichiarata dalla pagina: vale", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ matchday: 5 }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBe(5);
  });

  it("non dichiarata: resta quella che avevamo chiesto, e NON vale come dichiarata", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ matchday: null }))));
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "requested-by-caller", number: 3 });
    expect(matchdayIfDeclared(esito.value.provenance.matchday)).toBeNull();
  });

  it("non dichiarata e non chiesta: non osservata", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ matchday: null })), { requestedMatchday: null }),
    );
    if (!isRead(esito)) throw new Error("atteso letto");
    expect(esito.value.provenance.matchday).toEqual({ origin: "unobserved" });
  });
});

describe("LA STRUTTURA CAMBIATA SOTTO DI NOI — si dichiara, non si arrangia", () => {
  it("testo vuoto: si ferma", () => {
    const esito = parseProbableLineupsPage(richiesta(""));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.emptyInput);
  });

  it("nessun blocco di dati strutturati: si ferma", () => {
    const esito = parseProbableLineupsPage(richiesta("<html><body><p>solo prosa</p></body></html>"));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.noStructuredBlock);
  });

  it("blocco presente ma illeggibile: si ferma", () => {
    const html = `<script id="dati-di-prova" type="application/json">{ questo non è json </script>`;
    const esito = parseProbableLineupsPage(richiesta(html));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.unreadableBlock);
  });

  it("ELENCO DI PARTITE VUOTO: si ferma, invece di dire «giornata senza partite»", () => {
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [] }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.matchesEmpty);
    expect(esito.at).toEqual(["parseProbableLineupsPage", "keys", "matches"]);
  });

  it("una partita con una sola squadra: si ferma", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [{ squadre: [squadra("Alfa", true)] }] }))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.startersNotTwo);
  });

  it("UN TITOLARE ILLEGGIBILE FERMA TUTTO: mai una formazione a metà", () => {
    const casa = squadra("Alfa", true);
    casa["undici"] = [...undici("Alfa").slice(0, 10), { cifra: 11 }];
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [{ squadre: [casa, squadra("Beta", false)] }] }))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable);
    expect(esito.reason).toContain(`famiglia di chiavi "playerName"`);
    // E nessun pezzo di formazione trapela nell'esito.
    expect(JSON.stringify(esito)).not.toContain("Alfa 1");
  });

  it("il lato di casa non dichiarato ferma la lettura", () => {
    const esito = parseProbableLineupsPage(
      richiesta(
        pagina(
          blocco({
            incontri: [
              {
                squadre: [
                  squadra("Alfa", true, { latoCasaDichiarato: false }),
                  squadra("Beta", false, { latoCasaDichiarato: false }),
                ],
              },
            ],
          }),
        ),
      ),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.homeSideUndeclared);
  });

  it("una tabella che descrive un'altra struttura non trova niente, e lo dichiara", () => {
    const altra = readProbableLineupsShape({
      ...TABELLA_SINTETICA,
      keys: { ...TABELLA_SINTETICA.keys, matches: "^partite-del-turno$" },
    });
    if (!isRead(altra)) throw new Error("tabella non leggibile");
    const esito = parseProbableLineupsPage({ ...richiesta(pagina(blocco())), shape: altra.value });
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.matchesNotOne);
    expect(esito.at).toEqual(["parseProbableLineupsPage", "keys", "matches"]);
  });
});

describe("la tabella delle famiglie di chiavi è un ingresso obbligatorio", () => {
  it("una famiglia mancante ferma tutto, e dice QUALE mancava", () => {
    for (const famiglia of PROBABLE_LINEUPS_FAMILIES) {
      const rotta = { ...TABELLA_SINTETICA, keys: { ...TABELLA_SINTETICA.keys } };
      delete (rotta.keys as Record<string, unknown>)[famiglia];
      const esito = readProbableLineupsShape(rotta);
      expect(esito.status, famiglia).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, famiglia).toEqual(["probableLineupsShape", "keys", famiglia]);
    }
  });

  it("un modo di dire mancante ferma tutto: senza, la completezza non si legge", () => {
    for (const modo of PROBABLE_LINEUPS_WORDINGS) {
      const rotta: Record<string, unknown> = { ...TABELLA_SINTETICA };
      delete rotta[modo];
      const esito = readProbableLineupsShape(rotta);
      expect(esito.status, modo).toBe("shape-not-recognised");
      if (isRead(esito)) continue;
      expect(esito.at, modo).toEqual(["probableLineupsShape", modo]);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// LE TRE COSE CHE UNA FONTE PUÒ NON SCRIVERE DOVE CI SI ASPETTA
//
// Le forme qui sotto sono inventate, come tutte le altre di questo file, ma il
// problema che riproducono è stato misurato su materiale depositato: il lato di
// casa scritto nel NOME del contenitore invece che in un campo; il nome della
// squadra e il modulo appesi un gradino PIÙ SU dell'elenco dei giocatori; e
// nessuna dichiarazione, da nessuna parte, su che cosa la pagina stia
// pubblicando.
// ────────────────────────────────────────────────────────────────────────────

/** Una partita in cui il lato è il NOME della chiave, e i giocatori stanno più giù. */
function partitaAnnidata(
  nomeCasa: string,
  nomeTrasferta: string,
  chiaviLato: readonly [string, string] = ["interno", "esterno"],
): Record<string, unknown> {
  const squadraAnnidata = (nome: string): Record<string, unknown> => ({
    insegna: nome,
    disposizione: "4-3-3",
    guida: `Allenatore ${nome}`,
    rosa: { undici: undici(nome), riserve: [{ etichetta: `${nome} 12`, cifra: 12 }] },
  });
  return {
    [chiaviLato[0]]: squadraAnnidata(nomeCasa),
    [chiaviLato[1]]: squadraAnnidata(nomeTrasferta),
  };
}

describe("il lato di casa può stare nel NOME del contenitore, non in un campo", () => {
  it("lo legge dal nome, e non dall'ordine in cui le due squadre compaiono", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [partitaAnnidata("Alfa", "Beta")] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    expect(esito.value.matches[0]?.home.team).toBe("Alfa");
    expect(esito.value.matches[0]?.away.team).toBe("Beta");
  });

  it("invertendo l'ordine delle due chiavi il risultato non cambia", () => {
    const rovesciata: Record<string, unknown> = {};
    const dritta = partitaAnnidata("Alfa", "Beta");
    for (const chiave of Object.keys(dritta).reverse()) rovesciata[chiave] = dritta[chiave];
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [rovesciata] }))));
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    expect(esito.value.matches[0]?.home.team).toBe("Alfa");
  });

  it("nessun nome e nessun campo lo dichiarano: si ferma, e lo dice", () => {
    const muta = partitaAnnidata("Alfa", "Beta", ["primo", "secondo"]);
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [muta] }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.homeSideUndeclared);
  });

  it("due squadre in casa nella stessa partita non si arbitrano", () => {
    // Una lo dichiara col nome del contenitore, l'altra con un campo: due
    // dichiarazioni vere separatamente e impossibili insieme.
    const doppia = partitaAnnidata("Alfa", "Beta");
    (doppia["esterno"] as Record<string, unknown>)["interno"] = true;
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [doppia] }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.homeSideAmbiguous);
  });
});

describe("nome squadra e modulo si cercano risalendo, ma mai oltre la propria squadra", () => {
  it("li trova un gradino più su dei giocatori", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [partitaAnnidata("Alfa", "Beta")] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    const casa = esito.value.matches[0]?.home;
    expect(casa?.team).toBe("Alfa");
    expect(casa?.module).toEqual({ presence: "observed", value: "4-3-3" });
    expect(casa?.coach).toEqual({ presence: "observed", value: "Allenatore Alfa" });
  });

  it("un nome appeso alla PARTITA non diventa il nome di tutte e due le squadre", () => {
    // Il pezzo che le due squadre si dividono non appartiene a nessuna delle
    // due: se la risalita ci arrivasse, entrambe si chiamerebbero "Derby" e il
    // contratto le rifiuterebbe piu' a valle, ma solo dopo aver gia' scritto il
    // dato sbagliato.
    const condivisa = partitaAnnidata("Alfa", "Beta");
    delete (condivisa["interno"] as Record<string, unknown>)["insegna"];
    condivisa["insegna"] = "Derby";
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [condivisa] }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable);
    expect(esito.at).toEqual(["parseProbableLineupsPage", "keys", "teamName"]);
  });

  it("il nome dell'altra squadra non viene mai prestato a questa", () => {
    const zoppa = partitaAnnidata("Alfa", "Beta");
    delete (zoppa["interno"] as Record<string, unknown>)["insegna"];
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [zoppa] }))));
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable);
  });
});

describe("un campo che c'è ma non si legge non è un campo che la fonte non ha", () => {
  it("modulo scritto in una forma che non è un modulo: «non guardato», mai «assente»", () => {
    const strana = partitaAnnidata("Alfa", "Beta");
    (strana["interno"] as Record<string, unknown>)["disposizione"] = "433";
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [strana] }))));
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    expect(esito.value.matches[0]?.home.module).toEqual({ presence: "not-observed" });
  });

  it("allenatore dentro un oggetto suo: «non guardato», perché la fonte ce l'ha", () => {
    const annidato = partitaAnnidata("Alfa", "Beta");
    (annidato["interno"] as Record<string, unknown>)["guida"] = { etichetta: "Allenatore Alfa" };
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [annidato] }))));
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    expect(esito.value.matches[0]?.home.coach).toEqual({ presence: "not-observed" });
  });

  it("nessuna chiave di quella famiglia in tutta la discendenza: «assente nella fonte»", () => {
    const senza = partitaAnnidata("Alfa", "Beta");
    delete (senza["interno"] as Record<string, unknown>)["guida"];
    const esito = parseProbableLineupsPage(richiesta(pagina(blocco({ incontri: [senza] }))));
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    expect(esito.value.matches[0]?.home.coach).toEqual({ presence: "absent-in-source" });
  });
});

describe("più nomi in un campo solo non sono un giocatore dal nome lungo", () => {
  function conPanchinaScrittaComeRiga(riga: string): Record<string, unknown> {
    const partita = partitaAnnidata("Alfa", "Beta");
    const rosa = (partita["interno"] as Record<string, unknown>)["rosa"] as Record<string, unknown>;
    rosa["riserve"] = [{ etichetta: riga }];
    return partita;
  }

  it("la riga si apre nei nomi che contiene, e ognuno è un giocatore", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [conPanchinaScrittaComeRiga("Uno | Due | Tre")] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    const panchina = esito.value.matches[0]?.home.bench;
    if (panchina?.presence !== "observed") throw new Error("panchina attesa");
    expect(panchina.value.players.map((g) => g.displayName)).toEqual(["Uno", "Due", "Tre"]);
  });

  it("una riga CORTA non si salva per la sua lunghezza: si apre lo stesso", () => {
    // È il punto della correzione: la guardia contro il testo editoriale è sulla
    // lunghezza, e una riga di nomi sotto soglia passerebbe per UN giocatore.
    const riga = "Uno | Due";
    expect(riga.length).toBeLessThan(MAX_LABEL_LENGTH);
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [conPanchinaScrittaComeRiga(riga)] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    const panchina = esito.value.matches[0]?.home.bench;
    if (panchina?.presence !== "observed") throw new Error("panchina attesa");
    expect(panchina.value.players).toHaveLength(2);
  });

  it("i pezzi non ereditano numero di maglia né ruolo: sarebbero inventati", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [conPanchinaScrittaComeRiga("Uno | Due")] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    const panchina = esito.value.matches[0]?.home.bench;
    if (panchina?.presence !== "observed") throw new Error("panchina attesa");
    for (const giocatore of panchina.value.players) {
      expect(giocatore.shirtNumber).toEqual({ presence: "absent-in-source" });
      expect(giocatore.role).toEqual({ presence: "absent-in-source" });
    }
  });

  it("un pezzo vuoto ferma la lista: quella riga non era l'elenco che sembrava", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [conPanchinaScrittaComeRiga("Uno || Tre")] }))),
    );
    if (isRead(esito)) throw new Error("atteso fermo");
    expect(esito.reason).toContain(PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable);
  });

  it("aprire la riga NON dichiara la panchina completa", () => {
    const esito = parseProbableLineupsPage(
      richiesta(pagina(blocco({ incontri: [conPanchinaScrittaComeRiga("Uno | Due | Tre")] }))),
    );
    if (!isRead(esito)) throw new Error(`atteso letto: ${esito.reason}`);
    const panchina = esito.value.matches[0]?.home.bench;
    if (panchina === undefined) throw new Error("partita mancante");
    expect(rosterCompleteness(panchina)).toBe("unknown");
  });
});
