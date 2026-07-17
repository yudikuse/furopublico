import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import type {
  EvidenceSource,
  InvestigationResponse,
  InvestigationTimelineItem
} from "@/lib/types";

export const runtime = "nodejs";

const allStatuses = [
  "triagem",
  "em_apuracao",
  "aguardando_resposta",
  "publicado",
  "atualizado",
  "arquivado"
] as const;

const saveSchema = z.object({
  action: z.literal("save"),
  title: z.string().trim().min(12).max(220),
  summary: z.string().trim().min(40).max(8000),
  finding: z.string().trim().min(40).max(12000),
  status: z.enum(allStatuses),
  confidence: z.enum(["pista", "cruzamento", "documental"]),
  involvedAmount: z.number().nonnegative().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
  methodology: z.string().trim().min(30).max(12000),
  caveat: z.string().trim().min(20).max(12000)
});

const sourceSchema = z.object({
  action: z.literal("add_source"),
  source: z.object({
    title: z.string().trim().min(4).max(220),
    publisher: z.string().trim().min(2).max(160),
    url: z.string().trim().url(),
    kind: z.enum([
      "dado_oficial",
      "documento",
      "declaracao",
      "resposta",
      "verificacao_local"
    ]),
    note: z.string().trim().max(1500).optional().default("")
  })
});

const timelineSchema = z.object({
  action: z.literal("add_timeline"),
  item: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    title: z.string().trim().min(4).max(180),
    description: z.string().trim().min(10).max(3000)
  })
});

const responseSchema = z.object({
  action: z.literal("add_response"),
  response: z.object({
    author: z.string().trim().min(2).max(180),
    receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    content: z.string().trim().min(10).max(12000),
    sourceUrl: z.string().trim().url().optional().or(z.literal(""))
  })
});

const inputSchema = z.discriminatedUnion("action", [
  saveSchema,
  sourceSchema,
  timelineSchema,
  responseSchema
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function PATCH(request: Request, context: RouteContext) {
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

    const { data: investigation, error } = await supabase
      .from("investigations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    if (!investigation) {
      return NextResponse.json(
        { message: "Investigação não encontrada." },
        { status: 404 }
      );
    }

    const input = parsed.data;
    const actor = process.env.ADMIN_USER ?? "editor";

    if (input.action === "save") {
      const publicStatuses = new Set([
        "aguardando_resposta",
        "publicado",
        "atualizado"
      ]);

      if (
        publicStatuses.has(input.status) &&
        input.status !== investigation.status
      ) {
        return NextResponse.json(
          {
            message:
              "Esta tela não altera um caso para status público. Use a etapa editorial de publicação."
          },
          { status: 409 }
        );
      }

      const { error: updateError } = await supabase
        .from("investigations")
        .update({
          title: input.title,
          summary: input.summary,
          finding: input.finding,
          status: input.status,
          confidence: input.confidence,
          involved_amount: input.involvedAmount,
          tags: [...new Set(input.tags)],
          methodology: input.methodology,
          caveat: input.caveat
        })
        .eq("id", id);

      if (updateError) throw updateError;

      await supabase.from("editorial_audit_log").insert({
        entity_type: "investigation",
        entity_id: id,
        action: "editorial_fields_updated",
        actor,
        before_data: {
          title: investigation.title,
          status: investigation.status,
          confidence: investigation.confidence,
          involved_amount: investigation.involved_amount
        },
        after_data: {
          title: input.title,
          status: input.status,
          confidence: input.confidence,
          involved_amount: input.involvedAmount
        }
      });

      return NextResponse.json({
        message: "Investigação salva."
      });
    }

    if (input.action === "add_source") {
      const sources = arrayOrEmpty<EvidenceSource>(
        investigation.sources
      );

      if (sources.some((source) => source.url === input.source.url)) {
        return NextResponse.json(
          { message: "Essa URL já está vinculada à investigação." },
          { status: 409 }
        );
      }

      const source: EvidenceSource = {
        title: input.source.title,
        publisher: input.source.publisher,
        url: input.source.url,
        kind: input.source.kind,
        accessedAt: new Date().toISOString().slice(0, 10),
        note: input.source.note || undefined
      };

      const { error: updateError } = await supabase
        .from("investigations")
        .update({ sources: [...sources, source] })
        .eq("id", id);

      if (updateError) throw updateError;

      await supabase.from("editorial_audit_log").insert({
        entity_type: "investigation",
        entity_id: id,
        action: "source_added",
        actor,
        before_data: { source_count: sources.length },
        after_data: { source_count: sources.length + 1, source }
      });

      return NextResponse.json({ message: "Fonte adicionada." });
    }

    if (input.action === "add_timeline") {
      const timeline = arrayOrEmpty<InvestigationTimelineItem>(
        investigation.timeline
      );

      const item: InvestigationTimelineItem = input.item;

      const { error: updateError } = await supabase
        .from("investigations")
        .update({ timeline: [...timeline, item] })
        .eq("id", id);

      if (updateError) throw updateError;

      await supabase.from("editorial_audit_log").insert({
        entity_type: "investigation",
        entity_id: id,
        action: "timeline_item_added",
        actor,
        before_data: { item_count: timeline.length },
        after_data: { item_count: timeline.length + 1, item }
      });

      return NextResponse.json({
        message: "Evento adicionado à linha do tempo."
      });
    }

    const responses = arrayOrEmpty<InvestigationResponse>(
      investigation.responses
    );

    const response: InvestigationResponse = {
      author: input.response.author,
      receivedAt: input.response.receivedAt,
      content: input.response.content,
      sourceUrl: input.response.sourceUrl || undefined
    };

    const { error: updateError } = await supabase
      .from("investigations")
      .update({ responses: [...responses, response] })
      .eq("id", id);

    if (updateError) throw updateError;

    await supabase.from("editorial_audit_log").insert({
      entity_type: "investigation",
      entity_id: id,
      action: "response_added",
      actor,
      before_data: { response_count: responses.length },
      after_data: {
        response_count: responses.length + 1,
        author: response.author,
        received_at: response.receivedAt
      }
    });

    return NextResponse.json({
      message: "Manifestação registrada."
    });
  } catch (error) {
    console.error("Falha ao atualizar investigação:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `Não foi possível atualizar: ${error.message}`
            : "Não foi possível atualizar a investigação."
      },
      { status: 500 }
    );
  }
}
