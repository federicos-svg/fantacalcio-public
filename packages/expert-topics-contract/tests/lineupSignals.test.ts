import { describe, it, expect } from "vitest";
import { parseTopicPage } from "../src/topicPage.js";
import {
  contradictionBetween,
  missingLexiconFamilies,
  readPostSignals,
  readTopicSignals,
  SIGNALS_VERSION,
  type SignalLexicon,
} from "../src/lineupSignals.js";
import type { TopicPost } from "../src/types.js";
import {
  lexiconWithoutOutFamily,
  roleOptions,
  signalPost,
  signalsPage,
  syntheticLexicon,
} from "./fixtures.js";

// I SEGNALI DI FORMAZIONE — le prove sui casi che contano.
//
// Ogni caso qui sotto è un modo diverso in cui un'estrazione da testo libero
// può mentire: dicendo troppo (un segnale dove c'è silenzio), dicendo troppo
// poco (un segnale scartato perché l'autore non è verificato), dicendo l'ultima
// versione al posto di tutte, o attribuendo a chi cita le parole di un altro.

const lexicon = syntheticLexicon as unknown as SignalLexicon;
const incompleteLexicon = lexiconWithoutOutFamily as unknown as SignalLexicon;

function postsOf(...posts: readonly string[]): readonly TopicPost[] {
  return parseTopicPage(signalsPage(posts), roleOptions).posts;
}

describe("segnale chiaro", () => {
  it("dice che cosa, di chi, in che forma e da dove viene", () => {
    const posts = postsOf(signalPost({ postId: "2001", staff: true, body: "Theta gamma." }));
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);

    expect(reading.outcome).toBe("SEGNALI");
    expect(reading.signalsVersion).toBe(SIGNALS_VERSION);
    expect(reading.signals).toHaveLength(1);
    const signal = reading.signals[0];
    expect(signal?.kind).toBe("DATO_TITOLARE");
    expect(signal?.playerId).toBe("g-1");
    expect(signal?.matchedTerm).toBe("gamma");
    expect(signal?.evidence.form).toBe("affermata");
    expect(signal?.evidence.subject).toBe("risolto");
    expect(signal?.evidence.subjectScope).toBe("proposizione");
    expect(signal?.evidence.roleClass).toBe("staff_verificato");
    expect(signal?.evidence.roleVerified).toBe(true);
    // Il grado dell'evidenza è un insieme di fatti, non un punteggio.
    expect(signal?.evidence.weighted).toBe(false);
    expect(signal?.origin.voice).toBe("autore");
    expect(signal?.origin.quoteDepth).toBe(0);
  });

  it("riconosce la forma del soggetto a prescindere da maiuscole e accenti", () => {
    const posts = postsOf(signalPost({ postId: "2002", staff: true, body: "ÒMICRON GAMMA." }));
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);
    expect(reading.signals[0]?.playerId).toBe("g-2");
  });

  it("non trova un termine dentro una parola più lunga", () => {
    const posts = postsOf(signalPost({ postId: "2003", staff: true, body: "Theta gammaico." }));
    expect(readPostSignals(posts[0] as TopicPost, lexicon, 0).outcome).toBe("SILENZIO");
  });
});

describe("segnale in forma dubitativa", () => {
  it("resta lo stesso segnale, ma dichiarato attenuato e con il termine che lo attenua", () => {
    const posts = postsOf(signalPost({ postId: "2101", staff: true, body: "Iota eta gamma." }));
    const signal = readPostSignals(posts[0] as TopicPost, lexicon, 0).signals[0];

    expect(signal?.kind).toBe("DATO_TITOLARE");
    expect(signal?.playerId).toBe("g-2");
    expect(signal?.evidence.form).toBe("attenuata");
    expect(signal?.evidence.attenuatorTerm).toBe("eta");
  });

  it("senza attenuatori dichiarati nessun segnale è mai attenuato, e il fatto si vede", () => {
    const withoutAttenuators = { ...lexicon, attenuators: [] };
    const posts = postsOf(signalPost({ postId: "2102", staff: true, body: "Iota eta gamma." }));
    const reading = readPostSignals(posts[0] as TopicPost, withoutAttenuators, 0);
    expect(reading.attenuatorsDeclared).toBe(false);
    expect(reading.signals[0]?.evidence.form).toBe("affermata");
  });
});

describe("smentita successiva", () => {
  it("non cancella il segnale precedente: restano entrambi e la contraddizione è dichiarata", () => {
    const posts = postsOf(
      signalPost({ postId: "2201", staff: true, body: "Theta gamma.", at: "2026-09-04T09:00:00+02:00" }),
      signalPost({ postId: "2202", staff: true, body: "Theta zeta.", at: "2026-09-04T18:00:00+02:00" }),
    );
    const reading = readTopicSignals(posts, lexicon);

    expect(reading.signals).toHaveLength(2);
    expect(reading.signals.map((signal) => signal.kind)).toEqual(["DATO_TITOLARE", "SMENTITA"]);
    expect(reading.contradictions).toHaveLength(1);
    const contradiction = reading.contradictions[0];
    expect(contradiction?.relation).toBe("SMENTITA_DICHIARATA");
    expect(contradiction?.span).toBe("POST_SUCCESSIVO");
    expect(contradiction?.bothRetained).toBe(true);
    expect(contradiction?.earlier.postId).toBe("2201");
    expect(contradiction?.later.postId).toBe("2202");
    // Le date dichiarate viaggiano accanto ai segnali e non vengono interpretate.
    expect(contradiction?.earlier.publishedAt).toBe("2026-09-04T09:00:00+02:00");
    expect(contradiction?.later.publishedAt).toBe("2026-09-04T18:00:00+02:00");
  });

  it("la traccia mostra il cambio di idea, e non esiste un campo «ultimo»", () => {
    const posts = postsOf(
      signalPost({ postId: "2211", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "2212", staff: true, body: "Theta gamma spenta." }),
    );
    const trace = readTopicSignals(posts, lexicon).traces[0];

    expect(trace?.playerId).toBe("g-1");
    expect(trace?.entries).toHaveLength(2);
    expect(trace?.entries.map((entry) => entry.postId)).toEqual(["2211", "2212"]);
    expect(trace?.stanceChanged).toBe(true);
    expect(trace?.kindsSeen).toEqual(["DATO_FUORI", "DATO_TITOLARE"]);
    for (const forbidden of ["latest", "ultimo", "current", "resolved"]) {
      expect(Object.keys(trace ?? {})).not.toContain(forbidden);
    }
  });
});

describe("due segnali opposti nello stesso post", () => {
  it("escono entrambi, e la contraddizione è dichiarata dentro il post", () => {
    const posts = postsOf(
      signalPost({ postId: "2301", staff: true, body: "Theta gamma. Theta gamma spenta." }),
    );
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);

    expect(reading.signals.map((signal) => signal.kind)).toEqual(["DATO_TITOLARE", "DATO_FUORI"]);
    expect(reading.contradictions).toHaveLength(1);
    expect(reading.contradictions[0]?.relation).toBe("OPPOSTI");
    expect(reading.contradictions[0]?.span).toBe("STESSO_POST");
  });

  it("sugli stessi caratteri vince il termine più lungo: nessuna contraddizione fabbricata", () => {
    const posts = postsOf(signalPost({ postId: "2302", staff: true, body: "Theta gamma spenta." }));
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);
    expect(reading.signals).toHaveLength(1);
    expect(reading.signals[0]?.kind).toBe("DATO_FUORI");
    expect(reading.contradictions).toHaveLength(0);
  });

  it("due soggetti nella stessa proposizione non si scelgono: il segnale è ambiguo e lo dice", () => {
    const posts = postsOf(signalPost({ postId: "2303", staff: true, body: "Theta Iota gamma." }));
    const signal = readPostSignals(posts[0] as TopicPost, lexicon, 0).signals[0];
    expect(signal?.playerId).toBeNull();
    expect(signal?.evidence.subject).toBe("ambiguo");
    expect(signal?.candidates).toEqual(["g-1", "g-2"]);
  });
});

describe("segnale dentro una citazione", () => {
  it("esiste, dice di essere citato, e non eredita il ruolo di chi cita", () => {
    const posts = postsOf(
      signalPost({
        postId: "2401",
        staff: true,
        quote: "Iota gamma.",
        quotedAuthor: "autore-citato",
        body: "Testo sintetico di risposta.",
      }),
    );
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);

    expect(reading.signals).toHaveLength(1);
    const signal = reading.signals[0];
    expect(signal?.kind).toBe("DATO_TITOLARE");
    expect(signal?.playerId).toBe("g-2");
    expect(signal?.origin.voice).toBe("citazione");
    expect(signal?.origin.quoteDepth).toBe(1);
    expect(signal?.origin.quotedAuthorRecognised).toBe(true);
    expect(signal?.origin.roleInherited).toBe(false);
    // Chi cita è staff verificato: il segnale citato NON lo diventa.
    expect(posts[0]?.role.role).toBe("staff_verificato");
    expect(signal?.evidence.roleClass).toBe("non_verificabile");
    expect(signal?.evidence.roleVerified).toBe(false);
  });

  it("il corpo di chi cita e le parole citate restano segnali distinti", () => {
    const posts = postsOf(
      signalPost({ postId: "2402", staff: true, quote: "Iota gamma.", body: "Theta gamma spenta." }),
    );
    const signals = readPostSignals(posts[0] as TopicPost, lexicon, 0).signals;
    const byVoice = Object.fromEntries(signals.map((signal) => [signal.origin.voice, signal]));
    expect(byVoice.autore?.playerId).toBe("g-1");
    expect(byVoice.autore?.evidence.roleVerified).toBe(true);
    expect(byVoice.citazione?.playerId).toBe("g-2");
    expect(byVoice.citazione?.evidence.roleVerified).toBe(false);
  });
});

describe("post senza segnali", () => {
  it("è silenzio, non un errore e non «detto fuori»", () => {
    const posts = postsOf(
      signalPost({ postId: "2501", staff: true, body: "Testo sintetico di nessun contenuto utile." }),
    );
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);

    expect(reading.outcome).toBe("SILENZIO");
    expect(reading.signals).toHaveLength(0);
    expect(reading.contradictions).toHaveLength(0);
    expect(reading.textRecognised).toBe(true);
    expect(reading.clausesRead).toBeGreaterThan(0);
  });

  it("il silenzio non entra nei conteggi come se fosse un segnale", () => {
    const posts = postsOf(
      signalPost({ postId: "2502", staff: true, body: "Testo sintetico senza niente." }),
      signalPost({ postId: "2503", staff: true, body: "Theta gamma spenta." }),
    );
    const measures = readTopicSignals(posts, lexicon).measures;
    expect(measures.posts).toBe(2);
    expect(measures.postsSilent).toBe(1);
    expect(measures.postsWithSignals).toBe(1);
    expect(measures.byKind).toEqual({ DATO_FUORI: 1 });
    expect(measures.weighted).toBe(false);
  });

  it("se il corpo del post non è riconosciuto, il silenzio non è dimostrabile", () => {
    const orphan = "<div id=\"p2504\" class=\"post bg1\"><div class=\"postbody\">niente</div></div>";
    const posts = postsOf(orphan);
    const reading = readPostSignals(posts[0] as TopicPost, lexicon, 0);
    expect(reading.textRecognised).toBe(false);
    expect(reading.outcome).toBe("SILENZIO_NON_DIMOSTRABILE");
  });
});

describe("autore con ruolo non verificato", () => {
  it("produce segnali validi, marcati, mai scartati in silenzio né promossi", () => {
    const posts = postsOf(
      signalPost({ postId: "2601", staff: false, body: "Theta gamma." }),
      signalPost({ postId: "2602", authorBlock: false, body: "Iota gamma." }),
    );
    const reading = readTopicSignals(posts, lexicon);

    expect(reading.signals).toHaveLength(2);
    expect(reading.signals[0]?.evidence.roleClass).toBe("comunita");
    expect(reading.signals[0]?.evidence.roleVerified).toBe(false);
    expect(reading.signals[1]?.evidence.roleClass).toBe("non_verificabile");
    expect(reading.signals[1]?.evidence.roleVerified).toBe(false);
    expect(reading.measures.signalsFromUnverifiedRole).toBe(2);
    // «Non lo sappiamo» e «non è staff» restano due conti diversi.
    expect(reading.measures.byRoleClass).toEqual({ comunita: 1, non_verificabile: 1 });
  });

  it("un segnale non verificato contraddice un segnale verificato senza essere tolto", () => {
    const posts = postsOf(
      signalPost({ postId: "2611", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "2612", staff: false, body: "Theta gamma spenta." }),
    );
    const reading = readTopicSignals(posts, lexicon);
    expect(reading.signals).toHaveLength(2);
    expect(reading.contradictions[0]?.relation).toBe("OPPOSTI");
    expect(reading.contradictions[0]?.earlier.roleVerified).toBe(true);
    expect(reading.contradictions[0]?.later.roleVerified).toBe(false);
  });
});

describe("senza lessico non si tenta niente", () => {
  it("un lessico assente ferma la lettura prima del testo", () => {
    const posts = postsOf(signalPost({ postId: "2701", staff: true, body: "Theta gamma." }));
    const reading = readPostSignals(
      posts[0] as TopicPost,
      null as unknown as SignalLexicon,
      0,
    );
    expect(reading.outcome).toBe("LESSICO_ASSENTE");
    expect(reading.signals).toHaveLength(0);
    expect(reading.clausesRead).toBe(0);
  });

  it("un lessico incompleto nomina la famiglia che manca, e non ripiega su niente", () => {
    const posts = postsOf(signalPost({ postId: "2702", staff: true, body: "Theta gamma spenta." }));
    const reading = readTopicSignals(posts, incompleteLexicon);
    expect(reading.outcome).toBe("LESSICO_INCOMPLETO");
    expect(reading.missingFamilies).toEqual(["terms.fuori"]);
    expect(reading.signals).toHaveLength(0);
    expect(missingLexiconFamilies(incompleteLexicon)).toEqual(["terms.fuori"]);
    expect(missingLexiconFamilies(lexicon)).toEqual([]);
  });
});

describe("la matrice delle contraddizioni è chiusa e dichiarata", () => {
  it("due volte la stessa cosa non è una contraddizione", () => {
    expect(contradictionBetween("DATO_TITOLARE", "DATO_TITOLARE")).toBeNull();
    expect(contradictionBetween("SMENTITA", "SMENTITA")).toBeNull();
  });

  it("titolare e fuori sono opposti, certezza e dubbio sono una posizione rivista", () => {
    expect(contradictionBetween("DATO_TITOLARE", "DATO_FUORI")).toBe("OPPOSTI");
    expect(contradictionBetween("DATO_FUORI", "DATO_TITOLARE")).toBe("OPPOSTI");
    expect(contradictionBetween("DATO_TITOLARE", "IN_DUBBIO")).toBe("RIVISTO");
    expect(contradictionBetween("DATO_FUORI", "IN_DUBBIO")).toBe("RIVISTO");
  });

  it("una smentita accanto a qualunque altra affermazione è dichiarata come tale", () => {
    expect(contradictionBetween("SMENTITA", "IN_DUBBIO")).toBe("SMENTITA_DICHIARATA");
    expect(contradictionBetween("DATO_FUORI", "SMENTITA")).toBe("SMENTITA_DICHIARATA");
  });
});

describe("i segnali senza soggetto non spariscono", () => {
  it("restano, dichiarati, e non entrano nelle coppie di contraddizione", () => {
    const posts = postsOf(signalPost({ postId: "2801", staff: true, body: "Gamma spenta." }));
    const reading = readTopicSignals(posts, lexicon);
    expect(reading.signals).toHaveLength(1);
    expect(reading.signals[0]?.playerId).toBeNull();
    expect(reading.signals[0]?.evidence.subject).toBe("non_identificato");
    expect(reading.unattributed).toHaveLength(1);
    expect(reading.traces).toHaveLength(0);
    expect(reading.contradictions).toHaveLength(0);
  });
});

describe("la lettura è deterministica", () => {
  it("stesso ingresso, stesso esito, nello stesso ordine", () => {
    const posts = postsOf(
      signalPost({ postId: "2901", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "2902", staff: false, quote: "Iota eta delta.", body: "Theta zeta." }),
    );
    expect(readTopicSignals(posts, lexicon)).toEqual(readTopicSignals(posts, lexicon));
  });
});
