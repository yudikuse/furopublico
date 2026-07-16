import Link from "next/link";
import { DemoNotice } from "@/components/demo-notice";
import { InvestigationCard } from "@/components/investigation-card";
import { ArrowIcon, FileIcon, MoneyIcon, SearchIcon, ShieldIcon, VoteIcon } from "@/components/icons";
import { getPublishedInvestigations } from "@/lib/data";
import { categoryLabel, formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export default async function HomePage() {
  const investigations = await getPublishedInvestigations();
  const featured = investigations.find((item) => item.isFeatured) ?? investigations[0];
  const latest = investigations.filter((item) => item.id !== featured?.id).slice(0, 6);
  const hasDemo = investigations.some((item) => item.isDemo);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">INVESTIGAÇÃO PÚBLICA · 57ª LEGISLATURA</p>
            <h1>O que disseram.<br /><span>O que os documentos mostram.</span></h1>
            <p className="hero-copy">
              Cruzamos despesas, emendas, votos, contratos e declarações para revelar inconsistências de interesse público — com documentos, contexto e direito de resposta.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/investigacoes">Ver investigações <ArrowIcon /></Link>
              <Link className="button button-secondary" href="/denuncie">Enviar uma pista</Link>
            </div>
          </div>
          <div className="hero-manifesto">
            <span className="manifesto-number">57</span>
            <p>Legislatura monitorada</p>
            <dl>
              <div><dt>Período</dt><dd>2023–2027</dd></div>
              <div><dt>Regra</dt><dd>Sem acusação automática</dd></div>
              <div><dt>Prova</dt><dd>Fonte verificável</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {hasDemo ? <div className="container notice-wrapper"><DemoNotice /></div> : null}

      {featured ? (
        <section className="section featured-section">
          <div className="container">
            <div className="section-heading"><div><p className="eyebrow">INVESTIGAÇÃO EM DESTAQUE</p><h2>O achado principal</h2></div></div>
            <article className="featured-case">
              <div className={`featured-visual visual-${featured.category}`}>
                <div><span>{categoryLabel(featured.category)}</span>{featured.isDemo ? <em>DEMONSTRAÇÃO</em> : null}</div>
                <strong>{featured.involvedAmount ? formatCurrency(featured.involvedAmount) : featured.state ?? "Brasil"}</strong>
              </div>
              <div className="featured-content">
                <div className="card-meta"><StatusBadge status={featured.status} /><span>{formatDate(featured.publishedAt ?? featured.updatedAt)}</span></div>
                <h2>{featured.title}</h2>
                <p>{featured.summary}</p>
                <blockquote>{featured.finding}</blockquote>
                <Link className="button button-dark" href={`/investigacoes/${featured.slug}`}>Abrir documentos <ArrowIcon /></Link>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="section section-soft">
        <div className="container">
          <div className="section-heading">
            <div><p className="eyebrow">ÚLTIMOS ACHADOS</p><h2>Investigações publicadas</h2></div>
            <Link className="text-link" href="/investigacoes">Ver todas <ArrowIcon /></Link>
          </div>
          {latest.length ? (
            <div className="investigation-grid">
              {latest.map((item) => <InvestigationCard key={item.id} investigation={item} />)}
            </div>
          ) : (
            <div className="empty-state">Nenhuma investigação foi publicada ainda. Os alertas permanecem privados até a revisão editorial.</div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading centered"><div><p className="eyebrow">COMO UM FURO NASCE</p><h2>Dados brutos viram evidência</h2></div></div>
          <div className="process-grid">
            <article><SearchIcon /><span>01</span><h3>Detectamos</h3><p>Regras encontram padrões incomuns em despesas, votos, emendas e fornecedores.</p></article>
            <article><FileIcon /><span>02</span><h3>Documentamos</h3><p>Preservamos a fonte, conferimos datas, valores, textos e relações entre as bases.</p></article>
            <article><ShieldIcon /><span>03</span><h3>Revisamos</h3><p>Uma pessoa analisa contexto, limitações e explicações plausíveis antes da publicação.</p></article>
            <article><ArrowIcon /><span>04</span><h3>Publicamos</h3><p>O caso mostra o achado, as provas, a resposta dos citados e o histórico de correções.</p></article>
          </div>
        </div>
      </section>

      <section className="section category-section">
        <div className="container category-grid">
          <div><p className="eyebrow">LINHAS DE APURAÇÃO</p><h2>O que será confrontado</h2><p className="muted max-copy">O site público mostra somente os casos revisados. A base completa permanece nos bastidores para pesquisa e detecção.</p></div>
          <div className="category-cards">
            <article><MoneyIcon /><div><h3>Dinheiro</h3><p>Despesa, emenda, pagamento, contrato e entrega.</p></div></article>
            <article><VoteIcon /><div><h3>Votos</h3><p>Declaração pública versus voto nominal e texto votado.</p></div></article>
            <article><FileIcon /><div><h3>Fornecedores</h3><p>Concentração, vínculos, campanha e histórico contratual.</p></div></article>
          </div>
        </div>
      </section>

      <section className="section tip-cta">
        <div className="container tip-cta-inner">
          <div><p className="eyebrow">VOCÊ VIU ALGO QUE NÃO FECHA?</p><h2>Envie a pista. Nós buscamos a prova.</h2><p>Fotos, documentos, números de processo, publicações apagadas e informações locais podem iniciar uma apuração.</p></div>
          <Link className="button button-light" href="/denuncie">Enviar uma pista <ArrowIcon /></Link>
        </div>
      </section>
    </>
  );
}
