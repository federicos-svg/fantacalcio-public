import { describe, expect, it } from "vitest";

import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type { ObservedLeagueSettings } from "../src/leagueSettings.js";
import type { LineupSubmission, ObservedLineup } from "../src/lineupSubmission.js";
import { toSubmission } from "../src/lineupSubmission.js";
import { rolesByPlayerId } from "../src/roster.js";
import {
  SUBMISSION_VIOLATION_CODES,
  validateSubmissionAgainstSettings,
  type SubmissionViolation,
} from "../src/submissionLegality.js";
import { FORMAZIONE, ROSA, SETTINGS_IN_ACCORDO } from "./fixtures.js";

/** Gli id della rosa sintetica: è la stessa forma che passerebbe il privato. */
const ROSTER_IDS: readonly string[] = ROSA.players.map((player) => player.id);

/**
 * I ruoli si prendono dalla rosa osservata con la funzione del contratto, non
 * si riscrivono a mano: una mappa scritta nel test proverebbe la mappa del
 * test, non quella che girerebbe in esercizio.
 */
const RUOLI = rolesByPlayerId(ROSA);

/** Gli stessi ruoli, più un id che la rosa non contiene. */
const RUOLI_CON_ESTRANEO: ReadonlyMap<string, Role> = new Map<string, Role>([
  ...RUOLI,
  ["p99", "D"],
]);

function invio(overrides: Partial<ObservedLineup> = {}, matchday = 5): LineupSubmission {
  const lineup: ObservedLineup = { ...FORMAZIONE, ...overrides };
  return toSubmission(matchday, lineup.competitionId, lineup);
}

function codici(violations: readonly SubmissionViolation[]): readonly string[] {
  return violations.map((violation) => violation.code);
}

describe("un invio legale non produce nulla", () => {
  it("formazione, modulo, reparti, panchina e rosa in ordine: elenco vuoto", () => {
    expect(
      validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, {
        rosterIds: ROSTER_IDS,
        roles: RUOLI,
      }),
    ).toEqual([]);
  });

  it("i ruoli si leggono anche da un oggetto piano, come arriverebbero da JSON", () => {
    const piano: Record<string, Role> = Object.fromEntries(RUOLI);
    expect(
      validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, {
        rosterIds: ROSTER_IDS,
        roles: piano,
      }),
    ).toEqual([]);
  });

  it("l'esito non dipende dallo stato: due chiamate identiche danno lo stesso elenco", () => {
    const a = validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, { roles: RUOLI });
    const b = validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, { roles: RUOLI });
    expect(a).toEqual(b);
  });
});

describe("il modulo si confronta con l'elenco dichiarato, non con una costante", () => {
  it("un modulo fuori dall'elenco della lega è bloccante", () => {
    const settings: ObservedLeagueSettings = {
      ...SETTINGS_IN_ACCORDO,
      allowedModules: ["442", "352"],
    };
    const violations = validateSubmissionAgainstSettings(invio({ module: "343" }), settings);
    const modulo = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.moduloNonAmmesso,
    );
    expect(modulo?.severity).toBe("bloccante");
    // Il vincolo viene dall'osservazione, e l'esito lo dichiara: è la differenza
    // fra «la lega lo vieta» e «lo vieta il nostro codice».
    expect(modulo?.observed).toBe(true);
  });

  it("senza allowedModules non si inventa una lista: esce un avvertimento dedicato", () => {
    const { allowedModules: _ignorato, ...senzaModuli } = SETTINGS_IN_ACCORDO;
    const violations = validateSubmissionAgainstSettings(invio({ module: "343" }), senzaModuli);
    const modulo = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.moduloNonVerificabile,
    );
    expect(modulo?.severity).toBe("avvertimento");
    expect(modulo?.observed).toBe(false);
    // E soprattutto: niente blocco. Una lacuna della lettura non vale la
    // formazione della giornata precedente (§16).
    expect(codici(violations)).not.toContain(SUBMISSION_VIOLATION_CODES.moduloNonAmmesso);
  });

  it("un blocco per competizione che dichiara i suoi moduli vince su quello di lega", () => {
    const settings: ObservedLeagueSettings = {
      ...SETTINGS_IN_ACCORDO,
      perCompetition: [{ competitionId: "c1", settings: { allowedModules: ["352"] } }],
    };
    expect(codici(validateSubmissionAgainstSettings(invio(), settings))).toContain(
      SUBMISSION_VIOLATION_CODES.moduloNonAmmesso,
    );
  });
});

describe("l'undici deve reggere il modulo che dichiara", () => {
  it("titolari incoerenti col modulo: bloccante, e il messaggio dice la scomposizione", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ starterIds: FORMAZIONE.starterIds.slice(0, 9) }),
      SETTINGS_IN_ACCORDO,
    );
    const undici = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.titolariNumeroErrato,
    );
    expect(undici?.severity).toBe("bloccante");
    expect(undici?.message).toContain("4 difensori");
    expect(undici?.message).toContain("2 attaccanti");
  });

  it("senza portiere l'undici non è completo", () => {
    expect(
      codici(validateSubmissionAgainstSettings(invio({ goalkeeperId: "" }), SETTINGS_IN_ACCORDO)),
    ).toContain(SUBMISSION_VIOLATION_CODES.portiereMancante);
  });

  it("lo stesso id titolare e in panchina è una sostituzione con sé stesso", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ benchIds: ["p2", "p13", "p14", "p15", "p16"] }),
      SETTINGS_IN_ACCORDO,
    );
    const doppio = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.idRipetuto,
    );
    expect(doppio?.severity).toBe("bloccante");
    expect(doppio?.message).toContain("p2");
  });

  it("un portiere ripetuto in panchina viene visto come gli altri", () => {
    expect(
      codici(
        validateSubmissionAgainstSettings(
          invio({ benchIds: ["p1", "p13", "p14", "p15", "p16"] }),
          SETTINGS_IN_ACCORDO,
        ),
      ),
    ).toContain(SUBMISSION_VIOLATION_CODES.idRipetuto);
  });
});

describe("la composizione dei reparti si ferma qui, non sulla piattaforma", () => {
  it("cinque difensori dentro un 4-4-2 sono bloccanti, e il messaggio dice i due numeri", () => {
    // p13 è un difensore: entra al posto del centrocampista p9.
    const violations = validateSubmissionAgainstSettings(
      invio({
        starterIds: ["p2", "p3", "p4", "p5", "p13", "p6", "p7", "p8", "p10", "p11"],
        benchIds: ["p12", "p9", "p14", "p15", "p16"],
      }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: RUOLI },
    );
    const difesa = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.difensoriNumeroErrato,
    );
    expect(difesa?.severity).toBe("bloccante");
    expect(difesa?.observed).toBe(true);
    expect(difesa?.message).toContain("richiede 4 difensori");
    expect(difesa?.message).toContain("ne porta 5");
    // E il reparto rimasto scoperto si vede dall'altro lato del conto.
    const centrocampo = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.centrocampistiNumeroErrato,
    );
    expect(centrocampo?.message).toContain("richiede 4 centrocampisti");
    expect(centrocampo?.message).toContain("ne porta 3");
  });

  it("in porta deve esserci un portiere, non solo qualcuno", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({
        goalkeeperId: "p13",
        starterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
        benchIds: ["p12", "p1", "p14", "p15", "p16"],
      }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: RUOLI },
    );
    const portiere = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.portiereRuoloErrato,
    );
    expect(portiere?.severity).toBe("bloccante");
    expect(portiere?.observed).toBe(true);
    expect(portiere?.message).toContain("p13");
  });

  it("un ruolo non osservato avverte e sospende il giudizio sul suo reparto", () => {
    // p11 (attaccante) esce dalla mappa: il conto degli attaccanti scende a 1,
    // ma con un ruolo ignoto fra i titolari il reparto potrebbe essere a posto.
    const parziali = new Map(RUOLI);
    parziali.delete("p11");
    const violations = validateSubmissionAgainstSettings(
      invio(),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: parziali },
    );
    const ignoto = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.ruoloNonOsservato,
    );
    expect(ignoto?.severity).toBe("avvertimento");
    expect(ignoto?.observed).toBe(false);
    expect(ignoto?.message).toContain("p11");
    // Nessun reparto viene dichiarato sbagliato: il caso è indecidibile.
    expect(codici(violations)).not.toContain(SUBMISSION_VIOLATION_CODES.attaccantiNumeroErrato);
    expect(violations.filter((violation) => violation.severity === "bloccante")).toEqual([]);
  });

  it("un ruolo ignoto non salva un reparto che è sbagliato con certezza", () => {
    // Due attaccanti tolti e un ruolo ignoto: anche assegnandolo all'attacco
    // gli attaccanti resterebbero uno sotto il richiesto.
    const parziali = new Map(RUOLI);
    parziali.delete("p16");
    const violations = validateSubmissionAgainstSettings(
      invio({
        starterIds: ["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p14", "p16"],
        benchIds: ["p12", "p13", "p10", "p11", "p15"],
      }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: parziali },
    );
    const attacco = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.attaccantiNumeroErrato,
    );
    expect(attacco?.severity).toBe("bloccante");
    expect(attacco?.message).toContain("di ruolo non osservato");
  });

  it("senza roles la composizione non si suppone: avvertimento dichiarato", () => {
    const violations = validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, {
      rosterIds: ROSTER_IDS,
    });
    const composizione = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.composizioneNonVerificabile,
    );
    expect(composizione?.severity).toBe("avvertimento");
    expect(composizione?.observed).toBe(false);
    // E nessun reparto viene dichiarato sbagliato senza i ruoli.
    expect(codici(violations)).not.toContain(SUBMISSION_VIOLATION_CODES.difensoriNumeroErrato);
  });
});

describe("la rosa si controlla solo se la si è ricevuta", () => {
  it("un id estraneo alla rosa passata è bloccante", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ benchIds: ["p99", "p13", "p14", "p15", "p16"] }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: RUOLI_CON_ESTRANEO },
    );
    const fuori = violations.find(
      (violation) => violation.code === SUBMISSION_VIOLATION_CODES.idFuoriRosa,
    );
    expect(fuori?.severity).toBe("bloccante");
    expect(fuori?.observed).toBe(true);
    expect(fuori?.message).toContain("p99");
  });

  it("senza rosterIds nessun controllo di rosa e nessun avvertimento silenzioso", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ benchIds: ["p99", "p13", "p14", "p15", "p16"] }),
      SETTINGS_IN_ACCORDO,
      { roles: RUOLI_CON_ESTRANEO },
    );
    // Né un blocco («non è in rosa», che non sappiamo) né un avvertimento
    // («non abbiamo controllato»), che sarebbe rumore a ogni chiamata.
    expect(violations).toEqual([]);
  });
});

describe("giornata e competizione", () => {
  it("una giornata non intera o non positiva è bloccante", () => {
    // `toSubmission` rifiuta di costruirlo, quindi l'invio malformato si scrive
    // a mano: è la forma in cui arriverebbe da una lettura della piattaforma.
    const submission: LineupSubmission = {
      matchday: 0,
      competitionId: FORMAZIONE.competitionId,
      lineup: FORMAZIONE,
      leagueRuleVersion: "2026_27_v1",
    };
    const violations = validateSubmissionAgainstSettings(submission, SETTINGS_IN_ACCORDO);
    expect(codici(violations)).toContain(SUBMISSION_VIOLATION_CODES.giornataNonValida);
  });

  it("invio e formazione su due competizioni diverse: è la partita sbagliata", () => {
    const submission: LineupSubmission = {
      matchday: 5,
      competitionId: "c2",
      lineup: FORMAZIONE,
      leagueRuleVersion: "2026_27_v1",
    };
    expect(codici(validateSubmissionAgainstSettings(submission, SETTINGS_IN_ACCORDO))).toContain(
      SUBMISSION_VIOLATION_CODES.competizioneIncoerente,
    );
  });

  it("«vale per tutte le competizioni» non prova che l'altra sia coperta", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ flags: { hidden: false, allCompetitions: true } }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: RUOLI },
    );
    const estesa = violations.find(
      (violation) =>
        violation.code === SUBMISSION_VIOLATION_CODES.competizioneEstesaNonVerificabile,
    );
    expect(estesa?.severity).toBe("avvertimento");
    expect(estesa?.observed).toBe(false);
    expect(estesa?.message).toContain("§23");
  });
});

describe("panchina e sostituzioni", () => {
  it("una panchina più corta delle sostituzioni concesse avverte, non blocca", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ benchIds: ["p12", "p13"] }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS, roles: RUOLI },
    );
    expect(violations).toHaveLength(1);
    const corta = violations[0];
    expect(corta?.code).toBe(SUBMISSION_VIOLATION_CODES.panchinaPiuCortaDelleSostituzioni);
    expect(corta?.severity).toBe("avvertimento");
    expect(corta?.observed).toBe(true);
    expect(corta?.message).toContain("5");
  });

  it("senza maxSubstitutions osservato la panchina corta non dice nulla", () => {
    const { maxSubstitutions: _ignorato, ...senzaTetto } = SETTINGS_IN_ACCORDO;
    expect(
      validateSubmissionAgainstSettings(invio({ benchIds: ["p12"] }), senzaTetto, {
        rosterIds: ROSTER_IDS,
        roles: RUOLI,
      }),
    ).toEqual([]);
  });
});

describe("l'ordine dell'esito è stabile", () => {
  it("i bloccanti vengono prima degli avvertimenti, poi si ordina per codice", () => {
    const { allowedModules: _ignorato, ...senzaModuli } = SETTINGS_IN_ACCORDO;
    const violations = validateSubmissionAgainstSettings(
      invio({
        starterIds: FORMAZIONE.starterIds.slice(0, 9),
        benchIds: ["p2", "p13"],
        flags: { hidden: false, allCompetitions: true },
      }),
      senzaModuli,
      { roles: RUOLI },
    );
    const severita = violations.map((violation) => violation.severity);
    expect(severita).toEqual(
      [...severita].sort((a, b) => (a === b ? 0 : a === "bloccante" ? -1 : 1)),
    );
    const bloccanti = violations.filter((violation) => violation.severity === "bloccante");
    expect(codici(bloccanti)).toEqual([...codici(bloccanti)].sort());
    // E ci sono davvero entrambe le famiglie, altrimenti l'ordine non prova nulla.
    expect(severita).toContain("bloccante");
    expect(severita).toContain("avvertimento");
  });
});
