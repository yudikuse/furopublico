import "@/app/office-budget.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAlertForm } from "@/components/admin-alert-form";
import { AdminParliamentaryModules } from "@/components/admin-parliamentary-modules";
import { AdminEnrichmentPanel } from "@/components/admin-enrichment-panel";
import { AdminEntityNetwork } from "@/components/admin-entity-network";
import { getAlertById } from "@/lib/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function collectDocumentLinks(evidence: Record<string, unknown>) {
  const urls = new Set<string>();
  const documents = Array.isArray(evidence.documents) ? evidence.documents : [];

  for (const value of documents) {
    if (!value || typeof value !== "object") continue;
    const document = value as Record<string, unknown>;
    const direct = String(document.documentUrl ?? "").trim();
    if (/^https?:\/\//i.test(direct)) urls.add(direct);

    const records = Array.isArray(document.records) ? document.records : [];
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

  const officeBudget = evidence.officeBudget as
    | { documents?: Array<{ sourceUrl?: string }> }
    | undefined;
  for (const document of officeBudget?.documents ?? []) {
    const candidate = String(document.sourceUrl ?? "").trim();
    if (/^https?:\/\//i.test(candidate)) urls.add(candidate);
  }

  return [...urls];
}

export default async function AlertDetailPage({ params }: PageProps) {
  const { id } = await params;
  const alert = await getAlertById(id);
  if (!alert) notFound();

  const evidence = alert.evidence as Record<string, unknown>;
  const links = collectDocumentLinks(evidence);
  const hasCeap =
    (Array.isArray(evidence.documents) && evidence.documents.length > 0) ||
    Number(evidence.signalCount ?? evidence.occurrenceCount ?? 0) > 0;
  const hasOfficeBudget = Boolean(evidence.officeBudget);

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
              Caso consolidado por parlamentar e período. CEAP, verba de gabinete,
              emendas, documentos e sinais técnicos permanecem separados para
              conferência.
            </p>
          </div>
          <b className={`severity severity-${alert.severity}`}>{alert.severity}</b>
        </div>

        <AdminParliamentaryModules alert={alert} />

        {alert.enrichment ? (
          <div className="admin-panel legacy-enrichment-warning">
            <p className="eyebrow">DADO ANTERIOR</p>
            <h2>Dossiê empresarial antigo preservado</h2>
            <p>
              Este conteúdo foi gerado antes da consolidação por parlamentar e pode
              representar somente um fornecedor. Ele não será usado como resumo geral
              do gabinete.
            </p>
            <AdminEnrichmentPanel enrichment={alert.enrichment} />
          </div>
        ) : null}

        {hasCeap || alert.entityNetwork ? (
          <AdminEntityNetwork
            alertId={alert.id}
            network={alert.entityNetwork}
            defaultSourceUrl={links[0]}
          />
        ) : null}

        <div className="admin-alert-layout">
          <div className="admin-panel">
            <div className="panel-heading">
              <h2>Fontes e evidência original</h2>
            </div>

            <p className="admin-warning">
              Sinais estatísticos e variações de folha não comprovam irregularidade.
              Confirme documentos, período, lotação, parcelas remuneratórias,
              nomeações, exonerações, justificativas e contraditório.
            </p>

            {hasCeap ? (
              <p>
                Os PDFs da CEAP são abertos na aba <strong>Documentos</strong>, com
                valor de face e valor líquido em colunas separadas.
              </p>
            ) : null}

            {hasOfficeBudget ? (
              <p>
                As planilhas mensais e o snapshot funcional aparecem em
                <strong> Verba de gabinete → Fontes</strong>. A folha publicada não é
                somada ao valor da CEAP.
              </p>
            ) : null}

            <details className="evidence-json">
              <summary>Ver todos os dados brutos do caso</summary>
              <pre>
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(alert.evidence).filter(
                      ([key]) => key !== "enrichment" && key !== "entityNetwork"
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
                <p>Este caso já foi convertido e está relacionado ao registro:</p>
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
