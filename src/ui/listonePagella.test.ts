import { describe, it, expect } from "vitest";
import {
  PAGELLA_COLUMN_KEYS,
  PAGELLA_TOTALE_COLUMN_KEY,
  listoneColumns,
  listoneColumnTooltip,
  listonePagellaNote,
  listoneRowHtml,
  pagellaCellText,
  poolHasPagella,
  sortListonePool,
  validateListonePool,
  type ListoneColumn,
  type ListonePlayer,
} from "./listone.js";
import {
  PAGELLA_ASSENTE,
  PAGELLA_ASSI_TUTTI,
  PAGELLA_NON_APPLICABILE,
  type PagellaScheda,
} from "../pagellaEsperti.js";

// I CAMPI DELLA PAGELLA NEL LISTONE — colonne, celle, ordinamento e la nota che
// dichiara l'assenza. Solo righe sintetiche: nessun giocatore, nessuna squadra
// e nessun voto reale.

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

const DIFENSORE: ListonePlayer = {
  name: "Sintetico Uno",
  role: "D",
  club: "ClubUno",
  quotation: 12,
  pagella: BONUS,
};

const PORTIERE: ListonePlayer = {
  name: "Sintetico Due",
  role: "P",
  club: "ClubDue",
  quotation: 5,
  pagella: PORTA,
};

const SENZA: ListonePlayer = { name: "Sintetico Tre", role: "A", club: "ClubTre", quotation: 20 };

function column(key: string): ListoneColumn {
  return { key, label: key, kind: "number", core: false };
}

describe("colonne — compaiono col dato e spariscono con lui", () => {
  it("un pool senza pagella non guadagna nessuna colonna", () => {
    expect(poolHasPagella([SENZA])).toBe(false);
    const keys = listoneColumns([SENZA]).map((c) => c.key);
    for (const key of PAGELLA_COLUMN_KEYS) expect(keys).not.toContain(key);
  });

  it("un pool con pagella porta tutte e sette le colonne, nell'ordine della fonte", () => {
    const keys = listoneColumns([DIFENSORE, SENZA]).map((c) => c.key);
    for (const key of PAGELLA_COLUMN_KEYS) expect(keys).toContain(key);
    const indici = PAGELLA_COLUMN_KEYS.map((k) => keys.indexOf(k));
    expect(indici).toEqual([...indici].sort((a, b) => a - b));
  });

  it("i DUE assi di ruolo hanno DUE colonne, non una condivisa", () => {
    // Una colonna sola sarebbe più compatta e ordinabile in modo sbagliato:
    // metterebbe in fila la porta inviolata dei portieri e il bonus degli
    // attaccanti come se fossero la stessa grandezza.
    expect(PAGELLA_COLUMN_KEYS).toContain("pagella_porta_inviolata");
    expect(PAGELLA_COLUMN_KEYS).toContain("pagella_bonus");
    expect(PAGELLA_COLUMN_KEYS).toHaveLength(7);
  });

  it("la chiave del totale non è l'id di nessun asse", () => {
    expect(PAGELLA_ASSI_TUTTI as readonly string[]).not.toContain(PAGELLA_TOTALE_COLUMN_KEY);
  });

  it("ogni colonna ha un tooltip suo, e non il ripiego generico", () => {
    for (const key of PAGELLA_COLUMN_KEYS) {
      const tooltip = listoneColumnTooltip(column(key));
      expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato");
      expect(tooltip).toContain("Gruppo Esperti");
    }
    // E il tooltip della titolarità dice a chiare lettere che NON è l'altra.
    expect(listoneColumnTooltip(column("pagella_titolarita"))).toContain("NON è la titolarità");
  });
});

describe("celle — n.a. e n/d sono due cose diverse", () => {
  it("nella riga di un difensore «porta inviolata» è n.a., non n/d", () => {
    expect(pagellaCellText(DIFENSORE, "pagella_porta_inviolata")).toBe(PAGELLA_NON_APPLICABILE);
    expect(pagellaCellText(DIFENSORE, "pagella_bonus")).toBe("6");
  });

  it("nella riga di un portiere «bonus» è n.a., non n/d", () => {
    expect(pagellaCellText(PORTIERE, "pagella_bonus")).toBe(PAGELLA_NON_APPLICABILE);
    expect(pagellaCellText(PORTIERE, "pagella_porta_inviolata")).toBe("1");
  });

  it("un asse che esiste per il ruolo ma non è stato estratto dice n/d", () => {
    const parziale: ListonePlayer = {
      ...DIFENSORE,
      pagella: { voti: { pagella_salute: 4 } },
    };
    expect(pagellaCellText(parziale, "pagella_salute")).toBe("4");
    expect(pagellaCellText(parziale, "pagella_media_voto")).toBe(PAGELLA_ASSENTE);
    expect(pagellaCellText(parziale, "pagella_bonus")).toBe(PAGELLA_ASSENTE);
    // …e la porta inviolata resta n.a.: non è un buco, è una domanda che non si fa.
    expect(pagellaCellText(parziale, "pagella_porta_inviolata")).toBe(PAGELLA_NON_APPLICABILE);
  });

  it("uno zero della fonte resta uno zero, e non diventa n/d", () => {
    const zero: ListonePlayer = { ...DIFENSORE, pagella: { voti: { pagella_salute: 0 } } };
    expect(pagellaCellText(zero, "pagella_salute")).toBe("0");
  });

  it("il TOTALE è ricalcolato, e la divergenza porta i due numeri nella cella", () => {
    expect(pagellaCellText(DIFENSORE, PAGELLA_TOTALE_COLUMN_KEY)).toBe("39");
    const bugiardo: ListonePlayer = { ...DIFENSORE, pagella: { ...BONUS, totaleFonte: 41 } };
    expect(pagellaCellText(bugiardo, PAGELLA_TOTALE_COLUMN_KEY)).toBe("39 ≠ 41");
  });

  it("una pagella parziale non produce mai un totale: n/d, non una somma su 50", () => {
    const parziale: ListonePlayer = {
      ...DIFENSORE,
      pagella: { voti: { pagella_titolarita: 9, pagella_salute: 4 }, totaleFonte: 39 },
    };
    expect(pagellaCellText(parziale, PAGELLA_TOTALE_COLUMN_KEY)).toBe(PAGELLA_ASSENTE);
  });

  it("le celle finiscono davvero nell'HTML della riga", () => {
    const columns = listoneColumns([DIFENSORE]).filter((c) => PAGELLA_COLUMN_KEYS.includes(c.key));
    const html = listoneRowHtml(DIFENSORE, columns);
    expect(html).toContain(">9<");
    expect(html).toContain(`>${PAGELLA_NON_APPLICABILE}<`);
    expect(html).toContain(">39<");
  });
});

describe("ordinamento — non confronta due assi diversi", () => {
  it("le celle n.a. e n/d finiscono in fondo, in entrambe le direzioni", () => {
    const pool = [PORTIERE, DIFENSORE, SENZA];
    for (const direction of ["asc", "desc"] as const) {
      const ordinato = sortListonePool(pool, "pagella_bonus", direction);
      // L'unica riga con un bonus è il difensore: sta prima, sempre.
      expect(ordinato[0]?.name).toBe(DIFENSORE.name);
    }
  });

  it("la colonna «porta inviolata» ordina solo fra portieri", () => {
    const secondoPortiere: ListonePlayer = {
      ...PORTIERE,
      name: "Sintetico Quattro",
      pagella: { voti: { ...PORTA.voti, pagella_porta_inviolata: 9 }, totaleFonte: 20 },
    };
    const ordinato = sortListonePool(
      [DIFENSORE, PORTIERE, secondoPortiere],
      "pagella_porta_inviolata",
      "desc",
    );
    expect(ordinato.slice(0, 2).map((p) => p.name)).toEqual([
      secondoPortiere.name,
      PORTIERE.name,
    ]);
    expect(ordinato[2]?.name).toBe(DIFENSORE.name);
  });
});

describe("nota sotto la tabella — l'assenza si dichiara, le prove si contano", () => {
  it("senza nessuna pagella la nota DICE che non ce n'è, e perché", () => {
    const nota = listonePagellaNote([SENZA]);
    expect(nota).toContain("nessun voto nel listone caricato");
    expect(nota).toContain("non è ancora attiva");
    expect(nota).toContain("non uno zero");
  });

  it("con le pagelle la nota conta complete, parziali e vuote", () => {
    const parziale: ListonePlayer = {
      ...DIFENSORE,
      name: "Sintetico Cinque",
      pagella: { voti: { pagella_salute: 4 } },
    };
    const nota = listonePagellaNote([DIFENSORE, PORTIERE, parziale, SENZA]);
    expect(nota).toContain("Righe con pagella: 3");
    expect(nota).toContain("complete 2");
    expect(nota).toContain("parziali 1");
    expect(nota).toContain("senza voti 0");
  });

  it("conta le righe con TOTALE divergente: è la prova di un errore di estrazione", () => {
    const bugiardo: ListonePlayer = {
      ...DIFENSORE,
      name: "Sintetico Sei",
      pagella: { ...BONUS, totaleFonte: 41 },
    };
    expect(listonePagellaNote([DIFENSORE, bugiardo])).toContain(
      "TOTALE divergente da quello dichiarato dalla fonte (cella «somma ≠ dichiarato»): 1",
    );
  });

  it("conta le righe con l'asse di un altro ruolo", () => {
    // Una pagella da movimento appiccicata a una riga di portiere.
    const sbagliata: ListonePlayer = { ...PORTIERE, name: "Sintetico Sette", pagella: BONUS };
    expect(listonePagellaNote([sbagliata])).toContain("Righe con l'asse di un altro ruolo: 1");
  });

  it("la nota dichiara che «Consiglio Esperti» è un parere", () => {
    expect(listonePagellaNote([DIFENSORE])).toContain("è un parere della fonte, non una misura");
  });
});

describe("validazione — fail-closed come il resto del listone", () => {
  const riga = (pagella: unknown): unknown => ({
    name: "Sintetico Otto",
    role: "D",
    club: "ClubQuattro",
    pagella,
  });

  it("una pagella valida passa e arriva nella riga", () => {
    const esito = validateListonePool([riga(BONUS)]);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.pool[0]?.pagella).toEqual(BONUS);
  });

  it("i DUE assi di ruolo insieme invalidano il pool", () => {
    const esito = validateListonePool([
      riga({ voti: { pagella_porta_inviolata: 4, pagella_bonus: 6 } }),
    ]);
    expect(esito.ok).toBe(false);
  });

  it("un voto fuori scala, decimale o non intero invalida il pool", () => {
    for (const voto of [-1, 11, 7.5, "9", null]) {
      expect(validateListonePool([riga({ voti: { pagella_salute: voto } })]).ok).toBe(false);
    }
  });

  it("una chiave di asse inventata invalida il pool", () => {
    expect(validateListonePool([riga({ voti: { pagella_fantasia: 5 } })]).ok).toBe(false);
    expect(validateListonePool([riga({ voti: {}, value: 30 })]).ok).toBe(false);
  });

  it("`pagella` non diventa una colonna extra chiamata «pagella»", () => {
    const esito = validateListonePool([riga(BONUS)]);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.pool[0]?.extra).toBeUndefined();
  });
});
