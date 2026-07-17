import { NextResponse } from "next/server";
import { buildAlertEnrichment } from "@/lib/alert-enrichment";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { message: "Supabase não configurado." },
        { status: 503 }
      );
    }

    const { id } = await context.params;
    const supabase = createSupabaseAdmin();
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (alertError) throw alertError;
    if (!alert) {
      return NextResponse.json(
        { message: "Alerta não encontrado." },
        { status: 404 }
      );
    }

    const evidence =
      alert.evidence && typeof alert.evidence === "object"
        ? (alert.evidence as Record<string, unknown>)
        : {};

    const enrichment = await buildAlertEnrichment({
      alertId: id,
      deputyName: alert.deputy_name ?? undefined,
      supplierName: alert.supplier_name ?? undefined,
      amount:
        alert.amount === null || alert.amount === undefined
          ? undefined
          : Number(alert.amount),
      evidence
    });

    const nextEvidence = {
      ...evidence,
      enrichment
    };

    const nextStatus = alert.status === "novo" ? "em_revisao" : alert.status;
    const { error: updateError } = await supabase
      .from("alerts")
      .update({ evidence: nextEvidence, status: nextStatus })
      .eq("id", id);

    if (updateError) throw updateError;

    await supabase.from("editorial_audit_log").insert({
      entity_type: "alert",
      entity_id: id,
      action: "automatic_enrichment",
      actor: process.env.ADMIN_USER ?? "editor",
      before_data: {
        status: alert.status,
        had_enrichment: Boolean(evidence.enrichment)
      },
      after_data: {
        status: nextStatus,
        generated_at: enrichment.generatedAt,
        flags: enrichment.flags.length,
        supplier_total: enrichment.history.sameSupplierTotal
      }
    });

    return NextResponse.json({
      message: "Dossiê automático atualizado.",
      enrichment
    });
  } catch (error) {
    console.error("Falha no enriquecimento do alerta:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Não foi possível enriquecer o alerta: ${error.message}`
            : "Não foi possível enriquecer o alerta."
      },
      { status: 500 }
    );
  }
}
