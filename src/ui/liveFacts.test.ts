import { describe, it, expect } from "vitest";
import {
  MOMENT_FACTS_NOTE,
  OPPONENT_PRECEDENTS_NOTE,
  OPPONENT_PRECEDENTS_NO_CALL,
  OPPONENT_PRECEDENTS_NO_HISTORY,
  OPPONENT_PRECEDENTS_TITLE,
  formatDecimal1,
  formatPercent,
  formatSignedPercent,
  marketPressureHtml,
  momentScarcityHtml,
  opponentPrecedentsHeadline,
  opponentPrecedentsHtml,
  precedentEvidence,
  precedentMotive,
  seasonsSpan,
  shortSeason,
} from "./liveFacts.js";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  auctionPrecedents,
} from "../../packages/opponent-profiles/src/index.js";
import {
  CONFIRMED_PROFILE,
  PRECEDENT_SEATS_TO_PEOPLE,
  SUPPORTER_WITHOUT_SPEND_PROFILE,
  SYNTHETIC_CALLED_PLAYER,
  syntheticAuctionHistory,
} from "../../packages/opponent-profiles/fixtures/synthetic.js";
import { residualPressure } from "../../packages/engine/src/anchors.js";
import { roleScarcity } from "../../packages/engine/src/auction.js";
import type { AuctionState, PoolPlayer, Role, TeamState } from "../../packages/engine/src/types.js";
import { INITIAL_BUDGET, ROSTER_REQUIREMENTS, TOTAL_SLOTS } from "../../packages/engine/src/types.js";

// Synthetic fixtures only — no real player, club or quotation anywhere (same
// rule as src/ui/warBoard.test.ts and e2e/fixtures/).

// Every directive family that must never reach this surface: the blocks built
// here are measured facts, and a regression that let one of these words in
// would be a product violation, not a cosmetic one.
const DIRECTIVE = /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi/i;

function team(overrides: Partial<TeamState> = {}): TeamState {
  const slotsRemaining = overrides.slotsRemaining ?? { ...ROSTER_REQUIREMENTS };
  const totalSlotsRemaining =
    overrides.totalSlotsRemaining ??
    slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A;
  return {
    fantaTeamId: "Squadra2",
    spent: 0,
    budgetResidual: INITIAL_BUDGET,
    filled: { P: 0, D: 0, C: 0, A: 0 },
    roster: [],
    ...overrides,
    slotsRemaining,
    totalSlotsRemaining,
  };
}

function stateOf(teams: readonly TeamState[]): AuctionState {
  return {
    teams: Object.fromEntries(teams.map((t) => [t.fantaTeamId, t])),
    purchasedPlayerIds: [],
    lastSeq: 0,
  };
}

/** Eight untouched teams — the state at the very first call. */
function freshState(): AuctionState {
  return stateOf(
    ["Io", "Squadra2", "Squadra3", "Squadra4", "Squadra5", "Squadra6", "Squadra7", "Squadra8"].map(
      (fantaTeamId) => team({ fantaTeamId }),
    ),
  );
}

const LABELS: Record<string, string> = {
  Io: "Io",
  Squadra2: "Bea",
  Squadra3: "Cor",
  Squadra4: "Squadra4",
  Squadra5: "Squadra5",
  Squadra6: "Squadra6",
  Squadra7: "Squadra7",
  Squadra8: "Squadra8",
};

// ── Formatting: deterministic and locale-free ───────────────────────────────

describe("formatDecimal1", () => {
  it("uses the Italian decimal comma without any Intl/locale dependency", () => {
    expect(formatDecimal1(17.857142857142858)).toBe("17,9");
    expect(formatDecimal1(16.018181818181816)).toBe("16,0");
    expect(formatDecimal1(0)).toBe("0,0");
  });

  it("never prints a negative zero", () => {
    expect(formatDecimal1(-0.01)).toBe("0,0");
    expect(formatDecimal1(-0)).toBe("0,0");
  });

  it("declares a non-finite figure as n/d instead of NaN", () => {
    expect(formatDecimal1(Number.NaN)).toBe("n/d");
    expect(formatDecimal1(Number.POSITIVE_INFINITY)).toBe("n/d");
  });
});

describe("formatSignedPercent", () => {
  it("carries the direction in the text, not only in a colour", () => {
    expect(formatSignedPercent(0.0812)).toBe("+8%");
    expect(formatSignedPercent(-0.103)).toBe("−10%");
  });

  it("prints an exact zero unsigned, never -0%", () => {
    expect(formatSignedPercent(0)).toBe("0%");
    expect(formatSignedPercent(-0.0004)).toBe("0%");
  });

  it("declares a non-finite ratio as n/d", () => {
    expect(formatSignedPercent(Number.NaN)).toBe("n/d");
  });
});

// ── MOMENTO DELL'ASTA — scarsità ───────────────────────────────────────────

describe("momentScarcityHtml", () => {
  const pool: readonly PoolPlayer[] = [
    { playerId: "p1", role: "P", name: "Alfa Sintetico" },
    { playerId: "p2", role: "P", name: "Beta Sintetico" },
    { playerId: "d1", role: "D", name: "Gamma Sintetico" },
  ];

  it("shows both numbers for every role, with their separate provenance", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "P");
    // 8 teams x 3 P slots = 24 free P slots, from the event log alone.
    expect(html).toContain(`id="moment-scarcity-slots-P">24<`);
    // Row count of the loaded listone — a different number, different source.
    expect(html).toContain(`id="moment-scarcity-pool-P">2<`);
    expect(html).toContain(`id="moment-scarcity-slots-A">56<`);
    expect(html).toContain(`id="moment-scarcity-pool-A">0<`);
    for (const role of ["P", "D", "C", "A"]) {
      expect(html).toContain(`id="moment-scarcity-${role}"`);
    }
  });

  it("shows n/d, never 0, when no listone is loaded", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), []), false, "D");
    expect(html).toContain(`id="moment-scarcity-pool-D">n/d<`);
    expect(html).toContain(`id="moment-scarcity-slots-D">72<`);
  });

  it("marks the called role in words as well as by class", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "C");
    expect(html).toContain(`id="moment-scarcity-C"`);
    expect(html).toMatch(/moment-scarcity__cell--called[\s\S]*?id="moment-scarcity-C"/);
    expect(html).toContain("in asta");
    expect(html.match(/moment-scarcity__cell--called/g)).toHaveLength(1);
  });

  it("marks nothing when the moment carries no role", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "");
    expect(html).not.toContain("moment-scarcity__cell--called");
    // Every role cell is still there: no role selected is not a reason to
    // show less.
    for (const role of ["P", "D", "C", "A"]) {
      expect(html).toContain(`id="moment-scarcity-${role}"`);
    }
  });

  it("counts a role whose slots are all filled as 0 free slots", () => {
    const exhausted = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 9, C: 9, A: 7 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 9, C: 9, A: 7 } }),
    ]);
    const html = momentScarcityHtml(roleScarcity(exhausted, pool), true, "P");
    expect(html).toContain(`id="moment-scarcity-slots-P">0<`);
  });

  // ── #331 punto 2 — il sottoinsieme di ruoli, e il conto che deve tornare ──
  //
  // La scheda del giocatore rende la cella del solo ruolo chiamato; le altre
  // tre stanno dietro un gesto (views.ts renderMomentInsightsBlock). Il rischio
  // di questa forma è aritmetico prima che estetico: due chiamate che si
  // dividono i ruoli possono perderne uno per strada, e una cella persa è
  // informazione tolta — esattamente il vincolo di Pico che #333 dichiara.
  // Qui si fissa che le due metà siano DISGIUNTE e che la loro unione siano
  // sempre quattro celle, con gli stessi id di quando erano una griglia sola.
  describe("il sottoinsieme di ruoli (#331 punto 2)", () => {
    const scarcity = roleScarcity(freshState(), pool);

    it("con un ruolo solo rende quella cella e nessun'altra", () => {
      const html = momentScarcityHtml(scarcity, true, "A", ["A"]);
      expect(html).toContain(`id="moment-scarcity-A"`);
      for (const role of ["P", "D", "C"]) {
        expect(html).not.toContain(`id="moment-scarcity-${role}"`);
      }
      // La cella è la STESSA di prima: stessi numeri, stessa provenienza.
      expect(html).toContain(`id="moment-scarcity-slots-A">56<`);
      expect(html).toContain(`id="moment-scarcity-pool-A">0<`);
      // Ed è marcata come quella in asta, perché è il ruolo chiamato.
      expect(html).toContain("moment-scarcity__cell--called");
      expect(html).toContain("in asta");
    });

    it("le due metà sono disgiunte e insieme fanno tutte e quattro le celle", () => {
      const called = momentScarcityHtml(scarcity, true, "A", ["A"]);
      const others = momentScarcityHtml(scarcity, true, "A", ["P", "D", "C"]);
      const both = called + others;
      for (const role of ["P", "D", "C", "A"]) {
        expect(both.match(new RegExp(`id="moment-scarcity-${role}"`, "g"))).toHaveLength(1);
      }
      // Il marcatore «in asta» resta uno solo, e sta nella metà giusta.
      expect(both.match(/moment-scarcity__cell--called/g)).toHaveLength(1);
      expect(others).not.toContain("moment-scarcity__cell--called");
    });

    it("il default è tutti e quattro i ruoli: nessun chiamante esistente cambia", () => {
      expect(momentScarcityHtml(scarcity, true, "A")).toBe(
        momentScarcityHtml(scarcity, true, "A", ["P", "D", "C", "A"]),
      );
    });

    it("un elenco vuoto non rende niente, senza inventare una cella di ripiego", () => {
      expect(momentScarcityHtml(scarcity, true, "A", []).trim()).toBe("");
    });
  });
});

// ── MOMENTO DELL'ASTA — mercato ────────────────────────────────────────────

describe("marketPressureHtml", () => {
  it("reads exactly at the starting endowment when nothing has been bought", () => {
    const html = marketPressureHtml(residualPressure(freshState()));
    expect(html).toContain(`id="moment-market-credits">4000<`);
    expect(html).toContain(`id="moment-market-slots">224<`);
    expect(html).toContain(`id="moment-market-per-slot">17,9 cr<`);
    expect(html).toContain(`>0%<`);
    expect(html).toContain("moment-market__delta--flat");
    expect(html).toContain("Censimento su 8 squadre");
  });

  it("shows the drop when the table has paid over its per-slot endowment", () => {
    const spent = stateOf([
      team({
        fantaTeamId: "Io",
        spent: 476,
        budgetResidual: 24,
        slotsRemaining: { P: 3, D: 9, C: 9, A: 3 },
      }),
      team({ fantaTeamId: "Squadra2" }),
    ]);
    const pressure = residualPressure(spent);
    expect(pressure.creditsRemaining).toBe(524);
    expect(pressure.slotsRemaining).toBe(24 + TOTAL_SLOTS);
    const html = marketPressureHtml(pressure);
    expect(html).toContain("moment-market__delta--down");
    expect(html).toMatch(/id="moment-market-delta"[^>]*>−\d+%</);
  });

  it("shows the rise when credits outnumber the slots left", () => {
    const loose = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 0, C: 0, A: 1 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 0, C: 0, A: 1 } }),
    ]);
    const html = marketPressureHtml(residualPressure(loose));
    expect(html).toContain("moment-market__delta--up");
    expect(html).toMatch(/id="moment-market-delta"[^>]*>\+\d+%</);
  });

  it("declares n/d with its reason when no slot is left, never a 0", () => {
    const done = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 0, C: 0, A: 0 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 0, C: 0, A: 0 } }),
    ]);
    const pressure = residualPressure(done);
    expect(pressure.reason).toBe("no-remaining-slots");
    const html = marketPressureHtml(pressure);
    expect(html).toContain(`id="moment-market-per-slot">n/d<`);
    expect(html).toContain(`id="moment-market-slots">0<`);
    expect(html).toContain("moment-market__delta--none");
    expect(html).toContain("non ha denominatore");
  });

  it("carries the declared baseline next to the delta", () => {
    const html = marketPressureHtml(residualPressure(freshState()));
    // 500 / 28 — a league rule constant, not a weight chosen by the system.
    expect(html).toContain("vs partenza (17,9)");
  });
});


// ── AVVERSARI — i precedenti d'asta sul giocatore chiamato ─────────────────
//
// Il blocco che stava qui copriva `competitorReachHeadline` /
// `competitorReachHtml`, cioè la raggiungibilità per vincolo duro. Quelle
// asserzioni sono state SOSTITUITE, non tolte: la funzione che descrivevano è
// uscita da questo pannello per decisione di Pico (#331 punto 1) e non esiste
// più in questo modulo. Ognuna ha una erede qui sotto — l'elenco dei rivali
// diventa l'elenco di chi ha un precedente, la riga di sintesi diventa la
// sintesi dei precedenti, la difesa contro l'iniezione di markup e quella
// contro l'output direttivo restano identiche nella forma nuova — più le
// asserzioni che il vecchio pannello non poteva avere: numerosità, serie per
// stagione, e il divieto di far comparire qualcuno per il solo tifo.
//
// `competitorSet()` resta coperto dai suoi test di motore
// (packages/engine/tests/competitors.test.ts), che non cambiano: la funzione
// non è cambiata, è cambiato chi la mostra.

const PRECEDENT_LABELS: Record<string, string> = {
  ac_vostra: "AC Vostra",
  ataturk: "Ataturk Sintetica",
  dinamo_flavietto: "Dinamo Sintetica",
  psg: "PSG Sintetica",
  torres_sintetica: "Torres Sintetica",
};

function precedents(overrides: Partial<Parameters<typeof auctionPrecedents>[0]> = {}) {
  return auctionPrecedents({
    called: SYNTHETIC_CALLED_PLAYER,
    history: syntheticAuctionHistory(),
    seats: PRECEDENT_SEATS_TO_PEOPLE,
    profiles: [CONFIRMED_PROFILE, SUPPORTER_WITHOUT_SPEND_PROFILE],
    ...overrides,
  });
}

describe("formatPercent / shortSeason / seasonsSpan", () => {
  it("stampa una quota come percentuale intera senza segno: la quota non ha direzione", () => {
    expect(formatPercent(0.6)).toBe("60%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.036)).toBe("4%");
    expect(formatPercent(Number.NaN)).toBe("n/d");
  });

  it("abbrevia la stagione solo nella serie, mai perdendo l'anno", () => {
    expect(shortSeason("2021/22")).toBe("21/22");
    expect(shortSeason("boh")).toBe("boh");
  });

  it("dichiara gli estremi dello storico invece di un numero nudo", () => {
    expect(seasonsSpan(["2021/22", "2022/23", "2025/26"])).toBe("3 stagioni (2021/22 → 2025/26)");
    expect(seasonsSpan(["2025/26"])).toBe("1 stagione (2025/26)");
    expect(seasonsSpan([])).toBe("nessuna stagione");
  });
});

describe("precedentMotive / precedentEvidence", () => {
  const facts = precedents().opponents.find((o) => o.fantaTeamId === "ataturk")!.facts;

  it("il motivo è sempre un GESTO al passato, mai un aggettivo sulla persona", () => {
    for (const fact of facts) {
      const motive = precedentMotive(fact);
      expect(motive).toMatch(/^(l'ha|ha) /);
      expect(motive).not.toMatch(/è un|tipo|carattere|aggressiv|tirchio|generoso/i);
    }
    expect(precedentMotive(facts[0]!)).toBe("l'ha ricomprato all'asta");
  });

  it("il riacquisto porta conteggio, prezzi, stagioni e i rinnovi che NON ha contato", () => {
    const evidence = precedentEvidence(facts[0]!);
    expect(evidence).toContain("2 volte");
    expect(evidence).toContain("80 cr nel 2022/23");
    expect(evidence).toContain("95 cr nel 2024/25");
    expect(evidence).toContain("misurato su 5 stagioni");
    // Il rinnovo è la PROVENIENZA del 2, non un terzo precedente.
    expect(evidence).toContain("1 rinnovo non contato");
  });

  it("ogni prova porta la propria numerosità: quante stagioni, e quante sopra soglia", () => {
    const club = facts.find((f) => f.id === "club")!;
    const evidence = precedentEvidence(club);
    expect(evidence).toContain("30% nel 2025/26");
    // La numerosità è il DENOMINATORE della frase — «su 5 misurate» — e non
    // una seconda cifra accanto: ripeterla costerebbe una riga di altezza e
    // direbbe lo stesso numero due volte.
    expect(evidence).toContain("3 stagioni su 5 misurate dal 15% in su");
    expect(club.seasonsMeasured).toBe(5);
  });

  it("una stagione sola si dice al singolare, non «1 stagioni»", () => {
    const single = precedents({
      history: syntheticAuctionHistory().filter((r) => r.season === "2025/26"),
    });
    expect(single.opponents.length).toBeGreaterThan(0);
    for (const opponent of single.opponents) {
      for (const fact of opponent.facts) {
        const evidence = precedentEvidence(fact);
        expect(evidence).not.toContain("1 stagioni");
        expect(evidence).toMatch(/1 stagione/);
      }
    }
  });
});

describe("opponentPrecedentsHeadline — i tre silenzi sono tre frasi diverse", () => {
  it("conta chi ha un precedente, su quanti avversari, e su quale storico", () => {
    const line = opponentPrecedentsHeadline(precedents());
    expect(line).toContain("3 avversari hanno un precedente d'asta su questo giocatore");
    expect(line).toContain("su 5 avversari esaminati");
    expect(line).toContain("Storico: 5 stagioni (2021/22 → 2025/26)");
    // Un posto senza persona è dichiarato: su di lui non esiste storico, e
    // tacerlo lo farebbe leggere come «non ha precedenti».
    expect(line).toContain("1 posto non ha una persona assegnata");
  });

  it("nessuno storico caricato: lo dice, e dice che non è «nessuno lo vuole»", () => {
    const line = opponentPrecedentsHeadline(precedents({ history: [] }));
    expect(line).toContain(OPPONENT_PRECEDENTS_NO_HISTORY);
    expect(line).toContain("non significa «nessuno lo vuole»");
  });

  it("nessun giocatore chiamato: nessun soggetto, e nessun elenco", () => {
    const reading = precedents({ called: null });
    expect(opponentPrecedentsHeadline(reading)).toBe(OPPONENT_PRECEDENTS_NO_CALL);
    expect(opponentPrecedentsHtml(reading, PRECEDENT_LABELS)).toBe("");
  });

  it("storico presente e nessun precedente: distinto dai due silenzi precedenti", () => {
    const reading = precedents({ called: { playerId: "sint-mai-visto", club: "Club Sintetico Z" } });
    const line = opponentPrecedentsHeadline(reading);
    expect(line).toContain("Nessun precedente d'asta su questo giocatore");
    expect(line).toContain("«lo storico non dice niente su di lui»");
    expect(line).not.toContain(OPPONENT_PRECEDENTS_NO_HISTORY);
    // Nessun contenitore vuoto accanto alla frase: sembrerebbe un elenco di
    // «nessuno», che è esattamente la lettura da evitare.
    expect(opponentPrecedentsHtml(reading, PRECEDENT_LABELS)).toBe("");
  });

  it("un avversario solo si dice al singolare", () => {
    const reading = precedents({
      history: syntheticAuctionHistory().filter((r) => r.personId.endsWith("0002")),
    });
    expect(opponentPrecedentsHeadline(reading)).toContain("1 avversario ha un precedente");
  });
});

describe("opponentPrecedentsHtml — motivo, prova e numerosità, per ogni avversario", () => {
  it("una riga per avversario, nell'ordine dichiarato dei tipi di fatto", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    const order = [
      ...html.matchAll(/class="opponent-precedents__row"\s+id="opponent-precedents-([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(order).toEqual(["ataturk", "dinamo_flavietto", "torres_sintetica"]);
    // L'etichetta di visualizzazione vince sull'id del posto.
    expect(html).toContain(">Ataturk Sintetica<");
  });

  it("ogni fatto porta il proprio motivo accanto alla propria prova", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    expect(html).toMatch(
      /id="opponent-precedents-ataturk-ricomprato"[\s\S]*?l'ha ricomprato all'asta[\s\S]*?2 volte/,
    );
    expect(html).toMatch(
      /id="opponent-precedents-dinamo_flavietto-club"[\s\S]*?ha speso su Club Sintetico A/,
    );
    expect(html).toMatch(
      /id="opponent-precedents-torres_sintetica-piu-cari"[\s\S]*?ha speso sui propri 3 più cari/,
    );
  });

  it("la serie per stagione è tutta lì: quattro alte e il crollo non si appiattiscono", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    const row = html.split(`id="opponent-precedents-dinamo_flavietto"`)[1]!.split("</li>\n    </ul>")[0]!;
    for (const [season, value] of [
      ["21/22", "40%"],
      ["22/23", "35%"],
      ["23/24", "30%"],
      ["24/25", "28%"],
      ["25/26", "0%"],
    ]) {
      expect(row).toContain(`<em>${season}</em>${value}`);
    }
  });

  it("un tratto che si regge sull'ultima stagione si legge come tale", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    expect(html).toMatch(
      /id="opponent-precedents-torres_sintetica-piu-cari"[\s\S]*?1 stagione su 5 misurate dal 50% in su/,
    );
  });

  it("la riga parla anche per chi non la vede: aria-label con tutto per esteso", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    const label = /id="opponent-precedents-dinamo_flavietto"[\s\S]*?aria-label="([^"]+)"/.exec(html)![1]!;
    expect(label).toContain("Dinamo Sintetica");
    expect(label).toContain("ha speso su Club Sintetico A");
    expect(label).toContain("Per stagione: 2021/22 40%");
    expect(label).toContain("2025/26 0%");
  });

  it("escapa un'etichetta invece di lasciarla arrivare al DOM come markup", () => {
    const html = opponentPrecedentsHtml(precedents(), {
      ...PRECEDENT_LABELS,
      ataturk: `<img src=x onerror="boom">`,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("il tifo non fa comparire nessuno, e non è il titolo di niente", () => {
  it("chi tifa il club del chiamato ma non ci ha speso non ha nemmeno una riga", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    // Persona 3 tifa il club A (profilo confermato) e ci ha speso il 3,6% e
    // poi lo 0%. La riga stessa sarebbe l'affermazione «lo vuole».
    expect(html).not.toContain("PSG Sintetica");
    expect(html).not.toContain(`id="opponent-precedents-psg"`);
  });

  it("dove la riga esiste già, il tifo è subordinato e porta la spesa misurata accanto", () => {
    const html = opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS);
    const row = html.split(`id="opponent-precedents-ataturk"`)[1]!.split(`id="opponent-precedents-dinamo`)[0]!;
    expect(row).toContain("tifo dichiarato");
    expect(row).toContain("Club Sintetico A");
    expect(row).toContain("spesa misurata su quel club: 30% nel 2025/26, su 5 stagioni");
    // …e la serie per stagione NON è ristampata: la riga porta già il fatto
    // `club`, con la stessa misura e le stesse stagioni, due righe sopra.
    expect(row.split("opponent-precedents__support")[1]).not.toContain(
      "opponent-precedents__series",
    );
    // E sta DOPO i fatti che hanno fatto nascere la riga, mai prima.
    expect(row.indexOf("opponent-precedents__support")).toBeGreaterThan(
      row.indexOf("opponent-precedents__facts"),
    );
  });
});

describe("la raggiungibilità per vincolo duro è uscita da questo modulo", () => {
  it("nessuna stringa del pannello parla più di slot, max bid o soglia raggiungibile", () => {
    const html =
      opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS) +
      opponentPrecedentsHeadline(precedents()) +
      OPPONENT_PRECEDENTS_TITLE +
      OPPONENT_PRECEDENTS_NO_CALL +
      OPPONENT_PRECEDENTS_NO_HISTORY;
    expect(html).not.toMatch(/può arrivar|arrivarci|max bid|slot liber|sotto la soglia|ruolo pieno|budget bloccato/i);
  });

  it("il modulo non esporta più i costruttori del vecchio pannello", async () => {
    const api = await import("./liveFacts.js");
    for (const gone of [
      "competitorReachHtml",
      "competitorReachHeadline",
      "competitorBlockerLabel",
      "competitorBlockerDetail",
      "OPPONENT_REACH_TITLE",
      "OPPONENT_REACH_NOTE",
      "OPPONENT_REACH_NO_ROLE",
    ]) {
      expect(Object.keys(api)).not.toContain(gone);
    }
  });
});

// ── The product boundary these blocks must never cross ─────────────────────

describe("no directive output reaches the live blocks", () => {
  const role: Role = "A";
  /** Ogni famiglia di parole che afferma un giudizio sulla persona invece di un gesto. */
  const PSYCHOLOGY =
    /punteggio|score|indice|intensit|classifica|aggressiv|big.?spender|tirchio|generoso|avido|probabil|prever|prevedibil/i;

  it("keeps every rendered string inside measured facts", () => {
    const pool: readonly PoolPlayer[] = [{ playerId: "a1", role, name: "Delta Sintetico" }];
    const html =
      momentScarcityHtml(roleScarcity(freshState(), pool), true, role) +
      marketPressureHtml(residualPressure(freshState())) +
      opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS) +
      opponentPrecedentsHeadline(precedents()) +
      MOMENT_FACTS_NOTE +
      OPPONENT_PRECEDENTS_NOTE +
      OPPONENT_PRECEDENTS_NO_CALL +
      OPPONENT_PRECEDENTS_NO_HISTORY;
    expect(html).not.toMatch(DIRECTIVE);
  });

  it("nessuna parola di punteggio, intensità o previsione su ciò che il pannello AFFERMA", () => {
    // Il divieto che governa questo pannello: fatti sì, giudizi sui caratteri
    // no. Una regressione che facesse entrare una di queste parole sarebbe una
    // violazione di prodotto, non un difetto di stile.
    //
    // La NOTA è deliberatamente fuori da questa misura, ed è l'unico posto in
    // cui quelle parole possono comparire: lì dichiarano ciò che il pannello
    // NON fa, e vietarle anche nella negazione significherebbe non poter più
    // scrivere «nessun punteggio». Il test qui sotto verifica che nella nota
    // ci stiano solo così.
    const html =
      opponentPrecedentsHtml(precedents(), PRECEDENT_LABELS) +
      opponentPrecedentsHeadline(precedents()) +
      OPPONENT_PRECEDENTS_TITLE +
      OPPONENT_PRECEDENTS_NO_CALL +
      OPPONENT_PRECEDENTS_NO_HISTORY;
    expect(html).not.toMatch(PSYCHOLOGY);
  });

  it("nella nota quelle parole compaiono solo negate, mai come qualcosa che il pannello offre", () => {
    for (const match of OPPONENT_PRECEDENTS_NOTE.match(new RegExp(PSYCHOLOGY, "gi")) ?? []) {
      expect(OPPONENT_PRECEDENTS_NOTE).toMatch(
        new RegExp(`(nessun|nessuna|non)[^.]{0,40}${match}`, "i"),
      );
    }
  });

  it("la nota dichiara la provenienza, i rinnovi esclusi e il limite del tifo", () => {
    expect(OPPONENT_PRECEDENTS_NOTE).toContain("gesti già compiuti");
    expect(OPPONENT_PRECEDENTS_NOTE).toContain("storico d'asta");
    expect(OPPONENT_PRECEDENTS_NOTE).toContain("rinnovare non è ricomprare");
    expect(OPPONENT_PRECEDENTS_NOTE).toContain("tifare una squadra non è averci speso");
    expect(OPPONENT_PRECEDENTS_NOTE).toContain("il giudizio è tuo");
  });

  it("il titolo nomina ciò che il pannello contiene, non l'intenzione che non misura", () => {
    // Stessa regola che aveva già portato via «AVVERSARI — INTERESSE SUL
    // GIOCATORE»: il titolo non afferma ciò che nessun calcolo dietro di lui
    // produce, e la nota sotto non deve essere la smentita della propria
    // intestazione. Il mestiere del pannello è rispondere a «chi lo vuole»;
    // il suo contenuto sono precedenti, ed è quello che il titolo dice.
    expect(OPPONENT_PRECEDENTS_TITLE).toBe("AVVERSARI: I PRECEDENTI");
    expect(OPPONENT_PRECEDENTS_TITLE).not.toMatch(/vuole|interess|arrivarci/i);
    expect(OPPONENT_PRECEDENTS_TITLE).toMatch(/^AVVERSARI/);
    // Più corto del titolo che sostituisce, che a 390px stava su una riga
    // sola con 2px di margine misurati: non può traboccare dove quello non
    // traboccava.
    expect(OPPONENT_PRECEDENTS_TITLE.length).toBeLessThan("AVVERSARI: CHI PUÒ ARRIVARCI".length);
  });

  it("le soglie in vigore viaggiano nell'esito, ispezionabili accanto al numero che filtrano", () => {
    expect(precedents().thresholds).toEqual(DEFAULT_PRECEDENT_THRESHOLDS);
  });

  it("states the two provenances of the moment block", () => {
    expect(MOMENT_FACTS_NOTE).toContain("derivata dal log dell'asta");
    expect(MOMENT_FACTS_NOTE).toContain("listone caricato");
    expect(MOMENT_FACTS_NOTE).toContain("nessun dato di modello");
  });
});
