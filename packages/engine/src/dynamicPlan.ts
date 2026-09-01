// `PLAN*` — IL PIANO DINAMICO (NOM-PROTOCOL-A §A.4). Puro, deterministico,
// engine-only: nessuna UI, nessuna rete, nessun dato reale.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE COSA CAMBIA RISPETTO AL PIANO DI IERI
// ─────────────────────────────────────────────────────────────────────────────
//
// Il piano rosa di ieri era una DICHIARAZIONE A MONTE: Pico scriveva un target
// per ruolo, il motore lo teneva vivo contro la spesa (`livePlan`,
// ./livePlan.ts) e il sottoblocco «PER ME» taceva finché quella dichiarazione
// non esisteva. Qui il piano è invece una FUNZIONE PURA DELLO STATO,
// ricalcolata a ogni evento: nessun input manuale, nessun peso, nessuna
// finestra da indovinare.
//
// IL «MOMENTO GIUSTO» NON È UNA PREVISIONE: È IL RICALCOLO. Quando un ruolo si
// svuota i `P̂` dei superstiti non cambiano, ma il completamento sì — i
// candidati spariscono dal passo 1 e il piano si riscrive da solo. Non esiste
// da nessuna parte in questo file un «sparirà fra N chiamate»: quella stima
// resta vietata (`nominationWindow.ts` è codice senza uso in questo
// regolamento, DECISIONS 2026-08-24) e non serve.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'ALGORITMO, PASSO PER PASSO — è tutta l'aritmetica che c'è
// ─────────────────────────────────────────────────────────────────────────────
//
//   1. candidati = liberi con `V` e `P̂`, nei ruoli con `slotsRemaining > 0`
//   2. ordina per `S(i)` DECRESCENTE; pareggi: `V` decrescente, poi chiave
//   3. scorri: prendi `i` se
//         `P̂(i) ≤ B_disponibile − hardReserve(slot restanti dopo di lui)`
//      e il suo ruolo ha ancora slot non pianificati; al prendere, scala
//      budget e slot
//   4. gli slot rimasti senza candidato sono pianificati a `COST_FLOOR`
//
//   output: `TARGET*` (i presi al passo 3), `alloc*[r]` (Σ `P̂` dei presi del
//   ruolo + `COST_FLOOR` × slot residui), `planVersion = "NOM-DYN@<seq>"`.
//
// L'ORDINE DEL PASSO 2 È L'ORDINE DI `S`, CHE È UNA SOTTRAZIONE — non un
// punteggio composto, non una combinazione pesata. I due pareggi (`V`
// decrescente, poi chiave) non sono criteri di merito: sono ciò che rende
// l'ordine TOTALE, cioè ciò che rende il piano riproducibile.
//
// LA RISERVA È INTERROGATA, MAI RIDERIVATA. Il vincolo del passo 3 è la stessa
// riserva dura di `maxSafe` (./auction.ts) e si chiede a `hardReserve()`, che
// è la sola funzione del progetto che la calcoli. Scrivere qui
// `slot × COST_FLOOR` sarebbe una seconda copia della stessa regola, cioè una
// seconda occasione di divergere dal libro mastro il giorno in cui il
// regolamento cambia il pavimento.
//
// PERCHÉ IL GREEDY È QUELLO GIUSTO, E NON UNA SEMPLIFICAZIONE. Il vincolo del
// passo 3 non è un budget solo: è budget MENO la riserva degli slot che
// restano, e ogni presa consuma esattamente uno slot. Il DTI §A.4 prescrive
// questa forma (la stessa del completamento di GEN §D.11/T7 applicata a me) e
// questo file la esegue alla lettera: qualunque altra ottimizzazione sarebbe
// una scelta che nessuno ha dichiarato.
//
// NESSUN NUMERO DIRETTIVO ESCE DA QUI. `alloc*[r]` è una somma di prezzi
// attesi, non una cifra da offrire; `P̂` viaggia col proprio blocco
// d'incertezza dove è nato (./expectedPrice.ts) e questo modulo non lo tocca.
// Un `maxSafe` non compare mai come numero da mettere sul tavolo: qui compare
// solo la RISERVA che quel tetto impone al completamento.

import { hardReserve } from "./auction.js";
import { COST_FLOOR, ROLES, type Role } from "./types.js";

/**
 * Il prefisso della versione del piano. `NOM-DYN@<seq dell'ultimo evento>`: la
 * versione non è un numero scelto, è la POSIZIONE NEL LOG a cui questo piano
 * corrisponde — due letture con lo stesso `seq` producono lo stesso piano, e
 * una spiegazione che porta la propria `planVersion` dice esattamente quale
 * stato del tavolo l'ha prodotta.
 */
export const DYNAMIC_PLAN_VERSION_PREFIX = "NOM-DYN@";

/**
 * La versione del piano per un dato `seq` di log.
 *
 * `state.lastSeq` vale `-1` su un log vuoto (./reduce.ts) e quel `-1` si
 * riporta com'è: è la pre-asta, ed è un fatto. Sostituirlo con uno `0`
 * inventato farebbe sembrare che un evento ci sia stato.
 */
export function dynamicPlanVersion(lastSeq: number): string {
  return `${DYNAMIC_PLAN_VERSION_PREFIX}${lastSeq}`;
}

/**
 * Un candidato al completamento: il giocatore con le DUE grandezze misurate
 * che il piano usa, e nient'altro.
 *
 * `surplus` NON È OPZIONALE ed è il motivo per cui questo tipo esiste invece di
 * far passare una `SurplusReading`: al passo 1 entrano i soli liberi che hanno
 * SIA `V` SIA `P̂`, quindi `S = V − P̂` esiste per costruzione. Un candidato
 * senza surplus non è un candidato «in fondo alla lista»: è un candidato che il
 * passo 1 non ha lasciato entrare, e il chiamante lo sa prima di arrivare qui.
 */
export interface DynamicPlanCandidate {
  /** La chiave di listone: la stessa identità dell'event log. */
  readonly playerId: string;
  readonly role: Role;
  /** `V(i)` in crediti (§A.1). */
  readonly value: number;
  /** `P̂(i)` in crediti (§A.2). */
  readonly expectedPrice: number;
  /** `S(i) = V(i) − P̂(i)` (§A.3). Può essere ≤ 0: ordina, non esclude. */
  readonly surplus: number;
}

export interface DynamicPlanInput {
  /** `B_me`: il budget residuo MIO, letto dallo stato e non riderivato. */
  readonly budget: number;
  /** `slotsRemaining[r]`: gli slot che mi restano, per ruolo. */
  readonly slotsRemaining: Readonly<Record<Role, number>>;
  /** I liberi con `V` e `P̂`. L'ordine d'ingresso non conta: il passo 2 ordina. */
  readonly candidates: readonly DynamicPlanCandidate[];
  /** `state.lastSeq`: la posizione nel log a cui questo piano corrisponde. */
  readonly lastSeq: number;
}

/**
 * Una presa del passo 3, con il vincolo che l'ha lasciata passare scritto
 * accanto: chi guarda `TARGET*` deve poter rifare a mano la disuguaglianza che
 * ha deciso, esattamente come `RelativePriceChain` (./relativeValue.ts) porta
 * i tre numeri del proprio tetto.
 */
export interface DynamicPlanPick {
  readonly playerId: string;
  readonly role: Role;
  readonly value: number;
  readonly expectedPrice: number;
  readonly surplus: number;
  /** `B_disponibile` PRIMA di questa presa. */
  readonly budgetBefore: number;
  /** Gli slot non ancora pianificati che restano DOPO di lui. */
  readonly slotsAfter: number;
  /** `hardReserve(slotsAfter)`: la riserva che questa presa ha dovuto lasciare. */
  readonly reserveAfter: number;
  /** `budgetBefore − reserveAfter`: il tetto che `P̂` ha dovuto rispettare. */
  readonly ceiling: number;
}

/** La riga del piano per un ruolo: quanti slot, quanto pianificato, quanto a pavimento. */
export interface DynamicPlanRoleLine {
  readonly role: Role;
  /** Gli slot che mi restano nel ruolo, letti dallo stato. */
  readonly slotsRemaining: number;
  /** Quanti di quegli slot il passo 3 ha riempito con un candidato vero. */
  readonly slotsPlanned: number;
  /** Quanti restano senza candidato: il passo 4 li pianifica a `COST_FLOOR`. */
  readonly slotsAtFloor: number;
  /** Σ `P̂` dei presi del ruolo. */
  readonly plannedSpend: number;
  /** `COST_FLOOR × slotsAtFloor`. */
  readonly floorSpend: number;
  /** `alloc*[r] = plannedSpend + floorSpend`. */
  readonly allocation: number;
}

/**
 * Il piano, più tutta la contabilità che l'ha prodotto.
 *
 * SI COSTRUISCE UNA VOLTA PER LETTURA, come `CreditValueBook` e come
 * `ExposureBook`: il completamento è una proprietà della POPOLAZIONE — non si
 * può sapere se un giocatore è nel piano senza aver scorso tutti quelli che lo
 * precedono — e quindi non esiste una funzione «piano di uno» da chiamare per
 * candidato. `withinDynamicPlan` è una ricerca su `Set`.
 */
export interface DynamicPlan {
  /** `NOM-DYN@<seq>`. Viaggia con ogni spiegazione che il piano ha prodotto. */
  readonly planVersion: string;
  /** Il pavimento in vigore, ispezionabile accanto ai numeri che governa. */
  readonly costFloor: number;
  readonly budget: number;
  /** Σ `slotsRemaining[r]`: gli slot da completare all'inizio del passo 3. */
  readonly slotsTotal: number;
  /** `TARGET*`, NELL'ORDINE IN CUI IL PASSO 3 LI HA PRESI. */
  readonly targets: readonly DynamicPlanPick[];
  /** Le stesse chiavi, per la domanda «è nel piano?». */
  readonly targetIds: ReadonlySet<string>;
  readonly perRole: Readonly<Record<Role, DynamicPlanRoleLine>>;
  /** Σ `P̂` dei presi, su tutti i ruoli. */
  readonly plannedSpend: number;
  /** `COST_FLOOR ×` slot rimasti senza candidato, su tutti i ruoli. */
  readonly floorSpend: number;
  /** `plannedSpend + floorSpend`: quanto il piano impegna in tutto. */
  readonly allocated: number;
  /**
   * `budget − allocated`. PUÒ ESSERE NEGATIVO, e allora è un fatto e non un
   * bug: il passo 4 pianifica a pavimento ANCHE gli slot che il budget non
   * copre più, perché «questo slot costerà almeno 1» resta vero anche quando
   * il credito per pagarlo non c'è. Nasconderlo azzerando la differenza
   * direbbe che la rosa si completa quando non si completa.
   */
  readonly budgetLeft: number;
  /** Quanti candidati sono entrati al passo 1. */
  readonly considered: number;
  /** Quanti il passo 3 ha scartato perché il tetto non li copriva. */
  readonly skippedByCeiling: number;
  /** Quanti il passo 3 ha scartato perché il loro ruolo era già pianificato. */
  readonly skippedByRoleFull: number;
  /**
   * Quanti ingressi sono stati esclusi perché portavano un numero non finito o
   * un ruolo senza slot. Contati, mai silenziati: un `NaN` che attraversasse la
   * disuguaglianza la renderebbe falsa in silenzio per tutti quelli dopo di lui.
   */
  readonly excluded: number;
}

/**
 * IL PASSO 2, ESPORTATO PERCHÉ SIA ISPEZIONABILE. `S` decrescente, `V`
 * decrescente, chiave crescente.
 *
 * I due pareggi non sono criteri di merito aggiunti di nascosto: senza di loro
 * l'ordine non sarebbe TOTALE, e un ordine non totale rende il piano dipendente
 * dall'ordine con cui il chiamante ha scritto l'array — cioè non riproducibile.
 * È lo stesso idioma di `precedents.ts`, `competitors.ts` e `baitCandidates.ts`.
 */
export function compareDynamicPlanCandidates(
  a: DynamicPlanCandidate,
  b: DynamicPlanCandidate,
): number {
  return (
    b.surplus - a.surplus || b.value - a.value || a.playerId.localeCompare(b.playerId)
  );
}

const emptyLine = (role: Role, slotsRemaining: number): DynamicPlanRoleLine => ({
  role,
  slotsRemaining,
  slotsPlanned: 0,
  slotsAtFloor: slotsRemaining,
  plannedSpend: 0,
  floorSpend: slotsRemaining * COST_FLOOR,
  allocation: slotsRemaining * COST_FLOOR,
});

/**
 * `PLAN*` allo stato corrente.
 *
 * Deterministica e TOTALE: stesso budget + stessi slot + stessi candidati →
 * stesso piano, sempre; e ogni ingresso produce un piano, mai un'eccezione —
 * niente lanci sul percorso critico di un'asta. Un input degenere (budget
 * negativo, slot non interi, numeri non finiti) non produce un piano
 * inventato: produce un piano in cui quegli ingressi sono esclusi e CONTATI.
 */
export function dynamicPlan(input: DynamicPlanInput): DynamicPlan {
  // Gli slot si leggono normalizzati a interi non negativi: un `-1` o un `2,5`
  // non sono uno slot, e passarli a `hardReserve` (che lancia sui negativi)
  // farebbe uscire un'eccezione dal percorso critico.
  const slots = {} as Record<Role, number>;
  let slotsUnplanned = 0;
  for (const role of ROLES) {
    const raw = input.slotsRemaining[role];
    const n = Number.isInteger(raw) && raw > 0 ? raw : 0;
    slots[role] = n;
    slotsUnplanned += n;
  }
  const slotsTotal = slotsUnplanned;

  const usable: DynamicPlanCandidate[] = [];
  let excluded = 0;
  for (const c of input.candidates) {
    const finite =
      Number.isFinite(c.value) && Number.isFinite(c.expectedPrice) && Number.isFinite(c.surplus);
    if (!finite || slots[c.role] <= 0) {
      excluded += 1;
      continue;
    }
    usable.push(c);
  }
  usable.sort(compareDynamicPlanCandidates);

  const plannedByRole = {} as Record<Role, number>;
  const spendByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    plannedByRole[role] = 0;
    spendByRole[role] = 0;
  }

  const targets: DynamicPlanPick[] = [];
  const targetIds = new Set<string>();
  let available = Number.isFinite(input.budget) ? input.budget : 0;
  let skippedByCeiling = 0;
  let skippedByRoleFull = 0;

  for (const c of usable) {
    if (slotsUnplanned <= 0) break; // niente più da completare: il piano è chiuso
    if (plannedByRole[c.role] >= slots[c.role]) {
      skippedByRoleFull += 1;
      continue;
    }
    const slotsAfter = slotsUnplanned - 1;
    const reserveAfter = hardReserve(slotsAfter);
    const ceiling = available - reserveAfter;
    if (c.expectedPrice > ceiling) {
      skippedByCeiling += 1;
      continue;
    }
    targets.push({
      playerId: c.playerId,
      role: c.role,
      value: c.value,
      expectedPrice: c.expectedPrice,
      surplus: c.surplus,
      budgetBefore: available,
      slotsAfter,
      reserveAfter,
      ceiling,
    });
    targetIds.add(c.playerId);
    plannedByRole[c.role] += 1;
    spendByRole[c.role] += c.expectedPrice;
    available -= c.expectedPrice;
    slotsUnplanned = slotsAfter;
  }

  const perRole = {} as Record<Role, DynamicPlanRoleLine>;
  let plannedSpend = 0;
  let floorSpend = 0;
  for (const role of ROLES) {
    const slotsRemaining = slots[role];
    const slotsPlanned = plannedByRole[role];
    const slotsAtFloor = slotsRemaining - slotsPlanned;
    const planned = spendByRole[role];
    const floor = slotsAtFloor * COST_FLOOR;
    perRole[role] =
      slotsPlanned === 0
        ? emptyLine(role, slotsRemaining)
        : {
            role,
            slotsRemaining,
            slotsPlanned,
            slotsAtFloor,
            plannedSpend: planned,
            floorSpend: floor,
            allocation: planned + floor,
          };
    plannedSpend += planned;
    floorSpend += floor;
  }

  const allocated = plannedSpend + floorSpend;
  return {
    planVersion: dynamicPlanVersion(input.lastSeq),
    costFloor: COST_FLOOR,
    budget: input.budget,
    slotsTotal,
    targets,
    targetIds,
    perRole,
    plannedSpend,
    floorSpend,
    allocated,
    budgetLeft: input.budget - allocated,
    considered: usable.length,
    skippedByCeiling,
    skippedByRoleFull,
    excluded,
  };
}

/**
 * `withinPlan(i) ⟺ i ∈ TARGET*`. Una ricerca su `Set`: il completamento è già
 * stato calcolato una volta per tutti quando il piano è stato costruito.
 */
export function withinDynamicPlan(plan: DynamicPlan, playerId: string): boolean {
  return plan.targetIds.has(playerId);
}

// ─── LE GUARDIE DI TIPO ──────────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, vivono ACCANTO alla dichiarazione e non hanno
// bisogno che vitest giri. Stessa famiglia di quelle di ./expectedPrice.ts e
// ./creditValue.ts.

/** Le chiavi che un tipo dichiara OBBLIGATORIE. Stessa forma di ./expectedPrice.ts. */
type EmptyObject = { readonly [K in never]: never };
type RequiredKeysOf<T> = {
  [K in keyof T]-?: EmptyObject extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Una presa non esiste senza la disuguaglianza che l'ha lasciata passare: il
 * tetto, la riserva e il budget di partenza sono obbligatori quanto il prezzo.
 * Renderne uno opzionale finisce nello stesso hunk di diff di questa riga.
 */
type AssertPickCarriesItsConstraint = "expectedPrice" | "budgetBefore" | "reserveAfter" | "ceiling" extends
  RequiredKeysOf<DynamicPlanPick>
  ? true
  : never;
const _pickCarriesItsConstraint: AssertPickCarriesItsConstraint = true;
void _pickCarriesItsConstraint;

/**
 * UN CANDIDATO PORTA IL SURPLUS, NON UNA SUA ASSENZA. `surplus: number` e non
 * `number | null`: il passo 1 ammette i soli liberi che hanno sia `V` sia `P̂`,
 * e un `null` qui aprirebbe la porta a un ordinamento su un'assenza — cioè al
 * ripiego (`0`, `−Infinity`) che tutto questo motore rifiuta.
 */
type AssertCandidateSurplusIsMeasured = null extends DynamicPlanCandidate["surplus"]
  ? never
  : true;
const _candidateSurplusIsMeasured: AssertCandidateSurplusIsMeasured = true;
void _candidateSurplusIsMeasured;
