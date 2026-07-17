# Workspace interno de investigações

## O que esta atualização faz

- cria `/admin/investigacoes`;
- cria uma página interna clicável para cada investigação;
- reúne entidades, relações, pagamentos, fontes, perguntas, limites,
  linha do tempo e manifestações;
- permite editar título, resumo, achado provisório, evidência, valor,
  metodologia, ressalvas e tags;
- permite adicionar fonte, evento da linha do tempo e manifestação;
- mantém a publicação bloqueada nesta tela;
- esconde o botão de conversão depois que o alerta já virou investigação;
- mostra o botão `Abrir investigação` no alerta convertido;
- troca a mensagem cadastral antiga por uma orientação para consultar a
  Rede de Entidades;
- adiciona as investigações em andamento ao painel principal.

## Arquivos que substituem os existentes

- `lib/data.ts`
- `lib/types.ts`
- `components/admin-alert-form.tsx`
- `components/admin-enrichment-panel.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `app/admin/page.tsx`
- `app/layout.tsx`

## Arquivos novos

- `components/admin-investigation-editor.tsx`
- `app/api/admin/investigacoes/[id]/route.ts`
- `app/admin/investigacoes/page.tsx`
- `app/admin/investigacoes/[id]/page.tsx`
- `app/investigation-workspace.css`

## Banco de dados

Não é necessário executar SQL.

## Variáveis

Não é necessário adicionar variável na Vercel.

## Depois do deploy

Abra:

`https://furopublico.vercel.app/admin`

A investigação da Magda deverá aparecer em **Investigações em andamento**.

Também pode ser aberta diretamente pelo botão **Abrir investigação** dentro
do alerta convertido.

## Commit sugerido

`Adicionar workspace interno de investigação`
