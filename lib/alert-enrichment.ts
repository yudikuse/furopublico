import "server-only";
import { fetchCompanyProfile } from "@/lib/cnpj-api";
import { fetchDeputyExpenses, findDeputyIdByName } from "@/lib/camara-api";
import type { AlertEnrichment, EnrichmentFlag } from "@/lib/types";

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.includes(",")
    ? value.replaceAll(".", "").replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanTaxId(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getPrimaryRecord(evidence: Record<string, unknown>) {
  const direct = asRecord(evidence.record);
  if (direct) return direct;
  if (Array.isArray(evidence.records)) {
    return asRecord(evidence.records[0]);
  }
  return null;
}

function isoDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function aggregateBy<T>(
  rows: T[],
  key: (row: T) => string,
  amount: (row: T) => number
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const current = map.get(key(row)) ?? 0;
    map.set(key(row), current + amount(row));
  }
  return [...map.entries()]
    .map(([label, total]) => ({ label, total: round(total) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function expenseRow(row: Record<string, unknown>) {
  return {
    year: Number(row.ano ?? String(row.dataDocumento ?? "").slice(0, 4)),
    month: Number(row.mes ?? String(row.dataDocumento ?? "").slice(5, 7)),
    date: isoDate(row.dataDocumento ?? row.datEmissao),
    deputyId: String(row.idDeputado ?? ""),
    supplierTaxId: cleanTaxId(row.cnpjCpfFornecedor ?? row.txtCNPJCPF),
    supplierName: String(row.nomeFornecedor ?? row.txtFornecedor ?? "Não identificado").trim(),
    documentNumber: String(row.numDocumento ?? row.txtNumero ?? "").trim(),
    documentCode: String(row.codDocumento ?? "").trim(),
    category: String(row.tipoDespesa ?? row.txtDescricao ?? "Sem categoria").trim(),
    amount: numberValue(row.valorLiquido ?? row.vlrLiquido ?? row.valorDocumento),
    documentUrl: String(row.urlDocumento ?? "").trim() || undefined,
    raw: row
  };
}

function modeAmount(values: number[]) {
  const counts = new Map<string, { value: number; count: number }>();
  for (const value of values) {
    const key = value.toFixed(2);
    const current = counts.get(key) ?? { value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0];
}

function yearsForLegislature(referenceYear?: number) {
  const current = Math.min(new Date().getUTCFullYear(), 2027);
  const end = Math.min(Math.max(referenceYear ?? current, 2023), current);
  return Array.from({ length: end - 2023 + 1 }, (_, index) => 2023 + index);
}

export async function buildAlertEnrichment(input: {
  alertId: string;
  deputyName?: string;
  supplierName?: string;
  amount?: number;
  evidence: Record<string, unknown>;
}) {
  const record = getPrimaryRecord(input.evidence);
  const referenceYear = Number(
    record?.ano ?? String(input.evidence.documentDate ?? "").slice(0, 4)
  );
  const years = yearsForLegislature(Number.isFinite(referenceYear) ? referenceYear : undefined);

  let deputyId = String(
    input.evidence.deputyId ?? record?.idDeputado ?? record?.idDeputadoParlamentar ?? ""
  );

  const errors: string[] = [];
  if (!deputyId && input.deputyName) {
    try {
      deputyId = (await findDeputyIdByName(input.deputyName)) ?? "";
    } catch (error) {
      errors.push(`Não foi possível localizar o deputado: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const supplierTaxId = cleanTaxId(
    input.evidence.supplierTaxId ?? record?.cnpjCpfFornecedor ?? record?.txtCNPJCPF
  );
  const supplierName = input.supplierName ?? String(record?.nomeFornecedor ?? "");
  const category = String(input.evidence.category ?? record?.tipoDespesa ?? "Sem categoria");

  let rawExpenses: Record<string, unknown>[] = [];
  if (deputyId) {
    const history = await fetchDeputyExpenses(deputyId, years);
    rawExpenses = history.rows;
    errors.push(...history.errors.map((item) => `Câmara: ${item}`));
  } else {
    errors.push("O identificador do deputado não foi localizado.");
  }

  const expenses = rawExpenses.map(expenseRow).filter((item) => item.amount > 0);
  const supplierNameNormalized = normalizeText(supplierName);
  const sameSupplier = expenses.filter((item) =>
    supplierTaxId
      ? item.supplierTaxId === supplierTaxId
      : normalizeText(item.supplierName) === supplierNameNormalized
  );
  const sameCategory = expenses.filter(
    (item) => normalizeText(item.category) === normalizeText(category)
  );

  const supplierTotal = round(sum(sameSupplier.map((item) => item.amount)));
  const categoryTotal = round(sum(sameCategory.map((item) => item.amount)));
  const supplierShare = categoryTotal > 0 ? supplierTotal / categoryTotal : undefined;
  const recurring = modeAmount(sameSupplier.map((item) => item.amount));

  const annualTotals = aggregateBy(
    sameSupplier,
    (item) => String(item.year || "Sem ano"),
    (item) => item.amount
  );
  const monthlyTotals = aggregateBy(
    sameSupplier,
    (item) => `${item.year}-${String(item.month || 0).padStart(2, "0")}`,
    (item) => item.amount
  );

  const categorySupplierMap = new Map<string, { name: string; taxId: string; total: number; count: number }>();
  for (const item of sameCategory) {
    const key = item.supplierTaxId || normalizeText(item.supplierName);
    const current = categorySupplierMap.get(key) ?? {
      name: item.supplierName,
      taxId: item.supplierTaxId,
      total: 0,
      count: 0
    };
    current.total += item.amount;
    current.count += 1;
    categorySupplierMap.set(key, current);
  }
  const topSuppliers = [...categorySupplierMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((item) => ({ ...item, total: round(item.total) }));

  const duplicateMap = new Map<string, typeof expenses>();
  for (const item of expenses) {
    if (!item.documentNumber || !item.supplierTaxId) continue;
    const key = [
      item.supplierTaxId,
      item.documentNumber,
      item.date ?? "",
      item.amount.toFixed(2)
    ].join("|");
    const group = duplicateMap.get(key) ?? [];
    group.push(item);
    duplicateMap.set(key, group);
  }
  const duplicateCandidates = [...duplicateMap.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      count: group.length,
      supplierName: group[0].supplierName,
      documentNumber: group[0].documentNumber,
      date: group[0].date,
      amount: group[0].amount
    }));

  let company = null;
  let cnpjStatus: AlertEnrichment["sourceStatus"]["cnpj"] = "not_applicable";
  if (supplierTaxId.length === 14) {
    try {
      company = await fetchCompanyProfile(supplierTaxId);
      cnpjStatus = company ? "ok" : "not_found";
    } catch (error) {
      cnpjStatus = "error";
      errors.push(`CNPJ: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const flags: EnrichmentFlag[] = [];
  const threshold = numberValue(input.evidence.threshold);
  if (threshold && (input.amount ?? 0) > threshold) {
    flags.push({
      level: "atencao",
      title: "Valor acima do limite estatístico",
      detail: `O documento de R$ ${(input.amount ?? 0).toFixed(2)} superou o limite automático de R$ ${threshold.toFixed(2)}. Isso é uma pista, não prova irregularidade.`
    });
  }
  if (supplierShare !== undefined && supplierShare >= 0.5) {
    flags.push({
      level: supplierShare >= 0.75 ? "prioridade" : "atencao",
      title: "Concentração no mesmo fornecedor",
      detail: `O fornecedor representa ${(supplierShare * 100).toFixed(1)}% da categoria no período analisado.`
    });
  }
  if (sameSupplier.length >= 3) {
    flags.push({
      level: "info",
      title: "Relação recorrente",
      detail: `Foram localizados ${sameSupplier.length} documentos do mesmo fornecedor, totalizando R$ ${supplierTotal.toFixed(2)}.`
    });
  }
  if (duplicateCandidates.length) {
    flags.push({
      level: "prioridade",
      title: "Possíveis documentos repetidos",
      detail: `${duplicateCandidates.length} grupo(s) com fornecedor, número, data e valor coincidentes precisam ser conferidos.`
    });
  }
  if (company?.openingDate && company.openingDate.slice(0, 4) >= "2023") {
    flags.push({
      level: "atencao",
      title: "Empresa aberta durante a legislatura",
      detail: `A abertura informada é ${company.openingDate}. Verifique experiência anterior e contexto da contratação.`
    });
  }
  if (company?.status && normalizeText(company.status) !== "ativa") {
    flags.push({
      level: "prioridade",
      title: "Situação cadastral merece conferência",
      detail: `A situação cadastral retornada foi “${company.status}”.`
    });
  }

  const categoryText = normalizeText(category);
  const questions = [
    "Qual serviço ou bem foi efetivamente fornecido e quais documentos comprovam a entrega?",
    "Há contrato, nota fiscal, recibo, comprovante de pagamento e justificativa do gabinete?",
    "O preço é compatível com fornecedores equivalentes no mesmo local e período?",
    "Existe relação societária, familiar, eleitoral ou profissional entre os envolvidos?",
    "O fornecedor recebeu pagamentos de outros gabinetes ou órgãos públicos?"
  ];
  if (categoryText.includes("escritorio") || categoryText.includes("imovel") || categoryText.includes("locacao")) {
    questions.unshift(
      "Qual é a área, endereço, prazo contratual e estrutura do imóvel usado como escritório?",
      "O valor inclui aluguel, IPTU, condomínio, mobiliário ou outros encargos? Separe cada parcela.",
      "Quem é o proprietário e quem é o beneficiário econômico final dos pagamentos?",
      "Quanto custam imóveis comerciais comparáveis no mesmo bairro e período?"
    );
  }

  const dates = sameSupplier
    .map((item) => item.date)
    .filter((item): item is string => Boolean(item))
    .sort();

  const enrichment: AlertEnrichment = {
    version: 1,
    generatedAt: new Date().toISOString(),
    period: { from: years[0], to: years.at(-1) ?? years[0] },
    deputy: { id: deputyId || undefined, name: input.deputyName },
    supplier: { taxId: supplierTaxId || undefined, name: supplierName || undefined },
    company,
    history: {
      allExpensesCount: expenses.length,
      sameSupplierCount: sameSupplier.length,
      sameSupplierTotal: supplierTotal,
      categoryTotal,
      supplierShare,
      firstPaymentDate: dates[0],
      lastPaymentDate: dates.at(-1),
      averagePayment: sameSupplier.length ? round(supplierTotal / sameSupplier.length) : 0,
      largestPayment: sameSupplier.length ? Math.max(...sameSupplier.map((item) => item.amount)) : 0,
      recurringAmount: recurring?.count >= 2 ? round(recurring.value) : undefined,
      recurringCount: recurring?.count ?? 0,
      annualTotals,
      monthlyTotals,
      topSuppliers,
      duplicateCandidates,
      documents: sameSupplier.slice(-60).map((item) => ({
        date: item.date,
        amount: item.amount,
        category: item.category,
        documentNumber: item.documentNumber,
        documentCode: item.documentCode,
        url: item.documentUrl
      }))
    },
    flags,
    questions: [...new Set(questions)],
    sourceStatus: {
      camara: errors.some((item) => item.startsWith("Câmara:")) ? "partial" : deputyId ? "ok" : "error",
      cnpj: cnpjStatus,
      errors
    },
    disclaimer:
      "Enriquecimento automático para triagem. Os resultados não comprovam irregularidade e devem ser verificados em fontes originais e submetidos ao contraditório."
  };

  return enrichment;
}
