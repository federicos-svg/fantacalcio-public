import { describe, it, expect } from "vitest";
// Single source of truth (pura, I/O iniettato). Importata qui (tsconfig allowJs)
// E da .github/workflows/push-audit.yml, che la carica dal checkout e si limita
// a fare l'I/O: la logica che gira in produzione e' esattamente questa.
import {
  MAX_ATTEMPTS,
  ATTEMPT_MERGED,
  ATTEMPT_NO_MERGE,
  ATTEMPT_ERROR,
  CAUSE_NO_PR,
  CAUSE_API_ERROR,
  shortSha,
  evaluateAttempt,
  shouldRetry,
  decideFromAttempts,
  resolvePushOrigin,
  alarmTitle,
  alarmBody,
  findDuplicate,
} from "../../../scripts/push-audit-core.mjs";

// DOC-01 Fase 2 (issue #258), gap chiusi dopo la review a lente:
//  1. un'eccezione dell'API non deve azzerare il retry ne' — soprattutto —
//     produrre ZERO allarme lasciando come unico segnale una run rossa che
//     nessuno guarda (e' letteralmente la lezione della #253);
//  2. la decisione vive in un core puro come gli altri tre deliverable, quindi
//     e' verificabile senza GitHub.

type PR = { number: number; merged_at: string | null; base: { ref: string } };

const mergedPR = (number: number, base = "main"): PR => ({
  number,
  merged_at: "2026-08-14T05:00:00Z",
  base: { ref: base },
});
const openPR = (number: number, base = "main"): PR => ({ number, merged_at: null, base: { ref: base } });

/** Finto I/O: una risposta per tentativo. Un elemento `Error` viene lanciato. */
function fakeIo(responses: Array<PR[] | Error>) {
  const calls = { list: 0, sleeps: [] as number[] };
  return {
    calls,
    listAssociatedPullRequests: async () => {
      const r = responses[calls.list++];
      if (r instanceof Error) throw r;
      return r ?? [];
    },
    sleep: async (ms: number) => {
      calls.sleeps.push(ms); // non dorme davvero: il test resta istantaneo
    },
  };
}

const runAudit = (responses: Array<PR[] | Error>, branch = "main") => {
  const io = fakeIo(responses);
  return resolvePushOrigin({ branch, ...io }).then((decision) => ({ decision, calls: io.calls }));
};

describe("evaluateAttempt", () => {
  it("riconosce il merge di una PR sul branch pushato", () => {
    const out = evaluateAttempt({ branch: "main", prs: [mergedPR(262)] });
    expect(out.kind).toBe(ATTEMPT_MERGED);
    expect(out.pr.number).toBe(262);
  });
  it("non accetta una PR aperta, nemmeno se associata al commit", () => {
    expect(evaluateAttempt({ branch: "main", prs: [openPR(999)] }).kind).toBe(ATTEMPT_NO_MERGE);
  });
  it("non accetta una PR mergiata verso un ALTRO branch", () => {
    // Associata al commit solo perche' lo contiene: non e' un merge su main.
    expect(evaluateAttempt({ branch: "main", prs: [mergedPR(1, "production")] }).kind).toBe(
      ATTEMPT_NO_MERGE,
    );
  });
  it("tratta l'assenza di PR come nessun merge", () => {
    expect(evaluateAttempt({ branch: "main", prs: [] }).kind).toBe(ATTEMPT_NO_MERGE);
  });
  it("normalizza un'eccezione, con status e messaggio compattati", () => {
    const err = Object.assign(new Error("API rate limit exceeded"), { status: 403 });
    const out = evaluateAttempt({ branch: "main", error: err });
    expect(out.kind).toBe(ATTEMPT_ERROR);
    expect(out.message).toBe("HTTP 403: API rate limit exceeded");
  });
  it("tronca un messaggio d'errore abnorme invece di riversarlo in una issue", () => {
    const out = evaluateAttempt({ branch: "main", error: new Error("x".repeat(1000)) });
    const message = String(out.message);
    expect(message.length).toBeLessThanOrEqual(300);
    expect(message.endsWith("...")).toBe(true);
  });
});

describe("shouldRetry — un'eccezione consuma un tentativo, non li azzera", () => {
  it("si ferma appena trova il merge", () => {
    expect(shouldRetry(1, { kind: ATTEMPT_MERGED })).toBe(false);
  });
  it("riprova su no-merge e su errore, fino al tetto", () => {
    expect(shouldRetry(1, { kind: ATTEMPT_NO_MERGE })).toBe(true);
    expect(shouldRetry(1, { kind: ATTEMPT_ERROR, message: "boom" })).toBe(true);
    expect(shouldRetry(MAX_ATTEMPTS, { kind: ATTEMPT_ERROR, message: "boom" })).toBe(false);
    expect(shouldRetry(MAX_ATTEMPTS, { kind: ATTEMPT_NO_MERGE })).toBe(false);
  });
});

describe("resolvePushOrigin — i casi che la lente ha chiesto di coprire", () => {
  it("merge commit di una PR -> nessun allarme, un solo tentativo", async () => {
    const { decision, calls } = await runAudit([[mergedPR(262)]]);
    expect(decision.action).toBe("ok");
    expect(decision.pr.number).toBe(262);
    expect(calls.list).toBe(1);
    expect(calls.sleeps).toEqual([]);
  });

  it("push diretto -> allarme, ma solo dopo aver esaurito i retry", async () => {
    const { decision, calls } = await runAudit([[], [], []]);
    expect(decision).toMatchObject({ action: "alarm", cause: CAUSE_NO_PR, attempts: MAX_ATTEMPTS });
    expect(calls.list).toBe(MAX_ATTEMPTS);
    expect(calls.sleeps).toHaveLength(MAX_ATTEMPTS - 1);
  });

  it("trovato al secondo tentativo -> stop anticipato, terzo giro mai eseguito", async () => {
    // E' il caso reale: l'associazione commit->PR e' indicizzata in modo
    // asincrono e il workflow parte nell'istante del merge.
    const { decision, calls } = await runAudit([[], [mergedPR(262)], []]);
    expect(decision.action).toBe("ok");
    expect(calls.list).toBe(2);
    expect(calls.sleeps).toHaveLength(1);
  });

  it("PR associata ma con base.ref diverso -> allarme", async () => {
    const { decision } = await runAudit([
      [mergedPR(1, "production")],
      [mergedPR(1, "production")],
      [mergedPR(1, "production")],
    ]);
    expect(decision).toMatchObject({ action: "alarm", cause: CAUSE_NO_PR });
  });

  it("eccezione API a OGNI tentativo -> allarme «verifica non completata», mai silenzio", async () => {
    // Il difetto chiuso qui: senza try/catch dentro il ciclo, la prima eccezione
    // abortiva lo script a zero retry e con zero issue aperte.
    const { decision, calls } = await runAudit([
      new Error("502 Bad Gateway"),
      new Error("502 Bad Gateway"),
      new Error("502 Bad Gateway"),
    ]);
    expect(decision).toMatchObject({ action: "alarm", cause: CAUSE_API_ERROR });
    expect(calls.list).toBe(MAX_ATTEMPTS);
    expect(decision.errors).toHaveLength(MAX_ATTEMPTS);
  });

  it("retry bounded a 3: non chiama mai l'API una quarta volta", async () => {
    const { calls } = await runAudit([new Error("a"), [], new Error("b"), [mergedPR(9)]]);
    expect(calls.list).toBe(MAX_ATTEMPTS);
    expect(MAX_ATTEMPTS).toBe(3);
  });

  it("un errore isolato non azzera il retry: il merge trovato dopo vince", async () => {
    const { decision, calls } = await runAudit([new Error("503"), [mergedPR(262)]]);
    expect(decision.action).toBe("ok");
    expect(calls.list).toBe(2);
  });

  it("esito misto (un errore + uno sguardo pulito) -> causa no-pr, errori comunque riportati", async () => {
    // Almeno un tentativo ha risposto davvero "nessuna PR mergiata": la causa e'
    // quella, ma l'errore resta visibile a chi legge invece di sparire.
    const { decision } = await runAudit([new Error("500"), [], []]);
    expect(decision).toMatchObject({ action: "alarm", cause: CAUSE_NO_PR });
    expect(decision.errors).toEqual(["500"]);
  });

  it("attende esattamente il ritardo dichiarato fra un tentativo e l'altro", async () => {
    const { calls } = await runAudit([[], [], []]);
    expect(new Set(calls.sleeps).size).toBe(1);
    expect(calls.sleeps[0]).toBe(15000);
  });
});

describe("decideFromAttempts", () => {
  it("basta un tentativo merged, anche se preceduto da errori", () => {
    expect(
      decideFromAttempts([
        { kind: ATTEMPT_ERROR, message: "x" },
        { kind: ATTEMPT_MERGED, pr: { number: 7 } },
      ]).action,
    ).toBe("ok");
  });
  it("api-error solo se NESSUN tentativo e' andato a buon fine", () => {
    expect(decideFromAttempts([{ kind: ATTEMPT_ERROR, message: "x" }]).cause).toBe(CAUSE_API_ERROR);
    expect(
      decideFromAttempts([{ kind: ATTEMPT_ERROR, message: "x" }, { kind: ATTEMPT_NO_MERGE }]).cause,
    ).toBe(CAUSE_NO_PR);
  });
});

describe("dedupe e titolo — una sola issue aperta per SHA", () => {
  const short = shortSha("78d6bdcd95475e7b26acdd516f646f66626f924e");

  it("shortSha e' i primi 12 caratteri", () => {
    expect(short).toBe("78d6bdcd9547");
  });

  it("stesso SHA con issue aperta -> dedupe, nessuna seconda issue", () => {
    const open = [
      { number: 12, title: "altra cosa" },
      { number: 13, title: alarmTitle({ branch: "main", short, cause: CAUSE_NO_PR }) },
    ];
    expect(findDuplicate(open, short)?.number).toBe(13);
  });

  it("non fa dedupe su uno SHA diverso", () => {
    const open = [{ number: 13, title: alarmTitle({ branch: "main", short, cause: CAUSE_NO_PR }) }];
    expect(findDuplicate(open, "000000000000")).toBeNull();
  });

  it("regge una lista vuota o voci malformate", () => {
    expect(findDuplicate([], short)).toBeNull();
    expect(findDuplicate(null, short)).toBeNull();
    expect(findDuplicate([{ number: 1 }, null], short)).toBeNull();
  });

  it("il titolo cambia con la causa ma contiene SEMPRE lo SHA corto (invariante del dedupe)", () => {
    const a = alarmTitle({ branch: "main", short, cause: CAUSE_NO_PR });
    const b = alarmTitle({ branch: "production", short, cause: CAUSE_API_ERROR });
    expect(a).not.toBe(b);
    expect(a).toContain(short);
    expect(b).toContain(short);
    expect(a).toContain("Push diretto senza PR");
    expect(b).toContain("Verifica non completata");
    // Un allarme api-error e uno no-pr sullo stesso SHA restano deduplicati.
    expect(findDuplicate([{ number: 1, title: b }], short)?.number).toBe(1);
  });
});

describe("alarmBody — distingue il motivo invece di dire sempre la stessa cosa", () => {
  const common = {
    owner: "federicos-svg",
    repo: "fantacalcio",
    branch: "main",
    ref: "refs/heads/main",
    sha: "78d6bdcd95475e7b26acdd516f646f66626f924e",
    short: "78d6bdcd9547",
    actor: "federicos-svg",
    runId: 31772310316,
  };

  it("push diretto: afferma la violazione e chiede la verifica del contenuto", () => {
    const body = alarmBody({
      ...common,
      decision: { action: "alarm", cause: CAUSE_NO_PR, attempts: 3, errors: [] },
    });
    expect(body).toContain("non risulta il merge di alcuna PR");
    expect(body).toContain("docs/NO_GO.md");
    expect(body).toContain(common.sha);
    expect(body).toContain("3/3");
  });

  it("errore API: dichiara che il controllo NON si e' pronunciato, e non accusa nessuno", () => {
    const body = alarmBody({
      ...common,
      decision: { action: "alarm", cause: CAUSE_API_ERROR, attempts: 3, errors: ["HTTP 502: x"] },
    });
    expect(body).toContain("Verifica non completata");
    expect(body).toContain("non ha potuto");
    expect(body).not.toContain("non risulta il merge di alcuna PR");
    expect(body).toContain("HTTP 502: x");
  });
});
