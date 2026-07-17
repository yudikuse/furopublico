import Link from "next/link";
import { getAllInvestigations } from "@/lib/data";
import {
  categoryLabel,
  formatCurrency,
  formatDate,
  statusLabel
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InternalInvestigationsPage() {
  const investigations = await getAllInvestigations();

  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="admin-header">
          <div>
            <p className="eyebrow">REDAÇÃO</p>
            <h1>Investigações internas</h1>
            <p>
              Casos em triagem, apuração, contraditório ou revisão
              editorial.
            </p>
          </div>

          <div className="admin-header-actions">
            <Link className="button button-dark" href="/admin">
              Voltar ao painel
            </Link>
            <Link
              className="button button-primary"
              href="/admin/investigacoes/nova"
            >
              Nova investigação
            </Link>
          </div>
        </div>

        <div className="admin-panel table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Investigação</th>
                <th>Status</th>
                <th>Evidência</th>
                <th>Fontes</th>
                <th>Valor</th>
                <th>Atualizada</th>
              </tr>
            </thead>

            <tbody>
              {investigations.map((investigation) => (
                <tr key={investigation.id}>
                  <td>
                    <strong>
                      <Link
                        className="admin-alert-link"
                        href={`/admin/investigacoes/${investigation.id}`}
                      >
                        {investigation.title}
                      </Link>
                    </strong>
                    <small>
                      {categoryLabel(investigation.category)} ·{" "}
                      {investigation.entities.length} entidade(s)
                    </small>
                  </td>
                  <td>{statusLabel(investigation.status)}</td>
                  <td>{investigation.confidence}</td>
                  <td>{investigation.sources.length}</td>
                  <td>
                    {formatCurrency(investigation.involvedAmount)}
                  </td>
                  <td>{formatDate(investigation.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!investigations.length ? (
            <div className="empty-state">
              <h2>Nenhuma investigação interna</h2>
              <p>
                Converta um alerta ou crie uma investigação manual.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
