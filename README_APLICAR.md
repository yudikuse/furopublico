# Furo Público — Módulo Verba de Gabinete

## Arquitetura

O módulo mantém as entidades separadas:

```text
RELATÓRIO MENSAL / SNAPSHOT FUNCIONAL
↓
REGISTRO DE REMUNERAÇÃO / LOTAÇÃO
↓
SINAL TÉCNICO
↓
CASO DO PARLAMENTAR
↓
INVESTIGAÇÃO, somente por decisão editorial
```

Os valores da folha publicada nunca são somados à CEAP.

## O que entra no sistema

- relatórios mensais de remuneração publicados pela Câmara;
- snapshot diário dos funcionários em atividade;
- resumo mensal por gabinete;
- histórico de presença por competência;
- equipe do snapshot mais recente;
- documentos de origem;
- sinais técnicos de variação, concentração e inconsistência de lotação.

## Sinais iniciais

- variação relevante da folha publicada;
- variação relevante da equipe entre competências consecutivas;
- concentração da remuneração publicada nos três maiores valores;
- mesmo número de ponto associado a mais de um gabinete na mesma competência.

Nenhum desses sinais comprova funcionário fantasma, nepotismo, acumulação indevida ou irregularidade.

## Arquivos novos

- `scripts/camara/sync-verba-gabinete.mjs`
- `scripts/camara/detectar-verba-gabinete.mjs`
- `scripts/camara/importar-verba-gabinete.mjs`
- `components/admin-office-budget.tsx`
- `components/admin-parliamentary-modules.tsx`
- `app/office-budget.css`
- `.github/workflows/verba-gabinete.yml`

## Arquivos substituídos

- `components/admin-parliamentary-queue.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `package.json`

## Banco de dados

Não exige SQL novo.

Os dados do módulo são gravados em `alerts.evidence.officeBudget`, dentro do mesmo caso parlamentar. O importador usa a mesma chave externa do módulo CEAP para evitar a criação de dois casos para o mesmo parlamentar e ano.

## Aplicação

1. Envie todos os arquivos para os caminhos correspondentes.
2. Aguarde o deploy da Vercel ficar verde.
3. No GitHub, abra **Actions**.
4. Escolha **Monitoramento Verba de Gabinete — 57ª Legislatura**.
5. Clique em **Run workflow**.
6. Na primeira execução, selecione `backfill`.
7. Depois da conclusão, atualize `/admin/alertas`.

## Modos do workflow

- `backfill`: baixa 2023, 2024, 2025 e 2026;
- `current`: atualiza o ano atual e o anterior;
- `snapshot`: atualiza somente a posição funcional mais recente.

O workflow também possui agendas automáticas:

- snapshot funcional diário;
- atualização mensal do ano atual e anterior.

## O que muda na fila

A fila passa a mostrar separadamente:

- módulos disponíveis;
- sinais técnicos combinados por contagem;
- valor CEAP;
- folha publicada mais recente;
- quantidade de integrantes da última competência.

Os valores financeiros não são combinados.

## Limitações explícitas

- a folha mensal pode conter férias, gratificação natalina e parcelas eventuais;
- o snapshot de funcionários representa a posição do dia anterior;
- ausência em uma competência não comprova exoneração em data específica;
- presença em mais de uma lotação exige conferência da fonte;
- nomes, cargos e lotações não autorizam inferência de parentesco ou favorecimento.
