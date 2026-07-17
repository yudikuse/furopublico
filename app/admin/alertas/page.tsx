import { AdminAlertsTable } from "@/components/admin-alerts-table";
import { getAlerts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="page-header alerts-page-header">
          <p className="eyebrow">FILA PRIVADA</p>
          <h1>Alertas para revisão</h1>
          <p>
            Cada registro representa um parlamentar e um período.
            Tipos de sinal, categorias, fornecedores e documentos são
            organizados dentro da página do gabinete.
          </p>
        </div>

        <AdminAlertsTable alerts={alerts} />
      </div>
    </section>
  );
}
