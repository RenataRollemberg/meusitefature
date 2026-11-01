// Controle de acesso do aplicativo.
// - Login desligado (FIREBASE_CONFIG = null): não faz nada; o app abre como antes.
// - Login ligado: exige conta com e-mail confirmado e mostra os dias de teste.
//   Quando o teste acaba, bloqueia o uso até a assinatura (ligada na próxima etapa).
'use strict'

;(function () {
  if (!loginAtivo()) return

  const raiz = document.documentElement
  raiz.classList.add('acesso-carregando')

  function irParaLogin() { location.replace('entrar.html') }

  function faixaConta(auth, user, dias) {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    const faixa = document.createElement('div')
    faixa.className = 'conta-faixa'
    faixa.innerHTML =
      '<div></div>' +
      '<span class="conta-teste"></span><br>' +
      '<button type="button">Sair</button>'
    faixa.firstChild.textContent = user.email
    faixa.querySelector('.conta-teste').textContent =
      dias === 0 ? 'Teste encerrado' : dias === 1 ? 'Teste: último dia' : 'Teste: ' + dias + ' dias restantes'
    faixa.querySelector('button').addEventListener('click', function () {
      auth.signOut().then(irParaLogin)
    })
    sidebar.insertBefore(faixa, sidebar.querySelector('.sidebar-note'))
  }

  function bloquear(auth, user) {
    const tela = document.createElement('div')
    tela.className = 'acesso-bloqueio'
    tela.setAttribute('role', 'dialog')
    tela.setAttribute('aria-modal', 'true')
    tela.innerHTML =
      '<div class="acesso-bloqueio__caixa">' +
      '<h2>Seu teste grátis terminou</h2>' +
      '<p>Para continuar emitindo guias e gerando lotes XML, assine o Guias TISS. Seus dados continuam guardados.</p>' +
      '<a class="btn solid" href="mailto:remasolfaturetiss@gmail.com?subject=Assinatura%20Guias%20TISS">Quero assinar</a>' +
      '<p><button type="button" class="entrar__link">Sair da conta</button></p>' +
      '</div>'
    tela.querySelector('button').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
    document.body.appendChild(tela)
  }

  obterAuth().then(function (auth) {
    auth.onAuthStateChanged(function (user) {
      if (!user || !user.emailVerified) return irParaLogin()
      const dias = diasRestantesTeste(user)
      raiz.classList.remove('acesso-carregando')
      faixaConta(auth, user, dias)
      if (dias === 0) bloquear(auth, user)
    })
  }).catch(function () {
    // Sem internet para conferir o login: libera a tela e avisa.
    raiz.classList.remove('acesso-carregando')
  })
})()
