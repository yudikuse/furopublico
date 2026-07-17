"use client";

import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  alert: InvestigationAlert;
};

type Occurrence = {
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
  records?: Record<string, unknown>[];
  record?: Record<string, unknown>;
};

type SupplierSummary = {
  name: string;
  taxId?: string;
  amount: number;
  largestOccurrence: number;
  occurrenceCount: number;
  documentCount: number;
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
  categories: string[];
};

type CategorySummary = {
  name: string;
  amount: number;
  occurrenceCount: number;
  supplierCount: number;
  ruleTypes: string[];
};

type View = "overview" | "suppliers" | "signals" | "documents";
type Sort =
  | "amount-desc"
  | "largest-desc"
  | "signals-desc"
  | "name-asc";

function digits(value?: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function getUrl(item: Occurrence) {
  if (item.documentUrl) return item.documentUrl;

  const records = [
    item.record,
    ...(item.records ?? [])
  ].filter(Boolean) as Record<string, unknown>[];

  for (const record of records) {
    const candidate =
      record.urlDocumento ??
      record.urlDocument ??
      record.documentUrl ??
      record.url;

    if (
      typeof candidate === "string" &&
      /^https?:\/\//i.test(candidate)
    ) {
      return candidate;
    }
  }

  return undefined;
}

function primaryValue(item: Occurrence) {
  return Number(
    item.relatedAmount ??
      item.supplierTotal ??
      item.amount ??
      item.individualValue ??
      0
  );
}

function individualValue(item: Occurrence) {
  return Number(
    item.individualValue ??
      item.amount ??
      item.supplierTotal ??
      0
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

export function AdminParliamentaryAlert({ alert }: Props) {
  const evidence = alert.evidence as {
    consolidationLevel?: string;
    analyzedYear?: number;
    occurrenceCount?: number;
    supplierCount?: number;
    categoryCount?: number;
    ruleCount?: number;
    highPriorityCount?: number;
    largestOccurrence?: number;
    suppliers?: SupplierSummary[];
    categories?: CategorySummary[];
    ruleGroups?: RuleGroup[];
    occurrences?: Occurrence[];
  };

  const suppliers = evidence.suppliers ?? [];
  const categories = evidence.categories ?? [];
  const rules = evidence.ruleGroups ?? [];
  const occurrences = evidence.occurrences ?? [];

  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [rule, setRule] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [onlyWithDocument, setOnlyWithDocument] = useState(false);
  const [sort, setSort] = useState<Sort>("amount-desc");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(
    null
  );

  const normalizedQuery = query
    .trim()
    .toLocaleLowerCase("pt-BR");
  const minimumNumber = Number(minimum) || 0;

  const supplierRows = useMemo(() => {
    return suppliers
      .filter((supplier) => {
        const supplierOccurrences = occurrences.filter(
          (item) =>
            (digits(item.supplierTaxId) &&
              digits(item.supplierTaxId) === digits(supplier.taxId)) ||
            item.supplierName === supplier.name
        );

        const matchesQuery =
          !normalizedQuery ||
          supplier.name
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery) ||
          digits(supplier.taxId).includes(digits(normalizedQuery));

        const matchesCategory =
          !category || supplier.categories.includes(category);
        const matchesRule =
          !rule || supplier.ruleTypes.includes(rule);
        const matchesValue = supplier.amount >= minimumNumber;
        const matchesHigh =
          !onlyHigh ||
          supplierOccurrences.some((item) => item.severity === "alta");
        const matchesDocument =
          !onlyWithDocument ||
          supplierOccurrences.some((item) => Boolean(getUrl(item)));

        return (
          matchesQuery &&
          matchesCategory &&
          matchesRule &&
          matchesValue &&
          matchesHigh &&
          matchesDocument
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc") {
          return b.largestOccurrence - a.largestOccurrence;
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
      .filter((item) => {
        const haystack = [
          item.supplierName,
          item.supplierTaxId,
          item.category,
          item.documentNumber,
          item.ruleLabel
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");

        return (
          (!normalizedQuery || haystack.includes(normalizedQuery)) &&
          (!category || item.category === category) &&
          (!rule || item.ruleType === rule) &&
          primaryValue(item) >= minimumNumber &&
          (!onlyHigh || item.severity === "alta") &&
          (!onlyWithDocument || Boolean(getUrl(item)))
        );
      })
      .sort((a, b) => {
        if (sort === "largest-desc") {
          return individualValue(b) - individualValue(a);
        }
        if (sort === "signals-desc") {
          return Number(b.repetitionCount ?? 1) -
            Number(a.repetitionCount ?? 1);
        }
        if (sort === "name-asc") {
          return String(a.supplierName ?? "").localeCompare(
            String(b.supplierName ?? ""),
            "pt-BR"
          );
        }
        return primaryValue(b) - primaryValue(a);
      });
  }, [
    occurrences,
    normalizedQuery,
    category,
    rule,
    minimumNumber,
    onlyHigh,
    onlyWithDocument,
    sort
  ]);

  const documentRows = occurrenceRows.filter((item) => Boolean(getUrl(item)));

  if (evidence.consolidationLevel !== "deputy") return null;

  function clearFilters() {
    setQuery("");
    setCategory("");
    setRule("");
    setMinimum("0");
    setOnlyHigh(false);
    setOnlyWithDocument(false);
    setSort("amount-desc");
  }

  return (
    <section className="admin-panel parliamentary-alert">
      <div className="parliamentary-alert-heading">
        <div>
          <p className="eyebrow">PAINEL DO PARLAMENTAR</p>
          <h2>{alert.deputyName}</h2>
          <p>
            Todos os sinais da CEAP de{" "}
            {evidence.analyzedYear ?? "período não informado"} foram
            reunidos nesta página.
          </p>
        </div>

        <div className="parliamentary-priority">
          <span>Prioridade</span>
          <strong>{alert.severity}</strong>
          <small>
            {evidence.highPriorityCount ?? 0} sinal(is) de alta
          </small>
        </div>
      </div>

      <div className="parliamentary-metrics">
        <article>
          <span>Valor relacionado</span>
          <strong>{formatCurrency(alert.amount)}</strong>
        </article>
        <article>
          <span>Sinais técnicos</span>
          <strong>
            {evidence.occurrenceCount ?? occurrences.length}
          </strong>
        </article>
        <article>
          <span>Fornecedores</span>
          <strong>{evidence.supplierCount ?? suppliers.length}</strong>
        </article>
        <article>
          <span>Tipos de sinal</span>
          <strong>{evidence.ruleCount ?? rules.length}</strong>
        </article>
        <article>
          <span>Categorias</span>
          <strong>{evidence.categoryCount ?? categories.length}</strong>
        </article>
        <article>
          <span>Maior ocorrência</span>
          <strong>
            {formatCurrency(evidence.largestOccurrence)}
          </strong>
        </article>
      </div>

      <nav className="parliamentary-tabs" aria-label="Visões da apuração">
        {[
          ["overview", "Visão geral"],
          ["suppliers", `Fornecedores (${suppliers.length})`],
          ["signals", `Sinais (${occurrences.length})`],
          ["documents", `Documentos (${documentRows.length})`]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={view === value ? "active" : ""}
            onClick={() => setView(value as View)}
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
                    setView("signals");
                  }}
                >
                  <span>{item.shortLabel}</span>
                  <strong>{formatCurrency(item.amount)}</strong>
                  <small>
                    {item.occurrenceCount} sinal(is) ·{" "}
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
                    setView("suppliers");
                  }}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.occurrenceCount} sinal(is) ·{" "}
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
              <h3>Fornecedores de maior valor relacionado</h3>
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
                  onClick={() => {
                    setQuery(supplier.taxId || supplier.name);
                    setView("suppliers");
                  }}
                >
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.taxId || "Documento não informado"}</span>
                  </div>
                  <div>
                    <b>{formatCurrency(supplier.amount)}</b>
                    <span>{supplier.occurrenceCount} sinal(is)</span>
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
              <select
                value={rule}
                onChange={(event) => setRule(event.target.value)}
              >
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
              Valor mínimo
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
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as Sort)
                }
              >
                <option value="amount-desc">Maior valor relacionado</option>
                <option value="largest-desc">Maior pagamento</option>
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
                onChange={(event) =>
                  setOnlyWithDocument(event.target.checked)
                }
              />
              Somente com documento
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
                const key = supplier.taxId || supplier.name;
                const supplierOccurrences = occurrences.filter(
                  (item) =>
                    (digits(item.supplierTaxId) &&
                      digits(item.supplierTaxId) ===
                        digits(supplier.taxId)) ||
                    item.supplierName === supplier.name
                );
                const expanded = expandedSupplier === key;

                return (
                  <article key={key}>
                    <div className="supplier-summary-row">
                      <div className="supplier-identity">
                        <span>Fornecedor</span>
                        <strong>{supplier.name}</strong>
                        <small>
                          {supplier.taxId || "CNPJ/CPF não informado"}
                        </small>
                        <p>{supplier.categories.join(" · ")}</p>
                      </div>

                      <div>
                        <span>Valor relacionado</span>
                        <strong>{formatCurrency(supplier.amount)}</strong>
                      </div>

                      <div>
                        <span>Maior ocorrência</span>
                        <strong>
                          {formatCurrency(supplier.largestOccurrence)}
                        </strong>
                      </div>

                      <div>
                        <span>Sinais</span>
                        <strong>{supplier.occurrenceCount}</strong>
                      </div>

                      <div>
                        <span>Documentos</span>
                        <strong>{supplier.documentCount}</strong>
                      </div>

                      <button
                        type="button"
                        className="button button-dark"
                        onClick={() =>
                          setExpandedSupplier(expanded ? null : key)
                        }
                      >
                        {expanded ? "Ocultar" : "Abrir fornecedor"}
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
                          <span>
                            O fornecedor será cruzado com outros
                            parlamentares no módulo de entidades.
                          </span>
                        </div>

                        <div className="responsive-table">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Sinal</th>
                                <th>Categoria</th>
                                <th>Data</th>
                                <th>Documento</th>
                                <th>Valor unitário</th>
                                <th>Valor relacionado</th>
                                <th>Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierOccurrences.map((item, index) => {
                                const url = getUrl(item);
                                return (
                                  <tr
                                    key={`${item.documentNumber}-${item.documentDate}-${index}`}
                                  >
                                    <td>{ruleLabel(item.ruleType)}</td>
                                    <td>{item.category ?? "—"}</td>
                                    <td>{formatDate(item.documentDate)}</td>
                                    <td>{item.documentNumber || "—"}</td>
                                    <td>
                                      {formatCurrency(individualValue(item))}
                                    </td>
                                    <td>
                                      {formatCurrency(primaryValue(item))}
                                    </td>
                                    <td>
                                      {url ? (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Abrir ↗
                                        </a>
                                      ) : (
                                        "Sem link"
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
                    <th>Sinal</th>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Data/documento</th>
                    <th>Valor unitário</th>
                    <th>Valor relacionado</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {occurrenceRows.map((item, index) => {
                    const url = getUrl(item);
                    return (
                      <tr
                        key={`${item.ruleType}-${item.supplierTaxId}-${item.documentNumber}-${index}`}
                      >
                        <td>
                          <b
                            className={`severity severity-${item.severity ?? "media"}`}
                          >
                            {item.severity ?? "media"}
                          </b>
                        </td>
                        <td>{ruleLabel(item.ruleType)}</td>
                        <td>
                          <strong>{item.supplierName ?? "—"}</strong>
                          <small>{item.supplierTaxId ?? ""}</small>
                        </td>
                        <td>{item.category ?? "—"}</td>
                        <td>
                          {formatDate(item.documentDate)}
                          <small>{item.documentNumber ?? ""}</small>
                        </td>
                        <td>{formatCurrency(individualValue(item))}</td>
                        <td>{formatCurrency(primaryValue(item))}</td>
                        <td>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir ↗
                            </a>
                          ) : (
                            "Sem link"
                          )}
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
                {documentRows.length} documento(s) encontrado(s)
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Data</th>
                    <th>Número</th>
                    <th>Sinal</th>
                    <th>Valor</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {documentRows.map((item, index) => (
                    <tr
                      key={`${getUrl(item)}-${index}`}
                    >
                      <td>
                        <strong>{item.supplierName ?? "—"}</strong>
                        <small>{item.supplierTaxId ?? ""}</small>
                      </td>
                      <td>{item.category ?? "—"}</td>
                      <td>{formatDate(item.documentDate)}</td>
                      <td>{item.documentNumber ?? "—"}</td>
                      <td>{ruleLabel(item.ruleType)}</td>
                      <td>{formatCurrency(primaryValue(item))}</td>
                      <td>
                        <a
                          href={getUrl(item)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir documento ↗
                        </a>
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
