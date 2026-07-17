import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getArg, numberValue, readJson, writeJson } from "./utils.mjs";

const fileArg = getArg("file");

if (!fileArg) {
  const files = (await fs.readdir(path.resolve("data/raw")))
    .filter(
      (name) =>
        name.startsWith("despesas-l57-") && name.endsWith(".json")
    )
    .sort();

  if (!files.length) {
    throw new Error(
      "Nenhum arquivo de despesas encontrado. Rode camara:despesas primeiro."
    );
  }

  console.log(`Usando o arquivo mais recente pelo nome: ${files.at(-1)}`);
}

const files = fileArg
  ? [path.resolve(fileArg)]
  : [
      (await fs.readdir(path.resolve("data/raw")))
        .filter(
          (name) =>
            name.startsWith("despesas-l57-") && name.endsWith(".json")
        )
        .sort()
        .map((name) => path.resolve("data/raw", name))
        .at(-1)
    ];

const payload = await readJson(files[0]);
const rows = payload.data ?? [];
const alerts = [];

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function normalize(row) {
  return {
    deputyId: String(
      row.idDeputado ?? row.idDeputadoParlamentar ?? ""
    ),

    deputyName: String(
      row.nomeDeputado ??
        row.txNomeParlamentar ??
        "Não identificado"
    ),

    supplierTaxId: String(
      row.cnpjCpfFornecedor ?? row.txtCNPJCPF ?? ""
    ).replace(/\D/g, ""),

    supplierName: String(
      row.nomeFornecedor ??
        row.txtFornecedor ??
        "Não identificado"
    ).trim(),

    documentNumber: String(
      row.numDocumento ?? row.txtNumero ?? ""
    ).trim(),

    documentDate: String(
      row.dataDocumento ?? row.datEmissao ?? ""
    ).slice(0, 10),

    netValue: numberValue(
      row.valorLiquido ??
        row.vlrLiquido ??
        row.valorDocumento
    ),

    category: String(
      row.tipoDespesa ??
        row.txtDescricao ??
        "Sem categoria"
    ),

    raw: row
  };
}

const expenses = rows
  .map(normalize)
  .filter((row) => row.netValue > 0);

// ============================================================
// 1. POSSÍVEIS DOCUMENTOS REPETIDOS NO MESMO GABINETE
// ============================================================

const duplicateGroups = new Map();

for (const expense of expenses) {
  if (!expense.documentNumber || !expense.supplierTaxId) {
    continue;
  }

  const key = [
    expense.deputyId,
    expense.supplierTaxId,
    expense.documentNumber,
    expense.documentDate,
    expense.netValue.toFixed(2)
  ].join("|");

  const group = duplicateGroups.get(key) ?? [];
  group.push(expense);
  duplicateGroups.set(key, group);
}

for (const group of duplicateGroups.values()) {
  if (group.length < 2) {
    continue;
  }

  const first = group[0];

  alerts.push({
    id: stableId([
      "documento-repetido",
      first.deputyId,
      first.supplierTaxId,
      first.documentNumber,
      first.documentDate,
      first.netValue.toFixed(2)
    ]),

    title: "Possível documento repetido no mesmo gabinete",

    rule:
      "Mesmo fornecedor, número, data e valor aparece mais de uma vez",

    severity: first.netValue >= 10_000 ? "alta" : "media",

    status: "novo",

    detectedAt: new Date().toISOString(),

    deputyName: first.deputyName,

    supplierName: first.supplierName,

    amount: first.netValue * group.length,

    evidence: {
      count: group.length,
      documentNumber: first.documentNumber,
      documentDate: first.documentDate,
      individualValue: first.netValue,
      records: group.map((item) => item.raw)
    }
  });
}

// ============================================================
// 2. CONCENTRAÇÃO DE FORNECEDOR EM UMA CATEGORIA
// ============================================================

const categoryGroups = new Map();

for (const expense of expenses) {
  const key = `${expense.deputyId}|${expense.category}`;

  const group = categoryGroups.get(key) ?? {
    total: 0,
    deputyId: expense.deputyId,
    deputyName: expense.deputyName,
    category: expense.category,
    suppliers: new Map()
  };

  group.total += expense.netValue;

  const supplierKey =
    expense.supplierTaxId || expense.supplierName;

  const supplier = group.suppliers.get(supplierKey) ?? {
    name: expense.supplierName,
    taxId: expense.supplierTaxId,
    total: 0,
    count: 0
  };

  supplier.total += expense.netValue;
  supplier.count += 1;

  group.suppliers.set(supplierKey, supplier);
  categoryGroups.set(key, group);
}

for (const group of categoryGroups.values()) {
  if (group.total < 100_000) {
    continue;
  }

  for (const supplier of group.suppliers.values()) {
    const share = supplier.total / group.total;

    if (share < 0.5 || supplier.total < 100_000) {
      continue;
    }

    alerts.push({
      id: stableId([
        "concentracao-fornecedor",
        group.deputyId,
        group.category,
        supplier.taxId || supplier.name
      ]),

      title:
        "Fornecedor concentra a maior parte de uma categoria de despesas",

      rule:
        "Participação igual ou superior a 50% e valor acumulado superior a R$ 100 mil",

      severity: share >= 0.75 ? "alta" : "media",

      status: "novo",

      detectedAt: new Date().toISOString(),

      deputyName: group.deputyName,

      supplierName: supplier.name,

      amount: supplier.total,

      evidence: {
        category: group.category,
        categoryTotal: group.total,
        supplierTotal: supplier.total,
        share,
        documentCount: supplier.count,
        supplierTaxId: supplier.taxId
      }
    });
  }
}

// ============================================================
// 3. VALOR EXTREMO DENTRO DA CATEGORIA
// ============================================================

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const byCategory = new Map();

for (const expense of expenses) {
  const values = byCategory.get(expense.category) ?? [];
  values.push(expense);
  byCategory.set(expense.category, values);
}

for (const [category, group] of byCategory) {
  if (group.length < 30) {
    continue;
  }

  const categoryMedian = median(
    group.map((item) => item.netValue)
  );

  const mad = median(
    group.map((item) =>
      Math.abs(item.netValue - categoryMedian)
    )
  );

  const threshold = Math.max(
    25_000,
    categoryMedian + Math.max(8 * mad, 5 * categoryMedian)
  );

  for (const expense of group) {
    if (expense.netValue <= threshold) {
      continue;
    }

    alerts.push({
      id: stableId([
        "valor-extremo",
        expense.deputyId,
        expense.supplierTaxId || expense.supplierName,
        expense.documentNumber,
        expense.documentDate,
        expense.netValue.toFixed(2),
        category
      ]),

      title:
        "Documento com valor muito acima do padrão da categoria",

      rule:
        "Valor supera limite robusto calculado por mediana e desvio absoluto mediano",

      severity:
        expense.netValue >= threshold * 2
          ? "alta"
          : "media",

      status: "novo",

      detectedAt: new Date().toISOString(),

      deputyName: expense.deputyName,

      supplierName: expense.supplierName,

      amount: expense.netValue,

      evidence: {
        category,
        median: categoryMedian,
        mad,
        threshold,
        documentNumber: expense.documentNumber,
        documentDate: expense.documentDate,
        record: expense.raw
      }
    });
  }
}

// ============================================================
// GRAVAÇÃO DO ARQUIVO DE ALERTAS
// ============================================================

const output = path.resolve(
  `data/alerts/alertas-${new Date()
    .toISOString()
    .slice(0, 10)}.json`
);

await writeJson(output, {
  metadata: {
    input: files[0],
    generatedAt: new Date().toISOString(),
    total: alerts.length,
    disclaimer:
      "Alertas estatísticos são pistas e não comprovam irregularidade."
  },

  data: alerts
});

console.log(`Alertas encontrados: ${alerts.length}`);
console.log(`Arquivo gerado: ${output}`);
