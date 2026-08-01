# Relatório de implementação — Financeiro Efí central

Data: 1º de agosto de 2026

## Escopo solicitado

- Manter o projeto no Lovable para continuar editando.
- Usar uma única conta/chave PIX Efí para todas as lojas.
- Identificar automaticamente a loja de cada pagamento.
- Mostrar saldo interno individual ao administrador da loja.
- Permitir solicitação de saque.
- Permitir repasse automático pela plataforma.

## Entregue

- Seção **Financeiro** no painel administrativo.
- Conta financeira interna por loja.
- Saldo disponível, a liberar, reservado e repassado.
- Extrato imutável baseado em ledger.
- Cadastro protegido da chave PIX de saque da loja.
- Solicitação de saque parcial ou total.
- Repasse automático diário/semanal.
- Regras globais da plataforma: taxa, prazo, mínimo e frequência.
- PIX central Efí com txid próprio por pedido.
- QR Code e Copia e Cola da cobrança Efí.
- Confirmação automática por webhook.
- Webhook compatível com Supabase por `x-skip-mtls-checking: true` e segredo HMAC na URL.
- Identificação da loja pelo `store_id` do pedido.
- Crédito idempotente: webhook repetido não duplica saldo.
- Saque idempotente: a mesma solicitação reutiliza o mesmo `idEnvio`.
- Tratamento seguro de erro 5xx/conexão durante repasse.
- Checkout seguro recalculado dentro do Supabase.
- Cancelamento sem excluir pedidos PIX, permitindo conciliar pagamento tardio.
- Área exclusiva para administrador da plataforma.
- Documentação de configuração e publicação.

## Arquivos principais alterados/adicionados

- `src/App.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/components/PixPaymentModal.tsx`
- `src/lib/couponValidation.ts`
- `src/pages/Checkout.tsx`
- `src/pages/admin/AdminFinance.tsx`
- `src/pages/admin/AdminStoreSettings.tsx`
- `supabase/config.toml`
- `supabase/functions/pix-efi/index.ts`
- `supabase/functions/wallet-efi/index.ts`
- `supabase/migrations/20260801220000_financial_wallet_central_pix.sql`
- `supabase/migrations/20260801223000_secure_customer_checkout.sql`
- `docs/FINANCEIRO_EFI_CENTRAL.md`

## Validações executadas

- 212 arquivos TypeScript/TSX analisados sintaticamente: nenhum erro de sintaxe.
- Verificação dos imports e rotas principais do módulo.
- Verificação das variáveis sensíveis: nenhum segredo real foi adicionado ao código.
- `.env`, certificados e chaves privadas foram excluídos do pacote final.
- Conferência manual das duas migrations novas e das assinaturas RPC.
- Conferência de idempotência para recebimentos e repasses.

## Validação não executada

O build completo não foi possível neste ambiente porque o pacote privado `@lovable.dev/cloud-auth-js` não está disponível no registro npm utilizado. O projeto deve continuar resolvendo essa dependência dentro do Lovable.

Também não foi possível realizar uma transação real/homologada na conta Efí do usuário, pois não foram fornecidas credenciais, certificado e acesso à conta. Antes de produção, é obrigatório testar as Edge Functions com a aplicação Efí e o certificado reais.

## Configuração de ambiente Efí

As duas Edge Functions aceitam `EFI_ENVIRONMENT=homologation` ou `production`. Também existe a substituição opcional `EFI_API_HOST`, permitindo alternar o endpoint sem editar o código.

## Pendências para produção

- Aplicar as migrations no Supabase.
- Configurar os segredos Efí.
- Ativar os escopos necessários.
- Implantar `pix-efi` e `wallet-efi`.
- Registrar o webhook pelo painel Financeiro.
- Solicitar aumento do limite de envio de PIX na Efí.
- Testar homologação com duas lojas.
- Validar o modelo de recebimento central e repasse com a Efí, contador e jurídico.
- Criar termos de uso, contrato de repasse e política de devoluções.
- Implementar fluxo administrativo de devolução ao cliente antes de permitir reembolsos automáticos.

## Observação jurídica

A interface utiliza “saldo a receber” e “repasse”, e não anuncia uma conta bancária. O modelo centralizado ainda exige validação profissional antes de movimentar recursos de terceiros.
