import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// I QUATTRO INTERRUTTORI DI RUOLO sulla riga del titolo del listone.
//
// Richiesta di Pico, 2026-08-29: «inserisci qui 4 toggle inline per filtrare
// rapidamente P/D/C/A», e — sulla resa stretta — «per il mobile scegli la
// soluzione migliore». Riforma dello stesso giorno: «rendi i toggle P/D/C/A
// del listone con la selezione multipla».
//
// DA UNO ALLA VOLTA A QUANTI SE NE VUOLE, e questa spec cambia con loro. Il
// motivo per cui erano esclusivi era che scrivevano il campo che l'ASTA usa
// per i propri conti, e quello di ruolo ne ammette uno. Ora il filtro del
// listone è un campo suo (`state.listoneRoles`), e la regola che lo tiene
// allineato col ruolo chiamato si legge in una riga: un ruolo acceso da solo
// È il ruolo chiamato, zero o due o più non sono un ruolo.
//
// La fixture porta un giocatore per ruolo, il che rende il conteggio delle
// righe la misura diretta del filtro: quattro righe senza filtro, una sola
// con un ruolo acceso. Un pool con due difensori proverebbe la stessa cosa
// più debolmente, perché «due righe» non distingue «ha filtrato per D» da
// «ha filtrato per qualcos'altro che per caso ne lascia due».

const RIGHE = ".listone-row";

test("un interruttore filtra, e premerlo di nuovo lo spegne", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const gruppo = page.locator("#listone-role-filter");
  const difensori = page.locator("#listone-role-filter-D");

  // Quattro interruttori, nessuno acceso: il listone li mostra tutti.
  await expect(gruppo.locator("button")).toHaveCount(4);
  await expect(page.locator(RIGHE)).toHaveCount(4);
  for (const r of ["P", "D", "C", "A"]) {
    await expect(page.locator(`#listone-role-filter-${r}`)).toHaveAttribute("aria-pressed", "false");
  }

  // Acceso: resta la sola riga di quel ruolo, e lo stato è dichiarato.
  await difensori.click();
  await expect(difensori).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Beatrice Fittizia");

  // SELEZIONE MULTIPLA, rovesciata il 2026-08-29: accendere un secondo NON
  // spegne il primo, e le due righe compaiono INSIEME. È l'unione e non
  // l'intersezione — che sarebbe sempre vuota, perché un giocatore ha un ruolo
  // solo — ed è l'errore che questa riga esiste per non lasciar fare.
  await page.locator("#listone-role-filter-A").click();
  await expect(difensori).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#listone-role-filter-A")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(RIGHE)).toHaveCount(2);
  await expect(page.locator(RIGHE)).toContainText(["Beatrice Fittizia", "Dario Placeholder"]);

  // Spegnerne uno lascia acceso l'altro, e la tabella lo segue.
  await page.locator("#listone-role-filter-A").click();
  await expect(page.locator("#listone-role-filter-A")).toHaveAttribute("aria-pressed", "false");
  await expect(difensori).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(RIGHE)).toHaveCount(1);

  // Spegnere l'ultimo torna a «tutti»: quattro interruttori spenti sono la
  // tabella intera, ed è ciò che rende superfluo un quinto bottone «Tutti».
  await difensori.click();
  await expect(difensori).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(RIGHE)).toHaveCount(4);

  expect(externalRequests).toEqual([]);
});

test("gli interruttori e il menu «Ruolo» restano d'accordo finché il filtro è un ruolo solo", async ({
  page,
  context,
}) => {
  // I due controlli ora hanno campi diversi — il menu scrive il ruolo del
  // CHIAMATO, gli interruttori il filtro della TABELLA — e questa spec è ciò
  // che impedisce alla separazione di diventare una contraddizione a schermo:
  // il menu scrive entrambi, e un solo interruttore acceso riscrive il menu.
  //
  // Il caso che la separazione rende possibile — due ruoli accesi — è quello
  // in cui il menu NON può dire niente di vero, e infatti torna a «Tutti»
  // invece di dichiarare un ruolo che nessuno ha scelto: l'ultima parte di
  // questo test è lì per quello.
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const menu = page.locator("#search-role");

  // Dall'interruttore al menu.
  await page.locator("#listone-role-filter-C").click();
  await expect(menu).toHaveValue("C");

  // E dal menu all'interruttore.
  await menu.selectOption("P");
  await expect(page.locator("#listone-role-filter-P")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#listone-role-filter-C")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Aldo Prova");

  // «Tutti» dal menu spegne anche gli interruttori.
  await menu.selectOption("");
  for (const r of ["P", "D", "C", "A"]) {
    await expect(page.locator(`#listone-role-filter-${r}`)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.locator(RIGHE)).toHaveCount(4);

  // DUE RUOLI ACCESI: il menu non può dire «D» né «A» senza mentire, e torna
  // a «Tutti». La tabella però filtra davvero, e le due righe ci sono: il
  // menu dichiara meno di quel che la tabella mostra, e questo è il prezzo
  // dichiarato della selezione multipla — non una contraddizione, perché
  // «Tutti» sul menu significa «nessun ruolo CHIAMATO», che è vero.
  await page.locator("#listone-role-filter-D").click();
  await page.locator("#listone-role-filter-A").click();
  await expect(menu).toHaveValue("");
  await expect(page.locator(RIGHE)).toHaveCount(2);

  expect(externalRequests).toEqual([]);
});

test("i quattro restano su una riga sola, anche a 390px, e non fanno scorrere di lato", async ({
  page,
  context,
}) => {
  // La resa stretta che Pico ha lasciato decidere a me. `flex-wrap: nowrap`
  // sul gruppo: a mandare a capo è la RIGA DEL TITOLO, che porta gli
  // interruttori sotto al titolo tutti insieme — non il gruppo, che spezzato
  // perderebbe proprio l'informazione che porta (quattro ruoli affiancati,
  // uno solo acceso).
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const cime = await page.locator("#listone-role-filter button").evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  expect(cime).toHaveLength(4);
  // Tutte e quattro alla stessa altezza: se uno fosse andato a capo, la sua
  // cima sarebbe più in basso di almeno l'altezza di un bottone.
  expect(new Set(cime).size, `le cime dei quattro interruttori: ${cime.join(", ")}`).toBe(1);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "nessuno scorrimento laterale a 390px",
  ).toBe(true);

  // E funzionano anche stretti: non sono decorazione che sopravvive al
  // riflow senza più fare il proprio mestiere.
  await page.locator("#listone-role-filter-P").click();
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Aldo Prova");

  // LA LETTERA STA DENTRO IL PALLINO, e il pallino si muove: sono i due canali
  // che dicono lo stato senza il colore (richiesta di Pico con l'immagine,
  // 2026-08-29). Qui si misura che il pallino acceso stia a DESTRA della sua
  // pista e quello spento a sinistra — chi non distingue le tinte legge questo.
  const posizioni = await page.evaluate(() => {
    const leggi = (id: string) => {
      const btn = document.getElementById(id)!;
      const knob = btn.querySelector(".listone-role-filter__knob")!;
      const b = btn.getBoundingClientRect();
      const k = knob.getBoundingClientRect();
      // Confronto fra CENTRI e non fra bordi: col pallino allineato a destra il
      // suo bordo sinistro cade esattamente a metà della pista, e un `>` su
      // quel numero decide il verde su un pixel di padding.
      return {
        lettera: knob.textContent,
        aDestra: k.left + k.width / 2 > b.left + b.width / 2,
      };
    };
    return { acceso: leggi("listone-role-filter-P"), spento: leggi("listone-role-filter-D") };
  });
  expect(posizioni.acceso.lettera).toBe("P");
  expect(posizioni.spento.lettera).toBe("D");
  expect(posizioni.acceso.aDestra, "il pallino acceso sta a destra").toBe(true);
  expect(posizioni.spento.aDestra, "il pallino spento sta a sinistra").toBe(false);

  expect(externalRequests).toEqual([]);
});
