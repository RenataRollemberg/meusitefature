# Remasol Fature — site

Site institucional da **Remasol Fature**: digitalização do arquivo físico de consultórios
(fichas e prontuários em papel → banco de dados digital) e faturamento de convênios com
XML pronto para a secretária importar.

## Estrutura

```
meusitefature/
├── index.html          # página principal
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
- **Lista de interessados:** a seção "Em breve" hoje manda o contato pelo WhatsApp.
  Na fase 2, trocar por gravação em banco (ex.: Firebase) — ver comentário em `js/main.js`.
- **Login:** e-mail e senha, provavelmente via Firebase Authentication.
