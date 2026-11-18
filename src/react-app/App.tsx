import { useState, useEffect, useMemo } from "react";
import { Incident } from "./types";
import DashboardPage from "./pages/DashboardPage";
import SyncPage from "./pages/SyncPage";

export default function App() {
  const [route, setRoute] = useState<string>(() => window.location.pathname);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  // Sinkronkan tombol Back/Forward browser dengan state route
  useEffect(() => {
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setRoute(path);
  };

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/incidents");
      const json = await res.json();
      if (json.success) {
        setIncidents(json.data);
      }
    } catch (err) {
      console.error("Gagal memuat data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const lastSyncWib = useMemo(() => {
    if (!incidents.length || !incidents[0].synced_at) return "-";
    try {
      const utcDate = new Date(incidents[0].synced_at.replace(" ", "T") + "Z");
      return (
        utcDate.toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) + " WIB"
      );
    } catch {
      return incidents[0].synced_at;
    }
  }, [incidents]);

  const isSyncPage = route === "/sync";

  return (
    <div
      style={{
        background: "#f1f5f9",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#0f172a",
      }}
    >
      {/* TOP NAVIGATION BAR */}
      <nav
        style={{
          background: "#0f172a",
          color: "#fff",
          padding: "0 24px",
          height: "54px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <span style={{ fontWeight: 800, fontSize: "15px", letterSpacing: "0.3px" }}>
            OSS Incident Monitor
          </span>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={{
                background: !isSyncPage ? "#2563eb" : "transparent",
                color: !isSyncPage ? "#fff" : "#cbd5e1",
                border: "none",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Dashboard Reporting
            </button>

            <button
              type="button"
              onClick={() => navigate("/sync")}
              style={{
                background: isSyncPage ? "#2563eb" : "transparent",
                color: isSyncPage ? "#fff" : "#cbd5e1",
                border: "none",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Collect Data (Sync)
            </button>
          </div>
        </div>

        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
          {incidents.length} Tiket Aktif
        </div>
      </nav>

      {/* RENDER HALAMAN SESUAI RUTE */}
      {isSyncPage ? (
        <SyncPage
          incidents={incidents}
          loading={loading}
          onRefresh={fetchIncidents}
          lastSyncWib={lastSyncWib}
        />
      ) : (
        <DashboardPage
          incidents={incidents}
          loading={loading}
          onRefresh={fetchIncidents}
          lastSyncWib={lastSyncWib}
        />
      )}
    </div>
  );
}
