// L'impalcatura della risposta lenta — unit test.
//
// Il produttore è FINTO in ogni caso: nessuna rete, nessun modello, nessuna
// dipendenza nuova. Le promesse sono risolte a mano, così ogni test controlla
// l'istante esatto in cui la risposta arriva — che è l'unico modo di
// verificare davvero un annullamento: una risposta che non arriva mai non
// dimostra niente.
import { describe, expect, it } from "vitest";
import { createLateAnswerSlot, type LateAnswerTicket } from "./lateAnswer.js";

/** Un produttore finto che si risolve quando lo decide il test. */
function deferred(): {
  producer: (ticket: LateAnswerTicket) => Promise<string>;
  resolve: (value: string) => void;
  reject: (err: unknown) => void;
  tickets: LateAnswerTicket[];
} {
  let resolve!: (value: string) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const tickets: LateAnswerTicket[] = [];
  return {
    producer: (ticket) => {
      tickets.push(ticket);
      return promise;
    },
    resolve,
    reject,
    tickets,
  };
}

/** Lascia girare le microtask: le risoluzioni delle promesse arrivano lì. */
const settle = (): Promise<void> => Promise.resolve().then(() => undefined);

describe("createLateAnswerSlot — i tre stati", () => {
  it("parte da «non richiesta», e non è uno stato di attesa", () => {
    const slot = createLateAnswerSlot<string>();
    expect(slot.state()).toEqual({ kind: "non-richiesta" });
    expect(slot.subject()).toBeNull();
  });

  it("passa a «in preparazione» SUBITO, non dopo un giro di attesa", () => {
    const slot = createLateAnswerSlot<string>();
    const fake = deferred();
    slot.request("giocatore-1", fake.producer);
    // Nessun await in mezzo: lo stato è già cambiato quando request() ritorna.
    expect(slot.state()).toEqual({ kind: "in-preparazione", subjectKey: "giocatore-1" });
  });

  it("arriva con il valore, e dichiara di CHI è", async () => {
    const slot = createLateAnswerSlot<string>();
    const fake = deferred();
    slot.request("giocatore-1", fake.producer);
    fake.resolve("testo sintetico");
    await settle();
    expect(slot.state()).toEqual({
      kind: "arrivata",
      subjectKey: "giocatore-1",
      value: "testo sintetico",
    });
  });

  it("un produttore che rifiuta produce «non disponibile» col motivo, mai un'attesa infinita", async () => {
    const slot = createLateAnswerSlot<string>();
    const fake = deferred();
    slot.request("giocatore-1", fake.producer);
    fake.reject(new Error("scaduto"));
    await settle();
    expect(slot.state()).toEqual({
      kind: "non-disponibile",
      subjectKey: "giocatore-1",
      reason: "scaduto",
    });
  });

  it("un produttore che lancia in modo sincrono vale quanto uno che rifiuta", () => {
    const slot = createLateAnswerSlot<string>();
    slot.request("giocatore-1", () => {
      throw new Error("bug del produttore");
    });
    expect(slot.state()).toEqual({
      kind: "non-disponibile",
      subjectKey: "giocatore-1",
      reason: "bug del produttore",
    });
  });
});

describe("createLateAnswerSlot — l'annullamento è la parte che conta", () => {
  it("una risposta che arriva DOPO il cambio di giocatore non compare mai", async () => {
    const slot = createLateAnswerSlot<string>();
    const primo = deferred();
    const secondo = deferred();

    slot.request("giocatore-1", primo.producer);
    slot.request("giocatore-2", secondo.producer);

    // Il primo produttore risponde adesso, e la sua risposta è GIUSTA — per il
    // giocatore sbagliato. È il difetto più insidioso, e qui non passa.
    primo.resolve("risposta sul primo giocatore");
    await settle();

    expect(slot.state()).toEqual({ kind: "in-preparazione", subjectKey: "giocatore-2" });
    expect(slot.droppedCount()).toBe(1);

    // E la risposta del giocatore corrente, quando arriva, compare.
    secondo.resolve("risposta sul secondo giocatore");
    await settle();
    expect(slot.state()).toEqual({
      kind: "arrivata",
      subjectKey: "giocatore-2",
      value: "risposta sul secondo giocatore",
    });
  });

  it("un RIFIUTO superato non sporca lo stato del giocatore nuovo", async () => {
    const slot = createLateAnswerSlot<string>();
    const primo = deferred();
    const secondo = deferred();
    slot.request("giocatore-1", primo.producer);
    slot.request("giocatore-2", secondo.producer);

    primo.reject(new Error("scaduto sul primo"));
    await settle();

    expect(slot.state()).toEqual({ kind: "in-preparazione", subjectKey: "giocatore-2" });
    expect(slot.droppedCount()).toBe(1);
  });

  it("clear() annulla ciò che è in volo e torna a «non richiesta»", async () => {
    const slot = createLateAnswerSlot<string>();
    const fake = deferred();
    slot.request("giocatore-1", fake.producer);
    slot.clear();
    expect(slot.state()).toEqual({ kind: "non-richiesta" });

    fake.resolve("in ritardo");
    await settle();
    expect(slot.state()).toEqual({ kind: "non-richiesta" });
    expect(slot.droppedCount()).toBe(1);
  });

  it("il gettone dice al produttore che non serve più: il cambio soggetto lo annulla", () => {
    const slot = createLateAnswerSlot<string>();
    const primo = deferred();
    const secondo = deferred();
    slot.request("giocatore-1", primo.producer);
    expect(primo.tickets[0]?.isCancelled()).toBe(false);

    slot.request("giocatore-2", secondo.producer);
    expect(primo.tickets[0]?.isCancelled()).toBe(true);
    expect(secondo.tickets[0]?.isCancelled()).toBe(false);
    expect(secondo.tickets[0]?.subjectKey).toBe("giocatore-2");
  });

  it("una ri-richiesta sullo STESSO soggetto annulla comunque la precedente", async () => {
    const slot = createLateAnswerSlot<string>();
    const primo = deferred();
    const secondo = deferred();
    slot.request("giocatore-1", primo.producer);
    slot.request("giocatore-1", secondo.producer);

    primo.resolve("prima risposta");
    await settle();
    expect(slot.state()).toEqual({ kind: "in-preparazione", subjectKey: "giocatore-1" });

    secondo.resolve("seconda risposta");
    await settle();
    expect(slot.state()).toEqual({
      kind: "arrivata",
      subjectKey: "giocatore-1",
      value: "seconda risposta",
    });
  });
});

describe("createLateAnswerSlot — onChange", () => {
  it("scatta sui cambi di stato visibili e MAI per una risposta scartata", async () => {
    const changes: string[] = [];
    const slot = createLateAnswerSlot<string>({ onChange: () => changes.push(slot.state().kind) });
    const primo = deferred();
    const secondo = deferred();

    slot.request("giocatore-1", primo.producer); // in-preparazione
    slot.request("giocatore-2", secondo.producer); // in-preparazione
    primo.resolve("obsoleta");
    await settle(); // nessun cambio: scartata

    expect(changes).toEqual(["in-preparazione", "in-preparazione"]);

    secondo.resolve("buona");
    await settle();
    expect(changes).toEqual(["in-preparazione", "in-preparazione", "arrivata"]);
  });

  it("clear() su un posto già vuoto non ridipinge niente", () => {
    let calls = 0;
    const slot = createLateAnswerSlot<string>({ onChange: () => (calls += 1) });
    slot.clear();
    slot.clear();
    expect(calls).toBe(0);
  });
});
