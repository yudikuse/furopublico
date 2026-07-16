import type { Investigation, InvestigationAlert } from "@/lib/types";

// Conteúdo propositalmente fictício. Serve apenas para demonstrar o produto sem
// publicar acusações reais antes da apuração e revisão editorial.
export const demoInvestigations: Investigation[] = [
  {
    id: "demo-1",
    slug: "anuncio-de-recurso-e-execucao-parcial-demonstracao",
    title: "Anúncio fala em R$ 8 milhões, mas a execução localizada é bem menor",
    summary:
      "Caso demonstrativo de como o portal confrontará anúncios públicos com empenhos, pagamentos, contratos e entrega física.",
    finding:
      "O valor divulgado não deve ser tratado automaticamente como dinheiro pago. A investigação separa indicação, empenho, liquidação, pagamento e entrega.",
    category: "emendas",
    status: "publicado",
    confidence: "cruzamento",
    state: "GO",
    municipality: "Município demonstrativo",
    involvedAmount: 8_000_000,
    publishedAt: "2026-07-14T12:00:00.000Z",
    updatedAt: "2026-07-16T12:00:00.000Z",
    isFeatured: true,
    isDemo: true,
    tags: ["emendas", "execução", "promessa x entrega"],
    entities: [
      { name: "Parlamentar demonstrativo", type: "pessoa", role: "Autor do anúncio", party: "—", state: "GO" },
      { name: "Município demonstrativo", type: "municipio", role: "Beneficiário informado", state: "GO" }
    ],
    facts: [
      { label: "Valor anunciado", value: "R$ 8.000.000", detail: "Valor mencionado em publicação pública." },
      { label: "Valor empenhado localizado", value: "R$ 3.200.000", detail: "Exemplo de dado orçamentário." },
      { label: "Valor pago localizado", value: "R$ 800.000", detail: "Exemplo de pagamento encontrado." },
      { label: "Entrega física", value: "Não verificada", detail: "Exigiria documentos e verificação local." }
    ],
    sources: [
      {
        title: "Fonte oficial demonstrativa — execução orçamentária",
        publisher: "Base pública",
        url: "https://dadosabertos.camara.leg.br/",
        kind: "dado_oficial",
        accessedAt: "2026-07-16",
        note: "Link ilustrativo. O caso não representa pessoa ou recurso real."
      }
    ],
    timeline: [
      { date: "2026-07-14", title: "Pista criada", description: "Diferença entre anúncio e execução gerou alerta." },
      { date: "2026-07-15", title: "Documentos comparados", description: "Foram separados os estágios da despesa." },
      { date: "2026-07-16", title: "Modelo publicado", description: "Conteúdo fictício para demonstração da plataforma." }
    ],
    responses: [],
    methodology:
      "Comparação entre declaração pública, registros orçamentários, transferências, contratação e evidência de entrega.",
    caveat:
      "Este é um caso fictício de demonstração. Diferença entre anúncio e pagamento não comprova irregularidade, pois cada estágio possui regras e prazos próprios."
  },
  {
    id: "demo-2",
    slug: "fornecedor-concentra-despesas-de-gabinete-demonstracao",
    title: "Um único fornecedor concentra parcela incomum das despesas analisadas",
    summary:
      "Modelo de alerta estatístico que compara a concentração por fornecedor com o histórico do gabinete e com grupos equivalentes.",
    finding:
      "A concentração é um ponto de partida para pedir notas, contratos, comprovação dos serviços e explicações — não uma prova de fraude.",
    category: "despesas",
    status: "publicado",
    confidence: "pista",
    state: "DF",
    involvedAmount: 420_000,
    publishedAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    isFeatured: false,
    isDemo: true,
    tags: ["CEAP", "fornecedor", "concentração"],
    entities: [
      { name: "Gabinete demonstrativo", type: "orgao", role: "Pagador" },
      { name: "Empresa Alfa Demonstrativa Ltda.", type: "empresa", role: "Fornecedor" }
    ],
    facts: [
      { label: "Total analisado", value: "R$ 700.000" },
      { label: "Recebido pelo fornecedor", value: "R$ 420.000" },
      { label: "Concentração", value: "60%" },
      { label: "Situação", value: "Requer documentação complementar" }
    ],
    sources: [
      {
        title: "Dados demonstrativos da cota parlamentar",
        publisher: "Câmara dos Deputados",
        url: "https://dadosabertos.camara.leg.br/swagger/api.html?tab=api",
        kind: "dado_oficial",
        accessedAt: "2026-07-16"
      }
    ],
    timeline: [
      { date: "2026-07-12", title: "Alerta estatístico", description: "Regra de concentração ultrapassou o limite configurado." },
      { date: "2026-07-15", title: "Aguardando documentos", description: "O alerta permanece como pista, sem acusação." }
    ],
    responses: [],
    methodology:
      "Soma das despesas por gabinete e fornecedor, cálculo de participação percentual e comparação com a distribuição histórica.",
    caveat:
      "Caso fictício. Concentração de pagamentos pode decorrer de contrato contínuo ou fornecedor especializado e precisa ser contextualizada."
  },
  {
    id: "demo-3",
    slug: "declaracao-e-voto-divergente-demonstracao",
    title: "Declaração pública e voto nominal apontam em direções diferentes",
    summary:
      "Exemplo de apuração que exige conferir a fala original e identificar exatamente qual texto, destaque ou substitutivo foi votado.",
    finding:
      "O voto isolado não basta: é necessário explicar o objeto efetivamente submetido ao Plenário e o contexto da declaração.",
    category: "votos",
    status: "aguardando_resposta",
    confidence: "documental",
    state: "SP",
    publishedAt: "2026-07-10T12:00:00.000Z",
    updatedAt: "2026-07-16T12:00:00.000Z",
    isFeatured: false,
    isDemo: true,
    tags: ["votação nominal", "declaração", "contradição"],
    entities: [{ name: "Parlamentar demonstrativo", type: "pessoa", role: "Autor da declaração", state: "SP" }],
    facts: [
      { label: "Declaração", value: "Posição contrária ao tema", detail: "Trecho fictício para demonstrar o método." },
      { label: "Voto registrado", value: "Sim" },
      { label: "Objeto da votação", value: "Requer validação editorial" },
      { label: "Resposta", value: "Solicitada" }
    ],
    sources: [
      {
        title: "Registro demonstrativo de votação",
        publisher: "Câmara dos Deputados",
        url: "https://dadosabertos.camara.leg.br/",
        kind: "dado_oficial",
        accessedAt: "2026-07-16"
      }
    ],
    timeline: [
      { date: "2026-07-10", title: "Declaração localizada", description: "Conteúdo marcado para verificação." },
      { date: "2026-07-11", title: "Voto nominal localizado", description: "O voto aparenta divergir da declaração." },
      { date: "2026-07-16", title: "Pedido de resposta", description: "A publicação aguarda explicação e checagem do objeto votado." }
    ],
    responses: [],
    methodology:
      "Transcrição da declaração, identificação temporal, busca de votação relacionada, leitura do texto votado e solicitação de resposta.",
    caveat:
      "Caso fictício. Projetos podem sofrer alterações, destaques e substitutivos; por isso a classificação só é concluída após leitura humana."
  }
];

export const demoAlerts: InvestigationAlert[] = [
  {
    id: "alert-demo-1",
    title: "Possível documento repetido em despesas",
    rule: "Mesmo CNPJ, número de documento, data e valor",
    severity: "alta",
    status: "novo",
    detectedAt: "2026-07-16T10:30:00.000Z",
    deputyName: "Parlamentar demonstrativo",
    supplierName: "Fornecedor demonstrativo",
    amount: 18_900,
    evidence: { matches: 2, source: "CEAP" }
  },
  {
    id: "alert-demo-2",
    title: "Fornecedor concentra 67% dos pagamentos da categoria",
    rule: "Participação acima de 50% com valor superior a R$ 100 mil",
    severity: "media",
    status: "em_revisao",
    detectedAt: "2026-07-15T14:10:00.000Z",
    deputyName: "Gabinete demonstrativo",
    supplierName: "Empresa demonstrativa",
    amount: 231_000,
    evidence: { share: 0.67, category: "Divulgação da atividade parlamentar" }
  }
];
