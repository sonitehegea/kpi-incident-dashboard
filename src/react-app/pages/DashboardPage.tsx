import { useState, useMemo, useEffect } from "react";
import { Incident } from "../types";

interface DashboardPageProps {
  incidents: Incident[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  lastSyncWib: string;
  isDataStale?: boolean;
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

const CARD_GAMAS_ORDER = ["Tiket Gamas", "Potensi Gamas", "Non-Gamas"];
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

const POTENSI_DEVICE_THRESHOLD = 3;
const POTENSI_RK_THRESHOLD = 5;

const MONTH_NAME_MAP: Record<string, string> = {
  JAN: "01",
  JANUARY: "01",
  JANUARI: "01",
  FEB: "02",
  FEBRUARY: "02",
  FEBRUARI: "02",
  MAR: "03",
  MARCH: "03",
  MARET: "03",
  APR: "04",
  APRIL: "04",
  MAY: "05",
  MEI: "05",
  JUN: "06",
  JUNE: "06",
  JUNI: "06",
  JUL: "07",
  JULY: "07",
  JULI: "07",
  AUG: "08",
  AUGUST: "08",
  AGU: "08",
  AGUSTUS: "08",
  SEP: "09",
  SEPT: "09",
  SEPTEMBER: "09",
  OCT: "10",
  OCTOBER: "10",
  OKT: "10",
  OKTOBER: "10",
  NOV: "11",
  NOVEMBER: "11",
  DEC: "12",
  DECEMBER: "12",
  DES: "12",
  DESEMBER: "12",
};

type GamasCategory = "GAMAS" | "POTENSI_GAMAS" | "NON_GAMAS";

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
  isDateValid: boolean;
}

interface EnrichedIncident extends Incident {
  _ttr: TtrEvaluation;
  _manja: ManjaCategory;
  _gamasCat: GamasCategory;
  _searchBlob: string;
}

interface InfraClusterInfo {
  id: string;
  type: "DEV" | "RK";
  rawName: string;
  label: string;
  witel: string;
  workzone: string;
  count: number;
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function normalizeHour24(hhStr: string, ampm?: string): string {
  let hh = parseInt(hhStr, 10);
  if (ampm) {
    const marker = ampm.toUpperCase();
    if (marker === "PM" && hh < 12) hh += 12;
    if (marker === "AM" && hh === 12) hh = 0;
  }
  return String(hh).padStart(2, "0");
}

// Parser Tanggal Multi-Format (ISO, DD-MM-YYYY, DD-MMM-YYYY, Indo/Eng, AM/PM)
function parseWibTimestamp(rawStr?: string, defaultTime = "00:00:00"): Date | null {
  const raw = (rawStr || "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "null") {
    return null;
  }

  const [defH, defM, defS] = defaultTime.split(":");

  // 1. Format YYYY-MM-DD atau YYYY/MM/DD
  const isoMatch = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i
  );
  if (isoMatch) {
    const [, y, m, d, hh = defH, mm = defM, ss = defS, ampm] = isoMatch;
    const hour24 = normalizeHour24(hh, ampm);
    const dt = new Date(
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hour24}:${mm.padStart(
        2,
        "0"
      )}:${ss.padStart(2, "0")}+07:00`
    );
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 2. Format DD-MM-YYYY atau DD/MM/YYYY
  const dmyMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i
  );
  if (dmyMatch) {
    const [, d, m, y, hh = defH, mm = defM, ss = defS, ampm] = dmyMatch;
    const hour24 = normalizeHour24(hh, ampm);
    const dt = new Date(
      `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hour24}:${mm.padStart(
        2,
        "0"
      )}:${ss.padStart(2, "0")}+07:00`
    );
    return isNaN(dt.getTime()) ? null : dt;
  }

  // 3. Format DD-MMM-YYYY atau DD MMM YYYY (contoh: 20-Nov-2026 14:30:00)
  const textMonthMatch = raw.match(
    /^(\d{1,2})[-/\s]([A-Za-z]+)[-/\s](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?)?/i
  );
  if (textMonthMatch) {
    const [, d, mText, y, hh = defH, mm = defM, ss = defS, ampm] = textMonthMatch;
    const mNum = MONTH_NAME_MAP[mText.toUpperCase()];
    if (mNum) {
      const hour24 = normalizeHour24(hh, ampm);
      const dt = new Date(
        `${y}-${mNum}-${d.padStart(2, "0")}T${hour24}:${mm.padStart(
          2,
          "0"
        )}:${ss.padStart(2, "0")}+07:00`
      );
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function getSlaTargetHours(customerType?: string): number {
  const seg = (customerType || "").toUpperCase().trim();
  if (seg.includes("DIAMOND")) return 3;
  if (seg.includes("PLATINUM")) return 6;
  if (seg.includes("GOLD")) return 12;
  return 24;
}

function evaluateTtr(reportedDateRaw?: string, customerType?: string): TtrEvaluation {
  const targetHours = getSlaTargetHours(customerType);
  const reportedDt = parseWibTimestamp(reportedDateRaw, "00:00:00");

  if (!reportedDt) {
    return {
      status: "IN SLA",
      targetHours,
      elapsedText: "Tgl Invalid",
      isDateValid: false,
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
      isDateValid: true,
    };
  }

  if (remainingMs <= oneHourMs) {
    return {
      status: "SLA Kritis",
      targetHours,
      elapsedText,
      isDateValid: true,
    };
  }

  return {
    status: "IN SLA",
    targetHours,
    elapsedText,
    isDateValid: true,
  };
}

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

function normalizeInfraValue(val?: string): string {
  const cleaned = (val || "").trim().toUpperCase();
  if (
    !cleaned ||
    cleaned === "-" ||
    cleaned === "NULL" ||
    cleaned === "N/A" ||
    cleaned === "UNKNOWN"
  ) {
    return "";
  }
  return cleaned;
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
  gamas: number;
  potensiGamas: number;
  nonGamas: number;
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
  isDataStale = false,
}: DashboardPageProps) {
  const [search, setSearch] = useState("");
  const [filterWitel, setFilterWitel] = useState("ALL");
  const [filterWorkzone, setFilterWorkzone] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCustType, setFilterCustType] = useState("ALL");
  const [filterGamas, setFilterGamas] = useState("ALL");
  const [filterManja, setFilterManja] = useState("ALL");
  const [filterTtr, setFilterTtr] = useState("ALL");
  const [filterUrgency, setFilterUrgency] = useState("ALL");
  const [activeClusterFilter, setActiveClusterFilter] = useState<{
    id: string;
    type: "DEV" | "RK";
    rawName: string;
    workzone: string;
  } | null>(null);
  const [waCopied, setWaCopied] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  // Reset pagination ketika filter atau pencarian berubah
  useEffect(() => {
    setShowAllRows(false);
  }, [
    search,
    filterWitel,
    filterWorkzone,
    filterStatus,
    filterCustType,
    filterGamas,
    filterManja,
    filterTtr,
    filterUrgency,
    activeClusterFilter,
  ]);

  const hasActiveFilter =
    filterWitel !== "ALL" ||
    filterWorkzone !== "ALL" ||
    filterStatus !== "ALL" ||
    filterCustType !== "ALL" ||
    filterGamas !== "ALL" ||
    filterManja !== "ALL" ||
    filterTtr !== "ALL" ||
    filterUrgency !== "ALL" ||
    activeClusterFilter !== null ||
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
    setFilterUrgency("ALL");
    setActiveClusterFilter(null);
  };

  const todayTitle = useMemo(() => {
    return new Date().toLocaleDateString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, []);

  // 1. Pra-Komputasi Seluruh Tiket (Cluster DEVICE >= 3 & RK >= 5 Per-STO)
  const { enrichedIncidents, topClusters, invalidDateCount } = useMemo(() => {
    const deviceCountMap: Record<string, number> = {};
    const rkCountMap: Record<string, number> = {};

    incidents.forEach((row) => {
      const hasOfficialGamas = Boolean(
        row.ticket_id_gamas &&
          row.ticket_id_gamas.trim() !== "" &&
          row.ticket_id_gamas !== "-"
      );
      if (hasOfficialGamas) return;

      const scope = `${(row.witel || "").toUpperCase().trim()}_${(row.workzone || "")
        .toUpperCase()
        .trim()}`;
      const dev = normalizeInfraValue(row.device_name);
      const rk = normalizeInfraValue(row.rk_information);

      if (dev) {
        const scopedDev = `${scope}|${dev}`;
        deviceCountMap[scopedDev] = (deviceCountMap[scopedDev] || 0) + 1;
      }
      if (rk) {
        const scopedRk = `${scope}|${rk}`;
        rkCountMap[scopedRk] = (rkCountMap[scopedRk] || 0) + 1;
      }
    });

    const clusterTracker: Record<string, InfraClusterInfo> = {};
    let badDateCount = 0;

    const enriched: EnrichedIncident[] = incidents.map((row) => {
      const ttrEval = evaluateTtr(row.reported_date, row.customer_type);
      if (!ttrEval.isDateValid) badDateCount++;

      const manjaCat = classifyStatusManja(row.booking_date);

      const hasOfficialGamas = Boolean(
        row.ticket_id_gamas &&
          row.ticket_id_gamas.trim() !== "" &&
          row.ticket_id_gamas !== "-"
      );

      let gamasCat: GamasCategory = "NON_GAMAS";

      if (hasOfficialGamas) {
        gamasCat = "GAMAS";
      } else {
        const wtUpper = (row.witel || "").toUpperCase().trim();
        const wzUpper = (row.workzone || "").toUpperCase().trim();
        const scope = `${wtUpper}_${wzUpper}`;
        const dev = normalizeInfraValue(row.device_name);
        const rk = normalizeInfraValue(row.rk_information);

        const devCount = dev ? deviceCountMap[`${scope}|${dev}`] || 0 : 0;
        const rkCount = rk ? rkCountMap[`${scope}|${rk}`] || 0 : 0;

        const isDevPotensi = dev !== "" && devCount >= POTENSI_DEVICE_THRESHOLD;
        const isRkPotensi = rk !== "" && rkCount >= POTENSI_RK_THRESHOLD;

        if (isDevPotensi || isRkPotensi) {
          gamasCat = "POTENSI_GAMAS";

          if (isDevPotensi) {
            const devClusterId = `${scope}|DEV:${dev}`;
            if (!clusterTracker[devClusterId]) {
              clusterTracker[devClusterId] = {
                id: devClusterId,
                type: "DEV",
                rawName: dev,
                label: `[DEV] ${dev}`,
                witel: wtUpper,
                workzone: wzUpper,
                count: devCount,
              };
            }
          }

          if (isRkPotensi) {
            const rkClusterId = `${scope}|RK:${rk}`;
            if (!clusterTracker[rkClusterId]) {
              clusterTracker[rkClusterId] = {
                id: rkClusterId,
                type: "RK",
                rawName: rk,
                label: `[RK] ${rk}`,
                witel: wtUpper,
                workzone: wzUpper,
                count: rkCount,
              };
            }
          }
        }
      }

      const searchBlob = [
        row.incident,
        row.workzone,
        row.witel,
        row.service_no,
        row.customer_name,
        row.contact_name,
        row.ticket_id_gamas,
        row.device_name,
        row.rk_information,
        row.urgency,
        row.symptom,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return {
        ...row,
        _ttr: ttrEval,
        _manja: manjaCat,
        _gamasCat: gamasCat,
        _searchBlob: searchBlob,
      };
    });

    const clusters: InfraClusterInfo[] = Object.values(clusterTracker).sort(
      (a, b) => b.count - a.count
    );

    return {
      enrichedIncidents: enriched,
      topClusters: clusters,
      invalidDateCount: badDateCount,
    };
  }, [incidents]);

  const globalStats = useMemo(() => {
    const total = enrichedIncidents.length;
    let jakutCount = 0;
    let jakbarCount = 0;
    let gamasTotal = 0;
    let potensiGamasTotal = 0;
    let nonGamasTotal = 0;
    let hvcTotal = 0;
    let regTotal = 0;
    let inSlaTotal = 0;
    let slaKritisTotal = 0;
    let ttrExpiredTotal = 0;

    const gamasMap: Record<string, { jakbar: number; jakut: number }> = {
      "Tiket Gamas": { jakbar: 0, jakut: 0 },
      "Potensi Gamas": { jakbar: 0, jakut: 0 },
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

    enrichedIncidents.forEach((row) => {
      const wt = (row.witel || "").toUpperCase();
      const isJakbar = wt.includes("JAKBAR");
      const isJakut = wt.includes("JAKUT");

      if (isJakut) jakutCount++;
      if (isJakbar) jakbarCount++;

      if (row._gamasCat === "GAMAS") {
        gamasTotal++;
        if (isJakbar) gamasMap["Tiket Gamas"].jakbar++;
        if (isJakut) gamasMap["Tiket Gamas"].jakut++;
      } else if (row._gamasCat === "POTENSI_GAMAS") {
        potensiGamasTotal++;
        if (isJakbar) gamasMap["Potensi Gamas"].jakbar++;
        if (isJakut) gamasMap["Potensi Gamas"].jakut++;
      } else {
        nonGamasTotal++;
        if (isJakbar) gamasMap["Non-Gamas"].jakbar++;
        if (isJakut) gamasMap["Non-Gamas"].jakut++;
      }

      const seg = (row.customer_type || "UNKNOWN").toUpperCase().trim();
      if (seg.includes("HVC")) hvcTotal++;
      else regTotal++;
      if (!segMap[seg]) segMap[seg] = { jakbar: 0, jakut: 0 };
      if (isJakbar) segMap[seg].jakbar++;
      if (isJakut) segMap[seg].jakut++;

      const st = (row.status || "UNKNOWN").toUpperCase().trim();
      if (!statusMap[st]) statusMap[st] = { jakbar: 0, jakut: 0 };
      if (isJakbar) statusMap[st].jakbar++;
      if (isJakut) statusMap[st].jakut++;

      const rawSrv = (row.service_type || "").toUpperCase().trim();
      const srv = rawSrv === "" || rawSrv === "-" ? "UNKNOWN" : rawSrv;
      if (!serviceMap[srv]) serviceMap[srv] = { jakbar: 0, jakut: 0 };
      if (isJakbar) serviceMap[srv].jakbar++;
      if (isJakut) serviceMap[srv].jakut++;

      if (isJakbar) manjaMap[row._manja].jakbar++;
      if (isJakut) manjaMap[row._manja].jakut++;

      if (row._ttr.status === "TTR Expired") ttrExpiredTotal++;
      else if (row._ttr.status === "SLA Kritis") slaKritisTotal++;
      else inSlaTotal++;

      if (isJakbar) ttrMap[row._ttr.status].jakbar++;
      if (isJakut) ttrMap[row._ttr.status].jakut++;
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

    const jakbarSharePct = total > 0 ? Math.round((jakbarCount / total) * 100) : 0;
    const jakutSharePct = total > 0 ? Math.round((jakutCount / total) * 100) : 0;
    const hvcSharePct = total > 0 ? Math.round((hvcTotal / total) * 100) : 0;
    const regSharePct = total > 0 ? Math.round((regTotal / total) * 100) : 0;
    const inSlaRatePct =
      total > 0 ? (((total - ttrExpiredTotal) / total) * 100).toFixed(1) : "100.0";

    return {
      total,
      jakutCount,
      jakbarCount,
      jakbarSharePct,
      jakutSharePct,
      gamasTotal,
      potensiGamasTotal,
      nonGamasTotal,
      hvcTotal,
      regTotal,
      hvcSharePct,
      regSharePct,
      inSlaTotal,
      slaKritisTotal,
      ttrExpiredTotal,
      inSlaRatePct,
      gamasRows: toRows(gamasMap, CARD_GAMAS_ORDER),
      segmenRows: toRows(segMap, CARD_SEGMEN_ORDER),
      statusRows: toRows(statusMap, CARD_STATUS_ORDER),
      serviceRows: toRows(serviceMap, CARD_SERVICE_ORDER),
      manjaRows: toRows(manjaMap, CARD_MANJA_ORDER),
      ttrRows: toRows(ttrMap, CARD_TTR_ORDER),
    };
  }, [enrichedIncidents]);

  const matrixSegments = useMemo(() => {
    const extraSegments = Array.from(
      new Set(
        enrichedIncidents
          .map((i) => (i.customer_type || "").toUpperCase().trim())
          .filter((s) => s !== "" && !BAKU_SEGMEN.includes(s))
      )
    ).sort();
    return [...BAKU_SEGMEN, ...extraSegments];
  }, [enrichedIncidents]);

  const formatSegmentHeader = (seg: string) => seg.replace("HVC_", "");

  const buildWitelMatrix = (witelKeyword: string, standardWorkzones: string[]) => {
    const rows = enrichedIncidents.filter((i) =>
      (i.witel || "").toUpperCase().includes(witelKeyword)
    );

    const wzMap: Record<string, WorkzoneMatrixRow> = {};
    const segColTotals: Record<string, number> = {};
    matrixSegments.forEach((s) => (segColTotals[s] = 0));

    let totalGamas = 0;
    let totalPotensiGamas = 0;
    let totalNonGamas = 0;
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
        gamas: 0,
        potensiGamas: 0,
        nonGamas: 0,
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

      wzMap[wz].segCounts[seg] = (wzMap[wz].segCounts[seg] || 0) + 1;
      wzMap[wz].rowTotal += 1;
      segColTotals[seg] = (segColTotals[seg] || 0) + 1;

      if (r._gamasCat === "GAMAS") {
        wzMap[wz].gamas += 1;
        totalGamas += 1;
      } else if (r._gamasCat === "POTENSI_GAMAS") {
        wzMap[wz].potensiGamas += 1;
        totalPotensiGamas += 1;
      } else {
        wzMap[wz].nonGamas += 1;
        totalNonGamas += 1;
      }

      if (r._manja === "NON MANJA") {
        wzMap[wz].nonManja += 1;
        totalNonManja += 1;
      } else {
        wzMap[wz].manja += 1;
        totalManja += 1;
      }

      if (r._ttr.status === "TTR Expired") {
        wzMap[wz].ttrExpired += 1;
        totalTtrExpired += 1;
      } else if (r._ttr.status === "SLA Kritis") {
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
      totalGamas,
      totalPotensiGamas,
      totalNonGamas,
      totalManja,
      totalNonManja,
      totalInSla,
      totalSlaKritis,
      totalTtrExpired,
    };
  };

  const jakutMatrix = useMemo(
    () => buildWitelMatrix("JAKUT", BAKU_WZ_JAKUT),
    [enrichedIncidents, matrixSegments]
  );
  const jakbarMatrix = useMemo(
    () => buildWitelMatrix("JAKBAR", BAKU_WZ_JAKBAR),
    [enrichedIncidents, matrixSegments]
  );

  // Copy Laporan WA sesuai format baku
  const handleCopyWaReport = () => {
    const formatStoLine = (idx: number, row: WorkzoneMatrixRow) => {
      const diamond = row.segCounts["HVC_DIAMOND"] || 0;
      const platinum = row.segCounts["HVC_PLATINUM"] || 0;
      const gold = row.segCounts["HVC_GOLD"] || 0;
      const reguler = row.segCounts["REGULER"] || 0;
      const statusIcon = row.rowTotal === 0 ? "✅" : "❌";
      return `${idx + 1}. ${row.workzone} / ${diamond} / ${platinum} / ${gold} / ${reguler} / ${row.manja} / ${row.rowTotal} ${statusIcon}`;
    };

    const jakutLines = jakutMatrix.workzones.map((row, idx) => formatStoLine(idx, row));
    const jktD = jakutMatrix.segColTotals["HVC_DIAMOND"] || 0;
    const jktP = jakutMatrix.segColTotals["HVC_PLATINUM"] || 0;
    const jktG = jakutMatrix.segColTotals["HVC_GOLD"] || 0;
    const jktR = jakutMatrix.segColTotals["REGULER"] || 0;
    const jktIcon = jakutMatrix.totalTickets === 0 ? "✅" : "❌";
    const totalJakutLine = `TOTAL : JAKUT / ${jktD} / ${jktP} / ${jktG} / ${jktR} / ${jakutMatrix.totalManja} / ${jakutMatrix.totalTickets} ${jktIcon}`;

    const jakbarLines = jakbarMatrix.workzones.map((row, idx) => formatStoLine(idx, row));
    const jkbD = jakbarMatrix.segColTotals["HVC_DIAMOND"] || 0;
    const jkbP = jakbarMatrix.segColTotals["HVC_PLATINUM"] || 0;
    const jkbG = jakbarMatrix.segColTotals["HVC_GOLD"] || 0;
    const jkbR = jakbarMatrix.segColTotals["REGULER"] || 0;
    const jkbIcon = jakbarMatrix.totalTickets === 0 ? "✅" : "❌";
    const totalJakbarLine = `TOTAL : JAKBAR / ${jkbD} / ${jkbP} / ${jkbG} / ${jkbR} / ${jakbarMatrix.totalManja} / ${jakbarMatrix.totalTickets} ${jkbIcon}`;

    const totD = jktD + jkbD;
    const totP = jktP + jkbP;
    const totG = jktG + jkbG;
    const totR = jktR + jkbR;
    const totManja = jakutMatrix.totalManja + jakbarMatrix.totalManja;
    const totAll = jakutMatrix.totalTickets + jakbarMatrix.totalTickets;
    const totIcon = totAll === 0 ? "✅" : "❌";
    const totalNorthrenLine = `TOTAL : NORTHREN / ${totD} / ${totP} / ${totG} / ${totR} / ${totManja} / ${totAll} ${totIcon}`;

    const reportText = [
      "MONITORING TIKET OPEN NORTHERNJAKARTA",
      "",
      "NO / STO / DIAMOND / PLATINUM / GOLD / REGULER / MANJA / TOTAL TIKET",
      ...jakutLines,
      totalJakutLine,
      ...jakbarLines,
      totalJakbarLine,
      totalNorthrenLine,
    ].join("\n");

    navigator.clipboard.writeText(reportText);
    setWaCopied(true);
    setTimeout(() => setWaCopied(false), 3000);
  };

  const filterOptions = useMemo(() => {
    const witels = Array.from(new Set(enrichedIncidents.map((i) => i.witel).filter(Boolean))).sort();
    const workzones = Array.from(
      new Set([
        ...BAKU_WZ_JAKUT,
        ...BAKU_WZ_JAKBAR,
        ...enrichedIncidents.map((i) => i.workzone).filter(Boolean),
      ])
    ).sort();
    const statuses = Array.from(new Set(enrichedIncidents.map((i) => i.status).filter(Boolean))).sort();
    const custTypes = Array.from(
      new Set([...BAKU_SEGMEN, ...enrichedIncidents.map((i) => i.customer_type).filter(Boolean)])
    );
    const urgencies = Array.from(
      new Set(
        enrichedIncidents
          .map((i) => (i.urgency || "").trim())
          .filter((u) => u !== "" && u !== "-")
      )
    ).sort();
    return { witels, workzones, statuses, custTypes, urgencies };
  }, [enrichedIncidents]);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedIncidents.filter((item) => {
      if (filterWitel !== "ALL" && item.witel !== filterWitel) return false;
      if (filterWorkzone !== "ALL" && item.workzone !== filterWorkzone) return false;
      if (filterStatus !== "ALL" && item.status !== filterStatus) return false;
      if (filterCustType !== "ALL" && item.customer_type !== filterCustType) return false;
      if (filterUrgency !== "ALL" && (item.urgency || "").trim() !== filterUrgency) return false;
      if (filterGamas !== "ALL" && item._gamasCat !== filterGamas) return false;

      if (activeClusterFilter) {
        if ((item.workzone || "").toUpperCase().trim() !== activeClusterFilter.workzone) {
          return false;
        }
        if (activeClusterFilter.type === "DEV") {
          if (normalizeInfraValue(item.device_name) !== activeClusterFilter.rawName) {
            return false;
          }
        } else {
          if (normalizeInfraValue(item.rk_information) !== activeClusterFilter.rawName) {
            return false;
          }
        }
      }

      if (filterManja !== "ALL") {
        if (filterManja === "ANY_MANJA") {
          if (item._manja === "NON MANJA") return false;
        } else if (item._manja !== filterManja) {
          return false;
        }
      }

      if (filterTtr !== "ALL" && item._ttr.status !== filterTtr) return false;

      if (q !== "" && !item._searchBlob.includes(q)) return false;

      return true;
    });
  }, [
    enrichedIncidents,
    filterWitel,
    filterWorkzone,
    filterStatus,
    filterCustType,
    filterGamas,
    filterManja,
    filterTtr,
    filterUrgency,
    activeClusterFilter,
    search,
  ]);

  const displayedRows = useMemo(() => {
    if (showAllRows || filteredData.length <= 50) return filteredData;
    return filteredData.slice(0, 50);
  }, [filteredData, showAllRows]);

  const handleExportCsv = () => {
    if (!filteredData.length) return;
    const headers = [
      "INCIDENT",
      "REPORTED DATE",
      "STATUS TTR",
      "DURASI / TARGET SLA",
      "BOOKING DATE",
      "STATUS MANJA",
      "KATEGORI GAMAS",
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
      "DEVICE NAME",
      "RK INFORMATION",
      "URGENCY",
      "SYMPTOM",
    ];
    const csvRows = [
      headers.join(","),
      ...filteredData.map((r) => {
        const gLabel =
          r._gamasCat === "GAMAS"
            ? "TIKET GAMAS"
            : r._gamasCat === "POTENSI_GAMAS"
            ? "POTENSI GAMAS"
            : "NON GAMAS";
        return [
          r.incident,
          r.reported_date,
          r._ttr.status,
          r._ttr.elapsedText,
          r.booking_date,
          r._manja,
          gLabel,
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
          r.device_name,
          r.rk_information,
          r.urgency,
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
  const radius = 33;
  const circumference = 2 * Math.PI * radius;
  const jakutPct = globalStats.total ? globalStats.jakutCount / globalStats.total : 0;
  const jakbarPct = globalStats.total ? globalStats.jakbarCount / globalStats.total : 0;
  const jakutStroke = jakutPct * circumference;
  const jakbarStroke = jakbarPct * circumference;

  const renderSidebarKpiCard = (params: {
    title: string;
    bigValue: React.ReactNode;
    bigValueColor?: string;
    bigValueFontSize?: string;
    activeFilterValue?: string;
    rows: PillRowItem[];
    rowHighlightMap?: Record<
      string,
      {
        labelColor: string;
        valueColor: string;
        alertBg?: string;
      }
    >;
    onRowClick?: (label: string) => void;
  }) => {
    const {
      title,
      bigValue,
      bigValueColor = "#0f172a",
      bigValueFontSize = "18px",
      activeFilterValue,
      rows,
      rowHighlightMap,
      onRowClick,
    } = params;

    return (
      <div
        className="kpi-card"
        style={{
          background: "#ffffff",
          borderRadius: "7px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            background: "#1e293b",
            padding: "4px 6px",
            textAlign: "center",
            fontWeight: 700,
            fontSize: "9px",
            color: "#f8fafc",
            letterSpacing: "0.4px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>

        <div
          style={{
            padding: "5px 4px 3px 4px",
            textAlign: "center",
            fontSize: bigValueFontSize,
            fontWeight: 800,
            color: bigValueColor,
            lineHeight: 1.15,
            letterSpacing: "-0.3px",
          }}
        >
          {bigValue}
        </div>

        <div style={{ padding: "0 6px 5px 6px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 22px 22px 26px",
              alignItems: "center",
              padding: "1px 2px 2px 2px",
              borderBottom: "1px solid #cbd5e1",
              fontSize: "8px",
              fontWeight: 700,
              color: "#64748b",
              textTransform: "uppercase",
            }}
          >
            <span />
            <span style={{ textAlign: "right" }}>JKB</span>
            <span style={{ textAlign: "right" }}>JKT</span>
            <span style={{ textAlign: "right", color: "#0f172a" }}>TOT</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r, idx) => {
              const isSelected = activeFilterValue === r.label;
              const isLast = idx === rows.length - 1;
              const customStyle = rowHighlightMap?.[r.label];
              const hasAlertBg = customStyle?.alertBg && r.total > 0;

              return (
                <div
                  key={r.label}
                  className="exec-metric-row"
                  onClick={() => onRowClick && onRowClick(r.label)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 22px 22px 26px",
                    alignItems: "center",
                    padding: "2.5px 2px",
                    borderBottom: isLast ? "none" : "1px solid #f1f5f9",
                    background: isSelected
                      ? "#eff6ff"
                      : hasAlertBg
                      ? customStyle.alertBg
                      : "transparent",
                    borderRadius: isSelected || hasAlertBg ? "3px" : "0",
                    fontSize: "9.5px",
                    cursor: onRowClick ? "pointer" : "default",
                  }}
                  title={onRowClick ? `Klik untuk filter ${r.label}` : undefined}
                >
                  <span
                    style={{
                      color: isSelected
                        ? "#1d4ed8"
                        : customStyle && r.total > 0
                        ? customStyle.labelColor
                        : "#334155",
                      fontWeight: isSelected || (customStyle && r.total > 0) ? 700 : 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingRight: "2px",
                    }}
                  >
                    {r.label.replace("HVC_", "")}
                  </span>

                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: r.jakbar > 0 ? 600 : 400,
                      color: r.jakbar === 0 ? "#cbd5e1" : "#334155",
                    }}
                  >
                    {r.jakbar}
                  </span>

                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: r.jakut > 0 ? 600 : 400,
                      color: r.jakut === 0 ? "#cbd5e1" : "#334155",
                    }}
                  >
                    {r.jakut}
                  </span>

                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: r.total > 0 ? 700 : 400,
                      color:
                        r.total === 0
                          ? "#cbd5e1"
                          : customStyle
                          ? customStyle.valueColor
                          : "#0f172a",
                    }}
                  >
                    {r.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMatrixCard = (
    title: string,
    witelCode: string,
    matrix: ReturnType<typeof buildWitelMatrix>
  ) => {
    const groupDividerLeft: React.CSSProperties = {
      borderLeft: "2px solid #cbd5e1",
    };

    const formatMatrixZero = (val: number, activeColor: string, bold = false) => ({
      color: val === 0 ? "#cbd5e1" : activeColor,
      fontWeight: val === 0 ? 400 : bold ? 800 : 600,
    });

    return (
      <div
        style={{
          background: "#ffffff",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
            padding: "5.5px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "11px",
              color: "#ffffff",
              letterSpacing: "0.3px",
            }}
          >
            {title}
          </span>
          <span
            style={{
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.28)",
              padding: "1px 8px",
              borderRadius: "99px",
              fontSize: "10px",
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
              <tr style={{ background: "#f1f5f9" }}>
                <th
                  rowSpan={2}
                  style={{
                    padding: "4px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    width: "26px",
                    textAlign: "center",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  NO
                </th>
                <th
                  rowSpan={2}
                  style={{
                    padding: "4px 6px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    width: "66px",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  WORKZONE
                </th>
                <th
                  colSpan={matrixSegments.length + 1}
                  style={{
                    padding: "3.5px 3px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#1e293b",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                    ...groupDividerLeft,
                  }}
                >
                  SEGMEN
                </th>

                <th
                  colSpan={3}
                  style={{
                    padding: "3.5px 3px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#1e293b",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                    ...groupDividerLeft,
                  }}
                >
                  STATUS GAMAS
                </th>

                <th
                  colSpan={2}
                  style={{
                    padding: "3.5px 3px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#1e293b",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                    ...groupDividerLeft,
                  }}
                >
                  STATUS MANJA
                </th>

                <th
                  colSpan={3}
                  style={{
                    padding: "3.5px 3px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#1e293b",
                    textAlign: "center",
                    borderBottom: "1px solid #cbd5e1",
                    letterSpacing: "0.3px",
                    ...groupDividerLeft,
                  }}
                >
                  TTR (SLA)
                </th>
              </tr>

              <tr style={{ background: "#f8fafc" }}>
                {matrixSegments.map((seg, sIdx) => (
                  <th
                    key={seg}
                    title={seg}
                    style={{
                      padding: "3.5px 3px",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "#475569",
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      borderBottom: "2px solid #cbd5e1",
                      ...(sIdx === 0 ? groupDividerLeft : {}),
                    }}
                  >
                    {formatSegmentHeader(seg)}
                  </th>
                ))}
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#1e3a8a",
                    textAlign: "center",
                    width: "42px",
                    background: "#eff6ff",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  TOTAL
                </th>

                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#b91c1c",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                    ...groupDividerLeft,
                  }}
                >
                  GAMAS
                </th>
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#b45309",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  POTENSI
                </th>
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  NON GAMAS
                </th>

                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                    ...groupDividerLeft,
                  }}
                >
                  MANJA
                </th>
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  NON MANJA
                </th>

                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#475569",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                    ...groupDividerLeft,
                  }}
                >
                  IN SLA
                </th>
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#b45309",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  KRITIS
                </th>
                <th
                  style={{
                    padding: "3.5px 4px",
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#b91c1c",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    borderBottom: "2px solid #cbd5e1",
                  }}
                >
                  EXPIRED
                </th>
              </tr>
            </thead>

            <tbody>
              {matrix.workzones.map((row, idx) => {
                const isSelected =
                  filterWorkzone === row.workzone && filterWitel === witelCode;
                const isEven = idx % 2 === 1;

                const applyCellFilter = (
                  e: React.MouseEvent,
                  extraFilter: { gamas?: string; manja?: string; ttr?: string }
                ) => {
                  e.stopPropagation();
                  setActiveClusterFilter(null);
                  setFilterWitel(witelCode);
                  setFilterWorkzone(row.workzone);
                  setFilterGamas(extraFilter.gamas || "ALL");
                  setFilterManja(extraFilter.manja || "ALL");
                  setFilterTtr(extraFilter.ttr || "ALL");
                };

                return (
                  <tr
                    key={row.workzone}
                    className="matrix-row"
                    onClick={() => {
                      setActiveClusterFilter(null);
                      if (isSelected) {
                        setFilterWorkzone("ALL");
                        setFilterWitel("ALL");
                        setFilterGamas("ALL");
                        setFilterManja("ALL");
                        setFilterTtr("ALL");
                      } else {
                        setFilterWitel(witelCode);
                        setFilterWorkzone(row.workzone);
                        setFilterGamas("ALL");
                        setFilterManja("ALL");
                        setFilterTtr("ALL");
                      }
                    }}
                    style={{
                      background: isSelected
                        ? "#dbeafe"
                        : isEven
                        ? "#f8fafc"
                        : "#ffffff",
                      cursor: "pointer",
                    }}
                    title="Klik baris untuk memfilter tabel detail berdasarkan Workzone ini"
                  >
                    <td
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10px",
                        fontWeight: 500,
                        color: "#64748b",
                        textAlign: "center",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        padding: "3.5px 6px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        color: isSelected ? "#1d4ed8" : "#0f172a",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {row.workzone}
                    </td>

                    {matrixSegments.map((seg, sIdx) => {
                      const val = row.segCounts[seg] || 0;
                      const isHighGold = seg === "HVC_GOLD" && val >= 8;
                      return (
                        <td
                          key={seg}
                          style={{
                            padding: "3.5px 3px",
                            fontSize: "10.5px",
                            textAlign: "center",
                            fontVariantNumeric: "tabular-nums",
                            borderBottom: "1px solid #e2e8f0",
                            ...formatMatrixZero(val, "#1e293b", isHighGold),
                            ...(sIdx === 0 ? groupDividerLeft : {}),
                          }}
                        >
                          {val}
                        </td>
                      );
                    })}

                    <td
                      style={{
                        padding: "3.5px 4px",
                        textAlign: "center",
                        background: isSelected ? "#bfdbfe" : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <span
                        style={{
                          background: isSelected
                            ? "#1d4ed8"
                            : row.rowTotal > 0
                            ? "#dbeafe"
                            : "transparent",
                          color: isSelected
                            ? "#ffffff"
                            : row.rowTotal > 0
                            ? "#1e3a8a"
                            : "#cbd5e1",
                          fontWeight: row.rowTotal > 0 ? 800 : 400,
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          display: "inline-block",
                          minWidth: "20px",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.rowTotal}
                      </span>
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { gamas: "GAMAS" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        background: row.gamas > 0 ? "#fee2e2" : undefined,
                        ...formatMatrixZero(row.gamas, "#b91c1c", true),
                        ...groupDividerLeft,
                      }}
                      title={`Filter ${row.workzone} - Tiket Gamas`}
                    >
                      {row.gamas}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { gamas: "POTENSI_GAMAS" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        background: row.potensiGamas > 0 ? "#fef3c7" : undefined,
                        ...formatMatrixZero(row.potensiGamas, "#b45309", true),
                      }}
                      title={`Filter ${row.workzone} - Potensi Gamas (Device ≥ 3 atau RK ≥ 5)`}
                    >
                      {row.potensiGamas}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { gamas: "NON_GAMAS" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        ...formatMatrixZero(row.nonGamas, "#334155", false),
                      }}
                      title={`Filter ${row.workzone} - Non-Gamas`}
                    >
                      {row.nonGamas}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { manja: "ANY_MANJA" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        ...formatMatrixZero(row.manja, "#0f172a", true),
                        ...groupDividerLeft,
                      }}
                      title={`Filter ${row.workzone} - MANJA`}
                    >
                      {row.manja}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { manja: "NON MANJA" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        ...formatMatrixZero(row.nonManja, "#334155", false),
                      }}
                      title={`Filter ${row.workzone} - NON MANJA`}
                    >
                      {row.nonManja}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "IN SLA" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        ...formatMatrixZero(row.inSla, "#0f172a", false),
                        ...groupDividerLeft,
                      }}
                      title={`Filter ${row.workzone} - IN SLA`}
                    >
                      {row.inSla}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "SLA Kritis" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        background: row.slaKritis > 0 ? "#fef3c7" : undefined,
                        ...formatMatrixZero(row.slaKritis, "#b45309", true),
                      }}
                      title={`Filter ${row.workzone} - SLA Kritis`}
                    >
                      {row.slaKritis}
                    </td>

                    <td
                      onClick={(e) => applyCellFilter(e, { ttr: "TTR Expired" })}
                      style={{
                        padding: "3.5px 4px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid #e2e8f0",
                        background: row.ttrExpired > 0 ? "#fee2e2" : undefined,
                        ...formatMatrixZero(row.ttrExpired, "#b91c1c", true),
                      }}
                      title={`Filter ${row.workzone} - TTR Expired`}
                    >
                      {row.ttrExpired}
                    </td>
                  </tr>
                );
              })}

              {/* BARIS GRAND TOTAL */}
              <tr style={{ background: "#e2e8f0" }}>
                <td
                  colSpan={2}
                  style={{
                    padding: "4.5px 6px",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: "#0f172a",
                    borderTop: "2px solid #94a3b8",
                  }}
                >
                  GRAND TOTAL {witelCode}
                </td>

                {matrixSegments.map((seg, sIdx) => {
                  const colTotal = matrix.segColTotals[seg] || 0;
                  return (
                    <td
                      key={seg}
                      style={{
                        padding: "4.5px 3px",
                        fontSize: "10.5px",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                        borderTop: "2px solid #94a3b8",
                        ...formatMatrixZero(colTotal, "#0f172a", true),
                        ...(sIdx === 0 ? groupDividerLeft : {}),
                      }}
                    >
                      {colTotal}
                    </td>
                  );
                })}

                <td
                  style={{
                    padding: "4.5px 4px",
                    textAlign: "center",
                    borderTop: "2px solid #94a3b8",
                  }}
                >
                  <span
                    style={{
                      background: "#1e3a8a",
                      color: "#ffffff",
                      fontWeight: 800,
                      fontSize: "10px",
                      padding: "1px 7px",
                      borderRadius: "4px",
                      display: "inline-block",
                      minWidth: "22px",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {matrix.totalTickets}
                  </span>
                </td>

                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    background: matrix.totalGamas > 0 ? "#fee2e2" : undefined,
                    ...formatMatrixZero(matrix.totalGamas, "#b91c1c", true),
                    ...groupDividerLeft,
                  }}
                >
                  {matrix.totalGamas}
                </td>
                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    background: matrix.totalPotensiGamas > 0 ? "#fef3c7" : undefined,
                    ...formatMatrixZero(matrix.totalPotensiGamas, "#b45309", true),
                  }}
                >
                  {matrix.totalPotensiGamas}
                </td>
                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    ...formatMatrixZero(matrix.totalNonGamas, "#0f172a", true),
                  }}
                >
                  {matrix.totalNonGamas}
                </td>

                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    ...formatMatrixZero(matrix.totalManja, "#0f172a", true),
                    ...groupDividerLeft,
                  }}
                >
                  {matrix.totalManja}
                </td>
                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    ...formatMatrixZero(matrix.totalNonManja, "#0f172a", true),
                  }}
                >
                  {matrix.totalNonManja}
                </td>

                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    ...formatMatrixZero(matrix.totalInSla, "#0f172a", true),
                    ...groupDividerLeft,
                  }}
                >
                  {matrix.totalInSla}
                </td>
                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    background: matrix.totalSlaKritis > 0 ? "#fef3c7" : undefined,
                    ...formatMatrixZero(matrix.totalSlaKritis, "#b45309", true),
                  }}
                >
                  {matrix.totalSlaKritis}
                </td>
                <td
                  style={{
                    padding: "4.5px 4px",
                    fontSize: "10.5px",
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    borderTop: "2px solid #94a3b8",
                    background: matrix.totalTtrExpired > 0 ? "#fee2e2" : undefined,
                    ...formatMatrixZero(matrix.totalTtrExpired, "#b91c1c", true),
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
    padding: "6px 10px",
    whiteSpace: "nowrap",
    fontWeight: 700,
    fontSize: "10.5px",
    color: "#334155",
    borderBottom: "2px solid #cbd5e1",
    textTransform: "uppercase",
  };

  const tdStyle: React.CSSProperties = {
    padding: "5.5px 10px",
    whiteSpace: "nowrap",
    fontSize: "11.5px",
    color: "#334155",
  };

  return (
    <div style={{ width: "100%", maxWidth: "1320px", margin: "0 auto", padding: "8px 12px" }}>
      {/* HEADER BAR EXECUTIVE FORMAL */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          padding: "8px 14px",
          marginBottom: "8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "16.5px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.2px" }}>
            Monitoring Gangguan Branch Northern Jakarta – {todayTitle}
          </h1>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span>
              Last Sync DB:{" "}
              <strong
                style={{
                  color: isDataStale ? "#b45309" : "#0f172a",
                  background: isDataStale ? "#fef3c7" : "transparent",
                  padding: isDataStale ? "1px 6px" : "0",
                  borderRadius: "4px",
                }}
              >
                {lastSyncWib}
              </strong>
            </span>
            <span>•</span>
            <span>
              Total Sumber Data: <strong style={{ color: "#1e3a8a" }}>{incidents.length} Tiket</strong>
            </span>
            {invalidDateCount > 0 && (
              <span
                style={{
                  background: "#fee2e2",
                  color: "#b91c1c",
                  padding: "0.5px 6px",
                  borderRadius: "4px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                }}
              >
                {invalidDateCount} tgl invalid
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCopyWaReport}
            style={{
              background: waCopied ? "#15803d" : "#ecfdf5",
              color: waCopied ? "#ffffff" : "#047857",
              border: "1px solid #a7f3d0",
              padding: "5px 12px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {waCopied ? "Tersalin ke Clipboard!" : "Copy Laporan WA"}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              background: "#f8fafc",
              color: "#334155",
              border: "1px solid #cbd5e1",
              padding: "5px 12px",
              borderRadius: "6px",
              fontSize: "11.5px",
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
              background: "#1e3a8a",
              color: "#fff",
              border: "1px solid #1e3a8a",
              padding: "5px 14px",
              borderRadius: "6px",
              fontSize: "11.5px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Memuat..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* ASYMMETRIC SPLIT LAYOUT: KIRI (KPI SIDEBAR) | KANAN (TABEL MATRIKS JAKUT & JAKBAR) */}
      <div className="exec-split-layout" style={{ marginBottom: "10px" }}>
        <div className="exec-left-kpi-col">
          {/* HERO CARD: TOTAL TIKET AKTIF */}
          <div
            className="kpi-card"
            style={{
              background: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div
              style={{
                background: "#1e293b",
                padding: "4.5px 10px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "9.5px",
                color: "#f8fafc",
                letterSpacing: "0.5px",
              }}
            >
              TOTAL TIKET AKTIF
            </div>

            <div
              style={{
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <svg width="96" height="96" viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
                <circle cx="44" cy="44" r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="9" />
                {globalStats.total > 0 && (
                  <>
                    <circle
                      cx="44"
                      cy="44"
                      r={radius}
                      fill="transparent"
                      stroke="#0d9488"
                      strokeWidth="9"
                      strokeDasharray={`${jakutStroke} ${circumference}`}
                      transform="rotate(-90 44 44)"
                    />
                    <circle
                      cx="44"
                      cy="44"
                      r={radius}
                      fill="transparent"
                      stroke="#1e3a8a"
                      strokeWidth="9"
                      strokeDasharray={`${jakbarStroke} ${circumference}`}
                      strokeDashoffset={-jakutStroke}
                      transform="rotate(-90 44 44)"
                    />
                  </>
                )}
                <text x="44" y="42" textAnchor="middle" fill="#0f172a" fontSize="19" fontWeight="800">
                  {globalStats.total}
                </text>
                <text x="44" y="54" textAnchor="middle" fill="#64748b" fontSize="6.8" fontWeight="700">
                  OPEN TIKET
                </text>
              </svg>

              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div
                  className="exec-metric-row"
                  onClick={() => setFilterWitel(filterWitel === "JAKBAR" ? "ALL" : "JAKBAR")}
                  style={{
                    background: filterWitel === "JAKBAR" ? "#eff6ff" : "transparent",
                    borderBottom: "1px solid #e2e8f0",
                    padding: "6px 4px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1e293b", fontWeight: 700 }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#1e3a8a", display: "inline-block" }} />
                    Witel JAKBAR
                  </span>
                  <span style={{ color: "#0f172a", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {globalStats.jakbarCount}{" "}
                    <span style={{ color: "#64748b", fontWeight: 600, fontSize: "10px" }}>
                      ({globalStats.jakbarSharePct}%)
                    </span>
                  </span>
                </div>

                <div
                  className="exec-metric-row"
                  onClick={() => setFilterWitel(filterWitel === "JAKUT" ? "ALL" : "JAKUT")}
                  style={{
                    background: filterWitel === "JAKUT" ? "#f0fdfa" : "transparent",
                    padding: "6px 4px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#1e293b", fontWeight: 700 }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#0d9488", display: "inline-block" }} />
                    Witel JAKUT
                  </span>
                  <span style={{ color: "#0f172a", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {globalStats.jakutCount}{" "}
                    <span style={{ color: "#64748b", fontWeight: 600, fontSize: "10px" }}>
                      ({globalStats.jakutSharePct}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 6 KARTU KPI MINI (2 KOLOM x 3 BARIS) */}
          <div className="exec-mini-kpi-grid">
            {renderSidebarKpiCard({
              title: "INDIKASI GAMAS",
              bigValue: (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: globalStats.gamasTotal > 0 ? "#b91c1c" : "#0f172a" }}>
                    {globalStats.gamasTotal}
                  </span>
                  <span style={{ color: "#cbd5e1", fontSize: "13px" }}>|</span>
                  <span style={{ fontSize: "11.5px", fontWeight: 800, color: globalStats.potensiGamasTotal > 0 ? "#b45309" : "#64748b" }}>
                    Potensi: {globalStats.potensiGamasTotal}
                  </span>
                </div>
              ),
              bigValueFontSize: "15px",
              rowHighlightMap: {
                "Tiket Gamas": {
                  labelColor: "#b91c1c",
                  valueColor: "#b91c1c",
                  alertBg: "#fef2f2",
                },
                "Potensi Gamas": {
                  labelColor: "#b45309",
                  valueColor: "#b45309",
                  alertBg: "#fffbeb",
                },
              },
              activeFilterValue:
                filterGamas === "GAMAS"
                  ? "Tiket Gamas"
                  : filterGamas === "POTENSI_GAMAS"
                  ? "Potensi Gamas"
                  : filterGamas === "NON_GAMAS"
                  ? "Non-Gamas"
                  : undefined,
              rows: globalStats.gamasRows,
              onRowClick: (label) => {
                setActiveClusterFilter(null);
                if (label === "Tiket Gamas") {
                  setFilterGamas(filterGamas === "GAMAS" ? "ALL" : "GAMAS");
                } else if (label === "Potensi Gamas") {
                  setFilterGamas(filterGamas === "POTENSI_GAMAS" ? "ALL" : "POTENSI_GAMAS");
                } else {
                  setFilterGamas(filterGamas === "NON_GAMAS" ? "ALL" : "NON_GAMAS");
                }
              },
            })}

            {renderSidebarKpiCard({
              title: "SEGMEN PELANGGAN",
              bigValue: (
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a" }}>
                  HVC: {globalStats.hvcTotal} ({globalStats.hvcSharePct}%) | REG: {globalStats.regTotal}
                </span>
              ),
              bigValueFontSize: "11px",
              activeFilterValue: filterCustType !== "ALL" ? filterCustType : undefined,
              rows: globalStats.segmenRows,
              onRowClick: (label) => {
                setFilterCustType(filterCustType === label ? "ALL" : label);
              },
            })}

            {renderSidebarKpiCard({
              title: "STATUS TIKET",
              bigValue: globalStats.total,
              bigValueColor: "#1e3a8a",
              activeFilterValue: filterStatus !== "ALL" ? filterStatus : undefined,
              rows: globalStats.statusRows,
              onRowClick: (label) => {
                setFilterStatus(filterStatus === label ? "ALL" : label);
              },
            })}

            {renderSidebarKpiCard({
              title: "SERVICE TYPE",
              bigValue: globalStats.total,
              bigValueColor: "#0f172a",
              rows: globalStats.serviceRows,
            })}

            {renderSidebarKpiCard({
              title: "STATUS MANJA",
              bigValue: globalStats.total,
              bigValueColor: "#0f172a",
              rowHighlightMap: {
                "MANJA EXPIRED": {
                  labelColor: "#b91c1c",
                  valueColor: "#b91c1c",
                  alertBg: "#fef2f2",
                },
              },
              activeFilterValue: filterManja !== "ALL" ? filterManja : undefined,
              rows: globalStats.manjaRows,
              onRowClick: (label) => {
                setFilterManja(filterManja === label ? "ALL" : label);
              },
            })}

            {renderSidebarKpiCard({
              title: "STATUS TTR (SLA)",
              bigValue: (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                    {globalStats.inSlaRatePct}%{" "}
                    <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#0d9488" }}>SLA</span>
                  </span>
                  {globalStats.ttrExpiredTotal > 0 && (
                    <span
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        border: "1px solid #fecaca",
                        fontSize: "9px",
                        fontWeight: 800,
                        padding: "0.5px 4px",
                        borderRadius: "3px",
                      }}
                    >
                      {globalStats.ttrExpiredTotal} Exp
                    </span>
                  )}
                </div>
              ),
              bigValueFontSize: "14px",
              rowHighlightMap: {
                "SLA Kritis": {
                  labelColor: "#b45309",
                  valueColor: "#b45309",
                  alertBg: "#fffbeb",
                },
                "TTR Expired": {
                  labelColor: "#b91c1c",
                  valueColor: "#b91c1c",
                  alertBg: "#fef2f2",
                },
              },
              activeFilterValue: filterTtr !== "ALL" ? filterTtr : undefined,
              rows: globalStats.ttrRows,
              onRowClick: (label) => {
                setFilterTtr(filterTtr === label ? "ALL" : label);
              },
            })}
          </div>

          {/* PANEL DETEKSI CLUSTER [DEV] ≥ 3 & [RK] ≥ 5 PER-STO */}
          <div
            className="kpi-card"
            style={{
              background: "#ffffff",
              borderRadius: "8px",
              border: topClusters.length > 0 ? "1px solid #fcd34d" : "1px solid #cbd5e1",
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div
              style={{
                background: topClusters.length > 0 ? "#92400e" : "#1e293b",
                padding: "4.5px 10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontWeight: 700,
                fontSize: "9.5px",
                color: "#ffffff",
                letterSpacing: "0.4px",
              }}
            >
              <span>POTENSI GAMAS (CLUSTER)</span>
              <span
                style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "0.5px 6px",
                  borderRadius: "99px",
                  fontSize: "8.5px",
                }}
              >
                DEV ≥ {POTENSI_DEVICE_THRESHOLD} | RK ≥ {POTENSI_RK_THRESHOLD}
              </span>
            </div>

            <div style={{ padding: "6px 8px" }}>
              {topClusters.length === 0 ? (
                <div style={{ fontSize: "10.5px", color: "#64748b", textAlign: "center", padding: "6px 4px" }}>
                  Tidak ada akumulasi DEV ≥ {POTENSI_DEVICE_THRESHOLD} atau RK ≥ {POTENSI_RK_THRESHOLD} dalam satu STO.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {topClusters.slice(0, 5).map((cl) => {
                    const isClusterFiltered = activeClusterFilter?.id === cl.id;
                    return (
                      <div
                        key={cl.id}
                        onClick={() => {
                          if (isClusterFiltered) {
                            setActiveClusterFilter(null);
                            setFilterWorkzone("ALL");
                            setFilterGamas("ALL");
                          } else {
                            setActiveClusterFilter({
                              id: cl.id,
                              type: cl.type,
                              rawName: cl.rawName,
                              workzone: cl.workzone,
                            });
                            setFilterWorkzone(cl.workzone);
                            setFilterGamas("POTENSI_GAMAS");
                          }
                        }}
                        style={{
                          background: isClusterFiltered ? "#fde68a" : "#fffbeb",
                          border: isClusterFiltered ? "1.5px solid #d97706" : "1px solid #fde68a",
                          borderRadius: "5px",
                          padding: "4px 7px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                        }}
                        title="Klik untuk memfilter tiket pada cluster ini"
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 800,
                              color: "#92400e",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {cl.label}
                          </div>
                          <div style={{ fontSize: "9px", color: "#b45309", fontWeight: 600 }}>
                            {cl.witel} • {cl.workzone}
                          </div>
                        </div>
                        <span
                          style={{
                            background: cl.type === "DEV" ? "#d97706" : "#b45309",
                            color: "#ffffff",
                            fontSize: "9.5px",
                            fontWeight: 800,
                            padding: "1.5px 6px",
                            borderRadius: "4px",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {cl.count} Tiket
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: TABEL MATRIKS JAKUT (ATAS) & JAKBAR (BAWAH) */}
        <div className="exec-right-tables-col">
          {renderMatrixCard(
            "REKAP TIKET WITEL JAKUT (SEGMEN × GAMAS × MANJA × TTR)",
            "JAKUT",
            jakutMatrix
          )}
          {renderMatrixCard(
            "REKAP TIKET WITEL JAKBAR (SEGMEN × GAMAS × MANJA × TTR)",
            "JAKBAR",
            jakbarMatrix
          )}
        </div>
      </div>

      {/* TABEL DETAIL 21 KOLOM (DENGAN PAGINATION 50 BARIS) */}
      <div
        style={{
          background: "#ffffff",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a", marginRight: "4px" }}>
              DETAIL TIKET ({filteredData.length})
            </span>

            {activeClusterFilter && (
              <span
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fcd34d",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                Cluster: [{activeClusterFilter.type}] {activeClusterFilter.rawName}
              </span>
            )}

            <select
              value={filterWitel}
              onChange={(e) => setFilterWitel(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Witel</option>
              {filterOptions.witels.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>

            <select
              value={filterWorkzone}
              onChange={(e) => {
                setActiveClusterFilter(null);
                setFilterWorkzone(e.target.value);
              }}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Workzone</option>
              {filterOptions.workzones.map((wz) => (
                <option key={wz} value={wz}>{wz}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Status</option>
              {filterOptions.statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            <select
              value={filterCustType}
              onChange={(e) => setFilterCustType(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Segmen</option>
              {filterOptions.custTypes.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>

            <select
              value={filterGamas}
              onChange={(e) => {
                setActiveClusterFilter(null);
                setFilterGamas(e.target.value);
              }}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Status Gamas</option>
              <option value="GAMAS">Tiket Gamas (ID Resmi)</option>
              <option value="POTENSI_GAMAS">Potensi Gamas (DEV ≥ 3 / RK ≥ 5)</option>
              <option value="NON_GAMAS">Non-Gamas</option>
            </select>

            <select
              value={filterManja}
              onChange={(e) => setFilterManja(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
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
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Status TTR</option>
              {CARD_TTR_ORDER.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "11.5px", background: "#fff" }}
            >
              <option value="ALL">Semua Urgency</option>
              {filterOptions.urgencies.map((u) => (
                <option key={u} value={u}>{u}</option>
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
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11.5px",
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
            placeholder="Cari INCIDENT / DEVICE / RK / URGENCY..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", width: "245px", fontSize: "11.5px" }}
          />
        </div>

        <div style={{ overflowX: "auto", border: "1px solid #cbd5e1", borderRadius: "6px", maxHeight: "56vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle}>INCIDENT</th>
                <th style={thStyle}>REPORTED DATE</th>
                <th style={thStyle}>STATUS TTR</th>
                <th style={thStyle}>BOOKING DATE</th>
                <th style={thStyle}>STATUS MANJA</th>
                <th style={thStyle}>KATEGORI GAMAS</th>
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
                <th style={thStyle}>DEVICE NAME</th>
                <th style={thStyle}>RK INFORMATION</th>
                <th style={thStyle}>URGENCY</th>
                <th style={thStyle}>SYMPTOM</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={21} style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "12.5px" }}>
                    Tidak ada data tiket yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const manjaLabel = row._manja;
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

                  const ttrEval = row._ttr;
                  const ttrBadgeStyle: React.CSSProperties =
                    ttrEval.status === "TTR Expired"
                      ? { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }
                      : ttrEval.status === "SLA Kritis"
                      ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }
                      : { background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" };

                  const gCat = row._gamasCat;
                  const gamasBadgeStyle: React.CSSProperties =
                    gCat === "GAMAS"
                      ? { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }
                      : gCat === "POTENSI_GAMAS"
                      ? { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }
                      : { background: "#f1f5f9", color: "#475569" };
                  const gamasBadgeLabel =
                    gCat === "GAMAS"
                      ? "GAMAS"
                      : gCat === "POTENSI_GAMAS"
                      ? "POTENSI GAMAS"
                      : "NON GAMAS";

                  const urgUpper = (row.urgency || "").toUpperCase();
                  const isHighUrgency =
                    urgUpper.includes("HIGH") ||
                    urgUpper.includes("CRITICAL") ||
                    urgUpper.includes("VVIP") ||
                    urgUpper === "1";

                  return (
                    <tr key={row.incident} className="detail-row" style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#1e3a8a" }}>{row.incident}</td>
                      <td style={tdStyle}>{row.reported_date || "-"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <span
                            style={{
                              ...ttrBadgeStyle,
                              padding: "1.5px 7px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                            }}
                          >
                            {ttrEval.status}
                          </span>
                          <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600 }}>
                            ({ttrEval.elapsedText})
                          </span>
                        </div>
                      </td>
                      <td style={tdStyle}>{row.booking_date || "-"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...manjaBadgeStyle,
                            padding: "1.5px 7px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
                            fontWeight: 700,
                          }}
                        >
                          {manjaLabel}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...gamasBadgeStyle,
                            padding: "1.5px 7px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
                            fontWeight: 700,
                          }}
                        >
                          {gamasBadgeLabel}
                        </span>
                      </td>
                      <td style={tdStyle}>{row.service_type || "-"}</td>
                      <td style={tdStyle}>{row.witel || "-"}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{row.workzone || "-"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: "1.5px 7px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
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
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{row.device_name || "-"}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{row.rk_information || "-"}</td>
                      <td style={tdStyle}>
                        {row.urgency && row.urgency !== "-" ? (
                          <span
                            style={{
                              padding: "1.5px 7px",
                              borderRadius: "4px",
                              fontSize: "10.5px",
                              fontWeight: 700,
                              background: isHighUrgency ? "#fee2e2" : "#f1f5f9",
                              color: isHighUrgency ? "#b91c1c" : "#334155",
                            }}
                          >
                            {row.urgency}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
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

        {/* BAR PAGINATION JIKA TIKET LEBIH DARI 50 */}
        {filteredData.length > 50 && (
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11.5px",
              color: "#64748b",
            }}
          >
            <span>
              Menampilkan <strong>{displayedRows.length}</strong> dari <strong>{filteredData.length}</strong> tiket
            </span>
            <button
              type="button"
              onClick={() => setShowAllRows((prev) => !prev)}
              style={{
                background: "#f1f5f9",
                color: "#1e3a8a",
                border: "1px solid #cbd5e1",
                padding: "4px 12px",
                borderRadius: "6px",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {showAllRows
                ? "Ringkas (50 Baris Pertama)"
                : `Tampilkan Semua (${filteredData.length} Baris)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
