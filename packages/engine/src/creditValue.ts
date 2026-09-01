// `V(i)` — IL VALORE IN CREDITI, E `S(i)` — IL SURPLUS ATTESO
// (NOM-PROTOCOL-A §A.1 e §A.3, passo 2 del nucleo P0). Puro, deterministico,
// engine-only: nessuna UI, nessuna rete, nessun dato reale, nessun orologio.
//
// `V(i)` risponde a UNA domanda sola: quanti crediti della dotazione del tavolo
// quel giocatore «merita» sulla scala della produzione prevista. Non è un
// prezzo, non è un consiglio, non è un `value` gated: è una RIPARTIZIONE
// aritmetica di un budget noto fra i giocatori che stanno sopra il rimpiazzo,
// più il pavimento di un credito che il regolamento impone a ogni slot.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA CATENA, CITATA DA GEN §D.11 E NON RISCRITTA
// ─────────────────────────────────────────────────────────────────────────────
//
// ```text
// VORP(i)    = max(0, T1̂(i) − T1̂(r*(ruolo)))     r* = 25/73/73/57 per P/D/C/A
// B_pool     = 4.000 − R_rinnovi
// Slot       = 224 − (numero rinnovi)
// B_res      = B_pool − Slot
// credito(i) = 1 + B_res · VORP(i) / Σ_{VORP>0} VORP(j)   (largest-remainder)
// ```
//
// TRE NUMERI DI QUELLA CATENA NON SONO SCRITTI A MANO QUI, sono DERIVATI dal
// regolamento, perché una costante copiata è una costante che resta indietro il
// giorno in cui il regolamento cambia:
//
//   - `4.000` è `AUCTION_POOL_CREDITS` (./priceHistory.ts), cioè
//     `INITIAL_BUDGET × NUM_FANTA_TEAMS`;
//   - `224` è `AUCTION_ROSTER_SLOTS` qui sotto, cioè gli slot di una rosa
//     (`ROSTER_REQUIREMENTS`, 3+9+9+7 = 28) per le squadre al tavolo;
//   - `25/73/73/57` sono `REPLACEMENT_RANK_BY_ROLE` qui sotto, cioè «il primo
//     giocatore del ruolo che il tavolo NON riempie»: `slot × squadre + 1`.
//     Che la formula chiusa del DTI e la derivazione dal regolamento diano gli
//     stessi quattro numeri non è una coincidenza da annotare in un commento:
//     è un test (tests/creditValue.test.ts §"i ranghi di rimpiazzo").
//
// `R_rinnovi` è la somma dei prezzi delle riconferme dichiarate, e il ripiego
// dichiarato prima delle dichiarazioni (489) NON SI DUPLICA: è già
// `RENEWALS_SPEND_BEFORE_DECLARATIONS` in ./expectedPrice.ts, dove il passo 1
// l'ha messo, e da lì si importa.
//
// ─────────────────────────────────────────────────────────────────────────────
// IL PAVIMENTO NON È UN REGALO: È IL RESIDUO CHE LO PAGA
// ─────────────────────────────────────────────────────────────────────────────
//
// `B_res = B_pool − Slot` toglie dal montepremi UN credito per ogni slot che il
// tavolo deve riempire — è `COST_FLOOR`, lo stesso pavimento di `maxSafe` — e
// la formula lo restituisce a ogni giocatore come `1 +`. Un giocatore al o
// sotto il rango di rimpiazzo ha `VORP = 0` e vale quindi ESATTAMENTE un
// credito: non è un'assenza travestita da numero, è ciò che la ripartizione
// dice di lui. L'assenza, quando c'è, ha il suo `kind` e il suo motivo.
//
// L'IDENTITÀ CHE IL LARGEST-REMAINDER DEVE FAR TORNARE è quindi
// `Σ_{VORP>0} (V(i) − COST_FLOOR) = B_res`, e non «la somma dei V è il pool»:
// i giocatori ordinati sono molti più dei 224 slot, e sommare il pavimento di
// tutti darebbe un totale che nessun tavolo spenderà mai. Un test la pinna.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE DUE CORREZIONI DICHIARATE, ENTRAMBE SPENTE DI DEFAULT
// ─────────────────────────────────────────────────────────────────────────────
//
//  1. SCONTO DI DISPONIBILITÀ — `VORP_γ(i) = VORP(i) · (N̂(i)/38)^γ`, con
//     `γ ∈ {0, 0.25, 0.5}` e **default `γ = 0`**, cioè «la correzione non
//     esiste». Il tipo `CreditValueGamma` è l'unione di quei tre valori e non
//     `number`: un γ scelto a mano fuori dall'insieme non compila. Si accende
//     per esito dei test T-V di §C.2 del DTI, mai a mano, e finché non li
//     supera il fattore NON entra nel prodotto — `availabilityFactor` resta
//     `null` e non diventa un 1 muto, stessa disciplina di `appliedFactor` in
//     ./expectedPrice.ts.
//  2. TETTO DELLA FASCIA DI PREZZO — `V(i) ≤ P90 della fascia di rango`, dalla
//     curva del passo 1 (`priceCurveBandAt`). **Default spento**, e per
//     accenderlo bisogna PORTARE la curva (`CreditValuePriceCap` la contiene):
//     non esiste un interruttore che accenda un tetto senza il suo ingrediente.
//
// Un default che non aggiunge nulla è il punto: nessuno dei due è acceso qui.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'OVERRIDE DI PICO COMANDA, NON SI MEDIA
// ─────────────────────────────────────────────────────────────────────────────
//
// Dove `declaredValueOf(i, book)` rende un valore non nullo, QUELLO è `V`, con
// provenienza «dichiarato da te» al posto della targa del generatore. Mai una
// media fra i due, mai un peso: una media sarebbe esattamente il coefficiente
// nascosto che §D9 vieta. La garanzia non è affidata alla disciplina di chi
// legge:
//
//   - il listino dei valori dichiarati è un ingresso OBBLIGATORIO del libro
//     (`values: DeclaredValueBook | null`, e `null` è la dichiarazione «non ne
//     ho»): non esiste un percorso che calcoli `V` senza aver visto gli
//     override, perché non esiste una firma che li ometta;
//   - `source` è un vocabolario di DUE parole e un'asserzione di tipo in fondo
//     al file lo pinna: non c'è un terzo membro «misto» in cui una media
//     potrebbe nascondersi.
//
// ─────────────────────────────────────────────────────────────────────────────
// COSA QUESTO MODULO NON FA, DI PROPOSITO
// ─────────────────────────────────────────────────────────────────────────────
//
//  - NON produce `T1̂` né `N̂`: le LEGGE dal deposito servito, esattamente come
//    ./expectedPrice.ts (stesso tipo `RankRow`, stesso `roleRankBook`). Qui non
//    c'è nessuna ricetta e nessun modello;
//  - NON tocca la UI, non tocca i due pannelli, non cambia un ordinamento
//    esistente: è un modulo di motore che nessuna vista chiama ancora;
//  - NON restituisce mai uno zero al posto di un'assenza e non tappa mai un
//    buco con una media di ruolo: ogni assenza ha il proprio `kind` e il
//    proprio motivo, dal vocabolario chiuso qui sotto;
//  - NON è un output direttivo: nessun `value`, `fair_to_me`, `target_band`,
//    `stretch_cap`, nessun «chiamalo», nessuna cifra da offrire.

import {
  declaredValueOf,
  type DeclaredValueBook,
  type RatificationStatus,
  type UnratifiedChoiceId,
} from "./declaredValues.js";
import {
  expectedPriceReading,
  roleRankBook,
  RENEWALS_SPEND_BEFORE_DECLARATIONS,
  type ExpectedPriceContext,
  type ExpectedPriceMissingReason,
  type RankRow,
  type RoleRankBook,
} from "./expectedPrice.js";
import { AUCTION_POOL_CREDITS, priceCurveBandAt, type PriceCurveBook } from "./priceHistory.js";
import {
  COST_FLOOR,
  NUM_FANTA_TEAMS,
  ROLES,
  ROSTER_REQUIREMENTS,
  type Role,
} from "./types.js";

// ─── Le costanti, tutte derivate ─────────────────────────────────────────────

/**
 * GLI SLOT DELL'INTERO TAVOLO: `224`.
 *
 * `Slot` della catena è `224 − (numero rinnovi)`, e il `224` non è un numero
 * del DTI: è il regolamento contato due volte — gli slot di una rosa
 * (`ROSTER_REQUIREMENTS`: P 3, D 9, C 9, A 7 = 28) per le squadre al tavolo
 * (`NUM_FANTA_TEAMS` = 8). Derivarlo invece di copiarlo è la stessa scelta di
 * `AUCTION_POOL_CREDITS` (./priceHistory.ts), e per la stessa ragione.
 */
export const AUCTION_ROSTER_SLOTS =
  ROLES.reduce((slots, role) => slots + ROSTER_REQUIREMENTS[role], 0) * NUM_FANTA_TEAMS;

/**
 * I RANGHI DI RIMPIAZZO `r*`: 25 / 73 / 73 / 57 per P / D / C / A.
 *
 * Il DTI li porta come numeri chiusi (§E, `[C]` da regolamento, GEN §A.4); qui
 * si RIDERIVANO dal regolamento e il risultato coincide, il che è il modo di
 * scoprire una divergenza invece di ereditarla: `r*` è «il primo giocatore del
 * ruolo che il tavolo NON riempie», cioè `slot del ruolo × squadre + 1`
 * (3×8+1 = 25, 9×8+1 = 73, 7×8+1 = 57).
 *
 * Sopra quel rango un giocatore produce qualcosa che un rimpiazzo liberamente
 * disponibile non produce; da quel rango in giù non c'è nulla da pagare oltre
 * il pavimento, perché chiunque altro farebbe lo stesso.
 */
export const REPLACEMENT_RANK_BY_ROLE: Readonly<Record<Role, number>> = Object.freeze(
  ROLES.reduce<Record<Role, number>>(
    (acc, role) => {
      acc[role] = ROSTER_REQUIREMENTS[role] * NUM_FANTA_TEAMS + 1;
      return acc;
    },
    { P: 0, D: 0, C: 0, A: 0 },
  ),
);

/**
 * LE GIORNATE DI UNA STAGIONE: 38. È il denominatore dello sconto di
 * disponibilità (`(N̂/38)^γ`) e non è un parametro di questo modulo — è il
 * calendario, lo stesso `1..38` che parser, normalizzatore e validatori dei
 * voti già impongono a ogni giornata che entra nel sistema.
 *
 * Serve SOLO quando `γ > 0`: con il default `γ = 0` non entra da nessuna parte.
 */
export const SEASON_MATCHDAYS = 38;

/**
 * I TRE VALORI AMMESSI DI `γ`, dal DTI §A.1.1 e §E. Non un `number`: chi
 * volesse un quarto γ deve passare da qui, e da una review.
 */
export const CREDIT_VALUE_GAMMAS = [0, 0.25, 0.5] as const;
export type CreditValueGamma = (typeof CREDIT_VALUE_GAMMAS)[number];

/**
 * IL DEFAULT È LA CORREZIONE CHE NON ESISTE. `γ = 0` non è «un valore basso»:
 * è la baseline in cui lo sconto di disponibilità non è nella catena. Si sposta
 * solo per esito dei test T-V (§C.2 del DTI), mai a mano.
 */
export const DEFAULT_CREDIT_VALUE_GAMMA: CreditValueGamma = 0;

// ─── Le letture, CHIUSE ──────────────────────────────────────────────────────

/**
 * LE QUATTRO LETTURE DI QUESTO MODULO SONO CHIUSE, E LA LISTA È VUOTA PER
 * QUESTO — non perché nessuno le abbia mai fatte.
 *
 * FINO AL 2026-08-31 questa lista portava
 * `CREDIT_VALUE_REMAINDER_TIES_BY_VORP`, `CREDIT_VALUE_BAND_CAP_IS_FLOORED_P90`,
 * `CREDIT_VALUE_CAP_DOES_NOT_REDISTRIBUTE` e
 * `CREDIT_VALUE_DECLARED_NOT_ROUNDED`, e i commenti accanto alle righe che le
 * implementano dicevano «nessun documento la fissa» e «nessuno ha firmato
 * nessuna delle due letture». NON È PIÙ VERO: `docs/DECISIONS.md` §«Cinque
 * letture del motore dei pannelli di chiamata, chiuse in blocco» (vice di
 * Pico, su delega esplicita, 2026-08-31) le decide una per una e dichiara fra i
 * propri atti «la chiusura delle quattro letture aperte dichiarate nel motore,
 * con questo record come copertura».
 *
 * CHE COSA HA DECISO, PUNTO PER PUNTO, e la riga di codice che lo esegue:
 *  - i pareggi sui resti si sciolgono per `VORP_γ` decrescente e poi per chiave
 *    di listone, «per prolungare il gradiente» invece di introdurne un altro —
 *    `largestRemainder()`, l'ordinamento a tre criteri;
 *  - il tetto di fascia è `floor(P90)` e mai sotto il pavimento, perché «un
 *    tetto che arrotonda per eccesso lascia passare valori sopra la P90
 *    misurata, e un tetto che lascia passare non è un tetto» — `bandCapAt()`;
 *  - il tetto NON ridistribuisce, perché rigirare quei crediti «trasformerebbe
 *    una correzione prudenziale in una pompa» e cambierebbe la configurazione
 *    che T-V misura — `generatorReading()`, dove il taglio abbassa `credits` e
 *    nessun secondo giro riparte;
 *  - il valore dichiarato non si arrotonda: «fra l'interezza dei crediti e
 *    l'intangibilità del dichiarato, cede l'interezza» — l'override, che scrive
 *    `credits: declaredValue` verbatim.
 *
 * IL CONFINE CHE IL RECORD SCRIVE, e che questo modulo NON deve superare da
 * solo: «il giorno in cui un `V` decimale dovesse entrare in un consumatore che
 * esige interi, l'esecutore si ferma e chiede — non arrotonda».
 *
 * LA LISTA RESTA ESPORTATA, VUOTA. Non è un residuo: `packages/engine/tests/
 * callScreen.test.ts` la somma alle altre superfici per provare che il
 * vocabolario non ha orfani, e una superficie che dichiara «io non poggio su
 * niente di aperto» è un'affermazione, non un'assenza.
 */
export const CREDIT_VALUE_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [];

/**
 * LO STATO CHE VIAGGIA COL NUMERO, ed è `true` per la prima volta nel motore.
 *
 * Non è un flag girato a mano: il tipo `RatificationStatus`
 * (./declaredValues.ts) ammette `true` SOLO insieme a una lista vuota, quindi
 * la lista scritta qui è vuota nel tipo e non solo nei fatti: nessun cast, e
 * chi provasse a elencare una scelta aperta accanto a `true` non compilerebbe.
 * La coerenza fra questa lista e quella esportata è pinnata da
 * packages/engine/tests/creditValue.test.ts, che le confronta.
 */
const RATIFICATION: RatificationStatus = {
  ratified: true,
  unratifiedChoices: [],
};

// ─── L'esito ─────────────────────────────────────────────────────────────────

/**
 * DA DOVE VIENE IL NUMERO. Due parole, e non ce n'è una terza: o la
 * ripartizione del generatore, o la dichiarazione di Pico. Un'asserzione di
 * tipo in fondo al file impedisce che ne compaia una che significhi «un po' e
 * un po'».
 */
export type CreditValueSource = "generatore" | "dichiarato";

/**
 * L'etichetta che il DTI §A.1 impone accanto a un `V` che viene da Pico, al
 * posto della targa del generatore. Vive qui, accanto alla sorgente, così
 * nessun consumatore può mostrare il numero e inventarsi (o perdere)
 * l'etichetta — stesso principio di `DECLARED_VALUE_PROVENANCE`.
 *
 * La targa del generatore NON è una costante di questo modulo: è la
 * `recipeVersion` che il deposito porta sulla riga, e chi mostra la riga ce
 * l'ha già. Cablarla qui significherebbe avere due posti in cui la versione
 * della ricetta può divergere.
 */
export const DECLARED_OVERRIDE_PROVENANCE = "dichiarato da te";

/** Perché `V` NON esiste per questa riga. Vocabolario chiuso, nessun numero dietro. */
export type CreditValueMissingReason =
  /** La riga non porta il deposito e Pico non ha dichiarato: niente `T1̂`, niente `V`. */
  | "previsione-assente"
  /** Il giocatore non è fra le righe da cui la scala è stata costruita, né dichiarato. */
  | "rango-ignoto"
  /** Il ruolo non arriva al rango di rimpiazzo: non c'è `T1̂(r*)` da sottrarre. */
  | "rimpiazzo-assente"
  /** La scala non è formabile per tutti: il motivo preciso è in `book.reason`. */
  | "scala-non-formabile";

/** Perché la scala NON è formabile. Vocabolario chiuso. */
export type CreditValueScaleUnavailableReason =
  /** Il numero di rinnovi non è un conteggio utilizzabile (non intero, negativo, oltre gli slot). */
  | "rinnovi-non-validi"
  /** `B_res ≤ 0`: dopo i rinnovi e il pavimento degli slot non resta nulla da ripartire. */
  | "budget-residuo-non-positivo"
  /** Nessun giocatore sopra il rimpiazzo: il denominatore della quota è 0. */
  | "nessun-vorp-positivo";

/**
 * LA CATENA, ESPOSTA passo per passo. Non è decorazione: un revisore deve poter
 * rifare la divisione a mano senza rileggere questo file, e chi mostra il
 * numero deve poter mostrare da dove viene ogni suo pezzo. Stessa postura di
 * `ExpectedPriceChain` (./expectedPrice.ts) e `AbsoluteValueChain`
 * (./absoluteValue.ts).
 */
export interface CreditValueChain {
  readonly role: Role;
  /** Il rango del giocatore nel suo ruolo, venduti inclusi (`roleRankBook`). */
  readonly rank: number;
  /** `T1̂(i)` — letto dal deposito, mai prodotto qui. */
  readonly forecastTotal: number;
  /** `N̂(i)` — letto dal deposito. Entra solo se `γ > 0`. */
  readonly forecastAppearances: number;
  /** `r*` del ruolo. */
  readonly replacementRank: number;
  /** `T1̂(r*)`: il totale previsto del giocatore che occupa il rango di rimpiazzo. */
  readonly replacementTotal: number;
  /** `max(0, T1̂(i) − T1̂(r*))`. */
  readonly vorp: number;
  readonly gamma: CreditValueGamma;
  /**
   * `(N̂/38)^γ`, oppure `null` quando `γ = 0` e il fattore NON entra. Un
   * moltiplicatore neutro e un moltiplicatore assente producono lo stesso
   * numero e sono due affermazioni diverse.
   */
  readonly availabilityFactor: number | null;
  /** `VORP_γ(i)`: uguale a `vorp` quando lo sconto non è acceso. */
  readonly adjustedVorp: number;
  /** `Σ_{VORP_γ>0} VORP_γ(j)`, il denominatore della quota. */
  readonly vorpSum: number;
  /** `VORP_γ(i) / vorpSum`. `null` quando `VORP_γ(i) = 0`: nessuna quota, non «quota zero». */
  readonly share: number | null;
  /** `B_res`. */
  readonly residualBudget: number;
  /** `1 + B_res · share`, PRIMA dell'arrotondamento. Il numero esatto, non mostrato. */
  readonly exactCredits: number;
  /** `true` se il largest-remainder gli ha assegnato una delle unità di resto. */
  readonly remainderUnit: boolean;
  /** Il numero dopo l'arrotondamento e prima del tetto. */
  readonly roundedCredits: number;
  /** Il tetto della fascia effettivamente applicabile, `null` se spento o non misurabile. */
  readonly bandCap: number | null;
  /** `true` quando è il tetto ad aver fissato il numero, non la ripartizione. */
  readonly cappedByBand: boolean;
}

/** `V` dal generatore: la ripartizione, con tutta la sua catena. */
export interface CreditValueFromGenerator {
  readonly kind: "valore";
  readonly source: "generatore";
  /** `V(i)`, crediti INTERI. */
  readonly credits: number;
  readonly chain: CreditValueChain;
  readonly ratification: RatificationStatus;
}

/**
 * `V` dichiarato da Pico: il suo numero, COM'È.
 *
 * `chain: null` non è un campo dimenticato: è l'affermazione che qui non c'è
 * nessuna derivazione da mostrare, perché non c'è stata nessuna derivazione. Un
 * override non ha una catena, ha un autore.
 *
 * IL NUMERO NON SI ARROTONDA. Arrotondare la dichiarazione di Pico sarebbe
 * modificarla, e questo modulo non modifica le dichiarazioni: se ha scritto
 * 37,5 la riga porta 37,5. ERA LA LETTURA APERTA
 * `CREDIT_VALUE_DECLARED_NOT_ROUNDED`, perché il DTI parla di crediti interi e
 * nessuno aveva scelto fra le due; È CHIUSA dal 2026-08-31 —
 * `docs/DECISIONS.md` §«Cinque letture del motore dei pannelli di chiamata,
 * chiuse in blocco», punto 4: «fra l'interezza dei crediti e l'intangibilità
 * del dichiarato, cede l'interezza». Lo stesso record scrive il confine da non
 * superare in silenzio: se un `V` decimale dovesse entrare in un consumatore
 * che esige interi, l'esecutore si ferma e chiede — non arrotonda.
 */
export interface CreditValueDeclared {
  readonly kind: "valore";
  readonly source: "dichiarato";
  /** Il valore dichiarato, verbatim. */
  readonly credits: number;
  readonly chain: null;
  /** L'etichetta che sostituisce la targa del generatore. */
  readonly provenance: typeof DECLARED_OVERRIDE_PROVENANCE;
  readonly ratification: RatificationStatus;
}

export interface CreditValueAbsent {
  readonly kind: "assente";
  readonly reason: CreditValueMissingReason;
  readonly ratification: RatificationStatus;
}

export type CreditValueReading =
  | CreditValueFromGenerator
  | CreditValueDeclared
  | CreditValueAbsent;

// ─── Il libro ────────────────────────────────────────────────────────────────

/**
 * L'interruttore del tetto P90 — e l'interruttore PORTA il suo ingrediente.
 *
 * Non è un `boolean`: un booleano permetterebbe di accendere un tetto senza
 * avere la curva su cui misurarlo, e il ramo «acceso ma senza dati» è
 * esattamente il ramo che finisce per non fare niente in silenzio. Passare
 * questo oggetto significa avere la curva; ometterlo significa tetto spento.
 */
export interface CreditValuePriceCap {
  /** La curva storica del passo 1, da cui si legge la P90 della fascia di rango. */
  readonly curves: PriceCurveBook;
}

export interface CreditValueBookInput {
  /**
   * Le righe del listone come il rango le vede: `T1̂`, `N̂`, ruolo, venduto.
   * LE STESSE che alimentano `P̂` — stesso tipo, stesso libro dei ranghi, che
   * questo modulo costruisce una volta e RESTITUISCE (`book.ranks`), così chi
   * costruisce anche il contesto del prezzo non riordina il listone due volte
   * e soprattutto non può ordinarlo in due modi diversi.
   */
  readonly rows: readonly RankRow[];
  /**
   * QUANTE riconferme sono state dichiarate. Ingresso OBBLIGATORIO e senza
   * ripiego, ed è una scelta: il DTI dichiara il ripiego della SOMMA dei
   * rinnovi (489, §E) e non ne dichiara nessuno per il loro NUMERO. Inventarne
   * uno qui sarebbe un parametro che nessun documento contiene; chiederlo al
   * chiamante lo lascia dov'è il fatto — prima delle dichiarazioni è 0, e chi
   * ha il registro delle riconferme lo sa contare.
   */
  readonly renewalsCount: number;
  /**
   * `R_rinnovi`: la somma dei prezzi delle riconferme dichiarate. Omessa: si
   * usa il ripiego dichiarato del passo 1
   * (`RENEWALS_SPEND_BEFORE_DECLARATIONS`), e `renewalsSpendIsFallback` lo dice.
   */
  readonly renewalsSpend?: number;
  /**
   * Il listino dei valori dichiarati di Pico, o `null` quando non ce n'è.
   * OBBLIGATORIO nella firma proprio perché `null` sia una dichiarazione
   * esplicita e non una dimenticanza: non esiste un modo di calcolare `V`
   * senza aver deciso che cosa fare degli override.
   */
  readonly values: DeclaredValueBook | null;
  /** Lo sconto di disponibilità. Omesso: `DEFAULT_CREDIT_VALUE_GAMMA`, cioè spento. */
  readonly gamma?: CreditValueGamma;
  /** Il tetto della fascia. Omesso o `null`: spento. */
  readonly priceCap?: CreditValuePriceCap | null;
}

/**
 * Il libro dei valori: una lettura per giocatore, più tutta la contabilità
 * della ripartizione che l'ha prodotta.
 *
 * SI COSTRUISCE UNA VOLTA PER LETTURA, come `PriceCurveBook` e come
 * `ExposureBook`: il largest-remainder è una proprietà della POPOLAZIONE — non
 * si può calcolare il `V` di un giocatore senza aver ripartito il residuo fra
 * tutti — e quindi non esiste una funzione «`V` di uno» da chiamare per
 * candidato. `creditValueOf` è una ricerca su `Map`.
 */
export interface CreditValueBook {
  /** Il libro dei ranghi costruito su `rows`. Da riusare per `expectedPriceContext`. */
  readonly ranks: RoleRankBook;
  readonly byPlayerId: ReadonlyMap<string, CreditValueReading>;
  /** `B_pool = 4.000 − R_rinnovi`. */
  readonly pool: number;
  /** `Slot = 224 − (numero rinnovi)`. */
  readonly slots: number;
  /** `B_res = B_pool − Slot`. */
  readonly residualBudget: number;
  readonly renewalsCount: number;
  readonly renewalsSpend: number;
  /** `true` quando `renewalsSpend` è il ripiego dichiarato e non un dato al tavolo. */
  readonly renewalsSpendIsFallback: boolean;
  readonly gamma: CreditValueGamma;
  readonly priceCapEnabled: boolean;
  /** `T1̂(r*)` per ruolo; `null` quando il ruolo non arriva al rango di rimpiazzo. */
  readonly replacementTotalByRole: ReadonlyMap<Role, number | null>;
  /** `Σ_{VORP_γ>0} VORP_γ`. */
  readonly vorpSum: number;
  /** Quanti giocatori stanno sopra il rimpiazzo: sono loro a spartirsi `B_res`. */
  readonly positiveVorpPlayers: number;
  /**
   * `Σ_{VORP_γ>0} (V(i) − COST_FLOOR)` sulla ripartizione del GENERATORE (gli
   * override non entrano: sostituiscono ciò che si MOSTRA di una riga, non
   * ciò che il tavolo ha da spendere). Col tetto spento è `B_res` esatto, ed è
   * l'identità che il largest-remainder esiste per garantire.
   */
  readonly distributedCredits: number;
  /** Quante righe il tetto della fascia ha abbassato. 0 col tetto spento. */
  readonly cappedPlayers: number;
  /** Quante righe portano il valore di Pico al posto di quello del generatore. */
  readonly declaredOverrides: number;
  /** Quante righe non hanno `V`, e sono contate invece che nascoste. */
  readonly withoutValue: number;
  readonly reason: CreditValueScaleUnavailableReason | null;
  readonly ratification: RatificationStatus;
}

const absent = (reason: CreditValueMissingReason): CreditValueAbsent => ({
  kind: "assente",
  reason,
  ratification: RATIFICATION,
});

/**
 * `T1̂` del giocatore che occupa il rango `r*` del ruolo, o `null` se il ruolo
 * non ci arriva.
 *
 * NESSUN RIPIEGO SULL'ULTIMO ORDINATO: prendere «il peggiore che c'è» quando il
 * rango di rimpiazzo non esiste gonfierebbe ogni VORP del ruolo di una
 * quantità che nessuno ha misurato. Se il rimpiazzo non c'è, il ruolo lo dice.
 */
function replacementTotals(
  rows: readonly RankRow[],
  ranks: RoleRankBook,
): Map<Role, number | null> {
  const totalByPlayerId = new Map<string, number>();
  for (const row of rows) {
    if (row.forecast !== null) totalByPlayerId.set(row.playerId, row.forecast.total);
  }
  const byRole = new Map<Role, number | null>();
  for (const role of ROLES) byRole.set(role, null);
  for (const entry of ranks.byPlayerId.values()) {
    if (entry.rank !== REPLACEMENT_RANK_BY_ROLE[entry.role]) continue;
    byRole.set(entry.role, totalByPlayerId.get(entry.playerId) ?? null);
  }
  return byRole;
}

/** La riga della ripartizione, prima dell'arrotondamento. */
interface ShareRow {
  readonly playerId: string;
  readonly role: Role;
  readonly rank: number;
  readonly forecastTotal: number;
  readonly forecastAppearances: number;
  readonly replacementTotal: number;
  readonly vorp: number;
  readonly availabilityFactor: number | null;
  readonly adjustedVorp: number;
}

/**
 * IL LARGEST-REMAINDER, scritto per intero perché è tutto ciò che c'è.
 *
 * Ogni riga riceve `B_res · quota` crediti; si tiene la PARTE INTERA di
 * ciascuno, si conta quante unità sono avanzate (`B_res − Σ parti intere`, un
 * intero fra 0 e il numero di righe) e le si assegna UNA CIASCUNA alle righe
 * col resto più grande. Il risultato è che la somma torna per costruzione,
 * mentre un `Math.round` per riga la fa sballare di qualche credito in su o in
 * giù a seconda di come cadono i decimali — cioè fa sparire o comparire crediti
 * che il tavolo ha o non ha.
 *
 * PAREGGI SUI RESTI: resto decrescente, poi `VORP_γ` decrescente, poi
 * `playerId` crescente. L'ordine è totale e deterministico (stesse righe →
 * stessa ripartizione, sempre). ERA LA LETTURA APERTA
 * `CREDIT_VALUE_REMAINDER_TIES_BY_VORP` — quale dovesse essere il tie-break non
 * lo diceva nessun documento — ed è CHIUSA dal 2026-08-31:
 * `docs/DECISIONS.md` §«Cinque letture del motore dei pannelli di chiamata,
 * chiuse in blocco», punto 2, che sceglie il VORP «perché prolunga il
 * gradiente» che la ripartizione segue per tutta la sua lunghezza, invece di
 * introdurne un altro, e la chiave in coda per l'ordine totale.
 *
 * Restituisce, per `playerId`, la quota intera già ripartita e se ha ricevuto
 * l'unità di resto.
 */
function largestRemainder(
  rows: readonly ShareRow[],
  residualBudget: number,
  vorpSum: number,
): Map<string, { readonly units: number; readonly remainderUnit: boolean }> {
  const parts = rows.map((row) => {
    const exact = (residualBudget * row.adjustedVorp) / vorpSum;
    const floor = Math.floor(exact);
    return { playerId: row.playerId, adjustedVorp: row.adjustedVorp, floor, remainder: exact - floor };
  });

  const assigned = parts.reduce((sum, p) => sum + p.floor, 0);
  // `Σ esatti` è `B_res` per costruzione, ma in virgola mobile può mancarci un
  // ulp: il numero di unità avanzate si RICLAMPA nell'intervallo possibile
  // invece di fidarsi della sottrazione. Non è pessimismo, è che una sola unità
  // in più distribuita farebbe sballare l'identità che questa funzione esiste
  // per garantire.
  const leftover = Math.max(0, Math.min(parts.length, Math.round(residualBudget - assigned)));

  const order = [...parts].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.adjustedVorp - a.adjustedVorp ||
      a.playerId.localeCompare(b.playerId),
  );
  const withUnit = new Set(order.slice(0, leftover).map((p) => p.playerId));

  return new Map(
    parts.map((p) => [
      p.playerId,
      { units: p.floor + (withUnit.has(p.playerId) ? 1 : 0), remainderUnit: withUnit.has(p.playerId) },
    ]),
  );
}

/**
 * IL TETTO DELLA FASCIA in crediti interi: `floor(P90)`, mai sotto il pavimento.
 *
 * Due letture, ERANO ENTRAMBE APERTE e sono chiuse dal 2026-08-31 —
 * `docs/DECISIONS.md` §«Cinque letture del motore dei pannelli di chiamata,
 * chiuse in blocco», punto 3. `floor` e non `round`, perché «un tetto che
 * arrotonda per eccesso lascia passare valori sopra la P90 misurata, e un tetto
 * che lascia passare non è un tetto» (`CREDIT_VALUE_BAND_CAP_IS_FLOORED_P90`).
 * E mai sotto `COST_FLOOR`, perché un credito è il minimo che il regolamento fa
 * pagare: un tetto a zero dichiarerebbe un giocatore impagabile, che è un
 * verdetto che la curva non ha emesso.
 *
 * `null` quando la fascia non è leggibile (nessuna osservazione, o campione
 * sotto il minimo): il tetto non si forma e non si sostituisce con la fascia
 * vicina — `priceCurveBandAt` non interpola, e nemmeno chi lo legge.
 */
function bandCapAt(cap: CreditValuePriceCap | null, role: Role, rank: number): number | null {
  if (cap === null) return null;
  const band = priceCurveBandAt(cap.curves, role, rank);
  if (band === null || band.p90 === null) return null;
  return Math.max(COST_FLOOR, Math.floor(band.p90));
}

/**
 * Costruisce il libro dei valori: `V` per ogni riga del listone e per ogni
 * giocatore dichiarato, più la contabilità della ripartizione.
 *
 * Deterministica e TOTALE: ogni ingresso produce o un libro con la sua scala o
 * un libro col proprio `reason`, e ogni riga produce o un valore con la sua
 * provenienza o un'assenza col suo motivo. Non lancia mai — nessuna eccezione
 * sul percorso critico di un'asta.
 */
export function creditValueBook(input: CreditValueBookInput): CreditValueBook {
  const gamma = input.gamma ?? DEFAULT_CREDIT_VALUE_GAMMA;
  const priceCap = input.priceCap ?? null;
  const values = input.values;

  const renewalsSpendIsFallback = input.renewalsSpend === undefined;
  const renewalsSpend = input.renewalsSpend ?? RENEWALS_SPEND_BEFORE_DECLARATIONS;
  const renewalsCount = input.renewalsCount;

  const ranks = roleRankBook(input.rows);
  const replacementTotalByRole = replacementTotals(input.rows, ranks);

  const pool = AUCTION_POOL_CREDITS - renewalsSpend;
  const renewalsCountValid =
    Number.isInteger(renewalsCount) && renewalsCount >= 0 && renewalsCount <= AUCTION_ROSTER_SLOTS;
  const slots = AUCTION_ROSTER_SLOTS - renewalsCount;
  const residualBudget = pool - slots;

  // ── Le quote, prima di qualunque arrotondamento ───────────────────────────
  const forecastByPlayerId = new Map<string, { total: number; appearances: number }>();
  for (const row of input.rows) {
    if (row.forecast !== null) forecastByPlayerId.set(row.playerId, row.forecast);
  }

  const shares: ShareRow[] = [];
  const zeroVorp: ShareRow[] = [];
  for (const role of ROLES) {
    const replacementTotal = replacementTotalByRole.get(role) ?? null;
    if (replacementTotal === null) continue;
    for (const entry of ranks.byPlayerId.values()) {
      if (entry.role !== role) continue;
      const forecast = forecastByPlayerId.get(entry.playerId);
      if (forecast === undefined) continue; // irraggiungibile: un rango esiste solo con previsione
      const vorp = Math.max(0, forecast.total - replacementTotal);
      // Il fattore ENTRA solo se `γ > 0`. A `γ = 0` la correzione non esiste, e
      // `availabilityFactor: null` lo dice invece di mostrare un 1 che
      // sembrerebbe una misura.
      const availabilityFactor =
        gamma === 0 ? null : Math.pow(forecast.appearances / SEASON_MATCHDAYS, gamma);
      const adjustedVorp =
        availabilityFactor === null ? vorp : Math.max(0, vorp * availabilityFactor);
      const share: ShareRow = {
        playerId: entry.playerId,
        role,
        rank: entry.rank,
        forecastTotal: forecast.total,
        forecastAppearances: forecast.appearances,
        replacementTotal,
        vorp,
        availabilityFactor,
        adjustedVorp,
      };
      if (adjustedVorp > 0 && Number.isFinite(adjustedVorp)) shares.push(share);
      else zeroVorp.push(share);
    }
  }
  // Ordine deterministico della popolazione, indipendente dall'ordine di
  // inserimento della `Map`: la ripartizione non può dipendere da come il
  // chiamante ha scritto le righe.
  shares.sort((a, b) => a.playerId.localeCompare(b.playerId));

  const vorpSum = shares.reduce((sum, s) => sum + s.adjustedVorp, 0);

  const reason: CreditValueScaleUnavailableReason | null = !renewalsCountValid
    ? "rinnovi-non-validi"
    : residualBudget <= 0
      ? "budget-residuo-non-positivo"
      : vorpSum <= 0
        ? "nessun-vorp-positivo"
        : null;

  const units =
    reason === null
      ? largestRemainder(shares, residualBudget, vorpSum)
      : new Map<string, { units: number; remainderUnit: boolean }>();

  // ── Le letture, una per giocatore ─────────────────────────────────────────
  const byPlayerId = new Map<string, CreditValueReading>();
  let distributedCredits = 0;
  let cappedPlayers = 0;
  let declaredOverrides = 0;
  let withoutValue = 0;

  const generatorReading = (row: ShareRow): CreditValueReading => {
    if (reason !== null) return absent("scala-non-formabile");
    const assignment = units.get(row.playerId) ?? { units: 0, remainderUnit: false };
    const share = row.adjustedVorp > 0 ? row.adjustedVorp / vorpSum : null;
    const exactCredits = COST_FLOOR + (share === null ? 0 : residualBudget * share);
    const roundedCredits = COST_FLOOR + assignment.units;
    const bandCap = bandCapAt(priceCap, row.role, row.rank);
    const capped = bandCap !== null && roundedCredits > bandCap;
    const credits = capped ? (bandCap as number) : roundedCredits;
    if (capped) cappedPlayers += 1;
    if (row.adjustedVorp > 0) distributedCredits += credits - COST_FLOOR;
    return {
      kind: "valore",
      source: "generatore",
      credits,
      chain: {
        role: row.role,
        rank: row.rank,
        forecastTotal: row.forecastTotal,
        forecastAppearances: row.forecastAppearances,
        replacementRank: REPLACEMENT_RANK_BY_ROLE[row.role],
        replacementTotal: row.replacementTotal,
        vorp: row.vorp,
        gamma,
        availabilityFactor: row.availabilityFactor,
        adjustedVorp: row.adjustedVorp,
        vorpSum,
        share,
        residualBudget,
        exactCredits,
        remainderUnit: assignment.remainderUnit,
        roundedCredits,
        bandCap,
        cappedByBand: capped,
      },
      ratification: RATIFICATION,
    };
  };

  for (const row of [...shares, ...zeroVorp]) byPlayerId.set(row.playerId, generatorReading(row));

  // Le righe che un rango non ce l'hanno: previsione assente, oppure ruolo che
  // non arriva al rimpiazzo. Due assenze diverse, due motivi diversi.
  for (const row of input.rows) {
    if (byPlayerId.has(row.playerId)) continue;
    byPlayerId.set(
      row.playerId,
      absent(
        ranks.byPlayerId.has(row.playerId) &&
          (replacementTotalByRole.get(row.role) ?? null) === null
          ? "rimpiazzo-assente"
          : "previsione-assente",
      ),
    );
  }

  // ── L'OVERRIDE, per ultimo e su tutti: comanda, non si media ───────────────
  //
  // Passa DOPO la ripartizione e la sovrascrive interamente. Non entra nel
  // denominatore e non toglie crediti agli altri: sostituisce ciò che si mostra
  // di una riga, non ciò che il tavolo ha da spendere.
  if (values !== null) {
    for (const declared of values.all) {
      const declaredValue = declaredValueOf(declared.playerId, values);
      if (declaredValue === null) continue;
      byPlayerId.set(declared.playerId, {
        kind: "valore",
        source: "dichiarato",
        credits: declaredValue,
        chain: null,
        provenance: DECLARED_OVERRIDE_PROVENANCE,
        ratification: RATIFICATION,
      });
      declaredOverrides += 1;
    }
  }

  for (const reading of byPlayerId.values()) if (reading.kind === "assente") withoutValue += 1;

  return {
    ranks,
    byPlayerId,
    pool,
    slots,
    residualBudget,
    renewalsCount,
    renewalsSpend,
    renewalsSpendIsFallback,
    gamma,
    priceCapEnabled: priceCap !== null,
    replacementTotalByRole,
    vorpSum,
    positiveVorpPlayers: shares.length,
    distributedCredits,
    cappedPlayers,
    declaredOverrides,
    withoutValue,
    reason,
    ratification: RATIFICATION,
  };
}

/**
 * `V` per un giocatore. Una ricerca su `Map`: la ripartizione è già stata fatta
 * una volta per tutti quando il libro è stato costruito.
 *
 * Un `playerId` che il libro non conosce — né a listone né fra i dichiarati —
 * riceve `rango-ignoto`, che è un'assenza e non un errore: durante un'asta si
 * interroga anche chi non c'è.
 */
export function creditValueOf(playerId: string, book: CreditValueBook): CreditValueReading {
  return book.byPlayerId.get(playerId) ?? absent("rango-ignoto");
}

/** I crediti di una lettura, o `null` quando `V` non esiste. Mai uno zero al posto dell'assenza. */
export function creditValueCredits(reading: CreditValueReading): number | null {
  return reading.kind === "valore" ? reading.credits : null;
}

// ─── `S(i)` — IL SURPLUS ATTESO ──────────────────────────────────────────────
//
// ```text
// S(i) = V(i) − P̂(i)        crediti, può essere ≤ 0
// ```
//
// È la sottrazione del radar occasioni (`surplusOverAnchor`, ./opportunities.ts)
// con DUE SOSTITUZIONI DICHIARATE: al posto del valore dichiarato di Pico c'è
// `V(i)` — che lo contiene come override — e al posto dell'ancora corrente c'è
// `P̂(i)`. Non è una terza copia di quella sottrazione: è la stessa aritmetica
// su due grandezze diverse, e vive qui perché entrambe vivono qui.
//
// PERCHÉ QUI NON C'È LA SELEZIONE AVVERSA. Sostituire a `V` una base PIATTA PER
// RUOLO — quella che ./absoluteValue.ts deriva, `target del ruolo / slot del
// ruolo`, uguale per ogni giocatore del ruolo — renderebbe `S = costante − P̂`
// MONOTONA DECRESCENTE NEL PREZZO: a parità di ruolo vincerebbe sempre il più
// economico, cioè il peggiore. Qui `V` CRESCE con la produzione prevista del
// singolo giocatore (`VORP` è una funzione crescente di `T1̂`), quindi `S`
// premia il SOTTOPREZZATO e non l'ECONOMICO. Non è un'affermazione da
// commento: tests/creditValue.test.ts §"selezione avversa" costruisce la
// popolazione, calcola le due classifiche e mostra che quella a base piatta
// mette in testa il più economico mentre questa no.
//
// `S(i) = null` HA DUE CASI, ed è il secondo quello che si dimentica:
//   - `V` non esiste (riga senza deposito e senza valore dichiarato);
//   - `P̂` non esiste — ed è il caso di un giocatore che PICO HA DICHIARATO ma
//     il generatore non copre: `V` c'è, rango e prezzo atteso no.
// `null` non è 0 («vale esattamente quanto costa» sarebbe una dichiarazione che
// nessuno ha fatto) e non è `−Infinity` (sarebbe una misura, e non c'è): la
// riga si ordina in coda, contata. È l'idioma già in codice di `compareSurplus`
// (src/perMeCandidates.ts), e `compareCreditSurplus` qui sotto ne conserva la
// semantica alla lettera.

/** Perché `S` non esiste. Due casi, distinti perché sono due fatti diversi. */
export type SurplusMissingReason =
  /** `V` non esiste per questa riga. */
  | "valore-assente"
  /** `V` esiste ma `P̂` no: tipicamente un dichiarato che il generatore non copre. */
  | "prezzo-assente";

export interface SurplusCredits {
  readonly kind: "surplus";
  /** `S(i) = V(i) − P̂(i)`. Può essere ≤ 0: ordina, non esclude. */
  readonly credits: number;
  /** `V(i)`, col suo `source`: chi legge `S` sa sempre di quale valore è la sottrazione. */
  readonly value: number;
  readonly valueSource: CreditValueSource;
  /** `P̂(i)`. */
  readonly expectedPrice: number;
}

export interface SurplusAbsent {
  readonly kind: "assente";
  readonly reason: SurplusMissingReason;
  /** Il motivo dell'ingrediente mancante, così il chiamante conta la causa vera. */
  readonly valueReason: CreditValueMissingReason | null;
  readonly priceReason: ExpectedPriceMissingReason | null;
}

export type SurplusReading = SurplusCredits | SurplusAbsent;

/**
 * `S` per un giocatore, dai due libri già costruiti.
 *
 * Deterministica e totale, non lancia mai. Non media, non arrotonda e non
 * inventa: se uno dei due ingredienti non c'è, non c'è `S`, e il motivo dice
 * QUALE dei due manca.
 */
export function surplusReading(
  playerId: string,
  values: CreditValueBook,
  prices: ExpectedPriceContext,
): SurplusReading {
  const value = creditValueOf(playerId, values);
  if (value.kind === "assente") {
    return { kind: "assente", reason: "valore-assente", valueReason: value.reason, priceReason: null };
  }
  const price = expectedPriceReading(playerId, prices);
  if (price.kind === "assente") {
    return { kind: "assente", reason: "prezzo-assente", valueReason: null, priceReason: price.reason };
  }
  return {
    kind: "surplus",
    credits: value.credits - price.credits,
    value: value.credits,
    valueSource: value.source,
    expectedPrice: price.credits,
  };
}

/** I crediti di un surplus, o `null` quando non esiste. */
export function surplusCredits(reading: SurplusReading): number | null {
  return reading.kind === "surplus" ? reading.credits : null;
}

/**
 * Confronto DECRESCENTE sul surplus, con l'ASSENZA dichiarata invece che
 * fabbricata. È la SEMANTICA di `compareSurplus` (src/perMeCandidates.ts),
 * conservata alla lettera e per le stesse ragioni: `null` non diventa 0
 * (sarebbe la dichiarazione «vale esattamente quanto costa») e non diventa
 * `−Infinity` (sarebbe una misura). Una riga senza `S` finisce dopo TUTTE
 * quelle che un `S` ce l'hanno — anche dopo quelle con `S` negativo, che una
 * misura ce l'hanno — e chi la mostra lo dice col proprio contatore.
 *
 * Vive qui e non di là perché di là ordina il surplus del radar (valore
 * dichiarato meno ancora) e qui quello atteso (`V` meno `P̂`): due grandezze,
 * una sola regola sull'assenza.
 */
export function compareCreditSurplus(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

// ─── LE GUARDIE DI TIPO ──────────────────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, vivono ACCANTO alla dichiarazione e non hanno
// bisogno che vitest giri. Stessa famiglia delle due di ./expectedPrice.ts e di
// `AssertNoProfilesChannel` in src/baitCandidates.ts.

/** Le chiavi che un tipo dichiara OBBLIGATORIE. Stessa forma di ./expectedPrice.ts. */
type EmptyObject = { readonly [K in never]: never };
type RequiredKeysOf<T> = {
  [K in keyof T]-?: EmptyObject extends Pick<T, K> ? never : K;
}[keyof T];

/** Un `V` non esiste senza la sua provenienza e senza la sua catena. */
type AssertValueCarriesProvenance = "credits" | "source" | "chain" extends
  RequiredKeysOf<CreditValueFromGenerator>
  ? true
  : never;
const _valueCarriesProvenance: AssertValueCarriesProvenance = true;
void _valueCarriesProvenance;

/**
 * O L'UNO O L'ALTRO, MAI UNA MEDIA: il vocabolario della provenienza ha
 * ESATTAMENTE due parole. Un terzo membro — «misto», «combinato», «pesato» —
 * non compila, e con lui non compila il posto in cui un peso potrebbe
 * nascondersi.
 */
type AssertTwoSourcesOnly = CreditValueSource extends "generatore" | "dichiarato"
  ? "generatore" | "dichiarato" extends CreditValueSource
    ? true
    : never
  : never;
const _twoSourcesOnly: AssertTwoSourcesOnly = true;
void _twoSourcesOnly;

/** Un override NON ha una catena: non c'è stata nessuna derivazione da mostrare. */
type AssertDeclaredHasNoChain = CreditValueDeclared["chain"] extends null ? true : never;
const _declaredHasNoChain: AssertDeclaredHasNoChain = true;
void _declaredHasNoChain;

/** `γ` è uno dei tre valori dichiarati, non un `number`. */
type AssertGammaIsClosed = number extends CreditValueGamma ? never : true;
const _gammaIsClosed: AssertGammaIsClosed = true;
void _gammaIsClosed;
