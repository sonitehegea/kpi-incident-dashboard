import { useState, useEffect, useMemo, useCallback } from "react";
import DashboardPage from "./pages/DashboardPage";
import SyncPage from "./pages/SyncPage";
import { Incident } from "./types";

type ActiveTab = "dashboard" | "sync";

function parseSqliteUtcToDate(rawUtc?: string): Date | null {
  if (!rawUtc) return null;
  const iso = rawUtc.includes("T") ? rawUtc : rawUtc.replace(" ", "T") + "Z";
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    return window.location.hash === "#sync" ? "sync" : "dashboard";
  });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/incidents");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal memuat data dari server.");
      }
      setIncidents(json.data || []);
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

  // Hitung waktu Last Sync aktual dari kolom synced_at terbesar di Database D1
  const { lastSyncWib, isDataStale } = useMemo(() => {
    if (!incidents.length) {
      return { lastSyncWib: "Belum ada data", isDataStale: false };
    }

    let latestMs = 0;
    let latestRaw = "";

    incidents.forEach((item) => {
      const dt = parseSqliteUtcToDate(item.synced_at);
      if (dt && dt.getTime() > latestMs) {
        latestMs = dt.getTime();
        latestRaw = item.synced_at;
      }
    });

    if (!latestMs) {
      return { lastSyncWib: incidents[0].synced_at || "-", isDataStale: false };
    }

    const formatted =
      new Date(latestMs).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) + " WIB";

    const diffMins = Math.max(0, Math.floor((Date.now() - latestMs) / 60000));
    let ageLabel = "";
    if (diffMins < 1) {
      ageLabel = "baru saja";
    } else if (diffMins < 60) {
      ageLabel = `${diffMins} mnt lalu`;
    } else {
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      ageLabel = `${hrs}j ${mins}m lalu`;
    }

    const stale = diffMins >= 120; // Peringatan jika data lebih dari 2 jam belum di-sync
    return {
      lastSyncWib: `${formatted} (${ageLabel})${latestRaw ? "" : ""}`,
      isDataStale: stale,
    };
  }, [incidents]);

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
          padding: "0 16px",
          height: "52px",
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
              background: "#1d4ed8",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "11px",
              padding: "3.5px 9px",
              borderRadius: "5px",
              letterSpacing: "0.4px",
            }}
          >
            NORTHERN JKT
          </span>
          <span style={{ fontWeight: 700, fontSize: "14px", color: "#f8fafc" }}>
            Incident Command Monitor
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
              padding: "5px 13px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Dashboard KPI
          </button>

          <button
            type="button"
            onClick={() => handleSwitchTab("sync")}
            style={{
              background: activeTab === "sync" ? "#16a34a" : "rgba(255, 255, 255, 0.08)",
              color: activeTab === "sync" ? "#ffffff" : "#cbd5e1",
              border: activeTab === "sync" ? "1px solid #22c55e" : "1px solid rgba(255, 255, 255, 0.12)",
              padding: "5px 13px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
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
            isDataStale={isDataStale}
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
