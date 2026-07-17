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
};
