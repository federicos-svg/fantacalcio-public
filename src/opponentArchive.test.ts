import { describe, it, expect } from "vitest";
import {
  AUCTION_HISTORY_STORAGE_KEY,
  OPPONENT_PROFILES_STORAGE_KEY,
  loadAuctionHistory,
  loadOpponentProfiles,
  opponentProfileSchema,
  pastAuctionPurchaseSchema,
  type StorageLike,
} from "../packages/opponent-profiles/src/index.js";
import {
  syntheticAuctionHistoryStore,
  SUPPORTER_WITHOUT_SPEND_PROFILE,
} from "../packages/opponent-profiles/fixtures/synthetic.js";
import * as archive from "./opponentArchive.js";

// LA VIA D'INGRESSO DELL'ARCHIVIO AVVERSARI, sotto esame.
//
// Il pannello AVVERSARI: I PRECEDENTI aveva lettore, schema, fixture e test, e
// nessuna scrittura: `saveAuctionHistory` non era chiamata da nessuna parte
// dell'app. Queste prove misurano la porta che mancava, e in particolare le
// due promesse che un operatore la sera dell'asta non può verificare da solo:
// che un file storto non porti via l'archivio buono, e che un rifiuto non
// racconti nulla del contenuto del file.
//
// Ogni riga qui è sintetica: viene dalle fixture del pacchetto o è inventata
// sul posto. Nessun dato reale di nessun partecipante entra in questo
// repository (issue #234, nota privacy).

/** Fake in memoria — nessun browser, nessun filesystem, nessuna rete. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

/** Storage che rifiuta ogni scrittura: quota piena o permesso negato. */
function readOnlyStorage(seed: Record<string, string> = {}): StorageLike {
  const inner = memoryStorage(seed);
  return {
    getItem: (key) => inner.getItem(key),
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
}

const HISTORY_TEXT = JSON.stringify(syntheticAuctionHistoryStore());
const HISTORY_STORE = syntheticAuctionHistoryStore();

const PROFILES_TEXT = JSON.stringify({
  schemaVersion: 1,
  profiles: [SUPPORTER_WITHOUT_SPEND_PROFILE],
});

/** Un archivio già presente, scritto direttamente sotto la chiave canonica. */
function seededWithHistory(): StorageLike & { readonly data: Record<string, string> } {
  return memoryStorage({ [AUCTION_HISTORY_STORAGE_KEY]: HISTORY_TEXT });
}

describe("archivio avversari — lo storico entra e resta", () => {
  it("carica un file conforme e lo rilegge dalla memoria locale", () => {
    const storage = memoryStorage();
    const applied = archive.applyAuctionHistoryText(storage, HISTORY_TEXT);
    expect(applied.message.tone).toBe("ok");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });

  it("scrive sotto la chiave runtime-local del pacchetto e in nessun'altra", () => {
    // La chiave non è scelta qui: è quella che il LETTORE dell'app usa al boot.
    // Una seconda chiave qui significherebbe un archivio che si carica e che
    // al reload non c'è più.
    const storage = memoryStorage();
    archive.applyAuctionHistoryText(storage, HISTORY_TEXT);
    expect(Object.keys(storage.data)).toEqual([AUCTION_HISTORY_STORAGE_KEY]);
  });

  it("sopravvive al reload: la lettura di boot ritrova esattamente ciò che è stato caricato", () => {
    // `loadAuctionHistory` è LA STESSA funzione che main.ts chiama al boot per
    // riempire `state.auctionHistory`. Se questa prova passa, il pannello
    // trova i fatti dopo un reload.
    const storage = memoryStorage();
    archive.applyAuctionHistoryText(storage, HISTORY_TEXT);
    const atBoot = loadAuctionHistory(storage);
    expect(atBoot.ok).toBe(true);
    expect(atBoot.purchases).toEqual(HISTORY_STORE.purchases);
  });

  it("un secondo file conforme sostituisce il primo per intero, senza fondere le righe", () => {
    // Due archivi fusi produrrebbero righe duplicate, cioè un conteggio di
    // precedenti gonfiato: esattamente il numero che il pannello stampa.
    const storage = seededWithHistory();
    const single = {
      schemaVersion: 1,
      purchases: [
        {
          season: "2024/25",
          personId: "person:00000000-0000-4000-8000-0000000000aa",
          playerId: "sint-solo",
          club: "ClubSintetico",
          price: 3,
          acquisition: "asta",
        },
      ],
    };
    const applied = archive.applyAuctionHistoryText(storage, JSON.stringify(single));
    expect(applied.message.tone).toBe("ok");
    expect(applied.stored).toHaveLength(1);
  });
});

describe("archivio avversari — FAIL-CLOSED: un file storto non porta via quello buono", () => {
  it("un file non JSON è rifiutato e l'archivio già presente resta intatto, byte per byte", () => {
    // LA PROVA CHE CONTA PIÙ DI TUTTE. Un archivio caricato la sera prima non
    // deve poter sparire perché la mattina dopo si è scelto il file sbagliato.
    const storage = seededWithHistory();
    const before = storage.data[AUCTION_HISTORY_STORAGE_KEY];
    const applied = archive.applyAuctionHistoryText(storage, "{ questo non è json");
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("non è JSON leggibile");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
    expect(storage.data[AUCTION_HISTORY_STORAGE_KEY]).toBe(before);
  });

  it("un file JSON ma non conforme allo schema è rifiutato e l'archivio resta intatto", () => {
    const storage = seededWithHistory();
    const before = storage.data[AUCTION_HISTORY_STORAGE_KEY];
    const applied = archive.applyAuctionHistoryText(
      storage,
      JSON.stringify({ schemaVersion: 1, purchases: [{ season: "24-25" }] }),
    );
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("l'archivio già presente non è stato toccato");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
    expect(storage.data[AUCTION_HISTORY_STORAGE_KEY]).toBe(before);
  });

  it("nessun caricamento parziale: un file con UNA riga rotta su tante non ne salva nessuna", () => {
    // Un conteggio di precedenti calcolato su metà delle righe è un numero
    // sbagliato con l'aria di un fatto.
    const storage = memoryStorage();
    const half = {
      schemaVersion: 1,
      purchases: [
        ...HISTORY_STORE.purchases,
        { season: "2024/25", personId: "non-una-persona", playerId: "x", club: "C", price: 1, acquisition: "asta" },
      ],
    };
    const applied = archive.applyAuctionHistoryText(storage, JSON.stringify(half));
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual([]);
    expect(storage.data[AUCTION_HISTORY_STORAGE_KEY]).toBeUndefined();
  });

  it("due righe identiche fanno rifiutare il file invece di essere deduplicate in silenzio", () => {
    const storage = seededWithHistory();
    const doubled = {
      schemaVersion: 1,
      purchases: [HISTORY_STORE.purchases[0], HISTORY_STORE.purchases[0]],
    };
    const applied = archive.applyAuctionHistoryText(storage, JSON.stringify(doubled));
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });

  it("una versione di schema diversa è rifiutata, mai migrata a indovinare", () => {
    const storage = seededWithHistory();
    const applied = archive.applyAuctionHistoryText(
      storage,
      JSON.stringify({ schemaVersion: 2, purchases: [] }),
    );
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("schemaVersion");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });

  it("un file di profili scambiato per uno storico è rifiutato, non interpretato", () => {
    const storage = seededWithHistory();
    const applied = archive.applyAuctionHistoryText(storage, PROFILES_TEXT);
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });
});

describe("archivio avversari — la scrittura che non attecchisce lo DICE", () => {
  it("una memoria locale che rifiuta la scrittura produce un errore, non una promessa", () => {
    const storage = readOnlyStorage({ [AUCTION_HISTORY_STORAGE_KEY]: HISTORY_TEXT });
    const applied = archive.applyAuctionHistoryText(storage, HISTORY_TEXT);
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("NON salvato");
    // E ciò che era già lì è ancora lì: la scrittura fallita non è passata.
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });

  it("una memoria che accetta e poi non restituisce lo stesso testo è un errore, non un successo", () => {
    // Storage che ingoia la scrittura senza conservarla: è il caso che la
    // rilettura di controllo dentro `saveAuctionHistory` esiste per prendere.
    const blackHole: StorageLike = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const applied = archive.applyAuctionHistoryText(blackHole, HISTORY_TEXT);
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual([]);
  });

  it("una memoria che si corrompe DOPO la scrittura fa fallire la rilettura di controllo", () => {
    // La rilettura finale passa dal VALIDATORE, cioè dalla stessa porta del
    // boot: risponde a «al prossimo reload che cosa troverò?» e non a
    // «la stringa è ancora lì?».
    let reads = 0;
    const flaky: StorageLike = {
      getItem: (key) => {
        reads += 1;
        if (key !== AUCTION_HISTORY_STORAGE_KEY) return null;
        // La prima lettura è quella di `saveAuctionHistory` (confronto della
        // stringa scritta); dalla seconda in poi la memoria mente.
        return reads === 1 ? HISTORY_TEXT : '{"schemaVersion":1,"purchases":[{"season":"rotta"}]}';
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const applied = archive.applyAuctionHistoryText(flaky, HISTORY_TEXT);
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("rilettura di controllo");
    expect(applied.stored).toEqual([]);
  });
});

describe("archivio avversari — PRIVACY: il rifiuto non racconta il file", () => {
  it("una chiave non prevista non viene mai ripetuta nel messaggio, nemmeno per aiutare", () => {
    // È il caso che rende la regola necessaria: `unrecognized_keys` di zod
    // riporta le chiavi PER NOME, e una chiave inventata a mano è esattamente
    // il posto in cui un nome di persona finisce per sbaglio.
    const storage = memoryStorage();
    const applied = archive.applyAuctionHistoryText(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        purchases: [
          {
            season: "2024/25",
            personId: "person:00000000-0000-4000-8000-00000000000a",
            playerId: "sint-1",
            club: "ClubSintetico",
            price: 10,
            acquisition: "asta",
            "Nome Reale Che Non Deve Uscire": "mai",
          },
        ],
      }),
    );
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).not.toContain("Nome Reale Che Non Deve Uscire");
    expect(applied.message.text).toContain(archive.UNKNOWN_FIELD_LABEL);
    expect(applied.message.text).toContain("riga 1");
  });

  it("nessun valore del file compare nel messaggio: né prezzo, né club, né persona, né giocatore", () => {
    const storage = memoryStorage();
    const applied = archive.applyAuctionHistoryText(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        purchases: [
          {
            season: "stagione-storta",
            personId: "person:00000000-0000-4000-8000-00000000cafe",
            playerId: "giocatore-segretissimo",
            club: "ClubSegretissimo",
            price: -7777,
            acquisition: "regalo",
          },
        ],
      }),
    );
    const text = applied.message.text;
    expect(applied.message.tone).toBe("error");
    for (const secret of [
      "stagione-storta",
      "00000000cafe",
      "giocatore-segretissimo",
      "ClubSegretissimo",
      "7777",
      "regalo",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("lo stesso patto vale per i profili: il messaggio nomina i campi, mai le risposte", () => {
    const storage = memoryStorage();
    const applied = archive.applyOpponentProfilesText(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        profiles: [
          {
            schemaVersion: 1,
            personId: "person:00000000-0000-4000-8000-00000000000a",
            interviewId: "i1",
            notes: { value: "aneddoto privatissimo su una persona vera", status: "confermato", declaredAt: "non-una-data" },
          },
        ],
      }),
    );
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).not.toContain("aneddoto privatissimo");
    expect(applied.message.text).not.toContain("non-una-data");
    expect(applied.message.text).toContain("declaredAt");
  });

  it("non offre nessun helper di export/serializzazione verso file", () => {
    // Stessa guardia meccanica del pacchetto (tests/privacy.test.ts): il modo
    // in cui un archivio reale USCIREBBE non è stato scritto. Questo modulo è
    // la superficie più esposta al rischio, perché è l'unico che tocca file.
    const suspicious = Object.keys(archive).filter((name) =>
      /export|download|toFile|writeFile|serializeTo|upload|fetch/i.test(name),
    );
    expect(suspicious).toEqual([]);
  });
});

describe("archivio avversari — i path stampati sono un elenco chiuso", () => {
  it("traduce un indice in una riga contata da 1, come la leggerebbe un umano", () => {
    expect(archive.safeIssuePath("purchases.0.price", archive.HISTORY_PATH_SEGMENTS)).toBe(
      "purchases › riga 1 › price",
    );
  });

  it("sostituisce qualunque segmento non dichiarato dallo schema", () => {
    expect(archive.safeIssuePath("purchases.2.telefono", archive.HISTORY_PATH_SEGMENTS)).toBe(
      `purchases › riga 3 › ${archive.UNKNOWN_FIELD_LABEL}`,
    );
  });

  it("nomina l'involucro quando la violazione non ha un path", () => {
    expect(archive.safeIssuePath("", archive.HISTORY_PATH_SEGMENTS)).toBe(archive.ROOT_PATH_LABEL);
  });

  it("l'elenco dei campi ammessi non può andare alla deriva dallo schema", () => {
    // Guardia di deriva, sullo stesso principio di
    // packages/opponent-profiles/tests/personIdPatternDrift.test.ts: un campo
    // aggiunto allo schema e dimenticato qui uscirebbe come «campo non
    // previsto» proprio nel messaggio che deve aiutare a correggerlo.
    for (const key of Object.keys(pastAuctionPurchaseSchema.shape)) {
      expect(archive.HISTORY_PATH_SEGMENTS.has(key)).toBe(true);
    }
    for (const key of Object.keys(opponentProfileSchema.shape)) {
      expect(archive.PROFILE_PATH_SEGMENTS.has(key)).toBe(true);
    }
    for (const key of ["schemaVersion", "purchases"]) {
      expect(archive.HISTORY_PATH_SEGMENTS.has(key)).toBe(true);
    }
    for (const key of ["schemaVersion", "profiles", "value", "status", "declaredAt"]) {
      expect(archive.PROFILE_PATH_SEGMENTS.has(key)).toBe(true);
    }
  });

  it("tronca un muro di violazioni e dice quante ne restano, invece di nasconderlo", () => {
    const issues = Array.from({ length: archive.ISSUE_LINES_MAX + 3 }, (_, i) => ({
      path: `purchases.${i}.price`,
      code: "invalid_type",
    }));
    const lines = archive.issueLines(issues, archive.HISTORY_PATH_SEGMENTS);
    expect(lines).toHaveLength(archive.ISSUE_LINES_MAX + 1);
    expect(lines[lines.length - 1]).toContain("altre 3");
  });
});

describe("archivio avversari — si può togliere", () => {
  it("rimuove lo storico dalla memoria locale e lo dice", () => {
    const storage = seededWithHistory();
    const applied = archive.forgetAuctionHistory(storage);
    expect(applied.message.tone).toBe("ok");
    expect(applied.stored).toEqual([]);
    expect(storage.data[AUCTION_HISTORY_STORAGE_KEY]).toBeUndefined();
  });

  it("una cancellazione rifiutata dalla memoria è un errore visibile, non un silenzio", () => {
    const storage = readOnlyStorage({ [AUCTION_HISTORY_STORAGE_KEY]: HISTORY_TEXT });
    const applied = archive.forgetAuctionHistory(storage);
    expect(applied.message.tone).toBe("error");
    expect(applied.message.text).toContain("NON rimosso");
    expect(applied.stored).toEqual(HISTORY_STORE.purchases);
  });

  it("rimuovere lo storico non tocca i profili, e viceversa", () => {
    // Sono due archivi, due chiavi, due gesti: togliere quello sbagliato non
    // deve costare anche l'altro.
    const storage = memoryStorage();
    archive.applyAuctionHistoryText(storage, HISTORY_TEXT);
    archive.applyOpponentProfilesText(storage, PROFILES_TEXT);
    archive.forgetAuctionHistory(storage);
    expect(loadAuctionHistory(storage).purchases).toEqual([]);
    expect(loadOpponentProfiles(storage).profiles).toEqual([SUPPORTER_WITHOUT_SPEND_PROFILE]);
    expect(Object.keys(storage.data)).toEqual([OPPONENT_PROFILES_STORAGE_KEY]);
  });
});

describe("archivio avversari — i profili entrano dalla loro porta", () => {
  it("carica un file di profili conforme e lo rilegge", () => {
    const storage = memoryStorage();
    const applied = archive.applyOpponentProfilesText(storage, PROFILES_TEXT);
    expect(applied.message.tone).toBe("ok");
    expect(applied.stored).toEqual([SUPPORTER_WITHOUT_SPEND_PROFILE]);
    expect(loadOpponentProfiles(storage).profiles).toEqual([SUPPORTER_WITHOUT_SPEND_PROFILE]);
  });

  it("uno storico scambiato per un file di profili è rifiutato e non tocca i profili presenti", () => {
    const storage = memoryStorage({
      [OPPONENT_PROFILES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        profiles: [SUPPORTER_WITHOUT_SPEND_PROFILE],
      }),
    });
    const applied = archive.applyOpponentProfilesText(storage, HISTORY_TEXT);
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual([SUPPORTER_WITHOUT_SPEND_PROFILE]);
  });

  it("due profili per la stessa persona fanno rifiutare il file", () => {
    const storage = memoryStorage();
    const applied = archive.applyOpponentProfilesText(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        profiles: [SUPPORTER_WITHOUT_SPEND_PROFILE, SUPPORTER_WITHOUT_SPEND_PROFILE],
      }),
    );
    expect(applied.message.tone).toBe("error");
    expect(applied.stored).toEqual([]);
  });
});

describe("archivio avversari — che cosa è caricato, in numeri", () => {
  const SEATS = {
    Squadra1: "person:00000000-0000-4000-8000-000000000001",
    Squadra2: "person:00000000-0000-4000-8000-000000000002",
    Squadra3: null,
  } as const;

  const PURCHASES = [
    {
      season: "2023/24",
      personId: SEATS.Squadra2,
      playerId: "sint-a",
      club: "ClubUno",
      price: 10,
      acquisition: "asta" as const,
    },
    {
      season: "2024/25",
      personId: SEATS.Squadra2,
      playerId: "sint-a",
      club: "ClubUno",
      price: 12,
      acquisition: "riconferma" as const,
    },
    {
      season: "2024/25",
      personId: "person:00000000-0000-4000-8000-0000000000ff",
      playerId: "sint-b",
      club: "ClubDue",
      price: 30,
      acquisition: "asta" as const,
    },
  ];

  it("conta acquisti, persone e stagioni, e separa i rinnovi dagli acquisti all'asta", () => {
    const summary = archive.historyArchiveSummary(PURCHASES, SEATS, "Squadra1");
    expect(summary.purchaseCount).toBe(3);
    expect(summary.peopleCount).toBe(2);
    expect(summary.seasons).toEqual(["2023/24", "2024/25"]);
    expect(summary.auctionCount).toBe(2);
    expect(summary.renewalCount).toBe(1);
  });

  it("dice quante di quelle persone siedono davvero a un posto RIVALE", () => {
    // È il numero che risponde alla domanda per cui si guarda questa
    // schermata prima dell'asta: «di questi, quanti ne vedrò?». Il proprio
    // posto è escluso, come lo esclude il pannello.
    const summary = archive.historyArchiveSummary(PURCHASES, SEATS, "Squadra1");
    expect(summary.rivalSeats).toBe(2);
    expect(summary.rivalsCovered).toBe(1);
  });

  it("il proprio posto non conta mai come avversario coperto", () => {
    const summary = archive.historyArchiveSummary(PURCHASES, SEATS, "Squadra2");
    expect(summary.rivalSeats).toBe(2);
    expect(summary.rivalsCovered).toBe(0);
  });

  it("uno storico che non copre nessun posto lo dice a parole, non solo con uno zero", () => {
    const summary = archive.historyArchiveSummary(PURCHASES, SEATS, "Squadra2");
    expect(archive.historySummaryText(summary)).toContain("non avrà niente da dire");
  });

  it("il riepilogo non contiene nessun valore del file: solo conteggi e stagioni", () => {
    const text = archive.historySummaryText(archive.historyArchiveSummary(PURCHASES, SEATS, "Squadra1"));
    for (const secret of ["sint-a", "sint-b", "ClubUno", "ClubDue", "person:"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("2023/24 → 2024/25");
  });

  it("conta i profili e quanti portano un tifo CONFERMATO", () => {
    const proposed = {
      ...SUPPORTER_WITHOUT_SPEND_PROFILE,
      personId: SEATS.Squadra2,
      affinityClubs: { value: ["ClubUno"], status: "proposto" as const, declaredAt: "2026-08-20" },
    };
    const summary = archive.profilesArchiveSummary(
      [SUPPORTER_WITHOUT_SPEND_PROFILE, proposed],
      SEATS,
      "Squadra1",
    );
    expect(summary.profileCount).toBe(2);
    expect(summary.confirmedAffinityCount).toBe(1);
    expect(summary.rivalsCovered).toBe(1);
  });

  it("una stagione sola non viene raccontata come un intervallo", () => {
    expect(archive.seasonsSpanText(["2024/25"])).toBe("1 stagione (2024/25)");
    expect(archive.seasonsSpanText([])).toBe("nessuna stagione");
  });
});
