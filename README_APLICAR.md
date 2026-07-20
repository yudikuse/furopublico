# Correção v2.1 — filtro de parlamentares

## Problema corrigido

A execução consultava 7.889 páginas por ano porque o arquivo geral de deputados
foi aceito como se todos os registros pertencessem à 57ª Legislatura.

## Correção

- a API oficial filtrada pela 57ª Legislatura passa a ser a primeira fonte;
- IDs repetidos são removidos;
- qualquer diretório com mais de 700 IDs é rejeitado;
- a coleta anual possui uma segunda trava de segurança.

## Aplicação

Substitua somente:

`scripts/camara/sync-verba-gabinete.mjs`

Depois execute um novo `backfill`.

A execução correta deverá mostrar aproximadamente algumas centenas de
parlamentares, nunca 7.889.
