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

  const linkEmail = document.getElementById("link-email");
  if (linkEmail) {
    linkEmail.href = `mailto:${CONFIG.email}`;
    linkEmail.textContent = CONFIG.email;
  }

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

  // Formulário "Em breve" do sistema XML
  // FASE 2: trocar por envio a um banco (ex.: Firebase) para guardar a lista
  const formInteresse = document.getElementById("form-interesse");
  if (formInteresse) {
    formInteresse.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const dados = new FormData(formInteresse);
      const texto =
        `Olá! Quero ser avisado do lançamento do sistema Remasol Fature.\n` +
        `Nome: ${dados.get("nome")}\nClínica: ${dados.get("clinica")}`;
      window.open(montarLinkWhatsApp(texto), "_blank", "noopener");
    });
  }
});

function montarLinkWhatsApp(mensagem) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
