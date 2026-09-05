// L'OSSERVAZIONE HA UN MOMENTO E UNA GIORNATA, e nessuno dei due si deduce.
//
// Questo file esiste per un difetto preciso, dichiarato prima di essere scritto:
// una formazione letta e poi conservata **somiglia** a una formazione di adesso.
// Non c'è niente, nella formazione stessa, che dica quando è stata letta: undici
// nomi e un modulo hanno lo stesso aspetto se la lettura è di due minuti fa o di
// martedì scorso. Una formazione della giornata scorsa mostrata come quella di
// oggi è il peggior esito possibile di questa schermata — peggio di una pagina
// vuota, perché una pagina vuota non fa perdere una giornata.
//
// La correzione non è «aggiungere una data in fondo»: è rendere il momento della
// lettura **parte del dato**, obbligatorio nel tipo, così che nessuna strada
// possa produrre una lettura senza dire quando è avvenuta. `LineupChannelRead`
// pretende una `LineupObservation`; una lettura non datata non è rappresentabile.
//
// QUI NON C'È NESSUN OROLOGIO, ed è la stessa regola di `calendar.ts`: le
// funzioni che parlano di tempo ricevono l'istante come argomento e non lo
// leggono mai da sé. Un pacchetto puro che guarda l'orologio non è più
// verificabile — la stessa prova darebbe esiti diversi in momenti diversi — e la
// scelta di quale orologio guardare appartiene a chi mostra la pagina.
//
// LE DUE SCALE DELLA GIORNATA — e questa parte è stata pagata a caro prezzo.
// La piattaforma dichiara la giornata in **due scale diverse** e i due numeri non
// sono confrontabili fra loro:
//
//   * la giornata di **Serie A** (`status.mday` per la lega, `cmday` sulla
//     formazione letta);
//   * la giornata **interna alla competizione** (`mday` sulla formazione letta),
//     che parte da 1 quando il campionato di lega comincia — e il campionato di
//     lega comincia alla giornata `sDay` di Serie A.
//
// Il legame è `mday = status.mday − sDay + 1`. Sulla lega vera, a Serie A 3 con
// `sDay 3`, la formazione porta `mday 1` e `cmday 3`: mettere `mday` contro
// `status.mday` significa confrontare 1 con 3 e rifiutare una formazione giusta.
// È già successo, in scrittura, e la guardia aveva fatto il suo mestiere sul
// confronto sbagliato.
//
// Perciò la guardia è **doppia e devono tornare entrambe le strade**, con esiti
// distinti perché sono due misure diverse: la seconda àncora la formazione alla
// **sua** giornata, la prima confronta due numeri che la piattaforma potrebbe
// anche limitarsi a ripetere. È la seconda a fare il lavoro; la prima la
// conferma. Se manca **uno solo** dei quattro numeri non si sceglie il ramo
// permissivo: si dichiara che la giornata non è stata dichiarata.

/**
 * QUANDO la lettura è avvenuta, e in quale giornata di Serie A.
 *
 * Viaggia dentro `LineupChannelRead`, obbligatoria: è l'unico modo di garantire
 * che chi mostra una formazione abbia in mano anche il suo momento. Chi
 * costruisce questo valore lo prende dalla lettura, mai dall'orologio di chi
 * legge: l'istante di una lettura è una proprietà della lettura.
 */
export interface LineupObservation {
  /**
   * Istante della lettura, stringa opaca in forma ISO-8601 con fuso.
   *
   * Opaca qui dentro: non viene interpretata da nessuna funzione di questo file
   * se non da `lineupAge`, che riceve anche l'istante di confronto. Mai vuota —
   * una stringa vuota sarebbe «non datata» travestita da datata.
   */
  readonly readAt: string;
  /**
   * La giornata di **Serie A** osservata nella stessa lettura, cioè la scala in
   * cui il campionato di lega e la coppa si datano entrambi.
   */
  readonly seriesMatchday: number;
}

/**
 * OGNI PEZZO PORTA IL PROPRIO MOMENTO, e non è una raffinatezza.
 *
 * Le cose che la lega espone non cambiano alla stessa velocità: la formazione e
 * lo stato della giornata cambiano di continuo, le rose e il calendario quasi
 * mai. Chi le legge lo fa quindi con cadenze diverse — ed è la scelta giusta,
 * perché rileggere otto rose ogni mezz'ora spenderebbe accessi per riscrivere
 * gli stessi byte. La conseguenza è che **in un deposito coesistono letture di
 * età diverse**, e un momento solo in cima direbbe una cosa falsa su tutto ciò
 * che non l'ha prodotto: la rosa avversaria di tre settimane fa presentata come
 * fresca è lo stesso difetto della formazione vecchia, in un altro vestito.
 *
 * `null` è «questo pezzo non c'è», mai «è vecchio quanto gli altri».
 */
export interface ObservedParts {
  /** La formazione e lo stato della giornata: il pezzo che cambia di continuo. */
  readonly lineup: LineupObservation;
  /** La rosa della propria squadra. */
  readonly roster: LineupObservation;
  /** Le impostazioni di lega. */
  readonly settings: LineupObservation;
  /** L'elenco delle squadre della lega. `null` = non osservato. */
  readonly leagueTeams: LineupObservation | null;
  /** Il calendario, da cui esce l'avversario di giornata. `null` = non osservato. */
  readonly calendar: LineupObservation | null;
}

/** Le etichette dei pezzi, per la riga che li dichiara uno per uno. */
export const NOMI_DEI_PEZZI: Readonly<Record<keyof ObservedParts, string>> = {
  lineup: "formazione",
  roster: "la tua rosa",
  settings: "impostazioni di lega",
  leagueTeams: "squadre della lega",
  calendar: "calendario",
};

/**
 * I QUATTRO NUMERI del confronto, come la lettura li ha visti.
 *
 * Tutti opzionali di proposito: `undefined` è «non osservato», ed è un esito
 * legittimo della lettura che qui produce un rifiuto dichiarato invece di un
 * confronto fatto su un valore inventato.
 */
export interface ObservedMatchdayNumbers {
  /** `status.mday` — la giornata di Serie A della lega, al momento della lettura. */
  readonly leagueSeriesMatchday?: number;
  /** `sDay` della competizione — la giornata di Serie A da cui essa comincia. */
  readonly competitionStartDay?: number;
  /** `cmday` della formazione letta — giornata di Serie A. */
  readonly lineupSeriesMatchday?: number;
  /** `mday` della formazione letta — giornata interna alla competizione. */
  readonly lineupCompetitionMatchday?: number;
}

/** Perché la giornata della formazione letta non è utilizzabile. */
export type MatchdayMismatchCause =
  /** Manca almeno uno dei quattro numeri: non si sceglie il ramo permissivo. */
  | "giornata_non_dichiarata"
  /** `cmday` ≠ `status.mday`: le due letture di Serie A non coincidono. */
  | "giornata_serie_a_non_coincidente"
  /** `mday` ≠ `status.mday − sDay + 1`: la formazione è di un'altra giornata. */
  | "giornata_competizione_non_coincidente";

/**
 * L'esito della doppia guardia. `coerente: false` porta **tutti** i numeri del
 * confronto, perché un rifiuto senza i numeri che l'hanno prodotto non è
 * diagnosticabile da nessuno.
 */
export type MatchdayCoherence =
  | {
      readonly coerente: true;
      /** La giornata di Serie A su cui i due controlli si sono accordati. */
      readonly seriesMatchday: number;
      /** La stessa giornata nella scala della competizione. */
      readonly competitionMatchday: number;
    }
  | {
      readonly coerente: false;
      readonly cause: MatchdayMismatchCause;
      readonly numbers: ObservedMatchdayNumbers;
      /** La giornata che la competizione avrebbe dovuto portare, se calcolabile. */
      readonly expectedCompetitionMatchday: number | null;
    };

function isNumero(valore: number | undefined): valore is number {
  return typeof valore === "number" && Number.isFinite(valore);
}

/**
 * LA DOPPIA GUARDIA SULLA GIORNATA, nelle due scale.
 *
 * Entrambe le strade devono tornare. Fail-closed su ogni numero mancante: il
 * caso «tre numeri su quattro» non autorizza il confronto che si può fare, e non
 * per prudenza rituale — con `sDay` assente la seconda strada, cioè quella che
 * fa il lavoro, non è calcolabile affatto, e restare con la sola prima
 * significherebbe accettare una formazione sulla misura più debole delle due.
 */
export function matchdayCoherence(numbers: ObservedMatchdayNumbers): MatchdayCoherence {
  const { leagueSeriesMatchday, competitionStartDay, lineupSeriesMatchday, lineupCompetitionMatchday } =
    numbers;
  if (
    !isNumero(leagueSeriesMatchday) ||
    !isNumero(competitionStartDay) ||
    !isNumero(lineupSeriesMatchday) ||
    !isNumero(lineupCompetitionMatchday)
  ) {
    return {
      coerente: false,
      cause: "giornata_non_dichiarata",
      numbers,
      expectedCompetitionMatchday: null,
    };
  }

  const attesa = leagueSeriesMatchday - competitionStartDay + 1;

  // Prima strada: Serie A contro Serie A. Conferma, non decide.
  if (lineupSeriesMatchday !== leagueSeriesMatchday) {
    return {
      coerente: false,
      cause: "giornata_serie_a_non_coincidente",
      numbers,
      expectedCompetitionMatchday: attesa,
    };
  }

  // Seconda strada: la formazione ancorata alla giornata della SUA competizione.
  // È questa a fare il lavoro.
  if (lineupCompetitionMatchday !== attesa) {
    return {
      coerente: false,
      cause: "giornata_competizione_non_coincidente",
      numbers,
      expectedCompetitionMatchday: attesa,
    };
  }

  return {
    coerente: true,
    seriesMatchday: leagueSeriesMatchday,
    competitionMatchday: attesa,
  };
}

/**
 * QUANTO È VECCHIA la lettura, in minuti, rispetto a un istante DATO.
 *
 * `null` quando uno dei due istanti non è una data leggibile, oppure quando la
 * lettura è **nel futuro** rispetto al confronto: un'età negativa non è «zero
 * minuti», è un orologio che non torna, e trattarla come freschissima sarebbe
 * il modo più silenzioso di far passare per attuale un dato di cui non si sa
 * nulla. Chi riceve `null` dichiara che l'età non è determinabile.
 */
export function lineupAge(readAt: string, now: string): number | null {
  if (readAt.length === 0 || now.length === 0) return null;
  const letta = Date.parse(readAt);
  const adesso = Date.parse(now);
  if (!Number.isFinite(letta) || !Number.isFinite(adesso)) return null;
  const minuti = (adesso - letta) / 60000;
  if (minuti < 0) return null;
  return minuti;
}

/**
 * OLTRE QUANTI MINUTI una lettura smette di poter essere presentata come attuale.
 *
 * **90 minuti. Scelta tecnica dell'Executive, dichiarata e contestabile**, e
 * derivata dalla cadenza, non da un'intuizione: la lettura programmata gira ogni
 * 30 minuti nella finestra che precede la scadenza delle formazioni e ogni 6 ore
 * fuori. Novanta minuti sono **tre cicli mancati** nella finestra in cui la
 * pagina serve davvero — abbastanza perché un ritardo isolato non riempia lo
 * schermo di avvisi, troppo perché una lettura si presenti come attuale se il
 * ciclo si è fermato. Fuori dalla finestra la soglia è quasi sempre superata, ed
 * è corretto che lo sia: lì la formazione non si sta decidendo, e dire «letta sei
 * ore fa» è la verità.
 *
 * Non è una soglia di sicurezza: è una soglia di **onestà**. Superarla non
 * nasconde la formazione — la mostra dicendo che non è quella di adesso.
 */
export const LETTURA_ATTUALE_ENTRO_MINUTI = 90;

/** Che cosa si può dire del momento della lettura, davanti alla soglia. */
export type LineupFreshness =
  | { readonly kind: "attuale"; readonly ageMinutes: number; readonly thresholdMinutes: number }
  | { readonly kind: "non_attuale"; readonly ageMinutes: number; readonly thresholdMinutes: number }
  /** L'età non è determinabile: non si sceglie fra le altre due. */
  | { readonly kind: "eta_ignota"; readonly thresholdMinutes: number };

/**
 * Se la lettura può ancora essere presentata come attuale, dato un istante.
 *
 * Tre esiti e non due: quando l'età non si sa, dirlo è l'unica risposta onesta —
 * «attuale» sarebbe una promessa e «non attuale» un'accusa, e nessuna delle due
 * è stata osservata.
 */
export function lineupFreshness(
  observation: LineupObservation,
  now: string,
  thresholdMinutes: number = LETTURA_ATTUALE_ENTRO_MINUTI,
): LineupFreshness {
  const eta = lineupAge(observation.readAt, now);
  if (eta === null) return { kind: "eta_ignota", thresholdMinutes };
  if (eta > thresholdMinutes) {
    return { kind: "non_attuale", ageMinutes: eta, thresholdMinutes };
  }
  return { kind: "attuale", ageMinutes: eta, thresholdMinutes };
}

/**
 * L'età in parole, per la riga che sta ACCANTO alla formazione.
 *
 * Sta qui e non nella UI perché è la stessa frase in ogni punto in cui il momento
 * della lettura si mostra, e perché ha una regola: non arrotonda mai **verso il
 * recente**. Novantanove minuti si dicono «1 ora fa», non «poco fa».
 */
export function lineupAgeLabel(ageMinutes: number | null): string {
  if (ageMinutes === null) return "da quando non si sa";
  const minuti = Math.floor(ageMinutes);
  if (minuti <= 0) return "adesso";
  if (minuti === 1) return "1 minuto fa";
  if (minuti < 60) return `${minuti} minuti fa`;
  const ore = Math.floor(minuti / 60);
  if (ore === 1) return "1 ora fa";
  if (ore < 24) return `${ore} ore fa`;
  const giorni = Math.floor(ore / 24);
  return giorni === 1 ? "1 giorno fa" : `${giorni} giorni fa`;
}
