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
 * L'identificativo del giocatore a cui `depositoConNomeMancante` toglie il nome.
 *
 * È un titolare, non un panchinaro dimenticato in fondo: il caso «nome non
 * osservato» deve vedersi nel posto più in vista della pagina, perché è lì che
 * un identificativo travestito da nome farebbe più danno.
 */
export const SENZA_NOME_ID = "g-d1";

/**
 * Una lettura riuscita in cui **di un giocatore il nome non è stato osservato**.
 *
 * È il caso che il canale di lega produce davvero oggi, e non un'ipotesi di
 * laboratorio: la piattaforma dichiara gli identificativi, e il nome può
 * mancare. Qui manca per uno solo, di proposito — così la stessa schermata
 * mostra insieme le due cose che devono restare distinguibili a colpo d'occhio:
 * un nome letto e un nome che non c'è.
 *
 * `name` viene **tolto**, non messo a stringa vuota: assente e vuoto sono due
 * osservazioni diverse, e il contratto tratta solo la prima come «non so».
 */
export function depositoConNomeMancante(): Record<string, unknown> {
  const payload = copia();
  const rosa = payload["roster"] as Record<string, unknown>;
  const giocatori = rosa["players"] as Record<string, unknown>[];
  const bersaglio = giocatori.find((giocatore) => giocatore["id"] === SENZA_NOME_ID);
  if (bersaglio === undefined) {
    throw new Error(`la fixture non porta più il giocatore ${SENZA_NOME_ID}`);
  }
  delete bersaglio["name"];
  return payload;
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
