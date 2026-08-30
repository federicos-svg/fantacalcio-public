import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { VISIBLE_VALUE_SLOT_IDS } from "../src/valueBox.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// #331 punti 2-3 — IL GESTO PRINCIPALE DELLA SCHERMATA D'ASTA NON STA SOTTO LA
// PIEGA, E QUESTA SPEC È LA MISURA CHE LO TIENE LÌ.
//
// LA LEZIONE CHE HA PRODOTTO QUESTO FILE. Ogni corsia misurava il proprio
// pannello; nessuna misurava la schermata risultante. Con Chromium vero, pool
// sintetico da 532 righe e log d'asta vuoto:
//
//   albero                     altezza pagina   «ASSEGNA A» a   1440×900   1920×1080
//   produzione                 1865px           1154px          254 sotto  74 sotto
//   ramo di lavoro             1711px           1020px          120 sotto  sopra
//   + pannello fasce (PR #18)  1954px           1262px          362 sotto  182 sotto
//
// Il pannello delle fasce era corretto in sé e riportava la schermata PEGGIO
// della produzione a entrambe le risoluzioni. Senza una misura asserita la
// crescita della schermata è invisibile: si vede solo la prossima volta che
// qualcuno apre il sito durante un'asta dal vivo, con due secondi per decidere.
//
// COSA ASSERISCE, E PERCHÉ IN QUEST'ORDINE. Le tre famiglie sono complementari
// e ciascuna diventa rossa da sola:
//
//  a. GEOMETRIA — l'intero gesto (menu squadra, campo prezzo, «Registra
//     acquisto») sta dentro la finestra a scroll 0, a 1440×900 e a 1920×1080,
//     e l'hit-test sul centro del bottone restituisce IL BOTTONE: dentro la
//     finestra ma coperto da un'altra scheda non è «raggiungibile».
//
//  b. ORDINE — questa è l'asserzione che regge l'AGGIUNTA SUCCESSIVA, e vale
//     più del numero. Sopra il gesto sta soltanto la riga d'identità del
//     giocatore: ogni altro pannello della schermata gli sta sotto. Finché è
//     vero, un pannello nuovo — e ne sta arrivando un altro — non può spingere
//     il gesto fuori dallo schermo, quale che sia la sua altezza. Un budget di
//     pixel da solo si accomoderebbe a ogni crescita, un pixel per volta.
//
//  c. RIDURRE NON TOGLIE INFORMAZIONE (vincolo esplicito di Pico, #333). Le
//     tre celle di ruolo che la scheda non mostra più, il censimento MERCATO e
//     la nota metodologica sono nel DOM da chiusi, tornano visibili con UN
//     gesto, e quel gesto è un <button> con aria-expanded/aria-controls
//     raggiungibile da tastiera. E con il dettaglio APERTO il gesto principale
//     resta sopra la piega: aprire un dettaglio non ricrea il difetto.
//
// LA FIXTURE NON PUÒ MENTIRE SULLA SCALA: 532 righe, la stessa scala del
// listone privato (vedi e2e/call-screen-order.spec.ts), tutte sintetiche. La
// guardia di rete aborta e registra qualunque altra richiesta.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const ROLES = ["P", "D", "C", "A"] as const;

/** Pool sintetico della SCALA del listone privato (532 righe), zero dati reali. */
function syntheticPoolOfSize(rows: number): readonly ListonePlayer[] {
  return Array.from({ length: rows }, (_, i) => ({
    name: `Sintetico ${String(i + 1).padStart(3, "0")}`,
    role: ROLES[i % ROLES.length]!,
    club: `Club${(i % 20) + 1}`,
    quotation: 1 + (i % 40),
  }));
}

const LARGE_POOL = syntheticPoolOfSize(532);

/** Un attaccante, così il ruolo chiamato non è il primo dell'elenco. */
const CALLED = "Sintetico 004";

// IL BUDGET, E DA DOVE VIENE IL NUMERO. La soglia sta a 560px, e il numero
// nasce da una misura: 430px (titolo «ASSEGNA A», bordo alto nel documento) su
// questo stesso albero, con questa stessa fixture, PRIMA del riquadro del
// valore — cioè circa 130px di margine, lo spazio di un pannello piccolo
// aggiunto DENTRO la scheda e non abbastanza per farci stare una sezione
// intera senza accorgersene.
//
// QUANTO NE RESTA ADESSO, detto qui e non lasciato dedurre: il riquadro del
// valore (#32) costa 106px misurati e il titolo comincia a 536px. Il margine
// non è più ~130px: è 24px. Il budget non è stato alzato per farcelo stare — è
// lo stesso numero di prima — ma chi legge questa costante deve sapere che
// oggi morde sul serio, e che il prossimo pannello dentro la scheda non ci
// entra. Sotto la piega più bassa che ci interessa (900px) resta comunque
// margine: il budget morde molto prima che il difetto torni, che è il punto di
// un budget.
const ASSIGN_HEADING_BUDGET_PX = 560;

// LO SCHERMO STRETTO — LA LACUNA CHE QUESTO BUDGET AVEVA, E CHE ORA NON HA.
//
// Fino a qui il budget era asserito SOLO alle due risoluzioni larghe qui sopra.
// Non è un dettaglio di copertura: il riquadro del valore (#32) ha DUE punti di
// rottura dichiarati in src/styles/asta.css, e sotto entrambi la scheda cresce
// in altezza proprio dove ce n'è di meno —
//
//   ≤ 719px  la nota della testata smette di stare sulla riga del titolo e si
//            allinea a sinistra, prendendosi una seconda riga (35px → 52px);
//   ≤ 700px  la griglia delle quattro celle passa da 4 colonne a 2, cioè da una
//            riga di celle a due.
//
// Le due soglie NON coincidono, e i 19px fra l'una e l'altra sono uno stato
// reale della schermata (nota già a sinistra, griglia ancora a 4 colonne), non
// un artefatto del test: per questo i viewport qui sotto sono DUE e non uno —
// uno per lato del gradino. La convivenza dei due breakpoint è registrata come
// domanda aperta nel corpo della PR: qui la si ATTRAVERSA e la si misura, non
// la si riprogetta.
//
// IL NUMERO, E PERCHÉ NON È 560. Su questo stesso albero, con questa stessa
// fixture, «ASSEGNA A» comincia a 565px a 719px di larghezza e a 615px a 700px,
// contro i 536px delle due risoluzioni larghe. La differenza non è la pagina che
// si allunga: sul ramo di produzione il titolo sta a 430px a TUTTE e tre le
// larghezze. È il riquadro che costa di più quando si riflow — 106px larghi,
// 135px a 719, 185px a 700 — e il budget stretto è quel costo misurato, con lo
// stesso ordine di margine che il budget largo si tiene (25px contro 24px). Un
// solo numero per le due famiglie avrebbe voluto dire o un budget largo che non
// morde più, o un budget stretto rosso il giorno che è stato scritto.
const ASSIGN_HEADING_BUDGET_NARROW_PX = 640;

interface NarrowViewport {
  readonly width: number;
  readonly height: number;
  /** Le colonne che la griglia del riquadro DEVE avere a questa larghezza. */
  readonly valueBoxColumns: number;
}

// Di qua e di là dal gradino dei 700px, entrambi sotto i 719px: le due soglie
// sono esercitate tutte e due, e il test lo VERIFICA invece di fidarsi della
// larghezza scelta qui. Senza quel controllo, spostare un breakpoint nel CSS
// renderebbe questi due viewport identici al caso largo e il test resterebbe
// verde misurando un'altra cosa — lo stesso difetto che PANELS_EXPECTED_PRESENT
// impedisce alla spazzata dei riquadri.
//
// DAL 2026-08-29 LE COLONNE SONO DUE DA TUTTE E DUE LE PARTI, e va detto invece
// che aggiustato in silenzio. «Nascondi valore assoluto e valore relativo senza
// cancellare niente.» (Pico): la griglia rende due celle, quindi ha due colonne
// larga — il conteggio segue `VISIBLE_VALUE_SLOT_IDS` via `--value-box-cols` —
// e la media query dei 700px, che manda le celle a due per riga, non cambia più
// niente su due celle. LA CONSEGUENZA, DICHIARATA: a griglia ridotta questi due
// numeri non distinguono più la soglia dei 700px. Il controllo di soglia di
// questo test non è però svanito — resta `noteTextAlign`, che misura quella dei
// 719px — e i due numeri tornano a distinguersi da soli il giorno in cui i due
// slot in crediti tornano a schermo, perché sono derivati dalla costante e non
// scritti a mano. Cablare qui un `4` per tenere viva l'asserzione avrebbe
// misurato un riquadro che non esiste.
const NARROW_VIEWPORTS: readonly NarrowViewport[] = [
  { width: 719, height: 900, valueBoxColumns: VISIBLE_VALUE_SLOT_IDS.length },
  {
    width: 700,
    height: 900,
    valueBoxColumns: Math.min(2, VISIBLE_VALUE_SLOT_IDS.length),
  },
];

// I pannelli che devono stare SOTTO il gesto NON sono un elenco di id, e la
// differenza è il motivo per cui questo file esiste.
//
// Un elenco scritto a mano copre i riquadri di oggi e ignora quello di domani:
// mentre questa corsia lavorava ne è arrivato un secondo (IL RUOLO STASERA,
// corsia worker/tensione-dal-tavolo) e un elenco l'avrebbe lasciato passare in
// silenzio, che è esattamente il modo in cui la schermata è cresciuta fino a
// spingere il gesto fuori. La spazzata qui sotto raccoglie OGNI riquadro della
// vista asta per FORMA, non per nome, quindi comprende anche quelli che questo
// file non ha mai visto.
//
// Che cosa è escluso, e perché ognuna delle due esclusioni è obbligata:
//  - gli antenati del titolo «ASSEGNA A»: la colonna della vista asta è essa
//    stessa un `.panel` e contiene tutto, gesto compreso — confrontarla col
//    proprio contenuto non vuol dire niente;
//  - ciò che sta DENTRO la scheda del giocatore: il riquadro MOMENTO
//    DELL'ASTA ridotto è lì per costruzione (#331 punto 2), e sta sopra il
//    gesto di proposito.
//
// I quattro id qui sotto non sono l'elenco: sono il CONTROLLO che la spazzata
// stia davvero guardando qualcosa. Una spazzata che non trova niente passerebbe
// per vuoto, ed è il modo classico in cui un'asserzione così smette di mordere.
// `player-insight-panel` NON è più in questo elenco, e non perché sia sparito:
// dal 2026-08-29 sta DENTRO `#call-card` (Pico: «come secondo figlio»), e la
// spazzata esclude per costruzione tutto ciò che la scheda contiene. Pretenderlo
// qui vorrebbe dire pretendere che sia FUORI dalla scheda, cioè l'opposto di
// quello che è stato chiesto. Che ci sia, e dove, lo asserisce il test
// `il riquadro insight sta dentro la scheda, come secondo figlio` più sotto.
const PANELS_EXPECTED_PRESENT = [
  "tier-band-panel",
  "war-board-mini",
  "opponent-precedents-panel",
] as const;

interface PanelPosition {
  readonly id: string;
  readonly label: string;
  readonly top: number;
}

interface GestureGeometry {
  readonly headingTop: number;
  readonly teamInViewport: boolean;
  readonly priceInViewport: boolean;
  readonly buttonInViewport: boolean;
  readonly buttonHitsSelf: boolean;
  /** Pixel fra il bordo basso del bottone e la piega. Negativo = sotto la piega. */
  readonly foldMargin: number;
  readonly viewportHeight: number;
  readonly pageHeight: number;
  readonly noHorizontalScroll: boolean;
}

/**
 * Il rettangolo del gesto a scroll 0. `headingTop` è la posizione ASSOLUTA nel
 * documento del titolo «ASSEGNA A» — la stessa grandezza delle misure di
 * riferimento in testa a questo file, così i numeri sono confrontabili con
 * quelli e non con una convenzione inventata qui.
 */
async function gestureGeometry(page: Page): Promise<GestureGeometry> {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll(".panel-title")].find(
      (el) => (el.textContent ?? "").trim() === "ASSEGNA A",
    );
    if (heading === undefined) throw new Error("gesto: nessun titolo «ASSEGNA A»");
    const button = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Registra acquisto",
    );
    if (button === undefined) throw new Error("gesto: nessun bottone «Registra acquisto»");
    const team = document.getElementById("assign-team");
    const price = document.getElementById("assign-price");
    if (team === null || price === null) throw new Error("gesto: manca un campo del form");

    // Tolleranza di un pixel sul bordo basso, come già fanno le altre misure
    // geometriche di questa suite: il layout produce valori sub-pixel e un
    // confronto esatto deciderebbe il verde su un decimo di pixel.
    const inside = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 1;
    };
    const br = button.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);

    return {
      headingTop: Math.round(heading.getBoundingClientRect().top + window.scrollY),
      teamInViewport: inside(team),
      priceInViewport: inside(price),
      buttonInViewport: inside(button),
      buttonHitsSelf: hit !== null && (hit === button || button.contains(hit)),
      foldMargin: Math.round(window.innerHeight - br.bottom),
      viewportHeight: window.innerHeight,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
}

/**
 * Ogni riquadro della vista asta che NON è un antenato del gesto e NON sta
 * dentro la scheda del giocatore, con la sua posizione assoluta nel documento.
 * Raccolti per forma (`.panel`, `.moment-blocks-grid`, `.table-detail`), mai
 * per nome: un riquadro aggiunto domani entra in questa lista da sé.
 */
async function panelsOutsideCard(page: Page): Promise<readonly PanelPosition[]> {
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll(".panel-title")].find(
      (el) => (el.textContent ?? "").trim() === "ASSEGNA A",
    );
    if (heading === undefined) throw new Error("ordine: nessun titolo «ASSEGNA A»");
    const card = document.getElementById("call-card");
    return [...document.querySelectorAll(".panel, .moment-blocks-grid, .table-detail")]
      .filter((el) => !el.contains(heading))
      .filter((el) => card === null || !card.contains(el))
      .map((el) => ({
        id: el.id,
        // Le prime parole del riquadro: un fallimento deve dire QUALE riquadro
        // è finito sopra il gesto anche quando non porta un id.
        label: (el.textContent ?? "").trim().slice(0, 40).replace(/\s+/g, " "),
        top: Math.round(el.getBoundingClientRect().top + window.scrollY),
      }));
  });
}

interface ValueBoxLayout {
  readonly present: boolean;
  /** Le colonne EFFETTIVE della griglia, lette dal layout calcolato. */
  readonly columns: number;
  /** L'allineamento EFFETTIVO della nota di testata. */
  readonly noteTextAlign: string;
}

/**
 * Lo stato di riflow del riquadro del valore, letto dal layout vero e non
 * dedotto dalla larghezza del viewport. È il controllo che tiene onesto il test
 * dello schermo stretto: prova che a quella larghezza le media query di
 * src/styles/asta.css sono DAVVERO quelle attive, così un breakpoint spostato
 * rompe l'asserzione invece di svuotarla in silenzio.
 */
async function valueBoxLayout(page: Page): Promise<ValueBoxLayout> {
  return page.evaluate(() => {
    const grid = document.getElementById("value-box-grid");
    const note = document.getElementById("value-box-note");
    if (grid === null || note === null) {
      return { present: false, columns: 0, noteTextAlign: "" };
    }
    return {
      present: true,
      // `grid-template-columns` calcolato è la lista delle tracce in px: la sua
      // lunghezza è il numero di colonne che il browser ha davvero prodotto.
      columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      noteTextAlign: getComputedStyle(note).textAlign,
    };
  });
}

async function boot(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  // Ogni giro riparte da un'asta vuota: il log persiste attraverso un goto(),
  // e uno stato residuo cambierebbe le altezze che questa spec misura.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

/**
 * Porta la pagina in fondo e aspetta che il browser abbia finito di scorrere.
 *
 * È l'unico modo di provare che un blocco fissato sia DAVVERO fissato: a
 * scorrimento zero un blocco in coda alla pagina e uno inchiodato al fondo
 * dello schermo si vedono uguali, e un test che guardasse solo lì resterebbe
 * verde anche se `position: fixed` sparisse dal foglio di stile.
 */
async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForFunction(
    () =>
      Math.abs(
        window.scrollY + window.innerHeight - document.documentElement.scrollHeight,
      ) <= 2,
  );
}

/** Apre il momento live sul giocatore chiamato, dalla schermata di chiamata. */
async function callPlayer(page: Page): Promise<void> {
  await page.getByText(CALLED, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

test("«ASSEGNA A» è raggiungibile senza scorrere a 1440×900 e a 1920×1080", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}×${viewport.height}`;
    await boot(page, viewport);
    await callPlayer(page);

    const g = await gestureGeometry(page);

    // a. GEOMETRIA — tutte e tre le parti del gesto, dentro la finestra, senza
    //    scorrere. Non «il blocco esiste»: un blocco che esiste 800px più in
    //    basso esisteva anche prima.
    expect(g.teamInViewport, `${where}: il menu squadra è in vista senza scorrere`).toBe(true);
    expect(g.priceInViewport, `${where}: il campo prezzo è in vista senza scorrere`).toBe(true);
    expect(g.buttonInViewport, `${where}: «Registra acquisto» è in vista senza scorrere`).toBe(
      true,
    );
    // …e nel punto in cui si vede il bottone c'è LUI, non una scheda sopra.
    expect(g.buttonHitsSelf, `${where}: il centro del bottone risponde al bottone`).toBe(true);

    // ASSERZIONE INVERTITA, e in meglio. Qui c'era un budget di distanza dal
    // BORDO DEL DOCUMENTO — «ASSEGNA A entro 560px» — e aveva senso finché il
    // gesto scorreva con la pagina: era il modo di dire «non finisce sotto la
    // piega». Dal 2026-08-29 il blocco è `position: fixed` in fondo allo
    // schermo (decisione di Pico), quindi la sua distanza dal documento non
    // descrive più niente: cresce con la pagina e non dice se il gesto si veda.
    //
    // La garanzia nuova è più forte di quella vecchia, e la si prova
    // SCORRENDO FINO IN FONDO: prima il gesto era in vista finché nessuno
    // aggiungeva un blocco sopra di lui, adesso ci resta comunque.
    await scrollToBottom(page);
    const dopo = await gestureGeometry(page);
    expect(dopo.teamInViewport, `${where}: il menu squadra resta in vista in fondo`).toBe(true);
    expect(dopo.priceInViewport, `${where}: il campo prezzo resta in vista in fondo`).toBe(true);
    expect(dopo.buttonInViewport, `${where}: «Registra acquisto» resta in vista in fondo`).toBe(
      true,
    );
    expect(dopo.buttonHitsSelf, `${where}: in fondo il bottone risponde ancora a sé`).toBe(true);

    // Nessuno scorrimento laterale introdotto dalla scheda.
    expect(g.noHorizontalScroll, `${where}: nessuno scorrimento orizzontale`).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

test("«ASSEGNA A» resta sopra la piega anche stretto, di qua e di là dai 700px", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  for (const viewport of NARROW_VIEWPORTS) {
    const where = `${viewport.width}×${viewport.height}`;
    await boot(page, viewport);
    await callPlayer(page);

    // PRIMA: che questa larghezza stia esercitando la soglia che dice di
    // esercitare. Un test dello schermo stretto che misura il layout largo è
    // peggio di nessun test, perché passa.
    const layout = await valueBoxLayout(page);
    expect(layout.present, `${where}: il riquadro del valore è nella scheda`).toBe(true);
    expect(
      layout.columns,
      `${where}: la griglia del riquadro deve avere ${viewport.valueBoxColumns} colonne qui (soglia 700px)`,
    ).toBe(viewport.valueBoxColumns);
    expect(
      layout.noteTextAlign,
      `${where}: sotto i 719px la nota della testata si allinea a sinistra (soglia 719px)`,
    ).toBe("left");

    const g = await gestureGeometry(page);

    // POI: la stessa domanda del test largo, nello stesso ordine. Il gesto
    // intero — menu squadra, campo prezzo, bottone — dentro la finestra a
    // scroll 0, e il bottone che risponde di sé nel punto in cui si vede.
    expect(g.teamInViewport, `${where}: il menu squadra è in vista senza scorrere`).toBe(true);
    expect(g.priceInViewport, `${where}: il campo prezzo è in vista senza scorrere`).toBe(true);
    expect(
      g.buttonInViewport,
      `${where}: «Registra acquisto» è in vista senza scorrere (restano ${g.foldMargin}px fino alla piega)`,
    ).toBe(true);
    expect(g.buttonHitsSelf, `${where}: il centro del bottone risponde al bottone`).toBe(true);

    // Il budget stretto, col numero misurato nel messaggio.
    // Come sopra: la distanza dal documento non è più la misura giusta, e lo
    // scorrimento fino in fondo è la prova che regge anche stretto — dove la
    // scheda cresce di più e dove la piega mordeva peggio.
    await scrollToBottom(page);
    const dopoStretto = await gestureGeometry(page);
    expect(dopoStretto.buttonInViewport, `${where}: il gesto resta in vista in fondo`).toBe(true);
    expect(dopoStretto.buttonHitsSelf, `${where}: in fondo il bottone risponde ancora a sé`).toBe(
      true,
    );

    // Stretto è esattamente dove uno scorrimento laterale comparirebbe per
    // primo: quattro celle a 719px stanno su una riga sola, e devono starci
    // senza far uscire la pagina di lato.
    expect(g.noHorizontalScroll, `${where}: nessuno scorrimento orizzontale`).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

test("sopra il gesto c'è solo il giocatore chiamato: la schermata può crescere sotto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  // b. ORDINE — E PERCHÉ NON È PIÙ L'ORDINE A REGGERE IL GESTO.
  //
  //    Qui si pretendeva che OGNI riquadro stesse sotto «ASSEGNA A»: finché il
  //    gesto scorreva con la pagina era l'unico modo di dire «la sua altezza
  //    non lo riguarda», e bastava un riquadro nuovo sopra di lui per spingerlo
  //    sotto la piega. È successo davvero il 2026-08-29, quando INSIGHT
  //    GIOCATORE è salito dentro la scheda: il gesto è passato da 454px a
  //    705px, e a 845px con una scheda vera in pagina.
  //
  //    Pico ha chiuso la questione alla radice — «assign-block in position
  //    fixed in basso» — e la garanzia è cambiata di natura: non «nessuno sta
  //    sopra di lui», ma «dove stanno gli altri non lo riguarda». Più forte,
  //    perché non chiede niente a chi arriverà domani.
  //
  //    L'asserzione è quindi INVERTITA nella forma e conservata nella
  //    sostanza: si prova il MECCANISMO (il blocco è davvero fissato) invece
  //    dell'effetto che quel meccanismo rende automatico.
  const panels = await panelsOutsideCard(page);

  // Il controllo che la spazzata stia guardando qualcosa: senza, un albero
  // senza riquadri passerebbe per vuoto.
  const ids = panels.map((p) => p.id);
  for (const expected of PANELS_EXPECTED_PRESENT) {
    expect(ids, `la spazzata dei riquadri deve vedere #${expected}`).toContain(expected);
  }

  expect(
    await page.evaluate(() => {
      const el = document.getElementById("assign-block");
      return el === null ? "" : getComputedStyle(el).position;
    }),
    "il gesto è fissato: è questo che rende innocua l'altezza di ciò che gli sta sopra",
  ).toBe("fixed");

  // E la prova per COMPORTAMENTO, che nessuna proprietà calcolata sostituisce:
  // con la pagina in fondo il gesto è ancora lì, e risponde ancora a sé.
  await scrollToBottom(page);
  const inFondo = await gestureGeometry(page);
  expect(inFondo.buttonInViewport, "in fondo alla pagina il gesto è ancora in vista").toBe(true);
  expect(inFondo.buttonHitsSelf, "in fondo alla pagina il centro del bottone risponde al bottone").toBe(
    true,
  );

  // E il gesto sta dentro la scheda del giocatore, non in un blocco a sé: è la
  // struttura da cui discende tutto il resto (#331 punti 2-3).
  expect(
    await page.evaluate(() => document.querySelector("#call-card #assign-block") !== null),
    "il blocco ASSEGNA A vive dentro la scheda del giocatore",
  ).toBe(true);
  expect(
    await page.evaluate(() => document.querySelector("#call-card #moment-facts-panel") !== null),
    "MOMENTO DELL'ASTA vive dentro la scheda del giocatore",
  ).toBe(true);

  // IL POSTO CHIESTO DA PICO, asserito per POSIZIONE e non solo per presenza:
  // «dentro #call-card come secondo figlio». Un test che chiedesse soltanto
  // «esiste dentro la scheda» resterebbe verde con il riquadro in fondo, cioè
  // esattamente dove non deve stare.
  expect(
    await page.evaluate(() => {
      const card = document.getElementById("call-card");
      return card === null ? "" : (card.children[1]?.id ?? "");
    }),
    "il riquadro insight è il SECONDO figlio della scheda del chiamato",
  ).toBe("player-insight-panel");

  expect(externalRequests).toEqual([]);
});

test("ridurre non toglie: gli altri ruoli e il mercato sono dietro UN gesto, nel DOM", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  const toggle = page.locator("#moment-facts-toggle");
  const detail = page.locator("#moment-facts-detail");

  // 1. CHIUSO DI DEFAULT, MA NEL DOM. Le quattro celle di ruolo sono ancora
  //    quattro: una nella scheda, tre dietro il gesto. Nessuna è stata rimossa.
  await expect(detail).toBeHidden();
  await expect(page.locator(".moment-scarcity__cell")).toHaveCount(4);
  await expect(page.locator(".moment-scarcity__cell--called")).toHaveCount(1);
  // Il ruolo chiamato è un attaccante: la cella visibile è la sua.
  await expect(page.locator("#moment-scarcity-A")).toBeVisible();
  for (const role of ["P", "D", "C"]) {
    await expect(page.locator(`#moment-scarcity-${role}`)).toHaveCount(1);
    await expect(page.locator(`#moment-scarcity-${role}`)).toBeHidden();
  }
  // Il censimento MERCATO e la nota metodologica: presenti, con i loro numeri.
  await expect(page.locator("#moment-market-credits")).toHaveText("4000");
  await expect(page.locator("#moment-market-slots")).toHaveText("224");
  await expect(page.locator("#moment-facts-note")).toContainText("nessun dato di modello");

  // 2. IL GESTO DICE COSA CONTIENE PRIMA DI APRIRLO, ed è cablato per
  //    l'accessibilità: aria-expanded/aria-controls, non solo un cursore.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "moment-facts-detail");
  await expect(toggle).toContainText("altri tre ruoli");
  await expect(toggle).toContainText("mercato");

  // 3. UN GESTO SOLO, E DA TASTIERA. Invio sul controllo a fuoco, non un click.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const role of ["P", "D", "C"]) {
    await expect(page.locator(`#moment-scarcity-${role}`)).toBeVisible();
  }
  await expect(page.locator("#moment-market-basis")).toBeVisible();
  // Il fuoco resta sul controllo che ora porta il nuovo aria-expanded: render()
  // ricostruisce l'albero, e senza il ripristino la tastiera finirebbe sul body.
  await expect(toggle).toBeFocused();

  // 4. APRIRE NON RICREA IL DIFETTO. Con il dettaglio aperto il gesto
  //    principale resta interamente in vista a entrambe le risoluzioni: chi
  //    consulta gli altri ruoli non perde il bottone con cui registra.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const g = await gestureGeometry(page);
    expect(
      g.buttonInViewport,
      `${viewport.width}×${viewport.height}: col dettaglio aperto «Registra acquisto» resta in vista (comincia a ${g.headingTop}px)`,
    ).toBe(true);
    expect(g.buttonHitsSelf).toBe(true);
  }

  // 5. RICHIUDIBILE, e il richiuso torna a essere quello di partenza.
  await page.setViewportSize(VIEWPORTS[0]);
  await page.locator("#moment-facts-toggle").click();
  await expect(page.locator("#moment-facts-detail")).toBeHidden();
  await expect(page.locator(".moment-scarcity__cell")).toHaveCount(4);

  expect(externalRequests).toEqual([]);
});

test("il gesto funziona da dove sta: un acquisto si registra senza scorrere", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  // La prova che la geometria non è cosmetica: senza mai scorrere la pagina, il
  // giro completo — squadra, prezzo, registrazione — arriva in fondo e lo stato
  // cambia davvero.
  await page.locator("#assign-team").selectOption("Io");
  await page.locator("#assign-price").fill("30");
  expect(await page.evaluate(() => window.scrollY), "nessuno scorrimento fin qui").toBe(0);
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();
  // Tornati alla chiamata, la fascia critica porta la spesa registrata.
  await expect(page.locator("#critical-spent")).toHaveText("30 cr");

  expect(externalRequests).toEqual([]);
});

// ── LO SPAZIO IN CODA ALLA PAGINA SEGUE LA BARRA ────────────────────────────
//
// Le due barre fisse coprono il fondo dello schermo, e la pagina restituisce
// quello spazio in coda con `--assign-bar-h`. Era un numero scritto a mano —
// 132px — e una lente di review l'ha misurato il 2026-08-29: a 390px la barra
// del gesto è alta 418, e l'ultimo pannello della schermata finiva SOTTO di
// lei, irraggiungibile scorrendo perché la pagina finiva prima. Non era un
// rischio: era un pezzo di prodotto che non si poteva leggere.
//
// Adesso la misura la scrive la barra (`misuraLaBarraFissa`, src/main.ts), e
// questa spec è ciò che impedisce a quel numero di tornare fisso: pretende
// l'UGUAGLIANZA fra l'altezza vera e lo spazio riservato, non una soglia —
// una soglia lascerebbe passare di nuovo un valore «abbastanza grande», che è
// esattamente com'era.
test("la coda della pagina è alta quanto la barra fissa, a ogni larghezza", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  for (const width of [390, 768, 1280, 1920]) {
    await boot(page, { width, height: 844 });

    const ricerca = await page.evaluate(() => {
      const bar = document.getElementById("call-search-row");
      const shell = document.querySelector(".app-shell");
      if (bar === null || shell === null) return null;
      return {
        barra: Math.ceil(bar.getBoundingClientRect().height),
        coda: Math.round(Number.parseFloat(getComputedStyle(shell).paddingBottom)),
      };
    });
    expect(ricerca, `${width}px: barra o guscio assenti`).not.toBeNull();
    expect(ricerca!.coda, `${width}px: la coda non segue la riga di ricerca`).toBe(ricerca!.barra);
  }

  // E sulla schermata d'asta, dove la barra è la più alta delle due: l'ultimo
  // contenuto della pagina deve restare SOPRA il bordo alto della barra.
  await boot(page, { width: 390, height: 844 });
  await callPlayer(page);

  // IL PANNELLO VERO, NON IL BORDO DEL GUSCIO. Una lente di review ha fatto
  // notare che misurare il fondo di `.screen-container` contro la barra è
  // algebricamente `barra - coda`, cioè la stessa uguaglianza di sopra scritta
  // due volte: verde per costruzione, non per verifica. Qui si misura il
  // PANNELLO PIÙ IN BASSO che si vede davvero — quello che nel difetto
  // originale finiva 193px sotto la barra — e la misura è indipendente.
  const asta = await page.evaluate(() => {
    const bar = document.getElementById("assign-block");
    const shell = document.querySelector(".app-shell");
    if (bar === null || shell === null) return null;
    window.scrollTo(0, document.body.scrollHeight);
    const bordoBarra = bar.getBoundingClientRect().top;
    let piuInBasso: number | null = null;
    let chi: string | null = null;
    for (const el of shell.querySelectorAll<HTMLElement>(".panel, .panel--bordered")) {
      if (bar.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      if (piuInBasso === null || r.bottom > piuInBasso) {
        piuInBasso = r.bottom;
        chi = el.id === "" ? (el.className || "senza nome") : el.id;
      }
    }
    return {
      barra: Math.ceil(bar.getBoundingClientRect().height),
      coda: Math.round(Number.parseFloat(getComputedStyle(shell).paddingBottom)),
      chi,
      sottoLaBarra: piuInBasso === null ? null : Math.round(piuInBasso - bordoBarra),
    };
  });
  expect(asta).not.toBeNull();
  expect(asta!.coda, "la coda non segue la barra del gesto").toBe(asta!.barra);
  expect(asta!.chi, "nessun pannello misurabile nella schermata d'asta").not.toBeNull();
  expect(
    asta!.sottoLaBarra,
    `il pannello più in basso («${asta!.chi}») finisce ${asta!.sottoLaBarra}px sotto il bordo della barra: da lì non si legge`,
  ).toBeLessThanOrEqual(0);

  expect(externalRequests).toEqual([]);
});

/**
 * IL VALORE CHIESTO, FISSATO — e la divergenza fra le due barre con lui.
 *
 * «#call-search-row padding 24px» (Pico, 2026-08-30). Una lente di review ha
 * fatto notare che la prova qui sopra NON copre questa richiesta: verifica
 * un'uguaglianza RELATIVA (la coda segue la barra, qualunque altezza abbia la
 * barra) e resterebbe verde identica se il padding tornasse a `12px 24px`. È
 * vero, ed è il motivo di questo test.
 *
 * Si misura il calcolato e non il foglio di stile: `getComputedStyle` dice che
 * cosa vede davvero il browser dopo cascata e media query, che è l'unica cosa
 * che conta per una richiesta fatta guardando lo schermo.
 *
 * E SI MISURA ANCHE L'ALTRA BARRA, che deve restare a 12. Le due regole sono
 * scritte due volte apposta: senza questa metà, il giorno in cui qualcuno le
 * unisse in una classe comune «per pulizia» il test resterebbe verde mentre la
 * barra d'asta ingrassa senza che nessuno l'abbia chiesto.
 */
test("la riga di ricerca ha i 24px chiesti, e la barra d'asta resta a 12", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, { width: 1280, height: 900 });

  const ricerca = await page.evaluate(() => {
    const el = document.getElementById("call-search-row");
    if (el === null) return null;
    const s = getComputedStyle(el);
    return { top: s.paddingTop, right: s.paddingRight, bottom: s.paddingBottom, left: s.paddingLeft };
  });
  expect(ricerca, "#call-search-row non è a schermo nella chiamata").not.toBeNull();
  expect(ricerca).toEqual({ top: "24px", right: "24px", bottom: "24px", left: "24px" });

  // La barra del gesto vive nella schermata d'asta, non in quella di chiamata.
  await callPlayer(page);

  const gesto = await page.evaluate(() => {
    const el = document.getElementById("assign-block");
    if (el === null) return null;
    const s = getComputedStyle(el);
    return { top: s.paddingTop, right: s.paddingRight, bottom: s.paddingBottom, left: s.paddingLeft };
  });
  expect(gesto, "#assign-block non è a schermo nel momento d'asta").not.toBeNull();
  expect(gesto).toEqual({ top: "12px", right: "24px", bottom: "12px", left: "24px" });

  expect(externalRequests).toEqual([]);
});
