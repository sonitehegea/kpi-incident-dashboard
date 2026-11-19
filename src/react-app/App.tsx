import { useState, useEffect, useCallback } from "react";
import DashboardPage from "./pages/DashboardPage";
import SyncPage from "./pages/SyncPage";
import { Incident } from "./types";
import { fetchAllIncidents } from "./services/incidentService";

type ActiveTab = "dashboard" | "sync";

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
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return window.location.hash === "#sync" ? "sync" : "dashboard";
  });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncWib, setLastSyncWib] = useState<string>("-");

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allTickets = await fetchAllIncidents();
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

  const handleSwitchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.location.hash = tab === "sync" ? "#sync" : "";
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* TOP NAVIGATION BAR */}
      <nav
        style={{
          background: "#0f172a",
          color: "#ffffff",
          padding: "0 20px",
          height: "54px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "12px",
              padding: "4px 10px",
              borderRadius: "6px",
              letterSpacing: "0.4px",
            }}
          >
            NORTHERN JKT
          </span>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>
            Laporan Tiket Gangguan
          </span>
        </div>

        {/* TOMBOL NAVIGASI DASHBOARD & SYNC */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => handleSwitchTab("dashboard")}
            style={{
              background: activeTab === "dashboard" ? "#2563eb" : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "dashboard" ? "#ffffff" : "#cbd5e1",
              border: activeTab === "dashboard" ? "1px solid #3b82f6" : "1px solid rgba(255, 255, 255, 0.12)",
              padding: "6px 14px",
              borderRadius: "99px",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Dashboard Tiket Berjalan
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab("sync")}
            style={{
              background: activeTab === "sync" ? "#16a34a" : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "sync" ? "#ffffff" : "#cbd5e1",
              border: activeTab === "sync" ? "1px solid #22c55e" : "1px solid rgba(255, 255, 255, 0.12)",
              padding: "6px 14px",
              borderRadius: "99px",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Sync & Collect Data
          </button>
        </div>
      </nav>

      {/* NOTIFIKASI ERROR JIKA GAGAL FETCH */}
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

      {/* KONTEN HALAMAN AKTIF */}
      <main style={{ flex: 1 }}>
        {activeTab === "dashboard" ? (
          <DashboardPage
            incidents={incidents}
            loading={loading}
            onRefresh={loadAllData}
            lastSyncWib={lastSyncWib}
          />
        ) : (
          <SyncPage
            incidents={incidents}
            loading={loading}
            onRefresh={loadAllData}
            lastSyncWib={lastSyncWib}
          />
        )}
      </main>
    </div>
  );
}
