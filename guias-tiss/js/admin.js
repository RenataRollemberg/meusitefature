// Painel da Remasol (admin.html): cadastro dos clientes do Guias TISS.
// Para cada médico/clínica você define o plano, a situação (período grátis, ativo, suspenso)
// e o serviço Faturista com o valor combinado. Quando o médico entrar, ele vê exatamente isso.
// Só entra quem estiver em ADMIN_EMAILS (js/firebase-config.js) com o e-mail confirmado;
// as regras do Firestore (firestore.rules) garantem isso também no servidor.
'use strict'

;(function () {
  const painel = document.getElementById('painel')
  const contaEl = document.getElementById('conta')
  let auth = null
  let db = null
  let clientes = []
  let filtro = ''

  const $ = function (s, r) { return (r || document).querySelector(s) }
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  let toastTimer = null
  function toast(texto, erro) {
    const el = document.getElementById('toast')
    el.textContent = texto
    el.className = 'toast show' + (erro ? ' error' : '')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.className = 'toast' }, erro ? 5000 : 2600)
  }

  function erroHtml(err) {
    return '<div class="alert error">' + esc(mensagemErro(err)) + '</div>'
  }

  function ehAdmin(user) {
    return !!(user && user.emailVerified && ADMIN_EMAILS.indexOf(String(user.email).toLowerCase()) >= 0)
  }

  function parseDinheiro(texto) {
    const limpo = String(texto || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
    return limpo ? Number(limpo) : NaN
  }

  function dinheiroCampo(v) {
    return v || v === 0 ? Number(v).toFixed(2).replace('.', ',') : ''
  }

  function dataCampo(valor) {
    const d = paraData(valor)
    if (!d) return ''
    const pad = function (n) { return String(n).padStart(2, '0') }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }

  function dataTexto(valor) {
    const d = paraData(valor)
    return d ? d.toLocaleDateString('pt-BR') : ''
  }

  function statusTag(c) {
    const s = c.status || 'teste'
    const label = (Planos.STATUS.find(function (x) { return x.value === s }) || { label: s }).label
    const cor = s === 'ativo' ? 'teal' : s === 'suspenso' ? 'red' : 'amber'
    return '<span class="tag ' + cor + '">' + esc(label) + '</span>'
  }

  // ---------------------------------------------------------------------------
  // Entrar
  // ---------------------------------------------------------------------------

  function telaLogin(aviso) {
    contaEl.innerHTML = ''
    painel.innerHTML =
      '<form class="card admin-login" id="f-login" novalidate>' +
      '<h1>Painel Remasol</h1><p class="muted">Entre com o e-mail da Remasol.</p>' +
      (aviso ? '<div class="alert warn">' + aviso + '</div>' : '') +
      '<div class="grid">' +
      '<label class="field c12">E-mail<input id="l-email" type="email" autocomplete="email"></label>' +
      '<label class="field c12">Senha<input id="l-senha" type="password" autocomplete="current-password"></label>' +
      '</div><div id="l-msg"></div>' +
      '<div class="form-actions"><button class="btn solid" type="submit">Entrar</button></div></form>'
    $('#f-login').addEventListener('submit', function (e) {
      e.preventDefault()
      const botao = e.target.querySelector('button')
      botao.disabled = true
      auth.signInWithEmailAndPassword($('#l-email').value.trim(), $('#l-senha').value)
        .catch(function (err) { $('#l-msg').innerHTML = erroHtml(err) })
        .finally(function () { botao.disabled = false })
    })
  }

  function semPermissao(user) {
    const naoConfirmado = ADMIN_EMAILS.indexOf(String(user.email).toLowerCase()) >= 0 && !user.emailVerified
    painel.innerHTML = '<div class="card admin-login"><h1>Sem acesso</h1>' +
      (naoConfirmado
        ? '<p>O e-mail ' + esc(user.email) + ' ainda não foi confirmado. Abra o link de confirmação que o Guias TISS enviou e entre de novo.</p>' +
          '<div class="form-actions"><button class="btn solid" id="reenviar">Reenviar confirmação</button><button class="btn" id="sair">Sair</button></div>'
        : '<p>A conta ' + esc(user.email) + ' não é de administração.</p><div class="form-actions"><button class="btn" id="sair">Sair</button></div>') +
      '<div id="l-msg"></div></div>'
    $('#sair').addEventListener('click', function () { auth.signOut() })
    if ($('#reenviar')) {
      $('#reenviar').addEventListener('click', function (e) {
        e.target.disabled = true
        user.sendEmailVerification().then(function () { toast('Link de confirmação enviado.') },
          function (err) { $('#l-msg').innerHTML = erroHtml(err) })
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Lista de clientes
  // ---------------------------------------------------------------------------

  function carregar() {
    painel.innerHTML = '<p class="muted">Carregando clientes…</p>'
    return comTempo(db.collection('clientes').get()).then(function (snap) {
      clientes = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()) })
      clientes.sort(function (a, b) { return (a.nome || a.id).localeCompare(b.nome || b.id, 'pt-BR') })
      telaLista()
    }).catch(function (err) {
      painel.innerHTML = erroHtml(err) + '<button class="btn" id="tentar">Tentar de novo</button>'
      $('#tentar').addEventListener('click', carregar)
    })
  }

  function telaLista() {
    const ativos = clientes.filter(function (c) { return c.status === 'ativo' })
    const receita = ativos.reduce(function (s, c) { return s + Planos.cobranca(c).total }, 0)
    const comFaturista = clientes.filter(Planos.faturistaAtivo).length
    const termo = filtro.trim().toLowerCase()
    const lista = clientes.filter(function (c) {
      return !termo || (c.nome || '').toLowerCase().indexOf(termo) >= 0 || c.id.indexOf(termo) >= 0
    })

    painel.innerHTML =
      '<div class="page-head"><div><h1>Clientes</h1><p class="sub">Plano, situação e serviço Faturista de cada médico ou clínica.</p></div>' +
      '<div class="actions"><button class="btn solid" id="novo">Cadastrar cliente</button></div></div>' +
      '<div class="admin-numeros">' +
      '<div class="card"><span class="label">Ativos</span><strong>' + ativos.length + '</strong></div>' +
      '<div class="card"><span class="label">Receita mensal (ativos)</span><strong>' + Planos.money(receita) + '</strong></div>' +
      '<div class="card"><span class="label">Em período grátis</span><strong>' + clientes.filter(function (c) { return (c.status || 'teste') === 'teste' }).length + '</strong></div>' +
      '<div class="card"><span class="label">Com Faturista</span><strong>' + comFaturista + '</strong></div>' +
      '</div>' +
      '<div class="filters"><label class="field">Buscar<input id="busca" placeholder="Nome ou e-mail" value="' + esc(filtro) + '"></label></div>' +
      '<div class="table-wrap">' + (lista.length
        ? '<table class="list"><thead><tr><th>Cliente</th><th>Plano</th><th>Faturista</th><th class="num">Total/mês</th><th>Situação</th><th>Confirmou</th><th></th></tr></thead><tbody>' +
          lista.map(function (c) {
            const plano = Planos.get(c.plano)
            const fat = Planos.faturistaAtivo(c)
            return '<tr><td><strong>' + esc(c.nome || '—') + '</strong><br><span class="mono muted">' + esc(c.id) + '</span></td>' +
              '<td>' + (plano ? esc(plano.nome) : '<span class="muted">—</span>') + '</td>' +
              '<td>' + (fat ? Planos.money(c.faturista.valor) + '<br><span class="muted">' + (c.faturista.incluiPlataforma ? 'inclui plataforma' : 'somado ao plano') + '</span>' : '<span class="muted">—</span>') + '</td>' +
              '<td class="num">' + Planos.money(Planos.cobranca(c).total) + '</td>' +
              '<td>' + statusTag(c) + (c.status === 'teste' && c.testeAte ? '<br><span class="muted">até ' + esc(dataTexto(c.testeAte)) + '</span>' : '') + '</td>' +
              '<td>' + (c.aceitoEm ? esc(dataTexto(c.aceitoEm)) : c.origem === 'site' ? '<span class="muted">criou sozinho</span>' : '<span class="muted">ainda não entrou</span>') + '</td>' +
              '<td><button class="btn small" data-editar="' + esc(c.id) + '">Editar</button></td></tr>'
          }).join('') + '</tbody></table>'
        : '<p class="empty">' + (clientes.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda. Clique em "Cadastrar cliente".') + '</p>') +
      '</div>'

    $('#novo').addEventListener('click', function () { telaForm(null) })
    $('#busca').addEventListener('input', function (e) {
      filtro = e.target.value
      const pos = e.target.selectionStart
      telaLista()
      const campo = $('#busca'); campo.focus(); campo.setSelectionRange(pos, pos)
    })
    $$('[data-editar]').forEach(function (b) {
      b.addEventListener('click', function () {
        telaForm(clientes.find(function (c) { return c.id === b.dataset.editar }))
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Formulário do cliente
  // ---------------------------------------------------------------------------

  function telaForm(c) {
    const novo = !c
    c = c || { status: 'ativo', faturista: { ativo: false, valor: '', incluiPlataforma: true } }
    const fat = c.faturista || { ativo: false, valor: '', incluiPlataforma: true }

    painel.innerHTML =
      '<div class="page-head"><div><h1>' + (novo ? 'Cadastrar cliente' : esc(c.nome || c.id)) + '</h1>' +
      '<p class="sub">' + (novo
        ? 'Use o mesmo e-mail com que o médico vai criar a conta. Quando ele entrar, verá o plano e o valor abaixo.'
        : 'Alterações valem na próxima vez que o cliente abrir o Guias TISS.') + '</p></div></div>' +
      '<form class="card" id="f" novalidate>' +
      '<div class="form-section">Cliente</div><div class="grid">' +
      '<label class="field c6">E-mail do médico <span class="req">*</span><input id="email" type="email" value="' + esc(novo ? '' : c.id) + '"' + (novo ? '' : ' disabled') + '>' +
      (novo ? '' : '<span class="hint">Para trocar o e-mail, cadastre de novo e exclua este.</span>') + '</label>' +
      '<label class="field c6">Nome (médico ou clínica)<input id="nome" maxlength="80" value="' + esc(c.nome) + '"></label>' +
      '</div>' +
      '<div class="form-section">Plano</div><div class="grid">' +
      '<label class="field c6">Plano<select id="plano"><option value="">— sem plano —</option>' +
      Planos.lista.map(function (p) {
        return '<option value="' + p.id + '"' + (c.plano === p.id ? ' selected' : '') + '>' + esc(p.nome + ' — ' + Planos.money(p.mensal) + ' — ' + Planos.limitesTexto(p)) + '</option>'
      }).join('') + '</select><span class="hint">Define os limites de médicos e convênios.</span></label>' +
      '<label class="field c3">Situação<select id="status">' + Planos.STATUS.map(function (s) {
        return '<option value="' + s.value + '"' + ((c.status || 'teste') === s.value ? ' selected' : '') + '>' + esc(s.label) + '</option>'
      }).join('') + '</select></label>' +
      '<label class="field c3" id="teste-wrap">Período grátis até<input id="testeAte" type="date" value="' + esc(dataCampo(c.testeAte)) + '"><span class="hint">Vazio = ' + DIAS_TESTE + ' dias da criação da conta</span></label>' +
      '</div>' +
      '<div class="form-section">Serviço ' + esc(Planos.FATURISTA.nome) + '</div>' +
      '<label class="check"><input type="checkbox" id="fat-ativo"' + (fat.ativo ? ' checked' : '') + '>Este cliente contratou o serviço ' + esc(Planos.FATURISTA.nome) + '</label>' +
      '<div class="grid" id="fat-campos" style="margin-top:12px">' +
      '<label class="field c4">Valor combinado por mês (R$) <span class="req">*</span><input id="fat-valor" class="code" inputmode="decimal" placeholder="830,00" value="' + esc(dinheiroCampo(fat.valor)) + '"></label>' +
      '<div class="field c8"><span>Como cobrar</span>' +
      '<label class="check"><input type="radio" name="fat-modo" value="inclui"' + (fat.incluiPlataforma !== false ? ' checked' : '') + '>O valor já inclui a plataforma (cobra só o Faturista)</label>' +
      '<label class="check"><input type="radio" name="fat-modo" value="soma"' + (fat.incluiPlataforma === false ? ' checked' : '') + '>Somar ao valor do plano</label></div>' +
      '</div>' +
      '<div class="form-section">Pagamento</div><div class="grid">' +
      '<label class="field c12">Link de assinatura do Mercado Pago (opcional)<input id="link" type="url" placeholder="https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=…" value="' + esc(c.linkPagamento) + '">' +
      '<span class="hint">Use para valores combinados (ex.: Faturista). Vazio = o cliente usa o link do plano.</span></label></div>' +
      '<div class="form-section">Observação (só você vê)</div>' +
      '<label class="field"><textarea id="obs" rows="2" maxlength="500">' + esc(c.observacao) + '</textarea></label>' +
      '<div class="admin-previa" id="previa"></div>' +
      '<div id="msg"></div><div class="form-actions"><button class="btn solid" type="submit">Salvar</button>' +
      '<button class="btn" type="button" id="voltar">Voltar</button>' +
      (novo ? '' : '<button class="btn danger" type="button" id="excluir">Excluir cadastro</button>') + '</div></form>'

    function ler() {
      const valorTexto = $('#fat-valor').value
      return {
        nome: $('#nome').value.trim(),
        plano: $('#plano').value || null,
        status: $('#status').value,
        testeAte: $('#testeAte').value,
        observacao: $('#obs').value.trim(),
        linkPagamento: $('#link').value.trim(),
        faturista: {
          ativo: $('#fat-ativo').checked,
          valor: parseDinheiro(valorTexto),
          valorTexto: valorTexto,
          incluiPlataforma: $('input[name="fat-modo"]:checked').value === 'inclui'
        }
      }
    }

    function atualizar() {
      const d = ler()
      $('#fat-campos').hidden = !d.faturista.ativo
      $('#teste-wrap').hidden = d.status !== 'teste'
      const previa = { plano: d.plano, faturista: Object.assign({}, d.faturista, { valor: Number.isNaN(d.faturista.valor) ? 0 : d.faturista.valor }) }
      const conta = Planos.cobranca(previa)
      $('#previa').innerHTML = '<span class="label">O cliente vai ver</span>' + (conta.linhas.length
        ? '<table><tbody>' + conta.linhas.map(function (l) { return '<tr><td>' + esc(l.texto) + '</td><td>' + Planos.money(l.valor) + '</td></tr>' }).join('') +
          '</tbody><tfoot><tr><td>Total por mês</td><td>' + Planos.money(conta.total) + '</td></tr></tfoot></table>'
        : '<p class="muted">Escolha um plano ou marque o serviço Faturista.</p>')
    }
    $('#f').addEventListener('input', atualizar)
    $('#f').addEventListener('change', atualizar)
    atualizar()

    $('#voltar').addEventListener('click', telaLista)

    $('#f').addEventListener('submit', function (e) {
      e.preventDefault()
      const msg = $('#msg')
      const d = ler()
      const email = novo ? $('#email').value.trim().toLowerCase() : c.id
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (msg.innerHTML = erroHtml({ message: 'Informe um e-mail válido.' }))
      if (novo && clientes.some(function (x) { return x.id === email })) return (msg.innerHTML = erroHtml({ message: 'Este e-mail já está cadastrado. Use "Editar" na lista.' }))
      if (d.faturista.ativo && (Number.isNaN(d.faturista.valor) || d.faturista.valor <= 0)) return (msg.innerHTML = erroHtml({ message: 'Informe o valor combinado do Faturista.' }))
      if (d.faturista.ativo && !d.faturista.incluiPlataforma && !d.plano) return (msg.innerHTML = erroHtml({ message: 'Para somar o Faturista ao plano, escolha um plano.' }))
      if (d.linkPagamento && !/^https:\/\/([a-z0-9-]+\.)*(mercadopago\.com\.br|mpago\.la|mpago\.li)\//i.test(d.linkPagamento)) return (msg.innerHTML = erroHtml({ message: 'O link de pagamento precisa ser do Mercado Pago (mercadopago.com.br ou mpago.la).' }))
      if (!d.plano && !d.faturista.ativo) return (msg.innerHTML = erroHtml({ message: 'Escolha um plano ou marque o serviço Faturista.' }))

      const dados = {
        email: email,
        nome: d.nome,
        plano: d.plano,
        status: d.status,
        testeAte: d.status === 'teste' && d.testeAte ? firebase.firestore.Timestamp.fromDate(new Date(d.testeAte + 'T23:59:59')) : null,
        observacao: d.observacao,
        linkPagamento: d.linkPagamento,
        faturista: d.faturista.ativo
          ? { ativo: true, valor: Math.round(d.faturista.valor * 100) / 100, incluiPlataforma: d.faturista.incluiPlataforma }
          : { ativo: false },
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      }
      if (novo) {
        dados.origem = 'remasol'
        dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp()
      }
      const botao = e.target.querySelector('button[type="submit"]')
      botao.disabled = true
      comTempo(docCliente(db, email).set(dados, { merge: true }))
        .then(function () { toast('Cliente salvo.'); return carregar() })
        .catch(function (err) { botao.disabled = false; msg.innerHTML = erroHtml(err) })
    })

    if (!novo) {
      $('#excluir').addEventListener('click', function () {
        if (!confirm('Excluir o cadastro de ' + (c.nome || c.id) + '? A conta de login do médico continua existindo; na próxima entrada ele volta ao período grátis.')) return
        docCliente(db, c.id).delete()
          .then(function () { toast('Cadastro excluído.'); return carregar() })
          .catch(function (err) { $('#msg').innerHTML = erroHtml(err) })
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------

  if (!loginAtivo()) {
    painel.innerHTML = '<div class="alert warn">O login do Guias TISS ainda não está configurado (js/firebase-config.js).</div>'
    return
  }

  obterDb().then(function (banco) {
    db = banco
    auth = firebase.auth()
    auth.onAuthStateChanged(function (user) {
      if (!user) return telaLogin()
      contaEl.innerHTML = '<span class="mono">' + esc(user.email) + '</span> <button class="link-btn" id="sair-topo">Sair</button>'
      $('#sair-topo').addEventListener('click', function () { auth.signOut() })
      if (!ehAdmin(user)) return semPermissao(user)
      carregar()
    })
  }).catch(function (err) { painel.innerHTML = erroHtml(err) })
})()
