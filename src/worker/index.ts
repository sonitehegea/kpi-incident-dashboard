import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// ENDPOINT 1: Menerima data JSON hasil parsing dari Bookmarklet browser
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
        incident, reported_date, service_type, witel, workzone,
        status, status_date, ticket_id_gamas, contact_phone, contact_name,
        customer_type, customer_name, service_no, symptom,
        summary, owner_group, owner, customer_segment, lapul, gaul,
        onu_rx, datemodified, technician, ttr_end_to_end, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(incident) DO UPDATE SET
        reported_date = excluded.reported_date,
        service_type = excluded.service_type,
        witel = excluded.witel,
        workzone = excluded.workzone,
        status = excluded.status,
        status_date = excluded.status_date,
        ticket_id_gamas = excluded.ticket_id_gamas,
        contact_phone = excluded.contact_phone,
        contact_name = excluded.contact_name,
        customer_type = excluded.customer_type,
        customer_name = excluded.customer_name,
        service_no = excluded.service_no,
        symptom = excluded.symptom,
        summary = excluded.summary,
        owner_group = excluded.owner_group,
        owner = excluded.owner,
        lapul = excluded.lapul,
        gaul = excluded.gaul,
        onu_rx = excluded.onu_rx,
        datemodified = excluded.datemodified,
        technician = excluded.technician,
        ttr_end_to_end = excluded.ttr_end_to_end,
        synced_at = datetime('now')
    `);

    const batch = validRows.map((r) =>
      stmt.bind(
        r["INCIDENT"] || "",
        r["REPORTED DATE"] || "",
        r["SERVICE TYPE"] || "",
        r["WITEL"] || "",
        r["WORKZONE"] || "",
        r["STATUS"] || "",
        r["STATUS DATE"] || r["DATEMODIFIED"] || "",
        r["TICKET ID GAMAS"] || r["EXTERNAL TICKET ID"] || r["EXTERNAL TICKET TIER 3"] || "",
        r["CONTACT PHONE"] || "",
        r["CONTACT NAME"] || "",
        r["CUSTOMER TYPE"] || "",
        r["CUSTOMER NAME"] || "",
        r["SERVICE NO"] || "",
        r["SYMPTOM"] || "",
        r["SUMMARY"] || "",
        r["OWNER GROUP"] || "",
        r["OWNER"] || "",
        r["CUSTOMER SEGMENT"] || "",
        parseInt(r["LAPUL"] || "0", 10) || 0,
        parseInt(r["GAUL"] || "0", 10) || 0,
        r["ONU RX"] || "",
        r["DATEMODIFIED"] || "",
        r["TECHNICIAN"] || "",
        r["TTR END TO END"] || ""
      )
    );

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

// ENDPOINT 2: Ambil seluruh data dari Database D1
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
