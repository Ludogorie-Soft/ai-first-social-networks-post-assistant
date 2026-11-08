import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import {
  CONTACT_EMAIL,
  LAST_UPDATED,
  PRIVACY_POLICY,
  type PolicyBlock,
  type PrivacyPolicy,
} from "@/lib/legal/privacy-policy";

async function currentPolicy(): Promise<{ locale: "en" | "bg"; policy: PrivacyPolicy }> {
  const locale = (await getLocale()) === "bg" ? "bg" : "en";
  return { locale, policy: PRIVACY_POLICY[locale] };
}

export async function generateMetadata(): Promise<Metadata> {
  const { policy } = await currentPolicy();
  return { title: `${policy.title} – AI-First Post Assistant`, description: policy.intro };
}

const LINKABLE = /(https:\/\/[^\s,]+|[\w.+-]+@[\w-]+\.[\w.-]+\w)/g;

/** Renders the policy's plain text with its email address and URLs clickable. */
function RichText({ text }: { text: string }) {
  return text.split(LINKABLE).map((part, index) => {
    // split() with one capture group puts every match at an odd index.
    if (index % 2 === 0) return part;
    const href = part.startsWith("https://") ? part : `mailto:${part}`;
    return (
      <a key={index} href={href} className="text-accent focus-ring break-words hover:underline">
        {part}
      </a>
    );
  });
}

function Block({ block }: { block: PolicyBlock }) {
  if (block.kind === "paragraph") {
    return (
      <p>
        <RichText text={block.text} />
      </p>
    );
  }

  if (block.kind === "list") {
    return (
      <ul className="list-disc space-y-2 pl-5">
        {block.items.map((item) => (
          <li key={item}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="rounded-control border-border overflow-x-auto border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-subtle text-fg">
          <tr>
            {block.head.map((heading) => (
              <th key={heading} scope="col" className="px-3 py-2 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row[0]} className="border-border border-t">
              {row.map((cell) => (
                <td key={cell} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Public by construction: `proxy.ts` only guards an explicit list of prefixes
 * and this route lives outside `(dashboard)`, so no session is ever required.
 */
export default async function PrivacyPolicyPage() {
  const { locale, policy } = await currentPolicy();
  const lastUpdated = new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(LAST_UPDATED));

  return (
    <div className="bg-bg relative flex-1">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 pt-16 pb-16 sm:px-6">
        <h1 className="text-fg font-serif text-3xl font-semibold tracking-tight">{policy.title}</h1>
        <p className="text-fg-muted mt-2 text-sm">
          {policy.lastUpdatedLabel}: <time dateTime={LAST_UPDATED}>{lastUpdated}</time>
        </p>
        <p className="text-fg mt-6 leading-relaxed">{policy.intro}</p>

        <nav
          aria-label={policy.contentsLabel}
          className="rounded-card border-border bg-surface mt-8 border p-5"
        >
          <h2 className="text-fg text-sm font-semibold">{policy.contentsLabel}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {policy.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-accent focus-ring hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {policy.sections.map((section) => (
          <section key={section.id} id={section.id} className="mt-10 scroll-mt-6">
            <h2 className="text-fg font-serif text-xl font-semibold">{section.title}</h2>
            <div className="text-fg-muted mt-3 space-y-4 leading-relaxed">
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </div>
          </section>
        ))}

        <p className="border-border text-fg-muted mt-12 border-t pt-6 text-sm">
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent focus-ring hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </main>
    </div>
  );
}
