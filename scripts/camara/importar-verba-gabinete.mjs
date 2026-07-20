import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
}

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [name, ...rest] = value.replace(/^--/, "").split("=");
    return [name, rest.length ? rest.join("=") : "true"];
  })
);

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function severityRank(value) {
  return { baixa: 0, media: 1, alta: 2 }[value] ?? 0;
}

function highestSeverity(first, second) {
  return severityRank(first) >= severityRank(second) ? first : second;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function unionBy(items, keyFunction) {
  return [...new Map(items.map((item) => [keyFunction(item), item])).values()];
}

function mergeStaffProfiles(previous = [], incoming = []) {
  const map = new Map();
  for (const profile of [...previous, ...incoming]) {
    if (!profile || typeof profile !== "object") continue;
    const key = String(profile.key ?? profile.point ?? normalize(profile.name));
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        ...profile,
        competences: [...new Set(profile.competences ?? [])].sort()
      });
      continue;
    }
    const competences = [...new Set([...(current.competences ?? []), ...(profile.competences ?? [])])].sort();
    map.set(key, {
      ...current,
      ...profile,
      firstSeen: [current.firstSeen, profile.firstSeen].filter(Boolean).sort()[0],
      lastSeen: [current.lastSeen, profile.lastSeen].filter(Boolean).sort().at(-1),
      maximumAmount: Math.max(Number(current.maximumAmount ?? 0), Number(profile.maximumAmount ?? 0)),
      competences,
      monthsPresent: competences.length
    });
  }
  return [...map.values()].sort((a, b) =>
    String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? "")) ||
    String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR")
  );
}

function signalTouchesYears(signal, years) {
  const sourceYears = Array.isArray(signal?.sourceYears)
    ? signal.sourceYears.map(Number)
    : signal?.competence
      ? [Number(String(signal.competence).slice(0, 4))]
      : [];
  return sourceYears.some((year) => years.has(year));
}

function recomputeSummary(module) {
  const months = [...(module.months ?? [])].sort((a, b) =>
    String(a.competence).localeCompare(String(b.competence))
  );
  const signals = module.signals ?? [];
  const latest = months.at(-1) ?? null;
  const highPriorityCount = signals.filter((signal) => signal.severity === "alta").length;
  const largestMonthlyChange = signals
    .filter((signal) => signal.type === "variacao-folha-publicada")
    .reduce(
      (largest, signal) =>
        Math.max(largest, Math.abs(Number(signal.metrics?.absoluteChange ?? 0))),
      0
    );

  return {
    monthCount: months.length,
    latestCompetence: latest?.competence ?? null,
    latestTotalPublished: Number(latest?.totalPublished ?? 0),
    latestStaffCount: Number(latest?.staffCount ?? 0),
    currentSnapshotStaffCount: module.currentSnapshot?.staffCount ?? null,
    signalCount: signals.length,
    signalTypeCount: new Set(signals.map((signal) => signal.type)).size,
    highPriorityCount,
    largestMonthlyChange,
    priority: highPriorityCount ? "alta" : signals.length ? "media" : "baixa"
  };
}

function mergeOfficeBudget(previous, incoming) {
  if (!previous) return incoming;
  const coveredYears = new Set(
    (incoming.months ?? []).map((month) => Number(String(month.competence).slice(0, 4)))
  );
  if (incoming.analyzedYear) coveredYears.add(Number(incoming.analyzedYear));

  const months = unionBy(
    [...(previous.months ?? []), ...(incoming.months ?? [])],
    (month) => String(month.competence)
  ).sort((a, b) => String(a.competence).localeCompare(String(b.competence)));

  const documents = unionBy(
    [...(previous.documents ?? []), ...(incoming.documents ?? [])],
    (document) => String(document.id)
  );

  const retainedSignals = (previous.signals ?? []).filter(
    (signal) => !signalTouchesYears(signal, coveredYears)
  );
  const signals = unionBy(
    [...retainedSignals, ...(incoming.signals ?? [])],
    (signal) => String(signal.id)
  );

  const snapshotHistory = unionBy(
    [
      ...(previous.snapshotHistory ?? []),
      ...(previous.currentSnapshot ? [previous.currentSnapshot] : []),
      ...(incoming.currentSnapshot ? [incoming.currentSnapshot] : [])
    ],
    (snapshot) => String(snapshot.date)
  ).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const merged = {
    ...previous,
    ...incoming,
    months,
    documents,
    signals,
    staffProfiles: mergeStaffProfiles(previous.staffProfiles, incoming.staffProfiles),
    currentSnapshot:
      String(incoming.currentSnapshot?.date ?? "") >=
      String(previous.currentSnapshot?.date ?? "")
        ? incoming.currentSnapshot ?? previous.currentSnapshot
        : previous.currentSnapshot,
    snapshotHistory,
    dataQuality: {
      ...(previous.dataQuality ?? {}),
      ...(incoming.dataQuality ?? {}),
      exactDuplicatesRemoved: Math.max(
        Number(previous.dataQuality?.exactDuplicatesRemoved ?? 0),
        Number(incoming.dataQuality?.exactDuplicatesRemoved ?? 0)
      )
    }
  };
  merged.summary = recomputeSummary(merged);
  return merged;
}

let file = args.get("file");
if (!file) {
  const directory = path.resolve("data/office-budget");
  const files = (await fs.readdir(directory))
    .filter((name) => /^verba-gabinete-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  file = files.at(-1) ? path.join(directory, files.at(-1)) : null;
}
if (!file) throw new Error("Nenhum arquivo processado de verba de gabinete encontrado.");

const payload = JSON.parse(await fs.readFile(path.resolve(file), "utf8"));
const cases = Array.isArray(payload.data) ? payload.data : [];
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const prepared = cases
  .filter((item) => item?.deputyName && item?.analyzedYear)
  .map((item) => ({
    ...item,
    externalId: stableId([
      "alerta-parlamentar-v3",
      item.deputyId || normalize(item.deputyName),
      item.analyzedYear
    ])
  }));

const existingByExternalId = new Map();
for (let index = 0; index < prepared.length; index += 150) {
  const ids = prepared.slice(index, index + 150).map((item) => item.externalId);
  const { data, error } = await supabase
    .from("alerts")
    .select("external_id,title,rule,severity,status,detected_at,deputy_name,supplier_name,amount,evidence")
    .in("external_id", ids);
  if (error) throw error;
  for (const row of data ?? []) existingByExternalId.set(row.external_id, row);
}

const rows = prepared.map((item) => {
  const previous = existingByExternalId.get(item.externalId);
  const previousEvidence = previous?.evidence ?? {};
  const officeBudget = mergeOfficeBudget(previousEvidence.officeBudget, item.officeBudget);
  const sourceModules = [
    ...(Array.isArray(previousEvidence.sourceModules) ? previousEvidence.sourceModules : []),
    ...(previousEvidence.sourceModule ? [previousEvidence.sourceModule] : []),
    "office_budget"
  ];
  const moduleSeverity = officeBudget.summary?.priority ?? "baixa";

  return {
    external_id: item.externalId,
    title:
      previous?.title ?? `Caso parlamentar de ${item.deputyName}`,
    rule:
      previous?.rule ??
      "Caso parlamentar consolidado por período; documentos, sinais e módulos permanecem separados",
    severity: highestSeverity(previous?.severity ?? "baixa", moduleSeverity),
    status: previous?.status ?? "novo",
    detected_at: previous?.detected_at ?? new Date().toISOString(),
    deputy_name: previous?.deputy_name ?? item.deputyName,
    supplier_name: previous?.supplier_name ?? null,
    amount: previous?.amount ?? null,
    evidence: {
      ...previousEvidence,
      consolidationLevel: "deputy",
      deputyId: previousEvidence.deputyId ?? item.deputyId,
      analyzedYear: previousEvidence.analyzedYear ?? item.analyzedYear,
      sourceModules: [...new Set(sourceModules)],
      officeBudget,
      modulePriorities: {
        ...(previousEvidence.modulePriorities ?? {}),
        officeBudget: moduleSeverity
      }
    }
  };
});

for (let index = 0; index < rows.length; index += 100) {
  const batch = rows.slice(index, index + 100);
  const { error } = await supabase.from("alerts").upsert(batch, {
    onConflict: "external_id",
    ignoreDuplicates: false
  });
  if (error) throw error;
  console.log(`Casos atualizados: ${Math.min(index + batch.length, rows.length)} de ${rows.length}`);
}

console.log("Importação da verba de gabinete concluída sem misturar os valores com a CEAP.");
