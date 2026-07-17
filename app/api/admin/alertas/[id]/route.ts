import { NextResponse } from "next/server";
import { z } from "zod";
import { syncInvestigationFromEntityNetwork } from "@/lib/investigation-network-sync";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type { AlertEntityNetwork } from "@/lib/types";

const inputSchema = z.object({
  action: z.enum(["save", "convert"]),
  status: z.enum(["novo", "em_revisao", "descartado", "convertido"]),
  reviewerNotes: z.string().max(20_000).default("")
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function sourceUrlsFromEvidence(evidence: Record<string, unknown>) {
  const urls = new Set<string>();

  function walk(value: unknown) {
    if (!value) return;

    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) urls.add(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  }

  const originalEvidence = { ...evidence };
  delete originalEvidence.enrichment;
  delete originalEvidence.entityNetwork;
  walk(originalEvidence);

  return [...urls].map((url, index) => ({
    title: `Documento automático ${index + 1}`,
    publisher: new URL(url).hostname,
    url,
    kind: "dado_oficial",
    accessedAt: new Date().toISOString().slice(0, 10),
    note: "Fonte localizada automaticamente nos dados brutos do alerta."
  }));
}

function factsFromEvidence(evidence: Record<string, unknown>) {
  const preferred = [
    ["Categoria", evidence.category],
    ["Total da categoria", evidence.categoryTotal],
    ["Total do fornecedor", evidence.supplierTotal],
    ["Participação", evidence.share],
    ["Quantidade de documentos", evidence.documentCount],
    ["CNPJ/CPF do fornecedor", evidence.supplierTaxId],
    ["Número do documento", evidence.documentNumber],
    ["Data do documento", evidence.documentDate],
    ["Valor individual", evidence.individualValue],
    ["Quantidade de ocorrências", evidence.count],
    ["Mediana da categoria", evidence.median],
    ["Limite estatístico", evidence.threshold]
  ];

  return preferred
    .filter(
      ([, value]) =>
        value !== undefined && value !== null && value !== ""
    )
    .map(([label, value]) => ({
      label,
      value: String(value),
      detail:
        "Dado extraído automaticamente. Exige confirmação documental."
    }));
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { message: "Supabase não configurado." },
        { status: 503 }
      );
    }

    const { id } = await context.params;
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

    const input = parsed.data;

    if (input.action === "save") {
      const { error } = await supabase
        .from("alerts")
        .update({
          status: input.status,
          reviewer_notes: input.reviewerNotes
        })
        .eq("id", id);

      if (error) throw error;

      await supabase.from("editorial_audit_log").insert({
        entity_type: "alert",
        entity_id: id,
        action: "review_updated",
        actor: process.env.ADMIN_USER ?? "editor",
        before_data: {
          status: alert.status,
          reviewer_notes: alert.reviewer_notes
        },
        after_data: {
          status: input.status,
          reviewer_notes: input.reviewerNotes
        }
      });

      return NextResponse.json({ message: "Revisão salva." });
    }

    if (alert.investigation_id) {
      return NextResponse.json(
        {
          message: "Este alerta já foi convertido.",
          investigationId: alert.investigation_id
        },
        { status: 409 }
      );
    }

    const evidence =
      alert.evidence && typeof alert.evidence === "object"
        ? (alert.evidence as Record<string, unknown>)
        : {};

    const title = `${alert.deputy_name ?? "Parlamentar"}: ${alert.title}`;
    const slugBase = slugify(
      `${alert.deputy_name ?? "parlamentar"}-${alert.title}`
    );
    const slug = `${slugBase}-${String(
      alert.external_id ?? id
    ).slice(0, 8)}`;

    const entities = [
      alert.deputy_name
        ? {
            name: alert.deputy_name,
            type: "pessoa",
            role: "Parlamentar citado no alerta"
          }
        : null,
      alert.supplier_name
        ? {
            name: alert.supplier_name,
            type: "empresa",
            role: "Fornecedor relacionado aos registros"
          }
        : null
    ].filter(Boolean);

    const sources = sourceUrlsFromEvidence(evidence);
    const facts = factsFromEvidence(evidence);

    const { data: investigation, error: investigationError } =
      await supabase
        .from("investigations")
        .insert({
          slug,
          title,
          summary:
            "Pista gerada por cruzamento automático de despesas da Câmara. O registro foi encaminhado para apuração humana antes de qualquer publicação.",
          finding:
            `${alert.rule}. O alerta estatístico não comprova irregularidade e deve ser confrontado com documentos, contexto, justificativas e eventual resposta dos citados.`,
          category: "despesas",
          status: "em_apuracao",
          confidence: "pista",
          involved_amount: alert.amount ?? null,
          is_featured: false,
          is_demo: false,
          tags: ["alerta-automatico", "57-legislatura", "despesas"],
          entities,
          facts,
          sources,
          timeline: [
            {
              date: new Date().toISOString().slice(0, 10),
              title: "Alerta convertido em investigação",
              description:
                "A pista automática foi incorporada à fila editorial para apuração humana."
            }
          ],
          responses: [],
          methodology:
            "A investigação nasceu de regra automatizada aplicada aos registros de despesas da Câmara. A redação deve reproduzir o cálculo, conferir os documentos originais, buscar hipóteses legítimas e solicitar manifestação dos citados.",
          caveat:
            "Este registro é apenas uma pista interna. Concentração de fornecedor, valor elevado ou repetição aparente não demonstram, isoladamente, ilegalidade ou desvio.",
          created_by: process.env.ADMIN_USER ?? "editor"
        })
        .select("id")
        .single();

    if (investigationError) throw investigationError;

    const { error: updateError } = await supabase
      .from("alerts")
      .update({
        status: "convertido",
        reviewer_notes: input.reviewerNotes,
        investigation_id: investigation.id
      })
      .eq("id", id);

    if (updateError) throw updateError;

    const network =
      evidence.entityNetwork &&
      typeof evidence.entityNetwork === "object"
        ? (evidence.entityNetwork as AlertEntityNetwork)
        : undefined;

    const investigationSync = network
      ? await syncInvestigationFromEntityNetwork({
          supabase,
          investigationId: investigation.id,
          alertId: id,
          network
        })
      : undefined;

    await supabase.from("editorial_audit_log").insert([
      {
        entity_type: "investigation",
        entity_id: investigation.id,
        action: "created_from_alert",
        actor: process.env.ADMIN_USER ?? "editor",
        before_data: null,
        after_data: {
          alert_id: id,
          title,
          status: "em_apuracao",
          entity_network_synced: Boolean(investigationSync)
        }
      },
      {
        entity_type: "alert",
        entity_id: id,
        action: "converted",
        actor: process.env.ADMIN_USER ?? "editor",
        before_data: {
          status: alert.status,
          investigation_id: alert.investigation_id
        },
        after_data: {
          status: "convertido",
          investigation_id: investigation.id
        }
      }
    ]);

    return NextResponse.json({
      message: investigationSync
        ? "Alerta convertido e rede sincronizada com a investigação."
        : "Alerta convertido em investigação.",
      investigationId: investigation.id
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Não foi possível processar o alerta." },
      { status: 500 }
    );
  }
}
