import { useState, useEffect } from "react";

interface Incident {
  incident: string;
  reported_date: string;
  witel: string;
  workzone: string;
  customer_type: string;
  status: string;
  lapul: number;
  gaul: number;
  ttr_end_to_end: string;
  technician: string;
  summary: string;
  synced_at: string;
}

export default function App() {
  const [targetUrl, setTargetUrl] = useState(
    () => localStorage.getItem("kpi_target_url") || ""
  );
  const [cookie, setCookie] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [search, setSearch] = useState("");

  // Simpan URL tujuan di browser agar tidak perlu ketik ulang
  useEffect(() => {
    localStorage.setItem("kpi_target_url", targetUrl);
  }, [targetUrl]);

  // Muat data dari database D1 saat halaman pertama kali dibuka
  const fetchIncidents = async () => {
    try {
      const res = await fetch("/api/incidents");
      const json = await res.json();
      if (json.success) {
        setIncidents(json.data);
      }
    } catch (err) {
      console.error("Gagal memuat data:", err);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  // Eksekusi penarikan data ke backend Worker
  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, cookie }),
      });
      const json = await res.json();

      if (!res.ok) {
        setStatusMsg({ type: "error", text: json.error || "Terjadi kesalahan." });
      } else {
        setStatusMsg({ type: "success", text: json.message });
        await fetchIncidents(); // Refresh tabel otomatis
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = incidents.filter(
    (item) =>
      item.incident.toLowerCase().includes(search.toLowerCase()) ||
      (item.workzone || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.witel || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
        Dashboard Performansi & Sync Tiket Incident
      </h1>
      <p style={{ color: "#555", marginBottom: "24px" }}>
        Masukkan Link Tujuan dan Cookie sesi aktif untuk menyinkronkan tabel HTML langsung ke database.
      </p>

      {/* FORM INPUT COOKIE & URL */}
      <form
        onSubmit={handleSync}
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <div style={{ marginBottom: "14px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            1. Link URL Tabel Tujuan (Tersimpan Otomatis)
          </label>
          <input
            type="url"
            required
            placeholder="https://..."
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}>
            2. Session Cookie Aktif (Salin dari DevTools → Network → Request Headers → Cookie)
          </label>
          <textarea
            required
            rows={3}
            placeholder="Tempel string Cookie di sini..."
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontFamily: "monospace",
              fontSize: "12px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#94a3b8" : "#2563eb",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Sedang Menarik & Menyimpan Data..." : "Tarik Data & Simpan ke Database"}
        </button>

        {statusMsg && (
          <div
            style={{
              marginTop: "14px",
              padding: "12px",
              borderRadius: "6px",
              background: statusMsg.type === "success" ? "#dcfce7" : "#fee2e2",
              color: statusMsg.type === "success" ? "#166534" : "#991b1b",
              fontWeight: 500,
            }}
          >
            {statusMsg.text}
          </div>
        )}
      </form>

      {/* RINGKASAN DATA & FILTER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div style={{ fontWeight: 600 }}>
          Total Data di Database: <span style={{ color: "#2563eb" }}>{incidents.length} Tiket</span>
        </div>
        <input
          type="text"
          placeholder="Cari INCIDENT / WITEL / WORKZONE / STATUS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            width: "320px",
          }}
        />
      </div>

      {/* TABEL DATA DARI DATABASE D1 */}
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
          <thead style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
            <tr>
              <th style={{ padding: "10px" }}>INCIDENT</th>
              <th style={{ padding: "10px" }}>REPORTED DATE</th>
              <th style={{ padding: "10px" }}>WITEL</th>
              <th style={{ padding: "10px" }}>WORKZONE</th>
              <th style={{ padding: "10px" }}>CUSTOMER TYPE</th>
              <th style={{ padding: "10px" }}>STATUS</th>
              <th style={{ padding: "10px" }}>LAPUL</th>
              <th style={{ padding: "10px" }}>GAUL</th>
              <th style={{ padding: "10px" }}>TTR E2E</th>
              <th style={{ padding: "10px" }}>TECHNICIAN</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                  Belum ada data tiket di database. Silakan masukkan URL & Cookie di atas.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr key={row.incident} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px", fontWeight: 600, color: "#1d4ed8" }}>{row.incident}</td>
                  <td style={{ padding: "10px" }}>{row.reported_date}</td>
                  <td style={{ padding: "10px" }}>{row.witel}</td>
                  <td style={{ padding: "10px" }}>{row.workzone}</td>
                  <td style={{ padding: "10px" }}>{row.customer_type}</td>
                  <td style={{ padding: "10px" }}>{row.status}</td>
                  <td style={{ padding: "10px" }}>{row.lapul}</td>
                  <td style={{ padding: "10px" }}>{row.gaul}</td>
                  <td style={{ padding: "10px" }}>{row.ttr_end_to_end || "-"}</td>
                  <td style={{ padding: "10px" }}>{row.technician || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
