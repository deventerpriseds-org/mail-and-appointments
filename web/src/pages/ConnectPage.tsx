import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msScopes } from "../auth/msalConfig";
import { buildGoogleAuthUrl, googleRedirectUri } from "../auth/googleConfig";
import { useAccounts, ConnectedAccount } from "../auth/AccountContext";
import { apiUrl } from "../api";

export default function ConnectPage() {
  const navigate = useNavigate();
  const { instance: msalInstance } = useMsal();
  const { accounts, addAccount, removeAccount } = useAccounts();

  // Handle Google OAuth redirect callback (shared-broker flow).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const stateRaw = params.get("state");
    if (!code || !stateRaw) return;

    let state: { p?: string };
    try {
      state = JSON.parse(atob(stateRaw.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return;
    }
    if (state.p !== "google") return;

    // The central broker (enterpriseds-auth-broker) already forwarded the code
    // back to this app; just exchange it via our own API.
    window.history.replaceState({}, "", window.location.pathname);
    exchangeGoogleCode(code);
  }, []);

  async function exchangeGoogleCode(code: string) {
    try {
      const res = await fetch(apiUrl("/auth/google/token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Must match the redirect_uri used in the auth request (the shared canonical URI).
        body: JSON.stringify({ code, redirectUri: googleRedirectUri }),
      });
      if (!res.ok) throw new Error("Token exchange failed");
      const data = await res.json() as {
        accessToken: string;
        accountId: string;
        displayName: string;
        email: string;
      };
      addAccount({
        provider: "google",
        accountId: data.accountId,
        displayName: data.displayName,
        email: data.email,
        accessToken: data.accessToken,
      });
    } catch (err) {
      console.error("Google token exchange error:", err);
    }
  }

  async function handleMicrosoftConnect() {
    try {
      const result = await msalInstance.loginPopup({ scopes: msScopes });
      const account = result.account;

      let accessToken = result.accessToken;
      try {
        const tokenResult = await msalInstance.acquireTokenSilent({
          scopes: msScopes,
          account,
        });
        accessToken = tokenResult.accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) {
          const tokenResult = await msalInstance.acquireTokenPopup({ scopes: msScopes });
          accessToken = tokenResult.accessToken;
        }
      }

      const connected: ConnectedAccount = {
        provider: "microsoft",
        accountId: account.homeAccountId,
        displayName: account.name ?? account.username,
        email: account.username,
        accessToken,
      };
      addAccount(connected);
    } catch (err) {
      console.error("Microsoft login error:", err);
    }
  }

  function handleGoogleConnect() {
    // Encode the originating app's origin in state so the canonical broker can
    // hand the code back here. base64url so it survives the query string.
    const state = btoa(JSON.stringify({ p: "google", o: window.location.origin }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    window.location.href = buildGoogleAuthUrl(googleRedirectUri, state);
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Mail & Appointments</h1>
      <p style={styles.subtitle}>Connect your accounts to get started.</p>

      <div style={styles.buttonGroup}>
        <button onClick={handleMicrosoftConnect} style={styles.btn}>
          Connect Microsoft 365
        </button>
        <button onClick={handleGoogleConnect} style={{ ...styles.btn, background: "#c23b22" }}>
          Connect Google Account
        </button>
      </div>

      {accounts.length > 0 && (
        <div style={styles.accountList}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>Connected Accounts</h2>
          {accounts.map((a) => (
            <div key={a.accountId} style={styles.accountRow}>
              <span>
                <strong>{a.provider === "microsoft" ? "Microsoft" : "Google"}</strong>{" "}
                — {a.email}
              </span>
              <button onClick={() => removeAccount(a.accountId)} style={styles.removeBtn}>
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={() => navigate("/select")}
            style={{ ...styles.btn, marginTop: 16 }}
          >
            Choose Inboxes & Calendars →
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 480, margin: "80px auto", fontFamily: "sans-serif", padding: "0 16px" },
  title: { margin: "0 0 8px" },
  subtitle: { color: "#666", marginBottom: 32 },
  buttonGroup: { display: "flex", flexDirection: "column", gap: 12 },
  btn: {
    padding: "12px 24px",
    fontSize: 16,
    background: "#0066cc",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  accountList: { marginTop: 32, borderTop: "1px solid #ddd", paddingTop: 16 },
  accountRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #f0f0f0",
  },
  removeBtn: {
    background: "none",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    padding: "4px 10px",
    color: "#c00",
  },
};
