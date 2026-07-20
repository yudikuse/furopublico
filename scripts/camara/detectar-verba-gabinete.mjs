import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const RAW_DIRECTORY = path.resolve("data/raw/office-budget");
const OUTPUT_DIRECTORY = path.resolve("data/office-budget");
await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  })
);
const snapshotOnly = args.get("snapshot-only") === "true";
const currentYear = new Date().getUTCFullYear();

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function decodeCsv(buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  if (replacementCount <= 3) return utf8.replace(/^\uFEFF/, "");
  return new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return [";", ",", "\t"]
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((value, index) => value || `coluna_${index + 1}`);
  const records = rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
  return { headers, records };
}

function findHeader(headers, candidates, contains = []) {
  const normalized = headers.map((header) => ({
    header,
    normalized: normalize(header),
    compact: compact(header)
  }));
  for (const candidate of candidates) {
    const exact = normalized.find((item) => item.normalized === normalize(candidate));
    if (exact) return exact.header;
  }
  for (const candidate of contains) {
    const found = normalized.find((item) => item.compact.includes(compact(candidate)));
    if (found) return found.header;
  }
  return null;
}

function firstValue(record, headers) {
  for (const header of headers.filter(Boolean)) {
    const value = String(record?.[header] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function inspectSnapshotSchema(headers) {
  return {
    name: findHeader(
      headers,
      ["nome", "nome do servidor", "nome servidor", "servidor", "nomefuncionario"],
      ["nomeservidor", "nomefuncionario", "nome"]
    ),
    point: findHeader(
      headers,
      ["ponto", "numero do ponto", "número do ponto", "matricula", "matrícula"],
      ["numeroponto", "matricula", "ponto"]
    ),
    category: findHeader(
      headers,
      ["categoria funcional", "categoria", "vinculo", "vínculo", "descricao categoria"],
      ["categoriafuncional", "descricaocategoria", "categoria", "vinculo"]
    ),
    cargo: findHeader(
      headers,
      ["cargo", "cargo efetivo", "descricao cargo", "descrição cargo"],
      ["descricaocargo", "cargo"]
    ),
    function: findHeader(
      headers,
      ["funcao", "função", "funcao comissionada", "função comissionada", "descricao funcao"],
      ["descricaofuncao", "funcao"]
    ),
    lotation: findHeader(
      headers,
      ["lotacao", "lotação", "nome lotacao", "local de trabalho", "unidade"],
      ["nomelotacao", "descricaolotacao", "lotacao", "localdetrabalho", "unidade"]
    ),
    office: findHeader(
      headers,
      ["deputado", "parlamentar", "gabinete", "nome deputado", "nome parlamentar"],
      ["nomedeputado", "nomeparlamentar", "deputado", "parlamentar", "gabinete"]
    ),
    appointmentDate: findHeader(
      headers,
      ["data de nomeacao", "data de nomeação", "nomeacao", "nomeação", "data nomeacao"],
      ["datadenomeacao", "datanomeacao", "nomeacao"]
    )
  };
}

function isParliamentarySecretary(record, schema) {
  const haystack = normalize(
    [
      schema.category,
      schema.cargo,
      schema.function,
      schema.lotation,
      schema.office
    ]
      .filter(Boolean)
      .map((header) => record[header])
      .join(" ")
  );
  return (
    haystack.includes("secretario parlamentar") ||
    haystack.includes("secretaria parlamentar") ||
    /\bsp(?:\s|$)/.test(haystack)
  );
}

function extractOfficeNumber(value) {
  const text = String(value ?? "");
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

function extractOfficeName(value) {
  return normalize(value)
    .replace(/\bgabinete\b/g, " ")
    .replace(/\bsecretaria parlamentar\b/g, " ")
    .replace(/\bdo\b|\bda\b|\bde\b/g, " ")
    .replace(/\bdeputado\b|\bdeputada\b|\bdep\b/g, " ")
    .replace(/\bcamara dos deputados\b/g, " ")
    .replace(/\banexo\b|\bbrasilia\b|\bdf\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function loadOfficeProfiles() {
  const profiles = new Map();
  const files = (await fs.readdir(RAW_DIRECTORY).catch(() => []))
    .filter((name) => /^verba-gabinete-\d{4}\.json$/.test(name))
    .sort();

  for (const file of files) {
    const payload = await readJsonIfExists(path.join(RAW_DIRECTORY, file));
    for (const item of Array.isArray(payload?.data) ? payload.data : []) {
      if (!item?.deputyId) continue;
      const id = String(item.deputyId);
      const previous = profiles.get(id) ?? {};
      profiles.set(id, {
        ...previous,
        officeNumber: item.officeNumber ?? previous.officeNumber ?? null,
        name: item.deputyName ?? previous.name ?? ""
      });
    }
  }
  return profiles;
}

async function loadDeputyDirectory() {
  const payload = await readJsonIfExists(path.join(RAW_DIRECTORY, "deputados.json"));
  const officeProfiles = await loadOfficeProfiles();
  const rows = Array.isArray(payload?.dados)
    ? payload.dados
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rows.map((row) => {
    const status = row.ultimoStatus ?? row.status ?? {};
    const id = String(row.id ?? status.id ?? String(row.uri ?? "").match(/(\d+)$/)?.[1] ?? "");
    const profile = officeProfiles.get(id) ?? {};
    const aliases = [
      row.nome,
      row.nomeCivil,
      row.nomeEleitoral,
      status.nome,
      status.nomeEleitoral,
      profile.name
    ]
      .filter(Boolean)
      .map(normalize)
      .filter((value) => value.length >= 3);

    return {
      id,
      name: String(status.nome ?? row.nomeEleitoral ?? row.nome ?? profile.name ?? "").trim(),
      aliases: [...new Set(aliases)],
      officeNumber: String(row.officeNumber ?? profile.officeNumber ?? "").trim() || null
    };
  }).filter((item) => item.id && item.name);
}

function matchDeputy(record, schema, directory) {
  const officeField = firstValue(record, [schema.office]);
  const lotation = firstValue(record, [schema.lotation]);
  const combined = `${officeField} ${lotation}`.trim();
  const normalizedCombined = normalize(combined);

  const officeNumber = extractOfficeNumber(combined);
  if (officeNumber) {
    const officeMatches = directory.filter(
      (deputy) => String(deputy.officeNumber ?? "") === officeNumber
    );
    if (officeMatches.length === 1) {
      return { deputy: officeMatches[0], method: "numero-gabinete", confidence: "alta" };
    }
  }

  const aliasMatches = [];
  for (const deputy of directory) {
    const matchedAlias = deputy.aliases
      .filter((alias) => alias.length >= 4)
      .sort((a, b) => b.length - a.length)
      .find((alias) => normalizedCombined.includes(alias));
    if (matchedAlias) {
      aliasMatches.push({ deputy, length: matchedAlias.length });
    }
  }
  aliasMatches.sort((a, b) => b.length - a.length);
  if (
    aliasMatches.length === 1 ||
    (aliasMatches[0] && aliasMatches[0].length > Number(aliasMatches[1]?.length ?? 0))
  ) {
    return { deputy: aliasMatches[0].deputy, method: "nome-no-campo", confidence: "alta" };
  }

  const officeName = extractOfficeName(combined);
  if (!officeName) return null;
  const officeTokens = new Set(
    officeName.split(" ").filter((token) => token.length > 2)
  );

  const ranked = directory
    .map((deputy) => {
      const score = Math.max(
        0,
        ...deputy.aliases.map((alias) => {
          if (officeName === alias) return 100;
          if (officeName.includes(alias) || alias.includes(officeName)) return 50;
          return alias
            .split(" ")
            .filter((token) => token.length > 2 && officeTokens.has(token)).length;
        })
      );
      return { deputy, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return {
    deputy: ranked[0].deputy,
    method: "aproximacao-nome",
    confidence: ranked[0].score >= 3 ? "media" : "baixa"
  };
}

async function newestSnapshot(directory) {
  const files = (await fs.readdir(RAW_DIRECTORY).catch(() => []))
    .filter((name) => /^funcionarios-\d{4}-\d{2}-\d{2}\.csv$/.test(name))
    .sort();
  if (!files.length) return null;

  const name = files.at(-1);
  const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const { headers, records } = parseCsv(
    decodeCsv(await fs.readFile(path.join(RAW_DIRECTORY, name)))
  );
  const schema = inspectSnapshotSchema(headers);
  const metadata = await readJsonIfExists(
    path.join(RAW_DIRECTORY, name.replace(".csv", ".metadata.json"))
  );
  const groups = new Map();
  const mappedByMethod = {};
  const unmappedSamples = [];
  let secretaryRows = 0;
  let mappedRows = 0;

  for (const record of records) {
    if (!isParliamentarySecretary(record, schema)) continue;
    secretaryRows += 1;
    const match = matchDeputy(record, schema, directory);
    if (!match) {
      if (unmappedSamples.length < 20) {
        unmappedSamples.push({
          name: firstValue(record, [schema.name]),
          office: firstValue(record, [schema.office]),
          lotation: firstValue(record, [schema.lotation])
        });
      }
      continue;
    }

    mappedRows += 1;
    mappedByMethod[match.method] = Number(mappedByMethod[match.method] ?? 0) + 1;
    const deputyId = String(match.deputy.id);
    const staff = groups.get(deputyId) ?? [];
    const lotation = firstValue(record, [schema.lotation, schema.office]);
    staff.push({
      key:
        firstValue(record, [schema.point]) ||
        stableId([deputyId, firstValue(record, [schema.name]), lotation]),
      name: firstValue(record, [schema.name]) || "Não identificado",
      point: firstValue(record, [schema.point]),
      category: firstValue(record, [schema.category]),
      cargo: firstValue(record, [schema.cargo]),
      function: firstValue(record, [schema.function]),
      lotation,
      appointmentDate: firstValue(record, [schema.appointmentDate]),
      matchMethod: match.method,
      matchConfidence: match.confidence
    });
    groups.set(deputyId, staff);
  }

  console.log(`Snapshot ${date}: ${records.length} linha(s), ${secretaryRows} secretário(s) detectado(s), ${mappedRows} associado(s).`);
  console.log(`Cabeçalhos do snapshot: ${headers.join(" | ")}`);
  console.log(`Associações por método: ${JSON.stringify(mappedByMethod)}`);
  if (unmappedSamples.length) {
    console.log(`Amostras não associadas: ${JSON.stringify(unmappedSamples.slice(0, 5))}`);
  }

  return {
    date,
    sourceUrl: metadata?.sourceUrl ?? "",
    checksum: metadata?.sha256 ?? "",
    groups,
    totalRows: records.length,
    secretaryRows,
    mappedRows,
    unmapped: Math.max(0, secretaryRows - mappedRows),
    mappedByMethod,
    unmappedSamples,
    schema
  };
}

function monthDistance(first, second) {
  const [yearA, monthA] = first.split("-").map(Number);
  const [yearB, monthB] = second.split("-").map(Number);
  return (yearB - yearA) * 12 + monthB - monthA;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function utilizationBand(rate) {
  if (!Number.isFinite(rate)) return "sem-dados";
  if (rate >= 0.95) return "quase-integral";
  if (rate >= 0.85) return "alta";
  if (rate >= 0.65) return "intermediaria";
  return "baixa";
}

function variationBand(coefficient) {
  if (!Number.isFinite(coefficient)) return "sem-dados";
  if (coefficient < 0.05) return "estavel";
  if (coefficient < 0.12) return "moderada";
  return "alta";
}

function trendBand(months) {
  if (months.length < 4) return "dados-insuficientes";
  const split = Math.max(2, Math.floor(months.length / 2));
  const first = months.slice(0, split);
  const last = months.slice(-split);
  const firstAverage =
    first.reduce((total, month) => total + month.totalSpent, 0) / first.length;
  const lastAverage =
    last.reduce((total, month) => total + month.totalSpent, 0) / last.length;
  if (!firstAverage) return "dados-insuficientes";
  const change = (lastAverage - firstAverage) / firstAverage;
  if (change >= 0.1) return "crescente";
  if (change <= -0.1) return "decrescente";
  return "estavel";
}

function teamSizeBand(count) {
  if (count === null || count === undefined) return "nao-associada";
  if (count < 5) return "ate-4";
  if (count <= 9) return "5-a-9";
  if (count <= 17) return "10-a-17";
  if (count <= 25) return "18-a-25";
  return "acima-de-25";
}

function computeSummary(months, currentSnapshot, signals) {
  const latest = months.at(-1) ?? null;
  const spentValues = months.map((month) => Number(month.totalSpent ?? 0));
  const accumulatedSpent = spentValues.reduce((total, value) => total + value, 0);
  const accumulatedAvailable = months.reduce(
    (total, month) => total + Number(month.totalAvailable ?? 0),
    0
  );
  const accumulatedUnused = months.reduce(
    (total, month) =>
      total +
      Math.max(
        0,
        Number(month.totalAvailable ?? 0) - Number(month.totalSpent ?? 0)
      ),
    0
  );
  const averageMonthlySpent = months.length ? accumulatedSpent / months.length : 0;
  const coefficientOfVariation = averageMonthlySpent
    ? standardDeviation(spentValues) / averageMonthlySpent
    : 0;
  const maxMonth = [...months].sort(
    (a, b) => Number(b.totalSpent ?? 0) - Number(a.totalSpent ?? 0)
  )[0] ?? null;
  const minMonth = [...months].sort(
    (a, b) => Number(a.totalSpent ?? 0) - Number(b.totalSpent ?? 0)
  )[0] ?? null;
  const highPriorityCount = signals.filter(
    (signal) => signal.severity === "alta"
  ).length;

  return {
    monthCount: months.length,
    periodStart: months[0]?.competence ?? null,
    periodEnd: latest?.competence ?? null,
    latestCompetence: latest?.competence ?? null,
    latestTotalPublished: Number(latest?.totalSpent ?? 0),
    latestTotalAvailable: Number(latest?.totalAvailable ?? 0),
    latestUtilization: Number(latest?.utilization ?? 0),
    accumulatedSpent,
    accumulatedAvailable,
    accumulatedUnused,
    accumulatedUtilization:
      accumulatedAvailable > 0 ? accumulatedSpent / accumulatedAvailable : 0,
    averageMonthlySpent,
    medianMonthlySpent: median(spentValues),
    maxMonthlySpent: Number(maxMonth?.totalSpent ?? 0),
    maxMonthlyCompetence: maxMonth?.competence ?? null,
    minMonthlySpent: Number(minMonth?.totalSpent ?? 0),
    minMonthlyCompetence: minMonth?.competence ?? null,
    coefficientOfVariation,
    monthsAbove95: months.filter((month) => Number(month.utilization ?? 0) >= 0.95)
      .length,
    monthsBelow75: months.filter((month) => Number(month.utilization ?? 0) < 0.75)
      .length,
    currentSnapshotStaffCount: currentSnapshot?.staffCount ?? null,
    currentSnapshotStatus: currentSnapshot?.matchStatus ?? "indisponivel",
    signalCount: signals.length,
    signalTypeCount: new Set(signals.map((signal) => signal.type)).size,
    highPriorityCount,
    largestMonthlyChange: signals
      .filter((signal) => signal.type === "variacao-gasto-gabinete")
      .reduce(
        (largest, signal) =>
          Math.max(largest, Math.abs(Number(signal.metrics?.absoluteChange ?? 0))),
        0
      ),
    priority: highPriorityCount ? "alta" : signals.length ? "media" : "baixa",
    classification: {
      utilization: utilizationBand(
        accumulatedAvailable > 0 ? accumulatedSpent / accumulatedAvailable : NaN
      ),
      variation: variationBand(coefficientOfVariation),
      trend: trendBand(months),
      teamSize: teamSizeBand(currentSnapshot?.staffCount)
    }
  };
}

function buildSignals(deputyId, months) {
  const signals = [];
  for (let index = 1; index < months.length; index += 1) {
    const previous = months[index - 1];
    const current = months[index];
    if (monthDistance(previous.competence, current.competence) !== 1) continue;
    const change = current.totalSpent - previous.totalSpent;
    const percentage = previous.totalSpent ? change / previous.totalSpent : 0;

    if (Math.abs(change) >= 20_000 && Math.abs(percentage) >= 0.2) {
      signals.push({
        id: stableId([
          "office-budget-v4",
          deputyId,
          "monthly-change",
          previous.competence,
          current.competence
        ]),
        type: "variacao-gasto-gabinete",
        label: "Variação relevante do gasto mensal",
        severity: Math.abs(percentage) >= 0.5 ? "alta" : "media",
        competence: current.competence,
        sourceYears: [
          ...new Set([
            Number(previous.competence.slice(0, 4)),
            Number(current.competence.slice(0, 4))
          ])
        ],
        documentIds: [previous.documentId, current.documentId],
        detail:
          `O valor gasto informado pela Câmara variou ${
            percentage >= 0 ? "mais" : "menos"
          } ${Math.abs(percentage * 100).toFixed(1)}% entre ${
            previous.competence
          } e ${current.competence}.`,
        metrics: {
          previousSpent: previous.totalSpent,
          currentSpent: current.totalSpent,
          absoluteChange: change,
          percentageChange: percentage
        }
      });
    }
  }
  return signals;
}

const deputyDirectory = await loadDeputyDirectory();
const snapshot = await newestSnapshot(deputyDirectory);
const directFiles = snapshotOnly
  ? []
  : (await fs.readdir(RAW_DIRECTORY).catch(() => []))
      .filter((name) => /^verba-gabinete-\d{4}\.json$/.test(name))
      .sort();

const entries = [];
for (const fileName of directFiles) {
  const payload = await readJsonIfExists(path.join(RAW_DIRECTORY, fileName));
  for (const item of Array.isArray(payload?.data) ? payload.data : []) {
    if (
      item?.deputyId &&
      item?.year &&
      Array.isArray(item?.months) &&
      item.months.length
    ) {
      entries.push(item);
    }
  }
}

if (snapshotOnly && snapshot) {
  for (const deputy of deputyDirectory) {
    entries.push({
      deputyId: String(deputy.id),
      deputyName: deputy.name,
      year: currentYear,
      officeNumber: deputy.officeNumber ?? null,
      sourceUrl: "",
      checksum: "",
      months: [],
      snapshotOnly: true
    });
  }
}

const cases = entries.map((entry) => {
  const documentId = `verba-gabinete:${entry.deputyId}:${entry.year}`;
  const months = entry.months
    .map((month) => {
      const totalAvailable = Number(month.available ?? 0);
      const totalSpent = Number(month.spent ?? 0);
      return {
        competence: `${entry.year}-${String(month.month).padStart(2, "0")}`,
        totalAvailable,
        totalSpent,
        totalPublished: totalSpent,
        utilization: totalAvailable > 0 ? totalSpent / totalAvailable : 0,
        staffCount: null,
        documentId,
        sourceUrl: entry.sourceUrl
      };
    })
    .sort((a, b) => a.competence.localeCompare(b.competence));

  const missingCompetences = [];
  for (let index = 1; index < months.length; index += 1) {
    if (
      monthDistance(
        months[index - 1].competence,
        months[index].competence
      ) > 1
    ) {
      missingCompetences.push(
        `${months[index - 1].competence} → ${months[index].competence}`
      );
    }
  }

  const mappedStaff =
    Number(entry.year) === currentYear && snapshot
      ? snapshot.groups.get(String(entry.deputyId))
      : undefined;
  const currentStaff = [...(mappedStaff ?? [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), "pt-BR")
  );
  const currentSnapshot =
    Number(entry.year) === currentYear && snapshot
      ? {
          date: snapshot.date,
          sourceUrl: snapshot.sourceUrl,
          staffCount: mappedStaff ? currentStaff.length : null,
          staff: currentStaff,
          matchStatus: mappedStaff ? "associado" : "nao-associado",
          officeNumber: entry.officeNumber ?? null,
          sourceSecretaryRows: snapshot.secretaryRows,
          mappedSecretaryRows: snapshot.mappedRows
        }
      : null;

  const signals = buildSignals(String(entry.deputyId), months);
  const documents = [];
  if (months.length) {
    documents.push({
      id: documentId,
      type: "pagina-verba-gabinete",
      competence: String(entry.year),
      sourceUrl: entry.sourceUrl,
      checksum: entry.checksum ?? "",
      acceptedRows: months.length,
      description:
        "Página oficial individual da Câmara com valor disponível e valor gasto por mês."
    });
  }
  if (currentSnapshot) {
    documents.push({
      id: `funcionarios:${currentSnapshot.date}`,
      type: "snapshot-funcionarios",
      competence: currentSnapshot.date,
      sourceUrl: currentSnapshot.sourceUrl,
      checksum: snapshot?.checksum ?? "",
      acceptedRows: currentSnapshot.staffCount ?? 0,
      description:
        "Snapshot atual de secretários parlamentares; representa a posição do dia anterior."
    });
  }

  return {
    deputyId: String(entry.deputyId),
    deputyName: String(entry.deputyName),
    analyzedYear: Number(entry.year),
    officeBudget: {
      version: 4,
      sourceModule: "office_budget",
      snapshotOnly: Boolean(entry.snapshotOnly),
      generatedAt: new Date().toISOString(),
      analyzedYear: Number(entry.year),
      profile: {
        officeNumber: entry.officeNumber ?? null
      },
      months,
      staffProfiles: currentStaff.map((employee) => ({
        ...employee,
        firstSeen: snapshot?.date,
        lastSeen: snapshot?.date,
        snapshotsPresent: 1
      })),
      currentSnapshot,
      signals,
      documents,
      summary: computeSummary(months, currentSnapshot, signals),
      dataQuality: {
        exactDuplicatesRemoved: 0,
        snapshotTotalRows: Number(snapshot?.totalRows ?? 0),
        snapshotSecretaryRows: Number(snapshot?.secretaryRows ?? 0),
        snapshotMappedRows: Number(snapshot?.mappedRows ?? 0),
        unmappedRowCount: Number(snapshot?.unmapped ?? 0),
        mappedByMethod: snapshot?.mappedByMethod ?? {},
        snapshotSchema: snapshot?.schema ?? {},
        unmappedSamples: snapshot?.unmappedSamples ?? [],
        missingCompetences,
        salaryBasis:
          "O histórico mensal usa diretamente os valores disponível e gasto publicados na página individual de verba de gabinete da Câmara. Não é a soma da folha geral de remuneração.",
        snapshotCaveat:
          "A lista de integrantes é um snapshot do dia anterior. A ausência de associação não significa que o gabinete esteja sem equipe."
      },
      disclaimer:
        "Faixas, variações e dados funcionais organizam a apuração, mas não comprovam nepotismo, funcionário fantasma, ausência de trabalho ou outra irregularidade."
    }
  };
});

cases.sort(
  (a, b) =>
    b.officeBudget.summary.highPriorityCount -
      a.officeBudget.summary.highPriorityCount ||
    b.officeBudget.summary.signalCount -
      a.officeBudget.summary.signalCount ||
    b.officeBudget.summary.accumulatedSpent -
      a.officeBudget.summary.accumulatedSpent ||
    a.deputyName.localeCompare(b.deputyName, "pt-BR")
);

const date = new Date().toISOString().slice(0, 10);
const output = path.join(
  OUTPUT_DIRECTORY,
  `verba-gabinete-${date}.json`
);
await fs.writeFile(
  output,
  JSON.stringify(
    {
      metadata: {
        version: 4,
        generatedAt: new Date().toISOString(),
        snapshotOnly,
        caseCount: cases.length,
        monthlyRowCount: cases.reduce(
          (total, item) => total + item.officeBudget.months.length,
          0
        ),
        snapshotSecretaryRows: snapshot?.secretaryRows ?? 0,
        snapshotMappedRows: snapshot?.mappedRows ?? 0,
        source:
          "Páginas individuais de verba de gabinete e snapshot funcional da Câmara dos Deputados.",
        disclaimer:
          "Sinais técnicos e classificações são pistas descritivas para conferência e não comprovam irregularidade."
      },
      data: cases
    },
    null,
    2
  )
);

console.log(`Casos de verba de gabinete: ${cases.length}`);
console.log(
  `Competências mensais aproveitadas: ${cases.reduce(
    (total, item) => total + item.officeBudget.months.length,
    0
  )}`
);
console.log(`Snapshot funcional: ${snapshot ? snapshot.date : "indisponível"}`);
console.log(
  `Secretários associados: ${snapshot?.mappedRows ?? 0}/${
    snapshot?.secretaryRows ?? 0
  }`
);
console.log(`Arquivo gerado: ${output}`);
