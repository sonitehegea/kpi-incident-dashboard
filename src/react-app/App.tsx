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
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  // Otomatis membangun script Bookmarklet sesuai URL live domain ini
  const apiIngestUrl = `${window.location.origin}/api/ingest`;
  const bookmarkletCode = `javascript:(async()=>{const t=document.querySelector('table');if(!t)return alert('Tabel tidak ditemukan di halaman ini!');const h=[...t.querySelectorAll('thead th, tr:first-child th')].map(e=>e.innerText.replace(/\\s+/g,' ').trim().toUpperCase());const rows=[...t.querySelectorAll('tbody tr')].map(tr=>{const td=[...tr.querySelectorAll('td')];const o={};h.forEach((k,i)=>{if(k&&td[i])o[k]=td[i].innerText.replace(/\\s+/g,' ').trim()});return o}).filter(r=>r.INCIDENT&&r.INCIDENT.startsWith('INC'));if(!rows.length)return alert('Tidak ada baris tiket INC ditemukan.');try{const res=await fetch('${apiIngestUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})});const j=await res.json();alert(j.message||j.error)}catch(e){alert('Gagal mengirim data: '+e.message)}})();`;

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

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const filteredData = incidents.filter(
    (item) =>
      item.incident.toLowerCase().includes(search.toLowerCase()) ||
      (item.workzone || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.witel || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.status || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.technician || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
        Dashboard Performansi & Sync Tiket Incident
      </h1>
      <p style={{ color: "#555", marginBottom: "24px" }}>
        Sinkronisasi otomatis tabel tiket langsung dari browser aktif ke database Cloudflare D1 tanpa copy-paste Excel.
      </p>

      {/* PANEL PANDUAN & GENERATOR BOOKMARKLET 1-KLIK */}
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginTop: 0, marginBottom: "10px" }}>
          Pengaturan Bookmarklet Penarik Data (Cukup Setup 1 Kali)
        </h2>
        <ol style={{ margin: "0 0 14px 20px", padding: 0, fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
          <li>Klik tombol <strong>Copy Kode Bookmarklet</strong> di bawah ini.</li>
          <li>Munculkan Bookmarks Bar di Chrome (<code>Ctrl + Shift + B</code> atau <code>Cmd + Shift + B</code>).</li>
          <li>Klik kanan pada Bookmarks Bar → pilih <strong>Add page...</strong> (Tambah halaman).</li>
          <li>Isi Name: <code>Kirim ke Dashboard KPI</code>, lalu tempel kode yang sudah di-copy ke kolom <strong>URL</strong> → klik Save.</li>
          <li>Buka portal tiket yang sudah login, lalu klik bookmark tersebut untuk mengirim 100 baris tabel ke database ini.</li>
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
              background: "#fff",
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
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {copied ? "Tersalin!" : "Copy Kode Bookmarklet"}
          </button>
        </div>
      </div>

      {/* BARIS KONTROL TABEL & REFRESH */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 600 }}>
            Total Data di Database: <span style={{ color: "#2563eb" }}>{incidents.length} Tiket</span>
          </span>
          <button
            type="button"
            onClick={fetchIncidents}
            disabled={loading}
            style={{
              background: "#0f172a",
              color: "#fff",
              border: "none",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Memuat..." : "Refresh Data"}
          </button>
        </div>

        <input
          type="text"
          placeholder="Cari INCIDENT / WITEL / WORKZONE / STATUS / TEKNISI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            width: "350px",
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
                  Belum ada data tiket di database. Gunakan Bookmarklet di portal tiket lalu klik Refresh Data.
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
