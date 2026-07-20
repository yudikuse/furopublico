# Correção v4.1 — detecção da equipe parlamentar

## Problema identificado no log

O snapshot trouxe 15.523 linhas e os cabeçalhos corretos, mas o detector retornou
zero secretários. O arquivo atual usa também os campos `codGrupo` e `grupo`, e
os cargos podem aparecer como códigos como `SP01`, `SP02`, etc.

A versão anterior procurava principalmente o texto literal
`Secretário Parlamentar`, por isso não reconheceu essas linhas.

## Arquivo a substituir

`/scripts/camara/detectar-verba-gabinete.mjs`

## O que mudou

- reconhece `codGrupo = SP`;
- reconhece grupo `Secretariado Parlamentar`;
- reconhece cargos `SP01` a `SP99`;
- utiliza `grupo`, `codGrupo` e `uriLotacao` na associação;
- registra amostras completas quando uma linha não puder ser associada;
- preserva gastos acumulados, classificações, filtros e sinais existentes.

## Depois de substituir

1. Faça commit na branch `main`.
2. Aguarde o deploy.
3. Execute o workflow no modo `snapshot`.
4. Confira no log:
   - número de secretários detectados maior que zero;
   - número de associados maior que zero;
   - métodos de associação preenchidos.
5. Atualize o Furo Público com Ctrl + F5.

Não é necessário executar `backfill`.
