import { useState, useEffect, useCallback } from "react";
import DashboardPage from "./pages/DashboardPage";
import { Incident } from "./types";
import { fetchAllIncidents } from "./services/incidentService";

function formatWibNow(): string {
  return (
    new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) + " WIB"
  );
}

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncWib, setLastSyncWib] = useState<string>("-");

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allTickets = await fetchAllIncidents();
      // Update state sekaligus setelah seluruh halaman (page 1..N) selesai dikumpulkan
      setIncidents(allTickets);
      setLastSyncWib(formatWibNow());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return (
    <>
      {error && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            borderBottom: "1px solid #fecaca",
            padding: "8px 16px",
            fontSize: "12.5px",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      <DashboardPage
        incidents={incidents}
        loading={loading}
        onRefresh={loadAllData}
        lastSyncWib={lastSyncWib}
      />
    </>
  );
}
