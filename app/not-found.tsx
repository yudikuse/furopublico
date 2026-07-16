import Link from "next/link";
export default function NotFound() { return <section className="page-section"><div className="container empty-state"><h1>Página não encontrada</h1><p>O endereço pode ter mudado ou o conteúdo ainda não foi publicado.</p><Link className="button button-primary" href="/">Voltar ao início</Link></div></section>; }
