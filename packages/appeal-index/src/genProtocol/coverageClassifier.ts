// GEN-PROTOCOL-A — la copertura di una riga di listone: undici situazioni. PURO.
//
// Il problema che questo modulo risolve, detto coi numeri che lo hanno posto:
// sul listone servito, 509 righe su 509 uscivano `null`, e i motivi erano tre —
// 348 «nessun modello pronto», 150 «nessuna riga storica ha fatto match», 11
// «feature non finita». Le 150 sono la fetta che nessun refit recupera: sono
// giocatori di cui questo repository non ha una riga di storico utilizzabile.
// Ma «nessun match» non e' una diagnosi: e' l'assenza di una diagnosi. Un
// promosso dalla Serie B, un rientro dall'estero da una lega coperta, un
// esordiente assoluto e un giocatore con un anno di buco sono quattro
// situazioni diverse, con quattro risposte diverse — e una di esse non e'
// «media di ruolo».
//
// PROVENIENZA DELLE UNDICI LETTERE, dichiarata perche' non si scambi per una
// citazione. Il brief del committente §4-bis enumera undici situazioni A–K; il
// testo di quel brief non e' fra i documenti accessibili da questo repository.
// L'incarico ricevuto dice esplicitamente «progetta il set minimo di fatti che
// separa A|B|C|D|E|F|G|H|I|J|K e documenta la decisione per ciascuna», e
// nomina la misura che serve per prima: la scomposizione delle righe senza
// match storico nelle famiglie {B, C, D, E, G}. Le lettere qui sotto sono
// quindi UNA PROGETTAZIONE, vincolata da quel requisito — B, C, D, E, G sono
// esattamente le famiglie senza storico Serie A — e dai fatti che i documenti
// canonici stabiliscono (la Serie B non e' un campionato estero e resta
// disponibile; le leghe estere entrano solo se raccolte; l'identita' ambigua si
// mette in coda, non si indovina). Se il brief originale usasse un'altra
// corrispondenza, cambiano le ETICHETTE, non le situazioni ne' le decisioni.
//
// PRECEDENZA. Le condizioni non sono mutuamente esclusive nei dati (un
// giocatore puo' avere insieme statistiche estere e di Serie B), quindi
// l'ordine di valutazione e' parte della definizione ed e' scritto sotto, in
// `classifyCoverage`. Un ordine implicito sarebbe una classificazione che
// dipende da come e' scritto il codice.

import type { GenRole, GenSeason } from "./genTypes.js";

/** Le undici situazioni. La lettera e' l'identificatore; il nome e' la spiegazione. */
export type GenCoverageSituation = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

/** Che cosa si puo' applicare a una riga, una volta saputo in che situazione e'. */
export type GenCoverageModel =
  /** Modello domestico sul set pieno di feature (S2/S3 secondo l'era). */
  | "domestic_full"
  /** Modello domestico sul solo blocco X: nessuna statistica di stagione agganciata. */
  | "domestic_s1_only"
  /** Solo la baseline B0: la riga non regge un vettore, ma un numero onesto ce l'ha. */
  | "baseline_only"
  /** Il modello di transizione T8, che restituisce un RANGE e mai un numero secco (D5). */
  | "foreign_transition"
  /** Niente: `n/d` motivato. Mai un riempitivo. */
  | "none";

/** Il tier di feature applicabile alla riga. */
export type GenCoverageTier = "S1" | "S2" | "S3" | "foreign" | "none";

/** I fatti tipizzati che bastano — e servono tutti — a separare le undici situazioni. */
export interface GenCoverageFacts {
  readonly playerKey: string;
  readonly role: GenRole;
  /** L'identita' della riga e' in coda di review manuale (§A.0.4): non si indovina, si sospende. */
  readonly identitaInReview: boolean;
  /** Esiste almeno una stagione di voti Serie A osservata ≤ s−1. */
  readonly haStoricoVotiSerieA: boolean;
  /** L'ultima stagione con voti osservati; `null` se non ce ne sono. */
  readonly ultimaStagioneVoti: GenSeason | null;
  /** `true` se `ultimaStagioneVoti` e' proprio `s−1` (nessun buco). */
  readonly haVotiInS1: boolean;
  /** Presenze valide in `s−1`; `null` se non c'e' riga di voti in `s−1`. */
  readonly presenzeS1: number | null;
  /** Esiste una riga di statistiche di stagione domestica per `s−1`. */
  readonly haStatsDomesticheS1: boolean;
  /** Esistono statistiche estere per il giocatore. */
  readonly haStatsEstere: boolean;
  /** La lega estera di provenienza e' dentro il perimetro raccolto. */
  readonly legaEsteraCoperta: boolean;
  /** Esistono statistiche di Serie B (che NON e' un campionato estero, §D.13). */
  readonly haStatsSerieB: boolean;
}

/** Perche' la riga sta dove sta: un codice, non una frase da interpretare. */
export type GenCoverageReasonCode =
  | "FULL_HISTORY"
  | "FOREIGN_LEAGUE_COVERED"
  | "FOREIGN_LEAGUE_NOT_COLLECTED"
  | "SERIE_B_ONLY"
  | "DOMESTIC_STATS_WITHOUT_VOTES"
  | "HISTORY_GAP_IN_PREVIOUS_SEASON"
  | "NO_DATA_AT_ALL"
  | "VOTES_WITHOUT_DOMESTIC_STATS"
  | "TOO_FEW_PRESENCES_FOR_RATES"
  | "ALL_SV_SEASON"
  | "IDENTITY_REVIEW_REQUIRED";

export interface GenCoverageVerdict {
  readonly playerKey: string;
  readonly role: GenRole;
  readonly situazione: GenCoverageSituation;
  readonly modelloApplicabile: GenCoverageModel;
  readonly tierFeature: GenCoverageTier;
  /** `true` se la riga puo' ricevere un numero. `false` = `n/d`, col suo motivo. */
  readonly servable: boolean;
  readonly reasonCode: GenCoverageReasonCode;
  /** La spiegazione leggibile, quella che finisce accanto a un `n/d` nel report. */
  readonly motivo: string;
}

/** Presenze sotto le quali i tassi e la volatilita' della stagione non esistono. */
export const MIN_PRESENCES_FOR_RATES = 2;

/** Le famiglie senza storico Serie A: la scomposizione che il primo passo chiede. */
export const UNMATCHED_FAMILIES: readonly GenCoverageSituation[] = ["B", "C", "D", "E", "G"] as const;

/**
 * La descrizione di ogni situazione e la decisione che le corrisponde.
 *
 * E' esportata perche' un report che dice «situazione D» deve poter dire anche
 * perche' D significa quello, senza che chi legge apra il codice.
 */
export const GEN_COVERAGE_SITUATIONS: Readonly<
  Record<
    GenCoverageSituation,
    {
      readonly nome: string;
      readonly descrizione: string;
      readonly decisione: string;
    }
  >
> = {
  A: {
    nome: "storico domestico completo",
    descrizione: "voti in s−1 con almeno 2 presenze e statistiche di stagione domestiche agganciate",
    decisione:
      "modello domestico sul set pieno; il tier lo decide l'era della stagione (S2, oppure S3 dove i campi Tier B esistono)",
  },
  B: {
    nome: "arrivo dall'estero, lega coperta",
    descrizione: "nessuno storico voti Serie A, statistiche estere presenti, lega dentro il perimetro raccolto",
    decisione:
      "modello di transizione T8, che restituisce un RANGE (D5, ampiezza minima 12 punti) e mai un numero secco",
  },
  C: {
    nome: "arrivo dall'estero, lega non raccolta",
    descrizione: "nessuno storico voti Serie A, statistiche estere presenti, lega FUORI dal perimetro raccolto",
    decisione:
      "n/d motivato: senza le stagioni di quella lega non esiste una coorte di transizione, e un moltiplicatore a mano e' esattamente cio' che §D.13 vieta",
  },
  D: {
    nome: "promosso o rientrato dalla Serie B",
    descrizione: "nessuno storico voti Serie A, statistiche di Serie B presenti",
    decisione:
      "modello di transizione T8 con la Serie B come lega: la Serie B non e' un campionato estero e resta disponibile (§D.13), quindi ha la precedenza sul ramo estero quando ci sono entrambe",
  },
  E: {
    nome: "statistiche domestiche senza voti",
    descrizione: "riga di statistiche domestiche per s−1 ma nessuna riga di voti: il giocatore non e' mai comparso in pagella",
    decisione:
      "il blocco X non esiste per questa riga e i bersagli di voto nemmeno; si serve al piu' la baseline, e la riga si conta a parte nel report",
  },
  F: {
    nome: "storico interrotto",
    descrizione: "voti Serie A osservati, ma non in s−1: un anno di buco (infortunio lungo, un anno altrove)",
    decisione:
      "riga EMESSA con le Lag1 a NaN e le Rolling3 sulle stagioni osservate — e' la riparazione di `featureCatalog.ts`; il modello e' quello domestico sul solo blocco X, perche' le statistiche di s−1 non esistono",
  },
  G: {
    nome: "esordiente assoluto",
    descrizione: "nessun voto, nessuna statistica, da nessuna parte",
    decisione:
      "n/d motivato. MAI la media di ruolo come riempitivo: sarebbe un numero che non misura questo giocatore, indistinguibile a valle da uno che lo misura",
  },
  H: {
    nome: "voti senza statistiche di stagione",
    descrizione: "voti in s−1 con presenze sufficienti, ma nessuna statistica di stagione agganciata",
    decisione: "modello domestico sul solo set S1 (blocco X): tutto cio' che i voti sanno dire, e nulla di piu'",
  },
  I: {
    nome: "storico minimo",
    descrizione: "voti in s−1 con meno di 2 presenze valide: tassi e volatilita' non esistono",
    decisione:
      "solo baseline: con una presenza la fantamedia e' un voto, e uno shrinkage verso il ruolo e' l'unica lettura onesta. Sono le 11 righe che uscivano `NON_FINITE_FEATURES` su volatilita'",
  },
  J: {
    nome: "stagione tutta SV",
    descrizione: "il giocatore e' nella popolazione di s−1 ma con 0 presenze valide",
    decisione:
      "T-N e T1 restano servibili (0 e' un valore, §A.3); T2 e' INDEFINITO e la riga esce dal solo T2, mai coercita a 0",
  },
  K: {
    nome: "identita' in review",
    descrizione: "la catena d'identita' non e' risolta (omonimia, cambio ruolo, grafia)",
    decisione:
      "n/d e riga esclusa anche dal training, contata nel report (§A.0.4): «una riga non risolta e' esclusa, mai indovinata»",
  },
};

/**
 * Classifica una riga di listone.
 *
 * L'ORDINE di valutazione, che e' parte della definizione:
 *   1. K — l'identita' viene prima di tutto: se non si sa CHI e', nessun'altra
 *      domanda ha senso;
 *   2. il ramo «ha storico voti Serie A»: J (tutte SV) -> I (meno di 2
 *      presenze) -> A/H (secondo le statistiche di stagione) se i voti sono in
 *      s−1, altrimenti F (buco);
 *   3. il ramo «nessuno storico voti»: E (statistiche domestiche senza voti)
 *      -> D (Serie B) -> B/C (estero, secondo la copertura della lega) -> G.
 *
 * D prima di B/C perche' la Serie B e' disponibile per decisione e l'estero
 * dipende da una raccolta che puo' non essere atterrata: fra due strade, si
 * prende quella che esiste.
 */
export function classifyCoverage(facts: GenCoverageFacts): GenCoverageVerdict {
  const base = { playerKey: facts.playerKey, role: facts.role };

  if (facts.identitaInReview) {
    return {
      ...base,
      situazione: "K",
      modelloApplicabile: "none",
      tierFeature: "none",
      servable: false,
      reasonCode: "IDENTITY_REVIEW_REQUIRED",
      motivo: "identita' non risolta: la riga sta in coda di review e non si indovina (§A.0.4)",
    };
  }

  if (facts.haStoricoVotiSerieA) {
    if (facts.haVotiInS1) {
      const presenze = facts.presenzeS1 ?? 0;
      if (presenze === 0) {
        return {
          ...base,
          situazione: "J",
          modelloApplicabile: "baseline_only",
          tierFeature: "S1",
          servable: true,
          reasonCode: "ALL_SV_SEASON",
          motivo:
            "stagione s−1 senza presenze valide: T-N e T1 valgono 0 (e 0 e' un valore, §A.3), T2 resta indefinito",
        };
      }
      if (presenze < MIN_PRESENCES_FOR_RATES) {
        return {
          ...base,
          situazione: "I",
          modelloApplicabile: "baseline_only",
          tierFeature: "S1",
          servable: true,
          reasonCode: "TOO_FEW_PRESENCES_FOR_RATES",
          motivo:
            `una sola presenza valida in s−1: volatilita' e tassi non esistono (servono almeno ${String(MIN_PRESENCES_FOR_RATES)} presenze), ` +
            "si serve la baseline",
        };
      }
      if (facts.haStatsDomesticheS1) {
        return {
          ...base,
          situazione: "A",
          modelloApplicabile: "domestic_full",
          tierFeature: "S2",
          servable: true,
          reasonCode: "FULL_HISTORY",
          motivo: "storico voti e statistiche di stagione entrambi presenti per s−1",
        };
      }
      return {
        ...base,
        situazione: "H",
        modelloApplicabile: "domestic_s1_only",
        tierFeature: "S1",
        servable: true,
        reasonCode: "VOTES_WITHOUT_DOMESTIC_STATS",
        motivo: "voti presenti, statistiche di stagione assenti: resta il set S1, il blocco X dai voti",
      };
    }
    return {
      ...base,
      situazione: "F",
      modelloApplicabile: "domestic_s1_only",
      tierFeature: "S1",
      servable: true,
      reasonCode: "HISTORY_GAP_IN_PREVIOUS_SEASON",
      motivo:
        `ultima stagione con voti: ${facts.ultimaStagioneVoti ?? "ignota"} — buco in s−1. La riga si emette lo stesso: ` +
        "Lag1 a NaN, Rolling3 sulle stagioni osservate",
    };
  }

  if (facts.haStatsDomesticheS1) {
    return {
      ...base,
      situazione: "E",
      modelloApplicabile: "baseline_only",
      tierFeature: "S2",
      servable: true,
      reasonCode: "DOMESTIC_STATS_WITHOUT_VOTES",
      motivo:
        "statistiche domestiche s−1 senza alcuna riga di voti: nessun blocco X, nessun bersaglio di voto osservato",
    };
  }
  if (facts.haStatsSerieB) {
    return {
      ...base,
      situazione: "D",
      modelloApplicabile: "foreign_transition",
      tierFeature: "foreign",
      servable: true,
      reasonCode: "SERIE_B_ONLY",
      motivo: "nessuno storico Serie A, statistiche di Serie B disponibili: transizione con la Serie B come lega",
    };
  }
  if (facts.haStatsEstere) {
    if (facts.legaEsteraCoperta) {
      return {
        ...base,
        situazione: "B",
        modelloApplicabile: "foreign_transition",
        tierFeature: "foreign",
        servable: true,
        reasonCode: "FOREIGN_LEAGUE_COVERED",
        motivo: "nessuno storico Serie A, lega estera dentro il perimetro raccolto: transizione con effetto-lega",
      };
    }
    return {
      ...base,
      situazione: "C",
      modelloApplicabile: "none",
      tierFeature: "none",
      servable: false,
      reasonCode: "FOREIGN_LEAGUE_NOT_COLLECTED",
      motivo:
        "lega estera fuori dal perimetro raccolto: senza le sue stagioni non c'e' coorte di transizione, e un moltiplicatore a mano e' vietato (§D.13)",
    };
  }

  return {
    ...base,
    situazione: "G",
    modelloApplicabile: "none",
    tierFeature: "none",
    servable: false,
    reasonCode: "NO_DATA_AT_ALL",
    motivo: "nessun voto e nessuna statistica: n/d motivato, mai una media di ruolo al suo posto",
  };
}

export interface UnmatchedSplit {
  /** Conteggio per famiglia senza storico Serie A: {B, C, D, E, G}. */
  readonly counts: Readonly<Record<GenCoverageSituation, number>>;
  /** Le righe, raggruppate per situazione. */
  readonly rows: Readonly<Partial<Record<GenCoverageSituation, readonly GenCoverageVerdict[]>>>;
  /** Totale delle righe senza storico Serie A. */
  readonly total: number;
  /** Quante di esse sono comunque servibili: la parte recuperabile della fetta. */
  readonly servable: number;
}

/**
 * La misura del primo passo: separa e CONTA le famiglie {B, C, D, E, G} delle
 * righe senza match storico.
 *
 * Serve a sostituire un numero solo («150 righe senza riscontro») con cinque
 * numeri che dicono che cosa manca a ciascuna: perche' le risposte sono
 * diverse — una raccolta di lega, un modello di transizione, oppure la
 * constatazione che di quel giocatore non esiste niente e il numero onesto e'
 * `n/d`.
 */
export function splitUnmatchedRows(rows: readonly GenCoverageFacts[]): UnmatchedSplit {
  const verdicts = rows.map(classifyCoverage);
  const counts = {} as Record<GenCoverageSituation, number>;
  for (const situation of Object.keys(GEN_COVERAGE_SITUATIONS) as GenCoverageSituation[]) counts[situation] = 0;
  const grouped: Partial<Record<GenCoverageSituation, GenCoverageVerdict[]>> = {};
  let total = 0;
  let servable = 0;
  for (const verdict of verdicts) {
    if (!UNMATCHED_FAMILIES.includes(verdict.situazione)) continue;
    counts[verdict.situazione] += 1;
    (grouped[verdict.situazione] ??= []).push(verdict);
    total++;
    if (verdict.servable) servable++;
  }
  return { counts, rows: grouped, total, servable };
}

/** Il conteggio completo per situazione: la tabella che il report stampa per intero. */
export function coverageSummary(rows: readonly GenCoverageFacts[]): Readonly<Record<GenCoverageSituation, number>> {
  const counts = {} as Record<GenCoverageSituation, number>;
  for (const situation of Object.keys(GEN_COVERAGE_SITUATIONS) as GenCoverageSituation[]) counts[situation] = 0;
  for (const facts of rows) counts[classifyCoverage(facts).situazione] += 1;
  return counts;
}
