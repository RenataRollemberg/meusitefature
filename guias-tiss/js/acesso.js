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
      // No período grátis (30 dias) não há limite de médicos nem de convênios.
      if (!cliente || (cliente.status || 'teste') === 'teste') return null
      return Planos.limites(cliente)
    },
    // Chamado antes de cadastrar um convênio novo.
    checarNovoConvenio: function (quantidadeAtual) {
      const l = window.Assinatura.limites()
      if (!l || l.convenios === null || quantidadeAtual < l.convenios) return
      throw new Error(quemPermite(l) + ' permite ' + l.convenios + (l.convenios === 1 ? ' convênio' : ' convênios') +
        '. Para cadastrar mais, fale com a Remasol.')
    },
    // Chamado antes de cadastrar um médico novo.
    // mesmoCnpj: o médico novo vai para um contratado por CNPJ onde já estão todos os médicos da conta.
    checarNovoMedico: function (quantidadeAtual, mesmoCnpj) {
      const l = window.Assinatura.limites()
      if (!l || l.medicos === null) return
      const limite = mesmoCnpj && l.medicosCnpj ? Math.max(l.medicos, l.medicosCnpj) : l.medicos
      if (quantidadeAtual < limite) return
      if (l.medicosCnpj && !mesmoCnpj && quantidadeAtual < l.medicosCnpj) {
        throw new Error(quemPermite(l) + ' permite ' + l.medicos + (l.medicos === 1 ? ' médico' : ' médicos') +
          ', ou até ' + l.medicosCnpj + ' médicos se todos estiverem no mesmo CNPJ. Cadastre o médico dentro do contratado por CNPJ.')
      }
      throw new Error(quemPermite(l) + ' permite ' + limite + (limite === 1 ? ' médico' : ' médicos') +
        (limite !== l.medicos ? ' no mesmo CNPJ' : '') + '. Para cadastrar mais, troque de plano.')
    }
  }

  // Quantos médicos e convênios a conta tem (ordem de cadastro) e qual limite vale.
  function contagem() {
    if (typeof Db === 'undefined' || !Db.state) return null
    const porId = function (a, b) { return a.id - b.id }
    const medicos = Db.state.doctors.slice().sort(porId)
    const convenios = Db.state.operators.slice().sort(porId)
    const todosNoMesmoCnpj = medicos.length > 0 && Db.state.contractors.some(function (c) {
      return c.type === 'cnpj' && medicos.every(function (d) { return c.doctorIds.indexOf(d.id) >= 0 })
    })
    return { medicos: medicos, convenios: convenios, todosNoMesmoCnpj: todosNoMesmoCnpj }
  }

  // Situação da conta em relação ao plano pago (null no teste grátis ou sem dados).
  function situacaoLimites() {
    const l = window.Assinatura.limites()
    const c = contagem()
    if (!l || !c) return null
    const limMed = l.medicos === null ? null : (l.medicosCnpj && c.todosNoMesmoCnpj ? Math.max(l.medicos, l.medicosCnpj) : l.medicos)
    const limConv = l.convenios
    return {
      limiteMedicos: limMed,
      limiteConvenios: limConv,
      medicos: c.medicos.length,
      convenios: c.convenios.length,
      medicosLiberados: limMed === null ? null : c.medicos.slice(0, limMed).map(function (d) { return d.id }),
      conveniosLiberados: limConv === null ? null : c.convenios.slice(0, limConv).map(function (o) { return o.id }),
      excedeu: (limMed !== null && c.medicos.length > limMed) || (limConv !== null && c.convenios.length > limConv)
    }
  }

  // Plano mais barato que cobre o que já está cadastrado.
  function planoQueCobre() {
    const c = contagem()
    if (!c) return null
    return Planos.lista.find(function (p) {
      const limMed = p.medicosCnpj && c.todosNoMesmoCnpj ? Math.max(p.medicos, p.medicosCnpj) : p.medicos
      return (p.medicos == null || c.medicos.length <= limMed) && (p.convenios == null || c.convenios.length <= p.convenios)
    }) || null
  }

  function textoExcesso(s) {
    const qtd = function (n, um, varios) { return n === null ? varios + ' sem limite' : n + ' ' + (n === 1 ? um : varios) }
    return 'Seu plano permite ' + qtd(s.limiteMedicos, 'médico', 'médicos') + ' e ' + qtd(s.limiteConvenios, 'convênio', 'convênios') +
      ', e você tem ' + qtd(s.medicos, 'médico', 'médicos') + ' e ' + qtd(s.convenios, 'convênio', 'convênios') +
      ' cadastrados. Escolha um plano maior ou remova os excedentes.'
  }

  window.Assinatura.situacaoLimites = situacaoLimites
  // Chamado ao salvar uma guia: médicos/convênios além do limite do plano ficam bloqueados.
  window.Assinatura.checarGuia = function (doctorId, operatorId) {
    const s = situacaoLimites()
    if (!s || !s.excedeu) return
    if (s.medicosLiberados && s.medicosLiberados.indexOf(doctorId) < 0) {
      throw new Error('Este médico passou do limite do plano. ' + textoExcesso(s))
    }
    if (s.conveniosLiberados && s.conveniosLiberados.indexOf(operatorId) < 0) {
      throw new Error('Este convênio passou do limite do plano. ' + textoExcesso(s))
    }
  }

  function quemPermite(l) {
    return l.plano && !l.personalizado ? 'O plano ' + l.plano.nome : 'A sua assinatura'
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
        ? '<div class="assinatura-item"><span>Serviço extra</span><strong>' + esc(Planos.FATURISTA.nome) + '</strong><small>' + esc(Planos.FATURISTA.descricao) +
          (Planos.limites(c) && Planos.limites(c).personalizado ? ' Liberado: ' + esc(Planos.limitesTexto(Planos.limites(c))) + '.' : '') + '</small></div>'
        : '') +
      contaHtml(c)
  }

  function pagamentoAutomatico() {
    return typeof PAGAMENTOS_URL !== 'undefined' && !!PAGAMENTOS_URL
  }

  function planosHtml() {
    const cobre = planoQueCobre()
    const c = contagem()
    const aviso = cobre && c && (c.medicos.length > 1 || c.convenios.length > 1)
      ? '<p class="assinatura-nota">Você tem ' + c.medicos.length + (c.medicos.length === 1 ? ' médico' : ' médicos') + ' e ' + c.convenios.length +
        (c.convenios.length === 1 ? ' convênio' : ' convênios') + ' cadastrados: o plano <strong>' + esc(cobre.nome) + '</strong> cobre tudo.</p>'
      : (c && !cobre ? '<p class="assinatura-nota">Você tem ' + c.medicos.length + ' médicos e ' + c.convenios.length + ' convênios cadastrados, mais do que o maior plano. Fale com a Remasol para um plano sob medida.</p>' : '')
    if (pagamentoAutomatico()) {
      return aviso + '<div class="assinatura-planos">' + Planos.lista.map(function (p) {
        return '<div class="assinatura-plano' + (cobre && cobre.id === p.id ? ' recomendado' : '') + '">' +
          (cobre && cobre.id === p.id ? '<em class="assinatura-selo">Cobre o seu cadastro</em>' : '') +
          '<strong>' + esc(p.nome) + '</strong><span>' + Planos.money(p.mensal) + '/mês</span><small>' + esc(Planos.limitesTexto(p)) + '</small>' +
          '<button type="button" class="btn solid btn-pagar" data-pagar="' + esc(p.id) + '" data-forma="mensal">Pagar 30 dias</button>' +
          '<button type="button" class="btn btn-pagar" data-pagar="' + esc(p.id) + '" data-forma="assinatura">Assinar no cartão</button>' +
          '</div>'
      }).join('') + '</div>' +
        '<p class="assinatura-nota"><strong>Pagar 30 dias:</strong> Pix, boleto ou cartão; cada pagamento libera mais 30 dias. ' +
        '<strong>Assinar no cartão:</strong> cobrança automática todo mês; cancele quando quiser no Mercado Pago. ' +
        'Use no Mercado Pago o mesmo e-mail da sua conta do Guias TISS.</p>' +
        '<p class="assinatura-erro" data-pagar-erro hidden></p>'
    }
    return aviso + '<div class="assinatura-planos">' + Planos.lista.map(function (p) {
      return '<a class="assinatura-plano' + (cobre && cobre.id === p.id ? ' recomendado' : '') + '" target="_blank" rel="noopener" href="' +
        esc(p.link || linkWhats('Olá! Quero assinar o Guias TISS no plano ' + p.nome + '.')) + '">' +
        '<strong>' + esc(p.nome) + '</strong><span>' + Planos.money(p.mensal) + '/mês</span><small>' + esc(Planos.limitesTexto(p)) + '</small></a>'
    }).join('') + '</div>'
  }

  // Botões "Pagar 30 dias" / "Assinar no cartão": pede o link ao Worker e abre o Mercado Pago.
  document.addEventListener('click', function (e) {
    const botao = e.target.closest && e.target.closest('[data-pagar]')
    if (!botao) return
    const caixa = botao.closest('.acesso-bloqueio__caixa') || document
    const erro = caixa.querySelector('[data-pagar-erro]')
    const botoes = caixa.querySelectorAll('[data-pagar]')
    const textoOriginal = botao.textContent
    botoes.forEach(function (b) { b.disabled = true })
    botao.textContent = 'Abrindo o Mercado Pago…'
    if (erro) erro.hidden = true
    obterAuth().then(function (auth) {
      if (!auth.currentUser) throw new Error('Entre na sua conta para pagar.')
      return auth.currentUser.getIdToken()
    }).then(function (idToken) {
      return fetch(PAGAMENTOS_URL.replace(/\/$/, '') + '/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken, plano: botao.dataset.pagar, forma: botao.dataset.forma })
      })
    }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (d) {
        if (!r.ok || !d.url) throw new Error(d.erro || 'Não foi possível abrir o pagamento. Tente de novo.')
        location.href = d.url
      })
    }).catch(function (err) {
      botoes.forEach(function (b) { b.disabled = false })
      botao.textContent = textoOriginal
      if (erro) { erro.hidden = false; erro.textContent = (err && err.message) || 'Não foi possível abrir o pagamento.'; erro.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    })
  })

  // Pago até quando (pagamento automático). null = ativação manual, sem vencimento.
  function pagoAte() {
    return cliente ? paraData(cliente.pagoAte) : null
  }

  function vencido() {
    const fim = pagoAte()
    if (!fim || !cliente || cliente.status !== 'ativo') return false
    const tolerancia = (typeof DIAS_TOLERANCIA === 'number' ? DIAS_TOLERANCIA : 3) * 86400000
    return Date.now() > fim.getTime() + tolerancia
  }

  function dataCurta(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
    if (cliente && cliente.status === 'ativo') {
      etiqueta = plano ? plano.nome : 'Assinatura ativa'
      if (pagoAte()) etiqueta += vencido() ? ' · venceu' : ' · até ' + dataCurta(pagoAte())
    }
    else etiqueta = dias === 0 ? 'Teste encerrado' : dias === 1 ? 'Teste: último dia' : 'Teste: ' + dias + ' dias restantes'

    const excesso = (function () { const x = situacaoLimites(); return x && x.excedeu ? x : null })()
    const faixa = document.createElement('div')
    faixa.className = 'conta-faixa'
    faixa.innerHTML =
      '<div>' + esc(user.email) + '</div>' +
      '<span class="conta-teste' + (cliente && cliente.status === 'ativo' ? ' ativo' : '') + '">' + esc(etiqueta) + '</span><br>' +
      (cliente && (plano || Planos.faturistaAtivo(cliente)) ? '<button type="button" data-ver>Minha assinatura</button> · ' : '') +
      (!(cliente && cliente.status === 'ativo') || (pagamentoAutomatico() && pagoAte() && cliente.formaPagamento !== 'assinatura') ? '<button type="button" data-planos>' + (cliente && cliente.status === 'ativo' ? 'Renovar' : 'Ver planos') + '</button> · ' : '') +
      '<button type="button" data-sair>Sair</button>' +
      (excesso ? '<p class="conta-excesso">' + esc(textoExcesso(excesso)) + ' <button type="button" data-planos-excesso>Ver planos</button></p>' : '')
    faixa.querySelector('[data-sair]').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
    const ver = faixa.querySelector('[data-ver]')
    if (ver) {
      ver.addEventListener('click', function () {
        const pagar = Planos.linkPagamento(cliente)
        janela('<h2>Minha assinatura</h2>' + resumoHtml(cliente) +
          (pagar && cliente.status !== 'ativo'
            ? '<a class="btn solid" target="_blank" rel="noopener" href="' + esc(pagar) + '">Pagar com Mercado Pago</a>'
            : '') +
          '<p>Para trocar de plano, fale com a Remasol: <a href="' + esc(linkWhats('Olá! Quero trocar o plano do Guias TISS.')) + '" target="_blank" rel="noopener">WhatsApp (21) 97666-3134</a>.</p>' +
          '<button type="button" class="btn" data-fechar>Fechar</button>')
      })
    }
    const abrirPlanos = function () {
      janela('<h2>Planos do Guias TISS</h2>' +
        '<p>' + (cliente && cliente.status === 'ativo' ? 'Escolha o plano que cobre o seu cadastro.' : 'Escolha o plano para continuar depois do período grátis. Seus dados continuam guardados.') + '</p>' +
        planosHtml() +
        '<p>Dúvidas: <a href="' + esc(linkWhats('Olá! Tenho uma dúvida sobre os planos do Guias TISS.')) + '" target="_blank" rel="noopener">WhatsApp (21) 97666-3134</a>.</p>' +
        '<button type="button" class="btn" data-fechar>Fechar</button>')
    }
    faixa.querySelectorAll('[data-planos], [data-planos-excesso]').forEach(function (b) { b.addEventListener('click', abrirPlanos) })
    sidebar.insertBefore(faixa, sidebar.querySelector('.sidebar-note'))
  }

  // ---------------------------------------------------------------------------
  // Bloqueio e boas-vindas
  // ---------------------------------------------------------------------------

  function bloquear(auth, motivo) {
    const suspenso = motivo === 'suspenso'
    const titulo = suspenso ? 'Assinatura suspensa' : motivo === 'vencido' ? 'Sua assinatura venceu' : 'Seu teste grátis terminou'
    const tela = janela(
      '<h2>' + titulo + '</h2>' +
      '<p>' + (suspenso
        ? 'Fale com a Remasol para reativar o acesso. Seus dados continuam guardados.'
        : 'Para continuar emitindo guias e gerando lotes XML, escolha um plano. Seus dados continuam guardados.') + '</p>' +
      (suspenso
        ? '<a class="btn solid" target="_blank" rel="noopener" href="' + esc(linkWhats('Olá! Quero reativar o meu Guias TISS.')) + '">Falar com a Remasol</a>'
        : (!pagamentoAutomatico() && Planos.linkPagamento(cliente) && cliente && cliente.linkPagamento
          ? '<a class="btn solid" target="_blank" rel="noopener" href="' + esc(cliente.linkPagamento) + '">Pagar com Mercado Pago</a>'
          : planosHtml())) +
      '<p><button type="button" class="entrar__link" data-sair>Sair da conta</button></p>', true)
    tela.querySelector('[data-sair]').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
    if (!suspenso) esperarPagamento()
  }

  // Volta do Mercado Pago com a tela bloqueada: confere o cadastro por 3 minutos e libera sozinho.
  function esperarPagamento() {
    if (!voltouDoPagamento || !pagamentoAutomatico()) return
    let tentativas = 0
    const timer = setInterval(function () {
      tentativas++
      obterDb().then(function (db) {
        return obterAuth().then(function (auth) { return docCliente(db, auth.currentUser.email).get() })
      }).then(function (snap) {
        const d = snap && snap.exists ? snap.data() : null
        const fim = d && paraData(d.pagoAte)
        if (d && d.status === 'ativo' && fim && fim.getTime() > Date.now()) { clearInterval(timer); location.reload() }
      }).catch(function () {})
      if (tentativas >= 18) clearInterval(timer)
    }, 10000)
  }

  // Caixa de aceite dos Termos de uso e da Política de privacidade.
  function aceiteHtml() {
    return '<label class="assinatura-aceite"><input type="checkbox" data-aceite> <span>Li e aceito os ' +
      '<a href="../termos.html" target="_blank" rel="noopener">Termos de uso</a> e a ' +
      '<a href="../privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>.</span></label>'
  }

  function dadosAceite() {
    return { termosVersao: TERMOS_VERSAO, termosAceitoEm: firebase.firestore.FieldValue.serverTimestamp() }
  }

  // Termos novos (ou cliente antigo que ainda não aceitou): pede o aceite antes de continuar.
  function novoAceite(db, auth, user) {
    return new Promise(function (resolve) {
      const tela = janela(
        '<h2>' + (cliente.termosVersao ? 'Atualizamos os termos de uso' : 'Termos de uso') + '</h2>' +
        '<p>Para continuar usando o Guias TISS, leia e aceite os termos. Eles explicam o que a plataforma faz, as responsabilidades de cada lado e como cuidamos dos dados.</p>' +
        aceiteHtml() +
        '<p class="assinatura-erro" hidden></p>' +
        '<button type="button" class="btn solid" data-ok>Aceitar e continuar</button>' +
        '<p><button type="button" class="entrar__link" data-sair>Sair da conta</button></p>', true)
      tela.querySelector('[data-sair]').addEventListener('click', function () { auth.signOut().then(irParaLogin) })
      tela.querySelector('[data-ok]').addEventListener('click', function (e) {
        const p = tela.querySelector('.assinatura-erro')
        if (!tela.querySelector('[data-aceite]').checked) {
          p.hidden = false
          p.textContent = 'Para continuar, marque que leu e aceita os termos.'
          return
        }
        e.target.disabled = true
        docCliente(db, user.email).update(dadosAceite())
          .then(function () { cliente.termosVersao = TERMOS_VERSAO; tela.remove(); resolve() })
          .catch(function (err) {
            // Não trava o cliente por um problema de configuração: segue e pede o aceite de novo na próxima entrada.
            console.warn('Guias TISS: aceite dos termos não foi gravado —', err && (err.code || err.message))
            tela.remove(); resolve()
          })
      })
    })
  }

  // Cliente cadastrado pela Remasol, entrando pela primeira vez: mostra o que foi combinado.
  function boasVindas(db, user) {
    return new Promise(function (resolve) {
      const tela = janela(
        '<h2>Olá, ' + esc(cliente.nome || user.displayName || '') + '!</h2>' +
        '<p>A Remasol já preparou a sua assinatura. Confira:</p>' + resumoHtml(cliente) +
        (cliente.status === 'teste' ? '<p class="assinatura-ok">Os primeiros dias são grátis.</p>' : '') +
        (Planos.linkPagamento(cliente)
          ? '<p>Para ativar a cobrança mensal, use o botão <strong>Pagar com Mercado Pago</strong> em "Minha assinatura", na barra lateral.</p>'
          : '') +
        aceiteHtml() +
        '<p class="assinatura-erro" hidden></p>' +
        '<button type="button" class="btn solid" data-ok>Confirmar e começar</button>', true)
      tela.querySelector('[data-ok]').addEventListener('click', function (e) {
        const p = tela.querySelector('.assinatura-erro')
        if (!tela.querySelector('[data-aceite]').checked) {
          p.hidden = false
          p.textContent = 'Para começar, marque que leu e aceita os termos.'
          return
        }
        e.target.disabled = true
        docCliente(db, user.email).update(Object.assign({ aceitoEm: firebase.firestore.FieldValue.serverTimestamp() }, dadosAceite()))
          .then(function () { cliente.termosVersao = TERMOS_VERSAO; tela.remove(); resolve() })
          .catch(function (err) {
            console.warn('Guias TISS: confirmação não foi gravada —', err && (err.code || err.message))
            tela.remove(); resolve()
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
      return comTempo(ref.get(), 8000).then(function (snap) {
        if (snap.exists) return { db: db, dados: snap.data() }
        const novo = {
          nome: user.displayName || '',
          email: user.email.toLowerCase(),
          status: 'teste',
          origem: 'site',
          criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          // aceite feito na caixa "Li e aceito" ao criar a conta (entrar.html)
          termosVersao: TERMOS_VERSAO,
          termosAceitoEm: firebase.firestore.FieldValue.serverTimestamp()
        }
        return comTempo(ref.set(novo), 8000).then(function () {
          avisarNovaConta()
          return { db: db, dados: novo }
        })
      })
    }).catch(function (err) {
      console.warn('Guias TISS: cadastro do cliente indisponível —', err && err.message)
      return { db: null, dados: null }
    })
  }

  // Avisa a Remasol por e-mail. Se falhar, nada muda para o cliente: a conta aparece no painel.
  function avisarNovaConta() {
    if (typeof AVISO_NOVA_CONTA_URL === 'undefined' || !AVISO_NOVA_CONTA_URL) return
    try {
      fetch(AVISO_NOVA_CONTA_URL, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: 'Guias TISS: nova conta criada',
          _captcha: 'false',
          mensagem: 'Uma nova conta foi criada no Guias TISS. Veja os dados no painel: https://guiaxmltiss.com.br/guias-tiss/admin.html'
        })
      }).catch(function () { /* o painel continua mostrando a conta */ })
    } catch (e) { /* idem */ }
  }

  // Volta do Mercado Pago (?pagamento=ok|pendente|erro|assinatura): avisa e limpa o endereço.
  const voltouDoPagamento = (new URLSearchParams(location.search).get('pagamento')) || ''
  if (voltouDoPagamento) {
    try { history.replaceState(null, '', location.pathname + location.hash) } catch (e) { /* ok */ }
  }
  function avisoPagamento() {
    const textos = {
      ok: ['Pagamento recebido!', 'Obrigada! A liberação acontece sozinha em instantes, assim que o Mercado Pago confirmar.'],
      assinatura: ['Assinatura feita!', 'Obrigada! A primeira cobrança no cartão libera o acesso em instantes. Os próximos meses são cobrados automaticamente.'],
      pendente: ['Pagamento em análise', 'Pix e boleto podem levar alguns minutos (boleto até 2 dias úteis). O acesso é liberado sozinho quando o pagamento for confirmado.'],
      erro: ['Pagamento não concluído', 'O pagamento não foi aprovado. Você pode tentar de novo em "Ver planos".']
    }
    const t = textos[voltouDoPagamento]
    if (!t || document.querySelector('.acesso-bloqueio')) return
    janela('<h2>' + esc(t[0]) + '</h2><p>' + esc(t[1]) + '</p><button type="button" class="btn solid" data-fechar>Fechar</button>')
  }

  // Rede de segurança: nunca deixa o app escondido por mais de 15 segundos.
  setTimeout(function () { raiz.classList.remove('acesso-carregando') }, 15000)

  obterAuth().then(function (auth) {
    auth.onAuthStateChanged(function (user) {
      if (!user || !user.emailVerified) return irParaLogin()
      carregarCliente(user).then(function (r) {
        cliente = r.dados
        const primeiraVez = cliente && cliente.origem !== 'site' && !cliente.aceitoEm
        if (primeiraVez && r.db) {
          raiz.classList.remove('acesso-carregando')
          return boasVindas(r.db, user)
        }
        if (cliente && r.db && cliente.termosVersao !== TERMOS_VERSAO) {
          raiz.classList.remove('acesso-carregando')
          return novoAceite(r.db, auth, user)
        }
      }).then(function () {
        raiz.classList.remove('acesso-carregando')
        const dias = diasRestantes(user)
        faixaConta(auth, user, dias)
        if (cliente && cliente.status === 'suspenso') return bloquear(auth, 'suspenso')
        if (vencido()) return bloquear(auth, 'vencido')
        if (cliente && cliente.status === 'ativo') return avisoPagamento()
        if (dias === 0) return bloquear(auth, 'teste')
        avisoPagamento()
      })
    })
  }).catch(function () {
    // Sem internet para conferir o login: libera a tela e avisa.
    raiz.classList.remove('acesso-carregando')
  })
})()
