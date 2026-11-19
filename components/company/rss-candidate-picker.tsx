"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/i18n/api-error";
import { formatDate } from "@/lib/i18n/format-date";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { ArticleQuota } from "@/lib/ai/rss-article-quota";
import type { RssCandidateView } from "@/lib/services/company/fetch-rss-articles.service";

interface Props {
  slug: string;
  sourceId: string;
  candidates: RssCandidateView[];
  remaining: number;
  onSaved: (created: number, quota: ArticleQuota) => void;
  onDiscard: () => void;
}

/**
 * Top-priority articles a fetch found but did not save, because there were more
 * than the source's remaining weekly quota. They live only in this component.
 */
export function RssCandidatePicker({
  slug,
  sourceId,
  candidates,
  remaining,
  onSaved,
  onDiscard,
}: Props) {
  const t = useTranslations("contentSources.candidates");
  const tCommon = useTranslations("common");
  const apiError = useApiErrorMessage();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(token: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else if (next.size < remaining) next.add(token);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/companies/${slug}/content-sources/${sourceId}/articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: [...selected] }),
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      if (!res.ok) {
        const json = isJson ? ((await res.json()) as { error?: { message?: string } }) : null;
        throw new Error(apiError(json?.error));
      }
      const json = (await res.json()) as { created: number; quota: ArticleQuota };
      onSaved(json.created, json.quota);
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border mb-3 rounded-md border p-3">
      <p className="text-fg mb-1 text-sm font-medium">{t("title", { count: candidates.length })}</p>
      <p className="text-fg-faint mb-3 text-xs">
        {t("help", { remaining, selected: selected.size })}
      </p>
      {error && (
        <Alert variant="error" className="mb-3">
          {error}
        </Alert>
      )}
      <ul className="max-h-96 overflow-y-auto">
        {candidates.map((c) => {
          const checked = selected.has(c.token);
          const disabled = !checked && selected.size >= remaining;
          return (
            <li
              key={c.token}
              className="border-border flex items-start gap-3 border-b py-2 last:border-0"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || saving}
                onChange={() => toggle(c.token)}
                aria-label={c.title ?? c.url}
                className="accent-fg mt-0.5 h-4 w-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-fg text-sm leading-snug font-medium">
                    {c.title ?? t("noTitle")}
                  </p>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fg-faint hover:text-accent shrink-0 transition-colors"
                    aria-label={t("viewOriginal")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {c.publishedAt && (
                  <p className="text-fg-faint mt-0.5 text-xs">{formatDate(c.publishedAt)}</p>
                )}
                {c.primaryTopic && (
                  <p className="text-fg-muted mt-0.5 text-xs">
                    {t("topic", { topic: c.primaryTopic })}
                  </p>
                )}
                {c.snippet && (
                  <p className="text-fg-muted mt-1 text-xs leading-relaxed">{c.snippet}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={selected.size === 0}
          onClick={handleSave}
        >
          {saving ? tCommon("saving") : t("save", { count: selected.size })}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          {t("discard")}
        </Button>
      </div>
    </div>
  );
}
