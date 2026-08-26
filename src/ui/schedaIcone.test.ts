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
  SCHEDA_CLUB_NON_DICHIARATA,
  expertSchedaStore,
  resolveExpertInsight,
  unknownExpertInsight,
  type ExpertInsightView,
  type ExpertScheda,
} from "../expertScheda.js";

// LE CINQUE ICONE ACCANTO AL RADAR.
//
// Solo fixture sintetiche: nomi segnaposto, quote inventate, nessun giocatore
// e nessuna squadra reale.
//
// Che cosa provano questi test, e perché ognuno esiste:
//
//  a. ACCESO/SPENTO E IL RANGO. Un'icona accesa quando la scheda dichiara il
//     segnale, e il POSTO NELLA FILA quando la scheda dichiara anche quello:
//     rigori, punizioni e angoli sono tre file ordinate, non tre insiemi.
//     Un'icona accesa senza rango dichiarato non prende nessun numero — un «1»
//     di comodo si leggerebbe «il primo» — e lo DICE con `rango n/d`.
//  a-bis. ACCESO/SPENTO. Un'icona accesa quando la scheda dichiara il segnale, e
//     SPENTA — non assente, non accesa con un valore di comodo — quando non lo
//     dichiara. È la regola «n/d non si finge» applicata a una superficie che
//     non ha parole proprie a schermo.
//  b. L'ICONA DELLE LISTE. Tre stati, tre glifi diversi e tre toni diversi; e
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

describe("le quattro icone che si accendono e si spengono", () => {
  it("le prime quattro ci sono SEMPRE: una casella che sparisce non si distingue da una che non c'è mai stata", () => {
    const vuota = schedaIcone(viewOf({ nota: "Nessun segnale strutturato." }));
    expect(vuota.map((i) => i.kind)).toEqual([
      "rigorista",
      "punizioni",
      "angoli",
      "ballottaggio",
    ]);
    expect(vuota.every((i) => !i.acceso)).toBe(true);
    // Nessuna casella spenta porta un numero: non c'è nessuna fila di cui
    // essere il quantesimo.
    expect(vuota.every((i) => i.rango === null)).toBe(true);
  });

  it.each([
    ["designato", "designato"],
    ["possibile", "possibile"],
  ] as const)("rigorista acceso quando la scheda lo dichiara: %s", (valore, parola) => {
    const icona = iconaDi(viewOf({ rigori: valore, rangoRigori: 1 }), "rigorista");
    expect(icona?.acceso).toBe(true);
    expect(icona?.dettaglio).toBe(`1\u00b0 ${parola}`);
    expect(icona?.rango).toBe(1);
  });

  // IL RANGO NON SI DEDUCE DALLA DESIGNAZIONE. «designato» non vuol dire
  // «primo»: le due cose coincidono spesso e non per definizione, e un numero
  // messo qui sarebbe un'assenza travestita da fatto.
  it("rigorista acceso SENZA rango: nessun numero, e la didascalia lo dichiara", () => {
    const icona = iconaDi(viewOf({ rigori: "designato" }), "rigorista");
    expect(icona?.acceso).toBe(true);
    expect(icona?.rango).toBeNull();
    expect(icona?.dettaglio).toBe("designato — rango n/d");
    expect(icona?.dettaglio).not.toContain("1");
  });

  it("rigorista spento quando la scheda non lo dichiara, e lo DICE", () => {
    const icona = iconaDi(viewOf({ nota: "Solo prosa." }), "rigorista");
    expect(icona?.acceso).toBe(false);
    expect(icona?.dettaglio).toBe("la scheda non lo dichiara");
    // Nessun valore inventato: la parola «designato» non compare da nessuna parte.
    expect(icona?.parlato).not.toContain("designato");
  });

  // DUE CASELLE DOVE PRIMA CE N'ERA UNA. Il motivo è il rango: un giocatore può
  // essere primo sulle punizioni e terzo sugli angoli, e un'icona sola non
  // potrebbe dire quale dei due numeri sta mostrando.
  it("punizioni e angoli sono due caselle, ciascuna col proprio posto nella fila", () => {
    const view = viewOf({
      piazzati: ["punizioni", "angoli"],
      rangoPunizioni: 1,
      rangoAngoli: 3,
    });
    const punizioni = iconaDi(view, "punizioni");
    const angoli = iconaDi(view, "angoli");
    expect(punizioni?.acceso).toBe(true);
    expect(punizioni?.rango).toBe(1);
    expect(punizioni?.dettaglio).toBe("1\u00b0 battitore");
    expect(angoli?.acceso).toBe(true);
    expect(angoli?.rango).toBe(3);
    expect(angoli?.dettaglio).toBe("3\u00b0 battitore");
  });

  it("una specialità dichiarata e l'altra no: una accesa, l'altra spenta, e lo dicono diverso", () => {
    const view = viewOf({ piazzati: ["punizioni"], rangoPunizioni: 2 });
    expect(iconaDi(view, "punizioni")?.acceso).toBe(true);
    const angoli = iconaDi(view, "angoli");
    expect(angoli?.acceso).toBe(false);
    expect(angoli?.rango).toBeNull();
    expect(angoli?.dettaglio).toBe("la scheda non li dichiara");
  });

  it("specialità dichiarata senza ordine: accesa, senza numero, e lo dice", () => {
    const icona = iconaDi(viewOf({ piazzati: ["angoli"] }), "angoli");
    expect(icona?.acceso).toBe(true);
    expect(icona?.rango).toBeNull();
    expect(icona?.dettaglio).toBe("battitore — rango n/d");
  });

  it("le due spente con una lista vuota: una lista vuota non è un segnale", () => {
    const view = viewOf({ piazzati: [] });
    expect(iconaDi(view, "punizioni")?.acceso).toBe(false);
    expect(iconaDi(view, "punizioni")?.dettaglio).toBe("la scheda non le dichiara");
    expect(iconaDi(view, "angoli")?.acceso).toBe(false);
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

  it("negli stati «non lo so» le quattro icone sono tutte spente: nessun segnale sopravvive", () => {
    const icone = schedaIcone(unknownExpertInsight("no_expert_signal"));
    expect(icone).toHaveLength(4);
    expect(icone.every((i) => !i.acceso)).toBe(true);
    expect(icone.every((i) => i.rango === null)).toBe(true);
  });
});

// ── b. L'ICONA DELLE LISTE ───────────────────────────────────────────────────

describe("l'icona delle liste — le tre liste del Gruppo Esperti", () => {
  it("assente quando il giocatore non è in nessuna delle tre liste", () => {
    expect(iconaDi(viewOf({ rigori: "designato" }), "lista")).toBeUndefined();
    expect(schedaIcone(viewOf({ rigori: "designato" }))).toHaveLength(4);
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
  it("tre glifi diversi, e diversi anche dalle prime quattro icone", () => {
    const chiavi = LISTA_ESPERTI_VALUES.map((lista) => {
      const view = viewOf({ lista });
      return glifoKey(iconaDi(view, "lista")!, view.lista);
    });
    expect(new Set(chiavi).size).toBe(LISTA_ESPERTI_VALUES.length);
    expect(chiavi).toEqual([...LISTA_ESPERTI_VALUES]);
    for (const chiave of chiavi) {
      expect(["rigorista", "punizioni", "angoli", "ballottaggio"]).not.toContain(chiave);
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
  it("due soggetti: l'altro con la sua SQUADRA e la sua quota, e la quota di lui", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 60,
      ballottaggio: [{ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }],
    });
    const icona = iconaDi(view, "ballottaggio");
    expect(icona?.acceso).toBe(true);
    expect(icona?.dettaglio).toBe("con Bruna Placeholder (ClubUno) al 40%, lui al 60%");
  });

  it("due omonimi pieni di club diversi restano DUE, e si leggono come due", () => {
    // È il difetto che la squadra dentro il soggetto esiste per chiudere,
    // visto dal punto in cui il rivale si legge davvero: durante l'asta.
    // Col solo nome, la riga diceva due volte la stessa parola.
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 40,
      ballottaggio: [
        { surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 35 },
        { surface: "Bruna Placeholder", club: "ClubDue", sharePercent: 25 },
      ],
    });
    expect(iconaDi(view, "ballottaggio")?.dettaglio).toBe(
      "con Bruna Placeholder (ClubUno) al 35% e Bruna Placeholder (ClubDue) al 25%, lui al 40%",
    );
  });

  it("tre soggetti: tutti e due gli altri restano scritti", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 50,
      ballottaggio: [
        { surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 30 },
        { surface: "Carlo Segnaposto", club: "ClubDue", sharePercent: 20 },
      ],
    });
    const dettaglio = iconaDi(view, "ballottaggio")?.dettaglio ?? "";
    expect(dettaglio).toContain("Bruna Placeholder (ClubUno) al 30%");
    expect(dettaglio).toContain("Carlo Segnaposto (ClubDue) al 20%");
    expect(dettaglio).toBe(
      "con Bruna Placeholder (ClubUno) al 30% e Carlo Segnaposto (ClubDue) al 20%, lui al 50%",
    );
  });

  it("quattro soggetti: il quarto non sparisce", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      ballottaggio: [
        { surface: "Uno Segnaposto", club: "ClubUno" },
        { surface: "Due Segnaposto", club: "ClubUno" },
        { surface: "Tre Segnaposto", club: "ClubUno" },
      ],
    });
    expect(iconaDi(view, "ballottaggio")?.dettaglio).toBe(
      "con Uno Segnaposto (ClubUno), Due Segnaposto (ClubUno) e Tre Segnaposto (ClubUno)",
    );
  });

  it("un soggetto senza quota resta un nome, non un nome con un numero inventato", () => {
    expect(soggettoText({ surface: "Bruna Placeholder", club: "ClubUno" })).toBe(
      "Bruna Placeholder (ClubUno)",
    );
    expect(
      soggettoText({ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }),
    ).toBe("Bruna Placeholder (ClubUno) al 40%");
  });

  it("un soggetto senza SQUADRA la dichiara «n/d», e non prende quella di nessuno", () => {
    // La forma vecchia, letta dal riquadro d'asta: la squadra manca e si dice
    // che manca. Prendere quella del giocatore della riga — o quella
    // dell'altro soggetto — sarebbe l'accoppiamento sbagliato reso invisibile.
    expect(soggettoText({ surface: "Bruna Placeholder", sharePercent: 40 })).toBe(
      `Bruna Placeholder (${SCHEDA_CLUB_NON_DICHIARATA}) al 40%`,
    );
    const view = viewOf({
      titolarita: "ballottaggio",
      ballottaggio: [{ surface: "Bruna Placeholder" }],
    });
    expect(iconaDi(view, "ballottaggio")?.dettaglio).toBe(
      `con Bruna Placeholder (${SCHEDA_CLUB_NON_DICHIARATA})`,
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
      ballottaggio: [{ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }],
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
      ballottaggio: [{ surface: "Bruna Placeholder", club: "ClubUno" }],
    });
    expect(ballottaggioDettaglio(view)).toBe("con Bruna Placeholder (ClubUno)");
    expect(ballottaggioDettaglio(view)).not.toContain("%");
  });
});

// ── d. IL COLORE NON PORTA NULLA DA SOLO ─────────────────────────────────────

describe("ogni icona si legge senza il colore", () => {
  it("ogni icona porta una parola propria e un dettaglio: mai un glifo muto", () => {
    const view = viewOf({
      titolarita: "ballottaggio",
      percentuale: 60,
      ballottaggio: [{ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }],
      rigori: "designato",
      rangoRigori: 1,
      piazzati: ["punizioni"],
      rangoPunizioni: 2,
      lista: "possibile_sorpresa",
    });
    const icone = schedaIcone(view);
    expect(icone).toHaveLength(5);
    for (const icona of icone) {
      expect(icona.nome.trim()).not.toBe("");
      expect(icona.dettaglio.trim()).not.toBe("");
      expect(icona.parlato).toContain(icona.dettaglio);
    }
    // IL NUMERO È NELLA FRASE PARLATA, non solo nella pastiglia dipinta: chi
    // naviga a voce non vede l'angolo della casella.
    expect(icone.find((i) => i.kind === "punizioni")?.parlato).toContain("2\u00b0");
  });

  // LA PASTIGLIA È IL SECONDO CANALE DEL RANGO, e c'è SOLO dove un rango c'è.
  it("l'HTML porta la pastiglia del rango dove il rango è dichiarato, e da nessun'altra parte", () => {
    const html = schedaIconeHtml(
      viewOf({
        rigori: "designato",
        rangoRigori: 1,
        piazzati: ["punizioni", "angoli"],
        rangoAngoli: 3,
      }),
    );
    expect(html.match(/class="scheda-icona__rango"/g)).toHaveLength(2);
    expect(html).toContain(">1\u00b0<");
    expect(html).toContain(">3\u00b0<");
    // Le punizioni sono dichiarate SENZA ordine: nessun numero di comodo.
    const punizioni = html.slice(html.indexOf('id="player-insight-icona-punizioni"'));
    expect(punizioni.slice(0, punizioni.indexOf("</li>"))).not.toContain("scheda-icona__rango");
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
    expect(html.match(/<button class="scheda-icona__hit" type="button">/g)).toHaveLength(4);
    // La frase intera è il contenuto del bottone: non un `title`, che né la
    // tastiera né il dito raggiungono.
    expect(html).not.toContain("title=");
    expect(html).toContain('<span class="scheda-icona__sr">');
  });

  it("il testo della scheda è sfuggito prima di finire nell'HTML", () => {
    const html = schedaIconeHtml(
      viewOf({
        titolarita: "ballottaggio",
        ballottaggio: [{ surface: '<img src=x onerror="alert(1)">', club: "ClubUno" }],
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
        ballottaggio: [{ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }],
        lista: "consigliato",
      }),
    );
    expect(parlato).toContain("Bruna Placeholder (ClubUno) al 40%");
    expect(parlato).toContain("Consigliato");
    expect(parlato).toContain("Rigorista");
    expect(parlato).toContain("Punizioni");
    expect(parlato).toContain("Angoli");
  });
});
