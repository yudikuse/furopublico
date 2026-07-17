# Alertas organizados por parlamentar

## Mudança estrutural

A fila deixa de ter um alerta por fornecedor/regra e passa a ter:

- um registro por parlamentar;
- um período analisado;
- todos os tipos de sinal dentro da página do gabinete;
- categorias, fornecedores, sinais e documentos como desdobramentos.

## O que aparece na fila

- parlamentar;
- ano;
- prioridade;
- quantidade de tipos de sinal;
- quantidade de sinais técnicos;
- quantidade de fornecedores;
- valor relacionado;
- status editorial.

## Página do parlamentar

Abas:

- Visão geral;
- Fornecedores;
- Sinais;
- Documentos.

A visão geral mostra:

- tipos de sinal encontrados;
- categorias;
- fornecedores de maior valor;
- totais e prioridade.

## Dossiê

O botão de dossiê empresarial é removido no nível parlamentar.

O alerta já funciona como dossiê parlamentar da CEAP. O enriquecimento
empresarial será feito somente para fornecedores escolhidos durante a
investigação.

Dossiês antigos são preservados, mas recebem aviso de que podem representar
somente um fornecedor e não o gabinete inteiro.

## Arquivos

Substituir:

- `scripts/camara/detectar-alertas.mjs`
- `scripts/camara/importar-alertas.mjs`
- `components/admin-alerts-table.tsx`
- `components/admin-alert-form.tsx`
- `app/admin/alertas/page.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `app/layout.tsx`

Adicionar:

- `components/admin-parliamentary-alert.tsx`
- `app/parliamentary-alert.css`

## Ordem

1. Enviar os arquivos ao GitHub.
2. Commit sugerido:
   `Organizar alertas e apuração por parlamentar`
3. Aguardar o deploy da Vercel.
4. Rodar:
   `Monitoramento Câmara — 57ª Legislatura`

A execução remove somente alertas automáticos v2 pendentes e sem investigação.
Alertas convertidos, descartados ou vinculados a investigação são preservados.

## Banco

Não precisa executar SQL.
