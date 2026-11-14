import { prisma } from "@/lib/db/client";
import { parseFeed, type ParsedFeedItem } from "@/lib/integrations/rss/parser";
import { extractArticle, resolveArticleContent } from "@/lib/integrations/rss/article-extractor";
import { pickSourceImage } from "@/lib/integrations/rss/article-image";
import { resolveTranslationConfig } from "@/lib/ai/feed-item-translation";
import {
  FETCH_SETTLED_CLASSIFICATION_STATUS,
  MIN_CLASSIFICATION_ITEM_BUDGET_MS,
  type ClassificationContext,
} from "@/lib/ai/feed-item-classification";
import {
  computeArticleQuota,
  hasEnoughTopPriorityTopics,
  quotaWindowStart,
  selectFreshFeedItems,
  MAX_RSS_CANDIDATES_PER_FETCH,
  MIN_TOP_PRIORITY_TOPICS_FOR_FETCH,
  type ArticleQuota,
} from "@/lib/ai/rss-article-quota";
import {
  classifyFeedItem,
  resolveClassificationProvider,
  type ClassificationProvider,
  type ClassifyFeedItemDb,
} from "@/lib/services/ai/classify-feed-item.service";
import { loadClassificationContext } from "@/lib/services/cron/classify-feed-items.service";
import { GenerationTracer } from "@/lib/generation-trace/tracer";
import {
  signRssCandidate,
  verifyRssCandidate,
  type RssCandidate,
} from "@/lib/security/rss-candidate-token";
import type { Prisma } from "@prisma/client";

/**
 * Manual RSS fetch with a bounded database footprint.
 *
 * A fetch classifies at most MAX_RSS_CANDIDATES_PER_FETCH fresh feed items with
 * the existing classifier BEFORE anything is written, keeps only HIGH verdicts,
 * and saves them only within the source's rolling weekly quota. When there are
 * more HIGH candidates than free slots, they are returned signed (never stored)
 * so the owner can pick which to keep — see saveSelectedRssArticles.
 */

/** Wall-clock budget for one fetch; the ingest route's maxDuration leaves headroom above it. */
export const RSS_FETCH_BUDGET_MS = 240_000;

/** Items extracted and classified at once. */
export const RSS_FETCH_CONCURRENCY = 4;

export interface RssCandidateView {
  token: string;
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
  primaryTopic: string | null;
  reason: string | null;
}

export type RssFetchResult =
  | {
      success: true;
      /** Articles saved by this fetch (zero when the user has to pick). */
      created: number;
      /** Fresh feed items considered for classification. */
      considered: number;
      /** Of those, how many were read and classified before the deadline (failures included). */
      checked: number;
      /** Set when HIGH candidates exceed the remaining quota and the user must pick. */
      candidates: RssCandidateView[] | null;
      quota: ArticleQuota;
      translationWorkCreated: number;
    }
  | { success: false; code: "TOPIC_PRIORITIES_REQUIRED"; required: number; configured: number }
  | { success: false; code: "ARTICLE_QUOTA_EXHAUSTED"; quota: ArticleQuota }
  | { success: false; code: "NO_ACTIVE_PROVIDER" }
  | { success: false; code: "INGEST_FAILED"; message: string };

export type SaveRssArticlesResult =
  | { success: true; created: number; quota: ArticleQuota; translationWorkCreated: number }
  | { success: false; code: "INVALID_SELECTION"; message: string }
  | { success: false; code: "ARTICLE_QUOTA_EXCEEDED"; quota: ArticleQuota }
  | { success: false; code: "TOPIC_PRIORITIES_REQUIRED"; required: number; configured: number };

export interface RssSource {
  id: string;
  type: string;
  config: unknown;
}

export interface FetchRssDeps {
  now?: () => Date;
  loadContext?: (companyId: string) => Promise<ClassificationContext>;
  loadSavedAt?: (sourceId: string, since: Date) => Promise<Date[]>;
  loadSavedUrls?: (sourceId: string, urls: string[]) => Promise<Set<string>>;
  resolveProvider?: () => Promise<ClassificationProvider>;
  parseFeed?: (url: string) => Promise<ParsedFeedItem[]>;
  buildCandidate?: (item: ParsedFeedItem & { url: string }) => Promise<RssCandidate | null>;
  saveCandidates?: (
    source: RssSource,
    companyId: string,
    candidates: RssCandidate[],
    now: Date
  ) => Promise<SaveOutcome>;
  stampFetched?: (sourceId: string) => Promise<void>;
  budgetMs?: number;
  concurrency?: number;
}

export type SaveOutcome =
  | { ok: true; created: number; translationWorkCreated: number; quota: ArticleQuota }
  | { ok: false; quota: ArticleQuota };

async function defaultLoadSavedAt(sourceId: string, since: Date): Promise<Date[]> {
  const rows = await prisma.feedItem.findMany({
    where: { sourceId, createdAt: { gt: since } },
    select: { createdAt: true },
  });
  return rows.map((r) => r.createdAt);
}

async function defaultLoadSavedUrls(sourceId: string, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await prisma.feedItem.findMany({
    where: { sourceId, url: { in: urls } },
    select: { url: true },
  });
  return new Set(rows.map((r) => r.url));
}

function feedUrlOf(source: RssSource): string {
  const url = (source.config as Record<string, unknown> | null)?.url;
  if (typeof url !== "string" || url === "") throw new Error("RSS source has no feed URL.");
  return url;
}

function snippetOf(content: string | null): string | null {
  if (!content) return null;
  const plain = content.replace(/\s+/g, " ").trim();
  return plain.length > 240 ? `${plain.slice(0, 240)}…` : plain;
}

/**
 * In-memory stand-in for the feed_items table: the classifier's claim, settle and
 * failure writes land here instead of in the database, and the verdict it would
 * have stored is captured.
 */
function verdictCapture(): {
  db: ClassifyFeedItemDb;
  verdict: () => Record<string, unknown> | null;
} {
  let verdict: Record<string, unknown> | null = null;
  return {
    db: {
      feedItem: {
        update: async () => ({}),
        updateMany: async ({ data }) => {
          if (data.classificationStatus === "completed") verdict = data;
          return { count: 1 };
        },
      },
    },
    verdict: () => verdict,
  };
}

/**
 * Reads, classifies and — only when HIGH — describes one feed item as a
 * candidate. Returns null for anything that must not be saved: a non-HIGH
 * verdict, a failure, a timeout, or nothing readable.
 */
export async function classifyRssCandidate(
  item: ParsedFeedItem & { url: string },
  context: ClassificationContext,
  provider: Extract<ClassificationProvider, { ok: true }>,
  deadlineMs: number,
  now: () => Date = () => new Date(),
  extract: typeof extractArticle = extractArticle
): Promise<RssCandidate | null> {
  if (deadlineMs - now().getTime() < MIN_CLASSIFICATION_ITEM_BUDGET_MS) return null;
  const extracted = await extract(item.url);
  const article = resolveArticleContent(extracted, item.summary, item.fullContent);
  const remaining = deadlineMs - now().getTime();
  if (remaining < MIN_CLASSIFICATION_ITEM_BUDGET_MS) return null;

  const capture = verdictCapture();
  const outcome = await classifyFeedItem(
    {
      id: `candidate:${item.url}`,
      title: item.title,
      content: article.content,
      url: item.url,
      translationStatus: null,
      classificationStatus: "pending",
      classificationHash: null,
      classificationAttemptCount: 0,
    },
    context,
    {
      db: capture.db,
      resolveProvider: async () => provider,
      remainingRunBudgetMs: remaining,
      tracer: GenerationTracer.disabled(),
      now,
    }
  );
  const verdict = capture.verdict();
  if (outcome.status !== "classified" || outcome.classification !== "HIGH" || !verdict) {
    return null;
  }

  return {
    url: item.url,
    title: item.title,
    content: article.content,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    sourceImageUrl: pickSourceImage({
      metaImageUrl: extracted.metaImageUrl,
      feedImageUrl: item.imageUrl,
      contentImageUrl: extracted.contentImageUrl,
    }),
    contentExtraction: article.method,
    contentChars: article.chars,
    contentComplete: article.complete,
    contentExtractionError: article.error,
    classificationMatchedTopics: outcome.matchedTopics,
    classificationReason: (verdict.classificationReason as string | null) ?? null,
    classificationMainSubject: (verdict.classificationMainSubject as string | null) ?? null,
    classificationPrimaryTopic: (verdict.classificationPrimaryTopic as string | null) ?? null,
    classificationHash: (verdict.classificationHash as string | null) ?? null,
    classificationProvider: outcome.provider,
    classificationModel: outcome.model,
    classifiedAt: now().toISOString(),
  };
}

/**
 * Runs `work` over `items` with bounded concurrency, starting nothing after the
 * deadline and abandoning anything still running when it passes. Results keep
 * input order; unfinished and failed entries are null.
 */
export async function mapWithinDeadline<T, R>(
  items: readonly T[],
  concurrency: number,
  deadlineMs: number,
  work: (item: T) => Promise<R | null>,
  now: () => number = Date.now
): Promise<Array<R | null>> {
  const results: Array<R | null> = items.map(() => null);
  let next = 0;
  const runner = async () => {
    while (next < items.length && now() < deadlineMs) {
      const index = next++;
      try {
        results[index] = await work(items[index]);
      } catch (err) {
        console.warn("[rss-fetch] candidate dropped after an error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, deadlineMs - now()));
  });
  await Promise.race([
    Promise.all(Array.from({ length: Math.max(1, concurrency) }, runner)),
    deadline,
  ]);
  clearTimeout(timer);
  // A snapshot, so work finishing after the deadline cannot change the answer.
  return [...results];
}

/**
 * Saves candidates atomically under the weekly cap: the source row is locked, the
 * quota re-counted, and either every new candidate is written or none is.
 */
async function defaultSaveCandidates(
  source: RssSource,
  companyId: string,
  candidates: RssCandidate[],
  now: Date
): Promise<SaveOutcome> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { defaultLang: true },
  });
  const translation = resolveTranslationConfig(
    source.type,
    source.config,
    company?.defaultLang ?? "en"
  );

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM content_sources WHERE id = ${source.id} FOR UPDATE`;
    const recent = await tx.feedItem.findMany({
      where: { sourceId: source.id, createdAt: { gt: quotaWindowStart(now) } },
      select: { createdAt: true },
    });
    const quota = computeArticleQuota(
      recent.map((r) => r.createdAt),
      now
    );
    const existing = await tx.feedItem.findMany({
      where: { sourceId: source.id, url: { in: candidates.map((c) => c.url) } },
      select: { url: true },
    });
    const existingUrls = new Set(existing.map((r) => r.url));
    const fresh = candidates.filter((c) => !existingUrls.has(c.url));
    if (fresh.length > quota.remaining) return { ok: false, quota };

    const data: Prisma.FeedItemCreateManyInput[] = fresh.map((c) => ({
      sourceId: source.id,
      companyId,
      url: c.url,
      title: c.title,
      content: c.content,
      publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
      sourceImageUrl: c.sourceImageUrl,
      contentExtraction: c.contentExtraction,
      contentChars: c.contentChars,
      contentComplete: c.contentComplete,
      contentExtractionError: c.contentExtractionError,
      contentExtractedAt: now,
      ...(translation.enabled
        ? { translationStatus: "pending", translationLanguage: translation.targetLanguage }
        : { translationStatus: "skipped" }),
      classification: "HIGH",
      classificationStatus: FETCH_SETTLED_CLASSIFICATION_STATUS,
      classificationRejectionReason: null,
      classificationMatchedTopics: c.classificationMatchedTopics,
      classificationReason: c.classificationReason,
      classificationMainSubject: c.classificationMainSubject,
      classificationPrimaryTopic: c.classificationPrimaryTopic,
      classificationHash: c.classificationHash,
      classificationProvider: c.classificationProvider,
      classificationModel: c.classificationModel,
      classifiedAt: new Date(c.classifiedAt),
      classificationAttemptCount: 1,
    }));
    if (data.length > 0) await tx.feedItem.createMany({ data });

    const savedAt = [...recent.map((r) => r.createdAt), ...data.map(() => now)];
    return {
      ok: true,
      created: data.length,
      translationWorkCreated: translation.enabled ? data.length : 0,
      quota: computeArticleQuota(savedAt, now),
    };
  });
}

function topicGate(context: ClassificationContext) {
  if (hasEnoughTopPriorityTopics(context.priorities)) return null;
  return {
    success: false as const,
    code: "TOPIC_PRIORITIES_REQUIRED" as const,
    required: MIN_TOP_PRIORITY_TOPICS_FOR_FETCH,
    configured: context.priorities.high.length,
  };
}

/** The manual "Fetch" for an RSS source. Access control is the caller's. */
export async function fetchRssArticles(
  source: RssSource,
  companyId: string,
  deps: FetchRssDeps = {}
): Promise<RssFetchResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const loadContext = deps.loadContext ?? loadClassificationContext;
  const loadSavedAt = deps.loadSavedAt ?? defaultLoadSavedAt;
  const loadSavedUrls = deps.loadSavedUrls ?? defaultLoadSavedUrls;
  const resolveProvider = deps.resolveProvider ?? resolveClassificationProvider;
  const fetchFeed = deps.parseFeed ?? parseFeed;
  const saveCandidates = deps.saveCandidates ?? defaultSaveCandidates;
  const stampFetched = deps.stampFetched ?? defaultStampFetched;
  const deadlineMs = startedAt.getTime() + (deps.budgetMs ?? RSS_FETCH_BUDGET_MS);

  // Every refusal below happens before the feed is read or anything is written.
  const context = await loadContext(companyId);
  const gate = topicGate(context);
  if (gate) return gate;

  const quota = computeArticleQuota(
    await loadSavedAt(source.id, quotaWindowStart(startedAt)),
    startedAt
  );
  if (quota.remaining === 0) return { success: false, code: "ARTICLE_QUOTA_EXHAUSTED", quota };

  const provider = await resolveProvider();
  if (!provider.ok) return { success: false, code: "NO_ACTIVE_PROVIDER" };

  let items: ParsedFeedItem[];
  try {
    items = await fetchFeed(feedUrlOf(source));
  } catch (err) {
    return {
      success: false,
      code: "INGEST_FAILED",
      message: err instanceof Error ? err.message : "Could not read the feed.",
    };
  }

  const urls = items.map((i) => i.url).filter((u): u is string => !!u);
  const fresh = selectFreshFeedItems(items, await loadSavedUrls(source.id, urls));
  const build =
    deps.buildCandidate ??
    ((item: ParsedFeedItem & { url: string }) =>
      classifyRssCandidate(item, context, provider, deadlineMs, now));

  let checked = 0;
  const results = await mapWithinDeadline(
    fresh,
    deps.concurrency ?? RSS_FETCH_CONCURRENCY,
    deadlineMs,
    async (item) => {
      const candidate = await build(item);
      checked++;
      return candidate;
    },
    () => now().getTime()
  );
  const high = results
    .filter((c): c is RssCandidate => c !== null)
    .slice(0, MAX_RSS_CANDIDATES_PER_FETCH);
  const toView = (c: RssCandidate): RssCandidateView => ({
    token: signRssCandidate(source.id, c, now()),
    url: c.url,
    title: c.title,
    snippet: snippetOf(c.content),
    publishedAt: c.publishedAt,
    primaryTopic: c.classificationPrimaryTopic,
    reason: c.classificationReason,
  });

  console.info("[rss-fetch] classified", {
    sourceId: source.id,
    feedItems: items.length,
    considered: fresh.length,
    checked,
    high: high.length,
    remainingQuota: quota.remaining,
  });

  if (high.length > quota.remaining) {
    await stampFetched(source.id);
    return {
      success: true,
      created: 0,
      considered: fresh.length,
      checked,
      candidates: high.map(toView),
      quota,
      translationWorkCreated: 0,
    };
  }

  const saved = await saveCandidates(source, companyId, high, now());
  await stampFetched(source.id);
  if (!saved.ok) {
    // A concurrent save took the free slots; offer the candidates instead.
    if (saved.quota.remaining === 0) {
      return { success: false, code: "ARTICLE_QUOTA_EXHAUSTED", quota: saved.quota };
    }
    return {
      success: true,
      created: 0,
      considered: fresh.length,
      checked,
      candidates: high.map(toView),
      quota: saved.quota,
      translationWorkCreated: 0,
    };
  }
  return {
    success: true,
    created: saved.created,
    considered: fresh.length,
    checked,
    candidates: null,
    quota: saved.quota,
    translationWorkCreated: saved.translationWorkCreated,
  };
}

async function defaultStampFetched(sourceId: string): Promise<void> {
  await prisma.contentSource.update({
    where: { id: sourceId },
    data: { lastFetchedAt: new Date() },
  });
}

export interface SaveRssDeps {
  now?: () => Date;
  loadContext?: (companyId: string) => Promise<ClassificationContext>;
  saveCandidates?: FetchRssDeps["saveCandidates"];
  verify?: (token: string, sourceId: string, now: Date) => RssCandidate | null;
}

/** Saves the candidates the owner picked. Over the cap → nothing is saved. */
export async function saveSelectedRssArticles(
  source: RssSource,
  companyId: string,
  tokens: readonly string[],
  deps: SaveRssDeps = {}
): Promise<SaveRssArticlesResult> {
  const now = (deps.now ?? (() => new Date()))();
  const loadContext = deps.loadContext ?? loadClassificationContext;
  const saveCandidates = deps.saveCandidates ?? defaultSaveCandidates;
  const verify = deps.verify ?? verifyRssCandidate;

  const gate = topicGate(await loadContext(companyId));
  if (gate) return gate;

  if (tokens.length === 0) {
    return { success: false, code: "INVALID_SELECTION", message: "Select at least one article." };
  }
  const candidates: RssCandidate[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const candidate = verify(token, source.id, now);
    if (!candidate) {
      return {
        success: false,
        code: "INVALID_SELECTION",
        message: "The article list has expired. Fetch the source again.",
      };
    }
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    candidates.push(candidate);
  }

  const saved = await saveCandidates(source, companyId, candidates, now);
  if (!saved.ok) return { success: false, code: "ARTICLE_QUOTA_EXCEEDED", quota: saved.quota };
  return {
    success: true,
    created: saved.created,
    quota: saved.quota,
    translationWorkCreated: saved.translationWorkCreated,
  };
}

export type SaveRssArticleSelectionResult =
  SaveRssArticlesResult | { success: false; code: "NOT_FOUND" | "FORBIDDEN" };

/** The "keep these articles" action. Owners and global admins only, as for Fetch. */
export async function saveRssArticleSelection(
  slug: string,
  sourceId: string,
  userId: string,
  isGlobalAdmin: boolean,
  tokens: readonly string[]
): Promise<SaveRssArticleSelectionResult> {
  let companyId: string;
  if (isGlobalAdmin) {
    const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
    if (!company) return { success: false, code: "NOT_FOUND" };
    companyId = company.id;
  } else {
    const membership = await prisma.companyMember.findFirst({
      where: { company: { slug }, userId },
      select: { companyId: true, role: true },
    });
    if (!membership) return { success: false, code: "NOT_FOUND" };
    if (membership.role !== "owner") return { success: false, code: "FORBIDDEN" };
    companyId = membership.companyId;
  }

  const source = await prisma.contentSource.findFirst({
    where: { id: sourceId, companyId, type: "rss" },
    select: { id: true, type: true, config: true },
  });
  if (!source) return { success: false, code: "NOT_FOUND" };

  return saveSelectedRssArticles(source, companyId, tokens);
}
