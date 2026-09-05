import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID, PROVA_PREFISSO_ID } from "../src/formazioneProva.js";

// IL CAMPO DELLA PAGINA FORMAZIONE, VISTO DAL BROWSER.
//
// Che cosa questa suite misura, detto prima. Il core pubblico non ha nessuna
// porta verso la lega — è la regola di confine, non una mancanza — quindi
// l'unico stato in cui questo build mostra una formazione intera è la prova con
// la squadra di esempio. È lo stato giusto per misurare il campo: la geometria
// che il modulo impone, i posti che nessuno occupa, e soprattutto i GESTI, che
// sono l'unica parte di questa schermata che un test senza browser non può
// toccare.
//
// PERCHÉ I GESTI SI MISURANO QUI E NON ALTROVE. Il trascinamento nativo non
// esiste sotto un dito su un telefono e non esiste da tastiera: la promessa di
// questa schermata è che ogni gesto abbia anche la seconda strada — si preme un
// giocatore per prenderlo, si preme la destinazione per posarlo. Una promessa
// del genere non la prova un commento: la prova un test che preme, e uno che
// usa solo la tastiera.

const CAMPO = `#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`;

const PORTIERE = `${PROVA_PREFISSO_ID}Portiere-1`;
const CENTROCAMPISTA = `${PROVA_PREFISSO_ID}Centrocampista-4`;
const PANCHINARO = `${PROVA_PREFISSO_ID}Centrocampista-5`;
const ATTACCANTE = `${PROVA_PREFISSO_ID}Attaccante-1`;
const ATTACCANTE_PANCHINA = `${PROVA_PREFISSO_ID}Attaccante-3`;

function gettone(playerId: string): string {
  return `#formazione-${PROVA_COMPETITION_ID}-${playerId}-gettone`;
}

/** Apre la pagina con la rete sorvegliata e accende la prova, che è l'unico modo. */
async function apriIlCampo(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  externalRequests: string[],
): Promise<void> {
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();
  await expect(page.locator(CAMPO)).toBeVisible();
}

test("il campo ha le linee del modulo, e la porta sta in basso", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const campo = page.locator(CAMPO);
  await expect(campo).toHaveAttribute("data-modulo", "442");

  // QUATTRO LINEE, E I POSTI LI DÀ IL MODULO. Un 4-4-2 è uno più quattro più
  // quattro più due: se questi numeri li contasse la funzione di render dai
  // giocatori presenti, un undici incompleto ne mostrerebbe di meno e nessuno
  // vedrebbe il reparto scoperto.
  const linee = campo.locator(".formazione-campo__linea");
  await expect(linee).toHaveCount(4);
  for (const [linea, quanti] of [[0, 1], [1, 4], [2, 4], [3, 2]] as const) {
    await expect(
      campo.locator(`.formazione-campo__linea[data-linea="${linea}"] .formazione-riga`),
    ).toHaveCount(quanti);
  }

  // LA PORTA IN BASSO, come su qualunque campo che qualcuno riconosca: la linea
  // della porta sta più in basso di quella dell'attacco, sullo schermo vero e
  // non nell'ordine del DOM.
  const porta = await linee.nth(0).boundingBox();
  const attacco = await linee.nth(3).boundingBox();
  expect(porta, "la linea della porta ha un rettangolo").not.toBeNull();
  expect(attacco, "la linea d'attacco ha un rettangolo").not.toBeNull();
  expect(porta?.y ?? 0).toBeGreaterThan(attacco?.y ?? 0);

  // E il portiere sta nella linea della porta, non altrove.
  await expect(
    campo.locator('.formazione-campo__linea[data-linea="0"]'),
  ).toContainText(PORTIERE);

  expect(externalRequests).toEqual([]);
});

test("un posto che il modulo prevede e nessuno occupa resta a schermo, vuoto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // Con undici completi non c'è nessun posto vuoto: il campo è pieno.
  await expect(page.locator(".formazione-posto-vuoto")).toHaveCount(0);

  // Tolto un attaccante, il modulo continua a dirne due: il posto che si libera
  // NON sparisce. È la cosa più importante che questa pagina possa mostrare la
  // domenica mattina — «ti manca un attaccante» — e un posto che sparisce
  // quando nessuno lo occupa la nasconde proprio quando serve.
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${ATTACCANTE}-in-panchina`).click();
  const vuoto = page.locator(".formazione-posto-vuoto");
  await expect(vuoto).toHaveCount(1);
  await expect(vuoto).toBeVisible();
  await expect(vuoto).toHaveAttribute("data-ruolo", "A");
  await expect(page.locator(CAMPO)).toHaveAttribute("data-modulo", "442");

  // E SENZA NIENTE IN MANO RESTA A VISTA, SPENTO, col motivo nell'etichetta:
  // un comando che non si può usare non sparisce.
  await expect(vuoto).toBeDisabled();
  await expect(vuoto).toHaveAttribute("aria-label", /nessun giocatore in mano/);

  expect(externalRequests).toEqual([]);
});

test("prendi e posa: due giocatori si scambiano premendo, senza trascinare niente", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const titolare = page.locator(gettone(CENTROCAMPISTA));
  const panchinaro = page.locator(gettone(PANCHINARO));
  await expect(titolare).toHaveAttribute("aria-pressed", "false");

  // PRIMO TEMPO: si prende. La formazione non cambia — prendere non è una mossa
  // — e che sia in mano lo dice `aria-pressed`, non il solo colore del bordo.
  await titolare.click();
  await expect(page.locator(gettone(CENTROCAMPISTA))).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(gettone(CENTROCAMPISTA))).toHaveAttribute("data-preso", "si");
  await expect(page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-modificata",
    "no",
  );

  // PREMERE DI NUOVO LO STESSO LO LASCIA, e non fa succedere niente.
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await expect(page.locator(gettone(CENTROCAMPISTA))).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-modificata",
    "no",
  );

  // SECONDO TEMPO: si posa sulla destinazione, e i due si scambiano il posto.
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await panchinaro.click();
  const campo = page.locator(CAMPO);
  const panchina = page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`);
  await expect(campo).toContainText(PANCHINARO);
  await expect(campo).not.toContainText(CENTROCAMPISTA);
  await expect(panchina).toContainText(CENTROCAMPISTA);
  await expect(page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-modificata",
    "si",
  );

  // E NESSUNO RESTA IN MANO dopo una mossa eseguita.
  await expect(page.locator(gettone(PANCHINARO))).toHaveAttribute("aria-pressed", "false");

  expect(externalRequests).toEqual([]);
});

test("lo stesso scambio si fa CON LA SOLA TASTIERA, senza mai usare il mouse", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // È la prova che la promessa vale: il trascinamento nativo non esiste da
  // tastiera, quindi se il gesto principale passasse solo di lì questa schermata
  // sarebbe inutilizzabile per chi non usa un mouse. Qui non si clicca niente:
  // si porta il fuoco su un bottone vero e si preme Invio.
  await page.locator(gettone(CENTROCAMPISTA)).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(gettone(CENTROCAMPISTA))).toHaveAttribute("aria-pressed", "true");

  await page.locator(gettone(PANCHINARO)).focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(CAMPO)).toContainText(PANCHINARO);
  await expect(page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`)).toContainText(
    CENTROCAMPISTA,
  );

  expect(externalRequests).toEqual([]);
});

test("e col mouse si trascina: la scorciatoia fa la stessa cosa dei due tempi", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // Il trascinamento non è una terza strada con regole sue: si appoggia sugli
  // stessi comandi, e finisce nella stessa funzione di posa. Se un giorno le due
  // strade divergessero, questo test e quello dei due tempi direbbero cose
  // diverse sulla stessa mossa.
  await page.locator(gettone(PANCHINARO)).dragTo(page.locator(gettone(CENTROCAMPISTA)));

  await expect(page.locator(CAMPO)).toContainText(PANCHINARO);
  await expect(page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`)).toContainText(
    CENTROCAMPISTA,
  );

  expect(externalRequests).toEqual([]);
});

test("posare su un gettone della panchina è UNO scambio, non anche un «in panchina»", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // DUE BERSAGLI ANNIDATI, e deve valere solo quello più interno: il gettone
  // sta DENTRO la striscia della panchina, e tutte e due accettano una posa. Se
  // valessero tutti e due, lo scambio verrebbe disfatto dal «manda in panchina»
  // della striscia sotto — due mosse per un gesto, di cui la seconda cancella
  // la prima, e a schermo si vedrebbe solo quella sbagliata.
  // Due attaccanti, così lo scambio non sposta anche un reparto: qui si misura
  // l'annidamento dei bersagli, non la geometria del modulo.
  const panchina = page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`);
  await expect(panchina.locator(".formazione-riga").nth(3)).toContainText(ATTACCANTE_PANCHINA);

  await page.locator(gettone(ATTACCANTE)).click();
  await page.locator(gettone(ATTACCANTE_PANCHINA)).click();

  await expect(page.locator(CAMPO)).toContainText(ATTACCANTE_PANCHINA);
  await expect(panchina).toContainText(ATTACCANTE);
  // Ed è finito al POSTO dell'altro, non in fondo: se avesse agito anche la
  // striscia della panchina, l'attaccante sarebbe l'ultimo a entrare invece del
  // quarto, e l'ordine della panchina è ciò che decide chi entra la domenica.
  await expect(panchina.locator(".formazione-riga").nth(3)).toContainText(ATTACCANTE);
  await expect(panchina.locator(".formazione-riga")).toHaveCount(6);

  expect(externalRequests).toEqual([]);
});

test("un posto vuoto accetta chi viene dalla panchina", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${ATTACCANTE}-in-panchina`).click();
  const vuoto = page.locator(".formazione-posto-vuoto");
  await expect(vuoto).toHaveCount(1);

  await page.locator(gettone(ATTACCANTE_PANCHINA)).click();
  // Con qualcuno in mano il posto vuoto si accende, e dice che cosa farà — «posa
  // qui», che è ciò che succede, e non «diventa un attaccante», che non succede:
  // il reparto lo decide il ruolo letto, mai la casella su cui si posa.
  await expect(vuoto).toBeEnabled();
  await expect(vuoto).toHaveAttribute("aria-label", /posa qui «.*»/);
  await vuoto.click();

  await expect(page.locator(CAMPO)).toContainText(ATTACCANTE_PANCHINA);
  await expect(page.locator(".formazione-posto-vuoto")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("la panchina e i non convocati sono zone di posa, spente finché non si ha niente in mano", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const inPanchina = page.locator(`#formazione-panchina-posa-${PROVA_COMPETITION_ID}`);
  const fuori = page.locator(`#formazione-fuori-posa-${PROVA_COMPETITION_ID}`);
  // A VISTA E SPENTE, col motivo: senza di loro «mandalo in panchina» col dito
  // richiederebbe di trovare un gettone su cui posare, e posare su un gettone è
  // uno scambio, che è un'altra cosa.
  for (const zona of [inPanchina, fuori]) {
    await expect(zona).toBeVisible();
    await expect(zona).toBeDisabled();
    await expect(zona).toHaveAttribute("aria-label", /nessun giocatore in mano/);
  }

  await page.locator(gettone(CENTROCAMPISTA)).click();
  await expect(inPanchina).toBeEnabled();
  await inPanchina.click();
  await expect(page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`)).toContainText(
    CENTROCAMPISTA,
  );
  await expect(page.locator(CAMPO)).not.toContainText(CENTROCAMPISTA);

  // IL PORTIERE NON LASCIA LA PORTA VUOTA, e la zona lo dice prima del clic
  // invece di accendersi e poi rifiutare.
  await page.locator(gettone(PORTIERE)).click();
  await expect(inPanchina).toBeDisabled();
  await expect(inPanchina).toHaveAttribute("aria-label", /è in porta/);

  expect(externalRequests).toEqual([]);
});

test("con qualcuno in mano si VEDE dove si può posarlo, mouse o non mouse", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const destinazione = page
    .locator(`#formazione-panchina-${PROVA_COMPETITION_ID} .formazione-riga`)
    .first();
  // Senza niente in mano non c'è nessuna destinazione da segnalare: la pagina
  // non è accesa a caso.
  await expect(destinazione).toHaveAttribute("data-bersaglio", "no");
  await expect(page.locator('[data-bersaglio="si"]')).toHaveCount(0);

  await page.locator(gettone(CENTROCAMPISTA)).click();

  // CHI NAVIGA SENZA MOUSE NON DEVE AVERE MENO INFORMAZIONE DI CHI CE L'HA: le
  // destinazioni si distinguono da ferme, non solo passandoci sopra.
  await expect(destinazione).toHaveAttribute("data-bersaglio", "si");
  await expect(
    page.locator(`#formazione-panchina-posa-${PROVA_COMPETITION_ID}`).locator(".."),
  ).toHaveAttribute("data-bersaglio", "si");
  expect(await page.locator('[data-bersaglio="si"]').count()).toBeGreaterThan(3);

  // Ma NON chi si ha in mano: premerlo lo lascia, non lo posa su sé stesso.
  await expect(
    page.locator(`#formazione-giocatore-${PROVA_COMPETITION_ID}-${CENTROCAMPISTA}`),
  ).toHaveAttribute("data-bersaglio", "no");

  // E lasciandolo si spegne tutto.
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await expect(page.locator('[data-bersaglio="si"]')).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("mentre trascini, la destinazione sotto il puntatore si accende — e si spegne uscendo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const sorgente = page.locator(gettone(PANCHINARO));
  const bersaglio = page.locator(
    `#formazione-giocatore-${PROVA_COMPETITION_ID}-${CENTROCAMPISTA}`,
  );
  const altrove = page.locator(gettone(`${PROVA_PREFISSO_ID}Difensore-1`));

  // Il trascinamento si guida a mano — premi, passa sopra, passa altrove —
  // perché `dragTo` lo porterebbe a termine in un colpo solo, e quello che si
  // vuole misurare qui è precisamente ciò che si vede A METÀ del gesto: senza
  // questo, capisci dove sarebbe finito il giocatore solo dopo aver mollato.
  await sorgente.hover();
  await page.mouse.down();
  await bersaglio.hover();
  await bersaglio.hover();
  await expect(bersaglio).toHaveAttribute("data-bersaglio-attivo", "si");

  // Uscendo si spegne: l'evidenziazione segue il puntatore e non gli resta
  // attaccata addosso.
  await altrove.hover();
  await altrove.hover();
  await expect(bersaglio).toHaveAttribute("data-bersaglio-attivo", "no");
  await page.mouse.up();

  expect(externalRequests).toEqual([]);
});

test("si trascina anche su una casella vuota, che è una destinazione vera", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${ATTACCANTE}-in-panchina`).click();
  const vuoto = page.locator(".formazione-posto-vuoto__posa");
  await expect(vuoto).toHaveCount(1);

  // IL BERSAGLIO NON È IL BOTTONE. Un bottone spento non riceve nessun evento
  // del mouse e non li lascia passare, e quello della casella vuota è spento
  // finché non si ha niente in mano — cioè per tutta la durata di un
  // trascinamento, che dalla presa non passa. Senza il contenitore attorno, e
  // senza lasciare che gli eventi lo attraversino, qui non sarebbe atterrato
  // niente.
  //
  // Il gesto si guida a mano con uno spostamento breve prima di puntare la
  // destinazione: Chromium comincia un trascinamento solo dopo un movimento col
  // tasto premuto, e un salto secco dalla sorgente al bersaglio non gliene fa
  // vedere nessuno. È un dettaglio del pilota, non del prodotto — col dito e col
  // mouse veri il movimento c'è sempre.
  const sorgente = page.locator(gettone(ATTACCANTE_PANCHINA));
  const da = await sorgente.boundingBox();
  expect(da).not.toBeNull();
  await sorgente.hover();
  await page.mouse.down();
  if (da !== null) {
    await page.mouse.move(da.x + da.width / 2 + 8, da.y + da.height / 2 + 8, { steps: 4 });
  }
  await vuoto.hover();
  await vuoto.hover();
  // E mentre ci si passa sopra, la casella dice che è LEI la destinazione.
  await expect(vuoto).toHaveAttribute("data-bersaglio-attivo", "si");
  await page.mouse.up();

  await expect(page.locator(CAMPO)).toContainText(ATTACCANTE_PANCHINA);
  await expect(page.locator(".formazione-posto-vuoto")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("una mossa rifiutata DICE PERCHÉ: non esiste il gesto in cui non succede niente", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // La porta è l'unico posto che non ammette eccezioni, e scambiarci un
  // difensore non si può. Il punto di questo test non è il divieto — quello è
  // provato senza browser — ma che chi ha fatto il gesto LEGGA il motivo: un
  // trascinamento che non produce né la mossa né una spiegazione si legge come
  // un'applicazione rotta, e chi lo riprova due volte perde la giornata.
  await page.locator(gettone(PORTIERE)).click();
  await page.locator(gettone(`${PROVA_PREFISSO_ID}Difensore-1`)).click();

  const rifiuto = page.locator(`#formazione-mossa-rifiutata-${PROVA_COMPETITION_ID}`);
  await expect(rifiuto).toBeVisible();
  await expect(rifiuto).toContainText("MOSSA NON ESEGUITA");
  await expect(rifiuto).toContainText("in porta ci va un portiere");
  // E la formazione non è cambiata di un posto.
  await expect(page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-modificata",
    "no",
  );

  expect(externalRequests).toEqual([]);
});

test("una mossa del campo che contraddice una spunta CHIEDE, e non decide da sola", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // «Questo lo voglio in campo» detto su un titolare, e poi il gesto che lo
  // toglierebbe dagli undici. Sono due volontà della stessa persona, e la
  // contraddizione la scioglie lei: la pagina non esegue in silenzio calpestando
  // la spunta, e non rifiuta senza dire quale spunta ha rifiutato.
  await page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${CENTROCAMPISTA}`).check();
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await page.locator(gettone(PANCHINARO)).click();

  const conflitto = page.locator(`#formazione-conflitto-${PROVA_COMPETITION_ID}`);
  await expect(conflitto).toBeVisible();
  await expect(conflitto).toContainText("CONTRADDICE UN VINCOLO CHE HAI MESSO");
  await expect(conflitto).toContainText(CENTROCAMPISTA);
  // È LO STESSO RIQUADRO di sempre, con la stessa offerta: non una seconda
  // strada nata per il campo.
  await expect(conflitto).toHaveAttribute("data-conflitto", "titolare_spuntato");

  // «Lascia tutto com'è»: né il vincolo né la formazione si toccano.
  await page.locator(`#formazione-conflitto-lascia-${PROVA_COMPETITION_ID}`).click();
  await expect(conflitto).toHaveCount(0);
  await expect(page.locator(CAMPO)).toContainText(CENTROCAMPISTA);
  await expect(
    page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${CENTROCAMPISTA}`),
  ).toBeChecked();

  // Ripetuto, stavolta togliendo il vincolo: la mossa si esegue e la spunta va
  // via. Ed è la mossa INTERA che riparte — lo scambio, non «mandalo in
  // panchina» — quindi chi doveva entrare entra.
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await page.locator(gettone(PANCHINARO)).click();
  await page.locator(`#formazione-conflitto-procedi-${PROVA_COMPETITION_ID}`).click();
  await expect(page.locator(CAMPO)).toContainText(PANCHINARO);
  await expect(page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`)).toContainText(
    CENTROCAMPISTA,
  );
  await expect(
    page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${CENTROCAMPISTA}`),
  ).not.toBeChecked();

  expect(externalRequests).toEqual([]);
});

test("il modulo bloccato non si aggira trascinando", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  // Il blocco sul modulo vale per il modulo, non per il modo in cui lo si
  // cambia: un cambio esplicito lo chiede, e un trascinamento che cambia la
  // forma degli undici deve chiedere lo stesso — altrimenti il vincolo non
  // c'è, e basta sapere da che parte entrare.
  await page.locator(`#formazione-modulo-${PROVA_COMPETITION_ID}`).selectOption("442");

  // Un difensore dalla panchina al posto di un centrocampista: cinque difensori,
  // tre centrocampisti, due attaccanti — un 5-3-2, che non è il modulo bloccato.
  await page.locator(gettone(`${PROVA_PREFISSO_ID}Difensore-5`)).click();
  await page.locator(gettone(CENTROCAMPISTA)).click();

  const conflitto = page.locator(`#formazione-conflitto-${PROVA_COMPETITION_ID}`);
  await expect(conflitto).toBeVisible();
  await expect(conflitto).toHaveAttribute("data-conflitto", "modulo_bloccato");
  await expect(conflitto).toContainText("442");

  await page.locator(`#formazione-conflitto-procedi-${PROVA_COMPETITION_ID}`).click();
  // Tolto il blocco, la mossa passa e il modulo diventa quello che gli undici
  // compongono davvero: l'etichetta descrive la squadra invece di contraddirla.
  await expect(page.locator(CAMPO)).toHaveAttribute("data-modulo", "532");
  await expect(page.locator(`#formazione-modulo-${PROVA_COMPETITION_ID}`)).toHaveValue("");

  expect(externalRequests).toEqual([]);
});

test("i sette moduli restano a vista, e quello schierato è spento perché è già quello", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriIlCampo(page, context, externalRequests);

  const barra = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`);
  await expect(barra).toHaveAttribute("role", "group");
  await expect(barra.locator("button")).toHaveCount(7);

  const schierato = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-442`);
  await expect(schierato).toBeVisible();
  await expect(schierato).toBeDisabled();
  await expect(schierato).toContainText("schierato");
  await expect(schierato).toHaveAttribute("aria-pressed", "true");

  const altro = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-433`);
  await expect(altro).toBeEnabled();
  await expect(altro).toHaveAttribute("aria-pressed", "false");

  // CAMBIARE MODULO CAMBIA IL CAMPO, non solo un'etichetta: il 4-3-3 sposta un
  // posto dal centrocampo all'attacco, e le linee lo dicono.
  await altro.click();
  await expect(page.locator(CAMPO)).toHaveAttribute("data-modulo", "433");
  await expect(
    page.locator(`${CAMPO} .formazione-campo__linea[data-linea="3"] .formazione-riga`),
  ).toHaveCount(2);
  // Il quarto centrocampista non ha più un posto in questo modulo: è in campo, e
  // lo si dichiara invece di nasconderlo sotto il verde.
  const senzaPosto = page.locator(`#formazione-senza-posto-${PROVA_COMPETITION_ID}`);
  await expect(senzaPosto).toBeVisible();
  await expect(senzaPosto).toContainText("SENZA UN POSTO IN QUESTO MODULO");
  await expect(
    page.locator(`${CAMPO} .formazione-campo__linea[data-linea="3"]`),
  ).toContainText("posto vuoto");

  expect(externalRequests).toEqual([]);
});
