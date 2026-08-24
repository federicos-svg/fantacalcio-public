import { describe, it, expect } from "vitest";
import { attemptCopy, copyMessage, copySucceeded, type ClipboardPorts } from "./personIdClipboard.js";

// Il pulsante «Copia» accanto a un partecipante, misurato dove si può
// misurare: senza DOM e senza appunti veri, iniettando le due capacità del
// browser. Il resto — che i pulsanti esistano e che copino l'identificativo
// giusto — lo prova e2e/person-id-copy.spec.ts contro Chromium.
//
// Il nome usato qui è sintetico, come ovunque in questo repository.

const NAME = "Persona Sintetica";

function ports(over: Partial<ClipboardPorts> = {}): ClipboardPorts {
  return { writeText: null, selectAndCopy: null, ...over };
}

describe("copia dell'identificativo — quale strada regge", () => {
  it("usa gli appunti quando ci sono, e non tocca la selezione a schermo", async () => {
    const written: string[] = [];
    let fallbackCalled = false;
    const outcome = await attemptCopy(
      "person:00000000-0000-4000-8000-000000000001",
      ports({
        writeText: async (t) => {
          written.push(t);
        },
        selectAndCopy: () => {
          fallbackCalled = true;
          return true;
        },
      }),
    );
    expect(outcome).toBe("clipboard");
    expect(written).toEqual(["person:00000000-0000-4000-8000-000000000001"]);
    // Il ripiego sovrascrive la selezione dell'utente: si disturba lo schermo
    // solo quando la strada pulita non c'è.
    expect(fallbackCalled).toBe(false);
  });

  it("passa al ripiego quando gli appunti rifiutano, e la copia riuscita resta una copia", async () => {
    const outcome = await attemptCopy(
      "person:1",
      ports({
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
        selectAndCopy: () => true,
      }),
    );
    expect(outcome).toBe("clipboard");
  });

  it("il ripiego che seleziona ma non copia è un esito A SÉ, non un successo", async () => {
    // È la distinzione che tiene in piedi tutto: il testo è a schermo,
    // selezionato, e serve un Ctrl+C. Dire «Copiato» qui produrrebbe un file
    // scritto con una stringa vuota incollata dentro.
    const outcome = await attemptCopy("person:1", ports({ selectAndCopy: () => false }));
    expect(outcome).toBe("selection");
    expect(copySucceeded(outcome)).toBe(false);
  });

  it("un ripiego che lancia è trattato come una selezione riuscita a metà, non come una copia", async () => {
    const outcome = await attemptCopy(
      "person:1",
      ports({
        selectAndCopy: () => {
          throw new Error("execCommand non disponibile");
        },
      }),
    );
    expect(outcome).toBe("selection");
  });

  it("senza nessuna delle due strade lo dice, invece di fingere", async () => {
    expect(await attemptCopy("person:1", ports())).toBe("failed");
  });

  it("solo l'esito «clipboard» conta come copiato", () => {
    expect(copySucceeded("clipboard")).toBe(true);
    expect(copySucceeded("selection")).toBe(false);
    expect(copySucceeded("failed")).toBe(false);
  });
});

describe("copia dell'identificativo — che cosa legge chi ha appena premuto", () => {
  it("nomina sempre la persona: due pulsanti uguali, due conferme distinguibili", () => {
    for (const outcome of ["clipboard", "selection", "failed"] as const) {
      expect(copyMessage(NAME, outcome)).toContain(NAME);
    }
  });

  it("dice «copiato» solo quando lo è davvero", () => {
    expect(copyMessage(NAME, "clipboard")).toContain("copiato negli appunti");
    expect(copyMessage(NAME, "selection")).not.toContain("copiato negli appunti");
    expect(copyMessage(NAME, "failed")).not.toContain("copiato negli appunti");
  });

  it("quando non ha copiato dice che cosa resta da fare, non solo che è andata male", () => {
    expect(copyMessage(NAME, "selection")).toContain("Ctrl+C");
    expect(copyMessage(NAME, "failed")).toContain("seleziona a mano");
  });

  it("non stampa mai l'identificativo: è il testo, non il messaggio", () => {
    // La conferma vive sotto un elenco di persone reali. Ripetere lì il valore
    // non aggiunge niente — è già a schermo accanto al nome — e moltiplica i
    // posti da cui può finire in uno screenshot.
    for (const outcome of ["clipboard", "selection", "failed"] as const) {
      expect(copyMessage(NAME, outcome)).not.toContain("person:");
    }
  });
});
