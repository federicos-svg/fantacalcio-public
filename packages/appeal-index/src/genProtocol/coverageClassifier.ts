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
// LE LETTERE SONO QUELLE DEL COMMITTENTE (brief §4-bis), non una nomenclatura
// di comodo. La prima stesura di questo modulo fu scritta senza accesso a quel
// testo e invento' una corrispondenza propria; la revisione l'ha corretta con
// la tabella originale, che si trascrive qui perche' e' l'unica valida nei
// report:
//
//   A  anni consecutivi in Serie A               bersaglio si'      feature si'
//   B  in Serie A, ha saltato l'ultimo anno      bersaglio vecchio  feature vecchie
//   C  promosso dalla Serie B                    nessun bersaglio   feature Serie B
//   D  arrivo da uno dei 14 campionati esteri    nessun bersaglio   feature estere
//   E  arrivo da un campionato FUORI dai 14      nessun bersaglio   nessuna feature
//   F  ex Serie A, tornato dopo anni all'estero  bersaglio vecchio  feature miste
//   G  esordiente assoluto / dalla Primavera     nessun bersaglio   quasi niente
//   H  in Serie A ma con pochissime presenze     bersaglio magro    feature rumorose
//   I  portiere di riserva                       bersaglio magro    feature si'
//   J  trasferito a stagione in corso            bersaglio «dipende» feature spezzate
//   K  cambio squadra dentro la Serie A          bersaglio si'      feature si'
//
// Con le etichette sono cambiati i NOMI, non le RISPOSTE: ogni decisione della
// prima stesura e' ancora qui, sotto la lettera giusta. Cio' che occupava una
// lettera senza essere una situazione e' diventato cio' che e':
//   - l'identita' in coda di review e' un `reasonCode` ORTOGONALE, che puo'
//     accompagnare qualunque lettera e che sospende la riga comunque;
//   - la stagione tutta SV e' un attributo della riga dentro A/B/H, non una
//     situazione a se';
//   - «meno di 2 presenze in s−1» e' la lettera H della tabella vera;
//   - «statistiche domestiche senza voti» non ha lettera propria: confluisce in
//     H o in G secondo i fatti, col criterio scritto in `classifyByData`.
//
// LA MISURA DEL PRIMO PASSO resta la stessa e ora conta le famiglie giuste:
// «le 150 sono esattamente le situazioni B, C, D, E e G messe insieme». Con le
// lettere della prima stesura avrebbe escluso proprio i rientri dopo un anno di
// buco, che sono fra i primi a non trovare match su s−1.
//
// PRECEDENZA. Le condizioni non sono mutuamente esclusive nei dati (un
// giocatore puo' avere insieme statistiche estere e di Serie B), quindi
// l'ordine di valutazione e' parte della definizione ed e' scritto sotto, in
// `classifyByData`. Un ordine implicito sarebbe una classificazione che dipende
// da come e' scritto il codice.

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

/**
 * La quarta colonna della tabella del committente: che cosa il TRAINING puo'
 * fare di questa riga, che non e' la stessa domanda di `servable`.
 *
 * Una riga puo' ricevere un numero senza poterlo insegnare a nessuno — e' il
 * caso di C e D, che un bersaglio Serie A non ce l'hanno — e la distinzione va
 * tenuta visibile: e' quella che impedisce di gonfiare un train set con righe
 * che nel bersaglio non hanno niente.
 */
export type GenCoverageTrainability =
  /** Entra nel training senza condizioni. */
  | "si"
  /** Entra nel training con la condizione scritta nella `decisione`. */
  | "si_condizionata"
  /** Fuori dal training: un numero lo puo' ricevere, ma non ha niente da insegnare. */
  | "no_solo_valutabile"
  /** Fuori dal training e fuori dal serving: `n/d` motivato. */
  | "no";

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
  /** La lega estera di provenienza e' dentro il perimetro raccolto (i 14 campionati). */
  readonly legaEsteraCoperta: boolean;
  /** Esistono statistiche di Serie B (che NON e' un campionato estero, §D.13). */
  readonly haStatsSerieB: boolean;
  /**
   * Esistono statistiche estere per le stagioni del BUCO, cioe' fra
   * `ultimaStagioneVoti` e `s−1`.
   *
   * E' il fatto che separa F da B, e sono due storie diverse sotto lo stesso
   * buco di voti: chi giocava altrove (F) e chi non giocava affatto — infortunio
   * lungo, svincolo, un anno fuori rosa (B).
   */
  readonly haStatsEstereRecenti: boolean;
  /**
   * La `s−1` del giocatore e' spezzata su due campionati diversi: trasferimento
   * a stagione in corso, e quindi due mezze stagioni al posto di una.
   */
  readonly statsSpezzateSuDueLeghe: boolean;
  /**
   * Cambio squadra DENTRO la Serie A fra `s−2` e `s−1`.
   *
   * E' gia' una feature del modello (`teamChangedFlag`, §D.5) e non cambia il
   * calcolo: qui serve solo a dare alla riga la lettera K, che il committente
   * vuole poter contare nel report.
   */
  readonly cambioSquadraInSerieA: boolean;
}

/**
 * Perche' la riga sta dove sta: un codice, non una frase da interpretare.
 *
 * I codici sono ORTOGONALI alle lettere. `IDENTITY_REVIEW_REQUIRED` puo'
 * accompagnare qualunque situazione; `ALL_SV_SEASON` e
 * `TOO_FEW_PRESENCES_FOR_RATES` distinguono due righe che stanno nella stessa
 * lettera; `FULL_HISTORY` e `VOTES_WITHOUT_DOMESTIC_STATS` distinguono le due
 * profondita' di A (e di K, che di A e' il gemello con la maglia cambiata).
 */
export type GenCoverageReasonCode =
  | "FULL_HISTORY"
  | "FOREIGN_LEAGUE_COVERED"
  | "FOREIGN_LEAGUE_NOT_COLLECTED"
  | "SERIE_B_ONLY"
  | "DOMESTIC_STATS_WITHOUT_VOTES"
  | "HISTORY_GAP_IN_PREVIOUS_SEASON"
  | "RETURN_AFTER_SEASONS_ABROAD"
  | "SPLIT_SEASON_ACROSS_LEAGUES"
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

/**
 * Le famiglie che il committente conta insieme: «le 150 sono esattamente le
 * situazioni B, C, D, E e G messe insieme».
 *
 * L'elenco e' suo e si prende come sta. La lettura che lo rende coerente e' che
 * sono le righe alle quali su `s−1` non risponde NIENTE: B non ha giocato, C
 * era in Serie B, D e E erano altrove, G non esiste ancora. F, che pure ha lo
 * stesso buco di voti di B, ha statistiche estere recenti — qualcosa che fa
 * match c'e' — e infatti il committente non la mette nel gruppo.
 */
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
      readonly addestrabile: GenCoverageTrainability;
    }
  >
> = {
  A: {
    nome: "anni consecutivi in Serie A",
    descrizione: "voti in s−1 con almeno 2 presenze valide: la stagione precedente e' osservata e utilizzabile",
    decisione:
      "modello domestico sul set pieno quando le statistiche di stagione sono agganciate (tier S2, o S3 dove i campi Tier B esistono); sul solo blocco X quando mancano — quale dei due lo dice il reason code",
    addestrabile: "si",
  },
  B: {
    nome: "in Serie A, ha saltato l'ultimo anno",
    descrizione:
      "voti Serie A osservati ma non in s−1, e nessuna statistica estera nelle stagioni del buco: l'anno saltato e' inattivita' (infortunio lungo, svincolo, fuori rosa)",
    decisione:
      "riga EMESSA lo stesso, con le Lag1 a NaN e le Rolling3 sulle stagioni osservate — e' la riparazione del buco di `featureCatalog.ts`; il modello e' quello domestico sul solo blocco X, perche' le statistiche di s−1 non esistono. Il bersaglio e' vecchio e vecchio resta: non lo si ringiovanisce",
    addestrabile: "si",
  },
  C: {
    nome: "promosso dalla Serie B",
    descrizione: "nessuno storico voti Serie A, statistiche di Serie B presenti",
    decisione:
      "modello di transizione T8 con la Serie B come lega: la Serie B non e' un campionato estero e resta disponibile (§D.13), quindi ha la precedenza sul ramo estero quando ci sono entrambe. La riga si VALUTA e non si addestra: senza bersaglio Serie A non ha niente da insegnare",
    addestrabile: "no_solo_valutabile",
  },
  D: {
    nome: "arrivo da uno dei 14 campionati esteri",
    descrizione: "nessuno storico voti Serie A, statistiche estere presenti, lega dentro il perimetro raccolto",
    decisione:
      "modello di transizione T8, che restituisce un RANGE (D5, ampiezza minima 12 punti) e mai un numero secco; valutabile, non addestrabile — il bersaglio Serie A non c'e'",
    addestrabile: "no_solo_valutabile",
  },
  E: {
    nome: "arrivo da un campionato fuori dai 14",
    descrizione:
      "nessuno storico voti Serie A, statistiche estere presenti ma la lega e' FUORI dal perimetro raccolto",
    decisione:
      "n/d motivato: senza le stagioni di quella lega non esiste una coorte di transizione, e un moltiplicatore a mano e' esattamente cio' che §D.13 vieta. Ne' addestrabile ne' valutabile",
    addestrabile: "no",
  },
  F: {
    nome: "ex Serie A, tornato dopo anni all'estero",
    descrizione:
      "voti Serie A osservati ma non in s−1, e statistiche estere nelle stagioni del buco: il giocatore giocava, altrove",
    decisione:
      "stessa riparazione di B — Lag1 a NaN, Rolling3 sulle stagioni osservate, modello domestico sul solo blocco X — con un LIMITE DICHIARATO: le statistiche estere recenti NON entrano nel modello domestico congelato del protocollo v2.0.0. Sono l'informazione piu' fresca che esiste su questa riga e il modello non la vede: il numero si serve, la cautela si dichiara qui e non a valle",
    addestrabile: "si_condizionata",
  },
  G: {
    nome: "esordiente assoluto o dalla Primavera",
    descrizione: "nessun voto e nessuna statistica, da nessuna parte",
    decisione:
      "n/d motivato. MAI la media di ruolo come riempitivo: sarebbe un numero che non misura questo giocatore, indistinguibile a valle da uno che lo misura",
    addestrabile: "no",
  },
  H: {
    nome: "in Serie A ma con pochissime presenze",
    descrizione:
      "riga di Serie A col bersaglio magro: meno di 2 presenze valide in s−1 (zero incluso, cioe' la stagione tutta SV), oppure statistiche di stagione senza un solo voto",
    decisione:
      "solo baseline: sotto le 2 presenze i tassi e la volatilita' non esistono e uno shrinkage verso il ruolo e' l'unica lettura onesta — sono le 11 righe che uscivano `NON_FINITE_FEATURES` su volatilita'. A 0 presenze T-N e T1 restano servibili (0 e' un valore, §A.3) e il solo T2 e' indefinito. Addestrabile con riserve: il bersaglio esiste ma e' rumoroso, e di che rumore si tratti lo dice il reason code",
    addestrabile: "si_condizionata",
  },
  I: {
    nome: "portiere di riserva",
    descrizione:
      "ruolo P con storico magro: meno di 2 presenze valide in s−1, oppure statistiche di stagione senza un solo voto",
    decisione:
      "per meccanica e' H — baseline, tassi inesistenti sotto le 2 presenze — ma ha lettera propria perche' il ruolo P non entra MAI nel pooled (§D.2): il ladder portieri di §D.8 decide la taglia (`full`, `core`, `minimal`) e sotto la minima resta il fallback preregistrato `heuristic_only`. E' il ruolo piu' fragile, e il committente lo vuole separato nel report",
    addestrabile: "si",
  },
  J: {
    nome: "trasferito a stagione in corso",
    descrizione:
      "la s−1 e' spezzata su due campionati, uno dei quali e' la Serie A: al posto di una stagione ci sono due mezze stagioni",
    decisione:
      "servibile SE le due meta' sono ricomposte, e la ricomposizione e' compito del lato privato (le fonti qui non arrivano): questo core emette la lettera, il reason code e il modello domestico sul solo blocco X. Contare le presenze di una meta' come «pochissime presenze» sarebbe la diagnosi sbagliata, ed e' il motivo per cui J si valuta PRIMA della soglia di presenze",
    addestrabile: "si_condizionata",
  },
  K: {
    nome: "cambio squadra dentro la Serie A",
    descrizione: "storia consecutiva in Serie A, con la squadra di s−1 diversa da quella di s−2",
    decisione:
      "identica ad A: il cambio squadra e' gia' dentro il modello come feature (`teamChangedFlag`, §D.5) e non cambia ne' il tier ne' il modello. La lettera esiste per il REPORT — il committente vuole poter contare le righe che hanno cambiato maglia — non per il calcolo",
    addestrabile: "si",
  },
};

/**
 * Fra H e I decide il RUOLO, non i dati: la meccanica e' la stessa (bersaglio
 * magro, baseline), ma il portiere ha il suo ladder (§D.8) e il committente lo
 * vuole contare a parte perche' e' il ruolo piu' fragile.
 */
function situazioneStoricoMagro(role: GenRole): GenCoverageSituation {
  return role === "P" ? "I" : "H";
}

/**
 * Classifica una riga di listone.
 *
 * L'identita' in coda di review NON e' una situazione: e' una condizione
 * ortogonale. La lettera si stima comunque dai fatti — serve al report, e serve
 * a sapere che cosa si recupererebbe risolvendo l'identita' — ma la riga esce
 * `servable: false` qualunque lettera abbia (§A.0.4: «una riga non risolta e'
 * esclusa, mai indovinata»).
 */
export function classifyCoverage(facts: GenCoverageFacts): GenCoverageVerdict {
  const verdict = classifyByData(facts);
  if (!facts.identitaInReview) return verdict;
  return {
    ...verdict,
    modelloApplicabile: "none",
    tierFeature: "none",
    servable: false,
    reasonCode: "IDENTITY_REVIEW_REQUIRED",
    motivo:
      "identita' non risolta: la riga sta in coda di review e non si indovina (§A.0.4). " +
      `Lettera stimata dai fatti: ${verdict.situazione} — resta una stima finche' l'identita' non e' risolta`,
  };
}

/**
 * La classificazione sui soli dati, senza la condizione d'identita'.
 *
 * L'ORDINE di valutazione, che e' parte della definizione:
 *   1. il ramo «ha storico voti Serie A»:
 *      a. con voti in s−1: J (stagione spezzata) -> H/I (bersaglio magro, e il
 *         reason code separa le 0 presenze dall'unica presenza) -> A/K
 *         (consecutiva, con o senza cambio maglia; il reason code separa il set
 *         pieno dal solo blocco X);
 *      b. senza voti in s−1, cioe' col buco: F se le statistiche estere coprono
 *         il buco, altrimenti B.
 *   2. il ramo «nessuno storico voti Serie A»: statistiche domestiche senza
 *      voti -> H/I; poi C (Serie B) -> D/E (estero, secondo la copertura della
 *      lega) -> G.
 *
 * J prima della soglia di presenze perche' mezza stagione ha per costruzione
 * meno presenze di una stagione: leggerla come «pochissime presenze» sarebbe
 * confondere un problema di ricomposizione con un fatto sul giocatore. Una s−1
 * spezzata fra due campionati ESTERI non e' J — nessuna delle due meta'
 * produce un bersaglio e la riga resta un arrivo dall'estero, D o E.
 *
 * C prima di D/E perche' la Serie B e' disponibile per decisione e l'estero
 * dipende da una raccolta che puo' non essere atterrata: fra due strade, si
 * prende quella che esiste.
 *
 * Le statistiche domestiche senza voti sono il caso che la tabella del
 * committente non nomina, e il CRITERIO e' scritto qui: se il vettore di
 * stagione domestico c'e' e manca solo il bersaglio, il giocatore in Serie A
 * c'e' stato senza mai finire in pagella — e' un bersaglio magro, cioe' H (I se
 * e' un portiere). Se non c'e' nemmeno quello, non c'e' niente: e' G.
 */
function classifyByData(facts: GenCoverageFacts): GenCoverageVerdict {
  const base = { playerKey: facts.playerKey, role: facts.role };

  if (facts.haStoricoVotiSerieA) {
    if (facts.haVotiInS1) {
      if (facts.statsSpezzateSuDueLeghe) {
        return {
          ...base,
          situazione: "J",
          modelloApplicabile: "domestic_s1_only",
          tierFeature: "S1",
          servable: true,
          reasonCode: "SPLIT_SEASON_ACROSS_LEAGUES",
          motivo:
            "s−1 spezzata su due campionati: i totali sono due mezze stagioni e vanno ricomposti prima dell'uso " +
            "(la ricomposizione e' del lato privato); qui la riga esce sul solo blocco X",
        };
      }
      const presenze = facts.presenzeS1 ?? 0;
      if (presenze < MIN_PRESENCES_FOR_RATES) {
        const situazione = situazioneStoricoMagro(facts.role);
        if (presenze === 0) {
          return {
            ...base,
            situazione,
            modelloApplicabile: "baseline_only",
            tierFeature: "S1",
            servable: true,
            reasonCode: "ALL_SV_SEASON",
            motivo:
              "stagione s−1 senza presenze valide: T-N e T1 valgono 0 (e 0 e' un valore, §A.3), T2 resta indefinito",
          };
        }
        return {
          ...base,
          situazione,
          modelloApplicabile: "baseline_only",
          tierFeature: "S1",
          servable: true,
          reasonCode: "TOO_FEW_PRESENCES_FOR_RATES",
          motivo:
            `una sola presenza valida in s−1: volatilita' e tassi non esistono (servono almeno ${String(MIN_PRESENCES_FOR_RATES)} presenze), ` +
            "si serve la baseline",
        };
      }
      const situazione: GenCoverageSituation = facts.cambioSquadraInSerieA ? "K" : "A";
      if (facts.haStatsDomesticheS1) {
        return {
          ...base,
          situazione,
          modelloApplicabile: "domestic_full",
          tierFeature: "S2",
          servable: true,
          reasonCode: "FULL_HISTORY",
          motivo: "storico voti e statistiche di stagione entrambi presenti per s−1",
        };
      }
      return {
        ...base,
        situazione,
        modelloApplicabile: "domestic_s1_only",
        tierFeature: "S1",
        servable: true,
        reasonCode: "VOTES_WITHOUT_DOMESTIC_STATS",
        motivo: "voti presenti, statistiche di stagione assenti: resta il set S1, il blocco X dai voti",
      };
    }
    if (facts.haStatsEstereRecenti) {
      return {
        ...base,
        situazione: "F",
        modelloApplicabile: "domestic_s1_only",
        tierFeature: "S1",
        servable: true,
        reasonCode: "RETURN_AFTER_SEASONS_ABROAD",
        motivo:
          `ultima stagione con voti: ${facts.ultimaStagioneVoti ?? "ignota"} — buco riempito da stagioni all'estero. ` +
          "La riga si emette lo stesso (Lag1 a NaN, Rolling3 sulle stagioni osservate), ma le statistiche estere " +
          "recenti restano FUORI dal modello domestico congelato: limite dichiarato del protocollo v2.0.0",
      };
    }
    return {
      ...base,
      situazione: "B",
      modelloApplicabile: "domestic_s1_only",
      tierFeature: "S1",
      servable: true,
      reasonCode: "HISTORY_GAP_IN_PREVIOUS_SEASON",
      motivo:
        `ultima stagione con voti: ${facts.ultimaStagioneVoti ?? "ignota"} — anno saltato, e nessuna statistica altrove. ` +
        "La riga si emette lo stesso: Lag1 a NaN, Rolling3 sulle stagioni osservate",
    };
  }

  if (facts.haStatsDomesticheS1) {
    return {
      ...base,
      situazione: situazioneStoricoMagro(facts.role),
      modelloApplicabile: "baseline_only",
      tierFeature: "S2",
      servable: true,
      reasonCode: "DOMESTIC_STATS_WITHOUT_VOTES",
      motivo:
        "statistiche domestiche s−1 senza alcuna riga di voti: il vettore di stagione c'e', il bersaglio no — " +
        "si serve al piu' la baseline, e la riga si conta a parte nel report",
    };
  }
  if (facts.haStatsSerieB) {
    return {
      ...base,
      situazione: "C",
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
        situazione: "D",
        modelloApplicabile: "foreign_transition",
        tierFeature: "foreign",
        servable: true,
        reasonCode: "FOREIGN_LEAGUE_COVERED",
        motivo: "nessuno storico Serie A, lega estera dentro il perimetro raccolto: transizione con effetto-lega",
      };
    }
    return {
      ...base,
      situazione: "E",
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
  /** Conteggio per famiglia senza riscontro su s−1: {B, C, D, E, G}. */
  readonly counts: Readonly<Record<GenCoverageSituation, number>>;
  /** Le righe, raggruppate per situazione. */
  readonly rows: Readonly<Partial<Record<GenCoverageSituation, readonly GenCoverageVerdict[]>>>;
  /** Totale delle righe senza riscontro su s−1. */
  readonly total: number;
  /** Quante di esse sono comunque servibili: la parte recuperabile della fetta. */
  readonly servable: number;
  /**
   * Quante di esse sono sospese per identita' in review.
   *
   * E' un conteggio a parte perche' l'identita' e' ortogonale alla lettera: una
   * riga sospesa conserva la sua famiglia stimata e resta non servibile, e le
   * due cose vanno lette insieme — «di queste 150, tot aspettano un dato e tot
   * aspettano una decisione su chi sono».
   */
  readonly inIdentityReview: number;
}

/**
 * La misura del primo passo: separa e CONTA le famiglie {B, C, D, E, G} delle
 * righe che su `s−1` non trovano riscontro.
 *
 * Serve a sostituire un numero solo («150 righe senza riscontro») con cinque
 * numeri che dicono che cosa manca a ciascuna: perche' le risposte sono
 * diverse — una raccolta di lega, un modello di transizione, la riparazione di
 * un buco, oppure la constatazione che di quel giocatore non esiste niente e il
 * numero onesto e' `n/d`.
 */
export function splitUnmatchedRows(rows: readonly GenCoverageFacts[]): UnmatchedSplit {
  const verdicts = rows.map(classifyCoverage);
  const counts = {} as Record<GenCoverageSituation, number>;
  for (const situation of Object.keys(GEN_COVERAGE_SITUATIONS) as GenCoverageSituation[]) counts[situation] = 0;
  const grouped: Partial<Record<GenCoverageSituation, GenCoverageVerdict[]>> = {};
  let total = 0;
  let servable = 0;
  let inIdentityReview = 0;
  for (const verdict of verdicts) {
    if (!UNMATCHED_FAMILIES.includes(verdict.situazione)) continue;
    counts[verdict.situazione] += 1;
    (grouped[verdict.situazione] ??= []).push(verdict);
    total++;
    if (verdict.servable) servable++;
    if (verdict.reasonCode === "IDENTITY_REVIEW_REQUIRED") inIdentityReview++;
  }
  return { counts, rows: grouped, total, servable, inIdentityReview };
}

/** Il conteggio completo per situazione: la tabella che il report stampa per intero. */
export function coverageSummary(rows: readonly GenCoverageFacts[]): Readonly<Record<GenCoverageSituation, number>> {
  const counts = {} as Record<GenCoverageSituation, number>;
  for (const situation of Object.keys(GEN_COVERAGE_SITUATIONS) as GenCoverageSituation[]) counts[situation] = 0;
  for (const facts of rows) counts[classifyCoverage(facts).situazione] += 1;
  return counts;
}
