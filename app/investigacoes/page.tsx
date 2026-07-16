import type { Metadata } from "next";
import { DemoNotice } from "@/components/demo-notice";
import { FilterBar } from "@/components/filter-bar";
import { getPublishedInvestigations } from "@/lib/data";

export const metadata: Metadata = {
  title: "Investigações",
  description: "Casos documentados sobre despesas, emendas, votos, contratos e campanha na 57ª Legislatura."
};

export default async function InvestigationsPage() {
  const investigations = await getPublishedInvestigations();
  return (
    <section className="page-section">
      <div className="container">
        <div className="page-header narrow">
          <p className="eyebrow">ARQUIVO EDITORIAL</p>
          <h1>Investigações</h1>
          <p>Somente achados com relevância pública, fontes verificáveis e revisão editorial. Use a busca para localizar pessoas, empresas, cidades ou temas.</p>
        </div>
        {investigations.some((item) => item.isDemo) ? <DemoNotice /> : null}
        <FilterBar investigations={investigations} />
      </div>
    </section>
  );
}
