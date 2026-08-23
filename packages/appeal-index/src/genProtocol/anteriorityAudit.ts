// GEN-PROTOCOL-A §G — anteriorita' temporale: non si dichiara, si dimostra. PURO.
//
// §G elenca quattro meccanismi indipendenti e tutti obbligatori. Qui vivono il
// secondo e il quarto, quelli che il core pubblico puo' eseguire senza toccare
// un deposito:
//
//   2. runtime, per riga: ogni riga porta `sourceSeasons[]` e si riverifica,
//      riga per riga, che `max(sourceSeasons) < targetSeason`. Una violazione
//      e' un errore FATALE, non un warning (§G.2);
//   4. canarino di protocollo: si inietta una stagione sintetica marcata `s+1`
//      per tre giocatori finti e si verifica che nessuna feature di una riga
//      con target ≤ s cambi di un bit (§G.4).
//
// Il primo meccanismo (strutturale) e' una proprieta' del builder
// (`featureCatalog.ts`, che costruisce solo da stagioni ≤ s−1); il terzo
// (end-to-end, mutazione dell'ultima stagione grezza) e' un test, ed e' scritto
// come tale in `tests/genProtocolEndToEnd.test.ts`.
//
// Perche' `assertNoGenLeakage` e non `assertNoLeakage` di `../dataset.ts`:
// quella funzione riverifica la stessa PROPRIETA' su un'ALTRA riga. Pretende
// una `FeatureRow` del pipeline legacy, con `features: FeatureVector` (dieci
// nomi fissi) e soprattutto con un `featureSeason` singolo, su cui asserisce
// che `sourceSeasons` termini. Una `GenFeatureRow` non ha una «stagione delle
// feature»: puo' avere un BUCO in `s−1` e costruire le proprie Rolling3 dalle
// stagioni osservate (la riparazione della situazione B). Riusarla
// significherebbe o mentire su `featureSeason`, o allargare il tipo legacy e
// cambiare il comportamento di 3.000 test che non c'entrano nulla. Restano due
// funzioni per due forme di riga; la proprieta' dimostrata e' identica, e la
// prova che entrambe la dimostrano davvero e' che una violazione indotta a
// mano viene intercettata (test, non fiducia).

import { seasonYear } from "../identityStability.js";
import type { GenFeatureRow, GenPanelRow, GenSeason } from "./genTypes.js";

export class GenLeakageGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenLeakageGuardError";
  }
}

/** Una violazione di anteriorita', con abbastanza contesto da poterla riprodurre. */
export interface GenAnteriorityViolation {
  readonly kind:
    | "SOURCE_SEASON_NOT_BEFORE_TARGET"
    | "EMPTY_SOURCE_SEASONS"
    | "SOURCE_SEASONS_NOT_SORTED"
    | "CANARY_ROW_CHANGED"
    | "CANARY_ROW_APPEARED"
    | "CANARY_ROW_DISAPPEARED";
  readonly playerKey: string;
  readonly targetSeason: GenSeason;
  /** La stagione incriminata, dove il tipo di violazione ne ha una. */
  readonly season?: GenSeason;
  readonly message: string;
}

export interface GenAnteriorityReport {
  /** Righe effettivamente verificate: il numero che §G chiede di stampare («attese: tutte»). */
  readonly righeVerificate: number;
  readonly violazioni: readonly GenAnteriorityViolation[];
}

/**
 * Il controllo di §G.2 in forma di REPORT: guarda tutte le righe e le riferisce
 * tutte, invece di fermarsi alla prima.
 *
 * Serve al report di run («il report di ogni run conta le righe verificate»),
 * mentre il builder usa la variante che lancia: un dataset con leakage non deve
 * poter proseguire per inerzia fino a un modello.
 */
export function auditAnteriority(rows: readonly GenFeatureRow[]): GenAnteriorityReport {
  const violazioni: GenAnteriorityViolation[] = [];
  for (const row of rows) {
    const targetYear = seasonYear(row.targetSeason);
    if (row.sourceSeasons.length === 0) {
      violazioni.push({
        kind: "EMPTY_SOURCE_SEASONS",
        playerKey: row.playerKey,
        targetSeason: row.targetSeason,
        message:
          `la riga di '${row.playerKey}' (target '${row.targetSeason}') non dichiara alcuna stagione sorgente: ` +
          "senza traccia d'audit l'anteriorita' non e' verificabile, quindi non e' verificata",
      });
      continue;
    }
    let previousYear = Number.NEGATIVE_INFINITY;
    for (const source of row.sourceSeasons) {
      const sourceYear = seasonYear(source);
      if (sourceYear >= targetYear) {
        violazioni.push({
          kind: "SOURCE_SEASON_NOT_BEFORE_TARGET",
          playerKey: row.playerKey,
          targetSeason: row.targetSeason,
          season: source,
          message:
            `'${row.playerKey}': la stagione sorgente '${source}' non e' STRETTAMENTE precedente ` +
            `al target '${row.targetSeason}'`,
        });
      }
      if (sourceYear <= previousYear) {
        violazioni.push({
          kind: "SOURCE_SEASONS_NOT_SORTED",
          playerKey: row.playerKey,
          targetSeason: row.targetSeason,
          season: source,
          message:
            `'${row.playerKey}': le stagioni sorgenti non sono in ordine crescente stretto ('${source}' ` +
            "dopo una stagione uguale o successiva) — una traccia d'audit disordinata non e' una traccia",
        });
      }
      previousYear = sourceYear;
    }
  }
  return { righeVerificate: rows.length, violazioni };
}

/**
 * §G.2 nella forma che il builder usa: la prima violazione ferma tutto.
 *
 * «qualunque violazione e' un errore fatale, non un warning» — la frase e'
 * del protocollo, e questa e' la sua esecuzione.
 */
export function assertNoGenLeakage(rows: readonly GenFeatureRow[]): void {
  const report = auditAnteriority(rows);
  const first = report.violazioni[0];
  if (first !== undefined) {
    throw new GenLeakageGuardError(`GenLeakageGuardError: ${first.message}`);
  }
}

/** La funzione di costruzione che il canarino mette alla prova. */
export type GenFeatureRowBuilder = (panel: readonly GenPanelRow[]) => readonly GenFeatureRow[];

export interface GenLeakCanaryOptions {
  /**
   * La stagione sintetica marcata `s+1` da iniettare. Se assente, si deriva
   * dalla stagione piu' avanzata del panel: `s+1` in formato `"YYYY_YY"`.
   */
  readonly syntheticSeason?: GenSeason;
  /** Quanti giocatori finti iniettare. Tre, come scrive §G.4. */
  readonly fakePlayerCount?: number;
  /** Prefisso delle chiavi dei giocatori finti: mai un nome, nemmeno inventato. */
  readonly fakePlayerPrefix?: string;
}

/** Tre giocatori finti: §G.4 li conta, e il conto e' parte del protocollo. */
export const GEN_CANARY_FAKE_PLAYERS = 3;

/**
 * Il canarino di §G.4, come funzione pura.
 *
 * Si costruisce il dataset dal panel; si costruisce di nuovo da un panel a cui
 * e' stata aggiunta una stagione sintetica marcata `s+1` per tre giocatori
 * finti; si confrontano, in modo strutturale profondo, tutte le righe con
 * target ≤ s. Una sola differenza — un bit — e' una violazione: significa che
 * una stagione futura ha raggiunto una feature del passato.
 *
 * Il confronto e' su `JSON.stringify` delle righe indicizzate per
 * `(playerKey, targetSeason)`: le righe sono oggetti di numeri, stringhe e
 * array, quindi la serializzazione e' una funzione iniettiva della struttura —
 * a un patto, che `NaN` e' `null` in JSON. E' esattamente cio' che si vuole
 * qui: due `NaN` sono la stessa assenza, e un confronto `===` fra `NaN` direbbe
 * di no.
 */
export function runLeakCanary(
  panel: readonly GenPanelRow[],
  build: GenFeatureRowBuilder,
  options: GenLeakCanaryOptions = {},
): GenAnteriorityReport {
  const fakeCount = options.fakePlayerCount ?? GEN_CANARY_FAKE_PLAYERS;
  const prefix = options.fakePlayerPrefix ?? "CANARY_";
  const syntheticSeason = options.syntheticSeason ?? nextSeasonOf(panel);

  const baseline = build(panel);
  const injected = build([...panel, ...syntheticCanaryRows(panel, syntheticSeason, fakeCount, prefix)]);

  const cutoffYear = seasonYear(syntheticSeason);
  const baselineIndex = indexRows(baseline, cutoffYear);
  const injectedIndex = indexRows(injected, cutoffYear);

  const violazioni: GenAnteriorityViolation[] = [];
  for (const [key, serialized] of baselineIndex) {
    const after = injectedIndex.get(key);
    if (after === undefined) {
      const { playerKey, targetSeason } = splitKey(key);
      violazioni.push({
        kind: "CANARY_ROW_DISAPPEARED",
        playerKey,
        targetSeason,
        message: `la riga (${playerKey}, ${targetSeason}) esiste senza la stagione sintetica e sparisce con essa`,
      });
      continue;
    }
    if (after !== serialized) {
      const { playerKey, targetSeason } = splitKey(key);
      violazioni.push({
        kind: "CANARY_ROW_CHANGED",
        playerKey,
        targetSeason,
        season: syntheticSeason,
        message:
          `la riga (${playerKey}, ${targetSeason}) CAMBIA quando si inietta la stagione sintetica ` +
          `'${syntheticSeason}': una stagione futura ha raggiunto una feature del passato`,
      });
    }
  }
  for (const key of injectedIndex.keys()) {
    if (baselineIndex.has(key)) continue;
    const { playerKey, targetSeason } = splitKey(key);
    if (playerKey.startsWith(prefix)) continue; // le righe dei finti sono attese: sono il canarino
    violazioni.push({
      kind: "CANARY_ROW_APPEARED",
      playerKey,
      targetSeason,
      season: syntheticSeason,
      message: `la riga (${playerKey}, ${targetSeason}) NASCE dall'iniezione della stagione sintetica`,
    });
  }

  return { righeVerificate: baselineIndex.size, violazioni };
}

/** `"2018_19"` -> `"2019_20"`. Formato canonico del repository, senza scorciatoie. */
export function nextSeason(season: GenSeason): GenSeason {
  const start = seasonYear(season) + 1;
  const end = (start + 1) % 100;
  return `${String(start)}_${String(end).padStart(2, "0")}`;
}

function nextSeasonOf(panel: readonly GenPanelRow[]): GenSeason {
  if (panel.length === 0) throw new Error("runLeakCanary: panel vuoto, non c'e' una stagione da cui derivare 's+1'");
  let latest = panel[0]!.season;
  for (const row of panel) if (seasonYear(row.season) > seasonYear(latest)) latest = row.season;
  return nextSeason(latest);
}

/**
 * Le righe finte della stagione `s+1`: tre giocatori che non esistono, con
 * statistiche vistose.
 *
 * Vistose apposta: se una di esse raggiungesse una feature del passato, la
 * differenza sarebbe grande e visibile, non un ultimo decimale che si potrebbe
 * scambiare per rumore numerico.
 */
function syntheticCanaryRows(
  panel: readonly GenPanelRow[],
  season: GenSeason,
  count: number,
  prefix: string,
): readonly GenPanelRow[] {
  const template = panel[0];
  if (template === undefined) throw new Error("runLeakCanary: panel vuoto");
  const rows: GenPanelRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      playerKey: `${prefix}${String(i + 1)}`,
      role: template.role,
      season,
      presenze: 38,
      totFantavoto: 38 * 20,
      fantamedia: 20,
      mediaVotoBase: 10,
      matchdays: [],
      seasonStats: {},
    });
  }
  return rows;
}

function indexRows(rows: readonly GenFeatureRow[], cutoffYear: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    // Solo le righe con target ≤ s: quelle con target ≥ s+1 possono
    // legittimamente cambiare, perche' la stagione iniettata E' il loro passato.
    if (seasonYear(row.targetSeason) >= cutoffYear) continue;
    out.set(`${row.playerKey} ${row.targetSeason}`, JSON.stringify(row));
  }
  return out;
}

function splitKey(key: string): { playerKey: string; targetSeason: GenSeason } {
  const [playerKey = "", targetSeason = ""] = key.split(" ");
  return { playerKey, targetSeason };
}
