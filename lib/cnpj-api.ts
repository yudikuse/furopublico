import "server-only";

export type CompanyProfile = {
  source: "BrasilAPI";
  taxId: string;
  legalName?: string;
  tradeName?: string;
  status?: string;
  openingDate?: string;
  mainActivity?: string;
  legalNature?: string;
  size?: string;
  capital?: number;
  address?: string;
  municipality?: string;
  state?: string;
  partners: Array<{ name: string; qualification?: string }>;
  raw: Record<string, unknown>;
};

function cleanTaxId(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

export async function fetchCompanyProfile(taxId: string) {
  const clean = cleanTaxId(taxId);
  if (clean.length !== 14) return null;

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(18_000)
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`BrasilAPI respondeu HTTP ${response.status}`);

  const raw = (await response.json()) as Record<string, unknown>;
  const partnersRaw = Array.isArray(raw.qsa) ? raw.qsa : [];
  const partners: Array<{ name: string; qualification?: string }> = [];

  for (const item of partnersRaw) {
    const row = item as Record<string, unknown>;
    const name = text(row.nome_socio ?? row.nome);
    if (!name) continue;
    const qualification = text(row.qualificacao_socio ?? row.qual);
    partners.push(qualification ? { name, qualification } : { name });
  }

  const addressParts = [
    raw.descricao_tipo_de_logradouro,
    raw.logradouro,
    raw.numero,
    raw.complemento,
    raw.bairro
  ]
    .map(text)
    .filter(Boolean);

  return {
    source: "BrasilAPI" as const,
    taxId: clean,
    legalName: text(raw.razao_social ?? raw.nome),
    tradeName: text(raw.nome_fantasia ?? raw.fantasia),
    status: text(raw.descricao_situacao_cadastral ?? raw.situacao),
    openingDate: text(raw.data_inicio_atividade ?? raw.abertura),
    mainActivity: text(raw.cnae_fiscal_descricao),
    legalNature: text(raw.natureza_juridica),
    size: text(raw.porte),
    capital: numberOrUndefined(raw.capital_social),
    address: addressParts.length ? addressParts.join(", ") : undefined,
    municipality: text(raw.municipio),
    state: text(raw.uf),
    partners,
    raw
  } satisfies CompanyProfile;
}
