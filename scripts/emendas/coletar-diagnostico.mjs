import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const API_KEY = String(process.env.PORTAL_TRANSPARENCIA_API_KEY ?? "").trim();

if (!API_KEY) {
  throw new Error(
    "Defina PORTAL_TRANSPARENCIA_API_KEY nos segredos do GitHub Actions."
  );
}

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...rest] = argument.replace(/^--/, "").split("=");
    return [name, rest.length ? rest.join("=") : "true"];
  })
);

const years = String(args.get("years") ?? "2023,2024,2025,2026")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 2000);

const documentSampleLimit = Math.max(
  0,
  Number(args.get("document-sample") ?? 240)
);
const delayMs = Math.max(120, Number(args.get("delay-ms") ?? 180));
const maxPages = Math.max(1, Number(args.get("max-pages") ?? 1000));
const outputRoot = path.resolve(
  String(args.get("output") ?? "data/emendas/diagnostico")
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function numberFrom(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(object, candidates) {
  if (!object || typeof object !== "object") return null;

  const entries = Object.entries(object);
  const normalizedCandidates = candidates.map(normalizeText);

  for (const candidate of normalizedCandidates) {
    const direct = entries.find(([key]) => normalizeText(key) === candidate);
    if (direct && direct[1] !== null && direct[1] !== "") return direct[1];
  }

  for (const candidate of normalizedCandidates) {
    const partial = entries.find(([key]) => normalizeText(key).includes(candidate));
    if (partial && partial[1] !== null && partial[1] !== "") return partial[1];
  }

  return null;
}

function amendmentCode(row) {
  return cleanText(
    firstValue(row, [
      "codigoEmenda",
      "codigo da emenda",
      "código da emenda",
      "codigo"
    ])
  );
}

function amendmentAuthor(row) {
  const value = firstValue(row, [
    "autor",
    "autorEmenda",
    "nomeAutor",
    "nome do autor da emenda"
  ]);

  if (value && typeof value === "object") {
    return cleanText(
      firstValue(value, ["nome", "descricao", "nomeAutor", "autor"])
    );
  }

  return cleanText(value);
}

function amendmentYear(row) {
  return Number(
    firstValue(row, ["ano", "anoEmenda", "ano da emenda"]) ?? 0
  );
}

function amendmentType(row) {
  const value = firstValue(row, [
    "tipoEmenda",
    "tipo da emenda",
    "tipo"
  ]);

  if (value && typeof value === "object") {
    return cleanText(firstValue(value, ["descricao", "nome", "tipo"]));
  }

  return cleanText(value);
}

function amendmentValue(row, phase) {
  const candidates = {
    committed: ["valorEmpenhado", "valor empenhado"],
    liquidated: ["valorLiquidado", "valor liquidado"],
    paid: ["valorPago", "valor pago"],
    restPaid: ["valorRestoPago", "valor resto pago", "restos a pagar pagos"]
  };
  return numberFrom(firstValue(row, candidates[phase] ?? []));
}

function locality(row) {
  return cleanText(
    firstValue(row, [
      "localidadeDoGasto",
      "localidade do gasto",
      "regionalizacao",
      "regionalização",
      "municipio",
      "município"
    ])
  );
}

function normalizeAmendment(raw, fallbackYear) {
  const code = amendmentCode(raw);
  const year = amendmentYear(raw) || fallbackYear;
  const author = amendmentAuthor(raw);

  return {
    id: stableId(["emenda", code, year, author, JSON.stringify(raw)]),
    code,
    year,
    author,
    type: amendmentType(raw),
    number: cleanText(
      firstValue(raw, ["numeroEmenda", "numero da emenda", "número da emenda"])
    ),
    locality: locality(raw),
    function: cleanText(firstValue(raw, ["funcao", "função"])),
    subfunction: cleanText(firstValue(raw, ["subfuncao", "subfunção"])),
    program: cleanText(
      firstValue(raw, ["programaOrcamentario", "programa orçamentário", "programa"])
    ),
    action: cleanText(
      firstValue(raw, ["acaoOrcamentaria", "ação orçamentária", "acao", "ação"])
    ),
    plan: cleanText(
      firstValue(raw, ["planoOrcamentario", "plano orçamentário"])
    ),
    hasConvention: Boolean(
      firstValue(raw, ["possuiConvenio", "possui convênio", "numeroConvenio"])
    ),
    committed: amendmentValue(raw, "committed"),
    liquidated: amendmentValue(raw, "liquidated"),
    paid: amendmentValue(raw, "paid"),
    restPaid: amendmentValue(raw, "restPaid"),
    raw
  };
}

function collectFieldNames(rows) {
  const fields = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [key, value] of Object.entries(row)) {
      const type = Array.isArray(value)
        ? "array"
        : value === null
          ? "null"
          : typeof value;
      const current = fields.get(key) ?? {
        field: key,
        count: 0,
        nonEmpty: 0,
        types: new Set()
      };
      current.count += 1;
      if (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      ) {
        current.nonEmpty += 1;
      }
      current.types.add(type);
      fields.set(key, current);
    }
  }

  return [...fields.values()]
    .map((field) => ({
      field: field.field,
      count: field.count,
      nonEmpty: field.nonEmpty,
      coverage: rows.length ? field.nonEmpty / rows.length : 0,
      types: [...field.types].sort()
    }))
    .sort((a, b) => b.nonEmpty - a.nonEmpty || a.field.localeCompare(b.field));
}

function beneficiaryFromDocument(row) {
  const beneficiaryObject = firstValue(row, [
    "favorecido",
    "beneficiario",
    "beneficiário",
    "credor"
  ]);

  let name = "";
  let identifier = "";

  if (beneficiaryObject && typeof beneficiaryObject === "object") {
    name = cleanText(
      firstValue(beneficiaryObject, [
        "nome",
        "nomeFavorecido",
        "razaoSocial",
        "razão social",
        "descricao"
      ])
    );
    identifier = cleanText(
      firstValue(beneficiaryObject, [
        "codigo",
        "cpfCnpj",
        "cpf/cnpj",
        "cnpj",
        "cpf"
      ])
    );
  } else {
    name = cleanText(
      firstValue(row, [
        "nomeFavorecido",
        "favorecido",
        "beneficiario",
        "beneficiário",
        "credor"
      ])
    );
  }

  identifier ||= cleanText(
    firstValue(row, [
      "cpfCnpj",
      "cpf/cnpj",
      "codigoFavorecido",
      "cnpjFavorecido",
      "cpfFavorecido",
      "cnpj",
      "cpf"
    ])
  );

  return {
    name,
    identifier,
    legalNature: cleanText(
      firstValue(row, [
        "naturezaJuridica",
        "natureza jurídica",
        "tipoFavorecido",
        "perfilFavorecido"
      ])
    ),
    uf: cleanText(
      firstValue(row, ["ufFavorecido", "uf do favorecido", "uf"])
    ),
    municipality: cleanText(
      firstValue(row, [
        "municipioFavorecido",
        "município do favorecido",
        "municipio",
        "município"
      ])
    )
  };
}

function normalizeDocument(raw, code) {
  const beneficiary = beneficiaryFromDocument(raw);

  return {
    id: stableId([
      "documento-emenda",
      code,
      firstValue(raw, ["codigoDocumento", "documento", "numeroDocumento"]),
      JSON.stringify(raw)
    ]),
    amendmentCode: code,
    date: cleanText(firstValue(raw, ["data", "dataDocumento", "data do documento"])),
    phase: cleanText(firstValue(raw, ["fase", "faseDespesa", "fase da despesa"])),
    documentCode: cleanText(
      firstValue(raw, [
        "codigoDocumento",
        "documentoResumido",
        "numeroDocumento",
        "documento"
      ])
    ),
    value: numberFrom(
      firstValue(raw, [
        "valor",
        "valorDocumento",
        "valorPagoDocumento",
        "valorEmpenhadoDocumento"
      ])
    ),
    beneficiary,
    hasConvention: Boolean(
      firstValue(raw, [
        "possuiConvenio",
        "numeroConvenio",
        "convênio",
        "convenio"
      ])
    ),
    conventionNumber: cleanText(
      firstValue(raw, ["numeroConvenio", "número do convênio", "convenio"])
    ),
    raw
  };
}

let lastRequestAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < delayMs) await sleep(delayMs - elapsed);
  lastRequestAt = Date.now();
}

async function requestJson(endpoint, searchParams = {}, attempts = 5) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await throttle();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          accept: "application/json",
          "chave-api-dados": API_KEY,
          "user-agent": "FuroPublico/1.0 (diagnostico de dados abertos)"
        }
      });
      clearTimeout(timer);

      if (response.status === 429) {
        const wait = Math.max(5_000, attempt * 10_000);
        console.warn(`Limite da API atingido. Aguardando ${wait / 1000}s.`);
        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `${response.status} ${response.statusText}: ${body.slice(0, 500)}`
        );
      }

      const payload = await response.json();
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.resultado)
            ? payload.resultado
            : payload
              ? [payload]
              : [];
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(attempt * 2_000);
      }
    }
  }

  throw new Error(`Falha em ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchYear(year) {
  const rows = [];
  const seenPages = new Set();

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = await requestJson("/emendas", {
      ano: year,
      pagina: page
    });

    if (!pageRows.length) break;

    const fingerprint = createHash("sha1")
      .update(JSON.stringify(pageRows))
      .digest("hex");

    if (seenPages.has(fingerprint)) {
      console.warn(
        `Ano ${year}: página repetida detectada em ${page}; coleta interrompida.`
      );
      break;
    }
    seenPages.add(fingerprint);
    rows.push(...pageRows);

    if (page % 25 === 0) {
      console.log(`Ano ${year}: ${page} página(s), ${rows.length} linha(s).`);
    }
  }

  return rows;
}

async function loadExistingDeputyNames() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const names = new Set();
    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error } = await supabase
        .from("alerts")
        .select("deputy_name")
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row?.deputy_name) names.add(cleanText(row.deputy_name));
      }
      if ((data ?? []).length < 1000) break;
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch (error) {
    console.warn(
      `Não foi possível comparar autores com os casos existentes: ${error.message}`
    );
    return [];
  }
}

function selectDocumentSample(amendments, limit) {
  if (!limit) return [];

  const ranked = [...amendments].sort(
    (a, b) =>
      b.paid - a.paid ||
      b.liquidated - a.liquidated ||
      b.committed - a.committed
  );

  const selected = new Map();

  for (const amendment of ranked) {
    if (!amendment.code) continue;
    const stratificationKey = `${amendment.year}|${amendment.type}|${amendment.author}`;
    if (
      ![...selected.values()].some(
        (item) =>
          `${item.year}|${item.type}|${item.author}` === stratificationKey
      )
    ) {
      selected.set(amendment.code, amendment);
    }
    if (selected.size >= Math.ceil(limit / 2)) break;
  }

  for (const amendment of ranked) {
    if (selected.size >= limit) break;
    if (amendment.code) selected.set(amendment.code, amendment);
  }

  return [...selected.values()].slice(0, limit);
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);
}

await fs.mkdir(outputRoot, { recursive: true });

const collected = [];
const rawByYear = {};

for (const year of years) {
  console.log(`Coletando emendas de ${year}...`);
  const raw = await fetchYear(year);
  rawByYear[year] = raw;
  const normalized = raw.map((row) => normalizeAmendment(row, year));
  collected.push(...normalized);
  console.log(
    `Ano ${year}: ${raw.length} linha(s), ` +
      `${new Set(normalized.map((item) => item.code).filter(Boolean)).size} código(s).`
  );
}

const amendments = [
  ...new Map(
    collected.map((item) => [
      item.code || item.id,
      item
    ])
  ).values()
];

const sample = selectDocumentSample(amendments, documentSampleLimit);
const documents = [];
const documentFailures = [];

for (let index = 0; index < sample.length; index += 1) {
  const amendment = sample[index];
  try {
    const rawDocuments = await requestJson(
      `/emendas/documentos/${encodeURIComponent(amendment.code)}`
    );
    documents.push(
      ...rawDocuments.map((row) => normalizeDocument(row, amendment.code))
    );
  } catch (error) {
    documentFailures.push({
      amendmentCode: amendment.code,
      error: error.message
    });
  }

  if ((index + 1) % 25 === 0 || index + 1 === sample.length) {
    console.log(
      `Documentos: ${index + 1}/${sample.length} emenda(s) consultada(s).`
    );
  }
}

const existingDeputies = await loadExistingDeputyNames();
const existingDeputyIndex = new Map(
  existingDeputies.map((name) => [normalizeText(name), name])
);
const authors = [...new Set(amendments.map((item) => item.author).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

const matchedAuthors = authors.filter((author) =>
  existingDeputyIndex.has(normalizeText(author))
);
const unmatchedAuthors = authors.filter(
  (author) => !existingDeputyIndex.has(normalizeText(author))
);

const beneficiaries = documents
  .map((document) => document.beneficiary)
  .filter((beneficiary) => beneficiary.name || beneficiary.identifier);

const uniqueBeneficiaries = [
  ...new Map(
    beneficiaries.map((beneficiary) => [
      beneficiary.identifier || normalizeText(beneficiary.name),
      beneficiary
    ])
  ).values()
];

const report = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "Portal da Transparência do Governo Federal",
    apiBase: API_BASE,
    amendmentEndpoint: "/emendas",
    documentEndpoint: "/emendas/documentos/{codigo}",
    years
  },
  configuration: {
    documentSampleLimit,
    delayMs,
    maxPages
  },
  summary: {
    rawAmendmentRows: collected.length,
    uniqueAmendments: amendments.length,
    uniqueAuthors: authors.length,
    uniqueTypes: new Set(amendments.map((item) => item.type).filter(Boolean)).size,
    sampledAmendments: sample.length,
    documentRows: documents.length,
    documentFailures: documentFailures.length,
    documentsWithBeneficiaryName: documents.filter(
      (document) => document.beneficiary.name
    ).length,
    documentsWithBeneficiaryIdentifier: documents.filter(
      (document) => document.beneficiary.identifier
    ).length,
    documentsWithConvention: documents.filter(
      (document) => document.hasConvention || document.conventionNumber
    ).length,
    uniqueBeneficiaries: uniqueBeneficiaries.length,
    existingDeputyNames: existingDeputies.length,
    matchedAuthorsToExistingCases: matchedAuthors.length,
    unmatchedAuthors: unmatchedAuthors.length
  },
  values: {
    committed: amendments.reduce((total, item) => total + item.committed, 0),
    liquidated: amendments.reduce((total, item) => total + item.liquidated, 0),
    paid: amendments.reduce((total, item) => total + item.paid, 0),
    restPaid: amendments.reduce((total, item) => total + item.restPaid, 0)
  },
  fieldCoverage: {
    amendments: collectFieldNames(Object.values(rawByYear).flat()),
    documents: collectFieldNames(documents.map((document) => document.raw))
  },
  authors: {
    all: authors,
    matchedToExistingCases: matchedAuthors,
    unmatched: unmatchedAuthors
  },
  amendments,
  documentSample: documents,
  uniqueBeneficiaries,
  documentFailures
};

const date = new Date().toISOString().slice(0, 10);
const jsonPath = path.join(outputRoot, `emendas-diagnostico-${date}.json`);
const mdPath = path.join(outputRoot, `emendas-diagnostico-${date}.md`);

await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

const markdown = `# Diagnóstico de Emendas Parlamentares

Gerado em: ${report.generatedAt}

## Cobertura

- Anos: ${years.join(", ")}
- Linhas brutas de emendas: ${report.summary.rawAmendmentRows}
- Emendas únicas: ${report.summary.uniqueAmendments}
- Autores únicos: ${report.summary.uniqueAuthors}
- Tipos de emenda: ${report.summary.uniqueTypes}
- Emendas amostradas para documentos: ${report.summary.sampledAmendments}
- Documentos retornados: ${report.summary.documentRows}
- Falhas ao consultar documentos: ${report.summary.documentFailures}

## Valores das emendas

- Empenhado: ${money(report.values.committed)}
- Liquidado: ${money(report.values.liquidated)}
- Pago: ${money(report.values.paid)}
- Restos pagos: ${money(report.values.restPaid)}

Os valores acima permanecem separados por fase. Eles não devem ser somados como se
fossem fluxos independentes.

## Beneficiários nos documentos amostrados

- Documentos com nome do favorecido: ${report.summary.documentsWithBeneficiaryName}
- Documentos com CPF/CNPJ ou código do favorecido: ${report.summary.documentsWithBeneficiaryIdentifier}
- Documentos com convênio localizado: ${report.summary.documentsWithConvention}
- Beneficiários únicos localizados: ${report.summary.uniqueBeneficiaries}

## Correspondência com os casos atuais

- Nomes de parlamentares existentes no Supabase: ${report.summary.existingDeputyNames}
- Autores exatamente correspondentes: ${report.summary.matchedAuthorsToExistingCases}
- Autores sem correspondência exata: ${report.summary.unmatchedAuthors}

A ausência de correspondência pode indicar bancada, comissão, relator, diferença de
grafia ou parlamentar ainda sem caso criado. Não é tratada como ausência de emenda.

## Próxima decisão

Este diagnóstico deve ser usado para definir:

1. quais campos de favorecido são confiáveis;
2. como distinguir beneficiário formal, executor e favorecido final;
3. quais documentos permitem seguir empenho, liquidação e pagamento;
4. quais autores podem ser associados automaticamente aos parlamentares;
5. quais relações exigirão consulta a convênios ou despesas relacionadas.
`;

await fs.writeFile(mdPath, markdown, "utf8");

console.log("");
console.log("Diagnóstico concluído.");
console.log(`Emendas únicas: ${report.summary.uniqueAmendments}`);
console.log(`Autores únicos: ${report.summary.uniqueAuthors}`);
console.log(`Documentos amostrados: ${report.summary.documentRows}`);
console.log(
  `Documentos com favorecido: ${report.summary.documentsWithBeneficiaryName}`
);
console.log(
  `Documentos com CPF/CNPJ/código: ${report.summary.documentsWithBeneficiaryIdentifier}`
);
console.log(
  `Autores correspondentes aos casos atuais: ${report.summary.matchedAuthorsToExistingCases}`
);
console.log(`JSON: ${jsonPath}`);
console.log(`Relatório: ${mdPath}`);
