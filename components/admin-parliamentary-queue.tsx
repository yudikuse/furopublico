"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  alerts: InvestigationAlert[];
};

type OfficeSummary = {
  latestCompetence?: string | null;
  latestTotalPublished?: number;
  latestStaffCount?: number;
  signalCount?: number;
  signalTypeCount?: number;
  highPriorityCount?: number;
};

type ParliamentarySummary = {
  alert: InvestigationAlert;
  year?: number;
  ruleCount: number;
  signalCount: number;
  supplierCount: number;
  documentCount: number;
  highPriorityCount: number;
  financialAmount: number;
  hasCeap: boolean;
  hasOffice: boolean;
  moduleCount: number;
  officeSummary?: OfficeSummary;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function competenceLabel(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return "—";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function summarize(alert: InvestigationAlert): ParliamentarySummary {
  const evidence = alert.evidence as Record<string, unknown>;
  const officeBudget = evidence.officeBudget as
    | { summary?: OfficeSummary }
    | undefined;
  const officeSummary = officeBudget?.summary;
  const ceapRuleCount = Number(evidence.ruleCount ?? 0);
  const ceapSignalCount = Number(
    evidence.signalCount ?? evidence.occurrenceCount ?? 0
  );
  const ceapDocumentCount = Number(evidence.documentCount ?? 0);
  const ceapSupplierCount = Number(evidence.supplierCount ?? 0);
  const hasCeap =
    ceapSignalCount > 0 ||
    ceapDocumentCount > 0 ||
    (Array.isArray(evidence.documents) && evidence.documents.length > 0);
  const hasOffice = Boolean(officeBudget);

  return {
    alert,
    year:
      typeof evidence.analyzedYear === "number"
        ? evidence.analyzedYear
        : undefined,
    ruleCount:
      ceapRuleCount + Number(officeSummary?.signalTypeCount ?? 0),
    signalCount:
      ceapSignalCount + Number(officeSummary?.signalCount ?? 0),
    supplierCount: ceapSupplierCount,
    documentCount: ceapDocumentCount,
    highPriorityCount:
      Number(evidence.highPriorityCount ?? 0) +
      Number(officeSummary?.highPriorityCount ?? 0),
    financialAmount: Number(evidence.financialAmount ?? alert.amount ?? 0),
    hasCeap,
    hasOffice,
    moduleCount: Number(hasCeap) + Number(hasOffice),
    officeSummary
  };
}

export function AdminParliamentaryQueue({ alerts }: Props) {
  const rows = useMemo(() => alerts.map(summarize), [alerts]);

  const [search, setSearch] = useState("");
  const [deputy, setDeputy] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [module, setModule] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [sort, setSort] = useState("priority");

  const deputies = useMemo(
    () =>
      [...new Set(alerts.map((item) => item.deputyName).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b), "pt-BR")
      ),
    [alerts]
  );

  const years = useMemo(
    () =>
      [...new Set(rows.map((item) => item.year).filter(Boolean))].sort(
        (a, b) => Number(b) - Number(a)
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = normalized(search.trim());
    const minimumNumber = Number(minimum) || 0;

    return rows
      .filter((row) => {
        const alert = row.alert;
        const haystack = normalized(
          [alert.deputyName, alert.title, alert.rule, row.year]
            .filter(Boolean)
            .join(" ")
        );
        const matchesModule =
          !module ||
          (module === "ceap" && row.hasCeap) ||
          (module === "office" && row.hasOffice) ||
          (module === "both" && row.hasCeap && row.hasOffice);

        return (
          (!query || haystack.includes(query)) &&
          (!deputy || alert.deputyName === deputy) &&
          (!severity || alert.severity === severity) &&
          (!status || alert.status === status) &&
          (!year || String(row.year ?? "") === year) &&
          matchesModule &&
          row.financialAmount >= minimumNumber
        );
      })
      .sort((a, b) => {
        if (sort === "amount") return b.financialAmount - a.financialAmount;
        if (sort === "office") {
          return (
            Number(b.officeSummary?.latestTotalPublished ?? 0) -
            Number(a.officeSummary?.latestTotalPublished ?? 0)
          );
        }
        if (sort === "signals") return b.signalCount - a.signalCount;
        if (sort === "modules") return b.moduleCount - a.moduleCount;
        if (sort === "name") {
          return String(a.alert.deputyName ?? "").localeCompare(
            String(b.alert.deputyName ?? ""),
            "pt-BR"
          );
        }

        const priority = { alta: 0, media: 1, baixa: 2 };
        return (
          priority[a.alert.severity] - priority[b.alert.severity] ||
          b.highPriorityCount - a.highPriorityCount ||
          b.moduleCount - a.moduleCount ||
          b.signalCount - a.signalCount
        );
      });
  }, [
    rows,
    search,
    deputy,
    severity,
    status,
    year,
    module,
    minimum,
    sort
  ]);

  function clear() {
    setSearch("");
    setDeputy("");
    setSeverity("");
    setStatus("");
    setYear("");
    setModule("");
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

      <div className="alerts-filter-grid parliamentary-queue-filters office-queue-filters">
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
          <select value={deputy} onChange={(event) => setDeputy(event.target.value)}>
            <option value="">Todos</option>
            {deputies.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        <label>
          Ano
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="">Todos</option>
            {years.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label>
          Módulo
          <select value={module} onChange={(event) => setModule(event.target.value)}>
            <option value="">Todos</option>
            <option value="ceap">Com CEAP</option>
            <option value="office">Com verba de gabinete</option>
            <option value="both">Com os dois módulos</option>
          </select>
        </label>

        <label>
          Prioridade de apuração
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
            <option value="convertido">Convertido</option>
            <option value="descartado">Descartado</option>
          </select>
        </label>

        <label>
          Valor CEAP mínimo
          <select value={minimum} onChange={(event) => setMinimum(event.target.value)}>
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
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="priority">Maior prioridade</option>
            <option value="signals">Mais sinais</option>
            <option value="modules">Mais módulos</option>
            <option value="amount">Maior valor CEAP</option>
            <option value="office">Maior folha publicada</option>
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
              className="parliamentary-queue-card office-enabled-queue-card"
            >
              <div className="parliamentary-queue-identity">
                <span>Parlamentar</span>
                <h3>{alert.deputyName ?? "Não identificado"}</h3>
                <small>
                  {row.year ?? "Período não informado"} ·{" "}
                  {alert.status.replaceAll("_", " ")}
                </small>
                <div className="case-module-badges">
                  {row.hasCeap ? <b>CEAP</b> : null}
                  {row.hasOffice ? <b>GABINETE</b> : null}
                </div>
              </div>

              <div>
                <span>Módulos</span>
                <strong>{row.moduleCount}</strong>
              </div>

              <div>
                <span>Sinais técnicos</span>
                <strong>{row.signalCount}</strong>
                <small>{row.ruleCount} tipo(s)</small>
              </div>

              <div>
                <span>Valor CEAP</span>
                <strong>{row.hasCeap ? formatCurrency(row.financialAmount) : "—"}</strong>
                <small>{row.documentCount} documento(s)</small>
              </div>

              <div>
                <span>Folha publicada recente</span>
                <strong>
                  {row.hasOffice
                    ? formatCurrency(row.officeSummary?.latestTotalPublished)
                    : "—"}
                </strong>
                <small>
                  {row.hasOffice
                    ? `${row.officeSummary?.latestStaffCount ?? 0} integrante(s) · ${competenceLabel(row.officeSummary?.latestCompetence)}`
                    : "Módulo sem dados"}
                </small>
              </div>

              <div className="parliamentary-queue-priority">
                <b className={`severity severity-${alert.severity}`}>{alert.severity}</b>
                <small>{row.highPriorityCount} sinal(is) de alta</small>
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
