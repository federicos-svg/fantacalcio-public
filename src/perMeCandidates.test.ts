// Test del sottoblocco «PER ME» — logica pura, nessun DOM e nessuno storage,
// come postPurchaseProjection.test.ts e baitCandidates.test.ts (postura
// no-jsdom di questo repo). Gli stati di squadra non sono scritti a mano: si
// derivano da `reduce()` su acquisti passati da `recordPurchase`, quindi ogni
// numero atteso qui sotto è lo stesso numero che l'app vede a schermo.
//
// LA PROVA CHE QUESTO FILE ESISTE PER TENERE IN PIEDI è §"selezione avversa":
// la strada precedente moriva lì. Sostituire il valore ASSOLUTO al valore per
// me nella sottrazione `valore − ancora` la rende monotona decrescente nel
// prezzo — la base assoluta è piatta per ruolo — e il radar finirebbe per
// ordinare dal più economico, cioè dal peggiore. Qui c'è uno stato costruito
// apposta perché quella sottrazione, se qualcuno la reintroducesse, metterebbe
// in cima il giocatore peggiore e più economico del ruolo; il test pinna che
// questo box lo mette IN FONDO.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { FANTA_TEAM_IDS } from "../packages/engine/fixtures/synthetic.js";
import { maxSafe } from "../packages/engine/src/auction.js";
import { UNRATIFIED_CHOICES } from "../packages/engine/src/declaredValues.js";
import { recordPurchase } from "../packages/engine/src/feasibility.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { ROLES, type AuctionEvent, type Role } from "../packages/engine/src/types.js";
import {
  PER_ME_PARAMETERS,
  PER_ME_ROWS_MAX,
  PER_ME_UNRATIFIED_CHOICES,
  perMeAnchorCacheStats,
  perMeCandidates,
  perMeShownCandidates,
  resetPerMeAnchorCache,
  type PerMeReading,
} from "./perMeCandidates.js";
import type { RolePlanDraft } from "./rolePlan.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";

const TEAMS = FANTA_TEAM_IDS;
const ME = "psg";
const RIVAL = "ataturk";
const TS = "2026-08-01T12:00:00Z";
const RECIPE = "TEST-APPEAL-RECIPE@1.0.0";

/** Una riga di listone sintetica. `score` assente = la riga non porta indice. */
function row(
  name: string,
  role: Role,
  club: string,
  quotation: number | undefined,
  score?: number,
): ListonePlayer {
  const base = { name, role, club, ...(quotation === undefined ? {} : { quotation }) };
  if (score === undefined) return base;
  return {
    ...base,
    appealIndex: {
      score,
      quality: "sintetico — fixture di test",
      recipe: RECIPE,
      components: { base: score },
    },
  };
}

const key = (p: ListonePlayer): string => listonePlayerKey(p);

/** Il piano DICHIARATO per intero: quattro target più la versione. */
const FULL_PLAN: RolePlanDraft = {
  planVersion: "test-1",
  targets: { P: 20, D: 80, C: 140, A: 210 },
};

function logAfter(
  purchases: readonly { playerId: string; role: Role; fantaTeamId: string; price: number }[],
): readonly AuctionEvent[] {
  let log: readonly AuctionEvent[] = [];
  for (const p of purchases) log = recordPurchase(log, reduce(log, TEAMS), p, TS);
  return log;
}

interface ReadOptions {
  readonly log?: readonly AuctionEvent[];
  readonly planDraft?: RolePlanDraft | null;
}

function read(pool: readonly ListonePlayer[], options: ReadOptions = {}): PerMeReading {
  const log = options.log ?? [];
  return perMeCandidates({
    pool,
    source: "remote",
    state: reduce(log, TEAMS),
    log,
    selfId: ME,
    planDraft: options.planDraft === undefined ? FULL_PLAN : options.planDraft,
  });
}

const ids = (reading: PerMeReading): readonly string[] =>
  reading.kind === "candidates" ? reading.candidates.map((c) => c.playerId) : [];

// ─── La scena principale ─────────────────────────────────────────────────────
//
// Quattro liberi, tre attaccanti e un difensore, tutti con Qt.A e indice.
// A rosa vuota ogni reparto è aperto e `maxSafe` vale 473, quindi nessuno esce
// per budget: quello che resta a decidere è solo l'ordine.

const A_FORTE = row("Attaccante Forte", "A", "Alfa", 60, 90);
const A_MEDIO = row("Attaccante Medio", "A", "Alfa", 40, 80);
const A_SCARSO = row("Attaccante Scarso", "A", "Beta", 2, 10);
const D_FORTE = row("Difensore Forte", "D", "Gamma", 30, 70);
const SCENE: readonly ListonePlayer[] = [A_FORTE, A_MEDIO, A_SCARSO, D_FORTE];

describe("perMeCandidates — l'ordine dichiarato", () => {
  it("ordina per piano, poi posizione di appetibilità, poi ancora, poi chiave", () => {
    const reading = read(SCENE);
    expect(reading.kind).toBe("candidates");
    // A parità di posizione (entrambi primi del proprio ruolo) decide l'ancora
    // DECRESCENTE: l'attaccante da 60 prima del difensore da 30.
    expect(ids(reading)).toEqual([key(A_FORTE), key(D_FORTE), key(A_MEDIO), key(A_SCARSO)]);
  });

  it("la posizione è quella dell'ordine di appetibilità del RUOLO, non del listone", () => {
    const reading = read(SCENE);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const byId = new Map(reading.candidates.map((c) => [c.playerId, c]));
    expect(byId.get(key(A_FORTE))!.appealPosition).toBe(1);
    expect(byId.get(key(A_MEDIO))!.appealPosition).toBe(2);
    expect(byId.get(key(A_SCARSO))!.appealPosition).toBe(3);
    expect(byId.get(key(A_FORTE))!.appealOrderSize).toBe(3);
    // Il difensore è PRIMO del suo ruolo pur essendo quarto per punteggio: è la
    // prova che l'ordine è per ruolo e non globale.
    expect(byId.get(key(D_FORTE))!.appealPosition).toBe(1);
    expect(byId.get(key(D_FORTE))!.appealOrderSize).toBe(1);
  });

  it("«dentro il piano» viene PRIMA della posizione di appetibilità", () => {
    // L'allocazione viva del reparto A è 210 cr su 7 slot: `fitsPlan` lascia
    // passare fino a 204 cr (204 + 6 slot al floor = 210). 300 cr sfora il
    // piano ma resta comprabile — `maxSafe` a rosa vuota vale 473.
    const caro = row("Attaccante Caro", "A", "Alfa", 300, 99);
    const modesto = row("Attaccante Modesto", "A", "Alfa", 20, 30);
    const reading = read([caro, modesto]);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates[0]!.playerId).toBe(key(modesto));
    expect(reading.candidates[0]!.withinRolePlan).toBe(true);
    expect(reading.candidates[1]!.playerId).toBe(key(caro));
    expect(reading.candidates[1]!.withinRolePlan).toBe(false);
    // …e il caro ha davvero la posizione migliore: senza questo, «il piano
    // viene prima» sarebbe vero per caso.
    expect(reading.candidates[1]!.appealPosition).toBe(1);
    expect(reading.candidates[0]!.appealPosition).toBe(2);
  });

  it("una riga senza verdetto di appetibilità resta DOPO quelle che ne hanno uno", () => {
    const senza = row("Attaccante Ignoto", "A", "Delta", 55);
    const reading = read([...SCENE, senza]);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates[reading.candidates.length - 1]!.playerId).toBe(key(senza));
    expect(reading.candidates[reading.candidates.length - 1]!.appealPosition).toBeNull();
    expect(reading.withoutAppealPosition).toBe(1);
    // `null` non è zero e non è l'ultima posizione: se lo fosse, un'ancora da
    // 55 lo porterebbe davanti all'attaccante da 40 al criterio 3.
    expect(ids(reading)).toEqual([
      key(A_FORTE),
      key(D_FORTE),
      key(A_MEDIO),
      key(A_SCARSO),
      key(senza),
    ]);
  });

  it("l'ordine è totale e stabile: stesso input, stessa lista", () => {
    expect(ids(read(SCENE))).toEqual(ids(read([...SCENE].reverse())));
  });

  it("a parità di tutto decide la chiave di listone, crescente", () => {
    const primo = row("Alfa Uno", "C", "Zeta", 10, 50);
    const secondo = row("Beta Due", "C", "Zeta", 10, 50);
    // Stesso punteggio: `buildRoleAppealOrder` rompe il pareggio col proprio
    // criterio, quindi le posizioni restano distinte; l'asserzione che conta è
    // che l'ordine non dipenda dall'ordine di ingresso.
    expect(ids(read([primo, secondo]))).toEqual(ids(read([secondo, primo])));
  });
});

describe("perMeCandidates — selezione avversa: la guardia", () => {
  // Lo stato è costruito perché la sottrazione CADUTA metterebbe in cima il
  // peggiore. Il valore assoluto del ruolo A è piatto (una sola cifra per
  // tutti gli attaccanti): con `base − ancora`, l'attaccante da 2 cr avrebbe il
  // surplus più grande di tutti e i due da 40 e 60 cr sarebbero addirittura
  // esclusi (surplus negativo). Il box mostrerebbe UNA riga sola, la peggiore,
  // col badge OCCASIONE sopra. Nessuna aritmetica di quella forma compare in
  // questo file, nemmeno nel test: si asserisce dove finisce la riga.
  it("il giocatore peggiore e più economico del ruolo NON finisce in cima", () => {
    const reading = read(SCENE);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const cheapest = [...reading.candidates].sort(
      (a, b) => a.anchor.correctedAnchor - b.anchor.correctedAnchor,
    )[0]!;
    expect(cheapest.playerId).toBe(key(A_SCARSO));
    expect(reading.candidates[0]!.playerId).not.toBe(cheapest.playerId);
    // Non «non in cima» e basta: è ULTIMO, e resta fuori dalle righe mostrate.
    expect(reading.candidates[reading.candidates.length - 1]!.playerId).toBe(cheapest.playerId);
    expect(perMeShownCandidates(reading).map((c) => c.playerId)).not.toContain(cheapest.playerId);
  });

  it("anche SENZA nessun indice di appetibilità il più economico resta ultimo", () => {
    // Il criterio 2 non ha verdetto per nessuno: decide il criterio 3, che è
    // l'ancora DECRESCENTE. Il verso di quel criterio è ciò che tiene in piedi
    // la guardia quando l'indice non c'è.
    const nudi = SCENE.map((p) => row(p.name, p.role, p.club, p.quotation));
    const reading = read(nudi);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.withoutAppealPosition).toBe(4);
    expect(reading.candidates.map((c) => c.anchor.correctedAnchor)).toEqual([60, 40, 30, 2]);
    expect(reading.candidates[reading.candidates.length - 1]!.playerId).toBe(key(A_SCARSO));
  });

  it("nel sorgente non esiste nessuna sottrazione valore−prezzo, in nessuna forma", () => {
    // Guardia di SORGENTE, non di comportamento: un ordine si può cambiare
    // senza rompere nessuna asserzione sui numeri, ma non si può reintrodurre
    // il valore in questa via senza scriverne il nome.
    const src = stripCommentsAndStrings(
      readFileSync(new URL("./perMeCandidates.ts", import.meta.url), "utf8"),
    );
    for (const forbidden of ["declaredValue", "absoluteValue", "surplus", "ALPHA_BY_PROFILE"]) {
      expect(src, `«${forbidden}» è tornato nella via del sottoblocco`).not.toContain(forbidden);
    }
  });
});

/** Toglie commenti e stringhe: dentro un commento «surplus» è una spiegazione,
 *  non un ingrediente. Stessa funzione di packages/engine/tests/engine.test.ts. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

describe("perMeCandidates — i cancelli di ammissione", () => {
  it("un giocatore già venduto non è un candidato", () => {
    const log = logAfter([
      { playerId: key(A_FORTE), role: "A", fantaTeamId: RIVAL, price: 50 },
    ]);
    expect(ids(read(SCENE, { log }))).not.toContain(key(A_FORTE));
  });

  it("un'ancora sopra il mio max bid esclude il candidato, e lo dice", () => {
    const team = reduce([], TEAMS).teams[ME]!;
    expect(maxSafe(team, "A").maxSafe).toBe(473);
    const irraggiungibile = row("Attaccante Proibitivo", "A", "Alfa", 500, 99);
    const reading = read([irraggiungibile]);
    expect(reading.kind === "empty" && reading.reason).toBe("no-affordable");
    expect(reading.evaluated).toBe(0);
  });

  it("un candidato al limite esatto del max bid entra", () => {
    const alLimite = row("Attaccante Limite", "A", "Alfa", 473, 99);
    const reading = read([alLimite]);
    expect(reading.kind).toBe("candidates");
    expect(reading.kind === "candidates" && reading.candidates[0]!.maxBid).toBe(473);
  });

  it("un reparto pieno toglie tutti i suoi giocatori, non solo qualcuno", () => {
    const sette: { playerId: string; role: Role; fantaTeamId: string; price: number }[] = [];
    for (let i = 1; i <= 7; i += 1) {
      sette.push({ playerId: `riempi-a-${i}`, role: "A", fantaTeamId: ME, price: 1 });
    }
    const log = logAfter(sette);
    const reading = read(SCENE, { log });
    expect(ids(reading)).toEqual([key(D_FORTE)]);
  });

  it("`maxSafe` è INTERROGATA e riportata, non riderivata", () => {
    const reading = read(SCENE);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const team = reduce([], TEAMS).teams[ME]!;
    for (const c of reading.candidates) {
      expect(c.maxBid).toBe(maxSafe(team, c.role).maxSafe);
    }
  });
});

describe("perMeCandidates — i nove silenzi, uno per uno", () => {
  it("no-pool", () => {
    const reading = read([]);
    expect(reading.kind === "empty" && reading.reason).toBe("no-pool");
  });

  it("no-quotation — una riga senza Qt.A non diventa zero", () => {
    const reading = read([row("Senza Quota", "A", "Alfa", undefined, 90)]);
    expect(reading.kind === "empty" && reading.reason).toBe("no-quotation");
  });

  it("anchors-refused — due righe con la stessa identità, col motivo del motore", () => {
    const doppio = row("Attaccante Forte", "A", "Alfa", 60, 90);
    const reading = read([A_FORTE, doppio]);
    expect(reading.kind === "empty" && reading.reason).toBe("anchors-refused");
    expect(reading.kind === "empty" && reading.detail).toContain("duplicate-player");
  });

  it("plan-absent", () => {
    const reading = read(SCENE, { planDraft: null });
    expect(reading.kind === "empty" && reading.reason).toBe("plan-absent");
  });

  it("plan-incomplete — e dice QUALI buchi", () => {
    const reading = read(SCENE, { planDraft: { planVersion: "x", targets: { P: 20 } } });
    expect(reading.kind === "empty" && reading.reason).toBe("plan-incomplete");
    expect(reading.kind === "empty" && reading.detail).toContain("role-undeclared");
  });

  it("plan-invalid — il motivo è del motore, non una diagnosi locale", () => {
    const reading = read(SCENE, {
      planDraft: { planVersion: "x", targets: { P: 200, D: 200, C: 200, A: 200 } },
    });
    expect(reading.kind === "empty" && reading.reason).toBe("plan-invalid");
    expect(reading.kind === "empty" && reading.detail).toContain(
      "total-exceeds-initial-budget",
    );
  });

  it("no-open-role — con tutti e quattro i reparti pieni", () => {
    const tutti: { playerId: string; role: Role; fantaTeamId: string; price: number }[] = [];
    for (const role of ROLES) {
      const slots = reduce([], TEAMS).teams[ME]!.slotsRemaining[role];
      for (let i = 1; i <= slots; i += 1) {
        tutti.push({ playerId: `riempi-${role}-${i}`, role, fantaTeamId: ME, price: 1 });
      }
    }
    const log = logAfter(tutti);
    expect(reduce(log, TEAMS).teams[ME]!.totalSlotsRemaining).toBe(0);
    const reading = read(SCENE, { log });
    expect(reading.kind === "empty" && reading.reason).toBe("no-open-role");
  });

  it("no-free-in-open-roles — c'è il listone, ma nei miei reparti aperti non resta nessuno", () => {
    const solo = row("Attaccante Unico", "A", "Alfa", 30, 90);
    const log = logAfter([{ playerId: key(solo), role: "A", fantaTeamId: RIVAL, price: 30 }]);
    const reading = read([solo], { log });
    expect(reading.kind === "empty" && reading.reason).toBe("no-free-in-open-roles");
  });

  it("no-affordable — ci sono liberi, ma nessuno che io possa pagare", () => {
    const reading = read([row("Attaccante Proibitivo", "A", "Alfa", 500, 99)]);
    expect(reading.kind === "empty" && reading.reason).toBe("no-affordable");
  });

  it("i nove motivi sono nove stringhe distinte", () => {
    const reasons = [
      "no-pool",
      "no-quotation",
      "anchors-refused",
      "plan-absent",
      "plan-incomplete",
      "plan-invalid",
      "no-open-role",
      "no-free-in-open-roles",
      "no-affordable",
    ] as const;
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

describe("perMeCandidates — l'ancora si mostra e non si sottrae", () => {
  it("a log vuoto l'ancora è in cold start e lo dichiara", () => {
    const reading = read(SCENE);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const a = reading.candidates[0]!.anchor;
    expect(a.coldStart).toBe(true);
    expect(a.inflationApplied).toBeNull();
    expect(a.basis).toBe("none");
    expect(a.correctedAnchor).toBe(60);
    expect(a.baseAnchor).toBe(60);
  });

  it("con un campione sufficiente l'ancora è corretta dall'inflazione MISURATA", () => {
    // Cinque acquisti di ruolo A pagati il doppio della Qt.A: il campione
    // minimo dichiarato è 5, quindi la misura vale e l'ancora la applica.
    const venduti = [1, 2, 3, 4, 5].map((i) => row(`Sacrificabile ${i}`, "A", "Alfa", 10, 50));
    const log = logAfter(
      venduti.map((p, i) => ({
        playerId: key(p),
        role: "A" as Role,
        fantaTeamId: TEAMS[i]!,
        price: 20,
      })),
    );
    const reading = read([...venduti, A_MEDIO], { log });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const c = reading.candidates[0]!;
    expect(c.playerId).toBe(key(A_MEDIO));
    expect(c.anchor.basis).toBe("role-inflation");
    expect(c.anchor.inflationApplied).toBe(1);
    expect(c.anchor.n).toBe(5);
    expect(c.anchor.baseAnchor).toBe(40);
    expect(c.anchor.correctedAnchor).toBe(80); // 40 x (1 + 1)
  });
});

describe("perMeCandidates — i parametri e la ratifica viaggiano nel dato", () => {
  it("il tetto delle righe è dichiarato provvisorio e tronca davvero", () => {
    const reading = read(SCENE);
    expect(reading.parameters.rowsMax).toBe(PER_ME_ROWS_MAX);
    expect(reading.parameters.rowsMaxStatus).toContain("provvisorio");
    expect(perMeShownCandidates(reading)).toHaveLength(3);
    expect(reading.kind === "candidates" && reading.candidates).toHaveLength(4);
  });

  it("ogni lettura porta le DUE scelte non ratificate, e nessuna è firmata", () => {
    for (const reading of [read(SCENE), read([])]) {
      expect(reading.ratification.ratified).toBe(false);
      expect(reading.ratification.unratifiedChoices).toEqual(PER_ME_UNRATIFIED_CHOICES);
    }
    // Il vocabolario del motore le conosce entrambe e per ognuna c'è un MOTIVO
    // scritto: un identificatore senza motivo sarebbe una scelta nascosta con
    // un nome sopra. Questo test la DOCUMENTA, non la approva.
    expect(PER_ME_UNRATIFIED_CHOICES).toEqual([
      "PER_ME_ORDER_APPEAL_REPLACES_SURPLUS",
      "PER_ME_REQUIRES_COMPLETE_ROLE_PLAN",
    ]);
    for (const id of PER_ME_UNRATIFIED_CHOICES) {
      expect(UNRATIFIED_CHOICES[id].length).toBeGreaterThan(0);
    }
  });

  it("il campione minimo è quello del motore, copiato e non scelto qui", () => {
    expect(PER_ME_PARAMETERS.minInflationSample).toBe(5);
  });

  it("la lettura porta la versione del piano che l'ha prodotta", () => {
    const reading = read(SCENE);
    expect(reading.kind === "candidates" && reading.planVersion).toBe("test-1");
  });
});

describe("perMeCandidates — il costo", () => {
  beforeEach(() => {
    resetPerMeAnchorCache();
  });

  it("un tasto nella ricerca non ricostruisce il listino delle ancore", () => {
    read(SCENE);
    expect(perMeAnchorCacheStats()).toEqual({ builds: 1, hits: 0 });
    read(SCENE);
    read(SCENE);
    expect(perMeAnchorCacheStats()).toEqual({ builds: 1, hits: 2 });
  });

  it("un listone SOSTITUITO fa scadere la voce", () => {
    read(SCENE);
    read([...SCENE]);
    expect(perMeAnchorCacheStats()).toEqual({ builds: 2, hits: 0 });
  });

  it("la voce conservata è la stessa lettura, non una lettura simile", () => {
    const first = read(SCENE);
    const second = read(SCENE);
    expect(ids(second)).toEqual(ids(first));
    expect(perMeAnchorCacheStats().hits).toBe(1);
  });
});
