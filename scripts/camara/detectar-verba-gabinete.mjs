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

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function findHeader(headers, candidates, contains = []) {
  const normalized = headers.map((header) => ({ header, normalized: normalize(header), compact: compact(header) }));
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
    name: findHeader(headers, ["nome", "nome do servidor", "servidor"], ["nome"]),
    point: findHeader(headers, ["ponto", "numero do ponto", "matricula"], ["ponto", "matricula"]),
    category: findHeader(headers, ["categoria funcional", "categoria", "vinculo"], ["categoriafuncional", "vinculo"]),
    cargo: findHeader(headers, ["cargo", "cargo efetivo"], ["cargo"]),
    function: findHeader(headers, ["funcao", "funcao comissionada"], ["funcao"]),
    lotation: findHeader(headers, ["lotacao", "local de trabalho", "unidade"], ["lotacao", "localdetrabalho"]),
    office: findHeader(headers, ["deputado", "parlamentar", "gabinete"], ["deputado", "parlamentar", "gabinete"]),
    appointmentDate: findHeader(headers, ["data de nomeacao", "nomeacao"], ["datadenomeacao", "nomeacao"])
  };
}

function isParliamentarySecretary(record, schema) {
  const haystack = normalize(
    [schema.category, schema.cargo, schema.function, schema.lotation]
      .filter(Boolean)
      .map((header) => record[header])
      .join(" ")
  );
  return haystack.includes("secretario parlamentar");
}

function extractOfficeName(lotation) {
  return normalize(lotation)
    .replace(/\bgabinete\b/g, " ")
    .replace(/\bdo\b|\bda\b|\bde\b/g, " ")
    .replace(/\bdeputado\b|\bdeputada\b|\bdep\b/g, " ")
    .replace(/\bcamara dos deputados\b/g, " ")
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

async function loadDeputyDirectory() {
  const payload = await readJsonIfExists(path.join(RAW_DIRECTORY, "deputados.json"));
  const rows = Array.isArray(payload?.dados)
    ? payload.dados
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rows.map((row) => {
    const status = row.ultimoStatus ?? row.status ?? {};
    const aliases = [row.nome, row.nomeCivil, row.nomeEleitoral, status.nome, status.nomeEleitoral]
      .filter(Boolean)
      .map(normalize);
    const id = String(row.id ?? status.id ?? String(row.uri ?? "").match(/(\d+)$/)?.[1] ?? "");
    return {
      id,
      name: String(status.nome ?? row.nomeEleitoral ?? row.nome ?? "").trim(),
      aliases: [...new Set(aliases)]
    };
  }).filter((item) => item.id && item.name);
}

function matchDeputy(lotation, directory) {
  const office = extractOfficeName(lotation);
  if (!office) return null;
  const exact = directory.find((deputy) => deputy.aliases.includes(office));
  if (exact) return exact;

  const officeTokens = new Set(office.split(" ").filter((token) => token.length > 2));
  return directory
    .map((deputy) => ({
      deputy,
      score: Math.max(...deputy.aliases.map((alias) => {
        if (office.includes(alias) || alias.includes(office)) return Math.min(office.length, alias.length);
        return alias.split(" ").filter((token) => token.length > 2 && officeTokens.has(token)).length;
      }))
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)[0]?.deputy ?? null;
}

async function newestSnapshot(directory) {
  const files = (await fs.readdir(RAW_DIRECTORY).catch(() => []))
    .filter((name) => /^funcionarios-\d{4}-\d{2}-\d{2}\.csv$/.test(name))
    .sort();
  if (!files.length) return null;

  const name = files.at(-1);
  const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const { headers, records } = parseCsv(decodeCsv(await fs.readFile(path.join(RAW_DIRECTORY, name))));
  const schema = inspectSnapshotSchema(headers);
  const metadata = await readJsonIfExists(path.join(RAW_DIRECTORY, name.replace(".csv", ".metadata.json")));
  const groups = new Map();
  let unmapped = 0;

  for (const record of records) {
    if (!isParliamentarySecretary(record, schema)) continue;
    const lotation = firstValue(record, [schema.office, schema.lotation]);
    const deputy = matchDeputy(lotation, directory);
    if (!deputy) {
      unmapped += 1;
      continue;
    }
    const key = deputy.id;
    const staff = groups.get(key) ?? [];
    staff.push({
      key: firstValue(record, [schema.point]) || stableId([deputy.id, firstValue(record, [schema.name]), lotation]),
      name: firstValue(record, [schema.name]) || "Não identificado",
      point: firstValue(record, [schema.point]),
      cargo: firstValue(record, [schema.cargo]),
      function: firstValue(record, [schema.function]),
      lotation,
      appointmentDate: firstValue(record, [schema.appointmentDate])
    });
    groups.set(key, staff);
  }

  return { date, sourceUrl: metadata?.sourceUrl ?? "", checksum: metadata?.sha256 ?? "", groups, unmapped };
}

function monthDistance(first, second) {
  const [yearA, monthA] = first.split("-").map(Number);
  const [yearB, monthB] = second.split("-").map(Number);
  return (yearB - yearA) * 12 + monthB - monthA;
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
        id: stableId(["office-budget-v2", deputyId, "monthly-change", previous.competence, current.competence]),
        type: "variacao-gasto-gabinete",
        label: "Variação relevante do gasto mensal",
        severity: Math.abs(percentage) >= 0.5 ? "alta" : "media",
        competence: current.competence,
        sourceYears: [...new Set([Number(previous.competence.slice(0, 4)), Number(current.competence.slice(0, 4))])],
        documentIds: [previous.documentId, current.documentId],
        detail:
          `O valor gasto informado pela Câmara variou ${percentage >= 0 ? "mais" : "menos"} ` +
          `${Math.abs(percentage * 100).toFixed(1)}% entre ${previous.competence} e ${current.competence}.`,
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
    if (item?.deputyId && item?.year && Array.isArray(item?.months) && item.months.length) entries.push(item);
  }
}

if (snapshotOnly && snapshot) {
  for (const deputy of deputyDirectory) {
    if (!snapshot.groups.has(String(deputy.id))) continue;
    entries.push({
      deputyId: String(deputy.id),
      deputyName: deputy.name,
      year: currentYear,
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
    if (monthDistance(months[index - 1].competence, months[index].competence) > 1) {
      missingCompetences.push(`${months[index - 1].competence} → ${months[index].competence}`);
    }
  }

  const currentStaff = Number(entry.year) === currentYear
    ? [...(snapshot?.groups.get(String(entry.deputyId)) ?? [])].sort((a, b) =>
        String(a.name).localeCompare(String(b.name), "pt-BR")
      )
    : [];
  const currentSnapshot = Number(entry.year) === currentYear && snapshot
    ? {
        date: snapshot.date,
        sourceUrl: snapshot.sourceUrl,
        staffCount: currentStaff.length,
        staff: currentStaff
      }
    : null;

  const signals = buildSignals(String(entry.deputyId), months);
  const latest = months.at(-1) ?? null;
  const highPriorityCount = signals.filter((signal) => signal.severity === "alta").length;
  const largestMonthlyChange = signals.reduce(
    (largest, signal) => Math.max(largest, Math.abs(Number(signal.metrics?.absoluteChange ?? 0))),
    0
  );
  const documents = [{
    id: documentId,
    type: "pagina-verba-gabinete",
    competence: String(entry.year),
    sourceUrl: entry.sourceUrl,
    checksum: entry.checksum ?? "",
    acceptedRows: months.length,
    description: "Página oficial individual da Câmara com valor disponível e valor gasto por mês."
  }];
  if (currentSnapshot) {
    documents.push({
      id: `funcionarios:${currentSnapshot.date}`,
      type: "snapshot-funcionarios",
      competence: currentSnapshot.date,
      sourceUrl: currentSnapshot.sourceUrl,
      checksum: snapshot?.checksum ?? "",
      acceptedRows: currentSnapshot.staffCount,
      description: "Snapshot atual de secretários parlamentares; representa a posição do dia anterior."
    });
  }

  return {
    deputyId: String(entry.deputyId),
    deputyName: String(entry.deputyName),
    analyzedYear: Number(entry.year),
    officeBudget: {
      version: 2,
      sourceModule: "office_budget",
      snapshotOnly: Boolean(entry.snapshotOnly),
      generatedAt: new Date().toISOString(),
      analyzedYear: Number(entry.year),
      months,
      staffProfiles: currentStaff.map((employee) => ({
        ...employee,
        firstSeen: snapshot?.date,
        lastSeen: snapshot?.date,
        monthsPresent: null
      })),
      currentSnapshot,
      signals,
      documents,
      summary: {
        monthCount: months.length,
        latestCompetence: latest?.competence ?? null,
        latestTotalPublished: latest?.totalSpent ?? 0,
        latestTotalAvailable: latest?.totalAvailable ?? 0,
        latestUtilization: latest?.utilization ?? 0,
        latestStaffCount: null,
        currentSnapshotStaffCount: currentSnapshot?.staffCount ?? null,
        signalCount: signals.length,
        signalTypeCount: new Set(signals.map((signal) => signal.type)).size,
        highPriorityCount,
        largestMonthlyChange,
        priority: highPriorityCount ? "alta" : signals.length ? "media" : "baixa"
      },
      dataQuality: {
        exactDuplicatesRemoved: 0,
        unmappedRowCount: Number(entry.year) === currentYear ? Number(snapshot?.unmapped ?? 0) : 0,
        missingCompetences,
        salaryBasis:
          "O histórico mensal usa diretamente os valores disponível e gasto publicados na página individual de verba de gabinete da Câmara. Não é a soma da folha geral de remuneração.",
        snapshotCaveat:
          "A lista de integrantes é apenas o snapshot funcional atual. Ela não é usada para inferir quem compunha a equipe em competências históricas."
      },
      disclaimer:
        "Variações mensais e dados funcionais organizam a apuração, mas não comprovam nepotismo, funcionário fantasma, ausência de trabalho ou outra irregularidade."
    }
  };
});

cases.sort((a, b) =>
  b.officeBudget.summary.highPriorityCount - a.officeBudget.summary.highPriorityCount ||
  b.officeBudget.summary.signalCount - a.officeBudget.summary.signalCount ||
  a.deputyName.localeCompare(b.deputyName, "pt-BR")
);

const date = new Date().toISOString().slice(0, 10);
const output = path.join(OUTPUT_DIRECTORY, `verba-gabinete-${date}.json`);
await fs.writeFile(output, JSON.stringify({
  metadata: {
    version: 2,
    generatedAt: new Date().toISOString(),
    snapshotOnly,
    caseCount: cases.length,
    monthlyRowCount: cases.reduce((total, item) => total + item.officeBudget.months.length, 0),
    source: "Páginas individuais de verba de gabinete e snapshot funcional da Câmara dos Deputados.",
    disclaimer: "Sinais técnicos são pistas para conferência e não comprovam irregularidade."
  },
  data: cases
}, null, 2));

console.log(`Casos de verba de gabinete: ${cases.length}`);
console.log(`Competências mensais aproveitadas: ${cases.reduce((total, item) => total + item.officeBudget.months.length, 0)}`);
console.log(`Snapshot funcional: ${snapshot ? snapshot.date : "indisponível"}`);
console.log(`Arquivo gerado: ${output}`);
