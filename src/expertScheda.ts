// SCHEDA GIOCATORE (Gruppo Esperti) — contratto, validatore e risoluzione.
//
// CHE COSA È, E CHE COSA NON È. Non è l'output di un estrattore che gira
// durante l'asta: è un DEPOSITO COMPILATO PRIMA (decisione di Pico, riportata
// dall'Executive nella correzione del brief di questo task). Pico legge le
// schede del Gruppo Esperti nei giorni che precedono il 3 settembre, le
// trascrive in un file JSON e lo deposita nella cartella privata autorizzata;
// il sito lo legge a runtime dall'endpoint same-origin del repository privato,
// esattamente come già fa col listone (`functions/api/listone.ts`, dietro
// Cloudflare Access). Questo file porta il CONTRATTO e il VALIDATORE; il
// lettore che va su Drive vive nel privato e non esiste qui.
//
// PERCHÉ QUESTA FORMA RISOLVE ANCHE UN PROBLEMA DI CONFINE. `RedactedPost`
// (packages/gruppo-esperti/src/types.ts, privato) porta `textLength`, non il
// testo: la prosa del forum non attraversa la redazione per costruzione.
// Quindi la prosa che l'utente legge qui è SCRITTA DA PICO, non ripubblicata
// da terzi — e nessun handle di un autore reale, nessun URL del forum e
// nessuna superficie di nome copiata dalla scheda sorgente entra in questo
// contratto. L'identità del giocatore non viene dal forum: viene dal LISTONE
// (`player` + `club` sono le due colonne che Pico ha già sotto gli occhi), e
// la chiave è `listonePlayerKey`, la stessa con cui l'event log registra un
// acquisto.
//
// IL VOCABOLARIO NON È INVENTATO QUI. I valori ammessi — titolarità,
// designazione rigori, calci piazzati, categorie di avviso — sono quelli di
// `packages/gruppo-esperti/src/signals.ts` (privato); i cinque stati di
// disponibilità e le loro etichette italiane sono quelli di
// `EXPERT_INSIGHT_QUALITY_LABELS` in `packages/gruppo-esperti/src/
// insightComponent.ts`, riportati qui alla lettera perché il privato non è
// importabile dal core pubblico. La regola del privato — «etichetta di qualità
// portata dal dato, mai dedotta a valle» — resta: la vista porta sempre la sua
// `quality` accanto alla sua `availability`, e il renderer non la ricostruisce.
//
// NIENTE DI DIRETTIVO, MAI. Nessun campo di questo contratto è (o può
// diventare) `value`, `fair_to_me`, `target_band`, un prezzo o un consiglio
// d'asta — docs/NO_GO.md §Prodotto. Lo schema è `.strict()`: una chiave in più
// nel deposito è un errore di validazione, non un campo che passa in silenzio.
// Il campo percentuale si chiama `percentuale` e NON `quota`: in fantacalcio
// «quota» è il prezzo, e un campo che si legge come un prezzo in un pannello
// che non può mostrarne sarebbe un incidente aspettato.
//
// Layer senza DOM, testabile fuori dal browser — stessa forma di
// src/nominationContext.ts e src/leagueTeams.ts.

import { z } from "zod";
import { listonePlayerKey, normalizeIdentityPart } from "./ui/listone.js";
import {
  normalizePlayerName,
  tokenizeNormalizedName,
} from "../packages/identity-policy/src/nameSimilarity.js";

// ── Vocabolario (copia fedele di packages/gruppo-esperti/src/signals.ts) ─────

export const TITOLARITA_VALUES = ["titolare", "ballottaggio", "riserva"] as const;
export type Titolarita = (typeof TITOLARITA_VALUES)[number];

export const RIGORI_VALUES = ["designato", "possibile"] as const;
export type Rigori = (typeof RIGORI_VALUES)[number];

export const PIAZZATI_VALUES = ["punizioni", "angoli"] as const;
export type Piazzati = (typeof PIAZZATI_VALUES)[number];

export const AVVISO_VALUES = ["sconsigliato", "rischio_fisico", "provvisorio", "mercato"] as const;
export type Avviso = (typeof AVVISO_VALUES)[number];

/**
 * Con quale autorità la scheda sorgente parlava — `PostAuthority` del privato,
 * meno l'identità di chi ha scritto: «scheda ufficiale della squadra» e
 * «risposta staff» sono attribuzioni NON identificanti, l'handle di una
 * persona reale no e non arriva qui.
 *
 * `community` esiste per poter registrare che la fonte NON era autorevole:
 * `isAuthoritative()` (privato) non promuove mai la community, e qui produce
 * lo stato `author_authority_not_verified`.
 */
export const FONTE_VALUES = ["scheda", "staff", "community"] as const;
export type Fonte = (typeof FONTE_VALUES)[number];

// ── I cinque stati di disponibilità ──────────────────────────────────────────

export const EXPERT_INSIGHT_AVAILABILITIES = [
  "available",
  "source_unavailable",
  "no_expert_signal",
  "identity_not_resolved",
  "author_authority_not_verified",
] as const;

export type ExpertInsightAvailability = (typeof EXPERT_INSIGHT_AVAILABILITIES)[number];

/**
 * Le etichette italiane di `packages/gruppo-esperti/src/insightComponent.ts`,
 * VERBATIM. Non sono riscritte e non vanno riscritte: sono il caveat che
 * appartiene a ciascuno stato. Il dizionario è chiuso — un consumatore non
 * può ricevere prosa libera al posto di un caveat previsto.
 */
export const EXPERT_INSIGHT_QUALITY_LABELS = {
  available: "segnale esperto — descrittivo, non validato",
  source_unavailable: "fonte aggiuntiva non disponibile",
  no_expert_signal: "nessun segnale esperto per questo giocatore",
  identity_not_resolved: "identità non risolta — segnale in coda di revisione",
  author_authority_not_verified: "autore non verificato come staff — segnale non attribuibile",
} as const satisfies Record<ExpertInsightAvailability, string>;

export type ExpertInsightQualityLabel =
  (typeof EXPERT_INSIGHT_QUALITY_LABELS)[ExpertInsightAvailability];

// ── La scheda, cioè il modulo che Pico compila ───────────────────────────────

export const EXPERT_SCHEDA_SCHEMA_VERSION = 1;

/** Il deposito è servito qui, same-origin, dal repository privato. */
export const EXPERT_SCHEDA_ENDPOINT = "/api/schede";

/**
 * Quanto può essere lunga la prosa di una scheda.
 *
 * È un vincolo di PRODOTTO, non un limite tecnico: la schermata live è la più
 * lunga dell'app e questo riquadro convive con la war board, il momento
 * dell'asta e il form ASSEGNA A. 400 caratteri sono tre o quattro righe su
 * desktop e cinque su un telefono — abbastanza per «perché» di un avviso o una
 * situazione di mercato, non abbastanza per un tema che nessuno leggerà con
 * due secondi per decidere. Una nota più lunga è un errore di validazione
 * dichiarato, non un troncamento silenzioso.
 */
export const SCHEDA_NOTA_MAX = 400;

/**
 * Il tetto di `player` e `club`. Esportato perché la schermata che COMPILA le
 * schede (src/schedaCompiler.ts) deve poter rifiutare un'identità troppo lunga
 * dicendo il perché, invece di offrire un deposito che questo stesso schema
 * rifiuterà dopo.
 */
export const SCHEDA_NAME_MAX = 80;

/**
 * I DUE CAMPI QUANTITATIVI, coi loro limiti in un posto solo.
 *
 * Erano letterali dentro `schedaSchema`. Sono costanti esportate perché il
 * compilatore di schede deve metterli su `min`/`max` dei propri campi numerici
 * e nel messaggio d'errore che scrive a Pico: una seconda copia scritta a mano
 * là dentro sarebbe una regola che può divergere da quella che valida davvero,
 * e divergerebbe in silenzio — il modulo continuerebbe a compilare e il
 * deposito verrebbe rifiutato solo alla fine, senza dire quale numero fosse
 * fuori scala. Lo schema qui sotto li usa: c'è una definizione, non due.
 */
export const SCHEDA_PERCENTUALE_MIN = 0;
export const SCHEDA_PERCENTUALE_MAX = 100;
export const SCHEDA_GERARCHIA_MIN = 1;
export const SCHEDA_GERARCHIA_MAX = 9;

/**
 * Una scheda. **Solo `player` e `club` sono obbligatori** — insieme sono
 * l'identità, e senza identità la scheda non si aggancia a nessuna riga del
 * listone. Tutto il resto è facoltativo: una scheda con due righe di prosa e
 * nessun segnale è valida, e si rende bene.
 */
export interface ExpertScheda {
  /** Nome del giocatore COME NEL LISTONE, non come nel forum. */
  readonly player: string;
  /** Squadra di serie A come nel listone: la seconda metà dell'identità. */
  readonly club: string;
  readonly titolarita?: Titolarita;
  /**
   * Quota percentuale del ballottaggio dichiarata dalla scheda (es. `60`).
   * Non è un prezzo, non è una probabilità calcolata, non è un punteggio: è
   * il numero che la scheda sorgente scrive fra parentesi quadre.
   */
  readonly percentuale?: number;
  /** Posizione nella gerarchia del ruolo (1 = prima scelta). */
  readonly gerarchia?: number;
  readonly rigori?: Rigori;
  readonly piazzati?: readonly Piazzati[];
  readonly avvisi?: readonly Avviso[];
  /** La prosa: il perché di un avviso, una situazione di mercato, un contesto. */
  readonly nota?: string;
  /** `YYYY-MM-DD` del giorno in cui Pico ha scritto o rivisto la scheda. */
  readonly aggiornata?: string;
  readonly fonte?: Fonte;
}

export interface ExpertSchedaDeposit {
  readonly schemaVersion: typeof EXPERT_SCHEDA_SCHEMA_VERSION;
  readonly schede: readonly ExpertScheda[];
}

/** `YYYY-MM-DD` e data di calendario vera — stessa regola di profileSchema.ts. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === (m as number) - 1 &&
    date.getUTCDate() === d
  );
}

const schedaSchema = z
  .object({
    player: z.string().trim().min(1).max(SCHEDA_NAME_MAX),
    club: z.string().trim().min(1).max(SCHEDA_NAME_MAX),
    titolarita: z.enum(TITOLARITA_VALUES).optional(),
    percentuale: z
      .number()
      .int()
      .min(SCHEDA_PERCENTUALE_MIN)
      .max(SCHEDA_PERCENTUALE_MAX)
      .optional(),
    gerarchia: z.number().int().min(SCHEDA_GERARCHIA_MIN).max(SCHEDA_GERARCHIA_MAX).optional(),
    rigori: z.enum(RIGORI_VALUES).optional(),
    piazzati: z.array(z.enum(PIAZZATI_VALUES)).max(PIAZZATI_VALUES.length).optional(),
    avvisi: z.array(z.enum(AVVISO_VALUES)).max(AVVISO_VALUES.length).optional(),
    nota: z.string().trim().max(SCHEDA_NOTA_MAX).optional(),
    aggiornata: z.string().refine(isValidIsoDate).optional(),
    fonte: z.enum(FONTE_VALUES).optional(),
  })
  .strict();

const depositSchema = z
  .object({
    schemaVersion: z.literal(EXPERT_SCHEDA_SCHEMA_VERSION),
    schede: z.array(schedaSchema),
  })
  .strict();

// ── Il deposito letto, o il motivo per cui non lo è ──────────────────────────

/**
 * Fail-closed come `loadOpponentProfiles`: un deposito illeggibile o non
 * conforme NON produce una lettura parziale. Metà delle schede sarebbe peggio
 * di nessuna scheda — sul giocatore mancante il pannello direbbe «la fonte non
 * ha nulla su di lui» mentre la verità è «non sono riuscito a leggere il file».
 */
export type ExpertSchedaStore =
  | {
      readonly ok: true;
      readonly byPlayerKey: ReadonlyMap<string, readonly ExpertScheda[]>;
      /**
       * Lo stesso deposito, raggruppato per SQUADRA piegata — l'indice su cui
       * lavora l'aggancio per nome più sotto. È derivato da `byPlayerKey`, non
       * una seconda verità: si costruisce una volta a lettura del deposito
       * perché il confronto a token non ripaghi la piega di ~200 schede a ogni
       * render (stessa ragione per cui esiste `listonePoolIndex`).
       */
      readonly byClub: ReadonlyMap<string, readonly SchedaGroup[]>;
    }
  | { readonly ok: false; readonly reason: "absent" | "unreadable" | "invalid" };

export const EXPERT_SCHEDE_ABSENT: ExpertSchedaStore = { ok: false, reason: "absent" };

/**
 * Indicizza il deposito per `listonePlayerKey`. Le collisioni NON vengono
 * risolte scegliendone una: restano tutte, e la risoluzione le trasforma in
 * `identity_not_resolved`. Scegliere in automatico fra due schede scritte a
 * mano sullo stesso giocatore significherebbe mostrare la metà sbagliata senza
 * dirlo a nessuno.
 */
export function indexSchede(schede: readonly ExpertScheda[]): ReadonlyMap<string, readonly ExpertScheda[]> {
  const byPlayerKey = new Map<string, ExpertScheda[]>();
  for (const scheda of schede) {
    const key = listonePlayerKey({ name: scheda.player, club: scheda.club });
    const bucket = byPlayerKey.get(key);
    if (bucket === undefined) byPlayerKey.set(key, [scheda]);
    else bucket.push(scheda);
  }
  return byPlayerKey;
}

/** Testo JSON -> deposito indicizzato, o il motivo del rifiuto. Non lancia mai. */
export function parseExpertSchedaDeposit(rawText: string | null): ExpertSchedaStore {
  if (rawText === null) return EXPERT_SCHEDE_ABSENT;
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const parsed = depositSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return expertSchedaStore(parsed.data.schede);
}

/** Le schede validate -> il deposito indicizzato nei due modi che servono. */
export function expertSchedaStore(schede: readonly ExpertScheda[]): ExpertSchedaStore {
  const byPlayerKey = indexSchede(schede);
  return { ok: true, byPlayerKey, byClub: indexSchedeByClub(byPlayerKey) };
}

// ── L'AGGANCIO AL LISTONE ────────────────────────────────────────────────────
//
// IL PROBLEMA CHE RISOLVE, DETTO COME SI VEDE A SCHERMO. Pico scrive ~200
// schede a mano nei giorni prima dell'asta, leggendole dalle fonti del Gruppo
// Esperti. Le fonti scrivono «Mario Rossi»; il listone della lega, sulla stessa
// riga, può scrivere «Rossi». Fino a qui `indexSchede` indicizzava la scheda su
// `mario-rossi__inter` e il riquadro cercava `rossi__inter`: due chiavi diverse,
// nessun aggancio, e il pannello dichiarava «la scheda non è ancora stata
// scritta» su una scheda che Pico aveva scritto. È il difetto peggiore possibile
// per questo riquadro, perché è INVISIBILE: chi legge non ha modo di sapere che
// esisteva qualcosa da leggere, e il lavoro sparisce senza un errore.
//
// LA REGOLA, e perché è questa e non una somiglianza a punteggio. Nessuna
// distanza di edit, nessuna soglia da tarare, nessun punteggio: tre condizioni
// esatte, tutte verificabili a occhio da chi legge il risultato.
//
//  1. SQUADRA UGUALE dopo la piega, sempre. È il vincolo che rende il resto
//     sicuro: due omonimi in due squadre diverse non si incontrano mai, e la
//     ricerca resta dentro una ventina di schede invece che sul deposito
//     intero. Si usa `normalizeIdentityPart`, cioè ESATTAMENTE la piega con cui
//     `listonePlayerKey` costruisce la metà «squadra» della chiave: così
//     qualunque riga che si agganciava prima continua ad agganciarsi.
//  2. UGUAGLIANZA PIENA sul nome piegato — il caso normale, ed è un GRADINO A
//     SÉ: quando c'è un nome identico si prende quello e si smette di cercare.
//     Senza questa precedenza un listone che scrive «Rossi» accanto a una
//     scheda «Rossi» e a una «Mario Rossi» farebbe due candidati e una domanda
//     inutile, con la risposta giusta già in mano.
//  3. Altrimenti CONTENIMENTO DI TOKEN, nei due versi: tutti i token dell'uno
//     dentro l'altro. «Rossi» ⊂ «Mario Rossi» aggancia; «Rossi» e «Rossini»
//     no, perché sono due token diversi e nessuno contiene l'altro.
//
// PERCHÉ `normalizePlayerName` + `tokenizeNormalizedName` E NON LE ALTRE DUE
// PIEGHE DI QUESTO REPOSITORY. Sono la piega progettata per il confronto a
// token (packages/identity-policy/src/nameSimilarity.ts), e le altre due sono
// esplicitamente sbagliate qui:
//  - `normalizeIdentityName` (packages/engine/src/identityName.ts) VIETA nella
//    propria intestazione di alimentarci un confronto a token: tiene apostrofi
//    e trattini come caratteri di nome, quindi «N'Golo» resta un token solo;
//  - `normalizeIdentityPart` da sola unisce tutto in una stringa sola con `-`,
//    e il contenimento degraderebbe a sottostringa grezza: «Rossi» aggancerebbe
//    «Rossini». Per la SQUADRA va benissimo (è un confronto di uguaglianza, non
//    di contenimento) ed è per questo che lì resta.
//
// L'ESITO NON È MAI UN INDOVINELLO. Zero candidati = la scheda non c'è (o il
// nome è un refuso): il riquadro lo dice, come prima. Uno = si aggancia, e se
// non era un'uguaglianza piena il pannello DICHIARA su quale nome è scritta la
// scheda, così un aggancio sbagliato è leggibile invece che silenzioso. Due o
// più = non si sceglie: si chiede a Pico (`candidates` qui sotto), e la
// risposta è sua.

/**
 * Le schede che condividono una chiave di listone, con la loro identità già
 * piegata una volta sola. `player`/`club` sono COME SCRITTI sulla scheda: sono
 * ciò che Pico rilegge nella domanda, e una superficie piegata non gli
 * direbbe niente.
 */
export interface SchedaGroup {
  readonly key: string;
  readonly player: string;
  readonly club: string;
  readonly normalizedName: string;
  readonly nameTokens: readonly string[];
  readonly schede: readonly ExpertScheda[];
}

/** L'identità di una riga di listone come la vede questo modulo: nome + squadra. */
export interface SchedaTarget {
  readonly name: string;
  readonly club: string;
}

/**
 * Raggruppa il deposito per squadra piegata. L'ordine dentro ogni secchio è
 * quello del deposito, cioè l'ordine in cui Pico ha scritto le schede: è
 * deterministico e non è un ranking — nessuna delle due cose che una
 * graduatoria implicita farebbe credere.
 */
export function indexSchedeByClub(
  byPlayerKey: ReadonlyMap<string, readonly ExpertScheda[]>,
): ReadonlyMap<string, readonly SchedaGroup[]> {
  const byClub = new Map<string, SchedaGroup[]>();
  for (const [key, schede] of byPlayerKey) {
    const first = schede[0];
    if (first === undefined) continue;
    const normalizedName = normalizePlayerName(first.player);
    const group: SchedaGroup = {
      key,
      player: first.player,
      club: first.club,
      normalizedName,
      nameTokens: tokenizeNormalizedName(normalizedName),
      schede,
    };
    const clubKey = normalizeIdentityPart(first.club);
    const bucket = byClub.get(clubKey);
    if (bucket === undefined) byClub.set(clubKey, [group]);
    else bucket.push(group);
  }
  return byClub;
}

/**
 * Tutti i token di `inner` sono anche in `outer`. Un lato vuoto non contiene e
 * non è contenuto: «nessuna prova» non diventa mai un aggancio gratuito (stessa
 * postura di `computeTokenOverlap`, che su un lato vuoto rende 0).
 */
function tokensContained(inner: readonly string[], outer: readonly string[]): boolean {
  if (inner.length === 0 || outer.length === 0) return false;
  const set = new Set(outer);
  return inner.every((token) => set.has(token));
}

/**
 * Le schede che potrebbero appartenere a questa riga di listone, secondo la
 * regola dichiarata sopra. Pura: non sceglie, non ordina per merito, non
 * inventa. Zero, una o più — chi chiama decide che cosa farne.
 */
export function findSchedaCandidates(
  store: ExpertSchedaStore,
  target: SchedaTarget | null,
): readonly SchedaGroup[] {
  if (!store.ok || target === null) return [];
  const bucket = store.byClub.get(normalizeIdentityPart(target.club)) ?? [];
  if (bucket.length === 0) return [];
  const normalized = normalizePlayerName(target.name);
  const tokens = tokenizeNormalizedName(normalized);
  if (tokens.length === 0) return [];
  const exact = bucket.filter((group) => group.normalizedName === normalized);
  if (exact.length > 0) return exact;
  return bucket.filter(
    (group) =>
      tokensContained(tokens, group.nameTokens) || tokensContained(group.nameTokens, tokens),
  );
}

// ── La vista che il riquadro rende ───────────────────────────────────────────

/**
 * Una scheda candidata, ridotta a ciò che serve per farne una domanda leggibile:
 * il nome e la squadra COME SCRITTI sulla scheda, e quante schede stanno sotto
 * quell'identità (`count > 1` = due schede identiche, che restano da unire a
 * mano anche dopo la scelta).
 */
export interface ExpertSchedaCandidate {
  readonly schedaKey: string;
  readonly player: string;
  readonly club: string;
  readonly count: number;
}

/**
 * Come la scheda è finita accanto a questa riga di listone:
 *  - `exact`     — nome piegato identico, il caso normale;
 *  - `contained` — un nome contenuto nell'altro, aggancio unico e DICHIARATO
 *                  a schermo, perché un aggancio dedotto va letto;
 *  - `chosen`    — c'erano più candidati e Pico ha scelto.
 */
export type SchedaMatch = "exact" | "contained" | "chosen";

/**
 * Ciò che arriva al riquadro. I tre fatti di onestà sono LETTERALI `false`,
 * non configurazione: `contributesToIndex` (non entra in nessun calcolo),
 * `validated` (nessuno ha verificato questo segnale) e `directive` (non è un
 * consiglio). Sono nel payload E sono resi a schermo — un flag vero solo nel
 * JSON non lo legge nessuno.
 */
export interface ExpertInsightView {
  readonly availability: ExpertInsightAvailability;
  readonly quality: ExpertInsightQualityLabel;
  readonly contributesToIndex: false;
  readonly validated: false;
  readonly directive: false;
  /**
   * Le schede fra cui Pico deve scegliere, quando ce n'è più d'una che
   * potrebbe essere di questa riga. VUOTO quando non c'è niente da chiedere —
   * cioè quasi sempre. NON è un ranking e non è ordinato per merito: è
   * l'ordine in cui le schede sono scritte nel deposito, e nessuna delle due
   * è «la prima».
   */
  readonly candidates: readonly ExpertSchedaCandidate[];
  /**
   * La scheda che Pico ha scelto fra i candidati, o `null` quando non ha
   * ancora scelto. Torna `null` anche quando la scelta di ieri punta a una
   * scheda che oggi non è più fra i candidati: la domanda si riapre invece di
   * agganciare in silenzio qualcosa di diverso.
   */
  readonly chosenSchedaKey: string | null;
  /** Come si è arrivati a questa scheda, o `null` quando non c'è aggancio. */
  readonly matchedBy: SchedaMatch | null;
  /** Il nome COME SCRITTO sulla scheda agganciata — quello che Pico rilegge. */
  readonly matchedPlayer: string | null;
  readonly titolarita: Titolarita | null;
  readonly percentuale: number | null;
  readonly gerarchia: number | null;
  readonly rigori: Rigori | null;
  readonly piazzati: readonly Piazzati[];
  readonly avvisi: readonly Avviso[];
  readonly nota: string;
  readonly aggiornata: string | null;
  readonly fonte: Fonte | null;
}

/**
 * Lo stato «non lo so», in tutte e quattro le sue forme. È VUOTO per
 * costruzione: nessun segnale, nessuna prosa, nessuna data. Quattro stati su
 * cinque significano che non c'è nulla da dire, e devono sembrarlo — un
 * riquadro che conserva mezzo contenuto mentre dichiara di non averne è
 * peggio di un riquadro vuoto, perché si legge come pieno.
 */
export function unknownExpertInsight(
  availability: Exclude<ExpertInsightAvailability, "available">,
): ExpertInsightView {
  return {
    availability,
    quality: EXPERT_INSIGHT_QUALITY_LABELS[availability],
    contributesToIndex: false,
    validated: false,
    directive: false,
    candidates: [],
    chosenSchedaKey: null,
    matchedBy: null,
    matchedPlayer: null,
    titolarita: null,
    percentuale: null,
    gerarchia: null,
    rigori: null,
    piazzati: [],
    avvisi: [],
    nota: "",
    aggiornata: null,
    fonte: null,
  };
}

/** `true` quando la scheda dice almeno una cosa — un segnale o una riga di prosa. */
export function schedaHasContent(scheda: ExpertScheda): boolean {
  return (
    scheda.titolarita !== undefined ||
    scheda.rigori !== undefined ||
    scheda.gerarchia !== undefined ||
    (scheda.piazzati ?? []).length > 0 ||
    (scheda.avvisi ?? []).length > 0 ||
    (scheda.nota ?? "").trim() !== ""
  );
}

function toCandidate(group: SchedaGroup): ExpertSchedaCandidate {
  return {
    schedaKey: group.key,
    player: group.player,
    club: group.club,
    count: group.schede.length,
  };
}

/**
 * Dalla riga di listone alla vista. È l'unico punto in cui uno dei cinque stati
 * viene deciso, e ogni ramo ha una ragione dichiarata:
 *
 *  - deposito non letto             -> `source_unavailable`
 *  - nessun candidato               -> `no_expert_signal`   («non è ancora scritta»)
 *  - più candidati, nessuno scelto  -> `identity_not_resolved` + `candidates`
 *  - due schede sotto la stessa id  -> `identity_not_resolved` («vanno unite»)
 *  - `fonte: "community"`           -> `author_authority_not_verified`
 *  - scheda aperta ma vuota         -> `no_expert_signal`   (aperta ≠ compilata)
 *  - altrimenti                     -> `available`
 *
 * L'IDENTITÀ ARRIVA COME NOME + SQUADRA, non come chiave già calcolata: era una
 * chiave, e la coincidenza fra la ricetta di chi chiamava e quella di
 * `indexSchede` era un vincolo scritto solo in un commento. Ora la ricetta è
 * una sola e sta qui dentro — un `proxyId` di riga non può più entrare per
 * sbaglio nella chiave e mandare a vuoto un deposito indicizzato su nome+squadra.
 *
 * `chosenSchedaKey` è la risposta che Pico ha già dato per questa riga, quando
 * l'ha data. Vale SOLO in presenza di più candidati: non può creare un aggancio
 * dove la regola non ne trova, e non può spostarne uno dove ce n'è uno solo.
 *
 * `percentuale` sopravvive solo insieme a una titolarità: una percentuale da
 * sola non è un ballottaggio, è un numero senza soggetto.
 */
export function resolveExpertInsight(
  store: ExpertSchedaStore,
  target: SchedaTarget | null,
  chosenSchedaKey: string | null = null,
): ExpertInsightView {
  if (!store.ok) return unknownExpertInsight("source_unavailable");
  if (target === null) return unknownExpertInsight("no_expert_signal");

  const found = findSchedaCandidates(store, target);
  if (found.length === 0) return unknownExpertInsight("no_expert_signal");

  const ambiguous = found.length > 1;
  const candidates = ambiguous ? found.map(toCandidate) : [];
  const group = ambiguous
    ? found.find((candidate) => candidate.key === chosenSchedaKey) ?? null
    : (found[0] as SchedaGroup);

  // Più candidati e nessuna scelta valida: la domanda, non un'ipotesi.
  if (group === null) {
    return { ...unknownExpertInsight("identity_not_resolved"), candidates };
  }

  const link = {
    candidates,
    chosenSchedaKey: ambiguous ? group.key : null,
    matchedBy: (ambiguous
      ? "chosen"
      : group.normalizedName === normalizePlayerName(target.name)
        ? "exact"
        : "contained") as SchedaMatch,
    matchedPlayer: group.player,
  };

  // Due schede sotto la STESSA identità: sceglierne una a caso mostrerebbe la
  // metà sbagliata senza dirlo. Restano da unire a mano, come prima.
  if (group.schede.length > 1) {
    return { ...unknownExpertInsight("identity_not_resolved"), ...link };
  }
  const scheda = group.schede[0] as ExpertScheda;
  if (scheda.fonte === "community") {
    return { ...unknownExpertInsight("author_authority_not_verified"), ...link };
  }
  if (!schedaHasContent(scheda)) {
    return { ...unknownExpertInsight("no_expert_signal"), ...link };
  }
  return {
    availability: "available",
    quality: EXPERT_INSIGHT_QUALITY_LABELS.available,
    contributesToIndex: false,
    validated: false,
    directive: false,
    ...link,
    titolarita: scheda.titolarita ?? null,
    percentuale: scheda.titolarita === undefined ? null : scheda.percentuale ?? null,
    gerarchia: scheda.gerarchia ?? null,
    rigori: scheda.rigori ?? null,
    piazzati: scheda.piazzati ?? [],
    avvisi: scheda.avvisi ?? [],
    nota: (scheda.nota ?? "").trim(),
    aggiornata: scheda.aggiornata ?? null,
    fonte: scheda.fonte ?? null,
  };
}
