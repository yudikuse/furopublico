import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getArg, readJson } from "./utils.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
  );
}

let file = getArg("file");

if (!file) {
  const directory = path.resolve("data/alerts");
  const files = (await fs.readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();

  file = files.at(-1) ? path.resolve(directory, files.at(-1)) : null;
}

if (!file) throw new Error("Nenhum arquivo de alertas encontrado.");

console.log(`Lendo alertas de: ${file}`);
const payload = await readJson(file);
const alerts = Array.isArray(payload.data) ? payload.data : [];
const uniqueAlerts = new Map();

for (const alert of alerts) {
  const externalId = String(alert.id ?? "").trim();
  if (!externalId) continue;
  uniqueAlerts.set(externalId, alert);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const ids = [...uniqueAlerts.keys()];
const existingById = new Map();

for (let index = 0; index < ids.length; index += 200) {
  const batch = ids.slice(index, index + 200);
  const { data, error } = await supabase
    .from("alerts")
    .select("external_id,evidence")
    .in("external_id", batch);

  if (error) throw error;
  for (const row of data ?? []) {
    existingById.set(row.external_id, row.evidence ?? {});
  }
}

const rows = [...uniqueAlerts.entries()].map(([externalId, alert]) => {
  const previousEvidence = existingById.get(externalId) ?? {};
  const incomingEvidence =
    alert.evidence && typeof alert.evidence === "object"
      ? alert.evidence
      : {};

  return {
    external_id: externalId,
    title: String(alert.title ?? "Alerta sem título"),
    rule: String(alert.rule ?? "Regra não informada"),
    severity: ["baixa", "media", "alta"].includes(alert.severity)
      ? alert.severity
      : "media",
    detected_at: alert.detectedAt ?? new Date().toISOString(),
    deputy_name: alert.deputyName ?? null,
    supplier_name: alert.supplierName ?? null,
    amount:
      typeof alert.amount === "number" && Number.isFinite(alert.amount)
        ? alert.amount
        : null,
    evidence: {
      ...previousEvidence,
      ...incomingEvidence,
      enrichment:
        previousEvidence.enrichment ?? incomingEvidence.enrichment ?? undefined,
      manualInterpretation:
        previousEvidence.manualInterpretation ??
        incomingEvidence.manualInterpretation ??
        undefined
    }
  };
});

console.log(`Alertas no arquivo: ${alerts.length}`);
console.log(`Alertas únicos: ${rows.length}`);
console.log(`Duplicados eliminados: ${alerts.length - rows.length}`);

for (let index = 0; index < rows.length; index += 200) {
  const batch = rows.slice(index, index + 200);
  const { error } = await supabase.from("alerts").upsert(batch, {
    onConflict: "external_id",
    ignoreDuplicates: false
  });

  if (error) throw error;
  console.log(`Importados ${Math.min(index + batch.length, rows.length)} de ${rows.length}`);
}

console.log("Importação concluída com preservação dos dossiês automáticos.");
