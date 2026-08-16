// I DUE TETTI DI SPESA — un nome solo per grandezza, in un posto solo.
//
// Sullo schermo dell'asta convivono due tetti diversi, calcolati da due
// funzioni diverse del motore, e fino a qui si chiamavano tutti e due «max»:
//
//  - maxSafe() (packages/engine/src/auction.ts):
//      budget_residuo − riserva minima per TUTTI gli altri slot obbligatori.
//    È quanto una squadra può mettere su UNA sola offerta, adesso.
//    Nome: MAX_BID_LABEL.
//
//  - budgetPlan().perRole[r].maxAllocatable (packages/engine/src/budget.ts):
//      budget_residuo − riserva minima per gli slot obbligatori DEGLI ALTRI
//      ruoli. È quanto l'intero reparto di quel ruolo può ancora assorbire,
//    su tutti i suoi slot messi insieme. Nome: ROLE_MAX_LABEL.
//
// PERCHÉ SERVE UN NOME DIVERSO. Le due grandezze coincidono soltanto quando al
// reparto resta UN solo slot; con due o più slot liberi la seconda è
// strutturalmente più grande della prima, e la differenza è esattamente
// hardReserve(slot liberi del reparto − 1). A tavolo fresco vale pochi crediti
// e non si nota (473 contro 475/481/481/479, dentro la stessa banda alta
// 129 px); a metà asta i due numeri si separano, in silenzio. Una sigla sola
// per due grandezze le fa leggere come la stessa cifra proprio nel momento in
// cui smettono di esserlo — e leggere il tetto di un reparto come il tetto di
// una singola offerta significa offrire cifre che rendono la rosa incompletabile.
//
// REGOLA. Ogni superficie che mostra una delle due usa QUESTE stringhe, mai
// una formulazione propria: due nomi per due grandezze, non cinque per due.
// src/ui/maxLabels.test.ts vigila che restino distinte, che nessuna sia
// contenuta nell'altra e che nessun componente stampi più la sigla nuda «max».
//
// L'ELENCO DELLE ECCEZIONI È CHIUSO. Fino a qui questo commento dichiarava due
// superfici ancora fuori dal modulo, «da allineare quando quei file si
// toccano»: la metrica «Max bid sicuro» della fascia critica e la nota «max per
// completare la rosa di X» sotto «Prezzo da pagare». #333 §A le contava come
// due delle tre formulazioni per una cifra sola. Quei file sono stati toccati
// (issue #331 punti 2-3, riordino della schermata d'asta) e l'eccezione è
// rientrata: entrambe leggono adesso le costanti qui sotto, e src/ui/
// maxLabels.test.ts asserisce sul SORGENTE di src/main.ts che nessuna delle due
// formulazioni scritte a mano possa tornare. Non resta nessuna eccezione da
// allineare: chi aggiunge una superficie importa da qui.
//
// La terza voce di quell'elenco era la sigla nuda «max» della riga competitor
// di src/ui/liveFacts.ts. Non è più da allineare perché non esiste più: con
// #331 il pannello AVVERSARI ha smesso di mostrare la raggiungibilità per
// vincolo duro, e con lei quella riga. Il max bid delle otto squadre resta
// sulla stessa schermata, nella striscia WAR BOARD (MINI), dove porta già
// MAX_BID_LABEL.

/** Il tetto di UNA offerta (maxSafe). Forma breve, per micro-etichette. */
export const MAX_BID_LABEL = "max bid";

/**
 * Lo stesso nome in forma estesa, per un titolo di metrica che ha spazio: la
 * fascia critica lo usa già così («Max bid sicuro»). Stesso nome, un
 * aggettivo in più — non un secondo nome.
 */
export const MAX_BID_LABEL_LONG = "max bid sicuro";

/**
 * La stessa forma estesa con l'iniziale maiuscola, per le superfici che la
 * usano come TITOLO di riga (la metrica della fascia critica, la nota sotto
 * «Prezzo da pagare»). È DERIVATA, non riscritta: una seconda stringa a mano
 * qui sarebbe esattamente il difetto che questo modulo esiste per impedire —
 * cambiando il nome, la maiuscola lo segue da sé.
 */
export const MAX_BID_LABEL_LONG_SENTENCE =
  MAX_BID_LABEL_LONG.charAt(0).toUpperCase() + MAX_BID_LABEL_LONG.slice(1);

/** Che cosa è, in parole, per le note sotto i pannelli. */
export const MAX_BID_GLOSS =
  "quanto quella squadra può mettere su una sola offerta, non su tutto il reparto (budget − minimo necessario per gli slot obbligatori che restano)";

/** Il tetto dell'INTERO reparto di un ruolo (maxAllocatable). */
export const ROLE_MAX_LABEL = "max reparto";

/** Che cosa è, in parole, per le note sotto i pannelli. */
export const ROLE_MAX_GLOSS =
  "quanto l'intero reparto di quel ruolo può ancora assorbire in tutto, su tutti i suoi slot messi insieme";
