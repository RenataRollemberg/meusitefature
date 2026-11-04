// Gera a mensagem TISS "ENVIO_LOTE_GUIAS" (Padrão 4.01.00, 4.02.00 ou 4.03.00) com o hash
// MD5 do epílogo. Conversão direta de src/main/tiss/xml.ts da versão desktop: para os mesmos
// dados, o XML e o hash saem idênticos.
'use strict'

const XmlTiss = (function () {
  const NAMESPACE = 'http://www.ans.gov.br/padroes/tiss/schemas'
  // CNES usado quando o prestador não possui cadastro no CNES (convenção do padrão).
  const CNES_NOT_INFORMED = '9999999'

  function leaf(name, value, maxLength) {
    return { name: name, value: sanitize(String(value), maxLength) }
  }

  function optionalLeaf(name, value, maxLength) {
    const clean = sanitize(value || '', maxLength)
    return clean ? [{ name: name, value: clean }] : []
  }

  function group(name, children) {
    return { name: name, children: children }
  }

  // Remove acentos e caracteres fora do ASCII imprimível. Evita divergências de hash entre
  // UTF-8 e ISO-8859-1 nos validadores das operadoras.
  function sanitize(value, maxLength) {
    const ascii = String(value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return maxLength ? ascii.slice(0, maxLength).trim() : ascii
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '')
  }

  function money(value) {
    return (Math.round(value * 100) / 100).toFixed(2)
  }

  function quantity4(value) {
    return (Math.round(value * 10000) / 10000).toFixed(4)
  }

  function escapeXml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  function serialize(node, indent) {
    if ('value' in node) {
      return indent + '<ans:' + node.name + '>' + escapeXml(node.value) + '</ans:' + node.name + '>\n'
    }
    const inner = node.children.map(function (c) { return serialize(c, indent + '  ') }).join('')
    return indent + '<ans:' + node.name + '>\n' + inner + indent + '</ans:' + node.name + '>\n'
  }

  function collectLeafValues(node, out) {
    if ('value' in node) out.push(node.value)
    else node.children.forEach(function (c) { collectLeafValues(c, out) })
  }

  // Hash TISS: MD5 da concatenação do conteúdo de todos os elementos-folha, em ordem de
  // documento, excluindo o próprio <ans:hash>.
  function computeHash(nodes) {
    const values = []
    nodes.forEach(function (n) { collectLeafValues(n, values) })
    return md5(values.join(''))
  }

  // A forma de identificar o prestador (código, CPF ou CNPJ) é definida em cada convênio.
  function contractorIdentification(settings, operator) {
    if (operator.contractorIdType === 'cpf') return leaf('cpfContratado', onlyDigits(settings.contractorCpf))
    if (operator.contractorIdType === 'cnpj') return leaf('cnpjContratado', onlyDigits(settings.contractorCnpj))
    return leaf('codigoPrestadorNaOperadora', operator.providerCode, 14)
  }

  function providerIdentification(settings, operator) {
    if (operator.contractorIdType === 'cpf') return leaf('CPF', onlyDigits(settings.contractorCpf))
    if (operator.contractorIdType === 'cnpj') return leaf('CNPJ', onlyDigits(settings.contractorCnpj))
    return leaf('codigoPrestadorNaOperadora', operator.providerCode, 14)
  }

  function cnes(settings) {
    return onlyDigits(settings.cnes) || CNES_NOT_INFORMED
  }

  function consultaGuide(guide, operator, settings, doctorName) {
    return group('guiaConsulta', [
      group('cabecalhoConsulta', [
        leaf('registroANS', onlyDigits(operator.ansRegistry)),
        leaf('numeroGuiaPrestador', guide.providerGuideNumber, 20)
      ]),
      ...optionalLeaf('numeroGuiaOperadora', guide.operatorGuideNumber, 20),
      group('dadosBeneficiario', [
        leaf('numeroCarteira', guide.cardNumber, 20),
        leaf('atendimentoRN', guide.newborn ? 'S' : 'N')
      ]),
      group('contratadoExecutante', [
        contractorIdentification(settings, operator),
        leaf('CNES', cnes(settings))
      ]),
      group('profissionalExecutante', [
        ...optionalLeaf('nomeProfissional', doctorName, 70),
        leaf('conselhoProfissional', settings.councilCode),
        leaf('numeroConselhoProfissional', settings.councilNumber, 15),
        leaf('UF', settings.councilUf),
        leaf('CBOS', settings.cbos)
      ]),
      leaf('indicacaoAcidente', guide.accidentIndication),
      group('dadosAtendimento', [
        leaf('regimeAtendimento', guide.serviceRegime),
        leaf('dataAtendimento', guide.serviceDate),
        leaf('tipoConsulta', guide.consultationType),
        group('procedimento', [
          leaf('codigoTabela', guide.procedure.tableCode),
          leaf('codigoProcedimento', guide.procedure.code, 10),
          leaf('valorProcedimento', money(guide.procedure.value))
        ])
      ]),
      ...optionalLeaf('observacao', guide.observation, 500)
    ])
  }

  // ---------------------------------------------------------------------------
  // Guia SP/SADT (ctm_sp-sadtGuia)
  // ---------------------------------------------------------------------------

  function requesterContractor(guide, settings, operator) {
    const r = guide.sadt.requester
    if (r.sameAsExecutor) return contractorIdentification(settings, operator)
    if (r.contractorIdType === 'cpf') return leaf('cpfContratado', onlyDigits(r.contractorId))
    if (r.contractorIdType === 'cnpj') return leaf('cnpjContratado', onlyDigits(r.contractorId))
    return leaf('codigoPrestadorNaOperadora', r.contractorId, 14)
  }

  function requesterProfessional(guide, settings, doctorName) {
    const r = guide.sadt.requester
    const own = r.sameAsExecutor
    return group('profissionalSolicitante', [
      ...optionalLeaf('nomeProfissional', own ? doctorName : r.professionalName, 70),
      leaf('conselhoProfissional', own ? settings.councilCode : r.councilCode),
      leaf('numeroConselhoProfissional', own ? settings.councilNumber : r.councilNumber, 15),
      leaf('UF', own ? settings.councilUf : r.councilUf),
      leaf('CBOS', own ? settings.cbos : r.cbos)
    ])
  }

  // Código do médico executante na equipe SADT: código no convênio ou CPF.
  function executorProfessionalCode(settings, operator) {
    if (operator.contractorIdType === 'codigo' && operator.providerCode.trim()) {
      return leaf('codigoPrestadorNaOperadora', operator.providerCode, 14)
    }
    if (onlyDigits(settings.contractorCpf).length === 11) {
      return leaf('cpfContratado', onlyDigits(settings.contractorCpf))
    }
    if (operator.providerCode.trim()) return leaf('codigoPrestadorNaOperadora', operator.providerCode, 14)
    return null
  }

  function time(value) {
    return /^\d{2}:\d{2}$/.test(value) ? value + ':00' : value
  }

  function sadtGuide(guide, operator, settings, doctorName) {
    const sadt = guide.sadt
    const requesterName = sadt.requester.sameAsExecutor
      ? settings.contractorName || doctorName
      : sadt.requester.contractorName
    const executorCode = sadt.identifyExecutor ? executorProfessionalCode(settings, operator) : null

    const items = sadt.procedures.map(function (p, i) {
      return group('procedimentoExecutado', [
        leaf('sequencialItem', i + 1),
        leaf('dataExecucao', p.date || guide.serviceDate),
        ...optionalLeaf('horaInicial', time(p.startTime)),
        ...optionalLeaf('horaFinal', time(p.endTime)),
        group('procedimento', [
          leaf('codigoTabela', p.tableCode),
          leaf('codigoProcedimento', p.code, 10),
          leaf('descricaoProcedimento', p.description, 150)
        ]),
        leaf('quantidadeExecutada', p.quantity),
        ...optionalLeaf('viaAcesso', p.accessRoute),
        ...optionalLeaf('tecnicaUtilizada', p.technique),
        leaf('reducaoAcrescimo', money(p.factor)),
        leaf('valorUnitario', money(p.unitValue)),
        leaf('valorTotal', money(Calc.sadtItemTotal(p))),
        ...(executorCode
          ? [
              group('equipeSadt', [
                ...optionalLeaf('grauPart', sadt.executorRole),
                group('codProfissional', [executorCode]),
                leaf('nomeProf', doctorName, 70),
                leaf('conselho', settings.councilCode),
                leaf('numeroConselhoProfissional', settings.councilNumber, 15),
                leaf('UF', settings.councilUf),
                leaf('CBOS', settings.cbos)
              ])
            ]
          : [])
      ])
    })

    const hasAuthorization = !!sanitize(sadt.authorizationDate || '')
    const total = money(Calc.sadtGuideTotal(sadt))
    const expenses = sadt.expenses || []

    // Outras despesas (materiais, medicamentos, taxas…): ct_outrasDespesas
    const expenseNodes = expenses.map(function (e, i) {
      return group('despesa', [
        leaf('sequencialItem', i + 1),
        leaf('codigoDespesa', e.type),
        group('servicosExecutados', [
          leaf('dataExecucao', e.date || guide.serviceDate),
          ...optionalLeaf('horaInicial', time(e.startTime)),
          ...optionalLeaf('horaFinal', time(e.endTime)),
          leaf('codigoTabela', e.tableCode),
          leaf('codigoProcedimento', e.code, 10),
          leaf('quantidadeExecutada', quantity4(e.quantity)),
          leaf('unidadeMedida', e.unit),
          leaf('reducaoAcrescimo', money(e.factor)),
          leaf('valorUnitario', money(e.unitValue)),
          leaf('valorTotal', money(Calc.expenseTotal(e))),
          leaf('descricaoProcedimento', e.description, 150),
          ...optionalLeaf('registroANVISA', e.anvisa, 15),
          ...optionalLeaf('codigoRefFabricante', e.manufacturerRef, 60),
          ...optionalLeaf('autorizacaoFuncionamento', e.operatingPermit, 30)
        ])
      ])
    })

    // Valor total: sem outras despesas, fica igual à versão desktop (procedimentos + total geral).
    let totalNodes = [leaf('valorProcedimentos', total), leaf('valorTotalGeral', total)]
    if (expenses.length) {
      const byType = Calc.expenseTotalsByType(sadt)
      const part = function (name, code) { return byType[code] ? [leaf(name, money(byType[code]))] : [] }
      totalNodes = [
        leaf('valorProcedimentos', money(Calc.sadtProceduresTotal(sadt))),
        ...part('valorDiarias', '05'),
        ...part('valorTaxasAlugueis', '07'),
        ...part('valorMateriais', '03'),
        ...part('valorMedicamentos', '02'),
        ...part('valorOPME', '08'),
        ...part('valorGasesMedicinais', '01'),
        leaf('valorTotalGeral', total)
      ]
    }

    return group('guiaSP-SADT', [
      group('cabecalhoGuia', [
        leaf('registroANS', onlyDigits(operator.ansRegistry)),
        leaf('numeroGuiaPrestador', guide.providerGuideNumber, 20),
        ...optionalLeaf('guiaPrincipal', sadt.mainGuideNumber, 20)
      ]),
      ...(hasAuthorization
        ? [
            group('dadosAutorizacao', [
              ...optionalLeaf('numeroGuiaOperadora', guide.operatorGuideNumber, 20),
              leaf('dataAutorizacao', sadt.authorizationDate),
              ...optionalLeaf('senha', sadt.password, 20),
              ...optionalLeaf('dataValidadeSenha', sadt.passwordValidity)
            ])
          ]
        : []),
      group('dadosBeneficiario', [
        leaf('numeroCarteira', guide.cardNumber, 20),
        leaf('atendimentoRN', guide.newborn ? 'S' : 'N')
      ]),
      group('dadosSolicitante', [
        group('contratadoSolicitante', [requesterContractor(guide, settings, operator)]),
        leaf('nomeContratadoSolicitante', requesterName, 70),
        requesterProfessional(guide, settings, doctorName)
      ]),
      group('dadosSolicitacao', [
        ...optionalLeaf('dataSolicitacao', sadt.requestDate),
        leaf('caraterAtendimento', sadt.character),
        ...optionalLeaf('indicacaoClinica', sadt.clinicalIndication, 500),
        ...optionalLeaf('indCobEspecial', sadt.specialCoverage)
      ]),
      group('dadosExecutante', [
        group('contratadoExecutante', [contractorIdentification(settings, operator)]),
        leaf('CNES', cnes(settings))
      ]),
      group('dadosAtendimento', [
        leaf('tipoAtendimento', sadt.serviceType),
        leaf('indicacaoAcidente', guide.accidentIndication),
        ...(sadt.serviceType === '04' ? [leaf('tipoConsulta', guide.consultationType)] : []),
        leaf('regimeAtendimento', guide.serviceRegime)
      ]),
      ...(items.length ? [group('procedimentosExecutados', items)] : []),
      ...(expenseNodes.length ? [group('outrasDespesas', expenseNodes)] : []),
      ...optionalLeaf('observacao', guide.observation, 500),
      group('valorTotal', totalNodes)
    ])
  }

  // ---------------------------------------------------------------------------
  // Guia de honorários individuais (ctm_honorarioIndividualGuia)
  // ---------------------------------------------------------------------------

  // Hospital / local onde o atendimento aconteceu: código na operadora ou CNPJ.
  function hospitalIdentification(hon) {
    if (hon.hospitalIdType === 'cnpj') return leaf('cnpjLocalExecutante', onlyDigits(hon.hospitalId))
    return leaf('codigoNaOperadora', hon.hospitalId, 14)
  }

  function honorGuide(guide, operator, settings, doctorName) {
    const hon = guide.hon
    const professionalCode = executorProfessionalCode(settings, operator)
    const items = hon.procedures.map(function (p, i) {
      return group('procedimentoRealizado', [
        leaf('sequencialItem', i + 1),
        leaf('dataExecucao', p.date || hon.startDate),
        ...optionalLeaf('horaInicial', time(p.startTime)),
        ...optionalLeaf('horaFinal', time(p.endTime)),
        group('procedimento', [
          leaf('codigoTabela', p.tableCode),
          leaf('codigoProcedimento', p.code, 10),
          leaf('descricaoProcedimento', p.description, 150)
        ]),
        leaf('quantidadeExecutada', p.quantity),
        ...optionalLeaf('viaAcesso', p.accessRoute),
        ...optionalLeaf('tecnicaUtilizada', p.technique),
        leaf('reducaoAcrescimo', money(p.factor)),
        leaf('valorUnitario', money(p.unitValue)),
        leaf('valorTotal', money(Calc.sadtItemTotal(p))),
        group('profissionais', [
          leaf('grauParticipacao', p.role || hon.role),
          group('codProfissional', [professionalCode]),
          leaf('nomeProfissional', doctorName, 70),
          leaf('conselhoProfissional', settings.councilCode),
          leaf('numeroConselhoProfissional', settings.councilNumber, 15),
          leaf('UF', settings.councilUf),
          leaf('CBO', settings.cbos)
        ]),
        // Demais profissionais da equipe (1º auxiliar, 2º auxiliar, anestesista…)
        ...(hon.team || []).map(function (m) {
          return group('profissionais', [
            leaf('grauParticipacao', m.role),
            group('codProfissional', [
              m.idType === 'cpf' ? leaf('cpfContratado', onlyDigits(m.id)) : leaf('codigoPrestadorNaOperadora', m.id, 14)
            ]),
            leaf('nomeProfissional', m.name, 70),
            leaf('conselhoProfissional', m.councilCode),
            leaf('numeroConselhoProfissional', m.councilNumber, 15),
            leaf('UF', m.councilUf),
            leaf('CBO', m.cbos)
          ])
        })
      ])
    })

    return group('guiaHonorarios', [
      group('cabecalhoGuia', [
        leaf('registroANS', onlyDigits(operator.ansRegistry)),
        leaf('numeroGuiaPrestador', guide.providerGuideNumber, 20)
      ]),
      leaf('guiaSolicInternacao', hon.requestGuideNumber, 20),
      ...optionalLeaf('senha', hon.password, 20),
      ...optionalLeaf('numeroGuiaOperadora', guide.operatorGuideNumber, 20),
      group('beneficiario', [
        leaf('numeroCarteira', guide.cardNumber, 20),
        leaf('atendimentoRN', guide.newborn ? 'S' : 'N')
      ]),
      group('localContratado', [
        group('codigoContratado', [hospitalIdentification(hon)]),
        leaf('nomeContratado', hon.hospitalName, 70),
        leaf('cnes', onlyDigits(hon.hospitalCnes) || CNES_NOT_INFORMED)
      ]),
      group('dadosContratadoExecutante', [
        leaf('codigonaOperadora', hon.executorCode || operator.providerCode, 14),
        leaf('cnesContratadoExecutante', cnes(settings))
      ]),
      group('dadosInternacao', [
        leaf('dataInicioFaturamento', hon.startDate),
        leaf('dataFimFaturamento', hon.endDate || hon.startDate)
      ]),
      group('procedimentosRealizados', items),
      ...optionalLeaf('observacao', guide.observation, 500),
      leaf('valorTotalHonorarios', money(Calc.honorTotal(hon))),
      leaf('dataEmissaoGuia', hon.issueDate || guide.serviceDate)
    ])
  }

  function pad(n) {
    return String(n).padStart(2, '0')
  }

  // createdAt fica em UTC ("AAAA-MM-DD HH:MM:SS"). Usar a data do lote (e não "agora") mantém
  // o XML — e portanto o hash — idêntico a cada download.
  function transactionDateTime(createdAt) {
    const parsed = new Date(String(createdAt).replace(' ', 'T') + 'Z')
    const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    return {
      date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    }
  }

  // input: { lote, guides, operator, settings, resolve } → { xml, hash, fileName }
  // operator e settings identificam o contratado no cabeçalho; resolve(guia) devolve
  // { operator, settings, doctorName } do médico daquela guia.
  function buildLoteXml(input) {
    const lote = input.lote
    const operator = input.operator
    const settings = input.settings
    const version = operator.tissVersion || TISS.DEFAULT_VERSION
    const dt = transactionDateTime(lote.createdAt)

    const header = group('cabecalho', [
      group('identificacaoTransacao', [
        leaf('tipoTransacao', 'ENVIO_LOTE_GUIAS'),
        leaf('sequencialTransacao', lote.id),
        leaf('dataRegistroTransacao', dt.date),
        leaf('horaRegistroTransacao', dt.time)
      ]),
      group('origem', [group('identificacaoPrestador', [providerIdentification(settings, operator)])]),
      group('destino', [leaf('registroANS', onlyDigits(operator.ansRegistry))]),
      leaf('Padrao', version)
    ])

    const guideNodes = input.guides.map(function (g) {
      const r = input.resolve(g)
      if (g.guideType === 'sadt') return sadtGuide(g, r.operator, r.settings, r.doctorName)
      if (g.guideType === 'honorarios') return honorGuide(g, r.operator, r.settings, r.doctorName)
      return consultaGuide(g, r.operator, r.settings, r.doctorName)
    })

    const body = group('prestadorParaOperadora', [
      group('loteGuias', [leaf('numeroLote', lote.number, 12), group('guiasTISS', guideNodes)])
    ])

    const hash = computeHash([header, body])
    const epilogue = group('epilogo', [leaf('hash', hash)])

    const xml =
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n' +
      '<ans:mensagemTISS xmlns:ans="' + NAMESPACE + '" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
      ' xsi:schemaLocation="' + NAMESPACE + ' ' + NAMESPACE + '/tissV' + version.replace(/\./g, '_') + '.xsd">\n' +
      serialize(header, '  ') +
      serialize(body, '  ') +
      serialize(epilogue, '  ') +
      '</ans:mensagemTISS>\n'

    const fileName = onlyDigits(lote.number).padStart(20, '0') + '_' + hash + '.xml'
    return { xml: xml, hash: hash, fileName: fileName }
  }

  // ---------------------------------------------------------------------------
  // Validação prévia (antes de gerar o lote)
  // ---------------------------------------------------------------------------

  function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  }

  function fmt(n) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  }

  function validateGuide(guide, operator, settings, patient) {
    const errors = []
    const label = 'Guia ' + guide.providerGuideNumber + (patient ? ' (' + patient.name + ')' : '')
    const push = function (msg) { errors.push(label + ': ' + msg) }

    if (!/^\d{6}$/.test(onlyDigits(operator.ansRegistry))) {
      push('registro ANS do convênio "' + operator.name + '" deve ter 6 dígitos.')
    }
    const providerCode = onlyDigits(operator.providerCode)
    if (operator.contractorIdType === 'codigo') {
      if (!operator.providerCode.trim()) {
        push('informe o código do prestador no convênio "' + operator.name + '".')
      } else if (
        providerCode === onlyDigits(settings.contractorCpf) ||
        providerCode === onlyDigits(settings.contractorCnpj)
      ) {
        push(
          'o "código do prestador" do convênio "' + operator.name + '" é o seu CPF/CNPJ. Informe o código ' +
            'que o convênio atribuiu a você, ou mude a identificação do convênio para CPF/CNPJ.'
        )
      }
    }
    if (operator.contractorIdType === 'cpf' && onlyDigits(settings.contractorCpf).length !== 11) {
      push('o convênio "' + operator.name + '" identifica por CPF: informe o CPF em Prestador.')
    }
    if (operator.contractorIdType === 'cnpj' && onlyDigits(settings.contractorCnpj).length !== 14) {
      push('o convênio "' + operator.name + '" identifica por CNPJ: informe o CNPJ em Prestador.')
    }
    if (!settings.councilNumber.trim() || !settings.councilUf || !settings.cbos) {
      push('complete conselho, UF e CBO-S do profissional (Prestador).')
    }
    if (!guide.providerGuideNumber.trim()) push('número da guia no prestador é obrigatório.')
    if (!guide.cardNumber.trim()) push('número da carteirinha é obrigatório.')
    if (guide.guideType === 'honorarios') {
      validateHonor(guide, operator, settings, push)
      return errors
    }
    if (!isValidDate(guide.serviceDate)) push('data de atendimento inválida.')
    if (guide.guideType === 'sadt') {
      validateSadt(guide, operator, settings, push)
      return errors
    }
    if (!guide.procedure.code.trim()) push('código do procedimento é obrigatório.')
    if (!(guide.procedure.value >= 0)) push('valor do procedimento inválido.')
    const version = operator.tissVersion || TISS.DEFAULT_VERSION
    const maxValue = TISS.maxProcedureValue(version)
    if (guide.procedure.value > maxValue) {
      push('valor do procedimento acima do máximo permitido na versão ' + version + ' (' + fmt(maxValue) + ').')
    }
    return errors
  }

  function validateSadt(guide, operator, settings, push) {
    const sadt = guide.sadt
    if (!sadt) {
      push('dados da SP/SADT ausentes.')
      return
    }
    const version = operator.tissVersion || TISS.DEFAULT_VERSION
    const maxItem = TISS.maxItemValue(version)

    if ((guide.operatorGuideNumber.trim() || sadt.password.trim()) && !isValidDate(sadt.authorizationDate)) {
      push('informe a data da autorização (obrigatória quando há senha ou número da guia no convênio).')
    }
    if (sadt.passwordValidity && !isValidDate(sadt.passwordValidity)) push('validade da senha inválida.')
    if (sadt.requestDate && !isValidDate(sadt.requestDate)) push('data da solicitação inválida.')

    const r = sadt.requester
    if (!r.sameAsExecutor) {
      if (!r.contractorId.trim()) push('informe o código/CPF/CNPJ do contratado solicitante.')
      if (r.contractorIdType === 'cpf' && onlyDigits(r.contractorId).length !== 11)
        push('CPF do contratado solicitante deve ter 11 dígitos.')
      if (r.contractorIdType === 'cnpj' && onlyDigits(r.contractorId).length !== 14)
        push('CNPJ do contratado solicitante deve ter 14 dígitos.')
      if (!r.contractorName.trim()) push('informe o nome do contratado solicitante.')
      if (!r.councilNumber.trim() || !r.councilUf || !r.cbos)
        push('complete conselho, número, UF e CBO-S do profissional solicitante.')
    }

    if (sadt.procedures.length === 0 && !(sadt.expenses || []).length) push('inclua ao menos um procedimento ou uma despesa.')
    sadt.procedures.forEach(function (p, i) {
      const item = 'item ' + (i + 1)
      if (!p.code.trim()) push(item + ': código do procedimento é obrigatório.')
      if (!sanitize(p.description)) push(item + ': descrição do procedimento é obrigatória.')
      if (p.date && !isValidDate(p.date)) push(item + ': data de execução inválida.')
      if (!(p.quantity >= 1 && p.quantity <= 999)) push(item + ': quantidade deve ser de 1 a 999.')
      if (!(p.factor > 0 && p.factor <= 9.99)) push(item + ': fator de redução/acréscimo deve ser entre 0,01 e 9,99.')
      if (!(p.unitValue >= 0)) push(item + ': valor unitário inválido.')
      if (p.unitValue > maxItem || Calc.sadtItemTotal(p) > maxItem)
        push(item + ': valor acima do máximo permitido na versão ' + version + ' (' + fmt(maxItem) + ').')
    })
    ;(sadt.expenses || []).forEach(function (e, i) {
      const item = 'despesa ' + (i + 1)
      if (!TISS.EXPENSE_TYPES.some(function (t) { return t.value === e.type })) push(item + ': escolha o tipo (material, medicamento…).')
      if (!e.code.trim()) push(item + ': código é obrigatório.')
      if (!sanitize(e.description)) push(item + ': descrição é obrigatória.')
      if (!e.unit) push(item + ': escolha a unidade de medida.')
      if (e.date && !isValidDate(e.date)) push(item + ': data inválida.')
      if (!(e.quantity > 0 && e.quantity < 100000)) push(item + ': quantidade inválida.')
      if (!(e.factor > 0 && e.factor <= 9.99)) push(item + ': fator de redução/acréscimo deve ser entre 0,01 e 9,99.')
      if (!(e.unitValue >= 0)) push(item + ': valor unitário inválido.')
      if (e.unitValue > maxItem || Calc.expenseTotal(e) > maxItem)
        push(item + ': valor acima do máximo permitido na versão ' + version + ' (' + fmt(maxItem) + ').')
    })
    if (Calc.sadtGuideTotal(sadt) > TISS.MAX_GUIDE_TOTAL) push('valor total da guia acima do máximo permitido.')
    if (sadt.identifyExecutor && !executorProfessionalCode(settings, operator)) {
      push(
        'para identificar o médico executante nos itens, informe o CPF em Prestador ou o ' +
          'código do prestador no convênio — ou desmarque "Identificar o médico executante".'
      )
    }
  }

  function validateHonor(guide, operator, settings, push) {
    const hon = guide.hon
    if (!hon) {
      push('dados da guia de honorários ausentes.')
      return
    }
    const version = operator.tissVersion || TISS.DEFAULT_VERSION
    const maxItem = TISS.maxItemValue(version)
    if (!hon.requestGuideNumber.trim()) push('informe o nº da guia de solicitação de internação.')
    if (!hon.hospitalId.trim()) push('informe o código (ou CNPJ) do hospital/local do atendimento.')
    if (hon.hospitalIdType === 'cnpj' && onlyDigits(hon.hospitalId).length !== 14) push('CNPJ do hospital deve ter 14 dígitos.')
    if (!hon.hospitalName.trim()) push('informe o nome do hospital/local do atendimento.')
    if (!(hon.executorCode || operator.providerCode || '').trim())
      push('informe o seu código no convênio (contratado executante) — na guia ou no cadastro do convênio.')
    if (!isValidDate(hon.startDate)) push('data de início do faturamento inválida.')
    if (hon.endDate && !isValidDate(hon.endDate)) push('data de fim do faturamento inválida.')
    if (hon.endDate && hon.startDate && hon.endDate < hon.startDate) push('a data de fim do faturamento é anterior à de início.')
    if (!isValidDate(hon.issueDate || guide.serviceDate)) push('data de emissão inválida.')
    if (!executorProfessionalCode(settings, operator)) {
      push('para identificar o médico, informe o CPF em Prestador ou o código do prestador no convênio.')
    }
    if (hon.procedures.length === 0) push('inclua ao menos um procedimento.')
    hon.procedures.forEach(function (p, i) {
      const item = 'item ' + (i + 1)
      if (!p.code.trim()) push(item + ': código do procedimento é obrigatório.')
      if (!sanitize(p.description)) push(item + ': descrição do procedimento é obrigatória.')
      if (p.date && !isValidDate(p.date)) push(item + ': data de execução inválida.')
      if (!(p.role || hon.role)) push(item + ': informe o grau de participação.')
      if (!(p.quantity >= 1 && p.quantity <= 999)) push(item + ': quantidade deve ser de 1 a 999.')
      if (!(p.factor > 0 && p.factor <= 9.99)) push(item + ': fator de redução/acréscimo deve ser entre 0,01 e 9,99.')
      if (!(p.unitValue >= 0)) push(item + ': valor unitário inválido.')
      if (p.unitValue > maxItem || Calc.sadtItemTotal(p) > maxItem)
        push(item + ': valor acima do máximo permitido na versão ' + version + ' (' + fmt(maxItem) + ').')
    })
    ;(hon.team || []).forEach(function (m, i) {
      const who = 'profissional ' + (i + 2) + (m.name ? ' (' + m.name + ')' : '')
      if (!m.role) push(who + ': informe o grau de participação.')
      if (!sanitize(m.name)) push(who + ': informe o nome.')
      if (m.idType === 'cpf' && onlyDigits(m.id).length !== 11) push(who + ': o CPF deve ter 11 dígitos.')
      if (m.idType !== 'cpf' && !String(m.id || '').trim()) push(who + ': informe o código no convênio.')
      if (!String(m.councilNumber || '').trim() || !m.councilUf || !m.cbos) push(who + ': complete conselho, número, UF e CBO-S.')
    })
    if (Calc.honorTotal(hon) > TISS.MAX_GUIDE_TOTAL) push('valor total da guia acima do máximo permitido.')
  }

  return {
    buildLoteXml: buildLoteXml,
    validateGuide: validateGuide,
    sanitize: sanitize,
    computeHash: computeHash
  }
})()
