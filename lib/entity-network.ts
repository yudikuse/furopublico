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

function getPrimaryRecord(evidence: Record<string, unknown>) {
  const direct = asRecord(evidence.record);
  if (direct) return direct;
  if (Array.isArray(evidence.records)) return asRecord(evidence.records[0]);
  return null;
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

function yearsForLegislature(referenceYear?: number) {
  const current = Math.min(new Date().getUTCFullYear(), 2027);
  const end = Math.min(
    Math.max(referenceYear ?? current, 2023),
    current
  );
  return Array.from(
    { length: end - 2023 + 1 },
    (_, index) => 2023 + index
  );
}

function isoDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function expenseRow(row: Record<string, unknown>) {
  return {
    supplierTaxId: cleanTaxId(
      row.cnpjCpfFornecedor ?? row.txtCNPJCPF
    ),
    supplierName: String(
      row.nomeFornecedor ?? row.txtFornecedor ?? ""
    ).trim(),
    amount: numberValue(
      row.valorLiquido ?? row.vlrLiquido ?? row.valorDocumento
    ),
    date: isoDate(row.dataDocumento ?? row.datEmissao),
    documentNumber: String(
      row.numDocumento ?? row.txtNumero ?? ""
    ).trim(),
    documentCode: String(row.codDocumento ?? "").trim(),
    url: String(row.urlDocumento ?? "").trim() || undefined
  };
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

function relation(
  input: Omit<AlertEntityRelation, "id">
): AlertEntityRelation {
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

export async function buildEntityNetwork(input: {
  alertId: string;
  deputyName?: string;
  supplierName?: string;
  evidence: Record<string, unknown>;
  manualEntities: AlertManualEntity[];
}) {
  const record = getPrimaryRecord(input.evidence);
  const referenceYear = Number(
    record?.ano ??
      String(input.evidence.documentDate ?? "").slice(0, 4)
  );
  const years = yearsForLegislature(
    Number.isFinite(referenceYear) ? referenceYear : undefined
  );

  const errors: string[] = [];

  let deputyId = String(
    input.evidence.deputyId ??
      record?.idDeputado ??
      record?.idDeputadoParlamentar ??
      ""
  );

  if (!deputyId && input.deputyName) {
    try {
      deputyId = (await findDeputyIdByName(input.deputyName)) ?? "";
    } catch (error) {
      errors.push(
        `Deputado: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const documentUrl = String(
    record?.urlDocumento ?? input.evidence.urlDocumento ?? ""
  ).trim();

  const supplierTaxId = cleanTaxId(
    input.evidence.supplierTaxId ??
      record?.cnpjCpfFornecedor ??
      record?.txtCNPJCPF
  );

  const supplierName =
    input.supplierName ??
    String(record?.nomeFornecedor ?? "Fornecedor não identificado");

  const deputyEntity: AlertNetworkEntity = {
    id: `deputy-${stableId([deputyId, input.deputyName])}`,
    name: input.deputyName ?? "Parlamentar não identificado",
    type: "pessoa",
    role: "Parlamentar relacionada ao alerta",
    origin: "camara",
    verification: "camara",
    sourceUrl:
      deputyId
        ? `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputyId}`
        : undefined,
    sourceNote:
      "Identidade associada aos dados estruturados da Câmara dos Deputados."
  };

  const seedEntities: AlertNetworkEntity[] = [deputyEntity];

  if (supplierName || supplierTaxId) {
    seedEntities.push({
      id: `supplier-${stableId([supplierTaxId, supplierName])}`,
      name: supplierName || supplierTaxId,
      type: "empresa",
      role: "Fornecedor ou beneficiário informado pela API da Câmara",
      taxId: supplierTaxId || undefined,
      origin: "camara",
      verification: "camara",
      sourceUrl: documentUrl || undefined,
      sourceNote:
        "Fornecedor e CNPJ obtidos dos campos estruturados da despesa parlamentar."
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
        [existing.sourceNote, entity.sourceNote]
          .filter(Boolean)
          .join(" | ") || undefined,
      verification:
        entity.verification === "documento"
          ? "documento"
          : existing.verification
    });
  }

  const companyEntities = [...entityMap.values()].filter(
    (entity) =>
      entity.type === "empresa" &&
      cleanTaxId(entity.taxId).length === 14
  );

  let companySuccess = 0;
  let companyFailures = 0;

  for (const companyEntity of companyEntities.slice(0, 8)) {
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

      for (const partner of profile.partners.slice(0, 30)) {
        const personKey = `pessoa:${normalizeText(partner.name)}`;
        let personEntity = entityMap.get(personKey);

        if (!personEntity) {
          personEntity = {
            id: `partner-${stableId([partner.name])}`,
            name: partner.name,
            type: "pessoa",
            role:
              partner.qualification ??
              "Sócio ou administrador retornado pelo cadastro",
            origin: "cadastro_empresarial",
            verification: "cadastro",
            sourceUrl: profile.sourceUrl,
            sourceNote:
              `Pessoa retornada no quadro societário de ${
                profile.legalName ?? companyEntity.name
              }.`
          };
          entityMap.set(personKey, personEntity);
        }

        const companyKey = companyEntity.taxId
          ? `empresa:${companyEntity.taxId}`
          : `empresa:${normalizeText(companyEntity.name)}`;
        const storedCompany = entityMap.get(companyKey) ?? companyEntity;

        const key = `relation:${personEntity.id}:${storedCompany.id}:socio`;
        if (!entityMap.has(key)) {
          // A chave artificial é usada somente para evitar duplicação no mapa.
          entityMap.set(key, {
            id: key,
            name: "",
            type: "orgao",
            role: "",
            origin: "cruzamento",
            verification: "cadastro"
          });
        }
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

  if (companyEntities.length > 8) {
    errors.push(
      "A execução foi limitada às oito primeiras empresas para evitar sobrecarga e bloqueios das fontes cadastrais."
    );
  }

  // Remove as chaves artificiais usadas apenas para controle.
  for (const [key] of entityMap) {
    if (key.startsWith("relation:")) entityMap.delete(key);
  }

  let rawExpenses: Record<string, unknown>[] = [];
  if (deputyId) {
    const history = await fetchDeputyExpenses(deputyId, years);
    rawExpenses = history.rows;
    errors.push(...history.errors.map((item) => `Câmara: ${item}`));
  } else {
    errors.push(
      "O identificador do parlamentar não foi localizado; pagamentos por entidade não foram calculados."
    );
  }

  const expenses = rawExpenses
    .map(expenseRow)
    .filter((item) => item.amount > 0);

  const relations: AlertEntityRelation[] = [];

  const primarySupplier = [...entityMap.values()].find(
    (entity) =>
      entity.type === "empresa" &&
      (entity.taxId === supplierTaxId ||
        normalizeText(entity.name) === normalizeText(supplierName))
  );

  if (primarySupplier) {
    relations.push(
      relation({
        fromEntityId: deputyEntity.id,
        toEntityId: primarySupplier.id,
        type: "fornecedor_camara",
        label: "Fornecedor/beneficiário informado pela Câmara",
        detail:
          "A relação decorre dos campos estruturados da despesa. Ela não identifica, por si só, o beneficiário econômico final.",
        verification: "camara",
        sourceUrl: documentUrl || undefined
      })
    );
  }

  for (const manual of input.manualEntities) {
    const generated = [...entityMap.values()].find((entity) => {
      const manualTaxId = cleanTaxId(manual.taxId);
      return manualTaxId
        ? entity.taxId === manualTaxId
        : entity.type === manual.type &&
            normalizeText(entity.name) === normalizeText(manual.name);
    });

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
    const taxId = cleanTaxId(company.taxId);
    const possibleNames = [
      company.name,
      company.company?.legalName,
      company.company?.tradeName
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeText);

    const payments = expenses.filter((expense) =>
      taxId
        ? expense.supplierTaxId === taxId
        : possibleNames.includes(normalizeText(expense.supplierName))
    );

    if (payments.length) {
      const dates = payments
        .map((item) => item.date)
        .filter((value): value is string => Boolean(value))
        .sort();

      company.payments = {
        count: payments.length,
        total: round(
          payments.reduce((total, item) => total + item.amount, 0)
        ),
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
          label: "Pagamentos da CEAP localizados",
          detail: `${payments.length} documento(s), total de R$ ${company.payments.total.toFixed(
            2
          )}, entre ${
            company.payments.firstDate ?? "data não identificada"
          } e ${company.payments.lastDate ?? "data não identificada"}.`,
          verification: "camara",
          sourceUrl:
            deputyId
              ? `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputyId}/despesas`
              : undefined
        })
      );
    }
  }

  const partnerEntities = new Map<string, AlertNetworkEntity>();

  for (const company of companies) {
    const companyProfile = company.company;
    if (!companyProfile) continue;

    for (const partner of companyProfile.partners) {
      const key = normalizeText(partner.name);
      let partnerEntity = partnerEntities.get(key);

      if (!partnerEntity) {
        partnerEntity = [...entityMap.values()].find(
          (entity) =>
            entity.type === "pessoa" &&
            normalizeText(entity.name) === key
        );

        if (!partnerEntity) {
          partnerEntity = {
            id: `partner-${stableId([partner.name])}`,
            name: partner.name,
            type: "pessoa",
            role:
              partner.qualification ??
              "Sócio ou administrador retornado pelo cadastro",
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
      }

      relations.push(
        relation({
          fromEntityId: partnerEntity.id,
          toEntityId: company.id,
          type: "socio_de",
          label:
            partner.qualification ??
            "Sócio ou administrador da empresa",
          detail:
            `Relação retornada por ${companyProfile.source}. Confirme alterações e datas na Junta Comercial ou Receita antes de publicar.`,
          verification: "cadastro",
          sourceUrl: companyProfile.sourceUrl
        })
      );
    }
  }

  const partnerCompanies = new Map<string, AlertNetworkEntity[]>();

  for (const company of companies) {
    for (const partner of company.company?.partners ?? []) {
      const key = normalizeText(partner.name);
      const list = partnerCompanies.get(key) ?? [];
      list.push(company);
      partnerCompanies.set(key, list);
    }
  }

  for (const [partnerName, linkedCompanies] of partnerCompanies) {
    if (linkedCompanies.length < 2) continue;

    for (let index = 0; index < linkedCompanies.length - 1; index += 1) {
      const left = linkedCompanies[index];
      const right = linkedCompanies[index + 1];

      relations.push(
        relation({
          fromEntityId: left.id,
          toEntityId: right.id,
          type: "socio_compartilhado",
          label: "Sócio ou administrador em comum",
          detail:
            `As duas consultas cadastrais retornaram a pessoa “${partnerName}”. Confirme homonímia, CPF mascarado e vigência societária.`,
          verification: "coincidencia",
          sourceUrl: left.company?.sourceUrl
        })
      );
    }
  }

  const companiesWithAddress = companies.filter(
    (company) =>
      company.company?.address &&
      company.company?.municipality &&
      company.company?.state
  );

  for (let i = 0; i < companiesWithAddress.length; i += 1) {
    for (let j = i + 1; j < companiesWithAddress.length; j += 1) {
      const left = companiesWithAddress[i];
      const right = companiesWithAddress[j];

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
            "Foi encontrada identidade nominal exata. Isso ainda exige confirmação documental para excluir homonímia.",
          verification: "coincidencia",
          sourceUrl: partner.sourceUrl
        })
      );
    }
  }

  const questions = [
    "Qual é o papel de cada parte no documento: locatário, locador, proprietário, administradora, beneficiário bancário e prestador?",
    "Quem é o beneficiário econômico final dos pagamentos e quais valores são repassados a terceiros?",
    "O contrato, o registro do imóvel e os boletos confirmam a mesma cadeia de partes?",
    "Os sócios e administradores possuem relação profissional, eleitoral, familiar ou societária documentada com a parlamentar, familiares ou assessores?",
    "Há empresas adicionais dos mesmos sócios e alguma delas recebeu recursos públicos, pagamentos eleitorais ou valores de outros gabinetes?",
    "Existem coincidências de endereço, telefone, representante, contador ou procurador entre as entidades?",
    "O preço e os encargos são compatíveis com imóveis ou serviços equivalentes no mesmo local e período?",
    "As relações apontadas continuam vigentes nas datas dos pagamentos ou decorrem de cadastro posterior?"
  ];

  const sourceGaps = [
    "Parentesco não é inferido por sobrenome ou semelhança nominal. Exige documento ou fonte pública específica.",
    "A busca reversa de todas as empresas ligadas a cada sócio depende de índice próprio da base aberta da Receita ou serviço autorizado; não é tratada como resultado negativo quando indisponível.",
    "Cruzamentos com fornecedores e doadores de campanha do TSE ainda devem ser executados em base eleitoral oficial.",
    "Cruzamentos com assessores dependem do arquivo oficial de funcionários da Câmara e da confirmação da lotação no período investigado.",
    "Propriedade de imóvel não é comprovada pelo endereço do boleto. Exige matrícula, cadastro municipal ou documento equivalente.",
    "Dados de APIs cadastrais intermediárias não substituem certidão, Receita Federal ou Junta Comercial."
  ];

  const entities = [...entityMap.values()].filter(
    (entity) => entity.name && entity.role
  );

  const network: AlertEntityNetwork = {
    version: 1,
    generatedAt: new Date().toISOString(),
    manualEntities: input.manualEntities,
    entities,
    relations,
    questions,
    sourceGaps,
    sourceStatus: {
      camara:
        deputyId && rawExpenses.length
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
      "A rede organiza fontes e coincidências para triagem. Cadastro societário, endereço comum, nome semelhante ou pagamento público não comprovam parentesco, favorecimento ou irregularidade. Toda conclusão exige fonte original, contexto temporal e contraditório."
  };

  return network;
}
