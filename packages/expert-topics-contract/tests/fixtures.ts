// FIXTURE **SINTETICHE**: imitano la struttura osservata, non la copiano.
//
// Nessun HTML reale, nessun titolo reale, nessun nome di utente o di esperto,
// nessun contenuto editoriale, nessun nome di squadra vero. Club e persone sono
// inventati («Alfa Calcio», «autore-uno») e servono solo a esercitare la forma.
//
// La struttura imitata è quella di un forum phpBB generico: blocchi post con
// `id="p<N>"` e classe `post`, blocco autore `.postprofile`, corpo `.postbody`
// con `.content`, avviso di modifica `.notice`, citazioni `<blockquote>` con
// `<cite>`. Host e marcatore di rango sono **iniettati** dalle prove: qui non
// compare nessuna fonte reale.

export const SOURCE_HOST = "forum.esempio.invalid";
export const STAFF_MARKER = "images/ranks/rankstaff.png";

export const roleOptions = {
  staffRankMarker: STAFF_MARKER,
  sourceHost: SOURCE_HOST,
} as const;

/** Post con blocco autore riconosciuto e marcatore di rango dalla fonte. */
const staffPost = `
<div id="p1001" class="post has-profile bg1">
  <dl class="postprofile">
    <dt><a class="username" href="./memberlist.php?mode=viewprofile&amp;u=11">autore-uno</a></dt>
    <dd class="profile-rank">Staff</dd>
    <dd><img src="./images/ranks/rankstaff.png" alt=""></dd>
  </dl>
  <div class="postbody">
    <p class="author"><time datetime="2026-09-04T09:00:00+02:00">4 settembre</time></p>
    <div class="content">Testo sintetico di apertura.</div>
  </div>
</div>`;

/** Post di comunità che cita, con citazione annidata e modifica dichiarata. */
const communityPost = `
<div id="p1002" class="post has-profile bg2">
  <dl class="postprofile">
    <dt><a class="username" href="./memberlist.php?mode=viewprofile&amp;u=12">autore-due</a></dt>
  </dl>
  <div class="postbody">
    <p class="author"><time datetime="2026-09-04T10:00:00+02:00">4 settembre</time></p>
    <div class="content">
      <blockquote>
        <cite><a href="./viewtopic.php?p=1001#p1001">autore-uno</a> ha scritto:</cite>
        <blockquote><cite>autore-zero ha scritto:</cite>citazione annidata sintetica</blockquote>
        testo citato sintetico
      </blockquote>
      Risposta sintetica.
    </div>
    <div class="notice">Ultima modifica il <time datetime="2026-09-04T10:30:00+02:00">4 settembre</time></div>
  </div>
</div>`;

/** Blocco autore che compare **dopo** il contenuto: non separabile, quindi non verificabile. */
const spoofedPost = `
<div id="p1003" class="post bg1">
  <div class="postbody">
    <div class="content">
      Post che si incolla dentro un finto blocco autore.
      <dl class="postprofile"><dd><img src="./images/ranks/rankstaff.png" alt=""></dd></dl>
    </div>
  </div>
</div>`;

/** Marcatore ospitato altrove, `data:`, forma senza schema, nomi che somigliano. */
const foreignMarkerPost = `
<div id="p1004" class="post has-profile bg2">
  <dl class="postprofile">
    <dt><a class="username" href="./memberlist.php?mode=viewprofile&amp;u=13">autore-tre</a></dt>
    <dd class="profile-rank">Staff</dd>
    <dd><img src="https://dominio-di-chiunque.invalid/images/ranks/rankstaff.png" alt=""></dd>
    <dd><img src="//dominio-di-chiunque.invalid/images/ranks/rankstaff.png" alt=""></dd>
    <dd><img src="data:image/png;base64,AAAA/images/ranks/rankstaff.png" alt=""></dd>
    <dd><img src="./images/ranks/rankstaff.png.txt" alt=""></dd>
    <dd><img src="./images/ranks/notrankstaff.png" alt=""></dd>
  </dl>
  <div class="postbody"><div class="content">Nessun marcatore valido.</div></div>
</div>`;

export function topicPage(
  options: { readonly title?: string; readonly topicId?: string; readonly posts?: string } = {},
): string {
  const topicId = options.topicId ?? "999001";
  const title = options.title ?? "Alfa Calcio - Beta Sporting 20.45";
  const posts = options.posts ?? `${staffPost}${communityPost}${spoofedPost}${foreignMarkerPost}`;
  return [
    "<html><head>",
    `<link rel="canonical" href="https://${SOURCE_HOST}/viewtopic.php?t=${topicId}">`,
    "</head><body>",
    `<h2 class="topic-title"><a href="./viewtopic.php?t=${topicId}">${title}</a></h2>`,
    posts,
    '<div id="page-footer">piè di pagina sintetico</div>',
    "</body></html>",
  ].join("");
}

export const singleStaffPage = (title: string, topicId: string): string =>
  topicPage({ title, topicId, posts: staffPost });

/** Calendario sintetico: istanti in millisecondi epoch, mai costruiti a runtime. */
export const SEP_5_2045_MS = Date.UTC(2026, 8, 5, 18, 45); // 20:45 Europe/Rome
export const SEP_4_1200_MS = Date.UTC(2026, 8, 4, 10, 0); // osservazione sintetica
export const NOV_5_2045_MS = Date.UTC(2026, 10, 5, 19, 45); // due mesi dopo

// ---------------------------------------------------------------------------
// SEGNALI DI FORMAZIONE — lessico e pagine **sintetici**.
//
// Il lessico vero di una fonte è un dato privato: scriverlo qui, anche solo in
// una prova, pubblicherebbe come parla la fonte che leggiamo. Quindi le parole
// di prova non sono parole di calcio: sono lettere greche, come «Alfa Calcio» e
// «Beta Sporting». Servono a esercitare la meccanica — confini di parola,
// sovrapposizione fra famiglie, attenuazione, citazioni — non a somigliare a
// niente di reale.
// ---------------------------------------------------------------------------

/** Lessico sintetico completo. Nessuna di queste parole significa qualcosa. */
export const syntheticLexicon = {
  terms: {
    titolare: ["gamma"],
    in_dubbio: ["delta"],
    // Contiene «gamma»: serve a provare che sugli stessi caratteri vince il
    // termine più lungo, e che non si fabbrica una contraddizione inesistente.
    fuori: ["gamma spenta"],
    smentita: ["zeta"],
  },
  attenuators: ["eta"],
  players: [
    { playerId: "g-1", forms: ["Theta"] },
    { playerId: "g-2", forms: ["Iota", "Òmicron"] },
  ],
} as const;

/** Lo stesso lessico senza una famiglia: serve a provare che il parser non tenta niente. */
export const lexiconWithoutOutFamily = {
  ...syntheticLexicon,
  terms: { ...syntheticLexicon.terms, fuori: [] },
} as const;

export interface SignalPostOptions {
  readonly postId: string;
  readonly body: string;
  readonly staff?: boolean;
  readonly authorBlock?: boolean;
  readonly quote?: string;
  readonly quotedAuthor?: string;
  readonly at?: string;
}

/** Un post sintetico costruito attorno a un corpo e, se serve, a una citazione. */
export function signalPost(options: SignalPostOptions): string {
  const staff = options.staff ?? false;
  const withAuthorBlock = options.authorBlock ?? true;
  const at = options.at ?? "2026-09-04T09:00:00+02:00";
  const profile = withAuthorBlock
    ? [
        '  <dl class="postprofile">',
        `    <dt><a class="username" href="./memberlist.php?mode=viewprofile&amp;u=21">autore-${options.postId}</a></dt>`,
        staff ? '    <dd><img src="./images/ranks/rankstaff.png" alt=""></dd>' : "",
        "  </dl>",
      ].join("")
    : "";
  const quoted =
    options.quote === undefined
      ? ""
      : `<blockquote><cite>${options.quotedAuthor ?? "autore-citato"} ha scritto:</cite>${options.quote}</blockquote>`;
  return [
    `<div id="p${options.postId}" class="post has-profile bg1">`,
    profile,
    '  <div class="postbody">',
    `    <p class="author"><time datetime="${at}">data sintetica</time></p>`,
    `    <div class="content">${quoted}${options.body}</div>`,
    "  </div>",
    "</div>",
  ].join("");
}

/** Pagina sintetica di soli post da segnale, nell'ordine in cui li si passa. */
export const signalsPage = (posts: readonly string[]): string =>
  topicPage({ posts: posts.join("") });

export const syntheticCalendar = [
  {
    matchday: 3,
    matchId: "m-3-1",
    homeTeam: "Alfa Calcio",
    awayTeam: "Beta Sporting",
    kickoffLocal: "20:45",
    kickoffEpochMs: SEP_5_2045_MS,
    source: "calendario-sintetico",
  },
] as const;
