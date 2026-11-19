import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, self-contained RSS article candidates.
 *
 * Candidates offered for review are never written to the database, so the
 * browser holds them until the owner picks which to keep. Signing them keeps the
 * save step from storing an article (or a HIGH verdict) the server never produced.
 */

/** Everything needed to save one article exactly as it was classified at fetch time. */
export interface RssCandidate {
  url: string;
  title: string | null;
  content: string | null;
  publishedAt: string | null;
  sourceImageUrl: string | null;
  contentExtraction: string | null;
  contentChars: number;
  contentComplete: boolean;
  contentExtractionError: string | null;
  classificationMatchedTopics: string[];
  classificationReason: string | null;
  classificationMainSubject: string | null;
  classificationPrimaryTopic: string | null;
  classificationHash: string | null;
  classificationProvider: string | null;
  classificationModel: string | null;
  classifiedAt: string;
}

/** Long enough for an open tab, short enough that stale candidates stop being savable. */
export const RSS_CANDIDATE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface TokenPayload {
  sourceId: string;
  issuedAt: number;
  candidate: RssCandidate;
}

function defaultSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set.");
  return secret;
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("hex");
}

export function signRssCandidate(
  sourceId: string,
  candidate: RssCandidate,
  now: Date = new Date(),
  secret: string = defaultSecret()
): string {
  const payload: TokenPayload = { sourceId, issuedAt: now.getTime(), candidate };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

/** The candidate, or null when the token is forged, expired, or for another source. */
export function verifyRssCandidate(
  token: string,
  sourceId: string,
  now: Date = new Date(),
  secret: string = defaultSecret()
): RssCandidate | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(encoded, secret), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.sourceId !== sourceId) return null;
  const age = now.getTime() - payload.issuedAt;
  if (!(age >= 0 && age <= RSS_CANDIDATE_TOKEN_TTL_MS)) return null;
  return payload.candidate;
}
