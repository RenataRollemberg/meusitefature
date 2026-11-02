// Versão para impressão das guias de consulta e SP/SADT, com os campos numerados como no
// modelo da ANS, para coleta de assinatura. Conversão de src/main/tiss/guidePrint.ts.
'use strict'

const Impressao = (function () {
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function field(num, label, value, flex) {
    return (
      '<div class="f" style="flex:' + (flex || 1) + '"><span class="l">' + num + ' - ' + esc(label) +
      '</span><span class="v">' + (esc(value) || '&nbsp;') + '</span></div>'
    )
  }

  function row() {
    return '<div class="row">' + Array.prototype.join.call(arguments, '') + '</div>'
  }

  function section(title) {
    return '<div class="section">' + esc(title) + '</div>'
  }

  function contractorCode(settings, operator) {
    if (operator.contractorIdType === 'cpf') return settings.contractorCpf
    if (operator.contractorIdType === 'cnpj') return settings.contractorCnpj
    return operator.providerCode
  }

  const council = function (code) { return TISS.label(TISS.COUNCILS, code) }
  const uf = function (code) { return TISS.label(TISS.UFS, code) }
  const money = Fmt.number2

  const STYLES =
    '<style>' +
    '@page { size: A4 landscape; margin: 8mm; }' +
    '* { box-sizing: border-box; }' +
    'body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #000; margin: 0; background: #fff; }' +
    '.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; gap: 12px; }' +
    '.top h1 { font-size: 15px; margin: 0; text-transform: uppercase; text-align: center; }' +
    '.top .num { font-size: 12px; white-space: nowrap; }' +
    '.section { background: #d9d9d9; font-weight: 700; padding: 2px 6px; margin-top: 5px; font-size: 10px; }' +
    '.row { display: flex; gap: 3px; margin-top: 3px; }' +
    '.f { border: 1px solid #555; padding: 2px 4px; min-height: 30px; display: flex; flex-direction: column; min-width: 0; }' +
    '.f .l { font-size: 7.5px; color: #333; }' +
    '.f .v { font-size: 11px; font-weight: 600; margin-top: 2px; word-break: break-word; }' +
    '.sign { display: flex; gap: 20px; margin-top: 26px; }' +
    '.sign div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 3px; font-size: 9px; }' +
    'table.items { width: 100%; border-collapse: collapse; margin-top: 3px; }' +
    'table.items th { font-size: 7.5px; font-weight: 400; color: #333; text-align: left; border: 1px solid #555; padding: 2px 3px; }' +
    'table.items td { font-size: 10px; font-weight: 600; border: 1px solid #555; padding: 3px; }' +
    'table.items td.n { text-align: right; white-space: nowrap; }' +
    '.page-break { break-before: page; page-break-before: always; }' +
    '</style>'

  function contractorName(settings) {
    return settings.contractorName || settings.professionalName
  }

  function consultaBody(guide, operator, settings, patient) {
    const proc = guide.procedure
    return (
      row(
        field(1, 'Registro ANS', operator.ansRegistry),
        field(2, 'Nº Guia no Prestador', guide.providerGuideNumber),
        field(3, 'Número da Guia Atribuído pela Operadora', guide.operatorGuideNumber, 2)
      ) +
      section('Dados do Beneficiário') +
      row(
        field(4, 'Número da Carteira', guide.cardNumber, 2),
        field(6, 'Atendimento a RN', guide.newborn ? 'S' : 'N'),
        field(7, 'Nome', patient.name, 4)
      ) +
      section('Dados do Contratado') +
      row(
        field(9, 'Código na Operadora', contractorCode(settings, operator), 2),
        field(10, 'Nome do Contratado', contractorName(settings), 4),
        field(11, 'Código CNES', settings.cnes || '9999999')
      ) +
      row(
        field(12, 'Nome do Profissional Executante', settings.professionalName, 4),
        field(13, 'Conselho Profissional', council(settings.councilCode)),
        field(14, 'Número no Conselho', settings.councilNumber),
        field(15, 'UF', uf(settings.councilUf)),
        field(16, 'Código CBO', settings.cbos)
      ) +
      section('Dados do Atendimento / Procedimento Realizado') +
      row(
        field(17, 'Indicação de Acidente', TISS.label(TISS.ACCIDENT_INDICATIONS, guide.accidentIndication), 2),
        field(18, 'Data do Atendimento', Fmt.date(guide.serviceDate)),
        field(19, 'Tipo de Consulta', TISS.label(TISS.CONSULTATION_TYPES, guide.consultationType), 2),
        field(20, 'Tabela', proc.tableCode),
        field(21, 'Código do Procedimento', proc.code, 2),
        field(22, 'Valor do Procedimento', money(proc.value))
      ) +
      row(field(23, 'Observação / Justificativa', guide.observation)) +
      '<div class="sign"><div>24 - Assinatura do Profissional Executante</div>' +
      '<div>25 - Assinatura do Beneficiário ou Responsável</div></div>'
    )
  }

  function sadtBody(guide, operator, settings, patient) {
    const sadt = guide.sadt
    const r = sadt.requester
    const reqCode = r.sameAsExecutor ? contractorCode(settings, operator) : r.contractorId
    const reqName = r.sameAsExecutor ? contractorName(settings) : r.contractorName
    const prof = r.sameAsExecutor
      ? { name: settings.professionalName, council: settings.councilCode, number: settings.councilNumber, uf: settings.councilUf, cbos: settings.cbos }
      : { name: r.professionalName, council: r.councilCode, number: r.councilNumber, uf: r.councilUf, cbos: r.cbos }
    const total = Calc.sadtGuideTotal(sadt)
    const byType = Calc.expenseTotalsByType(sadt)
    const part = function (code) { return byType[code] ? money(byType[code]) : '' }
    const rows = sadt.procedures
      .map(function (p, i) {
        return (
          '<tr><td>' + (i + 1) + '</td>' +
          '<td>' + esc(Fmt.date(p.date || guide.serviceDate)) + '</td>' +
          '<td>' + esc(p.startTime) + '</td><td>' + esc(p.endTime) + '</td>' +
          '<td>' + esc(p.tableCode) + '</td><td>' + esc(p.code) + '</td><td>' + esc(p.description) + '</td>' +
          '<td class="n">' + p.quantity + '</td><td>' + esc(p.accessRoute) + '</td><td>' + esc(p.technique) + '</td>' +
          '<td class="n">' + p.factor.toFixed(2).replace('.', ',') + '</td>' +
          '<td class="n">' + money(p.unitValue) + '</td><td class="n">' + money(Calc.sadtItemTotal(p)) + '</td></tr>'
        )
      })
      .join('')
    return (
      row(
        field(1, 'Registro ANS', operator.ansRegistry),
        field(3, 'Nº Guia Principal', sadt.mainGuideNumber, 2),
        field(4, 'Data da Autorização', Fmt.date(sadt.authorizationDate)),
        field(5, 'Senha', sadt.password),
        field(6, 'Data de Validade da Senha', Fmt.date(sadt.passwordValidity)),
        field(7, 'Número da Guia Atribuído pela Operadora', guide.operatorGuideNumber, 2)
      ) +
      section('Dados do Beneficiário') +
      row(
        field(8, 'Número da Carteira', guide.cardNumber, 2),
        field(12, 'Atendimento a RN', guide.newborn ? 'S' : 'N'),
        field(10, 'Nome', patient.name, 5)
      ) +
      section('Dados do Solicitante') +
      row(field(13, 'Código na Operadora', reqCode, 2), field(14, 'Nome do Contratado', reqName, 5)) +
      row(
        field(15, 'Nome do Profissional Solicitante', prof.name, 4),
        field(16, 'Conselho Profissional', council(prof.council)),
        field(17, 'Número no Conselho', prof.number),
        field(18, 'UF', uf(prof.uf)),
        field(19, 'Código CBO', prof.cbos)
      ) +
      section('Dados da Solicitação / Procedimentos e Exames Solicitados') +
      row(
        field(21, 'Caráter do Atendimento', TISS.label(TISS.SADT_CHARACTERS, sadt.character), 2),
        field(22, 'Data da Solicitação', Fmt.date(sadt.requestDate)),
        field(23, 'Indicação Clínica', sadt.clinicalIndication, 6)
      ) +
      section('Dados do Contratado Executante') +
      row(
        field(29, 'Código na Operadora', contractorCode(settings, operator), 2),
        field(30, 'Nome do Contratado', contractorName(settings), 5),
        field(31, 'Código CNES', settings.cnes || '9999999')
      ) +
      section('Dados do Atendimento') +
      row(
        field(32, 'Tipo de Atendimento', TISS.label(TISS.SADT_SERVICE_TYPES, sadt.serviceType), 2),
        field(33, 'Indicação de Acidente', TISS.label(TISS.ACCIDENT_INDICATIONS, guide.accidentIndication), 2),
        field(34, 'Tipo de Consulta', sadt.serviceType === '04' ? TISS.label(TISS.CONSULTATION_TYPES, guide.consultationType) : ''),
        field(91, 'Regime de Atendimento', TISS.label(TISS.SERVICE_REGIMES, guide.serviceRegime), 2)
      ) +
      section('Dados da Execução / Procedimentos e Exames Realizados') +
      '<table class="items"><thead><tr>' +
      '<th>Seq</th><th>36 - Data</th><th>37 - Hora Inicial</th><th>38 - Hora Final</th>' +
      '<th>39 - Tabela</th><th>40 - Código do Procedimento</th><th>41 - Descrição</th>' +
      '<th>42 - Qtde</th><th>43 - Via</th><th>44 - Téc.</th><th>45 - Fator Red./Acresc.</th>' +
      '<th>46 - Valor Unitário (R$)</th><th>47 - Valor Total (R$)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      (sadt.identifyExecutor
        ? section('Identificação do(s) Profissional(is) Executante(s)') +
          row(
            field(51, 'Nome do Profissional', settings.professionalName, 4),
            field(52, 'Conselho Profissional', council(settings.councilCode)),
            field(53, 'Número no Conselho', settings.councilNumber),
            field(54, 'UF', uf(settings.councilUf)),
            field(55, 'Código CBO', settings.cbos)
          )
        : '') +
      row(field(58, 'Observação / Justificativa', guide.observation)) +
      row(
        field(59, 'Total de Procedimentos (R$)', money(Calc.sadtProceduresTotal(sadt))),
        field(60, 'Total de Taxas e Aluguéis (R$)', part('07')),
        field(61, 'Total de Materiais (R$)', part('03')),
        field(62, 'Total de OPME (R$)', part('08')),
        field(63, 'Total de Medicamentos (R$)', part('02')),
        field(64, 'Total de Gases Medicinais (R$)', part('01')),
        field(65, 'Total Geral (R$)', money(total))
      ) +
      '<div class="sign"><div>20 - Assinatura do Profissional Solicitante</div>' +
      '<div>66 - Assinatura do Responsável pela Autorização</div>' +
      '<div>67 - Assinatura do Beneficiário ou Responsável</div>' +
      '<div>68 - Assinatura do Contratado</div></div>'
    )
  }

  // Anexo de Outras Despesas (materiais, medicamentos, taxas…) da SP/SADT.
  function expensesAnnex(guide, operator, settings) {
    const sadt = guide.sadt
    const list = sadt.expenses || []
    if (!list.length) return ''
    const unit = function (code) {
      const u = TISS.EXPENSE_UNITS.find(function (x) { return x.value === code })
      return u ? u.label.replace(/^\d+ — /, '') : code
    }
    const rows = list.map(function (e, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(e.type) + '</td>' +
        '<td>' + esc(Fmt.date(e.date || guide.serviceDate)) + '</td>' +
        '<td>' + esc(e.tableCode) + '</td><td>' + esc(e.code) + '</td>' +
        '<td class="n">' + String(e.quantity).replace('.', ',') + '</td><td>' + esc(unit(e.unit)) + '</td>' +
        '<td class="n">' + e.factor.toFixed(2).replace('.', ',') + '</td>' +
        '<td class="n">' + money(e.unitValue) + '</td><td class="n">' + money(Calc.expenseTotal(e)) + '</td>' +
        '<td>' + esc(e.anvisa) + '</td><td>' + esc(e.manufacturerRef) + '</td><td>' + esc(e.operatingPermit) + '</td></tr>' +
        '<tr><td></td><td colspan="12">Descrição: ' + esc(e.description) + '</td></tr>'
    }).join('')
    const byType = Calc.expenseTotalsByType(sadt)
    const part = function (code) { return byType[code] ? money(byType[code]) : '' }
    return '<div class="page-break"></div>' +
      '<div class="top"><div><strong>' + esc(operator.name) + '</strong></div>' +
      '<h1>Anexo de Outras Despesas (para Guia SP/SADT)</h1>' +
      '<div class="num">Guia referenciada: ' + esc(guide.providerGuideNumber) + '</div></div>' +
      row(field(1, 'Registro ANS', operator.ansRegistry), field(2, 'Número da Guia Referenciada', guide.providerGuideNumber, 2)) +
      section('Dados do Contratado Executante') +
      row(
        field(3, 'Código na Operadora', contractorCode(settings, operator), 2),
        field(4, 'Nome do Contratado', contractorName(settings), 5),
        field(5, 'Código CNES', settings.cnes || '9999999')
      ) +
      section('Despesas Realizadas') +
      '<table class="items"><thead><tr>' +
      '<th>6 - Seq</th><th>7 - CD</th><th>8 - Data</th><th>11 - Tabela</th><th>12 - Código do Item</th>' +
      '<th>13 - Qtde</th><th>14 - Unidade de Medida</th><th>15 - Fator Red./Acresc.</th>' +
      '<th>16 - Valor Unitário (R$)</th><th>17 - Valor Total (R$)</th>' +
      '<th>18 - Registro ANVISA</th><th>19 - Ref. do Fabricante</th><th>20 - Nº Autorização de Funcionamento</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p style="font-size:8px;margin:3px 0">CD: 01 Gases medicinais · 02 Medicamentos · 03 Materiais · 05 Diárias · 07 Taxas e aluguéis · 08 OPME</p>' +
      row(
        field(22, 'Total de Gases Medicinais (R$)', part('01')),
        field(23, 'Total de Medicamentos (R$)', part('02')),
        field(24, 'Total de Materiais (R$)', part('03')),
        field(25, 'Total de OPME (R$)', part('08')),
        field(26, 'Total de Taxas e Aluguéis (R$)', part('07')),
        field(27, 'Total de Diárias (R$)', part('05')),
        field(28, 'Total Geral (R$)', money(Calc.expensesTotal(sadt)))
      )
  }

  // Guia de Honorários (honorário individual numa internação).
  function honorBody(guide, operator, settings, patient) {
    const hon = guide.hon
    const roleLabel = function (code) { return TISS.label(TISS.HONOR_PARTICIPATION, code) }
    const rows = hon.procedures.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td>' + esc(Fmt.date(p.date || hon.startDate)) + '</td>' +
        '<td>' + esc(p.startTime) + '</td><td>' + esc(p.endTime) + '</td>' +
        '<td>' + esc(p.tableCode) + '</td><td>' + esc(p.code) + '</td><td>' + esc(p.description) + '</td>' +
        '<td class="n">' + p.quantity + '</td><td>' + esc(p.accessRoute) + '</td><td>' + esc(p.technique) + '</td>' +
        '<td class="n">' + p.factor.toFixed(2).replace('.', ',') + '</td>' +
        '<td class="n">' + money(p.unitValue) + '</td><td class="n">' + money(Calc.sadtItemTotal(p)) + '</td>' +
        '<td>' + esc(roleLabel(p.role || hon.role)) + '</td></tr>'
    }).join('')
    const profCode = operator.contractorIdType === 'codigo' && operator.providerCode ? operator.providerCode : settings.contractorCpf
    return (
      row(
        field(1, 'Registro ANS', operator.ansRegistry),
        field(3, 'Nº da Guia de Solicitação de Internação', hon.requestGuideNumber, 2),
        field(4, 'Senha', hon.password),
        field(5, 'Número da Guia Atribuído pela Operadora', guide.operatorGuideNumber, 2)
      ) +
      section('Dados do Beneficiário') +
      row(
        field(6, 'Número da Carteira', guide.cardNumber, 2),
        field(7, 'Nome', patient.name, 5),
        field(8, 'Atendimento a RN', guide.newborn ? 'S' : 'N')
      ) +
      section('Dados do Contratado (onde foi executado o procedimento)') +
      row(
        field(9, 'Código na Operadora / CNPJ', hon.hospitalId, 2),
        field(10, 'Nome do Hospital / Local', hon.hospitalName, 5),
        field(11, 'Código CNES', hon.hospitalCnes || '9999999')
      ) +
      section('Dados do Contratado Executante') +
      row(
        field(12, 'Código na Operadora', hon.executorCode || operator.providerCode, 2),
        field(13, 'Nome do Contratado', contractorName(settings), 5),
        field(14, 'Código CNES', settings.cnes || '9999999')
      ) +
      section('Dados da Internação') +
      row(
        field(15, 'Data do Início do Faturamento', Fmt.date(hon.startDate)),
        field(16, 'Data do Fim do Faturamento', Fmt.date(hon.endDate || hon.startDate))
      ) +
      section('Procedimentos Realizados') +
      '<table class="items"><thead><tr>' +
      '<th>Seq</th><th>17 - Data</th><th>18 - Hora Inicial</th><th>19 - Hora Final</th>' +
      '<th>20 - Tabela</th><th>21 - Código do Procedimento</th><th>22 - Descrição</th>' +
      '<th>23 - Qtde</th><th>24 - Via</th><th>25 - Téc.</th><th>26 - Fator Red./Acresc.</th>' +
      '<th>27 - Valor Unitário (R$)</th><th>28 - Valor Total (R$)</th><th>30 - Grau de Participação</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      section('Identificação do(s) Profissional(is)') +
      row(
        field(31, 'Código na Operadora / CPF', profCode, 2),
        field(32, 'Nome do Profissional', settings.professionalName, 4),
        field(33, 'Conselho Profissional', council(settings.councilCode)),
        field(34, 'Número no Conselho', settings.councilNumber),
        field(35, 'UF', uf(settings.councilUf)),
        field(36, 'Código CBO', settings.cbos)
      ) +
      row(field(37, 'Observação / Justificativa', guide.observation)) +
      row(
        field(38, 'Valor Total dos Honorários (R$)', money(Calc.honorTotal(hon))),
        field(39, 'Data de Emissão', Fmt.date(hon.issueDate || guide.serviceDate))
      ) +
      '<div class="sign"><div>40 - Assinatura do Profissional Executante</div></div>'
    )
  }

  function guideHtml(guide) {
    const operator = Repo.operator(guide.operatorId)
    const patient = Repo.patient(guide.patientId) || { name: '' }
    const settings = Db.state.settings
    const isSadt = guide.guideType === 'sadt' && guide.sadt
    const isHon = guide.guideType === 'honorarios' && guide.hon
    return (
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia ' +
      esc(guide.providerGuideNumber) + '</title>' + STYLES + '</head><body>' +
      '<div class="top"><div><strong>' + esc(operator.name) + '</strong></div>' +
      '<h1>' + (isSadt
        ? 'Guia de Serviço Profissional / Serviço Auxiliar de Diagnóstico e Terapia - SP/SADT'
        : isHon ? 'Guia de Honorários' : 'Guia de Consulta') + '</h1>' +
      '<div class="num">2 - Nº ' + esc(guide.providerGuideNumber) + '</div></div>' +
      (isSadt
        ? sadtBody(guide, operator, settings, patient) + expensesAnnex(guide, operator, settings)
        : isHon ? honorBody(guide, operator, settings, patient) : consultaBody(guide, operator, settings, patient)) +
      '</body></html>'
    )
  }

  // Abre a guia numa janela própria e chama a impressão do navegador.
  function print(guide) {
    const win = window.open('', '_blank')
    if (!win) throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups para esta página.')
    win.document.open()
    win.document.write(guideHtml(guide))
    win.document.close()
    win.focus()
    setTimeout(function () { win.print() }, 250)
  }

  return { guideHtml: guideHtml, print: print }
})()
