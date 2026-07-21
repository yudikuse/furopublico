# Furo Público — Verba de Gabinete v5

## Objetivo

Acrescenta valores individuais, ordenação decrescente e descrição das atribuições
da equipe, sem confundir nível remuneratório com função exercida.

## Arquivos a substituir

- `components/admin-office-budget.tsx`
- `scripts/camara/detectar-verba-gabinete.mjs`
- `app/office-budget.css`

## Mudanças

- ordenação padrão: maior valor mensal;
- ranking #1, #2, #3...;
- valor mensal de tabela por integrante;
- identificação de nível SP e GRG;
- filtro por faixa de remuneração;
- filtro por atribuição formal;
- resumo da folha fixa estimada;
- coluna de atribuição formal e descrição;
- aviso de que SP25C é nível remuneratório, não cargo de chefia;
- troca de “Nomeação informada” por “Início do registro atual”;
- valores incorporados também aos dados brutos do módulo.

## Fonte salarial

Tabela oficial da Câmara vigente desde 18/02/2026.

O cálculo considera:
- vencimento do nível SP;
- GRG quando o código termina em `C`;
- ausência de GRG quando termina em `S`.

Não inclui auxílio-alimentação nem descontos.

## Depois do commit

Execute apenas:

`Actions → Monitoramento Verba de Gabinete → snapshot`

Não é necessário executar `backfill`.
