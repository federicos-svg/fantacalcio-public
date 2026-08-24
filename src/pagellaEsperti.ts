// PAGELLA GRUPPO ESPERTI — i cinque voti su 10 e il TOTALE su 50.
//
// ── CHE COSA È ───────────────────────────────────────────────────────────────
//
// Le schede del Gruppo Esperti portano, evidenziata, una riga di questa forma:
//
//   portiere:   Titolarità 1/10 – Media voto 1/10 – Salute 8/10 –
//               Porta inviolata 1/10 – Consiglio Esperti 1/10 – TOTALE 12/50
//   difensore:  Titolarità 9/10 – Media voto 7/10 – Salute 9/10 –
//               Bonus 6/10 – Consiglio Esperti 8/10 – TOTALE 39/50
//
// Questo modulo porta il CONTRATTO di quella riga: forma, intervallo,
// dipendenza dal ruolo, che cosa significa un valore assente e la regola con
// cui il totale si verifica. Non porta nessun estrattore: leggere le schede e
// riempire il deposito è lavoro del repository privato, e oggi NON esiste
// ancora — quindi lo stato normale di ogni campo qui dentro è «assente», e
// l'app lo dichiara invece di mostrare uno zero.
//
// ── PERCHÉ UN MODULO A SÉ, E NON UN CAMPO IN PIÙ IN expertScheda.ts ──────────
//
// Per la COLLISIONE DI NOME, che è il difetto più probabile di questo lavoro.
// `ExpertScheda.titolarita` esiste già ed è un'AFFERMAZIONE CATEGORICA —
// `"titolare" | "ballottaggio" | "riserva"` — mentre la «Titolarità 9/10» del
// Gruppo Esperti è un VOTO su una scala. Sono due cose diverse che la fonte
// chiama con la stessa parola: metterle nello stesso oggetto, una accanto
// all'altra, significherebbe scrivere `scheda.titolarita` e non sapere quale
// delle due si stia leggendo finché non fallisce qualcosa.
//
// La separazione qui è quindi TRIPLA e ognuna delle tre è verificata da un
// test (src/pagellaEsperti.test.ts §"collisione"):
//   1. FILE DIVERSO — i due vocabolari non si toccano mai in un `import`;
//   2. CHIAVI PREFISSATE — ogni asse si chiama `pagella_*`, quindi nessuna
//      chiave di questo modulo può mai coincidere con un campo categorico
//      della scheda né con uno dei suoi valori;
//   3. ETICHETTE DISTINTE A SCHERMO — «Titolarità (voto)» contro
//      «TITOLARITÀ», confrontate DOPO la piega di `foldLabel`, che è la stessa
//      piega con cui due parole si somigliano all'occhio. Se un giorno
//      tornassero a coincidere il test diventa rosso: è l'unica delle tre che
//      un refactoring distratto può davvero riaprire.
//
// ── IL QUARTO ASSE DIPENDE DAL RUOLO, E IL CONTRATTO LO DICHIARA ────────────
//
// Quattro assi sono comuni a tutti — Titolarità, Media voto, Salute, Consiglio
// Esperti. Il QUARTO no: per i portieri è «Porta inviolata», per il movimento
// è «Bonus». Non sono la stessa grandezza con due nomi: sono due grandezze
// diverse nello stesso posto della riga.
//
// Il modello NON le appiana in un asse solo, e lo fa in tre modi che si
// vedono:
//   - lo SCHEMA rifiuta una scheda che porti entrambi i voti (`.superRefine`
//     qui sotto): una scheda parla di un giocatore solo, e quel giocatore ha
//     un ruolo solo;
//   - la RISOLUZIONE confronta l'asse ATTESO dal ruolo della riga di listone
//     con l'asse DICHIARATO dalla scheda e, quando divergono, non usa il voto
//     straniero: lo dichiara (`asseIncoerente`) e l'asse resta assente;
//   - il LISTONE tiene DUE colonne separate, non una: nella riga di un
//     difensore «Porta inviolata» vale `n.a.` — non applicabile — e non `n/d`,
//     che vorrebbe dire «esiste ma non l'abbiamo estratto». Due colonne
//     separate rendono anche onesto l'ORDINAMENTO: una colonna sola, ordinata,
//     confronterebbe la porta inviolata di un portiere col bonus di un
//     attaccante, che è esattamente il confronto che non si può fare.
//
// ── IL TOTALE È DERIVATO, E SERVE A SMENTIRCI ────────────────────────────────
//
// Il TOTALE non è un sesto dato: è la somma dei cinque, su 50. Si salvano i
// cinque, si RICALCOLA la somma, e la si confronta con il totale che la fonte
// dichiara. Una divergenza non è un dettaglio da arrotondare: è la PROVA che
// l'estrazione ha letto male almeno un numero. Quindi non viene appianata —
// `verificaTotale` la nomina, il riquadro d'asta la scrive con entrambi i
// numeri e la nota sotto il listone conta quante righe ne soffrono.
//
// La somma si calcola SOLO su una pagella completa (cinque voti su cinque).
// Una somma parziale su una scala che si legge «/50» sarebbe un numero falso
// che sembra vero: con tre voti su cinque `20/50` non vuol dire niente, e
// nessuno guardando lo schermo saprebbe che mancano due addendi.
//
// ── «CONSIGLIO ESPERTI» È UN PARERE, NON UNA MISURA ─────────────────────────
//
// Gli altri quattro assi provano a misurare qualcosa del giocatore; il quinto
// è il giudizio di chi scrive la scheda. Resta nel contratto perché la fonte
// lo somma nel proprio totale e senza di lui il totale non tornerebbe mai —
// ma viaggia MARCATO (`parere: true`), si mostra attribuito alla fonte, e non
// entra in nessun calcolo dell'app. Come tutto ciò che sta in questo modulo,
// TOTALE compreso: `contributesToIndex: false` e `directive: false` sono
// letterali, non configurazione (docs/DECISIONS.md §D9).
//
// Layer senza DOM, puro e testabile fuori dal browser — stessa forma di
// src/expertScheda.ts, di cui questo modulo è la metà quantitativa.

import { z } from "zod";
import type { Role } from "../packages/engine/src/types.js";

// ── La scala ─────────────────────────────────────────────────────────────────

/** Ogni voto sta fra 0 e 10, interi: è la scala che la fonte scrive, `x/10`. */
export const PAGELLA_VOTO_MIN = 0;
export const PAGELLA_VOTO_MAX = 10;

/** Quanti assi ha una pagella. Cinque, sempre — il quarto cambia, non sparisce. */
export const PAGELLA_ASSI = 5;

/**
 * Il fondo scala del totale: `PAGELLA_ASSI * PAGELLA_VOTO_MAX`. È CALCOLATO e
 * non scritto `50`, perché è esattamente la relazione che il totale deve
 * rispettare: se un giorno la fonte passasse a sei assi o a una scala su 20,
 * un `50` scritto a mano resterebbe verde mentre la verifica del totale
 * comincerebbe a mentire.
 */
export const PAGELLA_TOTALE_MAX = PAGELLA_ASSI * PAGELLA_VOTO_MAX;

// ── Il vocabolario degli assi ────────────────────────────────────────────────
//
// Ogni id porta il prefisso `pagella_`: è ciò che rende IMPOSSIBILE, non solo
// improbabile, la collisione con `ExpertScheda.titolarita` e con gli altri
// campi categorici della scheda.

/** I quattro assi che ogni ruolo ha, nello stesso posto e con lo stesso senso. */
export const PAGELLA_ASSI_COMUNI = [
  "pagella_titolarita",
  "pagella_media_voto",
  "pagella_salute",
  "pagella_consiglio",
] as const;
export type PagellaAsseComune = (typeof PAGELLA_ASSI_COMUNI)[number];

/** Il quarto asse, nelle sue due forme: una per i portieri, una per il movimento. */
export const PAGELLA_ASSI_DI_RUOLO = ["pagella_porta_inviolata", "pagella_bonus"] as const;
export type PagellaAsseDiRuolo = (typeof PAGELLA_ASSI_DI_RUOLO)[number];

export type PagellaAsse = PagellaAsseComune | PagellaAsseDiRuolo;

export const PAGELLA_ASSI_TUTTI: readonly PagellaAsse[] = [
  ...PAGELLA_ASSI_COMUNI,
  ...PAGELLA_ASSI_DI_RUOLO,
];

/**
 * L'asse di ruolo che una riga di listone SI ASPETTA, dal suo ruolo classico.
 * `null` quando il ruolo non è noto: non si indovina, si dichiara (vedi lo
 * stato `ruolo_ignoto` più sotto).
 */
export function pagellaAsseDelRuolo(role: Role | null | undefined): PagellaAsseDiRuolo | null {
  if (role === null || role === undefined) return null;
  return role === "P" ? "pagella_porta_inviolata" : "pagella_bonus";
}

/**
 * Le etichette a schermo — le parole della fonte, con UNA disambiguazione
 * deliberata.
 *
 * «Titolarità (voto)» e non «Titolarità»: nello stesso riquadro c'è già una
 * pastiglia intestata «TITOLARITÀ» che porta l'affermazione categorica della
 * scheda. Due scritte identiche a tre centimetri di distanza, che dicono cose
 * diverse, sono l'incidente; le tre parole in più sono il prezzo per non
 * averlo, e `foldLabel` più sotto rende la differenza verificabile invece che
 * affidata all'occhio di chi rilegge.
 *
 * Le altre quattro restano VERBATIM: non c'è niente con cui confonderle.
 */
export const PAGELLA_ETICHETTE: Readonly<Record<PagellaAsse, string>> = {
  pagella_titolarita: "Titolarità (voto)",
  pagella_media_voto: "Media voto",
  pagella_salute: "Salute",
  pagella_porta_inviolata: "Porta inviolata",
  pagella_bonus: "Bonus",
  pagella_consiglio: "Consiglio Esperti",
};

/**
 * Piega di confronto fra due scritte: accenti via, minuscole, ogni corsa di
 * non-alfanumerici a spazio singolo. Due etichette che piegano uguale sono la
 * STESSA PAROLA per chi le legge, comunque siano scritte nel sorgente — ed è
 * questa, non l'uguaglianza esatta, la cosa che il test della collisione deve
 * poter negare.
 */
export function foldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── La forma depositata ──────────────────────────────────────────────────────

/**
 * La pagella come sta nel deposito: i voti per asse e il totale COME SCRITTO
 * dalla fonte.
 *
 * UNA CHIAVE ASSENTE SIGNIFICA «non estratto», mai «zero». È la distinzione
 * che tiene in piedi tutto il resto: `Titolarità 1/10` è un giudizio durissimo
 * e legittimo della fonte, `titolarità mancante` è un buco nostro. Se
 * l'assenza si scrivesse `0` le due diventerebbero indistinguibili a schermo, e
 * il totale ricalcolato passerebbe da «non lo so» a «12/50» senza che nessuno
 * possa accorgersene.
 *
 * `totaleFonte` non è un dato che usiamo: è il numero con cui la fonte può
 * SMENTIRE la nostra estrazione. Vive qui apposta perché la verifica del
 * totale abbia qualcosa contro cui girare.
 */
export interface PagellaScheda {
  readonly voti: Partial<Readonly<Record<PagellaAsse, number>>>;
  readonly totaleFonte?: number;
}

const votoSchema = z.number().int().min(PAGELLA_VOTO_MIN).max(PAGELLA_VOTO_MAX);

/**
 * Lo schema. `.strict()` su entrambi i livelli — una chiave in più è un errore
 * di validazione, non un campo che passa in silenzio — e un `superRefine` che
 * rifiuta la scheda che porta ENTRAMBI gli assi di ruolo.
 *
 * Quel rifiuto è la dipendenza dal ruolo scritta come regola eseguibile: una
 * scheda parla di un giocatore, un giocatore ha un ruolo, e una pagella con
 * «Porta inviolata» e «Bonus» insieme non descrive nessuno. Meglio un deposito
 * respinto con un messaggio, che sei voti su cinque assi mostrati come se
 * fossero una pagella.
 */
export const pagellaSchema = z
  .object({
    voti: z
      .object({
        pagella_titolarita: votoSchema.optional(),
        pagella_media_voto: votoSchema.optional(),
        pagella_salute: votoSchema.optional(),
        pagella_porta_inviolata: votoSchema.optional(),
        pagella_bonus: votoSchema.optional(),
        pagella_consiglio: votoSchema.optional(),
      })
      .strict(),
    totaleFonte: z.number().int().min(0).max(PAGELLA_TOTALE_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.voti.pagella_porta_inviolata !== undefined &&
      value.voti.pagella_bonus !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["voti"],
        message:
          "il quarto asse dipende dal ruolo: «porta inviolata» (portieri) e «bonus» (movimento) non possono stare nella stessa pagella",
      });
    }
  });

/** L'asse di ruolo che una pagella depositata DICHIARA, o `null` se non ne porta. */
export function pagellaAsseDichiarato(pagella: PagellaScheda): PagellaAsseDiRuolo | null {
  if (pagella.voti.pagella_porta_inviolata !== undefined) return "pagella_porta_inviolata";
  if (pagella.voti.pagella_bonus !== undefined) return "pagella_bonus";
  return null;
}

// ── La vista risolta ─────────────────────────────────────────────────────────

/**
 * Lo stato di un asse. Quattro parole per quattro situazioni che portano a
 * gesti diversi, e nessuna delle quattro è «0»:
 *
 *  - `voto`             — la fonte ha dato un voto, ed è quello;
 *  - `assente`          — l'asse esiste per questo ruolo ma non è stato
 *                         estratto (oggi: sempre, l'estrazione privata non c'è);
 *  - `non_applicabile`  — l'asse NON esiste per questo ruolo (la porta
 *                         inviolata di un attaccante). Non è un buco: è una
 *                         domanda che non si fa;
 *  - `ruolo_ignoto`     — non sappiamo il ruolo della riga, quindi non sappiamo
 *                         nemmeno QUALE sia il quarto asse. Si dichiara invece
 *                         di sceglierne uno.
 */
export type PagellaStatoAsse = "voto" | "assente" | "non_applicabile" | "ruolo_ignoto";

export interface PagellaAsseView {
  /** `null` solo nello stato `ruolo_ignoto`: non c'è un asse da nominare. */
  readonly asse: PagellaAsse | null;
  readonly etichetta: string;
  /** Il voto 0–10, o `null`. `null` non è zero e non va reso come zero. */
  readonly voto: number | null;
  readonly stato: PagellaStatoAsse;
  /** `true` solo per il quarto asse: cambia col ruolo, non è confrontabile fra ruoli. */
  readonly dipendeDalRuolo: boolean;
  /** `true` solo per «Consiglio Esperti»: parere della fonte, non una misura. */
  readonly parere: boolean;
}

/** L'etichetta del quarto asse quando il ruolo non è noto: nomina il buco. */
export const PAGELLA_QUARTO_ASSE_IGNOTO = "Quarto asse (dipende dal ruolo)";

/**
 * L'esito della verifica del totale. Cinque parole, e la differenza fra
 * `non_verificabile` e `divergente` è la ragione per cui questo tipo esiste:
 * la prima dice «non ho abbastanza numeri per accusare nessuno», la seconda
 * dice «i numeri ci sono e non tornano», cioè c'è un errore di estrazione da
 * andare a cercare.
 */
export type PagellaVerificaTotale =
  | "nessun_voto"
  | "senza_totale_dichiarato"
  | "non_verificabile"
  | "coerente"
  | "divergente";

export interface PagellaView {
  /** Sempre cinque, nell'ordine della fonte: il quarto è quello di ruolo. */
  readonly assi: readonly PagellaAsseView[];
  readonly votiPresenti: number;
  /** `true` con cinque voti su cinque: l'unico caso in cui il totale ha senso. */
  readonly completa: boolean;
  /** La somma dei cinque, o `null` quando la pagella non è completa. */
  readonly totaleRicalcolato: number | null;
  readonly totaleFonte: number | null;
  readonly verificaTotale: PagellaVerificaTotale;
  readonly asseAtteso: PagellaAsseDiRuolo | null;
  readonly asseDichiarato: PagellaAsseDiRuolo | null;
  /** La scheda porta l'asse di un ALTRO ruolo: il voto non si usa, si dichiara. */
  readonly asseIncoerente: boolean;
  /** Letterali, come nel resto del contratto: nessun numero di qui è direttivo. */
  readonly contributesToIndex: false;
  readonly directive: false;
}

function asseView(
  asse: PagellaAsse | null,
  voto: number | null,
  stato: PagellaStatoAsse,
  dipendeDalRuolo: boolean,
): PagellaAsseView {
  return {
    asse,
    etichetta: asse === null ? PAGELLA_QUARTO_ASSE_IGNOTO : PAGELLA_ETICHETTE[asse],
    voto,
    stato,
    dipendeDalRuolo,
    parere: asse === "pagella_consiglio",
  };
}

/**
 * La pagella VUOTA di una riga: cinque assi, nessun voto, il quarto già
 * nominato dal ruolo quando il ruolo si conosce.
 *
 * È lo stato normale di oggi — l'estrazione privata non esiste ancora — e non
 * è un caso degenere da nascondere: è ciò che l'app mostra su ogni giocatore,
 * quindi deve essere una vista completa e leggibile come le altre, non un
 * `null` che ogni chiamante deve ricordarsi di gestire.
 */
export function pagellaVuota(role: Role | null | undefined = null): PagellaView {
  return resolvePagella(undefined, role);
}

/**
 * Dal deposito alla vista, con il ruolo della riga di listone accanto.
 *
 * L'ORDINE DEGLI ASSI È QUELLO DELLA FONTE — Titolarità, Media voto, Salute,
 * [Porta inviolata | Bonus], Consiglio Esperti — e non un ordinamento nostro:
 * chi confronta lo schermo con la scheda deve poterli leggere nello stesso
 * ordine, e un ordine «per importanza» sarebbe una classifica che nessuno ha
 * autorizzato.
 */
export function resolvePagella(
  pagella: PagellaScheda | undefined,
  role: Role | null | undefined = null,
): PagellaView {
  const voti = pagella?.voti ?? {};
  const asseAtteso = pagellaAsseDelRuolo(role);
  const asseDichiarato = pagella === undefined ? null : pagellaAsseDichiarato(pagella);
  const asseIncoerente =
    asseAtteso !== null && asseDichiarato !== null && asseAtteso !== asseDichiarato;

  // Quale quarto asse si MOSTRA: quello che il ruolo chiede; se il ruolo non si
  // conosce, quello che la scheda dichiara; se nemmeno quello, nessuno — e lo
  // stato lo dice.
  const asseQuarto = asseAtteso ?? asseDichiarato;
  const votoQuarto =
    asseQuarto === null || asseIncoerente ? null : voti[asseQuarto] ?? null;
  const statoQuarto: PagellaStatoAsse =
    asseQuarto === null ? "ruolo_ignoto" : votoQuarto === null ? "assente" : "voto";

  const comune = (asse: PagellaAsseComune): PagellaAsseView => {
    const voto = voti[asse] ?? null;
    return asseView(asse, voto, voto === null ? "assente" : "voto", false);
  };

  const assi: readonly PagellaAsseView[] = [
    comune("pagella_titolarita"),
    comune("pagella_media_voto"),
    comune("pagella_salute"),
    asseView(asseQuarto, votoQuarto, statoQuarto, true),
    comune("pagella_consiglio"),
  ];

  const votiPresenti = assi.filter((a) => a.voto !== null).length;
  const completa = votiPresenti === PAGELLA_ASSI;
  const totaleRicalcolato = completa
    ? assi.reduce((sum, a) => sum + (a.voto ?? 0), 0)
    : null;
  const totaleFonte = pagella?.totaleFonte ?? null;

  return {
    assi,
    votiPresenti,
    completa,
    totaleRicalcolato,
    totaleFonte,
    verificaTotale: verificaTotale(totaleRicalcolato, totaleFonte, votiPresenti),
    asseAtteso,
    asseDichiarato,
    asseIncoerente,
    contributesToIndex: false,
    directive: false,
  };
}

/**
 * La regola di verifica, in un posto solo.
 *
 * Si legge dall'alto e il primo ramo che risponde vince:
 *  1. nessun voto e nessun totale dichiarato   -> `nessun_voto` (non c'è niente);
 *  2. il totale dichiarato manca               -> `senza_totale_dichiarato`
 *     (abbiamo dei voti ma nessuno con cui confrontarli: non è un difetto,
 *      è una scheda che non scrive il TOTALE);
 *  3. la pagella non è completa                -> `non_verificabile`
 *     (c'è un totale dichiarato, ma la somma di tre voti su cinque non lo
 *      contraddice né lo conferma: accusare qui sarebbe accusare a caso);
 *  4. somma == dichiarato                      -> `coerente`;
 *  5. altrimenti                               -> `divergente`, cioè la prova
 *     che almeno un numero è stato letto male.
 */
export function verificaTotale(
  totaleRicalcolato: number | null,
  totaleFonte: number | null,
  votiPresenti: number,
): PagellaVerificaTotale {
  if (votiPresenti === 0 && totaleFonte === null) return "nessun_voto";
  if (totaleFonte === null) return "senza_totale_dichiarato";
  if (totaleRicalcolato === null) return "non_verificabile";
  return totaleRicalcolato === totaleFonte ? "coerente" : "divergente";
}

// ── Come si scrive un voto che non c'è ───────────────────────────────────────
//
// DUE MARCATORI, non uno, perché sono due cose diverse e portano a due gesti
// diversi. `n/d` è già l'idioma di questo repository per un verdetto che manca
// (l'indice di appetibilità, src/ui/listone.ts): dice «questo numero esiste e
// non ce l'ho». `n.a.` dice «questo numero non esiste per questo giocatore» —
// la porta inviolata di un attaccante non è un buco da riempire, è una domanda
// che non si fa. Scriverli allo stesso modo manderebbe a cercare un dato che
// non c'è da nessuna parte.
//
// Nessuno dei due è mai `0`, e nessuno dei due è mai una cella vuota: uno zero
// è un giudizio durissimo della fonte, una cella vuota è un difetto di resa.

/** «Esiste per questo ruolo, ma non è stato estratto.» */
export const PAGELLA_ASSENTE = "n/d";
/** «Non esiste per questo ruolo.» */
export const PAGELLA_NON_APPLICABILE = "n.a.";
/** «Non sappiamo nemmeno quale sia l'asse, perché non sappiamo il ruolo.» */
export const PAGELLA_RUOLO_IGNOTO = "ruolo ignoto";

/**
 * Il voto come si scrive a schermo, dallo stato dell'asse. Unica ricetta per
 * il riquadro d'asta e per il listone: due copie divergerebbero, e
 * divergerebbero proprio sul significato dell'assenza.
 */
export function pagellaVotoText(voto: number | null, stato: PagellaStatoAsse): string {
  if (stato === "non_applicabile") return PAGELLA_NON_APPLICABILE;
  if (stato === "ruolo_ignoto") return PAGELLA_RUOLO_IGNOTO;
  return voto === null ? PAGELLA_ASSENTE : `${voto}/${PAGELLA_VOTO_MAX}`;
}

/** `true` quando la pagella dice almeno una cosa — un voto o un totale dichiarato. */
export function pagellaHasContent(pagella: PagellaScheda): boolean {
  return Object.values(pagella.voti).some((v) => v !== undefined) || pagella.totaleFonte !== undefined;
}
