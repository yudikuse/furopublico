"use client";

import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  alert: InvestigationAlert;
};

type RawRecord = Record<string, unknown>;

type EvidenceDocument = {
  id: string;
  officialDocumentId?: string;
  supplierName: string;
  supplierTaxId?: string;
  category: string;
  documentNumber?: string;
  documentDate?: string;
  documentUrl?: string;
  faceValue: number;
  ceapAmount: number;
  restitutionAmount: number;
  recordCount: number;
  ruleTypes: string[];
  records?: RawRecord[];
};

type Occurrence = {
  id?: string;
  ruleType?: string;
  ruleLabel?: string;
  ruleDescription?: string;
  severity?: "baixa" | "media" | "alta";
  supplierName?: string;
  supplierTaxId?: string;
  category?: string;
  documentNumber?: string;
  documentDate?: string;
  faceValue?: number;
  individualValue?: number;
  relatedAmount?: number;
  repetitionCount?: number;
  supplierTotal?: number;
  categoryTotal?: number;
  share?: number;
  documentCount?: number;
  amount?: number;
  threshold?: number;
  documentIds?: string[];
  officialDocumentIds?: string[];
  records?: RawRecord[];
  record?: RawRecord;
};

type RuleDefinition = {
  ruleType: string;
  title: string;
  shortLabel: string;
  rule: string;
};

type SupplierSummary = {
  name: string;
  taxId?: string;
  amount: number;
  largestDocument: number;
  signalCount: number;
  documentIds: string[];
  categories: string[];
  ruleTypes: string[];
};

type CategorySummary = {
  name: string;
  amount: number;
  signalCount: number;
  supplierCount: number;
  documentIds: string[];
  ruleTypes: string[];
};

type RuleSummary = RuleDefinition & {
  amount: number;
  signalCount: number;
  supplierCount: number;
  documentIds: string[];
  categories: string[];
};

type View = "overview" | "suppliers" | "signals" | "documents";
type Sort = "amount-desc" | "largest-desc" | "signals-desc" | "name-asc";

function text(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function digits(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function validUrl(value: unknown) {
  const candidate = text(value);
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

function recordField(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function recordNumber(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") {
      return numeric(value);
    }
  }
  return 0;
}

function ruleLabel(ruleType?: string) {
  const labels: Record<string, string> = {
    "documento-repetido": "Duplicidade documental",
    "concentracao-fornecedor": "Concentração",
    "valor-extremo": "Valor extremo"
  };

  return labels[String(ruleType)] ?? "Outro sinal";
}

function ruleDescription(ruleType?: string) {
  const descriptions: Record<string, string> = {
    "documento-repetido":
      "Documentos oficiais distintos compartilham fornecedor, número, data e valor de face. Requer conferência.",
    "concentracao-fornecedor":
      "Fornecedor concentra parcela relevante da categoria. O total é agregado e deve ser aberto como lista de documentos.",
    "valor-extremo":
      "Valor de face do documento ultrapassa o limite estatístico da categoria."
  };

  return (
    descriptions[String(ruleType)] ??
    "Sinal técnico que exige conferência documental."
  );
}

function canonicalRecordKey(record: RawRecord) {
  return [
    recordField(record, ["nuDeputadoId", "idDeputado", "idDeputadoParlamentar"]),
    recordField(record, ["ideDocumento", "codDocumento", "idDocumento"]),
    recordField(record, ["txtCNPJCPF", "cnpjCpfFornecedor"]),
    recordField(record, ["txtNumero", "numDocumento"]),
    recordField(record, ["datEmissao", "dataDocumento"]).slice(0, 10),
    recordField(record, ["txtDescricao", "tipoDespesa"]),
    recordField(record, ["numAno", "ano"]),
    recordField(record, ["numMes", "mes"]),
    recordField(record, ["numParcela", "parcela"]),
    recordField(record, ["numLote", "codLote"]),
    recordField(record, ["numRessarcimento"]),
    recordNumber(record, ["vlrDocumento", "valorDocumento"]).toFixed(2),
    recordNumber(record, ["vlrGlosa", "valorGlosa"]).toFixed(2),
    recordNumber(record, ["vlrLiquido", "valorLiquido"]).toFixed(2),
    recordNumber(record, ["vlrRestituicao", "valorRestituicao"]).toFixed(2),
    recordField(record, ["datPagamentoRestituicao"])
  ].join("|");
}

function rawDocumentKey(record: RawRecord) {
  const deputyId = recordField(record, [
    "nuDeputadoId",
    "idDeputado",
    "idDeputadoParlamentar"
  ]);
  const officialId = recordField(record, [
    "ideDocumento",
    "codDocumento",
    "idDocumento"
  ]);

  if (officialId) return `official:${deputyId}:${officialId}`;

  return [
    "fallback",
    deputyId,
    digits(recordField(record, ["txtCNPJCPF", "cnpjCpfFornecedor"])) ||
      recordField(record, ["txtFornecedor", "nomeFornecedor"]),
    recordField(record, ["txtNumero", "numDocumento"]),
    recordField(record, ["datEmissao", "dataDocumento"]).slice(0, 10),
    recordNumber(record, ["vlrDocumento", "valorDocumento"]).toFixed(2),
    recordField(record, ["txtDescricao", "tipoDespesa"]),
    validUrl(
      record.urlDocumento ??
        record.urlDocument ??
        record.documentUrl ??
        record.url
    )
  ].join("|");
}

function groupLegacyRecords(records: RawRecord[]) {
  const uniqueRecords = new Map<string, RawRecord>();

  for (const record of records) {
    const key = canonicalRecordKey(record);
    if (!uniqueRecords.has(key)) uniqueRecords.set(key, record);
  }

  const builders = new Map<
    string,
    {
      id: string;
      officialDocumentId?: string;
      supplierName: string;
      supplierTaxId?: string;
      category: string;
      documentNumber?: string;
      documentDate?: string;
      documentUrl?: string;
      faceValues: number[];
      ceapAmount: number;
      restitutionAmount: number;
      records: RawRecord[];
    }
  >();

  for (const record of uniqueRecords.values()) {
    const key = rawDocumentKey(record);
    const officialDocumentId = recordField(record, [
      "ideDocumento",
      "codDocumento",
      "idDocumento"
    ]);

    const current = builders.get(key) ?? {
      id: key,
      officialDocumentId,
      supplierName:
        recordField(record, ["txtFornecedor", "nomeFornecedor"]) ||
        "Não identificado",
      supplierTaxId: digits(
        recordField(record, ["txtCNPJCPF", "cnpjCpfFornecedor"])
      ),
      category:
        recordField(record, ["txtDescricao", "tipoDespesa"]) ||
        "Sem categoria",
      documentNumber: recordField(record, ["txtNumero", "numDocumento"]),
      documentDate: recordField(record, ["datEmissao", "dataDocumento"]).slice(
        0,
        10
      ),
      documentUrl: validUrl(
        record.urlDocumento ??
          record.urlDocument ??
          record.documentUrl ??
          record.url
      ),
      faceValues: [],
      ceapAmount: 0,
      restitutionAmount: 0,
      records: []
    };

    const faceValue = recordNumber(record, ["vlrDocumento", "valorDocumento"]);
    const glosa = recordNumber(record, ["vlrGlosa", "valorGlosa"]);
    const ceap = recordNumber(record, ["vlrLiquido", "valorLiquido"]);

    if (faceValue !== 0) current.faceValues.push(faceValue);
    current.ceapAmount += ceap || faceValue - glosa;
    current.restitutionAmount += recordNumber(record, [
      "vlrRestituicao",
      "valorRestituicao"
    ]);
    current.records.push(record);
    builders.set(key, current);
  }

  return [...builders.values()].map<EvidenceDocument>((item) => ({
    id: item.id,
    officialDocumentId: item.officialDocumentId,
    supplierName: item.supplierName,
    supplierTaxId: item.supplierTaxId,
    category: item.category,
    documentNumber: item.documentNumber,
    documentDate: item.documentDate,
    documentUrl: item.documentUrl,
    faceValue: item.faceValues.reduce(
      (largest, value) =>
        Math.abs(value) > Math.abs(largest) ? value : largest,
      0
    ),
    ceapAmount: item.ceapAmount,
    restitutionAmount: item.restitutionAmount,
    recordCount: item.records.length,
    ruleTypes: [],
    records: item.records
  }));
}

function normalizeV5Document(value: unknown): EvidenceDocument | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;

  const records = Array.isArray(item.records)
    ? item.records.filter(
        (record): record is RawRecord =>
          Boolean(record) && typeof record === "object"
      )
    : [];

  return {
    id: text(item.id),
    officialDocumentId: text(
      item.officialDocumentId,
      item.documentCode
    ),
    supplierName: text(item.supplierName, "Não identificado"),
    supplierTaxId: digits(text(item.supplierTaxId)),
    category: text(item.category, "Sem categoria"),
    documentNumber: text(item.documentNumber),
    documentDate: text(item.documentDate).slice(0, 10),
    documentUrl: validUrl(item.documentUrl),
    faceValue: numeric(item.faceValue ?? item.amount),
    ceapAmount: numeric(item.ceapAmount ?? item.amount),
    restitutionAmount: numeric(item.restitutionAmount),
    recordCount: Math.max(1, numeric(item.recordCount) || records.length),
    ruleTypes: Array.isArray(item.ruleTypes)
      ? item.ruleTypes.map((rule) => text(rule)).filter(Boolean)
      : [],
    records
  };
}

function collectDocuments(
  version: number,
  explicitDocuments: unknown[],
  occurrences: Occurrence[]
) {
  if (version >= 5 && explicitDocuments.length) {
    return explicitDocuments
      .map(normalizeV5Document)
      .filter((item): item is EvidenceDocument => Boolean(item?.id));
  }

  const rawRecords: RawRecord[] = [];

  for (const value of explicitDocuments) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;

    if (item.record && typeof item.record === "object") {
      rawRecords.push(item.record as RawRecord);
    }

    if (Array.isArray(item.records)) {
      for (const record of item.records) {
        if (record && typeof record === "object") {
          rawRecords.push(record as RawRecord);
        }
      }
    }
  }

  for (const occurrence of occurrences) {
    if (occurrence.record) rawRecords.push(occurrence.record);
    if (occurrence.records) rawRecords.push(...occurrence.records);
  }

  if (rawRecords.length) return groupLegacyRecords(rawRecords);

  return explicitDocuments
    .map(normalizeV5Document)
    .filter((item): item is EvidenceDocument => Boolean(item?.id));
}

function sameSupplier(item: Occurrence, document: EvidenceDocument) {
  const itemTaxId = digits(item.supplierTaxId);
  const documentTaxId = digits(document.supplierTaxId);

  if (itemTaxId && documentTaxId) return itemTaxId === documentTaxId;
  return text(item.supplierName) === text(document.supplierName);
}

function linkedDocumentIds(
  item: Occurrence,
  documents: EvidenceDocument[],
  documentsById: Map<string, EvidenceDocument>
) {
  const explicit = [...new Set(item.documentIds ?? [])].filter((id) =>
    documentsById.has(id)
  );

  if (explicit.length) return explicit;

  return documents
    .filter((document) => {
      if (!sameSupplier(item, document)) return false;
      if (item.category && item.category !== document.category) return false;

      if (item.ruleType === "concentracao-fornecedor") return true;

      if (
        item.documentNumber &&
        item.documentNumber !== document.documentNumber
      ) {
        return false;
      }

      if (item.documentDate && item.documentDate !== document.documentDate) {
        return false;
      }

      const expectedFace = numeric(item.faceValue);
      if (
        expectedFace &&
        Math.abs(expectedFace - document.faceValue) > 0.01
      ) {
        return false;
      }

      return true;
    })
    .map((document) => document.id);
}

function sumDocuments(
  documentIds: Iterable<string>,
  documentsById: Map<string, EvidenceDocument>
) {
  let total = 0;
  for (const id of documentIds) {
    total += documentsById.get(id)?.ceapAmount ?? 0;
  }
  return total;
}

function largestDocument(
  documentIds: Iterable<string>,
  documentsById: Map<string, EvidenceDocument>
) {
  let largest = 0;
  for (const id of documentIds) {
    largest = Math.max(largest, documentsById.get(id)?.ceapAmount ?? 0);
  }
  return largest;
}

function signalSeverityRank(value?: "baixa" | "media" | "alta") {
  return value === "alta" ? 3 : value === "media" ? 2 : 1;
}

export function AdminParliamentaryCaseV5({ alert }: Props) {
  const evidence = alert.evidence as {
    consolidationVersion?: number;
    consolidationLevel?: string;
    analyzedYear?: number;
    highPriorityCount?: number;
    documents?: unknown[];
    ruleGroups?: RuleDefinition[];
    occurrences?: Occurrence[];
    dataQuality?: {
      rawRecordCount?: number;
      uniqueRecordCount?: number;
      exactDuplicateRecordCount?: number;
      linkedRecordCount?: number;
      documentsWithMultipleRecords?: number;
    };
  };

  const version = Number(evidence.consolidationVersion ?? 0);
  const rawOccurrences = useMemo(
    () => evidence.occurrences ?? [],
    [evidence.occurrences]
  );

  const documents = useMemo(
    () =>
      collectDocuments(
        version,
        Array.isArray(evidence.documents) ? evidence.documents : [],
        rawOccurrences
      ),
    [version, evidence.documents, rawOccurrences]
  );

  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents]
  );

  const occurrenceLinks = useMemo(
    () =>
      rawOccurrences.map((item) =>
        linkedDocumentIds(item, documents, documentsById)
      ),
    [rawOccurrences, documents, documentsById]
  );

  // Descarta o falso positivo legado: múltiplos registros do mesmo
  // ideDocumento/codDocumento não representam documentos duplicados.
  const occurrences = useMemo(
    () =>
      rawOccurrences
        .map((item, index) => ({
          ...item,
          documentIds: occurrenceLinks[index]
        }))
        .filter((item) => {
          if (item.ruleType !== "documento-repetido") return true;
          return new Set(item.documentIds).size >= 2;
        }),
    [rawOccurrences, occurrenceLinks]
  );

  const definitions = useMemo(() => {
    const map = new Map<string, RuleDefinition>();

    for (const definition of evidence.ruleGroups ?? []) {
      map.set(definition.ruleType, definition);
    }

    return map;
  }, [evidence.ruleGroups]);

  const documentRules = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const document of documents) {
      for (const ruleType of document.ruleTypes) {
        const rules = map.get(document.id) ?? new Set<string>();
        rules.add(ruleType);
        map.set(document.id, rules);
      }
    }

    for (const occurrence of occurrences) {
      for (const documentId of occurrence.documentIds ?? []) {
        const rules = map.get(documentId) ?? new Set<string>();
        if (occurrence.ruleType) rules.add(occurrence.ruleType);
        map.set(documentId, rules);
      }
    }

    return map;
  }, [documents, occurrences]);

  const linkedDocumentIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const occurrence of occurrences) {
      for (const id of occurrence.documentIds ?? []) ids.add(id);
    }
    return ids;
  }, [occurrences]);

  const caseDocuments = useMemo(
    () => documents.filter((document) => linkedDocumentIdSet.has(document.id)),
    [documents, linkedDocumentIdSet]
  );

  const suppliers = useMemo<SupplierSummary[]>(() => {
    const map = new Map<
      string,
      {
        name: string;
        taxId?: string;
        documentIds: Set<string>;
        signalCount: number;
        categories: Set<string>;
        ruleTypes: Set<string>;
      }
    >();

    for (const occurrence of occurrences) {
      const key =
        digits(occurrence.supplierTaxId) ||
        occurrence.supplierName ||
        "nao-identificado";
      const current = map.get(key) ?? {
        name: occurrence.supplierName ?? "Não identificado",
        taxId: digits(occurrence.supplierTaxId),
        documentIds: new Set<string>(),
        signalCount: 0,
        categories: new Set<string>(),
        ruleTypes: new Set<string>()
      };

      for (const id of occurrence.documentIds ?? []) current.documentIds.add(id);
      current.signalCount += 1;
      if (occurrence.category) current.categories.add(occurrence.category);
      if (occurrence.ruleType) current.ruleTypes.add(occurrence.ruleType);
      map.set(key, current);
    }

    return [...map.values()]
      .map((item) => ({
        name: item.name,
        taxId: item.taxId,
        amount: sumDocuments(item.documentIds, documentsById),
        largestDocument: largestDocument(item.documentIds, documentsById),
        signalCount: item.signalCount,
        documentIds: [...item.documentIds],
        categories: [...item.categories],
        ruleTypes: [...item.ruleTypes]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [occurrences, documentsById]);

  const categories = useMemo<CategorySummary[]>(() => {
    const map = new Map<
      string,
      {
        documentIds: Set<string>;
        signalCount: number;
        suppliers: Set<string>;
        ruleTypes: Set<string>;
      }
    >();

    for (const occurrence of occurrences) {
      const name = occurrence.category || "Sem categoria específica";
      const current = map.get(name) ?? {
        documentIds: new Set<string>(),
        signalCount: 0,
        suppliers: new Set<string>(),
        ruleTypes: new Set<string>()
      };

      for (const id of occurrence.documentIds ?? []) current.documentIds.add(id);
      current.signalCount += 1;
      current.suppliers.add(
        digits(occurrence.supplierTaxId) ||
          occurrence.supplierName ||
          "nao-identificado"
      );
      if (occurrence.ruleType) current.ruleTypes.add(occurrence.ruleType);
      map.set(name, current);
    }

    return [...map.entries()]
      .map(([name, item]) => ({
        name,
        amount: sumDocuments(item.documentIds, documentsById),
        signalCount: item.signalCount,
        supplierCount: item.suppliers.size,
        documentIds: [...item.documentIds],
        ruleTypes: [...item.ruleTypes]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [occurrences, documentsById]);

  const rules = useMemo<RuleSummary[]>(() => {
    const map = new Map<
      string,
      {
        documentIds: Set<string>;
        signalCount: number;
        suppliers: Set<string>;
        categories: Set<string>;
      }
    >();

    for (const occurrence of occurrences) {
      const ruleType = occurrence.ruleType || "outro-sinal";
      const current = map.get(ruleType) ?? {
        documentIds: new Set<string>(),
        signalCount: 0,
        suppliers: new Set<string>(),
        categories: new Set<string>()
      };

      for (const id of occurrence.documentIds ?? []) current.documentIds.add(id);
      current.signalCount += 1;
      current.suppliers.add(
        digits(occurrence.supplierTaxId) ||
          occurrence.supplierName ||
          "nao-identificado"
      );
      if (occurrence.category) current.categories.add(occurrence.category);
      map.set(ruleType, current);
    }

    return [...map.entries()]
      .map(([ruleType, item]) => {
        const definition = definitions.get(ruleType);
        return {
          ruleType,
          title: definition?.title ?? ruleLabel(ruleType),
          shortLabel: definition?.shortLabel ?? ruleLabel(ruleType),
          rule: definition?.rule ?? ruleDescription(ruleType),
          amount: sumDocuments(item.documentIds, documentsById),
          signalCount: item.signalCount,
          supplierCount: item.suppliers.size,
          documentIds: [...item.documentIds],
          categories: [...item.categories]
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [occurrences, definitions, documentsById]);

  const financialAmount = useMemo(
    () => caseDocuments.reduce((total, document) => total + document.ceapAmount, 0),
    [caseDocuments]
  );

  const largestFinancialDocument = useMemo(
    () =>
      caseDocuments.reduce(
        (largest, document) => Math.max(largest, document.ceapAmount),
        0
      ),
    [caseDocuments]
  );

  const highPriorityCount = useMemo(
    () => occurrences.filter((item) => item.severity === "alta").length,
    [occurrences]
  );

  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rule, setRule] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [onlyWithDocument, setOnlyWithDocument] = useState(false);
  const [sort, setSort] = useState<Sort>("amount-desc");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [documentScope, setDocumentScope] = useState<string[] | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const minimumNumber = Number(minimum) || 0;

  function openDocuments(ids: string[]) {
    setDocumentScope([...new Set(ids)]);
    setView("documents");
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setRule("");
    setMinimum("0");
    setOnlyHigh(false);
    setOnlyWithDocument(false);
    setSort("amount-desc");
    setDocumentScope(null);
  }

  const supplierRows = useMemo(() => {
    return suppliers
      .filter((supplier) => {
        const haystack = `${supplier.name} ${supplier.taxId ?? ""}`.toLocaleLowerCase(
          "pt-BR"
        );
        const relatedDocuments = supplier.documentIds
          .map((id) => documentsById.get(id))
          .filter((item): item is EvidenceDocument => Boolean(item));
        const hasHigh = occurrences.some(
          (item) =>
            signalSeverityRank(item.severity) === 3 &&
            (item.documentIds ?? []).some((id) => supplier.documentIds.includes(id))
        );

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (!category || supplier.categories.includes(category)) &&
          (!rule || supplier.ruleTypes.includes(rule)) &&
          supplier.amount >= minimumNumber &&
          (!onlyHigh || hasHigh) &&
          (!onlyWithDocument ||
            relatedDocuments.some((document) => Boolean(document.documentUrl)))
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc") return b.largestDocument - a.largestDocument;
        if (sort === "signals-desc") return b.signalCount - a.signalCount;
        if (sort === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
        return b.amount - a.amount;
      });
  }, [
    suppliers,
    documentsById,
    occurrences,
    normalizedQuery,
    category,
    rule,
    minimumNumber,
    onlyHigh,
    onlyWithDocument,
    sort
  ]);

  const signalRows = useMemo(() => {
    return occurrences
      .filter((item) => {
        const linked = (item.documentIds ?? [])
          .map((id) => documentsById.get(id))
          .filter((document): document is EvidenceDocument => Boolean(document));
        const haystack = [
          item.supplierName,
          item.supplierTaxId,
          item.category,
          item.documentNumber,
          ruleLabel(item.ruleType)
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        const amount = sumDocuments(item.documentIds ?? [], documentsById);

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (!category || item.category === category) &&
          (!rule || item.ruleType === rule) &&
          amount >= minimumNumber &&
          (!onlyHigh || item.severity === "alta") &&
          (!onlyWithDocument || linked.some((document) => document.documentUrl))
        );
      })
      .sort((a, b) => {
        const amountA = sumDocuments(a.documentIds ?? [], documentsById);
        const amountB = sumDocuments(b.documentIds ?? [], documentsById);
        if (sort === "largest-desc") {
          return (
            largestDocument(b.documentIds ?? [], documentsById) -
            largestDocument(a.documentIds ?? [], documentsById)
          );
        }
        if (sort === "signals-desc") {
          return (b.documentIds?.length ?? 0) - (a.documentIds?.length ?? 0);
        }
        if (sort === "name-asc") {
          return text(a.supplierName).localeCompare(text(b.supplierName), "pt-BR");
        }
        return amountB - amountA;
      });
  }, [
    occurrences,
    documentsById,
    normalizedQuery,
    category,
    rule,
    minimumNumber,
    onlyHigh,
    onlyWithDocument,
    sort
  ]);

  const documentRows = useMemo(() => {
    const scope = documentScope ? new Set(documentScope) : linkedDocumentIdSet;

    return caseDocuments
      .filter((document) => scope.has(document.id))
      .filter((document) => {
        const haystack = [
          document.supplierName,
          document.supplierTaxId,
          document.category,
          document.documentNumber,
          document.officialDocumentId
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        const rulesForDocument = documentRules.get(document.id) ?? new Set<string>();

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (!category || document.category === category) &&
          (!rule || rulesForDocument.has(rule)) &&
          document.ceapAmount >= minimumNumber &&
          (!onlyHigh ||
            occurrences.some(
              (item) =>
                item.severity === "alta" &&
                (item.documentIds ?? []).includes(document.id)
            )) &&
          (!onlyWithDocument || Boolean(document.documentUrl))
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc" || sort === "amount-desc") {
          return b.ceapAmount - a.ceapAmount;
        }
        if (sort === "signals-desc") {
          return (
            (documentRules.get(b.id)?.size ?? 0) -
            (documentRules.get(a.id)?.size ?? 0)
          );
        }
        return a.supplierName.localeCompare(b.supplierName, "pt-BR");
      });
  }, [
    documentScope,
    linkedDocumentIdSet,
    caseDocuments,
    documentRules,
    occurrences,
    normalizedQuery,
    category,
    rule,
    minimumNumber,
    onlyHigh,
    onlyWithDocument,
    sort
  ]);

  if (evidence.consolidationLevel !== "deputy") return null;

  return (
    <section className="admin-panel parliamentary-alert">
      <div className="parliamentary-alert-heading">
        <div>
          <p className="eyebrow">CASO PARLAMENTAR · CEAP</p>
          <h2>{alert.deputyName}</h2>
          <p>
            Documentos oficiais agrupam seus lançamentos CEAP. Valores de
            face dos PDFs e valores líquidos debitados da cota são exibidos
            separadamente.
          </p>
        </div>

        <div className="parliamentary-priority">
          <span>Prioridade de apuração</span>
          <strong>{alert.severity}</strong>
          <small>{highPriorityCount} sinal(is) de alta</small>
        </div>
      </div>

      {version < 5 ? (
        <p className="admin-warning">
          Dados consolidados por uma versão anterior. Esta tela já remove
          falsos positivos em que várias linhas pertencem ao mesmo documento,
          mas rode novamente o monitoramento para gravar a consolidação v5.
        </p>
      ) : null}

      <div className="parliamentary-metrics">
        <article>
          <span>Valor CEAP relacionado</span>
          <strong>{formatCurrency(financialAmount)}</strong>
        </article>
        <article>
          <span>Sinais técnicos válidos</span>
          <strong>{occurrences.length}</strong>
        </article>
        <article>
          <span>Fornecedores</span>
          <strong>{suppliers.length}</strong>
        </article>
        <article>
          <span>Tipos de sinal</span>
          <strong>{rules.length}</strong>
        </article>
        <article>
          <span>Documentos oficiais</span>
          <strong>{caseDocuments.length}</strong>
        </article>
        <article>
          <span>Maior débito por documento</span>
          <strong>{formatCurrency(largestFinancialDocument)}</strong>
        </article>
      </div>

      <p className="admin-warning">
        O valor CEAP relacionado é a soma dos lançamentos líquidos únicos
        vinculados aos sinais. Não é a soma dos sinais e pode ser diferente do
        valor de face impresso no documento por glosa, parcela ou mais de um
        lançamento associado ao mesmo comprovante.
      </p>

      {evidence.dataQuality ? (
        <p className="muted">
          Qualidade dos dados: {evidence.dataQuality.uniqueRecordCount ?? "—"}{" "}
          registro(s) CEAP único(s);{" "}
          {evidence.dataQuality.exactDuplicateRecordCount ?? 0} repetição(ões)
          exata(s) removida(s);{" "}
          {evidence.dataQuality.documentsWithMultipleRecords ?? 0} documento(s)
          com mais de um lançamento.
        </p>
      ) : null}

      <nav className="parliamentary-tabs" aria-label="Visões da apuração">
        {[
          ["overview", "Visão geral"],
          ["suppliers", `Fornecedores (${suppliers.length})`],
          ["signals", `Sinais (${occurrences.length})`],
          ["documents", `Documentos (${caseDocuments.length})`]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={view === value ? "active" : ""}
            onClick={() => {
              setView(value as View);
              if (value !== "documents") setDocumentScope(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" ? (
        <div className="parliamentary-overview">
          <section>
            <div className="panel-heading">
              <h3>Tipos de sinal encontrados</h3>
            </div>
            <div className="parliamentary-rule-grid">
              {rules.map((item) => (
                <button
                  type="button"
                  key={item.ruleType}
                  onClick={() => openDocuments(item.documentIds)}
                >
                  <span>{item.shortLabel}</span>
                  <strong>{formatCurrency(item.amount)}</strong>
                  <small>
                    {item.signalCount} sinal(is) · {item.documentIds.length}{" "}
                    documento(s) · {item.supplierCount} fornecedor(es)
                  </small>
                  <p>{item.rule}</p>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>Categorias com sinais</h3>
            </div>
            <div className="parliamentary-category-list">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  onClick={() => openDocuments(item.documentIds)}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.signalCount} sinal(is) · {item.documentIds.length}{" "}
                      documento(s) · {item.supplierCount} fornecedor(es)
                    </span>
                  </div>
                  <b>{formatCurrency(item.amount)}</b>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>Fornecedores de maior valor CEAP relacionado</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => setView("suppliers")}
              >
                Ver todos →
              </button>
            </div>
            <div className="parliamentary-top-suppliers">
              {suppliers.slice(0, 10).map((supplier) => (
                <button
                  type="button"
                  key={supplier.taxId || supplier.name}
                  onClick={() => openDocuments(supplier.documentIds)}
                >
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.taxId || "Documento não informado"}</span>
                  </div>
                  <div>
                    <b>{formatCurrency(supplier.amount)}</b>
                    <span>{supplier.documentIds.length} documento(s)</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="parliamentary-filter-bar">
            <label className="parliamentary-search">
              Buscar
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Fornecedor, CNPJ, documento ou categoria"
              />
            </label>

            <label>
              Tipo de sinal
              <select value={rule} onChange={(event) => setRule(event.target.value)}>
                <option value="">Todos</option>
                {rules.map((item) => (
                  <option key={item.ruleType} value={item.ruleType}>
                    {item.shortLabel}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Categoria
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">Todas</option>
                {categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Valor CEAP mínimo
              <select
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              >
                <option value="0">Qualquer valor</option>
                <option value="1000">R$ 1 mil</option>
                <option value="5000">R$ 5 mil</option>
                <option value="10000">R$ 10 mil</option>
                <option value="25000">R$ 25 mil</option>
                <option value="50000">R$ 50 mil</option>
                <option value="100000">R$ 100 mil</option>
              </select>
            </label>

            <label>
              Ordenar
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                <option value="amount-desc">Maior valor CEAP</option>
                <option value="largest-desc">Maior documento</option>
                <option value="signals-desc">Mais sinais</option>
                <option value="name-asc">Nome A–Z</option>
              </select>
            </label>

            <label className="parliamentary-check">
              <input
                type="checkbox"
                checked={onlyHigh}
                onChange={(event) => setOnlyHigh(event.target.checked)}
              />
              Somente alta prioridade
            </label>

            <label className="parliamentary-check">
              <input
                type="checkbox"
                checked={onlyWithDocument}
                onChange={(event) => setOnlyWithDocument(event.target.checked)}
              />
              Somente com PDF
            </label>

            <button type="button" className="text-button" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>

          {view === "suppliers" ? (
            <div className="parliamentary-supplier-list">
              <div className="parliamentary-results">
                {supplierRows.length} fornecedor(es)
              </div>

              {supplierRows.map((supplier) => {
                const key = supplier.taxId || supplier.name;
                const expanded = expandedSupplier === key;
                const supplierDocuments = supplier.documentIds
                  .map((id) => documentsById.get(id))
                  .filter((item): item is EvidenceDocument => Boolean(item));

                return (
                  <article key={key}>
                    <div className="supplier-summary-row">
                      <div className="supplier-identity">
                        <span>Fornecedor</span>
                        <strong>{supplier.name}</strong>
                        <small>{supplier.taxId || "CNPJ/CPF não informado"}</small>
                        <p>{supplier.categories.join(" · ")}</p>
                      </div>

                      <div>
                        <span>Valor CEAP relacionado</span>
                        <strong>{formatCurrency(supplier.amount)}</strong>
                      </div>

                      <div>
                        <span>Maior documento</span>
                        <strong>{formatCurrency(supplier.largestDocument)}</strong>
                      </div>

                      <div>
                        <span>Sinais</span>
                        <strong>{supplier.signalCount}</strong>
                      </div>

                      <div>
                        <span>Documentos</span>
                        <strong>{supplier.documentIds.length}</strong>
                      </div>

                      <button
                        type="button"
                        className="button button-dark"
                        onClick={() => setExpandedSupplier(expanded ? null : key)}
                      >
                        {expanded ? "Ocultar" : "Abrir fornecedor"}
                      </button>
                    </div>

                    {expanded ? (
                      <div className="supplier-expanded">
                        <div className="supplier-action-row">
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => openDocuments(supplier.documentIds)}
                          >
                            Ver todos os documentos
                          </button>
                          {supplier.taxId ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => navigator.clipboard.writeText(supplier.taxId ?? "")}
                            >
                              Copiar CNPJ/CPF
                            </button>
                          ) : null}
                        </div>

                        <div className="responsive-table">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Documento</th>
                                <th>Valor de face</th>
                                <th>Valor líquido CEAP</th>
                                <th>Lançamentos</th>
                                <th>PDF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierDocuments.map((document) => (
                                <tr key={document.id}>
                                  <td>{formatDate(document.documentDate)}</td>
                                  <td>
                                    <strong>{document.documentNumber || "—"}</strong>
                                    <small>
                                      ID oficial: {document.officialDocumentId || "não informado"}
                                    </small>
                                  </td>
                                  <td>{formatCurrency(document.faceValue)}</td>
                                  <td>{formatCurrency(document.ceapAmount)}</td>
                                  <td>{document.recordCount}</td>
                                  <td>
                                    {document.documentUrl ? (
                                      <a
                                        href={document.documentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Abrir PDF ↗
                                      </a>
                                    ) : (
                                      "Sem PDF"
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}

          {view === "signals" ? (
            <div className="responsive-table">
              <div className="parliamentary-results">
                {signalRows.length} sinal(is)
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Prioridade</th>
                    <th>Sinal</th>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Documentos</th>
                    <th>Valor CEAP relacionado</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {signalRows.map((item, index) => {
                    const ids = item.documentIds ?? [];
                    const amount = sumDocuments(ids, documentsById);
                    return (
                      <tr key={item.id || `${item.ruleType}-${index}`}>
                        <td>
                          <b className={`severity severity-${item.severity ?? "media"}`}>
                            {item.severity ?? "media"}
                          </b>
                        </td>
                        <td>
                          <strong>{ruleLabel(item.ruleType)}</strong>
                          <small>
                            {item.ruleDescription ?? ruleDescription(item.ruleType)}
                          </small>
                        </td>
                        <td>
                          <strong>{item.supplierName ?? "—"}</strong>
                          <small>{item.supplierTaxId ?? ""}</small>
                        </td>
                        <td>{item.category ?? "—"}</td>
                        <td>
                          <strong>{ids.length}</strong>
                          <small>documento(s) oficial(is)</small>
                        </td>
                        <td>{formatCurrency(amount)}</td>
                        <td>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => openDocuments(ids)}
                          >
                            Ver documentos →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {view === "documents" ? (
            <div className="responsive-table">
              <div className="parliamentary-results">
                {documentRows.length} documento(s) oficial(is)
                {documentScope ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setDocumentScope(null)}
                  >
                    Mostrar todos os documentos do caso
                  </button>
                ) : null}
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Data</th>
                    <th>Documento</th>
                    <th>Valor de face do PDF</th>
                    <th>Valor líquido CEAP</th>
                    <th>Lançamentos</th>
                    <th>Sinais</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {documentRows.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <strong>{document.supplierName}</strong>
                        <small>{document.supplierTaxId ?? ""}</small>
                      </td>
                      <td>{document.category}</td>
                      <td>{formatDate(document.documentDate)}</td>
                      <td>
                        <strong>{document.documentNumber || "—"}</strong>
                        <small>
                          ID oficial: {document.officialDocumentId || "não informado"}
                        </small>
                      </td>
                      <td>{formatCurrency(document.faceValue)}</td>
                      <td>{formatCurrency(document.ceapAmount)}</td>
                      <td>{document.recordCount}</td>
                      <td>
                        {[...(documentRules.get(document.id) ?? [])]
                          .map(ruleLabel)
                          .join(" · ") || "—"}
                      </td>
                      <td>
                        {document.documentUrl ? (
                          <a
                            href={document.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir PDF ↗
                          </a>
                        ) : (
                          "Sem PDF"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
