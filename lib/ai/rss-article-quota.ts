/**
 * Limits on how much a manual RSS fetch may store.
 *
 * The free database tier is the constraint: an RSS source used to store every
 * article its feed listed, on every fetch. A fetch now classifies a bounded number
 * of fresh items first and keeps only top-priority (HIGH) ones, within a per-source
 * rolling weekly cap.
 *
 * Pure: no Prisma, no network.
 */

import type { TopicPriorities } from "./topic-priorities";

/** Top-priority topics a brand needs before any RSS source may be fetched. */
export const MIN_TOP_PRIORITY_TOPICS_FOR_FETCH = 3;

/** Fresh feed items classified per fetch — also the most candidates ever offered. */
export const MAX_RSS_CANDIDATES_PER_FETCH = 20;

/** Articles one source may save in any rolling {@link ARTICLE_QUOTA_WINDOW_MS}. */
export const MAX_SAVED_ARTICLES_PER_WINDOW = 5;

export const ARTICLE_QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** RSS sources one brand may have. Competitor sources and other types are not counted. */
export const MAX_RSS_SOURCES_PER_COMPANY = 6;

export function topPriorityTopicCount(priorities: TopicPriorities): number {
  return priorities.high.length;
}

export function hasEnoughTopPriorityTopics(priorities: TopicPriorities): boolean {
  return topPriorityTopicCount(priorities) >= MIN_TOP_PRIORITY_TOPICS_FOR_FETCH;
}

export interface ArticleQuota {
  limit: number;
  used: number;
  remaining: number;
  /** When the oldest save in the window ages out; null while a slot is free. */
  nextSlotAt: string | null;
}

export function quotaWindowStart(now: Date): Date {
  return new Date(now.getTime() - ARTICLE_QUOTA_WINDOW_MS);
}

/** `savedAt` = creation times of this source's articles; older ones are ignored. */
export function computeArticleQuota(savedAt: readonly Date[], now: Date): ArticleQuota {
  const start = quotaWindowStart(now).getTime();
  const inWindow = savedAt
    .map((d) => d.getTime())
    .filter((t) => t > start)
    .sort((a, b) => a - b);
  const used = inWindow.length;
  const remaining = Math.max(0, MAX_SAVED_ARTICLES_PER_WINDOW - used);
  // With `used` saves in the window, a slot frees when the save that keeps the
  // count at the limit ages out.
  const nextSlotAt =
    remaining > 0
      ? null
      : new Date(
          inWindow[used - MAX_SAVED_ARTICLES_PER_WINDOW] + ARTICLE_QUOTA_WINDOW_MS
        ).toISOString();
  return { limit: MAX_SAVED_ARTICLES_PER_WINDOW, used, remaining, nextSlotAt };
}

export interface DatedFeedEntry {
  url: string | null;
  publishedAt: Date | null;
}

/**
 * The newest `limit` items with a URL that is not already saved, de-duplicated by
 * URL. Undated items sort after dated ones and keep their feed order.
 */
export function selectFreshFeedItems<T extends DatedFeedEntry>(
  items: readonly T[],
  savedUrls: ReadonlySet<string>,
  limit: number = MAX_RSS_CANDIDATES_PER_FETCH
): Array<T & { url: string }> {
  const seen = new Set<string>();
  const fresh: Array<{ item: T & { url: string }; index: number }> = [];
  items.forEach((item, index) => {
    if (!item.url || savedUrls.has(item.url) || seen.has(item.url)) return;
    seen.add(item.url);
    fresh.push({ item: item as T & { url: string }, index });
  });
  fresh.sort((a, b) => {
    const ta = a.item.publishedAt?.getTime();
    const tb = b.item.publishedAt?.getTime();
    if (ta !== undefined && tb !== undefined && ta !== tb) return tb - ta;
    if (ta !== undefined && tb === undefined) return -1;
    if (ta === undefined && tb !== undefined) return 1;
    return a.index - b.index;
  });
  return fresh.slice(0, limit).map((f) => f.item);
}
