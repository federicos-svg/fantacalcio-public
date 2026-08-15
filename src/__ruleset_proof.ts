// File temporaneo di verifica della ruleset: introduce un errore di tipo
// deliberato, così il job `check` fallisce e si può dimostrare che una PR
// con un required check rosso NON è mergiabile. Rimosso nel commit seguente.
export const rulesetProof: number = "questo non è un number";
