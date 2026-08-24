import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  INITIAL_BUDGET,
  MINIMUM_RAISE,
  SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO,
  TOTAL_SLOTS,
  competitorSet,
  hardReserve,
  maxSafe,
  relativePriceReading,
  type AuctionState,
} from "../src/index.js";
import {
  TEAMS,
  buildLog,
  buy,
  fillRole,
  stateOf,
  type PurchaseSpec,
} from "./layer2Fixtures.js";

// IL PREZZO RELATIVO PORTA IL NUMERO DI PICO, E LO PORTA PER LA SUA RAGIONE.
//
// L'esempio numerico di `docs/DECISIONS.md` §"Il prezzo relativo si assesta su
// quanto mette il secondo, non il più ricco" (Pico, 2026-08-24) è qui alla
// lettera, con le sue due misure — 62 e poi 41 — e col vincolo che le tiene
// insieme: fra le due il TETTO DEL PIÙ RICCO non si muove di un credito.
//
// Le fixture sono sintetiche e COSTRUITE COL MOTORE VERO: nessuno stato scritto
// a mano: si spendono crediti con `reduce()` finché `maxSafe()` — interrogata,
// non riprodotta — dice esattamente il max bid che l'esempio pretende. Gli id
// squadra sono quelli sintetici del progetto; «Bianchi», «Rossi» e «Verdi» sono
// i nomi che Pico ha usato nell'esempio e restano nei commenti.

const SELF = TEAMS[0]!; // «io»
const BIANCHI = TEAMS[1]!;
const ROSSI = TEAMS[2]!;
const VERDI = TEAMS[3]!;
const ROLE_FULL = [TEAMS[4]!, TEAMS[5]!, TEAMS[6]!, TEAMS[7]!]; // «gli altri quattro»

/**
 * Acquisti che portano `team` a un max bid ESATTAMENTE `target` sul ruolo `A`,
 * senza toccarne un solo slot d'attacco: nove difensori riempiono il reparto D
 * e lasciano intatta la domanda su cui si compete.
 *
 * L'aritmetica è quella di `maxSafe()` letta all'indietro — `budgetResidual −
 * hardReserve(altri slot)` — e NON una seconda formula: i test qui sotto
 * ripassano comunque da `maxSafe()` per verificare che la fixture sia arrivata
 * dove dice di essere arrivata. Se le due divergessero, sarebbe questa a
 * essere sbagliata, e il primo `expect` lo direbbe.
 */
function drainToMaxBid(team: string, target: number): PurchaseSpec[] {
  const count = 9; // il reparto D per intero
  const total = INITIAL_BUDGET - hardReserve(TOTAL_SLOTS - count - 1) - target;
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) =>
    buy(`fill:${team}:D:${i}`, "D", team, base + (i < extra ? 1 : 0)),
  );
}

/** Il ruolo A pieno: sette attaccanti a un credito. Budget quasi intatto, di proposito. */
function fillAttack(team: string): PurchaseSpec[] {
  return fillRole(team, "A", 7, 1);
}

/**
 * IL TAVOLO DELL'ESEMPIO DI PICO: capienti Bianchi 96, Rossi 61, Verdi 34; gli
 * altri quattro col ruolo pieno; io fresco, quindi con un tetto che non morde.
 */
const PICO_PURCHASES: PurchaseSpec[] = [
  ...drainToMaxBid(BIANCHI, 96),
  ...drainToMaxBid(ROSSI, 61),
  ...drainToMaxBid(VERDI, 34),
  ...ROLE_FULL.flatMap(fillAttack),
];

const PICO_LOG = buildLog(PICO_PURCHASES);
const PICO_STATE: AuctionState = stateOf(PICO_LOG);

/** Cinque minuti dopo: Rossi compra altrove e la sua capienza scende a 40. */
const AFTER_ROSSI_LOG = buildLog([
  ...PICO_PURCHASES,
  buy("c_altrove", "C", ROSSI, 22),
]);
const AFTER_ROSSI_STATE: AuctionState = stateOf(AFTER_ROSSI_LOG);

function maxBidOf(state: AuctionState, team: string): number {
  const safe = maxSafe(state.teams[team]!, "A");
  return safe.biddable ? safe.maxSafe : 0;
}

describe("prezzo relativo — l'esempio di Pico, alla lettera", () => {
  it("la fixture è quella dell'esempio: 96 · 61 · 34, e gli altri quattro col ruolo pieno", () => {
    expect(maxBidOf(PICO_STATE, BIANCHI)).toBe(96);
    expect(maxBidOf(PICO_STATE, ROSSI)).toBe(61);
    expect(maxBidOf(PICO_STATE, VERDI)).toBe(34);
    for (const team of ROLE_FULL) {
      expect(PICO_STATE.teams[team]!.slotsRemaining.A).toBe(0);
    }
    // Io sono fresco: il mio tetto non entra in questo esempio.
    expect(maxBidOf(PICO_STATE, SELF)).toBe(473);
  });

  it("«a 62 Bianchi vince da solo, e a 61 Rossi ha già mollato»: il numero è 62", () => {
    const reading = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    expect(reading.credits).toBe(62);

    // E IL NUMERO È QUELLO DEL SECONDO, non quello del più ricco: 96 è il
    // limite invalicabile, non la risposta. Le due cose si vedono separate
    // nella catena, che è la ragione per cui la catena viaggia.
    expect(reading.chain.secondMaxBid).toBe(61);
    expect(reading.chain.richestMaxBid).toBe(96);
    expect(reading.credits).not.toBe(reading.chain.richestMaxBid);
    expect(reading.chain.boundBy).toBe("scala-dei-rivali");
    expect(reading.chain.eligibleCount).toBe(3);
    // Il «più uno» c'è, ed è esplicito: 61 non è la risposta, 62 lo è.
    expect(reading.credits).toBe(reading.chain.secondMaxBid + MINIMUM_RAISE);
    expect(MINIMUM_RAISE).toBe(1);
  });

  it("«se Rossi scende a 40, cinque minuti dopo vale 41, e il tetto non si è mosso»", () => {
    // La seconda misura non è una seconda fixture: è LA STESSA, più un acquisto
    // vero passato dal reducer. È così che «relativo al momento dell'asta»
    // diventa una cosa misurata invece che una parola.
    expect(maxBidOf(AFTER_ROSSI_STATE, ROSSI)).toBe(40);

    const reading = relativePriceReading({ state: AFTER_ROSSI_STATE, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    expect(reading.credits).toBe(41);
    expect(reading.chain.secondMaxBid).toBe(40);
    // IL TETTO NON SI È MOSSO DI UN CREDITO: 96 prima, 96 adesso.
    expect(reading.chain.richestMaxBid).toBe(96);
    expect(reading.chain.boundBy).toBe("scala-dei-rivali");
  });

  it("il valore assoluto del giocatore non entra: la firma non lo riceve nemmeno", () => {
    // I «150» dell'esempio sono il contesto della domanda, non un ingrediente
    // della risposta. Qui la prova è strutturale e vale più di un caso: gli
    // ingressi sono tre — stato, ruolo, identità — e nessuno dei tre nomina un
    // giocatore. Due chiamate identiche danno lo stesso numero perché non c'è
    // niente che possa distinguere due attaccanti diversi.
    const first = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    const second = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    expect(second).toEqual(first);
  });
});

describe("prezzo relativo — i due tetti mordono, e si vede quale", () => {
  it("TETTO DEL PIÙ RICCO: a parità in testa nessuno arriva a «secondo + 1»", () => {
    // Due rivali a 61 e uno a 34: la scala dei rivali chiederebbe 62, ma
    // nemmeno il più ricco può arrivarci. Il numero si ferma a 61.
    const state = stateOf(
      buildLog([
        ...drainToMaxBid(BIANCHI, 61),
        ...drainToMaxBid(ROSSI, 61),
        ...drainToMaxBid(VERDI, 34),
        ...ROLE_FULL.flatMap(fillAttack),
      ]),
    );
    const reading = relativePriceReading({ state, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    expect(reading.chain.rivalScale).toBe(62);
    expect(reading.chain.richestMaxBid).toBe(61);
    expect(reading.credits).toBe(61);
    expect(reading.chain.boundBy).toBe("tetto-del-piu-ricco");
  });

  it("TETTO MAX_SAFE: il numero non supera mai quanto io posso mettere", () => {
    // Stesso tavolo di Pico, ma il mio budget morde: 50 contro i 62 che la
    // scala dei rivali chiederebbe.
    const state = stateOf(
      buildLog([...PICO_PURCHASES, ...drainToMaxBid(SELF, 50)]),
    );
    expect(maxBidOf(state, SELF)).toBe(50);

    const reading = relativePriceReading({ state, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    expect(reading.chain.rivalScale).toBe(62);
    expect(reading.chain.myMaxSafe).toBe(50);
    expect(reading.credits).toBe(50);
    expect(reading.chain.boundBy).toBe("tetto-max-safe");
    // `maxSafe` è INTERROGATA, non riprodotta: il numero della catena è
    // esattamente quello che la funzione hard-safe restituisce.
    expect(reading.chain.myMaxSafe).toBe(maxSafe(state.teams[SELF]!, "A").maxSafe);
  });

  it("il numero non supera mai maxSafe(io, ruolo), su tutti gli stati di questo file", () => {
    const states: readonly (readonly [string, AuctionState])[] = [
      ["esempio di Pico", PICO_STATE],
      ["cinque minuti dopo", AFTER_ROSSI_STATE],
      ["tavolo fresco", stateOf(buildLog([]))],
      ["io consumato", stateOf(buildLog([...PICO_PURCHASES, ...drainToMaxBid(SELF, 50)]))],
    ];
    for (const [label, state] of states) {
      const reading = relativePriceReading({ state, role: "A", selfId: SELF });
      if (reading.kind !== "prezzo") continue;
      expect(reading.credits, label).toBeLessThanOrEqual(maxBidOf(state, SELF));
      expect(reading.credits, label).toBeLessThanOrEqual(reading.chain.richestMaxBid);
    }
  });
});

describe("prezzo relativo — chi è dentro l'insieme eleggibile, e chi no", () => {
  it("i rivali col ruolo pieno restano fuori, anche quando sono i più ricchi del tavolo", () => {
    // I quattro col ruolo pieno hanno speso SETTE crediti in tutto: sono, di
    // gran lunga, i più ricchi fra i rivali. Se entrassero nella scala il
    // numero sarebbe un altro — e sbagliato, perché quel giocatore a loro non
    // serve: la loro capienza NUDA (budget meno riserva dura) vale 473, cioè
    // più del quintuplo del 96 di Bianchi, e il «secondo» diventerebbe 473.
    const nakedCapacity =
      INITIAL_BUDGET - 7 - hardReserve(TOTAL_SLOTS - 7 - 1);
    expect(nakedCapacity).toBe(473);
    for (const team of ROLE_FULL) {
      expect(PICO_STATE.teams[team]!.budgetResidual).toBe(INITIAL_BUDGET - 7);
      expect(PICO_STATE.teams[team]!.budgetResidual).toBeGreaterThan(
        PICO_STATE.teams[BIANCHI]!.budgetResidual,
      );
      // È `maxSafe()` a metterli fuori, e lo dice con la sua ragione: la
      // capienza nuda non li salva, perché il ruolo è pieno.
      expect(maxSafe(PICO_STATE.teams[team]!, "A")).toEqual({
        biddable: false,
        maxSafe: 0,
        hardReserve: 0,
        reason: "role-full",
      });
    }

    // `competitorSet` li dichiara esclusi col loro blocco, e la lettura non li
    // conta: tre eleggibili, non sette.
    const set = competitorSet(PICO_STATE, "A", 1, SELF);
    for (const team of ROLE_FULL) {
      const assessment = set.excluded.find((c) => c.fantaTeamId === team);
      expect(assessment?.blockers).toEqual(["role-full"]);
    }
    const reading = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;
    expect(reading.chain.eligibleCount).toBe(3);
    expect(reading.credits).toBe(62);
  });

  it("la scala si legge nell'ordine che competitorSet ha già prodotto, non in uno nuovo", () => {
    const eligible = competitorSet(PICO_STATE, "A", 1, SELF).eligible;
    const reading = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;
    expect(reading.chain.richestMaxBid).toBe(eligible[0]!.maxBid);
    expect(reading.chain.secondMaxBid).toBe(eligible[1]!.maxBid);
  });
});

describe("prezzo relativo — le assenze sono dichiarate, mai riempite", () => {
  it("UN SOLO rivale eleggibile: il secondo non esiste, e non si sostituisce col primo", () => {
    // Sei col ruolo pieno, uno solo capiente: c'è un più ricco, non c'è un
    // secondo. Il numero non si inventa dal primo, e non diventa 1.
    const state = stateOf(
      buildLog([
        ...drainToMaxBid(BIANCHI, 96),
        ...[ROSSI, VERDI, ...ROLE_FULL].flatMap(fillAttack),
      ]),
    );
    expect(competitorSet(state, "A", 1, SELF).eligibleCount).toBe(1);
    expect(relativePriceReading({ state, role: "A", selfId: SELF })).toEqual({
      kind: "assente",
      reason: "un-solo-rivale-eleggibile",
    });
  });

  it("NESSUN rivale eleggibile: non c'è nessuna asta da vincere", () => {
    const state = stateOf(
      buildLog([BIANCHI, ROSSI, VERDI, ...ROLE_FULL].flatMap(fillAttack)),
    );
    expect(competitorSet(state, "A", 1, SELF).eligibleCount).toBe(0);
    expect(relativePriceReading({ state, role: "A", selfId: SELF })).toEqual({
      kind: "assente",
      reason: "nessun-rivale-eleggibile",
    });
  });

  it("IL RUOLO PIENO PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi", () => {
    const state = stateOf(buildLog([...PICO_PURCHASES, ...fillAttack(SELF)]));
    expect(state.teams[SELF]!.slotsRemaining.A).toBe(0);
    expect(relativePriceReading({ state, role: "A", selfId: SELF })).toEqual({
      kind: "assente",
      reason: "ruolo-pieno-per-me",
    });
  });

  it("MAX_SAFE A ZERO: il budget è bloccato dalla riserva dura, e lo dice", () => {
    const state = stateOf(buildLog([...PICO_PURCHASES, ...drainToMaxBid(SELF, 0)]));
    const mine = maxSafe(state.teams[SELF]!, "A");
    expect(mine.biddable).toBe(false);
    expect(mine.maxSafe).toBe(0);
    expect(relativePriceReading({ state, role: "A", selfId: SELF })).toEqual({
      kind: "assente",
      reason: "max-safe-a-zero",
    });
  });

  it("SQUADRA ASSENTE: senza un «io» non c'è nessuno che paghi, e non si sceglie una squadra a caso", () => {
    expect(
      relativePriceReading({ state: PICO_STATE, role: "A", selfId: "squadra_che_non_esiste" }),
    ).toEqual({ kind: "assente", reason: "squadra-assente" });
  });

  it("il ruolo pieno per me viene PRIMA di max_safe a zero: i due blocchi sono annidati", () => {
    // Chi ha il ruolo pieno ha per forza anche max bid 0. Dire che il problema
    // è il budget sarebbe falso: il problema è che quel giocatore non gli serve.
    const state = stateOf(buildLog([...drainToMaxBid(SELF, 0), ...fillAttack(SELF)]));
    expect(maxSafe(state.teams[SELF]!, "A").biddable).toBe(false);
    expect(relativePriceReading({ state, role: "A", selfId: SELF })).toEqual({
      kind: "assente",
      reason: "ruolo-pieno-per-me",
    });
  });
});

describe("prezzo relativo — si muove quando deve, e sta fermo quando non deve", () => {
  it("un acquisto che cambia la capienza dei rivali cambia il numero", () => {
    const before = relativePriceReading({ state: PICO_STATE, role: "A", selfId: SELF });
    const after = relativePriceReading({ state: AFTER_ROSSI_STATE, role: "A", selfId: SELF });
    expect(before.kind).toBe("prezzo");
    expect(after.kind).toBe("prezzo");
    if (before.kind !== "prezzo" || after.kind !== "prezzo") return;
    expect(after.credits).not.toBe(before.credits);
    expect(after.credits).toBe(41);
    expect(before.credits).toBe(62);
  });

  it("un acquisto che NON tocca i primi due lascia il numero dov'è", () => {
    // Verdi (34) compra: resta terzo, e il prezzo di vincere non cambia. Un
    // numero che si muovesse qui reagirebbe a qualcosa che non lo riguarda.
    const state = stateOf(buildLog([...PICO_PURCHASES, buy("c_verdi", "C", VERDI, 10)]));
    expect(maxBidOf(state, VERDI)).toBeLessThan(34);
    const reading = relativePriceReading({ state, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;
    expect(reading.credits).toBe(62);
  });

  it("il numero è uno scalare intero di crediti, mai una banda", () => {
    for (const state of [PICO_STATE, AFTER_ROSSI_STATE, stateOf(buildLog([]))]) {
      const reading = relativePriceReading({ state, role: "A", selfId: SELF });
      if (reading.kind !== "prezzo") continue;
      expect(Number.isInteger(reading.credits)).toBe(true);
      expect(reading.credits).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("prezzo relativo — il debito verso la catena fair-to-me è dichiarato", () => {
  it("la marcatura dice che cosa ha sostituito che cosa, e che niente è stato rimosso", () => {
    // Pinnata come le scelte non ratificate del motore: il test la DOCUMENTA
    // senza approvarla, e diventa rosso se qualcuno la cancella.
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain("relativePriceReading()");
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain("fairToMeMaxEffective");
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain("Marcato, non rimosso");
  });

  it("e dice anche che la cella che lo consumava è uscita, con la data e la frase", () => {
    // AGGIORNATA, NON CANCELLATA. La marcatura diceva «la sorgente dello slot 4
    // è questa funzione»: vero il 2026-08-24 mattina, falso la sera, quando
    // Pico ha tolto dal riquadro i due numeri in crediti. Una marcatura che
    // sopravvive al fatto che descrive è peggio di nessuna marcatura, e questa
    // misura è ciò che la tiene aggiornata invece che vera per modo di dire.
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain("2026-08-24");
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain(
      "Leva il valore assoluto e il valore relativo",
    );
    expect(SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO).toContain("alimentano più una superficie");
  });
});

describe("prezzo relativo — la parità va alla scala, e l'etichetta lo dice", () => {
  // PERCHÉ QUESTI DUE CASI ESISTONO. A parità `Math.min` non distingue nulla:
  // il numero è lo stesso comunque si scriva il confronto. Cambia SOLO
  // `boundBy`, cioè la frase che il riquadro mostra a Pico durante l'asta. Con
  // un `<` al posto di un `<=` un pareggio verrebbe raccontato come un tetto
  // che morde — «il tavolo chiede di più» — mentre il tavolo non chiede un
  // credito più della scala. Il numero resterebbe giusto e la frase diventerebbe
  // falsa: è esattamente il caso che nessun `expect` sul numero può pinnare.

  it("SCALA == TETTO DEL PIÙ RICCO: il pareggio è della scala, non del tetto", () => {
    // Bianchi 62, Rossi 61, Verdi 34: «secondo + 1» vale 62, e 62 è anche tutto
    // ciò che il più ricco può mettere. Il tetto non morde: lo tocca.
    const state = stateOf(
      buildLog([
        ...drainToMaxBid(BIANCHI, 62),
        ...drainToMaxBid(ROSSI, 61),
        ...drainToMaxBid(VERDI, 34),
        ...ROLE_FULL.flatMap(fillAttack),
      ]),
    );
    expect(maxBidOf(state, BIANCHI)).toBe(62);
    expect(maxBidOf(state, ROSSI)).toBe(61);

    const reading = relativePriceReading({ state, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    // I DUE TERMINI SONO DAVVERO PARI: senza questo la misura non proverebbe
    // la parità ma un caso qualunque.
    expect(reading.chain.rivalScale).toBe(reading.chain.richestMaxBid);
    expect(reading.chain.rivalScale).toBe(62);
    expect(reading.credits).toBe(62);
    expect(reading.chain.boundBy).toBe("scala-dei-rivali");
  });

  it("SCALA == MIO MAX_SAFE: il pareggio è della scala, non del mio tetto", () => {
    // Il tavolo di Pico (96 · 61 · 34) e il mio budget portato esattamente a
    // 62: «secondo + 1» vale 62, e 62 è anche tutto ciò che io posso mettere.
    const state = stateOf(buildLog([...PICO_PURCHASES, ...drainToMaxBid(SELF, 62)]));
    expect(maxBidOf(state, SELF)).toBe(62);

    const reading = relativePriceReading({ state, role: "A", selfId: SELF });
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;

    expect(reading.chain.rivalScale).toBe(reading.chain.myMaxSafe);
    expect(reading.chain.rivalScale).toBe(62);
    expect(reading.chain.richestMaxBid).toBe(96);
    expect(reading.credits).toBe(62);
    expect(reading.chain.boundBy).toBe("scala-dei-rivali");
  });
});

describe("prezzo relativo — il rilancio minimo è di regolamento", () => {
  it("porta la sua casa normativa scritta accanto al numero", () => {
    // §D9 vuole la provenienza ACCANTO al numero, non in un documento che
    // qualcuno dovrà ricordarsi di aprire. Questa sonda legge il sorgente dal
    // disco e diventa rossa il giorno in cui la citazione sparisce: senza di
    // essa `MINIMUM_RAISE = 1` sarebbe indistinguibile da un 1 scelto stasera.
    //
    // Il regolamento vive nel repository privato e qui si cita PER NOME e
    // SEZIONE, come già fanno absoluteValue.ts (§3, `initial_auction_budget`) e
    // anchors.ts: nessun dato privato attraversa il confine, solo il riferimento.
    const src = readFileSync(new URL("../src/relativeValue.ts", import.meta.url), "utf8");
    const docblock = src.slice(0, src.indexOf("export const MINIMUM_RAISE"));
    expect(docblock).toContain("docs/data/LEAGUE_RULES.md");
    expect(docblock).toContain("min_bid_increment");
    expect(docblock).toContain("§3-bis");
  });

  it("è il RILANCIO: il prezzo batte il secondo, ed è il più basso che lo batte", () => {
    // Il legame col regolamento non è `toBe(1)` — vero anche per un 1
    // inventato —, è il SIGNIFICATO del numero: «rilancio minimo +1 credito»
    // vuol dire che l'offerta che vince è la più piccola strettamente maggiore
    // di quella del secondo. Un 2 al posto dell'1 non sarebbe più minima; uno 0
    // non vincerebbe. Entrambe le mutazioni fanno cadere questa misura.
    for (const [label, state] of [
      ["esempio di Pico", PICO_STATE],
      ["cinque minuti dopo", AFTER_ROSSI_STATE],
    ] as const) {
      const reading = relativePriceReading({ state, role: "A", selfId: SELF });
      expect(reading.kind, label).toBe("prezzo");
      if (reading.kind !== "prezzo") continue;
      // Vince: sta SOPRA il secondo.
      expect(reading.credits, label).toBeGreaterThan(reading.chain.secondMaxBid);
      // Ed è il più basso che vince: un credito meno e si pareggia, non si vince.
      expect(reading.credits - 1, label).toBe(reading.chain.secondMaxBid);
      // Il rilancio è INTERO, come lo sono le offerte del regolamento.
      expect(Number.isInteger(MINIMUM_RAISE)).toBe(true);
    }
  });
});
