// LA GEOMETRIA DEL CAMPO — dove sta ciascuno, deciso qui e non dal disegno.
//
// PERCHÉ ESISTE. Una formazione mostrata come elenco in colonna non dice niente
// di ciò che il modulo decide: quattro difensori e quattro centrocampisti sono
// otto righe uguali. Il campo lo dice a colpo d'occhio — ed è per questo che il
// campo è la forma giusta. Ma il campo è anche il posto in cui il difetto
// ricorrente di questo progetto torna con l'aspetto di una comodità: **la
// posizione presa per identità**. Se a decidere il reparto fosse il disegno,
// il quinto nome della lista finirebbe in difesa perché è il quinto, non perché
// è un difensore, e la schermata mostrerebbe un dato che nessuno ha osservato.
//
// Quindi la disposizione è una funzione pura, provata senza browser, e le sue
// tre regole sono tutte «non inventare»:
//
//  1. I POSTI VENGONO DAL MODULO, mai dal conteggio dei presenti. `moduleShape`
//     dice quanti difensori, centrocampisti e attaccanti il modulo richiede, e
//     quello è il numero di caselle disegnate. Contare i giocatori presenti
//     significherebbe che un 4-4-2 con tre difensori si mostra come un 3-4-2:
//     la formazione incompleta sparirebbe dentro un modulo che nessuno ha
//     schierato, e sparirebbe **proprio nel momento in cui va vista**.
//  2. IL REPARTO LO DECIDE IL RUOLO OSSERVATO, mai la posizione nell'elenco. Un
//     titolare di cui non si è letto il ruolo non prende una casella per
//     esclusione: finisce fra i `unplaced`, che è un elenco che si mostra, non
//     un silenzio.
//  3. NIENTE SPARISCE E NIENTE SI FINGE. Meno titolari dei posti: restano
//     caselle vuote (`playerId: null`). Più titolari dei posti: l'eccesso va in
//     `unplaced`. Le due direzioni sono entrambe difetti della formazione, e in
//     entrambe la schermata deve poter mostrare il difetto invece del suo
//     rattoppo.
//
// L'ORDINE DENTRO IL REPARTO È QUELLO DI `starterIds`, e non è una scelta
// estetica: è la stessa regola che `lineupDraft` applica alla panchina —
// l'ordine dichiarato è un dato, non una presentazione. Ordinare qui per nome,
// per ruolo o per qualunque punteggio significherebbe che chi trascina un
// giocatore lo vede tornare da un'altra parte; ordinare per l'iterazione di un
// oggetto significherebbe non ordinare affatto. Chi vuole un ordine diverso lo
// cambia nella formazione, e la formazione lo conserva.
//
// NIENTE RETE, NIENTE OROLOGIO, NIENTE DOM: come tutto il pacchetto.

import type { Module } from "../../league-gameweek/src/leagueGameweek.js";
import { MODULES, moduleShape } from "../../league-gameweek/src/leagueGameweek.js";
import type { Role } from "../../league-gameweek/src/gameweekSimulator.js";
import type { ObservedLineup } from "./lineupSubmission.js";

/** Una casella del campo: un posto del modulo, occupato o vuoto. */
export interface PitchSlot {
  readonly role: Role;
  /** 0 = porta, poi difesa, centrocampo, attacco. */
  readonly line: number;
  readonly indexInLine: number;
  /** `null` = posto del modulo che nessuno occupa. */
  readonly playerId: string | null;
}

/** Il campo intero: le righe dei reparti e ciò che nessuna riga può accogliere. */
export interface PitchLayout {
  readonly module: Module;
  /** Dalla porta all'attacco. Una riga per reparto. */
  readonly lines: readonly (readonly PitchSlot[])[];
  /** I titolari che il modulo non sa dove mettere: mai silenziosi. */
  readonly unplaced: readonly string[];
}

/** La riga della porta, per chi legge `line` senza contare. */
export const LINEA_PORTA = 0;
export const LINEA_DIFESA = 1;
export const LINEA_CENTROCAMPO = 2;
export const LINEA_ATTACCO = 3;

/** I tre reparti di movimento, nell'ordine in cui si disegnano. */
const REPARTI: readonly { readonly role: "D" | "C" | "A"; readonly line: number }[] = [
  { role: "D", line: LINEA_DIFESA },
  { role: "C", line: LINEA_CENTROCAMPO },
  { role: "A", line: LINEA_ATTACCO },
];

function isKnownModule(module: Module): boolean {
  return MODULES.includes(module);
}

/** Quanti posti il modulo dà a un reparto di movimento. */
function postiDelReparto(module: Module, role: "D" | "C" | "A"): number {
  const shape = moduleShape(module);
  if (role === "D") return shape.defenders;
  if (role === "C") return shape.midfielders;
  return shape.strikers;
}

/**
 * IL CAMPO, DA UNA FORMAZIONE OSSERVATA E DAI RUOLI LETTI.
 *
 * La porta è un posto solo e il suo occupante non si deduce: è
 * `lineup.goalkeeperId`, cioè un campo che la formazione **dichiara**, non un
 * ruolo che questa funzione interpreta. Per questo un portiere il cui ruolo non
 * è stato osservato — o che risulta di un altro ruolo — resta comunque in porta
 * qui dentro: è dove la formazione dice che sta, e mostrarlo altrove
 * significherebbe disegnare una porta vuota che nella formazione vuota non è.
 * Che quella porta sia illegale lo dice `submissionLegality`, che ha il codice
 * apposta (`portiereRuoloErrato`) e la severità per farlo pesare.
 *
 * Un `goalkeeperId` VUOTO è invece l'assenza vera, e si disegna vuota.
 *
 * MODULO SCONOSCIUTO: la formazione osservata può portare un modulo che i sette
 * di §9 non contengono, ed è un caso di lettura, non di tipo. Qui non si
 * indovina una forma né si solleva un'eccezione dentro un disegno: resta la
 * porta, non c'è nessun reparto — nessuna casella la cui esistenza nessun
 * modulo dichiara — e ogni titolare di movimento finisce in `unplaced`, dove si
 * vede.
 */
export function pitchLayout(
  lineup: ObservedLineup,
  roles: ReadonlyMap<string, Role>,
): PitchLayout {
  const porta: readonly PitchSlot[] = [
    {
      role: "P",
      line: LINEA_PORTA,
      indexInLine: 0,
      playerId: lineup.goalkeeperId.length === 0 ? null : lineup.goalkeeperId,
    },
  ];

  // Chi è già disegnato non si disegna una seconda volta. Vale per il portiere
  // che comparisse anche fra i titolari e per un id ripetuto nell'elenco: una
  // ripetizione non è un secondo giocatore, e occuparle due caselle direbbe che
  // il reparto è più pieno di quanto sia.
  const gia = new Set<string>();
  if (lineup.goalkeeperId.length > 0) gia.add(lineup.goalkeeperId);

  const perReparto: Readonly<Record<"D" | "C" | "A", string[]>> = { D: [], C: [], A: [] };
  const fuoriDalCampo = new Set<string>();
  /** I titolari di movimento distinti, nell'ordine dichiarato. */
  const ordinati: string[] = [];

  // Un solo passaggio, nell'ordine dichiarato dalla formazione: è quell'ordine
  // — e nessun altro criterio — a decidere chi è il primo difensore.
  for (const id of lineup.starterIds) {
    if (id.length === 0 || gia.has(id)) continue;
    gia.add(id);
    ordinati.push(id);
    const role = roles.get(id);
    // Ruolo non osservato, oppure un portiere fra i titolari di movimento: né
    // l'uno né l'altro ha un reparto in cui stare, e nessuno dei due si assegna
    // per posizione.
    if (role === undefined || role === "P") {
      fuoriDalCampo.add(id);
      continue;
    }
    perReparto[role].push(id);
  }

  if (!isKnownModule(lineup.module)) {
    return {
      module: lineup.module,
      lines: [porta],
      // Tutti, nell'ordine dichiarato: senza modulo non c'è nessun posto da
      // assegnare, e raggrupparli per reparto suggerirebbe una forma che
      // nessun modulo ha dichiarato.
      unplaced: ordinati,
    };
  }

  const lines: PitchSlot[][] = [[...porta]];
  for (const reparto of REPARTI) {
    const attesi = postiDelReparto(lineup.module, reparto.role);
    const presenti = perReparto[reparto.role];
    const riga: PitchSlot[] = [];
    for (let indexInLine = 0; indexInLine < attesi; indexInLine += 1) {
      riga.push({
        role: reparto.role,
        line: reparto.line,
        indexInLine,
        playerId: presenti[indexInLine] ?? null,
      });
    }
    // L'eccesso non entra e non sparisce.
    for (const id of presenti.slice(attesi)) fuoriDalCampo.add(id);
    lines.push(riga);
  }

  // `unplaced` esce nell'ordine dichiarato dalla formazione, come le righe:
  // due elenchi ordinati con criteri diversi si leggerebbero come due elenchi
  // di cose diverse.
  return {
    module: lineup.module,
    lines,
    unplaced: ordinati.filter((id) => fuoriDalCampo.has(id)),
  };
}
