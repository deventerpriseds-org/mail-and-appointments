// Shared Google redirect URI. Registered ONCE in the Google OAuth client; every
// app funnels its Google sign-in through this single canonical origin, which then
// hands the auth code back to the originating app. New apps set
// VITE_GOOGLE_REDIRECT_URI to this same value and need NO per-app Google console
// change. Default points at the dedicated central broker (enterpriseds-auth-broker).
export const googleRedirectUri =
  import.meta.env.VITE_GOOGLE_REDIRECT_URI ??
  "https://proud-hill-09accd00f.7.azurestaticapps.net";

export const googleConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  scopes: [
    // Identity scopes — required so the API's userinfo.get() can read the
    // account's email/name. Without these the token exchange succeeds but
    // userinfo fails with "missing required authentication credential".
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
  ].join(" "),
};

export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: googleConfig.scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
