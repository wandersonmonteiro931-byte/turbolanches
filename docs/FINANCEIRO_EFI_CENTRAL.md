# Financeiro com PIX Efí central e saldo por loja

## Objetivo

Esta implementação mantém um único recebedor PIX na conta Efí da plataforma. Cada cobrança contém o pedido e a loja de origem. Quando a Efí confirma o pagamento, o sistema registra uma movimentação única no saldo interno da loja correta.

O saldo mostrado no painel é **saldo a receber da plataforma**. Ele não é conta bancária, conta de pagamento, carteira cripto ou depósito do público.

## Fluxo implementado

```text
Cliente fecha o pedido
        ↓
Supabase recalcula produtos, adicionais, cupom, frete e total
        ↓
Edge Function gera cobrança PIX na conta Efí central
        ↓
Cliente paga o QR Code / Copia e Cola
        ↓
Webhook Efí localiza o pedido pelo txid
        ↓
Pedido é marcado como pago uma única vez
        ↓
Ledger credita o saldo da loja, descontando a taxa da plataforma
        ↓
Valor fica “a liberar” pelo prazo configurado
        ↓
Loja solicita saque ou entra no repasse automático
        ↓
Edge Function envia PIX pela Efí com idEnvio idempotente
        ↓
Webhook/consulta confirma o repasse ou devolve o saldo em caso de falha definitiva
```

## Componentes adicionados

### Frontend

- `src/pages/admin/AdminFinance.tsx`
- Rota: `/admin/financeiro`
- Item Financeiro no menu administrativo
- Configuração de chave PIX para saque
- Saldo disponível, a liberar, reservado e já repassado
- Extrato por loja
- Solicitação de saque
- Repasse automático diário ou semanal
- Gestão exclusiva da plataforma:
  - taxa percentual
  - prazo de liberação
  - saque mínimo
  - frequência global
  - descrição do repasse
  - registro e consulta do webhook Efí
  - consulta de saques de todas as lojas

### Banco de dados

Migrations:

- `supabase/migrations/20260801220000_financial_wallet_central_pix.sql`
- `supabase/migrations/20260801223000_secure_customer_checkout.sql`

Principais estruturas:

- `platform_admins`
- `platform_finance_settings`
- `store_financial_accounts`
- `store_wallet_transactions`
- `wallet_withdrawal_requests`
- `efi_payment_events`
- `store_wallet_summary`

RPCs principais:

- `create_secure_customer_order`
- `cancel_unpaid_pix_order`
- `confirm_pix_order_and_credit_wallet`
- `update_store_payout_settings`
- `request_store_withdrawal`
- `create_automatic_withdrawal`
- `mark_withdrawal_processing`
- `mark_withdrawal_paid`
- `mark_withdrawal_failed`

### Edge Functions

- `supabase/functions/pix-efi/index.ts`
  - cria ou reaproveita cobrança com txid determinístico
  - lê o total exclusivamente do banco
  - gera QR Code e PIX Copia e Cola
  - consulta a cobrança
  - recebe webhook de pagamentos e repasses
  - registra/consulta webhook na Efí

- `supabase/functions/wallet-efi/index.ts`
  - solicita envio de PIX para a chave da loja
  - consulta envio por `idEnvio`
  - mantém saldo reservado em respostas incertas
  - processa repasses automáticos

## Segurança implementada

- O navegador não define o valor cobrado.
- Produtos, adicionais, cupom, entrega e total são recalculados no banco.
- Cada pedido possui um txid determinístico próprio.
- Webhook protegido por segredo HMAC na URL.
- Eventos PIX e lançamentos do ledger possuem chaves de idempotência únicas.
- Um evento PIX não pode ser associado a pedidos diferentes.
- Repetições do webhook não duplicam saldo.
- Saques usam sempre o mesmo `idEnvio` em novas tentativas.
- Respostas 5xx ou erros de conexão não liberam o saldo automaticamente, pois o PIX pode ter sido processado.
- Administradores veem somente a conta, o extrato e os saques da própria loja.
- Somente o administrador da plataforma altera taxa, prazo e regras globais.
- Loja suspensa não pode reativar a própria conta financeira.
- Credenciais Efí, certificado e chave recebedora central não ficam no navegador.

## 1. Variáveis do frontend

No Lovable, mantenha as variáveis atuais do Supabase. Para Cloudflare Pages, cadastre:

```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA_ANON
VITE_SUPABASE_PROJECT_ID=SEU_PROJECT_REF
```

Somente variáveis com prefixo `VITE_` chegam ao navegador. Nunca coloque `Client Secret`, certificado ou `service_role` com esse prefixo.

## 2. Segredos das Edge Functions

Configure no Supabase:

```bash
npx supabase secrets set \
  EFI_ENVIRONMENT="homologation" \
  EFI_CLIENT_ID="SEU_CLIENT_ID_DE_HOMOLOGACAO" \
  EFI_CLIENT_SECRET="SEU_CLIENT_SECRET_DE_HOMOLOGACAO" \
  EFI_CERTIFICATE_BASE64="CERTIFICADO_P12_DE_HOMOLOGACAO_EM_BASE64" \
  EFI_PIX_KEY="CHAVE_PIX_CENTRAL_DA_PLATAFORMA" \
  EFI_WEBHOOK_SECRET="SEGREDO_LONGO_E_ALEATORIO" \
  WALLET_CRON_SECRET="OUTRO_SEGREDO_LONGO_E_ALEATORIO"
```

O Supabase já disponibiliza normalmente `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` às funções. Confirme isso no painel antes do deploy.

Durante os testes, mantenha `EFI_ENVIRONMENT=homologation`. Depois de concluir toda a homologação, substitua as credenciais e o certificado pelos de produção e altere para `EFI_ENVIRONMENT=production`. Opcionalmente, `EFI_API_HOST` pode sobrescrever o host padrão sem modificar o código. Não misture certificado ou credenciais de homologação com produção.

### Converter o certificado P12 para base64

Linux/macOS:

```bash
base64 -w 0 certificado.p12
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.p12"))
```

Não salve o resultado no GitHub, Lovable ou em variável `VITE_`.

## 3. Escopos necessários na aplicação Efí

Ative pelo menos:

```text
cob.write
cob.read
payloadlocation.read
webhook.write
webhook.read
pix.send
gn.pix.send.read
```

Dependendo das operações futuras de devolução, também poderão ser necessários `pix.write` e `pix.read`.

## 4. Aplicar banco e funções

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase functions deploy pix-efi --no-verify-jwt
npx supabase functions deploy wallet-efi --no-verify-jwt
```

As funções usam `verify_jwt = false` somente porque o webhook Efí precisa ser público. As rotas privadas validam o token manualmente e as rotas administrativas conferem `platform_admins`.

## 5. Definir o administrador da plataforma

A migration atribui inicialmente esse papel ao proprietário da primeira loja criada. Confirme o usuário no SQL Editor:

```sql
select * from public.platform_admins;
```

Para definir manualmente:

```sql
insert into public.platform_admins (user_id)
values ('UUID_DO_SEU_USUARIO')
on conflict (user_id) do nothing;
```

Remova qualquer usuário incorreto:

```sql
delete from public.platform_admins
where user_id = 'UUID_INCORRETO';
```

## 6. Registrar o webhook

Depois do deploy e dos segredos:

1. Entre como administrador da plataforma.
2. Abra **Administração → Financeiro → Gestão da plataforma**.
3. Clique em **Registrar webhook**.
4. Clique em **Consultar** e confira a resposta da Efí.

O endereço usa HTTPS do Supabase e inclui um HMAC secreto. A função também aceita o sufixo `/pix` que a Efí pode acrescentar ao callback.

Como o Supabase Edge Functions não oferece configuração de certificado cliente para validar mTLS de entrada, o cadastro envia o cabeçalho `x-skip-mtls-checking: true`, opção disponibilizada pela Efí para hospedagens compartilhadas. Por isso, use um `EFI_WEBHOOK_SECRET` longo e aleatório, não exponha a URL completa e monitore os eventos. Em uma infraestrutura futura que aceite mTLS de entrada, prefira validar também o certificado da Efí.

## 7. Configurar saques da loja

Cada administrador de loja deve informar:

- tipo da chave PIX
- chave PIX
- nome do titular
- CPF ou CNPJ do titular
- valor mínimo desejado para repasse automático
- frequência manual, diária ou semanal
- aceite dos termos de repasse

O documento do titular é enviado junto ao PIX para validação do favorecido.

## 8. Repasse automático

O endpoint é:

```text
POST /functions/v1/wallet-efi/process-auto-payouts
Header: x-cron-secret: VALOR_DE_WALLET_CRON_SECRET
```

Você pode chamar esse endpoint uma vez por dia com um agendador confiável. A própria função verifica:

- se o repasse automático global está ativo
- se a loja ativou o repasse
- frequência global e da loja
- saldo liberado
- saque mínimo
- existência de outro saque em andamento

Não execute várias chamadas simultâneas. O banco trava a conta durante a reserva, mas a Efí também recomenda processar envios de forma ordenada.

## 9. Limites de envio da Efí

A Efí informa limites diários pré-aprovados muito baixos para envio de PIX via API. Antes de usar saques reais, solicite aumento de limite e confirme que sua conta é compatível com envios para terceiros. Faça isso diretamente com a Efí e teste primeiro em homologação.

## 10. Remover funções PIX antigas já publicadas

O projeto não contém mais as pastas antigas, porém elas podem continuar implantadas no seu projeto Supabase. Confira e remova somente depois de confirmar que não são usadas por outro sistema:

```bash
npx supabase functions list
npx supabase functions delete create-pix-charge
npx supabase functions delete pix-webhook
npx supabase functions delete refund-pix
```

## 11. Testes obrigatórios antes de produção

1. Criar duas lojas diferentes.
2. Fazer um pedido PIX em cada loja.
3. Tentar alterar preços e total pelo DevTools.
4. Confirmar que a cobrança usa o total do banco.
5. Pagar em homologação e verificar a loja correta.
6. Reenviar o mesmo webhook várias vezes e confirmar apenas um crédito.
7. Conferir o período “a liberar”.
8. Solicitar saque parcial e total.
9. Simular rejeição e verificar a devolução da reserva ao saldo.
10. Simular erro 5xx e confirmar que o saldo permanece reservado até consulta.
11. Tentar acessar o financeiro de outra loja.
12. Testar uma conta suspensa.
13. Conferir logs do Supabase e conciliar com o extrato Efí.

## 12. Limitações desta entrega

- Não foi implementado KYC completo das lojas.
- Não foi implementada devolução de pagamento ao cliente pelo painel.
- Não foi implementado split nativo da Efí.
- O certificado mTLS e o envio real precisam ser validados no ambiente de homologação/produção da sua conta Efí.
- O projeto continua com dependências do Lovable porque a edição permanecerá lá por enquanto.
- O build completo não pôde ser executado neste ambiente devido às dependências privadas/externas do projeto; os arquivos TypeScript/TSX foram validados sintaticamente.

## Aviso jurídico e operacional

Não divulgue esse módulo como “conta digital”, “banco”, “carteira de pagamento” ou “depósito”. Use termos como **Financeiro**, **saldo a receber**, **valores de vendas** e **repasse**.

Receber valores de várias empresas em uma conta central, manter registros de saldo e fazer repasses pode envolver regras de instituição/arranjo de pagamento, prevenção à fraude, identificação de clientes, contratos, tributação, conciliação, chargebacks/devoluções e segregação patrimonial. Antes de operar com lojas reais, valide o modelo com:

- jurídico especializado em meios de pagamento
- contador
- Efí, apresentando exatamente o fluxo de marketplace/plataforma
- termos de uso e contrato de repasse

Uma alternativa futura mais adequada pode ser o split de pagamentos oferecido por um PSP, quando disponível e aprovado para a operação.

## Documentação oficial consultada

- Efí — Credenciais, Certificado e Autorização da API Pix
- Efí — Cobranças imediatas
- Efí — Webhooks
- Efí — Envio e Pagamento Pix
- Banco Central — Resolução BCB nº 80/2021
- Banco Central — Resolução BCB nº 494/2025
