import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");

  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      {children}
      <div className="absolute inset-x-0 bottom-3 z-10 text-center">
        <Link href="/privacy" className="text-fg-muted focus-ring text-sm hover:underline">
          {t("privacyPolicy")}
        </Link>
      </div>
    </div>
  );
}
