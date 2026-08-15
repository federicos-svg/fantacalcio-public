import { describe, expect, it } from "vitest";
import {
  DATA_PLATFORM_CONTRACT_VERSION,
  dataPlatformContractHash,
  hashSourcesForContract,
  validateDataPlatformContract,
} from "../src/contract.js";
import { DATA_SOURCE_REGISTRY } from "../src/sourceRegistry.js";

describe("data platform contract", () => {
  it("is internally valid", () => {
    expect(validateDataPlatformContract()).toEqual([]);
  });

  it("has a deterministic versioned SHA-256 fingerprint", () => {
    const first = dataPlatformContractHash();
    const second = dataPlatformContractHash();
    expect(DATA_PLATFORM_CONTRACT_VERSION).toBe("DATA-PLATFORM-CONTRACT@1.0.0");
    expect(first).toBe(second);
    // Questo valore e' IDENTICO nel repository privato, e deve restarlo: da
    // quando i riferimenti di evidenza sono usciti dall'impronta (contract.ts,
    // hashableSources) il contratto non dipende piu' dalla bibliografia, che e'
    // l'unico campo con una divergenza public/private legittima. Se questo
    // numero diverge fra i due repository, e' cambiato il contratto — non la
    // redazione — e va trattato come tale.
    expect(first).toBe("9270da00c2602e0db9478210e04dcfd79c6a449e2d4a03c24e1249c01c9b6bfd");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps the fingerprint independent of the evidence overlay", () => {
    // La prova diretta della proprieta' su cui poggia il confine: cambiare i
    // riferimenti di evidenza NON deve muovere l'impronta. Senza questo test la
    // separazione introdotta in hashableSources() potrebbe essere annullata da
    // una modifica distratta a contract.ts senza che nulla lo segnali.
    const baseline = dataPlatformContractHash();
    const entry = DATA_SOURCE_REGISTRY.find((source) => source.id === "fantacalcio_votes");
    expect(entry).toBeDefined();
    expect(entry!.evidenceRefs.length).toBeGreaterThan(0);

    const mutated = DATA_SOURCE_REGISTRY.map((source) =>
      source.id === "fantacalcio_votes"
        ? { ...source, evidenceRefs: ["private-registry:evidence:99"] }
        : source,
    );
    expect(hashSourcesForContract(mutated)).toBe(hashSourcesForContract(DATA_SOURCE_REGISTRY));
    expect(baseline).toBe(dataPlatformContractHash());
  });
});
