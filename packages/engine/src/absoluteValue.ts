// IL VALORE ASSOLUTO IN CREDITI — la scala DERIVATA dal regolamento, e le tre
// gambe che la spostano. Puro, deterministico, engine-only: nessuna UI,
// nessun I/O, nessun dato reale, nessun orologio.
//
// ─── CHE COSA CAMBIA RISPETTO A PRIMA ───────────────────────────────────────
//
// Fino a oggi lo slot «valore assoluto in crediti» del riquadro era modellato
// come una DICHIARAZIONE DI PICO GIOCATORE PER GIOCATORE (`declaredValues.ts`,
// «quanto vale QUEL giocatore PER OWNER»), e restava `n/d` perché nessuna
// sorgente dell'app raccoglieva 532 righe di listino. La decisione di Pico del
// 2026-08-24 smonta quel modello in tre passaggi:
//
//   1. «non esiste il valore in crediti per me»: esistono il valore ASSOLUTO e
//      quello RELATIVO al momento dell'asta;
//   2. le tre gambe del valore assoluto (dichiarate il 2026-08-21) sono
//      CONCORRENZA NEL RUOLO, COPPE EUROPEE E TURNOVER, VALUTAZIONE DEL GRUPPO
//      ESPERTI, e le prime due non richiedono né rose né calendari;
//   3. la SCALA IN CREDITI viene dal REGOLAMENTO: il budget d'asta ripartito
//      sugli slot della rosa.
//
// Conseguenza operativa, ed è la ragione per cui questo file può esistere:
// NESSUNA DICHIARAZIONE GIOCATORE PER GIOCATORE. La scala si deriva, le gambe
// la correggono. `declaredValues.ts` resta intatto e continua ad alimentare la
// catena FTM (`callScreen.ts`): questo modulo non lo sostituisce e non lo legge.
//
// ─── LA CATENA DELLA DERIVAZIONE, PASSO PER PASSO ───────────────────────────
//
// Ogni passo porta la propria provenienza, e nessun passo introduce un numero
// che nessuno abbia dichiarato o misurato:
//
// ```text
// INITIAL_BUDGET = 500            regolamento (docs/data/LEAGUE_RULES.md §3,
//   │                             `initial_auction_budget`), qui ./types.ts
//   │                             — entra come TETTO della somma dei target,
//   │                             esattamente come lo usa validateRolePlan()
//   ↓
// roleTargets[ruolo]              DICHIARATO DA PICO (src/rolePlan.ts,
//   │                             `DeclaredRolePlan.targets`). Chiave assente
//   │                             = ruolo NON DICHIARATO, e non è 0.
//   ↓
// ROSTER_REQUIREMENTS[ruolo]      regolamento (P 3, D 9, C 9, A 7), ./types.ts
//   │                             — gli stessi slot con cui tiers.ts conta le
//   │                             fasce, quindi #fasce === #slot per ruolo
//   ↓
// perSlot = target / slot         aritmetica dichiarata sui due sopra
//   ↓
// fascia del giocatore            buildTierBook (src/tierOrdering.ts) →
//   │                             TierBook: ordine del listone per indice di
//   │                             appetibilità, LOG-INDIPENDENTE per costruzione
//   ↓
// base = perSlot                  la quota dello slot che quella fascia occupa
// ```
//
// PERCHÉ LA QUOTA PER SLOT È LA STESSA PER OGNI FASCIA, e perché questa NON è
// una pigrizia. Il passaggio da fascia a crediti non può inventare una curva:
// una ripartizione che desse di più alla prima fascia e meno alla nona
// avrebbe bisogno di una FORMA (lineare? geometrica? a scaglioni?) e di
// parametri che nessun documento dichiara — cioè esattamente il peso nascosto
// che `docs/DECISIONS.md` §D9 vieta. Ripartire un totale fra N cose senza pesi
// dichiarati è `totale / N`: è aritmetica, non una scelta. La fascia resta
// carica di significato — dice SE il giocatore occupa uno slot del ruolo e
// QUALE — ma non può, da sola, differenziare la quota. Le differenze fra
// giocatori le portano le tre gambe, che è il posto in cui Pico ha detto che
// vivono. La lettura è comunque dichiarata aperta:
// `ABSOLUTE_BASE_UNIFORM_PER_SLOT` in `UNRATIFIED_CHOICES`.
//
// CHI STA OLTRE L'ULTIMA FASCIA NON HA UNA BASE. Con otto squadre al tavolo le
// fasce di un ruolo coprono `slot × squadre` giocatori — cioè esattamente tutti
// gli slot che il tavolo riempirà in quel ruolo. Chi resta nel FONDO non
// occupa nessuno slot nella ripartizione da cui la scala è derivata, quindi la
// scala non ha una quota da assegnargli: si dichiara `oltre-gli-slot-del-ruolo`
// invece di allungare l'ultima fascia fino a lui (che sarebbe di nuovo una
// curva). Anche questa è dichiarata aperta:
// `ABSOLUTE_BASE_EXCLUDES_FONDO`.
//
// ─── LE TRE GAMBE ───────────────────────────────────────────────────────────
//
// ```text
// valoreAssoluto(i) = base(i) + Σ_g  delta_g × posizione_g(i)
// ```
//
// `delta_g` È UN NUMERO DI PICO, in crediti, col segno — e oggi vale 0 per
// tutte e tre. Zero non è un valore di comodo: è il default che NON AGGIUNGE
// NULLA, l'unico che non mette in bocca a Pico un peso che non ha dichiarato.
// Due precedenti vincolanti dicono che questa è la forma giusta:
//
//   - `bandMargin = 0` (./callScreen.ts): «il default è 0 se Owner non dichiara
//     altro, e questa è una scelta di onestà, non una dimenticanza… un margine
//     di default inventato qui sarebbe esattamente il peso nascosto che §D9
//     vieta»;
//   - `ALPHA_BY_PROFILE` (./declaredValues.ts): un coefficiente può stare nel
//     codice senza violare §D9 quando è COPIATO da un documento canonico, con
//     la citazione accanto. Nessun documento canonico dichiara oggi i tre
//     delta: finché non li dichiara, il solo numero scrivibile è 0.
//
// Il giorno in cui Pico li dichiara cambiano QUI E SOLO QUI, in
// `ABSOLUTE_VALUE_DELTAS`, con accanto la citazione del record che li fissa.
//
// `posizione_g(i)` ESCE DALLA SCALA DELLA GAMBA STESSA, mai da una scelta:
//
//   - CONCORRENZA — l'ordinale del vocabolario chiuso del Gruppo Esperti
//     `titolare` / `ballottaggio` / `riserva`, che è il SIGNIFICATO DELLE
//     PAROLE e non un peso: tre parole ordinate, quella di mezzo al centro.
//     `+1 / 0 / −1`. Che la scala sia SIMMETRICA (passo uguale sopra e sotto
//     la parola di mezzo) è una lettura del motore, non del vocabolario:
//     `CONCORRENZA_SCALE_SYMMETRIC`.
//   - COPPE — PRESENZA O ASSENZA, non un opposto: «non gioca in Europa» è la
//     LINEA DI BASE (`0`), «ci gioca» è `1`. Il SEGNO — giocare di più contro
//     ruotare di più — sta in `delta`, cioè è di Pico, e questo file non ne sa
//     niente. Che l'assenza sia la linea di base e non `−1` è una lettura:
//     `COPPE_BASELINE_IS_ABSENCE`.
//   - PAGELLA — il totale sulla scala della fonte stessa: `totale / totaleMax`,
//     dove `totaleMax` è `PAGELLA_TOTALE_MAX` di src/pagellaEsperti.ts, che è
//     CALCOLATO (`PAGELLA_ASSI × PAGELLA_VOTO_MAX`) e non scritto a mano
//     apposta. Iniettato dal chiamante perché il motore non importa da `src/`.
//     Solo su pagelle COMPLETE, che è già la regola del modulo che le risolve.
//     Che la posizione sia il rapporto sul fondo scala (e non uno scarto dal
//     punto medio) è una lettura: `PAGELLA_POSITION_IS_TOTAL_OVER_MAX`.
//
// UNA GAMBA ASSENTE BLOCCA IL NUMERO SOLO SE PICO LE HA DATO UN PESO. Con
// `delta_g = 0` la sua assenza non può cambiare il risultato di un credito,
// quindi pretendere `n/d` sarebbe rumore: si dice che la gamba non c'è e il
// valore resta la base. Con `delta_g ≠ 0` l'assenza è un ingrediente mancante e
// il numero NON SI FORMA, col motivo che nomina QUALE gamba manca.
//
// ─── COSA NON C'È, DI PROPOSITO ─────────────────────────────────────────────
//
//  - NESSUN ARROTONDAMENTO AL PAVIMENTO DEL COSTO. Se la somma scende sotto
//    `COST_FLOOR` il numero non si aggiusta: si DICHIARA (`belowCostFloor`).
//    Un clamp sarebbe una scelta, e per giunta silenziosa;
//  - nessun `?? 0`, nessuna media di ruolo, nessuna imputazione: un
//    ingrediente che manca produce un'assenza col proprio motivo;
//  - nessun output direttivo: qui non nasce nessun `value`, `fair_to_me`,
//    `target_band`, `stretch_cap`, nessun consiglio e nessun prezzo di
//    mercato previsto (docs/NO_GO.md §Prodotto). Il numero dice quanto vale in
//    astratto, non che cosa fare stasera;
//  - nessuna dipendenza dalla serata. Vedi qui sotto.
//
// ─── L'INVARIANZA SERALE È UNA FIRMA, NON UNA PROMESSA ──────────────────────
//
// «Assoluto» significa che il numero NON SI MUOVE durante l'asta. La garanzia
// non è scritta in un commento e affidata alla disciplina: è la firma di
// `absoluteValueReading`, che riceve `AbsoluteValueInput` e NIENT'ALTRO. In
// quell'oggetto non c'è `AuctionState`, non c'è il log, non ci sono le rose,
// non c'è il budget residuo: non li ha, quindi non può contarli. La trappola
// nominata dal brief — contare «quelli ancora liberi» invece di «tutti» —
// è impossibile per costruzione, perché «quelli ancora liberi» non è
// esprimibile con questi ingressi. Il `TierBook` che entra è a sua volta
// log-indipendente per la stessa ragione (`computeTierBook` vede
// `(pool, source, teamsCount)` e nient'altro: src/tierOrdering.ts).
// Chi volesse aggiungere una dipendenza dalla serata dovrebbe allargare
// QUESTA interfaccia, e troverebbe questo paragrafo sopra il cursore.

import {
  type RatificationStatus,
  type UnratifiedChoiceId,
} from "./declaredValues.js";
import { type TierBook } from "./tiers.js";
import {
  type Role,
  COST_FLOOR,
  INITIAL_BUDGET,
  ROLES,
  ROSTER_REQUIREMENTS,
} from "./types.js";

// ─── Le scelte aperte che questa derivazione porta con sé ────────────────────

/**
 * Le letture del motore su cui poggia OGNI numero prodotto qui, dichiarate
 * aperte in blocco e non ramo per ramo.
 *
 * In blocco di proposito: sono le sei letture che danno FORMA alla derivazione,
 * non condizioni che si accendono su un caso. Dichiararne una in più è la
 * direzione sicura — chi legge sa che nessuna delle sei è firmata; dichiararne
 * una in meno significherebbe far passare per chiusa una domanda aperta.
 *
 * Stesso trattamento già in uso per `V_WITHOUT_EQUALS_OPPORTUNITY_COST`
 * (./callScreen.ts): il calcolo NON si toglie — servirà comunque — ma perde la
 * pretesa di essere un giudizio chiuso, e un test lo documenta senza approvarlo.
 */
export const ABSOLUTE_VALUE_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [
  "ABSOLUTE_BASE_UNIFORM_PER_SLOT",
  "ABSOLUTE_BASE_EXCLUDES_FONDO",
  "CONCORRENZA_SCALE_SYMMETRIC",
  "CONCORRENZA_ONLY_TITOLARITA",
  "COPPE_BASELINE_IS_ABSENCE",
  "PAGELLA_POSITION_IS_TOTAL_OVER_MAX",
];

const RATIFICATION: RatificationStatus = {
  ratified: false,
  unratifiedChoices: ABSOLUTE_VALUE_UNRATIFIED_CHOICES,
};

// ─── Le tre gambe ────────────────────────────────────────────────────────────

/** Le tre gambe dichiarate da Pico il 2026-08-21, nell'ordine in cui le ha dette. */
export const ABSOLUTE_VALUE_LEGS = ["concorrenza", "coppe", "pagella"] as const;
export type AbsoluteValueLegId = (typeof ABSOLUTE_VALUE_LEGS)[number];

/**
 * QUANTO SPOSTA CIASCUNA GAMBA, in crediti e col segno. **Numeri di Pico.**
 *
 * Tutti e tre a **0** oggi, e 0 significa «questa gamba non sposta niente»: è
 * il default che non aggiunge nulla, non un segnaposto in attesa di essere
 * riempito con una stima. Nessun documento canonico dichiara oggi questi tre
 * numeri — `grep` su `docs/` a vuoto — e i due precedenti vincolanti dicono
 * che questa è l'unica riga scrivibile finché non li dichiara:
 *
 *   - `bandMargin = 0` in ./callScreen.ts: «il default è 0 se Owner non
 *     dichiara altro, e questa è una scelta di onestà, non una dimenticanza…
 *     un margine di default inventato qui sarebbe esattamente il peso nascosto
 *     che §D9 vieta»;
 *   - `ALPHA_BY_PROFILE` in ./declaredValues.ts: un coefficiente sta nel
 *     codice senza violare §D9 solo se è COPIATO da un documento canonico, con
 *     la citazione accanto.
 *
 * IL GIORNO IN CUI PICO LI DICHIARA CAMBIANO QUI E SOLO QUI: nessun altro
 * punto del repository decide quanto pesa una gamba, e la citazione del record
 * che li fissa va scritta accanto ai numeri, come per gli α.
 */
export const ABSOLUTE_VALUE_DELTAS: Readonly<Record<AbsoluteValueLegId, number>> = {
  concorrenza: 0,
  coppe: 0,
  pagella: 0,
};

/**
 * IL VOCABOLARIO DELLA CONCORRENZA — copia fedele di `TITOLARITA_VALUES`
 * (src/expertScheda.ts, a sua volta copia fedele del segnale privato).
 *
 * Vive qui perché il motore non può importare da `src/`, e le due copie sono
 * tenute onesta da un test che le confronta parola per parola
 * (src/absoluteValue.wiring.test.ts): due vocabolari che divergono in silenzio
 * sono il difetto che una copia introduce, e questo è il modo di non averlo.
 *
 * L'ORDINE È IL SIGNIFICATO: dal più titolare al meno titolare. La posizione
 * della gamba è l'ordinale su questa lista, non un peso scritto altrove.
 */
export const CONCORRENZA_VOCABULARY = ["titolare", "ballottaggio", "riserva"] as const;
export type ConcorrenzaWord = (typeof CONCORRENZA_VOCABULARY)[number];

/**
 * L'ordinale del vocabolario, centrato sulla parola di mezzo: `+1 / 0 / −1`.
 *
 * È DERIVATO dalla lista, non scritto a mano: `centro − indice`, dove il
 * centro di tre parole è la seconda. Se un giorno il vocabolario avesse cinque
 * parole, la scala si allargherebbe da sola invece di restare a tre valori
 * cablati mentre le parole diventano cinque.
 */
export function concorrenzaPosition(word: ConcorrenzaWord): number {
  const index = CONCORRENZA_VOCABULARY.indexOf(word);
  const center = (CONCORRENZA_VOCABULARY.length - 1) / 2;
  return center - index;
}

/**
 * La pagella come la gamba 3 la vuole: il totale e il fondo scala della fonte.
 *
 * Entrambi INIETTATI, e il fondo scala insieme al totale: il motore non
 * importa `PAGELLA_TOTALE_MAX` da `src/`, e un fondo scala cablato qui
 * comincerebbe a mentire il giorno in cui la fonte passasse a sei assi — che
 * è esattamente la ragione per cui di là è calcolato e non scritto `50`.
 */
export interface PagellaTotaleInput {
  /** La somma dei cinque voti. Solo pagelle COMPLETE arrivano qui. */
  readonly totale: number;
  /** Il fondo scala della fonte: `PAGELLA_TOTALE_MAX`, mai un letterale. */
  readonly totaleMax: number;
}

/**
 * Gli ingressi delle tre gambe. `null` significa sempre e solo «la gamba non
 * ha il suo ingrediente», mai «vale zero»: le due cose portano a due esiti
 * diversi a seconda del delta, e confonderle è il difetto che questo tipo
 * esiste per non avere.
 */
export interface AbsoluteValueLegInputs {
  /** La titolarità dichiarata dal Gruppo Esperti, o `null` se la scheda non c'è. */
  readonly titolarita: ConcorrenzaWord | null;
  /**
   * Gioca una coppa europea? `null` = non lo sappiamo — ed è il valore che il
   * core pubblico porta finché l'elenco delle partecipanti non è stabilito da
   * fonti verificabili (src/serieACompetitions.ts). Entra come `bandMargin`
   * entra in `callScreen`: dal chiamante, mai dedotto qui.
   */
  readonly inEurope: boolean | null;
  /** Il totale della pagella, solo se COMPLETA; `null` altrimenti. */
  readonly pagella: PagellaTotaleInput | null;
}

/** Nessuna gamba ha il proprio ingrediente. Lo stato normale del core pubblico. */
export const NO_LEG_INPUTS: AbsoluteValueLegInputs = {
  titolarita: null,
  inEurope: null,
  pagella: null,
};

// ─── L'esito ─────────────────────────────────────────────────────────────────

/**
 * Perché il valore assoluto non esiste. Ogni motivo NOMINA LA COSA CHE MANCA:
 * chi legge deve poter capire se aspettare una dichiarazione di Pico, un dato
 * o niente del tutto.
 */
export type AbsoluteValueMissingReason =
  /** Nessun giocatore chiamato: non c'è soggetto di cui dire il valore. */
  | "nessun-chiamato"
  /** Pico non ha dichiarato il target di quel ruolo: la base non esiste. */
  | "ruolo-senza-target"
  /** Il target dichiarato non è un numero utilizzabile (NaN, negativo, ∞). */
  | "target-non-valido"
  /** La somma dei target dichiarati supera il budget del regolamento. */
  | "target-oltre-il-budget"
  /** Non c'è una fascia per lui: nessun ordinamento, ruolo non ordinato, o non ordinato. */
  | "fascia-assente"
  /** Ordinato, ma oltre l'ultima fascia: nessuno slot del ruolo gli corrisponde. */
  | "oltre-gli-slot-del-ruolo"
  /** La gamba CONCORRENZA ha un peso e non ha il suo ingrediente. */
  | "gamba-concorrenza-assente"
  /** La gamba COPPE ha un peso e non ha il suo ingrediente. */
  | "gamba-coppe-assente"
  /** La gamba PAGELLA ha un peso e non ha il suo ingrediente. */
  | "gamba-pagella-assente";

/** Il motivo di assenza che ciascuna gamba produce quando ha un peso e non l'ingrediente. */
export const LEG_MISSING_REASON: Readonly<
  Record<AbsoluteValueLegId, AbsoluteValueMissingReason>
> = {
  concorrenza: "gamba-concorrenza-assente",
  coppe: "gamba-coppe-assente",
  pagella: "gamba-pagella-assente",
};

/** Quanto ha spostato una gamba, e con che cosa. Ispezionabile riga per riga. */
export interface AbsoluteValueLegContribution {
  readonly leg: AbsoluteValueLegId;
  /** Il numero di Pico, in crediti col segno. */
  readonly delta: number;
  /** La posizione sulla scala della gamba; `null` = ingrediente assente. */
  readonly position: number | null;
  /** `delta × position`, oppure 0 quando il delta è 0 (gamba spenta). */
  readonly credits: number;
}

/**
 * LA CATENA, ESPOSTA. Non è decorazione: chi mostra il numero deve poter
 * mostrare da dove viene ogni suo pezzo, e un revisore deve poter rifare la
 * moltiplicazione a mano senza rileggere questo file.
 */
export interface AbsoluteValueChain {
  readonly role: Role;
  /** `INITIAL_BUDGET` — regolamento. Tetto della somma dei target. */
  readonly budget: number;
  /** Il target di quel ruolo, DICHIARATO da Pico. */
  readonly roleTarget: number;
  /** `ROSTER_REQUIREMENTS[role]` — regolamento. */
  readonly roleSlots: number;
  /** `roleTarget / roleSlots`: la quota di UNO slot di quel ruolo. */
  readonly perSlot: number;
  /** La fascia 1-based del giocatore: quale slot del ruolo occupa. */
  readonly tier: number;
  /** La base in crediti, prima delle gambe. */
  readonly base: number;
  /** Le tre gambe, sempre tutte e tre, sempre nello stesso ordine. */
  readonly legs: readonly AbsoluteValueLegContribution[];
  /** `base + Σ credits`. Mai arrotondato, mai clampato. */
  readonly total: number;
}

export type AbsoluteValueReading =
  | {
      readonly kind: "assente";
      readonly reason: AbsoluteValueMissingReason;
      readonly chain: null;
      readonly ratification: RatificationStatus;
    }
  | {
      readonly kind: "valore";
      /** Il numero, esatto. Può non essere intero e può stare sotto il pavimento. */
      readonly credits: number;
      /**
       * `true` quando `credits < COST_FLOOR`. SI DICHIARA, non si aggiusta: un
       * clamp al pavimento sarebbe una scelta, e una scelta silenziosa.
       */
      readonly belowCostFloor: boolean;
      readonly chain: AbsoluteValueChain;
      readonly ratification: RatificationStatus;
    };

export interface AbsoluteValueInput {
  /** Il chiamato, con la STESSA identità del libro delle fasce; `null` se non c'è. */
  readonly called: { readonly playerId: string; readonly role: Role } | null;
  /**
   * I target per ruolo DICHIARATI DA PICO. `Partial` come in src/rolePlan.ts:
   * chiave assente = ruolo NON DICHIARATO, e non è intercambiabile con 0.
   */
  readonly roleTargets: Readonly<Partial<Record<Role, number>>>;
  /** Il libro delle fasce, o `null` quando non c'è un ordine su cui poggiare. */
  readonly book: TierBook | null;
  readonly legs: AbsoluteValueLegInputs;
  /**
   * I delta di Pico. Omesso = `ABSOLUTE_VALUE_DELTAS`, cioè i tre zeri.
   *
   * Iniettabile per UNA ragione sola: provare che con un peso diverso da zero
   * la gamba assente BLOCCA il numero invece di scivolare via. L'app non passa
   * mai questo campo — passa la costante, per non avere due posti in cui un
   * peso possa nascere.
   */
  readonly deltas?: Readonly<Record<AbsoluteValueLegId, number>>;
}

const absent = (reason: AbsoluteValueMissingReason): AbsoluteValueReading => ({
  kind: "assente",
  reason,
  chain: null,
  ratification: RATIFICATION,
});

/** La posizione di una gamba, o `null` quando il suo ingrediente non c'è. */
function legPosition(leg: AbsoluteValueLegId, legs: AbsoluteValueLegInputs): number | null {
  switch (leg) {
    case "concorrenza":
      return legs.titolarita === null ? null : concorrenzaPosition(legs.titolarita);
    case "coppe":
      // PRESENZA O ASSENZA, non un opposto: l'assenza è la linea di base.
      return legs.inEurope === null ? null : legs.inEurope ? 1 : 0;
    case "pagella": {
      const p = legs.pagella;
      if (p === null) return null;
      // Un fondo scala non utilizzabile non produce una posizione inventata:
      // produce l'assenza della gamba, che è la verità.
      if (!Number.isFinite(p.totale) || !Number.isFinite(p.totaleMax) || p.totaleMax <= 0) {
        return null;
      }
      return p.totale / p.totaleMax;
    }
  }
}

/**
 * La somma dei target DICHIARATI. I ruoli non dichiarati non contano come 0:
 * non contano affatto — stessa regola di `declaredTotal` in src/rolePlan.ts.
 */
function declaredTargetsTotal(targets: Readonly<Partial<Record<Role, number>>>): number {
  let total = 0;
  for (const role of ROLES) {
    const value = targets[role];
    if (value !== undefined) total += value;
  }
  return total;
}

/**
 * Il valore assoluto in crediti del giocatore chiamato, o il motivo per cui
 * non esiste.
 *
 * Pura, totale e deterministica: ogni ingresso produce o un numero con la sua
 * catena o un'assenza col suo motivo, e non esiste un terzo esito. Non lancia
 * mai: la schermata di un'asta non può permettersi un'eccezione al posto di un
 * riquadro.
 */
export function absoluteValueReading(input: AbsoluteValueInput): AbsoluteValueReading {
  const { called, roleTargets, book, legs } = input;
  if (called === null) return absent("nessun-chiamato");

  const role = called.role;

  // ── Passo 1-2: il budget del regolamento, ripartito dai target di Pico ─────
  const roleTarget = roleTargets[role];
  if (roleTarget === undefined) return absent("ruolo-senza-target");
  if (!Number.isFinite(roleTarget) || roleTarget < 0) return absent("target-non-valido");
  // Fail-closed sul tetto del regolamento, lo stesso che `validateRolePlan`
  // impone (`total-exceeds-initial-budget`): da una dichiarazione che sfonda il
  // budget non si deriva una scala «quasi giusta», non se ne deriva nessuna.
  if (declaredTargetsTotal(roleTargets) > INITIAL_BUDGET) return absent("target-oltre-il-budget");

  // ── Passo 3-4: gli slot del ruolo, e la quota di uno slot ─────────────────
  const roleSlots = ROSTER_REQUIREMENTS[role];
  const perSlot = roleTarget / roleSlots;

  // ── Passo 5: dove sta il giocatore dentro il suo ruolo ────────────────────
  // Dal LIBRO, non dai fatti: `tierFacts()` porta anche occupazione e prezzi
  // pagati, che si muovono durante la serata. Qui serve solo la collocazione,
  // che è del libro e quindi ferma.
  if (book === null) return absent("fascia-assente");
  const index = book.byRole.get(role);
  if (index === undefined) return absent("fascia-assente");
  const tier = index.tierOf.get(called.playerId);
  if (tier === undefined) {
    // Due silenzi diversi, e non si fondono: chi non è nell'ordine non ha
    // verdetto dell'indice; chi è nell'ordine ma oltre l'ultima fascia sta nel
    // FONDO, cioè fuori dagli slot che la ripartizione copre.
    return absent(
      index.positionOf.has(called.playerId) ? "oltre-gli-slot-del-ruolo" : "fascia-assente",
    );
  }

  const base = perSlot;

  // ── Le tre gambe ──────────────────────────────────────────────────────────
  const deltas = input.deltas ?? ABSOLUTE_VALUE_DELTAS;
  const contributions: AbsoluteValueLegContribution[] = [];
  for (const leg of ABSOLUTE_VALUE_LEGS) {
    const delta = deltas[leg];
    const position = legPosition(leg, legs);
    // Un delta non utilizzabile non diventa 0 in silenzio: è una gamba senza
    // il proprio peso, e senza peso non si può decidere se l'assenza conti.
    if (!Number.isFinite(delta)) return absent(LEG_MISSING_REASON[leg]);
    if (delta === 0) {
      // Gamba spenta: la sua assenza non può cambiare il risultato di un
      // credito, quindi pretendere `n/d` sarebbe rumore. La posizione resta
      // visibile nella catena quando c'è, così si legge che cosa si sarebbe
      // usato il giorno in cui il peso arriva.
      contributions.push({ leg, delta, position, credits: 0 });
      continue;
    }
    if (position === null) return absent(LEG_MISSING_REASON[leg]);
    contributions.push({ leg, delta, position, credits: delta * position });
  }

  const total = contributions.reduce((sum, c) => sum + c.credits, base);

  return {
    kind: "valore",
    credits: total,
    // SI DICHIARA, non si aggiusta.
    belowCostFloor: total < COST_FLOOR,
    chain: {
      role,
      budget: INITIAL_BUDGET,
      roleTarget,
      roleSlots,
      perSlot,
      tier,
      base,
      legs: contributions,
      total,
    },
    ratification: RATIFICATION,
  };
}
