# Remasol Fature — site

Site institucional da **Remasol Fature**.

- **Página inicial (`index.html`):** Guias TISS, o gerador de guias e lote XML (é o que abre em `guiaxmltiss.com.br`).
- **Serviços (`servicos.html`):** faturamento de convênios, arquivo XML para envio
  ao convênio e sistema de baixo custo com banco de dados local. No topo, uma caixa
  clicável leva à página de digitalização.
- **Digitalização (`digitalizacao.html`):** fichas e prontuários em papel → arquivo digital.
- **App (`guias-tiss/`):** o próprio aplicativo fica em `guias-tiss/` (cópia da pasta `web/` do repositório `xml`;
  quando o app mudar lá, copie a pasta de novo). Os dados ficam no navegador de quem usa.

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

- [ ] Colocar o número real do WhatsApp em `js/config.js`
- [ ] Colocar o e-mail real em `js/config.js`
- [ ] Comprar o domínio no Registro.br (ex.: `remasolfature.com.br`)
- [ ] Publicar (GitHub Pages: Settings → Pages → branch `main`)
- [ ] Revisar a política de privacidade

## Fase 2 — sistema de geração de XML

O site já está preparado:

- **Endereço:** o sistema ficará em um subdomínio (`app.remasolfature.com.br`),
  separado do site, configurado em `CONFIG.urlSistema`.
- **Menu:** o link "Área do cliente" já existe no `index.html` com `hidden`.
  Para mostrar, é só remover esse atributo.
- **Login:** e-mail e senha, provavelmente via Firebase Authentication.
