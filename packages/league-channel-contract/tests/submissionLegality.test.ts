import { describe, expect, it } from "vitest";

import type { ObservedLeagueSettings } from "../src/leagueSettings.js";
import type { LineupSubmission, ObservedLineup } from "../src/lineupSubmission.js";
import { toSubmission } from "../src/lineupSubmission.js";
import {
  SUBMISSION_VIOLATION_CODES,
  validateSubmissionAgainstSettings,
  type SubmissionViolation,
} from "../src/submissionLegality.js";
import { FORMAZIONE, ROSA, SETTINGS_IN_ACCORDO } from "./fixtures.js";

/** Gli id della rosa sintetica: è la stessa forma che passerebbe il privato. */
const ROSTER_IDS: readonly string[] = ROSA.players.map((player) => player.id);

function invio(overrides: Partial<ObservedLineup> = {}, matchday = 5): LineupSubmission {
  const lineup: ObservedLineup = { ...FORMAZIONE, ...overrides };
  return toSubmission(matchday, lineup.competitionId, lineup);
}

function codici(violations: readonly SubmissionViolation[]): readonly string[] {
  return violations.map((violation) => violation.code);
}

describe("un invio legale non produce nulla", () => {
  it("formazione, modulo, panchina e rosa in ordine: elenco vuoto", () => {
    expect(
      validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO, {
        rosterIds: ROSTER_IDS,
      }),
    ).toEqual([]);
  });

  it("l'esito non dipende dallo stato: due chiamate identiche danno lo stesso elenco", () => {
    const a = validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO);
    const b = validateSubmissionAgainstSettings(invio(), SETTINGS_IN_ACCORDO);
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

describe("la rosa si controlla solo se la si è ricevuta", () => {
  it("un id estraneo alla rosa passata è bloccante", () => {
    const violations = validateSubmissionAgainstSettings(
      invio({ benchIds: ["p99", "p13", "p14", "p15", "p16"] }),
      SETTINGS_IN_ACCORDO,
      { rosterIds: ROSTER_IDS },
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
      { rosterIds: ROSTER_IDS },
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
      { rosterIds: ROSTER_IDS },
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
    );
    const severita = violations.map((violation) => violation.severity);
    expect(severita).toEqual([...severita].sort((a, b) => (a === b ? 0 : a === "bloccante" ? -1 : 1)));
    const bloccanti = violations.filter((violation) => violation.severity === "bloccante");
    expect(codici(bloccanti)).toEqual([...codici(bloccanti)].sort());
    // E ci sono davvero entrambe le famiglie, altrimenti l'ordine non prova nulla.
    expect(severita).toContain("bloccante");
    expect(severita).toContain("avvertimento");
  });
});
