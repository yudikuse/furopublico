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

const amendmentSampleLimit = Math.max(
  1,
  Number(args.get("amendment-sample") ?? 160)
);
const detailSampleLimit = Math.max(
  1,
  Number(args.get("detail-sample") ?? 300)
);
const finalBeneficiarySampleLimit = Math.max(
  0,
  Number(args.get("final-beneficiary-sample") ?? 240)
);
const delayMs = Math.max(120, Number(args.get("delay-ms") ?? 180));
const maxPages = Math.max(1, Number(args.get("max-pages") ?? 1000));
const outputRoot = path.resolve(
  String(args.get("output") ?? "data/emendas/diagnostico-v2")
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

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
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
    const partial = entries.find(([key]) =>
      normalizeText(key).includes(candidate)
    );
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
    "nomeAutor",
    "autor",
    "autorEmenda",
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
    restRegistered: ["valorRestoInscrito", "valor resto inscrito"],
    restCancelled: ["valorRestoCancelado", "valor resto cancelado"],
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

function normalizeAllocation(raw, fallbackYear) {
  const code = amendmentCode(raw);
  const year = amendmentYear(raw) || fallbackYear;
  const author = amendmentAuthor(raw);

  return {
    id: stableId([
      "alocacao-emenda",
      code,
      year,
      author,
      cleanText(firstValue(raw, ["funcao", "função"])),
      cleanText(firstValue(raw, ["subfuncao", "subfunção"])),
      locality(raw),
      stableJson(raw)
    ]),
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
    committed: amendmentValue(raw, "committed"),
    liquidated: amendmentValue(raw, "liquidated"),
    paid: amendmentValue(raw, "paid"),
    restRegistered: amendmentValue(raw, "restRegistered"),
    restCancelled: amendmentValue(raw, "restCancelled"),
    restPaid: amendmentValue(raw, "restPaid"),
    raw
  };
}

function groupAmendments(allocations) {
  const grouped = new Map();

  for (const allocation of allocations) {
    const key = allocation.code || allocation.id;
    const current = grouped.get(key) ?? {
      id: stableId(["emenda", key]),
      code: allocation.code,
      year: allocation.year,
      author: allocation.author,
      type: allocation.type,
      number: allocation.number,
      committed: 0,
      liquidated: 0,
      paid: 0,
      restRegistered: 0,
      restCancelled: 0,
      restPaid: 0,
      localities: new Set(),
      functions: new Set(),
      subfunctions: new Set(),
      allocations: []
    };

    current.committed += allocation.committed;
    current.liquidated += allocation.liquidated;
    current.paid += allocation.paid;
    current.restRegistered += allocation.restRegistered;
    current.restCancelled += allocation.restCancelled;
    current.restPaid += allocation.restPaid;

    if (allocation.locality) current.localities.add(allocation.locality);
    if (allocation.function) current.functions.add(allocation.function);
    if (allocation.subfunction) current.subfunctions.add(allocation.subfunction);

    current.allocations.push(allocation);
    grouped.set(key, current);
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    localities: [...item.localities].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
    functions: [...item.functions].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
    subfunctions: [...item.subfunctions].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    )
  }));
}

function collectFieldPaths(rows, maxDepth = 5) {
  const fields = new Map();

  function visit(value, currentPath, depth) {
    if (depth > maxDepth || value === null || value === undefined) return;

    if (Array.isArray(value)) {
      const arrayPath = `${currentPath}[]`;
      const current = fields.get(arrayPath) ?? {
        field: arrayPath,
        count: 0,
        nonEmpty: 0,
        types: new Set()
      };
      current.count += 1;
      if (value.length) current.nonEmpty += 1;
      current.types.add("array");
      fields.set(arrayPath, current);

      for (const item of value.slice(0, 20)) {
        visit(item, arrayPath, depth + 1);
      }
      return;
    }

    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const childPath = currentPath ? `${currentPath}.${key}` : key;
        const type = Array.isArray(child)
          ? "array"
          : child === null
            ? "null"
            : typeof child;

        const current = fields.get(childPath) ?? {
          field: childPath,
          count: 0,
          nonEmpty: 0,
          types: new Set()
        };

        current.count += 1;
        if (
          child !== null &&
          child !== undefined &&
          (typeof child === "object" || String(child).trim() !== "")
        ) {
          current.nonEmpty += 1;
        }
        current.types.add(type);
        fields.set(childPath, current);

        visit(child, childPath, depth + 1);
      }
    }
  }

  for (const row of rows) {
    visit(row, "", 0);
  }

  return [...fields.values()]
    .map((field) => ({
      field: field.field,
      count: field.count,
      nonEmpty: field.nonEmpty,
      coverage: rows.length ? field.nonEmpty / rows.length : 0,
      types: [...field.types].sort()
    }))
    .sort(
      (a, b) =>
        b.nonEmpty - a.nonEmpty ||
        a.field.localeCompare(b.field, "pt-BR")
    );
}

function valueAtPath(row, pathText) {
  const parts = pathText.split(".");
  let current = row;

  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    const matchingKey = Object.keys(current).find(
      (key) => normalizeText(key) === normalizeText(part)
    );
    if (!matchingKey) return null;
    current = current[matchingKey];
  }

  return current;
}

function firstValueDeep(object, candidates, maxDepth = 5) {
  const normalizedCandidates = candidates.map(normalizeText);
  const queue = [{ value: object, depth: 0 }];

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (
      !value ||
      typeof value !== "object" ||
      depth > maxDepth
    ) {
      continue;
    }

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizeText(key);

      if (
        normalizedCandidates.includes(normalizedKey) &&
        child !== null &&
        child !== undefined &&
        String(child).trim() !== ""
      ) {
        return child;
      }

      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }

  queue.push({ value: object, depth: 0 });

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (
      !value ||
      typeof value !== "object" ||
      depth > maxDepth
    ) {
      continue;
    }

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizeText(key);

      if (
        normalizedCandidates.some((candidate) =>
          normalizedKey.includes(candidate)
        ) &&
        child !== null &&
        child !== undefined &&
        String(child).trim() !== ""
      ) {
        return child;
      }

      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }

  return null;
}

function parseDocumentYear(documentCode, fallbackDate = "") {
  const codeMatch = String(documentCode ?? "").match(
    /(20\d{2})(?:NE|NS|OB|NP|PF|DF|NL)/
  );
  if (codeMatch) return Number(codeMatch[1]);

  const dateMatch = String(fallbackDate ?? "").match(
    /(?:^|\/)(20\d{2})$/
  );
  return dateMatch ? Number(dateMatch[1]) : 0;
}

function normalizeDocumentReference(raw, amendment) {
  const documentCode = cleanText(
    firstValue(raw, [
      "codigoDocumento",
      "código documento",
      "documento"
    ])
  );

  const phase = cleanText(firstValue(raw, ["fase", "faseDespesa"]));
  const date = cleanText(firstValue(raw, ["data", "dataDocumento"]));

  return {
    id: stableId([
      "referencia-documento-emenda",
      amendment.code,
      documentCode,
      phase,
      date
    ]),
    amendmentCode: amendment.code,
    amendmentYear: amendment.year,
    amendmentAuthor: amendment.author,
    amendmentType: amendment.type,
    documentCode,
    summarizedCode: cleanText(
      firstValue(raw, [
        "codigoDocumentoResumido",
        "documentoResumido",
        "numeroDocumento"
      ])
    ),
    date,
    year: parseDocumentYear(documentCode, date) || amendment.year,
    phase,
    species: cleanText(firstValue(raw, ["especieTipo", "espécie tipo"])),
    raw
  };
}

function beneficiaryFromRow(row, source) {
  if (!row || typeof row !== "object") return null;

  const beneficiaryObject = firstValueDeep(row, [
    "favorecido",
    "beneficiario",
    "beneficiário",
    "credor",
    "pessoa"
  ]);

  let name = "";
  let identifier = "";
  let type = "";
  let uf = "";
  let municipality = "";

  if (beneficiaryObject && typeof beneficiaryObject === "object") {
    name = cleanText(
      firstValueDeep(beneficiaryObject, [
        "nome",
        "nomeFavorecido",
        "razaoSocial",
        "razão social",
        "descricao"
      ])
    );
    identifier = cleanText(
      firstValueDeep(beneficiaryObject, [
        "codigo",
        "codigoFavorecido",
        "codigoPessoa",
        "cpfCnpj",
        "cpf/cnpj",
        "cnpj",
        "cpf"
      ])
    );
    type = cleanText(
      firstValueDeep(beneficiaryObject, [
        "tipo",
        "tipoFavorecido",
        "naturezaJuridica"
      ])
    );
    uf = cleanText(
      firstValueDeep(beneficiaryObject, ["uf", "ufFavorecido"])
    );
    municipality = cleanText(
      firstValueDeep(beneficiaryObject, [
        "municipio",
        "município",
        "municipioFavorecido"
      ])
    );
  }

  name ||= cleanText(
    firstValueDeep(row, [
      "nomeFavorecido",
      "favorecido",
      "nomeBeneficiario",
      "nomeBeneficiário",
      "credor",
      "razaoSocial",
      "razão social"
    ])
  );

  identifier ||= cleanText(
    firstValueDeep(row, [
      "codigoFavorecido",
      "codigoPessoa",
      "cpfCnpj",
      "cpf/cnpj",
      "cnpjFavorecido",
      "cpfFavorecido",
      "cnpj",
      "cpf"
    ])
  );

  type ||= cleanText(
    firstValueDeep(row, [
      "tipoFavorecido",
      "naturezaJuridica",
      "natureza jurídica",
      "tipoPessoa"
    ])
  );

  uf ||= cleanText(
    firstValueDeep(row, ["ufFavorecido", "uf do favorecido"])
  );

  municipality ||= cleanText(
    firstValueDeep(row, [
      "municipioFavorecido",
      "município do favorecido"
    ])
  );

  const amount = numberFrom(
    firstValueDeep(row, [
      "valorRecebido",
      "valorPago",
      "valorDocumento",
      "valor"
    ])
  );

  if (!name && !identifier) return null;

  return {
    id: stableId([
      "beneficiario",
      identifier || normalizeText(name),
      source
    ]),
    source,
    name,
    identifier,
    type,
    uf,
    municipality,
    amount
  };
}

function conventionFromRow(row) {
  const number = cleanText(
    firstValueDeep(row, [
      "numeroConvenio",
      "número do convênio",
      "convenio",
      "convênio"
    ])
  );

  const hasConventionValue = firstValueDeep(row, [
    "possuiConvenio",
    "possui convênio"
  ]);

  const hasConvention =
    Boolean(number) ||
    hasConventionValue === true ||
    ["sim", "true", "1"].includes(normalizeText(hasConventionValue));

  return { hasConvention, number };
}

function detailValue(row) {
  return numberFrom(
    firstValueDeep(row, [
      "valor",
      "valorDocumento",
      "valorPago",
      "valorEmpenhado",
      "valorLiquidado"
    ])
  );
}

let lastRequestAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < delayMs) {
    await sleep(delayMs - elapsed);
  }
  lastRequestAt = Date.now();
}

async function requestJson(
  endpoint,
  searchParams = {},
  { attempts = 5, allow404 = false } = {}
) {
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
          "user-agent": "FuroPublico/2.0 (diagnostico de dados abertos)"
        }
      });

      clearTimeout(timer);

      if (response.status === 404 && allow404) {
        return [];
      }

      if (response.status === 429) {
        const wait = Math.max(5_000, attempt * 10_000);
        console.warn(
          `Limite da API atingido. Aguardando ${wait / 1000}s.`
        );
        await sleep(wait);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `${response.status} ${response.statusText}: ${body.slice(0, 600)}`
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
      .update(stableJson(pageRows))
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
      console.log(
        `Ano ${year}: ${page} página(s), ${rows.length} linha(s).`
      );
    }
  }

  return rows;
}

async function fetchAllPages(endpoint, baseParams, pageLimit = 100) {
  const rows = [];
  const seen = new Set();

  for (let page = 1; page <= pageLimit; page += 1) {
    const pageRows = await requestJson(endpoint, {
      ...baseParams,
      pagina: page
    });

    if (!pageRows.length) break;

    const fingerprint = createHash("sha1")
      .update(stableJson(pageRows))
      .digest("hex");

    if (seen.has(fingerprint)) break;
    seen.add(fingerprint);
    rows.push(...pageRows);
  }

  return rows;
}

async function fetchDocumentDetail(reference) {
  try {
    return await requestJson(
      `/despesas/documentos/${encodeURIComponent(reference.documentCode)}`,
      {},
      { allow404: true }
    );
  } catch (firstError) {
    if (!reference.date) throw firstError;

    return requestJson(
      `/despesas/documentos/${encodeURIComponent(reference.documentCode)}`,
      { dataEmissao: reference.date },
      { allow404: true }
    );
  }
}

async function fetchFinalBeneficiaries(reference) {
  const common = {
    codigoDocumento: reference.documentCode
  };

  try {
    return await fetchAllPages(
      "/despesas/favorecidos-finais-por-documento",
      {
        ...common,
        ano: reference.year
      },
      30
    );
  } catch (firstError) {
    return fetchAllPages(
      "/despesas/favorecidos-finais-por-documento",
      common,
      30
    );
  }
}

async function loadExistingDeputyNames() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return [];

  try {
    const { createClient } = await import("@supabase/supabase-js");

    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const names = new Set();

    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error } = await supabase
        .from("alerts")
        .select("deputy_name")
        .range(from, from + 999);

      if (error) throw error;

      for (const row of data ?? []) {
        if (row?.deputy_name) {
          names.add(cleanText(row.deputy_name));
        }
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

function roundRobinSelect(groups, limit, keyFunction) {
  const selected = [];
  const indexes = new Map();

  while (selected.length < limit) {
    let advanced = false;

    for (const [key, items] of groups) {
      const index = indexes.get(key) ?? 0;
      if (index >= items.length) continue;

      selected.push(items[index]);
      indexes.set(key, index + 1);
      advanced = true;

      if (selected.length >= limit) break;
    }

    if (!advanced) break;
  }

  return [
    ...new Map(
      selected.map((item) => [keyFunction(item), item])
    ).values()
  ].slice(0, limit);
}

function selectAmendmentSample(
  amendments,
  limit,
  currentDeputyNames
) {
  const currentIndex = new Set(
    currentDeputyNames.map(normalizeText)
  );

  const ranked = [...amendments].sort(
    (a, b) =>
      b.paid - a.paid ||
      b.liquidated - a.liquidated ||
      b.committed - a.committed
  );

  const current = ranked.filter((item) =>
    currentIndex.has(normalizeText(item.author))
  );
  const other = ranked.filter(
    (item) => !currentIndex.has(normalizeText(item.author))
  );

  function stratified(items, itemLimit) {
    const groups = new Map();

    for (const item of items) {
      const key = `${item.year}|${item.type}`;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    return roundRobinSelect(
      [...groups.entries()].sort(([a], [b]) =>
        a.localeCompare(b, "pt-BR")
      ),
      itemLimit,
      (item) => item.code
    );
  }

  if (!currentDeputyNames.length) {
    return stratified(ranked, limit);
  }

  const currentLimit = Math.min(
    current.length,
    Math.max(1, Math.round(limit * 0.75))
  );
  const otherLimit = limit - currentLimit;

  const selected = [
    ...stratified(current, currentLimit),
    ...stratified(other, otherLimit)
  ];

  if (selected.length < limit) {
    for (const item of ranked) {
      if (selected.some((entry) => entry.code === item.code)) continue;
      selected.push(item);
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit);
}

function selectDetailSample(references, limit) {
  const phasePriority = new Map([
    ["pagamento", 0],
    ["liquidacao", 1],
    ["liquidação", 1],
    ["empenho", 2]
  ]);

  const ordered = [...references].sort((a, b) => {
    const phaseA =
      phasePriority.get(normalizeText(a.phase)) ?? 9;
    const phaseB =
      phasePriority.get(normalizeText(b.phase)) ?? 9;

    return (
      phaseA - phaseB ||
      b.year - a.year ||
      a.amendmentType.localeCompare(b.amendmentType, "pt-BR")
    );
  });

  const groups = new Map();

  for (const reference of ordered) {
    const key = `${normalizeText(reference.phase)}|${reference.amendmentType}|${reference.year}`;
    const group = groups.get(key) ?? [];
    group.push(reference);
    groups.set(key, group);
  }

  return roundRobinSelect(
    [...groups.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "pt-BR")
    ),
    limit,
    (item) => item.documentCode
  );
}

function selectFinalBeneficiarySample(references, limit) {
  const candidates = references.filter((reference) => {
    const phase = normalizeText(reference.phase);
    return phase.includes("pagamento") || phase.includes("liquid");
  });

  const groups = new Map();

  for (const reference of candidates) {
    const key = `${normalizeText(reference.phase)}|${reference.amendmentType}|${reference.year}`;
    const group = groups.get(key) ?? [];
    group.push(reference);
    groups.set(key, group);
  }

  return roundRobinSelect(
    [...groups.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "pt-BR")
    ),
    limit,
    (item) => item.documentCode
  );
}

function summarizeCounts(items, selector) {
  const counts = {};

  for (const item of items) {
    const key = cleanText(selector(item)) || "Não informado";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(
      ([a, countA], [b, countB]) =>
        countB - countA || a.localeCompare(b, "pt-BR")
    )
  );
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);
}

await fs.mkdir(outputRoot, { recursive: true });

const rawAmendmentRows = [];

for (const year of years) {
  console.log(`Coletando emendas de ${year}...`);
  const rows = await fetchYear(year);
  rawAmendmentRows.push(...rows);
  console.log(`Ano ${year}: ${rows.length} linha(s).`);
}

const uniqueRawRows = [
  ...new Map(
    rawAmendmentRows.map((row) => [
      createHash("sha256")
        .update(stableJson(row))
        .digest("hex"),
      row
    ])
  ).values()
];

const allocations = uniqueRawRows.map((row) =>
  normalizeAllocation(row, Number(row?.ano) || 0)
);
const amendments = groupAmendments(allocations);

const existingDeputies = await loadExistingDeputyNames();
const existingDeputyIndex = new Map(
  existingDeputies.map((name) => [normalizeText(name), name])
);

const authors = [
  ...new Set(
    amendments.map((item) => item.author).filter(Boolean)
  )
].sort((a, b) => a.localeCompare(b, "pt-BR"));

const matchedAuthors = authors.filter((author) =>
  existingDeputyIndex.has(normalizeText(author))
);
const unmatchedAuthors = authors.filter(
  (author) => !existingDeputyIndex.has(normalizeText(author))
);

const amendmentSample = selectAmendmentSample(
  amendments,
  amendmentSampleLimit,
  existingDeputies
);

const documentReferences = [];
const documentReferenceFailures = [];

for (let index = 0; index < amendmentSample.length; index += 1) {
  const amendment = amendmentSample[index];

  try {
    const rawDocuments = await fetchAllPages(
      `/emendas/documentos/${encodeURIComponent(amendment.code)}`,
      {},
      100
    );

    documentReferences.push(
      ...rawDocuments.map((row) =>
        normalizeDocumentReference(row, amendment)
      )
    );
  } catch (error) {
    documentReferenceFailures.push({
      amendmentCode: amendment.code,
      error: error.message
    });
  }

  if ((index + 1) % 20 === 0 || index + 1 === amendmentSample.length) {
    console.log(
      `Referências: ${index + 1}/${amendmentSample.length} emenda(s) consultada(s).`
    );
  }
}

const uniqueDocumentReferences = [
  ...new Map(
    documentReferences.map((item) => [
      item.documentCode || item.id,
      item
    ])
  ).values()
];

const detailSample = selectDetailSample(
  uniqueDocumentReferences,
  detailSampleLimit
);
const detailResults = [];
const detailFailures = [];

for (let index = 0; index < detailSample.length; index += 1) {
  const reference = detailSample[index];

  try {
    const rows = await fetchDocumentDetail(reference);
    const normalizedRows = rows.map((raw) => {
      const beneficiary = beneficiaryFromRow(
        raw,
        "document_detail"
      );
      const convention = conventionFromRow(raw);

      return {
        id: stableId([
          "detalhe-documento",
          reference.documentCode,
          stableJson(raw)
        ]),
        reference,
        beneficiary,
        value: detailValue(raw),
        hasConvention: convention.hasConvention,
        conventionNumber: convention.number,
        raw
      };
    });

    detailResults.push(...normalizedRows);
  } catch (error) {
    detailFailures.push({
      documentCode: reference.documentCode,
      error: error.message
    });
  }

  if ((index + 1) % 25 === 0 || index + 1 === detailSample.length) {
    console.log(
      `Detalhes: ${index + 1}/${detailSample.length} documento(s) consultado(s).`
    );
  }
}

const finalBeneficiarySample = selectFinalBeneficiarySample(
  detailSample,
  finalBeneficiarySampleLimit
);
const finalBeneficiaryResults = [];
const finalBeneficiaryFailures = [];

for (
  let index = 0;
  index < finalBeneficiarySample.length;
  index += 1
) {
  const reference = finalBeneficiarySample[index];

  try {
    const rows = await fetchFinalBeneficiaries(reference);

    finalBeneficiaryResults.push(
      ...rows.map((raw) => ({
        id: stableId([
          "favorecido-final",
          reference.documentCode,
          stableJson(raw)
        ]),
        reference,
        beneficiary: beneficiaryFromRow(
          raw,
          "final_beneficiary"
        ),
        value: detailValue(raw),
        raw
      }))
    );
  } catch (error) {
    finalBeneficiaryFailures.push({
      documentCode: reference.documentCode,
      error: error.message
    });
  }

  if (
    (index + 1) % 25 === 0 ||
    index + 1 === finalBeneficiarySample.length
  ) {
    console.log(
      `Favorecidos finais: ${index + 1}/${finalBeneficiarySample.length} documento(s) consultado(s).`
    );
  }
}

const beneficiaryLinks = [
  ...detailResults
    .filter((item) => item.beneficiary)
    .map((item) => ({
      amendmentCode: item.reference.amendmentCode,
      amendmentAuthor: item.reference.amendmentAuthor,
      amendmentType: item.reference.amendmentType,
      documentCode: item.reference.documentCode,
      documentPhase: item.reference.phase,
      documentDate: item.reference.date,
      beneficiary: item.beneficiary,
      value: item.value,
      source: "document_detail"
    })),
  ...finalBeneficiaryResults
    .filter((item) => item.beneficiary)
    .map((item) => ({
      amendmentCode: item.reference.amendmentCode,
      amendmentAuthor: item.reference.amendmentAuthor,
      amendmentType: item.reference.amendmentType,
      documentCode: item.reference.documentCode,
      documentPhase: item.reference.phase,
      documentDate: item.reference.date,
      beneficiary: item.beneficiary,
      value: item.value,
      source: "final_beneficiary"
    }))
];

const uniqueBeneficiaries = [
  ...new Map(
    beneficiaryLinks.map((link) => {
      const beneficiary = link.beneficiary;
      const key =
        beneficiary.identifier ||
        normalizeText(beneficiary.name);

      return [
        key,
        {
          ...beneficiary,
          amendmentCodes: new Set(),
          documentCodes: new Set(),
          authors: new Set(),
          sources: new Set(),
          relatedValue: 0
        }
      ];
    })
  ).values()
];

const beneficiaryIndex = new Map(
  uniqueBeneficiaries.map((item) => [
    item.identifier || normalizeText(item.name),
    item
  ])
);

for (const link of beneficiaryLinks) {
  const key =
    link.beneficiary.identifier ||
    normalizeText(link.beneficiary.name);
  const current = beneficiaryIndex.get(key);
  if (!current) continue;

  current.amendmentCodes.add(link.amendmentCode);
  current.documentCodes.add(link.documentCode);
  current.authors.add(link.amendmentAuthor);
  current.sources.add(link.source);
  current.relatedValue += Number(link.value) || 0;
}

const serializedBeneficiaries = [...beneficiaryIndex.values()]
  .map((item) => ({
    ...item,
    amendmentCodes: [...item.amendmentCodes],
    documentCodes: [...item.documentCodes],
    authors: [...item.authors].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    ),
    sources: [...item.sources]
  }))
  .sort(
    (a, b) =>
      b.relatedValue - a.relatedValue ||
      a.name.localeCompare(b.name, "pt-BR")
  );

const values = {
  committed: amendments.reduce(
    (total, item) => total + item.committed,
    0
  ),
  liquidated: amendments.reduce(
    (total, item) => total + item.liquidated,
    0
  ),
  paid: amendments.reduce(
    (total, item) => total + item.paid,
    0
  ),
  restRegistered: amendments.reduce(
    (total, item) => total + item.restRegistered,
    0
  ),
  restCancelled: amendments.reduce(
    (total, item) => total + item.restCancelled,
    0
  ),
  restPaid: amendments.reduce(
    (total, item) => total + item.restPaid,
    0
  )
};

const report = {
  generatedAt: new Date().toISOString(),
  version: 2,
  source: {
    name: "Portal da Transparência do Governo Federal",
    apiBase: API_BASE,
    endpoints: {
      amendments: "/emendas",
      amendmentDocuments: "/emendas/documentos/{codigo}",
      documentDetail: "/despesas/documentos/{codigo}",
      finalBeneficiaries:
        "/despesas/favorecidos-finais-por-documento"
    },
    years
  },
  configuration: {
    amendmentSampleLimit,
    detailSampleLimit,
    finalBeneficiarySampleLimit,
    delayMs,
    maxPages
  },
  summary: {
    rawAmendmentRows: rawAmendmentRows.length,
    uniqueRawAmendmentRows: uniqueRawRows.length,
    uniqueAmendments: amendments.length,
    amendmentAllocations: allocations.length,
    uniqueAuthors: authors.length,
    uniqueTypes: new Set(
      amendments.map((item) => item.type).filter(Boolean)
    ).size,
    sampledAmendments: amendmentSample.length,
    documentReferenceRows: documentReferences.length,
    uniqueDocumentReferences: uniqueDocumentReferences.length,
    documentReferenceFailures: documentReferenceFailures.length,
    detailedDocumentsRequested: detailSample.length,
    detailRows: detailResults.length,
    detailFailures: detailFailures.length,
    detailRowsWithBeneficiary: detailResults.filter(
      (item) => item.beneficiary
    ).length,
    detailRowsWithValue: detailResults.filter(
      (item) => Number(item.value) !== 0
    ).length,
    detailRowsWithConvention: detailResults.filter(
      (item) => item.hasConvention || item.conventionNumber
    ).length,
    finalBeneficiaryDocumentsRequested:
      finalBeneficiarySample.length,
    finalBeneficiaryRows: finalBeneficiaryResults.length,
    finalBeneficiaryFailures: finalBeneficiaryFailures.length,
    finalBeneficiaryRowsWithIdentification:
      finalBeneficiaryResults.filter(
        (item) => item.beneficiary
      ).length,
    beneficiaryLinks: beneficiaryLinks.length,
    uniqueBeneficiaries: serializedBeneficiaries.length,
    existingDeputyNames: existingDeputies.length,
    matchedAuthorsToExistingCases: matchedAuthors.length,
    unmatchedAuthors: unmatchedAuthors.length
  },
  distributions: {
    amendmentTypes: summarizeCounts(
      amendments,
      (item) => item.type
    ),
    amendmentYears: summarizeCounts(
      amendments,
      (item) => item.year
    ),
    documentPhases: summarizeCounts(
      uniqueDocumentReferences,
      (item) => item.phase
    ),
    documentTypes: summarizeCounts(
      uniqueDocumentReferences,
      (item) => item.amendmentType
    ),
    beneficiarySources: summarizeCounts(
      beneficiaryLinks,
      (item) => item.source
    )
  },
  values,
  fieldCoverage: {
    amendmentRows: collectFieldPaths(uniqueRawRows),
    documentReferences: collectFieldPaths(
      documentReferences.map((item) => item.raw)
    ),
    documentDetails: collectFieldPaths(
      detailResults.map((item) => item.raw)
    ),
    finalBeneficiaries: collectFieldPaths(
      finalBeneficiaryResults.map((item) => item.raw)
    )
  },
  authors: {
    all: authors,
    matchedToExistingCases: matchedAuthors,
    unmatched: unmatchedAuthors
  },
  amendments,
  amendmentSample: amendmentSample.map((item) => item.code),
  documentReferences: uniqueDocumentReferences,
  detailSample: detailResults,
  finalBeneficiarySample: finalBeneficiaryResults,
  beneficiaryLinks,
  uniqueBeneficiaries: serializedBeneficiaries,
  failures: {
    documentReferences: documentReferenceFailures,
    details: detailFailures,
    finalBeneficiaries: finalBeneficiaryFailures
  }
};

const date = new Date().toISOString().slice(0, 10);
const jsonPath = path.join(
  outputRoot,
  `emendas-diagnostico-v2-${date}.json`
);
const mdPath = path.join(
  outputRoot,
  `emendas-diagnostico-v2-${date}.md`
);

await fs.writeFile(
  jsonPath,
  JSON.stringify(report, null, 2),
  "utf8"
);

const markdown = `# Diagnóstico de Emendas Parlamentares — v2

Gerado em: ${report.generatedAt}

## Cobertura nacional

- Anos: ${years.join(", ")}
- Linhas brutas: ${report.summary.rawAmendmentRows}
- Linhas únicas: ${report.summary.uniqueRawAmendmentRows}
- Emendas agrupadas por código: ${report.summary.uniqueAmendments}
- Alocações preservadas: ${report.summary.amendmentAllocations}
- Autores únicos: ${report.summary.uniqueAuthors}
- Emendas amostradas: ${report.summary.sampledAmendments}

## Valores

- Empenhado: ${money(values.committed)}
- Liquidado: ${money(values.liquidated)}
- Pago: ${money(values.paid)}
- Restos inscritos: ${money(values.restRegistered)}
- Restos cancelados: ${money(values.restCancelled)}
- Restos pagos: ${money(values.restPaid)}

As fases permanecem separadas e não devem ser somadas entre si.

## Documentos

- Referências retornadas: ${report.summary.documentReferenceRows}
- Referências únicas: ${report.summary.uniqueDocumentReferences}
- Documentos abertos em detalhe: ${report.summary.detailedDocumentsRequested}
- Linhas de detalhe: ${report.summary.detailRows}
- Linhas de detalhe com beneficiário: ${report.summary.detailRowsWithBeneficiary}
- Linhas de detalhe com valor: ${report.summary.detailRowsWithValue}
- Linhas de detalhe com convênio: ${report.summary.detailRowsWithConvention}

## Favorecidos finais

- Documentos consultados: ${report.summary.finalBeneficiaryDocumentsRequested}
- Linhas retornadas: ${report.summary.finalBeneficiaryRows}
- Linhas identificadas: ${report.summary.finalBeneficiaryRowsWithIdentification}
- Relações emenda-documento-beneficiário: ${report.summary.beneficiaryLinks}
- Beneficiários únicos: ${report.summary.uniqueBeneficiaries}

## Correspondência com casos atuais

- Casos parlamentares encontrados no Supabase: ${report.summary.existingDeputyNames}
- Autores correspondentes: ${report.summary.matchedAuthorsToExistingCases}
- Autores sem correspondência: ${report.summary.unmatchedAuthors}

## Leitura editorial

Este arquivo ainda é diagnóstico. Nenhuma relação deve ser publicada como
irregularidade automática. A próxima etapa deve distinguir:

1. beneficiário do documento;
2. favorecido final;
3. ente ou entidade executora;
4. contratado final, quando houver fonte documental;
5. valor empenhado, liquidado e pago;
6. relação documentada com o parlamentar.
`;

await fs.writeFile(mdPath, markdown, "utf8");

console.log("");
console.log("Diagnóstico v2 concluído.");
console.log(`Emendas agrupadas: ${report.summary.uniqueAmendments}`);
console.log(
  `Referências de documentos: ${report.summary.uniqueDocumentReferences}`
);
console.log(
  `Detalhes com beneficiário: ${report.summary.detailRowsWithBeneficiary}`
);
console.log(
  `Favorecidos finais identificados: ${report.summary.finalBeneficiaryRowsWithIdentification}`
);
console.log(
  `Beneficiários únicos: ${report.summary.uniqueBeneficiaries}`
);
console.log(`JSON: ${jsonPath}`);
console.log(`Relatório: ${mdPath}`);
