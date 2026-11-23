import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
};

type TargetTable = "incidents" | "unspec_incidents";

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

async function handleMirrorIngest(
  db: D1Database,
  tableName: TargetTable,
  label: string,
  parsedRows: Record<string, string>[]
) {
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    return { ok: false as const, status: 400 as const, error: `[${label}] Tidak ada data tiket yang dikirim.` };
  }

  const validRows = parsedRows.filter(
    (r) => r["INCIDENT"] && r["INCIDENT"].trim().startsWith("INC")
  );

  if (validRows.length === 0) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `[${label}] Format kolom tidak sesuai atau tidak ditemukan tiket INC.`,
    };
  }

  const deleteStmt = db.prepare(`DELETE FROM ${tableName}`);

  const insertStmt = db.prepare(`
    INSERT INTO ${tableName} (
      incident, reported_date, booking_date, service_type, witel, workzone,
      status, status_date, ticket_id_gamas, contact_phone, contact_name,
      customer_type, customer_name, service_no, device_name, rk_information,
      urgency, symptom, summary, owner_group, owner, customer_segment,
      lapul, gaul, onu_rx, datemodified, technician, ttr_end_to_end, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, datetime('now')
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
      r["DEVICE NAME"] || "",
      r["RK INFORMATION"] || "",
      r["URGENCY"] || "",
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

  await db.batch([deleteStmt, ...insertBatch.slice(0, 50)]);

  for (let i = 50; i < insertBatch.length; i += 50) {
    await db.batch(insertBatch.slice(i, i + 50));
  }

  return {
    ok: true as const,
    syncedCount: validRows.length,
    message: `[${label}] Sukses! Data lama dibersihkan & diganti dengan ${validRows.length} tiket terbaru.`,
  };
}

// ==========================================
// ENDPOINT 1: TIKET GANGGUAN UTAMA (incidents)
// ==========================================
app.post("/api/ingest", async (c) => {
  try {
    const body = await c.req.json();
    const res = await handleMirrorIngest(c.env.DB, "incidents", "TIKET GGN", body.rows || []);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ success: true, syncedCount: res.syncedCount, message: res.message });
  } catch (err: any) {
    return c.json({ error: `[TIKET GGN] Ingest Error: ${err.message}` }, 500);
  }
});

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
    return c.json({ error: `Gagal membaca database incidents: ${err.message}` }, 500);
  }
});

// ==========================================
// ENDPOINT 2: UNSPEC INSERA CONTROLLER (unspec_incidents)
// ==========================================
app.post("/api/unspec/ingest", async (c) => {
  try {
    const body = await c.req.json();
    const res = await handleMirrorIngest(
      c.env.DB,
      "unspec_incidents",
      "UNSPEC INSERA",
      body.rows || []
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ success: true, syncedCount: res.syncedCount, message: res.message });
  } catch (err: any) {
    return c.json({ error: `[UNSPEC INSERA] Ingest Error: ${err.message}` }, 500);
  }
});

app.get("/api/unspec/incidents", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM unspec_incidents ORDER BY reported_date DESC LIMIT 2000"
    ).all();

    return c.json({
      success: true,
      total: results.length,
      data: results,
    });
  } catch (err: any) {
    return c.json({ error: `Gagal membaca database unspec_incidents: ${err.message}` }, 500);
  }
});

export default app;
