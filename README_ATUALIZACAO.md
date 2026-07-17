# Módulo de apuração de alertas

## Arquivos a substituir

- `lib/data.ts`
- `lib/types.ts`
- `app/admin/alertas/page.tsx`

## Arquivos novos

- `components/admin-alert-form.tsx`
- `app/admin/alertas/[id]/page.tsx`
- `app/api/admin/alertas/[id]/route.ts`

## CSS

Abra `app/globals.css` e cole no final todo o conteúdo de:

- `app/globals.css.append.txt`

Não substitua o CSS inteiro. Apenas acrescente o bloco ao final.

## Depois do commit

A Vercel fará o deploy automaticamente.

Abra:

`https://furopublico.vercel.app/admin/alertas`

Clique no título de qualquer alerta para acessar a apuração individual.
