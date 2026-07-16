import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getArg, readJson } from "./utils.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
let file = getArg("file");
if (!file) {
  const files = (await fs.readdir(path.resolve("data/alerts"))).filter((name) => name.endsWith(".json")).sort();
  file = files.at(-1) ? path.resolve("data/alerts", files.at(-1)) : null;
}
if (!file) throw new Error("Nenhum arquivo de alertas encontrado.");
const payload = await readJson(file);
const alerts = payload.data ?? [];
const supabase = createClient(url, key, { auth: { persistSession: false } });

const rows = alerts.map((alert) => ({
  external_id: alert.id,
  title: alert.title,
  rule: alert.rule,
  severity: alert.severity,
  status: alert.status,
  detected_at: alert.detectedAt,
  deputy_name: alert.deputyName ?? null,
  supplier_name: alert.supplierName ?? null,
  amount: alert.amount ?? null,
  evidence: alert.evidence
}));
for (let index = 0; index < rows.length; index += 200) {
  const batch = rows.slice(index, index + 200);
  const { error } = await supabase.from("alerts").upsert(batch, { onConflict: "external_id" });
  if (error) throw error;
  console.log(`Importados ${Math.min(index + batch.length, rows.length)} de ${rows.length}`);
}
