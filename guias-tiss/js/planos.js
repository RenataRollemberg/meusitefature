// Planos de assinatura do Guias TISS e o serviço extra Faturista.
// Para mudar preço ou limite, altere só esta lista: o programa, o painel de
// administração e a tela de cadastro leem daqui.
'use strict'

const Planos = (function () {
  // medicosCnpj: quantos médicos o plano aceita quando todos estão no mesmo contratado por CNPJ
  // (sem o campo, vale só "medicos").
  // link: endereço do plano de assinatura criado no Mercado Pago (ex.: https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=...).
  // Vazio = o botão leva para o WhatsApp da Remasol.
  const lista = [
    { id: 'basico', nome: 'Básico', medicos: 1, convenios: 1, mensal: 70, link: 'https://mpago.la/2FKd7JF' },
    { id: 'basico2', nome: 'Básico 2', medicos: 1, medicosCnpj: 4, convenios: 3, mensal: 130, link: 'https://mpago.la/2sxTZ5v' },
    { id: 'clinica', nome: 'Clínica', medicos: 5, convenios: 10, mensal: 280, link: 'https://mpago.la/1s7KjV4' },
    { id: 'premium', nome: 'Clínica Premium', medicos: 10, convenios: 15, mensal: 510, link: 'https://mpago.la/2Vpnysw' }
  ]

  const DIAS_GRATIS = 30

  // Serviço extra: o valor é combinado com cada cliente e informado por você no
  // painel de administração. Ele pode incluir a plataforma ou ser somado ao plano.
  const FATURISTA = {
    nome: 'Faturista',
    descricao: 'Faturamento feito pela Remasol: emissão das guias, conferência e envio dos lotes.'
  }

  // Links prontos do Mercado Pago para valores de Faturista já combinados.
  // Aparecem como sugestão no campo de link do painel (admin.html).
  const LINKS_FATURISTA = [
    { valor: 830, link: 'https://mpago.la/2gkDEd9' },
    { valor: 600, link: 'https://mpago.la/32ro3mj' }
  ]

  const STATUS = [
    { value: 'teste', label: 'Período grátis' },
    { value: 'ativo', label: 'Ativo' },
    { value: 'suspenso', label: 'Suspenso' }
  ]

  function get(id) {
    return lista.find(function (p) { return p.id === id }) || null
  }

  // Plano personalizado: a Remasol define no painel o valor e os limites de um cliente
  // (campos personalizadoValor, personalizadoMedicos, personalizadoConvenios). Vazio = sem limite.
  function personalizado(cliente) {
    if (!cliente || cliente.plano !== 'personalizado' || !(Number(cliente.personalizadoValor) > 0)) return null
    const n = function (v) { return Number(v) > 0 ? Number(v) : null }
    return {
      id: 'personalizado',
      nome: 'Personalizado',
      mensal: Number(cliente.personalizadoValor),
      medicos: n(cliente.personalizadoMedicos),
      convenios: n(cliente.personalizadoConvenios)
    }
  }

  // O plano do cliente: um dos planos da lista ou o personalizado.
  function doCliente(cliente) {
    return personalizado(cliente) || get(cliente && cliente.plano)
  }

  function money(value) {
    return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function plural(n, um, varios) {
    return n + ' ' + (n === 1 ? um : varios)
  }

  // Aceita um plano ou o resultado de limites(). null = sem limite.
  function limitesTexto(l) {
    const cnpj = l.medicosCnpj ? ' (ou até ' + l.medicosCnpj + ' no mesmo CNPJ)' : ''
    return (l.medicos == null ? 'médicos sem limite' : plural(l.medicos, 'médico', 'médicos') + cnpj) + ' · ' +
      (l.convenios == null ? 'convênios sem limite' : plural(l.convenios, 'convênio', 'convênios'))
  }

  function faturistaAtivo(cliente) {
    return !!(cliente && cliente.faturista && cliente.faturista.ativo)
  }

  // Limites que valem para o cliente. No Faturista, a Remasol pode liberar as quantidades no painel;
  // o que ela deixar vazio segue o plano. Sem plano e sem quantidade = sem limite (null).
  function limites(cliente) {
    const plano = doCliente(cliente)
    const fat = faturistaAtivo(cliente) ? cliente.faturista : null
    const medicosFat = fat && Number(fat.medicos) > 0 ? Number(fat.medicos) : null
    const conveniosFat = fat && Number(fat.convenios) > 0 ? Number(fat.convenios) : null
    const medicos = medicosFat !== null ? medicosFat : plano ? plano.medicos : null
    const convenios = conveniosFat !== null ? conveniosFat : plano ? plano.convenios : null
    if (medicos === null && convenios === null) return null
    return {
      medicos: medicos,
      // Médicos a mais quando todos ficam no mesmo CNPJ (só vale o do plano, não a liberação do Faturista).
      medicosCnpj: medicosFat === null && plano && plano.medicosCnpj ? plano.medicosCnpj : null,
      convenios: convenios,
      plano: plano,
      personalizado: medicosFat !== null || conveniosFat !== null || !!(plano && plano.id === 'personalizado')
    }
  }

  // Quanto o cliente paga por mês, com as partes da conta para mostrar na tela.
  function cobranca(cliente) {
    const plano = doCliente(cliente)
    const linhas = []
    let total = 0
    const fat = faturistaAtivo(cliente) ? cliente.faturista : null
    const incluiPlataforma = !!(fat && fat.incluiPlataforma)
    if (plano && !incluiPlataforma) {
      linhas.push({ texto: plano.id === 'personalizado' ? 'Plano personalizado' : 'Plano ' + plano.nome, valor: plano.mensal })
      total += plano.mensal
    }
    if (fat) {
      const valor = Number(fat.valor) || 0
      linhas.push({ texto: FATURISTA.nome + (incluiPlataforma ? ' (plataforma inclusa)' : ''), valor: valor })
      total += valor
    }
    return { plano: plano, linhas: linhas, total: Math.round(total * 100) / 100 }
  }

  // Link de pagamento do cliente: o que a Remasol cadastrou para ele no painel (valor combinado,
  // ex.: Faturista) ou, se não houver, o link do plano dele.
  function linkPagamento(cliente) {
    if (cliente && cliente.linkPagamento) return cliente.linkPagamento
    const plano = get(cliente && cliente.plano)
    return plano && plano.link ? plano.link : ''
  }

  return {
    lista: lista,
    linkPagamento: linkPagamento,
    DIAS_GRATIS: DIAS_GRATIS,
    FATURISTA: FATURISTA,
    STATUS: STATUS,
    LINKS_FATURISTA: LINKS_FATURISTA,
    get: get,
    personalizado: personalizado,
    doCliente: doCliente,
    money: money,
    limitesTexto: limitesTexto,
    limites: limites,
    faturistaAtivo: faturistaAtivo,
    cobranca: cobranca
  }
})()
