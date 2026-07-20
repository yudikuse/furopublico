"use client";

import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { alert: InvestigationAlert };
type Severity = "baixa" | "media" | "alta";

type OfficeEmployee = {
  key?: string;
  name?: string;
  point?: string;
  cargo?: string;
  function?: string;
  lotation?: string;
  appointmentDate?: string;
};

type OfficeMonth = {
  competence: string;
  totalAvailable?: number;
  totalSpent?: number;
  totalPublished: number;
  utilization?: number;
  staffCount?: number | null;
  documentId?: string;
  sourceUrl?: string;
};

type OfficeSignal = {
  id: string;
  type: string;
  label: string;
  severity: Severity;
  competence?: string;
  detail: string;
  documentIds?: string[];
  metrics?: Record<string, unknown>;
};

type OfficeDocument = {
  id: string;
  type: string;
  competence?: string;
  sourceUrl?: string;
  checksum?: string;
  acceptedRows?: number;
  description?: string;
};

type OfficeBudgetEvidence = {
  version: number;
  generatedAt?: string;
  analyzedYear?: number;
  months?: OfficeMonth[];
  staffProfiles?: OfficeEmployee[];
  currentSnapshot?: {
    date?: string;
    sourceUrl?: string;
    staffCount?: number;
    staff?: OfficeEmployee[];
  } | null;
  signals?: OfficeSignal[];
  documents?: OfficeDocument[];
  summary?: {
    monthCount?: number;
    latestCompetence?: string | null;
    latestTotalPublished?: number;
    latestTotalAvailable?: number;
    latestUtilization?: number;
    latestStaffCount?: number | null;
    currentSnapshotStaffCount?: number | null;
    signalCount?: number;
    signalTypeCount?: number;
    highPriorityCount?: number;
    largestMonthlyChange?: number;
    priority?: Severity;
  };
  dataQuality?: {
    exactDuplicatesRemoved?: number;
    unmappedRowCount?: number;
    missingCompetences?: string[];
    salaryBasis?: string;
    snapshotCaveat?: string;
  };
  disclaimer?: string;
};

type View = "overview" | "months" | "staff" | "signals" | "sources";

function percent(value?: number) {
  return `${((Number(value) || 0) * 100).toFixed(1).replace(".", ",")}%`;
}

function competenceLabel(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || "—";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatSignedCurrency(value?: number) {
  const amount = Number(value) || 0;
  const formatted = formatCurrency(Math.abs(amount));
  return amount > 0 ? `+${formatted}` : amount < 0 ? `-${formatted}` : formatted;
}

function signalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    "variacao-gasto-gabinete": "Variação do gasto mensal",
    "variacao-folha-publicada": "Variação da folha publicada"
  };
  return labels[type] ?? type.replaceAll("-", " ");
}

export function AdminOfficeBudget({ alert }: Props) {
  const evidence = alert.evidence as Record<string, unknown>;
  const officeBudget = evidence.officeBudget as OfficeBudgetEvidence | undefined;
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");

  const months = useMemo(
    () => [...(officeBudget?.months ?? [])].sort((a, b) =>
      String(a.competence).localeCompare(String(b.competence))
    ),
    [officeBudget]
  );
  const signals = officeBudget?.signals ?? [];
  const documents = officeBudget?.documents ?? [];
  const currentStaff = officeBudget?.currentSnapshot?.staff ?? officeBudget?.staffProfiles ?? [];

  const monthRows = useMemo(
    () => months.map((month, index) => {
      const previous = index ? months[index - 1] : null;
      const spent = Number(month.totalSpent ?? month.totalPublished ?? 0);
      const previousSpent = Number(previous?.totalSpent ?? previous?.totalPublished ?? 0);
      return {
        ...month,
        spent,
        available: Number(month.totalAvailable ?? 0),
        useRate: Number(month.utilization ?? 0),
        change: previous ? spent - previousSpent : null,
        changePercent: previous && previousSpent ? (spent - previousSpent) / previousSpent : null
      };
    }).reverse(),
    [months]
  );

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return currentStaff.filter((employee) => {
      if (!query) return true;
      return [employee.name, employee.point, employee.cargo, employee.function, employee.lotation]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    }).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR"));
  }, [currentStaff, search]);

  const filteredSignals = signals.filter((signal) => !severity || signal.severity === severity);

  if (!officeBudget) {
    return (
      <section className="admin-panel office-budget-empty">
        <p className="eyebrow">VERBA DE GABINETE</p>
        <h2>Módulo ainda sem dados</h2>
        <p>Execute o monitoramento para importar os valores mensais da página oficial da Câmara.</p>
      </section>
    );
  }

  return (
    <section className="admin-panel office-budget-panel">
      <div className="office-budget-heading">
        <div>
          <p className="eyebrow">MÓDULO · VERBA DE GABINETE</p>
          <h2>Gasto mensal e equipe atual</h2>
          <p>
            Os valores mensais vêm diretamente da página individual do parlamentar. A equipe é um
            snapshot atual separado e não é usada para reconstruir retroativamente cada mês.
          </p>
        </div>
        <div className={`office-budget-priority severity-${officeBudget.summary?.priority ?? "baixa"}`}>
          <span>Prioridade do módulo</span>
          <strong>{officeBudget.summary?.priority ?? "baixa"}</strong>
          <small>{officeBudget.summary?.highPriorityCount ?? 0} sinal(is) de alta</small>
        </div>
      </div>

      <div className="office-budget-metrics">
        <article>
          <span>Competências disponíveis</span>
          <strong>{officeBudget.summary?.monthCount ?? months.length}</strong>
        </article>
        <article>
          <span>Último valor gasto</span>
          <strong>{formatCurrency(officeBudget.summary?.latestTotalPublished)}</strong>
          <small>{competenceLabel(officeBudget.summary?.latestCompetence ?? undefined)}</small>
        </article>
        <article>
          <span>Disponível no mês</span>
          <strong>{formatCurrency(officeBudget.summary?.latestTotalAvailable)}</strong>
        </article>
        <article>
          <span>Uso do disponível</span>
          <strong>{percent(officeBudget.summary?.latestUtilization)}</strong>
        </article>
        <article>
          <span>Equipe no snapshot atual</span>
          <strong>{officeBudget.summary?.currentSnapshotStaffCount ?? "—"}</strong>
          <small>{formatDate(officeBudget.currentSnapshot?.date)}</small>
        </article>
        <article>
          <span>Sinais técnicos</span>
          <strong>{officeBudget.summary?.signalCount ?? signals.length}</strong>
        </article>
      </div>

      <p className="admin-warning office-budget-warning">
        O histórico mensal contém valores agregados de disponibilidade e gasto. Ele não informa,
        sozinho, quais pessoas receberam cada parcela nem comprova nomeação, exoneração, trabalho
        prestado ou irregularidade.
      </p>

      <nav className="office-budget-tabs" aria-label="Visões da verba de gabinete">
        {[
          ["overview", "Visão geral"],
          ["months", `Evolução mensal (${months.length})`],
          ["staff", `Equipe atual (${currentStaff.length})`],
          ["signals", `Sinais (${signals.length})`],
          ["sources", `Fontes (${documents.length})`]
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
        <div className="office-budget-overview">
          <section>
            <div className="panel-heading">
              <h3>Últimas competências</h3>
              <button type="button" className="text-button" onClick={() => setView("months")}>Ver evolução completa →</button>
            </div>
            <div className="office-budget-month-cards">
              {monthRows.slice(0, 6).map((month) => (
                <article key={month.competence}>
                  <span>{competenceLabel(month.competence)}</span>
                  <strong>{formatCurrency(month.spent)}</strong>
                  <small>Disponível: {formatCurrency(month.available)} · uso {percent(month.useRate)}</small>
                  {month.change !== null ? (
                    <b className={month.change >= 0 ? "positive" : "negative"}>
                      {formatSignedCurrency(month.change)} · {percent(month.changePercent ?? 0)}
                    </b>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>Sinais do módulo</h3>
              <button type="button" className="text-button" onClick={() => setView("signals")}>Ver todos →</button>
            </div>
            <div className="office-budget-signal-cards">
              {signals.slice(0, 6).map((signal) => (
                <article key={signal.id}>
                  <b className={`severity severity-${signal.severity}`}>{signal.severity}</b>
                  <span>{signalTypeLabel(signal.type)}</span>
                  <strong>{competenceLabel(signal.competence)}</strong>
                  <p>{signal.detail}</p>
                </article>
              ))}
              {!signals.length ? (
                <div className="empty-state">
                  <h3>Nenhum sinal técnico nesta série</h3>
                  <p>A ausência de sinal indica apenas que as regras atuais não foram acionadas.</p>
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>Equipe funcional atual</h3>
              <button type="button" className="text-button" onClick={() => setView("staff")}>Ver equipe →</button>
            </div>
            <p>
              {officeBudget.currentSnapshot
                ? `${officeBudget.currentSnapshot.staffCount ?? 0} secretário(s) parlamentar(es) no snapshot de ${formatDate(officeBudget.currentSnapshot.date)}.`
                : "Nenhum snapshot funcional disponível."}
            </p>
          </section>
        </div>
      ) : null}

      {view === "months" ? (
        <div className="responsive-table">
          <table className="admin-table office-budget-table">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Disponível</th>
                <th>Gasto</th>
                <th>Uso</th>
                <th>Variação do gasto</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((month) => (
                <tr key={month.competence}>
                  <td><strong>{competenceLabel(month.competence)}</strong></td>
                  <td>{formatCurrency(month.available)}</td>
                  <td>{formatCurrency(month.spent)}</td>
                  <td>{percent(month.useRate)}</td>
                  <td>
                    {month.change === null ? "—" : (
                      <>{formatSignedCurrency(month.change)}<small>{percent(month.changePercent ?? 0)}</small></>
                    )}
                  </td>
                  <td>
                    {month.sourceUrl
                      ? <a href={month.sourceUrl} target="_blank" rel="noreferrer">Abrir página oficial ↗</a>
                      : "Sem link"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "staff" ? (
        <div>
          <div className="office-budget-filter-bar">
            <label>
              Buscar integrante
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, ponto, cargo, função ou lotação"
              />
            </label>
            <span>{filteredStaff.length} integrante(s) no snapshot atual</span>
          </div>
          <div className="responsive-table">
            <table className="admin-table office-budget-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ponto</th>
                  <th>Cargo/função</th>
                  <th>Nomeação informada</th>
                  <th>Lotação</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((employee) => (
                  <tr key={employee.key ?? employee.point ?? employee.name}>
                    <td><strong>{employee.name ?? "Não identificado"}</strong></td>
                    <td>{employee.point || "—"}</td>
                    <td>{employee.cargo || employee.function || "—"}</td>
                    <td>{formatDate(employee.appointmentDate)}</td>
                    <td>{employee.lotation || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredStaff.length ? (
            <div className="empty-state">
              <h3>Snapshot funcional indisponível ou sem correspondência</h3>
              <p>Os valores mensais continuam válidos e permanecem separados da lista atual de integrantes.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "signals" ? (
        <div>
          <div className="office-budget-filter-bar office-budget-signal-filter">
            <label>
              Prioridade
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="">Todas</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </label>
            <span>{filteredSignals.length} sinal(is)</span>
          </div>
          <div className="office-budget-signal-list">
            {filteredSignals.map((signal) => (
              <article key={signal.id}>
                <div>
                  <b className={`severity severity-${signal.severity}`}>{signal.severity}</b>
                  <span>{signalTypeLabel(signal.type)}</span>
                </div>
                <strong>{competenceLabel(signal.competence)}</strong>
                <p>{signal.detail}</p>
                <small>O sinal registra uma variação da fonte e não comprova irregularidade.</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {view === "sources" ? (
        <div className="office-budget-source-list">
          {documents.map((document) => (
            <article key={document.id}>
              <div>
                <span>{document.type === "snapshot-funcionarios" ? "Snapshot funcional" : "Página mensal consolidada"}</span>
                <strong>{document.competence ?? "—"}</strong>
                <p>{document.description}</p>
                <small>{document.acceptedRows ?? 0} competência(s) ou registro(s) relacionados</small>
              </div>
              {document.sourceUrl ? (
                <a className="button button-secondary" href={document.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte ↗</a>
              ) : null}
            </article>
          ))}

          <div className="office-budget-method-note">
            <h3>Limites da fonte</h3>
            <p>{officeBudget.dataQuality?.salaryBasis}</p>
            <p>{officeBudget.dataQuality?.snapshotCaveat}</p>
            {officeBudget.dataQuality?.missingCompetences?.length ? (
              <p>Intervalos sem competência localizada: {officeBudget.dataQuality.missingCompetences.join(", ")}.</p>
            ) : null}
            <p>{officeBudget.disclaimer}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
