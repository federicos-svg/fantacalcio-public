// LA SCHEDA — il vocabolario condiviso, provato dove non serve un browser.
//
// Che cosa questi test difendono, e perché ognuno esiste:
//  1. che i costruttori producano la forma dichiarata — la classe condivisa, il
//     titolo sopra il corpo, nessun guscio inutile;
//  2. che il titolo etichetti il proprio riquadro davvero (`aria-labelledby`
//     che punta a un id che esiste), e non sia solo grassetto;
//  3. che il testo passi da `escHtml`, come ogni altra stringa di questo
//     repository che finisce dentro `innerHTML`.
//
// CHE IL VOCABOLARIO SIA UNO NON SI PROVA QUI, e va detto perché è il fatto che
// dà valore al modulo. Un test che guardasse solo l'HTML prodotto da questo
// file resterebbe verde il giorno in cui qualcuno riscrive a mano la classe
// altrove. Le due prove che mordono stanno dove i posti sono davvero due:
// src/ui/expertInsight.test.ts cerca LE COSTANTI (non le stringhe) nel corpo
// del riquadro insight, e e2e/player-insight.spec.ts confronta a schermo gli
// stili calcolati dei tre titoli della schermata di chiamata con quelli dei due
// riquadri dell'insight — se divergono, è rosso lì.

import { describe, expect, it } from "vitest";
import {
  SCHEDA_CARDS_CLASS,
  SCHEDA_CARD_CLASS,
  SCHEDA_CARD_TITLE_CLASS,
  schedaCardHtml,
  schedaCardTitleHtml,
} from "./schedaCard.js";

describe("il titolo in maiuscoletto piccolo", () => {
  it("porta la classe condivisa e la parola che gli è stata data", () => {
    expect(schedaCardTitleHtml("SEGNALI DELLA SCHEDA")).toBe(
      `<h3 class="${SCHEDA_CARD_TITLE_CLASS}">SEGNALI DELLA SCHEDA</h3>`,
    );
  });

  it("porta l'id quando glielo si chiede, e nessun attributo vuoto quando no", () => {
    expect(schedaCardTitleHtml("PER ME", "per-me-title")).toContain(' id="per-me-title"');
    expect(schedaCardTitleHtml("PER ME")).not.toContain("id=");
  });

  it("scappa il testo: nessuna stringa arriva grezza dentro innerHTML", () => {
    const html = schedaCardTitleHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("il riquadro", () => {
  const card = schedaCardHtml({
    title: "NOTE DELLA SCHEDA",
    id: "player-insight-card-note",
    bodyHtml: "<p>corpo</p>",
  });

  it("è una sezione con la classe condivisa e l'id chiesto", () => {
    expect(card).toContain(`<section class="${SCHEDA_CARD_CLASS}" id="player-insight-card-note"`);
  });

  it("è ETICHETTATO DAL PROPRIO TITOLO: aria-labelledby punta a un id che esiste", () => {
    expect(card).toContain('aria-labelledby="player-insight-card-note-title"');
    expect(card).toContain('id="player-insight-card-note-title"');
    // Il nome accessibile è lo stesso testo che si vede: non può divergere.
    expect(card).toContain(">NOTE DELLA SCHEDA</h3>");
  });

  it("mette il titolo SOPRA il corpo, non sotto", () => {
    expect(card.indexOf("NOTE DELLA SCHEDA")).toBeLessThan(card.indexOf("<p>corpo</p>"));
  });

  it("avvolge il corpo solo quando gli si dà una classe: nessun <div> per niente", () => {
    expect(card).not.toContain("<div");
    expect(
      schedaCardHtml({
        title: "SEGNALI DELLA SCHEDA",
        id: "x",
        bodyClass: "expert-insight__visual",
        bodyHtml: "<span>s</span>",
      }),
    ).toContain('<div class="expert-insight__visual"><span>s</span></div>');
  });
});

// `renderSchedaCardTitle()` NON è provata qui, e non è una dimenticanza: crea
// un elemento del DOM, e questa suite gira su Node senza documento (nessun
// jsdom/happy-dom fra le dipendenze — vitest.config.ts non dichiara un
// `environment`). La sua prova sta dove un documento c'è davvero: in
// e2e/call-screen-order.spec.ts, che verifica a schermo che i TRE titoli della
// schermata di chiamata e i DUE riquadri di INSIGHT GIOCATORE portino tutti la
// stessa classe. È la prova che conta — «il vocabolario è uno» è un fatto sulla
// pagina, non sulla stringa.

describe("i nomi delle classi sono quelli, e non tre stringhe scritte a mano", () => {
  it("le tre costanti hanno i nomi che il CSS dichiara", () => {
    expect(SCHEDA_CARD_TITLE_CLASS).toBe("scheda-card__title");
    expect(SCHEDA_CARD_CLASS).toBe("scheda-card");
    expect(SCHEDA_CARDS_CLASS).toBe("scheda-cards");
  });
});
