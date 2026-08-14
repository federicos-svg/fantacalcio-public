import { describe, it, expect } from "vitest";
import { SERIE_A_CLUBS_2026_27, clubBadgeHtml, clubLogoAssetPath } from "./serieA.js";

// Pure, DOM-independent helpers only (clubBadgeHtml/clubLogoAssetPath return
// plain strings). renderClubBadge builds a DOM node via
// document.createElement and is not covered here — this project has no
// jsdom/happy-dom test environment configured, same as
// roleChipHtml/renderRoleChip in theme.test.ts.

describe("clubLogoAssetPath", () => {
  it("maps a club name to a stable, predictable local path", () => {
    expect(clubLogoAssetPath("Milan")).toBe("/assets/clubs/milan.svg");
    expect(clubLogoAssetPath("Napoli")).toBe("/assets/clubs/napoli.svg");
  });

  it("slugs multi-word club names with hyphens", () => {
    expect(clubLogoAssetPath("Juve Stabia")).toBe("/assets/clubs/juve-stabia.svg");
  });

  it("strips accents rather than leaving raw unicode in a URL path", () => {
    expect(clubLogoAssetPath("Südtirol")).toBe("/assets/clubs/sudtirol.svg");
  });

  it("never throws on an unknown/unexpected club name", () => {
    expect(() => clubLogoAssetPath("Some Unlisted FC!")).not.toThrow();
    expect(clubLogoAssetPath("Some Unlisted FC!")).toMatch(/^\/assets\/clubs\/[a-z0-9-]+\.svg$/);
  });

  it("uses .png for the 3 clubs fetched as a small raster (not the SVG set Owner provided)", () => {
    expect(clubLogoAssetPath("Cremonese")).toBe("/assets/clubs/cremonese.png");
    expect(clubLogoAssetPath("Pisa")).toBe("/assets/clubs/pisa.png");
    expect(clubLogoAssetPath("Verona")).toBe("/assets/clubs/verona.png");
  });
});

describe("clubBadgeHtml", () => {
  it("leads with a real <img> pointing at the club's expected local logo asset", () => {
    const html = clubBadgeHtml("Milan");
    expect(html).toContain('<img src="/assets/clubs/milan.svg"');
  });

  it("gives the <img> both alt and title set to the club name (accessibility)", () => {
    const html = clubBadgeHtml("Napoli");
    expect(html).toContain('alt="Napoli"');
    expect(html).toContain('title="Napoli"');
  });

  it("always renders the text-initials fallback badge too, hidden until onerror shows it", () => {
    const html = clubBadgeHtml("Milan");
    expect(html).toContain("MIL");
    expect(html).toContain("onerror=");
    // the fallback badge's own style must end in display:none (last write wins in a style attribute)
    expect(html).toMatch(/display:none;"[^>]*>MIL</);
  });

  it("renders the club's first three letters, uppercased, in the fallback badge", () => {
    expect(clubBadgeHtml("Napoli")).toContain("NAP");
    expect(clubBadgeHtml("Inter")).toContain("INT");
  });

  it("HTML-escapes the club name (defense in depth)", () => {
    const html = clubBadgeHtml("<script>Evil</script>");
    expect(html).not.toContain("<script>Evil</script>");
  });

  it("covers every club in the verified 2026/27 list without throwing", () => {
    for (const club of SERIE_A_CLUBS_2026_27) {
      expect(() => clubBadgeHtml(club)).not.toThrow();
      expect(clubBadgeHtml(club)).toContain(club.slice(0, 3).toUpperCase());
    }
  });

  it("never crashes for a club with no downloaded logo asset — same markup shape either way", () => {
    // clubBadgeHtml never checks the filesystem/network; it always renders
    // the same img+fallback pair and lets the browser's onerror decide.
    expect(() => clubBadgeHtml("Cremonese")).not.toThrow();
    expect(() => clubBadgeHtml("Pisa")).not.toThrow();
    expect(() => clubBadgeHtml("Verona")).not.toThrow();
  });
});
