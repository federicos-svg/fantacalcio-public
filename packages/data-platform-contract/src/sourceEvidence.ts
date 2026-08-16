import type { DataSourceId } from "./types.js";

/**
 * Evidence pointers for each registered source — the documents that justify
 * why a source is in the registry with the authority it claims.
 *
 * PERCHE' VIVONO IN UN FILE A PARTE E NON DENTRO sourceRegistry.ts.
 *
 * Un riferimento di evidenza e' *provenienza*, non semantica del contratto:
 * dice dove sta scritto perche' una fonte e' autorizzata, non come i suoi
 * dati vanno interpretati. E' anche l'unico punto in cui il core pubblico e
 * il prodotto privato hanno un motivo legittimo di divergere — nel privato
 * questi puntatori sono i percorsi reali dei documenti, qui sono token
 * opachi, perche' il titolo di un documento privato e l'endpoint di una
 * fonte non appartengono a un albero pubblico.
 *
 * Tenerli inline nel registro significherebbe che quel file — codice di
 * produzione a tutti gli effetti — deve esistere in due versioni diverse nei
 * due repository. E' esattamente la biforcazione che il modello di confine
 * vieta: una divergenza di DATI non deve mai diventare un fork della LOGICA.
 * Isolandoli qui, `sourceRegistry.ts` resta byte-identico fra i due
 * repository e questo file diventa l'unica cucitura dichiarata, sostituibile
 * dal privato senza toccare una riga di codice pubblico.
 *
 * Conseguenza voluta su `dataPlatformContractHash()`: l'impronta del
 * contratto NON copre questi valori (vedi contract.ts). Due repository con lo
 * stesso contratto e bibliografie diverse devono produrre la stessa impronta,
 * altrimenti l'impronta smette di misurare il contratto e inizia a misurare
 * la redazione. La presenza di almeno un riferimento per fonte resta
 * obbligatoria ed e' verificata da `validateSourceRegistry()`.
 */
export const SOURCE_EVIDENCE_REFS: Readonly<Record<DataSourceId, readonly string[]>> = {
  fantacalcio_votes: ["private-registry:evidence:01", "private-registry:evidence:02"],
  fantacalcio_listone: ["private-registry:evidence:03", "private-registry:evidence:04"],
  league_manual: ["private-registry:evidence:05", "private-registry:evidence:06"],
  api_football: ["private-registry:evidence:07", "private-registry:evidence:08"],
  wikidata: ["private-registry:evidence:11", "private-registry:evidence:12"],
  gruppo_esperti_topic_unico: [
    "private-registry:evidence:13",
    "private-registry:gruppo-esperti-topic-unico-endpoint",
  ],
  // Questi due non sono redatti: puntano a file del core pubblico, quindi
  // sono identici nei due repository.
  auction_event_log: ["schemas/auction_event.schema.json", "packages/engine/src/reduce.ts"],
} as const;
