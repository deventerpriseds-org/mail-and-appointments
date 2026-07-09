import { Client } from "@microsoft/microsoft-graph-client";

function graphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

export interface Inbox {
  id: string;
  name: string;
  provider: string;
  accountId: string;
  /** Full folder path, e.g. "Inbox / LinkedIn". */
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

export async function getMicrosoftInboxes(accessToken: string): Promise<Inbox[]> {
  const client = graphClient(accessToken);
  const me = await client.api("/me").get() as { id: string };

  const folders: Inbox[] = [];

  // Recurse the full mail-folder tree so nested folders (e.g. Inbox/LinkedIn,
  // Inbox/Ladders) are individually selectable, not just the top-level folders.
  async function walk(endpoint: string, parentPath: string, depth: number): Promise<void> {
    if (depth > 10) return; // guard against pathological nesting
    const res = await client
      .api(endpoint)
      .select("id,displayName,childFolderCount")
      .top(100)
      .get() as {
      value: Array<{ id: string; displayName: string; childFolderCount: number }>;
    };
    for (const folder of res.value) {
      const path = parentPath ? `${parentPath} / ${folder.displayName}` : folder.displayName;
      folders.push({
        id: folder.id,
        name: folder.displayName,
        provider: "microsoft",
        accountId: me.id,
        path,
        depth,
      });
      if (folder.childFolderCount > 0) {
        await walk(`/me/mailFolders/${folder.id}/childFolders`, path, depth + 1);
      }
    }
  }

  await walk("/me/mailFolders", "", 0);
  return folders;
}

export async function getMicrosoftCalendars(accessToken: string): Promise<CalendarItem[]> {
  const client = graphClient(accessToken);
  const me = await client.api("/me").get() as { id: string };
  const res = await client.api("/me/calendars").select("id,name").get() as {
    value: Array<{ id: string; name: string }>;
  };
  return res.value.map((cal) => ({
    id: cal.id,
    name: cal.name,
    provider: "microsoft",
    accountId: me.id,
  }));
}

export async function getMicrosoftCalendarEvents(
  accessToken: string,
  date: string
): Promise<CalendarEvent[]> {
  const client = graphClient(accessToken);
  const startDateTime = `${date}T00:00:00Z`;
  const endDateTime = `${date}T23:59:59Z`;

  const res = await client
    .api("/me/calendarView")
    .query({ startDateTime, endDateTime })
    .select("id,subject,start,end")
    .get() as {
    value: Array<{ id: string; subject: string; start: { dateTime: string } }>;
  };

  return res.value.map((event) => ({
    id: event.id,
    description: event.subject,
    time: event.start.dateTime,
    provider: "microsoft",
  }));
}
