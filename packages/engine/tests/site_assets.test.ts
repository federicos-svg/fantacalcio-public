import { describe, it, expect } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/guardrails-core.mjs and scripts/publication-gate-core.mjs, which
// enforce the same list over `git ls-files`.
import {
  SITE_ASSETS,
  SITE_ASSET_EXTS,
  compileSiteAssets,
  siteAssetStatus,
  staleSiteAssetEntries,
} from "../../../scripts/site-assets-core.mjs";
import { classifyTrackedFile, NO_EXTENSION_EXCEPTIONS } from "../../../scripts/guardrails-core.mjs";
import {
  checkStaleSiteAssets,
  evaluateTrackedFile,
  sha256Hex,
} from "../../../scripts/publication-gate-core.mjs";

// The closed list of the 15 non-text site files (fonts, brand mark, icons) that the
// two guards let through, each by exact path and pinned sha256. Authorization:
// Pico, 2026-10-31, in modal, "Eccezione stretta" (see the header of
// scripts/site-assets-core.mjs). The tests below prove, for the list and for the
// real guards run end to end, the green case and the three red ones:
//   1. a listed file whose content differs from its pin        -> red;
//   2. a non-text file that is not in the list                 -> red (as before);
//   3. a list entry that no longer exists in the tree          -> red.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NUL = String.fromCharCode(0);

const EXPECTED_PATHS = [
  "public/apple-touch-icon.png",
  "public/brand/orizzontale-colori.svg",
  "public/favicon-32.png",
  "public/favicon-48.png",
  "public/favicon.svg",
  "public/fonts/barlow-condensed-latin-600-normal.woff2",
  "public/fonts/barlow-condensed-latin-700-normal.woff2",
  "public/fonts/barlow-condensed-latin-ext-600-normal.woff2",
  "public/fonts/barlow-condensed-latin-ext-700-normal.woff2",
  "public/fonts/barlow-latin-400-normal.woff2",
  "public/fonts/barlow-latin-600-normal.woff2",
  "public/fonts/barlow-latin-700-normal.woff2",
  "public/fonts/barlow-latin-ext-400-normal.woff2",
  "public/fonts/barlow-latin-ext-600-normal.woff2",
  "public/fonts/barlow-latin-ext-700-normal.woff2",
];

const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------------------
// The real list.
// ---------------------------------------------------------------------------
describe("SITE_ASSETS — the real closed list", () => {
  it("is exactly the 15 authorized paths, no more, no fewer", () => {
    expect([...SITE_ASSETS.paths].sort()).toEqual([...EXPECTED_PATHS].sort());
    expect(SITE_ASSETS.size).toBe(15);
  });

  it("names exact files: no glob characters, only the three site extensions, every one under public/", () => {
    for (const path of SITE_ASSETS.paths) {
      expect(path).not.toMatch(/[*?[\]{}\\]/);
      expect(path.startsWith("public/")).toBe(true);
      expect(SITE_ASSET_EXTS.has(path.slice(path.lastIndexOf(".")))).toBe(true);
    }
  });

  it("pins every entry to a sha256", () => {
    for (const path of SITE_ASSETS.paths) {
      expect(SITE_ASSETS.digestOf(path)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("matches the files actually in the tree, byte for byte (the green case on the real content)", () => {
    for (const path of SITE_ASSETS.paths) {
      const digest = sha256(readFileSync(join(ROOT, path)));
      expect(siteAssetStatus(path, digest), path).toBe("pinned");
    }
  });
});

// ---------------------------------------------------------------------------
// The impronte are on BYTES: no line-ending conversion may ever touch a listed file.
// ---------------------------------------------------------------------------
describe("SITE_ASSETS — .gitattributes keeps the bytes exactly as pinned", () => {
  it("every listed file is `text: unset` (no end-of-line conversion), in the real repository", () => {
    const paths = [...SITE_ASSETS.paths];
    const out = execSync(`git check-attr text -- ${paths.map((p) => `"${p}"`).join(" ")}`, {
      cwd: ROOT,
      encoding: "utf8",
    });
    const unset = new Set(
      out
        .split("\n")
        .filter((line) => line.endsWith(": text: unset"))
        .map((line) => line.slice(0, line.length - ": text: unset".length)),
    );
    for (const path of paths) {
      expect(unset.has(path), `${path}: .gitattributes must declare it \`-text\` or \`binary\``).toBe(true);
    }
  });

  it("the fonts and PNGs are `binary`, the two SVGs keep line-by-line diffs (`-text` only)", () => {
    const attrs = (path: string) =>
      execSync(`git check-attr binary diff -- "${path}"`, { cwd: ROOT, encoding: "utf8" });
    for (const path of SITE_ASSETS.paths) {
      const out = attrs(path);
      if (path.endsWith(".svg")) {
        expect(out, path).not.toContain("binary: set");
        expect(out, path).not.toContain("diff: unset");
      } else {
        expect(out, path).toContain("binary: set");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The list compiler: a malformed, wide or doubled entry never compiles.
// ---------------------------------------------------------------------------
describe("compileSiteAssets — the list is closed by construction", () => {
  const digest = "a".repeat(64);
  const entry = (path: string, sha256 = digest) => ({ path, sha256 });
  const compile = (...entries: Array<{ path: string; sha256: string }>) => compileSiteAssets(entries);

  it("compiles a plain list and answers by exact path", () => {
    const list = compile(entry("public/fonts/a.woff2"), entry("public/favicon.svg", "b".repeat(64)));
    expect(list.size).toBe(2);
    expect(list.digestOf("public/fonts/a.woff2")).toBe(digest);
    expect(list.digestOf("public/fonts/b.woff2")).toBeNull();
  });

  it("refuses a glob, in any of its shapes", () => {
    for (const path of ["public/fonts/*.woff2", "public/fonts/a?.woff2", "public/fonts/[ab].woff2", "public/{a,b}.svg"]) {
      expect(() => compile(entry(path)), path).toThrow(/glob/);
    }
  });

  it("refuses an entry outside public/, absolute, relative or with an empty segment", () => {
    expect(() => compile(entry("src/ui/logo.svg"))).toThrow(/not under public\//);
    expect(() => compile(entry("/public/a.svg"))).toThrow(/absolute/);
    expect(() => compile(entry("public/../src/a.svg"))).toThrow(/relative segment/);
    expect(() => compile(entry("public//a.svg"))).toThrow(/empty path segment/);
    expect(() => compile(entry("public\\a.svg"))).toThrow(/backslash/);
  });

  it("refuses an extension outside the ceiling, whatever the digest", () => {
    for (const path of ["public/data/listone.xlsx", "public/data/listone.csv", "public/tool.exe", "public/key.pem", "public/a.jpg", "public/noext"]) {
      expect(() => compile(entry(path)), path).toThrow(/only \.woff2, \.svg, \.png can be listed/);
    }
  });

  it("refuses a missing, short, uppercase or non-hex digest", () => {
    for (const bad of ["", "abc", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      expect(() => compile(entry("public/a.svg", bad)), bad).toThrow(/no valid sha256/);
    }
    expect(() => compileSiteAssets([{ path: "public/a.svg" } as never])).toThrow(/no valid sha256/);
  });

  it("refuses a duplicate path and a spec that is not a list of objects", () => {
    expect(() => compile(entry("public/a.svg"), entry("public/a.svg"))).toThrow(/duplicate path/);
    expect(() => compileSiteAssets({ "public/a.svg": digest } as never)).toThrow(/must be an array/);
    expect(() => compileSiteAssets([null as never])).toThrow(/not an object/);
  });
});

// ---------------------------------------------------------------------------
// repo-guardrails: classifyTrackedFile with a small injected list.
// ---------------------------------------------------------------------------
describe("classifyTrackedFile — site assets", () => {
  const woff2 = "wOF2" + NUL + NUL + "synthetic font bytes";
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'/>";
  const list = compileSiteAssets([
    { path: "public/fonts/a.woff2", sha256: sha256(woff2) },
    { path: "public/brand/m.svg", sha256: sha256(svg) },
  ]);
  const classify = (path: string, content: string, digest: string | null) =>
    classifyTrackedFile(path, content.slice(0, 16), NO_EXTENSION_EXCEPTIONS, digest, list);

  it("GREEN: a listed file with its pinned content is allowed, binary sniff and extension rule notwithstanding", () => {
    expect(classify("public/fonts/a.woff2", woff2, sha256(woff2))).toBe("allowed");
    expect(classify("public/brand/m.svg", svg, sha256(svg))).toBe("allowed");
  });

  it("RED 1: a listed file whose content differs is blocked, binary or not", () => {
    expect(classify("public/fonts/a.woff2", woff2 + "x", sha256(woff2 + "x"))).toBe("blocked-site-asset");
    expect(classify("public/brand/m.svg", svg + " ", sha256(svg + " "))).toBe("blocked-site-asset");
  });

  it("RED 1: a listed file that cannot be verified (no digest supplied) is blocked, never waved through", () => {
    expect(classify("public/fonts/a.woff2", woff2, null)).toBe("blocked-site-asset");
    expect(classifyTrackedFile("public/brand/m.svg", svg, NO_EXTENSION_EXCEPTIONS, undefined, list)).toBe(
      "blocked-site-asset",
    );
  });

  it("RED 1: a changed file cannot pass by looking like another allowed kind", () => {
    // Same path, plain-text content, digest of that text: the pin is on the original bytes.
    expect(classify("public/brand/m.svg", "export const x = 1;", sha256("export const x = 1;"))).toBe(
      "blocked-site-asset",
    );
  });

  it("RED 2: a non-text file that is not in the list stays blocked, exactly as before", () => {
    // Same bytes as a listed file, other name; same name, other folder; other extension, same folder.
    expect(classify("public/fonts/b.woff2", woff2, sha256(woff2))).toBe("blocked-binary");
    expect(classify("public/other/a.woff2", woff2, sha256(woff2))).toBe("blocked-binary");
    expect(classify("public/fonts/x/a.woff2", woff2, sha256(woff2))).toBe("blocked-binary");
    expect(classify("public/brand/other.svg", svg, sha256(svg))).toBe("blocked-ext");
    expect(classify("public/fonts/logo.png", "\x89PNG\r\n\x1a\n" + NUL, null)).toBe("blocked-binary");
    expect(classify("src/ui/icon.svg", svg, sha256(svg))).toBe("blocked-ext");
    expect(classify("public/data/listone.xlsx", "x", null)).toBe("blocked-data");
  });

  it("does not loosen anything else: the other rules and the worktree zone are unchanged", () => {
    expect(classify(".claude/worktrees/w/public/fonts/a.woff2", woff2, sha256(woff2))).toBe("blocked-worktree");
    expect(classify("note.md", "PKrest", null)).toBe("blocked-binary");
    expect(classify("src/ui/views.ts", "export {}", null)).toBe("allowed");
  });

  it("without an injected list the real one applies, and a real path with no digest is blocked", () => {
    expect(classifyTrackedFile("public/favicon.svg", svg)).toBe("blocked-site-asset");
    expect(classifyTrackedFile("public/favicon-64.png", "\x89PNG" + NUL)).toBe("blocked-binary");
  });
});

// ---------------------------------------------------------------------------
// publication gate: evaluateTrackedFile / checkStaleSiteAssets, same small list.
// ---------------------------------------------------------------------------
describe("publication gate — site assets", () => {
  const woff2 = "wOF2" + NUL + NUL + "synthetic font bytes";
  const list = compileSiteAssets([
    { path: "public/fonts/a.woff2", sha256: sha256(woff2) },
    { path: "public/fonts/gone.woff2", sha256: "c".repeat(64) },
  ]);
  const evaluate = (path: string, siteAssetDigest: string | null) =>
    evaluateTrackedFile({
      path,
      content: null,
      contentSample: woff2.slice(0, 16),
      siteAssetDigest,
      siteAssets: list,
    });
  const rules = async (path: string, digest: string | null) =>
    (await evaluate(path, digest)).map((f: { rule: string }) => f.rule).sort();

  it("GREEN: a listed file with its pinned content produces no finding", async () => {
    expect(await rules("public/fonts/a.woff2", sha256(woff2))).toEqual([]);
  });

  it("RED 1: a listed file whose content differs is a finding, and still gets the binary rule", async () => {
    expect(await rules("public/fonts/a.woff2", sha256(woff2 + "x"))).toEqual([
      "site-asset-changed",
      "unexpected-binary",
    ]);
  });

  it("RED 1: a listed file that could not be hashed is a finding, never a pass", async () => {
    expect(await rules("public/fonts/a.woff2", null)).toContain("site-asset-changed");
  });

  it("RED 2: a binary that is not in the list is the same finding it always was", async () => {
    expect(await rules("public/fonts/b.woff2", sha256(woff2))).toEqual(["unexpected-binary"]);
    expect(await rules("public/other/a.woff2", sha256(woff2))).toEqual(["unexpected-binary"]);
  });

  it("the pin waives rule 7 only: the path and content rules still run on a pinned listed file", async () => {
    // A dummy host the test itself fingerprints (never a real identifier).
    const text = "<!-- host banned.example-host.test -->";
    const fingerprintHashes = new Set([await sha256Hex("banned.example-host.test")]);
    const pinned = compileSiteAssets([
      { path: "public/assets/club.png", sha256: sha256(woff2) },
      { path: "public/fonts/s.svg", sha256: sha256(text) },
    ]);
    // A listed path the gate forbids for its own reasons (public/assets/ is banned outright).
    const pathFindings = await evaluateTrackedFile({
      path: "public/assets/club.png",
      content: null,
      contentSample: woff2.slice(0, 16),
      siteAssetDigest: sha256(woff2),
      siteAssets: pinned,
    });
    expect(pathFindings.map((f: { rule: string }) => f.rule)).toEqual(["forbidden-path"]);
    // A pinned file whose content names a fingerprinted private identifier: the content rules are not waived.
    const contentFindings = await evaluateTrackedFile({
      path: "public/fonts/s.svg",
      content: text,
      contentSample: text.slice(0, 16),
      fingerprintHashes,
      siteAssetDigest: sha256(text),
      siteAssets: pinned,
    });
    expect(contentFindings.map((f: { rule: string }) => f.rule)).toEqual(["private-fingerprint"]);
  });

  it("RED 3: an entry that is no longer in the tracked tree is a finding naming it", () => {
    const tracked = ["public/fonts/a.woff2", "src/main.ts"];
    expect(checkStaleSiteAssets(tracked, list)).toEqual([
      expect.objectContaining({ path: "public/fonts/gone.woff2", rule: "stale-site-asset" }),
    ]);
    expect(staleSiteAssetEntries(tracked, list)).toEqual(["public/fonts/gone.woff2"]);
    expect(checkStaleSiteAssets([...tracked, "public/fonts/gone.woff2"], list)).toEqual([]);
  });

  it("the real list is whole in the real tree (git ls-files is checked by the guards themselves)", () => {
    expect(staleSiteAssetEntries([...EXPECTED_PATHS])).toEqual([]);
    expect(staleSiteAssetEntries(EXPECTED_PATHS.slice(1))).toEqual([EXPECTED_PATHS[0]]);
  });
});

// ---------------------------------------------------------------------------
// The two real guards, run end to end over a throwaway git repository that holds
// the real scripts and the real 15 files. This is the proof that the CLI layer
// (hashing, `git ls-files`, exit codes) wires the pure logic as intended — the
// unit tests above cannot see that. Nothing here touches the repository under test.
// ---------------------------------------------------------------------------
describe("the real guards over a throwaway repository", () => {
  const WOFF2 = "public/fonts/barlow-latin-400-normal.woff2";
  const SVG = "public/favicon.svg";
  const PNG = "public/favicon-32.png";

  function makeRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "site-assets-"));
    mkdirSync(join(dir, "scripts"));
    for (const name of readdirSync(join(ROOT, "scripts"))) {
      if (/\.(mjs|json)$/.test(name)) copyFileSync(join(ROOT, "scripts", name), join(dir, "scripts", name));
    }
    writeFileSync(join(dir, "PROJECT_STATE.md"), "# Stato\n");
    for (const path of SITE_ASSETS.paths) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      copyFileSync(join(ROOT, path), join(dir, path));
    }
    git(dir, "init -q");
    git(dir, "add -A");
    return dir;
  }

  function git(dir: string, args: string) {
    execSync(`git ${args}`, { cwd: dir, stdio: "ignore" });
  }

  function run(dir: string, script: string) {
    const r = spawnSync(process.execPath, [join("scripts", script)], { cwd: dir, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  function guards(dir: string) {
    return { guardrails: run(dir, "repo-guardrails.mjs"), gate: run(dir, "publication-gate.mjs") };
  }

  function withRepo(body: (dir: string) => void) {
    const dir = makeRepo();
    try {
      body(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("GREEN: both guards pass with the 15 files in place, and say so in their own output", () => {
    withRepo((dir) => {
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status, guardrails.out).toBe(0);
      expect(guardrails.out).toContain("15 site asset(s) allowed on a pinned sha256");
      expect(gate.status, gate.out).toBe(0);
      expect(gate.out).toContain("15 site asset(s) allowed on a pinned sha256");
    });
  }, 60_000);

  it("RED 1: a listed binary with one byte changed is red in both guards", () => {
    withRepo((dir) => {
      const file = join(dir, WOFF2);
      const bytes = readFileSync(file);
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
      writeFileSync(file, bytes);
      git(dir, "add -A");
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain(`blocked-site-asset: ${WOFF2}`);
      expect(gate.status).toBe(1);
      expect(gate.out).toContain(`[SITE ASSET CHANGED] ${WOFF2}`);
    });
  }, 60_000);

  it("RED 1: a listed svg (text) with one byte appended is red in both guards", () => {
    withRepo((dir) => {
      writeFileSync(join(dir, SVG), `${readFileSync(join(dir, SVG), "utf8")} `);
      git(dir, "add -A");
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain(`blocked-site-asset: ${SVG}`);
      expect(gate.status).toBe(1);
      expect(gate.out).toContain(`[SITE ASSET CHANGED] ${SVG}`);
    });
  }, 60_000);

  it("RED 2: a non-text file that is not in the list is red, even with the bytes of a listed one", () => {
    withRepo((dir) => {
      copyFileSync(join(dir, WOFF2), join(dir, "public/fonts/extra.woff2"));
      copyFileSync(join(dir, PNG), join(dir, "public/favicon-64.png"));
      git(dir, "add -A");
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain("blocked-binary: public/fonts/extra.woff2");
      expect(guardrails.out).toContain("blocked-binary: public/favicon-64.png");
      expect(gate.status).toBe(1);
      expect(gate.out).toContain("[UNEXPECTED BINARY] public/fonts/extra.woff2");
      expect(gate.out).toContain("[UNEXPECTED BINARY] public/favicon-64.png");
    });
  }, 60_000);

  it("RED 2: an svg that is not in the list is red in repo-guardrails, as before (the gate never looked at text)", () => {
    withRepo((dir) => {
      copyFileSync(join(dir, SVG), join(dir, "public/brand/altro.svg"));
      git(dir, "add -A");
      const guardrails = run(dir, "repo-guardrails.mjs");
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain("blocked-ext: public/brand/altro.svg");
    });
  }, 60_000);

  it("RED 3: a listed entry that no longer exists in the tree is red in both guards", () => {
    withRepo((dir) => {
      git(dir, `rm -q -f -- ${WOFF2}`);
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain(`stale-site-asset: ${WOFF2}`);
      expect(gate.status).toBe(1);
      expect(gate.out).toContain(`[STALE SITE ASSET] ${WOFF2}`);
    });
  }, 60_000);

  it("RED 3 and 2 together: renaming a listed file leaves a stale entry AND an unlisted binary", () => {
    withRepo((dir) => {
      git(dir, `mv ${PNG} public/favicon-32x.png`);
      const { guardrails, gate } = guards(dir);
      expect(guardrails.status).toBe(1);
      expect(guardrails.out).toContain(`stale-site-asset: ${PNG}`);
      expect(guardrails.out).toContain("blocked-binary: public/favicon-32x.png");
      expect(gate.status).toBe(1);
      expect(gate.out).toContain(`[STALE SITE ASSET] ${PNG}`);
      expect(gate.out).toContain("[UNEXPECTED BINARY] public/favicon-32x.png");
    });
  }, 60_000);
});
