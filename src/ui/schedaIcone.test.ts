import { describe, it, expect } from "vitest";
import {
  LISTA_ESPERTI_DETTAGLIO,
  LISTA_ESPERTI_LABELS,
  LISTA_ESPERTI_TONI,
  ballottaggioDettaglio,
  elencoItaliano,
  glifoKey,
  schedaIcone,
  schedaIconeHtml,
  schedaIconeSpoken,
  soggettoText,
} from "./schedaIcone.js";
import {
  LISTA_ESPERTI_VALUES,
  expertSchedaStore,
  resolveExpertInsight,
  unknownExpertInsight,
  type ExpertInsightView,
  type ExpertScheda,
} from "../expertScheda.js";

// LE QUATTRO ICONE ACCANTO AL RADAR.
//
// Solo fixture sintetiche: nomi segnaposto, quote inventate, nessun giocatore
// e nessuna squadra reale.
//
// Che cosa provano questi test, e perché ognuno esiste:
//
//  a. ACCESO/SPENTO. Un'icona accesa quando la scheda dichiara il segnale, e
//     SPENTA — non assente, non accesa con un valore di comodo — quando non lo
//     dichiara. È la regola «n/d non si finge» applicata a una superficie che
//     non ha parole proprie a schermo.
//  b. LA QUARTA ICONA. Tre stati, tre glifi diversi e tre toni diversi; e
//     ASSENTE quando il giocatore non è in nessuna delle tre liste. «Appare
//     solo se» è una condizione, non una preferenza estetica.
//  c. IL BALLOTTAGGIO A PIÙ DI DUE. Due nomi e tre nomi, tutti con la loro
//     quota: cablare «l'altro» farebbe sparire il terzo senza dirlo.
//  d. IL COLORE NON PORTA NULLA DA SOLO. Ogni icona porta la propria parola
//     nella frase accessibile, e i glifi delle tre liste sono diversi fra loro
//     e diversi dagli altri: chi non distingue i colori legge la forma.

const PLAYER = "Dario Placeholder";
const CLUB = "ClubQuattro";

function viewOf(scheda: Omit<ExpertScheda, "player" | "club">): ExpertInsightView {
  return resolveExpertInsight(expertSchedaStore([{ player: PLAYER, club: CLUB, ...scheda }]), {
    name: PLAYER,
    club: CLUB,
  });
}

/** L'icona di una famiglia, o `undefined` quando non è stata disegnata. */
function iconaDi(view: ExpertInsightView, kind: string) {
  return schedaIcone(view).find((i) => i.kind === kind);
}

// ── a. ACCESO E SPENTO ───────────────────────────────────────────────────────

describe("le tre icone che si accendono e si spengono", () => {
  it("le prime tre ci sono SEMPRE: una casella che sparisce non si distingue da una che non c'è mai stata", () => {
    const vuota = schedaIcone(viewOf({ nota: "Nessun segnale strutturato." }));
    expect(vuota.map((i) => i.kind)).toEqual(["rigorista", "piazzati", "ballottaggio"]);
    expect(vuota.every((i) => !i.acceso)).toBe(true);
  });

  it.each([
    ["designato", "designato"],
    ["possibile", "possibile"],
  ] as const)("rigorista acceso quando la scheda lo dichiara: %s", (valore, parola) => {
    const icona = iconaDi(viewOf({ rigori: valore }), "rigorista");
    expect(icona?.acceso).toBe(true);
    expect(icona?.dettaglio).toBe(parola);
  });

  it("rigorista spento quando la scheda non lo dichiara, e lo DICE", () => {
    const icona = iconaDi(viewOf({ nota: "Solo prosa." }), "rigorista");
    expect(icona?.acceso).toBe(false);
    expect(icona?.dettaglio).toBe("la scheda non lo dichiara");
    // Nessun valore inventato: la parola «designato» non compare da nessuna parte.
    expect(icona?.parlato).not.toContain("designato");
  });

  it("piazzati acceso con uno e con entrambi i tipi, scritti per esteso", () => {
    expect(iconaDi(viewOf({ piazzati: ["punizioni"] }), "piazzati")?.dettaglio).toBe("punizioni");
    const due = iconaDi(viewOf({ piazzati: ["punizioni", "angoli"] }), "piazzati");
    expect(due?.acceso).toBe(true);
    expect(due?.dettaglio).toBe("punizioni e angoli");
  });

  it("piazzati spento con una lista vuota: una lista vuota non è un segnale", () => {
    const icona = iconaDi(viewOf({ piazzati: [] }), "piazzati");
    expect(icona?.acceso).toBe(false);
    expect(icona?.dettaglio).toBe("la scheda non ne dichiara");
  });

  it("ballottaggio acceso solo sulla titolarità «ballottaggio»", () => {
    expect(iconaDi(viewOf({ titolarita: "ballottaggio" }), "ballottaggio")?.acceso).toBe(true);
    expect(iconaDi(viewOf({ titolarita: "titolare" }), "ballottaggio")?.acceso).toBe(false);
    expect(iconaDi(viewOf({ titolarita: "riserva" }), "ballottaggio")?.acceso).toBe(false);
  });

  // I DUE SPENTI DIVERSI. «La scheda lo dà titolare» è un fatto; «la scheda non
  // dichiara la titolarità» è un buco. Scriverli uguali manderebbe a cercare un
  // dato che c'è, o farebbe credere risolto un dato che manca.
  it("spento per titolarità dichiarata e spento per titolarità assente sono due frasi diverse", () => {
    const titolare = iconaDi(viewOf({ titolarita: "titolare" }), "ballottaggio");
    const muta = iconaDi(viewOf({ nota: "Solo prosa." }), "ballottaggio");
    expect(titolare?.dettaglio).toBe("la scheda lo dà titolare");
    expect(muta?.dettaglio).toBe("la scheda non dichiara la titolarità");
    expect(titolare?.dettaglio).not.toBe(muta?.dettaglio);
  });

  it("negli stati «non lo so» le tre icone sono tutte spente: nessun segnale sopravvive", () => {
    const icone = schedaIcone(unknownExpertInsight("no_expert_signal"));
    expect(icone).toHaveLength(3);
    expect(icone.every((i) => !i.acceso)).toBe(true);
  });
});

// ── b. LA QUARTA ICONA ───────────────────────────────────────────────────────

describe("la quarta icona — le tre liste del Gruppo Esperti", () => {
  it("assente quando il giocatore non è in nessuna delle tre liste", () => {
    expect(iconaDi(viewOf({ rigori: "designato" }), "lista")).toBeUndefined();
    expect(schedaIcone(viewOf({ rigori: "designato" }))).toHaveLength(3);
    // FAIL-CLOSED: gli avvisi che NON sono liste non la fanno comparire.
    expect(iconaDi(viewOf({ avvisi: ["mercato", "rischio_fisico"] }), "lista")).toBeUndefined();
  });

  it.each([...LISTA_ESPERTI_VALUES])("compare nello stato %s, col suo tono e la sua parola", (lista) => {
    const view = viewOf({ lista });
    const icona = iconaDi(view, "lista");
    expect(icona?.acceso).toBe(true);
    expect(icona?.tono).toBe(LISTA_ESPERTI_TONI[lista]);
    expect(icona?.nome).toBe(LISTA_ESPERTI_LABELS[lista]);
    expect(icona?.dettaglio).toBe(LISTA_ESPERTI_DETTAGLIO);
  });

  it("i tre toni sono verde, blu e rosso — uno per lista, mai lo stesso due volte", () => {
    expect(LISTA_ESPERTI_TONI).toEqual({
      consigliato: "verde",
      possibile_sorpresa: "blu",
      sconsigliato: "rosso",
    });
    expect(new Set(Object.values(LISTA_ESPERTI_TONI)).size).toBe(LISTA_ESPERTI_VALUES.length);
  });

  // IL COLORE NON È IL PRIMO CANALE: tre glifi diversi, non lo stesso glifo
  // ridipinto. Chi non distingue verde da rosso deve leggere la forma.
  it("tre glifi diversi, e diversi anche dalle prime tre icone", () => {
    const chiavi = LISTA_ESPERTI_VALUES.map((lista) => {
      const view = viewOf({ lista });
      return glifoKey(iconaDi(view, "lista")!, view.lista);
    });
    expect(new Set(chiavi).size).toBe(LISTA_ESPERTI_VALUES.length);
    expect(chiavi).toEqual([...LISTA_ESPERTI_VALUES]);
    for (const chiave of chiavi) {
      expect(["rigorista", "piazzati", "ballottaggio"]).not.toContain(chiave);
    }
  });

  it("l'HTML dei tre stati porta tre tracciati SVG diversi, non lo stesso ridipinto", () => {
    const disegni = LISTA_ESPERTI_VALUES.map((lista) => {
      const html = schedaIconeHtml(viewOf({ lista }));
      const pezzo = html.slice(html.indexOf('id="player-insight-icona-lista"'));
      return pezzo.slice(pezzo.indexOf("<svg"), pezzo.indexOf("</svg>"));
    });
    expect(new Set(disegni).size).toBe(LISTA_ESPERTI_VALUES.length);
  });

  // La sola delle tre liste che il deposito produce oggi arriva come AVVISO.
  it("l'avviso «sconsigliato» accende la quarta icona anche senza il campo lista", () => {
    const icona = iconaDi(viewOf({ avvisi: ["sconsigliato"] }), "lista");
    expect(icona?.tono).toBe("rosso");
    expect(icona?.nome).toBe("sconsigliato");
  });

  // LA CONTRADDIZIONE NON SI APPIANA VERSO LA PROMOZIONE.
  it("scheda che dice insieme «consigliato» e l'avviso «sconsigliato»: vince l'avviso", () => {
    const icona = iconaDi(viewOf({ lista: "consigliato", avvisi: ["sconsigliato"] }), "lista");
    expect(icona?.nome).toBe("sconsigliato");
    expect(icona?.tono).toBe("rosso");
  });
});

// ── c. IL BALLOTTAGGIO, CON PIÙ DI DUE ───────────────────────────────────────

describe("il ballottaggio porta TUTTI gli altri, non «l'altro»", () => {
  it("due soggetti: l'altro nome con la sua quota, e la quota di lui", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 60,
      ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: 40 }],
    });
    const icona = iconaDi(view, "ballottaggio");
    expect(icona?.acceso).toBe(true);
    expect(icona?.dettaglio).toBe("con Bruna Placeholder al 40%, lui al 60%");
  });

  it("tre soggetti: tutti e due gli altri restano scritti", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 50,
      ballottaggio: [
        { surface: "Bruna Placeholder", sharePercent: 30 },
        { surface: "Carlo Segnaposto", sharePercent: 20 },
      ],
    });
    const dettaglio = iconaDi(view, "ballottaggio")?.dettaglio ?? "";
    expect(dettaglio).toContain("Bruna Placeholder al 30%");
    expect(dettaglio).toContain("Carlo Segnaposto al 20%");
    expect(dettaglio).toBe("con Bruna Placeholder al 30% e Carlo Segnaposto al 20%, lui al 50%");
  });

  it("quattro soggetti: il quarto non sparisce", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      ballottaggio: [
        { surface: "Uno Segnaposto" },
        { surface: "Due Segnaposto" },
        { surface: "Tre Segnaposto" },
      ],
    });
    expect(iconaDi(view, "ballottaggio")?.dettaglio).toBe(
      "con Uno Segnaposto, Due Segnaposto e Tre Segnaposto",
    );
  });

  it("un soggetto senza quota resta un nome, non un nome con un numero inventato", () => {
    expect(soggettoText({ surface: "Bruna Placeholder" })).toBe("Bruna Placeholder");
    expect(soggettoText({ surface: "Bruna Placeholder", sharePercent: 40 })).toBe(
      "Bruna Placeholder al 40%",
    );
  });

  it("ballottaggio senza nomi: acceso, e dichiara che la scheda non dice con chi", () => {
    const view = viewOf({ titolarita: "ballottaggio", percentuale: 60 });
    const icona = iconaDi(view, "ballottaggio");
    expect(icona?.acceso).toBe(true);
    expect(icona?.dettaglio).toBe("la scheda non dice con chi, lui al 60%");
  });

  // FAIL-CLOSED: un elenco di rivali su un giocatore dato titolare è una
  // contraddizione, e il riquadro non ne sceglie una metà.
  it("i nomi non sopravvivono a una titolarità che non è un ballottaggio", () => {
    const view = viewOf({
      titolarita: "titolare",
      ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: 40 }],
    });
    expect(view.ballottaggio).toEqual([]);
    expect(iconaDi(view, "ballottaggio")?.dettaglio).toBe("la scheda lo dà titolare");
    expect(schedaIconeHtml(view)).not.toContain("Bruna Placeholder");
  });

  it("elencoItaliano scrive «e» prima dell'ultimo, e non lascia virgole mute", () => {
    expect(elencoItaliano([])).toBe("");
    expect(elencoItaliano(["a"])).toBe("a");
    expect(elencoItaliano(["a", "b"])).toBe("a e b");
    expect(elencoItaliano(["a", "b", "c"])).toBe("a, b e c");
  });

  it("ballottaggioDettaglio non inventa una quota che la scheda non scrive", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      ballottaggio: [{ surface: "Bruna Placeholder" }],
    });
    expect(ballottaggioDettaglio(view)).toBe("con Bruna Placeholder");
    expect(ballottaggioDettaglio(view)).not.toContain("%");
  });
});

// ── d. IL COLORE NON PORTA NULLA DA SOLO ─────────────────────────────────────

describe("ogni icona si legge senza il colore", () => {
  it("ogni icona porta una parola propria e un dettaglio: mai un glifo muto", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 60,
      ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: 40 }],
      rigori: "designato",
      piazzati: ["punizioni"],
      lista: "possibile_sorpresa",
    });
    const icone = schedaIcone(view);
    expect(icone).toHaveLength(4);
    for (const icona of icone) {
      expect(icona.nome.trim()).not.toBe("");
      expect(icona.dettaglio.trim()).not.toBe("");
      expect(icona.parlato).toContain(icona.dettaglio);
    }
  });

  it("l'HTML porta lo stato in un attributo e in una classe, non nel solo colore", () => {
    const html = schedaIconeHtml(viewOf({ rigori: "designato" }));
    expect(html).toContain('id="player-insight-icona-rigorista"');
    expect(html).toContain('data-acceso="si"');
    expect(html).toContain("scheda-icona--on");
    expect(html).toContain("scheda-icona--off");
  });

  it("ogni icona è un BOTTONE, cioè raggiungibile da tastiera e col dito", () => {
    const html = schedaIconeHtml(viewOf({ titolarita: "ballottaggio" }));
    expect(html.match(/<button class="scheda-icona__hit" type="button">/g)).toHaveLength(3);
    // La frase intera è il contenuto del bottone: non un `title`, che né la
    // tastiera né il dito raggiungono.
    expect(html).not.toContain("title=");
    expect(html).toContain('<span class="scheda-icona__sr">');
  });

  it("il testo della scheda è sfuggito prima di finire nell'HTML", () => {
    const html = schedaIconeHtml(
      viewOf({
        titolarita: "ballottaggio",
        ballottaggio: [{ surface: '<img src=x onerror="alert(1)">' }],
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("la forma parlata porta i nomi del ballottaggio e la lista", () => {
    const parlato = schedaIconeSpoken(
      viewOf({
        titolarita: "ballottaggio",
        percentuale: 60,
        ballottaggio: [{ surface: "Bruna Placeholder", sharePercent: 40 }],
        lista: "consigliato",
      }),
    );
    expect(parlato).toContain("Bruna Placeholder al 40%");
    expect(parlato).toContain("Consigliato");
    expect(parlato).toContain("Rigorista");
    expect(parlato).toContain("Piazzati");
  });
});
