// IL DEPOSITO DELLA LEGA, SINTETICO — quello che il layer privato servirebbe a
// `GET /api/formazione`, e che qui nessuno serve.
//
// Non è un secondo deposito scritto a mano: è la fixture che il repository ha
// già (`fixtures/league-channel-observation.example.json`), riletta qui e
// piegata nei due casi che questa suite deve poter guardare dal browser. Una
// copia a mano sarebbe la solita che diverge il giorno in cui la forma cambia,
// e il rifiuto sarebbe silenzioso: un deposito che non si legge diventa
// «risposta illeggibile», cioè una prova verde che non prova niente.
//
// Identificativi inventati (t-*, c-*, g-*), nessun nome reale, nessun dato di
// piattaforma: la regola del core pubblico vale anche per le prove.
import { readFileSync } from "node:fs";

const ESEMPIO = JSON.parse(
  readFileSync(
    new URL("../../fixtures/league-channel-observation.example.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

function copia(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(ESEMPIO)) as Record<string, unknown>;
}

/** Una lettura riuscita, con la rosa piena e la formazione di campionato. */
export function depositoConSquadra(): Record<string, unknown> {
  return copia();
}

/**
 * Una lettura riuscita che dice: **non hai nessuno**.
 *
 * È lo stato di prima dell'asta e di fine stagione, ed è l'unico caso in cui la
 * regola di apertura sceglierebbe l'Asta. La formazione del campionato sparisce
 * con la rosa: una formazione senza nessuno che la componga sarebbe un deposito
 * incoerente, e qui si vuole un deposito valido con una rosa vuota, non uno
 * storto.
 */
export function depositoRosaVuota(): Record<string, unknown> {
  const payload = copia();
  (payload["roster"] as Record<string, unknown>)["players"] = [];
  const competizioni = payload["competitions"] as Record<string, unknown>[];
  if (competizioni[0] !== undefined) competizioni[0]["lineup"] = null;
  return payload;
}
