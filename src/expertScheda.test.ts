import { describe, it, expect } from "vitest";
import {
  EXPERT_INSIGHT_AVAILABILITIES,
  EXPERT_INSIGHT_QUALITY_LABELS,
  EXPERT_SCHEDA_SCHEMA_KEYS,
  EXPERT_SCHEDA_SCHEMA_VERSION,
  EXPERT_SCHEDE_ABSENT,
  LISTA_ESPERTI_VALUES,
  SCHEDA_BALLOTTAGGIO_MAX,
  SCHEDA_NOTA_MARCATURA_MODELLO,
  SCHEDA_NOTA_MARCATURA_PAROLE,
  SCHEDA_NOTA_MAX,
  leggiNota,
  SCHEDA_RANGO_MAX,
  SCHEDA_RANGO_MIN,
  expertSchedaStore,
  findSchedaCandidates,
  indexSchede,
  indexSchedeByClub,
  isValidIsoDate,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
  resolveListaEsperti,
  schedaHasContent,
  stessoSoggettoBallottaggio,
  unknownExpertInsight,
  type ExpertInsightAvailability,
  type ExpertScheda,
  type ExpertSchedaStore,
} from "./expertScheda.js";
import { pagellaVuota } from "./pagellaEsperti.js";
import { listonePlayerKey } from "./ui/listone.js";

// Solo fixture sintetiche: «Dario Placeholder», «ClubQuattro» e compagnia non
// sono e non possono diventare giocatori o squadre reali — stessa regola di
// e2e/fixtures/ e src/ui/warBoard.test.ts. Nessun handle di persona reale,
// nessun URL di forum, nessun testo editoriale di terzi.

const PLAYER = "Dario Placeholder";
const CLUB = "ClubQuattro";
const KEY = listonePlayerKey({ name: PLAYER, club: CLUB });
/** La riga di listone da cui il riquadro cerca: nome + squadra, mai una chiave. */
const TARGET = { name: PLAYER, club: CLUB } as const;

function deposit(schede: readonly unknown[]): string {
  return JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede });
}

function storeOf(schede: readonly ExpertScheda[]): ExpertSchedaStore {
  return expertSchedaStore(schede);
}

const FULL: ExpertScheda = {
  player: PLAYER,
  club: CLUB,
  titolarita: "ballottaggio",
  percentuale: 60,
  gerarchia: 2,
  rigori: "designato",
  piazzati: ["punizioni", "angoli"],
  avvisi: ["mercato"],
  nota: "Rinnovo non firmato: se parte a fine mercato la scheda cambia.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
};

describe("deposito delle schede — validazione fail-closed", () => {
  it("assente, illeggibile e non conforme sono tre motivi distinti", () => {
    expect(parseExpertSchedaDeposit(null)).toEqual(EXPERT_SCHEDE_ABSENT);
    expect(parseExpertSchedaDeposit("{ non json")).toEqual({ ok: false, reason: "unreadable" });
    expect(parseExpertSchedaDeposit(JSON.stringify({ schede: [] }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("accetta una scheda con la sola identità e una scheda piena", () => {
    const parsed = parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB }, FULL]));
    expect(parsed.ok).toBe(true);
  });

  // IL NO-GO, ESEGUIBILE. `.strict()` è ciò che rende un campo direttivo un
  // errore di validazione invece di una chiave che passa in silenzio e finisce
  // a schermo. `assertExpertInsightNotDirective()` (privato) fa la stessa
  // guardia sul proprio payload; questa è la sua controparte sul confine di
  // lettura del core pubblico, non una sua sostituzione.
  it.each([
    ["value", 12],
    ["fair_to_me", 30],
    ["fairToMe", 30],
    ["target_band", "10-20"],
    ["prezzo", 15],
    ["maxBid", 40],
    ["consiglioAsta", "spingi"],
    ["raccomandazione", "compralo"],
  ])("rifiuta il campo direttivo %s", (key, val) => {
    const parsed = parseExpertSchedaDeposit(
      deposit([{ player: PLAYER, club: CLUB, [key as string]: val }]),
    );
    expect(parsed).toEqual({ ok: false, reason: "invalid" });
  });

  it("rifiuta una nota oltre il limite dichiarato invece di troncarla", () => {
    const tooLong = "a".repeat(SCHEDA_NOTA_MAX + 1);
    expect(parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, nota: tooLong }]))).toEqual({
      ok: false,
      reason: "invalid",
    });
    const atLimit = "a".repeat(SCHEDA_NOTA_MAX);
    expect(parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, nota: atLimit }])).ok).toBe(
      true,
    );
  });

  it("rifiuta valori fuori vocabolario e date che non esistono", () => {
    expect(
      parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, titolarita: "panchinaro" }])),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, aggiornata: "2026-02-30" }])),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-08-30")).toBe(true);
  });

  it("rifiuta una scheda senza identità: senza nome e squadra non si aggancia a niente", () => {
    expect(parseExpertSchedaDeposit(deposit([{ club: CLUB, nota: "x" }]))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: "", nota: "x" }]))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("indicizza con la stessa chiave del listone e conserva le collisioni", () => {
    const index = indexSchede([FULL, { player: PLAYER, club: CLUB, nota: "seconda" }]);
    expect([...index.keys()]).toEqual([KEY]);
    expect(index.get(KEY)).toHaveLength(2);
  });
});

describe("i cinque stati di disponibilità", () => {
  it("source_unavailable — il deposito non è stato letto", () => {
    const view = resolveExpertInsight(EXPERT_SCHEDE_ABSENT, TARGET);
    expect(view.availability).toBe("source_unavailable");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.source_unavailable);
  });

  it("no_expert_signal — deposito letto, scheda non ancora scritta", () => {
    const view = resolveExpertInsight(storeOf([]), TARGET);
    expect(view.availability).toBe("no_expert_signal");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.no_expert_signal);
  });

  it("no_expert_signal — anche senza giocatore selezionato, e su una scheda aperta ma vuota", () => {
    expect(resolveExpertInsight(storeOf([FULL]), null).availability).toBe("no_expert_signal");
    const empty: ExpertScheda = { player: PLAYER, club: CLUB, aggiornata: "2026-08-30", fonte: "staff" };
    expect(schedaHasContent(empty)).toBe(false);
    expect(resolveExpertInsight(storeOf([empty]), TARGET).availability).toBe("no_expert_signal");
  });

  it("identity_not_resolved — due schede sullo stesso giocatore, nessuna delle due scelta", () => {
    const view = resolveExpertInsight(
      storeOf([FULL, { player: PLAYER, club: CLUB, nota: "seconda scheda" }]), TARGET,
    );
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved);
    expect(view.nota).toBe("");
  });

  it("author_authority_not_verified — fonte non di staff, contenuto non attribuibile", () => {
    const view = resolveExpertInsight(storeOf([{ ...FULL, fonte: "community" }]), TARGET);
    expect(view.availability).toBe("author_authority_not_verified");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.author_authority_not_verified);
    expect(view.titolarita).toBeNull();
    expect(view.nota).toBe("");
  });

  it("«stampa» ARRIVA A SCHERMO: e' autorevole, non e' community", () => {
    // La riga di provenienza dira' «fonti di stampa» e il lettore giudichera'.
    // Se questo valore finisse nel ramo di `community` il contenuto sparirebbe,
    // e scriverlo sarebbe stato inutile: e' la differenza fra qualificare una
    // fonte e nasconderla.
    const view = resolveExpertInsight(storeOf([{ ...FULL, fonte: "stampa" }]), TARGET);
    expect(view.availability).toBe("available");
    expect(view.fonte).toBe("stampa");
  });

  it("available — la scheda piena arriva intera alla vista", () => {
    const view = resolveExpertInsight(storeOf([FULL]), TARGET);
    expect(view).toEqual({
      availability: "available",
      quality: EXPERT_INSIGHT_QUALITY_LABELS.available,
      contributesToIndex: false,
      validated: false,
      directive: false,
      // Nome identico a quello del listone: nessuna domanda, nessun aggancio
      // dedotto da dichiarare.
      candidates: [],
      chosenSchedaKey: null,
      matchedBy: "exact",
      matchedPlayer: PLAYER,
      titolarita: "ballottaggio",
      percentuale: 60,
      // La fixture non dichiara con CHI: l'elenco degli altri è vuoto, non
      // assente e non inventato.
      ballottaggio: [],
      gerarchia: 2,
      rigori: "designato",
      // LA FIXTURE NON DICHIARA NESSUN RANGO, e i tre campi arrivano `null`:
      // assente vuol dire «non dichiarato», mai uno zero e mai un «1» dedotto
      // dalla designazione.
      rangoRigori: null,
      piazzati: ["punizioni", "angoli"],
      rangoPunizioni: null,
      rangoAngoli: null,
      avvisi: ["mercato"],
      // `mercato` non è una delle tre liste editoriali: nessuna lista, quindi
      // nessuna quarta icona.
      lista: null,
      nota: "Rinnovo non firmato: se parte a fine mercato la scheda cambia.",
      // La fixture scrive la prosa a mano: nessuna marcatura, e il campo dice
      // `false` invece di dedurre una provenienza umana che nessuno dichiara.
      notaGenerataDaModello: false,
      aggiornata: "2026-08-30",
      fonte: "scheda",
      // La scheda di questa fixture NON porta la pagella: la vista la rende
      // comunque, VUOTA — cinque assi senza voto e nessun totale. Non è un
      // `null` da gestire a valle, ed è ciò che il riquadro rende oggi su ogni
      // giocatore (src/pagellaEsperti.ts). `TARGET` non porta il ruolo, quindi
      // il quarto asse è `ruolo_ignoto` invece di essere indovinato.
      pagella: pagellaVuota(),
    });
  });

  it("available — una scheda di sola prosa è valida e conserva la sua prosa", () => {
    const view = resolveExpertInsight(
      storeOf([{ player: PLAYER, club: CLUB, nota: "Due righe e nient'altro." }]), TARGET,
    );
    expect(view.availability).toBe("available");
    expect(view.nota).toBe("Due righe e nient'altro.");
    expect(view.titolarita).toBeNull();
    expect(view.piazzati).toEqual([]);
    expect(view.fonte).toBeNull();
  });

  // Una percentuale senza titolarità è un numero senza soggetto: al riquadro
  // arriverebbe una barra riempita al 60% che non dice di che cosa.
  it("scarta la percentuale quando la titolarità non è dichiarata", () => {
    const view = resolveExpertInsight(storeOf([{ player: PLAYER, club: CLUB, percentuale: 60, nota: "x" }]), TARGET);
    expect(view.availability).toBe("available");
    expect(view.percentuale).toBeNull();
  });

  // I QUATTRO STATI «NON LO SO» DEVONO SEMBRARE «NON LO SO». Nessun residuo di
  // contenuto sopravvive a uno stato che dichiara di non averne: un riquadro
  // che conserva metà scheda mentre dice di non averla si legge come pieno.
  it.each(
    EXPERT_INSIGHT_AVAILABILITIES.filter((a) => a !== "available") as readonly Exclude<
      ExpertInsightAvailability,
      "available"
    >[],
  )("lo stato %s non porta nessun contenuto", (availability) => {
    const view = unknownExpertInsight(availability);
    expect(view.titolarita).toBeNull();
    expect(view.percentuale).toBeNull();
    expect(view.gerarchia).toBeNull();
    expect(view.rigori).toBeNull();
    expect(view.piazzati).toEqual([]);
    expect(view.avvisi).toEqual([]);
    expect(view.nota).toBe("");
    expect(view.aggiornata).toBeNull();
    expect(view.fonte).toBeNull();
  });

  it("ogni stato porta la propria etichetta e i tre fatti di onestà", () => {
    const views = [
      resolveExpertInsight(storeOf([FULL]), TARGET),
      ...EXPERT_INSIGHT_AVAILABILITIES.filter((a) => a !== "available").map((a) =>
        unknownExpertInsight(a as Exclude<ExpertInsightAvailability, "available">),
      ),
    ];
    expect(views.map((v) => v.availability).sort()).toEqual([...EXPERT_INSIGHT_AVAILABILITIES].sort());
    for (const view of views) {
      expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS[view.availability]);
      expect(view.validated).toBe(false);
      expect(view.directive).toBe(false);
      expect(view.contributesToIndex).toBe(false);
    }
  });

  // Controparte pubblica di `assertExpertInsightNotDirective()` (privato,
  // packages/gruppo-esperti/src/insightComponent.ts): stessi pattern, stessa
  // normalizzazione della chiave, applicati alla vista che il riquadro rende.
  it("nessun nome di campo direttivo nella vista, in nessuno stato", () => {
    const patterns = [/^value/, /^fairtome/, /^targetband/, /^prezzo/, /^price/, /^consiglioasta/, /^maxbid/, /^raccomandazione/];
    const views = [
      resolveExpertInsight(storeOf([FULL]), TARGET),
      ...EXPERT_INSIGHT_AVAILABILITIES.filter((a) => a !== "available").map((a) =>
        unknownExpertInsight(a as Exclude<ExpertInsightAvailability, "available">),
      ),
    ];
    for (const view of views) {
      for (const key of Object.keys(view)) {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        expect(patterns.some((p) => p.test(normalized))).toBe(false);
      }
    }
  });
});

// ── I DUE CAMPI DELLE ICONE: gli altri in ballottaggio e la lista editoriale ──
//
// Sono i due dati che il riquadro non aveva e che le icone accanto al radar
// mostrano (src/ui/schedaIcone.ts). Qui si prova il CONTRATTO: che cosa il
// deposito accetta, che cosa rifiuta, e che cosa la vista lascia passare.

describe("gli altri in ballottaggio — il contratto", () => {
  const conAltri = (ballottaggio: unknown, titolarita: unknown = "ballottaggio") =>
    parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, titolarita, ballottaggio }]));

  it("accetta un elenco di soggetti con e senza quota", () => {
    expect(conAltri([{ surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 40 }]).ok).toBe(
      true,
    );
    expect(conAltri([{ surface: "Bruna Placeholder", club: "ClubUno" }]).ok).toBe(true);
    expect(conAltri([]).ok).toBe(true);
  });

  it("accetta anche un soggetto SENZA squadra: è la forma dei depositi già scritti", () => {
    // La squadra è facoltativa apposta. Renderla obbligatoria avrebbe fatto
    // rifiutare il file INTERO — il lettore è fail-closed — a ogni deposito
    // scritto prima che questa metà esistesse.
    expect(conAltri([{ surface: "Bruna Placeholder", sharePercent: 40 }]).ok).toBe(true);
    expect(conAltri([{ surface: "Bruna Placeholder" }]).ok).toBe(true);
  });

  it("rifiuta un soggetto senza nome, con quota fuori scala o non intera", () => {
    expect(conAltri([{ surface: "" }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", sharePercent: 101 }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", sharePercent: -1 }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", sharePercent: 40.5 }]).ok).toBe(false);
  });

  it("rifiuta una squadra vuota o oltre il tetto: `\"\"` non è «non dichiarata»", () => {
    // L'assenza si scrive TOGLIENDO la chiave, non scrivendoci dentro il
    // vuoto: una squadra `""` sarebbe un'assenza travestita da valore, e i due
    // casi si leggerebbero uguali dove contano.
    expect(conAltri([{ surface: "Bruna Placeholder", club: "" }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", club: "   " }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", club: "C".repeat(81) }]).ok).toBe(false);
  });

  it("due omonimi pieni di club diversi sono DUE soggetti, e il contratto li tiene", () => {
    // Il caso per cui `club` esiste: col solo nome producevano lo stesso
    // valore depositato ed erano indistinguibili dopo il salvataggio.
    const store = conAltri([
      { surface: "Bruna Placeholder", club: "ClubUno", sharePercent: 35 },
      { surface: "Bruna Placeholder", club: "ClubDue", sharePercent: 25 },
    ]);
    expect(store.ok).toBe(true);
    const view = resolveExpertInsight(store, TARGET);
    expect(view.ballottaggio.map((s) => s.club)).toEqual(["ClubUno", "ClubDue"]);
  });

  // Lo `.strict()` vale anche DENTRO l'elenco: è il punto cieco classico di
  // uno schema rigido solo al primo livello.
  it("rifiuta una chiave in più dentro un soggetto, direttiva o no", () => {
    expect(conAltri([{ surface: "Bruna Placeholder", prezzo: 12 }]).ok).toBe(false);
    expect(conAltri([{ surface: "Bruna Placeholder", note: "x" }]).ok).toBe(false);
  });

  it("rifiuta un elenco oltre il tetto dichiarato invece di troncarlo", () => {
    const soggetti = Array.from({ length: SCHEDA_BALLOTTAGGIO_MAX }, (_, i) => ({
      surface: `Segnaposto ${i + 1}`,
    }));
    expect(conAltri(soggetti).ok).toBe(true);
    expect(conAltri([...soggetti, { surface: "Uno di troppo" }]).ok).toBe(false);
  });

  it("la vista li porta solo insieme a una titolarità «ballottaggio»", () => {
    const altri = [{ surface: "Bruna Placeholder", sharePercent: 40 }];
    const dentro = resolveExpertInsight(
      storeOf([{ player: PLAYER, club: CLUB, titolarita: "ballottaggio", ballottaggio: altri }]),
      TARGET,
    );
    expect(dentro.ballottaggio).toEqual(altri);
    for (const titolarita of ["titolare", "riserva"] as const) {
      const fuori = resolveExpertInsight(
        storeOf([{ player: PLAYER, club: CLUB, titolarita, ballottaggio: altri }]),
        TARGET,
      );
      expect(fuori.ballottaggio, `titolarità ${titolarita}`).toEqual([]);
    }
  });

  // ── «SONO LA STESSA PERSONA?», scritta una volta sola ──────────────────
  //
  // Tre regole la pongono — il doppione nello stesso elenco, «il giocatore
  // stesso non entra», e il soggetto che nessuna riga del listone porta — e
  // rispondono tutte e tre con questa funzione. Tre copie sarebbero tre
  // regole, e divergerebbero proprio sul ramo che può mancare.
  it("stessoSoggettoBallottaggio: identità piena quando la squadra c'è da tutte e due le parti", () => {
    const uno = { surface: "Bruna Placeholder", club: "ClubUno" };
    expect(stessoSoggettoBallottaggio(uno, { surface: "bruna  placeholder", club: "clubuno" })).toBe(
      true,
    );
    expect(stessoSoggettoBallottaggio(uno, { surface: "Bruna Placeholder", club: "ClubDue" })).toBe(
      false,
    );
    expect(stessoSoggettoBallottaggio(uno, { surface: "Carlo Segnaposto", club: "ClubUno" })).toBe(
      false,
    );
  });

  it("stessoSoggettoBallottaggio: senza una delle due squadre risponde sul nome — fail-closed", () => {
    // Non si può sapere se siano la stessa persona. La direzione sicura è
    // trattarle come tali: il contrario lascerebbe entrare due quote per la
    // stessa persona senza che nessuno lo dica.
    const senzaClub = { surface: "Bruna Placeholder" };
    expect(stessoSoggettoBallottaggio(senzaClub, { surface: "Bruna Placeholder" })).toBe(true);
    expect(
      stessoSoggettoBallottaggio(senzaClub, { surface: "Bruna Placeholder", club: "ClubUno" }),
    ).toBe(true);
    expect(
      stessoSoggettoBallottaggio({ surface: "Bruna Placeholder", club: "ClubUno" }, senzaClub),
    ).toBe(true);
    expect(stessoSoggettoBallottaggio(senzaClub, { surface: "Carlo Segnaposto" })).toBe(false);
  });

  it("una scheda che porta SOLO gli altri in ballottaggio non è una scheda vuota", () => {
    expect(
      schedaHasContent({
        player: PLAYER,
        club: CLUB,
        ballottaggio: [{ surface: "Bruna Placeholder" }],
      }),
    ).toBe(true);
  });
});

// ── IL RANGO DEI TRE INCARICHI ───────────────────────────────────────────────
//
// La fonte pubblica ELENCHI ORDINATI, non insiemi: «Rigoristi: A, B, C» dice
// che A tira, e che B tira quando A non c'è. Le prove qui sotto tengono ferme
// le tre regole che rendono quel numero un fatto invece di un'opinione:
//
//  a. RETRO-COMPATIBILITÀ. I depositi già scritti non hanno i tre campi e
//     restano validi — se non lo fossero, l'aggiornamento butterebbe ~200
//     schede tutte insieme, perché il lettore è fail-closed sul FILE e non
//     sulla riga.
//  b. ASSENTE = NON DICHIARATO. Mai uno zero, mai un rango dedotto dalla
//     designazione o dall'ordine in cui le schede sono scritte.
//  c. UN RANGO SENZA LA SUA FILA È UN RIFIUTO. Non è un'assenza: è una
//     contraddizione, e sceglierne una lettura significherebbe inventare.

describe("il rango di rigori, punizioni e angoli — il contratto", () => {
  it("un deposito scritto PRIMA di questa forma resta valido, e i tre ranghi sono `null`", () => {
    const view = resolveExpertInsight(storeOf([FULL]), TARGET);
    expect(view.availability).toBe("available");
    expect(view.rangoRigori).toBeNull();
    expect(view.rangoPunizioni).toBeNull();
    expect(view.rangoAngoli).toBeNull();
  });

  it("porta i tre ranghi fino alla vista quando la scheda li dichiara", () => {
    const view = resolveExpertInsight(
      storeOf([{ ...FULL, rangoRigori: 1, rangoPunizioni: 2, rangoAngoli: 3 }]),
      TARGET,
    );
    expect(view.rangoRigori).toBe(1);
    expect(view.rangoPunizioni).toBe(2);
    expect(view.rangoAngoli).toBe(3);
  });

  it("accetta il deposito con i tre ranghi e li rilegge identici", () => {
    const parsed = parseExpertSchedaDeposit(
      deposit([{ ...FULL, rangoRigori: 1, rangoPunizioni: 2, rangoAngoli: 3 }]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const scheda = parsed.byPlayerKey.get(KEY)?.[0];
    expect(scheda?.rangoRigori).toBe(1);
    expect(scheda?.rangoPunizioni).toBe(2);
    expect(scheda?.rangoAngoli).toBe(3);
  });

  // FAIL-CLOSED, e sul FILE: metà deposito sarebbe peggio di nessun deposito.
  it.each([
    ["rangoRigori", { rangoRigori: 2 }],
    ["rangoPunizioni", { rangoPunizioni: 1 }],
    ["rangoAngoli", { rangoAngoli: 1 }],
  ])("rifiuta %s scritto senza la fila che ordina", (_nome, campo) => {
    const parsed = parseExpertSchedaDeposit(
      deposit([{ player: PLAYER, club: CLUB, nota: "Solo prosa.", ...campo }]),
    );
    expect(parsed).toEqual({ ok: false, reason: "invalid" });
  });

  it("rifiuta il rango di una specialità che la scheda non nomina fra i piazzati", () => {
    // Le punizioni ci sono, gli angoli no: il rango degli angoli è orfano.
    const parsed = parseExpertSchedaDeposit(
      deposit([{ player: PLAYER, club: CLUB, piazzati: ["punizioni"], rangoAngoli: 1 }]),
    );
    expect(parsed).toEqual({ ok: false, reason: "invalid" });
  });

  it("la fila SENZA rango resta valida: dice una cosa vera e una cosa in meno", () => {
    const view = resolveExpertInsight(
      storeOf([{ player: PLAYER, club: CLUB, piazzati: ["angoli"] }]),
      TARGET,
    );
    expect(view.availability).toBe("available");
    expect(view.piazzati).toEqual(["angoli"]);
    expect(view.rangoAngoli).toBeNull();
  });

  it("rifiuta uno zero, un decimale e un numero oltre il tetto dichiarato", () => {
    for (const rango of [0, -1, 1.5, SCHEDA_RANGO_MAX + 1]) {
      expect(
        parseExpertSchedaDeposit(
          deposit([{ player: PLAYER, club: CLUB, rigori: "designato", rangoRigori: rango }]),
        ),
        String(rango),
      ).toEqual({ ok: false, reason: "invalid" });
    }
    expect(
      parseExpertSchedaDeposit(
        deposit([
          { player: PLAYER, club: CLUB, rigori: "designato", rangoRigori: SCHEDA_RANGO_MIN },
        ]),
      ).ok,
    ).toBe(true);
  });

  // L'ORDINE DELLE CHIAVI È UN FATTO: zod ricostruisce nell'ordine della
  // propria `shape` e il compilatore scrive nello stesso. Se divergessero,
  // scarica → reimporta → riscarica renderebbe file diversi a parità di
  // contenuto — il difetto già successo una volta sui voti della pagella.
  it("ogni rango sta nello schema SUBITO DOPO la fila che ordina", () => {
    const keys = [...EXPERT_SCHEDA_SCHEMA_KEYS];
    expect(keys[keys.indexOf("rigori") + 1]).toBe("rangoRigori");
    expect(keys[keys.indexOf("piazzati") + 1]).toBe("rangoPunizioni");
    expect(keys[keys.indexOf("piazzati") + 2]).toBe("rangoAngoli");
  });

  // Il rango NON è un fatto in più che rende «compilata» una scheda vuota: non
  // può esistere senza la propria fila, e la fila da sola già bastava.
  it("non esiste una scheda che dica soltanto un rango", () => {
    expect(
      parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, rangoPunizioni: 1 }])),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("la lista editoriale — il contratto", () => {
  it("accetta le tre liste e rifiuta qualunque altra parola", () => {
    for (const lista of LISTA_ESPERTI_VALUES) {
      expect(
        parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, lista }])).ok,
        lista,
      ).toBe(true);
    }
    expect(
      parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, lista: "da_prendere" }])).ok,
    ).toBe(false);
  });

  it("arriva alla vista come sta scritta", () => {
    for (const lista of LISTA_ESPERTI_VALUES) {
      const view = resolveExpertInsight(storeOf([{ player: PLAYER, club: CLUB, lista }]), TARGET);
      expect(view.lista, lista).toBe(lista);
    }
  });

  it("nessuna lista dichiarata: la vista dice `null`, non una lista di comodo", () => {
    expect(resolveExpertInsight(storeOf([FULL]), TARGET).lista).toBeNull();
    for (const stato of EXPERT_INSIGHT_AVAILABILITIES.filter((a) => a !== "available")) {
      const view = unknownExpertInsight(stato as Exclude<ExpertInsightAvailability, "available">);
      expect(view.lista, stato).toBeNull();
      expect(view.ballottaggio, stato).toEqual([]);
    }
  });

  // L'avviso `sconsigliato` è la sola delle tre liste che il deposito produce
  // oggi: le due strade portano allo stesso fatto e non restano due verità.
  it("l'avviso «sconsigliato» vale come lista, anche senza il campo", () => {
    expect(resolveListaEsperti({ player: PLAYER, club: CLUB, avvisi: ["sconsigliato"] })).toBe(
      "sconsigliato",
    );
    expect(resolveListaEsperti({ player: PLAYER, club: CLUB, avvisi: ["mercato"] })).toBeNull();
  });

  it("scheda che si contraddice: vince l'avviso, non la promozione", () => {
    expect(
      resolveListaEsperti({
        player: PLAYER,
        club: CLUB,
        lista: "consigliato",
        avvisi: ["sconsigliato"],
      }),
    ).toBe("sconsigliato");
    expect(
      resolveListaEsperti({
        player: PLAYER,
        club: CLUB,
        lista: "possibile_sorpresa",
        avvisi: ["sconsigliato"],
      }),
    ).toBe("sconsigliato");
  });

  it("una scheda che porta SOLO la lista non è una scheda vuota", () => {
    expect(schedaHasContent({ player: PLAYER, club: CLUB, lista: "consigliato" })).toBe(true);
    const view = resolveExpertInsight(
      storeOf([{ player: PLAYER, club: CLUB, lista: "consigliato" }]),
      TARGET,
    );
    expect(view.availability).toBe("available");
  });
});

// ── L'AGGANCIO DEL NOME AL LISTONE ───────────────────────────────────────────
//
// Il difetto che questo blocco difende è INVISIBILE quando c'è: una scheda
// scritta a mano su «Dario Placeholder» accanto a una riga di listone che dice
// «Placeholder» spariva, e il riquadro dichiarava che la scheda non era stata
// scritta. Nessun errore, nessun segno a schermo, e ~200 schede compilate a
// mano che potevano perdersi una alla volta senza che nessuno se ne accorgesse.
//
// Ogni prova qui sotto è sulla REGOLA, non su una soglia: squadra uguale,
// uguaglianza piena, contenimento di token nei due versi. Non ci sono numeri da
// tarare, quindi non c'è nessun numero da provare.

const OTHER_CLUB = "ClubUno";
/** Il cognome nudo, come lo scrive il listone della lega. */
const SHORT = "Placeholder";
const SHORT_TARGET = { name: SHORT, club: CLUB } as const;
const shortScheda = (player: string, nota: string): ExpertScheda => ({ player, club: CLUB, nota });

describe("l'aggancio della scheda alla riga di listone", () => {
  it("il caso che motiva tutto: la scheda porta il nome intero, il listone il cognome", () => {
    const view = resolveExpertInsight(storeOf([shortScheda(PLAYER, "Nota della scheda.")]), SHORT_TARGET);
    expect(view.availability).toBe("available");
    expect(view.nota).toBe("Nota della scheda.");
    // L'aggancio è DEDOTTO, quindi è dichiarato: su quale nome sia scritta la
    // scheda deve poterlo leggere chi guarda, o un aggancio sbagliato sarebbe
    // silenzioso quanto la scheda che spariva.
    expect(view.matchedBy).toBe("contained");
    expect(view.matchedPlayer).toBe(PLAYER);
  });

  it("vale anche nel verso opposto: scheda col cognome, listone col nome intero", () => {
    const view = resolveExpertInsight(storeOf([shortScheda(SHORT, "Solo cognome.")]), {
      name: PLAYER,
      club: CLUB,
    });
    expect(view.availability).toBe("available");
    expect(view.matchedBy).toBe("contained");
    expect(view.matchedPlayer).toBe(SHORT);
  });

  // Il difetto che «contenimento di token» esiste per NON avere: con una piega
  // che unisce tutto in una stringa sola, «Placeholder» aggancerebbe
  // «Placeholderini» per sottostringa grezza.
  it("un nome che INIZIA come un altro non è lo stesso nome", () => {
    const store = storeOf([shortScheda("Placeholderini", "Altro giocatore.")]);
    expect(resolveExpertInsight(store, SHORT_TARGET).availability).toBe("no_expert_signal");
    expect(findSchedaCandidates(store, SHORT_TARGET)).toEqual([]);
  });

  it("la squadra è un muro: nome identico in un'altra squadra non aggancia mai", () => {
    const store = storeOf([{ player: PLAYER, club: OTHER_CLUB, nota: "Omonimo altrove." }]);
    expect(resolveExpertInsight(store, TARGET).availability).toBe("no_expert_signal");
    expect(resolveExpertInsight(store, { name: PLAYER, club: OTHER_CLUB }).availability).toBe(
      "available",
    );
  });

  it("accenti e punteggiatura non rompono l'uguaglianza piena", () => {
    const view = resolveExpertInsight(storeOf([{ player: "Dário Placeholder", club: CLUB, nota: "x" }]), TARGET);
    expect(view.availability).toBe("available");
    expect(view.matchedBy).toBe("exact");
  });

  // Senza questa precedenza il listone «Placeholder» con accanto una scheda
  // «Placeholder» e una «Dario Placeholder» farebbe una domanda avendo già in
  // mano la risposta giusta.
  it("l'uguaglianza piena vince sul contenimento, e chiude la ricerca", () => {
    const store = storeOf([
      shortScheda(PLAYER, "Nome intero."),
      shortScheda(SHORT, "Cognome nudo."),
    ]);
    const view = resolveExpertInsight(store, SHORT_TARGET);
    expect(findSchedaCandidates(store, SHORT_TARGET).map((g) => g.player)).toEqual([SHORT]);
    expect(view.availability).toBe("available");
    expect(view.nota).toBe("Cognome nudo.");
    expect(view.matchedBy).toBe("exact");
    expect(view.candidates).toEqual([]);
  });
});

describe("due schede possibili: la scelta è di Pico, non dell'app", () => {
  const AMBIGUOUS = [
    shortScheda(PLAYER, "Prima scheda."),
    shortScheda("Bruno Placeholder", "Seconda scheda."),
  ] as const;
  const store = storeOf(AMBIGUOUS);
  const firstKey = listonePlayerKey({ name: PLAYER, club: CLUB });
  const secondKey = listonePlayerKey({ name: "Bruno Placeholder", club: CLUB });

  it("senza risposta non si sceglie: la domanda, e nessun contenuto", () => {
    const view = resolveExpertInsight(store, SHORT_TARGET);
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved);
    expect(view.chosenSchedaKey).toBeNull();
    expect(view.candidates.map((c) => c.player)).toEqual([PLAYER, "Bruno Placeholder"]);
    // I candidati portano il nome COME SCRITTO sulla scheda: è ciò che Pico
    // rilegge per rispondere. Una superficie piegata non gli direbbe niente.
    expect(view.candidates.every((c) => c.club === CLUB && c.count === 1)).toBe(true);
    expect(view.nota).toBe("");
    expect(view.titolarita).toBeNull();
  });

  it("la risposta aggancia quella scheda, e resta cambiabile", () => {
    const view = resolveExpertInsight(store, SHORT_TARGET, secondKey);
    expect(view.availability).toBe("available");
    expect(view.nota).toBe("Seconda scheda.");
    expect(view.matchedBy).toBe("chosen");
    expect(view.matchedPlayer).toBe("Bruno Placeholder");
    expect(view.chosenSchedaKey).toBe(secondKey);
    // I candidati restano nella vista anche DOPO la scelta: il riquadro deve
    // poter offrire il cambio, o una risposta data in due secondi durante
    // un'asta diventa irreversibile.
    expect(view.candidates).toHaveLength(2);
    expect(resolveExpertInsight(store, SHORT_TARGET, firstKey).nota).toBe("Prima scheda.");
  });

  // Il deposito è riscritto a mano fra una sessione e l'altra: una risposta di
  // ieri può puntare a una scheda che oggi non è più fra i candidati.
  it("una risposta che non punta più a niente riapre la domanda invece di agganciare a caso", () => {
    const view = resolveExpertInsight(store, SHORT_TARGET, "scheda-sparita__clubquattro");
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.chosenSchedaKey).toBeNull();
    expect(view.candidates).toHaveLength(2);
  });

  it("una risposta non può creare un aggancio dove la regola non ne trova", () => {
    const view = resolveExpertInsight(storeOf([]), SHORT_TARGET, firstKey);
    expect(view.availability).toBe("no_expert_signal");
    expect(view.matchedBy).toBeNull();
    expect(view.candidates).toEqual([]);
  });

  it("con un candidato solo la risposta è inerte: non sposta l'aggancio e non si registra", () => {
    const single = storeOf([shortScheda(PLAYER, "Unica.")]);
    const view = resolveExpertInsight(single, SHORT_TARGET, "qualunque-altra-chiave__clubquattro");
    expect(view.availability).toBe("available");
    expect(view.nota).toBe("Unica.");
    expect(view.chosenSchedaKey).toBeNull();
  });

  // Il caso storico — due schede sotto la STESSA identità — non è una scelta:
  // le due etichette sarebbero identiche. Resta «vanno unite a mano».
  it("due schede sotto la stessa identità restano da unire, senza domanda", () => {
    const view = resolveExpertInsight(
      storeOf([shortScheda(PLAYER, "Una."), shortScheda(PLAYER, "Due.")]),
      SHORT_TARGET,
    );
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.candidates).toEqual([]);
    expect(view.nota).toBe("");
  });

  it("scegliere un candidato che ne nasconde due lo dice, e lascia cambiare", () => {
    const view = resolveExpertInsight(
      storeOf([shortScheda(PLAYER, "Una."), shortScheda(PLAYER, "Due."), shortScheda("Bruno Placeholder", "Altra.")]),
      SHORT_TARGET,
      firstKey,
    );
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.nota).toBe("");
    expect(view.candidates.find((c) => c.schedaKey === firstKey)?.count).toBe(2);
    expect(view.chosenSchedaKey).toBe(firstKey);
  });

  it("gli altri stati sopravvivono alla scelta: una fonte non di staff resta non attribuibile", () => {
    const view = resolveExpertInsight(
      storeOf([
        { player: PLAYER, club: CLUB, nota: "Prima.", fonte: "community" },
        shortScheda("Bruno Placeholder", "Seconda."),
      ]),
      SHORT_TARGET,
      firstKey,
    );
    expect(view.availability).toBe("author_authority_not_verified");
    expect(view.nota).toBe("");
    expect(view.candidates).toHaveLength(2);
  });
});

describe("l'indice per squadra e i confini della ricerca", () => {
  it("raggruppa per squadra piegata e conserva il nome come scritto", () => {
    const byClub = indexSchedeByClub(
      indexSchede([shortScheda(PLAYER, "x"), { player: "Aldo Prova", club: "  club quattro  ", nota: "y" }]),
    );
    expect([...byClub.keys()]).toEqual(["clubquattro", "club-quattro"]);
    expect(byClub.get("clubquattro")?.[0]?.player).toBe(PLAYER);
    expect(byClub.get("clubquattro")?.[0]?.nameTokens).toEqual(["dario", "placeholder"]);
  });

  it("un nome senza token non aggancia niente: nessuna prova non è un aggancio gratuito", () => {
    const store = storeOf([shortScheda(PLAYER, "x")]);
    expect(findSchedaCandidates(store, { name: "···", club: CLUB })).toEqual([]);
    expect(findSchedaCandidates(store, null)).toEqual([]);
    expect(findSchedaCandidates(EXPERT_SCHEDE_ABSENT, TARGET)).toEqual([]);
  });
});

describe("la marcatura di provenienza della prosa", () => {
  const TESTO = "La scheda lo dà titolare e non riporta ballottaggi.";

  it("le parole della pastiglia sono la marcatura senza le parentesi", () => {
    expect(SCHEDA_NOTA_MARCATURA_MODELLO).toBe(`[${SCHEDA_NOTA_MARCATURA_PAROLE}]`);
  });

  it("una nota marcata si separa in testo e provenienza", () => {
    expect(leggiNota(`${SCHEDA_NOTA_MARCATURA_MODELLO} ${TESTO}`)).toEqual({
      testo: TESTO,
      generataDaModello: true,
    });
  });

  it("una nota scritta a mano resta intera e non dichiara nessuna provenienza", () => {
    expect(leggiNota(TESTO)).toEqual({ testo: TESTO, generataDaModello: false });
  });

  it("assente o vuota: testo vuoto, mai `undefined` da gestire a valle", () => {
    expect(leggiNota(undefined)).toEqual({ testo: "", generataDaModello: false });
    expect(leggiNota("   ")).toEqual({ testo: "", generataDaModello: false });
  });

  it("il prefisso vale solo IN TESTA: a metà frase è testo della fonte", () => {
    const dentro = `Il forum scrive ${SCHEDA_NOTA_MARCATURA_MODELLO} a metà riga.`;
    expect(leggiNota(dentro)).toEqual({ testo: dentro, generataDaModello: false });
  });

  it("la marcatura sta DENTRO il tetto della nota, con spazio per il testo", () => {
    // Se un giorno la marcatura si allungasse fino a mangiarsi la prosa, il
    // produttore privato non avrebbe più margine e il difetto si vedrebbe solo
    // a valle, come depositi rifiutati in blocco.
    expect(SCHEDA_NOTA_MARCATURA_MODELLO.length).toBeLessThan(SCHEDA_NOTA_MAX);
  });

  it("la vista porta i due fatti separati: testo pulito e provenienza dichiarata", () => {
    const view = resolveExpertInsight(
      storeOf([
        { player: PLAYER, club: CLUB, nota: `${SCHEDA_NOTA_MARCATURA_MODELLO} ${TESTO}` },
      ]),
      TARGET,
    );
    expect(view.nota).toBe(TESTO);
    expect(view.notaGenerataDaModello).toBe(true);
  });

  it("il deposito conserva la marcatura: è la vista che la stacca, non il dato", () => {
    // La verificabilità sta nell'artefatto. Se un giorno lo strato di lettura
    // ripulisse la stringa PRIMA di depositarla, la provenienza sparirebbe dal
    // solo posto in cui è una prova.
    const nota = `${SCHEDA_NOTA_MARCATURA_MODELLO} ${TESTO}`;
    const store = parseExpertSchedaDeposit(deposit([{ player: PLAYER, club: CLUB, nota }]));
    expect(store.ok).toBe(true);
    if (!store.ok) return;
    expect([...store.byPlayerKey.values()][0]?.[0]?.nota).toBe(nota);
  });
});
