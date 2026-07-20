# Furo Público — rede automática de fornecedores CEAP

## Arquitetura aplicada

```text
CASO PARLAMENTAR CEAP
↓
FORNECEDORES E DOCUMENTOS ESTRUTURADOS
↓
REDE AUTOMÁTICA
↓
CADASTRO EMPRESARIAL E SÓCIOS
```

O formulário manual fica reservado somente para outras partes encontradas dentro dos documentos, como locadora, administradora, proprietário, beneficiário ou pessoa mencionada.

## Substituir

- `lib/entity-network.ts`
- `components/admin-entity-network.tsx`
- `app/entity-network.css`

## Adicionar ou substituir

- `app/api/admin/alerts/[id]/entity-network/route.ts`

## O que muda

- ao abrir um caso, a rede é recalculada automaticamente uma vez por sessão;
- todos os fornecedores de `evidence.suppliers` entram automaticamente;
- documentos de `evidence.documents` ficam vinculados aos fornecedores;
- CNPJs válidos são consultados automaticamente;
- razão social, situação, atividade, endereço e sócios aparecem sem cadastro manual;
- o histórico CEAP remove linhas exatamente repetidas antes de somar;
- o campo `supplier_name` resumido, como `1 fornecedor(es)`, deixa de virar entidade;
- o formulário manual passa a se chamar “Adicionar outra parte encontrada no documento”.

## Depois de atualizar

1. Aguarde o deploy da Vercel ficar verde.
2. Não precisa rodar o Action da Câmara para esta correção.
3. Abra novamente o caso de Glaustin da Fokus.
4. A seção da rede deve mostrar “Preparando a rede automaticamente...”.
5. A empresa `COMUNIK COMUNICAÇÃO E SERVIÇOS`, CNPJ `51.918.335/0001-24`, deve aparecer automaticamente com cadastro e sócios quando a fonte cadastral responder.

## Observação

Nenhum SQL é necessário.
