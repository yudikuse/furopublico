import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";
import "./entity-network.css";
import "./investigation-workspace.css";
import "./alerts-consolidated.css";
import "./parliamentary-alert.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Furo Público — Investigações da 57ª Legislatura",
    template: "%s | Furo Público"
  },
  description:
    "Investigações documentais sobre despesas, emendas, votos, contratos e relações da 57ª Legislatura da Câmara dos Deputados.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Furo Público",
    title: "Furo Público — Investigações da 57ª Legislatura",
    description:
      "O que disseram. O que os documentos mostram. O que foi entregue."
  },
  robots: { index: true, follow: true }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        <Header />
        <main id="conteudo">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
