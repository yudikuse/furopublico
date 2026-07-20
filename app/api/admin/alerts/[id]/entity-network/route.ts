import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildEntityNetwork } from "@/lib/entity-network";
import type { AlertManualEntity, AlertEntityType } from "@/lib/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RequestBody =
  | { action?: "recalculate" }
  | {
      action: "add_manual";
      entity?: {
        name?: string;
        type?: AlertEntityType;
        role?: string;
        taxId?: string;
        sourceUrl?: string;
        sourceNote?: string;
        verification?: "documento" | "nao_verificado";
      };
    }
  | { action: "remove_manual"; entityId?: string };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanTaxId(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function validUrl(value: unknown) {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function existingManualEntities(evidence: Record<string, unknown>) {
  const network = asRecord(evidence.entityNetwork);
  return Array.isArray(network.manualEntities)
    ? network.manualEntities.filter(
        (item): item is AlertManualEntity =>
          Boolean(item && typeof item === "object" && "id" in item)
      )
    : [];
}

async function rebuild(
  alertId: string,
  body: RequestBody,
  requestUrl: string
) {
  const supabase = adminClient();
  const { data: alert, error } = await supabase
    .from("alerts")
    .select(
      "id,deputy_name,supplier_name,evidence,investigation_id,status"
    )
    .eq("id", alertId)
    .single();

  if (error || !alert) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Caso não encontrado." },
      { status: 404 }
    );
  }

  const evidence = asRecord(alert.evidence);
  let manualEntities = existingManualEntities(evidence);

  if (body.action === "add_manual") {
    const input = body.entity ?? {};
    const type: AlertEntityType = ["pessoa", "empresa", "imovel", "orgao"].includes(
      String(input.type)
    )
      ? (input.type as AlertEntityType)
      : "empresa";
    const taxId = cleanTaxId(input.taxId);
    const name = String(input.name ?? "").trim();
    const role = String(input.role ?? "").trim();
    const sourceNote = String(input.sourceNote ?? "").trim();
    const sourceUrl = validUrl(input.sourceUrl);

    if (!role) {
      return NextResponse.json(
        { ok: false, error: "Informe o papel exato da parte no documento." },
        { status: 400 }
      );
    }

    if (!sourceNote) {
      return NextResponse.json(
        { ok: false, error: "Informe o trecho ou fundamento documental." },
        { status: 400 }
      );
    }

    if (!sourceUrl) {
      return NextResponse.json(
        { ok: false, error: "Informe uma fonte documental válida." },
        { status: 400 }
      );
    }

    if (!name && !(type === "empresa" && taxId.length === 14)) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome da parte encontrada." },
        { status: 400 }
      );
    }

    const duplicate = manualEntities.some((item) => {
      const sameTaxId = taxId && cleanTaxId(item.taxId) === taxId;
      const sameName =
        name && item.name.trim().toLocaleLowerCase("pt-BR") ===
          name.toLocaleLowerCase("pt-BR");
      return (sameTaxId || sameName) && item.role === role;
    });

    if (!duplicate) {
      manualEntities = [
        ...manualEntities,
        {
          id: `manual-${randomUUID()}`,
          name: name || taxId,
          type,
          role,
          taxId: taxId || undefined,
          sourceUrl,
          sourceNote,
          verification:
            input.verification === "nao_verificado"
              ? "nao_verificado"
              : "documento",
          addedAt: new Date().toISOString()
        }
      ];
    }
  }

  if (body.action === "remove_manual") {
    const entityId = String(body.entityId ?? "").trim();
    manualEntities = manualEntities.filter((item) => item.id !== entityId);
  }

  const network = await buildEntityNetwork({
    alertId: alert.id,
    deputyName: alert.deputy_name ?? undefined,
    supplierName: alert.supplier_name ?? undefined,
    evidence,
    manualEntities
  });

  const nextEvidence = {
    ...evidence,
    entityNetwork: network
  };

  const { error: updateError } = await supabase
    .from("alerts")
    .update({ evidence: nextEvidence })
    .eq("id", alert.id);

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    network,
    message:
      body.action === "add_manual"
        ? "Parte adicional registrada e rede recalculada."
        : body.action === "remove_manual"
          ? "Parte adicional removida e rede recalculada."
          : "Rede automática atualizada.",
    requestUrl
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    return await rebuild(id, body, request.url);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
