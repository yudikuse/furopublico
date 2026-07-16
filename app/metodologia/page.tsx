import type { Metadata } from "next";
import { AlertIcon, FileIcon, SearchIcon, ShieldIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Metodologia", description: "Critérios editoriais, fontes, alertas e revisão do Furo Público." };

export default function MethodologyPage() {
  return (
    <section className="page-section">
      <div className="container narrow-content prose-page">
        <div className="page-header"><p className="eyebrow">TRANSPARÊNCIA EDITORIAL</p><h1>Como investigamos</h1><p>O sistema pode encontrar uma pista. Apenas uma apuração humana pode transformar essa pista em publicação.</p></div>

        <div className="principle-grid">
          <article><SearchIcon /><h2>1. Detecção</h2><p>Buscamos duplicidades, concentrações, valores fora do padrão, relações entre fornecedores e divergências entre declaração e voto.</p></article>
          <article><FileIcon /><h2>2. Prova</h2><p>Preservamos URL, data de acesso, documento original e transformação aplicada aos dados.</p></article>
          <article><ShieldIcon /><h2>3. Contexto</h2><p>Conferimos regras, prazos, texto efetivamente votado, justificativas e explicações plausíveis.</p></article>
          <article><AlertIcon /><h2>4. Contraditório</h2><p>Procuramos os citados antes da conclusão e exibimos a resposta junto ao caso.</p></article>
        </div>

        <h2>Recorte</h2>
        <p>O fato central precisa ocorrer durante a 57ª Legislatura da Câmara dos Deputados, de 1º de fevereiro de 2023 a 31 de janeiro de 2027. Dados anteriores podem ser usados para demonstrar histórico ou vínculo relevante.</p>

        <h2>Fontes prioritárias</h2>
        <ul><li>Dados Abertos da Câmara dos Deputados;</li><li>execução orçamentária e transferências oficiais;</li><li>Portal Nacional de Contratações Públicas e diários oficiais;</li><li>dados cadastrais e eleitorais públicos;</li><li>tribunais de contas, controladorias e processos oficiais;</li><li>documentos enviados por fontes, depois de autenticados.</li></ul>

        <h2>O que um alerta significa</h2>
        <p>Um alerta estatístico indica somente que um registro merece verificação. Não significa fraude, crime, corrupção ou responsabilidade pessoal. A publicação deve explicar o método, a limitação e as hipóteses legítimas consideradas.</p>

        <h2>Requisitos mínimos para publicação</h2>
        <ol><li>interesse público concreto;</li><li>fonte verificável e preservada;</li><li>contexto suficiente para interpretar o dado;</li><li>revisão humana;</li><li>tentativa de contato com os citados;</li><li>linguagem proporcional ao que foi efetivamente comprovado.</li></ol>

        <h2>Correções</h2>
        <p>Erros factuais são corrigidos com destaque e registro na linha do tempo. Uma atualização não apaga silenciosamente a versão anterior nem transforma hipótese em fato.</p>
      </div>
    </section>
  );
}
