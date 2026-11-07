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
  // Só os procedimentos da SP/SADT (campo 59 / valorProcedimentos).
  sadtProceduresTotal: function (sadt) {
    return Calc.round2(sadt.procedures.reduce(function (s, p) { return s + Calc.sadtItemTotal(p) }, 0))
  },
  // Outra despesa (material, medicamento…): quantidade (até 4 casas) × valor unitário × fator.
  expenseTotal: function (e) {
    return Calc.round2(e.quantity * e.unitValue * (e.factor || 0))
  },
  // Totais das outras despesas por tipo: { '03': 120.5, '02': 30 }.
  expenseTotalsByType: function (sadt) {
    const out = {}
    ;(sadt.expenses || []).forEach(function (e) {
      out[e.type] = Calc.round2((out[e.type] || 0) + Calc.expenseTotal(e))
    })
    return out
  },
  expensesTotal: function (sadt) {
    return Calc.round2((sadt.expenses || []).reduce(function (s, e) { return s + Calc.expenseTotal(e) }, 0))
  },
  // Total geral da SP/SADT: procedimentos + outras despesas.
  sadtGuideTotal: function (sadt) {
    return Calc.round2(Calc.sadtProceduresTotal(sadt) + Calc.expensesTotal(sadt))
  },
  // Total da guia de honorários individuais.
  honorTotal: function (hon) {
    return Calc.round2(hon.procedures.reduce(function (s, p) { return s + Calc.sadtItemTotal(p) }, 0))
  },
  guideTotal: function (guide) {
    if (guide.guideType === 'sadt' && guide.sadt) return Calc.sadtGuideTotal(guide.sadt)
    if (guide.guideType === 'honorarios' && guide.hon) return Calc.honorTotal(guide.hon)
    return Calc.round2(guide.procedure.value)
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
      // Médicos da conta. Cada um tem os dados de "settings" e, por convênio, pode ter identificação
      // própria: doctors[].byOperator = { <id do convênio>: { idType, code } }. "settings" fica como
      // cópia do primeiro médico (usada como padrão de UF nos formulários).
      doctors: [],
      // Contratado = quem recebe do convênio: { id, type: 'cpf'|'cnpj', name, cnpj, cnes, doctorIds,
      // byOperator: { <id do convênio>: { idType, code, prices } } }. Convênio com entrada aqui é
      // convênio que este contratado atende. Médicos (CPF) são da conta: o mesmo médico pode estar em
      // vários contratados e conta uma vez só na assinatura.
      contractors: [],
      // Cada convênio tem a sua tabela de valores: operators[].prices = [{ tableCode, code, description, value }]
      operators: [],
      patients: [],
      guides: [],
      lotes: [],
      seq: { operator: 0, patient: 0, guide: 0, lote: 0, doctor: 0, contractor: 0 }
    }
  }

  // Dados de antes da lista de médicos: o Prestador vira o primeiro médico e as guias passam a ser dele.
  function migrateDoctors(out) {
    if (!Array.isArray(out.doctors) || !out.doctors.length) {
      out.doctors = [Object.assign({ id: 1, byOperator: {} }, out.settings)]
    }
    out.seq = out.seq || {}
    out.seq.doctor = Math.max(out.seq.doctor || 0, ...out.doctors.map(function (d) { return d.id }))
    out.guides.forEach(function (g) { if (!g.doctorId) g.doctorId = out.doctors[0].id })
    // A identificação no convênio passou a ser do médico: a que estava no convênio vai só para o
    // primeiro médico. Os demais precisam informar a sua, para nunca usar o código de outro médico.
    if (!out.identPorMedico) {
      const first = out.doctors[0]
      const digits = function (v) { return String(v || '').replace(/\D/g, '') }
      first.byOperator = first.byOperator || {}
      out.operators.forEach(function (o) {
        const own = first.byOperator[o.id] || {}
        let idType = own.idType || o.contractorIdType || ''
        if (!own.idType && idType === 'cnpj' && !digits(first.contractorCnpj) && digits(first.contractorCpf)) idType = 'cpf'
        first.byOperator[o.id] = { idType: idType, code: own.code || (idType === 'codigo' ? o.providerCode || '' : '') }
      })
      out.identPorMedico = true
    }
  }

  // Cada médico antigo vira um contratado. Médicos com o mesmo CNPJ, nome e CNES entram no mesmo
  // contratado, desde que identificados do mesmo jeito em cada convênio: assim o XML não muda.
  function migrateContractors(out) {
    if (out.contratados) return
    out.contratados = true
    const digits = function (v) { return String(v || '').replace(/\D/g, '') }
    const lone = out.doctors.length === 1 ? out.doctors[0] : null
    if (lone && !lone.professionalName && !digits(lone.contractorCpf) && !lone.contractorName && !digits(lone.contractorCnpj) &&
        !out.guides.length && !out.operators.length) {
      out.doctors = []
      return
    }
    out.contractors = []
    out.seq.contractor = 0
    const priceCopy = function (opId) {
      const op = out.operators.find(function (o) { return o.id === opId })
      return op ? JSON.parse(JSON.stringify(op.prices || [])) : []
    }
    const byDoctor = {}
    out.doctors.forEach(function (d) {
      const links = {}
      Object.keys(d.byOperator || {}).forEach(function (k) {
        const own = d.byOperator[k]
        if (own && !own.excluded && own.idType) links[k] = { idType: own.idType, code: own.code || '', prices: priceCopy(Number(k)) }
      })
      out.guides.forEach(function (g) {
        if (g.doctorId === d.id && !links[g.operatorId]) {
          const own = (d.byOperator || {})[g.operatorId] || {}
          links[g.operatorId] = { idType: own.idType || '', code: own.code || '', prices: priceCopy(g.operatorId) }
        }
      })
      const cnpj = digits(d.contractorCnpj)
      const same = cnpj && out.contractors.find(function (c) {
        if (c.type !== 'cnpj' || digits(c.cnpj) !== cnpj || c.name !== (d.contractorName || '') || digits(c.cnes) !== digits(d.cnes)) return false
        return Object.keys(links).every(function (k) {
          const other = c.byOperator[k]
          return !other || (other.idType === links[k].idType && other.code === links[k].code && links[k].idType !== 'cpf')
        })
      })
      if (same) {
        same.doctorIds.push(d.id)
        Object.assign(same.byOperator, Object.assign({}, links, same.byOperator))
        byDoctor[d.id] = same
      } else {
        out.seq.contractor += 1
        const c = {
          id: out.seq.contractor, type: cnpj ? 'cnpj' : 'cpf', name: d.contractorName || '', cnpj: d.contractorCnpj || '',
          cnes: d.cnes || '', doctorIds: [d.id], byOperator: links
        }
        out.contractors.push(c)
        byDoctor[d.id] = c
      }
    })
    out.guides.forEach(function (g) { g.contractorId = byDoctor[g.doctorId].id })
    out.lotes.forEach(function (l) {
      const g = out.guides.find(function (x) { return x.loteId === l.id })
      l.contractorId = g ? g.contractorId : out.contractors[0].id
    })
  }

  function fresh() {
    const out = empty()
    migrateDoctors(out)
    migrateContractors(out)
    return out
  }

  let state = fresh()
  let storageOk = true

  // Dados da primeira versão tinham uma tabela de procedimentos separada, com valor padrão e
  // valores por convênio. Agora o valor mora só dentro do convênio: os valores por convênio são
  // levados para lá; o "valor padrão" não é usado (cada convênio paga o seu).
  function migrate(data) {
    const out = Object.assign(empty(), data)
    out.operators.forEach(function (o) {
      if (!Array.isArray(o.prices)) o.prices = []
      if (typeof o.sequentialGuideNumbers !== 'boolean') o.sequentialGuideNumbers = false
    })
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
    migrateDoctors(out)
    migrateContractors(out)
    return out
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        // Guarda uma cópia antes da mudança para contratados (se couber no navegador).
        if (raw.indexOf('"contratados":true') < 0) {
          try { localStorage.setItem(KEY + ':antes-contratados', raw) } catch (e) { /* sem espaço: segue */ }
        }
        state = migrate(JSON.parse(raw))
      }
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
      state = fresh()
      save()
    }
  }
})()

// ---------------------------------------------------------------------------
// Regras de negócio
// ---------------------------------------------------------------------------

const Repo = {
  // ----- Contratado em uso (escolhido ao entrar)
  currentId: null,
  current: function () {
    const list = Db.state.contractors
    if (list.length === 1) return list[0]
    if (Repo.currentId === null) {
      try { Repo.currentId = Number(sessionStorage.getItem('guias-tiss:contratado')) || null } catch (e) { Repo.currentId = null }
    }
    return Repo.contractor(Repo.currentId)
  },
  setCurrent: function (id) {
    Repo.currentId = id
    try { sessionStorage.setItem('guias-tiss:contratado', String(id)) } catch (e) { /* só vale nesta página */ }
  },

  // ----- Contratados
  contractors: function () {
    return Db.state.contractors.slice().sort(function (a, b) { return Repo.contractorName(a).localeCompare(Repo.contractorName(b), 'pt-BR') })
  },
  contractor: function (id) {
    return Db.byId(Db.state.contractors, id)
  },
  contractorOf: function (guide) {
    return Repo.contractor(guide.contractorId)
  },
  contractorName: function (c) {
    const d = c.doctorIds.length ? Repo.doctor(c.doctorIds[0]) : null
    return c.name || (d && d.professionalName) || 'Contratado sem nome'
  },
  saveContractor: function (id, input) {
    const digits = String(input.cnpj || '').replace(/\D/g, '')
    if (input.type === 'cnpj') {
      if (!input.name.trim()) throw new Error('Informe o nome da clínica.')
      if (digits.length !== 14) throw new Error('Informe o CNPJ (14 dígitos).')
      if (Db.state.contractors.some(function (c) { return c.id !== id && c.type === 'cnpj' && String(c.cnpj).replace(/\D/g, '') === digits })) {
        throw new Error('Este CNPJ já está cadastrado.')
      }
    }
    const data = { type: input.type, name: input.name.trim(), cnpj: input.type === 'cnpj' ? input.cnpj.trim() : String(input.cnpj || '').trim(), cnes: input.cnes.trim() }
    let saved
    if (id) {
      saved = Object.assign(Repo.contractor(id), data)
    } else {
      saved = Object.assign({ id: Db.nextId('contractor'), doctorIds: [], byOperator: {} }, data)
      Db.state.contractors.push(saved)
    }
    Repo.syncSettings()
    Db.save()
    return saved
  },
  deleteContractor: function (id) {
    if (Db.state.guides.some(function (g) { return g.contractorId === id })) {
      throw new Error('Este contratado possui guias cadastradas e não pode ser excluído.')
    }
    const c = Repo.contractor(id)
    const doctors = c.doctorIds.slice()
    const ops = Object.keys(c.byOperator).map(Number)
    Db.state.contractors = Db.state.contractors.filter(function (x) { return x.id !== id })
    doctors.forEach(Repo.dropDoctorIfUnused)
    ops.forEach(Repo.dropOperatorIfUnused)
    if (Repo.currentId === id) Repo.currentId = null
    Repo.syncSettings()
    Db.save()
  },

  // ----- Médicos: um por CPF na conta
  doctors: function () {
    return Db.state.doctors.slice()
  },
  doctor: function (id) {
    return Db.byId(Db.state.doctors, id)
  },
  doctorOf: function (guide) {
    return Repo.doctor(guide.doctorId) || null
  },
  doctorsOf: function (contractor) {
    return contractor.doctorIds.map(Repo.doctor).filter(Boolean)
  },
  syncSettings: function () {
    const d = Db.state.doctors[0]
    if (!d) return
    const c = Db.state.contractors.find(function (x) { return x.doctorIds.indexOf(d.id) >= 0 })
    Db.state.settings = {
      professionalName: d.professionalName, councilCode: d.councilCode, councilNumber: d.councilNumber, councilUf: d.councilUf, cbos: d.cbos,
      contractorCpf: d.contractorCpf, contractorName: c ? c.name : '', contractorCnpj: c ? c.cnpj : '', cnes: c ? c.cnes : ''
    }
  },
  // Salva o médico. Médico novo entra no contratado informado e conta no limite da assinatura.
  saveDoctor: function (id, input, contractorId) {
    if (!input.professionalName.trim()) throw new Error('Informe o nome do profissional.')
    const cpf = String(input.contractorCpf || '').replace(/\D/g, '')
    if (cpf.length !== 11) throw new Error('Informe o CPF do médico (11 dígitos).')
    const same = Db.state.doctors.find(function (d) { return d.id !== id && String(d.contractorCpf || '').replace(/\D/g, '') === cpf })
    if (same) throw new Error('Este CPF já está cadastrado para ' + (same.professionalName || 'outro médico') + '. Use "Adicionar médico já cadastrado".')
    let saved
    if (id) {
      saved = Object.assign(Repo.doctor(id), input)
    } else {
      if (window.Assinatura) window.Assinatura.checarNovoMedico(Db.state.doctors.length)
      saved = Object.assign({ id: Db.nextId('doctor') }, input)
      Db.state.doctors.push(saved)
      if (contractorId) Repo.addDoctorTo(contractorId, saved.id, true)
    }
    Repo.syncSettings()
    Db.save()
    return saved
  },
  addDoctorTo: function (contractorId, doctorId, quiet) {
    const c = Repo.contractor(contractorId)
    if (c.type === 'cpf' && c.doctorIds.length) throw new Error('Contratado por CPF tem um médico só. Para mais médicos, cadastre um contratado por CNPJ.')
    if (c.doctorIds.indexOf(doctorId) < 0) c.doctorIds.push(doctorId)
    if (!quiet) { Repo.syncSettings(); Db.save() }
  },
  removeDoctorFrom: function (contractorId, doctorId) {
    if (Db.state.guides.some(function (g) { return g.contractorId === contractorId && g.doctorId === doctorId })) {
      throw new Error('Este médico possui guias neste contratado e não pode ser retirado.')
    }
    const c = Repo.contractor(contractorId)
    c.doctorIds = c.doctorIds.filter(function (x) { return x !== doctorId })
    Repo.dropDoctorIfUnused(doctorId)
    Repo.syncSettings()
    Db.save()
  },
  dropDoctorIfUnused: function (doctorId) {
    const used = Db.state.contractors.some(function (c) { return c.doctorIds.indexOf(doctorId) >= 0 }) ||
      Db.state.guides.some(function (g) { return g.doctorId === doctorId })
    if (!used) Db.state.doctors = Db.state.doctors.filter(function (d) { return d.id !== doctorId })
  },
  dropOperatorIfUnused: function (operatorId) {
    const used = Db.state.contractors.some(function (c) { return !!c.byOperator[operatorId] }) ||
      Db.state.guides.some(function (g) { return g.operatorId === operatorId })
    if (!used) {
      Db.state.operators = Db.state.operators.filter(function (o) { return o.id !== operatorId })
      Db.state.patients.forEach(function (p) { if (p.insuranceOperatorId === operatorId) p.insuranceOperatorId = null })
    }
  },
  // Dados que saem na guia: o profissional + o contratado.
  settingsFor: function (contractor, doctor) {
    return Object.assign({}, doctor, { contractorName: contractor.name, cnes: contractor.cnes, contractorCnpj: contractor.cnpj })
  },
  settingsOf: function (guide) {
    return Repo.settingsFor(Repo.contractorOf(guide), Repo.doctorOf(guide))
  },
  // Convênio como ele vale para este contratado: identificação e valores são dele.
  operatorFor: function (operatorId, contractor) {
    const operator = Repo.operator(operatorId)
    if (!operator || !contractor) return operator
    const own = contractor.byOperator[operatorId] || {}
    return Object.assign({}, operator, { contractorIdType: own.idType || '', providerCode: own.code || '', prices: own.prices || [] })
  },
  // O que falta para o contratado usar este convênio ('' = nada).
  identProblem: function (contractor, doctor, operatorId) {
    const operator = Repo.operatorFor(operatorId, contractor)
    if (!operator || !contractor) return ''
    const digits = function (v) { return String(v || '').replace(/\D/g, '') }
    const who = Repo.contractorName(contractor)
    const where = ' no convênio ' + operator.name + '.'
    if (!contractor.byOperator[operatorId]) return who + ' não atende o convênio ' + operator.name + '.'
    if (!operator.contractorIdType) return 'Falta informar como ' + who + ' é identificado' + where
    if (operator.contractorIdType === 'codigo' && !operator.providerCode.trim()) return 'Falta o código de ' + who + where
    if (operator.contractorIdType === 'cnpj' && !digits(contractor.cnpj)) return 'Falta o CNPJ de ' + who + ', usado' + where
    if (operator.contractorIdType === 'cpf' && doctor && !digits(doctor.contractorCpf)) return 'Falta o CPF de ' + doctor.professionalName + ', usado' + where
    return ''
  },
  guideProblem: function (guide) {
    return Repo.identProblem(Repo.contractorOf(guide), Repo.doctorOf(guide), guide.operatorId)
  },
  // Quem recebe do convênio nesta guia. Guias de um lote precisam ter o mesmo contratado.
  contractorKey: function (guide) {
    const settings = Repo.settingsOf(guide)
    const operator = Repo.operatorFor(guide.operatorId, Repo.contractorOf(guide))
    const digits = function (v) { return String(v || '').replace(/\D/g, '') }
    if (operator.contractorIdType === 'cpf') return 'cpf:' + digits(settings.contractorCpf)
    if (operator.contractorIdType === 'cnpj') return 'cnpj:' + digits(settings.contractorCnpj)
    return 'codigo:' + String(operator.providerCode || '').trim()
  },

  // ----- Convênios
  // Convênios que o contratado em uso atende.
  operators: function () {
    const c = Repo.current()
    return Repo.allOperators().filter(function (o) { return !!(c && c.byOperator[o.id]) })
  },
  // Todos os convênios da conta (nome, ANS, versão: iguais para todos os contratados).
  allOperators: function () {
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
      tissVersion: input.tissVersion,
      lastLoteNumber: Math.max(0, Math.floor(Number(input.lastLoteNumber) || 0)),
      allowDuplicateGuideNumbers: !!input.allowDuplicateGuideNumbers,
      sequentialGuideNumbers: !!input.sequentialGuideNumbers,
    }
    let saved
    if (id) {
      saved = Object.assign(Repo.operator(id), data)
    } else {
      // Limite de convênios do plano (só quando o login está ligado; ver js/acesso.js)
      if (window.Assinatura) window.Assinatura.checarNovoConvenio(Db.state.operators.length)
      saved = Object.assign({ id: Db.nextId('operator'), createdAt: Fmt.nowUtc(), providerCode: '', contractorIdType: 'codigo', prices: [] }, data)
      Db.state.operators.push(saved)
    }
    Db.save()
    return saved
  },
  // Liga o convênio ao contratado, com a identificação e os valores dele.
  linkOperator: function (contractorId, operatorId, input) {
    const c = Repo.contractor(contractorId)
    if (!input.idType) throw new Error('Informe como este contratado é identificado no convênio.')
    if (input.idType === 'codigo' && !String(input.code || '').trim()) throw new Error('Informe o código deste contratado no convênio.')
    if (input.idType === 'cnpj' && String(c.cnpj || '').replace(/\D/g, '').length !== 14) throw new Error('Informe o CNPJ do contratado em Prestador.')
    c.byOperator[operatorId] = {
      idType: input.idType,
      code: input.idType === 'codigo' ? input.code.trim() : '',
      prices: Repo.cleanPrices(input.prices || [])
    }
    Db.save()
  },
  // Tira o convênio do contratado. Sem nenhum contratado usando, ele sai da conta.
  unlinkOperator: function (contractorId, operatorId) {
    if (Db.state.guides.some(function (g) { return g.contractorId === contractorId && g.operatorId === operatorId })) {
      throw new Error('Este contratado possui guias neste convênio. Exclua ou troque essas guias antes.')
    }
    delete Repo.contractor(contractorId).byOperator[operatorId]
    Repo.dropOperatorIfUnused(operatorId)
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
    const op = operatorId ? Repo.operatorFor(operatorId, Repo.current()) : null
    if (!op) return null
    return op.prices.find(function (p) { return p.tableCode === tableCode && p.code === String(code).trim() }) || null
  },
  // "Salvar valor no convênio" a partir de uma guia.
  savePrice: function (operatorId, input) {
    const op = operatorId ? Repo.operatorFor(operatorId, Repo.current()) : null
    if (!op) throw new Error('Escolha o convênio para salvar o valor na tabela dele.')
    const link = Repo.current().byOperator[operatorId]
    if (!link) throw new Error('Este contratado não atende este convênio.')
    if (!link.prices) link.prices = []
    op.prices = link.prices
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
        if (f.contractorId && g.contractorId !== f.contractorId) return false
        if (f.doctorId && g.doctorId !== f.doctorId) return false
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
    const items = g.guideType === 'sadt' && g.sadt
      ? g.sadt.procedures.concat(g.sadt.expenses || [])
      : g.guideType === 'honorarios' && g.hon ? g.hon.procedures : null
    const codes = items
      ? items.map(function (x) { return x.code + ' ' + x.description }).join(' ')
      : g.procedure.code + ' ' + g.procedure.description
    const text = Fmt.normalize([g.providerGuideNumber, g.operatorGuideNumber, g.cardNumber, p ? p.name : '', p ? p.cpf : '', codes].join(' '))
    const words = q.split(/\s+/)
    if (words.every(function (w) { return text.includes(w) })) return true
    // CPF ou carteirinha digitados com ou sem pontuação
    return digits.length >= 3 && text.replace(/\D/g, ' ').split(' ').concat([String(p && p.cpf || '').replace(/\D/g, '')]).some(function (t) { return t.includes(digits) })
  },
  // Número automático só para convênio configurado com numeração sequencial: o maior número
  // já usado nas guias desse convênio + 1. Nos demais convênios o campo fica em branco.
  nextProviderGuideNumber: function (operatorId) {
    const op = operatorId ? Repo.operator(operatorId) : null
    if (!op || !op.sequentialGuideNumbers) return ''
    let max = 0
    Db.state.guides.forEach(function (g) {
      if (g.operatorId === op.id && /^\d+$/.test(g.providerGuideNumber)) max = Math.max(max, Number(g.providerGuideNumber))
    })
    return String(max + 1)
  },
  // Para a SP/SADT de materiais gerada pela guia de honorários (precisa sempre de número).
  nextAnyGuideNumber: function () {
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
        return g.operatorId === input.operatorId && g.contractorId === input.contractorId && g.providerGuideNumber === number && g.id !== id
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
    const contractor = Repo.contractor(data.contractorId)
    if (!contractor) throw new Error('Escolha o contratado.')
    if (contractor.doctorIds.indexOf(data.doctorId) < 0) throw new Error('Escolha o médico executante.')
    data.cardNumber = data.cardNumber.trim()
    if (data.guideType === 'sadt') {
      // A SP/SADT pode ter só outras despesas (ex.: materiais do especialista numa internação).
      if (!data.sadt || (data.sadt.procedures.length === 0 && !(data.sadt.expenses || []).length)) {
        throw new Error('Inclua ao menos um procedimento ou uma despesa na guia SP/SADT.')
      }
      data.sadt.procedures = data.sadt.procedures.map(function (p) {
        return Object.assign({}, p, {
          quantity: Math.max(1, Math.round(p.quantity)),
          unitValue: Calc.round2(p.unitValue),
          factor: Calc.round2(p.factor)
        })
      })
      data.hon = null
      data.sadt.expenses = (data.sadt.expenses || []).map(function (e) {
        return Object.assign({}, e, {
          quantity: Math.round(e.quantity * 10000) / 10000,
          unitValue: Calc.round2(e.unitValue),
          factor: Calc.round2(e.factor)
        })
      })
      const first = data.sadt.procedures[0] || data.sadt.expenses[0]
      // Resumo do primeiro item, para listagens (igual à versão desktop).
      data.procedure = {
        tableCode: first.tableCode,
        code: first.code,
        description: first.description,
        value: Calc.sadtGuideTotal(data.sadt)
      }
    } else if (data.guideType === 'honorarios') {
      if (!data.hon || data.hon.procedures.length === 0) {
        throw new Error('Inclua ao menos um procedimento na guia de honorários.')
      }
      data.sadt = null
      data.hon.procedures = data.hon.procedures.map(function (p) {
        return Object.assign({}, p, {
          quantity: Math.max(1, Math.round(p.quantity)),
          unitValue: Calc.round2(p.unitValue),
          factor: Calc.round2(p.factor)
        })
      })
      const first = data.hon.procedures[0]
      data.procedure = {
        tableCode: first.tableCode,
        code: first.code,
        description: first.description,
        value: Calc.honorTotal(data.hon)
      }
    } else {
      data.guideType = 'consulta'
      data.sadt = null
      data.hon = null
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
    // Guia de honorários leva junto a SP/SADT das despesas dela (se ainda não estiver em lote).
    const linked = g && g.hon && g.hon.linkedSadtId ? Repo.guide(g.hon.linkedSadtId) : null
    if (linked && linked.loteId !== null) {
      throw new Error('A SP/SADT das despesas desta guia (nº ' + linked.providerGuideNumber + ') já está em lote. Exclua o lote antes.')
    }
    // SP/SADT de despesas: a guia de honorários deixa de apontar para ela.
    if (g && g.linkedHonorId) {
      const h = Repo.guide(g.linkedHonorId)
      if (h && h.hon) h.hon.linkedSadtId = null
    }
    Db.state.guides = Db.state.guides.filter(function (x) { return x.id !== id && !(linked && x.id === linked.id) })
    Db.save()
  },

  // Despesas (materiais, medicamentos…) lançadas na guia de honorários. O Padrão TISS não aceita
  // outras despesas dentro da guia de honorários; elas vão numa SP/SADT vinculada, com a guia de
  // solicitação de internação como guia principal. Esta função cria, atualiza ou apaga essa SP/SADT.
  checkHonorExpenses: function (guideId) {
    const g = guideId ? Repo.guide(guideId) : null
    const linked = g && g.hon && g.hon.linkedSadtId ? Repo.guide(g.hon.linkedSadtId) : null
    if (linked && linked.loteId !== null) {
      throw new Error('A SP/SADT com as despesas desta guia (nº ' + linked.providerGuideNumber + ') já está no lote ' +
        (Repo.lote(linked.loteId) || {}).number + '. Exclua o lote para alterar a guia de honorários.')
    }
  },
  syncHonorExpenses: function (guide) {
    const hon = guide.hon
    const expenses = hon.expenses || []
    const linked = hon.linkedSadtId ? Repo.guide(hon.linkedSadtId) : null
    if (!expenses.length) {
      if (linked && linked.loteId === null) Db.state.guides = Db.state.guides.filter(function (x) { return x.id !== linked.id })
      hon.linkedSadtId = null
      Db.save()
      return null
    }
    const input = {
      guideType: 'sadt',
      contractorId: guide.contractorId,
      doctorId: guide.doctorId,
      operatorId: guide.operatorId,
      patientId: guide.patientId,
      providerGuideNumber: linked ? linked.providerGuideNumber : (Repo.nextProviderGuideNumber(guide.operatorId) || Repo.nextAnyGuideNumber()),
      operatorGuideNumber: guide.operatorGuideNumber,
      cardNumber: guide.cardNumber,
      newborn: guide.newborn,
      serviceDate: hon.startDate,
      consultationType: '1',
      accidentIndication: '9',
      serviceRegime: '03',
      observation: ('Materiais/medicamentos referentes a guia de honorarios n ' + guide.providerGuideNumber +
        (guide.observation ? '. ' + guide.observation : '')).slice(0, 500),
      linkedHonorId: guide.id,
      sadt: {
        mainGuideNumber: hon.requestGuideNumber,
        authorizationDate: hon.password ? hon.startDate : '',
        password: hon.password,
        passwordValidity: '',
        requester: {
          sameAsExecutor: true, contractorIdType: 'codigo', contractorId: '', contractorName: '',
          professionalName: '', councilCode: '06', councilNumber: '', councilUf: '33', cbos: ''
        },
        requestDate: hon.startDate,
        character: '1',
        clinicalIndication: '',
        specialCoverage: '',
        serviceType: hon.sadtServiceType || '03',
        identifyExecutor: true,
        executorRole: '',
        procedures: [],
        expenses: expenses
      },
      procedure: { tableCode: '', code: '', description: '', value: 0 }
    }
    const saved = Repo.saveGuide(linked ? linked.id : null, input)
    hon.linkedSadtId = saved.id
    Db.save()
    return saved
  },

  // ----- Lotes
  lotes: function () {
    const c = Repo.current()
    return Db.state.lotes.filter(function (l) { return !!c && l.contractorId === c.id }).sort(function (a, b) {
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
    let errors = []
    let semNome = false
    guideIds.forEach(function (id) {
      const g = Repo.guide(id)
      const settings = Repo.settingsOf(g)
      if (!settings.professionalName.trim()) semNome = true
      errors = errors.concat(XmlTiss.validateGuide(g, Repo.operatorFor(g.operatorId, Repo.contractorOf(g)), settings, Repo.patient(g.patientId)))
    })
    if (semNome) errors.unshift('Informe o nome do profissional em Prestador.')
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
      throw new Error('Um lote não pode misturar tipos de guia (consulta, SP/SADT e honorários). Gere um lote para cada tipo.')
    }
    const errors = Repo.checkGuides(guideIds)
    if (errors.length) {
      const err = new Error('Corrija as guias antes de gerar o lote.')
      err.details = errors
      throw err
    }
    if (guides.some(function (g) { return g.contractorId !== guides[0].contractorId || Repo.contractorKey(g) !== Repo.contractorKey(guides[0]) })) {
      throw new Error('As guias selecionadas têm contratados diferentes (quem recebe do convênio). Gere um lote para cada contratado.')
    }
    // Contador por convênio: um número de lote nunca é reutilizado, mesmo após excluir um lote.
    const operator = Repo.operator(operatorId)
    operator.lastLoteNumber = (operator.lastLoteNumber || 0) + 1
    const lote = {
      id: Db.nextId('lote'),
      operatorId: operatorId,
      contractorId: guides[0].contractorId,
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
    const guides = Repo.loteGuides(lote.id)
    // O cabeçalho do lote identifica o contratado, que é o mesmo em todas as guias.
    const contractor = Repo.contractor(lote.contractorId)
    const firstDoctor = guides[0] ? Repo.doctorOf(guides[0]) : Repo.doctorsOf(contractor)[0]
    return XmlTiss.buildLoteXml({
      lote: lote,
      guides: guides,
      operator: Repo.operatorFor(lote.operatorId, contractor),
      settings: Repo.settingsFor(contractor, firstDoctor || {}),
      resolve: function (g) {
        const settings = Repo.settingsOf(g)
        return { operator: Repo.operatorFor(g.operatorId, contractor), settings: settings, doctorName: settings.professionalName }
      }
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
