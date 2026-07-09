import { google } from "googleapis";

function oAuth2Client(accessToken: string) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return client;
}

export interface Inbox {
  id: string;
  name: string;
  provider: string;
  accountId: string;
  /** Full label path, e.g. "Jobs / LinkedIn". */
  path?: string;
  /** Nesting depth (0 = top level) for indenting the picker. */
  depth?: number;
}

export interface CalendarItem {
  id: string;
  name: string;
  provider: string;
  accountId: string;
}

export interface CalendarEvent {
  id: string;
  description: string;
  time: string;
  provider: string;
}

export async function getGoogleInboxes(accessToken: string): Promise<Inbox[]> {
  const auth = oAuth2Client(accessToken);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const accountId = profile.data.emailAddress ?? "unknown";

  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];

  return labels
    .filter((l) => l.type === "system" || l.type === "user")
    .map((l) => {
      // Gmail nests user labels with "/" (e.g. "Jobs/LinkedIn"); surface that
      // as a path + depth so nested labels are selectable like Outlook folders.
      const full = l.name ?? "";
      const parts = full.split("/");
      return {
        id: l.id ?? "",
        name: parts[parts.length - 1] || full,
        provider: "google",
        accountId,
        path: parts.join(" / "),
        depth: parts.length - 1,
      };
    });
}

export async function getGoogleCalendars(accessToken: string): Promise<CalendarItem[]> {
  const auth = oAuth2Client(accessToken);
  const calendar = google.calendar({ version: "v3", auth });
  const profile = await google.oauth2({ version: "v2", auth }).userinfo.get();
  const accountId = profile.data.email ?? "unknown";

  const res = await calendar.calendarList.list();
  const items = res.data.items ?? [];

  return items.map((cal) => ({
    id: cal.id ?? "",
    name: cal.summary ?? "",
    provider: "google",
    accountId,
  }));
}

export async function getGoogleCalendarEvents(
  accessToken: string,
  date: string
): Promise<CalendarEvent[]> {
  const auth = oAuth2Client(accessToken);
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = res.data.items ?? [];
  return items.map((event) => ({
    id: event.id ?? "",
    description: event.summary ?? "(No title)",
    time: event.start?.dateTime ?? event.start?.date ?? "",
    provider: "google",
  }));
}
