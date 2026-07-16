# Furo Público — 57ª Legislatura

Portal editorial para publicar **somente investigações, inconsistências e achados relevantes**, e não uma biblioteca de dados parlamentares.

O fato central precisa estar ligado à 57ª Legislatura da Câmara dos Deputados, de 01/02/2023 a 31/01/2027. Dados antigos podem ser usados apenas como histórico ou vínculo.

## O que já está pronto

- página inicial jornalística com investigação em destaque;
- arquivo de investigações com pesquisa e filtros;
- página de caso com números, envolvidos, fontes, metodologia, ressalvas, linha do tempo e direito de resposta;
- canal para envio de pistas;
- painel privado protegido por usuário e senha;
- formulário editorial para cadastrar investigações;
- fila privada de alertas;
- esquema do Supabase;
- coletor dos deputados da 57ª Legislatura;
- coletor de despesas da cota parlamentar;
- detector inicial de documentos repetidos, concentração por fornecedor e valores extremos;
- automação opcional pelo GitHub Actions.

## Importante: os três casos iniciais são fictícios

Eles aparecem com a marca **DEMONSTRAÇÃO**. Nenhum político, empresa ou recurso real é acusado. A demonstração serve para validar o desenho do portal antes da primeira investigação documentada.

## Publicar pelo GitHub Web

1. Extraia o ZIP.
2. Crie um repositório vazio no GitHub, sem gerar README.
3. Entre na pasta extraída. Selecione tudo que está no mesmo nível do `package.json`.
4. No repositório, use **Add file → Upload files** e arraste todos os arquivos e pastas.
5. Confirme que `package.json`, `app`, `components`, `lib`, `scripts` e `supabase` aparecem na raiz.
6. Faça o commit.

Não envie apenas o ZIP e não crie uma pasta extra envolvendo o projeto.

## Colocar na Vercel

1. Importe o repositório na Vercel.
2. O framework será reconhecido como Next.js.
3. Antes do deploy definitivo, cadastre:

```env
NEXT_PUBLIC_SITE_URL=https://seu-dominio.vercel.app
NEXT_PUBLIC_CONTACT_EMAIL=seuemail@dominio.com
ADMIN_USER=editor
ADMIN_PASSWORD=uma-senha-longa-e-unica
```

Sem Supabase, o site abre em modo demonstrativo. O canal de pistas e o salvamento do painel ficam bloqueados para não fingirem que dados foram armazenados.

## Conectar o Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Execute `supabase/schema.sql`.
4. Na Vercel, cadastre:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-anon
SUPABASE_SERVICE_ROLE_KEY=chave-service-role
```

A `SUPABASE_SERVICE_ROLE_KEY` é secreta. Nunca use `NEXT_PUBLIC_` no nome dela, nunca coloque a chave no GitHub e nunca a utilize em componente de navegador.

## Painel da redação

Acesse `/admin`. O navegador pedirá o usuário e a senha definidos em `ADMIN_USER` e `ADMIN_PASSWORD`.

Essa proteção por Basic Auth é adequada para o MVP de uma redação pequena. Antes de abrir acesso para várias pessoas, substitua por autenticação individual com permissões e registros de auditoria.

## Coletar a Câmara no computador

Requisitos: Node.js 20.9 ou superior.

```bash
npm install
npm run camara:deputados
```

Teste com até 20 deputados:

```bash
npm run camara:despesas -- --year=2026
npm run camara:alertas
```

Teste somente Goiás:

```bash
npm run camara:despesas -- --year=2026 --state=GO --all
npm run camara:alertas
```

Coleta nacional:

```bash
npm run camara:despesas -- --year=2026 --all
npm run camara:alertas
npm run camara:importar-alertas
```

Repita para 2023, 2024 e 2025 na primeira carga. O ano de 2023 inclui despesas anteriores a 1º de fevereiro; a triagem editorial deve aplicar a data exata da legislatura ao investigar um caso.

## O que os detectores significam

O sistema cria **pistas**, nunca acusações automáticas:

- documento repetido: pode ser duplicidade, parcela, reembolso ou correção;
- concentração por fornecedor: pode decorrer de serviço especializado ou contrato contínuo;
- valor extremo: pode ser legítimo e precisa ser comparado com descrição, período e documentação.

Um alerta só pode virar caso público após verificação das fontes, contexto, tentativa de resposta e revisão editorial.

## Comandos

```bash
npm run dev
npm run typecheck
npm run build
npm run camara:deputados
npm run camara:despesas -- --year=2026 --state=GO --all
npm run camara:alertas
npm run camara:importar-alertas
```

## Fontes técnicas iniciais

- API: `https://dadosabertos.camara.leg.br/api/v2`
- Documentação e arquivos: `https://dadosabertos.camara.leg.br/swagger/api.html?tab=api`
- Despesas: `/deputados/{id}/despesas`

Leia também `ARQUITETURA.md` e `METODOLOGIA_EDITORIAL.md`.
