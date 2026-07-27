# Leitura do primeiro diagnóstico

## Resultado confirmado

- 24.681 linhas brutas;
- 24.626 códigos únicos;
- 967 autores;
- 3.403 referências de documentos;
- nenhum erro nas 240 emendas consultadas.

## Por que o favorecido ficou zerado

Os 3.403 registros possuem apenas:

- `id`;
- `data`;
- `fase`;
- `codigoDocumento`;
- `codigoDocumentoResumido`;
- `especieTipo`;
- `tipoEmenda`.

Logo, o normalizador não deixou de reconhecer um campo existente. O favorecido
não veio nesse endpoint.

## Distribuição da amostra

- 2.989 empenhos;
- 257 liquidações;
- 157 pagamentos.

A primeira amostra ficou muito concentrada em empenhos e emendas de bancada,
pois a seleção priorizava os maiores valores. A v2 estratifica a amostra e
prioriza pagamentos e liquidações na abertura detalhada.

## Próximo resultado esperado

A v2 deverá revelar, conforme a cobertura real da API:

- favorecido do documento;
- CPF, CNPJ ou código SIAFI;
- tipo de favorecido;
- UF e município;
- valor do documento;
- existência de convênio;
- favorecido final de liquidações e pagamentos.
