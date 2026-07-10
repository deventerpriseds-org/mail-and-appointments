# Mail & Appointments

Multi-provider email + calendar middleware (Microsoft 365 / Google), built for AI agents.

## Azure Infrastructure

- **Resource Group**: EnterpriseDS_ResourceGRP
- **Subscription**: 09594120-1b35-4e21-84c6-451ac27175a3
- **Tenant**: ee633423-c321-413c-a191-ace8b07e4196
- **Function App**: enterpriseds-mail-api (enterpriseds-mail-api.azurewebsites.net) — `api/`
- **Static Web App**: enterpriseds-mail-web — `web/`
- **Storage Account**: n8nstxpdthydai6fkm (shared with job-platform)
- **Storage Tables**: EmailCalendarData, AccountConfig
- **Function region**: eastus  •  **Static Web App region**: eastus2
- **Node runtime**: 22

## Deploy (GitHub Actions)

Everything runs through Actions using the org `AZURE_*` secrets. Default branch: `master`.

1. **Provision (once)** — Actions → *Azure Infrastructure Provision* → Run workflow.
   Creates the Function App + Static Web App (idempotent).
2. **Setup (once, re-runnable)** — Actions → *Azure Infrastructure Setup* → Run workflow.
   Creates the storage tables and sets Function App app settings.
3. **Deploy** — pushes to `master` under `api/**` or `web/**` auto-deploy via
   `api-deploy.yml` / `web-deploy.yml` (also runnable via workflow_dispatch).

## Required GitHub Secrets

Reused from existing org secrets:
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — deploy service principal (`enterpriseds-github-actions`), used only for Azure deployment
- `AZURE_STORAGE_CONNECTION_STRING`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth client (API runtime + web build)

App-specific secret (optional fallback):
- `MAIL_MS_CLIENT_ID` — Application (client) ID of the **dedicated Entra SPA app** for the Microsoft web sign-in (see below). Public client, **no secret**. Normally you don't set this: `web-deploy.yml` resolves the client ID from the Entra app by name at build time. It's only used as a fallback when that lookup returns nothing.

Secret → setting mapping:
- Web build: `VITE_MS_CLIENT_ID` ← resolved from the `enterpriseds-mail-web` Entra app at deploy time (fallback: `MAIL_MS_CLIENT_ID` secret), `VITE_GOOGLE_CLIENT_ID` ← `GOOGLE_CLIENT_ID`
- API runtime: `AZURE_STORAGE_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Microsoft web sign-in — dedicated Entra app

The Connect (Microsoft) flow is **client-side only** (MSAL browser + PKCE); the API
never performs a server-side Microsoft token exchange, so the app needs **no client
secret**. It uses its own app registration, kept separate from the deploy service
principal. One-time portal setup:

1. Entra ID → App registrations → **New registration**. Name e.g. `enterpriseds-mail-web`.
   Supported account types: **single tenant** (this org only).
2. **Authentication** → Add a platform → **Single-page application** → redirect URI:
   `https://<static-web-app-host>` (currently `https://victorious-field-096ac470f.7.azurestaticapps.net`).
3. Copy the **Application (client) ID** → set it as the `MAIL_MS_CLIENT_ID` secret.
4. Graph delegated scopes (`User.Read`, `Mail.Read`, `Calendars.Read`) are consented
   at first sign-in; optionally pre-add them under **API permissions**.

`msalConfig.ts` pins the authority to the EnterpriseDS tenant (single-tenant). To allow
external/personal accounts, flip the app to multi-tenant and set `VITE_MS_AUTHORITY`
(e.g. `https://login.microsoftonline.com/organizations`) in `web-deploy.yml`.

#### Provisioning the Entra app programmatically

The `azure-entra-app.yml` workflow (Actions → *Provision Entra App (web sign-in)*)
creates/updates the app registration and sets its SPA redirect URI, then prints the
Client ID to the run summary. It requires the deploy service principal
(`AZURE_CLIENT_ID`) to hold Microsoft Graph **`Application.ReadWrite.All`** with
admin consent — a one-time grant by a Global/Privileged Role Administrator:

```bash
SP_APP_ID=<enterpriseds-github-actions app id>
GRAPH=00000003-0000-0000-c000-000000000000
ROLE=1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9   # Application.ReadWrite.All
az ad app permission add --id "$SP_APP_ID" --api "$GRAPH" --api-permissions "${ROLE}=Role"
az ad app permission admin-consent --id "$SP_APP_ID"
```

`Application.ReadWrite.All` lets the SP create, read, and manage **any** app
registration in the tenant (it also makes the `azure-confirm-id.yml` diagnostic's
`az ad app show` work). Note the blast radius: a CI identity with this permission can
write credentials into other apps, so guard the `AZURE_CLIENT_SECRET` accordingly. To
scope it down to only apps the SP creates, swap in `Application.ReadWrite.OwnedBy`
(role id `18a4783c-866b-4cc7-a460-3d0e455a5c31`) instead.

## Local Dev

```bash
cd api && npm install && cp local.settings.json.example local.settings.json && npm start   # :7071
cd web && npm install && npm run dev                                                        # :5173
```

## Live resources (quick reference)

- Web (Static Web App): https://victorious-field-096ac470f.7.azurestaticapps.net
- API (Function App):   https://enterpriseds-mail-api.azurewebsites.net
- Microsoft web sign-in Entra app: `enterpriseds-mail-web`, client ID `446a1524-708a-4aae-a172-20b0f5eeda1c` (single tenant), SPA redirect URI = the Static Web App URL above.

## Lessons learned / gotchas

Hard-won during initial setup — read before repeating this pattern:

- **This repo lives in the `deventerpriseds-org` GitHub org** (same org as
  `boost-application-packet-platform`/job-platform), because that's where the
  `AZURE_*` / `GOOGLE_*` Actions secrets are defined. GitHub org secrets are **not**
  shared across orgs, and org secrets scoped to "Selected repositories" only reach
  repos on their access list. Symptom of a missing/unshared secret: `azure/login`
  fails with `Not all parameters are provided in 'creds'` (the values arrive empty).
- **`az ad app create` fails when the caller is a service principal** with
  `Resource '...' does not exist or one of its queried reference-property objects
  are not present` — it tries to auto-add the signed-in *user* as owner and there is
  none. Create app registrations with a direct Graph `POST /applications` instead
  (see `azure-entra-app.yml`).
- **`graph.microsoft.com` is NOT reachable from Claude Code web/CCR containers** (the
  egress proxy blocks it); `management.azure.com` and `login.microsoftonline.com`
  are. So Microsoft Graph / Entra admin actions — notably the SP permission grant and
  admin consent — must be run from a normal machine (`az login` as an admin) or the
  portal, never from a web session. Azure Resource Manager work (Function App, Static
  Web App, storage) is fine either place, and already runs in Actions.
- **Static Web Apps exist only in a few regions** (using `eastus2`); **Function App
  names are globally unique** across Azure (hence the `enterpriseds-` prefix).
- **The web `build` runs `tsc` before `vite build`.** `import.meta.env` needs the
  Vite client types (`web/src/vite-env.d.ts` → `/// <reference types="vite/client" />`)
  or `tsc` fails. This does **not** show up under `npm run dev` (dev skips `tsc`).
- **Microsoft sign-in is client-side only** (MSAL browser + PKCE); the API performs no
  server-side Microsoft token exchange, so the web Entra app needs **no client secret**.
  Only Google requires a server secret (`GOOGLE_CLIENT_SECRET`).
- **Web and API are separate origins in prod.** The frontend calls the API by absolute
  URL (`VITE_API_BASE_URL` → `https://enterpriseds-mail-api.azurewebsites.net`), set in
  `web-deploy.yml`; relative `/api/*` only works in dev via the Vite proxy. The Function
  App allows the Static Web App origin via CORS (set in `azure-setup.yml`).
- **Google sign-in funnels through the dedicated broker** `enterpriseds-auth-broker`
  (its own repo + Static Web App; **do not delete**). `VITE_GOOGLE_REDIRECT_URI` (set in
  `web-deploy.yml`) points at the broker, registered in the Google client once; the broker
  forwards the auth code back to the app, which exchanges it. New apps need no per-app
  Google console change.
- **Deploy Web auto-resolves the MS client ID** from the `enterpriseds-mail-web` Entra
  app by name at build time (needs the SP's Graph permission); `MAIL_MS_CLIENT_ID` is
  only a fallback. Run *Provision Entra App* once, then *Deploy Web* picks it up.
