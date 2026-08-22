// Test delle PAROLE del pannello piano rosa. Costruttori di sole stringhe,
// nessun DOM: stesso idioma di ./roleDepletion.test.ts e ./theme.test.ts.
//
// QUI SI VIGILA LA RESA, non il calcolo. Il calcolo è coperto da
// ../rolePlan.test.ts; questa suite tiene la promessa che i due silenzi non si
// confondano NEL TESTO che finisce a schermo — perché un dato tenuto distinto
// nel modello e poi stampato uguale è, per chi guarda, un dato confuso.

import { describe, expect, it } from "vitest";
import { reduce } from "../../packages/engine/src/reduce.js";
import { recordPurchase } from "../../packages/engine/src/feasibility.js";
import { FANTA_TEAM_IDS } from "../../packages/engine/fixtures/synthetic.js";
import type { AuctionEvent, Role, TeamState } from "../../packages/engine/src/types.js";
import type { LivePlan } from "../../packages/engine/src/livePlan.js";
import { EMPTY_ROLE_PLAN_DRAFT, rolePlanReading, type RolePlanDraft, type RolePlanRow } from "../rolePlan.js";
import {
  CREDITS,
  NO_PLAN_NUMBERS,
  ROLE_PLAN_CLEARED_ANNOUNCE,
  ROLE_PLAN_CLEAR_LABEL,
  ROLE_PLAN_NOTE,
  ROLE_PLAN_TITLE,
  TARGET_UNDECLARED,
  declaredTotalText,
  gapText,
  planStateText,
  planTotalsText,
  rolePlanCardHtml,
  rolePlanGridHtml,
  targetFieldLabel,
  targetText,
} from "./rolePlan.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T12:00:00Z";
const ME = "psg";

const freshTeam = (): TeamState => reduce([], TEAMS).teams[ME]!;

function teamAfter(
  purchases: readonly { playerId: string; role: Role; fantaTeamId: string; price: number }[],
): TeamState {
  let log: readonly AuctionEvent[] = [];
  for (const p of purchases) log = recordPurchase(log, reduce(log, TEAMS), p, TS);
  return reduce(log, TEAMS).teams[ME]!;
}

const draft = (targets: Partial<Record<Role, number>>, planVersion = "pre-asta 1"): RolePlanDraft => ({
  planVersion,
  targets,
});

const rowsOf = (team: TeamState, d: RolePlanDraft | null): readonly RolePlanRow[] =>
  rolePlanReading(team, d).rows;

const rowFor = (team: TeamState, d: RolePlanDraft | null, role: Role): RolePlanRow =>
  rowsOf(team, d).find((r) => r.role === role)!;

/** Il testo della cella target di una scheda, isolato dal resto del markup:
 *  è LÌ che i due silenzi devono restare distinti, non nella scheda intera
 *  (che porta anche slot e riserva, e quindi cifre di tutt'altra natura). */
function targetCell(html: string): string {
  const match = /<span class="role-plan__target">([\s\S]*?)<\/span>\s*<span class="role-plan__facts">/.exec(html);
  if (match === null) throw new Error("cella target non trovata");
  return match[1]!.replace(/<[^>]+>/g, "");
}

describe("targetText — «non dichiarato» non è «0 cr»", () => {
  it("il ruolo non dichiarato si scrive a parole, e quelle parole non contengono cifre", () => {
    const row = rowFor(freshTeam(), draft({ D: 80, C: 140, A: 210 }), "P");
    expect(targetText(row)).toBe(TARGET_UNDECLARED);
    expect(targetText(row)).not.toMatch(/\d/);
  });

  it("il ruolo dichiarato a zero si scrive come un target: «0 cr»", () => {
    const row = rowFor(freshTeam(), draft({ P: 0, D: 80, C: 140, A: 210 }), "P");
    expect(targetText(row)).toBe(`0 ${CREDITS}`);
  });

  it("le due rese sono diverse, e nessuna delle due contiene l'altra", () => {
    const team = freshTeam();
    const undeclared = targetText(rowFor(team, draft({ D: 80, C: 140, A: 210 }), "P"));
    const zero = targetText(rowFor(team, draft({ P: 0, D: 80, C: 140, A: 210 }), "P"));
    expect(undeclared).not.toBe(zero);
    expect(undeclared.includes(zero)).toBe(false);
    expect(zero.includes(undeclared)).toBe(false);
  });

  it("un piano assente non fa comparire nessun target a schermo", () => {
    for (const row of rowsOf(freshTeam(), null)) {
      expect(targetText(row)).toBe(TARGET_UNDECLARED);
    }
  });
});

describe("rolePlanCardHtml — la scheda di ruolo", () => {
  it("la cella target del ruolo non dichiarato porta le parole e nessuna cifra", () => {
    const html = rolePlanCardHtml(rowFor(freshTeam(), draft({ D: 80, C: 140, A: 210 }), "P"));
    expect(targetCell(html)).toContain(TARGET_UNDECLARED);
    expect(targetCell(html)).not.toMatch(/\d/);
  });

  it("la cella target del ruolo dichiarato a zero porta la cifra, non le parole", () => {
    const html = rolePlanCardHtml(rowFor(freshTeam(), draft({ P: 0, D: 80, C: 140, A: 210 }), "P"));
    expect(targetCell(html)).toContain(`0 ${CREDITS}`);
    expect(targetCell(html)).not.toContain(TARGET_UNDECLARED);
  });

  it("senza numeri di piano la scheda dice PERCHÉ non ci sono, invece di lasciare un buco", () => {
    const html = rolePlanCardHtml(rowFor(freshTeam(), null, "P"));
    expect(html).toContain(NO_PLAN_NUMBERS);
    expect(html).not.toContain("allocazione viva");
    expect(html).not.toContain("scostamento");
  });

  it("con un piano vivo la scheda porta speso, residuo, scostamento e allocazione", () => {
    const team = teamAfter([{ playerId: "a1", role: "A", fantaTeamId: ME, price: 90 }]);
    const html = rolePlanCardHtml(rowFor(team, draft({ P: 20, D: 80, C: 140, A: 210 }), "A"));
    expect(html).toContain("speso");
    expect(html).toContain(`90 ${CREDITS}`);
    expect(html).toContain("residuo di piano");
    expect(html).toContain("scostamento");
    expect(html).toContain("allocazione viva");
    expect(html).not.toContain(NO_PLAN_NUMBERS);
  });

  it("i fatti misurati ci sono anche senza piano: il pannello non tace su ciò che sa", () => {
    const html = rolePlanCardHtml(rowFor(freshTeam(), null, "P"));
    expect(html).toContain("slot");
    expect(html).toContain("riserva");
  });

  it("lo scostamento sopra il piano è UNA PAROLA più una cifra, mai il solo colore", () => {
    const team = teamAfter([{ playerId: "a1", role: "A", fantaTeamId: ME, price: 240 }]);
    const html = rolePlanCardHtml(rowFor(team, draft({ P: 20, D: 80, C: 140, A: 210 }), "A"));
    expect(html).toContain("SOPRA PIANO");
    expect(html).toContain(`+30 ${CREDITS}`);
  });

  it("nessuna pastiglia di scostamento quando il piano regge", () => {
    const html = rolePlanCardHtml(rowFor(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }), "A"));
    expect(html).not.toContain("SOPRA PIANO");
  });

  it("la griglia rende tutte e quattro le schede, ciascuna col proprio id", () => {
    const html = rolePlanGridHtml(rowsOf(freshTeam(), null));
    for (const role of ["P", "D", "C", "A"]) expect(html).toContain(`id="role-plan-${role}"`);
  });
});

describe("planStateText — la frase onesta di apertura", () => {
  it("piano assente: dice che non c'è, e che il sistema non ne propone uno", () => {
    const text = planStateText(rolePlanReading(freshTeam(), null));
    expect(text).toContain("Nessun piano dichiarato");
    expect(text).toContain("non ne propone");
  });

  it("piano incompleto: nomina i ruoli che mancano e nega la confusione con lo zero", () => {
    const text = planStateText(rolePlanReading(freshTeam(), draft({ D: 80, C: 140, A: 210 })));
    expect(text).toContain("Piano incompleto");
    expect(text).toContain("Portieri");
    expect(text).toContain("NON è un ruolo a zero");
  });

  it("versione mancante: è un buco nominato, non un piano battezzato dall'app", () => {
    const text = planStateText(rolePlanReading(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }, "")));
    expect(text).toContain("manca la versione del piano");
  });

  it("piano rifiutato: si riporta la violazione del motore, non una correzione", () => {
    const text = planStateText(rolePlanReading(freshTeam(), draft({ P: 100, D: 100, C: 200, A: 200 })));
    expect(text).toContain("Piano rifiutato dal motore");
    expect(text).toContain("supera la dotazione iniziale");
  });

  it("piano vivo: cita la versione usata (§4.1) e la base della ripartizione", () => {
    const text = planStateText(rolePlanReading(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }, "7")));
    expect(text).toContain("Piano dichiarato «7»");
    expect(text).toContain("in proporzione ai tuoi target residui");
  });
});

describe("planTotalsText — fattibilità e budget libero vero", () => {
  it("a rosa fresca la rosa è completabile e il budget libero è ciò che il piano non impegna", () => {
    const reading = rolePlanReading(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }));
    if (reading.kind !== "live") throw new Error("ramo atteso");
    const lines = planTotalsText(reading.live);
    expect(lines.join(" ")).toContain("Rosa completabile");
    expect(lines.join(" ")).toContain(`Budget libero vero: 50 ${CREDITS}`);
  });

  // I DUE RAMI DIFENSIVI, provati sul COSTRUTTORE DI STRINGHE e non su uno
  // stato d'asta: `recordPurchase()` rifiuta per `breaks-hard-reserve` ogni
  // acquisto che renderebbe la rosa non completabile (verificato: l'acquisto a
  // 490 lancia), quindi `isCompletable === false` non è raggiungibile per la
  // via normale. Restano raggiungibili per altre vie (riconferme, log
  // importati) e il contratto del motore li dichiara entrambi, quindi le loro
  // parole devono esistere ed essere giuste. Il `LivePlan` qui sotto è un
  // letterale sintetico: si sta verificando che cosa SI DICE di quei campi, non
  // che il motore li produca — quello è coperto dai test del motore.
  const healthy = rolePlanReading(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }));
  if (healthy.kind !== "live") throw new Error("fixture attesa: piano vivo");
  const overdrawn: LivePlan = {
    ...healthy.live,
    budgetResidual: 10,
    totalReserve: 27,
    isCompletable: false,
    budgetShortfall: 17,
    freedByClosedRoles: 0,
    unallocated: -17,
    overCommitted: true,
  };

  it("uno scoperto si dice scoperto e non viene troncato a zero", () => {
    const joined = planTotalsText(overdrawn).join(" ");
    expect(joined).toContain("ROSA NON COMPLETABILE");
    expect(joined).toContain("mancano 17 cr");
    expect(joined).toContain("Scoperto: -17 cr");
    expect(joined).not.toContain("Budget libero vero");
  });

  it("un piano compresso lo dichiara a parole, invece di rompersi in silenzio", () => {
    expect(planTotalsText(overdrawn).join(" ")).toContain("PIANO COMPRESSO");
  });

  it("i crediti liberati da un ruolo chiuso compaiono solo quando ce ne sono", () => {
    expect(planTotalsText({ ...overdrawn, freedByClosedRoles: 0 }).join(" ")).not.toContain("Crediti liberati");
    expect(planTotalsText({ ...overdrawn, freedByClosedRoles: 12 }).join(" ")).toContain("Crediti liberati dai ruoli chiusi");
  });
});

describe("etichette e nota", () => {
  it("il titolo nomina le tre grandezze del pannello", () => {
    expect(ROLE_PLAN_TITLE).toContain("TARGET");
    expect(ROLE_PLAN_TITLE).toContain("RISERVE");
    expect(ROLE_PLAN_TITLE).toContain("SCOSTAMENTO");
  });

  it("la nota nega esplicitamente ogni output direttivo", () => {
    for (const forbidden of ["Nessun valore", "nessun prezzo consigliato", "nessuna banda obiettivo", "nessun suggerimento di acquisto"]) {
      expect(ROLE_PLAN_NOTE).toContain(forbidden);
    }
  });

  it("l'etichetta di un campo target basta da sola: nomina il ruolo per esteso", () => {
    expect(targetFieldLabel("P")).toBe("Target Portieri (crediti)");
    expect(targetFieldLabel("A")).toBe("Target Attaccanti (crediti)");
  });

  it("il totale dichiarato porta sempre il suo denominatore", () => {
    expect(declaredTotalText(100, 2)).toContain("su 2 ruoli di 4");
    expect(declaredTotalText(0, 1)).toContain("su 1 ruolo di 4");
    expect(declaredTotalText(0, 0)).toBe("Nessun target dichiarato.");
  });

  it("ogni buco ha la sua frase, e le due specie di buco non usano la stessa", () => {
    expect(gapText({ kind: "role-undeclared", role: "C" })).toBe("Centrocampisti: nessun target dichiarato");
    expect(gapText({ kind: "plan-version-missing" })).toBe("manca la versione del piano");
  });

  // ── IL PULSANTE CHE CANCELLA ANCHE LA VERSIONE ────────────────────────────
  //
  // L'azzeramento scrive `EMPTY_ROLE_PLAN_DRAFT`, che porta `planVersion: ""`:
  // insieme ai quattro target sparisce anche l'etichetta del piano. Non c'è
  // conferma e non c'è undo, quindi l'unico istante in cui Owner può decidere è
  // PRIMA di premere — cioè leggendo il pulsante. Un'etichetta che nominasse i
  // soli ruoli prometterebbe meno di quanto il gesto fa, e la scoperta
  // arriverebbe dopo, davanti a un campo svuotato che nessuno aveva chiesto di
  // svuotare.
  it("il pulsante di azzeramento nomina TUTTO quello che cancella, versione compresa", () => {
    expect(ROLE_PLAN_CLEAR_LABEL).toContain(TARGET_UNDECLARED);
    expect(ROLE_PLAN_CLEAR_LABEL).toContain("versione");
    expect(ROLE_PLAN_CLEARED_ANNOUNCE).toContain(TARGET_UNDECLARED);
    expect(ROLE_PLAN_CLEARED_ANNOUNCE).toContain("la versione del piano è stata cancellata");
  });

  // L'etichetta dice il vero solo se la dichiarazione azzerata è davvero senza
  // versione: le due cose si provano insieme, o la frase resta una promessa
  // verificata contro se stessa.
  it("e la promessa dell'etichetta regge: la dichiarazione azzerata non ha più né target né versione", () => {
    expect(EMPTY_ROLE_PLAN_DRAFT.planVersion).toBe("");
    expect(EMPTY_ROLE_PLAN_DRAFT.targets).toEqual({});
  });
});
