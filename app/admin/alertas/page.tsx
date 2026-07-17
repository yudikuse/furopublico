import { AdminParliamentaryQueue } from "@/components/admin-parliamentary-queue";
import { getAlerts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getAlerts();

  return (
    <section className="page-section admin-page">
      <div className="container">
        <div className="page-header alerts-page-header">
          <p className="eyebrow">FILA PRIVADA</p>
          <h1>Casos para revisão</h1>
          <p>
            Cada registro representa um parlamentar e um período. O valor
            CEAP é calculado por lançamentos únicos agrupados nos documentos
            oficiais; sinais técnicos são contados separadamente.
          </p>
        </div>

        <AdminParliamentaryQueue alerts={alerts} />
      </div>
    </section>
  );
}
