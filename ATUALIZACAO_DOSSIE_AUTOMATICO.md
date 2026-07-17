# Atualização — Dossiê automático de alertas

Esta atualização transforma cada alerta em uma página de cruzamento investigativo.

## O que o botão “Gerar dossiê automático” faz

- consulta as despesas do parlamentar entre 2023 e o ano do alerta;
- soma pagamentos feitos ao mesmo fornecedor;
- calcula a participação do fornecedor na categoria;
- lista pagamentos por ano e documentos do histórico;
- procura possíveis documentos repetidos;
- compara os maiores fornecedores da mesma categoria;
- consulta o CNPJ pela BrasilAPI;
- apresenta razão social, atividade, endereço, abertura e sócios retornados;
- gera sinais de prioridade e perguntas para a apuração;
- registra a execução no log editorial privado.

## Segurança editorial

O dossiê é privado e não publica nada automaticamente. Os resultados são pistas para revisão humana e contraditório.

## Instalação

Extraia o ZIP e envie todos os arquivos para a raiz do repositório, mantendo os caminhos. O GitHub mostrará os arquivos existentes como substituídos e os novos como adicionados.

Use o commit:

`Adicionar motor de enriquecimento investigativo`

A Vercel fará o deploy automaticamente. Não é necessário executar SQL nem criar novas variáveis de ambiente.

## Validação realizada

- `npm run typecheck`: aprovado
- `npm run build`: aprovado
- rota criada: `/api/admin/alertas/[id]/enriquecer`
- tela atualizada: `/admin/alertas/[id]`

## Observação

A consulta empresarial usa a BrasilAPI, uma fonte comunitária. Antes de publicação, confirme os dados cadastrais em fonte oficial e preserve os documentos originais da Câmara.
