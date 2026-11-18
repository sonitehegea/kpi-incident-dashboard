import { useState, useEffect } from "react";

interface Incident {
  incident: string;
  reported_date: string;
  service_type: string;
  witel: string;
  workzone: string;
  status: string;
  status_date: string;
  ticket_id_gamas: string;
  contact_phone: string;
  contact_name: string;
  customer_type: string;
  customer_name: string;
  service_no: string;
  symptom: string;
  synced_at: string;
}

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

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

  const filteredData = incidents.filter((item) => {
    const q = search.toLowerCase();
    return (
      (item.incident || "").toLowerCase().includes(q) ||
      (item.witel || "").toLowerCase().includes(q) ||
      (item.workzone || "").toLowerCase().includes(q) ||
      (item.status || "").toLowerCase().includes(q) ||
      (item.service_no || "").toLowerCase().includes(q) ||
      (item.customer_name || "").toLowerCase().includes(q) ||
      (item.ticket_id_gamas || "").toLowerCase().includes(q)
    );
  });

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "12px",
    color: "#1e293b",
    borderBottom: "2px solid #cbd5e1",
  };

  const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    whiteSpace: "nowrap",
    fontSize: "12.5px",
    color: "#334155",
  };

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", padding: "24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "6px" }}>
        Dashboard Performansi & Sync Tiket Incident
      </h1>
      <p style={{ color: "#555", marginBottom: "20px", fontSize: "14px" }}>
        Sinkronisasi otomatis 14 kolom utama tiket langsung dari browser aktif ke database Cloudflare D1.
      </p>

      {/* PANEL BOOKMARKLET */}
      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "8px" }}>
          Bookmarklet Penarik Data (Gunakan bookmark yang sudah terpasang, atau salin ulang jika perlu)
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            readOnly
            value={bookmarkletCode}
            style={{
              flex: 1,
              padding: "8px 12px",
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
              padding: "9px 16px",
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

      {/* BARIS KONTROL TABEL */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>
            Menampilkan:{" "}
            <span style={{ color: "#2563eb" }}>
              {filteredData.length} dari {incidents.length} Tiket
            </span>
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
          placeholder="Cari INCIDENT / WORKZONE / SERVICE NO / CUSTOMER / GAMAS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #cbd5e1",
            width: "380px",
            fontSize: "13px",
          }}
        />
      </div>

      {/* TABEL 14 KOLOM */}
      <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", maxHeight: "70vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead style={{ background: "#f1f5f9", position: "sticky", top: 0, zIndex: 1 }}>
            <tr>
              <th style={thStyle}>INCIDENT</th>
              <th style={thStyle}>REPORTED DATE</th>
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
                <td colSpan={14} style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                  Belum ada data tiket. Klik Bookmarklet di portal tiket lalu tekan Refresh Data.
                </td>
              </tr>
            ) : (
              filteredData.map((row) => (
                <tr key={row.incident} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#1d4ed8" }}>{row.incident}</td>
                  <td style={tdStyle}>{row.reported_date || "-"}</td>
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
                  <td style={{ ...tdStyle, maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis" }} title={row.symptom}>
                    {row.symptom || "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
