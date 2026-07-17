import Link from "next/link";
import { getAlerts, getAllInvestigations } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [investigations, alerts] = await Promise.all([
    getAllInvestigations(),
    getAlerts()
  ]);

  const pendingAlerts = alerts.filter((item) =>
    ["novo", "em_revisao"].includes(item.status)
  );
  const enrichedAlerts = alerts.filter((item) => Boolean(item.enrichment));
  const highPriority = pendingAlerts.filter(
    (item) =>
      item.severity === "alta" ||
      item.enrichment?.flags.some((flag) => flag.level === "prioridade")
  );

  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="admin-header">
          <div>
            <p className="eyebrow">REDAÇÃO</p>
            <h1>Painel investigativo</h1>
            <p>
              Alertas são privados até passarem por documentação, contexto e
              contraditório.
            </p>
          </div>
          <Link className="button button-primary" href="/admin/investigacoes/nova">
            Nova investigação
          </Link>
        </div>

        <div className="admin-metrics admin-metrics-four">
          <article>
            <span>Investigações internas</span>
            <strong>{investigations.length}</strong>
          </article>
          <article>
            <span>Alertas pendentes</span>
            <strong>{pendingAlerts.length}</strong>
          </article>
          <article>
            <span>Dossiês gerados</span>
            <strong>{enrichedAlerts.length}</strong>
          </article>
          <article>
            <span>Alta prioridade</span>
            <strong>{highPriority.length}</strong>
          </article>
        </div>

        <div className="admin-grid">
          <section className="admin-panel">
            <div className="panel-heading">
              <h2>Alertas para apuração</h2>
              <Link href="/admin/alertas">Abrir fila →</Link>
            </div>

            {pendingAlerts.slice(0, 6).map((alert) => (
              <Link
                className="alert-row alert-row-link"
                key={alert.id}
                href={`/admin/alertas/${alert.id}`}
              >
                <div>
                  <strong>{alert.title}</strong>
                  <span>
                    {alert.deputyName ?? "Parlamentar não identificado"}
                    {alert.supplierName ? ` — ${alert.supplierName}` : ""}
                  </span>
                </div>
                <div>
                  <b className={`severity severity-${alert.severity}`}>
                    {alert.severity}
                  </b>
                  {alert.enrichment ? <em>Dossiê pronto</em> : null}
                  <time>{formatDate(alert.detectedAt)}</time>
                </div>
              </Link>
            ))}
          </section>

          <section className="admin-panel">
            <div className="panel-heading">
              <h2>Leitura do sistema</h2>
            </div>
            <ol className="checklist">
              <li>O alerta apenas indica onde olhar.</li>
              <li>O dossiê soma o histórico e cruza o CNPJ.</li>
              <li>O documento original define o que foi pago.</li>
              <li>Mercado, vínculos e beneficiário final exigem apuração.</li>
              <li>O citado deve ser procurado antes da publicação.</li>
              <li>Nenhuma pista automática é tratada como acusação.</li>
            </ol>
            <p className="dashboard-total">
              Maior valor pendente: {formatCurrency(Math.max(...pendingAlerts.map((item) => item.amount ?? 0), 0))}
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
