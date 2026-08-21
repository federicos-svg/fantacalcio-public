// Le parole del posto della risposta lenta — unit test dei costruttori puri.
import { describe, expect, it } from "vitest";
import type { LateAnswerState } from "../lateAnswer.js";
import {
  LATE_ANSWER_NOTE,
  lateAnswerBodyHtml,
  lateAnswerStateAttr,
  lateAnswerStatusText,
} from "./lateAnswer.js";

const SUBJECT = "Sintetico 004";

describe("lateAnswerStatusText", () => {
  it("dichiara i tre stati, e nessuno dei tre promette contenuto che non c'è", () => {
    expect(lateAnswerStatusText({ kind: "non-richiesta" }, SUBJECT)).toBe("Non richiesta.");
    expect(lateAnswerStatusText({ kind: "in-preparazione", subjectKey: "k" }, SUBJECT)).toBe(
      `In preparazione per ${SUBJECT}…`,
    );
    expect(
      lateAnswerStatusText({ kind: "arrivata", subjectKey: "k", value: "testo" }, SUBJECT),
    ).toBe(`Arrivata per ${SUBJECT}.`);
  });

  it("«non disponibile» porta il motivo: senza, sarebbe indistinguibile da «non richiesta»", () => {
    const state: LateAnswerState<string> = {
      kind: "non-disponibile",
      subjectKey: "k",
      reason: "scaduta",
    };
    expect(lateAnswerStatusText(state, SUBJECT)).toBe(`Non disponibile per ${SUBJECT}: scaduta.`);
  });

  it("ogni stato nomina il soggetto: una riga senza soggetto si leggerebbe su chiunque", () => {
    for (const state of [
      { kind: "in-preparazione", subjectKey: "k" },
      { kind: "arrivata", subjectKey: "k", value: "testo" },
      { kind: "non-disponibile", subjectKey: "k", reason: "scaduta" },
    ] as const) {
      expect(lateAnswerStatusText(state, SUBJECT)).toContain(SUBJECT);
    }
  });
});

describe("lateAnswerBodyHtml", () => {
  it("il corpo esiste SOLO a risposta arrivata: mai un segnaposto a forma di contenuto", () => {
    expect(lateAnswerBodyHtml({ kind: "non-richiesta" })).toBe("");
    expect(lateAnswerBodyHtml({ kind: "in-preparazione", subjectKey: "k" })).toBe("");
    expect(lateAnswerBodyHtml({ kind: "non-disponibile", subjectKey: "k", reason: "x" })).toBe("");
    expect(lateAnswerBodyHtml({ kind: "arrivata", subjectKey: "k", value: "testo" })).toContain(
      "testo",
    );
  });

  it("il testo arrivato viene sempre escapato: è contenuto, non markup", () => {
    const html = lateAnswerBodyHtml({
      kind: "arrivata",
      subjectKey: "k",
      value: "<script>x</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("lateAnswerStateAttr", () => {
  it("è letteralmente il kind: un secondo vocabolario divergerebbe dal primo", () => {
    expect(lateAnswerStateAttr({ kind: "non-richiesta" })).toBe("non-richiesta");
    expect(lateAnswerStateAttr({ kind: "arrivata", subjectKey: "k", value: "v" })).toBe("arrivata");
  });
});

describe("LATE_ANSWER_NOTE", () => {
  it("dichiara che nessuna fonte è collegata, invece di lasciarlo intuire", () => {
    expect(LATE_ANSWER_NOTE).toContain("Nessuna fonte è collegata");
  });
});
