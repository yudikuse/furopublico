# Furo Público — importação estruturada de emendas

Esta versão transforma o diagnóstico v2 em um módulo real do caso parlamentar.

## O que foi acrescentado

- tabelas separadas para emendas, documentos, beneficiários e fluxos;
- ligação da emenda ao caso somente por **nome parlamentar + ano exatamente iguais**;
- importação em lotes para respeitar os limites da API;
- distinção entre favorecido do documento, intermediário financeiro e beneficiário final;
- tela de emendas com valores empenhado, liquidado e pago separados;
- visão `Quem recebeu` dentro do módulo de emendas;
- período, quantidade de documentos e total relacionado por beneficiário.

## 1. Execute a migration no Supabase

Abra `SQL Editor → New query` e execute todo o arquivo:

```text
supabase/migrations/20260727_emendas_parlamentares.sql
```

A migration cria seis tabelas privadas. Não há política pública de leitura; o
painel usa apenas a service role no servidor.

## 2. Envie os arquivos ao GitHub

Arquivos novos:

```text
.github/workflows/emendas-importacao.yml
app/amendments.css
components/admin-amendments.tsx
scripts/emendas/importar-emendas.mjs
supabase/migrations/20260727_emendas_parlamentares.sql
README_EMENDAS_IMPORTACAO.md
```

Arquivos substituídos:

```text
app/admin/alertas/[id]/page.tsx
components/admin-parliamentary-modules.tsx
lib/data.ts
lib/types.ts
package.json
supabase/schema.sql
```

## 3. Primeira execução: catálogo

No GitHub:

```text
Actions → Importação Emendas Parlamentares → Run workflow
```

Use:

```text
mode: catalog
years: 2023,2024,2025,2026
max_amendments: 20
max_documents_per_amendment: 120
```

O modo `catalog`:

- coleta o catálogo nacional;
- preserva todas as alocações da mesma emenda;
- importa apenas emendas que correspondem a um caso existente;
- usa nome normalizado + ano exatamente iguais;
- não abre documentos ainda.

Após o catálogo, o botão Emendas já poderá aparecer nos casos correspondentes,
mas os beneficiários ainda estarão vazios.

## 4. Segunda execução: documentos

Rode novamente com:

```text
mode: documents
years: 2023,2024,2025,2026
max_amendments: 20
max_documents_per_amendment: 120
```

Cada execução continua de onde a anterior parou. Emendas com mais de 120
documentos ficam como `partial` e retornam em um lote posterior.

O agendamento diário também executa `documents` para continuar o processamento.

## 5. Conferir o progresso

No SQL Editor:

```sql
select
  documents_status,
  count(*) as emendas,
  sum(document_count) as documentos,
  sum(beneficiary_count) as beneficiarios_relacionados
from public.parliamentary_amendments
group by documents_status
order by documents_status;
```

## Regras de leitura

- empenhado, liquidado, pago e restos pagos nunca são somados como fases independentes;
- quando há beneficiário final, o intermediário financeiro não entra no total de `Quem recebeu`;
- a ausência de beneficiário final em um documento não comprova irregularidade;
- o sistema organiza fontes e valores, mas não cria investigação automaticamente.

## Validação realizada

- `node --check` do importador: aprovado;
- sintaxe dos arquivos TypeScript/TSX: aprovada;
- verificação de tipos dos arquivos alterados com declarações de teste: aprovada;
- YAML dos workflows: aprovado.

O `next build` completo não foi executado neste ambiente porque a instalação das
dependências não ficou disponível. O build definitivo será confirmado pela Vercel
após o commit.
