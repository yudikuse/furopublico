# Furo Público — Correção estrutural CEAP v5

## O problema corrigido

A versão anterior misturava três coisas diferentes:

1. o documento fiscal;
2. os lançamentos CEAP associados ao documento;
3. o sinal técnico calculado sobre esses dados.

Isso fazia uma concentração agregada abrir um único PDF e fazia mais de uma linha do mesmo documento parecer uma duplicidade documental.

## Estrutura correta

```text
REGISTRO CEAP
↓
DOCUMENTO OFICIAL
↓
SINAL TÉCNICO
↓
CASO PARLAMENTAR
↓
INVESTIGAÇÃO
```

### Registro CEAP

É um lançamento financeiro da Câmara. Pode representar parcela, lote, ressarcimento, glosa ou outro registro associado ao mesmo comprovante.

### Documento oficial

É agrupado por `ideDocumento` ou `codDocumento`.

Um documento pode ter vários registros CEAP. Isso, sozinho, não é duplicidade.

### Sinal técnico

- concentração;
- valor extremo;
- possível duplicidade documental somente quando existem identificadores oficiais de documento diferentes com fornecedor, número, data e valor de face iguais.

## Arquivos deste pacote

### Adicionar

- `scripts/camara/detectar-alertas-v5.mjs`
- `scripts/camara/importar-alertas-v5.mjs`
- `components/admin-parliamentary-case-v5.tsx`

### Substituir

- `components/admin-parliamentary-queue.tsx`
- `app/admin/alertas/page.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `package.json`

## O que muda na tela

### Sinais

Nenhum sinal agregado abre PDF diretamente.

A ação passa a ser:

```text
Ver documentos →
```

### Documentos

Cada documento mostra separadamente:

- número;
- identificador oficial;
- valor de face do PDF;
- valor líquido CEAP;
- quantidade de lançamentos CEAP;
- sinais relacionados;
- link do PDF.

### Concentração

Exemplo correto:

```text
Concentração: R$ 125.000
10 documentos
Ver documentos →
```

Dentro da lista podem existir 10 documentos de R$ 12.500 cada. O total agregado nunca abre somente o primeiro PDF.

## Ordem para atualizar

1. Envie todos os arquivos deste pacote.
2. Não rode o Action no meio da atualização.
3. Aguarde o deploy da Vercel concluir sem erro.
4. Abra uma página de caso antes do Action. A tela já deve impedir que concentração abra PDF diretamente.
5. Rode o GitHub Action `Monitoramento Câmara — 57ª Legislatura`.
6. Confira o log.

## Log esperado

```text
Linhas recebidas: ...
Registros CEAP normalizados: ...
Registros CEAP únicos: ...
Repetições exatas removidas: ...
Documentos oficiais/fallback agrupados: ...
Sinais técnicos encontrados: ...
Parlamentares com sinais: ...
Arquivo gerado: ...
Casos automáticos obsoletos removidos: ...
Importação v5 concluída...
```

## Validação realizada

Foi executado um teste sintético com:

- 6 documentos da Gráfica somando R$ 213.580;
- 10 documentos da locadora somando R$ 125.000;
- uma linha exatamente repetida;
- um documento com mais de um lançamento;
- dois documentos oficiais distintos com os mesmos dados fiscais.

Resultado:

- a linha exata repetida foi removida;
- o documento com múltiplos lançamentos permaneceu um único documento;
- não houve falso sinal de duplicidade para a Gráfica;
- as concentrações preservaram os totais de R$ 213.580 e R$ 125.000;
- cada concentração ficou vinculada à quantidade correta de documentos;
- a duplicidade só foi sinalizada para dois identificadores oficiais distintos.

## Compatibilidade editorial

O importador:

- mantém a mesma chave externa do caso parlamentar;
- preserva enriquecimento, interpretação manual e rede de entidades;
- não altera casos convertidos, descartados ou ligados a investigação;
- remove casos automáticos pendentes que existiam apenas por falso positivo da versão anterior.
