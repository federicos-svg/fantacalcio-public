// DA UN INSIEME DI PAGINE DEPOSITATE AL RISULTATO DI UN GIRO.
//
// Due uscite, deliberatamente diverse:
//  - il **referto**: solo forme e conteggi. Nessun titolo, nessun nome, nessun
//    testo. È l'unica uscita che può risalire fuori dal layer privato e l'unica
//    riportabile in un documento;
//  - l'**estratto**: porta titoli, nomi e testo, e va **soltanto** nel deposito
//    privato di chi ha letto la fonte.
//
// RAW PRIMA, PARSING POI. Una pagina senza deposito confermato e senza impronta
// non viene analizzata: l'esito è `RAW_NON_DEPOSITATO`, fail-closed. I topic di
// partita sono effimeri, e analizzare byte che nessuno ha depositato produce un
// risultato che domani nessuno può più rifare né smentire.

import { linkTopicToMatch } from "./matchLink.js";
import { readMatchKey } from "./title.js";
import { parseTopicPage } from "./topicPage.js";
import {
  CONTRACT_VERSION,
  PARSER_VERSION,
  type CalendarFixture,
  type MatchKey,
  type MatchLink,
  type RoleVerificationOptions,
  type TeamAliases,
  type TopicPost,
} from "./types.js";

/** Una pagina già depositata, con la sua provenienza ridotta all'osso. */
export interface DepositedPage {
  readonly raw: string;
  readonly topicId: string;
  readonly canonicalUrl: string;
  readonly pageOffset: number | null;
  readonly declaredPages: number | null;
  /** Impronta dei byte: 12 o 64 caratteri esadecimali. */
  readonly fingerprint: string;
  /** Vero solo se quei byte stanno nel deposito privato. */
  readonly depositConfirmed: boolean;
  /** Millisecondi epoch della lettura; `null` se ignoto. */
  readonly observedAtEpochMs: number | null;
}

export interface RunOptions extends RoleVerificationOptions {
  readonly calendar?: readonly CalendarFixture[];
  readonly aliases?: TeamAliases;
  readonly windowDays?: number;
  readonly season?: string;
}

export type RunOutcome =
  | "OK"
  | "NESSUN_RAW"
  | "RAW_NON_DEPOSITATO"
  | "NESSUN_POST_RICONOSCIUTO"
  | "PARSING_PARZIALE"
  | "RUOLI_NON_VERIFICATI"
  | "LEGAME_NON_RISOLTO";

export interface TopicExtract {
  readonly topicId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly key: MatchKey;
  readonly link: MatchLink;
  readonly pagination: {
    readonly depositedOffsets: readonly number[];
    readonly depositedPages: number;
    readonly declaredPages: number | null;
    /** `null` = **ignota**, non «completa». */
    readonly complete: boolean | null;
  };
  readonly posts: readonly TopicPost[];
  readonly observedAtEpochMs: number | null;
}

export interface RunReport {
  readonly outcome: RunOutcome;
  readonly parserVersion: typeof PARSER_VERSION;
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly pages: number;
  readonly pagesWithoutConfirmedDeposit: number;
  readonly topics: number;
  readonly topicsWithoutPosts: number;
  readonly posts: number;
  readonly roles: Readonly<Record<string, number>>;
  readonly staffMarkerObserved: boolean;
  readonly dates: { readonly withPublication: number; readonly withoutPublication: number; readonly withEdit: number };
  readonly quotes: { readonly total: number; readonly withRecognisedAuthor: number; readonly maxDepth: number };
  readonly matchLink: Readonly<Record<string, number>>;
  readonly pagination: { readonly incomplete: number; readonly unknown: number };
  /** Forme anonime del titolo: mai i titoli. */
  readonly titleShapes: readonly string[];
  readonly shortFingerprints: readonly string[];
  readonly calendarFixtures: number;
  readonly aliases: number;
}

export interface RunResult {
  readonly report: RunReport;
  /** `null` quando il giro si è fermato fail-closed. */
  readonly extract: {
    readonly parserVersion: typeof PARSER_VERSION;
    readonly contractVersion: typeof CONTRACT_VERSION;
    readonly redistributionAllowed: false;
    readonly privateOnly: true;
    readonly season: string;
    readonly topics: readonly TopicExtract[];
  } | null;
}

const FINGERPRINT = /^[0-9a-f]{12}([0-9a-f]{52})?$/;

interface Accumulator {
  topicId: string;
  canonicalUrl: string;
  title: string;
  offsets: number[];
  declaredPages: number | null;
  posts: TopicPost[];
  seenPostIds: Set<string>;
  observedAtEpochMs: number | null;
}

export function runParser(pages: readonly DepositedPage[], options: RunOptions): RunResult {
  const calendar = options.calendar ?? [];
  const aliases = options.aliases ?? {};

  const undeposited = pages.filter(
    (page) => !page.depositConfirmed || !FINGERPRINT.test(page.fingerprint),
  ).length;

  const accumulators: Accumulator[] = [];
  const roles: Record<string, number> = {
    staff_verificato: 0,
    comunita: 0,
    non_verificabile: 0,
  };
  const dates = { withPublication: 0, withoutPublication: 0, withEdit: 0 };
  const quotes = { total: 0, withRecognisedAuthor: 0, maxDepth: 0 };
  const fingerprints: string[] = [];
  let posts = 0;
  let staffMarkerObserved = false;

  if (undeposited === 0) {
    for (const page of pages) {
      const parsed = parseTopicPage(page.raw, {
        staffRankMarker: options.staffRankMarker,
        sourceHost: options.sourceHost,
        pageOffset: page.pageOffset,
        topicIdFallback: page.topicId,
      });
      const id = parsed.topicId === "" ? "sconosciuto" : parsed.topicId;
      let topic = accumulators.find((candidate) => candidate.topicId === id);
      if (topic === undefined) {
        topic = {
          topicId: id,
          canonicalUrl: page.canonicalUrl,
          title: parsed.title,
          offsets: [],
          declaredPages: null,
          posts: [],
          seenPostIds: new Set<string>(),
          observedAtEpochMs: page.observedAtEpochMs,
        };
        accumulators.push(topic);
      }
      if (topic.title === "" && parsed.title !== "") topic.title = parsed.title;
      if (topic.observedAtEpochMs === null) topic.observedAtEpochMs = page.observedAtEpochMs;
      const offset = page.pageOffset ?? 0;
      if (!topic.offsets.includes(offset)) topic.offsets.push(offset);
      if (
        page.declaredPages !== null &&
        (topic.declaredPages === null || page.declaredPages > topic.declaredPages)
      ) {
        topic.declaredPages = page.declaredPages;
      }
      const short = page.fingerprint.slice(0, 12);
      if (short !== "" && !fingerprints.includes(short)) fingerprints.push(short);

      for (const post of parsed.posts) {
        if (topic.seenPostIds.has(post.postId)) continue;
        topic.seenPostIds.add(post.postId);
        topic.posts.push(post);
        posts += 1;
        roles[post.role.role] = (roles[post.role.role] ?? 0) + 1;
        if (post.role.role === "staff_verificato") staffMarkerObserved = true;
        if (post.publishedAt !== null) dates.withPublication += 1;
        else dates.withoutPublication += 1;
        if (post.editDeclared) dates.withEdit += 1;
        quotes.total += post.quotes.length;
        quotes.withRecognisedAuthor += post.quotes.filter((q) => q.quotedAuthorRecognised).length;
        if (post.maxQuoteDepth > quotes.maxDepth) quotes.maxDepth = post.maxQuoteDepth;
      }
    }
  }

  const links: Record<string, number> = {};
  const titleShapes: string[] = [];
  const extracts: TopicExtract[] = [];
  let topicsWithoutPosts = 0;
  let incomplete = 0;
  let unknownPagination = 0;

  for (const topic of accumulators) {
    const key = readMatchKey(topic.title, aliases);
    const link = linkTopicToMatch(key, {
      calendar,
      aliases,
      observedAtEpochMs: topic.observedAtEpochMs,
      ...(options.windowDays === undefined ? {} : { windowDays: options.windowDays }),
    });
    links[link.state] = (links[link.state] ?? 0) + 1;
    topic.offsets.sort((a, b) => a - b);
    const complete =
      topic.declaredPages === null ? null : topic.offsets.length >= topic.declaredPages;
    if (complete === null) unknownPagination += 1;
    else if (!complete) incomplete += 1;
    if (topic.posts.length === 0) topicsWithoutPosts += 1;

    // Forma anonima del titolo: solo la struttura, mai i nomi delle squadre.
    const shape = `${key.pairPresent ? "P-P" : "X"}${key.kickoffPresent ? " ORA" : " -"}${
      key.matchdayNumberInTitle ? " N-GIORNATA" : ""
    }`;
    if (!titleShapes.includes(shape)) titleShapes.push(shape);

    extracts.push({
      topicId: topic.topicId,
      canonicalUrl: topic.canonicalUrl,
      title: topic.title,
      key,
      link,
      pagination: {
        depositedOffsets: topic.offsets,
        depositedPages: topic.offsets.length,
        declaredPages: topic.declaredPages,
        complete,
      },
      posts: topic.posts,
      observedAtEpochMs: topic.observedAtEpochMs,
    });
  }

  let outcome: RunOutcome = "OK";
  if (pages.length === 0) outcome = "NESSUN_RAW";
  else if (undeposited > 0) outcome = "RAW_NON_DEPOSITATO";
  else if (posts === 0) outcome = "NESSUN_POST_RICONOSCIUTO";
  else if (topicsWithoutPosts > 0 || incomplete > 0) outcome = "PARSING_PARZIALE";
  else if (!staffMarkerObserved) outcome = "RUOLI_NON_VERIFICATI";
  else if ((links.RISOLTO ?? 0) === 0) outcome = "LEGAME_NON_RISOLTO";

  const report: RunReport = {
    outcome,
    parserVersion: PARSER_VERSION,
    contractVersion: CONTRACT_VERSION,
    pages: pages.length,
    pagesWithoutConfirmedDeposit: undeposited,
    topics: accumulators.length,
    topicsWithoutPosts,
    posts,
    roles,
    staffMarkerObserved,
    dates,
    quotes,
    matchLink: links,
    pagination: { incomplete, unknown: unknownPagination },
    titleShapes,
    shortFingerprints: fingerprints,
    calendarFixtures: calendar.length,
    aliases: Object.keys(aliases).length,
  };

  const extract =
    outcome === "RAW_NON_DEPOSITATO"
      ? null
      : {
          parserVersion: PARSER_VERSION,
          contractVersion: CONTRACT_VERSION,
          redistributionAllowed: false as const,
          privateOnly: true as const,
          season: options.season ?? "",
          topics: extracts,
        };

  return { report, extract };
}
