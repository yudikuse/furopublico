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
  documentCode?: string;
  supplierName?: string;
  supplierTaxId?: string;
  category?: string;
  documentNumber?: string;
  documentDate?: string;
  documentUrl?: string;
  amount: number;
  ruleTypes?: string[];
  record?: RawRecord;
};

type Occurrence = {
  id?: string;
  ruleType?: string;
  ruleLabel?: string;
  severity?: "baixa" | "media" | "alta";
  supplierName?: string;
  supplierTaxId?: string;
  category?: string;
  documentNumber?: string;
  documentDate?: string;
  documentUrl?: string;
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
  records?: RawRecord[];
  record?: RawRecord;
};

type SupplierSummary = {
  name: string;
  taxId?: string;
  amount: number;
  largestOccurrence: number;
  occurrenceCount: number;
  documentCount: number;
  documentIds: string[];
  categories: string[];
  ruleTypes: string[];
};

type RuleGroup = {
  ruleType: string;
  title: string;
  shortLabel: string;
  rule: string;
  amount: number;
  largestOccurrence: number;
  occurrenceCount: number;
  supplierCount: number;
  documentCount: number;
  documentIds: string[];
  categories: string[];
};

type CategorySummary = {
  name: string;
  amount: number;
  occurrenceCount: number;
  supplierCount: number;
  documentCount: number;
  documentIds: string[];
  ruleTypes: string[];
};

type View = "overview" | "suppliers" | "signals" | "documents";

type Sort =
  | "amount-desc"
  | "largest-desc"
  | "signals-desc"
  | "name-asc";

function text(value: unknown) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}

function digits(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstText(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function validUrl(value: unknown) {
  const candidate = text(value);
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}

function recordToDocument(record: RawRecord): EvidenceDocument {
  const documentCode = firstText(record, [
    "codDocumento",
    "idDocumento",
    "documentCode",
    "codLote",
    "numRessarcimento"
  ]);

  const supplierName =
    firstText(record, ["nomeFornecedor", "txtFornecedor"]) ||
    "Não identificado";

  const supplierTaxId = digits(
    firstText(record, ["cnpjCpfFornecedor", "txtCNPJCPF"])
  );

  const category =
    firstText(record, ["tipoDespesa", "txtDescricao"]) ||
    "Sem categoria";

  const documentNumber = firstText(record, [
    "numDocumento",
    "txtNumero"
  ]);

  const documentDate = firstText(record, [
    "dataDocumento",
    "datEmissao"
  ]).slice(0, 10);

  const amount = numeric(
    record.valorLiquido ??
      record.vlrLiquido ??
      record.valorDocumento
  );

  const documentUrl = validUrl(
    record.urlDocumento ??
      record.urlDocument ??
      record.documentUrl ??
      record.url
  );

  const fallback = [
    supplierTaxId || supplierName,
    documentNumber,
    documentDate,
    amount.toFixed(2),
    category,
    documentUrl
  ].join("|");

  return {
    id: `legacy:${documentCode || fallback}`,
    documentCode,
    supplierName,
    supplierTaxId,
    category,
    documentNumber,
    documentDate,
    documentUrl,
    amount,
    record
  };
}

function occurrenceFallbackDocument(
  item: Occurrence
): EvidenceDocument | null {
  const documentUrl = validUrl(item.documentUrl);
  const hasIdentity =
    item.documentNumber ||
    item.documentDate ||
    documentUrl ||
    numeric(item.individualValue ?? item.amount) > 0;

  if (!hasIdentity) return null;

  const amount = numeric(
    item.individualValue ?? item.amount ?? item.relatedAmount
  );

  const fallback = [
    digits(item.supplierTaxId) || item.supplierName,
    item.documentNumber,
    item.documentDate,
    amount.toFixed(2),
    item.category,
    documentUrl
  ].join("|");

  return {
    id: `occurrence:${fallback}`,
    supplierName: item.supplierName,
    supplierTaxId: digits(item.supplierTaxId),
    category: item.category,
    documentNumber: item.documentNumber,
    documentDate: item.documentDate,
    documentUrl,
    amount
  };
}

function directOccurrenceUrl(item: Occurrence) {
  const own = validUrl(item.documentUrl);
  if (own) return own;

  if (item.record) {
    return recordToDocument(item.record).documentUrl ?? "";
  }

  return "";
}

function primaryValue(item: Occurrence) {
  return numeric(
    item.relatedAmount ??
      item.supplierTotal ??
      item.amount ??
      item.individualValue
  );
}

function individualValue(item: Occurrence) {
  return numeric(
    item.individualValue ??
      item.amount ??
      item.supplierTotal
  );
}

function ruleLabel(ruleType?: string) {
  const labels: Record<string, string> = {
    "documento-repetido": "Documentos repetidos",
    "concentracao-fornecedor": "Concentração",
    "valor-extremo": "Valor extremo"
  };

  return labels[String(ruleType)] ?? "Outro sinal";
}

function normalizeExplicitDocument(
  value: unknown
): EvidenceDocument | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Record<string, unknown>;
  const record =
    item.record && typeof item.record === "object"
      ? (item.record as RawRecord)
      : undefined;

  const documentUrl =
    validUrl(item.documentUrl) ||
    (record ? recordToDocument(record).documentUrl ?? "" : "");

  const id =
    text(item.id) ||
    `explicit:${[
      text(item.documentCode),
      digits(text(item.supplierTaxId)),
      text(item.documentNumber),
      text(item.documentDate),
      numeric(item.amount).toFixed(2),
      documentUrl
    ].join("|")}`;

  return {
    id,
    documentCode: text(item.documentCode),
    supplierName: text(item.supplierName),
    supplierTaxId: digits(text(item.supplierTaxId)),
    category: text(item.category),
    documentNumber: text(item.documentNumber),
    documentDate: text(item.documentDate).slice(0, 10),
    documentUrl,
    amount: numeric(item.amount),
    ruleTypes: Array.isArray(item.ruleTypes)
      ? item.ruleTypes.map(text).filter(Boolean)
      : [],
    record
  };
}

function collectDocuments(
  explicit: unknown[],
  occurrences: Occurrence[]
) {
  const map = new Map<string, EvidenceDocument>();

  for (const value of explicit) {
    const document = normalizeExplicitDocument(value);
    if (document) map.set(document.id, document);
  }

  for (const item of occurrences) {
    const rawRecords = [
      ...(item.records ?? []),
      ...(item.record ? [item.record] : [])
    ];

    if (rawRecords.length) {
      for (const record of rawRecords) {
        const document = recordToDocument(record);
        if (!map.has(document.id)) map.set(document.id, document);
      }
      continue;
    }

    const fallback = occurrenceFallbackDocument(item);
    if (fallback && !map.has(fallback.id)) {
      map.set(fallback.id, fallback);
    }
  }

  return [...map.values()];
}

function idsForOccurrence(
  item: Occurrence,
  documents: EvidenceDocument[]
) {
  if (item.documentIds?.length) {
    const known = new Set(documents.map((document) => document.id));
    const explicit = item.documentIds.filter((id) => known.has(id));
    if (explicit.length) return explicit;
  }

  const rawRecords = [
    ...(item.records ?? []),
    ...(item.record ? [item.record] : [])
  ];

  if (rawRecords.length) {
    const ids = rawRecords.map(
      (record) => recordToDocument(record).id
    );
    return [...new Set(ids)];
  }

  const fallback = occurrenceFallbackDocument(item);
  if (fallback) {
    const exact = documents.find(
      (document) => document.id === fallback.id
    );
    if (exact) return [exact.id];
  }

  return documents
    .filter((document) => {
      const supplierMatches =
        !item.supplierTaxId ||
        digits(item.supplierTaxId) ===
          digits(document.supplierTaxId) ||
        item.supplierName === document.supplierName;

      const numberMatches =
        !item.documentNumber ||
        item.documentNumber === document.documentNumber;

      const dateMatches =
        !item.documentDate ||
        item.documentDate === document.documentDate;

      const value = individualValue(item);
      const valueMatches =
        !value || Math.abs(value - document.amount) < 0.01;

      return (
        supplierMatches &&
        numberMatches &&
        dateMatches &&
        valueMatches
      );
    })
    .map((document) => document.id);
}

function sumDocuments(
  ids: Iterable<string>,
  documentsById: Map<string, EvidenceDocument>
) {
  let total = 0;
  for (const id of ids) {
    total += documentsById.get(id)?.amount ?? 0;
  }
  return total;
}

function largestDocument(
  ids: Iterable<string>,
  documentsById: Map<string, EvidenceDocument>
) {
  let largest = 0;
  for (const id of ids) {
    largest = Math.max(
      largest,
      documentsById.get(id)?.amount ?? 0
    );
  }
  return largest;
}

export function AdminParliamentaryCase({ alert }: Props) {
  const evidence = alert.evidence as {
    consolidationLevel?: string;
    analyzedYear?: number;
    highPriorityCount?: number;
    documents?: unknown[];
    ruleGroups?: RuleGroup[];
    occurrences?: Occurrence[];
  };

  const occurrences = useMemo(
    () => evidence.occurrences ?? [],
    [evidence.occurrences]
  );

  const documents = useMemo(
    () =>
      collectDocuments(
        Array.isArray(evidence.documents)
          ? evidence.documents
          : [],
        occurrences
      ),
    [evidence.documents, occurrences]
  );

  const documentsById = useMemo(
    () =>
      new Map(
        documents.map((document) => [
          document.id,
          document
        ])
      ),
    [documents]
  );

  const occurrenceDocumentIds = useMemo(
    () =>
      occurrences.map((item) =>
        idsForOccurrence(item, documents)
      ),
    [occurrences, documents]
  );

  const documentRules = useMemo(() => {
    const map = new Map<string, Set<string>>();

    documents.forEach((document) => {
      for (const ruleType of document.ruleTypes ?? []) {
        const set = map.get(document.id) ?? new Set();
        set.add(ruleType);
        map.set(document.id, set);
      }
    });

    occurrences.forEach((item, index) => {
      for (const documentId of occurrenceDocumentIds[index]) {
        const set = map.get(documentId) ?? new Set();
        if (item.ruleType) set.add(item.ruleType);
        map.set(documentId, set);
      }
    });

    return map;
  }, [documents, occurrences, occurrenceDocumentIds]);

  const documentSeverities = useMemo(() => {
    const map = new Map<
      string,
      Set<"baixa" | "media" | "alta">
    >();

    occurrences.forEach((item, index) => {
      for (const documentId of occurrenceDocumentIds[index]) {
        const set = map.get(documentId) ?? new Set();
        set.add(item.severity ?? "media");
        map.set(documentId, set);
      }
    });

    return map;
  }, [occurrences, occurrenceDocumentIds]);

  const definitionByRule = useMemo(() => {
    return new Map(
      (evidence.ruleGroups ?? []).map((item) => [
        item.ruleType,
        item
      ])
    );
  }, [evidence.ruleGroups]);

  const suppliers = useMemo<SupplierSummary[]>(() => {
    const map = new Map<
      string,
      {
        name: string;
        taxId?: string;
        documentIds: Set<string>;
        occurrenceCount: number;
        categories: Set<string>;
        ruleTypes: Set<string>;
      }
    >();

    occurrences.forEach((item, index) => {
      const key =
        digits(item.supplierTaxId) ||
        item.supplierName ||
        "nao-identificado";

      const current = map.get(key) ?? {
        name: item.supplierName ?? "Não identificado",
        taxId: digits(item.supplierTaxId),
        documentIds: new Set<string>(),
        occurrenceCount: 0,
        categories: new Set<string>(),
        ruleTypes: new Set<string>()
      };

      occurrenceDocumentIds[index].forEach((id) =>
        current.documentIds.add(id)
      );
      current.occurrenceCount += 1;
      if (item.category) current.categories.add(item.category);
      if (item.ruleType) current.ruleTypes.add(item.ruleType);
      map.set(key, current);
    });

    return [...map.values()]
      .map((item) => ({
        name: item.name,
        taxId: item.taxId,
        amount: sumDocuments(
          item.documentIds,
          documentsById
        ),
        largestOccurrence: largestDocument(
          item.documentIds,
          documentsById
        ),
        occurrenceCount: item.occurrenceCount,
        documentCount: item.documentIds.size,
        documentIds: [...item.documentIds],
        categories: [...item.categories],
        ruleTypes: [...item.ruleTypes]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [
    occurrences,
    occurrenceDocumentIds,
    documentsById
  ]);

  const categories = useMemo<CategorySummary[]>(() => {
    const map = new Map<
      string,
      {
        documentIds: Set<string>;
        occurrenceCount: number;
        suppliers: Set<string>;
        ruleTypes: Set<string>;
      }
    >();

    occurrences.forEach((item, index) => {
      const name =
        item.category || "Sem categoria específica";
      const current = map.get(name) ?? {
        documentIds: new Set<string>(),
        occurrenceCount: 0,
        suppliers: new Set<string>(),
        ruleTypes: new Set<string>()
      };

      occurrenceDocumentIds[index].forEach((id) =>
        current.documentIds.add(id)
      );
      current.occurrenceCount += 1;
      current.suppliers.add(
        digits(item.supplierTaxId) ||
          item.supplierName ||
          "nao-identificado"
      );
      if (item.ruleType) current.ruleTypes.add(item.ruleType);
      map.set(name, current);
    });

    return [...map.entries()]
      .map(([name, item]) => ({
        name,
        amount: sumDocuments(
          item.documentIds,
          documentsById
        ),
        occurrenceCount: item.occurrenceCount,
        supplierCount: item.suppliers.size,
        documentCount: item.documentIds.size,
        documentIds: [...item.documentIds],
        ruleTypes: [...item.ruleTypes]
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [
    occurrences,
    occurrenceDocumentIds,
    documentsById
  ]);

  const rules = useMemo<RuleGroup[]>(() => {
    const map = new Map<
      string,
      {
        documentIds: Set<string>;
        occurrenceCount: number;
        suppliers: Set<string>;
        categories: Set<string>;
      }
    >();

    occurrences.forEach((item, index) => {
      const ruleType = item.ruleType || "outro-sinal";
      const current = map.get(ruleType) ?? {
        documentIds: new Set<string>(),
        occurrenceCount: 0,
        suppliers: new Set<string>(),
        categories: new Set<string>()
      };

      occurrenceDocumentIds[index].forEach((id) =>
        current.documentIds.add(id)
      );
      current.occurrenceCount += 1;
      current.suppliers.add(
        digits(item.supplierTaxId) ||
          item.supplierName ||
          "nao-identificado"
      );
      if (item.category) current.categories.add(item.category);
      map.set(ruleType, current);
    });

    return [...map.entries()]
      .map(([ruleType, item]) => {
        const definition = definitionByRule.get(ruleType);
        return {
          ruleType,
          title:
            definition?.title ?? ruleLabel(ruleType),
          shortLabel:
            definition?.shortLabel ?? ruleLabel(ruleType),
          rule:
            definition?.rule ??
            "Sinal técnico que requer conferência documental.",
          amount: sumDocuments(
            item.documentIds,
            documentsById
          ),
          largestOccurrence: largestDocument(
            item.documentIds,
            documentsById
          ),
          occurrenceCount: item.occurrenceCount,
          supplierCount: item.suppliers.size,
          documentCount: item.documentIds.size,
          documentIds: [...item.documentIds],
          categories: [...item.categories]
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [
    occurrences,
    occurrenceDocumentIds,
    definitionByRule,
    documentsById
  ]);

  const financialAmount = useMemo(
    () =>
      documents.reduce(
        (total, document) => total + document.amount,
        0
      ),
    [documents]
  );

  const largestFinancialDocument = useMemo(
    () =>
      documents.reduce(
        (largest, document) =>
          Math.max(largest, document.amount),
        0
      ),
    [documents]
  );

  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rule, setRule] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [onlyWithDocument, setOnlyWithDocument] =
    useState(false);
  const [sort, setSort] =
    useState<Sort>("amount-desc");
  const [expandedSupplier, setExpandedSupplier] =
    useState<string | null>(null);
  const [documentScope, setDocumentScope] = useState<
    string[] | null
  >(null);

  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase("pt-BR");
  const minimumNumber = Number(minimum) || 0;

  const supplierRows = useMemo(() => {
    return suppliers
      .filter((supplier) => {
        const relatedOccurrences = occurrences.filter(
          (item) =>
            (digits(item.supplierTaxId) &&
              digits(item.supplierTaxId) ===
                digits(supplier.taxId)) ||
            item.supplierName === supplier.name
        );

        const hasLinkedUrl = supplier.documentIds.some(
          (id) => Boolean(documentsById.get(id)?.documentUrl)
        );

        return (
          (!normalizedQuery ||
            supplier.name
              .toLocaleLowerCase("pt-BR")
              .includes(normalizedQuery) ||
            digits(supplier.taxId).includes(
              digits(normalizedQuery)
            )) &&
          (!category ||
            supplier.categories.includes(category)) &&
          (!rule || supplier.ruleTypes.includes(rule)) &&
          supplier.amount >= minimumNumber &&
          (!onlyHigh ||
            relatedOccurrences.some(
              (item) => item.severity === "alta"
            )) &&
          (!onlyWithDocument || hasLinkedUrl)
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc") {
          return (
            b.largestOccurrence - a.largestOccurrence
          );
        }
        if (sort === "signals-desc") {
          return b.occurrenceCount - a.occurrenceCount;
        }
        if (sort === "name-asc") {
          return a.name.localeCompare(b.name, "pt-BR");
        }
        return b.amount - a.amount;
      });
  }, [
    suppliers,
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

  const occurrenceRows = useMemo(() => {
    return occurrences
      .map((item, index) => ({
        item,
        documentIds: occurrenceDocumentIds[index]
      }))
      .filter(({ item, documentIds }) => {
        const haystack = [
          item.supplierName,
          item.supplierTaxId,
          item.category,
          item.documentNumber,
          item.ruleLabel,
          ruleLabel(item.ruleType)
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        const hasLinkedUrl = documentIds.some(
          (id) => Boolean(documentsById.get(id)?.documentUrl)
        );

        return (
          (!normalizedQuery ||
            haystack.includes(normalizedQuery)) &&
          (!category || item.category === category) &&
          (!rule || item.ruleType === rule) &&
          primaryValue(item) >= minimumNumber &&
          (!onlyHigh || item.severity === "alta") &&
          (!onlyWithDocument || hasLinkedUrl)
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc") {
          return (
            individualValue(b.item) -
            individualValue(a.item)
          );
        }
        if (sort === "signals-desc") {
          return (
            numeric(b.item.repetitionCount ?? 1) -
            numeric(a.item.repetitionCount ?? 1)
          );
        }
        if (sort === "name-asc") {
          return String(
            a.item.supplierName ?? ""
          ).localeCompare(
            String(b.item.supplierName ?? ""),
            "pt-BR"
          );
        }
        return (
          primaryValue(b.item) -
          primaryValue(a.item)
        );
      });
  }, [
    occurrences,
    occurrenceDocumentIds,
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
    const scope = documentScope
      ? new Set(documentScope)
      : null;

    return documents
      .filter((document) => {
        const ruleTypes = [
          ...(documentRules.get(document.id) ?? [])
        ];
        const severities =
          documentSeverities.get(document.id) ??
          new Set();

        const haystack = [
          document.supplierName,
          document.supplierTaxId,
          document.category,
          document.documentNumber,
          document.documentCode,
          ...ruleTypes.map(ruleLabel)
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        return (
          (!scope || scope.has(document.id)) &&
          (!normalizedQuery ||
            haystack.includes(normalizedQuery)) &&
          (!category ||
            document.category === category) &&
          (!rule || ruleTypes.includes(rule)) &&
          document.amount >= minimumNumber &&
          (!onlyHigh || severities.has("alta")) &&
          (!onlyWithDocument ||
            Boolean(document.documentUrl))
        );
      })
      .sort((a, b) => {
        if (sort === "signals-desc") {
          return (
            (documentRules.get(b.id)?.size ?? 0) -
            (documentRules.get(a.id)?.size ?? 0)
          );
        }
        if (sort === "name-asc") {
          return String(
            a.supplierName ?? ""
          ).localeCompare(
            String(b.supplierName ?? ""),
            "pt-BR"
          );
        }
        return b.amount - a.amount;
      });
  }, [
    documents,
    documentScope,
    documentRules,
    documentSeverities,
    normalizedQuery,
    category,
    rule,
    minimumNumber,
    onlyHigh,
    onlyWithDocument,
    sort
  ]);

  if (evidence.consolidationLevel !== "deputy") {
    return null;
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

  function openAllDocuments() {
    setDocumentScope(null);
    setView("documents");
  }

  function openDocuments(ids: string[]) {
    setDocumentScope([...new Set(ids)]);
    setView("documents");
  }

  return (
    <section className="admin-panel parliamentary-alert">
      <div className="parliamentary-alert-heading">
        <div>
          <p className="eyebrow">CASO DO PARLAMENTAR</p>
          <h2>{alert.deputyName}</h2>
          <p>
            Os sinais técnicos da CEAP de{" "}
            {evidence.analyzedYear ??
              "período não informado"}{" "}
            foram agrupados sem somar o mesmo documento mais de
            uma vez.
          </p>
        </div>

        <div className="parliamentary-priority">
          <span>Prioridade de apuração</span>
          <strong>{alert.severity}</strong>
          <small>
            {evidence.highPriorityCount ??
              occurrences.filter(
                (item) => item.severity === "alta"
              ).length}{" "}
            sinal(is) de alta
          </small>
        </div>
      </div>

      <div className="parliamentary-metrics">
        <article>
          <span>Valor financeiro real</span>
          <strong>
            {formatCurrency(
              financialAmount || alert.amount
            )}
          </strong>
        </article>
        <article>
          <span>Sinais técnicos</span>
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
          <span>Documentos únicos</span>
          <strong>{documents.length}</strong>
        </article>
        <article>
          <span>Maior documento</span>
          <strong>
            {formatCurrency(largestFinancialDocument)}
          </strong>
        </article>
      </div>

      <nav
        className="parliamentary-tabs"
        aria-label="Visões da apuração"
      >
        {[
          ["overview", "Visão geral"],
          [
            "suppliers",
            `Fornecedores (${suppliers.length})`
          ],
          [
            "signals",
            `Sinais (${occurrences.length})`
          ],
          [
            "documents",
            `Documentos (${documents.length})`
          ]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={view === value ? "active" : ""}
            onClick={() => {
              setView(value as View);
              if (value === "documents") {
                setDocumentScope(null);
              }
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
                  onClick={() => {
                    setRule(item.ruleType);
                    setDocumentScope(null);
                    setView("signals");
                  }}
                >
                  <span>{item.shortLabel}</span>
                  <strong>
                    {formatCurrency(item.amount)}
                  </strong>
                  <small>
                    {item.occurrenceCount} sinal(is) ·{" "}
                    {item.documentCount} documento(s) ·{" "}
                    {item.supplierCount} fornecedor(es)
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
                  onClick={() => {
                    setCategory(item.name);
                    setDocumentScope(null);
                    setView("suppliers");
                  }}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.occurrenceCount} sinal(is) ·{" "}
                      {item.documentCount} documento(s) ·{" "}
                      {item.supplierCount} fornecedor(es)
                    </span>
                  </div>
                  <b>{formatCurrency(item.amount)}</b>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>
                Fornecedores por valor financeiro único
              </h3>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDocumentScope(null);
                  setView("suppliers");
                }}
              >
                Ver todos →
              </button>
            </div>

            <div className="parliamentary-top-suppliers">
              {suppliers.slice(0, 10).map((supplier) => (
                <button
                  type="button"
                  key={supplier.taxId || supplier.name}
                  onClick={() => {
                    setQuery(
                      supplier.taxId || supplier.name
                    );
                    setDocumentScope(null);
                    setView("suppliers");
                  }}
                >
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>
                      {supplier.taxId ||
                        "Documento não informado"}
                    </span>
                  </div>
                  <div>
                    <b>
                      {formatCurrency(supplier.amount)}
                    </b>
                    <span>
                      {supplier.occurrenceCount} sinal(is) ·{" "}
                      {supplier.documentCount} documento(s)
                    </span>
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
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Fornecedor, CNPJ, documento ou categoria"
              />
            </label>

            <label>
              Tipo de sinal
              <select
                value={rule}
                onChange={(event) =>
                  setRule(event.target.value)
                }
              >
                <option value="">Todos</option>
                {rules.map((item) => (
                  <option
                    key={item.ruleType}
                    value={item.ruleType}
                  >
                    {item.shortLabel}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Categoria
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value)
                }
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
              Valor mínimo
              <select
                value={minimum}
                onChange={(event) =>
                  setMinimum(event.target.value)
                }
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
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as Sort)
                }
              >
                <option value="amount-desc">
                  Maior valor financeiro
                </option>
                <option value="largest-desc">
                  Maior documento
                </option>
                <option value="signals-desc">
                  Mais sinais
                </option>
                <option value="name-asc">
                  Nome A–Z
                </option>
              </select>
            </label>

            <label className="parliamentary-check">
              <input
                type="checkbox"
                checked={onlyHigh}
                onChange={(event) =>
                  setOnlyHigh(event.target.checked)
                }
              />
              Somente alta prioridade
            </label>

            <label className="parliamentary-check">
              <input
                type="checkbox"
                checked={onlyWithDocument}
                onChange={(event) =>
                  setOnlyWithDocument(
                    event.target.checked
                  )
                }
              />
              Somente com PDF/link
            </label>

            <button
              type="button"
              className="text-button"
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          </div>

          {view === "suppliers" ? (
            <div className="parliamentary-supplier-list">
              <div className="parliamentary-results">
                {supplierRows.length} fornecedor(es)
              </div>

              {supplierRows.map((supplier) => {
                const key =
                  supplier.taxId || supplier.name;
                const expanded =
                  expandedSupplier === key;
                const supplierDocuments =
                  supplier.documentIds
                    .map((id) => documentsById.get(id))
                    .filter(Boolean) as EvidenceDocument[];

                return (
                  <article key={key}>
                    <div className="supplier-summary-row">
                      <div className="supplier-identity">
                        <span>Fornecedor</span>
                        <strong>{supplier.name}</strong>
                        <small>
                          {supplier.taxId ||
                            "CNPJ/CPF não informado"}
                        </small>
                        <p>
                          {supplier.categories.join(" · ")}
                        </p>
                      </div>

                      <div>
                        <span>Valor financeiro real</span>
                        <strong>
                          {formatCurrency(supplier.amount)}
                        </strong>
                      </div>

                      <div>
                        <span>Maior documento</span>
                        <strong>
                          {formatCurrency(
                            supplier.largestOccurrence
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>Sinais</span>
                        <strong>
                          {supplier.occurrenceCount}
                        </strong>
                      </div>

                      <div>
                        <span>Documentos únicos</span>
                        <strong>
                          {supplier.documentCount}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="button button-dark"
                        onClick={() =>
                          setExpandedSupplier(
                            expanded ? null : key
                          )
                        }
                      >
                        {expanded
                          ? "Ocultar"
                          : "Abrir fornecedor"}
                      </button>
                    </div>

                    {expanded ? (
                      <div className="supplier-expanded">
                        <div className="supplier-action-row">
                          {supplier.taxId ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  supplier.taxId ?? ""
                                )
                              }
                            >
                              Copiar CNPJ/CPF
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() =>
                              openDocuments(
                                supplier.documentIds
                              )
                            }
                          >
                            Ver todos os documentos
                          </button>

                          <span>
                            A análise empresarial só deve ser
                            criada quando o jornalista decidir
                            investigar este fornecedor.
                          </span>
                        </div>

                        <div className="responsive-table">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Documento</th>
                                <th>Categoria</th>
                                <th>Sinais relacionados</th>
                                <th>Valor</th>
                                <th>Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierDocuments.map(
                                (document) => (
                                  <tr key={document.id}>
                                    <td>
                                      {formatDate(
                                        document.documentDate
                                      )}
                                    </td>
                                    <td>
                                      {document.documentNumber ||
                                        document.documentCode ||
                                        "—"}
                                    </td>
                                    <td>
                                      {document.category || "—"}
                                    </td>
                                    <td>
                                      {[
                                        ...(documentRules.get(
                                          document.id
                                        ) ?? [])
                                      ]
                                        .map(ruleLabel)
                                        .join(" · ") || "—"}
                                    </td>
                                    <td>
                                      {formatCurrency(
                                        document.amount
                                      )}
                                    </td>
                                    <td>
                                      {document.documentUrl ? (
                                        <a
                                          href={
                                            document.documentUrl
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Abrir documento ↗
                                        </a>
                                      ) : (
                                        "Sem link"
                                      )}
                                    </td>
                                  </tr>
                                )
                              )}
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
                {occurrenceRows.length} sinal(is)
              </div>

              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Prioridade</th>
                    <th>Sinal técnico</th>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Base documental</th>
                    <th>Maior documento</th>
                    <th>Valor relacionado ao sinal</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {occurrenceRows.map(
                    ({ item, documentIds }, index) => {
                      const linkedDocuments =
                        documentIds
                          .map((id) =>
                            documentsById.get(id)
                          )
                          .filter(
                            Boolean
                          ) as EvidenceDocument[];

                      const onlyDocument =
                        linkedDocuments.length === 1
                          ? linkedDocuments[0]
                          : undefined;

                      const isAggregate =
                        item.ruleType ===
                          "concentracao-fornecedor" ||
                        item.ruleType ===
                          "documento-repetido" ||
                        linkedDocuments.length > 1;

                      return (
                        <tr
                          key={
                            item.id ??
                            `${item.ruleType}-${item.supplierTaxId}-${item.documentNumber}-${index}`
                          }
                        >
                          <td>
                            <b
                              className={`severity severity-${item.severity ?? "media"}`}
                            >
                              {item.severity ?? "media"}
                            </b>
                          </td>
                          <td>
                            {ruleLabel(item.ruleType)}
                          </td>
                          <td>
                            <strong>
                              {item.supplierName ?? "—"}
                            </strong>
                            <small>
                              {item.supplierTaxId ?? ""}
                            </small>
                          </td>
                          <td>{item.category ?? "—"}</td>
                          <td>
                            {linkedDocuments.length
                              ? `${linkedDocuments.length} documento(s)`
                              : item.documentNumber ||
                                "Sem documento identificado"}
                            {item.documentNumber ? (
                              <small>
                                {formatDate(
                                  item.documentDate
                                )}{" "}
                                · {item.documentNumber}
                              </small>
                            ) : null}
                          </td>
                          <td>
                            {formatCurrency(
                              individualValue(item)
                            )}
                          </td>
                          <td>
                            {formatCurrency(
                              primaryValue(item)
                            )}
                          </td>
                          <td>
                            {linkedDocuments.length ? (
                              isAggregate ? (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    openDocuments(
                                      documentIds
                                    )
                                  }
                                >
                                  Ver{" "}
                                  {linkedDocuments.length}{" "}
                                  documento(s)
                                </button>
                              ) : onlyDocument
                                  ?.documentUrl ? (
                                <a
                                  href={
                                    onlyDocument.documentUrl
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir documento ↗
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    openDocuments(
                                      documentIds
                                    )
                                  }
                                >
                                  Ver documento
                                </button>
                              )
                            ) : directOccurrenceUrl(item) ? (
                              <a
                                href={directOccurrenceUrl(
                                  item
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir documento ↗
                              </a>
                            ) : (
                              "Sem link"
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {view === "documents" ? (
            <div className="responsive-table">
              <div className="parliamentary-results">
                {documentScope ? (
                  <>
                    {documentRows.length} documento(s)
                    relacionado(s) ao sinal selecionado{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={openAllDocuments}
                    >
                      Ver todos
                    </button>
                  </>
                ) : (
                  <>
                    {documentRows.length} documento(s)
                    único(s)
                  </>
                )}
              </div>

              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Data</th>
                    <th>Número/código</th>
                    <th>Sinais relacionados</th>
                    <th>Valor financeiro</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {documentRows.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <strong>
                          {document.supplierName ?? "—"}
                        </strong>
                        <small>
                          {document.supplierTaxId ?? ""}
                        </small>
                      </td>
                      <td>{document.category ?? "—"}</td>
                      <td>
                        {formatDate(
                          document.documentDate
                        )}
                      </td>
                      <td>
                        {document.documentNumber ||
                          document.documentCode ||
                          "—"}
                      </td>
                      <td>
                        {[
                          ...(documentRules.get(
                            document.id
                          ) ?? [])
                        ]
                          .map(ruleLabel)
                          .join(" · ") || "—"}
                      </td>
                      <td>
                        {formatCurrency(document.amount)}
                      </td>
                      <td>
                        {document.documentUrl ? (
                          <a
                            href={document.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir documento ↗
                          </a>
                        ) : (
                          "Sem link"
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
