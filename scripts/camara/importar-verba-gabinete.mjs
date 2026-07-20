import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
  );
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
  return [
    ...new Map(
      items
        .filter(Boolean)
        .map((item) => [keyFunction(item), item])
    ).values()
  ];
}

function employeeKey(employee) {
  return String(
    employee?.key ??
      employee?.point ??
      normalize(employee?.name ?? "")
  );
}

function mergeStaffProfiles(previous = [], incoming = []) {
  const map = new Map();
  for (const profile of [...previous, ...incoming]) {
    if (!profile || typeof profile !== "object") continue;
    const key = employeeKey(profile);
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        ...profile,
        firstSeen: profile.firstSeen ?? profile.lastSeen ?? null,
        lastSeen: profile.lastSeen ?? profile.firstSeen ?? null,
        snapshotsPresent: Number(profile.snapshotsPresent ?? 1)
      });
      continue;
    }

    const seenDates = [
      current.firstSeen,
      current.lastSeen,
      profile.firstSeen,
      profile.lastSeen
    ]
      .filter(Boolean)
      .sort();

    map.set(key, {
      ...current,
      ...profile,
      firstSeen: seenDates[0] ?? null,
      lastSeen: seenDates.at(-1) ?? null,
      snapshotsPresent:
        Number(current.snapshotsPresent ?? 1) +
        Number(profile.snapshotsPresent ?? 1)
    });
  }

  return [...map.values()].sort(
    (a, b) =>
      String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? "")) ||
      String(a.name ?? "").localeCompare(
        String(b.name ?? ""),
        "pt-BR"
      )
  );
}

function snapshotKey(snapshot) {
  return `${snapshot?.date ?? ""}|${snapshot?.matchStatus ?? ""}`;
}

function mergeSnapshots(previous, incoming) {
  return unionBy(
    [
      ...(previous?.snapshotHistory ?? []),
      ...(previous?.currentSnapshot ? [previous.currentSnapshot] : []),
      ...(incoming?.currentSnapshot ? [incoming.currentSnapshot] : [])
    ],
    snapshotKey
  ).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function buildStaffMovements(snapshotHistory) {
  const matched = snapshotHistory.filter(
    (snapshot) =>
      snapshot?.date &&
      snapshot?.matchStatus === "associado" &&
      Array.isArray(snapshot?.staff)
  );

  const movements = [];
  for (let index = 1; index < matched.length; index += 1) {
    const previous = matched[index - 1];
    const current = matched[index];
    const previousMap = new Map(
      previous.staff.map((employee) => [employeeKey(employee), employee])
    );
    const currentMap = new Map(
      current.staff.map((employee) => [employeeKey(employee), employee])
    );
    const added = [...currentMap.entries()]
      .filter(([key]) => !previousMap.has(key))
      .map(([, employee]) => employee);
    const removed = [...previousMap.entries()]
      .filter(([key]) => !currentMap.has(key))
      .map(([, employee]) => employee);

    movements.push({
      id: stableId([
        "office-budget-staff-movement",
        previous.date,
        current.date
      ]),
      fromDate: previous.date,
      toDate: current.date,
      previousCount: previousMap.size,
      currentCount: currentMap.size,
      added,
      removed,
      addedCount: added.length,
      removedCount: removed.length,
      netChange: currentMap.size - previousMap.size
    });
  }
  return movements;
}

function movementSignals(deputyId, movements) {
  return movements
    .filter((movement) => {
      const base = Math.max(1, movement.previousCount);
      const changed = movement.addedCount + movement.removedCount;
      return changed >= 5 || changed / base >= 0.3;
    })
    .map((movement) => {
      const base = Math.max(1, movement.previousCount);
      const changed = movement.addedCount + movement.removedCount;
      const ratio = changed / base;
      return {
        id: stableId([
          "office-budget-v4",
          deputyId,
          "staff-movement",
          movement.fromDate,
          movement.toDate
        ]),
        type: "variacao-equipe-snapshot",
        label: "Mudança relevante entre snapshots da equipe",
        severity: changed >= 10 || ratio >= 0.6 ? "alta" : "media",
        competence: movement.toDate,
        sourceYears: [Number(String(movement.toDate).slice(0, 4))],
        documentIds: [
          `funcionarios:${movement.fromDate}`,
          `funcionarios:${movement.toDate}`
        ],
        detail:
          `${movement.addedCount} entrada(s) e ${movement.removedCount} saída(s) ` +
          `foram observadas entre os snapshots de ${movement.fromDate} e ${movement.toDate}.`,
        metrics: {
          previousCount: movement.previousCount,
          currentCount: movement.currentCount,
          addedCount: movement.addedCount,
          removedCount: movement.removedCount,
          changeRatio: ratio
        }
      };
    });
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
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  return Math.sqrt(
    values.reduce(
      (total, value) => total + (value - mean) ** 2,
      0
    ) / values.length
  );
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
    first.reduce(
      (total, month) =>
        total + Number(month.totalSpent ?? month.totalPublished ?? 0),
      0
    ) / first.length;
  const lastAverage =
    last.reduce(
      (total, month) =>
        total + Number(month.totalSpent ?? month.totalPublished ?? 0),
      0
    ) / last.length;
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

function recomputeSummary(module) {
  const months = [...(module.months ?? [])].sort((a, b) =>
    String(a.competence).localeCompare(String(b.competence))
  );
  const signals = module.signals ?? [];
  const latest = months.at(-1) ?? null;
  const spentValues = months.map((month) =>
    Number(month.totalSpent ?? month.totalPublished ?? 0)
  );
  const accumulatedSpent = spentValues.reduce(
    (total, value) => total + value,
    0
  );
  const accumulatedAvailable = months.reduce(
    (total, month) =>
      total + Number(month.totalAvailable ?? 0),
    0
  );
  const accumulatedUnused = months.reduce(
    (total, month) =>
      total +
      Math.max(
        0,
        Number(month.totalAvailable ?? 0) -
          Number(month.totalSpent ?? month.totalPublished ?? 0)
      ),
    0
  );
  const averageMonthlySpent = months.length
    ? accumulatedSpent / months.length
    : 0;
  const coefficientOfVariation = averageMonthlySpent
    ? standardDeviation(spentValues) / averageMonthlySpent
    : 0;
  const maxMonth = [...months].sort(
    (a, b) =>
      Number(b.totalSpent ?? b.totalPublished ?? 0) -
      Number(a.totalSpent ?? a.totalPublished ?? 0)
  )[0] ?? null;
  const minMonth = [...months].sort(
    (a, b) =>
      Number(a.totalSpent ?? a.totalPublished ?? 0) -
      Number(b.totalSpent ?? b.totalPublished ?? 0)
  )[0] ?? null;
  const highPriorityCount = signals.filter(
    (signal) => signal.severity === "alta"
  ).length;
  const latestMovement = (module.staffMovements ?? []).at(-1) ?? null;
  const currentStaffCount = module.currentSnapshot?.staffCount ?? null;

  return {
    monthCount: months.length,
    periodStart: months[0]?.competence ?? null,
    periodEnd: latest?.competence ?? null,
    latestCompetence: latest?.competence ?? null,
    latestTotalPublished: Number(
      latest?.totalSpent ?? latest?.totalPublished ?? 0
    ),
    latestTotalAvailable: Number(latest?.totalAvailable ?? 0),
    latestUtilization: Number(latest?.utilization ?? 0),
    accumulatedSpent,
    accumulatedAvailable,
    accumulatedUnused,
    accumulatedUtilization:
      accumulatedAvailable > 0
        ? accumulatedSpent / accumulatedAvailable
        : 0,
    averageMonthlySpent,
    medianMonthlySpent: median(spentValues),
    maxMonthlySpent: Number(
      maxMonth?.totalSpent ?? maxMonth?.totalPublished ?? 0
    ),
    maxMonthlyCompetence: maxMonth?.competence ?? null,
    minMonthlySpent: Number(
      minMonth?.totalSpent ?? minMonth?.totalPublished ?? 0
    ),
    minMonthlyCompetence: minMonth?.competence ?? null,
    coefficientOfVariation,
    monthsAbove95: months.filter(
      (month) => Number(month.utilization ?? 0) >= 0.95
    ).length,
    monthsBelow75: months.filter(
      (month) => Number(month.utilization ?? 0) < 0.75
    ).length,
    currentSnapshotStaffCount: currentStaffCount,
    currentSnapshotStatus:
      module.currentSnapshot?.matchStatus ?? "indisponivel",
    staffAddedSincePrevious: latestMovement?.addedCount ?? 0,
    staffRemovedSincePrevious: latestMovement?.removedCount ?? 0,
    signalCount: signals.length,
    signalTypeCount: new Set(
      signals.map((signal) => signal.type)
    ).size,
    highPriorityCount,
    largestMonthlyChange: signals
      .filter(
        (signal) =>
          signal.type === "variacao-gasto-gabinete" ||
          signal.type === "variacao-folha-publicada"
      )
      .reduce(
        (largest, signal) =>
          Math.max(
            largest,
            Math.abs(
              Number(signal.metrics?.absoluteChange ?? 0)
            )
          ),
        0
      ),
    priority: highPriorityCount
      ? "alta"
      : signals.length
        ? "media"
        : "baixa",
    classification: {
      utilization: utilizationBand(
        accumulatedAvailable > 0
          ? accumulatedSpent / accumulatedAvailable
          : NaN
      ),
      variation: variationBand(coefficientOfVariation),
      trend: trendBand(months),
      teamSize: teamSizeBand(currentStaffCount)
    }
  };
}

function signalTouchesYears(signal, years) {
  const sourceYears = Array.isArray(signal?.sourceYears)
    ? signal.sourceYears.map(Number)
    : signal?.competence
      ? [Number(String(signal.competence).slice(0, 4))]
      : [];
  return sourceYears.some((year) => years.has(year));
}

function mergeOfficeBudget(previous, incoming, deputyId) {
  if (!previous) {
    const snapshotHistory = mergeSnapshots(null, incoming);
    const staffMovements = buildStaffMovements(snapshotHistory);
    const signals = unionBy(
      [
        ...(incoming.signals ?? []),
        ...movementSignals(deputyId, staffMovements)
      ],
      (signal) => String(signal.id)
    );
    const first = {
      ...incoming,
      snapshotHistory,
      staffMovements,
      signals
    };
    first.summary = recomputeSummary(first);
    return first;
  }

  const coveredYears = new Set(
    (incoming.months ?? []).map((month) =>
      Number(String(month.competence).slice(0, 4))
    )
  );
  if (incoming.analyzedYear && !incoming.snapshotOnly) {
    coveredYears.add(Number(incoming.analyzedYear));
  }

  const months = unionBy(
    [...(previous.months ?? []), ...(incoming.months ?? [])],
    (month) => String(month.competence)
  ).sort((a, b) =>
    String(a.competence).localeCompare(String(b.competence))
  );

  const documents = unionBy(
    [...(previous.documents ?? []), ...(incoming.documents ?? [])],
    (document) => String(document.id)
  );

  const retainedSignals = (previous.signals ?? []).filter(
    (signal) =>
      signal.type === "variacao-equipe-snapshot" ||
      !signalTouchesYears(signal, coveredYears)
  );
  const snapshotHistory = mergeSnapshots(previous, incoming);
  const staffMovements = buildStaffMovements(snapshotHistory);
  const signals = unionBy(
    [
      ...retainedSignals.filter(
        (signal) => signal.type !== "variacao-equipe-snapshot"
      ),
      ...(incoming.signals ?? []),
      ...movementSignals(deputyId, staffMovements)
    ],
    (signal) => String(signal.id)
  );

  const incomingDate = String(
    incoming.currentSnapshot?.date ?? ""
  );
  const previousDate = String(
    previous.currentSnapshot?.date ?? ""
  );
  const currentSnapshot =
    incomingDate >= previousDate
      ? incoming.currentSnapshot ?? previous.currentSnapshot
      : previous.currentSnapshot;

  const merged = {
    ...previous,
    ...incoming,
    profile: {
      ...(previous.profile ?? {}),
      ...(incoming.profile ?? {})
    },
    months,
    documents,
    signals,
    staffProfiles: mergeStaffProfiles(
      previous.staffProfiles,
      incoming.staffProfiles
    ),
    currentSnapshot,
    snapshotHistory,
    staffMovements,
    dataQuality: {
      ...(previous.dataQuality ?? {}),
      ...(incoming.dataQuality ?? {}),
      exactDuplicatesRemoved: Math.max(
        Number(
          previous.dataQuality?.exactDuplicatesRemoved ?? 0
        ),
        Number(
          incoming.dataQuality?.exactDuplicatesRemoved ?? 0
        )
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
    .filter((name) =>
      /^verba-gabinete-\d{4}-\d{2}-\d{2}\.json$/.test(name)
    )
    .sort();
  file = files.at(-1)
    ? path.join(directory, files.at(-1))
    : null;
}
if (!file) {
  throw new Error(
    "Nenhum arquivo processado de verba de gabinete encontrado."
  );
}

const payload = JSON.parse(
  await fs.readFile(path.resolve(file), "utf8")
);
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
  const ids = prepared
    .slice(index, index + 150)
    .map((item) => item.externalId);
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "external_id,title,rule,severity,status,detected_at,deputy_name,supplier_name,amount,evidence"
    )
    .in("external_id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    existingByExternalId.set(row.external_id, row);
  }
}

const rows = prepared.map((item) => {
  const previous = existingByExternalId.get(item.externalId);
  const previousEvidence = previous?.evidence ?? {};
  const officeBudget = mergeOfficeBudget(
    previousEvidence.officeBudget,
    item.officeBudget,
    item.deputyId
  );
  const sourceModules = [
    ...(Array.isArray(previousEvidence.sourceModules)
      ? previousEvidence.sourceModules
      : []),
    ...(previousEvidence.sourceModule
      ? [previousEvidence.sourceModule]
      : []),
    "office_budget"
  ];
  const moduleSeverity =
    officeBudget.summary?.priority ?? "baixa";

  return {
    external_id: item.externalId,
    title:
      previous?.title ??
      `Caso parlamentar de ${item.deputyName}`,
    rule:
      previous?.rule ??
      "Caso parlamentar consolidado por período; documentos, sinais e módulos permanecem separados",
    severity: highestSeverity(
      previous?.severity ?? "baixa",
      moduleSeverity
    ),
    status: previous?.status ?? "novo",
    detected_at:
      previous?.detected_at ?? new Date().toISOString(),
    deputy_name:
      previous?.deputy_name ?? item.deputyName,
    supplier_name: previous?.supplier_name ?? null,
    amount: previous?.amount ?? null,
    evidence: {
      ...previousEvidence,
      consolidationLevel: "deputy",
      deputyId:
        previousEvidence.deputyId ?? item.deputyId,
      analyzedYear:
        previousEvidence.analyzedYear ?? item.analyzedYear,
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
  const { error } = await supabase
    .from("alerts")
    .upsert(batch, {
      onConflict: "external_id",
      ignoreDuplicates: false
    });
  if (error) throw error;
  console.log(
    `Casos atualizados: ${Math.min(
      index + batch.length,
      rows.length
    )} de ${rows.length}`
  );
}

console.log(
  "Importação da verba de gabinete concluída sem misturar os valores com a CEAP."
);
