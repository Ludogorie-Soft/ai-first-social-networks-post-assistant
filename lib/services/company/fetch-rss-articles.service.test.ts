process.env.AUTH_SECRET ??= "test-auth-secret";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRssCandidate,
  fetchRssArticles,
  mapWithinDeadline,
  saveSelectedRssArticles,
  type FetchRssDeps,
  type SaveOutcome,
} from "./fetch-rss-articles.service";
import { computeArticleQuota } from "@/lib/ai/rss-article-quota";
import { resolveTopicPriorities } from "@/lib/ai/topic-priorities";
import type { ClassificationContext } from "@/lib/ai/feed-item-classification";
import type { ParsedFeedItem } from "@/lib/integrations/rss/parser";
import { signRssCandidate, type RssCandidate } from "@/lib/security/rss-candidate-token";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const SOURCE = { id: "src-1", type: "rss", config: { url: "https://feed.example/rss" } };

const READY: ClassificationContext = {
  priorities: resolveTopicPriorities({
    topPriorityTopics: ["бои", "лакове", "грундове"],
    mediumPriorityTopics: ["вентилация"],
  }),
  companyDescription: null,
  targetAudience: null,
};
const NOT_READY: ClassificationContext = {
  ...READY,
  priorities: resolveTopicPriorities({
    topPriorityTopics: ["бои", "лакове"],
    mediumPriorityTopics: ["вентилация", "мазилки", "плочки"],
  }),
};

function feedItem(n: number): ParsedFeedItem {
  return {
    title: `Article ${n}`,
    url: `https://site.example/${n}`,
    summary: null,
    fullContent: null,
    publishedAt: new Date(NOW.getTime() - n * 60_000),
    imageUrl: null,
  };
}

function candidate(url: string): RssCandidate {
  return {
    url,
    title: url,
    content: "body",
    publishedAt: null,
    sourceImageUrl: null,
    contentExtraction: "readability",
    contentChars: 4,
    contentComplete: true,
    contentExtractionError: null,
    classificationMatchedTopics: ["бои"],
    classificationReason: "r",
    classificationMainSubject: "s",
    classificationPrimaryTopic: "бои",
    classificationHash: "h",
    classificationProvider: "P",
    classificationModel: "M",
    classifiedAt: NOW.toISOString(),
  };
}

interface Calls {
  feedRead: number;
  built: string[];
  saved: RssCandidate[][];
  stamped: number;
}

function deps(
  opts: {
    context?: ClassificationContext;
    savedAt?: Date[];
    savedUrls?: string[];
    items?: ParsedFeedItem[];
    highUrls?: string[];
    noProvider?: boolean;
    save?: (c: RssCandidate[]) => SaveOutcome;
  } = {}
): { deps: FetchRssDeps; calls: Calls } {
  const calls: Calls = { feedRead: 0, built: [], saved: [], stamped: 0 };
  const high = new Set(opts.highUrls ?? []);
  return {
    calls,
    deps: {
      now: () => NOW,
      loadContext: async () => opts.context ?? READY,
      loadSavedAt: async () => opts.savedAt ?? [],
      loadSavedUrls: async () => new Set(opts.savedUrls ?? []),
      resolveProvider: async () =>
        opts.noProvider
          ? { ok: false }
          : {
              ok: true,
              provider: "P",
              model: "M",
              instance: { generate: async () => ({ text: "" }) },
            },
      parseFeed: async () => {
        calls.feedRead++;
        return opts.items ?? [];
      },
      buildCandidate: async (item) => {
        calls.built.push(item.url);
        return high.has(item.url) ? candidate(item.url) : null;
      },
      saveCandidates: async (_s, _c, cands, now) => {
        calls.saved.push(cands);
        if (opts.save) return opts.save(cands);
        const quota = computeArticleQuota([...(opts.savedAt ?? []), ...cands.map(() => now)], now);
        return { ok: true, created: cands.length, translationWorkCreated: 0, quota };
      },
      stampFetched: async () => {
        calls.stamped++;
      },
    },
  };
}

describe("fetchRssArticles — topic gate", () => {
  it("refuses before reading the feed or writing anything", async () => {
    const { deps: d, calls } = deps({ context: NOT_READY, items: [feedItem(1)] });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.deepEqual(result, {
      success: false,
      code: "TOPIC_PRIORITIES_REQUIRED",
      required: 3,
      configured: 2,
    });
    assert.equal(calls.feedRead, 0);
    assert.equal(calls.saved.length, 0);
    assert.equal(calls.stamped, 0);
  });
});

describe("fetchRssArticles — refusals before any work", () => {
  it("refuses when the weekly quota is spent, and says when a slot frees", async () => {
    const savedAt = [1, 2, 3, 4, 5].map((d) => new Date(NOW.getTime() - d * DAY));
    const { deps: d, calls } = deps({ savedAt, items: [feedItem(1)] });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, "ARTICLE_QUOTA_EXHAUSTED");
    if (!result.success && result.code === "ARTICLE_QUOTA_EXHAUSTED") {
      assert.equal(
        result.quota.nextSlotAt,
        new Date(NOW.getTime() - 5 * DAY + 7 * DAY).toISOString()
      );
    }
    assert.equal(calls.feedRead, 0);
  });

  it("returns a clear error with no provider and saves nothing", async () => {
    const { deps: d, calls } = deps({ noProvider: true, items: [feedItem(1)] });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.deepEqual(result, { success: false, code: "NO_ACTIVE_PROVIDER" });
    assert.equal(calls.feedRead, 0);
    assert.equal(calls.saved.length, 0);
  });
});

describe("fetchRssArticles — bounded classification", () => {
  it("classifies at most the 20 newest items not already saved", async () => {
    const items = Array.from({ length: 30 }, (_, i) => feedItem(i));
    const { deps: d, calls } = deps({ items, savedUrls: ["https://site.example/0"] });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.equal(result.success, true);
    assert.equal(calls.built.length, 20);
    assert.ok(!calls.built.includes("https://site.example/0"));
    assert.deepEqual(
      [...calls.built].sort(),
      Array.from({ length: 20 }, (_, i) => `https://site.example/${i + 1}`).sort()
    );
  });
});

describe("fetchRssArticles — the weekly cap", () => {
  it("saves HIGH candidates without asking when they fit", async () => {
    const items = [1, 2, 3, 4].map(feedItem);
    const { deps: d, calls } = deps({
      items,
      highUrls: ["https://site.example/1", "https://site.example/3"],
    });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.ok(result.success);
    assert.equal(result.created, 2);
    assert.equal(result.candidates, null);
    assert.deepEqual(calls.saved[0].map((c) => c.url).sort(), [
      "https://site.example/1",
      "https://site.example/3",
    ]);
    assert.equal(result.quota.remaining, 3);
  });

  it("offers candidates and saves nothing when they exceed the remaining quota", async () => {
    const items = [1, 2, 3, 4].map(feedItem);
    const savedAt = [1, 2].map((dd) => new Date(NOW.getTime() - dd * DAY));
    const { deps: d, calls } = deps({
      items,
      savedAt,
      highUrls: items.map((i) => i.url as string),
    });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.ok(result.success);
    assert.equal(result.created, 0);
    assert.equal(result.candidates?.length, 4);
    assert.equal(result.quota.remaining, 3);
    assert.equal(calls.saved.length, 0, "no candidate row is written");
  });

  it("saves nothing when no item is HIGH", async () => {
    const { deps: d } = deps({ items: [1, 2].map(feedItem), highUrls: [] });
    const result = await fetchRssArticles(SOURCE, "co-1", d);
    assert.ok(result.success);
    assert.equal(result.created, 0);
    assert.equal(result.candidates, null);
  });
});

describe("saveSelectedRssArticles", () => {
  const token = (url: string, sourceId = SOURCE.id) =>
    signRssCandidate(sourceId, candidate(url), NOW);

  it("saves the picked candidates", async () => {
    const { deps: d, calls } = deps();
    const result = await saveSelectedRssArticles(
      SOURCE,
      "co-1",
      [token("https://a/1"), token("https://a/2")],
      { now: () => NOW, loadContext: d.loadContext, saveCandidates: d.saveCandidates }
    );
    assert.ok(result.success);
    assert.equal(result.created, 2);
    assert.deepEqual(
      calls.saved[0].map((c) => c.url),
      ["https://a/1", "https://a/2"]
    );
  });

  it("returns an error and saves nothing when the selection would exceed the cap", async () => {
    const full = computeArticleQuota(
      [1, 2, 3, 4].map((dd) => new Date(NOW.getTime() - dd * DAY)),
      NOW
    );
    const { deps: d } = deps({ save: () => ({ ok: false, quota: full }) });
    const result = await saveSelectedRssArticles(
      SOURCE,
      "co-1",
      [token("https://a/1"), token("https://a/2")],
      { now: () => NOW, loadContext: d.loadContext, saveCandidates: d.saveCandidates }
    );
    assert.deepEqual(result, { success: false, code: "ARTICLE_QUOTA_EXCEEDED", quota: full });
  });

  it("rejects a token issued for another source before saving anything", async () => {
    const { deps: d, calls } = deps();
    const result = await saveSelectedRssArticles(
      SOURCE,
      "co-1",
      [token("https://a/1", "src-other")],
      { now: () => NOW, loadContext: d.loadContext, saveCandidates: d.saveCandidates }
    );
    assert.equal(result.success, false);
    assert.equal(!result.success && result.code, "INVALID_SELECTION");
    assert.equal(calls.saved.length, 0);
  });

  it("is still gated on top-priority topics", async () => {
    const { deps: d, calls } = deps({ context: NOT_READY });
    const result = await saveSelectedRssArticles(SOURCE, "co-1", [token("https://a/1")], {
      now: () => NOW,
      loadContext: d.loadContext,
      saveCandidates: d.saveCandidates,
    });
    assert.equal(!result.success && result.code, "TOPIC_PRIORITIES_REQUIRED");
    assert.equal(calls.saved.length, 0);
  });
});

describe("mapWithinDeadline", () => {
  it("returns what finished in time and drops the rest", async () => {
    const start = Date.now();
    const results = await mapWithinDeadline(
      [10, 500, 20],
      3,
      start + 150,
      (ms) => new Promise<number>((resolve) => setTimeout(() => resolve(ms), ms))
    );
    assert.deepEqual(results, [10, null, 20]);
  });

  it("turns a thrown item into null without failing the rest", async () => {
    const results = await mapWithinDeadline([1, 2], 1, Date.now() + 1000, async (n) => {
      if (n === 1) throw new Error("boom");
      return n;
    });
    assert.deepEqual(results, [null, 2]);
  });
});

describe("classifyRssCandidate", () => {
  const item = { ...feedItem(1), url: "https://site.example/1" };
  const noPage = async () => ({
    text: "Как да изберем латекс за стените в детската стая и какво да проверим преди покупка.",
    method: "readability" as const,
    error: null,
    metaImageUrl: "https://site.example/img.jpg",
    contentImageUrl: null,
  });
  const understanding = JSON.stringify({
    mainSubject: "Избор на латекс за стени.",
    centralThesis: null,
    centralConflict: null,
    articleType: "news",
    secondaryTopics: [],
    incidentalTopics: [],
    entities: [],
    confidence: 0.9,
    evidence: [{ chunkIndex: 0, reason: "states the subject directly" }],
  });
  const verdict = (classification: string, primaryTopic: string) =>
    JSON.stringify({
      primaryTopic,
      classification,
      rejectionReason: null,
      matchedTopics: [primaryTopic],
      reason: "About choosing paint.",
    });
  const provider = (replies: string[]) => ({
    ok: true as const,
    provider: "P",
    model: "M",
    instance: { generate: async () => ({ text: replies.shift() ?? "" }) },
  });
  const later = () => Date.now() + 120_000;

  it("describes a HIGH article with the verdict it was given", async () => {
    const result = await classifyRssCandidate(
      item,
      READY,
      provider([understanding, verdict("HIGH", "бои")]),
      later(),
      () => new Date(),
      noPage
    );
    assert.ok(result);
    assert.equal(result.url, item.url);
    assert.equal(result.classificationPrimaryTopic, "бои");
    assert.equal(result.classificationMainSubject, "Избор на латекс за стени.");
    assert.equal(result.classificationProvider, "P");
    assert.equal(result.sourceImageUrl, "https://site.example/img.jpg");
    assert.ok(result.classificationHash);
  });

  it("drops a MEDIUM article", async () => {
    const result = await classifyRssCandidate(
      item,
      READY,
      provider([understanding, verdict("MEDIUM", "вентилация")]),
      later(),
      () => new Date(),
      noPage
    );
    assert.equal(result, null);
  });

  it("drops an article whose classification failed", async () => {
    const result = await classifyRssCandidate(
      item,
      READY,
      provider(["not json", "still not json", "nope", "no"]),
      later(),
      () => new Date(),
      noPage
    );
    assert.equal(result, null);
  });

  it("drops an item when too little budget is left, without reading the page", async () => {
    let read = false;
    const result = await classifyRssCandidate(
      item,
      READY,
      provider([]),
      Date.now() - 1,
      () => new Date(),
      async () => {
        read = true;
        return noPage();
      }
    );
    assert.equal(result, null);
    assert.equal(read, false);
  });
});
