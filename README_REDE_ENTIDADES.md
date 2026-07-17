# Rede de entidades e relações

## Objetivo

Esta atualização não tenta provar parentesco ou favorecimento automaticamente.

Ela permite registrar, com fonte:

- locador;
- proprietário;
- administradora;
- beneficiário;
- empresa;
- pessoa;
- imóvel;
- órgão.

Depois o sistema:

- consulta cada CNPJ separadamente;
- usa fontes cadastrais alternativas quando a primeira falha;
- exibe sócios e administradores;
- procura pagamentos da CEAP do mesmo parlamentar para cada CNPJ;
- identifica sócio compartilhado;
- identifica endereço cadastral coincidente;
- separa fato documentado, cadastro e coincidência;
- lista fontes e cruzamentos ainda pendentes.

## Instalação

Envie todo o conteúdo desta pasta para a raiz do repositório, mantendo os caminhos.

Arquivos substituídos:

- `lib/cnpj-api.ts`
- `lib/types.ts`
- `lib/data.ts`
- `app/admin/alertas/[id]/page.tsx`
- `app/layout.tsx`

Arquivos novos:

- `lib/entity-network.ts`
- `components/admin-entity-network.tsx`
- `app/api/admin/alertas/[id]/entidades/route.ts`
- `app/entity-network.css`

Não é necessário executar SQL.

## Teste no caso da Elba

Na tela do alerta, em **Adicionar parte encontrada no documento**, registre:

- Nome: `Elba Consultoria Empresarial Ltda.`
- Tipo: `Empresa`
- CNPJ: `19.404.399/0001-02`
- Papel: `Locadora do imóvel`
- Fonte: o PDF da Câmara
- Fundamento: transcreva apenas o trecho visível no documento que identifica a empresa como locadora
- Grau: `Documentado na fonte indicada`

Depois clique em **Adicionar e cruzar**.

O sistema não tratará a Elba como beneficiária final sem documentação. Ele mostrará o cadastro, sócios, pagamentos da Câmara localizados para o mesmo parlamentar, coincidências e lacunas de fonte.
