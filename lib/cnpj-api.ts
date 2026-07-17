import "server-only";

export type CompanyProfile = {
  source: "BrasilAPI" | "CNPJ.ws" | "OpenCNPJ";
  sourceUrl: string;
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
  dataUpdatedAt?: string;
  warning: string;
  raw: Record<string, unknown>;
};

function cleanTaxId(value: string) {
  return value.replace(/\D/g, "");
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value).trim() || undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedText(value: unknown, keys: string[]) {
  const row = record(value);
  if (!row) return undefined;
  for (const key of keys) {
    const found = text(row[key]);
    if (found) return found;
  }
  return undefined;
}

async function requestJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(18_000)
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

function brasilApiProfile(
  clean: string,
  raw: Record<string, unknown>
): CompanyProfile {
  const partnersRaw = Array.isArray(raw.qsa) ? raw.qsa : [];
  const partners: CompanyProfile["partners"] = [];

  for (const item of partnersRaw) {
    const row = record(item);
    if (!row) continue;
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
    source: "BrasilAPI",
    sourceUrl: `https://brasilapi.com.br/api/cnpj/v1/${clean}`,
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
    warning:
      "Consulta derivada de dados públicos. Confirme situação cadastral, quadro societário e alterações em fonte oficial antes de publicar.",
    raw
  };
}

function cnpjWsProfile(
  clean: string,
  raw: Record<string, unknown>
): CompanyProfile {
  const establishment = record(raw.estabelecimento) ?? {};
  const city = record(establishment.cidade);
  const state = record(establishment.estado);
  const activity = record(establishment.atividade_principal);
  const status = record(establishment.situacao_cadastral);
  const legalNature = record(raw.natureza_juridica);
  const size = record(raw.porte);
  const partnersRaw = Array.isArray(raw.socios) ? raw.socios : [];
  const partners: CompanyProfile["partners"] = [];

  for (const item of partnersRaw) {
    const row = record(item);
    if (!row) continue;
    const name = text(row.nome ?? row.nome_socio);
    if (!name) continue;
    const qualification =
      nestedText(row.qualificacao_socio, ["descricao", "nome"]) ??
      text(row.qualificacao_socio ?? row.qualificacao);
    partners.push(qualification ? { name, qualification } : { name });
  }

  const addressParts = [
    establishment.tipo_logradouro,
    establishment.logradouro,
    establishment.numero,
    establishment.complemento,
    establishment.bairro
  ]
    .map(text)
    .filter(Boolean);

  return {
    source: "CNPJ.ws",
    sourceUrl: `https://publica.cnpj.ws/cnpj/${clean}`,
    taxId: clean,
    legalName: text(raw.razao_social),
    tradeName: text(establishment.nome_fantasia),
    status:
      nestedText(status, ["descricao", "nome"]) ??
      text(establishment.situacao_cadastral),
    openingDate: text(establishment.data_inicio_atividade),
    mainActivity: nestedText(activity, ["descricao", "nome"]),
    legalNature: nestedText(legalNature, ["descricao", "nome"]),
    size: nestedText(size, ["descricao", "nome"]),
    capital: numberOrUndefined(raw.capital_social),
    address: addressParts.length ? addressParts.join(", ") : undefined,
    municipality: text(city?.nome ?? establishment.cidade_nome),
    state: text(state?.sigla ?? establishment.estado_sigla),
    partners,
    dataUpdatedAt: text(raw.atualizado_em),
    warning:
      "A base informa defasagem possível em relação à Receita Federal. Confirme dados societários e cadastrais em fonte oficial antes de publicar.",
    raw
  };
}

function openCnpjProfile(
  clean: string,
  raw: Record<string, unknown>
): CompanyProfile | null {
  const success = raw.success;
  const data = record(raw.data) ?? raw;
  if (success === false) return null;

  const addressParts = [
    data.logradouro,
    data.numero,
    data.complemento,
    data.bairro
  ]
    .map(text)
    .filter(Boolean);

  return {
    source: "OpenCNPJ",
    sourceUrl: `https://kitana.opencnpj.com/cnpj/${clean}`,
    taxId: clean,
    legalName: text(data.razaoSocial ?? data.razao_social),
    tradeName: text(data.nomeFantasia ?? data.nome_fantasia),
    status: text(data.situacaoCadastral ?? data.situacao_cadastral),
    openingDate: text(
      data.dataInicioAtividades ?? data.data_inicio_atividade
    ),
    mainActivity: text(
      data.atividadePrincipal ?? data.cnae_fiscal_descricao
    ),
    legalNature: text(data.naturezaJuridica ?? data.natureza_juridica),
    size: text(data.porte),
    capital: numberOrUndefined(data.capitalSocial ?? data.capital_social),
    address: addressParts.length ? addressParts.join(", ") : undefined,
    municipality: text(data.municipio),
    state: text(data.uf),
    partners: [],
    warning:
      "Consulta comunitária baseada em dados públicos. A ausência de sócios nesta resposta não significa inexistência de quadro societário.",
    raw
  };
}

export async function fetchCompanyProfile(taxId: string) {
  const clean = cleanTaxId(taxId);
  if (clean.length !== 14) return null;

  const errors: string[] = [];

  try {
    const raw = await requestJson(
      `https://brasilapi.com.br/api/cnpj/v1/${clean}`
    );
    if (raw) return brasilApiProfile(clean, raw);
  } catch (error) {
    errors.push(
      `BrasilAPI: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const raw = await requestJson(`https://publica.cnpj.ws/cnpj/${clean}`);
    if (raw) return cnpjWsProfile(clean, raw);
  } catch (error) {
    errors.push(
      `CNPJ.ws: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    const raw = await requestJson(
      `https://kitana.opencnpj.com/cnpj/${clean}`
    );
    if (raw) return openCnpjProfile(clean, raw);
  } catch (error) {
    errors.push(
      `OpenCNPJ: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (errors.length === 3) {
    throw new Error(errors.join(" | "));
  }

  return null;
}
