import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminInvestigationEditor } from "@/components/admin-investigation-editor";
import {
  getAlertByInvestigationId,
  getInvestigationById
} from "@/lib/data";
import {
  categoryLabel,
  formatCurrency,
  formatDate,
  statusLabel
} from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function verificationLabel(value?: string) {
  const labels: Record<string, string> = {
    camara: "Câmara",
    documento: "Documento",
    cadastro: "Cadastro",
    coincidencia: "Coincidência",
    nao_verificado: "Não verificado"
  };

  return value ? labels[value] ?? value : "Editorial";
}

export default async function InternalInvestigationPage({
  params
}: PageProps) {
  const { id } = await params;

  const [investigation, linkedAlert] = await Promise.all([
    getInvestigationById(id),
    getAlertByInvestigationId(id)
  ]);

  if (!investigation) notFound();

  const pendingQuestions = investigation.facts.filter(
    (fact) => fact.label === "Pergunta pendente"
  );
  const sourceLimits = investigation.facts.filter(
    (fact) => fact.label === "Limite da fonte"
  );
  const substantiveFacts = investigation.facts.filter(
    (fact) =>
      fact.label !== "Pergunta pendente" &&
      fact.label !== "Limite da fonte"
  );

  const isPublic = [
    "aguardando_resposta",
    "publicado",
    "atualizado"
  ].includes(investigation.status);

  return (
    <section className="page-section admin-page investigation-workspace">
      <div className="container">
        <div className="investigation-workspace-nav">
          <Link className="text-link" href="/admin/investigacoes">
            ← Investigações internas
          </Link>

          {linkedAlert ? (
            <Link
              className="text-link"
              href={`/admin/alertas/${linkedAlert.id}`}
            >
              Abrir alerta de origem →
            </Link>
          ) : null}
        </div>

        <header className="investigation-workspace-hero">
          <div>
            <p className="eyebrow">INVESTIGAÇÃO INTERNA</p>
            <h1>{investigation.title}</h1>
            <p>{investigation.summary}</p>
          </div>

          <div className="investigation-workspace-badges">
            <b>{statusLabel(investigation.status)}</b>
            <span>{categoryLabel(investigation.category)}</span>
            <span>{investigation.confidence}</span>
          </div>
        </header>

        <div className="investigation-workspace-metrics">
          <article>
            <span>Valor relacionado</span>
            <strong>
              {formatCurrency(investigation.involvedAmount)}
            </strong>
          </article>
          <article>
            <span>Entidades</span>
            <strong>{investigation.entities.length}</strong>
          </article>
          <article>
            <span>Fontes</span>
            <strong>{investigation.sources.length}</strong>
          </article>
          <article>
            <span>Atualizada</span>
            <strong>{formatDate(investigation.updatedAt)}</strong>
          </article>
        </div>

        <div className="investigation-workspace-layout">
          <main className="investigation-workspace-main">
            <section className="workspace-section workspace-finding">
              <p className="eyebrow">ACHADO CENTRAL PROVISÓRIO</p>
              <h2>O que os documentos indicam até aqui</h2>
              <p>{investigation.finding}</p>
              <small>
                Este texto é interno e deve permanecer proporcional às
                fontes confirmadas.
              </small>
            </section>

            <section className="workspace-section">
              <div className="panel-heading">
                <h2>Quem aparece na apuração</h2>
                <span>{investigation.entities.length} entidade(s)</span>
              </div>

              <div className="workspace-entity-grid">
                {investigation.entities.map((entity, index) => (
                  <article
                    key={`${entity.type}-${entity.name}-${index}`}
                  >
                    <div>
                      <span>{entity.type}</span>
                      <b>
                        {verificationLabel(entity.verification)}
                      </b>
                    </div>
                    <h3>{entity.name}</h3>
                    <p>{entity.role}</p>
                    {entity.taxId ? (
                      <small>CNPJ/CPF: {entity.taxId}</small>
                    ) : null}
                    {entity.sourceUrl ? (
                      <a
                        href={entity.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Conferir fonte ↗
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="workspace-section">
              <div className="panel-heading">
                <h2>Dados, pagamentos e relações</h2>
                <span>{substantiveFacts.length} registro(s)</span>
              </div>

              <div className="workspace-fact-grid">
                {substantiveFacts.map((fact, index) => (
                  <article
                    key={`${fact.label}-${fact.value}-${index}`}
                  >
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                    {fact.detail ? <p>{fact.detail}</p> : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="workspace-section">
              <div className="panel-heading">
                <h2>Documentos e fontes</h2>
                <span>{investigation.sources.length} fonte(s)</span>
              </div>

              <div className="workspace-source-list">
                {investigation.sources.map((source, index) => (
                  <a
                    key={`${source.url}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div>
                      <strong>{source.title}</strong>
                      <span>
                        {source.publisher} ·{" "}
                        {source.kind.replaceAll("_", " ")}
                      </span>
                      {source.note ? <p>{source.note}</p> : null}
                    </div>
                    <b>↗</b>
                  </a>
                ))}
              </div>
            </section>

            <div className="workspace-two-columns">
              <section className="workspace-section">
                <h2>Perguntas pendentes</h2>
                {pendingQuestions.length ? (
                  <ol className="workspace-question-list">
                    {pendingQuestions.map((fact, index) => (
                      <li key={`${fact.value}-${index}`}>
                        {fact.value}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">
                    Nenhuma pergunta automática sincronizada.
                  </p>
                )}
              </section>

              <section className="workspace-section workspace-limits">
                <h2>Limites das fontes</h2>
                {sourceLimits.length ? (
                  <ul>
                    {sourceLimits.map((fact, index) => (
                      <li key={`${fact.value}-${index}`}>
                        {fact.value}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">
                    Nenhuma limitação adicional registrada.
                  </p>
                )}
              </section>
            </div>

            <section className="workspace-section">
              <div className="panel-heading">
                <h2>Linha do tempo</h2>
                <span>{investigation.timeline.length} evento(s)</span>
              </div>

              <ol className="workspace-timeline">
                {investigation.timeline
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((item, index) => (
                    <li key={`${item.date}-${item.title}-${index}`}>
                      <time>{formatDate(item.date)}</time>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>

            <section className="workspace-section">
              <div className="panel-heading">
                <h2>Manifestações dos citados</h2>
                <span>{investigation.responses.length} resposta(s)</span>
              </div>

              {investigation.responses.length ? (
                investigation.responses.map((response, index) => (
                  <blockquote
                    key={`${response.author}-${response.receivedAt}-${index}`}
                  >
                    <strong>{response.author}</strong>
                    <span>
                      Recebida em {formatDate(response.receivedAt)}
                    </span>
                    <p>{response.content}</p>
                    {response.sourceUrl ? (
                      <a
                        href={response.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir documento ↗
                      </a>
                    ) : null}
                  </blockquote>
                ))
              ) : (
                <p className="muted">
                  Nenhuma manifestação foi registrada.
                </p>
              )}
            </section>

            <section className="workspace-section workspace-methodology">
              <div>
                <h2>Metodologia</h2>
                <p>{investigation.methodology}</p>
              </div>
              <div>
                <h2>Ressalvas</h2>
                <p>{investigation.caveat}</p>
              </div>
            </section>
          </main>

          <div className="investigation-workspace-side">
            <AdminInvestigationEditor investigation={investigation} />

            {linkedAlert ? (
              <section className="workspace-side-card">
                <p className="eyebrow">ALERTA DE ORIGEM</p>
                <h2>{linkedAlert.title}</h2>
                <p>
                  {linkedAlert.deputyName ?? "Parlamentar não identificado"}
                  {linkedAlert.supplierName
                    ? ` — ${linkedAlert.supplierName}`
                    : ""}
                </p>
                <Link
                  className="button button-dark"
                  href={`/admin/alertas/${linkedAlert.id}`}
                >
                  Abrir evidência original
                </Link>
              </section>
            ) : null}

            {isPublic ? (
              <section className="workspace-side-card">
                <p className="eyebrow">VERSÃO PÚBLICA</p>
                <p>
                  Este caso possui status visível ao público.
                </p>
                <Link
                  className="button button-primary"
                  href={`/investigacoes/${investigation.slug}`}
                >
                  Abrir página pública
                </Link>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
