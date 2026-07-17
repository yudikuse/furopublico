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

  file = files.at(-1)
    ? path.resolve(directory, files.at(-1))
    : null;
}

if (!file) {
  throw new Error("Nenhum arquivo de alertas encontrado.");
}

console.log(`Lendo alertas de: ${file}`);

const payload = await readJson(file);
const alerts = Array.isArray(payload.data) ? payload.data : [];

const uniqueRows = new Map();

for (const alert of alerts) {
  const externalId = String(alert.id ?? "").trim();

  if (!externalId) {
    console.warn(
      `Alerta ignorado porque não possui ID: ${alert.title ?? "sem título"}`
    );
    continue;
  }

  /*
   * O Map elimina alertas repetidos dentro do mesmo arquivo.
   * Caso o mesmo external_id apareça mais de uma vez,
   * somente uma linha será enviada ao Supabase.
   */
  uniqueRows.set(externalId, {
    external_id: externalId,
    title: String(alert.title ?? "Alerta sem título"),
    rule: String(alert.rule ?? "Regra não informada"),
    severity: ["baixa", "media", "alta"].includes(alert.severity)
      ? alert.severity
      : "media",

    /*
     * Não enviamos "status".
     * Para alertas novos, o banco usa o padrão "novo".
     * Para alertas existentes, isso evita apagar uma revisão humana
     * e voltar o status para "novo".
     */
    detected_at:
      alert.detectedAt ?? new Date().toISOString(),

    deputy_name: alert.deputyName ?? null,
    supplier_name: alert.supplierName ?? null,
    amount:
      typeof alert.amount === "number" && Number.isFinite(alert.amount)
        ? alert.amount
        : null,

    evidence:
      alert.evidence &&
      typeof alert.evidence === "object"
        ? alert.evidence
        : {}
  });
}

const rows = [...uniqueRows.values()];

console.log(`Alertas encontrados no arquivo: ${alerts.length}`);
console.log(`Alertas únicos para importar: ${rows.length}`);
console.log(`Duplicados eliminados: ${alerts.length - rows.length}`);

if (!rows.length) {
  console.log("Nenhum alerta válido para importar.");
  process.exit(0);
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const batchSize = 200;

for (let index = 0; index < rows.length; index += batchSize) {
  const batch = rows.slice(index, index + batchSize);

  const { error } = await supabase
    .from("alerts")
    .upsert(batch, {
      onConflict: "external_id",
      ignoreDuplicates: false
    });

  if (error) {
    console.error("Erro ao importar lote:", {
      inicio: index,
      fim: index + batch.length,
      mensagem: error.message,
      detalhes: error.details,
      dica: error.hint,
      codigo: error.code
    });

    throw error;
  }

  console.log(
    `Importados ${Math.min(index + batch.length, rows.length)} de ${rows.length}`
  );
}

console.log("Importação concluída com sucesso.");
