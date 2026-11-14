import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RSS_CANDIDATE_TOKEN_TTL_MS,
  signRssCandidate,
  verifyRssCandidate,
  type RssCandidate,
} from "./rss-candidate-token";

const SECRET = "test-secret";
const NOW = new Date("2026-11-14T12:00:00Z");

const CANDIDATE: RssCandidate = {
  url: "https://example.com/a",
  title: "Как да изберем латекс",
  content: "Текст",
  publishedAt: null,
  sourceImageUrl: null,
  contentExtraction: "readability",
  contentChars: 5,
  contentComplete: true,
  contentExtractionError: null,
  classificationMatchedTopics: ["бои"],
  classificationReason: "About paint.",
  classificationMainSubject: "Латекс",
  classificationPrimaryTopic: "бои",
  classificationHash: "h",
  classificationProvider: "GROQ",
  classificationModel: "m",
  classifiedAt: NOW.toISOString(),
};

describe("RSS candidate tokens", () => {
  it("round-trips a candidate for the same source", () => {
    const token = signRssCandidate("src-1", CANDIDATE, NOW, SECRET);
    assert.deepEqual(verifyRssCandidate(token, "src-1", NOW, SECRET), CANDIDATE);
  });

  it("rejects a token for another source", () => {
    const token = signRssCandidate("src-1", CANDIDATE, NOW, SECRET);
    assert.equal(verifyRssCandidate(token, "src-2", NOW, SECRET), null);
  });

  it("rejects a tampered payload", () => {
    const token = signRssCandidate("src-1", CANDIDATE, NOW, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sourceId: "src-1",
        issuedAt: NOW.getTime(),
        candidate: { ...CANDIDATE, url: "https://evil" },
      })
    ).toString("base64url");
    assert.equal(verifyRssCandidate(`${forged}.${sig}`, "src-1", NOW, SECRET), null);
    assert.equal(verifyRssCandidate(token, "src-1", NOW, "other-secret"), null);
    assert.equal(verifyRssCandidate("garbage", "src-1", NOW, SECRET), null);
  });

  it("expires", () => {
    const token = signRssCandidate("src-1", CANDIDATE, NOW, SECRET);
    const later = new Date(NOW.getTime() + RSS_CANDIDATE_TOKEN_TTL_MS + 1);
    assert.equal(verifyRssCandidate(token, "src-1", later, SECRET), null);
  });
});
