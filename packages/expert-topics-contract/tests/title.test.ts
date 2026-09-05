import { describe, it, expect } from "vitest";
import { classifyTopicTitle, readMatchKey, normaliseTeamName } from "../src/title.js";

// IL TITOLO — che cosa se ne legge, e soprattutto che cosa NON se ne legge.

describe("chiave d'incrocio letta dal titolo", () => {
  it("legge coppia e orario con i due punti", () => {
    const key = readMatchKey("Alfa Calcio - Beta Sporting 20:45");
    expect(key.pairPresent).toBe(true);
    expect(key.firstTeamNormalised).toBe("alfa calcio");
    expect(key.secondTeamNormalised).toBe("beta sporting");
    expect(key.kickoffLocal).toBe("20:45");
    expect(key.timeSeparator).toBe(":");
  });

  // Misurato: su dieci orari, nove coi due punti e UNO col punto. Un parser che
  // prendesse solo i due punti perderebbe la decima partita in silenzio.
  it("legge l'orario scritto col punto, e dice quale separatore ha visto", () => {
    const key = readMatchKey("Alfa Calcio - Beta Sporting 15.00");
    expect(key.kickoffLocal).toBe("15:00");
    expect(key.timeSeparator).toBe(".");
    // L'orario si toglie prima di cercare la coppia: `15.00` ha la stessa forma
    // di due parole separate dal punto e sporcherebbe i nomi.
    expect(key.secondTeamNormalised).toBe("beta sporting");
  });

  it("accetta le altre forme di separazione fra le due squadre", () => {
    expect(readMatchKey("Alfa vs Beta 18:00").pairPresent).toBe(true);
    expect(readMatchKey("Alfa/Beta 18.30").kickoffLocal).toBe("18:30");
    expect(readMatchKey("Alfa contro Beta 12:30").pairPresent).toBe(true);
  });

  it("toglie le parole di contorno solo in testa e in coda", () => {
    expect(readMatchKey("Alfa Calcio - Beta Sporting ore 20:45").secondTeamNormalised).toBe(
      "beta sporting",
    );
    expect(normaliseTeamName("Ore Calcio Ore")).toBe("calcio");
  });

  it("applica la tabella di alias iniettata", () => {
    const key = readMatchKey("Alfa Calcio - Beta Sporting 20:45", { "alfa calcio": "ALFA" });
    expect(key.firstTeamNormalised).toBe("ALFA");
  });

  it("rifiuta un orario impossibile invece di accettarlo", () => {
    const key = readMatchKey("Alfa - Beta 99:99");
    expect(key.kickoffPresent).toBe(false);
    expect(key.kickoffLocal).toBe("");
  });

  // `99:99` da solo non prova il tetto delle ORE: ha anche i minuti fuori
  // scala, quindi cade comunque sul controllo dei minuti e lascia passare un
  // tetto sulle ore sbagliato — 24, 30, 99 — senza che nessun test cambi
  // colore. Questi casi hanno i minuti validi apposta: qui può fallire solo il
  // controllo delle ore.
  it("il giorno finisce alle 23: le ore oltre il tetto si rifiutano una per una", () => {
    for (const ora of ["24", "25", "30", "48", "99"]) {
      const key = readMatchKey(`Alfa - Beta ${ora}:30`);
      expect(key.kickoffPresent, ora).toBe(false);
      expect(key.kickoffLocal, ora).toBe("");
    }
  });

  it("le ore ai due estremi ammessi si leggono", () => {
    expect(readMatchKey("Alfa - Beta 0:30").kickoffLocal).toBe("00:30");
    expect(readMatchKey("Alfa - Beta 23:30").kickoffLocal).toBe("23:30");
  });

  it("i minuti oltre 59 si rifiutano, con l'ora valida", () => {
    const key = readMatchKey("Alfa - Beta 20:75");
    expect(key.kickoffPresent).toBe(false);
    expect(key.kickoffLocal).toBe("");
  });

  // IL VINCOLO: il titolo non porta la giornata. Il campo esiste per CONTARE,
  // e nessuna funzione di legame lo guarda.
  it("conta il numero di giornata nel titolo senza mai usarlo", () => {
    expect(readMatchKey("Alfa - Beta 20:45").matchdayNumberInTitle).toBe(false);
    expect(readMatchKey("Alfa - Beta 3ª giornata 20:45").matchdayNumberInTitle).toBe(true);
  });

  it("dichiara che l'ordine casa/trasferta non è verificato", () => {
    expect(readMatchKey("Alfa - Beta 20:45").homeAwayUnverified).toBe(true);
  });
});

describe("criterio «sembra un topic di partita»", () => {
  it("accetta la forma osservata", () => {
    const verdict = classifyTopicTitle("Alfa Calcio - Beta Sporting 20:45");
    expect(verdict.isMatchTopic).toBe(true);
    expect(verdict.rejection).toBeNull();
  });

  // IL CASO CHE CONTA DI PIÙ: un titolo che SOMIGLIA a un topic di partita e
  // non lo è — due parole separate da un trattino e un orario dentro. Nel
  // campione era il gruppo delle forme tutte diverse, cioè il rumore.
  it("rifiuta un titolo di servizio che ha coppia e orario ma non due squadre", () => {
    const verdict = classifyTopicTitle("Probabili formazioni - Serie A ore 15:00");
    expect(verdict.isMatchTopic).toBe(false);
    expect(verdict.rejection).toBe("PAROLE_DI_SEZIONE_NON_SQUADRE");
  });

  it("rifiuta altro rumore di sezione con la stessa forma", () => {
    for (const noisy of [
      "Regolamento - Sezione ore 09:00",
      "Consigli - Richieste 18:00",
      "Pagelle - Voti 22:30",
    ]) {
      expect(classifyTopicTitle(noisy).rejection).toBe("PAROLE_DI_SEZIONE_NON_SQUADRE");
    }
  });

  it("rifiuta un titolo di un altro perimetro, col suo marcatore iniettato", () => {
    const verdict = classifyTopicTitle("EPSILON [TOPIC UNICO] - Alfa 20:45", {
      otherPerimeterMarker: "[TOPIC UNICO]",
    });
    expect(verdict.rejection).toBe("MARCATORE_DI_ALTRO_PERIMETRO");
  });

  it("distingue i due modi di non essere un topic di partita", () => {
    expect(classifyTopicTitle("Alfa Calcio - Beta Sporting").rejection).toBe(
      "NESSUN_ORARIO_RICONOSCIUTO",
    );
    expect(classifyTopicTitle("Un titolo qualunque 20:45").rejection).toBe(
      "NESSUNA_COPPIA_RICONOSCIUTA",
    );
  });
});
