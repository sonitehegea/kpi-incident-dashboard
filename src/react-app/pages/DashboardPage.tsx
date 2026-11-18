import { useState, useMemo } from "react";
import { Incident } from "../types";

interface DashboardPageProps {
  incidents: Incident[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  lastSyncWib: string;
}

export default function DashboardPage({
  incidents,
  loading,
  onRefresh,
  lastSyncWib,
}: DashboardPageProps) {
  const [search, setSearch] = useState("");
  const [filterWitel, setFilterWitel] = useState("ALL");
  const [filterWorkzone, setFilterWorkzone] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCustType, setFilterCustType] = useState("ALL");
  const [filterGamas, setFilterGamas] = useState("ALL");

  const resetFilters = () => {
    setSearch("");
    setFilterWitel("ALL");
    setFilterWorkzone("ALL");
    setFilterStatus("ALL");
    setFilterCustType("ALL");
    setFilterGamas("ALL");
  };

  const filterOptions = useMemo(() => {
    const witels = Array.from(new Set(incidents.map((i) => i.witel).filter(Boolean))).sort();
    const workzones = Array.from(new Set(incidents.map((i) => i.workzone).filter(Boolean))).sort();
    const statuses = Array.from(new Set(incidents.map((i) => i.status).filter(Boolean))).sort();
    const custTypes = Array.from(new Set(incidents.map((i) => i.customer_type).filter(Boolean))).sort();
    return { witels, workzones, statuses, custTypes };
  }, [incidents]);

  const filteredData = useMemo(() => {
    return incidents.filter((item) => {
      if (filterWitel !== "ALL" && item.witel !== filterWitel) return false;
      if (filterWorkzone !== "ALL" && item.workzone !== filterWorkzone) return false;
      if (filterStatus !== "ALL" && item.status !== filterStatus) return false;
      if (filterCustType !== "ALL" && item.customer_type !== filterCustType) return false;

      const hasGamas = Boolean(
        item.ticket_id_gamas && item.ticket_id_gamas.trim() !== "" && item.ticket_id_gamas !== "-"
      );
      if (filterGamas === "GAMAS" && !hasGamas) return false;
      if (filterGamas === "NON_GAMAS" && hasGamas) return false;

      if (search.trim() !== "") {
        const q = search.toLowerCase();
        const match =
          (item.incident || "").toLowerCase().includes(q) ||
          (item.workzone || "").toLowerCase().includes(q) ||
          (item.witel || "").toLowerCase().includes(q) ||
          (item.service_no || "").toLowerCase().includes(q) ||
          (item.customer_name || "").toLowerCase().includes(q) ||
          (item.contact_name || "").toLowerCase().includes(q) ||
          (item.ticket_id_gamas || "").toLowerCase().includes(q) ||
          (item.symptom || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [incidents, filterWitel, filterWorkzone, filterStatus, filterCustType, filterGamas, search]);

  const analytics = useMemo(() => {
    const total = filteredData.length;
    let gamasCount = 0;
    let hvcCount = 0;
    const byWorkzone: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byCustType: Record<string, number> = {};
    const byServiceType: Record<string, number> = {};
    const bySymptom: Record<string, number> = {};
    const byWitel: Record<string, number> = {};

    filteredData.forEach((row) => {
      const isGamas = Boolean(
        row.ticket_id_gamas && row.ticket_id_gamas.trim() !== "" && row.ticket_id_gamas !== "-"
      );
      if (isGamas) gamasCount++;

      const cType = (row.customer_type || "UNKNOWN").toUpperCase();
      if (cType.includes("HVC")) hvcCount++;

      const wz = row.workzone || "N/A";
      byWorkzone[wz] = (byWorkzone[wz] || 0) + 1;

      const st = row.status || "N/A";
      byStatus[st] = (byStatus[st] || 0) + 1;

      byCustType[cType] = (byCustType[cType] || 0) + 1;

      const srv = row.service_type || "N/A";
      byServiceType[srv] = (byServiceType[srv] || 0) + 1;

      const sym = row.symptom || "Tidak Ada Symptom";
      bySymptom[sym] = (bySymptom[sym] || 0) + 1;

      const wt = row.witel || "N/A";
      byWitel[wt] = (byWitel[wt] || 0) + 1;
    });

    const sortDesc = (obj: Record<string, number>) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]);

    return {
      total,
      gamasCount,
      nonGamasCount: total - gamasCount,
      hvcCount,
      regulerCount: total - hvcCount,
      workzoneList: sortDesc(byWorkzone),
      statusList: sortDesc(byStatus),
      custTypeList: sortDesc(byCustType),
      serviceTypeList: sortDesc(byServiceType),
      symptomList: sortDesc(bySymptom).slice(0, 6),
      witelList: sortDesc(byWitel),
    };
  }, [filteredData]);

  const handleExportCsv = () => {
    if (!filteredData.length) return;
    const headers = [
      "INCIDENT", "REPORTED DATE", "SERVICE TYPE", "WITEL", "WORKZONE",
      "STATUS", "STATUS DATE", "TICKET ID GAMAS", "CONTACT PHONE",
      "CONTACT NAME", "CUSTOMER TYPE", "CUSTOMER NAME", "SERVICE NO", "SYMPTOM",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredData.map((r) =>
        [
          r.incident, r.reported_date, r.service_type, r.witel, r.workzone,
          r.status, r.status_date, r.ticket_id_gamas, r.contact_phone,
          r.contact_name, r.customer_type, r.customer_name, r.service_no, r.symptom,
        ]
          .map((val) => `"${(val || "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Report_Incident_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "11.5px",
    color: "#1e293b",
    borderBottom: "2px solid #cbd5e1",
    textTransform: "uppercase",
  };

  const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    whiteSpace: "nowrap",
    fontSize: "12.5px",
    color: "#334155",
  };

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* HEADER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "#0f172a" }}>
            Incident Operations Reporting Dashboard
          </h1>
          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
            Last Sync: <strong style={{ color: "#334155" }}>{lastSyncWib}</strong> • Total Sumber Data: <strong style={{ color: "#2563eb" }}>{incidents.length} Tiket</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              background: "#16a34a",
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Export CSV ({filteredData.length})
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Memuat..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* 5 SUMMARY CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        <div style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Tiket Aktif</div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#0f172a", margin: "6px 0" }}>{analytics.total}</div>
          <div style={{ fontSize: "12px", color: "#475569" }}>
            {analytics.witelList.map(([w, c]) => `${w}: ${c}`).join(" | ") || "Belum ada data"}
          </div>
        </div>

        <div
          onClick={() => setFilterGamas(filterGamas === "GAMAS" ? "ALL" : "GAMAS")}
          style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: filterGamas === "GAMAS" ? "2px solid #dc2626" : "1px solid #e2e8f0", cursor: "pointer" }}
          title="Klik untuk filter Tiket Gamas"
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>Indikasi Gamas (Ticket ID)</div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#dc2626", margin: "6px 0" }}>{analytics.gamasCount}</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Non-Gamas: <strong>{analytics.nonGamasCount}</strong> ({analytics.total ? Math.round((analytics.gamasCount / analytics.total) * 100) : 0}% Gamas)
          </div>
        </div>

        <div style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#d97706", textTransform: "uppercase" }}>Segmen HVC</div>
          <div style={{ fontSize: "30px", fontWeight: 800, color: "#d97706", margin: "6px 0" }}>{analytics.hvcCount}</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            Reguler / Lainnya: <strong>{analytics.regulerCount}</strong>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>Distribusi Status</div>
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {analytics.statusList.slice(0, 3).map(([st, count]) => (
              <div key={st} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
                <span style={{ fontWeight: 600, color: "#334155" }}>{st}</span>
                <span style={{ fontWeight: 700, color: "#2563eb" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>Service Type</div>
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {analytics.serviceTypeList.slice(0, 3).map(([srv, count]) => (
              <div key={srv} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
                <span style={{ fontWeight: 600, color: "#334155" }}>{srv}</span>
                <span style={{ fontWeight: 700, color: "#059669" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* VISUAL BREAKDOWN PANELS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        {/* PANEL 1: SEBARAN PER WORKZONE */}
        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>Sebaran Tiket per Workzone (STO)</h2>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Klik baris untuk filter</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "230px", overflowY: "auto" }}>
            {analytics.workzoneList.map(([wz, count]) => {
              const pct = analytics.total ? Math.round((count / analytics.total) * 100) : 0;
              const isSelected = filterWorkzone === wz;
              return (
                <div
                  key={wz}
                  onClick={() => setFilterWorkzone(isSelected ? "ALL" : wz)}
                  style={{ cursor: "pointer", padding: "4px 6px", borderRadius: "6px", background: isSelected ? "#eff6ff" : "transparent" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "3px" }}>
                    <span style={{ fontWeight: 700, color: isSelected ? "#1d4ed8" : "#1e293b" }}>{wz}</span>
                    <span style={{ color: "#475569", fontWeight: 600 }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: isSelected ? "#1d4ed8" : "#3b82f6", borderRadius: "99px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL 2: CUSTOMER TYPE BREAKDOWN */}
        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "14px", fontWeight: 700, margin: 0 }}>Breakdown Customer Type</h2>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Klik baris untuk filter</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "230px", overflowY: "auto" }}>
            {analytics.custTypeList.map(([ct, count]) => {
              const pct = analytics.total ? Math.round((count / analytics.total) * 100) : 0;
              const isSelected = filterCustType === ct;
              const barColor = ct.includes("PLATINUM") || ct.includes("DIAMOND") ? "#7c3aed" : ct.includes("GOLD") ? "#d97706" : "#0ea5e9";
              return (
                <div
                  key={ct}
                  onClick={() => setFilterCustType(isSelected ? "ALL" : ct)}
                  style={{ cursor: "pointer", padding: "4px 6px", borderRadius: "6px", background: isSelected ? "#f8fafc" : "transparent" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", marginBottom: "3px" }}>
                    <span style={{ fontWeight: 700, color: "#1e293b" }}>{ct}</span>
                    <span style={{ color: "#475569", fontWeight: 600 }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: "99px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL 3: TOP SYMPTOM GANGGUAN */}
        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 12px 0" }}>Top Symptom Gangguan</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "230px", overflowY: "auto" }}>
            {analytics.symptomList.map(([sym, count]) => {
              const pct = analytics.total ? Math.round((count / analytics.total) * 100) : 0;
              return (
                <div key={sym} style={{ padding: "4px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px", gap: "8px" }}>
                    <span style={{ fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sym}>
                      {sym}
                    </span>
                    <span style={{ color: "#475569", fontWeight: 700, whiteSpace: "nowrap" }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#6366f1", borderRadius: "99px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FILTER BAR & TABEL DETAIL 14 KOLOM */}
      <div style={{ background: "#fff", padding: "16px 18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <select value={filterWitel} onChange={(e) => setFilterWitel(e.target.value)} style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}>
              <option value="ALL">Semua Witel</option>
              {filterOptions.witels.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>

            <select value={filterWorkzone} onChange={(e) => setFilterWorkzone(e.target.value)} style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}>
              <option value="ALL">Semua Workzone</option>
              {filterOptions.workzones.map((wz) => <option key={wz} value={wz}>{wz}</option>)}
            </select>

            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}>
              <option value="ALL">Semua Status</option>
              {filterOptions.statuses.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>

            <select value={filterCustType} onChange={(e) => setFilterCustType(e.target.value)} style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}>
              <option value="ALL">Semua Customer Type</option>
              {filterOptions.custTypes.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
            </select>

            <select value={filterGamas} onChange={(e) => setFilterGamas(e.target.value)} style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}>
              <option value="ALL">Semua Gamas / Non-Gamas</option>
              <option value="GAMAS">Hanya Tiket Gamas</option>
              <option value="NON_GAMAS">Non-Gamas</option>
            </select>

            {(filterWitel !== "ALL" || filterWorkzone !== "ALL" || filterStatus !== "ALL" || filterCustType !== "ALL" || filterGamas !== "ALL" || search !== "") && (
              <button
                type="button"
                onClick={resetFilters}
                style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "7px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                Reset Filter
              </button>
            )}
          </div>

          <input
            type="text"
            placeholder="Cari INCIDENT / SERVICE NO / CUSTOMER / SYMPTOM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "310px", fontSize: "12.5px" }}
          />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", maxHeight: "62vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
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
                  <td colSpan={14} style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13.5px" }}>
                    Tidak ada data tiket yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr key={row.incident} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#1d4ed8" }}>{row.incident}</td>
                    <td style={tdStyle}>{row.reported_date || "-"}</td>
                    <td style={tdStyle}>{row.service_type || "-"}</td>
                    <td style={tdStyle}>{row.witel || "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.workzone || "-"}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "99px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: row.status === "BACKEND" ? "#dbeafe" : row.status === "DRAFT" ? "#fef3c7" : "#f1f5f9",
                        color: row.status === "BACKEND" ? "#1e40af" : row.status === "DRAFT" ? "#92400e" : "#334155",
                      }}>
                        {row.status || "-"}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.status_date || "-"}</td>
                    <td style={{ ...tdStyle, color: row.ticket_id_gamas ? "#dc2626" : "#64748b", fontWeight: row.ticket_id_gamas ? 600 : 400 }}>
                      {row.ticket_id_gamas || "-"}
                    </td>
                    <td style={tdStyle}>{row.contact_phone || "-"}</td>
                    <td style={tdStyle}>{row.contact_name || "-"}</td>
                    <td style={tdStyle}>{row.customer_type || "-"}</td>
                    <td style={tdStyle}>{row.customer_name || "-"}</td>
                    <td style={tdStyle}>{row.service_no || "-"}</td>
                    <td style={{ ...tdStyle, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }} title={row.symptom}>
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
