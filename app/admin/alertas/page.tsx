import Link from "next/link";
import { getAlerts } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="page-header">
          <p className="eyebrow">FILA PRIVADA</p>
          <h1>Alertas para revisão</h1>
          <p>
            O alerta é somente uma pista. Gere o dossiê, leia o documento,
            teste explicações legítimas e registre a apuração.
          </p>
        </div>

        <div className="admin-panel table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Alerta</th>
                <th>Envolvidos</th>
                <th>Valor</th>
                <th>Severidade</th>
                <th>Dossiê</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <strong>
                      <Link
                        className="admin-alert-link"
                        href={`/admin/alertas/${alert.id}`}
                      >
                        {alert.title}
                      </Link>
                    </strong>
                    <small>{alert.rule}</small>
                  </td>
                  <td>
                    {alert.deputyName ?? "—"}
                    <small>{alert.supplierName ?? ""}</small>
                  </td>
                  <td>{formatCurrency(alert.amount)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
