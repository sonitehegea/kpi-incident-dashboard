import { useState } from "react";
import { Incident } from "../types";

interface SyncPageProps {
  incidents: Incident[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  lastSyncWib: string;
}

export default function SyncPage({
  incidents,
  loading,
  onRefresh,
  lastSyncWib,
}: SyncPageProps) {
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

  const apiIngestUrl = `${window.location.origin}/api/ingest`;

  // Bookmarklet mendukung Multi-Page:
  // OK = Halaman 1 (Reset data lama & isi baru)
  // Cancel = Halaman 2, 3, dst. (Append / gabungkan ke data sebelumnya tanpa menghapus halaman 1)
  const bookmarkletCode = `javascript:(async()=>{const t=document.querySelector('table');if(!t)return alert('Tabel tidak ditemukan di halaman ini!');const h=[...t.querySelectorAll('thead th, tr:first-child th')].map(e=>e.innerText.replace(/\\s+/g,' ').trim().toUpperCase());const rows=[...t.querySelectorAll('tbody tr')].map(tr=>{const td=[...tr.querySelectorAll('td')];const o={};h.forEach((k,i)=>{if(k&&td[i])o[k]=td[i].innerText.replace(/\\s+/g,' ').trim()});return o}).filter(r=>r.INCIDENT&&r.INCIDENT.startsWith('INC'));if(!rows.length)return alert('Tidak ada baris tiket INC ditemukan.');const isFirst=confirm('Ditemukan '+rows.length+' tiket di halaman ini.\\n\\n• Klik OK = Kirim sebagai HALAMAN 1 (Hapus data lama & mulai baru)\\n• Klik Cancel = Kirim sebagai HALAMAN 2 / 3 / dst. (Gabungkan ke data sebelumnya)');try{const res=await fetch('${apiIngestUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({page:isFirst?1:2,mode:isFirst?'reset':'append',rows})});const j=await res.json();alert(j.message||j.error)}catch(e){alert('Gagal mengirim data: '+e.message)}})();`;

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const filteredData = incidents.filter((item) => {
    const q = search.toLowerCase();
    return (
      (item.incident || "").toLowerCase().includes(q) ||
      (item.workzone || "").toLowerCase().includes(q) ||
      (item.witel || "").toLowerCase().includes(q) ||
      (item.status || "").toLowerCase().includes(q) ||
      (item.service_no || "").toLowerCase().includes(q)
    );
  });

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "11.5px",
    color: "#1e293b",
    borderBottom: "2px solid #cbd5e1",
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    whiteSpace: "nowrap",
    fontSize: "12.5px",
    color: "#334155",
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "#0f172a" }}>
          Collect & Sinkronisasi Data Tiket
        </h1>
        <p style={{ color: "#64748b", fontSize: "13.5px", marginTop: "4px" }}>
          Penarikan data dari portal sumber ke database Cloudflare D1 (Mendukung Multi-Halaman / &gt;100 Tiket).
        </p>
      </div>

      {/* PANEL BOOKMARKLET */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "15px", fontWeight: 700, marginTop: 0, marginBottom: "10px" }}>
          1. Bookmarklet Penarik Data (Multi-Page Ready)
        </h2>
        <ol
          style={{
            margin: "0 0 14px 20px",
            padding: 0,
            fontSize: "13.5px",
            lineHeight: "1.6",
            color: "#334155",
          }}
        >
          <li>Klik tombol <strong>Copy Kode Bookmarklet</strong> di bawah.</li>
          <li>
            Buat atau edit bookmark di Bookmarks Bar Chrome (<code>Ctrl+Shift+B</code> / <code>Cmd+Shift+B</code> → klik kanan → <strong>Edit...</strong> / <strong>Add page...</strong>).
          </li>
          <li>Tempel kode baru pada kolom <strong>URL</strong>, beri nama <code>Kirim ke Dashboard KPI</code>, lalu simpan.</li>
          <li>
            Buka <strong>Halaman 1</strong> di portal tiket, klik bookmark lalu pilih <strong>OK (Halaman 1 / Reset)</strong>.
          </li>
          <li>
            Jika tiket lebih dari 100, pindah ke <strong>Halaman 2</strong> (dan seterusnya) di portal tiket, klik bookmark lagi lalu pilih <strong>Cancel (Gabungkan ke data sebelumnya)</strong>.
          </li>
        </ol>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            readOnly
            value={bookmarkletCode}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontFamily: "monospace",
              fontSize: "12px",
              background: "#f8fafc",
              color: "#475569",
            }}
          />
          <button
            type="button"
            onClick={handleCopyBookmarklet}
            style={{
              background: copied ? "#16a34a" : "#2563eb",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Tersalin!" : "Copy Kode Bookmarklet"}
          </button>
        </div>
      </div>

      {/* STATUS & VERIFIKASI DATA MENTAH DI DATABASE */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #cbd5e1",
          borderRadius: "10px",
          padding: "20px",
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
            <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
              2. Verifikasi Data Tersimpan di Database D1
            </h2>
            <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "4px" }}>
              Total Tersimpan: <strong style={{ color: "#2563eb" }}>{incidents.length} Tiket</strong> • Sinkronisasi Terakhir: <strong>{lastSyncWib}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Cari INCIDENT / WORKZONE / SERVICE NO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                width: "280px",
                fontSize: "12.5px",
              }}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                background: "#0f172a",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Memuat..." : "Cek & Refresh Data"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", maxHeight: "55vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
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
                <th style={thStyle}>CONTACT PHONE</th>
                <th style={thStyle}>CONTACT NAME</th>
                <th style={thStyle}>CUSTOMER TYPE</th>
                <th style={thStyle}>CUSTOMER NAME</th>
                <th style={thStyle}>SERVICE NO</th>
                <th style={thStyle}>SYMPTOM</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    Belum ada data tiket di database. Jalankan Bookmarklet dari portal sumber lalu klik Cek & Refresh Data.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr key={row.incident} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#1d4ed8" }}>{row.incident}</td>
                    <td style={tdStyle}>{row.reported_date || "-"}</td>
                    <td style={tdStyle}>{row.booking_date || "-"}</td>
                    <td style={tdStyle}>{row.service_type || "-"}</td>
                    <td style={tdStyle}>{row.witel || "-"}</td>
                    <td style={tdStyle}>{row.workzone || "-"}</td>
                    <td style={tdStyle}>{row.status || "-"}</td>
                    <td style={tdStyle}>{row.status_date || "-"}</td>
                    <td style={tdStyle}>{row.ticket_id_gamas || "-"}</td>
                    <td style={tdStyle}>{row.contact_phone || "-"}</td>
                    <td style={tdStyle}>{row.contact_name || "-"}</td>
                    <td style={tdStyle}>{row.customer_type || "-"}</td>
                    <td style={tdStyle}>{row.customer_name || "-"}</td>
                    <td style={tdStyle}>{row.service_no || "-"}</td>
                    <td style={{ ...tdStyle, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis" }} title={row.symptom}>
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
