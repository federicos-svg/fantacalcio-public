// I SEGNALI DI RIGA DEL LISTONE — dove vivono, e perché non si rifanno a ogni
// tasto.
//
// CHE COSA SONO. I cinque voti del Gruppo Esperti e i tre campi ordinati —
// «rigorista», «punizioni», «angoli» — che la tabella mostra e che la riga di
// listone NON porta. Il loro
// valore arriva dal DEPOSITO DELLE SCHEDE, agganciato per NOME + SQUADRA
// (`resolveExpertInsight`, src/expertScheda.ts): è la stessa risoluzione del
// riquadro INSIGHT GIOCATORE, quindi tabella e radar non possono dire due cose
// diverse sullo stesso giocatore.
//
// ── PERCHÉ QUESTO MODULO ESISTE (debito dichiarato di #41) ───────────────────
//
// Questo codice stava dentro `render()` in src/main.ts, e il commento che lo
// accompagnava dichiarava già il difetto: la memoizzazione era «PER RENDER» —
// una `Map` costruita all'inizio del giro e buttata alla fine. Dentro un
// render non si risolveva due volte la stessa riga; FRA un render e il
// successivo non si conservava niente. E `render()` gira A OGNI TASTO della
// ricerca giocatore (`app.innerHTML = ""` e ricostruzione dell'intero DOM).
//
// Il costo era inerte solo perché una guardia lo teneva spento:
// `expertSchedeHavePagella` è falsa finché il deposito non porta pagelle.
// Quando questo modulo è nato quella condizione era «oggi, sempre»; dal
// 2026-08-26 l'estrazione privata produce i voti, quindi **il giorno in cui
// atterra è arrivato** e la passata sul pool intero (~530 righe) riparte a
// ogni tasto senza che nessuno debba riaccenderla.
// Questo modulo la memoizza PRIMA di quel giorno, e la guardia stessa — che
// scandisce il deposito intero, ~200 schede, a ogni chiamata — finisce dentro
// la stessa voce di cache invece di rifarsi a ogni tasto.
//
// LA FORMA È QUELLA DI `buildTierBook` (src/tierOrdering.ts), deliberatamente:
// una `WeakMap` sull'IDENTITÀ dell'ingresso, e la funzione che calcola riceve
// SOLO E SOLTANTO le parti della chiave. «È ancora valida?» ha così una
// risposta meccanica invece che disciplinare. Accanto vive la variante NON
// memoizzata, che è il termine di paragone del test di trasparenza.

import {
  expertSchedeHavePagella,
  resolveExpertInsight,
  type ExpertSchedaStore,
  type SchedaTarget,
} from "./expertScheda.js";
import type { PagellaView } from "./pagellaEsperti.js";
import { schedaLinkRowKey, type SchedaLinks } from "./schedaLinks.js";
import { PIAZZATI_BATTITORE, RIGORI_LABELS, conRango } from "./ui/schedaLabels.js";
import {
  emptyRowSignals,
  type ListonePlayer,
  type ListoneRowSignals,
  type ListoneRowSignalsLookup,
} from "./ui/listone.js";

/**
 * TUTTO CIÒ CHE IL CALCOLO LEGGE, e niente altro. Non è una comodità di
 * firma: è la CHIAVE DELLA CACHE scritta come tipo, così «la voce conservata
 * è ancora valida?» si risponde confrontando questi tre campi invece di
 * ricordarsi che cosa la funzione andava a guardare.
 *
 *  - `pool` — le righe a schermo, per IDENTITÀ di riferimento (vedi sotto);
 *  - `schede` — il deposito indicizzato, sostituito a ogni lettura;
 *  - `links` — le risposte di Pico su quale scheda vale per quale riga,
 *    sostituite (mai mutate) da `withSchedaLink`.
 *
 * Il RUOLO della riga non compare qui perché non è un ingresso globale: viaggia
 * con la riga, ed entra nella chiave per-riga più sotto.
 */
export interface ListoneSignalsInput {
  readonly pool: readonly ListonePlayer[];
  readonly schede: ExpertSchedaStore;
  readonly links: SchedaLinks;
}

/**
 * I SEGNALI DI UNA RIGA, risolti. Puro: stessi ingressi → stessa uscita, e
 * nessuno dei tre ingressi viene toccato.
 *
 * Le parole dei tre segnali ordinati arrivano dal vocabolario chiuso delle
 * schede (src/ui/schedaLabels.ts) e il rango si scrive con `conRango`, la
 * stessa funzione di ogni altra superficie: questo modulo non traduce e non
 * inventa — se una parola non è nel vocabolario, non è arrivata da qui.
 *
 * `pagella` è la vista GIÀ RISOLTA dal contratto, la stessa che alimenta il
 * radar del riquadro d'asta: il quarto asse è già stato scelto dal ruolo della
 * riga e un voto dell'asse sbagliato è già stato rifiutato.
 */
export function resolveRowSignals(
  p: ListonePlayer,
  schede: ExpertSchedaStore,
  links: SchedaLinks,
): ListoneRowSignals {
  // IL RUOLO ENTRA NEL TARGET: serve a una cosa sola, sapere QUALE sia il
  // quarto asse della pagella per questa riga — e ad accorgersi quando la
  // scheda ne porta uno di un altro ruolo (`asseIncoerente`, poi «n.a.» nella
  // cella). Non entra in `listonePlayerKey` né in `schedaLinkRowKey`:
  // l'identità di una riga resta nome + squadra.
  const target: SchedaTarget = { name: p.name, club: p.club, role: p.role };
  const chosen = links.get(schedaLinkRowKey(target)) ?? null;
  const view = resolveExpertInsight(schede, target, chosen);
  if (view.rigori === null && view.piazzati.length === 0 && view.pagella.votiPresenti === 0) {
    return emptyRowSignals(p.role);
  }
  // LE TRE CELLE SI COMPONGONO QUI, con `conRango` — la stessa funzione che
  // scrive il rango nella pastiglia del riquadro e sotto l'icona. Il rango
  // assente non produce nessun numero e non degrada a zero: resta la sola
  // parola, e la colonna lo dichiara nel proprio tooltip.
  const battitore = (kind: "punizioni" | "angoli", rango: number | null): string | null =>
    view.piazzati.includes(kind) ? conRango(PIAZZATI_BATTITORE, rango) : null;
  return {
    rigori: view.rigori === null ? null : conRango(RIGORI_LABELS[view.rigori], view.rangoRigori),
    punizioni: battitore("punizioni", view.rangoPunizioni),
    angoli: battitore("angoli", view.rangoAngoli),
    pagella: view.pagella,
  };
}

/**
 * LA VOCE CONSERVATA. Ciò con cui è stata costruita — se uno solo di questi
 * non combacia, la voce non vale e si ricostruisce. Il pezzo restante della
 * chiave, il `pool`, è la chiave stessa della `WeakMap`, per identità.
 *
 * `poolRows` è una CINTURA, non parte della chiave logica, ed è la stessa di
 * `buildTierBook`: l'identità del `pool` basta finché quell'array viene
 * SOSTITUITO e mai modificato in loco — che è come src/main.ts lo tratta — ma
 * il suo tipo è `ListonePlayer[]`, quindi una `push` resterebbe legale per il
 * compilatore. Confrontare anche la lunghezza costa un intero e fa scadere la
 * voce nell'unica forma di mutazione in loco che qualcuno scriverebbe davvero.
 *
 * `rows` è indicizzata PER IDENTITÀ DELLA RIGA, non per una chiave calcolata,
 * ed è una differenza misurata e non estetica. La versione precedente (in
 * src/main.ts) indicizzava su `listonePlayerKey(p)`, che PIEGA nome e squadra
 * a ogni chiamata: con la tabella ordinata per una colonna di segnale il
 * confronto chiede i segnali ~9.800 volte per render, e la piega diventava il
 * costo dominante — la memoizzazione pagava sé stessa. Le righe di un pool
 * sono oggetti stabili (filtro, ordinamento e paginazione ne passano i
 * riferimenti, mai copie), quindi `===` è già la domanda giusta, esattamente
 * come per il `pool` qui sopra. È una `WeakMap` perché una riga che non
 * appartiene a questo pool non deve poter far crescere la voce.
 *
 * `rows` si riempie PIGRAMENTE, una riga alla volta, e non è un'incoerenza con
 * «la funzione che calcola riceve solo la chiave»: ogni voce di `rows` è una
 * funzione pura di `(riga, schede, links)`, cioè di roba che sta tutta nella
 * chiave. La pigrizia è deliberata e ha un motivo preciso: OGGI il rendering
 * di una pagina ne chiede DIECI (`LISTONE_PAGE_SIZE`), non 532. Riempire la
 * mappa di slancio introdurrebbe adesso proprio la passata sul pool intero
 * che questo modulo esiste per togliere.
 *
 * `views` è la passata sul pool intero che alimenta la nota sotto la tabella:
 * calcolata al più una volta per voce, `null` finché nessuno la chiede.
 */
interface SignalsCacheEntry {
  readonly schede: ExpertSchedaStore;
  readonly links: SchedaLinks;
  readonly poolRows: number;
  readonly rows: WeakMap<ListonePlayer, ListoneRowSignals>;
  views: readonly PagellaView[] | null;
}

/**
 * LA CACHE. Una `WeakMap` sul `pool`, per le stesse tre ragioni di
 * `buildTierBook`:
 *
 *  - **per identità, non per contenuto** — `state.pool` viene SOSTITUITO
 *    quando il listone si ricarica, quindi `===` è già la domanda giusta; un
 *    hash del contenuto costerebbe una passata su 532 righe a ogni tasto,
 *    cioè esattamente il lavoro che si vuole togliere;
 *  - **weak, così non trattiene niente** — un listone sostituito diventa
 *    spazzatura raccoglibile insieme alla sua voce;
 *  - **una voce per pool** — non c'è un secondo listone vivo nella stessa
 *    schermata: `schede` e `links` si confrontano, non si indicizzano.
 */
let signalsCache = new WeakMap<readonly ListonePlayer[], SignalsCacheEntry>();

/** Quante volte la voce è stata davvero costruita e quante riusata; quante
 *  righe hanno davvero pagato una risoluzione; quante volte la passata sul
 *  pool intero è girata. Esistono per essere ASSERITI: «un tasto non
 *  ricalcola» si prova contando, non guardando un cronometro
 *  (src/listoneRowSignals.cache.test.ts). */
let signalsBuilds = 0;
let signalsHits = 0;
let signalsRowBuilds = 0;
let signalsViewBuilds = 0;

export interface ListoneSignalsCacheStats {
  /** Voci di cache costruite da zero. */
  readonly builds: number;
  /** Voci riusate senza ricostruirle. */
  readonly hits: number;
  /** Righe che hanno davvero pagato `resolveRowSignals`. */
  readonly rowBuilds: number;
  /** Passate sul pool intero davvero eseguite (nota sotto la tabella). */
  readonly viewBuilds: number;
}

export function listoneSignalsCacheStats(): ListoneSignalsCacheStats {
  return {
    builds: signalsBuilds,
    hits: signalsHits,
    rowBuilds: signalsRowBuilds,
    viewBuilds: signalsViewBuilds,
  };
}

/** Svuota cache e contatori. Serve ai test per partire da uno stato noto: la
 *  cache è un modulo singleton, e un test che eredita la voce del test
 *  precedente misura la storia invece del proprio caso. */
export function resetListoneSignalsCache(): void {
  signalsCache = new WeakMap<readonly ListonePlayer[], SignalsCacheEntry>();
  signalsBuilds = 0;
  signalsHits = 0;
  signalsRowBuilds = 0;
  signalsViewBuilds = 0;
}

/** La voce valida per questa terna, riusata o costruita. */
function signalsEntry(input: ListoneSignalsInput): SignalsCacheEntry {
  const { pool, schede, links } = input;
  const cached = signalsCache.get(pool);
  if (
    cached !== undefined &&
    cached.schede === schede &&
    cached.links === links &&
    cached.poolRows === pool.length
  ) {
    signalsHits += 1;
    return cached;
  }
  signalsBuilds += 1;
  const entry: SignalsCacheEntry = {
    schede,
    links,
    poolRows: pool.length,
    rows: new WeakMap<ListonePlayer, ListoneRowSignals>(),
    views: null,
  };
  signalsCache.set(pool, entry);
  return entry;
}

/** Il lookup su una voce già risolta. La memoizzazione PER RIGA vive qui, in
 *  un posto solo: la porta pubblica e la passata della nota la condividono
 *  invece di tenerne due copie che possono divergere. */
function lookupOn(entry: SignalsCacheEntry): ListoneRowSignalsLookup {
  return (p) => {
    const cached = entry.rows.get(p);
    if (cached !== undefined) return cached;
    signalsRowBuilds += 1;
    const signals = resolveRowSignals(p, entry.schede, entry.links);
    entry.rows.set(p, signals);
    return signals;
  };
}

/**
 * IL LOOKUP CHE LA TABELLA USA, memoizzato ATTRAVERSO i render e non dentro
 * uno solo.
 *
 * Ogni riga viene risolta al più una volta per (pool, deposito, risposte di
 * Pico): un tasto nella ricerca, un cambio di pagina, un ordinamento su una
 * colonna di segnale non rifanno nessuna risoluzione già fatta.
 */
export function listoneRowSignalsLookup(input: ListoneSignalsInput): ListoneRowSignalsLookup {
  return lookupOn(signalsEntry(input));
}

/**
 * LE PAGELLE RISOLTE DA CONTARE nella nota sotto la tabella — e l'elenco vuoto
 * finché non c'è niente da contare.
 *
 * La passata sul pool intero esiste perché i due numeri di #33 («quante
 * divergono dal totale della fonte», «quante portano l'asse di un altro
 * ruolo») valgono solo se sono sul POOL e non sulla pagina a schermo.
 *
 * LA GUARDIA È DENTRO LA MEMO, non davanti. `expertSchedeHavePagella` scandisce
 * il deposito intero (~200 schede): chiamata a ogni tasto per rispondere
 * sempre «no» era essa stessa un giro inutile per tasto. Adesso è una funzione
 * del solo `schede`, che sta nella chiave, quindi gira una volta per deposito.
 */
export function listoneExpertPagellaViews(input: ListoneSignalsInput): readonly PagellaView[] {
  const entry = signalsEntry(input);
  if (entry.views !== null) return entry.views;
  signalsViewBuilds += 1;
  const lookup = lookupOn(entry);
  const views = expertSchedeHavePagella(entry.schede)
    ? input.pool.map((p) => lookup(p).pagella)
    : [];
  entry.views = views;
  return views;
}

// ── I GEMELLI NON MEMOIZZATI ─────────────────────────────────────────────────
//
// Le stesse due uscite, calcolate senza guardare né toccare la cache. Sono il
// termine di paragone del test di trasparenza — stessa idea di
// `buildTierBookUncached` e di `opportunityRadarReference.ts` nel motore:
// confrontare la versione memoizzata con sé stessa dopo un `reset` proverebbe
// che la cache è coerente con sé stessa, non che è TRASPARENTE. Non hanno
// altri chiamanti e non devono averne: l'app usa le due funzioni qui sopra.

export function listoneRowSignalsLookupUncached(
  input: ListoneSignalsInput,
): ListoneRowSignalsLookup {
  return (p) => resolveRowSignals(p, input.schede, input.links);
}

export function listoneExpertPagellaViewsUncached(
  input: ListoneSignalsInput,
): readonly PagellaView[] {
  if (!expertSchedeHavePagella(input.schede)) return [];
  return input.pool.map((p) => resolveRowSignals(p, input.schede, input.links).pagella);
}
