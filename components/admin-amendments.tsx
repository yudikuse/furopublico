"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  AmendmentModuleData,
  AmendmentModuleBeneficiary,
  AmendmentModuleDocument
} from "@/lib/types";

export type AdminAmendmentsProps = {
  data: AmendmentModuleData;
};

type View = "overview" | "beneficiaries" | "amendments" | "documents";
type BeneficiarySort = "amount" | "documents" | "name";

function currency(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function shortDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function roleLabel(role: AmendmentModuleBeneficiary["roles"][number]) {
  const labels = {
    favorecido_documento: "Favorecido do documento",
    intermediario_financeiro: "Intermediário financeiro",
    beneficiario_final: "Beneficiário final"
  };
  return labels[role];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Aguardando documentos",
    partial: "Coleta parcial",
    complete: "Documentos processados",
    error: "Erro na coleta"
  };
  return labels[status] ?? status;
}

function beneficiaryLocation(item: AmendmentModuleBeneficiary) {
  return [item.municipality, item.state].filter(Boolean).join("/") || "—";
}

function documentFinalBeneficiaries(document: AmendmentModuleDocument) {
  return document.beneficiaries.filter((item) => item.role === "beneficiario_final");
}

export function AdminAmendments({ data }: AdminAmendmentsProps) {
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [beneficiarySort, setBeneficiarySort] = useState<BeneficiarySort>("amount");
  const [phase, setPhase] = useState("all");

  const filteredBeneficiaries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const rows = data.beneficiaries.filter((item) => {
      if (!query) return true;
      return [item.name, item.taxId, item.municipality, item.state]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(query));
    });

    return rows.sort((a, b) => {
      if (beneficiarySort === "documents") {
        return b.documentCount - a.documentCount || b.totalRelated - a.totalRelated;
      }
      if (beneficiarySort === "name") {
        return a.name.localeCompare(b.name, "pt-BR");
      }
      return b.totalRelated - a.totalRelated || b.documentCount - a.documentCount;
    });
  }, [beneficiarySort, data.beneficiaries, search]);

  const phases = useMemo(
    () => [
      ...new Set(data.documents.map((item) => item.phase).filter((item): item is string => Boolean(item)))
    ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data.documents]
  );

  const filteredDocuments = useMemo(() => {
    if (phase === "all") return data.documents;
    return data.documents.filter((item) => item.phase === phase);
  }, [data.documents, phase]);

  if (!data.summary.amendmentCount) {
    return (
      <section className="admin-panel amendments-empty">
        <p className="eyebrow">EMENDAS PARLAMENTARES</p>
        <h2>Sem emendas importadas para este caso</h2>
        <p>
          O catálogo liga emendas apenas quando o nome do autor e o ano coincidem
          exatamente com o caso parlamentar. Rode primeiro o modo <code>catalog</code>
          do workflow de importação.
        </p>
      </section>
    );
  }

  return (
    <section className="admin-amendments">
      <div className="admin-panel amendments-header">
        <div>
          <p className="eyebrow">EMENDAS · FLUXO SEPARADO</p>
          <h2>Emendas e beneficiários relacionados</h2>
          <p>
            Empenho, liquidação e pagamento são fases diferentes. Intermediários
            financeiros permanecem separados dos beneficiários finais e não são
            somados como recebedores quando há destinatário final identificado.
          </p>
        </div>

        <nav className="amendments-tabs" aria-label="Visões do módulo de emendas">
          <button type="button" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
            Visão geral
          </button>
          <button type="button" className={view === "beneficiaries" ? "active" : ""} onClick={() => setView("beneficiaries")}>
            Quem recebeu ({data.summary.beneficiaryCount})
          </button>
          <button type="button" className={view === "amendments" ? "active" : ""} onClick={() => setView("amendments")}>
            Emendas ({data.summary.amendmentCount})
          </button>
          <button type="button" className={view === "documents" ? "active" : ""} onClick={() => setView("documents")}>
            Documentos ({data.summary.documentCount})
          </button>
        </nav>
      </div>

      {view === "overview" ? (
        <>
          <div className="amendments-summary-grid">
            <article className="admin-panel">
              <span>Empenhado</span>
              <strong>{currency(data.summary.committed)}</strong>
              <small>Reserva formal da despesa.</small>
            </article>
            <article className="admin-panel">
              <span>Liquidado</span>
              <strong>{currency(data.summary.liquidated)}</strong>
              <small>Despesa reconhecida após conferência.</small>
            </article>
            <article className="admin-panel">
              <span>Pago</span>
              <strong>{currency(data.summary.paid)}</strong>
              <small>Pagamento informado pela fonte.</small>
            </article>
            <article className="admin-panel">
              <span>Restos pagos</span>
              <strong>{currency(data.summary.restPaid)}</strong>
              <small>Pagamentos de exercícios anteriores.</small>
            </article>
          </div>

          <div className="amendments-overview-grid">
            <article className="admin-panel">
              <h3>Cobertura da coleta</h3>
              <dl className="amendments-metrics">
                <div><dt>Emendas relacionadas</dt><dd>{data.summary.amendmentCount}</dd></div>
                <div><dt>Documentos localizados</dt><dd>{data.summary.documentCount}</dd></div>
                <div><dt>Beneficiários distintos</dt><dd>{data.summary.beneficiaryCount}</dd></div>
                <div><dt>Documentos resolvidos</dt><dd>{data.summary.resolvedDocumentCount}</dd></div>
                <div><dt>Com intermediário financeiro</dt><dd>{data.summary.intermediaryDocumentCount}</dd></div>
              </dl>
            </article>

            <article className="admin-panel">
              <h3>Processamento</h3>
              <dl className="amendments-metrics">
                <div><dt>Concluídas</dt><dd>{data.summary.completeAmendmentCount}</dd></div>
                <div><dt>Parciais</dt><dd>{data.summary.partialAmendmentCount}</dd></div>
                <div><dt>Pendentes</dt><dd>{data.summary.pendingAmendmentCount}</dd></div>
                <div><dt>Com erro</dt><dd>{data.summary.errorAmendmentCount}</dd></div>
              </dl>
              <p className="admin-warning">
                “Parcial” significa que ainda existem documentos da emenda aguardando
                outro lote do workflow. Não significa ausência de execução financeira.
              </p>
            </article>
          </div>

          <div className="admin-panel amendments-top-beneficiaries">
            <div className="panel-heading">
              <h3>Maiores valores relacionados a beneficiários</h3>
              <button type="button" className="text-link" onClick={() => setView("beneficiaries")}>
                Abrir todos
              </button>
            </div>
            <div className="responsive-table">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Beneficiário</th>
                    <th>Papel documental</th>
                    <th>Local</th>
                    <th>Período</th>
                    <th>Valor relacionado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.beneficiaries.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><small>{item.taxId || "Sem CPF/CNPJ publicado"}</small></td>
                      <td>{item.roles.map(roleLabel).join(" · ")}</td>
                      <td>{beneficiaryLocation(item)}</td>
                      <td>{shortDate(item.firstDate)} → {shortDate(item.lastDate)}</td>
                      <td><strong>{currency(item.totalRelated)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {view === "beneficiaries" ? (
        <div className="admin-panel">
          <div className="amendments-filters">
            <label>
              Buscar beneficiário
              <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Nome, CPF/CNPJ ou município" />
            </label>
            <label>
              Ordenar
              <select value={beneficiarySort} onChange={(event: ChangeEvent<HTMLSelectElement>) => setBeneficiarySort(event.target.value as BeneficiarySort)}>
                <option value="amount">Maior valor relacionado</option>
                <option value="documents">Mais documentos</option>
                <option value="name">Nome</option>
              </select>
            </label>
          </div>

          <p className="admin-warning">
            O valor relacionado usa o beneficiário final quando ele existe. O valor do
            intermediário financeiro fica excluído da soma para evitar duplicidade.
          </p>

          <div className="responsive-table">
            <table className="admin-table amendments-beneficiary-table">
              <thead>
                <tr>
                  <th>Beneficiário</th>
                  <th>Papel</th>
                  <th>Local</th>
                  <th>Período localizado</th>
                  <th>Emendas</th>
                  <th>Documentos</th>
                  <th>Valor relacionado</th>
                </tr>
              </thead>
              <tbody>
                {filteredBeneficiaries.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.taxId || item.type || "Identificador não publicado"}</small>
                    </td>
                    <td>
                      {item.roles.map((role) => (
                        <span key={role} className={`amendment-role amendment-role-${role}`}>
                          {roleLabel(role)}
                        </span>
                      ))}
                    </td>
                    <td>{beneficiaryLocation(item)}</td>
                    <td>{shortDate(item.firstDate)} → {shortDate(item.lastDate)}</td>
                    <td>{item.amendmentCount}</td>
                    <td>{item.documentCount}</td>
                    <td>
                      <strong>{currency(item.totalRelated)}</strong>
                      {item.excludedIntermediaryAmount > 0 ? (
                        <small>{currency(item.excludedIntermediaryAmount)} como intermediário, fora da soma</small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "amendments" ? (
        <div className="admin-panel">
          <div className="responsive-table">
            <table className="admin-table amendments-list-table">
              <thead>
                <tr>
                  <th>Emenda</th>
                  <th>Tipo e destino</th>
                  <th>Empenhado</th>
                  <th>Liquidado</th>
                  <th>Pago</th>
                  <th>Documentos</th>
                  <th>Processamento</th>
                </tr>
              </thead>
              <tbody>
                {data.amendments.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.code}</strong><small>{item.year} · nº {item.number || "—"}</small></td>
                    <td><strong>{item.type || "Tipo não informado"}</strong><small>{item.localities.join(" · ") || "Localidade não informada"}</small></td>
                    <td>{currency(item.committed)}</td>
                    <td>{currency(item.liquidated)}</td>
                    <td><strong>{currency(item.paid)}</strong></td>
                    <td>{item.documentCount}</td>
                    <td>
                      <span className={`amendment-status amendment-status-${item.processingStatus}`}>
                        {statusLabel(item.processingStatus)}
                      </span>
                      {item.lastError ? <small>{item.lastError}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "documents" ? (
        <div className="admin-panel">
          <div className="amendments-filters amendments-document-filters">
            <label>
              Fase
              <select value={phase} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPhase(event.target.value)}>
                <option value="all">Todas</option>
                {phases.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="responsive-table">
            <table className="admin-table amendments-document-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Fase/data</th>
                  <th>Emenda</th>
                  <th>Favorecido do documento</th>
                  <th>Beneficiário final</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((item) => {
                  const finals = documentFinalBeneficiaries(item);
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.summarizedCode || item.code}</strong><small>{item.code}</small></td>
                      <td><strong>{item.phase || "—"}</strong><small>{shortDate(item.date)}</small></td>
                      <td>{item.amendmentCodes.join(" · ") || "—"}</td>
                      <td>
                        <strong>{item.formalBeneficiaryName || "Não informado"}</strong>
                        <small>{item.formalBeneficiaryTaxId || ""}</small>
                        {item.formalBeneficiaryIsIntermediary ? <span className="amendment-role amendment-role-intermediario_financeiro">Intermediário</span> : null}
                      </td>
                      <td>
                        {finals.length ? finals.map((beneficiary) => (
                          <div key={`${item.id}-${beneficiary.id}`} className="amendment-final-beneficiary">
                            <strong>{beneficiary.name}</strong>
                            <small>{beneficiary.taxId || ""} {beneficiary.amount !== undefined ? `· ${currency(beneficiary.amount)}` : ""}</small>
                          </div>
                        )) : <span>Não localizado nesta consulta</span>}
                      </td>
                      <td><strong>{currency(item.amount)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
