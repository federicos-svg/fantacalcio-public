import { describe, expect, it } from "vitest";
import {
  codiceScritto,
  disponibilitaScritta,
  DISPONIBILITA_SCRITTA,
  moduloScritto,
  ricadutaLeggibile,
  VINCOLI_SCRITTI,
  VIOLAZIONI_SCRITTE,
} from "./formazioneScritte.js";
import {
  localConstraintIssues,
  MODULES,
  NO_LINEUP_CONSTRAINTS,
  SUBMISSION_VIOLATION_CODES,
} from "../packages/league-channel-contract/src/index.js";
import type {
  ConstraintRejectionCode,
  ConstraintWarningCode,
  ObservedAvailability,
  Role,
} from "../packages/league-channel-contract/src/index.js";

// Decisione di Pico, 31/10/2026, in modale: «Sì, solo queste» — le scritte
// poco chiare della pagina formazione si riscrivono in italiano chiaro, senza
// cambiare cosa fanno i comandi. Questa suite tiene ferma la traduzione per la
// visualizzazione; che la pagina la usi davvero dappertutto lo prova
// `e2e/formazione-scritte.spec.ts`, dal browser.

const CON_TRATTINO_BASSO = /_/;

// L'ADERENZA AI CODICI VERI, IN COMPILAZIONE E IN TUTTE E DUE LE DIREZIONI.
// `formazioneScritte.ts` non importa il contratto (la guardia di isolamento
// ammette un elenco chiuso di file), quindi è questo file a tenerle allineate:
// un codice nuovo nel contratto senza la sua voce, o una voce per un codice che
// il contratto non emette più, fa fallire `npm run typecheck`. `true` non è
// assegnabile a `false`: è tutta qui la prova.
type StessoInsieme<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
const stessiVincoli: StessoInsieme<
  keyof typeof VINCOLI_SCRITTI,
  ConstraintRejectionCode | ConstraintWarningCode
> = true;
const stesseDisponibilita: StessoInsieme<
  keyof typeof DISPONIBILITA_SCRITTA,
  ObservedAvailability
> = true;

describe("aderenza ai codici del contratto", () => {
  it("le tabelle in compilazione dicono lo stesso insieme del contratto", () => {
    // Il lavoro lo fa il tipo qui sopra; a runtime resta solo che esista.
    expect(stessiVincoli).toBe(true);
    expect(stesseDisponibilita).toBe(true);
  });

  it("ogni violazione che il contratto può emettere ha la sua parola, e nessuna di troppo", () => {
    const emessi = Object.values(SUBMISSION_VIOLATION_CODES);
    expect(emessi.length).toBeGreaterThan(0);
    for (const codice of emessi) {
      expect(Object.hasOwn(VIOLAZIONI_SCRITTE, codice), `manca la voce di ${codice}`).toBe(true);
    }
    // Una tabella che conserva un codice sparito dal contratto è una promessa
    // che nessuno mantiene.
    expect(Object.keys(VIOLAZIONI_SCRITTE).sort()).toEqual([...emessi].sort());
  });

  it("i codici che il produttore dei vincoli emette davvero hanno la loro parola", () => {
    // Non c'è un elenco a runtime dei motivi di rifiuto (sono un tipo): si
    // fanno emettere dalla funzione vera, in scenari che ne toccano parecchi.
    const ruoli = new Map<string, Role>([
      ["p1", "P"],
      ["p2", "P"],
      ...["d1", "d2", "d3", "d4", "d5"].map((id): [string, Role] => [id, "D"]),
      ...["x1", "x2", "x3", "x4", "x5", "x6", "x7"].map((id): [string, Role] => [id, "A"]),
    ]);
    const emessi = new Set<string>();
    const raccogli = (esito: ReturnType<typeof localConstraintIssues>): void => {
      for (const voce of [...esito.rejections, ...esito.warnings]) emessi.add(voce.code);
    };

    // Ripetuto, sconosciuto, più di undici, due portieri.
    raccogli(
      localConstraintIssues(
        {
          ...NO_LINEUP_CONSTRAINTS,
          lockedStarterIds: [
            "p1", "p2", "d1", "d1", "d2", "d3", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "zz",
          ],
        },
        null,
        ruoli,
      ),
    );
    // Un modulo bloccato che la lega non ammette; cinque difensori in un 4-4-2.
    raccogli(
      localConstraintIssues(
        {
          ...NO_LINEUP_CONSTRAINTS,
          lockedStarterIds: ["d1", "d2", "d3", "d4", "d5"],
          lockedModule: "442",
        },
        null,
        ruoli,
        ["433"],
      ),
    );
    // Blindata, ma senza niente da tenere.
    raccogli(localConstraintIssues({ ...NO_LINEUP_CONSTRAINTS, locked: true }, null, ruoli));

    // Il controllo non è vuoto: gli scenari ne hanno davvero prodotti.
    for (const atteso of [
      "LOCKED_PLAYER_DUPLICATED",
      "LOCKED_PLAYER_UNKNOWN",
      "LOCKED_TOO_MANY",
      "LOCKED_ROLE_OVERFLOW",
      "LOCKED_MODULE_NOT_ALLOWED",
      "LOCKED_MODULE_INCOMPATIBLE",
      "LOCKED_LINEUP_MISSING",
    ]) {
      expect(emessi.has(atteso), `lo scenario non ha prodotto ${atteso}`).toBe(true);
    }
    for (const codice of emessi) {
      expect(Object.hasOwn(VINCOLI_SCRITTI, codice), `manca la voce di ${codice}`).toBe(true);
      expect(codiceScritto(codice)).not.toMatch(CON_TRATTINO_BASSO);
    }
  });
});

describe("disponibilità", () => {
  it("«in_dubbio» si legge «in dubbio»; le altre due restano com'erano", () => {
    expect(disponibilitaScritta("in_dubbio")).toBe("in dubbio");
    expect(disponibilitaScritta("disponibile")).toBe("disponibile");
    expect(disponibilitaScritta("indisponibile")).toBe("indisponibile");
  });

  it("nessuna disponibilità dichiarata si mostra col trattino basso", () => {
    for (const [valore, scritta] of Object.entries(DISPONIBILITA_SCRITTA)) {
      expect(scritta, valore).not.toMatch(CON_TRATTINO_BASSO);
      expect(disponibilitaScritta(valore)).toBe(scritta);
    }
  });

  it("un valore che il contratto non conosce ancora ricade a parole, mai crudo", () => {
    expect(disponibilitaScritta("squalificato_fino_a_data")).toBe("squalificato fino a data");
  });
});

describe("moduli", () => {
  it("«442» si legge «4-4-2», e tutti i moduli di §9 hanno la loro forma", () => {
    expect(moduloScritto("442")).toBe("4-4-2");
    expect(moduloScritto("541")).toBe("5-4-1");
    expect(MODULES.map(moduloScritto)).toEqual([
      "5-4-1",
      "4-5-1",
      "5-3-2",
      "4-4-2",
      "3-5-2",
      "4-3-3",
      "3-4-3",
    ]);
  });

  it("si scrive soltanto: tolti i trattini si torna al valore che si scambia con la lega", () => {
    for (const modulo of MODULES) {
      expect(moduloScritto(modulo).replaceAll("-", "")).toBe(modulo);
    }
  });

  it("ciò che non è un modulo di tre cifre passa com'è, senza trattini inventati", () => {
    for (const altro of ["", "—", "4231", "44", "4-4-2", "abc"]) {
      expect(moduloScritto(altro)).toBe(altro);
    }
  });
});

describe("codici di violazione e di vincolo", () => {
  it("«id_fuori_rosa» si legge «fuori rosa»", () => {
    expect(codiceScritto("id_fuori_rosa")).toBe("fuori rosa");
  });

  it("nessuna parola, in nessuna tabella, ha un trattino basso", () => {
    for (const tabella of [VIOLAZIONI_SCRITTE, VINCOLI_SCRITTI, DISPONIBILITA_SCRITTA]) {
      for (const [codice, parola] of Object.entries(tabella)) {
        expect(parola, codice).not.toMatch(CON_TRATTINO_BASSO);
        expect(parola.length, codice).toBeGreaterThan(0);
        // Una parola uguale al codice è un codice non tradotto.
        if (codice.includes("_")) expect(parola, codice).not.toBe(codice);
      }
    }
  });

  it("due codici diversi non finiscono nella stessa parola: chi legge li distingue", () => {
    const tutte = [...Object.values(VIOLAZIONI_SCRITTE), ...Object.values(VINCOLI_SCRITTI)];
    expect(new Set(tutte).size).toBe(tutte.length);
  });

  it("i motivi dei vincoli, maiuscoli, si leggono a parole", () => {
    expect(codiceScritto("LOCKED_PLAYER_NEVER_PLAYS")).toBe("giocatore che non gioca");
    expect(codiceScritto("LOCKED_TOO_MANY")).toBe("troppi giocatori spuntati");
    for (const codice of Object.keys(VINCOLI_SCRITTI)) {
      expect(codiceScritto(codice)).toBe(VINCOLI_SCRITTI[codice as keyof typeof VINCOLI_SCRITTI]);
      expect(codiceScritto(codice)).not.toMatch(CON_TRATTINO_BASSO);
    }
  });

  it("un codice che nessuna tabella conosce ricade a parole, mai crudo", () => {
    expect(codiceScritto("qualcosa_di_nuovo")).toBe("qualcosa di nuovo");
    expect(codiceScritto("LOCKED_NUOVO_MOTIVO")).toBe("locked nuovo motivo");
    expect(ricadutaLeggibile("__a__b__")).toBe("a b");
    expect(codiceScritto("constructor")).toBe("constructor");
  });
});
