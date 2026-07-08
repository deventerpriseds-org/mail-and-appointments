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
(`AZURE_CLIENT_ID`) to hold Microsoft Graph **`Application.ReadWrite.OwnedBy`** with
admin consent — a one-time grant by a Global/Privileged Role Administrator:

```bash
SP_APP_ID=<enterpriseds-github-actions app id>
GRAPH=00000003-0000-0000-c000-000000000000
ROLE=18a4783c-866b-4cc7-a460-3d0e455a5c31   # Application.ReadWrite.OwnedBy
az ad app permission add --id "$SP_APP_ID" --api "$GRAPH" --api-permissions "${ROLE}=Role"
az ad app permission admin-consent --id "$SP_APP_ID"
```

`OwnedBy` lets the SP create and manage only the app registrations it owns (low blast
radius). It does not permit self-granting admin consent for an app's API permissions,
which is fine here — the Graph sign-in scopes consent at first user sign-in.

## Local Dev

```bash
cd api && npm install && cp local.settings.json.example local.settings.json && npm start   # :7071
cd web && npm install && npm run dev                                                        # :5173
```
