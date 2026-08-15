// Scenario sintetico DETERMINISTICO per la misura di performance dello strato
// 3 (radar occasioni). Stessa postura di layer2Fixtures/layer3Fixtures: NON è
// un file di test (non matcha `*.test.ts`), è il laboratorio su cui girano il
// benchmark e il test di regressione.
//
// ZERO DATI REALI, per costruzione: nessun nome di giocatore, nessuna Qt.A e
// nessun prezzo è copiato da un listone o da un foglio di Owner. Ogni numero
// nasce qui da un PRNG SEMINATO (`mulberry32`), quindi lo scenario è
// riproducibile bit-per-bit su qualunque macchina: senza questa proprietà una
// misura di performance non è confrontabile con se stessa e un test di
// regressione non è rosso per il motivo giusto.
//
// La FORMA dello scenario imita la sagoma operativa reale — un listone di
// Serie A per il classico (~550 righe), otto squadre, un'asta a metà strada —
// perché una misura presa su una fixture da dieci righe non dice niente su
// cosa succede la sera dell'asta. Le proporzioni per ruolo sono quelle di un
// listone (3 portieri, 8-9 difensori, 8-9 centrocampisti, 6-7 attaccanti per
// squadra di Serie A), non una scelta libera.

import {
  anchorBook,
  declaredValueBook,
  livePlan,
  measuredInflation,
  nominationWindow,
  reduce,
  ROLES,
  ROSTER_REQUIREMENTS,
  type AuctionEvent,
  type DeclaredDataQuality,
  type DeclaredPlayerValue,
  type OpportunityRadarInput,
  type PlayerAnchor,
  type Role,
} from "../src/index.js";
import { FANTA_TEAM_IDS } from "../fixtures/synthetic.js";
import { plan } from "./layer3Fixtures.js";
import { TS } from "./layer2Fixtures.js";

/**
 * PRNG seminato (mulberry32): 32 bit di stato, nessuna dipendenza, stessa
 * sequenza ovunque. `Math.random()` qui sarebbe un bug — renderebbe la misura
 * non riproducibile e il test di regressione intermittente.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Composizione per ruolo di un listone di Serie A, in quota sul totale. */
const ROLE_SHARE: Readonly<Record<Role, number>> = { P: 0.11, D: 0.34, C: 0.34, A: 0.21 };

/** Quote di Qt.A di un listone: molte righe da pochi crediti, poche da tante. */
function drawQuotation(rnd: () => number): number {
  const u = rnd();
  if (u < 0.55) return 1 + Math.floor(rnd() * 4); // 1..4
  if (u < 0.8) return 5 + Math.floor(rnd() * 8); // 5..12
  if (u < 0.93) return 13 + Math.floor(rnd() * 13); // 13..25
  return 26 + Math.floor(rnd() * 30); // 26..55
}

export interface PerfScenario {
  readonly input: OpportunityRadarInput;
  /** Righe del listone ancorate (A). */
  readonly assets: number;
  /** Valori dichiarati in ingresso al radar (D). */
  readonly declared: number;
  /** Giocatori fuori mercato nello stato (venduti/riconfermati). */
  readonly purchased: number;
}

/**
 * A che punto è l'asta. Non è un dettaglio: è la variabile che decide QUANTI
 * candidati sopravvivono alle condizioni d'ingresso, cioè quante volte gira il
 * loop interno.
 *
 *  - `mid`: metà asta, ~112 giocatori fuori mercato. Il caso "medio".
 *  - `early`: appena scaldata — solo il minimo di acquisti che rende misurabile
 *    l'inflazione di ruolo (`MIN_INFLATION_SAMPLE` per ruolo). È il caso
 *    realistico PIÙ PESANTE in assoluto: listone quasi intatto, budget pieno,
 *    max bid che copre ogni ancora, quindi l'unico filtro vero è `surplus > 0`.
 *    È anche il momento in cui una plancia viene guardata di più.
 *  - `late`: asta avanzata, con REPARTI RIVALI CHIUSI. Non è un caso pesante ed
 *    è lì per un'altra ragione: è l'unica fase in cui `competitorSet` dipende
 *    davvero dal RUOLO (il ramo `role-full` di `maxSafe`). Senza reparti pieni
 *    l'insieme eleggibile è identico su tutti e quattro i ruoli, e un test di
 *    identità non vedrebbe la differenza fra riusare il risultato per (ruolo,
 *    soglia) e riusarlo per la sola soglia — cioè non proverebbe niente sulla
 *    memoizzazione. Misurato: senza questa fase quella mutazione passa il test.
 */
export type PerfPhase = "early" | "mid" | "late";

const SELF = FANTA_TEAM_IDS[0]!;

/**
 * Uno scenario a `assets` righe di listone e `declared` valori dichiarati, con
 * un'asta a metà strada: mercato già scaldato (inflazione di ruolo misurabile
 * su ogni ruolo, quindi il gate di qualità può davvero passare), la propria
 * squadra con slot aperti in tutti e quattro i ruoli e un max bid che copre
 * quasi ogni ancora. È il caso realistico PIÙ PESANTE per il radar: nessuna
 * condizione d'ingresso scarta i candidati in blocco, quindi il loop interno
 * gira davvero.
 *
 * Quando `declared > assets` gli id in eccesso sono deliberatamente NON
 * ancorati: è il caso reale di un foglio valori più vecchio del listone, e
 * misura il costo del ramo che esce subito.
 */
export function perfScenario(
  assets: number,
  declared: number,
  phase: PerfPhase = "mid",
  seed = 20260815,
): PerfScenario {
  const rnd = mulberry32(seed);

  // --- listone sintetico -------------------------------------------------
  const anchors: PlayerAnchor[] = [];
  const byRole: Record<Role, PlayerAnchor[]> = { P: [], D: [], C: [], A: [] };
  const width = String(assets).length;
  let index = 0;
  for (const role of ROLES) {
    const count =
      role === "A" ? assets - index : Math.max(1, Math.round(assets * ROLE_SHARE[role]));
    for (let i = 0; i < count && index < assets; i++, index++) {
      const a: PlayerAnchor = {
        playerId: `syn${String(index).padStart(width, "0")}`,
        role,
        quotation: drawQuotation(rnd),
      };
      anchors.push(a);
      byRole[role].push(a);
    }
  }
  const book = anchorBook(anchors);

  // --- asta a metà strada -------------------------------------------------
  // Il numero di giocatori venduti in un'asta reale non dipende dalla LUNGHEZZA
  // del listone ma dagli slot del tavolo (8 x 28 = 224): a metà asta ne sono
  // usciti ~100. Su listoni corti si limita alla frazione che il listone regge.
  const totalPurchases =
    phase === "early"
      ? 20
      : phase === "late"
        ? Math.min(196, Math.floor(assets * 0.6))
        : Math.min(112, Math.floor(assets * 0.3));
  const perRolePurchases = {} as Record<Role, number>;
  for (const role of ROLES) {
    // >= 5 per ruolo: sotto MIN_INFLATION_SAMPLE l'inflazione di ruolo non è
    // sufficiente e il gate di qualita non promuoverebbe MAI nessuno.
    perRolePurchases[role] = Math.max(
      5,
      Math.round((totalPurchases * ROSTER_REQUIREMENTS[role]) / 28),
    );
  }

  const specs: { playerId: string; role: Role; team: string; price: number }[] = [];
  const filled: Record<string, Record<Role, number>> = {};
  for (const id of FANTA_TEAM_IDS) filled[id] = { P: 0, D: 0, C: 0, A: 0 };

  // Capienza per ruolo: i rivali possono riempirsi, la PROPRIA squadra no.
  // A meta asta si e' comprata meta rosa, non tutta: se si riempisse, `maxSafe`
  // tornerebbe `role-full` su ogni ruolo, ogni candidato uscirebbe alla
  // condizione 3 e il benchmark misurerebbe un loop vuoto invece del radar.
  const capacity = (team: string, role: Role): number =>
    team === SELF
      ? Math.floor(ROSTER_REQUIREMENTS[role] / 2)
      : ROSTER_REQUIREMENTS[role];

  for (const role of ROLES) {
    const pool = byRole[role];
    const want = Math.min(perRolePurchases[role], pool.length);
    let cursor = 0;
    let turn = 0;
    for (let k = 0; k < want; k++) {
      // Giro fisso su tutte e otto le squadre, saltando chi ha il ruolo pieno:
      // la propria compra come le altre finche' ha capienza.
      let team: string | null = null;
      for (let probe = 0; probe < FANTA_TEAM_IDS.length; probe++) {
        const cand = FANTA_TEAM_IDS[(turn + probe) % FANTA_TEAM_IDS.length]!;
        if (filled[cand]![role] < capacity(cand, role)) {
          team = cand;
          turn = (turn + probe + 1) % FANTA_TEAM_IDS.length;
          break;
        }
      }
      if (team === null) break; // tavolo saturo su questo ruolo
      // Riga del listone estratta in ordine di generazione: le Qt.A sono gia
      // sparse dal PRNG, quindi il venduto e un mix di care e economiche.
      const pick = pool[cursor % pool.length]!;
      cursor += 1;
      filled[team]![role] += 1;
      const inflation = 1.12 + rnd() * 0.24; // +12% .. +36% misurato, non imposto
      specs.push({
        playerId: pick.playerId,
        role,
        team,
        price: Math.max(1, Math.round(pick.quotation * inflation)),
      });
    }
  }

  const log: AuctionEvent[] = specs.map((s, i) => ({
    type: "PURCHASE" as const,
    seq: i,
    ts: TS,
    playerId: s.playerId,
    role: s.role,
    fantaTeamId: s.team,
    price: s.price,
  }));
  const state = reduce(log, FANTA_TEAM_IDS);

  // --- valori dichiarati di Owner ----------------------------------------
  // Le righe valutate si estraggono da TUTTO il listone, non dal suo prefisso:
  // il prefisso è correlato con l'ordine in cui il generatore vende (stessa
  // sorgente), e prenderlo così darebbe scenari in cui ogni riga dichiarata è
  // già fuori mercato — cioè un benchmark che misura il ramo che esce subito.
  // Fisher-Yates con lo STESSO PRNG seminato: mescolato, non casuale.
  const order = anchors.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  const values: DeclaredPlayerValue[] = [];
  const quality: DeclaredDataQuality[] = [];
  for (let i = 0; i < declared; i++) {
    if (i < anchors.length) {
      const a = anchors[order[i]!]!;
      // f in [0,70 .. 1,90]: circa la meta delle righe dichiarate batte
      // l'ancora corretta, l'altra meta no. Nessuna scorciatoia: i candidati
      // che escono subito e quelli che arrivano in fondo convivono.
      const f = 0.7 + rnd() * 1.2;
      values.push({ playerId: a.playerId, declaredValue: Math.max(1, Math.round(a.quotation * f)) });
      const u = rnd();
      if (u < 0.5) quality.push({ playerId: a.playerId, level: "alta" });
      else if (u < 0.6) quality.push({ playerId: a.playerId, level: "alta", unclearedNews: true });
      else if (u < 0.85) quality.push({ playerId: a.playerId, level: "media" });
      // il resto resta senza etichetta: e' il ramo "quality-label-missing"
    } else {
      values.push({ playerId: `stale${i}`, declaredValue: 1 + Math.floor(rnd() * 40) });
    }
  }

  const team = state.teams[SELF]!;
  return {
    input: {
      book,
      values: declaredValueBook(values),
      state,
      inflation: measuredInflation(log, book),
      selfId: SELF,
      plan: livePlan({ team, plan: plan({ P: 25, D: 90, C: 150, A: 235 }, "perf-plan-1") }),
      window: nominationWindow(FANTA_TEAM_IDS, FANTA_TEAM_IDS[2]!, SELF),
      quality,
    },
    assets,
    declared,
    purchased: state.purchasedPlayerIds.length,
  };
}

/** La griglia di dimensioni operative su cui si misura e si prova l'identità. */
export const PERF_GRID_ASSETS: readonly number[] = [200, 500, 600, 1000];
export const PERF_GRID_DECLARED: readonly number[] = [10, 50, 100, 200, 500];
