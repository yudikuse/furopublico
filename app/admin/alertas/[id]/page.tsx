import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAlertForm } from "@/components/admin-alert-form";
import { AdminEnrichmentPanel } from "@/components/admin-enrichment-panel";
import { AdminEntityNetwork } from "@/components/admin-entity-network";
import { getAlertById } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function collectDocumentLinks(evidence: Record<string, unknown>) {
  const urls = new Set<string>();

  function walk(value: unknown) {
    if (!value) return;
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  }

  const evidenceWithoutGeneratedData = { ...evidence };
  delete evidenceWithoutGeneratedData.enrichment;
  delete evidenceWithoutGeneratedData.entityNetwork;
  walk(evidenceWithoutGeneratedData);
  return [...urls];
}

export default async function AlertDetailPage({ params }: PageProps) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) notFound();

  const links = collectDocumentLinks(alert.evidence);

  return (
    <section className="page-section admin-page">
      <div className="container">
        <Link className="text-link" href="/admin/alertas">
          ← Voltar para a fila
        </Link>

        <div className="admin-alert-hero">
          <div>
            <p className="eyebrow">APURAÇÃO PRIVADA</p>
            <h1>{alert.title}</h1>
            <p>{alert.rule}</p>
          </div>
          <b className={`severity severity-${alert.severity}`}>
            {alert.severity}
          </b>
        </div>

        <div className="admin-alert-metrics">
          <article>
            <span>Parlamentar</span>
            <strong>{alert.deputyName ?? "Não identificado"}</strong>
          </article>
          <article>
            <span>Fornecedor</span>
            <strong>{alert.supplierName ?? "Não identificado"}</strong>
          </article>
          <article>
            <span>Valor observado</span>
            <strong>{formatCurrency(alert.amount)}</strong>
          </article>
          <article>
            <span>Detectado</span>
            <strong>{formatDate(alert.detectedAt)}</strong>
          </article>
        </div>

        {alert.enrichment ? (
          <AdminEnrichmentPanel enrichment={alert.enrichment} />
        ) : (
          <div className="admin-panel enrichment-empty">
            <p className="eyebrow">PRÓXIMO PASSO</p>
            <h2>Transforme o alerta em dossiê</h2>
            <p>
              Use o botão <strong>Gerar dossiê automático</strong> para
              buscar o histórico do fornecedor, somar pagamentos,
              comparar a categoria e consultar o cadastro empresarial.
            </p>
          </div>
        )}

        <AdminEntityNetwork
          alertId={alert.id}
          network={alert.entityNetwork}
          defaultSourceUrl={links[0]}
        />

        <div className="admin-alert-layout">
          <div className="admin-panel">
            <div className="panel-heading">
              <h2>Documento e evidência original</h2>
            </div>

            <p className="admin-warning">
              O alerta estatístico não comprova irregularidade. Confirme o
              período, a natureza da despesa, possíveis estornos,
              justificativas e o conteúdo dos documentos originais.
            </p>

            {links.length ? (
              <div className="document-links">
                <h3>Links encontrados nos registros</h3>
                {links.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir documento ou fonte ↗
                    <small>{url}</small>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted">
                Nenhum endereço eletrônico foi encontrado
                automaticamente.
              </p>
            )}

            <details className="evidence-json">
              <summary>Ver todos os dados brutos</summary>
              <pre>
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(alert.evidence).filter(
                      ([key]) =>
                        key !== "enrichment" &&
                        key !== "entityNetwork"
                    )
                  ),
                  null,
                  2
                )}
              </pre>
            </details>
          </div>

          <div>
            <AdminAlertForm alert={alert} />

            {alert.investigationId ? (
              <div className="admin-panel linked-investigation">
                <h2>Investigação criada</h2>
                <p>
                  Este alerta já foi convertido e está relacionado ao
                  registro:
                </p>
                <code>{alert.investigationId}</code>
                <Link
                  className="button button-primary"
                  href={`/admin/investigacoes/${alert.investigationId}`}
                >
                  Continuar na investigação
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
