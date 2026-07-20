import "server-only";

import { createHash } from "node:crypto";
import { fetchCompanyProfile } from "@/lib/cnpj-api";
import { fetchDeputyExpenses, findDeputyIdByName } from "@/lib/camara-api";
import type {
  AlertEntityNetwork,
  AlertEntityRelation,
  AlertManualEntity,
  AlertNetworkEntity,
  EntityCompanyProfile
} from "@/lib/types";

type StructuredSupplier = {
  name: string;
  taxId?: string;
  amount: number;
  documentIds: string[];
  documentCount: number;
  categories: string[];
  ruleTypes: string[];
};

type CaseDocument = {
  id: string;
  officialDocumentId?: string;
  supplierName: string;
  supplierTaxId?: string;
  category?: string;
  documentNumber?: string;
  documentDate?: string;
  documentUrl?: string;
  faceValue: number;
  ceapAmount: number;
  recordCount: number;
};

type HistoryDocument = {
  id: string;
  supplierName: string;
  supplierTaxId?: string;
  amount: number;
  date?: string;
  documentNumber: string;
  documentCode: string;
  url?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanTaxId(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.includes(",")
    ? value.replaceAll(".", "").replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function stableId(parts: unknown[]) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 24);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function isoDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function httpUrl(value: unknown) {
  const candidate = String(value ?? "").trim();
  return /^https?:\/\//i.test(candidate) ? candidate : undefined;
}

function yearsForLegislature(referenceYear?: number) {
  const current = Math.min(new Date().getUTCFullYear(), 2027);
  const end = Math.min(Math.max(referenceYear ?? current, 2023), current);
  return Array.from({ length: end - 2023 + 1 }, (_, index) => 2023 + index);
}

function profileForEntity(
  profile: Awaited<ReturnType<typeof fetchCompanyProfile>>
): EntityCompanyProfile | undefined {
  if (!profile) return undefined;
  return {
    source: profile.source,
    sourceUrl: profile.sourceUrl,
    taxId: profile.taxId,
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    status: profile.status,
    openingDate: profile.openingDate,
    mainActivity: profile.mainActivity,
    legalNature: profile.legalNature,
    size: profile.size,
    capital: profile.capital,
    address: profile.address,
    municipality: profile.municipality,
    state: profile.state,
    partners: profile.partners,
    dataUpdatedAt: profile.dataUpdatedAt,
    warning: profile.warning
  };
}

function relation(input: Omit<AlertEntityRelation, "id">): AlertEntityRelation {
  return {
    id: stableId([
      input.fromEntityId,
      input.toEntityId,
      input.type,
      input.label,
      input.detail
    ]),
    ...input
  };
}

function parseCaseDocuments(evidence: Record<string, unknown>): CaseDocument[] {
  return asRecordArray(evidence.documents)
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      officialDocumentId: String(item.officialDocumentId ?? "").trim() || undefined,
      supplierName: String(item.supplierName ?? "Fornecedor não identificado").trim(),
      supplierTaxId: cleanTaxId(item.supplierTaxId) || undefined,
      category: String(item.category ?? "").trim() || undefined,
      documentNumber: String(item.documentNumber ?? "").trim() || undefined,
      documentDate: isoDate(item.documentDate),
      documentUrl: httpUrl(item.documentUrl),
      faceValue: numberValue(item.faceValue),
      ceapAmount: numberValue(item.ceapAmount ?? item.amount),
      recordCount: Math.max(1, Number(item.recordCount ?? 1) || 1)
    }))
    .filter((item) => item.id && item.ceapAmount > 0);
}

function parseStructuredSuppliers(
  evidence: Record<string, unknown>,
  documents: CaseDocument[],
  legacySupplierName?: string
): StructuredSupplier[] {
  const parsed = asRecordArray(evidence.suppliers)
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      taxId: cleanTaxId(item.taxId) || undefined,
      amount: numberValue(item.amount),
      documentIds: Array.isArray(item.documentIds)
        ? item.documentIds.map(String).filter(Boolean)
        : [],
      documentCount: Number(item.documentCount ?? 0) || 0,
      categories: Array.isArray(item.categories)
        ? item.categories.map(String).filter(Boolean)
        : [],
      ruleTypes: Array.isArray(item.ruleTypes)
        ? item.ruleTypes.map(String).filter(Boolean)
        : []
    }))
    .filter((item) => item.name || item.taxId);

  if (parsed.length) return parsed;

  const grouped = new Map<string, StructuredSupplier>();
  for (const document of documents) {
    const key = document.supplierTaxId || normalizeText(document.supplierName);
    if (!key) continue;
    const current = grouped.get(key) ?? {
      name: document.supplierName,
      taxId: document.supplierTaxId,
      amount: 0,
      documentIds: [],
      documentCount: 0,
      categories: [],
      ruleTypes: []
    };
    current.amount += document.ceapAmount;
    current.documentIds.push(document.id);
    current.documentCount += 1;
    if (document.category && !current.categories.includes(document.category)) {
      current.categories.push(document.category);
    }
    grouped.set(key, current);
  }

  if (grouped.size) return [...grouped.values()];

  const legacyTaxId = cleanTaxId(evidence.supplierTaxId);
  const legacyName = String(
    evidence.supplierName ?? legacySupplierName ?? ""
  ).trim();

  if (!legacyTaxId && (!legacyName || /fornecedor\(es\)/i.test(legacyName))) {
    return [];
  }

  return [
    {
      name: legacyName || legacyTaxId,
      taxId: legacyTaxId || undefined,
      amount: numberValue(evidence.financialAmount ?? evidence.amount),
      documentIds: [],
      documentCount: 0,
      categories: [],
      ruleTypes: []
    }
  ];
}

function firstDocumentUrl(supplier: StructuredSupplier, documents: CaseDocument[]) {
  const allowed = new Set(supplier.documentIds);
  return documents.find(
    (document) =>
      (allowed.size === 0 || allowed.has(document.id)) &&
      ((supplier.taxId && document.supplierTaxId === supplier.taxId) ||
        normalizeText(document.supplierName) === normalizeText(supplier.name)) &&
      document.documentUrl
  )?.documentUrl;
}

function historyRecord(row: Record<string, unknown>, deputyId: string) {
  const supplierTaxId = cleanTaxId(row.cnpjCpfFornecedor ?? row.txtCNPJCPF);
  const supplierName = String(
    row.nomeFornecedor ?? row.txtFornecedor ?? ""
  ).trim();
  const officialDocumentId = String(
    row.ideDocumento ?? row.codDocumento ?? row.idDocumento ?? ""
  ).trim();
  const documentNumber = String(row.numDocumento ?? row.txtNumero ?? "").trim();
  const date = isoDate(row.dataDocumento ?? row.datEmissao);
  const amount = numberValue(row.valorLiquido ?? row.vlrLiquido ?? row.valorDocumento);
  const faceValue = numberValue(row.vlrDocumento ?? row.valorDocumento);
  const glosaValue = numberValue(row.vlrGlosa ?? row.valorGlosa);
  const category = String(row.tipoDespesa ?? row.txtDescricao ?? "").trim();
  const year = String(row.numAno ?? row.ano ?? "").trim();
  const month = String(row.numMes ?? row.mes ?? "").trim();
  const installment = String(row.numParcela ?? row.parcela ?? "").trim();
  const lot = String(row.numLote ?? row.codLote ?? "").trim();
  const reimbursement = String(row.numRessarcimento ?? "").trim();
  const url = httpUrl(row.urlDocumento ?? row.urlDocument ?? row.documentUrl);

  const recordId = stableId([
    "network-history-record-v2",
    deputyId,
    officialDocumentId,
    supplierTaxId || supplierName,
    documentNumber,
    date,
    category,
    year,
    month,
    installment,
    lot,
    reimbursement,
    amount.toFixed(2),
    faceValue.toFixed(2),
    glosaValue.toFixed(2)
  ]);

  const documentId = officialDocumentId
    ? stableId(["network-history-document-v2", deputyId, officialDocumentId])
    : stableId([
        "network-history-fallback-v2",
        deputyId,
        supplierTaxId || supplierName,
        documentNumber,
        date,
        faceValue.toFixed(2),
        category,
        url
      ]);

  return {
    recordId,
    documentId,
    officialDocumentId,
    supplierTaxId,
    supplierName,
    documentNumber,
    date,
    amount,
    url
  };
}

function groupHistoryDocuments(
  rawRows: Record<string, unknown>[],
  deputyId: string
): HistoryDocument[] {
  const uniqueRecords = new Map<string, ReturnType<typeof historyRecord>>();

  for (const row of rawRows) {
    const record = historyRecord(row, deputyId);
    if (record.amount <= 0) continue;
    if (!uniqueRecords.has(record.recordId)) {
      uniqueRecords.set(record.recordId, record);
    }
  }

  const builders = new Map<
    string,
    HistoryDocument & { recordIds: Set<string> }
  >();

  for (const record of uniqueRecords.values()) {
    const current = builders.get(record.documentId) ?? {
      id: record.documentId,
      supplierName: record.supplierName,
      supplierTaxId: record.supplierTaxId || undefined,
      amount: 0,
      date: record.date,
      documentNumber: record.documentNumber,
      documentCode: record.officialDocumentId,
      url: record.url,
      recordIds: new Set<string>()
    };

    current.amount += record.amount;
    current.recordIds.add(record.recordId);
    if (!current.url && record.url) current.url = record.url;
    if (!current.date && record.date) current.date = record.date;
    if (!current.documentNumber && record.documentNumber) {
      current.documentNumber = record.documentNumber;
    }
    builders.set(record.documentId, current);
  }

  return [...builders.values()].map(({ recordIds: _recordIds, ...document }) => ({
    ...document,
    amount: round(document.amount)
  }));
}

function matchesSupplier(
  supplierTaxId: string | undefined,
  supplierName: string,
  candidateTaxId: string | undefined,
  candidateName: string
) {
  if (supplierTaxId && candidateTaxId) return supplierTaxId === candidateTaxId;
  return normalizeText(supplierName) === normalizeText(candidateName);
}

export async function buildEntityNetwork(input: {
  alertId: string;
  deputyName?: string;
  supplierName?: string;
  evidence: Record<string, unknown>;
  manualEntities: AlertManualEntity[];
}) {
  const errors: string[] = [];
  const caseDocuments = parseCaseDocuments(input.evidence);
  const structuredSuppliers = parseStructuredSuppliers(
    input.evidence,
    caseDocuments,
    input.supplierName
  );

  const analyzedYear = Number(input.evidence.analyzedYear ?? 0);
  const years = yearsForLegislature(
    Number.isFinite(analyzedYear) && analyzedYear > 0 ? analyzedYear : undefined
  );

  let deputyId = String(input.evidence.deputyId ?? "").trim();
  if (!deputyId && input.deputyName) {
    try {
      deputyId = (await findDeputyIdByName(input.deputyName)) ?? "";
    } catch (error) {
      errors.push(
        `Deputado: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const deputyEntity: AlertNetworkEntity = {
    id: `deputy-${stableId([deputyId, input.deputyName])}`,
    name: input.deputyName ?? "Parlamentar não identificado",
    type: "pessoa",
    role: "Parlamentar relacionada ao caso",
    origin: "camara",
    verification: "camara",
    sourceUrl: deputyId
      ? `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputyId}`
      : undefined,
    sourceNote:
      "Identidade associada aos dados estruturados da Câmara dos Deputados."
  };

  const seedEntities: AlertNetworkEntity[] = [deputyEntity];

  for (const supplier of structuredSuppliers) {
    const sourceUrl = firstDocumentUrl(supplier, caseDocuments);
    seedEntities.push({
      id: `supplier-${stableId([supplier.taxId, supplier.name])}`,
      name: supplier.name || supplier.taxId || "Fornecedor não identificado",
      type: "empresa",
      role: "Fornecedor informado nos dados estruturados da CEAP",
      taxId: supplier.taxId,
      origin: "camara",
      verification: "camara",
      sourceUrl,
      sourceNote:
        `${supplier.documentCount || supplier.documentIds.length} documento(s) do caso, ` +
        `com R$ ${round(supplier.amount).toFixed(2)} em lançamentos CEAP relacionados.`
    });
  }

  for (const item of input.manualEntities) {
    seedEntities.push({
      id: item.id,
      name: item.name,
      type: item.type,
      role: item.role,
      taxId: cleanTaxId(item.taxId) || undefined,
      origin: "documento_manual",
      verification: item.verification,
      sourceUrl: item.sourceUrl,
      sourceNote: item.sourceNote
    });
  }

  const entityMap = new Map<string, AlertNetworkEntity>();
  for (const entity of seedEntities) {
    const key =
      entity.type === "empresa" && entity.taxId
        ? `empresa:${entity.taxId}`
        : `${entity.type}:${normalizeText(entity.name)}`;

    const existing = entityMap.get(key);
    if (!existing) {
      entityMap.set(key, entity);
      continue;
    }

    entityMap.set(key, {
      ...existing,
      role:
        existing.role === entity.role
          ? existing.role
          : `${existing.role}; ${entity.role}`,
      sourceUrl: entity.sourceUrl ?? existing.sourceUrl,
      sourceNote:
        [existing.sourceNote, entity.sourceNote].filter(Boolean).join(" | ") ||
        undefined,
      verification:
        entity.verification === "documento"
          ? "documento"
          : existing.verification
    });
  }

  const companyEntities = [...entityMap.values()].filter(
    (entity) => entity.type === "empresa" && cleanTaxId(entity.taxId).length === 14
  );

  let companySuccess = 0;
  let companyFailures = 0;

  for (const companyEntity of companyEntities.slice(0, 12)) {
    try {
      const profile = await fetchCompanyProfile(companyEntity.taxId ?? "");
      if (!profile) {
        companyFailures += 1;
        errors.push(
          `CNPJ ${companyEntity.taxId}: cadastro não localizado nas fontes consultadas.`
        );
        continue;
      }

      companySuccess += 1;
      companyEntity.company = profileForEntity(profile);
      if (
        (!companyEntity.name || companyEntity.name === companyEntity.taxId) &&
        profile.legalName
      ) {
        companyEntity.name = profile.legalName;
      }
    } catch (error) {
      companyFailures += 1;
      errors.push(
        `CNPJ ${companyEntity.taxId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (companyEntities.length > 12) {
    errors.push(
      "O enriquecimento foi limitado às doze primeiras empresas para evitar sobrecarga das fontes cadastrais."
    );
  }

  let rawExpenses: Record<string, unknown>[] = [];
  if (deputyId) {
    try {
      const history = await fetchDeputyExpenses(deputyId, years);
      rawExpenses = history.rows;
      errors.push(...history.errors.map((item) => `Câmara: ${item}`));
    } catch (error) {
      errors.push(
        `Câmara: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    errors.push(
      "O identificador do parlamentar não foi localizado; o histórico completo de pagamentos não foi calculado."
    );
  }

  const historyDocuments = groupHistoryDocuments(rawExpenses, deputyId);
  const relations: AlertEntityRelation[] = [];

  for (const supplier of structuredSuppliers) {
    const entity = [...entityMap.values()].find(
      (candidate) =>
        candidate.type === "empresa" &&
        matchesSupplier(
          supplier.taxId,
          supplier.name,
          candidate.taxId,
          candidate.name
        )
    );
    if (!entity) continue;

    relations.push(
      relation({
        fromEntityId: deputyEntity.id,
        toEntityId: entity.id,
        type: "fornecedor_camara",
        label: "Fornecedor informado pela Câmara",
        detail:
          `${supplier.documentCount || supplier.documentIds.length} documento(s) oficial(is) ` +
          `do caso vinculam o fornecedor a R$ ${round(supplier.amount).toFixed(2)} em lançamentos CEAP. ` +
          "A relação não identifica, por si só, beneficiário econômico final ou irregularidade.",
        verification: "camara",
        sourceUrl: firstDocumentUrl(supplier, caseDocuments)
      })
    );
  }

  for (const manual of input.manualEntities) {
    const manualTaxId = cleanTaxId(manual.taxId);
    const generated = [...entityMap.values()].find((entity) =>
      manualTaxId
        ? entity.taxId === manualTaxId
        : entity.type === manual.type &&
          normalizeText(entity.name) === normalizeText(manual.name)
    );
    if (!generated) continue;

    relations.push(
      relation({
        fromEntityId: deputyEntity.id,
        toEntityId: generated.id,
        type: "papel_documental",
        label: `Papel indicado no documento: ${manual.role}`,
        detail: manual.sourceNote,
        verification: manual.verification,
        sourceUrl: manual.sourceUrl
      })
    );
  }

  const companies = [...entityMap.values()].filter(
    (entity) => entity.type === "empresa"
  );

  for (const company of companies) {
    const casePayments = caseDocuments.filter((document) =>
      matchesSupplier(
        company.taxId,
        company.name,
        document.supplierTaxId,
        document.supplierName
      )
    );

    const fullHistory = historyDocuments.filter((document) =>
      matchesSupplier(
        company.taxId,
        company.name,
        document.supplierTaxId,
        document.supplierName
      )
    );

    const payments = fullHistory.length
      ? fullHistory
      : casePayments.map((document) => ({
          id: document.id,
          supplierName: document.supplierName,
          supplierTaxId: document.supplierTaxId,
          amount: document.ceapAmount,
          date: document.documentDate,
          documentNumber: document.documentNumber ?? "",
          documentCode: document.officialDocumentId ?? "",
          url: document.documentUrl
        }));

    if (!payments.length) continue;

    const dates = payments
      .map((item) => item.date)
      .filter((value): value is string => Boolean(value))
      .sort();

    company.payments = {
      count: payments.length,
      total: round(payments.reduce((total, item) => total + item.amount, 0)),
      firstDate: dates[0],
      lastDate: dates.at(-1),
      documents: payments
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 100)
        .map((item) => ({
          date: item.date,
          amount: item.amount,
          documentNumber: item.documentNumber,
          documentCode: item.documentCode,
          url: item.url
        }))
    };

    relations.push(
      relation({
        fromEntityId: deputyEntity.id,
        toEntityId: company.id,
        type: "pagamento_ceap",
        label: fullHistory.length
          ? "Histórico de pagamentos CEAP localizado"
          : "Pagamentos vinculados ao caso",
        detail:
          `${payments.length} documento(s) único(s), total de R$ ${company.payments.total.toFixed(2)}, ` +
          `entre ${company.payments.firstDate ?? "data não identificada"} e ` +
          `${company.payments.lastDate ?? "data não identificada"}.`,
        verification: "camara",
        sourceUrl: deputyId
          ? `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputyId}/despesas`
          : company.sourceUrl
      })
    );
  }

  const partnerEntities = new Map<string, AlertNetworkEntity>();
  const partnerCompanies = new Map<string, AlertNetworkEntity[]>();

  for (const company of companies) {
    const companyProfile = company.company;
    if (!companyProfile) continue;

    for (const partner of companyProfile.partners.slice(0, 30)) {
      const key = normalizeText(partner.name);
      let partnerEntity = partnerEntities.get(key);

      if (!partnerEntity) {
        partnerEntity = [...entityMap.values()].find(
          (entity) => entity.type === "pessoa" && normalizeText(entity.name) === key
        );
      }

      if (!partnerEntity) {
        partnerEntity = {
          id: `partner-${stableId([partner.name])}`,
          name: partner.name,
          type: "pessoa",
          role: partner.qualification ?? "Sócio ou administrador retornado pelo cadastro",
          origin: "cadastro_empresarial",
          verification: "cadastro",
          sourceUrl: companyProfile.sourceUrl,
          sourceNote:
            `Pessoa retornada no quadro societário de ${
              companyProfile.legalName ?? company.name
            }.`
        };
        entityMap.set(`pessoa:${key}`, partnerEntity);
      }

      partnerEntities.set(key, partnerEntity);
      const linked = partnerCompanies.get(key) ?? [];
      linked.push(company);
      partnerCompanies.set(key, linked);

      relations.push(
        relation({
          fromEntityId: partnerEntity.id,
          toEntityId: company.id,
          type: "socio_de",
          label: partner.qualification ?? "Sócio ou administrador da empresa",
          detail:
            `Relação retornada por ${companyProfile.source}. ` +
            "Confirme alterações, CPF mascarado e vigência na Junta Comercial ou Receita antes de publicar.",
          verification: "cadastro",
          sourceUrl: companyProfile.sourceUrl
        })
      );
    }
  }

  for (const [partnerName, linkedCompanies] of partnerCompanies) {
    const unique = [...new Map(linkedCompanies.map((company) => [company.id, company])).values()];
    if (unique.length < 2) continue;

    for (let leftIndex = 0; leftIndex < unique.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < unique.length; rightIndex += 1) {
        const left = unique[leftIndex];
        const right = unique[rightIndex];
        relations.push(
          relation({
            fromEntityId: left.id,
            toEntityId: right.id,
            type: "socio_compartilhado",
            label: "Sócio ou administrador em comum",
            detail:
              `As duas consultas cadastrais retornaram a pessoa “${partnerName}”. ` +
              "Confirme homonímia, CPF mascarado e vigência societária.",
            verification: "coincidencia",
            sourceUrl: left.company?.sourceUrl
          })
        );
      }
    }
  }

  const companiesWithAddress = companies.filter(
    (company) =>
      company.company?.address &&
      company.company?.municipality &&
      company.company?.state
  );

  for (let leftIndex = 0; leftIndex < companiesWithAddress.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < companiesWithAddress.length;
      rightIndex += 1
    ) {
      const left = companiesWithAddress[leftIndex];
      const right = companiesWithAddress[rightIndex];
      const leftAddress = normalizeText(
        `${left.company?.address}|${left.company?.municipality}|${left.company?.state}`
      );
      const rightAddress = normalizeText(
        `${right.company?.address}|${right.company?.municipality}|${right.company?.state}`
      );

      if (leftAddress && leftAddress === rightAddress) {
        relations.push(
          relation({
            fromEntityId: left.id,
            toEntityId: right.id,
            type: "endereco_coincidente",
            label: "Endereço cadastral coincidente",
            detail:
              "As fontes cadastrais retornaram o mesmo endereço. A coincidência pode ter explicações legítimas e não comprova vínculo econômico.",
            verification: "coincidencia",
            sourceUrl: left.company?.sourceUrl
          })
        );
      }
    }
  }

  for (const partner of partnerEntities.values()) {
    if (
      input.deputyName &&
      normalizeText(partner.name) === normalizeText(input.deputyName)
    ) {
      relations.push(
        relation({
          fromEntityId: deputyEntity.id,
          toEntityId: partner.id,
          type: "nome_identico",
          label: "Nome completo idêntico",
          detail:
            "Foi encontrada identidade nominal exata. Isso exige confirmação documental para excluir homonímia.",
          verification: "coincidencia",
          sourceUrl: partner.sourceUrl
        })
      );
    }
  }

  const questions = [
    "Qual serviço ou bem foi efetivamente fornecido e quais documentos comprovam a entrega?",
    "O preço é compatível com fornecedores equivalentes no mesmo local e período?",
    "Quem é o beneficiário econômico final dos pagamentos e existem repasses documentados a terceiros?",
    "Os sócios e administradores possuem relação profissional, eleitoral, familiar ou societária documentada com o parlamentar, familiares ou assessores?",
    "Há empresas adicionais dos mesmos sócios que receberam recursos públicos ou pagamentos eleitorais?",
    "Existem coincidências de endereço, telefone, representante, contador ou procurador entre as entidades?",
    "As relações apontadas estavam vigentes nas datas dos pagamentos ou decorrem de cadastro posterior?"
  ];

  const sourceGaps = [
    "Parentesco não é inferido por sobrenome ou semelhança nominal. Exige documento ou fonte pública específica.",
    "A busca reversa de todas as empresas ligadas a cada sócio depende de índice próprio ou serviço autorizado; indisponibilidade não é tratada como resultado negativo.",
    "Cruzamentos com fornecedores e doadores de campanha dependem da base eleitoral oficial do TSE.",
    "Cruzamentos com assessores dependem do arquivo oficial de funcionários da Câmara e da lotação no período.",
    "Propriedade de imóvel exige matrícula, cadastro municipal ou documento equivalente.",
    "Dados de APIs cadastrais intermediárias não substituem certidão, Receita Federal ou Junta Comercial."
  ];

  const entities = [...entityMap.values()].filter(
    (entity) => entity.name && entity.role
  );

  const uniqueRelations = [
    ...new Map(relations.map((item) => [item.id, item])).values()
  ];

  const network: AlertEntityNetwork = {
    version: 1,
    generatedAt: new Date().toISOString(),
    manualEntities: input.manualEntities,
    entities,
    relations: uniqueRelations,
    questions,
    sourceGaps,
    sourceStatus: {
      camara:
        deputyId && (historyDocuments.length || caseDocuments.length)
          ? errors.some((item) => item.startsWith("Câmara:"))
            ? "partial"
            : "ok"
          : "error",
      companyProfiles:
        companyEntities.length === 0
          ? "not_applicable"
          : companySuccess > 0 && companyFailures === 0
            ? "ok"
            : companySuccess > 0
              ? "partial"
              : "error",
      errors
    },
    disclaimer:
      "A rede organiza fatos documentados, cadastros e coincidências para triagem. Pagamento público, participação societária, endereço comum ou nome semelhante não comprovam parentesco, favorecimento ou irregularidade. Toda conclusão exige fonte original, contexto temporal e contraditório."
  };

  return network;
}
