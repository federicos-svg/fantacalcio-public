// FASCIA DEL CHIAMATO — costruttori puri del riquadro che porta a schermo le
// fasce d'asta di packages/engine/src/tiers.ts, motore costruito e provato che
// fino a qui non era mai arrivato sullo schermo.
//
// COSA MOSTRA, esattamente tre cose:
//  1. IN CHE FASCIA sta il giocatore attualmente chiamato — con la PAROLA
//     della fascia per intero («Prima fascia»), mai una sigla e mai un colore
//     da solo: il colore in questo riquadro non porta nessuna informazione che
//     non sia anche scritta;
//  2. CHE COSA È STATO DAVVERO PAGATO in quella fascia stasera — i singoli
//     prezzi del log d'asta, uno per uno, in ordine crescente. Fatti misurati,
//     non stime;
//  3. QUANDO IL DATO NON C'È, LO DICE. È la regola più importante del
//     riquadro: un listone senza indice di appetibilità non produce fasce, e
//     quel caso deve rendere una frase onesta — non un pannello vuoto, non una
//     fascia dedotta. L'idioma è quello già in uso nel progetto
//     (`OPPONENT_PRECEDENTS_NO_HISTORY`, src/ui/liveFacts.ts): «un riquadro
//     vuoto qui non significa X, significa non lo so».
//
// GLI OTTO SILENZI SONO OTTO FRASI DIVERSE, e nessuno di loro è un riquadro
// muto. Tre vengono da `TierPlacementKind` (`fondo`, `unranked`,
// `role-not-ordered` — più `no-ordering`, che il motore produce solo senza
// libro), quattro dal ponte che costruisce il libro (`no-pool`, `no-index`,
// `mixed-recipe`, `ordering-refused`, `no-table`), uno dall'assenza di un
// giocatore chiamato. Portano a decisioni diverse: «questo giocatore è oltre
// l'ultima fascia» e «non ho un ordine per il suo ruolo» si assomigliano solo
// a chi non deve comprare.
//
// NESSUN OUTPUT DIRETTIVO (docs/NO_GO.md §Prodotto, docs/DECISIONS.md §D9).
// Non c'è un prezzo atteso, una banda, un punteggio composito, un ranking di
// intensità né la parola «conviene»: il riquadro DESCRIVE. In particolare i
// prezzi escono come REGISTRO — l'elenco dei singoli prezzi pagati — e non
// come coppia di estremi «da 61 a 90», che a schermo si leggerebbe come un
// intervallo di riferimento su cui regolarsi. È lo stesso divieto di FORMA che
// packages/engine/src/tiers.ts §"Il registro, non una banda" impone al tipo:
// rispettarlo nel tipo e violarlo nella vista sarebbe rispettarlo per finta.
//
// GLI AVVERSARI, VOLUTAMENTE, NON SONO QUI. `TierFacts.opponents` porta per
// ogni squadra quanti giocatori di questa fascia ha già e cosa ha pagato: sono
// fatti misurati e disponibili, e questo riquadro NON li mostra. Non è una
// dimenticanza — è che ordinarli richiede scegliere un criterio, e su questa
// schermata l'unico criterio interessante sarebbe «quanto lo vuole», che il
// motore non produce e non deve produrre. Chi lo vuole, con i gesti già
// compiuti accanto, è la domanda del pannello AVVERSARI: I PRECEDENTI, qui di
// fianco. Il giorno in cui servisse, il dato è già calcolato.
//
// Costruttori di sole stringhe (stesso idioma di warBoard.ts / liveFacts.ts)
// così che tutta la logica di resa sia verificabile senza jsdom/happy-dom, che
// questo progetto non configura. Il montaggio nel DOM vive in views.ts
// (`renderTierBandBlock`), il calcolo in src/tierOrdering.ts.
//
// DETERMINISMO: nessun `Date`, nessun `Intl`/`toLocaleString`, nessuna
// iterazione su strutture non ordinate — le liste arrivano già ordinate dal
// motore e questo file ne conserva l'ordine.

import type { Role } from "../../packages/engine/src/types.js";
import type { TierFacts } from "../../packages/engine/src/tiers.js";
import type {
  TierBandReading,
  TierBandUnavailable,
  TierOrderingCoverage,
} from "../tierOrdering.js";
import { escHtml } from "./theme.js";
import { ROLE_LABELS } from "./labels.js";

/** Titolo del pannello: nomina ciò che il pannello contiene — la fascia del
 *  giocatore che è ora sul tavolo — e non una domanda che non risponde. */
export const TIER_BAND_TITLE = "FASCIA DEL CHIAMATO";

/**
 * La parola della fascia, per intero. Nove voci perché nove è il massimo di
 * `ROSTER_REQUIREMENTS` (D e C); il ripiego numerato esiste per un regolamento
 * futuro con più slot per ruolo, e resta una parola più un numero, mai una
 * sigla.
 */
const TIER_ORDINALS: readonly string[] = [
  "Prima",
  "Seconda",
  "Terza",
  "Quarta",
  "Quinta",
  "Sesta",
  "Settima",
  "Ottava",
  "Nona",
];

/** «Prima fascia», «Nona fascia», e per ogni numero fuori elenco «Fascia 12». */
export function tierWord(tier: number): string {
  const ordinal = TIER_ORDINALS[tier - 1];
  return ordinal === undefined ? `Fascia ${tier}` : `${ordinal} fascia`;
}

/** Ciò che il riquadro dice quando non sa: una sola forma, in tutti i casi in
 *  cui non sa, così che «non lo so» non si travesta mai da fascia. */
export const TIER_BAND_UNKNOWN_WORD = "Non lo so";

/** La parola grande del riquadro: la fascia, oppure «non lo so». Mai un numero
 *  nudo, mai una sigla, mai il solo colore. */
export function tierBandWord(reading: TierBandReading): string {
  if (reading.kind !== "facts") return TIER_BAND_UNKNOWN_WORD;
  const { placement } = reading.facts;
  if (placement.kind === "tier" && placement.tier !== null) return tierWord(placement.tier);
  if (placement.kind === "fondo") return "Oltre l'ultima fascia";
  return TIER_BAND_UNKNOWN_WORD;
}

// ── Le frasi oneste, una per ciascun modo di non sapere ──────────────────────

/** Nessun giocatore chiamato: senza soggetto non c'è fascia da collocare. */
export const TIER_BAND_NO_CALL =
  "Nessun giocatore chiamato: la fascia è una proprietà del giocatore che è sul tavolo, e senza di lui non c'è niente da collocare.";

/** Nessuna riga caricata: non c'è nulla da ordinare, quindi nessuna fascia. */
export const TIER_BAND_NO_POOL =
  "Nessun listone caricato: le fasce si costruiscono mettendo in fila i giocatori di un ruolo, e senza righe non esiste nessuna fila. Un riquadro vuoto qui non significa «questo giocatore non ha fascia», significa «non lo so».";

/**
 * LA FRASE CHE REGGE TUTTO IL RIQUADRO. Un listone senza indice di
 * appetibilità non produce fasce: questo caso è la norma, non il caso limite —
 * l'indice arriva dal deposito privato e il listone statico non lo porta.
 * Dirlo per esteso è ciò che impedisce a un riquadro spento di leggersi come
 * «questo giocatore non vale una fascia».
 */
export const TIER_BAND_NO_INDEX =
  "Il listone caricato non porta l'indice di appetibilità: le fasce si costruiscono su quell'ordine e senza di esso non esistono. Un riquadro vuoto qui non significa «giocatore senza fascia», significa «non lo so».";

/** Nessuna squadra al tavolo: manca il censimento che fa la larghezza. */
export const TIER_BAND_NO_TABLE =
  "Nessuna squadra al tavolo: quanto è larga una fascia è il numero di squadre che giocano, e senza quel censimento non c'è nessuna fascia da calcolare.";

/**
 * La frase del ruolo non ordinato e quella del giocatore senza verdetto sono
 * DUE, e restano due: la prima dice che manca l'ordine di un intero ruolo, la
 * seconda che l'ordine c'è e questo giocatore ne è fuori. Chi guarda ne trae
 * cose diverse.
 */
function placementSentence(facts: TierFacts): string {
  const { placement } = facts;
  const role = ROLE_LABELS[facts.role].toLowerCase();
  switch (placement.kind) {
    case "tier":
      // `tier` è non-null per costruzione in questo ramo (tiers.ts
      // `placementOf`); il ripiego esiste perché il tipo lo ammette e un
      // «non lo so» è comunque preferibile a una fascia zero.
      if (placement.tier === null) return TIER_BAND_NO_INDEX;
      return `${tierWord(placement.tier)} di ${facts.tierCount}, larga ${facts.tierSize} come le squadre al tavolo. Posizione ${placement.position} nell'ordine di appetibilità dei ${role}.`;
    case "fondo":
      return `Oltre l'ultima fascia del ruolo: posizione ${placement.position} in un ruolo che di fasce ne ha ${facts.tierCount} da ${facts.tierSize}. Non è una fascia peggiore, è fuori dalle fasce — col listone intero è il caso della maggioranza dei giocatori.`;
    case "unranked":
      return `L'indice di appetibilità non ha un verdetto su questo giocatore: i ${role} sono in fila, lui no. Resta fuori dall'ordine — che non è «ultimo», ed è per questo che qui non compare nessuna fascia.`;
    case "role-not-ordered":
      return `L'ordine caricato non copre questo ruolo: per i ${role} non ho una fila, quindi non ho fasce. Non lo so.`;
    case "no-ordering":
      return TIER_BAND_NO_INDEX;
  }
}

/** Il motivo, in parole, per cui il libro delle fasce non esiste. */
function unavailableSentence(reason: TierBandUnavailable, detail: string): string {
  switch (reason) {
    case "no-pool":
      return TIER_BAND_NO_POOL;
    case "no-index":
      return TIER_BAND_NO_INDEX;
    case "no-table":
      return TIER_BAND_NO_TABLE;
    case "mixed-recipe":
      return `Le righe caricate portano più di una ricetta dell'indice (${detail}): non si può dire quale abbia prodotto l'ordine, e una provenienza indecidibile non è una provenienza. Nessuna fascia mostrata.`;
    case "ordering-refused":
      return `L'ordine di appetibilità del listone caricato non è coerente e il motore lo ha rifiutato (${detail}). Meglio nessuna fascia che una fascia costruita su un ordine che non torna.`;
  }
}

/**
 * La riga di sintesi del riquadro: sempre presente, in tutti gli esiti, ed è
 * lei a portare la differenza fra i modi di non sapere. Un elenco vuoto senza
 * questa riga si leggerebbe come una risposta.
 */
export function tierBandHeadline(reading: TierBandReading): string {
  switch (reading.kind) {
    case "no-call":
      return TIER_BAND_NO_CALL;
    case "unavailable":
      return unavailableSentence(reading.reason, reading.detail);
    case "facts":
      return placementSentence(reading.facts);
  }
}

// ── La contabilità della fascia: quanti ne restano, cosa è stato pagato ──────

/**
 * Quanti giocatori di questa fascia sono ancora liberi e quanti sono già
 * andati. `originalSize` è MISURATO sulla fascia (l'ultima fascia di un ruolo
 * corto ne ha meno di `tierSize`), quindi la frase non mente sui ruoli corti.
 *
 * I PRESI comprendono le riconferme pre-asta — chi si è riconfermato un
 * giocatore di questa fascia ce l'ha — mentre i PREZZI qui sotto no. È
 * un'asimmetria voluta del motore, non un'incoerenza, e la nota la dichiara.
 */
export function tierOccupancyHtml(facts: TierFacts): string {
  const occ = facts.occupancy;
  if (occ === null) return "";
  const free = `${occ.freeCount} liber${occ.freeCount === 1 ? "o" : "i"}`;
  const taken = `${occ.takenCount} già pres${occ.takenCount === 1 ? "o" : "i"}`;
  return `
    <span class="tier-band__occupancy" id="tier-band-occupancy"
          aria-label="Di questa fascia: ${escHtml(free)} su ${occ.originalSize}, ${escHtml(taken)}">
      <span class="tier-band__occupancy-metric">
        <span>ne restano</span>
        <strong id="tier-band-free">${occ.freeCount}</strong>
        <em>di ${occ.originalSize}</em>
      </span>
      <span class="tier-band__occupancy-metric">
        <span>già presi</span>
        <strong id="tier-band-taken">${occ.takenCount}</strong>
      </span>
    </span>`;
}

/**
 * IL REGISTRO DI SERATA: i prezzi davvero pagati, uno per uno, in ordine
 * crescente. Tre stati, tutti e tre dichiarati:
 *  - `null` (il chiamato non è in fascia): non esiste una fascia di cui
 *    leggere il registro, e la riga non compare — la sintesi ha già detto
 *    perché;
 *  - `[]` (in fascia, nessuno ha ancora pagato): lo si DICE. Un `0` al posto
 *    di questa frase si leggerebbe come «qualcuno ha pagato zero»;
 *  - una lista: ogni prezzo, singolarmente. Quanti sono lo dice il conteggio
 *    accanto; nessun minimo e nessun massimo affiancati a formare una banda.
 */
export function tierPricesHtml(facts: TierFacts): string {
  const prices = facts.pricesPaidInTier;
  if (prices === null) return "";
  if (prices.length === 0) {
    return `
      <span class="tier-band__prices" id="tier-band-prices">
        <span class="tier-band__prices-head">pagati in questa fascia stasera</span>
        <span class="tier-band__prices-empty" id="tier-band-prices-empty">Nessuno: in questa fascia stasera non è stato ancora comprato nessuno.</span>
      </span>`;
  }
  const chips = prices
    .map((price) => `<span class="tier-band__price">${price}<em>cr</em></span>`)
    .join("");
  const count = `${prices.length} acquist${prices.length === 1 ? "o" : "i"}`;
  return `
    <span class="tier-band__prices" id="tier-band-prices">
      <span class="tier-band__prices-head">pagati in questa fascia stasera<b id="tier-band-prices-count">${escHtml(count)}</b></span>
      <span class="tier-band__price-list" id="tier-band-price-list"
            aria-label="Prezzi pagati in questa fascia stasera, crescenti: ${escHtml(prices.join(", "))} crediti">${chips}</span>
    </span>`;
}

// ── Provenienza: la fascia non si mostra senza dire da dove viene ────────────

/**
 * Condizione vincolante 1 del record 2026-08-16: la fascia non si mostra senza
 * dire da dove viene. `null` ⇒ `n/d`, mai un valore di ripiego — e in questo
 * riquadro `null` non arriva mai da solo, perché senza libro non c'è nemmeno
 * una fascia da qualificare.
 *
 * DAL 2026-08-29 QUESTA RIGA NON È PIÙ A SCHERMO, e la condizione vincolante
 * NON è stata cancellata: si è spostata. Pico ha chiesto di nascondere
 * `#tier-band-provenance` e `#tier-band-note`; messo davanti al conflitto con
 * il proprio record del 16 agosto ha deciso — «Nascondile, ma restano a voce».
 * Perciò `tierBandSpoken()` qui sotto porta la provenienza e la nota dentro
 * l'`aria-label` del riquadro, e il patto regge dove prima reggeva a schermo:
 * nessuna fascia arriva a qualcuno senza dire da dove viene. Il testo non è
 * stato toccato di una virgola, e il giorno in cui torna a schermo torna
 * togliendo una regola di stile (`src/styles/asta.css`).
 *
 * La numerosità dell'ordine sta nella stessa riga: un ordine con 4 verdetti su
 * 532 righe e uno con 532 su 532 producono fasce molto diverse, e la seconda
 * cifra è l'unica che lo dice.
 */
export function tierProvenanceText(
  facts: TierFacts | null,
  coverage: TierOrderingCoverage | null,
): string {
  if (facts === null || facts.provenance === null) return "Ordine di appetibilità: n/d.";
  const p = facts.provenance;
  const measured =
    coverage === null
      ? ""
      : ` Verdetto su ${coverage.withVerdict} righe di ${coverage.poolRows} caricate.`;
  return `Ordine: ${p.source} · ricetta ${p.recipe} · pareggi: ${p.tieBreak}.${measured}`;
}

/**
 * La nota sotto il riquadro. Ogni frase porta un vincolo che senza di lei si
 * perderebbe — da dove vengono le fasce, che i prezzi sono pagati e non
 * attesi, perché i presi e i prezzi contano cose diverse, e che qui non c'è
 * nessun consiglio — e non c'è una quinta frase: la schermata è la più lunga
 * dell'app e una nota lunga costa altezza a tutto ciò che le sta sotto.
 */
export const TIER_BAND_NOTE =
  "Le fasce vengono dall'ordine di appetibilità del listone caricato, non da questo schermo: quante fasce ha un ruolo lo dice il regolamento (i giocatori che servono in rosa), quanto è larga una fascia lo dice il numero di squadre al tavolo. I prezzi sono quelli DAVVERO pagati stasera in questa fascia, letti dal log dell'asta uno per uno: nessun prezzo atteso, nessuna banda, nessuna previsione. I «già presi» comprendono le riconferme pre-asta, i prezzi no — una riconferma porta la cifra della stagione scorsa e non è il mercato di stasera. Nessun consiglio: i fatti sono qui, il giudizio è tuo.";

/**
 * Forma parlata dell'intestazione, per l'aria-label del blocco: la parola
 * grande da sola («Prima fascia») non dice di chi né di che cosa.
 *
 * PORTA ANCHE LA PROVENIENZA E LA NOTA, dal 2026-08-29. Le due frasi sono
 * uscite da schermo su richiesta di Pico e `display: none` le toglie anche
 * dall'albero di accessibilità: senza questa riga chi naviga a voce sentirebbe
 * un verdetto di fascia e nient'altro — né da quale ordine viene, né che qui
 * non c'è nessun consiglio. È lo stesso trattamento già riservato al caveat
 * della pagella (`pagellaSpoken`), ed è la forma in cui la condizione
 * vincolante 1 del record 2026-08-16 continua a essere rispettata.
 *
 * I due argomenti di `tierProvenanceText` si ricavano dalla lettura come li
 * ricava il montaggio (src/ui/views.ts): la funzione non chiede al chiamante
 * di ripetere quel che la lettura già dice.
 */
export function tierBandSpoken(reading: TierBandReading, role: Role | ""): string {
  const roleName = role === "" ? "" : ` (${ROLE_LABELS[role].toLowerCase()})`;
  const facts = reading.kind === "facts" ? reading.facts : null;
  const coverage = reading.kind === "no-call" ? null : reading.coverage;
  return `Fascia del giocatore chiamato${roleName}: ${tierBandWord(reading)}. ${tierBandHeadline(reading)} ${tierProvenanceText(
    facts,
    coverage,
  )} ${TIER_BAND_NOTE}`;
}
