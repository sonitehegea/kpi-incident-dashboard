import { Incident } from "../types";

export async function fetchAllIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(
      json.error || "Gagal mengambil data tiket gangguan dari server."
    );
  }
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchAllUnspecIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/unspec/incidents");
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(
      json.error ||
        "Gagal mengambil data Unspec Insera Controller dari server."
    );
  }
  return Array.isArray(json.data) ? json.data : [];
}
