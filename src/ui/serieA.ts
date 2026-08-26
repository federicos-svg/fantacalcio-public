// Serie A 2026/27 club list — verified against Football Italia ("Monza win
// promotion and complete Serie A line-up for 2026-27"), OneFootball and
// Yahoo Sports (promotions: Venezia, Frosinone, Monza; relegations from
// 2025/26: Verona, Pisa, Cremonese), cross-checked against the existing
// 2025/26 roster. No scraping — verified via web search against independent
// sports-news sources, not the single Google link Owner mentioned.
//
// Logos: this public core ships NO logo image. Club artwork is a private
// overlay of the deployed app, used under a written, scoped authorization
// from a single named source — which source, and how those files were
// obtained, is recorded in the private repository and deliberately not here:
// naming a data source in a public tree is exactly what the boundary rules
// forbid. What matters for this file is only the shape: some clubs ship as
// SVG and some as PNG, so mixed extensions are intentional rather than a bug
// (see CLUB_LOGO_EXTENSION_OVERRIDES below), and any club whose image is
// absent — which, in this repository, is every one of them — falls back
// automatically to the text-initials badge. Nothing here assumes the image
// exists.

import { C, escHtml } from "./theme.js";

export const SERIE_A_CLUBS_2026_27: readonly string[] = [
  "Atalanta", "Bologna", "Cagliari", "Como", "Fiorentina", "Frosinone",
  "Genoa", "Inter", "Juventus", "Lazio", "Lecce", "Milan", "Monza",
  "Napoli", "Parma", "Roma", "Sassuolo", "Torino", "Udinese", "Venezia",
];

function clubInitials(club: string): string {
  return club.slice(0, 3).toUpperCase();
}

// Filename slug for a club's logo asset — must match the filenames actually
// committed in public/assets/clubs/. Accent-stripped (NFD decompose + strip
// combining marks) so e.g. "Südtirol" -> "sudtirol", not a raw "ü".
function clubLogoSlug(club: string): string {
  return club
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The 3 clubs whose asset was obtained as a small PNG (Cloudflare Worker
// relay fetch) rather than the SVG Owner downloaded and handed to the
// session directly — everyone else defaults to .svg. See the header
// comment above for why these three differ.
const CLUB_LOGO_PNG_SLUGS: ReadonlySet<string> = new Set([
  "cremonese",
  "pisa",
  "verona",
]);

/**
 * Expected local path for a club's logo image, whether or not the file
 * actually exists yet. Callers never need to check existence themselves:
 * both render functions below already degrade to the text badge via the
 * image's own load failure (onerror), not a pre-check.
 */
export function clubLogoAssetPath(club: string): string {
  const slug = clubLogoSlug(club);
  const ext = CLUB_LOGO_PNG_SLUGS.has(slug) ? "png" : "svg";
  return `/assets/clubs/${slug}.${ext}`;
}

const CLUB_LOGO_SIZE = 18; // px — matches the text badge's height, "small and consistent" per spec

/**
 * UNA SOLA SCATOLA PER IL MARCHIO, E NON LA SCEGLIE L'ASSET.
 *
 * ═ IL DIFETTO, MISURATO ══════════════════════════════════════════════════
 *
 * Fino a qui i due rami — stemma caricato e ripiego testuale — occupavano
 * DUE SCATOLE DIVERSE, e quale delle due fosse in pagina dipendeva
 * dall'esistenza di un file. Conseguenza: **questo repository misurava una
 * schermata che non spedisce**. Nel core pubblico gli stemmi non esistono e
 * non possono esistere (nessun logo è pubblicabile qui), quindi ogni riga
 * del listone ripiegava sempre; nell'app privata, che gli stemmi ce li ha,
 * la stessa riga era più alta. Il libro mastro del budget verticale
 * (src/ui/callScreenBudget.ts) è stato scritto sulla misura pubblica, e a
 * schermo nessuno vedeva quei numeri.
 *
 * Le due differenze, misurate a 390×844 sulla fixture del mastro:
 *
 *   1. LA BASELINE. Il contenitore era `display:inline-flex` e la baseline
 *      di un contenitore flex viene dal SUO PRIMO FIGLIO IN FLUSSO. Col
 *      file presente il primo figlio è un `<img>`, cioè un elemento
 *      rimpiazzato: la sua baseline è il BORDO INFERIORE della sua scatola,
 *      quindi la cella del club dichiarava 18px sopra la baseline della
 *      riga. Col ripiego il primo figlio è la pastiglia, la cui baseline è
 *      quella del suo testo: ~12,8px sopra, MENO di quanto ne chiede il nome
 *      del giocatore. A 390px la riga del listone allinea le celle per
 *      baseline (`.listone-row { align-items: baseline }`,
 *      src/styles/listone.css): nel primo caso la cella del club diventa
 *      l'ancora della linea e SPINGE IN GIÙ nome e ruolo, nel secondo no.
 *      Riga alta 96,75px con gli stemmi contro 92,5px senza: 4,25px per
 *      riga, 42,5px di span su una pagina da dieci.
 *
 *   2. LA LARGHEZZA, che è un difetto SUO e non una conseguenza del primo.
 *      Lo stemma è un quadrato da 18px, la pastiglia chiede fra 28 e 34px
 *      (tre lettere leggibili non stanno in 18px), e la riga del listone a
 *      390px va a capo: quegli ~11px in più mandano a capo celle diverse.
 *      Misurato isolandolo — su una versione intermedia in cui la baseline
 *      era già pareggiata e la larghezza no — con nomi da 18 caratteri lo
 *      span faceva 1788px con gli stemmi e 1829px senza: 41px di differenza
 *      A PARITÀ DI ALTEZZA DI RIGA (112px in entrambi i casi). Pareggiare
 *      solo la baseline non sarebbe bastato.
 *
 * ═ LA RIPARAZIONE ════════════════════════════════════════════════════════
 *
 * LA PASTIGLIA È LA SCATOLA, SEMPRE. Resta in flusso in entrambi i rami —
 * si nasconde con `visibility`, che toglie l'inchiostro e lascia il posto,
 * non più con `display:none`, che toglieva anche il posto — e lo stemma le
 * viene disegnato SOPRA, fuori dal flusso (`position:absolute`), dove non
 * può cambiare né larghezza né altezza né baseline di niente. Quindi:
 *
 *   - la scatola è la stessa, px per px, con o senza il file;
 *   - la baseline è sempre quella del testo della pastiglia;
 *   - lo stemma resta disegnato 18×18 esattamente come prima, centrato
 *     nella scatola invece che incollato al suo bordo sinistro.
 *
 * Un asset mancante cambia ciò che si vede, non dove sta. Rimisurato il
 * 2026-08-26 a 390×844 nei sei stati della schermata di chiamata, sui due pin
 * di lunghezza dei nomi e sulla PROVA 1, una volta senza stemmi e una coi 23
 * stemmi del privato copiati in public/assets/clubs/: numeri IDENTICI sui due
 * rami — riga del listone 92,5px, span allo stato `ricerca` 1654px — e
 * identici a quelli già scritti nel mastro, che quindi non è stato toccato.
 */
const CLUB_BADGE_SLOT_STYLE = "position:relative;display:inline-flex;align-items:center;flex:none;";

// Shared visual between the DOM-element badge (renderClubBadge, used where
// a real HTMLElement is built via createElement) and the HTML-string badge
// (clubBadgeHtml, used where the caller already assembles innerHTML — e.g.
// the listone table rows in listone.ts). Keeping one style string means the
// two never drift apart.
//
// È ANCHE LA SCATOLA DELLO SLOT (vedi CLUB_BADGE_SLOT_STYLE): questa
// pastiglia è l'unico figlio IN FLUSSO del contenitore, quindi larghezza,
// altezza e baseline del marchio sono le sue, sempre — anche quando è lo
// stemma a essere disegnato.
const CLUB_BADGE_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:18px;padding:0 4px;border-radius:4px;flex:none;" +
  `background:${C.panelInner};border:1px solid ${C.border};color:${C.textSec};font-size:9px;font-weight:800;letter-spacing:0.02em;`;

// FUORI DAL FLUSSO, CENTRATO SULLA SCATOLA DELLA PASTIGLIA. Le dimensioni
// disegnate restano quelle di sempre (18×18, `object-fit:contain`): cambia
// solo che lo stemma non detta più la scatola, la occupa.
const CLUB_LOGO_STYLE =
  `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);` +
  `width:${CLUB_LOGO_SIZE}px;height:${CLUB_LOGO_SIZE}px;border-radius:3px;object-fit:contain;background:${C.panelInner};`;

function clubBadgeTitle(club: string): string {
  return `${club} — logo non disponibile: nessun asset scaricato per questo club (placeholder testuale, non un logo).`;
}

/**
 * Real club logo image, leading before the club name wherever a club is
 * shown — falling back to the placeholder initials badge (never a broken
 * image, never a crash) if the asset hasn't been downloaded for this club.
 * The fallback is driven by the image's own `onerror`, not a build-time or
 * render-time existence check, so a club silently gains its logo the
 * moment a file lands at its expected path in public/assets/clubs/ — no
 * code change needed here when that happens.
 */
export function renderClubBadge(club: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.style.cssText = CLUB_BADGE_SLOT_STYLE;

  const badge = document.createElement("span");
  badge.textContent = clubInitials(club);
  badge.title = clubBadgeTitle(club);
  // `visibility`, non `display`: la pastiglia resta in flusso e tiene la
  // scatola anche quando è lo stemma a essere disegnato — vedi
  // CLUB_BADGE_SLOT_STYLE.
  badge.style.cssText = `${CLUB_BADGE_STYLE}visibility:hidden;`;

  const img = document.createElement("img");
  img.src = clubLogoAssetPath(club);
  img.alt = club;
  img.title = club;
  img.width = CLUB_LOGO_SIZE;
  img.height = CLUB_LOGO_SIZE;
  img.style.cssText = CLUB_LOGO_STYLE;
  img.onerror = () => {
    img.style.display = "none";
    badge.style.visibility = "visible";
  };

  wrap.appendChild(img);
  wrap.appendChild(badge);
  return wrap;
}

/**
 * Same logo-with-fallback as renderClubBadge, as an HTML string — for
 * callers that build innerHTML (e.g. listoneRowHtml in listone.ts) rather
 * than DOM nodes. The fallback is an inline `onerror` handler (there's no
 * addEventListener available on a string), which is the standard, minimal
 * way to do this without a new dependency or a DOM-node rewrite of the
 * innerHTML-based row rendering.
 */
export function clubBadgeHtml(club: string): string {
  const safeClub = escHtml(club);
  const safePath = escHtml(clubLogoAssetPath(club));
  const safeTitle = escHtml(clubBadgeTitle(club));
  return (
    `<span style="${CLUB_BADGE_SLOT_STYLE}">` +
    `<img src="${safePath}" alt="${safeClub}" title="${safeClub}" width="${CLUB_LOGO_SIZE}" height="${CLUB_LOGO_SIZE}" style="${CLUB_LOGO_STYLE}" ` +
    `onerror="this.style.display='none';this.nextElementSibling.style.visibility='visible';">` +
    `<span style="${CLUB_BADGE_STYLE}visibility:hidden;" title="${safeTitle}">${escHtml(clubInitials(club))}</span>` +
    `</span>`
  );
}
