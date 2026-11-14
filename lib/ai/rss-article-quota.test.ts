import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ARTICLE_QUOTA_WINDOW_MS,
  MAX_SAVED_ARTICLES_PER_WINDOW,
  computeArticleQuota,
  hasEnoughTopPriorityTopics,
  selectFreshFeedItems,
} from "./rss-article-quota";
import { resolveTopicPriorities } from "./topic-priorities";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("hasEnoughTopPriorityTopics", () => {
  it("needs three top-priority topics; medium and avoided ones do not count", () => {
    const two = resolveTopicPriorities({
      topPriorityTopics: ["бои", "лакове"],
      mediumPriorityTopics: ["вентилация", "мазилки", "плочки"],
      avoidedTopics: ["камини"],
    });
    assert.equal(hasEnoughTopPriorityTopics(two), false);

    const three = resolveTopicPriorities({ topPriorityTopics: ["бои", "лакове", "грундове"] });
    assert.equal(hasEnoughTopPriorityTopics(three), true);
  });
});

describe("computeArticleQuota", () => {
  it("counts only saves inside the rolling seven days", () => {
    const quota = computeArticleQuota([daysAgo(1), daysAgo(6.9), daysAgo(7.1), daysAgo(30)], NOW);
    assert.equal(quota.used, 2);
    assert.equal(quota.remaining, MAX_SAVED_ARTICLES_PER_WINDOW - 2);
    assert.equal(quota.nextSlotAt, null);
  });

  it("reports when the oldest save in a full window ages out", () => {
    const saves = [daysAgo(6), daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2)];
    const quota = computeArticleQuota(saves, NOW);
    assert.equal(quota.remaining, 0);
    assert.equal(
      quota.nextSlotAt,
      new Date(daysAgo(6).getTime() + ARTICLE_QUOTA_WINDOW_MS).toISOString()
    );
  });

  it("never goes negative when the window holds more than the cap", () => {
    const saves = [daysAgo(6), daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)];
    const quota = computeArticleQuota(saves, NOW);
    assert.equal(quota.remaining, 0);
    // Two saves must age out before the count drops below the cap.
    assert.equal(
      quota.nextSlotAt,
      new Date(daysAgo(5).getTime() + ARTICLE_QUOTA_WINDOW_MS).toISOString()
    );
  });
});

describe("selectFreshFeedItems", () => {
  const entry = (url: string | null, published: Date | null) => ({ url, publishedAt: published });

  it("keeps the newest unsaved items, de-duplicated, up to the limit", () => {
    const items = [
      entry("https://a/1", daysAgo(3)),
      entry("https://a/2", daysAgo(1)),
      entry("https://a/2", daysAgo(1)),
      entry("https://a/saved", daysAgo(0)),
      entry(null, daysAgo(0)),
      entry("https://a/3", daysAgo(2)),
      entry("https://a/undated", null),
    ];
    const picked = selectFreshFeedItems(items, new Set(["https://a/saved"]), 3);
    assert.deepEqual(
      picked.map((i) => i.url),
      ["https://a/2", "https://a/3", "https://a/1"]
    );
  });

  it("puts undated items after dated ones, in feed order", () => {
    const items = [
      entry("https://u/1", null),
      entry("https://d/1", daysAgo(9)),
      entry("https://u/2", null),
    ];
    assert.deepEqual(
      selectFreshFeedItems(items, new Set()).map((i) => i.url),
      ["https://d/1", "https://u/1", "https://u/2"]
    );
  });

  it("caps at twenty by default", () => {
    const items = Array.from({ length: 30 }, (_, i) => entry(`https://x/${i}`, daysAgo(i)));
    assert.equal(selectFreshFeedItems(items, new Set()).length, 20);
  });
});
