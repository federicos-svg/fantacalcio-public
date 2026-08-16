// IL RUOLO STASERA — resa del riquadro di svuotamento del ruolo in asta.
//
// Costruttori di sole stringhe, stesso idioma di ./liveFacts.ts e ./tierBand.ts:
// il calcolo vive in src/roleDepletion.ts (puro, senza DOM), il montaggio in
// ./views.ts, e qui in mezzo sta tutto ciò che riguarda le PAROLE — quali
// numeri si dicono, in che ordine, e che frase si dice quando un numero non
// c'è. Verificabile senza jsdom/happy-dom, nessuno dei due configurato in
// questo progetto.
//
// LA REGOLA DELLE FRASI ONESTE, che questo file eredita da
// `OPPONENT_PRECEDENTS_NO_HISTORY`: un dato che manca non diventa uno zero e
// non diventa un contenitore vuoto — diventa una frase che dice QUALE dei
// silenzi è. Qui i silenzi sono due e portano a decisioni diverse:
//  - «nessun giocatore chiamato»: non esiste il ruolo di cui parlare;
//  - «nessuno di questo ruolo è passato stasera»: il ruolo esiste, il tavolo
//    non ha ancora prodotto niente su di lui. Non è «il ruolo è pieno».
// Nel secondo caso il censimento dei posti C'È lo stesso ed è mostrato: il
// pannello non tace su ciò che sa perché gli manca altro.
//
// NIENTE QUOTAZIONI, NEMMENO NELLE PAROLE. Il riquadro non nomina un valore di
// listino, non dice quanto varrebbe chi resta e non ordina niente per Qt.A: la
// decisione di Pico del 16/08/2026 tiene il listino fuori dal calcolo, e una
// frase che lo evocasse rimetterebbe a schermo, come impressione, ciò che il
// calcolo non ha. Il conteggio delle righe di listone ancora libere resta dove
// già stava — la cella «in listone» del blocco MOMENTO DELL'ASTA, qui accanto —
// e non viene ricontato qui.
//
// DETERMINISMO: nessuna `Date`, nessun `Intl`/`toLocaleString`, nessun numero
// formattato in modo dipendente dalla macchina. I numeri di questo pannello
// sono conteggi e crediti interi: si stampano come sono.

import type { Role } from "../../packages/engine/src/types.js";
import type { RoleBuyerTonight, RoleDepletionFacts, RoleDepletionReading } from "../roleDepletion.js";
import { escHtml, roleChipHtml } from "./theme.js";
import { ROLE_LABELS, ROLE_LABEL_SING } from "./labels.js";

/**
 * Titolo del pannello. Nomina ciò che il pannello CONTIENE — che cosa è
 * successo a questo ruolo stasera — e non una diagnosi («ruolo teso», «ruolo
 * caldo») che nessun calcolo dietro di lui produce. Corto perché vive sulla
 * schermata più stretta dell'app: 16 caratteri contro i 28 di «AVVERSARI: CHI
 * PUÒ ARRIVARCI», che a 390px stava su una riga sola.
 */
export const ROLE_DEPLETION_TITLE = "IL RUOLO STASERA";

/** Il silenzio numero uno: non c'è nessun soggetto di cui parlare. */
export const ROLE_DEPLETION_NO_CALL =
  "Nessun giocatore chiamato: senza un giocatore non c'è un ruolo di cui misurare lo svuotamento, e un conteggio costruito senza di lui parlerebbe d'altro.";

/** Plurale/singolare senza librerie: conta solo per «squadra/squadre» e simili. */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * La riga di sintesi: che cosa il tavolo ha fatto STASERA su questo ruolo.
 *
 * Il caso a zero acquisti non è un caso di errore ed è il caso in cui si apre
 * ogni asta: la frase lo dice per intero, e dice anche che cosa NON significa,
 * perché «0 presi» accanto a un pannello muto si legge come «qui non c'è
 * niente da prendere».
 */
export function roleDepletionHeadline(reading: RoleDepletionReading): string {
  if (reading.kind === "no-call") return ROLE_DEPLETION_NO_CALL;
  const { role, takenTonight, creditsTonight, buyers } = reading.facts;
  if (takenTonight === 0) {
    return `Nessun ${ROLE_LABEL_SING[role].toLowerCase()} è passato stasera: su questo ruolo il registro della serata non ha ancora niente da misurare. Non vuol dire «il ruolo è pieno», vuol dire «qui, stasera, non è ancora successo niente».`;
  }
  return `${takenTonight} ${plural(takenTonight, ROLE_LABEL_SING[role].toLowerCase(), ROLE_LABELS[role].toLowerCase())} ${plural(takenTonight, "preso", "presi")} stasera, da ${buyers.length} ${plural(buyers.length, "squadra", "squadre")}, per ${creditsTonight} ${plural(creditsTonight, "credito", "crediti")}.`;
}

/**
 * Il censimento dei posti, sempre disponibile perché non è un campione: si
 * contano i posti che il regolamento assegna al tavolo e quelli che le squadre
 * hanno ancora vuoti, adesso.
 *
 * I tre numeri restano SEPARATI e ognuno è misurato per conto suo — posti
 * totali, posti liberi, posti riconfermati. Nessuno dei tre è ottenuto per
 * differenza dagli altri: una sottrazione sembrerebbe una misura e su uno
 * stato incoerente col log mentirebbe in silenzio.
 *
 * «La più scoperta» compare solo quando qualcuno è ancora scoperto: a ruolo
 * completo su tutto il tavolo la frase sarebbe «la più scoperta ne ha 0», che
 * dice il contrario di quello che sembra.
 */
export function roleDepletionCensusHtml(facts: RoleDepletionFacts): string {
  const demand =
    facts.teamsWithOpenSlot === 0
      ? `Nessuna squadra ha più un posto libero in questo ruolo: il tavolo lo ha completato.`
      : `${facts.teamsWithOpenSlot} ${plural(facts.teamsWithOpenSlot, "squadra", "squadre")} su ${facts.teamsCounted} ${plural(facts.teamsWithOpenSlot, "cerca", "cercano")} ancora almeno un posto di questo ruolo; la più scoperta ne ha ${facts.widestOpening}.`;
  return `
    <div class="role-depletion__census" id="role-depletion-census">
      <span class="role-depletion__census-head">I POSTI DI QUESTO RUOLO, ADESSO</span>
      <span class="role-depletion__census-row">
        <span class="role-depletion__metric">
          <span>posti al tavolo</span>
          <strong id="role-depletion-slots-total">${facts.roleSlotsTotal}</strong>
        </span>
        <span class="role-depletion__metric">
          <span>ancora liberi</span>
          <strong id="role-depletion-slots-open">${facts.openSlots}</strong>
        </span>
        <span class="role-depletion__metric">
          <span>presi stasera</span>
          <strong id="role-depletion-taken">${facts.takenTonight}</strong>
        </span>
        <span class="role-depletion__metric">
          <span>riconfermati</span>
          <strong id="role-depletion-confirmed">${facts.confirmedSlots}</strong>
        </span>
      </span>
      <span class="role-depletion__census-basis" id="role-depletion-census-basis">${escHtml(
        `${demand} Censimento su ${facts.teamsCounted} ${plural(facts.teamsCounted, "squadra", "squadre")}, nessun campione e nessun cold start.`,
      )}</span>
    </div>`;
}

function buyerRowHtml(buyer: RoleBuyerTonight, label: string): string {
  // I prezzi in chiaro, uno per uno, e non la loro media: la media di 45 e 3 e
  // la media di 24 e 24 sono lo stesso numero e non sono lo stesso tavolo.
  const prices = buyer.prices.join(", ");
  return `
    <li class="role-depletion__buyer" id="role-depletion-buyer-${escHtml(buyer.fantaTeamId)}">
      <span class="role-depletion__buyer-name" title="${escHtml(label)}">${escHtml(label)}</span>
      <span class="role-depletion__buyer-count">${buyer.taken} ${plural(buyer.taken, "preso", "presi")} · ${buyer.credits} cr</span>
      <span class="role-depletion__buyer-prices">${escHtml(prices)}</span>
    </li>`;
}

/**
 * Chi ha preso, quanti, e a che prezzi. Vuoto è un esito legittimo e non
 * produce un contenitore vuoto: la riga di sintesi ha già detto che stasera
 * non è passato nessuno, e un elenco vuoto sotto quella frase si leggerebbe
 * come un elenco di «nessuno».
 */
export function roleDepletionBuyersHtml(
  facts: RoleDepletionFacts,
  labels: Readonly<Record<string, string>>,
): string {
  if (facts.buyers.length === 0) return "";
  return `<ul class="role-depletion__buyers" id="role-depletion-buyers">${facts.buyers
    .map((buyer) => buyerRowHtml(buyer, labels[buyer.fantaTeamId] ?? buyer.fantaTeamId))
    .join("")}</ul>`;
}

/**
 * La pastiglia del ruolo più il suo nome per esteso, mai la sola sigla: è la
 * stessa regola che il blocco della scarsità applica alle sue quattro celle.
 */
export function roleDepletionRoleHtml(reading: RoleDepletionReading): string {
  if (reading.kind === "no-call") return "";
  const role: Role = reading.facts.role;
  return `${roleChipHtml(role)}<em>${escHtml(ROLE_LABELS[role])}</em>`;
}

/**
 * Forma parlata dell'intero riquadro, per l'aria-label: la sintesi più il
 * censimento, senza la punteggiatura di impaginazione.
 */
export function roleDepletionSpoken(reading: RoleDepletionReading): string {
  const headline = roleDepletionHeadline(reading);
  if (reading.kind === "no-call") return `${ROLE_DEPLETION_TITLE}. ${headline}`;
  const f = reading.facts;
  return `${ROLE_DEPLETION_TITLE}, ${ROLE_LABELS[f.role]}. ${headline} Posti di questo ruolo al tavolo: ${f.roleSlotsTotal}, ancora liberi ${f.openSlots}, riconfermati a inizio asta ${f.confirmedSlots}.`;
}

/**
 * La nota è tenuta corta di proposito, come quella dei precedenti, ed è una
 * misura e non un gusto: su questa schermata il riquadro convive con la war
 * board, il blocco MOMENTO DELL'ASTA, AVVERSARI e il form ASSEGNA A. Ogni
 * frase porta un vincolo che senza di lei si perderebbe — la provenienza, il
 * listino che non entra, le riconferme che non sono acquisti, l'assenza di
 * punteggi — e non ce n'è una quinta.
 */
export const ROLE_DEPLETION_NOTE =
  "Ogni numero viene dal log dell'asta di stasera e dal censimento dei posti delle squadre al tavolo. Le quotazioni del listino non entrano in questo conto, nemmeno per ordinare le righe: quante righe di questo ruolo restino nel listone caricato si legge nel blocco MOMENTO DELL'ASTA, qui accanto. Le riconferme sono contate a parte perché sono posti occupati con i prezzi della stagione scorsa, non acquisti di stasera. Nessuna banda, nessun punteggio e nessuna previsione su quanto costerà il prossimo: i fatti sono qui, il giudizio è tuo.";
