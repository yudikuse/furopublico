# UX das ocorrências consolidadas

Instale este pacote depois de `furo-publico-alertas-consolidados-filtros`.

## O que muda

- visão padrão agrupada por fornecedor;
- valores em colunas próprias;
- valor relacionado, maior pagamento, sinais e documentos por fornecedor;
- expansão para conferir cada ocorrência;
- links para o documento original quando a Câmara fornece URL;
- busca por fornecedor, CNPJ, documento ou categoria;
- filtro por categoria e valor mínimo;
- opção “somente com documento”;
- ordenação por valor, maior pagamento, ocorrências, data ou nome;
- paginação de 25, 50, 100 ou todos;
- alternância entre “Por fornecedor” e “Sinais individuais”.

## Arquivos

Substitua:

- `components/admin-alert-occurrences.tsx`
- `app/alerts-consolidated.css`
- `scripts/camara/detectar-alertas.mjs`

## Banco e Vercel

Não exige SQL nem nova variável.

## GitHub Actions

Após o deploy, rode novamente:

`Monitoramento Câmara — 57ª Legislatura`

A nova execução é necessária para gravar URLs e registros completos dos documentos no alerta consolidado.

## Commit sugerido

`Melhorar UX e documentos dos alertas consolidados`
