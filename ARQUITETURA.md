# Arquitetura

## Princípio

A base interna pode ser ampla; o site público não. O público vê apenas investigações revisadas.

```text
Dados oficiais e pistas
        ↓
Camada bruta preservada
        ↓
Normalização e cruzamento
        ↓
Alertas privados
        ↓
Apuração humana
        ↓
Pedido de resposta
        ↓
Publicação com fontes e ressalvas
```

## Aplicação

- Next.js 16, App Router e TypeScript;
- React 19;
- CSS próprio, sem dependência de framework visual;
- Vercel para implantação;
- Supabase/PostgreSQL para investigações, alertas, pistas e auditoria.

## Modos de funcionamento

### Demonstração

Sem variáveis do Supabase, três casos fictícios mostram a experiência. Nada é salvo.

### Produção

Com Supabase configurado, as páginas públicas consultam `investigations` e o painel grava no banco usando a service role somente no servidor.

## Coleta

Os scripts gravam respostas em `data/raw`. Esses arquivos são ignorados pelo Git porque podem crescer muito e conter registros que ainda não passaram por revisão.

- `sync-deputados.mjs`: identifica pessoas que exerceram mandato na legislatura 57;
- `sync-despesas.mjs`: coleta despesas por ano e deputado;
- `detectar-alertas.mjs`: cria candidatos de apuração;
- `importar-alertas.mjs`: envia a fila ao Supabase.

## Próximos coletores

1. votações, votos, orientações e proposições afetadas;
2. emendas, empenhos, pagamentos e transferências;
3. PNCP, contratos, aditivos e fornecedores;
4. prestação de contas eleitoral;
5. CNPJ, quadro societário e sanções;
6. anúncios e declarações públicas, com preservação de URL e data.

## Segurança

- painel protegido no Proxy por Basic Auth;
- service role restrita ao servidor;
- RLS impede leitura pública de alertas e pistas;
- formulários são validados com Zod;
- canal de pistas possui campo antispam oculto;
- páginas administrativas são excluídas do `robots.txt`.

## Limitação do MVP

Basic Auth compartilha uma credencial entre editores e não identifica individualmente quem alterou um caso. A próxima etapa deve usar Supabase Auth, perfis editoriais e trilha de auditoria por usuário.
