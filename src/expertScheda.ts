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
import { listonePlayerKey } from "./ui/listone.js";

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

const NAME_MAX = 80;

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
    player: z.string().trim().min(1).max(NAME_MAX),
    club: z.string().trim().min(1).max(NAME_MAX),
    titolarita: z.enum(TITOLARITA_VALUES).optional(),
    percentuale: z.number().int().min(0).max(100).optional(),
    gerarchia: z.number().int().min(1).max(9).optional(),
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
  | { readonly ok: true; readonly byPlayerKey: ReadonlyMap<string, readonly ExpertScheda[]> }
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
  return { ok: true, byPlayerKey: indexSchede(parsed.data.schede) };
}

// ── La vista che il riquadro rende ───────────────────────────────────────────

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

/**
 * Dalla scheda alla vista. È l'unico punto in cui uno dei cinque stati viene
 * deciso, e ogni ramo ha una ragione dichiarata:
 *
 *  - deposito non letto            -> `source_unavailable`
 *  - deposito letto, nessuna scheda-> `no_expert_signal`   («non è ancora scritta»)
 *  - due schede sullo stesso id    -> `identity_not_resolved`
 *  - `fonte: "community"`          -> `author_authority_not_verified`
 *  - scheda aperta ma vuota        -> `no_expert_signal`   (aperta ≠ compilata)
 *  - altrimenti                    -> `available`
 *
 * `percentuale` sopravvive solo insieme a una titolarità: una percentuale da
 * sola non è un ballottaggio, è un numero senza soggetto.
 */
export function resolveExpertInsight(
  store: ExpertSchedaStore,
  playerKey: string | null,
): ExpertInsightView {
  if (!store.ok) return unknownExpertInsight("source_unavailable");
  if (playerKey === null) return unknownExpertInsight("no_expert_signal");
  const bucket = store.byPlayerKey.get(playerKey) ?? [];
  if (bucket.length === 0) return unknownExpertInsight("no_expert_signal");
  if (bucket.length > 1) return unknownExpertInsight("identity_not_resolved");
  const scheda = bucket[0] as ExpertScheda;
  if (scheda.fonte === "community") return unknownExpertInsight("author_authority_not_verified");
  if (!schedaHasContent(scheda)) return unknownExpertInsight("no_expert_signal");
  return {
    availability: "available",
    quality: EXPERT_INSIGHT_QUALITY_LABELS.available,
    contributesToIndex: false,
    validated: false,
    directive: false,
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
