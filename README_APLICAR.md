# Furo Público — diagnóstico de emendas v1

Esta etapa coleta dados nacionais de emendas parlamentares antes da reorganização
do site. Ela **não altera o Supabase e não muda nenhum caso**.

## Arquivos

Adicione:

- `scripts/emendas/coletar-diagnostico.mjs`
- `.github/workflows/emendas-diagnostico.yml`

## Segredo necessário

A API do Portal da Transparência exige uma chave.

1. Cadastre-se na página oficial da API do Portal da Transparência.
2. No GitHub, abra:
   `Settings → Secrets and variables → Actions`.
3. Crie:
   `PORTAL_TRANSPARENCIA_API_KEY`
4. Cole a chave recebida.

Não envie a chave no chat.

Os segredos do Supabase já usados pelo projeto são opcionais para a coleta, mas
permitem comparar os autores das emendas com os casos parlamentares existentes.

## Execução

`Actions → Diagnóstico Emendas Parlamentares → Run workflow`

Parâmetros iniciais:

- years: `2023,2024,2025,2026`
- document_sample: `240`

## Saída

Ao final, baixe o artefato `diagnostico-emendas-...`.

Ele contém:

- JSON completo do diagnóstico;
- relatório Markdown;
- emendas normalizadas;
- amostra de documentos de despesa;
- beneficiários encontrados;
- cobertura de cada campo;
- autores correspondentes e não correspondentes aos casos atuais.

## O que será decidido com o resultado

- beneficiário formal versus favorecido do documento;
- presença de CPF/CNPJ;
- convênios e instrumentos;
- fases empenhada, liquidada e paga;
- possibilidade de chegar ao contratado final;
- cobertura nacional real dos casos existentes;
- estrutura definitiva da aba `Quem recebeu`.
