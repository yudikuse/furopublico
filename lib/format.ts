export function formatCurrency(value?: number) {
  if (value === undefined || value === null) return "Valor não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value?: string) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    despesas: "Despesas",
    emendas: "Emendas",
    votos: "Votos",
    contratos: "Contratos",
    campanha: "Campanha",
    outros: "Outros"
  };
  return labels[category] ?? category;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    triagem: "Em triagem",
    em_apuracao: "Em apuração",
    aguardando_resposta: "Aguardando resposta",
    publicado: "Publicado",
    atualizado: "Atualizado",
    arquivado: "Arquivado"
  };
  return labels[status] ?? status;
}
