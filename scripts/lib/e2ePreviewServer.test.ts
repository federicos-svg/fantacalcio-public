import { describe, it, expect } from "vitest";
import {
  DEFAULT_E2E_PORT,
  E2E_PORT_ENV_VAR,
  type PreviewServerCheck,
  assetReferences,
  buildFingerprint,
  previewServerVerdict,
  resolveE2ePort,
} from "./e2ePreviewServer.js";

// Il difetto che questi test chiudono è successo davvero: con la porta
// inchiodata e `reuseExistingServer: true`, una suite ha girato contro il
// build di un ALTRO worktree e ha riportato verde. Ogni caso qui sotto è una
// delle strade con cui quel verde falso poteva ripresentarsi.

const INDEX_A = `<!doctype html>
<html lang="it"><head>
<script type="module" crossorigin src="/assets/index-CkrNLYE-.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-DJHBRbY3.css">
</head><body><div id="app"></div></body></html>`;

/** Stesso file, altro build: Vite cambia gli hash di contenuto. */
const INDEX_B = INDEX_A.replace("index-CkrNLYE-.js", "index-0kRG_6Gy.js").replace(
  "index-DJHBRbY3.css",
  "index-C2gOlYYJ.css",
);

function check(overrides: Partial<PreviewServerCheck> = {}): PreviewServerCheck {
  return {
    url: `http://127.0.0.1:${DEFAULT_E2E_PORT}`,
    port: DEFAULT_E2E_PORT,
    portFromEnv: false,
    servedHtml: INDEX_A,
    localHtml: INDEX_A,
    ...overrides,
  };
}

describe("resolveE2ePort", () => {
  it("resta 4173 quando nessuno chiede altro — i comandi documentati non cambiano", () => {
    expect(resolveE2ePort({})).toBe(4173);
    expect(resolveE2ePort({ [E2E_PORT_ENV_VAR]: undefined })).toBe(DEFAULT_E2E_PORT);
    expect(resolveE2ePort({ [E2E_PORT_ENV_VAR]: "   " })).toBe(DEFAULT_E2E_PORT);
  });

  it("sposta la porta quando la variabile la sposta", () => {
    expect(resolveE2ePort({ [E2E_PORT_ENV_VAR]: "4287" })).toBe(4287);
    expect(resolveE2ePort({ [E2E_PORT_ENV_VAR]: " 5050 " })).toBe(5050);
  });

  it("non ricade MAI sul default quando il valore è invalido", () => {
    // Ricadere sulla 4173 rimetterebbe l'operatore sulla porta condivisa
    // proprio mentre crede di essersene andato: è il fallimento silenzioso
    // che questo file esiste per impedire.
    for (const bad of ["4287a", "-1", "abc", "80.5", "1e4"]) {
      expect(() => resolveE2ePort({ [E2E_PORT_ENV_VAR]: bad })).toThrow(/E2E_PORT/);
    }
    expect(() => resolveE2ePort({ [E2E_PORT_ENV_VAR]: "80" })).toThrow(/1024\.\.65535/);
    expect(() => resolveE2ePort({ [E2E_PORT_ENV_VAR]: "70000" })).toThrow(/1024\.\.65535/);
  });
});

describe("buildFingerprint / assetReferences", () => {
  it("distingue due build diversi e riconosce lo stesso build", () => {
    expect(buildFingerprint(INDEX_A)).toBe(buildFingerprint(INDEX_A));
    expect(buildFingerprint(INDEX_A)).not.toBe(buildFingerprint(INDEX_B));
  });

  it("non scambia per alberi diversi due checkout con fine riga o bordi diversi", () => {
    expect(buildFingerprint(`\n${INDEX_A}\n  `)).toBe(buildFingerprint(INDEX_A));
    expect(buildFingerprint(INDEX_A.replace(/\n/g, "\r\n"))).toBe(buildFingerprint(INDEX_A));
  });

  it("estrae i riferimenti agli asset in ordine stabile, per il messaggio d'errore", () => {
    expect(assetReferences(INDEX_A)).toEqual([
      "/assets/index-CkrNLYE-.js",
      "/assets/index-DJHBRbY3.css",
    ]);
    expect(assetReferences("<html></html>")).toEqual([]);
  });
});

describe("previewServerVerdict", () => {
  it("porta libera: niente da verificare, la run prosegue", () => {
    expect(previewServerVerdict(check({ servedHtml: null }))).toEqual({ kind: "no-server" });
  });

  it("porta libera anche senza build locale: non è un errore", () => {
    // Primo giro su un clone fresco: Playwright compilerà lui.
    expect(previewServerVerdict(check({ servedHtml: null, localHtml: null }))).toEqual({
      kind: "no-server",
    });
  });

  it("stesso build servito: riuso legittimo, con la sua impronta", () => {
    const verdict = previewServerVerdict(check());
    expect(verdict.kind).toBe("same-tree");
    if (verdict.kind !== "same-tree") throw new Error("unreachable");
    expect(verdict.fingerprint).toBe(buildFingerprint(INDEX_A));
  });

  it("ALTRO build servito: si ferma, e dice quale differenza ha visto", () => {
    const verdict = previewServerVerdict(check({ servedHtml: INDEX_B }));
    expect(verdict.kind).toBe("foreign-tree");
    if (verdict.kind !== "foreign-tree") throw new Error("unreachable");
    // Il messaggio deve nominare entrambi gli alberi, non solo dire "diverso".
    expect(verdict.message).toContain("/assets/index-0kRG_6Gy.js");
    expect(verdict.message).toContain("/assets/index-CkrNLYE-.js");
    expect(verdict.message).toContain("La run si ferma qui.");
    // E deve dire come uscirne, non solo che si è bloccati.
    expect(verdict.message).toContain(`${E2E_PORT_ENV_VAR}=`);
    expect(verdict.message).toContain("npm run test:e2e");
  });

  it("qualcuno risponde ma non c'è build locale: fail-closed, mai un verde a caso", () => {
    const verdict = previewServerVerdict(check({ localHtml: null }));
    expect(verdict.kind).toBe("unverifiable");
    if (verdict.kind !== "unverifiable") throw new Error("unreachable");
    expect(verdict.message).toContain("npm run build");
    expect(verdict.message).toContain("di CHI sia quel server");
  });

  it("suggerisce una porta diversa da quella già in uso", () => {
    const onDefault = previewServerVerdict(check({ servedHtml: INDEX_B }));
    if (onDefault.kind !== "foreign-tree") throw new Error("unreachable");
    expect(onDefault.message).not.toContain(`${E2E_PORT_ENV_VAR}=${DEFAULT_E2E_PORT} `);

    const onEnvPort = previewServerVerdict(
      check({ servedHtml: INDEX_B, port: 4287, portFromEnv: true, url: "http://127.0.0.1:4287" }),
    );
    if (onEnvPort.kind !== "foreign-tree") throw new Error("unreachable");
    expect(onEnvPort.message).toContain(`${E2E_PORT_ENV_VAR}=4288`);
  });
});
