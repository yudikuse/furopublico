import Link from "next/link";
import { getAlerts, getPublishedInvestigations } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [investigations, alerts] = await Promise.all([getPublishedInvestigations(), getAlerts()]);
  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="admin-header"><div><p className="eyebrow">REDAÇÃO</p><h1>Painel investigativo</h1><p>Alertas são privados até passarem por documentação, contexto e contraditório.</p></div><Link className="button button-primary" href="/admin/investigacoes/nova">Nova investigação</Link></div>
        <div className="admin-metrics">
          <article><span>Investigações visíveis</span><strong>{investigations.length}</strong></article>
          <article><span>Alertas na fila</span><strong>{alerts.filter((item) => item.status !== "descartado").length}</strong></article>
          <article><span>Maior alerta</span><strong>{formatCurrency(Math.max(...alerts.map((item) => item.amount ?? 0), 0))}</strong></article>
        </div>
        <div className="admin-grid">
          <section className="admin-panel"><div className="panel-heading"><h2>Alertas recentes</h2><Link href="/admin/alertas">Abrir fila →</Link></div>{alerts.slice(0, 5).map((alert) => <article className="alert-row" key={alert.id}><div><strong>{alert.title}</strong><span>{alert.rule}</span></div><div><b className={`severity severity-${alert.severity}`}>{alert.severity}</b><time>{formatDate(alert.detectedAt)}</time></div></article>)}</section>
          <section className="admin-panel"><div className="panel-heading"><h2>Checklist antes de publicar</h2></div><ol className="checklist"><li>Fonte original preservada</li><li>Dados e cálculos reproduzidos</li><li>Contexto e hipóteses legítimas avaliados</li><li>Texto jurídico proporcional à evidência</li><li>Citado procurado para resposta</li><li>Revisão final por outra pessoa</li></ol></section>
        </div>
      </div>
    </section>
  );
}
