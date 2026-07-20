# Correção — conexão da Verba de Gabinete

## Arquivo a substituir

Substitua no repositório:

`/scripts/camara/sync-verba-gabinete.mjs`

pelo arquivo presente neste pacote.

## O que foi corrigido

1. O diretório de deputados tenta, nesta ordem:
   - arquivo JSON oficial do Dados Abertos;
   - API REST oficial da Câmara;
   - página oficial "Quem são os deputados" da 57ª Legislatura;
   - cópia local existente, quando disponível.

2. As tentativas agora registram a causa interna da falha de rede.

3. Cada requisição possui tempo limite e repetição progressiva.

4. Durante o `backfill`, a indisponibilidade momentânea do snapshot diário
   de funcionários não interrompe a coleta histórica das folhas mensais.

5. A execução `snapshot` continua falhando corretamente quando o arquivo
   diário não pode ser obtido, evitando registrar um falso snapshot vazio.

## Depois de substituir

1. Faça commit na branch `main`.
2. Abra Actions.
3. Abra "Monitoramento Verba de Gabinete — 57ª Legislatura".
4. Execute novamente com `backfill`.

Não altere os segredos e não rode o workflow antigo da CEAP.
