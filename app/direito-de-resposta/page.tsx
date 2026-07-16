import type { Metadata } from "next";

export const metadata: Metadata = { title: "Direito de resposta e correções" };

export default function ResponsePage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contato@seudominio.com.br";
  return (
    <section className="page-section"><div className="container narrow-content prose-page">
      <div className="page-header"><p className="eyebrow">CONTRADITÓRIO</p><h1>Direito de resposta e correções</h1><p>Pessoas, empresas e órgãos citados podem apresentar explicações, documentos e pedidos de correção.</p></div>
      <h2>Como enviar</h2><p>Escreva para <a href={`mailto:${email}`}>{email}</a>, identifique a investigação e indique com precisão o trecho questionado. Anexe ou informe as fontes que sustentam a correção.</p>
      <h2>O que fazemos</h2><ul><li>confirmamos o recebimento;</li><li>verificamos os documentos enviados;</li><li>corrigimos prontamente erros factuais comprovados;</li><li>publicamos manifestação pertinente junto ao caso;</li><li>registramos alterações materiais na linha do tempo.</li></ul>
      <h2>O que não fazemos</h2><p>Não removemos informação verdadeira e de interesse público apenas por ser desconfortável. Também não publicamos insultos, ameaças ou alegações sem relação com os fatos analisados.</p>
    </div></section>
  );
}
