import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";

const EXPIRY_HOURS = 24;

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 10_000;

type Sender = { email: string; name?: string };

// EMAIL_FROM accepts either "addr@example.com" or "Display Name <addr@example.com>".
function getSender(): Sender {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error("EMAIL_FROM environment variable is required.");
  }

  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { email: from };

  const name = match[1].replace(/^"|"$/g, "").trim();
  return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
}

async function sendViaBrevo(params: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("BREVO_API_KEY environment variable is required.");
  }

  const res = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: getSender(),
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${detail}`);
  }
}

function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function buildEmailHtml(verifyUrl: string, lang: string): string {
  const isBg = lang === "bg";
  const subject = isBg ? "Потвърди имейл адреса си" : "Verify your email address";
  const greeting = isBg ? "Здравей," : "Hello,";
  const body = isBg
    ? "Благодарим ти за регистрацията. Натисни бутона по-долу, за да потвърдиш имейл адреса си и активираш акаунта."
    : "Thank you for registering. Click the button below to verify your email address and activate your account.";
  const cta = isBg ? "Потвърди имейл" : "Verify email";
  const expiry = isBg ? "Връзката е валидна 24 часа." : "This link expires in 24 hours.";
  const ignore = isBg
    ? "Ако не си се регистрирал(а), игнорирай този имейл."
    : "If you did not register, you can safely ignore this email.";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:0 24px;color:#111">
  <p>${greeting}</p>
  <p>${body}</p>
  <p style="margin:32px 0">
    <a href="${verifyUrl}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">${cta}</a>
  </p>
  <p style="font-size:13px;color:#666">${expiry}</p>
  <p style="font-size:13px;color:#666">${ignore}</p>
</body>
</html>`;
}

export async function sendVerificationEmail(
  userId: string,
  email: string,
  lang: string
): Promise<void> {
  // Delete any existing tokens for this user before creating a new one
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  const verifyUrl = `${getBaseUrl()}/api/v1/auth/verify-email?token=${rawToken}`;
  const isBg = lang === "bg";
  const subject = isBg ? "Потвърди имейл адреса си" : "Verify your email address";

  await sendViaBrevo({
    to: email,
    subject,
    html: buildEmailHtml(verifyUrl, lang),
  });
}
