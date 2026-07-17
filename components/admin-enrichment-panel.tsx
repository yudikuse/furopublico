import type { AlertEnrichment } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = {
  enrichment: AlertEnrichment;
};

function percent(value?: number) {
  if (value === undefined) return "Não calculado";
  return `${(value * 100).toFixed(1)}%`;
}

export function AdminEnrichmentPanel({ enrichment }: Props) {
  const { history, company } = enrichment;

  return (
    <section className="admin-enrichment">
      <div className="panel-heading enrichment-heading">
        <div>
          <p className="eyebrow">DOSSIÊ AUTOMÁTICO</p>
          <h2>Cruzamentos da 57ª Legislatura</h2>
        </div>
        <span>Atualizado em {formatDate(enrichment.generatedAt)}</span>
      </div>

      <p className="admin-warning">{enrichment.disclaimer}</p>

      <div className="enrichment-metrics">
        <article>
          <span>Total ao fornecedor</span>
          <strong>{formatCurrency(history.sameSupplierTotal)}</strong>
          <small>{history.sameSupplierCount} documento(s)</small>
        </article>
        <article>
          <span>Participação na categoria</span>
          <strong>{percent(history.supplierShare)}</strong>
          <small>Total da categoria: {formatCurrency(history.categoryTotal)}</small>
        </article>
        <article>
          <span>Maior pagamento</span>
          <strong>{formatCurrency(history.largestPayment)}</strong>
          <small>Média: {formatCurrency(history.averagePayment)}</small>
        </article>
        <article>
          <span>Valor recorrente</span>
          <strong>
            {history.recurringAmount
              ? formatCurrency(history.recurringAmount)
              : "Não identificado"}
          </strong>
          <small>{history.recurringCount} ocorrência(s)</small>
        </article>
      </div>

      {enrichment.flags.length ? (
        <div className="enrichment-flags">
          <h3>Sinais para priorização</h3>
          {enrichment.flags.map((flag) => (
            <article key={`${flag.title}-${flag.detail}`} className={`flag flag-${flag.level}`}>
              <strong>{flag.title}</strong>
              <p>{flag.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="enrichment-grid">
        <section>
          <h3>Histórico do fornecedor</h3>
          <dl className="enrichment-definition-list">
            <div>
              <dt>Primeiro pagamento localizado</dt>
              <dd>{formatDate(history.firstPaymentDate)}</dd>
            </div>
            <div>
              <dt>Último pagamento localizado</dt>
              <dd>{formatDate(history.lastPaymentDate)}</dd>
            </div>
            <div>
              <dt>Despesas do parlamentar analisadas</dt>
              <dd>{history.allExpensesCount}</dd>
            </div>
            <div>
              <dt>Possíveis duplicidades</dt>
              <dd>{history.duplicateCandidates.length}</dd>
            </div>
          </dl>

          {history.annualTotals.length ? (
            <div className="enrichment-table-wrap">
              <h4>Pagamentos por ano</h4>
              <table className="enrichment-table">
                <thead>
                  <tr>
                    <th>Ano</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {history.annualTotals.map((item) => (
                    <tr key={item.label}>
                      <td>{item.label}</td>
                      <td>{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section>
          <h3>Cadastro da empresa</h3>
          {company ? (
            <>
              <dl className="enrichment-definition-list">
                <div>
                  <dt>Razão social</dt>
                  <dd>{company.legalName ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt>Nome fantasia</dt>
                  <dd>{company.tradeName ?? "Não informado"}</dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>{company.status ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt>Abertura</dt>
                  <dd>{formatDate(company.openingDate)}</dd>
                </div>
                <div>
                  <dt>Atividade principal</dt>
                  <dd>{company.mainActivity ?? "Não informada"}</dd>
                </div>
                <div>
                  <dt>Endereço cadastral</dt>
                  <dd>
                    {[company.address, company.municipality, company.state]
                      .filter(Boolean)
                      .join(" — ") || "Não informado"}
                  </dd>
                </div>
              </dl>

              {company.partners.length ? (
                <div className="partners-list">
                  <h4>Sócios e administradores retornados</h4>
                  {company.partners.map((partner) => (
                    <p key={`${partner.name}-${partner.qualification ?? ""}`}>
                      <strong>{partner.name}</strong>
                      <span>{partner.qualification ?? "Qualificação não informada"}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted">
              A coleta inicial não retornou cadastro empresarial. Consulte a
              Rede de Entidades abaixo, que usa fontes cadastrais alternativas
              e deve prevalecer quando houver resultado documentado.
            </p>
          )}
        </section>
      </div>

      {history.topSuppliers.length ? (
        <div className="enrichment-table-wrap top-suppliers">
          <h3>Maiores fornecedores da mesma categoria</h3>
          <table className="enrichment-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Documentos</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {history.topSuppliers.map((supplier) => (
                <tr key={`${supplier.taxId}-${supplier.name}`}>
                  <td>
                    {supplier.name}
                    <small>{supplier.taxId || "CNPJ/CPF não informado"}</small>
                  </td>
                  <td>{supplier.count}</td>
                  <td>{formatCurrency(supplier.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {history.documents.length ? (
        <details className="enrichment-documents">
          <summary>Ver histórico de documentos do fornecedor</summary>
          <div className="enrichment-table-wrap">
            <table className="enrichment-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {history.documents.map((document, index) => (
                  <tr key={`${document.documentCode}-${document.documentNumber}-${index}`}>
                    <td>{formatDate(document.date)}</td>
                    <td>
                      {document.url ? (
                        <a href={document.url} target="_blank" rel="noreferrer">
                          {document.documentNumber || document.documentCode || "Abrir"} ↗
                        </a>
                      ) : (
                        document.documentNumber || document.documentCode || "—"
                      )}
                    </td>
                    <td>{document.category}</td>
                    <td>{formatCurrency(document.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <div className="investigation-questions">
        <h3>Perguntas que a apuração deve responder</h3>
        <ol>
          {enrichment.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ol>
      </div>

      {enrichment.sourceStatus.errors.length ? (
        <details className="enrichment-errors">
          <summary>Fontes incompletas ou erros de coleta</summary>
          <ul>
            {enrichment.sourceStatus.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
