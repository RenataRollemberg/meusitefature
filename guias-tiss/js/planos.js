// Planos de assinatura do Guias TISS e o serviço extra Faturista.
// Para mudar preço ou limite, altere só esta lista: o programa, o painel de
// administração e a tela de cadastro leem daqui.
'use strict'

const Planos = (function () {
  const lista = [
    { id: 'basico', nome: 'Básico', medicos: 1, convenios: 1, mensal: 70 },
    { id: 'basico2', nome: 'Básico 2', medicos: 1, convenios: 3, mensal: 130 },
    { id: 'clinica', nome: 'Clínica', medicos: 5, convenios: 10, mensal: 280 },
    { id: 'premium', nome: 'Clínica Premium', medicos: 10, convenios: 15, mensal: 510 }
  ]

  const DIAS_GRATIS = 7

  // Serviço extra: o valor é combinado com cada cliente e informado por você no
  // painel de administração. Ele pode incluir a plataforma ou ser somado ao plano.
  const FATURISTA = {
    nome: 'Faturista',
    descricao: 'Faturamento feito pela Remasol: emissão das guias, conferência e envio dos lotes.'
  }

  const STATUS = [
    { value: 'teste', label: 'Período grátis' },
    { value: 'ativo', label: 'Ativo' },
    { value: 'suspenso', label: 'Suspenso' }
  ]

  function get(id) {
    return lista.find(function (p) { return p.id === id }) || null
  }

  function money(value) {
    return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function plural(n, um, varios) {
    return n + ' ' + (n === 1 ? um : varios)
  }

  function limitesTexto(plano) {
    return plural(plano.medicos, 'médico', 'médicos') + ' · ' + plural(plano.convenios, 'convênio', 'convênios')
  }

  function faturistaAtivo(cliente) {
    return !!(cliente && cliente.faturista && cliente.faturista.ativo)
  }

  // Quanto o cliente paga por mês, com as partes da conta para mostrar na tela.
  function cobranca(cliente) {
    const plano = get(cliente && cliente.plano)
    const linhas = []
    let total = 0
    const fat = faturistaAtivo(cliente) ? cliente.faturista : null
    const incluiPlataforma = !!(fat && fat.incluiPlataforma)
    if (plano && !incluiPlataforma) {
      linhas.push({ texto: 'Plano ' + plano.nome, valor: plano.mensal })
      total += plano.mensal
    }
    if (fat) {
      const valor = Number(fat.valor) || 0
      linhas.push({ texto: FATURISTA.nome + (incluiPlataforma ? ' (plataforma inclusa)' : ''), valor: valor })
      total += valor
    }
    return { plano: plano, linhas: linhas, total: Math.round(total * 100) / 100 }
  }

  return {
    lista: lista,
    DIAS_GRATIS: DIAS_GRATIS,
    FATURISTA: FATURISTA,
    STATUS: STATUS,
    get: get,
    money: money,
    limitesTexto: limitesTexto,
    faturistaAtivo: faturistaAtivo,
    cobranca: cobranca
  }
})()
