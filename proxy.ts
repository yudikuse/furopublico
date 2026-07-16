import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorized(message = "Autenticação necessária") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Furo Público — Redação", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}

export function proxy(request: NextRequest) {
  const configuredUser = process.env.ADMIN_USER;
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredUser || !configuredPassword) {
    return new NextResponse(
      "Painel administrativo não configurado. Cadastre ADMIN_USER e ADMIN_PASSWORD na Vercel.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    if (user !== configuredUser || password !== configuredPassword) {
      return unauthorized("Usuário ou senha inválidos");
    }

    return NextResponse.next();
  } catch {
    return unauthorized("Credenciais inválidas");
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
