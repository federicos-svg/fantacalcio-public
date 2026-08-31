// VALORI DICHIARATI DI OWNER — l'«ingrediente 2» della regola dei tre
// ingredienti (docs/DECISIONS.md §D9), strato 3 di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §3 e riga 3 di §8. Puro,
// deterministico, engine-only.
//
// COSA C'È QUI: il listino dei valori che OWNER DICHIARA, validato con la
// stessa postura fail-closed delle ancore (anchors.ts), e il profilo di
// rischio con i suoi α già preregistrati nel piano canonico.
//
// COSA NON C'È, di proposito:
//  - nessun calcolo che PRODUCA un valore. Un valore non si deriva qui da
//    statistiche, indici o modelli: entra dichiarato da Owner e basta. Il campo
//    FTM *model-derived* resta gated (`docs/NO_GO.md` §Prodotto); ciò che
//    questo modulo alimenta è l'altra riga della matrice UI
//    (`docs/AUCTION_2026_EXECUTION_PLAN.md` §3): «`fair_to_me`, `target_band`,
//    `stretch_cap`, STOP **derivati dai valori dichiarati di Owner** →
//    visibili, nessun receipt»;
//  - nessun «prezzo equo» di mercato: quello resta vietato finché non esistono
//    ≥2 post-aste pulite (`docs/NO_GO.md` §Prodotto). Un valore-per-me
//    dichiarato non è un prezzo di mercato predetto: dice quanto vale QUEL
//    giocatore PER OWNER, non quanto lo pagherà il tavolo;
//  - nessun default. Un giocatore senza valore dichiarato resta senza valore
//    dichiarato, e chi lo consuma degrada a `no_target` (callScreen.ts) invece
//    di riempire il buco con una media di ruolo o con la Qt.A.
//
// PRIVACY / PROVENIENZA DEL DATO: i valori reali di Owner sono un input
// privato, come i profili avversario (packages/opponent-profiles). Qui vive
// solo il CONTRATTO — tipo, validazione, indice; il dato arriva dal chiamante
// e non viene mai versionato nel repo. Ogni fixture di test è sintetica.

/**
 * L'etichetta di provenienza che il design (§4.1) e la matrice UI
 * (`docs/AUCTION_2026_EXECUTION_PLAN.md` §3) impongono accanto a ogni numero
 * costruito su questi valori. Vive qui, accanto alla sorgente, così nessun
 * consumatore può mostrare i numeri e inventare (o perdere) l'etichetta che
 * li qualifica — stesso principio di `APPEAL_INDEX_QUALITY_LABELS`.
 */
export const DECLARED_VALUE_PROVENANCE = "derivato dai tuoi valori";

/**
 * Le scelte che il MOTORE ha dovuto fare e che **Owner non ha ancora
 * ratificato**.
 *
 * Perché esiste questo vocabolario. §D9 ammette tre ingredienti: fatto
 * misurato, input dichiarato di Owner, aritmetica dichiarata sui due. Una
 * soglia che decide *cosa Owner vede* (quale badge si accende, quale etichetta
 * di rimpianto compare) non è nessuno dei tre finché lui non l'ha dichiarata:
 * al massimo è una proposta del motore, scritta in chiaro. Le tre qui sotto
 * sono state trovate da una review avversariale e **non sono registrate in
 * nessun documento canonico** — `grep` su `docs/` a vuoto.
 *
 * Cosa NON si fa, di proposito: non si rimuove il calcolo. Toglierlo sarebbe
 * ridurre valore, e la soglia servirà comunque; quello che si toglie è la sua
 * pretesa di essere un giudizio chiuso. Ogni giudizio che ne dipende porta
 * accanto `RatificationStatus`, così un renderer riceve insieme il numero e
 * il fatto che nessuno l'ha ancora firmato.
 */
export type UnratifiedChoiceId =
  | "OPPORTUNITY_MIN_QUALITY" // solo `alta` promuove a OCCASIONE: soglia scelta dal motore
  | "CLIFF_GAP_RATIO" // 0,30 come confine del cliff, qui promosso a etichetta mostrata
  | "REGRET_BAND_LEVELS" // basso/medio/alto: una fascia a tre livelli scelta dal motore
  | "V_WITHOUT_EQUALS_OPPORTUNITY_COST" // l'identificazione di §4.2 nella catena FTM
  | "ANCHOR_QUALIFICATION_REQUIRES_ROLE_SAMPLE" // quanta misura serve perché un'ancora qualifichi
  | "WIDTH_GATE_MIDPOINT_DIMENSION_OFF" // §4.2 ha due dimensioni, qui ne chiude una
  // ── Le sei letture della derivazione del valore assoluto (absoluteValue.ts) ──
  | "ABSOLUTE_BASE_UNIFORM_PER_SLOT" // il budget del ruolo diviso in parti uguali fra i suoi slot
  | "ABSOLUTE_BASE_EXCLUDES_FONDO" // oltre l'ultima fascia non c'è slot, quindi non c'è base
  | "CONCORRENZA_SCALE_SYMMETRIC" // +1/0/−1: passo uguale sopra e sotto la parola di mezzo
  | "CONCORRENZA_ONLY_TITOLARITA" // ballottaggio e gerarchia restano fuori dal numero
  | "COPPE_BASELINE_IS_ABSENCE" // «non gioca in Europa» = 0, non −1
  | "PAGELLA_POSITION_IS_TOTAL_OVER_MAX" // rapporto sul fondo scala, non scarto dal punto medio
  // ── Le due letture del sottoblocco «PER ME» (src/perMeCandidates.ts) ──────
  | "PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES" // chi decide a parità di surplus, e senza surplus
  | "PER_ME_REQUIRES_COMPLETE_ROLE_PLAN" // senza piano completo il sottoblocco tace
  // ── Le otto letture dell'indice relativo (relativeIndex.ts). Pico ha deciso
  //    la FORMA il 2026-08-24 («un punteggio da 0 a 100»); qui restano aperte le
  //    letture che quella decisione NON nomina. `RELATIVE_NUMBER_IS_A_POSITION`
  //    è uscita dal vocabolario insieme alla forma che dichiarava.
  | "RELATIVE_SCORE_IS_SHARE_OF_FREE_RANKED" // il riscalamento è la quota degli altri liberi ordinati che precede
  | "RELATIVE_DENOMINATOR_IS_FREE_RANKED" // il denominatore conta i liberi ORDINATI, non i liberi
  | "RELATIVE_ONLY_FREE_HAS_NO_SCORE" // con un solo libero ordinato la quota è 0/0: `n/d`, non 0 e non 100
  | "RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING" // il numero è esatto; è la resa a poter creare pareggi
  | "RELATIVE_TIES_BY_DECLARED_ORDER" // «superiore a lui» letto sull'ordine dichiarato, pareggi compresi
  | "RELATIVE_TAKEN_INCLUDES_CONFIRMED" // riconfermato = non prendibile, come per l'occupazione delle fasce
  | "RELATIVE_ORDER_INCLUDES_FONDO" // anche chi è oltre l'ultima fascia entra nel conto
  | "RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER" // «quanti ne ho presi io» resta accanto, non dentro
  // ── Le quattro letture del valore in crediti (creditValue.ts) ─────────────
  | "CREDIT_VALUE_REMAINDER_TIES_BY_VORP" // chi prende l'unità di resto a parità di resto
  | "CREDIT_VALUE_BAND_CAP_IS_FLOORED_P90" // il tetto in interi è `floor(P90)`, mai sotto il pavimento
  | "CREDIT_VALUE_CAP_DOES_NOT_REDISTRIBUTE" // i crediti che il tetto libera non tornano agli altri
  | "CREDIT_VALUE_DECLARED_NOT_ROUNDED"; // il valore dichiarato si riporta com'è, non si arrotonda

/** Perché ciascuna scelta è aperta. Testo macchina-leggibile, non prosa libera. */
export const UNRATIFIED_CHOICES: Readonly<Record<UnratifiedChoiceId, string>> =
  {
    OPPORTUNITY_MIN_QUALITY:
      "soglia del gate occasioni non registrata in docs/: il motore decide che «media» non basta",
    CLIFF_GAP_RATIO:
      "confine del cliff non registrato in docs/: un credito di differenza ribalta l'etichetta mostrata",
    REGRET_BAND_LEVELS:
      "fascia a tre livelli scelta dal motore, mentre livePlan/cliff rifiutano le fasce citando §D9",
    V_WITHOUT_EQUALS_OPPORTUNITY_COST:
      "§4.2 tratta V(WITHOUT) e opportunityCost come grandezze distinte: identificarle è una lettura del motore",
    ANCHOR_QUALIFICATION_REQUIRES_ROLE_SAMPLE:
      "richiedere il campione DEL RUOLO per qualificare un'ancora è la lettura stretta: nessun documento la fissa",
    WIDTH_GATE_MIDPOINT_DIMENSION_OFF:
      "§4.2 impone due dimensioni sulla larghezza: qui chiude solo il budget residuo, il midpoint è misurato e inattivo",
    ABSOLUTE_BASE_UNIFORM_PER_SLOT:
      "ripartire il budget del ruolo in parti UGUALI fra i suoi slot è l'unica divisione senza pesi dichiarati, ma nessun documento la fissa",
    ABSOLUTE_BASE_EXCLUDES_FONDO:
      "chi sta oltre l'ultima fascia non occupa uno slot della ripartizione: qui non ha base, e nessun documento dice che debba averne una",
    CONCORRENZA_SCALE_SYMMETRIC:
      "il vocabolario ordina tre parole, non dichiara che il passo sopra e sotto quella di mezzo sia lo stesso",
    CONCORRENZA_ONLY_TITOLARITA:
      "ballottaggio e gerarchia sono fatti dichiarati dalla scheda, ma portarli nella stessa unità della titolarità richiederebbe una conversione che nessuno ha dichiarato",
    COPPE_BASELINE_IS_ABSENCE:
      "«non gioca in Europa» è trattato come linea di base (0) e non come l'opposto di «ci gioca»: è una lettura, non il dato",
    PAGELLA_POSITION_IS_TOTAL_OVER_MAX:
      "il totale entra come rapporto sul fondo scala della fonte: uno scarto dal punto medio sarebbe altrettanto scrivibile e nessuno ha scelto",
    PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES:
      "l'ordine «piano prima, surplus poi» viene dalla decisione di Pico del 2026-08-25 (in sessione: il piano filtra, il surplus ordina); che a parità di surplus — e per le righe senza valore dichiarato, dove un surplus non esiste — decida la posizione nell'ordine di appetibilità del ruolo è invece una lettura del motore, e nessun documento assegna quel posto a quel criterio",
    PER_ME_REQUIRES_COMPLETE_ROLE_PLAN:
      "«dentro il mio piano» è il primo criterio dell'ordine: qui senza piano completo il sottoblocco tace invece di ordinare con un criterio in meno, e nessun documento sceglie fra le due",
    RELATIVE_SCORE_IS_SHARE_OF_FREE_RANKED:
      "Pico ha deciso la scala (0-100) e non la curva: qui il riscalamento è scritto come QUOTA degli altri liberi ordinati che il chiamato precede, cioè l'unica forma senza parametri liberi (riscalare linearmente un rango coincide con il percent rank inclusivo). La dimostrazione è nell'intestazione del modulo, ma la lettura resta nostra",
    RELATIVE_DENOMINATOR_IS_FREE_RANKED:
      "il denominatore conta i liberi ORDINATI e non i liberi: un giocatore senza verdetto non sta nell'ordine e non è mai stato confrontato col chiamato, ma nessun documento fissa quale delle due popolazioni accompagni il numero",
    RELATIVE_ONLY_FREE_HAS_NO_SCORE:
      "con un solo libero ordinato nel ruolo la quota sarebbe 0/0 e il numero non esiste: si dichiara `n/d` col motivo invece di scegliere 0 o 100, che la stessa regola imporrebbe entrambi. Nessuno ha firmato questa chiusura",
    RELATIVE_SCORE_TIES_ONLY_FROM_RENDERING:
      "il punteggio esce esatto e non viene arrotondato dal motore; la resa ne stampa un decimale, e questo può far mostrare lo stesso numero a due giocatori distinti oltre i 1001 liberi ordinati nello stesso ruolo — misurato e pinnato, non promesso, ma la regola di resa non è di Pico",
    RELATIVE_TIES_BY_DECLARED_ORDER:
      "«indice superiore a lui» è letto sull'ordine dichiarato (pareggi rotti da APPEAL_ORDER_TIE_BREAK) e non sul confronto nudo dei punteggi: le due letture divergono sui pari punteggio",
    RELATIVE_TAKEN_INCLUDES_CONFIRMED:
      "un giocatore riconfermato conta fra i NON prendibili, come già in TierOccupancy.freeCount: nessun documento lo fissa per questo numero",
    RELATIVE_ORDER_INCLUDES_FONDO:
      "chi sta oltre l'ultima fascia entra comunque nel conto dei liberi sopra di lui, al contrario di quanto fa la base del valore assoluto: la differenza è una lettura, non il dato",
    RELATIVE_OWNERSHIP_BESIDE_THE_NUMBER:
      "«quanti ne ho presi io e quanti gli avversari» restano fatti misurati ACCANTO al punteggio: farli entrare nel numero richiederebbe un coefficiente che nessuno ha dichiarato",
    CREDIT_VALUE_REMAINDER_TIES_BY_VORP:
      "il metodo dei resti maggiori è prescritto (GEN §D.11), ma chi prende l'unità di resto quando due resti sono uguali non lo dice nessun documento: qui decide il VORP più alto e poi la chiave di listone, che è un ordine totale e deterministico ma resta una scelta del motore",
    CREDIT_VALUE_BAND_CAP_IS_FLOORED_P90:
      "il tetto della fascia è una P90 misurata, cioè un numero con i decimali, e i crediti sono interi: si taglia a `floor(P90)` perché un tetto che arrotonda per eccesso lascia passare numeri sopra la P90, e mai sotto COST_FLOOR perché un credito è il minimo che il regolamento fa pagare. Nessuno ha firmato nessuna delle due letture",
    CREDIT_VALUE_CAP_DOES_NOT_REDISTRIBUTE:
      "quando il tetto della fascia abbassa un valore, i crediti che libera NON vengono ridistribuiti agli altri: la somma ripartita scende sotto B_res e lo si dichiara. Ridistribuirli sarebbe un secondo giro di ripartizione che il DTI non descrive",
    CREDIT_VALUE_DECLARED_NOT_ROUNDED:
      "il DTI parla di crediti interi e il valore dichiarato di Pico può non esserlo: qui si riporta com'è, perché arrotondare una dichiarazione significa modificarla. Nessuno ha scelto fra le due",
  };

/**
 * Lo stato di ratifica che accompagna un giudizio costruito su almeno una
 * scelta aperta. `ratified` è il **letterale** `false`, non `boolean`: finché
 * la lista non è vuota nessun consumatore può ricevere un `true`, e il giorno
 * in cui Owner ratifica il cambio di tipo è un atto deliberato che passa da una
 * review — non un flag che qualcuno gira.
 */
export interface RatificationStatus {
  readonly ratified: false;
  /** Le scelte aperte su cui poggia QUESTO giudizio, in ordine dichiarato. */
  readonly unratifiedChoices: readonly UnratifiedChoiceId[];
}

/**
 * Il valore che Owner dichiara per un giocatore, in crediti.
 *
 * Il campo NON si chiama `value`: `value` è il nome dell'output direttivo
 * gated del progetto (`docs/NO_GO.md`), e chiamarlo così qui renderebbe
 * indistinguibili in lettura due oggetti che le norme trattano in modo
 * opposto. `declaredValue` porta la propria provenienza nel nome.
 */
export interface DeclaredPlayerValue {
  readonly playerId: string;
  /** Crediti. Dichiarato da Owner, mai derivato, mai imputato. */
  readonly declaredValue: number;
  /** ISO `YYYY-MM-DD` della dichiarazione, quando il chiamante la porta. */
  readonly declaredAt?: string;
}

export type DeclaredValueViolation =
  | "player-id-empty" // playerId vuoto: nessuna identità a cui agganciare il valore
  | "duplicate-player" // stesso playerId due volte: quale dei due sarebbe «il» valore?
  | "declared-value-invalid"; // non finito o negativo (NaN/Infinity/-3)

export interface DeclaredValueIssue {
  readonly index: number;
  readonly playerId: string;
  readonly violation: DeclaredValueViolation;
}

export interface DeclaredValueValidationResult {
  readonly ok: boolean;
  readonly issues: readonly DeclaredValueIssue[];
}

/**
 * Validazione fail-closed del listino di valori, stesso contratto di
 * `validateAnchors`: pura, non lancia mai, riporta OGNI violazione di OGNI
 * riga (non solo la prima).
 *
 * `declared-value-invalid` copre esplicitamente NaN: ogni confronto con NaN è
 * falso, quindi un valore NaN attraverserebbe in silenzio ogni soglia della
 * catena decisionale e produrrebbe un «prendilo fino a NaN» mostrato come
 * numero.
 */
export function validateDeclaredValues(
  values: readonly DeclaredPlayerValue[],
): DeclaredValueValidationResult {
  const issues: DeclaredValueIssue[] = [];
  const seen = new Set<string>();

  values.forEach((v, index) => {
    const add = (violation: DeclaredValueViolation): void => {
      issues.push({ index, playerId: v.playerId, violation });
    };

    if (v.playerId.length === 0) add("player-id-empty");
    else if (seen.has(v.playerId)) add("duplicate-player");
    else seen.add(v.playerId);

    if (!Number.isFinite(v.declaredValue) || v.declaredValue < 0)
      add("declared-value-invalid");
  });

  return { ok: issues.length === 0, issues };
}

/**
 * Il listino dei valori dichiarati indicizzato per playerId — costruito una
 * volta e riusato da tutto lo strato 3 (piano vivo, radar occasioni,
 * schermata chiamata), così ogni vista legge lo STESSO valore per lo stesso
 * giocatore.
 */
export interface DeclaredValueBook {
  readonly all: readonly DeclaredPlayerValue[];
  readonly byPlayerId: ReadonlyMap<string, DeclaredPlayerValue>;
}

/**
 * Costruisce il `DeclaredValueBook`, **lanciando** su un listino invalido —
 * stessa postura di `anchorBook`: da un listino di valori rotto non si deve
 * poter derivare nessuna soglia decisionale.
 */
export function declaredValueBook(
  values: readonly DeclaredPlayerValue[],
): DeclaredValueBook {
  const validation = validateDeclaredValues(values);
  if (!validation.ok) {
    throw new Error(
      `invalid declared values: ${validation.issues
        .map((i) => `${i.index}/${i.playerId}:${i.violation}`)
        .join(", ")}`,
    );
  }
  const byPlayerId = new Map<string, DeclaredPlayerValue>();
  for (const v of values) byPlayerId.set(v.playerId, v);
  return { all: values.slice(), byPlayerId };
}

/**
 * Il valore dichiarato per un giocatore, o `null` se Owner non l'ha dichiarato.
 * `null` esplicito e mai 0: «vale zero per me» e «non l'ho ancora valutato»
 * sono due fatti diversi, e solo il primo è una dichiarazione.
 */
export function declaredValueOf(
  playerId: string,
  book: DeclaredValueBook,
): number | null {
  const entry = book.byPlayerId.get(playerId);
  return entry === undefined ? null : entry.declaredValue;
}

/**
 * Il profilo di rischio dichiarato da Owner. Vocabolario chiuso, non prosa
 * libera: è la chiave di `ALPHA_BY_PROFILE`.
 */
export const VALUE_PROFILES = ["prudente", "media", "aggressiva"] as const;

export type ValueProfile = (typeof VALUE_PROFILES)[number];

/**
 * Gli α del contratto FTM, **preregistrati** in
 * `docs/AUCTION_2026_EXECUTION_PLAN.md` §4.2 (`alphaFor(Prudente) = 0.85`,
 * `alphaFor(Media) = 1.00`, `alphaFor(Aggressiva) = 1.15`).
 *
 * Sono copiati da lì, non scelti qui: è la differenza fra un parametro
 * dichiarato in un documento canonico e un peso scelto dal sistema (vietato,
 * §D9). Esportati perché chi mostra il numero possa mostrare anche l'α che lo
 * ha prodotto.
 */
export const ALPHA_BY_PROFILE: Readonly<Record<ValueProfile, number>> = {
  prudente: 0.85,
  media: 1.0,
  aggressiva: 1.15,
};
