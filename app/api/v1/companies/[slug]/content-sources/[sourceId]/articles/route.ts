import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { MAX_RSS_CANDIDATES_PER_FETCH } from "@/lib/ai/rss-article-quota";
import { saveRssArticleSelection } from "@/lib/services/company/fetch-rss-articles.service";
import { enqueueTranslationAfterIngest } from "@/lib/services/company/enqueue-translation-after-ingest";

const bodySchema = z.object({
  tokens: z.array(z.string().min(1)).min(1).max(MAX_RSS_CANDIDATES_PER_FETCH),
});

/** Saves the RSS candidates the owner picked after a fetch. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );

  const { slug, sourceId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid JSON" } },
      { status: 400 }
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          issues: parsed.error.issues,
        },
      },
      { status: 422 }
    );
  }

  const result = await saveRssArticleSelection(
    slug,
    sourceId,
    session.user.id,
    session.user.isGlobalAdmin,
    parsed.data.tokens
  );

  if (!result.success) {
    switch (result.code) {
      case "NOT_FOUND":
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Not found" } },
          { status: 404 }
        );
      case "FORBIDDEN":
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Forbidden" } },
          { status: 403 }
        );
      case "INVALID_SELECTION":
        return NextResponse.json(
          { error: { code: "INVALID_SELECTION", message: result.message } },
          { status: 422 }
        );
      case "ARTICLE_QUOTA_EXCEEDED":
        return NextResponse.json(
          {
            error: {
              code: "ARTICLE_QUOTA_EXCEEDED",
              message: `Only ${result.quota.remaining} more articles can be saved from this source this week.`,
              quota: result.quota,
            },
          },
          { status: 409 }
        );
      case "TOPIC_PRIORITIES_REQUIRED":
        return NextResponse.json(
          {
            error: {
              code: "TOPIC_PRIORITIES_REQUIRED",
              message: `Add at least ${result.required} top-priority topics in Brand settings before fetching.`,
              required: result.required,
              configured: result.configured,
            },
          },
          { status: 409 }
        );
    }
  }

  await enqueueTranslationAfterIngest(result.translationWorkCreated, { slug, sourceId });

  return NextResponse.json({ created: result.created, quota: result.quota });
}
