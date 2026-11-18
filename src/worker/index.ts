import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Aktifkan CORS agar browser dari portal sumber diizinkan mengirim data ke API ini
app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// ENDPOINT 1: Menerima data JSON hasil parsing langsung dari Bookmarklet browser
app.post("/api/ingest", async (c) => {
  try {
    const body = await c.req.json();
    const parsedRows: Record<string, string>[] = body.rows || [];

    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
      return c.json({ error: "Tidak ada data tiket yang dikirim." }, 400);
    }

    const validRows = parsedRows.filter(
      (r) => r["INCIDENT"] && r["INCIDENT"].startsWith("INC")
    );

    if (validRows.length === 0) {
      return c.json(
        { error: "Format kolom tidak sesuai atau tidak ditemukan tiket INC." },
        400
      );
    }

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

    const batch = validRows.map((r) =>
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

    // Eksekusi per 50 baris untuk menjaga batas parameter SQLite D1
    for (let i = 0; i < batch.length; i += 50) {
      await c.env.DB.batch(batch.slice(i, i + 50));
    }

    return c.json({
      success: true,
      syncedCount: validRows.length,
      message: `Sukses! ${validRows.length} tiket berhasil disimpan/diperbarui ke database D1.`,
    });
  } catch (err: any) {
    return c.json({ error: `Ingest Error: ${err.message}` }, 500);
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
