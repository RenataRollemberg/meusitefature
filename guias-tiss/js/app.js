// Telas do Guias TISS. Cada seção é uma "página" desenhada dentro de <main id="app">,
// escolhida pelo endereço depois do # (ex.: #guias, #guia/nova/consulta, #lote/3).
'use strict'

;(function () {
  const app = document.getElementById('app')

  // ---------------------------------------------------------------------------
  // Utilidades de tela
  // ---------------------------------------------------------------------------

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function $(sel, root) {
    return (root || app).querySelector(sel)
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || app).querySelectorAll(sel))
  }

  function options(list, selected, placeholder) {
    const first = placeholder !== undefined ? '<option value="">' + esc(placeholder) + '</option>' : ''
    return first + list.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(selected) ? ' selected' : '') + '>' +
        esc(o.label) + '</option>'
    }).join('')
  }

  function operatorOptions(selected, placeholder) {
    return options(Repo.operators().map(function (o) { return { value: o.id, label: o.name } }), selected, placeholder)
  }

  let toastTimer = null
  function toast(message, isError) {
    const el = document.getElementById('toast')
    el.textContent = message
    el.className = 'toast show' + (isError ? ' error' : '')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.className = 'toast' }, isError ? 5000 : 2600)
  }

  function errorBox(err) {
    const details = err && err.details
    return '<div class="alert error" role="alert"><strong>' + esc(err.message || err) + '</strong>' +
      (details && details.length
        ? '<ul>' + details.map(function (d) { return '<li>' + esc(d) + '</li>' }).join('') + '</ul>'
        : '') + '</div>'
  }

  function showError(container, err) {
    container.innerHTML = errorBox(err)
    container.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function go(hash) {
    if (location.hash === hash) render()
    else location.hash = hash
  }

  function localDateTime(utc) {
    const d = new Date(String(utc).replace(' ', 'T') + 'Z')
    if (Number.isNaN(d.getTime())) return utc
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  // Baixa um texto como arquivo. latin1 = cada caractere vira um byte (XML ISO-8859-1).
  function download(fileName, text, type, latin1) {
    let data = text
    if (latin1) {
      data = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i++) data[i] = text.charCodeAt(i) & 0xff
    }
    const blob = new Blob([data], { type: type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
  }

  function guideTypeLabel(type) {
    return type === 'sadt' ? 'SP/SADT' : type === 'honorarios' ? 'Honorários' : 'Consulta'
  }

  // Campo de busca na TUSS: mostra até 30 resultados e chama onPick(codigo, nome).
  function attachTuss(input, onPick) {
    const box = document.createElement('div')
    box.className = 'tuss-results'
    box.hidden = true
    input.parentNode.classList.add('tuss')
    input.parentNode.appendChild(box)
    input.setAttribute('autocomplete', 'off')
    let timer = null
    input.addEventListener('input', function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        const found = Tuss.search(input.value, 30)
        if (!found.length) {
          box.hidden = true
          return
        }
        box.innerHTML = found.map(function (p) {
          return '<button type="button" data-code="' + esc(p.code) + '" data-name="' + esc(p.name) + '">' +
            '<span class="code mono">' + esc(p.code) + '</span><span>' + esc(p.name) + '</span></button>'
        }).join('')
        box.hidden = false
      }, 120)
    })
    box.addEventListener('click', function (e) {
      const b = e.target.closest('button')
      if (!b) return
      box.hidden = true
      input.value = ''
      onPick(b.dataset.code, b.dataset.name)
    })
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') box.hidden = true
    })
    document.addEventListener('click', function (e) {
      if (!input.parentNode.contains(e.target)) box.hidden = true
    })
  }

  function setNav(section) {
    $$('[data-nav]', document).forEach(function (a) {
      if (a.dataset.nav === section) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    })
  }

  function updateStorageNote() {
    const note = document.getElementById('storage-note')
    if (Db.storageOk()) {
      note.textContent = 'Dados gravados neste navegador'
      note.classList.remove('warn')
    } else {
      note.textContent = 'Atenção: este navegador não está gravando. Faça backup.'
      note.classList.add('warn')
    }
  }

  // ---------------------------------------------------------------------------
  // Roteamento
  // ---------------------------------------------------------------------------

  const routes = [
    [/^guias$/, 'guias', viewGuides],
    [/^guia\/nova\/(consulta|sadt|honorarios)$/, 'guias', function (m) { viewGuideForm(null, m[1]) }],
    [/^guia\/(\d+)$/, 'guias', function (m) { viewGuideForm(Number(m[1])) }],
    [/^lotes$/, 'lotes', viewLotes],
    [/^lote\/(\d+)$/, 'lotes', function (m) { viewLote(Number(m[1])) }],
    [/^beneficiarios$/, 'beneficiarios', viewPatients],
    [/^beneficiario\/(novo|\d+)$/, 'beneficiarios', function (m) { viewPatientForm(m[1] === 'novo' ? null : Number(m[1])) }],
    [/^convenios$/, 'convenios', viewOperators],
    [/^convenio\/(novo|\d+)$/, 'convenios', function (m) { viewOperatorForm(m[1] === 'novo' ? null : Number(m[1])) }],
    [/^prestador$/, 'prestador', viewDoctors],
    [/^prestador\/(novo|\d+)$/, 'prestador', function (m) { viewDoctorForm(m[1] === 'novo' ? null : Number(m[1])) }],
    [/^backup$/, 'backup', viewBackup]
  ]

  function render() {
    const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'guias'
    for (let i = 0; i < routes.length; i++) {
      const m = path.match(routes[i][0])
      if (m) {
        setNav(routes[i][1])
        routes[i][2](m)
        updateStorageNote()
        app.focus({ preventScroll: true })
        window.scrollTo(0, 0)
        return
      }
    }
    go('#guias')
  }

  window.addEventListener('hashchange', render)

  // ---------------------------------------------------------------------------
  // Guias
  // ---------------------------------------------------------------------------

  const guideFilter = { operatorId: '', doctorId: '', status: 'pending', guideType: '', query: '' }

  // Com um médico só, a tela de guias fica como sempre foi.
  function manyDoctors() {
    return Repo.doctors().length > 1
  }

  function doctorOptions(selected, placeholder) {
    return options(Repo.doctors().map(function (d) { return { value: d.id, label: d.professionalName || 'Médico sem nome' } }), selected, placeholder)
  }

  // A próxima guia já vem com o último médico usado.
  let lastDoctorId = null

  function firstSteps() {
    const s = Db.state.settings
    const steps = [
      { done: !!(s.professionalName && s.councilNumber && s.cbos), text: 'Preencha os dados do profissional em Prestador', href: '#prestador' },
      { done: Db.state.operators.length > 0, text: 'Cadastre ao menos um convênio', href: '#convenio/novo' },
      { done: Db.state.operators.some(function (o) { return o.prices.length > 0 }), text: 'Cadastre os valores que cada convênio paga (no cadastro do convênio)', href: '#convenios' },
      { done: Db.state.patients.length > 0, text: 'Cadastre um beneficiário (ou cadastre direto na guia)', href: '#beneficiario/novo' },
      { done: Db.state.guides.length > 0, text: 'Emita a primeira guia', href: '#guia/nova/consulta' }
    ]
    if (steps.every(function (x) { return x.done })) return ''
    return '<div class="card" style="margin-bottom:20px"><h2>Primeiros passos</h2><ol class="steps">' +
      steps.map(function (x) {
        return '<li class="' + (x.done ? 'done' : '') + '"><span class="dot">' + (x.done ? '✓' : '') + '</span>' +
          (x.done ? '<span>' + esc(x.text) + '</span>' : '<a href="' + x.href + '">' + esc(x.text) + '</a>') + '</li>'
      }).join('') + '</ol></div>'
  }

  function viewGuides() {
    const operatorId = guideFilter.operatorId ? Number(guideFilter.operatorId) : null
    const showDoctor = manyDoctors()
    const doctorId = showDoctor && guideFilter.doctorId ? Number(guideFilter.doctorId) : null
    const guides = Repo.guides({ operatorId: operatorId, doctorId: doctorId, status: guideFilter.status, guideType: guideFilter.guideType, query: guideFilter.query })
    const rows = guides.map(function (g) {
      const patient = Repo.patient(g.patientId)
      const operator = Repo.operator(g.operatorId)
      const lote = g.loteId ? Repo.lote(g.loteId) : null
      return '<tr>' +
        '<td>' + (g.loteId ? '' : '<input type="checkbox" data-select="' + g.id + '" aria-label="Selecionar guia ' + esc(g.providerGuideNumber) + '">') + '</td>' +
        '<td class="mono nowrap">' + esc(g.providerGuideNumber) + '</td>' +
        '<td><span class="tag' + (g.guideType === 'sadt' ? ' teal' : g.guideType === 'honorarios' ? ' amber' : '') + '">' + guideTypeLabel(g.guideType) + '</span></td>' +
        '<td class="nowrap">' + Fmt.date(g.serviceDate) + '</td>' +
        '<td>' + esc(patient ? patient.name : '—') + '</td>' +
        (showDoctor ? '<td>' + esc(Repo.doctorOf(g).professionalName) + '</td>' : '') +
        '<td>' + esc(operator ? operator.name : '—') + '</td>' +
        '<td class="num">' + Fmt.money(Calc.guideTotal(g)) + '</td>' +
        '<td>' + (lote ? '<a href="#lote/' + lote.id + '" class="tag gray">Lote ' + esc(lote.number) + '</a>' : '<span class="tag amber">Pendente</span>') + '</td>' +
        '<td class="row-actions">' +
        '<button class="link-btn" data-print="' + g.id + '">Imprimir</button>' +
        (g.loteId ? '' : '<a class="link-btn" href="#guia/' + g.id + '">Editar</a>' +
          '<button class="link-btn danger" data-delete="' + g.id + '">Excluir</button>') +
        '</td></tr>'
    }).join('')

    app.innerHTML =
      '<div class="page-head"><div><h1>Guias</h1><p class="sub">Emita as guias e junte as pendentes em um lote XML.</p></div>' +
      '<div class="actions"><a class="btn solid" href="#guia/nova/consulta">Nova guia de consulta</a>' +
      '<a class="btn" href="#guia/nova/sadt">Nova guia SP/SADT</a>' +
      '<a class="btn" href="#guia/nova/honorarios">Nova guia de honorários</a></div></div>' +
      firstSteps() +
      '<div class="filters">' +
      '<label class="field" style="flex:2 1 280px">Buscar<input id="f-query" type="search" placeholder="Nº da guia, beneficiário, CPF, carteirinha ou código…" value="' + esc(guideFilter.query) + '"></label>' +
      (showDoctor ? '<label class="field">Médico<select id="f-doctor">' + doctorOptions(guideFilter.doctorId, 'Todos') + '</select></label>' : '') +
      '<label class="field">Convênio<select id="f-operator">' + operatorOptions(guideFilter.operatorId, 'Todos') + '</select></label>' +
      '<label class="field">Situação<select id="f-status">' +
      options([{ value: 'pending', label: 'Pendentes (sem lote)' }, { value: 'batched', label: 'Em lote' }, { value: 'all', label: 'Todas' }], guideFilter.status) +
      '</select></label>' +
      '<label class="field">Tipo<select id="f-type">' +
      options([{ value: '', label: 'Todos' }, { value: 'consulta', label: 'Consulta' }, { value: 'sadt', label: 'SP/SADT' }, { value: 'honorarios', label: 'Honorários' }], guideFilter.guideType) +
      '</select></label></div>' +
      '<div id="selection"></div><div id="msg"></div>' +
      '<div class="table-wrap">' +
      (guides.length
        ? '<table class="list"><thead><tr><th><input type="checkbox" id="select-all" aria-label="Selecionar todas as pendentes"></th>' +
          '<th>Nº</th><th>Tipo</th><th>Data</th><th>Beneficiário</th>' + (showDoctor ? '<th>Médico</th>' : '') + '<th>Convênio</th><th class="num">Valor</th><th>Lote</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>'
        : '<p class="empty">' + (guideFilter.query
          ? 'Nenhuma guia encontrada para “' + esc(guideFilter.query) + '”' + (guideFilter.status !== 'all' ? ' nesta situação. <button class="link-btn" id="search-all">Buscar em todas</button>' : '.')
          : 'Nenhuma guia ' + (guideFilter.status === 'pending' ? 'pendente' : 'encontrada') + '.') + '</p>') +
      '</div>'

    let searchTimer = null
    $('#f-query').addEventListener('input', function (e) {
      clearTimeout(searchTimer)
      const value = e.target.value
      searchTimer = setTimeout(function () {
        guideFilter.query = value.trim()
        viewGuides()
        const input = $('#f-query')
        input.focus()
        input.setSelectionRange(input.value.length, input.value.length)
      }, 200)
    })
    if ($('#search-all')) {
      $('#search-all').addEventListener('click', function () { guideFilter.status = 'all'; viewGuides() })
    }
    if ($('#f-doctor')) $('#f-doctor').addEventListener('change', function (e) { guideFilter.doctorId = e.target.value; viewGuides() })
    $('#f-operator').addEventListener('change', function (e) { guideFilter.operatorId = e.target.value; viewGuides() })
    $('#f-status').addEventListener('change', function (e) { guideFilter.status = e.target.value; viewGuides() })
    $('#f-type').addEventListener('change', function (e) { guideFilter.guideType = e.target.value; viewGuides() })

    function selectedIds() {
      return $$('[data-select]').filter(function (c) { return c.checked }).map(function (c) { return Number(c.dataset.select) })
    }

    function updateSelection() {
      const ids = selectedIds()
      const bar = $('#selection')
      if (!ids.length) {
        bar.innerHTML = ''
        return
      }
      const total = ids.reduce(function (s, id) { return s + Calc.guideTotal(Repo.guide(id)) }, 0)
      bar.innerHTML = '<div class="selection-bar"><span><strong>' + ids.length + '</strong> guia(s) selecionada(s) · ' +
        Fmt.money(total) + '</span><button class="btn teal small" id="make-lote">Gerar lote XML</button></div>'
      $('#make-lote').addEventListener('click', function () {
        try {
          const lote = Repo.createLote(selectedIds())
          toast('Lote ' + lote.number + ' gerado.')
          go('#lote/' + lote.id)
        } catch (err) {
          showError($('#msg'), err)
        }
      })
    }

    $('.table-wrap').addEventListener('change', function (e) {
      if (!e.target.matches('[data-select], #select-all')) return
      if (e.target.id === 'select-all') $$('[data-select]').forEach(function (c) { c.checked = e.target.checked })
      updateSelection()
    })

    $$('[data-print]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { Impressao.print(Repo.guide(Number(b.dataset.print))) } catch (err) { toast(err.message, true) }
      })
    })
    $$('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () {
        const g = Repo.guide(Number(b.dataset.delete))
        if (!confirm('Excluir a guia ' + g.providerGuideNumber + '?')) return
        try {
          Repo.deleteGuide(g.id)
          toast('Guia excluída.')
          viewGuides()
        } catch (err) { toast(err.message, true) }
      })
    })
  }

  // ----- Formulário de guia (consulta e SP/SADT)

  const CONSULTATION_CODE = '10101012'

  function emptySadt() {
    return {
      mainGuideNumber: '', authorizationDate: '', password: '', passwordValidity: '',
      requester: {
        sameAsExecutor: true, contractorIdType: 'codigo', contractorId: '', contractorName: '',
        professionalName: '', councilCode: '06', councilNumber: '', councilUf: Db.state.settings.councilUf || '33', cbos: ''
      },
      requestDate: '', character: '1', clinicalIndication: '', specialCoverage: '',
      serviceType: '23', identifyExecutor: true, executorRole: '', procedures: [emptyItem()]
    }
  }

  function emptyItem() {
    return { date: '', startTime: '', endTime: '', tableCode: '22', code: '', description: '', quantity: 1, accessRoute: '', technique: '', factor: 1, unitValue: 0, role: '' }
  }

  // Outra despesa da SP/SADT (material, medicamento, taxa…).
  function emptyExpense(type) {
    const t = type || '03'
    const info = TISS.EXPENSE_TYPES.find(function (x) { return x.value === t })
    return { type: t, date: '', startTime: '', endTime: '', tableCode: info ? info.table : '19', code: '', description: '', quantity: 1, unit: '036', factor: 1, unitValue: 0, anvisa: '', manufacturerRef: '', operatingPermit: '' }
  }

  // Guia de honorários individuais (honorário do médico numa internação).
  function emptyHon() {
    const today = Fmt.today()
    return {
      requestGuideNumber: '', password: '',
      hospitalIdType: 'codigo', hospitalId: '', hospitalName: '', hospitalCnes: '',
      executorCode: '', startDate: today, endDate: today, issueDate: today,
      role: '00', procedures: [emptyItem()], team: [],
      expenses: [], sadtServiceType: '03', linkedSadtId: null
    }
  }

  // Outro profissional da equipe na guia de honorários (1º auxiliar, 2º auxiliar, anestesista…).
  function emptyMember(role) {
    return { role: role || '01', idType: 'cpf', id: '', name: '', councilCode: '06', councilNumber: '', councilUf: Db.state.settings.councilUf || '33', cbos: '' }
  }

  function memberHtml(m, i) {
    return '<div class="item" data-member="' + i + '">' +
      '<div class="item-head"><strong>PROFISSIONAL ' + (i + 2) + '</strong>' +
      '<button type="button" class="link-btn danger" data-remove-member="' + i + '">Remover</button></div>' +
      '<div class="grid">' +
      '<label class="field c4">Grau de participação <span class="req">*</span><select data-m="role">' + options(TISS.HONOR_PARTICIPATION, m.role) + '</select></label>' +
      '<label class="field c8">Nome do profissional <span class="req">*</span><input data-m="name" maxlength="70" value="' + esc(m.name) + '"></label>' +
      '<label class="field c3">Identificação<select data-m="idType">' + options([{ value: 'cpf', label: 'CPF' }, { value: 'codigo', label: 'Código no convênio' }], m.idType) + '</select></label>' +
      '<label class="field c3">CPF / código <span class="req">*</span><input class="code" data-m="id" maxlength="14" value="' + esc(m.id) + '"></label>' +
      '<label class="field c2">Conselho<select data-m="councilCode">' + options(TISS.COUNCILS, m.councilCode) + '</select></label>' +
      '<label class="field c2">Número <span class="req">*</span><input class="code" data-m="councilNumber" maxlength="15" value="' + esc(m.councilNumber) + '"></label>' +
      '<label class="field c2">UF<select data-m="councilUf">' + options(TISS.UFS, m.councilUf) + '</select></label>' +
      '<label class="field c12">CBO-S <span class="req">*</span><select data-m="cbos">' + options(TISS.CBOS.map(function (c) { return { value: c.value, label: c.value + ' — ' + c.label } }), m.cbos, 'Selecione…') + '</select></label>' +
      '</div></div>'
  }

  function readTeam() {
    return $$('[data-member]').map(function (el) {
      const get = function (k) { return $('[data-m="' + k + '"]', el).value }
      return {
        role: get('role'), idType: get('idType'), id: get('id').trim(), name: get('name').trim(),
        councilCode: get('councilCode'), councilNumber: get('councilNumber').trim(), councilUf: get('councilUf'), cbos: get('cbos')
      }
    })
  }

  function newGuide(type) {
    const ops = Repo.operators()
    const tuss = Tuss.find(CONSULTATION_CODE)
    const operatorId = ops.length === 1 ? ops[0].id : null
    const consulta = Repo.priceFor(operatorId, '22', CONSULTATION_CODE)
    return {
      guideType: type,
      doctorId: Repo.doctor(lastDoctorId) ? lastDoctorId : Repo.doctors()[0].id,
      sadt: type === 'sadt' ? emptySadt() : null,
      hon: type === 'honorarios' ? emptyHon() : null,
      operatorId: operatorId,
      patientId: null,
      providerGuideNumber: Repo.nextProviderGuideNumber(),
      operatorGuideNumber: '',
      cardNumber: '',
      newborn: false,
      serviceDate: Fmt.today(),
      consultationType: '1',
      accidentIndication: '9',
      serviceRegime: '01',
      procedure: {
        tableCode: '22',
        code: CONSULTATION_CODE,
        description: consulta && consulta.description ? consulta.description : tuss ? tuss.name : '',
        value: consulta ? consulta.value : 0
      },
      observation: ''
    }
  }

  // Na guia de honorários, cada item tem o seu grau de participação.
  let honorItems = false

  function itemHtml(p, i) {
    const total = Calc.sadtItemTotal({ quantity: p.quantity, unitValue: p.unitValue, factor: p.factor })
    const isHonItem = honorItems
    return '<div class="item" data-item="' + i + '">' +
      '<div class="item-head"><strong>ITEM ' + (i + 1) + '</strong>' +
      '<button type="button" class="link-btn danger" data-remove-item="' + i + '">Remover</button></div>' +
      '<div class="grid">' +
      '<label class="field c12">Buscar na TUSS<input data-tuss-item="' + i + '" placeholder="Código ou nome do procedimento…"></label>' +
      '<label class="field c2">Tabela<select data-k="tableCode">' + options(TISS.TABLES.map(function (t) { return { value: t.value, label: t.value } }), p.tableCode) + '</select></label>' +
      '<label class="field c3">Código <span class="req">*</span><input class="code" data-k="code" maxlength="10" value="' + esc(p.code) + '"></label>' +
      '<label class="field c7" style="grid-column:span 7">Descrição <span class="req">*</span><input data-k="description" maxlength="150" value="' + esc(p.description) + '"></label>' +
      '<label class="field c3">Data de execução<input type="date" data-k="date" value="' + esc(p.date) + '"><span class="hint">Vazio = data do atendimento</span></label>' +
      '<label class="field c2">Hora inicial<input type="time" data-k="startTime" value="' + esc(p.startTime) + '"></label>' +
      '<label class="field c2">Hora final<input type="time" data-k="endTime" value="' + esc(p.endTime) + '"></label>' +
      '<label class="field c2">Via de acesso<select data-k="accessRoute">' + options(TISS.SADT_ACCESS_ROUTES, p.accessRoute) + '</select></label>' +
      '<label class="field c3">Técnica<select data-k="technique">' + options(TISS.SADT_TECHNIQUES, p.technique) + '</select></label>' +
      (isHonItem
        ? '<label class="field c3">Grau de participação<select data-k="role">' + options([{ value: '', label: 'Igual ao da guia' }].concat(TISS.HONOR_PARTICIPATION), p.role || '') + '</select></label>'
        : '') +
      '<label class="field c2">Quantidade<input inputmode="numeric" data-k="quantity" value="' + esc(p.quantity) + '"></label>' +
      '<label class="field c2">Fator red./acrésc.<input inputmode="decimal" data-k="factor" value="' + esc(Fmt.number2(p.factor).replace(/\./g, '')) + '"></label>' +
      '<label class="field c3">Valor unitário (R$)<input inputmode="decimal" data-k="unitValue" value="' + esc(Fmt.moneyInput(p.unitValue)) + '"></label>' +
      '<div class="field c3" style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px">' +
      '<span class="hint">Total do item</span><strong data-item-total>' + Fmt.money(total) + '</strong></div>' +
      '<div class="c12" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px"><button type="button" class="btn small" data-save-item-value="' + i + '">Salvar valor no convênio</button>' +
      '<span class="hint" data-price-hint></span></div>' +
      '</div></div>'
  }

  function readItems() {
    return $$('[data-item]').map(function (el) {
      const get = function (k) { return $('[data-k="' + k + '"]', el).value }
      return {
        date: get('date'),
        startTime: get('startTime'),
        endTime: get('endTime'),
        tableCode: get('tableCode'),
        code: get('code').trim(),
        description: get('description').trim(),
        quantity: Math.round(Number(get('quantity').replace(/\D/g, '')) || 0),
        accessRoute: get('accessRoute'),
        technique: get('technique'),
        factor: Fmt.parseMoney(get('factor')),
        unitValue: Fmt.parseMoney(get('unitValue')),
        role: $('[data-k="role"]', el) ? get('role') : ''
      }
    })
  }

  function expenseHtml(e, i) {
    return '<div class="item" data-expense="' + i + '">' +
      '<div class="item-head"><strong>DESPESA ' + (i + 1) + '</strong>' +
      '<button type="button" class="link-btn danger" data-remove-expense="' + i + '">Remover</button></div>' +
      '<div class="grid">' +
      '<label class="field c4">Tipo <span class="req">*</span><select data-e="type">' + options(TISS.EXPENSE_TYPES, e.type) + '</select></label>' +
      '<label class="field c2">Tabela<select data-e="tableCode">' + options(TISS.TABLES.map(function (t) { return { value: t.value, label: t.value } }), e.tableCode) + '</select></label>' +
      '<label class="field c3">Código <span class="req">*</span><input class="code" data-e="code" maxlength="10" value="' + esc(e.code) + '"></label>' +
      '<label class="field c3">Data<input type="date" data-e="date" value="' + esc(e.date) + '"><span class="hint">Vazio = data do atendimento</span></label>' +
      '<label class="field c12">Descrição <span class="req">*</span><input data-e="description" maxlength="150" value="' + esc(e.description) + '" placeholder="Ex.: Luva cirúrgica estéril nº 7,5 / Dipirona 500 mg/ml"></label>' +
      '<label class="field c4">Unidade de medida <span class="req">*</span><select data-e="unit">' + options(TISS.EXPENSE_UNITS, e.unit) + '</select></label>' +
      '<label class="field c2">Quantidade<input inputmode="decimal" data-e="quantity" value="' + esc(String(e.quantity).replace('.', ',')) + '"></label>' +
      '<label class="field c2">Fator red./acrésc.<input inputmode="decimal" data-e="factor" value="' + esc(Fmt.number2(e.factor).replace(/\./g, '')) + '"></label>' +
      '<label class="field c2">Valor unitário (R$)<input inputmode="decimal" data-e="unitValue" value="' + esc(Fmt.moneyInput(e.unitValue)) + '"></label>' +
      '<div class="field c2" style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px">' +
      '<span class="hint">Total</span><strong data-expense-total>' + Fmt.money(Calc.expenseTotal(e)) + '</strong></div>' +
      '<label class="field c4">Registro ANVISA<input class="code" data-e="anvisa" maxlength="15" value="' + esc(e.anvisa) + '"></label>' +
      '<label class="field c4">Referência do fabricante<input data-e="manufacturerRef" maxlength="60" value="' + esc(e.manufacturerRef) + '"></label>' +
      '<label class="field c4">Autorização de funcionamento<input data-e="operatingPermit" maxlength="30" value="' + esc(e.operatingPermit) + '"></label>' +
      '</div></div>'
  }

  function readExpenses() {
    return $$('[data-expense]').map(function (el) {
      const get = function (k) { return $('[data-e="' + k + '"]', el).value }
      const q = String(get('quantity')).trim().replace(/\./g, '').replace(',', '.')
      return {
        type: get('type'),
        date: get('date'),
        startTime: '',
        endTime: '',
        tableCode: get('tableCode'),
        code: get('code').trim(),
        description: get('description').trim(),
        quantity: Number(q) || 0,
        unit: get('unit'),
        factor: Fmt.parseMoney(get('factor')),
        unitValue: Fmt.parseMoney(get('unitValue')),
        anvisa: get('anvisa').trim(),
        manufacturerRef: get('manufacturerRef').trim(),
        operatingPermit: get('operatingPermit').trim()
      }
    })
  }

  function viewGuideForm(id, type) {
    const editing = !!id
    const existing = editing ? Repo.guide(id) : null
    if (editing && !existing) return go('#guias')
    if (existing && existing.loteId !== null) {
      toast('Esta guia já está em um lote. Exclua o lote para alterá-la.', true)
      return go('#lote/' + existing.loteId)
    }
    const g = existing ? Db.clone(existing) : newGuide(type)
    const isSadt = g.guideType === 'sadt'
    const isHon = g.guideType === 'honorarios'
    const hasItems = isSadt || isHon
    honorItems = isHon
    const s = Db.state.settings
    const sadt = g.sadt
    if (isSadt && !sadt.expenses) sadt.expenses = []
    const hon = g.hon
    if (isHon && !hon.expenses) hon.expenses = []
    const linkedSadt = isHon && hon.linkedSadtId ? Repo.guide(hon.linkedSadtId) : null
    const patients = Repo.patients()
    const typeTitle = isSadt ? 'SP/SADT' : isHon ? 'de honorários individuais' : 'de consulta'

    const head =
      '<div class="page-head"><div><h1>' + (editing ? 'Editar guia ' : 'Nova guia ') + typeTitle + '</h1>' +
      (editing ? '<p class="sub mono">Nº ' + esc(g.providerGuideNumber) + '</p>' : '') + '</div></div>'

    const linkedNote = isSadt && g.linkedHonorId && Repo.guide(g.linkedHonorId)
      ? '<div class="alert warn">Esta SP/SADT foi gerada com as despesas da <a href="#guia/' + g.linkedHonorId + '">guia de honorários nº ' +
        esc(Repo.guide(g.linkedHonorId).providerGuideNumber) + '</a>. Altere as despesas por lá: ao salvar a guia de honorários, esta guia é refeita.</div>'
      : ''
    const noOps = Repo.operators().length === 0
      ? '<div class="alert warn">Nenhum convênio cadastrado. <a href="#convenio/novo">Cadastre um convênio</a> antes de emitir guias.</div>'
      : ''

    const ident =
      '<div class="form-section">Identificação</div><div class="grid">' +
      (manyDoctors()
        ? '<label class="field c12">Médico executante <span class="req">*</span><select id="g-doctor"' + (g.linkedHonorId ? ' disabled' : '') + '>' + doctorOptions(g.doctorId) + '</select></label>'
        : '') +
      '<label class="field c4">Convênio <span class="req">*</span><select id="g-operator">' + operatorOptions(g.operatorId, 'Selecione…') + '</select></label>' +
      '<label class="field c4">Nº da guia no prestador <span class="req">*</span><input class="code" id="g-number" maxlength="20" value="' + esc(g.providerGuideNumber) + '"></label>' +
      '<label class="field c4">Nº da guia no convênio<input class="code" id="g-opnumber" maxlength="20" value="' + esc(g.operatorGuideNumber) + '"></label>' +
      (isSadt
        ? '<label class="field c3">Nº da guia principal<input class="code" id="s-main" maxlength="20" value="' + esc(sadt.mainGuideNumber) + '"></label>' +
          '<label class="field c3">Data da autorização<input type="date" id="s-authdate" value="' + esc(sadt.authorizationDate) + '"></label>' +
          '<label class="field c3">Senha<input class="code" id="s-password" maxlength="20" value="' + esc(sadt.password) + '"></label>' +
          '<label class="field c3">Validade da senha<input type="date" id="s-passvalid" value="' + esc(sadt.passwordValidity) + '"></label>'
        : '') +
      (isHon
        ? '<label class="field c4">Nº da guia de solicitação de internação <span class="req">*</span><input class="code" id="h-request" maxlength="20" value="' + esc(hon.requestGuideNumber) + '"></label>' +
          '<label class="field c4">Senha<input class="code" id="h-password" maxlength="20" value="' + esc(hon.password) + '"></label>'
        : '') +
      '</div>'

    const benef =
      '<div class="form-section">Beneficiário</div><div class="grid">' +
      '<label class="field c4">Buscar<input id="g-psearch" placeholder="Nome ou CPF…"></label>' +
      '<label class="field c8">Beneficiário <span class="req">*</span><select id="g-patient"></select></label>' +
      '<div class="c12" id="quick-patient"><button type="button" class="link-btn" id="qp-open">+ Cadastrar novo beneficiário aqui</button></div>' +
      '<label class="field c6">Número da carteirinha <span class="req">*</span><input class="code" id="g-card" maxlength="20" value="' + esc(g.cardNumber) + '"><span class="hint" id="card-hint"></span></label>' +
      '<label class="check c6"><input type="checkbox" id="g-newborn"' + (g.newborn ? ' checked' : '') + '>Atendimento a recém-nascido (RN)</label>' +
      '</div>'

    let solicit = ''
    if (isHon) {
      solicit =
        '<div class="form-section">Hospital / local do atendimento</div><div class="grid">' +
        '<label class="field c3">Identificação<select id="h-hidtype">' + options([{ value: 'codigo', label: 'Código na operadora' }, { value: 'cnpj', label: 'CNPJ' }], hon.hospitalIdType) + '</select></label>' +
        '<label class="field c3">Código / CNPJ <span class="req">*</span><input class="code" id="h-hid" maxlength="18" value="' + esc(hon.hospitalId) + '"></label>' +
        '<label class="field c4">Nome do hospital <span class="req">*</span><input id="h-hname" maxlength="70" value="' + esc(hon.hospitalName) + '"></label>' +
        '<label class="field c2">CNES<input class="code" id="h-hcnes" maxlength="7" value="' + esc(hon.hospitalCnes) + '"></label>' +
        '</div>' +
        '<div class="form-section">Contratado executante (você)</div><div class="grid">' +
        '<label class="field c4">Seu código no convênio<input class="code" id="h-execcode" maxlength="14" value="' + esc(hon.executorCode) + '">' +
        '<span class="hint">Vazio = código do prestador cadastrado no convênio</span></label>' +
        '<div class="c8 hint" style="grid-column:span 8;align-self:end">Nome, conselho, CBO e CNES vêm do cadastro em <a href="#prestador">Prestador</a>.</div>' +
        '</div>' +
        '<div class="form-section">Internação</div><div class="grid">' +
        '<label class="field c4">Início do faturamento <span class="req">*</span><input type="date" id="h-start" value="' + esc(hon.startDate) + '"></label>' +
        '<label class="field c4">Fim do faturamento<input type="date" id="h-end" value="' + esc(hon.endDate) + '"></label>' +
        '<label class="field c4">Data de emissão da guia <span class="req">*</span><input type="date" id="h-issue" value="' + esc(hon.issueDate) + '"></label>' +
        '</div>'
    }
    if (isSadt) {
      const r = sadt.requester
      solicit =
        '<div class="form-section">Solicitante</div>' +
        '<label class="check"><input type="checkbox" id="r-same"' + (r.sameAsExecutor ? ' checked' : '') + '>Eu mesmo solicitei (usar os dados do Prestador)</label>' +
        '<div class="grid" id="r-fields"' + (r.sameAsExecutor ? ' hidden' : '') + ' style="margin-top:10px">' +
        '<label class="field c3">Identificação<select id="r-idtype">' + options([{ value: 'codigo', label: 'Código no convênio' }, { value: 'cpf', label: 'CPF' }, { value: 'cnpj', label: 'CNPJ' }], r.contractorIdType) + '</select></label>' +
        '<label class="field c3">Código / CPF / CNPJ <span class="req">*</span><input class="code" id="r-id" value="' + esc(r.contractorId) + '"></label>' +
        '<label class="field c6">Nome do contratado solicitante <span class="req">*</span><input id="r-cname" maxlength="70" value="' + esc(r.contractorName) + '"></label>' +
        '<label class="field c6">Nome do profissional solicitante<input id="r-pname" maxlength="70" value="' + esc(r.professionalName) + '"></label>' +
        '<label class="field c2">Conselho<select id="r-council">' + options(TISS.COUNCILS, r.councilCode) + '</select></label>' +
        '<label class="field c2">Número <span class="req">*</span><input class="code" id="r-cnumber" maxlength="15" value="' + esc(r.councilNumber) + '"></label>' +
        '<label class="field c2">UF<select id="r-uf">' + options(TISS.UFS, r.councilUf) + '</select></label>' +
        '<label class="field c12">CBO-S <span class="req">*</span><select id="r-cbos">' + options(TISS.CBOS.map(function (c) { return { value: c.value, label: c.value + ' — ' + c.label } }), r.cbos, 'Selecione…') + '</select></label>' +
        '</div>' +
        '<div class="grid" style="margin-top:12px">' +
        '<label class="field c3">Data da solicitação<input type="date" id="s-reqdate" value="' + esc(sadt.requestDate) + '"></label>' +
        '<label class="field c3">Caráter do atendimento<select id="s-character">' + options(TISS.SADT_CHARACTERS, sadt.character) + '</select></label>' +
        '<label class="field c6">Cobertura especial<select id="s-coverage">' + options(TISS.SADT_SPECIAL_COVERAGE, sadt.specialCoverage) + '</select></label>' +
        '<label class="field c12">Indicação clínica<textarea id="s-indication" maxlength="500">' + esc(sadt.clinicalIndication) + '</textarea></label>' +
        '</div>'
    }

    const atend = isHon ? '' :
      '<div class="form-section">Atendimento</div><div class="grid">' +
      '<label class="field c3">Data do atendimento <span class="req">*</span><input type="date" id="g-date" value="' + esc(g.serviceDate) + '"></label>' +
      (isSadt ? '<label class="field c3">Tipo de atendimento<select id="s-servicetype">' + options(TISS.SADT_SERVICE_TYPES, sadt.serviceType) + '</select></label>' : '') +
      '<label class="field c3" id="consult-type-wrap"' + (isSadt && sadt.serviceType !== '04' ? ' hidden' : '') + '>Tipo de consulta<select id="g-ctype">' + options(TISS.CONSULTATION_TYPES, g.consultationType) + '</select></label>' +
      '<label class="field c3">Indicação de acidente<select id="g-accident">' + options(TISS.ACCIDENT_INDICATIONS, g.accidentIndication) + '</select></label>' +
      '<label class="field c3">Regime de atendimento<select id="g-regime">' + options(TISS.SERVICE_REGIMES, g.serviceRegime) + '</select></label>' +
      '</div>'

    let procs
    if (isSadt) {
      procs =
        '<div class="form-section">Procedimentos executados</div>' +
        '<label class="check"><input type="checkbox" id="s-identify"' + (sadt.identifyExecutor ? ' checked' : '') + '>Identificar o médico executante em cada item (recomendado)</label>' +
        '<label class="field" style="max-width:320px;margin:6px 0 12px">Grau de participação<select id="s-role">' + options(TISS.SADT_PARTICIPATION, sadt.executorRole) + '</select></label>' +
        '<div class="items" id="items">' + sadt.procedures.map(itemHtml).join('') + '</div>' +
        '<button type="button" class="btn small" id="add-item" style="margin-top:12px">+ Adicionar procedimento</button>' +
        '<div class="total-line"><span class="muted">Total dos procedimentos</span><strong id="procs-total"></strong></div>' +
        '<div class="form-section">Outras despesas (materiais, medicamentos, taxas…)</div>' +
        '<p class="hint" style="margin:0 0 10px">Use para materiais, medicamentos, taxas, diárias, gases e OPME usados no atendimento. Elas vão no mesmo XML da guia (anexo de outras despesas).</p>' +
        '<div class="items" id="expenses">' + sadt.expenses.map(expenseHtml).join('') + '</div>' +
        '<button type="button" class="btn small" id="add-expense" style="margin-top:12px">+ Adicionar despesa</button>' +
        '<div class="total-line"><span class="muted">Total das outras despesas</span><strong id="expenses-total"></strong></div>' +
        '<div class="total-line"><span class="muted">Total geral da guia</span><strong id="sadt-total"></strong></div>'
    } else if (isHon) {
      procs =
        '<div class="form-section">Procedimentos realizados</div>' +
        '<label class="field" style="max-width:320px;margin:0 0 12px">Seu grau de participação (padrão da guia)<select id="h-role">' + options(TISS.HONOR_PARTICIPATION, hon.role) + '</select></label>' +
        '<div class="items" id="items">' + hon.procedures.map(itemHtml).join('') + '</div>' +
        '<button type="button" class="btn small" id="add-item" style="margin-top:12px">+ Adicionar procedimento</button>' +
        '<div class="total-line"><span class="muted">Total de honorários</span><strong id="sadt-total"></strong></div>' +
        '<div class="form-section">Equipe — outros profissionais</div>' +
        '<p class="hint" style="margin:0 0 10px">O profissional 1 é você (dados de <a href="#prestador">Prestador</a>). Inclua aqui o 1º auxiliar, 2º auxiliar, anestesista etc. Eles entram em todos os procedimentos da guia.</p>' +
        '<div class="items" id="team">' + (hon.team || []).map(memberHtml).join('') + '</div>' +
        '<button type="button" class="btn small" id="add-member" style="margin-top:12px">+ Adicionar profissional</button>' +
        '<div class="form-section">Outras despesas do especialista (materiais, medicamentos…)</div>' +
        '<p class="hint" style="margin:0 0 10px">O Padrão TISS não aceita outras despesas dentro da guia de honorários. Ao salvar, as despesas abaixo viram uma ' +
        '<strong>guia SP/SADT vinculada</strong> (com a guia de solicitação de internação como guia principal), que vai num lote de SP/SADT.' +
        (linkedSadt ? ' Guia vinculada atual: <a href="#guia/' + linkedSadt.id + '" class="mono">SP/SADT nº ' + esc(linkedSadt.providerGuideNumber) + '</a>' +
          (linkedSadt.loteId !== null ? ' (já em lote)' : '') + '.' : '') + '</p>' +
        '<label class="field" style="max-width:360px;margin:0 0 12px">Tipo de atendimento da SP/SADT<select id="h-sadttype">' + options(TISS.SADT_SERVICE_TYPES, hon.sadtServiceType || '03') + '</select></label>' +
        '<div class="items" id="expenses">' + hon.expenses.map(expenseHtml).join('') + '</div>' +
        '<button type="button" class="btn small" id="add-expense" style="margin-top:12px">+ Adicionar despesa</button>' +
        '<div class="total-line"><span class="muted">Total das outras despesas (vai na SP/SADT)</span><strong id="expenses-total"></strong></div>'
    } else {
      procs =
        '<div class="form-section">Procedimento</div><div class="grid">' +
        '<label class="field c12">Da tabela de valores do convênio<select id="p-catalog"></select></label>' +
        '<label class="field c12">Buscar na TUSS<input id="p-tuss" placeholder="Código ou nome do procedimento…"></label>' +
        '<label class="field c3">Tabela<select id="p-table">' + options(TISS.TABLES, g.procedure.tableCode) + '</select></label>' +
        '<label class="field c3">Código <span class="req">*</span><input class="code" id="p-code" maxlength="10" value="' + esc(g.procedure.code) + '"></label>' +
        '<label class="field c6">Descrição<input id="p-desc" maxlength="150" value="' + esc(g.procedure.description) + '"></label>' +
        '<label class="field c3">Valor (R$)<input inputmode="decimal" id="p-value" value="' + esc(Fmt.moneyInput(g.procedure.value)) + '"></label>' +
        '<div class="c9" style="grid-column:span 9;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px"><button type="button" class="btn small" id="p-savevalue">Salvar valor no convênio</button>' +
        '<span class="hint" id="p-pricehint"></span></div>' +
        '<div class="c12" id="tuss-warn"></div>' +
        '</div>'
    }

    const obs =
      '<div class="form-section">Observação</div>' +
      '<label class="field">Observação / justificativa<textarea id="g-obs" maxlength="500">' + esc(g.observation) + '</textarea></label>'

    app.innerHTML = head + linkedNote + noOps +
      '<form class="card" id="guide-form" novalidate>' + ident + benef + solicit + atend + procs + obs +
      '<div id="form-msg"></div>' +
      '<div class="form-actions"><button class="btn solid" type="submit" data-print-after="1">Salvar e imprimir</button>' +
      '<button class="btn" type="submit">Salvar</button>' +
      '<a class="btn danger" href="#guias">Cancelar</a></div></form>'

    // --- beneficiário: busca, seleção e cadastro rápido
    function fillPatients(query, selected) {
      const q = Fmt.normalize(query || '')
      const list = patients.filter(function (p) {
        return !q || Fmt.normalize(p.name).includes(q) || p.cpf.includes(q) || p.id === selected
      })
      $('#g-patient').innerHTML = options(list.map(function (p) {
        return { value: p.id, label: p.name + (p.cpf ? ' — ' + p.cpf : '') }
      }), selected || '', 'Selecione…')
    }
    fillPatients('', g.patientId)
    $('#g-psearch').addEventListener('input', function (e) {
      fillPatients(e.target.value, Number($('#g-patient').value) || null)
      const btn = $('#qp-open')
      if (btn) {
        const t = e.target.value.trim()
        const none = t && $('#g-patient').options.length <= 1
        btn.textContent = none ? '+ Não encontrado — cadastrar “' + t + '”' : '+ Cadastrar novo beneficiário aqui'
      }
      // Se a busca deixou um único beneficiário, ele já fica escolhido.
      const opts = $('#g-patient').options
      if (opts.length === 2 && !$('#g-patient').value) {
        $('#g-patient').value = opts[1].value
        onPatientChosen(Number(opts[1].value))
      }
    })

    // A carteirinha vem do cadastro do beneficiário (vinculada). Numa guia nova, o convênio também.
    function onPatientChosen(patientId) {
      if (!patientId) return
      const p = Repo.patient(patientId)
      const last = Repo.lastGuideForPatient(patientId)
      if (!editing) {
        const opId = (p && p.insuranceOperatorId) || (last && last.operatorId) || null
        if (opId && String(opId) !== $('#g-operator').value) {
          $('#g-operator').value = String(opId)
          applyOperatorPrice()
        }
      }
      if (!p) return
      const sameOp = !p.insuranceOperatorId || p.insuranceOperatorId === currentOperatorId()
      const card = (sameOp && p.insuranceCardNumber) || (last && last.operatorId === currentOperatorId() && last.cardNumber) || ''
      if (card) $('#g-card').value = card
      updateCardHint()
    }
    $('#g-patient').addEventListener('change', function (e) { onPatientChosen(Number(e.target.value) || null) })

    // Mostra se a carteirinha da guia é diferente da que está no cadastro do beneficiário.
    function updateCardHint() {
      const p = Repo.patient(Number($('#g-patient').value) || null)
      const hint = $('#card-hint')
      hint.innerHTML = ''
      if (!p || !p.insuranceCardNumber) return
      if (p.insuranceOperatorId && p.insuranceOperatorId !== currentOperatorId()) return
      if ($('#g-card').value.trim() === p.insuranceCardNumber) {
        hint.textContent = '✓ Igual ao cadastro do beneficiário.'
        return
      }
      hint.innerHTML = '⚠ No cadastro está <span class="mono">' + esc(p.insuranceCardNumber) + '</span>. ' +
        '<button type="button" class="link-btn" id="use-card">Usar a do cadastro</button>'
      $('#use-card').addEventListener('click', function () {
        $('#g-card').value = p.insuranceCardNumber
        updateCardHint()
      })
    }
    $('#g-card').addEventListener('input', updateCardHint)
    $('#g-operator').addEventListener('change', updateCardHint)

    $('#qp-open').addEventListener('click', function () {
      // O que foi digitado na busca já vai para o cadastro: números viram CPF, o resto é o nome.
      const typed = $('#g-psearch').value.trim()
      const isCpf = /^[\d.\-\s]+$/.test(typed)
      $('#quick-patient').innerHTML =
        '<div class="grid" style="padding:12px;border:1px dashed var(--line-strong);border-radius:6px">' +
        '<label class="field c6">Nome <span class="req">*</span><input id="qp-name" value="' + esc(isCpf ? '' : typed) + '"></label>' +
        '<label class="field c3">CPF<input id="qp-cpf" inputmode="numeric" value="' + esc(isCpf ? typed : '') + '"></label>' +
        '<div class="c3" style="display:flex;align-items:flex-end"><button type="button" class="btn small" id="qp-save">Cadastrar</button></div></div>'
      const nameInput = $('#qp-name')
      nameInput.focus()
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length)
      $('#qp-save').addEventListener('click', function () {
        try {
          const opId = Number($('#g-operator').value) || null
          const p = Repo.savePatient(null, {
            name: $('#qp-name').value, cpf: $('#qp-cpf').value, birthDate: '', phone: '',
            insuranceOperatorId: opId, insuranceCardNumber: $('#g-card').value, notes: ''
          })
          patients.push(p)
          patients.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR') })
          $('#g-psearch').value = ''
          fillPatients('', p.id)
          $('#quick-patient').innerHTML = '<span class="hint">Beneficiário cadastrado e selecionado.</span>'
          updateCardHint()
        } catch (err) { toast(err.message, true) }
      })
    })

    // --- convênio: cada convênio tem o seu valor. Ao trocar o convênio, o valor da guia passa a
    // ser o da tabela dele; se ele não tiver valor para o procedimento, o campo fica vazio e a
    // guia avisa — nunca usa o valor de outro convênio.
    function currentOperatorId() {
      return Number($('#g-operator').value) || null
    }

    function priceHint(opId, tableCode, code, typed) {
      if (!code) return ''
      if (!opId) return 'Escolha o convênio para usar a tabela de valores dele.'
      const op = Repo.operator(opId)
      const own = Repo.priceFor(opId, tableCode, code)
      if (!own) return '⚠ ' + op.name + ' não tem valor cadastrado para ' + code + '. Digite o valor e clique em “Salvar valor no convênio”.'
      if (typed !== null && !Number.isNaN(typed) && Calc.round2(typed) !== own.value) {
        return '⚠ Diferente da tabela de ' + op.name + ' (' + Fmt.money(own.value) + ').'
      }
      return '✓ Valor da tabela de ' + op.name + '.'
    }

    function applyOperatorPrice() {
      const opId = currentOperatorId()
      if (hasItems) {
        $$('[data-item]').forEach(function (el) {
          const code = $('[data-k="code"]', el).value.trim()
          if (!code) return
          const own = Repo.priceFor(opId, $('[data-k="tableCode"]', el).value, code)
          $('[data-k="unitValue"]', el).value = own ? Fmt.moneyInput(own.value) : ''
        })
        updateTotals()
      } else {
        fillCatalog()
        const own = Repo.priceFor(opId, $('#p-table').value, $('#p-code').value)
        $('#p-value').value = own ? Fmt.moneyInput(own.value) : ''
        updateConsultaHint()
      }
    }
    $('#g-operator').addEventListener('change', applyOperatorPrice)

    // --- procedimento da consulta
    function fillCatalog() {
      if (hasItems) return
      const opId = currentOperatorId()
      const op = opId ? Repo.operator(opId) : null
      const sel = $('#p-catalog')
      if (!op) {
        sel.innerHTML = '<option value="">Escolha o convênio primeiro</option>'
      } else if (!op.prices.length) {
        sel.innerHTML = '<option value="">' + esc(op.name) + ' ainda não tem valores (cadastre em Convênios)</option>'
      } else {
        sel.innerHTML = options(op.prices.map(function (p, i) {
          return { value: i, label: p.code + ' — ' + (p.description || '') + ' — ' + Fmt.money(p.value) }
        }), '', 'Escolher…')
      }
    }

    function updateConsultaHint() {
      if (hasItems) return
      const typed = $('#p-value').value.trim() ? Fmt.parseMoney($('#p-value').value) : null
      $('#p-pricehint').textContent = priceHint(currentOperatorId(), $('#p-table').value, $('#p-code').value.trim(), typed)
    }

    if (!hasItems) {
      fillCatalog()
      $('#p-catalog').addEventListener('change', function (e) {
        const op = Repo.operator(currentOperatorId())
        const p = op && e.target.value !== '' ? op.prices[Number(e.target.value)] : null
        if (!p) return
        $('#p-table').value = p.tableCode
        $('#p-code').value = p.code
        $('#p-desc').value = p.description
        $('#p-value').value = Fmt.moneyInput(p.value)
        checkTuss()
        updateConsultaHint()
      })
      attachTuss($('#p-tuss'), function (code, name) {
        const own = Repo.priceFor(currentOperatorId(), '22', code)
        $('#p-table').value = '22'
        $('#p-code').value = code
        $('#p-desc').value = (own && own.description ? own.description : name).slice(0, 150)
        $('#p-value').value = own ? Fmt.moneyInput(own.value) : ''
        checkTuss()
        updateConsultaHint()
        $('#p-value').focus()
      })
      // Avisa quando um código da tabela 22 não existe na TUSS vigente (causa comum de glosa).
      const checkTuss = function () {
        const code = $('#p-code').value.trim()
        const warn = $('#tuss-warn')
        warn.innerHTML = $('#p-table').value === '22' && code.length >= 8 && !Tuss.find(code)
          ? '<div class="alert warn">O código ' + esc(code) + ' não está na TUSS 22 vigente (' + esc(Fmt.date(Tuss.publishedAt)) + '). Confira para evitar glosa.</div>'
          : ''
      }
      $('#p-code').addEventListener('input', function () { checkTuss(); updateConsultaHint() })
      $('#p-table').addEventListener('change', function () { checkTuss(); updateConsultaHint() })
      $('#p-value').addEventListener('input', updateConsultaHint)
      checkTuss()
      updateConsultaHint()
      $('#p-savevalue').addEventListener('click', function () {
        try {
          const value = Fmt.parseMoney($('#p-value').value)
          if (!$('#p-value').value.trim() || Number.isNaN(value)) throw new Error('Digite o valor antes de salvar.')
          const op = Repo.savePrice(currentOperatorId(), { tableCode: $('#p-table').value, code: $('#p-code').value, description: $('#p-desc').value, value: value })
          fillCatalog()
          updateConsultaHint()
          toast('Valor salvo na tabela de ' + op.name + '.')
        } catch (err) { toast(err.message, true) }
      })
    }

    // --- SP/SADT: solicitante, itens e totais
    function updateTotals() {
      if (!hasItems) return
      const items = readItems()
      const opId = currentOperatorId()
      $$('[data-item]').forEach(function (el, i) {
        const it = items[i]
        $('[data-item-total]', el).textContent = Fmt.money(Calc.sadtItemTotal(it))
        const typed = $('[data-k="unitValue"]', el).value.trim() ? it.unitValue : null
        $('[data-price-hint]', el).textContent = priceHint(opId, it.tableCode, it.code, typed)
      })
      const expenses = readExpenses()
      if (isHon) {
        $('#sadt-total').textContent = Fmt.money(Calc.honorTotal({ procedures: items }))
        $$('[data-expense]').forEach(function (el, i) {
          $('[data-expense-total]', el).textContent = Fmt.money(Calc.expenseTotal(expenses[i]))
        })
        $('#expenses-total').textContent = Fmt.money(Calc.expensesTotal({ expenses: expenses }))
        return
      }
      $$('[data-expense]').forEach(function (el, i) {
        $('[data-expense-total]', el).textContent = Fmt.money(Calc.expenseTotal(expenses[i]))
      })
      const all = { procedures: items, expenses: expenses }
      $('#procs-total').textContent = Fmt.money(Calc.sadtProceduresTotal(all))
      $('#expenses-total').textContent = Fmt.money(Calc.expensesTotal(all))
      $('#sadt-total').textContent = Fmt.money(Calc.sadtGuideTotal(all))
    }

    function bindItems() {
      $$('[data-tuss-item]').forEach(function (input) {
        attachTuss(input, function (code, name) {
          const el = input.closest('[data-item]')
          const own = Repo.priceFor(currentOperatorId(), '22', code)
          $('[data-k="tableCode"]', el).value = '22'
          $('[data-k="code"]', el).value = code
          $('[data-k="description"]', el).value = (own && own.description ? own.description : name).slice(0, 150)
          $('[data-k="unitValue"]', el).value = own ? Fmt.moneyInput(own.value) : ''
          updateTotals()
          $('[data-k="unitValue"]', el).focus()
        })
      })
    }

    function redrawItems(items) {
      $('#items').innerHTML = items.map(itemHtml).join('')
      bindItems()
      updateTotals()
    }

    if (isSadt) {
      $('#r-same').addEventListener('change', function (e) { $('#r-fields').hidden = e.target.checked })
      $('#s-servicetype').addEventListener('change', function (e) { $('#consult-type-wrap').hidden = e.target.value !== '04' })
    }
    if (isSadt || isHon) {
      // Outras despesas: adicionar, remover, tabela sugerida pelo tipo e totais.
      const redrawExpenses = function (list) {
        $('#expenses').innerHTML = list.map(expenseHtml).join('')
        updateTotals()
      }
      $('#add-expense').addEventListener('click', function () {
        const list = readExpenses()
        list.push(emptyExpense(list.length ? list[list.length - 1].type : '03'))
        redrawExpenses(list)
      })
      $('#expenses').addEventListener('click', function (e) {
        const rm = e.target.closest('[data-remove-expense]')
        if (!rm) return
        const list = readExpenses()
        list.splice(Number(rm.dataset.removeExpense), 1)
        redrawExpenses(list)
      })
      $('#expenses').addEventListener('change', function (e) {
        if (e.target.dataset.e === 'type') {
          const info = TISS.EXPENSE_TYPES.find(function (x) { return x.value === e.target.value })
          if (info) $('[data-e="tableCode"]', e.target.closest('[data-expense]')).value = info.table
        }
        updateTotals()
      })
      $('#expenses').addEventListener('input', updateTotals)
    }
    if (isHon) {
      // Equipe: o próximo profissional sugere o grau seguinte (1º auxiliar → 2º auxiliar…).
      const redrawTeam = function (list) { $('#team').innerHTML = list.map(memberHtml).join('') }
      $('#add-member').addEventListener('click', function () {
        const list = readTeam()
        const last = list.length ? Number(list[list.length - 1].role) : 0
        const next = last >= 1 && last < 4 ? String(last + 1).padStart(2, '0') : '01'
        list.push(emptyMember(list.length ? next : '01'))
        redrawTeam(list)
        const fields = $$('[data-member]')
        $('[data-m="name"]', fields[fields.length - 1]).focus()
      })
      $('#team').addEventListener('click', function (e) {
        const rm = e.target.closest('[data-remove-member]')
        if (!rm) return
        const list = readTeam()
        list.splice(Number(rm.dataset.removeMember), 1)
        redrawTeam(list)
      })
    }
    if (hasItems) {
      $('#add-item').addEventListener('click', function () {
        const items = readItems()
        items.push(emptyItem())
        redrawItems(items)
      })
      $('#items').addEventListener('click', function (e) {
        const rm = e.target.closest('[data-remove-item]')
        if (rm) {
          const items = readItems()
          if (items.length === 1) return toast('A guia precisa de ao menos um procedimento.', true)
          items.splice(Number(rm.dataset.removeItem), 1)
          redrawItems(items)
          return
        }
        const sv = e.target.closest('[data-save-item-value]')
        if (sv) {
          const item = readItems()[Number(sv.dataset.saveItemValue)]
          try {
            if (Number.isNaN(item.unitValue)) throw new Error('Valor inválido.')
            const op = Repo.savePrice(currentOperatorId(), { tableCode: item.tableCode, code: item.code, description: item.description, value: item.unitValue })
            updateTotals()
            toast('Valor salvo na tabela de ' + op.name + '.')
          } catch (err) { toast(err.message, true) }
        }
      })
      $('#items').addEventListener('input', updateTotals)
      $('#items').addEventListener('change', updateTotals)
      bindItems()
      updateTotals()
    }

    updateCardHint()

    // --- salvar
    $('#guide-form').addEventListener('submit', function (e) {
      e.preventDefault()
      const andPrint = !!(e.submitter && e.submitter.dataset.printAfter)
      const msg = $('#form-msg')
      try {
        const val = function (sel, fallback) { const el = $(sel); return el ? el.value : fallback }
        const input = {
          guideType: isSadt ? 'sadt' : isHon ? 'honorarios' : 'consulta',
          doctorId: $('#g-doctor') ? Number($('#g-doctor').value) : g.doctorId,
          operatorId: Number($('#g-operator').value) || null,
          patientId: Number($('#g-patient').value) || null,
          providerGuideNumber: $('#g-number').value,
          operatorGuideNumber: $('#g-opnumber').value.trim(),
          cardNumber: $('#g-card').value,
          newborn: $('#g-newborn').checked,
          serviceDate: isHon ? $('#h-issue').value : $('#g-date').value,
          consultationType: val('#g-ctype', g.consultationType),
          accidentIndication: val('#g-accident', g.accidentIndication),
          serviceRegime: isHon ? '03' : val('#g-regime', g.serviceRegime),
          observation: $('#g-obs').value.trim(),
          linkedHonorId: g.linkedHonorId || null,
          sadt: null,
          procedure: null
        }
        if (!input.serviceDate) throw new Error(isHon ? 'Informe a data de emissão da guia.' : 'Informe a data do atendimento.')
        if (isHon) {
          const items = readItems()
          items.forEach(function (p, i) {
            if (!p.code) throw new Error('Item ' + (i + 1) + ': informe o código do procedimento.')
            if (!p.description) throw new Error('Item ' + (i + 1) + ': informe a descrição.')
            if (Number.isNaN(p.unitValue) || Number.isNaN(p.factor)) throw new Error('Item ' + (i + 1) + ': valor ou fator inválido.')
          })
          if (!$('#h-start').value) throw new Error('Informe a data de início do faturamento.')
          input.hon = {
            requestGuideNumber: $('#h-request').value.trim(),
            password: $('#h-password').value.trim(),
            hospitalIdType: $('#h-hidtype').value,
            hospitalId: $('#h-hid').value.trim(),
            hospitalName: $('#h-hname').value.trim(),
            hospitalCnes: $('#h-hcnes').value.trim(),
            executorCode: $('#h-execcode').value.trim(),
            startDate: $('#h-start').value,
            endDate: $('#h-end').value,
            issueDate: $('#h-issue').value,
            role: $('#h-role').value,
            procedures: items,
            team: readTeam(),
            expenses: readExpenses(),
            sadtServiceType: $('#h-sadttype').value,
            linkedSadtId: hon.linkedSadtId || null
          }
          input.hon.expenses.forEach(function (x, i) {
            if (!x.code) throw new Error('Despesa ' + (i + 1) + ': informe o código.')
            if (!x.description) throw new Error('Despesa ' + (i + 1) + ': informe a descrição.')
            if (!(x.quantity > 0)) throw new Error('Despesa ' + (i + 1) + ': quantidade inválida.')
            if (Number.isNaN(x.unitValue) || Number.isNaN(x.factor)) throw new Error('Despesa ' + (i + 1) + ': valor ou fator inválido.')
          })
          input.hon.team.forEach(function (m, i) {
            const n = 'Profissional ' + (i + 2)
            if (!m.name) throw new Error(n + ': informe o nome.')
            if (!m.id) throw new Error(n + ': informe o CPF ou o código no convênio.')
            if (m.idType === 'cpf' && m.id.replace(/\D/g, '').length !== 11) throw new Error(n + ': o CPF deve ter 11 dígitos.')
            if (!m.councilNumber) throw new Error(n + ': informe o número no conselho.')
            if (!m.cbos) throw new Error(n + ': escolha o CBO-S.')
          })
          input.procedure = { tableCode: '', code: '', description: '', value: 0 }
        } else if (isSadt) {
          const items = readItems()
          items.forEach(function (p, i) {
            if (!p.code) throw new Error('Item ' + (i + 1) + ': informe o código do procedimento.')
            if (!p.description) throw new Error('Item ' + (i + 1) + ': informe a descrição.')
            if (Number.isNaN(p.unitValue) || Number.isNaN(p.factor)) throw new Error('Item ' + (i + 1) + ': valor ou fator inválido.')
          })
          input.sadt = {
            mainGuideNumber: $('#s-main').value.trim(),
            authorizationDate: $('#s-authdate').value,
            password: $('#s-password').value.trim(),
            passwordValidity: $('#s-passvalid').value,
            requester: {
              sameAsExecutor: $('#r-same').checked,
              contractorIdType: $('#r-idtype').value,
              contractorId: $('#r-id').value.trim(),
              contractorName: $('#r-cname').value.trim(),
              professionalName: $('#r-pname').value.trim(),
              councilCode: $('#r-council').value,
              councilNumber: $('#r-cnumber').value.trim(),
              councilUf: $('#r-uf').value,
              cbos: $('#r-cbos').value
            },
            requestDate: $('#s-reqdate').value,
            character: $('#s-character').value,
            clinicalIndication: $('#s-indication').value.trim(),
            specialCoverage: $('#s-coverage').value,
            serviceType: $('#s-servicetype').value,
            identifyExecutor: $('#s-identify').checked,
            executorRole: $('#s-role').value,
            procedures: items,
            expenses: readExpenses()
          }
          input.sadt.expenses.forEach(function (x, i) {
            if (!x.code) throw new Error('Despesa ' + (i + 1) + ': informe o código.')
            if (!x.description) throw new Error('Despesa ' + (i + 1) + ': informe a descrição.')
            if (!(x.quantity > 0)) throw new Error('Despesa ' + (i + 1) + ': quantidade inválida.')
            if (Number.isNaN(x.unitValue) || Number.isNaN(x.factor)) throw new Error('Despesa ' + (i + 1) + ': valor ou fator inválido.')
          })
          input.procedure = { tableCode: '', code: '', description: '', value: 0 }
        } else {
          const value = Fmt.parseMoney($('#p-value').value)
          if (Number.isNaN(value) || value < 0) throw new Error('Valor do procedimento inválido.')
          if (!$('#p-code').value.trim()) throw new Error('Informe o código do procedimento.')
          input.procedure = {
            tableCode: $('#p-table').value,
            code: $('#p-code').value.trim(),
            description: $('#p-desc').value.trim(),
            value: value
          }
        }
        if (isHon) Repo.checkHonorExpenses(id)
        const saved = Repo.saveGuide(id, input)
        const linkedSaved = isHon ? Repo.syncHonorExpenses(saved) : null
        lastDoctorId = saved.doctorId
        toast('Guia ' + saved.providerGuideNumber + ' salva.' +
          (linkedSaved ? ' Despesas na SP/SADT nº ' + linkedSaved.providerGuideNumber + '.' : ''))
        if (andPrint) {
          try { Impressao.print(saved) } catch (err) { toast(err.message, true) }
        }
        go('#guias')
      } catch (err) {
        showError(msg, err)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Lotes
  // ---------------------------------------------------------------------------

  function viewLotes() {
    const lotes = Repo.lotes()
    const rows = lotes.map(function (l) {
      const op = Repo.operator(l.operatorId)
      const sum = Repo.loteSummary(l)
      const first = Repo.loteGuides(l.id)[0]
      return '<tr><td class="mono nowrap"><a href="#lote/' + l.id + '">' + esc(l.number) + '</a></td>' +
        '<td>' + esc(op ? op.name : '—') + '</td>' +
        '<td>' + (first ? guideTypeLabel(first.guideType) : '—') + '</td>' +
        '<td class="num">' + sum.guideCount + '</td>' +
        '<td class="num">' + Fmt.money(sum.totalValue) + '</td>' +
        '<td class="nowrap">' + esc(localDateTime(l.createdAt)) + '</td>' +
        '<td>' + (l.status === 'enviado' ? '<span class="tag teal">Enviado</span>' : '<span class="tag">Gerado</span>') + '</td>' +
        '<td class="row-actions"><button class="link-btn" data-xml="' + l.id + '">Baixar XML</button>' +
        '<a class="link-btn" href="#lote/' + l.id + '">Abrir</a></td></tr>'
    }).join('')
    app.innerHTML =
      '<div class="page-head"><div><h1>Lotes XML</h1><p class="sub">Para gerar um lote, marque as guias pendentes em Guias.</p></div>' +
      '<div class="actions"><a class="btn solid" href="#guias">Selecionar guias</a></div></div>' +
      '<div class="table-wrap">' +
      (lotes.length
        ? '<table class="list"><thead><tr><th>Lote</th><th>Convênio</th><th>Tipo</th><th class="num">Guias</th><th class="num">Total</th><th>Gerado em</th><th>Situação</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="empty">Nenhum lote gerado ainda.</p>') + '</div>'
    $$('[data-xml]').forEach(function (b) {
      b.addEventListener('click', function () { downloadLote(Repo.lote(Number(b.dataset.xml))) })
    })
  }

  function downloadLote(lote) {
    const r = Repo.loteXml(lote)
    download(r.fileName, r.xml, 'application/xml', true)
    toast('XML ' + r.fileName + ' baixado.')
  }

  function viewLote(id) {
    const lote = Repo.lote(id)
    if (!lote) return go('#lotes')
    const op = Repo.operator(lote.operatorId)
    const guides = Repo.loteGuides(id)
    const sum = Repo.loteSummary(lote)
    const r = Repo.loteXml(lote)
    const changed = lote.hash && lote.hash !== r.hash
    app.innerHTML =
      '<div class="page-head"><div><h1>Lote ' + esc(lote.number) + '</h1><p class="sub">' + esc(op.name) + ' · ' +
      sum.guideCount + ' guia(s) · ' + Fmt.money(sum.totalValue) + ' · gerado em ' + esc(localDateTime(lote.createdAt)) + '</p></div>' +
      '<div class="actions"><button class="btn solid" id="dl">Baixar XML</button>' +
      '<button class="btn" id="status">' + (lote.status === 'enviado' ? 'Marcar como não enviado' : 'Marcar como enviado') + '</button>' +
      '<button class="btn danger" id="del">Excluir lote</button></div></div>' +
      (changed ? '<div class="alert warn">Os dados do prestador ou do convênio mudaram depois que este lote foi gerado, então o XML de agora tem outro hash. Se o lote já foi enviado, confira antes de reenviar.</div>' : '') +
      '<div class="card"><h2>Arquivo</h2><p class="mono" style="margin-top:6px;word-break:break-all">' + esc(r.fileName) + '</p>' +
      '<p class="muted" style="margin-top:4px">Padrão TISS ' + esc(op.tissVersion) + ' · hash ' + '<span class="mono">' + esc(r.hash) + '</span></p>' +
      '<details style="margin-top:10px"><summary>Ver conteúdo do XML</summary><pre class="xml">' + esc(r.xml) + '</pre></details></div>' +
      '<div class="card"><h2>Guias do lote</h2><div class="table-wrap" style="margin-top:12px"><table class="list"><thead><tr><th>Nº</th><th>Data</th><th>Beneficiário</th>' + (manyDoctors() ? '<th>Médico</th>' : '') + '<th>Carteirinha</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
      guides.map(function (g) {
        const p = Repo.patient(g.patientId)
        return '<tr><td class="mono">' + esc(g.providerGuideNumber) + '</td><td class="nowrap">' + Fmt.date(g.serviceDate) + '</td>' +
          '<td>' + esc(p ? p.name : '—') + '</td>' + (manyDoctors() ? '<td>' + esc(Repo.doctorOf(g).professionalName) + '</td>' : '') + '<td class="mono">' + esc(g.cardNumber) + '</td>' +
          '<td class="num">' + Fmt.money(Calc.guideTotal(g)) + '</td>' +
          '<td class="row-actions"><button class="link-btn" data-print="' + g.id + '">Imprimir</button></td></tr>'
      }).join('') + '</tbody></table></div></div>'

    $('#dl').addEventListener('click', function () { downloadLote(lote) })
    $('#status').addEventListener('click', function () {
      Repo.setLoteStatus(id, lote.status === 'enviado' ? 'gerado' : 'enviado')
      viewLote(id)
    })
    $('#del').addEventListener('click', function () {
      if (!confirm('Excluir o lote ' + lote.number + '? As guias voltam a ficar pendentes. O número do lote não será reutilizado.')) return
      Repo.deleteLote(id)
      toast('Lote excluído. As guias voltaram para pendentes.')
      go('#lotes')
    })
    $$('[data-print]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { Impressao.print(Repo.guide(Number(b.dataset.print))) } catch (err) { toast(err.message, true) }
      })
    })
  }

  // ---------------------------------------------------------------------------
  // Beneficiários
  // ---------------------------------------------------------------------------

  function viewPatients() {
    app.innerHTML =
      '<div class="page-head"><div><h1>Beneficiários</h1><p class="sub">Pacientes com o cartão do convênio, para preencher as guias sozinho.</p></div>' +
      '<div class="actions"><a class="btn solid" href="#beneficiario/novo">Novo beneficiário</a></div></div>' +
      '<div class="filters"><label class="field" style="flex:1;max-width:420px">Buscar<input id="q" placeholder="Nome, CPF ou carteirinha…"></label></div>' +
      '<div class="table-wrap" id="list"></div>'
    function draw(q) {
      const nq = Fmt.normalize(q)
      const list = Repo.patients().filter(function (p) {
        return !nq || Fmt.normalize(p.name).includes(nq) || p.cpf.includes(q) || p.insuranceCardNumber.includes(q)
      })
      $('#list').innerHTML = list.length
        ? '<table class="list"><thead><tr><th>Nome</th><th>CPF</th><th>Convênio</th><th>Carteirinha</th><th class="num">Guias</th><th></th></tr></thead><tbody>' +
          list.map(function (p) {
            const op = p.insuranceOperatorId ? Repo.operator(p.insuranceOperatorId) : null
            const n = Db.state.guides.filter(function (g) { return g.patientId === p.id }).length
            return '<tr><td>' + esc(p.name) + '</td><td class="mono nowrap">' + esc(p.cpf) + '</td><td>' + esc(op ? op.name : '—') + '</td>' +
              '<td class="mono">' + esc(p.insuranceCardNumber) + '</td><td class="num">' + n + '</td>' +
              '<td class="row-actions"><a class="link-btn" href="#beneficiario/' + p.id + '">Editar</a></td></tr>'
          }).join('') + '</tbody></table>'
        : '<p class="empty">Nenhum beneficiário' + (q ? ' encontrado' : ' cadastrado') + '.</p>'
    }
    draw('')
    $('#q').addEventListener('input', function (e) { draw(e.target.value.trim()) })
  }

  function viewPatientForm(id) {
    const p = id ? Repo.patient(id) : { name: '', cpf: '', birthDate: '', phone: '', insuranceOperatorId: null, insuranceCardNumber: '', notes: '' }
    if (!p) return go('#beneficiarios')
    app.innerHTML =
      '<div class="page-head"><h1>' + (id ? 'Editar beneficiário' : 'Novo beneficiário') + '</h1></div>' +
      '<form class="card" id="f" novalidate><div class="grid">' +
      '<label class="field c8">Nome <span class="req">*</span><input id="name" value="' + esc(p.name) + '" autofocus></label>' +
      '<label class="field c4">CPF<input id="cpf" inputmode="numeric" value="' + esc(p.cpf) + '"></label>' +
      '<label class="field c4">Nascimento<input type="date" id="birth" value="' + esc(p.birthDate) + '"></label>' +
      '<label class="field c4">Telefone<input id="phone" inputmode="tel" value="' + esc(p.phone) + '"></label>' +
      '</div><div class="form-section">Cartão do convênio</div><div class="grid">' +
      '<label class="field c6">Convênio<select id="op">' + operatorOptions(p.insuranceOperatorId, 'Particular / não informado') + '</select></label>' +
      '<label class="field c6">Número da carteirinha<input class="code" id="card" maxlength="20" value="' + esc(p.insuranceCardNumber) + '"><span class="hint">Ao trocar, as guias pendentes (sem lote) deste convênio são atualizadas.</span></label>' +
      '<label class="field c12">Observações<textarea id="notes">' + esc(p.notes) + '</textarea></label>' +
      '</div><div id="msg"></div><div class="form-actions"><button class="btn solid" type="submit">Salvar</button>' +
      '<a class="btn" href="#beneficiarios">Cancelar</a>' +
      (id ? '<button type="button" class="btn danger" id="del">Excluir</button>' : '') + '</div></form>'
    $('#f').addEventListener('submit', function (e) {
      e.preventDefault()
      try {
        const saved = Repo.savePatient(id, {
          name: $('#name').value, cpf: $('#cpf').value, birthDate: $('#birth').value, phone: $('#phone').value,
          insuranceOperatorId: Number($('#op').value) || null, insuranceCardNumber: $('#card').value, notes: $('#notes').value
        })
        toast(saved.updatedGuides
          ? 'Beneficiário salvo. Carteirinha atualizada em ' + saved.updatedGuides + ' guia(s) pendente(s).'
          : 'Beneficiário salvo.')
        go('#beneficiarios')
      } catch (err) { showError($('#msg'), err) }
    })
    if (id) {
      $('#del').addEventListener('click', function () {
        if (!confirm('Excluir ' + p.name + '?')) return
        try { Repo.deletePatient(id); toast('Beneficiário excluído.'); go('#beneficiarios') } catch (err) { showError($('#msg'), err) }
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Convênios
  // ---------------------------------------------------------------------------

  const ID_TYPES = [
    { value: 'codigo', label: 'Código do prestador no convênio' },
    { value: 'cpf', label: 'CPF do prestador' },
    { value: 'cnpj', label: 'CNPJ do prestador' }
  ]

  function viewOperators() {
    const ops = Repo.operators()
    app.innerHTML =
      '<div class="page-head"><div><h1>Convênios</h1><p class="sub">Operadoras para as quais você envia guias.</p></div>' +
      '<div class="actions"><a class="btn solid" href="#convenio/novo">Novo convênio</a></div></div>' +
      '<div class="table-wrap">' +
      (ops.length
        ? '<table class="list"><thead><tr><th>Nome</th><th>Registro ANS</th><th>Identificação</th><th>Versão TISS</th><th class="num">Valores</th><th class="num">Último lote</th><th></th></tr></thead><tbody>' +
          ops.map(function (o) {
            return '<tr><td>' + esc(o.name) + '</td><td class="mono">' + esc(o.ansRegistry) + '</td>' +
              '<td>' + esc(TISS.label(ID_TYPES, o.contractorIdType)) + (o.contractorIdType === 'codigo' ? ' <span class="mono muted">' + esc(o.providerCode) + '</span>' : '') + '</td>' +
              '<td class="mono">' + esc(o.tissVersion) + '</td>' +
              '<td class="num">' + (o.prices.length ? o.prices.length + ' proced.' : '<span class="tag amber">sem valores</span>') + '</td>' +
              '<td class="num mono">' + esc(o.lastLoteNumber) + '</td>' +
              '<td class="row-actions"><a class="link-btn" href="#convenio/' + o.id + '">Editar</a></td></tr>'
          }).join('') + '</tbody></table>'
        : '<p class="empty">Nenhum convênio cadastrado.</p>') + '</div>'
  }

  function viewOperatorForm(id) {
    const o = id ? Repo.operator(id) : { name: '', ansRegistry: '', providerCode: '', tissVersion: TISS.DEFAULT_VERSION, lastLoteNumber: 0, allowDuplicateGuideNumbers: false, contractorIdType: 'codigo', prices: [] }
    if (!o) return go('#convenios')
    const tableOptions = TISS.TABLES.map(function (t) { return { value: t.value, label: t.value } })
    function priceRow(p) {
      return '<tr data-price-row>' +
        '<td style="width:90px"><select data-pk="tableCode" aria-label="Tabela">' + options(tableOptions, p.tableCode) + '</select></td>' +
        '<td style="width:140px"><input class="code" data-pk="code" maxlength="10" aria-label="Código" value="' + esc(p.code) + '"></td>' +
        '<td><input data-pk="description" maxlength="150" aria-label="Descrição" value="' + esc(p.description) + '"></td>' +
        '<td style="width:150px"><input inputmode="decimal" data-pk="value" aria-label="Valor" placeholder="0,00" value="' + esc(p.value === '' ? '' : Fmt.moneyInput(p.value) || '0,00') + '"></td>' +
        '<td class="row-actions"><button type="button" class="link-btn danger" data-remove-price>Remover</button></td></tr>'
    }
    app.innerHTML =
      '<div class="page-head"><h1>' + (id ? 'Editar convênio' : 'Novo convênio') + '</h1></div>' +
      '<form class="card" id="f" novalidate><div class="grid">' +
      '<label class="field c8">Nome do convênio <span class="req">*</span><input id="name" value="' + esc(o.name) + '" autofocus></label>' +
      '<label class="field c4">Registro ANS <span class="req">*</span><input class="code" id="ans" inputmode="numeric" maxlength="6" value="' + esc(o.ansRegistry) + '"><span class="hint">6 dígitos, está na carteirinha</span></label>' +
      '<label class="field c6">Como o convênio identifica você<select id="idtype">' + options(ID_TYPES, o.contractorIdType) + '</select></label>' +
      '<label class="field c6" id="code-wrap">Código do prestador no convênio<input class="code" id="code" maxlength="14" value="' + esc(o.providerCode) + '"><span class="hint">O código que o convênio deu a você — não o CPF/CNPJ</span></label>' +
      '<label class="field c4">Versão do Padrão TISS<select id="version">' + options(TISS.VERSIONS, o.tissVersion) + '</select></label>' +
      '<label class="field c4">Último número de lote usado<input class="code" id="lastlote" inputmode="numeric" value="' + esc(o.lastLoteNumber) + '"><span class="hint">O próximo lote será este + 1</span></label>' +
      '<label class="check c12"><input type="checkbox" id="dup"' + (o.allowDuplicateGuideNumbers ? ' checked' : '') + '>Aceitar números de guia repetidos neste convênio</label>' +
      '</div>' +
      '<div class="form-section">Tabela de valores deste convênio</div>' +
      '<p class="hint" style="margin-bottom:10px">Quanto este convênio paga por procedimento. A guia usa somente estes valores quando este convênio é escolhido.</p>' +
      '<div class="grid"><label class="field c12">Adicionar procedimento da TUSS<input id="price-tuss" placeholder="Código ou nome do procedimento…"></label></div>' +
      '<div class="table-wrap" style="margin-top:12px"><table class="list"><thead><tr><th>Tabela</th><th>Código</th><th>Descrição</th><th>Valor (R$)</th><th></th></tr></thead>' +
      '<tbody id="prices">' + o.prices.map(priceRow).join('') + '</tbody></table>' +
      '<p class="empty" id="prices-empty"' + (o.prices.length ? ' hidden' : '') + '>Nenhum valor cadastrado. Busque o procedimento acima ou ' +
      '<button type="button" class="link-btn" id="add-price">adicione uma linha</button>.</p></div>' +
      (o.prices.length ? '<button type="button" class="btn small" id="add-price-2" style="margin-top:10px">+ Linha em branco</button>' : '') +
      '<div id="msg"></div><div class="form-actions"><button class="btn solid" type="submit">Salvar</button>' +
      '<a class="btn" href="#convenios">Cancelar</a>' +
      (id ? '<button type="button" class="btn danger" id="del">Excluir</button>' : '') + '</div></form>'
    function addPriceRow(p) {
      $('#prices').insertAdjacentHTML('beforeend', priceRow(p))
      $('#prices-empty').hidden = true
      const row = $('#prices').lastElementChild
      $(p.code ? '[data-pk="value"]' : '[data-pk="code"]', row).focus()
    }
    attachTuss($('#price-tuss'), function (code, name) {
      const existing = $$('[data-price-row]').find(function (r) {
        return $('[data-pk="tableCode"]', r).value === '22' && $('[data-pk="code"]', r).value.trim() === code
      })
      if (existing) {
        $('[data-pk="value"]', existing).focus()
        return toast('Este procedimento já está na tabela.')
      }
      addPriceRow({ tableCode: '22', code: code, description: name.slice(0, 150), value: '' })
    })
    ;['#add-price', '#add-price-2'].forEach(function (sel) {
      if ($(sel)) $(sel).addEventListener('click', function () { addPriceRow({ tableCode: '22', code: '', description: '', value: '' }) })
    })
    $('#prices').addEventListener('click', function (e) {
      if (!e.target.closest('[data-remove-price]')) return
      e.target.closest('tr').remove()
      $('#prices-empty').hidden = $$('[data-price-row]').length > 0
    })
    function readPrices() {
      return $$('[data-price-row]').map(function (r) {
        const code = $('[data-pk="code"]', r).value.trim()
        const raw = $('[data-pk="value"]', r).value
        const value = Fmt.parseMoney(raw)
        if (code && (!raw.trim() || Number.isNaN(value))) throw new Error('Informe o valor do procedimento ' + code + '.')
        return { tableCode: $('[data-pk="tableCode"]', r).value, code: code, description: $('[data-pk="description"]', r).value, value: value }
      }).filter(function (p) { return p.code })
    }
    function toggleCode() { $('#code-wrap').hidden = $('#idtype').value !== 'codigo' }
    $('#idtype').addEventListener('change', toggleCode)
    toggleCode()
    $('#f').addEventListener('submit', function (e) {
      e.preventDefault()
      try {
        Repo.saveOperator(id, {
          name: $('#name').value, ansRegistry: $('#ans').value, providerCode: $('#code').value,
          tissVersion: $('#version').value, lastLoteNumber: $('#lastlote').value,
          allowDuplicateGuideNumbers: $('#dup').checked, contractorIdType: $('#idtype').value,
          prices: readPrices()
        })
        toast('Convênio salvo.')
        go('#convenios')
      } catch (err) { showError($('#msg'), err) }
    })
    if (id) {
      $('#del').addEventListener('click', function () {
        if (!confirm('Excluir o convênio ' + o.name + '?')) return
        try { Repo.deleteOperator(id); toast('Convênio excluído.'); go('#convenios') } catch (err) { showError($('#msg'), err) }
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Prestador
  // ---------------------------------------------------------------------------

  function viewDoctors() {
    const doctors = Repo.doctors()
    // Conta nova: abre direto o formulário do primeiro médico.
    if (doctors.length === 1 && !doctors[0].professionalName) return viewDoctorForm(doctors[0].id)
    const limites = window.Assinatura ? window.Assinatura.limites() : null
    const max = limites ? limites.medicos : null
    const full = max !== null && doctors.length >= max
    app.innerHTML =
      '<div class="page-head"><div><h1>Prestador</h1><p class="sub">Médicos da conta. Os dados de cada um saem nas guias dele e nos lotes XML.' +
      (max !== null ? ' Usando <strong>' + doctors.length + ' de ' + max + '</strong> ' + (max === 1 ? 'médico' : 'médicos') + '.' : '') + '</p></div>' +
      '<div class="actions">' + (full ? '' : '<a class="btn solid" href="#prestador/novo">Adicionar médico</a>') + '</div></div>' +
      (full ? '<div class="alert warn">Sua assinatura chegou ao limite de médicos. Para liberar mais, fale com a Remasol.</div>' : '') +
      '<div id="msg"></div><div class="table-wrap"><table class="list"><thead><tr><th>Profissional</th><th>Conselho</th><th>CBO-S</th><th>Contratado</th><th class="num">Guias</th><th></th></tr></thead><tbody>' +
      doctors.map(function (d) {
        const count = Db.state.guides.filter(function (g) { return g.doctorId === d.id }).length
        return '<tr><td><strong>' + esc(d.professionalName || 'Sem nome') + '</strong></td>' +
          '<td class="mono nowrap">' + esc(d.councilNumber) + (d.councilNumber ? ' / ' + esc(TISS.label(TISS.UFS, d.councilUf)) : '') + '</td>' +
          '<td class="mono">' + esc(d.cbos) + '</td>' +
          '<td>' + esc(d.contractorName || d.professionalName) + '</td>' +
          '<td class="num">' + count + '</td>' +
          '<td class="row-actions"><a class="link-btn" href="#prestador/' + d.id + '">Editar</a>' +
          (doctors.length > 1 ? '<button class="link-btn danger" data-delete-doctor="' + d.id + '">Excluir</button>' : '') + '</td></tr>'
      }).join('') + '</tbody></table></div>'
    $$('[data-delete-doctor]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = Repo.doctor(Number(b.dataset.deleteDoctor))
        if (!confirm('Excluir ' + (d.professionalName || 'este médico') + '?')) return
        try {
          Repo.deleteDoctor(d.id)
          toast('Médico excluído.')
          viewDoctors()
        } catch (err) { showError($('#msg'), err) }
      })
    })
  }

  function viewDoctorForm(id) {
    const s = id
      ? Repo.doctor(id)
      : { professionalName: '', councilCode: '06', councilNumber: '', councilUf: Db.state.settings.councilUf || '33', cbos: '', contractorName: '', cnes: '', contractorCpf: '', contractorCnpj: '', byOperator: {} }
    if (!s) return go('#prestador')
    const others = Repo.doctors().filter(function (d) { return d.id !== id })
    const ops = Repo.operators()
    const byOperator = s.byOperator || {}
    const OWN_ID = [{ value: '', label: 'Igual ao cadastro do convênio' }].concat(ID_TYPES)
    app.innerHTML =
      '<div class="page-head"><div><h1>' + (id ? 'Editar médico' : 'Novo médico') + '</h1><p class="sub">Dados de quem executa o atendimento. Saem nas guias deste médico e nos lotes XML.</p></div></div>' +
      '<form class="card" id="f" novalidate>' +
      '<div class="form-section">Profissional executante</div><div class="grid">' +
      '<label class="field c8">Nome do profissional <span class="req">*</span><input id="pname" maxlength="70" value="' + esc(s.professionalName) + '"></label>' +
      '<label class="field c4">Conselho<select id="council">' + options(TISS.COUNCILS, s.councilCode) + '</select></label>' +
      '<label class="field c4">Número no conselho <span class="req">*</span><input class="code" id="cnumber" maxlength="15" value="' + esc(s.councilNumber) + '"></label>' +
      '<label class="field c2">UF<select id="uf">' + options(TISS.UFS, s.councilUf) + '</select></label>' +
      '<label class="field c6">CBO-S <span class="req">*</span><select id="cbos">' + options(TISS.CBOS.map(function (c) { return { value: c.value, label: c.value + ' — ' + c.label } }), s.cbos, 'Selecione…') + '</select></label>' +
      '<label class="field c6">CPF do médico <span class="req">*</span><input class="code" id="cpf" inputmode="numeric" value="' + esc(s.contractorCpf) + '"><span class="hint">Vincula o médico à conta, mesmo quando o convênio trabalha com CNPJ.</span></label>' +
      '</div><div class="form-section">Contratado (quem recebe do convênio)</div>' +
      (others.length
        ? '<div class="grid"><label class="field c6">Copiar o contratado de<select id="copy-from">' + doctorOptions('', 'Escolha um médico…').replace(new RegExp('<option value="' + id + '"[^>]*>[^<]*</option>'), '') + '</select><span class="hint">Para médicos que recebem pela mesma clínica.</span></label></div>'
        : '') +
      '<div class="grid">' +
      '<label class="field c8">Nome do contratado<input id="cname" maxlength="70" value="' + esc(s.contractorName) + '"><span class="hint">Clínica ou o próprio profissional. Vazio = nome do profissional.</span></label>' +
      '<label class="field c4">CNES<input class="code" id="cnes" inputmode="numeric" maxlength="7" value="' + esc(s.cnes) + '"><span class="hint">Vazio = 9999999 (sem CNES)</span></label>' +
      '<label class="field c6">CNPJ<input class="code" id="cnpj" inputmode="numeric" value="' + esc(s.contractorCnpj) + '"><span class="hint">Vai nos convênios que trabalham com CNPJ. Vazio = vai o CPF do médico.</span></label>' +
      '</div>' +
      (ops.length
        ? '<div class="form-section">Identificação nos convênios</div>' +
          '<p class="muted">Escolha como este médico atende em cada convênio: um pode ser pelo CPF e outro pelo CNPJ.</p>' +
          '<div class="grid">' + ops.map(function (o) {
            const own = byOperator[o.id] || {}
            return '<label class="field c6">' + esc(o.name) + '<select data-own-type="' + o.id + '">' + options(OWN_ID, own.idType || '') + '</select></label>' +
              '<label class="field c2">Código<input class="code" maxlength="14" data-own-code="' + o.id + '" value="' + esc(own.code || '') + '"></label>'
          }).join('') + '</div>'
        : '') +
      '<div id="msg"></div><div class="form-actions"><button class="btn solid" type="submit">Salvar</button>' +
      '<a class="btn" href="#prestador">Voltar</a></div></form>'
    if ($('#copy-from')) {
      $('#copy-from').addEventListener('change', function (e) {
        const from = Repo.doctor(Number(e.target.value))
        if (!from) return
        $('#cname').value = from.contractorName || ''
        $('#cnes').value = from.cnes || ''
        $('#cnpj').value = from.contractorCnpj || ''
      })
    }
    $('#f').addEventListener('submit', function (e) {
      e.preventDefault()
      try {
        const own = Object.assign({}, byOperator)
        ops.forEach(function (o) {
          const idType = $('[data-own-type="' + o.id + '"]').value
          const code = $('[data-own-code="' + o.id + '"]').value.trim()
          if (idType === 'codigo' && !code) throw new Error('Informe o código do médico no convênio ' + o.name + '.')
          if (idType === 'cnpj' && !$('#cnpj').value.replace(/\D/g, '')) throw new Error('O convênio ' + o.name + ' está marcado por CNPJ: informe o CNPJ do contratado.')
          if (idType || code) own[o.id] = { idType: idType, code: code }
          else delete own[o.id]
        })
        Repo.saveDoctor(id, {
          professionalName: $('#pname').value.trim(), councilCode: $('#council').value, councilNumber: $('#cnumber').value.trim(),
          councilUf: $('#uf').value, cbos: $('#cbos').value, contractorName: $('#cname').value.trim(), cnes: $('#cnes').value.trim(),
          contractorCpf: $('#cpf').value.trim(), contractorCnpj: $('#cnpj').value.trim(), byOperator: own
        })
        toast('Dados do médico salvos.')
        go('#prestador')
      } catch (err) { showError($('#msg'), err) }
    })
  }

  // ---------------------------------------------------------------------------
  // Backup
  // ---------------------------------------------------------------------------

  function viewBackup() {
    const st = Db.state
    let used = 0
    try { used = (localStorage.getItem('guias-tiss:dados') || '').length } catch (e) { used = 0 }
    app.innerHTML =
      '<div class="page-head"><div><h1>Backup</h1><p class="sub">Os dados ficam só neste navegador, neste computador. Salve um backup com frequência.</p></div></div>' +
      '<div class="card"><h2>Seus dados</h2><p class="muted" style="margin-top:6px">' +
      st.doctors.length + (st.doctors.length === 1 ? ' médico · ' : ' médicos · ') + st.guides.length + ' guias · ' + st.lotes.length + ' lotes · ' + st.patients.length + ' beneficiários · ' +
      st.operators.length + ' convênios · ' +
      st.operators.reduce(function (n, o) { return n + o.prices.length }, 0) + ' valores cadastrados · ' +
      '<span class="mono">' + (used / 1024).toFixed(0) + ' KB</span> usados</p>' +
      '<div class="form-actions"><button class="btn solid" id="export">Baixar backup</button>' +
      '<label class="btn" for="import-file">Restaurar backup…</label><input type="file" id="import-file" accept=".json,application/json" hidden></div>' +
      '<div id="msg"></div></div>' +
      '<div class="card"><h2>Apagar tudo</h2><p class="muted" style="margin-top:6px">Remove todos os dados deste navegador. Baixe um backup antes.</p>' +
      '<div class="form-actions"><button class="btn danger" id="reset">Apagar todos os dados</button></div></div>'
    $('#export').addEventListener('click', function () {
      const stamp = Fmt.today()
      download('guias-tiss-backup-' + stamp + '.json', Db.exportJson(), 'application/json', false)
      toast('Backup baixado.')
    })
    $('#import-file').addEventListener('change', function (e) {
      const file = e.target.files[0]
      if (!file) return
      if (!confirm('Restaurar o backup "' + file.name + '"? Os dados atuais deste navegador serão substituídos.')) {
        e.target.value = ''
        return
      }
      const reader = new FileReader()
      reader.onload = function () {
        try {
          Db.importJson(String(reader.result))
          toast('Backup restaurado.')
          viewBackup()
        } catch (err) { showError($('#msg'), err) }
      }
      reader.readAsText(file)
    })
    $('#reset').addEventListener('click', function () {
      if (prompt('Para apagar tudo, digite APAGAR') !== 'APAGAR') return
      Db.reset()
      toast('Dados apagados.')
      go('#guias')
    })
  }

  render()
})()
