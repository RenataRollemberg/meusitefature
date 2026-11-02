/* =========================================================
   Remasol Fature — comportamento do site
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // Ano no rodapé
  const ano = document.getElementById("ano");
  if (ano) ano.textContent = new Date().getFullYear();

  // Menu mobile
  const botaoMenu = document.querySelector(".menu-botao");
  const menu = document.getElementById("menu");
  if (botaoMenu && menu) {
    botaoMenu.addEventListener("click", () => {
      const aberto = menu.classList.toggle("aberto");
      botaoMenu.setAttribute("aria-expanded", aberto);
    });
    menu.querySelectorAll("a").forEach((link) =>
      link.addEventListener("click", () => {
        menu.classList.remove("aberto");
        botaoMenu.setAttribute("aria-expanded", "false");
      })
    );
  }

  // Links de contato
  const linkWhats = document.getElementById("link-whatsapp");
  if (linkWhats) {
    linkWhats.href = montarLinkWhatsApp(
      "Olá! Vi o site da Remasol Fature e gostaria de saber mais."
    );
  }

  // Botões com mensagem própria de WhatsApp (ex.: página do Guias TISS)
  document.querySelectorAll("[data-whatsapp]").forEach((botao) => {
    botao.href = montarLinkWhatsApp(botao.dataset.whatsapp);
    botao.target = "_blank";
    botao.rel = "noopener";
  });

  // Links de e-mail: o do contato (#link-email) e os marcados com data-email
  document.querySelectorAll("#link-email, [data-email]").forEach((link) => {
    link.href = `mailto:${CONFIG.email}`;
    if (!link.dataset.email) link.textContent = CONFIG.email;
  });

  // Dados de CONFIG nas páginas (ex.: responsável nos Termos de uso).
  // [data-config="a.b"] recebe o valor; [data-se="a.b"] some quando o valor está vazio.
  const lerConfig = (caminho) => caminho.split(".").reduce((o, k) => (o ? o[k] : ""), CONFIG) || "";
  document.querySelectorAll("[data-config]").forEach((el) => {
    const valor = lerConfig(el.dataset.config);
    if (valor) el.textContent = valor;
  });
  document.querySelectorAll("[data-se]").forEach((el) => {
    el.hidden = !lerConfig(el.dataset.se);
  });

  // Formulário de contato → abre o WhatsApp com a mensagem pronta
  const formContato = document.getElementById("form-contato");
  if (formContato) {
    formContato.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const dados = new FormData(formContato);
      const texto = [
        "Olá! Vim pelo site da Remasol Fature.",
        `Nome: ${dados.get("nome")}`,
        dados.get("clinica") ? `Clínica: ${dados.get("clinica")}` : "",
        `Interesse: ${dados.get("servico")}`,
        dados.get("mensagem") ? `Mensagem: ${dados.get("mensagem")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      window.open(montarLinkWhatsApp(texto), "_blank", "noopener");
    });
  }

});

function montarLinkWhatsApp(mensagem) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
