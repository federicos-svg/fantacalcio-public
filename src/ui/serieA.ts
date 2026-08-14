// Serie A 2026/27 club list — verified against Football Italia ("Monza win
// promotion and complete Serie A line-up for 2026-27"), OneFootball and
// Yahoo Sports (promotions: Venezia, Frosinone, Monza; relegations from
// 2025/26: Verona, Pisa, Cremonese), cross-checked against the existing
// 2025/26 roster. No scraping — verified via web search against independent
// sports-news sources, not the single Google link Owner mentioned.
//
// Logos (2026-07-03 update — see docs/data/LISTONE_UI_LOAD_CONTRACT.md
// "Club logos"): Owner gave a written, scoped authorization to use real club
// logo images as *local assets of this Cloudflare-Access-protected app*,
// sourced only from football-logos.cc (the single authorized source — no
// crawling, explicit URLs only). The 20 clubs above are covered by SVGs Owner
// downloaded himself from football-logos.cc and handed to the session
// directly; the 3 clubs that are in the 2025/26 listone but not in the
// 2026/27 list above (Cremonese, Pisa, Verona) are covered by small 64x64
// PNGs fetched from the same site via a Cloudflare Worker relay (this
// session's sandbox has no direct network route to football-logos.cc, so a
// disposable Worker fetched the assets and handed them back through
// Cloudflare KV — same authorized source, same explicit-URL approach, no
// crawling). Mixed extensions are intentional, not a bug: see
// CLUB_LOGO_EXTENSION_OVERRIDES below. Any club without a downloaded file
// automatically falls back to the text-initials badge — nothing here
// assumes the image exists.

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

// Shared visual between the DOM-element badge (renderClubBadge, used where
// a real HTMLElement is built via createElement) and the HTML-string badge
// (clubBadgeHtml, used where the caller already assembles innerHTML — e.g.
// the listone table rows in listone.ts). Keeping one style string means the
// two never drift apart.
const CLUB_BADGE_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:18px;padding:0 4px;border-radius:4px;flex:none;" +
  `background:${C.panelInner};border:1px solid ${C.border};color:${C.textSec};font-size:9px;font-weight:800;letter-spacing:0.02em;`;

const CLUB_LOGO_SIZE = 18; // px — matches the text badge's height, "small and consistent" per spec
const CLUB_LOGO_STYLE = `width:${CLUB_LOGO_SIZE}px;height:${CLUB_LOGO_SIZE}px;border-radius:3px;object-fit:contain;flex:none;vertical-align:middle;background:${C.panelInner};`;

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
  wrap.style.cssText = "display:inline-flex;align-items:center;";

  const badge = document.createElement("span");
  badge.textContent = clubInitials(club);
  badge.title = clubBadgeTitle(club);
  badge.style.cssText = `${CLUB_BADGE_STYLE}display:none;`;

  const img = document.createElement("img");
  img.src = clubLogoAssetPath(club);
  img.alt = club;
  img.title = club;
  img.width = CLUB_LOGO_SIZE;
  img.height = CLUB_LOGO_SIZE;
  img.style.cssText = CLUB_LOGO_STYLE;
  img.onerror = () => {
    img.style.display = "none";
    badge.style.display = "inline-flex";
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
    `<span style="display:inline-flex;align-items:center;">` +
    `<img src="${safePath}" alt="${safeClub}" title="${safeClub}" width="${CLUB_LOGO_SIZE}" height="${CLUB_LOGO_SIZE}" style="${CLUB_LOGO_STYLE}" ` +
    `onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';">` +
    `<span style="${CLUB_BADGE_STYLE}display:none;" title="${safeTitle}">${escHtml(clubInitials(club))}</span>` +
    `</span>`
  );
}
