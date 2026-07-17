import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildEntityNetwork } from "@/lib/entity-network";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type { AlertEntityNetwork, AlertManualEntity } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const entitySchema = z.object({
  name: z.string().trim().min(2).max(220),
  type: z.enum(["pessoa", "empresa", "imovel", "orgao"]),
  role: z.string().trim().min(3).max(180),
  taxId: z.string().trim().max(18).optional().or(z.literal("")),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  sourceNote: z.string().trim().min(10).max(3000),
  verification: z.enum(["documento", "nao_verificado"])
});

const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    entity: entitySchema
  }),
  z.object({
    action: z.literal("remove"),
    entityId: z.string().min(1)
  }),
  z.object({
    action: z.literal("rebuild")
  })
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function storedManualEntities(evidence: Record<string, unknown>) {
  const network =
    evidence.entityNetwork &&
    typeof evidence.entityNetwork === "object"
      ? (evidence.entityNetwork as AlertEntityNetwork)
      : undefined;

  return Array.isArray(network?.manualEntities)
    ? network.manualEntities
    : [];
}

export async function POST(request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { message: "Supabase não configurado." },
        { status: 503 }
      );
    }

    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            parsed.error.issues[0]?.message ?? "Dados inválidos."
        },
        { status: 400 }
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

    let manualEntities = storedManualEntities(evidence);
    const input = parsed.data;

    if (input.action === "add") {
      const taxId = input.entity.taxId?.replace(/\D/g, "") || undefined;

      const duplicate = manualEntities.some((entity) =>
        taxId
          ? entity.taxId?.replace(/\D/g, "") === taxId
          : entity.type === input.entity.type &&
            entity.name.localeCompare(input.entity.name, "pt-BR", {
              sensitivity: "base"
            }) === 0
      );

      if (duplicate) {
        return NextResponse.json(
          {
            message:
              "Essa parte já foi registrada. Edite a fonte existente ou remova antes de adicionar novamente."
          },
          { status: 409 }
        );
      }

      const entity: AlertManualEntity = {
        id: randomUUID(),
        name: input.entity.name,
        type: input.entity.type,
        role: input.entity.role,
        taxId,
        sourceUrl: input.entity.sourceUrl || undefined,
        sourceNote: input.entity.sourceNote,
        verification: input.entity.verification,
        addedAt: new Date().toISOString()
      };

      manualEntities = [...manualEntities, entity];
    }

    if (input.action === "remove") {
      manualEntities = manualEntities.filter(
        (entity) => entity.id !== input.entityId
      );
    }

    const network = await buildEntityNetwork({
      alertId: id,
      deputyName: alert.deputy_name ?? undefined,
      supplierName: alert.supplier_name ?? undefined,
      evidence,
      manualEntities
    });

    const nextEvidence = {
      ...evidence,
      entityNetwork: network
    };

    const nextStatus =
      alert.status === "novo" ? "em_revisao" : alert.status;

    const { error: updateError } = await supabase
      .from("alerts")
      .update({
        evidence: nextEvidence,
        status: nextStatus
      })
      .eq("id", id);

    if (updateError) throw updateError;

    await supabase.from("editorial_audit_log").insert({
      entity_type: "alert",
      entity_id: id,
      action: `entity_network_${input.action}`,
      actor: process.env.ADMIN_USER ?? "editor",
      before_data: {
        manual_entities: storedManualEntities(evidence).length,
        had_network: Boolean(evidence.entityNetwork)
      },
      after_data: {
        manual_entities: manualEntities.length,
        entities: network.entities.length,
        relations: network.relations.length,
        generated_at: network.generatedAt
      }
    });

    return NextResponse.json({
      message:
        input.action === "add"
          ? "Parte adicionada e rede recalculada."
          : input.action === "remove"
            ? "Parte removida e rede recalculada."
            : "Rede de entidades recalculada.",
      network
    });
  } catch (error) {
    console.error("Falha ao atualizar rede de entidades:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Não foi possível atualizar a rede: ${error.message}`
            : "Não foi possível atualizar a rede."
      },
      { status: 500 }
    );
  }
}
