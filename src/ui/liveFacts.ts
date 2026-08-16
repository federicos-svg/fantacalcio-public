// FATTI MISURATI DEL MOMENTO LIVE — pure HTML builders for the two blocks the
// `asta` moment used to mount as `devStaticPanel` placeholders:
//
//  - MOMENTO DELL'ASTA: how tight the table is right now — remaining supply
//    per role (`roleScarcity`, already wired in the `chiamata` moment) plus
//    the census of credits and slots still on the table (`residualPressure`);
//  - AVVERSARI: CHI PUÒ ARRIVARCI: who, by HARD CONSTRAINT ONLY, can still
//    reach the figure being typed (`competitorSet`).
//
// PROVENANCE (docs/AUCTION_2026_EXECUTION_PLAN.md §3, "regola dei tre
// ingredienti" of docs/DECISIONS.md §D9). Every number below is either a
// measured fact of the event log (residual credits, free slots, prices paid)
// or declared arithmetic over those facts (`maxSafe`, credits per slot). The
// UI matrix rows that authorise them are:
//  - "Scarsità | Visibile se derivata solo dal log dell'asta | Nessuno";
//  - "Contabilità: budget, slot, hard_reserve, max_safe | Visibile | Nessuno";
//  - "Event log, undo/replay, import/export, avversari Tier-1 | Visibile".
//
// WHAT IS DELIBERATELY NOT HERE, and must never be added:
//  - no `value`, `fair_to_me`, `target_band`, `stretch_cap`, no projection, no
//    ranking, no "how high you should go" — those are model-derived outputs
//    behind a gate that is closed (docs/NO_GO.md §Prodotto);
//  - no behavioural or psychological read of an opponent: `competitorSet`'s
//    basis is `hard-constraints`, and this module states that in words rather
//    than letting a heading imply intent it cannot measure;
//  - nothing derived from the listone quotation beyond the row COUNT the
//    scarcity panel already shows (§3, "Listone e quotazioni").
//
// Pure string builders (same idiom as warBoard.ts / roleBudgetPlan.ts) so the
// whole rendering logic is unit-testable without jsdom/happy-dom, neither of
// which is configured in this project. The DOM wrappers live in views.ts
// (`renderMomentInsightsBlock` / `renderOpponentInterestBlock`).
//
// DETERMINISM: no `Date`, no `Intl`/`toLocaleString` (locale-dependent output
// would make the same state render two different strings on two machines), no
// network, no iteration over unordered structures — the engine hands over
// totally ordered lists and this module preserves that order.

import { ROLES, type Role } from "../../packages/engine/src/types.js";
import type { RoleScarcity } from "../../packages/engine/src/auction.js";
import type { ResidualPressure } from "../../packages/engine/src/anchors.js";
import type {
  OpponentPrecedents,
  PrecedentFact,
  PrecedentsReading,
  SeasonShare,
  SupportedClubNote,
} from "../../packages/opponent-profiles/src/types.js";
import { escHtml, roleChipHtml } from "./theme.js";
import { ROLE_LABELS } from "./labels.js";

// ── Number formatting (locale-free, deterministic) ───────────────────────────

/**
 * One decimal, Italian decimal comma, no thousands separator and no `Intl`.
 * `-0,0` is normalised to `0,0`: a rounded-away negative is not a negative.
 */
export function formatDecimal1(n: number): string {
  if (!Number.isFinite(n)) return "n/d";
  const rounded = Math.round(n * 10) / 10;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  return safe.toFixed(1).replace(".", ",");
}

/**
 * A ratio as a signed whole percentage. The sign is explicit (`+8%` / `−12%`)
 * because the interesting part of this number is its direction; an exact zero
 * after rounding prints `0%` with no sign, never `-0%`.
 *
 * The minus is U+2212 MINUS SIGN, not a hyphen: at 11px a hyphen next to a
 * digit reads as a dash in the copy.
 */
export function formatSignedPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "n/d";
  const pct = Math.round(ratio * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

// ── MOMENTO DELL'ASTA — scarsità per ruolo, dal log dell'asta ────────────────

/**
 * The same two numbers the `chiamata` moment's SCARSITÀ PER RUOLO panel shows
 * (views.ts `renderRoleScarcityPanel`), rebuilt compact for the live screen
 * and with the called role marked.
 *
 * They keep their separate labels because they have different provenance:
 * "slot liberi" is summed from the event log across all eight teams, while
 * "in listone" is a row count of the display-only listone — shown as `n/d`,
 * never as a misleading 0, when no listone is loaded.
 *
 * `calledRole` is `""` while the moment has no role (defensive: the live
 * moment is only reachable through a correlated listone row, which always
 * carries one). Nothing is hidden in that case — no cell is highlighted.
 */
export function momentScarcityHtml(
  scarcity: Readonly<Record<Role, RoleScarcity>>,
  poolLoaded: boolean,
  calledRole: Role | "",
): string {
  return ROLES.map((role) => {
    const s = scarcity[role];
    const isCalled = role === calledRole;
    return `
      <div class="moment-scarcity__cell${isCalled ? " moment-scarcity__cell--called" : ""}"
           id="moment-scarcity-${role}">
        <span class="moment-scarcity__head">${roleChipHtml(role)}<em>${escHtml(ROLE_LABELS[role])}</em>${
          isCalled ? `<b class="moment-scarcity__called">in asta</b>` : ""
        }</span>
        <span class="moment-scarcity__metric">
          <span>slot liberi</span>
          <strong id="moment-scarcity-slots-${role}">${s.leagueSlotsRemaining}</strong>
        </span>
        <span class="moment-scarcity__metric moment-scarcity__metric--secondary">
          <span>in listone</span>
          <strong id="moment-scarcity-pool-${role}">${poolLoaded ? s.poolRemaining : "n/d"}</strong>
        </span>
      </div>`;
  }).join("");
}

// ── MOMENTO DELL'ASTA — mercato: crediti e slot ancora sul tavolo ────────────

/**
 * `residualPressure()` rendered as what it is: a CENSUS, not a sample and not
 * a multiplier. Three figures — credits still on the table, slots still to
 * fill, and their ratio — plus the declared comparison against the league's
 * starting endowment per slot (500/28 ≈ 17,9), which is a rule constant and
 * not a weight chosen by the system.
 *
 * When no slot is left the ratio does not exist: `n/d` with the reason in
 * words, never a 0 dressed up as a measure.
 */
export function marketPressureHtml(pressure: ResidualPressure): string {
  const exhausted = pressure.reason === "no-remaining-slots";
  const perSlot = exhausted ? "n/d" : `${formatDecimal1(pressure.creditsPerSlot ?? 0)} cr`;
  const delta = exhausted || pressure.pressure === null ? "n/d" : formatSignedPercent(pressure.pressure);
  const deltaClass =
    exhausted || pressure.pressure === null
      ? "moment-market__delta--none"
      : Math.round(pressure.pressure * 100) === 0
        ? "moment-market__delta--flat"
        : pressure.pressure > 0
          ? "moment-market__delta--up"
          : "moment-market__delta--down";
  return `
    <div class="moment-market" id="moment-market">
      <span class="moment-market__head">MERCATO — CREDITI E SLOT ANCORA SUL TAVOLO</span>
      <span class="moment-market__row">
        <span class="moment-market__metric">
          <span>crediti residui</span>
          <strong id="moment-market-credits">${pressure.creditsRemaining}</strong>
        </span>
        <span class="moment-market__metric">
          <span>slot da riempire</span>
          <strong id="moment-market-slots">${pressure.slotsRemaining}</strong>
        </span>
        <span class="moment-market__metric">
          <span>crediti per slot</span>
          <strong id="moment-market-per-slot">${perSlot}</strong>
        </span>
        <span class="moment-market__metric">
          <span>vs partenza (${formatDecimal1(pressure.baselineCreditsPerSlot)})</span>
          <strong id="moment-market-delta" class="${deltaClass}">${delta}</strong>
        </span>
      </span>
      <span class="moment-market__basis" id="moment-market-basis">${
        exhausted
          ? `Nessuno slot residuo al tavolo: il rapporto crediti/slot non ha denominatore e resta n/d. Censimento su ${pressure.teamsCounted} squadre.`
          : `Censimento su ${pressure.teamsCounted} squadre: nessun campione, nessun cold start.`
      }</span>
    </div>`;
}

export const MOMENT_FACTS_NOTE =
  "Slot liberi: slot di quel ruolo ancora vuoti su tutto il tavolo, somma delle 8 squadre, derivata dal log dell'asta. In listone: righe di quel ruolo non ancora assegnate nel listone caricato. Crediti per slot: crediti residui di tutto il tavolo diviso gli slot che restano da riempire, confrontati con la dotazione iniziale della lega (500/28). Sola contabilità: nessun dato di modello, nessuna stima, nessun suggerimento su quanto spingere.";

// ── AVVERSARI — i precedenti d'asta sul giocatore chiamato ───────────────────
//
// QUESTO PANNELLO HA CAMBIATO MESTIERE (issue #331 punto 1, decisione di Pico
// registrata). Mostrava chi, per VINCOLO DURO (uno slot libero del ruolo e un
// max bid sicuro che arriva alla soglia), poteva raggiungere la cifra: era
// `competitorSet()`, e su un giocatore senza prezzo la soglia degradava al
// rilancio minimo, dove la risposta è sempre «tutti» — «7 rivali su 7 possono
// arrivare al rilancio minimo (1 cr)» è una frase che non informa nessuno.
//
// La raggiungibilità per vincolo duro è quindi USCITA DA QUI, e non dall'app:
// il max bid sicuro e il budget residuo di TUTTE le otto squadre restano sulla
// stessa schermata, nella striscia WAR BOARD (MINI) subito sopra; gli slot
// liberi per ruolo, squadra per squadra, restano nella war board COMPLETA del
// momento CHIAMATA e nel pannello AVVERSARI TIER-1 della schermata Rose; gli
// slot liberi del ruolo su tutto il tavolo restano nel blocco MOMENTO
// DELL'ASTA, qui accanto. Nessuna di quelle cifre ha smesso di essere
// visibile: ha smesso di essere ricontata in questo riquadro.
//
// AL SUO POSTO: PRECEDENTI, cioè gesti già compiuti e contabili
// (packages/opponent-profiles/src/precedents.ts). Per ogni avversario, che
// cosa ha fatto davvero che riguardi il giocatore ora sul tavolo, con il
// numero accanto e con la numerosità — su quante stagioni — sempre in vista.
//
// IL DIVIETO CHE GOVERNA QUESTA SEZIONE, e vale per ogni stringa qui sotto:
// nessuna inferenza psicologica, nessuna stima di quanto un avversario voglia
// un giocatore, nessuno score, indice, punteggio, classifica di intensità o
// previsione di comportamento. «Sui suoi tre più cari ha speso il 60% per
// quattro stagioni, l'ultima il 32%» si può controllare riga per riga; «è un
// big spender» no, ed è per questo che non compare.
//
// IL TITOLO DICE «I PRECEDENTI» E NON «CHI LO VUOLE», ed è una scelta, non una
// dimenticanza. Il MESTIERE del pannello è quello che Pico ha deciso —
// rispondere a «chi lo vuole» invece che a «chi può arrivarci» — ma il titolo
// visibile deve nominare ciò che il pannello CONTIENE, che sono gesti passati
// misurati, non un'intenzione presente. Questa regola in questo file ha già un
// precedente: il titolo ereditato dal segnaposto diceva «INTERESSE SUL
// GIOCATORE» ed è stato corretto proprio perché affermava un'intenzione che
// nessun calcolo dietro di lui produceva; e la nota sotto il pannello non deve
// essere la SMENTITA della sua stessa intestazione. Rimettere «CHI LO VUOLE»
// sopra un elenco di nomi rifarebbe quell'errore al contrario: ora il pannello
// misura qualcosa, ma quel qualcosa resta il passato, e chi lo vuole lo decide
// Pico leggendolo. Il nome della domanda vive dove deve: nella riga di sintesi
// e nella nota, che dicono a che cosa questi precedenti servono.
//
// Larghezza: «AVVERSARI: I PRECEDENTI» è più corto di «AVVERSARI: CHI PUÒ
// ARRIVARCI», che a 390px stava su una riga sola con 2px di margine misurati.
// Non può traboccare dove quello non traboccava.

/** Percentuale intera, senza segno, senza `Intl`. La quota non ha direzione. */
export function formatPercent(share: number): string {
  if (!Number.isFinite(share)) return "n/d";
  return `${Math.round(share * 100)}%`;
}

/**
 * Forma breve di una stagione: `2021/22` -> `21/22`. Serve solo dentro la
 * serie per stagione, dove le cifre stanno in fila e la larghezza è contesa;
 * la forma piena resta nel `title` e nell'aria-label, dove non lo è.
 */
export function shortSeason(season: string): string {
  return season.length === 7 ? season.slice(2) : season;
}

/** Estremi dello storico, in parole: «5 stagioni (2021/22 → 2025/26)». */
export function seasonsSpan(seasons: readonly string[]): string {
  if (seasons.length === 0) return "nessuna stagione";
  if (seasons.length === 1) return `1 stagione (${seasons[0]})`;
  return `${seasons.length} stagioni (${seasons[0]} → ${seasons[seasons.length - 1]})`;
}

/**
 * Il MOTIVO di un fatto: che cosa quell'avversario ha fatto. Sempre un verbo
 * al passato e sempre riferito a un gesto, mai un aggettivo sulla persona.
 */
export function precedentMotive(fact: PrecedentFact): string {
  switch (fact.id) {
    case "ricomprato":
      return "l'ha ricomprato all'asta";
    case "club":
      return `ha speso su ${fact.club}`;
    case "piu-cari":
      return `ha speso sui propri ${fact.topPurchases} più cari`;
  }
}

/**
 * La PROVA di un fatto: i numeri che lo sostengono e la numerosità su cui
 * poggiano. La numerosità non è una postilla — un tratto visto in quattro
 * stagioni e uno visto solo nell'ultima non sono la stessa affermazione — e
 * per questo sta nella stessa riga del numero, non in una nota.
 */
export function precedentEvidence(fact: PrecedentFact): string {
  const measured = `misurato su ${fact.seasonsMeasured} ${fact.seasonsMeasured === 1 ? "stagione" : "stagioni"}`;
  switch (fact.id) {
    case "ricomprato": {
      const times = `${fact.auctionPurchases} ${fact.auctionPurchases === 1 ? "volta" : "volte"}`;
      const prices = fact.prices.map((p) => `${p.price} cr nel ${p.season}`).join(", ");
      // I rinnovi sono la PROVENIENZA del conteggio, non un secondo segnale:
      // spiegano perché il numero è più basso delle stagioni in cui l'ha
      // avuto, e non contano come precedenti.
      const renewals =
        fact.renewalsExcluded === 0
          ? ""
          : ` · ${fact.renewalsExcluded} ${fact.renewalsExcluded === 1 ? "rinnovo non contato" : "rinnovi non contati"}`;
      return `${times} — ${prices} · ${measured}${renewals}`;
    }
    case "club":
    case "piu-cari":
      // «N su M dal X% in su» porta GIÀ la numerosità nel proprio
      // denominatore: `M` è `seasonsMeasured`. Ripetere «misurato su M
      // stagioni» qui sarebbe la stessa cifra due volte in una riga sola, e
      // costerebbe una riga di altezza su una schermata che ne ha poche.
      return `${formatPercent(fact.latest.share)} nel ${fact.latest.season} · ${fact.seasonsAtOrAbove} ${
        fact.seasonsAtOrAbove === 1 ? "stagione" : "stagioni"
      } su ${fact.seasonsMeasured} ${fact.seasonsMeasured === 1 ? "misurata" : "misurate"} dal ${formatPercent(fact.threshold)} in su`;
  }
}

/**
 * La serie stagione per stagione, senza media e senza appiattimento: è qui che
 * si vede la differenza fra «alto per quattro stagioni e crollato nell'ultima»
 * e «alto solo nell'ultima», che una cifra sola renderebbe identiche.
 */
function precedentSeriesHtml(perSeason: readonly SeasonShare[]): string {
  return `<span class="opponent-precedents__series">${perSeason
    .map(
      (s) =>
        `<span class="opponent-precedents__season" title="${escHtml(s.season)}: ${escHtml(
          formatPercent(s.share),
        )} (${s.amount} cr su ${s.total})"><em>${escHtml(shortSeason(s.season))}</em>${escHtml(
          formatPercent(s.share),
        )}</span>`,
    )
    .join("")}</span>`;
}

/** Forma parlata della serie, per l'aria-label della riga. */
function seriesSpoken(perSeason: readonly SeasonShare[]): string {
  return perSeason.map((s) => `${s.season} ${formatPercent(s.share)}`).join(", ");
}

function precedentFactHtml(fantaTeamId: string, fact: PrecedentFact): string {
  const series = fact.id === "ricomprato" ? "" : precedentSeriesHtml(fact.perSeason);
  // Motivo e prova sullo STESSO flusso di testo, non su due righe fisse: dove
  // c'è larghezza stanno su una riga sola e il fatto si legge come una frase
  // («l'ha ricomprato all'asta — 2 volte, 30 cr nel 2023/24…»); dove non ce
  // n'è vanno a capo da soli. Due righe imposte costavano ~14px per fatto su
  // una schermata che è già la più lunga dell'app, senza rendere nulla più
  // chiaro.
  return `
    <li class="opponent-precedents__fact opponent-precedents__fact--${fact.id}"
        id="opponent-precedents-${escHtml(fantaTeamId)}-${fact.id}">
      <span class="opponent-precedents__motive">${escHtml(precedentMotive(fact))}</span><span
        class="opponent-precedents__sep" aria-hidden="true"> — </span
      ><span class="opponent-precedents__evidence">${escHtml(precedentEvidence(fact))}</span>
      ${series}
    </li>`;
}

/**
 * Il tifo dichiarato, accostato alla spesa MISURATA su quel club.
 *
 * Non compare mai da solo, e non è il titolo di niente: sta sotto i fatti che
 * hanno fatto nascere la riga, in una riga subordinata, con accanto la cifra
 * che può smentirlo. Un avversario che tifa il club del giocatore chiamato ma
 * non ci ha mai speso non arriva nemmeno qui — non ha una riga
 * (precedents.ts) — e la frase «lo vuole perché è della sua squadra» non ha
 * modo di formarsi.
 */
function supportedClubHtml(note: SupportedClubNote, seriesAlreadyShown: boolean): string {
  const measured =
    note.latest === null
      ? "nessuna stagione misurata su quel club"
      : `spesa misurata su quel club: ${formatPercent(note.latest.share)} nel ${note.latest.season}, su ${note.seasonsMeasured} ${
          note.seasonsMeasured === 1 ? "stagione" : "stagioni"
        }`;
  // La serie non si stampa due volte. Quando la riga porta già il fatto
  // `club` — stesso club, stessa misura, stesse stagioni — la serie è due
  // righe sopra: ristamparla qui non aggiungerebbe un dato, aggiungerebbe
  // solo altezza a una schermata che è già la più lunga dell'app.
  const series =
    note.latest === null || seriesAlreadyShown ? "" : precedentSeriesHtml(note.perSeason);
  return `
    <span class="opponent-precedents__support">
      <em>tifo dichiarato</em>${escHtml(note.club)} · ${escHtml(measured)}
      ${series}
    </span>`;
}

function precedentRowHtml(
  entry: OpponentPrecedents,
  labels: Readonly<Record<string, string>>,
): string {
  const label = labels[entry.fantaTeamId] ?? entry.fantaTeamId;
  const spokenFacts = entry.facts
    .map((fact) => {
      const base = `${precedentMotive(fact)}: ${precedentEvidence(fact)}`;
      return fact.id === "ricomprato" ? base : `${base}. Per stagione: ${seriesSpoken(fact.perSeason)}`;
    })
    .join(". ");
  const spokenSupport =
    entry.supportedClub === null
      ? ""
      : `. Tifo dichiarato in intervista: ${entry.supportedClub.club}${
          entry.supportedClub.latest === null
            ? ""
            : `, spesa misurata su quel club per stagione: ${seriesSpoken(entry.supportedClub.perSeason)}`
        }`;
  return `
    <li class="opponent-precedents__row"
        id="opponent-precedents-${escHtml(entry.fantaTeamId)}"
        aria-label="${escHtml(`${label}. ${spokenFacts}${spokenSupport}`)}">
      <span class="opponent-precedents__name" title="${escHtml(label)}">${escHtml(label)}</span>
      <ul class="opponent-precedents__facts">
        ${entry.facts.map((fact) => precedentFactHtml(entry.fantaTeamId, fact)).join("")}
      </ul>
      ${
        entry.supportedClub === null
          ? ""
          : supportedClubHtml(
              entry.supportedClub,
              entry.facts.some((f) => f.id === "club"),
            )
      }
    </li>`;
}

/**
 * La riga di sintesi. Dice quanti avversari hanno un precedente, su quanti
 * sono stati esaminati, e su quale storico.
 *
 * I TRE SILENZI SONO TRE FRASI DIVERSE, e nessuno di loro è un elenco vuoto:
 * «nessun giocatore chiamato», «nessuno storico caricato» e «storico caricato,
 * nessun precedente su questo giocatore» portano a decisioni diverse, e
 * scriverli allo stesso modo — o non scriverli affatto — farebbe leggere
 * «non lo so» come «nessuno lo vuole». Il ritorno silenzioso alla vecchia
 * domanda (chi può arrivare alla cifra) non è fra le opzioni: quella domanda
 * ha lasciato questo pannello per decisione, non per guasto.
 */
export function opponentPrecedentsHeadline(reading: PrecedentsReading): string {
  const seats = `${reading.seatsConsidered} ${reading.seatsConsidered === 1 ? "avversario" : "avversari"}`;
  const unassigned =
    reading.seatsWithoutPerson === 0
      ? ""
      : ` ${reading.seatsWithoutPerson} ${
          reading.seatsWithoutPerson === 1 ? "posto non ha" : "posti non hanno"
        } una persona assegnata: su quelli non esiste storico.`;
  switch (reading.emptyReason) {
    case "no-called-player":
      return OPPONENT_PRECEDENTS_NO_CALL;
    case "no-history":
      return `${OPPONENT_PRECEDENTS_NO_HISTORY}${unassigned}`;
    case "no-facts":
      return `Nessun precedente d'asta su questo giocatore per nessuno dei ${seats} esaminati. Non è «nessuno lo vuole»: è «lo storico non dice niente su di lui». Storico: ${seasonsSpan(reading.seasons)}.${unassigned}`;
    case null:
      return `${reading.opponents.length} ${
        reading.opponents.length === 1 ? "avversario ha" : "avversari hanno"
      } un precedente d'asta su questo giocatore, su ${seats} esaminati. Storico: ${seasonsSpan(reading.seasons)}.${unassigned}`;
  }
}

/**
 * L'elenco. Vuoto è un esito legittimo e non produce un contenitore vuoto: la
 * riga di sintesi ha già detto quale dei tre silenzi è, e una lista vuota
 * accanto a quella frase sembrerebbe un elenco di «nessuno».
 */
export function opponentPrecedentsHtml(
  reading: PrecedentsReading,
  labels: Readonly<Record<string, string>>,
): string {
  if (reading.opponents.length === 0) return "";
  return `<ul class="opponent-precedents__list" id="opponent-precedents-list">${reading.opponents
    .map((entry) => precedentRowHtml(entry, labels))
    .join("")}</ul>`;
}

/**
 * Titolo del pannello. Vedi la nota lunga in testa a questa sezione: nomina
 * ciò che il pannello CONTIENE — gesti passati, contati — e non l'intenzione
 * presente che nessun calcolo dietro di lui produce.
 */
export const OPPONENT_PRECEDENTS_TITLE = "AVVERSARI: I PRECEDENTI";

/**
 * La nota è tenuta CORTA di proposito, ed è una misura, non un gusto: su
 * questa schermata il pannello convive con la war board, il blocco MOMENTO
 * DELL'ASTA e il form ASSEGNA A, e a 390px una nota di sei righe costa più
 * altezza di tutto l'elenco che spiega. Ogni frase qui sotto porta un vincolo
 * che senza di lei si perderebbe — la provenienza, i rinnovi che non contano,
 * la numerosità, il limite del tifo, l'assenza di punteggi — e non c'è una
 * sesta frase.
 */
export const OPPONENT_PRECEDENTS_NOTE =
  "Serve a rispondere da solo a «chi lo vuole»: il pannello non lo calcola. Solo gesti già compiuti, contati sullo storico d'asta, ognuno con le stagioni su cui è misurato: quattro alte con un crollo nell'ultima non sono un tratto nato ieri. I rinnovi non contano come riacquisti — rinnovare non è ricomprare — e la spesa sui propri più cari compare solo se il chiamato è di quella fascia. Il tifo dichiarato in intervista è accostato alla spesa misurata su quel club e da solo non fa comparire nessuno: tifare una squadra non è averci speso. Nessun punteggio e nessuna previsione: i fatti sono qui, il giudizio è tuo.";

/** Lo stato onesto quando non c'è nessun giocatore chiamato. */
export const OPPONENT_PRECEDENTS_NO_CALL =
  "Nessun giocatore chiamato: senza un giocatore non esiste il soggetto a cui i precedenti si riferiscono, e un elenco costruito senza di lui parlerebbe d'altro.";

/** Lo stato onesto quando nessuno storico d'asta è stato caricato. */
export const OPPONENT_PRECEDENTS_NO_HISTORY =
  "Nessuno storico d'asta caricato: non ho fatti su cui dire chi ha già voluto questo giocatore. Un elenco vuoto qui non significa «nessuno lo vuole», significa «non lo so».";
