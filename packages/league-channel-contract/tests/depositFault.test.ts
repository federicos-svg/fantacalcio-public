import { describe, it, expect } from "vitest";
import {
  depositFaultFromBody,
  depositFaultSentence,
  isDepositFaultCode,
  DEPOSIT_FAULT_BODY_MAX_CHARS,
  DEPOSIT_FAULT_CODES,
} from "../src/depositFault.js";

// IL VOCABOLARIO DEI GUASTI, provato per quello che è: un insieme CHIUSO e un
// riconoscitore che non si fida di niente.
//
// La regola sotto esame è una sola, e ha due facce: un codice noto deve
// arrivare a destinazione con la sua frase; qualunque altra cosa deve valere
// `null` — mai un mezzo riconoscimento, mai testo esterno che prosegue.

describe("l'insieme dei codici è chiuso, e le sue frasi sono complete", () => {
  it("ogni codice ha una frase in italiano, non il codice a parole", () => {
    for (const codice of DEPOSIT_FAULT_CODES) {
      const frase = depositFaultSentence(codice);
      expect(frase.length, codice).toBeGreaterThan(40);
      // La frase è per chi non conosce il sistema: non ripete il codice, e non
      // finisce con un punto perché a valle le si aggiunge il codice tecnico.
      expect(frase, codice).not.toContain(codice);
      expect(frase.endsWith("."), codice).toBe(false);
    }
  });

  it("nessuna frase nomina host, percorsi, piattaforme o credenziali", () => {
    // Il confine public/private vale anche per la prosa degli avvisi.
    const vietate = [
      "http",
      "https",
      "://",
      "/api/",
      "drive",
      "google",
      "cloudflare",
      "n8n",
      "token",
      "oauth",
      "password",
    ];
    for (const codice of DEPOSIT_FAULT_CODES) {
      const frase = depositFaultSentence(codice).toLowerCase();
      for (const parola of vietate) {
        expect(frase.includes(parola), `${codice}: ${parola}`).toBe(false);
      }
    }
  });

  it("i codici sono unici e le frasi sono tutte diverse fra loro", () => {
    expect(new Set(DEPOSIT_FAULT_CODES).size).toBe(DEPOSIT_FAULT_CODES.length);
    const frasi = DEPOSIT_FAULT_CODES.map((codice) => depositFaultSentence(codice));
    expect(new Set(frasi).size).toBe(DEPOSIT_FAULT_CODES.length);
  });

  it("i codici che il servizio a monte emette davvero sono tutti nell'insieme", () => {
    // L'ELENCO MISURATO, E SU QUALE ALBERO.
    //
    // Letto dai ref del layer privato, senza checkout, sull'albero
    // **effettivamente servito in produzione**: `origin/production` alla
    // revisione `9c9df65` del 2026-09-06 (promozione di `origin/main`
    // `74df29f`; `git diff origin/main origin/production` vuoto, cioè alberi
    // identici). Le tre case che emettono un codice su questa porta:
    // l'adattatore HTTP di `/api/formazione`, il lettore del canale di lega e
    // il percorso condiviso di lettura del deposito.
    //
    // PERCHÉ IL REF E NON LA COPIA DI LAVORO. La prima misura di questo elenco
    // è stata fatta su una copia di lavoro condivisa ferma a un branch di
    // ieri, e ne è uscito un elenco di undici codici a cui mancava proprio
    // `deposit_unreachable` — il codice che distingue «non ha risposto» da «ha
    // detto di no», cioè i due guasti con i rimedi più diversi che questa
    // porta possa produrre. Una copia di lavoro dice dove si trovava un
    // worktree; solo un ref dice che cosa gira.
    //
    // Dodici codici: i due di configurazione, l'irraggiungibilità, i sette del
    // deposito, il ripiego senza diagnosi e il metodo rifiutato. Se il servizio
    // ne aggiunge, toglie o rinomina uno, questa riga è dove si vede.
    const attesi = [
      "configuration_missing",
      "configuration_invalid",
      "deposit_unreachable",
      "upstream_auth_failed",
      "deposit_lookup_failed",
      "deposit_not_found",
      "deposit_ambiguous",
      "deposit_download_failed",
      "deposit_too_large",
      "deposit_invalid_payload",
      "deposit_unavailable",
      "method_not_allowed",
    ];
    expect([...DEPOSIT_FAULT_CODES].sort()).toEqual([...attesi].sort());
  });
});

describe("il riconoscitore non si fida del corpo che riceve", () => {
  it("riconosce ogni codice noto dentro un corpo ben formato", () => {
    for (const codice of DEPOSIT_FAULT_CODES) {
      expect(depositFaultFromBody(JSON.stringify({ error: codice }))).toBe(codice);
      // Con lo spazio e il ritorno a capo che l'adattatore HTTP aggiunge.
      expect(depositFaultFromBody(`{"error": "${codice}"}\n`)).toBe(codice);
    }
  });

  it("un codice che non è dei nostri non passa", () => {
    expect(depositFaultFromBody('{"error":"deposit_irraggiungibile"}')).toBeNull();
    expect(depositFaultFromBody('{"error":"DEPOSIT_NOT_FOUND"}')).toBeNull();
    expect(depositFaultFromBody('{"error":"deposit_not_found "}')).toBeNull();
    expect(depositFaultFromBody('{"error":"toString"}')).toBeNull();
    expect(depositFaultFromBody('{"error":"constructor"}')).toBeNull();
    expect(depositFaultFromBody('{"error":"__proto__"}')).toBeNull();
  });

  it("tutto ciò che non è un oggetto con un `error` di testo vale null", () => {
    for (const corpo of [
      null,
      undefined,
      "",
      "<html>502</html>",
      "{",
      "null",
      "true",
      "42",
      '"deposit_not_found"',
      '["deposit_not_found"]',
      '{"error":null}',
      '{"error":1}',
      '{"error":["deposit_not_found"]}',
      '{"error":{"toString":"deposit_not_found"}}',
      '{"errore":"deposit_not_found"}',
      "{}",
    ]) {
      expect(depositFaultFromBody(corpo), String(corpo)).toBeNull();
    }
  });

  it("un corpo oltre il tetto non viene nemmeno parsato", () => {
    const dentro = JSON.stringify({ error: "deposit_not_found" });
    expect(depositFaultFromBody(dentro)).toBe("deposit_not_found");
    const oltre = JSON.stringify({
      error: "deposit_not_found",
      zavorra: "z".repeat(DEPOSIT_FAULT_BODY_MAX_CHARS),
    });
    expect(oltre.length).toBeGreaterThan(DEPOSIT_FAULT_BODY_MAX_CHARS);
    expect(depositFaultFromBody(oltre)).toBeNull();
  });

  it("non lancia mai, qualunque cosa gli si dia", () => {
    const cattivi = [
      " ",
      "\u0000",
      "\uD800",
      '{"error":"' + "a".repeat(100) + '"}',
      "[".repeat(200),
      '{"error":"deposit_not_found"',
    ];
    for (const corpo of cattivi) {
      expect(() => depositFaultFromBody(corpo)).not.toThrow();
      expect(depositFaultFromBody(corpo), corpo.slice(0, 20)).toBeNull();
    }
  });

  it("ciò che esce appartiene sempre all'elenco, mai a ciò che è arrivato", () => {
    // Qualunque corpo, riconosciuto o no: l'uscita è `null` oppure una voce
    // dell'elenco. Non esiste una terza possibilità, ed è questa la ragione per
    // cui a valle si può stampare il risultato senza sfuggirlo.
    const corpi = [
      '{"error":"deposit_not_found"}',
      '{"error":"deposit_not_found<script>"}',
      '{"error":"quota_esaurita_su_marte"}',
      "<html>502</html>",
      "",
    ];
    for (const corpo of corpi) {
      const uscita = depositFaultFromBody(corpo);
      expect(
        uscita === null || (DEPOSIT_FAULT_CODES as readonly string[]).includes(uscita),
        corpo,
      ).toBe(true);
    }
  });

  it("la guardia di tipo dice `true` solo sui codici dichiarati", () => {
    for (const codice of DEPOSIT_FAULT_CODES) expect(isDepositFaultCode(codice)).toBe(true);
    for (const altro of [null, undefined, 1, {}, [], "", "deposit", "deposit_irraggiungibile"]) {
      expect(isDepositFaultCode(altro), String(altro)).toBe(false);
    }
  });
});
