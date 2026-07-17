# Razão social automática e sincronização da investigação

## O que muda

1. Para empresas, o campo `Nome ou razão social` deixa de ser obrigatório quando há um CNPJ válido.
2. O servidor consulta o CNPJ e grava a razão social retornada.
3. Se o cadastro não for localizado e o nome estiver vazio, o sistema pede o preenchimento manual.
4. Toda alteração da rede é sincronizada com a investigação vinculada:
   - entidades;
   - relações;
   - cadastros empresariais;
   - pagamentos CEAP;
   - documentos e fontes;
   - perguntas pendentes;
   - limites das fontes;
   - evento na linha do tempo.
5. Entradas editoriais que não foram geradas por essa rede são preservadas.
6. Recalcular a rede substitui somente o conteúdo anteriormente sincronizado pelo mesmo alerta.

## Arquivos

Substituir:

- `components/admin-entity-network.tsx`
- `lib/types.ts`
- `app/api/admin/alertas/[id]/entidades/route.ts`
- `app/api/admin/alertas/[id]/route.ts`

Adicionar:

- `lib/investigation-network-sync.ts`

## SQL e variáveis

Não é necessário executar SQL.
Não é necessário criar variável de ambiente.

## Depois do deploy

No alerta que já possui investigação vinculada, clique em:

`Recalcular rede`

Isso sincronizará a rede existente com a investigação já criada.

## Commit sugerido

`Automatizar razão social e sincronizar investigação`
