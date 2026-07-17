"use client";

import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { alert: InvestigationAlert };

type RawRecord = Record<string, unknown>;

type Occurrence = {
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
  records?: RawRecord[];
  record?: RawRecord;
};

type SupplierGroup = {
  key: string;
  name: string;
  taxId: string;
  occurrences: Occurrence[];
  categories: string[];
  occurrenceCount: number;
  documentCount: number;
  totalRelated: number;
  largestValue: number;
  firstDate?: string;
  lastDate?: string;
  documentLinks: { label: string; url: string }[];
};

type SortKey =
  | "total-desc"
  | "largest-desc"
  | "occurrences-desc"
  | "recent-desc"
  | "name-asc";

type ViewMode = "suppliers" | "signals";

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function digits(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function getDocumentUrl(item: Occurrence) {
  if (item.documentUrl) return item.documentUrl;

  const candidates = [
    item.record,
    ...(item.records ?? [])
  ].filter(Boolean) as RawRecord[];

  for (const record of candidates) {
    const value =
      record.urlDocumento ??
      record.urlDocument ??
      record.documentUrl ??
      record.url;

    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value;
    }
  }

  return undefined;
}

function occurrencePrimaryValue(item: Occurrence) {
  return number(
    item.relatedAmount ??
      item.supplierTotal ??
      item.amount ??
      item.individualValue
  );
}

function occurrenceLargestValue(item: Occurrence) {
  return number(
    item.individualValue ?? item.amount ?? item.supplierTotal
  );
}

function occurrenceDocumentCount(item: Occurrence) {
  if (item.documentCount) return item.documentCount;
  if (item.records?.length) return item.records.length;
  if (item.record || item.documentNumber) return 1;
  return 0;
}

function buildSupplierGroups(occurrences: Occurrence[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();

  for (const item of occurrences) {
    const taxId = digits(item.supplierTaxId);
    const name = item.supplierName?.trim() || "Fornecedor não identificado";
    const key = taxId || name.toLocaleLowerCase("pt-BR");
    const current = groups.get(key) ?? {
      key,
      name,
      taxId,
      occurrences: [],
      categories: [],
      occurrenceCount: 0,
      documentCount: 0,
      totalRelated: 0,
      largestValue: 0,
      firstDate: undefined,
      lastDate: undefined,
      documentLinks: []
    };

    current.occurrences.push(item);
    current.occurrenceCount += 1;
    current.documentCount += occurrenceDocumentCount(item);
    current.totalRelated += occurrencePrimaryValue(item);
    current.largestValue = Math.max(
      current.largestValue,
      occurrenceLargestValue(item)
    );

    if (item.category && !current.categories.includes(item.category)) {
      current.categories.push(item.category);
    }

    if (item.documentDate) {
      current.firstDate =
        !current.firstDate || item.documentDate < current.firstDate
          ? item.documentDate
          : current.firstDate;
      current.lastDate =
        !current.lastDate || item.documentDate > current.lastDate
          ? item.documentDate
          : current.lastDate;
    }

    const url = getDocumentUrl(item);
    if (url && !current.documentLinks.some((link) => link.url === url)) {
      current.documentLinks.push({
        label: item.documentNumber
          ? `Documento ${item.documentNumber}`
          : "Documento original",
        url
      });
    }

    groups.set(key, current);
  }

  return [...groups.values()];
}

function severityDescription(ruleType?: string, item?: Occurrence) {
  if (!item) return "";

  if (ruleType === "documento-repetido") {
    return `${item.repetitionCount ?? 2} registros iguais`;
  }

  if (ruleType === "concentracao-fornecedor") {
    return `${((item.share ?? 0) * 100).toFixed(1)}% da categoria`;
  }

  return `Limite ${formatCurrency(item.threshold)}`;
}

export function AdminAlertOccurrences({ alert }: Props) {
  const evidence = alert.evidence as {
    consolidated?: boolean;
    ruleType?: string;
    analyzedYear?: number;
    category?: string | null;
    occurrenceCount?: number;
    supplierCount?: number;
    largestOccurrence?: number;
    occurrences?: Occurrence[];
  };

  const occurrences = evidence.occurrences ?? [];
  const groups = useMemo(() => buildSupplierGroups(occurrences), [occurrences]);
  const categories = useMemo(
    () =>
      [...new Set(occurrences.map((item) => item.category).filter(Boolean))]
        .map(String)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [occurrences]
  );

  const [viewMode, setViewMode] = useState<ViewMode>("suppliers");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [minimumValue, setMinimumValue] = useState("0");
  const [onlyWithDocument, setOnlyWithDocument] = useState(false);
  const [sort, setSort] = useState<SortKey>("total-desc");
  const [pageSize, setPageSize] = useState("25");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!evidence.consolidated || !occurrences.length) return null;

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const minimum = Number(minimumValue) || 0;

  const filteredGroups = groups
    .filter((group) => {
      const matchesQuery =
        !normalizedQuery ||
        group.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery) ||
        group.taxId.includes(digits(normalizedQuery)) ||
        group.categories.some((item) =>
          item.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
        ) ||
        group.occurrences.some((item) =>
          String(item.documentNumber ?? "")
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery)
        );

      const matchesCategory =
        category === "all" || group.categories.includes(category);
      const matchesValue = group.totalRelated >= minimum;
      const matchesDocument =
        !onlyWithDocument || group.documentLinks.length > 0;

      return (
        matchesQuery &&
        matchesCategory &&
        matchesValue &&
        matchesDocument
      );
    })
    .sort((a, b) => {
      if (sort === "largest-desc") return b.largestValue - a.largestValue;
      if (sort === "occurrences-desc") {
        return b.occurrenceCount - a.occurrenceCount;
      }
      if (sort === "recent-desc") {
        return String(b.lastDate ?? "").localeCompare(String(a.lastDate ?? ""));
      }
      if (sort === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
      return b.totalRelated - a.totalRelated;
    });

  const filteredOccurrences = occurrences
    .filter((item) => {
      const haystack = [
        item.supplierName,
        item.supplierTaxId,
        item.category,
        item.documentNumber
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return (
        (!normalizedQuery || haystack.includes(normalizedQuery)) &&
        (category === "all" || item.category === category) &&
        occurrencePrimaryValue(item) >= minimum &&
        (!onlyWithDocument || Boolean(getDocumentUrl(item)))
      );
    })
    .sort((a, b) => {
      if (sort === "largest-desc") {
        return occurrenceLargestValue(b) - occurrenceLargestValue(a);
      }
      if (sort === "occurrences-desc") {
        return number(b.repetitionCount) - number(a.repetitionCount);
      }
      if (sort === "recent-desc") {
        return String(b.documentDate ?? "").localeCompare(
          String(a.documentDate ?? "")
        );
      }
      if (sort === "name-asc") {
        return String(a.supplierName ?? "").localeCompare(
          String(b.supplierName ?? ""),
          "pt-BR"
        );
      }
      return occurrencePrimaryValue(b) - occurrencePrimaryValue(a);
    });

  const activeRows = viewMode === "suppliers" ? filteredGroups : filteredOccurrences;
  const numericPageSize = pageSize === "all" ? activeRows.length || 1 : Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(activeRows.length / numericPageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * numericPageSize;
  const visibleRows = activeRows.slice(start, start + numericPageSize);

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setMinimumValue("0");
    setOnlyWithDocument(false);
    setSort("total-desc");
    setPageSize("25");
    setPage(1);
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="admin-panel consolidated-occurrences occurrences-ux">
      <div className="panel-heading occurrences-title-row">
        <div>
          <p className="eyebrow">OCORRÊNCIAS CONSOLIDADAS</p>
          <h2>
            {evidence.occurrenceCount ?? occurrences.length} sinal(is) em {groups.length} fornecedor(es)
          </h2>
        </div>
        <span>
          {evidence.analyzedYear ?? "período não informado"} · valor relacionado {formatCurrency(alert.amount)}
        </span>
      </div>

      <p className="admin-warning">
        A visão padrão agrupa os sinais por fornecedor. Expanda uma empresa para
        conferir documentos e ocorrências individuais antes de qualquer conclusão.
      </p>

      <div className="occurrences-toolbar" aria-label="Filtros das ocorrências">
        <div className="occurrences-view-switch" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={viewMode === "suppliers" ? "active" : ""}
            onClick={() => {
              setViewMode("suppliers");
              setPage(1);
            }}
          >
            Por fornecedor
          </button>
          <button
            type="button"
            className={viewMode === "signals" ? "active" : ""}
            onClick={() => {
              setViewMode("signals");
              setPage(1);
            }}
          >
            Sinais individuais
          </button>
        </div>

        <label className="occurrences-search">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            placeholder="Fornecedor, CNPJ, documento ou categoria"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <label>
          <span>Categoria</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas</option>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Valor mínimo</span>
          <select
            value={minimumValue}
            onChange={(event) => {
              setMinimumValue(event.target.value);
              setPage(1);
            }}
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
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortKey);
              setPage(1);
            }}
          >
            <option value="total-desc">Maior valor relacionado</option>
            <option value="largest-desc">Maior pagamento</option>
            <option value="occurrences-desc">Mais ocorrências</option>
            <option value="recent-desc">Mais recente</option>
            <option value="name-asc">Fornecedor A–Z</option>
          </select>
        </label>

        <label>
          <span>Exibir</span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(event.target.value);
              setPage(1);
            }}
          >
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
            <option value="all">Todos</option>
          </select>
        </label>

        <label className="occurrences-checkbox">
          <input
            type="checkbox"
            checked={onlyWithDocument}
            onChange={(event) => {
              setOnlyWithDocument(event.target.checked);
              setPage(1);
            }}
          />
          <span>Somente com documento</span>
        </label>

        <button type="button" className="text-button" onClick={resetFilters}>
          Limpar filtros
        </button>
      </div>

      <div className="occurrences-results-bar">
        <strong>{activeRows.length} resultado(s)</strong>
        <span>
          Exibindo {activeRows.length ? start + 1 : 0}–{Math.min(start + numericPageSize, activeRows.length)}
        </span>
      </div>

      {viewMode === "suppliers" ? (
        <div className="supplier-summary-list">
          {(visibleRows as SupplierGroup[]).map((group) => {
            const isExpanded = expanded.has(group.key);
            const firstDocument = group.documentLinks[0];

            return (
              <article className="supplier-summary-card" key={group.key}>
                <div className="supplier-summary-main">
                  <div className="supplier-identity">
                    <span className="supplier-rank-label">FORNECEDOR</span>
                    <h3>{group.name}</h3>
                    <small>{group.taxId || "CNPJ/CPF não informado"}</small>
                    <p>{group.categories.join(" · ") || "Categoria não informada"}</p>
                  </div>

                  <dl className="supplier-summary-metrics">
                    <div>
                      <dt>Valor relacionado</dt>
                      <dd>{formatCurrency(group.totalRelated)}</dd>
                    </div>
                    <div>
                      <dt>Maior pagamento</dt>
                      <dd>{formatCurrency(group.largestValue)}</dd>
                    </div>
                    <div>
                      <dt>Sinais</dt>
                      <dd>{group.occurrenceCount}</dd>
                    </div>
                    <div>
                      <dt>Documentos</dt>
                      <dd>{group.documentCount}</dd>
                    </div>
                  </dl>

                  <div className="supplier-summary-actions">
                    <button
                      type="button"
                      className="button button-dark"
                      onClick={() => toggleExpanded(group.key)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Ocultar ocorrências" : "Ver ocorrências"}
                    </button>
                    {firstDocument ? (
                      <a
                        className="button button-primary"
                        href={firstDocument.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir documento ↗
                      </a>
                    ) : (
                      <span className="document-unavailable">Documento sem link na fonte</span>
                    )}
                    {group.taxId ? (
                      <button
                        type="button"
                        className="text-button copy-tax-id"
                        onClick={() => navigator.clipboard.writeText(group.taxId)}
                      >
                        Copiar CNPJ/CPF
                      </button>
                    ) : null}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="supplier-occurrence-details">
                    <div className="supplier-period">
                      <span>Período localizado</span>
                      <strong>
                        {formatDate(group.firstDate)} até {formatDate(group.lastDate)}
                      </strong>
                    </div>

                    <div className="table-wrap">
                      <table className="admin-table occurrences-table occurrences-table-detailed">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Documento</th>
                            <th>Categoria</th>
                            <th>Valor unitário</th>
                            <th>Valor relacionado</th>
                            <th>Sinal</th>
                            <th>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.occurrences.map((item, index) => {
                            const url = getDocumentUrl(item);
                            return (
                              <tr key={`${item.documentNumber}-${item.documentDate}-${index}`}>
                                <td>{formatDate(item.documentDate)}</td>
                                <td>{item.documentNumber || "—"}</td>
                                <td>{item.category || evidence.category || "—"}</td>
                                <td>{formatCurrency(occurrenceLargestValue(item))}</td>
                                <td>{formatCurrency(occurrencePrimaryValue(item))}</td>
                                <td>{severityDescription(evidence.ruleType, item)}</td>
                                <td>
                                  {url ? (
                                    <a href={url} target="_blank" rel="noreferrer">
                                      Abrir ↗
                                    </a>
                                  ) : (
                                    <span>Sem link</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table occurrences-table occurrences-table-signals">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Documento</th>
                <th>Data</th>
                <th>Valor unitário</th>
                <th>Valor relacionado</th>
                <th>Sinal</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {(visibleRows as Occurrence[]).map((item, index) => {
                const url = getDocumentUrl(item);
                return (
                  <tr key={`${item.supplierTaxId}-${item.documentNumber}-${item.documentDate}-${index}`}>
                    <td>
                      <strong>{item.supplierName ?? "Não identificado"}</strong>
                      <small>{item.supplierTaxId ?? "CNPJ/CPF não informado"}</small>
                    </td>
                    <td>{item.category ?? evidence.category ?? "—"}</td>
                    <td>{item.documentNumber || "—"}</td>
                    <td>{formatDate(item.documentDate)}</td>
                    <td>{formatCurrency(occurrenceLargestValue(item))}</td>
                    <td><strong>{formatCurrency(occurrencePrimaryValue(item))}</strong></td>
                    <td>{severityDescription(evidence.ruleType, item)}</td>
                    <td>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">Abrir ↗</a>
                      ) : (
                        <span>Sem link</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!activeRows.length ? (
        <div className="occurrences-empty-state">
          <h3>Nenhum resultado com esses filtros</h3>
          <button type="button" className="text-button" onClick={resetFilters}>
            Limpar filtros
          </button>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <nav className="occurrences-pagination" aria-label="Paginação das ocorrências">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            ← Anterior
          </button>
          <span>Página {safePage} de {pageCount}</span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Próxima →
          </button>
        </nav>
      ) : null}
    </section>
  );
}
