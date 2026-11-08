import { PKCE_COOKIE_PATH } from "./pkce";

const ENV_NAMES = ["BUFFER_CLIENT_ID", "BUFFER_CLIENT_SECRET", "BUFFER_REDIRECT_URI"] as const;

// Values are trimmed because Buffer compares them character for character: a stray
// space or trailing newline from pasting into a dashboard lands the user on its
// generic "Could not connect" page, with no callback to us and no useful error.
function readEnv(name: (typeof ENV_NAMES)[number]): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function getBufferClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = readEnv("BUFFER_CLIENT_ID");
  const clientSecret = readEnv("BUFFER_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getBufferConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const credentials = getBufferClientCredentials();
  const redirectUri = readEnv("BUFFER_REDIRECT_URI");
  if (!credentials || !redirectUri) return null;
  return { ...credentials, redirectUri };
}

function findRedirectUriProblems(redirectUri: string, requestHost: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return ["BUFFER_REDIRECT_URI is not a valid URL"];
  }

  const problems: string[] = [];
  if (parsed.protocol !== "https:") problems.push("BUFFER_REDIRECT_URI is not https");
  // The PKCE cookie is host-only, so a callback on another host can never complete.
  if (parsed.host !== requestHost) {
    problems.push(`BUFFER_REDIRECT_URI host differs from this request's host (${requestHost})`);
  }
  if (parsed.pathname !== PKCE_COOKIE_PATH) {
    problems.push(`BUFFER_REDIRECT_URI path is not ${PKCE_COOKIE_PATH}`);
  }
  return problems;
}

/**
 * Logs what is about to be sent to Buffer. A failed authorization ends on Buffer's
 * own error page and never reaches our callback, so this is the only trace of it.
 * The client secret is never logged, only whether its value is malformed.
 */
export function logBufferConnectDiagnostics(requestHost: string): void {
  const problems: string[] = [];
  for (const name of ENV_NAMES) {
    const raw = process.env[name] ?? "";
    const trimmed = raw.trim();
    if (raw !== trimmed) problems.push(`${name} has surrounding whitespace (trimmed before use)`);
    if (/\s/.test(trimmed)) problems.push(`${name} contains whitespace inside the value`);
  }

  const redirectUri = readEnv("BUFFER_REDIRECT_URI") ?? "";
  problems.push(...findRedirectUriProblems(redirectUri, requestHost));

  const diag = {
    redirectUri,
    redirectUriLength: redirectUri.length,
    clientIdLength: readEnv("BUFFER_CLIENT_ID")?.length ?? 0,
    requestHost,
    problems,
  };
  if (problems.length > 0) {
    console.warn("[buffer-connect] configuration problems", diag);
  } else {
    console.info("[buffer-connect] redirecting to Buffer", diag);
  }
}
