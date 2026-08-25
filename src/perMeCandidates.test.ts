// Test del sottoblocco «PER ME» — logica pura, nessun DOM e nessuno storage,
// come postPurchaseProjection.test.ts e baitCandidates.test.ts (postura
// no-jsdom di questo repo). Gli stati di squadra non sono scritti a mano: si
// derivano da `reduce()` su acquisti passati da `recordPurchase`, quindi ogni
// numero atteso qui sotto è lo stesso numero che l'app vede a schermo.
//
// L'ORDINE PROVATO QUI È QUELLO DECISO DA PICO IL 2026-08-25 (in sessione):
// «deve essere un mix tra le due cose. Il numero uno è il filtro a monte ma il
// due è quello successivo» — il piano FILTRA, il surplus ORDINA. §"il surplus
// ordina, non esclude" copre i primi due criteri e i tre casi che li rendono
// falsificabili: il surplus ≤ 0 che RESTA a schermo, il valore dichiarato che
// manca e NON diventa zero, la parità che scende sull'appetibilità.
//
// LA PROVA CHE QUESTO FILE ESISTE PER TENERE IN PIEDI è §"selezione avversa".
// Il minuendo del surplus è il valore DICHIARATO da Pico e nessun altro:
// sostituirgli il valore ASSOLUTO renderebbe `valore − ancora` monotona
// decrescente nel prezzo — la base assoluta è piatta per ruolo — e il riquadro
// finirebbe per ordinare dal più economico, cioè dal peggiore. Qui c'è uno
// stato costruito apposta perché quella sostituzione, se qualcuno la facesse,
// metterebbe in cima il giocatore peggiore e più economico del ruolo; il test
// pinna che questo box lo mette IN FONDO.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { FANTA_TEAM_IDS } from "../packages/engine/fixtures/synthetic.js";
import { maxSafe } from "../packages/engine/src/auction.js";
import {
  declaredValueBook,
  UNRATIFIED_CHOICES,
  type DeclaredValueBook,
} from "../packages/engine/src/declaredValues.js";
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
  /**
   * Il listino dei valori DICHIARATI. Il default è `null` — nessun valore
   * dichiarato — perché è lo stato dell'app oggi (src/main.ts passa `null`): i
   * test che non lo passano provano quindi il caso vero, non un caso comodo.
   */
  readonly values?: DeclaredValueBook | null;
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
    values: options.values ?? null,
  });
}

/** Un listino di valori dichiarati sintetico, costruito col motore vero (che
 *  lancia su un listino invalido) e non a mano. */
function valuesOf(pairs: readonly (readonly [ListonePlayer, number])[]): DeclaredValueBook {
  return declaredValueBook(
    pairs.map(([player, declaredValue]) => ({ playerId: listonePlayerKey(player), declaredValue })),
  );
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

describe("perMeCandidates — il surplus ordina, non esclude", () => {
  // LA DECISIONE DI PICO DEL 2026-08-25, provata criterio per criterio: «deve
  // essere un mix tra le due cose. Il numero uno è il filtro a monte ma il due
  // è quello successivo». Il piano filtra, il surplus ordina.
  //
  // La scena è quella principale, con i valori DICHIARATI aggiunti sopra: le
  // ancore a log vuoto sono le Qt.A nude (60, 40, 2, 30), quindi ogni surplus
  // atteso qui sotto si rifà a mano.

  it("il surplus ordina chi ha passato il filtro, e batte l'appetibilità", () => {
    // A_MEDIO è 2ª di 3 per appetibilità e A_FORTE è 1ª: se ordinasse
    // l'appetibilità, A_FORTE verrebbe prima. Col surplus davanti vince A_MEDIO
    // (+30 contro +10), ed è esattamente ciò che «il due è quello successivo»
    // significa.
    const values = valuesOf([
      [A_FORTE, 70], // 70 − 60 = +10
      [A_MEDIO, 70], // 70 − 40 = +30
      [A_SCARSO, 5], // 5 − 2 = +3
      [D_FORTE, 35], // 35 − 30 = +5
    ]);
    const reading = read(SCENE, { values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates.map((c) => c.surplus)).toEqual([30, 10, 5, 3]);
    expect(ids(reading)).toEqual([key(A_MEDIO), key(A_FORTE), key(D_FORTE), key(A_SCARSO)]);
    expect(reading.withoutDeclaredValue).toBe(0);
  });

  it("IL PIANO RESTA IL FILTRO A MONTE: un surplus enorme fuori piano non scavalca", () => {
    // L'allocazione viva del reparto A è 210 cr su 7 slot: `fitsPlan` lascia
    // passare fino a 204 cr. Il caro a 300 cr sfora il piano ma resta
    // comprabile (`maxSafe` a rosa vuota vale 473) e porta il surplus più
    // grande del tavolo: resta comunque SOTTO chi il piano lo rispetta.
    const caro = row("Attaccante Caro", "A", "Alfa", 300, 99);
    const modesto = row("Attaccante Modesto", "A", "Alfa", 20, 30);
    const values = valuesOf([
      [caro, 500], // 500 − 300 = +200, fuori piano
      [modesto, 21], // 21 − 20 = +1, nel piano
    ]);
    const reading = read([caro, modesto], { values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates[0]!.playerId).toBe(key(modesto));
    expect(reading.candidates[0]!.surplus).toBe(1);
    expect(reading.candidates[1]!.playerId).toBe(key(caro));
    expect(reading.candidates[1]!.surplus).toBe(200);
  });

  it("un surplus ≤ 0 NON esclude: la riga resta visibile, più in basso", () => {
    // La quinta condizione d'ammissione del radar occasioni (`surplus > 0`) qui
    // NON torna come cancello: togliere dallo schermo un giocatore che il piano
    // copre ridurrebbe ciò che Pico vede in asta.
    const values = valuesOf([
      [A_FORTE, 50], // 50 − 60 = −10
      [A_MEDIO, 40], // 40 − 40 = 0
      [A_SCARSO, 3], // 3 − 2 = +1
      [D_FORTE, 20], // 20 − 30 = −10
    ]);
    const reading = read(SCENE, { values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    // Tutti e quattro sono ancora lì: nessuno è sparito per il segno.
    expect(reading.candidates).toHaveLength(4);
    expect(reading.evaluated).toBe(4);
    expect(ids(reading)).toContain(key(A_FORTE));
    // …e l'unico positivo è in cima, i due negativi in fondo. Fra i due a −10
    // decide il criterio successivo che ha un verdetto: entrambi sono 1ª del
    // proprio ruolo, quindi decide l'ancora decrescente (60 prima di 30).
    expect(ids(reading)).toEqual([key(A_SCARSO), key(A_MEDIO), key(A_FORTE), key(D_FORTE)]);
  });

  it("un valore dichiarato che manca NON diventa zero, e nemmeno meno infinito", () => {
    // IL TEST CHE DIFENDE LA REGOLA. `A_FORTE` ha un surplus NEGATIVO (−10):
    // è una misura, e una misura viene prima di un'assenza. Se l'assenza
    // diventasse 0 starebbe DAVANTI a lui; se diventasse `-Infinity` sarebbe
    // «l'ultimo misurato» — cioè un verdetto che nessuno ha espresso.
    const values = valuesOf([[A_FORTE, 50]]); // 50 − 60 = −10; gli altri tre, niente
    const reading = read(SCENE, { values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates[0]!.playerId).toBe(key(A_FORTE));
    expect(reading.candidates[0]!.surplus).toBe(-10);
    expect(reading.candidates[0]!.declaredValue).toBe(50);
    // Le tre senza dichiarazione seguono, e portano `null` in entrambi i campi:
    // non uno zero, non un numero di ripiego.
    for (const c of reading.candidates.slice(1)) {
      expect(c.surplus).toBeNull();
      expect(c.declaredValue).toBeNull();
    }
    expect(reading.withoutDeclaredValue).toBe(3);
  });

  it("a parità di surplus decide l'appetibilità, che è scesa di un gradino e non è sparita", () => {
    // Stesso surplus (+10) per i tre attaccanti: se l'appetibilità fosse stata
    // rimossa insieme al ritorno del surplus, a decidere sarebbe l'ancora
    // decrescente e l'ordine sarebbe FORTE(60) → MEDIO(40) → SCARSO(2). Con
    // l'appetibilità al suo posto l'ordine coincide qui, quindi la prova sta
    // nel caso costruito apposta: SCARSO ha l'ancora più bassa ma la posizione
    // migliore.
    const primo = row("Attaccante Uno", "A", "Alfa", 10, 90); // 1ª per appetibilità
    const secondo = row("Attaccante Due", "A", "Alfa", 80, 20); // 2ª, ma ancora più alta
    const values = valuesOf([
      [primo, 20], // 20 − 10 = +10
      [secondo, 90], // 90 − 80 = +10
    ]);
    const reading = read([primo, secondo], { values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates.map((c) => c.surplus)).toEqual([10, 10]);
    expect(ids(reading)).toEqual([key(primo), key(secondo)]);
    expect(reading.candidates[0]!.appealPosition).toBe(1);
  });

  it("senza listino dei valori nessuna riga ha un surplus, e l'ordine cade sui criteri che restano", () => {
    // È LO STATO DELL'APP OGGI: `src/main.ts` passa `values: null` perché il
    // core pubblico non ha ancora una sorgente per il listino dichiarato. Il
    // criterio 2 non ha verdetto per nessuno, quindi decide il 3 — e nessuna
    // riga sparisce per questo.
    const reading = read(SCENE);
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.candidates.every((c) => c.surplus === null)).toBe(true);
    expect(reading.candidates.every((c) => c.declaredValue === null)).toBe(true);
    expect(reading.withoutDeclaredValue).toBe(4);
    expect(ids(reading)).toEqual([key(A_FORTE), key(D_FORTE), key(A_MEDIO), key(A_SCARSO)]);
  });

  it("la sottrazione è quella del motore, non una copia: valore dichiarato − ancora CORRETTA", () => {
    // Con un campione sufficiente l'ancora non è più la Qt.A nuda: il surplus
    // deve muoversi con l'ancora corretta, altrimenti qualcuno sta sottraendo
    // la base. Nove acquisti a prezzo doppio della Qt.A: inflazione +100%.
    const log = logAfter(
      Array.from({ length: 9 }, (_, i) => ({
        playerId: key(row(`Venduto ${i}`, "C", "Zeta", 10)),
        role: "C" as Role,
        fantaTeamId: RIVAL,
        price: 20,
      })),
    );
    const pool = [
      ...SCENE,
      ...Array.from({ length: 9 }, (_, i) => row(`Venduto ${i}`, "C", "Zeta", 10)),
    ];
    const values = valuesOf([[A_FORTE, 130]]);
    const reading = read(pool, { log, values });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const forte = reading.candidates.find((c) => c.playerId === key(A_FORTE))!;
    expect(forte.anchor.correctedAnchor).toBeGreaterThan(forte.anchor.baseAnchor);
    expect(forte.surplus).toBe(130 - forte.anchor.correctedAnchor);
    expect(forte.surplus).not.toBe(130 - forte.anchor.baseAnchor);
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

  it("nel sorgente il minuendo del surplus non è mai un valore DERIVATO", () => {
    // Guardia di SORGENTE, non di comportamento: un ordine si può cambiare
    // senza rompere nessuna asserzione sui numeri, ma non si può cambiare
    // l'INGREDIENTE della sottrazione senza scriverne il nome.
    //
    // Che cosa è cambiato il 2026-08-25 e che cosa NO. Il surplus è tornato,
    // quindi `declaredValue` e `surplus` non sono più parole vietate: sono il
    // valore DICHIARATO da Pico e la sottrazione che ci si fa sopra. Resta
    // vietato tutto ciò che DERIVEREBBE quel valore invece di riceverlo
    // dichiarato — il valore assoluto (piatto per ruolo, quindi selezione
    // avversa) e gli α del profilo di rischio.
    const src = stripCommentsAndStrings(
      readFileSync(new URL("./perMeCandidates.ts", import.meta.url), "utf8"),
    );
    for (const forbidden of ["absoluteValue", "ALPHA_BY_PROFILE", "fairToMe"]) {
      expect(src, `«${forbidden}» è entrato nella via del sottoblocco`).not.toContain(forbidden);
    }
    // …e il minuendo dichiarato c'è davvero, altrimenti la negazione qui sopra
    // sarebbe verde su un file che non fa più nessuna sottrazione.
    expect(src).toContain("declaredValueOf");
    expect(src).toContain("surplusOverAnchor");
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
      "PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES",
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
