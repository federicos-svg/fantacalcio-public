import { describe, it, expect } from "vitest";
import {
  PAGELLA_ASSENTE,
  PAGELLA_ASSI,
  PAGELLA_ASSI_COMUNI,
  PAGELLA_ASSI_DI_RUOLO,
  PAGELLA_ASSI_TUTTI,
  PAGELLA_ETICHETTE,
  PAGELLA_NON_APPLICABILE,
  PAGELLA_QUARTO_ASSE_IGNOTO,
  PAGELLA_TOTALE_MAX,
  PAGELLA_VOTO_MAX,
  PAGELLA_VOTO_MIN,
  foldLabel,
  pagellaAsseDelRuolo,
  pagellaAsseDichiarato,
  pagellaHasContent,
  pagellaSchema,
  pagellaVotoText,
  pagellaVuota,
  resolvePagella,
  verificaTotale,
  type PagellaScheda,
} from "./pagellaEsperti.js";
import {
  AVVISO_VALUES,
  LISTA_ESPERTI_VALUES,
  PIAZZATI_VALUES,
  RIGORI_VALUES,
  TITOLARITA_VALUES,
} from "./expertScheda.js";
import { TITOLARITA_HEAD, TITOLARITA_LABELS } from "./ui/expertInsight.js";

// Solo fixture sintetiche: qui non compare nessun giocatore, nessuna squadra e
// nessun voto reale — i numeri sono inventati per far girare le regole.
//
// Ogni `describe` di questo file corrisponde a uno dei quattro vincoli del
// brief, e i nomi lo dicono apposta: chi legge un fallimento deve sapere QUALE
// garanzia è caduta, non solo che qualcosa è rosso.

/** Una pagella completa di difensore, coerente col proprio totale (9+7+9+6+8=39). */
const DIFENSORE: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
};

/** Una pagella completa di portiere (1+1+8+1+1=12). */
const PORTIERE: PagellaScheda = {
  voti: {
    pagella_titolarita: 1,
    pagella_media_voto: 1,
    pagella_salute: 8,
    pagella_porta_inviolata: 1,
    pagella_consiglio: 1,
  },
  totaleFonte: 12,
};

describe("pagella — la scala e la forma", () => {
  it("il fondo scala del totale è CALCOLATO dagli assi, non scritto a mano", () => {
    expect(PAGELLA_TOTALE_MAX).toBe(PAGELLA_ASSI * PAGELLA_VOTO_MAX);
    expect(PAGELLA_ASSI).toBe(5);
    expect(PAGELLA_VOTO_MAX).toBe(10);
  });

  it("il vocabolario è quattro assi comuni più due di ruolo, e nient'altro", () => {
    expect(PAGELLA_ASSI_COMUNI).toHaveLength(4);
    expect(PAGELLA_ASSI_DI_RUOLO).toHaveLength(2);
    expect(PAGELLA_ASSI_TUTTI).toHaveLength(6);
    // Cinque assi per giocatore: i quattro comuni più UNO dei due di ruolo.
    expect(PAGELLA_ASSI_COMUNI.length + 1).toBe(PAGELLA_ASSI);
  });

  it("ogni asse ha la sua etichetta, e nessuna etichetta è vuota", () => {
    for (const asse of PAGELLA_ASSI_TUTTI) {
      expect(PAGELLA_ETICHETTE[asse].trim()).not.toBe("");
    }
  });

  it("lo schema accetta 0 e 10 e rifiuta 11, i decimali e i negativi", () => {
    for (const voto of [PAGELLA_VOTO_MIN, PAGELLA_VOTO_MAX]) {
      expect(pagellaSchema.safeParse({ voti: { pagella_salute: voto } }).success).toBe(true);
    }
    for (const voto of [-1, 11, 7.5]) {
      expect(pagellaSchema.safeParse({ voti: { pagella_salute: voto } }).success).toBe(false);
    }
  });

  it("lo schema è strict: una chiave inventata è un errore, non un campo che passa", () => {
    expect(pagellaSchema.safeParse({ voti: { pagella_fantasia: 5 } }).success).toBe(false);
    expect(pagellaSchema.safeParse({ voti: {}, value: 30 }).success).toBe(false);
  });

  it("il totale dichiarato sta fra 0 e il fondo scala", () => {
    expect(pagellaSchema.safeParse({ voti: {}, totaleFonte: PAGELLA_TOTALE_MAX }).success).toBe(true);
    expect(pagellaSchema.safeParse({ voti: {}, totaleFonte: PAGELLA_TOTALE_MAX + 1 }).success).toBe(false);
  });
});

// ── VINCOLO 2 — LA COLLISIONE DI NOME ────────────────────────────────────────
//
// «Titolarità 9/10» della fonte NON è la `titolarita` categorica della scheda.
// Questi test sono la ragione per cui gli id degli assi hanno un prefisso e
// per cui l'etichetta a schermo dice «Titolarità (voto)».

describe("collisione — la titolarità VOTO non può somigliare alla titolarità CATEGORICA", () => {
  /** Ogni superficie con cui il vocabolario categorico della scheda si legge. */
  const CATEGORICO: readonly string[] = [
    "titolarita",
    "percentuale",
    "gerarchia",
    "rigori",
    "piazzati",
    "avvisi",
    // I due campi che le icone accanto al radar hanno aggiunto al contratto:
    // entrano qui perché la guardia copra il vocabolario INTERO e non la
    // fotografia che aveva il giorno in cui è stata scritta.
    "ballottaggio",
    "lista",
    TITOLARITA_HEAD,
    ...TITOLARITA_VALUES,
    ...Object.values(TITOLARITA_LABELS),
    ...RIGORI_VALUES,
    ...PIAZZATI_VALUES,
    ...AVVISO_VALUES,
    ...LISTA_ESPERTI_VALUES,
  ];

  it("nessun id di asse coincide con un campo o un valore categorico della scheda", () => {
    const categorico = new Set(CATEGORICO.map(foldLabel));
    for (const asse of PAGELLA_ASSI_TUTTI) {
      expect(categorico.has(foldLabel(asse)), `l'id «${asse}» è tornato a coincidere`).toBe(false);
    }
  });

  it("nessuna ETICHETTA a schermo della pagella coincide con una scritta categorica", () => {
    // La piega è la stessa con cui due parole si somigliano all'occhio: accenti
    // via, minuscole, punteggiatura a spazi. «TITOLARITÀ» e «Titolarità»
    // sarebbero la stessa scritta, ed è esattamente ciò che questo test nega.
    const categorico = new Set(CATEGORICO.map(foldLabel));
    for (const asse of PAGELLA_ASSI_TUTTI) {
      const etichetta = PAGELLA_ETICHETTE[asse];
      expect(
        categorico.has(foldLabel(etichetta)),
        `l'etichetta «${etichetta}» si legge come la scritta categorica omonima`,
      ).toBe(false);
    }
  });

  it("in particolare: «Titolarità (voto)» non si legge come «TITOLARITÀ»", () => {
    // Il caso singolo, scritto per esteso: è QUESTO che un refactoring
    // distratto riapre, togliendo «(voto)» perché sembra rumore.
    expect(foldLabel(PAGELLA_ETICHETTE.pagella_titolarita)).not.toBe(foldLabel(TITOLARITA_HEAD));
    expect(foldLabel("Titolarità")).toBe(foldLabel(TITOLARITA_HEAD));
  });

  it("foldLabel piega davvero: accenti, maiuscole e punteggiatura", () => {
    expect(foldLabel("TITOLARITÀ")).toBe("titolarita");
    expect(foldLabel("Titolarità (voto)")).toBe("titolarita voto");
    expect(foldLabel("pagella_titolarita")).toBe("pagella titolarita");
  });
});

// ── VINCOLO 1 — IL QUARTO ASSE DIPENDE DAL RUOLO ─────────────────────────────

describe("quarto asse — dipende dal ruolo, e il contratto lo dichiara", () => {
  it("il ruolo sceglie l'asse: porta inviolata ai portieri, bonus al movimento", () => {
    expect(pagellaAsseDelRuolo("P")).toBe("pagella_porta_inviolata");
    for (const role of ["D", "C", "A"] as const) {
      expect(pagellaAsseDelRuolo(role)).toBe("pagella_bonus");
    }
    expect(pagellaAsseDelRuolo(null)).toBeNull();
    expect(pagellaAsseDelRuolo(undefined)).toBeNull();
  });

  it("lo schema RIFIUTA una pagella che porta tutti e due gli assi di ruolo", () => {
    const doppia = {
      voti: { pagella_porta_inviolata: 4, pagella_bonus: 6 },
    };
    const esito = pagellaSchema.safeParse(doppia);
    expect(esito.success).toBe(false);
    // Il messaggio nomina la ragione: chi deposita deve sapere che cosa ha
    // sbagliato, non solo che è stato rifiutato.
    if (!esito.success) {
      expect(esito.error.issues[0]?.message).toContain("dipende dal ruolo");
    }
  });

  it("i due assi di ruolo, presi uno per volta, passano", () => {
    expect(pagellaSchema.safeParse({ voti: { pagella_porta_inviolata: 4 } }).success).toBe(true);
    expect(pagellaSchema.safeParse({ voti: { pagella_bonus: 6 } }).success).toBe(true);
  });

  it("il quarto asse della vista è quello del RUOLO, marcato dipendeDalRuolo", () => {
    const portiere = resolvePagella(PORTIERE, "P");
    expect(portiere.assi[3]?.asse).toBe("pagella_porta_inviolata");
    expect(portiere.assi[3]?.dipendeDalRuolo).toBe(true);
    const difensore = resolvePagella(DIFENSORE, "D");
    expect(difensore.assi[3]?.asse).toBe("pagella_bonus");
    expect(difensore.assi[3]?.dipendeDalRuolo).toBe(true);
    // E SOLO il quarto: gli altri quattro sono comuni a tutti i ruoli.
    for (const index of [0, 1, 2, 4]) {
      expect(difensore.assi[index]?.dipendeDalRuolo).toBe(false);
    }
  });

  it("scheda di movimento su una riga di portiere: il voto NON viene usato, si dichiara", () => {
    // È il caso che «appianare» distruggerebbe: la scheda porta un bonus, la
    // riga è un portiere. Prendere quel 6 e disegnarlo sull'asse «porta
    // inviolata» produrrebbe un radar plausibile e falso.
    const view = resolvePagella(DIFENSORE, "P");
    expect(view.asseAtteso).toBe("pagella_porta_inviolata");
    expect(view.asseDichiarato).toBe("pagella_bonus");
    expect(view.asseIncoerente).toBe(true);
    expect(view.assi[3]?.voto).toBeNull();
    expect(view.assi[3]?.stato).toBe("assente");
    // …e la pagella non è più completa, quindi il totale non si somma.
    expect(view.completa).toBe(false);
    expect(view.totaleRicalcolato).toBeNull();
  });

  it("senza ruolo non si indovina: lo stato è «ruolo_ignoto» e lo dice", () => {
    const view = resolvePagella({ voti: { pagella_salute: 8 } });
    expect(view.assi[3]?.asse).toBeNull();
    expect(view.assi[3]?.stato).toBe("ruolo_ignoto");
    expect(view.assi[3]?.etichetta).toBe(PAGELLA_QUARTO_ASSE_IGNOTO);
    expect(pagellaVotoText(null, "ruolo_ignoto")).not.toBe(PAGELLA_ASSENTE);
  });

  it("senza ruolo, ma con l'asse dichiarato dalla scheda, il quarto asse ha un nome", () => {
    const view = resolvePagella(PORTIERE);
    expect(view.asseAtteso).toBeNull();
    expect(view.assi[3]?.asse).toBe("pagella_porta_inviolata");
    expect(view.asseIncoerente).toBe(false);
  });

  it("pagellaAsseDichiarato legge l'asse che la scheda porta, o niente", () => {
    expect(pagellaAsseDichiarato(PORTIERE)).toBe("pagella_porta_inviolata");
    expect(pagellaAsseDichiarato(DIFENSORE)).toBe("pagella_bonus");
    expect(pagellaAsseDichiarato({ voti: {} })).toBeNull();
  });
});

// ── VINCOLO 3 — IL TOTALE È DERIVATO E SERVE A SMENTIRCI ─────────────────────

describe("totale — si ricalcola, si confronta, e la divergenza si dichiara", () => {
  it("pagella completa e coerente: la somma è la somma, e coincide", () => {
    const view = resolvePagella(DIFENSORE, "D");
    expect(view.completa).toBe(true);
    expect(view.totaleRicalcolato).toBe(39);
    expect(view.totaleFonte).toBe(39);
    expect(view.verificaTotale).toBe("coerente");
  });

  it("il portiere della fixture torna a 12/50", () => {
    const view = resolvePagella(PORTIERE, "P");
    expect(view.totaleRicalcolato).toBe(12);
    expect(view.verificaTotale).toBe("coerente");
  });

  it("divergente: la somma non è quella dichiarata — ed è la PROVA di un errore", () => {
    const view = resolvePagella({ ...DIFENSORE, totaleFonte: 41 }, "D");
    expect(view.totaleRicalcolato).toBe(39);
    expect(view.totaleFonte).toBe(41);
    expect(view.verificaTotale).toBe("divergente");
    // Nessuno dei due numeri è stato buttato via per far tornare l'altro.
    expect(view.totaleRicalcolato).not.toBe(view.totaleFonte);
  });

  it("pagella parziale: NIENTE somma, mai — una somma su 50 con tre addendi è falsa", () => {
    const parziale: PagellaScheda = {
      voti: { pagella_titolarita: 9, pagella_media_voto: 7, pagella_salute: 9 },
      totaleFonte: 39,
    };
    const view = resolvePagella(parziale, "D");
    expect(view.votiPresenti).toBe(3);
    expect(view.completa).toBe(false);
    expect(view.totaleRicalcolato).toBeNull();
    expect(view.verificaTotale).toBe("non_verificabile");
  });

  it("senza totale dichiarato non si accusa nessuno, e lo stato lo dice", () => {
    const { totaleFonte: _ignored, ...senzaTotale } = DIFENSORE;
    const view = resolvePagella(senzaTotale, "D");
    expect(view.totaleRicalcolato).toBe(39);
    expect(view.totaleFonte).toBeNull();
    expect(view.verificaTotale).toBe("senza_totale_dichiarato");
  });

  it("la regola di verifica, presa da sola, copre i cinque esiti", () => {
    expect(verificaTotale(null, null, 0)).toBe("nessun_voto");
    expect(verificaTotale(null, null, 3)).toBe("senza_totale_dichiarato");
    expect(verificaTotale(39, null, 5)).toBe("senza_totale_dichiarato");
    expect(verificaTotale(null, 39, 3)).toBe("non_verificabile");
    // Nessun voto ma un totale dichiarato: c'è qualcosa da confrontare e non
    // abbiamo con che cosa. Non è «nessun voto», è «non verificabile».
    expect(verificaTotale(null, 39, 0)).toBe("non_verificabile");
    expect(verificaTotale(39, 39, 5)).toBe("coerente");
    expect(verificaTotale(39, 41, 5)).toBe("divergente");
  });
});

// ── VINCOLO 4 — «CONSIGLIO ESPERTI» È UN PARERE ──────────────────────────────

describe("consiglio esperti — parere marcato, e niente di direttivo", () => {
  it("solo il quinto asse è marcato «parere»", () => {
    const view = resolvePagella(DIFENSORE, "D");
    expect(view.assi[4]?.asse).toBe("pagella_consiglio");
    expect(view.assi[4]?.parere).toBe(true);
    for (const index of [0, 1, 2, 3]) {
      expect(view.assi[index]?.parere).toBe(false);
    }
  });

  it("i due letterali di onestà restano letterali su ogni vista", () => {
    for (const view of [resolvePagella(DIFENSORE, "D"), pagellaVuota("P"), pagellaVuota()]) {
      expect(view.contributesToIndex).toBe(false);
      expect(view.directive).toBe(false);
    }
  });
});

// ── L'ASSENZA ────────────────────────────────────────────────────────────────

describe("assenza — «non lo so» non è mai zero, e non è mai vuoto", () => {
  it("la pagella vuota ha cinque assi, zero voti e nessun totale", () => {
    const view = pagellaVuota("D");
    expect(view.assi).toHaveLength(PAGELLA_ASSI);
    expect(view.votiPresenti).toBe(0);
    expect(view.completa).toBe(false);
    expect(view.totaleRicalcolato).toBeNull();
    expect(view.verificaTotale).toBe("nessun_voto");
    for (const asse of view.assi) {
      expect(asse.voto).toBeNull();
      expect(asse.stato).toBe("assente");
    }
  });

  it("un voto assente NON diventa zero, e uno zero resta uno zero", () => {
    const zero = resolvePagella({ voti: { pagella_salute: 0 } }, "D");
    expect(zero.assi[2]?.voto).toBe(0);
    expect(zero.assi[2]?.stato).toBe("voto");
    expect(zero.votiPresenti).toBe(1);
    // …mentre l'asse accanto, che non c'è, resta `null` e non 0.
    expect(zero.assi[1]?.voto).toBeNull();
    expect(zero.assi[1]?.stato).toBe("assente");
  });

  it("le tre scritte dell'assenza sono tre, e sono diverse", () => {
    expect(pagellaVotoText(null, "assente")).toBe(PAGELLA_ASSENTE);
    expect(pagellaVotoText(null, "non_applicabile")).toBe(PAGELLA_NON_APPLICABILE);
    expect(pagellaVotoText(7, "voto")).toBe(`7/${PAGELLA_VOTO_MAX}`);
    expect(new Set([
      pagellaVotoText(null, "assente"),
      pagellaVotoText(null, "non_applicabile"),
      pagellaVotoText(null, "ruolo_ignoto"),
    ]).size).toBe(3);
    // Nessuna delle tre è «0», e nessuna è la stringa vuota.
    for (const stato of ["assente", "non_applicabile", "ruolo_ignoto"] as const) {
      const testo = pagellaVotoText(null, stato);
      expect(testo).not.toBe("0");
      expect(testo.trim()).not.toBe("");
    }
  });

  it("una pagella senza niente non ha contenuto; con un solo voto sì", () => {
    expect(pagellaHasContent({ voti: {} })).toBe(false);
    expect(pagellaHasContent({ voti: { pagella_salute: 0 } })).toBe(true);
    expect(pagellaHasContent({ voti: {}, totaleFonte: 12 })).toBe(true);
  });

  it("l'ordine degli assi è quello della fonte, sempre", () => {
    const attesi = [
      "pagella_titolarita",
      "pagella_media_voto",
      "pagella_salute",
      "pagella_bonus",
      "pagella_consiglio",
    ];
    expect(resolvePagella(DIFENSORE, "C").assi.map((a) => a.asse)).toEqual(attesi);
  });
});
