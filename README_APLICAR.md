# Furo Público — Verba de Gabinete v2

## Motivo da correção

A versão anterior baixava relatórios gerais de remuneração e tentava identificar
o parlamentar pela lotação. A execução podia terminar sem erro, mas gerar zero
casos quando a lotação não era associada ao deputado.

A versão v2 usa diretamente, para cada deputado e ano:

https://www.camara.leg.br/deputados/{ID}/verba-gabinete?ano={ANO}

Essa página oficial fornece o valor disponível e o valor gasto em cada mês.

## Arquivos a substituir

- scripts/camara/sync-verba-gabinete.mjs
- scripts/camara/detectar-verba-gabinete.mjs
- scripts/camara/importar-verba-gabinete.mjs
- components/admin-office-budget.tsx
- components/admin-parliamentary-modules.tsx

Os demais arquivos não precisam ser alterados.

## Depois de enviar ao GitHub

1. Faça commit na branch main.
2. Aguarde o deploy da Vercel.
3. Abra Actions.
4. Abra “Monitoramento Verba de Gabinete — 57ª Legislatura”.
5. Execute com o modo `backfill`.
6. Confira no log:
   - Casos de verba de gabinete: valor maior que zero
   - Competências mensais aproveitadas: valor maior que zero
   - Casos atualizados: valor maior que zero
7. Abra o Furo Público e pressione Ctrl + F5.

## Mudanças na tela

A aba passa a mostrar:

- valor disponível por mês;
- valor gasto por mês;
- percentual utilizado;
- variação mensal;
- fonte oficial individual;
- equipe atual, quando o snapshot funcional puder ser associado.

Os valores permanecem separados da CEAP.
