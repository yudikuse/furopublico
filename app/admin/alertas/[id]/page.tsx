import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAlertForm } from "@/components/admin-alert-form";
import { AdminParliamentaryCaseV5 } from "@/components/admin-parliamentary-case-v5";
import { AdminEnrichmentPanel } from "@/components/admin-enrichment-panel";
import { AdminEntityNetwork } from "@/components/admin-entity-network";
import { getAlertById } from "@/lib/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function collectDocumentLinks(evidence: Record<string, unknown>) {
  const urls = new Set<string>();
  const documents = Array.isArray(evidence.documents)
    ? evidence.documents
    : [];

  for (const value of documents) {
    if (!value || typeof value !== "object") continue;
    const document = value as Record<string, unknown>;
    const direct = String(document.documentUrl ?? "").trim();

    if (/^https?:\/\//i.test(direct)) urls.add(direct);

    const records = Array.isArray(document.records)
      ? document.records
      : [];

    for (const recordValue of records) {
      if (!recordValue || typeof recordValue !== "object") continue;
      const record = recordValue as Record<string, unknown>;
      const candidate = String(
        record.urlDocumento ??
          record.urlDocument ??
          record.documentUrl ??
          record.url ??
          ""
      ).trim();

      if (/^https?:\/\//i.test(candidate)) urls.add(candidate);
    }
  }

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

        <div className="admin-alert-hero parliamentary-hero">
          <div>
            <p className="eyebrow">APURAÇÃO PRIVADA · PARLAMENTAR</p>
            <h1>{alert.deputyName ?? alert.title}</h1>
            <p>
              Visão consolidada dos sinais técnicos encontrados nas
              despesas da CEAP. Documentos oficiais e lançamentos financeiros
              permanecem separados para conferência.
            </p>
          </div>
          <b className={`severity severity-${alert.severity}`}>
            {alert.severity}
          </b>
        </div>

        <AdminParliamentaryCaseV5 alert={alert} />

        {alert.enrichment ? (
          <div className="admin-panel legacy-enrichment-warning">
            <p className="eyebrow">DADO ANTERIOR</p>
            <h2>Dossiê empresarial antigo preservado</h2>
            <p>
              Este conteúdo foi gerado antes da consolidação por
              parlamentar e pode representar somente um fornecedor.
              Ele não será usado como resumo geral do gabinete.
            </p>
            <AdminEnrichmentPanel enrichment={alert.enrichment} />
          </div>
        ) : null}

        <AdminEntityNetwork
          alertId={alert.id}
          network={alert.entityNetwork}
          defaultSourceUrl={links[0]}
        />

        <div className="admin-alert-layout">
          <div className="admin-panel">
            <div className="panel-heading">
              <h2>Documentos e evidência original</h2>
            </div>

            <p className="admin-warning">
              O sinal estatístico não comprova irregularidade. Confirme o
              documento, os lançamentos associados, glosas, parcelas,
              restituições, justificativas e contraditório.
            </p>

            <p>
              Os PDFs são abertos somente na aba <strong>Documentos</strong>,
              onde cada comprovante aparece com o valor de face e o valor
              líquido debitado da CEAP em colunas separadas.
            </p>

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
                  Este caso já foi convertido e está relacionado ao
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
