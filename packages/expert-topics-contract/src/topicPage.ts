// LA STRUTTURA DI UNA PAGINA DI TOPIC — funzione pura dei byte.
//
// Riceve il markup **già letto e già depositato** da chi ha il permesso di
// leggerlo, e ne ricava la struttura: post, autori, ruoli, date, citazioni.
// Non fa rete, non legge orologi, non genera numeri a caso, non deposita
// niente e non conosce nessuna fonte: host e marcatore di rango sono
// **iniettati** dal chiamante.
//
// Perché la segmentazione è per intervallo e non per albero: il markup di un
// forum apre e chiude i tag in modo incoerente, e contare le chiusure
// produrrebbe blocchi sbagliati. Si prendono i marcatori di apertura e si taglia
// fra l'uno e il successivo — una tecnica meno elegante e più onesta.

import type {
  AuthorIdentity,
  AuthorRoleVerdict,
  ParsedTopicPage,
  Quote,
  RoleVerificationOptions,
  TopicPost,
} from "./types.js";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function attributeOf(tag: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  if (match === null) return "";
  return decodeEntities(match[2] ?? match[3] ?? "");
}

function hasClass(tag: string, token: string): boolean {
  const raw = attributeOf(tag, "class");
  return raw.length > 0 && raw.split(/\s+/).includes(token);
}

function classMarkers(html: string, token: string, limit: number): number[] {
  const found: number[] = [];
  const re = /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g;
  let match = re.exec(html);
  let read = 0;
  while (match !== null && read < 60_000 && found.length < limit) {
    read += 1;
    if (hasClass(match[0], token)) found.push(match.index);
    match = re.exec(html);
  }
  return found;
}

function firstClassIndex(fragment: string, token: string): number {
  return classMarkers(fragment, token, 1)[0] ?? -1;
}

function pathOf(href: string): string {
  const decoded = decodeEntities(href);
  const hash = decoded.indexOf("#");
  const withoutFragment = hash === -1 ? decoded : decoded.slice(0, hash);
  const query = withoutFragment.indexOf("?");
  return query === -1 ? withoutFragment : withoutFragment.slice(0, query);
}

function paramOf(href: string, name: string): string | null {
  const decoded = decodeEntities(href);
  const hash = decoded.indexOf("#");
  const withoutFragment = hash === -1 ? decoded : decoded.slice(0, hash);
  const query = withoutFragment.indexOf("?");
  if (query === -1) return null;
  for (const pair of withoutFragment.slice(query + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).replace(/^amp;/, "") === name) return pair.slice(eq + 1);
  }
  return null;
}

interface Anchor {
  readonly tag: string;
  readonly href: string;
  readonly inner: string;
}

function anchorsIn(fragment: string): Anchor[] {
  const found: Anchor[] = [];
  const re = /<a\b([^>]*)>([\s\S]{0,4000}?)<\/a>/gi;
  let match = re.exec(fragment);
  while (match !== null && found.length < 4000) {
    const attrs = match[1] ?? "";
    found.push({ tag: `<a ${attrs}>`, href: attributeOf(attrs, "href"), inner: match[2] ?? "" });
    match = re.exec(fragment);
  }
  return found;
}

interface PostBlock {
  readonly postId: string;
  readonly html: string;
}

function postBlocks(html: string): PostBlock[] {
  const markers: { index: number; id: string }[] = [];
  const re = /<div\b[^>]*>/gi;
  let match = re.exec(html);
  let read = 0;
  while (match !== null && read < 60_000 && markers.length < 400) {
    read += 1;
    const id = attributeOf(match[0], "id");
    if (/^p\d+$/.test(id) && hasClass(match[0], "post")) {
      markers.push({ index: match.index, id: id.slice(1) });
    }
    match = re.exec(html);
  }

  const blocks: PostBlock[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i] as { index: number; id: string };
    const end = markers[i + 1]?.index ?? html.length;
    let fragment = html.slice(start.index, end);
    if (i === markers.length - 1) {
      // L'ultimo blocco arriverebbe in fondo al documento e si porterebbe
      // dentro il piè di pagina: si taglia al primo marcatore di chiusura
      // pagina, e se non c'è resta intero — mai un taglio indovinato.
      const footer = /<div\b[^>]*\bid\s*=\s*("|')page-footer\1/i.exec(fragment);
      const actionBar = firstClassIndex(fragment, "action-bar");
      let cut = footer?.index ?? -1;
      if (actionBar > 0 && (cut === -1 || actionBar < cut)) cut = actionBar;
      if (cut > 0) fragment = fragment.slice(0, cut);
    }
    blocks.push({ postId: start.id, html: fragment });
  }
  return blocks;
}

interface AuthorBlock {
  readonly present: boolean;
  readonly reason: "" | "nessun_blocco_autore" | "blocco_autore_dopo_il_contenuto";
  readonly html: string;
}

/**
 * Il blocco autore è **riconosciuto, mai dedotto**: l'unico contenitore
 * accettato è `.postprofile`, e la sua regione finisce al primo `.postbody` o
 * `.content` che segue. Se il primo `.postprofile` compare **dopo** un
 * `.content`, la separazione non è più dimostrabile e il post è dichiarato
 * non verificabile: chi incolla un finto blocco autore nel proprio testo può
 * al massimo **togliersi** autorità, mai darsene.
 */
function authorBlockOf(postHtml: string): AuthorBlock {
  const profile = firstClassIndex(postHtml, "postprofile");
  if (profile === -1) return { present: false, reason: "nessun_blocco_autore", html: "" };
  const body = firstClassIndex(postHtml, "postbody");
  const content = firstClassIndex(postHtml, "content");
  if (content !== -1 && content < profile) {
    return { present: false, reason: "blocco_autore_dopo_il_contenuto", html: "" };
  }
  let end = postHtml.length;
  if (body > profile && body < end) end = body;
  if (content > profile && content < end) end = content;
  return { present: true, reason: "", html: postHtml.slice(profile, end) };
}

/**
 * Il marcatore vale **solo se l'immagine viene dalla fonte**. Il blocco autore
 * porta anche l'avatar scelto dall'utente: senza controllo d'origine, chiunque
 * ospitasse un file con quel nome su un dominio proprio si darebbe il rango da
 * solo. Forme con schema diverso da http(s) — `data:`, `blob:`, `javascript:` —
 * e forma senza schema (`//host/…`) sono rifiutate esplicitamente.
 */
export function hasStaffRankImage(
  authorBlockHtml: string,
  options: RoleVerificationOptions,
): boolean {
  const wanted = options.staffRankMarker.toLowerCase();
  if (wanted.length === 0) return false;
  const host = options.sourceHost.toLowerCase();
  const re = /<img\b[^>]*>/gi;
  let match = re.exec(authorBlockHtml);
  let seen = 0;
  while (match !== null && seen < 200) {
    seen += 1;
    const src = attributeOf(match[0], "src").toLowerCase().trim();
    let candidate: string | null = null;
    if (/^https?:\/\//.test(src)) {
      const withoutScheme = src.replace(/^https?:\/\//, "");
      const slash = withoutScheme.indexOf("/");
      const seenHost = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash)).replace(
        /:\d+$/,
        "",
      );
      if (host.length > 0 && seenHost === host) {
        candidate = pathOf(slash === -1 ? "/" : withoutScheme.slice(slash));
      }
    } else if (src.startsWith("//") || /^[a-z][a-z0-9+.-]*:/.test(src)) {
      candidate = null;
    } else {
      candidate = pathOf(src);
    }
    if (candidate !== null && (candidate === wanted || candidate.endsWith(`/${wanted}`))) {
      return true;
    }
    match = re.exec(authorBlockHtml);
  }
  return false;
}

function authorOf(authorBlockHtml: string): { handle: string; userId: string } {
  let handle = "";
  let userId = "";
  for (const anchor of anchorsIn(authorBlockHtml)) {
    const named = hasClass(anchor.tag, "username") || hasClass(anchor.tag, "username-coloured");
    const uid = paramOf(anchor.href, "u");
    const isProfileLink =
      uid !== null && /^\d+$/.test(uid) && /memberlist\.php$/.test(pathOf(anchor.href));
    if (!named && !isProfileLink) continue;
    if (handle === "") handle = textOf(anchor.inner);
    if (userId === "" && uid !== null && /^\d+$/.test(uid)) userId = uid;
  }
  if (handle === "") {
    const plain = /class\s*=\s*("|')[^"']*\busername\b[^"']*\1[^>]*>([\s\S]{0,200}?)</i.exec(
      authorBlockHtml,
    );
    if (plain !== null) handle = textOf(plain[2] ?? "");
  }
  return { handle, userId };
}

/**
 * Le date non si indovinano: si leggono **solo** dall'attributo `datetime`.
 * Un testo in prosa («ieri alle 21:12») sarebbe una data e un fuso inventati.
 */
function timesOf(postHtml: string): {
  publishedAt: string | null;
  editedAt: string | null;
  editDeclared: boolean;
} {
  const stamps: { index: number; value: string }[] = [];
  const re = /<time\b[^>]*>/gi;
  let match = re.exec(postHtml);
  while (match !== null && stamps.length < 40) {
    const value = attributeOf(match[0], "datetime");
    if (value !== "") stamps.push({ index: match.index, value });
    match = re.exec(postHtml);
  }
  const notice = firstClassIndex(postHtml, "notice");
  const editText = /Ultima modifica/i.test(postHtml) || /Edited by/i.test(postHtml);
  let publishedAt: string | null = null;
  let editedAt: string | null = null;
  for (const stamp of stamps) {
    if (notice !== -1 && stamp.index > notice) {
      if (editedAt === null) editedAt = stamp.value;
    } else if (publishedAt === null) {
      publishedAt = stamp.value;
    }
  }
  return {
    publishedAt,
    editedAt,
    editDeclared: (notice !== -1 && editText) || editedAt !== null,
  };
}

interface QuoteMarker {
  readonly index: number;
  readonly end: number;
  readonly opening: boolean;
}

function quoteMarkers(html: string): QuoteMarker[] {
  const markers: QuoteMarker[] = [];
  const open = /<blockquote\b[^>]*>/gi;
  let match = open.exec(html);
  while (match !== null && markers.length < 400) {
    markers.push({ index: match.index, end: match.index + match[0].length, opening: true });
    match = open.exec(html);
  }
  const close = /<\/blockquote>/gi;
  let closing = close.exec(html);
  while (closing !== null && markers.length < 800) {
    markers.push({
      index: closing.index,
      end: closing.index + closing[0].length,
      opening: false,
    });
    closing = close.exec(html);
  }
  return markers.sort((a, b) => a.index - b.index);
}

/** Chi è citato, letto dalla riga di attribuzione della citazione. */
function citationOf(ownHtml: string): { quotedAuthor: string; quotedPostId: string } {
  const cite = /<cite\b[^>]*>([\s\S]{0,400}?)<\/cite>/i.exec(ownHtml);
  if (cite === null) return { quotedAuthor: "", quotedPostId: "" };
  const quotedAuthor = textOf(cite[1] ?? "")
    .replace(/\s*ha\s+scritto\s*:?\s*$/i, "")
    .replace(/\s*wrote\s*:?\s*$/i, "")
    .trim();
  let quotedPostId = "";
  for (const anchor of anchorsIn(cite[1] ?? "")) {
    const decoded = decodeEntities(anchor.href);
    const anchored = /#p(\d+)\s*$/.exec(decoded);
    if (anchored !== null) {
      quotedPostId = anchored[1] as string;
      break;
    }
    const param = paramOf(decoded, "p");
    if (param !== null && /^\d+$/.test(param)) {
      quotedPostId = param;
      break;
    }
  }
  return { quotedAuthor, quotedPostId };
}

/** Frame di una citazione aperta e non ancora chiusa. */
interface QuoteFrame {
  readonly slot: number;
  readonly depth: number;
  cursor: number;
  readonly pieces: string[];
}

/**
 * L'annidamento si conserva perché è l'unica cosa che dice **chi ha detto che
 * cosa**. Il ruolo dell'autore citato non passa mai al post che cita.
 *
 * Il testo **proprio** di ogni citazione si raccoglie per intervallo, con una
 * pila: la regione di una citazione va dalla sua apertura alla chiusura che le
 * corrisponde, meno le regioni delle citazioni annidate dentro di lei. Una sola
 * espressione regolare non greedy chiuderebbe sulla prima `</blockquote>` — che
 * in una citazione annidata è quella **interna** — e taglierebbe via la parte
 * di citazione che segue l'annidamento, cioè proprio le parole che l'autore
 * citato ha aggiunto dopo aver citato a sua volta.
 */
function quotesOf(postHtml: string): { quotes: Quote[]; maxDepth: number } {
  const markers = quoteMarkers(postHtml);
  const own: string[] = [];
  const depths: number[] = [];
  const stack: QuoteFrame[] = [];
  let maxDepth = 0;
  for (const marker of markers) {
    const parent = stack[stack.length - 1];
    if (marker.opening) {
      if (parent !== undefined) {
        parent.pieces.push(postHtml.slice(parent.cursor, marker.index));
        parent.cursor = marker.index;
      }
      const depth = stack.length + 1;
      if (depth > maxDepth) maxDepth = depth;
      const slot = own.length;
      own.push("");
      depths.push(depth);
      stack.push({ slot, depth, cursor: marker.end, pieces: [] });
      continue;
    }
    // Chiusura senza apertura: si ignora invece di far scivolare la profondità
    // su una citazione che non è mai cominciata.
    if (parent === undefined) continue;
    parent.pieces.push(postHtml.slice(parent.cursor, marker.index));
    own[parent.slot] = parent.pieces.join(" ");
    stack.pop();
    const grandparent = stack[stack.length - 1];
    if (grandparent !== undefined) grandparent.cursor = marker.end;
  }
  // Citazione aperta e mai chiusa: la sua regione arriva fino in fondo al post.
  // Mai si presume che il resto appartenga a chi scrive.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i] as QuoteFrame;
    frame.pieces.push(postHtml.slice(frame.cursor));
    own[frame.slot] = frame.pieces.join(" ");
  }

  const quotes: Quote[] = own.map((ownHtml, index) => {
    const cited = citationOf(ownHtml);
    const withoutCite = ownHtml.replace(/<cite\b[\s\S]{0,600}?<\/cite>/i, " ");
    return {
      depth: depths[index] ?? 1,
      quotedAuthor: cited.quotedAuthor,
      quotedPostId: cited.quotedPostId,
      quotedAuthorRecognised: cited.quotedAuthor !== "",
      text: textOf(withoutCite),
      roleInherited: false,
    };
  });
  return { quotes, maxDepth };
}

/**
 * Toglie le citazioni **per intervallo**, seguendo la profondità. Una sola
 * espressione regolare non greedy chiuderebbe sulla prima `</blockquote>` —
 * che in una citazione annidata è quella **interna** — e lascerebbe attaccate
 * al post le parole di un altro autore.
 */
export function stripQuotes(html: string): string {
  const markers = quoteMarkers(html);
  if (markers.length === 0) return html;
  const pieces: string[] = [];
  let depth = 0;
  let written = 0;
  for (const marker of markers) {
    if (marker.opening) {
      if (depth === 0) pieces.push(html.slice(written, marker.index));
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) {
        written = marker.end;
        pieces.push(" ");
      }
    }
  }
  // Citazione aperta e mai chiusa: si taglia dall'apertura in poi. Mai si
  // presume che il resto del post appartenga a chi scrive.
  if (depth > 0) return `${pieces.join("")} `;
  pieces.push(html.slice(written));
  return pieces.join("");
}

function bodyTextOf(postHtml: string): { text: string; contentRecognised: boolean } {
  const content = firstClassIndex(postHtml, "content");
  const zone = content === -1 ? postHtml : postHtml.slice(content);
  const signature = firstClassIndex(zone, "signature");
  const withoutSignature = signature === -1 ? zone : zone.slice(0, signature);
  return { text: textOf(stripQuotes(withoutSignature)), contentRecognised: content !== -1 };
}

function titleOf(html: string): string {
  for (const marker of classMarkers(html, "topic-title", 4)) {
    const fragment = html.slice(marker, marker + 4000);
    const anchors = anchorsIn(fragment);
    const first = anchors[0];
    if (first !== undefined) return textOf(first.inner);
    const closed = /^<[^>]*>([\s\S]{0,400}?)<\//.exec(fragment);
    if (closed !== null) return textOf(closed[1] ?? "");
  }
  const heading = /<h2\b[^>]*>([\s\S]{0,400}?)<\/h2>/i.exec(html);
  return heading === null ? "" : textOf(heading[1] ?? "");
}

function topicIdOf(html: string, fallback: string): string {
  const canonical = /<link\b[^>]*rel\s*=\s*("|')canonical\1[^>]*>/i.exec(html);
  if (canonical !== null) {
    const id = paramOf(attributeOf(canonical[0], "href"), "t");
    if (id !== null && /^\d+$/.test(id)) return id;
  }
  for (const anchor of anchorsIn(html)) {
    if (!/(^|\/)viewtopic\.php$/.test(pathOf(anchor.href))) continue;
    const id = paramOf(anchor.href, "t");
    if (id !== null && /^\d+$/.test(id)) return id;
  }
  return fallback;
}

function roleOf(block: AuthorBlock, options: RoleVerificationOptions): AuthorRoleVerdict {
  const staff = block.present && hasStaffRankImage(block.html, options);
  const label = block.present
    ? textOf(
        /class\s*=\s*("|')[^"']*\bprofile-rank\b[^"']*\1[^>]*>([\s\S]{0,200}?)</i.exec(
          block.html,
        )?.[2] ?? "",
      )
    : "";
  const verdict: AuthorRoleVerdict = {
    role: staff ? "staff_verificato" : block.present ? "comunita" : "non_verificabile",
    evidence: staff
      ? "immagine_rango_staff_nel_blocco_autore"
      : block.present
        ? "blocco_autore_riconosciuto_senza_marcatore_di_rango"
        : block.reason === "blocco_autore_dopo_il_contenuto"
          ? "blocco_autore_dopo_il_contenuto"
          : "nessun_blocco_autore",
    markerLookedFor: options.staffRankMarker,
    rankLabelObserved: label,
    labelIsNotEvidence: true,
  };
  return verdict;
}

export interface ParsePageOptions extends RoleVerificationOptions {
  /** Offset della pagina depositata, quando il chiamante lo conosce. */
  readonly pageOffset?: number | null;
  /** Identificativo del topic da usare se la pagina non lo espone. */
  readonly topicIdFallback?: string;
}

/** Legge la struttura di una pagina di topic. Funzione pura dei byte. */
export function parseTopicPage(raw: string, options: ParsePageOptions): ParsedTopicPage {
  const html = typeof raw === "string" ? raw : "";
  const posts: TopicPost[] = [];
  const blocks = postBlocks(html);
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i] as PostBlock;
    const authorBlock = authorBlockOf(block.html);
    const identity = authorBlock.present
      ? authorOf(authorBlock.html)
      : { handle: "", userId: "" };
    const author: AuthorIdentity = {
      handle: identity.handle,
      userId: identity.userId,
      authorBlockRecognised: authorBlock.present,
    };
    const times = timesOf(block.html);
    const quotes = quotesOf(block.html);
    const body = bodyTextOf(block.html);
    posts.push({
      postId: block.postId,
      positionInPage: i + 1,
      pageOffset: options.pageOffset ?? null,
      author,
      role: roleOf(authorBlock, options),
      publishedAt: times.publishedAt,
      editedAt: times.editedAt,
      editDeclared: times.editDeclared,
      quotes: quotes.quotes,
      maxQuoteDepth: quotes.maxDepth,
      textWithoutQuotes: body.text,
      contentRecognised: body.contentRecognised,
    });
  }
  return {
    topicId: topicIdOf(html, options.topicIdFallback ?? ""),
    title: titleOf(html),
    posts,
    rawLength: html.length,
  };
}
