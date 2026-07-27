import "server-only";
import { cache } from "react";
import { demoAlerts, demoInvestigations } from "@/lib/demo-data";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type {
  AlertEnrichment,
  AlertEntityNetwork,
  AmendmentModuleData,
  Investigation,
  InvestigationAlert
} from "@/lib/types";

function normalizeInvestigation(row: Record<string, unknown>): Investigation {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary),
    finding: String(row.finding),
    category: row.category as Investigation["category"],
    status: row.status as Investigation["status"],
    confidence: row.confidence as Investigation["confidence"],
    state: row.state ? String(row.state) : undefined,
    municipality: row.municipality ? String(row.municipality) : undefined,
    involvedAmount:
      row.involved_amount === null || row.involved_amount === undefined
        ? undefined
        : Number(row.involved_amount),
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    updatedAt: String(row.updated_at),
    isFeatured: Boolean(row.is_featured),
    isDemo: Boolean(row.is_demo),
    tags: (row.tags as string[] | null) ?? [],
    entities: (row.entities as Investigation["entities"] | null) ?? [],
    facts: (row.facts as Investigation["facts"] | null) ?? [],
    sources: (row.sources as Investigation["sources"] | null) ?? [],
    timeline: (row.timeline as Investigation["timeline"] | null) ?? [],
    responses: (row.responses as Investigation["responses"] | null) ?? [],
    methodology: String(row.methodology ?? ""),
    caveat: String(row.caveat ?? "")
  };
}

function normalizeAlert(row: Record<string, unknown>): InvestigationAlert {
  const evidence =
    row.evidence && typeof row.evidence === "object"
      ? (row.evidence as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    title: String(row.title),
    rule: String(row.rule),
    severity: row.severity as InvestigationAlert["severity"],
    status: row.status as InvestigationAlert["status"],
    detectedAt: String(row.detected_at),
    deputyName: row.deputy_name ? String(row.deputy_name) : undefined,
    supplierName: row.supplier_name ? String(row.supplier_name) : undefined,
    amount:
      row.amount === null || row.amount === undefined
        ? undefined
        : Number(row.amount),
    evidence,
    reviewerNotes: row.reviewer_notes ? String(row.reviewer_notes) : undefined,
    investigationId: row.investigation_id
      ? String(row.investigation_id)
      : undefined,
    enrichment: evidence.enrichment
      ? (evidence.enrichment as AlertEnrichment)
      : undefined,
    entityNetwork: evidence.entityNetwork
      ? (evidence.entityNetwork as AlertEntityNetwork)
      : undefined
  };
}

export const getPublishedInvestigations = cache(
  async (): Promise<Investigation[]> => {
    if (!hasSupabaseConfig()) return demoInvestigations;

    try {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("investigations")
        .select("*")
        .in("status", ["publicado", "atualizado", "aguardando_resposta"])
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(normalizeInvestigation);
    } catch (error) {
      console.error(
        "Falha ao consultar investigações; usando demonstração.",
        error
      );
      return demoInvestigations;
    }
  }
);

export const getAllInvestigations = cache(
  async (): Promise<Investigation[]> => {
    if (!hasSupabaseConfig()) return [];

    try {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("investigations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      return (data ?? []).map(normalizeInvestigation);
    } catch (error) {
      console.error("Falha ao consultar investigações internas.", error);
      return [];
    }
  }
);


export const getInvestigationById = cache(
  async (id: string): Promise<Investigation | null> => {
    if (!hasSupabaseConfig()) return null;

    try {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("investigations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data ? normalizeInvestigation(data) : null;
    } catch (error) {
      console.error("Falha ao consultar investigação interna.", error);
      return null;
    }
  }
);

export const getAlertByInvestigationId = cache(
  async (investigationId: string): Promise<InvestigationAlert | null> => {
    if (!hasSupabaseConfig()) return null;

    try {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("investigation_id", investigationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? normalizeAlert(data) : null;
    } catch (error) {
      console.error("Falha ao localizar alerta vinculado.", error);
      return null;
    }
  }
);

export const getInvestigationBySlug = cache(
  async (slug: string): Promise<Investigation | null> => {
    const investigations = await getPublishedInvestigations();
    return investigations.find((item) => item.slug === slug) ?? null;
  }
);

export const getAlerts = cache(async (): Promise<InvestigationAlert[]> => {
  if (!hasSupabaseConfig()) return demoAlerts;

  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return (data ?? []).map(normalizeAlert);
  } catch (error) {
    console.error("Falha ao consultar alertas; usando demonstração.", error);
    return demoAlerts;
  }
});

export const getAlertById = cache(
  async (id: string): Promise<InvestigationAlert | null> => {
    if (!hasSupabaseConfig()) {
      return demoAlerts.find((item) => item.id === id) ?? null;
    }

    try {
      const supabase = createSupabaseAdmin();
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data ? normalizeAlert(data) : null;
    } catch (error) {
      console.error("Falha ao consultar alerta.", error);
      return null;
    }
  }
);


function emptyAmendmentModule(): AmendmentModuleData {
  return {
    summary: {
      amendmentCount: 0,
      documentCount: 0,
      beneficiaryCount: 0,
      committed: 0,
      liquidated: 0,
      paid: 0,
      restPaid: 0,
      pendingAmendmentCount: 0,
      partialAmendmentCount: 0,
      completeAmendmentCount: 0,
      errorAmendmentCount: 0,
      intermediaryDocumentCount: 0,
      resolvedDocumentCount: 0
    },
    amendments: [],
    beneficiaries: [],
    documents: []
  };
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalString(value: unknown) {
  const normalized = stringValue(value);
  return normalized || undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

async function selectInBatches(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  table: string,
  columns: string,
  field: string,
  values: string[],
  batchSize = 150
) {
  const rows: Record<string, unknown>[] = [];

  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    if (!batch.length) continue;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(field, batch);
    if (error) throw error;

    const batchRows: unknown = data ?? [];

    if (!Array.isArray(batchRows)) continue;

    for (const row of batchRows) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        rows.push(row as Record<string, unknown>);
      }
    }
  }

  return rows;
}

export const getAmendmentModuleByAlertId = cache(
  async (alertId: string): Promise<AmendmentModuleData> => {
    if (!hasSupabaseConfig()) return emptyAmendmentModule();

    try {
      const supabase = createSupabaseAdmin();
      const { data: linkData, error: linkError } = await supabase
        .from("amendment_case_links")
        .select("amendment_id")
        .eq("alert_id", alertId);

      if (linkError) throw linkError;

      const amendmentIds = [
        ...new Set(
          ((linkData ?? []) as Array<Record<string, unknown>>)
            .map((row) => stringValue(row.amendment_id))
            .filter((value): value is string => Boolean(value))
        )
      ];

      if (!amendmentIds.length) return emptyAmendmentModule();

      const amendmentRows = await selectInBatches(
        supabase,
        "parliamentary_amendments",
        "id,external_code,year,author_name,amendment_type,amendment_number,committed,liquidated,paid,rest_paid,localities,functions,subfunctions,documents_status,document_count,beneficiary_count,processed_at,last_error",
        "id",
        amendmentIds
      );

      const documentLinkRows = await selectInBatches(
        supabase,
        "amendment_document_links",
        "amendment_id,document_id",
        "amendment_id",
        amendmentIds
      );

      const documentIds = [
        ...new Set(
          documentLinkRows
            .map((row) => stringValue(row.document_id))
            .filter((value): value is string => Boolean(value))
        )
      ];

      const documentRows = documentIds.length
        ? await selectInBatches(
            supabase,
            "amendment_documents",
            "id,document_code,summarized_code,document_date,year,phase,species,amount,formal_beneficiary_name,formal_beneficiary_tax_id,formal_beneficiary_uf,formal_beneficiary_municipality,formal_beneficiary_is_intermediary",
            "id",
            documentIds
          )
        : [];

      const flowRows = await selectInBatches(
        supabase,
        "amendment_beneficiary_flows",
        "id,amendment_id,document_id,beneficiary_id,role,amount,document_phase,document_date,source_kind",
        "amendment_id",
        amendmentIds
      );

      const beneficiaryIds = [
        ...new Set(
          flowRows
            .map((row) => stringValue(row.beneficiary_id))
            .filter((value): value is string => Boolean(value))
        )
      ];

      const beneficiaryRows = beneficiaryIds.length
        ? await selectInBatches(
            supabase,
            "amendment_beneficiaries",
            "id,name,tax_id,beneficiary_type,uf,municipality",
            "id",
            beneficiaryIds
          )
        : [];

      const amendmentCodeById = new Map(
        amendmentRows.map((row) => [
          stringValue(row.id),
          stringValue(row.external_code)
        ])
      );
      const documentById = new Map(
        documentRows.map((row) => [stringValue(row.id), row])
      );
      const beneficiaryById = new Map(
        beneficiaryRows.map((row) => [stringValue(row.id), row])
      );

      const amendmentIdsByDocument = new Map<string, Set<string>>();
      for (const row of documentLinkRows) {
        const documentId = stringValue(row.document_id);
        const amendmentId = stringValue(row.amendment_id);
        if (!documentId || !amendmentId) continue;
        const set = amendmentIdsByDocument.get(documentId) ?? new Set<string>();
        set.add(amendmentId);
        amendmentIdsByDocument.set(documentId, set);
      }

      const flowsByDocument = new Map<string, Record<string, unknown>[]>();
      const flowsByPair = new Map<string, Record<string, unknown>[]>();
      for (const row of flowRows) {
        const documentId = stringValue(row.document_id);
        const amendmentId = stringValue(row.amendment_id);
        if (!documentId || !amendmentId) continue;

        const documentFlows = flowsByDocument.get(documentId) ?? [];
        documentFlows.push(row);
        flowsByDocument.set(documentId, documentFlows);

        const pairKey = `${amendmentId}|${documentId}`;
        const pairFlows = flowsByPair.get(pairKey) ?? [];
        pairFlows.push(row);
        flowsByPair.set(pairKey, pairFlows);
      }

      const countedFlowIds = new Set<string>();
      for (const pairFlows of flowsByPair.values()) {
        const finalFlows = pairFlows.filter(
          (row) => stringValue(row.role) === "beneficiario_final"
        );
        const formalFlows = pairFlows.filter(
          (row) => stringValue(row.role) === "favorecido_documento"
        );

        for (const row of finalFlows.length ? finalFlows : formalFlows) {
          countedFlowIds.add(stringValue(row.id));
        }
      }

      type BeneficiaryRole =
        | "favorecido_documento"
        | "intermediario_financeiro"
        | "beneficiario_final";

      type BeneficiaryBuilder = {
        id: string;
        name: string;
        taxId?: string;
        type?: string;
        state?: string;
        municipality?: string;
        roles: Set<BeneficiaryRole>;
        totalRelated: number;
        excludedIntermediaryAmount: number;
        documentIds: Set<string>;
        amendmentIds: Set<string>;
        dates: string[];
      };

      const beneficiaryBuilders = new Map<string, BeneficiaryBuilder>();

      for (const flow of flowRows) {
        const beneficiaryId = stringValue(flow.beneficiary_id);
        const beneficiary = beneficiaryById.get(beneficiaryId);
        if (!beneficiary) continue;

        const role = stringValue(flow.role) as BeneficiaryRole;
        if (
          !["favorecido_documento", "intermediario_financeiro", "beneficiario_final"].includes(
            role
          )
        ) {
          continue;
        }

        const current = beneficiaryBuilders.get(beneficiaryId) ?? {
          id: beneficiaryId,
          name: stringValue(beneficiary.name) || "Não identificado",
          taxId: optionalString(beneficiary.tax_id),
          type: optionalString(beneficiary.beneficiary_type),
          state: optionalString(beneficiary.uf),
          municipality: optionalString(beneficiary.municipality),
          roles: new Set(),
          totalRelated: 0,
          excludedIntermediaryAmount: 0,
          documentIds: new Set(),
          amendmentIds: new Set(),
          dates: []
        };

        current.roles.add(role);
        current.documentIds.add(stringValue(flow.document_id));
        current.amendmentIds.add(stringValue(flow.amendment_id));
        const date = stringValue(flow.document_date);
        if (date) current.dates.push(date);

        const amount = numberValue(flow.amount);
        if (countedFlowIds.has(stringValue(flow.id))) {
          current.totalRelated += amount;
        } else if (role === "intermediario_financeiro") {
          current.excludedIntermediaryAmount += amount;
        }

        beneficiaryBuilders.set(beneficiaryId, current);
      }

      const beneficiaries = [...beneficiaryBuilders.values()]
        .map((item) => ({
          id: item.id,
          name: item.name,
          taxId: item.taxId,
          type: item.type,
          state: item.state,
          municipality: item.municipality,
          roles: [...item.roles],
          totalRelated: item.totalRelated,
          excludedIntermediaryAmount: item.excludedIntermediaryAmount,
          documentCount: item.documentIds.size,
          amendmentCount: item.amendmentIds.size,
          firstDate: item.dates.sort()[0],
          lastDate: item.dates.sort().at(-1)
        }))
        .sort(
          (a, b) =>
            b.totalRelated - a.totalRelated ||
            a.name.localeCompare(b.name, "pt-BR")
        );

      const documents = documentRows
        .map((row) => {
          const documentId = stringValue(row.id);
          const flows = flowsByDocument.get(documentId) ?? [];
          const linkedAmendmentIds = amendmentIdsByDocument.get(documentId) ?? new Set();

          return {
            id: documentId,
            code: stringValue(row.document_code),
            summarizedCode: optionalString(row.summarized_code),
            date: optionalString(row.document_date),
            year: row.year ? numberValue(row.year) : undefined,
            phase: optionalString(row.phase),
            species: optionalString(row.species),
            amount:
              row.amount === null || row.amount === undefined
                ? undefined
                : numberValue(row.amount),
            formalBeneficiaryName: optionalString(row.formal_beneficiary_name),
            formalBeneficiaryTaxId: optionalString(row.formal_beneficiary_tax_id),
            formalBeneficiaryState: optionalString(row.formal_beneficiary_uf),
            formalBeneficiaryMunicipality: optionalString(
              row.formal_beneficiary_municipality
            ),
            formalBeneficiaryIsIntermediary: Boolean(
              row.formal_beneficiary_is_intermediary
            ),
            amendmentCodes: [...linkedAmendmentIds]
              .map((id) => amendmentCodeById.get(id) ?? "")
              .filter(Boolean),
            beneficiaries: flows
              .map((flow) => {
                const beneficiary = beneficiaryById.get(
                  stringValue(flow.beneficiary_id)
                );
                if (!beneficiary) return null;
                return {
                  id: stringValue(beneficiary.id),
                  name: stringValue(beneficiary.name) || "Não identificado",
                  taxId: optionalString(beneficiary.tax_id),
                  role: stringValue(flow.role) as
                    | "favorecido_documento"
                    | "intermediario_financeiro"
                    | "beneficiario_final",
                  amount:
                    flow.amount === null || flow.amount === undefined
                      ? undefined
                      : numberValue(flow.amount)
                };
              })
              .filter(
                (item): item is NonNullable<typeof item> => Boolean(item)
              )
          };
        })
        .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

      const amendments = amendmentRows
        .map((row) => ({
          id: stringValue(row.id),
          code: stringValue(row.external_code),
          year: numberValue(row.year),
          authorName: stringValue(row.author_name),
          type: optionalString(row.amendment_type),
          number: optionalString(row.amendment_number),
          committed: numberValue(row.committed),
          liquidated: numberValue(row.liquidated),
          paid: numberValue(row.paid),
          restPaid: numberValue(row.rest_paid),
          localities: stringArray(row.localities),
          functions: stringArray(row.functions),
          subfunctions: stringArray(row.subfunctions),
          processingStatus: stringValue(row.documents_status) as
            | "pending"
            | "partial"
            | "complete"
            | "error",
          documentCount: numberValue(row.document_count),
          beneficiaryCount: numberValue(row.beneficiary_count),
          processedAt: optionalString(row.processed_at),
          lastError: optionalString(row.last_error)
        }))
        .sort(
          (a, b) =>
            b.paid - a.paid ||
            b.liquidated - a.liquidated ||
            b.committed - a.committed
        );

      const summary = {
        amendmentCount: amendments.length,
        documentCount: documents.length,
        beneficiaryCount: beneficiaries.length,
        committed: amendments.reduce((total, item) => total + item.committed, 0),
        liquidated: amendments.reduce((total, item) => total + item.liquidated, 0),
        paid: amendments.reduce((total, item) => total + item.paid, 0),
        restPaid: amendments.reduce((total, item) => total + item.restPaid, 0),
        pendingAmendmentCount: amendments.filter(
          (item) => item.processingStatus === "pending"
        ).length,
        partialAmendmentCount: amendments.filter(
          (item) => item.processingStatus === "partial"
        ).length,
        completeAmendmentCount: amendments.filter(
          (item) => item.processingStatus === "complete"
        ).length,
        errorAmendmentCount: amendments.filter(
          (item) => item.processingStatus === "error"
        ).length,
        intermediaryDocumentCount: documents.filter(
          (item) => item.formalBeneficiaryIsIntermediary
        ).length,
        resolvedDocumentCount: documents.filter((item) =>
          item.beneficiaries.some(
            (beneficiary) => beneficiary.role === "beneficiario_final"
          ) ||
          Boolean(
            item.formalBeneficiaryName && !item.formalBeneficiaryIsIntermediary
          )
        ).length
      };

      return { summary, amendments, beneficiaries, documents };
    } catch (error) {
      console.error("Falha ao consultar o módulo de emendas.", error);
      return emptyAmendmentModule();
    }
  }
);
