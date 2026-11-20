// Página que abre a partir dos links enviados por e-mail pelo Guias TISS:
// - mode=resetPassword: criar uma nova senha
// - mode=verifyEmail:   confirmar o e-mail da conta
// - mode=recoverEmail:  desfazer a troca de e-mail
// No console do Firebase (Authentication > Modelos), a "URL de ação" aponta para esta página.
'use strict'

;(function () {
  const $ = function (s) { return document.querySelector(s) }
  const params = new URLSearchParams(location.search)
  const modo = params.get('mode')
  const codigo = params.get('oobCode')

  function aviso(texto, tipo) {
    $('#msg').textContent = texto || ''
    $('#msg').className = 'entrar__msg' + (tipo ? ' ' + tipo : '')
  }

  function mostrarResultado(titulo, texto, botao, link) {
    $('#carregando').hidden = true
    $('#form-senha').hidden = true
    $('#r-titulo').textContent = titulo
    $('#r-texto').textContent = texto
    $('#r-botao').textContent = botao || 'Ir para Entrar'
    $('#r-botao').href = link || 'entrar.html'
    $('#resultado').hidden = false
    aviso('')
  }

  function erroDoLink(err) {
    const codigoErro = err && err.code
    if (codigoErro === 'auth/expired-action-code') {
      return 'Este link venceu. Peça um novo em “Esqueci a senha”, na página Entrar.'
    }
    if (codigoErro === 'auth/invalid-action-code') {
      return 'Este link já foi usado ou não é mais válido. Se precisar, peça um novo em “Esqueci a senha”.'
    }
    if (codigoErro === 'auth/user-disabled') return 'Esta conta está desativada. Fale com o suporte.'
    if (codigoErro === 'auth/user-not-found') return 'Não encontramos esta conta. Ela pode ter sido apagada.'
    return mensagemErro(err)
  }

  if (!codigo || !modo) {
    mostrarResultado('Link incompleto', 'Abra o link exatamente como chegou no seu e-mail, ou peça um novo na página Entrar.')
    return
  }
  if (!loginAtivo()) {
    mostrarResultado('Contas em breve', 'O login ainda não está ativo.', 'Abrir o Guias TISS', 'index.html')
    return
  }

  obterAuth().then(function (auth) {
    if (modo === 'resetPassword') return novaSenha(auth)
    if (modo === 'verifyEmail') return confirmarEmail(auth)
    if (modo === 'recoverEmail') return recuperarEmail(auth)
    mostrarResultado('Link não reconhecido', 'Peça um novo link na página Entrar.')
  }).catch(function (err) {
    mostrarResultado('Não foi possível abrir o link', mensagemErro(err))
  })

  function novaSenha(auth) {
    return auth.verifyPasswordResetCode(codigo).then(function (email) {
      $('#carregando').hidden = true
      $('#conta-email').textContent = email
      $('#form-senha').hidden = false
      $('#s-nova').focus()

      $('#s-mostrar').addEventListener('change', function () {
        const tipo = this.checked ? 'text' : 'password'
        $('#s-nova').type = tipo
        $('#s-repetir').type = tipo
      })

      $('#form-senha').addEventListener('submit', function (e) {
        e.preventDefault()
        const nova = $('#s-nova').value
        if (nova.length < 6) return aviso('A senha precisa ter pelo menos 6 caracteres.', 'erro')
        if (nova !== $('#s-repetir').value) return aviso('As duas senhas não são iguais.', 'erro')

        const form = e.target
        form.querySelectorAll('button, input').forEach(function (el) { el.disabled = true })
        aviso('Salvando…')
        auth.confirmPasswordReset(codigo, nova)
          // Já entra na conta com a nova senha e vai para o programa.
          .then(function () { return auth.signInWithEmailAndPassword(email, nova) })
          .then(function (cred) {
            if (cred.user && cred.user.emailVerified) {
              mostrarResultado('Senha alterada!', 'Pronto. Você já está dentro da sua conta.', 'Abrir o Guias TISS', 'index.html')
            } else {
              mostrarResultado('Senha alterada!', 'Agora confirme o seu e-mail pelo link que enviamos no cadastro e depois entre com a nova senha.')
            }
          })
          .catch(function (err) {
            // A senha pode ter sido trocada mesmo se o login automático falhar.
            if (err && /action-code/.test(err.code || '')) return mostrarResultado('Não foi possível trocar a senha', erroDoLink(err))
            mostrarResultado('Senha alterada!', 'Entre com o seu e-mail e a nova senha.')
          })
      })
    }).catch(function (err) {
      mostrarResultado('Não foi possível trocar a senha', erroDoLink(err))
    })
  }

  function confirmarEmail(auth) {
    return auth.applyActionCode(codigo).then(function () {
      const usuario = auth.currentUser
      const segue = usuario ? usuario.reload().then(function () { return usuario.emailVerified }).catch(function () { return false }) : Promise.resolve(false)
      return segue.then(function (logado) {
        if (logado) mostrarResultado('E-mail confirmado!', 'Sua conta está pronta.', 'Abrir o Guias TISS', 'index.html')
        else mostrarResultado('E-mail confirmado!', 'Agora entre com o seu e-mail e a sua senha.', 'Ir para Entrar', 'entrar.html?confirmado=1')
      })
    }).catch(function (err) {
      mostrarResultado('Não foi possível confirmar o e-mail', erroDoLink(err))
    })
  }

  function recuperarEmail(auth) {
    let emailAntigo = ''
    return auth.checkActionCode(codigo).then(function (info) {
      emailAntigo = (info.data && info.data.email) || ''
      return auth.applyActionCode(codigo)
    }).then(function () {
      mostrarResultado('E-mail restaurado', 'A sua conta voltou a usar ' + emailAntigo + '. Por segurança, crie uma nova senha em “Esqueci a senha”.')
    }).catch(function (err) {
      mostrarResultado('Não foi possível restaurar o e-mail', erroDoLink(err))
    })
  }
})()
