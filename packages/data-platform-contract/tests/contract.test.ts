import { describe, expect, it } from "vitest";
import {
  DATA_PLATFORM_CONTRACT_VERSION,
  dataPlatformContractHash,
  validateDataPlatformContract,
} from "../src/contract.js";

describe("data platform contract", () => {
  it("is internally valid", () => {
    expect(validateDataPlatformContract()).toEqual([]);
  });

  it("has a deterministic versioned SHA-256 fingerprint", () => {
    const first = dataPlatformContractHash();
    const second = dataPlatformContractHash();
    expect(DATA_PLATFORM_CONTRACT_VERSION).toBe("DATA-PLATFORM-CONTRACT@1.0.0");
    expect(first).toBe(second);
    // Public-core revision: the registry carries a redacted endpoint reference,
    // so this fingerprint differs from the private repository's pin by design.
    expect(first).toBe("eeb90de58c6531c82894e48bfb8a60450acb5a0c8ba690a9b4ff98d0d8f9eafc");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
