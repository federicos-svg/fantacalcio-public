import { describe, it, expect } from "vitest";
import {
  EXPERT_INSIGHT_AVAILABILITIES,
  EXPERT_INSIGHT_QUALITY_LABELS,
  EXPERT_SCHEDA_SCHEMA_VERSION,
  EXPERT_SCHEDE_ABSENT,
  SCHEDA_NOTA_MAX,
  indexSchede,
  isValidIsoDate,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
  schedaHasContent,
  unknownExpertInsight,
  type ExpertInsightAvailability,
  type ExpertScheda,
  type ExpertSchedaStore,
} from "./expertScheda.js";
import { listonePlayerKey } from "./ui/listone.js";

// Solo fixture sintetiche: «Dario Placeholder», «ClubQuattro» e compagnia non
// sono e non possono diventare giocatori o squadre reali — stessa regola di
// e2e/fixtures/ e src/ui/warBoard.test.ts. Nessun handle di persona reale,
// nessun URL di forum, nessun testo editoriale di terzi.

const PLAYER = "Dario Placeholder";
const CLUB = "ClubQuattro";
const KEY = listonePlayerKey({ name: PLAYER, club: CLUB });

function deposit(schede: readonly unknown[]): string {
  return JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede });
}

function storeOf(schede: readonly ExpertScheda[]): ExpertSchedaStore {
  return { ok: true, byPlayerKey: indexSchede(schede) };
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
    const view = resolveExpertInsight(EXPERT_SCHEDE_ABSENT, KEY);
    expect(view.availability).toBe("source_unavailable");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.source_unavailable);
  });

  it("no_expert_signal — deposito letto, scheda non ancora scritta", () => {
    const view = resolveExpertInsight(storeOf([]), KEY);
    expect(view.availability).toBe("no_expert_signal");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.no_expert_signal);
  });

  it("no_expert_signal — anche senza giocatore selezionato, e su una scheda aperta ma vuota", () => {
    expect(resolveExpertInsight(storeOf([FULL]), null).availability).toBe("no_expert_signal");
    const empty: ExpertScheda = { player: PLAYER, club: CLUB, aggiornata: "2026-08-30", fonte: "staff" };
    expect(schedaHasContent(empty)).toBe(false);
    expect(resolveExpertInsight(storeOf([empty]), KEY).availability).toBe("no_expert_signal");
  });

  it("identity_not_resolved — due schede sullo stesso giocatore, nessuna delle due scelta", () => {
    const view = resolveExpertInsight(
      storeOf([FULL, { player: PLAYER, club: CLUB, nota: "seconda scheda" }]),
      KEY,
    );
    expect(view.availability).toBe("identity_not_resolved");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved);
    expect(view.nota).toBe("");
  });

  it("author_authority_not_verified — fonte non di staff, contenuto non attribuibile", () => {
    const view = resolveExpertInsight(storeOf([{ ...FULL, fonte: "community" }]), KEY);
    expect(view.availability).toBe("author_authority_not_verified");
    expect(view.quality).toBe(EXPERT_INSIGHT_QUALITY_LABELS.author_authority_not_verified);
    expect(view.titolarita).toBeNull();
    expect(view.nota).toBe("");
  });

  it("available — la scheda piena arriva intera alla vista", () => {
    const view = resolveExpertInsight(storeOf([FULL]), KEY);
    expect(view).toEqual({
      availability: "available",
      quality: EXPERT_INSIGHT_QUALITY_LABELS.available,
      contributesToIndex: false,
      validated: false,
      directive: false,
      titolarita: "ballottaggio",
      percentuale: 60,
      gerarchia: 2,
      rigori: "designato",
      piazzati: ["punizioni", "angoli"],
      avvisi: ["mercato"],
      nota: "Rinnovo non firmato: se parte a fine mercato la scheda cambia.",
      aggiornata: "2026-08-30",
      fonte: "scheda",
    });
  });

  it("available — una scheda di sola prosa è valida e conserva la sua prosa", () => {
    const view = resolveExpertInsight(
      storeOf([{ player: PLAYER, club: CLUB, nota: "Due righe e nient'altro." }]),
      KEY,
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
    const view = resolveExpertInsight(storeOf([{ player: PLAYER, club: CLUB, percentuale: 60, nota: "x" }]), KEY);
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
      resolveExpertInsight(storeOf([FULL]), KEY),
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
      resolveExpertInsight(storeOf([FULL]), KEY),
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
