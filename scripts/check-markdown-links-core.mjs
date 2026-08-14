// Markdown link-checker core — PURE logic, NO Node imports (string-only).
// Single source of truth shared by:
//   - scripts/check-markdown-links.mjs                 (real enforcement over `git ls-files`)
//   - packages/engine/tests/markdown_links.test.ts     (synthetic unit tests)
// Same shape as guardrails-core.mjs / secret-scan-core.mjs: keeping this file
// dependency-free lets the TypeScript test import it (tsconfig allowJs) without
// pulling Node globals or needing @types/node.
//
// Scope, deliberately narrow (DOC-01 Fase 2, issue #258): only links that are
// *internal to the repo* are verified — a relative path to another tracked file
// and, when that file is markdown, the heading anchor inside it. Everything
// else (http/https, mailto, protocol-relative, repo-root-absolute `/foo`) is
// out of scope by construction: **this checker never performs any network
// request**, so an external URL is not something it could ever adjudicate.

// ---------------------------------------------------------------------------
// 1. Code stripping
// ---------------------------------------------------------------------------

// Blanks out fenced code blocks and inline code spans while preserving BOTH the
// number of lines and each line's length, so line numbers reported downstream
// stay exact. Without this, every ```markdown example block in the docs
// (there are several — CLAUDE.md, the charter, the runbooks) would be scanned
// as if it were real prose and produce phantom findings.
export function blankOutCode(text) {
  const lines = text.split("\n");
  const out = [];
  let fence = null; // the exact opening fence marker, e.g. "```" or "~~~~"
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null && m) {
      fence = m[1][0].repeat(m[1].length);
      out.push("");
      continue;
    }
    if (fence !== null) {
      // A closing fence is the same character, at least as long, nothing after it.
      const closing = new RegExp(`^\\s{0,3}${fence[0] === "\`" ? "`" : "~"}{${fence.length},}\\s*$`);
      if (closing.test(line)) fence = null;
      out.push("");
      continue;
    }
    out.push(blankInlineCode(line));
  }
  return out.join("\n");
}

// Inline code spans: `…`, ``…``, etc. Replaced by same-length blanks.
function blankInlineCode(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] === "`") {
      let ticks = 0;
      while (line[i + ticks] === "`") ticks++;
      const marker = "`".repeat(ticks);
      const close = line.indexOf(marker, i + ticks);
      if (close !== -1) {
        out += " ".repeat(close + ticks - i);
        i = close + ticks;
        continue;
      }
    }
    out += line[i];
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Link extraction
// ---------------------------------------------------------------------------

// Inline links and images: [text](target), ![alt](target), with optional
// "title" and optional <angle brackets> around the target.
const INLINE_LINK = /(!?)\[(?:[^[\]\\]|\\.|\[[^\]]*\])*\]\(\s*(<[^<>\n]*>|[^\s()]*)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g;
// Reference definitions: [label]: target "title"
const REF_DEF = /^\s{0,3}\[(?:[^[\]\\]|\\.)+\]:\s*(<[^<>\n]*>|\S+)/;
// Raw HTML anchors that occur in a few docs: <a href="…">
const HTML_HREF = /<a\s[^>]*href\s*=\s*("([^"]*)"|'([^']*)')/gi;

// Extracts every link target from a markdown document, with its 1-based line
// number. Code (fenced + inline) is blanked out first.
export function collectLinks(content) {
  const text = blankOutCode(content);
  const lines = text.split("\n");
  const links = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    INLINE_LINK.lastIndex = 0;
    let m;
    while ((m = INLINE_LINK.exec(line)) !== null) {
      links.push({ line: lineNo, target: unwrapAngle(m[2]) });
      if (m.index === INLINE_LINK.lastIndex) INLINE_LINK.lastIndex++; // zero-width guard
    }

    const ref = REF_DEF.exec(line);
    if (ref) links.push({ line: lineNo, target: unwrapAngle(ref[1]) });

    HTML_HREF.lastIndex = 0;
    while ((m = HTML_HREF.exec(line)) !== null) {
      links.push({ line: lineNo, target: unwrapAngle(m[2] ?? m[3] ?? "") });
    }
  }
  return links;
}

function unwrapAngle(target) {
  const t = target.trim();
  return t.startsWith("<") && t.endsWith(">") ? t.slice(1, -1).trim() : t;
}

// ---------------------------------------------------------------------------
// 3. Classification
// ---------------------------------------------------------------------------

// kind:
//   "skip"     — nothing this checker can or should verify offline
//   "anchor"   — same-document anchor (#foo)
//   "internal" — relative path inside the repo, optionally with #anchor
export function classifyLink(rawTarget) {
  const target = decodeTarget(rawTarget);
  if (target === "") return { kind: "skip", reason: "empty" };
  // Absolute URLs, protocol-relative URLs, mailto:, tel:, data:, and template
  // placeholders like {{url}} — plus repo-root-absolute `/docs/x.md`, which
  // GitHub resolves against the branch view rather than the checkout and is
  // therefore deliberately out of scope (see file header).
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return { kind: "skip", reason: "scheme" };
  if (target.startsWith("//")) return { kind: "skip", reason: "protocol-relative" };
  if (target.startsWith("/")) return { kind: "skip", reason: "root-absolute" };
  if (target.startsWith("#")) return { kind: "anchor", path: null, anchor: target.slice(1) };
  const hash = target.indexOf("#");
  const path = hash === -1 ? target : target.slice(0, hash);
  const anchor = hash === -1 ? null : target.slice(hash + 1);
  if (path === "") return { kind: "skip", reason: "empty" };
  return { kind: "internal", path, anchor };
}

function decodeTarget(target) {
  try {
    return decodeURIComponent(target.trim());
  } catch {
    return target.trim();
  }
}

// Resolves a repo-relative link against the linking file. Pure string maths —
// no filesystem. Returns null when the link escapes the repo root.
export function resolveRepoPath(fromFile, relPath) {
  const baseParts = fromFile.split("/").slice(0, -1);
  const parts = relPath.split("/");
  const stack = [...baseParts];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null; // escapes the repo root
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

// ---------------------------------------------------------------------------
// 4. Heading anchors (GitHub slugs)
// ---------------------------------------------------------------------------

// GitHub's slugger: lowercase, drop punctuation/symbols, spaces -> hyphens.
// Kept close to github-slugger's behaviour (letters, numbers, connector
// punctuation, combining marks and hyphens survive) without the dependency.
export function slugify(headingText) {
  const plain = stripInlineMarkup(headingText);
  return plain
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{Pc}\p{M}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function stripInlineMarkup(text) {
  return text
    .replace(/`+/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/<[^>\n]+>/g, "") // inline HTML tags
    .replace(/\*\*|__/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2")
    .replace(/(\S)[*_](\s|$)/g, "$1$2")
    .trim();
}

// Every anchor a markdown document exposes: one per ATX heading (with
// github-slugger's `-1`, `-2` … de-duplication) plus explicit HTML anchors
// (<a id="…">, <a name="…">). Setext headings are intentionally not parsed —
// they are absent from this repo and their `---` underline is ambiguous with
// front-matter and thematic breaks.
export function headingAnchors(content) {
  const text = blankOutCode(content);
  const anchors = new Set();
  const seen = new Map();
  for (const line of text.split("\n")) {
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const base = slugify(h[2]);
      if (base === "") continue;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    for (const m of line.matchAll(/<a\s[^>]*(?:id|name)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      anchors.add((m[2] ?? m[3] ?? "").toLowerCase());
    }
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// 5. The check itself
// ---------------------------------------------------------------------------

export const REASON_MISSING_FILE = "missing-file";
export const REASON_MISSING_ANCHOR = "missing-anchor";
export const REASON_ESCAPES_REPO = "escapes-repo";

// Stable key for the allowlist: file + target, never a line number (which would
// churn on every unrelated edit above it).
export function findingKey(file, target) {
  return `${file} -> ${target}`;
}

/**
 * @param {object} input
 * @param {Map<string,string>} input.docs        tracked .md path -> content (the files scanned)
 * @param {Set<string>} input.trackedPaths       every tracked path in the repo (any kind)
 * @param {Set<string>} input.trackedDirs        every directory that contains a tracked path
 * @param {Set<string>} [input.allowlist]        findingKey()s of pre-existing breakage
 * @returns {{findings: Array, allowlisted: Array, unusedAllowlist: string[]}}
 */
export function checkRepoLinks({ docs, trackedPaths, trackedDirs, allowlist = new Set() }) {
  const anchorCache = new Map();
  const anchorsOf = (path) => {
    if (!anchorCache.has(path)) anchorCache.set(path, headingAnchors(docs.get(path) ?? ""));
    return anchorCache.get(path);
  };

  const findings = [];
  const allowlisted = [];
  const usedAllowlist = new Set();

  for (const file of [...docs.keys()].sort()) {
    for (const { line, target } of collectLinks(docs.get(file))) {
      const link = classifyLink(target);
      if (link.kind === "skip") continue;

      let reason = null;
      if (link.kind === "anchor") {
        if (link.anchor !== "" && !anchorsOf(file).has(link.anchor)) reason = REASON_MISSING_ANCHOR;
      } else {
        const resolved = resolveRepoPath(file, link.path);
        if (resolved === null) {
          reason = REASON_ESCAPES_REPO;
        } else if (!trackedPaths.has(resolved) && !trackedDirs.has(resolved)) {
          reason = REASON_MISSING_FILE;
        } else if (link.anchor && link.anchor !== "" && docs.has(resolved)) {
          if (!anchorsOf(resolved).has(link.anchor)) reason = REASON_MISSING_ANCHOR;
        }
      }
      if (reason === null) continue;

      const key = findingKey(file, target);
      const entry = { file, line, target, reason, key };
      if (allowlist.has(key)) {
        usedAllowlist.add(key);
        allowlisted.push(entry);
      } else {
        findings.push(entry);
      }
    }
  }

  const unusedAllowlist = [...allowlist].filter((k) => !usedAllowlist.has(k)).sort();
  return { findings, allowlisted, unusedAllowlist };
}
