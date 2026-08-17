import { describe, it, expect } from "vitest";
import {
  ROLE_DEPLETION_NOTE,
  ROLE_DEPLETION_NO_CALL,
  ROLE_DEPLETION_TITLE,
  roleDepletionBuyersHtml,
  roleDepletionCensusHtml,
  roleDepletionHeadline,
  roleDepletionRoleHtml,
  roleDepletionSpoken,
} from "./roleDepletion.js";
import type { RoleDepletionFacts, RoleDepletionReading } from "../roleDepletion.js";

// Solo fixture sintetiche.

/**
 * Ogni famiglia direttiva che non deve mai raggiungere questa superficie
 * (docs/NO_GO.md §Prodotto, docs/DECISIONS.md §D9). `indice`, `banda` e
 * `tensione` sono nell'elenco per una ragione precisa a questa corsia: il
 * riquadro nasce accanto a un motore che produce una BANDA qualitativa, e la
 * decisione di Pico lo tiene fuori. Se la banda arrivasse a schermo, questa
 * riga la vedrebbe.
 */
const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi|ranking|classifica|punteggio|indice|banda|tensione|quotazion|listino/i;

function facts(overrides: Partial<RoleDepletionFacts> = {}): RoleDepletionFacts {
  return {
    role: "A",
    takenTonight: 0,
    creditsTonight: 0,
    buyers: [],
    teamsCounted: 8,
    roleSlotsTotal: 56,
    openSlots: 56,
    teamsWithOpenSlot: 8,
    widestOpening: 7,
    confirmedSlots: 0,
    ...overrides,
  };
}

function reading(overrides: Partial<RoleDepletionFacts> = {}): RoleDepletionReading {
  return { kind: "facts", facts: facts(overrides) };
}

const LABELS: Record<string, string> = {
  Io: "Io",
  Squadra2: "Bea",
  Squadra3: "Cor",
};

describe("roleDepletionHeadline — i due silenzi sono due frasi diverse", () => {
  it("senza chiamata dice che manca il soggetto, non che manca il dato", () => {
    expect(roleDepletionHeadline({ kind: "no-call" })).toBe(ROLE_DEPLETION_NO_CALL);
    expect(ROLE_DEPLETION_NO_CALL).toMatch(/nessun giocatore chiamato/i);
  });

  it("a inizio asta dice che stasera non è successo niente, e dice cosa NON significa", () => {
    // È il caso in cui ogni asta si apre: il log è vuoto e non c'è niente da
    // misurare. Una frase sola, e non un pannello muto accanto a uno zero.
    const text = roleDepletionHeadline(reading());
    expect(text).toMatch(/non è ancora successo niente/i);
    expect(text).toMatch(/non vuol dire «il ruolo è pieno»/i);
    expect(text).not.toMatch(/^0 /);
  });

  it("le due frasi di silenzio sono diverse fra loro", () => {
    expect(roleDepletionHeadline({ kind: "no-call" })).not.toBe(roleDepletionHeadline(reading()));
  });

  it("coi fatti dice quanti, da quante squadre e per quanti crediti", () => {
    const text = roleDepletionHeadline(
      reading({
        takenTonight: 6,
        creditsTonight: 212,
        buyers: [
          { fantaTeamId: "Io", taken: 3, credits: 120, prices: [70, 30, 20] },
          { fantaTeamId: "Squadra2", taken: 2, credits: 80, prices: [50, 30] },
          { fantaTeamId: "Squadra3", taken: 1, credits: 12, prices: [12] },
        ],
      }),
    );
    expect(text).toBe("6 attaccanti presi stasera, da 3 squadre, per 212 crediti.");
  });

  it("al singolare accorda ruolo, verbo, squadra e credito", () => {
    const text = roleDepletionHeadline(
      reading({
        takenTonight: 1,
        creditsTonight: 1,
        buyers: [{ fantaTeamId: "Io", taken: 1, credits: 1, prices: [1] }],
      }),
    );
    expect(text).toBe("1 attaccante preso stasera, da 1 squadra, per 1 credito.");
  });

  it("nessuna frase porta un output direttivo", () => {
    expect(roleDepletionHeadline({ kind: "no-call" })).not.toMatch(DIRECTIVE);
    expect(roleDepletionHeadline(reading())).not.toMatch(DIRECTIVE);
    expect(
      roleDepletionHeadline(reading({ takenTonight: 4, creditsTonight: 90 })),
    ).not.toMatch(DIRECTIVE);
  });
});

describe("roleDepletionCensusHtml — un censimento, non un campione", () => {
  it("porta i quattro numeri con la loro etichetta scritta accanto", () => {
    const html = roleDepletionCensusHtml(
      facts({ takenTonight: 4, openSlots: 40, confirmedSlots: 6 }),
    );
    expect(html).toContain('id="role-depletion-slots-total">56<');
    expect(html).toContain('id="role-depletion-slots-open">40<');
    expect(html).toContain('id="role-depletion-taken">4<');
    expect(html).toContain('id="role-depletion-confirmed">6<');
    expect(html).toContain("posti al tavolo");
    expect(html).toContain("riconfermati");
  });

  it("dice quante squadre cercano ancora quel ruolo e quanto è scoperta la più scoperta", () => {
    const html = roleDepletionCensusHtml(facts({ teamsWithOpenSlot: 5, widestOpening: 4 }));
    expect(html).toContain("5 squadre su 8 cercano ancora almeno un posto di questo ruolo");
    expect(html).toContain("la più scoperta ne ha 4");
  });

  it("a ruolo completo non dice «la più scoperta ne ha 0», che direbbe il contrario", () => {
    const html = roleDepletionCensusHtml(
      facts({ teamsWithOpenSlot: 0, widestOpening: 0, openSlots: 0 }),
    );
    expect(html).toContain("Nessuna squadra ha più un posto libero in questo ruolo");
    expect(html).not.toContain("la più scoperta");
  });

  it("dichiara di essere un censimento e non un campione con un cold start", () => {
    const html = roleDepletionCensusHtml(facts());
    expect(html).toContain("Censimento su 8 squadre, nessun campione e nessun cold start");
  });

  it("non porta output direttivi", () => {
    expect(roleDepletionCensusHtml(facts({ takenTonight: 3 }))).not.toMatch(DIRECTIVE);
  });
});

describe("roleDepletionBuyersHtml — chi ha preso, quanti, a che prezzi", () => {
  it("vuoto non produce un contenitore vuoto: produce niente", () => {
    // Un elenco vuoto sotto la frase «stasera non è passato nessuno» si
    // leggerebbe come un elenco DI nessuno.
    expect(roleDepletionBuyersHtml(facts(), LABELS)).toBe("");
  });

  it("nomina le squadre con la loro etichetta e porta i prezzi in chiaro", () => {
    const html = roleDepletionBuyersHtml(
      facts({
        takenTonight: 3,
        buyers: [
          { fantaTeamId: "Squadra2", taken: 2, credits: 48, prices: [45, 3] },
          { fantaTeamId: "Io", taken: 1, credits: 20, prices: [20] },
        ],
      }),
      LABELS,
    );
    expect(html).toContain("Bea");
    expect(html).toContain("2 presi · 48 cr");
    expect(html).toContain("45, 3");
    expect(html).toContain("1 preso · 20 cr");
    // L'ordine dell'elenco è quello che il calcolo ha già deciso: la resa non
    // riordina niente per conto suo.
    expect(html.indexOf("Bea")).toBeLessThan(html.indexOf(">Io<"));
  });

  it("senza etichetta ripiega sull'id, mai su una riga senza nome", () => {
    const html = roleDepletionBuyersHtml(
      facts({ buyers: [{ fantaTeamId: "Squadra7", taken: 1, credits: 5, prices: [5] }] }),
      LABELS,
    );
    expect(html).toContain("Squadra7");
  });

  it("non mostra nessuna media dei prezzi", () => {
    // 45 e 3 hanno media 24: se la media comparisse, comparirebbe qui.
    const html = roleDepletionBuyersHtml(
      facts({ buyers: [{ fantaTeamId: "Squadra2", taken: 2, credits: 48, prices: [45, 3] }] }),
      LABELS,
    );
    expect(html).not.toContain("24");
    expect(html).not.toMatch(/media/i);
  });
});

describe("roleDepletionRoleHtml e roleDepletionSpoken", () => {
  it("il ruolo è scritto per esteso accanto alla pastiglia, mai la sola sigla", () => {
    expect(roleDepletionRoleHtml(reading())).toContain("Attaccanti");
  });

  it("senza chiamata non nomina nessun ruolo di ripiego", () => {
    expect(roleDepletionRoleHtml({ kind: "no-call" })).toBe("");
  });

  it("la forma parlata porta la sintesi e il censimento, senza impaginazione", () => {
    const spoken = roleDepletionSpoken(reading({ takenTonight: 2, creditsTonight: 30, openSlots: 40, confirmedSlots: 6 }));
    expect(spoken).toContain(ROLE_DEPLETION_TITLE);
    expect(spoken).toContain("Attaccanti");
    expect(spoken).toContain("ancora liberi 40");
    expect(spoken).toContain("riconfermati a inizio asta 6");
    expect(spoken).not.toContain("<");
  });

  it("senza chiamata la forma parlata è il silenzio dichiarato, non un pannello muto", () => {
    expect(roleDepletionSpoken({ kind: "no-call" })).toContain(ROLE_DEPLETION_NO_CALL);
  });
});

describe("ROLE_DEPLETION_NOTE — la provenienza, e ciò che non entra", () => {
  it("dichiara che il conto viene dal log di stasera e dal censimento dei posti", () => {
    expect(ROLE_DEPLETION_NOTE).toMatch(/log dell'asta di stasera/i);
    expect(ROLE_DEPLETION_NOTE).toMatch(/censimento dei posti/i);
  });

  it("dichiara che le quotazioni non entrano, nemmeno per ordinare", () => {
    // È l'unico punto in cui la parola «quotazioni» compare su questa
    // superficie, ed è per NEGARLA: è la resa della decisione di Pico, non una
    // sua violazione.
    expect(ROLE_DEPLETION_NOTE).toMatch(/quotazioni del listino non entrano/i);
    expect(ROLE_DEPLETION_NOTE).toMatch(/nemmeno per ordinare/i);
  });

  it("dichiara perché le riconferme sono contate a parte", () => {
    expect(ROLE_DEPLETION_NOTE).toMatch(/prezzi della stagione scorsa/i);
  });

  it("dichiara l'assenza di bande, punteggi e previsioni", () => {
    expect(ROLE_DEPLETION_NOTE).toMatch(/nessuna banda/i);
    expect(ROLE_DEPLETION_NOTE).toMatch(/nessun punteggio/i);
    expect(ROLE_DEPLETION_NOTE).toMatch(/nessuna previsione/i);
  });
});
