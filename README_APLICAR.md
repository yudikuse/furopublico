# Furo Público — Verba de Gabinete v4

Esta versão conclui o módulo de verba de gabinete com:

- snapshot atual da equipe;
- associação por número do gabinete, nome direto ou aproximação segura;
- distinção entre “equipe vazia” e “snapshot não associado”;
- histórico de snapshots;
- entradas e saídas observadas entre snapshots;
- gasto acumulado;
- disponível acumulado;
- não utilizado acumulado;
- uso acumulado;
- média, mediana, maior e menor competência;
- faixas descritivas de utilização, variação, tendência e tamanho da equipe;
- filtros mensais, de equipe e de sinais;
- filtros da fila por verba acumulada, uso e situação do snapshot;
- ordenação por verba acumulada, uso e equipe.

## Arquivos a substituir

- `scripts/camara/sync-verba-gabinete.mjs`
- `scripts/camara/detectar-verba-gabinete.mjs`
- `scripts/camara/importar-verba-gabinete.mjs`
- `components/admin-office-budget.tsx`
- `components/admin-parliamentary-modules.tsx`
- `components/admin-parliamentary-queue.tsx`
- `app/office-budget.css`
- `.github/workflows/verba-gabinete.yml`

Nenhum SQL é necessário. As informações continuam armazenadas dentro de
`evidence.officeBudget`, preservando CEAP, rede e notas editoriais.

## Ordem de execução

Depois do commit e do deploy:

1. Execute `current`.
   - Atualiza 2025 e 2026.
   - Registra o número do gabinete encontrado na página individual.
   - Baixa e associa o snapshot funcional.

2. Confira no log:

```text
Snapshot AAAA-MM-DD: ... secretário(s) detectado(s), ... associado(s).
Associações por método: ...
Secretários associados: .../...
```

3. Atualize o Furo Público com `Ctrl + F5`.

4. Depois execute `snapshot` em outro dia para formar a primeira comparação
   entre duas datas. Entradas e saídas só podem ser calculadas quando existem
   pelo menos dois snapshots associados.

O workflow continuará:

- snapshot diário;
- atualização financeira mensal;
- backfill apenas quando for necessário reconstruir o histórico.

## Interpretação editorial

As classificações são descritivas:

- utilização alta não significa gasto irregular;
- equipe ampla não significa excesso;
- variação de equipe não comprova contratação indevida;
- snapshot não associado não significa ausência de funcionários;
- nomes e movimentos devem ser confirmados na fonte e em atos administrativos
  antes de publicação.

A fonte de funcionários representa somente a posição do dia anterior e não
reconstrói retroativamente o quadro funcional.
