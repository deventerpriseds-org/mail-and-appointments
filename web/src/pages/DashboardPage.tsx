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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accounts.length === 0) {
      navigate("/");
      return;
    }
    fetchEvents();
  }, [date, accounts]);

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
};
