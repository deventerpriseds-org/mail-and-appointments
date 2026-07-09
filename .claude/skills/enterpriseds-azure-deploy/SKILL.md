---
name: enterpriseds-azure-deploy
description: >-
  EnterpriseDS pattern for deploying a web app to Azure — API on an Azure
  Functions app, web on an Azure Static Web App, provisioned and deployed via
  GitHub Actions, with client-side Microsoft (MSAL) and Google sign-in. Use
  whenever creating, provisioning, deploying, or debugging an EnterpriseDS app
  on Azure Functions + Static Web Apps; setting up the GitHub Actions deploy
  workflows; wiring the AZURE_* / GOOGLE_* org secrets; or configuring a
  Microsoft Entra sign-in app. Covers resource naming, the workflow kit, the
  secrets model, the Entra-app automation, and the setup gotchas so they are
  not rediscovered.
---

# EnterpriseDS — Azure app deployment pattern

The house style for shipping an app: a TypeScript API on an **Azure Functions
app**, a React/Vite frontend on an **Azure Static Web App**, both driven by
**GitHub Actions** using shared org secrets. Reference implementation:
`deventerpriseds-org/mail-and-appointments` (and `boost-application-packet-platform`).

## Fixed infrastructure facts (shared across apps)

- **GitHub org:** `deventerpriseds-org` — this is where the `AZURE_*` / `GOOGLE_*`
  Actions org secrets live. Put new Azure apps here (or grant the repo access to
  those org secrets), otherwise `azure/login` gets empty creds.
- **Resource Group:** `EnterpriseDS_ResourceGRP`
- **Subscription:** `09594120-1b35-4e21-84c6-451ac27175a3`
- **Tenant:** `ee633423-c321-413c-a191-ace8b07e4196`
- **Shared Storage Account:** `n8nstxpdthydai6fkm` (add per-app tables; reuse it)
- **Regions:** Functions `eastus`; Static Web Apps `eastus2` (SWA is region-limited)
- **Node runtime:** 22
- **Naming:** prefix resources with `enterpriseds-` (Function App names are
  globally unique across Azure; the prefix avoids collisions).

## The workflow kit (`.github/workflows/`)

Mirror these from the reference repo, changing the `env:` names per app:

| Workflow | Trigger | Purpose |
|---|---|---|
| `azure-provision.yml` | manual | Create Function App + Static Web App (idempotent) |
| `azure-setup.yml` | manual | Create storage tables + set Function App app settings |
| `api-deploy.yml` | push `master` (`api/**`) | Build + zip-deploy the API |
| `web-deploy.yml` | push `master` (`web/**`) | Build + deploy the web app; auto-resolves the MS client ID |
| `azure-entra-app.yml` | manual | Create/manage the Microsoft sign-in Entra app + SPA redirect URI |
| `azure-confirm-id.yml` | manual | Diagnostic: report the SP / app-registration metadata |

All log in with:
`creds: '{"clientId":"${{ secrets.AZURE_CLIENT_ID }}","clientSecret":"${{ secrets.AZURE_CLIENT_SECRET }}","subscriptionId":"${{ secrets.AZURE_SUBSCRIPTION_ID }}","tenantId":"${{ secrets.AZURE_TENANT_ID }}"}'`

## Secrets model (all reused org secrets — nothing new to create)

- Deploy SP: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`,
  `AZURE_SUBSCRIPTION_ID` (SP is `enterpriseds-github-actions`).
- `AZURE_STORAGE_CONNECTION_STRING`; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Web build injects `VITE_MS_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` at build time.
  `VITE_GOOGLE_CLIENT_ID ← GOOGLE_CLIENT_ID`. `VITE_MS_CLIENT_ID` is resolved from
  the dedicated Entra app by name (see below); `MAIL_MS_CLIENT_ID` is only a fallback.

## Microsoft sign-in = its own Entra app (not the deploy SP)

The Connect (Microsoft) flow is **client-side only** (MSAL browser + PKCE); the API
does **no** server-side Microsoft token exchange, so the web app needs **no client
secret**. Keep it separate from the deploy service principal.

- `azure-entra-app.yml` creates a single-tenant public SPA app and sets its SPA
  redirect URI to the Static Web App URL, then prints the client ID. `web-deploy.yml`
  looks that client ID up by app name and bakes it into the build — no manual secret.
- Prereq: the deploy SP must hold Microsoft Graph **`Application.ReadWrite.All`**
  (admin-consented). One-time grant by a Global/Privileged Role Admin:
  ```bash
  SP_APP_ID=$(az ad sp list --display-name enterpriseds-github-actions --query "[0].appId" -o tsv)
  az ad app permission add --id "$SP_APP_ID" --api 00000003-0000-0000-c000-000000000000 \
    --api-permissions 1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9=Role   # Application.ReadWrite.All
  az ad app permission admin-consent --id "$SP_APP_ID"
  ```
  Tighter alternative: `Application.ReadWrite.OwnedBy` (role `18a4783c-866b-4cc7-a460-3d0e455a5c31`).

## Standing up a NEW app

1. Create the repo in `deventerpriseds-org` (or grant it access to the org secrets).
2. Copy the six workflows; set the `FUNCTION_APP` / `STATIC_WEB_APP` env names.
3. Run **Azure Infrastructure Provision** → **Azure Infrastructure Setup**.
4. Push under `api/**` / `web/**` to auto-deploy.
5. For Microsoft sign-in: ensure the SP grant above exists, run **Provision Entra
   App**, then **Deploy Web**. Pin `msalConfig.ts` authority to the tenant for a
   single-tenant app; use `/organizations` (+ multi-tenant app) only for external users.

## Gotchas (hard-won — do not rediscover)

- **Org secrets are scoped.** GitHub org secrets are not shared across orgs, and
  "Selected repositories" scoping means a repo must be on the access list. Symptom of
  a missing/unshared secret: `azure/login` → `Not all parameters are provided in 'creds'`.
- **`az ad app create` fails under service-principal auth** (`Resource '...' does not
  exist or one of its queried reference-property objects are not present`) — it tries
  to auto-add the signed-in *user* as owner and there is none. Create app registrations
  with a direct Graph `POST /applications` instead (with the `spa` redirect URI inline).
- **`graph.microsoft.com` is NOT reachable from Claude Code web/CCR containers** (the
  egress proxy blocks it); `management.azure.com` and `login.microsoftonline.com` are.
  So Microsoft Graph / Entra admin actions (the SP grant, admin consent) must run from a
  normal machine (`az login` as admin) or the portal — never a web session. ARM work
  (Function App, Static Web App, storage) is fine anywhere and already runs in Actions.
- **Static Web Apps exist only in a few regions** (use `eastus2`); **Function App
  names are globally unique** across Azure.
- **The web `build` runs `tsc` before `vite build`.** `import.meta.env` needs the Vite
  client types — add `web/src/vite-env.d.ts` with `/// <reference types="vite/client" />`
  or `tsc` fails. Does not show up under `npm run dev` (dev skips `tsc`).
- **Web and API are separate origins in production.** The Static Web App host is not
  the Function App host, and the default SWA tier has no linked backend — so relative
  `/api/*` calls 404 (they hit the SWA, not the API). The frontend must call the API by
  **absolute URL** via `VITE_API_BASE_URL` (`https://<function-app>.azurewebsites.net`),
  and the Function App must allow the SWA origin via CORS
  (`az functionapp cors add --allowed-origins https://<swa-host>`). Local `npm run dev`
  hides this because the Vite proxy rewrites `/api` → `:7071`.
- **Deploy from GitHub Actions, not the CCR container** — the container has no Azure
  creds; the sanctioned path is the Actions workflows (triggerable via the GitHub API).
