import { NextResponse } from "next/server";
import { createSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase-admin";
import { tipSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = tipSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }
    if (parsed.data.website) return NextResponse.json({ message: "Pista recebida." });
    if (!hasSupabaseConfig()) {
      return NextResponse.json({ message: "O canal ainda não está conectado ao banco. Configure o Supabase antes de receber pistas." }, { status: 503 });
    }
    const supabase = createSupabaseAdmin();
    const sourceUrls = (parsed.data.sourceUrls ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const { error } = await supabase.from("tips").insert({
      name: parsed.data.name || null,
      email: parsed.data.email || null,
      title: parsed.data.title,
      description: parsed.data.description,
      source_urls: sourceUrls,
      status: "nova",
      metadata: { user_agent: request.headers.get("user-agent") }
    });
    if (error) throw error;
    return NextResponse.json({ message: "Pista recebida. Ela será verificada antes de qualquer publicação." }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Não foi possível receber a pista agora." }, { status: 500 });
  }
}
