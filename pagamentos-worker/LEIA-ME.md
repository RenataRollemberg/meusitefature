# Pagamento automático do Guias TISS

O cliente paga dentro do programa (botões **Pagar 30 dias** e **Assinar no cartão**) e é ativado sozinho
quando o Mercado Pago confirma. Quem faz isso é este Worker, que roda de graça na Cloudflare.

```
Cliente clica em pagar ─▶ Worker /pagar ─▶ Mercado Pago (link de pagamento)
Mercado Pago confirma  ─▶ Worker /webhook ─▶ confere o pagamento ─▶ Firebase: status "ativo" + "pagoAte"
```

- **Pagar 30 dias** (Pix, boleto ou cartão): cada pagamento soma 30 dias ao que ainda falta.
- **Assinar no cartão**: o Mercado Pago cobra todo mês sozinho; cada cobrança soma 30 dias.
- Venceu e não pagou: o programa bloqueia depois de `DIAS_TOLERANCIA` dias (3) e mostra os planos.
- Cliente que você ativa à mão no painel, sem data de pagamento, continua liberado como hoje.

## Passo a passo (uma vez só)

### 1. Mercado Pago (conta que recebe)
1. Entre em **mercadopago.com.br/developers/panel/app** e clique em **Criar aplicação**
   (tipo: pagamentos online / Checkout Pro).
2. Em **Credenciais de produção**, copie o **Access Token** (começa com `APP_USR-`).
3. Em **Webhooks → Configurar notificações**:
   - URL de produção: `https://guias-tiss-pagamentos.<sua-conta>.workers.dev/webhook`
   - Eventos: **Pagamentos** e **Planos e assinaturas**
   - Salve e copie a **Assinatura secreta**.

### 2. Firebase (projeto guia-tiss)
1. Console do Firebase → ⚙️ **Configurações do projeto** → **Contas de serviço**.
2. **Gerar nova chave privada** → baixa um arquivo `.json`. Guarde com cuidado: ele dá acesso ao banco.
3. Do arquivo, você vai usar `client_email` e `private_key`.

### 3. Cloudflare
1. **Workers e Pages → Criar → Worker**, nome `guias-tiss-pagamentos`, **Implantar**.
2. **Editar código**: apague o exemplo, cole o conteúdo de `src/index.js` e **Implantar**.
3. **Configurações → Variáveis e segredos**:
   - Texto: `FIREBASE_PROJECT_ID` = `guia-tiss`, `FIREBASE_API_KEY` = (o apiKey de firebase-config.js), `SITE_URL` = `https://guiaxmltiss.com.br`
   - Segredo: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
4. Abra `https://guias-tiss-pagamentos.<sua-conta>.workers.dev/status` — deve aparecer `"ok": true`.

### 4. Ligar no programa
Em `guias-tiss/js/firebase-config.js`, preencha `PAGAMENTOS_URL` com o endereço do Worker
(sem `/pagar` no final) e publique. Enquanto estiver vazio, os botões usam os links fixos de antes.

## Mudou o preço?
Altere em **dois lugares**: `guias-tiss/js/planos.js` (o que aparece na tela) e `PLANOS` em
`src/index.js` (o que é cobrado), e implante o Worker de novo.
