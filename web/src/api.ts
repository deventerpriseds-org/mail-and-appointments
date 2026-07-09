// Base URL for the middleware API.
// - Production: VITE_API_BASE_URL is set to the Function App URL at build time
//   (the web is served from the Static Web App, a different origin than the API).
// - Local dev: falls back to "/api", which the Vite dev server proxies to :7071.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
