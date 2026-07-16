import Link from "next/link";

export function Footer() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contato@seudominio.com.br";

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">FURO PÚBLICO</p>
          <p className="muted max-copy">
            Investigação documental sobre atos, recursos, votos e relações da 57ª Legislatura da Câmara dos Deputados.
          </p>
        </div>
        <div>
          <p className="footer-title">Transparência</p>
          <Link href="/metodologia">Como investigamos</Link>
          <Link href="/direito-de-resposta">Direito de resposta e correções</Link>
        </div>
        <div>
          <p className="footer-title">Contato</p>
          <a href={`mailto:${email}`}>{email}</a>
          <Link href="/denuncie">Enviar documentos</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>2023–2027 · 57ª Legislatura</span>
        <span>Alertas estatísticos não equivalem a comprovação de irregularidade.</span>
      </div>
    </footer>
  );
}
