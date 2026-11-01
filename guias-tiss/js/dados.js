// Dados e regras do gerador de guias. Tudo fica gravado neste navegador (localStorage);
// use "Backup" para salvar uma cópia em arquivo. As regras são as mesmas da versão desktop
// (src/main/db/tissRepo.ts).
'use strict'

// ---------------------------------------------------------------------------
// Utilidades de formato e cálculo
// ---------------------------------------------------------------------------

const Fmt = {
  date: function (value) {
    if (!value) return ''
    const p = String(value).split('-')
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : value
  },
  money: function (value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  },
  number2: function (value) {
    return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },
  // Valor para campo de texto ("150,00"); vazio quando zero.
  moneyInput: function (value) {
    return value ? Number(value).toFixed(2).replace('.', ',') : ''
  },
  // Aceita "1.234,56", "1234,56" ou "1234.56".
  parseMoney: function (value) {
    const t = String(value || '').trim()
    if (!t) return 0
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
    return Number.isFinite(n) ? n : NaN
  },
  today: function () {
    const d = new Date()
    const pad = function (n) { return String(n).padStart(2, '0') }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  },
  // Data/hora UTC no mesmo formato do SQLite da versão desktop.
  nowUtc: function () {
    return new Date().toISOString().slice(0, 19).replace('T', ' ')
  },
  normalize: function (value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  }
}

const Calc = {
  round2: function (value) {
    return Math.round(value * 100) / 100
  },
  // Total de um item SP/SADT: quantidade × valor unitário × fator de redução/acréscimo.
  sadtItemTotal: function (item) {
    return Calc.round2(item.quantity * item.unitValue * (item.factor || 0))
  },
  sadtGuideTotal: function (sadt) {
    return Calc.round2(sadt.procedures.reduce(function (s, p) { return s + Calc.sadtItemTotal(p) }, 0))
  },
  guideTotal: function (guide) {
    return guide.guideType === 'sadt' && guide.sadt ? Calc.sadtGuideTotal(guide.sadt) : Calc.round2(guide.procedure.value)
  }
}

// ---------------------------------------------------------------------------
// Busca na TUSS 22
// ---------------------------------------------------------------------------

const Tuss = (function () {
  let index = null
  let byCode = null
  function build() {
    if (index) return
    index = TUSS22.items.map(function (it) { return { code: it[0], name: it[1], search: Fmt.normalize(it[1]) } })
    byCode = new Map(index.map(function (p) { return [p.code, p] }))
  }
  return {
    publishedAt: TUSS22.meta.publishedAt,
    // Por código (início) ou por palavras do nome, sem diferenciar acentos nem maiúsculas.
    search: function (query, limit) {
      build()
      const q = Fmt.normalize(String(query).trim())
      if (q.length < 2) return []
      const digits = q.replace(/[.\-\s]/g, '')
      let found
      if (/^\d+$/.test(digits)) {
        found = index.filter(function (p) { return p.code.startsWith(digits) })
      } else {
        const words = q.split(/\s+/).filter(Boolean)
        found = index.filter(function (p) { return words.every(function (w) { return p.search.includes(w) }) })
      }
      return found.slice(0, limit || 50)
    },
    find: function (code) {
      build()
      return byCode.get(String(code).trim()) || null
    }
  }
})()

// ---------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------

const Db = (function () {
  const KEY = 'guias-tiss:dados'

  function empty() {
    return {
      formato: 1,
      settings: {
        professionalName: '',
        contractorName: '',
        contractorCpf: '',
        contractorCnpj: '',
        cnes: '',
        councilCode: '06',
        councilNumber: '',
        councilUf: '33',
        cbos: ''
      },
      // Cada convênio tem a sua tabela de valores: operators[].prices = [{ tableCode, code, description, value }]
      operators: [],
      patients: [],
      guides: [],
      lotes: [],
      seq: { operator: 0, patient: 0, guide: 0, lote: 0 }
    }
  }

  let state = empty()
  let storageOk = true

  // Dados da primeira versão tinham uma tabela de procedimentos separada, com valor padrão e
  // valores por convênio. Agora o valor mora só dentro do convênio: os valores por convênio são
  // levados para lá; o "valor padrão" não é usado (cada convênio paga o seu).
  function migrate(data) {
    const out = Object.assign(empty(), data)
    out.operators.forEach(function (o) { if (!Array.isArray(o.prices)) o.prices = [] })
    if (Array.isArray(data.procedures)) {
      data.procedures.forEach(function (proc) {
        (proc.prices || []).forEach(function (pr) {
          const op = out.operators.find(function (o) { return o.id === pr.operatorId })
          if (!op) return
          const exists = op.prices.some(function (x) { return x.tableCode === proc.tableCode && x.code === proc.code })
          if (!exists) op.prices.push({ tableCode: proc.tableCode, code: proc.code, description: proc.description, value: pr.value })
        })
      })
    }
    delete out.procedures
    if (out.seq) delete out.seq.procedure
    return out
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) state = migrate(JSON.parse(raw))
    } catch (e) {
      storageOk = false
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      storageOk = true
    } catch (e) {
      storageOk = false
      throw new Error(
        'Não foi possível gravar neste navegador (memória cheia ou bloqueada). Faça um backup agora.'
      )
    }
  }

  function nextId(kind) {
    state.seq[kind] = (state.seq[kind] || 0) + 1
    return state.seq[kind]
  }

  function byId(list, id) {
    return list.find(function (x) { return x.id === id }) || null
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  load()

  return {
    get state() { return state },
    storageOk: function () { return storageOk },
    save: save,
    nextId: nextId,
    byId: byId,
    clone: clone,
    exportJson: function () {
      return JSON.stringify(Object.assign({ exportadoEm: new Date().toISOString() }, state), null, 2)
    },
    importJson: function (text) {
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.guides) || !Array.isArray(data.operators)) {
        throw new Error('Arquivo de backup inválido.')
      }
      delete data.exportadoEm
      state = migrate(data)
      save()
    },
    reset: function () {
      state = empty()
      save()
    }
  }
})()

// ---------------------------------------------------------------------------
// Regras de negócio
// ---------------------------------------------------------------------------

const Repo = {
  // ----- Prestador
  saveSettings: function (input) {
    Db.state.settings = Object.assign({}, Db.state.settings, input)
    Db.save()
  },

  // ----- Convênios
  operators: function () {
    return Db.state.operators.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR') })
  },
  operator: function (id) {
    return Db.byId(Db.state.operators, id)
  },
  saveOperator: function (id, input) {
    if (!input.name.trim()) throw new Error('Informe o nome do convênio.')
    if (!/^\d{6}$/.test(String(input.ansRegistry).replace(/\D/g, ''))) {
      throw new Error('O registro ANS deve ter 6 dígitos.')
    }
    const data = {
      name: input.name.trim(),
      ansRegistry: String(input.ansRegistry).replace(/\D/g, ''),
      providerCode: input.providerCode.trim(),
      tissVersion: input.tissVersion,
      lastLoteNumber: Math.max(0, Math.floor(Number(input.lastLoteNumber) || 0)),
      allowDuplicateGuideNumbers: !!input.allowDuplicateGuideNumbers,
      contractorIdType: input.contractorIdType,
      prices: Repo.cleanPrices(input.prices || [])
    }
    if (id) {
      Object.assign(Repo.operator(id), data)
    } else {
      // Limite de convênios do plano (só quando o login está ligado; ver js/acesso.js)
      if (window.Assinatura) window.Assinatura.checarNovoConvenio(Db.state.operators.length)
      Db.state.operators.push(Object.assign({ id: Db.nextId('operator'), createdAt: Fmt.nowUtc() }, data))
    }
    Db.save()
  },
  deleteOperator: function (id) {
    if (Db.state.guides.some(function (g) { return g.operatorId === id })) {
      throw new Error('Este convênio possui guias cadastradas e não pode ser excluído.')
    }
    Db.state.operators = Db.state.operators.filter(function (o) { return o.id !== id })
    Db.state.patients.forEach(function (p) { if (p.insuranceOperatorId === id) p.insuranceOperatorId = null })
    Db.save()
  },

  // ----- Beneficiários
  patients: function () {
    return Db.state.patients.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR') })
  },
  patient: function (id) {
    return Db.byId(Db.state.patients, id)
  },
  savePatient: function (id, input) {
    if (!input.name.trim()) throw new Error('Informe o nome do beneficiário.')
    const data = {
      name: input.name.trim(),
      cpf: input.cpf.trim(),
      birthDate: input.birthDate,
      phone: input.phone.trim(),
      insuranceOperatorId: input.insuranceOperatorId || null,
      insuranceCardNumber: input.insuranceCardNumber.trim(),
      notes: input.notes.trim()
    }
    let saved
    let updatedGuides = 0
    if (id) {
      saved = Object.assign(Repo.patient(id), data)
      updatedGuides = Repo.syncPendingGuides(saved)
    } else {
      saved = Object.assign({ id: Db.nextId('patient'), createdAt: Fmt.nowUtc() }, data)
      Db.state.patients.push(saved)
    }
    Db.save()
    saved.updatedGuides = updatedGuides
    return saved
  },
  // A carteirinha fica vinculada ao cadastro: as guias ainda sem lote passam a usar o cartão
  // atual do beneficiário (do mesmo convênio). Guias já em lote não mudam — já foram enviadas.
  syncPendingGuides: function (patient) {
    const card = patient.insuranceCardNumber
    if (!card) return 0
    let n = 0
    Db.state.guides.forEach(function (g) {
      if (g.patientId !== patient.id || g.loteId !== null) return
      if (patient.insuranceOperatorId && g.operatorId !== patient.insuranceOperatorId) return
      if (g.cardNumber !== card) {
        g.cardNumber = card
        n++
      }
    })
    return n
  },
  deletePatient: function (id) {
    if (Db.state.guides.some(function (g) { return g.patientId === id })) {
      throw new Error('Este beneficiário possui guias e não pode ser excluído.')
    }
    Db.state.patients = Db.state.patients.filter(function (p) { return p.id !== id })
    Db.save()
  },

  // ----- Tabela de valores de cada convênio
  // Cada convênio paga um valor próprio por procedimento. A guia só usa o valor do convênio
  // escolhido; sem valor cadastrado, a guia avisa e o valor é digitado.
  cleanPrices: function (list) {
    const seen = {}
    return list.map(function (p) {
      const code = String(p.code || '').trim()
      if (!code) throw new Error('Há um procedimento sem código na tabela de valores.')
      if (!(p.value >= 0)) throw new Error('Valor inválido para o procedimento ' + code + '.')
      const key = p.tableCode + '|' + code
      if (seen[key]) throw new Error('O procedimento ' + code + ' aparece duas vezes na tabela de valores.')
      seen[key] = true
      return { tableCode: p.tableCode || '22', code: code, description: String(p.description || '').trim(), value: Calc.round2(p.value) }
    }).sort(function (a, b) { return a.code.localeCompare(b.code) })
  },
  // Valor combinado com o convênio para o procedimento, ou null se não houver.
  priceFor: function (operatorId, tableCode, code) {
    const op = operatorId ? Repo.operator(operatorId) : null
    if (!op) return null
    return op.prices.find(function (p) { return p.tableCode === tableCode && p.code === String(code).trim() }) || null
  },
  // "Salvar valor no convênio" a partir de uma guia.
  savePrice: function (operatorId, input) {
    const op = operatorId ? Repo.operator(operatorId) : null
    if (!op) throw new Error('Escolha o convênio para salvar o valor na tabela dele.')
    const code = String(input.code || '').trim()
    if (!code) throw new Error('Informe o código do procedimento.')
    if (!(input.value >= 0)) throw new Error('Valor inválido.')
    const own = Repo.priceFor(operatorId, input.tableCode, code)
    if (own) {
      own.value = Calc.round2(input.value)
      if (input.description && input.description.trim()) own.description = input.description.trim()
    } else {
      op.prices.push({ tableCode: input.tableCode, code: code, description: String(input.description || '').trim(), value: Calc.round2(input.value) })
      op.prices.sort(function (a, b) { return a.code.localeCompare(b.code) })
    }
    Db.save()
    return op
  },

  // ----- Guias
  guide: function (id) {
    return Db.byId(Db.state.guides, id)
  },
  guides: function (filter) {
    const f = filter || {}
    return Db.state.guides
      .filter(function (g) {
        if (f.operatorId && g.operatorId !== f.operatorId) return false
        if (f.status === 'pending' && g.loteId !== null) return false
        if (f.status === 'batched' && g.loteId === null) return false
        if (f.guideType && g.guideType !== f.guideType) return false
        if (f.query && !Repo.guideMatches(g, f.query)) return false
        return true
      })
      .sort(function (a, b) {
        return b.serviceDate.localeCompare(a.serviceDate) || b.id - a.id
      })
  },
  // Busca por nº da guia (prestador ou convênio), beneficiário, CPF, carteirinha, código ou
  // descrição do procedimento — sem diferenciar acentos nem maiúsculas.
  guideMatches: function (g, query) {
    const q = Fmt.normalize(query).trim()
    if (!q) return true
    const digits = q.replace(/\D/g, '')
    const p = Repo.patient(g.patientId)
    const codes = g.guideType === 'sadt' && g.sadt
      ? g.sadt.procedures.map(function (x) { return x.code + ' ' + x.description }).join(' ')
      : g.procedure.code + ' ' + g.procedure.description
    const text = Fmt.normalize([g.providerGuideNumber, g.operatorGuideNumber, g.cardNumber, p ? p.name : '', p ? p.cpf : '', codes].join(' '))
    const words = q.split(/\s+/)
    if (words.every(function (w) { return text.includes(w) })) return true
    // CPF ou carteirinha digitados com ou sem pontuação
    return digits.length >= 3 && text.replace(/\D/g, ' ').split(' ').concat([String(p && p.cpf || '').replace(/\D/g, '')]).some(function (t) { return t.includes(digits) })
  },
  nextProviderGuideNumber: function () {
    let max = 0
    Db.state.guides.forEach(function (g) {
      if (/^\d+$/.test(g.providerGuideNumber)) max = Math.max(max, Number(g.providerGuideNumber))
    })
    return String(max + 1)
  },
  lastGuideForPatient: function (patientId) {
    const list = Db.state.guides.filter(function (g) { return g.patientId === patientId })
    return list.length ? list.reduce(function (a, b) { return a.id > b.id ? a : b }) : null
  },
  saveGuide: function (id, input) {
    if (!input.operatorId) throw new Error('Selecione o convênio.')
    if (!input.patientId) throw new Error('Selecione o beneficiário.')
    const number = input.providerGuideNumber.trim()
    if (!number) throw new Error('Informe o número da guia no prestador.')
    if (!input.cardNumber.trim()) throw new Error('Informe o número da carteirinha.')
    if (id) {
      const current = Repo.guide(id)
      if (!current) throw new Error('Guia não encontrada.')
      if (current.loteId !== null) throw new Error('A guia já faz parte de um lote. Exclua o lote para poder alterá-la.')
    }
    const operator = Repo.operator(input.operatorId)
    if (!operator.allowDuplicateGuideNumbers) {
      const dup = Db.state.guides.find(function (g) {
        return g.operatorId === input.operatorId && g.providerGuideNumber === number && g.id !== id
      })
      if (dup) {
        throw new Error(
          'Já existe uma guia com o número ' + number + ' para este convênio. ' +
            'Para aceitar números repetidos, ative a opção no cadastro do convênio.'
        )
      }
    }
    const data = Db.clone(input)
    data.providerGuideNumber = number
    data.cardNumber = data.cardNumber.trim()
    if (data.guideType === 'sadt') {
      if (!data.sadt || data.sadt.procedures.length === 0) {
        throw new Error('Inclua ao menos um procedimento na guia SP/SADT.')
      }
      data.sadt.procedures = data.sadt.procedures.map(function (p) {
        return Object.assign({}, p, {
          quantity: Math.max(1, Math.round(p.quantity)),
          unitValue: Calc.round2(p.unitValue),
          factor: Calc.round2(p.factor)
        })
      })
      const first = data.sadt.procedures[0]
      // Resumo do primeiro item, para listagens (igual à versão desktop).
      data.procedure = {
        tableCode: first.tableCode,
        code: first.code,
        description: first.description,
        value: Calc.sadtGuideTotal(data.sadt)
      }
    } else {
      data.guideType = 'consulta'
      data.sadt = null
      data.procedure.value = Calc.round2(data.procedure.value)
    }
    let saved
    if (id) {
      saved = Object.assign(Repo.guide(id), data)
    } else {
      saved = Object.assign({ id: Db.nextId('guide'), loteId: null, createdAt: Fmt.nowUtc() }, data)
      Db.state.guides.push(saved)
    }
    Db.save()
    return saved
  },
  deleteGuide: function (id) {
    const g = Repo.guide(id)
    if (g && g.loteId !== null) throw new Error('A guia faz parte de um lote. Exclua o lote antes.')
    Db.state.guides = Db.state.guides.filter(function (x) { return x.id !== id })
    Db.save()
  },

  // ----- Lotes
  lotes: function () {
    return Db.state.lotes.slice().sort(function (a, b) {
      return b.createdAt.localeCompare(a.createdAt) || b.id - a.id
    })
  },
  lote: function (id) {
    return Db.byId(Db.state.lotes, id)
  },
  loteGuides: function (loteId) {
    return Db.state.guides
      .filter(function (g) { return g.loteId === loteId })
      .sort(function (a, b) { return a.id - b.id })
  },
  loteSummary: function (lote) {
    const guides = Repo.loteGuides(lote.id)
    return {
      guideCount: guides.length,
      totalValue: Calc.round2(guides.reduce(function (s, g) { return s + Calc.guideTotal(g) }, 0))
    }
  },
  // Valida as guias antes de gerar: devolve a lista de problemas (vazia = tudo certo).
  checkGuides: function (guideIds) {
    const settings = Db.state.settings
    let errors = []
    guideIds.forEach(function (id) {
      const g = Repo.guide(id)
      errors = errors.concat(XmlTiss.validateGuide(g, Repo.operator(g.operatorId), settings, Repo.patient(g.patientId)))
    })
    if (!settings.professionalName.trim()) errors.unshift('Informe o nome do profissional em Prestador.')
    return errors
  },
  createLote: function (guideIds) {
    if (guideIds.length === 0) throw new Error('Selecione ao menos uma guia.')
    if (guideIds.length > TISS.MAX_GUIDES_PER_LOTE) {
      throw new Error('Um lote pode conter no máximo ' + TISS.MAX_GUIDES_PER_LOTE + ' guias.')
    }
    const guides = guideIds.map(function (id) {
      const g = Repo.guide(id)
      if (!g) throw new Error('Guia ' + id + ' não encontrada.')
      if (g.loteId !== null) throw new Error('A guia ' + g.providerGuideNumber + ' já pertence a um lote.')
      return g
    })
    const operatorId = guides[0].operatorId
    if (guides.some(function (g) { return g.operatorId !== operatorId })) {
      throw new Error('Todas as guias de um lote devem ser do mesmo convênio.')
    }
    if (guides.some(function (g) { return g.guideType !== guides[0].guideType })) {
      throw new Error('Um lote não pode misturar guias de consulta e guias SP/SADT. Gere um lote para cada tipo.')
    }
    const errors = Repo.checkGuides(guideIds)
    if (errors.length) {
      const err = new Error('Corrija as guias antes de gerar o lote.')
      err.details = errors
      throw err
    }
    // Contador por convênio: um número de lote nunca é reutilizado, mesmo após excluir um lote.
    const operator = Repo.operator(operatorId)
    operator.lastLoteNumber = (operator.lastLoteNumber || 0) + 1
    const lote = {
      id: Db.nextId('lote'),
      operatorId: operatorId,
      number: String(operator.lastLoteNumber),
      status: 'gerado',
      hash: '',
      createdAt: Fmt.nowUtc()
    }
    Db.state.lotes.push(lote)
    guides.forEach(function (g) { g.loteId = lote.id })
    lote.hash = Repo.loteXml(lote).hash
    Db.save()
    return lote
  },
  loteXml: function (lote) {
    return XmlTiss.buildLoteXml({
      lote: lote,
      guides: Repo.loteGuides(lote.id),
      operator: Repo.operator(lote.operatorId),
      settings: Db.state.settings,
      doctorName: Db.state.settings.professionalName
    })
  },
  setLoteStatus: function (id, status) {
    Repo.lote(id).status = status
    Db.save()
  },
  deleteLote: function (id) {
    Db.state.guides.forEach(function (g) { if (g.loteId === id) g.loteId = null })
    Db.state.lotes = Db.state.lotes.filter(function (l) { return l.id !== id })
    Db.save()
  }
}
