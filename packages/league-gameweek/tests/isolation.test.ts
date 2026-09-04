import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ISOLAMENTO DEL CONTRATTO DI GIORNATA — la guardia che tiene la Fase 2 fuori
// dal prodotto d'asta.
//
// Il contratto della giornata (Lineup Coach) non deve entrare nel motore
// d'asta né nella UI dell'asta: sono due fasi diverse dello stesso prodotto, e
// `docs/NO_GO.md` §Scope vieta al Lineup Coach di comparire nell'MVP d'asta.
// Il divieto è di perimetro, quindi la guardia è di import: se un giorno un
// file del motore importasse questo pacchetto, il perimetro sarebbe stato
// attraversato in silenzio.
//
// Stesso modello già in uso per `packages/appeal-index`. Fail-closed
// sull'estensione: un `.js` messo in una di queste radici importerebbe il
// pacchetto esattamente come un `.ts`.

/**
 * TUTTO IL RESTO DEL REPOSITORY, NON UN ELENCO SCELTO A MANO.
 *
 * La prima versione sorvegliava tre radici scritte a mano — `src`, il motore e
 * `opponent-profiles` — e una review indipendente ha mostrato il buco: `src/`
 * importa già oggi anche `identity-policy` e `xlsx-adapter`, che non erano
 * sorvegliati. Un import di questo pacchetto dentro uno di quelli, poi
 * consumato dalla UI, sarebbe passato inosservato: né il file intermedio né il
 * file della UI conterrebbero la stringa cercata.
 *
 * Ora le radici si CALCOLANO: la UI più ogni `packages/*//*src`, escluso questo
 * pacchetto. Un pacchetto nuovo entra nella sorveglianza il giorno in cui
 * nasce, senza che nessuno si ricordi di aggiungerlo a un elenco.
 */
/**
 * I PACCHETTI DELLA FASE 2, che possono conoscersi fra loro.
 *
 * `league-gameweek` è il contratto di giornata; `league-channel-contract` è il
 * contratto di osservazione della lega, e importa il primo per mestiere — è il
 * ponte fra la lettura della piattaforma e il calcolo. Sorvegliarlo qui lo
 * renderebbe rosso per la ragione sbagliata: l'import esiste ed è quello
 * previsto dal progetto.
 *
 * **L'esenzione non apre una porta di servizio**, e la ragione sta a valle:
 * `packages/league-channel-contract/tests/isolation.test.ts` vieta a chiunque —
 * motore d'asta e UI compresi — di importare *quel* pacchetto. Il motore non
 * può quindi raggiungere il contratto di giornata passando di lì, perché non
 * può raggiungere nemmeno il tramite. Le due guardie insieme chiudono la
 * catena; una sola no.
 *
 * La lista è chiusa e verificata sotto: un terzo pacchetto non può entrare in
 * esenzione senza che il test lo dica.
 */
const PHASE_TWO_PACKAGES: readonly string[] = ["league-gameweek", "league-channel-contract"];

function isolatedRoots(): readonly string[] {
  const roots = ["src"];
  for (const entry of readdirSync(join(REPO_ROOT, "packages"))) {
    if (PHASE_TWO_PACKAGES.includes(entry)) continue;
    const candidate = join(REPO_ROOT, "packages", entry, "src");
    try {
      if (statSync(candidate).isDirectory()) roots.push(`packages/${entry}/src`);
    } catch {
      // Un pacchetto senza `src/` non ha sorgenti da sorvegliare.
    }
  }
  return roots;
}
const WATCHED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

function sourceFiles(root: string): readonly string[] {
  const absolute = join(REPO_ROOT, root);
  const out: string[] = [];
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

describe("il contratto di giornata resta fuori dal prodotto d'asta", () => {
  it("nessun file del motore d'asta o della UI importa league-gameweek", () => {
    const offenders: string[] = [];
    for (const root of isolatedRoots()) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (/league-gameweek|leagueGameweek/.test(src)) offenders.push(file.slice(REPO_ROOT.length));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("le radici sorvegliate si calcolano da sole e non sono un elenco scritto a mano", () => {
    const roots = isolatedRoots();
    // La UI e almeno il motore, l'appeal-index e opponent-profiles: se questo
    // numero cala, qualcuno ha smesso di essere sorvegliato.
    expect(roots.length).toBeGreaterThanOrEqual(4);
    expect(roots).toContain("packages/engine/src");
    expect(roots).toContain("packages/appeal-index/src");
    expect(roots).not.toContain("packages/league-gameweek/src");
    expect(roots).not.toContain("packages/league-channel-contract/src");
    for (const root of roots) {
      expect(sourceFiles(root).length).toBeGreaterThan(0);
    }
  });

  it("l'esenzione della Fase 2 è chiusa a due pacchetti, ciascuno con una guardia VIVA", () => {
    // Un terzo nome in questa lista sarebbe un'esenzione senza guardia gemella,
    // cioè la strada per cui il motore d'asta tornerebbe a vedere la Fase 2
    // passando da un tramite non sorvegliato.
    expect(PHASE_TWO_PACKAGES).toEqual(["league-gameweek", "league-channel-contract"]);

    // NON BASTA CHE IL FILE ESISTA. La prima versione controllava solo
    // `statSync(...).isFile()`: svuotare la guardia gemella — cancellarne il
    // corpo, lasciando il file — non avrebbe fatto fallire niente, e
    // l'esenzione concessa qui sopra sarebbe diventata un buco vero mentre il
    // test continuava a passare. Quindi si guarda dentro: la guardia deve
    // calcolarsi le radici, camminare su `packages/`, dichiarare il pacchetto
    // che sorveglia e pretendere che la lista dei trasgressori sia vuota.
    for (const name of PHASE_TWO_PACKAGES) {
      const path = join(REPO_ROOT, "packages", name, "tests", "isolation.test.ts");
      expect(statSync(path).isFile()).toBe(true);
      const guard = readFileSync(path, "utf8");
      expect(guard).toMatch(/function isolatedRoots\(\)/);
      expect(guard).toMatch(/readdirSync\(join\(REPO_ROOT, "packages"\)\)/);
      expect(guard).toMatch(/expect\(offenders\)\.toEqual\(\[\]\)/);
      // Dichiara quale pacchetto sorveglia: una guardia che non nomina il
      // proprio bersaglio non è la guardia di quel bersaglio.
      expect(guard).toContain(name);
    }
  });
});
