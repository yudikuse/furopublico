import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoNotice } from "@/components/demo-notice";
import { LinkIcon } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";
import { getInvestigationBySlug, getPublishedInvestigations } from "@/lib/data";
import { categoryLabel, formatCurrency, formatDate } from "@/lib/format";

export async function generateStaticParams() {
  const investigations = await getPublishedInvestigations();
  return investigations.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const investigation = await getInvestigationBySlug(slug);
  if (!investigation) return { title: "Investigação não encontrada" };
  return { title: investigation.title, description: investigation.summary };
}

export default async function InvestigationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const investigation = await getInvestigationBySlug(slug);
  if (!investigation) notFound();

  return (
    <article className="case-page">
      <header className="case-header">
        <div className="container narrow-content">
          <Link className="back-link" href="/investigacoes">← Todas as investigações</Link>
          <div className="card-meta"><span className="category-pill">{categoryLabel(investigation.category)}</span><StatusBadge status={investigation.status} /></div>
          <h1>{investigation.title}</h1>
          <p className="case-deck">{investigation.summary}</p>
          <div className="case-byline">
            <span>Publicado em {formatDate(investigation.publishedAt)}</span>
            <span>Atualizado em {formatDate(investigation.updatedAt)}</span>
            {investigation.state ? <span>{investigation.municipality ? `${investigation.municipality} · ` : ""}{investigation.state}</span> : null}
          </div>
        </div>
      </header>

      <div className="container narrow-content case-body">
        {investigation.isDemo ? <DemoNotice /> : null}

        <section className="finding-box">
          <p className="eyebrow">O QUE OS DOCUMENTOS INDICAM</p>
          <p>{investigation.finding}</p>
          {investigation.involvedAmount ? <strong>{formatCurrency(investigation.involvedAmount)} em valores relacionados ao caso</strong> : null}
        </section>

        <section className="case-section">
          <h2>Os números</h2>
          <div className="fact-grid">
            {investigation.facts.map((fact) => (
              <article key={`${fact.label}-${fact.value}`}><span>{fact.label}</span><strong>{fact.value}</strong>{fact.detail ? <p>{fact.detail}</p> : null}</article>
            ))}
          </div>
        </section>

        <section className="case-section">
          <h2>Quem aparece nos documentos</h2>
          <div className="entity-list">
            {investigation.entities.map((entity) => (
              <div key={`${entity.type}-${entity.name}`}><span>{entity.type}</span><strong>{entity.name}</strong><p>{entity.role}{entity.party ? ` · ${entity.party}` : ""}{entity.state ? ` · ${entity.state}` : ""}</p></div>
            ))}
          </div>
        </section>

        <section className="case-section sources-section">
          <h2>Documentos e fontes</h2>
          <p className="section-intro">As conclusões devem poder ser refeitas por qualquer pessoa a partir das fontes indicadas.</p>
          <div className="source-list">
            {investigation.sources.map((source) => (
              <a key={`${source.url}-${source.title}`} href={source.url} target="_blank" rel="noreferrer noopener">
                <LinkIcon /><div><strong>{source.title}</strong><span>{source.publisher} · {source.kind.replaceAll("_", " ")}</span>{source.note ? <p>{source.note}</p> : null}</div><span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </section>

        <section className="case-section two-panel">
          <div><h2>Como apuramos</h2><p>{investigation.methodology}</p></div>
          <div className="caveat-panel"><h2>Limites da conclusão</h2><p>{investigation.caveat}</p></div>
        </section>

        <section className="case-section">
          <h2>Linha do tempo</h2>
          <ol className="timeline">
            {investigation.timeline.map((item) => <li key={`${item.date}-${item.title}`}><time>{formatDate(item.date)}</time><div><strong>{item.title}</strong><p>{item.description}</p></div></li>)}
          </ol>
        </section>

        <section className="case-section response-section">
          <h2>Resposta dos citados</h2>
          {investigation.responses.length ? investigation.responses.map((response) => (
            <blockquote key={`${response.author}-${response.receivedAt}`}><strong>{response.author}</strong><span>Recebida em {formatDate(response.receivedAt)}</span><p>{response.content}</p></blockquote>
          )) : <p>Nenhuma resposta foi recebida até a última atualização. O espaço permanece aberto para manifestação e correção documental.</p>}
          <Link className="text-link" href="/direito-de-resposta">Como solicitar resposta ou correção →</Link>
        </section>
      </div>
    </article>
  );
}
