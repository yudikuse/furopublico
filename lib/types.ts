export const investigationCategories = [
  "despesas",
  "emendas",
  "votos",
  "contratos",
  "campanha",
  "outros"
] as const;

export const investigationStatuses = [
  "triagem",
  "em_apuracao",
  "aguardando_resposta",
  "publicado",
  "atualizado",
  "arquivado"
] as const;

export type InvestigationCategory = (typeof investigationCategories)[number];
export type InvestigationStatus = (typeof investigationStatuses)[number];

export type EvidenceSource = {
  title: string;
  publisher: string;
  url: string;
  kind:
    | "dado_oficial"
    | "documento"
    | "declaracao"
    | "resposta"
    | "verificacao_local";
  accessedAt?: string;
  documentDate?: string;
  note?: string;
};

export type InvolvedEntity = {
  name: string;
  type: "pessoa" | "empresa" | "orgao" | "municipio" | "partido";
  role: string;
  party?: string;
  state?: string;
};

export type InvestigationFact = {
  label: string;
  value: string;
  detail?: string;
};

export type InvestigationTimelineItem = {
  date: string;
  title: string;
  description: string;
};

export type InvestigationResponse = {
  author: string;
  receivedAt: string;
  content: string;
  sourceUrl?: string;
};

export type Investigation = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  finding: string;
  category: InvestigationCategory;
  status: InvestigationStatus;
  confidence: "pista" | "cruzamento" | "documental";
  state?: string;
  municipality?: string;
  involvedAmount?: number;
  publishedAt?: string;
  updatedAt: string;
  isFeatured: boolean;
  isDemo: boolean;
  tags: string[];
  entities: InvolvedEntity[];
  facts: InvestigationFact[];
  sources: EvidenceSource[];
  timeline: InvestigationTimelineItem[];
  responses: InvestigationResponse[];
  methodology: string;
  caveat: string;
};


export type EnrichmentFlag = {
  level: "info" | "atencao" | "prioridade";
  title: string;
  detail: string;
};

export type AlertEnrichment = {
  version: 1;
  generatedAt: string;
  period: { from: number; to: number };
  deputy: { id?: string; name?: string };
  supplier: { taxId?: string; name?: string };
  company: {
    source: "BrasilAPI";
    taxId: string;
    legalName?: string;
    tradeName?: string;
    status?: string;
    openingDate?: string;
    mainActivity?: string;
    legalNature?: string;
    size?: string;
    capital?: number;
    address?: string;
    municipality?: string;
    state?: string;
    partners: Array<{ name: string; qualification?: string }>;
    raw: Record<string, unknown>;
  } | null;
  history: {
    allExpensesCount: number;
    sameSupplierCount: number;
    sameSupplierTotal: number;
    categoryTotal: number;
    supplierShare?: number;
    firstPaymentDate?: string;
    lastPaymentDate?: string;
    averagePayment: number;
    largestPayment: number;
    recurringAmount?: number;
    recurringCount: number;
    annualTotals: Array<{ label: string; total: number }>;
    monthlyTotals: Array<{ label: string; total: number }>;
    topSuppliers: Array<{ name: string; taxId: string; total: number; count: number }>;
    duplicateCandidates: Array<{
      count: number;
      supplierName: string;
      documentNumber: string;
      date?: string;
      amount: number;
    }>;
    documents: Array<{
      date?: string;
      amount: number;
      category: string;
      documentNumber: string;
      documentCode: string;
      url?: string;
    }>;
  };
  flags: EnrichmentFlag[];
  questions: string[];
  sourceStatus: {
    camara: "ok" | "partial" | "error";
    cnpj: "ok" | "not_found" | "not_applicable" | "error";
    errors: string[];
  };
  disclaimer: string;
};

export type InvestigationAlert = {
  id: string;
  title: string;
  rule: string;
  severity: "baixa" | "media" | "alta";
  status: "novo" | "em_revisao" | "descartado" | "convertido";
  detectedAt: string;
  deputyName?: string;
  supplierName?: string;
  amount?: number;
  evidence: Record<string, unknown>;
  reviewerNotes?: string;
  investigationId?: string;
  enrichment?: AlertEnrichment;
};
