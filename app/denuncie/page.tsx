import type { Metadata } from "next";
import { TipForm } from "@/components/tip-form";

export const metadata: Metadata = { title: "Envie uma pista", description: "Envie documentos e informações para verificação editorial." };

export default function TipPage() {
  return (
    <section className="page-section">
      <div className="container form-page-grid">
        <div className="page-header"><p className="eyebrow">CANAL DE PISTAS</p><h1>O que não está fechando?</h1><p>Descreva o caso e indique onde estão os documentos. Relato não é prova: tudo será verificado antes de qualquer publicação.</p>
          <div className="security-note"><strong>Não publique dados sensíveis aqui.</strong><p>Evite senhas, dados bancários, prontuários, endereços pessoais ou informações que coloquem alguém em risco. Para arquivos grandes ou sensíveis, faça primeiro um contato por e-mail.</p></div>
        </div>
        <TipForm />
      </div>
    </section>
  );
}
