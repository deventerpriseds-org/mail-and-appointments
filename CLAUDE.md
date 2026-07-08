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

All reused from existing org secrets — nothing new to add:
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `AZURE_STORAGE_CONNECTION_STRING`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth client (API runtime + web build)

Secret → setting mapping:
- Web build: `VITE_MS_CLIENT_ID` ← `AZURE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` ← `GOOGLE_CLIENT_ID`
- API runtime: `AZURE_STORAGE_CONNECTION_STRING`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

The Microsoft web sign-in reuses the Entra app behind `AZURE_CLIENT_ID`; that app
registration needs the Static Web App URL added as a redirect URI and delegated
Mail/Calendar scopes for the Connect flow to complete.

## Local Dev

```bash
cd api && npm install && cp local.settings.json.example local.settings.json && npm start   # :7071
cd web && npm install && npm run dev                                                        # :5173
```
