import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Furo Público — página inicial">
          <span className="brand-mark">FP</span>
          <span>
            <strong>FURO PÚBLICO</strong>
            <small>57ª Legislatura</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label="Navegação principal">
          <Link href="/investigacoes">Investigações</Link>
          <Link href="/metodologia">Metodologia</Link>
          <Link href="/denuncie">Envie uma pista</Link>
        </nav>
      </div>
    </header>
  );
}
