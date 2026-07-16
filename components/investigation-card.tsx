import Link from "next/link";
import type { Investigation } from "@/lib/types";
import { categoryLabel, formatCurrency, formatDate } from "@/lib/format";
import { ArrowIcon } from "@/components/icons";
import { StatusBadge } from "@/components/status-badge";

export function InvestigationCard({ investigation, compact = false }: { investigation: Investigation; compact?: boolean }) {
  return (
    <article className={`investigation-card ${compact ? "compact" : ""}`}>
      <div className={`case-visual visual-${investigation.category}`}>
        <span>{categoryLabel(investigation.category)}</span>
        {investigation.isDemo ? <em>DEMONSTRAÇÃO</em> : null}
      </div>
      <div className="card-content">
        <div className="card-meta">
          <StatusBadge status={investigation.status} />
          <span>{formatDate(investigation.publishedAt ?? investigation.updatedAt)}</span>
        </div>
        <h3><Link href={`/investigacoes/${investigation.slug}`}>{investigation.title}</Link></h3>
        <p>{investigation.summary}</p>
        <div className="card-footer">
          <span>{investigation.involvedAmount ? formatCurrency(investigation.involvedAmount) : investigation.state ?? "Brasil"}</span>
          <Link className="text-link" href={`/investigacoes/${investigation.slug}`}>
            Ver provas <ArrowIcon />
          </Link>
        </div>
      </div>
    </article>
  );
}
