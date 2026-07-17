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
const signals = [];

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

const analyzedYear = Number(
  payload.metadata?.year ??
    String(files[0]).match(/despesas-l57-(\d{4})/)?.[1] ??
    new Date().getUTCFullYear()
);

// 1. Possíveis documentos repetidos
const duplicateGroups = new Map();

for (const expense of expenses) {
  if (!expense.documentNumber || !expense.supplierTaxId) continue;

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
  if (group.length < 2) continue;
  const first = group[0];

  signals.push({
    ruleType: "documento-repetido",
    category: null,
    deputyId: first.deputyId,
    deputyName: first.deputyName,
    supplierName: first.supplierName,
    supplierTaxId: first.supplierTaxId,
    amount: first.netValue * group.length,
    individualValue: first.netValue,
    severity: first.netValue >= 10_000 ? "alta" : "media",
    occurrence: {
      supplierName: first.supplierName,
      supplierTaxId: first.supplierTaxId,
      category: first.category,
      documentNumber: first.documentNumber,
      documentDate: first.documentDate,
      individualValue: first.netValue,
      relatedAmount: first.netValue * group.length,
      repetitionCount: group.length,
      records: group.map((item) => item.raw)
    }
  });
}

// 2. Concentração de fornecedor em categoria
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
  const supplierKey = expense.supplierTaxId || expense.supplierName;
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
  if (group.total < 100_000) continue;

  for (const supplier of group.suppliers.values()) {
    const share = supplier.total / group.total;
    if (share < 0.5 || supplier.total < 100_000) continue;

    signals.push({
      ruleType: "concentracao-fornecedor",
      category: group.category,
      deputyId: group.deputyId,
      deputyName: group.deputyName,
      supplierName: supplier.name,
      supplierTaxId: supplier.taxId,
      amount: supplier.total,
      individualValue: supplier.total,
      severity: share >= 0.75 ? "alta" : "media",
      occurrence: {
        supplierName: supplier.name,
        supplierTaxId: supplier.taxId,
        category: group.category,
        categoryTotal: group.total,
        supplierTotal: supplier.total,
        share,
        documentCount: supplier.count
      }
    });
  }
}

// 3. Valor extremo dentro da categoria
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
  if (group.length < 30) continue;

  const categoryMedian = median(group.map((item) => item.netValue));
  const mad = median(
    group.map((item) => Math.abs(item.netValue - categoryMedian))
  );
  const threshold = Math.max(
    25_000,
    categoryMedian + Math.max(8 * mad, 5 * categoryMedian)
  );

  for (const expense of group) {
    if (expense.netValue <= threshold) continue;

    signals.push({
      ruleType: "valor-extremo",
      category,
      deputyId: expense.deputyId,
      deputyName: expense.deputyName,
      supplierName: expense.supplierName,
      supplierTaxId: expense.supplierTaxId,
      amount: expense.netValue,
      individualValue: expense.netValue,
      severity: expense.netValue >= threshold * 2 ? "alta" : "media",
      occurrence: {
        supplierName: expense.supplierName,
        supplierTaxId: expense.supplierTaxId,
        category,
        documentNumber: expense.documentNumber,
        documentDate: expense.documentDate,
        amount: expense.netValue,
        median: categoryMedian,
        mad,
        threshold,
        record: expense.raw
      }
    });
  }
}

const definitions = {
  "documento-repetido": {
    title: "Possíveis documentos repetidos no gabinete",
    rule: "Ocorrências com mesmo fornecedor, número, data e valor foram consolidadas por parlamentar e período"
  },
  "concentracao-fornecedor": {
    title: "Concentração de fornecedores em categoria de despesas",
    rule: "Fornecedores com participação igual ou superior a 50% e valor acumulado superior a R$ 100 mil"
  },
  "valor-extremo": {
    title: "Documentos com valor muito acima do padrão da categoria",
    rule: "Documentos acima do limite robusto foram consolidados por parlamentar, categoria e período"
  }
};

const consolidated = new Map();

for (const signal of signals) {
  const categoryKey = signal.category ?? "todas";
  const key = [signal.deputyId, signal.ruleType, categoryKey, analyzedYear].join("|");
  const current = consolidated.get(key) ?? {
    ruleType: signal.ruleType,
    category: signal.category,
    deputyId: signal.deputyId,
    deputyName: signal.deputyName,
    amount: 0,
    largestOccurrence: 0,
    severity: "media",
    suppliers: new Map(),
    occurrences: []
  };

  current.amount += signal.amount;
  current.largestOccurrence = Math.max(
    current.largestOccurrence,
    signal.individualValue ?? signal.amount
  );
  if (signal.severity === "alta") current.severity = "alta";
  current.suppliers.set(
    signal.supplierTaxId || signal.supplierName,
    { name: signal.supplierName, taxId: signal.supplierTaxId }
  );
  current.occurrences.push(signal.occurrence);
  consolidated.set(key, current);
}

const alerts = [...consolidated.values()].map((group) => {
  const definition = definitions[group.ruleType];
  const suppliers = [...group.suppliers.values()];
  const supplierName =
    suppliers.length === 1
      ? suppliers[0].name
      : `${suppliers.length} fornecedores`;

  const id = stableId([
    "alerta-consolidado-v2",
    group.deputyId,
    group.ruleType,
    group.category ?? "todas",
    analyzedYear
  ]);

  return {
    id,
    title: definition.title,
    rule: definition.rule,
    severity: group.severity,
    status: "novo",
    detectedAt: new Date().toISOString(),
    deputyName: group.deputyName,
    supplierName,
    amount: group.amount,
    evidence: {
      consolidationVersion: 2,
      consolidated: true,
      sourceModule: "ceap",
      analyzedYear,
      ruleType: group.ruleType,
      category: group.category,
      occurrenceCount: group.occurrences.length,
      supplierCount: suppliers.length,
      largestOccurrence: group.largestOccurrence,
      suppliers,
      occurrences: group.occurrences
    }
  };
});

alerts.sort((a, b) => {
  const severityOrder = { alta: 0, media: 1, baixa: 2 };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    b.amount - a.amount ||
    a.deputyName.localeCompare(b.deputyName, "pt-BR")
  );
});

const output = path.resolve(
  `data/alerts/alertas-${new Date().toISOString().slice(0, 10)}.json`
);

await writeJson(output, {
  metadata: {
    input: files[0],
    generatedAt: new Date().toISOString(),
    analyzedYear,
    rawSignals: signals.length,
    total: alerts.length,
    consolidationVersion: 2,
    disclaimer:
      "Alertas estatísticos são pistas e não comprovam irregularidade."
  },
  data: alerts
});

console.log(`Sinais técnicos encontrados: ${signals.length}`);
console.log(`Alertas consolidados: ${alerts.length}`);
console.log(`Arquivo gerado: ${output}`);
