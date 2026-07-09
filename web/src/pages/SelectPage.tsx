import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts } from "../auth/AccountContext";
import { apiUrl } from "../api";

interface Inbox {
  id: string;
  name: string;
  provider: string;
  accountId: string;
  path?: string;
  depth?: number;
}

interface Calendar {
  id: string;
  name: string;
  provider: string;
  accountId: string;
}

export default function SelectPage() {
  const navigate = useNavigate();
  const { accounts } = useAccounts();

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedInboxes, setSelectedInboxes] = useState<Set<string>>(new Set());
  const [selectedCalendars, setSelectedCalendars] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (accounts.length === 0) {
      navigate("/");
      return;
    }
    fetchAvailable();
  }, [accounts]);

  async function fetchAvailable() {
    setLoading(true);
    const allInboxes: Inbox[] = [];
    const allCalendars: Calendar[] = [];

    for (const account of accounts) {
      const headers = {
        Authorization: `Bearer ${account.provider}:${account.accountId}:${account.accessToken}`,
      };

      const [inboxRes, calRes] = await Promise.allSettled([
        fetch(apiUrl("/inboxes"), { headers }),
        fetch(apiUrl("/calendars"), { headers }),
      ]);

      if (inboxRes.status === "fulfilled" && inboxRes.value.ok) {
        const data = await inboxRes.value.json() as Inbox[];
        allInboxes.push(...data);
      }
      if (calRes.status === "fulfilled" && calRes.value.ok) {
        const data = await calRes.value.json() as Calendar[];
        allCalendars.push(...data);
      }
    }

    setInboxes(allInboxes);
    setCalendars(allCalendars);
    setLoading(false);
  }

  function toggleInbox(id: string) {
    const target = inboxes.find((i) => i.id === id);
    if (!target) return;
    // Checking a parent folder selects it and all of its subfolders; unchecking
    // clears them too. Descendants are matched by path prefix within the account.
    const affected = inboxes.filter(
      (i) =>
        i.id === id ||
        (!!target.path &&
          i.accountId === target.accountId &&
          !!i.path &&
          i.path.startsWith(`${target.path} / `))
    );
    setSelectedInboxes((prev) => {
      const next = new Set(prev);
      const selecting = !prev.has(id);
      for (const f of affected) {
        selecting ? next.add(f.id) : next.delete(f.id);
      }
      return next;
    });
  }

  function toggleCalendar(id: string) {
    setSelectedCalendars((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    for (const account of accounts) {
      const headers = {
        Authorization: `Bearer ${account.provider}:${account.accountId}:${account.accessToken}`,
        "Content-Type": "application/json",
      };
      await fetch(apiUrl("/config"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          selectedInboxes: [...selectedInboxes],
          selectedCalendars: [...selectedCalendars],
        }),
      });
    }
    setSaving(false);
    navigate("/dashboard");
  }

  if (loading) return <div style={styles.container}>Loading your accounts...</div>;

  return (
    <div style={styles.container}>
      <button onClick={() => navigate("/")} style={styles.back}>&larr; Back</button>
      <h1>Choose What to Monitor</h1>

      <section style={styles.section}>
        <h2>Inboxes</h2>
        {inboxes.length === 0 && <p style={styles.empty}>No inboxes found.</p>}
        {inboxes.length > 0 && (
          <p style={styles.hint}>
            Pick individual folders/subfolders to monitor. Checking a folder also
            selects everything nested under it.
          </p>
        )}
        {inboxes.map((inbox) => (
          <label
            key={inbox.id}
            style={{ ...styles.checkRow, paddingLeft: 8 + (inbox.depth ?? 0) * 22 }}
          >
            <input
              type="checkbox"
              checked={selectedInboxes.has(inbox.id)}
              onChange={() => toggleInbox(inbox.id)}
            />
            <span>
              <strong>{inbox.name}</strong>{" "}
              <span style={styles.badge}>{inbox.provider}</span>
            </span>
          </label>
        ))}
      </section>

      <section style={styles.section}>
        <h2>Calendars</h2>
        {calendars.length === 0 && <p style={styles.empty}>No calendars found.</p>}
        {calendars.map((cal) => (
          <label key={cal.id} style={styles.checkRow}>
            <input
              type="checkbox"
              checked={selectedCalendars.has(cal.id)}
              onChange={() => toggleCalendar(cal.id)}
            />
            <span>
              <strong>{cal.name}</strong>{" "}
              <span style={styles.badge}>{cal.provider}</span>
            </span>
          </label>
        ))}
      </section>

      <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
        {saving ? "Saving..." : "Save & Go to Dashboard"}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 560, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" },
  back: { background: "none", border: "none", cursor: "pointer", color: "#0066cc", fontSize: 14, marginBottom: 16 },
  section: { marginBottom: 32 },
  checkRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f0f0", cursor: "pointer" },
  badge: { fontSize: 11, background: "#eef", color: "#339", borderRadius: 4, padding: "2px 6px" },
  empty: { color: "#888", fontStyle: "italic" },
  hint: { color: "#666", fontSize: 13, marginBottom: 12 },
  saveBtn: { padding: "12px 24px", fontSize: 16, background: "#0066cc", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" },
};
