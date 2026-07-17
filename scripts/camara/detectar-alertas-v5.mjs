import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getArg, numberValue, readJson, writeJson } from "./utils.mjs";

const fileArg = getArg("file");

async function resolveInputFile() {
  if (fileArg) return path.resolve(fileArg);

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

  const latest = files.at(-1);
  console.log(`Usando o arquivo mais recente pelo nome: ${latest}`);
  return path.resolve("data/raw", latest);
}

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function text(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function dateOnly(...values) {
  return text(...values).slice(0, 10);
}

function httpUrl(...values) {
  const candidate = text(...values);
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

function canonicalNumber(value) {
  const number = numberValue(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeRecord(row) {
  const deputyId = text(
    row.idDeputado,
    row.idDeputadoParlamentar,
    row.nuDeputadoId
  );

  const deputyName = text(
    row.nomeDeputado,
    row.txNomeParlamentar,
    row.nomeParlamentar,
    "Não identificado"
  );

  const supplierTaxId = digits(
    row.cnpjCpfFornecedor ?? row.txtCNPJCPF
  );

  const supplierName = text(
    row.nomeFornecedor,
    row.txtFornecedor,
    "Não identificado"
  );

  const category = text(
    row.tipoDespesa,
    row.txtDescricao,
    "Sem categoria"
  );

  const documentNumber = text(
    row.numDocumento,
    row.txtNumero
  );

  const documentDate = dateOnly(
    row.dataDocumento,
    row.datEmissao
  );

  // O identificador oficial agrupa todos os registros referentes ao
  // mesmo comprovante. A própria Câmara informa que um documento pode
  // possuir mais de um registro CEAP.
  const officialDocumentId = text(
    row.ideDocumento,
    row.codDocumento,
    row.idDocumento,
    row.documentCode
  );

  const faceValue = canonicalNumber(
    row.vlrDocumento ?? row.valorDocumento
  );

  const glosaValue = canonicalNumber(
    row.vlrGlosa ?? row.valorGlosa
  );

  const netValue = canonicalNumber(
    row.vlrLiquido ??
      row.valorLiquido ??
      (faceValue - glosaValue)
  );

  const restitutionValue = canonicalNumber(
    row.vlrRestituicao ?? row.valorRestituicao
  );

  const financialMonth = text(row.numMes, row.mes);
  const financialYear = text(row.numAno, row.ano);
  const installment = text(row.numParcela, row.parcela);
  const lot = text(row.numLote, row.codLote);
  const reimbursement = text(row.numRessarcimento);

  const documentUrl = httpUrl(
    row.urlDocumento,
    row.urlDocument,
    row.documentUrl,
    row.url
  );

  // Identidade de um lançamento CEAP. Não usa índice de posição.
  // Duas linhas exatamente iguais na coleta geram a mesma chave e são
  // eliminadas; parcelas, lotes e ressarcimentos distintos continuam
  // preservados como lançamentos diferentes.
  const recordId = stableId([
    "registro-ceap-v5",
    deputyId,
    officialDocumentId,
    supplierTaxId || supplierName,
    documentNumber,
    documentDate,
    category,
    financialYear,
    financialMonth,
    installment,
    lot,
    reimbursement,
    faceValue.toFixed(2),
    glosaValue.toFixed(2),
    netValue.toFixed(2),
    restitutionValue.toFixed(2),
    dateOnly(row.datPagamentoRestituicao),
    text(row.txtPassageiro, row.nomePassageiro),
    text(row.txtTrecho, row.trecho)
  ]);

  // Quando existe, o identificador oficial é a identidade do documento.
  // O fallback usa somente campos documentais, nunca o índice da linha.
  const documentId = officialDocumentId
    ? stableId(["documento-oficial-ceap-v5", deputyId, officialDocumentId])
    : stableId([
        "documento-fallback-ceap-v5",
        deputyId,
        supplierTaxId || supplierName,
        documentNumber,
        documentDate,
        faceValue.toFixed(2),
        category,
        documentUrl
      ]);

  return {
    recordId,
    documentId,
    officialDocumentId,
    deputyId,
    deputyName,
    supplierName,
    supplierTaxId,
    category,
    documentNumber,
    documentDate,
    documentUrl,
    faceValue,
    glosaValue,
    netValue,
    restitutionValue,
    financialMonth,
    financialYear,
    installment,
    lot,
    reimbursement,
    raw: row
  };
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function addAll(target, values) {
  for (const value of values) target.add(value);
}

function sumDocumentAmounts(documentIds, documentsById) {
  let total = 0;
  for (const id of documentIds) {
    total += Number(documentsById.get(id)?.ceapAmount ?? 0);
  }
  return total;
}

function largestDocumentAmount(documentIds, documentsById) {
  let largest = 0;
  for (const id of documentIds) {
    largest = Math.max(
      largest,
      Number(documentsById.get(id)?.ceapAmount ?? 0)
    );
  }
  return largest;
}

function largestFaceValue(documentIds, documentsById) {
  let largest = 0;
  for (const id of documentIds) {
    largest = Math.max(
      largest,
      Math.abs(Number(documentsById.get(id)?.faceValue ?? 0))
    );
  }
  return largest;
}

const inputFile = await resolveInputFile();
const payload = await readJson(inputFile);
const rows = Array.isArray(payload.data) ? payload.data : [];

const normalizedRecords = rows
  .map(normalizeRecord)
  .filter(
    (record) =>
      record.deputyId &&
      (record.netValue !== 0 || record.faceValue !== 0)
  );

// Remove somente repetição exata da linha coletada.
const uniqueRecordsById = new Map();
const exactDuplicatesByDeputy = new Map();

for (const record of normalizedRecords) {
  if (uniqueRecordsById.has(record.recordId)) {
    exactDuplicatesByDeputy.set(
      record.deputyId,
      Number(exactDuplicatesByDeputy.get(record.deputyId) ?? 0) + 1
    );
    continue;
  }

  uniqueRecordsById.set(record.recordId, record);
}

const records = [...uniqueRecordsById.values()];

// Agrupa lançamentos pelo documento oficial.
const documentBuilders = new Map();

for (const record of records) {
  const current = documentBuilders.get(record.documentId) ?? {
    id: record.documentId,
    officialDocumentId: record.officialDocumentId,
    deputyId: record.deputyId,
    deputyName: record.deputyName,
    supplierName: record.supplierName,
    supplierTaxId: record.supplierTaxId,
    category: record.category,
    documentNumber: record.documentNumber,
    documentDate: record.documentDate,
    documentUrl: record.documentUrl,
    faceValues: new Set(),
    ceapAmount: 0,
    restitutionAmount: 0,
    recordIds: new Set(),
    records: []
  };

  if (!current.documentUrl && record.documentUrl) {
    current.documentUrl = record.documentUrl;
  }

  if (!current.documentNumber && record.documentNumber) {
    current.documentNumber = record.documentNumber;
  }

  if (!current.documentDate && record.documentDate) {
    current.documentDate = record.documentDate;
  }

  if (record.faceValue !== 0) {
    current.faceValues.add(record.faceValue);
  }

  current.ceapAmount += record.netValue;
  current.restitutionAmount += record.restitutionValue;
  current.recordIds.add(record.recordId);
  current.records.push(record.raw);
  documentBuilders.set(record.documentId, current);
}

const documents = [...documentBuilders.values()].map((builder) => {
  const faceValues = [...builder.faceValues];
  const faceValue = faceValues.length
    ? faceValues.reduce((largest, value) =>
        Math.abs(value) > Math.abs(largest) ? value : largest
      )
    : 0;

  return {
    id: builder.id,
    officialDocumentId: builder.officialDocumentId,
    deputyId: builder.deputyId,
    deputyName: builder.deputyName,
    supplierName: builder.supplierName,
    supplierTaxId: builder.supplierTaxId,
    category: builder.category,
    documentNumber: builder.documentNumber,
    documentDate: builder.documentDate,
    documentUrl: builder.documentUrl,
    faceValue,
    ceapAmount: builder.ceapAmount,
    restitutionAmount: builder.restitutionAmount,
    recordCount: builder.recordIds.size,
    recordIds: [...builder.recordIds],
    records: builder.records,
    faceValueConflict: faceValues.length > 1,
    faceValues
  };
});

const documentsById = new Map(
  documents.map((document) => [document.id, document])
);

const analyzedYear = Number(
  payload.metadata?.year ??
    String(inputFile).match(/despesas-l57-(\d{4})/)?.[1] ??
    new Date().getUTCFullYear()
);

const definitions = {
  "documento-repetido": {
    title: "Possível duplicidade documental",
    shortLabel: "Duplicidade documental",
    rule:
      "Dois ou mais identificadores oficiais distintos compartilham fornecedor, número, data e valor de face. Exige conferência dos documentos e dos lançamentos CEAP."
  },
  "concentracao-fornecedor": {
    title: "Concentração de fornecedor",
    shortLabel: "Concentração",
    rule:
      "Fornecedor representa ao menos 50% da categoria e acumula mais de R$ 100 mil em lançamentos CEAP únicos."
  },
  "valor-extremo": {
    title: "Documento com valor extremo",
    shortLabel: "Valor extremo",
    rule:
      "Valor de face do documento ultrapassa o limite robusto calculado para a categoria."
  }
};

const signals = [];

// ============================================================
// 1. POSSÍVEL DUPLICIDADE DOCUMENTAL
// ============================================================
// Um único ideDocumento/codDocumento com vários registros NÃO é duplicidade.
// Só há candidato quando existem documentos oficiais distintos com os
// mesmos dados fiscais básicos.

const duplicateCandidates = new Map();

for (const document of documents) {
  if (
    !document.officialDocumentId ||
    !document.documentNumber ||
    !document.supplierTaxId ||
    document.faceValue === 0
  ) {
    continue;
  }

  const key = [
    document.deputyId,
    document.supplierTaxId,
    document.documentNumber,
    document.documentDate,
    document.faceValue.toFixed(2)
  ].join("|");

  const group = duplicateCandidates.get(key) ?? [];
  group.push(document);
  duplicateCandidates.set(key, group);
}

for (const group of duplicateCandidates.values()) {
  const officialIds = new Set(
    group.map((document) => document.officialDocumentId)
  );

  if (officialIds.size < 2) continue;

  const first = group[0];
  const documentIds = [...new Set(group.map((document) => document.id))];
  const relatedAmount = sumDocumentAmounts(documentIds, documentsById);

  signals.push({
    id: stableId([
      "sinal-v5",
      "documento-repetido",
      first.deputyId,
      first.supplierTaxId,
      first.documentNumber,
      first.documentDate,
      first.faceValue.toFixed(2),
      ...[...officialIds].sort()
    ]),
    ruleType: "documento-repetido",
    category: first.category,
    deputyId: first.deputyId,
    deputyName: first.deputyName,
    supplierName: first.supplierName,
    supplierTaxId: first.supplierTaxId,
    amount: relatedAmount,
    individualValue: largestDocumentAmount(documentIds, documentsById),
    faceValue: first.faceValue,
    severity: "media",
    documentIds,
    occurrence: {
      supplierName: first.supplierName,
      supplierTaxId: first.supplierTaxId,
      category: first.category,
      documentNumber: first.documentNumber,
      documentDate: first.documentDate,
      faceValue: first.faceValue,
      relatedAmount,
      documentCount: documentIds.length,
      repetitionCount: documentIds.length,
      officialDocumentIds: [...officialIds],
      documentIds
    }
  });
}

// ============================================================
// 2. CONCENTRAÇÃO DE FORNECEDOR EM CATEGORIA
// ============================================================

const categoryGroups = new Map();

for (const document of documents) {
  if (document.ceapAmount <= 0) continue;

  const key = `${document.deputyId}|${document.category}`;
  const group = categoryGroups.get(key) ?? {
    total: 0,
    deputyId: document.deputyId,
    deputyName: document.deputyName,
    category: document.category,
    suppliers: new Map()
  };

  group.total += document.ceapAmount;

  const supplierKey =
    document.supplierTaxId || document.supplierName;

  const supplier = group.suppliers.get(supplierKey) ?? {
    name: document.supplierName,
    taxId: document.supplierTaxId,
    total: 0,
    documentIds: new Set()
  };

  supplier.total += document.ceapAmount;
  supplier.documentIds.add(document.id);
  group.suppliers.set(supplierKey, supplier);
  categoryGroups.set(key, group);
}

for (const group of categoryGroups.values()) {
  if (group.total < 100_000) continue;

  for (const supplier of group.suppliers.values()) {
    const share = supplier.total / group.total;
    if (share < 0.5 || supplier.total < 100_000) continue;

    const documentIds = [...supplier.documentIds];

    signals.push({
      id: stableId([
        "sinal-v5",
        "concentracao-fornecedor",
        group.deputyId,
        group.category,
        supplier.taxId || supplier.name
      ]),
      ruleType: "concentracao-fornecedor",
      category: group.category,
      deputyId: group.deputyId,
      deputyName: group.deputyName,
      supplierName: supplier.name,
      supplierTaxId: supplier.taxId,
      amount: supplier.total,
      individualValue: largestDocumentAmount(
        documentIds,
        documentsById
      ),
      faceValue: largestFaceValue(documentIds, documentsById),
      severity: share >= 0.75 ? "alta" : "media",
      documentIds,
      occurrence: {
        supplierName: supplier.name,
        supplierTaxId: supplier.taxId,
        category: group.category,
        categoryTotal: group.total,
        supplierTotal: supplier.total,
        relatedAmount: supplier.total,
        share,
        documentCount: documentIds.length,
        documentIds
      }
    });
  }
}

// ============================================================
// 3. VALOR EXTREMO NO NÍVEL DO DOCUMENTO
// ============================================================

const byCategory = new Map();

for (const document of documents) {
  const comparisonValue = Math.abs(
    document.faceValue || document.ceapAmount
  );

  if (comparisonValue <= 0) continue;

  const values = byCategory.get(document.category) ?? [];
  values.push({ document, comparisonValue });
  byCategory.set(document.category, values);
}

for (const [category, group] of byCategory) {
  if (group.length < 30) continue;

  const categoryMedian = median(
    group.map((item) => item.comparisonValue)
  );

  const mad = median(
    group.map((item) =>
      Math.abs(item.comparisonValue - categoryMedian)
    )
  );

  const threshold = Math.max(
    25_000,
    categoryMedian + Math.max(8 * mad, 5 * categoryMedian)
  );

  for (const { document, comparisonValue } of group) {
    if (comparisonValue <= threshold) continue;

    signals.push({
      id: stableId([
        "sinal-v5",
        "valor-extremo",
        document.deputyId,
        document.id
      ]),
      ruleType: "valor-extremo",
      category,
      deputyId: document.deputyId,
      deputyName: document.deputyName,
      supplierName: document.supplierName,
      supplierTaxId: document.supplierTaxId,
      amount: document.ceapAmount,
      individualValue: document.ceapAmount,
      faceValue: document.faceValue,
      severity: comparisonValue >= threshold * 2 ? "alta" : "media",
      documentIds: [document.id],
      occurrence: {
        supplierName: document.supplierName,
        supplierTaxId: document.supplierTaxId,
        category,
        documentNumber: document.documentNumber,
        documentDate: document.documentDate,
        faceValue: document.faceValue,
        relatedAmount: document.ceapAmount,
        comparisonValue,
        median: categoryMedian,
        mad,
        threshold,
        documentCount: 1,
        documentIds: [document.id]
      }
    });
  }
}

// ============================================================
// CONSOLIDAÇÃO EDITORIAL: UM CASO POR PARLAMENTAR E ANO
// ============================================================

const byDeputy = new Map();

for (const signal of signals) {
  const key = `${signal.deputyId}|${analyzedYear}`;

  const current = byDeputy.get(key) ?? {
    deputyId: signal.deputyId,
    deputyName: signal.deputyName,
    analyzedYear,
    severity: "media",
    documents: new Map(),
    documentRuleTypes: new Map(),
    recordIds: new Set(),
    suppliers: new Map(),
    categories: new Map(),
    ruleGroups: new Map(),
    occurrences: []
  };

  if (signal.severity === "alta") current.severity = "alta";

  for (const documentId of signal.documentIds) {
    const document = documentsById.get(documentId);
    if (!document) continue;

    current.documents.set(documentId, document);
    addAll(current.recordIds, document.recordIds);

    const ruleTypes =
      current.documentRuleTypes.get(documentId) ?? new Set();
    ruleTypes.add(signal.ruleType);
    current.documentRuleTypes.set(documentId, ruleTypes);
  }

  const supplierKey =
    signal.supplierTaxId ||
    signal.supplierName ||
    "nao-identificado";

  const supplier = current.suppliers.get(supplierKey) ?? {
    name: signal.supplierName,
    taxId: signal.supplierTaxId,
    documentIds: new Set(),
    occurrenceCount: 0,
    categories: new Set(),
    ruleTypes: new Set()
  };

  addAll(supplier.documentIds, signal.documentIds);
  supplier.occurrenceCount += 1;
  if (signal.category) supplier.categories.add(signal.category);
  supplier.ruleTypes.add(signal.ruleType);
  current.suppliers.set(supplierKey, supplier);

  const categoryName =
    signal.category || "Sem categoria específica";

  const category = current.categories.get(categoryName) ?? {
    name: categoryName,
    documentIds: new Set(),
    occurrenceCount: 0,
    supplierKeys: new Set(),
    ruleTypes: new Set()
  };

  addAll(category.documentIds, signal.documentIds);
  category.occurrenceCount += 1;
  category.supplierKeys.add(supplierKey);
  category.ruleTypes.add(signal.ruleType);
  current.categories.set(categoryName, category);

  const definition = definitions[signal.ruleType];
  const rule = current.ruleGroups.get(signal.ruleType) ?? {
    ruleType: signal.ruleType,
    title: definition.title,
    shortLabel: definition.shortLabel,
    rule: definition.rule,
    documentIds: new Set(),
    occurrenceCount: 0,
    supplierKeys: new Set(),
    categories: new Set()
  };

  addAll(rule.documentIds, signal.documentIds);
  rule.occurrenceCount += 1;
  rule.supplierKeys.add(supplierKey);
  if (signal.category) rule.categories.add(signal.category);
  current.ruleGroups.set(signal.ruleType, rule);

  current.occurrences.push({
    id: signal.id,
    ...signal.occurrence,
    ruleType: signal.ruleType,
    ruleLabel: definition.shortLabel,
    ruleDescription: definition.rule,
    severity: signal.severity,
    relatedAmount: signal.amount,
    individualValue: signal.individualValue,
    faceValue: signal.faceValue,
    documentIds: signal.documentIds
  });

  byDeputy.set(key, current);
}

const alerts = [...byDeputy.values()].map((group) => {
  const caseDocuments = [...group.documents.values()]
    .map((document) => ({
      ...document,
      ruleTypes: [
        ...(group.documentRuleTypes.get(document.id) ?? [])
      ]
    }))
    .sort(
      (a, b) =>
        String(b.documentDate).localeCompare(
          String(a.documentDate)
        ) || b.ceapAmount - a.ceapAmount
    );

  const suppliers = [...group.suppliers.values()]
    .map((supplier) => {
      const documentIds = [...supplier.documentIds];
      return {
        name: supplier.name,
        taxId: supplier.taxId,
        amount: sumDocumentAmounts(documentIds, group.documents),
        largestOccurrence: largestDocumentAmount(
          documentIds,
          group.documents
        ),
        occurrenceCount: supplier.occurrenceCount,
        documentCount: documentIds.length,
        documentIds,
        categories: [...supplier.categories],
        ruleTypes: [...supplier.ruleTypes]
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const categories = [...group.categories.values()]
    .map((category) => {
      const documentIds = [...category.documentIds];
      return {
        name: category.name,
        amount: sumDocumentAmounts(documentIds, group.documents),
        occurrenceCount: category.occurrenceCount,
        supplierCount: category.supplierKeys.size,
        documentCount: documentIds.length,
        documentIds,
        ruleTypes: [...category.ruleTypes]
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const ruleGroups = [...group.ruleGroups.values()]
    .map((rule) => {
      const documentIds = [...rule.documentIds];
      return {
        ruleType: rule.ruleType,
        title: rule.title,
        shortLabel: rule.shortLabel,
        rule: rule.rule,
        amount: sumDocumentAmounts(documentIds, group.documents),
        largestOccurrence: largestDocumentAmount(
          documentIds,
          group.documents
        ),
        occurrenceCount: rule.occurrenceCount,
        supplierCount: rule.supplierKeys.size,
        documentCount: documentIds.length,
        documentIds,
        categories: [...rule.categories]
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const financialAmount = caseDocuments.reduce(
    (total, document) => total + document.ceapAmount,
    0
  );

  const largestDocument = caseDocuments.reduce(
    (largest, document) =>
      Math.max(largest, Number(document.ceapAmount ?? 0)),
    0
  );

  const largestFace = caseDocuments.reduce(
    (largest, document) =>
      Math.max(largest, Math.abs(Number(document.faceValue ?? 0))),
    0
  );

  const highCount = group.occurrences.filter(
    (item) => item.severity === "alta"
  ).length;

  const id = stableId([
    "alerta-parlamentar-v3",
    group.deputyId,
    analyzedYear
  ]);

  return {
    id,
    title: `Sinais de despesas no gabinete de ${group.deputyName}`,
    rule:
      "Sinais técnicos da CEAP consolidados por parlamentar e período; documentos oficiais agrupam seus lançamentos financeiros.",
    severity: group.severity,
    status: "novo",
    detectedAt: new Date().toISOString(),
    deputyName: group.deputyName,
    supplierName: `${suppliers.length} fornecedor(es)`,
    amount: financialAmount,
    evidence: {
      consolidationVersion: 5,
      consolidated: true,
      consolidationLevel: "deputy",
      sourceModule: "ceap",
      deputyId: group.deputyId,
      analyzedYear,
      ruleType: "parliamentary-overview",
      financialAmount,
      ruleCount: ruleGroups.length,
      occurrenceCount: group.occurrences.length,
      signalCount: group.occurrences.length,
      supplierCount: suppliers.length,
      categoryCount: categories.length,
      documentCount: caseDocuments.length,
      recordCount: group.recordIds.size,
      highPriorityCount: highCount,
      largestOccurrence: largestDocument,
      largestDocument,
      largestFaceValue: largestFace,
      suppliers,
      categories,
      ruleGroups,
      documents: caseDocuments,
      occurrences: group.occurrences,
      dataQuality: {
        rawRecordCount: normalizedRecords.filter(
          (record) => record.deputyId === group.deputyId
        ).length,
        uniqueRecordCount: records.filter(
          (record) => record.deputyId === group.deputyId
        ).length,
        exactDuplicateRecordCount: Number(
          exactDuplicatesByDeputy.get(group.deputyId) ?? 0
        ),
        linkedRecordCount: group.recordIds.size,
        documentsWithMultipleRecords: caseDocuments.filter(
          (document) => document.recordCount > 1
        ).length
      },
      financialRule:
        "Valor CEAP relacionado = soma de vlrLiquido/valorLiquido dos lançamentos únicos vinculados aos sinais. Valor de face do PDF é exibido separadamente e nunca é somado por quantidade de linhas.",
      disclaimer:
        "Sinais estatísticos são pistas. Não comprovam irregularidade, parentesco ou favorecimento. Um documento pode ter vários lançamentos CEAP legítimos."
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
    input: inputFile,
    generatedAt: new Date().toISOString(),
    analyzedYear,
    rawRecordCount: normalizedRecords.length,
    uniqueRecordCount: records.length,
    exactDuplicateRecordCount:
      normalizedRecords.length - records.length,
    documentCount: documents.length,
    rawSignals: signals.length,
    total: alerts.length,
    consolidationVersion: 5,
    consolidationLevel: "deputy",
    financialRule:
      "Documentos são agrupados por ideDocumento/codDocumento; lançamentos CEAP únicos compõem o valor financeiro.",
    disclaimer:
      "Alertas estatísticos são pistas e não comprovam irregularidade."
  },
  data: alerts
});

console.log(`Linhas recebidas: ${rows.length}`);
console.log(`Registros CEAP normalizados: ${normalizedRecords.length}`);
console.log(`Registros CEAP únicos: ${records.length}`);
console.log(
  `Repetições exatas removidas: ${normalizedRecords.length - records.length}`
);
console.log(`Documentos oficiais/fallback agrupados: ${documents.length}`);
console.log(`Sinais técnicos encontrados: ${signals.length}`);
console.log(`Parlamentares com sinais: ${alerts.length}`);
console.log(`Arquivo gerado: ${output}`);
