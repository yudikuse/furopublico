import { NextResponse } from "next/server";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import { investigationInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = investigationInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    if (!hasSupabaseConfig()) return NextResponse.json({ message: "Configure o Supabase para salvar investigações." }, { status: 503 });

    const input = parsed.data;
    const sources = input.sourceUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).map((url, index) => ({
      title: `Fonte ${index + 1}`,
      publisher: new URL(url).hostname,
      url,
      kind: "documento",
      accessedAt: new Date().toISOString().slice(0, 10)
    }));
    const status = input.publishNow ? "publicado" : input.status === "publicado" ? "em_apuracao" : input.status;
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("investigations").insert({
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      finding: input.finding,
      category: input.category,
      status,
      confidence: input.confidence,
      state: input.state || null,
      municipality: input.municipality || null,
      involved_amount: input.involvedAmount ?? null,
      published_at: input.publishNow ? new Date().toISOString() : null,
      is_featured: input.isFeatured,
      is_demo: false,
      tags: (input.tags ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      entities: [],
      facts: [],
      sources,
      timeline: [{ date: new Date().toISOString().slice(0, 10), title: "Registro criado", description: "Investigação adicionada à redação." }],
      responses: [],
      methodology: input.methodology,
      caveat: input.caveat
    });
    if (error) throw error;
    return NextResponse.json({ message: "Investigação salva.", slug: input.slug }, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = error instanceof TypeError ? "Uma das URLs de fonte é inválida." : "Não foi possível salvar a investigação.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
