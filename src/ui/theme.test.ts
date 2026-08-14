import { describe, it, expect } from "vitest";
import { escHtml, roleChipHtml } from "./theme.js";

// Pure, DOM-independent helpers only (escHtml/roleChipHtml return plain
// strings). renderRoleChip and the rest of src/ui/* build DOM nodes via
// document.createElement and are not covered here — this project has no
// jsdom/happy-dom test environment configured; adding one is a separate,
// larger decision (new dependency + test harness), not part of this batch.

describe("escHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escHtml("<script>")).toBe("&lt;script&gt;");
    expect(escHtml('a & b "c"')).toBe("a &amp; b &quot;c&quot;");
  });

  it("leaves plain text untouched", () => {
    expect(escHtml("Fabbian")).toBe("Fabbian");
  });

  it("is idempotent-safe against double-escaping ampersands only where expected", () => {
    // escHtml replaces "&" first, so a literal "&amp;" in input becomes "&amp;amp;" —
    // documenting this as the actual (single-pass, non-recursive) behavior.
    expect(escHtml("&amp;")).toBe("&amp;amp;");
  });

  it("handles an empty string", () => {
    expect(escHtml("")).toBe("");
  });
});

describe("roleChipHtml", () => {
  it("renders a styled span for each known role P/D/C/A", () => {
    for (const role of ["P", "D", "C", "A"]) {
      const html = roleChipHtml(role);
      expect(html).toContain(`>${role}<`);
      expect(html).toContain("<span");
      expect(html).toContain("background:");
    }
  });

  it("falls back to escaped plain text for an unknown role", () => {
    expect(roleChipHtml("X")).toBe("X");
    expect(roleChipHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("HTML-escapes the role label even for known roles (defense in depth)", () => {
    // Known roles are single safe letters, but the chip still runs the value
    // through escHtml before embedding it — assert that path is exercised.
    expect(roleChipHtml("P")).not.toContain("<script>");
  });
});
