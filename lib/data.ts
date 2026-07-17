import "server-only";
import { cache } from "react";
import { demoAlerts, demoInvestigations } from "@/lib/demo-data";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type {
  AlertEnrichment,
  AlertEntityNetwork,
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
