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
  category?: string;
  cargo?: string;
  function?: string;
  lotation?: string;
  appointmentDate?: string;
  matchMethod?: string;
  matchConfidence?: string;
  firstSeen?: string;
  lastSeen?: string;
  snapshotsPresent?: number;
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

type StaffMovement = {
  id: string;
  fromDate?: string;
  toDate?: string;
  previousCount?: number;
  currentCount?: number;
  added?: OfficeEmployee[];
  removed?: OfficeEmployee[];
  addedCount?: number;
  removedCount?: number;
  netChange?: number;
};

type Classification = {
  utilization?: string;
  variation?: string;
  trend?: string;
  teamSize?: string;
};

type OfficeBudgetEvidence = {
  version: number;
  generatedAt?: string;
  analyzedYear?: number;
  profile?: { officeNumber?: string | null };
  months?: OfficeMonth[];
  staffProfiles?: OfficeEmployee[];
  currentSnapshot?: {
    date?: string;
    sourceUrl?: string;
    staffCount?: number | null;
    staff?: OfficeEmployee[];
    matchStatus?: string;
    officeNumber?: string | null;
    sourceSecretaryRows?: number;
    mappedSecretaryRows?: number;
  } | null;
  snapshotHistory?: Array<{
    date?: string;
    sourceUrl?: string;
    staffCount?: number | null;
    staff?: OfficeEmployee[];
    matchStatus?: string;
  }>;
  staffMovements?: StaffMovement[];
  signals?: OfficeSignal[];
  documents?: OfficeDocument[];
  summary?: {
    monthCount?: number;
    periodStart?: string | null;
    periodEnd?: string | null;
    latestCompetence?: string | null;
    latestTotalPublished?: number;
    latestTotalAvailable?: number;
    latestUtilization?: number;
    accumulatedSpent?: number;
    accumulatedAvailable?: number;
    accumulatedUnused?: number;
    accumulatedUtilization?: number;
    averageMonthlySpent?: number;
    medianMonthlySpent?: number;
    maxMonthlySpent?: number;
    maxMonthlyCompetence?: string | null;
    minMonthlySpent?: number;
    minMonthlyCompetence?: string | null;
    coefficientOfVariation?: number;
    monthsAbove95?: number;
    monthsBelow75?: number;
    currentSnapshotStaffCount?: number | null;
    currentSnapshotStatus?: string;
    staffAddedSincePrevious?: number;
    staffRemovedSincePrevious?: number;
    signalCount?: number;
    signalTypeCount?: number;
    highPriorityCount?: number;
    largestMonthlyChange?: number;
    priority?: Severity;
    classification?: Classification;
  };
  dataQuality?: {
    exactDuplicatesRemoved?: number;
    snapshotTotalRows?: number;
    snapshotSecretaryRows?: number;
    snapshotMappedRows?: number;
    unmappedRowCount?: number;
    mappedByMethod?: Record<string, number>;
    snapshotSchema?: Record<string, unknown>;
    unmappedSamples?: Array<Record<string, unknown>>;
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

function competenceLabel(value?: string | null) {
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

function normalized(value?: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function signalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    "variacao-gasto-gabinete": "Variação do gasto mensal",
    "variacao-folha-publicada": "Variação da folha publicada",
    "variacao-equipe-snapshot": "Mudança entre snapshots da equipe"
  };
  return labels[type] ?? type.replaceAll("-", " ");
}

function classificationLabel(type: keyof Classification, value?: string) {
  const labels: Record<string, string> = {
    "quase-integral": "Uso quase integral",
    alta: type === "variation" ? "Variação alta" : "Utilização alta",
    intermediaria: "Utilização intermediária",
    baixa: "Utilização baixa",
    estavel: type === "trend" ? "Tendência estável" : "Variação estável",
    moderada: "Variação moderada",
    crescente: "Tendência crescente",
    decrescente: "Tendência decrescente",
    "dados-insuficientes": "Dados insuficientes",
    "sem-dados": "Sem dados",
    "nao-associada": "Equipe não associada",
    "ate-4": "Até 4 integrantes",
    "5-a-9": "5 a 9 integrantes",
    "10-a-17": "10 a 17 integrantes",
    "18-a-25": "18 a 25 integrantes",
    "acima-de-25": "Acima de 25 integrantes"
  };
  return labels[value ?? ""] ?? value?.replaceAll("-", " ") ?? "Sem dados";
}

function locationClass(lotation?: string) {
  const value = normalized(lotation);
  if (!value) return "não informada";
  if (value.includes("brasilia") || value.includes("camara dos deputados") || value.includes("anexo")) {
    return "Brasília";
  }
  return "Estado/outro";
}

function appointmentYear(value?: string) {
  const match = String(value ?? "").match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? "";
}

export function AdminOfficeBudget({ alert }: Props) {
  const evidence = alert.evidence as Record<string, unknown>;
  const officeBudget = evidence.officeBudget as OfficeBudgetEvidence | undefined;
  const [view, setView] = useState<View>("overview");

  const [monthUse, setMonthUse] = useState("");
  const [monthVariation, setMonthVariation] = useState("");
  const [monthSort, setMonthSort] = useState("recent");

  const [staffSearch, setStaffSearch] = useState("");
  const [staffLocation, setStaffLocation] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [staffYear, setStaffYear] = useState("");
  const [staffSort, setStaffSort] = useState("name");

  const [severity, setSeverity] = useState("");
  const [signalType, setSignalType] = useState("");

  const months = useMemo(
    () =>
      [...(officeBudget?.months ?? [])].sort((a, b) =>
        String(a.competence).localeCompare(String(b.competence))
      ),
    [officeBudget]
  );
  const signals = officeBudget?.signals ?? [];
  const documents = officeBudget?.documents ?? [];
  const movements = officeBudget?.staffMovements ?? [];
  const currentStaff =
    officeBudget?.currentSnapshot?.staff ?? officeBudget?.staffProfiles ?? [];

  const allMonthRows = useMemo(
    () =>
      months.map((month, index) => {
        const previous = index ? months[index - 1] : null;
        const spent = Number(month.totalSpent ?? month.totalPublished ?? 0);
        const previousSpent = Number(
          previous?.totalSpent ?? previous?.totalPublished ?? 0
        );
        return {
          ...month,
          spent,
          available: Number(month.totalAvailable ?? 0),
          useRate: Number(month.utilization ?? 0),
          change: previous ? spent - previousSpent : null,
          changePercent:
            previous && previousSpent
              ? (spent - previousSpent) / previousSpent
              : null
        };
      }),
    [months]
  );

  const monthRows = useMemo(() => {
    const filtered = allMonthRows.filter((month) => {
      const useMatches =
        !monthUse ||
        (monthUse === "95" && month.useRate >= 0.95) ||
        (monthUse === "85" && month.useRate >= 0.85 && month.useRate < 0.95) ||
        (monthUse === "below85" && month.useRate < 0.85);
      const variationMatches =
        !monthVariation ||
        (monthVariation === "up" && Number(month.change ?? 0) > 0) ||
        (monthVariation === "down" && Number(month.change ?? 0) < 0) ||
        (monthVariation === "stable" &&
          month.change !== null &&
          Math.abs(Number(month.changePercent ?? 0)) < 0.01);
      return useMatches && variationMatches;
    });

    return filtered.sort((a, b) => {
      if (monthSort === "oldest") {
        return String(a.competence).localeCompare(String(b.competence));
      }
      if (monthSort === "spent") return b.spent - a.spent;
      if (monthSort === "use") return b.useRate - a.useRate;
      if (monthSort === "change") {
        return Math.abs(Number(b.change ?? 0)) - Math.abs(Number(a.change ?? 0));
      }
      return String(b.competence).localeCompare(String(a.competence));
    });
  }, [allMonthRows, monthUse, monthVariation, monthSort]);

  const staffRoles = useMemo(
    () =>
      [
        ...new Set(
          currentStaff
            .map((employee) => employee.function || employee.cargo || employee.category)
            .filter(Boolean)
        )
      ].sort((a, b) => String(a).localeCompare(String(b), "pt-BR")),
    [currentStaff]
  );

  const staffYears = useMemo(
    () =>
      [
        ...new Set(
          currentStaff.map((employee) => appointmentYear(employee.appointmentDate)).filter(Boolean)
        )
      ].sort((a, b) => Number(b) - Number(a)),
    [currentStaff]
  );

  const filteredStaff = useMemo(() => {
    const query = normalized(staffSearch.trim());
    return currentStaff
      .filter((employee) => {
        const role = employee.function || employee.cargo || employee.category || "";
        const haystack = normalized(
          [
            employee.name,
            employee.point,
            employee.category,
            employee.cargo,
            employee.function,
            employee.lotation
          ]
            .filter(Boolean)
            .join(" ")
        );
        return (
          (!query || haystack.includes(query)) &&
          (!staffLocation || locationClass(employee.lotation) === staffLocation) &&
          (!staffRole || role === staffRole) &&
          (!staffYear || appointmentYear(employee.appointmentDate) === staffYear)
        );
      })
      .sort((a, b) => {
        if (staffSort === "appointment") {
          return String(b.appointmentDate ?? "").localeCompare(
            String(a.appointmentDate ?? "")
          );
        }
        if (staffSort === "location") {
          return locationClass(a.lotation).localeCompare(locationClass(b.lotation), "pt-BR");
        }
        return String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR");
      });
  }, [
    currentStaff,
    staffSearch,
    staffLocation,
    staffRole,
    staffYear,
    staffSort
  ]);

  const signalTypes = useMemo(
    () => [...new Set(signals.map((signal) => signal.type))].sort(),
    [signals]
  );
  const filteredSignals = signals.filter(
    (signal) =>
      (!severity || signal.severity === severity) &&
      (!signalType || signal.type === signalType)
  );

  if (!officeBudget) {
    return (
      <section className="admin-panel office-budget-empty">
        <p className="eyebrow">VERBA DE GABINETE</p>
        <h2>Módulo ainda sem dados</h2>
        <p>
          Execute o monitoramento para importar os valores mensais da página
          oficial da Câmara.
        </p>
      </section>
    );
  }

  const summary = officeBudget.summary ?? {};
  const classification = summary.classification ?? {};
  const snapshotAssociated =
    officeBudget.currentSnapshot?.matchStatus === "associado";
  const snapshotCollected = Boolean(officeBudget.currentSnapshot?.date);
  const latestMovement = movements.at(-1);

  return (
    <section className="admin-panel office-budget-panel">
      <div className="office-budget-heading">
        <div>
          <p className="eyebrow">MÓDULO · VERBA DE GABINETE</p>
          <h2>Gastos acumulados e equipe atual</h2>
          <p>
            Valores mensais e equipe funcional ficam separados. O acumulado é a
            soma das competências deste caso; o snapshot representa apenas a
            posição funcional mais recente.
          </p>
        </div>
        <div
          className={`office-budget-priority severity-${
            summary.priority ?? "baixa"
          }`}
        >
          <span>Prioridade do módulo</span>
          <strong>{summary.priority ?? "baixa"}</strong>
          <small>{summary.highPriorityCount ?? 0} sinal(is) de alta</small>
        </div>
      </div>

      <div className="office-budget-metrics office-budget-metrics-expanded">
        <article>
          <span>Gasto acumulado</span>
          <strong>{formatCurrency(summary.accumulatedSpent)}</strong>
          <small>
            {competenceLabel(summary.periodStart)} a{" "}
            {competenceLabel(summary.periodEnd)}
          </small>
        </article>
        <article>
          <span>Disponível acumulado</span>
          <strong>{formatCurrency(summary.accumulatedAvailable)}</strong>
        </article>
        <article>
          <span>Não utilizado acumulado</span>
          <strong>{formatCurrency(summary.accumulatedUnused)}</strong>
        </article>
        <article>
          <span>Uso acumulado</span>
          <strong>{percent(summary.accumulatedUtilization)}</strong>
        </article>
        <article>
          <span>Média mensal</span>
          <strong>{formatCurrency(summary.averageMonthlySpent)}</strong>
          <small>{summary.monthCount ?? months.length} competência(s)</small>
        </article>
        <article>
          <span>Maior mês</span>
          <strong>{formatCurrency(summary.maxMonthlySpent)}</strong>
          <small>{competenceLabel(summary.maxMonthlyCompetence)}</small>
        </article>
        <article>
          <span>Equipe no snapshot</span>
          <strong>
            {snapshotAssociated
              ? summary.currentSnapshotStaffCount ?? 0
              : "Não associada"}
          </strong>
          <small>{formatDate(officeBudget.currentSnapshot?.date)}</small>
        </article>
        <article>
          <span>Sinais técnicos</span>
          <strong>{summary.signalCount ?? signals.length}</strong>
          <small>{summary.signalTypeCount ?? 0} tipo(s)</small>
        </article>
      </div>

      <div className="office-budget-classification-grid">
        <article>
          <span>Faixa de utilização</span>
          <strong>{classificationLabel("utilization", classification.utilization)}</strong>
          <small>Classificação descritiva do percentual acumulado.</small>
        </article>
        <article>
          <span>Variação mensal</span>
          <strong>{classificationLabel("variation", classification.variation)}</strong>
          <small>Baseada na dispersão dos valores mensais.</small>
        </article>
        <article>
          <span>Tendência da série</span>
          <strong>{classificationLabel("trend", classification.trend)}</strong>
          <small>Compara a primeira e a última parte do período.</small>
        </article>
        <article>
          <span>Faixa da equipe</span>
          <strong>{classificationLabel("teamSize", classification.teamSize)}</strong>
          <small>Não representa avaliação de suficiência ou regularidade.</small>
        </article>
      </div>

      <p className="admin-warning office-budget-warning">
        Acumulados, faixas e variações são descritivos. Não comprovam excesso,
        ausência de trabalho, nomeação irregular ou qualquer outra irregularidade.
      </p>

      <nav className="office-budget-tabs" aria-label="Visões da verba de gabinete">
        {[
          ["overview", "Visão geral"],
          ["months", `Evolução mensal (${months.length})`],
          [
            "staff",
            `Equipe atual (${
              snapshotAssociated ? currentStaff.length : "não associada"
            })`
          ],
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
              <button
                type="button"
                className="text-button"
                onClick={() => setView("months")}
              >
                Ver evolução completa →
              </button>
            </div>
            <div className="office-budget-month-cards">
              {[...allMonthRows]
                .reverse()
                .slice(0, 6)
                .map((month) => (
                  <article key={month.competence}>
                    <span>{competenceLabel(month.competence)}</span>
                    <strong>{formatCurrency(month.spent)}</strong>
                    <small>
                      Disponível: {formatCurrency(month.available)} · uso{" "}
                      {percent(month.useRate)}
                    </small>
                    {month.change !== null ? (
                      <b
                        className={
                          month.change >= 0 ? "positive" : "negative"
                        }
                      >
                        {formatSignedCurrency(month.change)} ·{" "}
                        {percent(month.changePercent ?? 0)}
                      </b>
                    ) : null}
                  </article>
                ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h3>Equipe funcional atual</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => setView("staff")}
              >
                Ver equipe →
              </button>
            </div>

            {snapshotCollected && snapshotAssociated ? (
              <div className="office-budget-snapshot-summary">
                <strong>
                  {officeBudget.currentSnapshot?.staffCount ?? 0} integrante(s)
                  associado(s)
                </strong>
                <p>
                  Snapshot de {formatDate(officeBudget.currentSnapshot?.date)}
                  {officeBudget.profile?.officeNumber
                    ? ` · Gabinete ${officeBudget.profile.officeNumber}`
                    : ""}
                  .
                </p>
                {latestMovement ? (
                  <small>
                    Desde o snapshot anterior: +{latestMovement.addedCount ?? 0} /
                    -{latestMovement.removedCount ?? 0}.
                  </small>
                ) : (
                  <small>
                    O histórico de entradas e saídas será formado pelos próximos
                    snapshots diários.
                  </small>
                )}
              </div>
            ) : snapshotCollected ? (
              <div className="empty-state office-budget-unmapped">
                <h3>Snapshot coletado, mas equipe ainda não associada</h3>
                <p>
                  Isso não significa equipe vazia. O sistema não encontrou uma
                  correspondência segura entre a lotação da fonte e este gabinete.
                </p>
              </div>
            ) : (
              <div className="empty-state">
                <h3>Snapshot funcional indisponível</h3>
                <p>Execute o modo snapshot para registrar a equipe atual.</p>
              </div>
            )}
          </section>

          <section>
            <div className="panel-heading">
              <h3>Sinais do módulo</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => setView("signals")}
              >
                Ver todos →
              </button>
            </div>
            <div className="office-budget-signal-cards">
              {signals.slice(0, 6).map((signal) => (
                <article key={signal.id}>
                  <b className={`severity severity-${signal.severity}`}>
                    {signal.severity}
                  </b>
                  <span>{signalTypeLabel(signal.type)}</span>
                  <strong>{competenceLabel(signal.competence)}</strong>
                  <p>{signal.detail}</p>
                </article>
              ))}
              {!signals.length ? (
                <div className="empty-state">
                  <h3>Nenhum sinal técnico nesta série</h3>
                  <p>
                    A ausência de sinal indica apenas que as regras atuais não
                    foram acionadas.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {view === "months" ? (
        <div>
          <div className="office-budget-filter-bar office-budget-multi-filter">
            <label>
              Faixa de uso
              <select value={monthUse} onChange={(event) => setMonthUse(event.target.value)}>
                <option value="">Todas</option>
                <option value="95">95% ou mais</option>
                <option value="85">85% a 94,9%</option>
                <option value="below85">Abaixo de 85%</option>
              </select>
            </label>
            <label>
              Variação
              <select
                value={monthVariation}
                onChange={(event) => setMonthVariation(event.target.value)}
              >
                <option value="">Todas</option>
                <option value="up">Aumento</option>
                <option value="down">Redução</option>
                <option value="stable">Estável (±1%)</option>
              </select>
            </label>
            <label>
              Ordenar
              <select value={monthSort} onChange={(event) => setMonthSort(event.target.value)}>
                <option value="recent">Mais recente</option>
                <option value="oldest">Mais antiga</option>
                <option value="spent">Maior gasto</option>
                <option value="use">Maior uso</option>
                <option value="change">Maior variação</option>
              </select>
            </label>
            <span>{monthRows.length} competência(s)</span>
          </div>

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
                    <td>
                      <strong>{competenceLabel(month.competence)}</strong>
                    </td>
                    <td>{formatCurrency(month.available)}</td>
                    <td>{formatCurrency(month.spent)}</td>
                    <td>{percent(month.useRate)}</td>
                    <td>
                      {month.change === null ? (
                        "—"
                      ) : (
                        <>
                          {formatSignedCurrency(month.change)}
                          <small>{percent(month.changePercent ?? 0)}</small>
                        </>
                      )}
                    </td>
                    <td>
                      {month.sourceUrl ? (
                        <a
                          href={month.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir página oficial ↗
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
        </div>
      ) : null}

      {view === "staff" ? (
        <div>
          <div className="office-budget-filter-bar office-budget-staff-filters">
            <label className="office-budget-search-field">
              Buscar integrante
              <input
                type="search"
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder="Nome, ponto, cargo, função ou lotação"
              />
            </label>
            <label>
              Local
              <select
                value={staffLocation}
                onChange={(event) => setStaffLocation(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="Brasília">Brasília</option>
                <option value="Estado/outro">Estado/outro</option>
                <option value="não informada">Não informada</option>
              </select>
            </label>
            <label>
              Cargo/função
              <select value={staffRole} onChange={(event) => setStaffRole(event.target.value)}>
                <option value="">Todos</option>
                {staffRoles.map((role) => (
                  <option key={String(role)} value={String(role)}>
                    {String(role)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ano de nomeação
              <select value={staffYear} onChange={(event) => setStaffYear(event.target.value)}>
                <option value="">Todos</option>
                {staffYears.map((year) => (
                  <option key={String(year)} value={String(year)}>
                    {String(year)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordenar
              <select value={staffSort} onChange={(event) => setStaffSort(event.target.value)}>
                <option value="name">Nome A–Z</option>
                <option value="appointment">Nomeação mais recente</option>
                <option value="location">Local</option>
              </select>
            </label>
            <span>
              {snapshotAssociated
                ? `${filteredStaff.length} integrante(s)`
                : "Equipe não associada"}
            </span>
          </div>

          {snapshotAssociated ? (
            <>
              <div className="responsive-table">
                <table className="admin-table office-budget-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Ponto</th>
                      <th>Categoria/cargo/função</th>
                      <th>Nomeação informada</th>
                      <th>Local</th>
                      <th>Lotação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((employee) => (
                      <tr key={employee.key ?? employee.point ?? employee.name}>
                        <td>
                          <strong>{employee.name ?? "Não identificado"}</strong>
                          <small>
                            Associação: {employee.matchMethod ?? "fonte direta"}
                          </small>
                        </td>
                        <td>{employee.point || "—"}</td>
                        <td>
                          {employee.function ||
                            employee.cargo ||
                            employee.category ||
                            "—"}
                        </td>
                        <td>{formatDate(employee.appointmentDate)}</td>
                        <td>{locationClass(employee.lotation)}</td>
                        <td>{employee.lotation || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {movements.length ? (
                <div className="office-budget-movement-list">
                  <h3>Movimentos observados entre snapshots</h3>
                  {[...movements].reverse().slice(0, 12).map((movement) => (
                    <article key={movement.id}>
                      <strong>
                        {formatDate(movement.fromDate)} →{" "}
                        {formatDate(movement.toDate)}
                      </strong>
                      <span>
                        +{movement.addedCount ?? 0} entrada(s) · -
                        {movement.removedCount ?? 0} saída(s) · saldo{" "}
                        {Number(movement.netChange ?? 0) >= 0 ? "+" : ""}
                        {movement.netChange ?? 0}
                      </span>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state office-budget-unmapped">
              <h3>O snapshot existe, mas não foi associado com segurança</h3>
              <p>
                Confira a aba Fontes. O total “0” não é exibido como equipe vazia
                enquanto a correspondência da lotação não estiver confirmada.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {view === "signals" ? (
        <div>
          <div className="office-budget-filter-bar office-budget-signal-filter">
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
              Tipo
              <select
                value={signalType}
                onChange={(event) => setSignalType(event.target.value)}
              >
                <option value="">Todos</option>
                {signalTypes.map((type) => (
                  <option key={type} value={type}>
                    {signalTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <span>{filteredSignals.length} sinal(is)</span>
          </div>
          <div className="office-budget-signal-list">
            {filteredSignals.map((signal) => (
              <article key={signal.id}>
                <div>
                  <b className={`severity severity-${signal.severity}`}>
                    {signal.severity}
                  </b>
                  <span>{signalTypeLabel(signal.type)}</span>
                </div>
                <strong>{competenceLabel(signal.competence)}</strong>
                <p>{signal.detail}</p>
                <small>
                  O sinal registra uma variação da fonte e não comprova
                  irregularidade.
                </small>
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
                <span>
                  {document.type === "snapshot-funcionarios"
                    ? "Snapshot funcional"
                    : "Página mensal consolidada"}
                </span>
                <strong>{document.competence ?? "—"}</strong>
                <p>{document.description}</p>
                <small>
                  {document.acceptedRows ?? 0} competência(s) ou registro(s)
                  relacionados
                </small>
              </div>
              {document.sourceUrl ? (
                <a
                  className="button button-secondary"
                  href={document.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir fonte ↗
                </a>
              ) : null}
            </article>
          ))}

          <div className="office-budget-quality-grid">
            <article>
              <span>Linhas no snapshot</span>
              <strong>{officeBudget.dataQuality?.snapshotTotalRows ?? 0}</strong>
            </article>
            <article>
              <span>Secretários detectados</span>
              <strong>
                {officeBudget.dataQuality?.snapshotSecretaryRows ?? 0}
              </strong>
            </article>
            <article>
              <span>Linhas associadas</span>
              <strong>{officeBudget.dataQuality?.snapshotMappedRows ?? 0}</strong>
            </article>
            <article>
              <span>Não associadas</span>
              <strong>{officeBudget.dataQuality?.unmappedRowCount ?? 0}</strong>
            </article>
          </div>

          <div className="office-budget-method-note">
            <h3>Limites da fonte</h3>
            <p>{officeBudget.dataQuality?.salaryBasis}</p>
            <p>{officeBudget.dataQuality?.snapshotCaveat}</p>
            {officeBudget.dataQuality?.missingCompetences?.length ? (
              <p>
                Intervalos sem competência localizada:{" "}
                {officeBudget.dataQuality.missingCompetences.join(", ")}.
              </p>
            ) : null}
            <p>{officeBudget.disclaimer}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
