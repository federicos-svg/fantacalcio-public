// CHI ERA IN GARA — le parole del gesto, in un posto solo.
//
// Costruttori di stringhe puri (stesso idioma di warBoard.ts / liveFacts.ts),
// così la copia e le regole di sintesi sono testabili senza DOM: il wrapper
// che costruisce le pastiglie e ci attacca i click vive in views.ts.
//
// IL GESTO, IN UNA RIGA: sette pastiglie (i posti diversi dal mio), selezione
// multipla, un clic per marcare, un clic per smarcare. Nessun campo
// obbligatorio, nessuna conferma, nessun modulo. Non marcare nulla è un esito
// NORMALE: la riga non produce avvisi, non colora niente di rosso e non costa
// un clic in più: si preme «Registra acquisto» come se questa riga non ci
// fosse.
//
// PERCHÉ NON C'È IL MIO POSTO. La domanda è «quali AVVERSARI erano in gara»:
// che io fossi interessato è implicito nel fatto che stavo battendo. Sette
// pastiglie invece di otto è anche meno da leggere in un secondo.
//
// PERCHÉ CHI VINCE RESTA MARCABILE. Il vincitore è già nel log come
// vincitore, ma «era in gara» resta vero per lui e toglierlo dalla riga
// significherebbe che le pastiglie cambiano quando cambia la squadra scelta —
// cioè che una marcatura già fatta sparisce sotto le dita. Il consumatore, se
// gli serve, sottrae il vincitore: il dato che salviamo porta accanto il
// proprio `winnerFantaTeamId`.

/** Titolo della riga. Corto: sta dentro la scheda del giocatore chiamato. */
export const INTEREST_FLAG_TITLE = "CHI ERA IN GARA";

/** Sottotitolo del titolo: dice subito che si può saltare. */
export const INTEREST_FLAG_OPTIONAL_HINT = "facoltativo";

/**
 * La nota sotto le pastiglie. Dice tre cose e nessuna di più: a che serve, che
 * si può non marcare niente, e che non tocca la contabilità dell'asta.
 */
export const INTEREST_FLAG_NOTE =
  "Marca gli avversari che si sono fatti sotto per questo giocatore: un clic per ciascuno, nessuno è obbligatorio. " +
  "Resta in una coda locale, non entra nello storico e non cambia budget, slot o max bid.";

/** Che cosa si legge quando non è stato marcato nessuno. */
export const INTEREST_FLAG_EMPTY_SUMMARY = "Nessuno marcato";

/**
 * La sintesi accanto al titolo: quanti e chi, nell'ordine dei posti dato dal
 * chiamante — mai un ordine «per importanza», che sarebbe una graduatoria di
 * quanto lo volevano (docs/data/OPPONENT_PROFILE_CONTRACT.md §4-bis).
 *
 * `marked` può contenere posti che non sono in `seatOrder` (una coda
 * sopravvissuta a un cambio di configurazione della lega): quelli finiscono in
 * fondo, nell'ordine in cui sono arrivati, invece di sparire senza dirlo.
 */
export function interestFlagSummary(
  marked: readonly string[],
  seatOrder: readonly string[],
  seatLabels: Readonly<Record<string, string>>,
): string {
  const ordered = orderMarkedSeats(marked, seatOrder);
  if (ordered.length === 0) return INTEREST_FLAG_EMPTY_SUMMARY;
  const names = ordered.map((seatId) => seatLabels[seatId] ?? seatId);
  return `${ordered.length} marcati: ${names.join(", ")}`;
}

/** L'ordine dichiarato: i posti come li elenca il chiamante, poi gli ignoti. */
export function orderMarkedSeats(
  marked: readonly string[],
  seatOrder: readonly string[],
): readonly string[] {
  const set = new Set(marked);
  const known = seatOrder.filter((seatId) => set.has(seatId));
  const unknown = marked.filter((seatId) => !seatOrder.includes(seatId));
  // `unknown` conserva l'ordine di arrivo e non viene deduplicato dal Set
  // sopra, quindi lo deduplico qui: la stessa marcatura due volte è una sola.
  return [...known, ...Array.from(new Set(unknown))];
}

/**
 * L'etichetta parlata di una pastiglia. Il testo visibile è il nome del posto;
 * questa frase è ciò che uno screen reader legge, e porta lo stato con sé
 * perché `aria-pressed` da solo non dice DI CHE COSA si tratta.
 */
export function interestChipSpoken(seatLabel: string, marked: boolean): string {
  return marked
    ? `${seatLabel}: marcato come in gara. Premi per togliere la marcatura.`
    : `${seatLabel}: non marcato. Premi per marcarlo come in gara.`;
}
