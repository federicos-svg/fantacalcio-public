import { describe, it, expect } from "vitest";
import {
  EXPERT_VOTE_COLUMN_KEYS,
  NO_MALUS_BONUS_COLUMN_KEY,
  ROLE_AXIS_MARKERS,
  VALUE_NOT_APPLICABLE,
  VALUE_NOT_AVAILABLE,
  emptyRowSignals,
  expertVoteAxisMarker,
  expertVoteAxisTitle,
  listoneCellText,
  listoneColumns,
  listoneColumnTooltip,
  listoneExpertSignalsNote,
  listoneRowHtml,
  sortListonePool,
  validateListonePool,
  type ListoneColumn,
  type ListonePlayer,
  type ListoneRowSignals,
  type ListoneRowSignalsLookup,
} from "./listone.js";
import {
  PAGELLA_ETICHETTE,
  resolvePagella,
  type PagellaScheda,
} from "../pagellaEsperti.js";

// I VOTI DEL GRUPPO ESPERTI NEL LISTONE — colonne, celle, marcatore
// dell'asse, ordinamento e la nota che dichiara l'assenza. Solo righe
// sintetiche: nessun giocatore, nessuna squadra e nessun voto reale.
//
// ── PERCHÉ QUESTO FILE È STATO RISCRITTO, E CHE COSA ASSERIVA PRIMA ─────────
//
// Entrò con #33 (merge in `main`, 2026-08-24) e asseriva DUE regole che la
// decisione del committente del 2026-08-24 ha poi ROVESCIATO:
//
//   1. «i DUE assi di ruolo hanno DUE colonne, non una condivisa»
//      (`PAGELLA_COLUMN_KEYS` lungo 7, con `pagella_porta_inviolata` e
//      `pagella_bonus` come colonne separate);
//   2. «un pool senza pagella non guadagna nessuna colonna» — le colonne
//      comparivano col dato e sparivano con lui.
//
// Decisione del committente, testuale: «Interpreti quella colonna in modo
// promiscuo lasciando "No Malus/Bonus" e lo valorizzi. Tanto è una cosa che
// per i portieri vale in un modo e per i giocatori di movimento in un altro
// ma lo so.» — e le colonne le ha chieste PER NOME, quindi devono esserci
// anche quando il voto non c'è ancora.
//
// Le due asserzioni non sono state tolte né svuotate: sono state INVERTITE, e
// qui sotto mordono sulla regola nuova con la stessa forza con cui mordevano
// sulla vecchia. Ciò che #33 aveva ragione di difendere — `n.a.` diverso da
// `n/d`, e l'ordinamento che non confronta due grandezze diverse in silenzio —
// è rimasto, e ha in più il marcatore che lo rende leggibile nella cella.
//
// LA SORGENTE È UNA SOLA: il deposito delle schede, che arriva qui come
// `ListoneRowSignals`. Il campo `pagella` sulla RIGA di listone, che #33 aveva
// aperto come seconda strada, non esiste più — l'ultimo `describe` lo verifica.

const BONUS: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
};

const PORTA: PagellaScheda = {
  voti: {
    pagella_titolarita: 1,
    pagella_media_voto: 1,
    pagella_salute: 8,
    pagella_porta_inviolata: 1,
    pagella_consiglio: 1,
  },
  totaleFonte: 12,
};

const DIFENSORE: ListonePlayer = { name: "Sintetico Uno", role: "D", club: "ClubUno", quotation: 12 };
const PORTIERE: ListonePlayer = { name: "Sintetico Due", role: "P", club: "ClubDue", quotation: 5 };
const SENZA: ListonePlayer = { name: "Sintetico Tre", role: "A", club: "ClubTre", quotation: 20 };

/** Un deposito sintetico: nome della riga -> pagella depositata. */
function signalsFrom(map: Readonly<Record<string, PagellaScheda>>): ListoneRowSignalsLookup {
  return (p): ListoneRowSignals => {
    const pagella = map[p.name];
    if (pagella === undefined) return emptyRowSignals(p.role);
    return { ...emptyRowSignals(p.role), pagella: resolvePagella(pagella, p.role) };
  };
}

const DEPOSITO = signalsFrom({ [DIFENSORE.name]: BONUS, [PORTIERE.name]: PORTA });

function column(key: string): ListoneColumn {
  return { key, label: key, kind: "number", core: false };
}

describe("colonne — ci sono SEMPRE, anche quando i voti non ci sono", () => {
  // INVERSIONE DICHIARATA di «un pool senza pagella non guadagna nessuna
  // colonna» (#33). Le colonne sono state chieste per nome: una colonna che
  // sparisce quando manca il dato mostrerebbe oggi cinque colonne invece di
  // undici, cioè non consegnerebbe la cosa chiesta.
  it("un pool senza NESSUN voto porta comunque tutte e cinque le colonne", () => {
    const keys = listoneColumns([SENZA]).map((c) => c.key);
    for (const key of EXPERT_VOTE_COLUMN_KEYS) expect(keys).toContain(key);
  });

  it("le cinque colonne stanno nell'ordine dell'elenco del committente", () => {
    const keys = listoneColumns([DIFENSORE, SENZA]).map((c) => c.key);
    const indici = EXPERT_VOTE_COLUMN_KEYS.map((k) => keys.indexOf(k));
    expect(indici.every((i) => i >= 0)).toBe(true);
    expect(indici).toEqual([...indici].sort((a, b) => a - b));
  });

  it("il quarto asse ha UNA colonna sola, non due", () => {
    // INVERSIONE DICHIARATA di «i DUE assi di ruolo hanno DUE colonne, non una
    // condivisa» (#33). Decisione del committente, 2026-08-24: una colonna
    // promiscua, e l'ambiguità dichiarata nella cella dal marcatore.
    const keys = listoneColumns([DIFENSORE]).map((c) => c.key);
    expect(keys).toContain(NO_MALUS_BONUS_COLUMN_KEY);
    expect(keys).not.toContain("pagella_porta_inviolata");
    expect(keys).not.toContain("pagella_bonus");
    expect(EXPERT_VOTE_COLUMN_KEYS).toHaveLength(5);
  });

  it("i DUE assi restano due nel CONTRATTO: è la colonna a essere una", () => {
    // La promiscuità è una scelta di TABELLA. Fondere i due assi nel contratto
    // avrebbe reso impossibile accorgersi di una scheda che porta l'asse
    // sbagliato, che è il difetto che `asseIncoerente` esiste per vedere.
    expect(PAGELLA_ETICHETTE.pagella_porta_inviolata).toBe("Porta inviolata");
    expect(PAGELLA_ETICHETTE.pagella_bonus).toBe("Bonus");
    expect(Object.keys(ROLE_AXIS_MARKERS).sort()).toEqual([
      "pagella_bonus",
      "pagella_porta_inviolata",
    ]);
  });

  it("ogni colonna ha un tooltip suo, e non il ripiego generico", () => {
    for (const key of EXPERT_VOTE_COLUMN_KEYS) {
      const tooltip = listoneColumnTooltip(column(key));
      expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato");
      expect(tooltip).toContain("Gruppo Esperti");
    }
    expect(listoneColumnTooltip(column("pagella_titolarita"))).toContain("NON è la titolarità");
  });

  it("il tooltip del quarto asse nomina ENTRAMBI i ruoli e i due marcatori", () => {
    const tooltip = listoneColumnTooltip(column(NO_MALUS_BONUS_COLUMN_KEY));
    expect(tooltip).toContain("Porta inviolata");
    expect(tooltip).toContain("Bonus");
    expect(tooltip).toContain(ROLE_AXIS_MARKERS.pagella_porta_inviolata);
    expect(tooltip).toContain(ROLE_AXIS_MARKERS.pagella_bonus);
  });
});

describe("celle — la colonna promiscua mostra l'asse del ruolo della riga", () => {
  it("un difensore legge il BONUS in «No Malus/Bonus»", () => {
    expect(listoneCellText(DIFENSORE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe("6");
    expect(expertVoteAxisMarker(DIFENSORE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe(
      ROLE_AXIS_MARKERS.pagella_bonus,
    );
    expect(expertVoteAxisTitle(DIFENSORE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe("Bonus");
  });

  it("un portiere legge la PORTA INVIOLATA nella stessa colonna", () => {
    expect(listoneCellText(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe("1");
    expect(expertVoteAxisMarker(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe(
      ROLE_AXIS_MARKERS.pagella_porta_inviolata,
    );
    expect(expertVoteAxisTitle(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe(
      "Porta inviolata",
    );
  });

  it("i due marcatori sono DIVERSI: è tutto il punto del secondo canale", () => {
    expect(expertVoteAxisMarker(DIFENSORE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).not.toBe(
      expertVoteAxisMarker(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO),
    );
  });

  it("nessuna altra colonna porta un marcatore", () => {
    for (const key of EXPERT_VOTE_COLUMN_KEYS) {
      if (key === NO_MALUS_BONUS_COLUMN_KEY) continue;
      expect(expertVoteAxisMarker(DIFENSORE, key, DEPOSITO)).toBeNull();
    }
  });

  it("una cella senza voto NON porta il marcatore: non c'è nessun numero da qualificare", () => {
    expect(expertVoteAxisMarker(SENZA, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBeNull();
    expect(listoneCellText(SENZA, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).toBe(VALUE_NOT_AVAILABLE);
  });

  it("«n.a.» e «n/d» restano due parole diverse", () => {
    // #33 aveva ragione su questo e la distinzione è stata tenuta (decisione
    // del committente: «tienile distinte»). Con una colonna sola il caso
    // cambia forma: `n.a.` non è più «l'asse non esiste per questo ruolo» —
    // la colonna promiscua mostra sempre quello giusto — ma «la scheda porta
    // il voto dell'ALTRO ruolo», che non si applica a questa riga.
    expect(VALUE_NOT_APPLICABLE).not.toBe(VALUE_NOT_AVAILABLE);
    // Una pagella da movimento appiccicata a una riga di portiere.
    const sbagliata = signalsFrom({ [PORTIERE.name]: BONUS });
    expect(listoneCellText(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, sbagliata)).toBe(
      VALUE_NOT_APPLICABLE,
    );
    // …e il voto straniero non viene usato: nessun 6 nella cella.
    expect(listoneCellText(PORTIERE, NO_MALUS_BONUS_COLUMN_KEY, sbagliata)).not.toBe("6");
  });

  it("un asse comune che esiste ma non è stato estratto dice n/d, non n.a.", () => {
    const parziale = signalsFrom({ [DIFENSORE.name]: { voti: { pagella_salute: 4 } } });
    expect(listoneCellText(DIFENSORE, "pagella_salute", parziale)).toBe("4");
    expect(listoneCellText(DIFENSORE, "pagella_media_voto", parziale)).toBe(VALUE_NOT_AVAILABLE);
    expect(listoneCellText(DIFENSORE, NO_MALUS_BONUS_COLUMN_KEY, parziale)).toBe(
      VALUE_NOT_AVAILABLE,
    );
  });

  it("uno zero della fonte resta uno zero, e non diventa n/d", () => {
    const zero = signalsFrom({ [DIFENSORE.name]: { voti: { pagella_salute: 0 } } });
    expect(listoneCellText(DIFENSORE, "pagella_salute", zero)).toBe("0");
  });

  it("le celle e il marcatore finiscono davvero nell'HTML della riga", () => {
    const columns = listoneColumns([DIFENSORE]).filter((c) =>
      (EXPERT_VOTE_COLUMN_KEYS as readonly string[]).includes(c.key),
    );
    const html = listoneRowHtml(DIFENSORE, columns, false, DEPOSITO);
    expect(html).toContain(">9<");
    expect(html).toContain(`>${ROLE_AXIS_MARKERS.pagella_bonus}<`);
    expect(html).toContain('class="listone-axis-tag"');
    expect(html).toContain('title="Bonus"');
  });
});

// ── IL SECONDO CANALE DEL MARCATORE ──────────────────────────────────────────
//
// Debito dichiarato di #41, confermato da una review indipendente: il
// marcatore portava l'asse per esteso SOLO in un `title`, su uno `<span>` senza
// `tabindex`. Un `title` così lo apre soltanto il passaggio del mouse: chi
// legge a voce non lo incontra (non è contenuto, è un attributo), chi naviga
// da tastiera nemmeno (la cella non riceve il fuoco). Le due lettere restavano
// non spiegate per tutti quelli che non hanno un mouse — proprio nella PR che
// altrove cura l'accessibilità con precisione.

describe("il marcatore dice l'asse anche a chi non ha un mouse", () => {
  const columns = listoneColumns([DIFENSORE]).filter((c) => c.key === NO_MALUS_BONUS_COLUMN_KEY);
  const htmlOf = (p: ListonePlayer, signals = DEPOSITO): string =>
    listoneRowHtml(p, columns, false, signals);

  it("la frase per esteso è CONTENUTO dell'elemento, non solo un attributo", () => {
    // La prova che morde: tolto ogni attributo, la frase deve restare. Un
    // `title` sopravvivrebbe a questa sostituzione solo come attributo, e
    // sparirebbe dal testo.
    const html = htmlOf(DIFENSORE);
    const senzaAttributi = html.replace(/<[^>]*>/g, "");
    expect(senzaAttributi).toContain(PAGELLA_ETICHETTE.pagella_bonus);
    expect(html).toContain(
      `<span class="listone-axis-tag__sr">${PAGELLA_ETICHETTE.pagella_bonus}</span>`,
    );
  });

  it("un portiere sente «Porta inviolata», non «Bonus»", () => {
    const html = htmlOf(PORTIERE);
    expect(html).toContain(
      `<span class="listone-axis-tag__sr">${PAGELLA_ETICHETTE.pagella_porta_inviolata}</span>`,
    );
    expect(html).not.toContain(
      `<span class="listone-axis-tag__sr">${PAGELLA_ETICHETTE.pagella_bonus}</span>`,
    );
    expect(html).toContain(`<span aria-hidden="true">${ROLE_AXIS_MARKERS.pagella_porta_inviolata}</span>`);
  });

  it("la SIGLA è nascosta alla voce: «BO» letto ad alta voce è un suono, non una parola", () => {
    expect(htmlOf(DIFENSORE)).toContain(
      `<span aria-hidden="true">${ROLE_AXIS_MARKERS.pagella_bonus}</span>`,
    );
  });

  it("il `title` resta, per il mouse: due canali, non uno sostituito con l'altro", () => {
    expect(htmlOf(DIFENSORE)).toContain(`title="${PAGELLA_ETICHETTE.pagella_bonus}"`);
  });

  it("ZERO stop di tabulazione aggiunti: nessun `tabindex`, nessun controllo", () => {
    // Il vincolo che ha deciso la forma della soluzione. Un listone da 532
    // righe con un elemento focusabile in più per riga è una tabella che non
    // si attraversa più: la frase accessibile sta sull'elemento che c'era già.
    const html = htmlOf(DIFENSORE);
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a ");
  });

  it("una cella senza voto non porta nemmeno la frase: non c'è niente da qualificare", () => {
    // `data-label` porta comunque il nome della colonna per il ruolo (è
    // l'etichetta della resa stretta): quello che NON deve esserci è il
    // marcatore, sigla e frase comprese.
    const html = htmlOf(SENZA);
    expect(html).not.toContain("listone-axis-tag");
    expect(html).not.toContain('aria-hidden="true"');
    expect(html).toContain(VALUE_NOT_AVAILABLE);
  });

  it("«n.a.» non guadagna un marcatore, e resta diverso da «n/d»", () => {
    // La scheda del portiere porta l'asse del movimento: il voto non si
    // applica, quindi non c'è nessun asse da dichiarare accanto a un numero
    // che non c'è. E le due parole restano due.
    const sbagliata = signalsFrom({ [PORTIERE.name]: BONUS });
    const html = htmlOf(PORTIERE, sbagliata);
    expect(html).toContain(VALUE_NOT_APPLICABLE);
    expect(html).not.toContain("listone-axis-tag");
    expect(VALUE_NOT_APPLICABLE).not.toBe(VALUE_NOT_AVAILABLE);
  });
});

describe("ordinamento — la colonna promiscua dichiara che cosa confronta", () => {
  it("le celle senza voto finiscono in fondo, in entrambe le direzioni", () => {
    for (const direction of ["asc", "desc"] as const) {
      const ordinato = sortListonePool(
        [SENZA, DIFENSORE, PORTIERE],
        NO_MALUS_BONUS_COLUMN_KEY,
        direction,
        DEPOSITO,
      );
      expect(ordinato[2]?.name).toBe(SENZA.name);
    }
  });

  it("ordina i due ruoli INSIEME — ed è per questo che il marcatore esiste", () => {
    // È la conseguenza che #33 temeva e che la decisione del committente ha
    // accettato ad occhi aperti: 6 (bonus di un difensore) e 1 (porta
    // inviolata di un portiere) finiscono nella stessa classifica. Il test la
    // fissa invece di lasciarla implicita, e pretende che ogni riga ordinata
    // porti scritto da quale asse viene il suo numero.
    const ordinato = sortListonePool(
      [PORTIERE, DIFENSORE],
      NO_MALUS_BONUS_COLUMN_KEY,
      "desc",
      DEPOSITO,
    );
    expect(ordinato.map((p) => p.name)).toEqual([DIFENSORE.name, PORTIERE.name]);
    for (const p of ordinato) {
      expect(expertVoteAxisMarker(p, NO_MALUS_BONUS_COLUMN_KEY, DEPOSITO)).not.toBeNull();
    }
  });

  it("il voto dell'asse sbagliato non entra nell'ordinamento", () => {
    const sbagliata = signalsFrom({ [PORTIERE.name]: BONUS, [DIFENSORE.name]: BONUS });
    const ordinato = sortListonePool(
      [PORTIERE, DIFENSORE],
      NO_MALUS_BONUS_COLUMN_KEY,
      "desc",
      sbagliata,
    );
    // Il portiere ha un 6 nella scheda, ma è un bonus: non si applica, quindi
    // non è un valore e finisce in fondo.
    expect(ordinato[0]?.name).toBe(DIFENSORE.name);
    expect(ordinato[1]?.name).toBe(PORTIERE.name);
  });
});

describe("nota sotto la tabella — l'assenza si dichiara, le prove si contano", () => {
  const view = (pagella: PagellaScheda, role: ListonePlayer["role"]) => resolvePagella(pagella, role);

  it("senza nessun voto la nota DICE che non ce n'è, e perché", () => {
    const nota = listoneExpertSignalsNote([]);
    expect(nota).toContain("NON sono ancora estratti");
    expect(nota).toContain("mai uno zero");
    expect(nota).toContain("0–10");
  });

  it("la nota spiega la colonna promiscua e i suoi due marcatori", () => {
    const nota = listoneExpertSignalsNote([]);
    expect(nota).toContain("UNA colonna per DUE assi");
    expect(nota).toContain(ROLE_AXIS_MARKERS.pagella_porta_inviolata);
    expect(nota).toContain(ROLE_AXIS_MARKERS.pagella_bonus);
    expect(nota).toContain(VALUE_NOT_APPLICABLE);
  });

  it("con i voti la nota conta complete e parziali", () => {
    const nota = listoneExpertSignalsNote([
      view(BONUS, "D"),
      view(PORTA, "P"),
      view({ voti: { pagella_salute: 4 } }, "D"),
    ]);
    expect(nota).toContain("Righe con voti: 3");
    expect(nota).toContain("complete 2");
    expect(nota).toContain("parziali 1");
  });

  // Il conteggio è rimasto, la frase no: non accusa più l'estrazione, dice che
  // cosa vale a schermo. Dal 2026-08-29 una divergenza non è più per forza un
  // errore di lettura — la fonte sbaglia le proprie somme — e il riquadro
  // d'asta mostra la somma dei cinque voti (decisione di Pico). Il numero
  // della fonte resta nel dato e questa riga resta l'unico posto in cui il
  // fatto si conta.
  it("conta le righe in cui la somma non coincide col TOTALE della fonte", () => {
    const nota = listoneExpertSignalsNote([
      view(BONUS, "D"),
      view({ ...BONUS, totaleFonte: 41 }, "D"),
    ]);
    expect(nota).toContain("a schermo vale la somma: 1");
    expect(nota).not.toContain("TOTALE divergente da quello dichiarato dalla fonte");
  });

  it("conta le righe la cui scheda porta l'asse di un altro ruolo", () => {
    expect(listoneExpertSignalsNote([view(BONUS, "P")])).toContain(
      `«${VALUE_NOT_APPLICABLE}»): 1`,
    );
  });

  it("la nota dichiara che «Consiglio esperti» è un parere", () => {
    expect(listoneExpertSignalsNote([view(BONUS, "D")]).toLowerCase()).toContain("consiglio esperti");
  });
});

describe("sorgente unica — la riga di listone NON porta più la pagella", () => {
  // Decisione del committente, 2026-08-24: i voti nascono nel deposito delle
  // schede, e un secondo posto da cui leggere gli stessi numeri è un secondo
  // posto che il giorno dopo dice una cosa diversa. #33 aveva aperto quella
  // strada (`ListonePlayer.pagella`); qui si verifica che sia chiusa, e che
  // sia chiusa FAIL-CLOSED — non ignorando il campo, ma rifiutando il pool.
  const riga = (pagella: unknown): unknown => ({
    name: "Sintetico Otto",
    role: "D",
    club: "ClubQuattro",
    pagella,
  });

  it("un payload di listone che porta `pagella` invalida il pool", () => {
    expect(validateListonePool([riga(BONUS)]).ok).toBe(false);
  });

  it("non diventa nemmeno una colonna extra chiamata «pagella»", () => {
    const esito = validateListonePool([riga(BONUS)]);
    expect(esito.ok).toBe(false);
    // Il pool è rifiutato per intero: nessuna riga, quindi nessuna colonna.
    if (!esito.ok) expect(esito.reason.length).toBeGreaterThan(0);
  });

  it("il pool resta valido quando la riga NON porta la pagella", () => {
    const esito = validateListonePool([
      { name: "Sintetico Nove", role: "D", club: "ClubCinque" },
    ]);
    expect(esito.ok).toBe(true);
  });
});
