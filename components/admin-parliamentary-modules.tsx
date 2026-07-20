"use client";

import { useMemo, useState } from "react";
import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { AdminParliamentaryCaseV5 } from "@/components/admin-parliamentary-case-v5";
import { AdminOfficeBudget } from "@/components/admin-office-budget";

type Props = {
  alert: InvestigationAlert;
};

type ModuleView = "overview" | "ceap" | "office" | "amendments";

type OfficeBudgetSummary = {
  latestCompetence?: string | null;
  latestTotalPublished?: number;
  latestStaffCount?: number;
  signalCount?: number;
  signalTypeCount?: number;
  priority?: "baixa" | "media" | "alta";
};

function competenceLabel(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return "Sem competência";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function AdminParliamentaryModules({ alert }: Props) {
  const evidence = alert.evidence as Record<string, unknown>;
  const officeBudget = evidence.officeBudget as
    | { summary?: OfficeBudgetSummary }
    | undefined;
  const ceapDocuments = Array.isArray(evidence.documents)
    ? evidence.documents.length
    : 0;
  const ceapSignals = Number(
    evidence.signalCount ?? evidence.occurrenceCount ?? 0
  );
  const ceapRules = Number(evidence.ruleCount ?? 0);
  const ceapAmount = Number(evidence.financialAmount ?? alert.amount ?? 0);
  const hasCeap = ceapDocuments > 0 || ceapSignals > 0;
  const hasOffice = Boolean(officeBudget);
  const [view, setView] = useState<ModuleView>(
    hasCeap ? "overview" : hasOffice ? "office" : "overview"
  );

  const availableModules = useMemo(
    () => [
      hasCeap ? "CEAP" : null,
      hasOffice ? "Verba de gabinete" : null
    ].filter(Boolean),
    [hasCeap, hasOffice]
  );

  return (
    <div className="parliamentary-modules">
      <section className="admin-panel parliamentary-module-selector">
        <div>
          <p className="eyebrow">CASO PARLAMENTAR · MÓDULOS</p>
          <h2>{availableModules.length} módulo(s) com dados</h2>
          <p>
            Cada módulo mantém seus documentos, valores e sinais separados. A
            investigação continua sendo uma decisão editorial do jornalista.
          </p>
        </div>

        <nav aria-label="Módulos do caso parlamentar">
          <button
            type="button"
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            Visão geral do caso
          </button>
          <button
            type="button"
            className={view === "ceap" ? "active" : ""}
            disabled={!hasCeap}
            onClick={() => setView("ceap")}
          >
            CEAP {hasCeap ? "" : "· sem dados"}
          </button>
          <button
            type="button"
            className={view === "office" ? "active" : ""}
            disabled={!hasOffice}
            onClick={() => setView("office")}
          >
            Verba de gabinete {hasOffice ? "" : "· sem dados"}
          </button>
          <button
            type="button"
            className={view === "amendments" ? "active" : ""}
            onClick={() => setView("amendments")}
          >
            Emendas · próximo módulo
          </button>
        </nav>
      </section>

      {view === "overview" ? (
        <section className="admin-panel parliamentary-module-overview">
          <div className="panel-heading">
            <h2>Visão geral por módulo</h2>
          </div>
          <div className="parliamentary-module-grid">
            <button
              type="button"
              disabled={!hasCeap}
              onClick={() => setView("ceap")}
            >
              <span>CEAP</span>
              <strong>{hasCeap ? formatCurrency(ceapAmount) : "Sem dados"}</strong>
              <small>
                {ceapSignals} sinal(is) · {ceapRules} tipo(s) · {ceapDocuments} documento(s)
              </small>
              <p>
                Notas fiscais, lançamentos, fornecedores e sinais de despesas do
                exercício parlamentar.
              </p>
            </button>

            <button
              type="button"
              disabled={!hasOffice}
              onClick={() => setView("office")}
            >
              <span>Verba de gabinete</span>
              <strong>
                {hasOffice
                  ? formatCurrency(officeBudget?.summary?.latestTotalPublished)
                  : "Sem dados"}
              </strong>
              <small>
                {officeBudget?.summary?.signalCount ?? 0} sinal(is) ·{" "}
                {officeBudget?.summary?.latestStaffCount ?? 0} integrante(s) ·{" "}
                {competenceLabel(officeBudget?.summary?.latestCompetence)}
              </small>
              <p>
                Remuneração publicada, integrantes, lotações, variações mensais e
                documentos de origem.
              </p>
            </button>

            <button type="button" onClick={() => setView("amendments")}>
              <span>Emendas parlamentares</span>
              <strong>Próximo módulo</strong>
              <small>Sem coleta implantada</small>
              <p>
                Emenda, favorecido, município, instrumento, contrato e empresa serão
                mantidos como entidades separadas.
              </p>
            </button>
          </div>
        </section>
      ) : null}

      {view === "ceap" ? (
        hasCeap ? (
          <AdminParliamentaryCaseV5 alert={alert} />
        ) : (
          <section className="admin-panel empty-state">
            <h2>Sem dados de CEAP neste caso</h2>
          </section>
        )
      ) : null}

      {view === "office" ? <AdminOfficeBudget alert={alert} /> : null}

      {view === "amendments" ? (
        <section className="admin-panel office-budget-empty">
          <p className="eyebrow">MÓDULO FUTURO</p>
          <h2>Emendas parlamentares</h2>
          <p>
            Este módulo será implantado depois da validação da verba de gabinete. Ele
            não reutilizará valores ou sinais da CEAP e da folha.
          </p>
        </section>
      ) : null}
    </div>
  );
}
