import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_HOSTS = new Set([
  "www.camara.leg.br",
  "www2.camara.leg.br",
  "dadosabertos.camara.leg.br"
]);

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.OFFICE_BUDGET_SYNC_TOKEN;
  if (!expectedToken) {
    return unauthorized("OFFICE_BUDGET_SYNC_TOKEN não configurado na Vercel.", 503);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization !== `Bearer ${expectedToken}`) {
    return unauthorized("Token inválido.");
  }

  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return unauthorized("Informe o parâmetro url.", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return unauthorized("URL inválida.", 400);
  }

  if (!["https:", "http:"].includes(parsed.protocol) || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return unauthorized("Fonte não autorizada.", 403);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "FuroPublico/3.0 (+monitoramento jornalistico; transporte Vercel)",
        accept: "text/html,application/json,text/csv,application/octet-stream,*/*"
      }
    });

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "no-store",
        "x-furo-publico-source-url": parsed.toString()
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: `Falha ao consultar a Câmara: ${message}` },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
