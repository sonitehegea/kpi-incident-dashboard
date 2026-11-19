import { useState, useMemo } from "react";
import { Incident } from "../types";

interface DashboardPageProps {
  incidents: Incident[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  lastSyncWib: string;
}

const BAKU_WZ_JAKUT = [
  "CIL",
  "MRD",
  "KLG",
  "KTX",
  "KTZ",
  "MKR",
  "PDM",
  "STR",
  "TPR",
];

const BAKU_WZ_JAKBAR = [
  "CKG",
  "TGA",
  "KPK",
  "JIA",
  "KSB",
  "PLM",
  "KDY",
  "MRY",
  "SLP",
  "SMI",
  "DTG",
  "SDM",
];

const BAKU_SEGMEN = [
  "HVC_DIAMOND",
  "HVC_PLATINUM",
  "HVC_GOLD",
  "REGULER",
];

const CARD_SEGMEN_ORDER = [
  "HVC_GOLD",
  "HVC_PLATINUM",
  "HVC_DIAMOND",
  "REGULER",
];

const CARD_STATUS_ORDER = ["BACKEND", "ANALYSIS", "DRAFT"];
const CARD_SERVICE_ORDER = ["INTERNET", "VOICE", "IPTV", "UNKNOWN"];
const CARD_MANJA_ORDER = ["MANJA HI", "MANJA H++", "NON MANJA", "MANJA EXP"];

type ManjaCategory = "MANJA HI" | "MANJA H++" | "NON MANJA" | "MANJA EXP";

// Klasifikasi Status Manja dari kolom BOOKING DATE (WIB)
function classifyStatusManja(bookingDateRaw?: string): ManjaCategory {
  const raw = (bookingDateRaw || "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "null") {
    return "NON MANJA";
  }

  const now = new Date();
  const todayWibStr = now.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

  let parsedDate: Date | null = null;
  let bookingDateOnlyStr = "";

  const isoMatch = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  const dmyMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );

  if (isoMatch) {
    const [, y, m, d, hh = "23", mm = "59", ss = "59"] = isoMatch;
    const padM = m.padStart(2, "0");
    const padD = d.padStart(2, "0");
    bookingDateOnlyStr = `${y}-${padM}-${padD}`;
    parsedDate = new Date(
      `${y}-${padM}-${padD}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}+07:00`
    );
  } else if (dmyMatch) {
    const [, d, m, y, hh = "23", mm = "59", ss = "59"] = dmyMatch;
    const padM = m.padStart(2, "0");
    const padD = d.padStart(2, "0");
    bookingDateOnlyStr = `${y}-${padM}-${padD}`;
    parsedDate = new Date(
      `${y}-${padM}-${padD}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${ss.padStart(2, "0")}+07:00`
    );
  } else {
    const fallback = new Date(raw);
    if (!isNaN(fallback.getTime())) {
      parsedDate = fallback;
      bookingDateOnlyStr = fallback.toLocaleDateString("en-CA", {
        timeZone: "Asia/Jakarta",
      });
    }
  }

  if (!parsedDate || isNaN(parsedDate.getTime()) || !bookingDateOnlyStr) {
    return "NON MANJA";
  }

  if (bookingDateOnlyStr > todayWibStr) {
    return "MANJA H++";
  }

  if (bookingDateOnlyStr < todayWibStr) {
    return "MANJA EXP";
  }

  if (parsedDate.getTime() < now.getTime()) {
    return "MANJA EXP";
  }

  return "MANJA HI";
}

interface PillRowItem {
  label: string;
  jakbar: number;
  jakut: number;
  total: number;
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
  const [filterManja, setFilterManja] = useState("ALL");

  const hasActiveFilter =
    filterWitel !== "ALL" ||
    filterWorkzone !== "ALL" ||
    filterStatus !== "ALL" ||
    filterCustType !== "ALL" ||
    filterGamas !== "ALL" ||
    filterManja !== "ALL" ||
    search.trim() !== "";

  const resetFilters = () => {
    setSearch("");
    setFilterWitel("ALL");
    setFilterWorkzone("ALL");
    setFilterStatus("ALL");
    setFilterCustType("ALL");
    setFilterGamas("ALL");
    setFilterManja("ALL");
  };

  const todayTitle = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, []);

  // Kalkulasi Global untuk 6 Kartu Atas
  const globalStats = useMemo(() => {
    const total = incidents.length;
    let jakutCount = 0;
    let jakbarCount = 0;
    let gamasTotal = 0;
    let hvcTotal = 0;
    let regTotal = 0;

    const gamasMap: Record<string, { jakbar: number; jakut: number }> = {
      "Tiket Gamas": { jakbar: 0, jakut: 0 },
      "Non-Gamas": { jakbar: 0, jakut: 0 },
    };

    const segMap: Record<string, { jakbar: number; jakut: number }> = {};
    CARD_SEGMEN_ORDER.forEach((k) => (segMap[k] = { jakbar: 0, jakut: 0 }));

    const statusMap: Record<string, { jakbar: number; jakut: number }> = {};
    CARD_STATUS_ORDER.forEach((k) => (statusMap[k] = { jakbar: 0, jakut: 0 }));

    const serviceMap: Record<string, { jakbar: number; jakut: number }> = {};
    CARD_SERVICE_ORDER.forEach((k) => (serviceMap[k] = { jakbar: 0, jakut: 0 }));

    const manjaMap: Record<string, { jakbar: number; jakut: number }> = {};
    CARD_MANJA_ORDER.forEach((k) => (manjaMap[k] = { jakbar: 0, jakut: 0 }));

    incidents.forEach((row) => {
      const wt = (row.witel || "").toUpperCase();
      const isJakbar = wt.includes("JAKBAR");
      const isJakut = wt.includes("JAKUT");

      if (isJakut) jakutCount++;
      if (isJakbar) jakbarCount++;

      // 1. Gamas
      const isGamas = Boolean(
        row.ticket_id_gamas &&
          row.ticket_id_gamas.trim() !== "" &&
          row.ticket_id_gamas !== "-"
      );
      if (isGamas) {
        gamasTotal++;
        if (isJakbar) gamasMap["Tiket Gamas"].jakbar++;
        if (isJakut) gamasMap["Tiket Gamas"].jakut++;
      } else {
        if (isJakbar) gamasMap["Non-Gamas"].jakbar++;
        if (isJakut) gamasMap["Non-Gamas"].jakut++;
      }

      // 2. Segmen
      const seg = (row.customer_type || "UNKNOWN").toUpperCase().trim();
      if (seg.includes("HVC")) hvcTotal++;
      else regTotal++;
      if (!segMap[seg]) segMap[seg] = { jakbar: 0, jakut: 0 };
      if (isJakbar) segMap[seg].jakbar++;
      if (isJakut) segMap[seg].jakut++;

      // 3. Status Tiket
      const st = (row.status || "UNKNOWN").toUpperCase().trim();
      if (!statusMap[st]) statusMap[st] = { jakbar: 0, jakut: 0 };
      if (isJakbar) statusMap[st].jakbar++;
      if (isJakut) statusMap[st].jakut++;

      // 4. Service Type
      const rawSrv = (row.service_type || "").toUpperCase().trim();
      const srv = rawSrv === "" || rawSrv === "-" ? "UNKNOWN" : rawSrv;
      if (!serviceMap[srv]) serviceMap[srv] = { jakbar: 0, jakut: 0 };
      if (isJakbar) serviceMap[srv].jakbar++;
      if (isJakut) serviceMap[srv].jakut++;

      // 5. Status Manja
      const manjaCat = classifyStatusManja(row.booking_date);
      if (isJakbar) manjaMap[manjaCat].jakbar++;
      if (isJakut) manjaMap[manjaCat].jakut++;
    });

    const toRows = (
      map: Record<string, { jakbar: number; jakut: number }>,
      orderedKeys: string[]
    ): PillRowItem[] => {
      const extraKeys = Object.keys(map).filter((k) => !orderedKeys.includes(k));
      return [...orderedKeys, ...extraKeys].map((k) => {
        const item = map[k] || { jakbar: 0, jakut: 0 };
        return {
          label: k,
          jakbar: item.jakbar,
          jakut: item.jakut,
          total: item.jakbar + item.jakut,
        };
      });
    };

    return {
      total,
      jakutCount,
      jakbarCount,
      gamasTotal,
      hvcTotal,
      regTotal,
      gamasRows: toRows(gamasMap, ["Tiket Gamas", "Non-Gamas"]),
      segmenRows: toRows(segMap, CARD_SEGMEN_ORDER),
      statusRows: toRows(statusMap, CARD_STATUS_ORDER),
      serviceRows: toRows(serviceMap, CARD_SERVICE_ORDER),
      manjaRows: toRows(manjaMap, CARD_MANJA_ORDER),
    };
  }, [incidents]);

  // Daftar urutan kolom Segmen untuk Tabel Matriks Workzone
  const matrixSegments = useMemo(() => {
    const extraSegments = Array.from(
      new Set(
        incidents
          .map((i) => (i.customer_type || "").toUpperCase().trim())
          .filter((s) => s !== "" && !BAKU_SEGMEN.includes(s))
      )
    ).sort();
    return [...BAKU_SEGMEN, ...extraSegments];
  }, [incidents]);

  const formatSegmentHeader = (seg: string) => seg.replace("HVC_", "");

  const buildWitelMatrix = (witelKeyword: string, standardWorkzones: string[]) => {
    const rows = incidents.filter((i) =>
      (i.witel || "").toUpperCase().includes(witelKeyword)
    );

    const wzMap: Record<string, Record<string, number>> = {};
    const colTotals: Record<string, number> = {};
    matrixSegments.forEach((s) => (colTotals[s] = 0));

    standardWorkzones.forEach((wz) => {
      wzMap[wz] = {};
      matrixSegments.forEach((s) => (wzMap[wz][s] = 0));
    });

    rows.forEach((r) => {
      const wz = (r.workzone || "N/A").toUpperCase().trim();
      const seg = (r.customer_type || "UNKNOWN").toUpperCase().trim();
      if (!wzMap[wz]) {
        wzMap[wz] = {};
        matrixSegments.forEach((s) => (wzMap[wz][s] = 0));
      }
      wzMap[wz][seg] = (wzMap[wz][seg] || 0) + 1;
      colTotals[seg] = (colTotals[seg] || 0) + 1;
    });

    const extraWorkzones = Object.keys(wzMap).filter(
      (wz) => !standardWorkzones.includes(wz)
    );
    const orderedWorkzoneKeys = [...standardWorkzones, ...extraWorkzones];

    const workzonesList = orderedWorkzoneKeys.map((wz) => {
      const counts = wzMap[wz];
      const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      return { workzone: wz, counts, rowTotal };
    });

    return {
      totalTickets: rows.length,
      workzones: workzonesList,
      colTotals,
    };
  };

  const jakutMatrix = useMemo(
    () => buildWitelMatrix("JAKUT", BAKU_WZ_JAKUT),
    [incidents, matrixSegments]
  );
  const jakbarMatrix = useMemo(
    () => buildWitelMatrix("JAKBAR", BAKU_WZ_JAKBAR),
    [incidents, matrixSegments]
  );

  // Filter untuk Tabel Detail Bawah
  const filterOptions = useMemo(() => {
    const witels = Array.from(new Set(incidents.map((i) => i.witel).filter(Boolean))).sort();
    const workzones = Array.from(
      new Set([
        ...BAKU_WZ_JAKUT,
        ...BAKU_WZ_JAKBAR,
        ...incidents.map((i) => i.workzone).filter(Boolean),
      ])
    ).sort();
    const statuses = Array.from(new Set(incidents.map((i) => i.status).filter(Boolean))).sort();
    const custTypes = Array.from(
      new Set([...BAKU_SEGMEN, ...incidents.map((i) => i.customer_type).filter(Boolean)])
    );
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

      if (filterManja !== "ALL") {
        const manjaCat = classifyStatusManja(item.booking_date);
        if (manjaCat !== filterManja) return false;
      }

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
  }, [incidents, filterWitel, filterWorkzone, filterStatus, filterCustType, filterGamas, filterManja, search]);

  const handleExportCsv = () => {
    if (!filteredData.length) return;
    const headers = [
      "INCIDENT", "REPORTED DATE", "BOOKING DATE", "STATUS MANJA", "SERVICE TYPE", "WITEL", "WORKZONE",
      "STATUS", "STATUS DATE", "TICKET ID GAMAS", "CONTACT PHONE",
      "CONTACT NAME", "CUSTOMER TYPE", "CUSTOMER NAME", "SERVICE NO", "SYMPTOM",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredData.map((r) =>
        [
          r.incident, r.reported_date, r.booking_date, classifyStatusManja(r.booking_date),
          r.service_type, r.witel, r.workzone, r.status, r.status_date, r.ticket_id_gamas,
          r.contact_phone, r.contact_name, r.customer_type, r.customer_name, r.service_no, r.symptom,
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

  // Donut Chart SVG Calculation
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const jakutPct = globalStats.total ? globalStats.jakutCount / globalStats.total : 0;
  const jakbarPct = globalStats.total ? globalStats.jakbarCount / globalStats.total : 0;
  const jakutStroke = jakutPct * circumference;
  const jakbarStroke = jakbarPct * circumference;

  // Component Reusable untuk Kartu Model Pill Bar (seperti gambar)
  const renderPillCard = (params: {
    title: string;
    headerBg: string;
    bigValue: string | number;
    bigValueColor: string;
    bigValueFontSize?: string;
    pillBg: string;
    pillActiveBg: string;
    pillBorder: string;
    pillActiveBorder: string;
    labelColor: string;
    valueColor: string;
    activeFilterValue?: string;
    rows: PillRowItem[];
    onRowClick?: (label: string) => void;
  }) => {
    const {
      title,
      headerBg,
      bigValue,
      bigValueColor,
      bigValueFontSize = "32px",
      pillBg,
      pillActiveBg,
      pillBorder,
      pillActiveBorder,
      labelColor,
      valueColor,
      activeFilterValue,
      rows,
      onRowClick,
    } = params;

    return (
      <div
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        {/* Header Berwarna */}
        <div
          style={{
            background: headerBg,
            padding: "9px 14px",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "12.5px",
            color: "#ffffff",
            letterSpacing: "0.3px",
          }}
        >
          {title}
        </div>

        {/* Angka Besar Tengah */}
        <div
          style={{
            padding: "14px 12px 10px 12px",
            textAlign: "center",
            fontSize: bigValueFontSize,
            fontWeight: 800,
            color: bigValueColor,
            lineHeight: 1.15,
          }}
        >
          {bigValue}
        </div>

        {/* Daftar Pill Bar per Kategori (Pertahankan model pill pada gambar) */}
        <div
          style={{
            padding: "0 14px 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {rows.map((r) => {
            const isSelected = activeFilterValue === r.label;
            return (
              <div
                key={r.label}
                className="stat-pill"
                onClick={() => onRowClick && onRowClick(r.label)}
                style={{
                  background: isSelected ? pillActiveBg : pillBg,
                  border: isSelected ? `1.5px solid ${pillActiveBorder}` : `1px solid ${pillBorder}`,
                  borderRadius: "7px",
                  padding: "6px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12.5px",
                  cursor: onRowClick ? "pointer" : "default",
                }}
                title={onRowClick ? `Klik untuk filter ${r.label} (Jakbar: ${r.jakbar}, Jakut: ${r.jakut})` : undefined}
              >
                <span style={{ color: labelColor, fontWeight: 700 }}>{r.label}</span>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 600,
                      color: "#64748b",
                      background: "rgba(255,255,255,0.75)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    JB:{r.jakbar} | JU:{r.jakut}
                  </span>
                  <span style={{ color: valueColor, fontWeight: 800, minWidth: "22px", textAlign: "right" }}>
                    {r.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Component Reusable untuk Tabel Matriks Workzone x Segmen per Witel
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
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: "#2563eb",
          padding: "11px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#ffffff", letterSpacing: "0.2px" }}>
          {title}
        </span>
        <span
          style={{
            background: "rgba(255,255,255,0.18)",
            padding: "2px 10px",
            borderRadius: "99px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#ffffff",
            whiteSpace: "nowrap",
          }}
        >
          {matrix.totalTickets} Tiket
        </span>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #cbd5e1", background: "#f8fafc" }}>
              <th style={{ padding: "9px 10px", fontSize: "11px", fontWeight: 700, color: "#475569", width: "36px" }}>
                NO
              </th>
              <th style={{ padding: "9px 10px", fontSize: "11px", fontWeight: 700, color: "#475569" }}>
                WORKZONE
              </th>
              {matrixSegments.map((seg) => (
                <th
                  key={seg}
                  title={seg}
                  style={{
                    padding: "9px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatSegmentHeader(seg)}
                </th>
              ))}
              <th
                style={{
                  padding: "9px 12px",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#1d4ed8",
                  textAlign: "center",
                  width: "68px",
                }}
              >
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.workzones.map((row, idx) => {
              const isSelected = filterWorkzone === row.workzone && filterWitel === witelCode;
              const isZeroRow = row.rowTotal === 0;
              return (
                <tr
                  key={row.workzone}
                  className="matrix-row"
                  onClick={() => {
                    if (isSelected) {
                      setFilterWorkzone("ALL");
                      setFilterWitel("ALL");
                    } else {
                      setFilterWitel(witelCode);
                      setFilterWorkzone(row.workzone);
                    }
                  }}
                  style={{
                    borderBottom: "1px solid #e2e8f0",
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                  }}
                  title="Klik untuk memfilter tabel detail berdasarkan Workzone ini"
                >
                  <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, color: "#64748b" }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: "12.5px", fontWeight: 700, color: isSelected ? "#1d4ed8" : "#0f172a" }}>
                    {row.workzone}
                  </td>
                  {matrixSegments.map((seg) => {
                    const val = row.counts[seg] || 0;
                    return (
                      <td
                        key={seg}
                        style={{
                          padding: "8px 8px",
                          fontSize: "12.5px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: val === 0 ? "#16a34a" : "#1e293b",
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <span
                      style={{
                        background: isSelected
                          ? "#2563eb"
                          : isZeroRow
                          ? "#dcfce7"
                          : "#dbeafe",
                        border: isSelected
                          ? "1px solid #1d4ed8"
                          : isZeroRow
                          ? "1px solid #86efac"
                          : "1px solid #93c5fd",
                        color: isSelected
                          ? "#ffffff"
                          : isZeroRow
                          ? "#15803d"
                          : "#1d4ed8",
                        fontWeight: 800,
                        fontSize: "12px",
                        padding: "2px 10px",
                        borderRadius: "99px",
                        display: "inline-block",
                        minWidth: "28px",
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
              <td colSpan={2} style={{ padding: "10px 10px", fontSize: "12px", fontWeight: 800, color: "#0f172a" }}>
                GRAND TOTAL {witelCode}
              </td>
              {matrixSegments.map((seg) => {
                const colTotal = matrix.colTotals[seg] || 0;
                return (
                  <td
                    key={seg}
                    style={{
                      padding: "10px 8px",
                      fontSize: "12.5px",
                      fontWeight: 800,
                      color: colTotal === 0 ? "#16a34a" : "#0f172a",
                      textAlign: "center",
                    }}
                  >
                    {colTotal}
                  </td>
                );
              })}
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                <span
                  style={{
                    background: "#dcfce7",
                    border: "1px solid #86efac",
                    color: "#15803d",
                    fontWeight: 800,
                    fontSize: "12.5px",
                    padding: "2px 11px",
                    borderRadius: "99px",
                    display: "inline-block",
                    minWidth: "30px",
                  }}
                >
                  {matrix.totalTickets}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "11px",
    color: "#334155",
    borderBottom: "2px solid #cbd5e1",
    textTransform: "uppercase",
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    whiteSpace: "nowrap",
    fontSize: "12.5px",
    color: "#334155",
  };

  return (
    <div style={{ width: "100%", maxWidth: "1600px", margin: "0 auto", padding: "18px 20px" }}>
      {/* HEADER BAR */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "14px 20px",
          marginBottom: "18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "19px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.2px" }}>
            Monitoring Gangguan Branch Northern Jakarta – {todayTitle}
          </h1>
          <div style={{ fontSize: "12.5px", color: "#64748b", marginTop: "3px" }}>
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
              fontSize: "12.5px",
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
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Memuat..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* GRID 6 KARTU RINGKASAN (2 BARIS x 3 KOLOM - MODEL PILL BAR) */}
      <div className="kpi-cards-grid" style={{ marginBottom: "20px" }}>
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
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#475569", textTransform: "uppercase", textAlign: "center" }}>
            TOTAL TIKET AKTIF
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "10px 0" }}>
            <svg width="108" height="108" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="11" />
              {globalStats.total > 0 && (
                <>
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
              <text x="50" y="48" textAnchor="middle" fill="#0f172a" fontSize="20" fontWeight="800">
                {globalStats.total}
              </text>
              <text x="50" y="61" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
                OPEN TIKET
              </text>
            </svg>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              className="stat-pill"
              onClick={() => setFilterWitel(filterWitel === "JAKBAR" ? "ALL" : "JAKBAR")}
              style={{
                background: filterWitel === "JAKBAR" ? "#dbeafe" : "#eff6ff",
                border: filterWitel === "JAKBAR" ? "1.5px solid #2563eb" : "1px solid #bfdbfe",
                borderRadius: "7px",
                padding: "6px 12px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#1d4ed8", fontWeight: 700 }}>Witel JAKBAR</span>
              <span style={{ color: "#1e3a8a", fontWeight: 800 }}>{globalStats.jakbarCount}</span>
            </div>
            <div
              className="stat-pill"
              onClick={() => setFilterWitel(filterWitel === "JAKUT" ? "ALL" : "JAKUT")}
              style={{
                background: filterWitel === "JAKUT" ? "#dcfce7" : "#f0fdf4",
                border: filterWitel === "JAKUT" ? "1.5px solid #16a34a" : "1px solid #bbf7d0",
                borderRadius: "7px",
                padding: "6px 12px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#15803d", fontWeight: 700 }}>Witel JAKUT</span>
              <span style={{ color: "#14532d", fontWeight: 800 }}>{globalStats.jakutCount}</span>
            </div>
          </div>
        </div>

        {/* KARTU 2: INDIKASI GAMAS (TICKET ID) */}
        {renderPillCard({
          title: "INDIKASI GAMAS (TICKET ID)",
          headerBg: "#e11d48",
          bigValue: globalStats.gamasTotal,
          bigValueColor: "#dc2626",
          pillBg: "#fef2f2",
          pillActiveBg: "#fee2e2",
          pillBorder: "#fecaca",
          pillActiveBorder: "#dc2626",
          labelColor: "#b91c1c",
          valueColor: "#7f1d1d",
          activeFilterValue:
            filterGamas === "GAMAS"
              ? "Tiket Gamas"
              : filterGamas === "NON_GAMAS"
              ? "Non-Gamas"
              : undefined,
          rows: globalStats.gamasRows,
          onRowClick: (label) => {
            if (label === "Tiket Gamas") {
              setFilterGamas(filterGamas === "GAMAS" ? "ALL" : "GAMAS");
            } else {
              setFilterGamas(filterGamas === "NON_GAMAS" ? "ALL" : "NON_GAMAS");
            }
          },
        })}

        {/* KARTU 3: SEGMEN */}
        {renderPillCard({
          title: "SEGMEN",
          headerBg: "#d97706",
          bigValue: `HVC : ${globalStats.hvcTotal} | REG : ${globalStats.regTotal}`,
          bigValueColor: "#d97706",
          bigValueFontSize: "22px",
          pillBg: "#fffbeb",
          pillActiveBg: "#fef3c7",
          pillBorder: "#fde68a",
          pillActiveBorder: "#d97706",
          labelColor: "#b45309",
          valueColor: "#78350f",
          activeFilterValue: filterCustType !== "ALL" ? filterCustType : undefined,
          rows: globalStats.segmenRows,
          onRowClick: (label) => {
            setFilterCustType(filterCustType === label ? "ALL" : label);
          },
        })}

        {/* KARTU 4: STATUS TIKET */}
        {renderPillCard({
          title: "STATUS TIKET",
          headerBg: "#2563eb",
          bigValue: globalStats.total,
          bigValueColor: "#2563eb",
          pillBg: "#eff6ff",
          pillActiveBg: "#dbeafe",
          pillBorder: "#bfdbfe",
          pillActiveBorder: "#2563eb",
          labelColor: "#1d4ed8",
          valueColor: "#1e3a8a",
          activeFilterValue: filterStatus !== "ALL" ? filterStatus : undefined,
          rows: globalStats.statusRows,
          onRowClick: (label) => {
            setFilterStatus(filterStatus === label ? "ALL" : label);
          },
        })}

        {/* KARTU 5: SERVICE TYPE */}
        {renderPillCard({
          title: "SERVICE TYPE",
          headerBg: "#059669",
          bigValue: globalStats.total,
          bigValueColor: "#059669",
          pillBg: "#ecfdf5",
          pillActiveBg: "#d1fae5",
          pillBorder: "#a7f3d0",
          pillActiveBorder: "#059669",
          labelColor: "#047857",
          valueColor: "#064e3b",
          rows: globalStats.serviceRows,
        })}

        {/* KARTU 6: STATUS MANJA */}
        {renderPillCard({
          title: "STATUS MANJA",
          headerBg: "#16a34a",
          bigValue: globalStats.total,
          bigValueColor: "#16a34a",
          pillBg: "#f0fdf4",
          pillActiveBg: "#dcfce7",
          pillBorder: "#bbf7d0",
          pillActiveBorder: "#16a34a",
          labelColor: "#15803d",
          valueColor: "#14532d",
          activeFilterValue: filterManja !== "ALL" ? filterManja : undefined,
          rows: globalStats.manjaRows,
          onRowClick: (label) => {
            setFilterManja(filterManja === label ? "ALL" : label);
          },
        })}
      </div>

      {/* 2 TABEL REKAP MATRIKS PER WITEL: WORKZONE X SEGMEN */}
      <div className="matrix-tables-grid" style={{ marginBottom: "20px" }}>
        {renderMatrixCard("REKAP TIKET WITEL JAKUT (WORKZONE × SEGMEN)", "JAKUT", jakutMatrix)}
        {renderMatrixCard("REKAP TIKET WITEL JAKBAR (WORKZONE × SEGMEN)", "JAKBAR", jakbarMatrix)}
      </div>

      {/* TABEL DETAIL 16 KOLOM (DRILL-DOWN) */}
      <div
        style={{
          background: "#ffffff",
          padding: "16px 18px",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
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
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Witel</option>
              {filterOptions.witels.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <select
              value={filterWorkzone}
              onChange={(e) => setFilterWorkzone(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Workzone</option>
              {filterOptions.workzones.map((wz) => (
                <option key={wz} value={wz}>{wz}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Status</option>
              {filterOptions.statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <select
              value={filterCustType}
              onChange={(e) => setFilterCustType(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Segmen</option>
              {filterOptions.custTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>

            <select
              value={filterGamas}
              onChange={(e) => setFilterGamas(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Gamas</option>
              <option value="GAMAS">Hanya Tiket Gamas</option>
              <option value="NON_GAMAS">Non-Gamas</option>
            </select>

            <select
              value={filterManja}
              onChange={(e) => setFilterManja(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Status Manja</option>
              {CARD_MANJA_ORDER.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  background: "#fee2e2",
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  padding: "6px 12px",
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
            placeholder="Cari INCIDENT / SERVICE NO / CUSTOMER..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "260px", fontSize: "12px" }}
          />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", maxHeight: "56vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle}>INCIDENT</th>
                <th style={thStyle}>REPORTED DATE</th>
                <th style={thStyle}>BOOKING DATE</th>
                <th style={thStyle}>STATUS MANJA</th>
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
                  <td colSpan={16} style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    Tidak ada data tiket yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const manjaLabel = classifyStatusManja(row.booking_date);
                  const manjaBadgeStyle: React.CSSProperties =
                    manjaLabel === "MANJA HI"
                      ? { background: "#dcfce7", color: "#15803d" }
                      : manjaLabel === "MANJA H++"
                      ? { background: "#dbeafe", color: "#1d4ed8" }
                      : manjaLabel === "MANJA EXP"
                      ? { background: "#fee2e2", color: "#b91c1c" }
                      : { background: "#f1f5f9", color: "#475569" };

                  return (
                    <tr key={row.incident} className="detail-row" style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#1d4ed8" }}>{row.incident}</td>
                      <td style={tdStyle}>{row.reported_date || "-"}</td>
                      <td style={tdStyle}>{row.booking_date || "-"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...manjaBadgeStyle,
                            padding: "2px 8px",
                            borderRadius: "99px",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          {manjaLabel}
                        </span>
                      </td>
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
                        style={{ ...tdStyle, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis" }}
                        title={row.symptom}
                      >
                        {row.symptom || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
