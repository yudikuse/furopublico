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

function parseNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function decodeCsv(buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  if (replacementCount <= 3) return utf8.replace(/^\uFEFF/, "");
  return new TextDecoder("windows-1252").decode(buffer).replace(/^\uFEFF/, "");
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length
    }))
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

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, "").trim());
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }

  if (!rows.length) return { headers: [], records: [] };

  const headerIndex = rows
    .slice(0, 25)
    .map((candidate, index) => {
      const normalizedCells = candidate.map(compact);
      const keywords = [
        "nome",
        "ponto",
        "matricula",
        "lotacao",
        "cargo",
        "categoriafuncional",
        "remuneracao",
        "rendimentos"
      ];
      const score = keywords.filter((keyword) =>
        normalizedCells.some((cell) => cell.includes(keyword))
      ).length;
      return { index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];

  const selectedIndex = headerIndex?.score >= 2 ? headerIndex.index : 0;
  const headers = rows[selectedIndex].map(
    (value, index) => value || `coluna_${index + 1}`
  );
  const records = rows.slice(selectedIndex + 1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
  return { headers, records };
}

function headerIndex(headers) {
  return new Map(headers.map((header) => [compact(header), header]));
}

function findHeader(headers, candidates, contains = []) {
  const index = headerIndex(headers);
  for (const candidate of candidates) {
    const found = index.get(compact(candidate));
    if (found) return found;
  }

  for (const [normalized, original] of index) {
    if (contains.some((candidate) => normalized.includes(compact(candidate)))) {
      return original;
    }
  }
  return "";
}

function firstValue(record, headers) {
  for (const header of headers) {
    if (!header) continue;
    const value = String(record[header] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function monthDistance(first, second) {
  const [yearA, monthA] = first.split("-").map(Number);
  const [yearB, monthB] = second.split("-").map(Number);
  return (yearB - yearA) * 12 + monthB - monthA;
}

function extractOfficeName(lotation) {
  const text = normalize(lotation)
    .replace(/\bgabinete\b/g, " ")
    .replace(/\bdo\b|\bda\b|\bde\b/g, " ")
    .replace(/\bdeputado\b|\bdeputada\b|\bdep\b/g, " ")
    .replace(/\bcamara dos deputados\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function loadDeputyDirectory() {
  const preferred = await readJsonIfExists(path.join(RAW_DIRECTORY, "deputados.json"));
  const directory = path.resolve("data/raw");
  let names = [];
  if (!preferred) {
    try {
      names = (await fs.readdir(directory))
        .filter((name) => /deputados.*\.json$/i.test(name))
        .sort();
    } catch {
      names = [];
    }
  }

  const payload = preferred ?? (names.length
    ? await readJsonIfExists(path.join(directory, names.at(-1)))
    : null);
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.dados)
      ? payload.dados
      : Array.isArray(payload)
        ? payload
        : [];

  return rows.map((row) => {
    const status = row.ultimoStatus ?? row.status ?? {};
    const aliases = [
      row.nome,
      row.nomeCivil,
      row.nomeEleitoral,
      status.nome,
      status.nomeEleitoral
    ]
      .filter(Boolean)
      .map(normalize);
    const id = String(
      row.id ?? status.id ?? String(row.uri ?? "").match(/(\d+)$/)?.[1] ?? ""
    );
    return {
      id,
      name: String(status.nome ?? row.nomeEleitoral ?? row.nome ?? "").trim(),
      aliases: [...new Set(aliases)]
    };
  }).filter((item) => item.name);
}

function matchDeputy(lotation, directory) {
  const office = extractOfficeName(lotation);
  if (!office) return null;

  const exact = directory.find((deputy) => deputy.aliases.includes(office));
  if (exact) return exact;

  const candidates = directory
    .map((deputy) => ({
      deputy,
      score: Math.max(
        ...deputy.aliases.map((alias) => {
          if (office.includes(alias) || alias.includes(office)) {
            return Math.min(office.length, alias.length);
          }
          const officeTokens = new Set(office.split(" ").filter((token) => token.length > 2));
          const aliasTokens = alias.split(" ").filter((token) => token.length > 2);
          return aliasTokens.filter((token) => officeTokens.has(token)).length;
        })
      )
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.deputy ?? null;
}

function inspectSchema(headers) {
  const schema = {
    name: findHeader(headers, ["nome", "nome do servidor", "servidor"], ["nome"]),
    point: findHeader(headers, ["ponto", "numero do ponto", "matricula"], ["ponto", "matricula"]),
    category: findHeader(headers, ["categoria funcional", "categoria", "vinculo"], ["categoriafuncional", "vinculo"]),
    cargo: findHeader(headers, ["cargo", "cargo efetivo"], ["cargo"]),
    function: findHeader(headers, ["funcao", "funcao comissionada"], ["funcao"]),
    lotation: findHeader(headers, ["lotacao", "local de trabalho", "unidade"], ["lotacao", "localdetrabalho"]),
    office: findHeader(headers, ["deputado", "parlamentar", "gabinete"], ["deputado", "parlamentar", "gabinete"]),
    gross: findHeader(
      headers,
      [
        "total de rendimentos",
        "remuneracao bruta",
        "remuneracao total",
        "total remuneracao",
        "remuneracao do mes"
      ],
      ["totalderendimentos", "remuneracaobruta", "remuneracaototal"]
    ),
    net: findHeader(
      headers,
      [
        "remuneracao apos descontos obrigatorios",
        "remuneracao liquida",
        "liquido"
      ],
      ["aposdescontosobrigatorios", "remuneracaoliquida"]
    ),
    basic: findHeader(headers, ["remuneracao basica", "vencimento basico"], ["remuneracaobasica", "vencimentobasico"]),
    personal: findHeader(headers, ["vantagens pessoais"], ["vantagenspessoais"]),
    commission: findHeader(headers, ["funcao ou cargo em comissao"], ["cargoemcomissao", "funcaocomissionada"]),
    thirteenth: findHeader(headers, ["gratificacao natalina", "decimo terceiro"], ["gratificacaonatalina", "decimoterceiro"]),
    vacation: findHeader(headers, ["ferias"], ["ferias"]),
    eventual: findHeader(headers, ["outras remuneracoes eventuais"], ["outrasremuneracoes", "eventuais"])
  };
  return schema;
}

function remunerationAmount(record, schema) {
  if (schema.gross) {
    return { amount: parseNumber(record[schema.gross]), basis: schema.gross };
  }

  const components = [
    schema.basic,
    schema.personal,
    schema.commission,
    schema.thirteenth,
    schema.vacation,
    schema.eventual
  ].filter(Boolean);
  const componentTotal = sum(components.map((header) => parseNumber(record[header])));
  if (componentTotal > 0) {
    return { amount: componentTotal, basis: components.join(" + ") };
  }

  if (schema.net) {
    return { amount: parseNumber(record[schema.net]), basis: schema.net };
  }
  return { amount: 0, basis: "campo não identificado" };
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

async function newestSnapshot() {
  let files = [];
  try {
    files = (await fs.readdir(RAW_DIRECTORY))
      .filter((name) => /^funcionarios-\d{4}-\d{2}-\d{2}\.csv$/.test(name))
      .sort();
  } catch {
    return null;
  }
  if (!files.length) return null;

  const name = files.at(-1);
  const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const buffer = await fs.readFile(path.join(RAW_DIRECTORY, name));
  const { headers, records } = parseCsv(decodeCsv(buffer));
  const schema = inspectSchema(headers);
  const metadata = await readJsonIfExists(
    path.join(RAW_DIRECTORY, name.replace(".csv", ".metadata.json"))
  );
  return { date, headers, records, schema, metadata };
}

const deputyDirectory = await loadDeputyDirectory();
const snapshot = await newestSnapshot();
const snapshotByPoint = new Map();

if (snapshot) {
  for (const record of snapshot.records) {
    if (!isParliamentarySecretary(record, snapshot.schema)) continue;
    const point = firstValue(record, [snapshot.schema.point]);
    if (!point) continue;
    snapshotByPoint.set(point, record);
  }
}

const monthlyFiles = snapshotOnly
  ? []
  : (await fs.readdir(RAW_DIRECTORY).catch(() => []))
      .filter((name) => /^remuneracao-\d{4}-\d{2}\.csv$/.test(name))
      .sort();

const rows = [];
const sourceDocuments = [];
const exactKeys = new Set();
let exactDuplicatesRemoved = 0;
const duplicateCountsByDeputyYear = new Map();
const unmappedRows = [];

for (const fileName of monthlyFiles) {
  const competence = fileName.match(/(\d{4}-\d{2})/)?.[1];
  if (!competence) continue;
  const year = Number(competence.slice(0, 4));
  const filePath = path.join(RAW_DIRECTORY, fileName);
  const buffer = await fs.readFile(filePath);
  const { headers, records } = parseCsv(decodeCsv(buffer));
  const schema = inspectSchema(headers);
  const metadata = await readJsonIfExists(
    path.join(RAW_DIRECTORY, fileName.replace(".csv", ".metadata.json"))
  );

  const documentId = `remuneracao:${competence}`;
  let acceptedRows = 0;

  for (const record of records) {
    if (!isParliamentarySecretary(record, schema)) continue;

    const point = firstValue(record, [schema.point]);
    const currentRecord = point ? snapshotByPoint.get(point) : null;
    const lotation = firstValue(record, [schema.office, schema.lotation]) ||
      (currentRecord
        ? firstValue(currentRecord, [snapshot?.schema.office, snapshot?.schema.lotation])
        : "");
    const deputy = matchDeputy(lotation, deputyDirectory);
    if (!deputy) {
      unmappedRows.push({ competence, point, lotation, name: firstValue(record, [schema.name]) });
      continue;
    }

    const name = firstValue(record, [schema.name]) ||
      (currentRecord ? firstValue(currentRecord, [snapshot?.schema.name]) : "Não identificado");
    const amountData = remunerationAmount(record, schema);
    const rowKey = stableId([
      competence,
      deputy.id || deputy.name,
      point || name,
      lotation,
      amountData.amount,
      JSON.stringify(record)
    ]);
    if (exactKeys.has(rowKey)) {
      exactDuplicatesRemoved += 1;
      const duplicateKey = `${deputy.id || normalize(deputy.name)}|${year}`;
      duplicateCountsByDeputyYear.set(
        duplicateKey,
        Number(duplicateCountsByDeputyYear.get(duplicateKey) ?? 0) + 1
      );
      continue;
    }
    exactKeys.add(rowKey);

    rows.push({
      competence,
      year,
      deputyId: deputy.id,
      deputyName: deputy.name,
      name,
      point,
      category: firstValue(record, [schema.category]),
      cargo: firstValue(record, [schema.cargo]),
      function: firstValue(record, [schema.function]),
      lotation,
      amount: amountData.amount,
      amountBasis: amountData.basis,
      documentId,
      sourceUrl: metadata?.sourceUrl ?? "",
      raw: record
    });
    acceptedRows += 1;
  }

  sourceDocuments.push({
    id: documentId,
    type: "relatorio-remuneracao-mensal",
    competence,
    sourceUrl: metadata?.sourceUrl ?? "",
    checksum: metadata?.sha256 ?? "",
    acceptedRows,
    description:
      "Relatório consolidado mensal de remuneração publicado pela Câmara dos Deputados."
  });
}

const snapshotGroups = new Map();
if (snapshot) {
  for (const record of snapshot.records) {
    if (!isParliamentarySecretary(record, snapshot.schema)) continue;
    const lotation = firstValue(record, [snapshot.schema.office, snapshot.schema.lotation]);
    const deputy = matchDeputy(lotation, deputyDirectory);
    if (!deputy) continue;
    const key = deputy.id || normalize(deputy.name);
    const list = snapshotGroups.get(key) ?? [];
    list.push({
      name: firstValue(record, [snapshot.schema.name]),
      point: firstValue(record, [snapshot.schema.point]),
      category: firstValue(record, [snapshot.schema.category]),
      cargo: firstValue(record, [snapshot.schema.cargo]),
      function: firstValue(record, [snapshot.schema.function]),
      lotation,
      appointmentDate: firstValue(record, [
        findHeader(snapshot.headers, ["data de nomeacao", "nomeacao"], ["datanomeacao", "nomeacao"])
      ])
    });
    snapshotGroups.set(key, list);
  }
}

const globalPointCompetences = new Map();
for (const row of rows) {
  if (!row.point) continue;
  const key = `${row.competence}|${row.point}`;
  const offices = globalPointCompetences.get(key) ?? new Map();
  offices.set(row.deputyId || normalize(row.deputyName), row.deputyName);
  globalPointCompetences.set(key, offices);
}

const byDeputyYear = new Map();
for (const row of rows) {
  const key = `${row.deputyId || normalize(row.deputyName)}|${row.year}`;
  const group = byDeputyYear.get(key) ?? {
    deputyId: row.deputyId,
    deputyName: row.deputyName,
    analyzedYear: row.year,
    rows: []
  };
  group.rows.push(row);
  byDeputyYear.set(key, group);
}

if (snapshotOnly && snapshot) {
  for (const deputy of deputyDirectory) {
    const key = deputy.id || normalize(deputy.name);
    const staff = snapshotGroups.get(key) ?? [];
    if (!staff.length) continue;
    const caseKey = `${key}|${Number(snapshot.date.slice(0, 4))}`;
    if (!byDeputyYear.has(caseKey)) {
      byDeputyYear.set(caseKey, {
        deputyId: deputy.id,
        deputyName: deputy.name,
        analyzedYear: Number(snapshot.date.slice(0, 4)),
        rows: []
      });
    }
  }
}

function buildCase(group) {
  const monthGroups = new Map();
  for (const row of group.rows) {
    const list = monthGroups.get(row.competence) ?? [];
    list.push(row);
    monthGroups.set(row.competence, list);
  }

  const staffProfiles = new Map();
  const monthSets = new Map();
  const months = [...monthGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([competence, monthRows]) => {
      const employeeMap = new Map();
      for (const row of monthRows) {
        const employeeKey = row.point || normalize(row.name);
        const current = employeeMap.get(employeeKey) ?? {
          key: employeeKey,
          name: row.name,
          point: row.point,
          cargo: row.cargo,
          function: row.function,
          lotation: row.lotation,
          amount: 0,
          amountBasis: row.amountBasis
        };
        current.amount += row.amount;
        current.cargo ||= row.cargo;
        current.function ||= row.function;
        current.lotation ||= row.lotation;
        employeeMap.set(employeeKey, current);
      }

      const employees = [...employeeMap.values()].sort((a, b) => b.amount - a.amount);
      monthSets.set(competence, new Set(employees.map((employee) => employee.key)));
      for (const employee of employees) {
        const profile = staffProfiles.get(employee.key) ?? {
          key: employee.key,
          name: employee.name,
          point: employee.point,
          firstSeen: competence,
          lastSeen: competence,
          competences: [],
          latestAmount: 0,
          maximumAmount: 0,
          cargo: employee.cargo,
          function: employee.function,
          lotation: employee.lotation
        };
        profile.firstSeen = profile.firstSeen < competence ? profile.firstSeen : competence;
        profile.lastSeen = profile.lastSeen > competence ? profile.lastSeen : competence;
        profile.competences.push(competence);
        profile.latestAmount = employee.amount;
        profile.maximumAmount = Math.max(profile.maximumAmount, employee.amount);
        profile.cargo = employee.cargo || profile.cargo;
        profile.function = employee.function || profile.function;
        profile.lotation = employee.lotation || profile.lotation;
        staffProfiles.set(employee.key, profile);
      }

      const values = employees.map((employee) => employee.amount).filter((value) => value > 0);
      const totalPublished = sum(values);
      const top3Total = sum(values.sort((a, b) => b - a).slice(0, 3));
      const document = sourceDocuments.find((item) => item.competence === competence);
      return {
        competence,
        totalPublished,
        staffCount: employees.length,
        medianPublished: median(values),
        largestPublished: Math.max(0, ...values),
        top3Total,
        top3Share: totalPublished ? top3Total / totalPublished : 0,
        topEmployees: employees.slice(0, 5),
        documentId: document?.id ?? `remuneracao:${competence}`,
        sourceUrl: document?.sourceUrl ?? ""
      };
    });

  const signals = [];
  for (let index = 1; index < months.length; index += 1) {
    const previous = months[index - 1];
    const current = months[index];
    if (monthDistance(previous.competence, current.competence) !== 1) continue;

    const amountChange = current.totalPublished - previous.totalPublished;
    const amountPercent = previous.totalPublished
      ? amountChange / previous.totalPublished
      : 0;
    if (Math.abs(amountChange) >= 20_000 && Math.abs(amountPercent) >= 0.25) {
      signals.push({
        id: stableId(["office-budget", group.deputyId, "payroll-change", previous.competence, current.competence]),
        type: "variacao-folha-publicada",
        label: "Variação relevante da folha publicada",
        severity: Math.abs(amountPercent) >= 0.5 ? "alta" : "media",
        competence: current.competence,
        sourceYears: [...new Set([Number(previous.competence.slice(0, 4)), Number(current.competence.slice(0, 4))])],
        documentIds: [previous.documentId, current.documentId],
        detail:
          `A remuneração publicada variou ${amountPercent >= 0 ? "mais" : "menos"} ` +
          `${Math.abs(amountPercent * 100).toFixed(1)}% entre ${previous.competence} e ${current.competence}.`,
        metrics: {
          previousAmount: previous.totalPublished,
          currentAmount: current.totalPublished,
          absoluteChange: amountChange,
          percentageChange: amountPercent
        }
      });
    }

    const previousSet = monthSets.get(previous.competence) ?? new Set();
    const currentSet = monthSets.get(current.competence) ?? new Set();
    const added = [...currentSet].filter((key) => !previousSet.has(key));
    const removed = [...previousSet].filter((key) => !currentSet.has(key));
    const movement = added.length + removed.length;
    const reference = Math.max(previousSet.size, 1);
    if (movement >= 5 && movement / reference >= 0.25) {
      signals.push({
        id: stableId(["office-budget", group.deputyId, "staff-change", previous.competence, current.competence]),
        type: "variacao-equipe",
        label: "Variação relevante da equipe",
        severity: movement >= 9 || movement / reference >= 0.5 ? "alta" : "media",
        competence: current.competence,
        sourceYears: [...new Set([Number(previous.competence.slice(0, 4)), Number(current.competence.slice(0, 4))])],
        documentIds: [previous.documentId, current.documentId],
        detail:
          `${added.length} integrante(s) apareceram e ${removed.length} deixaram de aparecer ` +
          `entre ${previous.competence} e ${current.competence}. O relatório mensal não comprova a data exata de nomeação ou exoneração.`,
        metrics: {
          addedCount: added.length,
          removedCount: removed.length,
          previousStaffCount: previous.staffCount,
          currentStaffCount: current.staffCount
        }
      });
    }
  }

  for (const month of months) {
    if (month.staffCount >= 8 && month.top3Share >= 0.55) {
      signals.push({
        id: stableId(["office-budget", group.deputyId, "concentration", month.competence]),
        type: "concentracao-remuneracao",
        label: "Concentração da remuneração publicada",
        severity: month.top3Share >= 0.7 ? "alta" : "media",
        competence: month.competence,
        sourceYears: [Number(month.competence.slice(0, 4))],
        documentIds: [month.documentId],
        detail:
          `Os três maiores valores representam ${(month.top3Share * 100).toFixed(1)}% ` +
          `da remuneração publicada para ${month.staffCount} integrante(s) na competência.`,
        metrics: {
          top3Total: month.top3Total,
          totalPublished: month.totalPublished,
          top3Share: month.top3Share,
          staffCount: month.staffCount
        }
      });
    }
  }

  for (const row of group.rows) {
    if (!row.point) continue;
    const offices = globalPointCompetences.get(`${row.competence}|${row.point}`);
    if (!offices || offices.size < 2) continue;
    signals.push({
      id: stableId(["office-budget", row.point, "multiple-offices", row.competence]),
      type: "lotacao-multipla-na-competencia",
      label: "Registro em mais de uma lotação na competência",
      severity: "media",
      competence: row.competence,
      sourceYears: [row.year],
      documentIds: [row.documentId],
      detail:
        `${row.name} aparece associado a ${offices.size} gabinetes na mesma competência. ` +
        `O registro exige conferência da fonte e não comprova acumulação funcional.`,
      metrics: { offices: [...offices.values()] }
    });
  }

  const uniqueSignals = [...new Map(signals.map((signal) => [signal.id, signal])).values()];
  const latestMonth = months.at(-1) ?? null;
  const snapshotKey = group.deputyId || normalize(group.deputyName);
  const currentStaff = snapshotGroups.get(snapshotKey) ?? [];
  const currentSnapshot = snapshot
    ? {
        date: snapshot.date,
        sourceUrl: snapshot.metadata?.sourceUrl ?? "",
        staffCount: currentStaff.length,
        staff: currentStaff
      }
    : null;

  const moduleDocuments = sourceDocuments.filter((document) =>
    months.some((month) => month.documentId === document.id)
  );
  if (currentSnapshot) {
    moduleDocuments.push({
      id: `funcionarios:${currentSnapshot.date}`,
      type: "snapshot-funcionarios",
      competence: currentSnapshot.date,
      sourceUrl: currentSnapshot.sourceUrl,
      checksum: snapshot.metadata?.sha256 ?? "",
      acceptedRows: currentSnapshot.staffCount,
      description:
        "Snapshot diário dos funcionários em atividade. A fonte representa a posição do dia anterior."
    });
  }

  const highPriorityCount = uniqueSignals.filter((signal) => signal.severity === "alta").length;
  const largestMonthlyChange = uniqueSignals
    .filter((signal) => signal.type === "variacao-folha-publicada")
    .reduce((largest, signal) =>
      Math.max(largest, Math.abs(Number(signal.metrics?.absoluteChange ?? 0))), 0);

  return {
    deputyId: group.deputyId,
    deputyName: group.deputyName,
    analyzedYear: group.analyzedYear,
    officeBudget: {
      version: 1,
      sourceModule: "office_budget",
      generatedAt: new Date().toISOString(),
      analyzedYear: group.analyzedYear,
      months,
      staffProfiles: [...staffProfiles.values()].map((profile) => ({
        ...profile,
        competences: [...new Set(profile.competences)].sort(),
        monthsPresent: new Set(profile.competences).size
      })),
      currentSnapshot,
      signals: uniqueSignals,
      documents: moduleDocuments,
      summary: {
        monthCount: months.length,
        latestCompetence: latestMonth?.competence ?? null,
        latestTotalPublished: latestMonth?.totalPublished ?? 0,
        latestStaffCount: latestMonth?.staffCount ?? 0,
        currentSnapshotStaffCount: currentSnapshot?.staffCount ?? null,
        signalCount: uniqueSignals.length,
        signalTypeCount: new Set(uniqueSignals.map((signal) => signal.type)).size,
        highPriorityCount,
        largestMonthlyChange,
        priority: highPriorityCount ? "alta" : uniqueSignals.length ? "media" : "baixa"
      },
      dataQuality: {
        exactDuplicatesRemoved: Number(
          duplicateCountsByDeputyYear.get(
            `${group.deputyId || normalize(group.deputyName)}|${group.analyzedYear}`
          ) ?? 0
        ),
        unmappedRowCount: null,
        salaryBasis:
          "Valor publicado no relatório mensal. A coluna utilizada é registrada em cada origem e pode conter parcelas que não integram o limite mensal da verba de gabinete.",
        snapshotCaveat:
          "O arquivo de funcionários representa a posição do dia anterior e não reconstrói sozinho mudanças históricas."
      },
      disclaimer:
        "Os sinais organizam variações documentadas e não comprovam funcionário fantasma, nepotismo, acumulação indevida ou qualquer irregularidade. Nomeação, exoneração, lotação e vínculo exigem confirmação em documento oficial e contraditório."
    }
  };
}

const cases = [...byDeputyYear.values()].map(buildCase);
cases.sort((a, b) =>
  b.officeBudget.summary.highPriorityCount - a.officeBudget.summary.highPriorityCount ||
  b.officeBudget.summary.signalCount - a.officeBudget.summary.signalCount ||
  a.deputyName.localeCompare(b.deputyName, "pt-BR")
);

const date = new Date().toISOString().slice(0, 10);
const output = path.join(OUTPUT_DIRECTORY, `verba-gabinete-${date}.json`);
await fs.writeFile(
  output,
  JSON.stringify(
    {
      metadata: {
        generatedAt: new Date().toISOString(),
        snapshotOnly,
        caseCount: cases.length,
        remunerationRowCount: rows.length,
        exactDuplicatesRemoved,
        unmappedRowCount: unmappedRows.length,
        source:
          "Relatórios mensais de remuneração e arquivo diário de funcionários da Câmara dos Deputados.",
        disclaimer:
          "Sinais técnicos são pistas para conferência e não comprovam irregularidade."
      },
      data: cases,
      diagnostics: {
        unmappedRows: unmappedRows.slice(0, 500)
      }
    },
    null,
    2
  )
);

console.log(`Casos de verba de gabinete: ${cases.length}`);
console.log(`Registros mensais aproveitados: ${rows.length}`);
console.log(`Repetições exatas removidas: ${exactDuplicatesRemoved}`);
console.log(`Linhas sem parlamentar identificado: ${unmappedRows.length}`);
console.log(`Arquivo gerado: ${output}`);
