# Alertas consolidados + filtros no cabeçalho

## Resultado

- um alerta por parlamentar, regra, categoria e ano;
- ocorrências individuais preservadas no detalhe;
- filtros por busca, parlamentar, tipo de sinal, gravidade, status e dossiê;
- limpeza automática apenas dos alertas legados ainda não trabalhados;
- alertas convertidos, descartados ou ligados a investigação são preservados;
- dossiê empresarial fica desabilitado quando um alerta consolidado reúne vários fornecedores.

## Arquivos novos

- `components/admin-alerts-table.tsx`
- `components/admin-alert-occurrences.tsx`
- `app/alerts-consolidated.css`

## Arquivos substituídos

- `scripts/camara/detectar-alertas.mjs`
- `scripts/camara/importar-alertas.mjs`
- `app/admin/alertas/page.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `components/admin-alert-form.tsx`
- `app/layout.tsx`

## Instalação

Envie o conteúdo para a raiz do repositório mantendo as pastas. Não há SQL.

Depois do deploy, execute manualmente o workflow **Monitoramento Câmara — 57ª Legislatura** para recriar e importar a fila consolidada.

## Commit sugerido

`Consolidar alertas e adicionar filtros na fila`
