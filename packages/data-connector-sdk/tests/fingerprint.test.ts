import { describe, expect, it } from "vitest";
import { canonicalJson, fingerprintArtifact, sha256Hex } from "../src/fingerprint.js";

describe("canonicalJson", () => {
  it("is independent of object key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("sorts keys recursively in nested objects", () => {
    expect(canonicalJson({ z: { b: 1, a: 2 }, a: 1 })).toBe(
      canonicalJson({ a: 1, z: { a: 2, b: 1 } }),
    );
  });
});

describe("fingerprintArtifact", () => {
  it("produces a deterministic lowercase 64-hex SHA-256", () => {
    const first = fingerprintArtifact({ a: 1, b: 2 });
    const second = fingerprintArtifact({ b: 2, a: 1 });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when content actually changes", () => {
    expect(fingerprintArtifact({ a: 1 })).not.toBe(fingerprintArtifact({ a: 2 }));
  });

  it("matches a direct sha256Hex(canonicalJson(...)) computation", () => {
    const value = { role_counts: { P: 1, D: 2 }, total: 3 };
    expect(fingerprintArtifact(value)).toBe(sha256Hex(canonicalJson(value)));
  });
});
