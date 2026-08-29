import { describe, it, expect } from "vitest";
import {
  PAGELLA_CAVEAT_NOTE,
  PAGELLA_EMPTY_TEXT,
  PAGELLA_ORDER_NOTE,
  PAGELLA_TITLE,
  RADAR_VIEWBOX,
  pagellaAxisMarker,
  pagellaAxisMismatchText,
  pagellaBlockHtml,
  pagellaRadarSvgHtml,
  pagellaSpoken,
  pagellaTotaleText,
  radarPoint,
} from "./pagellaRadar.js";
import {
  PAGELLA_ASSI,
  pagellaVuota,
  resolvePagella,
  type PagellaScheda,
} from "../pagellaEsperti.js";

// Fixture sintetiche: cinque numeri inventati, nessun giocatore reale.

const COMPLETA: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
};

const PARZIALE: PagellaScheda = {
  voti: { pagella_titolarita: 9, pagella_salute: 4 },
};

describe("radar — la geometria", () => {
  it("l'asse 0 sta in alto, e si gira in senso orario", () => {
    const alto = radarPoint(0, 1);
    expect(alto.x).toBe(RADAR_VIEWBOX / 2);
    expect(alto.y).toBeLessThan(RADAR_VIEWBOX / 2);
    // Il secondo asse sta a destra dell'asse verticale: orario, non antiorario.
    expect(radarPoint(1, 1).x).toBeGreaterThan(RADAR_VIEWBOX / 2);
    expect(radarPoint(4, 1).x).toBeLessThan(RADAR_VIEWBOX / 2);
  });

  it("il voto 0 sta al centro e il voto pieno sul bordo", () => {
    const centro = radarPoint(0, 0);
    expect(centro.x).toBe(RADAR_VIEWBOX / 2);
    expect(centro.y).toBe(RADAR_VIEWBOX / 2);
    expect(radarPoint(0, 1).y).toBeLessThan(centro.y);
  });

  it("il disegno è aria-hidden: tutto ciò che dice è scritto nell'elenco", () => {
    const svg = pagellaRadarSvgHtml(resolvePagella(COMPLETA, "D"));
    expect(svg).toContain('aria-hidden="true"');
    // E non contiene testo: nessun <text>, quindi nessun colore che la guardia
    // di contrasto debba leggere da `fill` invece che da `color`.
    expect(svg).not.toContain("<text");
  });

  it("il quarto raggio — quello che cambia col ruolo — è tratteggiato", () => {
    const svg = pagellaRadarSvgHtml(resolvePagella(COMPLETA, "D"));
    expect((svg.match(/pagella-radar__spoke--role/g) ?? []).length).toBe(1);
    expect((svg.match(/class="pagella-radar__spoke/g) ?? []).length).toBe(PAGELLA_ASSI);
  });
});

describe("radar — che cosa si rifiuta di disegnare", () => {
  it("pagella COMPLETA: poligono più cinque punti", () => {
    const svg = pagellaRadarSvgHtml(resolvePagella(COMPLETA, "D"));
    expect(svg).toContain("pagella-radar__shape");
    expect((svg.match(/pagella-radar__dot/g) ?? []).length).toBe(PAGELLA_ASSI);
  });

  it("pagella PARZIALE: i punti che ci sono, e NESSUN poligono", () => {
    // Un poligono con un vertice mancante lo disegnerebbe al centro, cioè come
    // uno zero: la forma direbbe «pessimo» dove il dato dice «non lo so».
    const svg = pagellaRadarSvgHtml(resolvePagella(PARZIALE, "D"));
    expect(svg).not.toContain("pagella-radar__shape");
    expect((svg.match(/pagella-radar__dot/g) ?? []).length).toBe(2);
  });

  it("pagella VUOTA: nessun punto e nessun poligono, ma la griglia resta", () => {
    const svg = pagellaRadarSvgHtml(pagellaVuota("D"));
    expect(svg).not.toContain("pagella-radar__shape");
    expect(svg).not.toContain("pagella-radar__dot");
    expect(svg).toContain("pagella-radar__ring");
  });
});

describe("blocco — l'assenza è una frase, non un pentagono vuoto", () => {
  it("senza nemmeno un voto il blocco non disegna: dice", () => {
    const html = pagellaBlockHtml(pagellaVuota("D"));
    expect(html).toContain("player-insight-pagella-empty");
    expect(html).toContain(PAGELLA_EMPTY_TEXT);
    expect(html).not.toContain("<svg");
    // E soprattutto: non c'è nessuno zero a schermo.
    expect(html).not.toMatch(/>0<|0\/10/);
  });

  it("con almeno un voto compaiono disegno, elenco, totale e didascalia", () => {
    const html = pagellaBlockHtml(resolvePagella(PARZIALE, "D"));
    expect(html).toContain(PAGELLA_TITLE);
    expect(html).toContain("player-insight-radar");
    expect(html).toContain("player-insight-pagella-assi");
    expect(html).toContain("player-insight-pagella-totale");
    expect(html).toContain(PAGELLA_ORDER_NOTE);
    expect(html).toContain(PAGELLA_CAVEAT_NOTE);
  });

  it("l'elenco ha SEMPRE cinque righe, anche quando tre voti mancano", () => {
    const html = pagellaBlockHtml(resolvePagella(PARZIALE, "D"));
    expect((html.match(/<li class="pagella-asse/g) ?? []).length).toBe(PAGELLA_ASSI);
    // I tre assi senza voto dicono «n/d», non «0» e non una cella vuota.
    expect((html.match(/n\/d/g) ?? []).length).toBe(3);
  });

  it("il quarto asse porta il proprio marcatore, e il quinto il proprio — MA NON A SCHERMO", () => {
    // ASSERZIONE INVERTITA, non tolta. Diceva `toContain` sull'HTML: da quando
    // i cinque assi stanno in colonna (Pico, 2026-08-29) il marcatore non si
    // disegna più — in una colonnina larga un quinto del blocco «parere della
    // fonte» andrebbe a capo tre volte sotto ogni voto.
    //
    // IL FATTO NON È SPARITO, SI È SPOSTATO, ed è per questo che l'inversione
    // non è una perdita: `pagellaSpoken()` lo dice ancora, e la riga qui sotto
    // lo pretende. Chi naviga a voce sente «Bonus 6 su 10 (asse di ruolo)»
    // esattamente come prima — cioè l'unica superficie in cui quel testo
    // serviva davvero a distinguere due assi che si somigliano.
    const view = resolvePagella(COMPLETA, "D");
    expect(pagellaAxisMarker(view.assi[3] as never)).toBe("asse di ruolo");
    expect(pagellaAxisMarker(view.assi[4] as never)).toBe("parere della fonte");
    expect(pagellaAxisMarker(view.assi[0] as never)).toBe("");

    // Si asserisce sull'ELEMENTO e non sul testo, e la differenza è concreta:
    // la frase «parere della fonte» compare comunque nel blocco, dentro la nota
    // in fondo (`PAGELLA_CAVEAT_NOTE`), dove ci sta a ragione e dove non è mai
    // stata il marcatore di un asse. Cercare la stringa avrebbe fatto passare
    // questo test per il motivo sbagliato — o fallire per un altro ancora.
    const html = pagellaBlockHtml(view);
    expect(html).not.toContain("pagella-asse__marker");
    expect(html).not.toContain("asse di ruolo");

    const parlato = pagellaSpoken(view);
    expect(parlato).toContain("(asse di ruolo)");
    expect(parlato).toContain("(parere della fonte)");
  });

  it("il portiere e il difensore NON mostrano lo stesso quarto asse", () => {
    const portiere = pagellaBlockHtml(
      resolvePagella({ voti: { pagella_porta_inviolata: 1, pagella_salute: 8 } }, "P"),
    );
    const difensore = pagellaBlockHtml(resolvePagella(COMPLETA, "D"));
    expect(portiere).toContain("Porta inviolata");
    expect(portiere).not.toContain(">Bonus<");
    expect(difensore).toContain("Bonus");
    expect(difensore).not.toContain("Porta inviolata");
  });
});

describe("totale — le cinque frasi, e la divergenza che mostra la nostra somma", () => {
  it("coerente: un numero solo, perché non c'è niente da contestare", () => {
    const testo = pagellaTotaleText(resolvePagella(COMPLETA, "D"));
    expect(testo).toContain("39/50");
    expect(testo).toContain("coincide");
  });

  // ASSERZIONE ROVESCIATA, 2026-08-29, e la ragione è un fatto nuovo.
  //
  // Pretendeva entrambi i numeri e la parola «letto male»: era giusta finché
  // una riga con la somma che non torna veniva SCARTATA in blocco
  // dall'estrattore, cioè finché una divergenza a schermo poteva solo essere
  // colpa dell'estrazione. La misura sul corpus reale ha trovato l'altro caso:
  // la fonte scrive i cinque voti giusti e sbaglia la propria somma (trenta
  // schede su 487), e quei giocatori arrivavano a schermo con cinque «n/d».
  // Decisione di Pico: «mostra i voti e rifai tu la somma».
  //
  // Le tre righe qui sotto sono la nuova pretesa PER INTERO, non un
  // allentamento: la nostra somma c'è, il numero della fonte NON è più
  // ripetuto, e nessuna accusa di lettura viene mossa. La classe di stato
  // resta nel markup — lo stato non è sparito dal contratto, ha smesso di
  // dipingere (src/styles/asta.css).
  it("divergente: la NOSTRA somma, senza ripetere il numero della fonte", () => {
    const view = resolvePagella({ ...COMPLETA, totaleFonte: 41 }, "D");
    const testo = pagellaTotaleText(view);
    expect(testo).toContain("39/50");
    expect(testo).not.toContain("41/50");
    expect(testo).not.toContain("letto male");
    expect(pagellaBlockHtml(view)).toContain("pagella__totale--divergente");
  });

  // L'INVARIANTE CHE TIENE INSIEME LE CELLE E LA RIGA SOTTO, chiesta da una
  // lente di review: da quando il totale mostrato è la NOSTRA somma, deve
  // essere davvero la somma dei cinque numeri stampati sopra — in ogni stato
  // in cui un totale viene mostrato. Oggi lo è per costruzione (`view.assi` e
  // `totaleRicalcolato` nascono dallo stesso oggetto), e questa riga lo blinda
  // contro un refactoring che disaccoppi le due sorgenti.
  it("il TOTALE mostrato è sempre la somma delle celle mostrate, divergenza compresa", () => {
    for (const totaleFonte of [39, 41, undefined]) {
      const scheda = totaleFonte === undefined ? { voti: COMPLETA.voti } : { ...COMPLETA, totaleFonte };
      const view = resolvePagella(scheda, "D");
      const somma = view.assi.reduce((acc, asse) => acc + (asse.voto ?? 0), 0);
      expect(view.totaleRicalcolato).toBe(somma);
      expect(pagellaTotaleText(view)).toContain(`${somma}/50`);
    }
  });

  it("non verificabile: dice quanti voti mancano invece di accusare", () => {
    const testo = pagellaTotaleText(resolvePagella({ ...PARZIALE, totaleFonte: 39 }, "D"));
    expect(testo).toContain("non verificabile");
    expect(testo).toContain("2 voti su 5");
  });

  it("senza totale dichiarato: la somma c'è, il confronto no", () => {
    const { totaleFonte: _drop, ...senza } = COMPLETA;
    expect(pagellaTotaleText(resolvePagella(senza, "D"))).toContain("non scrive un TOTALE");
  });

  it("parziale e senza totale: nessuna somma, e il perché scritto", () => {
    const testo = pagellaTotaleText(resolvePagella(PARZIALE, "D"));
    expect(testo).toContain("non calcolabile");
    expect(testo).toContain("numero falso");
  });
});

describe("asse di ruolo sbagliato — si dichiara, non si usa", () => {
  it("la frase nomina l'asse della scheda e quello della riga", () => {
    const view = resolvePagella(COMPLETA, "P");
    const testo = pagellaAxisMismatchText(view);
    expect(testo).toContain("Bonus");
    expect(testo).toContain("Porta inviolata");
    expect(testo).toContain("non è stato usato");
    expect(pagellaBlockHtml(view)).toContain("player-insight-pagella-mismatch");
  });

  it("quando gli assi combaciano non c'è nessuna frase da leggere", () => {
    expect(pagellaAxisMismatchText(resolvePagella(COMPLETA, "D"))).toBe("");
    expect(pagellaBlockHtml(resolvePagella(COMPLETA, "D"))).not.toContain(
      "player-insight-pagella-mismatch",
    );
  });
});

describe("forma parlata — chi naviga a voce non perde il disegno", () => {
  it("nomina i cinque assi, il totale e i due caveat", () => {
    const spoken = pagellaSpoken(resolvePagella(COMPLETA, "D"));
    expect(spoken).toContain("Titolarità (voto) 9/10");
    expect(spoken).toContain("Bonus 6/10 (asse di ruolo)");
    expect(spoken).toContain("Consiglio Esperti 8/10 (parere della fonte)");
    expect(spoken).toContain("TOTALE 39/50");
    expect(spoken).toContain(PAGELLA_CAVEAT_NOTE);
  });

  it("sull'assenza dice l'assenza, e non un elenco di zeri", () => {
    const spoken = pagellaSpoken(pagellaVuota("D"));
    expect(spoken).toContain(PAGELLA_EMPTY_TEXT);
    expect(spoken).not.toContain("0/10");
  });
});
