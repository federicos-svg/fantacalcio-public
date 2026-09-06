// I GUASTI DEL DEPOSITO — il vocabolario condiviso fra chi serve la lettura
// della lega e chi la legge, e la frase che ciascuno di essi vale a schermo.
//
// PERCHÉ QUESTO VIVE NEL CONTRATTO E NON NELL'ADATTATORE. Un codice di guasto
// non è un dettaglio di trasporto: è una cosa che due programmi diversi, in due
// repository diversi, devono chiamare con lo stesso nome. Esattamente come la
// forma del deposito. Chi scrive il deposito emette questi codici, chi lo legge
// li riconosce, e il giorno in cui l'insieme cambia si cambia **qui**, in un
// posto solo, invece che in un `switch` sparso per la schermata.
//
// QUI NON C'È NIENTE DI PRIVATO, ed è deliberato: nessun host, nessun percorso,
// nessuna credenziale, nessun nome di piattaforma e nessun identificativo. Un
// codice è una parola inglese fissa; la frase che gli sta accanto descrive un
// guasto in italiano corrente, con le parole che userebbe chi non ha mai visto
// il sistema («l'archivio dove la lettura viene depositata», mai il nome di
// quell'archivio).
//
// L'INSIEME È CHIUSO, E QUESTA È LA PARTE CHE CONTA. Il codice arriva dentro il
// corpo di una risposta HTTP, cioè da fuori, cioè da un testo di cui nessuno
// qui può garantire niente. Un corpo può essere malformato, enorme, o scritto
// apposta per finire a schermo. Quindi non si legge «il codice» e lo si stampa:
// si guarda se il testo ricevuto **è uno dei nomi che questo file dichiara**, e
// se non lo è non se ne fa niente. La funzione che riconosce restituisce sempre
// il letterale preso da questo elenco, mai la stringa arrivata: ciò che finisce
// a schermo è testo di questo repository, sempre, anche quando le due stringhe
// sono uguali carattere per carattere.
//
// E UN CODICE CHE NON SI RICONOSCE NON È UN'EMERGENZA: è semplicemente un
// codice che non si riconosce, e chi legge riceve ciò che riceveva prima —
// nulla di peggio. La regola di tutta questa schermata vale anche qui: **ciò
// che non si è capito si dichiara, non si arrotonda**.

/**
 * TUTTI i codici che la porta di lettura della lega può riferire, e nient'altro.
 *
 * L'ordine è quello del percorso che la lettura compie: prima le due condizioni
 * in cui non può nemmeno partire, poi il caso in cui non si arriva nemmeno a
 * parlare col servizio, poi i guasti nel raggiungere e nel prendere il
 * deposito, poi quelli di ciò che si è preso, e in fondo i due che non portano
 * nessuna diagnosi.
 *
 * MISURATO, NON SUPPOSTO: l'elenco viene dall'albero **servito in produzione**
 * dal layer privato — non da una copia di lavoro, che può essere indietro. La
 * prova `depositFault.test.ts` dichiara il ref e la revisione su cui è stato
 * letto, ed è lì che una divergenza futura si vede.
 */
export const DEPOSIT_FAULT_CODES = [
  "configuration_missing",
  "configuration_invalid",
  "deposit_unreachable",
  "upstream_auth_failed",
  "deposit_lookup_failed",
  "deposit_not_found",
  "deposit_ambiguous",
  "deposit_download_failed",
  "deposit_too_large",
  "deposit_invalid_payload",
  "deposit_unavailable",
  "method_not_allowed",
] as const;

/** Uno dei codici dell'elenco chiuso qui sopra. Mai una stringa qualunque. */
export type DepositFaultCode = (typeof DEPOSIT_FAULT_CODES)[number];

/**
 * CHE COSA È SUCCESSO, in italiano, per chi non conosce il sistema.
 *
 * Ogni frase dice **la cosa** — non il codice a parole — e dove è utile dice
 * anche da che parte sta il rimedio, perché è l'unica ragione per cui una
 * persona legge un avviso di guasto: sapere se tocca a lei, e che cosa.
 *
 * Nessuna frase nomina la piattaforma, il servizio o la cartella: «l'archivio
 * dove la lettura della lega viene depositata» è tutto ciò che il core pubblico
 * sa, ed è tutto ciò che serve per capire il guasto.
 */
const FRASI: Readonly<Record<DepositFaultCode, string>> = {
  configuration_missing:
    "Il sito non ha ancora tutto quello che gli serve per raggiungere l'archivio dove la lettura della lega viene depositata: manca un'impostazione, e finché non viene inserita la lettura non può nemmeno partire",
  configuration_invalid:
    "Le impostazioni per raggiungere l'archivio della lega ci sono, ma una di esse non ha la forma giusta: va corretta, non aggiunta",
  // «NON HA RISPOSTO» E «HA DETTO DI NO» SONO DUE COSE DIVERSE, e questa frase
  // esiste per non confonderle: un rifiuto si corregge nei permessi, un
  // silenzio si riprova e basta. Chi le legge uguali perde mezz'ora.
  deposit_unreachable:
    "Il servizio che tiene l'archivio non ha risposto affatto: non è un rifiuto, è un silenzio — non c'è stata nessuna risposta da leggere — e di solito basta riprovare fra poco",
  upstream_auth_failed:
    "L'archivio dove la lettura della lega viene depositata ha rifiutato l'accesso: il permesso è scaduto o è stato tolto, e va rinnovato",
  deposit_lookup_failed:
    "Non si è riusciti a cercare la lettura dentro l'archivio: l'archivio ha risposto in un modo che non permette nemmeno di sapere se il file ci sia",
  deposit_not_found:
    "Nell'archivio non c'è nessuna lettura della lega: o non è mai stata scritta, oppure è stata scritta in una cartella diversa da quella in cui si sta guardando",
  deposit_ambiguous:
    "Nell'archivio ci sono più letture della lega e non si sa quale sia quella buona: finché ce n'è più d'una non se ne prende una a caso",
  deposit_download_failed:
    "La lettura della lega è stata trovata nell'archivio, ma non si è riusciti a scaricarla",
  deposit_too_large:
    "La lettura trovata nell'archivio è troppo grande per essere aperta senza rischiare di far cadere il sito, quindi non è stata aperta",
  deposit_invalid_payload:
    "La lettura è arrivata dall'archivio, ma il suo contenuto non ha la forma attesa: non se ne è potuta ricavare né la rosa né la formazione",
  deposit_unavailable:
    "La lettura della lega non è disponibile e non si è riusciti a stabilire perché: qui non c'è nemmeno una diagnosi da riferire",
  method_not_allowed:
    "La lettura della lega è stata chiesta in un modo che quella porta non accetta: è un difetto del sito, non della lega",
};

/**
 * Il tetto sul testo che si guarda per cercarci dentro un codice.
 *
 * Una risposta di guasto legittima è lunga una quarantina di caratteri —
 * `{"error":"deposit_not_found"}` e poco altro. Tutto ciò che è
 * spropositatamente più lungo non è una risposta di guasto: è un'altra cosa,
 * e la si lascia stare invece di darla in pasto a un parser. Il tetto è
 * generoso di due ordini di grandezza rispetto al caso vero, quindi non può
 * mordere una risposta onesta, e resta abbastanza basso da rendere il lavoro
 * trascurabile qualunque cosa arrivi.
 */
export const DEPOSIT_FAULT_BODY_MAX_CHARS = 4096;

/**
 * `true` soltanto se il valore è ESATTAMENTE uno dei codici dichiarati sopra.
 * Qualunque altra cosa — un numero, un oggetto, una stringa che somiglia a un
 * codice, una stringa lunghissima — è `false`.
 */
export function isDepositFaultCode(valore: unknown): valore is DepositFaultCode {
  return (
    typeof valore === "string" &&
    (DEPOSIT_FAULT_CODES as readonly string[]).includes(valore)
  );
}

/** La frase italiana di un codice noto. Non esiste per un codice non noto. */
export function depositFaultSentence(code: DepositFaultCode): string {
  return FRASI[code];
}

/**
 * IL CODICE DENTRO IL CORPO DI UNA RISPOSTA, se e solo se è uno dei noti.
 *
 * Funzione pura: entra un testo, esce un codice o `null`. Nessuna eccezione ne
 * esce — un corpo che non è JSON, che è JSON ma non un oggetto, che è un
 * oggetto senza `error`, o che porta un `error` che non è dei nostri valgono
 * tutti `null`, cioè «non lo so», cioè il comportamento di prima.
 *
 * Il valore restituito è il letterale di `DEPOSIT_FAULT_CODES`, non la stringa
 * arrivata: nessun testo di provenienza esterna esce da questa funzione.
 */
export function depositFaultFromBody(body: string | null | undefined): DepositFaultCode | null {
  if (typeof body !== "string") return null;
  if (body.length === 0 || body.length > DEPOSIT_FAULT_BODY_MAX_CHARS) return null;
  let letto: unknown;
  try {
    letto = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof letto !== "object" || letto === null || Array.isArray(letto)) return null;
  const dichiarato = (letto as Record<string, unknown>)["error"];
  if (!isDepositFaultCode(dichiarato)) return null;
  // Si restituisce IL NOSTRO letterale, non quello arrivato. Le due stringhe
  // sono uguali, e la differenza conta lo stesso: ciò che prosegue verso la
  // pagina proviene sempre da questo file.
  return DEPOSIT_FAULT_CODES.find((noto) => noto === dichiarato) ?? null;
}
