// LE SQUADRE DI SERIE A CHE GIOCANO UNA COPPA EUROPEA NEL 2026/27 — la sola
// cosa che serve alla gamba «coppe europee e turnover» del valore assoluto.
//
// PERCHÉ ESISTE, E PERCHÉ NON SERVE NÉ UN CALENDARIO NÉ LE ROSE. Parole di
// Pico, 2026-08-24: «la concorrenza lo vedi da GE e titolarità, ballottaggi
// etc. Non serve calendario o altro basta vedere quali saranno le squadre che
// giocheranno le coppe». La gamba chiede una cosa sola — PRESENZA O ASSENZA —
// e questo file la porta come un elenco dichiarato, non come una previsione di
// quante partite in più farà un giocatore.
//
// LA FORMA È QUELLA DI src/ui/serieA.ts, ALLA LETTERA: costante dichiarata,
// fonti verificate nell'intestazione, test che la pinna. Nessuno scraping,
// nessun I/O, nessun client HTTP: l'elenco è scritto qui a mano dopo verifica
// incrociata, esattamente come `SERIE_A_CLUBS_2026_27`.
//
// FONTI — verificate con ricerca web contro fonti sportive indipendenti fra
// loro, il 2026-08-24, e concordi sulla stessa lista:
//   - Sky Sport, «Serie A, chi si qualifica in Champions, Europa League e
//     Conference» e «Europa League 2026 2027, le squadre qualificate»;
//   - Fanpage, «Serie A, decise quali squadre giocheranno Champions, Europa
//     League e Conference nel 2026-2027»;
//   - TUTTOmercatoWEB, «la Serie A avrà 4 squadre in Champions e 2 in Europa
//     League nel 2026-2027» (numero di posti per l'Italia);
//   - L'Interista e SalentoSport, classifica finale 2025/26 e verdetti;
//   - Tuttosport, «Juventus e Milan in Europa League 2026/27».
//
// I VERDETTI CHE PRODUCONO L'ELENCO, così che chiunque possa rifarli:
// classifica finale 2025/26 — Inter 87, Napoli 76, Roma 73, Como 71, Milan 70,
// Juventus 69, Atalanta 59 — con quattro posti Champions all'Italia; la Coppa
// Italia 2025/26 l'ha vinta l'Inter, già qualificata in Champions, quindi il
// posto Europa League della coppa nazionale scorre in classifica e va a Milan
// e Juventus, e l'Atalanta prende il posto in Conference League.
//
// UNA PRECISAZIONE CHE NON SI NASCONDE: il posto dell'Atalanta è ai PLAYOFF di
// Conference League, non alla fase a girone diretta. Resta in elenco perché la
// domanda della gamba è «gioca partite europee», e i playoff sono partite
// europee; ma la differenza è scritta qui invece che persa, perché il giorno in
// cui Pico dichiarasse un `delta` diverso da zero questa è esattamente la riga
// che vorrà rileggere.
//
// SE UN GIORNO L'ELENCO NON FOSSE STABILIBILE da fonti verificabili, la
// risposta giusta è LASCIARLO VUOTO e dirlo: `playsInEurope()` risponde `null`
// («non lo so») per tutti, la gamba risulta assente e — con `delta = 0` — non
// rompe niente. Un elenco inventato sarebbe peggio di un elenco assente.
// Questo non è un ramo morto: è il comportamento che il file avrebbe avuto
// oggi se la verifica fosse fallita, ed è provato.
//
// NIENTE DOM, NIENTE STATO, NIENTE I/O: puro, come src/tierOrdering.ts. Il
// motore NON importa questo file — la partecipazione entra in
// `absoluteValueReading` come `inEurope: boolean | null`, dal chiamante,
// esattamente come `bandMargin` entra in `callScreen`.

import { SERIE_A_CLUBS_2026_27 } from "./ui/serieA.js";

/**
 * Le squadre di Serie A 2026/27 impegnate in una coppa europea nella stessa
 * stagione. Nomi COME IN `SERIE_A_CLUBS_2026_27` (src/ui/serieA.ts), non come
 * li scrive una fonte: un nome che non combacia con quella lista è un aggancio
 * che non avverrà mai, ed è la ragione per cui un test confronta le due.
 */
export const SERIE_A_CLUBS_IN_EUROPE_2026_27: readonly string[] = [
  // Champions League: le prime quattro della classifica finale 2025/26.
  "Inter",
  "Napoli",
  "Roma",
  "Como",
  // Europa League: quinta e sesta, per lo scorrimento del posto della Coppa
  // Italia (vinta dall'Inter, già in Champions).
  "Milan",
  "Juventus",
  // Conference League: settima, ai playoff (vedi l'intestazione).
  "Atalanta",
];

/**
 * `true` quando l'elenco è stato stabilito, `false` quando è vuoto.
 *
 * Esiste perché «l'elenco è vuoto» e «nessuna squadra gioca le coppe» sono due
 * affermazioni diverse, e solo la prima è vera quando la verifica fallisce.
 * Chi consuma legge questa costante e non `length`, così la distinzione ha un
 * nome invece di essere un confronto ricordato a memoria.
 */
export const EUROPEAN_PARTICIPATION_DECLARED: boolean =
  SERIE_A_CLUBS_IN_EUROPE_2026_27.length > 0;

/** Confronto per NOME normalizzato: spazi ai bordi via, maiuscole/minuscole
 *  indifferenti. Non è una risoluzione d'identità (quella vive in
 *  packages/identity-policy): è la sola tolleranza che serve fra una costante
 *  scritta a mano e una cella di listone. */
function fold(club: string): string {
  return club.trim().toLowerCase();
}

const IN_EUROPE: ReadonlySet<string> = new Set(SERIE_A_CLUBS_IN_EUROPE_2026_27.map(fold));
const IN_SERIE_A: ReadonlySet<string> = new Set(SERIE_A_CLUBS_2026_27.map(fold));

/**
 * Gioca una coppa europea nel 2026/27?
 *
 * TRE ESITI, e il terzo è il motivo per cui la firma non è `boolean`:
 *
 *  - `true`  — il club è nell'elenco verificato;
 *  - `false` — il club è in Serie A 2026/27 e NON è nell'elenco: è un'assenza
 *    dichiarata, cioè la linea di base della gamba;
 *  - `null`  — non lo sappiamo.
 *
 * `null` IN TRE CASI, e il terzo è quello che conta davvero:
 *
 *  1. l'elenco non è stato stabilito (vuoto);
 *  2. la riga di listone non porta un club: senza il nome della squadra la
 *     domanda non ha soggetto;
 *  3. IL CLUB NON È FRA QUELLI DI SERIE A 2026/27. Qui `false` sarebbe la
 *     risposta comoda e sbagliata: la verifica di questo file copre le venti
 *     squadre di quella lista e nient'altro, quindi su un nome che non è in
 *     lista non c'è niente da dichiarare. È anche la sola difesa contro
 *     l'errore silenzioso peggiore — un club europeo scritto in un modo che non
 *     combacia («Juve» per «Juventus») uscirebbe come `false`, cioè come una
 *     dichiarazione di assenza al posto di un mancato aggancio.
 */
export function playsInEurope(club: string | null | undefined): boolean | null {
  if (!EUROPEAN_PARTICIPATION_DECLARED) return null;
  if (club === null || club === undefined) return null;
  const key = fold(club);
  if (key.length === 0) return null;
  if (!IN_SERIE_A.has(key)) return null;
  return IN_EUROPE.has(key);
}
