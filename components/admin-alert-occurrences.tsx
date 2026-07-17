import type { InvestigationAlert } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

type Props = { alert: InvestigationAlert };

type Occurrence = {
  supplierName?: string;
  supplierTaxId?: string;
  category?: string;
  documentNumber?: string;
  documentDate?: string;
  individualValue?: number;
  relatedAmount?: number;
  repetitionCount?: number;
  supplierTotal?: number;
  categoryTotal?: number;
  share?: number;
  documentCount?: number;
  amount?: number;
  threshold?: number;
};

export function AdminAlertOccurrences({ alert }: Props) {
  const evidence = alert.evidence as {
    consolidated?: boolean;
    ruleType?: string;
    analyzedYear?: number;
    category?: string | null;
    occurrenceCount?: number;
    supplierCount?: number;
    largestOccurrence?: number;
    occurrences?: Occurrence[];
  };

  if (!evidence.consolidated || !evidence.occurrences?.length) return null;

  return (
    <section className="admin-panel consolidated-occurrences">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">OCORRÊNCIAS CONSOLIDADAS</p>
          <h2>{evidence.occurrenceCount ?? evidence.occurrences.length} sinal(is) técnico(s)</h2>
        </div>
        <span>
          {evidence.supplierCount ?? 1} fornecedor(es) · {evidence.analyzedYear ?? "período não informado"}
        </span>
      </div>

      <p className="admin-warning">
        A consolidação reduz a repetição na fila. Cada linha abaixo continua
        sendo apenas uma pista e exige conferência no documento original.
      </p>

      <div className="table-wrap">
        <table className="admin-table occurrences-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Categoria/documento</th>
              <th>Data</th>
              <th>Informação principal</th>
            </tr>
          </thead>
          <tbody>
            {evidence.occurrences.map((item, index) => (
              <tr key={`${item.supplierTaxId}-${item.documentNumber}-${item.documentDate}-${index}`}>
                <td>
                  <strong>{item.supplierName ?? "Não identificado"}</strong>
                  <small>{item.supplierTaxId ?? "CNPJ/CPF não informado"}</small>
                </td>
                <td>
                  {item.category ?? evidence.category ?? "—"}
                  <small>{item.documentNumber ? `Documento ${item.documentNumber}` : ""}</small>
                </td>
                <td>{formatDate(item.documentDate)}</td>
                <td>
                  {evidence.ruleType === "documento-repetido" ? (
                    <>
                      <strong>{item.repetitionCount ?? 2} registros iguais</strong>
                      <small>
                        {formatCurrency(item.individualValue)} cada · relacionado {formatCurrency(item.relatedAmount)}
                      </small>
                    </>
                  ) : evidence.ruleType === "concentracao-fornecedor" ? (
                    <>
                      <strong>{((item.share ?? 0) * 100).toFixed(1)}% da categoria</strong>
                      <small>
                        {formatCurrency(item.supplierTotal)} em {item.documentCount ?? 0} documento(s)
                      </small>
                    </>
                  ) : (
                    <>
                      <strong>{formatCurrency(item.amount)}</strong>
                      <small>Limite: {formatCurrency(item.threshold)}</small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
