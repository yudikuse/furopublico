import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);

const currentYear = new Date().getUTCFullYear();
const years = String(args.get("years") ?? `${currentYear - 1},${currentYear}`)
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 2023 && value <= currentYear);
const requestedDeputyIds = new Set(
  String(args.get("deputy-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const snapshotOnly = args.get("snapshot-only") === "true";
const concurrency = Math.max(1, Math.min(16, Number(args.get("concurrency") ?? 8) || 8));
const outputDirectory = path.resolve("data/raw/office-budget");
const camaraProxyUrl = String(process.env.CAMARA_PROXY_URL ?? "").trim();
const camaraProxyToken = String(process.env.CAMARA_PROXY_TOKEN ?? "").trim();
await fs.mkdir(outputDirectory, { recursive: true });

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function errorDetails(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = current?.message ?? String(current);
    const code = current?.code ? ` [${current.code}]` : "";
    if (message && !messages.includes(`${message}${code}`)) messages.push(`${message}${code}`);
    current = current?.cause;
  }
  return messages.join(" <- ") || "erro desconhecido";
}

async function fetchDirect(url, options = {}) {
  const { timeoutMs = 35_000, headers: suppliedHeaders, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      redirect: "follow",
      signal: fetchOptions.signal ?? controller.signal,
      headers: {
        "user-agent": "FuroPublico/4.0 (+monitoramento jornalistico; fonte oficial)",
        accept: "text/html,application/json,text/csv,application/octet-stream,*/*",
        ...suppliedHeaders
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchThroughProxy(url, options = {}) {
  if (!camaraProxyUrl || !camaraProxyToken) {
    throw new Error("Proxy da Câmara não configurado.");
  }

  const proxy = new URL(camaraProxyUrl);
  proxy.searchParams.set("url", url);

  return fetchDirect(proxy.toString(), {
    ...options,
    timeoutMs: Math.max(Number(options.timeoutMs ?? 35_000), 50_000),
    headers: {
      authorization: `Bearer ${camaraProxyToken}`,
      ...(options.headers ?? {})
    }
  });
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchDirect(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }

  if (camaraProxyUrl && camaraProxyToken) {
    console.warn(`Acesso direto indisponível; usando transporte Vercel para ${url}`);
    try {
      return await fetchThroughProxy(url, options);
    } catch (proxyError) {
      throw new Error(
        `Falha direta e pelo transporte Vercel em ${url}: ` +
        `${errorDetails(lastError)} | proxy: ${errorDetails(proxyError)}`
      );
    }
  }

  throw new Error(
    `Falha ao baixar ${url}: ${errorDetails(lastError)}. ` +
    "CAMARA_PROXY_URL/CAMARA_PROXY_TOKEN não configurados."
  );
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&agrave;/gi, "à")
    .replace(/&acirc;/gi, "â")
    .replace(/&atilde;/gi, "ã")
    .replace(/&eacute;/gi, "é")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&otilde;/gi, "õ")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ccedil;/gi, "ç");
}

function cleanText(value) {
  return decodeHtmlEntities(String(value ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrazilianNumber(value) {
  const text = cleanText(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const MONTH_NAMES = new Map([
  ["janeiro", 1], ["jan", 1], ["fevereiro", 2], ["fev", 2],
  ["marco", 3], ["março", 3], ["mar", 3], ["abril", 4], ["abr", 4],
  ["maio", 5], ["mai", 5], ["junho", 6], ["jun", 6], ["julho", 7],
  ["jul", 7], ["agosto", 8], ["ago", 8], ["setembro", 9], ["set", 9],
  ["outubro", 10], ["out", 10], ["novembro", 11], ["nov", 11],
  ["dezembro", 12], ["dez", 12]
]);

function parseMonth(value) {
  const text = normalize(cleanText(value)).replace(/[^a-z0-9]+/g, "").trim();
  if (/^(?:0?[1-9]|1[0-2])$/.test(text)) return Number(text);
  return MONTH_NAMES.get(text) ?? null;
}

function extractOfficeBudgetMonths(html) {
  const months = new Map();
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html))) {
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) cells.push(cleanText(cellMatch[1]));
    if (cells.length < 3) continue;

    const month = parseMonth(cells[0]);
    if (!month) continue;
    const numeric = cells.slice(1).map(parseBrazilianNumber).filter((value) => value !== null);
    if (numeric.length < 2) continue;

    months.set(month, {
      month,
      available: Number(numeric[0]),
      spent: Number(numeric[1])
    });
  }

  if (!months.size) {
    const text = cleanText(html);
    const fallback = /(?:^|\s)(0?[1-9]|1[0-2])\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s|$)/g;
    let match;
    while ((match = fallback.exec(text))) {
      const month = Number(match[1]);
      months.set(month, {
        month,
        available: Number(parseBrazilianNumber(match[2]) ?? 0),
        spent: Number(parseBrazilianNumber(match[3]) ?? 0)
      });
    }
  }

  return [...months.values()].sort((a, b) => a.month - b.month);
}


function extractOfficeNumber(value) {
  const text = cleanText(value);
  const patterns = [
    /\bgabinete\s*(?:n[ºo°.]?\s*)?(\d{1,4})\b/i,
    /\bgab\.?\s*(\d{1,4})\b/i,
    /\banexo\s+[ivx]+\s*[-–—]\s*(?:gabinete\s*)?(\d{1,4})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(Number(match[1]));
  }
  return null;
}

function normalizeDeputyRows(payload) {
  const rows = Array.isArray(payload?.dados)
    ? payload.dados
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rows
    .map((row) => {
      const status = row?.ultimoStatus ?? row?.status ?? {};
      const id = String(row?.id ?? status?.id ?? String(row?.uri ?? "").match(/(\d+)$/)?.[1] ?? "");
      const name = cleanText(status?.nome ?? status?.nomeEleitoral ?? row?.nomeEleitoral ?? row?.nome ?? "");
      if (!id || !name) return null;
      return {
        ...row,
        id,
        nome: row?.nome ?? name,
        nomeEleitoral: row?.nomeEleitoral ?? name,
        officeNumber: row?.officeNumber ?? row?.gabinete ?? null,
        ultimoStatus: {
          ...status,
          id: status?.id ?? id,
          nome: status?.nome ?? name,
          nomeEleitoral: status?.nomeEleitoral ?? name
        }
      };
    })
    .filter(Boolean);
}

async function fetchDeputiesFromSupabaseCases() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase não configurado para reaproveitar os casos existentes.");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const rows = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabase
      .from("alerts")
      .select("deputy_name,evidence")
      .range(from, from + 999);

    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const deputies = new Map();
  for (const row of rows) {
    const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
    const id = String(
      evidence?.deputyId ??
      evidence?.idDeputado ??
      evidence?.parliamentarianId ??
      ""
    ).trim();
    const name = cleanText(row?.deputy_name ?? evidence?.deputyName ?? "");
    if (!id || !name) continue;

    const officeBudget =
      evidence?.officeBudget && typeof evidence.officeBudget === "object"
        ? evidence.officeBudget
        : {};
    const profile =
      officeBudget?.profile && typeof officeBudget.profile === "object"
        ? officeBudget.profile
        : {};
    const officeNumber = String(
      profile?.officeNumber ?? officeBudget?.officeNumber ?? ""
    ).trim();

    deputies.set(id, {
      id,
      nome: name,
      nomeEleitoral: name,
      officeNumber: officeNumber || null,
      ultimoStatus: { id, nome: name, nomeEleitoral: name }
    });
  }

  const result = [...deputies.values()];
  if (!result.length) {
    throw new Error("Nenhum caso atual contém deputyId aproveitável.");
  }

  return {
    rows: result,
    sourceUrl: "supabase:alerts.evidence.deputyId",
    sourceType: "casos-existentes-supabase"
  };
}

async function fetchDeputiesFromStaticFile() {
  const url = "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json";
  const response = await fetchWithRetry(url, {}, 3);
  const rows = normalizeDeputyRows(await response.json());
  if (!rows.length) throw new Error("Arquivo oficial retornou zero deputados válidos.");
  return { rows, sourceUrl: url, sourceType: "dados-abertos-arquivo" };
}

async function fetchDeputiesFromApi() {
  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = "https://dadosabertos.camara.leg.br/api/v2/deputados" +
      `?idLegislatura=57&ordem=ASC&ordenarPor=nome&itens=100&pagina=${page}`;
    const response = await fetchWithRetry(url, {}, 3);
    const payload = await response.json();
    const batch = normalizeDeputyRows(payload);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  const unique = [...new Map(rows.map((row) => [String(row.id), row])).values()];
  if (!unique.length) throw new Error("API oficial retornou zero deputados válidos.");
  return {
    rows: unique,
    sourceUrl: "https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57",
    sourceType: "dados-abertos-api"
  };
}

async function fetchDeputiesFromPortal() {
  const deputies = new Map();
  let emptyPages = 0;
  for (let page = 1; page <= 35 && emptyPages < 2; page += 1) {
    const url = `https://www.camara.leg.br/deputados/quem-sao/resultado?legislatura=57&pagina=${page}`;
    const response = await fetchWithRetry(url, {}, 2);
    const html = await response.text();
    const before = deputies.size;
    const pattern = /<a\b[^>]*href=["'](?:https:\/\/www\.camara\.leg\.br)?\/deputados\/(\d+)(?:[\/?#"'])[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html))) {
      const id = String(match[1]);
      const name = cleanText(match[2]);
      if (!name || normalize(name).includes("saiba mais")) continue;
      deputies.set(id, {
        id,
        nome: name,
        nomeEleitoral: name,
        ultimoStatus: { id, nome: name, nomeEleitoral: name }
      });
    }
    emptyPages = deputies.size === before ? emptyPages + 1 : 0;
  }
  const rows = [...deputies.values()];
  if (!rows.length) throw new Error("Portal oficial retornou zero deputados válidos.");
  return {
    rows,
    sourceUrl: "https://www.camara.leg.br/deputados/quem-sao/resultado?legislatura=57",
    sourceType: "portal-camara-html"
  };
}

async function copyCachedDeputyDirectory() {
  const candidates = [
    path.resolve("data/raw/deputados.json"),
    path.resolve("data/raw/camara/deputados.json"),
    path.resolve("data/raw/office-budget/deputados.json")
  ];
  for (const candidate of candidates) {
    try {
      const rows = normalizeDeputyRows(JSON.parse(await fs.readFile(candidate, "utf8")));
      if (rows.length) {
        return {
          rows,
          sourceUrl: `cache-local:${path.relative(process.cwd(), candidate)}`,
          sourceType: "cache-local"
        };
      }
    } catch {
      // Tenta a próxima cópia.
    }
  }
  return null;
}

async function syncDeputyDirectory() {
  const errors = [];
  let result = null;
  for (const strategy of [
    fetchDeputiesFromSupabaseCases,
    copyCachedDeputyDirectory,
    fetchDeputiesFromApi,
    fetchDeputiesFromPortal,
    fetchDeputiesFromStaticFile
  ]) {
    try {
      result = await strategy();
      if (result?.rows?.length) break;
    } catch (error) {
      errors.push(`${strategy.name}: ${errorDetails(error)}`);
      console.warn(`Fonte de deputados indisponível (${strategy.name}): ${errorDetails(error)}`);
    }
  }
  if (!result?.rows?.length) {
    throw new Error("Não foi possível obter o diretório de deputados. " + errors.join(" | "));
  }

  // Um deputado pode aparecer várias vezes em arquivos históricos. A coleta da
  // verba exige uma linha única por ID parlamentar.
  result.rows = [...new Map(
    result.rows
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  ).values()];

  // Trava editorial e operacional: a Câmara possui pouco mais de 500 cadeiras.
  // Uma lista muito acima disso indica que uma fonte histórica foi interpretada
  // como diretório da legislatura atual.
  if (!requestedDeputyIds.size && result.rows.length > 700) {
    throw new Error(
      `Diretório inválido: ${result.rows.length} IDs únicos. ` +
      "A coleta foi interrompida para evitar milhares de requisições indevidas."
    );
  }

  const selectedRows = requestedDeputyIds.size
    ? result.rows.filter((row) => requestedDeputyIds.has(String(row.id)))
    : result.rows;
  const buffer = Buffer.from(JSON.stringify({ dados: result.rows }, null, 2));
  await fs.writeFile(path.join(outputDirectory, "deputados.json"), buffer);
  await fs.writeFile(
    path.join(outputDirectory, "deputados.metadata.json"),
    JSON.stringify({
      sourceUrl: result.sourceUrl,
      sourceType: result.sourceType,
      downloadedAt: new Date().toISOString(),
      recordCount: result.rows.length,
      selectedCount: selectedRows.length,
      byteLength: buffer.length,
      sha256: sha256(buffer),
      failedStrategies: errors
    }, null, 2)
  );
  console.log(`Parlamentares selecionados para a verba de gabinete: ${selectedRows.length} caso(s) único(s).`);
  return selectedRows;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function syncOfficeBudgetYear(year, deputies) {
  if (!requestedDeputyIds.size && deputies.length > 700) {
    throw new Error(
      `Coleta recusada: ${deputies.length} parlamentares para ${year}. ` +
      "O diretório esperado para a legislatura deve ficar abaixo de 700."
    );
  }

  let completed = 0;
  const failures = [];
  const results = await mapLimit(deputies, concurrency, async (deputy) => {
    const deputyId = String(deputy.id);
    const deputyName = cleanText(deputy?.ultimoStatus?.nome ?? deputy?.nomeEleitoral ?? deputy?.nome ?? deputyId);
    const sourceUrl = `https://www.camara.leg.br/deputados/${deputyId}/verba-gabinete?ano=${year}`;
    try {
      const response = await fetchWithRetry(sourceUrl, { timeoutMs: 30_000 }, 2);
      const html = await response.text();
      const months = extractOfficeBudgetMonths(html);
      completed += 1;
      if (completed % 50 === 0 || completed === deputies.length) {
        console.log(`Verba de gabinete ${year}: ${completed}/${deputies.length} páginas consultadas.`);
      }
      if (!months.length) return null;
      return {
        deputyId,
        deputyName,
        year,
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        checksum: sha256(Buffer.from(html)),
        officeNumber: extractOfficeNumber(html) ?? deputy?.officeNumber ?? null,
        months
      };
    } catch (error) {
      completed += 1;
      failures.push({ deputyId, deputyName, sourceUrl, error: errorDetails(error) });
      if (completed % 50 === 0 || completed === deputies.length) {
        console.log(`Verba de gabinete ${year}: ${completed}/${deputies.length} páginas consultadas.`);
      }
      return null;
    }
  });

  const data = results.filter(Boolean);
  const filePath = path.join(outputDirectory, `verba-gabinete-${year}.json`);
  await fs.writeFile(filePath, JSON.stringify({
    metadata: {
      generatedAt: new Date().toISOString(),
      year,
      sourcePattern: "https://www.camara.leg.br/deputados/{id}/verba-gabinete?ano={ano}",
      deputyCount: deputies.length,
      caseCount: data.length,
      failureCount: failures.length,
      failures: failures.slice(0, 100)
    },
    data
  }, null, 2));
  console.log(`Ano ${year}: ${data.length} parlamentar(es) com valores mensais; ${failures.length} falha(s) de conexão.`);
  return { year, caseCount: data.length, failureCount: failures.length };
}

async function syncEmployeesSnapshot() {
  const url = "https://dadosabertos.camara.leg.br/arquivos/funcionarios/csv/funcionarios.csv";
  const response = await fetchWithRetry(url, {}, 3);
  const buffer = Buffer.from(await response.arrayBuffer());
  const date = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(outputDirectory, `funcionarios-${date}.csv`), buffer);
  await fs.writeFile(
    path.join(outputDirectory, `funcionarios-${date}.metadata.json`),
    JSON.stringify({
      sourceUrl: url,
      snapshotDate: date,
      downloadedAt: new Date().toISOString(),
      contentType: response.headers.get("content-type"),
      byteLength: buffer.length,
      sha256: sha256(buffer),
      caveat: "A fonte representa a posição do dia anterior e não reconstrói, sozinha, o histórico funcional."
    }, null, 2)
  );
  console.log(`Snapshot funcional salvo: ${date}`);
  return date;
}

const result = {
  version: 4,
  generatedAt: new Date().toISOString(),
  years: [],
  snapshotDate: null
};

const deputies = await syncDeputyDirectory();
if (!snapshotOnly) {
  for (const year of [...new Set(years)].sort()) {
    result.years.push(await syncOfficeBudgetYear(year, deputies));
  }
}

try {
  result.snapshotDate = await syncEmployeesSnapshot();
} catch (error) {
  result.snapshotError = errorDetails(error);
  console.warn(`Snapshot funcional indisponível: ${result.snapshotError}`);
  if (snapshotOnly) throw error;
}

await fs.writeFile(path.join(outputDirectory, "ultima-coleta.json"), JSON.stringify(result, null, 2));
console.log("Coleta da verba de gabinete e do snapshot funcional concluída.");
