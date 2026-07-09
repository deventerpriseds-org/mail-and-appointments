import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts } from "../auth/AccountContext";
import { apiUrl } from "../api";

interface CalendarEvent {
  id: string;
  description: string;
  time: string;
  provider: string;
}

interface MailMessage {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  folder: string;
  provider: string;
  webLink?: string;
  isRead?: boolean;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [mailLoading, setMailLoading] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) {
      navigate("/");
      return;
    }
    fetchEvents();
  }, [date, accounts]);

  useEffect(() => {
    if (accounts.length > 0) fetchMessages();
  }, [accounts]);

  async function fetchMessages() {
    setMailLoading(true);
    const all: MailMessage[] = [];
    for (const account of accounts) {
      try {
        const res = await fetch(apiUrl("/messages"), {
          headers: {
            Authorization: `Bearer ${account.provider}:${account.accountId}:${account.accessToken}`,
          },
        });
        if (res.ok) {
          const data = (await res.json()) as MailMessage[];
          all.push(...data);
        }
      } catch {
        /* ignore per-account failures */
      }
    }
    all.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    setMessages(all);
    setMailLoading(false);
  }

  async function fetchEvents() {
    setLoading(true);
    setError(null);
    const allEvents: CalendarEvent[] = [];

    for (const account of accounts) {
      try {
        const res = await fetch(apiUrl(`/calendar?date=${date}`), {
          headers: {
            Authorization: `Bearer ${account.provider}:${account.accountId}:${account.accessToken}`,
          },
        });
        if (!res.ok) throw new Error(`${account.provider} calendar fetch failed`);
        const data = await res.json() as CalendarEvent[];
        allEvents.push(...data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch events");
      }
    }

    allEvents.sort((a, b) => a.time.localeCompare(b.time));
    setEvents(allEvents);
    setLoading(false);
  }

  // Group mail by folder, keeping folders ordered by most-recent message
  // (messages arrive already sorted newest-first).
  const folderGroups: Array<[string, MailMessage[]]> = [];
  const groupIndex = new Map<string, MailMessage[]>();
  for (const m of messages) {
    const key = m.folder || "(unfiled)";
    let bucket = groupIndex.get(key);
    if (!bucket) {
      bucket = [];
      groupIndex.set(key, bucket);
      folderGroups.push([key, bucket]);
    }
    bucket.push(m);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/select")} style={styles.navBtn}>
            Manage Accounts
          </button>
          <button onClick={() => navigate("/")} style={styles.navBtn}>
            Connect More
          </button>
        </div>
      </div>

      <div style={styles.accounts}>
        {accounts.map((a) => (
          <span key={a.accountId} style={styles.accountChip}>
            {a.provider === "microsoft" ? "M365" : "Google"}: {a.email}
          </span>
        ))}
      </div>

      <section style={styles.section}>
        <h2 style={{ margin: "0 0 16px" }}>Mail</h2>
        {mailLoading && <p style={styles.muted}>Loading mail...</p>}
        {!mailLoading && messages.length === 0 && (
          <p style={styles.muted}>
            No emails from your selected folders yet. Pick folders under &ldquo;Manage Accounts.&rdquo;
          </p>
        )}
        {folderGroups.map(([folder, msgs]) => (
          <div key={folder} style={styles.mailGroup}>
            <div style={styles.mailGroupHeader}>
              <span>{folder}</span>
              <span style={styles.mailCount}>{msgs.length}</span>
            </div>
            {msgs.map((m) => (
              <div key={`${m.provider}-${m.id}`} style={styles.eventCard}>
                <div style={styles.eventTime}>
                  {m.receivedAt
                    ? new Date(m.receivedAt).toLocaleDateString([], { month: "short", day: "numeric" })
                    : ""}
                </div>
                <div style={styles.eventDetails}>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    {m.webLink ? (
                      <a href={m.webLink} target="_blank" rel="noreferrer" style={styles.mailSubjectLink}>
                        {m.subject}
                      </a>
                    ) : (
                      <strong>{m.subject}</strong>
                    )}
                    <span style={styles.mailFrom}>{m.from}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={{ margin: 0 }}>Calendar</h2>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.datePicker}
          />
        </div>

        {loading && <p style={styles.muted}>Loading events...</p>}
        {error && <p style={styles.errorMsg}>{error}</p>}

        {!loading && events.length === 0 && (
          <p style={styles.muted}>No events found for {date}.</p>
        )}

        {events.map((event) => (
          <div key={event.id} style={styles.eventCard}>
            <div style={styles.eventTime}>
              {event.time
                ? new Date(event.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "All day"}
            </div>
            <div style={styles.eventDetails}>
              <strong>{event.description}</strong>
              <span style={{ ...styles.badge, background: event.provider === "microsoft" ? "#e8f0fe" : "#fce8e6" }}>
                {event.provider === "microsoft" ? "Outlook" : "Google"}
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 720, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  navBtn: { background: "none", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", padding: "6px 12px", fontSize: 13 },
  accounts: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 },
  accountChip: { background: "#f0f4ff", borderRadius: 12, padding: "4px 12px", fontSize: 12, color: "#333" },
  section: { marginBottom: 40 },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  datePicker: { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 4 },
  muted: { color: "#888", fontStyle: "italic" },
  errorMsg: { color: "#c00", background: "#fff0f0", padding: "8px 12px", borderRadius: 4 },
  eventCard: { display: "flex", gap: 16, padding: "12px 0", borderBottom: "1px solid #f0f0f0", alignItems: "center" },
  eventTime: { minWidth: 60, color: "#555", fontSize: 14 },
  eventDetails: { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  badge: { fontSize: 11, borderRadius: 4, padding: "2px 8px", color: "#333" },
  mailSubjectLink: { fontWeight: 600, color: "#0066cc", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  mailFrom: { fontSize: 12, color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  folderBadge: { fontSize: 11, borderRadius: 4, padding: "2px 8px", background: "#eef", color: "#339", marginLeft: "auto", whiteSpace: "nowrap" },
  mailGroup: { marginBottom: 24 },
  mailGroupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "2px solid #e6e6e6", marginBottom: 4, fontWeight: 700, color: "#333", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.3 },
  mailCount: { fontSize: 11, fontWeight: 600, color: "#556", background: "#eef", borderRadius: 10, padding: "1px 8px" },
};
