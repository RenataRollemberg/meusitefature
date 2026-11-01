# Remasol Fature — site

Site institucional da **Remasol Fature**.

- **Página inicial (`index.html`):** Guias TISS, o gerador de guias e lote XML (é o que abre em `guiaxmltiss.com.br`).
- **Serviços (`servicos.html`):** faturamento de convênios, arquivo XML para envio
  ao convênio e sistema de baixo custo com banco de dados local. No topo, uma caixa
  clicável leva à página de digitalização.
- **Digitalização (`digitalizacao.html`):** fichas e prontuários em papel → arquivo digital.
- **App (`guias-tiss/`):** o próprio aplicativo fica em `guias-tiss/` (cópia da pasta `web/` do repositório `xml`;
  quando o app mudar lá, copie a pasta de novo). Os dados ficam no navegador de quem usa.
- **Login (`guias-tiss/entrar.html`):** entrar, criar conta (teste grátis de 7 dias) e recuperar senha,
  com Firebase Authentication. Fica **desligado** enquanto `guias-tiss/js/firebase-config.js` tiver
  `FIREBASE_CONFIG = null`: a página mostra "Contas em breve" e o app abre direto. Para ligar, cole ali
  o `firebaseConfig` do projeto (Firebase → Configurações do projeto → app da Web) e, em
  Authentication → Settings → Domínios autorizados, adicione `guiaxmltiss.com.br`.
  Próximas etapas: dados na nuvem (Firestore) e assinatura automática (Mercado Pago).
- **Planos e Faturista (`guias-tiss/js/planos.js`):** Básico R$ 70 (1 médico, 1 convênio), Básico 2 R$ 130
  (1 médico, 3 convênios), Clínica R$ 280 (5 médicos, 10 convênios), Clínica Premium R$ 510 (10 médicos,
  15 convênios). O serviço extra **Faturista** tem valor combinado com cada cliente: pode incluir a
  plataforma ou ser somado ao plano. O limite de convênios já é aplicado no app.
- **Painel da Remasol (`guias-tiss/admin.html`):** entre com remasolfaturetiss@gmail.com (e-mail confirmado)
  para cadastrar cada cliente pelo e-mail: plano, situação (período grátis, ativo, suspenso) e valor do
  Faturista. Na primeira entrada, o médico vê o plano e o valor combinado e confirma.
  Os cadastros ficam no Firestore, coleção `clientes`.
- **Regras do banco (`firestore.rules`):** o GitHub Pages não publica este arquivo. Copie o conteúdo para
  Firebase → Firestore Database → Regras → Publicar. Sem elas, o painel não abre e o app segue só com o
  teste de 7 dias.

## Estrutura

```
meusitefature/
├── index.html          # página inicial: Guias TISS
├── servicos.html       # serviços de faturamento (antiga página principal)
├── guias-tiss/         # o aplicativo Guias TISS
├── CNAME               # domínio: guiaxmltiss.com.br
├── digitalizacao.html  # página de digitalização de fichas
├── privacidade.html    # política de privacidade (LGPD) — rascunho, revisar
├── css/
│   └── style.css       # todo o visual (cores nas variáveis do topo)
├── js/
│   ├── config.js       # WhatsApp, e-mail, URL do sistema  ← edite aqui
│   └── main.js         # menu mobile e formulários
└── assets/
    ├── logo.svg
    └── favicon.svg
```

## Pendências da fase 1

- [x] WhatsApp: (21) 97666-3134 (`js/config.js`)
- [x] E-mail de suporte: remasolfaturetiss@gmail.com (`js/config.js`)
- [x] Domínio registrado: guiaxmltiss.com.br (falta configurar o DNS no Registro.br)
- [x] Publicado no GitHub Pages em guiaxmltiss.com.br (falta marcar Enforce HTTPS)
- [ ] Revisar a política de privacidade

## Fase 2 — sistema de geração de XML

O site já está preparado:

- **Endereço:** o sistema ficará em um subdomínio (`app.remasolfature.com.br`),
  separado do site, configurado em `CONFIG.urlSistema`.
- **Menu:** o link "Área do cliente" já existe no `index.html` com `hidden`.
  Para mostrar, é só remover esse atributo.
- **Login:** e-mail e senha, provavelmente via Firebase Authentication.
