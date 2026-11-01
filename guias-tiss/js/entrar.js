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
    $('#reenviar').hidden = true
  }
  document.querySelectorAll('[data-aba]').forEach(function (b) {
    b.addEventListener('click', function () { mostrar(b.dataset.aba) })
  })
  if (location.hash === '#criar') mostrar('criar')

  function irParaApp() { location.href = 'index.html' }
  let usuarioSemConfirmar = null

  // Depois de confirmar o e-mail, o Firebase mostra o botão "Continuar", que volta para esta página.
  const voltaConfirmacao = { url: location.origin + location.pathname + '?confirmado=1' }
  function enviarConfirmacao(user) { return user.sendEmailVerification(voltaConfirmacao) }

  function ocupado(form, sim) {
    form.querySelectorAll('button, input').forEach(function (el) { el.disabled = sim })
  }

  obterAuth().then(function (auth) {
    // Já está logado: vai direto para o app.
    if (/[?&]confirmado=1/.test(location.search)) {
      aviso('E-mail confirmado! Agora entre com o seu e-mail e a sua senha.', 'ok')
    }
    const parar = auth.onAuthStateChanged(function (user) {
      parar()
      if (!user) return
      // Atualiza a conta: a confirmação pode ter sido feita em outra aba.
      user.reload().then(function () {
        if (auth.currentUser && auth.currentUser.emailVerified) irParaApp()
      }).catch(function () {})
    })

    $('#form-entrar').addEventListener('submit', function (e) {
      e.preventDefault()
      const form = e.target
      ocupado(form, true); aviso('Entrando…')
      auth.signInWithEmailAndPassword($('#e-email').value.trim(), $('#e-senha').value)
        .then(function (cred) {
          if (!cred.user.emailVerified) {
            // Não reenvia sozinho (o Firebase bloqueia envios repetidos); oferece o botão.
            usuarioSemConfirmar = cred.user
            aviso('Seu e-mail ainda não foi confirmado. Abra o link que enviamos para ' + cred.user.email + ' (veja também o Spam) e depois entre de novo.', 'erro')
            $('#reenviar').hidden = false
            return
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
            .then(function () { return enviarConfirmacao(cred.user) })
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

    $('#reenviar').addEventListener('click', function () {
      const user = usuarioSemConfirmar
      if (!user) return
      const botao = $('#reenviar')
      botao.disabled = true
      enviarConfirmacao(user)
        .then(function () { aviso('Enviamos um novo link para ' + user.email + '. Pode levar alguns minutos.', 'ok') })
        .catch(function (err) { aviso(mensagemErro(err), 'erro') })
        .finally(function () { setTimeout(function () { botao.disabled = false }, 60000) })
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
