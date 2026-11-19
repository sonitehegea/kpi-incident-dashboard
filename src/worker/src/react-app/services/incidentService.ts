import { Incident } from "../types";

// Sesuaikan URL endpoint API / Cloudflare Worker / Apps Script kamu di sini
const INCIDENTS_ENDPOINT =
  import.meta.env.VITE_INCIDENTS_API_URL || "/api/incidents";

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGES_SAFETY = 50;

interface RawPagedResponse {
  items?: Incident[];
  data?: Incident[];
  rows?: Incident[];
  incidents?: Incident[];
  totalPages?: number;
  total_pages?: number;
  last_page?: number;
  hasMore?: boolean;
  has_more?: boolean;
  nextPage?: number | null;
  next_page?: number | null;
  total?: number;
}

function extractItems(payload: unknown): Incident[] {
  if (Array.isArray(payload)) {
    return payload as Incident[];
  }
  if (payload && typeof payload === "object") {
    const obj = payload as RawPagedResponse;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.incidents)) return obj.incidents;
  }
  return [];
}

function extractPaginationMeta(payload: unknown): {
  totalPages?: number;
  hasMore?: boolean;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  const obj = payload as RawPagedResponse;
  const totalPages =
    typeof obj.totalPages === "number"
      ? obj.totalPages
      : typeof obj.total_pages === "number"
      ? obj.total_pages
      : typeof obj.last_page === "number"
      ? obj.last_page
      : undefined;

  const hasMore =
    typeof obj.hasMore === "boolean"
      ? obj.hasMore
      : typeof obj.has_more === "boolean"
      ? obj.has_more
      : obj.nextPage !== undefined
      ? Boolean(obj.nextPage)
      : obj.next_page !== undefined
      ? Boolean(obj.next_page)
      : undefined;

  return { totalPages, hasMore };
}

function buildPageUrl(baseUrl: string, page: number, limit: number): string {
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  // Kunci urutan deterministik agar tidak terjadi pergeseran baris antar halaman
  if (!url.searchParams.has("sort")) {
    url.searchParams.set("sort", "incident");
  }
  if (!url.searchParams.has("order")) {
    url.searchParams.set("order", "asc");
  }
  return url.toString();
}

/**
 * Mengambil seluruh halaman tiket (page 1, 2, 3, ...) sampai habis
 * dan melakukan deduplikasi berbasis `incident` agar tidak ada data ganda
 * maupun terlewat.
 */
export async function fetchAllIncidents(
  customEndpoint?: string,
  limit = DEFAULT_PAGE_LIMIT
): Promise<Incident[]> {
  const endpoint = customEndpoint || INCIDENTS_ENDPOINT;
  const uniqueMap = new Map<string, Incident>();
  let page = 1;

  while (page <= MAX_PAGES_SAFETY) {
    const requestUrl = buildPageUrl(endpoint, page, limit);
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Gagal mengambil data halaman ${page} (HTTP ${response.status})`
      );
    }

    const payload: unknown = await response.json();
    const items = extractItems(payload);
    const meta = extractPaginationMeta(payload);

    if (items.length === 0) {
      break;
    }

    let newlyAddedInThisPage = 0;
    for (const row of items) {
      const ticketKey = (row.incident || "").trim();
      if (!ticketKey) continue;
      if (!uniqueMap.has(ticketKey)) {
        newlyAddedInThisPage += 1;
      }
      uniqueMap.set(ticketKey, row);
    }

    // Pengaman jika endpoint mengabaikan parameter ?page= dan mengembalikan data halaman 1 berulang kali
    if (page > 1 && newlyAddedInThisPage === 0) {
      break;
    }

    if (typeof meta.totalPages === "number" && page >= meta.totalPages) {
      break;
    }

    if (typeof meta.hasMore === "boolean" && !meta.hasMore) {
      break;
    }

    if (items.length < limit) {
      break;
    }

    page += 1;
  }

  return Array.from(uniqueMap.values());
}
