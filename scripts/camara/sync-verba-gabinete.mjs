import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

const MONTH_ALIASES = new Map([
  ["janeiro", 1],
  ["fevereiro", 2],
  ["marco", 3],
  ["março", 3],
  ["abril", 4],
  ["maio", 5],
  ["junho", 6],
  ["julho", 7],
  ["agosto", 8],
  ["setembro", 9],
  ["outubro", 10],
  ["novembro", 11],
  ["dezembro", 12]
]);

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

const snapshotOnly = args.get("snapshot-only") === "true";
const outputDirectory = path.resolve("data/raw/office-budget");
await fs.mkdir(outputDirectory, { recursive: true });

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function errorDetails(error) {
  const messages = [];
  let current = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = current?.message ?? String(current);
    const code = current?.code ? ` [${current.code}]` : "";
    if (message && !messages.includes(`${message}${code}`)) {
      messages.push(`${message}${code}`);
    }
    current = current?.cause;
  }

  return messages.join(" <- ") || "erro desconhecido";
}

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;
  const { timeoutMs = 45_000, headers: suppliedHeaders, ...fetchOptions } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        redirect: "follow",
        signal: fetchOptions.signal ?? controller.signal,
        headers: {
          "user-agent": "FuroPublico/1.1 (+monitoramento jornalistico; contato no repositorio)",
          accept: "text/html,application/json,text/csv,application/octet-stream,*/*",
          ...suppliedHeaders
        }
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      console.warn(
        `Tentativa ${attempt}/${attempts} falhou para ${url}: ${errorDetails(error)}`
      );
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Falha ao baixar ${url}: ${errorDetails(lastError)}`);
}

function absoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractCsvLinks(html, pageUrl, year) {
  const links = new Map();
  const hrefPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = hrefPattern.exec(html))) {
    const href = absoluteUrl(match[1], pageUrl);
    const label = normalize(match[2].replace(/<[^>]+>/g, " "));
    const normalizedHref = normalize(href);

    if (!label.includes("csv") && !normalizedHref.endsWith("-csv")) continue;

    const monthMatch = normalizedHref.match(
      /(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)-de-(\d{4})-csv/
    );

    if (!monthMatch || Number(monthMatch[2]) !== year) continue;
    const month = MONTH_ALIASES.get(monthMatch[1]);
    if (!month) continue;
    links.set(month, href);
  }

  return [...links.entries()]
    .map(([month, url]) => ({ year, month, url }))
    .sort((a, b) => a.month - b.month);
}

async function syncRemunerationYear(year) {
  const pageUrl =
    `https://www2.camara.leg.br/transparencia/recursos-humanos/remuneracao/` +
    `relatorios-consolidados-por-ano-e-mes/${year}`;

  console.log(`Consultando página de remuneração: ${pageUrl}`);
  const pageResponse = await fetchWithRetry(pageUrl);
  const html = await pageResponse.text();
  let links = extractCsvLinks(html, pageUrl, year);

  if (!links.length) {
    const lastMonth = year === currentYear ? new Date().getUTCMonth() + 1 : 12;
    links = MONTHS.slice(0, lastMonth).map((monthName, index) => ({
      year,
      month: index + 1,
      url: `${pageUrl}/${monthName}-de-${year}-csv`
    }));
  }

  const saved = [];

  for (const item of links) {
    const competence = `${item.year}-${String(item.month).padStart(2, "0")}`;
    try {
      const response = await fetchWithRetry(item.url, {}, 2);
      const buffer = Buffer.from(await response.arrayBuffer());

      if (!buffer.length) {
        console.warn(`Arquivo vazio ignorado: ${item.url}`);
        continue;
      }

      const csvPath = path.join(
        outputDirectory,
        `remuneracao-${competence}.csv`
      );
      const metadataPath = path.join(
        outputDirectory,
        `remuneracao-${competence}.metadata.json`
      );

      await fs.writeFile(csvPath, buffer);
      await fs.writeFile(
        metadataPath,
        JSON.stringify(
          {
            sourceUrl: item.url,
            pageUrl,
            competence,
            downloadedAt: new Date().toISOString(),
            contentType: response.headers.get("content-type"),
            contentDisposition: response.headers.get("content-disposition"),
            byteLength: buffer.length,
            sha256: sha256(buffer)
          },
          null,
          2
        )
      );

      saved.push(competence);
      console.log(`Remuneração salva: ${competence}`);
    } catch (error) {
      console.warn(`Competência ${competence} indisponível: ${error.message}`);
    }
  }

  return saved;
}


function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
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
    .replace(/&ccedil;/gi, "ç")
    .replace(/\s+/g, " ")
    .trim();
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
      const id = String(
        row?.id ?? status?.id ?? String(row?.uri ?? "").match(/(\d+)$/)?.[1] ?? ""
      );
      const name = cleanText(
        status?.nome ?? status?.nomeEleitoral ?? row?.nomeEleitoral ?? row?.nome ?? ""
      );
      if (!id || !name) return null;

      return {
        ...row,
        id,
        nome: row?.nome ?? name,
        nomeEleitoral: row?.nomeEleitoral ?? name,
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

async function fetchDeputiesFromStaticFile() {
  const url =
    "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json";
  const response = await fetchWithRetry(url, {}, 3);
  const payload = await response.json();
  const rows = normalizeDeputyRows(payload);
  if (!rows.length) throw new Error("Arquivo oficial retornou zero deputados válidos.");
  return { rows, sourceUrl: url, sourceType: "dados-abertos-arquivo" };
}

async function fetchDeputiesFromApi() {
  const rows = [];
  let page = 1;
  let nextUrl =
    "https://dadosabertos.camara.leg.br/api/v2/deputados" +
    "?idLegislatura=57&ordem=ASC&ordenarPor=nome&itens=100&pagina=1";

  while (nextUrl && page <= 10) {
    const response = await fetchWithRetry(nextUrl, {}, 3);
    const payload = await response.json();
    const batch = normalizeDeputyRows(payload);
    rows.push(...batch);

    const next = Array.isArray(payload?.links)
      ? payload.links.find((link) => String(link?.rel).toLowerCase() === "next")?.href
      : null;

    if (next) {
      nextUrl = next;
    } else if (batch.length >= 100) {
      page += 1;
      nextUrl =
        "https://dadosabertos.camara.leg.br/api/v2/deputados" +
        `?idLegislatura=57&ordem=ASC&ordenarPor=nome&itens=100&pagina=${page}`;
    } else {
      nextUrl = null;
    }

    page += next ? 1 : 0;
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
    const url =
      "https://www.camara.leg.br/deputados/quem-sao/resultado" +
      `?legislatura=57&pagina=${page}`;
    const response = await fetchWithRetry(url, {}, 3);
    const html = await response.text();
    const before = deputies.size;
    const pattern = /<a\b[^>]*href=["'](?:https:\/\/www\.camara\.leg\.br)?\/deputados\/(\d+)(?:[\/?#"'])[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = pattern.exec(html))) {
      const id = String(match[1]);
      const name = cleanText(match[2]);
      if (!name || normalize(name).includes("saiba mais")) continue;
      const current = deputies.get(id);
      if (!current || name.length > current.nome.length) {
        deputies.set(id, {
          id,
          nome: name,
          nomeEleitoral: name,
          ultimoStatus: { id, nome: name, nomeEleitoral: name }
        });
      }
    }

    emptyPages = deputies.size === before ? emptyPages + 1 : 0;
  }

  const rows = [...deputies.values()];
  if (!rows.length) throw new Error("Portal oficial retornou zero deputados válidos.");

  return {
    rows,
    sourceUrl:
      "https://www.camara.leg.br/deputados/quem-sao/resultado?legislatura=57",
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
      const payload = JSON.parse(await fs.readFile(candidate, "utf8"));
      const rows = normalizeDeputyRows(payload);
      if (rows.length) {
        return {
          rows,
          sourceUrl: `cache-local:${path.relative(process.cwd(), candidate)}`,
          sourceType: "cache-local"
        };
      }
    } catch {
      // Tenta a próxima cópia local.
    }
  }

  return null;
}

async function syncDeputyDirectory() {
  const errors = [];
  let result = null;

  for (const strategy of [
    fetchDeputiesFromStaticFile,
    fetchDeputiesFromApi,
    fetchDeputiesFromPortal
  ]) {
    try {
      result = await strategy();
      break;
    } catch (error) {
      errors.push(`${strategy.name}: ${errorDetails(error)}`);
      console.warn(`Fonte de deputados indisponível (${strategy.name}): ${errorDetails(error)}`);
    }
  }

  result ??= await copyCachedDeputyDirectory();
  if (!result?.rows?.length) {
    throw new Error(
      "Não foi possível obter o diretório de deputados por nenhuma fonte oficial ou cache local. " +
      errors.join(" | ")
    );
  }

  const buffer = Buffer.from(JSON.stringify({ dados: result.rows }, null, 2));
  const filePath = path.join(outputDirectory, "deputados.json");
  const metadataPath = path.join(outputDirectory, "deputados.metadata.json");

  await fs.writeFile(filePath, buffer);
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        sourceUrl: result.sourceUrl,
        sourceType: result.sourceType,
        downloadedAt: new Date().toISOString(),
        contentType: "application/json",
        recordCount: result.rows.length,
        byteLength: buffer.length,
        sha256: sha256(buffer),
        failedStrategies: errors
      },
      null,
      2
    )
  );

  console.log(
    `Diretório oficial de deputados salvo: ${result.rows.length} registro(s) via ${result.sourceType}.`
  );
}

async function syncEmployeesSnapshot() {
  const url =
    "https://dadosabertos.camara.leg.br/arquivos/funcionarios/csv/funcionarios.csv";
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const date = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(outputDirectory, `funcionarios-${date}.csv`);
  const metadataPath = path.join(
    outputDirectory,
    `funcionarios-${date}.metadata.json`
  );

  await fs.writeFile(csvPath, buffer);
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        sourceUrl: url,
        snapshotDate: date,
        downloadedAt: new Date().toISOString(),
        contentType: response.headers.get("content-type"),
        byteLength: buffer.length,
        sha256: sha256(buffer),
        caveat:
          "A fonte representa a posição do dia anterior e não reconstrói, sozinha, o histórico funcional."
      },
      null,
      2
    )
  );

  console.log(`Snapshot de funcionários salvo: ${date}`);
  return date;
}

await syncDeputyDirectory();

const result = {
  generatedAt: new Date().toISOString(),
  years: [],
  snapshotDate: null
};

if (!snapshotOnly) {
  for (const year of [...new Set(years)].sort()) {
    result.years.push({ year, competences: await syncRemunerationYear(year) });
  }
}

try {
  result.snapshotDate = await syncEmployeesSnapshot();
} catch (error) {
  result.snapshotError = errorDetails(error);
  console.warn(
    "Snapshot atual de funcionários indisponível. " +
    "A carga histórica mensal continuará sem interromper o backfill: " +
    result.snapshotError
  );
  if (snapshotOnly) throw error;
}

await fs.writeFile(
  path.join(outputDirectory, "ultima-coleta.json"),
  JSON.stringify(result, null, 2)
);

console.log("Coleta de verba de gabinete concluída.");
