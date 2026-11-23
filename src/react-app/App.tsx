import { useState, useEffect, useCallback, useMemo } from "react";
import DashboardPage from "./pages/DashboardPage";
import SyncPage from "./pages/SyncPage";
import { Incident } from "./types";
import {
  fetchAllIncidents,
  fetchAllUnspecIncidents,
} from "./services/incidentService";

type ActiveTab = "dashboard" | "unspec" | "sync";

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

function getDatasetLastSyncWib(rows: Incident[], fallbackWib: string): string {
  const syncedVal = rows.find((r) => r.synced_at)?.synced_at;
  if (!syncedVal) return fallbackWib;
  const isoUtc = syncedVal.includes("T")
    ? syncedVal
    : `${syncedVal.replace(" ", "T")}Z`;
  const dt = new Date(isoUtc);
  if (isNaN(dt.getTime())) return fallbackWib;
  return (
    dt.toLocaleString("id-ID", {
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

function getInitialTabFromHash(): ActiveTab {
  const hash = window.location.hash.toLowerCase();
  if (hash === "#unspec") return "unspec";
  if (hash === "#sync") return "sync";
  return "dashboard";
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTabFromHash);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [unspecIncidents, setUnspecIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAtWib, setFetchedAtWib] = useState<string>("-");

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mainTickets, unspecTickets] = await Promise.all([
        fetchAllIncidents(),
        fetchAllUnspecIncidents(),
      ]);
      setIncidents(mainTickets);
      setUnspecIncidents(unspecTickets);
      setFetchedAtWib(formatWibNow());
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memuat data.";
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
    if (tab === "unspec") {
      window.location.hash = "#unspec";
    } else if (tab === "sync") {
      window.location.hash = "#sync";
    } else {
      window.location.hash = "";
    }
  };

  const lastSyncMainWib = useMemo(
    () => getDatasetLastSyncWib(incidents, fetchedAtWib),
    [incidents, fetchedAtWib]
  );

  const lastSyncUnspecWib = useMemo(
    () => getDatasetLastSyncWib(unspecIncidents, fetchedAtWib),
    [unspecIncidents, fetchedAtWib]
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* TOP NAVIGATION BAR */}
      <nav
        style={{
          background: "#0f172a",
          color: "#ffffff",
          padding: "0 20px",
          minHeight: "54px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
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
            Dashboard Laporan Tiket Gangguan
          </span>
        </div>

        {/* TOMBOL NAVIGASI 3 MENU */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => handleSwitchTab("dashboard")}
            style={{
              background:
                activeTab === "dashboard"
                  ? "#2563eb"
                  : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "dashboard" ? "#ffffff" : "#cbd5e1",
              border:
                activeTab === "dashboard"
                  ? "1px solid #3b82f6"
                  : "1px solid rgba(255, 255, 255, 0.12)",
              padding: "6px 14px",
              borderRadius: "99px",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Dashboard KPI ({incidents.length})
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab("unspec")}
            style={{
              background:
                activeTab === "unspec"
                  ? "#0d9488"
                  : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "unspec" ? "#ffffff" : "#cbd5e1",
              border:
                activeTab === "unspec"
                  ? "1px solid #14b8a6"
                  : "1px solid rgba(255, 255, 255, 0.12)",
              padding: "6px 14px",
              borderRadius: "99px",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Unspec Insera Controller ({unspecIncidents.length})
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab("sync")}
            style={{
              background:
                activeTab === "sync" ? "#16a34a" : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "sync" ? "#ffffff" : "#cbd5e1",
              border:
                activeTab === "sync"
                  ? "1px solid #22c55e"
                  : "1px solid rgba(255, 255, 255, 0.12)",
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
        {activeTab === "dashboard" && (
          <DashboardPage
            incidents={incidents}
            loading={loading}
            onRefresh={loadAllData}
            lastSyncWib={lastSyncMainWib}
            dashboardTitle="Monitoring Gangguan Branch Northern Jakarta"
            waReportHeader="MONITORING TIKET OPEN NORTHERNJAKARTA"
            csvFilePrefix="Laporan_Gangguan"
            accentGradient="linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)"
            accentColor="#1e3a8a"
          />
        )}

        {activeTab === "unspec" && (
          <DashboardPage
            incidents={unspecIncidents}
            loading={loading}
            onRefresh={loadAllData}
            lastSyncWib={lastSyncUnspecWib}
            dashboardTitle="Monitoring Unspec Insera Controller – Branch Northern Jakarta"
            waReportHeader="MONITORING UNSPEC INSERA CONTROLLER NORTHERNJAKARTA"
            csvFilePrefix="Laporan_Unspec_Insera"
            accentGradient="linear-gradient(135deg, #115e59 0%, #0d9488 100%)"
            accentColor="#0f766e"
          />
        )}

        {activeTab === "sync" && (
          <SyncPage
            incidents={incidents}
            unspecIncidents={unspecIncidents}
            loading={loading}
            onRefreshAll={loadAllData}
            lastSyncMainWib={lastSyncMainWib}
            lastSyncUnspecWib={lastSyncUnspecWib}
          />
        )}
      </main>
    </div>
  );
}
