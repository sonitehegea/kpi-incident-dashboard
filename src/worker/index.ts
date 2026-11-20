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

// ENDPOINT 1: Menerima data JSON dari Bookmarklet (Mendukung Multi-Page Reset & Append)
app.post("/api/ingest", async (c) => {
  try {
    const body = await c.req.json();
    const parsedRows: Record<string, string>[] = body.rows || [];
    const mode: string = body.mode || "reset";

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

    const insertStmt = c.env.DB.prepare(`
      INSERT INTO incidents (
        incident, reported_date, booking_date, service_type, witel, workzone,
        status, status_date, ticket_id_gamas, contact_phone, contact_name,
        customer_type, customer_name, service_no, symptom,
        device_name, rk_information, urgency, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, datetime('now')
      )
      ON CONFLICT(incident) DO UPDATE SET
        reported_date = excluded.reported_date,
        booking_date = excluded.booking_date,
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
        device_name = excluded.device_name,
        rk_information = excluded.rk_information,
        urgency = excluded.urgency,
        synced_at = datetime('now')
    `);

    const insertBatch = validRows.map((r) => {
      const rawGamas = (r["TICKET ID GAMAS"] || "").trim();
      const ticketIdGamas = rawGamas !== "" ? rawGamas : "-";

      return insertStmt.bind(
        r["INCIDENT"] || "",
        r["REPORTED DATE"] || "",
        r["BOOKING DATE"] || "",
        r["SERVICE TYPE"] || "",
        r["WITEL"] || "",
        r["WORKZONE"] || "",
        r["STATUS"] || "",
        r["STATUS DATE"] || r["DATEMODIFIED"] || "",
        ticketIdGamas,
        r["CONTACT PHONE"] || "",
        r["CONTACT NAME"] || "",
        r["CUSTOMER TYPE"] || "",
        r["CUSTOMER NAME"] || "",
        r["SERVICE NO"] || "",
        r["SYMPTOM"] || "",
        r["DEVICE NAME"] || "",
        r["RK INFORMATION"] || "",
        r["URGENCY"] || r["URGENCY DESCRIPTION"] || ""
      );
    });

    if (mode === "reset") {
      const deleteStmt = c.env.DB.prepare("DELETE FROM incidents");
      await c.env.DB.batch([deleteStmt, ...insertBatch.slice(0, 50)]);
      for (let i = 50; i < insertBatch.length; i += 50) {
        await c.env.DB.batch(insertBatch.slice(i, i + 50));
      }
      return c.json({
        success: true,
        syncedCount: validRows.length,
        message: `Sukses Halaman 1! Data lama di-reset & diganti dengan ${validRows.length} tiket terbaru.`,
      });
    } else {
      for (let i = 0; i < insertBatch.length; i += 50) {
        await c.env.DB.batch(insertBatch.slice(i, i + 50));
      }
      return c.json({
        success: true,
        syncedCount: validRows.length,
        message: `Sukses Append! ${validRows.length} tiket tambahan berhasil digabungkan ke database.`,
      });
    }
  } catch (err: any) {
    return c.json({ error: `Ingest Error: ${err.message}` }, 500);
  }
});

// ENDPOINT 2: Ambil kolom aktif saja dari D1 (Hemat Payload ~45%) + waktu sync aktual
app.get("/api/incidents", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT
        incident, reported_date, booking_date, service_type, witel, workzone,
        status, status_date, ticket_id_gamas, contact_phone, contact_name,
        customer_type, customer_name, service_no, symptom,
        device_name, rk_information, urgency, synced_at
      FROM incidents
      ORDER BY reported_date DESC
      LIMIT 2000
    `).all();

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
