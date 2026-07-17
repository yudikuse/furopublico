import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AlertEntityNetwork,
  EvidenceSource,
  InvestigationFact,
  InvestigationTimelineItem,
  InvolvedEntity
} from "@/lib/types";

type InvestigationSyncFields = {
  entities: InvolvedEntity[];
  facts: InvestigationFact[];
  sources: EvidenceSource[];
  timeline: InvestigationTimelineItem[];
};

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function entityKey(entity: Pick<InvolvedEntity, "type" | "name">) {
  return `${entity.type}:${normalize(entity.name)}`;
}

function safePublisher(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Fonte registrada";
  }
}

function sourceKind(url: string): EvidenceSource["kind"] {
  return /(^|\.)camara\.leg\.br$/i.test(safePublisher(url)) ||
    /(^|\.)dadosabertos\.camara\.leg\.br$/i.test(safePublisher(url))
    ? "dado_oficial"
    : "documento";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function generatedEntities(
  network: AlertEntityNetwork,
  alertId: string
): InvolvedEntity[] {
  return network.entities.map((entity) => ({
    name: entity.company?.legalName ?? entity.name,
    type: entity.type,
    role: entity.role,
    taxId: entity.taxId,
    sourceUrl: entity.sourceUrl ?? entity.company?.sourceUrl,
    verification: entity.verification,
    sourceAlertId: alertId
  }));
}

function generatedFacts(
  network: AlertEntityNetwork,
  alertId: string
): InvestigationFact[] {
  const names = new Map(
    network.entities.map((entity) => [entity.id, entity.name])
  );

  const facts: InvestigationFact[] = [
    {
      label: "Entidades mapeadas",
      value: String(network.entities.length),
      detail:
        "Quantidade de pessoas, empresas, imóveis ou órgãos organizados na rede do alerta.",
      sourceAlertId: alertId
    },
    {
      label: "Relações mapeadas",
      value: String(network.relations.length),
      detail:
        "Inclui fatos documentados, dados cadastrais e coincidências ainda sujeitas a confirmação.",
      sourceAlertId: alertId
    }
  ];

  for (const entity of network.entities) {
    if (entity.company) {
      facts.push({
        label: `Cadastro — ${entity.company.legalName ?? entity.name}`,
        value: entity.company.status ?? "Situação não informada",
        detail: [
          entity.taxId ? `CNPJ ${entity.taxId}.` : "",
          entity.company.openingDate
            ? `Abertura: ${entity.company.openingDate}.`
            : "",
          entity.company.mainActivity
            ? `Atividade: ${entity.company.mainActivity}.`
            : "",
          `Fonte: ${entity.company.source}.`,
          entity.company.warning
        ]
          .filter(Boolean)
          .join(" "),
        sourceAlertId: alertId
      });
    }

    if (entity.payments) {
      facts.push({
        label: `Pagamentos CEAP — ${entity.name}`,
        value: formatMoney(entity.payments.total),
        detail:
          `${entity.payments.count} documento(s), de ${
            entity.payments.firstDate ?? "data não identificada"
          } a ${entity.payments.lastDate ?? "data não identificada"}.`,
        sourceAlertId: alertId
      });
    }
  }

  for (const relation of network.relations) {
    facts.push({
      label: relation.label,
      value:
        `${names.get(relation.fromEntityId) ?? "Entidade"} → ` +
        `${names.get(relation.toEntityId) ?? "Entidade"}`,
      detail:
        `${relation.detail} Classificação: ${relation.verification}.`,
      sourceAlertId: alertId
    });
  }

  for (const question of network.questions) {
    facts.push({
      label: "Pergunta pendente",
      value: question,
      detail:
        "Questão interna de apuração. Não representa conclusão ou acusação.",
      sourceAlertId: alertId
    });
  }

  for (const gap of network.sourceGaps) {
    facts.push({
      label: "Limite da fonte",
      value: gap,
      detail:
        "Lacuna que deve permanecer visível até ser suprida por fonte adequada.",
      sourceAlertId: alertId
    });
  }

  return facts;
}

function generatedSources(
  network: AlertEntityNetwork,
  alertId: string
): EvidenceSource[] {
  const sources = new Map<string, EvidenceSource>();

  function add(
    url: string | undefined,
    title: string,
    note: string
  ) {
    if (!url || sources.has(url)) return;

    sources.set(url, {
      title,
      publisher: safePublisher(url),
      url,
      kind: sourceKind(url),
      accessedAt: new Date().toISOString().slice(0, 10),
      note,
      sourceAlertId: alertId
    });
  }

  for (const entity of network.entities) {
    add(
      entity.sourceUrl,
      `Fonte da entidade: ${entity.name}`,
      entity.sourceNote ??
        "Fonte vinculada à entidade na rede investigativa."
    );

    add(
      entity.company?.sourceUrl,
      `Cadastro empresarial: ${entity.company?.legalName ?? entity.name}`,
      entity.company?.warning ??
        "Cadastro empresarial intermediário; confirmar em fonte oficial antes de publicar."
    );

    for (const document of entity.payments?.documents ?? []) {
      add(
        document.url,
        `Documento CEAP: ${entity.name}`,
        `Documento de despesa parlamentar no valor de ${formatMoney(
          document.amount
        )}.`
      );
    }
  }

  for (const relation of network.relations) {
    add(
      relation.sourceUrl,
      `Fonte da relação: ${relation.label}`,
      relation.detail
    );
  }

  return [...sources.values()];
}

function generatedTimeline(
  network: AlertEntityNetwork,
  alertId: string
): InvestigationTimelineItem[] {
  return [
    {
      date: network.generatedAt.slice(0, 10),
      title: "Rede de entidades sincronizada",
      description:
        `${network.entities.length} entidade(s) e ` +
        `${network.relations.length} relação(ões) foram incorporadas à investigação. ` +
        "Os dados permanecem sujeitos à confirmação documental e ao contraditório.",
      sourceAlertId: alertId
    }
  ];
}

function mergeEntities(
  existing: InvolvedEntity[],
  generated: InvolvedEntity[],
  alertId: string
) {
  const preserved = existing.filter(
    (entity) => entity.sourceAlertId !== alertId
  );
  const map = new Map(preserved.map((entity) => [entityKey(entity), entity]));

  for (const entity of generated) {
    const key = entityKey(entity);
    if (!map.has(key)) map.set(key, entity);
  }

  return [...map.values()];
}

function mergeBySourceAlert<T extends { sourceAlertId?: string }>(
  existing: T[],
  generated: T[],
  alertId: string
) {
  return [
    ...existing.filter((item) => item.sourceAlertId !== alertId),
    ...generated
  ];
}

function mergeSources(
  existing: EvidenceSource[],
  generated: EvidenceSource[],
  alertId: string
) {
  const preserved = existing.filter(
    (source) => source.sourceAlertId !== alertId
  );
  const map = new Map(preserved.map((source) => [source.url, source]));

  for (const source of generated) {
    if (!map.has(source.url)) map.set(source.url, source);
  }

  return [...map.values()];
}

export async function syncInvestigationFromEntityNetwork(input: {
  supabase: SupabaseClient;
  investigationId: string;
  alertId: string;
  network: AlertEntityNetwork;
}) {
  const { data, error } = await input.supabase
    .from("investigations")
    .select("entities,facts,sources,timeline")
    .eq("id", input.investigationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Investigação vinculada não encontrada.");

  const current: InvestigationSyncFields = {
    entities: arrayOrEmpty<InvolvedEntity>(data.entities),
    facts: arrayOrEmpty<InvestigationFact>(data.facts),
    sources: arrayOrEmpty<EvidenceSource>(data.sources),
    timeline: arrayOrEmpty<InvestigationTimelineItem>(data.timeline)
  };

  const entities = mergeEntities(
    current.entities,
    generatedEntities(input.network, input.alertId),
    input.alertId
  );

  const facts = mergeBySourceAlert(
    current.facts,
    generatedFacts(input.network, input.alertId),
    input.alertId
  );

  const sources = mergeSources(
    current.sources,
    generatedSources(input.network, input.alertId),
    input.alertId
  );

  const timeline = mergeBySourceAlert(
    current.timeline,
    generatedTimeline(input.network, input.alertId),
    input.alertId
  );

  const { error: updateError } = await input.supabase
    .from("investigations")
    .update({
      entities,
      facts,
      sources,
      timeline
    })
    .eq("id", input.investigationId);

  if (updateError) throw updateError;

  return {
    entities: entities.length,
    facts: facts.length,
    sources: sources.length,
    timeline: timeline.length
  };
}
