"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { alerts: InvestigationAlert[] };

type EvidenceSummary = {
  ruleType?: string;
  category?: string | null;
  analyzedYear?: number;
  occurrenceCount?: number;
  supplierCount?: number;
  largestOccurrence?: number;
};

const ruleLabels: Record<string, string> = {
  "documento-repetido": "Documentos repetidos",
  "concentracao-fornecedor": "Concentração de fornecedor",
  "valor-extremo": "Valor extremo"
};

function summary(alert: InvestigationAlert): EvidenceSummary {
  return alert.evidence as EvidenceSummary;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function AdminAlertsTable({ alerts }: Props) {
  const [search, setSearch] = useState("");
  const [deputy, setDeputy] = useState("");
  const [ruleType, setRuleType] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [dossier, setDossier] = useState("");

  const deputies = useMemo(
    () =>
      [...new Set(alerts.map((item) => item.deputyName).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), "pt-BR")),
    [alerts]
  );

  const filtered = useMemo(() => {
    const query = normalized(search.trim());

    return alerts.filter((alert) => {
      const evidence = summary(alert);
      const haystack = normalized(
        [
          alert.title,
          alert.rule,
          alert.deputyName,
          alert.supplierName,
          evidence.category,
          evidence.analyzedYear
        ]
          .filter(Boolean)
          .join(" ")
      );

      if (query && !haystack.includes(query)) return false;
      if (deputy && alert.deputyName !== deputy) return false;
      if (ruleType && evidence.ruleType !== ruleType) return false;
      if (severity && alert.severity !== severity) return false;
      if (status && alert.status !== status) return false;
      if (dossier === "pronto" && !alert.enrichment) return false;
      if (dossier === "pendente" && alert.enrichment) return false;
      return true;
    });
  }, [alerts, search, deputy, ruleType, severity, status, dossier]);

  function clear() {
    setSearch("");
    setDeputy("");
    setRuleType("");
    setSeverity("");
    setStatus("");
    setDossier("");
  }

  return (
    <div className="admin-panel alerts-queue-panel">
      <div className="alerts-filter-header">
        <div>
          <p className="eyebrow">FILTROS DA FILA</p>
          <h2>{filtered.length} alerta(s) exibido(s)</h2>
        </div>
        <button type="button" className="text-button" onClick={clear}>
          Limpar filtros
        </button>
      </div>

      <div className="alerts-filter-grid">
        <label className="alerts-search-field">
          Buscar
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Parlamentar, fornecedor, categoria ou regra"
          />
        </label>

        <label>
          Parlamentar
          <select value={deputy} onChange={(event) => setDeputy(event.target.value)}>
            <option value="">Todos</option>
            {deputies.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        <label>
          Tipo de sinal
          <select value={ruleType} onChange={(event) => setRuleType(event.target.value)}>
            <option value="">Todos</option>
            <option value="documento-repetido">Documentos repetidos</option>
            <option value="concentracao-fornecedor">Concentração</option>
            <option value="valor-extremo">Valor extremo</option>
          </select>
        </label>

        <label>
          Gravidade
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </label>

        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            <option value="novo">Novo</option>
            <option value="em_revisao">Em revisão</option>
            <option value="descartado">Descartado</option>
            <option value="convertido">Convertido</option>
          </select>
        </label>

        <label>
          Dossiê
          <select value={dossier} onChange={(event) => setDossier(event.target.value)}>
            <option value="">Todos</option>
            <option value="pronto">Pronto</option>
            <option value="pendente">Pendente</option>
          </select>
        </label>
      </div>

      <div className="table-wrap alerts-table-wrap">
        <table className="admin-table alerts-table">
          <thead>
            <tr>
              <th>Alerta consolidado</th>
              <th>Parlamentar</th>
              <th>Ocorrências</th>
              <th>Valor relacionado</th>
              <th>Severidade</th>
              <th>Dossiê</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((alert) => {
              const evidence = summary(alert);
              return (
                <tr key={alert.id}>
                  <td>
                    <strong>
                      <Link className="admin-alert-link" href={`/admin/alertas/${alert.id}`}>
                        {alert.title}
                      </Link>
                    </strong>
                    <small>
                      {evidence.category ? `${evidence.category} · ` : ""}
                      {evidence.analyzedYear ?? "Período não informado"}
                    </small>
                  </td>
                  <td>
                    {alert.deputyName ?? "—"}
                    <small>{alert.supplierName ?? ""}</small>
                  </td>
                  <td>
                    <strong>{evidence.occurrenceCount ?? 1}</strong>
                    <small>
                      {evidence.supplierCount ?? 1} fornecedor(es)
                    </small>
                  </td>
                  <td>
                    {formatCurrency(alert.amount)}
                    {evidence.largestOccurrence ? (
                      <small>Maior: {formatCurrency(evidence.largestOccurrence)}</small>
                    ) : null}
                  </td>
                  <td>
                    <b className={`severity severity-${alert.severity}`}>
                      {alert.severity}
                    </b>
                  </td>
                  <td>
                    {alert.enrichment ? (
                      <span className="dossier-ready">Pronto</span>
                    ) : (
                      <span className="dossier-pending">Pendente</span>
                    )}
                    <small>{formatDate(alert.enrichment?.generatedAt)}</small>
                  </td>
                  <td>{alert.status.replaceAll("_", " ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!filtered.length ? (
          <div className="empty-state">
            <h2>Nenhum alerta encontrado</h2>
            <p>Altere ou limpe os filtros do cabeçalho.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
