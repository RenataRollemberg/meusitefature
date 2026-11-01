// Controle de acesso do aplicativo.
// - Login desligado (FIREBASE_CONFIG = null): não faz nada; o app abre como antes.
// - Login ligado: exige conta com e-mail confirmado e lê o cadastro do cliente no Firestore
//   (coleção "clientes", documento = e-mail):
//     · cliente que a Remasol cadastrou no painel (admin.html): na primeira entrada vê o plano
//       e o valor combinado (inclusive o serviço Faturista) e confirma;
//     · cliente que criou a conta sozinho: ganha o cadastro automático em período grátis;
//     · status "ativo" libera; "suspenso" ou teste vencido bloqueia.
// - window.Assinatura expõe o plano para o app aplicar os limites (ex.: número de convênios).
'use strict'

;(function () {
  if (!loginAtivo()) return

  const raiz = document.documentElement
  raiz.classList.add('acesso-carregando')

  let cliente = null

  window.Assinatura = {
    cliente: function () { return cliente },
    limites: function () {
      const plano = cliente && Planos.get(cliente.plano)
      return plano ? { medicos: plano.medicos, convenios: plano.convenios, plano: plano } : null
    },
    // Chamado antes de cadastrar um convênio novo.
    checarNovoConvenio: function (quantidadeAtual) {
      const l = window.Assinatura.limites()
      if (!l || quantidadeAtual < l.convenios) return
      throw new Error('O plano ' + l.plano.nome + ' permite ' + l.convenios + (l.convenios === 1 ? ' convênio' : ' convênios') +
        '. Para cadastrar mais, fale com a Remasol e troque de plano.')
    }
  }

  function irParaLogin() { location.replace('entrar.html') }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function linkWhats(texto) {
    return 'https://wa.me/5521976663134?text=' + encodeURIComponent(texto)
  }

  // ---------------------------------------------------------------------------
  // Período grátis
  // ---------------------------------------------------------------------------

  function diasRestantes(user) {
    const fim = cliente && paraData(cliente.testeAte)
    if (fim) return Math.max(0, Math.ceil((fim.getTime() - Date.now()) / 86400000))
    return diasRestantesTeste(user)
  }

  // ---------------------------------------------------------------------------
  // Pedaços de tela
  // ---------------------------------------------------------------------------

  function contaHtml(c) {
    const conta = Planos.cobranca(c)
    if (!conta.linhas.length) return ''
    return '<table class="assinatura-conta"><tbody>' +
      conta.linhas.map(function (l) {
        return '<tr><td>' + esc(l.texto) + '</td><td>' + Planos.money(l.valor) + '</td></tr>'
      }).join('') +
      '</tbody><tfoot><tr><td>Total por mês</td><td>' + Planos.money(conta.total) + '</td></tr></tfoot></table>'
  }

  function resumoHtml(c) {
    const plano = Planos.get(c.plano)
    return (plano
      ? '<div class="assinatura-item"><span>Plano</span><strong>' + esc(plano.nome) + '</strong><small>' + esc(Planos.limitesTexto(plano)) + '</small></div>'
      : '') +
      (Planos.faturistaAtivo(c)
        ? '<div class="assinatura-item"><span>Serviço extra</span><strong>' + esc(Planos.FATURISTA.nome) + '</strong><small>' + esc(Planos.FATURISTA.descricao) + '</small></div>'
        : '') +
      contaHtml(c)
  }

  function planosHtml() {
    return '<div class="assinatura-planos">' + Planos.lista.map(function (p) {
      return '<a class="assinatura-plano" target="_blank" rel="noopener" href="' +
        esc(linkWhats('Olá! Quero assinar o Guias TISS no plano ' + p.nome + '.')) + '">' +
        '<strong>' + esc(p.nome) + '</strong><span>' + Planos.money(p.mensal) + '/mês</span><small>' + esc(Planos.limitesTexto(p)) + '</small></a>'
    }).join('') + '</div>'
  }

  function janela(html, fixa) {
    const tela = document.createElement('div')
    tela.className = 'acesso-bloqueio'
    tela.setAttribute('role', 'dialog')
    tela.setAttribute('aria-modal', 'true')
    tela.innerHTML = '<div class="acesso-bloqueio__caixa">' + html + '</div>'
    if (!fixa) {
      tela.addEventListener('click', function (e) {
        if (e.target === tela || e.target.closest('[data-fechar]')) tela.remove()
      })
    }
    document.body.appendChild(tela)
    return tela
  }

  // ---------------------------------------------------------------------------
  // Faixa na barra lateral
  // ---------------------------------------------------------------------------

  function faixaConta(auth, user, dias) {
    const sidebar = document.querySelector('.sidebar')
    if (!sidebar) return
    const plano = cliente && Planos.get(cliente.plano)
    let etiqueta
    if (cliente && cliente.status === 'ativo') etiqueta = plano ? plano.nome : 'Assinatura ativa'
    else etiqueta = dias === 0 ? 'Teste encerrado' : dias === 1 ? 'Teste: último dia' : 'Teste: ' + dias + ' dias restantes'

    const faixa = document.createElement('div')
    faixa.className = 'conta-faixa'
    faixa.innerHTML =
      '<div>' + esc(user.email) + '</div>' +
      '<span class="conta-teste' + (cliente && cliente.status === 'ativo' ? ' ativo' : '') + '">' + esc(etiqueta) + '</span><br>' +
      (cliente && (plano || Planos.faturistaAtivo(cliente)) ? '<button type="button" data-ver>Minha assinatura</button> · ' : '') +
      '<button type="button" data-sair>Sair</button>'
    faixa.querySelector('[data-sair]').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
    const ver = faixa.querySelector('[data-ver]')
    if (ver) {
      ver.addEventListener('click', function () {
        janela('<h2>Minha assinatura</h2>' + resumoHtml(cliente) +
          '<p>Para trocar de plano, fale com a Remasol: <a href="' + esc(linkWhats('Olá! Quero trocar o plano do Guias TISS.')) + '" target="_blank" rel="noopener">WhatsApp (21) 97666-3134</a>.</p>' +
          '<button type="button" class="btn" data-fechar>Fechar</button>')
      })
    }
    sidebar.insertBefore(faixa, sidebar.querySelector('.sidebar-note'))
  }

  // ---------------------------------------------------------------------------
  // Bloqueio e boas-vindas
  // ---------------------------------------------------------------------------

  function bloquear(auth, motivo) {
    const suspenso = motivo === 'suspenso'
    const tela = janela(
      '<h2>' + (suspenso ? 'Assinatura suspensa' : 'Seu teste grátis terminou') + '</h2>' +
      '<p>' + (suspenso
        ? 'Fale com a Remasol para reativar o acesso. Seus dados continuam guardados.'
        : 'Para continuar emitindo guias e gerando lotes XML, escolha um plano. Seus dados continuam guardados.') + '</p>' +
      (suspenso
        ? '<a class="btn solid" target="_blank" rel="noopener" href="' + esc(linkWhats('Olá! Quero reativar o meu Guias TISS.')) + '">Falar com a Remasol</a>'
        : planosHtml()) +
      '<p><button type="button" class="entrar__link" data-sair>Sair da conta</button></p>', true)
    tela.querySelector('[data-sair]').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
  }

  // Cliente cadastrado pela Remasol, entrando pela primeira vez: mostra o que foi combinado.
  function boasVindas(db, user) {
    return new Promise(function (resolve) {
      const tela = janela(
        '<h2>Olá, ' + esc(cliente.nome || user.displayName || '') + '!</h2>' +
        '<p>A Remasol já preparou a sua assinatura. Confira:</p>' + resumoHtml(cliente) +
        (cliente.status === 'teste' ? '<p class="assinatura-ok">Os primeiros dias são grátis.</p>' : '') +
        '<p class="assinatura-erro" hidden></p>' +
        '<button type="button" class="btn solid" data-ok>Confirmar e começar</button>', true)
      tela.querySelector('[data-ok]').addEventListener('click', function (e) {
        e.target.disabled = true
        docCliente(db, user.email).update({ aceitoEm: firebase.firestore.FieldValue.serverTimestamp() })
          .then(function () { tela.remove(); resolve() })
          .catch(function (err) {
            e.target.disabled = false
            const p = tela.querySelector('.assinatura-erro')
            p.hidden = false
            p.textContent = mensagemErro(err)
          })
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Cadastro do cliente no Firestore
  // ---------------------------------------------------------------------------

  // Lê o cadastro; se não existir, cria em período grátis. Sem banco (regras ainda não
  // publicadas ou sem internet), segue com o teste contado pela data da conta.
  function carregarCliente(user) {
    return obterDb().then(function (db) {
      const ref = docCliente(db, user.email)
      return ref.get().then(function (snap) {
        if (snap.exists) return { db: db, dados: snap.data() }
        const novo = {
          nome: user.displayName || '',
          email: user.email.toLowerCase(),
          status: 'teste',
          origem: 'site',
          criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        }
        return ref.set(novo).then(function () { return { db: db, dados: novo } })
      })
    }).catch(function (err) {
      console.warn('Guias TISS: cadastro do cliente indisponível —', err && err.message)
      return { db: null, dados: null }
    })
  }

  obterAuth().then(function (auth) {
    auth.onAuthStateChanged(function (user) {
      if (!user || !user.emailVerified) return irParaLogin()
      carregarCliente(user).then(function (r) {
        cliente = r.dados
        const primeiraVez = cliente && cliente.origem !== 'site' && !cliente.aceitoEm
        const passo = primeiraVez && r.db ? (raiz.classList.remove('acesso-carregando'), boasVindas(r.db, user)) : Promise.resolve()
        return passo
      }).then(function () {
        raiz.classList.remove('acesso-carregando')
        const dias = diasRestantes(user)
        faixaConta(auth, user, dias)
        if (cliente && cliente.status === 'suspenso') return bloquear(auth, 'suspenso')
        if (cliente && cliente.status === 'ativo') return
        if (dias === 0) bloquear(auth, 'teste')
      })
    })
  }).catch(function () {
    // Sem internet para conferir o login: libera a tela e avisa.
    raiz.classList.remove('acesso-carregando')
  })
})()
