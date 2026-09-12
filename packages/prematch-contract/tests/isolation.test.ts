import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

// ISOLAMENTO DEL CONTRATTO PRE-PARTITA — due guardie in una.
//
// **Verso l'esterno**: nessun file del **prodotto d'asta** — la UI, il motore e
// i pacchetti che l'asta la fanno, elencati per nome qui sotto — nomina questo
// contratto. Le fonti pre-partita alimentano il Lineup Coach e la sua
// valutazione, e `docs/NO_GO.md` §Scope tiene il Coach fuori dall'MVP d'asta; il
// record che autorizza queste pagine lo ripete per esteso: «nessun output di
// queste fonti entra nel prodotto d'asta». Il divieto è **di perimetro, non di
// argomento**: vieta al pre-partita di entrare nell'asta, non di essere letto da
// chi la Fase 2 la costruisce.
//
// **Verso l'interno**: questo pacchetto non importa niente. Né un pacchetto
// npm, né un altro pacchetto del repository, né la UI. È la forma tecnica di
// «agnostico dalla fonte»: un contratto che non conosce nessuno non può
// imparare un host, un selettore o una regola di lega per la porta di servizio.
//
// Le radici sorvegliate SONO UN ELENCO POSITIVO — la UI più i pacchetti che
// FANNO il prodotto d'asta, scritti qui sotto uno per riga con la loro ragione
// — e non più «tutto il repository tranne chi ci siamo ricordati di esentare».
// Perché il criterio sia cambiato, che cosa il cambio costa e che cosa paga
// quel costo: blocco `AUCTION_PRODUCT_PACKAGES`, qui sotto.

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PACKAGE_NAME = "prematch-contract";
const PACKAGE_ROOT = `packages/${PACKAGE_NAME}/`;

/**
 * IL PRODOTTO D'ASTA, DETTO PER NOME — il criterio di questa guardia.
 *
 * SCELTA TECNICA DI CHI SCRIVE, DICHIARATA COME SUA E CONTESTABILE: la
 * sorveglianza è un **elenco positivo** di ciò che il prodotto d'asta è, non
 * il complemento di un elenco di esenzioni. Chi non è d'accordo cambia questo
 * blocco, non aggiunge un'eccezione altrove.
 *
 * PERCHÉ NON PIÙ «TUTTO TRANNE». La regola che questa guardia difende è di
 * perimetro: il pre-partita non entra **nel prodotto d'asta**. «Ogni
 * `packages/*` tranne i miei esenti» non descrive il prodotto d'asta: descrive
 * il mondo. Finché nessuno consumava il contratto la differenza non si vedeva,
 * perché il mondo taceva; il primo consumatore legittimo l'ha resa visibile, e
 * la toppa di allora — esentarlo per nome — ha lasciato in piedi il criterio
 * sbagliato: **vietato a tutti, meno i nomi che ci siamo ricordati di
 * scrivere**. Ogni consumatore legittimo futuro nasce quindi rosso e resta
 * rosso finché qualcuno non se ne accorge. Detto in positivo, la domanda torna
 * quella giusta: *chi è il prodotto d'asta?* — e di chiunque altro questa
 * guardia non ha nulla da dire.
 *
 * CHE COSA IL CAMBIO COSTA, senza sconti. La versione sottrattiva aveva una
 * proprietà buona che qui si perde: un pacchetto nato domani entrava nella
 * sorveglianza il giorno in cui nasceva. Con un elenco positivo **non ci
 * entra** finché qualcuno non lo scrive qui. È il prezzo del criterio, ed è
 * pagato in tre modi, tutti eseguiti:
 *
 *  1. **l'elenco è vivo**: ogni radice dichiarata deve esistere e avere
 *     sorgenti, quindi una cartella rinominata o svuotata rende la guardia
 *     rossa invece di restringerla in silenzio;
 *  2. **l'ambiguità non può restare silenziosa**: un pacchetto che non è
 *     classificato — né qui, né in `NOT_THE_AUCTION_PRODUCT`, né fra i tramiti
 *     — e che **nomina il contratto** rende la guardia rossa **col proprio
 *     nome**, e chiede di essere dichiarato da una parte o dall'altra. Vedi
 *     `unclassifiedConsumers`: è ciò che restituisce al criterio positivo la
 *     proprietà che «tutto tranne» aveva e che un elenco, da solo, perde —
 *     *nato domani, non passa inosservato*. Nel dubbio la risposta resta
 *     `UNKNOWN → sorvegliato`, cioè dentro questo elenco;
 *  3. **il tramite resta vietato**: il nome di ogni consumatore dichiarato del
 *     contratto è vietato dentro queste radici — vedi `PHASE_TWO_CONSUMERS` —
 *     quindi il prodotto d'asta non raggiunge il contratto passando da lui.
 *
 * Ogni riga qui sotto porta la ragione per cui quel pacchetto è il prodotto
 * d'asta. Chi aggiunge un pacchetto senza saper scrivere quella riga ha appena
 * scoperto che non sa da che parte sta, e la risposta è la 2.
 */
const AUCTION_PRODUCT_PACKAGES: readonly string[] = [
  // Il motore: stato dell'asta, offerte, fattibilità, budget.
  "engine",
  // Gli avversari dell'asta: profilo dichiarato e contatori osservati.
  "opponent-profiles",
  // Il listone che entra: decodifica delle quotazioni reali.
  "xlsx-adapter",
  // I numeri che la scheda del giocatore e il listone mostreranno: è lavoro
  // offline, ma è lavoro *dell'asta*, e il suo esito è diretto lì.
  "appeal-index",
  // L'identità con cui listone, scheda e motore parlano dello stesso
  // giocatore: quattro pacchetti, un mestiere solo.
  "identity-policy",
  "player-identity",
  "manual-enrichment",
  "wikidata-identity-contract",
  // La materia prima dei numeri d'asta e le sue regole di piattaforma.
  "hybrid-dataset-contract",
  "data-platform-contract",
  "data-connector-sdk",
  // AMBIGUO, RISOLTO DENTRO (regola 2). I segnali di formazione estratti dai
  // post parlano di giornata, non d'asta; ma alimentano il gruppo esperti, che
  // nella scheda del giocatore d'asta si vede. Nel dubbio: sorvegliato. Il
  // giorno in cui questo pacchetto consuma il pre-partita per mestiere, questa
  // riga si sposta — di una riga — e il test lo dice chiaro invece di tacere.
  "expert-topics-contract",
];

/**
 * CHI NON È IL PRODOTTO D'ASTA, e quindi non è affare di questa guardia: questo
 * contratto; `source-reliability`, che misura l'accordo **delle fonti
 * pre-partita** ed è il consumatore naturale di ciò che qui si dichiara;
 * `league-gameweek` e `league-channel-contract`, che sono la Fase 2. Il test
 * qui sotto pretende che nessuno dei quattro finisca in elenco per distrazione.
 */
const NOT_THE_AUCTION_PRODUCT: readonly string[] = [
  PACKAGE_NAME,
  "source-reliability",
  "league-gameweek",
  "league-channel-contract",
];

/**
 * I CONSUMATORI DICHIARATI DEL CONTRATTO — i tramiti, e il perché si dichiarano.
 *
 * CHE COSA FA OGGI QUESTO ELENCO, dopo che il criterio è diventato positivo.
 * Non serve più a *esentare* nessuno dalla sorveglianza: chi non è nel prodotto
 * d'asta è già fuori, per costruzione, senza chiedere il permesso a una riga.
 * Serve all'altra metà del lavoro — **chiudere la catena**. Un consumatore del
 * contratto è un tramite: il prodotto d'asta importa lui, lui importa il
 * contratto, e nessuno dei due file nomina `prematch-contract`. Scriverlo qui
 * ne vieta il **nome** dentro il prodotto d'asta, e la scorciatoia muore.
 *
 * CHE COSA QUESTA GUARDIA PROTEGGE, detto senza sconti: il **prodotto d'asta**
 * — la UI e i pacchetti di `AUCTION_PRODUCT_PACKAGES` — non nomina questo
 * contratto né i tramiti dichiarati qui. CHE COSA NON PROTEGGE: non impedisce
 * che *qualcuno* consumi il contratto. Chi sta fuori dal prodotto d'asta può
 * farlo, ed è esattamente ciò per cui il contratto è stato scritto.
 *
 * IL LIMITE DELLA CHIUSURA, dichiarato qui perché chi legge solo questo blocco
 * non se ne vada con una garanzia più larga del meccanismo: i tramiti si
 * **dichiarano**, non si scoprono. Un pacchetto pubblico fuori dal prodotto
 * d'asta che un domani consumasse il contratto senza comparire in questo elenco
 * sarebbe un tramite che questa guardia non vede — e il prodotto d'asta
 * potrebbe importarlo. Il caso è **piantato eseguito** nel test del buco noto,
 * in fondo al file, invece che sepolto in un commento. Il rimedio — leggere i
 * sorgenti dei pacchetti non sorvegliati e dedurne i tramiti — è una lavorazione
 * sua, e si porta dietro una domanda che qui non si decide: la pagina
 * Formazione vive dentro `src/`, quindi un tramite dedotto potrebbe rendere
 * rossa una schermata di Fase 2 legittima.
 *
 * LA CATENA RESTA CHIUSA per i tramiti dichiarati, e senza dipendere da un file
 * che vive in un altro repository. Stare fuori dall'elenco del prodotto d'asta
 * aprirebbe altrimenti una porta di servizio — il motore importa il tramite, il
 * tramite importa il contratto, e nessuno dei due file nomina
 * `prematch-contract` — quindi il nome di ogni tramite dichiarato entra,
 * insieme a quello del contratto, fra le stringhe **vietate** nelle radici del
 * prodotto d'asta. Il prodotto d'asta non può nominare il contratto né il suo
 * lettore: la scorciatoia non esiste perché non esiste il tramite.
 *
 * FIN DOVE ARRIVA QUELLA CHIUSURA, detto qui e non altrove, perché chi legge
 * solo questo blocco non se ne vada con una garanzia più larga del meccanismo.
 * Il rilevamento è una **ricerca di sottostringa letterale sul testo grezzo**
 * del file. Vede quindi il nome **scritto com'è**: import statico, import
 * dinamico, `export … from`, la grafia in cammello, la menzione fuori da un
 * import, e il passaggio dal tramite dichiarato. **Non vede** uno specificatore
 * **composto a pezzi a runtime** — `["prematch", "-", "contract"].join("")` —
 * né un **alias di percorso** che un domani mappasse il pacchetto su un nome
 * diverso nella configurazione di TypeScript o del bundler: in quei due casi il
 * nome non compare nel testo, e questa guardia tace.
 *
 * Il limite **non nasce qui**: la versione precedente, che vietava a chiunque
 * di nominare il contratto, si aggirava allo stesso identico modo e per la
 * stessa ragione. Non è stato né creato né allargato da questa modifica — ma la
 * garanzia qui sopra è nuova, e una garanzia nuova che promette più di quanto
 * il meccanismo veda è il difetto che costa più caro. Quindi sta scritta, e sta
 * scritta anche **eseguita**: il test «il caso offuscato passa» qui sotto lo
 * pianta come noto e accettato invece di seppellirlo in un commento.
 *
 * Il rimedio vero — analisi degli specificatori invece della sottostringa —
 * tocca **due** guardie di questa famiglia ed è una lavorazione sua.
 *
 * A CHI UN GIORNO PORTERÀ IL CRITERIO POSITIVO ALLE GUARDIE SORELLE
 * (`packages/league-gameweek` e `packages/league-channel-contract`, che
 * calcolano ancora le radici come «ogni `packages/<nome>/src` tranne…»): la
 * trappola che troverai non è nel criterio, è in una **meta-guardia**. Il terzo
 * test di `packages/league-gameweek/tests/isolation.test.ts` legge il sorgente
 * delle sue due esenti e pretende, eseguibilmente, che ciascuna contenga
 * `function isolatedRoots()` e la riga `readdirSync(join(REPO_ROOT,
 * "packages"))` — cioè **la forma vecchia**. Sostituirla con un elenco positivo
 * rende rossa quella meta-guardia, e la sua asserzione va aggiornata nello
 * stesso cambio, non dopo. È anche il motivo per cui qui le sorelle non sono
 * state toccate: portarle richiede di rifare le loro prove, non di copiare
 * questo blocco.
 *
 * NOTA DI CONFINE, perché non sembri una svista: `prematch-reader` è un
 * pacchetto **privato** e in questo repository non esiste. La sua riga fa qui
 * l'unica cosa che qui si può fare — e verificare: vietarne il nome dentro il
 * prodotto d'asta. Che possa leggere il contratto non gliel'ha concesso questa
 * riga: gliel'ha concesso il non essere il prodotto d'asta, che vale per lui
 * come per chiunque altro, in questo repository e nel privato. Se quel lettore
 * nascerà con un nome diverso da `prematch-reader`, non sarà un divieto a
 * fermarlo ma `unclassifiedConsumers`, che lo nominerà e chiederà una riga:
 * dichiararlo qui, o fra chi il prodotto d'asta non è.
 */
const PHASE_TWO_CONSUMERS: readonly string[] = ["prematch-reader"];

/** `prematch-reader` → `prematchReader`: un import si scrive in tutti e due i modi. */
function camelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Le stringhe che un file del prodotto d'asta non può contenere: il contratto e
 * ogni tramite dichiarato, ciascuno nelle due grafie con cui lo si nomina.
 */
const FORBIDDEN_MENTIONS: readonly string[] = [PACKAGE_NAME, ...PHASE_TWO_CONSUMERS].flatMap(
  (name) => [name, camelCase(name)],
);

/**
 * Le radici del prodotto d'asta: la UI più i pacchetti dichiarati sopra. Niente
 * `readdirSync` su `packages/`, e non è una svista — la domanda non è più «che
 * cosa c'è nel repository» ma «che cosa è il prodotto d'asta», e la seconda ha
 * una risposta scritta.
 */
function auctionProductRoots(): readonly string[] {
  return ["src", ...AUCTION_PRODUCT_PACKAGES.map((name) => `packages/${name}/src`)];
}

function sourceFiles(root: string): readonly string[] {
  const absolute = join(REPO_ROOT, root);
  const out: string[] = [];
  // Una radice che non esiste torna vuota invece di far esplodere il walk: chi
  // la dichiara la trova nominata dal test «l'elenco è VIVO», con il suo nome,
  // invece di un ENOENT che non dice quale riga è invecchiata.
  try {
    if (!statSync(absolute).isDirectory()) return out;
  } catch {
    return out;
  }
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (WATCHED_EXTENSIONS.test(entry) && !entry.includes(".test.")) out.push(full);
    }
  };
  walk(absolute);
  return out;
}

/** Ogni specificatore di modulo: `import … from`, `import "x"`, `export … from`, `import("x")`. */
const MODULE_SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importViolations(relativeFile: string, source: string): readonly string[] {
  const directory = posix.dirname(relativeFile);
  const out: string[] = [];
  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const reason = `${relativeFile}: import "${specifier}" — il contratto pre-partita non si lega a nulla`;
    if (!specifier.startsWith(".")) {
      out.push(reason);
      continue;
    }
    const resolved = posix.normalize(posix.join(directory, specifier));
    if (resolved.startsWith(PACKAGE_ROOT)) continue;
    out.push(reason);
  }
  return out;
}

/**
 * I PACCHETTI CHE NESSUNO HA CLASSIFICATO E CHE TOCCANO IL CONTRATTO.
 *
 * PERCHÉ ESISTE. Un elenco positivo dice chi è il prodotto d'asta e tace su
 * tutti gli altri; quel silenzio è il punto — ma senza questa funzione sarebbe
 * anche un buco, e un buco che una revisione ha misurato: un pacchetto nato
 * domani che importa il contratto passava con la suite verde, e togliere una
 * riga dall'elenco restringeva la sorveglianza senza che niente diventasse
 * rosso. La difesa 1 controlla che ogni radice **dichiarata** esista; nessuno
 * controllava che ogni pacchetto **esistente** fosse dichiarato.
 *
 * CHE COSA CHIEDE, e non un millimetro di più: non che ogni pacchetto sia
 * classificato — che sia classificato **chi tocca il contratto**. Un pacchetto
 * non classificato che non ha niente a che fare col pre-partita non è affare di
 * questa guardia e resta muto; lo stesso pacchetto che ne nomina il contratto
 * deve dire da che parte sta, e finché non lo dice la guardia è rossa e lo
 * nomina. La copertura che ne risulta è completa nel punto che conta: **ogni**
 * file che nomina il contratto, ovunque sotto `packages/`, o è in una radice
 * del prodotto d'asta (rosso), o è in un pacchetto dichiarato fuori
 * (permesso, ed è il senso di questa PR), o è in un pacchetto non classificato
 * (rosso, qui).
 *
 * PERCHÉ NON LA PARTIZIONE PIENA («ogni voce di `packages/` sta in uno dei due
 * elenchi»), che sarebbe stata più corta da scrivere. Questo file è **core
 * pubblico vendorato nel repository privato**, dove `packages/` contiene anche
 * i pacchetti privati — che in un file pubblico non possono essere nominati, e
 * che da lì non possono essere aggiunti perché il core vendorato è read-only.
 * Una partizione piena sarebbe quindi verde qui e rossa là per sempre, cioè
 * spegnerebbe nel privato esattamente la lavorazione che questa guardia deve
 * lasciar passare. La regola scritta sopra vale invece **identica nei due
 * repository**, ed è la ragione per cui è formulata sul contatto e non
 * sull'anagrafe.
 */
function unclassifiedConsumers(): readonly string[] {
  const classified = new Set<string>([
    ...AUCTION_PRODUCT_PACKAGES,
    ...NOT_THE_AUCTION_PRODUCT,
    ...PHASE_TWO_CONSUMERS,
  ]);
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, "packages"))) {
    if (classified.has(entry)) continue;
    for (const file of sourceFiles(`packages/${entry}/src`)) {
      if (!readFileSync(file, "utf8").includes(PACKAGE_NAME)) continue;
      out.push(
        `packages/${entry}: nomina ${PACKAGE_NAME} e non è classificato — dichiaralo in ` +
          "AUCTION_PRODUCT_PACKAGES o in NOT_THE_AUCTION_PRODUCT",
      );
      break;
    }
  }
  return out;
}

/** Un file di una radice sorvegliata che nomina il pre-partita, o il suo lettore. */
function mentionViolations(relativeFile: string, source: string): readonly string[] {
  const found = FORBIDDEN_MENTIONS.filter((name) => source.includes(name));
  if (found.length === 0) return [];
  return [`${relativeFile}: nomina ${found.join(", ")} — il pre-partita resta fuori dal prodotto d'asta`];
}

describe("il contratto pre-partita non conosce nessuno", () => {
  it("i suoi sorgenti importano solo sé stessi: nessun pacchetto npm, nessun vicino", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(`${PACKAGE_ROOT}src`)) {
      const relative = file.slice(REPO_ROOT.length);
      offenders.push(...importViolations(relative, readFileSync(file, "utf8")));
    }
    expect(offenders).toEqual([]);
  });

  it("la guardia fallisce davvero su casi costruiti, non solo sui sorgenti di oggi", () => {
    const file = `${PACKAGE_ROOT}src/finto.ts`;
    expect(importViolations(file, 'import { x } from "./field.js";')).toEqual([]);
    const respinti: readonly [string, string][] = [
      ["motore", 'import type { Role } from "../../engine/src/types.js";'],
      ["UI", 'import { x } from "../../../src/price.js";'],
      ["pacchetto npm", 'import { z } from "zod";'],
      ["builtin", 'import { readFileSync } from "node:fs";'],
      ["import dinamico", 'const m = await import("../../engine/src/reduce.js");'],
      // Il contratto non conosce nemmeno i suoi consumatori: la dipendenza è a
      // senso unico, e questa direzione non è stata allargata da nessuno.
      ["il proprio lettore", 'import { r } from "../../prematch-reader/src/index.js";'],
    ];
    for (const [etichetta, sorgente] of respinti) {
      expect(importViolations(file, sorgente), etichetta).toHaveLength(1);
    }
  });
});

describe("il contratto pre-partita resta fuori dal prodotto d'asta", () => {
  it("nessun file della UI o dei pacchetti del prodotto d'asta lo nomina", () => {
    const offenders: string[] = [];
    for (const root of auctionProductRoots()) {
      for (const file of sourceFiles(root)) {
        const relative = file.slice(REPO_ROOT.length);
        offenders.push(...mentionViolations(relative, readFileSync(file, "utf8")));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("l'elenco del prodotto d'asta è dichiarato, ed è VIVO: ogni radice esiste e ha sorgenti", () => {
    // È il prezzo del criterio positivo, pagato qui (regola 1 del blocco): un
    // elenco scritto a mano può invecchiare in silenzio, e una radice che non
    // esiste più è sorveglianza persa senza che nessuno l'abbia decisa. Se una
    // riga di `AUCTION_PRODUCT_PACKAGES` non corrisponde più a una cartella con
    // sorgenti, questo test è rosso e dice quale.
    const roots = auctionProductRoots();
    expect(roots[0]).toBe("src");
    expect(roots).toContain("packages/engine/src");
    expect(roots).toHaveLength(AUCTION_PRODUCT_PACKAGES.length + 1);
    for (const root of roots) {
      expect(sourceFiles(root).length, root).toBeGreaterThan(0);
    }

    // Nomi di pacchetto, senza duplicati: i nomi finiscono in un confronto
    // letterale e in un percorso, e un nome bizzarro qui è un modo di non
    // sorvegliare ciò che si crede di sorvegliare.
    expect(new Set(AUCTION_PRODUCT_PACKAGES).size).toBe(AUCTION_PRODUCT_PACKAGES.length);
    for (const name of AUCTION_PRODUCT_PACKAGES) {
      expect(name, name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("un pacchetto non classificato non può toccare il contratto in silenzio", () => {
    // LA DIFESA 2, ESEGUITA. Senza questa riga l'elenco positivo perdeva la
    // proprietà «nato domani entra da solo»: un pacchetto nuovo che importa il
    // contratto passava verde, e togliere una riga dall'elenco restringeva la
    // sorveglianza in silenzio. Provata rossa con entrambe le mutazioni — un
    // pacchetto nuovo non classificato che importa il contratto, e una riga
    // tolta dall'elenco con una violazione vera dentro quel pacchetto: in
    // tutti e due i casi questo test fallisce e **nomina** il pacchetto.
    expect(unclassifiedConsumers()).toEqual([]);
  });

  it("chi non è il prodotto d'asta non finisce in elenco per distrazione", () => {
    // Il contratto stesso, la misura delle fonti pre-partita, la Fase 2 e i
    // tramiti dichiarati: quattro più uno che non possono essere sorvegliati
    // senza che la guardia torni a vietare il mondo. Un nome che scivola in
    // `AUCTION_PRODUCT_PACKAGES` è il modo silenzioso in cui questo cambio si
    // annulla, e questo test è ciò che glielo impedisce.
    expect(NOT_THE_AUCTION_PRODUCT).toContain(PACKAGE_NAME);
    const roots = auctionProductRoots();
    for (const name of [...NOT_THE_AUCTION_PRODUCT, ...PHASE_TWO_CONSUMERS]) {
      expect(AUCTION_PRODUCT_PACKAGES, name).not.toContain(name);
      expect(roots, name).not.toContain(`packages/${name}/src`);
    }
    expect(roots).not.toContain(`${PACKAGE_ROOT}src`);
  });

  it("i tramiti dichiarati sono un elenco chiuso, e ogni nome è un nome di pacchetto", () => {
    // Un nome in più qui è una riga in diff, che chi rivede vede. Il confronto
    // esatto è ciò che impedisce a un tramite di entrare per inerzia.
    expect(PHASE_TWO_CONSUMERS).toEqual(["prematch-reader"]);
    for (const name of PHASE_TWO_CONSUMERS) {
      // Niente metacaratteri: i nomi finiscono in un confronto letterale, e un
      // nome bizzarro qui sarebbe un modo di non vietare quello che si crede.
      expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(name).not.toBe(PACKAGE_NAME);
    }
  });

  it("separa il consumatore permesso da quello vietato, e lo prova su casi costruiti", () => {
    // IL CASO PERMESSO. Un consumatore fuori dal prodotto d'asta che importa il
    // contratto non è nemmeno fra i file esaminati: la sua radice non è una
    // radice del prodotto d'asta, quindi il suo import non è una violazione. È
    // il caso che prima faceva rossa questa guardia, e non per un'esenzione
    // scritta apposta per lui — per il criterio.
    const roots = auctionProductRoots();
    for (const name of [...PHASE_TWO_CONSUMERS, "source-reliability"]) {
      expect(roots, name).not.toContain(`packages/${name}/src`);
    }
    // `source-reliability` non è un nome scelto a caso: è il pacchetto pubblico
    // che misura l'accordo delle fonti pre-partita, cioè il consumatore che
    // questo contratto si aspetta. Il caso permesso è quindi verificabile qui e
    // non solo nel repository privato, ed è stato verificato **eseguendolo**:
    // un file che importa il contratto piantato in `source-reliability` e poi
    // in `league-gameweek` lascia questa guardia verde in entrambi i casi.
    //
    // UNA COSA CHE LA PROVA HA FATTO EMERGERE, e che non è questa guardia:
    // `source-reliability` dichiara sé stesso senza import — ha una guardia di
    // purezza sua, che quel file rende rossa. Quando sarà lui a leggere il
    // pre-partita, è quella riga a doversi muovere, non questa: qui il
    // permesso c'è già.
    expect(NOT_THE_AUCTION_PRODUCT).toContain("source-reliability");

    // IL CONSUMATORE VIETATO, nelle due strade che ha per esistere.
    const respinti: readonly [string, string, string][] = [
      ["motore, via contratto", "packages/engine/src/finto.ts", 'import type { P } from "../../prematch-contract/src/index.js";'],
      ["UI, via contratto", "src/finto.ts", 'const m = await import("../packages/prematch-contract/src/index.js");'],
      ["motore, in cammello", "packages/engine/src/finto.ts", "const x = prematchContract.shape;"],
      // LA PORTA DI SERVIZIO, chiusa: il motore non può raggiungere il contratto
      // passando dal tramite dichiarato, perché non può nominare nemmeno quello.
      ["motore, via lettore", "packages/engine/src/finto.ts", 'import { r } from "../../prematch-reader/src/readDeposit.js";'],
      ["UI, via lettore in cammello", "src/finto.ts", "const y = prematchReader.deposits;"],
    ];
    for (const [etichetta, file, sorgente] of respinti) {
      const violazioni = mentionViolations(file, sorgente);
      expect(violazioni, etichetta).toHaveLength(1);
      expect(violazioni[0], etichetta).toContain(file);
      expect(violazioni[0], etichetta).toContain("resta fuori dal prodotto d'asta");
    }

    // E un file del prodotto d'asta che non nomina niente di tutto questo resta
    // libero: la guardia è di perimetro, non un divieto di esistere.
    expect(mentionViolations("packages/engine/src/finto.ts", 'import { r } from "../../appeal-index/src/dataset.js";')).toEqual([]);

    // IL CASO VIETATO È VIETATO ANCHE SUI FILE VERI, non solo sulle stringhe:
    // `packages/engine/src` è fra le radici, quindi un file del motore che
    // importasse il contratto sarebbe raccolto dal primo test di questo blocco.
    // Verificato **eseguendolo** — un file piantato lì rende la suite rossa
    // (vedi il corpo della PR) — e qui resta assertita la premessa che lo rende
    // possibile, cioè l'unica cosa che una mutazione futura potrebbe rompere.
    expect(roots).toContain("packages/engine/src");
    expect(roots).toContain("src");
  });

  it("IL BUCO NOTO E ACCETTATO: un tramite NON dichiarato non viene scoperto", () => {
    // QUESTO TEST DOCUMENTA UNA DEBOLEZZA, NON UNA GARANZIA. Il criterio
    // positivo lascia fuori dalla sorveglianza chiunque non sia il prodotto
    // d'asta — ed è il punto — ma con ciò lascia fuori anche un possibile
    // TRAMITE: un pacchetto pubblico che consumi il contratto senza essere
    // dichiarato in `PHASE_TWO_CONSUMERS`. Il suo nome non entra fra le
    // stringhe vietate, quindi il prodotto d'asta può importarlo, e per quella
    // strada il pre-partita arriva all'asta senza che nessun file nomini il
    // contratto.
    //
    // Oggi nessun pacchetto pubblico consuma il contratto, quindi il tramite
    // non dichiarato non esiste: la debolezza è di meccanismo, non un passaggio
    // aperto adesso. Resta qui, eseguita, perché non sia una frase.
    //
    // SE UN GIORNO QUALCUNO DEDUCE I TRAMITI dai sorgenti invece di
    // dichiararli, QUESTO TEST DIVENTA ROSSO. È il comportamento voluto:
    // significa che il buco è stato chiuso, e allora il test va GIRATO —
    // `toEqual([])` diventa `toHaveLength(1)` — non cancellato.
    const tramiteNonDichiarato = "source-reliability";
    expect(PHASE_TWO_CONSUMERS).not.toContain(tramiteNonDichiarato);
    expect(
      mentionViolations(
        "packages/engine/src/finto.ts",
        'import { agreement } from "../../source-reliability/src/index.js";',
      ),
    ).toEqual([]);
  });

  it("IL BUCO NOTO E ACCETTATO: un nome composto a pezzi a runtime oggi NON viene visto", () => {
    // QUESTO TEST DOCUMENTA UNA DEBOLEZZA, NON UNA GARANZIA, e serve a renderla
    // FALSIFICABILE invece che sepolta in un commento.
    //
    // Il rilevamento è una ricerca di sottostringa letterale sul testo grezzo:
    // un file del prodotto d'asta che costruisce il nome a pezzi passa. Il
    // limite è PREESISTENTE — la versione che vietava a chiunque di nominare il
    // contratto si aggirava allo stesso modo — e non è stato allargato qui.
    //
    // SE UN GIORNO QUALCUNO IRROBUSTISCE IL RILEVAMENTO (analisi vera degli
    // specificatori al posto della sottostringa), QUESTO TEST DIVENTA ROSSO. È
    // il comportamento voluto: significa che il buco è stato chiuso, e allora
    // questo test va GIRATO — le due attese qui sotto diventano `toHaveLength(1)`
    // — non cancellato. Un test rosso qui è una buona notizia da leggere, non un
    // guasto da mettere a tacere.
    const composto = [
      "const nome = [\"prematch\", \"-\", \"contract\"].join(\"\");",
      "const m = await import(`../../${nome}/src/index.js`);",
    ].join("\n");
    expect(mentionViolations("packages/engine/src/finto.ts", composto)).toEqual([]);

    // Stessa storia per il tramite esente: chi sa comporre un nome sa comporre
    // anche l'altro, e la porta di servizio si riapre per la stessa via.
    const compostoTramite = [
      "const nome = [\"prematch\", \"-\", \"reader\"].join(\"\");",
      "const m = await import(`../packages/${nome}/src/readDeposit.js`);",
    ].join("\n");
    expect(mentionViolations("src/finto.ts", compostoTramite)).toEqual([]);

    // Ciò che invece la guardia vede, e che questo test non deve far sembrare
    // aggirabile: lo stesso import scritto com'è resta una violazione.
    expect(
      mentionViolations("packages/engine/src/finto.ts", 'const m = await import("../../prematch-contract/src/index.js");'),
    ).toHaveLength(1);
  });
});
