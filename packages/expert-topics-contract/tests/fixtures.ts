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
