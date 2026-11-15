import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { emit } from "@tauri-apps/api/event";
import { supabase } from "./supabase";

export const AUTH_REDIRECT = "myai://auth/callback";

/** Opens Google sign-in in the user's default browser (Google blocks OAuth inside embedded webviews). */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  await openUrl(data.url);
}

async function handleUrls(urls: string[]) {
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const code = url.searchParams.get("code");
    if (!code) continue;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("OAuth exchange failed", error);
    else await emit("auth-changed");
  }
}

/** Main window only: receives myai://auth/callback?code=... via deep link. */
export function listenAuthCallback() {
  return onOpenUrl(handleUrls);
}

/** Email sign-in with a 6-digit code (no magic-link round trip needed on desktop). */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  await emit("auth-changed");
}

export async function signOut() {
  await supabase.auth.signOut();
  await emit("auth-changed");
}
