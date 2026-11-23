import { useState } from "react";
import { Incident } from "../types";

interface SyncPageProps {
  incidents: Incident[];
  unspecIncidents: Incident[];
  loading: boolean;
  onRefreshAll: () => Promise<void>;
  lastSyncMainWib: string;
  lastSyncUnspecWib: string;
}

export default function SyncPage({
  incidents,
  unspecIncidents,
  loading,
  onRefreshAll,
  lastSyncMainWib,
  lastSyncUnspecWib,
}: SyncPageProps) {
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedUnspec, setCopiedUnspec] = useState(false);
  const [previewTab, setPreviewTab] = useState<"MAIN" | "UNSPEC">("MAIN");
  const [search, setSearch] = useState("");

  const buildBookmarklet = (endpointPath: string) => {
    const fullUrl = `${window.location.origin}${endpointPath}`;
    return `javascript:(async()=>{const t=document.querySelector('table');if(!t)return alert('Tabel tidak ditemukan di halaman ini!');const h=[...t.querySelectorAll('thead th, tr:first-child th')].map(e=>e.innerText.replace(/\\s+/g,' ').trim().toUpperCase());const rows=[...t.querySelectorAll('tbody tr')].map(tr=>{const td=[...tr.querySelectorAll('td')];const o={};h.forEach((k,i)=>{if(k&&td[i])o[k]=td[i].innerText.replace(/\\s+/g,' ').trim()});return o}).filter(r=>r.INCIDENT&&r.INCIDENT.startsWith('INC'));if(!rows.length)return alert('Tidak ada baris tiket INC ditemukan.');try{const res=await fetch('${fullUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})});const j=await res.json();alert(j.message||j.error)}catch(e){alert('Gagal mengirim data: '+e.message)}})();`;
  };

  const mainBookmarklet = buildBookmarklet("/api/ingest");
  const unspecBookmarklet = buildBookmarklet("/api/unspec/ingest");

  const handleCopyMain = () => {
    navigator.clipboard.writeText(mainBookmarklet);
    setCopiedMain(true);
    setTimeout(() => setCopiedMain(false), 3000);
  };

  const handleCopyUnspec = () => {
    navigator.clipboard.writeText(unspecBookmarklet);
    setCopiedUnspec(true);
    setTimeout(() => setCopiedUnspec(false), 3000);
  };

  const activeRows = previewTab === "MAIN" ? incidents : unspecIncidents;

  const filteredData = activeRows.filter((item) => {
    const q = search.toLowerCase();
    return (
      (item.incident || "").toLowerCase().includes(q) ||
      (item.workzone || "").toLowerCase().includes(q) ||
      (item.witel || "").toLowerCase().includes(q) ||
      (item.status || "").toLowerCase().includes(q) ||
      (item.service_no || "").toLowerCase().includes(q) ||
      (item.device_name || "").toLowerCase().includes(q) ||
      (item.rk_information || "").toLowerCase().includes(q)
    );
  });

  const thStyle: React.CSSProperties = {
    padding: "9px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "11px",
    color: "#1e293b",
    borderBottom: "2px solid #cbd5e1",
  };

  const tdStyle: React.CSSProperties = {
    padding: "7px 12px",
    whiteSpace: "nowrap",
    fontSize: "12px",
    color: "#334155",
  };

  return (
    <div style={{ maxWidth: "1320px", margin: "0 auto", padding: "18px 16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 800,
            margin: 0,
            color: "#0f172a",
          }}
        >
          Collect & Sinkronisasi Data (Terpisah Per Database)
        </h1>
        <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
          Gunakan masing-masing Bookmarklet di bawah sesuai jenis halaman
          portal yang sedang Anda buka agar data tidak pernah tertukar.
        </p>
      </div>

      {/* GRID 2 KOLOM BOOKMARKLET TERPISAH */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        {/* CARD 1: BOOKMARKLET DASHBOARD KPI UTAMA */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #93c5fd",
            borderRadius: "10px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
              padding: "10px 16px",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: "13.5px" }}>
              1A. Bookmarklet: Dashboard KPI (Tiket Gangguan)
            </span>
            <span
              style={{
                background: "rgba(255,255,255,0.2)",
                padding: "2px 8px",
                borderRadius: "99px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              Tabel: incidents
            </span>
          </div>

          <div style={{ padding: "16px" }}>
            <ol
              style={{
                margin: "0 0 12px 18px",
                padding: 0,
                fontSize: "12.5px",
                lineHeight: "1.6",
                color: "#334155",
              }}
            >
              <li>
                Klik tombol <strong>Copy Bookmarklet Tiket GGN</strong>.
              </li>
              <li>
                Simpan sebagai bookmark di Chrome dengan nama{" "}
                <code
                  style={{
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontWeight: 700,
                  }}
                >
                  1. Kirim Tiket GGN
                </code>
                .
              </li>
              <li>
                Jalankan khusus pada halaman daftar{" "}
                <strong>Tiket Gangguan Reguler</strong>.
              </li>
            </ol>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                readOnly
                value={mainBookmarklet}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontFamily: "monospace",
                  fontSize: "11.5px",
                  background: "#f8fafc",
                  color: "#475569",
                }}
              />
              <button
                type="button"
                onClick={handleCopyMain}
                style={{
                  background: copiedMain ? "#16a34a" : "#1d4ed8",
                  color: "#ffffff",
                  border: "none",
                  padding: "9px 14px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "12.5px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copiedMain ? "Tersalin!" : "Copy Bookmarklet Tiket GGN"}
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: BOOKMARKLET UNSPEC INSERA CONTROLLER */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #5eead4",
            borderRadius: "10px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #115e59 0%, #0d9488 100%)",
              padding: "10px 16px",
              color: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: "13.5px" }}>
              1B. Bookmarklet: Unspec Insera Controller
            </span>
            <span
              style={{
                background: "rgba(255,255,255,0.2)",
                padding: "2px 8px",
                borderRadius: "99px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              Tabel: unspec_incidents
            </span>
          </div>

          <div style={{ padding: "16px" }}>
            <ol
              style={{
                margin: "0 0 12px 18px",
                padding: 0,
                fontSize: "12.5px",
                lineHeight: "1.6",
                color: "#334155",
              }}
            >
              <li>
                Klik tombol <strong>Copy Bookmarklet Unspec Insera</strong>.
              </li>
              <li>
                Simpan sebagai bookmark terpisah di Chrome dengan nama{" "}
                <code
                  style={{
                    background: "#f0fdfa",
                    color: "#0f766e",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontWeight: 700,
                  }}
                >
                  2. Kirim Unspec Insera
                </code>
                .
              </li>
              <li>
                Jalankan khusus pada halaman{" "}
                <strong>Unspec Insera Controller</strong>.
              </li>
            </ol>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="text"
                readOnly
                value={unspecBookmarklet}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontFamily: "monospace",
                  fontSize: "11.5px",
                  background: "#f8fafc",
                  color: "#475569",
                }}
              />
              <button
                type="button"
                onClick={handleCopyUnspec}
                style={{
                  background: copiedUnspec ? "#16a34a" : "#0d9488",
                  color: "#ffffff",
                  border: "none",
                  padding: "9px 14px",
                  borderRadius: "6px",
                  fontWeight: 700,
                  fontSize: "12.5px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copiedUnspec
                  ? "Tersalin!"
                  : "Copy Bookmarklet Unspec Insera"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS & VERIFIKASI DATA TERSIMPAN PER DATABASE */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "15px",
                fontWeight: 800,
                margin: 0,
                color: "#0f172a",
              }}
            >
              2. Verifikasi Data Tersimpan di Database D1
            </h2>
            <div
              style={{
                fontSize: "12px",
                color: "#64748b",
                marginTop: "4px",
              }}
            >
              Tiket GGN Utama:{" "}
              <strong style={{ color: "#1d4ed8" }}>
                {incidents.length} Tiket
              </strong>{" "}
              (Sync: {lastSyncMainWib}) • Unspec Insera:{" "}
              <strong style={{ color: "#0d9488" }}>
                {unspecIncidents.length} Tiket
              </strong>{" "}
              (Sync: {lastSyncUnspecWib})
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                background: "#f1f5f9",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            >
              <button
                type="button"
                onClick={() => setPreviewTab("MAIN")}
                style={{
                  background: previewTab === "MAIN" ? "#1d4ed8" : "transparent",
                  color: previewTab === "MAIN" ? "#ffffff" : "#475569",
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Tiket GGN ({incidents.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("UNSPEC")}
                style={{
                  background:
                    previewTab === "UNSPEC" ? "#0d9488" : "transparent",
                  color: previewTab === "UNSPEC" ? "#ffffff" : "#475569",
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Unspec Insera ({unspecIncidents.length})
              </button>
            </div>

            <input
              type="text"
              placeholder="Cari INCIDENT / WORKZONE / DEVICE / RK..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                width: "260px",
                fontSize: "12px",
              }}
            />
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={loading}
              style={{
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                padding: "7px 14px",
                borderRadius: "6px",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Memuat..." : "Cek & Refresh Semua"}
            </button>
          </div>
        </div>

        <div
          style={{
            overflowX: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            maxHeight: "52vh",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead
              style={{ background: "#f8fafc", position: "sticky", top: 0 }}
            >
              <tr>
                <th style={thStyle}>INCIDENT</th>
                <th style={thStyle}>REPORTED DATE</th>
                <th style={thStyle}>BOOKING DATE</th>
                <th style={thStyle}>SERVICE TYPE</th>
                <th style={thStyle}>WITEL</th>
                <th style={thStyle}>WORKZONE</th>
                <th style={thStyle}>STATUS</th>
                <th style={thStyle}>STATUS DATE</th>
                <th style={thStyle}>TICKET ID GAMAS</th>
                <th style={thStyle}>CUSTOMER TYPE</th>
                <th style={thStyle}>CUSTOMER NAME</th>
                <th style={thStyle}>SERVICE NO</th>
                <th style={thStyle}>DEVICE NAME</th>
                <th style={thStyle}>RK INFORMATION</th>
                <th style={thStyle}>URGENCY</th>
                <th style={thStyle}>SYMPTOM</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "#64748b",
                      fontSize: "12.5px",
                    }}
                  >
                    Belum ada data pada tabel{" "}
                    <strong>
                      {previewTab === "MAIN" ? "incidents" : "unspec_incidents"}
                    </strong>
                    . Jalankan bookmarklet yang sesuai lalu klik{" "}
                    <strong>Cek & Refresh Semua</strong>.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr
                    key={row.incident}
                    style={{ borderBottom: "1px solid #e2e8f0" }}
                  >
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 700,
                        color: previewTab === "MAIN" ? "#1d4ed8" : "#0f766e",
                      }}
                    >
                      {row.incident}
                    </td>
                    <td style={tdStyle}>{row.reported_date || "-"}</td>
                    <td style={tdStyle}>{row.booking_date || "-"}</td>
                    <td style={tdStyle}>{row.service_type || "-"}</td>
                    <td style={tdStyle}>{row.witel || "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {row.workzone || "-"}
                    </td>
                    <td style={tdStyle}>{row.status || "-"}</td>
                    <td style={tdStyle}>{row.status_date || "-"}</td>
                    <td style={tdStyle}>{row.ticket_id_gamas || "-"}</td>
                    <td style={tdStyle}>{row.customer_type || "-"}</td>
                    <td style={tdStyle}>{row.customer_name || "-"}</td>
                    <td style={tdStyle}>{row.service_no || "-"}</td>
                    <td style={tdStyle}>{row.device_name || "-"}</td>
                    <td style={tdStyle}>{row.rk_information || "-"}</td>
                    <td style={tdStyle}>{row.urgency || "-"}</td>
                    <td
                      style={{
                        ...tdStyle,
                        maxWidth: "240px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={row.symptom}
                    >
                      {row.symptom || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
