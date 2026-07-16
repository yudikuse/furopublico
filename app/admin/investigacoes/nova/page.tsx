import { AdminCaseForm } from "@/components/admin-case-form";

export const dynamic = "force-dynamic";

export default function NewInvestigationPage() {
  return <section className="page-section admin-page"><div className="container form-page-grid"><div className="page-header"><p className="eyebrow">REDAÇÃO</p><h1>Nova investigação</h1><p>Comece como rascunho. O formulário público mostra somente casos com status de publicação.</p><div className="security-note"><strong>Não cole acusação sem prova.</strong><p>O título precisa descrever o que os documentos demonstram, não atribuir crime ou intenção que ainda não foi comprovada.</p></div></div><AdminCaseForm /></div></section>;
}
