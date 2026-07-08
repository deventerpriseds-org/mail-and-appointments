import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MS_CLIENT_ID ?? "",
    // Dedicated single-tenant Entra app for the web sign-in. Authority is
    // pinned to the EnterpriseDS tenant; switch to `/organizations` or
    // `/common` (and flip the app to multi-tenant) only if external or
    // personal Microsoft accounts need to sign in.
    authority:
      import.meta.env.VITE_MS_AUTHORITY ??
      "https://login.microsoftonline.com/ee633423-c321-413c-a191-ace8b07e4196",
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
      },
    },
  },
};

export const msScopes = [
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
];
