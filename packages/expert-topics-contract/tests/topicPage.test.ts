import { describe, it, expect } from "vitest";
import { parseTopicPage, hasStaffRankImage, stripQuotes } from "../src/topicPage.js";
import { roleOptions, topicPage } from "./fixtures.js";

// LA STRUTTURA DI UNA PAGINA — e le due invarianti che non si possono rompere:
// il ruolo si verifica e non si presume; il testo citato non appartiene a chi
// cita.

const page = parseTopicPage(topicPage(), roleOptions);

describe("lettura della pagina", () => {
  it("riconosce identificativo, titolo e blocchi post", () => {
    expect(page.topicId).toBe("999001");
    expect(page.title).toBe("Alfa Calcio - Beta Sporting 20.45");
    expect(page.posts).toHaveLength(4);
  });

  it("non si porta dentro il piè di pagina nell'ultimo post", () => {
    const last = page.posts[3];
    expect(last?.textWithoutQuotes).not.toContain("piè di pagina");
  });
});

describe("il ruolo si verifica, non si presume", () => {
  it("dichiara staff solo col marcatore nel blocco autore riconosciuto", () => {
    expect(page.posts[0]?.role.role).toBe("staff_verificato");
    expect(page.posts[0]?.role.evidence).toBe("immagine_rango_staff_nel_blocco_autore");
    expect(page.posts[0]?.author.handle).toBe("autore-uno");
    expect(page.posts[0]?.author.userId).toBe("11");
  });

  it("un blocco autore senza marcatore resta comunità", () => {
    expect(page.posts[1]?.role.role).toBe("comunita");
  });

  it("senza blocco autore separabile il ruolo è NON VERIFICABILE, non «comunità»", () => {
    expect(page.posts[2]?.role.role).toBe("non_verificabile");
    expect(page.posts[2]?.role.evidence).toBe("blocco_autore_dopo_il_contenuto");
  });

  it("un marcatore ospitato altrove non dà autorità, e l'etichetta in testo nemmeno", () => {
    expect(page.posts[3]?.role.role).toBe("comunita");
    expect(page.posts[3]?.role.rankLabelObserved).toBe("Staff");
    expect(page.posts[3]?.role.labelIsNotEvidence).toBe(true);
  });

  it("rifiuta una per una le forme con cui ci si darebbe il rango da soli", () => {
    const forms = [
      '<img src="https://dominio-di-chiunque.invalid/images/ranks/rankstaff.png">',
      '<img src="//dominio-di-chiunque.invalid/images/ranks/rankstaff.png">',
      '<img src="data:image/png;base64,AAAA/images/ranks/rankstaff.png">',
      '<img src="javascript:void(0)/images/ranks/rankstaff.png">',
      '<img src="./images/ranks/rankstaff.png.txt">',
      '<img src="./images/ranks/notrankstaff.png">',
    ];
    for (const form of forms) expect(hasStaffRankImage(form, roleOptions)).toBe(false);
    expect(hasStaffRankImage('<img src="./images/ranks/rankstaff.png">', roleOptions)).toBe(true);
    expect(
      hasStaffRankImage(
        '<img src="https://forum.esempio.invalid/images/ranks/rankstaff.png">',
        roleOptions,
      ),
    ).toBe(true);
  });

  it("senza marcatore iniettato nessun post diventa staff", () => {
    const senza = parseTopicPage(topicPage(), { staffRankMarker: "", sourceHost: "" });
    expect(senza.posts.every((post) => post.role.role !== "staff_verificato")).toBe(true);
  });
});

describe("citazioni e testo", () => {
  it("conserva l'annidamento e attribuisce la citazione a chi l'ha scritta", () => {
    const quoting = page.posts[1];
    expect(quoting?.quotes).toHaveLength(2);
    expect(quoting?.maxQuoteDepth).toBe(2);
    expect(quoting?.quotes[0]?.quotedAuthor).toBe("autore-uno");
    expect(quoting?.quotes[0]?.quotedPostId).toBe("1001");
    expect(quoting?.quotes.every((quote) => quote.roleInherited === false)).toBe(true);
  });

  it("il testo citato non resta attaccato al post che cita", () => {
    const quoting = page.posts[1];
    expect(quoting?.textWithoutQuotes).toContain("Risposta sintetica.");
    expect(quoting?.textWithoutQuotes).not.toContain("testo citato sintetico");
    expect(quoting?.textWithoutQuotes).not.toContain("citazione annidata sintetica");
  });

  it("una citazione aperta e mai chiusa taglia da lì in poi, senza attribuire il resto", () => {
    const stripped = stripQuotes("prima<blockquote>citato e mai chiuso");
    expect(stripped).toContain("prima");
    expect(stripped).not.toContain("citato e mai chiuso");
  });
});

describe("le date non si indovinano", () => {
  it("legge pubblicazione e modifica dagli attributi datetime", () => {
    expect(page.posts[0]?.publishedAt).toBe("2026-09-04T09:00:00+02:00");
    expect(page.posts[0]?.editedAt).toBeNull();
    expect(page.posts[1]?.editedAt).toBe("2026-09-04T10:30:00+02:00");
    expect(page.posts[1]?.editDeclared).toBe(true);
  });

  it("senza attributo datetime la data è nulla, non dedotta dal testo", () => {
    const senzaData = parseTopicPage(
      topicPage({
        posts:
          '<div id="p2001" class="post"><dl class="postprofile"><dt><a class="username" href="./memberlist.php?u=9">x</a></dt></dl><div class="postbody"><p>ieri alle 21:12</p><div class="content">testo</div></div></div>',
      }),
      roleOptions,
    );
    expect(senzaData.posts[0]?.publishedAt).toBeNull();
  });
});

describe("robustezza", () => {
  it("su markup vuoto o non riconoscibile non inventa post", () => {
    expect(parseTopicPage("", roleOptions).posts).toHaveLength(0);
    expect(parseTopicPage("<html><body>niente</body></html>", roleOptions).posts).toHaveLength(0);
  });

  it("ricade sull'identificativo dichiarato dal chiamante se la pagina non lo espone", () => {
    const parsed = parseTopicPage('<div id="p1" class="post"></div>', {
      ...roleOptions,
      topicIdFallback: "424242",
    });
    expect(parsed.topicId).toBe("424242");
  });
});
