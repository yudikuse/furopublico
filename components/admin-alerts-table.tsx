"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  alerts: InvestigationAlert[];
};

type ParliamentarySummary = {
  alert: InvestigationAlert;
  year?: number;
  ruleCount: number;
  occurrenceCount: number;
  supplierCount: number;
  categoryCount: number;
  highPriorityCount: number;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function summarize(alert: InvestigationAlert): ParliamentarySummary {
  const evidence = alert.evidence as Record<string, unknown>;

  return {
    alert,
    year:
      typeof evidence.analyzedYear === "number"
        ? evidence.analyzedYear
        : undefined,
    ruleCount: Number(evidence.ruleCount ?? 1),
    occurrenceCount: Number(evidence.occurrenceCount ?? 1),
    supplierCount: Number(evidence.supplierCount ?? 1),
    categoryCount: Number(evidence.categoryCount ?? 1),
    highPriorityCount: Number(
      evidence.highPriorityCount ??
        (alert.severity === "alta" ? 1 : 0)
    )
  };
}

export function AdminAlertsTable({ alerts }: Props) {
  const rows = useMemo(() => alerts.map(summarize), [alerts]);

  const [search, setSearch] = useState("");
  const [deputy, setDeputy] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [sort, setSort] = useState("priority");

  const deputies = useMemo(
    () =>
      [...new Set(
        alerts.map((item) => item.deputyName).filter(Boolean)
      )].sort((a, b) =>
        String(a).localeCompare(String(b), "pt-BR")
      ),
    [alerts]
  );

  const years = useMemo(
    () =>
      [...new Set(rows.map((item) => item.year).filter(Boolean))]
        .sort((a, b) => Number(b) - Number(a)),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = normalized(search.trim());
    const minimumNumber = Number(minimum) || 0;

    return rows
      .filter((row) => {
        const alert = row.alert;
        const haystack = normalized(
          [
            alert.deputyName,
            alert.title,
            alert.rule,
            row.year
          ]
            .filter(Boolean)
            .join(" ")
        );

        return (
          (!query || haystack.includes(query)) &&
          (!deputy || alert.deputyName === deputy) &&
          (!severity || alert.severity === severity) &&
          (!status || alert.status === status) &&
          (!year || String(row.year ?? "") === year) &&
          Number(alert.amount ?? 0) >= minimumNumber
        );
      })
      .sort((a, b) => {
        if (sort === "amount") {
          return Number(b.alert.amount ?? 0) -
            Number(a.alert.amount ?? 0);
        }
        if (sort === "signals") {
          return b.occurrenceCount - a.occurrenceCount;
        }
        if (sort === "suppliers") {
          return b.supplierCount - a.supplierCount;
        }
        if (sort === "name") {
          return String(a.alert.deputyName ?? "").localeCompare(
            String(b.alert.deputyName ?? ""),
            "pt-BR"
          );
        }

        const priority = { alta: 0, media: 1, baixa: 2 };
        return (
          priority[a.alert.severity] -
            priority[b.alert.severity] ||
          b.highPriorityCount - a.highPriorityCount ||
          Number(b.alert.amount ?? 0) -
            Number(a.alert.amount ?? 0)
        );
      });
  }, [
    rows,
    search,
    deputy,
    severity,
    status,
    year,
    minimum,
    sort
  ]);

  function clear() {
    setSearch("");
    setDeputy("");
    setSeverity("");
    setStatus("");
    setYear("");
    setMinimum("0");
    setSort("priority");
  }

  return (
    <div className="admin-panel alerts-queue-panel parliamentary-queue">
      <div className="alerts-filter-header">
        <div>
          <p className="eyebrow">FILA POR PARLAMENTAR</p>
          <h2>{filtered.length} gabinete(s) exibido(s)</h2>
        </div>
        <button type="button" className="text-button" onClick={clear}>
          Limpar filtros
        </button>
      </div>

      <div className="alerts-filter-grid parliamentary-queue-filters">
        <label className="alerts-search-field">
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome do parlamentar"
          />
        </label>

        <label>
          Parlamentar
          <select
            value={deputy}
            onChange={(event) => setDeputy(event.target.value)}
          >
            <option value="">Todos</option>
            {deputies.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ano
          <select
            value={year}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="">Todos</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prioridade
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="novo">Novo</option>
            <option value="em_revisao">Em revisão</option>
            <option value="convertido">Convertido</option>
            <option value="descartado">Descartado</option>
          </select>
        </label>

        <label>
          Valor mínimo
          <select
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          >
            <option value="0">Qualquer valor</option>
            <option value="50000">R$ 50 mil</option>
            <option value="100000">R$ 100 mil</option>
            <option value="250000">R$ 250 mil</option>
            <option value="500000">R$ 500 mil</option>
            <option value="1000000">R$ 1 milhão</option>
          </select>
        </label>

        <label>
          Ordenar
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="priority">Maior prioridade</option>
            <option value="amount">Maior valor</option>
            <option value="signals">Mais sinais</option>
            <option value="suppliers">Mais fornecedores</option>
            <option value="name">Nome A–Z</option>
          </select>
        </label>
      </div>

      <div className="parliamentary-queue-list">
        {filtered.map((row) => {
          const alert = row.alert;

          return (
            <Link
              key={alert.id}
              href={`/admin/alertas/${alert.id}`}
              className="parliamentary-queue-card"
            >
              <div className="parliamentary-queue-identity">
                <span>Parlamentar</span>
                <h3>
                  {alert.deputyName ?? "Não identificado"}
                </h3>
                <small>
                  {row.year ?? "Período não informado"} ·{" "}
                  {alert.status.replaceAll("_", " ")}
                </small>
              </div>

              <div>
                <span>Tipos de sinal</span>
                <strong>{row.ruleCount}</strong>
              </div>

              <div>
                <span>Sinais técnicos</span>
                <strong>{row.occurrenceCount}</strong>
              </div>

              <div>
                <span>Fornecedores</span>
                <strong>{row.supplierCount}</strong>
              </div>

              <div>
                <span>Valor relacionado</span>
                <strong>{formatCurrency(alert.amount)}</strong>
              </div>

              <div className="parliamentary-queue-priority">
                <b className={`severity severity-${alert.severity}`}>
                  {alert.severity}
                </b>
                <small>
                  {row.highPriorityCount} sinal(is) de alta
                </small>
                <time>{formatDate(alert.detectedAt)}</time>
              </div>
            </Link>
          );
        })}
      </div>

      {!filtered.length ? (
        <div className="empty-state">
          <h3>Nenhum parlamentar encontrado</h3>
          <p>Ajuste ou limpe os filtros da fila.</p>
        </div>
      ) : null}
    </div>
  );
}
