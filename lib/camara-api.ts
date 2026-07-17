import "server-only";

const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

function userAgent() {
  return process.env.DATA_USER_AGENT ?? "FuroPublico/0.2 github.com/yudikuse/furopublico";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function fetchJson(url: string, timeout = 25_000) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent()
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeout)
  });

  if (!response.ok) {
    throw new Error(`Câmara respondeu HTTP ${response.status}`);
  }

  return (await response.json()) as {
    dados?: unknown[];
    links?: Array<{ rel?: string; href?: string }>;
  };
}

export async function fetchAllCamaraPages(initialUrl: string) {
  const rows: Record<string, unknown>[] = [];
  let nextUrl: string | null = initialUrl;
  let pages = 0;

  while (nextUrl && pages < 80) {
    pages += 1;
    const payload = await fetchJson(nextUrl);
    const data = Array.isArray(payload.dados) ? payload.dados : [];
    rows.push(...(data as Record<string, unknown>[]));

    const next = Array.isArray(payload.links)
      ? payload.links.find((link) => link.rel === "next")?.href
      : undefined;

    nextUrl = next ? new URL(next, API_BASE).toString() : null;
  }

  return rows;
}

export async function findDeputyIdByName(name: string) {
  const url = new URL(`${API_BASE}/deputados`);
  url.searchParams.set("nome", name);
  url.searchParams.set("idLegislatura", "57");
  url.searchParams.set("itens", "100");
  url.searchParams.set("ordem", "ASC");
  url.searchParams.set("ordenarPor", "nome");

  const payload = await fetchJson(url.toString());
  const rows = Array.isArray(payload.dados)
    ? (payload.dados as Record<string, unknown>[])
    : [];

  const target = normalizeText(name);
  const exact = rows.find((row) => normalizeText(String(row.nome ?? "")) === target);
  const selected = exact ?? rows[0];

  return selected?.id ? String(selected.id) : null;
}

export async function fetchDeputyExpenses(deputyId: string, years: number[]) {
  const results = await Promise.all(
    years.map(async (year) => {
      const url = new URL(`${API_BASE}/deputados/${deputyId}/despesas`);
      url.searchParams.set("ano", String(year));
      url.searchParams.set("itens", "100");
      url.searchParams.set("pagina", "1");
      url.searchParams.set("ordem", "ASC");
      url.searchParams.set("ordenarPor", "dataDocumento");

      try {
        const data = await fetchAllCamaraPages(url.toString());
        return { year, data, error: null as string | null };
      } catch (error) {
        return {
          year,
          data: [] as Record<string, unknown>[],
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  return {
    rows: results.flatMap((item) => item.data),
    errors: results
      .filter((item) => item.error)
      .map((item) => `${item.year}: ${item.error}`)
  };
}
