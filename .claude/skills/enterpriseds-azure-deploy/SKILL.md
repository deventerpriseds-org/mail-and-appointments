---
name: enterpriseds-azure-deploy
description: >-
  EnterpriseDS pattern + shared infrastructure for shipping a web app to Azure —
  TypeScript API on an Azure Functions app, React/Vite web on an Azure Static Web
  App, deployed by GitHub Actions, with client-side Microsoft (MSAL) and Google
  sign-in. Use whenever creating, provisioning, deploying, REUSING, or debugging
  an EnterpriseDS Azure app. It records what shared infra ALREADY EXISTS (org
  secrets, storage, the deploy service principal and its Microsoft Graph grant,
  the Google OAuth client) so agents reuse it instead of rebuilding, and so they
  do not raise blockers that the workflow kit already solves.
---

# EnterpriseDS — Azure app deployment pattern

TypeScript API on an **Azure Functions app** + React/Vite web on an **Azure
Static Web App**, both deployed by **GitHub Actions**. Canonical, working
reference: **`deventerpriseds-org/mail-and-appointments`** — copy from it.

## RULE 0 — Reuse, do not rebuild

For a new app you **copy the deploy kit and reuse the shared infrastructure**.
You do NOT re-author workflows from scratch, and you do NOT re-provision shared
resources. Concretely:

- **Copy** the six workflows in `.github/workflows/` from the reference repo and
  change only the `env:` resource names.
- **Copy** the web auth/config pattern: `web/src/auth/msalConfig.ts`,
  `web/src/auth/googleConfig.ts`, `web/src/api.ts`.
- **Reuse** everything under "Already provisioned" below — it exists tenant-wide.

## Already provisioned — shared, NEVER recreate

- **GitHub org `deventerpriseds-org`** holds the Actions org secrets: `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `AZURE_STORAGE_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
  Put new apps in this org (or grant the repo access to these secrets).
- **Resource Group** `EnterpriseDS_ResourceGRP` · **Subscription**
  `09594120-1b35-4e21-84c6-451ac27175a3` · **Tenant** `ee633423-c321-413c-a191-ace8b07e4196`.
- **Storage account** `n8nstxpdthydai6fkm` — reuse it; just add per-app tables.
- **Deploy service principal** `enterpriseds-github-actions` (= `AZURE_CLIENT_ID`)
  **already holds Microsoft Graph `Application.ReadWrite.All` with admin consent.**
  → `azure-entra-app.yml` creates/manages Entra apps out of the box. Do NOT ask for
  another grant, and do NOT send the user to the portal to register redirect URIs.
- **Google OAuth client** (`GOOGLE_CLIENT_ID`) is shared across apps.
- **Regions:** Functions `eastus`; Static Web Apps `eastus2`. **Node** 22.
  **Naming:** `enterpriseds-<app>-api` / `enterpriseds-<app>-web` (Function App names
  are globally unique).

## Per new app — the checklist

1. Repo in `deventerpriseds-org` (or grant it access to the org secrets).
2. Copy the six workflows; set `FUNCTION_APP`, `STATIC_WEB_APP`, and `MS_APP_NAME`
   to **this app's** names (e.g. `enterpriseds-acme-api`, `enterpriseds-acme-web`).
   Copy the web auth/config files.
3. Run **Azure Infrastructure Provision** → **Azure Infrastructure Setup**.
4. Push under `api/**` / `web/**` to deploy.
5. Microsoft sign-in: run **Provision Entra App** — it creates **this app's own**
   Entra registration and **sets its SPA redirect URI automatically**. Then run/redeploy
   **Deploy Web** (it resolves the client ID by name). No portal step.
6. Google sign-in: add the new SWA origin to the shared Google OAuth client
   (the only manual step — see below).

## The workflow kit (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `azure-provision.yml` | manual | Create Function App + Static Web App (idempotent) |
| `azure-setup.yml` | manual | Storage tables, Function App settings, **CORS allow the SWA origin** |
| `api-deploy.yml` | push `master` (`api/**`) | Build + zip-deploy the API |
| `web-deploy.yml` | push `master` (`web/**`) | Build + deploy web; auto-resolves the MS client ID |
| `azure-entra-app.yml` | manual | Create **this app's** Entra sign-in app + set its SPA redirect URI |
| `azure-confirm-id.yml` | manual | Diagnostic: SP / app-registration metadata |

## Microsoft sign-in — automated, one Entra app per app

Client-side only (MSAL browser + PKCE); the API does no server-side MS exchange, so
the Entra app is a **public SPA client, no secret**.

- **Each app gets its OWN Entra app.** Set `azure-entra-app.yml`'s `APP_NAME` to
  `enterpriseds-<app>-web`. **Never** point a new app at another app's registration
  (e.g. `enterpriseds-mail-web`) — the redirect-URI PATCH would overwrite it.
- `azure-entra-app.yml` creates the app via a Graph `POST` (not `az ad app create`,
  which fails under SP auth) and sets `spa.redirectUris` to the SWA URL. Because the
  deploy SP already has `Application.ReadWrite.All`, this needs **no grant and no
  manual portal step**. `web-deploy.yml` bakes the resolved client ID into the build.
- `msalConfig.ts` pins the authority to the tenant (single-tenant). For external/
  personal accounts, make the app multi-tenant and set `VITE_MS_AUTHORITY`.

## The ONLY genuine manual step — Google authorized origins

The Azure workflows can't configure the Google OAuth client. For each new app, in the
Google Cloud console add the app's Static Web App origin
(`https://<swa-host>`) to the shared client's **Authorized JavaScript origins** and
**Authorized redirect URIs**. Nothing on the Microsoft side needs this — only Google.

## Secrets → settings

- Web build: `VITE_MS_CLIENT_ID` ← resolved from this app's Entra app at deploy time
  (fallback secret `MAIL_MS_CLIENT_ID`); `VITE_GOOGLE_CLIENT_ID` ← `GOOGLE_CLIENT_ID`;
  `VITE_API_BASE_URL` ← the Function App URL.
- API runtime: `AZURE_STORAGE_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Do NOT (these cause the failures we've seen)

- **Do NOT rebuild** the workflows or auth wiring from scratch — copy them and rename.
- **Do NOT re-provision shared infra** (org secrets, storage account, deploy SP,
  Google client) — it already exists.
- **Do NOT tell the user to add the Microsoft SPA redirect URI in the portal.**
  `azure-entra-app.yml` sets it; the SP's Graph grant is already in place. Portal is
  only a fallback if that workflow fails with "Insufficient privileges" (grant revoked).
- **Do NOT reuse another app's Entra app** for a new app — one Entra app per app.
- The Google authorized-origins step is the **only** manual action; don't imply the
  Microsoft side is also manual.

## Gotchas (hard-won)

- **Org secrets are scoped.** Not shared across orgs; "Selected repositories" scoping
  means the repo must be on the access list, or `azure/login` gets empty creds
  (`Not all parameters are provided in 'creds'`).
- **`az ad app create` fails under service-principal auth** — create app registrations
  with a Graph `POST /applications` (spa redirect URI inline), as `azure-entra-app.yml` does.
- **`graph.microsoft.com` is blocked from Claude Code web/CCR containers.** This only
  affects the one-time SP grant (already done) — it does NOT block per-app Entra
  provisioning, which runs in **GitHub Actions** where Graph is reachable.
  `management.azure.com` + `login.microsoftonline.com` are reachable.
- **Static Web Apps: few regions** (`eastus2`); **Function App names are globally unique**.
- **The web `build` runs `tsc` before `vite build`** — needs `web/src/vite-env.d.ts`
  (`/// <reference types="vite/client" />`) or `import.meta.env` fails `tsc`. Hidden under `npm run dev`.
- **Web and API are separate origins in prod** — the frontend calls the API by absolute
  URL (`VITE_API_BASE_URL`); the Function App allows the SWA origin via CORS
  (`azure-setup.yml`). Relative `/api/*` only works in local dev via the Vite proxy.
- **Deploy from GitHub Actions, not the CCR container** — the container has no Azure creds.
