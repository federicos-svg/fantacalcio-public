// IL TITOLO DI UN TOPIC DI PARTITA — che cosa se ne può leggere, e che cosa no.
//
// IL VINCOLO DA CUI PARTE TUTTO, misurato e non ipotizzato sul campione di
// riferimento (dieci topic di partita): **il titolo non porta mai il numero di
// giornata**, zero su dieci. Quindi un topic si lega alla sua partita per
// **coppia di squadre e orario**, incrociati con un calendario (vedi
// `matchLink.ts`). Chi presumesse la giornata dal titolo costruirebbe sul nulla.
//
// `matchdayNumberInTitle` esiste per **contare**, non per decidere: se un
// giorno smette di essere sempre falso, si rimisura e si discute — non si
// cambia il legame di nascosto.

import type { MatchKey, MatchTopicVerdict, TeamAliases } from "./types.js";

/**
 * Separatori d'orario ammessi: due punti **e** punto. Misurato: su dieci orari,
 * nove scritti `20:45` e **uno** `15.00`. L'elenco si allarga **solo su una
 * misura**, mai per intuizione: un parser che prendesse solo i due punti
 * funzionerebbe nove volte su dieci e perderebbe la decima partita in silenzio.
 */
const TIME = /\b(\d{1,2})[:.](\d{2})\b/;

const PAIR_SIGN =
  /([A-Za-zÀ-ÿ'.]{3,}(?:\s+[A-Za-zÀ-ÿ'.]{2,}){0,3})\s*[-–—/]\s*([A-Za-zÀ-ÿ'.]{3,}(?:\s+[A-Za-zÀ-ÿ'.]{2,}){0,3})/;
const PAIR_VS =
  /([A-Za-zÀ-ÿ'.]{3,}(?:\s+[A-Za-zÀ-ÿ'.]{2,}){0,3})\s+(?:vs\.?|v\.|contro)\s+([A-Za-zÀ-ÿ'.]{3,}(?:\s+[A-Za-zÀ-ÿ'.]{2,}){0,3})/i;

const MATCHDAY = /(giornat[ae]\s*n?\.?\s*\d{1,2})|(\d{1,2}\s*[ªº°^]?\s*giornat[ae])/i;

/**
 * Parole di contorno: si tolgono **solo** in testa o in coda al nome, mai in
 * mezzo. «Ore» accanto a un nome è contorno; dentro un nome sarebbe parte del
 * nome.
 */
const TRIMMABLE = new Set([
  "ore", "ora", "live", "diretta", "commenti", "commento", "partita", "match",
  "probabili", "probabile", "formazioni", "formazione", "pre", "post", "topic",
  "anticipo", "posticipo", "oggi", "domani", "del", "della", "di", "il", "la",
]);

/**
 * Vocabolario di **rumore di sezione**: parole che una coppia di squadre non è.
 * Serve al caso più insidioso del campione — un titolo che *somiglia* a un
 * topic di partita senza esserlo, per esempio un titolo di servizio con due
 * parole separate da un trattino e un orario dentro. Sono i titoli che nel
 * campione formavano il gruppo delle forme tutte diverse, cioè il rumore.
 *
 * La regola è deliberatamente stretta: **basta una** di queste parole in uno
 * dei due lati per rifiutare, perché un falso positivo qui non produce un
 * errore visibile — produce un topic legato a una partita che non esiste.
 */
const SECTION_NOISE = new Set([
  "probabili", "probabile", "formazioni", "formazione", "regolamento", "regole",
  "pagelle", "voti", "voto", "serie", "campionato", "classifica", "mercato",
  "calciomercato", "asta", "lega", "leghe", "sezione", "annuncio", "annunci",
  "avviso", "avvisi", "benvenuto", "presentazione", "sondaggio", "consigli",
  "consiglio", "dubbi", "dubbio", "richieste", "richiesta", "assistenza",
  "supporto", "info", "informazioni", "novita", "aggiornamento", "aggiornamenti",
  "topic", "unico", "generale", "ufficiale", "ufficiali",
]);

function withoutDiacritics(value: string): string {
  return value
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/ç/g, "c");
}

/** Normalizza un nome di squadra e lo passa per la tabella di alias iniettata. */
export function normaliseTeamName(name: string, aliases: TeamAliases = {}): string {
  const flat = withoutDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let parts = flat.split(" ").filter((p) => p.length > 0);
  while (parts.length > 1 && TRIMMABLE.has(parts[0] as string)) parts = parts.slice(1);
  while (parts.length > 1 && TRIMMABLE.has(parts[parts.length - 1] as string)) {
    parts = parts.slice(0, -1);
  }
  const base = parts.join(" ");
  const alias = aliases[base];
  return typeof alias === "string" ? alias : base;
}

function looksLikeSectionNoise(normalised: string): boolean {
  return normalised.split(" ").some((word) => SECTION_NOISE.has(word));
}

/** Legge dal titolo la chiave d'incrocio: coppia di squadre e orario. */
export function readMatchKey(title: string, aliases: TeamAliases = {}): MatchKey {
  const cleaned = title.replace(/\[[^\]]{0,60}\]/g, " ").replace(/\s+/g, " ").trim();
  // L'orario si toglie **prima** di cercare la coppia: `15.00` ha la stessa
  // forma di due parole separate da un punto e sporcherebbe i nomi.
  const time = TIME.exec(cleaned);
  const withoutTime = time === null ? cleaned : cleaned.replace(time[0], " ");
  const pair = PAIR_VS.exec(withoutTime) ?? PAIR_SIGN.exec(withoutTime);

  const hours = time === null ? -1 : Number(time[1]);
  const minutes = time === null ? -1 : Number(time[2]);
  const timeValid = hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  const first = pair === null ? "" : (pair[1] as string).trim();
  const second = pair === null ? "" : (pair[2] as string).trim();

  return {
    firstTeam: first,
    secondTeam: second,
    firstTeamNormalised: pair === null ? "" : normaliseTeamName(first, aliases),
    secondTeamNormalised: pair === null ? "" : normaliseTeamName(second, aliases),
    pairPresent: pair !== null,
    homeAwayUnverified: true,
    kickoffLocal: timeValid ? `${hours < 10 ? "0" : ""}${hours}:${time?.[2]}` : "",
    timeSeparator: time === null ? "" : (time[0].replace(/\d/g, "")[0] ?? ""),
    kickoffPresent: timeValid,
    declaredTimeZone: "Europe/Rome",
    matchdayNumberInTitle: MATCHDAY.test(cleaned),
  };
}

/**
 * Il criterio «sembra un topic di partita», nell'ordine in cui rifiuta.
 *
 * `otherPerimeterMarker` è **iniettato**: quale marcatore identifichi un altro
 * perimetro dipende dalla fonte, e questo pacchetto non ne conosce nessuna.
 * Il criterio resta **una scelta dichiarata e contestabile**, fondata su una
 * misura: sul campione, coppia e orario coincidevano, i selezionati avevano una
 * sola forma di titolo, ed erano tanti quante le partite di una giornata.
 */
export function classifyTopicTitle(
  title: string,
  options: { readonly otherPerimeterMarker?: string; readonly aliases?: TeamAliases } = {},
): MatchTopicVerdict {
  const key = readMatchKey(title, options.aliases ?? {});
  const marker = options.otherPerimeterMarker ?? "";
  const carriesOtherMarker =
    marker.length > 0 && title.toLowerCase().includes(marker.toLowerCase());

  let rejection: MatchTopicVerdict["rejection"] = null;
  if (carriesOtherMarker) rejection = "MARCATORE_DI_ALTRO_PERIMETRO";
  else if (!key.pairPresent) rejection = "NESSUNA_COPPIA_RICONOSCIUTA";
  else if (!key.kickoffPresent) rejection = "NESSUN_ORARIO_RICONOSCIUTO";
  else if (
    looksLikeSectionNoise(key.firstTeamNormalised) ||
    looksLikeSectionNoise(key.secondTeamNormalised)
  ) {
    rejection = "PAROLE_DI_SEZIONE_NON_SQUADRE";
  }

  return { isMatchTopic: rejection === null, rejection, key };
}
