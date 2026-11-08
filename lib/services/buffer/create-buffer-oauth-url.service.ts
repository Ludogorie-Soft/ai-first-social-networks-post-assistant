import { getBufferAuthUrl } from "@/lib/integrations/buffer/client";
import { getBufferConfig } from "@/lib/integrations/buffer/config";
import { createPkcePair } from "@/lib/integrations/buffer/pkce";
import { createOAuthState } from "@/lib/integrations/buffer/state";
import { checkBufferAccess } from "./_access";

export type CreateBufferOAuthUrlResult =
  | { success: true; url: string; codeVerifier: string }
  | { success: false; code: "NOT_FOUND" | "FORBIDDEN" | "MISSING_CONFIG" };

export async function createBufferOAuthUrl(
  slug: string,
  userId: string,
  isGlobalAdmin: boolean
): Promise<CreateBufferOAuthUrlResult> {
  const config = getBufferConfig();
  if (!config) return { success: false, code: "MISSING_CONFIG" };

  const access = await checkBufferAccess(slug, userId, isGlobalAdmin);
  if (!access.ok) return { success: false, code: access.error };

  const state = createOAuthState(slug, userId);
  const pkce = createPkcePair();
  const url = getBufferAuthUrl(config.clientId, config.redirectUri, state, pkce.challenge);
  return { success: true, url, codeVerifier: pkce.verifier };
}
