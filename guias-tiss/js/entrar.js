// Página de login do Guias TISS: entrar, criar conta e recuperar senha.
'use strict'

;(function () {
  const $ = function (s) { return document.querySelector(s) }
  const msg = $('#msg')

  function aviso(texto, tipo) {
    msg.textContent = texto || ''
    msg.className = 'entrar__msg' + (tipo ? ' ' + tipo : '')
  }

  document.querySelectorAll('.js-dias-teste').forEach(function (el) { el.textContent = DIAS_TESTE })

  // Login ainda não configurado: mostra "em breve" e deixa o app aberto.
  if (!loginAtivo()) {
    $('#em-breve').hidden = false
    return
  }
  $('#area-login').hidden = false

  // Abas: entrar / criar conta / recuperar senha
  function mostrar(painel) {
    document.querySelectorAll('[data-painel]').forEach(function (f) { f.hidden = f.dataset.painel !== painel })
    $('#aba-entrar').setAttribute('aria-selected', String(painel !== 'criar'))
    $('#aba-criar').setAttribute('aria-selected', String(painel === 'criar'))
    aviso('')
  }
  document.querySelectorAll('[data-aba]').forEach(function (b) {
    b.addEventListener('click', function () { mostrar(b.dataset.aba) })
  })
  if (location.hash === '#criar') mostrar('criar')

  function irParaApp() { location.href = 'index.html' }

  function ocupado(form, sim) {
    form.querySelectorAll('button, input').forEach(function (el) { el.disabled = sim })
  }

  obterAuth().then(function (auth) {
    // Já está logado: vai direto para o app.
    const parar = auth.onAuthStateChanged(function (user) {
      parar()
      if (user && user.emailVerified) irParaApp()
    })

    $('#form-entrar').addEventListener('submit', function (e) {
      e.preventDefault()
      const form = e.target
      ocupado(form, true); aviso('Entrando…')
      auth.signInWithEmailAndPassword($('#e-email').value.trim(), $('#e-senha').value)
        .then(function (cred) {
          if (!cred.user.emailVerified) {
            return cred.user.sendEmailVerification().then(function () {
              return auth.signOut()
            }).then(function () {
              aviso('Confirme seu e-mail antes de entrar. Enviamos um novo link para ' + cred.user.email + '.', 'erro')
            })
          }
          irParaApp()
        })
        .catch(function (err) { aviso(mensagemErro(err), 'erro') })
        .finally(function () { ocupado(form, false) })
    })

    $('#form-criar').addEventListener('submit', function (e) {
      e.preventDefault()
      const form = e.target
      const nome = $('#c-nome').value.trim()
      const email = $('#c-email').value.trim()
      const senha = $('#c-senha').value
      if (!nome) return aviso('Digite seu nome.', 'erro')
      if (senha.length < 6) return aviso('A senha precisa ter pelo menos 6 caracteres.', 'erro')
      if (senha !== $('#c-senha2').value) return aviso('As senhas não são iguais.', 'erro')
      if (!$('#c-aceite').checked) return aviso('Para criar a conta, aceite os termos de uso e a política de privacidade.', 'erro')
      ocupado(form, true); aviso('Criando sua conta…')
      auth.createUserWithEmailAndPassword(email, senha)
        .then(function (cred) {
          return cred.user.updateProfile({ displayName: nome })
            .then(function () { return cred.user.sendEmailVerification() })
            .then(function () { return auth.signOut() })
        })
        .then(function () {
          mostrar('entrar')
          $('#e-email').value = email
          aviso('Conta criada! Abra o e-mail que enviamos para ' + email + ', clique no link de confirmação e depois entre aqui.', 'ok')
        })
        .catch(function (err) { aviso(mensagemErro(err), 'erro') })
        .finally(function () { ocupado(form, false) })
    })

    $('#form-recuperar').addEventListener('submit', function (e) {
      e.preventDefault()
      const form = e.target
      const email = $('#r-email').value.trim()
      ocupado(form, true)
      auth.sendPasswordResetEmail(email)
        .then(function () { aviso('Se existir uma conta com ' + email + ', você vai receber o link em alguns minutos.', 'ok') })
        .catch(function (err) { aviso(mensagemErro(err), 'erro') })
        .finally(function () { ocupado(form, false) })
    })
  }).catch(function (err) { aviso(err.message, 'erro') })
})()
