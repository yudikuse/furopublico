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

async function fetchWithRetry(url, options = {}, attempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "FuroPublico/1.0 (+monitoramento jornalistico)",
          accept: "text/html,text/csv,application/octet-stream,*/*",
          ...(options.headers ?? {})
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw new Error(`Falha ao baixar ${url}: ${lastError?.message ?? lastError}`);
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


async function syncDeputyDirectory() {
  const url =
    "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json";
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const filePath = path.join(outputDirectory, "deputados.json");
  const metadataPath = path.join(outputDirectory, "deputados.metadata.json");

  await fs.writeFile(filePath, buffer);
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        sourceUrl: url,
        downloadedAt: new Date().toISOString(),
        contentType: response.headers.get("content-type"),
        byteLength: buffer.length,
        sha256: sha256(buffer)
      },
      null,
      2
    )
  );

  console.log("Diretório oficial de deputados salvo.");
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

result.snapshotDate = await syncEmployeesSnapshot();

await fs.writeFile(
  path.join(outputDirectory, "ultima-coleta.json"),
  JSON.stringify(result, null, 2)
);

console.log("Coleta de verba de gabinete concluída.");
