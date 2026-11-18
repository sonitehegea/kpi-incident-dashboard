import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Helper: Membersihkan spasi berlebih & karakter non-printable dari teks HTML
function cleanText(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

// Helper: Parsing HTML Table secara streaming menggunakan HTMLRewriter bawaan Cloudflare
async function parseHtmlTable(htmlResponse: Response): Promise<Record<string, string>[]> {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inCell = false;

  const rewriter = new HTMLRewriter()
    .on("table tr", {
      element() {
        currentRow = [];
      },
      comments() {},
      text() {},
    })
    .on("table tr th, table tr td", {
      element(el) {
        inCell = true;
        currentCell = "";
        el.onEndTag(() => {
          inCell = false;
          currentRow.push(cleanText(currentCell));
        });
      },
      text(chunk) {
        if (inCell) {
          currentCell += chunk.text;
        }
      },
    })
    .on("table tr", {
      element(el) {
        el.onEndTag(() => {
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
        });
      },
    });

  // Eksekusi streaming HTMLRewriter
  await rewriter.transform(htmlResponse).text();

  if (rows.length < 2) return [];

  // Baris pertama dianggap sebagai Header Kolom
  const headers = rows[0].map((h) => h.toUpperCase());
  const dataRows = rows.slice(1);

  return dataRows
    .map((cells) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, idx) => {
        if (header) {
          obj[header] = cells[idx] ?? "";
        }
      });
      return obj;
    })
    // Filter hanya baris yang memiliki nomor tiket INCIDENT valid
    .filter((item) => item["INCIDENT"] && item["INCIDENT"].startsWith("INC"));
}

// ENDPOINT 1: Tarik data dari URL Eksternal pakai Cookie & Simpan ke D1
app.post("/api/sync", async (c) => {
  try {
    const body = await c.req.json();
    const cookie = (body.cookie || "").trim();
    const targetUrl = (body.targetUrl || "").trim();

    if (!cookie || !targetUrl) {
      return c.json({ error: "Cookie sesi aktif dan Link Tujuan wajib diisi." }, 400);
    }

    // Request ke web tujuan menggunakan cookie dari user
    const targetRes = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!targetRes.ok) {
      return c.json(
        { error: `Gagal mengakses link tujuan (HTTP Status: ${targetRes.status}).` },
        targetRes.status as any
      );
    }

    // Parse HTML menjadi array objek berdasarkan nama header kolom
    const parsedRows = await parseHtmlTable(targetRes);

    if (parsedRows.length === 0) {
      return c.json(
        {
          error:
            "Tidak ditemukan baris data tiket (INC...) pada HTML. Kemungkinan Cookie sudah expired (ter-redirect ke halaman login) atau URL salah.",
        },
        401
      );
    }

    // Siapkan Batch UPSERT ke Cloudflare D1 (anti-duplikat berdasarkan INCIDENT)
    const stmt = c.env.DB.prepare(`
      INSERT INTO incidents (
        incident, ttr_customer, summary, reported_date, owner_group, owner,
        customer_segment, service_type, witel, workzone, status,
        contact_phone, contact_name, description_assignment, source_ticket,
        external_ticket_id, customer_type, customer_id, service_id, service_no,
        technology, lapul, gaul, onu_rx, datemodified, region, symptom,
        technician, device_name, classification_flag, related_to_gamas,
        ttr_agent, ttr_mitra, ttr_nasional, ttr_pending, ttr_region,
        ttr_witel, ttr_end_to_end, guarantee_status, resolve_date,
        sn_ont, tipe_ont, rk_information, external_ticket_tier_3,
        classification_path, urgency_description, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(incident) DO UPDATE SET
        ttr_customer = excluded.ttr_customer,
        status = excluded.status,
        owner_group = excluded.owner_group,
        owner = excluded.owner,
        technician = excluded.technician,
        lapul = excluded.lapul,
        gaul = excluded.gaul,
        onu_rx = excluded.onu_rx,
        datemodified = excluded.datemodified,
        ttr_agent = excluded.ttr_agent,
        ttr_mitra = excluded.ttr_mitra,
        ttr_nasional = excluded.ttr_nasional,
        ttr_pending = excluded.ttr_pending,
        ttr_region = excluded.ttr_region,
        ttr_witel = excluded.ttr_witel,
        ttr_end_to_end = excluded.ttr_end_to_end,
        resolve_date = excluded.resolve_date,
        synced_at = datetime('now')
    `);

    const batch = parsedRows.map((r) =>
      stmt.bind(
        r["INCIDENT"] || "",
        r["TTR CUSTOMER"] || "",
        r["SUMMARY"] || "",
        r["REPORTED DATE"] || "",
        r["OWNER GROUP"] || "",
        r["OWNER"] || "",
        r["CUSTOMER SEGMENT"] || "",
        r["SERVICE TYPE"] || "",
        r["WITEL"] || "",
        r["WORKZONE"] || "",
        r["STATUS"] || "",
        r["CONTACT PHONE"] || "",
        r["CONTACT NAME"] || "",
        r["DESCRIPTION ASSIGMENT"] || r["DESCRIPTION ASSIGNMENT"] || "",
        r["SOURCE TICKET"] || "",
        r["EXTERNAL TICKET ID"] || "",
        r["CUSTOMER TYPE"] || "",
        r["CUSTOMER ID"] || "",
        r["SERVICE ID"] || "",
        r["SERVICE NO"] || "",
        r["TECHNOLOGY"] || "",
        parseInt(r["LAPUL"] || "0", 10) || 0,
        parseInt(r["GAUL"] || "0", 10) || 0,
        r["ONU RX"] || "",
        r["DATEMODIFIED"] || "",
        r["REGION"] || "",
        r["SYMPTOM"] || "",
        r["TECHNICIAN"] || "",
        r["DEVICE NAME"] || "",
        r["CLASSIFICATION FLAG"] || "",
        r["RELATED TO GAMAS"] || "",
        r["TTR AGENT"] || "",
        r["TTR MITRA"] || "",
        r["TTR NASIONAL"] || "",
        r["TTR PENDING"] || "",
        r["TTR REGION"] || "",
        r["TTR WITEL"] || "",
        r["TTR END TO END"] || "",
        r["GUARANTE STATUS"] || r["GUARANTEE STATUS"] || "",
        r["RESOLVE DATE"] || "",
        r["SN ONT"] || "",
        r["TIPE ONT"] || "",
        r["RK INFORMATION"] || "",
        r["EXTERNAL TICKET TIER 3"] || "",
        r["CLASSIFICATION PATH"] || "",
        r["URGENCY DESCRIPTION"] || ""
      )
    );

    // Eksekusi dalam potongan 50 baris per batch agar aman dari limit SQLite parameter
    for (let i = 0; i < batch.length; i += 50) {
      await c.env.DB.batch(batch.slice(i, i + 50));
    }

    return c.json({
      success: true,
      syncedCount: parsedRows.length,
      message: `Berhasil menyinkronkan ${parsedRows.length} tiket ke database D1.`,
    });
  } catch (err: any) {
    return c.json({ error: `Server Error: ${err.message}` }, 500);
  }
});

// ENDPOINT 2: Ambil seluruh data dari Database D1 untuk ditampilkan & diolah di Dashboard
app.get("/api/incidents", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM incidents ORDER BY reported_date DESC LIMIT 2000"
    ).all();

    return c.json({
      success: true,
      total: results.length,
      data: results,
    });
  } catch (err: any) {
    return c.json({ error: `Gagal membaca database: ${err.message}` }, 500);
  }
});

export default app;
