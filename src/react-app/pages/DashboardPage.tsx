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

  // Judul Tanggal Hari Ini (Format Indonesia)
  const todayTitle = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, []);

  // Kalkulasi Global untuk 5 Kartu Atas
  const globalStats = useMemo(() => {
    const total = incidents.length;
    let jakutCount = 0;
    let jakbarCount = 0;
    let otherWitelCount = 0;
    let gamasCount = 0;
    let hvcCount = 0;

    const bySegment: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byService: Record<string, number> = {};

    incidents.forEach((row) => {
      const wt = (row.witel || "").toUpperCase();
      if (wt.includes("JAKUT")) jakutCount++;
      else if (wt.includes("JAKBAR")) jakbarCount++;
      else otherWitelCount++;

      const isGamas = Boolean(
        row.ticket_id_gamas &&
          row.ticket_id_gamas.trim() !== "" &&
          row.ticket_id_gamas !== "-"
      );
      if (isGamas) gamasCount++;

      const seg = (row.customer_type || "UNKNOWN").toUpperCase();
      if (seg.includes("HVC")) hvcCount++;
      bySegment[seg] = (bySegment[seg] || 0) + 1;

      const st = (row.status || "UNKNOWN").toUpperCase();
      byStatus[st] = (byStatus[st] || 0) + 1;

      const srv = (row.service_type || "UNKNOWN").toUpperCase();
      byService[srv] = (byService[srv] || 0) + 1;
    });

    const sortDesc = (obj: Record<string, number>) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]);

    return {
      total,
      jakutCount,
      jakbarCount,
      otherWitelCount,
      gamasCount,
      nonGamasCount: total - gamasCount,
      hvcCount,
      segmentList: sortDesc(bySegment),
      statusList: sortDesc(byStatus),
      serviceList: sortDesc(byService),
    };
  }, [incidents]);

  // Daftar urutan kolom Segmen untuk Tabel Matriks
  const matrixSegments = useMemo(() => {
    const preferredOrder = [
      "HVC_DIAMOND",
      "HVC_PLATINUM",
      "HVC_GOLD",
      "HVC_SILVER",
      "REGULER",
    ];
    const found = Array.from(
      new Set(incidents.map((i) => (i.customer_type || "UNKNOWN").toUpperCase()))
    );
    return found.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [incidents]);

  // Helper pembentuk data Matriks Workzone x Segmen per Witel
  const buildWitelMatrix = (witelKeyword: string) => {
    const rows = incidents.filter((i) =>
      (i.witel || "").toUpperCase().includes(witelKeyword)
    );
    const wzMap: Record<string, Record<string, number>> = {};
    const colTotals: Record<string, number> = {};
    matrixSegments.forEach((s) => (colTotals[s] = 0));

    rows.forEach((r) => {
      const wz = (r.workzone || "N/A").toUpperCase();
      const seg = (r.customer_type || "UNKNOWN").toUpperCase();
      if (!wzMap[wz]) {
        wzMap[wz] = {};
        matrixSegments.forEach((s) => (wzMap[wz][s] = 0));
      }
      wzMap[wz][seg] = (wzMap[wz][seg] || 0) + 1;
      colTotals[seg] = (colTotals[seg] || 0) + 1;
    });

    const sortedWorkzones = Object.entries(wzMap)
      .map(([wz, counts]) => {
        const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
        return { workzone: wz, counts, rowTotal };
      })
      .sort((a, b) => b.rowTotal - a.rowTotal);

    return {
      totalTickets: rows.length,
      workzones: sortedWorkzones,
      colTotals,
    };
  };

  const jakutMatrix = useMemo(
    () => buildWitelMatrix("JAKUT"),
    [incidents, matrixSegments]
  );
  const jakbarMatrix = useMemo(
    () => buildWitelMatrix("JAKBAR"),
    [incidents, matrixSegments]
  );

  // Filter untuk Tabel Detail Bawah
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
        item.ticket_id_gamas &&
          item.ticket_id_gamas.trim() !== "" &&
          item.ticket_id_gamas !== "-"
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
    link.setAttribute("download", `Laporan_Gangguan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Donut Chart SVG Calculation (Jakut vs Jakbar)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const jakutPct = globalStats.total ? globalStats.jakutCount / globalStats.total : 0;
  const jakbarPct = globalStats.total ? globalStats.jakbarCount / globalStats.total : 0;
  const jakutStroke = jakutPct * circumference;
  const jakbarStroke = jakbarPct * circumference;

  // Component Reusable untuk Tabel Matriks per Witel (Tema Terang)
  const renderMatrixCard = (
    title: string,
    witelCode: string,
    matrix: ReturnType<typeof buildWitelMatrix>
  ) => (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "10px",
        border: "1px solid #cbd5e1",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
      }}
    >
      {/* Header Biru Solid seperti sebelumnya */}
      <div
        style={{
          background: "#2563eb",
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#ffffff", letterSpacing: "0.3px" }}>
          {title}
        </span>
        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#dbeafe" }}>
          {matrix.totalTickets} Tiket
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #cbd5e1", background: "#f8fafc" }}>
              <th style={{ padding: "10px 14px", fontSize: "11.5px", fontWeight: 700, color: "#334155" }}>
                NO
              </th>
              <th style={{ padding: "10px 14px", fontSize: "11.5px", fontWeight: 700, color: "#334155" }}>
                WORKZONE
              </th>
              {matrixSegments.map((seg) => (
                <th
                  key={seg}
                  style={{
                    padding: "10px 12px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    color: "#334155",
                    textAlign: "center",
                  }}
                >
                  {seg}
                </th>
              ))}
              <th
                style={{
                  padding: "10px 14px",
                  fontSize: "11.5px",
                  fontWeight: 800,
                  color: "#1d4ed8",
                  textAlign: "center",
                }}
              >
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.workzones.length === 0 ? (
              <tr>
                <td
                  colSpan={matrixSegments.length + 3}
                  style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}
                >
                  Tidak ada data tiket untuk {witelCode}.
                </td>
              </tr>
            ) : (
              <>
                {matrix.workzones.map((row, idx) => {
                  const isSelected = filterWorkzone === row.workzone;
                  return (
                    <tr
                      key={row.workzone}
                      onClick={() => {
                        setFilterWitel(witelCode);
                        setFilterWorkzone(isSelected ? "ALL" : row.workzone);
                      }}
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        cursor: "pointer",
                      }}
                      title="Klik untuk memfilter tabel detail berdasarkan Workzone ini"
                    >
                      <td style={{ padding: "10px 14px", fontSize: "12.5px", fontWeight: 600, color: "#64748b" }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                        {row.workzone}
                      </td>
                      {matrixSegments.map((seg) => {
                        const val = row.counts[seg] || 0;
                        return (
                          <td
                            key={seg}
                            style={{
                              padding: "10px 12px",
                              fontSize: "13px",
                              textAlign: "center",
                              fontWeight: val > 0 ? 700 : 400,
                              color: val > 0 ? "#1e293b" : "#94a3b8",
                            }}
                          >
                            {val}
                          </td>
                        );
                      })}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span
                          style={{
                            background: "#dbeafe",
                            border: "1px solid #93c5fd",
                            color: "#1d4ed8",
                            fontWeight: 800,
                            fontSize: "12.5px",
                            padding: "2px 11px",
                            borderRadius: "99px",
                            display: "inline-block",
                          }}
                        >
                          {row.rowTotal}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* BARIS GRAND TOTAL */}
                <tr style={{ background: "#f1f5f9", borderTop: "2px solid #cbd5e1" }}>
                  <td colSpan={2} style={{ padding: "11px 14px", fontSize: "12.5px", fontWeight: 800, color: "#0f172a" }}>
                    GRAND TOTAL {witelCode}
                  </td>
                  {matrixSegments.map((seg) => (
                    <td
                      key={seg}
                      style={{
                        padding: "11px 12px",
                        fontSize: "13px",
                        fontWeight: 800,
                        color: "#0f172a",
                        textAlign: "center",
                      }}
                    >
                      {matrix.colTotals[seg] || 0}
                    </td>
                  ))}
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    <span
                      style={{
                        background: "#dcfce7",
                        border: "1px solid #86efac",
                        color: "#15803d",
                        fontWeight: 800,
                        fontSize: "13px",
                        padding: "2px 13px",
                        borderRadius: "99px",
                        display: "inline-block",
                      }}
                    >
                      {matrix.totalTickets}
                    </span>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

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
      {/* HEADER BAR (TEMA TERANG BERSIH) */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "21px", fontWeight: 800, color: "#0f172a" }}>
            Monitoring Gangguan Branch Northern Jakarta – {todayTitle}
          </h1>
          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
            Last Sync: <strong style={{ color: "#334155" }}>{lastSyncWib}</strong> • Total Sumber Data:{" "}
            <strong style={{ color: "#2563eb" }}>{incidents.length} Tiket</strong>
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

      {/* GRID 5 KARTU RINGKASAN PALING ATAS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "22px",
        }}
      >
        {/* KARTU 1: TOTAL TIKET AKTIF + DONUT CHART */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
            TOTAL TIKET AKTIF
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "10px 0" }}>
            <svg width="104" height="104" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="11" />
              {globalStats.total > 0 && (
                <>
                  {/* Segmen JAKUT (Hijau) */}
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke="#16a34a"
                    strokeWidth="11"
                    strokeDasharray={`${jakutStroke} ${circumference}`}
                    transform="rotate(-90 50 50)"
                  />
                  {/* Segmen JAKBAR (Biru) */}
                  <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke="#2563eb"
                    strokeWidth="11"
                    strokeDasharray={`${jakbarStroke} ${circumference}`}
                    strokeDashoffset={-jakutStroke}
                    transform="rotate(-90 50 50)"
                  />
                </>
              )}
              <text x="50" y="48" textAnchor="middle" fill="#0f172a" fontSize="19" fontWeight="800">
                {globalStats.total}
              </text>
              <text x="50" y="61" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
                OPEN TIKET
              </text>
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              onClick={() => setFilterWitel(filterWitel === "JAKUT" ? "ALL" : "JAKUT")}
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "6px",
                padding: "5px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#15803d", fontWeight: 600 }}>Witel JAKUT</span>
              <span style={{ color: "#14532d", fontWeight: 800 }}>{globalStats.jakutCount}</span>
            </div>
            <div
              onClick={() => setFilterWitel(filterWitel === "JAKBAR" ? "ALL" : "JAKBAR")}
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: "6px",
                padding: "5px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#1d4ed8", fontWeight: 600 }}>Witel JAKBAR</span>
              <span style={{ color: "#1e3a8a", fontWeight: 800 }}>{globalStats.jakbarCount}</span>
            </div>
          </div>
        </div>

        {/* KARTU 2: INDIKASI GAMAS (HEADER MERAH) */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ background: "#dc2626", padding: "9px 14px", textAlign: "center", fontWeight: 700, fontSize: "12.5px", color: "#fff" }}>
            INDIKASI GAMAS (TICKET ID)
          </div>
          <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{globalStats.total} Total Tiket</div>
            <div style={{ textAlign: "center", fontSize: "30px", fontWeight: 800, color: "#dc2626", margin: "8px 0" }}>
              {globalStats.gamasCount}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                onClick={() => setFilterGamas(filterGamas === "GAMAS" ? "ALL" : "GAMAS")}
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "#b91c1c", fontWeight: 600 }}>Tiket Gamas</span>
                <span style={{ color: "#7f1d1d", fontWeight: 800 }}>{globalStats.gamasCount}</span>
              </div>
              <div
                onClick={() => setFilterGamas(filterGamas === "NON_GAMAS" ? "ALL" : "NON_GAMAS")}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  padding: "5px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "#475569", fontWeight: 600 }}>Non-Gamas</span>
                <span style={{ color: "#0f172a", fontWeight: 800 }}>{globalStats.nonGamasCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* KARTU 3: SEGMEN (HEADER KUNING/AMBER) */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ background: "#d97706", padding: "9px 14px", textAlign: "center", fontWeight: 700, fontSize: "12.5px", color: "#fff" }}>
            SEGMEN
          </div>
          <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11.5px", color: "#64748b" }}>HVC: {globalStats.hvcCount} Tiket</div>
            <div style={{ textAlign: "center", fontSize: "30px", fontWeight: 800, color: "#d97706", margin: "8px 0" }}>
              {globalStats.total ? `${Math.round((globalStats.hvcCount / globalStats.total) * 100)}%` : "0%"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "96px", overflowY: "auto" }}>
              {globalStats.segmentList.map(([seg, count]) => (
                <div
                  key={seg}
                  onClick={() => setFilterCustType(filterCustType === seg ? "ALL" : seg)}
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#b45309", fontWeight: 600 }}>{seg}</span>
                  <span style={{ color: "#78350f", fontWeight: 800 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KARTU 4: STATUS TIKET (HEADER BIRU) */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ background: "#2563eb", padding: "9px 14px", textAlign: "center", fontWeight: 700, fontSize: "12.5px", color: "#fff" }}>
            STATUS TIKET
          </div>
          <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{globalStats.statusList.length} Kategori Status</div>
            <div style={{ textAlign: "center", fontSize: "30px", fontWeight: 800, color: "#2563eb", margin: "8px 0" }}>
              {globalStats.statusList[0]?.[1] || 0}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "96px", overflowY: "auto" }}>
              {globalStats.statusList.map(([st, count]) => (
                <div
                  key={st}
                  onClick={() => setFilterStatus(filterStatus === st ? "ALL" : st)}
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: "#1d4ed8", fontWeight: 600 }}>{st}</span>
                  <span style={{ color: "#1e3a8a", fontWeight: 800 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* KARTU 5: SERVICE TYPE (HEADER HIJAU) */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ background: "#059669", padding: "9px 14px", textAlign: "center", fontWeight: 700, fontSize: "12.5px", color: "#fff" }}>
            SERVICE TYPE
          </div>
          <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{globalStats.serviceList.length} Jenis Layanan</div>
            <div style={{ textAlign: "center", fontSize: "30px", fontWeight: 800, color: "#059669", margin: "8px 0" }}>
              {globalStats.serviceList[0]?.[1] || 0}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "96px", overflowY: "auto" }}>
              {globalStats.serviceList.map(([srv, count]) => (
                <div
                  key={srv}
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11.5px",
                  }}
                >
                  <span style={{ color: "#047857", fontWeight: 600 }}>{srv}</span>
                  <span style={{ color: "#064e3b", fontWeight: 800 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2 TABEL REKAP MATRIKS PER WITEL: WORKZONE X SEGMEN */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))",
          gap: "18px",
          marginBottom: "24px",
        }}
      >
        {renderMatrixCard("REKAP TIKET WITEL JAKUT (WORKZONE × SEGMEN)", "JAKUT", jakutMatrix)}
        {renderMatrixCard("REKAP TIKET WITEL JAKBAR (WORKZONE × SEGMEN)", "JAKBAR", jakbarMatrix)}
      </div>

      {/* TABEL DETAIL 14 KOLOM (DRILL-DOWN) */}
      <div
        style={{
          background: "#ffffff",
          padding: "16px 18px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a", marginRight: "4px" }}>
              DETAIL TIKET ({filteredData.length})
            </span>

            <select
              value={filterWitel}
              onChange={(e) => setFilterWitel(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            >
              <option value="ALL">Semua Witel</option>
              {filterOptions.witels.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <select
              value={filterWorkzone}
              onChange={(e) => setFilterWorkzone(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            >
              <option value="ALL">Semua Workzone</option>
              {filterOptions.workzones.map((wz) => (
                <option key={wz} value={wz}>{wz}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            >
              <option value="ALL">Semua Status</option>
              {filterOptions.statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <select
              value={filterCustType}
              onChange={(e) => setFilterCustType(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            >
              <option value="ALL">Semua Segmen</option>
              {filterOptions.custTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>

            <select
              value={filterGamas}
              onChange={(e) => setFilterGamas(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            >
              <option value="ALL">Semua Gamas</option>
              <option value="GAMAS">Hanya Tiket Gamas</option>
              <option value="NON_GAMAS">Non-Gamas</option>
            </select>

            {(filterWitel !== "ALL" ||
              filterWorkzone !== "ALL" ||
              filterStatus !== "ALL" ||
              filterCustType !== "ALL" ||
              filterGamas !== "ALL" ||
              search !== "") && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  background: "#fee2e2",
                  color: "#b91c1c",
                  border: "none",
                  padding: "7px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
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
            style={{ padding: "7px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "300px", fontSize: "12.5px" }}
          />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", maxHeight: "58vh" }}>
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
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "99px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background: row.status === "BACKEND" ? "#dbeafe" : row.status === "DRAFT" ? "#fef3c7" : "#f1f5f9",
                          color: row.status === "BACKEND" ? "#1e40af" : row.status === "DRAFT" ? "#92400e" : "#334155",
                        }}
                      >
                        {row.status || "-"}
                      </span>
                    </td>
                    <td style={tdStyle}>{row.status_date || "-"}</td>
                    <td
                      style={{
                        ...tdStyle,
                        color: row.ticket_id_gamas && row.ticket_id_gamas !== "-" ? "#dc2626" : "#64748b",
                        fontWeight: row.ticket_id_gamas && row.ticket_id_gamas !== "-" ? 700 : 400,
                      }}
                    >
                      {row.ticket_id_gamas || "-"}
                    </td>
                    <td style={tdStyle}>{row.contact_phone || "-"}</td>
                    <td style={tdStyle}>{row.contact_name || "-"}</td>
                    <td style={tdStyle}>{row.customer_type || "-"}</td>
                    <td style={tdStyle}>{row.customer_name || "-"}</td>
                    <td style={tdStyle}>{row.service_no || "-"}</td>
                    <td
                      style={{ ...tdStyle, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}
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
