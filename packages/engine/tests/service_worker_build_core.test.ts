import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
// Single source of truth (pure, dependency-free). Imported here (tsconfig
// allowJs) AND by scripts/build-service-worker.mjs, which applies the same
// rules to the real dist/ during `npm run build`.
import {
  APP_INTEGRITY_POLICY_URL,
  APP_INTEGRITY_POLICY_VERSION,
  buildIntegrityPolicy,
  computeBuildId,
  distPathToUrl,
  isDataAssetUrl,
  isGeneratedArtifact,
  manifestUrlFor,
  serializePolicy,
} from "../../../scripts/service-worker-build-core.mjs";

// BUNDLE-01 packaging rules, tested where they are decided:
//  1) cache invalidation — the build id is a function of the built bytes, so a
//     changed bundle can never reuse the previous cache name;
//  2) determinism — same input, same policy, byte for byte (no clock, no sha);
//  3) manifestRequired — set by the presence of a packaged manifest, which is
//     what turns "manifest assente" into a runtime failure for a bundle that
//     was shipped with one.

const hashHex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const FILES = [
  { url: "/assets/index-abc.js", sha256: "a".repeat(64), bytes: 100 },
  { url: "/assets/index-abc.css", sha256: "b".repeat(64), bytes: 50 },
  { url: "/index.html", sha256: "c".repeat(64), bytes: 10 },
  { url: "/data/listone_2026_27.json", sha256: "d".repeat(64), bytes: 500 },
];

describe("path helpers", () => {
  it("turns a dist-relative path into a root-relative URL, on any platform", () => {
    expect(distPathToUrl("assets/index-abc.js")).toBe("/assets/index-abc.js");
    expect(distPathToUrl("assets\\index-abc.js")).toBe("/assets/index-abc.js");
    expect(distPathToUrl("index.html")).toBe("/index.html");
  });

  it("never feeds its own output back in as an input", () => {
    expect(isGeneratedArtifact("sw.js")).toBe(true);
    expect(isGeneratedArtifact("app-integrity.json")).toBe(true);
    expect(isGeneratedArtifact("assets/sw.js")).toBe(false);
    expect(isGeneratedArtifact("index.html")).toBe(false);
  });

  it("recognises data payloads and excludes their manifests", () => {
    expect(isDataAssetUrl("/data/listone_2026_27.json")).toBe(true);
    expect(isDataAssetUrl("/data/listone_2026_27.manifest.json")).toBe(false);
    expect(isDataAssetUrl("/assets/index-abc.js")).toBe(false);
    expect(isDataAssetUrl("/data/notes.txt")).toBe(false);
  });

  it("derives the manifest URL of a data asset", () => {
    expect(manifestUrlFor("/data/listone_2026_27.json")).toBe("/data/listone_2026_27.manifest.json");
  });
});

describe("build id", () => {
  it("is stable under reordering — the input is a set of files, not a listing order", () => {
    expect(computeBuildId(FILES, hashHex)).toBe(computeBuildId([...FILES].reverse(), hashHex));
  });

  it("changes when any file's content hash changes", () => {
    const changed = FILES.map((file, index) => (index === 0 ? { ...file, sha256: "e".repeat(64) } : file));
    expect(computeBuildId(changed, hashHex)).not.toBe(computeBuildId(FILES, hashHex));
  });

  it("changes when a file is added or removed", () => {
    expect(computeBuildId(FILES.slice(1), hashHex)).not.toBe(computeBuildId(FILES, hashHex));
    expect(
      computeBuildId([...FILES, { url: "/extra.js", sha256: "f".repeat(64), bytes: 1 }], hashHex),
    ).not.toBe(computeBuildId(FILES, hashHex));
  });

  it("changes when a file is renamed even if its bytes are identical", () => {
    const renamed = FILES.map((file, index) => (index === 0 ? { ...file, url: "/assets/index-zzz.js" } : file));
    expect(computeBuildId(renamed, hashHex)).not.toBe(computeBuildId(FILES, hashHex));
  });
});

describe("buildIntegrityPolicy", () => {
  it("emits the schema the runtime parser expects", () => {
    const policy = buildIntegrityPolicy(FILES, [], hashHex);
    expect(policy.policy_version).toBe(APP_INTEGRITY_POLICY_VERSION);
    expect(policy.build_id).toMatch(/^[0-9a-f]{64}$/);
    expect(policy.files).toHaveLength(FILES.length);
  });

  it("precaches the root, every built file and the policy itself", () => {
    const policy = buildIntegrityPolicy(FILES, [], hashHex);
    expect(policy.precache).toContain("/");
    expect(policy.precache).toContain(APP_INTEGRITY_POLICY_URL);
    // The listone included: a cold start that boots into an empty listone is
    // not an auction tool.
    expect(policy.precache).toContain("/data/listone_2026_27.json");
    for (const file of FILES) expect(policy.precache).toContain(file.url);
    expect(new Set(policy.precache).size).toBe(policy.precache.length);
  });

  it("lists only data payloads as protected, and marks them unverified until a manifest ships", () => {
    const policy = buildIntegrityPolicy(FILES, [], hashHex);
    expect(policy.data).toEqual([
      {
        url: "/data/listone_2026_27.json",
        manifestUrl: "/data/listone_2026_27.manifest.json",
        manifestRequired: false,
      },
    ]);
  });

  it("requires the manifest as soon as the build actually packages one", () => {
    const withManifest = [
      ...FILES,
      { url: "/data/listone_2026_27.manifest.json", sha256: "0".repeat(64), bytes: 400 },
    ];
    const policy = buildIntegrityPolicy(withManifest, ["/data/listone_2026_27.manifest.json"], hashHex);
    expect(policy.data).toHaveLength(1);
    expect(policy.data[0]?.manifestRequired).toBe(true);
    // The manifest is precached too — offline it must be there to verify against.
    expect(policy.precache).toContain("/data/listone_2026_27.manifest.json");
  });

  it("is deterministic: same files, same bytes out, whatever order they arrive in", () => {
    const first = serializePolicy(buildIntegrityPolicy(FILES, [], hashHex));
    const second = serializePolicy(buildIntegrityPolicy([...FILES].reverse(), [], hashHex));
    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(first).toBe(JSON.stringify(JSON.parse(first), null, 2) + "\n");
  });

  it("handles a build with no data payload at all", () => {
    const policy = buildIntegrityPolicy(FILES.slice(0, 3), [], hashHex);
    expect(policy.data).toEqual([]);
    expect(policy.precache).toContain("/");
  });
});
