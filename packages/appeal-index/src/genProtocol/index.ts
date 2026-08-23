// GEN-PROTOCOL-A — la facciata del nucleo pubblico del generatore.
//
// Questo modulo e' il CONTRATTO: l'orchestratore privato lo carica
// dinamicamente e non conosce nulla di piu' di cio' che sta qui. Da questo
// discendono due regole.
//
// 1. STABILITA'. Una firma esportata di qui e' una firma che qualcun altro
//    chiama senza vederne l'implementazione. Si aggiunge; si toglie solo
//    incrementando `GEN_PROTOCOL_CORE_VERSION` e dicendolo.
// 2. COMPLETEZZA. Tutto cio' che serve a far girare il protocollo passa da
//    qui — ondata 1 (tipi, prng, metriche, fold, tuning interno, famiglie,
//    T-D, conformal, bootstrap, MOD-CALC, selezione) e ondata 2 (statistiche
//    di stagione, catalogo delle feature, audit di anteriorita', B0, curva
//    prezzi, MOD-VALUE, VORP e crediti, tetti degli esperti, layer prime
//    giornate, classificatore di copertura, mondi sintetici, ricetta). Se
//    qualcosa manca, il privato non puo' aggiungerlo da se': dovrebbe
//    reimplementarlo, ed e' esattamente cio' che il confine public/private
//    esiste per impedire.
//
// Che cosa NON c'e', e non per dimenticanza: nessuna funzione che legga o
// scriva, nessuna che chiami la rete, nessuna che decida una promozione. Il
// core calcola. I gate, i dati e le decisioni stanno dall'altra parte.

/**
 * La versione del nucleo pubblico del generatore.
 *
 * Non e' la versione del protocollo (`2.0.0`, che vive nel documento e nel suo
 * hash) ne' quella della ricetta (`GEN-RECIPE@1.0.0`): e' la versione di
 * QUESTA superficie di API. Sale quando un consumatore dovrebbe accorgersene.
 */
export const GEN_PROTOCOL_CORE_VERSION = "1.0.0";

// --- Ondata 1 — il kernel di calcolo ---------------------------------------
export * from "./genTypes.js";
export * from "./prng.js";
export * from "./metrics.js";
export * from "./foldScheme.js";
export * from "./internalTuning.js";
export * from "./shrinkageMarcel.js";
export * from "./elasticNet.js";
export * from "./boostedStumps.js";
export * from "./voteDistribution.js";
export * from "./conformal.js";
export * from "./bootstrapBlock.js";
export * from "./modCalc.js";
export * from "./selection.js";

// --- Ondata 2 — dominio, mondi sintetici, artefatto -------------------------
export * from "./seasonStats.js";
export * from "./featureCatalog.js";
export * from "./anteriorityAudit.js";
export * from "./baselinesB0.js";
export * from "./priceCurve.js";
export * from "./modValueSim.js";
export * from "./vorp.js";
export * from "./expertCaps.js";
export * from "./earlySeasonUpdate.js";
export * from "./coverageClassifier.js";
export * from "./syntheticWorld.js";
export * from "./recipeArtifact.js";
