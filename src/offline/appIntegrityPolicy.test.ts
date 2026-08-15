// The build-emitted integrity policy, parsed the way the browser parses it.
// Pure logic, no DOM (this repo has no jsdom harness — see src/ui/listone.ts).
import { describe, expect, it } from "vitest";
import {
  APP_INTEGRITY_POLICY_VERSION,
  parseAppIntegrityPolicy,
  protectedAssetFor,
  SHELL_CACHE_PREFIX,
  shellCacheName,
  staleShellCacheNames,
  type AppIntegrityPolicy,
} from "./appIntegrityPolicy.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function validPolicyJson(): Record<string, unknown> {
  return {
    policy_version: APP_INTEGRITY_POLICY_VERSION,
    build_id: HASH_A,
    files: [{ url: "/assets/index-abc.js", sha256: HASH_B, bytes: 10 }],
    data: [
      {
        url: "/data/listone_2026_27.json",
        manifestUrl: "/data/listone_2026_27.manifest.json",
        manifestRequired: true,
      },
    ],
    precache: ["/", "/index.html", "/assets/index-abc.js"],
  };
}

describe("parseAppIntegrityPolicy", () => {
  it("accepts a policy shaped exactly like the one the build emits", () => {
    const parsed = parseAppIntegrityPolicy(validPolicyJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.policy.build_id).toBe(HASH_A);
    expect(parsed.policy.data[0]?.manifestRequired).toBe(true);
    expect(parsed.policy.precache).toContain("/index.html");
  });

  it.each([
    ["a wrong schema version", { policy_version: "app-integrity-v2" }],
    ["a non-sha256 build id", { build_id: "not-a-hash" }],
    ["files that are not an array", { files: {} }],
    ["data that is not an array", { data: "none" }],
    ["precache that is not an array", { precache: 3 }],
  ])("refuses %s", (_label, patch) => {
    expect(parseAppIntegrityPolicy({ ...validPolicyJson(), ...patch }).ok).toBe(false);
  });

  it("refuses an absolute or protocol-relative URL anywhere in the policy", () => {
    const external = parseAppIntegrityPolicy({
      ...validPolicyJson(),
      files: [{ url: "https://cdn.example/x.js", sha256: HASH_B, bytes: 1 }],
    });
    expect(external.ok).toBe(false);
    const protocolRelative = parseAppIntegrityPolicy({
      ...validPolicyJson(),
      precache: ["//cdn.example/x.js"],
    });
    expect(protocolRelative.ok).toBe(false);
  });

  it("refuses a data entry whose manifestRequired is not a boolean", () => {
    const parsed = parseAppIntegrityPolicy({
      ...validPolicyJson(),
      data: [{ url: "/data/x.json", manifestUrl: "/data/x.manifest.json", manifestRequired: "yes" }],
    });
    expect(parsed.ok).toBe(false);
  });

  it.each([null, undefined, 42, "policy", []])("refuses a non-object policy (%s)", (value) => {
    expect(parseAppIntegrityPolicy(value).ok).toBe(false);
  });
});

describe("cache versioning", () => {
  it("derives the cache name from the build id", () => {
    expect(shellCacheName(HASH_A)).toBe(`${SHELL_CACHE_PREFIX}${HASH_A}`);
  });

  it("marks every other cache of ours stale — and never one that is not ours", () => {
    const existing = [
      `${SHELL_CACHE_PREFIX}${HASH_A}`,
      `${SHELL_CACHE_PREFIX}${HASH_B}`,
      "some-other-app-cache",
      "workbox-precache-v2",
    ];
    expect(staleShellCacheNames(existing, `${SHELL_CACHE_PREFIX}${HASH_A}`)).toEqual([
      `${SHELL_CACHE_PREFIX}${HASH_B}`,
    ]);
  });

  it("keeps the current cache when it is the only one", () => {
    expect(staleShellCacheNames([`${SHELL_CACHE_PREFIX}${HASH_A}`], `${SHELL_CACHE_PREFIX}${HASH_A}`)).toEqual([]);
  });

  it("changes the cache name whenever the build id changes", () => {
    expect(shellCacheName(HASH_A)).not.toBe(shellCacheName(HASH_B));
  });
});

describe("protectedAssetFor", () => {
  const policy = (parseAppIntegrityPolicy(validPolicyJson()) as { ok: true; policy: AppIntegrityPolicy }).policy;

  it("matches the exact declared pathname", () => {
    expect(protectedAssetFor(policy, "/data/listone_2026_27.json")?.manifestRequired).toBe(true);
  });

  it("does not match a prefix, a sibling or the manifest itself", () => {
    expect(protectedAssetFor(policy, "/data/listone_2026_27.json.bak")).toBeNull();
    expect(protectedAssetFor(policy, "/data/other.json")).toBeNull();
    expect(protectedAssetFor(policy, "/data/listone_2026_27.manifest.json")).toBeNull();
    expect(protectedAssetFor(policy, "/index.html")).toBeNull();
  });
});
