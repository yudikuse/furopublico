import fs from "node:fs/promises";
import path from "node:path";

export const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

export function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const exactIndex = process.argv.indexOf(`--${name}`);
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  if (exactIndex >= 0 && process.argv[exactIndex + 1] && !process.argv[exactIndex + 1].startsWith("--")) return process.argv[exactIndex + 1];
  return fallback;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, options = {}) {
  const attempts = options.attempts ?? 4;
  const userAgent = process.env.DATA_USER_AGENT ?? "FuroPublico/0.1 contato-nao-configurado";
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": userAgent },
        signal: AbortSignal.timeout(options.timeout ?? 30_000)
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(700 * attempt ** 2);
    }
  }
  throw lastError;
}

export async function fetchAllPages(initialUrl, { maxPages = Infinity, delayMs = 120 } = {}) {
  const rows = [];
  let nextUrl = initialUrl;
  let page = 0;
  while (nextUrl && page < maxPages) {
    page += 1;
    const payload = await fetchJson(nextUrl);
    const data = Array.isArray(payload.dados) ? payload.dados : [];
    rows.push(...data);
    const nextLink = Array.isArray(payload.links) ? payload.links.find((link) => link.rel === "next")?.href : undefined;
    nextUrl = nextLink || null;
    console.log(`Página ${page}: ${data.length} registros; total ${rows.length}`);
    if (nextUrl) await sleep(delayMs);
  }
  return rows;
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  console.log(`Arquivo salvo: ${filePath}`);
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export function numberValue(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const normalized = value.includes(",") ? value.replaceAll(".", "").replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}
