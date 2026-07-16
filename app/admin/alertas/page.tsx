import { getAlerts } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getAlerts();
  return <section className="page-section admin-page"><div className="container"><div className="page-header"><p className="eyebrow">FILA PRIVADA</p><h1>Alertas para revisão</h1><p>Nenhum item desta página deve ser tratado como acusação ou publicado sem apuração humana.</p></div><div className="admin-panel table-wrap"><table className="admin-table"><thead><tr><th>Alerta</th><th>Envolvidos</th><th>Valor</th><th>Severidade</th><th>Detectado</th><th>Status</th></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.id}><td><strong>{alert.title}</strong><small>{alert.rule}</small></td><td>{alert.deputyName ?? "—"}<small>{alert.supplierName ?? ""}</small></td><td>{formatCurrency(alert.amount)}</td><td><b className={`severity severity-${alert.severity}`}>{alert.severity}</b></td><td>{formatDate(alert.detectedAt)}</td><td>{alert.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></div></section>;
}
