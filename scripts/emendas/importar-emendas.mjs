import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const API_KEY = String(process.env.PORTAL_TRANSPARENCIA_API_KEY ?? "").trim();
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!API_KEY) throw new Error("Defina PORTAL_TRANSPARENCIA_API_KEY.");
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
  );
}

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...rest] = argument.replace(/^--/, "").split("=");
    return [name, rest.length ? rest.join("=") : "true"];
  })
);

const mode = String(args.get("mode") ?? "catalog").trim();
if (!["catalog", "documents", "full"].includes(mode)) {
  throw new Error("Use --mode=catalog, --mode=documents ou --mode=full.");
}

const years = String(args.get("years") ?? "2023,2024,2025,2026")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 2000);

const maxAmendments = Math.max(1, Number(args.get("max-amendments") ?? 20));
const maxDocumentsPerAmendment = Math.max(
  1,
  Number(args.get("max-documents-per-amendment") ?? 120)
);
const delayMs = Math.max(120, Number(args.get("delay-ms") ?? 180));
const maxPages = Math.max(1, Number(args.get("max-pages") ?? 1000));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function stableId(parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function numberFrom(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = cleanText(value);
  if (!raw) return 0;
  const cleaned = raw
    .replace(/^R\$/i, "")
    .replace(/\s/g, "")
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
    const partial = entries.find(([key]) => normalizeText(key).includes(candidate));
    if (partial && partial[1] !== null && partial[1] !== "") return partial[1];
  }

  return null;
}

function dateIso(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function parseDocumentYear(documentCode, fallbackDate, fallbackYear) {
  const match = cleanText(documentCode).match(/(20\d{2})(?:NE|NS|OB|NP|PF|DF|NL|LC)/);
  if (match) return Number(match[1]);
  const iso = dateIso(fallbackDate);
  return iso ? Number(iso.slice(0, 4)) : Number(fallbackYear) || null;
}

function amendmentCode(row) {
  return cleanText(firstValue(row, ["codigoEmenda", "código da emenda", "codigo"]));
}

function normalizeAllocation(raw, fallbackYear) {
  const code = amendmentCode(raw);
  const year = Number(firstValue(raw, ["ano", "anoEmenda"])) || fallbackYear;
  const author = cleanText(firstValue(raw, ["nomeAutor", "autor", "autorEmenda"]));
  const type = cleanText(firstValue(raw, ["tipoEmenda", "tipo da emenda", "tipo"]));

  return {
    id: stableId(["allocation", code, stableJson(raw)]),
    code,
    year,
    author,
    type,
    number: cleanText(firstValue(raw, ["numeroEmenda", "número da emenda"])),
    locality: cleanText(firstValue(raw, ["localidadeDoGasto", "localidade do gasto"])),
    function: cleanText(firstValue(raw, ["funcao", "função"])),
    subfunction: cleanText(firstValue(raw, ["subfuncao", "subfunção"])),
    committed: numberFrom(firstValue(raw, ["valorEmpenhado", "valor empenhado"])),
    liquidated: numberFrom(firstValue(raw, ["valorLiquidado", "valor liquidado"])),
    paid: numberFrom(firstValue(raw, ["valorPago", "valor pago"])),
    restRegistered: numberFrom(firstValue(raw, ["valorRestoInscrito"])),
    restCancelled: numberFrom(firstValue(raw, ["valorRestoCancelado"])),
    restPaid: numberFrom(firstValue(raw, ["valorRestoPago"])),
    raw
  };
}

function groupAmendments(allocations) {
  const grouped = new Map();

  for (const allocation of allocations) {
    if (!allocation.code || !allocation.author || !allocation.year) continue;
    const current = grouped.get(allocation.code) ?? {
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
    grouped.set(allocation.code, current);
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    localities: [...item.localities],
    functions: [...item.functions],
    subfunctions: [...item.subfunctions]
  }));
}

let lastRequestAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < delayMs) await sleep(delayMs - elapsed);
  lastRequestAt = Date.now();
}

async function requestJson(endpoint, searchParams = {}, options = {}) {
  const { attempts = 5, allow404 = false } = options;
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
          "user-agent": "FuroPublico/3.0 (importacao de dados abertos)"
        }
      });
      clearTimeout(timer);

      if (response.status === 404 && allow404) return [];
      if (response.status === 429) {
        await sleep(Math.max(5_000, attempt * 10_000));
        continue;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      }

      const payload = await response.json();
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload?.resultado)) return payload.resultado;
      return payload ? [payload] : [];
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 2_000);
    }
  }

  throw new Error(`Falha em ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchAllPages(endpoint, baseParams = {}, pageLimit = maxPages) {
  const rows = [];
  const seen = new Set();

  for (let page = 1; page <= pageLimit; page += 1) {
    const pageRows = await requestJson(endpoint, { ...baseParams, pagina: page });
    if (!pageRows.length) break;
    const fingerprint = createHash("sha1").update(stableJson(pageRows)).digest("hex");
    if (seen.has(fingerprint)) break;
    seen.add(fingerprint);
    rows.push(...pageRows);
  }

  return rows;
}

async function fetchAmendmentsByYear(year) {
  return fetchAllPages("/emendas", { ano: year });
}

function alertYear(row) {
  const evidence = row?.evidence && typeof row.evidence === "object" ? row.evidence : {};
  return Number(evidence.analyzedYear ?? evidence.year ?? 0);
}

async function fetchAllAlerts() {
  const rows = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await supabase
      .from("alerts")
      .select("id,deputy_name,evidence")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

async function queryInBatches(table, columns, field, values, batchSize = 200) {
  const rows = [];
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    if (!batch.length) continue;
    const { data, error } = await supabase.from(table).select(columns).in(field, batch);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function upsertBatches(table, rows, options, batchSize = 200, select = "") {
  const results = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    if (!batch.length) continue;
    let query = supabase.from(table).upsert(batch, options);
    if (select) query = query.select(select);
    const { data, error } = await query;
    if (error) throw error;
    results.push(...(data ?? []));
  }
  return results;
}

async function importCatalog() {
  console.log(`Importando catálogo de emendas: ${years.join(", ")}`);
  const rawRows = [];
  for (const year of years) {
    const rows = await fetchAmendmentsByYear(year);
    rawRows.push(...rows);
    console.log(`${year}: ${rows.length} linha(s).`);
  }

  const uniqueRows = [...new Map(rawRows.map((row) => [stableId([stableJson(row)]), row])).values()];
  const amendments = groupAmendments(
    uniqueRows.map((row) => normalizeAllocation(row, Number(row?.ano) || 0))
  );
  const alerts = await fetchAllAlerts();

  const alertsByNameYear = new Map();
  for (const alert of alerts) {
    const name = normalizeText(alert.deputy_name);
    const year = alertYear(alert);
    if (!name || !year) continue;
    const key = `${name}|${year}`;
    const group = alertsByNameYear.get(key) ?? [];
    group.push(alert);
    alertsByNameYear.set(key, group);
  }

  const matched = amendments.filter((amendment) =>
    alertsByNameYear.has(`${normalizeText(amendment.author)}|${amendment.year}`)
  );

  const codes = matched.map((item) => item.code);
  const existing = await queryInBatches(
    "parliamentary_amendments",
    "id,external_code,documents_status,document_count,beneficiary_count,processed_at,last_error",
    "external_code",
    codes
  );
  const existingByCode = new Map(existing.map((row) => [row.external_code, row]));

  const now = new Date().toISOString();
  const amendmentRows = matched.map((item) => {
    const previous = existingByCode.get(item.code);
    return {
      external_code: item.code,
      year: item.year,
      author_name: item.author,
      amendment_type: item.type || null,
      amendment_number: item.number || null,
      committed: item.committed,
      liquidated: item.liquidated,
      paid: item.paid,
      rest_registered: item.restRegistered,
      rest_cancelled: item.restCancelled,
      rest_paid: item.restPaid,
      localities: item.localities,
      functions: item.functions,
      subfunctions: item.subfunctions,
      allocations: item.allocations,
      raw: { source: "Portal da Transparência", allocations: item.allocations.map((a) => a.raw) },
      documents_status: previous?.documents_status ?? "pending",
      document_count: Number(previous?.document_count ?? 0),
      beneficiary_count: Number(previous?.beneficiary_count ?? 0),
      processed_at: previous?.processed_at ?? null,
      last_error: previous?.last_error ?? null,
      source_updated_at: now
    };
  });

  const saved = await upsertBatches(
    "parliamentary_amendments",
    amendmentRows,
    { onConflict: "external_code", ignoreDuplicates: false },
    150,
    "id,external_code,year,author_name"
  );
  const savedByCode = new Map(saved.map((row) => [row.external_code, row]));

  const links = [];
  for (const item of matched) {
    const amendment = savedByCode.get(item.code);
    if (!amendment) continue;
    for (const alert of alertsByNameYear.get(`${normalizeText(item.author)}|${item.year}`) ?? []) {
      links.push({
        alert_id: alert.id,
        amendment_id: amendment.id,
        match_type: "exact_name_year",
        author_name: item.author
      });
    }
  }

  await upsertBatches(
    "amendment_case_links",
    links,
    { onConflict: "alert_id,amendment_id", ignoreDuplicates: false }
  );

  console.log(`Emendas nacionais agrupadas: ${amendments.length}`);
  console.log(`Emendas ligadas exatamente aos casos atuais: ${matched.length}`);
  console.log(`Relações caso-emenda salvas: ${links.length}`);
}

function normalizeDocumentReference(raw, amendment) {
  const documentCode = cleanText(firstValue(raw, ["codigoDocumento", "documento"]));
  const date = cleanText(firstValue(raw, ["data", "dataDocumento"]));
  return {
    documentCode,
    summarizedCode: cleanText(firstValue(raw, ["codigoDocumentoResumido", "documentoResumido"])),
    documentDate: dateIso(date),
    year: parseDocumentYear(documentCode, date, amendment.year),
    phase: cleanText(firstValue(raw, ["fase", "faseDespesa"])),
    species: cleanText(firstValue(raw, ["especieTipo", "espécie tipo"])),
    raw
  };
}

async function fetchDocumentDetail(reference) {
  return requestJson(
    `/despesas/documentos/${encodeURIComponent(reference.documentCode)}`,
    {},
    { allow404: true }
  );
}

async function fetchFinalBeneficiaries(reference) {
  return fetchAllPages(
    "/despesas/favorecidos-finais-por-documento",
    { codigoDocumento: reference.documentCode, ano: reference.year },
    50
  );
}

function formalBeneficiary(detail) {
  const name = cleanText(detail?.nomeFavorecido ?? detail?.favorecido);
  const identifier = cleanText(detail?.codigoFavorecido);
  if (!name && !identifier) return null;
  return {
    name,
    identifier,
    type: cleanText(detail?.tipoFavorecido),
    uf: cleanText(detail?.ufFavorecido).slice(0, 2).toUpperCase(),
    municipality: cleanText(detail?.municipioFavorecido),
    amount: numberFrom(detail?.valor),
    isIntermediary: Boolean(detail?.favorecidoIntermediario),
    raw: detail
  };
}

function finalBeneficiary(row) {
  // Prioridade explícita: nomeFavorecidoFinal. codigoListaCredor nunca é nome.
  const name = cleanText(row?.nomeFavorecidoFinal);
  const identifier = cleanText(row?.codigoFavorecidoFinal);
  if (!name && !identifier) return null;
  return {
    name,
    identifier,
    type: cleanText(row?.tipoFavorecidoFinal),
    uf: cleanText(row?.ufFavorecidoFinal).slice(0, 2).toUpperCase(),
    municipality: cleanText(row?.municipioFavorecidoFinal),
    amount: numberFrom(row?.valorFinal),
    isIntermediary: false,
    raw: row
  };
}

function beneficiaryIdentity(item) {
  const numeric = digits(item.identifier);
  if ([11, 14].includes(numeric.length)) return `tax:${numeric}`;
  if (item.identifier) return `code:${normalizeText(item.identifier)}`;
  return `name:${normalizeText(item.name)}|${item.uf}|${normalizeText(item.municipality)}`;
}

async function existingDocumentCodes(amendmentId) {
  const { data: links, error: linkError } = await supabase
    .from("amendment_document_links")
    .select("document_id")
    .eq("amendment_id", amendmentId);
  if (linkError) throw linkError;
  const ids = (links ?? []).map((row) => row.document_id);
  if (!ids.length) return new Set();
  const docs = await queryInBatches("amendment_documents", "id,document_code", "id", ids);
  return new Set(docs.map((row) => row.document_code));
}

async function processAmendment(amendment) {
  console.log(`\n${amendment.external_code} · ${amendment.author_name}`);
  const rawReferences = await fetchAllPages(
    `/emendas/documentos/${encodeURIComponent(amendment.external_code)}`,
    {},
    200
  );
  const references = [...new Map(
    rawReferences
      .map((raw) => normalizeDocumentReference(raw, amendment))
      .filter((item) => item.documentCode)
      .map((item) => [item.documentCode, item])
  ).values()];

  const existingCodes = await existingDocumentCodes(amendment.id);
  const pending = references.filter((item) => !existingCodes.has(item.documentCode));
  const selected = pending.slice(0, maxDocumentsPerAmendment);

  const documentRows = [];
  const beneficiaryCandidates = new Map();
  const flowDrafts = [];

  for (let index = 0; index < selected.length; index += 1) {
    const reference = selected[index];
    const detailRows = await fetchDocumentDetail(reference);
    const detail = detailRows[0] ?? {};
    const formal = formalBeneficiary(detail);

    documentRows.push({
      document_code: reference.documentCode,
      summarized_code: reference.summarizedCode || null,
      document_date: reference.documentDate,
      year: reference.year,
      phase: reference.phase || null,
      species: reference.species || null,
      amount: numberFrom(detail?.valor) || null,
      formal_beneficiary_name: formal?.name || null,
      formal_beneficiary_tax_id: formal?.identifier || null,
      formal_beneficiary_uf: formal?.uf || null,
      formal_beneficiary_municipality: formal?.municipality || null,
      formal_beneficiary_is_intermediary: formal?.isIntermediary ?? false,
      managing_unit_code: cleanText(detail?.codigoUg) || null,
      managing_unit: cleanText(detail?.ug) || null,
      agency_code: cleanText(detail?.codigoOrgao) || null,
      agency: cleanText(detail?.orgao) || null,
      superior_agency_code: cleanText(detail?.codigoOrgaoSuperior) || null,
      superior_agency: cleanText(detail?.orgaoSuperior) || null,
      observation: cleanText(detail?.observacao) || null,
      raw_reference: reference.raw,
      raw_detail: detail,
      source_updated_at: new Date().toISOString()
    });

    if (formal) {
      const identityKey = beneficiaryIdentity(formal);
      beneficiaryCandidates.set(identityKey, {
        identity_key: identityKey,
        name: formal.name || formal.identifier,
        tax_id: formal.identifier || null,
        beneficiary_type: formal.type || null,
        uf: formal.uf || null,
        municipality: formal.municipality || null,
        raw: formal.raw,
        source_updated_at: new Date().toISOString()
      });
      flowDrafts.push({
        documentCode: reference.documentCode,
        identityKey,
        role: formal.isIntermediary ? "intermediario_financeiro" : "favorecido_documento",
        amount: formal.amount || null,
        phase: reference.phase || null,
        date: reference.documentDate,
        sourceKind: "document_detail",
        raw: formal.raw
      });
    }

    const phase = normalizeText(reference.phase);
    if (phase.includes("pagamento") || phase.includes("liquid")) {
      const finalRows = await fetchFinalBeneficiaries(reference);
      for (const raw of finalRows) {
        const final = finalBeneficiary(raw);
        if (!final) continue;
        const identityKey = beneficiaryIdentity(final);
        beneficiaryCandidates.set(identityKey, {
          identity_key: identityKey,
          name: final.name || final.identifier,
          tax_id: final.identifier || null,
          beneficiary_type: final.type || null,
          uf: final.uf || null,
          municipality: final.municipality || null,
          raw: final.raw,
          source_updated_at: new Date().toISOString()
        });
        flowDrafts.push({
          documentCode: reference.documentCode,
          identityKey,
          role: "beneficiario_final",
          amount: final.amount || null,
          phase: reference.phase || null,
          date: reference.documentDate,
          sourceKind: "final_beneficiary",
          raw: final.raw
        });
      }
    }

    if ((index + 1) % 25 === 0 || index + 1 === selected.length) {
      console.log(`Documentos processados: ${index + 1}/${selected.length}`);
    }
  }

  const savedDocuments = await upsertBatches(
    "amendment_documents",
    documentRows,
    { onConflict: "document_code", ignoreDuplicates: false },
    100,
    "id,document_code"
  );
  const documentByCode = new Map(savedDocuments.map((row) => [row.document_code, row]));

  const savedBeneficiaries = await upsertBatches(
    "amendment_beneficiaries",
    [...beneficiaryCandidates.values()],
    { onConflict: "identity_key", ignoreDuplicates: false },
    100,
    "id,identity_key"
  );
  const beneficiaryByIdentity = new Map(
    savedBeneficiaries.map((row) => [row.identity_key, row])
  );

  const links = savedDocuments.map((document) => ({
    amendment_id: amendment.id,
    document_id: document.id
  }));
  await upsertBatches(
    "amendment_document_links",
    links,
    { onConflict: "amendment_id,document_id", ignoreDuplicates: true }
  );

  const flowRows = flowDrafts
    .map((draft) => {
      const document = documentByCode.get(draft.documentCode);
      const beneficiary = beneficiaryByIdentity.get(draft.identityKey);
      if (!document || !beneficiary) return null;
      return {
        external_id: stableId([
          amendment.id,
          document.id,
          beneficiary.id,
          draft.role,
          draft.amount,
          stableJson(draft.raw)
        ]),
        amendment_id: amendment.id,
        document_id: document.id,
        beneficiary_id: beneficiary.id,
        role: draft.role,
        amount: draft.amount,
        document_phase: draft.phase,
        document_date: draft.date,
        source_kind: draft.sourceKind,
        raw: draft.raw
      };
    })
    .filter(Boolean);

  await upsertBatches(
    "amendment_beneficiary_flows",
    flowRows,
    { onConflict: "external_id", ignoreDuplicates: false },
    100
  );

  const remaining = Math.max(0, pending.length - selected.length);
  const totalProcessed = existingCodes.size + savedDocuments.length;
  const { data: allBeneficiaryFlows, error: beneficiaryCountError } = await supabase
    .from("amendment_beneficiary_flows")
    .select("beneficiary_id")
    .eq("amendment_id", amendment.id);
  if (beneficiaryCountError) throw beneficiaryCountError;
  const uniqueBeneficiaryCount = new Set(
    (allBeneficiaryFlows ?? [])
      .map((row) => cleanText(row.beneficiary_id))
      .filter(Boolean)
  ).size;

  const { error: updateError } = await supabase
    .from("parliamentary_amendments")
    .update({
      documents_status: remaining > 0 ? "partial" : "complete",
      document_count: totalProcessed,
      beneficiary_count: uniqueBeneficiaryCount,
      processed_at: new Date().toISOString(),
      last_error: null
    })
    .eq("id", amendment.id);
  if (updateError) throw updateError;

  console.log(
    `Referências: ${references.length}; novas: ${savedDocuments.length}; restantes: ${remaining}; fluxos: ${flowRows.length}.`
  );
}

async function importDocuments() {
  const { data, error } = await supabase
    .from("parliamentary_amendments")
    .select("id,external_code,year,author_name,documents_status,paid,liquidated,committed")
    .in("documents_status", ["pending", "partial", "error"])
    .order("paid", { ascending: false })
    .order("liquidated", { ascending: false })
    .order("committed", { ascending: false })
    .limit(maxAmendments);
  if (error) throw error;

  const amendments = data ?? [];
  console.log(`Emendas selecionadas para documentos: ${amendments.length}`);

  for (const amendment of amendments) {
    try {
      await processAmendment(amendment);
    } catch (error) {
      console.error(`${amendment.external_code}: ${error.message}`);
      const { error: updateError } = await supabase
        .from("parliamentary_amendments")
        .update({
          documents_status: "error",
          last_error: String(error.message ?? error).slice(0, 2000),
          processed_at: new Date().toISOString()
        })
        .eq("id", amendment.id);
      if (updateError) console.error(updateError.message);
    }
  }
}

if (mode === "catalog" || mode === "full") await importCatalog();
if (mode === "documents" || mode === "full") await importDocuments();

console.log("\nImportação de emendas concluída.");
console.log("Empenho, liquidação e pagamento permanecem separados.");
console.log("Intermediários financeiros não são tratados como beneficiários finais.");
