# Furo Público — Emendas: diagnóstico v2

O primeiro diagnóstico retornou 3.403 referências de documentos, mas o endpoint
`/emendas/documentos/{codigo}` contém apenas data, fase e códigos do documento.

A v2 acrescenta duas consultas:

1. `/despesas/documentos/{codigo}` — abre o documento de despesa;
2. `/despesas/favorecidos-finais-por-documento` — procura o destinatário final.

## Substituir no repositório

- `scripts/emendas/coletar-diagnostico.mjs`
- `.github/workflows/emendas-diagnostico.yml`

## Executar

Actions → Diagnóstico Emendas Parlamentares v2 → Run workflow

Parâmetros recomendados:

- years: `2023,2024,2025,2026`
- amendment_sample: `160`
- detail_sample: `300`
- final_beneficiary_sample: `240`

A execução pode levar aproximadamente 25 a 60 minutos, conforme a velocidade e
os limites da API.

## Segurança dos dados

- não escreve no Supabase;
- não altera o site;
- não classifica irregularidade;
- mantém empenho, liquidação e pagamento separados;
- preserva os objetos brutos para auditoria.

## Correção adicional

A v1 agrupava uma emenda apenas pelo código e podia descartar linhas referentes
a funções, subfunções ou localidades diferentes. A v2 preserva essas linhas como
`allocations` e soma os valores dentro de cada código de emenda.
