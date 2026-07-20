# Verba de Gabinete v3 — transporte pela Vercel

## Por que esta versão existe

Os logs comprovaram `UND_ERR_CONNECT_TIMEOUT` entre os runners hospedados do
GitHub Actions e todos os domínios oficiais da Câmara. O código não recebeu
resposta HTTP: a conexão com o IP da Câmara expirou.

A v3 mantém o GitHub como orquestrador, mas, quando o acesso direto falha,
encaminha a consulta por uma rota protegida na Vercel.

A fonte registrada continua sendo a URL oficial da Câmara.

## Arquivos

Substitua:

- `scripts/camara/sync-verba-gabinete.mjs`
- `.github/workflows/verba-gabinete.yml`

Adicione:

- `app/api/admin/camara-fetch/route.ts`

## Configuração obrigatória

Crie uma sequência longa e aleatória, sem espaços. Use exatamente o mesmo valor
nos dois locais abaixo. Não envie esse valor no chat.

### Vercel

Settings → Environment Variables

- Nome: `OFFICE_BUDGET_SYNC_TOKEN`
- Valor: sua sequência aleatória
- Ambientes: Production e Preview
- Sensitive: ativado

Faça um novo deploy depois de salvar.

### GitHub

Settings → Secrets and variables → Actions → New repository secret

1. `OFFICE_BUDGET_SYNC_TOKEN`
   - mesmo valor salvo na Vercel

2. `CAMARA_PROXY_URL`
   - `https://furopublico.vercel.app/api/admin/camara-fetch`

## Execução

Depois do deploy e dos segredos:

Actions → Monitoramento Verba de Gabinete → Run workflow → `backfill`

O log correto começa usando os parlamentares que já estão nos casos do
Furo Público, evitando baixar novamente o diretório geral.

Procure:

- `Parlamentares selecionados para a verba de gabinete: ...`
- `Acesso direto indisponível; usando transporte Vercel...`
- `Ano 2026: ... parlamentar(es) com valores mensais`
- `Casos atualizados: ...`

## Segurança

A rota:

- exige token;
- aceita somente domínios oficiais da Câmara;
- não funciona como proxy genérico;
- não armazena o token;
- não muda a URL de origem gravada nos documentos.
