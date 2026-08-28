// LA RIGA DI LETTURA DELLE PREVISIONI — dentro INSIGHT GIOCATORE, sotto i
// fatti della scheda del chiamato.
//
// Costruttori HTML PURI, nessun DOM: la resa si prova con un `expect` sulla
// stringa, come per il resto dei riquadri di questa schermata (questo progetto
// non ha jsdom/happy-dom configurato). Il wrapper DOM sta in
// `renderPlayerInsightsBlock`, src/ui/views.ts.
//
// CHE COSA QUESTA RIGA È, E CHE COSA NON È. È una LETTURA: dice i tre numeri
// che il deposito ha servito per questo giocatore e dichiara, con la parola del
// dato, che sono advisory. NON è uno slot del riquadro del valore — `ValueSlotId`
// è chiuso a quattro per decisione registrata (src/valueBox.ts) — non entra in
// nessuna fascia, in nessun tier, in nessun massimo, e nessun numero di questa
// riga viene confrontato con un prezzo. Sta sotto la scheda perché è un fatto
// del giocatore, esattamente come lo sono i segnali della scheda.
//
// L'AUTORITÀ LA PORTA IL DATO. La parola («advisory») è `genForecast.authority`
// e non una costante di questo file: se un giorno arrivasse un payload che
// dichiara un'autorità diversa, il contratto lo rifiuterebbe a monte
// (src/ui/listone.ts) invece di lasciar mostrare a questa riga una parola che
// il dato non ha detto.
//
// SENZA PREVISIONE NON C'È RIGA. Non «n/d»: la riga non esiste proprio. Un
// giocatore non servibile non ha nessuna previsione da leggere e nessuna
// autorità da dichiarare, e una riga vuota costerebbe altezza a una schermata
// che è già la più lunga dell'app senza dire niente che la colonna del listone
// non dica meglio.

import {
  GEN_FORECAST_CAP_LABEL,
  GEN_FORECAST_CAP_MARKER,
  GEN_FORECAST_COLUMN_LABELS,
  GEN_FORECAST_TARGET_IDS,
  genForecastValueText,
  type GenForecastTargetId,
  type ListoneGenForecast,
  type ListoneGenForecastTarget,
} from "./listone.js";
import { escHtml } from "./theme.js";

export const GEN_FORECAST_INSIGHT_ID = "player-insight-gen-forecast";

/**
 * L'etichetta di autorità, parola per parola come il dato la porta.
 *
 * «previsioni di ricerca» è ciò che questa superficie sta mostrando; la seconda
 * parola è `authority`, la terza è la ricetta che le ha prodotte. Nessuna delle
 * due è scritta qui dentro.
 */
export function genForecastAuthorityLabel(forecast: ListoneGenForecast): string {
  return `previsioni di ricerca, ${forecast.authority} — ${forecast.recipeVersion}`;
}

/** Protocollo e run, per il `title` dell'etichetta: la riga resta corta e chi
 *  deve risalire al run che ha prodotto i numeri ce l'ha a un passaggio di
 *  mouse — e per esteso nella nota sotto il listone, che non richiede mouse. */
export function genForecastRunTitle(forecast: ListoneGenForecast): string {
  return `protocollo ${forecast.protocolVersion} · run ${forecast.runId}`;
}

/**
 * UNA LETTURA: etichetta, cifra, e i qualificatori che il dato dichiara.
 *
 * Gli arrotondamenti sono quelli della colonna (`genForecastValueText`), non
 * altri: la tabella e questo riquadro parlano dello stesso giocatore e non
 * possono mostrarne due cifre diverse.
 *
 * TRE QUALIFICATORI, tutti portati dal dato e tutti opzionali:
 *  - il tetto degli esperti sulle presenze, che qui si scrive A PAROLE perché
 *    c'è spazio (nella cella del listone è il marcatore «▾»);
 *  - lo stato del bersaglio, detto solo quando NON è «winner»: il caso normale
 *    non ha bisogno di una parola, l'eccezione sì;
 *  - l'intervallo, quando esiste. Oggi non esiste — i raggi conformal non sono
 *    ancora prodotti — ma il formato di trasporto lo prevede, e il giorno in cui
 *    arrivasse una previsione col suo raggio, mostrare il solo punto la farebbe
 *    sembrare più precisa di quanto il dato dica.
 */
export function genForecastReadingText(
  targetId: GenForecastTargetId,
  target: ListoneGenForecastTarget,
): string {
  const parts = [`${GEN_FORECAST_COLUMN_LABELS[targetId]} ${genForecastValueText(targetId, target.value)}`];
  if (target.interval !== null) {
    parts.push(
      `(intervallo ${genForecastValueText(targetId, target.interval.lo)}–` +
        `${genForecastValueText(targetId, target.interval.hi)})`,
    );
  }
  if (target.capApplied === true) parts.push(`${GEN_FORECAST_CAP_MARKER} ${GEN_FORECAST_CAP_LABEL}`);
  if (target.status !== "winner") parts.push(`(${target.status})`);
  return parts.join(" ");
}

/** Le tre letture, nell'ordine dei bersagli, separate dal punto in mezzo che
 *  questo prodotto usa già fra fatti dello stesso registro. */
export function genForecastReadingsText(forecast: ListoneGenForecast): string {
  return GEN_FORECAST_TARGET_IDS.map((id) =>
    genForecastReadingText(id, forecast.targets[id]),
  ).join(" · ");
}

/**
 * La riga intera, o stringa vuota quando non c'è niente da leggere.
 *
 * `hint-text` è la stessa classe delle altre righe di nota di questa schermata:
 * sta sulla rampa di contrasto che la guardia AA rimisura a ogni run
 * (e2e/text-contrast-aa.spec.ts) invece di introdurre un grigio suo.
 */
export function genForecastInsightHtml(forecast: ListoneGenForecast | null | undefined): string {
  if (forecast === null || forecast === undefined) return "";
  return (
    `<p class="hint-text player-insight__forecast" id="${GEN_FORECAST_INSIGHT_ID}">` +
    `<span class="player-insight__forecast-readings">${escHtml(genForecastReadingsText(forecast))}</span>` +
    `<span class="player-insight__forecast-authority" title="${escHtml(genForecastRunTitle(forecast))}">` +
    ` — ${escHtml(genForecastAuthorityLabel(forecast))}</span>` +
    `</p>`
  );
}
