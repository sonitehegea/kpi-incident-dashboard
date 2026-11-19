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

// ENDPOINT 1: Ingest Data dari Bookmarklet (Mendukung Multi-Page / Halaman 1, 2, 3, dst.)
app.post("/api/ingest", async (c) => {
  try {
    const body = await c.req.json();
    const parsedRows: Record<string, string>[] = body.rows || [];
    const pageNumber = Number(body.page || 1);
    const isAppendMode =
      body.mode === "append" || (Number.isFinite(pageNumber) && pageNumber > 1);

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

    // Gunakan INSERT OR REPLACE agar tiket yang sama tidak duplikat jika halaman bergeser
    const insertStmt = c.env.DB.prepare(`
      INSERT OR REPLACE INTO incidents (
        incident, reported_date, booking_date, service_type, witel, workzone,
        status, status_date, ticket_id_gamas, contact_phone, contact_name,
        customer_type, customer_name, service_no, symptom,
        summary, owner_group, owner, customer_segment, lapul, gaul,
        onu_rx, datemodified, technician, ttr_end_to_end, synced_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, datetime('now')
      )
    `);

    const insertBatch = validRows.map((r) => {
      const rawGamas = (r["TICKET ID GAMAS"] || "").trim();
      const ticketIdGamas = rawGamas !== "" ? rawGamas : "-";

      return insertStmt.bind(
        (r["INCIDENT"] || "").trim(),
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
      );
    });

    if (!isAppendMode) {
      // Halaman 1 (Reset): Bersihkan data lama + masukkan 50 baris pertama secara atomik
      const deleteStmt = c.env.DB.prepare("DELETE FROM incidents");
      await c.env.DB.batch([deleteStmt, ...insertBatch.slice(0, 50)]);
    } else {
      // Halaman 2, 3, dst. (Append): Pertahankan data halaman sebelumnya & tambahkan/perbarui
      await c.env.DB.batch(insertBatch.slice(0, 50));
    }

    // Jika dalam 1 halaman ada lebih dari 50 baris, masukkan sisanya per 50 baris
    for (let i = 50; i < insertBatch.length; i += 50) {
      await c.env.DB.batch(insertBatch.slice(i, i + 50));
    }

    // Hitung total tiket terkumpul saat ini di database D1
    const countRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as total FROM incidents"
    ).first<{ total: number }>();
    const totalInDb = countRow?.total ?? validRows.length;

    return c.json({
      success: true,
      mode: isAppendMode ? "append" : "reset",
      page: pageNumber,
      syncedCount: validRows.length,
      totalInDb,
      message: isAppendMode
        ? `Halaman ${pageNumber} (+${validRows.length} tiket) berhasil ditambahkan! Total terkumpul: ${totalInDb} tiket.`
        : `Halaman 1 berhasil dimuat (${validRows.length} tiket). Jika ada halaman berikutnya, pindah ke Page 2 lalu jalankan bookmarklet lagi.`,
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
