import { describe, it, expect } from "vitest";
import { parseTopicPage } from "../src/topicPage.js";
import {
  contradictionBetween,
  missingLexiconFamilies,
  readPostSignals,
  readTopicSignals,
  SIGNALS_VERSION,
  verifyPostOrder,
  type SignalLexicon,
} from "../src/lineupSignals.js";
import { runParser } from "../src/run.js";
import type { TopicPost } from "../src/types.js";
import {
  lexiconWithoutOutFamily,
  roleOptions,
  SEP_4_1200_MS,
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

// I post arrivano con il loro indice di pagina: senza, l'ordine non sarebbe
// verificabile e le relazioni temporali non verrebbero prodotte affatto — che è
// esattamente il caso provato in «l'ordine si verifica, non si assume».
function postsOf(...posts: readonly string[]): readonly TopicPost[] {
  return parseTopicPage(signalsPage(posts), { ...roleOptions, pageOffset: 0 }).posts;
}

/** Gli stessi post, senza indice di pagina e senza istanti confrontabili. */
function postsWithoutOrder(...posts: readonly string[]): readonly TopicPost[] {
  return parseTopicPage(signalsPage(posts), roleOptions).posts.map((post) => ({
    ...post,
    publishedAt: null,
  }));
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
    expect(contradiction?.first.postId).toBe("2201");
    expect(contradiction?.second.postId).toBe("2202");
    // Le date dichiarate viaggiano accanto ai segnali e non vengono interpretate.
    expect(contradiction?.first.publishedAt).toBe("2026-09-04T09:00:00+02:00");
    expect(contradiction?.second.publishedAt).toBe("2026-09-04T18:00:00+02:00");
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
    expect(reading.contradictions[0]?.first.roleVerified).toBe(true);
    expect(reading.contradictions[0]?.second.roleVerified).toBe(false);
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

describe("l'ordine si verifica, non si assume", () => {
  it("con indice di pagina e istanti concordi l'ordine è verificato e confrontato", () => {
    const posts = postsOf(
      signalPost({ postId: "3001", staff: true, body: "Theta gamma.", at: "2026-09-04T09:00:00+02:00" }),
      signalPost({ postId: "3002", staff: true, body: "Theta zeta.", at: "2026-09-04T18:00:00+02:00" }),
    );
    const order = verifyPostOrder(posts);
    expect(order.verdict.basis).toBe("indice_di_pagina");
    expect(order.verdict.state).toBe("VERIFICATO");
    expect(order.verdict.crossChecked).toBe(true);
    expect(order.verdict.comparisons).toBe(1);
    expect(readTopicSignals(posts, lexicon).contradictions[0]?.temporal).toBe(true);
  });

  it("se gli istanti contraddicono l'ordine di pagina si rifiuta, non si sceglie", () => {
    const posts = postsOf(
      signalPost({ postId: "3011", staff: true, body: "Theta gamma.", at: "2026-09-04T18:00:00+02:00" }),
      signalPost({ postId: "3012", staff: true, body: "Theta zeta.", at: "2026-09-04T09:00:00+02:00" }),
    );
    const reading = readTopicSignals(posts, lexicon);

    expect(reading.order.state).toBe("NON_MONOTONO");
    expect(reading.order.crossChecked).toBe(true);
    expect(reading.outcome).toBe("ORDINE_NON_MONOTONO");
    // Fail-closed: non si producono relazioni temporali su una sequenza che si contraddice.
    expect(reading.signals).toHaveLength(0);
    expect(reading.contradictions).toHaveLength(0);
    expect(reading.readings).toHaveLength(0);
    expect(reading.measures.posts).toBe(2);
  });

  it("post consegnati fuori sequenza sono un rifiuto, non un riordino silenzioso", () => {
    const inOrder = postsOf(
      signalPost({ postId: "3021", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "3022", staff: true, body: "Theta zeta." }),
    );
    const shuffled = [inOrder[1] as TopicPost, inOrder[0] as TopicPost];
    const reading = readTopicSignals(shuffled, lexicon);
    expect(reading.order.state).toBe("NON_MONOTONO");
    expect(reading.outcome).toBe("ORDINE_NON_MONOTONO");
    expect(reading.signals).toHaveLength(0);
  });

  it("senza niente di confrontabile non si producono relazioni temporali, e lo si dichiara", () => {
    const posts = postsWithoutOrder(
      signalPost({ postId: "3031", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "3032", staff: true, body: "Theta zeta." }),
    );
    const reading = readTopicSignals(posts, lexicon);

    expect(reading.order.basis).toBe("nessuna");
    expect(reading.order.state).toBe("NON_VERIFICABILE");
    // I segnali escono lo stesso: sono stati detti.
    expect(reading.signals).toHaveLength(2);
    expect(reading.outcome).toBe("SEGNALI");
    // Ma la smentita non diventa una relazione temporale inventata dall'array.
    expect(reading.contradictions).toHaveLength(0);
    expect(reading.measures.pairsWithoutOrder).toBe(1);
    expect(reading.traces[0]?.stanceChanged).toBe(false);
  });

  it("senza ordine verificato `OPPOSTI` resta, perché non è un'affermazione sul tempo", () => {
    const posts = postsWithoutOrder(
      signalPost({ postId: "3041", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "3042", staff: true, body: "Theta gamma spenta." }),
    );
    const reading = readTopicSignals(posts, lexicon);

    expect(reading.contradictions).toHaveLength(1);
    expect(reading.contradictions[0]?.relation).toBe("OPPOSTI");
    expect(reading.contradictions[0]?.span).toBe("ORDINE_NON_VERIFICATO");
    expect(reading.contradictions[0]?.temporal).toBe(false);
    expect(reading.contradictions[0]?.bothRetained).toBe(true);
  });

  it("dentro un post l'ordine è quello del testo, e vale anche senza ordine di pagina", () => {
    const posts = postsWithoutOrder(
      signalPost({ postId: "3051", staff: true, body: "Theta gamma. Theta zeta." }),
    );
    const reading = readTopicSignals(posts, lexicon);
    expect(reading.contradictions[0]?.relation).toBe("SMENTITA_DICHIARATA");
    expect(reading.contradictions[0]?.span).toBe("STESSO_POST");
    expect(reading.contradictions[0]?.temporal).toBe(true);
  });

  it("gli istanti valgono solo a parità di scostamento: fusi diversi non si normalizzano", () => {
    const mixed = postsWithoutOrder(
      signalPost({ postId: "3061", staff: true, body: "Theta gamma." }),
      signalPost({ postId: "3062", staff: true, body: "Theta zeta." }),
    ).map((post, index) => ({
      ...post,
      publishedAt: index === 0 ? "2026-09-04T09:00:00+02:00" : "2026-09-04T08:00:00Z",
    }));
    expect(verifyPostOrder(mixed).verdict.basis).toBe("nessuna");

    const same = mixed.map((post, index) => ({
      ...post,
      publishedAt: index === 0 ? "2026-09-04T09:00:00+02:00" : "2026-09-04T10:00:00+02:00",
    }));
    const verdict = verifyPostOrder(same).verdict;
    expect(verdict.basis).toBe("istante_dichiarato");
    expect(verdict.state).toBe("VERIFICATO");
  });
});

describe("il giro completo legge i segnali, e il lessico resta un ingresso", () => {
  const page = {
    raw: signalsPage([
      signalPost({ postId: "4001", staff: true, body: "Theta gamma.", at: "2026-09-04T09:00:00+02:00" }),
      signalPost({ postId: "4002", staff: false, body: "Theta gamma spenta.", at: "2026-09-04T18:00:00+02:00" }),
    ]),
    topicId: "999001",
    canonicalUrl: "/topic",
    pageOffset: 0,
    declaredPages: 1,
    fingerprint: "0123456789ab",
    depositConfirmed: true,
    observedAtEpochMs: SEP_4_1200_MS,
  } as const;

  it("col lessico il referto conta i segnali, e non ne riporta il testo", () => {
    const result = runParser([page], { ...roleOptions, signalLexicon: lexicon });
    const block = result.report.signals;

    expect(block.lexiconProvided).toBe(true);
    expect(block.missingFamilies).toEqual([]);
    expect(block.total).toBe(2);
    expect(block.byKind).toEqual({ DATO_FUORI: 1, DATO_TITOLARE: 1 });
    expect(block.contradictionsByRelation).toEqual({ OPPOSTI: 1 });
    expect(block.orderStates).toEqual({ VERIFICATO: 1 });
    expect(block.fromUnverifiedRole).toBe(1);
    expect(block.weighted).toBe(false);
    // Il referto non porta né i termini né i nomi: quelli stanno nell'estratto.
    expect(JSON.stringify(block)).not.toContain("gamma");
    expect(JSON.stringify(block)).not.toContain("g-1");

    const extract = result.extract?.topics[0]?.signals;
    expect(extract?.outcome).toBe("SEGNALI");
    expect(extract?.signals[0]?.matchedTerm).toBe("gamma");
    expect(extract?.traces[0]?.entries).toHaveLength(2);
  });

  it("senza lessico il giro non tenta niente, e lo dice", () => {
    const result = runParser([page], roleOptions);
    expect(result.report.signals.lexiconProvided).toBe(false);
    expect(result.report.signals.outcomes).toEqual({ LESSICO_ASSENTE: 1 });
    expect(result.report.signals.total).toBe(0);
    expect(result.extract?.topics[0]?.signals.signals).toHaveLength(0);
  });
});
