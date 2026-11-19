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
const CARD_MANJA_ORDER = [
  "MANJA HI",
  "MANJA H+",
  "MANJA H++",
  "NON MANJA",
  "MANJA EXPIRED",
];
const CARD_TTR_ORDER = ["IN SLA", "SLA Kritis", "TTR Expired"];

type ManjaCategory =
  | "MANJA HI"
  | "MANJA H+"
  | "MANJA H++"
  | "NON MANJA"
  | "MANJA EXPIRED";

type TtrCategory = "IN SLA" | "SLA Kritis" | "TTR Expired";

interface TtrEvaluation {
  status: TtrCategory;
  targetHours: number;
  elapsedText: string;
}

// Helper menambah N hari ke string tanggal YYYY-MM-DD
function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Parser fleksibel timestamp WIB dari portal (YYYY-MM-DD HH:mm:ss atau DD/MM/YYYY HH:mm:ss)
function parseWibTimestamp(rawStr?: string, defaultTime = "00:00:00"): Date | null {
  const raw = (rawStr || "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "null") {
    return null;
  }

  const [defH, defM, defS] = defaultTime.split(":");

  const isoMatch = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (isoMatch) {
    const [, y, m, d, hh = defH, mm = defM, ss = defS] = isoMatch;
    const dt = new Date(
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm.padStart(
        2,
        "0"
      )}:${ss.padStart(2, "0")}+07:00`
    );
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dmyMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (dmyMatch) {
    const [, d, m, y, hh = defH, mm = defM, ss = defS] = dmyMatch;
    const dt = new Date(
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm.padStart(
        2,
        "0"
      )}:${ss.padStart(2, "0")}+07:00`
    );
    return isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Target SLA (Jam) berdasarkan Customer Type / Segmen
function getSlaTargetHours(customerType?: string): number {
  const seg = (customerType || "").toUpperCase().trim();
  if (seg.includes("DIAMOND")) return 3;
  if (seg.includes("PLATINUM")) return 6;
  if (seg.includes("GOLD")) return 12;
  return 24; // REGULER & default
}

// Evaluasi TTR dari REPORTED DATE sampai waktu sekarang (Now WIB)
function evaluateTtr(reportedDateRaw?: string, customerType?: string): TtrEvaluation {
  const targetHours = getSlaTargetHours(customerType);
  const reportedDt = parseWibTimestamp(reportedDateRaw, "00:00:00");

  if (!reportedDt) {
    return {
      status: "IN SLA",
      targetHours,
      elapsedText: "-",
    };
  }

  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - reportedDt.getTime());
  const targetMs = targetHours * 3600 * 1000;
  const oneHourMs = 3600 * 1000;
  const remainingMs = targetMs - elapsedMs;

  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const elapsedText = `${hours}j ${minutes}m / ${targetHours}j`;

  if (elapsedMs > targetMs) {
    return {
      status: "TTR Expired",
      targetHours,
      elapsedText,
    };
  }

  if (remainingMs <= oneHourMs) {
    return {
      status: "SLA Kritis",
      targetHours,
      elapsedText,
    };
  }

  return {
    status: "IN SLA",
    targetHours,
    elapsedText,
  };
}

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
  const tomorrowWibStr = addDaysToYmd(todayWibStr, 1);

  const parsedDate = parseWibTimestamp(raw, "23:59:59");
  if (!parsedDate) {
    return "NON MANJA";
  }

  const bookingDateOnlyStr = parsedDate.toLocaleDateString("en-CA", {
    timeZone: "Asia/Jakarta",
  });

  if (bookingDateOnlyStr < todayWibStr) {
    return "MANJA EXPIRED";
  }

  if (bookingDateOnlyStr === todayWibStr) {
    if (parsedDate.getTime() < now.getTime()) {
      return "MANJA EXPIRED";
    }
    return "MANJA HI";
  }

  if (bookingDateOnlyStr === tomorrowWibStr) {
    return "MANJA H+";
  }

  return "MANJA H++";
}

interface PillRowItem {
  label: string;
  jakbar: number;
  jakut: number;
  total: number;
}

interface WorkzoneMatrixRow {
  workzone: string;
  segCounts: Record<string, number>;
  rowTotal: number;
  manja: number;
  nonManja: number;
  inSla: number;
  slaKritis: number;
  ttrExpired: number;
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
  const [filterTtr, setFilterTtr] = useState("ALL");

  const hasActiveFilter =
    filterWitel !== "ALL" ||
    filterWorkzone !== "ALL" ||
    filterStatus !== "ALL" ||
    filterCustType !== "ALL" ||
    filterGamas !== "ALL" ||
    filterManja !== "ALL" ||
    filterTtr !== "ALL" ||
    search.trim() !== "";

  const resetFilters = () => {
    setSearch("");
    setFilterWitel("ALL");
    setFilterWorkzone("ALL");
    setFilterStatus("ALL");
    setFilterCustType("ALL");
    setFilterGamas("ALL");
    setFilterManja("ALL");
    setFilterTtr("ALL");
  };

  const todayTitle = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, []);

  // Kalkulasi Dinamis Global untuk 7 Kartu Atas (1 Hero + 6 Kartu Matriks Pill)
  const globalStats = useMemo(() => {
    const total = incidents.length;
    let jakutCount = 0;
    let jakbarCount = 0;
    let gamasTotal = 0;
    let hvcTotal = 0;
    let regTotal = 0;
    let ttrExpiredTotal = 0;

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

    const ttrMap: Record<string, { jakbar: number; jakut: number }> = {};
    CARD_TTR_ORDER.forEach((k) => (ttrMap[k] = { jakbar: 0, jakut: 0 }));

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

      // 6. Status TTR
      const ttrEval = evaluateTtr(row.reported_date, row.customer_type);
      if (ttrEval.status === "TTR Expired") ttrExpiredTotal++;
      if (isJakbar) ttrMap[ttrEval.status].jakbar++;
      if (isJakut) ttrMap[ttrEval.status].jakut++;
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
      ttrExpiredTotal,
      gamasRows: toRows(gamasMap, ["Tiket Gamas", "Non-Gamas"]),
      segmenRows: toRows(segMap, CARD_SEGMEN_ORDER),
      statusRows: toRows(statusMap, CARD_STATUS_ORDER),
      serviceRows: toRows(serviceMap, CARD_SERVICE_ORDER),
      manjaRows: toRows(manjaMap, CARD_MANJA_ORDER),
      ttrRows: toRows(ttrMap, CARD_TTR_ORDER),
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

    const wzMap: Record<string, WorkzoneMatrixRow> = {};
    const segColTotals: Record<string, number> = {};
    matrixSegments.forEach((s) => (segColTotals[s] = 0));

    let totalManja = 0;
    let totalNonManja = 0;
    let totalInSla = 0;
    let totalSlaKritis = 0;
    let totalTtrExpired = 0;

    const createEmptyRow = (wz: string): WorkzoneMatrixRow => {
      const segCounts: Record<string, number> = {};
      matrixSegments.forEach((s) => (segCounts[s] = 0));
      return {
        workzone: wz,
        segCounts,
        rowTotal: 0,
        manja: 0,
        nonManja: 0,
        inSla: 0,
        slaKritis: 0,
        ttrExpired: 0,
      };
    };

    standardWorkzones.forEach((wz) => {
      wzMap[wz] = createEmptyRow(wz);
    });

    rows.forEach((r) => {
      const wz = (r.workzone || "N/A").toUpperCase().trim();
      const seg = (r.customer_type || "UNKNOWN").toUpperCase().trim();
      if (!wzMap[wz]) {
        wzMap[wz] = createEmptyRow(wz);
      }

      // 1. Segmen
      wzMap[wz].segCounts[seg] = (wzMap[wz].segCounts[seg] || 0) + 1;
      wzMap[wz].rowTotal += 1;
      segColTotals[seg] = (segColTotals[seg] || 0) + 1;

      // 2. Status Manja (MANJA vs NON MANJA)
      const manjaCat = classifyStatusManja(r.booking_date);
      if (manjaCat === "NON MANJA") {
        wzMap[wz].nonManja += 1;
        totalNonManja += 1;
      } else {
        wzMap[wz].manja += 1;
        totalManja += 1;
      }

      // 3. TTR (IN SLA, SLA KRITIS, TTR EXPIRED)
      const ttrEval = evaluateTtr(r.reported_date, r.customer_type);
      if (ttrEval.status === "TTR Expired") {
        wzMap[wz].ttrExpired += 1;
        totalTtrExpired += 1;
      } else if (ttrEval.status === "SLA Kritis") {
        wzMap[wz].slaKritis += 1;
        totalSlaKritis += 1;
      } else {
        wzMap[wz].inSla += 1;
        totalInSla += 1;
      }
    });

    const extraWorkzones = Object.keys(wzMap).filter(
      (wz) => !standardWorkzones.includes(wz)
    );
    const orderedWorkzoneKeys = [...standardWorkzones, ...extraWorkzones];
    const workzonesList = orderedWorkzoneKeys.map((wz) => wzMap[wz]);

    return {
      totalTickets: rows.length,
      workzones: workzonesList,
      segColTotals,
      totalManja,
      totalNonManja,
      totalInSla,
      totalSlaKritis,
      totalTtrExpired,
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
        if (filterManja === "ANY_MANJA") {
          if (manjaCat === "NON MANJA") return false;
        } else if (manjaCat !== filterManja) {
          return false;
        }
      }

      if (filterTtr !== "ALL") {
        const ttrEval = evaluateTtr(item.reported_date, item.customer_type);
        if (ttrEval.status !== filterTtr) return false;
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
  }, [
    incidents,
    filterWitel,
    filterWorkzone,
    filterStatus,
    filterCustType,
    filterGamas,
    filterManja,
    filterTtr,
    search,
  ]);

  const handleExportCsv = () => {
    if (!filteredData.length) return;
    const headers = [
      "INCIDENT",
      "REPORTED DATE",
      "STATUS TTR",
      "DURASI / TARGET SLA",
      "BOOKING DATE",
      "STATUS MANJA",
      "SERVICE TYPE",
      "WITEL",
      "WORKZONE",
      "STATUS",
      "STATUS DATE",
      "TICKET ID GAMAS",
      "CONTACT PHONE",
      "CONTACT NAME",
      "CUSTOMER TYPE",
      "CUSTOMER NAME",
      "SERVICE NO",
      "SYMPTOM",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredData.map((r) => {
        const ttr = evaluateTtr(r.reported_date, r.customer_type);
        return [
          r.incident,
          r.reported_date,
          ttr.status,
          ttr.elapsedText,
          r.booking_date,
          classifyStatusManja(r.booking_date),
          r.service_type,
          r.witel,
          r.workzone,
          r.status,
          r.status_date,
          r.ticket_id_gamas,
          r.contact_phone,
          r.contact_name,
          r.customer_type,
          r.customer_name,
          r.service_no,
          r.symptom,
        ]
          .map((val) => `"${(val || "").replace(/"/g, '""')}"`)
          .join(",");
      }),
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
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const jakutPct = globalStats.total ? globalStats.jakutCount / globalStats.total : 0;
  const jakbarPct = globalStats.total ? globalStats.jakbarCount / globalStats.total : 0;
  const jakutStroke = jakutPct * circumference;
  const jakbarStroke = jakbarPct * circumference;

  // Component Reusable untuk Kartu Rapat dengan Pill Header Judul + Pill Header Kolom + Pill Data
  const renderCompactPillCard = (params: {
    title: string;
    titlePillBg: string;
    titlePillColor?: string;
    colHeaderPillBg: string;
    colHeaderTextColor: string;
    bigValue: string | number;
    bigValueColor: string;
    bigValueFontSize?: string;
    defaultPillBg: string;
    defaultPillActiveBg: string;
    defaultPillBorder: string;
    defaultPillActiveBorder: string;
    defaultLabelColor: string;
    defaultValueColor: string;
    activeFilterValue?: string;
    rows: PillRowItem[];
    rowStyleOverrides?: Record<
      string,
      {
        pillBg: string;
        pillActiveBg: string;
        pillBorder: string;
        pillActiveBorder: string;
        labelColor: string;
        valueColor: string;
      }
    >;
    onRowClick?: (label: string) => void;
  }) => {
    const {
      title,
      titlePillBg,
      titlePillColor = "#ffffff",
      colHeaderPillBg,
      colHeaderTextColor,
      bigValue,
      bigValueColor,
      bigValueFontSize = "25px",
      defaultPillBg,
      defaultPillActiveBg,
      defaultPillBorder,
      defaultPillActiveBorder,
      defaultLabelColor,
      defaultValueColor,
      activeFilterValue,
      rows,
      rowStyleOverrides,
      onRowClick,
    } = params;

    return (
      <div
        className="kpi-card"
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          border: "1px solid #e2e8f0",
          padding: "8px 9px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div
          style={{
            background: titlePillBg,
            borderRadius: "99px",
            padding: "5px 12px",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "10.5px",
            color: titlePillColor,
            letterSpacing: "0.35px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>

        <div
          style={{
            padding: "6px 6px 4px 6px",
            textAlign: "center",
            fontSize: bigValueFontSize,
            fontWeight: 800,
            color: bigValueColor,
            lineHeight: 1.1,
            letterSpacing: "-0.3px",
          }}
        >
          {bigValue}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "3.5px" }}>
          <div
            style={{
              background: colHeaderPillBg,
              borderRadius: "99px",
              padding: "3px 9px",
              display: "grid",
              gridTemplateColumns: "1fr 38px 38px 38px",
              alignItems: "center",
              fontSize: "10px",
              fontWeight: 800,
              color: colHeaderTextColor,
            }}
          >
            <span />
            <span style={{ textAlign: "center" }}>Jakbar</span>
            <span style={{ textAlign: "center" }}>Jakut</span>
            <span style={{ textAlign: "center" }}>Total</span>
          </div>

          {rows.map((r) => {
            const isSelected = activeFilterValue === r.label;
            const styleCfg = rowStyleOverrides?.[r.label] || {
              pillBg: defaultPillBg,
              pillActiveBg: defaultPillActiveBg,
              pillBorder: defaultPillBorder,
              pillActiveBorder: defaultPillActiveBorder,
              labelColor: defaultLabelColor,
              valueColor: defaultValueColor,
            };

            return (
              <div
                key={r.label}
                className="stat-pill"
                onClick={() => onRowClick && onRowClick(r.label)}
                style={{
                  background: isSelected ? styleCfg.pillActiveBg : styleCfg.pillBg,
                  border: isSelected
                    ? `1.5px solid ${styleCfg.pillActiveBorder}`
                    : `1px solid ${styleCfg.pillBorder}`,
                  borderRadius: "99px",
                  padding: "3.5px 9px",
                  display: "grid",
                  gridTemplateColumns: "1fr 38px 38px 38px",
                  alignItems: "center",
                  fontSize: "11px",
                  cursor: onRowClick ? "pointer" : "default",
                }}
                title={onRowClick ? `Klik untuk filter ${r.label}` : undefined}
              >
                <span
                  style={{
                    color: styleCfg.labelColor,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.label}
                </span>

                <span
                  style={{
                    textAlign: "center",
                    fontWeight: r.jakbar > 0 ? 700 : 600,
                    color: r.jakbar === 0 ? "#16a34a" : styleCfg.valueColor,
                  }}
                >
                  {r.jakbar}
                </span>

                <span
                  style={{
                    textAlign: "center",
                    fontWeight: r.jakut > 0 ? 700 : 600,
                    color: r.jakut === 0 ? "#16a34a" : styleCfg.valueColor,
                  }}
                >
                  {r.jakut}
                </span>

                <span
                  style={{
                    textAlign: "center",
                    fontWeight: 800,
                    color: r.total === 0 ? "#16a34a" : styleCfg.valueColor,
                  }}
                >
                  {r.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Component Tabel Matriks Lengkap: SEGMEN (DIAMOND..REGULER + TOTAL) | STATUS MANJA (MANJA, NON MANJA) | TTR (IN SLA, SLA KRITIS, TTR EXPIRED)
  const renderMatrixCard = (
    title: string,
    witelCode: string,
    matrix: ReturnType<typeof buildWitelMatrix>
  ) => {
    const gapThStyle: React.CSSProperties = {
      width: "14px",
      minWidth: "14px",
      background: "#ffffff",
      borderBottom: "none",
      padding: 0,
    };

    const gapTdStyle: React.CSSProperties = {
      width: "14px",
      minWidth: "14px",
      background: "#ffffff",
      borderBottom: "none",
      padding: 0,
    };

    return (
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
        {/* Header Biru Card */}
        <div
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            padding: "9px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "12.5px",
              color: "#ffffff",
              letterSpacing: "0.2px",
            }}
          >
            {title}
          </span>
          <span
            style={{
              background: "rgba(255,255,255,0.2)",
              padding: "2px 10px",
              borderRadius: "99px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#ffffff",
              whiteSpace: "nowrap",
            }}
          >
            {matrix.totalTickets} Tiket
          </span>
        </div>

        <div style={{ overflowX: "auto", width: "100%", padding: "0 0 2px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              {/* BARIS HEADER GRUP (SEGMEN | STATUS MANJA | TTR) */}
              <tr style={{ background: "#f1f5f9" }}>
                <th
                  rowSpan={2}
                  style={{
                    padding: "8px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    width: "42px",
                    textAlign: "center",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  NO
                </th>
                <th
                  rowSpan={2}
                  style={{
                    padding: "8px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    minWidth: "96px",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  WORKZONE
                </th>
                <th
                  colSpan={matrixSegments.length + 1}
                  style={{
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#334155",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                  }}
                >
                  SEGMEN
                </th>

                <th rowSpan={2} style={gapThStyle} />

                <th
                  colSpan={2}
                  style={{
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#334155",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                  }}
                >
                  STATUS MANJA
                </th>

                <th rowSpan={2} style={gapThStyle} />

                <th
                  colSpan={3}
                  style={{
                    padding: "6px 8px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#334155",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                  }}
                >
                  TTR
                </th>
              </tr>

              {/* BARIS SUB-HEADER KOLOM DETAIL */}
              <tr style={{ background: "#f8fafc" }}>
                {matrixSegments.map((seg) => (
                  <th
                    key={seg}
                    title={seg}
                    style={{
                      padding: "6px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#475569",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      borderBottom: "2px solid #cbd5e1",
                    }}
                  >
                    {formatSegmentHeader(seg)}
                  </th>
                ))}
                <th
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#1d4ed8",
                    textAlign: "center",
                    width: "72px",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  TOTAL
                </th>

                {/* Sub-header STATUS MANJA */}
                <th
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  MANJA
                </th>
                <th
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#1d4ed8",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  NON MANJA
                </th>

                {/* Sub-header TTR */}
                <th
                  style={{
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  IN SLA
                </th>
                <th
                  style={{
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  SLA KRITIS
                </th>
                <th
                  style={{
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "#dc2626",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  TTR EXPIRED
                </th>
              </tr>
            </thead>

            <tbody>
              {matrix.workzones.map((row, idx) => {
                const isSelected =
                  filterWorkzone === row.workzone && filterWitel === witelCode;
                const isZeroRow = row.rowTotal === 0;

                const applyCellFilter = (
                  e: React.MouseEvent,
                  extraFilter: { manja?: string; ttr?: string }
                ) => {
                  e.stopPropagation();
                  setFilterWitel(witelCode);
                  setFilterWorkzone(row.workzone);
                  if (extraFilter.manja) {
                    setFilterManja(extraFilter.manja);
                    setFilterTtr("ALL");
                  }
                  if (extraFilter.ttr) {
                    setFilterTtr(extraFilter.ttr);
                    setFilterManja("ALL");
                  }
                };

                return (
                  <tr
                    key={row.workzone}
                    className="matrix-row"
                    onClick={() => {
                      if (isSelected) {
                        setFilterWorkzone("ALL");
                        setFilterWitel("ALL");
                        setFilterManja("ALL");
                        setFilterTtr("ALL");
                      } else {
                        setFilterWitel(witelCode);
                        setFilterWorkzone(row.workzone);
                        setFilterManja("ALL");
                        setFilterTtr("ALL");
                      }
                    }}
                    style={{
                      background: isSelected ? "#eff6ff" : "#ffffff",
                      cursor: "pointer",
                    }}
                    title="Klik baris untuk memfilter tabel detail berdasarkan Workzone ini"
                  >
                    <td
                      style={{
                        padding: "6.5px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#64748b",
                        textAlign: "center",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        padding: "6.5px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: isSelected ? "#1d4ed8" : "#0f172a",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {row.workzone}
                    </td>

                    {/* Nilai Kolom Segmen */}
                    {matrixSegments.map((seg) => {
                      const val = row.segCounts[seg] || 0;
                      return (
                        <td
                          key={seg}
                          style={{
                            padding: "6.5px 8px",
                            fontSize: "12px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: val === 0 ? "#16a34a" : "#1e293b",
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          {val}
                        </td>
                      );
                    })}

                    {/* Pill Total Segmen */}
                    <td
                      style={{
                        padding: "6.5px 12px",
                        textAlign: "center",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
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
                          fontSize: "11.5px",
                          padding: "2px 10px",
                          borderRadius: "99px",
                          display: "inline-block",
                          minWidth: "28px",
                        }}
                      >
                        {row.rowTotal}
                      </span>
                    </td>

                    <td style={gapTdStyle} />

                    {/* Kolom MANJA */}
                    <td
                      onClick={(e) => applyCellFilter(e, { manja: "ANY_MANJA" })}
                      style={{
                        padding: "6.5px 12px",
                        fontSize: "12px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: row.manja === 0 ? "#16a34a" : "#1e293b",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                      title={`Filter ${row.workzone} - MANJA`}
                    >
                      {row.manja}
                    </td>

                    {/* Kolom NON MANJA */}
                    <td
                      onClick={(e) => applyCellFilter(e, { manja: "NON MANJA" })}
                      style={{
                        padding: "6.5px 12px",
                        fontSize: "12px",
                        textAlign: "center",
                        fontWeight: 800,
                        color: row.nonManja === 0 ? "#16a34a" : "#1d4ed8",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                      title={`Filter ${row.workzone} - NON MANJA`}
                    >
                      {row.nonManja}
                    </td>

                    <td style={gapTdStyle} />

                    {/* Kolom IN SLA */}
                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "IN SLA" })}
                      style={{
                        padding: "6.5px 10px",
                        fontSize: "12px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: row.inSla === 0 ? "#16a34a" : "#1e293b",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                      title={`Filter ${row.workzone} - IN SLA`}
                    >
                      {row.inSla}
                    </td>

                    {/* Kolom SLA KRITIS */}
                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "SLA Kritis" })}
                      style={{
                        padding: "6.5px 10px",
                        fontSize: "12px",
                        textAlign: "center",
                        fontWeight: 800,
                        color: row.slaKritis === 0 ? "#16a34a" : "#d97706",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                      title={`Filter ${row.workzone} - SLA Kritis`}
                    >
                      {row.slaKritis}
                    </td>

                    {/* Kolom TTR EXPIRED */}
                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "TTR Expired" })}
                      style={{
                        padding: "6.5px 10px",
                        fontSize: "12px",
                        textAlign: "center",
                        fontWeight: 800,
                        color: row.ttrExpired === 0 ? "#16a34a" : "#dc2626",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                      title={`Filter ${row.workzone} - TTR Expired`}
                    >
                      {row.ttrExpired}
                    </td>
                  </tr>
                );
              })}

              {/* BARIS GRAND TOTAL */}
              <tr style={{ background: "#f1f5f9" }}>
                <td
                  colSpan={2}
                  style={{
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#0f172a",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  GRAND TOTAL {witelCode}
                </td>

                {matrixSegments.map((seg) => {
                  const colTotal = matrix.segColTotals[seg] || 0;
                  return (
                    <td
                      key={seg}
                      style={{
                        padding: "8px 8px",
                        fontSize: "12px",
                        fontWeight: 800,
                        color: colTotal === 0 ? "#16a34a" : "#0f172a",
                        textAlign: "center",
                        borderTop: "2px solid #cbd5e1",
                      }}
                    >
                      {colTotal}
                    </td>
                  );
                })}

                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  <span
                    style={{
                      background: "#dcfce7",
                      border: "1px solid #86efac",
                      color: "#15803d",
                      fontWeight: 800,
                      fontSize: "12px",
                      padding: "2px 11px",
                      borderRadius: "99px",
                      display: "inline-block",
                      minWidth: "30px",
                    }}
                  >
                    {matrix.totalTickets}
                  </span>
                </td>

                <td style={gapTdStyle} />

                {/* Grand Total MANJA & NON MANJA */}
                <td
                  style={{
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: matrix.totalManja === 0 ? "#16a34a" : "#0f172a",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  {matrix.totalManja}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#15803d",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  {matrix.totalNonManja}
                </td>

                <td style={gapTdStyle} />

                {/* Grand Total TTR */}
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: matrix.totalInSla === 0 ? "#16a34a" : "#0f172a",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  {matrix.totalInSla}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: matrix.totalSlaKritis === 0 ? "#16a34a" : "#d97706",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  {matrix.totalSlaKritis}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: matrix.totalTtrExpired === 0 ? "#16a34a" : "#dc2626",
                    textAlign: "center",
                    borderTop: "2px solid #cbd5e1",
                  }}
                >
                  {matrix.totalTtrExpired}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "11px",
    color: "#334155",
    borderBottom: "2px solid #cbd5e1",
    textTransform: "uppercase",
  };

  const tdStyle: React.CSSProperties = {
    padding: "7px 12px",
    whiteSpace: "nowrap",
    fontSize: "12px",
    color: "#334155",
  };

  return (
    <div style={{ width: "100%", maxWidth: "1680px", margin: "0 auto", padding: "10px 14px" }}>
      {/* HEADER BAR */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          padding: "10px 16px",
          marginBottom: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.2px" }}>
            Monitoring Gangguan Branch Northern Jakarta – {todayTitle}
          </h1>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
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
              padding: "6px 13px",
              borderRadius: "99px",
              fontSize: "12px",
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
              padding: "6px 15px",
              borderRadius: "99px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Memuat..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* GRID BENTO ULTRA-RAPAT: KARTU 1 SPAN 2 BARIS DI KIRI + 6 KARTU MATRIKS PILL (3 ATAS + 3 BAWAH) DI KANAN */}
      <div className="kpi-bento-grid" style={{ marginBottom: "12px" }}>
        {/* KARTU 1 (SPAN 2 BARIS): TOTAL TIKET AKTIF + DONUT CHART */}
        <div
          className="kpi-card kpi-hero-card"
          style={{
            background: "#ffffff",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            padding: "10px 11px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
              borderRadius: "99px",
              padding: "5px 12px",
              textAlign: "center",
              fontWeight: 800,
              fontSize: "11px",
              color: "#ffffff",
              letterSpacing: "0.4px",
            }}
          >
            TOTAL TIKET AKTIF
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", margin: "8px 0" }}>
            <svg width="132" height="132" viewBox="0 0 104 104" style={{ filter: "drop-shadow(0 4px 10px rgba(37,99,235,0.12))" }}>
              <circle cx="52" cy="52" r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="11" />
              {globalStats.total > 0 && (
                <>
                  <circle
                    cx="52"
                    cy="52"
                    r={radius}
                    fill="transparent"
                    stroke="#16a34a"
                    strokeWidth="11"
                    strokeDasharray={`${jakutStroke} ${circumference}`}
                    transform="rotate(-90 52 52)"
                  />
                  <circle
                    cx="52"
                    cy="52"
                    r={radius}
                    fill="transparent"
                    stroke="#2563eb"
                    strokeWidth="11"
                    strokeDasharray={`${jakbarStroke} ${circumference}`}
                    strokeDashoffset={-jakutStroke}
                    transform="rotate(-90 52 52)"
                  />
                </>
              )}
              <text x="52" y="50" textAnchor="middle" fill="#0f172a" fontSize="22" fontWeight="800">
                {globalStats.total}
              </text>
              <text x="52" y="63" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
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
                borderRadius: "99px",
                padding: "7px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#1d4ed8", fontWeight: 700 }}>Witel JAKBAR</span>
              <span style={{ color: "#1e3a8a", fontWeight: 800, fontSize: "13.5px" }}>{globalStats.jakbarCount}</span>
            </div>
            <div
              className="stat-pill"
              onClick={() => setFilterWitel(filterWitel === "JAKUT" ? "ALL" : "JAKUT")}
              style={{
                background: filterWitel === "JAKUT" ? "#dcfce7" : "#f0fdf4",
                border: filterWitel === "JAKUT" ? "1.5px solid #16a34a" : "1px solid #bbf7d0",
                borderRadius: "99px",
                padding: "7px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12.5px",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "#15803d", fontWeight: 700 }}>Witel JAKUT</span>
              <span style={{ color: "#14532d", fontWeight: 800, fontSize: "13.5px" }}>{globalStats.jakutCount}</span>
            </div>
          </div>
        </div>

        {/* KARTU 2: INDIKASI GAMAS (TICKET ID) */}
        {renderCompactPillCard({
          title: "INDIKASI GAMAS (TICKET ID)",
          titlePillBg: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
          colHeaderPillBg: "#ffe4e6",
          colHeaderTextColor: "#be123c",
          bigValue: globalStats.gamasTotal,
          bigValueColor: "#dc2626",
          defaultPillBg: "#fef2f2",
          defaultPillActiveBg: "#fee2e2",
          defaultPillBorder: "#fecaca",
          defaultPillActiveBorder: "#dc2626",
          defaultLabelColor: "#b91c1c",
          defaultValueColor: "#7f1d1d",
          rowStyleOverrides: {
            "Non-Gamas": {
              pillBg: "#f8fafc",
              pillActiveBg: "#e2e8f0",
              pillBorder: "#cbd5e1",
              pillActiveBorder: "#475569",
              labelColor: "#334155",
              valueColor: "#0f172a",
            },
          },
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
        {renderCompactPillCard({
          title: "SEGMEN",
          titlePillBg: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          colHeaderPillBg: "#fef3c7",
          colHeaderTextColor: "#b45309",
          bigValue: `HVC : ${globalStats.hvcTotal} | REG : ${globalStats.regTotal}`,
          bigValueColor: "#d97706",
          bigValueFontSize: "17.5px",
          defaultPillBg: "#fffbeb",
          defaultPillActiveBg: "#fef3c7",
          defaultPillBorder: "#fde68a",
          defaultPillActiveBorder: "#d97706",
          defaultLabelColor: "#b45309",
          defaultValueColor: "#78350f",
          activeFilterValue: filterCustType !== "ALL" ? filterCustType : undefined,
          rows: globalStats.segmenRows,
          onRowClick: (label) => {
            setFilterCustType(filterCustType === label ? "ALL" : label);
          },
        })}

        {/* KARTU 4: STATUS TIKET */}
        {renderCompactPillCard({
          title: "STATUS TIKET",
          titlePillBg: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          colHeaderPillBg: "#dbeafe",
          colHeaderTextColor: "#1d4ed8",
          bigValue: globalStats.total,
          bigValueColor: "#2563eb",
          defaultPillBg: "#eff6ff",
          defaultPillActiveBg: "#dbeafe",
          defaultPillBorder: "#bfdbfe",
          defaultPillActiveBorder: "#2563eb",
          defaultLabelColor: "#1d4ed8",
          defaultValueColor: "#1e3a8a",
          activeFilterValue: filterStatus !== "ALL" ? filterStatus : undefined,
          rows: globalStats.statusRows,
          onRowClick: (label) => {
            setFilterStatus(filterStatus === label ? "ALL" : label);
          },
        })}

        {/* KARTU 5: SERVICE TYPE */}
        {renderCompactPillCard({
          title: "SERVICE TYPE",
          titlePillBg: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          colHeaderPillBg: "#d1fae5",
          colHeaderTextColor: "#047857",
          bigValue: globalStats.total,
          bigValueColor: "#059669",
          defaultPillBg: "#ecfdf5",
          defaultPillActiveBg: "#d1fae5",
          defaultPillBorder: "#a7f3d0",
          defaultPillActiveBorder: "#059669",
          defaultLabelColor: "#047857",
          defaultValueColor: "#064e3b",
          rows: globalStats.serviceRows,
        })}

        {/* KARTU 6: STATUS MANJA */}
        {renderCompactPillCard({
          title: "STATUS MANJA",
          titlePillBg: "linear-gradient(135deg, #84cc16 0%, #65a30d 100%)",
          colHeaderPillBg: "#dcfce7",
          colHeaderTextColor: "#15803d",
          bigValue: globalStats.total,
          bigValueColor: "#16a34a",
          defaultPillBg: "#f0fdf4",
          defaultPillActiveBg: "#dcfce7",
          defaultPillBorder: "#bbf7d0",
          defaultPillActiveBorder: "#16a34a",
          defaultLabelColor: "#15803d",
          defaultValueColor: "#14532d",
          rowStyleOverrides: {
            "MANJA H+": {
              pillBg: "#ecfeff",
              pillActiveBg: "#cffafe",
              pillBorder: "#a5f3fc",
              pillActiveBorder: "#0891b2",
              labelColor: "#0e7490",
              valueColor: "#164e63",
            },
            "MANJA H++": {
              pillBg: "#eff6ff",
              pillActiveBg: "#dbeafe",
              pillBorder: "#bfdbfe",
              pillActiveBorder: "#2563eb",
              labelColor: "#1d4ed8",
              valueColor: "#1e3a8a",
            },
            "NON MANJA": {
              pillBg: "#f8fafc",
              pillActiveBg: "#e2e8f0",
              pillBorder: "#cbd5e1",
              pillActiveBorder: "#475569",
              labelColor: "#334155",
              valueColor: "#0f172a",
            },
            "MANJA EXPIRED": {
              pillBg: "#fef2f2",
              pillActiveBg: "#fee2e2",
              pillBorder: "#fecaca",
              pillActiveBorder: "#dc2626",
              labelColor: "#b91c1c",
              valueColor: "#7f1d1d",
            },
          },
          activeFilterValue: filterManja !== "ALL" ? filterManja : undefined,
          rows: globalStats.manjaRows,
          onRowClick: (label) => {
            setFilterManja(filterManja === label ? "ALL" : label);
          },
        })}

        {/* KARTU 7: STATUS TTR (SLA) */}
        {renderCompactPillCard({
          title: "STATUS TTR (SLA)",
          titlePillBg: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
          colHeaderPillBg: "#ede9fe",
          colHeaderTextColor: "#5b21b6",
          bigValue: globalStats.ttrExpiredTotal,
          bigValueColor: "#dc2626",
          defaultPillBg: "#f0fdf4",
          defaultPillActiveBg: "#dcfce7",
          defaultPillBorder: "#bbf7d0",
          defaultPillActiveBorder: "#16a34a",
          defaultLabelColor: "#15803d",
          defaultValueColor: "#14532d",
          rowStyleOverrides: {
            "IN SLA": {
              pillBg: "#f0fdf4",
              pillActiveBg: "#dcfce7",
              pillBorder: "#bbf7d0",
              pillActiveBorder: "#16a34a",
              labelColor: "#15803d",
              valueColor: "#14532d",
            },
            "SLA Kritis": {
              pillBg: "#fffbeb",
              pillActiveBg: "#fef3c7",
              pillBorder: "#fde68a",
              pillActiveBorder: "#d97706",
              labelColor: "#b45309",
              valueColor: "#78350f",
            },
            "TTR Expired": {
              pillBg: "#fef2f2",
              pillActiveBg: "#fee2e2",
              pillBorder: "#fecaca",
              pillActiveBorder: "#dc2626",
              labelColor: "#b91c1c",
              valueColor: "#7f1d1d",
            },
          },
          activeFilterValue: filterTtr !== "ALL" ? filterTtr : undefined,
          rows: globalStats.ttrRows,
          onRowClick: (label) => {
            setFilterTtr(filterTtr === label ? "ALL" : label);
          },
        })}
      </div>

      {/* 2 TABEL REKAP MATRIKS PER WITEL (ATAS: JAKUT, BAWAH: JAKBAR) */}
      <div className="matrix-tables-grid" style={{ marginBottom: "14px" }}>
        {renderMatrixCard(
          "REKAP TIKET WITEL JAKUT (SEGMEN × STATUS MANJA × TTR)",
          "JAKUT",
          jakutMatrix
        )}
        {renderMatrixCard(
          "REKAP TIKET WITEL JAKBAR (SEGMEN × STATUS MANJA × TTR)",
          "JAKBAR",
          jakbarMatrix
        )}
      </div>

      {/* TABEL DETAIL 17 KOLOM (DRILL-DOWN DENGAN STATUS TTR & DURASI SLA) */}
      <div
        style={{
          background: "#ffffff",
          padding: "12px 14px",
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
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", marginRight: "4px" }}>
              DETAIL TIKET ({filteredData.length})
            </span>

            <select
              value={filterWitel}
              onChange={(e) => setFilterWitel(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Witel</option>
              {filterOptions.witels.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <select
              value={filterWorkzone}
              onChange={(e) => setFilterWorkzone(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Workzone</option>
              {filterOptions.workzones.map((wz) => (
                <option key={wz} value={wz}>{wz}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Status</option>
              {filterOptions.statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <select
              value={filterCustType}
              onChange={(e) => setFilterCustType(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Segmen</option>
              {filterOptions.custTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>

            <select
              value={filterGamas}
              onChange={(e) => setFilterGamas(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Gamas</option>
              <option value="GAMAS">Hanya Tiket Gamas</option>
              <option value="NON_GAMAS">Non-Gamas</option>
            </select>

            <select
              value={filterManja}
              onChange={(e) => setFilterManja(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Status Manja</option>
              <option value="ANY_MANJA">Semua Manja (Booking)</option>
              {CARD_MANJA_ORDER.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select
              value={filterTtr}
              onChange={(e) => setFilterTtr(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "99px", border: "1px solid #cbd5e1", fontSize: "12px", background: "#fff" }}
            >
              <option value="ALL">Semua Status TTR</option>
              {CARD_TTR_ORDER.map((t) => (
                <option key={t} value={t}>{t}</option>
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
                  padding: "5px 12px",
                  borderRadius: "99px",
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
            style={{ padding: "5px 12px", borderRadius: "99px", border: "1px solid #cbd5e1", width: "260px", fontSize: "12px" }}
          />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", maxHeight: "56vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle}>INCIDENT</th>
                <th style={thStyle}>REPORTED DATE</th>
                <th style={thStyle}>STATUS TTR</th>
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
                  <td colSpan={17} style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    Tidak ada data tiket yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const manjaLabel = classifyStatusManja(row.booking_date);
                  const manjaBadgeStyle: React.CSSProperties =
                    manjaLabel === "MANJA HI"
                      ? { background: "#dcfce7", color: "#15803d" }
                      : manjaLabel === "MANJA H+"
                      ? { background: "#cffafe", color: "#0e7490" }
                      : manjaLabel === "MANJA H++"
                      ? { background: "#dbeafe", color: "#1d4ed8" }
                      : manjaLabel === "MANJA EXPIRED"
                      ? { background: "#fee2e2", color: "#b91c1c" }
                      : { background: "#f1f5f9", color: "#475569" };

                  const ttrEval = evaluateTtr(row.reported_date, row.customer_type);
                  const ttrBadgeStyle: React.CSSProperties =
                    ttrEval.status === "TTR Expired"
                      ? { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }
                      : ttrEval.status === "SLA Kritis"
                      ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }
                      : { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" };

                  return (
                    <tr key={row.incident} className="detail-row" style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#1d4ed8" }}>{row.incident}</td>
                      <td style={tdStyle}>{row.reported_date || "-"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              ...ttrBadgeStyle,
                              padding: "2px 8px",
                              borderRadius: "99px",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {ttrEval.status}
                          </span>
                          <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                            ({ttrEval.elapsedText})
                          </span>
                        </div>
                      </td>
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
